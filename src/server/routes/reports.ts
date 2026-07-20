import { Hono } from "hono";
import type { ServerEnv } from "../env";
import { ForbiddenError, InvalidRequestError, NotFoundError } from "../errors";
import { parseReportScope } from "../report-scope";
import {
  deleteReport,
  getReport,
  listReports,
  type ReportListQuery,
} from "../repositories/reports";

const DEFAULT_PAGE_SIZE = 25;
const MAXIMUM_PAGE_SIZE = 100;

export const reportRoutes = new Hono<ServerEnv>();

reportRoutes.get("/", async (context) => {
  if (context.get("storageMode") === "stateless") {
    return context.json({ items: [], page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 });
  }
  const query = parseListQuery(context.req.query());
  return context.json(await listReports(context.env.DB, query));
});

reportRoutes.get("/:id", async (context) => {
  if (context.get("storageMode") === "stateless") {
    throw new NotFoundError();
  }
  const report = await getReport(context.env.DB, context.req.param("id"));
  if (!report) {
    throw new NotFoundError();
  }
  return context.json(report);
});

reportRoutes.delete("/:id", async (context) => {
  if (context.get("storageMode") === "stateless") {
    return context.body(null, 204);
  }
  if (!context.get("principal").isAdmin) {
    throw new ForbiddenError();
  }
  if (!(await deleteReport(context.env.DB, context.req.param("id")))) {
    throw new NotFoundError();
  }
  return context.body(null, 204);
});

function parseListQuery(query: Record<string, string>): ReportListQuery {
  const page = positiveInteger(query.page, 1);
  const pageSize = positiveInteger(query.pageSize, DEFAULT_PAGE_SIZE);
  if (pageSize > MAXIMUM_PAGE_SIZE || (page - 1) * pageSize > Number.MAX_SAFE_INTEGER) {
    throw new InvalidRequestError();
  }

  return { ...parseReportScope(query), page, pageSize };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (!/^[1-9]\d*$/.test(value)) {
    throw new InvalidRequestError();
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new InvalidRequestError();
  }
  return parsed;
}
