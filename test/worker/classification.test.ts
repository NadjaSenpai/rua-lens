import { describe, expect, it } from "vitest";
import { classifyRecord, summarizeClassifications } from "../../src/server/domain/classification";
import type { NormalizedRecord } from "../../src/server/domain/dmarc";

function record(overrides: Partial<NormalizedRecord> = {}): NormalizedRecord {
  return {
    sourceIp: "192.0.2.1",
    messageCount: 1,
    disposition: "reject",
    policyEvaluated: { dkim: "fail", spf: "fail", overrides: [] },
    identifiers: { headerFrom: "example.com", envelopeFrom: null, envelopeTo: null },
    dkimResults: [],
    spfResults: [],
    ...overrides,
  };
}

describe("classifyRecord", () => {
  it("passes aligned DKIM", () => {
    expect(classifyRecord(record({ policyEvaluated: { dkim: "pass", spf: "fail", overrides: [] } }))).toEqual({
      classification: "pass",
      dmarcPass: true,
    });
  });

  it("passes aligned SPF", () => {
    expect(classifyRecord(record({ policyEvaluated: { dkim: "fail", spf: "pass", overrides: [] } }))).toEqual({
      classification: "pass",
      dmarcPass: true,
    });
  });

  it("reviews overrides without changing DMARC success", () => {
    expect(
      classifyRecord(
        record({
          policyEvaluated: {
            dkim: "pass",
            spf: "fail",
            overrides: [{ type: "forwarded", comment: null }],
          },
        }),
      ),
    ).toEqual({ classification: "review", dmarcPass: true });
  });

  it("reviews an unapplied policy failure", () => {
    expect(classifyRecord(record({ disposition: "none" }))).toEqual({ classification: "review", dmarcPass: false });
  });

  it.each(["quarantine", "reject"] as const)("fails an enforced %s policy failure", (disposition) => {
    expect(classifyRecord(record({ disposition }))).toEqual({ classification: "fail", dmarcPass: false });
  });

  it("weights classification and DMARC success by message count", () => {
    const summary = summarizeClassifications([
      record({ messageCount: 9, policyEvaluated: { dkim: "pass", spf: "fail", overrides: [] } }),
      record({ messageCount: 2, disposition: "none" }),
      record({ messageCount: 1 }),
    ]);

    expect(summary).toEqual({
      totalMessages: 12,
      dmarcPassMessages: 9,
      dmarcFailMessages: 3,
      passMessages: 9,
      reviewMessages: 2,
      failMessages: 1,
    });
  });
});
