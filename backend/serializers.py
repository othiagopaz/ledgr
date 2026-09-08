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

import datetime
import re
from collections.abc import Collection, Iterable
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from beancount.core import data, inventory, realization
from fava.beans.prices import FavaPriceMap
from fava.core.conversion import AT_VALUE, convert_position, cost_or_value
from fava.core.inventory import CounterInventory

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
    closes_map: dict[str, data.Close] | None = None,
    posting_counts: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Recursively serialize a ``RealAccount`` into a JSON-friendly dict.

    When ``opens_map`` is provided, enriches nodes with Open directive data:
    ``ledgr_type``, ``open_date``, ``currencies``, and ``metadata``.

    ``closes_map`` marks accounts carrying a ``Close`` directive as inactive, and
    ``posting_counts`` reports how many postings name the account — the account
    list uses both to keep a large catalog of long-dead accounts readable.

    Returns the shape expected by ``AccountNode`` on the frontend.
    """
    children = [
        serialize_account_node(c, opens_map, closes_map, posting_counts)
        for c in real_acct.values()
    ]
    children.sort(key=lambda n: n["name"])

    balance = realization.compute_balance(real_acct)
    balance_list = serialize_inventory(balance)

    acct_name = real_acct.account
    acct_type = acct_name.split(":")[0] if acct_name else ""

    # Enrich from Open directive
    open_entry = opens_map.get(acct_name) if opens_map else None
    ledgr_type = None
    booking = None
    open_date = None
    currencies: list[str] = []
    metadata: dict[str, str] = {}

    if open_entry:
        ledgr_type = open_entry.meta.get("ledgr-type")
        booking = open_entry.booking.name if open_entry.booking else None
        open_date = open_entry.date.isoformat()
        currencies = list(open_entry.currencies) if open_entry.currencies else []
        metadata = {
            k: str(v) for k, v in open_entry.meta.items()
            if k not in _INTERNAL_META_KEYS
        }

    close_entry = closes_map.get(acct_name) if closes_map else None
    own_postings = posting_counts.get(acct_name, 0) if posting_counts else 0
    # A parent with no postings of its own is still "used" when a child is, so
    # the unused badge only fires on a genuinely dead subtree.
    subtree_postings = own_postings + sum(
        c.get("subtree_posting_count", 0) for c in children
    )

    return {
        "name": acct_name,
        "type": acct_type,
        "ledgr_type": ledgr_type,
        "booking": booking,
        "open_date": open_date,
        "currencies": currencies,
        "metadata": metadata,
        "balance": balance_list,
        "children": children,
        "is_leaf": len(children) == 0,
        "closed": close_entry is not None,
        "close_date": close_entry.date.isoformat() if close_entry else None,
        "posting_count": own_postings,
        "subtree_posting_count": subtree_postings,
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
        # CostSpec uses number_per; Cost uses number. An unbooked CostSpec
        # (`{}`, `{# total}`, `{2020-03-01}`) carries MISSING in the number
        # and currency slots — a class, not a value — so only real ones pass.
        cost_number = getattr(posting.cost, "number_per", None) or getattr(posting.cost, "number", None)
        result["cost"] = str(cost_number) if isinstance(cost_number, Decimal) else None
        cost_currency = posting.cost.currency
        result["cost_currency"] = cost_currency if isinstance(cost_currency, str) else None
        result["cost_date"] = (
            posting.cost.date.isoformat() if posting.cost.date else None
        )
        result["cost_label"] = posting.cost.label
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
        # `lineno` alone does NOT identify a transaction: a ledger split over
        # `include` files has the same line number in several of them (52% of
        # linenos collide on a real 8-file ledger). Edits and deletes must key
        # on the pair, or they hit whichever file the loader happened to order
        # first — silently rewriting an unrelated entry in another year.
        "filename": txn.meta.get("filename") if txn.meta else None,
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
# Write helpers — precision normalization
# ------------------------------------------------------------------

def quantize_amount(value: Decimal) -> Decimal:
    """Normalize a monetary value to exactly 2 decimal places for writing.

    Amounts Ledgr writes to the ledger go through here.  Beancount's printer
    preserves the precision it is handed, so a user typing ``38.2`` would
    otherwise land in the file as ``38.2`` — and that single decimal place
    breaks auto-balancing in a way that fails *silently*:

    * Beancount quantizes an elided posting's interpolated value to the
      smallest precision present in the transaction.  With ``38.2`` in the
      mix, an interpolated ``219.04`` is rounded to ``219.0`` — 4 centavos
      vanish and the transaction no longer sums to zero.
    * It then re-checks the balance against a tolerance inferred from that
      same precision (1 dp x 0.5 = ``0.05``), so the 0.04 residual fits
      inside the tolerance and no error is ever raised.

    Writing ``38.20`` instead pins both mechanisms to 2 dp: interpolation
    rounds correctly and the tolerance tightens to ``0.005``.

    Only ever *adds* precision — a value that already carries more than 2
    decimals (an FX rate, a fund unit, a crypto holding) is returned
    untouched, since rounding those would destroy real data.  Callers apply
    this to posting ``units`` only; ``cost``/``price`` keep their precision.
    """
    if -value.as_tuple().exponent > 2:
        return value
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


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
    keep_root: bool = False,
) -> list[dict[str, Any]]:
    """Build a hierarchical tree for income-statement-style accounts.

    Each node has ``name``, ``totals`` (period → float), ``total`` (float),
    and ``children``.  Matches ``AccountReportNode`` in frontend types.

    ``keep_root``: when False (the Income Statement), the root level is dropped
    and its children are returned — the section header already names the root
    ("Income"/"Expenses"), so a root row would be redundant.  When True (the
    Cash Flow Statement), the root is returned as a node: a cash flow section
    mixes roots by design (per-counterpart attribution puts Assets, Liabilities
    and Income under the same section), and an asset increase reads opposite to
    a liability increase, so the reader needs to see which root a row sits under.

    ``accounts`` may span several roots; every root is included.
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
            if keep_root:
                result.append(node)
            else:
                result.extend(node["children"])
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


# ------------------------------------------------------------------
# Conversion lenses — Fava does the valuation, these adapt its output
# ------------------------------------------------------------------
#
# Every report accepts ``conversion`` (PLAN-commodities-ux §4.7):
#
#   units     → raw units, no valuation at all
#   at_cost   → held-at-cost positions collapse into their cost (Fava AT_COST)
#   at_value  → market value in the operating currency (see convert_inventory)
#   <CCY>     → Fava's currency conversion into that one currency
#
# Nothing here computes a price or a cost: the reducers are Fava's, the price
# lookups are ``FavaPriceMap``'s.  These helpers only pick the lens, hand the
# inventory to Fava, and turn the result into ``{currency: Decimal}``.

CONVERSION_LENSES: tuple[str, ...] = ("units", "at_cost", "at_value")

# Beancount's own currency grammar (``beancount.parser.lexer``).
CURRENCY_RE = re.compile(r"^[A-Z][A-Z0-9'._-]{0,22}[A-Z0-9]$|^[A-Z]$")


def collect_commodities(entries: Iterable[Any], options: dict[str, Any]) -> set[str]:
    """Every commodity symbol the ledger has seen, declared or not.

    Beancount 2 filled ``options_map["commodities"]`` from the parser;
    Beancount 3 leaves it empty.  The display context is the modern equivalent
    — the parser registers every ``number currency`` it reads — so it is the
    primary source, completed with the symbols that never appear beside a
    number (``open`` currency constraints, ``commodity`` declarations, price
    pairs, the operating currency itself).
    """
    found: set[str] = set(options.get("operating_currency") or ())
    dcontext = options.get("dcontext")
    if dcontext is not None:
        found.update(
            c for c in getattr(dcontext, "ccontexts", {}) if CURRENCY_RE.match(c)
        )
    for entry in entries:
        if isinstance(entry, data.Commodity):
            found.add(entry.currency)
        elif isinstance(entry, data.Open) and entry.currencies:
            found.update(entry.currencies)
        elif isinstance(entry, data.Price):
            found.add(entry.currency)
            found.add(entry.amount.currency)
    return found


def parse_conversion(value: str | None, known_currencies: Collection[str]) -> str | None:
    """Normalize a ``conversion`` query value; ``None`` when it is garbage.

    Accepts the three lenses and any currency the ledger knows.  Unknown
    currencies are rejected rather than converted to nothing — a typo would
    otherwise silently produce a report full of unconverted units.
    """
    if value is None:
        return "at_value"
    value = value.strip()
    if value in CONVERSION_LENSES:
        return value
    if CURRENCY_RE.match(value) and value in known_currencies:
        return value
    return None


def report_currency(conversion: str, oc: str) -> str:
    """The currency a report's totals are stated in under ``conversion``.

    The operating currency for the three lenses; the target currency itself
    when the lens is a currency code.
    """
    return oc if conversion in CONVERSION_LENSES else conversion


def to_counter_inventory(inv: Iterable[Any]) -> CounterInventory:
    """Copy a Beancount ``Inventory`` (or any iterable of positions) into
    Fava's ``CounterInventory`` so Fava's conversions can be applied to it."""
    if isinstance(inv, CounterInventory):
        return inv
    counter = CounterInventory()
    for pos in inv:
        counter.add_position(pos)
    return counter


def convert_inventory(
    inv: Iterable[Any] | CounterInventory,
    conversion: str,
    prices: FavaPriceMap,
    date: datetime.date | None,
    oc: str,
) -> dict[str, Decimal]:
    """Apply a conversion lens and return ``{currency: Decimal}``.

    ``at_value`` is Fava's ``AT_VALUE`` — market price when one exists, the
    **cost** when it does not, in the position's cost currency — followed by a
    second pass that carries whatever is still not in the operating currency
    across to it (``USD`` cash at the USD→BRL rate, gold valued in USD then
    USD→BRL).  Fava's balance sheet stops after the first pass, which is right
    for a multi-currency household but leaves a BRL user staring at a USD line
    that adds up with nothing.  Anything with no price path at all (vacation
    days) stays in its own currency, which is how it lands in ``other_totals``.

    ``units``, ``at_cost`` and ``<CURRENCY>`` are passed straight to
    ``fava.core.conversion.cost_or_value``.
    """
    counter = to_counter_inventory(inv)
    if conversion == "at_value":
        valued = AT_VALUE.apply(counter, prices, date)
        result = valued.reduce(convert_position, oc, prices, date)
    else:
        result = cost_or_value(counter, conversion, prices, date)
    return dict(result)


def quantize_display(
    value: Decimal, currency: str, precisions: dict[str, int] | None = None
) -> Decimal:
    """Round a *derived* value to the currency's display precision.

    Only for numbers Ledgr itself derives — an average cost, a market value
    chained through two rates, a percentage — which otherwise carry every
    digit of the intermediate arithmetic.  Amounts read from the ledger are
    never passed through here; they keep the precision the user wrote.

    The precision is Fava's: the commodity's ``precision`` metadata when
    declared, else the most common precision seen in the file for that
    currency (``options["dcontext"]``), else 2.
    """
    places = (precisions or {}).get(currency, 2)
    return value.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
