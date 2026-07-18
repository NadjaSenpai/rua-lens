import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const ignoredDirectories = new Set([
  ".git",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
  "worktrees",
]);
const textExtensions = new Set([
  ".css", ".html", ".js", ".json", ".jsonc", ".md", ".mjs", ".sql", ".svg", ".ts", ".tsx", ".txt", ".xml", ".yml", ".yaml",
]);
const genericForbidden = [
  { label: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "JWT-like value", pattern: /eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/ },
  { label: "Cloudflare API token-like value", pattern: /(?:CF_API_TOKEN|CLOUDFLARE_API_TOKEN)\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i },
];
const allowedUrlHosts = new Set([
  "127.0.0.1",
  "developer.mozilla.org",
  "developers.cloudflare.com",
  "example.cloudflareaccess.com",
  "github.com",
  "hono.dev",
  "localhost",
]);
const reservedIpv4 = /^(?:192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/;
const zeroD1Id = "00000000-0000-0000-0000-000000000000";
const failures = new Set();

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

function addFailure(display, message) {
  failures.add(`${display}: ${message}`);
}

function isAllowedHost(host) {
  const normalized = host.toLowerCase();
  return allowedUrlHosts.has(normalized)
    || normalized === "example.com"
    || normalized.endsWith(".example.com")
    || normalized.endsWith(".example")
    || normalized.endsWith(".invalid")
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".test");
}

function scanCommonContent(display, text, { checkUrls = true } = {}) {
  for (const rule of genericForbidden) {
    if (rule.pattern.test(text)) addFailure(display, rule.label);
  }

  for (const email of text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) {
    if (!email.toLowerCase().endsWith("@example.com")) {
      addFailure(display, `non-example email ${email}`);
    }
  }

  if (checkUrls) {
    for (const match of text.matchAll(/https?:\/\/([A-Z0-9.-]+)/gi)) {
      if (!isAllowedHost(match[1])) addFailure(display, `unallowlisted URL host ${match[1]}`);
    }
  }

  for (const match of text.matchAll(/"(?:database_id|preview_database_id)"\s*:\s*"([^"]+)"/g)) {
    if (match[1] !== zeroD1Id && !match[1].startsWith("<")) {
      addFailure(display, "non-placeholder D1 database ID");
    }
  }

  for (const match of text.matchAll(/(?:ACCESS_AUD|CLOUDFLARE_ACCOUNT_ID|RUA_LENS_REMOTE_EXPECTED_DATABASE_ID)\s*[:=]\s*["']?([0-9a-f-]{32,36})/gi)) {
    if (!/^0+$/.test(match[1].replaceAll("-", ""))) {
      addFailure(display, `non-placeholder ${match[0].split(/\s*[:=]/)[0]}`);
    }
  }
}

function scanXmlContent(display, text) {
  for (const domain of text.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi) ?? []) {
    const normalized = domain.toLowerCase();
    if (normalized !== "example.com" && !normalized.endsWith(".example.com")) {
      addFailure(display, `non-example XML domain ${domain}`);
    }
  }
  for (const ip of text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? []) {
    if (!reservedIpv4.test(ip)) addFailure(display, `non-reserved XML IP ${ip}`);
  }
}

for (const file of await walk(root)) {
  const name = basename(file);
  if (!textExtensions.has(extname(file)) && !name.startsWith(".dev.vars")) continue;
  const display = relative(root, file);
  if (spawnSync("git", ["check-ignore", "-q", display], { cwd: root, stdio: "ignore" }).status === 0) {
    continue;
  }
  const text = await readFile(file, "utf8");
  scanCommonContent(display, text, {
    checkUrls: name !== "package-lock.json" && name !== "worker-configuration.d.ts",
  });

  if (extname(file) === ".xml" && (display.startsWith("test/") || display.startsWith("public/"))) {
    scanXmlContent(display, text);
  }
}

const history = spawnSync("git", ["log", "--all", "-p", "--format="], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 100 * 1024 * 1024,
});
if (history.status === 0) {
  scanCommonContent("Git history", history.stdout, { checkUrls: false });
  for (const match of history.stdout.matchAll(/https?:\/\/([A-Z0-9.-]+\.(?:cloudflareaccess\.com|pages\.dev|workers\.dev))/gi)) {
    if (!isAllowedHost(match[1])) addFailure("Git history", `operational URL host ${match[1]}`);
  }
  for (const match of history.stdout.matchAll(/<(?:domain|header_from|envelope_from|envelope_to)>\s*([^<\s]+)\s*</gi)) {
    const rawValue = match[1].toLowerCase();
    const value = rawValue.includes("@") ? rawValue.split("@").at(-1) : rawValue;
    if (value !== "example.com" && !value.endsWith(".example.com")) {
      addFailure("Git history", `non-example XML domain ${match[1]}`);
    }
  }
} else {
  addFailure("Git history", "could not inspect committed patches");
}

if (failures.size) {
  console.error([...failures].sort().join("\n"));
  process.exit(1);
}

console.log("Repository content and Git history passed privacy and secret checks.");
