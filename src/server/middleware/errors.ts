import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ServerEnv } from "../env";
import { ApiNotFoundError, AppError, ForbiddenError, InfrastructureError } from "../errors";

export function installErrorHandlers(app: Hono<ServerEnv>): void {
  app.notFound((context) => errorResponse(new ApiNotFoundError(), context));

  app.onError((error, context) => {
    if (error instanceof AppError) {
      return errorResponse(error, context);
    }
    if (error instanceof HTTPException && error.status === 403) {
      return errorResponse(new ForbiddenError({ cause: error }), context);
    }
    return errorResponse(new InfrastructureError({ cause: error }), context);
  });
}

function errorResponse(error: AppError, context: Context<ServerEnv>) {
  const requestId = context.get("requestId") ?? crypto.randomUUID();
  const requestLog = context.get("requestLog");
  if (requestLog) {
    requestLog.errorCode = error.code;
  }
  context.header("X-Request-ID", requestId);
  return context.json(
    {
      error: {
        code: error.code,
        message: error.safeMessage,
        requestId,
      },
    },
    error.status,
  );
}
