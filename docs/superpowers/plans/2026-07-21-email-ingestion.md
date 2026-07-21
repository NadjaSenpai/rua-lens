# Email Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept DMARC aggregate reports via Cloudflare Email Routing, parse MIME attachments, and feed them into the existing `ingestBatch` pipeline for D1 storage.

**Architecture:** Add an `email` handler to the existing Worker export. The handler uses `postal-mime` to parse incoming MIME messages, filters for DMARC-shaped attachments (XML/gzip/ZIP), converts them to `File` objects, and calls `ingestBatch` directly. All errors are caught silently to prevent bounce storms.

**Tech Stack:** postal-mime, Cloudflare Email Workers (`email()` handler on `ExportedHandler`), existing ingestBatch pipeline

## Global Constraints

- Node.js >=22.13 <23
- Tests run via `vitest` with `@cloudflare/vitest-pool-workers`
- Worker tests use `cloudflare:test` bindings and D1 migrations
- Existing code style: no comments unless non-obvious, match current patterns
- Conventional commits: `feat(scope):`, `test(scope):`, `docs:`

---

### Task 1: Add postal-mime dependency and email handler

**Files:**
- Modify: `package.json` (add `postal-mime` to dependencies)
- Create: `src/server/email/handle-email.ts`
- Modify: `src/server/index.ts`

**Interfaces:**
- Consumes: `ingestBatch` from `src/server/ingest/ingest-batch.ts` — `ingestBatch({ files: ReadonlyArray<File>, principal: Principal, db: D1Database, storageMode: "d1" }): Promise<UploadBatchResult>`
- Consumes: `createPrincipal` from `src/server/auth/principal.ts` — `createPrincipal(email: string, adminEmails: readonly string[]): Principal`
- Consumes: `parseStorageMode` from `src/server/env.ts` — `parseStorageMode(env: RuntimeEnv): StorageMode`
- Produces: `handleEmail(message: ForwardableEmailMessage, env: RuntimeEnv, ctx: ExecutionContext): Promise<void>` — used by `src/server/index.ts`

- [ ] **Step 1: Install postal-mime**

```bash
npm install postal-mime
```

- [ ] **Step 2: Create `src/server/email/handle-email.ts`**

```typescript
import PostalMime from "postal-mime";
import type { RuntimeEnv } from "../env";
import { parseStorageMode } from "../env";
import { createPrincipal } from "../auth/principal";
import { ingestBatch } from "../ingest/ingest-batch";

const DMARC_CONTENT_TYPES = new Set([
  "application/xml",
  "text/xml",
  "application/gzip",
  "application/zip",
  "application/x-zip-compressed",
]);

const DMARC_EXTENSIONS = [".xml", ".xml.gz", ".gz", ".zip"];

function isDmarcAttachment(attachment: { mimeType: string; filename?: string }): boolean {
  if (DMARC_CONTENT_TYPES.has(attachment.mimeType)) {
    return true;
  }
  const name = attachment.filename?.toLowerCase() ?? "";
  return DMARC_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export async function handleEmail(
  message: ForwardableEmailMessage,
  env: RuntimeEnv,
  ctx: ExecutionContext,
): Promise<void> {
  try {
    const storageMode = parseStorageMode(env);
    if (storageMode === "stateless") {
      return;
    }

    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(raw);

    const qualifying = (parsed.attachments ?? []).filter(isDmarcAttachment);
    if (qualifying.length === 0) {
      return;
    }

    const files = qualifying.map((attachment) => {
      const content = new Uint8Array(attachment.content);
      return new File([content], attachment.filename ?? "attachment", {
        type: attachment.mimeType,
      });
    });

    const principal = createPrincipal("email-ingest@rua-lens", []);

    const result = await ingestBatch({
      files,
      principal,
      db: env.DB,
      storageMode: "d1",
    });

    console.log(
      `Email ingest from=${message.from}: inserted=${result.summary.inserted} duplicate=${result.summary.duplicate} rejected=${result.summary.rejected}`,
    );
  } catch (error) {
    console.error("Email ingest failed:", error);
  }
}
```

- [ ] **Step 3: Update `src/server/index.ts` to export email handler**

Replace the entire file content with:

```typescript
import { createApp } from "./app";
import type { RuntimeEnv } from "./env";
import { handleEmail } from "./email/handle-email";

const app = createApp();

export default {
  fetch: app.fetch,
  email: handleEmail,
} satisfies ExportedHandler<RuntimeEnv>;
```

- [ ] **Step 4: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Verify lint passes**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Verify existing tests still pass**

```bash
npm run test:worker
```

Expected: all 113 tests pass (or current count). Adding the email export does not affect existing fetch-based tests.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/server/email/handle-email.ts src/server/index.ts
git commit -m "feat(email): add DMARC report ingestion via Email Workers"
```

---

### Task 2: Add tests for email handler

**Files:**
- Create: `test/fixtures/dmarc-report.eml`
- Create: `test/worker/handle-email.test.ts`

**Interfaces:**
- Consumes: `handleEmail` from `src/server/email/handle-email.ts`
- Consumes: fixture helpers from `test/support/archive-fixtures.ts` — `xmlBytes`, `gzipSync`, `zipSync`
- Consumes: D1 test helpers from `test/support/d1.ts`

- [ ] **Step 1: Create MIME fixture helper in `test/support/email-fixtures.ts`**

This helper builds raw MIME byte arrays programmatically so tests don't depend on a static `.eml` file (which is brittle to maintain). Each test constructs the exact MIME structure it needs.

```typescript
import { gzipSync, zipSync } from "fflate";

const encoder = new TextEncoder();
const BOUNDARY = "----=_Part_test_boundary";

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export type MimeAttachment = {
  filename: string;
  contentType: string;
  content: Uint8Array;
};

export function buildRawEmail(options: {
  from?: string;
  to?: string;
  subject?: string;
  textBody?: string;
  attachments: MimeAttachment[];
}): Uint8Array {
  const from = options.from ?? "noreply@google.com";
  const to = options.to ?? "dmarc@example.com";
  const subject = options.subject ?? "Report Domain: example.com";

  const parts: string[] = [];

  if (options.textBody) {
    parts.push(
      `--${BOUNDARY}\r\n` +
      `Content-Type: text/plain; charset="utf-8"\r\n\r\n` +
      `${options.textBody}\r\n`,
    );
  }

  for (const attachment of options.attachments) {
    const base64 = encodeBase64(attachment.content);
    parts.push(
      `--${BOUNDARY}\r\n` +
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"\r\n` +
      `Content-Disposition: attachment; filename="${attachment.filename}"\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      `${base64}\r\n`,
    );
  }

  const mime =
    `From: ${from}\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${subject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: multipart/mixed; boundary="${BOUNDARY}"\r\n\r\n` +
    parts.join("") +
    `--${BOUNDARY}--\r\n`;

  return encoder.encode(mime);
}

export function xmlAttachment(filename: string, xml: string): MimeAttachment {
  return { filename, contentType: "application/xml", content: encoder.encode(xml) };
}

export function gzipAttachment(filename: string, xml: string): MimeAttachment {
  return { filename, contentType: "application/gzip", content: gzipSync(encoder.encode(xml)) };
}

export function zipAttachment(filename: string, entries: Record<string, string>): MimeAttachment {
  const encoded: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(entries)) {
    encoded[name] = encoder.encode(content);
  }
  return { filename, contentType: "application/zip", content: new Uint8Array(zipSync(encoded)) };
}
```

- [ ] **Step 2: Create `test/worker/handle-email.test.ts`**

```typescript
import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { handleEmail } from "../../src/server/email/handle-email";
import type { RuntimeEnv } from "../../src/server/env";
import reportSingle from "../fixtures/report-single.xml?raw";
import {
  buildRawEmail,
  gzipAttachment,
  xmlAttachment,
  zipAttachment,
} from "../support/email-fixtures";

function createMessage(raw: Uint8Array): ForwardableEmailMessage {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(raw);
      controller.close();
    },
  });
  return {
    from: "noreply@google.com",
    to: "dmarc@example.com",
    headers: new Headers({ subject: "DMARC Report" }),
    raw: stream,
    rawSize: raw.byteLength,
    setReject: vi.fn(),
    forward: vi.fn(),
    reply: vi.fn(),
  } as unknown as ForwardableEmailMessage;
}

function testEnv(overrides: Partial<RuntimeEnv> = {}): RuntimeEnv {
  return { ...env, ...overrides } as unknown as RuntimeEnv;
}

function testCtx(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

describe("handleEmail", () => {
  it("ingests a single XML attachment", async () => {
    const raw = buildRawEmail({
      attachments: [xmlAttachment("example.com!1700000000!1700086400.xml", reportSingle)],
    });

    await handleEmail(createMessage(raw), testEnv(), testCtx());

    const row = await env.DB.prepare("SELECT COUNT(*) as count FROM reports").first<{ count: number }>();
    expect(row!.count).toBe(1);
  });

  it("ingests a gzip attachment", async () => {
    const raw = buildRawEmail({
      attachments: [gzipAttachment("example.com!1700000000!1700086400.xml.gz", reportSingle)],
    });

    await handleEmail(createMessage(raw), testEnv(), testCtx());

    const row = await env.DB.prepare("SELECT COUNT(*) as count FROM reports").first<{ count: number }>();
    expect(row!.count).toBe(1);
  });

  it("ingests a ZIP attachment", async () => {
    const raw = buildRawEmail({
      attachments: [zipAttachment("reports.zip", { "report.xml": reportSingle })],
    });

    await handleEmail(createMessage(raw), testEnv(), testCtx());

    const row = await env.DB.prepare("SELECT COUNT(*) as count FROM reports").first<{ count: number }>();
    expect(row!.count).toBe(1);
  });

  it("ingests multiple attachments", async () => {
    const report2 = reportSingle.replace("example-report-1", "example-report-2");
    const raw = buildRawEmail({
      attachments: [
        xmlAttachment("report1.xml", reportSingle),
        xmlAttachment("report2.xml", report2),
      ],
    });

    await handleEmail(createMessage(raw), testEnv(), testCtx());

    const row = await env.DB.prepare("SELECT COUNT(*) as count FROM reports").first<{ count: number }>();
    expect(row!.count).toBe(2);
  });

  it("silently ignores email with no attachments", async () => {
    const raw = buildRawEmail({ attachments: [], textBody: "Hello" });

    await handleEmail(createMessage(raw), testEnv(), testCtx());

    const row = await env.DB.prepare("SELECT COUNT(*) as count FROM reports").first<{ count: number }>();
    expect(row!.count).toBe(0);
  });

  it("filters out non-DMARC attachments", async () => {
    const raw = buildRawEmail({
      attachments: [{
        filename: "photo.jpg",
        contentType: "image/jpeg",
        content: new Uint8Array([0xff, 0xd8, 0xff]),
      }],
    });

    await handleEmail(createMessage(raw), testEnv(), testCtx());

    const row = await env.DB.prepare("SELECT COUNT(*) as count FROM reports").first<{ count: number }>();
    expect(row!.count).toBe(0);
  });

  it("skips processing in stateless mode", async () => {
    const raw = buildRawEmail({
      attachments: [xmlAttachment("report.xml", reportSingle)],
    });

    await handleEmail(createMessage(raw), testEnv({ STORAGE_MODE: "stateless" }), testCtx());

    const row = await env.DB.prepare("SELECT COUNT(*) as count FROM reports").first<{ count: number }>();
    expect(row!.count).toBe(0);
  });

  it("does not throw on MIME parse error", async () => {
    const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const message = createMessage(garbage);

    await expect(handleEmail(message, testEnv(), testCtx())).resolves.toBeUndefined();
  });

  it("deduplicates reports from email just like upload", async () => {
    const raw = buildRawEmail({
      attachments: [xmlAttachment("report.xml", reportSingle)],
    });

    await handleEmail(createMessage(raw), testEnv(), testCtx());
    await handleEmail(createMessage(raw), testEnv(), testCtx());

    const row = await env.DB.prepare("SELECT COUNT(*) as count FROM reports").first<{ count: number }>();
    expect(row!.count).toBe(1);
  });

  it("uses email-ingest@rua-lens as the importing identity", async () => {
    const raw = buildRawEmail({
      attachments: [xmlAttachment("report.xml", reportSingle)],
    });

    await handleEmail(createMessage(raw), testEnv(), testCtx());

    const row = await env.DB.prepare("SELECT imported_by FROM reports").first<{ imported_by: string }>();
    expect(row!.imported_by).toBe("email-ingest@rua-lens");
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
npm run test:worker
```

Expected: all tests pass including the new `handle-email.test.ts` suite (10 new tests).

- [ ] **Step 4: Commit**

```bash
git add test/support/email-fixtures.ts test/worker/handle-email.test.ts
git commit -m "test(email): add email ingestion handler tests"
```

---

### Task 3: Update documentation

**Files:**
- Modify: `docs/operations/self-hosting.md`
- Modify: `README.md`

**Interfaces:**
- None (documentation only)

- [ ] **Step 1: Add email ingestion section to `docs/operations/self-hosting.md`**

Insert before the "Data retention and deletion" section:

```markdown
## Email ingestion (optional)

RUA Lens can receive DMARC aggregate reports directly via email using Cloudflare Email Routing. This eliminates manual file downloads from Gmail or other mailboxes.

### Setup

1. Enable Email Routing on your domain in the Cloudflare dashboard (Compute & AI > Email Service > Email Routing).
2. Create a routing rule that sends `dmarc@your-domain.com` (or any address you choose) to the `rua-lens` Worker.
3. Update your DMARC DNS record to point RUA at the receiving address:

```
_dmarc.example.com TXT "v=DMARC1; p=none; rua=mailto:dmarc@example.com"
```

No `wrangler.jsonc` changes are needed. The email handler is always present in the Worker but only processes mail when Email Routing sends messages to it.

### How it works

The Worker parses the incoming email with `postal-mime`, extracts XML, gzip, and ZIP attachments, and feeds them through the same ingestion pipeline used by manual uploads. Reports are deduplicated and stored in D1.

Email-ingested reports appear on the dashboard with the importing identity `email-ingest@rua-lens`.

### Limitations

- Email ingestion requires D1 mode (`STORAGE_MODE=d1`). In stateless mode the handler returns without processing.
- The handler does not bounce mail. Parse errors and unsupported attachments are logged and silently discarded.
- There is no sender verification. Rely on Email Routing rules to control which addresses reach the Worker.
```

- [ ] **Step 2: Update `README.md` feature list**

Add `- accepts DMARC reports via email (Cloudflare Email Routing);` after the first bullet in "What it does".

- [ ] **Step 3: Update `README.md` deliberate exclusions**

Remove `- automatic mail ingestion;` from the "Deliberate exclusions in v0.1.0" list.

- [ ] **Step 4: Verify the docs build and links are correct**

```bash
grep -n "automatic mail ingestion" README.md
```

Expected: no matches (the line was removed).

```bash
grep -n "Email ingestion" docs/operations/self-hosting.md
```

Expected: matches in the new section.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/operations/self-hosting.md
git commit -m "docs: add email ingestion setup guide"
```
