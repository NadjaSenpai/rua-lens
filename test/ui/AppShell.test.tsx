import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "../../src/client/App";
import { ApiProvider } from "../../src/client/api/context";
import { ApiError } from "../../src/client/api/types";
import { createTestApi } from "../support/test-api";

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
  it("shows product navigation, upload action, and the authenticated email", async () => {
    renderWithApi(createTestApi({
      getSession: async () => ({ email: "analyst@example.com", isAdmin: false }),
    }));

    expect(await screen.findByRole("heading", { name: "RUA Lens" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "メインナビゲーション" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ダッシュボード" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "レポート" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "レポートをアップロード" })).not.toHaveLength(0);
    expect(screen.getByText("analyst@example.com")).toBeInTheDocument();
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
