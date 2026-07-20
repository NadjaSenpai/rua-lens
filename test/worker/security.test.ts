import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY } from "../../src/server/middleware/security-headers";
import staticHeaders from "../../public/_headers?raw";
import { xmlFile } from "../support/archive-fixtures";

const origin = "https://example.com";

function multipartRequest(requestOrigin: string, fetchSite: "same-origin" | "cross-site"): Request {
  const body = new FormData();
  body.append("files", xmlFile("invalid.xml", "<feedback />"));
  return new Request(`${origin}/api/uploads`, {
    method: "POST",
    headers: { Origin: requestOrigin, "Sec-Fetch-Site": fetchSite },
    body,
  });
}

describe("Worker security boundary", () => {
  it("generates its own request ID and applies API security headers without CORS", async () => {
    const response = await SELF.fetch(`${origin}/api/unknown`, {
      headers: { "X-Request-ID": "attacker-controlled" },
    });
    const body = await response.json<{ error: { requestId: string } }>();

    expect(body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.error.requestId).not.toBe("attacker-controlled");
    expect(response.headers.get("X-Request-ID")).toBe(body.error.requestId);
    expect(response.headers.get("Content-Security-Policy")).toBe(CONTENT_SECURITY_POLICY);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("keeps the static asset policy synchronized with the API policy", async () => {
    expect(staticHeaders).toContain(`Content-Security-Policy: ${CONTENT_SECURITY_POLICY}`);
    expect(staticHeaders).toContain("Referrer-Policy: no-referrer");
    expect(staticHeaders).toContain("X-Content-Type-Options: nosniff");
    expect(staticHeaders).toContain("X-Frame-Options: DENY");

    const response = await SELF.fetch(`${origin}/`);
    expect(response.headers.get("Content-Security-Policy")).toBe(CONTENT_SECURITY_POLICY);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("allows same-origin multipart and rejects cross-site multipart with a safe 403", async () => {
    const allowed = await SELF.fetch(multipartRequest(origin, "same-origin"));
    expect(allowed.status).toBe(200);

    const rejected = await SELF.fetch(multipartRequest("https://attacker.example", "cross-site"));
    expect(rejected.status).toBe(403);
    const body = await rejected.json<{ error: { code: string; requestId: string } }>();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(rejected.headers.get("X-Request-ID")).toBe(body.error.requestId);
  });
});
