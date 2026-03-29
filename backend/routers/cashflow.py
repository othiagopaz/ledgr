"""Cash Flow Statement endpoint.

Delegates to ``cashflow.compute_cashflow()`` — the only custom accounting
logic in Ledgr (see AGENTS.md §7).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from fava.core import FavaLedger

from account_types import build_account_type_map
from cashflow import compute_cashflow
from ledger import get_filtered_entries, get_ledger

router = APIRouter()


@router.get("/api/reports/cashflow")
def get_cashflow(
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    interval: str = Query("monthly"),
    view_mode: str = Query("combined", pattern="^(actual|planned|combined)$"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Cash Flow Statement — delegates to ``cashflow.py``."""
    oc = ledger.options["operating_currency"][0]
    type_map = build_account_type_map(ledger.all_entries)

    entries = get_filtered_entries(ledger, view_mode)
    return compute_cashflow(
        entries, from_date, to_date, interval, oc,
        type_map=type_map,
    )
