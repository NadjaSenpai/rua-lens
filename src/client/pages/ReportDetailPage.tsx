import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ReportDetail } from "../../shared/api-contract";
import { useRuaLensApi } from "../api/use-api";
import { DeleteReportDialog } from "../components/DeleteReportDialog";
import { ErrorNotice } from "../components/ErrorNotice";
import { useAppShell } from "../components/app-shell-context";
import { formatDisplayDate, formatDisplayDateTime } from "../date-time";

export function ReportDetailPage() {
  const api = useRuaLensApi();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { displayTimeZone, session, notifyDataChanged } = useAppShell();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api.getReport(id, controller.signal).then(setReport).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(reason);
      }
    });
    return () => controller.abort();
  }, [api, attempt, id]);

  if (error) {
    return (
      <ErrorNotice
        error={error}
        onRetry={() => {
          setError(null);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  if (!report) {
    return <p className="loading-state state-block" aria-busy="true">レポート詳細を読み込んでいます…</p>;
  }

  return (
    <article className="page-stack report-detail">
      <Link className="back-link" to="/reports">← レポート一覧へ</Link>
      <header className="page-context page-context--identity page-context--actions">
        <div>
          <h2>{report.orgName}</h2>
          <p><code>{report.domain}</code> · {formatDisplayDate(report.periodBegin, displayTimeZone)} - {formatDisplayDate(report.periodEnd, displayTimeZone)}</p>
        </div>
        {session.isAdmin ? (
          <button className="danger-button" type="button" onClick={() => setDeleteOpen(true)}>
            このレポートを削除
          </button>
        ) : null}
      </header>

      <section className="context-frame report-context" aria-label="レポート情報">
        <dl className="compact-details fact-list">
          <div><dt>外部Report ID</dt><dd>{report.externalReportId}</dd></div>
          <div><dt>取り込み日時</dt><dd>{formatDisplayDateTime(report.importedAt, displayTimeZone)}</dd></div>
          <div><dt>取り込んだユーザー</dt><dd>{report.importedBy}</dd></div>
        </dl>
      </section>

      <section className="ledger-section report-policy" aria-labelledby="report-policy-heading">
        <div className="section-heading">
          <h3 id="report-policy-heading">公開DMARCポリシー</h3>
        </div>
        <dl className="policy-facts">
          <div><dt>p</dt><dd>{report.policy.p}</dd></div>
          <div><dt>sp</dt><dd>{report.policy.sp ?? "pを継承"}</dd></div>
          <div><dt>pct</dt><dd>{report.policy.pct}%</dd></div>
          <div><dt>adkim</dt><dd>{report.policy.adkim}</dd></div>
          <div><dt>aspf</dt><dd>{report.policy.aspf}</dd></div>
        </dl>
      </section>

      <section className="record-stack record-ledger ledger-section">
        <div className="section-heading">
          <div>
            <h3>送信元IP別レコード</h3>
          </div>
          <span>{report.records.length}件</span>
        </div>
        {report.records.map((record, index) => (
          <details className="record-card" key={`${record.sourceIp}-${index}`} open={index === 0}>
            <summary>
              <span><code>{record.sourceIp}</code> · {record.messageCount.toLocaleString("ja-JP")}メッセージ</span>
              <span className={`status-badge status-badge--${record.classification}`}>
                {classificationLabel(record.classification)}
              </span>
            </summary>
            <div className="record-content">
              <dl className="compact-details fact-list">
                <div><dt>disposition</dt><dd>{record.disposition}</dd></div>
                <div><dt>DMARC成功</dt><dd>{record.dmarcPass ? "成功" : "失敗"}</dd></div>
                <div><dt>header_from</dt><dd>{record.identifiers.headerFrom}</dd></div>
                <div><dt>envelope_from</dt><dd>{record.identifiers.envelopeFrom ?? "未設定"}</dd></div>
                <div><dt>envelope_to</dt><dd>{record.identifiers.envelopeTo ?? "未設定"}</dd></div>
              </dl>
              <div className="auth-grid record-evidence">
                <section>
                  <h4>Policy evaluated</h4>
                  <p>DKIM: {record.policyEvaluated.dkim} / SPF: {record.policyEvaluated.spf}</p>
                  <ul>
                    {record.policyEvaluated.overrides.map((override, overrideIndex) => (
                      <li key={`${override.type}-${overrideIndex}`}>
                        {override.type}{override.comment ? `: ${override.comment}` : ""}
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h4>DKIM結果</h4>
                  {record.dkimResults.length === 0 ? <p>結果なし</p> : (
                    <ul>
                      {record.dkimResults.map((result, resultIndex) => (
                        <li key={`${result.domain}-${result.selector ?? "none"}-${resultIndex}`}>
                          {result.domain} - {result.result}
                          {result.selector ? ` · selector: ${result.selector}` : ""}
                          {result.humanResult ? ` · ${result.humanResult}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section>
                  <h4>SPF結果</h4>
                  {record.spfResults.length === 0 ? <p>結果なし</p> : (
                    <ul>
                      {record.spfResults.map((result, resultIndex) => (
                        <li key={`${result.domain}-${result.scope ?? "none"}-${resultIndex}`}>
                          {result.domain} - {result.result}{result.scope ? ` · scope: ${result.scope}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          </details>
        ))}
      </section>

      <DeleteReportDialog
        open={deleteOpen}
        report={report}
        displayTimeZone={displayTimeZone}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          notifyDataChanged();
          navigate("/reports");
        }}
      />
    </article>
  );
}

function classificationLabel(value: ReportDetail["records"][number]["classification"]): string {
  if (value === "pass") {
    return "正常";
  }
  if (value === "review") {
    return "要確認";
  }
  return "失敗";
}
