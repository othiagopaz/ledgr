---
type: reference
last_updated: 2026-04-21
---

# PR checklist

Run through this before merging. For detailed rationale on any item, follow the link.

## Backend

- [ ] `pytest` passes with no warnings
- [ ] No public function without type hints
- [ ] No new accounting logic without checking if Beancount/Fava already does it — see [`principles/beancount-first.md`](principles/beancount-first.md)
- [ ] New endpoints have a corresponding router test — see [`backend/testing.md`](backend/testing.md)
- [ ] Changes to the cashflow classifier have a test for the new case — see [`backend/cashflow.md`](backend/cashflow.md)
- [ ] Balance Sheet invariant test passes: `assets == liabilities + equity`
- [ ] `mypy` reports no errors in `backend/`
- [ ] `view_mode` param tested for all affected endpoints — see [`features/planned-toggle.md`](features/planned-toggle.md)

## Frontend

- [ ] `eslint` passes with no errors
- [ ] No `any` without a justifying comment
- [ ] New API responses have types in `src/types/index.ts`
- [ ] `viewMode` included in all new `queryKey` arrays
- [ ] `queryFn` wrapped in lambda: `() => fetchFn(args)` — see [`pitfalls.md`](pitfalls.md)
- [ ] Loading and empty states handled for data-fetching components
- [ ] New colors use CSS variables (works in light + dark mode)
- [ ] New keyboard shortcuts registered in `useKeyboardNav.ts` and don't conflict
- [ ] No direct `fetch()` calls — use `src/api/client.ts`
- [ ] Every new user-facing action is registered in the Cmd+K command palette — see [`frontend/command-palette.md`](frontend/command-palette.md)

## Docs

- [ ] `python scripts/wiki-lint.py` passes
- [ ] New decisions / patterns / pitfalls recorded in the relevant `docs/` page
- [ ] `docs/log.md` updated if you touched the wiki structure
