---
type: log
last_updated: 2026-07-15
---

# Wiki Log

Append-only record of wiki changes, ingests, and lint passes. Most recent first.

---

## 2026-07-15 — MCP server

- Added [`features/mcp-server.md`](features/mcp-server.md): `backend/mcp_server.py` exposes Ledgr to an LLM as MCP tools (record, reports, query, budget), as a thin HTTP client over the backend with a reuse-or-spawn lifecycle.
- Added `GET /health` to `backend/main.py` for the MCP liveness probe.
- Recorded a backend pitfall: `POST /api/transactions` writes unbalanced transactions without validation (MCP has a defensive guard meanwhile).

## 2026-06-15 — Budgets feature (full history consolidated)

- [`features/budgets.md`](features/budgets.md) is the single source of truth for
  the Budget feature; registered in [`index.md`](index.md). The throwaway
  `plans/PLAN-budgets*.md` design docs were folded into it and deleted (the
  index Plans section already documents that plans get deleted once their
  learnings move to the wiki).
- Scope captured there: zero-based envelopes over Fava `custom "budget"`
  directives; the `P` planned/actual folding; ghost rows for unbudgeted activity
  with effective-allocation closure and overlap dedupe; allocation envelopes
  restricted to `investment`/`loan` (descendant-aware) and counting cash-leg
  transfers only (interest excluded, mirroring the cashflow classifier); the
  indirect-method cash bridge summary whose Net Cash Flow (Realized) ties to the
  Cash Flow Statement; duplicate-directive dedupe on edit; and copy-overwrite.
- Backend: `budgets.py` + `routers/budget.py`; `account_types.py` gained
  `BUDGETABLE_ALLOCATION_TYPES`/`is_budgetable_allocation`. 3-statement frozen
  zone untouched.

---

## 2026-04-21 — License changed to AGPL-3.0; README rewritten to brand template

- `LICENSE` swapped from Apache 2.0 to the canonical GNU AGPL-3.0 text (fetched from `gnu.org/licenses/agpl-3.0.txt`).
- `README.md` rebuilt from the reference template in [`brand/applications.md`](brand/applications.md) §1.3: centered symbol, wordmark, hero tagline, three midnight-tinted badges, sections in the prescribed order. `Install` and `Quick start` slots filled in from `scripts/setup.sh` / `scripts/dev.sh` and a minimal `.beancount` example.
- [`brand/applications.md`](brand/applications.md) reference template synced — the "Open source" bullet and the "License" line now reflect AGPL-3.0 rather than MIT so the template does not drift from the repo.

---

## 2026-04-21 — Migration complete

All pages referenced from `AGENTS.md` or the index have been created. The pre-bootstrap `AGENTS.md` content is now distributed across:

- [`principles/beancount-first.md`](principles/beancount-first.md) — the golden rule (old §4)
- [`architecture.md`](architecture.md) — what Ledgr is, stack, repo layout (old §1–§3)
- [`conventions.md`](conventions.md) — Python & naming, out of scope (old §11–§12)
- [`pr-checklist.md`](pr-checklist.md) — merged backend + frontend checklists (old §14 + frontend §15)
- [`pitfalls.md`](pitfalls.md) — merged failure modes (old §13 + frontend §14)
- [`backend/modules.md`](backend/modules.md) — `ledger.py`, `serializers.py`, file mutations (old §5, §6, §9)
- [`backend/cashflow.md`](backend/cashflow.md) — classification rules (old §7)
- [`backend/reports.md`](backend/reports.md) — correct Fava usage for each report (old §8)
- [`backend/testing.md`](backend/testing.md) — pytest structure, fixtures, required coverage (old §10)
- [`frontend/guidelines.md`](frontend/guidelines.md) — moved from `frontend/docs/front-end-guidelines.md`, which has been deleted
- [`frontend/command-palette.md`](frontend/command-palette.md) — Cmd+K rule (old frontend §16)
- [`features/planned-toggle.md`](features/planned-toggle.md) — view_mode contract (old §15)
- [`features/series.md`](features/series.md) — recurring & installments (old §14 duplicate)

---

## 2026-04-21 — Wiki bootstrap

- Restructured from monolithic `AGENTS.md` (549 lines) into a Karpathy-style wiki.
- Added [`index.md`](index.md) (catalog) and this file (log).
- Added [`scripts/wiki-lint.py`](../scripts/wiki-lint.py) to enforce conventions.
- Added YAML frontmatter to `brand/*.md`.
