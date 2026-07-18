import type { DashboardResponse } from "../../shared/api-contract";

export function SummaryCards({ summary }: { summary: DashboardResponse["summary"] }) {
  return (
    <section className="summary-strip" aria-label="集計サマリー">
      <dl>
        <div className="summary-metric">
          <dt>総メッセージ数</dt>
          <dd>{summary.totalMessages.toLocaleString("ja-JP")}</dd>
        </div>
        <div className="summary-metric">
          <dt>DMARC成功率</dt>
          <dd>{(summary.dmarcPassRate * 100).toFixed(1)}%</dd>
          <small>aligned DKIM または SPF</small>
        </div>
        <div className="summary-metric summary-metric--status">
          <dt>表示区分</dt>
          <dd>
            <ul>
              <li><i className="status-mark status-mark--pass" />正常 {summary.passMessages.toLocaleString("ja-JP")}</li>
              <li><i className="status-mark status-mark--review" />要確認 {summary.reviewMessages.toLocaleString("ja-JP")}</li>
              <li><i className="status-mark status-mark--fail" />失敗 {summary.failMessages.toLocaleString("ja-JP")}</li>
            </ul>
          </dd>
        </div>
      </dl>
    </section>
  );
}
