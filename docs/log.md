---
type: log
last_updated: 2026-08-07
---

# Wiki Log

Append-only record of wiki changes, ingests, and lint passes. Most recent first.

---

## 2026-08-07 — Composer: `:` total feeds the grid + sticky date + preview polish

- **`1200:12` now populates the posting grid + balance** like `100*12` did. The `:` (total) form used to route the number into a side `scheduleTotal` state the grid never read, so the preview/balance were blank; now both compact forms (`*` and `:`) set the **amount pill**, and the schedule's `amountIsTotal` flag alone decides meaning (per-installment vs total-to-divide). The `÷` preview and `auto-balances to −<total>` line render for both.
- **Installment math shows before accounts are picked.** The L0 `postings` memo now emits a single account-less row when there's an amount but no route yet, and `PostingPreview`'s empty state renders the breakdown (`120.00 × 10 (total 1200) — pick an expense & payment account with >`) instead of a bare prompt. Extracted `installmentEach(amt, schedule)` so the empty and full previews share the math. The account-less row is filtered out by `computeBalance` / `postingInputs` / `validatePostings`, so it never leaks into save (still requires 2 real postings).
- **Date is visible and sticky.** A new draft opens with a **calendar-icon `today`** date pill (uses the shared `CalendarIcon` from `components/icons`, not an emoji; mandatory → not removable; click it to edit in Details). The pill is owned by a single `date → pill` sync effect, so typing a date, editing Details, and the seed all agree and show a friendly label (`today` / `yesterday` / `DD/MM`). After **save & continue**, the date is **reused** (no longer reset to today) so a run of same-day entries keeps it; everything else clears.
- Verified live on :5283: `Amazon 1200:10` (no accounts) → grid `120.00 × 10 (total 1200)` + wing `1.200,00 ÷ 10 = 120,00 each`; add route → full `From → To` + `✓ balanced … −1200`. Date `01/08` → Create series → next draft keeps the `01/08` pill, all other pills cleared. 86 vitest + tsc + eslint green.

## 2026-08-07 — Composer: bare integers as amounts + integer-only counts

- **Plain integers are now amounts.** With the date ambiguity resolved (dates own `/ . -`, detected first; installment counts live inside the `*`/`:` token, parsed first), a bare `230` / `750` / `2026` on space becomes the amount — no separator required, no `$`. `tryParseAmount` dropped the "reject integers with no separator" rule; it now rejects only a bare zero (`0`, `0,00`). Decimal-shape validation (single decimal sep, 1–2 decimal digits) unchanged.
- **Installment counts stay integer-only** — no behavior change needed: the `*`/`:` grammar already captures the count as `(\d+)` (so `212,90*12,3` doesn't parse and falls back to narration), and the Repeat wing's Count field is `type="number" min=1` with `parseInt`.
- Tests: `fastInputParser.test.ts` updated (integers `230`/`750`/`2026`/`5` accepted; bare zero rejected; a bare integer in `parseInput` becomes the amount). 86 vitest + tsc + eslint (touched files) green. Verified live on :5283: `Groceries 230` → "Groceries" + `$ 230` pill.

## 2026-08-07 — Series + multiposting: total-form split, recurring-MP fix

- **`amount_is_total` now works with a multiposting** (was a hard 400). When >1 positive leg is present the backend divides EVERY explicit leg by count — each installment is the whole txn at 1/count — and an auto-balance leg absorbs per-installment rounding (required; a clean 400 asks for one if missing). The final installment carries a per-leg remainder so each leg sums to its typed total exactly. New `_divide_total_multiposting()` + an optional `last_postings_spec` on `generate_series_transactions()` / `_build_installments_by_seq()` (explicit final-txn postings, wins over the scale path). Applied to **both** create and revise.
- **Composer Split materializes the division.** Clicking Split on a total-form installment (`1000:10`) divides the amount into the route legs (Bank 100 / Expenses 100), flips the chip to `each`, and sends `amount_is_total:false` — the grid now holds real per-installment postings to edit from. The "Amount is the total" checkbox is hidden in split mode (it's a single-amount convenience); the Repeat panel shows "Each installment repeats the postings below · N×" instead.
- **Preview shows `per × n (total …)` for BOTH `*` and `:`.** The L0 installment preview used to print the total in parens only for the divide form; now `installmentEach()` renders the same `<per> × <n> (total <total>)` shape whichever operator was used, and routes every number through `formatAmount` so separators are locale-consistent (no mixed `112.09` / `1120,90`).
- **Removed the redundant "Occurrence" right wing.** Editing a single installment showed both an inline banner ("Editing one installment · Edit entire series →") and a right wing repeating the same text + button. Dropped the wing; the banner stays. Occurrence editing now shows only the Details wing + center.
- **Recurring + multiposting no longer 500s.** The composer sent the recurring `end_date` as a day-first display string (`31/12/2026`); the backend's `date.fromisoformat` threw an unhandled `ValueError` → 500. Frontend now normalizes `end_date` via `parseSmartDate` (like `start_date`); backend wraps every body date in `_parse_iso_date()` → clean 400 on bad input. Same fix covers a malformed `start_date`.
- Tests: +5 backend (multiposting total create/revise incl. remainder + auto-balance guard; non-ISO date → 400) → **408 passing**. Frontend tsc + eslint (touched files) + 86 vitest green. Verified end-to-end on the :8430 copy: `1000:10` + route → Split shows Bank 100 / chip `each` → saves 200; recurring MP with `31/12/2026` Until → `end_date:2026-12-31`, 200.

## 2026-08-07 — Composer: schedule-on-space + `:` division operator

- **Schedule detection moved to space** (`processInlineTokens`), off the every-keystroke path. Fixes `212,90*10` committing at `*1` (the eager parse fired the moment the count was a valid `1`, before the `0` was typed). Now the token must be whitespace-complete before it parses — same rule as `$`, dates, and tags.
- **`:` is the division operator** for installments: `1000:10` → 10 × 100 each (`amountIsTotal:true`). `*` stays per-installment (`212,90*10` → 10 × 212,90). **`/` is no longer a schedule at all** — it belongs to dates (`15/03`, `1000/10` are day/month), so the old money-guard hack on `/` is gone and date/division can never collide. `*`=each · `:`=split-total · `/`=date.
- When a schedule is detected on space, the **Repeat wing opens automatically** (`setRepeatOpen(true)`), as if the button were pressed — so the count/total/frequency is immediately editable.
- Tests: `scheduleParser.test.ts` updated (`:` total-form incl. grouping punctuation, `/`→null date, `*` unchanged). 85 vitest + 403 pytest + tsc + eslint + build green. Verified live on :5283: `Fast Shop 212,90*10` → "Fast Shop" + `$212,90` + `# 10× · each` chip + Repeat wing open (Count 10); `1000:10` → `# 10× · total` chip + Repeat wing with "Amount is the total" ticked.

## 2026-08-06 — Composer: bare-amount + `*` installments

- **Bare number → amount** on space (like dates), locale-aware: `212,90` / `1.234,56` (pt/BRL) or `212.90` / `1,234.56` (en) become the amount with no `$`. Plain integers (`12`, `2026`) stay narration (ambiguous). `$` prefix still works. New pure `tryParseAmount(token, commaDecimal)` in `fastInputParser.ts` + `commaDecimal` opt on `parseInput` (Composer passes it from locale/currency).
- **`*` installment syntax**: `212,90*10` → 10 installments of **212,90 each** (`amountIsTotal:false`, sets the amount too). Complemented by `<total>:<count>` (`1000:10` = total ÷ 10; see the 2026-08-07 entry — this superseded an earlier `/` total-form). The old `x`/`×` forms were **removed** (now narration).
- `parseSchedule` reworked to match compact installment forms on the **last token** (so `Fast Shop 212,90*10` works after narration) and to find a recurring frequency word anywhere.
- Tests: +11 (bare-amount detection & locale, `*` form, `x` removed, date/`/` collision, narration-prefix). 84 vitest + 403 pytest + build green. Verified live: `Fast Shop 212,90*10` → "Fast Shop" + `$212,90` + `# 10× each`.

## 2026-08-06 — Composer: the `>` route picker

- Replaced the `>` account trigger's two-step "expense → pay-from" dance with a single fluid **`from → to` route picker**: type `>`, pick `from`, focus flows to `to`, `⇄` flips direction (amount sign follows the route), narration never cleared. Resolves into the `accounts` pill.
- Dropdown is now **fuzzy + personally-ranked**: subsequence match (`resid`→`Expenses:House:ResidentialTaxes`), ordered by how often you post to each account (client-side count from all loaded txns), recents this session, and the payee's usual account (`◆`); leaf bold, parent dimmed, kind swatch. New pure util `utils/accountRank.ts` + 11 vitest cases. No backend change.
- Keyboard: ↑↓ / Enter / Tab / `>` (flip) / Esc, with the active row auto-scrolled into view.
- Verified live on a real-ledger copy (Coffee > CreditCard → Bank, balanced). 73 vitest + 403 pytest + build green.

## 2026-08-06 — The Composer: one unified posting surface

- New `Composer.tsx` replaces four components (`FastInput`, `AdvancedInput`, `TransactionModal`, `SeriesModal` — all **deleted**), consolidating simple / multiposting / recurring / installment into one input that grows as needed. Smart line (pill parser) → split grid → add-on wings for Details (left) + schedule/series (right); the modal never scrolls, and the fixed center never shifts when a wing opens.
- Store: `openComposer({txn}|{series}|{initial})` + `composerScope`/`escalateToSeries`/`closeComposer`; `openTxnModal`/`openSeriesModal` kept as shims → Composer so all call-sites (register, Cmd+N, palette, SeriesView) keep working. New `Schedule` type (reuses `SeriesFrequency`) + `schedule?` on `TransactionDraft`.
- Save routing by scope+schedule: occurrence → `editTransaction`; whole series → `reviseSeries`; new + schedule → `createSeries`; else → `addTransaction`. Series data resolved **live** from the query so revise/extend/cancel reflect without reopening.
- New `scheduleParser.ts` (+20 vitest cases): `↻ monthly` / `#12x` / `total/count` / `until <date|month>`; the `#tag` vs `#12x` overload resolved by grammar.
- Palette: "New Transaction"/"New Series" → **"New"** + fast paths "New — Split" / "New — Repeat". Composer CSS (`.cx-*`) added to `global.css`.
- Verified on a copy of the real ledger (isolated instance): create, split, schedule-attach, series edit (grid populated from real postings), and a live `revise` (Icea 13→14 installments — confirmed preserved, pending regenerated, totals recomputed). tsc + eslint + 62 vitest + build all green.

## 2026-08-06 — Series revise: edit installments & recurring in place

- New `POST /api/series/{id}/revise` (both types) — edits the **pending run in place**: amounts/accounts for either type, `count`/`amount_is_total` for installments, `frequency`/`end_date` for recurring. First step of the Composer consolidation (see plan); closes the "can't edit installments/recurring" gap.
- Confirmed (`*`) txns are never rewritten — only an installment's `ledgr-series-total` counter bumps. The pending (`!`) tail is deleted and regenerated one cadence step after the last confirmed date, reusing `generate_series_transactions` / `compute_dates` / `periods_between` (no bespoke math). Rejects lowering `count` below confirmed (`400`).
- `_summarize_series` now reads `frequency` from a **pending** txn when present, so a cadence-changing revise is reflected while confirmed history keeps its original dates.
- Fixed: regenerated postings inherit the series currency when the new postings omit it (was emitting bare amounts).
- Frontend scaffolding: `SeriesReviseIn` / `SeriesReviseResponse` types + `reviseSeries()` client (surfaces the 400 `detail`). No UI yet — Composer wiring is a later step.
- Installment revise is **seq-driven** (helpers `_installment_series_start` / `_build_installments_by_seq`): the pending run fills the seq slots in `1..total` not held by a confirmed installment, each dated `series_start + (N−1) months`. Fixes a seq-corruption bug (adversarial review) where numbering the tail from `len(confirmed)` collided when installments were confirmed out of order — new fixture `series_noncontiguous.beancount` (confirmed {1,2,5}, pending {3,4}) locks it.
- Tests: +15 in `test_series_router.py` (installment count/total/rounding/accounts/reject-below-confirmed + non-contiguous seq integrity ×2; recurring amount/frequency/horizon; confirmed-preservation; currency inheritance). Full backend suite **400 passing**. Documented in [`features/series.md`](features/series.md) + [`backend/testing.md`](backend/testing.md).

## 2026-08-06 — Recurring frequency (weekly / monthly / yearly)

- Recurring series now support weekly and yearly cadences in addition to monthly. Installments stay monthly-only. No interval multipliers (every-N) — plain frequencies only.
- New `ledgr-series-freq` metadata key on recurring series; `monthly` is the implicit default and omits the key, so all pre-existing series read back as monthly. Documented in [`features/series.md`](features/series.md).
- `backend/series.py`: added `compute_dates()` / `periods_between()` (frequency-aware); `compute_monthly_dates()` / `months_between()` kept as monthly wrappers. `generate_series_transactions()` takes `frequency` and stamps the key for non-monthly recurring.
- `backend/routers/series.py`: `frequency` on `SeriesCreateIn` (rejected for installments); create derives count via `periods_between`; **extend** reads the stored freq and steps by that cadence instead of the old hardcoded month; `_summarize_series` surfaces `frequency`.
- Frontend: `SeriesFrequency` type, a recurring-only Weekly/Monthly/Yearly selector in `SeriesModal`, cadence label in `SeriesView` + view mode.
- Tests: +31 (weekly/yearly date math, leap-year yearly clamp, back-compat no-key=monthly, freq metadata, router round-trips incl. weekly extend).

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
