import { spawnSync } from "node:child_process";

const sql = [
  "DELETE FROM policy_overrides",
  "DELETE FROM spf_results",
  "DELETE FROM dkim_results",
  "DELETE FROM report_records",
  "DELETE FROM reports",
].join("; ");

const result = spawnSync(
  "npm",
  ["exec", "wrangler", "--", "d1", "execute", "DB", "--local", "--command", sql],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
