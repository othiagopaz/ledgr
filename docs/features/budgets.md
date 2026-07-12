---
type: feature
last_updated: 2026-06-15
---

# Budgets — zero-based envelopes + indirect-method cash bridge

A separate **Budget** surface where the user allocates expected income into
per-account monthly envelopes (zero-based budgeting) and watches each envelope
drain as real transactions land. The view's summary is an **indirect-method
cash bridge** that reconciles accrual Net Income down to **Net Cash Flow**,
which ties to the Cash Flow Statement.

Purely additive: it does not modify the 3-statement engine, transaction CRUD,
or the global filter layer. If the feature were deleted, `cashflow.py`,
`serializers.py`, `account_types.py`'s existing helpers, and the cashflow/
reports/transactions routers would be byte-identical (the budget only *reads*
`get_filtered_entries` and mirrors — never imports — the cashflow classifier).

This page is the single source of truth; it folds in the full design history
that previously lived in `docs/plans/PLAN-budgets*.md`.

---

## 1. Core principle — delegate to Fava

Beancount has no budget concept; **Fava does**. Ledgr adopts Fava's native
directive **verbatim** (no `ledgr-budget` namespace), so the file stays readable
by vanilla Fava:

```
2026-06-01 custom "budget" Expenses:Food:Restaurant "monthly" 500.00 BRL
```

Fava's `BudgetModule` (`ledger.budgets`) parses these. `allocated` is **always**
`ledger.budgets.calculate(account, start, end)` — Ledgr never recomputes a
budget amount. `calculate`'s `date_to` is exclusive.

**One directive per (account, month), dated the 1st.** Ledgr writes exactly one
`monthly` directive per budgeted account per month. A `monthly` directive
round-trips exactly over a full calendar month (Fava breaks it into a daily rate
and re-sums). Fava keeps only the **last** directive per account+date if a file
ever contains duplicates — see §7 (the write path dedupes).

## 2. The three buckets

Each envelope tracks three numbers over operating-currency (OC) postings to the
account **and its descendants**:

| Bucket      | Source                                  |
|-------------|-----------------------------------------|
| `allocated` | Fava's `custom "budget"` directive      |
| `pending`   | postings on `!` (planned) transactions  |
| `realized`  | postings on `*` (confirmed) transactions|

- **Consumed is accrual**: an envelope drains when its expense posts, regardless
  of payment instrument. A credit-card purchase drains its expense envelope at
  purchase; paying the card bill drains nothing.
- **Income sign normalization**: `Income:*` postings are credits (negative); the
  orchestration layer negates income realized/pending so they read positive.
- Synthetic `clamp_opt` entries (flag `S`) are excluded — only `*`/`!` count.
- Non-OC postings are ignored (operating currency only).

### The `P` (Actual + Planned) toggle

The global planned/actual toggle drives presentation:

- **`actual`** — columns are split: `realized` = `*` only, `pending` = `!` only;
  `free = allocated − realized`.
- **`combined` ("Actual + Planned")** — planned is treated as **already done**:
  the displayed `realized` folds in pending (`realized + pending`), the displayed
  `pending` is blanked to 0, and `free = allocated − realized − pending`.

The envelope **bar** is a single solid fill of what counts in the current mode
(no hatched pending segment) over an empty `free` track, plus a thin pace marker
at `paced_allocation`. Overflow bleeds into an alert color for spend envelopes;
for income a full bar is "good" (the color mapping flips by `variant`).

## 3. Sections

Budgeted accounts group into three sections by account root **and** ledgr-type:

| Section | Accounts |
|---|---|
| **income** | `Income:*` |
| **expenses** | `Expenses:*` |
| **allocations** | `Assets`/`Liabilities` accounts that are `investment`- or `loan`-typed |

**Only `investment` and `loan` allocation types are budgetable.** cash,
receivable, prepaid, credit-card and payable are financial movements /
instruments, not budget envelopes — excluded from rows, ghosts and the closure,
and **rejected with 400** at write time. `Equity` is rejected too. The check is
**descendant-aware** (`is_budgetable_allocation`): budgeting a parent account
whose own ledgr-type is absent is allowed when a descendant is `investment`/
`loan` — e.g. budgeting `Liabilities:Loans` works because its typed child
`Liabilities:Loans:KA` carries the postings (which roll up). This mirrors the
Cash Flow Statement, which classifies by the typed posting account.

## 4. The budget is a CASH plan — Income and Allocations require a cash leg

The budget plans **spendable cash**, so **Income and Allocations count a posting
only when its transaction touches a `ledgr-type: "cash"` account**
(`sum_account_postings(..., require_cash_counterpart=True)`) — the same rule the
Cash Flow Statement uses.

- **Income** — salary paid into the bank counts; money that never lands in your
  bank does not. A pension benefit (`Income:Salary:Additional → Assets:Investments`,
  no cash leg) or reinvested interest (`Income:Interest → Assets:Investments`)
  inflates the accrual Income Statement but is **not budget income** — budgeting
  against it would plan cash that never exists. It earns no income row.
- **Allocations** — count cash↔investment/loan **both ways**: a contribution out
  (`Assets:Cash → Assets:Investments`) and a withdrawal back in
  (`Assets:Investments → Assets:Cash`, a negative allocation that funds a
  shortfall). broker→broker transfers (no cash leg) are excluded.
- **Expenses** — the one deliberate accrual: counted regardless of funding, so a
  credit-card purchase drains its envelope at purchase, before the bill is paid.
  This is what lets you budget card spend; its timing gap surfaces in §5.

## 5. The summary — the cash bridge

The top of the view is a small statement (`BudgetSummary`) built entirely on
cash. Because every section already counts only what touches cash (§4), the
roll-up needs no accrual "Net income" line and no non-cash plug — it is simply:

```
  Income                       (cash-touching receipts)
− Expenses                     (accrual — incl. card purchases)
− Allocations                  (contributions out − withdrawals in)
− Cash timing                  (card/bill timing gap; 0 and hidden when none)
═ Net cash flow                (target 0)
```

Three columns, **"Allocated = will-be, Realized = now, Δ Variance = the gap"**:

- **Realized** — actual cash this month. `net_cash_flow.realized` **equals the
  Cash Flow Statement's net** for the same month/view (the anchor; enforced by a
  test). Outflow rows render as negatives.
- **Allocated** — the projection: the cash you'll end with if the plan plays out
  (budgeted income − budgeted expenses/allocations − actual timing). Uses the
  budgeted directive amounts as-is.
- **Δ Variance** — `Realized − Allocated` on the displayed (signed) values. This
  is the deviation from the plan and the primary decision signal: on **Net cash
  flow** it answers "did the month close at zero?" (target is 0, so any non-zero
  is flagged) and tells you there is cash left to allocate or a shortfall to
  cover; on each section it shows **where** the drift came from (an over-budget
  expense, under-aported allocations, or budgeted income that never became cash —
  e.g. a pension line that reads Allocated 3000 / Realized 0 / Variance −3000,
  teaching you to drop that budget). Favourable/adverse colouring is directional.

The **Planned** column was removed — the global `P` (Actual + Planned) toggle
already folds planned activity into Realized, so a separate column was noise.

The envelope tables use the same word: their last column is **Variance**
(= `allocated − consumed`, the per-account gap) — formerly labelled "Free".

"**Cash timing**" (`other_non_cash` in the payload, kept for compat) is the one
reconciling line, and it exists only because Expenses are accrual: a card
purchase drains its envelope now but the cash leaves when the bill is paid.
So it is *card purchases with no cash leg, minus card bill payments (cash leg,
non-Expense counterpart), plus any receivable/payable Δ* — the honest price of
budgeting the card. When there is no open card activity it is 0 and the row is
hidden. The cash anchor is `sum_cash_delta` — the sum of all `cash`-typed
postings, the same quantity the Cash Flow Statement reports. By construction
`Income − Expenses − Allocations − Cash timing = Net Cash Flow` ties to the
Cash Flow Statement to the cent, without a general non-cash plug.

Why the two reports differ (and should): the Budget is **accrual**; the Cash
Flow Statement is **cash-basis**. The bridge makes the difference explicit and
ties them to the cent. Example (June 2026 of a real ledger): Net income 8 209,80
− Allocations 4 149,89 − Other 3 059,91 = Net cash flow 1 000,00 = cashflow net.

The view uses the **full pane width** (`budget-content`, no 1100px report cap).

## 6. Ghost rows — unbudgeted activity

Accounts with activity but no budget directive surface as greyed "unbudgeted"
ghost rows (`is_ghost: true`, `allocated 0`, real consumed shown) with a "Set
budget" affordance; clicking promotes them to a real envelope. Rules:

- Ghosts follow the `P` toggle (in `actual`, only `*`-active accounts ghost; in
  `combined`, `!` too) and only appear when their consumed is non-zero in the
  current mode.
- **Cash accounts never ghost** (they are funding sources, not envelopes).
- A ghost that overlaps a budgeted account, or a descendant ghost under another
  ghost, is folded into its ancestor's rolled-up row (`dedupe_ghost_subtrees`,
  `overlaps_budgeted`) so overlapping ghosts never double-count.
- Ghosts feed the closure via an **effective allocation**: a budgeted account
  contributes its directive; a ghost contributes its consumed amount. So the
  pool reflects reality before you budget (this relaxes the original "closure is
  pure directive arithmetic" invariant — it is now reality-inclusive).

## 7. Writing directives — CRUD

Mutations reuse the `custom`-directive file pattern from
`accounts.py::set_default_payment_account` (find → `save_entry_slice`; create →
append; clear → empty slice), then `ledger.load_file()` so `ledger.budgets`
re-parses. See [`../backend/modules.md`](../backend/modules.md).

- **`PUT /api/budget`** `{month, account, amount}` — set / edit / clear one
  envelope. `amount` null/empty/`"0"` clears. **NaN and negative are rejected
  (400).** Amount quantized to 2 decimals.
  - **Duplicate handling**: if the file has multiple directives for
    `(account, month)` (a copy or hand-edit artifact), the write operates on
    **all** of them — rewrites the lowest-lineno one and deletes the rest,
    converging back to a single directive. Edits go bottom-up (highest lineno
    first) so `save_entry_slice`'s line lookup isn't shifted by an earlier
    deletion. (Regression: Fava reads the *last* duplicate, so editing only the
    first used to silently no-op.)
- **`POST /api/budget/copy`** `{from_month, to_month}` — copies every source
  directive into the target, **overwriting**: the target month's existing
  directives are deleted first (bottom-up), so the target ends as an exact mirror
  of the source. Non-budgetable-type directives (e.g. legacy credit-card) are
  dropped, not carried forward.

## 8. View interaction

- `BudgetView` owns `month` state (view-scoped `useState`, not the global store).
  TanStack Query key `['budget', month, viewMode]`; mutations invalidate it.
- The view is **not** coupled to the global FilterBar — it has its own month
  stepper (`App.tsx` excludes `budget` from `FilterBar`).
- Inline editing (`BudgetEnvelopeRow`): click the allocated cell → number input;
  Enter/blur commits, Escape cancels. `startEdit` is guarded so a click inside
  the open input doesn't reset the draft.
- **Cmd+K** (AGENTS.md hard rule — every action present): "Go to Budget",
  "Budget: Add Envelope", "Budget: Next/Previous Month", "Budget: Copy From Last
  Month". These use a store signal (`budgetNavRequestId` / `budgetNavConsumedId`
  in `appStore`); the consumed-id lives in the store so a fresh signal fires
  exactly once even when the command opens the tab on a fresh mount, and a stale
  signal never replays on tab switch.

## 9. Code map

| File | Role |
|---|---|
| `backend/budgets.py` | Pure aggregation: `list_budget_directives`, `budgeted_accounts`, `sum_account_postings` (flag split, descendant roll-up, optional cash-leg filter), `sum_cash_delta`, `accounts_with_activity`, `overlaps_budgeted`, `dedupe_ghost_subtrees`, `section_for_account`/`budgetable_section`, `detect_overlap_warnings`. No `FavaLedger` access. |
| `backend/account_types.py` | `BUDGETABLE_ALLOCATION_TYPES`, `is_budgetable_allocation` (descendant-aware). |
| `backend/routers/budget.py` | `GET`/`PUT`/`POST copy`. Builds the response: sections, effective-allocation pool, the cash bridge, ghost union, `ghost_count`, warnings. |
| `frontend/src/components/BudgetView.tsx` | Page: month stepper, summary, sections; owns month state + Cmd+K signal consumption. |
| `frontend/src/components/budget/BudgetSummary.tsx` | The indirect-method bridge table. |
| `frontend/src/components/budget/*` | `BudgetSection`, `BudgetEnvelopeRow` (inline edit + ghost rendering), `EnvelopeBar`, `AddEnvelopeRow`. |

## 10. Invariants

1. The 3-statement engine is byte-identical if the budget feature is deleted.
2. `custom "budget"` is verbatim Fava syntax — no `ledgr-budget` namespace.
3. One directive per `(account, month)`; the write path dedupes to one.
4. `allocated` is always Fava's `calculate()`.
5. `free`/columns honor the `P` toggle (`view_mode`).
6. The closure is reality-inclusive: budgeted accounts contribute their
   directive, ghosts contribute their consumed (effective allocation).
7. Consumed is accrual and instrument-independent — **except** allocation
   envelopes, which count only cash-leg transfers in (§4).
8. Each month is independent — no rollover.
9. Income-based pool — no cash-on-hand / credit-card-float logic.
10. **`net_cash_flow.realized` (combined) equals the Cash Flow Statement's net**
    for the same month — the load-bearing tie, asserted by a test.
11. Every budget action is in Cmd+K. See
    [`../frontend/command-palette.md`](../frontend/command-palette.md).

## 11. Tests

`backend/tests/test_budgets.py` + `tests/fixtures/budget.beancount` cover: the
three buckets and flag split, descendant roll-up, `S`-entry exclusion, income
sign, view-mode folding, allocation cash-leg (interest excluded / contribution
counted / debt paydown counted), ghost discovery + closure + overlap dedupe,
descendant-aware loan allocation, duplicate-directive dedupe on edit/clear,
copy-overwrite (incl. duplicate cleanup and excluded-type skipping), the cash
bridge components, and the **tie-to-cashflow** guarantee. Acceptance: `pytest`
green; deleting the feature leaves the 3-statement files byte-identical.

## 12. Deferred (vNext)

Multi-month forecast · cash-on-hand pool (YNAB model, reintroduces credit-card
float) · rollover envelopes · non-monthly periods (weekly/quarterly/yearly —
Fava parses them; Ledgr assumes monthly).
