# AGENTS.md — Ledgr

Schema for AI agents working in this repo. Keep this file short. Detailed guidance lives in [`docs/`](docs/) — a wiki. **Read [`docs/index.md`](docs/index.md) first**, then the page for the area you're touching.

---

## What Ledgr is

A personal finance app backed by **double-entry accounting** via [Beancount](https://beancount.github.io/docs/), exposed through a React interface. Product vision: a **3-statement model for individuals** — Income Statement, Balance Sheet, Cash Flow Statement — cascading from a single `.beancount` file.

Stack: FastAPI (Python 3.12+) · React 19 + TypeScript + Vite · Beancount + Fava · pytest · vitest.

---

## The one rule you must not break

> **Beancount and Fava do the accounting. Ledgr presents it.**

Before writing any accounting logic, ask: *does Beancount or Fava already do this?* If yes, delegate. The only custom accounting in the codebase is the Cash Flow Statement — see [`docs/principles/beancount-first.md`](docs/principles/beancount-first.md) for what this means in practice and what the exception looks like.

---

## How to navigate

1. [`docs/index.md`](docs/index.md) — catalog of every page with a one-line purpose. **YOU SHOULD START HERE.**
2. Page for the area you're working on (linked from the index).
3. [`docs/pr-checklist.md`](docs/pr-checklist.md) before merging.
4. [`docs/pitfalls.md`](docs/pitfalls.md) — known failure modes, do not repeat.
---

## Wiki conventions

Every page under `docs/` (except `plans/`) has YAML frontmatter:

```yaml
---
type: principle | module | feature | pattern | reference | index | log
last_updated: YYYY-MM-DD
---
```

**When you learn something new** (a decision, a pattern, a pitfall):

1. Find the right existing page. Don't create a new page casually.
2. Update the section and bump `last_updated`.
3. If no page fits, create one and register it in [`docs/index.md`](docs/index.md).
4. Add a line to [`docs/log.md`](docs/log.md) with the date and summary.

**What does NOT belong in this file**: module details, feature specifics, conventions, anything over ~5 lines of explanation. If AGENTS.md grows past ~120 lines, extract into the wiki.

**Run the linter** before committing changes to `docs/` or `AGENTS.md`:

```bash
python scripts/wiki-lint.py
```

---

## Hard rules

Non-negotiable. Detail in the wiki.

- No `float` for money — always `Decimal`. → [`docs/conventions.md`](docs/conventions.md)
- No direct `fetch()` from components — use `src/api/client.ts`. → [`docs/frontend/guidelines.md`](docs/frontend/guidelines.md)
- Every user-facing action must be in Cmd+K. → [`docs/frontend/command-palette.md`](docs/frontend/command-palette.md)
- No writes to `.beancount` outside `FavaLedger.file`. → [`docs/backend/modules.md`](docs/backend/modules.md)
- `Decimal` crosses the JSON boundary as `string`. → [`docs/backend/modules.md`](docs/backend/modules.md)
- Every endpoint that reads entries accepts `view_mode`. → [`docs/features/planned-toggle.md`](docs/features/planned-toggle.md)
