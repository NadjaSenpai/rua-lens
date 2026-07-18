import { describe, expect, it } from "vitest";
import { computeFingerprint } from "../../src/server/domain/fingerprint";
import type { ReportIdentity } from "../../src/server/domain/dmarc";

const identity: ReportIdentity = {
  orgName: "Example Reporter",
  reportId: "report-1",
  domain: "EXAMPLE.COM",
  periodBegin: 1_700_000_000,
  periodEnd: 1_700_086_400,
};

describe("computeFingerprint", () => {
  it("returns a stable SHA-256 fingerprint for the five report identity values", async () => {
    await expect(computeFingerprint(identity)).resolves.toMatch(/^[a-f0-9]{64}$/);
    await expect(computeFingerprint(identity)).resolves.toBe(await computeFingerprint({ ...identity }));
  });

  it("uses a JSON tuple so ambiguous concatenations do not collide", async () => {
    const first = await computeFingerprint({
      ...identity,
      orgName: "ab",
      reportId: "c",
      domain: "example.com",
      periodBegin: 1,
      periodEnd: 23,
    });
    const second = await computeFingerprint({
      ...identity,
      orgName: "a",
      reportId: "bc",
      domain: "example.com",
      periodBegin: 12,
      periodEnd: 3,
    });

    expect(first).not.toBe(second);
  });

  it("trims report names and lowercases only the domain", async () => {
    await expect(computeFingerprint({ ...identity, orgName: " Example Reporter ", reportId: " report-1 " })).resolves.toBe(
      await computeFingerprint({ ...identity, domain: "example.com" }),
    );
  });
});
