import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "../../src/client/App";
import { ApiProvider } from "../../src/client/api/context";
import { createTestApi } from "../support/test-api";

const report = {
  id: "report-1",
  orgName: "Example Reporter",
  externalReportId: "external-1",
  domain: "example.com",
  periodBegin: "2023-11-14T18:30:00.000Z",
  periodEnd: "2023-11-15T18:30:00.000Z",
  totalMessages: 42,
  dmarcPassRate: 0.75,
  importedAt: "2023-11-16T18:30:00.000Z",
  importedBy: "analyst@example.com",
};

function renderWithApi(api: ReturnType<typeof createTestApi>) {
  render(
    <ApiProvider api={api}>
      <MemoryRouter initialEntries={["/reports"]}>
        <App />
      </MemoryRouter>
    </ApiProvider>,
  );
}

describe("ReportsPage", () => {
  it("shows report data in the selected display timezone", async () => {
    const api = createTestApi({
      listReports: async () => ({ items: [report], page: 1, pageSize: 25, total: 1 }),
    });
    const user = userEvent.setup();
    renderWithApi(api);

    expect(await screen.findByRole("heading", { name: "レポート" })).toBeInTheDocument();
    expect(await screen.findByText("Example Reporter")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("75.0%")).toBeInTheDocument();
    expect(screen.getByText("analyst@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "詳細を確認" })).toHaveAttribute("href", "/reports/report-1");

    const reportRow = screen.getByRole("row", { name: /Example Reporter/ });
    expect(reportRow).toHaveTextContent("2023/11/14 - 2023/11/15");
    expect(reportRow).toHaveTextContent("2023/11/16 18:30");

    await user.click(screen.getByRole("radio", { name: "JST" }));

    expect(reportRow).toHaveTextContent("2023/11/15 - 2023/11/16");
    expect(reportRow).toHaveTextContent("2023/11/17 3:30");
  });

  it("updates API query from filters and pagination", async () => {
    const api = createTestApi({
      listReports: async (query) => ({
        items: [report],
        page: query.page ?? 1,
        pageSize: 25,
        total: 30,
      }),
    });
    const user = userEvent.setup();
    renderWithApi(api);
    await screen.findByText("Example Reporter");

    await user.click(screen.getByRole("radio", { name: "JST" }));
    await user.type(screen.getByLabelText("対象ドメイン"), "example.com");
    await user.type(screen.getByLabelText("開始日"), "2023-11-14");
    await user.type(screen.getByLabelText("終了日"), "2023-11-15");
    await user.click(screen.getByRole("button", { name: "条件を適用" }));

    await waitFor(() => expect(api.calls.reportLists.at(-1)).toEqual({
      domain: "example.com",
      from: "2023-11-14",
      to: "2023-11-15",
      page: 1,
      pageSize: 25,
    }));

    await user.click(screen.getByRole("button", { name: "次のページ" }));
    await waitFor(() => expect(api.calls.reportLists.at(-1)?.page).toBe(2));
  });
});
