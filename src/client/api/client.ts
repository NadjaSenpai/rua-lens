import type { ApiErrorResponse } from "../../shared/api-contract";
import { ApiError, type ReportListQuery, type ReportScopeQuery, type RuaLensApi } from "./types";

const NETWORK_ERROR_MESSAGE = "サーバーへ接続できませんでした。時間をおいて再試行してください。";
const RESPONSE_ERROR_MESSAGE = "サーバーからの応答を読み取れませんでした。";

export function createRuaLensApi(fetcher: typeof fetch = fetch): RuaLensApi {
  return {
    getSession: (signal) => requestJson(fetcher, "/api/session", { signal }),
    upload: async (files) => {
      const body = new FormData();
      for (const file of files) {
        body.append("files", file);
      }
      return requestJson(fetcher, "/api/uploads", { method: "POST", body });
    },
    listReports: (query = {}, signal) =>
      requestJson(fetcher, `/api/reports${search(query)}`, { signal }),
    getReport: (reportId, signal) =>
      requestJson(fetcher, `/api/reports/${encodeURIComponent(reportId)}`, { signal }),
    deleteReport: async (reportId) => {
      await request(fetcher, `/api/reports/${encodeURIComponent(reportId)}`, {
        method: "DELETE",
      });
    },
    getDashboard: (query = {}, signal) =>
      requestJson(fetcher, `/api/dashboard${search(query)}`, { signal }),
  };
}

async function requestJson<T>(fetcher: typeof fetch, input: string, init: RequestInit = {}): Promise<T> {
  const response = await request(fetcher, input, init);
  try {
    return await response.json<T>();
  } catch {
    throw new ApiError(response.status, "INVALID_RESPONSE", RESPONSE_ERROR_MESSAGE);
  }
}

async function request(fetcher: typeof fetch, input: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(input, {
      credentials: "same-origin",
      ...init,
      headers: {
        Accept: "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", NETWORK_ERROR_MESSAGE);
  }

  if (!response.ok) {
    throw await responseError(response);
  }
  return response;
}

async function responseError(response: Response): Promise<ApiError> {
  try {
    const body = await response.json<ApiErrorResponse>();
    if (body.error && typeof body.error.message === "string") {
      return new ApiError(
        response.status,
        body.error.code,
        body.error.message,
        body.error.requestId || response.headers.get("X-Request-ID"),
      );
    }
  } catch {
    // Fall through to the general response message.
  }
  return new ApiError(
    response.status,
    "HTTP_ERROR",
    RESPONSE_ERROR_MESSAGE,
    response.headers.get("X-Request-ID"),
  );
}

function search(query: ReportScopeQuery | ReportListQuery): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      parameters.set(key, String(value));
    }
  }
  const encoded = parameters.toString();
  return encoded ? `?${encoded}` : "";
}
