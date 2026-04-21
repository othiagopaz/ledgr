<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/ledgr-symbol-dark.svg">
    <img src="./assets/ledgr-symbol.svg" width="64" height="64" alt="Ledgr">
  </picture>
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
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-0E2247?style=flat-square"></a>
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

- **Real double-entry accounting.** Not simulated. Every transaction has two sides, and the books balance or they don't.
- **Three statements, for a person.** Income Statement, Balance Sheet, Cash Flow — the same instruments a CFO uses, applied to your life.
- **Multi-currency, multi-asset.** BRL, USD, investments, commodities — modeled correctly, never averaged into a single fiction.
- **Plain-text data.** Your ledger is a `.beancount` file you own. Git-friendly, human-readable, portable out on a whim.
- **Keyboard-first.** Every action in one or two keystrokes. The mouse is supported, never required.

## Install

Prerequisites: Python 3.12+, Node.js 20+, and `bison` ≥ 3.8 (Beancount
builds its parser from source — `brew install bison` on macOS).

```bash
git clone https://github.com/thiagopaz/ledgr.git
cd ledgr
./scripts/setup.sh
./scripts/dev.sh
```

`setup.sh` creates the Python venv, installs dependencies, and seeds an
example ledger. `dev.sh` starts the backend on `:8080` and the frontend
on `:5173`. Point `dev.sh` at your own file when you have one:

```bash
./scripts/dev.sh path/to/your-ledger.beancount
```

## Quick start

A Ledgr ledger is a plain-text file. A minimal one:

```beancount
2026-01-01 open Assets:Bank:Checking BRL
2026-01-01 open Income:Salary         BRL
2026-01-01 open Expenses:Food         BRL

2026-01-05 * "Acme Corp" "Monthly salary"
  Assets:Bank:Checking   5000.00 BRL
  Income:Salary         -5000.00 BRL

2026-01-08 * "Oxxo" "Groceries"
  Expenses:Food             82.50 BRL
  Assets:Bank:Checking     -82.50 BRL
```

Save it, point `dev.sh` at it, and Ledgr reads it. Every transaction
shows up in the register, rolls up into the account tree, and cascades
into the three statements. The file stays the source of truth; Ledgr is
a window onto it.

## Documentation

Full documentation lives in [`/docs`](./docs) — architecture,
conventions, the brand book, and the principles that govern what Ledgr
does and, more importantly, does not do. Start with
[`docs/index.md`](./docs/index.md).

## Acknowledgments

Ledgr stands on [Beancount](https://github.com/beancount/beancount) and
[Fava](https://github.com/beancount/fava). They are not dependencies in
the token sense — they are the engine Ledgr wraps. Every accounting
correctness guarantee Ledgr makes traces back to them. A decade of
battle-tested double-entry logic is why Ledgr gets to be thin,
opinionated, and correct.

## License

GNU AGPL-3.0 — see [LICENSE](./LICENSE). The code is open, the ledger
file is yours, and any hosted fork of Ledgr stays open too. Fair deal.
