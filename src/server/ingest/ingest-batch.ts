import type { UploadBatchResult, UploadResult } from "../../shared/api-contract";
import type { Principal } from "../auth/principal";
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
  db: D1Database;
  limits?: IngestLimits;
  requestId?: string;
}): Promise<UploadBatchResult> {
  const limits = input.limits ?? INGEST_LIMITS;
  if (input.files.length > limits.maxFiles || totalInputBytes(input.files) > limits.maxInputBytesBatch) {
    throw new IngestError("SIZE_LIMIT_EXCEEDED");
  }

  const budget = createExpansionBudget(limits);
  const results: UploadResult[] = [];

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
          const saved = await saveReport(input.db, report, input.principal.email);
          results.push({
            sourceFileName: candidate.sourceFileName,
            entryName: candidate.entryName,
            status: saved.kind,
            reportId: saved.reportId,
          });
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

  return {
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
