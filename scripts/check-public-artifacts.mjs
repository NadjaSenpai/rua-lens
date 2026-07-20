import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/client/", import.meta.url));
const checkedExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".svg"]);
const secretRules = [
  { label: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "JWT-like value", pattern: /eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/ },
  { label: "Cloudflare API token-like value", pattern: /(?:CF_API_TOKEN|CLOUDFLARE_API_TOKEN)\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i },
];
const externalResourceRules = [
  {
    label: "external HTML resource",
    extensions: new Set([".html", ".svg"]),
    pattern: /<(?:script|img|link|iframe|source|video|audio|form)\b[^>]*(?:src|href|action)\s*=\s*["']https?:\/\//i,
  },
  {
    label: "external CSS resource",
    extensions: new Set([".css"]),
    pattern: /(?:@import\s+(?:url\()?|url\()\s*["']?https?:\/\//i,
  },
  {
    label: "external JavaScript request",
    extensions: new Set([".js"]),
    pattern: /(?:fetch|sendBeacon|importScripts)\s*\(\s*["'`]https?:\/\/|new\s+(?:WebSocket|EventSource|Worker)\s*\(\s*["'`]https?:\/\/|\.open\s*\(\s*["'`](?:GET|POST|PUT|PATCH|DELETE)["'`]\s*,\s*["'`]https?:\/\//i,
  },
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

const failures = [];
for (const file of await walk(root)) {
  const extension = extname(file);
  if (!checkedExtensions.has(extension)) continue;
  const text = await readFile(file, "utf8");
  for (const rule of secretRules) {
    if (rule.pattern.test(text)) failures.push(`${file}: ${rule.label}`);
  }
  for (const rule of externalResourceRules) {
    if (rule.extensions.has(extension) && rule.pattern.test(text)) {
      failures.push(`${file}: ${rule.label}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Public artifacts contain no external resource requests or secret-like values.");
