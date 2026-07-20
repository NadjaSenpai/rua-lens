import { createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";
import { authenticateRequest } from "../../src/server/auth/authenticate";
import { verifyAccessTokenWithKeyResolver } from "../../src/server/auth/access-token-verifier";
import { parseAccessConfig } from "../../src/server/env";
import type { AccessConfig, RuntimeEnv } from "../../src/server/env";
import { createAccessJwtFixture } from "../support/access-jwt";

const accessConfig: AccessConfig = {
  teamDomain: "https://example.cloudflareaccess.com",
  audience: "test-audience",
  adminEmails: ["admin@example.com"],
};

function envWith(values: Partial<RuntimeEnv>): RuntimeEnv {
  return {
    AUTH_MODE: "access",
    ACCESS_TEAM_DOMAIN: accessConfig.teamDomain,
    ACCESS_AUD: accessConfig.audience,
    ADMIN_EMAILS: " Admin@Example.com , second@example.com ",
    DEV_USER_EMAIL: "developer@example.com",
    DEV_ADMIN_EMAILS: "developer@example.com",
    ...values,
  } as RuntimeEnv;
}

describe("Cloudflare Access authentication", () => {
  it("verifies a signed token and normalizes administrator email matching", async () => {
    const fixture = await createAccessJwtFixture(accessConfig);
    const token = await fixture.sign({ email: "ADMIN@EXAMPLE.COM" });
    const request = new Request("https://example.com/api/session", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    });

    await expect(
      authenticateRequest(request, envWith({}), fixture.verifier),
    ).resolves.toEqual({
      email: "admin@example.com",
      isAdmin: true,
    });
  });

  it.each([
    ["issuer", { issuer: "https://other.example" }],
    ["audience", { audience: "other-audience" }],
    ["expiry", { expiresAt: 0 }],
  ])("rejects a token with an invalid %s", async (_name, options) => {
    const fixture = await createAccessJwtFixture(accessConfig);
    const token = await fixture.sign(options);

    await expect(
      fixture.verifier(token, accessConfig),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });

  it("rejects a token signed by an unknown key", async () => {
    const fixture = await createAccessJwtFixture(accessConfig);
    const token = await fixture.sign();
    const { publicKey } = await generateKeyPair("RS256", { extractable: true });
    const jwk = await exportJWK(publicKey);
    jwk.alg = "RS256";
    jwk.kid = "unknown";

    await expect(
      verifyAccessTokenWithKeyResolver(
        token,
        accessConfig,
        createLocalJWKSet({ keys: [jwk] }),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });

  it("fails closed when the Access token header is missing", async () => {
    await expect(
      authenticateRequest(
        new Request("https://example.com/api/session"),
        envWith({}),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
  });

  it.each(["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "ADMIN_EMAILS"] as const)(
    "fails closed when %s is missing",
    (key) => {
      expect(() => parseAccessConfig(envWith({ [key]: "" }))).toThrowError(
        expect.objectContaining({ code: "CONFIGURATION_ERROR" }),
      );
    },
  );

  it("rejects a non-HTTPS or path-bearing Access team domain", () => {
    expect(() =>
      parseAccessConfig(envWith({ ACCESS_TEAM_DOMAIN: "http://example.com" })),
    ).toThrow();
    expect(() =>
      parseAccessConfig(
        envWith({ ACCESS_TEAM_DOMAIN: "https://example.com/path" }),
      ),
    ).toThrow();
  });

  it("injects a development principal only when dev mode is explicit", async () => {
    const request = new Request("https://example.com/api/session");

    await expect(
      authenticateRequest(request, envWith({ AUTH_MODE: "dev" })),
    ).resolves.toEqual({
      email: "developer@example.com",
      isAdmin: true,
    });

    await expect(
      authenticateRequest(request, envWith({ AUTH_MODE: "unexpected" })),
    ).rejects.toMatchObject({ code: "CONFIGURATION_ERROR", status: 500 });
  });
});
