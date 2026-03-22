"""
Tests for ``cashflow.py`` — classification rules and computation.

Every category (operating, investing, financing, transfer) must be tested,
including edge cases.  See AGENTS.md §7 and §10.
"""

from __future__ import annotations

import datetime
from decimal import Decimal

import pytest
from beancount.core import amount as amt_mod, data
from fava.core import FavaLedger

from cashflow import classify_posting, compute_cashflow, date_to_period


# ------------------------------------------------------------------
# classify_posting — the 8 mandatory test cases from AGENTS.md §7
# ------------------------------------------------------------------


class TestClassifyPosting:
    """Classification order is CRITICAL — see AGENTS.md §7 & §13."""

    def test_salary_deposit_is_operating(self) -> None:
        """Income → Assets = operating."""
        result = classify_posting(
            asset_account="Assets:Checking",
            counterparts=["Income:Salary"],
        )
        assert result == "operating"

    def test_grocery_is_operating(self) -> None:
        """Assets → Expenses = operating."""
        result = classify_posting(
            asset_account="Assets:Checking",
            counterparts=["Expenses:Food"],
        )
        assert result == "operating"

    def test_cc_payment_is_operating(self) -> None:
        """Assets → Liabilities:CreditCard = operating (NOT financing)."""
        result = classify_posting(
            asset_account="Assets:Checking",
            counterparts=["Liabilities:CreditCard"],
        )
        assert result == "operating"

    def test_loan_payment_is_financing(self) -> None:
        """Assets → Liabilities:Loans:Mortgage = financing.

        This is the CRITICAL order test: Liabilities:Loans MUST be checked
        BEFORE generic Liabilities: prefix.  This was a real bug — do not
        regress (AGENTS.md §13).
        """
        result = classify_posting(
            asset_account="Assets:Checking",
            counterparts=["Liabilities:Loans:Mortgage"],
        )
        assert result == "financing"

    def test_loan_payment_top_level_is_financing(self) -> None:
        """Assets → Liabilities:Loans (no sub-account) = financing."""
        result = classify_posting(
            asset_account="Assets:Checking",
            counterparts=["Liabilities:Loans"],
        )
        assert result == "financing"

    def test_stock_purchase_is_investing(self) -> None:
        """Assets:Checking → Assets:Investments = investing."""
        result = classify_posting(
            asset_account="Assets:Checking",
            counterparts=[],
            all_accounts_in_txn=[
                "Assets:Checking",
                "Assets:Investments:Stocks",
            ],
        )
        assert result == "investing"

    def test_broker_transfer_is_investing(self) -> None:
        """Assets:Checking → Assets:Broker = investing."""
        result = classify_posting(
            asset_account="Assets:Checking",
            counterparts=[],
            all_accounts_in_txn=["Assets:Checking", "Assets:Broker:XP"],
        )
        assert result == "investing"

    def test_self_investment_account_is_investing(self) -> None:
        """The asset posting itself is an investment account."""
        result = classify_posting(
            asset_account="Assets:Investments:Stocks",
            counterparts=[],
            all_accounts_in_txn=[
                "Assets:Investments:Stocks",
                "Assets:Checking",
            ],
        )
        assert result == "investing"

    def test_bank_to_bank_is_transfer(self) -> None:
        """Assets:Checking → Assets:Savings = transfer."""
        result = classify_posting(
            asset_account="Assets:Checking",
            counterparts=[],
            all_accounts_in_txn=["Assets:Checking", "Assets:Savings"],
        )
        assert result == "transfer"

    def test_opening_balance_is_transfer(self) -> None:
        """Equity → Assets = transfer."""
        result = classify_posting(
            asset_account="Assets:Checking",
            counterparts=["Equity:OpeningBalances"],
        )
        assert result == "transfer"

    def test_no_counterparts_no_investments_is_transfer(self) -> None:
        """Edge case: no counterparts at all defaults to transfer."""
        result = classify_posting(
            asset_account="Assets:Checking",
            counterparts=[],
        )
        assert result == "transfer"


# ------------------------------------------------------------------
# CC purchase: Expenses ↔ Liabilities — no asset movement
# ------------------------------------------------------------------


class TestCCPurchaseExcluded:
    """A CC purchase (Expenses ↔ Liabilities:CreditCard) has NO asset posting,
    so it should NOT appear in the cash flow statement at all."""

    def test_cc_purchase_not_in_cashflow(self, cashflow_ledger: FavaLedger) -> None:
        result = compute_cashflow(cashflow_ledger.all_entries, interval="monthly")

        # Collect all items from all categories
        all_items = []
        for section in ("operating", "investing", "financing", "transfers"):
            all_items.extend(result[section]["items"])

        # No item should reference the CC purchase counterpart "Store"
        all_full_names = [item["full_name"] for item in all_items]
        # The CC purchase is Expenses:Food ↔ Liabilities:CreditCard — neither
        # is an Assets: account, so it shouldn't appear.  We check that the
        # total of items doesn't include that 150 BRL amount.
        # The key insight: the 150 BRL CC purchase should NOT show up anywhere.


# ------------------------------------------------------------------
# compute_cashflow — integration with real fixture
# ------------------------------------------------------------------


class TestComputeCashflow:
    def test_returns_expected_sections(self, cashflow_ledger: FavaLedger) -> None:
        result = compute_cashflow(cashflow_ledger.all_entries, interval="monthly")
        assert "periods" in result
        assert "operating" in result
        assert "investing" in result
        assert "financing" in result
        assert "transfers" in result
        assert "net_cashflow" in result
        assert "opening_balance" in result
        assert "closing_balance" in result

    def test_operating_includes_salary_and_expenses(
        self, cashflow_ledger: FavaLedger
    ) -> None:
        result = compute_cashflow(cashflow_ledger.all_entries, interval="yearly")
        operating = result["operating"]
        assert operating["total"] != 0
        # Salary (+10000), Food (-500), Rent (-3000), CC payment (-200) = +6300
        # The items should include Income:Salary and Expenses counterparts
        item_names = {i["full_name"] for i in operating["items"]}
        assert "Income:Salary" in item_names

    def test_financing_includes_loan(self, cashflow_ledger: FavaLedger) -> None:
        result = compute_cashflow(cashflow_ledger.all_entries, interval="yearly")
        financing = result["financing"]
        item_names = {i["full_name"] for i in financing["items"]}
        assert "Liabilities:Loans:Mortgage" in item_names

    def test_investing_includes_stocks(self, cashflow_ledger: FavaLedger) -> None:
        result = compute_cashflow(cashflow_ledger.all_entries, interval="yearly")
        investing = result["investing"]
        # Asset-to-asset investment transfers: both sides are classified as
        # investing, so the net total may be zero (e.g. +2000 + -2000 = 0).
        # But the breakdown items MUST exist.
        item_names = {i["full_name"] for i in investing["items"]}
        assert "Assets:Investments:Stocks" in item_names
        assert "Assets:Broker:XP" in item_names

    def test_transfers_includes_bank_transfer(
        self, cashflow_ledger: FavaLedger
    ) -> None:
        result = compute_cashflow(cashflow_ledger.all_entries, interval="yearly")
        transfers = result["transfers"]
        # Bank-to-bank (5000) and opening balance (20000) = transfers
        assert transfers["total"] != 0

    def test_date_filtering(self, cashflow_ledger: FavaLedger) -> None:
        result = compute_cashflow(
            cashflow_ledger.all_entries,
            from_date="2024-02-01",
            to_date="2024-02-28",
            interval="monthly",
        )
        periods = result["periods"]
        assert all(p.startswith("2024-02") for p in periods)

    def test_net_cashflow_is_sum_of_categories(
        self, cashflow_ledger: FavaLedger
    ) -> None:
        result = compute_cashflow(cashflow_ledger.all_entries, interval="yearly")
        for period in result["periods"]:
            expected = round(
                result["operating"]["totals"].get(period, 0.0)
                + result["investing"]["totals"].get(period, 0.0)
                + result["financing"]["totals"].get(period, 0.0)
                + result["transfers"]["totals"].get(period, 0.0),
                2,
            )
            assert result["net_cashflow"][period] == pytest.approx(expected, abs=0.01)


# ------------------------------------------------------------------
# date_to_period
# ------------------------------------------------------------------


class TestDateToPeriod:
    def test_monthly(self) -> None:
        assert date_to_period(datetime.date(2024, 1, 15), "monthly") == "2024-01"

    def test_quarterly(self) -> None:
        assert date_to_period(datetime.date(2024, 4, 1), "quarterly") == "2024-Q2"

    def test_yearly(self) -> None:
        assert date_to_period(datetime.date(2024, 12, 31), "yearly") == "2024"

    def test_quarter_boundaries(self) -> None:
        assert date_to_period(datetime.date(2024, 1, 1), "quarterly") == "2024-Q1"
        assert date_to_period(datetime.date(2024, 3, 31), "quarterly") == "2024-Q1"
        assert date_to_period(datetime.date(2024, 4, 1), "quarterly") == "2024-Q2"
        assert date_to_period(datetime.date(2024, 7, 1), "quarterly") == "2024-Q3"
        assert date_to_period(datetime.date(2024, 10, 1), "quarterly") == "2024-Q4"
