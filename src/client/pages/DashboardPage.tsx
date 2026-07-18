import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { DashboardResponse } from "../../shared/api-contract";
import { useRuaLensApi } from "../api/use-api";
import { DailyTrendChart } from "../components/DailyTrendChart";
import { DateRangeFilter } from "../components/DateRangeFilter";
import { DomainFilter } from "../components/DomainFilter";
import { ErrorNotice } from "../components/ErrorNotice";
import { FailureSourceTable } from "../components/FailureSourceTable";
import { StatusBreakdown } from "../components/StatusBreakdown";
import { SummaryCards } from "../components/SummaryCards";
import { useAppShell } from "../components/app-shell-context";

export function DashboardPage() {
  const api = useRuaLensApi();
  const { openUpload, refreshVersion } = useAppShell();
  const [searchParams, setSearchParams] = useSearchParams();
  const [result, setResult] = useState<{ queryKey: string; data: DashboardResponse } | null>(null);
  const [errorResult, setErrorResult] = useState<{ queryKey: string; error: unknown } | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const queryKey = searchParams.toString();
  const data = result?.queryKey === queryKey ? result.data : null;
  const error = errorResult?.queryKey === queryKey ? errorResult.error : null;
  const filterDomains = data?.domains ?? result?.data.domains ?? [];
  const domain = searchParams.get("domain") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const scope = { domain, from, to };

  useEffect(() => {
    const controller = new AbortController();
    api.getDashboard({ domain, from, to }, controller.signal).then((response) => {
      if (!controller.signal.aborted) {
        setResult({ queryKey, data: response });
      }
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setErrorResult({ queryKey, error: reason });
      }
    });
    return () => controller.abort();
  }, [api, attempt, domain, from, queryKey, refreshVersion, to]);

  const filterForm = (
    <form
      key={queryKey}
      className="query-row dashboard-filters"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const from = String(form.get("from") ?? "");
        const to = String(form.get("to") ?? "");
        if (from && to && from > to) {
          setScopeError("開始日は終了日以前を指定してください。");
          return;
        }
        const next = new URLSearchParams();
        for (const key of ["domain", "from", "to"] as const) {
          const value = String(form.get(key) ?? "").trim();
          if (value) {
            next.set(key, value);
          }
        }
        setScopeError(null);
        setErrorResult(null);
        setSearchParams(next);
      }}
    >
      <DomainFilter domains={filterDomains} value={scope.domain ?? ""} />
      <DateRangeFilter from={scope.from ?? ""} to={scope.to ?? ""} />
      <div className="filter-actions">
        <button className="secondary-button" type="submit">条件を適用</button>
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setScopeError(null);
            setErrorResult(null);
            setSearchParams(new URLSearchParams());
          }}
        >
          条件をリセット
        </button>
      </div>
      {scopeError ? <p className="validation-error" role="alert">{scopeError}</p> : null}
    </form>
  );

  if (!result && error) {
    return (
      <ErrorNotice
        error={error}
        onRetry={() => {
          setErrorResult(null);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  if (!result) {
    return <p className="loading-state" aria-busy="true">ダッシュボードを読み込んでいます…</p>;
  }

  const filtered = Boolean(scope.domain || scope.from || scope.to);
  const empty = data?.summary.totalMessages === 0;

  return (
    <section className="page-stack dashboard-page" aria-busy={Boolean(error)}>
      <header className="page-heading">
        <div>
          <h2>ダッシュボード</h2>
          <p>DMARC成功と表示区分を分けて、送信状況をメッセージ数で集計します。</p>
        </div>
      </header>
      <section className="scope-strip" aria-label="現在の対象範囲">
        <dl>
          <div><dt>対象</dt><dd>{scope.domain ?? "すべてのドメイン"}</dd></div>
          <div><dt>期間</dt><dd>{scope.from ?? "開始日指定なし"} - {scope.to ?? "終了日指定なし"}</dd></div>
          <div><dt>時刻基準</dt><dd>UTC</dd></div>
        </dl>
      </section>
      {filterForm}
      {error ? (
        <ErrorNotice
          error={error}
          onRetry={() => {
            setErrorResult(null);
            setAttempt((value) => value + 1);
          }}
        />
      ) : null}
      {!data && !error ? <p className="loading-state" aria-busy="true">集計を更新しています…</p> : null}

      {data && empty && !filtered ? (
        <section className="empty-state">
          <p className="empty-state__label">最初のレポートを追加</p>
          <h3>DMARCレポートを安全に読み解く</h3>
          <p>XML、gzip、ZIPをWorker内で解析し、正規化した結果だけを保存します。元ファイルは保存しません。</p>
          <div className="empty-state__actions">
            <button className="primary-button" type="button" onClick={openUpload}>
              レポートをアップロード
            </button>
            <a href="/sample-report.xml" download>合成サンプルXMLをダウンロード</a>
          </div>
        </section>
      ) : null}

      {data && empty && filtered ? (
        <section className="panel empty-panel">
          <h3>条件に一致するレポートはありません</h3>
          <p>対象ドメインまたはUTC期間を変更してください。</p>
          <button className="secondary-button" type="button" onClick={() => setSearchParams(new URLSearchParams())}>
            条件をリセット
          </button>
        </section>
      ) : null}

      {data && !empty ? (
        <>
          <SummaryCards summary={data.summary} />
          <DailyTrendChart values={data.dailyTrend} />
          <div className="dashboard-columns">
            <StatusBreakdown values={data.dispositions} totalMessages={data.summary.totalMessages} />
            <FailureSourceTable values={data.failureSources} />
          </div>
          <RecentReports reports={data.recentReports} />
        </>
      ) : null}
    </section>
  );
}

function RecentReports({ reports }: { reports: DashboardResponse["recentReports"] }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <h3>直近のレポート</h3>
        <Link to="/reports">すべて確認</Link>
      </div>
      <div className="table-scroll" tabIndex={0}>
        <table>
          <thead>
            <tr><th scope="col">提供元</th><th scope="col">ドメイン</th><th scope="col">期間</th><th scope="col">メッセージ数</th><th scope="col">成功率</th></tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id}>
                <td><Link to={`/reports/${encodeURIComponent(report.id)}`}>{report.orgName}</Link></td>
                <td><code>{report.domain}</code></td>
                <td>{formatDate(report.periodBegin)} - {formatDate(report.periodEnd)}</td>
                <td className="numeric">{report.totalMessages.toLocaleString("ja-JP")}</td>
                <td className="numeric">{(report.dmarcPassRate * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}
