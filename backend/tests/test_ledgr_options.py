"""
Tests for ``ledgr_options.py`` — parsing ledgr-option custom directives
and their effect on classify_posting().
"""

from __future__ import annotations

from types import SimpleNamespace

from cashflow import classify_posting
from ledgr_options import (
    DEFAULT_CASH_PREFIXES,
    DEFAULT_INVESTMENT_PREFIXES,
    LedgrOptions,
    parse_ledgr_options,
)


def _make_custom_entry(name: str, raw_value: str) -> SimpleNamespace:
    """Build a minimal object that looks like a beancount Custom directive."""
    return SimpleNamespace(
        type="ledgr-option",
        values=[SimpleNamespace(value=name), SimpleNamespace(value=raw_value)],
    )


class TestDefaults:
    def test_no_entries_returns_defaults(self) -> None:
        opts = parse_ledgr_options([])
        assert opts.cash_account_prefixes == DEFAULT_CASH_PREFIXES
        assert opts.investment_account_prefixes == DEFAULT_INVESTMENT_PREFIXES

    def test_default_cash_prefixes_value(self) -> None:
        assert DEFAULT_CASH_PREFIXES == ("Assets:Bank", "Assets:Cash")

    def test_default_investment_prefixes_value(self) -> None:
        assert DEFAULT_INVESTMENT_PREFIXES == ("Assets:Investments", "Assets:Broker")


class TestCustomPrefixes:
    def test_custom_cash_prefixes_parsed(self) -> None:
        entry = _make_custom_entry("cash_account_prefixes", "Assets:Bank Assets:Wallet")
        opts = parse_ledgr_options([entry])
        assert opts.cash_account_prefixes == ("Assets:Bank", "Assets:Wallet")

    def test_custom_investment_prefixes_parsed(self) -> None:
        entry = _make_custom_entry("investment_account_prefixes", "A B C")
        opts = parse_ledgr_options([entry])
        assert opts.investment_account_prefixes == ("A", "B", "C")

    def test_both_options_parsed(self) -> None:
        entries = [
            _make_custom_entry("cash_account_prefixes", "Assets:Bank"),
            _make_custom_entry("investment_account_prefixes", "Assets:Investments"),
        ]
        opts = parse_ledgr_options(entries)
        assert opts.cash_account_prefixes == ("Assets:Bank",)
        assert opts.investment_account_prefixes == ("Assets:Investments",)


class TestUnknownOption:
    def test_unknown_option_ignored(self) -> None:
        entry = _make_custom_entry("unknown_option", "whatever")
        opts = parse_ledgr_options([entry])
        assert opts.cash_account_prefixes == DEFAULT_CASH_PREFIXES
        assert opts.investment_account_prefixes == DEFAULT_INVESTMENT_PREFIXES


class TestThreeTierClassification:
    """Verify the 3-tier asset classification with custom prefixes."""

    def test_custom_investment_prefix_classifies_as_investing(self) -> None:
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Assets:US:ETrade:Stocks"],
            investment_prefixes=("Assets:US:ETrade",),
        )
        assert result == "investing"

    def test_non_investment_noncash_asset_is_operating(self) -> None:
        """Non-investment non-cash asset falls to operating (working capital)."""
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Assets:Receivables:Gabi"],
        )
        assert result == "operating"

    def test_receivables_reimbursement_is_operating_with_custom_prefixes(self) -> None:
        """Even with custom investment prefixes, Receivables stay in operating."""
        result = classify_posting(
            cash_account="Assets:Bank:Checking",
            counterparts=["Assets:Receivables:Gabi"],
            investment_prefixes=("Assets:Investments", "Assets:Broker"),
        )
        assert result == "operating"
