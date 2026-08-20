"""Transaction CRUD endpoints.

GET, POST, PUT, DELETE for transactions.  Mutations use ``FavaLedger.file``
— never raw ``open()``.  See AGENTS.md §9.
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Any

from beancount.core import amount as amt_mod, data, interpolate
from beancount.parser import printer
from fastapi import APIRouter, Depends, Query
from fava.beans.funcs import hash_entry
from fava.core import FavaLedger
from fava.core.file import get_entry_slice
from pydantic import BaseModel

from ledger import get_filtered_entries, get_ledger, reload_ledger
from serializers import quantize_amount, serialize_transaction

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
    # Source file of the entry. Required to disambiguate `lineno`, which repeats
    # across `include`d files. Optional for backwards compatibility.
    filename: str | None = None


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
            units = amt_mod.Amount(quantize_amount(p.amount), p.currency)
        if p.cost is not None and p.cost_currency:
            cost = data.CostSpec(p.cost, None, p.cost_currency, None, None, False)
        if p.price is not None and p.price_currency:
            price = amt_mod.Amount(p.price, p.price_currency)
        bc_postings.append(
            data.Posting(p.account, units, cost, price, None, None)
        )
    return bc_postings


def _validate_balance(
    bc_postings: list[data.Posting], options_map: dict
) -> list[str]:
    """Return balance errors for a set of postings, or an empty list.

    Mirrors how Beancount's own booking (``interpolate.balance_incomplete_postings``)
    treats a transaction:

    * A posting with an elided amount (``units is None``) is *incomplete* —
      Beancount auto-balances it (a single such posting) or raises its own
      error at load time (two or more). We do not pre-reject these; letting
      the loader own that path keeps legitimate elided-amount entries working.
    * When every posting is fully specified, the transaction must balance to
      zero per currency, within the per-currency tolerance that Beancount
      infers from the amounts' precision (``infer_tolerances``). Anything
      outside tolerance is a real imbalance and must not be written.
    """
    # If any posting has an elided amount, defer to Beancount's booking —
    # it interpolates the missing weight (or errors) at load time.
    if any(p.units is None for p in bc_postings):
        return []

    residual = interpolate.compute_residual(bc_postings)
    if residual.is_empty():
        return []

    tolerances = interpolate.infer_tolerances(bc_postings, options_map)
    errors: list[str] = []
    for position in residual.get_positions():
        currency = position.units.currency
        tolerance = tolerances.get(currency, Decimal("0.005"))
        if abs(position.units.number) > tolerance:
            errors.append(
                f"Transaction does not balance: {position.units} "
                f"residual exceeds tolerance {tolerance} {currency}"
            )
    return errors


def _find_entry_by_lineno(
    entries: list, lineno: int, filename: str | None = None
) -> data.Transaction | None:
    """Find a Transaction by source position.

    ``lineno`` on its own is **not** a unique identifier. A ledger split across
    ``include`` files repeats every line number once per file — on a real
    8-file ledger 52% of them collide. Matching on lineno alone returns
    whichever entry the loader ordered first, so an edit meant for
    ``2025.beancount`` line 1239 could be written to ``2019.beancount`` line
    1239 instead: the user's own transaction stays unchanged (looking like the
    edit "did not persist") while an unrelated year silently gains a stray
    entry.

    ``filename`` disambiguates. It stays optional so older clients still work,
    but any caller that has it should pass it.
    """
    for entry in entries:
        if not isinstance(entry, data.Transaction):
            continue
        if entry.meta.get("lineno") != lineno:
            continue
        if filename is not None and entry.meta.get("filename") != filename:
            continue
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
    # clamp_opt emits synthetic "S" (Summarize) entries at begin-1 that
    # carry the pre-period balance of every real account. When the caller
    # asks for a specific account+date window, sum the "S" postings on
    # that account so the frontend can seed the running balance correctly.
    opening_balance = Decimal("0")
    if account and (from_date or to_date):
        for e in entries:
            if isinstance(e, data.Transaction) and e.flag == "S":
                for p in e.postings:
                    if p.account == account and p.units:
                        opening_balance += p.units.number

    # Exclude synthetic entries from clamp_opt() (flag "S") — those are
    # internal opening-balance entries, not real user transactions.
    txns = [
        e for e in entries
        if isinstance(e, data.Transaction) and e.flag in ("*", "!")
    ]
    result = [serialize_transaction(t) for t in txns]
    return {
        "transactions": result,
        "count": len(result),
        "opening_balance": str(opening_balance),
    }


def _validate_active_accounts(
    ledger: FavaLedger,
    postings: list[data.Posting],
    txn_date: datetime.date,
) -> list[str]:
    """Reject postings to an account that is not open on ``txn_date``.

    Beancount reports both cases as "Invalid reference to inactive account" —
    its "inactive" covers an account that is **not yet open** as well as one
    that has been closed. It only reports them at load time though, *after* the
    transaction has been written, leaving a validation error in the user's
    ledger while the API already answered ``success: true``. Checking first
    keeps the file clean.

    Two windows are rejected:

    * ``txn_date`` **before** the ``open`` date — the account did not exist yet.
      Easy to hit by backdating: a `2026-01-01 open` with a posting dated
      2025-12-11 breaks the ledger.
    * ``txn_date`` **on or after** a ``close`` date — the account is retired.

    A ``close`` dated after the transaction is fine: the account was live then.
    """
    opens: dict[str, datetime.date] = {}
    closes: dict[str, datetime.date] = {}
    for entry in ledger.all_entries:
        if isinstance(entry, data.Open):
            opens[entry.account] = entry.date
        elif isinstance(entry, data.Close):
            closes[entry.account] = entry.date

    errors = []
    for posting in postings:
        open_date = opens.get(posting.account)
        if open_date is not None and txn_date < open_date:
            errors.append(
                f"Account '{posting.account}' only opens on "
                f"{open_date.isoformat()}, so it cannot take a posting dated "
                f"{txn_date.isoformat()}. Move the account's opening date back, "
                "or use a later date."
            )
            continue
        close_date = closes.get(posting.account)
        if close_date is not None and txn_date >= close_date:
            errors.append(
                f"Account '{posting.account}' is inactive since "
                f"{close_date.isoformat()} and cannot take new postings. "
                "Reactivate it first, or pick another account."
            )
    return errors


@router.post("/api/transactions")
def add_transaction(
    body: TransactionIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Add a new transaction via FavaLedger.file.insert_entries."""
    txn_date = datetime.date.fromisoformat(body.date)
    bc_postings = _build_bc_postings(body.postings)

    balance_errors = _validate_balance(bc_postings, ledger.options)
    if balance_errors:
        return {"success": False, "errors": balance_errors}

    inactive_errors = _validate_active_accounts(ledger, bc_postings, txn_date)
    if inactive_errors:
        return {"success": False, "errors": inactive_errors}

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
        reload_ledger()
    except Exception as e:
        return {"success": False, "errors": [str(e)]}

    return {"success": True, "transaction": serialize_transaction(txn)}


@router.put("/api/transactions")
def edit_transaction(
    body: EditTransactionIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Edit a transaction via FavaLedger.file.save_entry_slice."""
    entry = _find_entry_by_lineno(
        ledger.all_entries, body.lineno, body.filename
    )
    if entry is None:
        where = f" in {body.filename}" if body.filename else ""
        return {
            "success": False,
            "errors": [f"No transaction found at line {body.lineno}{where}"],
        }

    txn_date = datetime.date.fromisoformat(body.date)
    bc_postings = _build_bc_postings(body.postings)

    balance_errors = _validate_balance(bc_postings, ledger.options)
    if balance_errors:
        return {"success": False, "errors": balance_errors}

    # Start with fresh metadata, then re-apply all ledgr-* keys from the
    # original entry so that series metadata (ledgr-series, ledgr-series-type,
    # ledgr-series-seq, ledgr-series-total) is preserved through edits.
    # Metadata must name the entry's OWN file. Using the main ledger path here
    # was harmless while lookups were ambiguous anyway, but it is wrong: the
    # entry lives wherever it lives.
    new_meta = data.new_metadata(
        str(entry.meta.get("filename") or ledger.beancount_file_path),
        body.lineno,
    )
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
        reload_ledger()
    except Exception as e:
        return {"success": False, "errors": [str(e)]}

    return {"success": True, "transaction": serialize_transaction(new_txn)}


@router.delete("/api/transactions/{lineno}")
def delete_transaction(
    lineno: int,
    filename: str | None = Query(None),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Delete a transaction via FavaLedger.file.delete_entry_slice.

    ``filename`` disambiguates ``lineno`` across ``include``d files — see
    ``_find_entry_by_lineno``.
    """
    entry = _find_entry_by_lineno(ledger.all_entries, lineno, filename)
    if entry is None:
        where = f" in {filename}" if filename else ""
        return {
            "success": False,
            "errors": [f"No transaction found at line {lineno}{where}"],
        }

    try:
        entry_hash_val = hash_entry(entry)
        _, entry_sha = get_entry_slice(entry)
        ledger.file.delete_entry_slice(entry_hash_val, entry_sha)
        reload_ledger()
    except Exception as e:
        return {"success": False, "errors": [str(e)]}

    return {"success": True}
