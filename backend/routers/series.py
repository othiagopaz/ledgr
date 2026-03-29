"""Series endpoints — create, list, extend, cancel recurring/installment series.

All mutations use ``FavaLedger.file`` — never raw ``open()``.  See AGENTS.md §9.
"""

from __future__ import annotations

import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Literal

from beancount.core import data
from fastapi import APIRouter, Depends, HTTPException
from fava.beans.funcs import hash_entry
from fava.core import FavaLedger
from fava.core.file import get_entry_slice
from pydantic import BaseModel

from ledger import get_ledger
from series import (
    generate_series_id,
    generate_series_transactions,
    months_between,
)

router = APIRouter()


# ------------------------------------------------------------------
# Pydantic models
# ------------------------------------------------------------------


class SeriesCreateIn(BaseModel):
    type: Literal["recurring", "installment"]
    payee: str
    narration: str
    start_date: str
    end_date: str | None = None
    count: int | None = None
    amount: Decimal
    amount_is_total: bool = False
    currency: str
    account_from: str
    account_to: str


class SeriesExtendIn(BaseModel):
    new_end_date: str
    new_amount: Decimal | None = None
    new_currency: str | None = None


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


def _get_series_transactions(
    entries: list, series_id: str
) -> list[data.Transaction]:
    """Find all transactions belonging to a series."""
    return [
        e for e in entries
        if isinstance(e, data.Transaction)
        and e.meta.get("ledgr-series") == series_id
    ]


def _summarize_series(
    series_id: str, txns: list[data.Transaction]
) -> dict[str, Any]:
    """Build a summary dict for a series from its transactions."""
    if not txns:
        return {}

    first = txns[0]
    series_type = first.meta.get("ledgr-series-type", "recurring")
    confirmed = sum(1 for t in txns if t.flag == "*")
    pending = sum(1 for t in txns if t.flag == "!")

    # Extract accounts from first transaction's postings.
    # Convention: positive-amount posting = account_to, negative = account_from.
    account_to = ""
    account_from = ""
    amount_str = "0"
    currency = ""
    for p in first.postings:
        if p.units and p.units.number > 0:
            account_to = p.account
            amount_str = str(p.units.number)
            currency = p.units.currency
        elif p.units and p.units.number < 0:
            account_from = p.account

    # Strip installment counter from narration for display.
    narration = first.narration
    if series_type == "installment" and " (" in narration:
        narration = narration.rsplit(" (", 1)[0]

    return {
        "series_id": series_id,
        "type": series_type,
        "payee": first.payee or "",
        "narration": narration,
        "amount_per_txn": amount_str,
        "currency": currency,
        "total": len(txns),
        "confirmed": confirmed,
        "pending": pending,
        "first_date": min(t.date for t in txns).isoformat(),
        "last_date": max(t.date for t in txns).isoformat(),
        "account_from": account_from,
        "account_to": account_to,
    }


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------


@router.post("/api/series")
def create_series(
    body: SeriesCreateIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Create a new recurring or installment series."""
    start = datetime.date.fromisoformat(body.start_date)

    # --- Validation & count derivation ---
    if body.type == "installment":
        if body.count is None:
            raise HTTPException(
                status_code=400,
                detail="Installment series requires 'count'.",
            )
        count = body.count
    else:  # recurring
        if body.end_date is None:
            raise HTTPException(
                status_code=400,
                detail="Recurring series requires 'end_date'.",
            )
        end = datetime.date.fromisoformat(body.end_date)
        count = months_between(start, end)

    if body.amount_is_total and body.type != "installment":
        raise HTTPException(
            status_code=400,
            detail="'amount_is_total' is only valid for installment series.",
        )

    # --- Amount computation ---
    if body.amount_is_total:
        per_txn = (body.amount / count).quantize(
            Decimal("0.01"), ROUND_HALF_UP
        )
        remainder = body.amount - per_txn * count
        last_adj = per_txn + remainder if remainder else None
    else:
        per_txn = body.amount
        last_adj = None

    # --- Generate ---
    series_id = generate_series_id(body.payee)
    txns = generate_series_transactions(
        series_type=body.type,
        series_id=series_id,
        payee=body.payee,
        narration=body.narration,
        start_date=start,
        count=count,
        amount_per_txn=per_txn,
        currency=body.currency,
        account_from=body.account_from,
        account_to=body.account_to,
        beancount_file_path=str(ledger.beancount_file_path),
        last_installment_adjustment=last_adj,
    )

    try:
        ledger.file.insert_entries(txns)
        ledger.load_file()
    except Exception as e:
        return {"success": False, "errors": [str(e)]}

    return {
        "success": True,
        "series_id": series_id,
        "count": count,
        "transactions_created": len(txns),
    }


@router.get("/api/series")
def list_series(
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """List all series, grouped by series ID."""
    # Collect all series IDs
    series_map: dict[str, list[data.Transaction]] = {}
    for entry in ledger.all_entries:
        if not isinstance(entry, data.Transaction):
            continue
        sid = entry.meta.get("ledgr-series")
        if sid:
            series_map.setdefault(sid, []).append(entry)

    summaries = [
        _summarize_series(sid, txns) for sid, txns in series_map.items()
    ]
    # Sort by first_date descending
    summaries.sort(key=lambda s: s.get("first_date", ""), reverse=True)

    return {"series": summaries}


@router.post("/api/series/{series_id}/extend")
def extend_series(
    series_id: str,
    body: SeriesExtendIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Extend a recurring series with new transactions."""
    txns = _get_series_transactions(ledger.all_entries, series_id)
    if not txns:
        raise HTTPException(status_code=404, detail="Series not found.")

    series_type = txns[0].meta.get("ledgr-series-type", "recurring")
    if series_type == "installment":
        raise HTTPException(
            status_code=400,
            detail="Cannot extend installment series.",
        )

    # Determine current state
    current_last_date = max(t.date for t in txns)
    new_end = datetime.date.fromisoformat(body.new_end_date)
    if new_end <= current_last_date:
        raise HTTPException(
            status_code=400,
            detail=f"new_end_date must be after current last date ({current_last_date.isoformat()}).",
        )

    # Compute next start: one month after current last
    from series import compute_monthly_dates
    next_start_dates = compute_monthly_dates(current_last_date, 2)
    next_start = next_start_dates[1]  # one month after last

    new_count = months_between(next_start, new_end)
    if new_count <= 0:
        raise HTTPException(
            status_code=400,
            detail="new_end_date results in zero new transactions.",
        )

    # Use new amount if provided, else carry forward from existing
    amount = body.new_amount
    currency = body.new_currency
    if amount is None:
        for p in txns[-1].postings:
            if p.units and p.units.number > 0:
                amount = p.units.number
                currency = currency or p.units.currency
                break
    if currency is None:
        for p in txns[-1].postings:
            if p.units:
                currency = p.units.currency
                break

    # Carry forward accounts from existing series
    account_from = ""
    account_to = ""
    for p in txns[0].postings:
        if p.units and p.units.number > 0:
            account_to = p.account
        elif p.units and p.units.number < 0:
            account_from = p.account

    new_txns = generate_series_transactions(
        series_type="recurring",
        series_id=series_id,
        payee=txns[0].payee or "",
        narration=txns[0].narration or "",
        start_date=next_start,
        count=new_count,
        amount_per_txn=amount,
        currency=currency,
        account_from=account_from,
        account_to=account_to,
        beancount_file_path=str(ledger.beancount_file_path),
    )

    try:
        ledger.file.insert_entries(new_txns)
        ledger.load_file()
    except Exception as e:
        return {"success": False, "errors": [str(e)]}

    return {
        "success": True,
        "series_id": series_id,
        "count": len(txns) + len(new_txns),
        "transactions_created": len(new_txns),
    }


@router.delete("/api/series/{series_id}")
def cancel_series(
    series_id: str,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Cancel a series — delete all pending (!) transactions, keep confirmed (*)."""
    txns = _get_series_transactions(ledger.all_entries, series_id)
    if not txns:
        raise HTTPException(status_code=404, detail="Series not found.")

    pending = [t for t in txns if t.flag == "!"]
    kept = len(txns) - len(pending)

    # Delete from bottom of file upward so line numbers don't shift.
    pending.sort(key=lambda t: t.meta.get("lineno", 0), reverse=True)

    errors: list[str] = []
    deleted = 0
    for txn in pending:
        try:
            entry_hash = hash_entry(txn)
            _, entry_sha = get_entry_slice(txn)
            ledger.file.delete_entry_slice(entry_hash, entry_sha)
            deleted += 1
        except Exception as e:
            errors.append(str(e))

    if deleted > 0:
        ledger.load_file()

    result: dict[str, Any] = {
        "success": len(errors) == 0,
        "deleted": deleted,
        "kept": kept,
    }
    if errors:
        result["errors"] = errors
    return result
