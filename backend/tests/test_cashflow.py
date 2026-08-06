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

from account_types import build_account_type_map
from cashflow import classify_posting, compute_cashflow, date_to_period
from ledger import get_filtered_entries


# ------------------------------------------------------------------
# Default type map for classification tests — mirrors cashflow.beancount
# ------------------------------------------------------------------

DEFAULT_TYPE_MAP: dict[str, str] = {
    "Assets:Bank:Checking": "cash",
    "Assets:Bank:Savings": "cash",
    "Assets:Investments:Stocks": "investment",
    "Assets:Broker:XP": "investment",
    "Liabilities:CreditCard": "credit-card",
    "Liabilities:Loans:Mortgage": "loan",
    "Income:Salary": "general",
    "Expenses:Food": "general",
    "Expenses:Rent": "general",
    "Expenses:Commissions": "general",
    "Income:CapitalGains": "general",
    "Equity:OpeningBalances": "general",
    # Working-capital Asset/Liability types (classified by ledgr-type, not
    # by account-name prefix).
    "Assets:Receivables:Gabi": "receivable",
    "Assets:Deposits:Rent": "prepaid",
    "Liabilities:Payable:Vendor": "payable",
}


# ------------------------------------------------------------------
# classify_posting — per-counterpart, ledgr-type based (see AGENTS.md §7)
# ------------------------------------------------------------------


class TestClassifyPosting:
    """Classification order is CRITICAL — see AGENTS.md §7 & §13.

    ``classify_posting`` takes a **single** counterpart (or ``None``) and
    returns that counterpart's IAS 7 section.
    """

    def test_salary_deposit_is_operating(self) -> None:
        """Income counterpart = operating."""
        assert classify_posting(
            "Assets:Bank:Checking", "Income:Salary", DEFAULT_TYPE_MAP
        ) == "operating"

    def test_grocery_is_operating(self) -> None:
        """Expenses counterpart = operating."""
        assert classify_posting(
            "Assets:Bank:Checking", "Expenses:Food", DEFAULT_TYPE_MAP
        ) == "operating"

    def test_cc_payment_is_operating(self) -> None:
        """credit-card counterpart = operating (NOT financing)."""
        assert classify_posting(
            "Assets:Bank:Checking", "Liabilities:CreditCard", DEFAULT_TYPE_MAP
        ) == "operating"

    def test_loan_payment_is_financing(self) -> None:
        """loan counterpart = financing.

        CRITICAL order: loans MUST be checked BEFORE generic Liabilities.
        This was a real bug — do not regress (AGENTS.md §13).
        """
        assert classify_posting(
            "Assets:Bank:Checking", "Liabilities:Loans:Mortgage", DEFAULT_TYPE_MAP
        ) == "financing"

    def test_loan_any_name_is_financing(self) -> None:
        """Account name doesn't matter — only ledgr-type does."""
        type_map = {**DEFAULT_TYPE_MAP, "Liabilities:Emprestimo": "loan"}
        assert classify_posting(
            "Assets:Bank:Checking", "Liabilities:Emprestimo", type_map
        ) == "financing"

    def test_stock_purchase_is_investing(self) -> None:
        """investment counterpart = investing."""
        assert classify_posting(
            "Assets:Bank:Checking", "Assets:Investments:Stocks", DEFAULT_TYPE_MAP
        ) == "investing"

    def test_broker_transfer_is_investing(self) -> None:
        """investment-typed broker counterpart = investing."""
        assert classify_posting(
            "Assets:Bank:Checking", "Assets:Broker:XP", DEFAULT_TYPE_MAP
        ) == "investing"

    def test_investment_counterpart_beats_expense(self) -> None:
        """INVESTING is checked before OPERATING.

        With per-counterpart attribution the investment leg and the commission
        leg are now separate items — the investment counterpart is investing,
        the commission counterpart is operating. This still guards the
        single-counterpart ordering.
        """
        assert classify_posting(
            "Assets:Bank:Checking", "Assets:Investments:Stocks", DEFAULT_TYPE_MAP
        ) == "investing"
        assert classify_posting(
            "Assets:Bank:Checking", "Expenses:Commissions", DEFAULT_TYPE_MAP
        ) == "operating"

    def test_receivable_reimbursement_is_operating(self) -> None:
        """receivable counterpart = operating (working capital), via ledgr-type."""
        assert classify_posting(
            "Assets:Bank:Checking", "Assets:Receivables:Gabi", DEFAULT_TYPE_MAP
        ) == "operating"

    def test_prepaid_is_operating(self) -> None:
        """prepaid counterpart = operating (working capital), via ledgr-type."""
        assert classify_posting(
            "Assets:Bank:Checking", "Assets:Deposits:Rent", DEFAULT_TYPE_MAP
        ) == "operating"

    def test_payable_is_operating(self) -> None:
        """payable counterpart = operating (working capital), via ledgr-type."""
        assert classify_posting(
            "Assets:Bank:Checking", "Liabilities:Payable:Vendor", DEFAULT_TYPE_MAP
        ) == "operating"

    def test_working_capital_uses_ledgr_type_not_prefix(self) -> None:
        """Receivable classification comes from the ledgr-type, not the name.

        An account named like an investment but typed ``receivable`` is still
        operating; a name that no prefix rule would catch still classifies via
        its type.
        """
        type_map = {**DEFAULT_TYPE_MAP, "Assets:Weird:Name": "receivable"}
        assert classify_posting(
            "Assets:Bank:Checking", "Assets:Weird:Name", type_map
        ) == "operating"

    def test_bank_to_bank_is_transfer(self) -> None:
        """No counterpart (pure cash↔cash) = transfer."""
        assert classify_posting(
            "Assets:Bank:Checking", None, DEFAULT_TYPE_MAP
        ) == "transfer"

    def test_opening_balance_is_transfer(self) -> None:
        """Equity counterpart = transfer."""
        assert classify_posting(
            "Assets:Bank:Checking", "Equity:OpeningBalances", DEFAULT_TYPE_MAP
        ) == "transfer"

    def test_none_counterpart_is_transfer(self) -> None:
        """Edge case: None counterpart defaults to transfer."""
        assert classify_posting(
            "Assets:Bank:Checking", None, DEFAULT_TYPE_MAP
        ) == "transfer"

    def test_cash_account_name_doesnt_matter(self) -> None:
        """Any-named account typed 'cash' is a cash account; its expense
        counterpart still classifies as operating."""
        type_map = {**DEFAULT_TYPE_MAP, "Assets:Nubank": "cash"}
        assert classify_posting(
            "Assets:Nubank", "Expenses:Food", type_map
        ) == "operating"


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
        # is a cash account, so the 150 BRL purchase must NOT show up anywhere.
        # (Expenses:Food *does* appear from the cash grocery txn; assert the
        # cash-less 150 amount is absent from every item's period totals.)
        all_period_values = [
            v for i in all_items for v in i["totals"].values()
        ]
        assert 150.0 not in all_period_values
        assert -150.0 not in all_period_values


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
        # Salary (+10000), Food (-500), Rent (-3000), CC payment (-200) = +6300
        assert operating["total"] == pytest.approx(6300.0)
        item_names = {i["full_name"] for i in operating["items"]}
        assert "Income:Salary" in item_names

    def test_fixture_signed_subtotals(self, cashflow_ledger: FavaLedger) -> None:
        """Pin the exact signed section totals so a sign flip or magnitude
        error can't slip through (guards the -counterpart sign convention)."""
        result = compute_cashflow(cashflow_ledger.all_entries, interval="yearly")
        assert result["operating"]["total"] == pytest.approx(6300.0)
        assert result["investing"]["total"] == pytest.approx(-3000.0)
        assert result["financing"]["total"] == pytest.approx(-1500.0)
        assert result["transfers"]["total"] == pytest.approx(20000.0)
        assert result["net_cashflow"]["2024"] == pytest.approx(21800.0)

    def test_financing_includes_loan(self, cashflow_ledger: FavaLedger) -> None:
        result = compute_cashflow(cashflow_ledger.all_entries, interval="yearly")
        financing = result["financing"]
        item_names = {i["full_name"] for i in financing["items"]}
        assert "Liabilities:Loans:Mortgage" in item_names
        # Loan payment is a -1500 cash outflow → financing.
        loan = next(i for i in financing["items"]
                    if i["full_name"] == "Liabilities:Loans:Mortgage")
        assert loan["total"] == pytest.approx(-1500.0)

    def test_investing_includes_stocks(self, cashflow_ledger: FavaLedger) -> None:
        result = compute_cashflow(cashflow_ledger.all_entries, interval="yearly")
        investing = result["investing"]
        # Investment accounts appear as counterpart full_names, signed (outflow).
        by_name = {i["full_name"]: i["total"] for i in investing["items"]}
        assert by_name.get("Assets:Investments:Stocks") == pytest.approx(-2000.0)
        assert by_name.get("Assets:Broker:XP") == pytest.approx(-1000.0)

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
        entries = get_filtered_entries(
            cashflow_ledger,
            from_date=datetime.date(2024, 2, 1),
            to_date=datetime.date(2024, 3, 1),
        )
        result = compute_cashflow(entries, interval="monthly")
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

    def test_closing_equals_opening_plus_net(
        self, cashflow_ledger: FavaLedger
    ) -> None:
        """Reconciliation invariant: closing == opening + net, every period.

        This ties the section-derived net (from the emission items) to the
        independently-computed cash balances. It is the check that catches a
        dropped or double-counted cash leg — e.g. the cross-currency
        share-purchase-with-commission bug — which the sum-of-categories test
        cannot detect.
        """
        for interval in ("monthly", "yearly"):
            result = compute_cashflow(cashflow_ledger.all_entries, interval=interval)
            for period in result["periods"]:
                opening = result["opening_balance"].get(period, 0.0)
                net = result["net_cashflow"].get(period, 0.0)
                closing = result["closing_balance"].get(period, 0.0)
                assert closing == pytest.approx(opening + net, abs=0.02), (
                    f"{interval} {period}: closing {closing} != opening "
                    f"{opening} + net {net}"
                )

    def test_section_subtotal_equals_sum_of_items_fixture(
        self, cashflow_ledger: FavaLedger
    ) -> None:
        """Every section subtotal equals the sum of its line-item totals."""
        result = compute_cashflow(cashflow_ledger.all_entries, interval="monthly")
        for sec in ("operating", "investing", "financing", "transfers"):
            for period in result["periods"]:
                subtotal = round(result[sec]["totals"].get(period, 0.0), 2)
                items_sum = round(
                    sum(i["totals"].get(period, 0.0) for i in result[sec]["items"]),
                    2,
                )
                assert subtotal == pytest.approx(items_sum, abs=0.01), (
                    f"{sec} {period}: subtotal {subtotal} != sum(items) {items_sum}"
                )


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


# ------------------------------------------------------------------
# Per-counterpart attribution (Option B) — synthetic transactions
# ------------------------------------------------------------------


def _txn(date: datetime.date, narration: str, legs: list[tuple[str, str, str]]):
    """Build a beancount Transaction from (account, number, currency) legs."""
    postings = [
        data.Posting(
            account=acct,
            units=amt_mod.Amount(Decimal(num), cur),
            cost=None,
            price=None,
            flag=None,
            meta=None,
        )
        for acct, num, cur in legs
    ]
    return data.Transaction(
        meta={"filename": "<test>", "lineno": 0},
        date=date,
        flag="*",
        payee=None,
        narration=narration,
        tags=frozenset(),
        links=frozenset(),
        postings=postings,
    )


# Type map for the synthetic per-counterpart tests.
PC_TYPE_MAP: dict[str, str] = {
    "Assets:Bank:Checking": "cash",
    "Assets:Bank:Savings": "cash",
    "Assets:Bank:Third": "cash",
    "Assets:RealState:House": "investment",
    "Assets:Receivables:Gabi": "receivable",
    "Expenses:MortgageInterest": "general",
    "Expenses:Food": "general",
    "Expenses:Rent": "general",
    "Income:Salary": "general",
}


class TestPerCounterpartAttribution:
    """Mixed transactions split per counterpart across the right sections."""

    def test_mixed_mortgage_splits_across_sections(self) -> None:
        """One cash payment with investment + expense + receivable counterparts
        splits: principal→investing, interest→operating, receivable→operating.
        No 'Split' row, and net still equals the cash outflow."""
        txn = _txn(
            datetime.date(2026, 8, 30),
            "Financiamento",
            [
                ("Assets:Bank:Checking", "-4140.86", "BRL"),
                ("Assets:RealState:House", "410.23", "BRL"),
                ("Expenses:MortgageInterest", "1660.20", "BRL"),
                ("Assets:Receivables:Gabi", "2070.43", "BRL"),
            ],
        )
        result = compute_cashflow([txn], interval="monthly",
                                  operating_currency="BRL", type_map=PC_TYPE_MAP)
        p = "2026-08"
        # Investing = principal only.
        inv = {i["full_name"]: i["totals"].get(p) for i in result["investing"]["items"]}
        assert inv == {"Assets:RealState:House": pytest.approx(-410.23)}
        # Operating = interest + receivable.
        op = {i["full_name"]: i["totals"].get(p) for i in result["operating"]["items"]}
        assert op["Expenses:MortgageInterest"] == pytest.approx(-1660.20)
        assert op["Assets:Receivables:Gabi"] == pytest.approx(-2070.43)
        # No synthesized "Split" anywhere.
        for sec in ("operating", "investing", "financing", "transfers"):
            names = {i["full_name"] for i in result[sec]["items"]}
            assert "Split" not in names
        # Net cash flow equals the actual cash outflow.
        assert result["net_cashflow"][p] == pytest.approx(-4140.86)

    def test_section_subtotal_equals_sum_of_items(self) -> None:
        txn = _txn(
            datetime.date(2026, 8, 30),
            "Financiamento",
            [
                ("Assets:Bank:Checking", "-4140.86", "BRL"),
                ("Assets:RealState:House", "410.23", "BRL"),
                ("Expenses:MortgageInterest", "1660.20", "BRL"),
                ("Assets:Receivables:Gabi", "2070.43", "BRL"),
            ],
        )
        result = compute_cashflow([txn], interval="monthly",
                                  operating_currency="BRL", type_map=PC_TYPE_MAP)
        for sec in ("operating", "investing", "financing", "transfers"):
            for p in result["periods"]:
                subtotal = round(result[sec]["totals"].get(p, 0.0), 2)
                items_sum = round(
                    sum(i["totals"].get(p, 0.0) for i in result[sec]["items"]), 2
                )
                assert subtotal == pytest.approx(items_sum, abs=0.01), (
                    f"{sec} {p}: subtotal {subtotal} != sum(items) {items_sum}"
                )


class TestMultiCashLeg:
    """Beancount 'Hooli payroll' shape: two cash legs are independent
    destinations of the counterparts — NOT a transfer between each other."""

    def test_two_cash_destinations_no_spurious_split_or_transfer(self) -> None:
        # Salary +2550.60 lands in two banks; single Income counterpart.
        txn = _txn(
            datetime.date(2026, 1, 15),
            "Payroll",
            [
                ("Assets:Bank:Checking", "1350.60", "BRL"),
                ("Assets:Bank:Savings", "1200.00", "BRL"),
                ("Income:Salary", "-2550.60", "BRL"),
            ],
        )
        result = compute_cashflow([txn], interval="monthly",
                                  operating_currency="BRL", type_map=PC_TYPE_MAP)
        p = "2026-01"
        # All operating, attributed to the single Income counterpart.
        op = {i["full_name"]: i["totals"].get(p) for i in result["operating"]["items"]}
        assert op == {"Income:Salary": pytest.approx(2550.60)}
        # No transfer emitted (the two banks are destinations, not a transfer).
        assert result["transfers"]["totals"].get(p, 0.0) == pytest.approx(0.0)
        assert result["net_cashflow"][p] == pytest.approx(2550.60)

    def test_multi_cash_leg_with_two_counterparts_splits(self) -> None:
        # Two cash legs + two counterparts, all same section → two operating
        # items, no residual transfer.
        txn = _txn(
            datetime.date(2026, 1, 15),
            "Payroll+bill",
            [
                ("Assets:Bank:Checking", "800.00", "BRL"),
                ("Assets:Bank:Savings", "150.00", "BRL"),
                ("Income:Salary", "-1000.00", "BRL"),
                ("Expenses:Food", "50.00", "BRL"),
            ],
        )
        result = compute_cashflow([txn], interval="monthly",
                                  operating_currency="BRL", type_map=PC_TYPE_MAP)
        p = "2026-01"
        op = {i["full_name"]: i["totals"].get(p) for i in result["operating"]["items"]}
        assert op["Income:Salary"] == pytest.approx(1000.00)
        assert op["Expenses:Food"] == pytest.approx(-50.00)
        assert result["transfers"]["totals"].get(p, 0.0) == pytest.approx(0.0)
        assert result["net_cashflow"][p] == pytest.approx(950.00)


class TestCashToCashHandling:
    """Cash moving between the entity's own accounts is not a cash flow.

    Attribution follows the counterparts (what the cash was *for*), not which
    cash account it sat in — so internal shuffles net within the entity's cash
    and never inflate any section (IAS 7: only flows in/out of the entity's
    cash count).
    """

    def test_internal_shuffle_does_not_create_a_transfer(self) -> None:
        # Pay 700 rent, funding it -1000 from Checking with +300 landing in
        # Savings. Net cash out is 700 (operating); the internal 300 is not a
        # separate cash flow.
        txn = _txn(
            datetime.date(2026, 1, 10),
            "Rent + shuffle",
            [
                ("Assets:Bank:Checking", "-1000.00", "BRL"),
                ("Assets:Bank:Savings", "300.00", "BRL"),
                ("Expenses:Rent", "700.00", "BRL"),
            ],
        )
        result = compute_cashflow([txn], interval="monthly",
                                  operating_currency="BRL", type_map=PC_TYPE_MAP)
        p = "2026-01"
        # Rent → operating -700 (attributed to the counterpart, not the banks).
        assert result["operating"]["totals"].get(p) == pytest.approx(-700.00)
        # No transfer line: the internal move nets within the entity's cash.
        assert result["transfers"]["totals"].get(p, 0.0) == pytest.approx(0.0)
        # Net equals the true cash outflow (-1000 + 300 = -700).
        assert result["net_cashflow"][p] == pytest.approx(-700.00)

    def test_pure_bank_transfer_nets_to_zero(self) -> None:
        # Checking -500, Savings +500, no counterpart → pure transfer, nets to 0.
        txn = _txn(
            datetime.date(2026, 1, 10),
            "Bank transfer",
            [
                ("Assets:Bank:Checking", "-500.00", "BRL"),
                ("Assets:Bank:Savings", "500.00", "BRL"),
            ],
        )
        result = compute_cashflow([txn], interval="monthly",
                                  operating_currency="BRL", type_map=PC_TYPE_MAP)
        p = "2026-01"
        assert result["transfers"]["totals"].get(p, 0.0) == pytest.approx(0.0)
        assert result["net_cashflow"][p] == pytest.approx(0.0)

    def test_three_cash_leg_pure_transfer_nets_to_zero(self) -> None:
        # Three cash accounts, no non-cash counterpart → pure transfer, nets to
        # 0 and leaks nothing into net cash flow.
        txn = _txn(
            datetime.date(2026, 1, 10),
            "Three-way move",
            [
                ("Assets:Bank:Checking", "-1000.00", "BRL"),
                ("Assets:Bank:Savings", "600.00", "BRL"),
                ("Assets:Bank:Third", "400.00", "BRL"),
            ],
        )
        result = compute_cashflow([txn], interval="monthly",
                                  operating_currency="BRL", type_map=PC_TYPE_MAP)
        p = "2026-01"
        # A pure N-way transfer among the entity's own accounts nets to zero and
        # leaks nothing into net cash flow. (Its legs carry the "Split" label
        # internally for 3+ accounts, but they sum to zero and are filtered from
        # the breakdown — so the section is empty, which is correct.)
        assert result["transfers"]["totals"].get(p, 0.0) == pytest.approx(0.0)
        assert result["net_cashflow"][p] == pytest.approx(0.0)


class TestCrossCurrencyCounterpart:
    """A cash leg partly explained by a same-currency counterpart and partly by
    a DIFFERENT-currency counterpart (share purchase/sale + commission/gain).

    Regression for a real bug: the same-currency counterpart alone did NOT
    account for the whole cash leg, and the cross-currency remainder was
    silently dropped — net stopped reconciling with the cash balance.
    """

    _LEDGER = """
option "operating_currency" "USD"
2024-01-01 open Assets:Bank:Checking USD
  ledgr-type: "cash"
2024-01-01 open Assets:Brokerage ITOT
  ledgr-type: "investment"
2024-01-01 open Expenses:Commissions USD
2024-01-01 open Income:CapitalGains USD
2024-01-01 open Equity:Opening
  ledgr-type: "cash"

2024-01-01 * "Opening"
  Assets:Bank:Checking  10000.00 USD
  Equity:Opening

2024-02-01 * "Buy 100 ITOT + commission"
  Assets:Brokerage         100 ITOT {35.00 USD}
  Expenses:Commissions    5.00 USD
  Assets:Bank:Checking
"""

    def _compute(self):
        from beancount import loader
        entries, errors, _ = loader.load_string(self._LEDGER)
        assert not errors, errors
        type_map = build_account_type_map(entries)
        return compute_cashflow(
            entries, interval="yearly", operating_currency="USD", type_map=type_map
        )

    def test_investing_gets_the_cross_currency_remainder(self) -> None:
        result = self._compute()
        # -3500 USD (the ITOT cost) must land in investing, labelled with the
        # investment counterpart — NOT dropped.
        by_name = {i["full_name"]: i["total"] for i in result["investing"]["items"]}
        assert by_name.get("Assets:Brokerage") == pytest.approx(-3500.0)
        # The 5 USD commission is operating.
        assert result["operating"]["total"] == pytest.approx(-5.0)

    def test_net_reconciles_with_cash_balance(self) -> None:
        result = self._compute()
        p = "2024"
        # Full cash outflow is -3505; net must equal it and reconcile.
        assert result["net_cashflow"][p] == pytest.approx(-3505.0)
        assert result["closing_balance"][p] == pytest.approx(
            result["opening_balance"][p] + result["net_cashflow"][p], abs=0.01
        )
