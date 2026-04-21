---
type: reference
last_updated: 2026-04-21
---

# Ledgr · Applications

> Chapter 4 of the brandbook. Version 0.1 (draft, pending founder review).
> This is the final chapter of the committed brandbook. It specifies how the brand manifests in the concrete surfaces the world will see: the GitHub README, the landing page at ledgr.com.br, social preview cards, in-product chrome (loading, empty, 404, errors), and the founder's email signature. Chapter 5 — the illustration system — exists only as an appendix here, to be formalized if and when it is activated.

---

## 1. The README

The README is the first surface most people encounter. For an open-source product, it is the landing page before there is a landing page, and for many visitors it is the only thing they read.

### 1.1 Register

The README is written in the **positioning register** (see foundation §7) with occasional dry wit of the kind documented in §7.3 *On humor*. It is not the product register. That means it is allowed — encouraged — to make definitive claims and to refuse to translate itself for the beginner.

It is not, however, allowed to be cute. No emoji. No "Hey there!" No exclamation points. The reader is a competent adult who chose to visit this page.

### 1.2 Structure

A fixed composition, top to bottom:

1. **Centered symbol** at 64px
2. **Wordmark** — "Ledgr" as H1, centered
3. **Hero tagline** — *"The end of the 70-tab spreadsheet."* (italic, centered, one line)
4. **Sub-tagline** — one descriptive sentence, centered
5. **Badge row** — license, stars, release version, build status
6. **Horizontal rule**
7. **Opening paragraph** — the positioning, in prose, roughly four sentences
8. **"Who Ledgr is for"** — H2, two paragraphs defining the user by what they are and what they are not
9. **"What you get"** — H2, five bullet points maximum
10. **"Install"** — H2, a single code block
11. **"Quick start"** — H2, a brief example of the `.beancount` file and what Ledgr does with it
12. **"Documentation"** — H2, one sentence linking to `/docs`
13. **"Acknowledgments"** — H2, a paragraph crediting Beancount and Fava explicitly
14. **"License"** — H2, one sentence

No tables of contents. No "About," "Features," "Why Ledgr" verbosity. The structure is the argument.

### 1.3 Reference template

The canonical README markdown, committed to the repo as the source of truth. Future READMEs derive from this one; variations require an amendment.

```markdown
<p align="center">
  <img src="./assets/ledgr-symbol.svg" width="64" height="64" alt="Ledgr">
</p>

<h1 align="center">Ledgr</h1>

<p align="center">
  <em>The end of the 70-tab spreadsheet.</em>
</p>

<p align="center">
  Double-entry personal finance, built on the accounting engine
  professionals trust.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/thiagopaz/ledgr?style=flat-square&color=0E2247"></a>
  <a href="https://github.com/thiagopaz/ledgr/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/thiagopaz/ledgr?style=flat-square&color=0E2247"></a>
  <a href="https://github.com/thiagopaz/ledgr/releases"><img alt="Release" src="https://img.shields.io/github/v/release/thiagopaz/ledgr?style=flat-square&color=0E2247"></a>
</p>

---

Ledgr is what personal finance software should have been from the start.
It treats your money with the seriousness of a professional accountant,
because the engine under it — [Beancount](https://github.com/beancount/beancount) —
is the one professionals use. Unlike consumer apps, it does not hide
complexity. Unlike ERPs, it does not drown in it. Unlike spreadsheets,
it cannot silently break.

## Who Ledgr is for

Ledgr is for people who manage their own capital with the discipline
of a professional. You understand (or want to understand) double-entry
accounting. You hold assets in multiple currencies. You want your books
reconciled to the cent, not to the round number.

If you are here for an app that tracks your streaming subscriptions
and sends you encouragement on Sundays: this is not that app.

## What you get

- **Real double-entry accounting.** Not simulated. Every transaction has two sides.
- **Multi-currency, multi-asset.** BRL, USD, investments, commodities — modeled correctly, never averaged.
- **Plain-text data.** Your ledger is a `.beancount` file you own. You can walk away any time.
- **Keyboard-first.** Every action in one or two keystrokes. The mouse is supported, never required.
- **Open source.** MIT licensed. The engine is open source. The whole thing is yours.

## Install

[to be written when the install story stabilizes]

## Quick start

[a minimal `.beancount` example followed by a screenshot or terminal cast]

## Documentation

Full documentation lives in [`/docs`](./docs).

## Acknowledgments

Ledgr stands on [Beancount](https://github.com/beancount/beancount) and
[Fava](https://github.com/beancount/fava). They are not dependencies in
the token sense — they are the engine Ledgr wraps. Every accounting
correctness guarantee Ledgr makes traces back to them.

## License

MIT. The files are yours, the code is yours, the ledger is yours.
```

Shields.io badges use `color=0E2247` so they match the midnight accent. Keep it to three badges maximum — more is corporate theater.

---

## 2. The landing page

### 2.1 Light mode as marketing default

The landing page at `ledgr.com.br` is **light mode by default**, regardless of the visitor's system preference. The product supports both modes; the marketing face commits to one, and light is it.

Why light: light surfaces read as institutional, trustworthy, and legible in the broadest range of viewing conditions (from sunlight to low-brightness monitors). Dark-mode marketing pages look good to developers and alien to everyone else. Ledgr's target user is technical but aspiring to professional — the light face meets them on the professional side.

Dark mode shows up in the landing as a **screenshot** of the product running in dark mode, inside a section celebrating that capability. The wrapping page stays light.

### 2.2 The hero

A single headline, a single subhead, a single call to action.

**Headline:** *The end of the 70-tab spreadsheet.*

Set in IBM Plex Sans SemiBold, size 56-64px on desktop, 36-40px on mobile, tracking `-0.03em`. Color `--midnight-800`.

**Subhead:** *Double-entry personal finance, built on the accounting engine professionals trust.*

IBM Plex Sans Regular, 18-20px, color `--color-text-secondary`, max width ~560px so it wraps into two lines.

**Primary CTA:** *Get started* → links to `/docs` (not to a signup form; there is no signup).
**Secondary CTA:** *Star on GitHub* → links to the repo.

No "Book a demo." No "See pricing." No "Try free." This is open source and keyboard-first; the user gets started by reading and running.

### 2.3 Structure

The landing page is a single scroll, divided into five sections. No header mega-menu, no three-column feature grids, no logo carousel.

| Section | Purpose | Height (desktop) |
|---|---|---:|
| **Hero** | Hook — the headline, subhead, and CTA | ~80vh |
| **The problem** | Three panels, one per enemy (bank apps, budget apps, spreadsheets) — brief, sharp, each a single paragraph | ~60vh |
| **The product** | Large product screenshot(s), dense data showing the Balance Sheet and Cash Flow; captions explaining what the viewer is looking at | ~100vh |
| **The principles** | The five design principles from Chapter 2, each as a one-line heading with a one-sentence elaboration | ~60vh |
| **Get started** | Install command in a terminal-styled code block, GitHub link, docs link | ~40vh |
| **Footer** | Wordmark, copyright, contact, Beancount + Fava acknowledgment | ~20vh |

Max width: `1200px`. Horizontal padding: `--space-8` (32px) on desktop, `--space-4` (16px) on mobile. Vertical rhythm uses the spacing scale from Chapter 3 Part 2.

### 2.4 Copy samples

**The problem — bank apps panel:**

> Your bank app is an advertisement with a balance in the corner. It shows you round numbers, sends you notifications, and hides every interesting detail behind purple gradients.

**The problem — budget apps panel:**

> Budget apps think you need encouragement. You don't. You need a system that tells you the truth and lets you act on it.

**The problem — spreadsheets panel:**

> A spreadsheet scales with effort, not with power. Every formula you add is another point of silent failure. There is no audit trail. There is no double-entry discipline. You are one misplaced reference away from believing a lie.

(These are the tone. Actual copy may be refined; the register is frozen.)

### 2.5 Mobile behavior

The landing page is readable on mobile but not designed for it. Hero headline shrinks, sections stack, screenshots shrink to fit — but no mobile-specific layouts, no hamburger nav, no collapsible sections. If a visitor is deciding on a double-entry accounting system from their phone, the landing page is not the bottleneck.

---

## 3. Social preview cards

### 3.1 Why these exist without active social

Ledgr does not post. But every link to `ledgr.com.br` shared in Slack, WhatsApp, iMessage, X, LinkedIn, or email previews itself using an Open Graph card. Without a deliberate spec, the preview is a stretched screenshot or a broken image — both are a failure to show up.

### 3.2 Dimensions

Standard Open Graph dimensions: **1200 × 630 pixels**. Rendered as PNG.

Safe area for text (accounting for mobile crops): `120px` of padding from each edge. Anything closer to the edge can clip on some clients.

### 3.3 Composition

A fixed template. Three variations, one template.

```
┌─────────────────────────────────────────────┐
│                                             │
│   [Ledgr symbol]  Ledgr                     │
│                                             │
│                                             │
│   {MESSAGE — 36-48pt, SemiBold, midnight}   │
│                                             │
│   {SUBHEAD — 20pt, regular, secondary}      │
│                                             │
│                                             │
│                           ledgr.com.br      │
└─────────────────────────────────────────────┘
```

Background: solid `#FFFFFF` (matches the light-mode landing page).
Symbol: 48px, top-left, with wordmark at 32px aligned to the right of it.
Message: left-aligned, max 3 lines, `--midnight-800`.
Subhead: left-aligned, 1-2 lines, `--color-text-secondary`.
URL: bottom-right, 14pt, `--color-text-tertiary`.

No decorative elements. No photography. No gradients. The card is a miniature of the landing page's sobriety.

### 3.4 Variations

| Surface | Message | Subhead |
|---|---|---|
| **Homepage** | *The end of the 70-tab spreadsheet.* | Double-entry personal finance, built on Beancount. |
| **Documentation** | *{Page title}* | From the Ledgr docs. |
| **Release note** | *Ledgr v{N}* | {One-line description of the release} |

Each variation uses the same template with only the message and subhead slots changing. Generating them should be automated — a small script that composites the SVG — not manual design work per release.

---

## 4. In-product chrome

The surfaces inside the product that are not the primary data display: loading, empty states, error pages, 404. These are moments when the product has less to say, and those moments are where a lesser product shows its seams.

### 4.1 Loading

Per Principle 5, no loading indicator renders for operations under 300ms. For anything longer:

- **Short (300ms–1s):** a subtle inline pulse — a single dot oscillating opacity — in `--color-text-tertiary`. No text.
- **Medium (1s–3s):** the inline pulse plus a one-word label: *Loading.* No period-animation, no spinner.
- **Long (>3s):** a contextual label: *Loading transactions…* or *Parsing ledger file…* Still no spinner. Skeleton loaders with shimmer animations are forbidden.

### 4.2 Empty states

Every empty state follows the same shape: **one line telling the user what is missing, one line telling them how to add it.**

| View | Empty state text |
|---|---|
| Transactions | *No transactions yet.* / *Press `N` to add one, or `⌥N` for the fast input.* |
| Accounts | *No accounts yet.* / *Press `A` to add your first.* |
| Reports — Balance Sheet | *No accounts to display.* / *Add accounts to see your balance sheet.* |
| Reports — Cash Flow | *No data in this range.* / *Try adjusting the date filter (press `/`).* |
| Search results | *Nothing matches.* / *Try fewer words, or press `Esc`.* |

No illustrations. No emoji. No "Uh oh!". The empty state is a label and an instruction.

### 4.3 404 page

One of the few places in the product where the dry humor from foundation §7.3 is welcome. The 404 is a moment when the reader has been stopped — a small wit softens the stop without performing.

**Headline:** *This page is unreconciled.*

**Subhead:** *The URL does not match anything on the ledger.*

**Action:** A single link back to home: *Return to dashboard.*

*"Unreconciled"* is a deliberate word choice — it means something specific in Ledgr, so it lands for the target user as both a joke and a signal that they are in the right kind of product.

### 4.4 Error pages

Server errors and unrecoverable application errors revert to the formal product register. No jokes, no wit — an error on a finance tool is not the moment for personality.

**500 error headline:** *Something went wrong.*

**Body:** *Ledgr encountered an unexpected error. The request was not saved. No data was modified.*

**Action:** *Return to dashboard.* Optionally, a link to file an issue.

The most important information is in the body: *no data was modified*. Reassuring a finance-tool user that their data is safe is the single job of an error page.

---

## 5. Email signature

A founder's email is a brand surface. For Ledgr, the signature is austere and functional.

```
Thiago Paz
Ledgr — ledgr.com.br
```

That is all. Two lines, no title unless representing a specific role, no social icons, no legal disclaimer, no quote, no color. The email client renders it in its default font; no attempt to push IBM Plex into environments that won't render it.

For signed communications that require more formality (legal, contractual), a longer variation:

```
Thiago Paz
Founder, Ledgr
ledgr.com.br
```

Three lines. Still no icons, still no decoration.

---

## Appendix A — The illustration system (preview)

**Status: not committed. This appendix is a reservation of territory, not a spec.**

The brandbook commits Ledgr to an icons-only visual identity through v1. Illustration — the "Ledgr face" system the founder has signaled interest in — is deferred to a future Chapter 5 that will be written only when illustration is actively needed. This appendix describes the principles that future chapter must honor, so that if illustration is activated later, it does not drift from the brand established here.

### A.1 Why deferred

Illustration is expensive to produce, expensive to maintain consistency on, and expensive to get wrong. For v1, Ledgr's surfaces (README, landing, product chrome, OG cards) all work well with typography, color, and icons alone. Adding illustration before it is needed risks two failure modes: (a) rushed illustration that dilutes the brand, and (b) sunk cost that locks the brand into an aesthetic direction that outgrows the product.

Illustration activates when one of the following is true:

- The landing page requires visual rhythm between text-heavy sections and the product screenshot section
- Blog or changelog posts demand hero images that a screenshot alone does not satisfy
- A specific empty state would communicate better with a small illustration than with text (rare, and only after the empty-state text has been tested)

### A.2 The aesthetic direction

The Ledgr illustration system, when activated, will be:

- **Flat and geometric.** Built from the same primitive vocabulary as the logo: rectangles, rounded corners, solid fills, straight lines. No hand-drawn textures.
- **Monochromatic or duotone.** Midnight as the primary, with midnight-200 or white as the secondary. No more than two colors in any single illustration.
- **Abstracted from financial primitives.** The subject matter is ledgers, balance sheets, transactions, reconciliations — rendered as stylized information objects, never as literal accountant-at-a-desk scenes.
- **Serious.** The illustrations will look like Stripe Press editorial work, not like Notion mascots. Reference canon: Pentagram, Stripe Press, isometric technical diagrams from old IBM manuals.

### A.3 What it is not

Explicitly forbidden, even in a future illustration activation:

- No mascots, characters, or figures with faces
- No emoji-adjacent doodles
- No cartoon hands holding coins
- No photorealistic rendering of money, coins, or cards
- No 3D rendering
- No gradients, except flat duotone
- No Notion-style bonequinhos — the earlier consideration of a "Ledgr face" applies to the *metaphorical* face of the brand, not to literal characters

### A.4 When to activate

Write Chapter 5 of the brandbook when the first concrete need appears — likely either the first blog post or the first landing-page scroll section that demands a visual break. Not before.

---

## The brandbook is complete

With Chapters 1 through 4 approved, the Ledgr brandbook covers:

- **Ch1 — Foundation:** who Ledgr is for, what it stands for, how it speaks
- **Ch2 — Principles:** the five design arbiters
- **Ch3 Part 1 — Typography & color:** IBM Plex and the midnight palette
- **Ch3 Part 2 — Grid, icons, logo:** the spatial system and the `≡` mark
- **Ch4 — Applications:** how the brand shows up on every surface that exists today

Every decision that governs how Ledgr looks and sounds is now recorded in one of these five files. The next legitimate brandbook edit is either an amendment (versioned, changelog-noted) or the activation of the illustration system (a new Chapter 5).

---

*Document owner: Thiago Paz. Reviewers: Claude (planner), Claudinho (implementer). Primary language: English.*
