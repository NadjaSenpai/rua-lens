import type {
  DashboardResponse,
  ReportDetail,
  ReportsPageResponse,
  SessionResponse,
  UploadBatchResult,
} from "../../shared/api-contract";

export type ReportScopeQuery = {
  domain?: string;
  from?: string;
  to?: string;
};

export type ReportListQuery = ReportScopeQuery & {
  page?: number;
  pageSize?: number;
};

export interface RuaLensApi {
  getSession(signal?: AbortSignal): Promise<SessionResponse>;
  upload(files: readonly File[]): Promise<UploadBatchResult>;
  listReports(query?: ReportListQuery, signal?: AbortSignal): Promise<ReportsPageResponse>;
  getReport(reportId: string, signal?: AbortSignal): Promise<ReportDetail>;
  deleteReport(reportId: string): Promise<void>;
  getDashboard(query?: ReportScopeQuery, signal?: AbortSignal): Promise<DashboardResponse>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
