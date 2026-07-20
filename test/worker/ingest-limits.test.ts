import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/server/app";
import type { RuntimeEnv } from "../../src/server/env";
import { ingestBatch } from "../../src/server/ingest/ingest-batch";
import { INGEST_LIMITS, MEBIBYTE } from "../../src/server/ingest/limits";
import reportSingle from "../fixtures/report-single.xml?raw";
import { generateDenseReport, generateLargeReport } from "../performance/generate-large-report";
import { gzipFile, xmlFile, zipFile } from "../support/archive-fixtures";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const principal = { email: "developer@example.com", isAdmin: true };

function withReportId(xml: string, reportId: string): string {
  return xml.replace("example-report-1", reportId);
}

describe("production ingestion limits", () => {
  it("processes an exactly 20 MiB expanded gzip report", async () => {
    const result = await ingestBatch({
      files: [gzipFile("twenty.xml.gz", generateLargeReport(20 * MEBIBYTE, "limit-20-mib"))],
      principal,
      db: env.DB,
    });

    expect(result.summary).toEqual({ inserted: 1, duplicate: 0, rejected: 0 });
  });

  it("processes an exactly 20 MiB report with the maximum record count", async () => {
    const result = await ingestBatch({
      files: [
        gzipFile(
          "twenty-dense.xml.gz",
          generateDenseReport(20 * MEBIBYTE, "limit-20-mib-dense", INGEST_LIMITS.maxRecordsPerReport),
        ),
      ],
      principal,
      db: env.DB,
    });

    expect(result.summary).toEqual({ inserted: 1, duplicate: 0, rejected: 0 });
  });

  it("processes an exactly 30 MiB ZIP expansion sequentially", async () => {
    const result = await ingestBatch({
      files: [
        zipFile("thirty.zip", {
          "first.xml": generateLargeReport(15 * MEBIBYTE, "archive-first"),
          "second.xml": generateLargeReport(15 * MEBIBYTE, "archive-second"),
        }),
      ],
      principal,
      db: env.DB,
    });

    expect(result.summary).toEqual({ inserted: 2, duplicate: 0, rejected: 0 });
  });

  it("processes an exactly 50 MiB expanded batch", async () => {
    const result = await ingestBatch({
      files: [
        gzipFile("sixteen.xml.gz", generateLargeReport(16 * MEBIBYTE, "batch-sixteen")),
        gzipFile("seventeen-a.xml.gz", generateLargeReport(17 * MEBIBYTE, "batch-seventeen-a")),
        gzipFile("seventeen-b.xml.gz", generateLargeReport(17 * MEBIBYTE, "batch-seventeen-b")),
      ],
      principal,
      db: env.DB,
    });

    expect(result.summary).toEqual({ inserted: 3, duplicate: 0, rejected: 0 });
  });

  it("keeps a 20-report partial-success HTTP batch within the D1 statement cap", async () => {
    const statementCounts: number[] = [];
    const observedDb = {
      prepare: env.DB.prepare.bind(env.DB),
      batch: async (statements: D1PreparedStatement[]) => {
        statementCounts.push(statements.length);
        return env.DB.batch(statements);
      },
    } as unknown as D1Database;
    const body = new FormData();
    for (let index = 0; index < 19; index += 1) {
      body.append("files", xmlFile(`valid-${index}.xml`, withReportId(reportSingle, `limit-report-${index}`)));
    }
    body.append("files", xmlFile("invalid.xml", "<feedback />"));
    const app = createApp();
    const bindings = {
      ...env,
      DB: observedDb,
      AUTH_MODE: "dev",
      DEV_USER_EMAIL: "developer@example.com",
      DEV_ADMIN_EMAILS: "developer@example.com",
    } as RuntimeEnv;

    const response = await app.request(
      "https://example.com/api/uploads",
      { method: "POST", headers: { Origin: "https://example.com" }, body },
      bindings,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      summary: { inserted: 19, duplicate: 0, rejected: 1 },
    });
    expect(statementCounts).toHaveLength(19);
    expect(statementCounts.every((count) => count <= INGEST_LIMITS.maxD1StatementsPerReport)).toBe(true);
  });
});
