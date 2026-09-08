import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchHoldings, fetchCommodities, fetchPriceHistory } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { useCommoditiesUi } from "../../stores/commoditiesUiStore";
import { useFilterParams } from "../../hooks/useFilterParams";
import { formatAmount, formatDateFull, formatDateShort, getLocale } from "../../utils/format";
import {
  isPriceStale, priceAgeTitle, formatUnits, formatPct, signClassOf,
  lotTotalCost, hasExpandableLots,
} from "../../utils/holdings";
import PriceChart from "./PriceChart";
import PriceModal from "../commodities/PriceModal";
import type { HoldingPosition } from "../../types";

/** Columns in the holdings table — the expanded detail row spans them all. */
const COL_COUNT = 9;

function money(value: string | null | undefined, currency: string): string {
  if (value == null) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatAmount(n, currency) : value;
}

/**
 * Holdings — one row per (account, commodity) that is not the operating
 * currency (PLAN-commodities-ux §3.2, contract §4.6). Everything is computed
 * server-side by Beancount/Fava; this table only lays it out. A row expands
 * into the commodity's price history (chart + Add price) and, when the
 * booking keeps them, its lots.
 */
export default function HoldingsTable() {
  const currency = useAppStore((s) => s.operatingCurrency);
  const viewMode = useAppStore((s) => s.viewMode);
  const openComposer = useAppStore((s) => s.openComposer);
  const openPriceModal = useCommoditiesUi((s) => s.openPriceModal);
  const priceModalOpen = useCommoditiesUi((s) => s.priceModalOpen);
  const filters = useFilterParams();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["holdings", viewMode, filters],
    queryFn: () => fetchHoldings(viewMode, filters),
  });

  // Names and precisions come from the catalog; the tooltip and unit
  // formatting degrade gracefully while it loads or if it is missing.
  const commoditiesQuery = useQuery({
    queryKey: ["commodities"],
    queryFn: () => fetchCommodities(),
    staleTime: 5 * 60 * 1000,
  });
  const catalog = new Map(
    (commoditiesQuery.data?.commodities ?? []).map((c) => [c.symbol, c]),
  );

  if (isLoading) return <div className="report-loading">Loading...</div>;
  if (!data) return <div className="report-empty">No data</div>;

  const oc = data.operating_currency || currency;
  const locale = getLocale(oc);

  if (data.positions.length === 0) {
    return (
      <div className="report-empty holdings-empty">
        <div>No holdings yet.</div>
        <div>
          Holdings appear once an account holds something other than {oc} —{" "}
          <button
            className="dashboard-link-btn"
            // TODO(merge): 'commodity' is added to ComposerOpts.initial by the
            // FE-writes stream (Composer "Commodity" disclosure). Drop the cast
            // once both streams are on the same branch.
            onClick={() => openComposer({ initial: "commodity" })}
          >
            New — Commodity
          </button>{" "}
          records the first buy.
        </div>
      </div>
    );
  }

  const rowKey = (p: HoldingPosition) => `${p.account}|${p.commodity}`;
  const toggle = (p: HoldingPosition) => {
    const key = rowKey(p);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const totals = data.totals;
  const totalCost = Number(totals.cost_total);
  const totalUnrealizedPct =
    Number.isFinite(totalCost) && Math.abs(totalCost) > 0.000001
      ? String((Number(totals.unrealized) / totalCost) * 100)
      : null;

  const lensNote =
    data.conversion === "units"
      ? `Valued in units — switch Value to At market (${oc}) for market values and unrealised gains.`
      : data.conversion === "at_cost"
        ? `Valued at cost — switch Value to At market (${oc}) for market values and unrealised gains.`
        : null;

  return (
    <div className="report-statement">
      {lensNote && <div className="report-chart-note">{lensNote}</div>}

      {data.fx_result && (() => {
        // The API returns the market value of the Equity:CurrencyTrading pair
        // in Beancount's equity sign (credit-negative). Readers think in gains,
        // so the card shows the gain: −500 in equity is a +500 FX result.
        const gain = String(-Number(data.fx_result.market_value));
        return (
          <div
            className="holdings-fx"
            title="Realised and unrealised FX result together — the market value of the currency_accounts pair, shown as a gain (positive = you are ahead)."
          >
            <span className="holdings-fx-label">FX result</span>
            <span className="holdings-fx-account">({data.fx_result.account})</span>
            <span className={`holdings-fx-value ${signClassOf(gain)}`}>
              {money(gain, oc)} {oc}
            </span>
          </div>
        );
      })()}

      <div className="report-table-wrapper">
        <table className="report-table holdings-table">
          <thead>
            <tr>
              <th className="report-table-account">Commodity</th>
              <th>Account</th>
              <th className="report-table-num">Units</th>
              <th className="report-table-num">Avg cost</th>
              <th className="report-table-num">Total cost</th>
              <th className="report-table-num">Price</th>
              <th className="report-table-num">Market value</th>
              <th className="report-table-num">Unrealised</th>
              <th className="report-table-num">Weight</th>
            </tr>
          </thead>
          <tbody>
            {data.positions.map((p) => {
              const key = rowKey(p);
              const meta = catalog.get(p.commodity);
              return (
                <HoldingRows
                  key={key}
                  p={p}
                  isOpen={expanded.has(key)}
                  onToggle={() => toggle(p)}
                  onAddPrice={() => openPriceModal(p.commodity)}
                  name={meta?.name ?? null}
                  precision={meta?.precision ?? null}
                  stale={isPriceStale(p.price_age_days)}
                  costCcy={p.cost_currency ?? oc}
                  oc={oc}
                  locale={locale}
                />
              );
            })}

            <tr className="report-table-subtotal">
              <td>Total</td>
              <td />
              <td className="report-table-num" />
              <td className="report-table-num" />
              <td className="report-table-num">{money(totals.cost_total, oc)}</td>
              <td className="report-table-num" />
              <td className="report-table-num">{money(totals.market_value, oc)}</td>
              <td className={`report-table-num ${signClassOf(totals.unrealized)}`}>
                {money(totals.unrealized, oc)}
                <span className="holdings-pct">{formatPct(totalUnrealizedPct, locale)}</span>
              </td>
              <td className="report-table-num">{formatPct("100", locale).replace(/^\+/, "")}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {priceModalOpen && <PriceModal />}
    </div>
  );
}

interface HoldingRowsProps {
  p: HoldingPosition;
  isOpen: boolean;
  onToggle: () => void;
  onAddPrice: () => void;
  name: string | null;
  precision: number | null;
  stale: boolean;
  costCcy: string;
  oc: string;
  locale: string;
}

function HoldingRows({
  p, isOpen, onToggle, onAddPrice, name, precision, stale, costCcy, oc, locale,
}: HoldingRowsProps) {
  const unrealisedTitle = p.held_at_cost ? undefined : "Held at price: no cost basis";
  const showLots = isOpen && hasExpandableLots(p);
  // The chart pairs the commodity with whatever it is priced in; a position
  // without a price yet falls back to the operating currency.
  const quote = p.price?.quote ?? oc;

  return (
    <>
      <tr
        className={`report-tree-row report-tree-parent holdings-row${isOpen ? " open" : ""}`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={isOpen}
      >
        <td className="report-table-account holdings-commodity" title={name ?? undefined}>
          <span className="report-tree-toggle">{isOpen ? "▾" : "▸"}</span>
          <span className="holdings-symbol">{p.commodity}</span>
          {p.booking && <span className="holdings-booking">{p.booking}</span>}
        </td>
        <td className="holdings-account">{p.account}</td>
        <td className="report-table-num">{formatUnits(p.units, precision, locale)}</td>
        <td className="report-table-num">
          {p.avg_cost != null ? money(p.avg_cost, costCcy) : "—"}
        </td>
        <td className="report-table-num">
          {p.cost_total != null ? money(p.cost_total, costCcy) : "—"}
        </td>
        <td className="report-table-num">
          {p.price ? (
            <>
              {money(p.price.number, p.price.quote)}
              <span
                className={`holdings-price-date${stale ? " holdings-price-stale" : ""}`}
                title={priceAgeTitle(p.price_age_days)}
              >
                {formatDateShort(p.price.date, oc)}
              </span>
            </>
          ) : (
            <span className="text-muted" title="No price for this commodity yet">—</span>
          )}
        </td>
        <td className="report-table-num">{money(p.market_value, oc)}</td>
        <td
          className={`report-table-num ${p.held_at_cost ? signClassOf(p.unrealized) : "text-muted"}`}
          title={unrealisedTitle}
        >
          {p.held_at_cost && p.unrealized != null ? (
            <>
              {money(p.unrealized, oc)}
              <span className="holdings-pct">{formatPct(p.unrealized_pct, locale)}</span>
            </>
          ) : (
            "—"
          )}
        </td>
        <td className="report-table-num">{formatPct(p.weight_pct, locale).replace(/^\+/, "")}</td>
      </tr>

      {isOpen && (
        <tr className="holdings-detail-row">
          <td colSpan={COL_COUNT}>
            <PriceHistory base={p.commodity} quote={quote} oc={oc} onAddPrice={onAddPrice} />
          </td>
        </tr>
      )}

      {showLots && p.lots!.map((lot, i) => (
        <tr key={`${lot.date}-${lot.label ?? ""}-${i}`} className="report-tree-row holdings-lot-row">
          <td className="report-table-account holdings-lot-label" style={{ paddingLeft: "40px" }}>
            lot · {formatDateShort(lot.date, oc)}
            {lot.label && <span className="holdings-lot-tag">{lot.label}</span>}
          </td>
          <td />
          <td className="report-table-num">{formatUnits(lot.units, precision, locale)}</td>
          <td className="report-table-num">{money(lot.cost, costCcy)}</td>
          <td className="report-table-num">{formatAmount(lotTotalCost(lot), costCcy)}</td>
          <td className="report-table-num" />
          <td className="report-table-num" />
          <td className="report-table-num" />
          <td className="report-table-num" />
        </tr>
      ))}
    </>
  );
}

interface PriceHistoryProps {
  base: string;
  quote: string;
  oc: string;
  onAddPrice: () => void;
}

/**
 * The expanded row: one header line (pair, count, first → last, latest, Add
 * price) and the full-width chart — or a one-line empty state that still
 * offers Add price.
 */
function PriceHistory({ base, quote, oc, onAddPrice }: PriceHistoryProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["price-history", base, quote],
    queryFn: () => fetchPriceHistory(base, quote),
  });

  if (isLoading) return <div className="price-history price-history--empty">Loading…</div>;

  const prices = data?.prices ?? [];
  if (prices.length === 0) {
    return (
      <div className="price-history price-history--empty">
        No prices for {base}/{quote} yet —{" "}
        <button className="dashboard-link-btn" onClick={onAddPrice}>
          Add price
        </button>
        .
      </div>
    );
  }

  // Ascending by date from the API.
  const first = prices[0];
  const last = prices[prices.length - 1];

  return (
    <div className="price-history">
      <div className="price-history-head">
        <span className="price-history-title">
          {base} · {quote}
        </span>
        <span className="price-history-meta">
          {prices.length} {prices.length === 1 ? "price" : "prices"}
        </span>
        <span className="price-history-meta">
          {prices.length === 1
            ? formatDateFull(first.date, oc)
            : `${formatDateFull(first.date, oc)} → ${formatDateFull(last.date, oc)}`}
        </span>
        <span className="price-history-latest">
          latest {formatAmount(Number(last.number), quote)}{" "}
          <span className="text-muted">{quote}</span>
        </span>
        <button className="btn-link price-history-action" onClick={onAddPrice}>
          Add price
        </button>
      </div>
      <PriceChart prices={prices} quote={quote} oc={oc} height={200} />
    </div>
  );
}
