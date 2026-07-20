import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/session", () => {
  it("returns only the development principal email and administrator status", async () => {
    const response = await SELF.fetch("https://example.com/api/session");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      email: "developer@example.com",
      isAdmin: true,
      storageMode: "d1",
    });
  });
});
