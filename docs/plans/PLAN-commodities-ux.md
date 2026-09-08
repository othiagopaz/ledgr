# PLAN — Commodities: model, UX and delivery

Status: **approved 2026-09-08**, implementation in flight on `feat/commodities`.
Companion to [`../features/commodities.md`](../features/commodities.md), which is the
map of the Beancount/Fava machinery. This page records the *product* decisions
taken on top of that map, the API contracts the frontend and backend agreed on,
and how the work is split so it can be built in parallel.

Everything here was verified against Beancount 3.2.0 / Fava 1.30.12 with small
ledgers (see §2). Numbers quoted are real output, not estimates.

---

## 1. Context that shaped the decisions

- **The user's real ledger has zero commodities today.** 100% BRL, investments
  are BRL buckets with interest posted to `Income:Interest`. There is no
  migration: existing BRL buckets stay as they are, and commodities start being
  used from now on. First real use: buying USD into a "Global" account.
- The backend already reads lots correctly (PR #25). What is missing is listed
  in `features/commodities.md` §8 — this plan implements that list *and* the UX
  over it.
- Brand: Ledgr's user "holds assets in multiple currencies, asset classes and
  jurisdictions". Commodities are core, not an add-on.

## 2. Decisions

### 2.1 There is no "currency vs stock". There is "spend vs hold".

To Beancount, `USD` and `PETR4` are the same kind of thing: a quantity of
something. The only modelling choice is **how the account uses it**:

| Account intent | Mechanism | Gain on disposal | Everyday spending |
|---|---|---|---|
| **Spend** (Global card, salary in USD, travel) | held at **price** `@` + plugin `currency_accounts` | Not per sale. The FX result is the market value of the `Equity:CurrencyTrading:*` pair (realised + unrealised together) | A coffee is just an expense |
| **Hold to sell** (PETR4, gold, USD bought as an investment) | held at **cost** `{}` | Explicit `Income:Gains` leg per sale, computed by Beancount from the stored cost | Every reduction is a "sale" with a gain leg |

Verified: USD *can* be held at cost and then behaves exactly like PETR4
(1000 USD `{5.00 BRL}` sold `@ 6.00` → 1000.00 BRL in `Income:Gains`). The
cost of doing that is that a 5 USD coffee becomes a three-leg sale with a
2.00 BRL gain. That friction is why "spend" accounts use price.

**The user decides per account, at account creation.** The signal in the ledger
is the **booking method on `open`**: an account with an explicit booking method
(`"NONE"`, `"FIFO"`, `"HIFO"`, …) *holds to sell*; an account without one
*spends*. No new metadata key.

### 2.2 Booking is per account; a posting may override

The 5th field of `open` (`2026-01-01 open Assets:XP "NONE"`). Not the global
`option "booking_method"` — that cannot mix Brazilian and foreign brokers.

A posting that names its lot (`{37.00 BRL}`, a date, a label) wins over the
account's method. Verified on a FIFO account: `-50 PETR4 {37.00 BRL}` took the
March lot, not the February one.

### 2.3 Brazilian average cost = booking `NONE` + Ledgr fills the cost + plugin guards it

Beancount 3.2.0 has **no average cost** (`AVERAGE` and `{*}` both error).
`NONE` means "Beancount checks nothing": it accepted a made-up `{10.00 BRL}` on
a lot bought at 33/37 with zero errors, and it fails on an elided `{}` ("Too
many missing numbers"). So:

- Ledgr computes the **weighted average cost per (account, commodity)** from the
  ledger and pre-fills the sale (`{35.00 BRL}` on the 33/37 example), editable.
- `plugin "beancount.plugins.check_average_cost"` refuses a cost more than 1%
  off the average ("too far from the average cost (10.00 vs. 35.00)").
- Average is **per account** in v1. The Receita computes per asset across
  custodians; if the same ticker ever sits in two brokers, revisit.
- Ledgr reports the **capital gain**, not the tax (20k/month exemption, day
  trade, loss carry-forward and DARF are out of scope).
- Under `NONE`, Beancount does **not** reduce lots: a sale appends a negative
  position next to the positive one. Holdings therefore shows **totals per
  commodity** for `NONE` accounts and real lots only for FIFO/LIFO/HIFO/STRICT.

### 2.4 One account per broker, many assets inside

`Assets:XP` without a currency constraint held `BRL`, `PETR4` and `ITUB4` at
once, with per-commodity balance assertions and correct gains. Holdings groups
by commodity. A currency constraint on `open` is optional and recommended for
single-currency accounts (it turns a BRL deposit into a USD account into a load
error).

### 2.5 No lot labels in v1

They work (transfer a lot between brokers by name, sell by name) but only matter
for hand-picked lots under STRICT. The write path keeps supporting them; the UI
does not expose them.

### 2.6 Where gains live

- **PETR4 (cost)**: the gain account is the elided posting in the sale — per
  posting, default `Income:Gains`, editable in the Composer.
- **USD (price)**: the plugin's base account is **one per ledger**, in the
  plugin line. No per-account or per-posting choice, no opt-out flag.
  Recommended `Equity:CurrencyTrading` so an open USD position (whose pair only
  makes sense valued at market) stays off the P&L. `Income:FX` is a valid
  alternative when positions are bought and sold whole.

Verified full round-trip (buy 1000 USD @ 5.00, sell all @ 5.50): Itau goes
5000 → 5500 BRL (the money), `Equity:CurrencyTrading:BRL` ends at −500 BRL
(the record), the USD pair nets to zero, Balance Sheet closes in every lens.

### 2.7 Conversion lens is global, in the FilterBar

`Units` / `At cost` / `At market (BRL)`. Default **At market**, because in the
other two lenses a "spend" USD account shows an unconverted `1000 USD` that
does not add up with anything. Persisted like the theme.

### 2.8 Unrealised gains are computed, never posted

Beancount 2's `unrealized` plugin is gone in v3. For held-at-cost positions the
Balance Sheet at market gets a **computed** line `Unrealised gains` under
Equity so `A = L + E` closes; nothing is written. For held-at-price positions
the `currency_accounts` pair already closes the sheet at market on its own.

### 2.9 Ledger plugins (documented, not auto-inserted)

```beancount
plugin "beancount.plugins.implicit_prices"
plugin "beancount.plugins.coherent_cost"
plugin "beancount.plugins.check_average_cost"
plugin "beancount.plugins.currency_accounts" "Equity:CurrencyTrading"
```

The Commodities tab shows which of these the loaded ledger has and a one-line
"why" for each missing one. `currency_accounts` is marked "prototype" by its
author; it passed every test here.

### 2.10 Prices are typed by hand in v1

Manual `price` directives from the Commodities tab and Cmd+K. `beanprice`
(separate package, reads `price:` metadata on the `commodity` directive) is the
natural next step and is out of v1.

### 2.11 A foreign-currency expense is written in the operating currency

`cafe 5USD` from a USD account writes `Expenses:Food 26.00 BRL` against
`Assets:Bank:Global -5.00 USD @ 5.20 BRL`, the rate pre-filled from the
ledger's latest price and editable. The expense is what left the wallet in
BRL that day; the USD's own move is the plugin's FX result. Keeping the expense
in USD instead makes the P&L depend on the day the report is opened and hides
the spend from BRL budget envelopes. Clearing the Rate switches to that form.
Currency is read only when glued to the number (`5USD`, `100.10BRL`), never
`5 USD`. Full reasoning in `features/commodities.md` §8b.

---

## 3. Surfaces

### 3.1 FilterBar — conversion selector
Button "Value" next to Period/Account. Options: Units, At cost, At market.
Store field `conversion`, default `at_value`, persisted. `useFilterParams`
returns it; `appendFilters` sends `conversion=…`. Cmd+K: `Value: Units`,
`Value: At cost`, `Value: At market`.

### 3.2 Reports
- All report endpoints accept `conversion`. Balance Sheet at market adds the
  computed `unrealized_gains` line under Equity. `other_totals` stays only for
  positions that cannot be converted (no price, no cost — e.g. vacation days).
- Net Worth stops dropping non-OC postings (today buying a share makes net
  worth fall by the cash and never recover).
- New tab **Holdings**: one row per (account, commodity) that is not the
  operating currency. Columns: commodity, account, units, avg cost, total cost,
  price + price date (visibly stale past 7 days), market value, unrealised
  (abs, %), weight %. Expandable lots when the booking keeps them. Footer
  totals. A "FX result" card with the market value of the `currency_accounts`
  pair when the plugin is on.

### 3.3 Accounts — Commodities tab (catalog and configuration only; price charts live in Holdings, plugins are switches with a trading-account picker — rounds 2–3)
`AccountsView` gains tabs `Accounts | Commodities` (PageHeader, like Reports).
Commodities tab: table of every commodity seen in the ledger (declared or not),
with name, precision, holders, latest price + date, and actions **New
commodity**, **Update price**, and per-row price history. Plugin banner (§2.9).
Cmd+K: `View Commodities`, `New Commodity`, `Update Price`.

### 3.4 Composer — "Commodity" disclosure
Third pre-disclosure beside Split and Repeat. Fields: **Buy / Sell / Exchange**,
quantity, commodity, unit price (in OC), fees (optional, to `Expenses:Fees` or
chosen), cash account, asset account. Rules:
- Asset account **holds** (has booking) → emits `{unit_price OC}` on buy. On
  sell: `NONE` → pre-fills the account's average cost `{avg OC} @ price`;
  other bookings → lot picker (date, units, cost) or "automatic" → `{} @ price`;
  adds the gain leg `Income:Gains` (default, editable) elided.
- Asset account **spends** (no booking) → emits `@ price` on both directions;
  no gain leg. Exchange = same, cash-to-cash.
- Unknown commodity → offer to declare it inline (name, precision).
- Live Beancount preview under the grid. Cmd+K: `New — Commodity (buy / sell / exchange)`.
Fast-input tokens (`100 PETR4 @ 33`) are **deferred**.

### 3.5 AccountModal — booking
For `Assets` accounts: toggle **"Holds assets to sell (track cost)"**. When on,
a Booking select: `NONE — average cost (Brazil)` (default), `FIFO`, `LIFO`,
`HIFO`, `STRICT`, with one line of help each. Off → no booking (spend account).
`Currencies` stays as is (optional restriction).

### 3.6 MCP
`add_transaction` passes the widened posting fields through unchanged; its cheap
balance guard already stands down on cost/price.

---

## 4. API contracts (frontend and backend build against these)

All `Decimal`s are strings. All endpoints that read entries accept `view_mode`
and the global filters, as today.

### 4.1 `GET /api/commodities`
```jsonc
{
  "operating_currency": "BRL",
  "plugins": {                       // present in options_map["plugin"]
    "implicit_prices": true, "coherent_cost": false,
    "check_average_cost": false, "currency_accounts": false
  },
  "currency_trading_account": "Equity:CurrencyTrading" | null,
  "commodities": [
    {
      "symbol": "PETR4",
      "declared": true,               // has a `commodity` directive
      "name": "Petrobras PN" | null,
      "precision": 2 | null,
      "metadata": { "asset-class": "equity" },   // other meta, stringified
      "is_operating": false,
      "holders": ["Assets:XP"],       // accounts with a non-zero position
      "latest_price": { "number": "40.00", "quote": "BRL", "date": "2026-06-01" } | null,
      "pairs": [ { "quote": "BRL", "count": 3 } ]
    }
  ]
}
```
Includes every commodity in `options_map["commodities"]`, declared or not.

### 4.2 `POST /api/commodities` → 201
Body `{ "symbol": "PETR4", "name"?: str, "precision"?: int, "metadata"?: {str:str}, "date"?: "YYYY-MM-DD" }`.
Writes a `commodity` directive via `FavaLedger.file.insert_entries`. 409 if
already declared. Response `{ "ok": true, "commodity": <row as in 4.1> }`.

### 4.3 `PUT /api/commodities`
Same body; rewrites name/precision/metadata of the existing directive. 404 if
not declared.

### 4.4 `GET /api/prices`
- No params → `{ "pairs": [ { "base": "PETR4", "quote": "BRL", "count": 3, "latest": { "date": "...", "number": "40.00" } } ] }`
- `?base=PETR4&quote=BRL` → `{ "base": "PETR4", "quote": "BRL", "prices": [ { "date": "...", "number": "..." } ] }` ascending by date, from `FavaLedger.prices(base, quote)`.

### 4.5 `POST /api/prices` → 201
Body `{ "date": "YYYY-MM-DD", "base": "USD", "number": "5.50", "quote": "BRL" }`.
Inserts a `price` directive. Response `{ "ok": true }`. 400 on bad input.

### 4.6 `GET /api/holdings?conversion=at_value`
```jsonc
{
  "operating_currency": "BRL",
  "conversion": "at_value",
  "positions": [
    {
      "account": "Assets:XP",
      "commodity": "PETR4",
      "booking": "NONE" | "FIFO" | "LIFO" | "HIFO" | "STRICT" | "STRICT_WITH_SIZE" | null,
      "held_at_cost": true,             // any position carries a cost
      "units": "150",
      "cost_currency": "BRL" | null,
      "cost_total": "5250.00" | null,
      "avg_cost": "35.00" | null,       // cost_total / units, in cost currency
      "price": { "number": "40.00", "quote": "BRL", "date": "2026-06-01" } | null,
      "price_age_days": 99 | null,
      "market_value": "6000.00" | null, // in OC; null when no conversion path
      "unrealized": "750.00" | null,    // market_value − cost_total in OC (held_at_cost only)
      "unrealized_pct": "14.29" | null,
      "weight_pct": "54.55" | null,     // market_value / totals.market_value
      "lots": [ { "date": "2026-02-01", "label": null, "units": "100", "cost": "33.00" } ] | null
                                        // null when booking is NONE (lots are not meaningful)
    }
  ],
  "totals": { "cost_total": "…", "market_value": "…", "unrealized": "…" },
  "fx_result": { "account": "Equity:CurrencyTrading", "market_value": "-500.00" } | null
}
```
Positions in the operating currency are excluded. Uses `convert.get_cost`,
Fava `FavaPriceMap` / `conversion.get_market_value`; nothing is computed by
hand except the average and the percentages.

### 4.7 `conversion` on existing reports
`conversion` ∈ `units | at_cost | at_value | <CURRENCY>`, default `at_value`, on
`/api/reports/net-worth`, `/income-statement`, `/balance-sheet`,
`/account-balance`, `/income-expense`. Delegates to
`fava.core.conversion.conversion_from_str` + `cost_or_value`.
- Balance Sheet response adds `"conversion": "...", "unrealized_gains": "650.00"`
  (`"0.00"` unless `at_value`). Under `at_value` the totals include converted
  positions and `total_assets == total_liabilities + total_equity + unrealized_gains`
  **must** hold (extend the invariant test). `other_totals` keeps only the
  unconvertible remainder.
- For an OC-only ledger every lens returns byte-identical numbers (regression
  guard for the user's current file).

### 4.8 Widened `PostingIn` (`POST/PUT /api/transactions`)
```jsonc
{ "account": "Assets:XP", "amount": -50, "currency": "PETR4",
  "cost": 35.00, "cost_currency": "BRL",        // per-unit (existing)
  "cost_total": 1750.00,                        // NEW: {{total}} — mutually exclusive with cost
  "cost_date": "2026-02-01", "cost_label": "lote-fev",   // NEW: lot identifiers
  "cost_empty": true,                           // NEW: emit `{}` (let booking decide)
  "price": 40.00, "price_currency": "BRL" }
```
Builder maps to `data.CostSpec(number_per, number_total, currency, date, label, merge=False)`;
`cost_empty` → `CostSpec(MISSING, None, MISSING, None, None, False)`. Validation:
`cost_empty` with any other cost field → 400; `cost` and `cost_total` together → 400.
Serialized postings (`GET /api/transactions`) already expose `cost`,
`cost_currency`, `cost_date`; add `cost_label`.

### 4.9 Booking on accounts
`AccountIn.booking: str | None`, `AccountUpdateIn.booking: str | None | "" ` (empty
string clears). Allowed: `STRICT, STRICT_WITH_SIZE, FIFO, LIFO, HIFO, NONE`; else 400.
Written as `data.Open(..., booking=data.Booking[booking])`. Response and
`GET /api/accounts` nodes gain `"booking": "NONE" | null`.

### 4.10 `GET /api/options`
Adds `"plugins": ["beancount.plugins.implicit_prices", …]` and `"commodities": ["BRL","USD",…]`.

---

## 5. Work streams and parallelism

Four agents, each in its own worktree branched from `feat/commodities`, merged
back by the coordinator. Shared frontend files (`types/index.ts`,
`api/client.ts`) are **pre-seeded** in the base commit with every type and
fetcher from §4, so agents only *use* them. `CommandPalette.tsx` entries are
appended by each frontend agent in its own clearly delimited block.

| Stream | Owns | Depends on |
|---|---|---|
| **BE-reads** | new `backend/routers/commodities.py` (4.1–4.6), `routers/reports.py` (4.7), `serializers.py` helpers, `main.py` router registration, `tests/test_commodities.py`, `tests/test_reports.py` | nothing |
| **BE-writes** | `routers/transactions.py` (4.8), `routers/accounts.py` (4.9, 4.10), `mcp_server.py` (3.6), `tests/test_routers.py`, `tests/test_mcp_server.py` | nothing |
| **FE-reads** | `FilterBar.tsx`, `appStore.ts` (conversion), `useFilterParams.ts`, `client.ts appendFilters`, `reports/BalanceSheet.tsx` (unrealised line), `reports/HoldingsTable.tsx` (new), `reports/ReportsView.tsx` (tab), `AccountsView.tsx` (tabs), `CommoditiesView.tsx` + `PriceModal.tsx` + `CommodityModal.tsx` (new), palette entries, CSS | contracts 4.1–4.7 (stubs OK until merge) |
| **FE-writes** | `Composer.tsx` (Commodity disclosure), `AccountModal.tsx` (booking), palette entry, CSS | contracts 4.6 (avg cost / lots), 4.8, 4.9 |

Integration (coordinator, after merge): run both suites, start the service on
`tests/fixtures/commodities.beancount`, walk every surface in the browser,
then a real "buy USD into Global" on a copy of the user's ledger.

## 6. Testing

- **Backend**: `tests/fixtures/commodities.beancount` already covers lots, FX,
  a non-monetary commodity and prices. Add a `NONE` account with two buys and
  one sale to it (average cost 35.00 case). Required: every 4.x endpoint has a
  test; Balance Sheet invariant under `at_cost` **and** `at_value`; OC-only
  fixture returns identical numbers under all lenses; widened posting
  round-trips through `printer.format_entry`; booking round-trips on `open`;
  MCP passthrough.
- **Frontend**: vitest for any new pure helper (average-cost prefill,
  Beancount preview string, price staleness). `tsc -b` has **2 pre-existing
  errors** (`Composer.tsx`, `reports/AccountBalanceChart.tsx`) — do not add to
  them.

## 7. Docs to update on landing

`features/commodities.md` §8 (what is now done), `backend/reports.md`
(conversion + invariant), `frontend/command-palette.md` (new entries),
`frontend/guidelines.md` (Composer Commodity disclosure), `pitfalls.md`
(NONE appends negative positions; `currency_accounts` is per-ledger),
`index.md`, `log.md`. Then archive this plan.

## 8. Out of scope (explicitly)

Fast-input commodity tokens · lot labels in the UI · automatic quotes
(`beanprice`) · corporate actions (splits, bonus shares) · tax computation ·
average cost across custodians · migrating existing BRL investment buckets.
