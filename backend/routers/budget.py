"""Budget endpoints — a separate Budget surface (see docs/features/budgets.md).

This is a purely additive feature.  It reads the same accrual data the Income
Statement reads (via ``get_filtered_entries``) but computes its own
three-bucket per-account aggregation in ``budgets.py``.  It does not touch the
3-statement engine.

``allocated`` is **always** taken from Fava's ``ledger.budgets.calculate()`` —
Ledgr never recomputes a budget amount.  Mutations reuse the ``custom``-
directive write pattern proven in ``accounts.py::set_default_payment_account``.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal, InvalidOperation
from typing import Any

from beancount.core import data
from fastapi import APIRouter, Depends, HTTPException, Query
from fava.beans.funcs import hash_entry
from fava.core import FavaLedger
from fava.core.file import get_entry_slice
from pydantic import BaseModel

from account_types import (
    BUDGETABLE_ALLOCATION_TYPES,
    build_account_type_map,
    is_budgetable_allocation,
)
from budgets import (
    accounts_with_activity,
    budgetable_section,
    budgeted_accounts,
    detect_overlap_warnings,
    dedupe_ghost_subtrees,
    list_budget_directives,
    overlaps_budgeted,
    sum_account_postings,
    sum_cash_delta,
)
from ledger import get_filtered_entries, get_ledger
from serializers import decimal_to_report_number

router = APIRouter()

# Budgetable roots, in section order.  Equity is intentionally excluded.
_BUDGETABLE_ROOTS = frozenset({"Income", "Expenses", "Assets", "Liabilities"})

_SECTION_ORDER = ("income", "expenses", "allocations")
_SECTION_LABELS = {
    "income": "Income",
    "expenses": "Expenses",
    "allocations": "Allocations",
}


# ------------------------------------------------------------------
# Month helpers
# ------------------------------------------------------------------

def _month_bounds(month: str) -> tuple[dt.date, dt.date]:
    """Return ``(month_start, month_end)`` for a ``"YYYY-MM"`` string.

    ``month_end`` is the 1st of the *next* month (exclusive upper bound).
    """
    try:
        year_s, mon_s = month.split("-")
        year, mon = int(year_s), int(mon_s)
        start = dt.date(year, mon, 1)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=400, detail=f"Invalid month '{month}', expected YYYY-MM"
        )
    if mon == 12:
        end = dt.date(year + 1, 1, 1)
    else:
        end = dt.date(year, mon + 1, 1)
    return start, end


# ------------------------------------------------------------------
# Core report builder
# ------------------------------------------------------------------

def _build_budget_response(
    ledger: FavaLedger,
    month: str,
    view_mode: str,
) -> dict[str, Any]:
    """Assemble the full budget response for a month.

    Shared by ``GET``, ``PUT``, and ``POST /copy`` so a mutation returns the
    refreshed view in one round trip.
    """
    oc = ledger.options["operating_currency"][0]
    month_start, month_end = _month_bounds(month)
    today = dt.date.today()

    type_map = build_account_type_map(ledger.all_entries)

    directives = list_budget_directives(
        ledger.all_entries, month_start, month_end
    )
    budgeted = budgeted_accounts(directives)
    budgeted_set = set(budgeted)

    # One clamped accrual window; the flag split happens in sum_account_postings.
    entries = get_filtered_entries(
        ledger, "combined", from_date=month_start, to_date=month_end
    )

    # Ghost rows: accounts with activity (per the P toggle) that aren't budgeted
    # and don't overlap a budgeted account's subtree (which would double-count).
    ghost_candidates = [
        a
        for a in sorted(accounts_with_activity(entries, oc, view_mode, type_map))
        if not overlaps_budgeted(a, budgeted_set)
    ]
    # Fold descendant ghosts into their ancestor's rolled-up row so overlapping
    # ghosts don't double-count in the closure (see helper).
    ghosts = dedupe_ghost_subtrees(ghost_candidates)
    accounts = budgeted + ghosts

    # Pace marker upper bound: through today (inclusive) but never past the
    # month.  calculate()'s date_to is exclusive, so use today + 1 day.
    pace_end = min(today + dt.timedelta(days=1), month_end)
    pace_end = max(pace_end, month_start)  # future month → no pace yet

    sections: dict[str, list[dict[str, Any]]] = {
        key: [] for key in _SECTION_ORDER
    }
    pool_alloc = {"income": Decimal(0), "expenses": Decimal(0), "allocations": Decimal(0)}
    # Raw-Decimal running subtotals per section, rounded once at the boundary
    # (mirrors pool_alloc — never re-sum already-rounded floats).
    raw_subtotals: dict[str, dict[str, Decimal]] = {
        key: {"allocated": Decimal(0), "realized": Decimal(0),
              "pending": Decimal(0), "free": Decimal(0)}
        for key in _SECTION_ORDER
    }

    ghost_count = 0
    rendered_budgeted: list[str] = []
    for account in accounts:
        section = budgetable_section(account, type_map)
        if section is None:
            # Defensive: skips Equity and non-investment/loan allocation types
            # (credit-card, receivable, …) — rejected at write time too.
            continue

        is_ghost = account not in budgeted_set
        if not is_ghost:
            rendered_budgeted.append(account)
        if is_ghost:
            allocated = Decimal(0)
            paced = Decimal(0)
        else:
            allocated = ledger.budgets.calculate(
                account, month_start, month_end
            ).get(oc, Decimal(0))
            paced = ledger.budgets.calculate(
                account, month_start, pace_end
            ).get(oc, Decimal(0))

        # Allocation envelopes count transfers in (cash-leg), not interest/gains
        # — mirrors the Cash Flow Statement's "investing" rule.
        # Income and allocations both require a cash counter-leg — mirroring the
        # Cash Flow Statement (which only sees transactions that touch a
        # ledgr-type "cash" account). This keeps money that never becomes
        # spendable cash out of the budget: an employer pension benefit
        # (Income:Salary:Additional → Assets:Investments, no cash leg) or
        # reinvested interest (Income:Interest → Assets:Investments) inflate the
        # accrual Income Statement but never land in your bank, so budgeting
        # against them is a lie. Expenses stay accrual (a credit-card purchase
        # must drain its envelope at purchase, before the bill is paid).
        realized, pending = sum_account_postings(
            entries,
            account,
            oc,
            require_cash_counterpart=(section in ("allocations", "income")),
            type_map=type_map,
        )

        # Income postings are credits (negative); normalize so realized/pending
        # compare directly against the positive allocated amount.
        if section == "income":
            realized = -realized
            pending = -pending

        consumed = realized + (pending if view_mode != "actual" else Decimal(0))
        free = allocated - consumed

        # "Actual + Planned" treats planned as already done: the displayed
        # columns fold pending into realized and blank the pending column, so
        # the numbers match the bar. In "actual" the columns stay split.
        if view_mode != "actual":
            disp_realized = realized + pending
            disp_pending = Decimal(0)
        else:
            disp_realized = realized
            disp_pending = pending

        # A ghost only earns a row if it carries a non-zero number in the
        # current mode — e.g. the cash-leg filter can zero out a liability ghost
        # that only saw card purchases. Skip those silently.
        if is_ghost and consumed == 0:
            continue
        if is_ghost:
            ghost_count += 1

        # Closure uses the "effective allocation": a budgeted account always
        # contributes its directive amount; a ghost contributes its actual
        # consumption (the only signal it has). See docs/features/budgets.md §6.
        effective = consumed if is_ghost else allocated
        pool_alloc[section] += effective

        raw = raw_subtotals[section]
        raw["allocated"] += allocated
        raw["realized"] += disp_realized
        raw["pending"] += disp_pending
        raw["free"] += free

        sections[section].append(
            {
                "account": account,
                "allocated": decimal_to_report_number(allocated),
                "realized": decimal_to_report_number(disp_realized),
                "pending": decimal_to_report_number(disp_pending),
                "free": decimal_to_report_number(free),
                "paced_allocation": decimal_to_report_number(paced),
                "is_ghost": is_ghost,
            }
        )

    section_payloads = []
    for key in _SECTION_ORDER:
        envelopes = sections[key]
        raw = raw_subtotals[key]
        subtotal = {
            "allocated": decimal_to_report_number(raw["allocated"]),
            "realized": decimal_to_report_number(raw["realized"]),
            "pending": decimal_to_report_number(raw["pending"]),
            "free": decimal_to_report_number(raw["free"]),
        }
        section_payloads.append(
            {
                "key": key,
                "label": _SECTION_LABELS[key],
                "subtotal": subtotal,
                "envelopes": envelopes,
            }
        )

    unallocated = (
        pool_alloc["income"] - pool_alloc["expenses"] - pool_alloc["allocations"]
    )

    # ── Cash bridge ──────────────────────────────────────────────────────────
    # The budget is a CASH plan: every section already counts only what touches
    # cash — Income requires a cash leg (a pension benefit / reinvested interest
    # that goes straight to an investment never lands in your bank, so it is not
    # budget income), Allocations are cash↔investment/loan both ways (a
    # contribution out, a withdrawal back in to cover a shortfall), and the cash
    # anchor is the same sum the Cash Flow Statement reports. So the roll-up is:
    #
    #   Income − Expenses − Allocations − Cash timing = Net Cash Flow  (→ 0)
    #
    # The one deliberate accrual is Expenses: a credit-card purchase must drain
    # its envelope at purchase, before the bill is paid. That creates a timing
    # gap — consumed-on-accrual vs cash-out — which is exactly the "Cash timing"
    # line (``other_non_cash`` in the payload, kept for compat). It is the honest
    # price of budgeting the card: card purchases with no cash leg, minus card
    # bill payments (cash leg, non-Expense counterpart), plus any receivable /
    # payable Δ. When there is no open card activity it is 0 and disappears.
    #
    # Per column — "Realized = now, Allocated = will-be":
    #   • Realized  — actual cash this month; Net Cash Flow.realized == the Cash
    #     Flow Statement's net (the anchor).
    #   • Allocated — the projection: the cash you'll end with if the plan plays
    #     out (budgeted income − budgeted expenses/allocations − actual timing).
    #   • Pending   — planned (!) activity (0 in combined, where it folds in).
    inc_raw = raw_subtotals["income"]
    exp_raw = raw_subtotals["expenses"]
    alloc_raw = raw_subtotals["allocations"]

    cash_realized = sum_cash_delta(entries, oc, "actual", type_map)
    # In combined mode planned is treated as done, so the cash anchor includes
    # planned cash movements too (matching the rest of the budget's folding).
    cash_combined = sum_cash_delta(entries, oc, "combined", type_map)
    ncf_realized = cash_realized if view_mode == "actual" else cash_combined
    ncf_pending = (
        Decimal(0) if view_mode != "actual" else (cash_combined - cash_realized)
    )

    net_income: dict[str, Decimal] = {}
    allocations: dict[str, Decimal] = {}
    other: dict[str, Decimal] = {}
    net_cash_flow: dict[str, Decimal] = {}

    for col in ("allocated", "realized", "pending"):
        net_income[col] = inc_raw[col] - exp_raw[col]
        allocations[col] = alloc_raw[col]

    # Realized/pending: Net Cash Flow is the actual cash delta; Other is the plug
    # that makes the column tie to it.
    for col, ncf in (("realized", ncf_realized), ("pending", ncf_pending)):
        net_cash_flow[col] = ncf
        other[col] = net_income[col] - allocations[col] - ncf

    # Allocated is the projection ("will-be"): Net Cash Flow.allocated is the
    # cash you'll end with if the plan plays out — budgeted income minus
    # budgeted expenses/allocations minus the actual non-cash movements. Other
    # has no plan, so its allocated mirrors its realized value.
    other["allocated"] = other["realized"]
    net_cash_flow["allocated"] = (
        net_income["allocated"] - allocations["allocated"] - other["allocated"]
    )

    def _line(d: dict[str, Decimal]) -> dict[str, float]:
        return {k: decimal_to_report_number(v) for k, v in d.items()}

    bridge = {
        "net_income": _line(net_income),
        "allocations": _line(allocations),
        "other_non_cash": _line(other),
        "net_cash_flow": _line(net_cash_flow),
    }

    return {
        "month": month,
        "operating_currency": oc,
        "pool": {
            "income_allocated": decimal_to_report_number(pool_alloc["income"]),
            "expense_allocated": decimal_to_report_number(pool_alloc["expenses"]),
            "allocation_allocated": decimal_to_report_number(
                pool_alloc["allocations"]
            ),
            "unallocated": decimal_to_report_number(unallocated),
        },
        "sections": section_payloads,
        "bridge": bridge,
        "ghost_count": ghost_count,
        "warnings": detect_overlap_warnings(rendered_budgeted),
    }


# ------------------------------------------------------------------
# Directive CRUD helpers
# ------------------------------------------------------------------

def _find_budget_entries(
    ledger: FavaLedger,
    account: str,
    month_start: dt.date,
    month_end: dt.date,
) -> list[data.Custom]:
    """All ``custom "budget"`` directives for ``(account, month)``.

    Normally there is exactly one, but a file can accumulate duplicates (a copy
    or hand-edit).  Fava's ``BudgetModule`` keeps only the *last* directive per
    account+date, so an edit to any other duplicate is silently ignored.  The
    write path uses this to rewrite one and delete the rest, converging back to
    a single directive (invariant: one per account/month).
    """
    return [
        e
        for e in ledger.all_entries
        if isinstance(e, data.Custom)
        and e.type == "budget"
        and e.values
        and str(e.values[0].value) == account
        and month_start <= e.date < month_end
    ]


def _entry_lineno(entry: data.Custom) -> int:
    """Source line of a directive (for bottom-up file edits)."""
    return entry.meta.get("lineno", 0) if entry.meta else 0


def _validate_budget_account(
    ledger: FavaLedger,
    account: str,
    type_map: dict[str, str],
) -> list[str]:
    """Validate a budgetable account; return non-blocking warnings.

    Raises 400 for a non-existent account, a non-budgetable root (Equity), or
    an Assets/Liabilities account whose ledgr-type is not a valid allocation
    (only ``investment`` and ``loan`` qualify — cash, receivable, prepaid,
    credit-card and payable are financial movements, not budget envelopes).
    """
    opens = {e.account for e in ledger.all_entries if isinstance(e, data.Open)}
    if account not in opens:
        raise HTTPException(
            status_code=400, detail=f"Account '{account}' not found"
        )

    root = account.split(":")[0]
    if root not in _BUDGETABLE_ROOTS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot budget '{account}': only "
                f"{', '.join(sorted(_BUDGETABLE_ROOTS))} accounts are budgetable."
            ),
        )

    if root in ("Assets", "Liabilities") and not is_budgetable_allocation(
        account, type_map
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot budget '{account}': only "
                f"{' / '.join(sorted(BUDGETABLE_ALLOCATION_TYPES))}-typed "
                f"accounts are allocation envelopes; everything else is a "
                f"financial movement, not a budget target."
            ),
        )

    return []


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------

@router.get("/api/budget")
def get_budget(
    month: str = Query(..., description="Budget month, YYYY-MM"),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Budget pool, sections, and ZBB closure for a month."""
    return _build_budget_response(ledger, month, view_mode)


class SetBudgetIn(BaseModel):
    month: str
    account: str
    amount: str | None = None


@router.put("/api/budget")
def set_budget(
    body: SetBudgetIn,
    view_mode: str = Query("combined", pattern="^(actual|planned|combined)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Set, edit, or clear one envelope's allocation.

    ``amount`` null / empty / ``"0"`` clears the directive.  Otherwise the one
    directive for ``(account, month)`` is rewritten in place (or appended if
    absent) — never duplicated.
    """
    oc = ledger.options["operating_currency"][0]
    month_start, month_end = _month_bounds(body.month)
    type_map = build_account_type_map(ledger.all_entries)

    warnings = _validate_budget_account(ledger, body.account, type_map)

    # Parse + decide clear vs set.
    clear = body.amount is None or body.amount.strip() == ""
    quantized: Decimal | None = None
    if not clear:
        try:
            quantized = Decimal(body.amount).quantize(Decimal("0.01"))
        except (InvalidOperation, ValueError):
            raise HTTPException(
                status_code=400, detail=f"Invalid amount '{body.amount}'"
            )
        # Decimal("NaN").quantize(...) returns NaN instead of raising — reject
        # non-finite values explicitly so they never reach the ledger file.
        if not quantized.is_finite():
            raise HTTPException(
                status_code=400, detail=f"Invalid amount '{body.amount}'"
            )
        if quantized < 0:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Budget allocation must be non-negative, got "
                    f"'{body.amount}'. The section sign is applied by the "
                    f"closure, not the entered amount."
                ),
            )
        if quantized == 0:
            clear = True

    matches = _find_budget_entries(
        ledger, body.account, month_start, month_end
    )
    # Process file edits bottom-up (highest lineno first) so each save_entry_slice
    # call — which locates the entry by line number — isn't thrown off by a
    # deletion above it shifting the lines.
    matches.sort(key=_entry_lineno, reverse=True)

    def _delete(entry: data.Custom) -> None:
        _, entry_sha = get_entry_slice(entry)
        ledger.file.save_entry_slice(hash_entry(entry), "", entry_sha)

    def _rewrite(entry: data.Custom, source: str) -> None:
        _, entry_sha = get_entry_slice(entry)
        ledger.file.save_entry_slice(hash_entry(entry), source, entry_sha)

    if clear:
        # Remove every directive for (account, month) — including duplicates.
        for entry in matches:
            _delete(entry)
    else:
        assert quantized is not None
        source = (
            f'{body.month}-01 custom "budget" {body.account} '
            f'"monthly" {quantized} {oc}'
        )
        if matches:
            # Delete all but the lowest-lineno directive (bottom-up), then
            # rewrite that one — converging duplicates to a single directive.
            keep = matches[-1]  # lowest lineno (matches is desc-sorted)
            for entry in matches[:-1]:
                _delete(entry)
            _rewrite(keep, source)
        else:
            with open(str(ledger.beancount_file_path), "a") as f:
                f.write(f"\n{source}\n")

    ledger.load_file()

    response = _build_budget_response(ledger, body.month, view_mode)
    # Surface write-time warnings (e.g. cash account) alongside overlap ones.
    response["warnings"] = warnings + response["warnings"]
    return response


class CopyBudgetIn(BaseModel):
    from_month: str
    to_month: str


@router.post("/api/budget/copy")
def copy_budget(
    body: CopyBudgetIn,
    view_mode: str = Query("combined", pattern="^(actual|planned|combined)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Copy every budget directive from one month into another, **overwriting**
    the target.

    Re-dates each source directive to the 1st of the target month.  Any existing
    budget directives in the target month are removed first, so the target ends
    up as an exact mirror of the source (no merge, no duplicates).
    """
    from_start, from_end = _month_bounds(body.from_month)
    to_start, to_end = _month_bounds(body.to_month)
    type_map = build_account_type_map(ledger.all_entries)

    source_directives = list_budget_directives(
        ledger.all_entries, from_start, from_end
    )
    if not source_directives:
        raise HTTPException(
            status_code=400,
            detail=f"Source month {body.from_month} has no budget directives.",
        )

    # Build the replacement lines from the source (skip non-budgetable types).
    lines: list[str] = []
    for e in source_directives:
        if len(e.values) < 3:
            continue
        account = str(e.values[0].value)
        # Don't carry forward legacy/hand-edited directives for accounts that
        # are no longer budgetable (e.g. credit-card) — the PUT path rejects
        # them, so copy must not perpetuate them.
        if budgetable_section(account, type_map) is None:
            continue
        interval = str(e.values[1].value)
        amount = e.values[2].value  # an Amount(number, currency)
        # Preserve the directive's own currency — non-OC directives are copied
        # verbatim. Ledgr v1 only *renders* OC, but the file stays faithful.
        lines.append(
            f'{body.to_month}-01 custom "budget" {account} '
            f'"{interval}" {amount.number} {amount.currency}'
        )

    # Overwrite: delete the target month's existing directives first (bottom-up,
    # so save_entry_slice's line lookup isn't shifted by an earlier deletion).
    target_existing = list_budget_directives(ledger.all_entries, to_start, to_end)
    for entry in sorted(target_existing, key=_entry_lineno, reverse=True):
        _, entry_sha = get_entry_slice(entry)
        ledger.file.save_entry_slice(hash_entry(entry), "", entry_sha)

    if lines:
        with open(str(ledger.beancount_file_path), "a") as f:
            f.write("\n" + "\n".join(lines) + "\n")

    ledger.load_file()
    return _build_budget_response(ledger, body.to_month, view_mode)
