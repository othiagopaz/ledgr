---
type: log
last_updated: 2026-08-20
---

# Wiki Log

Append-only record of wiki changes, ingests, and lint passes. Most recent first.

---

## 2026-08-20 — The Budget's cash rule now covers expenses

- An expense that consumes no cash was still budgetable, so the ZBB could never close: `unallocated` sat permanently off by the non-cash amount. Found via a consortium admin-fee appropriation (`Expenses → Assets:Prepaid`, no cash leg), and it generalises to depreciation, write-offs, unrealised losses and monetary correction.
- `require_cash_counterpart` now applies to **every** section, and the rule itself was widened: `consumes_budget_cash` accepts `cash` **or** a deferred-cash type (`credit-card` / `payable`). Without that widening, extending the rule would have removed all R$53k of card spend from the Budget — a card purchase has no cash leg at purchase time.
- `prepaid` is deliberately excluded from deferred cash: its cash left, and was budgeted, at prepayment. Counting the monthly appropriation again would double-count.
- `accounts_with_activity` applies the same rule, so accounting-only expenses no longer surface as ghosts either. That fixed a latent inconsistency: reinvested interest was already refused by the envelope sums but still offered as a ghost.
- `payable` joins `investment`/`loan` as a budgetable allocation type — settling what you owe is a planned outflow, exactly like paying down a loan. It was rejected with a 400 before.
- Side effect, reviewed and kept: widening the accepted types is global, so a **credit** on a card statement (refund/cashback, `Income → Liabilities:Credit-Card`) now counts as budget income where it previously fell into the "Cash timing" line. Symmetric with expenses — if a card debit drains an envelope, a card credit fills one — and it reduces the bill you will actually pay. Two transactions on a real ledger (R$3.36 current, R$907.09 from migrated 2019 history).
- Measured on a real ledger: 4 accounts / R$14,082.24 of accounting-only expense left the Budget; card spend untouched. `TestExpenseCashRule` + `TestPayableIsAnAllocationEnvelope` — 9 tests. Backend suite at 498.

---

## 2026-08-20 — A refused write was silent in the register

- Reported as "adiciono a linha, dou Enter, não salva, nada acontece". `handleNewSave` and `handleEditSave` were written as `if (result.success) { …commit… }` with no else, so a rejected write produced no commit, no message and no closed editor.
- Latent for a while, but the validation added earlier today (unbalanced, account not open yet, account inactive) made `success: false` common, which is what surfaced it.
- Both handlers now throw on failure; `InlineEditor` catches around `await onSave(...)` and renders the reason in a row under the editor, next to the input that caused it.
- `saveResult.test.ts` pins the contract so the silent-failure shape cannot return. Frontend suite at 117.

---

## 2026-08-20 — "Inactive account" also means *not yet open*

- A user-created transaction dated 2025-12-11 against `Income:Salary:Additional` (whose `open` is 2026-01-01) left "Invalid reference to inactive account" in the ledger. Beancount uses "inactive" for **both** not-yet-open and closed, so the guard added earlier that same day — which only checked `Close` dates — missed this half entirely.
- `_validate_active_accounts` now rejects both bounds: `txn_date < open_date` and `txn_date >= close_date`. The not-yet-open message names the opening date and says what to do about it.
- **The opening date is now editable.** It was create-only, which meant the natural fix (move the opening back) was impossible through the UI and the ledger stayed invalid. `PUT /api/accounts` takes `date`; moving it forward past an existing posting is refused with a 400. Sent only when changed.
- `TestOpeningDateEdit` + `TestPostingBeforeAccountOpens` — 6 tests. Backend suite at 489.

---

## 2026-08-20 — Edits hit the wrong file on a multi-file ledger

- Reported as "editing a transaction's category doesn't persist". It did persist — into the wrong file. `_find_entry_by_lineno` matched on `lineno` only, and **52% of line numbers collide** across the 8 files of a real ledger. An edit aimed at `2025.beancount:1239` was written to `2019.beancount:1239`: the user's own entry untouched, and a stray 2025 transaction injected into the 2019 history (found two, inflating a bank balance by R$720).
- Entries are now keyed on `(filename, lineno)`. `serialize_transaction` exposes `filename`, and every caller passes it — `AccountRegister` (edit, delete, flag toggle), `Composer` (occurrence edit/delete) and `SeriesView` (bulk reconcile, quick reconcile). The last one was the worst exposure, since it edits in bulk.
- Also fixed: `edit_transaction` rebuilt metadata with `ledger.beancount_file_path`, so a rewritten entry claimed to live in the main file. It now keeps its own.
- A wrong/unknown `filename` now fails loudly instead of silently editing a neighbouring file's entry.
- `TestCrossFileEntryIdentity` — 5 tests over a fixture whose include deliberately reproduces the line-number collision. Verified the suite fails without the fix.
- The two damaged entries were repaired in place: the stray copies removed and the intended recategorisation applied to the real 2025 transactions.

---

## 2026-08-20 — Removed default-payment-account

- Fast input ranks payment accounts by actual usage, which is self-maintaining and a better predictor than a preference set once and forgotten. The checkbox, the `POST /api/options/default-payment-account` endpoint, the `default_payment_account` response field, the store slice, the `default` badge in the account tree and the orphan CSS are all gone.
- `Composer`'s `defaultPay` already had a usage-derived fallback, so dropping the manual override just makes that path unconditional.
- A stale `ledgr-option "default-payment-account"` directive left in a ledger is simply ignored — nothing rewrites the user's file.

---

## 2026-08-20 — Empty structural parents now disappear too

- Deactivating `Assets:Vehicle:KA` left `Assets:Vehicle` visible in the tree. It is not an account: `realization.realize()` synthesises intermediate nodes from the colon-separated names, so it existed only to hang `:KA` off (`open_date: null`, `posting_count: 0`). The row had no directive to edit and nothing to deactivate — unactionable and unexplainable.
- `_prune_closed` now also drops a structural node once it has no visible children. Structural nodes with live children stay (all 22 of them in a real ledger) since they carry the subtotals.
- Also fixed: a deactivate/reactivate cycle grew the file by a blank line each time, because `insert_entries` separates directives with one and `delete_entry_slice` leaves the spacing behind. Runs of 4+ newlines are collapsed after a reopen. Cosmetic, but it accumulated.
- Confirmed reactivating preserves the **original** `open` date: reopen only deletes the `close` directive, it never rewrites `open`. So the account is live from its original opening again and the inactive window vanishes entirely.

---

## 2026-08-20 — Inactive accounts: writes blocked, reads untouched

- Confirmed by testing every endpoint that deactivating affects **writes only**. An inactive account keeps appearing in the Income Statement, Balance Sheet (while it has a balance), Cash Flow, its register, and autocomplete. The account tree is the single surface that hides it.
- It leaves the Balance Sheet when its balance hits zero — a property of the balance, not of being inactive. An open zero-balance account is equally absent.
- **Fixed a real hole**: `POST /api/transactions` happily wrote postings to a closed account and returned `success: true`, leaving "Invalid reference to inactive account" in the ledger for Beancount to report on the next load. `_validate_active_accounts` now refuses first, naming the close date. The MCP server inherits it (same endpoint). Same class of bug as the unbalanced-write already recorded in [`pitfalls.md`](pitfalls.md).
- Backdated postings stay allowed — the account was live at that date, so correcting history on a retired account still works.
- `TestInactiveAccountPostings` — 5 tests. Backend suite at 480.

---

## 2026-08-20 — Deactivation cascades over the subtree

- **Beancount's `close` does not cascade** — verified by experiment, not assumption: closing `Assets:Invest:XP` and then posting to `Assets:Invest:XP:Bonds` the next month loads with zero errors. To Beancount those are independent accounts sharing a name prefix; the tree's implied containment does not exist.
- Since that contradicts what the account tree shows, `POST /api/accounts/close` now **cascades to every descendant** by default (`include_children=false` for the raw behaviour), and `/reopen` cascades symmetrically so the round trip is clean. Motivated by a real case: retiring `Assets:Investments:Clear` should retire `Clear:Equities` with it — both zeroed and idle since 2021.
- Prefix-anchored on `name + ":"`, so `Clear` does not drag `ClearOther` along. Already-closed descendants are skipped, not an error.
- New guard: a close dated **before** the last posting of any cascade target is refused with a 400 naming the accounts and dates, instead of writing a directive that invalidates the ledger.
- Reopen deletes **deepest-first** with a reload between deletions — `delete_entry_slice` works off line numbers, and removing a line shifts everything after it.
- A never-opened parent (22 of them in a real ledger: `Assets:Bank`, `Expenses:Daily`, …) cannot be deactivated: Beancount rejects it and the endpoint 404s first. The tree hides the edit affordance on those nodes since there is no directive to act on.
- `TestDeactivationCascade` — 7 endpoint tests. Backend suite at 475.

---

## 2026-08-20 — Account management: edit, rename, deactivate

- New page [`features/account-management.md`](features/account-management.md). Registered in [`index.md`](index.md).
- **Deactivate is Beancount's `Close`**, not a Ledgr flag: `GET /api/accounts` prunes closed accounts by default, `include_closed=true` restores them, and `closed_count` always comes back so the toggle can be offered without fetching the hidden set. A separate `ledgr-hidden` metadata flag was considered and rejected — two notions of "not shown" is worse than one, and `Close` is what other Beancount tooling understands.
- **`POST /api/accounts/rename` is the first sanctioned write outside `FavaLedger.file`.** Rationale and the atomicity contract are in [`backend/modules.md`](backend/modules.md). Short version: an account name appears in ~930 postings across 8 files on a real ledger, and `save_entry_slice` (one entry per call) cannot do that atomically — a failure mid-way leaves the ledger half-renamed. The rewrite snapshots every file first, re-parses after, and restores everything if the error count grew.
- **Boundary anchoring is load-bearing**: `Assets:Investments:XP` must not match inside `…:XP:Bonds` or `…:XPTruco`. The unanchored version of this bug already corrupted account names once during the spreadsheet migration. Covered by tests on both sides (`test_account_rename.py`, `utils/accountRename.test.ts`).
- Rename is **two-step in the UI**: `dry_run` returns the impact, the user confirms, then it writes. Editing the target clears the plan so a stale preview cannot be confirmed. Root changes and existing targets are refused with a 400.
- New `multifile` fixture (main file + `include`) — a single-file fixture would never catch a rename that misses included files.
- Verified against a copy of a real 5,546-entry ledger: 930 rewrites over 8 files, entry count and net worth unchanged, zero errors, and neighbouring `Liabilities:Credit-Card:Santander` untouched. Rollback verified byte-identical across all 8 files.

---

## 2026-08-19 — Fix: account tree could not be expanded with the mouse

- On the Accounts page the disclosure chevron was a bare `<span>`, and the *row* `onClick` both toggled expand and called `onSelect` — which opens the account's register in a new tab. The expand happened, but the navigation hid it, so the tree looked keyboard-only.
- The chevron is now its own `<button>` with `stopPropagation`, so expanding and opening are separate actions: chevron expands in place, row opens the register. Its hit area went from a 16px-wide/10px-font glyph to 22px × full row height, with a hover background and `aria-expanded`/`aria-label`.
- The button is `tabIndex={-1}` and returns focus to the tree on click. The tree owns the keydown listener, so a focused button would have silently killed arrow-key navigation after any chevron click — caught in testing, not in review.

---

## 2026-08-19 — Pages open scoped to the current year

- A larger import made the unbounded first paint expensive: every page loaded the whole ledger. `periodPreset` now initialises to `DEFAULT_PERIOD_PRESET` (`'this-year'`) in `appStore.ts`, so the *first* request each page fires is already bounded — the filter is not applied after an unfiltered load. On the current file that halves the `/api/transactions` payload (495 KB → 262 KB) and the rows rendered (1566 → 834).
- Shown, not hidden: the FilterBar renders the period as an active pill (`2026` + resolved range) from the first paint, its ✕ widens to All time, and `clearFilters()` returns to the default year rather than unbounded. Added Cmd+K → "Filter: All Time". The bar now also renders on Accounts (previously hidden, which would have left that page silently filtered); Budget stays excluded as it has its own month navigation.
- Fixed a silent bug found on the way: `Dashboard.tsx` put `filters` in its query *keys* but never passed them to the fetches, so it re-fetched on every filter change and still loaded and reported the entire ledger. `AccountsView` ignored the filters altogether and cache-missed the shared `["accounts", viewMode, filters]` key, costing a second full fetch. Rule added to [`frontend/guidelines.md`](frontend/guidelines.md).
- Composer's account-usage ranking now reads a trailing 12 months instead of the whole ledger — it was the single largest payload in the app, paid on every open, and recency is the better ranking signal anyway.
- Added `staleTime: 30_000` and `placeholderData: keepPreviousData` globally: the ledger only changes on our own writes (already invalidated) or an outside edit (caught by the backend mtime check), so remounts no longer refetch, and filter changes keep the previous data on screen instead of blanking.
- Supersedes the "default = All time" line in [`plans/PLAN-global-filters.md`](plans/PLAN-global-filters.md).

---

## 2026-08-19 — Cash Flow breakdown is hierarchical

- The Cash Flow was the only report returning a **flat** breakdown, and its rows were labelled with the account's leaf segment alone. Any two counterparts sharing a leaf name rendered identically — a deferred-income release (`Assets:Reserva:Bonus`, `Liabilities:Deferred:Bonus`, `Income:Bonus` in one transaction) produced three rows all reading `"Bonus"`. Now each section's `items` is a tree built by the same `build_report_tree` the Income Statement uses; the nesting disambiguates, so the short label stays.
- **The root is kept as a node** in the Cash Flow (`keep_root=True`), unlike the Income Statement. A cash flow section mixes account roots by design, and an asset increase reads opposite to a liability increase — the reader needs to see which. See [`backend/cashflow.md`](backend/cashflow.md#breakdown-shape).
- Fixed a latent bug in `build_report_tree`: it **overwrote** its result once per root, so only the last root survived. The Income Statement never hit it (it filters to one root before calling); the new Cash Flow caller does. Regression test added.
- Retired the "strip the `Assets:` prefix on investing labels" special case — it existed only to compensate for the flat list.
- New contract to respect: a section subtotal ties to the **top-level** nodes, not to every node, and the breakdown must never be built with `negate=True`.
- Reveal depth: clicking a section title opens **two** levels (`Assets` → `Investments`); deeper levels stay folded until the user clicks them, and "Expand All" overrides and opens everything. The payload always carries the full depth — this is purely the renderer's default, so a deep chart of accounts doesn't dump a wall of rows.

---

## 2026-08-07 — Consolidate Cmd+I into one command

- The old fast/advanced split left **two** shortcuts — `⌘I` (fast) and `⌘⇧I` (advanced) — plus a "⌘⇧I advanced" hint at the bottom of the page. Since the Composer unified everything (multi-posting is just the Split disclosure inside the same modal), that distinction is gone. Now a single **`⌘I` opens the Composer** (`useKeyboardNav` matches `e.code === "KeyI"` regardless of Shift), identical to the palette's "New". StatusBar hints collapsed to `⌘I compose`.
- Cleanup: removed the now-dead `advanced` mode — `openTxnModal` dropped its `mode` param (only edit-occurrence / blank-compose callers remain), and the orphaned `TxnModalMode` type is gone.
- tsc + eslint + 89 vitest green; verified live: both `⌘I` and `⌘⇧I` open the same Composer (default line-first, Split one click away — not a pre-opened grid).

## 2026-08-07 — Fix: dates used UTC instead of local timezone

- `today()` and the date keyword helpers built the string with `new Date().toISOString().slice(0,10)`, which converts to **UTC** first. In a negative-offset zone (e.g. BRT, UTC−3) an evening entry (21:00 local = 00:00 next-day UTC) was stamped with **tomorrow's** date — every register created "today" landed on 08/07 instead of 07/07.
- Replaced with a local-component formatter (`getFullYear/getMonth/getDate`) in `dateUtils.ts` (`iso()` / `today()` / the `parseSmartDate` "yesterday" branch) and in `fastInputParser.ts` (`today`/`yesterday`/`tomorrow` keywords). `AccountRegister`'s "new transaction" row now calls `today()` instead of an inline UTC slice.
- Backend needs no change: series/transaction dates always come from the request body (now correct), and the few `date.today()` defaults are server-local, not UTC.
- New `dateUtils.test.ts` (+3) locks it — with a fake clock at 2026-07-07 evening, `today()` must be `2026-07-07`. Verified the guard **fails on the old UTC code under `TZ=America/Sao_Paulo`** and passes on the fix. 89 vitest (default + Sao_Paulo TZ) + tsc + eslint green.

## 2026-08-07 — Composer: fix Repeat-wing per-installment rounding

- The Repeat wing computed the per-installment amount with `Math.floor((total/n)*100)/100`, which truncated an **exact** split down by a cent (`2924 ÷ 10` showed `292,39 each · last absorbs rounding` — wrong, and it disagreed with the L0 preview's `292,40`). Floating-point `292.4*100 = 29239.999…` floored to `292,39`.
- Now the wing mirrors the backend (`ROUND_HALF_UP`, remainder on the last installment): `per = Math.round((total/n)*100)/100`, and the "· last <amount>" note appears **only when a remainder actually exists**. Exact splits show just `2.924,00 ÷ 10 = 292,40 each`; `1.000,00 ÷ 3` shows `333,33 each · last 333,34`. Matches the preview and the created postings.
- 86 vitest + tsc + eslint green; verified live for both the exact and remainder cases.

## 2026-08-07 — Series summary: "Remaining" totals footer

- The Recurring/Installments summary table (`SeriesView`) now has a `<tfoot>` totalling the visible series: the **Per Transaction** column sums to the combined per-cycle burden, and the **Total** column sums to what's still to be paid — **remaining = Σ(amount_per_txn × pending)** — so you can see the outstanding future installments at a glance. This is the pending outstanding, NOT the full-plan sum (which would double-count already-paid installments).
- Totals honour the active tab + the hide-completed toggle (they're computed from `filteredSeries`), and are **grouped by currency** (one footer row each if the list mixes currencies). The label spans the lead columns (`leadCols` = 5 on Recurring with its Frequency column, else 4) so the numbers align under their headers. New `.series-summary-foot*` CSS.
- Verified live on :8430 copy: Installments → `Remaining 1.949,36 · 21.223,70 BRL` (matches Σ per×pending = 21223.70, distinct from the 28.036,15 full-plan sum); Recurring footer aligns under the 7-column layout. tsc + eslint green.

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

## 2026-08-19 — Consolidated account balance

- `GET /api/reports/account-balance` now rolls up children when the requested
  account is a pure grouping node (no postings of its own, e.g.
  `Assets:Investments`). Previously charted a flat zero line.
- Response gains `consolidated`, `children`, and `planned_children`; a leaf
  account's response is unchanged.
- Chart draws the total as bars (left axis) and each child as a line on an
  independently-scaled right axis.
- See [`backend/reports.md`](backend/reports.md) for the invariants.

---

## 2026-04-21 — Wiki bootstrap

- Restructured from monolithic `AGENTS.md` (549 lines) into a Karpathy-style wiki.
- Added [`index.md`](index.md) (catalog) and this file (log).
- Added [`scripts/wiki-lint.py`](../scripts/wiki-lint.py) to enforce conventions.
- Added YAML frontmatter to `brand/*.md`.
