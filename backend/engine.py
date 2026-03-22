"""
Wraps Beancount's library for use by the API layer.

Beancount v3 modules used:
- beancount.loader.load_file()
- beancount.core.data — Transaction, TxnPosting, Open, etc.
- beancount.core.realization — realize() builds account tree with balances
- beancount.core.amount — Amount namedtuple (number, currency)
- beancount.core.inventory — Inventory for multi-currency balances
- beancount.parser.printer — format_entry() for writing back to file
"""

from __future__ import annotations

import datetime
import os
from decimal import Decimal
from typing import Any

from beancount import loader
from beancount.core import data, realization, amount as amt_mod, inventory
from beancount.parser import printer


class LedgrEngine:
    def __init__(self, filepath: str):
        self.filepath = os.path.abspath(filepath)
        self.entries: list = []
        self.errors: list = []
        self.options: dict = {}
        self._real_root: realization.RealAccount | None = None
        self.load()

    def load(self):
        self.entries, self.errors, self.options = loader.load_file(self.filepath)
        self._real_root = realization.realize(self.entries)

    # ------------------------------------------------------------------
    # Accounts
    # ------------------------------------------------------------------

    def get_accounts(self) -> list[dict]:
        root = self._real_root
        top_level = []
        for child in root.values():
            top_level.append(self._build_account_node(child))
        top_level.sort(key=lambda n: _ACCOUNT_TYPE_ORDER.get(n["name"], 99))
        return top_level

    def _build_account_node(self, real_acct: realization.RealAccount) -> dict:
        children = [self._build_account_node(c) for c in real_acct.values()]
        children.sort(key=lambda n: n["name"])

        balance = realization.compute_balance(real_acct)
        balance_list = _inventory_to_list(balance)

        acct_name = real_acct.account
        acct_type = acct_name.split(":")[0] if acct_name else ""

        return {
            "name": acct_name,
            "type": acct_type,
            "balance": balance_list,
            "children": children,
            "is_leaf": len(children) == 0,
        }

    # ------------------------------------------------------------------
    # Transactions
    # ------------------------------------------------------------------

    def get_transactions(
        self,
        account: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> list[dict]:
        txns = [e for e in self.entries if isinstance(e, data.Transaction)]

        if account:
            txns = [
                t for t in txns if any(p.account == account for p in t.postings)
            ]

        if from_date:
            d = _parse_date(from_date)
            txns = [t for t in txns if t.date >= d]

        if to_date:
            d = _parse_date(to_date)
            txns = [t for t in txns if t.date <= d]

        return [_txn_to_dict(t) for t in txns]

    def get_payees(self) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for e in self.entries:
            if isinstance(e, data.Transaction) and e.payee and e.payee not in seen:
                seen.add(e.payee)
                result.append(e.payee)
        result.sort()
        return result

    def get_account_names(self) -> list[str]:
        names: list[str] = []
        for child in realization.iter_children(self._real_root):
            if child.account:
                names.append(child.account)
        names.sort()
        return names

    # ------------------------------------------------------------------
    # Mutation
    # ------------------------------------------------------------------

    @staticmethod
    def _build_bc_postings(postings: list[dict]) -> list:
        """Convert posting dicts to beancount Posting objects."""
        bc_postings = []
        for p in postings:
            units = None
            cost = None
            price = None
            if p.get("amount") is not None and p.get("currency"):
                units = amt_mod.Amount(Decimal(str(p["amount"])), p["currency"])
            if p.get("cost") is not None and p.get("cost_currency"):
                cost = data.CostSpec(
                    Decimal(str(p["cost"])),
                    None,
                    p["cost_currency"],
                    None,
                    None,
                    False,
                )
            if p.get("price") is not None and p.get("price_currency"):
                price = amt_mod.Amount(Decimal(str(p["price"])), p["price_currency"])
            bc_postings.append(
                data.Posting(p["account"], units, cost, price, None, None)
            )
        return bc_postings

    def add_transaction(
        self,
        date: str,
        flag: str,
        payee: str | None,
        narration: str,
        postings: list[dict],
        tags: list[str] | None = None,
        links: list[str] | None = None,
    ) -> dict:
        txn_date = _parse_date(date)
        bc_postings = self._build_bc_postings(postings)

        meta = data.new_metadata(self.filepath, 0)
        txn = data.Transaction(
            meta,
            txn_date,
            flag or "*",
            payee or "",
            narration or "",
            frozenset(tags or []),
            frozenset(links or []),
            bc_postings,
        )

        txn_text = "\n\n" + printer.format_entry(txn)

        with open(self.filepath, "r") as f:
            original = f.read()

        with open(self.filepath, "a") as f:
            f.write(txn_text)

        old_errors = len(self.errors)
        self.load()

        new_errors = self.errors[old_errors:]
        if new_errors:
            with open(self.filepath, "w") as f:
                f.write(original)
            self.load()
            return {
                "success": False,
                "errors": [str(e) for e in new_errors],
            }

        return {
            "success": True,
            "transaction": _txn_to_dict(txn),
        }

    def edit_transaction(
        self,
        lineno: int,
        date: str,
        flag: str,
        payee: str | None,
        narration: str,
        postings: list[dict],
        tags: list[str] | None = None,
        links: list[str] | None = None,
    ) -> dict:
        """Edit a transaction located at *lineno* in the beancount file."""
        with open(self.filepath, "r") as f:
            original = f.read()
        lines = original.split("\n")

        # Find the block: starts at lineno (1-indexed), ends at next directive or blank line
        start = lineno - 1  # convert to 0-indexed
        if start < 0 or start >= len(lines):
            return {"success": False, "errors": [f"Invalid line number: {lineno}"]}

        end = start + 1
        while end < len(lines):
            line = lines[end]
            # A blank line or a new directive (starts with a date or keyword) ends the block
            if line.strip() == "":
                break
            # If this line starts with a date pattern (YYYY-MM-DD) it's a new directive
            if len(line) >= 10 and line[0].isdigit() and line[4] == "-":
                break
            end += 1

        # Build the replacement transaction
        txn_date = _parse_date(date)
        bc_postings = self._build_bc_postings(postings)

        meta = data.new_metadata(self.filepath, lineno)
        txn = data.Transaction(
            meta,
            txn_date,
            flag or "*",
            payee or "",
            narration or "",
            frozenset(tags or []),
            frozenset(links or []),
            bc_postings,
        )

        new_text = printer.format_entry(txn).rstrip("\n")
        new_lines = lines[:start] + new_text.split("\n") + lines[end:]

        with open(self.filepath, "w") as f:
            f.write("\n".join(new_lines))

        old_error_count = len(self.errors)
        self.load()

        new_errors = self.errors[old_error_count:]
        if new_errors:
            with open(self.filepath, "w") as f:
                f.write(original)
            self.load()
            return {"success": False, "errors": [str(e) for e in new_errors]}

        return {"success": True, "transaction": _txn_to_dict(txn)}

    def delete_transaction(self, lineno: int) -> dict:
        """Delete the transaction block starting at *lineno*."""
        with open(self.filepath, "r") as f:
            original = f.read()
        lines = original.split("\n")

        start = lineno - 1
        if start < 0 or start >= len(lines):
            return {"success": False, "errors": [f"Invalid line number: {lineno}"]}

        end = start + 1
        while end < len(lines):
            line = lines[end]
            if line.strip() == "":
                break
            if len(line) >= 10 and line[0].isdigit() and line[4] == "-":
                break
            end += 1

        # Also consume trailing blank lines
        while end < len(lines) and lines[end].strip() == "":
            end += 1

        new_lines = lines[:start] + lines[end:]

        with open(self.filepath, "w") as f:
            f.write("\n".join(new_lines))

        old_error_count = len(self.errors)
        self.load()

        new_errors = self.errors[old_error_count:]
        if new_errors:
            with open(self.filepath, "w") as f:
                f.write(original)
            self.load()
            return {"success": False, "errors": [str(e) for e in new_errors]}

        return {"success": True}

    # ------------------------------------------------------------------
    # Info endpoints
    # ------------------------------------------------------------------

    def get_errors(self) -> list[dict]:
        return [
            {
                "message": str(e),
                "source": getattr(e, "source", None),
                "entry": str(getattr(e, "entry", "")) if hasattr(e, "entry") else None,
            }
            for e in self.errors
        ]

    def get_suggestions(self, payee: str) -> dict:
        """Return the most common transfer account and amount for a payee."""
        txns = [e for e in self.entries if isinstance(e, data.Transaction) and e.payee == payee]
        if not txns:
            return {"payee": payee, "account": None, "amount": None, "currency": None}

        account_counts: dict[str, int] = {}
        amounts: list[float] = []
        for t in txns:
            if len(t.postings) == 2:
                acct = t.postings[0].account
                account_counts[acct] = account_counts.get(acct, 0) + 1
                if t.postings[0].units:
                    amounts.append(float(t.postings[0].units.number))

        most_common = max(account_counts, key=account_counts.get) if account_counts else None

        typical_amount = None
        currency = None
        if amounts:
            from collections import Counter
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
    # Reports
    # ------------------------------------------------------------------

    def get_income_expense_series(self, interval: str = "monthly") -> list[dict]:
        """Monthly/quarterly/yearly income vs expense totals."""
        txns = [e for e in self.entries if isinstance(e, data.Transaction)]
        buckets: dict[str, dict] = {}  # period -> {income, expenses}

        for txn in txns:
            period = _date_to_period(txn.date, interval)
            if period not in buckets:
                buckets[period] = {"income": Decimal(0), "expenses": Decimal(0)}
            for p in txn.postings:
                if p.units is None:
                    continue
                acct_type = p.account.split(":")[0]
                if acct_type == "Income":
                    # Income is negative in beancount; negate to show positive
                    buckets[period]["income"] += -p.units.number
                elif acct_type == "Expenses":
                    buckets[period]["expenses"] += p.units.number

        result = []
        for period in sorted(buckets):
            result.append({
                "period": period,
                "income": float(buckets[period]["income"]),
                "expenses": float(buckets[period]["expenses"]),
            })
        return result

    def get_account_balance_series(self, account: str, interval: str = "monthly") -> list[dict]:
        """Running balance of a specific account over time."""
        txns = [e for e in self.entries if isinstance(e, data.Transaction)]
        txns.sort(key=lambda t: t.date)

        running = Decimal(0)
        period_balance: dict[str, float] = {}

        for txn in txns:
            for p in txn.postings:
                if p.account == account and p.units is not None:
                    running += p.units.number
            period = _date_to_period(txn.date, interval)
            period_balance[period] = float(running)

        return [{"period": p, "balance": b} for p, b in sorted(period_balance.items())]

    def get_net_worth_series(self, interval: str = "monthly") -> list[dict]:
        """Assets + Liabilities at each period end."""
        txns = [e for e in self.entries if isinstance(e, data.Transaction)]
        txns.sort(key=lambda t: t.date)

        assets = Decimal(0)
        liabilities = Decimal(0)
        snapshots: dict[str, dict] = {}

        for txn in txns:
            for p in txn.postings:
                if p.units is None:
                    continue
                acct_type = p.account.split(":")[0]
                if acct_type == "Assets":
                    assets += p.units.number
                elif acct_type == "Liabilities":
                    liabilities += p.units.number
            period = _date_to_period(txn.date, interval)
            snapshots[period] = {
                "assets": float(assets),
                "liabilities": float(liabilities),
                "net_worth": float(assets + liabilities),
            }

        result = []
        for period in sorted(snapshots):
            result.append({"period": period, **snapshots[period]})
        return result

    def get_income_statement(
        self,
        from_date: str | None = None,
        to_date: str | None = None,
        interval: str = "monthly",
    ) -> dict:
        """Income statement with tree structure and period columns."""
        txns = [e for e in self.entries if isinstance(e, data.Transaction)]
        if from_date:
            d = _parse_date(from_date)
            txns = [t for t in txns if t.date >= d]
        if to_date:
            d = _parse_date(to_date)
            txns = [t for t in txns if t.date <= d]

        # Accumulate per-account per-period totals
        account_period: dict[str, dict[str, Decimal]] = {}
        periods_set: set[str] = set()

        for txn in txns:
            period = _date_to_period(txn.date, interval)
            periods_set.add(period)
            for p in txn.postings:
                if p.units is None:
                    continue
                acct_type = p.account.split(":")[0]
                if acct_type not in ("Income", "Expenses"):
                    continue
                if p.account not in account_period:
                    account_period[p.account] = {}
                account_period[p.account][period] = (
                    account_period[p.account].get(period, Decimal(0)) + p.units.number
                )

        periods = sorted(periods_set)

        # Build tree for a root type
        def build_tree(root_type: str, negate: bool = False) -> list[dict]:
            # Collect all accounts under this root
            accts = {a for a in account_period if a.startswith(root_type + ":")}
            # Also include the root itself if it has data
            if root_type in account_period:
                accts.add(root_type)
            return _build_report_tree(accts, account_period, periods, negate)

        income_tree = build_tree("Income", negate=True)
        expenses_tree = build_tree("Expenses", negate=False)

        # Net income per period
        net_income: dict[str, float] = {}
        for period in periods:
            inc = sum(
                float(-account_period[a].get(period, Decimal(0)))
                for a in account_period if a.startswith("Income")
            )
            exp = sum(
                float(account_period[a].get(period, Decimal(0)))
                for a in account_period if a.startswith("Expenses")
            )
            net_income[period] = round(inc - exp, 2)

        return {
            "income": income_tree,
            "expenses": expenses_tree,
            "periods": periods,
            "net_income": net_income,
        }

    def get_balance_sheet(self, as_of_date: str | None = None) -> dict:
        """Balance sheet at a point in time."""
        cutoff = _parse_date(as_of_date) if as_of_date else None
        txns = [e for e in self.entries if isinstance(e, data.Transaction)]
        if cutoff:
            txns = [t for t in txns if t.date <= cutoff]

        account_balance: dict[str, Decimal] = {}
        for txn in txns:
            for p in txn.postings:
                if p.units is None:
                    continue
                account_balance[p.account] = (
                    account_balance.get(p.account, Decimal(0)) + p.units.number
                )

        def build_section(root_type: str, negate: bool = False) -> list[dict]:
            accts = {a for a in account_balance if a.startswith(root_type + ":")}
            if root_type in account_balance:
                accts.add(root_type)
            return _build_balance_tree(accts, account_balance, negate)

        assets_tree = build_section("Assets")
        liabilities_tree = build_section("Liabilities")
        equity_tree = build_section("Equity")

        total_assets = sum(float(account_balance.get(a, 0)) for a in account_balance if a.startswith("Assets"))
        total_liabilities = sum(float(account_balance.get(a, 0)) for a in account_balance if a.startswith("Liabilities"))
        total_equity = sum(float(account_balance.get(a, 0)) for a in account_balance if a.startswith("Equity"))

        return {
            "assets": assets_tree,
            "liabilities": liabilities_tree,
            "equity": equity_tree,
            "totals": {
                "assets": round(total_assets, 2),
                "liabilities": round(total_liabilities, 2),
                "equity": round(total_equity, 2),
            },
        }

    def get_cashflow_statement(
        self,
        from_date: str | None = None,
        to_date: str | None = None,
        interval: str = "monthly",
    ) -> dict:
        """
        Cash Flow Statement — shows where money actually moved.

        Only transactions that touch an Asset account are included.
        Each asset posting is classified as operating/investing/financing/transfer
        based on the counterpart accounts.

        The key insight: a CC purchase (Expenses ↔ Liabilities) has NO asset
        movement, so it doesn't appear here. It only appears when the CC bill
        is paid (Assets ↔ Liabilities).
        """
        txns = [e for e in self.entries if isinstance(e, data.Transaction)]
        if from_date:
            d = _parse_date(from_date)
            txns = [t for t in txns if t.date >= d]
        if to_date:
            d = _parse_date(to_date)
            txns = [t for t in txns if t.date <= d]

        # Collect all cashflow items
        items: list[dict] = []
        periods_set: set[str] = set()

        for txn in txns:
            asset_postings = [
                p for p in txn.postings
                if p.account.startswith("Assets:") and p.units is not None
            ]
            if not asset_postings:
                continue  # No asset movement → not a cash flow event

            counterparts = [
                p.account for p in txn.postings
                if not p.account.startswith("Assets:")
            ]

            period = _date_to_period(txn.date, interval)
            periods_set.add(period)

            all_accts = [p.account for p in txn.postings]
            for posting in asset_postings:
                category = _classify_cashflow(
                    posting.account, counterparts, all_accts
                )
                # For counterpart display, prefer showing the non-asset side;
                # if all-asset txn, show the other asset account
                if counterparts:
                    cp_display = counterparts[0] if len(counterparts) == 1 else "Split"
                else:
                    other_assets = [a for a in all_accts if a != posting.account]
                    cp_display = other_assets[0] if len(other_assets) == 1 else "Split"
                items.append({
                    "period": period,
                    "account": posting.account,
                    "counterpart": cp_display,
                    "amount": posting.units.number,
                    "category": category,
                })

        periods = sorted(periods_set)

        # Aggregate by category and period
        def aggregate(cat: str) -> dict[str, float]:
            totals: dict[str, float] = {}
            for item in items:
                if item["category"] != cat:
                    continue
                p = item["period"]
                totals[p] = round(totals.get(p, 0.0) + float(item["amount"]), 2)
            return totals

        operating = aggregate("operating")
        investing = aggregate("investing")
        financing = aggregate("financing")
        transfers = aggregate("transfer")

        # Net cash flow per period
        net_cashflow: dict[str, float] = {}
        for period in periods:
            net_cashflow[period] = round(
                operating.get(period, 0.0)
                + investing.get(period, 0.0)
                + financing.get(period, 0.0)
                + transfers.get(period, 0.0),
                2,
            )

        # Opening/closing balances per period
        # We compute cumulative asset balances at the start/end of each period
        all_txns = sorted(
            [e for e in self.entries if isinstance(e, data.Transaction)],
            key=lambda t: t.date,
        )
        balances = _compute_period_asset_balances(all_txns, periods, interval)

        # Breakdown: group items by counterpart account within each category
        def build_breakdown(cat: str) -> list[dict]:
            """Group items by counterpart, return totals per period."""
            by_counterpart: dict[str, dict[str, Decimal]] = {}
            for item in items:
                if item["category"] != cat:
                    continue
                cp = item["counterpart"]
                if cp not in by_counterpart:
                    by_counterpart[cp] = {}
                p = item["period"]
                by_counterpart[cp][p] = (
                    by_counterpart[cp].get(p, Decimal(0)) + item["amount"]
                )
            result = []
            for cp in sorted(by_counterpart):
                totals_map = {
                    p: round(float(v), 2)
                    for p, v in by_counterpart[cp].items()
                    if v != 0
                }
                if totals_map:
                    short = cp.split(":")[-1] if ":" in cp else cp
                    result.append({
                        "name": short,
                        "full_name": cp,
                        "totals": totals_map,
                        "total": round(sum(totals_map.values()), 2),
                    })
            return result

        return {
            "periods": periods,
            "operating": {
                "totals": operating,
                "total": round(sum(operating.values()), 2),
                "items": build_breakdown("operating"),
            },
            "investing": {
                "totals": investing,
                "total": round(sum(investing.values()), 2),
                "items": build_breakdown("investing"),
            },
            "financing": {
                "totals": financing,
                "total": round(sum(financing.values()), 2),
                "items": build_breakdown("financing"),
            },
            "transfers": {
                "totals": transfers,
                "total": round(sum(transfers.values()), 2),
                "items": build_breakdown("transfer"),
            },
            "net_cashflow": net_cashflow,
            "opening_balance": balances["opening"],
            "closing_balance": balances["closing"],
        }

    def get_options(self) -> dict:
        # Look for custom "ledgr-locale" directive in entries
        locale = None
        for e in self.entries:
            if isinstance(e, data.Custom) and e.type == "ledgr-locale":
                if e.values and len(e.values) > 0:
                    locale = str(e.values[0].value)
                    break

        return {
            "operating_currency": self.options.get("operating_currency", []),
            "title": self.options.get("title", ""),
            "filename": self.options.get("filename", ""),
            "locale": locale,
        }


# ======================================================================
# Helpers
# ======================================================================

_ACCOUNT_TYPE_ORDER = {
    "Assets": 0,
    "Liabilities": 1,
    "Income": 2,
    "Expenses": 3,
    "Equity": 4,
}


def _inventory_to_list(inv: inventory.Inventory) -> list[dict]:
    result: list[dict] = []
    for pos in inv:
        entry: dict[str, Any] = {
            "number": str(pos.units.number),
            "currency": pos.units.currency,
        }
        if pos.cost is not None:
            entry["cost"] = str(pos.cost.number) if pos.cost.number else None
            entry["cost_currency"] = pos.cost.currency
            entry["cost_date"] = pos.cost.date.isoformat() if pos.cost.date else None
        result.append(entry)
    return result


def _parse_date(s: str) -> datetime.date:
    return datetime.date.fromisoformat(s)


def _date_to_period(d: datetime.date, interval: str) -> str:
    if interval == "quarterly":
        q = (d.month - 1) // 3 + 1
        return f"{d.year}-Q{q}"
    elif interval == "yearly":
        return str(d.year)
    else:  # monthly
        return f"{d.year}-{d.month:02d}"


def _build_report_tree(
    accounts: set[str],
    account_period: dict[str, dict[str, Decimal]],
    periods: list[str],
    negate: bool = False,
) -> list[dict]:
    """Build a hierarchical tree for income statement accounts."""
    sign = -1 if negate else 1

    # Build parent→children map
    children_map: dict[str, set[str]] = {}
    for acct in accounts:
        parts = acct.split(":")
        for i in range(1, len(parts)):
            parent = ":".join(parts[:i])
            child = ":".join(parts[:i + 1])
            if parent not in children_map:
                children_map[parent] = set()
            children_map[parent].add(child)

    def build_node(name: str) -> dict:
        kids = sorted(children_map.get(name, set()))
        child_nodes = [build_node(k) for k in kids]

        totals: dict[str, float] = {}
        for period in periods:
            # Own value for this period (leaf-level data, negated if needed)
            own_val = float(account_period.get(name, {}).get(period, Decimal(0))) * sign
            # Add children's totals
            children_val = sum(cn["totals"].get(period, 0.0) for cn in child_nodes)
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
    roots = set()
    for acct in accounts:
        roots.add(acct.split(":")[0])

    result = []
    for root in sorted(roots):
        if root in children_map or root in account_period:
            node = build_node(root)
            result = node["children"]
    return result


def _build_balance_tree(
    accounts: set[str],
    account_balance: dict[str, Decimal],
    negate: bool = False,
) -> list[dict]:
    """Build a hierarchical tree for balance sheet accounts."""
    children_map: dict[str, set[str]] = {}
    for acct in accounts:
        parts = acct.split(":")
        for i in range(1, len(parts)):
            parent = ":".join(parts[:i])
            child = ":".join(parts[:i + 1])
            if parent not in children_map:
                children_map[parent] = set()
            children_map[parent].add(child)

    def build_node(name: str) -> dict:
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

    # Find roots and return their children
    roots = set()
    for acct in accounts:
        root = acct.split(":")[0]
        roots.add(root)

    result = []
    for root in sorted(roots):
        if root in children_map or root in account_balance:
            node = build_node(root)
            result = node["children"]
    return result


def _classify_cashflow(
    asset_account: str,
    counterparts: list[str],
    all_accounts_in_txn: list[str] | None = None,
) -> str:
    """
    Classify a cash flow item into operating/investing/financing/transfer.

    Personal finance heuristic:
    - Counterpart is Liabilities:Loans:* → financing
    - Counterpart is Assets:Investments:* or Assets:Broker:* → investing
    - Counterpart is Income:*, Expenses:*, or Liabilities:CreditCard:* → operating
    - Asset-to-Asset where one side is Investments/Broker → investing
    - Counterpart is another Asset (bank-to-bank) → transfer
    - Counterpart is Equity:* → transfer (opening balances)
    """
    # Check non-asset counterparts first
    for cp in counterparts:
        if cp.startswith("Liabilities:Loans"):
            return "financing"
    for cp in counterparts:
        if cp.startswith("Income:") or cp.startswith("Expenses:") or cp.startswith("Liabilities:"):
            return "operating"

    # Asset-to-Asset: check if one side is an investment account
    if all_accounts_in_txn:
        is_self_investment = (
            asset_account.startswith("Assets:Investments")
            or asset_account.startswith("Assets:Broker")
        )
        has_investment_counterpart = any(
            (a.startswith("Assets:Investments") or a.startswith("Assets:Broker"))
            and a != asset_account
            for a in all_accounts_in_txn
        )
        if is_self_investment or has_investment_counterpart:
            return "investing"

    return "transfer"


def _compute_period_asset_balances(
    all_txns: list,
    periods: list[str],
    interval: str,
) -> dict:
    """Compute opening and closing asset balances for each period."""
    # Build a mapping of period → cumulative asset balance at period end
    cumulative = Decimal(0)
    period_end_balance: dict[str, float] = {}

    for txn in all_txns:
        for p in txn.postings:
            if p.account.startswith("Assets:") and p.units is not None:
                cumulative += p.units.number
        period = _date_to_period(txn.date, interval)
        period_end_balance[period] = round(float(cumulative), 2)

    # For each requested period, opening = previous period's closing
    all_periods_sorted = sorted(period_end_balance.keys())
    opening: dict[str, float] = {}
    closing: dict[str, float] = {}

    for period in periods:
        closing[period] = period_end_balance.get(period, 0.0)
        # Find the period immediately before this one
        idx = all_periods_sorted.index(period) if period in all_periods_sorted else -1
        if idx > 0:
            opening[period] = period_end_balance[all_periods_sorted[idx - 1]]
        else:
            opening[period] = 0.0

    return {"opening": opening, "closing": closing}


def _txn_to_dict(txn: data.Transaction) -> dict:
    postings = []
    for p in txn.postings:
        posting_dict: dict[str, Any] = {
            "account": p.account,
            "amount": str(p.units.number) if p.units else None,
            "currency": p.units.currency if p.units else None,
        }
        if p.cost is not None:
            posting_dict["cost"] = str(p.cost.number) if p.cost.number else None
            posting_dict["cost_currency"] = p.cost.currency
            posting_dict["cost_date"] = (
                p.cost.date.isoformat() if p.cost.date else None
            )
        if p.price is not None:
            posting_dict["price"] = str(p.price.number)
            posting_dict["price_currency"] = p.price.currency
        postings.append(posting_dict)

    return {
        "date": txn.date.isoformat(),
        "flag": txn.flag,
        "payee": txn.payee or "",
        "narration": txn.narration or "",
        "tags": list(txn.tags) if txn.tags else [],
        "links": list(txn.links) if txn.links else [],
        "lineno": txn.meta.get("lineno") if txn.meta else None,
        "postings": postings,
    }
