import { useState, useRef, useEffect } from 'react';
import InlineAutocomplete from '../InlineAutocomplete';

interface AddEnvelopeRowProps {
  sectionKey: 'income' | 'expenses' | 'allocations';
  /** All account names (filtered to this section's roots inside). */
  accountOptions: string[];
  /** Accounts already budgeted in this section — excluded from suggestions. */
  existingAccounts: Set<string>;
  onAdd: (account: string, amount: string) => void;
  /** Bumped to programmatically open this row (from Cmd+K). 0 = no-op. */
  openSignal: number;
}

/** Roots a section accepts, for client-side filtering of the account picker. */
const SECTION_ROOTS: Record<AddEnvelopeRowProps['sectionKey'], string[]> = {
  income: ['Income:'],
  expenses: ['Expenses:'],
  allocations: ['Assets:', 'Liabilities:'],
};

export default function AddEnvelopeRow({
  sectionKey,
  accountOptions,
  existingAccounts,
  onAdd,
  openSignal,
}: AddEnvelopeRowProps) {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState('');
  const [amount, setAmount] = useState('');
  const accountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) accountRef.current?.focus();
  }, [open]);

  // Open when asked from Cmd+K (openSignal starts at 0; only react to bumps).
  // Bridging an external signal into local state is the intended use of an
  // effect here — the guard makes it a no-op on mount.
  const lastOpenSignal = useRef(openSignal);
  useEffect(() => {
    if (openSignal !== lastOpenSignal.current) {
      lastOpenSignal.current = openSignal;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true);
    }
  }, [openSignal]);

  const roots = SECTION_ROOTS[sectionKey];
  const options = accountOptions.filter(
    (a) => roots.some((r) => a.startsWith(r)) && !existingAccounts.has(a),
  );

  function reset() {
    setOpen(false);
    setAccount('');
    setAmount('');
  }

  function commit() {
    const acct = account.trim();
    const amt = amount.trim();
    if (!acct || !amt) return;
    onAdd(acct, amt);
    // Close immediately; the mutation refetch surfaces the new envelope as a
    // normal row (mirrors BudgetEnvelopeRow's inline-edit commit).
    reset();
  }

  if (!open) {
    return (
      <tr className="budget-add-row">
        <td colSpan={6}>
          <button className="btn-link budget-add-trigger" onClick={() => setOpen(true)}>
            + Add envelope
          </button>
        </td>
      </tr>
    );
  }

  const canSubmit = account.trim() !== '' && amount.trim() !== '';

  return (
    <tr className="budget-add-row budget-add-row-editing">
      <td className="budget-add-account" colSpan={2}>
        <InlineAutocomplete
          value={account}
          onChange={setAccount}
          onSelect={setAccount}
          options={options}
          placeholder="Account"
          inputRef={accountRef}
          className="budget-add-account-input"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              reset();
            }
          }}
        />
      </td>
      <td className="num budget-col-allocated">
        <input
          className="num budget-alloc-input"
          type="number"
          step="0.01"
          min="0"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              reset();
            }
          }}
        />
      </td>
      <td colSpan={3} className="budget-add-actions">
        <button
          className="btn btn-primary budget-add-confirm"
          onClick={commit}
          disabled={!canSubmit}
        >
          Add
        </button>
        <button className="btn budget-add-cancel" onClick={reset}>
          Cancel
        </button>
      </td>
    </tr>
  );
}
