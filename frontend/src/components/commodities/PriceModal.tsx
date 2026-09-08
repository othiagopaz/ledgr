import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCommodities, addPrice } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { useCommoditiesUi } from "../../stores/commoditiesUiStore";
import { today, parseSmartDate } from "../../utils/dateUtils";
import { formatDateFull, getDatePlaceholder } from "../../utils/format";

/** Accept "5,50" or "5.50"; return a canonical decimal string or null. */
function normalizeNumber(raw: string): string | null {
  const s = raw.trim().replace(/\s/g, "");
  if (!s) return null;
  // One separator only: a comma is a decimal mark when it is the only one.
  const canonical =
    s.includes(",") && !s.includes(".") ? s.replace(",", ".") : s.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(canonical)) return null;
  if (Number(canonical) <= 0) return null;
  return canonical;
}

/** Query keys whose numbers move when a price lands. */
const PRICE_DEPENDENT_KEYS = [
  "commodities", "prices", "price-history", "holdings", "balance-sheet",
  "net-worth", "account-balance", "income-statement", "accounts",
];

/**
 * Update price (PLAN-commodities-ux §3.3, contract §4.5) — one `price`
 * directive: date, base, number, quote. Same keyboard contract as
 * AccountModal: Esc closes, Cmd/Ctrl+Enter saves.
 */
export default function PriceModal() {
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);
  const presetBase = useCommoditiesUi((s) => s.priceModalBase);
  const close = useCommoditiesUi((s) => s.closePriceModal);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["commodities"],
    queryFn: () => fetchCommodities(),
  });
  const oc = data?.operating_currency || operatingCurrency;
  const bases = (data?.commodities ?? [])
    .filter((c) => !c.is_operating)
    .map((c) => c.symbol);
  if (presetBase && !bases.includes(presetBase)) bases.unshift(presetBase);

  const [date, setDate] = useState(formatDateFull(today(), oc));
  // Derived default: the first commodity until the user picks one, so the
  // select is never blank once the catalog has arrived.
  const [pickedBase, setBase] = useState(presetBase ?? "");
  const base = pickedBase || bases[0] || "";
  const [number, setNumber] = useState("");
  const [quote, setQuote] = useState(oc);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const numberRef = useRef<HTMLInputElement>(null);
  const baseRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    (presetBase ? numberRef : baseRef).current?.focus();
  }, [presetBase]);

  async function handleSave() {
    if (saving) return;
    setError(null);

    const parsedDate = parseSmartDate(date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) {
      setError("Enter a valid date.");
      return;
    }
    const symbol = base.trim().toUpperCase();
    if (!symbol) {
      setError("Pick the commodity being priced.");
      return;
    }
    const num = normalizeNumber(number);
    if (!num) {
      setError("Enter a positive price, e.g. 5.50.");
      return;
    }
    const q = quote.trim().toUpperCase() || oc;
    if (q === symbol) {
      setError("Quote currency must differ from the commodity.");
      return;
    }

    setSaving(true);
    try {
      await addPrice({ date: parsedDate, base: symbol, number: num, quote: q });
      for (const key of PRICE_DEPENDENT_KEYS) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      close();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }

  const datePlaceholder = getDatePlaceholder(oc);

  return (
    <div className="modal-overlay" onMouseDown={close}>
      <div
        className="modal price-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <span>Update price</span>
          <button onClick={close} aria-label="Close">&times;</button>
        </div>

        <div className="modal-body">
          <div className="form-row">
            <div className="form-field" style={{ flex: "0 0 130px" }}>
              <label>Date</label>
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onBlur={() => {
                  const parsed = parseSmartDate(date);
                  if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) setDate(formatDateFull(parsed, oc));
                }}
                placeholder={datePlaceholder}
              />
            </div>
            <div className="form-field">
              <label>Commodity</label>
              <select ref={baseRef} value={base} onChange={(e) => setBase(e.target.value)}>
                {bases.length === 0 && <option value="">— no commodities yet —</option>}
                {bases.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Price</label>
              <input
                ref={numberRef}
                type="text"
                inputMode="decimal"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="5.50"
                autoComplete="off"
              />
            </div>
            <div className="form-field" style={{ flex: "0 0 110px" }}>
              <label>Quote</label>
              <input
                type="text"
                value={quote}
                onChange={(e) => setQuote(e.target.value.toUpperCase())}
                placeholder={oc}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="form-hint price-modal-preview">
            {base && normalizeNumber(number)
              ? `${parseSmartDate(date)} price ${base} ${normalizeNumber(number)} ${quote || oc}`
              : "Writes one price directive to the ledger."}
          </div>

          {error && <div className="error-msg">{error}</div>}

          <div className="form-actions">
            <span className="form-hint">
              {navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"}+Enter to save
            </span>
            <button className="btn" onClick={close}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !base}
            >
              {saving ? "Saving…" : "Add price"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
