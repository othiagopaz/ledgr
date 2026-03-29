"""Series generator — date math and transaction construction.

Creates lists of Beancount Transaction objects for recurring and
installment series. Pure functions — no I/O, no FavaLedger access.
"""

from __future__ import annotations

import calendar
import datetime
import uuid
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

from beancount.core import amount as amt_mod, data


def generate_series_id(prefix: str = "") -> str:
    """Generate a short unique series ID.

    Args:
        prefix: optional human-readable prefix (e.g., "netflix").
            Sanitized to lowercase, dashes, max 12 chars.

    Returns:
        ``"prefix-hex12"`` or just ``"hex12"`` if no prefix.
    """
    short = uuid.uuid4().hex[:12]
    if prefix:
        clean = prefix.lower().replace(" ", "-")[:12]
        return f"{clean}-{short}"
    return short


def compute_monthly_dates(
    start: datetime.date,
    count: int,
) -> list[datetime.date]:
    """Generate ``count`` monthly dates starting from ``start``.

    Preserves the day-of-month.  If the target month has fewer days,
    clamps to the last day of that month (e.g., Jan 31 → Feb 28).
    """
    dates: list[datetime.date] = []
    for i in range(count):
        year = start.year + (start.month - 1 + i) // 12
        month = (start.month - 1 + i) % 12 + 1
        max_day = calendar.monthrange(year, month)[1]
        day = min(start.day, max_day)
        dates.append(datetime.date(year, month, day))
    return dates


def months_between(start: datetime.date, end: datetime.date) -> int:
    """Count months from ``start`` to ``end``, inclusive of both endpoints."""
    return (end.year - start.year) * 12 + (end.month - start.month) + 1


def generate_series_transactions(
    series_type: Literal["recurring", "installment"],
    series_id: str,
    payee: str,
    narration: str,
    start_date: datetime.date,
    count: int,
    postings_spec: list[dict],
    default_currency: str,
    beancount_file_path: str,
    last_installment_adjustment: Decimal | None = None,
    seq_offset: int = 0,
) -> list[data.Transaction]:
    """Generate a list of Beancount Transaction objects for a series.

    Args:
        series_type: "recurring" or "installment".
        series_id: shared ID for all transactions in the series.
        payee: transaction payee.
        narration: base narration.
        start_date: first transaction date.
        count: number of transactions to generate.
        postings_spec: list of dicts with keys ``account``,
            ``amount`` (Decimal | None), ``currency`` (str | None).
            ``amount=None`` produces an auto-balance posting.
        default_currency: fallback currency when a posting omits it.
        beancount_file_path: for metadata source.
        last_installment_adjustment: if set, the last txn scales all
            explicit amounts proportionally (handles remainder from
            division for ``amount_is_total``).
        seq_offset: for extend operations — start sequence numbering from
            this value (only relevant for installments, default 0).

    Returns:
        List of Transaction objects ready for ``insert_entries()``.
    """
    dates = compute_monthly_dates(start_date, count)
    transactions: list[data.Transaction] = []
    total_display = seq_offset + count

    # Pre-compute base total for proportional scaling (sum of positive explicit amounts).
    base_total = sum(
        s["amount"] for s in postings_spec
        if s.get("amount") is not None and s["amount"] > 0
    )

    for i, txn_date in enumerate(dates):
        seq = seq_offset + i + 1  # 1-indexed

        # --- Narration ---
        txn_narration = narration

        # --- Metadata ---
        meta = data.new_metadata(beancount_file_path, 0)
        meta["ledgr-series"] = series_id
        meta["ledgr-series-type"] = series_type
        if series_type == "installment":
            meta["ledgr-series-seq"] = Decimal(seq)
            meta["ledgr-series-total"] = Decimal(total_display)

        # --- Postings ---
        is_last = i == len(dates) - 1
        use_adjustment = is_last and last_installment_adjustment is not None

        postings: list[data.Posting] = []
        for spec in postings_spec:
            spec_amount = spec.get("amount")
            cur = spec.get("currency") or default_currency

            if spec_amount is None:
                # Auto-balance posting
                postings.append(
                    data.Posting(spec["account"], None, None, None, None, None)
                )
            else:
                if use_adjustment and base_total:
                    scale = last_installment_adjustment / base_total
                    scaled = (spec_amount * scale).quantize(
                        Decimal("0.01"), ROUND_HALF_UP
                    )
                else:
                    scaled = spec_amount
                postings.append(
                    data.Posting(
                        spec["account"],
                        amt_mod.Amount(scaled, cur),
                        None, None, None, None,
                    )
                )

        txn = data.Transaction(
            meta,
            txn_date,
            "!",  # all series transactions start as planned
            payee,
            txn_narration,
            frozenset(),   # no tags
            frozenset(),   # no links
            postings,
        )
        transactions.append(txn)

    return transactions
