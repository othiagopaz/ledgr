"""Transaction CRUD endpoints.

GET, POST, PUT, DELETE for transactions.  Mutations use ``FavaLedger.file``
— never raw ``open()``.  See AGENTS.md §9.
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Any

from beancount.core import amount as amt_mod, data
from beancount.parser import printer
from fastapi import APIRouter, Depends, Query
from fava.beans.funcs import hash_entry
from fava.core import FavaLedger
from fava.core.file import get_entry_slice
from pydantic import BaseModel

from ledger import get_filtered_entries, get_ledger
from serializers import serialize_transaction

router = APIRouter()


# ------------------------------------------------------------------
# Pydantic models — Decimal for all monetary values (AGENTS.md §11)
# ------------------------------------------------------------------


class PostingIn(BaseModel):
    """Posting input — all monetary values use Decimal, never float."""

    account: str
    amount: Decimal | None = None
    currency: str | None = None
    cost: Decimal | None = None
    cost_currency: str | None = None
    price: Decimal | None = None
    price_currency: str | None = None


class TransactionIn(BaseModel):
    date: str
    flag: str = "*"
    payee: str | None = None
    narration: str = ""
    tags: list[str] = []
    links: list[str] = []
    postings: list[PostingIn]


class EditTransactionIn(TransactionIn):
    lineno: int


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


def _build_bc_postings(postings: list[PostingIn]) -> list[data.Posting]:
    """Convert Pydantic posting models to Beancount Posting objects."""
    bc_postings: list[data.Posting] = []
    for p in postings:
        units = None
        cost = None
        price = None
        if p.amount is not None and p.currency:
            units = amt_mod.Amount(p.amount, p.currency)
        if p.cost is not None and p.cost_currency:
            cost = data.CostSpec(p.cost, None, p.cost_currency, None, None, False)
        if p.price is not None and p.price_currency:
            price = amt_mod.Amount(p.price, p.price_currency)
        bc_postings.append(
            data.Posting(p.account, units, cost, price, None, None)
        )
    return bc_postings


def _find_entry_by_lineno(
    entries: list, lineno: int
) -> data.Transaction | None:
    """Find a Transaction entry by its line number in the source file."""
    for entry in entries:
        if (
            isinstance(entry, data.Transaction)
            and entry.meta.get("lineno") == lineno
        ):
            return entry
    return None


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------


@router.get("/api/transactions")
def get_transactions(
    account: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    tags: list[str] = Query([]),
    payee: str | None = Query(None),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """List transactions, optionally filtered by account, date, tags, payee."""
    entries = get_filtered_entries(
        ledger, view_mode,
        account=account,
        from_date=datetime.date.fromisoformat(from_date) if from_date else None,
        to_date=datetime.date.fromisoformat(to_date) if to_date else None,
        tags=tags or None,
        payee=payee,
    )
    # Exclude synthetic entries from clamp_opt() (flag "S") — those are
    # internal opening-balance entries, not real user transactions.
    txns = [
        e for e in entries
        if isinstance(e, data.Transaction) and e.flag in ("*", "!")
    ]
    result = [serialize_transaction(t) for t in txns]
    return {"transactions": result, "count": len(result)}


@router.post("/api/transactions")
def add_transaction(
    body: TransactionIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Add a new transaction via FavaLedger.file.insert_entries."""
    txn_date = datetime.date.fromisoformat(body.date)
    bc_postings = _build_bc_postings(body.postings)

    meta = data.new_metadata(str(ledger.beancount_file_path), 0)
    txn = data.Transaction(
        meta,
        txn_date,
        body.flag or "*",
        body.payee or "",
        body.narration or "",
        frozenset(body.tags or []),
        frozenset(body.links or []),
        bc_postings,
    )

    try:
        ledger.file.insert_entries([txn])
        ledger.load_file()
    except Exception as e:
        return {"success": False, "errors": [str(e)]}

    return {"success": True, "transaction": serialize_transaction(txn)}


@router.put("/api/transactions")
def edit_transaction(
    body: EditTransactionIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Edit a transaction via FavaLedger.file.save_entry_slice."""
    entry = _find_entry_by_lineno(ledger.all_entries, body.lineno)
    if entry is None:
        return {
            "success": False,
            "errors": [f"No transaction found at line {body.lineno}"],
        }

    txn_date = datetime.date.fromisoformat(body.date)
    bc_postings = _build_bc_postings(body.postings)

    # Start with fresh metadata, then re-apply all ledgr-* keys from the
    # original entry so that series metadata (ledgr-series, ledgr-series-type,
    # ledgr-series-seq, ledgr-series-total) is preserved through edits.
    new_meta = data.new_metadata(str(ledger.beancount_file_path), body.lineno)
    for k, v in entry.meta.items():
        if isinstance(k, str) and k.startswith("ledgr-"):
            new_meta[k] = v

    new_txn = data.Transaction(
        new_meta,
        txn_date,
        body.flag or "*",
        body.payee or "",
        body.narration or "",
        frozenset(body.tags or []),
        frozenset(body.links or []),
        bc_postings,
    )
    new_source = printer.format_entry(new_txn).rstrip("\n")

    try:
        entry_hash_val = hash_entry(entry)
        _, entry_sha = get_entry_slice(entry)
        ledger.file.save_entry_slice(entry_hash_val, new_source, entry_sha)
        ledger.load_file()
    except Exception as e:
        return {"success": False, "errors": [str(e)]}

    return {"success": True, "transaction": serialize_transaction(new_txn)}


@router.delete("/api/transactions/{lineno}")
def delete_transaction(
    lineno: int,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Delete a transaction via FavaLedger.file.delete_entry_slice."""
    entry = _find_entry_by_lineno(ledger.all_entries, lineno)
    if entry is None:
        return {
            "success": False,
            "errors": [f"No transaction found at line {lineno}"],
        }

    try:
        entry_hash_val = hash_entry(entry)
        _, entry_sha = get_entry_slice(entry)
        ledger.file.delete_entry_slice(entry_hash_val, entry_sha)
        ledger.load_file()
    except Exception as e:
        return {"success": False, "errors": [str(e)]}

    return {"success": True}
