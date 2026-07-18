import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "fflate";

const required = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "RUA_LENS_REMOTE_CONFIG",
  "RUA_LENS_REMOTE_EXPECTED_DATABASE_ID",
];
for (const name of required) {
  if (!process.env[name]) fail(`Set ${name} before running the remote release gate.`);
}
if (process.env.RUA_LENS_REMOTE_CONFIRM_SCRATCH !== "1") {
  fail("Set RUA_LENS_REMOTE_CONFIRM_SCRATCH=1 after confirming the config uses a disposable D1 database.");
}

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const configPath = resolve(process.env.RUA_LENS_REMOTE_CONFIG);
const relativeConfig = relative(repoRoot, configPath);
if (!relativeConfig || relativeConfig.startsWith("..")) {
  fail("The remote scratch config must be an ignored file inside this repository.");
}
const configText = await readFile(configPath, "utf8");
const databaseId = configText.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
const previewDatabaseId = configText.match(/"preview_database_id"\s*:\s*"([^"]+)"/)?.[1];
const databaseName = configText.match(/"database_name"\s*:\s*"([^"]+)"/)?.[1];
const expectedDatabaseId = process.env.RUA_LENS_REMOTE_EXPECTED_DATABASE_ID;
if (
  !databaseId ||
  !previewDatabaseId ||
  databaseId !== expectedDatabaseId ||
  previewDatabaseId !== expectedDatabaseId ||
  !databaseName ||
  !/(?:scratch|remote-limits)/i.test(databaseName)
) {
  fail("The config must bind DB to the explicitly confirmed disposable scratch database for both primary and preview use.");
}
if (spawnSync("git", ["ls-files", "--error-unmatch", relativeConfig], { cwd: repoRoot, stdio: "ignore" }).status === 0) {
  fail("The remote scratch config must not be tracked by Git.");
}
if (spawnSync("git", ["check-ignore", "-q", relativeConfig], { cwd: repoRoot, stdio: "ignore" }).status !== 0) {
  fail("The remote scratch config must be ignored by Git.");
}

const childEnv = { ...process.env, NO_COLOR: "1" };
const versionResult = run("npm", ["exec", "wrangler", "--", "--version"]);
const wranglerVersion = versionResult.match(/\d+\.\d+\.\d+/)?.[0] ?? "unknown";
run("npm", [
  "exec",
  "wrangler",
  "--",
  "d1",
  "migrations",
  "apply",
  "DB",
  "--remote",
  "--config",
  configPath,
]);

const port = 8799;
const baseUrl = `http://127.0.0.1:${port}`;
const remoteOutput = [];
const dev = spawn(
  "npm",
  [
    "exec",
    "wrangler",
    "--",
    "dev",
    "--remote",
    "--config",
    configPath,
    "--port",
    String(port),
    "--var",
    "AUTH_MODE:dev",
    "--var",
    "DEV_USER_EMAIL:remote-probe@example.com",
    "--var",
    "DEV_ADMIN_EMAILS:remote-probe@example.com",
  ],
  { env: childEnv, stdio: ["ignore", "pipe", "pipe"] },
);
dev.stdout.on("data", (chunk) => remoteOutput.push(String(chunk)));
dev.stderr.on("data", (chunk) => remoteOutput.push(String(chunk)));

try {
  await waitForReady(`${baseUrl}/api/session`, dev);
  const runId = crypto.randomUUID();

  await expectUpload(
    `${baseUrl}/api/uploads`,
    [{
      name: "twenty.xml.gz",
      bytes: gzipSync(new TextEncoder().encode(generateDenseReport(20 * 1024 * 1024, `${runId}-twenty-dense`, 10_000))),
    }],
    { inserted: 1, duplicate: 0, rejected: 0 },
  );

  await expectUpload(
    `${baseUrl}/api/uploads`,
    [
      { name: "ten-a.xml", bytes: new TextEncoder().encode(generateReport(10 * 1024 * 1024, `${runId}-ten-a`)) },
      { name: "ten-b.xml", bytes: new TextEncoder().encode(generateReport(10 * 1024 * 1024, `${runId}-ten-b`)) },
      { name: "five.xml", bytes: new TextEncoder().encode(generateReport(5 * 1024 * 1024, `${runId}-five`)) },
    ],
    { inserted: 3, duplicate: 0, rejected: 0 },
  );

  const batch = Array.from({ length: 19 }, (_, index) => ({
    name: `report-${index}.xml`,
    bytes: new TextEncoder().encode(generateReport(2048, `${runId}-batch-${index}`)),
  }));
  batch.push({ name: "invalid.xml", bytes: new TextEncoder().encode("<feedback />") });
  await expectUpload(
    `${baseUrl}/api/uploads`,
    batch,
    { inserted: 19, duplicate: 0, rejected: 1 },
  );

  if (/memory limit|resource limit|exceeded memory|error 1102/i.test(remoteOutput.join("\n"))) {
    fail("Cloudflare reported a Worker resource-limit failure during the probe.");
  }

  console.log(`Remote ingestion limits passed with Wrangler ${wranglerVersion}.`);
} finally {
  dev.kill("SIGTERM");
}

function run(command, args) {
  const result = spawnSync(command, args, {
    env: childEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail("A required Wrangler command failed. Review the local terminal session without sharing credentials or resource IDs.");
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

async function waitForReady(url, processHandle) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      fail("wrangler dev --remote exited before the local proxy became ready.");
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local proxy is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  fail("Timed out waiting for the remote Worker proxy.");
}

async function expectUpload(url, files, expectedSummary) {
  const body = new FormData();
  for (const file of files) {
    body.append("files", new Blob([file.bytes], { type: "application/octet-stream" }), file.name);
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { Origin: new URL(url).origin },
    body,
  });
  if (!response.ok) fail("A remote ingestion boundary request did not return success.");
  const result = await response.json();
  if (JSON.stringify(result.summary) !== JSON.stringify(expectedSummary)) {
    fail("A remote ingestion boundary returned an unexpected summary.");
  }
}

function generateDenseReport(totalBytes, reportId, recordCount) {
  const prefix = `<?xml version="1.0"?><feedback><report_metadata><org_name>Remote Dense Probe</org_name><report_id>${reportId}</report_id><date_range><begin>1700000000</begin><end>1700086400</end></date_range></report_metadata><policy_published><domain>example.com</domain><p>reject</p></policy_published>`;
  let records = "";
  for (let index = 0; index < recordCount; index += 1) {
    records += `<record><row><source_ip>192.0.2.${(index % 254) + 1}</source_ip><count>1</count><policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf><reason><type>local_policy</type><comment>dense-${index}</comment></reason></policy_evaluated></row><identifiers><header_from>example.com</header_from><envelope_to>recipient-${index}@example.com</envelope_to></identifiers><auth_results><dkim><domain>example.com</domain><selector>dense-${index}</selector><result>pass</result></dkim><spf><domain>example.com</domain><scope>mfrom</scope><result>pass</result></spf></auth_results></record>`;
  }
  const suffix = "</feedback>";
  const minimumBytes = Buffer.byteLength(prefix + records + suffix);
  if (totalBytes < minimumBytes) fail("Remote dense probe fixture size is invalid.");
  return `${prefix}${records}${" ".repeat(totalBytes - minimumBytes)}${suffix}`;
}

function generateReport(totalBytes, reportId) {
  const prefix = `<?xml version="1.0"?><feedback><report_metadata><org_name>Remote Probe</org_name><report_id>${reportId}</report_id><date_range><begin>1700000000</begin><end>1700086400</end></date_range></report_metadata><policy_published><domain>example.com</domain><p>reject</p></policy_published><record><row><source_ip>192.0.2.10</source_ip><count>1</count><policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>fail</spf></policy_evaluated></row><identifiers><header_from>example.com</header_from></identifiers></record>`;
  const suffix = "</feedback>";
  const minimumBytes = Buffer.byteLength(prefix + suffix);
  if (totalBytes < minimumBytes) fail("Remote probe fixture size is invalid.");
  return `${prefix}${" ".repeat(totalBytes - minimumBytes)}${suffix}`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
