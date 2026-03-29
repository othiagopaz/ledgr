"""
The boundary between Fava/Beancount types and JSON-serializable dicts.

All Fava and Beancount types (``Tree``, ``Inventory``, ``Amount``,
``Decimal``, ``date``) are **not** JSON-serializable by default.  Every
conversion happens exclusively here.

Rules (AGENTS.md §6):
- No router converts types directly — always call a serializer.
- Serializers are pure functions (no side effects, no I/O).
- All monetary values are returned as **strings** (``Decimal`` → ``str``)
  to preserve precision across JSON transport.
- Report aggregate totals are returned as ``float`` for chart consumption,
  but only at the serialization boundary — never in intermediate computation.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from beancount.core import data, inventory, realization

# Canonical ordering for the five account types in the account tree.
ACCOUNT_TYPE_ORDER: dict[str, int] = {
    "Assets": 0,
    "Liabilities": 1,
    "Income": 2,
    "Expenses": 3,
    "Equity": 4,
}


# ------------------------------------------------------------------
# Inventory / Amount
# ------------------------------------------------------------------

def serialize_inventory(inv: inventory.Inventory) -> list[dict[str, Any]]:
    """Convert a Beancount ``Inventory`` to a list of balance dicts.

    Each position becomes::

        {"number": "1234.56", "currency": "BRL",
         "cost": "10.00", "cost_currency": "USD", "cost_date": "2024-01-01"}
    """
    result: list[dict[str, Any]] = []
    for pos in inv:
        entry: dict[str, Any] = {
            "number": str(pos.units.number),
            "currency": pos.units.currency,
        }
        if pos.cost is not None:
            entry["cost"] = str(pos.cost.number) if pos.cost.number else None
            entry["cost_currency"] = pos.cost.currency
            entry["cost_date"] = (
                pos.cost.date.isoformat() if pos.cost.date else None
            )
        result.append(entry)
    return result


# ------------------------------------------------------------------
# Account tree
# ------------------------------------------------------------------

# Internal metadata keys to exclude from the user-visible metadata dict.
_INTERNAL_META_KEYS = frozenset({"filename", "lineno", "ledgr-type"})


def serialize_account_node(
    real_acct: realization.RealAccount,
    opens_map: dict[str, data.Open] | None = None,
) -> dict[str, Any]:
    """Recursively serialize a ``RealAccount`` into a JSON-friendly dict.

    When ``opens_map`` is provided, enriches nodes with Open directive data:
    ``ledgr_type``, ``open_date``, ``currencies``, and ``metadata``.

    Returns the shape expected by ``AccountNode`` on the frontend.
    """
    children = [
        serialize_account_node(c, opens_map) for c in real_acct.values()
    ]
    children.sort(key=lambda n: n["name"])

    balance = realization.compute_balance(real_acct)
    balance_list = serialize_inventory(balance)

    acct_name = real_acct.account
    acct_type = acct_name.split(":")[0] if acct_name else ""

    # Enrich from Open directive
    open_entry = opens_map.get(acct_name) if opens_map else None
    ledgr_type = None
    open_date = None
    currencies: list[str] = []
    metadata: dict[str, str] = {}

    if open_entry:
        ledgr_type = open_entry.meta.get("ledgr-type")
        open_date = open_entry.date.isoformat()
        currencies = list(open_entry.currencies) if open_entry.currencies else []
        metadata = {
            k: str(v) for k, v in open_entry.meta.items()
            if k not in _INTERNAL_META_KEYS
        }

    return {
        "name": acct_name,
        "type": acct_type,
        "ledgr_type": ledgr_type,
        "open_date": open_date,
        "currencies": currencies,
        "metadata": metadata,
        "balance": balance_list,
        "children": children,
        "is_leaf": len(children) == 0,
    }


# ------------------------------------------------------------------
# Transaction / Posting
# ------------------------------------------------------------------

def serialize_posting(posting: data.Posting) -> dict[str, Any]:
    """Serialize a single ``Posting``.

    Monetary values (amount, cost, price) are always strings.
    """
    result: dict[str, Any] = {
        "account": posting.account,
        "amount": str(posting.units.number) if posting.units else None,
        "currency": posting.units.currency if posting.units else None,
    }
    if posting.cost is not None:
        # CostSpec uses number_per; Cost uses number
        cost_number = getattr(posting.cost, "number_per", None) or getattr(posting.cost, "number", None)
        result["cost"] = str(cost_number) if cost_number else None
        result["cost_currency"] = posting.cost.currency
        result["cost_date"] = (
            posting.cost.date.isoformat() if posting.cost.date else None
        )
    if posting.price is not None:
        result["price"] = str(posting.price.number)
        result["price_currency"] = posting.price.currency
    return result


def serialize_transaction(txn: data.Transaction) -> dict[str, Any]:
    """Serialize a Beancount ``Transaction`` into the frontend JSON shape.

    Matches ``Transaction`` in ``frontend/src/types/index.ts``.
    """
    return {
        "date": txn.date.isoformat(),
        "flag": txn.flag,
        "payee": txn.payee or "",
        "narration": txn.narration or "",
        "tags": list(txn.tags) if txn.tags else [],
        "links": list(txn.links) if txn.links else [],
        "lineno": txn.meta.get("lineno") if txn.meta else None,
        "postings": [serialize_posting(p) for p in txn.postings],
        "metadata": _extract_ledgr_metadata(txn.meta) if txn.meta else {},
    }


def _extract_ledgr_metadata(meta: dict) -> dict[str, Any]:
    """Extract ``ledgr-*`` metadata keys for frontend consumption."""
    return {
        k: v for k, v in meta.items()
        if isinstance(k, str) and k.startswith("ledgr-")
    }


# ------------------------------------------------------------------
# Errors
# ------------------------------------------------------------------

def serialize_error(error: Any) -> dict[str, Any]:
    """Serialize a Beancount load/validation error."""
    return {
        "message": str(error),
        "source": getattr(error, "source", None),
        "entry": (
            str(getattr(error, "entry", ""))
            if hasattr(error, "entry")
            else None
        ),
    }


# ------------------------------------------------------------------
# Report helpers — aggregate serialization
# ------------------------------------------------------------------

def decimal_to_report_number(value: Decimal) -> float:
    """Convert a ``Decimal`` to a ``float`` for chart/report consumption.

    This is the **only** place where ``float()`` should be called on a
    monetary value.  Used exclusively for aggregate report totals that the
    frontend renders as ``number`` (charts, totals, net_income, etc.).
    """
    return round(float(value), 2)


def format_other_balances(balances: dict[str, Decimal]) -> list[dict[str, Any]]:
    """Format non-operating-currency balances for the 'Other' column.

    Returns list of ``{"amount": "55500.00", "currency": "IRAUSD"}`` dicts.
    Excludes zero balances.  Sorted by currency name.
    """
    result = []
    for curr in sorted(balances):
        val = balances[curr]
        if val != 0:
            result.append({"amount": str(val), "currency": curr})
    return result


def attach_other_currencies_to_report_tree(
    tree: list[dict[str, Any]],
    account_period_other: dict[str, dict[str, dict[str, Decimal]]],
    periods: list[str],
    negate: bool = False,
) -> None:
    """Walk a report tree and attach ``other_totals`` / ``other_total``.

    ``account_period_other`` is keyed as
    ``account → period → currency → Decimal``.
    """
    sign = -1 if negate else 1

    def _walk(node: dict[str, Any]) -> None:
        name = node["name"]
        # Collect this node's own other-currency data
        own_other = account_period_other.get(name, {})
        # Recurse into children first so we can aggregate upward
        for child in node.get("children", []):
            _walk(child)

        other_totals: dict[str, dict[str, Any]] = {}
        other_total_agg: dict[str, Decimal] = {}

        # Own data
        for period in periods:
            period_data = own_other.get(period, {})
            for curr, val in period_data.items():
                other_total_agg[curr] = other_total_agg.get(curr, Decimal(0)) + val * sign
                # Build per-period aggregation too
                if period not in other_totals:
                    other_totals[period] = {}
                other_totals[period][curr] = other_totals[period].get(curr, Decimal(0)) + val * sign

        # Add children's other data
        for child in node.get("children", []):
            for period, items in (child.get("other_totals") or {}).items():
                if period not in other_totals:
                    other_totals[period] = {}
                for item in items:
                    c = item["currency"]
                    v = Decimal(item["amount"])
                    other_totals[period][c] = other_totals[period].get(c, Decimal(0)) + v
            for item in (child.get("other_total") or []):
                c = item["currency"]
                v = Decimal(item["amount"])
                other_total_agg[c] = other_total_agg.get(c, Decimal(0)) + v

        # Convert aggregated dicts to sorted lists
        node["other_totals"] = {
            p: format_other_balances(currs)
            for p, currs in other_totals.items()
        }
        node["other_total"] = format_other_balances(other_total_agg)

    for node in tree:
        _walk(node)


def attach_other_currencies_to_balance_tree(
    tree: list[dict[str, Any]],
    account_balance_other: dict[str, dict[str, Decimal]],
    negate: bool = False,
) -> None:
    """Walk a balance tree and attach ``other_balance`` to each node."""
    sign = -1 if negate else 1

    def _walk(node: dict[str, Any]) -> None:
        name = node["name"]
        for child in node.get("children", []):
            _walk(child)

        agg: dict[str, Decimal] = {}
        # Own data
        for curr, val in account_balance_other.get(name, {}).items():
            agg[curr] = agg.get(curr, Decimal(0)) + val * sign
        # Children data
        for child in node.get("children", []):
            for item in (child.get("other_balance") or []):
                c = item["currency"]
                v = Decimal(item["amount"])
                agg[c] = agg.get(c, Decimal(0)) + v

        node["other_balance"] = format_other_balances(agg)

    for node in tree:
        _walk(node)


def build_report_tree(
    accounts: set[str],
    account_period: dict[str, dict[str, Decimal]],
    periods: list[str],
    negate: bool = False,
) -> list[dict[str, Any]]:
    """Build a hierarchical tree for income-statement-style accounts.

    Each node has ``name``, ``totals`` (period → float), ``total`` (float),
    and ``children``.  Matches ``AccountReportNode`` in frontend types.
    """
    sign = -1 if negate else 1

    # Build parent → children map
    children_map: dict[str, set[str]] = {}
    for acct in accounts:
        parts = acct.split(":")
        for i in range(1, len(parts)):
            parent = ":".join(parts[:i])
            child = ":".join(parts[: i + 1])
            if parent not in children_map:
                children_map[parent] = set()
            children_map[parent].add(child)

    def build_node(name: str) -> dict[str, Any]:
        kids = sorted(children_map.get(name, set()))
        child_nodes = [build_node(k) for k in kids]

        totals: dict[str, float] = {}
        for period in periods:
            own_val = (
                float(account_period.get(name, {}).get(period, Decimal(0)))
                * sign
            )
            children_val = sum(
                cn["totals"].get(period, 0.0) for cn in child_nodes
            )
            val = own_val + children_val
            if val != 0.0:
                totals[period] = round(val, 2)

        total = round(sum(totals.values()), 2)
        return {
            "name": name,
            "totals": totals,
            "total": total,
            "children": child_nodes,
        }

    # Find top-level roots (e.g., "Income", "Expenses")
    roots: set[str] = set()
    for acct in accounts:
        roots.add(acct.split(":")[0])

    result: list[dict[str, Any]] = []
    for root in sorted(roots):
        if root in children_map or root in account_period:
            node = build_node(root)
            result = node["children"]
    return result


def build_balance_tree(
    accounts: set[str],
    account_balance: dict[str, Decimal],
    negate: bool = False,
) -> list[dict[str, Any]]:
    """Build a hierarchical tree for balance-sheet accounts.

    Each node has ``name``, ``balance`` (float), and ``children``.
    Matches ``BalanceSheetNode`` in frontend types.
    """
    children_map: dict[str, set[str]] = {}
    for acct in accounts:
        parts = acct.split(":")
        for i in range(1, len(parts)):
            parent = ":".join(parts[:i])
            child = ":".join(parts[: i + 1])
            if parent not in children_map:
                children_map[parent] = set()
            children_map[parent].add(child)

    def build_node(name: str) -> dict[str, Any]:
        kids = sorted(children_map.get(name, set()))
        child_nodes = [build_node(k) for k in kids]

        own = float(account_balance.get(name, Decimal(0)))
        children_total = sum(cn["balance"] for cn in child_nodes)
        balance = round(own + children_total, 2)
        if negate:
            balance = -balance

        return {
            "name": name,
            "balance": balance,
            "children": child_nodes,
        }

    roots: set[str] = set()
    for acct in accounts:
        roots.add(acct.split(":")[0])

    result: list[dict[str, Any]] = []
    for root in sorted(roots):
        if root in children_map or root in account_balance:
            node = build_node(root)
            result = node["children"]
    return result
