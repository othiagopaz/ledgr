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

from account_types import (
    build_account_type_map,
    is_cash_account,
    is_investment_account,
    is_loan_account,
    is_operating_working_capital,
)
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
# Classification — ORDER IS CRITICAL (see AGENTS.md §7 & §13)
# ------------------------------------------------------------------
#
# Classification is per **counterpart** (a single non-cash posting account),
# driven by ledgr-type first and account-root prefix only as a last resort.
#
# The check order must be:
#   1. loan                                    → financing
#   2. investment                              → investing
#   3. receivable/prepaid/credit-card/payable  → operating (working capital)
#   4. Income:/Expenses:/Liabilities: prefix   → operating (fallback)
#   5. non-cash Assets: prefix                 → operating (fallback)
#   6. default                                 → transfer
#
# Loans MUST be checked BEFORE generic Liabilities.
# This was a real bug — do not regress.
#
# INVESTING MUST be checked BEFORE OPERATING. Otherwise, investment
# transactions with incidental expenses (commissions, fees) get
# misclassified as operating. Because attribution is now per-counterpart,
# the commission leg lands in operating and the investment leg in investing —
# but this ordering still guards the single-counterpart classification and any
# untyped account that a prefix might otherwise misroute.
#
# Working-capital counterparts (receivable, prepaid, credit-card, payable) are
# OPERATING — e.g. a reimbursement coming in from Assets:Receivables, or a
# credit-card payment settling ordinary spend. credit-card is operating by
# substance over legal form (IAS 7 permits operating OR financing).
# ------------------------------------------------------------------

def classify_posting(
    cash_account: str,
    counterpart: str | None,
    type_map: dict[str, str],
) -> str:
    """Classify a single cash-flow counterpart per IAS 7, using ledgr-type.

    ``counterpart`` is one non-cash posting account (or ``None`` when a cash
    posting has no non-cash counterpart at all — a pure cash↔cash move).

    Assets/Liabilities are classified **entirely by ledgr-type** (loan /
    investment / receivable / prepaid / credit-card / payable). Income and
    Expenses carry no distinguishing type — they are all ``general`` — so their
    account **root** is the only classification signal, and the prefix check for
    them is primary, not a fallback.

    Classification order (CRITICAL — do not rearrange):
      1. FINANCING: ledgr-type "loan"
      2. INVESTING: ledgr-type "investment"
      3. OPERATING: ledgr-type receivable/prepaid/credit-card/payable
                    (working capital), OR an Income:/Expenses: account
      4. TRANSFER: default — Equity, an unrecognised account, or an
                   Asset/Liability missing its (required) ledgr-type. A
                   misconfigured account surfacing here is intentional: it reads
                   as visibly wrong rather than being silently bucketed.
    """
    if counterpart is None:
        return "transfer"

    # ── 1. FINANCING — loan counterpart (BEFORE generic liabilities) ──
    if is_loan_account(counterpart, type_map):
        return "financing"

    # ── 2. INVESTING — investment counterpart (BEFORE operating) ──
    if is_investment_account(counterpart, type_map):
        return "investing"

    # ── 3. OPERATING — working-capital ledgr-type (receivable / prepaid /
    #        credit-card / payable), or an Income/Expenses account (general
    #        type; the root is the signal). ──
    if is_operating_working_capital(counterpart, type_map):
        return "operating"
    if counterpart.startswith(("Income:", "Expenses:")):
        return "operating"

    # ── 4. TRANSFER (default) — Equity, unknown, or an untyped (misconfigured)
    #        Asset/Liability. ──
    return "transfer"


# ------------------------------------------------------------------
# Computation
# ------------------------------------------------------------------

def compute_cashflow(
    entries: list,
    interval: str = "monthly",
    operating_currency: str | None = None,
    type_map: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Compute the Cash Flow Statement for a period.

    Only transactions that touch a **cash** account (ledgr-type ``"cash"``)
    are included. Each cash posting is classified using the ledgr-type-based
    logic in ``classify_posting``.

    Entries are expected to arrive pre-filtered (by ``get_filtered_entries()``).
    Synthetic entries from ``clamp_opt()`` (flag ``"S"``) are excluded — they
    represent opening balances, not real cash movements.

    When ``operating_currency`` is provided, only postings in that currency
    are included in the main totals.  Non-OC postings are collected into
    ``other_items`` / ``other_*`` fields.

    If ``type_map`` is ``None``, it is built from ``entries`` (convenience for tests).

    Returns the shape expected by ``CashFlowResponse`` on the frontend.
    """
    if type_map is None:
        type_map = build_account_type_map(entries)

    oc = operating_currency
    txns = [
        e for e in entries
        if isinstance(e, data.Transaction) and e.flag in ("*", "!")
    ]

    # Collect all cashflow items (OC and other separately)
    items: list[dict[str, Any]] = []
    other_items: list[dict[str, Any]] = []
    periods_set: set[str] = set()

    def emit(item: dict[str, Any]) -> None:
        """Route an item to the OC or non-OC bucket."""
        if oc and item["currency"] != oc:
            other_items.append(item)
        else:
            items.append(item)

    for txn in txns:
        cash_postings = [
            p for p in txn.postings
            if is_cash_account(p.account, type_map) and p.units is not None
        ]
        if not cash_postings:
            continue  # No cash movement → not a cash flow event

        counterpart_postings = [
            p for p in txn.postings
            if not is_cash_account(p.account, type_map) and p.units is not None
        ]

        period = date_to_period(txn.date, interval)
        periods_set.add(period)

        # Attribution is per **currency**: a cash movement is explained by the
        # non-cash counterparts sharing its currency. Cross-currency legs (e.g.
        # buy shares priced in ITOT with a USD cash leg) have no same-currency
        # counterpart and are classified as a whole against the txn's other
        # counterparts — see the "no same-currency counterpart" branch.
        cash_currencies = {p.units.currency for p in cash_postings}

        for cur in cash_currencies:
            cash_c = [p for p in cash_postings if p.units.currency == cur]
            cps_c = [p for p in counterpart_postings if p.units.currency == cur]

            if cps_c:
                # ── Same-currency counterparts: attribute per counterpart ──
                # Each counterpart's cash effect is the negative of its own
                # amount. A mixed transaction thus splits correctly across
                # sections (interest→operating, principal→investing, …), per
                # IAS 7 §12 which requires splitting a mixed transaction.
                attributed = Decimal(0)
                for cp in cps_c:
                    attributed += -cp.units.number
                    emit({
                        "period": period,
                        "account": cash_c[0].account,
                        "counterpart": cp.account,
                        "amount": -cp.units.number,
                        "currency": cur,
                        "category": classify_posting(
                            cash_c[0].account, cp.account, type_map
                        ),
                    })
                # ── Cross-currency residual. The same-currency counterparts only
                # explain part of the cash when another leg is priced in a
                # DIFFERENT currency (a commodity held at cost, or an FX leg) —
                # e.g. buy shares in ITOT with a USD cash leg AND a USD
                # commission: the commission explains only 5 of a 3505 outflow.
                # The remainder is real cash that must be attributed, classified
                # against the txn's other-currency counterpart(s) (investing when
                # one exists, else a transfer). Without this the cross-currency
                # portion of the cash leg would be silently dropped and net cash
                # flow would stop reconciling with the opening/closing balance. ──
                residual = sum((p.units.number for p in cash_c), Decimal(0)) - attributed
                if residual != 0:
                    other_cur_cps = [
                        p.account for p in counterpart_postings
                        if p.units.currency != cur
                    ]
                    if other_cur_cps:
                        category = classify_posting(
                            cash_c[0].account, other_cur_cps[0], type_map
                        )
                        cp_display = (
                            other_cur_cps[0] if len(other_cur_cps) == 1 else "Split"
                        )
                    else:
                        # No other-currency counterpart → net movement between
                        # the txn's own cash accounts → transfer.
                        category = "transfer"
                        cash_names = [p.account for p in cash_c]
                        cp_display = cash_names[0] if len(cash_names) == 1 else "Split"
                    emit({
                        "period": period,
                        "account": cash_c[0].account,
                        "counterpart": cp_display,
                        "amount": residual,
                        "currency": cur,
                        "category": category,
                    })
            else:
                # ── No same-currency counterpart. Either a pure cash↔cash move
                #    (bank transfer) or a cross-currency leg whose counterpart is
                #    priced in another currency (asset purchase / FX). Classify
                #    each cash posting as a whole against the *other-currency*
                #    counterparts, mirroring the legacy per-cash-posting rule. ──
                other_cur_cps = [
                    p.account for p in counterpart_postings
                    if p.units.currency != cur
                ]
                for posting in cash_c:
                    if other_cur_cps:
                        category = classify_posting(
                            posting.account, other_cur_cps[0], type_map
                        )
                        cp_display = (
                            other_cur_cps[0]
                            if len(other_cur_cps) == 1
                            else "Split"
                        )
                    else:
                        # Pure cash↔cash: label with the other cash account(s).
                        other_cash = [
                            p.account for p in cash_c
                            if p.account != posting.account
                        ]
                        category = "transfer"
                        cp_display = (
                            other_cash[0] if len(other_cash) == 1 else "Split"
                        )
                    emit({
                        "period": period,
                        "account": posting.account,
                        "counterpart": cp_display,
                        "amount": posting.units.number,
                        "currency": cur,
                        "category": category,
                    })

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
    balances = _compute_period_asset_balances(all_txns, periods, interval, oc, type_map)

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
    type_map: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Compute opening and closing cash balances for each period.

    Only accounts with ledgr-type ``"cash"`` are included.

    When ``operating_currency`` is provided, returns OC balances in
    ``opening``/``closing`` and non-OC balances in ``other_opening``/
    ``other_closing``.
    """
    if type_map is None:
        type_map = {}
    oc = operating_currency
    cumulative = Decimal(0)
    # currency → cumulative Decimal
    other_cumulative: dict[str, Decimal] = {}
    period_end_balance: dict[str, float] = {}
    # period → currency → Decimal
    period_end_other: dict[str, dict[str, Decimal]] = {}

    for txn in all_txns:
        for p in txn.postings:
            if is_cash_account(p.account, type_map) and p.units is not None:
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
