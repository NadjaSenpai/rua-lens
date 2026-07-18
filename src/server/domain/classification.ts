import type { NormalizedRecord, RecordDecision } from "./dmarc";

export function classifyRecord(record: NormalizedRecord): RecordDecision {
  const dmarcPass = record.policyEvaluated.dkim === "pass" || record.policyEvaluated.spf === "pass";

  if (record.policyEvaluated.overrides.length > 0) {
    return { classification: "review", dmarcPass };
  }

  if (
    record.policyEvaluated.dkim === "fail" &&
    record.policyEvaluated.spf === "fail" &&
    record.disposition === "none"
  ) {
    return { classification: "review", dmarcPass };
  }

  if (dmarcPass) {
    return { classification: "pass", dmarcPass };
  }

  return { classification: "fail", dmarcPass };
}

export type ClassificationSummary = {
  totalMessages: number;
  dmarcPassMessages: number;
  dmarcFailMessages: number;
  passMessages: number;
  reviewMessages: number;
  failMessages: number;
};

export function summarizeClassifications(records: readonly NormalizedRecord[]): ClassificationSummary {
  return records.reduce<ClassificationSummary>(
    (summary, record) => {
      const decision = classifyRecord(record);
      summary.totalMessages += record.messageCount;
      if (decision.dmarcPass) {
        summary.dmarcPassMessages += record.messageCount;
      } else {
        summary.dmarcFailMessages += record.messageCount;
      }
      if (decision.classification === "pass") {
        summary.passMessages += record.messageCount;
      } else if (decision.classification === "review") {
        summary.reviewMessages += record.messageCount;
      } else {
        summary.failMessages += record.messageCount;
      }
      return summary;
    },
    {
      totalMessages: 0,
      dmarcPassMessages: 0,
      dmarcFailMessages: 0,
      passMessages: 0,
      reviewMessages: 0,
      failMessages: 0,
    },
  );
}
