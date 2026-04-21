---
type: reference
last_updated: 2026-04-21
---

# Architecture

## What Ledgr is

A personal finance app with one core differentiator: it uses **double-entry accounting** (via Beancount) as its data backend, exposed through a modern React interface.

The product vision is a **3-statement model** for individuals — Income Statement, Balance Sheet, and Cash Flow Statement — synchronized, cascading from a single `.beancount` file.

## Stack and dependencies

| Layer        | Technology                                      |
|--------------|-------------------------------------------------|
| Data         | `.beancount` file (plain text, Git-friendly)    |
| Accounting   | `beancount` (Python lib) + `fava` (Python lib)  |
| Backend      | FastAPI (Python 3.12+)                          |
| Frontend     | React 19 + TypeScript + Vite                    |
| Tests        | `pytest` (backend) + `vitest` (frontend)        |

## Repository layout

```
ledgr/
├── AGENTS.md                    # Agent schema → routes to docs/
├── docs/                        # Wiki (you are here)
├── backend/
│   ├── main.py                  # FastAPI app + startup
│   ├── ledger.py                # Singleton: FavaLedger wrapper + entry filtering
│   ├── serializers.py           # Fava/Beancount types → JSON dicts
│   ├── cashflow.py              # The only custom accounting logic
│   ├── account_types.py         # ledgr-type vocabulary, type map, classification helpers
│   ├── series.py                # Series (recurring/installments) pure functions
│   ├── routers/
│   │   ├── accounts.py          # GET /api/accounts, /api/account-names, etc.
│   │   ├── transactions.py      # GET/POST/PUT/DELETE /api/transactions
│   │   ├── reports.py           # GET /api/reports/income-expense, /net-worth, etc.
│   │   ├── cashflow.py          # GET /api/reports/cashflow
│   │   └── series.py            # Series bulk operations
│   └── tests/
│       ├── fixtures/            # .beancount files used in tests
│       └── test_*.py
├── frontend/
│   ├── src/
│   │   ├── api/client.ts        # Typed fetch wrappers
│   │   ├── stores/appStore.ts   # Zustand store (includes viewMode toggle)
│   │   ├── hooks/               # useKeyboardNav, etc.
│   │   ├── components/          # UI components + reports/ subdir
│   │   └── types/index.ts       # TypeScript types
│   └── tests/
├── scripts/
│   ├── setup.sh                 # One-time setup
│   ├── dev.sh                   # Start dev servers
│   └── wiki-lint.py             # Wiki linter
└── data/                        # .beancount files
```

For module contracts, see [`backend/modules.md`](backend/modules.md) and [`backend/cashflow.md`](backend/cashflow.md). For frontend structure in detail, see [`frontend/guidelines.md`](frontend/guidelines.md).
