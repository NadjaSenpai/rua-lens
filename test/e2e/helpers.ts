import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

export const reportFixture = fileURLToPath(new URL("./fixtures/report-example.xml", import.meta.url));

export function resetDatabase(): void {
  execFileSync("node", ["scripts/reset-local-d1.mjs"], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    stdio: "ignore",
  });
}

export async function openUpload(page: Page) {
  await page.locator("header").getByRole("button", { name: "レポートをアップロード" }).click();
  const dialog = page.getByRole("dialog", { name: "DMARCレポートをアップロード" });
  await dialog.waitFor();
  return dialog;
}

type InputFiles =
  | string
  | string[]
  | { name: string; mimeType: string; buffer: Buffer }
  | Array<{ name: string; mimeType: string; buffer: Buffer }>;

export async function submitFiles(page: Page, files: InputFiles) {
  const dialog = await openUpload(page);
  await dialog.getByLabel("レポートファイル").setInputFiles(files);
  await dialog.getByRole("button", { name: "アップロードを実行" }).click();
  await dialog.getByRole("heading", { name: "処理結果" }).waitFor();
  return dialog;
}
