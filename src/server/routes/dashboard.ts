import { Hono } from "hono";
import type { ServerEnv } from "../env";
import { parseReportScope } from "../report-scope";
import { getDashboard } from "../repositories/dashboard";

export const dashboardRoutes = new Hono<ServerEnv>();

dashboardRoutes.get("/", async (context) => {
  return context.json(
    await getDashboard(context.env.DB, parseReportScope(context.req.query())),
  );
});
