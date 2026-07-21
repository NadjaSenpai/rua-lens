# RUA Lens

RUA Lens is a self-hosted web application for turning DMARC aggregate reports into searchable, human-readable analysis. It runs as one Cloudflare Worker containing a React SPA and Hono API.

Two storage modes are available:

- **D1 mode** (default) — normalized data is stored in Cloudflare D1 with server-side deduplication and shared dashboards.
- **Stateless mode** — the Worker parses uploads and returns results directly; the browser stores them in IndexedDB. No database setup required.

## What it does

- accepts DMARC XML, gzip, and ZIP uploads;
- accepts DMARC reports via email (Cloudflare Email Routing);
- detects formats from content rather than filenames alone;
- rejects unsafe XML and archive paths;
- preserves multiple DKIM, SPF, and policy-override results;
- deduplicates reports by provider, report ID, domain, and reporting period;
- presents a dashboard, report list, and report detail view;
- restricts report deletion to configured administrators.

## Privacy model

Original XML and compressed files exist only during Worker processing and are not stored. RUA Lens stores normalized report metadata, source IP addresses, sender domains, authentication results, policy information, and the importing user's email address in D1.

There is no telemetry, analytics, external font, external CDN, or IP-enrichment API. Data is retained until an administrator deletes it. Deletion is irreversible; recovery requires uploading the report again.

## Ingestion limits

- up to 20 files per request;
- up to 10 MiB compressed or raw input per file;
- up to 25 MiB total file input per request;
- up to 20 MiB per expanded XML report;
- up to 30 MiB expanded from one archive;
- up to 50 MiB expanded across one batch;
- up to 100 ZIP entries.

The local workerd suite verifies these production values. A separate authenticated remote gate checks the Worker memory boundary against a disposable scratch D1 before release.

## Local development

Requirements:

- Node.js 22.13 or later in the 22 LTS line
- npm

```bash
npm ci
cp wrangler.jsonc.example wrangler.jsonc
cp .dev.vars.example .dev.vars
npm run cf-typegen
npm exec -- wrangler d1 migrations apply DB --local
npm run dev
```

The local configuration uses an explicit development identity from `.dev.vars`. Production D1 deployments must use Cloudflare Access and fail closed when Access settings are missing. Stateless deployments can run with `AUTH_MODE=none` for public access.

To reproduce the upload flow, open `http://127.0.0.1:5173`, choose **レポートをアップロード**, and select `test/fixtures/report-single.xml`. The dashboard should show four messages and a 100% DMARC success rate. Uploading the same fixture again should return **登録済み** without creating a second report.

Only use synthetic fixtures for development. The repository fixtures use `example.com`, reserved IP addresses, and fictional reporting organizations.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test:worker
npm run test:ui
npm run test:limits
npm run test:e2e
npm run build
npm exec -- wrangler deploy --dry-run
npm run check:public-artifacts
npm run check:repository-content
npm run check:dependency-licenses
```

`npm run test:limits:remote` is a separate release gate. It requires Cloudflare authentication and a temporary D1 database, and is intentionally excluded from credentials-free CI.

## Self-hosting

See [docs/operations/self-hosting.md](docs/operations/self-hosting.md) for D1, stateless, Cloudflare Access, configuration, deployment, backup, and release validation instructions.

## Deliberate exclusions in v0.1.0

- Gmail, IMAP, or Email Routing integration;
- original report storage or download;
- ASN or provider enrichment;
- alerts and automated policy recommendations;
- multi-tenant SaaS operation;
- deployment outside Cloudflare;
- cross-device sync in stateless mode;
- deleted-data restoration.

## Acknowledgements

RUA Lens was informed by the DMARC analysis problem space and tools such as DMARCy. No code was copied from DMARCy.

## License

MIT License. See [LICENSE](LICENSE).
