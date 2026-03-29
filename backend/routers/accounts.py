"""Account-related endpoints — thin HTTP wrappers."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from fava.core import FavaLedger

from ledger import get_ledger
from ledgr.accounts import (
    get_account_tree,
    get_ledger_options,
    list_account_names,
    list_errors,
    list_payees,
    suggest_for_payee,
)

router = APIRouter()


@router.get("/api/accounts")
def get_accounts(ledger: FavaLedger = Depends(get_ledger)) -> dict[str, Any]:
    return get_account_tree(ledger)


@router.get("/api/account-names")
def get_account_names(ledger: FavaLedger = Depends(get_ledger)) -> dict[str, list[str]]:
    return list_account_names(ledger)


@router.get("/api/payees")
def get_payees(ledger: FavaLedger = Depends(get_ledger)) -> dict[str, list[str]]:
    return list_payees(ledger)


@router.get("/api/errors")
def get_errors(ledger: FavaLedger = Depends(get_ledger)) -> dict[str, Any]:
    return list_errors(ledger)


@router.get("/api/options")
def get_options(ledger: FavaLedger = Depends(get_ledger)) -> dict[str, Any]:
    return get_ledger_options(ledger)


@router.get("/api/suggestions")
def get_suggestions(
    payee: str = Query(...),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    return suggest_for_payee(ledger, payee)
