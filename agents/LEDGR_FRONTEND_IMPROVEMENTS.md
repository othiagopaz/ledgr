# Ledgr — Frontend Improvement Spec

> **Status:** Draft v1 — March 2026  
> **Scope:** UX, UI, Architecture, Interaction Design  
> **Stack:** React 19 + Vite 8 + TanStack Query + Beancount backend

---

## 1. Current State Assessment

### What exists today

The current frontend is a functional MVP with:

- **Sidebar** with an account tree (expand/collapse, balances per account)
- **Register view** with Date, Flag, Payee/Narration, Transfer, Debit, Credit, Balance columns
- **Modal-based transaction form** with autocomplete for accounts and payees
- **CRUD operations** (add, edit, delete transactions via API)
- **Running balance** computation (client-side, oldest→newest)
- Light theme, monospace numbers, basic responsive layout

### What's missing or broken

| Area | Problem |
|------|---------|
| **Entry flow** | Modal form is slow for bulk entry. GnuCash's in-register editing is ~3x faster for daily use |
| **Navigation** | No tabs — clicking a different account replaces the current register. No way to cross-reference |
| **Keyboard support** | Zero keyboard shortcuts. No Tab navigation between cells. No Cmd+K command palette |
| **Data density** | Row height is OK (32px) but no status bar, no quick filters, no reconciliation summary |
| **Visual design** | Generic light theme. No dark mode. No personality. The GnuCash industrial look was ugly, but at least it was *recognizable* |
| **Smart defaults** | No auto-fill from previous transactions. No smart transfer account suggestion |
| **Currency awareness** | BRL file shows "USD" defaults in the form. `operating_currency` from beancount options is not respected |
| **Empty states** | "Select an account to view transactions" is the entire onboarding |
| **Error handling** | Parsing errors show as a one-line banner. No way to click through to the problematic line |
| **Performance** | No virtualized table. Will choke on accounts with 1000+ transactions |

---

## 2. The GnuCash Lesson: Inline Register Editing

### How GnuCash does it (and why it works)

When you're inside an account register in GnuCash, creating a new transaction works like this:

1. There's always an **empty row at the bottom** of the register
2. You click into it (or it's already focused if you just finished the previous entry)
3. You fill in: **Date → Description → Transfer Account → Amount**
4. GnuCash **assumes the current account is one side of the double-entry**. So if you're in `Bank:Itau`, you only need to specify the *other* account and *one* amount
5. Press Enter → transaction saved. A new empty row appears.

**The key insight:** You never leave the register. You never open a modal. You never see a form. The *table row itself IS the form*.

### What Ledgr should do

Replace the modal `TransactionForm` with **inline register editing**:

- **New transaction:** An always-present empty row at the top (or bottom, user preference) of the register. Clicking it or pressing `N` activates editing mode.
- **Edit transaction:** Clicking a row makes it editable in-place. No modal.
- **The current account is implicit:** When adding a transaction inside `Bank:Itau`, the form only asks for: Date, Payee/Narration, Transfer Account, and Amount. The second posting (to `Bank:Itau`) is auto-generated.
- **Tab between cells:** Date → Description → Transfer → Amount → Enter to save
- **Escape cancels** editing and returns to the previous row state.

### Inline Row Architecture

```
┌──────┬──────┬──────────────────────────┬────────────────┬──────────┬──────────┐
│ Date │ Flag │ Payee — Narration        │ Transfer       │  Amount  │  Balance │
├──────┼──────┼──────────────────────────┼────────────────┼──────────┼──────────┤
│[input]│ [*] │ [autocomplete input    ] │ [autocomplete] │ [number] │   calc   │
└──────┴──────┴──────────────────────────┴────────────────┴──────────┴──────────┘
         ↑                                                      ↑
    Toggle * / !                                     If positive → debit
                                                     If negative → credit
                                                     Auto-creates both postings
```

The inline row should show:
- A **single amount input** (positive = debit/money in, negative = credit/money out)
- OR two separate fields (Debit / Credit) matching the register columns — this is closer to GnuCash behavior and avoids sign confusion
- The **Transfer** field uses autocomplete against all account names
- When the user selects a known payee, **auto-fill the Transfer account** based on the most recent transaction with that payee

### Split Transactions

For transactions with more than 2 postings (splits), the inline row should:
1. Show a "split" indicator
2. Allow expanding into a sub-table below the row showing all postings
3. The expanded view allows adding/removing individual postings
4. This is the *only* case where something resembling a form appears — but it's still inline, not a modal

---

## 3. Tab System

### Current behavior
Clicking an account in the sidebar replaces the register entirely. There's no way to have `Bank:Itau` and `Expenses:Daily:Restaurant` open simultaneously.

### Target behavior

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [Bank:Itau ×] [Expenses:Restaurant ×] [Income Statement ×] [+]        │
├─────────────────────────────────────────────────────────────────────────┤
│                    (register content for active tab)                    │
```

- Clicking an account in the sidebar **opens a new tab** (or switches to existing one if already open)
- **Ctrl/Cmd+W** closes the current tab
- **Ctrl/Cmd+Tab** cycles tabs
- Tabs are **draggable** to reorder
- When there are too many tabs, overflow into a `...` dropdown
- The `[+]` button opens a search/picker to jump to any account

### Tab types

Not all tabs need to be account registers:
- **Account Register** — the default, shows transactions
- **Income Statement** — multi-column report (already hinted at in GnuCash screenshot)
- **Balance Sheet** — top-level summary
- **Trial Balance** — for the accountants

---

## 4. Command Palette (Cmd+K)

A global search that can:
- **Jump to account:** Type "itau" → navigate to `Bank:Itau`
- **Search transactions:** Type "brick seguros" → find all transactions with that payee
- **Actions:** "new transaction", "reconcile", "toggle dark mode"
- **Quick math:** Type "1500 + 350" → shows 1850 (useful while entering data)

Implementation: A floating overlay triggered by `Cmd+K` (or `/` when not in an input field). Uses fuzzy matching against account names, payee names, and narration text.

---

## 5. Smart Field Suggestions & Auto-Fill

### Payee → Transfer auto-fill

When the user types a payee in the inline editor:
1. Autocomplete dropdown shows matching payees
2. When a payee is selected, **auto-populate the Transfer account** based on the most common account used with that payee
3. Auto-populate the typical amount if there's a clear pattern (e.g., "Spotify" is always R$ 34.90)

### Date input

The current `<input type="date">` is functional but clunky. Replace with:
- **Natural language parsing:** "today", "yesterday", "last friday", "03/15", "mar 15"
- **Keyboard shortcuts:** `T` for today, `+` / `-` to increment/decrement by day
- Calendar dropdown as fallback

### Transfer account input

- Fuzzy search with `:` as separator hint
- Show recently used accounts first
- Group by account type (Assets, Expenses, etc.)
- Keyboard shortcut: typing `:` immediately shows the hierarchy picker

---

## 6. Keyboard Navigation

### Global shortcuts

| Key | Action |
|-----|--------|
| `Cmd+K` | Command palette |
| `N` | New transaction (focus inline row) |
| `Cmd+W` | Close current tab |
| `Cmd+Tab` | Next tab |
| `Cmd+Shift+Tab` | Previous tab |
| `R` | Toggle reconciliation mode |
| `?` | Show shortcut cheat sheet |

### Register shortcuts

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move between transaction rows |
| `Enter` | Edit selected transaction (activate inline edit) |
| `Tab` | Move to next cell in editing mode |
| `Shift+Tab` | Move to previous cell |
| `Escape` | Cancel edit / deselect |
| `Delete` / `Backspace` | Delete selected transaction (with confirmation) |
| `D` | Duplicate selected transaction |

### Sidebar shortcuts

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate account tree |
| `Enter` | Open account in new tab |
| `←` | Collapse current group |
| `→` | Expand current group |

---

## 7. Status Bar

Replace the current footer (`Net Assets: ... | Profit: ...`) with a context-aware status bar:

```
[● Cleared: R$ 7,150.00] [● Projected: R$ 10,000.00] | Balance: R$ 17,150.00 | 7 txns | ⌘K search · N new · R reconcile
```

- **Left side:** Status totals for the current register (cleared, pending, projected)
- **Center:** Current balance and transaction count
- **Right side:** Contextual keyboard hints
- **Interactive:** Clicking a status filter toggles visibility of those transactions

---

## 8. Reconciliation Mode

Current state: No reconciliation support.

Target: An inline mode activated by pressing `R` or clicking in the status bar.

When reconciliation mode is active:
- A target balance input appears at the top of the register
- Each row gets a **checkbox** column
- Checking a row marks it as "cleared"
- A running "cleared balance" updates in real-time
- The difference between cleared balance and target balance shows prominently
- When the difference is zero → "Balanced!" with option to finalize

---

## 9. Visual Design Overhaul

### Dark mode (default)

The current light theme is functional but unremarkable. For a financial app where users stare at numbers for extended periods, dark mode should be the default (with light mode toggle).

#### Color system

```css
/* Dark theme */
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

--accent: #60a5fa;        /* Blue for links and active elements */
--amount-positive: #4ade80; /* Green for debits/income */
--amount-negative: #f87171; /* Red for credits/expenses */
--flag-pending: #f59e0b;    /* Amber for projected/pending */
--flag-confirmed: #4ade80;  /* Green for confirmed */

--border: #2a2d3a;
--border-subtle: #1e2130;
```

### Typography

- **Body:** System sans-serif (-apple-system, BlinkMacSystemFont, 'Segoe UI') — keep this, it's the right call for a dense data app
- **Numbers:** JetBrains Mono or Fira Code — tabular numerals are essential for alignment
- **Headers:** Same as body but with weight/size differentiation
- **Font size:** 12px base for register rows, 11px for secondary info, 10px for metadata

### Status indicators

Replace text `*` and `!` flags with colored dots:
- 🟢 Green dot = confirmed/cleared (`*`)
- 🟠 Amber dot = pending/projected (`!`)
- 🔵 Blue dot = editing/new
- ⚪ Gray dot = unreconciled

### Row density

Current `--row-height: 32px` is good. Consider offering a density toggle:
- **Comfortable:** 36px (default for new users)
- **Compact:** 28px (for power users with many transactions)
- **Spacious:** 42px (for accessibility)

---

## 10. Architecture Improvements

### Component refactoring

Current components that need changes:

| Component | Current | Target |
|-----------|---------|--------|
| `TransactionForm.tsx` | Modal with full form | **Deprecate.** Replace with `InlineEditor.tsx` |
| `AccountRegister.tsx` | Read-only table + click-to-modal | Table with inline editing, virtualized rows |
| `AccountTree.tsx` | Basic tree | Tree with search, keyboard nav, drag-to-reorder |
| `App.tsx` | Single-register layout | Tab-based layout with command palette |

### New components needed

| Component | Purpose |
|-----------|---------|
| `InlineEditor.tsx` | Inline row editing with autocomplete fields |
| `TabBar.tsx` | IDE-style tab management |
| `CommandPalette.tsx` | Cmd+K search overlay |
| `StatusBar.tsx` | Context-aware status bar |
| `ReconciliationMode.tsx` | Reconciliation overlay/mode |
| `SplitEditor.tsx` | Sub-table for split transactions |
| `KeyboardHints.tsx` | Contextual shortcut display |
| `DateInput.tsx` | Smart date input with natural language |
| `AccountPicker.tsx` | Fuzzy account search with hierarchy |

### State management

Current: React Query for server state + local `useState` for UI state.

Additions needed:
- **Tab state:** Which tabs are open, which is active, tab ordering
- **Editing state:** Which row is being edited, field focus position
- **Keyboard focus:** Which element has keyboard focus (sidebar, register, tab bar)
- **Preferences:** Dark/light mode, row density, default currency

Consider adding Zustand or Jotai for client-side UI state. React Query remains perfect for server data.

### Table virtualization

Install `@tanstack/react-virtual` for the register table. The example.beancount file has 400+ transactions. A personal finance file after a year will have 3,000+. Virtualization is not optional.

### API improvements needed

The backend should expose:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/account/{name}/register` | Returns transactions *with running balance pre-computed* for the account, plus debit/credit split relative to that account |
| `GET /api/suggestions?payee=X` | Returns most-used transfer account and typical amount for a payee |
| `GET /api/options` | Already exists — use `operating_currency` to set form defaults |
| `POST /api/transactions/reconcile` | Mark a batch of transactions as reconciled |

### Currency awareness

The `financeiro.beancount` file uses `operating_currency BRL`, but the frontend defaults to "USD" everywhere. Fix:
1. Fetch `/api/options` on app load
2. Use `operating_currency[0]` as the default currency in forms
3. Format numbers using the appropriate locale (`pt-BR` for BRL, `en-US` for USD)
4. The sidebar balance display should respect the operating currency

---

## 11. Priority Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Inline register editing (replace modal form)
- [ ] Smart defaults from `operating_currency`
- [ ] Keyboard navigation in register (↑/↓/Enter/Escape)
- [ ] Tab between fields in inline editor

### Phase 2: Navigation (Week 3-4)  
- [ ] Tab system for multiple open accounts
- [ ] Command palette (Cmd+K)
- [ ] Sidebar keyboard navigation
- [ ] Smart payee → transfer account auto-fill

### Phase 3: Visual (Week 5-6)
- [ ] Dark mode implementation
- [ ] Status bar with interactive filters
- [ ] Row density toggle
- [ ] Status indicator dots (replace * and !)
- [ ] Date input with natural language

### Phase 4: Power Features (Week 7-8)
- [ ] Table virtualization
- [ ] Reconciliation mode
- [ ] Split transaction editor
- [ ] Keyboard shortcut cheat sheet
- [ ] Transaction duplication

### Phase 5: Polish (Week 9-10)
- [ ] Animations and transitions
- [ ] Empty states and onboarding
- [ ] Error drill-down (click error → jump to line)
- [ ] Export/print register
- [ ] Mobile responsive adjustments

---

## 12. Non-Goals (For Now)

Things we explicitly defer:
- **Multi-user / auth** — this is a personal finance tool with a local file
- **Charts / dashboards** — the register is king; charts come later
- **Import from bank CSV** — valuable but separate feature
- **Mobile-first design** — desktop power users are the primary audience
- **Budget tracking** — beancount's philosophy is tracking actuals, not budgets
- **AI categorization** — tempting but out of scope for v1

---

## Appendix: Reference UI Patterns

### Apps to study
- **GnuCash** — inline register editing, split transactions, reconciliation
- **Linear** — command palette, keyboard navigation, tab system
- **Notion** — inline editing, slash commands
- **Fava** (beancount web UI) — how they render beancount data
- **Coda / Airtable** — table editing UX, cell-level focus

### Key principle
> The register is not a *report* you look at. It's a *workspace* you live in.
> Every interaction should feel like you're editing a spreadsheet, not submitting a web form.
