# Ledgr

**Your finances deserve real accounting — not a spreadsheet cosplaying as one.**

Ledgr is a personal finance app powered by [double-entry accounting](https://en.wikipedia.org/wiki/Double-entry_bookkeeping) via [Beancount](https://beancount.github.io/docs/), wrapped in a modern React interface. Think of it as the three financial statements that every corporation has — Income Statement, Balance Sheet, and Cash Flow Statement — but for _you_.

Your entire financial life lives in a single `.beancount` plain-text file. Git-friendly, human-readable, yours forever.

---

## Why Ledgr?

Most personal finance apps track where your money _went_. Ledgr tracks where your money **is**, where it **came from**, and where it's **going** — the same way a CFO would, just without the corporate jargon.

Under the hood, Beancount (10+ years of battle-tested accounting logic) and Fava (5+ years as a reference interface) do the heavy lifting. Ledgr doesn't reinvent the wheel — it puts a better dashboard on it.

---

## Features

- **Income Statement** — Revenue vs. expenses over any time period
- **Balance Sheet** — Assets, liabilities, and equity at a glance (with the accounting equation enforced: `A = L + E`)
- **Cash Flow Statement** — Operating, investing, and financing activities broken down by period
- **Net Worth tracking** — Historical net worth over time
- **Transaction management** — Full CRUD with smart suggestions based on payee history
- **Account explorer** — Hierarchical account tree with real-time balances
- **Plain-text data** — Your `.beancount` file is the single source of truth. No vendor lock-in, no proprietary database

---

## Tech Stack

| Layer      | Technology                                   |
| ---------- | -------------------------------------------- |
| Data       | `.beancount` file (plain text, Git-friendly) |
| Accounting | Beancount + Fava (Python)                    |
| Backend    | FastAPI (Python 3.12+)                       |
| Frontend   | React 18 + TypeScript + Vite                 |
| Tests      | pytest (backend) + vitest (frontend)         |

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- npm

### Setup

```bash
# Clone the repo
git clone https://github.com/your-org/ledgr.git
cd ledgr

# Run the setup script (creates venv, installs deps, generates example data)
./scripts/setup.sh
```

### Development

```bash
# Start both backend and frontend in dev mode
./scripts/dev.sh

# Or use a custom beancount file
./scripts/dev.sh path/to/your-ledger.beancount
```

Once running:

| Service  | URL                        |
| -------- | -------------------------- |
| Frontend | http://localhost:5173      |
| Backend  | http://localhost:8080      |
| API Docs | http://localhost:8080/docs |

---

## Project Structure

```
ledgr/
├── backend/
│   ├── main.py              # FastAPI app entry point
│   ├── ledger.py            # FavaLedger singleton
│   ├── serializers.py       # Beancount types → JSON
│   ├── cashflow.py          # Cash Flow Statement logic
│   ├── routers/
│   │   ├── accounts.py      # GET /api/accounts, /api/account-names, /api/payees
│   │   ├── transactions.py  # GET/POST/PUT/DELETE /api/transactions
│   │   ├── reports.py       # Income Statement, Balance Sheet, time series
│   │   └── cashflow.py      # GET /api/reports/cashflow
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── api/             # Typed fetch wrappers
│   │   ├── components/      # React components
│   │   ├── pages/           # Page-level views
│   │   └── types/           # TypeScript types mirroring backend schemas
│   └── tests/
├── data/                    # Beancount files (generated or yours)
└── scripts/
    ├── setup.sh             # One-time project setup
    └── dev.sh               # Start development servers
```

---

## API Overview

| Endpoint                        | Method | Description                      |
| ------------------------------- | ------ | -------------------------------- |
| `/api/accounts`                 | GET    | Account tree with balances       |
| `/api/account-names`            | GET    | All account names (autocomplete) |
| `/api/payees`                   | GET    | All payees (autocomplete)        |
| `/api/transactions`             | GET    | List transactions (filterable)   |
| `/api/transactions`             | POST   | Add a new transaction            |
| `/api/transactions`             | PUT    | Edit an existing transaction     |
| `/api/transactions/{lineno}`    | DELETE | Delete a transaction             |
| `/api/reports/income-statement` | GET    | Income Statement                 |
| `/api/reports/balance-sheet`    | GET    | Balance Sheet                    |
| `/api/reports/cashflow`         | GET    | Cash Flow Statement              |
| `/api/reports/income-expense`   | GET    | Income vs expense time series    |
| `/api/reports/net-worth`        | GET    | Net worth over time              |
| `/api/reports/account-balance`  | GET    | Single account balance over time |
| `/api/suggestions`              | GET    | Smart payee-based suggestions    |
| `/api/options`                  | GET    | Ledger options (currency, title) |
| `/api/errors`                   | GET    | Beancount parse errors           |

Full interactive documentation available at `/docs` when the backend is running.

---

## Running Tests

```bash
# Backend
cd backend
source .venv/bin/activate
pytest

# Frontend
cd frontend
npm test
```

---

## Environment Variables

| Variable         | Default                  | Description                    |
| ---------------- | ------------------------ | ------------------------------ |
| `BEANCOUNT_FILE` | `data/example.beancount` | Path to your `.beancount` file |

---

## Design Philosophy

Ledgr follows one golden rule:

> **Beancount and Fava do the accounting. Ledgr presents it.**

If Beancount or Fava already computes something — balances, account trees, income statements — Ledgr delegates to them. The only custom accounting logic in the entire codebase is the **Cash Flow Statement**, since Fava doesn't provide one natively.

This keeps the codebase thin, correct, and maintainable. Standing on the shoulders of giants beats rebuilding the giant from scratch.

---

## Contributing

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Make sure tests pass (`pytest` + `npm test`)
4. Commit your changes (`git commit -m 'Add my feature'`)
5. Push to the branch (`git push origin feature/my-feature`)
6. Open a Pull Request

Before submitting, check the [AGENTS.md](./AGENTS.md) file for code conventions, architecture rules, and the PR checklist.

---

## License

This project is licensed under the Apache License 2.0 — see the [LICENSE](./LICENSE) file for details.
