# Cash Flow: per-counterpart attribution + fully type-driven classification

> Status: **IMPLEMENTED** 2026-08-06. Plan authored 2026-07-27.
>
> **Implementation note (differs from original design below):** the planned
> "cash↔cash residual → Transfer" step was found to be mathematically vacuous —
> because every transaction balances (`sum(cash) = -sum(counterparts)`), the
> residual against same-currency counterparts is *always* 0. Per-counterpart
> attribution already accounts for all cash exactly; an internal shuffle between
> the entity's own cash accounts nets within cash and is **not** a separate cash
> flow (consistent with IAS 7 — only flows crossing the entity's cash boundary
> count). Genuine pure cash↔cash transfers (no non-cash counterpart) are still
> handled: 2-leg → labelled with the other account, 3+-leg → "Split", both
> netting to zero. This was caught by the new tests during implementation.

## Context

**Problem 1 — mixed transactions mis-categorized.** The Cash Flow Statement (CFS) emits
**one item per _cash_ posting**, classified by the *whole* counterpart set with a first-match
priority (loan > investment > operating). A single cash payment whose counterparts span more
than one IAS 7 section therefore lands entirely in one section and shows a synthesized
**"Split"** row. The trigger in the user's ledger is the recurring **Itaú "Financiamento"**
mortgage:

```
Assets:Bank:Personnalite            -4140.86   (cash)
Assets:RealState:Satilas              410.23    (investment  → should be INVESTING)
Expenses:Financial:MortgageInterest  1660.20    (expense     → should be OPERATING)
Assets:Receivables:Ogasaw            2070.43    (receivable  → should be OPERATING)
```

Today the whole −4.140,86 lands in **INVESTING** (because one counterpart, `Satilas`, is an
investment). Economically only −410,23 is investing; ~−3.730 (interest + receivable) is
operating. Net cash flow is correct and ties out — this is purely a **categorization/label**
issue. The fix moves money between sections; it never changes Net Cash Flow.

**Problem 2 — classifier is not fully type-driven.** Ledgr lets you assign 7 non-general
`ledgr-type`s, but the CFS classifier only handles some explicitly and resolves the rest by
**string prefix** (`Income:`/`Expenses:`/`Liabilities:`/`Assets:`). Four types
(`receivable`, `prepaid`, `credit-card`, `payable`) reach their section only via the prefix
fallback — correct today by accident, fragile if account trees are renamed. Since we're
formalizing the CFS around IAS 7, **every selectable ledgr-type should have an explicit,
documented CFS rule.**

**Intended outcome.** (1) Attribute each cash movement to its counterpart's section
individually so mixed transactions are split correctly and "Split" essentially disappears;
(2) make classification genuinely `ledgr-type`-driven for all 7 types, with prefixes only as
last-resort fallback.

### Scope in the real ledger (`financeiro.beancount`, verified 2026-07-27)
- **311** cash transactions; **2** mixed-*section* (both the Itaú mortgage, Jul + Aug 2026,
  recurring `!`) — the only txns where money moves between sections.
- **23** same-section multi-counterpart (Cadena Rent ×12, Claro Multi ×8, misc ×3) → become
  named rows **in the same section, same totals**.
- **0** mixed-sign multi-counterpart txns and **0** multi-cash-leg txns → the ambiguous cases
  don't occur in current data; the rules below exist for correctness going forward.
- Account typing is already clean: all 20 posted Assets/Liabilities accounts are correctly
  typed; only the empty parent `Liabilities:Loans` (0 postings) lacks a type — harmless, no
  data edit needed.

### Decisions locked with the user
1. **Fully type-driven classification for all 7 ledgr-types**, prefixes as fallback only:

   | ledgr-type    | Root        | CFS section (IAS 7)                    |
   |---------------|-------------|---------------------------------------|
   | `cash`        | Assets      | (defines the cash leg itself)         |
   | `investment`  | Assets      | **INVESTING**                         |
   | `receivable`  | Assets      | **OPERATING** (working capital)       |
   | `prepaid`     | Assets      | **OPERATING** (working capital)       |
   | `loan`        | Liabilities | **FINANCING**                         |
   | `credit-card` | Liabilities | **OPERATING** (substance over form; IAS 7 permits both, Operating chosen — see note) |
   | `payable`     | Liabilities | **OPERATING** (working capital)       |

   Income/Expenses are `general` by design and correctly classified by their
   `Income:`/`Expenses:` prefix (they don't carry a distinguishing type). Equity/other →
   TRANSFER default.

   *Credit-card note:* IAS 7 permits Operating **or** Financing. Operating is chosen —
   substance over legal form (a card is a payment mechanism for operating spend already
   booked to `Expenses:*`), and it keeps current section totals stable. A true borrowing
   (cash advance / carried interest) is modeled via its own counterparts, not by
   reclassifying all card payments.

2. **Receivables (and the other working-capital types) classified via `ledgr-type`, not the
   `Assets:`/`Liabilities:` prefix.** Add explicit helpers/rules; keep prefixes only as a
   fallback for untyped accounts.

3. **Refactor `classify_posting` in place** to a single-counterpart signature (not a list);
   update its call sites and the `TestClassifyPosting` suite.

4. **Per-counterpart attribution with Beancount-grounded multi-cash-leg handling.**
   Beancount's `example.beancount` "Hooli Payroll" is the canonical multi-cash-leg shape:
   two cash legs (`BofA:Checking` +1350.60, `Vanguard:Cash` +1200.00) that are independent
   *destinations* of income — **not** a transfer between each other. Double-entry treats each
   posting on its own. Therefore: **attribute by non-cash counterpart; any genuine cash↔cash
   residual (cash legs not fully explained by non-cash counterparts) is a Transfer.** Because
   every txn balances (`sum(cash) = -sum(non-cash)`), attributing `-counterpart` per non-cash
   counterpart reproduces the exact net cash automatically; an internal shuffle between the
   txn's own cash accounts surfaces as the residual → Transfer. Verified on Hooli Payroll and
   two synthetic residual cases.

## The new attribution algorithm (`compute_cashflow`)

Replace the per-cash-posting emission loop
([`backend/cashflow.py:169-199`](../../backend/cashflow.py)) with per-counterpart emission.
For each transaction with ≥1 cash posting (`cash_postings` / `counterparts` computed as today,
[`:153-164`](../../backend/cashflow.py)):

1. **Emit one item per non-cash counterpart**, in the counterpart's own currency:
   - `category = classify_posting(counterpart.account, type_map)` (single-counterpart)
   - `amount   = -counterpart.units.number`   (its cash effect)
   - `counterpart = counterpart.account`      (label; **no "Split"**)
   - `currency = counterpart.units.currency`
2. **Cash↔cash residual** per currency: `residual = sum(cash) - sum(-counterpart)`. If
   non-zero → emit a **Transfer** item. Label: two cash legs → the other cash account name
   (mirrors today's cash↔cash label at [`:179-185`](../../backend/cashflow.py)); 3+ cash legs →
   `"Split"` (the only surviving Split case). Pure transfers (no non-cash counterpart)
   reproduce today's behavior.
3. Route to `items` (OC) or `other_items` (non-OC) exactly as today
   ([`:196-199`](../../backend/cashflow.py)).

Everything downstream is unchanged and inherits the fix, because it reads from
`items`/`other_items`: `aggregate` ([`:204-216`](../../backend/cashflow.py)), `build_breakdown`
([`:237-268`](../../backend/cashflow.py)), `build_other_breakdown` ([`:271-297`](../../backend/cashflow.py)),
`net_cashflow` ([`:219-227`](../../backend/cashflow.py)), result assembly ([`:305-342`](../../backend/cashflow.py)).
Investing labels already strip `Assets:` ([`:258-259`](../../backend/cashflow.py)).

**Invariant preserved:** per-counterpart `-amount` + residual sums to `sum(cash)` per txn, so
section subtotals still sum to the identical Net Cash Flow.

## Files to change

- **`backend/account_types.py`**
  - Add type-set constants + helpers so the CFS can ask by type: `is_receivable_account`,
    `is_prepaid_account`, `is_creditcard_account`, `is_payable_account` (next to existing
    `is_cash/investment/loan_account`, [`:128-140`](../../backend/account_types.py)). Reuse the
    existing `VALID_ASSET_TYPES` / `VALID_LIABILITY_TYPES` ([`:43-50`](../../backend/account_types.py)).
    (Optional, non-behavioral: define OPERATING/INVESTING/FINANCING type sets to centralize the map.)
- **`backend/cashflow.py`**
  - Refactor `classify_posting` ([`:75-108`](../../backend/cashflow.py)) to
    `classify_posting(cash_account, counterpart, type_map)` (single counterpart). Order,
    preserving the two CRITICAL invariants (loan before generic liabilities; investment
    before operating):
    `loan→FINANCING` → `investment→INVESTING` → `{receivable, prepaid, credit-card, payable}→OPERATING`
    → `Income:/Expenses:/Liabilities: prefix→OPERATING` → `non-cash Assets: prefix→OPERATING`
    (fallback) → `TRANSFER` (default).
  - Rewrite the emission loop ([`:169-199`](../../backend/cashflow.py)) per the algorithm above.
- **`backend/tests/test_cashflow.py`**
  - Update `TestClassifyPosting` to the new signature.
  - Add coverage: each of the 7 types → correct section (esp. receivable/prepaid/credit-card/
    payable via ledgr-type, not prefix); mixed-section txn split across sections; multi-cash-leg
    (Hooli-style) → correct net, no spurious Split; genuine cash↔cash residual → Transfer;
    a section's summed line-items == its subtotal; "Split" only for 3+ cash-leg transfers.
- **`docs/backend/cashflow.md`**
  - Update the classification table to all 7 types; rewrite "How the Cash Flow is computed"
    steps 5–6 to per-counterpart attribution; document the residual→Transfer rule citing the
    Beancount Hooli-payroll precedent; record the credit-card→Operating IAS 7 rationale and
    what "Split" now means.
- **No frontend changes.** `CashFlowStatement.tsx` renders whatever the API returns; the
  existing section-header "Split" span stays (harmless).
- **No `.beancount` data edits.** (`Liabilities:Loans` parent may optionally be typed `loan`
  later; it has no postings and does not affect the report.)

## Verification

1. **Unit tests:** `cd backend && source .venv/bin/activate && python -m pytest tests/test_cashflow.py -q` — all pass incl. new type/mixed/multi-cash cases.
2. **Full backend suite:** `python -m pytest -q` — no cross-module regressions (reports/routers/budgets).
3. **Real-ledger before/after** (script: `init_ledger(<financeiro.beancount>)` +
   `get_filtered_entries(L,"combined")` + `compute_cashflow`), assert for **2026-08**:
   - Operating gains `MortgageInterest` (−1.660,20) and the mortgage `Ogasaw` portion
     (+2.070,43); Investing = `RealState:Satilas` −410,23 only.
   - **No `full_name == "Split"`** in Operating or Investing.
   - `net_cashflow["2026-08"]` unchanged = **6.068,62**; opening 161,07 + net = closing
     **6.229,69** (identical to today).
   - Every section: subtotal == sum of its line items, every period.
   - Same-section cases (Cadena Rent, Claro Multi) render named rows with unchanged Operating
     subtotals.
4. **Live smoke:** `curl "http://localhost:8420/api/reports/cashflow?interval=monthly"` and
   the Cash Flow tab — mixed rows render named (no "Split"), totals unchanged.

## Notes / non-goals
- Does **not** change Net Cash Flow, opening, or closing — categorization/labeling only.
- Does **not** reclassify mortgage *principal* out of Investing (RealState principal =
  Investing vs Financing is a separate modeling question, out of scope).
- Credit-card stays Operating (IAS 7 permits both; substance-based choice).
