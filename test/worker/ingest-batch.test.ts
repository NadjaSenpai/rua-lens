import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ingestBatch, IngestInfrastructureError } from "../../src/server/ingest/ingest-batch";
import { INGEST_LIMITS } from "../../src/server/ingest/limits";
import reportSingle from "../fixtures/report-single.xml?raw";
import { xmlFile, zipFile } from "../support/archive-fixtures";

const principal = { email: "developer@example.com", isAdmin: false };

function withReportId(xml: string, reportId: string): string {
  return xml.replace("example-report-1", reportId);
}

async function ingest(files: File[]) {
  return ingestBatch({ files, principal, db: env.DB });
}

describe("ingestBatch", () => {
  it("saves an XML candidate and exposes only the upload DTO", async () => {
    const result = await ingest([xmlFile("report.bin", reportSingle)]);

    expect(result.summary).toEqual({ inserted: 1, duplicate: 0, rejected: 0 });
    expect(result.results).toEqual([
      {
        sourceFileName: "report.bin",
        entryName: null,
        status: "inserted",
        reportId: expect.any(String),
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("192.0.2.10");
    expect(JSON.stringify(result)).not.toContain("mail");
  });

  it("returns duplicate on a repeated report", async () => {
    await ingest([xmlFile("first.xml", reportSingle)]);
    const result = await ingest([xmlFile("second.xml", reportSingle)]);

    expect(result.summary).toEqual({ inserted: 0, duplicate: 1, rejected: 0 });
    expect(result.results[0]).toMatchObject({ sourceFileName: "second.xml", status: "duplicate" });
  });

  it("continues after an invalid standalone XML candidate", async () => {
    const result = await ingest([
      xmlFile("first.xml", withReportId(reportSingle, "first-report")),
      xmlFile("invalid.xml", "<feedback />"),
      xmlFile("third.xml", withReportId(reportSingle, "third-report")),
    ]);

    expect(result.summary).toEqual({ inserted: 2, duplicate: 0, rejected: 1 });
    expect(result.results.map(({ status }) => status)).toEqual(["inserted", "rejected", "inserted"]);
    expect(result.results[1]).toMatchObject({
      sourceFileName: "invalid.xml",
      entryName: null,
      code: "NOT_DMARC_REPORT",
    });
  });

  it("continues through an invalid ZIP entry and preserves entry names", async () => {
    const result = await ingest([
      zipFile("bundle.zip", {
        "reports/invalid.xml": "<feedback />",
        "reports/valid.xml": withReportId(reportSingle, "zip-report"),
      }),
    ]);

    expect(result.summary).toEqual({ inserted: 1, duplicate: 0, rejected: 1 });
    expect(result.results).toEqual([
      expect.objectContaining({
        sourceFileName: "bundle.zip",
        entryName: "reports/invalid.xml",
        status: "rejected",
      }),
      expect.objectContaining({
        sourceFileName: "bundle.zip",
        entryName: "reports/valid.xml",
        status: "inserted",
      }),
    ]);
  });

  it("shares expansion capacity across source files", async () => {
    const tinyXml = "<x/>";
    const result = await ingestBatch({
      files: [xmlFile("one.bin", tinyXml), xmlFile("two.bin", tinyXml)],
      principal,
      db: env.DB,
      limits: { ...INGEST_LIMITS, maxXmlBytes: 4, maxBatchExpansionBytes: 7 },
    });

    expect(result.results).toEqual([
      expect.objectContaining({ sourceFileName: "one.bin", status: "rejected", code: "NOT_DMARC_REPORT" }),
      expect.objectContaining({ sourceFileName: "two.bin", status: "rejected", code: "SIZE_LIMIT_EXCEEDED" }),
    ]);
  });

  it("stops and sanitizes D1 infrastructure failures", async () => {
    const failingDb = {
      prepare: env.DB.prepare.bind(env.DB),
      batch: async () => {
        throw new Error("INSERT INTO reports VALUES ('<sensitive-xml>')");
      },
    } as unknown as D1Database;

    try {
      await ingestBatch({ files: [xmlFile("report.xml", reportSingle)], principal, db: failingDb });
      throw new Error("expected ingestion to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(IngestInfrastructureError);
      expect((error as Error).message).not.toContain("INSERT");
      expect((error as Error).message).not.toContain("sensitive-xml");
    }
  });
});
