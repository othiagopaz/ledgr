---
type: principle
last_updated: 2026-04-21
---

# Ledgr · Design principles

> Chapter 2 of the brandbook. Version 0.1 (draft, pending founder review).
> These five principles are the **arbiters** of visual and interaction decisions. When a design choice is contested — in a PR review, in a spec, in a conversation with the Claude Code agent — cite a principle. Principles outrank opinions.
>
> Each principle has five parts: *the rule* (what to follow), *why* (why it's worth following), *therefore* (the concrete implications), *anti-pattern* (what violates it), and *how to apply* (the checklist).

---

## 1. The keyboard is the primary interface

### The rule

Every action a user takes more than twice a week has a keyboard shortcut. The mouse is supported for everything, required for nothing.

### Why

The Ledgr user comes from a 70-tab spreadsheet or from Fava. They navigate like a psychopath — `Ctrl`-`Tab`, `Alt`-hotkey, muscle memory in both hands. A product that forces them to reach for the mouse breaks the exact flow they came to Ledgr to keep. Keyboard-first is not a feature; it is the baseline of respect we pay to the kind of user we're building for.

### Therefore

- Every new view ships with shortcuts. No shortcut, no ship.
- Shortcuts are discoverable in-UI: pressing `?` opens a cheatsheet; every button carries its shortcut in a subtle hover hint.
- Shortcuts are stable across views where they make sense (`/` = focus filter, `N` = new item, `Esc` = close, `J`/`K` = next/prev row). Collisions across views are forbidden.
- The onboarding for a new feature is a changelog entry naming the shortcut, not a product tour.
- The shortcut assignments already committed (`P` = planned toggle, `R` = reconcile in AccountRegister, `⌥N` / `⌥⌘N` = fast / advanced input) are load-bearing — new assignments consult the existing map before taking a key.

### Anti-pattern

Mouse-only menus. Shortcuts that exist but are hidden. Collisions ("P" meaning "planned" in one view and "print" in another). Shortcuts that change meaning depending on hover target.

### How to apply

When Claudinho builds a view: (1) list the top three actions a user performs in it; (2) assign each a shortcut, checking against the global map; (3) document the shortcut in the changelog and `?` cheatsheet; (4) confirm the shortcut works before the PR is mergeable. No PR that adds a view ships without this checklist passing.

---

## 2. Dense, with breath

### The rule

Ledgr is an information-dense product. The goal is not to show less — it is to show more, clearly. But density without breath is a wall of text. Breath is what lets density work.

### Why

The Ledgr user is here to *see everything*. Hiding data behind tabs, accordions, and modals forces them to navigate to find truth — and every navigation is a tax. A Balance Sheet that fits forty accounts on screen is strictly better than one that fits ten, provided each row is still scannable.

Breath is the difference between "dense" and "cramped." Consistent baseline grid, generous line-height on body copy, whitespace as the grouping mechanism instead of borders. The page should feel calm despite being full.

### Therefore

- Information-per-pixel is a metric we optimize. A view showing eight rows that could show twenty is a redesign candidate.
- Whitespace is structural, not decorative. It groups and separates — it never just pads.
- Borders, background fills, and dividers are used sparingly — only when whitespace alone cannot carry the grouping.
- Typography hierarchy does heavy lifting: size and weight distinguish headers from body, not color.
- Padding inside interactive elements (buttons, inputs, table cells) stays tight; padding between groups can breathe.

### Anti-pattern

Card-heavy layouts with `1rem+` internal padding and `2rem+` gutters between cards. Modal-on-modal stacks that hide complexity. Accordions collapsed by default. Empty-state illustrations larger than the actual data will be when populated.

### How to apply

When designing a view, first lay out the full dataset with zero chrome — no borders, no backgrounds, no cards. Only add visual grouping where the data stops communicating on its own. If a card wrapper "looks nicer" but adds nothing to comprehension, remove it.

---

## 3. Numbers are tabular

### The rule

Every number in Ledgr is rendered with **tabular figures** — digits of equal width within the proportional font — and aligned on the decimal. No exceptions.

(Note on terminology: a "tabular figure" is a mono-width digit inside an otherwise proportional typeface. The text is proportional; only the digits are locked to a uniform width. This is the `tnum` OpenType feature. This is not full-monospace font for numbers — full mono would clash with the density-with-breath aesthetic of §2.)

### Why

Accounting is columns of numbers lining up. When `1,234.56` sits above `987.00`, the user scans the column and sees magnitudes without reading each figure. Proportional (non-tabular) digits render `1` narrower than `8` — so a column of mixed numbers wobbles on its vertical axis, and the eye cannot magnitude-compare at a glance. For a ledger, this is disqualifying.

### Therefore

- Every font used in Ledgr must support `font-feature-settings: "tnum" 1`, enabled globally for numeric contexts.
- In tables, balances, reports, and statements, numbers right-align on the decimal separator.
- Currency symbols, where present, are placed consistently — never mixed within a column (`$1,234.56` and `R$ 1.234,56` never sit in the same stack).
- Negative numbers use a single convention: parentheses `(1,234.56)` for formal accounting reports, minus sign `-1,234.56` for inline and conversational contexts. Chosen once per context, applied everywhere.
- Zero is rendered as a dash `—` or `0.00`, never blank, never "N/A." A blank cell is an absence of data; a zero is a fact.

### Anti-pattern

Proportional digits in a report body. A "Total" row that doesn't vertically align with the column above it. Mixing currency formats (`$1,234.56` next to `R$ 1.234,56`) in the same view. A pretty sans-serif font with beautiful numerals that don't line up.

### How to apply

For any new numeric element, verify four things: (1) tabular figures applied; (2) right-aligned on decimal; (3) currency formatting matches the rest of the view; (4) negative convention matches the context. Four-check. Every number.

---

## 4. Color informs direction and state

### The rule

Color is reserved for two jobs: **financial direction** (positive → green, negative → red) and **UI state** (error, success, warning, info). Categories and hierarchies are carried by typography, position, and label — never by hue alone.

### Why

In a finance product, the sign of a number is the most consequential fact on the screen — users scan for it. Encoding it in hue (green up, red down) is the universal convention across banks, brokerages, and spreadsheets; withholding it costs a glance every time, because the reader has to re-parse a leading minus or re-read a column header to know if they're up or down. The convention is strong enough that it doesn't collide with "red = error": context (a table cell vs. a toast, an amount vs. a banner) disambiguates.

What we still refuse is *category* color: painting "Assets" blue and "Liabilities" orange to label them. Labels carry categories; color carries direction and state.

Color-blind users remain a real constraint. The rule: where a signal is load-bearing (a critical status, a blocking warning), color must be paired with a shape, icon, or label. Sign-coloring on amounts is a reinforcement, never the sole channel — the minus sign and column position carry the same information.

### Therefore

- **Textual amounts** with a sign are coloured — positive green, negative red — universally: registers, report tables, tallies, summaries, status bars, account trees.
- Directional totals in report tables follow the same rule: Income Statement revenue rows green, expense rows red; Cash Flow inflows green, outflows red; Balance Sheet account rows coloured by balance sign.
- **Charts are the exception.** Bars, lines, and areas stay in the restrained midnight ramp — the surrounding legend, axis labels, and tooltip numbers carry the direction. Painting series in red/green adds chart clutter without reinforcing information the viewer doesn't already have from position and legend, and breaks the calm of the dashboard.
- Error / success / warning / info colours live in the semantic state tokens — and they're paired with an icon or label, never colour alone.
- Account categories (Assets, Liabilities, Equity, Income, Expenses) are still distinguished by position and label — no color-coded sidebar, no rainbow taxonomy.
- Hover, focus, and active states use subtle background/border changes, not hue shifts.

### Anti-pattern

A color-coded account taxonomy ("Assets: blue, Liabilities: orange…"). A pie chart in six hues where every slice is already labeled. Warning states that rely on colour without an icon. *Omitting* the red/green sign-coloring on textual amounts because "structure already carries it" — it doesn't, not fast enough, and users expect it. *Carrying* sign-coloring into chart series — the chart loses its restraint and the table downstream loses its relative impact.

### How to apply

For any **textual** amount that can take either sign, apply `.positive` when the number > 0 and `.negative` when the number < 0 (`.amount-zero` exactly at zero). For **charts**, keep the midnight brand palette regardless of series direction; let the legend and axis do the labelling. For hierarchies, categories, and anything that isn't a signed amount or a UI state, typography and position do the work.

---

## 5. Motion earns its place

### The rule

Animation is used only where it helps the user understand **what changed**. It is never decorative.

### Why

Motion in software has exactly one job: communicate change. A row fading in says "this is new." A panel sliding from the side says "this came from over there." A checkmark animating says "this just succeeded." Functional motion orients the user.

Motion without function — loading shimmers that play on every page load, hover animations on every button, gratuitous transitions between views — is noise. It makes the product feel slow (the user waits for the animation to finish) and amateurish (the product is showing off instead of working).

### Therefore

- Default transition duration: 120–150ms. Anything longer feels sluggish and violates §8 of the foundation ("effective · secure · fast").
- New rows, new records, new data points fade-in over 150ms.
- Mode changes (edit → read, expand → collapse) transition height and opacity over 150ms.
- No loading spinners for operations under 300ms — use optimistic UI.
- No ambient animations anywhere in the product: no pulsing indicators, no floating icons, no background gradients in motion.

### Anti-pattern

Skeleton loaders shimmering for two seconds on every page load. Button hovers that scale up and drop-shadow. Transitions over 250ms. Progress bars for operations that complete in 80ms. Any animation that runs while the user is trying to read or type.

### How to apply

When adding motion, answer two questions: (1) *What change is this communicating?* (2) *Can the user tell what changed after the motion ends?* If you cannot answer (1) clearly, remove the motion. If the answer to (2) is "no," the motion is doing the wrong job — redesign it.

---

## Future directions

**Illustration.** Ledgr currently uses icons only — Lucide-style, inline SVG, no emoji. An illustrative character system (a "Ledgr face" — serious, minimal, brand-aligned, closer to the tone of Stripe Press than to the Notion mascot) is under consideration for a future visual system chapter. Not committed. Not prioritized until the core product identity is locked.

**Sound.** Not considered. Ledgr is silent software.

---

## Next — Chapter 3: The visual system

With these five arbiters in place, `BRANDBOOK-03-visual-system.md` translates them into concrete tokens: typography scale, type pairings, color palette (semantic only), spacing grid, iconography rules, and the logo. The logo arrives *after* the typography is chosen, because the logo should feel like a compression of the type — not a sticker glued on top of it.

---

*Document owner: Thiago Paz. Reviewers: Claude (planner), Claudinho (implementer). Primary language: English.*
