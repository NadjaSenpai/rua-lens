import { XMLParser, XMLValidator } from "fast-xml-parser";
import type {
  NormalizedDkimResult,
  NormalizedPolicyOverride,
  NormalizedRecord,
  NormalizedReport,
  NormalizedSpfResult,
} from "../domain/dmarc";
import { INGEST_LIMITS } from "./limits";
import { assertSafeXmlMarkup, decodeXml, IngestError, isIngestError } from "./xml-security";

type XmlObject = Record<string, unknown>;

const dispositions = ["none", "quarantine", "reject"] as const;
const alignments = ["pass", "fail"] as const;
const alignmentModes = ["r", "s"] as const;
const dkimResults = ["none", "pass", "fail", "policy", "neutral", "temperror", "permerror"] as const;
const spfResults = ["none", "neutral", "pass", "fail", "softfail", "temperror", "permerror"] as const;
const overrideTypes = [
  "forwarded",
  "sampled_out",
  "trusted_forwarder",
  "mailing_list",
  "local_policy",
  "other",
] as const;
const spfScopes = ["mfrom", "helo"] as const;

const repeatedPaths = new Set([
  "feedback.record",
  "feedback.record.auth_results.dkim",
  "feedback.record.auth_results.spf",
  "feedback.record.row.policy_evaluated.reason",
]);

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
  trimValues: true,
  maxNestedTags: INGEST_LIMITS.maxXmlDepth,
  isArray: (_tagName, path) => repeatedPaths.has(String(path)),
});

export function parseDmarcXml(xml: Uint8Array): NormalizedReport {
  if (xml.byteLength > INGEST_LIMITS.maxXmlBytes) {
    throw new IngestError("SIZE_LIMIT_EXCEEDED");
  }

  const source = decodeXml(xml);
  assertSafeXmlMarkup(source, INGEST_LIMITS.maxXmlDepth);

  if (XMLValidator.validate(source) !== true) {
    throw new IngestError("INVALID_XML");
  }

  try {
    const parsed: unknown = parser.parse(source);
    const feedback = requiredObject(parsed, "feedback");
    const metadata = requiredObject(feedback, "report_metadata");
    const policy = requiredObject(feedback, "policy_published");

    const domain = requiredDomain(requiredString(policy, "domain"));
    const dateRange = requiredObject(metadata, "date_range");
    const periodBegin = nonNegativeUnixSeconds(dateRange, "begin");
    const periodEnd = nonNegativeUnixSeconds(dateRange, "end");
    if (periodBegin > periodEnd) {
      throw new IngestError("NOT_DMARC_REPORT");
    }
    const records = requiredArray(feedback, "record");
    if (records.length === 0) {
      throw new IngestError("NOT_DMARC_REPORT");
    }
    if (records.length > INGEST_LIMITS.maxRecordsPerReport) {
      throw new IngestError("EXCESSIVE_STRUCTURE");
    }

    return {
      identity: {
        orgName: requiredString(metadata, "org_name"),
        reportId: requiredString(metadata, "report_id"),
        domain,
        periodBegin,
        periodEnd,
      },
      policy: {
        p: requiredEnum(policy, "p", dispositions),
        sp: optionalEnum(policy, "sp", dispositions),
        pct: optionalPercentage(policy, "pct", 100),
        adkim: optionalEnum(policy, "adkim", alignmentModes) ?? "r",
        aspf: optionalEnum(policy, "aspf", alignmentModes) ?? "r",
      },
      records: records.map(normalizeRecord),
    };
  } catch (error) {
    if (isIngestError(error)) {
      throw error;
    }
    throw new IngestError("INVALID_XML");
  }
}

function normalizeRecord(value: unknown): NormalizedRecord {
  const record = asObject(value);
  if (!record) {
    throw new IngestError("NOT_DMARC_REPORT");
  }

  const row = requiredObject(record, "row");
  const policyEvaluated = requiredObject(row, "policy_evaluated");
  const identifiers = requiredObject(record, "identifiers");
  const authResults = optionalObject(record, "auth_results");
  const overrides = optionalArray(policyEvaluated, "reason").map(normalizeOverride);
  const normalizedDkimResults = optionalArray(authResults, "dkim").map(normalizeDkimResult);
  const normalizedSpfResults = optionalArray(authResults, "spf").map(normalizeSpfResult);

  if (
    overrides.length > INGEST_LIMITS.maxOverridesPerRecord ||
    normalizedDkimResults.length > INGEST_LIMITS.maxDkimResultsPerRecord ||
    normalizedSpfResults.length > INGEST_LIMITS.maxSpfResultsPerRecord
  ) {
    throw new IngestError("EXCESSIVE_STRUCTURE");
  }

  return {
    sourceIp: requiredIp(requiredString(row, "source_ip")),
    messageCount: positiveSafeInteger(row, "count"),
    disposition: requiredEnum(policyEvaluated, "disposition", dispositions),
    policyEvaluated: {
      dkim: requiredEnum(policyEvaluated, "dkim", alignments),
      spf: requiredEnum(policyEvaluated, "spf", alignments),
      overrides,
    },
    identifiers: {
      headerFrom: requiredDomain(requiredString(identifiers, "header_from")),
      envelopeFrom: optionalString(identifiers, "envelope_from"),
      envelopeTo: optionalString(identifiers, "envelope_to"),
    },
    dkimResults: normalizedDkimResults,
    spfResults: normalizedSpfResults,
  };
}

function normalizeDkimResult(value: unknown): NormalizedDkimResult {
  const result = asObject(value);
  if (!result) {
    throw new IngestError("NOT_DMARC_REPORT");
  }
  const domain = optionalString(result, "domain");
  return {
    domain: domain ? requiredDomain(domain) : "",
    selector: optionalString(result, "selector"),
    result: requiredEnum(result, "result", dkimResults),
    humanResult: optionalString(result, "human_result"),
  };
}

function normalizeSpfResult(value: unknown): NormalizedSpfResult {
  const result = asObject(value);
  if (!result) {
    throw new IngestError("NOT_DMARC_REPORT");
  }
  return {
    domain: requiredDomain(requiredString(result, "domain")),
    scope: optionalEnum(result, "scope", spfScopes),
    result: requiredEnum(result, "result", spfResults),
  };
}

function normalizeOverride(value: unknown): NormalizedPolicyOverride {
  const override = asObject(value);
  if (!override) {
    throw new IngestError("NOT_DMARC_REPORT");
  }
  return {
    type: optionalEnum(override, "type", overrideTypes) ?? "other",
    comment: optionalString(override, "comment"),
  };
}

function requiredObject(value: unknown, key: string): XmlObject {
  const object = asObject(value);
  const nested = object ? asObject(object[key]) : null;
  if (!nested) {
    throw new IngestError("NOT_DMARC_REPORT");
  }
  return nested;
}

function optionalObject(object: XmlObject, key: string): XmlObject | null {
  return asObject(object[key]);
}

function asObject(value: unknown): XmlObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as XmlObject)
    : null;
}

function requiredArray(object: XmlObject, key: string): unknown[] {
  const values = optionalArray(object, key);
  if (values.length === 0) {
    throw new IngestError("NOT_DMARC_REPORT");
  }
  return values;
}

function optionalArray(object: XmlObject | null, key: string): unknown[] {
  if (!object || object[key] === undefined) {
    return [];
  }
  const value = object[key];
  return Array.isArray(value) ? value : [value];
}

function requiredString(object: XmlObject, key: string): string {
  const value = optionalString(object, key);
  if (!value) {
    throw new IngestError("NOT_DMARC_REPORT");
  }
  return value;
}

function optionalString(object: XmlObject, key: string): string | null {
  const value = object[key];
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function requiredEnum<T extends string>(object: XmlObject, key: string, values: readonly T[]): T {
  const value = requiredString(object, key);
  if (!values.includes(value as T)) {
    throw new IngestError("NOT_DMARC_REPORT");
  }
  return value as T;
}

function optionalEnum<T extends string>(object: XmlObject, key: string, values: readonly T[]): T | null {
  const value = optionalString(object, key);
  if (value === null) {
    return null;
  }
  if (!values.includes(value as T)) {
    throw new IngestError("NOT_DMARC_REPORT");
  }
  return value as T;
}

function positiveSafeInteger(object: XmlObject, key: string): number {
  const value = requiredString(object, key);
  if (!/^\d+$/.test(value)) {
    throw new IngestError("NOT_DMARC_REPORT");
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new IngestError("NOT_DMARC_REPORT");
  }
  return result;
}

function nonNegativeUnixSeconds(object: XmlObject, key: string): number {
  const value = requiredString(object, key);
  if (!/^\d+$/.test(value)) {
    throw new IngestError("NOT_DMARC_REPORT");
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new IngestError("NOT_DMARC_REPORT");
  }
  return result;
}

function optionalPercentage(object: XmlObject, key: string, fallback: number): number {
  const value = optionalString(object, key);
  if (value === null) {
    return fallback;
  }
  if (!/^\d+$/.test(value)) {
    throw new IngestError("NOT_DMARC_REPORT");
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0 || result > 100) {
    throw new IngestError("NOT_DMARC_REPORT");
  }
  return result;
}

function requiredDomain(value: string): string {
  const domain = value.toLowerCase();
  if (
    domain.length > 253 ||
    !domain.includes(".") ||
    domain.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
  ) {
    throw new IngestError("NOT_DMARC_REPORT");
  }
  return domain;
}

function requiredIp(value: string): string {
  if (isIpv4(value) || isIpv6(value)) {
    return value;
  }
  throw new IngestError("NOT_DMARC_REPORT");
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
  );
}

function isIpv6(value: string): boolean {
  if (!value.includes(":") || value.length > 45 || value.includes(":::")) {
    return false;
  }

  const compressionIndex = value.indexOf("::");
  const compressed = compressionIndex !== -1;
  if (
    (compressed && value.indexOf("::", compressionIndex + 2) !== -1) ||
    (!compressed && (value.startsWith(":") || value.endsWith(":")))
  ) {
    return false;
  }

  const left = compressed ? value.slice(0, compressionIndex) : value;
  const right = compressed ? value.slice(compressionIndex + 2) : "";
  const groups = [
    ...(left === "" ? [] : left.split(":")),
    ...(right === "" ? [] : right.split(":")),
  ];
  if (groups.some((group) => group === "")) {
    return false;
  }

  const finalGroup = groups.at(-1);
  const hasEmbeddedIpv4 = finalGroup?.includes(".") ?? false;
  if (hasEmbeddedIpv4 && (!finalGroup || !value.endsWith(finalGroup) || !isIpv4(finalGroup))) {
    return false;
  }

  const hexadecimalGroups = hasEmbeddedIpv4 ? groups.slice(0, -1) : groups;
  if (!hexadecimalGroups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) {
    return false;
  }

  const groupCount = hexadecimalGroups.length + (hasEmbeddedIpv4 ? 2 : 0);
  return compressed ? groupCount < 8 : groupCount === 8;
}
