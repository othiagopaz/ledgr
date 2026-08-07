---
type: feature
last_updated: 2026-08-06
---

# Series — recurring and installments

Series transactions are normal Beancount transactions linked by `ledgr-series` metadata. There is no plugin, no special flag — just metadata on standard `!`/`*` transactions.

## Metadata keys

| Key                   | Purpose                                                | Type       |
|-----------------------|--------------------------------------------------------|------------|
| `ledgr-series`        | Unique series ID (required)                            | string     |
| `ledgr-series-type`   | `"recurring"` or `"installment"` (required)           | string     |
| `ledgr-series-freq`   | `"weekly"` / `"yearly"` (recurring; monthly omits it) | string     |
| `ledgr-series-seq`    | 1-indexed sequence (installment only)                 | `Decimal`  |
| `ledgr-series-total`  | Total count (installment only)                        | `Decimal`  |

Metadata integer values (`seq`, `total`) are stored as `Decimal` because Beancount requires it.

### Frequency

Recurring series step **weekly**, **monthly**, or **yearly**. `monthly` is the implicit default and is **not** written to metadata — a missing `ledgr-series-freq` key reads back as monthly, so every series created before this feature (and every installment) is monthly by definition. Only `weekly`/`yearly` stamp the key.

Installments are always monthly and never carry the key; the API rejects a non-monthly `frequency` on an installment series. Date stepping lives in `compute_dates()` / `periods_between()` in `backend/series.py`:

- **weekly** — exact 7-day steps.
- **monthly** — preserves day-of-month, clamping to month-end (Jan 31 → Feb 28).
- **yearly** — preserves month/day, clamping Feb 29 → Feb 28 in non-leap years.

## Rules

- All series transactions start as `!` (planned)
- Users flip individual transactions to `*` via normal editing
- **Cancel** (`DELETE /api/series/{id}`) = delete all future `!` transactions in the series
- **Extend** (recurring only, `POST …/extend`) = append new `!` transactions after the last date, stepping by the series' own `ledgr-series-freq` (not always monthly)
- **Revise** (`POST …/revise`, both types) = edit the **pending run in place** — change amounts/accounts, and for installments the total `count`/`amount_is_total`, for recurring the `frequency`/`end_date`. Confirmed (`*`) transactions are never rewritten (only their `ledgr-series-total` counter bumps when an installment total changes). Only the pending (`!`) tail is regenerated, starting one cadence step after the last confirmed date. Reuses `generate_series_transactions` / `compute_dates` / `periods_between` — no bespoke date/rounding math.
- Individual transactions can be edited via normal CRUD endpoints (`PUT /api/transactions` preserves all `ledgr-*` metadata, so the series link survives)
- The series router handles bulk creation/deletion/revision only
- `backend/series.py` is pure functions — no I/O, no ledger access
- `backend/routers/series.py` handles I/O via `FavaLedger.file` — see [`../backend/modules.md`](../backend/modules.md)

### Extend vs revise

`extend` only **appends** to a recurring series. `revise` **rewrites the pending run** (amount / accounts / cadence / horizon or installment count) for either type — the superset used by the "edit the whole series" flow. Recurring can do both; installments can only revise (no extend). A series' reported `frequency` in the summary comes from a **pending** txn when one exists, so a revise that changes cadence is reflected even though the confirmed past keeps its original dates.

## Invariants

- `sum(installment amounts) == total purchase price` (holds through revise: the regenerated pending run re-divides `amount_is_total`, remainder on the last installment)
- Monthly/yearly dates use day-clamping for month-end edge cases (weekly is exact 7-day steps)
- Installments cannot be extended; recurring can be extended; **both can be revised**
- Revise never lowers an installment `count` below the number already confirmed (rejected `400`)
- Extend and revise preserve the series' frequency; a weekly series steps by weeks, a yearly series by years
- Revise regenerates only `!` transactions; `*` transactions are byte-identical afterward except (installments) the `ledgr-series-total` counter
- Installment revise is **seq-driven**: the pending run fills exactly the seq slots in `1..total` not held by a confirmed installment, and each installment #N is dated `series_start + (N−1) months`. So a series confirmed out of order (e.g. #5 paid before #3/#4) revises without ever duplicating or skipping a `ledgr-series-seq`

## Testing

See [`../backend/testing.md`](../backend/testing.md) for what `test_series.py` and `test_series_router.py` must cover — sum invariants, day-clamping, the installment-cannot-extend rule, and metadata preservation through edits.
