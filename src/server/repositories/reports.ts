import type {
  ReportDetail,
  ReportListItem,
  ReportRecordDetail,
  ReportsPageResponse,
} from "../../shared/api-contract";
import { classifyRecord } from "../domain/classification";
import type { NormalizedReport } from "../domain/dmarc";
import { computeFingerprint } from "../domain/fingerprint";
import { INGEST_LIMITS } from "../ingest/limits";
import type { ReportScope } from "../report-scope";

type SqlValue = string | number | null;
type JsonRow = readonly SqlValue[];

export class ReportPersistenceError extends Error {
  readonly code = "EXCESSIVE_STRUCTURE" as const;

  constructor() {
    super("Report structure exceeds persistence limits.");
    this.name = "ReportPersistenceError";
  }
}

export async function saveReport(
  db: D1Database,
  report: NormalizedReport,
  importedBy: string,
): Promise<{ kind: "inserted"; reportId: string } | { kind: "duplicate"; reportId: string }> {
  const fingerprint = await computeFingerprint(report.identity);
  const reportId = crypto.randomUUID();
  const records: JsonRow[] = [];
  const dkimResults: JsonRow[] = [];
  const spfResults: JsonRow[] = [];
  const policyOverrides: JsonRow[] = [];

  for (const record of report.records) {
    const recordId = crypto.randomUUID();
    const decision = classifyRecord(record);
    records.push([
      recordId,
      reportId,
      record.sourceIp,
      record.messageCount,
      record.disposition,
      record.policyEvaluated.dkim,
      record.policyEvaluated.spf,
      decision.classification,
      decision.dmarcPass ? 1 : 0,
      record.identifiers.headerFrom,
      record.identifiers.envelopeFrom,
      record.identifiers.envelopeTo,
    ]);

    for (const result of record.dkimResults) {
      dkimResults.push([
        crypto.randomUUID(),
        recordId,
        result.domain,
        result.selector,
        result.result,
        result.humanResult,
      ]);
    }
    for (const result of record.spfResults) {
      spfResults.push([crypto.randomUUID(), recordId, result.domain, result.scope, result.result]);
    }
    for (const override of record.policyEvaluated.overrides) {
      policyOverrides.push([crypto.randomUUID(), recordId, override.type, override.comment]);
    }
  }

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO reports (
          id, org_name, external_report_id, domain, period_begin, period_end,
          policy_p, policy_sp, policy_pct, policy_adkim, policy_aspf,
          imported_at, imported_by, fingerprint
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        reportId,
        report.identity.orgName.trim(),
        report.identity.reportId.trim(),
        report.identity.domain.trim().toLowerCase(),
        report.identity.periodBegin,
        report.identity.periodEnd,
        report.policy.p,
        report.policy.sp,
        report.policy.pct,
        report.policy.adkim,
        report.policy.aspf,
        Math.floor(Date.now() / 1000),
        importedBy,
        fingerprint,
      ),
    ...insertJsonRows(
      db,
      "report_records",
      "id, report_id, source_ip, message_count, disposition, evaluated_dkim, evaluated_spf, classification, dmarc_pass, header_from, envelope_from, envelope_to",
      records,
    ),
    ...insertJsonRows(
      db,
      "dkim_results",
      "id, record_id, domain, selector, result, human_result",
      dkimResults,
    ),
    ...insertJsonRows(db, "spf_results", "id, record_id, domain, scope, result", spfResults),
    ...insertJsonRows(
      db,
      "policy_overrides",
      "id, record_id, override_type, comment",
      policyOverrides,
    ),
  ];

  if (statements.length > INGEST_LIMITS.maxD1StatementsPerReport) {
    throw new ReportPersistenceError();
  }

  try {
    await db.batch(statements);
    return { kind: "inserted", reportId };
  } catch (error) {
    if (!isFingerprintUniqueViolation(error)) {
      throw error;
    }

    const existing = await db
      .prepare("SELECT id FROM reports WHERE fingerprint = ? LIMIT 1")
      .bind(fingerprint)
      .first<{ id: string }>();
    if (existing) {
      return { kind: "duplicate", reportId: existing.id };
    }
    throw error;
  }
}

export type ReportListQuery = ReportScope & {
  page: number;
  pageSize: number;
};

type ReportListRow = {
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

type ReportRow = {
  id: string;
  org_name: string;
  external_report_id: string;
  domain: string;
  period_begin: number;
  period_end: number;
  policy_p: ReportDetail["policy"]["p"];
  policy_sp: ReportDetail["policy"]["sp"];
  policy_pct: number;
  policy_adkim: ReportDetail["policy"]["adkim"];
  policy_aspf: ReportDetail["policy"]["aspf"];
  imported_at: number;
  imported_by: string;
};

type ReportRecordRow = {
  id: string;
  source_ip: string;
  message_count: number;
  disposition: ReportRecordDetail["disposition"];
  evaluated_dkim: ReportRecordDetail["policyEvaluated"]["dkim"];
  evaluated_spf: ReportRecordDetail["policyEvaluated"]["spf"];
  classification: ReportRecordDetail["classification"];
  dmarc_pass: number;
  header_from: string;
  envelope_from: string | null;
  envelope_to: string | null;
};

type DkimResultRow = {
  record_id: string;
  domain: string;
  selector: string | null;
  result: ReportRecordDetail["dkimResults"][number]["result"];
  human_result: string | null;
};

type SpfResultRow = {
  record_id: string;
  domain: string;
  scope: ReportRecordDetail["spfResults"][number]["scope"];
  result: ReportRecordDetail["spfResults"][number]["result"];
};

type PolicyOverrideRow = {
  record_id: string;
  override_type: ReportRecordDetail["policyEvaluated"]["overrides"][number]["type"];
  comment: string | null;
};

export async function listReports(
  db: D1Database,
  query: ReportListQuery,
): Promise<ReportsPageResponse> {
  const filters = buildReportFilters(query);
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS total FROM reports AS r ${filters.clause}`)
    .bind(...filters.values)
    .first<{ total: number }>();
  const offset = (query.page - 1) * query.pageSize;
  const rows = await db
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
      LIMIT ? OFFSET ?`,
    )
    .bind(...filters.values, query.pageSize, offset)
    .all<ReportListRow>();

  return {
    items: rows.results.map(mapReportListItem),
    page: query.page,
    pageSize: query.pageSize,
    total: countRow?.total ?? 0,
  };
}

export async function getReport(db: D1Database, reportId: string): Promise<ReportDetail | null> {
  const report = await db
    .prepare(
      `SELECT
        id, org_name, external_report_id, domain, period_begin, period_end,
        policy_p, policy_sp, policy_pct, policy_adkim, policy_aspf,
        imported_at, imported_by
      FROM reports
      WHERE id = ?`,
    )
    .bind(reportId)
    .first<ReportRow>();
  if (!report) {
    return null;
  }

  const recordRows = await db
    .prepare(
      `SELECT
        id, source_ip, message_count, disposition, evaluated_dkim, evaluated_spf,
        classification, dmarc_pass, header_from, envelope_from, envelope_to
      FROM report_records
      WHERE report_id = ?
      ORDER BY rowid`,
    )
    .bind(reportId)
    .all<ReportRecordRow>();
  const dkimRows = await db
    .prepare(
      `SELECT d.record_id, d.domain, d.selector, d.result, d.human_result
      FROM dkim_results AS d
      INNER JOIN report_records AS rr ON rr.id = d.record_id
      WHERE rr.report_id = ?
      ORDER BY d.rowid`,
    )
    .bind(reportId)
    .all<DkimResultRow>();
  const spfRows = await db
    .prepare(
      `SELECT s.record_id, s.domain, s.scope, s.result
      FROM spf_results AS s
      INNER JOIN report_records AS rr ON rr.id = s.record_id
      WHERE rr.report_id = ?
      ORDER BY s.rowid`,
    )
    .bind(reportId)
    .all<SpfResultRow>();
  const overrideRows = await db
    .prepare(
      `SELECT o.record_id, o.override_type, o.comment
      FROM policy_overrides AS o
      INNER JOIN report_records AS rr ON rr.id = o.record_id
      WHERE rr.report_id = ?
      ORDER BY o.rowid`,
    )
    .bind(reportId)
    .all<PolicyOverrideRow>();

  const recordsById = new Map<string, ReportRecordDetail>();
  const records = recordRows.results.map((row) => {
    const record: ReportRecordDetail = {
      sourceIp: row.source_ip,
      messageCount: row.message_count,
      disposition: row.disposition,
      classification: row.classification,
      dmarcPass: row.dmarc_pass === 1,
      identifiers: {
        headerFrom: row.header_from,
        envelopeFrom: row.envelope_from,
        envelopeTo: row.envelope_to,
      },
      policyEvaluated: {
        dkim: row.evaluated_dkim,
        spf: row.evaluated_spf,
        overrides: [],
      },
      dkimResults: [],
      spfResults: [],
    };
    recordsById.set(row.id, record);
    return record;
  });

  for (const row of dkimRows.results) {
    recordsById.get(row.record_id)?.dkimResults.push({
      domain: row.domain,
      selector: row.selector,
      result: row.result,
      humanResult: row.human_result,
    });
  }
  for (const row of spfRows.results) {
    recordsById.get(row.record_id)?.spfResults.push({
      domain: row.domain,
      scope: row.scope,
      result: row.result,
    });
  }
  for (const row of overrideRows.results) {
    recordsById.get(row.record_id)?.policyEvaluated.overrides.push({
      type: row.override_type,
      comment: row.comment,
    });
  }

  return {
    id: report.id,
    orgName: report.org_name,
    externalReportId: report.external_report_id,
    domain: report.domain,
    periodBegin: unixSecondsToIso(report.period_begin),
    periodEnd: unixSecondsToIso(report.period_end),
    policy: {
      p: report.policy_p,
      sp: report.policy_sp,
      pct: report.policy_pct,
      adkim: report.policy_adkim,
      aspf: report.policy_aspf,
    },
    importedAt: unixSecondsToIso(report.imported_at),
    importedBy: report.imported_by,
    records,
  };
}

export async function deleteReport(db: D1Database, reportId: string): Promise<boolean> {
  const result = await db.prepare("DELETE FROM reports WHERE id = ?").bind(reportId).run();
  return result.meta.changes > 0;
}

function buildReportFilters(query: ReportListQuery): {
  clause: string;
  values: Array<string | number>;
} {
  const conditions: string[] = [];
  const values: Array<string | number> = [];
  if (query.domain !== undefined) {
    conditions.push("r.domain = ?");
    values.push(query.domain);
  }
  if (query.from !== undefined) {
    conditions.push("r.period_begin >= ?");
    values.push(query.from);
  }
  if (query.toExclusive !== undefined) {
    conditions.push("r.period_begin < ?");
    values.push(query.toExclusive);
  }
  return {
    clause: conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`,
    values,
  };
}

function mapReportListItem(row: ReportListRow): ReportListItem {
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

function insertJsonRows(
  db: D1Database,
  table: "report_records" | "dkim_results" | "spf_results" | "policy_overrides",
  columns: string,
  rows: readonly JsonRow[],
): D1PreparedStatement[] {
  if (rows.length === 0) {
    return [];
  }

  const selectValues = rows[0]
    .map((_, index) => `json_extract(value, '$[${index}]')`)
    .join(", ");
  return chunkJsonRows(rows, INGEST_LIMITS.maxJsonChunkBytes).map((chunk) =>
    db.prepare(`INSERT INTO ${table} (${columns}) SELECT ${selectValues} FROM json_each(?)`).bind(chunk),
  );
}

function chunkJsonRows(rows: readonly JsonRow[], maximumBytes: number): string[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current: string[] = [];
  let currentBytes = 2;

  for (const row of rows) {
    const encoded = JSON.stringify(row);
    const encodedBytes = encoder.encode(encoded).byteLength;
    const separatorBytes = current.length === 0 ? 0 : 1;
    if (currentBytes + separatorBytes + encodedBytes > maximumBytes) {
      if (current.length === 0) {
        throw new ReportPersistenceError();
      }
      chunks.push(`[${current.join(",")}]`);
      current = [];
      currentBytes = 2;
    }
    if (currentBytes + encodedBytes > maximumBytes) {
      throw new ReportPersistenceError();
    }
    current.push(encoded);
    currentBytes += (current.length === 1 ? 0 : 1) + encodedBytes;
  }

  if (current.length > 0) {
    chunks.push(`[${current.join(",")}]`);
  }
  return chunks;
}

function isFingerprintUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    /(?:UNIQUE constraint failed:\s*reports\.fingerprint|SQLITE_CONSTRAINT_UNIQUE.*reports\.fingerprint)/i.test(
      error.message,
    )
  );
}
