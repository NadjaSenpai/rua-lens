import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const lockPath = fileURLToPath(new URL("../package-lock.json", import.meta.url));
const lock = JSON.parse(await readFile(lockPath, "utf8"));
const reviewedLicenseExpressions = new Set([
  "0BSD",
  "Apache-2.0",
  "Apache-2.0 AND LGPL-3.0-or-later",
  "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "LGPL-3.0-or-later",
  "MIT",
  "MIT AND ISC",
  "MIT OR Apache-2.0",
  "MIT-0",
  "MPL-2.0",
]);

const failures = [];
const packages = Object.entries(lock.packages ?? {}).filter(([path]) => path !== "");
for (const [path, metadata] of packages) {
  const license = metadata.license;
  if (typeof license !== "string" || license.trim() === "") {
    failures.push(`${path}: missing license metadata`);
    continue;
  }
  if (!reviewedLicenseExpressions.has(license)) {
    failures.push(`${path}: unreviewed license expression ${license}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Dependency license metadata passed for ${packages.length} locked packages.`);
