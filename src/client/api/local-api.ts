import { aggregateDashboard, paginateReports, type LocalScope } from "../storage/aggregate";
import {
  deleteStoredReport,
  getAllReports,
  getStoredReport,
  openLocalDb,
  putReports,
} from "../storage/local-db";
import { ApiError, type ReportListQuery, type ReportScopeQuery, type RuaLensApi } from "./types";

function toLocalScope(query?: ReportScopeQuery): LocalScope {
  return { domain: query?.domain, start: query?.from, end: query?.to };
}

export function createLocalApi(serverApi: RuaLensApi): RuaLensApi {
  const dbPromise = openLocalDb();

  return {
    getSession: (signal) => serverApi.getSession(signal),

    upload: async (files) => {
      const result = await serverApi.upload(files);
      if (result.reports && result.reports.length > 0) {
        const db = await dbPromise;
        await putReports(db, result.reports);
      }
      return result;
    },

    getDashboard: async (query) => {
      const db = await dbPromise;
      const all = await getAllReports(db);
      return aggregateDashboard(all, toLocalScope(query));
    },

    listReports: async (query) => {
      const db = await dbPromise;
      const all = await getAllReports(db);
      return paginateReports(all, toLocalScope(query), query?.page ?? 1, query?.pageSize ?? 25);
    },

    getReport: async (reportId) => {
      const db = await dbPromise;
      const stored = await getStoredReport(db, reportId);
      if (!stored) {
        throw new ApiError(404, "NOT_FOUND", "レポートが見つかりません。");
      }
      return stored.detail;
    },

    deleteReport: async (reportId) => {
      const db = await dbPromise;
      await deleteStoredReport(db, reportId);
    },
  };
}
