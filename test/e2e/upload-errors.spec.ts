import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { reportFixture, resetDatabase, submitFiles } from "./helpers";

test.beforeEach(() => {
  resetDatabase();
});

test("shows a duplicate result when the same report is uploaded again", async ({ page }) => {
  await page.goto("/");
  const first = await submitFiles(page, reportFixture);
  await expect(first.getByText("登録", { exact: true })).toBeVisible();
  await first.getByRole("button", { name: "閉じる" }).click();
  await expect(first).toBeHidden();

  const second = await submitFiles(page, reportFixture);
  await expect(second.getByText("登録済み", { exact: true })).toBeVisible();
  await expect(second).toContainText("登録済み 1件");
});

test("keeps partial success when valid and invalid XML are uploaded together", async ({ page }) => {
  await page.goto("/");
  const dialog = await submitFiles(page, [
    {
      name: "report-example.xml",
      mimeType: "application/xml",
      buffer: readFileSync(reportFixture),
    },
    {
      name: "invalid.xml",
      mimeType: "application/xml",
      buffer: Buffer.from("<feedback />"),
    },
  ]);

  await expect(dialog.getByText("登録", { exact: true })).toBeVisible();
  await expect(dialog.getByText("失敗", { exact: true })).toBeVisible();
  await expect(dialog).toContainText("DMARC aggregate reportではありません。");
  await dialog.getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByRole("region", { name: "集計サマリー" })).toContainText("4");
});
