"""Account-related endpoints.

All endpoints obtain the ledger via ``Depends(get_ledger)`` — no direct
``FavaLedger`` import, no ``request.app.state`` access.
"""

from __future__ import annotations

from collections import Counter
from decimal import Decimal
from typing import Any

from beancount.core import data, realization
from fastapi import APIRouter, Depends, Query
from fava.core import FavaLedger

from ledger import get_ledger
from serializers import ACCOUNT_TYPE_ORDER, serialize_account_node, serialize_error

router = APIRouter()


@router.get("/api/accounts")
def get_accounts(
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Account tree with balances."""
    real_root = realization.realize(ledger.all_entries)
    top_level = [serialize_account_node(c) for c in real_root.values()]
    top_level.sort(key=lambda n: ACCOUNT_TYPE_ORDER.get(n["name"], 99))

    errors = [str(e) for e in ledger.errors]

    return {"accounts": top_level, "errors": errors}


@router.get("/api/account-names")
def get_account_names(
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, list[str]]:
    """All account names (for autocomplete)."""
    real_root = realization.realize(ledger.all_entries)
    names: list[str] = []
    for child in realization.iter_children(real_root):
        if child.account:
            names.append(child.account)
    names.sort()
    return {"accounts": names}


@router.get("/api/payees")
def get_payees(
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, list[str]]:
    """All payees (for autocomplete)."""
    seen: set[str] = set()
    result: list[str] = []
    for e in ledger.all_entries:
        if isinstance(e, data.Transaction) and e.payee and e.payee not in seen:
            seen.add(e.payee)
            result.append(e.payee)
    result.sort()
    return {"payees": result}


@router.get("/api/errors")
def get_errors(
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Parse errors from beancount file."""
    errors = [serialize_error(e) for e in ledger.errors]
    return {"errors": errors, "count": len(errors)}


@router.get("/api/options")
def get_options(
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
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


@router.get("/api/suggestions")
def get_suggestions(
    payee: str = Query(...),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
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
            if t.postings[0].units:
                amounts.append(t.postings[0].units.number)

    most_common = (
        max(account_counts, key=account_counts.get) if account_counts else None
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
