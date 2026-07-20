import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Worker API fallback", () => {
  it("returns a JSON 404 with a request ID for an unknown API route", async () => {
    const response = await SELF.fetch("https://example.com/api/unknown");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = await response.json<{
      error: { code: string; message: string; requestId: string };
    }>();

    expect(body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "指定されたAPIは見つかりませんでした。",
    });
    expect(body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("X-Request-ID")).toBe(body.error.requestId);
  });
});
