"""Tests for ``series.py`` — pure generator functions.

Covers date math, transaction construction, metadata, and remainder handling.
"""

from __future__ import annotations

import datetime
from decimal import Decimal, ROUND_HALF_UP

from beancount.core import data

from series import (
    compute_monthly_dates,
    generate_series_id,
    generate_series_transactions,
    months_between,
)


# ------------------------------------------------------------------
# generate_series_id
# ------------------------------------------------------------------


class TestGenerateSeriesId:
    def test_returns_string(self) -> None:
        result = generate_series_id()
        assert isinstance(result, str)

    def test_length_without_prefix(self) -> None:
        result = generate_series_id()
        assert len(result) == 12

    def test_with_prefix(self) -> None:
        result = generate_series_id("Netflix")
        assert result.startswith("netflix-")
        # prefix (max 12) + "-" + 12 hex chars
        assert len(result) > 12

    def test_prefix_sanitized(self) -> None:
        result = generate_series_id("My Subscription")
        assert result.startswith("my-subscript-")

    def test_unique(self) -> None:
        ids = {generate_series_id() for _ in range(100)}
        assert len(ids) == 100


# ------------------------------------------------------------------
# compute_monthly_dates
# ------------------------------------------------------------------


class TestComputeMonthlyDates:
    def test_basic_monthly(self) -> None:
        start = datetime.date(2025, 1, 15)
        dates = compute_monthly_dates(start, 3)
        assert dates == [
            datetime.date(2025, 1, 15),
            datetime.date(2025, 2, 15),
            datetime.date(2025, 3, 15),
        ]

    def test_day_clamping_feb(self) -> None:
        """Jan 31 → Feb 28 (non-leap year)."""
        start = datetime.date(2025, 1, 31)
        dates = compute_monthly_dates(start, 3)
        assert dates[0] == datetime.date(2025, 1, 31)
        assert dates[1] == datetime.date(2025, 2, 28)
        assert dates[2] == datetime.date(2025, 3, 31)

    def test_day_clamping_apr(self) -> None:
        """Mar 31 → Apr 30."""
        start = datetime.date(2025, 3, 31)
        dates = compute_monthly_dates(start, 2)
        assert dates[0] == datetime.date(2025, 3, 31)
        assert dates[1] == datetime.date(2025, 4, 30)

    def test_year_rollover(self) -> None:
        """Nov → Dec → Jan."""
        start = datetime.date(2025, 11, 10)
        dates = compute_monthly_dates(start, 3)
        assert dates == [
            datetime.date(2025, 11, 10),
            datetime.date(2025, 12, 10),
            datetime.date(2026, 1, 10),
        ]

    def test_single_date(self) -> None:
        start = datetime.date(2025, 6, 1)
        dates = compute_monthly_dates(start, 1)
        assert dates == [datetime.date(2025, 6, 1)]

    def test_leap_year(self) -> None:
        """Jan 29 → Feb 29 in a leap year."""
        start = datetime.date(2024, 1, 29)
        dates = compute_monthly_dates(start, 2)
        assert dates[1] == datetime.date(2024, 2, 29)

    def test_non_leap_year(self) -> None:
        """Jan 29 → Feb 28 in a non-leap year."""
        start = datetime.date(2025, 1, 29)
        dates = compute_monthly_dates(start, 2)
        assert dates[1] == datetime.date(2025, 2, 28)


# ------------------------------------------------------------------
# months_between
# ------------------------------------------------------------------


class TestMonthsBetween:
    def test_same_month(self) -> None:
        assert months_between(
            datetime.date(2025, 4, 1), datetime.date(2025, 4, 1)
        ) == 1

    def test_cross_year(self) -> None:
        assert months_between(
            datetime.date(2025, 4, 1), datetime.date(2026, 12, 1)
        ) == 21

    def test_adjacent_months(self) -> None:
        assert months_between(
            datetime.date(2025, 1, 1), datetime.date(2025, 2, 1)
        ) == 2

    def test_full_year(self) -> None:
        assert months_between(
            datetime.date(2025, 1, 1), datetime.date(2025, 12, 1)
        ) == 12


# ------------------------------------------------------------------
# Helper: two-posting spec
# ------------------------------------------------------------------


def _two_posting_spec(
    account_to: str,
    account_from: str,
    amount: Decimal,
    currency: str = "BRL",
) -> list[dict]:
    """Build a standard two-posting spec (positive + negative)."""
    return [
        {"account": account_to, "amount": amount, "currency": currency},
        {"account": account_from, "amount": -amount, "currency": currency},
    ]


# ------------------------------------------------------------------
# generate_series_transactions — installment
# ------------------------------------------------------------------


class TestGenerateInstallmentTransactions:
    def test_correct_count(self) -> None:
        txns = generate_series_transactions(
            series_type="installment",
            series_id="tv-abc123",
            payee="Magazine Luiza",
            narration='TV 65"',
            start_date=datetime.date(2025, 4, 15),
            count=12,
            postings_spec=_two_posting_spec(
                "Expenses:Home:Electronics",
                "Liabilities:CreditCard:Nubank",
                Decimal("250.00"),
            ),
            default_currency="BRL",
            beancount_file_path="test.beancount",
        )
        assert len(txns) == 12

    def test_narration_format(self) -> None:
        txns = generate_series_transactions(
            series_type="installment",
            series_id="tv-abc123",
            payee="Store",
            narration="TV",
            start_date=datetime.date(2025, 1, 1),
            count=3,
            postings_spec=_two_posting_spec(
                "Expenses:Stuff", "Liabilities:CC", Decimal("100"),
            ),
            default_currency="BRL",
            beancount_file_path="test.beancount",
        )
        assert txns[0].narration == "TV"
        assert txns[1].narration == "TV"
        assert txns[2].narration == "TV"

    def test_metadata_keys(self) -> None:
        txns = generate_series_transactions(
            series_type="installment",
            series_id="tv-abc123",
            payee="Store",
            narration="TV",
            start_date=datetime.date(2025, 1, 1),
            count=3,
            postings_spec=_two_posting_spec(
                "Expenses:Stuff", "Liabilities:CC", Decimal("100"),
            ),
            default_currency="BRL",
            beancount_file_path="test.beancount",
        )
        for i, txn in enumerate(txns):
            assert txn.meta["ledgr-series"] == "tv-abc123"
            assert txn.meta["ledgr-series-type"] == "installment"
            assert txn.meta["ledgr-series-seq"] == Decimal(i + 1)
            assert txn.meta["ledgr-series-total"] == Decimal(3)

    def test_all_flags_planned(self) -> None:
        txns = generate_series_transactions(
            series_type="installment",
            series_id="x",
            payee="P",
            narration="N",
            start_date=datetime.date(2025, 1, 1),
            count=5,
            postings_spec=_two_posting_spec("E:S", "L:CC", Decimal("10")),
            default_currency="BRL",
            beancount_file_path="t.bc",
        )
        assert all(t.flag == "!" for t in txns)

    def test_postings_structure(self) -> None:
        txns = generate_series_transactions(
            series_type="installment",
            series_id="x",
            payee="P",
            narration="N",
            start_date=datetime.date(2025, 1, 1),
            count=1,
            postings_spec=_two_posting_spec(
                "Expenses:Stuff", "Liabilities:CC", Decimal("250.00"),
            ),
            default_currency="BRL",
            beancount_file_path="t.bc",
        )
        txn = txns[0]
        assert len(txn.postings) == 2
        # First posting: account_to (positive)
        assert txn.postings[0].account == "Expenses:Stuff"
        assert txn.postings[0].units.number == Decimal("250.00")
        assert txn.postings[0].units.currency == "BRL"
        # Second posting: account_from (negative)
        assert txn.postings[1].account == "Liabilities:CC"
        assert txn.postings[1].units.number == Decimal("-250.00")


# ------------------------------------------------------------------
# generate_series_transactions — recurring
# ------------------------------------------------------------------


class TestGenerateRecurringTransactions:
    def test_correct_count(self) -> None:
        txns = generate_series_transactions(
            series_type="recurring",
            series_id="netflix-xyz",
            payee="Netflix",
            narration="Assinatura mensal",
            start_date=datetime.date(2025, 4, 1),
            count=6,
            postings_spec=_two_posting_spec(
                "Expenses:Entertainment:Streaming",
                "Assets:Bank:Nubank",
                Decimal("55.90"),
            ),
            default_currency="BRL",
            beancount_file_path="test.beancount",
        )
        assert len(txns) == 6

    def test_narration_unchanged(self) -> None:
        txns = generate_series_transactions(
            series_type="recurring",
            series_id="r",
            payee="Netflix",
            narration="Assinatura mensal",
            start_date=datetime.date(2025, 1, 1),
            count=3,
            postings_spec=_two_posting_spec("E:S", "A:B", Decimal("55.90")),
            default_currency="BRL",
            beancount_file_path="t.bc",
        )
        assert all(t.narration == "Assinatura mensal" for t in txns)

    def test_no_seq_total_metadata(self) -> None:
        txns = generate_series_transactions(
            series_type="recurring",
            series_id="r",
            payee="P",
            narration="N",
            start_date=datetime.date(2025, 1, 1),
            count=3,
            postings_spec=_two_posting_spec("E:S", "A:B", Decimal("10")),
            default_currency="BRL",
            beancount_file_path="t.bc",
        )
        for txn in txns:
            assert txn.meta["ledgr-series-type"] == "recurring"
            assert "ledgr-series-seq" not in txn.meta
            assert "ledgr-series-total" not in txn.meta


# ------------------------------------------------------------------
# generate_series_transactions — remainder adjustment
# ------------------------------------------------------------------


class TestRemainderAdjustment:
    def test_last_installment_adjusted(self) -> None:
        # R$1000 / 3 = R$333.33, remainder R$0.01 → last = R$333.34
        per_txn = Decimal("333.33")
        last_adj = Decimal("333.34")
        txns = generate_series_transactions(
            series_type="installment",
            series_id="x",
            payee="P",
            narration="N",
            start_date=datetime.date(2025, 1, 1),
            count=3,
            postings_spec=_two_posting_spec("E:S", "L:CC", per_txn),
            default_currency="BRL",
            beancount_file_path="t.bc",
            last_installment_adjustment=last_adj,
        )
        assert txns[0].postings[0].units.number == Decimal("333.33")
        assert txns[1].postings[0].units.number == Decimal("333.33")
        assert txns[2].postings[0].units.number == Decimal("333.34")

    def test_sum_equals_total(self) -> None:
        total = Decimal("1000")
        count = 3
        per_txn = (total / count).quantize(Decimal("0.01"), ROUND_HALF_UP)
        remainder = total - per_txn * count
        last_adj = per_txn + remainder

        txns = generate_series_transactions(
            series_type="installment",
            series_id="x",
            payee="P",
            narration="N",
            start_date=datetime.date(2025, 1, 1),
            count=count,
            postings_spec=_two_posting_spec("E:S", "L:CC", per_txn),
            default_currency="BRL",
            beancount_file_path="t.bc",
            last_installment_adjustment=last_adj,
        )
        total_generated = sum(t.postings[0].units.number for t in txns)
        assert total_generated == total


# ------------------------------------------------------------------
# seq_offset (for extend)
# ------------------------------------------------------------------


class TestSeqOffset:
    def test_offset_shifts_seq(self) -> None:
        txns = generate_series_transactions(
            series_type="installment",
            series_id="x",
            payee="P",
            narration="N",
            start_date=datetime.date(2025, 7, 1),
            count=3,
            postings_spec=_two_posting_spec("E:S", "L:CC", Decimal("100")),
            default_currency="BRL",
            beancount_file_path="t.bc",
            seq_offset=6,
        )
        assert txns[0].meta["ledgr-series-seq"] == Decimal(7)
        assert txns[0].meta["ledgr-series-total"] == Decimal(9)  # 6 + 3
        assert txns[0].narration == "N"


# ------------------------------------------------------------------
# Multi-posting (split) transactions
# ------------------------------------------------------------------


class TestMultiPostingTransactions:
    def test_three_postings_sum_to_zero(self) -> None:
        """3-posting spec: two expenses + one source (all amounts explicit)."""
        spec = [
            {"account": "Expenses:Food", "amount": Decimal("60"), "currency": "BRL"},
            {"account": "Expenses:Entertainment", "amount": Decimal("40"), "currency": "BRL"},
            {"account": "Assets:Checking", "amount": Decimal("-100"), "currency": "BRL"},
        ]
        txns = generate_series_transactions(
            series_type="recurring",
            series_id="split-r",
            payee="Combo",
            narration="Monthly combo",
            start_date=datetime.date(2025, 1, 1),
            count=2,
            postings_spec=spec,
            default_currency="BRL",
            beancount_file_path="t.bc",
        )
        assert len(txns) == 2
        for txn in txns:
            assert len(txn.postings) == 3
            total = sum(p.units.number for p in txn.postings)
            assert total == Decimal("0")

    def test_auto_balance_posting(self) -> None:
        """One posting with amount=None should produce a Posting with units=None."""
        spec = [
            {"account": "Expenses:Food", "amount": Decimal("60"), "currency": "BRL"},
            {"account": "Expenses:Entertainment", "amount": Decimal("40"), "currency": "BRL"},
            {"account": "Assets:Checking", "amount": None, "currency": None},
        ]
        txns = generate_series_transactions(
            series_type="recurring",
            series_id="split-ab",
            payee="Combo",
            narration="Auto balance",
            start_date=datetime.date(2025, 1, 1),
            count=1,
            postings_spec=spec,
            default_currency="BRL",
            beancount_file_path="t.bc",
        )
        txn = txns[0]
        assert len(txn.postings) == 3
        assert txn.postings[0].units.number == Decimal("60")
        assert txn.postings[1].units.number == Decimal("40")
        assert txn.postings[2].units is None  # auto-balance

    def test_last_installment_scales_proportionally(self) -> None:
        """last_installment_adjustment scales all explicit amounts proportionally."""
        spec = [
            {"account": "Expenses:Food", "amount": Decimal("60"), "currency": "BRL"},
            {"account": "Expenses:Entertainment", "amount": Decimal("40"), "currency": "BRL"},
            {"account": "Assets:Checking", "amount": Decimal("-100"), "currency": "BRL"},
        ]
        # Adjustment: last txn should total 110 instead of 100
        txns = generate_series_transactions(
            series_type="installment",
            series_id="split-adj",
            payee="Combo",
            narration="Scaled",
            start_date=datetime.date(2025, 1, 1),
            count=2,
            postings_spec=spec,
            default_currency="BRL",
            beancount_file_path="t.bc",
            last_installment_adjustment=Decimal("110"),
        )
        # First txn: normal amounts
        assert txns[0].postings[0].units.number == Decimal("60")
        assert txns[0].postings[1].units.number == Decimal("40")
        assert txns[0].postings[2].units.number == Decimal("-100")
        # Last txn: scaled by 110/100 (base_total = sum of positive = 60+40 = 100)
        # scale = 110/100 = 1.1; 60*1.1=66, 40*1.1=44, -100*1.1=-110
        assert txns[1].postings[0].units.number == Decimal("66.00")
        assert txns[1].postings[1].units.number == Decimal("44.00")
        assert txns[1].postings[2].units.number == Decimal("-110.00")

    def test_currency_falls_back_to_default(self) -> None:
        """Posting without explicit currency uses default_currency."""
        spec = [
            {"account": "Expenses:Food", "amount": Decimal("100"), "currency": None},
            {"account": "Assets:Checking", "amount": Decimal("-100"), "currency": None},
        ]
        txns = generate_series_transactions(
            series_type="recurring",
            series_id="fb",
            payee="P",
            narration="N",
            start_date=datetime.date(2025, 1, 1),
            count=1,
            postings_spec=spec,
            default_currency="USD",
            beancount_file_path="t.bc",
        )
        assert txns[0].postings[0].units.currency == "USD"
        assert txns[0].postings[1].units.currency == "USD"
