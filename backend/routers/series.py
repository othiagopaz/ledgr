"""Series endpoints — create, list, extend, cancel recurring/installment series.

All mutations use ``FavaLedger.file`` — never raw ``open()``.  See AGENTS.md §9.
"""

from __future__ import annotations

import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Literal

from beancount.core import data
from fastapi import APIRouter, Depends, HTTPException, Query
from fava.beans.funcs import hash_entry
from fava.core import FavaLedger
from fava.core.file import get_entry_slice
from pydantic import BaseModel

from ledger import get_filtered_entries, get_ledger
from series import (
    generate_series_id,
    generate_series_transactions,
    months_between,
)

router = APIRouter()


# ------------------------------------------------------------------
# Pydantic models
# ------------------------------------------------------------------


class PostingSpecIn(BaseModel):
    account: str
    amount: Decimal | None = None  # None = auto-balance
    currency: str | None = None    # falls back to series-level currency


class SeriesCreateIn(BaseModel):
    type: Literal["recurring", "installment"]
    payee: str
    narration: str
    start_date: str
    end_date: str | None = None
    count: int | None = None
    currency: str                       # series default currency
    postings: list[PostingSpecIn]       # replaces account_from/account_to/amount
    amount_is_total: bool = False


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

    # Build postings list from first transaction.
    postings_out: list[dict[str, str | None]] = []
    positive_amounts: list[Decimal] = []
    account_to = ""
    account_from = ""
    currency = ""
    for p in first.postings:
        if p.units:
            postings_out.append({
                "account": p.account,
                "amount": str(p.units.number),
                "currency": p.units.currency,
            })
            if p.units.number > 0:
                positive_amounts.append(p.units.number)
                account_to = account_to or p.account
                currency = currency or p.units.currency
            elif p.units.number < 0:
                account_from = account_from or p.account
        else:
            postings_out.append({
                "account": p.account,
                "amount": None,
                "currency": None,
            })

    amount_per_txn = str(sum(positive_amounts)) if positive_amounts else "0"
    is_split = len(positive_amounts) > 1

    # Compute real total from all transactions (handles manual edits).
    total_amount = Decimal(0)
    for t in txns:
        for p in t.postings:
            if p.units and p.units.number > 0:
                total_amount += p.units.number

    narration = first.narration

    return {
        "series_id": series_id,
        "type": series_type,
        "payee": first.payee or "",
        "narration": narration,
        "amount_per_txn": amount_per_txn,
        "total_amount": str(total_amount),
        "currency": currency,
        "total": len(txns),
        "confirmed": confirmed,
        "pending": pending,
        "first_date": min(t.date for t in txns).isoformat(),
        "last_date": max(t.date for t in txns).isoformat(),
        "account_from": account_from,
        "account_to": account_to,
        "postings": postings_out,
        "is_split": is_split,
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

    # --- Posting validation ---
    if len(body.postings) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least 2 postings are required.",
        )
    auto_balance_count = sum(1 for p in body.postings if p.amount is None)
    if auto_balance_count > 1:
        raise HTTPException(
            status_code=400,
            detail="At most one posting may have amount=None (auto-balance).",
        )
    positive_count = sum(
        1 for p in body.postings if p.amount is not None and p.amount > 0
    )
    if body.amount_is_total and positive_count > 1:
        raise HTTPException(
            status_code=400,
            detail="'amount_is_total' is only valid for series with a single positive posting.",
        )

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

    # --- Build postings_spec ---
    postings_spec: list[dict] = []
    for p in body.postings:
        postings_spec.append({
            "account": p.account,
            "amount": p.amount,
            "currency": p.currency,
        })

    # --- Amount computation for amount_is_total ---
    last_adj = None
    if body.amount_is_total:
        # Find the single positive posting and divide
        for spec in postings_spec:
            if spec["amount"] is not None and spec["amount"] > 0:
                total_amount = spec["amount"]
                per_txn = (total_amount / count).quantize(
                    Decimal("0.01"), ROUND_HALF_UP
                )
                remainder = total_amount - per_txn * count
                spec["amount"] = per_txn
                # For the negative posting, also scale
                for neg_spec in postings_spec:
                    if neg_spec["amount"] is not None and neg_spec["amount"] < 0:
                        neg_spec["amount"] = -per_txn
                        break
                last_adj = per_txn + remainder if remainder else None
                break

    # --- Generate ---
    series_id = generate_series_id(body.payee)
    txns = generate_series_transactions(
        series_type=body.type,
        series_id=series_id,
        payee=body.payee,
        narration=body.narration,
        start_date=start,
        count=count,
        postings_spec=postings_spec,
        default_currency=body.currency,
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
    account: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    tags: list[str] = Query([]),
    payee: str | None = Query(None),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """List series, grouped by series ID, honouring the global filters.

    Any transactions from clamp_opt's synthetic "S" entries are ignored —
    they don't carry ``ledgr-series`` metadata and would never group, but
    dropping them keeps the loop clean.
    """
    entries = get_filtered_entries(
        ledger, view_mode,
        account=account,
        from_date=datetime.date.fromisoformat(from_date) if from_date else None,
        to_date=datetime.date.fromisoformat(to_date) if to_date else None,
        tags=tags or None,
        payee=payee,
    )

    series_map: dict[str, list[data.Transaction]] = {}
    for entry in entries:
        if not isinstance(entry, data.Transaction):
            continue
        sid = entry.meta.get("ledgr-series")
        if sid:
            series_map.setdefault(sid, []).append(entry)

    summaries = [
        _summarize_series(sid, txns) for sid, txns in series_map.items()
    ]
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

    # Determine if this is a split series
    positive_postings = [
        p for p in txns[0].postings if p.units and p.units.number > 0
    ]
    is_split = len(positive_postings) > 1

    if body.new_amount is not None and is_split:
        raise HTTPException(
            status_code=400,
            detail="Cannot change amount for a split series.",
        )

    # Reconstruct postings_spec from first transaction's postings
    postings_spec: list[dict] = []
    default_currency = body.new_currency
    for p in txns[0].postings:
        if p.units is None:
            postings_spec.append({
                "account": p.account,
                "amount": None,
                "currency": None,
            })
        else:
            postings_spec.append({
                "account": p.account,
                "amount": p.units.number,
                "currency": p.units.currency,
            })
            if default_currency is None:
                default_currency = p.units.currency

    # If new_amount provided (simple series): replace positive/negative amounts
    if body.new_amount is not None:
        for spec in postings_spec:
            if spec["amount"] is not None and spec["amount"] > 0:
                spec["amount"] = body.new_amount
                if body.new_currency:
                    spec["currency"] = body.new_currency
            elif spec["amount"] is not None and spec["amount"] < 0:
                spec["amount"] = -body.new_amount
                if body.new_currency:
                    spec["currency"] = body.new_currency

    new_txns = generate_series_transactions(
        series_type="recurring",
        series_id=series_id,
        payee=txns[0].payee or "",
        narration=txns[0].narration or "",
        start_date=next_start,
        count=new_count,
        postings_spec=postings_spec,
        default_currency=default_currency or "",
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
