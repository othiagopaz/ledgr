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
# classify_posting — 3-tier asset classification (see AGENTS.md §7)
# ------------------------------------------------------------------


class TestClassifyPosting:
    """Classification order is CRITICAL — see AGENTS.md §7 & §13."""

    def test_salary_deposit_is_operating(self) -> None:
        """Income → cash account = operating."""
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Income:Salary"],
        )
        assert result == "operating"

    def test_grocery_is_operating(self) -> None:
        """Cash account → Expenses = operating."""
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Expenses:Food"],
        )
        assert result == "operating"

    def test_cc_payment_is_operating(self) -> None:
        """Cash account → Liabilities:CreditCard = operating (NOT financing)."""
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Liabilities:CreditCard"],
        )
        assert result == "operating"

    def test_loan_payment_is_financing(self) -> None:
        """Cash account → Liabilities:Loans:Mortgage = financing.

        This is the CRITICAL order test: Liabilities:Loans MUST be checked
        BEFORE generic Liabilities: prefix.  This was a real bug — do not
        regress (AGENTS.md §13).
        """
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Liabilities:Loans:Mortgage"],
        )
        assert result == "financing"

    def test_loan_payment_top_level_is_financing(self) -> None:
        """Cash account → Liabilities:Loans (no sub-account) = financing."""
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Liabilities:Loans"],
        )
        assert result == "financing"

    def test_stock_purchase_is_investing(self) -> None:
        """Cash account → investment account = investing."""
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Assets:Investments:Stocks"],
        )
        assert result == "investing"

    def test_broker_transfer_is_investing(self) -> None:
        """Cash account → Assets:Broker = investing (investment tier)."""
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Assets:Broker:XP"],
        )
        assert result == "investing"

    def test_stock_buy_with_commission_is_investing(self) -> None:
        """Stock buy + commission = investing (NOT operating).

        This is the key regression test: the commission (Expenses:Commissions)
        must NOT cause misclassification as operating. The investment account
        counterpart is checked before Expenses:.
        """
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Assets:Investments:Stocks", "Expenses:Commissions"],
        )
        assert result == "investing"

    def test_stock_sale_with_gain_is_investing(self) -> None:
        """Stock sale + capital gain = investing (investment counterpart wins)."""
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Assets:Investments:Stocks", "Income:CapitalGains"],
        )
        assert result == "investing"

    def test_receivable_reimbursement_is_operating(self) -> None:
        """Assets:Receivables → cash = operating (working capital, not investing).

        Receivables are "other" non-cash assets — they belong to operating
        working capital, not investing. This is the key 3-tier distinction.
        """
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Assets:Receivables:Gabi"],
        )
        assert result == "operating"

    def test_other_noncash_asset_is_operating(self) -> None:
        """Deposit/guarantee → cash = operating (other non-cash tier)."""
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Assets:Deposits:Rent"],
        )
        assert result == "operating"

    def test_bank_to_bank_is_transfer(self) -> None:
        """Cash ↔ cash = transfer (no counterparts since both are cash)."""
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=[],
        )
        assert result == "transfer"

    def test_opening_balance_is_transfer(self) -> None:
        """Equity → cash account = transfer."""
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Equity:OpeningBalances"],
        )
        assert result == "transfer"

    def test_no_counterparts_is_transfer(self) -> None:
        """Edge case: no counterparts at all defaults to transfer."""
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=[],
        )
        assert result == "transfer"

    def test_custom_investment_prefixes(self) -> None:
        """Custom investment_prefixes changes what is classified as investing."""
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Assets:US:ETrade:Stocks"],
            investment_prefixes=("Assets:US:ETrade",),
        )
        assert result == "investing"

    def test_non_investment_noncash_asset_is_operating(self) -> None:
        """Non-investment non-cash asset falls through to operating."""
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Assets:Broker:XP"],
            investment_prefixes=("Assets:US:ETrade",),  # Broker:XP not in prefixes
        )
        assert result == "operating"


# ------------------------------------------------------------------
# CC purchase: Expenses ↔ Liabilities — no cash posting
# ------------------------------------------------------------------


class TestCCPurchaseExcluded:
    """A CC purchase (Expenses ↔ Liabilities:CreditCard) has NO cash posting,
    so it should NOT appear in the cash flow statement at all."""

    def test_cc_purchase_not_in_cashflow(self, cashflow_ledger: FavaLedger) -> None:
        result = compute_cashflow(cashflow_ledger.all_entries, interval="monthly")

        # Collect all items from all categories
        all_items = []
        for section in ("operating", "investing", "financing", "transfers"):
            all_items.extend(result[section]["items"])

        # The CC purchase is Expenses:Food ↔ Liabilities:CreditCard — neither
        # is a cash account, so it shouldn't appear.
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
        # Investment accounts appear as counterpart full_names
        item_names = {i["full_name"] for i in investing["items"]}
        assert "Assets:Investments:Stocks" in item_names
        assert "Assets:Broker:XP" in item_names

    def test_investing_labels_strip_assets_prefix(
        self, cashflow_ledger: FavaLedger
    ) -> None:
        """Investing breakdown items use descriptive names (strip 'Assets:' prefix)."""
        result = compute_cashflow(cashflow_ledger.all_entries, interval="yearly")
        investing = result["investing"]
        item_short_names = {i["name"] for i in investing["items"]}
        # Should show "Investments:Stocks" not just "Stocks"
        assert "Investments:Stocks" in item_short_names
        assert "Broker:XP" in item_short_names

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

    def test_operating_currency_filters_correctly(
        self, cashflow_ledger: FavaLedger
    ) -> None:
        """When operating_currency is passed, only OC postings are in main totals."""
        result = compute_cashflow(
            cashflow_ledger.all_entries, interval="yearly", operating_currency="BRL"
        )
        assert result["operating_currency"] == "BRL"
        assert "other_net_cashflow" in result
        assert "other_opening_balance" in result
        assert "other_closing_balance" in result
        for section in ("operating", "investing", "financing", "transfers"):
            assert "other_items" in result[section]

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


# ------------------------------------------------------------------
# Multi-currency cashflow
# ------------------------------------------------------------------


class TestMultiCurrencyCashflow:
    """Non-OC postings must not contaminate OC totals."""

    def test_oc_totals_exclude_non_oc(
        self, multicurrency_ledger: FavaLedger
    ) -> None:
        result = compute_cashflow(
            multicurrency_ledger.all_entries,
            interval="yearly",
            operating_currency="USD",
        )
        assert result["operating_currency"] == "USD"
        for section in ("operating", "investing", "financing", "transfers"):
            for item in result[section]["items"]:
                for p, val in item["totals"].items():
                    assert isinstance(val, (int, float)), (
                        f"Non-OC value leaked into {section}: {item}"
                    )

    def test_non_oc_postings_in_other_items(
        self, multicurrency_ledger: FavaLedger
    ) -> None:
        result = compute_cashflow(
            multicurrency_ledger.all_entries,
            interval="yearly",
            operating_currency="USD",
        )
        # VACHR goes to Expenses:PTO / Income:PTO (no cash posting → excluded)
        # ITOT goes to Assets:Brokerage (non-cash asset → not a cash posting)
        # The buy-shares txn: cash side is USD (OC), ITOT side is non-cash → excluded
        other_net = result.get("other_net_cashflow", [])
        other_currencies = {item["currency"] for item in other_net}
        assert "ITOT" not in other_currencies

    def test_net_cashflow_is_oc_only(
        self, multicurrency_ledger: FavaLedger
    ) -> None:
        result = compute_cashflow(
            multicurrency_ledger.all_entries,
            interval="yearly",
            operating_currency="USD",
        )
        for period in result["periods"]:
            expected = round(
                result["operating"]["totals"].get(period, 0.0)
                + result["investing"]["totals"].get(period, 0.0)
                + result["financing"]["totals"].get(period, 0.0)
                + result["transfers"]["totals"].get(period, 0.0),
                2,
            )
            assert result["net_cashflow"][period] == pytest.approx(expected, abs=0.01)
