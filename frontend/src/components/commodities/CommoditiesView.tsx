import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { enablePlugins, fetchCommodities, fetchPriceHistory } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { useCommoditiesUi } from "../../stores/commoditiesUiStore";
import { formatAmount, formatDateFull, formatDateShort } from "../../utils/format";
import PriceModal from "./PriceModal";
import CommodityModal from "./CommodityModal";
import PriceChart from "./PriceChart";
import type { CommodityRow, CommoditiesResponse, LedgerPluginName } from "../../types";

// The four ledger plugins the commodity model leans on (PLAN §2.9), with the
// one-line "why" shown next to each.
const PLUGINS: {
  key: LedgerPluginName;
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

/** Query keys whose numbers can move when a plugin lands (implicit_prices adds price points). */
const PLUGIN_DEPENDENT_KEYS = ["commodities", "prices", "price-history", "holdings", "errors"];

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
      {data && <PluginsBanner data={data} />}

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

/**
 * The plugin banner (PLAN §2.9). Self-explanatory and actionable: each of the
 * four plugins shows on/off with its "why"; an off row gets Enable, and the
 * banner an Enable all. Once all four are on it collapses to one quiet line.
 * `POST /api/plugins/enable` writes the `plugin` lines into the top-level file.
 */
function PluginsBanner({ data }: { data: CommoditiesResponse }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const off = PLUGINS.filter((p) => !data.plugins[p.key]).map((p) => p.key);

  const enable = async (names: LedgerPluginName[]) => {
    setBusy(true);
    setError(null);
    try {
      await enablePlugins(names);
      await Promise.all(
        PLUGIN_DEPENDENT_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (off.length === 0) {
    return (
      <div
        className="commodities-plugins commodities-plugins--all-on"
        title={
          data.currency_trading_account
            ? `currency_accounts → ${data.currency_trading_account}`
            : undefined
        }
      >
        <span className="commodities-plugin-state">✓</span>
        <span>All four ledger plugins are on</span>
        {data.currency_trading_account && (
          <span className="commodities-plugin-why">
            currency_accounts → {data.currency_trading_account}
          </span>
        )}
      </div>
    );
  }

  return (
    <section className="commodities-plugins" aria-label="Ledger plugins">
      <div className="commodities-plugins-head">
        <div className="commodities-plugins-text">
          <span className="commodities-plugins-title">Ledger plugins</span>
          <span className="commodities-plugins-lede">
            The commodity model relies on four Beancount plugins declared in the top-level ledger
            file. {off.length === 1 ? "One is" : `${off.length} are`} off.
          </span>
        </div>
        <button
          className="btn btn-primary commodities-plugins-enable-all"
          onClick={() => enable(off)}
          disabled={busy}
        >
          {busy ? "Enabling…" : "Enable all"}
        </button>
      </div>
      <ul className="commodities-plugins-list">
        {PLUGINS.map((p) => {
          const on = data.plugins[p.key];
          return (
            <li
              key={p.key}
              className={`commodities-plugin${on ? " on" : " off"}`}
              title={on ? `plugin "beancount.plugins.${p.name}" is on` : undefined}
            >
              <span className="commodities-plugin-state">{on ? "✓" : "off"}</span>
              <span className="commodities-plugin-name">{p.name}</span>
              {!on && (
                <button
                  className="btn-link commodities-plugin-enable"
                  onClick={() => enable([p.key])}
                  disabled={busy}
                >
                  Enable
                </button>
              )}
              <span className="commodities-plugin-why">
                {p.why}
                {on && p.key === "currency_accounts" && data.currency_trading_account && (
                  <> → {data.currency_trading_account}</>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {error && (
        <div className="commodities-plugins-error" role="alert">
          {error}
        </div>
      )}
    </section>
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
            <PriceHistory base={c.symbol} quote={quote} oc={oc} onAddPrice={onPrice} />
          </td>
        </tr>
      )}
    </>
  );
}

interface PriceHistoryProps {
  base: string;
  quote: string;
  oc: string;
  onAddPrice: () => void;
}

/** Expanded row: one header line and the full-width chart (or a one-line empty state). */
function PriceHistory({ base, quote, oc, onAddPrice }: PriceHistoryProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["price-history", base, quote],
    queryFn: () => fetchPriceHistory(base, quote),
  });

  if (isLoading) return <div className="report-loading">Loading...</div>;

  const prices = data?.prices ?? [];
  if (prices.length === 0) {
    return (
      <div className="commodities-history commodities-history--empty">
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
    <div className="commodities-history">
      <div className="commodities-history-head">
        <span className="commodities-history-title">
          {base} · {quote}
        </span>
        <span className="commodities-history-meta">
          {prices.length} {prices.length === 1 ? "price" : "prices"}
        </span>
        <span className="commodities-history-meta">
          {prices.length === 1
            ? formatDateFull(first.date, oc)
            : `${formatDateFull(first.date, oc)} → ${formatDateFull(last.date, oc)}`}
        </span>
        <span className="commodities-history-latest">
          latest {formatAmount(Number(last.number), quote)}{" "}
          <span className="text-muted">{quote}</span>
        </span>
      </div>
      <PriceChart prices={prices} quote={quote} oc={oc} />
    </div>
  );
}
