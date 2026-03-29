"""
Tests for ``account_types.py`` — type map building and classification helpers.
"""

from __future__ import annotations

import datetime

from beancount.core import data

from account_types import (
    build_account_type_map,
    is_cash_account,
    is_investment_account,
    is_loan_account,
)


def _make_open(account: str, ledgr_type: str | None = None) -> data.Open:
    """Helper to create a minimal Open directive with optional ledgr-type."""
    meta = data.new_metadata("<test>", 0)
    if ledgr_type is not None:
        meta["ledgr-type"] = ledgr_type
    return data.Open(meta, datetime.date(2024, 1, 1), account, ["BRL"], None)


class TestBuildAccountTypeMap:
    def test_cash_account(self) -> None:
        entries = [_make_open("Assets:Bank:Checking", "cash")]
        result = build_account_type_map(entries)
        assert result["Assets:Bank:Checking"] == "cash"

    def test_investment_account(self) -> None:
        entries = [_make_open("Assets:Investments:Stocks", "investment")]
        result = build_account_type_map(entries)
        assert result["Assets:Investments:Stocks"] == "investment"

    def test_credit_card_account(self) -> None:
        entries = [_make_open("Liabilities:CreditCard", "credit-card")]
        result = build_account_type_map(entries)
        assert result["Liabilities:CreditCard"] == "credit-card"

    def test_loan_account(self) -> None:
        entries = [_make_open("Liabilities:Loans:Mortgage", "loan")]
        result = build_account_type_map(entries)
        assert result["Liabilities:Loans:Mortgage"] == "loan"

    def test_asset_without_type_not_in_map(self) -> None:
        """Assets without ledgr-type are NOT included (triggers warning)."""
        entries = [_make_open("Assets:Checking")]
        result = build_account_type_map(entries)
        assert "Assets:Checking" not in result

    def test_liability_without_type_not_in_map(self) -> None:
        """Liabilities without ledgr-type are NOT included."""
        entries = [_make_open("Liabilities:CreditCard")]
        result = build_account_type_map(entries)
        assert "Liabilities:CreditCard" not in result

    def test_income_without_type_defaults_to_general(self) -> None:
        entries = [_make_open("Income:Salary")]
        result = build_account_type_map(entries)
        assert result["Income:Salary"] == "general"

    def test_expenses_without_type_defaults_to_general(self) -> None:
        entries = [_make_open("Expenses:Food")]
        result = build_account_type_map(entries)
        assert result["Expenses:Food"] == "general"

    def test_equity_without_type_defaults_to_general(self) -> None:
        entries = [_make_open("Equity:OpeningBalances")]
        result = build_account_type_map(entries)
        assert result["Equity:OpeningBalances"] == "general"

    def test_non_open_entries_ignored(self) -> None:
        """Only Open directives are processed."""
        meta = data.new_metadata("<test>", 0)
        close = data.Close(meta, datetime.date(2024, 6, 1), "Assets:Checking")
        entries = [close]
        result = build_account_type_map(entries)
        assert result == {}

    def test_multiple_accounts(self) -> None:
        entries = [
            _make_open("Assets:Bank:Checking", "cash"),
            _make_open("Assets:Investments:Stocks", "investment"),
            _make_open("Liabilities:CreditCard", "credit-card"),
            _make_open("Liabilities:Loans:Mortgage", "loan"),
            _make_open("Income:Salary"),
            _make_open("Expenses:Food"),
            _make_open("Equity:OpeningBalances"),
        ]
        result = build_account_type_map(entries)
        assert result == {
            "Assets:Bank:Checking": "cash",
            "Assets:Investments:Stocks": "investment",
            "Liabilities:CreditCard": "credit-card",
            "Liabilities:Loans:Mortgage": "loan",
            "Income:Salary": "general",
            "Expenses:Food": "general",
            "Equity:OpeningBalances": "general",
        }


class TestIsCashAccount:
    def test_cash_type_is_cash(self) -> None:
        type_map = {"Assets:Bank:Checking": "cash"}
        assert is_cash_account("Assets:Bank:Checking", type_map) is True

    def test_investment_type_is_not_cash(self) -> None:
        type_map = {"Assets:Investments:Stocks": "investment"}
        assert is_cash_account("Assets:Investments:Stocks", type_map) is False

    def test_unknown_account_is_not_cash(self) -> None:
        type_map: dict[str, str] = {}
        assert is_cash_account("Assets:Unknown", type_map) is False

    def test_general_type_is_not_cash(self) -> None:
        type_map = {"Income:Salary": "general"}
        assert is_cash_account("Income:Salary", type_map) is False


class TestIsInvestmentAccount:
    def test_investment_type_is_investment(self) -> None:
        type_map = {"Assets:Investments:Stocks": "investment"}
        assert is_investment_account("Assets:Investments:Stocks", type_map) is True

    def test_cash_type_is_not_investment(self) -> None:
        type_map = {"Assets:Bank:Checking": "cash"}
        assert is_investment_account("Assets:Bank:Checking", type_map) is False

    def test_unknown_account_is_not_investment(self) -> None:
        type_map: dict[str, str] = {}
        assert is_investment_account("Assets:Unknown", type_map) is False


class TestIsLoanAccount:
    def test_loan_type_is_loan(self) -> None:
        type_map = {"Liabilities:Loans:Mortgage": "loan"}
        assert is_loan_account("Liabilities:Loans:Mortgage", type_map) is True

    def test_credit_card_is_not_loan(self) -> None:
        type_map = {"Liabilities:CreditCard": "credit-card"}
        assert is_loan_account("Liabilities:CreditCard", type_map) is False

    def test_unknown_account_is_not_loan(self) -> None:
        type_map: dict[str, str] = {}
        assert is_loan_account("Liabilities:Unknown", type_map) is False
