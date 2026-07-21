# Email Ingestion for DMARC Reports

## Problem

DMARC aggregate reports arrive as email attachments (XML, gzip, ZIP). Manually downloading each attachment from Gmail and uploading to RUA Lens is impractical at scale. RUA Lens needs to accept reports directly from DMARC reporters via email.

## Solution

Add a Cloudflare Email Worker handler to the existing rua-lens Worker. The handler parses incoming MIME messages, extracts attachments, converts them to `File` objects, and passes them to the existing `ingestBatch` pipeline for D1 storage.

## Architecture

```
DMARC reporter (Google, Yahoo, etc.)
        |
        v  SMTP
  dmarc@your-domain.com
        |
        v  Cloudflare Email Routing
  +-----------------------------+
  |  rua-lens Worker            |
  |                             |
  |  fetch handler (existing)   |  <-- Web UI / API
  |  email handler (new)        |  <-- Email receive
  |         |                   |
  |         v                   |
  |  MIME parse (postal-mime)   |
  |         |                   |
  |         v                   |
  |  ingestBatch (existing)     |  <-- File[] input
  |         |                   |
  |         v                   |
  |       D1                    |
  +-----------------------------+
```

## Email handler flow

1. Check `STORAGE_MODE` -- if `"stateless"`, return immediately (no D1 to store to).
2. Buffer the raw email: `await new Response(message.raw).arrayBuffer()` (`message.raw` is a single-use `ReadableStream`).
3. Parse with `postal-mime` to extract attachments.
4. Filter attachments: keep files with Content-Type matching `application/xml`, `text/xml`, `application/gzip`, `application/zip`, `application/x-zip-compressed`, or filenames ending in `.xml`, `.xml.gz`, `.gz`, `.zip`.
5. If no qualifying attachments, return silently (do not reject).
6. Convert each attachment to a `File` object (filename from MIME, content from `Uint8Array`).
7. Call `ingestBatch({ files, principal, db, storageMode: "d1" })`.
8. Log the result summary (`console.log` with inserted/duplicate/rejected counts).
9. Never throw or reject -- all errors are caught and logged silently to avoid bounce storms.

## Principal identity

Email-ingested reports use a fixed principal: `"email-ingest@rua-lens"` with no admin privileges. This distinguishes email-sourced imports from manual uploads on the dashboard.

## Bounce policy

The handler never bounces mail. DMARC reporters (Google, Yahoo, Microsoft) send from automated systems; bouncing triggers retries and is pointless for parse errors. All errors are caught, logged, and swallowed.

## Configuration

### Worker configuration

The email handler is always exported from the Worker. It only processes mail when Cloudflare Email Routing directs messages to the Worker. No `wrangler.jsonc` changes are required to keep email disabled.

To enable email receiving, the self-hoster adds Email Routing rules in the Cloudflare dashboard:

1. Enable Email Routing on the domain.
2. Create a routing rule: `dmarc@your-domain.com` -> Worker `rua-lens`.

### DNS configuration

The self-hoster configures their DMARC DNS record to point RUA at the receiving address:

```
_dmarc.example.com TXT "v=DMARC1; p=none; rua=mailto:dmarc@example.com"
```

### Stateless mode

Email ingestion is incompatible with stateless mode (no D1). The handler detects `STORAGE_MODE=stateless` and returns immediately without processing.

## Changes

### New files

| File | Purpose |
|------|---------|
| `src/server/email/handle-email.ts` | MIME parse, File conversion, ingestBatch call |
| `test/worker/handle-email.test.ts` | Unit tests for email handler |
| `test/fixtures/dmarc-report.eml` | Test fixture: real-shaped DMARC email with XML attachment |

### Modified files

| File | Change |
|------|--------|
| `src/server/index.ts` | Add `email` handler to `ExportedHandler` export |
| `docs/operations/self-hosting.md` | Add email ingestion section |
| `README.md` | Remove "automatic mail ingestion" from exclusions, add to feature list |
| `package.json` | Add `postal-mime` dependency |

### Unchanged

- `src/server/ingest/ingest-batch.ts` -- reused as-is
- `src/server/ingest/extract-report-candidates.ts` -- reused as-is
- All existing routes and middleware

## Test plan

| Test case | Expectation |
|-----------|-------------|
| Email with single XML attachment | ingestBatch called with 1 File, report inserted |
| Email with gzip attachment | ingestBatch called, decompression works |
| Email with ZIP attachment | ingestBatch called, ZIP extracted |
| Email with multiple attachments | All qualifying files passed to ingestBatch |
| Email with no attachments | Handler returns silently, ingestBatch not called |
| Email with non-DMARC attachment (PDF, image) | Filtered out, ingestBatch not called |
| Stateless mode | Handler returns immediately |
| MIME parse error | Error caught and logged, no bounce |
| ingestBatch error | Error caught and logged, no bounce |

## Dependencies

- `postal-mime` -- lightweight MIME parser recommended by Cloudflare for Email Workers. No external network calls, runs entirely in-Worker.

## Out of scope

- Notification on ingest success/failure
- Sender verification or allowlisting in Worker code
- Gmail/IMAP pull-based ingestion
- Stateless mode support for email
