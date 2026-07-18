import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { UploadBatchResult } from "../../src/shared/api-contract";
import { INGEST_LIMITS, MEBIBYTE } from "../../src/server/ingest/limits";
import reportSingle from "../fixtures/report-single.xml?raw";
import { xmlFile } from "../support/archive-fixtures";

const url = "https://example.com/api/uploads";
const requestHeaders = { Origin: "https://example.com" };

function withReportId(xml: string, reportId: string): string {
  return xml.replace("example-report-1", reportId);
}

function binaryFile(name: string, size: number): File {
  return new File([new ArrayBuffer(size)], name, { type: "application/octet-stream" });
}

async function upload(files: readonly File[]): Promise<Response> {
  const body = new FormData();
  for (const file of files) {
    body.append("files", file);
  }
  return SELF.fetch(url, {
    method: "POST",
    headers: requestHeaders,
    body,
  });
}

async function errorCode(response: Response): Promise<string> {
  const body = await response.json<{ error: { code: string } }>();
  return body.error.code;
}

describe("POST /api/uploads", () => {
  it("returns the authenticated multipart upload contract with one request ID", async () => {
    const response = await upload([xmlFile("report.xml", reportSingle)]);

    expect(response.status).toBe(200);
    const body = await response.json<UploadBatchResult>();
    expect(body.summary).toEqual({ inserted: 1, duplicate: 0, rejected: 0 });
    expect(body.results).toEqual([
      expect.objectContaining({
        sourceFileName: "report.xml",
        entryName: null,
        status: "inserted",
        reportId: expect.any(String),
      }),
    ]);
    expect(response.headers.get("X-Request-ID")).toBe(body.requestId);
  });

  it("preserves partial success across repeated files fields", async () => {
    const response = await upload([
      xmlFile("valid.xml", withReportId(reportSingle, "upload-valid")),
      xmlFile("invalid.xml", "<feedback />"),
    ]);

    expect(response.status).toBe(200);
    const body = await response.json<UploadBatchResult>();
    expect(body.summary).toEqual({ inserted: 1, duplicate: 0, rejected: 1 });
    expect(body.results.map(({ status }) => status)).toEqual(["inserted", "rejected"]);
  });

  it("rejects missing files and non-multipart requests", async () => {
    const emptyBody = new FormData();
    emptyBody.append("other", "value");

    const missingFiles = await SELF.fetch(url, {
      method: "POST",
      headers: requestHeaders,
      body: emptyBody,
    });
    expect(missingFiles.status).toBe(400);
    expect(await errorCode(missingFiles)).toBe("INVALID_REQUEST");

    const wrongContentType = await SELF.fetch(url, {
      method: "POST",
      headers: { ...requestHeaders, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(wrongContentType.status).toBe(400);
    expect(await errorCode(wrongContentType)).toBe("INVALID_REQUEST");
  });

  it("accepts 20 files and rejects 21 files at request scope", async () => {
    const accepted = await upload(
      Array.from({ length: INGEST_LIMITS.maxFiles }, (_, index) =>
        xmlFile(`report-${index}.xml`, "<feedback />"),
      ),
    );
    expect(accepted.status).toBe(200);
    expect((await accepted.json<UploadBatchResult>()).summary.rejected).toBe(INGEST_LIMITS.maxFiles);

    const rejected = await upload(
      Array.from({ length: INGEST_LIMITS.maxFiles + 1 }, (_, index) =>
        xmlFile(`report-${index}.xml`, "<feedback />"),
      ),
    );
    expect(rejected.status).toBe(413);
    expect(await errorCode(rejected)).toBe("SIZE_LIMIT_EXCEEDED");
  });

  it("excludes multipart overhead from the 25 MiB file total boundary", async () => {
    const accepted = await upload([
      binaryFile("ten-a.bin", 10 * MEBIBYTE),
      binaryFile("ten-b.bin", 10 * MEBIBYTE),
      binaryFile("five.bin", 5 * MEBIBYTE),
    ]);
    expect(accepted.status).toBe(200);
    expect((await accepted.json<UploadBatchResult>()).summary.rejected).toBe(3);

    const rejected = await upload([
      binaryFile("ten-a.bin", 10 * MEBIBYTE),
      binaryFile("ten-b.bin", 10 * MEBIBYTE),
      binaryFile("five-plus.bin", 5 * MEBIBYTE + 1),
    ]);
    expect(rejected.status).toBe(413);
    expect(await errorCode(rejected)).toBe("SIZE_LIMIT_EXCEEDED");
  });

  it("returns an oversized individual file inside a partial-success 200", async () => {
    const response = await upload([
      binaryFile("oversized.xml", INGEST_LIMITS.maxInputBytesPerFile + 1),
      xmlFile("valid.xml", withReportId(reportSingle, "upload-after-oversized")),
    ]);

    expect(response.status).toBe(200);
    const body = await response.json<UploadBatchResult>();
    expect(body.summary).toEqual({ inserted: 1, duplicate: 0, rejected: 1 });
    expect(body.results).toEqual([
      expect.objectContaining({
        sourceFileName: "oversized.xml",
        status: "rejected",
        code: "SIZE_LIMIT_EXCEEDED",
      }),
      expect.objectContaining({ sourceFileName: "valid.xml", status: "inserted" }),
    ]);
  });

  it.each(["with", "without"])(
    "rejects an oversized request body %s Content-Length",
    async (contentLength) => {
      const headers = new Headers({
        ...requestHeaders,
        "Content-Type": "multipart/form-data; boundary=oversized",
      });
      if (contentLength === "with") {
        headers.set("Content-Length", String(INGEST_LIMITS.maxRequestBytes + 1));
      }

      const response = await SELF.fetch(
        new Request(url, {
          method: "POST",
          headers,
          body: new Blob([new ArrayBuffer(INGEST_LIMITS.maxRequestBytes + 1)]),
        }),
      );

      expect(response.status).toBe(413);
      expect(await errorCode(response)).toBe("SIZE_LIMIT_EXCEEDED");
    },
  );

  it("maps malformed multipart syntax to 422", async () => {
    const response = await SELF.fetch(url, {
      method: "POST",
      headers: {
        ...requestHeaders,
        "Content-Type": "multipart/form-data; boundary=broken",
      },
      body: "--broken\r\nContent-Disposition: form-data; name=\"files\"; filename=\"report.xml\"\r\n",
    });

    expect(response.status).toBe(422);
    expect(await errorCode(response)).toBe("INVALID_REQUEST");
  });

  it("sanitizes D1 infrastructure failures", async () => {
    await env.DB.prepare("DROP TABLE reports").run();

    const response = await upload([xmlFile("report.xml", reportSingle)]);

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain("INFRASTRUCTURE_ERROR");
    expect(text).not.toContain("<feedback>");
    expect(text).not.toContain("DROP TABLE");
    expect(text).not.toContain("stack");
    expect(text).not.toContain("eyJ");
  });
});
