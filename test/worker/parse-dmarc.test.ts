import { describe, expect, it } from "vitest";
import { parseDmarcXml } from "../../src/server/ingest/parse-dmarc";
import { IngestError } from "../../src/server/ingest/xml-security";
import reportDoctype from "../fixtures/report-doctype.xml?raw";
import reportMultiple from "../fixtures/report-multiple.xml?raw";
import reportNotDmarc from "../fixtures/report-not-dmarc.xml?raw";
import reportSingle from "../fixtures/report-single.xml?raw";

const encoder = new TextEncoder();
const parse = (xml: string) => parseDmarcXml(encoder.encode(xml));

function expectCode(action: () => unknown, code: IngestError["code"]): void {
  try {
    action();
    throw new Error("expected parsing to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(IngestError);
    expect((error as IngestError).code).toBe(code);
  }
}

describe("parseDmarcXml", () => {
  it("normalizes a minimum DMARC report", () => {
    expect(parse(reportSingle)).toMatchObject({
      identity: {
        orgName: "Example Reporter",
        reportId: "example-report-1",
        domain: "example.com",
        periodBegin: 1_700_000_000,
        periodEnd: 1_700_086_400,
      },
      policy: { p: "reject", sp: "none", pct: 100, adkim: "r", aspf: "r" },
      records: [
        {
          sourceIp: "192.0.2.10",
          messageCount: 4,
          policyEvaluated: { dkim: "pass", spf: "fail", overrides: [] },
          identifiers: { headerFrom: "example.com", envelopeFrom: "mailer.example.com", envelopeTo: null },
        },
      ],
    });
  });

  it("always returns records and authentication values as arrays", () => {
    expect(parse(reportSingle).records).toHaveLength(1);

    const multiple = parse(reportMultiple);
    expect(multiple.records).toHaveLength(2);
    expect(multiple.records[0].dkimResults.map(({ selector }) => selector)).toEqual(["first", "second"]);
    expect(multiple.records[0].spfResults.map(({ domain }) => domain)).toEqual([
      "relay.example.com",
      "helo.example.com",
    ]);
    expect(multiple.records[1].policyEvaluated.overrides.map(({ type }) => type)).toEqual([
      "forwarded",
      "local_policy",
    ]);
  });

  it("applies policy defaults and null optional values", () => {
    const parsed = parse(reportMultiple);
    expect(parsed.policy).toEqual({ p: "quarantine", sp: null, pct: 100, adkim: "r", aspf: "r" });
    expect(parsed.records[0].identifiers).toEqual({
      headerFrom: "example.com",
      envelopeFrom: null,
      envelopeTo: null,
    });
    expect(parsed.records[1].dkimResults[0]).toMatchObject({ selector: null, humanResult: null });
    expect(parsed.records[1].policyEvaluated.overrides[1].comment).toBeNull();
  });

  it("maps malformed XML to a safe error", () => {
    const xml = "<feedback><record></feedback>";
    expectCode(() => parse(xml), "INVALID_XML");
    try {
      parse(xml);
    } catch (error) {
      expect((error as Error).message).not.toContain(xml);
    }
  });

  it("rejects non-DMARC and structurally incomplete XML", () => {
    expectCode(() => parse(reportNotDmarc), "NOT_DMARC_REPORT");
    expectCode(() => parse("<feedback><report_metadata /></feedback>"), "NOT_DMARC_REPORT");
  });

  it.each([":::", "1:::2", ":1:2:3:4:5:6:7:8", "1:2:3:4:5:6:7:8:"])(
    "rejects malformed IPv6 source IPs: %s",
    (sourceIp) => {
      expectCode(() => parse(reportSingle.replace("192.0.2.10", sourceIp)), "NOT_DMARC_REPORT");
    },
  );

  it.each([
    reportDoctype,
    "<!DOCTYPE feedback><feedback />",
    "<!ENTITY example 'value'><feedback />",
    "<! entity example 'value'><feedback />",
  ])("rejects DTD and entity declarations", (xml) => {
    expectCode(() => parse(xml), "INVALID_XML");
  });

  it("allows ordinary text and built-in entities", () => {
    const xml = reportSingle.replace("Example Reporter", "Example SYSTEM &amp; PUBLIC Reporter");
    expect(parse(xml).identity.orgName).toContain("Example SYSTEM");
  });

  it("enforces normalized child-array limits", () => {
    const signature = "<dkim><domain>example.com</domain><selector>mail</selector><result>pass</result></dkim>";
    const xml = reportSingle.replace(signature, signature.repeat(21));
    expectCode(() => parse(xml), "EXCESSIVE_STRUCTURE");
  });

  it("rejects excessive nesting before it reaches the XML parser", () => {
    const nested = `${"<node>".repeat(65)}${"</node>".repeat(65)}`;
    expectCode(() => parse(nested), "EXCESSIVE_STRUCTURE");
  });
});
