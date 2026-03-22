"""Cash Flow Statement endpoint.

Delegates to ``cashflow.compute_cashflow()`` — the only custom accounting
logic in Ledgr (see AGENTS.md §7).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from fava.core import FavaLedger

from cashflow import compute_cashflow
from ledger import get_ledger

router = APIRouter()


@router.get("/api/reports/cashflow")
def get_cashflow(
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    interval: str = Query("monthly"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    """Cash Flow Statement — delegates to ``cashflow.py``."""
    return compute_cashflow(
        ledger.all_entries, from_date, to_date, interval
    )
