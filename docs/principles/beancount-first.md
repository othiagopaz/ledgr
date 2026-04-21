---
type: principle
last_updated: 2026-04-21
---

# Beancount/Fava do the work — Ledgr presents

**The most important rule in this project.**

Beancount is an accounting library tested for over 10 years. Fava is a reference interface with 5+ years of real-world use. Any accounting logic that already exists in them **must not be reimplemented** in Ledgr.

## The golden rule

Before writing any accounting logic, ask:

> *Does Beancount or Fava already do this?*

If yes: use the library. If unsure: check the docs before implementing.

## What the Ledgr backend must NEVER do

- Manually iterate `entries` to calculate account balances → use `realization`
- Filter transactions by date with Python loops → use `summarize.clamp_opt()` or `FilteredLedger`
- Build a hierarchical account tree → use `realization.realize()` directly
- Calculate Net Income manually → use `summarize.cap_opt()` which closes books automatically
- Write/edit the `.beancount` file with string manipulation → use `FavaLedger.file`
- Calculate retained earnings manually → it is a consequence of `cap_opt()` working correctly

## What the Ledgr backend CAN and SHOULD do

- Instantiate and manage `FavaLedger` as a singleton — see [`../backend/modules.md`](../backend/modules.md)
- Serialize Fava/Beancount types (`Tree`, `Inventory`, `Decimal`) to JSON
- Implement the **Cash Flow Statement** — the one report Fava does not have, see [`../backend/cashflow.md`](../backend/cashflow.md)
- Expose thin HTTP endpoints that delegate to `FavaLedger`
- Filter entries by transaction flag via `get_filtered_entries()` — see [`../features/planned-toggle.md`](../features/planned-toggle.md)

## The single exception: Cash Flow

Fava does not implement the Cash Flow Statement natively. It is the only custom accounting logic in Ledgr, and it lives exclusively in `backend/cashflow.py`. See [`../backend/cashflow.md`](../backend/cashflow.md) for the classification rules and why order matters.

## Reference documentation

- Beancount ops API: https://beancount.github.io/docs/api_reference/beancount.ops.html
- Fava core API: https://beancount.github.io/fava/api/fava.core.html
- BQL reference: https://beancount.github.io/docs/beancount_query_language.html
