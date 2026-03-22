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
} from "recharts";
import { fetchIncomeExpenseSeries } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { formatAmount } from "../../utils/format";

interface Props {
  mini?: boolean;
}

export default function IncomeExpenseChart({ mini }: Props) {
  const [interval, setInterval] = useState("monthly");
  const currency = useAppStore((s) => s.operatingCurrency);

  const { data, isLoading } = useQuery({
    queryKey: ["income-expense", interval],
    queryFn: () => fetchIncomeExpenseSeries(interval),
  });

  const series = data?.series || [];

  if (isLoading) return <div className="report-loading">Loading...</div>;
  if (series.length === 0) return <div className="report-empty">No data</div>;

  const displayData = mini ? series.slice(-6) : series;

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
        <BarChart data={displayData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
          <Bar dataKey="income" name="Income" fill="var(--amount-positive)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="expenses" name="Expenses" fill="var(--amount-negative)" radius={[3, 3, 0, 0]} />
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
