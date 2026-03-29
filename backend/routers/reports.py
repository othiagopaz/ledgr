"""Report endpoints — thin HTTP wrappers."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from fava.core import FavaLedger

from ledger import get_ledger
from ledgr.reports import (
    account_balance_series,
    balance_sheet,
    income_expense_series,
    income_statement,
    net_worth_series,
)

router = APIRouter()


@router.get("/api/reports/income-expense")
def get_income_expense(
    interval: str = Query("monthly"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    return income_expense_series(ledger, interval)


@router.get("/api/reports/account-balance")
def get_account_balance(
    account: str = Query(...),
    interval: str = Query("monthly"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    return account_balance_series(ledger, account, interval)


@router.get("/api/reports/net-worth")
def get_net_worth(
    interval: str = Query("monthly"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    return net_worth_series(ledger, interval)


@router.get("/api/reports/income-statement")
def get_income_statement(
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    interval: str = Query("monthly"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    return income_statement(ledger, from_date, to_date, interval)


@router.get("/api/reports/balance-sheet")
def get_balance_sheet(
    as_of_date: str | None = Query(None),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    return balance_sheet(ledger, as_of_date)
