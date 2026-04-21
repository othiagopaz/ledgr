---
type: module
last_updated: 2026-04-21
---

# Cash Flow Statement — the only custom accounting

The Cash Flow Statement is the only report Fava/Beancount does not implement natively. All custom accounting logic in Ledgr lives in `backend/cashflow.py` — nowhere else. See [`../principles/beancount-first.md`](../principles/beancount-first.md) for why.

## `ledgr-type` metadata — account classification

Accounts are classified by `ledgr-type` metadata on their `Open` directive, **not by name prefixes**. This lives in `backend/account_types.py`.

```beancount
2024-01-01 open Assets:Bank:Itau  BRL
  ledgr-type: "cash"

2024-01-01 open Liabilities:CreditCard:Nubank  BRL
  ledgr-type: "credit-card"
```

| `ledgr-type`   | Applies to              | Cash Flow role                                  |
|----------------|-------------------------|-------------------------------------------------|
| `cash`         | Assets                  | **Cash account** — generates cash flow postings |
| `investment`   | Assets                  | Counterpart → **Investing**                     |
| `receivable`   | Assets                  | Operating working capital                       |
| `prepaid`      | Assets                  | Operating working capital                       |
| `credit-card`  | Liabilities             | Operating counterpart                           |
| `loan`         | Liabilities             | Counterpart → **Financing**                     |
| `payable`      | Liabilities             | Operating counterpart                           |
| `general`      | Income/Expenses/Equity  | Default, no special behavior                    |

**Enforcement**: `Assets` and `Liabilities` accounts **require** `ledgr-type`. `Income`, `Expenses`, `Equity` default to `"general"` if absent.

## 3-tier asset classification

| Tier           | `ledgr-type`                      | Cash Flow role                                  |
|----------------|-----------------------------------|-------------------------------------------------|
| **Cash**       | `"cash"`                          | Only these accounts generate cash flow postings |
| **Investment** | `"investment"`                    | Counterpart → **Investing**                     |
| **Other**      | `"receivable"`, `"prepaid"`, etc. | Counterpart → **Operating** (working capital)   |

Key behaviors:

- Only transactions touching a **cash** account appear in the Cash Flow
- Cash ↔ Investment = **Investing**
- Cash ↔ Other non-cash (Receivables, Deposits…) = **Operating** (working capital)
- Non-cash ↔ Non-cash = **excluded** (no cash movement)
- Income → Investment (interest reinvested, never hits bank) = **excluded**

Account names do not matter — only `ledgr-type` does. `Liabilities:Emprestimo` with `ledgr-type: "loan"` correctly classifies as financing.

## Classification rules — order is CRITICAL

```
1. FINANCING   → counterpart has ledgr-type "loan"       (checked FIRST)
2. INVESTING   → counterpart has ledgr-type "investment" (checked BEFORE operating)
3. OPERATING   → counterpart is Income:*, Expenses:*, Liabilities:*, or other non-cash asset
4. TRANSFER    → default (cash ↔ cash, e.g. bank transfer)
```

### Why order matters

- **Loan accounts MUST be checked BEFORE generic Liabilities.** Otherwise loan payments are misclassified as "operating" instead of "financing". This was a real bug — do not regress.
- **`INVESTING` MUST be checked BEFORE `OPERATING`.** Otherwise investment transactions with incidental expenses (commissions, fees) get misclassified as operating. Dividends still classify as operating because they flow from `Income` → cash account (no investment counterpart).

See [`../pitfalls.md`](../pitfalls.md) for what each mis-order produces.

## How the Cash Flow is computed

1. Get entries for the period
2. Iterate entries, take only `Transaction` entries
3. For each transaction, take postings on **cash accounts** (whitelist)
4. Counterparts = all accounts in the txn that are NOT cash accounts
5. Classify each cash posting using the 3-tier rules above
6. Group by category and sum

Transactions with no cash postings (e.g. `Income:Interest → Assets:Investments:Float` or `Assets:Investments:Account → Assets:Investments:Bucket1`) are skipped entirely.

## Investing breakdown labels

Investing items strip the `Assets:` prefix from the counterpart name for readability:

- `Assets:Investments:Account` → `"Investments:Account"`
- `Assets:Broker:XP` → `"Broker:XP"`

## What must NOT be done in `cashflow.py`

- Do not reload the `.beancount` file
- Do not call `loader.load_file()`
- Do not compute account balances — only period deltas

The module takes the already-loaded ledger from [`modules.md`](modules.md) and returns deltas. That is its whole job.

## Testing

See [`testing.md`](testing.md) — every category (operating, investing, financing, transfer) needs coverage, including these edge cases:

- Loan payment via credit card
- Asset-to-asset investment transfer (should be excluded)
- Income → Investment flow (should be excluded)
- Dividend as operating (Income → cash, no investment counterpart)
