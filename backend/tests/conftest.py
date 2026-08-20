"""
Shared pytest fixtures for the Ledgr backend test suite.

All tests use **real** FavaLedger instances pointed at fixture ``.beancount``
files — never mocks.  See AGENTS.md §10.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

import pytest
from fava.core import FavaLedger

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture()
def minimal_file(tmp_path: Path) -> Path:
    """Copy the minimal fixture into a temp directory and return the path.

    Using a copy ensures that mutation tests never corrupt the original
    fixture file.
    """
    src = FIXTURES_DIR / "minimal.beancount"
    dst = tmp_path / "minimal.beancount"
    shutil.copy(src, dst)
    return dst


@pytest.fixture()
def multicurrency_file(tmp_path: Path) -> Path:
    """Copy the multicurrency fixture into a temp directory."""
    src = FIXTURES_DIR / "multicurrency.beancount"
    dst = tmp_path / "multicurrency.beancount"
    shutil.copy(src, dst)
    return dst


@pytest.fixture()
def cashflow_file(tmp_path: Path) -> Path:
    """Copy the cashflow fixture into a temp directory."""
    src = FIXTURES_DIR / "cashflow.beancount"
    dst = tmp_path / "cashflow.beancount"
    shutil.copy(src, dst)
    return dst


@pytest.fixture()
def multifile_file(tmp_path: Path) -> Path:
    """Copy the multifile fixture — main file plus its include — into a tmp dir.

    Account renaming has to reach into ``include``d files, so the fixture is
    deliberately split: the same accounts appear in both, and a rename that only
    rewrites the main file leaves the ledger broken.
    """
    src = FIXTURES_DIR / "multifile.beancount"
    dst = tmp_path / "multifile.beancount"
    shutil.copy(src, dst)
    (tmp_path / "included").mkdir(exist_ok=True)
    shutil.copy(
        FIXTURES_DIR / "included" / "history.beancount",
        tmp_path / "included" / "history.beancount",
    )
    return dst


@pytest.fixture()
def multifile_ledger(multifile_file: Path) -> FavaLedger:
    """A FavaLedger instance loaded from the multifile fixture."""
    fava = FavaLedger(str(multifile_file))
    fava.load_file()
    return fava


@pytest.fixture()
def ledger(minimal_file: Path) -> FavaLedger:
    """A FavaLedger instance loaded from the minimal fixture."""
    fava = FavaLedger(str(minimal_file))
    fava.load_file()
    return fava


@pytest.fixture()
def multicurrency_ledger(multicurrency_file: Path) -> FavaLedger:
    """A FavaLedger instance loaded from the multicurrency fixture."""
    fava = FavaLedger(str(multicurrency_file))
    fava.load_file()
    return fava


@pytest.fixture()
def series_file(tmp_path: Path) -> Path:
    """Copy the series fixture into a temp directory."""
    src = FIXTURES_DIR / "series.beancount"
    dst = tmp_path / "series.beancount"
    shutil.copy(src, dst)
    return dst


@pytest.fixture()
def series_ledger(series_file: Path) -> FavaLedger:
    """A FavaLedger instance loaded from the series fixture."""
    fava = FavaLedger(str(series_file))
    fava.load_file()
    return fava


@pytest.fixture()
def cashflow_ledger(cashflow_file: Path) -> FavaLedger:
    """A FavaLedger instance loaded from the cashflow fixture."""
    fava = FavaLedger(str(cashflow_file))
    fava.load_file()
    return fava


@pytest.fixture()
def budget_file(tmp_path: Path) -> Path:
    """Copy the budget fixture into a temp directory."""
    src = FIXTURES_DIR / "budget.beancount"
    dst = tmp_path / "budget.beancount"
    shutil.copy(src, dst)
    return dst


@pytest.fixture()
def budget_ledger(budget_file: Path) -> FavaLedger:
    """A FavaLedger instance loaded from the budget fixture."""
    fava = FavaLedger(str(budget_file))
    fava.load_file()
    return fava
