import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { handleEmail } from "../../src/server/email/handle-email";
import { INGEST_LIMITS } from "../../src/server/ingest/limits";
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

  it("does not throw when ingestBatch fails", async () => {
    const raw = buildRawEmail({
      attachments: [xmlAttachment("report.xml", "<not-valid-xml/>")],
    });

    await expect(handleEmail(createMessage(raw), testEnv(), testCtx())).resolves.toBeUndefined();
  });

  it("rejects email exceeding size limit", async () => {
    const raw = buildRawEmail({
      attachments: [xmlAttachment("report.xml", reportSingle)],
    });
    const message = createMessage(raw);
    (message as { rawSize: number }).rawSize = INGEST_LIMITS.maxRequestBytes + 1;

    await handleEmail(message, testEnv(), testCtx());

    const row = await env.DB.prepare("SELECT COUNT(*) as count FROM reports").first<{ count: number }>();
    expect(row!.count).toBe(0);
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
