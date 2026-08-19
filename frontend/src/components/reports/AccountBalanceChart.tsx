import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { fetchAccountBalanceSeries, fetchAccountNames } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { useFilterParams } from "../../hooks/useFilterParams";
import { formatAmount } from "../../utils/format";
import { IntervalSelector } from "./IncomeExpenseChart";

/** Child-line styling, walked in order.  The repo palette is monochrome
 *  midnight, so children are separated by ramp step *and* dash pattern —
 *  legible without introducing hues the design system does not have.  All
 *  steps stay lighter than the consolidated bar so the total keeps primacy. */
const CHILD_STYLES = [
  { stroke: "var(--midnight-700)", dash: undefined },
  { stroke: "var(--midnight-500)", dash: "5 3" },
  { stroke: "var(--midnight-600)", dash: "2 2" },
  { stroke: "var(--midnight-400)", dash: "8 3 2 3" },
  { stroke: "var(--midnight-500)", dash: "1 3" },
  { stroke: "var(--midnight-300)", dash: "6 2" },
];

export default function AccountBalanceChart() {
  const [interval, setInterval] = useState("monthly");
  const [account, setAccount] = useState("");
  const currency = useAppStore((s) => s.operatingCurrency);
  const viewMode = useAppStore((s) => s.viewMode);
  const filters = useFilterParams();

  const namesQuery = useQuery({
    queryKey: ["account-names"],
    queryFn: fetchAccountNames,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["account-balance", account, interval, viewMode, filters],
    queryFn: () => fetchAccountBalanceSeries(account, interval, viewMode, filters),
    enabled: !!account,
  });

  const accountNames = namesQuery.data?.accounts || [];
  const series = data?.series || [];
  const children = data?.children || [];
  // A grouping account (no postings of its own) rolls its children up: the
  // total is drawn as bars on the left axis — the headline figure — and each
  // child as a line on an auto-scaled right axis, so a small component stays
  // readable beside a dominant one without competing with the total.
  const consolidated = !!data?.consolidated && children.length > 0;

  const formatTick = (value: number) => {
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}k`;
    return value.toFixed(0);
  };

  // Merge the consolidated series and every child series into the single row
  // shape Recharts wants, keyed by child account to survive same-leaf names.
  const chartData = consolidated
    ? series.map((point, i) => {
        const row: Record<string, string | number> = {
          period: point.period,
          balance: point.balance,
        };
        for (const child of children) {
          row[child.account] = child.series[i]?.balance ?? 0;
        }
        return row;
      })
    : series;

  return (
    <div className="report-chart">
      <div className="report-chart-controls">
        <select
          className="report-select"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
        >
          <option value="">Select account...</option>
          {accountNames.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <IntervalSelector value={interval} onChange={setInterval} />
      </div>
      {!account ? (
        <div className="report-empty">Select an account to view its balance over time</div>
      ) : isLoading ? (
        <div className="report-loading">Loading...</div>
      ) : series.length === 0 ? (
        <div className="report-empty">No data for this account</div>
      ) : (
        <>
          {consolidated && (
            <div className="report-chart-note">
              <strong>{account}</strong> has no movements of its own — bars show
              the consolidated balance of its {children.length}{" "}
              {children.length === 1 ? "child" : "children"} (left axis), lines
              show each one (right axis, scaled independently).
            </div>
          )}
          <ResponsiveContainer width="100%" height={consolidated ? 380 : 320}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                yAxisId="total"
                tickFormatter={formatTick}
                tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              {consolidated && (
                <YAxis
                  yAxisId="children"
                  orientation="right"
                  tickFormatter={formatTick}
                  tick={{ fontSize: 11, fill: "var(--midnight-400)" }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
              )}
              <Tooltip
                formatter={(value) => formatAmount(Number(value), currency)}
                contentStyle={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--text-primary)", fontWeight: 600 }}
              />
              {consolidated && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {consolidated ? (
                <Bar
                  yAxisId="total"
                  dataKey="balance"
                  name="Consolidated"
                  fill="var(--midnight-800)"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={38}
                />
              ) : (
                <Line
                  yAxisId="total"
                  type="monotone"
                  dataKey="balance"
                  name="Balance"
                  stroke="var(--midnight-800)"
                  strokeWidth={1.5}
                  dot={{ r: 2.5, fill: "var(--midnight-800)" }}
                  activeDot={{ r: 4 }}
                />
              )}
              {consolidated &&
                children.map((child, i) => {
                  const style = CHILD_STYLES[i % CHILD_STYLES.length];
                  return (
                    <Line
                      key={child.account}
                      yAxisId="children"
                      type="monotone"
                      dataKey={child.account}
                      name={child.name}
                      stroke={style.stroke}
                      strokeDasharray={style.dash}
                      strokeWidth={1.75}
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  );
                })}
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
