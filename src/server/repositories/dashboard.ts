import type {
  DashboardResponse,
  ReportListItem,
} from "../../shared/api-contract";
import type { ReportScope } from "../report-scope";

const FAILURE_SOURCE_LIMIT = 10;
const RECENT_REPORT_LIMIT = 5;

type SummaryRow = {
  total_messages: number;
  dmarc_pass_messages: number;
  pass_messages: number;
  review_messages: number;
  fail_messages: number;
};

type TrendRow = {
  date: string;
  total_messages: number;
  dmarc_pass_messages: number;
  dmarc_fail_messages: number;
  pass_messages: number;
  review_messages: number;
  fail_messages: number;
};

type DispositionRow = {
  disposition: DashboardResponse["dispositions"][number]["disposition"];
  total_messages: number;
};

type FailureSourceRow = {
  source_ip: string;
  total_messages: number;
};

type DomainRow = {
  domain: string;
};

type RecentReportRow = {
  id: string;
  org_name: string;
  external_report_id: string;
  domain: string;
  period_begin: number;
  period_end: number;
  imported_at: number;
  imported_by: string;
  total_messages: number;
  dmarc_pass_messages: number;
};

export async function getDashboard(
  db: D1Database,
  scope: ReportScope,
): Promise<DashboardResponse> {
  const filters = buildDashboardFilters(scope);
  const results = await db.batch([
    db
      .prepare(
        `SELECT
          COALESCE(SUM(rr.message_count), 0) AS total_messages,
          COALESCE(SUM(CASE WHEN rr.dmarc_pass = 1 THEN rr.message_count ELSE 0 END), 0) AS dmarc_pass_messages,
          COALESCE(SUM(CASE WHEN rr.classification = 'pass' THEN rr.message_count ELSE 0 END), 0) AS pass_messages,
          COALESCE(SUM(CASE WHEN rr.classification = 'review' THEN rr.message_count ELSE 0 END), 0) AS review_messages,
          COALESCE(SUM(CASE WHEN rr.classification = 'fail' THEN rr.message_count ELSE 0 END), 0) AS fail_messages
        FROM reports AS r
        INNER JOIN report_records AS rr ON rr.report_id = r.id
        ${filters.clause}`,
      )
      .bind(...filters.values),
    db
      .prepare(
        `SELECT
          strftime('%Y-%m-%d', r.period_begin, 'unixepoch') AS date,
          SUM(rr.message_count) AS total_messages,
          SUM(CASE WHEN rr.dmarc_pass = 1 THEN rr.message_count ELSE 0 END) AS dmarc_pass_messages,
          SUM(CASE WHEN rr.dmarc_pass = 0 THEN rr.message_count ELSE 0 END) AS dmarc_fail_messages,
          SUM(CASE WHEN rr.classification = 'pass' THEN rr.message_count ELSE 0 END) AS pass_messages,
          SUM(CASE WHEN rr.classification = 'review' THEN rr.message_count ELSE 0 END) AS review_messages,
          SUM(CASE WHEN rr.classification = 'fail' THEN rr.message_count ELSE 0 END) AS fail_messages
        FROM reports AS r
        INNER JOIN report_records AS rr ON rr.report_id = r.id
        ${filters.clause}
        GROUP BY strftime('%Y-%m-%d', r.period_begin, 'unixepoch')
        ORDER BY date ASC`,
      )
      .bind(...filters.values),
    db
      .prepare(
        `SELECT rr.disposition, SUM(rr.message_count) AS total_messages
        FROM reports AS r
        INNER JOIN report_records AS rr ON rr.report_id = r.id
        ${filters.clause}
        GROUP BY rr.disposition
        ORDER BY CASE rr.disposition
          WHEN 'none' THEN 1
          WHEN 'quarantine' THEN 2
          WHEN 'reject' THEN 3
        END ASC`,
      )
      .bind(...filters.values),
    db
      .prepare(
        `SELECT rr.source_ip, SUM(rr.message_count) AS total_messages
        FROM reports AS r
        INNER JOIN report_records AS rr
          ON rr.report_id = r.id AND rr.classification = 'fail'
        ${filters.clause}
        GROUP BY rr.source_ip
        ORDER BY SUM(rr.message_count) DESC, rr.source_ip ASC
        LIMIT ?`,
      )
      .bind(...filters.values, FAILURE_SOURCE_LIMIT),
    db
      .prepare(
        `SELECT DISTINCT r.domain
        FROM reports AS r
        ${filters.clause}
        ORDER BY r.domain ASC`,
      )
      .bind(...filters.values),
    db
      .prepare(
        `SELECT
          r.id,
          r.org_name,
          r.external_report_id,
          r.domain,
          r.period_begin,
          r.period_end,
          r.imported_at,
          r.imported_by,
          COALESCE(SUM(rr.message_count), 0) AS total_messages,
          COALESCE(SUM(CASE WHEN rr.dmarc_pass = 1 THEN rr.message_count ELSE 0 END), 0) AS dmarc_pass_messages
        FROM reports AS r
        LEFT JOIN report_records AS rr ON rr.report_id = r.id
        ${filters.clause}
        GROUP BY r.id
        ORDER BY r.imported_at DESC, r.id DESC
        LIMIT ?`,
      )
      .bind(...filters.values, RECENT_REPORT_LIMIT),
  ]);

  const summaryRow = resultRows<SummaryRow>(results[0])[0] ?? {
    total_messages: 0,
    dmarc_pass_messages: 0,
    pass_messages: 0,
    review_messages: 0,
    fail_messages: 0,
  };

  return {
    summary: {
      totalMessages: summaryRow.total_messages,
      dmarcPassMessages: summaryRow.dmarc_pass_messages,
      dmarcPassRate:
        summaryRow.total_messages === 0
          ? 0
          : summaryRow.dmarc_pass_messages / summaryRow.total_messages,
      passMessages: summaryRow.pass_messages,
      reviewMessages: summaryRow.review_messages,
      failMessages: summaryRow.fail_messages,
    },
    dailyTrend: resultRows<TrendRow>(results[1]).map((row) => ({
      date: row.date,
      totalMessages: row.total_messages,
      dmarcPassMessages: row.dmarc_pass_messages,
      dmarcFailMessages: row.dmarc_fail_messages,
      passMessages: row.pass_messages,
      reviewMessages: row.review_messages,
      failMessages: row.fail_messages,
    })),
    dispositions: resultRows<DispositionRow>(results[2]).map((row) => ({
      disposition: row.disposition,
      totalMessages: row.total_messages,
    })),
    failureSources: resultRows<FailureSourceRow>(results[3]).map((row) => ({
      sourceIp: row.source_ip,
      totalMessages: row.total_messages,
    })),
    domains: resultRows<DomainRow>(results[4]).map(({ domain }) => domain),
    recentReports: resultRows<RecentReportRow>(results[5]).map(mapRecentReport),
  };
}

function buildDashboardFilters(scope: ReportScope): {
  clause: string;
  values: Array<string | number>;
} {
  const conditions: string[] = [];
  const values: Array<string | number> = [];
  if (scope.domain !== undefined) {
    conditions.push("r.domain = ?");
    values.push(scope.domain);
  }
  if (scope.from !== undefined) {
    conditions.push("r.period_begin >= ?");
    values.push(scope.from);
  }
  if (scope.toExclusive !== undefined) {
    conditions.push("r.period_begin < ?");
    values.push(scope.toExclusive);
  }
  return {
    clause: conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`,
    values,
  };
}

function resultRows<T>(result: D1Result): T[] {
  return result.results as unknown as T[];
}

function mapRecentReport(row: RecentReportRow): ReportListItem {
  return {
    id: row.id,
    orgName: row.org_name,
    externalReportId: row.external_report_id,
    domain: row.domain,
    periodBegin: unixSecondsToIso(row.period_begin),
    periodEnd: unixSecondsToIso(row.period_end),
    totalMessages: row.total_messages,
    dmarcPassRate: row.total_messages === 0 ? 0 : row.dmarc_pass_messages / row.total_messages,
    importedAt: unixSecondsToIso(row.imported_at),
    importedBy: row.imported_by,
  };
}

function unixSecondsToIso(value: number): string {
  return new Date(value * 1000).toISOString();
}
