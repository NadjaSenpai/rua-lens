import { UPLOAD_LIMITS } from "../../shared/api-contract";

export const MEBIBYTE = 1024 * 1024;

export type IngestLimits = {
  maxFiles: number;
  maxInputBytesPerFile: number;
  maxInputBytesBatch: number;
  transportOverheadBytes: number;
  maxRequestBytes: number;
  maxXmlBytes: number;
  maxArchiveExpansionBytes: number;
  maxBatchExpansionBytes: number;
  maxZipEntries: number;
  maxXmlDepth: number;
  maxRecordsPerReport: number;
  maxDkimResultsPerRecord: number;
  maxSpfResultsPerRecord: number;
  maxOverridesPerRecord: number;
  maxJsonChunkBytes: number;
  maxD1StatementsPerReport: number;
};

export const INGEST_LIMITS: IngestLimits = {
  maxFiles: UPLOAD_LIMITS.maxFiles,
  maxInputBytesPerFile: UPLOAD_LIMITS.maxInputBytesPerFile,
  maxInputBytesBatch: UPLOAD_LIMITS.maxInputBytesBatch,
  transportOverheadBytes: 256 * 1024,
  maxRequestBytes: 25 * MEBIBYTE + 256 * 1024,
  maxXmlBytes: 20 * MEBIBYTE,
  maxArchiveExpansionBytes: 30 * MEBIBYTE,
  maxBatchExpansionBytes: 50 * MEBIBYTE,
  maxZipEntries: 100,
  maxXmlDepth: 64,
  maxRecordsPerReport: 10_000,
  maxDkimResultsPerRecord: 20,
  maxSpfResultsPerRecord: 20,
  maxOverridesPerRecord: 20,
  maxJsonChunkBytes: Math.floor(1.5 * MEBIBYTE),
  maxD1StatementsPerReport: 40,
};

export type ExpansionBudget = {
  limits: IngestLimits;
  expandedBytes: number;
};

export function createExpansionBudget(limits: IngestLimits = INGEST_LIMITS): ExpansionBudget {
  return { limits, expandedBytes: 0 };
}
