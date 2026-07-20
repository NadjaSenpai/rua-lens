import type { DashboardResponse } from "../../shared/api-contract";

export function SummaryCards({ summary }: { summary: DashboardResponse["summary"] }) {
  return (
    <section className="summary-reading" aria-label="集計サマリー">
      <p className="summary-reading__label">認証の読み取り</p>
      <dl>
        <div className="summary-reading__primary">
          <dt>DMARC成功率</dt>
          <dd>{(summary.dmarcPassRate * 100).toFixed(1)}%</dd>
          <small>aligned DKIM または SPF</small>
        </div>
        <div className="summary-reading__total">
          <dt>総メッセージ数</dt>
          <dd>{summary.totalMessages.toLocaleString("ja-JP")}</dd>
        </div>
        <div className="summary-reading__status">
          <dt>表示区分</dt>
          <dd>
            <ul>
              <li><i className="status-mark status-mark--pass" />正常 <strong>{summary.passMessages.toLocaleString("ja-JP")}</strong></li>
              <li><i className="status-mark status-mark--review" />要確認 <strong>{summary.reviewMessages.toLocaleString("ja-JP")}</strong></li>
              <li><i className="status-mark status-mark--fail" />失敗 <strong>{summary.failMessages.toLocaleString("ja-JP")}</strong></li>
            </ul>
          </dd>
        </div>
      </dl>
    </section>
  );
}
