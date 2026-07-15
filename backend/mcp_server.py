"""Ledgr MCP server.

Exposes Ledgr to an LLM (Claude Desktop / Claude Code) as MCP tools:
recording transactions, period reports, transaction/account queries, and
budget. It is a **thin client over the FastAPI backend** — it never touches
Beancount directly, so the repo's one rule holds: *Beancount/Fava do the
accounting, Ledgr presents it.*

Backend lifecycle (reuse-or-spawn)
----------------------------------
On first tool call the server ensures a backend is up:

  1. GET ``{LEDGR_API_URL}/health``. If it answers, reuse it — this is the
     process you get when you open ``Ledgr.command`` (or another MCP run).
  2. Otherwise spawn a headless ``uvicorn`` (backend only, no frontend/
     browser) bound to the same port, wait for ``/health``, and keep it
     alive for the lifetime of this MCP process.

So you never have to open the app first — but if it's already open, we don't
start a duplicate.

Configuration (environment variables)
-------------------------------------
  LEDGR_API_URL          Backend base URL. Default ``http://localhost:8080``.
  LEDGR_BEANCOUNT_FILE   Ledger the spawned backend loads. Default is the
                         real file used by ``Ledgr.command`` (Google Drive).
                         Ignored when an existing backend is reused.
  LEDGR_AUTOSTART        ``0`` disables spawning — only reuse a running
                         backend, else error. Default ``1``.

Run for a quick manual check:  ``python backend/mcp_server.py``
Wire into Claude: see ``docs/features/mcp-server.md``.
"""

from __future__ import annotations

import atexit
import os
import subprocess
import sys
import time
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------

API_URL = os.environ.get("LEDGR_API_URL", "http://localhost:8080").rstrip("/")

_BACKEND_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_DIR.parent

# Default to the real ledger the desktop launcher (Ledgr.command) uses, so the
# LLM writes to the same file you see in the app. Override with the env var to
# point at, e.g., data/example.beancount for safe testing.
_DEFAULT_LEDGER = (
    "/Users/thiagopaz/Library/CloudStorage/"
    "REDACTED/My Drive/Finance/financeiro.beancount"
)
BEANCOUNT_FILE = os.environ.get("LEDGR_BEANCOUNT_FILE", _DEFAULT_LEDGER)

AUTOSTART = os.environ.get("LEDGR_AUTOSTART", "1") != "0"

# Derive host:port for the spawned uvicorn from the configured URL.
_url_no_scheme = API_URL.split("://", 1)[-1]
_HOST = _url_no_scheme.split(":")[0] or "localhost"
try:
    _PORT = int(_url_no_scheme.split(":")[1]) if ":" in _url_no_scheme else 8080
except ValueError:
    _PORT = 8080

mcp = FastMCP("ledgr")

# ------------------------------------------------------------------
# Backend lifecycle — reuse-or-spawn
# ------------------------------------------------------------------

_spawned: subprocess.Popen | None = None
_ensured = False


def _is_up() -> bool:
    try:
        r = httpx.get(f"{API_URL}/health", timeout=1.5)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


def _spawn_backend() -> subprocess.Popen:
    """Start a headless backend (uvicorn, no reload, backend only)."""
    ledger = os.path.abspath(BEANCOUNT_FILE)
    if not os.path.isfile(ledger):
        raise RuntimeError(
            f"Ledger file not found: {ledger}\n"
            "Set LEDGR_BEANCOUNT_FILE to a valid .beancount path, or open "
            "the Ledgr app so the MCP can reuse its backend."
        )
    env = {**os.environ, "BEANCOUNT_FILE": ledger}
    # Use this venv's interpreter so uvicorn/fava resolve correctly.
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app",
         "--host", _HOST, "--port", str(_PORT)],
        cwd=str(_BACKEND_DIR),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return proc


def _ensure_backend() -> None:
    """Idempotently guarantee a backend is reachable at API_URL."""
    global _spawned, _ensured
    if _ensured and _is_up():
        return
    if _is_up():
        _ensured = True
        return
    if not AUTOSTART:
        raise RuntimeError(
            f"No Ledgr backend at {API_URL} and autostart is disabled "
            "(LEDGR_AUTOSTART=0). Open the Ledgr app or start the backend "
            "manually."
        )
    _spawned = _spawn_backend()
    # Wait for readiness (fava load of a large ledger can take a few seconds).
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if _is_up():
            _ensured = True
            return
        if _spawned.poll() is not None:
            raise RuntimeError(
                "Backend process exited during startup. Check that the venv "
                "has dependencies installed and the ledger file is valid."
            )
        time.sleep(0.4)
    raise RuntimeError(f"Backend did not become ready within 30s at {API_URL}.")


@atexit.register
def _cleanup() -> None:
    if _spawned is not None and _spawned.poll() is None:
        _spawned.terminate()
        try:
            _spawned.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _spawned.kill()


# ------------------------------------------------------------------
# HTTP helpers
# ------------------------------------------------------------------


def _get(path: str, params: dict[str, Any] | None = None) -> Any:
    _ensure_backend()
    r = httpx.get(f"{API_URL}{path}", params=_clean(params), timeout=30)
    r.raise_for_status()
    return r.json()


def _post(path: str, json: dict[str, Any]) -> Any:
    _ensure_backend()
    r = httpx.post(f"{API_URL}{path}", json=json, timeout=30)
    r.raise_for_status()
    return r.json()


def _clean(params: dict[str, Any] | None) -> dict[str, Any]:
    """Drop None values so we don't send empty query params."""
    if not params:
        return {}
    return {k: v for k, v in params.items() if v is not None}


def _month_range(month: str) -> tuple[str, str]:
    """Turn ``YYYY-MM`` into ``(from_date, to_date)`` the way the frontend does.

    CRITICAL: the backend treats ``to_date`` as **exclusive** — the last day
    is not included. So a month is ``[first-day, first-day-of-next-month)``,
    NOT ``[first-day, last-day]``. Passing an inclusive last day (e.g.
    2026-07-31) silently drops transactions dated on that day and produces a
    different total than the app's UI. This helper is the single place that
    encodes the exclusive-end convention.
    """
    try:
        y, m = (int(p) for p in month.split("-"))
        first = date(y, m, 1)
    except (ValueError, TypeError) as e:
        raise ValueError(f"month must be 'YYYY-MM', got {month!r}") from e
    nxt = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
    return first.isoformat(), nxt.isoformat()


def _period(
    month: str | None, from_date: str | None, to_date: str | None
) -> tuple[str | None, str | None]:
    """Resolve report date bounds. ``month`` wins if given.

    With ``month`` (``YYYY-MM``) you get the correct exclusive-end range.
    Otherwise ``from_date``/``to_date`` pass through verbatim — and there
    ``to_date`` is exclusive, so use the first day of the day AFTER the last
    day you want included.
    """
    if month:
        return _month_range(month)
    return from_date, to_date


def _balance_error(postings: list[dict[str, Any]]) -> str | None:
    """Return an error string if fully-specified postings don't balance.

    Guardrail at the LLM→file boundary: an LLM commonly gets amounts slightly
    wrong, and a bad entry would corrupt the real ledger. We only check when
    EVERY posting has an explicit amount — a single elided amount is a
    legitimate Beancount pattern (it gets auto-balanced), so we let those
    through untouched and rely on the backend.

    Kept intentionally simple (a per-currency sum) rather than importing
    Beancount here — the authoritative check lives in the backend.
    """
    if not postings:
        return "A transaction needs at least two postings."
    if any(p.get("amount") is None for p in postings):
        return None  # elided amount — let Beancount auto-balance

    residual: dict[str, Decimal] = {}
    for p in postings:
        cur = p.get("currency")
        if not cur:
            return None  # can't reason about balance without a currency
        try:
            residual[cur] = residual.get(cur, Decimal("0")) + Decimal(str(p["amount"]))
        except (InvalidOperation, ValueError):
            return f"Amount {p['amount']!r} is not a valid number."

    off = {c: n for c, n in residual.items() if n != 0}
    if off:
        parts = ", ".join(f"{n} {c}" for c, n in off.items())
        return (
            f"Postings do not balance — they are off by {parts}. "
            "Every currency must sum to zero (money out is negative, "
            "money in is positive)."
        )
    return None


# ------------------------------------------------------------------
# Tools — record
# ------------------------------------------------------------------


@mcp.tool()
def add_transaction(
    date: str,
    postings: list[dict[str, Any]],
    payee: str | None = None,
    narration: str = "",
    tags: list[str] | None = None,
    flag: str = "*",
) -> dict[str, Any]:
    """Record a double-entry transaction in the ledger.

    Beancount is double-entry: the postings MUST sum to zero per currency.
    A normal expense has two postings — money leaves an asset/liability and
    lands in an expense account. Amounts are signed: negative = money out of
    that account, positive = money in. Pass amounts as STRINGS to preserve
    decimal precision (never floats).

    Example — a 45.90 BRL grocery purchase paid from checking:
        date="2026-07-15", payee="Pão de Açúcar", narration="Groceries",
        postings=[
            {"account": "Expenses:Food:Groceries", "amount": "45.90", "currency": "BRL"},
            {"account": "Assets:Bank:Checking",     "amount": "-45.90", "currency": "BRL"},
        ]

    Tip: call ``suggest_posting(payee)`` first to get the account and typical
    amount previously used for a payee.

    Each posting dict accepts: account (required), amount, currency, and
    optionally cost, cost_currency, price, price_currency (for investments).

    Returns the created transaction, or ``{"success": false, "errors": [...]}``
    if Beancount rejects it (e.g. postings don't balance) — read the errors
    and correct the postings.
    """
    err = _balance_error(postings)
    if err is not None:
        return {"success": False, "errors": [err]}

    body = {
        "date": date,
        "flag": flag,
        "payee": payee,
        "narration": narration,
        "tags": tags or [],
        "links": [],
        "postings": postings,
    }
    return _post("/api/transactions", body)


@mcp.tool()
def suggest_posting(payee: str) -> dict[str, Any]:
    """Suggest the most-used account and typical amount for a payee.

    Based on that payee's transaction history. Use before ``add_transaction``
    to fill in a sensible counter-account and amount.
    """
    return _get("/api/suggestions", {"payee": payee})


# ------------------------------------------------------------------
# Tools — period reports
# ------------------------------------------------------------------


# For a single month, prefer the ``month="YYYY-MM"`` argument on these tools.
# It resolves to the exact date range the Ledgr app uses (exclusive end date),
# so the numbers match the app's reports. Using from_date/to_date="YYYY-07-01"
# .."YYYY-07-31" instead silently drops transactions on the last day.


@mcp.tool()
def income_statement(
    month: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    interval: str = "monthly",
) -> dict[str, Any]:
    """Income Statement (P&L) for a period: income and expenses as a tree.

    Pass ``month="YYYY-MM"`` for a single month (recommended — matches the
    app exactly). Or an explicit range via ``from_date``/``to_date`` (ISO
    ``YYYY-MM-DD``); note ``to_date`` is EXCLUSIVE. ``interval`` is
    monthly | quarterly | yearly and controls the period columns.
    """
    fd, td = _period(month, from_date, to_date)
    return _get("/api/reports/income-statement", {
        "from_date": fd, "to_date": td, "interval": interval,
    })


@mcp.tool()
def balance_sheet(
    month: str | None = None,
    to_date: str | None = None,
) -> dict[str, Any]:
    """Balance Sheet as of a date: Assets, Liabilities, Equity.

    Pass ``month="YYYY-MM"`` for the end of that month, or an explicit
    ``to_date`` (ISO ``YYYY-MM-DD``, EXCLUSIVE). Income and Expenses are
    closed into Equity so Assets + Liabilities + Equity == 0.
    """
    if month:
        _, to_date = _month_range(month)
    # A snapshot is cumulative, so no lower bound — the endpoint treats a
    # lone ``to_date`` as an open lower bound.
    return _get("/api/reports/balance-sheet", {"to_date": to_date})


@mcp.tool()
def cashflow(
    month: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    interval: str = "monthly",
) -> dict[str, Any]:
    """Cash Flow Statement for a period (operating / investing / financing).

    Pass ``month="YYYY-MM"`` for a single month (recommended — matches the
    app's Net Cash Flow exactly). Or an explicit range via ``from_date``/
    ``to_date`` (ISO ``YYYY-MM-DD``); note ``to_date`` is EXCLUSIVE, so for
    "all of July" use to_date of the 1st of August. ``interval`` monthly |
    quarterly | yearly.
    """
    fd, td = _period(month, from_date, to_date)
    return _get("/api/reports/cashflow", {
        "from_date": fd, "to_date": td, "interval": interval,
    })


@mcp.tool()
def income_vs_expense(
    month: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    interval: str = "monthly",
) -> dict[str, Any]:
    """Total income vs total expense per period — the quick 'am I saving?' view.

    Pass ``month="YYYY-MM"`` for a single month (recommended), or an explicit
    range via ``from_date``/``to_date`` (ISO ``YYYY-MM-DD``, ``to_date``
    EXCLUSIVE). ``interval`` monthly | quarterly | yearly.
    """
    fd, td = _period(month, from_date, to_date)
    return _get("/api/reports/income-expense", {
        "from_date": fd, "to_date": td, "interval": interval,
    })


@mcp.tool()
def net_worth(
    month: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    interval: str = "monthly",
) -> dict[str, Any]:
    """Net worth (Assets + Liabilities) at each period end.

    Pass ``month="YYYY-MM"`` for a single month, or a range via
    ``from_date``/``to_date`` (ISO ``YYYY-MM-DD``, ``to_date`` EXCLUSIVE).
    Omit everything for the full history. ``interval`` monthly | quarterly |
    yearly.
    """
    fd, td = _period(month, from_date, to_date)
    return _get("/api/reports/net-worth", {
        "from_date": fd, "to_date": td, "interval": interval,
    })


# ------------------------------------------------------------------
# Tools — query
# ------------------------------------------------------------------


@mcp.tool()
def list_transactions(
    account: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    tags: list[str] | None = None,
    payee: str | None = None,
) -> dict[str, Any]:
    """List transactions, optionally filtered.

    All filters are optional and combine: ``account`` (regex / account name),
    ``from_date``/``to_date`` (ISO ``YYYY-MM-DD``), ``tags``, ``payee``.
    Returns ``{transactions, count, opening_balance}``.
    """
    return _get("/api/transactions", {
        "account": account, "from_date": from_date, "to_date": to_date,
        "tags": tags, "payee": payee,
    })


@mcp.tool()
def list_accounts() -> dict[str, Any]:
    """List all accounts with their current balances and metadata."""
    return _get("/api/accounts")


@mcp.tool()
def account_balance(
    account: str,
    from_date: str | None = None,
    to_date: str | None = None,
    interval: str = "monthly",
) -> dict[str, Any]:
    """Running balance of one account over time.

    ``account`` is required (e.g. ``Assets:Bank:Checking``). Dates ISO
    ``YYYY-MM-DD``; ``interval`` monthly | quarterly | yearly.
    """
    return _get("/api/reports/account-balance", {
        "account": account, "from_date": from_date, "to_date": to_date,
        "interval": interval,
    })


# ------------------------------------------------------------------
# Tools — budget
# ------------------------------------------------------------------


@mcp.tool()
def get_budget(month: str) -> dict[str, Any]:
    """Budget for a month: allocations vs actuals per envelope (ZBB).

    ``month`` is ``YYYY-MM``. Returns the budget pool, per-section envelopes
    with budgeted vs actual amounts, and zero-based-budget closure.
    """
    return _get("/api/budget", {"month": month})


if __name__ == "__main__":
    mcp.run()
