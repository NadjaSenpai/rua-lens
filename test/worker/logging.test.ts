import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import reportSingle from "../fixtures/report-single.xml?raw";
import { xmlFile } from "../support/archive-fixtures";

const origin = "https://example.com";
const sensitiveJwt = [
  "eyJhbGciOiJSUzI1NiJ9",
  "eyJlbWFpbCI6InNlbnNpdGl2ZUBleGFtcGxlLmNvbSJ9",
  "signature-value",
].join(".");

afterEach(() => {
  vi.restoreAllMocks();
});

function uploadRequest(files: readonly File[]): Request {
  const body = new FormData();
  for (const file of files) {
    body.append("files", file);
  }
  return new Request(`${origin}/api/uploads`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Cf-Access-Jwt-Assertion": sensitiveJwt,
    },
    body,
  });
}

describe("structured request logging", () => {
  it("records only inserted, duplicate, and rejected counts for completed uploads", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await SELF.fetch(uploadRequest([
      xmlFile("valid.xml", reportSingle),
      xmlFile("invalid.xml", "<feedback />"),
    ]));

    expect(response.status).toBe(200);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatchObject({
      successes: 1,
      skipped: 0,
      failures: 1,
      errorCode: null,
    });
  });

  it("logs only generalized infrastructure failure fields", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await env.DB.prepare("DROP TABLE reports").run();

    const response = await SELF.fetch(uploadRequest([xmlFile("sensitive.xml", reportSingle)]));

    expect(response.status).toBe(500);
    const responseText = await response.text();
    expect(responseText).toContain("INFRASTRUCTURE_ERROR");
    expect(log).toHaveBeenCalledTimes(1);
    const entry = log.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(entry).sort()).toEqual([
      "durationMs",
      "errorCode",
      "failures",
      "requestId",
      "skipped",
      "successes",
    ]);
    expect(entry).toMatchObject({
      successes: 0,
      skipped: 0,
      failures: 0,
      errorCode: "INFRASTRUCTURE_ERROR",
    });
    expect(entry.requestId).toBe(response.headers.get("X-Request-ID"));
    expect(entry.durationMs).toEqual(expect.any(Number));

    const serialized = JSON.stringify(entry);
    for (const sensitive of [
      "<feedback>",
      "192.0.2.10",
      "mail",
      "reports@example.com",
      sensitiveJwt,
      "DROP TABLE",
      "stack",
    ]) {
      expect(serialized).not.toContain(sensitive);
      expect(responseText).not.toContain(sensitive);
    }
  });
});
