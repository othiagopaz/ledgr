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


def _compute_income_statement(entries: list, begin, end, options, interval: str, oc: str) -> dict[str, Any]:
    clamped, _ = summarize.clamp_opt(entries, begin, end, options)

    txns = [e for e in clamped if isinstance(e, data.Transaction)]
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


def _compute_balance_sheet(entries: list, options, as_of_date: str | None, oc: str) -> dict[str, Any]:
    closed = summarize.cap_opt(entries, options)

    if as_of_date:
        cutoff = datetime.date.fromisoformat(as_of_date)
        closed = [e for e in closed if e.date <= cutoff]

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
    interval: str = Query("monthly"),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined|comparative)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Monthly/quarterly/yearly income vs expense totals."""
    oc = ledger.options["operating_currency"][0]
    if view_mode == "comparative":
        return {
            "series": _compute_income_expense(
                get_filtered_entries(ledger, "actual"), interval, oc
            ),
            "planned_series": _compute_income_expense(
                get_filtered_entries(ledger, "planned"), interval, oc
            ),
        }
    entries = get_filtered_entries(ledger, view_mode)
    return {"series": _compute_income_expense(entries, interval, oc)}


@router.get("/api/reports/account-balance")
def get_account_balance(
    account: str = Query(...),
    interval: str = Query("monthly"),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined|comparative)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Running balance of a specific account over time."""
    if view_mode == "comparative":
        return {
            "series": _compute_account_balance(
                get_filtered_entries(ledger, "actual"), account, interval
            ),
            "planned_series": _compute_account_balance(
                get_filtered_entries(ledger, "planned"), account, interval
            ),
        }
    entries = get_filtered_entries(ledger, view_mode)
    return {"series": _compute_account_balance(entries, account, interval)}


@router.get("/api/reports/net-worth")
def get_net_worth(
    interval: str = Query("monthly"),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined|comparative)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Assets + Liabilities at each period end."""
    oc = ledger.options["operating_currency"][0]
    if view_mode == "comparative":
        return {
            "series": _compute_net_worth(
                get_filtered_entries(ledger, "actual"), interval, oc
            ),
            "planned_series": _compute_net_worth(
                get_filtered_entries(ledger, "planned"), interval, oc
            ),
        }
    entries = get_filtered_entries(ledger, view_mode)
    return {"series": _compute_net_worth(entries, interval, oc)}


# ------------------------------------------------------------------
# Income Statement — uses clamp_opt (AGENTS.md §8)
# ------------------------------------------------------------------


@router.get("/api/reports/income-statement")
def get_income_statement(
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    interval: str = Query("monthly"),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Income statement with tree structure and period columns."""
    oc = ledger.options["operating_currency"][0]

    # Determine date range from all entries (regardless of view_mode)
    txn_dates = [
        e.date for e in ledger.all_entries if isinstance(e, data.Transaction)
    ]
    if not txn_dates:
        return {"income": [], "expenses": [], "periods": [], "net_income": {}}

    begin = datetime.date.fromisoformat(from_date) if from_date else min(txn_dates)
    end = datetime.date.fromisoformat(to_date) if to_date else None
    if end is None:
        end = max(txn_dates) + datetime.timedelta(days=1)
    else:
        end = end + datetime.timedelta(days=1)  # clamp_opt end is exclusive

    entries = get_filtered_entries(ledger, view_mode)
    return _compute_income_statement(entries, begin, end, ledger.options, interval, oc)


# ------------------------------------------------------------------
# Balance Sheet — uses cap_opt (AGENTS.md §8)
# ------------------------------------------------------------------


@router.get("/api/reports/balance-sheet")
def get_balance_sheet(
    as_of_date: str | None = Query(None),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Balance sheet at a point in time.

    ``cap_opt`` closes Income/Expenses → Equity, guaranteeing the
    accounting equation: ``Assets + Liabilities + Equity == 0``.
    """
    oc = ledger.options["operating_currency"][0]
    entries = get_filtered_entries(ledger, view_mode)
    return _compute_balance_sheet(entries, ledger.options, as_of_date, oc)
