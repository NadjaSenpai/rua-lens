import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import type { ServerEnv } from "../env";
import {
  InfrastructureError,
  InvalidRequestError,
  PayloadTooLargeError,
  UnprocessableRequestError,
} from "../errors";
import { ingestBatch, IngestInfrastructureError } from "../ingest/ingest-batch";
import { INGEST_LIMITS } from "../ingest/limits";
import { isIngestError } from "../ingest/xml-security";

export const uploadRoutes = new Hono<ServerEnv>();

const requireMultipart = createMiddleware<ServerEnv>(async (context, next) => {
  const mediaType = context.req.header("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "multipart/form-data") {
    throw new InvalidRequestError("multipart/form-dataでファイルを送信してください。");
  }
  await next();
});

uploadRoutes.post(
  "/",
  requireMultipart,
  bodyLimit({
    maxSize: INGEST_LIMITS.maxRequestBytes,
    onError: () => {
      throw new PayloadTooLargeError();
    },
  }),
  async (context) => {
    let fields: Awaited<ReturnType<typeof context.req.parseBody>>;
    try {
      fields = await context.req.parseBody({ all: true });
    } catch (error) {
      throw new UnprocessableRequestError({ cause: error });
    }

    const values = fields.files === undefined
      ? []
      : Array.isArray(fields.files)
        ? fields.files
        : [fields.files];
    if (values.length === 0 || values.some((value) => !(value instanceof File))) {
      throw new InvalidRequestError("filesフィールドへファイルを指定してください。");
    }

    const files = values as File[];
    const totalInputBytes = files.reduce((total, file) => total + file.size, 0);
    if (files.length > INGEST_LIMITS.maxFiles || totalInputBytes > INGEST_LIMITS.maxInputBytesBatch) {
      throw new PayloadTooLargeError();
    }

    try {
      const storageMode = context.get("storageMode");
      const result = await ingestBatch({
        files,
        principal: context.get("principal"),
        db: storageMode === "stateless" ? undefined : context.env.DB,
        storageMode,
        requestId: context.get("requestId"),
      });
      const requestLog = context.get("requestLog");
      requestLog.successes = result.summary.inserted;
      requestLog.skipped = result.summary.duplicate;
      requestLog.failures = result.summary.rejected;
      return context.json(result);
    } catch (error) {
      if (isIngestError(error) && error.code === "SIZE_LIMIT_EXCEEDED") {
        throw new PayloadTooLargeError({ cause: error });
      }
      if (error instanceof IngestInfrastructureError) {
        throw new InfrastructureError({ cause: error });
      }
      throw error;
    }
  },
);
