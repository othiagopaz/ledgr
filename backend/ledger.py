"""
Singleton wrapper around FavaLedger.

This is the **only** module that instantiates ``FavaLedger``.  Routers obtain
the ledger via ``Depends(get_ledger)`` — no router imports ``FavaLedger``
directly, and no router calls ``loader.load_file()``.

See AGENTS.md §5 for the full usage contract.
"""

from __future__ import annotations

import datetime
import os

from beancount.core import data
from beancount.ops.summarize import clamp_opt, truncate
from fava.core import FavaLedger
from fava.core.filters import AccountFilter, AdvancedFilter

_ledger: FavaLedger | None = None
_ledger_path: str | None = None
_ledger_mtime: float | None = None


def _file_mtime(path: str) -> float | None:
    try:
        return os.path.getmtime(path)
    except OSError:
        return None


def init_ledger(path: str) -> FavaLedger:
    """Create (or replace) the global FavaLedger singleton.

    Called once during FastAPI lifespan startup.
    """
    global _ledger, _ledger_path, _ledger_mtime
    _ledger = FavaLedger(path)
    _ledger.load_file()
    _ledger_path = path
    _ledger_mtime = _file_mtime(path)
    return _ledger


def reload_ledger() -> None:
    """Reload the ledger file and refresh the cached mtime.

    Used both by API write paths and by the mtime-based auto-reload in
    ``get_ledger()``. Keeps ``_ledger_mtime`` in sync so an internal write
    doesn't trigger a redundant reload on the very next read.
    """
    global _ledger_mtime
    if _ledger is None or _ledger_path is None:
        raise RuntimeError("Ledger not initialized — call init_ledger() first")
    _ledger.load_file()
    _ledger_mtime = _file_mtime(_ledger_path)


def get_ledger() -> FavaLedger:
    """Return the initialised FavaLedger, reloading if the file changed.

    Intended for use as a FastAPI dependency::

        @router.get("/api/accounts")
        def get_accounts(ledger: FavaLedger = Depends(get_ledger)):
            ...

    Before returning, it compares the ledger file's on-disk mtime to the one
    cached at load time. If the file changed — a manual edit, or a write from
    a *different* process (e.g. another Ledgr instance or the MCP) — it
    reloads so reads never serve a stale account list. This is why creating an
    account no longer requires a server restart to show up.

    Raises ``RuntimeError`` if called before ``init_ledger()``.
    """
    global _ledger_mtime
    if _ledger is None or _ledger_path is None:
        raise RuntimeError("Ledger not initialized — call init_ledger() first")
    current = _file_mtime(_ledger_path)
    if current is not None and current != _ledger_mtime:
        _ledger.load_file()
        _ledger_mtime = current
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

    # 4. Time filter (Beancount native)
    #
    # With a real ``from_date`` we clamp: income/expenses before the period
    # are summarized into opening equity.  With no ``from_date`` the lower
    # bound is open, so there is no opening period to summarize — we merely
    # truncate at ``to_date``.
    #
    # ``clamp_opt`` computes ``from_date - 1 day`` internally; a ``from_date``
    # of ``datetime.date.min`` would underflow and raise ``OverflowError``.
    # An unbounded lower bound has no opening period anyway, so treat it as
    # absent and fall through to the open-lower-bound path below.
    if from_date == datetime.date.min:
        from_date = None

    if from_date:
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
        entries, _ = clamp_opt(entries, from_date, end, ledger.options)
    elif to_date:
        # Open lower bound: keep everything strictly before ``to_date``.
        entries = truncate(entries, to_date)

    return entries
