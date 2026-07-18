import type { DashboardResponse } from "../../shared/api-contract";

export function SummaryCards({ summary }: { summary: DashboardResponse["summary"] }) {
  return (
    <section className="summary-grid" aria-label="集計サマリー">
      <article className="summary-card summary-card--hero">
        <span>総メッセージ数</span>
        <strong>{summary.totalMessages.toLocaleString("ja-JP")}</strong>
      </article>
      <article className="summary-card">
        <span>DMARC成功率</span>
        <strong>{(summary.dmarcPassRate * 100).toFixed(1)}%</strong>
        <small>aligned DKIM または SPF</small>
      </article>
      <article className="summary-card summary-card--status">
        <span>表示区分</span>
        <ul>
          <li><i className="status-mark status-mark--pass" />正常 {summary.passMessages.toLocaleString("ja-JP")}</li>
          <li><i className="status-mark status-mark--review" />要確認 {summary.reviewMessages.toLocaleString("ja-JP")}</li>
          <li><i className="status-mark status-mark--fail" />失敗 {summary.failMessages.toLocaleString("ja-JP")}</li>
        </ul>
      </article>
    </section>
  );
}
