import { describe, expect, it } from "vitest";
import { extractReportCandidates } from "../../src/server/ingest/extract-report-candidates";
import { createExpansionBudget, INGEST_LIMITS, type IngestLimits } from "../../src/server/ingest/limits";
import { IngestError } from "../../src/server/ingest/xml-security";
import { crcCorruptedZipFile, encryptedZipFile, gzipFile, xmlFile, zipFile } from "../support/archive-fixtures";

const xml = "<feedback />";

function limits(overrides: Partial<IngestLimits> = {}): IngestLimits {
  return { ...INGEST_LIMITS, ...overrides };
}

async function collect(file: File, budget = createExpansionBudget()): Promise<{ entryName: string | null; xml: string }[]> {
  const decoder = new TextDecoder();
  const candidates = [];
  for await (const candidate of extractReportCandidates(file, budget)) {
    candidates.push({ entryName: candidate.entryName, xml: decoder.decode(candidate.xml) });
  }
  return candidates;
}

async function expectCode(action: () => Promise<unknown>, code: IngestError["code"]): Promise<void> {
  try {
    await action();
    throw new Error("expected extraction to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(IngestError);
    expect((error as IngestError).code).toBe(code);
  }
}

describe("extractReportCandidates", () => {
  it("detects XML from bytes rather than filename or MIME type", async () => {
    const file = xmlFile("not-an-xml.bin", ` \n${xml}`);
    await expect(collect(file)).resolves.toEqual([{ entryName: null, xml: ` \n${xml}` }]);
  });

  it("extracts one XML candidate from gzip", async () => {
    await expect(collect(gzipFile("report.data", xml))).resolves.toEqual([{ entryName: null, xml }]);
  });

  it("extracts ZIP XML entries sequentially and skips directories and non-XML entries", async () => {
    const file = zipFile("reports.data", {
      "reports/": new Uint8Array(),
      "reports/ignored.txt": "not XML",
      "reports/first.xml": xml,
      "reports/second.xml": xml,
    });

    await expect(collect(file)).resolves.toEqual([
      { entryName: "reports/first.xml", xml },
      { entryName: "reports/second.xml", xml },
    ]);
  });

  it.each(["/absolute.xml", "../parent.xml", "folder\\backslash.xml", "C:drive.xml", "nul\0name.xml"]) (
    "rejects unsafe ZIP entry paths: %s",
    async (entryName) => {
      await expectCode(() => collect(zipFile("unsafe.zip", { [entryName]: xml })), "INVALID_ARCHIVE");
    },
  );

  it("maps corrupted and encrypted archives to safe errors", async () => {
    await expectCode(
      () => collect(new File([new Uint8Array([0x1f, 0x8b, 0x00])], "broken.gz")),
      "INVALID_ARCHIVE",
    );
    await expectCode(
      () => collect(new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "broken.zip")),
      "INVALID_ARCHIVE",
    );
    await expectCode(() => collect(encryptedZipFile("encrypted.zip", { "report.xml": xml })), "INVALID_ARCHIVE");
    await expectCode(() => collect(crcCorruptedZipFile("bad-crc.zip", { "report.xml": xml })), "INVALID_ARCHIVE");
  });

  it("enforces injected input, XML, archive, batch, and entry limits", async () => {
    const tinyInput = limits({ maxInputBytesPerFile: 4, maxXmlBytes: 4 });
    await expect(collect(xmlFile("four.bin", "<x/>"), createExpansionBudget(tinyInput))).resolves.toHaveLength(1);
    await expectCode(
      () => collect(xmlFile("five.bin", "<x/> "), createExpansionBudget(tinyInput)),
      "SIZE_LIMIT_EXCEEDED",
    );

    const tinyXml = limits({ maxXmlBytes: 3 });
    await expectCode(() => collect(gzipFile("large.gz", "<x/>"), createExpansionBudget(tinyXml)), "SIZE_LIMIT_EXCEEDED");

    const archiveLimit = limits({ maxArchiveExpansionBytes: 4, maxXmlBytes: 4 });
    await expectCode(
      () => collect(zipFile("archive.zip", { "one.xml": "<x/>", "two.xml": "<x/>" }), createExpansionBudget(archiveLimit)),
      "SIZE_LIMIT_EXCEEDED",
    );

    const sharedBudget = createExpansionBudget(limits({ maxBatchExpansionBytes: 7, maxXmlBytes: 4 }));
    await expect(collect(xmlFile("first.bin", "<x/>"), sharedBudget)).resolves.toHaveLength(1);
    await expectCode(() => collect(xmlFile("second.bin", "<x/>"), sharedBudget), "SIZE_LIMIT_EXCEEDED");

    const oneHundredEntries = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [`entries/${index}.txt`, "ignored"]),
    );
    await expect(collect(zipFile("one-hundred.zip", oneHundredEntries))).resolves.toEqual([]);
    const oneHundredOneEntries = { ...oneHundredEntries, "entries/overflow.txt": "ignored" };
    await expectCode(() => collect(zipFile("one-hundred-one.zip", oneHundredOneEntries)), "INVALID_ARCHIVE");
  });

  it("does not expand the next ZIP entry before the next iterator request", async () => {
    const budget = createExpansionBudget(limits({ maxBatchExpansionBytes: 4, maxXmlBytes: 4 }));
    const iterator = extractReportCandidates(
      zipFile("lazy.zip", { "first.xml": "<x/>", "second.xml": "<x/>" }),
      budget,
    )[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({ done: false, value: { entryName: "first.xml" } });
    await expect(iterator.next()).rejects.toMatchObject({ code: "SIZE_LIMIT_EXCEEDED" });
  });
});
