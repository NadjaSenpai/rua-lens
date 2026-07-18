import type { DashboardResponse } from "../../shared/api-contract";

const dispositions = ["none", "quarantine", "reject"] as const;

export function StatusBreakdown({
  values,
  totalMessages,
}: {
  values: DashboardResponse["dispositions"];
  totalMessages: number;
}) {
  const byDisposition = new Map(values.map((value) => [value.disposition, value.totalMessages]));
  return (
    <section className="panel evidence-panel" role="region" aria-label="Disposition内訳">
      <div className="section-heading">
        <h3>Disposition内訳</h3>
      </div>
      <ul className="evidence-list">
        {dispositions.map((disposition) => {
          const value = byDisposition.get(disposition) ?? 0;
          const percentage = totalMessages === 0 ? 0 : value / totalMessages * 100;
          return (
            <li key={disposition}>
              <div className="evidence-row__summary">
                <code>{disposition}</code>
                <span className="evidence-values">
                  <strong>{value.toLocaleString("ja-JP")}</strong>
                  <span>{percentage.toFixed(1)}%</span>
                </span>
              </div>
              <div className="evidence-rule" aria-hidden="true">
                <span style={{ width: `${percentage}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
