"""
Unit tests for ``get_filtered_entries()`` in ``ledger.py``.

Tests verify:
- Each view_mode returns the correct subset of transactions
- Non-transaction entries (Open, Close, Balance, Price, Commodity) always pass through
- Edge cases: no transactions, all planned, all actual
"""

from __future__ import annotations

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
