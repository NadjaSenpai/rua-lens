import {
  parseAccessConfig,
  parseDevAuthConfig,
  type RuntimeEnv,
} from "../env";
import { ConfigurationError, UnauthorizedError } from "../errors";
import {
  verifyRemoteAccessToken,
  type AccessTokenVerifier,
} from "./access-token-verifier";
import { createPrincipal, type Principal } from "./principal";

export async function authenticateRequest(
  request: Request,
  env: RuntimeEnv,
  verifier: AccessTokenVerifier = verifyRemoteAccessToken,
): Promise<Principal> {
  if (env.AUTH_MODE === "dev") {
    const config = parseDevAuthConfig(env);
    return createPrincipal(config.userEmail, config.adminEmails);
  }

  if (env.AUTH_MODE !== "access") {
    throw new ConfigurationError();
  }

  const config = parseAccessConfig(env);
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    throw new UnauthorizedError();
  }

  const identity = await verifier(token, config);
  return createPrincipal(identity.email, config.adminEmails);
}
