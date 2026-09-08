import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCommodities, createCommodity, updateCommodity } from "../../api/client";
import { useAppStore } from "../../stores/appStore";
import { useCommoditiesUi } from "../../stores/commoditiesUiStore";
import { today, parseSmartDate } from "../../utils/dateUtils";
import { formatDateFull, getDatePlaceholder } from "../../utils/format";

/** Beancount commodity syntax: uppercase start, then up to 23 of [A-Z0-9'._-]. */
export const COMMODITY_SYMBOL_RE = /^[A-Z][A-Z0-9'._-]{0,23}$/;

interface MetadataRow {
  id: number;
  key: string;
  value: string;
}

let nextMetaId = 1;

/**
 * New / Declare / Edit commodity (PLAN-commodities-ux §3.3, contracts §4.2–4.3).
 * Opened empty ("New commodity"), with a symbol that exists in the ledger but
 * has no `commodity` directive ("Declare"), or on a declared row ("Edit").
 * Same keyboard contract as AccountModal: Esc closes, Cmd/Ctrl+Enter saves.
 */
export default function CommodityModal() {
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);
  const presetSymbol = useCommoditiesUi((s) => s.commodityModalSymbol);
  const close = useCommoditiesUi((s) => s.closeCommodityModal);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["commodities"],
    queryFn: () => fetchCommodities(),
  });
  const oc = data?.operating_currency || operatingCurrency;
  const existing = presetSymbol
    ? data?.commodities.find((c) => c.symbol === presetSymbol) ?? null
    : null;
  const isEditing = !!existing?.declared;
  const symbolLocked = !!presetSymbol;

  const [symbol, setSymbol] = useState(presetSymbol ?? "");
  const [name, setName] = useState("");
  const [precision, setPrecision] = useState("");
  const [date, setDate] = useState(formatDateFull(today(), oc));
  const [metadataRows, setMetadataRows] = useState<MetadataRow[]>([
    { id: nextMetaId++, key: "", value: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const symbolRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Seed the form from the catalog row once it is available (edit/declare).
  useEffect(() => {
    if (seeded || !existing) return;
    setName(existing.name ?? "");
    setPrecision(existing.precision != null ? String(existing.precision) : "");
    const rows = Object.entries(existing.metadata ?? {}).map(([k, v]) => ({
      id: nextMetaId++, key: k, value: String(v),
    }));
    rows.push({ id: nextMetaId++, key: "", value: "" });
    setMetadataRows(rows);
    setSeeded(true);
  }, [existing, seeded]);

  useEffect(() => {
    (symbolLocked ? nameRef : symbolRef).current?.focus();
  }, [symbolLocked]);

  const symbolValid = COMMODITY_SYMBOL_RE.test(symbol);

  function addMetadataRow() {
    setMetadataRows((prev) => [...prev, { id: nextMetaId++, key: "", value: "" }]);
  }
  function removeMetadataRow(id: number) {
    setMetadataRows((prev) =>
      prev.length <= 1 ? [{ id: nextMetaId++, key: "", value: "" }] : prev.filter((r) => r.id !== id),
    );
  }
  function updateMetadataRow(id: number, field: "key" | "value", value: string) {
    setMetadataRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  async function handleSave() {
    if (saving) return;
    setError(null);

    if (!symbolValid) {
      setError("Symbol must be uppercase: a letter, then up to 23 of A–Z, 0–9, ' . _ -");
      return;
    }
    let precisionNum: number | undefined;
    if (precision.trim()) {
      const n = Number(precision);
      if (!Number.isInteger(n) || n < 0 || n > 12) {
        setError("Precision is a whole number of decimals, 0–12.");
        return;
      }
      precisionNum = n;
    }
    const parsedDate = parseSmartDate(date);
    if (!isEditing && !/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) {
      setError("Enter a valid date.");
      return;
    }

    const metadata: Record<string, string> = {};
    for (const row of metadataRows) {
      if (row.key.trim() && row.value.trim()) metadata[row.key.trim()] = row.value.trim();
    }

    setSaving(true);
    try {
      const body = {
        symbol,
        name: name.trim() || undefined,
        precision: precisionNum,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
      if (isEditing) {
        await updateCommodity(body);
      } else {
        await createCommodity({ ...body, date: parsedDate });
      }
      queryClient.invalidateQueries({ queryKey: ["commodities"] });
      queryClient.invalidateQueries({ queryKey: ["options"] });
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
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

  const title = isEditing
    ? `Edit — ${symbol}`
    : symbolLocked
      ? `Declare — ${symbol}`
      : "New commodity";

  return (
    <div className="modal-overlay" onMouseDown={close}>
      <div
        className="modal commodity-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <span>{title}</span>
          <button onClick={close} aria-label="Close">&times;</button>
        </div>

        <div className="modal-body">
          {symbolLocked && !isEditing && (
            <div className="form-hint commodity-modal-note">
              {symbol} already appears in postings but has no <code>commodity</code>{" "}
              directive. Declaring it gives it a name and a display precision.
            </div>
          )}

          <div className="form-row">
            <div className="form-field" style={{ flex: "0 0 160px" }}>
              <label>Symbol</label>
              <input
                ref={symbolRef}
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="PETR4"
                autoComplete="off"
                disabled={symbolLocked}
                className={symbol && !symbolValid ? "invalid" : undefined}
              />
              {symbol && !symbolValid && (
                <span className="form-hint" style={{ color: "var(--color-warning-fg)" }}>
                  Uppercase; A–Z 0–9 ' . _ -
                </span>
              )}
            </div>
            <div className="form-field">
              <label>Name</label>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Petrobras PN"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field" style={{ flex: "0 0 120px" }}>
              <label>Precision</label>
              <input
                type="number"
                min={0}
                max={12}
                step={1}
                value={precision}
                onChange={(e) => setPrecision(e.target.value)}
                placeholder="2"
              />
            </div>
            {!isEditing && (
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
                  placeholder={getDatePlaceholder(oc)}
                />
              </div>
            )}
            <div className="form-field" />
          </div>

          <div className="acct-section">
            <div className="acct-section-header">
              Metadata
              <span className="acct-optional"> (optional)</span>
            </div>
            {metadataRows.map((row) => (
              <div key={row.id} className="metadata-row">
                <input
                  type="text"
                  value={row.key}
                  onChange={(e) => updateMetadataRow(row.id, "key", e.target.value)}
                  placeholder="key (e.g. asset-class)"
                  className="metadata-key-input"
                  autoComplete="off"
                />
                <input
                  type="text"
                  value={row.value}
                  onChange={(e) => updateMetadataRow(row.id, "value", e.target.value)}
                  placeholder="value"
                  className="metadata-value-input"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="remove-btn"
                  onClick={() => removeMetadataRow(row.id)}
                  aria-label="Remove metadata row"
                >
                  &times;
                </button>
              </div>
            ))}
            <button type="button" className="btn-link" onClick={addMetadataRow}>
              + Add metadata
            </button>
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
              disabled={saving || !symbolValid}
            >
              {saving ? "Saving…" : isEditing ? "Save changes" : symbolLocked ? "Declare" : "Create commodity"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
