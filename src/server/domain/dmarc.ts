export type DmarcDisposition = "none" | "quarantine" | "reject";
export type AlignmentResult = "pass" | "fail";
export type Classification = "pass" | "review" | "fail";
export type AlignmentMode = "r" | "s";

export type DkimResult =
  | "none"
  | "pass"
  | "fail"
  | "policy"
  | "neutral"
  | "temperror"
  | "permerror";

export type SpfResult =
  | "none"
  | "neutral"
  | "pass"
  | "fail"
  | "softfail"
  | "temperror"
  | "permerror";

export type PolicyOverrideType =
  | "forwarded"
  | "sampled_out"
  | "trusted_forwarder"
  | "mailing_list"
  | "local_policy"
  | "other";

export type ReportIdentity = {
  orgName: string;
  reportId: string;
  domain: string;
  periodBegin: number;
  periodEnd: number;
};

export type PublishedPolicy = {
  p: DmarcDisposition;
  sp: DmarcDisposition | null;
  pct: number;
  adkim: AlignmentMode;
  aspf: AlignmentMode;
};

export type NormalizedDkimResult = {
  domain: string;
  selector: string | null;
  result: DkimResult;
  humanResult: string | null;
};

export type NormalizedSpfResult = {
  domain: string;
  scope: "mfrom" | "helo" | null;
  result: SpfResult;
};

export type NormalizedPolicyOverride = {
  type: PolicyOverrideType;
  comment: string | null;
};

export type NormalizedRecord = {
  sourceIp: string;
  messageCount: number;
  disposition: DmarcDisposition;
  policyEvaluated: {
    dkim: AlignmentResult;
    spf: AlignmentResult;
    overrides: NormalizedPolicyOverride[];
  };
  identifiers: {
    headerFrom: string;
    envelopeFrom: string | null;
    envelopeTo: string | null;
  };
  dkimResults: NormalizedDkimResult[];
  spfResults: NormalizedSpfResult[];
};

export type NormalizedReport = {
  identity: ReportIdentity;
  policy: PublishedPolicy;
  records: NormalizedRecord[];
};

export type RecordDecision = {
  classification: Classification;
  dmarcPass: boolean;
};
