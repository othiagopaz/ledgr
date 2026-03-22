"""
Cash Flow Statement — the only custom accounting logic in Ledgr.

Beancount and Fava provide Income Statement, Balance Sheet, and all standard
reports.  The Cash Flow Statement is the one report they do **not** implement,
so all custom accounting logic lives here and only here.

See AGENTS.md §7 for the classification rules and their rationale.

This module must NOT:
- Reload the ``.beancount`` file
- Call ``loader.load_file()``
- Compute account balances — only period deltas
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Any

from beancount.core import data

from serializers import decimal_to_report_number


# ------------------------------------------------------------------
# Utility
# ------------------------------------------------------------------

def date_to_period(d: datetime.date, interval: str) -> str:
    """Convert a date to a period string (``2024-01``, ``2024-Q1``, ``2024``)."""
    if interval == "quarterly":
        q = (d.month - 1) // 3 + 1
        return f"{d.year}-Q{q}"
    elif interval == "yearly":
        return str(d.year)
    else:  # monthly
        return f"{d.year}-{d.month:02d}"


# ------------------------------------------------------------------
# Classification — ORDER IS CRITICAL (see AGENTS.md §7 & §13)
# ------------------------------------------------------------------
#
# The check order must be:
#   1. Liabilities:Loans   → financing
#   2. Income / Expenses / Liabilities (generic)  → operating
#   3. Assets:Investments / Assets:Broker  → investing
#   4. default  → transfer
#
# Liabilities:Loans MUST be checked BEFORE the generic Liabilities: prefix.
# This was a real bug — do not regress.
# ------------------------------------------------------------------

def classify_posting(
    asset_account: str,
    counterparts: list[str],
    all_accounts_in_txn: list[str] | None = None,
) -> str:
    """Classify a cash flow item into operating/investing/financing/transfer.

    Personal-finance heuristic:

    - Counterpart is ``Liabilities:Loans:*`` → **financing**
    - Counterpart is ``Income:*``, ``Expenses:*``, or ``Liabilities:*`` → **operating**
    - Self or counterpart is ``Assets:Investments:*`` or ``Assets:Broker:*`` → **investing**
    - Counterpart is another asset (bank-to-bank) → **transfer**
    - Counterpart is ``Equity:*`` → **transfer** (opening balances)
    """
    # ── Step 1: FINANCING (Liabilities:Loans BEFORE generic Liabilities) ──
    for cp in counterparts:
        if cp.startswith("Liabilities:Loans"):
            return "financing"

    # ── Step 2: OPERATING ──
    for cp in counterparts:
        if (
            cp.startswith("Income:")
            or cp.startswith("Expenses:")
            or cp.startswith("Liabilities:")
        ):
            return "operating"

    # ── Step 3: INVESTING (asset-to-asset, one side is investment) ──
    if all_accounts_in_txn:
        is_self_investment = (
            asset_account.startswith("Assets:Investments")
            or asset_account.startswith("Assets:Broker")
        )
        has_investment_counterpart = any(
            (a.startswith("Assets:Investments") or a.startswith("Assets:Broker"))
            and a != asset_account
            for a in all_accounts_in_txn
        )
        if is_self_investment or has_investment_counterpart:
            return "investing"

    # ── Step 4: TRANSFER (default) ──
    return "transfer"


# ------------------------------------------------------------------
# Computation
# ------------------------------------------------------------------

def compute_cashflow(
    entries: list,
    from_date: str | None = None,
    to_date: str | None = None,
    interval: str = "monthly",
) -> dict[str, Any]:
    """Compute the Cash Flow Statement for a period.

    Only transactions that touch an ``Assets:`` account are included.
    Each asset posting is classified by its counterpart accounts.

    Returns the shape expected by ``CashFlowResponse`` on the frontend.
    """
    txns = [e for e in entries if isinstance(e, data.Transaction)]

    if from_date:
        d = datetime.date.fromisoformat(from_date)
        txns = [t for t in txns if t.date >= d]
    if to_date:
        d = datetime.date.fromisoformat(to_date)
        txns = [t for t in txns if t.date <= d]

    # Collect all cashflow items
    items: list[dict[str, Any]] = []
    periods_set: set[str] = set()

    for txn in txns:
        asset_postings = [
            p for p in txn.postings
            if p.account.startswith("Assets:") and p.units is not None
        ]
        if not asset_postings:
            continue  # No asset movement → not a cash flow event

        counterparts = [
            p.account for p in txn.postings
            if not p.account.startswith("Assets:")
        ]

        period = date_to_period(txn.date, interval)
        periods_set.add(period)

        all_accts = [p.account for p in txn.postings]
        for posting in asset_postings:
            category = classify_posting(posting.account, counterparts, all_accts)

            if counterparts:
                cp_display = (
                    counterparts[0] if len(counterparts) == 1 else "Split"
                )
            else:
                other_assets = [a for a in all_accts if a != posting.account]
                cp_display = (
                    other_assets[0] if len(other_assets) == 1 else "Split"
                )

            items.append({
                "period": period,
                "account": posting.account,
                "counterpart": cp_display,
                "amount": posting.units.number,
                "category": category,
            })

    periods = sorted(periods_set)

    # Aggregate by category and period
    def aggregate(cat: str) -> dict[str, float]:
        totals: dict[str, Decimal] = {}
        for item in items:
            if item["category"] != cat:
                continue
            p = item["period"]
            totals[p] = totals.get(p, Decimal(0)) + item["amount"]
        return {p: decimal_to_report_number(v) for p, v in totals.items()}

    operating = aggregate("operating")
    investing = aggregate("investing")
    financing = aggregate("financing")
    transfers = aggregate("transfer")

    # Net cash flow per period
    net_cashflow: dict[str, float] = {}
    for period in periods:
        net_cashflow[period] = round(
            operating.get(period, 0.0)
            + investing.get(period, 0.0)
            + financing.get(period, 0.0)
            + transfers.get(period, 0.0),
            2,
        )

    # Opening/closing balances per period
    all_txns = sorted(
        [e for e in entries if isinstance(e, data.Transaction)],
        key=lambda t: t.date,
    )
    balances = _compute_period_asset_balances(all_txns, periods, interval)

    # Breakdown: group items by counterpart within each category
    def build_breakdown(cat: str) -> list[dict[str, Any]]:
        by_counterpart: dict[str, dict[str, Decimal]] = {}
        for item in items:
            if item["category"] != cat:
                continue
            cp = item["counterpart"]
            if cp not in by_counterpart:
                by_counterpart[cp] = {}
            p = item["period"]
            by_counterpart[cp][p] = (
                by_counterpart[cp].get(p, Decimal(0)) + item["amount"]
            )

        result: list[dict[str, Any]] = []
        for cp in sorted(by_counterpart):
            totals_map = {
                p: decimal_to_report_number(v)
                for p, v in by_counterpart[cp].items()
                if v != 0
            }
            if totals_map:
                short = cp.split(":")[-1] if ":" in cp else cp
                result.append({
                    "name": short,
                    "full_name": cp,
                    "totals": totals_map,
                    "total": round(sum(totals_map.values()), 2),
                })
        return result

    return {
        "periods": periods,
        "operating": {
            "totals": operating,
            "total": round(sum(operating.values()), 2),
            "items": build_breakdown("operating"),
        },
        "investing": {
            "totals": investing,
            "total": round(sum(investing.values()), 2),
            "items": build_breakdown("investing"),
        },
        "financing": {
            "totals": financing,
            "total": round(sum(financing.values()), 2),
            "items": build_breakdown("financing"),
        },
        "transfers": {
            "totals": transfers,
            "total": round(sum(transfers.values()), 2),
            "items": build_breakdown("transfer"),
        },
        "net_cashflow": net_cashflow,
        "opening_balance": balances["opening"],
        "closing_balance": balances["closing"],
    }


def _compute_period_asset_balances(
    all_txns: list,
    periods: list[str],
    interval: str,
) -> dict[str, dict[str, float]]:
    """Compute opening and closing asset balances for each period."""
    cumulative = Decimal(0)
    period_end_balance: dict[str, float] = {}

    for txn in all_txns:
        for p in txn.postings:
            if p.account.startswith("Assets:") and p.units is not None:
                cumulative += p.units.number
        period = date_to_period(txn.date, interval)
        period_end_balance[period] = decimal_to_report_number(cumulative)

    all_periods_sorted = sorted(period_end_balance.keys())
    opening: dict[str, float] = {}
    closing: dict[str, float] = {}

    for period in periods:
        closing[period] = period_end_balance.get(period, 0.0)
        idx = (
            all_periods_sorted.index(period)
            if period in all_periods_sorted
            else -1
        )
        if idx > 0:
            opening[period] = period_end_balance[all_periods_sorted[idx - 1]]
        else:
            opening[period] = 0.0

    return {"opening": opening, "closing": closing}
