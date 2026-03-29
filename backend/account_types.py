"""
Account type vocabulary and classification helpers based on ``ledgr-type`` metadata.

Each ``open`` directive in the ``.beancount`` file can carry a ``ledgr-type``
metadata key that classifies the account for Cash Flow and UI purposes.

This module replaces the legacy prefix-based classification system
(``ledgr_options.py``). Instead of matching account names against string
prefixes, accounts are classified by their explicit ``ledgr-type`` metadata
on the ``Open`` directive.

See AGENTS.md §7 for the classification rules.
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


def is_investment_account(account: str, type_map: dict[str, str]) -> bool:
    """Return True if account's ledgr-type is in INVESTMENT_TYPES."""
    return type_map.get(account) in INVESTMENT_TYPES


def is_loan_account(account: str, type_map: dict[str, str]) -> bool:
    """Return True if account's ledgr-type is in LOAN_TYPES."""
    return type_map.get(account) in LOAN_TYPES
