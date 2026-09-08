---
type: feature
last_updated: 2026-09-08
---

# Cmd+K — every user-facing action must be accessible

**This is a hard rule, not a suggestion.** The command palette is the primary keyboard-driven entry point for every action in the app. Every new user-facing action must be registered in `CommandPalette.tsx`.

## What this means in practice

- New modal (e.g., "New Series") → add a palette item: `"New Series"` that calls the relevant store action
- New view/tab (e.g., "Series") → add a palette item: `"View Series"` that calls `openTab()`
- New action (e.g., "Export") → add a palette item that triggers the action

If a capability is only reachable through a button nested in a specific view, it does not exist from the keyboard user's perspective. The palette is the inverse index of the UI.

## Group names

| Group        | Purpose                                                                        |
|--------------|--------------------------------------------------------------------------------|
| `"Actions"`  | Primary CRUD and navigation actions (New, New — Split, New — Repeat, New — Commodity, New Account, New Commodity, Update Price, Value: Units / At cost / At market) |
| `"Views"`    | Navigate to a specific tab (Dashboard, Accounts, Reports, Series, Holdings, Commodities) |
| `"Accounts"` | Individual account register tabs                                               |

## Label conventions

When adding a new entry, place it in the correct group and use consistent labels:

- Create actions: `"New"` opens the [Composer](guidelines.md#the-composer-composertsx--one-way-to-post); fast paths `"New — Split"` / `"New — Repeat"` pre-disclose it. (Transactions and series are one surface now — no separate "New Series".)
- Navigate actions: `"View <Thing>"` — e.g. `"View Dashboard"`, `"View Series"`, `"View Holdings"`, `"View Commodities"`
- Lens actions: `"Value: <Lens>"` — `Units` / `At cost` / `At market` switch the global conversion lens (a lens, not a filter: it never counts as an active filter and "Clear All Filters" leaves it alone)
- Commodity actions: `"New — Commodity (buy / sell / exchange)"` pre-discloses the Composer's Commodity wing; `"New Commodity"` declares a symbol; `"Update Price"` adds a `price` directive

## Keyboard access

`Cmd+K` opens the palette from anywhere in the app. See [`guidelines.md`](guidelines.md) → "Utilities → useKeyboardNav" for the full shortcut list.

## PR checklist

Every PR that adds a new user-facing capability must:

- [ ] Register a palette entry with the correct group and label convention
- [ ] Verify the entry works via keyboard (open palette → type label → Enter)

This is enforced by reviewers, not by tooling — but [the PR checklist](../pr-checklist.md) includes it.
