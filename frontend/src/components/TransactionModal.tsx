import { useState, useCallback, useRef } from "react";
import { useAppStore } from "../stores/appStore";
import { addTransaction, editTransaction } from "../api/client";
import { parseSmartDate } from "../utils/dateUtils";
import FastInput from "./FastInput";
import AdvancedInput from "./AdvancedInput";
import type { TransactionDraft, TxnModalMode } from "../types";

interface TransactionModalProps {
  onMutated: () => void;
}

let nextId = 5000;

function emptyDraft(operatingCurrency: string): TransactionDraft {
  return {
    date: new Date().toISOString().slice(0, 10),
    flag: '*',
    payee: '',
    narration: '',
    tags: [],
    links: [],
    postings: [
      { id: nextId++, account: '', amount: '', currency: operatingCurrency, cost: '', costCurrency: '', price: '', priceCurrency: '' },
      { id: nextId++, account: '', amount: '', currency: operatingCurrency, cost: '', costCurrency: '', price: '', priceCurrency: '' },
    ],
  };
}

function txnToDraft(txn: { date: string; flag: string; payee: string; narration: string; tags: string[]; links: string[]; postings: { account: string; amount: string | null; currency: string | null; cost?: string | null; cost_currency?: string; price?: string | null; price_currency?: string; }[] }, operatingCurrency: string): TransactionDraft {
  return {
    date: txn.date,
    flag: txn.flag === '!' ? '!' : '*',
    payee: txn.payee,
    narration: txn.narration,
    tags: txn.tags || [],
    links: txn.links || [],
    postings: txn.postings.map(p => ({
      id: nextId++,
      account: p.account,
      amount: p.amount || '',
      currency: p.currency || operatingCurrency,
      cost: p.cost || '',
      costCurrency: p.cost_currency || '',
      price: p.price || '',
      priceCurrency: p.price_currency || '',
    })),
  };
}

export default function TransactionModal({ onMutated }: TransactionModalProps) {
  const txn = useAppStore((s) => s.txnModalTransaction);
  const initialMode = useAppStore((s) => s.txnModalMode);
  const closeTxnModal = useAppStore((s) => s.closeTxnModal);
  const operatingCurrency = useAppStore((s) => s.operatingCurrency);

  const isEditing = !!txn;
  const [mode, setMode] = useState<TxnModalMode>(initialMode);
  const [draft, setDraft] = useState<TransactionDraft>(() =>
    txn ? txnToDraft(txn, operatingCurrency) : emptyDraft(operatingCurrency)
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [continueMode, setContinueMode] = useState(true);
  const [formKey, setFormKey] = useState(0); // increment to remount Fast/AdvancedInput

  const draftRef = useRef(draft);
  const handleDraftChange = useCallback((newDraft: TransactionDraft) => {
    draftRef.current = newDraft;
    setDraft(newDraft);
  }, []);

  // Determine if Advanced → Fast tab should be disabled
  const canSwitchToFast = !isEditing &&
    draft.postings.filter(p => p.account).length <= 2 &&
    !draft.postings.some(p => p.cost || p.price);

  function handleTabSwitch(newMode: TxnModalMode) {
    if (newMode === mode) return;
    if (newMode === 'fast' && !canSwitchToFast) return;
    setMode(newMode);
  }

  function resetForm() {
    setDraft(emptyDraft(operatingCurrency));
    setError(null);
    setFormKey(k => k + 1); // remount child to clear all internal state (pills, input, etc.)
  }

  async function handleSave() {
    if (saving) return;
    setError(null);
    setSaving(true);

    try {
      const d = draftRef.current;
      const parsedDate = parseSmartDate(d.date);

      // Filter out empty posting rows
      const filledPostings = d.postings.filter((p) => p.account.length > 0);
      if (filledPostings.length < 2) {
        if (mode === 'fast' && filledPostings.length === 1) {
          setError("Payment account is missing. Use > to select both accounts.");
        } else {
          setError("At least 2 postings are required.");
        }
        setSaving(false);
        return;
      }

      // At most one posting can have an empty amount
      const emptyAmountCount = filledPostings.filter((p) => p.amount === "").length;
      if (emptyAmountCount > 1) {
        setError("At most one posting can have an empty amount (auto-balanced).");
        setSaving(false);
        return;
      }

      const toNum = (v: string) => parseFloat(v.replace(',', '.'));
      const postingInputs = filledPostings.map((p) => ({
        account: p.account,
        amount: p.amount ? toNum(p.amount) : null,
        currency: p.currency || operatingCurrency,
        cost: p.cost ? toNum(p.cost) : null,
        cost_currency: p.costCurrency || null,
        price: p.price ? toNum(p.price) : null,
        price_currency: p.priceCurrency || null,
      }));

      if (isEditing && txn?.lineno != null) {
        const result = await editTransaction({
          lineno: txn.lineno,
          date: parsedDate,
          flag: d.flag,
          payee: d.payee,
          narration: d.narration,
          tags: d.tags,
          links: d.links,
          postings: postingInputs,
        });
        if (!result.success) {
          setError(result.errors?.join(", ") || "Failed to edit transaction.");
          return;
        }
      } else {
        const result = await addTransaction({
          date: parsedDate,
          flag: d.flag,
          payee: d.payee,
          narration: d.narration,
          tags: d.tags,
          links: d.links,
          postings: postingInputs,
        });
        if (!result.success) {
          setError(result.errors?.join(", ") || "Failed to add transaction.");
          return;
        }
      }

      onMutated();
      if (continueMode && !isEditing) {
        resetForm();
      } else {
        closeTxnModal();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      closeTxnModal();
    } else if (e.key === "Enter") {
      if (mode === 'fast' && !e.metaKey && !e.ctrlKey) {
        // Fast mode: plain Enter submits (unless dropdown is open — handled by FastInput)
        // Only submit if target is the main input
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' && (e.target as HTMLInputElement).classList.contains('fast-input-text')) {
          e.preventDefault();
          handleSave();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        // Advanced mode: Cmd+Enter
        e.preventDefault();
        handleSave();
      }
    }
  }

  const isMac = navigator.platform.includes("Mac");
  const submitHint = mode === 'fast' ? 'Enter ↵' : `${isMac ? "Cmd" : "Ctrl"}+Enter`;

  return (
    <div className="modal-overlay" onMouseDown={closeTxnModal}>
      <div
        className="modal modal-wide"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <span>{isEditing ? "Edit Transaction" : "New Transaction"}</span>
          <button onClick={closeTxnModal}>&times;</button>
        </div>

        <div className="modal-body">
          {/* Tab bar — only show for new transactions */}
          {!isEditing && (
            <div className="txn-modal-tabs">
              <button
                className={`txn-modal-tab${mode === 'fast' ? ' active' : ''}`}
                onClick={() => handleTabSwitch('fast')}
                disabled={mode !== 'fast' && !canSwitchToFast}
              >
                Fast
              </button>
              <button
                className={`txn-modal-tab${mode === 'advanced' ? ' active' : ''}`}
                onClick={() => handleTabSwitch('advanced')}
              >
                Advanced
              </button>
            </div>
          )}

          {/* Mode content */}
          {mode === 'fast' ? (
            <FastInput
              key={formKey}
              draft={draft}
              onDraftChange={handleDraftChange}
              operatingCurrency={operatingCurrency}
            />
          ) : (
            <AdvancedInput
              key={formKey}
              draft={draft}
              onDraftChange={handleDraftChange}
              operatingCurrency={operatingCurrency}
              autoFocusFirstEmpty={initialMode === 'fast'}
            />
          )}

          {error && <div className="error-msg">{error}</div>}

          <div className="form-actions">
            <span className="form-hint">{submitHint} to save</span>
            <label className="continue-check">
              <input
                type="checkbox"
                checked={continueMode}
                onChange={(e) => setContinueMode(e.target.checked)}
              />
              continue
            </label>
            <button className="btn" onClick={closeTxnModal}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
