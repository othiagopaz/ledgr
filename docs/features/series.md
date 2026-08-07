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
- **Cancel** = delete all future `!` transactions in the series
- **Extend** (recurring only) = append new `!` transactions after the last date, stepping by the series' own `ledgr-series-freq` (not always monthly)
- Individual transactions can be edited via normal CRUD endpoints
- The series router handles bulk creation/deletion only
- `backend/series.py` is pure functions — no I/O, no ledger access
- `backend/routers/series.py` handles I/O via `FavaLedger.file` — see [`../backend/modules.md`](../backend/modules.md)

## Invariants

- `sum(installment amounts) == total purchase price`
- Monthly/yearly dates use day-clamping for month-end edge cases (weekly is exact 7-day steps)
- Installments cannot be extended; recurring can be extended
- Extend preserves the series' frequency; a weekly series extends by weeks, a yearly series by years

## Testing

See [`../backend/testing.md`](../backend/testing.md) for what `test_series.py` and `test_series_router.py` must cover — sum invariants, day-clamping, the installment-cannot-extend rule, and metadata preservation through edits.
