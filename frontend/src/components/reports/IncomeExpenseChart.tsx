import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import { fetchIncomeExpenseSeries } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { formatAmount } from "../../utils/format";
import type { ViewMode } from "../../types";

interface Props {
  mini?: boolean;
}

export default function IncomeExpenseChart({ mini }: Props) {
  const [interval, setInterval] = useState("monthly");
  const currency = useAppStore((s) => s.operatingCurrency);
  const viewMode = useAppStore((s) => s.viewMode);

  // When combined, fetch comparative to get actual + planned separately
  const backendMode: string = viewMode === "combined" ? "comparative" : "actual";

  const { data, isLoading } = useQuery({
    queryKey: ["income-expense", interval, viewMode],
    queryFn: () => fetchIncomeExpenseSeries(interval, backendMode as ViewMode),
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

  const allData = allPeriods.map((period) => {
    const actual = series.find((p) => p.period === period);
    const plan = planned.find((p) => p.period === period);
    return {
      period,
      income: actual?.income || 0,
      expenses: -(actual?.expenses || 0),
      ...(showPlanned
        ? {
            planned_income: plan?.income || 0,
            planned_expenses: -(plan?.expenses || 0),
          }
        : {}),
    };
  });

  const displayData = mini ? allData.slice(-6) : allData;

  const formatTick = (value: number) => {
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}k`;
    return value.toFixed(0);
  };

  return (
    <div className="report-chart">
      {!mini && (
        <div className="report-chart-controls">
          <IntervalSelector value={interval} onChange={setInterval} />
        </div>
      )}
      <ResponsiveContainer width="100%" height={mini ? 200 : 320}>
        <BarChart
          data={displayData}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          stackOffset="sign"
        >
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
          <ReferenceLine y={0} stroke="var(--border)" />
          <Tooltip
            formatter={(value: unknown, name: unknown) => {
              const absVal = Math.abs(Number(value));
              return [formatAmount(absVal, currency), String(name ?? "")];
            }}
            contentStyle={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--text-primary)", fontWeight: 600 }}
          />
          {!mini && <Legend wrapperStyle={{ fontSize: 11 }} />}
          <Bar
            dataKey="income"
            name="Income"
            fill="var(--midnight-800)"
            stackId="a"
            radius={[2, 2, 0, 0]}
          />
          <Bar
            dataKey="expenses"
            name="Expenses"
            fill="var(--midnight-300)"
            stackId="a"
            radius={[0, 0, 2, 2]}
          />
          {showPlanned && (
            <>
              <Bar
                dataKey="planned_income"
                name="Planned Income"
                fill="var(--midnight-800)"
                opacity={0.35}
                stackId="a"
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey="planned_expenses"
                name="Planned Expenses"
                fill="var(--midnight-300)"
                opacity={0.35}
                stackId="a"
                radius={[0, 0, 2, 2]}
              />
            </>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function IntervalSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="interval-selector">
      {["monthly", "quarterly", "yearly"].map((opt) => (
        <button
          key={opt}
          className={`interval-btn ${value === opt ? "active" : ""}`}
          onClick={() => onChange(opt)}
        >
          {opt.charAt(0).toUpperCase() + opt.slice(1)}
        </button>
      ))}
    </div>
  );
}
