---
type: reference
last_updated: 2026-04-21
---

# Ledgr · Visual system · Part 2: Grid, iconography, logo

> Chapter 3 of the brandbook, Part 2 of 2. Version 0.2 (revised per founder review, 2026-04-21).
> This half completes the visual system. It specifies the spacing grid, the iconography rules, and the logo — wordmark and symbol.
>
> **Changes in v0.2:** symbol direction chosen — three parallel horizontal bars (the identity glyph) is canonical. The two-bar equals, dual-column, and asymmetric-sum alternatives are moved to §3.3 as documented decisions. Construction specs and production deliverables now describe a single committed mark.
>
> Read this alongside Part 1 (typography + color). The tokens defined here reference the tokens from Part 1.

---

## 1. Spacing and grid

### 1.1 The base unit is 4px

Every spatial measurement — padding, margin, gap, icon size, border radius, line-height math — is a multiple of 4px. No 3px, no 5px, no 7px. This is the rhythm.

Four, not eight, because Ledgr is dense. An 8px base forces coarser decisions; 4px lets tight UI (a table cell, a pill, a badge) breathe by exactly the right amount.

### 1.2 Spacing scale

A deliberately sparse set of tokens. Nine options, not twenty. Fewer choices means more consistent pages.

| Token | Value | Use |
|---|---:|---|
| `--space-0` | 0 | Flush — no gap |
| `--space-1` | 4px | Tight — related elements inside a component (icon + label) |
| `--space-2` | 8px | Default — gap between components in a stack |
| `--space-3` | 12px | Comfortable — spacing inside a card |
| `--space-4` | 16px | Section — between distinct groups of content |
| `--space-6` | 24px | Major — between major sections of a page |
| `--space-8` | 32px | Large — page margin on narrow viewports |
| `--space-12` | 48px | Hero — landing page hero vertical rhythm |
| `--space-16` | 64px | Rare — between page-level regions on wide viewports |

If a layout needs 20px or 28px, the layout is wrong — step back, use 16 or 24.

### 1.3 Border radius

Radii carry personality. Tight radii (2-4px) read as "technical, precise." Generous radii (12-16px) read as "friendly, consumer." Ledgr lives in the tight range.

| Token | Value | Use |
|---|---:|---|
| `--radius-none` | 0 | Full-bleed elements, table cells |
| `--radius-sm` | 3px | Badges, tags, small pills |
| `--radius-md` | 4px | Buttons, inputs, default |
| `--radius-lg` | 6px | Cards, modals, panels |
| `--radius-xl` | 8px | Dialog containers, featured callouts |
| `--radius-full` | 9999px | Avatars, fully round pills |

Anything over 8px does not appear in the product. 12px and above belongs to consumer apps. We are not that.

### 1.4 Breakpoints

Ledgr is desktop-first. Dense tables of financial data do not compress gracefully to a phone screen, and the target user is at a laptop, not on the subway. Mobile is a read-only concern.

| Name | Min width | Notes |
|---|---:|---|
| `mobile` | 0 | Read-only views, stacked single-column |
| `tablet` | 768px | Transitional; avoid designing primarily for this |
| `desktop` | 1024px | **The canonical breakpoint** — design here first |
| `wide` | 1440px | Additional horizontal breathing room, more columns fit |

Max content width on the widest screens: `1280px` centered. Beyond that, whitespace rather than stretching.

### 1.5 Layout

The main product shell is a two-region layout: a left sidebar (navigation, account tree) and a main content area. Both regions are persistent. The ratio is roughly 240px sidebar / fluid main.

The landing page and documentation pages use a 12-column flexible grid with a max-width of 1200px and a 24px gutter.

---

## 2. Iconography

### 2.1 Library

Ledgr uses **Lucide** as its icon library, with the option to ship custom Lucide-aligned icons when the set doesn't cover a concept (the specific case being anything accounting-specific — T-account glyphs, reconciliation markers, debit/credit flow — none of which live in a general icon library).

Why Lucide: open-source (ISC license), geometric, minimal, consistent stroke weight, actively maintained, and aligned with the "earned minimalism" value of Principle 2. It is the de-facto icon set for tools of this class (Linear, Vercel, shadcn/ui all ship with it).

No emoji appears in the product UI, ever. This is a rule inherited from foundation and principles and restated here for explicitness.

### 2.2 Construction rules

All icons, whether from Lucide or custom, follow the same geometric construction:

| Attribute | Value |
|---|---|
| `viewBox` | `0 0 24 24` |
| `stroke-width` | `1.5` |
| `stroke-linecap` | `round` |
| `stroke-linejoin` | `round` |
| `fill` | `none` (stroke-based icons only) |
| `stroke` | `currentColor` |

`currentColor` is critical — it lets an icon inherit its color from the surrounding text, which lets a single icon asset adapt to button hover, link color, semantic contexts, and dark mode automatically.

### 2.3 Size scale

Icons come in four sizes. Larger or smaller is off-scale.

| Token | Value | Use |
|---|---:|---|
| `--icon-sm` | 14px | Inline in body text, small hint |
| `--icon-md` | 16px | **Default** — inside buttons, table cells, input affordances |
| `--icon-lg` | 20px | Navigation items, larger action buttons |
| `--icon-xl` | 24px | Section headers, empty-state iconography |

Default is 16px, matching body-text size. An icon and its label should occupy the same visual line height.

### 2.4 Usage

Icons in Ledgr are always **load-bearing**. An icon that does not add information is decoration, and decoration is forbidden by Principle 2.

Good uses:
- Paired with semantic color (error icon + text + red) to carry redundant signal — Principle 4 requires this for accessibility.
- Inside a button when the button's action is more recognizable by glyph than by label (`→` for "next", a trash-can for "delete").
- In status pills (balanced / pending / reconciled), one per state.
- In the sidebar nav, one per top-level destination.

Bad uses:
- A clock icon next to a date. (The date is the signal. The clock is tautology.)
- Category-coded icons on every account row (each category has its own icon). Principle 4: structure explains, not decoration.
- An icon purely as a visual anchor on a section header. If the section title doesn't carry the section, an icon won't rescue it.

---

## 3. The logo

The logo is a compression of everything above — the typography becomes the wordmark, the midnight becomes its color, the grid gives it proportion, the principles give it restraint.

### 3.1 The wordmark

**"Ledgr"** set in **IBM Plex Sans SemiBold (600)**, tracking `-0.02em`, color `--midnight-800` (or white on dark).

The wordmark is the primary brand asset. It appears in the product header, on the landing page, at the top of the README, and in the footer of every document. When space permits, it is the full brand signature.

Construction notes:
- All lowercase. Never `LEDGR`, never `Ledgr LLC`, never `ledgr.io` as display.
- Tracking is negative (`-0.02em`) to visually cohere the five letters.
- Size scales but proportions stay locked. Minimum legible size: **11px**. Below that, show symbol only.
- A custom wordmark with hand-tuned optical adjustments is a post-v1 consideration. For now, live Plex SemiBold is the source of truth.

### 3.2 The symbol

**Three parallel horizontal bars — the identity glyph (`≡`).**

#### What it means

In mathematics, `=` means equal; `≡` means *identically* equal — equal by structure, by definition, inevitably. In code, `===` is strict equality: no coercion, no approximation, exactly the same.

For Ledgr, this distinction is load-bearing. Double-entry accounting does not *result* in balanced books — it *guarantees* them. You cannot enter data in a way that breaks the accounting equation, because the equation is the form of the entry. That is `≡`, not `=`.

The symbol says the same thing the product does: *your books are not balanced by luck or calculation. They are balanced by structure.*

The mark carries secondary readings that are consistent with the first: it evokes the ruled lines of a ledger page, the stacked entries of a journal, the rhythm of recording transactions. Every reading points the same direction.

#### Master construction (64×64)

The canonical asset is a 64×64 SVG with three solid rectangles filled in `--midnight-800`:

```svg
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect x="12" y="21" width="40" height="5" rx="1.5" fill="#0E2247"/>
  <rect x="12" y="29" width="40" height="5" rx="1.5" fill="#0E2247"/>
  <rect x="12" y="37" width="40" height="5" rx="1.5" fill="#0E2247"/>
</svg>
```

- Three equal bars: width 40, height 5, corner radius 1.5
- Three-unit gaps between bars
- Twelve-unit outer padding on left and right
- Vertically balanced in the frame
- Solid fill; no stroke, no gradient, no texture

#### Favicon construction (16×16, hand-tuned)

A separate 16×16 master is produced for pixel-snapping at the smallest render size:

```svg
<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="4.75" width="10" height="1.5" rx="0.5" fill="#0E2247"/>
  <rect x="3" y="7.25" width="10" height="1.5" rx="0.5" fill="#0E2247"/>
  <rect x="3" y="9.75" width="10" height="1.5" rx="0.5" fill="#0E2247"/>
</svg>
```

This guarantees that at 16×16 (favicon, browser tab, tiny UI chrome), the three bars render with equal visual weight rather than blurring at sub-pixel boundaries. A naïve downscale of the 64×64 master produces uneven rasterization; the hand-tuned version prevents that.

### 3.3 Alternatives considered and rejected

During exploration, three other directions were evaluated and rejected. They are recorded here so the reasoning is not lost to future amendments.

| Direction | Why rejected |
|---|---|
| **Two parallel bars — the equals (`=`)** | A strong candidate. Rejected because `=` is too universal to be distinctive as a brand asset. Works as a symbol; does not break through as a brand. The three-bar glyph makes a stronger claim (structural balance, not merely computed balance) and rewards a second look. |
| **Dual — paired vertical columns** | Conceptually rich (double-entry as architecture), but reads as a pause button out of context. Required explanation to land its meaning. |
| **Total — asymmetric sum-underline** | Carried completion and closure nicely at large sizes, but the asymmetry compressed to visual noise at 16×16 — it failed the favicon test. |

### 3.4 Lockups

Three standard lockups are defined and frozen:

- **Horizontal lockup (primary):** `[symbol] [16px gap] [wordmark]`. Used in headers, footers, READMEs.
- **Vertical lockup:** `[symbol]` on top, `[wordmark]` below, center-aligned. Used in hero sections, splash screens.
- **Symbol only:** Used at favicon, app icon, GitHub avatar, social profile image. The symbol stands alone in these contexts — that is the test this mark was designed to pass.

Minimum clear space around any lockup: the height of the lowercase "e" in the wordmark at the current size. Nothing sits closer than that.

### 3.5 Color and mode rules

- Primary: `--midnight-800` (`#0E2247`) on light surfaces, `--midnight-400` (`#6E8BC6`) or white on dark surfaces.
- Monochrome: the logo may be rendered in pure black or pure white when the context demands it (printed, embroidered, engraved). No other color is sanctioned.
- Never gradient. Never textured. Never dropshadowed. The logo is flat by rule and by principle.

### 3.6 Production deliverables

The symbol ships as a complete asset set:

- `ledgr-symbol.svg` — the 64×64 master (scalable for everything except favicon)
- `ledgr-symbol-16.svg` — the pixel-snapped 16×16 favicon master
- `ledgr-wordmark.svg` — the wordmark alone, set in IBM Plex Sans SemiBold
- `ledgr-lockup-horizontal.svg` — the primary lockup
- `ledgr-lockup-vertical.svg` — the vertical lockup
- PNG exports of each at 32, 64, 128, 256, 512, 1024 pixels
- `favicon.ico` with 16/32/48 nested
- Apple touch icon (180×180 PNG, `apple-touch-icon.png`)
- Android manifest icons (192×192 and 512×512)
- Monochrome (pure black and pure white) variants of every asset above, for low-fidelity contexts

Claude Design takes this spec, refines any optical adjustments needed (particularly at small pixel sizes), and produces the complete export set.

### 3.7 Usage guidance and a note on ambiguity

The three-bar glyph shares silhouette with the hamburger menu icon. This is acknowledged and accepted: the logo almost always appears paired with the "Ledgr" wordmark in contexts where ambiguity could arise, and in contexts where it stands alone (favicon, app icon, GitHub avatar), the user is already oriented to parse the glyph as a brand rather than as an interaction.

When the symbol does appear alone in a top-left product-header position — the zone where hamburger menus canonically live — it must be paired with the wordmark. No exceptions.

---

## Next — Chapter 4: Applications

With the visual system locked, Chapter 4 specifies how the brand manifests in concrete surfaces: the GitHub README, the landing page hero, the app's marketing site, social cards, the product's loading screen, error pages, email signatures. Each surface gets a brief and a reference layout.

Chapter 4 is not blocking. With Parts 1 and 2 of Chapter 3 approved, you have everything needed to brief Claude Design on identity production and everything Claudinho needs to implement the product visual system.

---

*Document owner: Thiago Paz. Reviewers: Claude (planner), Claudinho (implementer). Primary language: English.*
