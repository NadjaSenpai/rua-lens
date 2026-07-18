import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ReportsPageResponse } from "../../shared/api-contract";
import { useRuaLensApi } from "../api/use-api";
import { ErrorNotice } from "../components/ErrorNotice";
import { useAppShell } from "../components/app-shell-context";

const PAGE_SIZE = 25;

export function ReportsPage() {
  const api = useRuaLensApi();
  const { refreshVersion } = useAppShell();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<ReportsPageResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const queryKey = searchParams.toString();
  const page = positivePage(searchParams.get("page"));

  useEffect(() => {
    const controller = new AbortController();
    api.listReports(
      {
        domain: searchParams.get("domain") || undefined,
        from: searchParams.get("from") || undefined,
        to: searchParams.get("to") || undefined,
        page,
        pageSize: PAGE_SIZE,
      },
      controller.signal,
    ).then(setData).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(reason);
      }
    });
    return () => controller.abort();
  }, [api, attempt, page, queryKey, refreshVersion, searchParams]);

  const updateParameters = (next: URLSearchParams) => {
    setData(null);
    setError(null);
    setSearchParams(next);
  };

  return (
    <section className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Report archive</p>
          <h2>レポート</h2>
          <p>取り込んだDMARC aggregate reportを期間と対象ドメインで確認します。</p>
        </div>
      </header>

      <form
        key={queryKey}
        className="filter-bar"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const next = new URLSearchParams();
          for (const key of ["domain", "from", "to"] as const) {
            const value = String(form.get(key) ?? "").trim();
            if (value) {
              next.set(key, value);
            }
          }
          next.set("page", "1");
          updateParameters(next);
        }}
      >
        <label>
          <span>対象ドメイン</span>
          <input name="domain" defaultValue={searchParams.get("domain") ?? ""} placeholder="example.com" />
        </label>
        <label>
          <span>開始日</span>
          <input name="from" type="date" defaultValue={searchParams.get("from") ?? ""} />
        </label>
        <label>
          <span>終了日</span>
          <input name="to" type="date" defaultValue={searchParams.get("to") ?? ""} />
        </label>
        <button className="secondary-button" type="submit">条件を適用</button>
      </form>

      {error ? (
        <ErrorNotice
          error={error}
          onRetry={() => {
            setError(null);
            setAttempt((value) => value + 1);
          }}
        />
      ) : null}
      {!error && !data ? <p className="loading-state" aria-busy="true">レポートを読み込んでいます…</p> : null}
      {data && data.items.length === 0 ? (
        <section className="panel empty-panel">
          <h3>条件に一致するレポートはありません</h3>
          <p>対象ドメインまたは期間を変更してください。</p>
        </section>
      ) : null}
      {data && data.items.length > 0 ? (
        <>
          <div className="table-scroll" tabIndex={0}>
            <table>
              <caption>{data.total}件のレポート</caption>
              <thead>
                <tr>
                  <th scope="col">提供元</th>
                  <th scope="col">対象ドメイン</th>
                  <th scope="col">集計期間</th>
                  <th scope="col">メッセージ数</th>
                  <th scope="col">DMARC成功率</th>
                  <th scope="col">取り込み</th>
                  <th scope="col"><span className="visually-hidden">操作</span></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.orgName}</td>
                    <td><code>{item.domain}</code></td>
                    <td>{formatDate(item.periodBegin)} – {formatDate(item.periodEnd)}</td>
                    <td className="numeric">{item.totalMessages.toLocaleString("ja-JP")}</td>
                    <td className="numeric">{formatRate(item.dmarcPassRate)}</td>
                    <td>{formatDateTime(item.importedAt)}<small>{item.importedBy}</small></td>
                    <td><Link to={`/reports/${encodeURIComponent(item.id)}`}>詳細を確認</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="pagination" aria-label="レポートのページ">
            <button
              className="secondary-button"
              type="button"
              disabled={data.page <= 1}
              onClick={() => changePage(data.page - 1, searchParams, updateParameters)}
            >
              前のページ
            </button>
            <span>{data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}ページ</span>
            <button
              className="secondary-button"
              type="button"
              disabled={data.page * data.pageSize >= data.total}
              onClick={() => changePage(data.page + 1, searchParams, updateParameters)}
            >
              次のページ
            </button>
          </nav>
        </>
      ) : null}
    </section>
  );
}

function changePage(
  page: number,
  searchParams: URLSearchParams,
  update: (next: URLSearchParams) => void,
) {
  const next = new URLSearchParams(searchParams);
  next.set("page", String(page));
  update(next);
}

function positivePage(value: string | null): number {
  const parsed = Number(value ?? 1);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function formatRate(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
