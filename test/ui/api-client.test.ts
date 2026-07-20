import { describe, expect, it, vi } from "vitest";
import { createRuaLensApi } from "../../src/client/api/client";
import { ApiError } from "../../src/client/api/types";

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("RuaLens API client", () => {
  it("uses relative URLs and serializes report queries", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ items: [], page: 2, pageSize: 10, total: 0 }),
    );
    const api = createRuaLensApi(fetcher);

    await api.listReports({ domain: "example.com", from: "2023-11-14", page: 2, pageSize: 10 });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/reports?domain=example.com&from=2023-11-14&page=2&pageSize=10",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("uploads repeated files fields without setting multipart Content-Type", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        requestId: "request-id",
        summary: { inserted: 0, duplicate: 0, rejected: 0 },
        results: [],
      }),
    );
    const api = createRuaLensApi(fetcher);
    const files = [new File(["one"], "one.xml"), new File(["two"], "two.xml")];

    await api.upload(files);

    const [, init] = fetcher.mock.calls[0];
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).getAll("files")).toEqual(files);
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  });

  it("accepts a 204 delete response without parsing JSON", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const api = createRuaLensApi(fetcher);

    await expect(api.deleteReport("report/id")).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      "/api/reports/report%2Fid",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("maps non-2xx responses to a safe ApiError", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        { error: { code: "NOT_FOUND", message: "見つかりません。", requestId: "request-id" } },
        404,
      ),
    );
    const api = createRuaLensApi(fetcher);

    await expect(api.getReport("missing")).rejects.toEqual(
      new ApiError(404, "NOT_FOUND", "見つかりません。", "request-id"),
    );
  });
});
