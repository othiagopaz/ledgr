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

    def add_transaction(
        self,
        date: str,
        flag: str,
        payee: str | None,
        narration: str,
        postings: list[dict],
    ) -> dict:
        txn_date = _parse_date(date)

        bc_postings = []
        for p in postings:
            if p.get("amount") is not None and p.get("currency"):
                units = amt_mod.Amount(Decimal(str(p["amount"])), p["currency"])
            else:
                units = None
            bc_postings.append(
                data.Posting(p["account"], units, None, None, None, None)
            )

        meta = data.new_metadata(self.filepath, 0)
        txn = data.Transaction(
            meta,
            txn_date,
            flag or "*",
            payee or "",
            narration or "",
            frozenset(),
            frozenset(),
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

        meta = data.new_metadata(self.filepath, lineno)
        txn = data.Transaction(
            meta,
            txn_date,
            flag or "*",
            payee or "",
            narration or "",
            frozenset(),
            frozenset(),
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

    def get_options(self) -> dict:
        return {
            "operating_currency": self.options.get("operating_currency", []),
            "title": self.options.get("title", ""),
            "filename": self.options.get("filename", ""),
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
