"""
Account type vocabulary and classification helpers based on ``ledgr-type`` metadata.

Each ``open`` directive in the ``.beancount`` file can carry a ``ledgr-type``
metadata key that classifies the account for Cash Flow and UI purposes.

This module replaces the legacy prefix-based classification system
(``ledgr_options.py``). Instead of matching account names against string
prefixes, accounts are classified by their explicit ``ledgr-type`` metadata
on the ``Open`` directive.

``Assets`` and ``Liabilities`` accounts **require** a ``ledgr-type`` (see
``REQUIRED_TYPE_ROOTS``); ``Income`` / ``Expenses`` / ``Equity`` default to
``"general"``. The requirement is enforced at account create and edit by
``_validate_ledgr_type`` in ``routers/accounts.py`` (HTTP 400), guarded again
client-side in the account modal, and surfaced for pre-existing untyped
accounts by ``GET /api/accounts/warnings``.

See ``docs/backend/cashflow.md`` for the classification rules and their rationale.
"""

from __future__ import annotations

from beancount.core import data

# ------------------------------------------------------------------
# Type vocabulary
# ------------------------------------------------------------------

# Types that make an account a "cash" account for Cash Flow purposes.
# A cash account is one where postings generate cash flow events.
CASH_TYPES: frozenset[str] = frozenset({"cash"})

# Types that make an account an "investment" counterpart for Cash Flow.
# Transactions between a cash account and an investment account = INVESTING.
INVESTMENT_TYPES: frozenset[str] = frozenset({"investment"})

# Types that make a Liabilities account a "loan" for Cash Flow.
# Transactions between a cash account and a loan account = FINANCING.
LOAN_TYPES: frozenset[str] = frozenset({"loan"})

# Working-capital types — Assets/Liabilities that represent a timing difference
# around ordinary (operating) activity rather than an investing or financing
# instrument. In the Cash Flow Statement, cash moving against one of these
# counterparts is OPERATING (IAS 7 working capital):
#   receivable  — someone owes you (reimbursement in transit)
#   prepaid     — you paid ahead; benefit consumed later
#   credit-card — a payment mechanism for operating spend (IAS 7 permits
#                 operating OR financing; Ledgr chooses operating by substance)
#   payable     — you owe for something already received
# See docs/backend/cashflow.md for the full rationale.
RECEIVABLE_TYPES: frozenset[str] = frozenset({"receivable"})
PREPAID_TYPES: frozenset[str] = frozenset({"prepaid"})
CREDIT_CARD_TYPES: frozenset[str] = frozenset({"credit-card"})
PAYABLE_TYPES: frozenset[str] = frozenset({"payable"})

# Every ledgr-type that the Cash Flow Statement treats as OPERATING working
# capital. Kept as one set so the classifier and any future report share a
# single source of truth.
OPERATING_WORKING_CAPITAL_TYPES: frozenset[str] = (
    RECEIVABLE_TYPES | PREPAID_TYPES | CREDIT_CARD_TYPES | PAYABLE_TYPES
)

# Asset/Liability types that are valid Budget *allocation* envelopes — money
# you deliberately set aside or deliberately pay down. ``payable`` qualifies for
# the same reason ``loan`` does: settling what you owe is a planned cash
# outflow. ``cash`` (the pool itself), ``receivable`` (money that leaves and
# comes back) and ``prepaid`` (cash already spent, see
# ``DEFERRED_CASH_TYPES``) are financial movements, not allocation targets, and
# stay out of the Budget entirely. See docs/features/budgets.md.
BUDGETABLE_ALLOCATION_TYPES: frozenset[str] = frozenset({
    "investment", "loan", "payable",
})

# Types whose counterpart means "the cash has not left yet, but it will".
#
# The Budget plans spendable cash, so a posting normally only counts when its
# transaction touches a ``cash`` account. Credit cards and payables are the
# deliberate exception: a card purchase has to drain its envelope at purchase,
# before the bill is paid, and an invoice you have received but not settled is
# an expense of this month with the cash following later. Budgeting them on
# accrual is the honest reading — the timing gap surfaces on the Budget's
# "Cash timing" line.
#
# ``prepaid`` is deliberately NOT here: its cash already left (and was budgeted)
# when the prepayment was made, so counting the monthly appropriation again
# would double-count. Same for ``receivable``: that cash leaves and returns.
DEFERRED_CASH_TYPES: frozenset[str] = frozenset({"credit-card", "payable"})

# All valid types for Assets accounts.
VALID_ASSET_TYPES: frozenset[str] = frozenset({
    "cash", "receivable", "investment", "prepaid",
})

# All valid types for Liabilities accounts.
VALID_LIABILITY_TYPES: frozenset[str] = frozenset({
    "credit-card", "loan", "payable",
})

# All valid types for Income/Expenses/Equity accounts.
VALID_GENERAL_TYPES: frozenset[str] = frozenset({"general"})

# Map from account root to valid types.
VALID_TYPES_BY_ROOT: dict[str, frozenset[str]] = {
    "Assets": VALID_ASSET_TYPES,
    "Liabilities": VALID_LIABILITY_TYPES,
    "Income": VALID_GENERAL_TYPES,
    "Expenses": VALID_GENERAL_TYPES,
    "Equity": VALID_GENERAL_TYPES,
}

# Roots where ledgr-type is mandatory.
REQUIRED_TYPE_ROOTS: frozenset[str] = frozenset({"Assets", "Liabilities"})

# Human-readable labels for the frontend dropdown.
TYPE_LABELS: dict[str, list[dict[str, str]]] = {
    "Assets": [
        {"value": "cash", "label": "Cash / Bank Account"},
        {"value": "receivable", "label": "Receivable"},
        {"value": "investment", "label": "Investment / Brokerage"},
        {"value": "prepaid", "label": "Prepaid / Deposit"},
    ],
    "Liabilities": [
        {"value": "credit-card", "label": "Credit Card"},
        {"value": "loan", "label": "Loan / Mortgage"},
        {"value": "payable", "label": "Payable"},
    ],
    "Income": [
        {"value": "general", "label": "General"},
    ],
    "Expenses": [
        {"value": "general", "label": "General"},
    ],
    "Equity": [
        {"value": "general", "label": "General"},
    ],
}


# ------------------------------------------------------------------
# Type map builder
# ------------------------------------------------------------------

def build_account_type_map(entries: list) -> dict[str, str]:
    """Build account → ledgr-type mapping from Open directives.

    Returns a dict like::

        {"Assets:Bank:Checking": "cash", "Assets:Investments:Stocks": "investment", ...}

    Accounts without ``ledgr-type`` get:
      - Not included for Assets/Liabilities (these SHOULD have it — validation warns)
      - ``"general"`` for Income/Expenses/Equity
    """
    type_map: dict[str, str] = {}
    for entry in entries:
        if not isinstance(entry, data.Open):
            continue
        account = entry.account
        root = account.split(":")[0]
        ledgr_type = entry.meta.get("ledgr-type") if entry.meta else None

        if ledgr_type:
            type_map[account] = ledgr_type
        elif root not in REQUIRED_TYPE_ROOTS:
            type_map[account] = "general"
        # else: Assets/Liabilities without type → not in map (triggers warning)

    return type_map


# ------------------------------------------------------------------
# Classification helpers
# ------------------------------------------------------------------

def is_cash_account(account: str, type_map: dict[str, str]) -> bool:
    """Return True if account's ledgr-type is in CASH_TYPES."""
    return type_map.get(account) in CASH_TYPES


def is_deferred_cash_account(account: str, type_map: dict[str, str]) -> bool:
    """True when the account means "cash has not left yet, but it will".

    Credit cards and payables — see ``DEFERRED_CASH_TYPES``.
    """
    return type_map.get(account) in DEFERRED_CASH_TYPES


def consumes_budget_cash(postings: list, type_map: dict[str, str]) -> bool:
    """True when a transaction's postings represent real budgetable spending.

    The Budget plans spendable cash. A transaction qualifies when it touches
    either actual cash or a deferred-cash instrument (card / payable). What this
    filters out is the accounting-only movement: appropriating a prepaid
    expense, booking depreciation, writing an asset off, recognising an
    unrealised loss, or indexing a balance. Those reduce profit without ever
    consuming cash, so budgeting them would ask for money that never moves —
    and the ZBB could never close.

    ``postings`` is any iterable of objects exposing ``.account``.
    """
    return any(
        is_cash_account(p.account, type_map)
        or is_deferred_cash_account(p.account, type_map)
        for p in postings
    )


def is_investment_account(account: str, type_map: dict[str, str]) -> bool:
    """Return True if account's ledgr-type is in INVESTMENT_TYPES."""
    return type_map.get(account) in INVESTMENT_TYPES


def is_loan_account(account: str, type_map: dict[str, str]) -> bool:
    """Return True if account's ledgr-type is in LOAN_TYPES."""
    return type_map.get(account) in LOAN_TYPES


def is_receivable_account(account: str, type_map: dict[str, str]) -> bool:
    """Return True if account's ledgr-type is in RECEIVABLE_TYPES."""
    return type_map.get(account) in RECEIVABLE_TYPES


def is_prepaid_account(account: str, type_map: dict[str, str]) -> bool:
    """Return True if account's ledgr-type is in PREPAID_TYPES."""
    return type_map.get(account) in PREPAID_TYPES


def is_creditcard_account(account: str, type_map: dict[str, str]) -> bool:
    """Return True if account's ledgr-type is in CREDIT_CARD_TYPES."""
    return type_map.get(account) in CREDIT_CARD_TYPES


def is_payable_account(account: str, type_map: dict[str, str]) -> bool:
    """Return True if account's ledgr-type is in PAYABLE_TYPES."""
    return type_map.get(account) in PAYABLE_TYPES


def is_operating_working_capital(account: str, type_map: dict[str, str]) -> bool:
    """Return True if account's ledgr-type is an OPERATING working-capital type.

    Covers receivable, prepaid, credit-card, and payable — the Assets/Liabilities
    types that represent a timing difference around operating activity. Cash
    moving against one of these is OPERATING in the Cash Flow Statement.
    """
    return type_map.get(account) in OPERATING_WORKING_CAPITAL_TYPES


def is_budgetable_allocation(account: str, type_map: dict[str, str]) -> bool:
    """Return True if an Assets/Liabilities account is a valid Budget allocation.

    Only ``investment`` and ``loan`` accounts qualify — every other
    Asset/Liability type (cash, receivable, prepaid, credit-card, payable) is a
    financial movement, not an allocation envelope, and is excluded from the
    Budget. Income/Expenses accounts are not allocations and return False here
    (they belong to their own sections).

    The check is **descendant-aware**: a parent allocation account whose own
    ``ledgr-type`` is absent still qualifies if any descendant is
    ``investment``/``loan``-typed.  This mirrors the Cash Flow Statement, which
    classifies by the typed posting account — so budgeting a parent like
    ``Liabilities:Loans`` works when its child ``Liabilities:Loans:KA`` is a
    loan (``sum_account_postings`` rolls the child's postings into the parent).
    """
    if type_map.get(account) in BUDGETABLE_ALLOCATION_TYPES:
        return True
    prefix = account + ":"
    return any(
        t in BUDGETABLE_ALLOCATION_TYPES
        for a, t in type_map.items()
        if a.startswith(prefix)
    )
