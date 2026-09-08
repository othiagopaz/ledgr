import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCommodities, fetchPriceHistory } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { useCommoditiesUi } from "../../stores/commoditiesUiStore";
import { formatAmount, formatDateFull, formatDateShort } from "../../utils/format";
import PriceModal from "./PriceModal";
import CommodityModal from "./CommodityModal";
import type { CommodityRow, CommoditiesResponse } from "../../types";

// The four ledger plugins the commodity model leans on (PLAN §2.9), with the
// one-line "why" shown when the loaded ledger does not have one.
const PLUGINS: {
  key: keyof CommoditiesResponse["plugins"];
  name: string;
  why: string;
}[] = [
  {
    key: "implicit_prices",
    name: "implicit_prices",
    why: "Turns every @ price and {} cost into a price point, so market values follow your trades without typing prices by hand.",
  },
  {
    key: "coherent_cost",
    name: "coherent_cost",
    why: "Refuses to mix held-at-cost and held-at-price for one commodity, which is what keeps gains computable.",
  },
  {
    key: "check_average_cost",
    name: "check_average_cost",
    why: "Guards NONE-booking sales: a pre-filled cost more than 1% off the average is rejected (Brazilian average cost).",
  },
  {
    key: "currency_accounts",
    name: "currency_accounts",
    why: "Books the FX result of spend accounts into Equity:CurrencyTrading so a coffee in USD is just an expense.",
  },
];

/**
 * Accounts → Commodities (PLAN-commodities-ux §3.3): every commodity seen in
 * the ledger, declared or not, with holders, latest price and price history,
 * plus the two write actions (declare, price) and the plugin banner.
 */
export default function CommoditiesView() {
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);
  const openPriceModal = useCommoditiesUi((s) => s.openPriceModal);
  const openCommodityModal = useCommoditiesUi((s) => s.openCommodityModal);
  const priceModalOpen = useCommoditiesUi((s) => s.priceModalOpen);
  const commodityModalOpen = useCommoditiesUi((s) => s.commodityModalOpen);

  const [showOperating, setShowOperating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["commodities"],
    queryFn: () => fetchCommodities(),
  });

  const oc = data?.operating_currency || operatingCurrency;

  const rows = (data?.commodities ?? []).filter(
    (c) => showOperating || !c.is_operating,
  );
  const operatingCount = (data?.commodities ?? []).filter((c) => c.is_operating).length;

  return (
    <div className="commodities-view">
      {data && (
        <div className="commodities-plugins" role="list" aria-label="Ledger plugins">
          {PLUGINS.map((p) => {
            const on = data.plugins[p.key];
            return (
              <div
                key={p.key}
                role="listitem"
                className={`commodities-plugin${on ? " on" : " off"}`}
                title={on ? `plugin "beancount.plugins.${p.name}" is on` : p.why}
              >
                <span className="commodities-plugin-state">{on ? "✓" : "off"}</span>
                <span className="commodities-plugin-name">{p.name}</span>
                {!on && <span className="commodities-plugin-why">{p.why}</span>}
                {on && p.key === "currency_accounts" && data.currency_trading_account && (
                  <span className="commodities-plugin-why">→ {data.currency_trading_account}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="commodities-toolbar">
        <span className="commodities-count">
          {isLoading ? "Loading…" : `${rows.length} ${rows.length === 1 ? "commodity" : "commodities"}`}
        </span>
        {operatingCount > 0 && (
          <label className="checkbox-label commodities-toggle">
            <input
              type="checkbox"
              checked={showOperating}
              onChange={(e) => setShowOperating(e.target.checked)}
            />
            Show {oc}
          </label>
        )}
      </div>

      {isLoading ? (
        <div className="report-loading">Loading...</div>
      ) : !data ? (
        <div className="report-empty">No data</div>
      ) : rows.length === 0 ? (
        <div className="report-empty commodities-empty">
          <div>No commodities besides {oc}.</div>
          <div>
            <button className="dashboard-link-btn" onClick={() => openCommodityModal()}>
              Declare one
            </button>{" "}
            or record a buy — the ledger picks the symbol up either way.
          </div>
        </div>
      ) : (
        <div className="report-table-wrapper commodities-table-wrapper">
          <table className="report-table commodities-table">
            <thead>
              <tr>
                <th className="report-table-account">Symbol</th>
                <th>Name</th>
                <th className="report-table-num">Precision</th>
                <th>Holders</th>
                <th className="report-table-num">Latest price</th>
                <th className="report-table-num">Pairs</th>
                <th className="commodities-actions-col" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <CommodityRows
                  key={c.symbol}
                  c={c}
                  oc={oc}
                  isOpen={expanded === c.symbol}
                  onToggle={() => setExpanded((prev) => (prev === c.symbol ? null : c.symbol))}
                  onDeclare={() => openCommodityModal(c.symbol)}
                  onPrice={() => openPriceModal(c.symbol)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {priceModalOpen && <PriceModal />}
      {commodityModalOpen && <CommodityModal />}
    </div>
  );
}

interface CommodityRowsProps {
  c: CommodityRow;
  oc: string;
  isOpen: boolean;
  onToggle: () => void;
  onDeclare: () => void;
  onPrice: () => void;
}

function CommodityRows({ c, oc, isOpen, onToggle, onDeclare, onPrice }: CommodityRowsProps) {
  const pairCount = c.pairs.reduce((n, p) => n + p.count, 0);
  const quote = c.latest_price?.quote ?? c.pairs[0]?.quote ?? oc;
  const hasPrices = c.pairs.length > 0;
  const colCount = 7;

  return (
    <>
      <tr
        className={`report-tree-row commodities-row${hasPrices ? " report-tree-parent" : ""}${isOpen ? " open" : ""}`}
        onClick={() => hasPrices && onToggle()}
        onKeyDown={(e) => {
          if (hasPrices && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onToggle(); }
        }}
        tabIndex={hasPrices ? 0 : undefined}
        role={hasPrices ? "button" : undefined}
        aria-expanded={hasPrices ? isOpen : undefined}
      >
        <td className="report-table-account commodities-symbol">
          <span className="report-tree-toggle">{hasPrices ? (isOpen ? "▾" : "▸") : ""}</span>
          <span className="holdings-symbol">{c.symbol}</span>
          {c.is_operating && <span className="type-badge">operating</span>}
          {!c.declared && <span className="type-badge type-badge--undeclared">not declared</span>}
        </td>
        <td className={c.name ? undefined : "text-muted"}>{c.name ?? "—"}</td>
        <td className="report-table-num">{c.precision ?? <span className="text-muted">—</span>}</td>
        <td>
          {c.holders.length === 0 ? (
            <span className="text-muted">—</span>
          ) : (
            <div className="commodities-holders">
              {c.holders.map((h) => (
                <span key={h} className="chip tag-chip" title={h}>
                  {h.split(":").slice(-2).join(":")}
                </span>
              ))}
            </div>
          )}
        </td>
        <td className="report-table-num">
          {c.latest_price ? (
            <>
              {formatAmount(Number(c.latest_price.number), c.latest_price.quote)}{" "}
              <span className="text-muted">{c.latest_price.quote}</span>
              <span className="holdings-price-date">{formatDateShort(c.latest_price.date, oc)}</span>
            </>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="report-table-num">
          {pairCount > 0 ? (
            <span title={c.pairs.map((p) => `${c.symbol}/${p.quote}: ${p.count}`).join("\n")}>
              {pairCount}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="commodities-actions-col" onClick={(e) => e.stopPropagation()}>
          <button className="btn-link" onClick={onDeclare}>
            {c.declared ? "Edit" : "Declare"}
          </button>
          {!c.is_operating && (
            <button className="btn-link" onClick={onPrice}>Price</button>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr className="commodities-history-row">
          <td colSpan={colCount}>
            <PriceHistory base={c.symbol} quote={quote} oc={oc} />
          </td>
        </tr>
      )}
    </>
  );
}

function PriceHistory({ base, quote, oc }: { base: string; quote: string; oc: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["price-history", base, quote],
    queryFn: () => fetchPriceHistory(base, quote),
  });

  if (isLoading) return <div className="report-loading">Loading...</div>;
  if (!data || data.prices.length === 0) {
    return <div className="report-empty">No prices for {base}/{quote}.</div>;
  }

  // Ascending by date from the API; list newest first, sparkline oldest→newest.
  const points = data.prices.map((p) => Number(p.number));
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const W = 160;
  const H = 32;
  const path = points
    .map((v, i) => {
      const x = points.length === 1 ? W / 2 : (i / (points.length - 1)) * W;
      const y = H - ((v - min) / span) * (H - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const newestFirst = [...data.prices].reverse();

  return (
    <div className="commodities-history">
      <div className="commodities-history-head">
        <span className="commodities-history-title">
          {base}/{quote} · {data.prices.length} {data.prices.length === 1 ? "price" : "prices"}
        </span>
        <svg
          className="commodities-sparkline"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          aria-hidden="true"
        >
          <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} />
        </svg>
      </div>
      <ul className="commodities-history-list">
        {newestFirst.map((p) => (
          <li key={p.date}>
            <span className="commodities-history-date">{formatDateFull(p.date, oc)}</span>
            <span className="commodities-history-value">
              {formatAmount(Number(p.number), quote)} {quote}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
