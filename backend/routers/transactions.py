"""Transaction CRUD endpoints — thin HTTP wrappers."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from fava.core import FavaLedger

from ledger import get_ledger
from ledgr.transactions import (
    EditTransactionIn,
    TransactionIn,
    add_transaction,
    delete_transaction,
    edit_transaction,
    list_transactions,
)

router = APIRouter()


@router.get("/api/transactions")
def get_transactions(
    account: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    return list_transactions(ledger, account, from_date, to_date)


@router.post("/api/transactions")
def post_transaction(
    body: TransactionIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    return add_transaction(ledger, body)


@router.put("/api/transactions")
def put_transaction(
    body: EditTransactionIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    return edit_transaction(ledger, body)


@router.delete("/api/transactions/{lineno}")
def remove_transaction(
    lineno: int,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    return delete_transaction(ledger, lineno)
