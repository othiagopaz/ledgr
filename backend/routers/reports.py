"""Report endpoints — Income Statement, Balance Sheet, and time series.

Uses ``clamp_opt`` / ``cap_opt`` for correct accounting as required by
AGENTS.md §8.  Delegates to ``serializers.py`` for type conversion.
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Any

from beancount.core import data, realization
from beancount.ops import summarize
from fastapi import APIRouter, Depends, Query
from fava.core import FavaLedger

from cashflow import date_to_period
from ledger import get_filtered_entries, get_ledger
from serializers import (
    attach_other_currencies_to_balance_tree,
    attach_other_currencies_to_report_tree,
    build_balance_tree,
    build_report_tree,
    decimal_to_report_number,
    format_other_balances,
)

router = APIRouter()


# ------------------------------------------------------------------
# Helpers — extracted computation logic for comparative mode
# ------------------------------------------------------------------


def _compute_income_expense(entries: list, interval: str, oc: str) -> list[dict]:
    txns = [e for e in entries if isinstance(e, data.Transaction)]
    buckets: dict[str, dict[str, Decimal]] = {}

    for txn in txns:
        period = date_to_period(txn.date, interval)
        if period not in buckets:
            buckets[period] = {"income": Decimal(0), "expenses": Decimal(0)}
        for p in txn.postings:
            if p.units is None or p.units.currency != oc:
                continue
            acct_type = p.account.split(":")[0]
            if acct_type == "Income":
                buckets[period]["income"] += -p.units.number
            elif acct_type == "Expenses":
                buckets[period]["expenses"] += p.units.number

    return [
        {
            "period": period,
            "income": decimal_to_report_number(buckets[period]["income"]),
            "expenses": decimal_to_report_number(buckets[period]["expenses"]),
        }
        for period in sorted(buckets)
    ]


def _child_bucket(posting_account: str, parent: str) -> str:
    """Map a descendant account to its **immediate** child-of-parent bucket.

    ``Assets:Investments:Personnalite:Float`` under parent
    ``Assets:Investments`` buckets into ``Assets:Investments:Personnalite`` —
    grandchildren aggregate into the one-level-down child, keeping the chart
    legible.  Drill deeper by selecting that child.
    """
    rest = posting_account[len(parent) + 1:]
    return f"{parent}:{rest.split(':')[0]}"


def _compute_account_balance(entries: list, account: str, interval: str) -> list[dict]:
    txns = sorted(
        [e for e in entries if isinstance(e, data.Transaction)],
        key=lambda t: t.date,
    )

    running = Decimal(0)
    period_balance: dict[str, Decimal] = {}

    for txn in txns:
        for p in txn.postings:
            if p.account == account and p.units is not None:
                running += p.units.number
        period = date_to_period(txn.date, interval)
        period_balance[period] = running

    return [
        {"period": p, "balance": decimal_to_report_number(b)}
        for p, b in sorted(period_balance.items())
    ]


def _compute_account_balance_consolidated(
    entries: list, account: str, interval: str
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
    prefix = account + ":"
    txns = sorted(
        [e for e in entries if isinstance(e, data.Transaction)],
        key=lambda t: t.date,
    )

    total = Decimal(0)
    child_running: dict[str, Decimal] = {}
    # period → snapshot of (total, {child: balance})
    period_total: dict[str, Decimal] = {}
    period_children: dict[str, dict[str, Decimal]] = {}

    for txn in txns:
        for p in txn.postings:
            if p.units is None or not p.account.startswith(prefix):
                continue
            total += p.units.number
            bucket = _child_bucket(p.account, account)
            child_running[bucket] = (
                child_running.get(bucket, Decimal(0)) + p.units.number
            )
        period = date_to_period(txn.date, interval)
        period_total[period] = total
        period_children[period] = dict(child_running)

    periods = sorted(period_total)

    series = [
        {"period": p, "balance": decimal_to_report_number(period_total[p])}
        for p in periods
    ]

    # Drop children that are zero across every period — an account opened but
    # never moved would otherwise add a flat line at zero.
    final = child_running
    contributing = [
        c for c in final
        if any(
            decimal_to_report_number(period_children[p].get(c, Decimal(0))) != 0
            for p in periods
        )
    ]
    contributing.sort(key=lambda c: -abs(final[c]))

    children = [
        {
            "account": c,
            "name": c[len(prefix):],
            "series": [
                {
                    "period": p,
                    "balance": decimal_to_report_number(
                        period_children[p].get(c, Decimal(0))
                    ),
                }
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


def _compute_net_worth(entries: list, interval: str, oc: str) -> list[dict]:
    txns = sorted(
        [e for e in entries if isinstance(e, data.Transaction)],
        key=lambda t: t.date,
    )

    assets = Decimal(0)
    liabilities = Decimal(0)
    snapshots: dict[str, dict[str, Decimal]] = {}

    for txn in txns:
        for p in txn.postings:
            if p.units is None or p.units.currency != oc:
                continue
            acct_type = p.account.split(":")[0]
            if acct_type == "Assets":
                assets += p.units.number
            elif acct_type == "Liabilities":
                liabilities += p.units.number
        period = date_to_period(txn.date, interval)
        snapshots[period] = {
            "assets": assets,
            "liabilities": liabilities,
            "net_worth": assets + liabilities,
        }

    return [
        {
            "period": period,
            "assets": decimal_to_report_number(s["assets"]),
            "liabilities": decimal_to_report_number(s["liabilities"]),
            "net_worth": decimal_to_report_number(s["net_worth"]),
        }
        for period, s in sorted(snapshots.items())
    ]


def _compute_income_statement(entries: list, interval: str, oc: str) -> dict[str, Any]:
    txns = [e for e in entries if isinstance(e, data.Transaction)]
    account_period: dict[str, dict[str, Decimal]] = {}
    account_period_other: dict[str, dict[str, dict[str, Decimal]]] = {}
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
            curr = p.units.currency
            if curr == oc:
                if p.account not in account_period:
                    account_period[p.account] = {}
                account_period[p.account][period] = (
                    account_period[p.account].get(period, Decimal(0))
                    + p.units.number
                )
            else:
                if p.account not in account_period_other:
                    account_period_other[p.account] = {}
                if period not in account_period_other[p.account]:
                    account_period_other[p.account][period] = {}
                account_period_other[p.account][period][curr] = (
                    account_period_other[p.account][period].get(curr, Decimal(0))
                    + p.units.number
                )

    periods = sorted(periods_set)

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
    }


def _compute_balance_sheet(entries: list, options, oc: str) -> dict[str, Any]:
    closed = summarize.cap_opt(entries, options)
    real_root = realization.realize(closed)

    def _build_section(root_type: str, negate: bool = False) -> tuple[list[dict], dict[str, dict[str, Decimal]]]:
        node = realization.get(real_root, root_type)
        if node is None:
            return [], {}
        account_balance: dict[str, Decimal] = {}
        account_balance_other: dict[str, dict[str, Decimal]] = {}
        for child in realization.iter_children(node):
            if child.account:
                bal = child.balance
                for pos in bal:
                    curr = pos.units.currency
                    if curr == oc:
                        account_balance[child.account] = (
                            account_balance.get(child.account, Decimal(0))
                            + pos.units.number
                        )
                    else:
                        if child.account not in account_balance_other:
                            account_balance_other[child.account] = {}
                        account_balance_other[child.account][curr] = (
                            account_balance_other[child.account].get(curr, Decimal(0))
                            + pos.units.number
                        )
        all_accts = set(account_balance.keys()) | set(account_balance_other.keys())
        tree = build_balance_tree(all_accts, account_balance, negate)
        attach_other_currencies_to_balance_tree(tree, account_balance_other, negate)
        return tree, account_balance_other

    def _section_total(root_type: str) -> float:
        node = realization.get(real_root, root_type)
        if node is None:
            return 0.0
        bal = realization.compute_balance(node)
        total = Decimal(0)
        for pos in bal:
            if pos.units.currency == oc:
                total += pos.units.number
        return decimal_to_report_number(total)

    def _section_other_total(root_type: str) -> list[dict[str, Any]]:
        node = realization.get(real_root, root_type)
        if node is None:
            return []
        bal = realization.compute_balance(node)
        by_curr: dict[str, Decimal] = {}
        for pos in bal:
            if pos.units.currency != oc:
                c = pos.units.currency
                by_curr[c] = by_curr.get(c, Decimal(0)) + pos.units.number
        return format_other_balances(by_curr)

    assets_tree, _ = _build_section("Assets")
    liab_tree, _ = _build_section("Liabilities")
    equity_tree, _ = _build_section("Equity")

    return {
        "assets": assets_tree,
        "liabilities": liab_tree,
        "equity": equity_tree,
        "totals": {
            "assets": _section_total("Assets"),
            "liabilities": _section_total("Liabilities"),
            "equity": _section_total("Equity"),
        },
        "operating_currency": oc,
        "other_totals": {
            "assets": _section_other_total("Assets"),
            "liabilities": _section_other_total("Liabilities"),
            "equity": _section_other_total("Equity"),
        },
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
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Monthly/quarterly/yearly income vs expense totals."""
    oc = ledger.options["operating_currency"][0]
    fkw = dict(
        account=account,
        from_date=datetime.date.fromisoformat(from_date) if from_date else None,
        to_date=datetime.date.fromisoformat(to_date) if to_date else None,
        tags=tags or None,
        payee=payee,
    )
    if view_mode == "comparative":
        return {
            "series": _compute_income_expense(
                get_filtered_entries(ledger, "actual", **fkw), interval, oc
            ),
            "planned_series": _compute_income_expense(
                get_filtered_entries(ledger, "planned", **fkw), interval, oc
            ),
        }
    entries = get_filtered_entries(ledger, view_mode, **fkw)
    return {"series": _compute_income_expense(entries, interval, oc)}


@router.get("/api/reports/account-balance")
def get_account_balance(
    account: str = Query(...),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    tags: list[str] = Query([]),
    payee: str | None = Query(None),
    interval: str = Query("monthly"),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined|comparative)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Running balance of a specific account over time."""
    fkw = dict(
        account=account,
        from_date=datetime.date.fromisoformat(from_date) if from_date else None,
        to_date=datetime.date.fromisoformat(to_date) if to_date else None,
        tags=tags or None,
        payee=payee,
    )
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
                get_filtered_entries(ledger, "actual", **fkw), account, interval
            )
            planned = _compute_account_balance_consolidated(
                get_filtered_entries(ledger, "planned", **fkw), account, interval
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
                get_filtered_entries(ledger, "actual", **fkw), account, interval
            ),
            "planned_series": _compute_account_balance(
                get_filtered_entries(ledger, "planned", **fkw), account, interval
            ),
        }

    entries = get_filtered_entries(ledger, view_mode, **fkw)
    if consolidate:
        result = _compute_account_balance_consolidated(entries, account, interval)
        result["consolidated"] = True
        return result
    return {"series": _compute_account_balance(entries, account, interval)}


@router.get("/api/reports/net-worth")
def get_net_worth(
    account: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    tags: list[str] = Query([]),
    payee: str | None = Query(None),
    interval: str = Query("monthly"),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined|comparative)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Assets + Liabilities at each period end."""
    oc = ledger.options["operating_currency"][0]
    fkw = dict(
        account=account,
        from_date=datetime.date.fromisoformat(from_date) if from_date else None,
        to_date=datetime.date.fromisoformat(to_date) if to_date else None,
        tags=tags or None,
        payee=payee,
    )
    if view_mode == "comparative":
        return {
            "series": _compute_net_worth(
                get_filtered_entries(ledger, "actual", **fkw), interval, oc
            ),
            "planned_series": _compute_net_worth(
                get_filtered_entries(ledger, "planned", **fkw), interval, oc
            ),
        }
    entries = get_filtered_entries(ledger, view_mode, **fkw)
    return {"series": _compute_net_worth(entries, interval, oc)}


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
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Income statement with tree structure and period columns."""
    oc = ledger.options["operating_currency"][0]

    entries = get_filtered_entries(
        ledger, view_mode,
        account=account,
        from_date=datetime.date.fromisoformat(from_date) if from_date else None,
        to_date=datetime.date.fromisoformat(to_date) if to_date else None,
        tags=tags or None,
        payee=payee,
    )
    return _compute_income_statement(entries, interval, oc)


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
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Balance sheet at a point in time.

    ``cap_opt`` closes Income/Expenses → Equity, guaranteeing the
    accounting equation: ``Assets + Liabilities + Equity == 0``.
    When ``to_date`` is provided, ``clamp_opt()`` in
    ``get_filtered_entries()`` handles the date cutoff.
    """
    oc = ledger.options["operating_currency"][0]
    entries = get_filtered_entries(
        ledger, view_mode,
        account=account,
        from_date=datetime.date.fromisoformat(from_date) if from_date else None,
        to_date=datetime.date.fromisoformat(to_date) if to_date else None,
        tags=tags or None,
        payee=payee,
    )
    return _compute_balance_sheet(entries, ledger.options, oc)
