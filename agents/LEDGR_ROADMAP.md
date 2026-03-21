# Ledgr — Feature Roadmap

> Reference document for future development. Based on analysis of [Fava](https://github.com/beancount/fava/tree/main/src/fava/core) — the most mature beancount web UI — compared against Ledgr's current state.

---

## Current State (What Ledgr Already Has)

### Core Data
| Feature | Status | Notes |
|---------|--------|-------|
| Account tree with balances | Done | Hierarchical, collapsible, full keyboard nav (arrows, h/j/k/l, Space, Enter) |
| Transaction register | Done | GnuCash-style with inline editing at bottom of table |
| Inline transaction editor | Done | Green highlight, Tab flow, debit/credit sign resolution |
| Transaction modal (advanced) | Done | Multi-posting, cost/price, tags/links support (Cmd+Shift+N) |
| All transactions view | Done | Global transaction list across all accounts |
| Autocomplete (accounts, payees) | Done | Basic matching, no ranking |
| Smart suggestions | Done | "Most likely account + amount for payee" |
| Reconciliation column | Done | y/n with keyboard toggle (Space), Tab-accessible |

### UI / Navigation
| Feature | Status | Notes |
|---------|--------|-------|
| Sidebar navigation | Done | Slim nav: Dashboard, Accounts, Recent, Errors badge |
| Dashboard homepage | Done | Summary cards (Assets/Liabilities/Net Worth/Income/Expenses), recent txns, 3-statement placeholder |
| Accounts view | Done | Full-panel account tree (moved from sidebar) |
| Multi-tab interface | Done | Browser-style tabs, Cmd+W to close |
| Dark / Light theme | Done | Toggle via Cmd+K command palette |
| Keyboard navigation | Done | Arrow keys, Enter to edit, Escape to exit, N for new, vim-style h/j/k/l in account tree |
| Command palette | Done | Cmd+K, search accounts/actions/theme |
| Status bar | Done | Transaction count, error count, keyboard hints |

### Locale / Formatting
| Feature | Status | Notes |
|---------|--------|-------|
| Locale-aware formatting | Done | Derived from `operating_currency` or `custom "ledgr-locale"` directive |
| Date formatting | Done | Locale-aware display and input parsing (DD/MM/YYYY for pt-BR, etc.) |
| Currency formatting | Done | Locale-aware decimal/thousands separators |
| Zero hardcoded locales | Done | All formatting uses `getLocale()` from format.ts |

---

## Roadmap — Ordered by Impact

### Phase 1: Visual Reporting (Highest Impact)

These features turn Ledgr from a data-entry tool into a financial dashboard.

#### 1.1 Charts
- **Income/Expense bar chart** — monthly/quarterly/yearly totals
- **Account balance line chart** — balance of any account over time
- **Net worth line chart** — Assets + Liabilities over intervals
- **Reference:** Fava's `charts.py` — transforms ledger data into JSON for frontend charting

#### 1.2 Net Worth Tracking
- Compute Assets + Liabilities at each interval (month/quarter/year)
- Currency conversion to operating currency using price entries
- Display as a line chart + summary table
- **Reference:** Fava's `charts.py` → `net_worth` function + `conversion.py`

#### 1.3 Income Statement / Balance Sheet
- Proper interval-based reports (monthly columns)
- Income Statement: Revenue - Expenses = Net Income per period
- Balance Sheet: Assets = Liabilities + Equity at a point in time
- Tree structure with expandable accounts
- **Reference:** Fava's `tree.py` + `FilteredLedger` interval calculations

---

### Phase 2: Data Import & Budgets

#### 2.1 Bank Statement Import (Ingest)
- Load importer configurations from Python modules
- Walk import directories, extract entries using configured importers
- Preview extracted transactions before committing
- Generate proper file paths for uploaded documents
- **Reference:** Fava's `ingest.py` — full pipeline with error handling and hooks
- **Note:** This is a huge time-saver. Most users spend 80% of their time on data entry.

#### 2.2 Budgets
- Parse `custom "budget"` directives from beancount files
- Example: `2025-01-01 custom "budget" Expenses:Daily:Groceries "monthly" 800.00 BRL`
- Compute budgeted vs actual amounts per account per period
- Display as progress bars or budget-vs-actual charts
- **Reference:** Fava's `budgets.py`

---

### Phase 3: Power Features

#### 3.1 BQL Query Execution
- Execute Beancount Query Language (SQL-like) queries against the ledger
- Display results in a table
- Export to CSV and Excel
- Save named queries in the beancount file
- **Reference:** Fava's `query_shell.py`

#### 3.2 Currency Conversion Engine
- Multiple strategies: at-cost, at-market-value, to-target-currency
- Multi-hop conversion through cost currencies using price entries
- Essential for users holding stocks, crypto, or foreign currencies
- **Reference:** Fava's `conversion.py`

#### 3.3 Advanced Filtering
- Expression language: `payee:"Grocery" AND #food AND amount > 50`
- Filter by: date range, account regex, tags, links, payee, narration, amounts
- Composable with AND/OR/NOT
- Apply to any view (register, reports, charts)
- **Reference:** Fava's `filters.py` — has its own lexer/parser

#### 3.4 File Watcher / Auto-Reload
- Detect changes to beancount files (external editor, import scripts)
- Auto-reload data without manual refresh
- Two strategies: `watchfiles` library (preferred) or mtime polling (fallback)
- **Reference:** Fava's `watcher.py`

---

### Phase 4: Polish & Ecosystem

#### 4.1 Autocomplete Ranking
- Exponential-decay ranking: recently/frequently used values appear first
- Apply to accounts, payees, narrations, tags
- "Most likely account for this payee" with ranked suggestions
- **Reference:** Fava's `attributes.py`

#### 4.2 Account Status Monitoring
- Per-account health indicator: green/yellow/red
- Green: last entry is a passing `balance` directive
- Yellow: last entry is a transaction (no recent balance check)
- Red: last entry is a failing `balance` directive
- Generate balance directives for today's date
- **Reference:** Fava's `accounts.py`

#### 4.3 Source File Editor
- In-browser text editor for the beancount file
- SHA256-based conflict detection (don't overwrite external changes)
- Syntax highlighting for beancount format
- **Reference:** Fava's `file.py`

#### 4.4 Document Management
- Attach receipts/documents to accounts or transactions
- Store in configured document folders
- Validate file paths and account names
- Display attachments in the register
- **Reference:** Fava's `documents.py`

#### 4.5 Commodities & Price History
- Display commodity metadata (names, decimal precision)
- Price history chart for stocks/crypto
- Support `price` directives for market value calculations
- **Reference:** Fava's `commodities.py`

#### 4.6 Extension / Plugin System
- `custom "ledgr-extension"` directives to load third-party code
- Lifecycle hooks: after_load, after_insert, after_delete
- Extensions can provide custom report pages
- **Reference:** Fava's `extensions.py`

#### 4.7 Fava-Compatible Options
- Support `custom "fava-option"` directives for cross-compatibility
- Fiscal year end, collapse patterns, visibility settings
- **Reference:** Fava's `fava_options.py` (24+ options)

---

## Architecture Notes

### What Fava Does Well (Learn From)
- **Separation of concerns** — each feature is a self-contained module with a `load_file()` hook
- **FilteredLedger pattern** — base ledger + composable filter layers
- **JSON serialization layer** — dedicated `charts.py` transforms data for frontend consumption
- **Conflict detection** — SHA256 hashing before file writes
- **Exponential-decay ranking** — simple but effective for autocomplete UX

### Where Ledgr Differs (Our Strengths)
- **Multi-tab interface** — Fava is single-page; Ledgr has browser-style tabs
- **GnuCash-style register** — inline editing with keyboard navigation
- **Dark mode** — Fava is light-only
- **Command palette** — Cmd+K for quick actions
- **Local-first** — no account required, runs on your machine

### Backend Pattern for New Features
New features should follow this pattern:
1. Add a method to `engine.py` (or a new module imported by engine)
2. Add a FastAPI route in `main.py`
3. Add a fetch function in `frontend/src/api/client.ts`
4. Add TypeScript types in `frontend/src/types/index.ts`
5. Add a React component in `frontend/src/components/`
6. Wire it into the tab system or reports

### Frontend Charting
For charts (Phase 1), evaluate these libraries:
- **Recharts** — React-native, declarative, good for basic charts
- **visx** — Low-level D3 + React, more control, Airbnb-backed
- **Observable Plot** — Declarative, beautiful defaults, lightweight
- **Chart.js + react-chartjs-2** — Battle-tested, good performance

Recommendation: Start with **Recharts** for simplicity, migrate to **visx** if customization needs grow.

---

## Non-Goals (Out of Scope)
- Multi-user / authentication — Ledgr is a single-user local tool
- Cloud sync — beancount files are local, use git for sync
- Mobile app — focus on desktop web experience
- Replacing beancount CLI — Ledgr is a UI layer, not a replacement
