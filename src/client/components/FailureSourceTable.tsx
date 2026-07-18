import type { DashboardResponse } from "../../shared/api-contract";

export function FailureSourceTable({ values }: { values: DashboardResponse["failureSources"] }) {
  return (
    <section className="panel evidence-panel">
      <div className="section-heading">
        <h3>失敗送信元IP</h3>
      </div>
      {values.length === 0 ? <p>この条件では失敗送信元はありません。</p> : (
        <div className="table-scroll" tabIndex={0}>
          <table aria-label="失敗送信元IP">
            <thead><tr><th scope="col">送信元IP</th><th scope="col">メッセージ数</th></tr></thead>
            <tbody>
              {values.map((value) => (
                <tr key={value.sourceIp}>
                  <td><code>{value.sourceIp}</code></td>
                  <td className="numeric">{value.totalMessages.toLocaleString("ja-JP")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
