import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { formatAmount, formatDateFull, formatDateShort, getLocale } from "../../utils/format";

const DAY_MS = 86_400_000;

export interface PricePointRow {
  date: string; // YYYY-MM-DD
  number: string;
}

interface ChartPoint {
  t: number; // epoch ms at local midnight — the x value
  date: string;
  price: number;
}

/** Parse an ISO date at local midnight so ticks and tooltips agree with `formatDate*`. */
function isoToMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/**
 * Y domain for a price series: pad the observed range so the line does not
 * kiss the frame, then snap both ends to a round step so the ticks read like
 * numbers a person would write (33.5, 34, 34.5 …) rather than 32.68. Prices
 * are never forced to include zero — a 33→41 series should fill the chart.
 * A flat series (or one point) gets a ±5% band around its value.
 */
export function niceDomain(values: number[]): [number, number] {
  return niceScale(values).domain;
}

/**
 * The y scale as a whole: the rounded domain plus the ticks that sit on the
 * same step, so the axis reads 37 · 38 · 39 … 42 instead of whatever recharts
 * would interpolate between two round ends (37 · 39 · 41 · 42).
 */
export function niceScale(values: number[]): { domain: [number, number]; ticks: number[] } {
  if (values.length === 0) return { domain: [0, 1], ticks: [0, 1] };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { domain: [0, 1], ticks: [0, 1] };
  if (min === max) {
    const band = Math.abs(min) * 0.05 || 1;
    min -= band;
    max += band;
  } else {
    const pad = (max - min) * 0.08;
    min -= pad;
    max += pad;
  }
  const step = niceStep((max - min) / 5);
  // Round away float noise (0.30000000000000004) at the step's precision.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const round = (v: number) => Number(v.toFixed(decimals));
  const lo = round(Math.floor(min / step) * step);
  const hi = round(Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(round(v));
  return { domain: [lo, hi], ticks };
}

/** 1 / 2 / 2.5 / 5 × 10^k, whichever is the smallest not below `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / mag;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
  return nice * mag;
}

/**
 * X domain (epoch ms). A single price has no span, so give it a day either
 * side; otherwise the data's own extent — the padding lives in the margins.
 */
export function timeDomain(ts: number[]): [number, number] {
  if (ts.length === 0) return [0, DAY_MS];
  const min = Math.min(...ts);
  const max = Math.max(...ts);
  if (min === max) return [min - DAY_MS, max + DAY_MS];
  return [min, max];
}

interface PriceChartProps {
  /** Ascending by date, as `GET /api/prices?base&quote` returns them. */
  prices: PricePointRow[];
  quote: string;
  /** Operating currency — chooses the locale for dates. */
  oc: string;
  height?: number;
}

/**
 * Full-width price history for one base/quote pair (Accounts → Commodities,
 * PLAN-commodities-ux §3.3). Same visual language as the report charts:
 * midnight line, dashed grid, 11px secondary ticks, a small card tooltip.
 * The x axis is a real time scale so a gap of two years reads as a gap, not
 * as one step; the y axis is padded and nice-rounded (never forced to zero).
 */
export default function PriceChart({ prices, quote, oc, height = 240 }: PriceChartProps) {
  const points: ChartPoint[] = prices
    .map((p) => ({ t: isoToMs(p.date), date: p.date, price: Number(p.number) }))
    .filter((p) => Number.isFinite(p.price) && Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);

  if (points.length === 0) return null;

  const xDomain = timeDomain(points.map((p) => p.t));
  const { domain: yDomain, ticks: yTicks } = niceScale(points.map((p) => p.price));
  const spanDays = (xDomain[1] - xDomain[0]) / DAY_MS;
  const locale = getLocale(oc);

  // Under ~4 months, day/month is unambiguous; beyond that show month + year
  // so a multi-year series keeps its bearings.
  const formatXTick = (ms: number) => {
    const d = new Date(ms);
    if (spanDays <= 120) return formatDateShort(toIso(d), oc);
    return d.toLocaleDateString(locale, { month: "short", year: "2-digit" });
  };
  const formatYTick = (v: number) => formatAmount(v, quote);
  const single = points.length === 1;

  return (
    <div className="commodities-chart" role="img" aria-label={`${points.length} prices in ${quote}`}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={points} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={xDomain}
            tickFormatter={formatXTick}
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            minTickGap={28}
            tickCount={single ? 3 : undefined}
          />
          <YAxis
            domain={yDomain}
            ticks={yTicks}
            tickFormatter={formatYTick}
            tick={{ fontSize: 11, fill: "var(--text-secondary)" }}
            axisLine={false}
            tickLine={false}
            width={64}
            allowDecimals
          />
          <Tooltip
            cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
            isAnimationActive={false}
            content={(props) => <PriceTooltip {...props} quote={quote} oc={oc} />}
          />
          <Line
            type="monotone"
            dataKey="price"
            name={quote}
            stroke="var(--midnight-700)"
            strokeWidth={1.5}
            dot={single ? { r: 4, fill: "var(--midnight-700)", strokeWidth: 0 } : false}
            activeDot={{ r: 4, fill: "var(--midnight-700)", stroke: "var(--bg-secondary)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function toIso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

type PriceTooltipProps = Partial<TooltipContentProps> & {
  quote: string;
  oc: string;
};

/** Date on one line, price + quote on the next — the report tooltip look. */
function PriceTooltip({ active, payload, quote, oc }: PriceTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as ChartPoint | undefined;
  if (!point) return null;
  return (
    <div className="commodities-chart-tooltip">
      <div className="commodities-chart-tooltip-date">{formatDateFull(point.date, oc)}</div>
      <div className="commodities-chart-tooltip-price">
        {formatAmount(point.price, quote)} <span className="text-muted">{quote}</span>
      </div>
    </div>
  );
}
