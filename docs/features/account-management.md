---
type: feature
last_updated: 2026-08-20
---

# Account Management — edit, rename, deactivate

Keeping a long-lived account catalog readable. A ledger that has been running for years accumulates accounts that will never be posted to again; they crowd out the ones in use.

Three capabilities, in increasing order of risk:

| Action | Mechanism | Reversible |
|---|---|---|
| **Edit** | `PUT /api/accounts` — rewrites the `Open` directive via `FavaLedger.file` | yes |
| **Deactivate** | `POST /api/accounts/close` — inserts a Beancount `Close` directive | yes, via `/reopen` |
| **Rename** | `POST /api/accounts/rename` — text rewrite across every ledger file | no (but rolls back on failure) |

---

## Deactivate = Beancount `Close`

"Inactive" is not a Ledgr concept — it is Beancount's `close` directive, which stops an account accepting new postings. Ledgr adds only the presentation: `GET /api/accounts` prunes closed accounts by default, and `include_closed=true` brings them back.

This keeps one source of truth. A separate `ledgr-hidden` metadata flag was considered and rejected: two overlapping notions of "not shown" is a worse UI than one, and `Close` already carries the meaning other Beancount tooling understands.

`closed_count` is returned regardless of `include_closed`, so the UI can offer the toggle without first fetching the hidden set.

### Pruning: two kinds of node disappear

`_prune_closed` removes:

1. **A closed account with no surviving descendants.** One that still has a live child stays, or the child would lose its place in the tree.
2. **A structural node once everything under it is gone.** `realization.realize()` synthesises intermediate nodes from the colon-separated names — `Assets:Vehicle` exists purely because `Assets:Vehicle:KA` does, with no `open` directive of its own (`open_date: null`, `posting_count: 0`).

Case 2 was a real bug: deactivating `Assets:Vehicle:KA` left `Assets:Vehicle` behind as an empty group with nothing to click — no directive to edit, nothing to deactivate, and no way for the user to understand why it was there. A structural node with no visible children is a placeholder for nothing, so it goes too.

Structural nodes that still have live children are untouched (`Assets:Bank`, `Expenses:Daily`, and the other 20), because they carry the subtotals the tree is for.

### The cascade — and why Beancount alone is not enough

**`close` acts on the named account only.** Verified: close `Assets:Invest:XP`, then post to `Assets:Invest:XP:Bonds` the following month, and Beancount accepts it with zero errors. To Beancount those are independent accounts that merely share a name prefix; the hierarchy is a naming convention, not containment.

That is the opposite of what the account tree shows, so closing a parent alone silently leaves the subtree alive. **Ledgr cascades**: deactivating `Assets:Investments:Clear` writes a `close` for the parent *and* every descendant, which is what "retire this sleeve" means to a user. `include_children=false` gives the raw Beancount behaviour.

The cascade is prefix-anchored on `name + ":"`, so `Assets:Investments:Clear` does not drag `Assets:Investments:ClearOther` along. Already-closed descendants are skipped rather than erroring — closing a subtree where one leaf was retired earlier is normal.

**Reopen cascades symmetrically**, so deactivate → reactivate is a true round trip. It deletes deepest-first: each `delete_entry_slice` re-reads the file, and removing a line shifts the line numbers after it.

### Guard: close date vs last posting

A `close` dated before the account's last posting makes the ledger invalid. The endpoint checks every cascade target and refuses the whole operation with a 400 naming the offending accounts and their last posting dates, rather than writing a directive that breaks the file.

### A never-opened parent cannot be deactivated

Beancount rejects closing an account with no `open` directive (`Unopened account … is being closed`), and the endpoint returns 404 before writing, so this path cannot corrupt the ledger.

Such purely structural nodes are common — a real ledger has 22 of them (`Assets:Bank`, `Expenses:Daily`, `Liabilities:Credit-Card`…), created by the hierarchy rather than declared. The account tree hides the edit affordance on them (`open_date === null`): there is no directive to edit and nothing to close. To retire a group like that, deactivate the real accounts beneath it.

### What "inactive" does and does not do

It stops **new** postings. Nothing else. Verified endpoint by endpoint:

| Surface | Inactive account still appears? |
|---|---|
| Income Statement | **yes** — spend it made in the period is still reported |
| Balance Sheet | **yes**, for as long as it carries a balance |
| Cash Flow | **yes** — its movements are ordinary movements |
| `GET /api/transactions` | **yes** — full history, unchanged |
| `GET /api/account-names` (autocomplete) | **yes** |
| Accounts tree | **no** — the only surface that hides it, and only by default |

History is immutable: nothing past is hidden or rewritten. An inactive account drops off the Balance Sheet only once its balance reaches zero — that is the balance being zero, not the account being inactive; an *open* account with a zero balance is equally absent.

**Writes are pre-validated.** `POST /api/transactions` refuses a posting to an account deactivated on or before the transaction date, with a message naming the close date. Beancount does catch this on its own ("Invalid reference to inactive account") — but only *after* the write, which left a validation error in the ledger while the API had already answered `success: true`. `_validate_active_accounts` checks first so the file stays clean. The MCP server inherits this, since it posts through the same endpoint.

Backdated postings **are** allowed: a transaction dated before the close is legitimate, because the account was live then. Correcting history on a retired account keeps working.

### The opening date is editable

`PUT /api/accounts` accepts `date`, and the modal shows the field when editing, not only when creating. This is not cosmetic: a posting dated before the account's `open` makes the ledger invalid, and moving the opening back is normally the correct fix — without an editable field the user would be stuck.

Moving it **forward** past an existing posting is refused with a 400 naming that posting's date, since it would break the very thing it is meant to fix. The field is only sent when it actually changed, so an unrelated edit never rewrites the directive's date.

### Reopen deletes the directive

`POST /api/accounts/reopen` removes the `Close` via `delete_entry_slice` — it does not write a second directive. Beancount rejects two `Close`es for one account, so removal is the only way back.

---

## Rename

The hard one. See [`../backend/modules.md`](../backend/modules.md) for why this writes files directly and how atomicity is guaranteed — that section is required reading before touching `account_rename.py`.

### Two-step by design

The UI never renames on the first click:

1. `dry_run: true` → returns a `RenamePlan` (occurrences per file, accounts affected). Writes nothing.
2. User sees "rewrites 930 references across 8 files" and confirms.
3. Real call → rewrite, validate, commit or roll back.

Editing the target name clears the plan, so a stale preview can't be confirmed.

### Guard rails

- **Root changes are refused** (`Assets:X` → `Expenses:X`, HTTP 400). The root determines which `ledgr-type`s are legal, so moving root would silently invalidate the account's type. Create under the new root instead.
- **Existing target refused** (400) — merging two accounts is not a rename, and silently merging balances would be worse than an error.
- **`include_children`** decides whether nested accounts follow. Renaming `Assets:Invest:XP` with children takes `:Bonds` and `:Equities` along; without, they keep their old parent path and the parent name disappears from under them.
- **Validation compares against the error count from before the rename**, so a ledger that already had errors doesn't trigger a spurious rollback.

### Boundary anchoring

`Assets:Invest:XP` must not match inside `Assets:Invest:XP:Bonds` (unless children are included) nor inside `Assets:Invest:XPTruco` (ever). Patterns use lookarounds on `[A-Za-z0-9-]` and `:` on both sides.

The frontend mirrors this in `utils/accountRename.ts` for the preview list — `renamedTo` uses the same `oldName + ":"` boundary rather than a bare `startsWith`.

---

## The `unused` badge

`serialize_account_node` returns `posting_count` (postings naming this account) and `subtree_posting_count` (this account plus everything beneath it). The Accounts tree flags an account `unused` only when the **subtree** count is zero — a parent with no postings of its own is still in use when a child is.

Both counts come from `ledger.all_entries`, deliberately **not** from the filtered entry set: whether an account was ever used is a fact about the ledger, not about the current date range. Same for `closed`.

The badge is a suggestion, not an action — the user decides case by case. It is suppressed on already-closed accounts, where it would be noise.

---

## Cmd+K

Per [`../frontend/command-palette.md`](../frontend/command-palette.md):

- `Rename Account — <name>` and `Deactivate Account — <name>` appear **only when a register tab is open**, since both act on a focused account. A palette entry that can only fail is worse than no entry.
- `Toggle Inactive Accounts` is always available and switches to the Accounts tab so the effect is visible.

---

## Testing

- `backend/tests/test_account_rename.py` — 16 tests on the rewrite itself, including the lookalike-sibling trap and byte-identical rollback verification.
- `backend/tests/test_routers.py` — endpoint-level: dry run writes nothing, root change refused, closed accounts hidden/shown, reopen round-trip, `TestDeactivationCascade` (7 tests) for the subtree cascade, the lookalike-sibling guard, the close-date guard and the opt-out, and `TestInactiveAccountPostings` (5 tests) proving writes are refused without dirtying the ledger while history and reports stay intact.
- `frontend/src/utils/accountRename.test.ts` — boundary rules and target validation.

The `multifile` fixture (main file + `include`) exists specifically for rename: a rename that only rewrites the main file leaves the ledger broken, and a single-file fixture would never catch it.
