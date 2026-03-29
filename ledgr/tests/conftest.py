"""
Shared pytest fixtures for the Ledgr test suite.

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
def cashflow_ledger(cashflow_file: Path) -> FavaLedger:
    """A FavaLedger instance loaded from the cashflow fixture."""
    fava = FavaLedger(str(cashflow_file))
    fava.load_file()
    return fava
