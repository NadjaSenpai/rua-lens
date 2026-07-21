import type { DashboardResponse, ReportListItem, ReportsPageResponse } from "../../shared/api-contract";
import type { StoredReport } from "./local-db";

export type LocalScope = {
  domain?: string;
  start?: string;
  end?: string;
};

function matchesScope(report: StoredReport, scope: LocalScope): boolean {
  if (scope.domain && report.detail.domain !== scope.domain) return false;
  if (scope.start && report.detail.periodBegin < scope.start) return false;
  if (scope.end && report.detail.periodEnd > scope.end) return false;
  return true;
}

export function aggregateDashboard(reports: StoredReport[], scope: LocalScope): DashboardResponse {
  const scoped = reports.filter((r) => matchesScope(r, scope));

  let totalMessages = 0;
  let dmarcPassMessages = 0;
  let passMessages = 0;
  let reviewMessages = 0;
  let failMessages = 0;
  const dayMap = new Map<string, { total: number; dPass: number; dFail: number; pass: number; review: number; fail: number }>();
  const dispMap = new Map<string, number>();
  const failSrcMap = new Map<string, number>();
  const domainSet = new Set<string>();

  for (const stored of scoped) {
    domainSet.add(stored.detail.domain);
    const day = stored.detail.periodBegin.slice(0, 10);

    for (const rec of stored.detail.records) {
      const n = rec.messageCount;
      totalMessages += n;
      if (rec.dmarcPass) dmarcPassMessages += n;
      if (rec.classification === "pass") passMessages += n;
      else if (rec.classification === "review") reviewMessages += n;
      else failMessages += n;

      const d = dayMap.get(day) ?? { total: 0, dPass: 0, dFail: 0, pass: 0, review: 0, fail: 0 };
      d.total += n;
      if (rec.dmarcPass) d.dPass += n; else d.dFail += n;
      if (rec.classification === "pass") d.pass += n;
      else if (rec.classification === "review") d.review += n;
      else d.fail += n;
      dayMap.set(day, d);

      dispMap.set(rec.disposition, (dispMap.get(rec.disposition) ?? 0) + n);

      if (rec.classification !== "pass") {
        failSrcMap.set(rec.sourceIp, (failSrcMap.get(rec.sourceIp) ?? 0) + n);
      }
    }
  }

  const dailyTrend = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      totalMessages: d.total,
      dmarcPassMessages: d.dPass,
      dmarcFailMessages: d.dFail,
      passMessages: d.pass,
      reviewMessages: d.review,
      failMessages: d.fail,
    }));

  const dispositions = (["none", "quarantine", "reject"] as const).map((disposition) => ({
    disposition,
    totalMessages: dispMap.get(disposition) ?? 0,
  }));

  const failureSources = [...failSrcMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([sourceIp, totalMessages]) => ({ sourceIp, totalMessages }));

  const recentReports: ReportListItem[] = scoped
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    .slice(0, 5)
    .map(toListItem);

  return {
    summary: {
      totalMessages,
      dmarcPassMessages,
      dmarcPassRate: totalMessages > 0 ? dmarcPassMessages / totalMessages : 0,
      passMessages,
      reviewMessages,
      failMessages,
    },
    dailyTrend,
    dispositions,
    failureSources,
    domains: [...domainSet].sort(),
    recentReports,
  };
}

export function paginateReports(
  reports: StoredReport[],
  scope: LocalScope,
  page: number,
  pageSize: number,
): ReportsPageResponse {
  const scoped = reports
    .filter((r) => matchesScope(r, scope))
    .sort((a, b) => b.detail.periodEnd.localeCompare(a.detail.periodEnd));

  const start = (page - 1) * pageSize;
  const items = scoped.slice(start, start + pageSize).map(toListItem);

  return { items, page, pageSize, total: scoped.length };
}

function toListItem(stored: StoredReport): ReportListItem {
  const d = stored.detail;
  const totalMessages = d.records.reduce((sum, r) => sum + r.messageCount, 0);
  const dmarcPass = d.records.reduce((sum, r) => sum + (r.dmarcPass ? r.messageCount : 0), 0);
  return {
    id: d.id,
    orgName: d.orgName,
    externalReportId: d.externalReportId,
    domain: d.domain,
    periodBegin: d.periodBegin,
    periodEnd: d.periodEnd,
    totalMessages,
    dmarcPassRate: totalMessages > 0 ? dmarcPass / totalMessages : 0,
    importedAt: stored.importedAt,
    importedBy: stored.importedBy,
  };
}
