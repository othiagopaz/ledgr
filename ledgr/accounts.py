"""
Account-related business logic.

All functions accept a ``FavaLedger`` instance and return plain dicts
suitable for JSON serialization.
"""

from __future__ import annotations

from collections import Counter
from decimal import Decimal
from typing import Any

from beancount.core import data, realization
from fava.core import FavaLedger

from ledgr.serializers import ACCOUNT_TYPE_ORDER, serialize_account_node, serialize_error


def get_account_tree(ledger: FavaLedger) -> dict[str, Any]:
    """Account tree with balances."""
    real_root = realization.realize(ledger.all_entries)
    top_level = [serialize_account_node(c) for c in real_root.values()]
    top_level.sort(key=lambda n: ACCOUNT_TYPE_ORDER.get(n["name"], 99))

    errors = [str(e) for e in ledger.errors]

    return {"accounts": top_level, "errors": errors}


def list_account_names(ledger: FavaLedger) -> dict[str, list[str]]:
    """All account names (for autocomplete)."""
    real_root = realization.realize(ledger.all_entries)
    names: list[str] = []
    for child in realization.iter_children(real_root):
        if child.account:
            names.append(child.account)
    names.sort()
    return {"accounts": names}


def list_payees(ledger: FavaLedger) -> dict[str, list[str]]:
    """All payees (for autocomplete)."""
    seen: set[str] = set()
    result: list[str] = []
    for e in ledger.all_entries:
        if isinstance(e, data.Transaction) and e.payee and e.payee not in seen:
            seen.add(e.payee)
            result.append(e.payee)
    result.sort()
    return {"payees": result}


def list_errors(ledger: FavaLedger) -> dict[str, Any]:
    """Parse errors from beancount file."""
    errors = [serialize_error(e) for e in ledger.errors]
    return {"errors": errors, "count": len(errors)}


def get_ledger_options(ledger: FavaLedger) -> dict[str, Any]:
    """Ledger options (currency, title, locale)."""
    locale = None
    for e in ledger.all_entries:
        if isinstance(e, data.Custom) and e.type == "ledgr-locale":
            if e.values and len(e.values) > 0:
                locale = str(e.values[0].value)
                break

    return {
        "operating_currency": ledger.options.get("operating_currency", []),
        "title": ledger.options.get("title", ""),
        "filename": ledger.options.get("filename", ""),
        "locale": locale,
    }


def suggest_for_payee(ledger: FavaLedger, payee: str) -> dict[str, Any]:
    """Smart suggestions for a payee — most common account and typical amount."""
    txns = [
        e for e in ledger.all_entries
        if isinstance(e, data.Transaction) and e.payee == payee
    ]
    if not txns:
        return {"payee": payee, "account": None, "amount": None, "currency": None}

    account_counts: dict[str, int] = {}
    amounts: list[Decimal] = []
    for t in txns:
        if len(t.postings) == 2:
            acct = t.postings[0].account
            account_counts[acct] = account_counts.get(acct, 0) + 1
            units = t.postings[0].units
            if units and units.number is not None:
                amounts.append(units.number)

    most_common = (
        max(account_counts, key=lambda k: account_counts[k]) if account_counts else None
    )

    typical_amount = None
    currency = None
    if amounts:
        count = Counter(amounts)
        top_amount, top_count = count.most_common(1)[0]
        if top_count / len(amounts) > 0.5:
            typical_amount = top_amount
            for t in reversed(txns):
                if t.postings[0].units:
                    currency = t.postings[0].units.currency
                    break

    return {
        "payee": payee,
        "account": most_common,
        "amount": str(typical_amount) if typical_amount else None,
        "currency": currency,
    }
