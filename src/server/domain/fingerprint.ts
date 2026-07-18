import type { ReportIdentity } from "./dmarc";

export async function computeFingerprint(metadata: ReportIdentity): Promise<string> {
  const tuple = JSON.stringify([
    metadata.orgName.trim(),
    metadata.reportId.trim(),
    metadata.domain.trim().toLowerCase(),
    metadata.periodBegin,
    metadata.periodEnd,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tuple));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
