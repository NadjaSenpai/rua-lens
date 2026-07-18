import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardResponse } from "../../shared/api-contract";

export function DailyTrendChart({ values }: { values: DashboardResponse["dailyTrend"] }) {
  return (
    <figure className="panel trend-figure" aria-label="DMARC成功・失敗の日別推移">
      <div className="section-heading">
        <h3>DMARC成功・失敗の日別推移</h3>
      </div>
      <div className="chart-frame">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={values} margin={{ top: 12, right: 18, bottom: 4, left: 4 }} accessibilityLayer>
            <CartesianGrid stroke="var(--chart-grid)" strokeWidth={1} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "var(--muted)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--border-strong)" }} />
            <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} tickLine={false} axisLine={false} width={52} />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              contentStyle={{ border: "1px solid var(--border-strong)", borderRadius: 4, background: "var(--surface)" }}
              labelStyle={{ color: "var(--ink)", fontWeight: 700 }}
              itemStyle={{ color: "var(--ink)" }}
            />
            <Legend formatter={(value) => <span style={{ color: "var(--ink)" }}>{value}</span>} />
            <Line
              dataKey="dmarcPassMessages"
              name="DMARC成功"
              stroke="var(--chart-pass)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={values.length === 1 ? { r: 4, fill: "var(--surface)", stroke: "var(--chart-pass)", strokeWidth: 2 } : false}
              activeDot={{ r: 5, fill: "var(--chart-pass)", stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              dataKey="dmarcFailMessages"
              name="DMARC失敗"
              stroke="var(--chart-fail)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="6 4"
              dot={values.length === 1 ? { r: 4, fill: "var(--surface)", stroke: "var(--chart-fail)", strokeWidth: 2 } : false}
              activeDot={{ r: 5, fill: "var(--chart-fail)", stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-table">
        <summary>日別データを表で確認</summary>
        <div className="table-scroll" tabIndex={0}>
          <table aria-label="日別データ">
            <thead>
              <tr>
                <th scope="col">日付</th>
                <th scope="col">総数</th>
                <th scope="col">DMARC成功</th>
                <th scope="col">DMARC失敗</th>
                <th scope="col">正常</th>
                <th scope="col">要確認</th>
                <th scope="col">失敗</th>
              </tr>
            </thead>
            <tbody>
              {values.map((value) => (
                <tr key={value.date}>
                  <th scope="row">{value.date}</th>
                  <td className="numeric">{value.totalMessages.toLocaleString("ja-JP")}</td>
                  <td className="numeric">{value.dmarcPassMessages.toLocaleString("ja-JP")}</td>
                  <td className="numeric">{value.dmarcFailMessages.toLocaleString("ja-JP")}</td>
                  <td className="numeric">{value.passMessages.toLocaleString("ja-JP")}</td>
                  <td className="numeric">{value.reviewMessages.toLocaleString("ja-JP")}</td>
                  <td className="numeric">{value.failMessages.toLocaleString("ja-JP")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
