import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { fetchAccountBalanceSeries, fetchAccountNames } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { formatAmount } from "../../utils/format";
import { IntervalSelector } from "./IncomeExpenseChart";

export default function AccountBalanceChart() {
  const [interval, setInterval] = useState("monthly");
  const [account, setAccount] = useState("");
  const currency = useAppStore((s) => s.operatingCurrency);
  const viewMode = useAppStore((s) => s.viewMode);

  const namesQuery = useQuery({
    queryKey: ["account-names"],
    queryFn: fetchAccountNames,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["account-balance", account, interval, viewMode],
    queryFn: () => fetchAccountBalanceSeries(account, interval, viewMode),
    enabled: !!account,
  });

  const accountNames = namesQuery.data?.accounts || [];
  const series = data?.series || [];

  const formatTick = (value: number) => {
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}k`;
    return value.toFixed(0);
  };

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
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatTick}
              tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
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
            <Line
              type="monotone"
              dataKey="balance"
              name="Balance"
              stroke="var(--midnight-800)"
              strokeWidth={1.5}
              dot={{ r: 2.5, fill: "var(--midnight-800)" }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
