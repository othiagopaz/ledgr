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
    cost_map: dict[str, Decimal] = {}
    for pos in inv:
        currency = pos.units.currency
        number = pos.units.number
        if pos.cost is not None:
            cost_map.setdefault(currency, Decimal(0))
            cost_map[currency] += number
        else:
            result.append({"number": str(number), "currency": currency})
    for currency, number in sorted(cost_map.items()):
        result.append({"number": str(number), "currency": currency})
    return result


def _parse_date(s: str) -> datetime.date:
    return datetime.date.fromisoformat(s)


def _txn_to_dict(txn: data.Transaction) -> dict:
    return {
        "date": txn.date.isoformat(),
        "flag": txn.flag,
        "payee": txn.payee or "",
        "narration": txn.narration or "",
        "tags": list(txn.tags) if txn.tags else [],
        "links": list(txn.links) if txn.links else [],
        "postings": [
            {
                "account": p.account,
                "amount": str(p.units.number) if p.units else None,
                "currency": p.units.currency if p.units else None,
            }
            for p in txn.postings
        ],
    }
