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
    <section className="panel" role="region" aria-label="Disposition内訳">
      <div className="section-heading">
        <div><p className="eyebrow">Policy action</p><h3>Disposition内訳</h3></div>
      </div>
      <ul className="meter-list">
        {dispositions.map((disposition) => {
          const value = byDisposition.get(disposition) ?? 0;
          const percentage = totalMessages === 0 ? 0 : value / totalMessages * 100;
          return (
            <li key={disposition}>
              <div><span>{disposition}</span><strong>{value.toLocaleString("ja-JP")}</strong></div>
              <div className="meter-track" aria-hidden="true">
                <span style={{ width: `${percentage}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
