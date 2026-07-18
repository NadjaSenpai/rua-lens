import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { NormalizedReport } from "../../src/server/domain/dmarc";
import { saveReport } from "../../src/server/repositories/reports";
import { parseDmarcXml } from "../../src/server/ingest/parse-dmarc";
import reportSingle from "../fixtures/report-single.xml?raw";

const report = (): NormalizedReport => parseDmarcXml(new TextEncoder().encode(reportSingle));

async function count(table: string): Promise<number> {
  const result = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
  return result?.count ?? 0;
}

describe("saveReport", () => {
  it("writes the normalized report through all five tables", async () => {
    const saved = await saveReport(env.DB, report(), "developer@example.com");
    expect(saved.kind).toBe("inserted");

    await expect(Promise.all(["reports", "report_records", "dkim_results", "spf_results", "policy_overrides"].map(count))).resolves.toEqual([
      1,
      1,
      1,
      1,
      0,
    ]);
    await expect(
      env.DB.prepare("SELECT domain, policy_p, policy_sp FROM reports WHERE id = ?").bind(saved.reportId).first(),
    ).resolves.toMatchObject({ domain: "example.com", policy_p: "reject", policy_sp: "none" });
    await expect(
      env.DB.prepare("SELECT source_ip, message_count, classification, dmarc_pass FROM report_records").first(),
    ).resolves.toMatchObject({ source_ip: "192.0.2.10", message_count: 4, classification: "pass", dmarc_pass: 1 });
    await expect(env.DB.prepare("SELECT domain, selector, result FROM dkim_results").first()).resolves.toMatchObject({
      domain: "example.com",
      selector: "mail",
      result: "pass",
    });
    await expect(env.DB.prepare("SELECT domain, scope, result FROM spf_results").first()).resolves.toMatchObject({
      domain: "mailer.example.com",
      scope: "mfrom",
      result: "pass",
    });
  });

  it("rolls back the parent when a child insert violates a D1 constraint", async () => {
    const invalid = report();
    invalid.records[0].dkimResults[0].result = "invalid" as never;

    await expect(saveReport(env.DB, invalid, "developer@example.com")).rejects.toThrow();
    await expect(count("reports")).resolves.toBe(0);
    await expect(count("report_records")).resolves.toBe(0);
  });

  it("returns the existing report ID on fingerprint duplication", async () => {
    const first = await saveReport(env.DB, report(), "developer@example.com");
    const second = await saveReport(env.DB, report(), "developer@example.com");

    expect(first).toEqual({ kind: "inserted", reportId: expect.any(String) });
    expect(second).toEqual({ kind: "duplicate", reportId: first.reportId });
    await expect(count("reports")).resolves.toBe(1);
  });

  it("does not convert unrelated D1 errors into duplicates", async () => {
    const invalid = report();
    invalid.policy.pct = 101;

    await expect(saveReport(env.DB, invalid, "developer@example.com")).rejects.toThrow();
    await expect(count("reports")).resolves.toBe(0);
  });

  it("chunks large child JSON payloads without breaking report atomicity", async () => {
    const large = report();
    large.identity.reportId = "large-child-results";
    large.records[0].dkimResults = Array.from({ length: 20 }, (_, index) => ({
      domain: "example.com",
      selector: `s${index}`,
      result: "pass" as const,
      humanResult: "x".repeat(80_000),
    }));

    await expect(saveReport(env.DB, large, "developer@example.com")).resolves.toMatchObject({ kind: "inserted" });
    await expect(count("reports")).resolves.toBe(1);
    await expect(count("dkim_results")).resolves.toBe(20);
  });
});
