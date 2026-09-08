"""Commodities, prices and holdings — the read side of the commodities feature.

Implements ``docs/plans/PLAN-commodities-ux.md`` §4.1–4.6:

* ``GET/POST/PUT /api/commodities`` — every commodity the ledger has seen,
  declared or not, with its ``commodity`` directive metadata, holders and
  latest price; declaring and editing directives.
* ``GET/POST /api/prices`` — pairs and history from ``FavaLedger.prices``;
  adding a ``price`` directive.
* ``GET /api/holdings`` — one row per (account, commodity) outside the
  operating currency, with cost basis, market value and unrealised gain.

Beancount and Fava do the accounting.  Lots come from ``realization``, cost
from ``beancount.core.convert.get_cost``, prices and market values from
``FavaPriceMap`` / ``fava.core.conversion.convert_position``.  The only
arithmetic Ledgr performs here is the weighted average cost
(``cost_total / units``), the percentages, and the unrealised residual
(``market_value - cost``) — none of which Beancount has a primitive for.

Writes go through ``FavaLedger.file`` (``insert_entries`` /
``save_entry_slice``) and reload the singleton, like every other router.
"""

from __future__ import annotations

import datetime
from pathlib import Path
import re
from decimal import Decimal, InvalidOperation
from typing import Any

from beancount.core import convert, data, realization
from beancount.core.amount import Amount
from beancount.core.position import Position
from beancount.parser import printer
from beancount.plugins.currency_accounts import DEFAULT_BASE_ACCOUNT
from fastapi import APIRouter, Depends, HTTPException, Query
from fava.beans.funcs import hash_entry
from fava.core import FavaLedger
from fava.core.conversion import convert_position
from fava.core.file import get_entry_slice
from pydantic import BaseModel

from ledger import get_filtered_entries, get_ledger, reload_ledger
from serializers import (
    CURRENCY_RE,
    collect_commodities,
    parse_conversion,
    quantize_display,
    report_currency,
)

router = APIRouter()

# The plugins the Commodities tab reports on (PLAN §2.9), keyed by the short
# name the frontend uses.
_PLUGINS: dict[str, str] = {
    "implicit_prices": "beancount.plugins.implicit_prices",
    "coherent_cost": "beancount.plugins.coherent_cost",
    "check_average_cost": "beancount.plugins.check_average_cost",
    "currency_accounts": "beancount.plugins.currency_accounts",
}

# Metadata keys that are not user metadata on a ``commodity`` directive.
_RESERVED_META = frozenset({"filename", "lineno", "name", "precision"})

# Beancount's metadata-key grammar (``beancount.parser.lexer``).
_META_KEY_RE = re.compile(r"^[a-z][a-zA-Z0-9\-_]*$")

_PCT = Decimal("0.01")


# ------------------------------------------------------------------
# Shared helpers
# ------------------------------------------------------------------


def _filter_kwargs(
    account: str | None,
    from_date: str | None,
    to_date: str | None,
    tags: list[str],
    payee: str | None,
) -> dict[str, Any]:
    return dict(
        account=account,
        from_date=datetime.date.fromisoformat(from_date) if from_date else None,
        to_date=datetime.date.fromisoformat(to_date) if to_date else None,
        tags=tags or None,
        payee=payee,
    )


def _active_plugins(ledger: FavaLedger) -> dict[str, str | None]:
    """``plugin`` lines as ``{module_name: config_or_None}``.

    Beancount 3 stores ``options_map["plugin"]`` as a list of
    ``(name, config)`` tuples; ``config`` is ``None`` when the line has no
    second argument.
    """
    active: dict[str, str | None] = {}
    for item in ledger.options.get("plugin", []) or []:
        if isinstance(item, (tuple, list)):
            name, config = item[0], (item[1] if len(item) > 1 else None)
        else:  # pragma: no cover — defensive for older shapes
            name, config = str(item), None
        active[name] = config
    return active


def _currency_trading_account(active: dict[str, str | None]) -> str | None:
    """Base account of ``currency_accounts`` when the plugin is on.

    The plugin falls back to its own ``DEFAULT_BASE_ACCOUNT`` when the config
    string is missing or blank — mirror that so the Holdings card points at
    the account Beancount will actually post to.
    """
    name = _PLUGINS["currency_accounts"]
    if name not in active:
        return None
    config = active[name]
    return config.strip() if config and config.strip() else DEFAULT_BASE_ACCOUNT


def _lens(conversion: str | None, ledger: FavaLedger) -> str:
    lens = parse_conversion(
        conversion, collect_commodities(ledger.all_entries, ledger.options)
    )
    if lens is None:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid conversion '{conversion}'. Use units, at_cost, "
                "at_value or a currency the ledger knows."
            ),
        )
    return lens


def _validate_currency(symbol: str | None, what: str = "symbol") -> str:
    if not symbol or not CURRENCY_RE.match(symbol):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid {what} '{symbol}': a commodity is 1–24 characters, "
                "starts with an uppercase letter and uses A-Z 0-9 ' . _ -"
            ),
        )
    return symbol


def _parse_date(value: str | None, default: datetime.date | None = None) -> datetime.date:
    if not value:
        if default is None:
            raise HTTPException(status_code=400, detail="date is required (YYYY-MM-DD)")
        return default
    try:
        return datetime.date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail=f"Invalid date '{value}': expected YYYY-MM-DD"
        ) from exc


def _price_point(price_point: tuple) -> dict[str, str] | None:
    """``FavaPriceMap.get_price_point`` result → ``{date, number}`` or None."""
    date, number = price_point
    if number is None or date is None:
        return None
    return {"date": date.isoformat(), "number": str(number)}


# ------------------------------------------------------------------
# Commodity rows (§4.1)
# ------------------------------------------------------------------


def _holders(entries: list) -> dict[str, set[str]]:
    """``commodity → accounts`` holding a non-zero position, from realization."""
    real_root = realization.realize(entries)
    holders: dict[str, set[str]] = {}
    for node in realization.iter_children(real_root):
        if not node.account:
            continue
        by_currency: dict[str, Decimal] = {}
        for pos in node.balance:
            c = pos.units.currency
            by_currency[c] = by_currency.get(c, Decimal(0)) + pos.units.number
        for c, number in by_currency.items():
            if number != 0:
                holders.setdefault(c, set()).add(node.account)
    return holders


def _commodity_row(
    symbol: str,
    directive: data.Commodity | None,
    ledger: FavaLedger,
    holders: dict[str, set[str]],
) -> dict[str, Any]:
    oc_list = ledger.options["operating_currency"]
    oc = oc_list[0]
    prices = ledger.prices

    pairs = [
        {"quote": q, "count": len(prices.get_all_prices((b, q)) or [])}
        for b, q in ledger.commodity_pairs()
        if b == symbol
    ]

    # Prefer the operating currency as quote; else the pair with most points.
    quote: str | None = None
    if symbol != oc and prices.get_all_prices((symbol, oc)):
        quote = oc
    elif pairs:
        quote = max(pairs, key=lambda p: p["count"])["quote"]
    latest: dict[str, str] | None = None
    if quote is not None:
        point = _price_point(prices.get_price_point((symbol, quote), None))
        if point is not None:
            latest = {"number": point["number"], "quote": quote, "date": point["date"]}

    meta = directive.meta if directive is not None else {}
    name = meta.get("name")
    return {
        "symbol": symbol,
        "declared": directive is not None,
        "name": str(name) if name else None,
        "precision": ledger.commodities.precisions.get(symbol),
        "metadata": {
            k: str(v) for k, v in meta.items() if k not in _RESERVED_META
        },
        "is_operating": symbol in oc_list,
        "holders": sorted(holders.get(symbol, ())),
        "latest_price": latest,
        "pairs": pairs,
    }


def _declared(ledger: FavaLedger) -> dict[str, data.Commodity]:
    return {c.currency: c for c in ledger.all_entries_by_type.Commodity}


def _commodity_rows(ledger: FavaLedger, entries: list) -> list[dict[str, Any]]:
    declared = _declared(ledger)
    holders = _holders(entries)
    symbols = collect_commodities(ledger.all_entries, ledger.options)
    return [
        _commodity_row(symbol, declared.get(symbol), ledger, holders)
        for symbol in sorted(symbols)
    ]


@router.get("/api/commodities")
def get_commodities(
    account: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    tags: list[str] = Query([]),
    payee: str | None = Query(None),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Every commodity seen in the ledger, declared or not (§4.1).

    The catalog itself is a fact about the ledger and ignores the filters;
    ``holders`` is computed on the filtered entries so it reflects the period
    and view mode the user is looking at.
    """
    entries = get_filtered_entries(
        ledger, view_mode, **_filter_kwargs(account, from_date, to_date, tags, payee)
    )
    active = _active_plugins(ledger)
    return {
        "operating_currency": ledger.options["operating_currency"][0],
        "plugins": {short: module in active for short, module in _PLUGINS.items()},
        "currency_trading_account": _currency_trading_account(active),
        "commodities": _commodity_rows(ledger, entries),
    }


# ------------------------------------------------------------------
# Declaring and editing commodities (§4.2, §4.3)
# ------------------------------------------------------------------


class CommodityIn(BaseModel):
    symbol: str
    name: str | None = None
    precision: int | None = None
    metadata: dict[str, str] | None = None
    date: str | None = None


def _validate_precision(precision: int | None) -> Decimal | None:
    if precision is None:
        return None
    if precision < 0 or precision > 18:
        raise HTTPException(
            status_code=400, detail="precision must be between 0 and 18"
        )
    # Beancount's printer accepts str/Decimal metadata, not int.
    return Decimal(precision)


def _validate_metadata(metadata: dict[str, str] | None) -> dict[str, str]:
    if not metadata:
        return {}
    for key in metadata:
        if key in _RESERVED_META:
            raise HTTPException(
                status_code=400,
                detail=f"'{key}' is set through its own field, not metadata",
            )
        if not _META_KEY_RE.match(key):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid metadata key '{key}': must start with a lowercase "
                    "letter and use letters, digits, '-' or '_'"
                ),
            )
    return {k: str(v) for k, v in metadata.items()}


def _row_after_write(ledger: FavaLedger, symbol: str) -> dict[str, Any]:
    declared = _declared(ledger)
    if symbol not in declared:
        raise HTTPException(
            status_code=500, detail="Commodity written but not found after reload"
        )
    return _commodity_row(symbol, declared[symbol], ledger, _holders(ledger.all_entries))


@router.post("/api/commodities", status_code=201)
def create_commodity(
    body: CommodityIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Declare a commodity — write a ``commodity`` directive (§4.2)."""
    symbol = _validate_currency(body.symbol)
    if symbol in _declared(ledger):
        raise HTTPException(
            status_code=409, detail=f"Commodity '{symbol}' is already declared"
        )
    precision = _validate_precision(body.precision)
    metadata = _validate_metadata(body.metadata)
    date = _parse_date(body.date, datetime.date.today())

    meta = data.new_metadata(str(ledger.beancount_file_path), 0)
    if body.name:
        meta["name"] = body.name
    if precision is not None:
        meta["precision"] = precision
    meta.update(metadata)

    ledger.file.insert_entries([data.Commodity(meta, date, symbol)])
    reload_ledger()
    return {"ok": True, "commodity": _row_after_write(ledger, symbol)}


@router.put("/api/commodities")
def update_commodity(
    body: CommodityIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Rewrite the name / precision / metadata of a declared commodity (§4.3).

    Fields left out of the body keep their current value; ``name: ""`` clears
    the name; a ``metadata`` object replaces the whole set of user metadata.
    """
    symbol = _validate_currency(body.symbol)
    existing = _declared(ledger).get(symbol)
    if existing is None:
        raise HTTPException(
            status_code=404, detail=f"Commodity '{symbol}' is not declared"
        )
    precision = _validate_precision(body.precision)
    metadata = _validate_metadata(body.metadata) if body.metadata is not None else None

    new_meta = dict(existing.meta)
    if body.name is not None:
        if body.name:
            new_meta["name"] = body.name
        else:
            new_meta.pop("name", None)
    if precision is not None:
        new_meta["precision"] = precision
    if metadata is not None:
        for key in list(new_meta):
            if key not in _RESERVED_META:
                del new_meta[key]
        new_meta.update(metadata)
    date = _parse_date(body.date, existing.date)

    updated = data.Commodity(new_meta, date, symbol)
    # The printer is the one writer that knows the directive grammar; it skips
    # filename/lineno itself.
    source = printer.format_entry(updated).rstrip("\n")
    _, sha = get_entry_slice(existing)
    ledger.file.save_entry_slice(hash_entry(existing), source, sha)
    reload_ledger()
    return {"ok": True, "commodity": _row_after_write(ledger, symbol)}


# ------------------------------------------------------------------
# Prices (§4.4, §4.5)
# ------------------------------------------------------------------


@router.get("/api/prices")
def get_prices(
    base: str | None = Query(None),
    quote: str | None = Query(None),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Price pairs, or the history of one pair (§4.4).

    Everything comes from ``FavaLedger.prices`` (a ``FavaPriceMap``), which
    already derives the inverse of every declared rate.  ``price`` directives
    carry no flag, so ``view_mode`` is accepted for contract uniformity and
    changes nothing.
    """
    prices = ledger.prices
    if (base is None) != (quote is None):
        raise HTTPException(
            status_code=400, detail="Pass both base and quote, or neither"
        )
    if base is not None and quote is not None:
        _validate_currency(base, "base")
        _validate_currency(quote, "quote")
        points = prices.get_all_prices((base, quote)) or []
        return {
            "base": base,
            "quote": quote,
            "prices": [
                {"date": d.isoformat(), "number": str(n)}
                for d, n in sorted(points, key=lambda p: p[0])
            ],
        }

    pairs = []
    for b, q in ledger.commodity_pairs():
        points = prices.get_all_prices((b, q)) or []
        latest = _price_point(prices.get_price_point((b, q), None))
        pairs.append({"base": b, "quote": q, "count": len(points), "latest": latest})
    return {"pairs": pairs}


class PriceIn(BaseModel):
    date: str | None = None
    base: str | None = None
    number: str | int | float | None = None
    quote: str | None = None


@router.post("/api/prices", status_code=201)
def create_price(
    body: PriceIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Insert a ``price`` directive (§4.5). 400 on any bad input."""
    date = _parse_date(body.date)
    base = _validate_currency(body.base, "base")
    quote = _validate_currency(body.quote, "quote")
    if base == quote:
        raise HTTPException(status_code=400, detail="base and quote must differ")
    if body.number is None:
        raise HTTPException(status_code=400, detail="number is required")
    try:
        number = Decimal(str(body.number))
    except InvalidOperation as exc:
        raise HTTPException(
            status_code=400, detail=f"Invalid number '{body.number}'"
        ) from exc
    if not number.is_finite() or number <= 0:
        raise HTTPException(status_code=400, detail="number must be positive")

    meta = data.new_metadata(str(ledger.beancount_file_path), 0)
    ledger.file.insert_entries([data.Price(meta, date, base, Amount(number, quote))])
    reload_ledger()
    return {"ok": True}


# ------------------------------------------------------------------
# Ledger plugins (PLAN §2.9)
# ------------------------------------------------------------------

# The plan (§2.6) names the FX pair `Equity:CurrencyTrading`; the plugin's own
# default is `Equity:CurrencyAccounts`, so the config is always written out.
CURRENCY_TRADING_ACCOUNT = "Equity:CurrencyTrading"

RECOMMENDED_PLUGINS: dict[str, str | None] = {
    "implicit_prices": None,
    "coherent_cost": None,
    "check_average_cost": None,
    "currency_accounts": CURRENCY_TRADING_ACCOUNT,
}


class PluginsIn(BaseModel):
    plugins: list[str]


def _plugin_line(name: str) -> str:
    config = RECOMMENDED_PLUGINS[name]
    line = f'plugin "beancount.plugins.{name}"'
    return f'{line} "{config}"' if config else line


@router.post("/api/plugins/enable")
def enable_plugins(
    body: PluginsIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Write the recommended ``plugin`` lines into the **top-level** file.

    Beancount ignores ``plugin`` directives in included files, so this always
    edits ``ledger.beancount_file_path`` through ``FavaLedger.file`` — the
    lines go right after the last ``option`` (or at the top when there is
    none), which is where Beancount and readers expect them. Idempotent:
    plugins already on are skipped. ``currency_accounts`` also needs its base
    account to exist; the matching ``open`` is inserted (dated at the earliest
    ``open`` in the ledger) when missing.
    """
    unknown = [n for n in body.plugins if n not in RECOMMENDED_PLUGINS]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown plugin(s): {', '.join(unknown)}. "
                   f"Allowed: {', '.join(RECOMMENDED_PLUGINS)}",
        )
    active = _active_plugins(ledger)
    to_add = [
        n for n in RECOMMENDED_PLUGINS
        if n in body.plugins and _PLUGINS[n] not in active
    ]

    if to_add:
        path = Path(ledger.beancount_file_path)
        source, sha = ledger.file.get_source(path)
        lines = source.split("\n")
        # After the last top-level `option` line, else after leading comments.
        insert_at = 0
        for i, line in enumerate(lines):
            if line.startswith("option "):
                insert_at = i + 1
        lines[insert_at:insert_at] = [_plugin_line(n) for n in to_add]
        ledger.file.set_source(path, "\n".join(lines), sha)

        if "currency_accounts" in to_add:
            base = CURRENCY_TRADING_ACCOUNT
            opens = ledger.all_entries_by_type.Open
            if base not in {o.account for o in opens}:
                earliest = min((o.date for o in opens), default=datetime.date.today())
                meta = data.new_metadata(str(path), 0)
                ledger.file.insert_entries([data.Open(meta, earliest, base, [], None)])
        reload_ledger()
        ledger = get_ledger()

    active = _active_plugins(ledger)
    return {
        "ok": True,
        "plugins": {n: _PLUGINS[n] in active for n in RECOMMENDED_PLUGINS},
        "currency_trading_account": _currency_trading_account(active),
        "added": to_add,
    }


# ------------------------------------------------------------------
# Holdings (§4.6)
# ------------------------------------------------------------------


def _amount_in(
    pos: Any, target: str, prices: Any, date: datetime.date | None
) -> Decimal | None:
    """Market value of one position in ``target`` via Fava, or None if no path."""
    valued = convert_position(pos, target, prices, date)
    return valued.number if valued.currency == target else None


def _sum_in(
    positions: list, target: str, prices: Any, date: datetime.date | None
) -> Decimal | None:
    """Market value of several positions in ``target``; None if any lacks a path."""
    total = Decimal(0)
    for pos in positions:
        value = _amount_in(pos, target, prices, date)
        if value is None:
            return None
        total += value
    return total


def _pct(part: Decimal | None, whole: Decimal | None) -> str | None:
    if part is None or not whole:
        return None
    return str((part / whole * 100).quantize(_PCT))


def _holding_rows(
    ledger: FavaLedger,
    entries: list,
    target: str,
    as_of: datetime.date | None,
) -> list[dict[str, Any]]:
    """One row per (account, commodity) outside the operating currency.

    Only balance-sheet accounts (Assets and Liabilities) are holdings; a USD
    gain sitting in ``Income:Gains`` is a flow, not a position.
    """
    oc = ledger.options["operating_currency"][0]
    prices = ledger.prices
    precisions = ledger.format_decimal.precisions
    roots = (ledger.options["name_assets"], ledger.options["name_liabilities"])
    opens = {o.account: o for o in ledger.all_entries_by_type.Open}
    age_ref = as_of or datetime.date.today()

    real_root = realization.realize(entries)
    rows: list[dict[str, Any]] = []
    for node in realization.iter_children(real_root):
        if not node.account or node.account.split(":")[0] not in roots:
            continue
        by_commodity: dict[str, list] = {}
        for pos in node.balance:
            if pos.units.currency != oc:
                by_commodity.setdefault(pos.units.currency, []).append(pos)

        open_entry = opens.get(node.account)
        booking = (
            open_entry.booking.name
            if open_entry is not None and open_entry.booking is not None
            else None
        )

        for commodity in sorted(by_commodity):
            group = by_commodity[commodity]
            units = sum((pos.units.number for pos in group), Decimal(0))
            if units == 0:
                continue

            cost_positions = [pos for pos in group if pos.cost is not None]
            held_at_cost = bool(cost_positions)
            cost_currency = cost_positions[0].cost.currency if held_at_cost else None
            cost_total = (
                sum((convert.get_cost(pos).number for pos in cost_positions), Decimal(0))
                if held_at_cost
                else None
            )
            avg_cost = (
                quantize_display(cost_total / units, cost_currency, precisions)
                if cost_total is not None
                else None
            )

            quote = cost_currency if held_at_cost else target
            point = _price_point(prices.get_price_point((commodity, quote), as_of))
            price = (
                {"number": point["number"], "quote": quote, "date": point["date"]}
                if point is not None
                else None
            )
            price_age_days = (
                (age_ref - datetime.date.fromisoformat(point["date"])).days
                if point is not None
                else None
            )

            market_raw = _sum_in(group, target, prices, as_of)
            market_value = (
                quantize_display(market_raw, target, precisions)
                if market_raw is not None
                else None
            )

            # Cost carried into the target currency, so the unrealised gain
            # compares like with like (gold bought in USD, reported in BRL).
            cost_in_target: Decimal | None = None
            if cost_total is not None:
                raw = _amount_in(
                    Position(Amount(cost_total, cost_currency), None),
                    target, prices, as_of,
                )
                if raw is not None:
                    cost_in_target = quantize_display(raw, target, precisions)

            unrealized = (
                market_value - cost_in_target
                if market_value is not None and cost_in_target is not None
                else None
            )

            lots: list[dict[str, Any]] | None = None
            if held_at_cost and booking != "NONE":
                lots = sorted(
                    (
                        {
                            "date": pos.cost.date.isoformat() if pos.cost.date else None,
                            "label": pos.cost.label,
                            "units": str(pos.units.number),
                            "cost": str(pos.cost.number),
                        }
                        for pos in cost_positions
                    ),
                    key=lambda lot: (lot["date"] or "", lot["label"] or ""),
                )

            rows.append(
                {
                    "account": node.account,
                    "commodity": commodity,
                    "booking": booking,
                    "held_at_cost": held_at_cost,
                    "units": str(units),
                    "cost_currency": cost_currency,
                    "cost_total": str(quantize_display(cost_total, cost_currency, precisions)) if cost_total is not None else None,
                    "avg_cost": str(avg_cost) if avg_cost is not None else None,
                    "price": price,
                    "price_age_days": price_age_days,
                    "market_value": str(market_value) if market_value is not None else None,
                    "unrealized": str(unrealized) if unrealized is not None else None,
                    "unrealized_pct": _pct(unrealized, cost_in_target),
                    "weight_pct": None,  # filled once the total is known
                    "lots": lots,
                    "_cost_in_target": cost_in_target,
                    "_market_value": market_value,
                    "_unrealized": unrealized,
                }
            )
    return rows


@router.get("/api/holdings")
def get_holdings(
    account: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    tags: list[str] = Query([]),
    payee: str | None = Query(None),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined)$"),
    conversion: str = Query("at_value"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Positions outside the operating currency, valued at market (§4.6).

    The table always shows units, cost and market value side by side, so the
    three lenses produce the same rows; ``conversion`` is validated and
    echoed, and a currency code changes the currency market values and the
    totals are stated in.  Prices are looked up as of ``to_date`` when given
    (the report's point in time), else the latest in the file.
    """
    oc = ledger.options["operating_currency"][0]
    lens = _lens(conversion, ledger)
    target = report_currency(lens, oc)
    fkw = _filter_kwargs(account, from_date, to_date, tags, payee)
    entries = get_filtered_entries(ledger, view_mode, **fkw)
    as_of = fkw["to_date"]
    precisions = ledger.format_decimal.precisions

    rows = _holding_rows(ledger, entries, target, as_of)

    total_cost = sum(
        (r["_cost_in_target"] for r in rows if r["_cost_in_target"] is not None),
        Decimal(0),
    )
    total_market = sum(
        (r["_market_value"] for r in rows if r["_market_value"] is not None),
        Decimal(0),
    )
    total_unrealized = sum(
        (r["_unrealized"] for r in rows if r["_unrealized"] is not None),
        Decimal(0),
    )
    for r in rows:
        r["weight_pct"] = _pct(r["_market_value"], total_market)
        del r["_cost_in_target"], r["_market_value"], r["_unrealized"]

    fx_result = None
    trading = _currency_trading_account(_active_plugins(ledger))
    if trading is not None:
        real_root = realization.realize(entries)
        node = realization.get(real_root, trading)
        value = Decimal(0)
        if node is not None:
            for pos in realization.compute_balance(node):
                amount = _amount_in(pos, target, ledger.prices, as_of)
                if amount is not None:
                    value += amount
        fx_result = {
            "account": trading,
            "market_value": str(quantize_display(value, target, precisions)),
        }

    return {
        "operating_currency": oc,
        "conversion": lens,
        "positions": rows,
        "totals": {
            "cost_total": str(quantize_display(total_cost, target, precisions)),
            "market_value": str(quantize_display(total_market, target, precisions)),
            "unrealized": str(quantize_display(total_unrealized, target, precisions)),
        },
        "fx_result": fx_result,
    }
