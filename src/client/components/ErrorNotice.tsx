import { ApiError } from "../api/types";

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const apiError = error instanceof ApiError ? error : null;
  const unauthorized = apiError?.status === 401;
  return (
    <section className="error-notice" role="alert">
      <h2>{unauthorized ? "認証を確認してください" : "データを読み込めませんでした"}</h2>
      <p>
        {unauthorized
          ? "Cloudflare Accessで再認証してから、このページを再読み込みしてください。"
          : apiError?.message ?? "処理を完了できませんでした。時間をおいて再試行してください。"}
      </p>
      {apiError?.requestId ? <p className="request-id">Request ID: {apiError.requestId}</p> : null}
      {onRetry ? (
        <button className="secondary-button" type="button" onClick={onRetry}>
          再試行
        </button>
      ) : null}
    </section>
  );
}
