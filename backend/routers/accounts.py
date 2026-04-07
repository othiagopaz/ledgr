"""Account-related endpoints.

All endpoints obtain the ledger via ``Depends(get_ledger)`` — no direct
``FavaLedger`` import, no ``request.app.state`` access.
"""

from __future__ import annotations

import datetime
from collections import Counter
from decimal import Decimal
from typing import Any

from beancount.core import data, realization
from fastapi import APIRouter, Depends, HTTPException, Query
from fava.beans.funcs import hash_entry
from fava.core import FavaLedger
from fava.core.file import get_entry_slice
from pydantic import BaseModel

from account_types import (
    REQUIRED_TYPE_ROOTS,
    TYPE_LABELS,
    VALID_TYPES_BY_ROOT,
    build_account_type_map,
)
from ledger import get_filtered_entries, get_ledger
from serializers import (
    ACCOUNT_TYPE_ORDER,
    _INTERNAL_META_KEYS,
    serialize_account_node,
    serialize_error,
)

router = APIRouter()


@router.get("/api/accounts")
def get_accounts(
    view_mode: str = Query("combined", pattern="^(actual|planned|combined)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Account tree with balances, enriched with Open directive metadata."""
    entries = get_filtered_entries(ledger, view_mode)

    # Build opens map once — threaded through recursive serialization
    opens_map = {
        e.account: e for e in ledger.all_entries if isinstance(e, data.Open)
    }

    real_root = realization.realize(entries)
    top_level = [
        serialize_account_node(c, opens_map) for c in real_root.values()
    ]
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
    """Ledger options (currency, title, locale, default payment account)."""
    locale = None
    default_payment_account = None
    for e in ledger.all_entries:
        if isinstance(e, data.Custom):
            if e.type == "ledgr-locale" and not locale:
                if e.values and len(e.values) > 0:
                    locale = str(e.values[0].value)
            elif e.type == "ledgr-option":
                if e.values and len(e.values) >= 2:
                    key = str(e.values[0].value)
                    if key == "default-payment-account":
                        default_payment_account = str(e.values[1].value)

    return {
        "operating_currency": ledger.options.get("operating_currency", []),
        "title": ledger.options.get("title", ""),
        "filename": ledger.options.get("filename", ""),
        "locale": locale,
        "default_payment_account": default_payment_account,
    }


class DefaultPaymentAccountIn(BaseModel):
    account: str | None = None


@router.post("/api/options/default-payment-account")
def set_default_payment_account(
    body: DefaultPaymentAccountIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Set or clear the default payment account."""
    # Validate account exists if setting (not clearing)
    if body.account:
        opens = _get_opens(ledger)
        if body.account not in opens:
            raise HTTPException(status_code=400, detail=f"Account '{body.account}' not found")

    # Find existing directive
    existing_entry = None
    for e in ledger.all_entries:
        if (
            isinstance(e, data.Custom)
            and e.type == "ledgr-option"
            and e.values
            and len(e.values) >= 2
            and str(e.values[0].value) == "default-payment-account"
        ):
            existing_entry = e
            break

    if body.account:
        # Build source for the directive
        date_str = (existing_entry.date.isoformat() if existing_entry
                    else datetime.date.today().isoformat())
        source = f'{date_str} custom "ledgr-option" "default-payment-account" "{body.account}"'

        if existing_entry:
            _, entry_sha = get_entry_slice(existing_entry)
            ledger.file.save_entry_slice(hash_entry(existing_entry), source, entry_sha)
        else:
            with open(str(ledger.beancount_file_path), "a") as f:
                f.write(f"\n{source}\n")
    elif existing_entry:
        # Clear: remove the existing directive
        _, entry_sha = get_entry_slice(existing_entry)
        ledger.file.save_entry_slice(hash_entry(existing_entry), "", entry_sha)

    ledger.load_file()

    # Return updated options
    return get_options(ledger)


@router.get("/api/tags")
def get_tags(
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, list[str]]:
    """All tags used across transactions (for autocomplete)."""
    seen: set[str] = set()
    for e in ledger.all_entries:
        if isinstance(e, data.Transaction) and e.tags:
            seen.update(e.tags)
    return {"tags": sorted(seen)}


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


# ------------------------------------------------------------------
# Pydantic models for Account CRUD
# ------------------------------------------------------------------

VALID_ROOTS = {"Assets", "Liabilities", "Income", "Expenses", "Equity"}


class AccountIn(BaseModel):
    name: str
    currencies: list[str] = []
    date: str | None = None
    ledgr_type: str | None = None
    metadata: dict[str, str] = {}


class AccountUpdateIn(BaseModel):
    name: str
    ledgr_type: str | None = None
    currencies: list[str] | None = None
    metadata: dict[str, str] | None = None


class CloseAccountIn(BaseModel):
    name: str
    date: str | None = None


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _get_opens(ledger: FavaLedger) -> dict[str, data.Open]:
    """Return account → Open entry mapping."""
    return {e.account: e for e in ledger.all_entries if isinstance(e, data.Open)}


def _get_closes(ledger: FavaLedger) -> set[str]:
    """Return set of closed account names."""
    return {e.account for e in ledger.all_entries if isinstance(e, data.Close)}


def _validate_account_name(name: str) -> None:
    """Validate account name format."""
    parts = name.split(":")
    if not parts or parts[0] not in VALID_ROOTS:
        raise HTTPException(
            status_code=400,
            detail=f"Account must start with one of: {', '.join(sorted(VALID_ROOTS))}",
        )
    if len(parts) < 2:
        raise HTTPException(
            status_code=400, detail="Account must have at least two segments (e.g. Assets:Checking)"
        )
    for part in parts:
        if not part:
            raise HTTPException(status_code=400, detail="Account segments must be non-empty")


def _validate_ledgr_type(root: str, ledgr_type: str | None) -> str:
    """Validate and return the ledgr-type for the given root.

    Returns the validated type string.
    """
    if root in REQUIRED_TYPE_ROOTS:
        if not ledgr_type:
            raise HTTPException(
                status_code=400,
                detail=f"{root} accounts require a ledgr_type. Valid types: {sorted(VALID_TYPES_BY_ROOT[root])}",
            )
    else:
        if not ledgr_type:
            return "general"

    valid_types = VALID_TYPES_BY_ROOT.get(root)
    if valid_types and ledgr_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid ledgr_type '{ledgr_type}' for {root}. Valid: {sorted(valid_types)}",
        )
    return ledgr_type


def _serialize_account_response(
    name: str, open_entry: data.Open
) -> dict[str, Any]:
    """Serialize an Open entry into the account response shape."""
    return {
        "name": name,
        "ledgr_type": open_entry.meta.get("ledgr-type"),
        "open_date": open_entry.date.isoformat(),
        "currencies": list(open_entry.currencies) if open_entry.currencies else [],
        "metadata": {
            k: str(v) for k, v in open_entry.meta.items()
            if k not in _INTERNAL_META_KEYS
        },
    }


# ------------------------------------------------------------------
# Account CRUD endpoints
# ------------------------------------------------------------------

@router.post("/api/accounts", status_code=201)
def create_account(
    body: AccountIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Create a new account (Open directive)."""
    _validate_account_name(body.name)

    # Check for duplicates
    opens = _get_opens(ledger)
    closes = _get_closes(ledger)
    if body.name in opens and body.name not in closes:
        raise HTTPException(status_code=400, detail=f"Account '{body.name}' already exists")

    root = body.name.split(":")[0]
    ledgr_type = _validate_ledgr_type(root, body.ledgr_type)

    # Build metadata
    meta = data.new_metadata(str(ledger.beancount_file_path), 0)
    meta["ledgr-type"] = ledgr_type
    for k, v in body.metadata.items():
        meta[k] = v

    open_date = datetime.date.fromisoformat(body.date) if body.date else datetime.date.today()
    currencies = body.currencies or []

    open_entry = data.Open(meta, open_date, body.name, currencies, None)
    ledger.file.insert_entries([open_entry])
    ledger.load_file()

    # Re-fetch the entry from the reloaded ledger
    new_opens = _get_opens(ledger)
    entry = new_opens.get(body.name)
    if not entry:
        raise HTTPException(status_code=500, detail="Account created but not found after reload")

    return {"success": True, "account": _serialize_account_response(body.name, entry)}


@router.put("/api/accounts")
def update_account(
    body: AccountUpdateIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Update account metadata (ledgr-type, currencies, custom metadata)."""
    opens = _get_opens(ledger)
    open_entry = opens.get(body.name)
    if not open_entry:
        raise HTTPException(status_code=404, detail=f"Account '{body.name}' not found")

    root = body.name.split(":")[0]

    # Validate new ledgr-type if provided
    new_type = body.ledgr_type
    if new_type is not None:
        new_type = _validate_ledgr_type(root, new_type)

    # Build updated entry
    new_meta = dict(open_entry.meta)
    if new_type is not None:
        new_meta["ledgr-type"] = new_type
    if body.metadata is not None:
        # Remove old non-internal metadata, then add new
        for k in list(new_meta.keys()):
            if k not in _INTERNAL_META_KEYS:
                del new_meta[k]
        for k, v in body.metadata.items():
            new_meta[k] = v

    new_currencies = body.currencies if body.currencies is not None else (list(open_entry.currencies) if open_entry.currencies else [])

    updated = data.Open(new_meta, open_entry.date, body.name, new_currencies, None)

    # Build source text for the updated directive
    source_lines = [
        f"{open_entry.date.isoformat()} open {body.name}"
    ]
    if new_currencies:
        source_lines[0] += "  " + ",".join(new_currencies)

    for k, v in new_meta.items():
        if k in ("filename", "lineno"):
            continue
        source_lines.append(f'  {k}: "{v}"')

    source = "\n".join(source_lines)
    _, entry_sha = get_entry_slice(open_entry)
    ledger.file.save_entry_slice(hash_entry(open_entry), source, entry_sha)
    ledger.load_file()

    new_opens = _get_opens(ledger)
    entry = new_opens.get(body.name)
    if not entry:
        raise HTTPException(status_code=500, detail="Account not found after update")

    return {"success": True, "account": _serialize_account_response(body.name, entry)}


@router.post("/api/accounts/close")
def close_account(
    body: CloseAccountIn,
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Close an account (insert a Close directive)."""
    opens = _get_opens(ledger)
    if body.name not in opens:
        raise HTTPException(status_code=404, detail=f"Account '{body.name}' not found")

    closes = _get_closes(ledger)
    if body.name in closes:
        raise HTTPException(status_code=400, detail=f"Account '{body.name}' is already closed")

    close_date = datetime.date.fromisoformat(body.date) if body.date else datetime.date.today()
    close_entry = data.Close(
        data.new_metadata(str(ledger.beancount_file_path), 0),
        close_date,
        body.name,
    )
    ledger.file.insert_entries([close_entry])
    ledger.load_file()

    return {"success": True, "account": body.name, "close_date": close_date.isoformat()}


@router.get("/api/account-types")
def get_account_types() -> dict[str, Any]:
    """Return the controlled vocabulary of account types for each root."""
    return {"types": TYPE_LABELS}


@router.get("/api/accounts/warnings")
def get_account_warnings(
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Return accounts missing required ledgr-type metadata."""
    warnings: list[dict[str, Any]] = []
    for entry in ledger.all_entries:
        if not isinstance(entry, data.Open):
            continue
        root = entry.account.split(":")[0]
        if root not in REQUIRED_TYPE_ROOTS:
            continue
        ledgr_type = entry.meta.get("ledgr-type") if entry.meta else None
        if not ledgr_type:
            warnings.append({
                "account": entry.account,
                "message": f"Missing required ledgr-type metadata. {root} accounts must specify a type.",
                "open_date": entry.date.isoformat(),
                "lineno": entry.meta.get("lineno") if entry.meta else None,
            })
    return {"warnings": warnings}
