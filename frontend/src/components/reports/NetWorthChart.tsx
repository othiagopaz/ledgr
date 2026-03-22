import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { fetchNetWorthSeries } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { formatAmount } from "../../utils/format";
import { IntervalSelector } from "./IncomeExpenseChart";

interface Props {
  mini?: boolean;
}

export default function NetWorthChart({ mini }: Props) {
  const [interval, setInterval] = useState("monthly");
  const currency = useAppStore((s) => s.operatingCurrency);

  const { data, isLoading } = useQuery({
    queryKey: ["net-worth", interval],
    queryFn: () => fetchNetWorthSeries(interval),
  });

  const series = data?.series || [];

  if (isLoading) return <div className="report-loading">Loading...</div>;
  if (series.length === 0) return <div className="report-empty">No data</div>;

  const displayData = mini ? series.slice(-6) : series;

  const formatTick = (value: number) => {
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}k`;
    return value.toFixed(0);
  };

  const latest = series[series.length - 1];

  return (
    <div className="report-chart">
      {!mini && (
        <div className="report-chart-controls">
          <IntervalSelector value={interval} onChange={setInterval} />
        </div>
      )}
      <ResponsiveContainer width="100%" height={mini ? 200 : 320}>
        <AreaChart data={displayData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
            width={50}
          />
          {!mini && (
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
          )}
          {!mini && <Legend wrapperStyle={{ fontSize: 11 }} />}
          <Area
            type="monotone"
            dataKey="assets"
            name="Assets"
            stroke="var(--amount-positive)"
            fill="var(--amount-positive)"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="net_worth"
            name="Net Worth"
            stroke="var(--accent)"
            fill="var(--accent)"
            fillOpacity={0.1}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="liabilities"
            name="Liabilities"
            stroke="var(--amount-negative)"
            fill="var(--amount-negative)"
            fillOpacity={0.1}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
      {!mini && latest && (
        <div className="report-summary-row">
          <div className="report-summary-item">
            <span className="report-summary-label">Assets</span>
            <span className="report-summary-value positive">
              {formatAmount(latest.assets, currency)}
            </span>
          </div>
          <div className="report-summary-item">
            <span className="report-summary-label">Liabilities</span>
            <span className="report-summary-value negative">
              {formatAmount(latest.liabilities, currency)}
            </span>
          </div>
          <div className="report-summary-item">
            <span className="report-summary-label">Net Worth</span>
            <span className={`report-summary-value ${latest.net_worth >= 0 ? "positive" : "negative"}`}>
              {formatAmount(latest.net_worth, currency)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
