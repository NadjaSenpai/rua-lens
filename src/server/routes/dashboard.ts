import { Hono } from "hono";
import type { DashboardResponse } from "../../shared/api-contract";
import type { ServerEnv } from "../env";
import { parseReportScope } from "../report-scope";
import { getDashboard } from "../repositories/dashboard";

export const dashboardRoutes = new Hono<ServerEnv>();

const EMPTY_DASHBOARD: DashboardResponse = {
  summary: { totalMessages: 0, dmarcPassMessages: 0, dmarcPassRate: 0, passMessages: 0, reviewMessages: 0, failMessages: 0 },
  dailyTrend: [],
  dispositions: [],
  failureSources: [],
  domains: [],
  recentReports: [],
};

dashboardRoutes.get("/", async (context) => {
  if (context.get("storageMode") === "stateless") {
    return context.json(EMPTY_DASHBOARD);
  }
  return context.json(
    await getDashboard(context.env.DB, parseReportScope(context.req.query())),
  );
});
