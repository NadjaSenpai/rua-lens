import { beforeEach } from "vitest";
import { applyTestMigrations, clearTestDatabase } from "./d1";

beforeEach(async () => {
  await applyTestMigrations();
  await clearTestDatabase();
});
