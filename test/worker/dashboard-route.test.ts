import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { DashboardResponse } from "../../src/shared/api-contract";
import type { NormalizedReport } from "../../src/server/domain/dmarc";
import { parseDmarcXml } from "../../src/server/ingest/parse-dmarc";
import { saveReport } from "../../src/server/repositories/reports";
import reportMultiple from "../fixtures/report-multiple.xml?raw";
import reportSingle from "../fixtures/report-single.xml?raw";
import { xmlBytes } from "../support/archive-fixtures";

const baseUrl = "https://example.com/api/dashboard";

function parseReport(xml: string): NormalizedReport {
  return parseDmarcXml(xmlBytes(xml));
}

async function seedReport(report: NormalizedReport): Promise<string> {
  return (await saveReport(env.DB, report, "developer@example.com")).reportId;
}

async function getDashboard(query = ""): Promise<DashboardResponse> {
  const response = await SELF.fetch(`${baseUrl}${query}`);
  expect(response.status).toBe(200);
  return response.json<DashboardResponse>();
}

describe("GET /api/dashboard", () => {
  it("returns message-weighted summary, daily trend, and dispositions", async () => {
    await seedReport(parseReport(reportSingle));
    await seedReport(parseReport(reportMultiple));
    const failed = parseReport(reportMultiple);
    failed.identity.reportId = "dashboard-failed-copy";
    failed.records[1].policyEvaluated.overrides = [];
    await seedReport(failed);

    const body = await getDashboard();

    expect(body.summary).toEqual({
      totalMessages: 14,
      dmarcPassMessages: 8,
      dmarcPassRate: 8 / 14,
      passMessages: 8,
      reviewMessages: 3,
      failMessages: 3,
    });
    expect(body.dailyTrend).toEqual([
      {
        date: "2023-11-14",
        totalMessages: 4,
        dmarcPassMessages: 4,
        dmarcFailMessages: 0,
        passMessages: 4,
        reviewMessages: 0,
        failMessages: 0,
      },
      {
        date: "2023-11-15",
        totalMessages: 10,
        dmarcPassMessages: 4,
        dmarcFailMessages: 6,
        passMessages: 4,
        reviewMessages: 3,
        failMessages: 3,
      },
    ]);
    expect(body.dispositions).toEqual([
      { disposition: "none", totalMessages: 8 },
      { disposition: "quarantine", totalMessages: 6 },
    ]);
  });

  it("ranks at most ten fail-classified source IPs with stable ties", async () => {
    for (let index = 0; index < 11; index += 1) {
      const report = parseReport(reportMultiple);
      report.identity.reportId = `failure-source-${index}`;
      const record = report.records[1];
      record.policyEvaluated.overrides = [];
      record.sourceIp = `198.51.100.${index + 1}`;
      record.messageCount = index < 2 ? 20 : 12 - index;
      report.records = [record];
      await seedReport(report);
    }

    const body = await getDashboard();

    expect(body.failureSources).toHaveLength(10);
    expect(body.failureSources.slice(0, 2)).toEqual([
      { sourceIp: "198.51.100.1", totalMessages: 20 },
      { sourceIp: "198.51.100.2", totalMessages: 20 },
    ]);
    expect(body.failureSources).not.toContainEqual({ sourceIp: "198.51.100.11", totalMessages: 2 });
  });

  it("applies domain and inclusive UTC date filters to every section", async () => {
    const first = parseReport(reportSingle);
    const firstId = await seedReport(first);
    const second = parseReport(reportMultiple.replaceAll("example.com", "other.example"));
    const secondId = await seedReport(second);
    await env.DB.batch([
      env.DB.prepare("UPDATE reports SET imported_at = ? WHERE id = ?").bind(100, firstId),
      env.DB.prepare("UPDATE reports SET imported_at = ? WHERE id = ?").bind(200, secondId),
    ]);

    const byDomain = await getDashboard("?domain=OTHER.EXAMPLE");
    expect(byDomain.summary.totalMessages).toBe(5);
    expect(byDomain.dailyTrend.map(({ date }) => date)).toEqual(["2023-11-15"]);
    expect(byDomain.dispositions).toEqual([
      { disposition: "none", totalMessages: 2 },
      { disposition: "quarantine", totalMessages: 3 },
    ]);
    expect(byDomain.failureSources).toEqual([]);
    expect(byDomain.domains).toEqual(["other.example"]);
    expect(byDomain.recentReports.map(({ id }) => id)).toEqual([secondId]);

    expect((await getDashboard("?from=2023-11-15")).recentReports.map(({ id }) => id)).toEqual([secondId]);
    expect((await getDashboard("?to=2023-11-14")).recentReports.map(({ id }) => id)).toEqual([firstId]);
  });

  it("returns sorted domain candidates and complete recent report summaries", async () => {
    const firstId = await seedReport(parseReport(reportSingle));
    const second = parseReport(reportMultiple.replaceAll("example.com", "alpha.example"));
    const secondId = await seedReport(second);
    await env.DB.batch([
      env.DB.prepare("UPDATE reports SET imported_at = ? WHERE id = ?").bind(100, firstId),
      env.DB.prepare("UPDATE reports SET imported_at = ? WHERE id = ?").bind(200, secondId),
    ]);

    const body = await getDashboard();

    expect(body.domains).toEqual(["alpha.example", "example.com"]);
    expect(body.recentReports.map(({ id }) => id)).toEqual([secondId, firstId]);
    expect(body.recentReports[0]).toEqual({
      id: secondId,
      orgName: "Example Reporter",
      externalReportId: "example-report-multiple",
      domain: "alpha.example",
      periodBegin: "2023-11-15T22:13:20.000Z",
      periodEnd: "2023-11-16T22:13:20.000Z",
      totalMessages: 5,
      dmarcPassRate: 0.4,
      importedAt: "1970-01-01T00:03:20.000Z",
      importedBy: "developer@example.com",
    });
  });

  it("returns zero values and empty arrays without data", async () => {
    expect(await getDashboard()).toEqual({
      summary: {
        totalMessages: 0,
        dmarcPassMessages: 0,
        dmarcPassRate: 0,
        passMessages: 0,
        reviewMessages: 0,
        failMessages: 0,
      },
      dailyTrend: [],
      dispositions: [],
      failureSources: [],
      domains: [],
      recentReports: [],
    });
  });

  it.each(["?from=2023-02-30", "?to=invalid", "?from=2023-11-16&to=2023-11-15"])(
    "rejects invalid report scope: %s",
    async (query) => {
      const response = await SELF.fetch(`${baseUrl}${query}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    },
  );
});
