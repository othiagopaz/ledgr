---
type: feature
last_updated: 2026-04-21
---

# Series — recurring and installments

Series transactions are normal Beancount transactions linked by `ledgr-series` metadata. There is no plugin, no special flag — just metadata on standard `!`/`*` transactions.

## Metadata keys

| Key                   | Purpose                                     | Type       |
|-----------------------|---------------------------------------------|------------|
| `ledgr-series`        | Unique series ID (required)                 | string     |
| `ledgr-series-type`   | `"recurring"` or `"installment"` (required) | string     |
| `ledgr-series-seq`    | 1-indexed sequence (installment only)       | `Decimal`  |
| `ledgr-series-total`  | Total count (installment only)              | `Decimal`  |

Metadata integer values (`seq`, `total`) are stored as `Decimal` because Beancount requires it.

## Rules

- All series transactions start as `!` (planned)
- Users flip individual transactions to `*` via normal editing
- **Cancel** = delete all future `!` transactions in the series
- **Extend** (recurring only) = append new `!` transactions after the last date
- Individual transactions can be edited via normal CRUD endpoints
- The series router handles bulk creation/deletion only
- `backend/series.py` is pure functions — no I/O, no ledger access
- `backend/routers/series.py` handles I/O via `FavaLedger.file` — see [`../backend/modules.md`](../backend/modules.md)

## Invariants

- `sum(installment amounts) == total purchase price`
- All dates use day-clamping for month-end edge cases
- Installments cannot be extended; recurring can be extended

## Testing

See [`../backend/testing.md`](../backend/testing.md) for what `test_series.py` and `test_series_router.py` must cover — sum invariants, day-clamping, the installment-cannot-extend rule, and metadata preservation through edits.
