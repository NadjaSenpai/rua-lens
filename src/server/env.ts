import type { StorageMode } from "../shared/api-contract";
import { ConfigurationError } from "./errors";
import { parseEmailList } from "./auth/principal";

export type RuntimeEnv = Omit<
  Env,
  "AUTH_MODE" | "ACCESS_TEAM_DOMAIN" | "ACCESS_AUD" | "ADMIN_EMAILS"
> & {
  AUTH_MODE: "access" | "dev" | string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
  DEV_USER_EMAIL?: string;
  DEV_ADMIN_EMAILS?: string;
  STORAGE_MODE?: string;
};

export type AccessConfig = {
  teamDomain: string;
  audience: string;
  adminEmails: readonly string[];
};

export type DevAuthConfig = {
  userEmail: string;
  adminEmails: readonly string[];
};

export type RequestLogState = {
  successes: number;
  skipped: number;
  failures: number;
  errorCode: string | null;
};

export type ServerVariables = {
  principal: import("./auth/principal").Principal;
  requestId: string;
  requestLog: RequestLogState;
  storageMode: StorageMode;
};

export type ServerEnv = {
  Bindings: RuntimeEnv;
  Variables: ServerVariables;
};

function required(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new ConfigurationError();
  }
  return normalized;
}

export function parseAccessConfig(env: RuntimeEnv): AccessConfig {
  const rawTeamDomain = required(env.ACCESS_TEAM_DOMAIN);
  const audience = required(env.ACCESS_AUD);
  const adminEmails = parseEmailList(required(env.ADMIN_EMAILS));

  let teamDomain: URL;
  try {
    teamDomain = new URL(rawTeamDomain);
  } catch (error) {
    throw new ConfigurationError({ cause: error });
  }

  if (
    teamDomain.protocol !== "https:" ||
    teamDomain.username ||
    teamDomain.password ||
    teamDomain.search ||
    teamDomain.hash ||
    (teamDomain.pathname !== "/" && teamDomain.pathname !== "")
  ) {
    throw new ConfigurationError();
  }

  if (adminEmails.length === 0) {
    throw new ConfigurationError();
  }

  return {
    teamDomain: teamDomain.origin,
    audience,
    adminEmails,
  };
}

export function parseDevAuthConfig(env: RuntimeEnv): DevAuthConfig {
  const userEmail = required(env.DEV_USER_EMAIL);
  const adminEmails = parseEmailList(env.DEV_ADMIN_EMAILS);

  return { userEmail, adminEmails };
}

export function parseStorageMode(env: RuntimeEnv): StorageMode {
  const raw = (env.STORAGE_MODE ?? "d1").toLowerCase();
  if (raw !== "d1" && raw !== "stateless") {
    throw new ConfigurationError();
  }
  return raw;
}
