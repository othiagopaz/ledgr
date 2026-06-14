"""
Budget aggregation — three-bucket math over Fava's budget directives.

Beancount has no budget concept, but **Fava does**: ``custom "budget"``
directives are parsed by ``fava.core.budgets.BudgetModule`` into
``ledger.budgets``.  This module never reparses those directives or recomputes
an allocated amount — that is always taken from ``ledger.budgets.calculate()``.

What lives here is the part Fava does *not* do: splitting real postings into
the **realized** (``*``) and **pending** (``!``) buckets per envelope, grouping
budgeted accounts into Income / Expenses / Allocation sections, and the
zero-based-budgeting closure.

See ``docs/features/budgets.md`` for the full design.

This module must NOT:
- Instantiate ``FavaLedger`` or call ``loader.load_file()``
- Reparse budget directives (that is Fava's job — ``ledger.budgets``)
- Use ``float`` for money internally (only at the serialization boundary)
"""

from __future__ import annotations

import datetime
from decimal import Decimal

from beancount.core import data

from account_types import is_budgetable_allocation, is_cash_account

# Roots that map to each Budget section.  Income and Expenses are P&L roots;
# Assets/Liabilities envelopes are *allocation* lines (savings contributions,
# debt paydown).  Equity is rejected at write time and never reaches here.
INCOME_ROOT = "Income"
EXPENSE_ROOT = "Expenses"
ALLOCATION_ROOTS = frozenset({"Assets", "Liabilities"})


def list_budget_directives(
    entries: list,
    month_start: datetime.date,
    month_end: datetime.date,
) -> list[data.Custom]:
    """Custom 'budget' directives dated within ``[month_start, month_end)``."""
    return [
        e
        for e in entries
        if isinstance(e, data.Custom)
        and e.type == "budget"
        and month_start <= e.date < month_end
    ]


def budgeted_accounts(directives: list[data.Custom]) -> list[str]:
    """Distinct budgeted accounts from a list of budget directives, in
    first-seen order.

    A directive's account is its first value (``e.values[0].value``).  Malformed
    directives (no values) are skipped — Fava surfaces them as parse errors.
    """
    seen: set[str] = set()
    accounts: list[str] = []
    for e in directives:
        if not e.values:
            continue
        account = str(e.values[0].value)
        if account not in seen:
            seen.add(account)
            accounts.append(account)
    return accounts


def sum_account_postings(
    entries: list,
    account: str,
    oc: str,
    *,
    require_cash_counterpart: bool = False,
    type_map: dict[str, str] | None = None,
) -> tuple[Decimal, Decimal]:
    """Return ``(realized, pending)`` — operating-currency postings to
    ``account`` and its descendants, split by transaction flag.

    ``*`` transactions accrue to ``realized``; ``!`` transactions to
    ``pending``.  Synthetic ``clamp_opt`` entries (flag ``S``) and any other
    flags are skipped.

    Income-account sign normalization is applied by the caller, not here — the
    raw posting numbers are returned (credits to ``Income:*`` are negative).

    ``require_cash_counterpart`` (allocation envelopes only): count a matching
    posting only when its transaction has at least one **cash** counter-leg —
    i.e. the money actually moved from/to a bank account.  This mirrors the
    Cash Flow Statement's "investing" rule: a contribution
    (``Assets:Cash → Assets:Investments``) counts, but interest/dividends
    (``Income:Interest → Assets:Investments``, no cash leg) do not.  Requires
    ``type_map`` to resolve ``ledgr-type``.
    """
    realized = Decimal(0)
    pending = Decimal(0)
    prefix = account + ":"
    tmap = type_map or {}
    for e in entries:
        if not isinstance(e, data.Transaction) or e.flag not in ("*", "!"):
            continue
        if require_cash_counterpart:
            # The transaction must move cash. A cash leg can be the budgeted
            # posting itself (e.g. budgeting a cash account) or any other leg.
            has_cash = any(
                is_cash_account(p.account, tmap) for p in e.postings
            )
            if not has_cash:
                continue
        for p in e.postings:
            if p.units is None or p.units.currency != oc:
                continue
            if p.account == account or p.account.startswith(prefix):
                if e.flag == "*":
                    realized += p.units.number
                else:
                    pending += p.units.number
    return realized, pending


def section_for_account(account: str) -> str | None:
    """Map an account to its Budget section key.

    ``Income`` → ``"income"``; ``Expenses`` → ``"expenses"``;
    ``Assets``/``Liabilities`` → ``"allocations"``.  Returns ``None`` for any
    other root (e.g. ``Equity``) — such accounts are rejected at write time and
    should never appear here.
    """
    root = account.split(":")[0]
    if root == INCOME_ROOT:
        return "income"
    if root == EXPENSE_ROOT:
        return "expenses"
    if root in ALLOCATION_ROOTS:
        return "allocations"
    return None


def budgetable_section(account: str, type_map: dict[str, str]) -> str | None:
    """Like :func:`section_for_account`, but applies the allocation-type rule.

    An ``Assets``/``Liabilities`` account is only a valid allocation envelope
    when its ledgr-type is ``investment`` or ``loan`` (see
    ``is_budgetable_allocation``).  Cash / receivable / prepaid / credit-card /
    payable accounts are financial movements, not budget envelopes, so they map
    to ``None`` and never appear on the Budget.
    """
    section = section_for_account(account)
    if section == "allocations" and not is_budgetable_allocation(account, type_map):
        return None
    return section


def accounts_with_activity(
    entries: list,
    oc: str,
    view_mode: str,
    type_map: dict[str, str] | None = None,
) -> set[str]:
    """Return budgetable accounts with non-zero OC activity in ``entries``.

    Used to surface "ghost" rows — accounts the user has spent/planned on but
    not budgeted.  Honors ``view_mode``: in ``actual`` only ``*`` postings
    count; in ``combined``/``planned`` both ``*`` and ``!`` count (planned is
    treated as done, matching the bar).  Synthetic ``S`` entries are skipped.

    Only accounts that map to a Budget section are returned (see
    :func:`budgetable_section`): Income/Expenses, plus ``investment``/``loan``
    allocation accounts.  Cash, receivable, prepaid, credit-card and payable
    accounts are financial movements, not budget envelopes, and are excluded —
    they never appear as ghosts.
    """
    flags = ("*",) if view_mode == "actual" else ("*", "!")
    tmap = type_map or {}
    active: set[str] = set()
    for e in entries:
        if not isinstance(e, data.Transaction) or e.flag not in flags:
            continue
        for p in e.postings:
            if p.units is None or p.units.currency != oc:
                continue
            if budgetable_section(p.account, tmap) is None:
                continue
            active.add(p.account)
    return active


def sum_cash_delta(
    entries: list,
    oc: str,
    view_mode: str,
    type_map: dict[str, str],
) -> Decimal:
    """Net change across all ``cash``-typed accounts over ``entries``.

    This is the same quantity the Cash Flow Statement reports as its net — the
    sum of every operating-currency posting to a cash account.  It is the anchor
    the Budget's indirect-method bridge reconciles to (Net Income minus non-cash
    movements equals this).  Honors ``view_mode`` (planned folds into the total
    in combined) and skips synthetic flag-``S`` entries.
    """
    flags = ("*",) if view_mode == "actual" else ("*", "!")
    total = Decimal(0)
    for e in entries:
        if not isinstance(e, data.Transaction) or e.flag not in flags:
            continue
        for p in e.postings:
            if p.units is None or p.units.currency != oc:
                continue
            if is_cash_account(p.account, type_map):
                total += p.units.number
    return total


def overlaps_budgeted(account: str, budgeted: set[str]) -> bool:
    """True if ``account`` is an ancestor OR descendant of a budgeted account.

    A ghost that overlaps a budgeted account (in either direction) would
    double-count in the shared subtree — ``sum_account_postings`` rolls
    descendants into ancestors.  Such a ghost is not surfaced; the budgeted
    envelope already represents that spend.
    """
    for b in budgeted:
        if account == b:
            return True
        if account.startswith(b + ":") or b.startswith(account + ":"):
            return True
    return False


def dedupe_ghost_subtrees(candidates: list[str]) -> list[str]:
    """Drop any ghost that is a strict descendant of another candidate ghost.

    ``sum_account_postings`` rolls a ghost's whole subtree into its ``realized``
    /``pending``.  So if both a parent (with its own direct posting) and one of
    its posted children appear as ghosts, the child's spend is counted twice —
    once standalone and once inside the parent's rolled-up sum.

    We keep the **ancestor** and drop descendants: the ancestor's rolled-up sum
    already represents the full subtree (including the child *and* any direct
    postings on the parent), so every unit of spend is counted exactly once and
    nothing is lost.  The descendant is simply folded into its parent's row.
    """
    candidate_set = set(candidates)
    return [
        a
        for a in candidates
        if not any(b != a and a.startswith(b + ":") for b in candidate_set)
    ]


def detect_overlap_warnings(accounts: list[str]) -> list[str]:
    """Return warnings for budgeted accounts that are ancestors/descendants of
    one another.

    Ledgr v1 does not deduplicate overlapping envelopes (a parent and one of
    its descendants both budgeted) — ``realized``/``pending`` double-counts in
    the overlap.  Instead of silently merging, surface a warning so the user
    can decide.  See PLAN §1 "what NOT to build".
    """
    warnings: list[str] = []
    for a in accounts:
        for b in accounts:
            if a is b:
                continue
            if b.startswith(a + ":"):
                warnings.append(
                    f"Envelope '{b}' is a descendant of '{a}'; "
                    f"realized and pending amounts double-count in the overlap."
                )
    return warnings
