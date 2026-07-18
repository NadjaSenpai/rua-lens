const MEBIBYTE = 1024 * 1024;

export const UPLOAD_LIMITS = {
  maxFiles: 20,
  maxInputBytesPerFile: 10 * MEBIBYTE,
  maxInputBytesBatch: 25 * MEBIBYTE,
} as const;

export type SessionResponse = {
  email: string;
  isAdmin: boolean;
};

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
};

export type UploadResult =
  | {
      sourceFileName: string;
      entryName: string | null;
      status: "inserted" | "duplicate";
      reportId: string;
    }
  | {
      sourceFileName: string;
      entryName: string | null;
      status: "rejected";
      code:
        | "INVALID_XML"
        | "NOT_DMARC_REPORT"
        | "EXCESSIVE_STRUCTURE"
        | "INVALID_ARCHIVE"
        | "UNSUPPORTED_FORMAT"
        | "SIZE_LIMIT_EXCEEDED";
      message: string;
    };

export type UploadBatchResult = {
  requestId: string;
  summary: {
    inserted: number;
    duplicate: number;
    rejected: number;
  };
  results: UploadResult[];
};

export type ReportListItem = {
  id: string;
  orgName: string;
  externalReportId: string;
  domain: string;
  periodBegin: string;
  periodEnd: string;
  totalMessages: number;
  dmarcPassRate: number;
  importedAt: string;
  importedBy: string;
};

export type ReportsPageResponse = {
  items: ReportListItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type ReportDetail = {
  id: string;
  orgName: string;
  externalReportId: string;
  domain: string;
  periodBegin: string;
  periodEnd: string;
  policy: {
    p: "none" | "quarantine" | "reject";
    sp: "none" | "quarantine" | "reject" | null;
    pct: number;
    adkim: "r" | "s";
    aspf: "r" | "s";
  };
  importedAt: string;
  importedBy: string;
  records: ReportRecordDetail[];
};

export type DashboardResponse = {
  summary: {
    totalMessages: number;
    dmarcPassMessages: number;
    dmarcPassRate: number;
    passMessages: number;
    reviewMessages: number;
    failMessages: number;
  };
  dailyTrend: Array<{
    date: string;
    totalMessages: number;
    dmarcPassMessages: number;
    dmarcFailMessages: number;
    passMessages: number;
    reviewMessages: number;
    failMessages: number;
  }>;
  dispositions: Array<{
    disposition: "none" | "quarantine" | "reject";
    totalMessages: number;
  }>;
  failureSources: Array<{
    sourceIp: string;
    totalMessages: number;
  }>;
  domains: string[];
  recentReports: ReportListItem[];
};

export type ReportRecordDetail = {
  sourceIp: string;
  messageCount: number;
  disposition: "none" | "quarantine" | "reject";
  classification: "pass" | "review" | "fail";
  dmarcPass: boolean;
  identifiers: {
    headerFrom: string;
    envelopeFrom: string | null;
    envelopeTo: string | null;
  };
  policyEvaluated: {
    dkim: "pass" | "fail";
    spf: "pass" | "fail";
    overrides: Array<{
      type:
        | "forwarded"
        | "sampled_out"
        | "trusted_forwarder"
        | "mailing_list"
        | "local_policy"
        | "other";
      comment: string | null;
    }>;
  };
  dkimResults: Array<{
    domain: string;
    selector: string | null;
    result: "none" | "pass" | "fail" | "policy" | "neutral" | "temperror" | "permerror";
    humanResult: string | null;
  }>;
  spfResults: Array<{
    domain: string;
    scope: "mfrom" | "helo" | null;
    result: "none" | "neutral" | "pass" | "fail" | "softfail" | "temperror" | "permerror";
  }>;
};
