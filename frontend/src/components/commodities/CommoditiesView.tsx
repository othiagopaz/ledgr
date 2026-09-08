import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAccountNames, fetchCommodities, setPlugins } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { useCommoditiesUi } from "../../stores/commoditiesUiStore";
import { formatAmount, formatDateShort } from "../../utils/format";
import InlineAutocomplete from "../InlineAutocomplete";
import PriceModal from "./PriceModal";
import CommodityModal from "./CommodityModal";
import type {
  CommodityRow,
  CommoditiesResponse,
  LedgerPluginName,
  SetPluginsInput,
} from "../../types";

// The four ledger plugins the commodity model leans on (PLAN §2.9), with the
// one-line "why" shown on each card.
const PLUGINS: {
  key: LedgerPluginName;
  name: string;
  why: string;
}[] = [
  {
    key: "implicit_prices",
    name: "implicit_prices",
    why: "Every @ price and {} cost becomes a price point, so market values follow your trades without typing prices by hand.",
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
    why: "Books the FX result of spend accounts into one Equity account, so a coffee in USD is just an expense.",
  },
];

/** The backend's own default when `currency_trading_account` is omitted. */
const DEFAULT_TRADING_ACCOUNT = "Equity:CurrencyTrading";

/** Query keys whose numbers can move when a plugin lands or leaves (implicit_prices adds price points). */
const PLUGIN_DEPENDENT_KEYS = ["commodities", "prices", "price-history", "holdings", "errors", "accounts"];

/**
 * Accounts → Commodities (PLAN-commodities-ux §3.3): the catalog of every
 * commodity seen in the ledger, declared or not, plus the two write actions
 * (declare, price) and the ledger-plugin toggles. Configuration and creation
 * only — price history lives under Reports → Holdings.
 */
export default function CommoditiesView() {
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);
  const openPriceModal = useCommoditiesUi((s) => s.openPriceModal);
  const openCommodityModal = useCommoditiesUi((s) => s.openCommodityModal);
  const priceModalOpen = useCommoditiesUi((s) => s.priceModalOpen);
  const commodityModalOpen = useCommoditiesUi((s) => s.commodityModalOpen);

  const [showOperating, setShowOperating] = useState(false);

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
      {data && <PluginToggles data={data} />}

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
                <th className="commodities-meta-col">Metadata</th>
                <th>Holders</th>
                <th className="report-table-num">Latest price</th>
                <th className="report-table-num">Prices</th>
                <th className="commodities-actions-col" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <CommodityRowView
                  key={c.symbol}
                  c={c}
                  oc={oc}
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

interface CommodityRowViewProps {
  c: CommodityRow;
  oc: string;
  onDeclare: () => void;
  onPrice: () => void;
}

/** One catalog row: what the commodity is, who holds it, and its latest price. */
function CommodityRowView({ c, oc, onDeclare, onPrice }: CommodityRowViewProps) {
  const priceCount = c.pairs.reduce((n, p) => n + p.count, 0);
  const metadata = Object.entries(c.metadata);

  return (
    <tr className="commodities-row">
      <td className="report-table-account commodities-symbol">
        <span className="holdings-symbol">{c.symbol}</span>
        {c.is_operating && <span className="type-badge">operating</span>}
        {!c.declared && <span className="type-badge type-badge--undeclared">not declared</span>}
      </td>
      <td className={c.name ? undefined : "text-muted"}>{c.name ?? "—"}</td>
      <td className="report-table-num">{c.precision ?? <span className="text-muted">—</span>}</td>
      <td className="commodities-meta-col">
        {metadata.length === 0 ? (
          <span className="text-muted">—</span>
        ) : (
          <dl className="commodities-meta">
            {metadata.map(([key, value]) => (
              <div key={key} className="commodities-meta-item">
                <dt>{key}</dt>
                <dd title={value}>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </td>
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
        {priceCount > 0 ? (
          <span title={c.pairs.map((p) => `${c.symbol}/${p.quote}: ${p.count}`).join("\n")}>
            {priceCount}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="commodities-actions-col">
        <button className="btn-link" onClick={onDeclare}>
          {c.declared ? "Edit" : "Declare"}
        </button>
        {!c.is_operating && (
          <button className="btn-link" onClick={onPrice}>Price</button>
        )}
      </td>
    </tr>
  );
}

/**
 * The plugin toggles (PLAN §2.9). Each of the four plugins is one card that is
 * itself the switch: click (or Space / Enter) turns it on or off through
 * `POST /api/plugins`, which rewrites the `plugin` lines in the top-level
 * file. `currency_accounts` first asks which Equity account should carry the
 * FX result, in a popover anchored to its card.
 */
function PluginToggles({ data }: { data: CommoditiesResponse }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<LedgerPluginName | null>(null);
  const [error, setError] = useState<{ key: LedgerPluginName; message: string } | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  /** Run one plugin change; resolves true on success, false (with the error shown inline) otherwise. */
  const run = async (key: LedgerPluginName, body: SetPluginsInput): Promise<boolean> => {
    setBusy(key);
    setError(null);
    try {
      await setPlugins(body);
      await Promise.all(
        PLUGIN_DEPENDENT_KEYS.map((k) => queryClient.invalidateQueries({ queryKey: [k] })),
      );
      return true;
    } catch (e) {
      setError({ key, message: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const toggle = (key: LedgerPluginName) => {
    if (busy) return;
    if (data.plugins[key]) {
      void run(key, { disable: [key] });
      return;
    }
    if (key === "currency_accounts") {
      setError(null);
      setPopoverOpen(true);
      return;
    }
    void run(key, { enable: [key] });
  };

  const submitTradingAccount = async (account: string) => {
    const ok = await run("currency_accounts", {
      enable: ["currency_accounts"],
      currency_trading_account: account,
    });
    if (ok) setPopoverOpen(false);
  };

  return (
    <section className="plugin-cards" aria-label="Ledger plugins">
      <div className="plugin-cards-label">Ledger plugins</div>
      <div className="plugin-cards-grid">
        {PLUGINS.map((p) => (
          <PluginCard
            key={p.key}
            name={p.name}
            why={p.why}
            on={data.plugins[p.key]}
            busy={busy === p.key}
            locked={busy !== null && busy !== p.key}
            error={error?.key === p.key ? error.message : null}
            onToggle={() => toggle(p.key)}
            account={
              p.key === "currency_accounts"
                ? { value: data.currency_trading_account, popoverOpen }
                : null
            }
            onOpenPopover={() => { setError(null); setPopoverOpen(true); }}
            onClosePopover={() => { setError(null); setPopoverOpen(false); }}
            onSubmitPopover={submitTradingAccount}
          />
        ))}
      </div>
    </section>
  );
}

interface PluginCardProps {
  name: string;
  why: string;
  on: boolean;
  /** This card's request is in flight. */
  busy: boolean;
  /** Another card's request is in flight — one change at a time. */
  locked: boolean;
  error: string | null;
  onToggle: () => void;
  /** Only for `currency_accounts`: the configured account and the popover state. */
  account: { value: string | null; popoverOpen: boolean } | null;
  onOpenPopover: () => void;
  onClosePopover: () => void;
  onSubmitPopover: (account: string) => void;
}

function PluginCard({
  name, why, on, busy, locked, error, onToggle, account,
  onOpenPopover, onClosePopover, onSubmitPopover,
}: PluginCardProps) {
  const disabled = busy || locked;
  const popoverOpen = account?.popoverOpen ?? false;

  return (
    <div className="plugin-card-wrap">
      <div
        role="switch"
        aria-checked={on}
        aria-disabled={disabled || undefined}
        aria-label={`${name} plugin`}
        tabIndex={disabled ? -1 : 0}
        className={`plugin-card${on ? " on" : " off"}${busy ? " busy" : ""}`}
        title={
          busy
            ? "Saving…"
            : on
              ? `plugin "beancount.plugins.${name}" is on — click to turn it off`
              : `Click to add plugin "beancount.plugins.${name}" to the ledger`
        }
        onClick={() => { if (!disabled) onToggle(); }}
        onKeyDown={(e) => {
          // Only when the switch itself has focus — not the "change" button inside it.
          if (e.target !== e.currentTarget) return;
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            if (!disabled) onToggle();
          }
        }}
      >
        <span className="plugin-card-head">
          <span className="plugin-card-state" aria-hidden="true">
            {busy ? "…" : on ? "✓" : ""}
          </span>
          <span className="plugin-card-name">{name}</span>
        </span>
        <span className="plugin-card-why">{why}</span>
        {account && on && (
          <span className="plugin-card-account">
            <span className="plugin-card-account-name" title={account.value ?? undefined}>
              {account.value ?? DEFAULT_TRADING_ACCOUNT}
            </span>
            <button
              type="button"
              className="btn-link plugin-card-change"
              disabled={disabled}
              onClick={(e) => { e.stopPropagation(); onOpenPopover(); }}
            >
              change
            </button>
          </span>
        )}
      </div>
      {error && !popoverOpen && (
        <div className="plugin-card-error" role="alert">{error}</div>
      )}
      {account && popoverOpen && (
        <TradingAccountPopover
          initial={account.value ?? DEFAULT_TRADING_ACCOUNT}
          busy={busy}
          error={error}
          onCancel={onClosePopover}
          onSubmit={onSubmitPopover}
        />
      )}
    </div>
  );
}

interface TradingAccountPopoverProps {
  initial: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (account: string) => void;
}

/**
 * "Which Equity account carries the FX result?" — asked before
 * `currency_accounts` is turned on, and again from "change" once it is. Typing
 * a name that does not exist yet is fine: the backend opens the account.
 */
function TradingAccountPopover({ initial, busy, error, onCancel, onSubmit }: TradingAccountPopoverProps) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["account-names"],
    queryFn: () => fetchAccountNames(),
    staleTime: 5 * 60 * 1000,
  });
  const equityAccounts = (data?.accounts ?? []).filter((a) => a.startsWith("Equity:"));

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Click outside closes, like the other dropdowns.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onCancel();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onCancel]);

  const trimmed = value.trim();
  // The backend is the validator ("must be under Equity", 400 with a detail
  // shown inline); the button only needs something to send.
  const valid = trimmed.length > 0;
  const submit = () => { if (!busy && valid) onSubmit(trimmed); };

  return (
    <div
      ref={rootRef}
      className="plugin-popover"
      role="dialog"
      aria-label="Currency trading account"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
      }}
    >
      <label className="plugin-popover-label">
        Currency trading account
        <InlineAutocomplete
          value={value}
          onChange={setValue}
          options={equityAccounts}
          placeholder={DEFAULT_TRADING_ACCOUNT}
          inputRef={inputRef}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submit(); }
          }}
        />
      </label>
      <div className="plugin-popover-help">
        Both legs of every exchange are posted here; its market value is the FX result shown in Holdings.
      </div>
      {error && <div className="plugin-popover-error" role="alert">{error}</div>}
      <div className="plugin-popover-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !valid}>
          {busy ? "Enabling…" : "Enable"}
        </button>
      </div>
    </div>
  );
}
