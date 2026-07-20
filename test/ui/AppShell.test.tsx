import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "../../src/client/App";
import { ApiProvider } from "../../src/client/api/context";
import { ApiError } from "../../src/client/api/types";
import { createTestApi } from "../support/test-api";
import { setSystemColorScheme } from "./setup";

function renderWithApi(api: ReturnType<typeof createTestApi>) {
  render(
    <ApiProvider api={api}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </ApiProvider>,
  );
}

describe("AppShell", () => {
  it("shows product navigation, upload action, authenticated email, and display timezone controls", async () => {
    const user = userEvent.setup();
    renderWithApi(createTestApi({
      getSession: async () => ({ email: "analyst@example.com", isAdmin: false }),
    }));

    expect(await screen.findByRole("heading", { name: "RUA Lens" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "本文へ移動" })).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("navigation", { name: "メインナビゲーション" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ダッシュボード" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "レポート" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "レポートをアップロード" })).not.toHaveLength(0);
    expect(screen.getByText("analyst@example.com")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "時刻表示" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "UTC" })).toBeChecked();
    expect(screen.getByRole("group", { name: "表示テーマ" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "自動" })).toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    await user.click(screen.getByRole("radio", { name: "JST" }));

    expect(screen.getByRole("radio", { name: "JST" })).toBeChecked();
    expect(localStorage.getItem("rua-lens.display-time-zone")).toBe("Asia/Tokyo");
    expect(screen.getByText("表示: JST / 検索・日別集計: UTC")).toBeInTheDocument();
  });

  it("restores the persisted display timezone", async () => {
    localStorage.setItem("rua-lens.display-time-zone", "Asia/Tokyo");
    renderWithApi(createTestApi());

    expect(await screen.findByRole("radio", { name: "JST" })).toBeChecked();
    expect(screen.getByText("表示: JST / 検索・日別集計: UTC")).toBeInTheDocument();
  });

  it("restores a persisted dark theme", async () => {
    localStorage.setItem("rua-lens.theme-preference", "dark");
    renderWithApi(createTestApi());

    expect(await screen.findByRole("radio", { name: "ダーク" })).toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByText("現在: ダーク")).toBeInTheDocument();
  });

  it("follows system color scheme changes while automatic theme is selected", async () => {
    renderWithApi(createTestApi());

    expect(await screen.findByRole("radio", { name: "自動" })).toBeChecked();
    act(() => setSystemColorScheme("dark"));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByText("現在: ダーク")).toBeInTheDocument();
  });

  it("keeps a manual theme when the system color scheme changes", async () => {
    const user = userEvent.setup();
    renderWithApi(createTestApi());
    await screen.findByRole("radio", { name: "自動" });

    await user.click(screen.getByRole("radio", { name: "ライト" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("rua-lens.theme-preference")).toBe("light");

    act(() => setSystemColorScheme("dark"));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("shows a request ID and retries a failed session request", async () => {
    let attempts = 0;
    const api = createTestApi({
      getSession: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new ApiError(500, "INFRASTRUCTURE_ERROR", "セッションを確認できませんでした。", "request-123");
        }
        return { email: "analyst@example.com", isAdmin: false };
      },
    });
    const user = userEvent.setup();
    renderWithApi(api);

    expect(await screen.findByRole("alert")).toHaveTextContent("Request ID: request-123");
    await user.click(screen.getByRole("button", { name: "再試行" }));

    expect(await screen.findByText("analyst@example.com")).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});
