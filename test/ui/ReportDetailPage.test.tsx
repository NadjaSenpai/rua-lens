import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "../../src/client/App";
import { ApiProvider } from "../../src/client/api/context";
import { ApiError } from "../../src/client/api/types";
import type { ReportDetail } from "../../src/shared/api-contract";
import { createTestApi } from "../support/test-api";

const detail: ReportDetail = {
  id: "report-1",
  orgName: "Example Reporter",
  externalReportId: "external-1",
  domain: "example.com",
  periodBegin: "2023-11-14T18:30:00.000Z",
  periodEnd: "2023-11-15T18:30:00.000Z",
  policy: { p: "reject", sp: null, pct: 100, adkim: "r", aspf: "s" },
  importedAt: "2023-11-16T18:30:00.000Z",
  importedBy: "analyst@example.com",
  records: [
    {
      sourceIp: "192.0.2.10",
      messageCount: 4,
      disposition: "none",
      classification: "review",
      dmarcPass: true,
      identifiers: {
        headerFrom: "example.com",
        envelopeFrom: "mailer.example.com",
        envelopeTo: null,
      },
      policyEvaluated: {
        dkim: "pass",
        spf: "fail",
        overrides: [{ type: "forwarded", comment: "forwarding service" }],
      },
      dkimResults: [
        { domain: "example.com", selector: "mail", result: "pass", humanResult: "aligned" },
      ],
      spfResults: [
        { domain: "mailer.example.com", scope: "mfrom", result: "pass" },
      ],
    },
  ],
};

function renderWithApi(api: ReturnType<typeof createTestApi>) {
  render(
    <ApiProvider api={api}>
      <MemoryRouter initialEntries={["/reports/report-1"]}>
        <App />
      </MemoryRouter>
    </ApiProvider>,
  );
}

describe("ReportDetailPage", () => {
  it("shows policy, record identifiers, authentication results, and overrides", async () => {
    renderWithApi(createTestApi({ getReport: async () => detail }));

    expect(await screen.findByRole("heading", { name: "Example Reporter" })).toBeInTheDocument();
    expect(screen.getByText("external-1")).toBeInTheDocument();
    const policy = screen.getByRole("region", { name: "公開DMARCポリシー" });
    expect(within(policy).getByText("reject", { selector: "dd" })).toBeInTheDocument();
    expect(within(policy).getByText("pを継承", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("192.0.2.10")).toBeInTheDocument();
    expect(screen.getByText("mailer.example.com")).toBeInTheDocument();
    expect(screen.getByText(/selector: mail/)).toBeInTheDocument();
    expect(screen.getByText(/scope: mfrom/)).toBeInTheDocument();
    expect(screen.getByText("forwarded: forwarding service")).toBeInTheDocument();
  });

  it("does not show deletion to a regular user", async () => {
    renderWithApi(createTestApi({ getReport: async () => detail }));

    await screen.findByRole("heading", { name: "Example Reporter" });
    expect(screen.queryByRole("button", { name: "このレポートを削除" })).not.toBeInTheDocument();
  });

  it("confirms administrator deletion, then returns to the refreshed list", async () => {
    const api = createTestApi({
      getSession: async () => ({ email: "admin@example.com", isAdmin: true, storageMode: "d1" as const }),
      getReport: async () => detail,
      listReports: async () => ({ items: [], page: 1, pageSize: 25, total: 0 }),
    });
    const user = userEvent.setup();
    renderWithApi(api);
    await screen.findByRole("heading", { name: "Example Reporter" });

    await user.click(screen.getByRole("radio", { name: "JST" }));
    expect(screen.getByText("2023/11/15 - 2023/11/16")).toBeInTheDocument();
    expect(screen.getByText("2023/11/17 3:30")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "このレポートを削除" }));
    const dialog = screen.getByRole("dialog", { name: "レポートを削除" });
    expect(dialog).toHaveTextContent("Example Reporter");
    expect(dialog).toHaveTextContent("example.com");
    expect(dialog).toHaveTextContent("2023/11/15 - 2023/11/16");
    await user.click(screen.getByRole("button", { name: "レポートを削除" }));

    expect(await screen.findByRole("heading", { name: "レポート" })).toBeInTheDocument();
    expect(api.calls.reportDeletes).toEqual(["report-1"]);
    await waitFor(() => expect(api.calls.reportLists).toHaveLength(1));
  });

  it("keeps the detail visible and allows retry after delete failure", async () => {
    let attempts = 0;
    const api = createTestApi({
      getSession: async () => ({ email: "admin@example.com", isAdmin: true, storageMode: "d1" as const }),
      getReport: async () => detail,
      deleteReport: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new ApiError(500, "INFRASTRUCTURE_ERROR", "削除できませんでした。", "delete-request");
        }
      },
      listReports: async () => ({ items: [], page: 1, pageSize: 25, total: 0 }),
    });
    const user = userEvent.setup();
    renderWithApi(api);
    await screen.findByRole("heading", { name: "Example Reporter" });
    await user.click(screen.getByRole("button", { name: "このレポートを削除" }));

    await user.click(screen.getByRole("button", { name: "レポートを削除" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("delete-request");
    expect(screen.getByRole("heading", { name: "Example Reporter" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "レポートを削除" }));
    expect(await screen.findByRole("heading", { name: "レポート" })).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});
