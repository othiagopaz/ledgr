---
type: log
last_updated: 2026-04-21
---

# Wiki Log

Append-only record of wiki changes, ingests, and lint passes. Most recent first.

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
