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
        <div>
          <p className="eyebrow">UTC daily trend</p>
          <h3>DMARC成功・失敗の日別推移</h3>
        </div>
      </div>
      <div className="chart-frame">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={values} margin={{ top: 12, right: 18, bottom: 4, left: 4 }} accessibilityLayer>
            <CartesianGrid stroke="#dfe8e2" strokeWidth={1} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#4d685d", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#cbd9d1" }} />
            <YAxis tick={{ fill: "#4d685d", fontSize: 12 }} tickLine={false} axisLine={false} width={52} />
            <Tooltip
              cursor={{ stroke: "#8ca398", strokeWidth: 1 }}
              contentStyle={{ border: "1px solid #cbd9d1", borderRadius: 12, background: "#ffffff" }}
              labelStyle={{ color: "#17231f", fontWeight: 700 }}
            />
            <Legend />
            <Line
              dataKey="dmarcPassMessages"
              name="DMARC成功"
              stroke="#2a78d6"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{ r: 4, fill: "#2a78d6", stroke: "#ffffff", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "#2a78d6", stroke: "#ffffff", strokeWidth: 2 }}
            />
            <Line
              dataKey="dmarcFailMessages"
              name="DMARC失敗"
              stroke="#e34948"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{ r: 4, fill: "#e34948", stroke: "#ffffff", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "#e34948", stroke: "#ffffff", strokeWidth: 2 }}
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
