import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JSONWebKeySet,
} from "jose";
import { verifyAccessTokenWithKeyResolver } from "../../src/server/auth/access-token-verifier";
import type { AccessConfig } from "../../src/server/env";

const ALGORITHM = "RS256";
const KEY_ID = "rua-lens-test-key";

export async function createAccessJwtFixture(config: AccessConfig) {
  const { publicKey, privateKey } = await generateKeyPair(ALGORITHM, {
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = ALGORITHM;
  publicJwk.kid = KEY_ID;

  const keySet: JSONWebKeySet = { keys: [publicJwk] };
  const verifier = (
    token: string,
    accessConfig: AccessConfig,
  ) =>
    verifyAccessTokenWithKeyResolver(
      token,
      accessConfig,
      createLocalJWKSet(keySet),
    );

  async function sign(options?: {
    audience?: string;
    email?: string;
    expiresAt?: string | number;
    issuer?: string;
  }): Promise<string> {
    return new SignJWT({ email: options?.email ?? "User@Example.com" })
      .setProtectedHeader({ alg: ALGORITHM, kid: KEY_ID })
      .setIssuedAt()
      .setIssuer(options?.issuer ?? config.teamDomain)
      .setAudience(options?.audience ?? config.audience)
      .setExpirationTime(options?.expiresAt ?? "5m")
      .sign(privateKey);
  }

  return { sign, verifier };
}
