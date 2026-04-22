"""
Singleton wrapper around FavaLedger.

This is the **only** module that instantiates ``FavaLedger``.  Routers obtain
the ledger via ``Depends(get_ledger)`` — no router imports ``FavaLedger``
directly, and no router calls ``loader.load_file()``.

See AGENTS.md §5 for the full usage contract.
"""

from __future__ import annotations

import datetime

from beancount.core import data
from beancount.ops.summarize import clamp_opt
from fava.core import FavaLedger
from fava.core.filters import AccountFilter, AdvancedFilter

_ledger: FavaLedger | None = None


def init_ledger(path: str) -> FavaLedger:
    """Create (or replace) the global FavaLedger singleton.

    Called once during FastAPI lifespan startup.
    """
    global _ledger
    _ledger = FavaLedger(path)
    _ledger.load_file()
    return _ledger


def get_ledger() -> FavaLedger:
    """Return the initialised FavaLedger.

    Intended for use as a FastAPI dependency::

        @router.get("/api/accounts")
        def get_accounts(ledger: FavaLedger = Depends(get_ledger)):
            ...

    Raises ``RuntimeError`` if called before ``init_ledger()``.
    """
    if _ledger is None:
        raise RuntimeError("Ledger not initialized — call init_ledger() first")
    return _ledger


def get_filtered_entries(
    ledger: FavaLedger,
    view_mode: str = "combined",
    *,
    account: str | None = None,
    from_date: datetime.date | None = None,
    to_date: datetime.date | None = None,
    tags: list[str] | None = None,
    payee: str | None = None,
) -> list:
    """Filter ledger entries.

    Applies filters in this order (matching Fava's FilteredLedger):
      1. view_mode  — planned/actual flag filter (Ledgr-specific)
      2. account    — Fava's AccountFilter (regex + has_component)
      3. tags/payee — Fava's AdvancedFilter (parsed query syntax)
      4. time       — clamp_opt() for correct opening balances

    Step 1 is the only Ledgr-specific logic.  Steps 2-4 delegate
    entirely to Fava/Beancount — no custom filtering code.
    """
    entries = ledger.all_entries

    # 1. View mode (planned/actual) — Ledgr-specific, no Fava equivalent
    if view_mode != "combined":
        flag = "*" if view_mode == "actual" else "!"
        entries = [
            e for e in entries
            if not isinstance(e, data.Transaction) or e.flag == flag
        ]

    # 2. Account filter — Fava's AccountFilter (regex + has_component)
    if account:
        entries = AccountFilter(account).apply(entries)

    # 3. Tags + payee — Fava's AdvancedFilter (query syntax parser)
    filter_parts: list[str] = []
    if tags:
        filter_parts.extend(f"#{t}" for t in tags)
    if payee:
        filter_parts.append(f'payee:"{payee}"')
    if filter_parts:
        entries = AdvancedFilter(" ".join(filter_parts)).apply(entries)

    # 4. Time filter (clamp_opt — Beancount native)
    if from_date or to_date:
        begin = from_date or datetime.date.min
        if to_date:
            end = to_date
        else:
            txn_dates = [
                e.date for e in entries if isinstance(e, data.Transaction)
            ]
            end = (
                max(txn_dates) + datetime.timedelta(days=1)
                if txn_dates
                else datetime.date.max
            )
        entries, _ = clamp_opt(entries, begin, end, ledger.options)

    return entries
