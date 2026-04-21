---
type: reference
last_updated: 2026-04-21
---

# Code conventions

## Python

- Type hints required on all public functions
- Docstrings required on functions with non-trivial logic
- `Decimal` for all monetary values — **never `float`**
- No `print()` in production code — use `logging`

```python
# Correct
def classify_posting(asset_account: str, counterparts: list[str]) -> str:
    """Classify a posting into operating/investing/financing/transfer."""
    ...

# Wrong
def classify(acct, cps):
    ...
```

## TypeScript / React

See [`frontend/guidelines.md`](frontend/guidelines.md) for the full set. Highlights:

- Strict mode on (`"strict": true`, `noUnusedLocals`, `noUnusedParameters`)
- No `any` without a justifying comment
- All API response types in `src/types/index.ts`

## Naming

| Context          | Convention         |
|------------------|--------------------|
| Python files     | `snake_case.py`    |
| Python classes   | `PascalCase`       |
| Python functions | `snake_case`       |
| API endpoints    | `/api/kebab-case`  |
| Component files  | `PascalCase.tsx`   |
| Hook files       | `usePascalCase.ts` |
| CSS variables    | `--kebab-case`     |

## Out of scope — do not implement without discussion

- Multi-ledger (multiple `.beancount` files)
- Authentication / multi-user
- Bank sync via Open Banking
- Automatic statement import (use `beancount-import` for that)
- Any feature Fava already does better (reconciliation UI, source editor, etc.)
