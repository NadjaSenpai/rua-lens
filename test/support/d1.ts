import { applyD1Migrations, env } from "cloudflare:test";

export async function applyTestMigrations(): Promise<void> {
  const testEnv = env as typeof env & {
    TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
  };
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
}

export async function clearTestDatabase(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM policy_overrides"),
    env.DB.prepare("DELETE FROM spf_results"),
    env.DB.prepare("DELETE FROM dkim_results"),
    env.DB.prepare("DELETE FROM report_records"),
    env.DB.prepare("DELETE FROM reports"),
  ]);
}
