"""
Tests for the accounting reports — Income Statement, Balance Sheet, and series.

Now calls ``ledgr.reports`` functions directly instead of duplicating router logic.

The key invariant (AGENTS.md §10): after ``cap_opt()``, the accounting
equation holds: ``Assets + Liabilities + Equity == 0`` (in Beancount's
sign convention where credit accounts are negative).
"""

from __future__ import annotations

import pytest
from fava.core import FavaLedger

from ledgr.reports import (
    account_balance_series,
    balance_sheet,
    income_expense_series,
    income_statement,
    net_worth_series,
)


# ------------------------------------------------------------------
# Balance Sheet — accounting invariant
# ------------------------------------------------------------------


class TestBalanceSheet:
    def test_accounting_equation(self, ledger: FavaLedger) -> None:
        """The fundamental accounting invariant: A + L + E = 0.

        After ``cap_opt()`` closes Income/Expenses into Equity, the three
        permanent account types must sum to zero.
        """
        result = balance_sheet(ledger)
        t = result["totals"]
        total = t["assets"] + t["liabilities"] + t["equity"]
        assert total == pytest.approx(0.0, abs=0.01), (
            f"Accounting equation violated: "
            f"A={t['assets']} + L={t['liabilities']} + E={t['equity']} = {total}"
        )

    def test_accounting_equation_cashflow_fixture(
        self, cashflow_ledger: FavaLedger
    ) -> None:
        """Invariant holds on a richer fixture too."""
        result = balance_sheet(cashflow_ledger)
        t = result["totals"]
        total = t["assets"] + t["liabilities"] + t["equity"]
        assert total == pytest.approx(0.0, abs=0.01)

    def test_has_expected_sections(self, ledger: FavaLedger) -> None:
        result = balance_sheet(ledger)
        assert "assets" in result
        assert "liabilities" in result
        assert "equity" in result
        assert "totals" in result

    def test_assets_tree_has_children(self, ledger: FavaLedger) -> None:
        result = balance_sheet(ledger)
        assert len(result["assets"]) > 0

    def test_as_of_date_filters(self, ledger: FavaLedger) -> None:
        full = balance_sheet(ledger)
        partial = balance_sheet(ledger, as_of_date="2024-01-31")
        assert partial["totals"]["assets"] != full["totals"]["assets"]

    def test_balance_sheet_node_shape(self, ledger: FavaLedger) -> None:
        result = balance_sheet(ledger)
        for node in result["assets"]:
            assert "name" in node
            assert "balance" in node
            assert "children" in node


# ------------------------------------------------------------------
# Income Statement
# ------------------------------------------------------------------


class TestIncomeStatement:
    def test_has_expected_sections(self, ledger: FavaLedger) -> None:
        result = income_statement(ledger)
        assert "income" in result
        assert "expenses" in result
        assert "periods" in result
        assert "net_income" in result

    def test_has_periods(self, ledger: FavaLedger) -> None:
        result = income_statement(ledger)
        assert len(result["periods"]) > 0

    def test_date_filtering(self, ledger: FavaLedger) -> None:
        result = income_statement(
            ledger, from_date="2024-01-01", to_date="2024-01-31"
        )
        assert all(p.startswith("2024-01") for p in result["periods"])

    def test_net_income_is_number(self, ledger: FavaLedger) -> None:
        result = income_statement(ledger)
        for period in result["periods"]:
            assert isinstance(result["net_income"][period], (int, float))

    def test_income_statement_node_shape(self, ledger: FavaLedger) -> None:
        result = income_statement(ledger)
        for node in result["income"]:
            assert "name" in node
            assert "totals" in node
            assert "total" in node
            assert "children" in node


# ------------------------------------------------------------------
# Multi-currency separation
# ------------------------------------------------------------------


class TestMultiCurrencyBalanceSheet:
    def test_oc_equation_holds(self, multicurrency_ledger: FavaLedger) -> None:
        """A + L + E = 0 for operating currency only."""
        result = balance_sheet(multicurrency_ledger)
        t = result["totals"]
        total = t["assets"] + t["liabilities"] + t["equity"]
        assert total == pytest.approx(0.0, abs=0.01), (
            f"OC equation violated: A={t['assets']} L={t['liabilities']} E={t['equity']} = {total}"
        )

    def test_has_operating_currency(self, multicurrency_ledger: FavaLedger) -> None:
        result = balance_sheet(multicurrency_ledger)
        assert result["operating_currency"] == "USD"

    def test_other_totals_present(self, multicurrency_ledger: FavaLedger) -> None:
        result = balance_sheet(multicurrency_ledger)
        assert "other_totals" in result
        # The fixture has ITOT in Assets:Brokerage
        asset_others = result["other_totals"]["assets"]
        currencies = [item["currency"] for item in asset_others]
        assert "ITOT" in currencies

    def test_oc_totals_exclude_non_oc(self, multicurrency_ledger: FavaLedger) -> None:
        """OC totals must not include ITOT or VACHR amounts."""
        result = balance_sheet(multicurrency_ledger)
        # Assets total should only contain USD balances
        # Checking: 10000 + 5000 - 200 - 3500 + 5000 = 16300 USD
        # (100 ITOT in Brokerage excluded from OC total)
        assert result["totals"]["assets"] == pytest.approx(16300.0, abs=0.01)


class TestMultiCurrencyIncomeStatement:
    def test_has_operating_currency(self, multicurrency_ledger: FavaLedger) -> None:
        result = income_statement(multicurrency_ledger)
        assert result["operating_currency"] == "USD"

    def test_net_income_excludes_non_oc(self, multicurrency_ledger: FavaLedger) -> None:
        """Net income should only include USD amounts."""
        result = income_statement(multicurrency_ledger)
        total_net = sum(result["net_income"].values())
        # USD income: 5000 + 5000 = 10000, USD expenses: 200 + 150 = 350
        # Net = 10000 - 350 = 9650
        assert total_net == pytest.approx(9650.0, abs=0.01)

    def test_other_net_income_present(self, multicurrency_ledger: FavaLedger) -> None:
        result = income_statement(multicurrency_ledger)
        assert "other_net_income" in result
        currencies = [item["currency"] for item in result["other_net_income"]]
        assert "VACHR" in currencies

    def test_tree_nodes_have_other_fields(self, multicurrency_ledger: FavaLedger) -> None:
        result = income_statement(multicurrency_ledger)
        # Walk income tree to find nodes with other_total
        def has_other(nodes: list[dict]) -> bool:
            for n in nodes:
                if n.get("other_total"):
                    return True
                if has_other(n.get("children", [])):
                    return True
            return False
        assert has_other(result["income"]), "Income tree should have other_total for VACHR"


# ------------------------------------------------------------------
# Series
# ------------------------------------------------------------------


class TestSeries:
    def test_income_expense_series(self, ledger: FavaLedger) -> None:
        result = income_expense_series(ledger)
        assert len(result["series"]) > 0
        point = result["series"][0]
        assert isinstance(point["income"], (int, float))
        assert isinstance(point["expenses"], (int, float))

    def test_account_balance_series(self, ledger: FavaLedger) -> None:
        result = account_balance_series(ledger, "Assets:Checking")
        assert len(result["series"]) > 0

    def test_net_worth_series(self, ledger: FavaLedger) -> None:
        result = net_worth_series(ledger)
        assert len(result["series"]) > 0


# ------------------------------------------------------------------
# Cashflow (via ledgr.cashflow module)
# ------------------------------------------------------------------


class TestCashflowViaModule:
    def test_cashflow_statement(self, cashflow_ledger: FavaLedger) -> None:
        from ledgr.cashflow import compute_cashflow
        result = compute_cashflow(cashflow_ledger.all_entries)
        assert "periods" in result
        assert "operating" in result
        assert "investing" in result
        assert "financing" in result
        assert "transfers" in result
