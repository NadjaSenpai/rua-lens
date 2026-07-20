import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm exec -- wrangler d1 migrations apply DB --local && npm run dev -- --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "cp -n .dev.vars.e2e-nonadmin.example .dev.vars.e2e-nonadmin && CLOUDFLARE_ENV=e2e-nonadmin npm run dev -- --host 127.0.0.1 --port 4175",
      url: "http://127.0.0.1:4175",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      testIgnore: /non-admin\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4173" },
    },
    {
      name: "chromium-non-admin",
      testMatch: /non-admin\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4175" },
    },
  ],
});
