"""Report endpoints — Income Statement, Balance Sheet, and time series.

Uses ``clamp_opt`` / ``cap_opt`` for correct accounting as required by
AGENTS.md §8.  Delegates to ``serializers.py`` for type conversion.

Every report accepts a ``conversion`` lens (``units`` / ``at_cost`` /
``at_value`` / a currency code, default ``at_value``) — see
``docs/plans/PLAN-commodities-ux.md`` §4.7.  The valuation itself is Fava's
(``fava.core.conversion``); this module only decides *which* inventory to
hand it and *when* (which date) to value it.
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Any

from beancount.core import data, realization
from beancount.ops import summarize
from fastapi import APIRouter, Depends, HTTPException, Query
from fava.beans.prices import FavaPriceMap
from fava.core import FavaLedger
from fava.core.inventory import CounterInventory

from cashflow import date_to_period
from ledger import get_filtered_entries, get_ledger
from serializers import (
    CONVERSION_LENSES,
    attach_other_currencies_to_balance_tree,
    attach_other_currencies_to_report_tree,
    build_balance_tree,
    build_report_tree,
    collect_commodities,
    convert_inventory,
    decimal_to_report_number,
    format_other_balances,
    parse_conversion,
    quantize_display,
    report_currency,
)

router = APIRouter()


# ------------------------------------------------------------------
# Conversion helpers
# ------------------------------------------------------------------


def _lens(conversion: str | None, ledger: FavaLedger) -> str:
    """Validate the ``conversion`` query parameter or answer 400."""
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


def _period_end(period: str, interval: str) -> datetime.date:
    """Last calendar day of a ``date_to_period`` string.

    Balances are *valued* at the end of the period they are reported for —
    the same convention Fava's interval balances use — so a month-end price
    directive applies to that month even when the last transaction happened
    on the 3rd.
    """
    if interval == "quarterly":
        year_s, quarter = period.split("-Q")
        year, month = int(year_s), int(quarter) * 3
    elif interval == "yearly":
        year, month = int(period), 12
    else:
        year_s, month_s = period.split("-")
        year, month = int(year_s), int(month_s)
    if month == 12:
        return datetime.date(year, 12, 31)
    return datetime.date(year, month + 1, 1) - datetime.timedelta(days=1)


def _prices_or_empty(prices: FavaPriceMap | None) -> FavaPriceMap:
    return prices if prices is not None else FavaPriceMap([])


# ------------------------------------------------------------------
# Helpers — extracted computation logic for comparative mode
# ------------------------------------------------------------------


def _compute_income_expense(
    entries: list,
    interval: str,
    oc: str,
    conversion: str = "units",
    prices: FavaPriceMap | None = None,
) -> list[dict]:
    """Income vs expense per period, valued at each period's end."""
    prices = _prices_or_empty(prices)
    rc = report_currency(conversion, oc)
    txns = [e for e in entries if isinstance(e, data.Transaction)]
    buckets: dict[str, dict[str, CounterInventory]] = {}

    for txn in txns:
        period = date_to_period(txn.date, interval)
        if period not in buckets:
            buckets[period] = {
                "income": CounterInventory(),
                "expenses": CounterInventory(),
            }
        for p in txn.postings:
            if p.units is None:
                continue
            acct_type = p.account.split(":")[0]
            if acct_type == "Income":
                buckets[period]["income"].add_position(p)
            elif acct_type == "Expenses":
                buckets[period]["expenses"].add_position(p)

    series = []
    for period in sorted(buckets):
        end = _period_end(period, interval)
        income = convert_inventory(
            buckets[period]["income"], conversion, prices, end, oc
        ).get(rc, Decimal(0))
        expenses = convert_inventory(
            buckets[period]["expenses"], conversion, prices, end, oc
        ).get(rc, Decimal(0))
        series.append(
            {
                "period": period,
                "income": decimal_to_report_number(-income),
                "expenses": decimal_to_report_number(expenses),
            }
        )
    return series


def _child_bucket(posting_account: str, parent: str) -> str:
    """Map a descendant account to its **immediate** child-of-parent bucket.

    ``Assets:Investments:Personnalite:Float`` under parent
    ``Assets:Investments`` buckets into ``Assets:Investments:Personnalite`` —
    grandchildren aggregate into the one-level-down child, keeping the chart
    legible.  Drill deeper by selecting that child.
    """
    rest = posting_account[len(parent) + 1:]
    return f"{parent}:{rest.split(':')[0]}"


def _value_snapshot(
    inv: CounterInventory,
    legacy_units: Decimal,
    conversion: str,
    prices: FavaPriceMap,
    end: datetime.date,
    oc: str,
) -> Decimal:
    """Value one account's running inventory for a period.

    Under ``units`` the account-balance chart keeps its historical behaviour —
    the plain sum of every posting's ``units.number`` on that account — so a
    single-commodity account (``Assets:Broker:PETR4``) charts its share count.
    Under any other lens the inventory is valued by Fava at the period end and
    the reporting-currency amount is charted.
    """
    if conversion == "units":
        return legacy_units
    return convert_inventory(inv, conversion, prices, end, oc).get(
        report_currency(conversion, oc), Decimal(0)
    )


def _compute_account_balance(
    entries: list,
    account: str,
    interval: str,
    conversion: str = "units",
    prices: FavaPriceMap | None = None,
    oc: str = "",
) -> list[dict]:
    prices = _prices_or_empty(prices)
    txns = sorted(
        [e for e in entries if isinstance(e, data.Transaction)],
        key=lambda t: t.date,
    )

    running = CounterInventory()
    legacy = Decimal(0)
    period_state: dict[str, tuple[CounterInventory, Decimal]] = {}

    for txn in txns:
        for p in txn.postings:
            if p.account == account and p.units is not None:
                running.add_position(p)
                legacy += p.units.number
        period = date_to_period(txn.date, interval)
        period_state[period] = (CounterInventory(running), legacy)

    return [
        {
            "period": period,
            "balance": decimal_to_report_number(
                _value_snapshot(
                    inv, units, conversion, prices, _period_end(period, interval), oc
                )
            ),
        }
        for period, (inv, units) in sorted(period_state.items())
    ]


def _compute_account_balance_consolidated(
    entries: list,
    account: str,
    interval: str,
    conversion: str = "units",
    prices: FavaPriceMap | None = None,
    oc: str = "",
) -> dict[str, Any]:
    """Consolidated balance of a parent account plus a series per child.

    Used when ``account`` has **no postings of its own** but has descendants —
    a pure grouping node like ``Assets:Investments``.  Matching it exactly
    (as ``_compute_account_balance`` does) yields a flat zero line, which is
    accurate but useless; the balance a reader wants is the roll-up of its
    children.

    ``consolidated`` is the running sum of every descendant.  ``children`` holds
    one running series per immediate child (grandchildren aggregated into it,
    see ``_child_bucket``), so the chart can plot composition against the total.
    Children are ordered by descending final absolute balance — the largest
    component first, which is the reading order that matters.

    Returns ``{"series": [...], "children": [{"account", "name", "series"}]}``.
    """
    prices = _prices_or_empty(prices)
    prefix = account + ":"
    txns = sorted(
        [e for e in entries if isinstance(e, data.Transaction)],
        key=lambda t: t.date,
    )

    total_inv = CounterInventory()
    total_units = Decimal(0)
    child_inv: dict[str, CounterInventory] = {}
    child_units: dict[str, Decimal] = {}
    # period → snapshot of (total, {child: balance}) — valued lazily below
    period_total: dict[str, tuple[CounterInventory, Decimal]] = {}
    period_children: dict[str, dict[str, tuple[CounterInventory, Decimal]]] = {}

    for txn in txns:
        for p in txn.postings:
            if p.units is None or not p.account.startswith(prefix):
                continue
            total_inv.add_position(p)
            total_units += p.units.number
            bucket = _child_bucket(p.account, account)
            child_inv.setdefault(bucket, CounterInventory()).add_position(p)
            child_units[bucket] = child_units.get(bucket, Decimal(0)) + p.units.number
        period = date_to_period(txn.date, interval)
        period_total[period] = (CounterInventory(total_inv), total_units)
        period_children[period] = {
            c: (CounterInventory(inv), child_units[c]) for c, inv in child_inv.items()
        }

    periods = sorted(period_total)
    ends = {p: _period_end(p, interval) for p in periods}

    def _val(state: tuple[CounterInventory, Decimal], period: str) -> Decimal:
        return _value_snapshot(state[0], state[1], conversion, prices, ends[period], oc)

    series = [
        {"period": p, "balance": decimal_to_report_number(_val(period_total[p], p))}
        for p in periods
    ]

    valued_children: dict[str, dict[str, Decimal]] = {
        c: {
            p: _val(period_children[p][c], p) if c in period_children[p] else Decimal(0)
            for p in periods
        }
        for c in child_inv
    }

    # Drop children that are zero across every period — an account opened but
    # never moved would otherwise add a flat line at zero.
    contributing = [
        c for c in valued_children
        if any(decimal_to_report_number(v) != 0 for v in valued_children[c].values())
    ]
    last = periods[-1] if periods else None
    contributing.sort(
        key=lambda c: -abs(valued_children[c][last]) if last else Decimal(0)
    )

    children = [
        {
            "account": c,
            "name": c[len(prefix):],
            "series": [
                {"period": p, "balance": decimal_to_report_number(valued_children[c][p])}
                for p in periods
            ],
        }
        for c in contributing
    ]

    return {"series": series, "children": children}


def _has_own_postings(entries: list, account: str) -> bool:
    """True if any transaction posts directly to ``account`` itself."""
    return any(
        p.account == account
        for e in entries
        if isinstance(e, data.Transaction)
        for p in e.postings
        if p.units is not None
    )


def _has_descendants(entries: list, account: str) -> bool:
    """True if any transaction posts to a descendant of ``account``."""
    prefix = account + ":"
    return any(
        p.account.startswith(prefix)
        for e in entries
        if isinstance(e, data.Transaction)
        for p in e.postings
        if p.units is not None
    )


def _compute_net_worth(
    entries: list,
    interval: str,
    oc: str,
    conversion: str = "units",
    prices: FavaPriceMap | None = None,
) -> list[dict]:
    """Assets, liabilities and net worth at each period end.

    Why period-end inventories rather than ``convert.get_weight`` on the
    posting stream: a weight fixes every position at the rate of the day it
    was acquired, so under ``at_value`` a share bought at 33 and quoted at 40
    would still chart at 33 forever — a *cost* series wearing a market-value
    label.  Keeping a running ``CounterInventory`` of every Assets and
    Liabilities posting (lots and all) and handing it to Fava's conversion at
    each period end is both the Beancount-first choice (the only arithmetic
    here is ``add_position``) and the one that lets a later price directive
    move the line.

    Consequences per lens:

    * ``units`` — only operating-currency positions count, exactly the
      historical behaviour: buying shares makes net worth drop by the cash.
    * ``at_cost`` — the shares come back at their cost; a purchase is flat.
    * ``at_value`` — valued at the period-end price (cost when there is
      none), then anything left in another currency is carried to the OC.
    """
    prices = _prices_or_empty(prices)
    rc = report_currency(conversion, oc)
    txns = sorted(
        [e for e in entries if isinstance(e, data.Transaction)],
        key=lambda t: t.date,
    )

    assets = CounterInventory()
    liabilities = CounterInventory()
    snapshots: dict[str, tuple[CounterInventory, CounterInventory]] = {}

    for txn in txns:
        for p in txn.postings:
            if p.units is None:
                continue
            acct_type = p.account.split(":")[0]
            if acct_type == "Assets":
                assets.add_position(p)
            elif acct_type == "Liabilities":
                liabilities.add_position(p)
        period = date_to_period(txn.date, interval)
        snapshots[period] = (CounterInventory(assets), CounterInventory(liabilities))

    result = []
    for period, (a_inv, l_inv) in sorted(snapshots.items()):
        end = _period_end(period, interval)
        a = convert_inventory(a_inv, conversion, prices, end, oc).get(rc, Decimal(0))
        l = convert_inventory(l_inv, conversion, prices, end, oc).get(rc, Decimal(0))
        result.append(
            {
                "period": period,
                "assets": decimal_to_report_number(a),
                "liabilities": decimal_to_report_number(l),
                "net_worth": decimal_to_report_number(a + l),
            }
        )
    return result


def _compute_income_statement(
    entries: list,
    interval: str,
    oc: str,
    conversion: str = "units",
    prices: FavaPriceMap | None = None,
) -> dict[str, Any]:
    """Income statement tree; each (account, period) valued at the period end.

    Flows are aggregated per account and period first and valued once, at the
    end of that period — Fava's interval convention.  Whatever the lens cannot
    bring into the reporting currency stays in ``other_totals``.
    """
    prices = _prices_or_empty(prices)
    rc = report_currency(conversion, oc)
    txns = [e for e in entries if isinstance(e, data.Transaction)]
    flows: dict[str, dict[str, CounterInventory]] = {}
    periods_set: set[str] = set()

    for txn in txns:
        period = date_to_period(txn.date, interval)
        periods_set.add(period)
        for p in txn.postings:
            if p.units is None:
                continue
            acct_type = p.account.split(":")[0]
            if acct_type not in ("Income", "Expenses"):
                continue
            flows.setdefault(p.account, {}).setdefault(
                period, CounterInventory()
            ).add_position(p)

    periods = sorted(periods_set)

    account_period: dict[str, dict[str, Decimal]] = {}
    account_period_other: dict[str, dict[str, dict[str, Decimal]]] = {}
    for acct, by_period in flows.items():
        for period, inv in by_period.items():
            valued = convert_inventory(inv, conversion, prices, _period_end(period, interval), oc)
            account_period.setdefault(acct, {})[period] = valued.pop(rc, Decimal(0))
            for curr, val in valued.items():
                account_period_other.setdefault(acct, {}).setdefault(period, {})[curr] = val

    all_accts = set(account_period.keys()) | set(account_period_other.keys())

    def _build_tree(root_type: str, negate: bool = False) -> list[dict]:
        accts = {a for a in all_accts if a.startswith(root_type + ":")}
        if root_type in all_accts:
            accts.add(root_type)
        return build_report_tree(accts, account_period, periods, negate)

    income_tree = _build_tree("Income", negate=True)
    expenses_tree = _build_tree("Expenses", negate=False)

    attach_other_currencies_to_report_tree(
        income_tree, account_period_other, periods, negate=True,
    )
    attach_other_currencies_to_report_tree(
        expenses_tree, account_period_other, periods, negate=False,
    )

    net_income: dict[str, float] = {}
    for period in periods:
        inc = sum(
            float(-account_period[a].get(period, Decimal(0)))
            for a in account_period
            if a.startswith("Income")
        )
        exp = sum(
            float(account_period[a].get(period, Decimal(0)))
            for a in account_period
            if a.startswith("Expenses")
        )
        net_income[period] = round(inc - exp, 2)

    other_net_agg: dict[str, Decimal] = {}
    for acct, periods_data in account_period_other.items():
        sign = -1 if acct.startswith("Income") else 1
        for _period, curr_data in periods_data.items():
            for curr, val in curr_data.items():
                other_net_agg[curr] = other_net_agg.get(curr, Decimal(0)) + val * sign
    other_net_income = format_other_balances(other_net_agg)

    return {
        "income": income_tree,
        "expenses": expenses_tree,
        "periods": periods,
        "net_income": net_income,
        "operating_currency": oc,
        "other_net_income": other_net_income,
        "conversion": conversion,
    }


def _compute_balance_sheet(
    entries: list,
    options,
    oc: str,
    conversion: str = "at_cost",
    prices: FavaPriceMap | None = None,
    date: datetime.date | None = None,
    precisions: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Balance sheet under a conversion lens.

    ``at_cost`` (the function default, and the historical report) collapses
    every held-at-cost position into its cost before splitting the operating
    currency from the rest.  That is the only basis on which
    ``total_assets == total_liabilities + total_equity`` holds by itself:
    ``100 ITOT {35.00 USD}`` reduces to ``3500.00 USD``, whereas its *units*
    are ITOT — a currency the OC total skips, so the 3500 USD paid for it
    would silently leave the equation.

    ``at_value`` values every position at market (Fava's ``AT_VALUE``, with
    the remainder carried to the OC).  At market the books do **not** close:
    the market moved and nobody posted anything.  The gap is exactly the
    unrealised gain and is reported as ``unrealized_gains`` — a computed line
    in Fava's spirit (its ``Tree.cap`` does the same), never a written entry.
    With Beancount's signs (credits negative) the invariant becomes
    ``assets + liabilities + equity == unrealized_gains``; in the positive
    convention the frontend renders, ``A == L + E + unrealised``.

    A currency lens (``conversion=USD``) is market valuation too — Fava
    converts every position at the latest rate — so the same residual is
    reported there, stated in that currency.  ``unrealized_gains`` is
    ``"0.00"`` under the two remaining lenses: at cost the books close on
    their own, and under ``units`` the sheet is not meant to add up at all.
    """
    prices = _prices_or_empty(prices)
    rc = report_currency(conversion, oc)
    closed = summarize.cap_opt(entries, options)
    real_root = realization.realize(closed)

    def _convert(bal) -> dict[str, Decimal]:
        return convert_inventory(bal, conversion, prices, date, oc)

    def _build_section(root_type: str, negate: bool = False) -> tuple[list[dict], dict[str, dict[str, Decimal]]]:
        node = realization.get(real_root, root_type)
        if node is None:
            return [], {}
        account_balance: dict[str, Decimal] = {}
        account_balance_other: dict[str, dict[str, Decimal]] = {}
        for child in realization.iter_children(node):
            if child.account:
                for curr, number in _convert(child.balance).items():
                    if curr == rc:
                        account_balance[child.account] = (
                            account_balance.get(child.account, Decimal(0)) + number
                        )
                    else:
                        other = account_balance_other.setdefault(child.account, {})
                        other[curr] = other.get(curr, Decimal(0)) + number
        all_accts = set(account_balance.keys()) | set(account_balance_other.keys())
        tree = build_balance_tree(all_accts, account_balance, negate)
        attach_other_currencies_to_balance_tree(tree, account_balance_other, negate)
        return tree, account_balance_other

    def _section_total(root_type: str) -> Decimal:
        node = realization.get(real_root, root_type)
        if node is None:
            return Decimal(0)
        return _convert(realization.compute_balance(node)).get(rc, Decimal(0))

    def _section_other_total(root_type: str) -> list[dict[str, Any]]:
        node = realization.get(real_root, root_type)
        if node is None:
            return []
        by_curr = {
            c: n for c, n in _convert(realization.compute_balance(node)).items()
            if c != rc
        }
        return format_other_balances(by_curr)

    assets_tree, _ = _build_section("Assets")
    liab_tree, _ = _build_section("Liabilities")
    equity_tree, _ = _build_section("Equity")

    total_assets = _section_total("Assets")
    total_liabilities = _section_total("Liabilities")
    total_equity = _section_total("Equity")

    unrealized = Decimal(0)
    if conversion == "at_value" or conversion not in CONVERSION_LENSES:
        unrealized = total_assets + total_liabilities + total_equity

    return {
        "assets": assets_tree,
        "liabilities": liab_tree,
        "equity": equity_tree,
        "totals": {
            "assets": decimal_to_report_number(total_assets),
            "liabilities": decimal_to_report_number(total_liabilities),
            "equity": decimal_to_report_number(total_equity),
        },
        "operating_currency": oc,
        "other_totals": {
            "assets": _section_other_total("Assets"),
            "liabilities": _section_other_total("Liabilities"),
            "equity": _section_other_total("Equity"),
        },
        "conversion": conversion,
        "unrealized_gains": str(quantize_display(unrealized, rc, precisions)),
    }


# ------------------------------------------------------------------
# Time series
# ------------------------------------------------------------------


@router.get("/api/reports/income-expense")
def get_income_expense(
    account: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    tags: list[str] = Query([]),
    payee: str | None = Query(None),
    interval: str = Query("monthly"),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined|comparative)$"),
    conversion: str = Query("at_value"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Monthly/quarterly/yearly income vs expense totals."""
    oc = ledger.options["operating_currency"][0]
    lens = _lens(conversion, ledger)
    fkw = dict(
        account=account,
        from_date=datetime.date.fromisoformat(from_date) if from_date else None,
        to_date=datetime.date.fromisoformat(to_date) if to_date else None,
        tags=tags or None,
        payee=payee,
    )
    ckw = dict(conversion=lens, prices=ledger.prices)
    if view_mode == "comparative":
        return {
            "series": _compute_income_expense(
                get_filtered_entries(ledger, "actual", **fkw), interval, oc, **ckw
            ),
            "planned_series": _compute_income_expense(
                get_filtered_entries(ledger, "planned", **fkw), interval, oc, **ckw
            ),
        }
    entries = get_filtered_entries(ledger, view_mode, **fkw)
    return {"series": _compute_income_expense(entries, interval, oc, **ckw)}


@router.get("/api/reports/account-balance")
def get_account_balance(
    account: str = Query(...),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    tags: list[str] = Query([]),
    payee: str | None = Query(None),
    interval: str = Query("monthly"),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined|comparative)$"),
    conversion: str = Query("at_value"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Running balance of a specific account over time."""
    oc = ledger.options["operating_currency"][0]
    lens = _lens(conversion, ledger)
    fkw = dict(
        account=account,
        from_date=datetime.date.fromisoformat(from_date) if from_date else None,
        to_date=datetime.date.fromisoformat(to_date) if to_date else None,
        tags=tags or None,
        payee=payee,
    )
    ckw = dict(conversion=lens, prices=ledger.prices, oc=oc)
    # A parent account with no postings of its own (e.g. ``Assets:Investments``)
    # matches nothing exactly and would chart a flat zero line.  Detect that on
    # the *unfiltered* ledger — the account filter itself would mask the
    # distinction — and roll up its children instead.
    consolidate = not _has_own_postings(
        ledger.all_entries, account
    ) and _has_descendants(ledger.all_entries, account)

    if view_mode == "comparative":
        if consolidate:
            actual = _compute_account_balance_consolidated(
                get_filtered_entries(ledger, "actual", **fkw), account, interval, **ckw
            )
            planned = _compute_account_balance_consolidated(
                get_filtered_entries(ledger, "planned", **fkw), account, interval, **ckw
            )
            return {
                "series": actual["series"],
                "children": actual["children"],
                "planned_series": planned["series"],
                "planned_children": planned["children"],
                "consolidated": True,
            }
        return {
            "series": _compute_account_balance(
                get_filtered_entries(ledger, "actual", **fkw), account, interval, **ckw
            ),
            "planned_series": _compute_account_balance(
                get_filtered_entries(ledger, "planned", **fkw), account, interval, **ckw
            ),
        }

    entries = get_filtered_entries(ledger, view_mode, **fkw)
    if consolidate:
        result = _compute_account_balance_consolidated(entries, account, interval, **ckw)
        result["consolidated"] = True
        return result
    return {"series": _compute_account_balance(entries, account, interval, **ckw)}


@router.get("/api/reports/net-worth")
def get_net_worth(
    account: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    tags: list[str] = Query([]),
    payee: str | None = Query(None),
    interval: str = Query("monthly"),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined|comparative)$"),
    conversion: str = Query("at_value"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Assets + Liabilities at each period end."""
    oc = ledger.options["operating_currency"][0]
    lens = _lens(conversion, ledger)
    fkw = dict(
        account=account,
        from_date=datetime.date.fromisoformat(from_date) if from_date else None,
        to_date=datetime.date.fromisoformat(to_date) if to_date else None,
        tags=tags or None,
        payee=payee,
    )
    ckw = dict(conversion=lens, prices=ledger.prices)
    if view_mode == "comparative":
        return {
            "series": _compute_net_worth(
                get_filtered_entries(ledger, "actual", **fkw), interval, oc, **ckw
            ),
            "planned_series": _compute_net_worth(
                get_filtered_entries(ledger, "planned", **fkw), interval, oc, **ckw
            ),
        }
    entries = get_filtered_entries(ledger, view_mode, **fkw)
    return {"series": _compute_net_worth(entries, interval, oc, **ckw)}


# ------------------------------------------------------------------
# Income Statement — uses clamp_opt (AGENTS.md §8)
# ------------------------------------------------------------------


@router.get("/api/reports/income-statement")
def get_income_statement(
    account: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    tags: list[str] = Query([]),
    payee: str | None = Query(None),
    interval: str = Query("monthly"),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined)$"),
    conversion: str = Query("at_value"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Income statement with tree structure and period columns."""
    oc = ledger.options["operating_currency"][0]
    lens = _lens(conversion, ledger)

    entries = get_filtered_entries(
        ledger, view_mode,
        account=account,
        from_date=datetime.date.fromisoformat(from_date) if from_date else None,
        to_date=datetime.date.fromisoformat(to_date) if to_date else None,
        tags=tags or None,
        payee=payee,
    )
    return _compute_income_statement(
        entries, interval, oc, conversion=lens, prices=ledger.prices
    )


# ------------------------------------------------------------------
# Balance Sheet — uses cap_opt (AGENTS.md §8)
# ------------------------------------------------------------------


@router.get("/api/reports/balance-sheet")
def get_balance_sheet(
    account: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    tags: list[str] = Query([]),
    payee: str | None = Query(None),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined)$"),
    conversion: str = Query("at_value"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Balance sheet at a point in time.

    ``cap_opt`` closes Income/Expenses → Equity, guaranteeing the
    accounting equation: ``Assets + Liabilities + Equity == 0`` at cost.
    When ``to_date`` is provided, ``clamp_opt()`` in
    ``get_filtered_entries()`` handles the date cutoff, and positions are
    valued at that same date.  See ``_compute_balance_sheet`` for what each
    lens does to the equation.
    """
    oc = ledger.options["operating_currency"][0]
    lens = _lens(conversion, ledger)
    end = datetime.date.fromisoformat(to_date) if to_date else None
    entries = get_filtered_entries(
        ledger, view_mode,
        account=account,
        from_date=datetime.date.fromisoformat(from_date) if from_date else None,
        to_date=end,
        tags=tags or None,
        payee=payee,
    )
    return _compute_balance_sheet(
        entries,
        ledger.options,
        oc,
        conversion=lens,
        prices=ledger.prices,
        date=end,
        precisions=ledger.format_decimal.precisions,
    )
