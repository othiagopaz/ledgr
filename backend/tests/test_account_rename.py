"""Tests for account renaming.

The rename path writes ledger files directly, so these tests lean on the real
thing: a fixture split across a main file and an ``include``, renamed for real,
then re-parsed by Beancount to prove the result still loads.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from beancount import loader

from account_rename import (
    RenameError,
    apply_rename,
    ledger_files,
    plan_rename,
)


# ------------------------------------------------------------------
# Boundary anchoring — the substring trap
# ------------------------------------------------------------------

def test_exact_rename_leaves_children_alone(multifile_file: Path) -> None:
    """Renaming a parent with include_children=False must not touch its children."""
    apply_rename(
        multifile_file, "Assets:Invest:XP", "Assets:Invest:Rico",
        include_children=False,
    )
    text = multifile_file.read_text()
    assert "open Assets:Invest:Rico  " in text or "open Assets:Invest:Rico\n" in text
    # The child keeps its old parent path.
    assert "Assets:Invest:XP:Bonds" in text
    assert "Assets:Invest:Rico:Bonds" not in text


def test_rename_does_not_touch_lookalike_account(multifile_file: Path) -> None:
    """`Assets:Invest:XP` must not match inside `Assets:Invest:XPTruco`.

    This is the bug that corrupted account names during the sheet migration:
    a substring replace of a short name mangles every longer name containing it.
    """
    apply_rename(multifile_file, "Assets:Invest:XP", "Assets:Invest:Rico")
    text = multifile_file.read_text()
    assert "Assets:Invest:XPTruco" in text
    assert "Assets:Invest:RicoTruco" not in text


def test_subtree_rename_carries_children(multifile_file: Path) -> None:
    """With include_children, the child path is preserved under the new parent."""
    apply_rename(multifile_file, "Assets:Invest:XP", "Assets:Invest:Rico")
    text = multifile_file.read_text()
    assert "Assets:Invest:Rico:Bonds" in text
    assert "Assets:Invest:XP:Bonds" not in text


def test_rename_leaf_does_not_touch_parent(multifile_file: Path) -> None:
    """Renaming a child must leave the parent name intact."""
    apply_rename(multifile_file, "Assets:Invest:XP:Bonds", "Assets:Invest:XP:Fixed")
    text = multifile_file.read_text()
    assert "open Assets:Invest:XP " in text or "open Assets:Invest:XP\n" in text
    assert "Assets:Invest:XP:Fixed" in text


# ------------------------------------------------------------------
# Cross-file reach
# ------------------------------------------------------------------

def test_ledger_files_finds_includes(multifile_file: Path) -> None:
    files = ledger_files(multifile_file)
    names = sorted(f.name for f in files)
    assert names == ["history.beancount", "multifile.beancount"]


def test_rename_rewrites_included_file(multifile_file: Path) -> None:
    """The include is where a half-done rename hides — check it explicitly."""
    included = multifile_file.parent / "included" / "history.beancount"
    assert "Assets:Bank:Main" in included.read_text()

    apply_rename(multifile_file, "Assets:Bank:Main", "Assets:Bank:Primary")

    assert "Assets:Bank:Primary" in included.read_text()
    assert "Assets:Bank:Main" not in included.read_text()


def test_renamed_ledger_still_parses(multifile_file: Path) -> None:
    """The whole point: after a rename Beancount must load with no new errors."""
    apply_rename(multifile_file, "Assets:Bank:Main", "Assets:Bank:Primary")
    entries, errors, _ = loader.load_file(str(multifile_file))
    assert errors == []
    accounts = {
        p.account for e in entries if hasattr(e, "postings") for p in e.postings
    }
    assert "Assets:Bank:Primary" in accounts
    assert "Assets:Bank:Main" not in accounts


def test_rename_preserves_transaction_count(multifile_file: Path) -> None:
    before = len(loader.load_file(str(multifile_file))[0])
    apply_rename(multifile_file, "Assets:Bank:Main", "Assets:Bank:Primary")
    after = len(loader.load_file(str(multifile_file))[0])
    assert before == after


# ------------------------------------------------------------------
# Planning (dry run)
# ------------------------------------------------------------------

def test_plan_counts_both_files_without_writing(multifile_file: Path) -> None:
    original = multifile_file.read_text()
    plan = plan_rename(multifile_file, "Assets:Bank:Main", "Assets:Bank:Primary")

    assert len(plan.files) == 2, "main file and include both reference the account"
    assert plan.total_occurrences > 0
    assert multifile_file.read_text() == original, "dry run must not write"


def test_plan_lists_renamed_accounts(multifile_file: Path) -> None:
    known = ["Assets:Invest:XP", "Assets:Invest:XP:Bonds", "Assets:Invest:XPTruco"]
    plan = plan_rename(
        multifile_file, "Assets:Invest:XP", "Assets:Invest:Rico",
        include_children=True, known_accounts=known,
    )
    assert plan.renamed_accounts == ["Assets:Invest:XP", "Assets:Invest:XP:Bonds"]
    assert "Assets:Invest:XPTruco" not in plan.renamed_accounts


def test_plan_excludes_children_when_asked(multifile_file: Path) -> None:
    known = ["Assets:Invest:XP", "Assets:Invest:XP:Bonds"]
    plan = plan_rename(
        multifile_file, "Assets:Invest:XP", "Assets:Invest:Rico",
        include_children=False, known_accounts=known,
    )
    assert plan.renamed_accounts == ["Assets:Invest:XP"]


# ------------------------------------------------------------------
# Atomicity — the reason this module is allowed to write files
# ------------------------------------------------------------------

def test_failed_validation_restores_every_file(multifile_file: Path) -> None:
    """A rollback must leave both files byte-identical to how they started."""
    included = multifile_file.parent / "included" / "history.beancount"
    main_before = multifile_file.read_text()
    included_before = included.read_text()

    with pytest.raises(RenameError, match="restored"):
        apply_rename(
            multifile_file, "Assets:Bank:Main", "Assets:Bank:Primary",
            validate=lambda: ["boom: simulated ledger error"],
        )

    assert multifile_file.read_text() == main_before
    assert included.read_text() == included_before


def test_rollback_leaves_ledger_loadable(multifile_file: Path) -> None:
    with pytest.raises(RenameError):
        apply_rename(
            multifile_file, "Assets:Bank:Main", "Assets:Bank:Primary",
            validate=lambda: ["simulated"],
        )
    _, errors, _ = loader.load_file(str(multifile_file))
    assert errors == []


def test_validation_exception_also_rolls_back(multifile_file: Path) -> None:
    """If validation itself blows up, treat it as failure and restore."""
    main_before = multifile_file.read_text()

    def exploding_validate() -> list[str]:
        raise RuntimeError("parser crashed")

    with pytest.raises(RenameError, match="could not be parsed"):
        apply_rename(
            multifile_file, "Assets:Bank:Main", "Assets:Bank:Primary",
            validate=exploding_validate,
        )
    assert multifile_file.read_text() == main_before


def test_passing_validation_keeps_the_rename(multifile_file: Path) -> None:
    apply_rename(
        multifile_file, "Assets:Bank:Main", "Assets:Bank:Primary",
        validate=lambda: [],
    )
    assert "Assets:Bank:Primary" in multifile_file.read_text()


def test_unknown_account_raises(multifile_file: Path) -> None:
    with pytest.raises(RenameError, match="does not appear"):
        apply_rename(multifile_file, "Assets:Nope:Missing", "Assets:Nope:Other")
