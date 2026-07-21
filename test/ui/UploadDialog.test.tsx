import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "../../src/client/App";
import { ApiProvider } from "../../src/client/api/context";
import { ApiError } from "../../src/client/api/types";
import { UPLOAD_LIMITS } from "../../src/shared/api-contract";
import { createTestApi } from "../support/test-api";

function sizedFile(name: string, size: number): File {
  const file = new File(["fixture"], name, { type: "application/octet-stream" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function renderWithApi(api: ReturnType<typeof createTestApi>) {
  render(
    <ApiProvider api={api}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </ApiProvider>,
  );
}

describe("UploadDialog", () => {
  it("opens from the shared action, focuses the file input, and returns focus when closed", async () => {
    const user = userEvent.setup();
    renderWithApi(createTestApi());
    const openButton = (await screen.findAllByRole("button", { name: "レポートをアップロード" }))[0];

    await user.click(openButton);

    expect(screen.getByRole("dialog", { name: "DMARCレポートをアップロード" })).toBeInTheDocument();
    expect(screen.getByLabelText("レポートファイル")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(openButton).toHaveFocus();
  });

  it("uploads multiple files, displays partial results, and requests dashboard refresh", async () => {
    const api = createTestApi({
      upload: async () => ({
        requestId: "upload-request",
        summary: { inserted: 1, duplicate: 1, rejected: 1 },
        results: [
          { sourceFileName: "one.xml", entryName: null, status: "inserted", reportId: "one" },
          { sourceFileName: "two.xml.gz", entryName: null, status: "duplicate", reportId: "two" },
          {
            sourceFileName: "bundle.zip",
            entryName: "invalid.xml",
            status: "rejected",
            code: "INVALID_XML",
            message: "DMARC aggregate reportとして読み取れませんでした。",
          },
        ],
      }),
    });
    const user = userEvent.setup();
    renderWithApi(api);
    await user.click((await screen.findAllByRole("button", { name: "レポートをアップロード" }))[0]);
    const input = screen.getByLabelText("レポートファイル");
    const files = [
      new File(["one"], "one.xml"),
      new File(["two"], "two.xml.gz"),
      new File(["three"], "bundle.zip"),
    ];

    await user.upload(input, files);
    await user.click(screen.getByRole("button", { name: "アップロードを実行" }));

    expect(await screen.findByText("登録")).toBeInTheDocument();
    expect(screen.getByText("登録済み")).toBeInTheDocument();
    expect(screen.getByText("失敗")).toBeInTheDocument();
    expect(screen.getByText("bundle.zip / invalid.xml")).toBeInTheDocument();
    expect(api.calls.uploads[0]).toEqual(files);
    await waitFor(() => expect(api.calls.dashboards).toHaveLength(2));
  });

  it("checks file count, per-file size, and total size before sending", async () => {
    const user = userEvent.setup();
    const api = createTestApi();
    renderWithApi(api);
    await user.click((await screen.findAllByRole("button", { name: "レポートをアップロード" }))[0]);
    const input = screen.getByLabelText("レポートファイル");

    await user.upload(
      input,
      Array.from({ length: UPLOAD_LIMITS.maxFiles + 1 }, (_, index) => new File(["x"], `${index}.xml`)),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("20ファイルまで");

    await user.upload(input, [sizedFile("large.xml", UPLOAD_LIMITS.maxInputBytesPerFile + 1)]);
    expect(screen.getByRole("alert")).toHaveTextContent("1ファイルあたり10 MiBまで");

    await user.upload(input, [
      sizedFile("a.xml", 10 * 1024 * 1024),
      sizedFile("b.xml", 10 * 1024 * 1024),
      sizedFile("c.xml", 5 * 1024 * 1024 + 1),
    ]);
    expect(screen.getByRole("alert")).toHaveTextContent("25 MiBまで");
    expect(api.calls.uploads).toEqual([]);
  });

  it("keeps the selected files after an API error and allows retry", async () => {
    let attempts = 0;
    const api = createTestApi({
      upload: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new ApiError(500, "INFRASTRUCTURE_ERROR", "アップロードできませんでした。", "upload-error");
        }
        return {
          requestId: "upload-success",
          summary: { inserted: 1, duplicate: 0, rejected: 0 },
          results: [{ sourceFileName: "report.xml", entryName: null, status: "inserted", reportId: "one" }],
        };
      },
    });
    const user = userEvent.setup();
    renderWithApi(api);
    await user.click((await screen.findAllByRole("button", { name: "レポートをアップロード" }))[0]);
    await user.upload(screen.getByLabelText("レポートファイル"), new File(["report"], "report.xml"));

    await user.click(screen.getByRole("button", { name: "アップロードを実行" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("upload-error");
    expect(screen.getByText("report.xml")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "アップロードを実行" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(attempts).toBe(2);
  });
});
