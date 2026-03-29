"""
Tests for ``serializers.py`` — every function, with real Beancount types.

See AGENTS.md §6: "Serializers are 100% covered in ``test_serializers.py``."
"""

from __future__ import annotations

import datetime
from decimal import Decimal

import pytest
from beancount.core import amount as amt_mod, data, inventory, realization
from fava.core import FavaLedger

from serializers import (
    ACCOUNT_TYPE_ORDER,
    build_balance_tree,
    build_report_tree,
    decimal_to_report_number,
    serialize_account_node,
    serialize_error,
    serialize_inventory,
    serialize_posting,
    serialize_transaction,
)


# ------------------------------------------------------------------
# serialize_inventory
# ------------------------------------------------------------------


class TestSerializeInventory:
    def test_empty_inventory(self) -> None:
        inv = inventory.Inventory()
        assert serialize_inventory(inv) == []

    def test_single_position(self) -> None:
        inv = inventory.Inventory()
        inv.add_amount(amt_mod.Amount(Decimal("1234.56"), "BRL"))
        result = serialize_inventory(inv)
        assert len(result) == 1
        assert result[0]["number"] == "1234.56"
        assert result[0]["currency"] == "BRL"
        assert "cost" not in result[0]

    def test_multiple_currencies(self) -> None:
        inv = inventory.Inventory()
        inv.add_amount(amt_mod.Amount(Decimal("100"), "BRL"))
        inv.add_amount(amt_mod.Amount(Decimal("50"), "USD"))
        result = serialize_inventory(inv)
        assert len(result) == 2
        currencies = {r["currency"] for r in result}
        assert currencies == {"BRL", "USD"}

    def test_with_cost(self) -> None:
        inv = inventory.Inventory()
        cost = inventory.Cost(Decimal("10.50"), "USD", datetime.date(2024, 1, 15), None)
        inv.add_position(inventory.Position(amt_mod.Amount(Decimal("5"), "PETR4"), cost))
        result = serialize_inventory(inv)
        assert len(result) == 1
        assert result[0]["number"] == "5"
        assert result[0]["currency"] == "PETR4"
        assert result[0]["cost"] == "10.50"
        assert result[0]["cost_currency"] == "USD"
        assert result[0]["cost_date"] == "2024-01-15"

    def test_monetary_values_are_strings(self) -> None:
        """Decimal values MUST be serialized as strings, never floats."""
        inv = inventory.Inventory()
        inv.add_amount(amt_mod.Amount(Decimal("99.99"), "BRL"))
        result = serialize_inventory(inv)
        assert isinstance(result[0]["number"], str)


# ------------------------------------------------------------------
# serialize_posting
# ------------------------------------------------------------------


class TestSerializePosting:
    def test_simple_posting(self) -> None:
        posting = data.Posting(
            "Assets:Checking",
            amt_mod.Amount(Decimal("500.00"), "BRL"),
            None,
            None,
            None,
            None,
        )
        result = serialize_posting(posting)
        assert result["account"] == "Assets:Checking"
        assert result["amount"] == "500.00"
        assert result["currency"] == "BRL"
        assert "cost" not in result
        assert "price" not in result

    def test_posting_without_amount(self) -> None:
        posting = data.Posting(
            "Expenses:Food", None, None, None, None, None
        )
        result = serialize_posting(posting)
        assert result["amount"] is None
        assert result["currency"] is None

    def test_posting_with_cost(self) -> None:
        # CostSpec uses number_per (not number) in Beancount v3
        cost = data.CostSpec(
            number_per=Decimal("10.00"),
            number_total=None,
            currency="USD",
            date=None,
            label=None,
            merge=False,
        )
        posting = data.Posting(
            "Assets:Stocks",
            amt_mod.Amount(Decimal("100"), "PETR4"),
            cost,
            None,
            None,
            None,
        )
        result = serialize_posting(posting)
        assert result["cost"] == "10.00"
        assert result["cost_currency"] == "USD"

    def test_posting_with_price(self) -> None:
        posting = data.Posting(
            "Assets:Checking",
            amt_mod.Amount(Decimal("100"), "USD"),
            None,
            amt_mod.Amount(Decimal("5.50"), "BRL"),
            None,
            None,
        )
        result = serialize_posting(posting)
        assert result["price"] == "5.50"
        assert result["price_currency"] == "BRL"

    def test_amounts_are_strings(self) -> None:
        posting = data.Posting(
            "Assets:Checking",
            amt_mod.Amount(Decimal("123.45"), "BRL"),
            None,
            None,
            None,
            None,
        )
        result = serialize_posting(posting)
        assert isinstance(result["amount"], str)


# ------------------------------------------------------------------
# serialize_transaction
# ------------------------------------------------------------------


class TestSerializeTransaction:
    @staticmethod
    def _make_txn(**kwargs) -> data.Transaction:
        defaults = {
            "meta": {"lineno": 42, "filename": "test.beancount"},
            "date": datetime.date(2024, 3, 15),
            "flag": "*",
            "payee": "Test Payee",
            "narration": "Test Narration",
            "tags": frozenset({"tag1"}),
            "links": frozenset({"link1"}),
            "postings": [
                data.Posting(
                    "Assets:Checking",
                    amt_mod.Amount(Decimal("100"), "BRL"),
                    None,
                    None,
                    None,
                    None,
                ),
                data.Posting("Expenses:Food", None, None, None, None, None),
            ],
        }
        defaults.update(kwargs)
        return data.Transaction(**defaults)

    def test_basic_fields(self) -> None:
        txn = self._make_txn()
        result = serialize_transaction(txn)
        assert result["date"] == "2024-03-15"
        assert result["flag"] == "*"
        assert result["payee"] == "Test Payee"
        assert result["narration"] == "Test Narration"
        assert result["lineno"] == 42

    def test_tags_and_links(self) -> None:
        txn = self._make_txn()
        result = serialize_transaction(txn)
        assert "tag1" in result["tags"]
        assert "link1" in result["links"]

    def test_empty_payee(self) -> None:
        txn = self._make_txn(payee="")
        result = serialize_transaction(txn)
        assert result["payee"] == ""

    def test_none_payee(self) -> None:
        txn = self._make_txn(payee=None)
        result = serialize_transaction(txn)
        assert result["payee"] == ""

    def test_postings_are_serialized(self) -> None:
        txn = self._make_txn()
        result = serialize_transaction(txn)
        assert len(result["postings"]) == 2
        assert result["postings"][0]["account"] == "Assets:Checking"
        assert result["postings"][0]["amount"] == "100"

    def test_no_meta_lineno(self) -> None:
        txn = self._make_txn(meta={})
        result = serialize_transaction(txn)
        assert result["lineno"] is None

    def test_metadata_with_ledgr_series(self) -> None:
        meta = {
            "lineno": 10,
            "filename": "test.beancount",
            "ledgr-series": "tv-abc123",
            "ledgr-series-type": "installment",
            "ledgr-series-seq": 1,
            "ledgr-series-total": 12,
        }
        txn = self._make_txn(meta=meta)
        result = serialize_transaction(txn)
        assert result["metadata"]["ledgr-series"] == "tv-abc123"
        assert result["metadata"]["ledgr-series-type"] == "installment"
        assert result["metadata"]["ledgr-series-seq"] == 1
        assert result["metadata"]["ledgr-series-total"] == 12

    def test_metadata_without_ledgr_keys(self) -> None:
        meta = {"lineno": 10, "filename": "test.beancount"}
        txn = self._make_txn(meta=meta)
        result = serialize_transaction(txn)
        assert result["metadata"] == {}

    def test_metadata_excludes_non_ledgr_keys(self) -> None:
        meta = {
            "lineno": 10,
            "filename": "test.beancount",
            "ledgr-series": "abc",
            "some-other-key": "value",
        }
        txn = self._make_txn(meta=meta)
        result = serialize_transaction(txn)
        assert "ledgr-series" in result["metadata"]
        assert "some-other-key" not in result["metadata"]
        assert "lineno" not in result["metadata"]
        assert "filename" not in result["metadata"]


# ------------------------------------------------------------------
# serialize_account_node (integration — uses real FavaLedger)
# ------------------------------------------------------------------


class TestSerializeAccountNode:
    def test_with_real_ledger(self, ledger: FavaLedger) -> None:
        real_root = realization.realize(ledger.all_entries)
        # The root should have top-level account type children
        children_names = [c.account for c in real_root.values()]
        assert "Assets" in children_names

        assets_node = realization.get(real_root, "Assets")
        result = serialize_account_node(assets_node)
        assert result["name"] == "Assets"
        assert result["type"] == "Assets"
        assert isinstance(result["balance"], list)
        assert isinstance(result["children"], list)
        assert result["is_leaf"] is False

    def test_leaf_node(self, ledger: FavaLedger) -> None:
        real_root = realization.realize(ledger.all_entries)
        checking = realization.get(real_root, "Assets:Checking")
        result = serialize_account_node(checking)
        assert result["is_leaf"] is True
        assert result["name"] == "Assets:Checking"
        # Should have a BRL balance
        assert any(b["currency"] == "BRL" for b in result["balance"])

    def test_balance_numbers_are_strings(self, ledger: FavaLedger) -> None:
        real_root = realization.realize(ledger.all_entries)
        checking = realization.get(real_root, "Assets:Checking")
        result = serialize_account_node(checking)
        for b in result["balance"]:
            assert isinstance(b["number"], str)


# ------------------------------------------------------------------
# serialize_error
# ------------------------------------------------------------------


class TestSerializeError:
    def test_string_error(self) -> None:
        result = serialize_error("Something went wrong")
        assert result["message"] == "Something went wrong"

    def test_error_with_source(self) -> None:
        class FakeError:
            def __init__(self):
                self.source = "test.beancount:42"

            def __str__(self):
                return "Bad syntax"

        result = serialize_error(FakeError())
        assert result["message"] == "Bad syntax"
        assert result["source"] == "test.beancount:42"


# ------------------------------------------------------------------
# decimal_to_report_number
# ------------------------------------------------------------------


class TestDecimalToReportNumber:
    def test_rounds_to_two_decimals(self) -> None:
        assert decimal_to_report_number(Decimal("1234.5678")) == 1234.57

    def test_returns_float(self) -> None:
        result = decimal_to_report_number(Decimal("100"))
        assert isinstance(result, float)

    def test_zero(self) -> None:
        assert decimal_to_report_number(Decimal("0")) == 0.0

    def test_negative(self) -> None:
        assert decimal_to_report_number(Decimal("-99.999")) == -100.0


# ------------------------------------------------------------------
# build_report_tree
# ------------------------------------------------------------------


class TestBuildReportTree:
    def test_simple_tree(self) -> None:
        accounts = {"Income:Salary", "Income:Freelance"}
        account_period = {
            "Income:Salary": {"2024-01": Decimal("-8000")},
            "Income:Freelance": {"2024-01": Decimal("-2000")},
        }
        periods = ["2024-01"]
        result = build_report_tree(accounts, account_period, periods, negate=True)
        # Should have two children under Income
        assert len(result) == 2
        names = {r["name"] for r in result}
        assert "Income:Salary" in names
        assert "Income:Freelance" in names

    def test_negate_flips_sign(self) -> None:
        accounts = {"Income:Salary"}
        account_period = {"Income:Salary": {"2024-01": Decimal("-5000")}}
        periods = ["2024-01"]

        negated = build_report_tree(accounts, account_period, periods, negate=True)
        normal = build_report_tree(accounts, account_period, periods, negate=False)

        assert negated[0]["totals"]["2024-01"] == 5000.0
        assert normal[0]["totals"]["2024-01"] == -5000.0


# ------------------------------------------------------------------
# build_balance_tree
# ------------------------------------------------------------------


class TestBuildBalanceTree:
    def test_simple_tree(self) -> None:
        accounts = {"Assets:Checking", "Assets:Savings"}
        balances = {
            "Assets:Checking": Decimal("5000"),
            "Assets:Savings": Decimal("3000"),
        }
        result = build_balance_tree(accounts, balances)
        assert len(result) == 2
        checking = next(r for r in result if r["name"] == "Assets:Checking")
        assert checking["balance"] == 5000.0

    def test_negate(self) -> None:
        accounts = {"Liabilities:CreditCard"}
        balances = {"Liabilities:CreditCard": Decimal("-500")}
        result = build_balance_tree(accounts, balances, negate=True)
        assert result[0]["balance"] == 500.0


# ------------------------------------------------------------------
# ACCOUNT_TYPE_ORDER
# ------------------------------------------------------------------


class TestAccountTypeOrder:
    def test_all_types_present(self) -> None:
        assert set(ACCOUNT_TYPE_ORDER.keys()) == {
            "Assets",
            "Liabilities",
            "Income",
            "Expenses",
            "Equity",
        }

    def test_assets_first(self) -> None:
        assert ACCOUNT_TYPE_ORDER["Assets"] == 0
