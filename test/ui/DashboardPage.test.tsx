import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "../../src/client/App";
import { ApiProvider } from "../../src/client/api/context";
import { ApiError, type ReportScopeQuery } from "../../src/client/api/types";
import type { DashboardResponse } from "../../src/shared/api-contract";
import { createTestApi, emptyDashboard } from "../support/test-api";

const dashboard: DashboardResponse = {
  summary: {
    totalMessages: 10,
    dmarcPassMessages: 6,
    dmarcPassRate: 0.6,
    passMessages: 4,
    reviewMessages: 3,
    failMessages: 3,
  },
  dailyTrend: [
    {
      date: "2023-11-14",
      totalMessages: 10,
      dmarcPassMessages: 6,
      dmarcFailMessages: 4,
      passMessages: 4,
      reviewMessages: 3,
      failMessages: 3,
    },
  ],
  dispositions: [
    { disposition: "none", totalMessages: 7 },
    { disposition: "quarantine", totalMessages: 3 },
  ],
  failureSources: [{ sourceIp: "192.0.2.10", totalMessages: 3 }],
  domains: ["example.com", "other.example"],
  recentReports: [
    {
      id: "report-1",
      orgName: "Example Reporter",
      externalReportId: "external-1",
      domain: "example.com",
      periodBegin: "2023-11-14T18:30:00.000Z",
      periodEnd: "2023-11-15T18:30:00.000Z",
      totalMessages: 10,
      dmarcPassRate: 0.6,
      importedAt: "2023-11-16T02:00:00.000Z",
      importedBy: "developer@example.com",
    },
  ],
};

function renderWithApi(api: ReturnType<typeof createTestApi>) {
  render(
    <ApiProvider api={api}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </ApiProvider>,
  );
}

describe("DashboardPage", () => {
  it("explains accepted formats and storage behavior in the empty state", async () => {
    renderWithApi(createTestApi());

    expect(await screen.findByRole("heading", { name: "DMARCレポートを安全に読み解く" })).toBeInTheDocument();
    expect(screen.getByText(/XML、gzip、ZIPをWorker内で解析/)).toBeInTheDocument();
    expect(screen.getByText(/元ファイルは保存しません/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "アップロード" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "レポートをアップロード" })).toHaveLength(1);
  });

  it("distinguishes loading and retries after an API error", async () => {
    let attempts = 0;
    const api = createTestApi({
      getDashboard: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new ApiError(500, "INFRASTRUCTURE_ERROR", "集計を読み込めませんでした。", "dashboard-request");
        }
        return emptyDashboard();
      },
    });
    const user = userEvent.setup();
    renderWithApi(api);

    expect(await screen.findByRole("alert")).toHaveTextContent("dashboard-request");
    await user.click(screen.getByRole("button", { name: "再試行" }));

    expect(await screen.findByRole("heading", { name: "DMARCレポートを安全に読み解く" })).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("shows summary values, accessible trend data, dispositions, failures, and recent reports", async () => {
    const user = userEvent.setup();
    renderWithApi(createTestApi({ getDashboard: async () => dashboard }));

    expect(await screen.findByRole("heading", { name: "ダッシュボード" })).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "集計サマリー" });
    expect(within(summary).getByText("10")).toBeInTheDocument();
    expect(within(summary).getByText("60.0%")).toBeInTheDocument();
    const statusItems = within(summary).getAllByRole("listitem");
    expect(statusItems[0]).toHaveTextContent("正常 4");
    expect(statusItems[1]).toHaveTextContent("要確認 3");
    expect(statusItems[2]).toHaveTextContent("失敗 3");
    expect(screen.getByRole("figure", { name: "DMARC成功・失敗の日別推移" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "日別データ" })).toBeInTheDocument();
    const dispositions = screen.getByRole("region", { name: "Disposition内訳" });
    expect(dispositions).toHaveTextContent("quarantine");
    expect(within(dispositions).getByText("30.0%")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "失敗送信元IP" })).toHaveTextContent("192.0.2.10");
    expect(screen.getByRole("table", { name: "直近のレポート" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Example Reporter" })).toHaveAttribute("href", "/reports/report-1");
    expect(screen.getByText("日付条件: UTC（終了日を含む）")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "JST" }));

    expect(screen.getByText("2023/11/15 - 2023/11/16")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "日別データ" })).toHaveTextContent("2023-11-14");
  });

  it("updates domain and inclusive date filters without adding a day in the client", async () => {
    const api = createTestApi({ getDashboard: async () => dashboard });
    const user = userEvent.setup();
    renderWithApi(api);
    await screen.findByRole("heading", { name: "ダッシュボード" });

    await user.click(screen.getByRole("radio", { name: "JST" }));
    await user.selectOptions(screen.getByLabelText("対象ドメイン"), "example.com");
    await user.type(screen.getByLabelText("開始日"), "2023-11-14");
    await user.type(screen.getByLabelText("終了日"), "2023-11-15");
    await user.click(screen.getByRole("button", { name: "条件を適用" }));

    await waitFor(() => expect(api.calls.dashboards.at(-1)).toEqual({
      domain: "example.com",
      from: "2023-11-14",
      to: "2023-11-15",
    }));
  });

  it("does not render empty charts when filters have no matching data", async () => {
    const api = createTestApi({
      getDashboard: async (query: ReportScopeQuery) => query.domain ? emptyDashboard() : dashboard,
    });
    const user = userEvent.setup();
    renderWithApi(api);
    await screen.findByRole("heading", { name: "ダッシュボード" });

    await user.selectOptions(screen.getByLabelText("対象ドメイン"), "other.example");
    await user.click(screen.getByRole("button", { name: "条件を適用" }));

    expect(await screen.findByRole("heading", { name: "条件に一致するレポートはありません" })).toBeInTheDocument();
    expect(screen.queryByRole("figure", { name: "DMARC成功・失敗の日別推移" })).not.toBeInTheDocument();
  });

  it("keeps selected filters after a failed refresh", async () => {
    const api = createTestApi({
      getDashboard: async (query) => {
        if (query.domain) {
          throw new ApiError(500, "INFRASTRUCTURE_ERROR", "集計できませんでした。", "filter-request");
        }
        return dashboard;
      },
    });
    const user = userEvent.setup();
    renderWithApi(api);
    await screen.findByRole("heading", { name: "ダッシュボード" });

    await user.selectOptions(screen.getByLabelText("対象ドメイン"), "example.com");
    await user.click(screen.getByRole("button", { name: "条件を適用" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("filter-request");
    expect(screen.getByLabelText("対象ドメイン")).toHaveValue("example.com");
    expect(screen.queryByRole("region", { name: "集計サマリー" })).not.toBeInTheDocument();
  });
});
