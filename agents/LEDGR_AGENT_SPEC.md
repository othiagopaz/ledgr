# Ledgr — Agent Execution Spec

> This document is for a Claude Code agent to execute. Every section is a concrete task with file paths, interfaces, and acceptance criteria. No ambiguity allowed.

## Design Principles

- **NEVER use emojis** in UI, code, or components. Use text labels, monospace glyphs, or nothing.
- **Dense, not pretty.** This is an accounting system like GnuCash or SAP. Prioritize information density, keyboard navigation, and professional look over decorative UI.
- **Keyboard-first.** Every view must be navigable with keyboard. Arrow keys to move, Enter to act, Escape to go back.
- **Monospace for numbers.** All amounts, dates, and numeric data use `var(--font-mono)`.

---

## Context

- **Repo root:** Contains `backend/`, `frontend/`, `data/`, `scripts/`
- **Frontend:** React 19 + Vite 8 + TanStack Query, source in `frontend/src/`
- **Backend:** FastAPI + Beancount, source in `backend/`
- **Data files:** `data/example.beancount` (USD), `data/financeiro.beancount` (BRL)
- **Dev server:** Backend on `:8080`, Frontend on `:5173` with proxy to backend

### Existing files the agent MUST read before modifying

| File | Why |
|------|-----|
| `frontend/src/types/index.ts` | All TypeScript interfaces — extend, don't replace |
| `frontend/src/api/client.ts` | All API functions — add new ones here |
| `frontend/src/components/AccountRegister.tsx` | Will be heavily modified for inline editing |
| `frontend/src/components/AccountTree.tsx` | Will be modified for keyboard nav |
| `frontend/src/components/TransactionForm.tsx` | Will be DEPRECATED — read to understand current form logic, then port to inline |
| `frontend/src/styles/global.css` | Current styles — will be restructured for theming |
| `frontend/src/App.tsx` | Main layout — will be restructured for tabs |
| `backend/routes/accounts.py` | Existing API — need to add suggestion endpoint |
| `backend/engine.py` | Beancount engine — need to add suggestion logic |

---

## Dependency Decisions (LOCKED)

Install these before starting any task:

```bash
cd frontend
npm install zustand @tanstack/react-virtual
```

- **Client state:** Zustand (NOT Jotai, NOT Redux)
- **Virtualization:** @tanstack/react-virtual
- **Server state:** TanStack Query (already installed)
- **No new UI libraries.** No shadcn, no Radix, no Headless UI. Build components from scratch for full control.

---

## Task 1: Zustand Store Setup

### Create `frontend/src/stores/appStore.ts`

```typescript
import { create } from 'zustand';

interface Tab {
  id: string;           // unique, e.g. "register:Assets:Bank:Itau" or "report:income-statement"
  type: 'register' | 'report';
  account?: string;     // for register tabs
  reportType?: string;  // for report tabs
  label: string;        // display name, e.g. "Bank:Itau"
}

interface AppState {
  // Tabs
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (tab: Tab) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;

  // Editing
  editingRowIndex: number | null;  // which row is in inline-edit mode, null = none
  isNewRow: boolean;               // is the editing row a new transaction?
  setEditingRow: (index: number | null, isNew?: boolean) => void;

  // UI
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  focusZone: 'sidebar' | 'register' | 'tabbar';
  setFocusZone: (zone: 'sidebar' | 'register' | 'tabbar') => void;

  // Config (loaded from backend)
  operatingCurrency: string;
  setOperatingCurrency: (currency: string) => void;
}
```

Implement all actions. `openTab` should check if a tab with the same `id` already exists — if so, switch to it instead of creating a duplicate.

### Acceptance criteria
- File exists at path above
- All state slices and actions implemented
- Exported as `useAppStore`
- No TypeScript errors

---

## Task 2: Theme System

### Modify `frontend/src/styles/global.css`

Replace the current `:root` variables with a `[data-theme]` system:

```css
[data-theme="dark"] {
  --bg-primary: #0f1117;
  --bg-secondary: #161820;
  --bg-sidebar: #161820;
  --bg-row-even: #13151d;
  --bg-row-odd: #0f1117;
  --bg-row-hover: #1c2033;
  --bg-row-selected: #1a2744;
  --text-primary: #e4e4e7;
  --text-secondary: #71717a;
  --text-muted: #52525b;
  --accent: #60a5fa;
  --amount-positive: #4ade80;
  --amount-negative: #f87171;
  --flag-pending: #f59e0b;
  --flag-confirmed: #4ade80;
  --border: #2a2d3a;
  --border-light: #1e2130;
}

[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f8f8f8;
  --bg-sidebar: #fafafa;
  --bg-row-even: #ffffff;
  --bg-row-odd: #fafafa;
  --bg-row-hover: #f0f4ff;
  --bg-row-selected: #e3f2fd;
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --text-muted: #999999;
  --accent: #2563eb;
  --amount-positive: #2e7d32;
  --amount-negative: #c62828;
  --flag-pending: #f57c00;
  --flag-confirmed: #2e7d32;
  --border: #e0e0e0;
  --border-light: #f0f0f0;
}
```

### Modify `frontend/src/App.tsx`

Add theme application on the root element:

```tsx
const theme = useAppStore((s) => s.theme);
useEffect(() => {
  document.documentElement.setAttribute('data-theme', theme);
}, [theme]);
```

### Update ALL existing CSS
Go through `global.css` and ensure every color reference uses the CSS variables above. Remove any hardcoded colors like `#e3f2fd`, `#1976d2`, `#fff5f5`, etc. Replace them with the appropriate variable.

### Default theme: `dark`

### Acceptance criteria
- `data-theme="dark"` is set on `<html>` by default
- All existing components render correctly in both themes
- No hardcoded colors remain in CSS files
- `useAppStore().toggleTheme()` switches between dark and light

---

## Task 3: Currency Awareness

### Modify `frontend/src/App.tsx`

On mount, fetch `/api/options` and set `operatingCurrency`:

```tsx
const setOperatingCurrency = useAppStore((s) => s.setOperatingCurrency);

useEffect(() => {
  fetchOptions().then((opts) => {
    if (opts.operating_currency.length > 0) {
      setOperatingCurrency(opts.operating_currency[0]);
    }
  });
}, []);
```

### Modify all components that display currency

- `AccountRegister.tsx`: Use `operatingCurrency` for number formatting
- `AccountTree.tsx`: Same
- `App.tsx` footer: Same

### Modify the transaction form (and later the inline editor)

Default `currency` field to `useAppStore().operatingCurrency` instead of hardcoded `"USD"`.

### Number formatting helper

Create `frontend/src/utils/format.ts`:

```typescript
export function formatAmount(value: number, currency: string): string {
  const locale = currency === 'BRL' ? 'pt-BR' : 'en-US';
  return value.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
```

Use this everywhere amounts are displayed.

### Acceptance criteria
- Loading `financeiro.beancount` shows BRL-formatted numbers (e.g., `10.000,00`)
- Loading `example.beancount` shows USD-formatted numbers (e.g., `10,000.00`)
- New transaction form defaults to the correct currency
- No hardcoded "USD" strings remain in frontend code

---

## Task 4: Tab System

### Create `frontend/src/components/TabBar.tsx`

Renders a horizontal bar above the register area showing open tabs.

```tsx
interface TabBarProps {
  // reads from Zustand store directly, no props needed
}
```

Visual spec:
- Height: 36px
- Each tab: pill shape with account name and `×` close button
- Active tab: `--bg-secondary` background, `--text-primary` text, `--accent` left border (3px)
- Inactive tab: transparent background, `--text-secondary` text
- `+` button at the end opens command palette
- Overflow: when tabs exceed container width, last visible spot becomes a `...` dropdown

Keyboard:
- `Cmd+W` closes active tab (register event listener in App.tsx)
- Clicking `×` closes that specific tab

### Modify `frontend/src/App.tsx`

Replace the single `selectedAccount` state with the tab system:

```tsx
// REMOVE:
const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

// REPLACE WITH:
const { tabs, activeTabId, openTab } = useAppStore();
const activeTab = tabs.find(t => t.id === activeTabId);
const selectedAccount = activeTab?.type === 'register' ? activeTab.account : null;
```

Layout becomes:
```
┌─────────────────────────────┐
│ Header (Ledgr + buttons)    │
├────────┬────────────────────┤
│        │ TabBar             │
│Sidebar ├────────────────────┤
│        │ Register / Report  │
├────────┴────────────────────┤
│ StatusBar                   │
└─────────────────────────────┘
```

### Modify `frontend/src/components/AccountTree.tsx`

Change `onSelect` to open a tab instead of replacing state:

```tsx
function handleSelect(accountName: string) {
  const shortName = accountName.split(':').length > 2 
    ? accountName.split(':').slice(1).join(':') 
    : accountName;
  useAppStore.getState().openTab({
    id: `register:${accountName}`,
    type: 'register',
    account: accountName,
    label: shortName,
  });
}
```

### Acceptance criteria
- Clicking an account opens a tab (or switches to existing)
- Multiple tabs can be open simultaneously
- Closing a tab switches to the next one (or previous if it was the last)
- The register content changes when switching tabs
- `Cmd+W` closes the active tab

---

## Task 5: Inline Register Editing

This is the biggest change. It replaces the modal `TransactionForm.tsx`.

### Create `frontend/src/components/InlineEditor.tsx`

A table row that renders input fields instead of text cells.

```tsx
interface InlineEditorProps {
  currentAccount: string;          // the account this register belongs to
  transaction?: Transaction;       // if editing existing, undefined for new
  onSave: (input: TransactionInput) => Promise<void>;
  onCancel: () => void;
}
```

The inline editor renders a `<tr>` with these cells:

| Cell | Element | Behavior |
|------|---------|----------|
| Flag | `<select>` or click-toggle | Toggles between `*` and `!` |
| Date | `<input type="text">` | Auto-formats as YYYY-MM-DD. Accepts: "today", "t", "yesterday", "y", partial dates like "03/15". Default: today's date |
| Payee — Narration | `<input type="text">` | Free text with autocomplete dropdown from `/api/payees`. Format: "Payee — Narration" or just "Narration" |
| Transfer | `<input type="text">` with autocomplete | Searches `/api/account-names`. Shows dropdown. |
| Debit | `<input type="number">` | Only one of Debit/Credit should have a value |
| Credit | `<input type="number">` | Only one of Debit/Credit should have a value |
| Balance | `<span>` (read-only) | Shows "—" while editing |

**Critical behavior — the implicit posting:**
When the user fills in Transfer=`Expenses:Daily:Groceries` and Debit=`90.00` while inside the `Bank:Itau` register, the `onSave` callback should construct:

```json
{
  "date": "2026-03-21",
  "flag": "*",
  "payee": "Festval",
  "narration": "Weekly groceries",
  "postings": [
    { "account": "Expenses:Daily:Groceries", "amount": 90.00, "currency": "BRL" },
    { "account": "Assets:Bank:Itau", "amount": -90.00, "currency": "BRL" }
  ]
}
```

The user only typed ONE account and ONE amount. The second posting is auto-generated using `currentAccount` and the negated amount.

**If Debit is filled:** amount is positive for the Transfer account, negative for currentAccount
**If Credit is filled:** amount is negative for the Transfer account, positive for currentAccount

### Tab order

When the user presses Tab inside the inline editor, focus moves:

`Date → Payee/Narration → Transfer → Debit (or Credit) → [Enter saves]`

- `Enter` in any field: saves the transaction
- `Escape` in any field: cancels editing
- `Tab` after the last field: also saves

### Payee auto-fill

When a payee is selected from the autocomplete:
1. Call `GET /api/suggestions?payee=<selected>` (new endpoint, see Task 5b)
2. If a suggestion exists, auto-fill the Transfer account and amount
3. User can override any auto-filled value

### Modify `frontend/src/components/AccountRegister.tsx`

1. Add an empty row at the TOP of the table body (before sorted transactions)
2. This empty row is always an `<InlineEditor>` in "new" mode
3. Clicking any existing row replaces it with an `<InlineEditor>` in "edit" mode
4. Only ONE row can be in edit mode at a time
5. REMOVE the `onClick={() => onEdit(row.txn)}` that opens the modal
6. REMOVE the `onEdit` prop entirely

### Deprecate `TransactionForm.tsx`

After InlineEditor is working:
1. Remove `TransactionForm.tsx`
2. Remove the `showForm` and `editingTxn` state from `App.tsx`
3. Remove the `+ Transaction` header button (the inline row replaces it)
4. Remove the modal overlay CSS

### Acceptance criteria
- Empty row at top of register is always visible and ready for input
- Typing in the empty row and pressing Enter creates a transaction via API
- The new transaction appears in the register after save (query invalidation)
- Clicking an existing transaction makes it editable inline
- Tab moves between fields in order
- Escape cancels without saving
- The modal form no longer exists anywhere in the codebase
- Only ONE account (Transfer) and ONE amount (Debit or Credit) are required from the user

---

## Task 5b: Backend — Suggestion Endpoint

### Add to `backend/engine.py`

```python
def get_suggestions(self, payee: str) -> dict:
    """Return the most common transfer account and amount for a payee."""
    txns = [e for e in self.entries if isinstance(e, data.Transaction) and e.payee == payee]
    if not txns:
        return {"payee": payee, "account": None, "amount": None, "currency": None}
    
    # Count transfer accounts (second posting in 2-posting transactions)
    account_counts: dict[str, int] = {}
    amounts: list[float] = []
    for t in txns:
        if len(t.postings) == 2:
            # Take the first posting's account as the "transfer" account
            acct = t.postings[0].account
            account_counts[acct] = account_counts.get(acct, 0) + 1
            if t.postings[0].units:
                amounts.append(float(t.postings[0].units.number))
    
    most_common = max(account_counts, key=account_counts.get) if account_counts else None
    # Only suggest amount if it's consistent (same value >50% of the time)
    typical_amount = None
    currency = None
    if amounts:
        from collections import Counter
        count = Counter(amounts)
        top_amount, top_count = count.most_common(1)[0]
        if top_count / len(amounts) > 0.5:
            typical_amount = top_amount
            # Get currency from most recent transaction
            for t in reversed(txns):
                if t.postings[0].units:
                    currency = t.postings[0].units.currency
                    break
    
    return {
        "payee": payee,
        "account": most_common,
        "amount": str(typical_amount) if typical_amount else None,
        "currency": currency,
    }
```

### Add to `backend/routes/accounts.py`

```python
@router.get("/api/suggestions")
def get_suggestions(request: Request, payee: str = Query(...)):
    engine = request.app.state.engine
    return engine.get_suggestions(payee)
```

### Add to `frontend/src/api/client.ts`

```typescript
export interface Suggestion {
  payee: string;
  account: string | null;
  amount: string | null;
  currency: string | null;
}

export async function fetchSuggestions(payee: string): Promise<Suggestion> {
  return get(`/api/suggestions?payee=${encodeURIComponent(payee)}`);
}
```

### Acceptance criteria
- `GET /api/suggestions?payee=Spotify` returns the most common account and amount
- If the payee doesn't exist, returns nulls
- Frontend calls this when a payee is selected from autocomplete

---

## Task 6: Status Bar

### Create `frontend/src/components/StatusBar.tsx`

Replaces the current `app-footer` div in `App.tsx`.

```tsx
interface StatusBarProps {
  account: string | null;
  transactions: Transaction[];
}
```

Renders:
```
[● 5 cleared: R$ 7,150.00] [● 2 projected: R$ 10,000.00] | Balance: R$ 17,150.00 | 7 txns | ⌘K search · N new
```

- Green dot + "cleared" count and sum (flag === "*")
- Amber dot + "projected" count and sum (flag === "!")
- Total balance (sum of all)
- Transaction count
- Keyboard hints on the right

Height: 28px. Background: `--bg-secondary`. Font: 11px mono.

When no account is selected, show global stats (net assets, total accounts).

### Acceptance criteria
- Status bar appears at the bottom of the app
- Shows correct counts and sums for the active register
- Updates when transactions change

---

## Task 7: Keyboard Navigation

### Create `frontend/src/hooks/useKeyboardNav.ts`

A custom hook that sets up global keyboard listeners.

```typescript
export function useKeyboardNav() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture when inside an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      
      // Cmd+K: command palette (always works)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        useAppStore.getState().setCommandPaletteOpen(true);
        return;
      }

      // Skip other shortcuts when in input
      if (isInput) return;

      // N: new transaction
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        useAppStore.getState().setEditingRow(-1, true); // -1 = new row
        return;
      }

      // Escape: close command palette, cancel edit
      if (e.key === 'Escape') {
        const store = useAppStore.getState();
        if (store.commandPaletteOpen) {
          store.setCommandPaletteOpen(false);
        } else if (store.editingRowIndex !== null) {
          store.setEditingRow(null);
        }
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
```

Call `useKeyboardNav()` in `App.tsx`.

### Register-specific navigation

Inside `AccountRegister.tsx`, add arrow key navigation:
- Track `selectedRowIndex` in local state
- `↑` / `↓` move the selection highlight
- `Enter` on selected row activates inline editing
- `Delete` on selected row shows confirmation then deletes

### Acceptance criteria
- `Cmd+K` opens command palette (even from inside inputs)
- `N` starts a new transaction (when not in an input)
- `Escape` cancels current action
- Arrow keys navigate the register

---

## Task 8: Command Palette

### Create `frontend/src/components/CommandPalette.tsx`

A floating overlay centered on screen, triggered by `Cmd+K`.

Structure:
```
┌──────────────────────────────────┐
│ 🔍 [search input              ] │
├──────────────────────────────────┤
│ ▸ Accounts                       │
│   Bank:Itau                      │
│   Bank:Santander                 │
│   Expenses:Daily:Groceries       │
│ ▸ Actions                        │
│   New Transaction                │
│   Toggle Dark Mode               │
└──────────────────────────────────┘
```

Data sources:
- Account names from `/api/account-names`
- Payees from `/api/payees`
- Static actions: "New Transaction", "Toggle Theme"

Behavior:
- Fuzzy search across all items
- `↑` / `↓` navigate results
- `Enter` executes: account → opens tab, action → runs it
- `Escape` closes
- Click outside closes

### Acceptance criteria
- `Cmd+K` opens the palette
- Typing filters results with fuzzy matching
- Selecting an account opens it in a tab
- "Toggle Theme" switches between dark/light
- Palette closes on Escape or click-outside

---

## Task 9: Status Indicator Dots

### Modify `frontend/src/components/AccountRegister.tsx`

Replace the text flag display (`*` / `!`) with colored dots:

```tsx
// Replace:
<td className={`flag ${isPending ? "flag-pending" : "flag-confirmed"}`}>
  {row.txn.flag}
</td>

// With:
<td className="flag">
  <span className={`status-dot ${isPending ? "dot-pending" : "dot-confirmed"}`} />
</td>
```

CSS in `global.css`:
```css
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot-confirmed { background: var(--flag-confirmed); }
.dot-pending { background: var(--flag-pending); }
```

### Acceptance criteria
- Flags render as colored dots, not text characters
- Green for `*`, amber for `!`
- Dots are centered in the column

---

## Execution Order

The agent should execute tasks in this order due to dependencies:

1. **Task 1** (Zustand store) — everything depends on this
2. **Task 2** (Theme system) — establishes CSS variable foundation
3. **Task 3** (Currency awareness) — small fix, high impact
4. **Task 9** (Status dots) — small, builds confidence
5. **Task 6** (Status bar) — replaces footer
6. **Task 4** (Tab system) — changes App.tsx layout
7. **Task 5b** (Backend suggestions) — needed before inline editor
8. **Task 5** (Inline editor) — the big one, requires store + suggestions
9. **Task 7** (Keyboard nav) — works with all components in place
10. **Task 8** (Command palette) — frosting on the cake

---

## Rules for the Agent

1. **Never delete a file without creating its replacement first**
2. **Run `npm run build` after each task** to verify no TypeScript errors
3. **Keep the existing API contract stable** — add endpoints, don't change existing ones
4. **Every new component goes in `frontend/src/components/`**
5. **Every new hook goes in `frontend/src/hooks/`**
6. **Every new utility goes in `frontend/src/utils/`**
7. **Every new store goes in `frontend/src/stores/`**
8. **CSS stays in `frontend/src/styles/global.css`** — do NOT create per-component CSS files
9. **Use `useAppStore` from Zustand for UI state, `useQuery` from TanStack for server state**
10. **When in doubt about a design decision, pick the simpler option**
