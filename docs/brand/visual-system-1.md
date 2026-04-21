---
type: reference
last_updated: 2026-04-21
---

# Ledgr · Visual system · Part 1: Typography and color

> Chapter 3 of the brandbook, Part 1 of 2. Version 0.1 (draft, pending founder review).
> This half commits the two foundations every later decision depends on: **the fonts** and **the color system**. Part 2 — covering grid, spacing, iconography, and the logo — ships after this one is approved.
>
> Everything below is tokenized. Every value is named, every name is stable, every use site references the token rather than the literal. This is the contract between the brand and the codebase.

---

## 1. Typography

### 1.1 The choice

**IBM Plex Sans + IBM Plex Mono.**

The entire Ledgr type system is built on these two fonts — one family, two voices. Plex was designed by IBM for the specific job of communicating technical work without flattening the person doing it. It carries character without ornament. It reads as *competent and adult*. It pairs with midnight blue the way a well-cut suit pairs with a white shirt.

Both are open-source (SIL Open Font License) and distribute freely. Both cover full Latin-extended, which means every Portuguese diacritic (`á é í ó ú â ê ô ã õ ç`) renders natively with no fallback.

### 1.2 Weights we ship

Three weights of sans, two of mono. That is the whole inventory — resist adding more.

| Family | Weights | Italic? |
|---|---|---|
| IBM Plex Sans | 400 (Regular) · 500 (Medium) · 600 (SemiBold) | 400 only, used sparingly for emphasis in prose |
| IBM Plex Mono | 400 (Regular) · 500 (Medium) | No |

More weights means more bytes, more FOUT surface area, and more decisions. Three sans weights already carry a complete hierarchy when combined with size changes. If a future need seems to demand a fourth weight, the first move is to re-read Principle 2 and ask whether the hierarchy is actually broken.

### 1.3 Font stacks

```css
--font-sans: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
```

The fallback chain matters because Plex loads over the network. While it arrives, the system fallback must be as close to Plex's metrics as possible to avoid layout shift — hence `-apple-system` and `ui-monospace` leading the fallbacks (these are the native system UI fonts, which Plex most closely resembles).

### 1.4 Loading strategy

- Self-host the WOFF2 files (do not load from Google Fonts — a third-party font CDN is a tracking surface we don't need).
- `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the three critical sans weights.
- `font-display: swap` on all `@font-face` rules — we'd rather show fallback text immediately than blank space.

### 1.5 The type scale

One scale governs all text in the product, documentation, and marketing. Every text element in the UI points to one of these tokens.

| Token | Size | Weight | Line-height | Family | Use |
|---|---:|---:|---:|---|---|
| `--type-display` | 24px | 600 | 1.2 | Sans | Page-level titles, hero on landing |
| `--type-h1` | 20px | 600 | 1.25 | Sans | Major section header |
| `--type-h2` | 16px | 600 | 1.3 | Sans | Subsection header |
| `--type-h3` | 14px | 500 | 1.35 | Sans | Minor heading, label-of-group |
| `--type-body` | 14px | 400 | 1.55 | Sans | Default body copy, table cells |
| `--type-body-sm` | 13px | 400 | 1.5 | Sans | Dense tables, secondary info |
| `--type-caption` | 12px | 400 | 1.5 | Sans | Metadata, hints, footnotes |
| `--type-number` | 14px | 400 | 1.4 | Sans (tnum) | Any numeric cell or value |
| `--type-number-lg` | 22px | 500 | 1.25 | Sans (tnum) | Summary KPIs, balance totals |
| `--type-code` | 13px | 400 | 1.5 | Mono | Code, account names, raw ledger snippets |
| `--type-code-sm` | 12px | 400 | 1.5 | Mono | Inline `ledgr-type` values, keyboard shortcuts |

Body at 14px, not 16px. Ledgr is dense by design — 16px is generous for prose, which Ledgr mostly isn't. 14px is where Linear, Stripe Dashboard, and serious tools live. Anything tighter than 13px is Bloomberg territory and breaks accessibility.

### 1.6 Tabular figures — the enforcement of Principle 3

Plex Sans ships tabular figures as an OpenType feature. They are enabled via `font-feature-settings: "tnum" 1` or, more robustly, `font-variant-numeric: tabular-nums`.

**Apply tabular figures globally**, then turn them off selectively for prose where they harm readability:

```css
:root {
  font-variant-numeric: tabular-nums;
}

/* Prose contexts — README, docs body, marketing copy */
.prose,
.prose p,
.prose li {
  font-variant-numeric: normal;
}
```

The reason for the global-first default: anywhere a number appears and we haven't explicitly thought about it, we'd rather it align than wobble. This inverts the usual "opt-in" convention of most design systems — a deliberate choice, because Ledgr is a ledger.

### 1.7 Italics and emphasis

Italic is reserved for:
- Book / publication titles in prose (`*Friends*`, `*The Accounting Equation*`)
- Semantic emphasis in documentation where tone would be lost otherwise
- Gloss / aside in specs and plans

**Italic is never used in the product UI.** No italic field labels, no italic error messages, no italic captions. The product is formal; italic is conversational.

Bold (500 or 600) carries emphasis in the UI. Italic does the parallel job in prose.

### 1.8 A quick test

Before shipping a view that uses type in a new way, the test is: *lay a row of Ledgr data (`Assets:Bank:Itaú    1,234.56    2025-10-31    Transfer to savings`) into the view at the target size. Is the account name scannable? Does the number align? Does the date fit without truncation?* If any answer is no, the type scale is wrong for that view.

---

## 2. Color

### 2.1 Ledgr Midnight — the primary accent

One color carries the brand. **Ledgr Midnight: `#0E2247`.**

Deep enough to feel authoritative, saturated enough to read as intentional blue rather than "dark gray." Not the Itaú blue, not the Nubank purple, not the Stripe indigo — its own address on the map. Every interactive primary (buttons, links, focus rings, active tabs, checkboxes) uses this token or a variant of it.

The midnight ramp extends in both directions for hover/active states, subtle backgrounds, and dark-mode equivalents. Define the full ramp once, use the tokens everywhere.

| Token | Value | Use |
|---|---|---|
| `--midnight-950` | `#050E1F` | Deepest — very rare, used only for extreme-contrast needs |
| `--midnight-900` | `#081935` | Text on pale midnight backgrounds |
| `--midnight-800` | `#0E2247` | **Canonical Ledgr Midnight** — default primary |
| `--midnight-700` | `#14306A` | Primary hover state |
| `--midnight-600` | `#1F438D` | Active / visited links |
| `--midnight-500` | `#3C5FA8` | Bright accent (rare) |
| `--midnight-400` | `#6E8BC6` | Dark-mode primary accent |
| `--midnight-300` | `#9BB0D8` | Dark-mode hover |
| `--midnight-200` | `#C7D1E5` | Strong border on midnight-tinted surfaces |
| `--midnight-100` | `#E0E7F1` | Subtle selected-row background |
| `--midnight-50` | `#F3F6FB` | Very subtle wash (hover on a neutral row) |

### 2.2 Semantic colors

Four semantic hues, each with a foreground (for text/icon) and a background (for pill, inline-alert strip, or highlight). Reserved strictly for the jobs Principle 4 assigns to color — *error, success, warning, info* — and nothing else.

| Role | Foreground | Background | Used for |
|---|---|---|---|
| **Error** | `#C92A2A` | `#FCEAEA` | Failed save, invalid input, blocking validation |
| **Success** | `#2A8548` | `#EAF5EE` | Successful reconciliation, balance confirmed |
| **Warning** | `#B76E00` | `#FCF1DE` | Non-blocking alerts, missing optional metadata |
| **Info** | `#2862A0` | `#E7EFF8` | Neutral highlights, "read more" contexts |

A note on the choices: these hues are muted. No cheerful green, no panicky red, no cartoon amber. The Ledgr user does not need their software to *emote* at them. The color says "this is what kind of thing happened" — the icon and the text carry the detail.

### 2.3 Neutrals — text, borders, surfaces

A cool-neutral gray scale with a subtle blue undertone, so neutrals sit in visual harmony with the midnight accent (rather than fighting it, which pure warm grays would).

| Token | Value | Use |
|---|---|---|
| `--color-text-primary` | `#0A1A2F` | Default body text, primary labels |
| `--color-text-secondary` | `#516684` | Secondary text, metadata |
| `--color-text-tertiary` | `#8596AD` | Hints, placeholders, disabled text |
| `--color-border-default` | `#E1E6EE` | Default border, dividers |
| `--color-border-strong` | `#C9D1DD` | Emphasis border, hover on interactive |
| `--color-border-subtle` | `#EEF1F5` | Barely-there divider (row separators) |
| `--color-bg-primary` | `#FFFFFF` | Main surface |
| `--color-bg-secondary` | `#F7F8FB` | Alternate row, subtle panel |
| `--color-bg-tertiary` | `#EFF1F5` | Darker surface (sidebar, footer) |

Pure black (`#000000`) and pure white (`#FFFFFF`) are both used — `#FFFFFF` everywhere as surface, `#000000` never as text (too harsh against white; `#0A1A2F` is almost-black with a midnight undertone and reads softer without looking gray).

### 2.4 Dark mode

Dark mode is not an afterthought. A serious operator reconciling books at 11 PM is the canonical Ledgr user, and they deserve a palette that doesn't blast their retinas.

The principle: preserve the *relationships* between tokens, flip the *absolute values*. A secondary-text element should still read as secondary in dark mode — just lighter-on-dark instead of darker-on-light.

| Token | Light value | Dark value |
|---|---|---|
| `--color-bg-primary` | `#FFFFFF` | `#0A1422` |
| `--color-bg-secondary` | `#F7F8FB` | `#111B2D` |
| `--color-bg-tertiary` | `#EFF1F5` | `#1B2640` |
| `--color-text-primary` | `#0A1A2F` | `#E7ECF4` |
| `--color-text-secondary` | `#516684` | `#9AABC5` |
| `--color-text-tertiary` | `#8596AD` | `#6A7E9A` |
| `--color-border-default` | `#E1E6EE` | `#223352` |
| `--color-border-strong` | `#C9D1DD` | `#37496A` |
| `--color-accent` | `#0E2247` (midnight-800) | `#6E8BC6` (midnight-400) |
| `--color-accent-hover` | `#14306A` (midnight-700) | `#9BB0D8` (midnight-300) |

Semantic colors in dark mode shift to lighter, more saturated variants:

| Role | Foreground (dark) | Background (dark) |
|---|---|---|
| Error | `#E55F5F` | `#3E1818` |
| Success | `#4FAB6E` | `#163520` |
| Warning | `#DCA347` | `#3A2710` |
| Info | `#5992D3` | `#152644` |

Dark-mode background is `#0A1422`, not `#000000`. A pure black surface reveals every OLED pixel and makes the brand feel cold. A near-black with midnight undertone keeps the same personality the light mode has — it's the same blue dimmed, not a different color space.

### 2.5 Accessibility — contrast requirements

Every color pair in the product must meet **WCAG 2.1 AA** at minimum. Specifically:

- Body text on its surface: contrast ratio ≥ 4.5:1
- Large text (≥18px or ≥14px bold) on its surface: ≥ 3:1
- Interactive focus indicators on their surface: ≥ 3:1

The palette above is designed so that default pairings (primary text on primary bg, secondary text on primary bg, accent on primary bg) all clear AA cleanly in both modes. Custom pairings — especially putting accent-400 text on a light surface in light mode — must be checked, because midnight-400 on white is too light to clear AA.

### 2.6 The full token table

A single source-of-truth CSS file for the tokens. Every component imports from here; no component hardcodes a hex.

```css
:root {
  /* Brand */
  --midnight-950: #050E1F;
  --midnight-900: #081935;
  --midnight-800: #0E2247;  /* canonical */
  --midnight-700: #14306A;
  --midnight-600: #1F438D;
  --midnight-500: #3C5FA8;
  --midnight-400: #6E8BC6;
  --midnight-300: #9BB0D8;
  --midnight-200: #C7D1E5;
  --midnight-100: #E0E7F1;
  --midnight-50:  #F3F6FB;

  /* Semantic — foreground / background pairs */
  --color-error-fg:   #C92A2A;
  --color-error-bg:   #FCEAEA;
  --color-success-fg: #2A8548;
  --color-success-bg: #EAF5EE;
  --color-warning-fg: #B76E00;
  --color-warning-bg: #FCF1DE;
  --color-info-fg:    #2862A0;
  --color-info-bg:    #E7EFF8;

  /* Neutrals — light mode defaults */
  --color-text-primary:   #0A1A2F;
  --color-text-secondary: #516684;
  --color-text-tertiary:  #8596AD;
  --color-border-default: #E1E6EE;
  --color-border-strong:  #C9D1DD;
  --color-border-subtle:  #EEF1F5;
  --color-bg-primary:     #FFFFFF;
  --color-bg-secondary:   #F7F8FB;
  --color-bg-tertiary:    #EFF1F5;

  /* Semantic aliases that most components reference */
  --color-accent:        var(--midnight-800);
  --color-accent-hover:  var(--midnight-700);
  --color-accent-active: var(--midnight-900);
  --color-accent-subtle: var(--midnight-100);

  /* Typography */
  --font-sans: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

[data-theme="dark"] {
  --color-text-primary:   #E7ECF4;
  --color-text-secondary: #9AABC5;
  --color-text-tertiary:  #6A7E9A;
  --color-border-default: #223352;
  --color-border-strong:  #37496A;
  --color-border-subtle:  #192338;
  --color-bg-primary:     #0A1422;
  --color-bg-secondary:   #111B2D;
  --color-bg-tertiary:    #1B2640;

  --color-accent:        var(--midnight-400);
  --color-accent-hover:  var(--midnight-300);
  --color-accent-active: var(--midnight-500);
  --color-accent-subtle: #1B2A4A;

  --color-error-fg:   #E55F5F;
  --color-error-bg:   #3E1818;
  --color-success-fg: #4FAB6E;
  --color-success-bg: #163520;
  --color-warning-fg: #DCA347;
  --color-warning-bg: #3A2710;
  --color-info-fg:    #5992D3;
  --color-info-bg:    #152644;
}
```

### 2.7 What this palette deliberately does not include

- **No gradient system.** Principle 5 (motion earns its place) has a cousin here: *decoration earns its place*. Gradients read as mid-2010s SaaS fashion and add zero information. If a surface needs to differ from another, token-pick a different neutral. Solid fills only.
- **No branded chart palette yet.** Charts get their own sub-system in Part 2 (or a later chapter) because they have distinct requirements — categorical distinction, colorblind-safety, print-safety. Deferring.
- **No per-account colors, no per-category colors.** This is Principle 4 made tangible. Accounts distinguish themselves by name and hierarchy. If Claudinho ever ships a dashboard with an "Assets blue, Liabilities orange" sidebar, this doc is the tombstone.

---

## Next — Part 2: Grid, iconography, logo

With type and color locked, `BRANDBOOK-03-visual-system-part-2.md` picks up:

- Spacing scale and grid system
- Icon specifications (stroke, size, family — Lucide-aligned)
- The wordmark and symbol

The symbol will come with 2–3 proposed directions to choose from, each built from a small number of geometric primitives (≤ six), each designed to work down to 16×16 pixels — in the spirit of the Linear dot and the Vercel triangle you pointed to.

---

*Document owner: Thiago Paz. Reviewers: Claude (planner), Claudinho (implementer). Primary language: English.*
