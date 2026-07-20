import type { StatelessReport, StorageMode, UploadBatchResult, UploadResult } from "../../shared/api-contract";
import type { Principal } from "../auth/principal";
import { classifyRecord } from "../domain/classification";
import type { NormalizedReport } from "../domain/dmarc";
import { computeFingerprint } from "../domain/fingerprint";
import { ReportPersistenceError, saveReport } from "../repositories/reports";
import { extractReportCandidates } from "./extract-report-candidates";
import { createExpansionBudget, INGEST_LIMITS, type IngestLimits } from "./limits";
import { parseDmarcXml } from "./parse-dmarc";
import { IngestError, isIngestError, safeIngestMessage } from "./xml-security";

export class IngestInfrastructureError extends Error {
  readonly code = "INTERNAL_ERROR";

  constructor() {
    super("The report could not be saved.");
    this.name = "IngestInfrastructureError";
  }
}

export async function ingestBatch(input: {
  files: ReadonlyArray<File>;
  principal: Principal;
  db?: D1Database;
  storageMode?: StorageMode;
  limits?: IngestLimits;
  requestId?: string;
}): Promise<UploadBatchResult> {
  const limits = input.limits ?? INGEST_LIMITS;
  const stateless = input.storageMode === "stateless";

  if (input.files.length > limits.maxFiles || totalInputBytes(input.files) > limits.maxInputBytesBatch) {
    throw new IngestError("SIZE_LIMIT_EXCEEDED");
  }

  const budget = createExpansionBudget(limits);
  const results: UploadResult[] = [];
  const reports: StatelessReport[] = [];
  const seenFingerprints = new Set<string>();

  for (const file of input.files) {
    if (file.size > limits.maxInputBytesPerFile) {
      results.push(rejected(file.name, null, new IngestError("SIZE_LIMIT_EXCEEDED")));
      continue;
    }

    let yieldedCandidate = false;
    try {
      for await (const candidate of extractReportCandidates(file, budget)) {
        yieldedCandidate = true;
        try {
          const report = parseDmarcXml(candidate.xml);

          if (stateless) {
            const fingerprint = await computeFingerprint(report.identity);
            if (seenFingerprints.has(fingerprint)) {
              results.push({
                sourceFileName: candidate.sourceFileName,
                entryName: candidate.entryName,
                status: "duplicate",
                reportId: fingerprint,
              });
              continue;
            }
            seenFingerprints.add(fingerprint);
            const reportId = crypto.randomUUID();
            const now = new Date().toISOString();
            reports.push({
              id: reportId,
              fingerprint,
              detail: normalizedToDetail(report, reportId, now, input.principal.email),
              importedAt: now,
              importedBy: input.principal.email,
            });
            results.push({
              sourceFileName: candidate.sourceFileName,
              entryName: candidate.entryName,
              status: "inserted",
              reportId,
            });
          } else {
            const saved = await saveReport(input.db!, report, input.principal.email);
            results.push({
              sourceFileName: candidate.sourceFileName,
              entryName: candidate.entryName,
              status: saved.kind,
              reportId: saved.reportId,
            });
          }
        } catch (error) {
          if (isIngestError(error)) {
            results.push(rejected(candidate.sourceFileName, candidate.entryName, error));
            continue;
          }
          if (error instanceof ReportPersistenceError) {
            results.push({
              sourceFileName: candidate.sourceFileName,
              entryName: candidate.entryName,
              status: "rejected",
              code: error.code,
              message: safeIngestMessage(error.code),
            });
            continue;
          }
          throw new IngestInfrastructureError();
        }
      }
      if (!yieldedCandidate) {
        results.push(rejected(file.name, null, new IngestError("UNSUPPORTED_FORMAT")));
      }
    } catch (error) {
      if (isIngestError(error)) {
        results.push(rejected(file.name, null, error));
        continue;
      }
      throw new IngestInfrastructureError();
    }
  }

  const batch: UploadBatchResult = {
    requestId: input.requestId ?? crypto.randomUUID(),
    summary: results.reduce(
      (summary, result) => {
        summary[result.status] += 1;
        return summary;
      },
      { inserted: 0, duplicate: 0, rejected: 0 },
    ),
    results,
  };

  if (stateless && reports.length > 0) {
    batch.reports = reports;
  }

  return batch;
}

function normalizedToDetail(
  report: NormalizedReport,
  reportId: string,
  importedAt: string,
  importedBy: string,
): import("../../shared/api-contract").ReportDetail {
  return {
    id: reportId,
    orgName: report.identity.orgName,
    externalReportId: report.identity.reportId,
    domain: report.identity.domain,
    periodBegin: new Date(report.identity.periodBegin * 1000).toISOString(),
    periodEnd: new Date(report.identity.periodEnd * 1000).toISOString(),
    policy: {
      p: report.policy.p,
      sp: report.policy.sp,
      pct: report.policy.pct,
      adkim: report.policy.adkim,
      aspf: report.policy.aspf,
    },
    importedAt,
    importedBy,
    records: report.records.map((record) => {
      const decision = classifyRecord(record);
      return {
        sourceIp: record.sourceIp,
        messageCount: record.messageCount,
        disposition: record.disposition,
        classification: decision.classification,
        dmarcPass: decision.dmarcPass,
        identifiers: record.identifiers,
        policyEvaluated: record.policyEvaluated,
        dkimResults: record.dkimResults,
        spfResults: record.spfResults,
      };
    }),
  };
}

function totalInputBytes(files: ReadonlyArray<File>): number {
  return files.reduce((total, file) => total + file.size, 0);
}

function rejected(sourceFileName: string, entryName: string | null, error: IngestError): UploadResult {
  return {
    sourceFileName,
    entryName,
    status: "rejected",
    code: error.code,
    message: error.message,
  };
}
