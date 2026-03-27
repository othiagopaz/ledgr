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

from ledgr_options import DEFAULT_CASH_PREFIXES, DEFAULT_INVESTMENT_PREFIXES
from serializers import decimal_to_report_number, format_other_balances


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
# Helpers
# ------------------------------------------------------------------

def _is_cash_account(account: str, cash_prefixes: tuple[str, ...]) -> bool:
    """Return True if account is a cash/liquid account (bank or physical cash)."""
    return any(account.startswith(pfx) for pfx in cash_prefixes)


# ------------------------------------------------------------------
# Classification — ORDER IS CRITICAL (see AGENTS.md §7 & §13)
# ------------------------------------------------------------------
#
# Three tiers of Assets: accounts:
#   cash        → cash_prefixes (Assets:Bank, Assets:Cash)
#   investment  → investment_prefixes (Assets:Investments, Assets:Broker)
#   other       → everything else (Assets:Receivables, Assets:Vehicle, …)
#
# The check order must be:
#   1. Liabilities:Loans   → financing
#   2. Investment asset counterpart → investing
#   3. Income / Expenses / Liabilities / other non-cash asset → operating
#   4. default  → transfer
#
# Liabilities:Loans MUST be checked BEFORE the generic Liabilities: prefix.
# This was a real bug — do not regress.
#
# INVESTING MUST be checked BEFORE OPERATING. Otherwise, investment
# transactions with incidental expenses (commissions, fees) get
# misclassified as operating. Dividends still classify as operating
# because they flow from Income → cash account (no investment counterpart).
#
# "Other" non-cash assets (Receivables, Deposits…) are OPERATING working
# capital — e.g. a reimbursement coming in from Assets:Receivables.
# ------------------------------------------------------------------

def classify_posting(
    cash_account: str,
    counterparts: list[str],
    cash_prefixes: tuple[str, ...] = DEFAULT_CASH_PREFIXES,
    investment_prefixes: tuple[str, ...] = DEFAULT_INVESTMENT_PREFIXES,
) -> str:
    """Classify a cash flow posting per IAS 7 categories using 3-tier asset logic.

    Asset tiers:
      - **Cash** (``cash_prefixes``): bank accounts, physical cash — these are
        the only accounts that generate cash flow postings.
      - **Investment** (``investment_prefixes``): brokerage, investment accounts —
        counterpart triggers INVESTING classification.
      - **Other non-cash** (everything else): receivables, deposits, vehicles —
        counterpart triggers OPERATING (working capital).

    Order (CRITICAL — do not rearrange):
      1. FINANCING: counterpart is Liabilities:Loans (must be first)
      2. INVESTING: counterpart is an investment account
      3. OPERATING: counterpart is Income/Expenses/Liabilities/other non-cash asset
      4. TRANSFER: default (cash ↔ cash, e.g. bank transfer)

    Investing is checked BEFORE operating so that investment transactions with
    incidental expenses (commissions, fees) are correctly classified as investing,
    not operating. Dividends classify as operating because they flow from
    Income → cash account (no investment counterpart).
    """
    # ── Step 1: FINANCING (Liabilities:Loans BEFORE generic Liabilities) ──
    for cp in counterparts:
        if cp.startswith("Liabilities:Loans"):
            return "financing"

    # ── Step 2: INVESTING — counterpart is an investment account ──
    for cp in counterparts:
        if cp.startswith("Assets:") and not _is_cash_account(cp, cash_prefixes):
            if any(cp.startswith(pfx) for pfx in investment_prefixes):
                return "investing"

    # ── Step 3: OPERATING — Income / Expenses / Liabilities / other non-cash asset ──
    for cp in counterparts:
        if cp.startswith(("Income:", "Expenses:", "Liabilities:")):
            return "operating"
        if cp.startswith("Assets:") and not _is_cash_account(cp, cash_prefixes):
            return "operating"  # "other" non-cash (Receivables, Deposits, …)

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
    operating_currency: str | None = None,
    cash_prefixes: tuple[str, ...] = DEFAULT_CASH_PREFIXES,
    investment_prefixes: tuple[str, ...] = DEFAULT_INVESTMENT_PREFIXES,
) -> dict[str, Any]:
    """Compute the Cash Flow Statement for a period.

    Only transactions that touch a **cash** account (``cash_prefixes`` whitelist)
    are included. Each cash posting is classified using the 3-tier asset logic
    in ``classify_posting``.

    When ``operating_currency`` is provided, only postings in that currency
    are included in the main totals.  Non-OC postings are collected into
    ``other_items`` / ``other_*`` fields.

    Returns the shape expected by ``CashFlowResponse`` on the frontend.
    """
    oc = operating_currency
    txns = [e for e in entries if isinstance(e, data.Transaction)]

    if from_date:
        d = datetime.date.fromisoformat(from_date)
        txns = [t for t in txns if t.date >= d]
    if to_date:
        d = datetime.date.fromisoformat(to_date)
        txns = [t for t in txns if t.date <= d]

    # Collect all cashflow items (OC and other separately)
    items: list[dict[str, Any]] = []
    other_items: list[dict[str, Any]] = []
    periods_set: set[str] = set()

    for txn in txns:
        cash_postings = [
            p for p in txn.postings
            if _is_cash_account(p.account, cash_prefixes) and p.units is not None
        ]
        if not cash_postings:
            continue  # No cash movement → not a cash flow event

        counterparts = [
            p.account for p in txn.postings
            if not _is_cash_account(p.account, cash_prefixes)
        ]

        period = date_to_period(txn.date, interval)
        periods_set.add(period)

        for posting in cash_postings:
            category = classify_posting(
                posting.account, counterparts, cash_prefixes, investment_prefixes
            )

            if counterparts:
                cp_display = (
                    counterparts[0] if len(counterparts) == 1 else "Split"
                )
            else:
                # All postings are cash accounts — show the other one(s)
                other_cash = [
                    p.account for p in txn.postings if p.account != posting.account
                ]
                cp_display = (
                    other_cash[0] if len(other_cash) == 1 else "Split"
                )

            item = {
                "period": period,
                "account": posting.account,
                "counterpart": cp_display,
                "amount": posting.units.number,
                "currency": posting.units.currency,
                "category": category,
            }

            if oc and posting.units.currency != oc:
                other_items.append(item)
            else:
                items.append(item)

    periods = sorted(periods_set)

    # Aggregate by category and period (OC only)
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

    # Net cash flow per period (OC only)
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
    balances = _compute_period_asset_balances(all_txns, periods, interval, oc, cash_prefixes)

    # Breakdown: group items by counterpart within each category (OC only)
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
                if cat == "investing" and cp.startswith("Assets:"):
                    short = cp[len("Assets:"):]  # "Investments:Account", "Broker:XP"
                else:
                    short = cp.split(":")[-1] if ":" in cp else cp
                result.append({
                    "name": short,
                    "full_name": cp,
                    "totals": totals_map,
                    "total": round(sum(totals_map.values()), 2),
                })
        return result

    # Build other-currency breakdown per category
    def build_other_breakdown(cat: str) -> list[dict[str, Any]]:
        # counterpart → period → currency → Decimal
        by_cp: dict[str, dict[str, dict[str, Decimal]]] = {}
        for item in other_items:
            if item["category"] != cat:
                continue
            cp = item["counterpart"]
            p = item["period"]
            c = item["currency"]
            by_cp.setdefault(cp, {}).setdefault(p, {})
            by_cp[cp][p][c] = by_cp[cp][p].get(c, Decimal(0)) + item["amount"]

        result: list[dict[str, Any]] = []
        for cp in sorted(by_cp):
            totals_map: dict[str, list[dict[str, Any]]] = {}
            for p, currs in by_cp[cp].items():
                formatted = format_other_balances(currs)
                if formatted:
                    totals_map[p] = formatted
            if totals_map:
                short = cp.split(":")[-1] if ":" in cp else cp
                result.append({
                    "name": short,
                    "full_name": cp,
                    "totals": totals_map,
                })
        return result

    # Aggregate other-currency net cashflow
    other_net_agg: dict[str, Decimal] = {}
    for item in other_items:
        c = item["currency"]
        other_net_agg[c] = other_net_agg.get(c, Decimal(0)) + item["amount"]

    result: dict[str, Any] = {
        "periods": periods,
        "operating": {
            "totals": operating,
            "total": round(sum(operating.values()), 2),
            "items": build_breakdown("operating"),
            "other_items": build_other_breakdown("operating"),
        },
        "investing": {
            "totals": investing,
            "total": round(sum(investing.values()), 2),
            "items": build_breakdown("investing"),
            "other_items": build_other_breakdown("investing"),
        },
        "financing": {
            "totals": financing,
            "total": round(sum(financing.values()), 2),
            "items": build_breakdown("financing"),
            "other_items": build_other_breakdown("financing"),
        },
        "transfers": {
            "totals": transfers,
            "total": round(sum(transfers.values()), 2),
            "items": build_breakdown("transfer"),
            "other_items": build_other_breakdown("transfer"),
        },
        "net_cashflow": net_cashflow,
        "opening_balance": balances["opening"],
        "closing_balance": balances["closing"],
    }

    if oc:
        result["operating_currency"] = oc
        result["other_net_cashflow"] = format_other_balances(other_net_agg)
        result["other_opening_balance"] = balances.get("other_opening", [])
        result["other_closing_balance"] = balances.get("other_closing", [])

    return result


def _compute_period_asset_balances(
    all_txns: list,
    periods: list[str],
    interval: str,
    operating_currency: str | None = None,
    cash_prefixes: tuple[str, ...] = DEFAULT_CASH_PREFIXES,
) -> dict[str, Any]:
    """Compute opening and closing cash balances for each period.

    Only accounts matching ``cash_prefixes`` are included.

    When ``operating_currency`` is provided, returns OC balances in
    ``opening``/``closing`` and non-OC balances in ``other_opening``/
    ``other_closing``.
    """
    oc = operating_currency
    cumulative = Decimal(0)
    # currency → cumulative Decimal
    other_cumulative: dict[str, Decimal] = {}
    period_end_balance: dict[str, float] = {}
    # period → currency → Decimal
    period_end_other: dict[str, dict[str, Decimal]] = {}

    for txn in all_txns:
        for p in txn.postings:
            if _is_cash_account(p.account, cash_prefixes) and p.units is not None:
                if oc and p.units.currency != oc:
                    c = p.units.currency
                    other_cumulative[c] = other_cumulative.get(c, Decimal(0)) + p.units.number
                else:
                    cumulative += p.units.number
        period = date_to_period(txn.date, interval)
        period_end_balance[period] = decimal_to_report_number(cumulative)
        if oc:
            period_end_other[period] = dict(other_cumulative)

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

    result: dict[str, Any] = {"opening": opening, "closing": closing}

    if oc:
        # Other-currency opening/closing
        first_period = periods[0] if periods else None
        last_period = periods[-1] if periods else None

        other_opening_bal: dict[str, Decimal] = {}
        other_closing_bal: dict[str, Decimal] = {}

        if first_period and first_period in all_periods_sorted:
            idx = all_periods_sorted.index(first_period)
            if idx > 0:
                other_opening_bal = period_end_other.get(all_periods_sorted[idx - 1], {})

        if last_period:
            other_closing_bal = period_end_other.get(last_period, {})

        result["other_opening"] = format_other_balances(other_opening_bal)
        result["other_closing"] = format_other_balances(other_closing_bal)

    return result
