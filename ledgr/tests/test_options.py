"""
Tests for ``ledgr.options`` — parsing ledgr-option custom directives
and their effect on classify_posting().
"""

from __future__ import annotations

from types import SimpleNamespace

from ledgr.cashflow import classify_posting
from ledgr.options import DEFAULT_INVESTMENT_PREFIXES, LedgrOptions, parse_ledgr_options


def _make_custom_entry(name: str, raw_value: str) -> SimpleNamespace:
    """Build a minimal object that looks like a beancount Custom directive."""
    return SimpleNamespace(
        type="ledgr-option",
        values=[SimpleNamespace(value=name), SimpleNamespace(value=raw_value)],
    )


class TestDefaults:
    def test_no_entries_returns_defaults(self) -> None:
        opts = parse_ledgr_options([])
        assert opts.investment_account_prefixes == DEFAULT_INVESTMENT_PREFIXES

    def test_default_prefixes_value(self) -> None:
        assert DEFAULT_INVESTMENT_PREFIXES == ("Assets:Investments", "Assets:Broker")


class TestCustomPrefixes:
    def test_custom_prefixes_parsed(self) -> None:
        entry = _make_custom_entry("investment_account_prefixes", "A B C")
        opts = parse_ledgr_options([entry])
        assert opts.investment_account_prefixes == ("A", "B", "C")


class TestUnknownOption:
    def test_unknown_option_ignored(self) -> None:
        entry = _make_custom_entry("unknown_option", "whatever")
        opts = parse_ledgr_options([entry])
        assert opts.investment_account_prefixes == DEFAULT_INVESTMENT_PREFIXES


class TestClassifyWithCustomPrefixes:
    def test_etrade_stock_buy_is_investing(self) -> None:
        result = classify_posting(
            asset_account="Assets:Checking",
            counterparts=[],
            all_accounts_in_txn=[
                "Assets:Checking",
                "Assets:US:ETrade:Stocks",
            ],
            investment_prefixes=("Assets:US:ETrade",),
        )
        assert result == "investing"
