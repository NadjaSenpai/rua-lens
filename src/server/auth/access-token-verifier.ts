import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import type { AccessConfig } from "../env";
import { UnauthorizedError } from "../errors";
import type { VerifiedAccessIdentity } from "./principal";

export type AccessTokenVerifier = (
  token: string,
  config: AccessConfig,
) => Promise<VerifiedAccessIdentity>;

export async function verifyAccessTokenWithKeyResolver(
  token: string,
  config: AccessConfig,
  keyResolver: JWTVerifyGetKey,
): Promise<VerifiedAccessIdentity> {
  try {
    const { payload } = await jwtVerify(token, keyResolver, {
      issuer: config.teamDomain,
      audience: config.audience,
    });

    if (typeof payload.email !== "string" || !payload.email.trim()) {
      throw new UnauthorizedError();
    }

    return { email: payload.email };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError({ cause: error });
  }
}

const remoteKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export const verifyRemoteAccessToken: AccessTokenVerifier = async (
  token,
  config,
) => {
  let keySet = remoteKeySets.get(config.teamDomain);
  if (!keySet) {
    keySet = createRemoteJWKSet(
      new URL("/cdn-cgi/access/certs", config.teamDomain),
    );
    remoteKeySets.set(config.teamDomain, keySet);
  }

  return verifyAccessTokenWithKeyResolver(token, config, keySet);
};
