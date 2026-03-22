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
from ledger import get_ledger
from serializers import (
    build_balance_tree,
    build_report_tree,
    decimal_to_report_number,
)

router = APIRouter()


# ------------------------------------------------------------------
# Time series
# ------------------------------------------------------------------


@router.get("/api/reports/income-expense")
def get_income_expense(
    interval: str = Query("monthly"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Monthly/quarterly/yearly income vs expense totals."""
    txns = [e for e in ledger.all_entries if isinstance(e, data.Transaction)]
    buckets: dict[str, dict[str, Decimal]] = {}

    for txn in txns:
        period = date_to_period(txn.date, interval)
        if period not in buckets:
            buckets[period] = {"income": Decimal(0), "expenses": Decimal(0)}
        for p in txn.postings:
            if p.units is None:
                continue
            acct_type = p.account.split(":")[0]
            if acct_type == "Income":
                buckets[period]["income"] += -p.units.number
            elif acct_type == "Expenses":
                buckets[period]["expenses"] += p.units.number

    series = [
        {
            "period": period,
            "income": decimal_to_report_number(buckets[period]["income"]),
            "expenses": decimal_to_report_number(buckets[period]["expenses"]),
        }
        for period in sorted(buckets)
    ]
    return {"series": series}


@router.get("/api/reports/account-balance")
def get_account_balance(
    account: str = Query(...),
    interval: str = Query("monthly"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Running balance of a specific account over time."""
    txns = sorted(
        [e for e in ledger.all_entries if isinstance(e, data.Transaction)],
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

    series = [
        {"period": p, "balance": decimal_to_report_number(b)}
        for p, b in sorted(period_balance.items())
    ]
    return {"series": series}


@router.get("/api/reports/net-worth")
def get_net_worth(
    interval: str = Query("monthly"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Assets + Liabilities at each period end."""
    txns = sorted(
        [e for e in ledger.all_entries if isinstance(e, data.Transaction)],
        key=lambda t: t.date,
    )

    assets = Decimal(0)
    liabilities = Decimal(0)
    snapshots: dict[str, dict[str, Decimal]] = {}

    for txn in txns:
        for p in txn.postings:
            if p.units is None:
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

    series = [
        {
            "period": period,
            "assets": decimal_to_report_number(s["assets"]),
            "liabilities": decimal_to_report_number(s["liabilities"]),
            "net_worth": decimal_to_report_number(s["net_worth"]),
        }
        for period, s in sorted(snapshots.items())
    ]
    return {"series": series}


# ------------------------------------------------------------------
# Income Statement — uses clamp_opt (AGENTS.md §8)
# ------------------------------------------------------------------


@router.get("/api/reports/income-statement")
def get_income_statement(
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    interval: str = Query("monthly"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Income statement with tree structure and period columns."""
    begin = datetime.date.fromisoformat(from_date) if from_date else None
    end = datetime.date.fromisoformat(to_date) if to_date else None

    txn_dates = [
        e.date for e in ledger.all_entries if isinstance(e, data.Transaction)
    ]
    if not txn_dates:
        return {"income": [], "expenses": [], "periods": [], "net_income": {}}

    if begin is None:
        begin = min(txn_dates)
    if end is None:
        end = max(txn_dates) + datetime.timedelta(days=1)
    else:
        end = end + datetime.timedelta(days=1)  # clamp_opt end is exclusive

    clamped, _ = summarize.clamp_opt(ledger.all_entries, begin, end, ledger.options)

    txns = [e for e in clamped if isinstance(e, data.Transaction)]
    account_period: dict[str, dict[str, Decimal]] = {}
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
            if p.account not in account_period:
                account_period[p.account] = {}
            account_period[p.account][period] = (
                account_period[p.account].get(period, Decimal(0))
                + p.units.number
            )

    periods = sorted(periods_set)

    def _build_tree(root_type: str, negate: bool = False) -> list[dict]:
        accts = {a for a in account_period if a.startswith(root_type + ":")}
        if root_type in account_period:
            accts.add(root_type)
        return build_report_tree(accts, account_period, periods, negate)

    income_tree = _build_tree("Income", negate=True)
    expenses_tree = _build_tree("Expenses", negate=False)

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

    return {
        "income": income_tree,
        "expenses": expenses_tree,
        "periods": periods,
        "net_income": net_income,
    }


# ------------------------------------------------------------------
# Balance Sheet — uses cap_opt (AGENTS.md §8)
# ------------------------------------------------------------------


@router.get("/api/reports/balance-sheet")
def get_balance_sheet(
    as_of_date: str | None = Query(None),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Balance sheet at a point in time.

    ``cap_opt`` closes Income/Expenses → Equity, guaranteeing the
    accounting equation: ``Assets + Liabilities + Equity == 0``.
    """
    closed = summarize.cap_opt(ledger.all_entries, ledger.options)

    if as_of_date:
        cutoff = datetime.date.fromisoformat(as_of_date)
        closed = [e for e in closed if e.date <= cutoff]

    real_root = realization.realize(closed)

    def _build_section(root_type: str, negate: bool = False) -> list[dict]:
        node = realization.get(real_root, root_type)
        if node is None:
            return []
        account_balance: dict[str, Decimal] = {}
        for child in realization.iter_children(node):
            if child.account:
                bal = realization.compute_balance(child)
                for pos in bal:
                    account_balance[child.account] = (
                        account_balance.get(child.account, Decimal(0))
                        + pos.units.number
                    )
        return build_balance_tree(set(account_balance.keys()), account_balance, negate)

    def _section_total(root_type: str) -> float:
        node = realization.get(real_root, root_type)
        if node is None:
            return 0.0
        bal = realization.compute_balance(node)
        total = Decimal(0)
        for pos in bal:
            total += pos.units.number
        return decimal_to_report_number(total)

    return {
        "assets": _build_section("Assets"),
        "liabilities": _build_section("Liabilities"),
        "equity": _build_section("Equity"),
        "totals": {
            "assets": _section_total("Assets"),
            "liabilities": _section_total("Liabilities"),
            "equity": _section_total("Equity"),
        },
    }
