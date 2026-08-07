"""Series generator — date math and transaction construction.

Creates lists of Beancount Transaction objects for recurring and
installment series. Pure functions — no I/O, no FavaLedger access.
"""

from __future__ import annotations

import datetime
import uuid
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

from beancount.core import amount as amt_mod, data
from dateutil.relativedelta import relativedelta

#: Recurring cadence. Installments are always a fixed count and do not carry
#: a frequency. Missing metadata reads back as ``"monthly"`` (see routers).
Frequency = Literal["weekly", "monthly", "yearly"]


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


def compute_dates(
    start: datetime.date,
    count: int,
    frequency: Frequency = "monthly",
) -> list[datetime.date]:
    """Generate ``count`` dates starting from ``start`` at the given cadence.

    - ``weekly``: exact 7-day steps.
    - ``monthly``: preserves the day-of-month, clamping to the last day of a
      shorter month (e.g., Jan 31 → Feb 28).
    - ``yearly``: preserves month + day, clamping Feb 29 → Feb 28 in non-leap
      years.

    Monthly/yearly clamping is handled by ``relativedelta``, which already
    snaps overflowing days to month-end.
    """
    dates: list[datetime.date] = []
    for i in range(count):
        if frequency == "weekly":
            dates.append(start + datetime.timedelta(weeks=i))
        elif frequency == "yearly":
            dates.append(start + relativedelta(years=i))
        else:  # monthly
            dates.append(start + relativedelta(months=i))
    return dates


def compute_monthly_dates(
    start: datetime.date,
    count: int,
) -> list[datetime.date]:
    """Back-compat wrapper — monthly cadence. See :func:`compute_dates`."""
    return compute_dates(start, count, "monthly")


def periods_between(
    start: datetime.date,
    end: datetime.date,
    frequency: Frequency = "monthly",
) -> int:
    """Count cadence steps from ``start`` to ``end``, inclusive of both ends.

    Returns how many transactions a recurring series spans when it runs from
    ``start`` through ``end`` at ``frequency``. The ``end`` is treated as an
    upper bound: the last generated date is ``<= end``.

    - ``weekly``: whole 7-day steps that fit, plus one for the start.
    - ``monthly``: whole months between the two, plus one; if ``end``'s day is
      before ``start``'s day-of-month, that final month hasn't come due yet and
      is dropped.
    - ``yearly``: whole years between the two, plus one; if ``end`` falls before
      the anniversary (month/day) that year, the final year is dropped.
    """
    if end < start:
        return 0
    if frequency == "weekly":
        return (end - start).days // 7 + 1
    if frequency == "yearly":
        years = end.year - start.year
        # Drop the final year if end is before this year's anniversary.
        if (end.month, end.day) < (start.month, start.day):
            years -= 1
        return years + 1
    # monthly
    months = (end.year - start.year) * 12 + (end.month - start.month)
    if end.day < start.day:
        months -= 1
    return months + 1


def months_between(start: datetime.date, end: datetime.date) -> int:
    """Back-compat wrapper — monthly cadence. See :func:`periods_between`."""
    return periods_between(start, end, "monthly")


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
    frequency: Frequency = "monthly",
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
        frequency: cadence between transactions. Recorded as
            ``ledgr-series-freq`` for recurring series; installments are
            always monthly and omit the key.

    Returns:
        List of Transaction objects ready for ``insert_entries()``.
    """
    dates = compute_dates(start_date, count, frequency)
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
        else:  # recurring
            # Only stamp non-default cadences; monthly is the implicit
            # default so pre-existing series (no key) read back as monthly.
            if frequency != "monthly":
                meta["ledgr-series-freq"] = frequency

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
