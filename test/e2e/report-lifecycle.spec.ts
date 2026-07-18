import { expect, test } from "@playwright/test";
import { reportFixture, resetDatabase, submitFiles } from "./helpers";

test.beforeEach(() => {
  resetDatabase();
});

test("uploads a report, renders analysis, survives direct navigation, and deletes it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "DMARCレポートを安全に読み解く" })).toBeVisible();

  const upload = await submitFiles(page, reportFixture);
  await expect(upload.getByText("登録", { exact: true })).toBeVisible();
  await upload.getByRole("button", { name: "閉じる" }).click();

  const summary = page.getByRole("region", { name: "集計サマリー" });
  await expect(summary).toContainText("総メッセージ数");
  await expect(summary).toContainText("4");
  await expect(page.getByRole("figure", { name: "DMARC成功・失敗の日別推移" })).toBeVisible();

  await page.locator('nav[aria-label="メインナビゲーション"]').getByRole("link", { name: "レポート", exact: true }).click();
  await expect(page.locator("caption")).toHaveText("1件のレポート");
  const row = page.getByRole("row").filter({ hasText: "E2E Reporter" });
  await row.getByRole("link", { name: "詳細を確認" }).click();
  await expect(page.getByRole("heading", { name: "E2E Reporter", exact: true })).toBeVisible();
  await expect(page.getByText("192.0.2.10")).toBeVisible();

  const detailUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(detailUrl);
  await expect(page.getByRole("heading", { name: "E2E Reporter", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "このレポートを削除" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "レポートを削除" });
  await expect(deleteDialog).toContainText("E2E Reporter");
  await deleteDialog.getByRole("button", { name: "レポートを削除" }).click();

  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.getByRole("heading", { name: "条件に一致するレポートはありません" })).toBeVisible();
});
