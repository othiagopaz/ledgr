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
import { useFilterParams } from "../../hooks/useFilterParams";
import { formatAmount } from "../../utils/format";
import { IntervalSelector } from "./IncomeExpenseChart";
import type { ViewMode } from "../../types";

interface Props {
  mini?: boolean;
}

export default function NetWorthChart({ mini }: Props) {
  const [interval, setInterval] = useState("monthly");
  const currency = useAppStore((s) => s.operatingCurrency);
  const viewMode = useAppStore((s) => s.viewMode);
  const filters = useFilterParams();

  const backendMode: string = viewMode === "combined" ? "comparative" : "actual";

  const { data, isLoading } = useQuery({
    queryKey: ["net-worth", interval, viewMode, filters],
    queryFn: () => fetchNetWorthSeries(interval, backendMode as ViewMode, filters),
  });

  const series = data?.series || [];
  const planned = data?.planned_series || [];
  const showPlanned = viewMode === "combined" && planned.length > 0;

  if (isLoading) return <div className="report-loading">Loading...</div>;
  if (series.length === 0 && planned.length === 0)
    return <div className="report-empty">No data</div>;

  // Merge all periods from both series so future-only planned periods appear
  const allPeriods = Array.from(
    new Set([...series.map((p) => p.period), ...planned.map((p) => p.period)])
  ).sort();

  // Net worth is cumulative, so carry forward the last known actual value
  // into future periods that only have planned data
  let lastActual = { assets: 0, liabilities: 0, net_worth: 0 };
  const allData = allPeriods.map((period) => {
    const actual = series.find((p) => p.period === period);
    const plan = planned.find((p) => p.period === period);
    if (actual) {
      lastActual = { assets: actual.assets, liabilities: actual.liabilities, net_worth: actual.net_worth };
    }
    const base = actual || lastActual;
    return {
      period,
      assets: base.assets,
      liabilities: base.liabilities,
      net_worth: base.net_worth,
      ...(showPlanned
        ? { combined_net_worth: base.net_worth + (plan?.net_worth || 0) }
        : {}),
    };
  });

  const displayData = mini ? allData.slice(-6) : allData;

  const formatTick = (value: number) => {
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}k`;
    return value.toFixed(0);
  };

  const latest = displayData[displayData.length - 1];

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
          {!mini && <Legend wrapperStyle={{ fontSize: 11 }} />}
          <Area
            type="monotone"
            dataKey="assets"
            name="Assets"
            stroke="var(--midnight-600)"
            fill="var(--midnight-600)"
            fillOpacity={0.12}
            strokeWidth={1.5}
          />
          {showPlanned && (
            <Area
              type="monotone"
              dataKey="combined_net_worth"
              name="Net Worth (with Planned)"
              stroke="var(--midnight-800)"
              fill="var(--midnight-800)"
              fillOpacity={0.05}
              strokeWidth={1.5}
              strokeDasharray="5 5"
            />
          )}
          <Area
            type="monotone"
            dataKey="net_worth"
            name="Net Worth"
            stroke="var(--midnight-800)"
            fill="var(--midnight-800)"
            fillOpacity={0.15}
            strokeWidth={1.5}
          />
          <Area
            type="monotone"
            dataKey="liabilities"
            name="Liabilities"
            stroke="var(--midnight-300)"
            fill="var(--midnight-300)"
            fillOpacity={0.1}
            strokeWidth={1.5}
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
