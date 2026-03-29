"""Cash Flow Statement endpoint — thin HTTP wrapper."""

from __future__ import annotations

from typing import Any

from beancount.core import data as bc_data
from fastapi import APIRouter, Depends, Query
from fava.core import FavaLedger

from ledger import get_ledger
from ledgr.cashflow import compute_cashflow
from ledgr.options import parse_ledgr_options

router = APIRouter()


@router.get("/api/reports/cashflow")
def get_cashflow(
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    interval: str = Query("monthly"),
    ledger: FavaLedger = Depends(get_ledger),
) -> dict[str, Any]:
    oc = ledger.options["operating_currency"][0]
    custom_entries = [e for e in ledger.all_entries if isinstance(e, bc_data.Custom)]
    ledgr_opts = parse_ledgr_options(custom_entries)
    return compute_cashflow(
        ledger.all_entries, from_date, to_date, interval, oc,
        investment_prefixes=ledgr_opts.investment_account_prefixes,
    )
