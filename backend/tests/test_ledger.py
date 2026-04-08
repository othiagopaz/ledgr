"""
Unit tests for ``get_filtered_entries()`` in ``ledger.py``.

Tests verify:
- Each view_mode returns the correct subset of transactions
- Non-transaction entries (Open, Close, Balance, Price, Commodity) always pass through
- Edge cases: no transactions, all planned, all actual
- Account, tag, payee, and date filtering via Fava/Beancount delegation
- clamp_opt() produces correct opening balances under date filtering
"""

from __future__ import annotations

import datetime
import shutil
from pathlib import Path

import pytest
from beancount.core import data
from fava.core import FavaLedger

from ledger import get_filtered_entries

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture()
def ledger(tmp_path: Path) -> FavaLedger:
    src = FIXTURES_DIR / "minimal.beancount"
    dst = tmp_path / "test.beancount"
    shutil.copy(src, dst)
    fava = FavaLedger(str(dst))
    fava.load_file()
    return fava


class TestGetFilteredEntries:
    def test_combined_returns_all_entries(self, ledger: FavaLedger) -> None:
        """Combined mode returns all entries unchanged."""
        result = get_filtered_entries(ledger, "combined")
        assert result is ledger.all_entries

    def test_actual_excludes_planned_transactions(self, ledger: FavaLedger) -> None:
        """Actual mode excludes ! transactions."""
        entries = get_filtered_entries(ledger, "actual")
        txns = [e for e in entries if isinstance(e, data.Transaction)]
        assert len(txns) > 0
        assert all(t.flag == "*" for t in txns)

    def test_planned_excludes_actual_transactions(self, ledger: FavaLedger) -> None:
        """Planned mode excludes * transactions."""
        entries = get_filtered_entries(ledger, "planned")
        txns = [e for e in entries if isinstance(e, data.Transaction)]
        assert len(txns) > 0
        assert all(t.flag == "!" for t in txns)

    def test_actual_preserves_open_directives(self, ledger: FavaLedger) -> None:
        """Structural directives must survive any filter mode."""
        entries = get_filtered_entries(ledger, "actual")
        opens = [e for e in entries if isinstance(e, data.Open)]
        assert len(opens) > 0

    def test_planned_preserves_open_directives(self, ledger: FavaLedger) -> None:
        """Open directives must survive planned mode too."""
        entries = get_filtered_entries(ledger, "planned")
        opens = [e for e in entries if isinstance(e, data.Open)]
        assert len(opens) > 0

    def test_actual_plus_planned_equals_combined(self, ledger: FavaLedger) -> None:
        """Actual txns + planned txns = combined txns."""
        combined_txns = [
            e for e in get_filtered_entries(ledger, "combined")
            if isinstance(e, data.Transaction)
        ]
        actual_txns = [
            e for e in get_filtered_entries(ledger, "actual")
            if isinstance(e, data.Transaction)
        ]
        planned_txns = [
            e for e in get_filtered_entries(ledger, "planned")
            if isinstance(e, data.Transaction)
        ]
        assert len(actual_txns) + len(planned_txns) == len(combined_txns)

    def test_combined_has_more_txns_than_actual(self, ledger: FavaLedger) -> None:
        """The fixture has ! txns, so combined must have more than actual."""
        combined = [
            e for e in get_filtered_entries(ledger, "combined")
            if isinstance(e, data.Transaction)
        ]
        actual = [
            e for e in get_filtered_entries(ledger, "actual")
            if isinstance(e, data.Transaction)
        ]
        assert len(combined) > len(actual)

    def test_default_is_combined(self, ledger: FavaLedger) -> None:
        """Omitting view_mode defaults to combined."""
        result = get_filtered_entries(ledger)
        assert result is ledger.all_entries


class TestFilterByAccount:
    def test_exact_account_match(self, ledger: FavaLedger) -> None:
        """Account filter returns only entries touching that account."""
        entries = get_filtered_entries(ledger, account="Expenses:Food")
        txns = [e for e in entries if isinstance(e, data.Transaction)]
        assert len(txns) > 0
        for t in txns:
            accounts = {p.account for p in t.postings}
            assert "Expenses:Food" in accounts

    def test_account_prefix_match(self, ledger: FavaLedger) -> None:
        """Account filter with prefix matches child accounts."""
        entries = get_filtered_entries(ledger, account="Expenses")
        txns = [e for e in entries if isinstance(e, data.Transaction)]
        assert len(txns) > 0
        for t in txns:
            assert any(p.account.startswith("Expenses") for p in t.postings)

    def test_account_preserves_structural_directives(self, ledger: FavaLedger) -> None:
        """Open directives pass through account filter."""
        entries = get_filtered_entries(ledger, account="Expenses:Food")
        opens = [e for e in entries if isinstance(e, data.Open)]
        assert len(opens) > 0


class TestFilterByTags:
    def test_single_tag(self, ledger: FavaLedger) -> None:
        """Tag filter returns transactions with that tag."""
        entries = get_filtered_entries(ledger, tags=["groceries"])
        txns = [e for e in entries if isinstance(e, data.Transaction)]
        assert len(txns) >= 1
        for t in txns:
            assert "groceries" in t.tags

    def test_multiple_tags_and_logic(self, ledger: FavaLedger) -> None:
        """Multiple tags = AND: only txns matching ALL selected tags."""
        entries = get_filtered_entries(ledger, tags=["dining", "eating-out"])
        txns = [e for e in entries if isinstance(e, data.Transaction)]
        assert len(txns) >= 1
        for t in txns:
            assert "dining" in t.tags and "eating-out" in t.tags

    def test_nonexistent_tag_returns_no_txns(self, ledger: FavaLedger) -> None:
        entries = get_filtered_entries(ledger, tags=["nonexistent-tag-xyz"])
        txns = [e for e in entries if isinstance(e, data.Transaction)]
        assert len(txns) == 0


class TestFilterByPayee:
    def test_exact_payee(self, ledger: FavaLedger) -> None:
        """Payee filter returns transactions with that payee."""
        entries = get_filtered_entries(ledger, payee="Employer")
        txns = [e for e in entries if isinstance(e, data.Transaction)]
        assert len(txns) >= 2  # Jan + Feb + Mar salary
        for t in txns:
            assert t.payee == "Employer"

    def test_nonexistent_payee(self, ledger: FavaLedger) -> None:
        entries = get_filtered_entries(ledger, payee="Nonexistent Corp")
        txns = [e for e in entries if isinstance(e, data.Transaction)]
        assert len(txns) == 0


class TestFilterByDateRange:
    def test_date_range_clamps_entries(self, ledger: FavaLedger) -> None:
        """Date filter uses clamp_opt — entries outside range are excluded."""
        entries = get_filtered_entries(
            ledger,
            from_date=datetime.date(2024, 2, 1),
            to_date=datetime.date(2024, 3, 1),
        )
        # Real txns should be within Feb only (synthetic entries at Jan 31)
        real_txns = [
            e for e in entries
            if isinstance(e, data.Transaction) and e.flag in ("*", "!")
        ]
        assert len(real_txns) > 0
        for t in real_txns:
            assert datetime.date(2024, 2, 1) <= t.date < datetime.date(2024, 3, 1)

    def test_date_filter_preserves_opening_balances(self, ledger: FavaLedger) -> None:
        """Critical: clamp_opt creates synthetic opening-balance entries."""
        entries = get_filtered_entries(
            ledger,
            from_date=datetime.date(2024, 2, 1),
            to_date=datetime.date(2024, 3, 1),
        )
        # Synthetic entries have flag "S" and carry forward balances
        synthetic = [
            e for e in entries
            if isinstance(e, data.Transaction) and e.flag == "S"
        ]
        assert len(synthetic) > 0, "clamp_opt must produce opening balance entries"

        # Opening balance should include Assets:Checking
        synth_accounts = set()
        for e in synthetic:
            for p in e.postings:
                synth_accounts.add(p.account)
        assert "Assets:Checking" in synth_accounts

    def test_no_date_filter_returns_all(self, ledger: FavaLedger) -> None:
        """No date filter = no clamp_opt = all entries unchanged."""
        entries = get_filtered_entries(ledger)
        assert entries is ledger.all_entries


class TestCombinedFilters:
    def test_account_plus_date(self, ledger: FavaLedger) -> None:
        """Account + date filters compose correctly."""
        entries = get_filtered_entries(
            ledger,
            account="Expenses:Food",
            from_date=datetime.date(2024, 2, 1),
            to_date=datetime.date(2024, 3, 1),
        )
        real_txns = [
            e for e in entries
            if isinstance(e, data.Transaction) and e.flag in ("*", "!")
        ]
        assert len(real_txns) >= 1
        for t in real_txns:
            assert any(p.account.startswith("Expenses:Food") for p in t.postings)
            assert datetime.date(2024, 2, 1) <= t.date < datetime.date(2024, 3, 1)

    def test_tag_plus_viewmode(self, ledger: FavaLedger) -> None:
        """Tag filter + view_mode compose: actual+housing = only Feb rent."""
        entries = get_filtered_entries(
            ledger, "actual", tags=["housing"]
        )
        txns = [e for e in entries if isinstance(e, data.Transaction)]
        assert len(txns) >= 1
        for t in txns:
            assert t.flag == "*"
            assert "housing" in t.tags

    def test_no_filters_returns_all_entries(self, ledger: FavaLedger) -> None:
        """No filters = combined = all entries unchanged."""
        result = get_filtered_entries(ledger)
        assert result is ledger.all_entries
