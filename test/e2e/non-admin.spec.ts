import { expect, test } from "@playwright/test";
import { reportFixture, resetDatabase, submitFiles } from "./helpers";

test.beforeEach(() => {
  resetDatabase();
});

test("hides deletion and rejects a direct delete for a non-administrator", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("viewer@example.com")).toBeVisible();

  const upload = await submitFiles(page, reportFixture);
  await expect(upload.getByText("登録", { exact: true })).toBeVisible();
  await upload.getByRole("button", { name: "閉じる" }).click();

  await page.locator('nav[aria-label="メインナビゲーション"]').getByRole("link", { name: "レポート", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "E2E Reporter" });
  await row.getByRole("link", { name: "詳細を確認" }).click();
  await expect(page.getByRole("heading", { name: "E2E Reporter", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "このレポートを削除" })).toHaveCount(0);

  const reportId = decodeURIComponent(new URL(page.url()).pathname.split("/").at(-1) ?? "");
  const response = await page.request.delete(`/api/reports/${encodeURIComponent(reportId)}`, {
    headers: { Origin: "http://127.0.0.1:4175" },
  });

  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
  await page.reload();
  await expect(page.getByRole("heading", { name: "E2E Reporter", exact: true })).toBeVisible();
});
