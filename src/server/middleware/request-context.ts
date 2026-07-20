import { createMiddleware } from "hono/factory";
import type { ServerEnv } from "../env";

export const requestContext = createMiddleware<ServerEnv>(async (context, next) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const requestLog = {
    successes: 0,
    skipped: 0,
    failures: 0,
    errorCode: null,
  };
  context.set("requestId", requestId);
  context.set("requestLog", requestLog);
  context.header("X-Request-ID", requestId);

  try {
    await next();
  } finally {
    console.log({
      requestId,
      durationMs: Math.max(0, Date.now() - startedAt),
      successes: requestLog.successes,
      skipped: requestLog.skipped,
      failures: requestLog.failures,
      errorCode: requestLog.errorCode,
    });
  }
});
