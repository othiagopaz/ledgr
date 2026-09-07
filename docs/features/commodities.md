---
type: feature
last_updated: 2026-09-07
---

# Commodities, lots and exchange

Everything that is not the operating currency: foreign cash, shares, gold, crypto, vacation days. Beancount models all of it with one mechanism — the **inventory of lots** — and Ledgr currently uses about a third of it. This page is the map: how the engine works, what Ledgr does with it today, and what is missing.

Read [`../principles/beancount-first.md`](../principles/beancount-first.md) first. Nothing on this page justifies writing custom accounting; almost every gap below closes by *calling* Beancount or Fava rather than by computing anything.

## 1. A balance is a bag of lots, not a number

An account's balance is a Beancount `Inventory`: a collection of `Position`, each one a pair of `units` and an optional `cost`.

```
Assets:Broker:PETR4 = (40 PETR4 {25.00 BRL, 2020-03-01},
                       30 PETR4 {30.00 BRL, 2020-04-01, "april-lot"})
```

That is not "70 PETR4". It is two lots with distinct identities, each carrying its own cost basis and acquisition date — which is what makes capital gains computable at all.

An inventory answers in three lenses, and the whole domain turns on which one a report picks:

| Lens | Beancount | Fava | On the example above |
|---|---|---|---|
| **units** | `convert.get_units` | `conversion.UNITS` | `70 PETR4` |
| **at cost** | `convert.get_cost` | `conversion.AT_COST` | `1900.00 BRL` |
| **at value** | `convert.get_value(price_map)` | `conversion.AT_VALUE` | `2450.00 BRL` (at 35.00 BRL) |

Inventories can be *mixed* (`is_mixed()` — positive and negative positions at once), and a commodity with no cost can go negative with no complaint at all: nothing stops `Assets:Vacation` reaching `-0.5 VACDAY`.

## 2. `{cost}` and `@ price` are not variants of each other

This is the distinction the whole feature rests on.

```beancount
; COST — store this number with the units, permanently
Assets:Broker:PETR4    100 PETR4 {20.00 BRL}

; PRICE — today's rate, used to close the entry and then discarded
Assets:Bank:USD       1000.00 USD @ 5.00 BRL
```

Cost is a label stitched into the garment: it travels with the units, survives time, and is what a tax return cites. Price is the receipt for that one day — it makes the transaction sum to zero and is then forgotten. The balance of `Assets:Bank:USD` is `1000.00 USD` flat, with no memory of the 5.00.

The consequence is asymmetric and decides how you model an asset:

- **Held at cost** → the gain is *realised*, explicitly, on disposal.
- **Held at price** → an FX gain is recorded nowhere. It simply does not exist in the books.

### The annotation vocabulary

All of these round-trip through `printer.format_entry`, so Ledgr's write path can emit any of them:

| Syntax | Meaning |
|---|---|
| `{20.00 BRL}` | cost per unit |
| `{{2500.00 BRL}}` / `{# 2500.00 BRL}` | **total** cost — Beancount divides it across the units |
| `{20.00 BRL, 2020-02-01}` | cost plus an explicit lot date |
| `{20.00 BRL, "april-lot"}` | cost plus a **label** you choose |
| `{}` | "work out the lot yourself" — invokes the booking method |
| `{2020-03-01}` / `{"april-lot"}` | reduce the lot identified by date or label |
| `{*}` | merge lots (average cost) — **rejected**: `"Cost merging is not supported yet"` |
| `@ 28.00 BRL` | unit price |
| `@@ 1100.00 BRL` | total price |
| `{20.00 BRL} @ 28.00 BRL` | a sale: cost *and* price, which is what produces the gain |

## 3. Booking — which lot did you sell?

When a reduction does not name a lot, something has to choose. That is the **booking method**, set globally with `option "booking_method"` or per account as the 5th field of `open`:

```beancount
2020-01-01 open Assets:Broker:PETR4  PETR4  "FIFO"
2020-01-01 open Assets:Vault:XAU     XAU    "HIFO"
```

Measured on one file (two lots — 10 X at 10.00 and 10 X at 12.00 — selling 5 at 12.00):

| Method | Outcome |
|---|---|
| `STRICT` (default) | error: `Ambiguous matches for "-5 X {}"` — you must say which |
| `STRICT_WITH_SIZE` | same, but resolves when the sale size matches exactly one lot |
| `FIFO` | takes the 10.00 lot → gain **−10.00 BRL** |
| `LIFO` | takes the 12.00 lot → gain **0** |
| `HIFO` | most expensive first → gain **0** (defers tax) |
| `NONE` | no lot tracking; you write the cost and it is taken as given. Nothing is interpolated, so an elided leg fails |
| `AVERAGE` | error: `"AVERAGE method is not supported"` — present in the enum, a `FIXME` in the code |

**The booking method changes the capital gain you declare.** It is a tax decision, not an implementation detail.

Two hard limits worth knowing before designing anything here:

- **There is no average cost in Beancount 3.2.0.** Neither `AVERAGE` booking nor `{*}` merging is implemented. Brazilian *custo médio ponderado* therefore has no engine support — it would be custom accounting, the second exception alongside the Cash Flow Statement. Decide that before building.
- **`option "booking_method"` is global.** A ledger mixing Brazilian shares (average cost) with US shares (FIFO/HIFO) needs the per-account field, not the option.

STRICT also refuses to sell what you do not hold: `Not enough lots to reduce "-15 X {20.00 BRL}": 10 X {20.00 BRL, 2020-01-02}`.

## 4. The gain is a residual, and it is interpolated

Beancount does not invent a gains account. It does something better: leave the leg empty and let the arithmetic close.

```beancount
2020-08-01 * "Sell 50 PETR4"
  Assets:Broker:PETR4    -50 PETR4 {20.00 BRL} @ 28.00 BRL   ; weight: -1000 BRL (cost!)
  Assets:Bank:Checking  1400.00 BRL
  Income:Gains                                                ; filled in: -400.00 BRL
```

The asset leg's weight is **units x cost**, not units x price — see `convert.get_weight`. The residual is the gain.

**The gain is denominated in the cost currency, not the operating currency.** Selling gold bought in USD realises a USD gain, and an account opened as `open Income:Gains BRL` rejects it outright (`Invalid currency USD for account 'Income:Gains'`). A gains account must be opened with no currency restriction; on the commodities fixture it legitimately ends up holding `(-150.00 USD, -660.00 BRL)`.

Only one leg per currency group may be elided.

## 5. Prices

```beancount
2020-12-31 price PETR4   35.00 BRL
2020-12-31 price USD      5.20 BRL
2020-12-31 price XAU   1900.00 USD
```

`prices.build_price_map()` builds a time series per pair and **derives the inverses for free** — declaring `USD → BRL 5.20` also yields `BRL → USD 0.19230…`. The API is `get_latest_price`, `get_price(pair, date)` (the rate *as of* a date, not merely the last one) and `get_all_prices`.

Conversion chains through the cost currency: `convert_position(1 XAU {1700.00 USD}, "BRL", pmap)` returns `9880.00 BRL` — XAU→USD at market (1900), then USD→BRL (5.20). It does **not** use the cost.

Fava's price layer is friendlier and is what Ledgr should reach for: `FavaPriceMap` counts price directions instead of merging inverses blindly, and `fava.core.conversion.get_market_value` falls back to the **cost** when no price exists, rather than returning bare units.

## 6. The hole that never closes: unrealised gains

Summing Assets + Liabilities + Equity after `summarize.cap_opt`, on a ledger holding shares, gold and foreign cash:

```
A + L + E  at cost          = ()               <- exactly zero
A + L + E  at market value  = 1590.0000 BRL    <- does NOT close
```

**Double-entry closes at historical cost. At market value it never does.** Those 1590 BRL are the unrealised gain, and they have no counterpart because nobody posted anything — the market moved and the books were not told.

Beancount 2 shipped `beancount.plugins.unrealized` to post that plug into an equity account. **It was removed in Beancount 3** — it is no longer in `beancount.plugins`. The modern answer is Fava's: post nothing, compute it at presentation time. That is precisely why Fava offers a conversion selector rather than writing entries into the file.

Related machinery, unused by Ledgr: `option "conversion_currency"` (default `NOTHING`) and `Equity:Conversions:Current`, which is how Beancount squares a multi-currency balance sheet.

## 7. Ecosystem plugins

All present in Beancount 3.2.0, none currently enabled in a Ledgr ledger:

| Plugin | What it does |
|---|---|
| `currency_accounts` | **Posts FX gains automatically.** Buy USD at 5.00, sell at 6.00 → `Equity:CurrencyTrading:BRL -1000.00 BRL` appears. The answer for assets held at price rather than at cost. Needs a config argument: `plugin "…" "Equity:CurrencyTrading"` |
| `implicit_prices` | Synthesises `price` directives from cost annotations — `10 X {100.00 BRL}` yields `2020-07-01 price X 100.00 BRL`. Your price history fills itself in |
| `coherent_cost` | Forbids mixing `{}` and `@` for one commodity — catches the classic "sold a lot without naming its basis" |
| `sellgains` | Cross-checks a declared gain against price x quantity |
| `check_commodity` | Requires a `commodity` directive for every commodity used |
| `onecommodity` | One commodity per account (`…:PETR4` holds only PETR4) |
| `check_average_cost` | Validates hand-computed average cost in a `NONE` account |
| `check_drained` | Inserts a zero `balance` when a balance-sheet account closes |
| `check_closing` | Asserts a zero position on a tagged closing trade (options) |
| `commodity_attr` | Requires named attributes on `commodity` directives, from an enum |
| `unique_prices` | One price per (date, pair) |
| `pedantic` | Enables all of the above pedantic checks at once |

The `commodity` directive itself carries arbitrary metadata. Beancount's own example uses `name:`, `export:` and `price: "USD:google/NYSEARCA:ITOT"` (a quote source); `asset-class:`, `ticker:` and `isin:` are equally valid.

## 8. What Ledgr does today

### Works, by inheritance

- **Reads correctly.** `serialize_inventory` in `backend/serializers.py` exposes `cost`, `cost_currency` and `cost_date` per position — no flattening of lots.
- **Shows the basis.** `frontend/src/components/AccountRegister.tsx` renders `{25.00 BRL}` and `@ 28.00 BRL`.
- **Writes any annotation.** `printer.format_entry` emits `{}`, `{# total}`, `{20.00 BRL, 2020-02-01, "label"}` and `{*}` correctly, so the write path needs widening, not new machinery.
- **Balance Sheet totals are cost-aware** — see §9.
- **The Cash Flow Statement already reasons about this.** `backend/cashflow.py` has a dedicated cross-currency residual branch for exactly the "buy shares priced in ITOT with a USD cash leg" shape.

### Missing

| Layer | Gap |
|---|---|
| **Reports — market value** | No conversion anywhere. `_compute_income_statement` and `_compute_net_worth` in `backend/routers/reports.py` sum the operating currency and drop everything else into an `other_currencies` bucket of raw units. **Fava already solves this and Ledgr does not call it**: `FavaLedger.prices`, `.commodities`, `.commodity_pairs`, `conversion_from_str("at_value")`, and `account_journal(filtered, account, conversion, …)` — which already takes the conversion as a parameter |
| **Reports — net worth** | `_compute_net_worth` skips any posting whose `units.currency` is not the OC. A share purchase drops net worth by the cash spent and it never comes back. `convert.get_weight` is the right primitive for a posting stream (it keeps the running sum double-entry consistent, and values an FX leg at its purchase rate) |
| **Write path** | `PostingIn` in `backend/routers/transactions.py` carries only `cost` / `cost_currency` / `price` / `price_currency`. No `cost_date`, no `cost_label`, no total cost, and no way to express `{}` — the builder requires both `cost` and `cost_currency`. So **a sale cannot name its lot**; only a fully-specified basis works |
| **Accounts** | `data.Open(meta, date, name, currencies, None)` — that last field is the booking method, hard-coded to `None`. No FIFO/HIFO account can be created from the UI |
| **Commodities** | Nothing. No endpoint, no screen. No way to declare a commodity, name it, or attach metadata |
| **Prices** | Nothing. No `/api/prices`, no quote import, no history |
| **UI** | `DraftPosting` in `frontend/src/types/index.ts` *has* `cost` / `price` fields and nothing populates them. `frontend/src/utils/fastInputParser.ts` has no cost or price token |
| **Unrealised gains** | Absent from the product as a concept |

### Suggested order

1. **Conversion selector on the reports** (`units` / at cost / at value / a currency), delegating to `fava.core.conversion` and `FavaLedger.prices`. Largest gain per line written, and entirely Beancount-first.
2. **Net worth via `convert.get_weight`** — small, and fixes a visibly wrong dashboard number.
3. **`/api/commodities` + `/api/prices`**, reads first.
4. **Widen `PostingIn`** with `cost_date`, `cost_label`, total cost and an explicit empty spec → sales that name their lot.
5. **Booking method on `open`** — one field in the account modal, the 5th argument of `data.Open`.
6. **Unrealised gain as a computed line** on the Balance Sheet, never a posted entry, in Fava's spirit.
7. **Recommended plugins** in the ledger: `implicit_prices` and `coherent_cost` are nearly free and prevent the two most common mistakes.

## 9. Balance Sheet at cost

`_compute_balance_sheet` reduces every section with `convert.get_cost` before splitting operating currency from the rest. This is not a presentation preference — it is the only basis on which the declared invariant holds:

- `100 ITOT {35.00 USD}` reduces to `3500.00 USD` and counts toward the USD total.
- `5 VACHR` has no cost and no price, so it stays in `other_totals` where it belongs.

Leaving the shares in `other_totals` strands their known USD cost outside the totals, and `total_assets == total_liabilities + total_equity` fails by exactly the cost of the position. That was the live behaviour until 2026-09-07 — see [`../pitfalls.md`](../pitfalls.md).

`get_cost` only touches positions that *have* a cost, so this is surgical: foreign cash and non-monetary commodities pass through unchanged.

Market value is deliberately **not** applied here. Per §6, at market value the equation cannot balance, which is why the at-value view belongs behind an explicit conversion selector (item 1 above) and not in the default totals.

## 10. Testing

`backend/tests/fixtures/commodities.beancount` exercises the domain end to end: `commodity` directives with metadata, per-account booking methods, per-unit and total cost, a labelled lot, reductions by cost / date / label / FIFO, gains in a non-operating currency, an FX purchase at price, a non-monetary commodity, and market prices. `TestHeldAtCostWrites::test_fixture_is_valid` asserts it loads with **zero** errors — a fixture that is quietly invalid teaches the wrong pattern, which is exactly what `multicurrency.beancount` did for a long time.

Covered by `TestHeldAtCostWrites` and `TestValidateBalanceUnits` in `backend/tests/test_routers.py`, and `TestBalanceError` in `backend/tests/test_mcp_server.py`:

- A purchase at cost, a sale with an explicit gain, a sale with an elided gain, a gain in the cost currency, and an FX purchase are all accepted and leave the ledger clean.
- A sale whose declared gain is genuinely wrong is still refused **and not written**.
- A cost posting does not switch the guard off wholesale — a purchase with the wrong cash amount is still caught.
- Total cost is spread over the units (`{{2500.00 BRL}}` on 100 units → 25.00 each).
- An unresolvable lot (`{}`, a bare date, a bare label, `{*}`) defers to the loader instead of guessing.
- A total cost on zero units defers rather than 500ing (Beancount divides the total by the units).

## Related

- [`../principles/beancount-first.md`](../principles/beancount-first.md) — why every gap above closes by delegating
- [`../backend/reports.md`](../backend/reports.md) — the Balance Sheet invariant
- [`../backend/cashflow.md`](../backend/cashflow.md) — the cross-currency residual branch
- [`../pitfalls.md`](../pitfalls.md) — the two incidents this page came out of
