"""Series endpoints — create, list, extend, cancel recurring/installment series.

All mutations use ``FavaLedger.file`` — never raw ``open()``.  See AGENTS.md §9.
"""

from __future__ import annotations

import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Literal

from beancount.core import amount as amt_mod, data
from beancount.parser import printer
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from fava.beans.funcs import hash_entry
from fava.core import FavaLedger
from fava.core.file import get_entry_slice
from pydantic import BaseModel

from ledger import get_filtered_entries, get_ledger, reload_ledger
from serializers import quantize_amount, serialize_transaction
from series import (
    compute_dates,
    generate_series_id,
    generate_series_transactions,
    periods_between,
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
    frequency: Literal["weekly", "monthly", "yearly"] = "monthly"


class SeriesExtendIn(BaseModel):
    new_end_date: str
    new_amount: Decimal | None = None
    new_currency: str | None = None


class SeriesReviseIn(BaseModel):
    """Edit the *pending* run of an existing series in place.

    Confirmed (``*``) transactions are never rewritten (only their installment
    counter may bump). Only the pending (``!``) tail is regenerated.

    ``postings`` (when given) replaces the amounts/accounts of the regenerated
    run. Installments use ``count`` (new total) + ``amount_is_total``; recurring
    use ``frequency`` + ``end_date`` (new horizon for the pending run).
    """
    postings: list[PostingSpecIn] | None = None
    # installment-only
    count: int | None = None
    amount_is_total: bool = False
    # recurring-only
    frequency: Literal["weekly", "monthly", "yearly"] | None = None
    end_date: str | None = None
    # optional passthrough (both)
    payee: str | None = None
    narration: str | None = None


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


def _parse_iso_date(value: str, field: str) -> datetime.date:
    """Parse an ISO ``YYYY-MM-DD`` date, raising a clean 400 on bad input.

    The frontend normalizes dates to ISO before sending; this guards against a
    malformed value (e.g. a day-first ``31/12/2026`` string) becoming an
    unhandled ``ValueError`` → 500.
    """
    try:
        return datetime.date.fromisoformat(value)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail=f"'{field}' must be an ISO date (YYYY-MM-DD); got {value!r}.",
        )


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
    # A series' "current" shape is its going-forward run. After a revise, the
    # confirmed (*) txns keep their old amounts/accounts/cadence, but what the
    # user sees + edits is the pending (!) run. So read the representative
    # posting shape, amount, and frequency from a pending txn when one exists;
    # fall back to the first txn for a fully-confirmed series.
    repr_txn = next((t for t in txns if t.flag == "!"), first)
    frequency = repr_txn.meta.get("ledgr-series-freq", "monthly")
    confirmed = sum(1 for t in txns if t.flag == "*")
    pending = sum(1 for t in txns if t.flag == "!")

    # Build the representative postings list (from the pending run when present).
    postings_out: list[dict[str, str | None]] = []
    positive_amounts: list[Decimal] = []
    account_to = ""
    account_from = ""
    currency = ""
    for p in repr_txn.postings:
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
        "frequency": frequency,
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
    start = _parse_iso_date(body.start_date, "start_date")

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
    # amount_is_total with a multiposting (>1 positive leg) divides EVERY leg by
    # count — each installment is the whole txn at 1/count. That needs an
    # auto-balance leg to absorb per-installment rounding.
    multiposting_total = body.amount_is_total and positive_count > 1
    if multiposting_total and auto_balance_count != 1:
        raise HTTPException(
            status_code=400,
            detail=(
                "'amount_is_total' with multiple positive postings needs exactly "
                "one auto-balance posting (leave one amount blank)."
            ),
        )

    # --- Validation & count derivation ---
    if body.type == "installment":
        if body.count is None:
            raise HTTPException(
                status_code=400,
                detail="Installment series requires 'count'.",
            )
        if body.frequency != "monthly":
            raise HTTPException(
                status_code=400,
                detail="'frequency' is only valid for recurring series; installments are always monthly.",
            )
        count = body.count
    else:  # recurring
        if body.end_date is None:
            raise HTTPException(
                status_code=400,
                detail="Recurring series requires 'end_date'.",
            )
        end = _parse_iso_date(body.end_date, "end_date")
        count = periods_between(start, end, body.frequency)
        if count <= 0:
            raise HTTPException(
                status_code=400,
                detail="'end_date' must be on or after 'start_date'.",
            )

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
    last_spec = None
    if multiposting_total:
        # Divide every explicit leg; auto-balance leg absorbs per-txn rounding.
        last_spec = _divide_total_multiposting(postings_spec, count)
    elif body.amount_is_total:
        # Single positive posting: divide it (+ its matching negative leg).
        for spec in postings_spec:
            if spec["amount"] is not None and spec["amount"] > 0:
                last_adj = _apply_amount_is_total(postings_spec, spec["amount"], count)
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
        frequency=body.frequency,
        last_postings_spec=last_spec,
    )

    try:
        ledger.file.insert_entries(txns)
        reload_ledger()
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

    # The filters decide *which* series are relevant (a series matches if any
    # of its postings pass the filter), but a series summary — progress x/y,
    # total, completed status — describes the whole series. Summarising the
    # filtered subset would truncate e.g. a 13-installment series to the one
    # posting in the window and report it as "1/1 complete". So: collect the
    # matching series IDs from the filtered entries, then summarise each from
    # the *complete* set of its transactions.
    matching_ids: set[str] = set()
    for entry in entries:
        if not isinstance(entry, data.Transaction):
            continue
        sid = entry.meta.get("ledgr-series")
        if sid:
            matching_ids.add(sid)

    # Group every transaction of the matching series from the full ledger.
    full_series_map: dict[str, list[data.Transaction]] = {
        sid: [] for sid in matching_ids
    }
    for entry in ledger.all_entries:
        if not isinstance(entry, data.Transaction):
            continue
        sid = entry.meta.get("ledgr-series")
        if sid in full_series_map:
            full_series_map[sid].append(entry)

    summaries = [
        _summarize_series(sid, txns) for sid, txns in full_series_map.items()
    ]
    summaries.sort(key=lambda s: s.get("first_date", ""), reverse=True)

    return {"series": summaries}


@router.get("/api/series/{series_id}/transactions")
def get_series_transactions(
    series_id: str,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """List every transaction belonging to a series, oldest first.

    Deliberately reads ``ledger.all_entries`` rather than the filtered or
    account-scoped entries: series membership is a property of the
    ``ledgr-series`` metadata, not of any account. Callers used to gather a
    series' occurrences by querying one representative account, which silently
    dropped occurrences posted to a different account — e.g. after a revise
    re-pointed a leg, the already-confirmed occurrences kept the old account
    and disappeared from the list while the counts still said otherwise.
    """
    txns = _get_series_transactions(ledger.all_entries, series_id)
    txns.sort(key=lambda t: (t.date, t.meta.get("lineno") or 0))
    result = [serialize_transaction(t) for t in txns]
    return {"transactions": result, "count": len(result)}


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
    # Preserve the series' own cadence (missing key ⇒ monthly).
    frequency = txns[0].meta.get("ledgr-series-freq", "monthly")

    # Determine current state
    current_last_date = max(t.date for t in txns)
    new_end = _parse_iso_date(body.new_end_date, "new_end_date")
    if new_end <= current_last_date:
        raise HTTPException(
            status_code=400,
            detail=f"new_end_date must be after current last date ({current_last_date.isoformat()}).",
        )

    # Compute next start: one cadence step after the current last date.
    next_start = compute_dates(current_last_date, 2, frequency)[1]

    new_count = periods_between(next_start, new_end, frequency)
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
        frequency=frequency,
    )

    try:
        ledger.file.insert_entries(new_txns)
        reload_ledger()
    except Exception as e:
        return {"success": False, "errors": [str(e)]}

    return {
        "success": True,
        "series_id": series_id,
        "count": len(txns) + len(new_txns),
        "transactions_created": len(new_txns),
    }


def _postings_spec_from_txn(txn: data.Transaction) -> list[dict]:
    """Reconstruct a ``postings_spec`` (account/amount/currency) from a txn.

    ``units is None`` → an auto-balance posting (amount/currency None).
    """
    spec: list[dict] = []
    for p in txn.postings:
        if p.units is None:
            spec.append({"account": p.account, "amount": None, "currency": None})
        else:
            spec.append({
                "account": p.account,
                "amount": p.units.number,
                "currency": p.units.currency,
            })
    return spec


def _installment_series_start(txns: list[data.Transaction]) -> datetime.date:
    """Back-compute the seq-1 date of an installment plan (always monthly).

    Uses the lowest-seq transaction: ``start = date - (seq - 1) months``. This
    makes installment #N's date a pure function of its seq, so the pending run
    lands on the right dates no matter which installments are confirmed.
    """
    ref = min(
        txns,
        key=lambda t: int(t.meta.get("ledgr-series-seq") or 1),
    )
    ref_seq = int(ref.meta.get("ledgr-series-seq") or 1)
    return ref.date - relativedelta(months=ref_seq - 1)


def _build_installments_by_seq(
    series_id: str,
    payee: str,
    narration: str,
    series_start: datetime.date,
    seqs: list[int],
    total: int,
    postings_spec: list[dict],
    default_currency: str,
    beancount_file_path: str,
    last_installment_adjustment: Decimal | None,
    last_postings_spec: list[dict] | None = None,
) -> list[data.Transaction]:
    """Build pending installment txns at *specific* seq slots (monthly).

    Each installment #s falls on ``series_start + (s-1) months`` and carries
    ``ledgr-series-seq = s`` / ``ledgr-series-total = total``. The
    ``last_installment_adjustment`` (if any) scales the highest seq in ``seqs``
    — the plan's final installment absorbs the rounding remainder. An explicit
    ``last_postings_spec`` (per-leg remainder, from a multiposting total-form)
    takes precedence over the scale on that final seq.
    """
    base_total = sum(
        s["amount"] for s in postings_spec
        if s.get("amount") is not None and s["amount"] > 0
    )
    highest = max(seqs) if seqs else None
    out: list[data.Transaction] = []
    for s in seqs:
        meta = data.new_metadata(beancount_file_path, 0)
        meta["ledgr-series"] = series_id
        meta["ledgr-series-type"] = "installment"
        meta["ledgr-series-seq"] = Decimal(s)
        meta["ledgr-series-total"] = Decimal(total)

        is_last = s == highest
        if is_last and last_postings_spec is not None:
            spec_source = last_postings_spec
            use_adjustment = False
        else:
            spec_source = postings_spec
            use_adjustment = is_last and last_installment_adjustment is not None
        postings: list[data.Posting] = []
        for spec in spec_source:
            amt = spec.get("amount")
            cur = spec.get("currency") or default_currency
            if amt is None:
                postings.append(
                    data.Posting(spec["account"], None, None, None, None, None)
                )
            else:
                if use_adjustment and base_total:
                    scale = last_installment_adjustment / base_total
                    amt = (amt * scale).quantize(Decimal("0.01"), ROUND_HALF_UP)
                postings.append(
                    data.Posting(
                        spec["account"], amt_mod.Amount(quantize_amount(amt), cur),
                        None, None, None, None,
                    )
                )
        out.append(data.Transaction(
            meta,
            series_start + relativedelta(months=s - 1),
            "!", payee, narration, frozenset(), frozenset(), postings,
        ))
    return out


def _apply_amount_is_total(
    postings_spec: list[dict], total_amount: Decimal, count: int
) -> Decimal | None:
    """Divide a single positive posting's ``total_amount`` across ``count``.

    Mutates ``postings_spec`` in place (positive + matching negative posting) and
    returns the ``last_installment_adjustment`` (per-txn + remainder) or ``None``.
    Mirrors the create endpoint's rounding exactly.
    """
    per_txn = (total_amount / count).quantize(Decimal("0.01"), ROUND_HALF_UP)
    remainder = total_amount - per_txn * count
    for spec in postings_spec:
        if spec["amount"] is not None and spec["amount"] > 0:
            spec["amount"] = per_txn
        elif spec["amount"] is not None and spec["amount"] < 0:
            spec["amount"] = -per_txn
    return per_txn + remainder if remainder else None


def _divide_total_multiposting(
    postings_spec: list[dict], count: int
) -> list[dict] | None:
    """Divide EVERY explicit leg of a multiposting by ``count`` (total-form).

    Each installment becomes the whole transaction at 1/count scale; an
    auto-balance leg (``amount=None``) absorbs per-installment rounding, so every
    installment balances. Mutates ``postings_spec`` to the per-installment
    amounts and returns an explicit ``last_postings_spec`` in which each leg is
    ``total − per×(count−1)`` so that leg's amounts sum EXACTLY to its original
    total. Returns ``None`` when no rounding remainder exists (no override
    needed). Requires an auto-balance leg — the caller guards that.
    """
    quant = Decimal("0.01")
    last_spec: list[dict] = []
    any_remainder = False
    for spec in postings_spec:
        amt = spec.get("amount")
        if amt is None:
            last_spec.append({**spec})   # auto-balance leg stays auto
            continue
        per = (amt / count).quantize(quant, ROUND_HALF_UP)
        last_amt = amt - per * (count - 1)   # absorbs this leg's remainder
        if last_amt != per:
            any_remainder = True
        last_spec.append({**spec, "amount": last_amt})
        spec["amount"] = per
    return last_spec if any_remainder else None


@router.post("/api/series/{series_id}/revise")
def revise_series(
    series_id: str,
    body: SeriesReviseIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Edit the pending run of a series in place (recurring or installment).

    Confirmed (``*``) transactions are preserved; only the pending (``!``) tail
    is regenerated. Reuses the pure generator/date helpers — no new date or
    rounding math. See ``docs/features/series.md``.
    """
    txns = _get_series_transactions(ledger.all_entries, series_id)
    if not txns:
        raise HTTPException(status_code=404, detail="Series not found.")

    kind = txns[0].meta.get("ledgr-series-type", "recurring")
    freq_stored = txns[0].meta.get("ledgr-series-freq", "monthly")
    payee = body.payee if body.payee is not None else (txns[0].payee or "")
    narration = (
        body.narration if body.narration is not None else (txns[0].narration or "")
    )

    confirmed = [t for t in txns if t.flag == "*"]
    pending = [t for t in txns if t.flag == "!"]
    c = len(confirmed)

    # Where the regenerated run starts: one cadence step after the last
    # confirmed date, or the series' original first date if nothing is confirmed.
    if confirmed:
        last_confirmed = max(t.date for t in confirmed)
        regen_start = compute_dates(last_confirmed, 2, freq_stored)[1]
    else:
        regen_start = min(t.date for t in txns)

    # --- postings_spec for the regenerated run ---
    if body.postings is not None:
        if len(body.postings) < 2:
            raise HTTPException(
                status_code=400, detail="At least 2 postings are required."
            )
        auto_balance = sum(1 for p in body.postings if p.amount is None)
        if auto_balance > 1:
            raise HTTPException(
                status_code=400,
                detail="At most one posting may have amount=None (auto-balance).",
            )
        postings_spec = [
            {"account": p.account, "amount": p.amount, "currency": p.currency}
            for p in body.postings
        ]
    else:
        # Carry forward the existing structure from a representative txn.
        template = pending[0] if pending else confirmed[-1]
        postings_spec = _postings_spec_from_txn(template)

    # Currency for postings that don't name one: prefer an explicit spec
    # currency, else inherit the series' existing currency (from any txn).
    default_currency = ""
    for spec in postings_spec:
        if spec["currency"]:
            default_currency = spec["currency"]
            break
    if not default_currency:
        for t in txns:
            for p in t.postings:
                if p.units is not None:
                    default_currency = p.units.currency
                    break
            if default_currency:
                break

    # --- generate the new pending run (per type) ---
    freq = "monthly"
    new_total = None  # installment total for metadata renumbering

    if kind == "installment":
        if body.frequency is not None and body.frequency != "monthly":
            raise HTTPException(
                status_code=400,
                detail="Installments are always monthly; 'frequency' is not allowed.",
            )
        new_total = body.count if body.count is not None else len(txns)
        if new_total < c:
            raise HTTPException(
                status_code=400,
                detail=f"'count' ({new_total}) cannot be below the "
                       f"{c} already-confirmed installment(s).",
            )

        # Seq-driven: the pending run fills exactly the seq slots in
        # 1..new_total NOT already held by a confirmed installment — so
        # out-of-order confirmation (e.g. seq 5 paid early) can't collide.
        confirmed_seqs = {
            int(t.meta["ledgr-series-seq"])
            for t in confirmed
            if t.meta.get("ledgr-series-seq") is not None
        }
        missing_seqs = [
            s for s in range(1, new_total + 1) if s not in confirmed_seqs
        ]

        last_adj = None
        last_spec = None
        if body.amount_is_total:
            positives = [
                s for s in postings_spec
                if s["amount"] is not None and s["amount"] > 0
            ]
            autos = sum(1 for s in postings_spec if s.get("amount") is None)
            pending_n = len(missing_seqs)
            if len(positives) > 1:
                # Multiposting total-form: divide every leg across the pending
                # run; needs an auto-balance leg to absorb per-installment rounding.
                if autos != 1:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "'amount_is_total' with multiple positive postings needs "
                            "exactly one auto-balance posting (leave one amount blank)."
                        ),
                    )
                if pending_n:
                    last_spec = _divide_total_multiposting(postings_spec, pending_n)
            elif len(positives) == 1:
                if pending_n:
                    last_adj = _apply_amount_is_total(
                        postings_spec, positives[0]["amount"], pending_n
                    )
            else:
                raise HTTPException(
                    status_code=400,
                    detail="'amount_is_total' needs at least one positive posting.",
                )

        new_txns = _build_installments_by_seq(
            series_id=series_id,
            payee=payee,
            narration=narration,
            series_start=_installment_series_start(txns),
            seqs=missing_seqs,
            total=new_total,
            postings_spec=postings_spec,
            default_currency=default_currency,
            beancount_file_path=str(ledger.beancount_file_path),
            last_installment_adjustment=last_adj,
            last_postings_spec=last_spec,
        )
    else:  # recurring
        if body.amount_is_total:
            raise HTTPException(
                status_code=400,
                detail="'amount_is_total' is only valid for installment series.",
            )
        freq = body.frequency or freq_stored
        if body.end_date is None:
            raise HTTPException(
                status_code=400,
                detail="Recurring revise requires 'end_date' (new horizon).",
            )
        end = _parse_iso_date(body.end_date, "end_date")
        regen_count = periods_between(regen_start, end, freq)
        if regen_count < 0:
            regen_count = 0
        new_txns = generate_series_transactions(
            series_type="recurring",
            series_id=series_id,
            payee=payee,
            narration=narration,
            start_date=regen_start,
            count=regen_count,
            postings_spec=postings_spec,
            default_currency=default_currency,
            beancount_file_path=str(ledger.beancount_file_path),
            seq_offset=c,
            frequency=freq,
        )

    errors: list[str] = []

    # 1) Delete old pending (bottom-up so linenos don't shift).
    for txn in sorted(pending, key=lambda t: t.meta.get("lineno", 0), reverse=True):
        try:
            entry_hash = hash_entry(txn)
            _, entry_sha = get_entry_slice(txn)
            ledger.file.delete_entry_slice(entry_hash, entry_sha)
        except Exception as e:  # pragma: no cover - defensive
            errors.append(str(e))
    if pending:
        reload_ledger()

    # 2) For installments whose total changed, rewrite confirmed txns' counter.
    if kind == "installment" and new_total is not None:
        live = _get_series_transactions(ledger.all_entries, series_id)
        for txn in [t for t in live if t.flag == "*"]:
            if txn.meta.get("ledgr-series-total") == Decimal(new_total):
                continue
            new_meta = data.new_metadata(str(ledger.beancount_file_path), 0)
            for k, v in txn.meta.items():
                if isinstance(k, str) and k.startswith("ledgr-"):
                    new_meta[k] = v
            new_meta["ledgr-series-total"] = Decimal(new_total)
            rewritten = data.Transaction(
                new_meta, txn.date, txn.flag, txn.payee or "",
                txn.narration or "", txn.tags, txn.links, txn.postings,
            )
            src = printer.format_entry(rewritten).rstrip("\n")
            try:
                h = hash_entry(txn)
                _, sha = get_entry_slice(txn)
                ledger.file.save_entry_slice(h, src, sha)
            except Exception as e:  # pragma: no cover - defensive
                errors.append(str(e))
        reload_ledger()

    # 3) Insert the regenerated pending run.
    if new_txns:
        try:
            ledger.file.insert_entries(new_txns)
            reload_ledger()
        except Exception as e:
            return {"success": False, "errors": [str(e)]}

    result: dict[str, Any] = {
        "success": len(errors) == 0,
        "series_id": series_id,
        "kept": c,
        "transactions_created": len(new_txns),
    }
    if errors:
        result["errors"] = errors
    return result


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
        reload_ledger()

    result: dict[str, Any] = {
        "success": len(errors) == 0,
        "deleted": deleted,
        "kept": kept,
    }
    if errors:
        result["errors"] = errors
    return result
