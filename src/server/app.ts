import { Hono } from "hono";
import type { ServerEnv } from "./env";
import { authMiddleware } from "./middleware/auth";
import { sameOriginCsrf } from "./middleware/csrf";
import { installErrorHandlers } from "./middleware/errors";
import { requestContext } from "./middleware/request-context";
import { securityHeaders } from "./middleware/security-headers";
import { dashboardRoutes } from "./routes/dashboard";
import { reportRoutes } from "./routes/reports";
import { sessionRoutes } from "./routes/session";
import { uploadRoutes } from "./routes/uploads";

export function createApp(): Hono<ServerEnv> {
  const app = new Hono<ServerEnv>();

  app.use("*", securityHeaders);
  app.use("/api/*", requestContext);
  app.use("/api/*", authMiddleware);
  app.use("/api/*", sameOriginCsrf);

  app.route("/api/session", sessionRoutes);
  app.route("/api/uploads", uploadRoutes);
  app.route("/api/reports", reportRoutes);
  app.route("/api/dashboard", dashboardRoutes);

  installErrorHandlers(app);

  return app;
}
