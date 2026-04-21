---
type: index
last_updated: 2026-04-21
---

> Migration from the monolithic `AGENTS.md` completed 2026-04-21 — every page referenced from `AGENTS.md` or other pages now exists. See [`log.md`](log.md).

# Ledgr Wiki — Index

Every page in `docs/` registered here with a one-line purpose. When adding a page, register it under the correct area. The linter verifies coverage.

**Read order** for any task: [`AGENTS.md`](../AGENTS.md) → this index → the page(s) for your area.

---

## Principles

Load-bearing ideas. Changing these changes the project.

| Page | Purpose |
|---|---|
| [`principles/beancount-first.md`](principles/beancount-first.md) | Why we delegate to Beancount/Fava and the one exception (Cash Flow) |

## Reference

Cross-cutting facts. Read when onboarding or before a PR.

| Page | Purpose |
|---|---|
| [`architecture.md`](architecture.md) | Stack, dependencies, directory layout |
| [`conventions.md`](conventions.md) | Naming, typing, what's out of scope |
| [`pr-checklist.md`](pr-checklist.md) | Final check before merging |
| [`pitfalls.md`](pitfalls.md) | Known failure modes — do not repeat |

## Backend

Python / FastAPI / Beancount-Fava integration.

| Page | Purpose |
|---|---|
| [`backend/modules.md`](backend/modules.md) | `ledger.py`, `serializers.py`, file-mutation rules |
| [`backend/cashflow.md`](backend/cashflow.md) | Cash Flow classification — the only custom accounting |
| [`backend/reports.md`](backend/reports.md) | Correct Fava usage: Income Statement, Balance Sheet, charts, BQL |
| [`backend/testing.md`](backend/testing.md) | pytest structure, fixtures, required coverage |

## Frontend

React 19 / TypeScript / Vite.

| Page | Purpose |
|---|---|
| [`frontend/guidelines.md`](frontend/guidelines.md) | Styling, components, state, data fetching, API layer |
| [`frontend/command-palette.md`](frontend/command-palette.md) | Cmd+K rule: every user-facing action must be registered |

## Features

Cross-cutting features that touch backend + frontend.

| Page | Purpose |
|---|---|
| [`features/planned-toggle.md`](features/planned-toggle.md) | `view_mode` contract, actual vs combined rendering |
| [`features/series.md`](features/series.md) | Recurring and installment transactions |

## Brand

Strategic and visual decisions. Load-bearing for anything user-facing.

| Page | Purpose |
|---|---|
| [`brand/foundation.md`](brand/foundation.md) | Who Ledgr is for, what it stands for, what it's not |
| [`brand/principles.md`](brand/principles.md) | Design principles derived from the foundation |
| [`brand/visual-system-1.md`](brand/visual-system-1.md) | Typography and color |
| [`brand/visual-system-2.md`](brand/visual-system-2.md) | Grid, iconography, logo |
| [`brand/applications.md`](brand/applications.md) | Applying the system to product surfaces |

## Plans

Design docs for in-flight or upcoming work. Not evergreen — once implemented, they get archived or deleted, and learnings move into the relevant wiki page. Plans are exempt from frontmatter requirements.

| Page | Purpose |
|---|---|
| [`plans/PLAN-global-filters.md`](plans/PLAN-global-filters.md) | Global filters across reports |

## Log

[`log.md`](log.md) — append-only record of wiki changes, ingests, and lint passes.
