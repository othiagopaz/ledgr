---
type: module
last_updated: 2026-08-19
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

Every non-`general` `ledgr-type` has an **explicit** Cash Flow rule (driven by
the type, not the account-name prefix). Prefixes are only a last-resort fallback
for accounts that lack a type.

| `ledgr-type`   | Applies to              | Cash Flow role                                  |
|----------------|-------------------------|-------------------------------------------------|
| `cash`         | Assets                  | **Cash account** — generates cash flow postings |
| `investment`   | Assets                  | Counterpart → **Investing**                     |
| `receivable`   | Assets                  | Counterpart → **Operating** (working capital)   |
| `prepaid`      | Assets                  | Counterpart → **Operating** (working capital)   |
| `credit-card`  | Liabilities             | Counterpart → **Operating** (see note)          |
| `payable`      | Liabilities             | Counterpart → **Operating** (working capital)   |
| `loan`         | Liabilities             | Counterpart → **Financing**                     |
| `general`      | Income/Expenses/Equity  | By account root: Income/Expenses → Operating; Equity → Transfer |

**`credit-card` → Operating.** IAS 7 permits classifying credit-card settlement
as operating **or** financing. Ledgr chooses **operating** by substance over
legal form: a card is a payment mechanism for ordinary spend already booked to
`Expenses:*`, so settling it is an operating cash outflow. A genuine borrowing
(cash advance, carried interest) is modelled through its own counterparts, not
by reclassifying every card payment.

**Enforcement**: `Assets` and `Liabilities` accounts **require** a `ledgr-type`;
`Income`, `Expenses`, `Equity` default to `"general"` if absent. This is enforced
at three layers:

- **Backend (authoritative):** `_validate_ledgr_type` in `routers/accounts.py`
  rejects a create (`POST /api/accounts`) or edit (`PUT /api/accounts`) of an
  Assets/Liabilities account with a missing or root-invalid type — HTTP 400.
  `ledgr-type` is protected internal metadata, so a metadata-only edit cannot
  clear it.
- **Frontend:** the account modal disables Save and shows an inline hint until a
  required type is chosen, and fetches the valid options from
  `GET /api/account-types` (never a hardcoded copy).
- **Pre-existing data:** `GET /api/accounts/warnings` reports any already-persisted
  Assets/Liabilities account (e.g. from a hand-edited file) that is missing its type.

An untyped Assets/Liabilities account that somehow reaches classification is
treated as `transfer` (visibly wrong) rather than being silently bucketed.

## Asset/Liability classification tiers

| Tier               | `ledgr-type`                                          | Cash Flow role                                  |
|--------------------|-------------------------------------------------------|-------------------------------------------------|
| **Cash**           | `"cash"`                                              | Only these accounts generate cash flow postings |
| **Investment**     | `"investment"`                                        | Counterpart → **Investing**                     |
| **Loan**           | `"loan"`                                              | Counterpart → **Financing**                     |
| **Working capital**| `"receivable"`, `"prepaid"`, `"credit-card"`, `"payable"` | Counterpart → **Operating**                 |

Key behaviors:

- Only transactions touching a **cash** account appear in the Cash Flow
- A cash movement is attributed to its **counterparts** (per counterpart), so a
  mixed transaction splits across sections
- Investment counterpart = **Investing**; receivable/prepaid/credit-card/payable/
  Income/Expenses/other non-cash asset = **Operating**; loan = **Financing**
- Non-cash ↔ Non-cash = **excluded** (no cash movement)
- Income → Investment (interest reinvested, never hits bank) = **excluded**

Account names do not matter — only `ledgr-type` does. `Liabilities:Emprestimo` with `ledgr-type: "loan"` correctly classifies as financing.

## Classification rules — order is CRITICAL

`classify_posting(cash_account, counterpart, type_map)` classifies a **single**
counterpart (one non-cash posting account), or `None` for a pure cash↔cash move:

```
1. FINANCING   → counterpart ledgr-type "loan"                    (checked FIRST)
2. INVESTING   → counterpart ledgr-type "investment"              (BEFORE operating)
3. OPERATING   → counterpart ledgr-type receivable/prepaid/credit-card/payable,
                 then Income:/Expenses:/Liabilities: prefix, then any other
                 non-cash Assets: prefix (fallback for untyped accounts)
4. TRANSFER    → default (None counterpart, Equity, or anything else)
```

### Why order matters

- **Loan accounts MUST be checked BEFORE generic Liabilities.** Otherwise loan payments are misclassified as "operating" instead of "financing". This was a real bug — do not regress.
- **`INVESTING` MUST be checked BEFORE `OPERATING`.** Otherwise an untyped account caught by a prefix rule could shadow a real investment classification. (With per-counterpart attribution, a stock buy with a commission now yields *two* items — the investment leg → investing and the commission leg → operating — but the ordering still guards the single-counterpart decision.)

See [`../pitfalls.md`](../pitfalls.md) for what each mis-order produces.

## How the Cash Flow is computed — per-counterpart attribution

Attribution follows **what the cash was for** (its counterparts), not which cash
account it sat in. This implements IAS 7 §12: *"a single transaction may include
cash flows that are classified differently … when the cash repayment of a loan
includes both interest and capital, the interest element may be classified as
operating and the capital element as financing."*

1. Get entries for the period; keep only `Transaction` entries (flags `*`/`!`).
2. For each transaction, take postings on **cash accounts** (whitelist). Skip the
   txn if there are none — no cash movement, not a cash-flow event.
3. Group the work by **currency** (a cross-currency leg is handled separately —
   see below). For each currency present among the cash legs:
   - **If there are non-cash counterparts in that currency** → emit one item per
     counterpart, with `amount = -counterpart.number` and its own classification.
     A mixed transaction thus splits across sections. Because the transaction
     balances, the counterpart amounts sum to exactly the negative of the cash
     legs, so the cash is fully accounted for — there is **no** inter-cash
     "transfer" to extract (which of your own accounts funded which counterpart
     nets within the entity's cash and is not itself a cash flow).
   - **If there is no same-currency counterpart** → this is either a pure cash↔cash
     move (bank transfer → **Transfer**, labelled with the other cash account) or a
     cross-currency leg whose counterpart is priced in another currency (e.g. buy
     shares in ITOT with a USD cash leg → classify the whole cash leg against the
     other-currency counterpart, so it lands in **Investing**).
   - **Cross-currency remainder:** when a currency has same-currency counterparts
     that explain only *part* of the cash leg (e.g. buy shares priced in ITOT with a
     USD cash leg **and** a USD commission — the commission explains only 5 of a
     3505 USD outflow), the unexplained remainder is emitted as one more item,
     classified against the other-currency counterpart (→ **Investing**). Without
     this the cross-currency portion would be dropped and net would stop
     reconciling with the opening/closing balance. **Invariant:** per currency,
     the emitted item amounts sum to the cash-leg total, so `closing == opening +
     net` for every period.
4. Group by category and sum. Section subtotal always equals the sum of the
   breakdown's **top-level** nodes — see [Breakdown shape](#breakdown-shape).

Transactions with no cash postings (e.g. `Income:Interest → Assets:Investments:Float` or a credit-card *purchase* `Expenses:Food → Liabilities:CreditCard`) are skipped entirely — no cash moved.

### "Split"

"Split" is **not** an account. It is a synthesized label used only for a pure
cash↔cash **transfer** among **3 or more** cash accounts in one transaction (a
2-account transfer is labelled with the other account). With per-counterpart
attribution, mixed operating/investing transactions no longer produce a "Split"
row — each counterpart appears under its own name in its own section.

## Breakdown shape

Each section's `items` is a **tree** of counterpart accounts, built by
`build_report_tree` in [`modules.md`](modules.md)'s `serializers.py` — the same
function the Income Statement uses. Every node carries:

| Field       | Meaning                                                       |
|-------------|---------------------------------------------------------------|
| `name`      | Leaf segment only — the display label                         |
| `full_name` | Full account path — the drill-down target                     |
| `totals`    | period → number, the node **and its descendants**             |
| `total`     | Sum across periods                                            |
| `children`  | Nested nodes                                                  |

**Why a tree.** Two counterparts can share a leaf name — a deferred-income
release touches `Assets:Reserva:Bonus`, `Liabilities:Deferred:Bonus` and
`Income:Bonus` in one transaction, and the flat breakdown rendered all three as
`"Bonus"`. Nesting is what disambiguates them, so the label can stay short. This
also retires the old "strip the `Assets:` prefix on investing items" special
case, which existed only to compensate for the flat list.

**The root is kept as a node** (`keep_root=True`), unlike the Income Statement,
which drops it. Two reasons:

- A cash flow section header (`Operating`) is not an account root, and
  per-counterpart attribution puts `Assets`, `Liabilities`, `Income` and
  `Expenses` under the *same* section by design.
- An asset increase and a liability increase read **opposite** ways in a cash
  flow, so the reader needs to see which root a row sits under.

Consequences to respect:

- **Subtotal ties to the top-level nodes only.** Summing every node
  double-counts children. Tests use `flatten_items` / `leaf_items` helpers in
  `test_cashflow.py` to walk the tree.
- **Never pass `negate=True`.** Breakdown amounts are already sign-normalized to
  their cash effect (`amount = -counterpart.number`); negating flips every row.
- Counterparts that are zero in **every** period are dropped before the tree is
  built, so no empty parent chains appear.
- Intermediate levels with no postings of their own still render, as pure
  rollups: `Assets:Reserva:Bonus:2026:Q1` produces five nested rows. Deep
  single-child chains render as a ladder — a deliberate choice to keep the
  rendering identical to the Income Statement's.
- `"Split"` is a synthesized label with no colons; it stays a single node.

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
