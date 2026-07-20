import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ReportDetail, ReportsPageResponse } from "../../src/shared/api-contract";
import { createApp } from "../../src/server/app";
import type { RuntimeEnv } from "../../src/server/env";
import { parseDmarcXml } from "../../src/server/ingest/parse-dmarc";
import { saveReport } from "../../src/server/repositories/reports";
import reportMultiple from "../fixtures/report-multiple.xml?raw";
import reportSingle from "../fixtures/report-single.xml?raw";
import { xmlBytes } from "../support/archive-fixtures";

const baseUrl = "https://example.com/api/reports";

async function seedReport(xml: string, importedBy = "developer@example.com"): Promise<string> {
  const saved = await saveReport(env.DB, parseDmarcXml(xmlBytes(xml)), importedBy);
  return saved.reportId;
}

async function getPage(query = ""): Promise<ReportsPageResponse> {
  const response = await SELF.fetch(`${baseUrl}${query}`);
  expect(response.status).toBe(200);
  return response.json<ReportsPageResponse>();
}

function forOtherDomain(xml: string): string {
  return xml.replaceAll("example.com", "other.example");
}

describe("reports API", () => {
  it("lists report summaries with weighted message totals and DMARC success rate", async () => {
    const reportId = await seedReport(reportSingle, "analyst@example.com");
    await env.DB.prepare("UPDATE reports SET imported_at = ? WHERE id = ?")
      .bind(1_700_100_000, reportId)
      .run();

    const body = await getPage();

    expect(body).toEqual({
      items: [
        {
          id: reportId,
          orgName: "Example Reporter",
          externalReportId: "example-report-1",
          domain: "example.com",
          periodBegin: "2023-11-14T22:13:20.000Z",
          periodEnd: "2023-11-15T22:13:20.000Z",
          totalMessages: 4,
          dmarcPassRate: 1,
          importedAt: "2023-11-16T02:00:00.000Z",
          importedBy: "analyst@example.com",
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
    });
  });

  it("filters by domain and inclusive UTC date range and paginates", async () => {
    const firstId = await seedReport(reportSingle);
    const secondId = await seedReport(forOtherDomain(reportMultiple));
    await env.DB.batch([
      env.DB.prepare("UPDATE reports SET imported_at = ? WHERE id = ?").bind(100, firstId),
      env.DB.prepare("UPDATE reports SET imported_at = ? WHERE id = ?").bind(200, secondId),
    ]);

    expect((await getPage("?domain=other.example")).items.map(({ id }) => id)).toEqual([secondId]);
    expect((await getPage("?from=2023-11-15")).items.map(({ id }) => id)).toEqual([secondId]);
    expect((await getPage("?to=2023-11-14")).items.map(({ id }) => id)).toEqual([firstId]);

    const secondPage = await getPage("?page=2&pageSize=1");
    expect(secondPage).toMatchObject({ page: 2, pageSize: 1, total: 2 });
    expect(secondPage.items.map(({ id }) => id)).toEqual([firstId]);
  });

  it.each([
    "?page=0",
    "?page=-1",
    "?page=1.5",
    "?page=invalid",
    "?pageSize=0",
    "?pageSize=101",
    "?from=2023-02-30",
    "?to=not-a-date",
    "?from=2023-11-16&to=2023-11-15",
  ])("rejects invalid list query values: %s", async (query) => {
    const response = await SELF.fetch(`${baseUrl}${query}`);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });

  it("returns detail with every child result associated to its record", async () => {
    const reportId = await seedReport(reportMultiple);

    const response = await SELF.fetch(`${baseUrl}/${reportId}`);

    expect(response.status).toBe(200);
    const body = await response.json<ReportDetail>();
    expect(body).toMatchObject({
      id: reportId,
      orgName: "Example Reporter",
      externalReportId: "example-report-multiple",
      domain: "example.com",
      policy: { p: "quarantine", sp: null, pct: 100, adkim: "r", aspf: "r" },
    });
    expect(body.records).toHaveLength(2);
    expect(body.records[0]).toMatchObject({
      sourceIp: "198.51.100.20",
      messageCount: 2,
      classification: "pass",
      dmarcPass: true,
      identifiers: { headerFrom: "example.com", envelopeFrom: null, envelopeTo: null },
    });
    expect(body.records[0].dkimResults.map(({ selector }) => selector)).toEqual(["first", "second"]);
    expect(body.records[0].spfResults.map(({ scope }) => scope)).toEqual(["mfrom", "helo"]);
    expect(body.records[0].policyEvaluated.overrides).toEqual([]);
    expect(body.records[1]).toMatchObject({
      sourceIp: "203.0.113.30",
      messageCount: 3,
      classification: "review",
      dmarcPass: false,
      identifiers: {
        headerFrom: "example.com",
        envelopeFrom: null,
        envelopeTo: "recipient@example.com",
      },
    });
    expect(body.records[1].dkimResults).toHaveLength(1);
    expect(body.records[1].spfResults).toEqual([]);
    expect(body.records[1].policyEvaluated.overrides).toEqual([
      { type: "forwarded", comment: "example forwarding service" },
      { type: "local_policy", comment: null },
    ]);
  });

  it("returns 404 for an unknown report", async () => {
    const response = await SELF.fetch(`${baseUrl}/missing`);

    expect(response.status).toBe(404);
    const body = await response.json<{ error: { code: string; requestId: string } }>();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(response.headers.get("X-Request-ID")).toBe(body.error.requestId);
  });

  it("forbids deletion by a non-administrator before checking report existence", async () => {
    const reportId = await seedReport(reportSingle);
    const app = createApp();
    const bindings = {
      ...env,
      AUTH_MODE: "dev",
      DEV_USER_EMAIL: "viewer@example.com",
      DEV_ADMIN_EMAILS: "admin@example.com",
    } as RuntimeEnv;

    const response = await app.request(
      `${baseUrl}/${reportId}`,
      { method: "DELETE", headers: { Origin: "https://example.com" } },
      bindings,
    );

    expect(response.status).toBe(403);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM reports").first<{ count: number }>()).toEqual({ count: 1 });
  });

  it("allows an administrator to delete a report and every child row", async () => {
    const reportId = await seedReport(reportMultiple);

    const response = await SELF.fetch(`${baseUrl}/${reportId}`, {
      method: "DELETE",
      headers: { Origin: "https://example.com" },
    });

    expect(response.status).toBe(204);
    for (const table of ["reports", "report_records", "dkim_results", "spf_results", "policy_overrides"]) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
      expect(row?.count).toBe(0);
    }
  });

  it("returns 404 when an administrator deletes an unknown report", async () => {
    const response = await SELF.fetch(`${baseUrl}/missing`, {
      method: "DELETE",
      headers: { Origin: "https://example.com" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});
