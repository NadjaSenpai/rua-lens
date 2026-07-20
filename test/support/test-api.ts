import type {
  DashboardResponse,
  ReportDetail,
  ReportsPageResponse,
  SessionResponse,
  UploadBatchResult,
} from "../../src/shared/api-contract";
import type {
  ReportListQuery,
  ReportScopeQuery,
  RuaLensApi,
} from "../../src/client/api/types";

export type TestApiCalls = {
  uploads: File[][];
  reportLists: ReportListQuery[];
  reportDetails: string[];
  reportDeletes: string[];
  dashboards: ReportScopeQuery[];
};

type TestApiHandlers = Partial<{
  getSession: () => Promise<SessionResponse>;
  upload: (files: readonly File[]) => Promise<UploadBatchResult>;
  listReports: (query: ReportListQuery) => Promise<ReportsPageResponse>;
  getReport: (reportId: string) => Promise<ReportDetail>;
  deleteReport: (reportId: string) => Promise<void>;
  getDashboard: (query: ReportScopeQuery) => Promise<DashboardResponse>;
}>;

export function createTestApi(handlers: TestApiHandlers = {}): RuaLensApi & { calls: TestApiCalls } {
  const calls: TestApiCalls = {
    uploads: [],
    reportLists: [],
    reportDetails: [],
    reportDeletes: [],
    dashboards: [],
  };

  return {
    calls,
    getSession: () => handlers.getSession?.() ?? Promise.resolve({ email: "developer@example.com", isAdmin: false }),
    upload: (files) => {
      calls.uploads.push([...files]);
      return handlers.upload?.(files) ?? Promise.resolve({
        requestId: "00000000-0000-4000-8000-000000000000",
        summary: { inserted: 0, duplicate: 0, rejected: 0 },
        results: [],
      });
    },
    listReports: (query = {}) => {
      calls.reportLists.push(query);
      return handlers.listReports?.(query) ?? Promise.resolve({ items: [], page: 1, pageSize: 25, total: 0 });
    },
    getReport: (reportId) => {
      calls.reportDetails.push(reportId);
      if (!handlers.getReport) {
        return Promise.reject(new Error("getReport handler is required"));
      }
      return handlers.getReport(reportId);
    },
    deleteReport: (reportId) => {
      calls.reportDeletes.push(reportId);
      return handlers.deleteReport?.(reportId) ?? Promise.resolve();
    },
    getDashboard: (query = {}) => {
      calls.dashboards.push(query);
      return handlers.getDashboard?.(query) ?? Promise.resolve(emptyDashboard());
    },
  };
}

export function emptyDashboard(): DashboardResponse {
  return {
    summary: {
      totalMessages: 0,
      dmarcPassMessages: 0,
      dmarcPassRate: 0,
      passMessages: 0,
      reviewMessages: 0,
      failMessages: 0,
    },
    dailyTrend: [],
    dispositions: [],
    failureSources: [],
    domains: [],
    recentReports: [],
  };
}
