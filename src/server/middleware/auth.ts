import { createMiddleware } from "hono/factory";
import type { ServerEnv } from "../env";
import { authenticateRequest } from "../auth/authenticate";

export const authMiddleware = createMiddleware<ServerEnv>(
  async (context, next) => {
    const principal = await authenticateRequest(context.req.raw, context.env);
    context.set("principal", principal);
    await next();
  },
);
