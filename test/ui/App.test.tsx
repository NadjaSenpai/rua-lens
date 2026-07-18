import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "../../src/client/App";
import { ApiProvider } from "../../src/client/api/context";
import { createTestApi } from "../support/test-api";

function renderApp(path = "/", api = createTestApi()) {
  render(
    <ApiProvider api={api}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ApiProvider>,
  );
}

describe("RUA Lens client routes", () => {
  it("renders the dashboard route directly", async () => {
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "RUA Lens" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "DMARCレポートを安全に読み解く" })).toBeInTheDocument();
  });

  it("renders the reports route directly", async () => {
    renderApp("/reports");
    expect(await screen.findByRole("heading", { name: "レポート" })).toBeInTheDocument();
  });

  it("renders the report detail route directly", async () => {
    renderApp("/reports/report-123", createTestApi({
      getReport: async () => ({
        id: "report-123",
        orgName: "Example Reporter",
        externalReportId: "external-123",
        domain: "example.com",
        periodBegin: "2023-11-14T00:00:00.000Z",
        periodEnd: "2023-11-15T00:00:00.000Z",
        policy: { p: "none", sp: null, pct: 100, adkim: "r", aspf: "r" },
        importedAt: "2023-11-16T00:00:00.000Z",
        importedBy: "developer@example.com",
        records: [],
      }),
    }));
    expect(await screen.findByRole("heading", { name: "Example Reporter" })).toBeInTheDocument();
    expect(screen.getByText("external-123")).toBeInTheDocument();
  });
});
