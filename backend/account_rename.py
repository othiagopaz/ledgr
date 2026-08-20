"""Account renaming — text-level rewrite across the whole ledger.

This is the ONE place in the codebase that writes ``.beancount`` files outside
``FavaLedger.file``, and it needs justifying against the hard rule in
``AGENTS.md``.

**Why not** ``FavaLedger.file.save_entry_slice``: that API rewrites one entry at
a time, each keyed by its own hash and sha256. Renaming an account touches every
directive that names it — on a real ledger that is ~930 postings spread over 8
files. Entry-by-entry that is (a) slow and (b) **not atomic**: a failure on the
400th write leaves the ledger half-renamed, which is worse than not starting.

**Why this is allowed anyway**: a rename changes account *names*, not amounts,
dates, or structure. No accounting is performed here — Beancount still owns the
accounting, exactly as ``docs/principles/beancount-first.md`` requires. What
this module owns is a textual substitution, and it earns the exception by being
safer than the alternative:

1. every affected file is backed up in memory before a single byte is written;
2. after writing, the ledger is re-parsed and checked for **new** errors;
3. if anything went wrong, all files are restored from the backup.

So the failure mode is "nothing happened", never "half renamed".

**The substring trap**: naive replacement of ``Assets:Investments:XP`` also hits
``Assets:Investments:XP:Bonds``. Real ledgers have such prefixes (4 of them
here), so every pattern is anchored on account-name boundaries. This exact bug
— ``CableTV`` → ``Credit-Card`` corrupting neighbouring names — has already
happened once during the spreadsheet migration.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

# Characters that may legitimately continue an account name. A match is only a
# whole account when it is not flanked by one of these — that is what stops
# `Assets:Investments:XP` from matching inside `Assets:Investments:XP:Bonds`.
_NAME_CHAR = r"[A-Za-z0-9\-]"


class RenameError(Exception):
    """Raised when a rename cannot be performed or had to be rolled back."""


@dataclass
class FileImpact:
    """How many replacements a single file would receive."""

    path: str
    occurrences: int


@dataclass
class RenamePlan:
    """What a rename would do, without doing it."""

    old_name: str
    new_name: str
    include_children: bool
    files: list[FileImpact] = field(default_factory=list)
    renamed_accounts: list[str] = field(default_factory=list)

    @property
    def total_occurrences(self) -> int:
        return sum(f.occurrences for f in self.files)

    def as_dict(self) -> dict:
        return {
            "old_name": self.old_name,
            "new_name": self.new_name,
            "include_children": self.include_children,
            "total_occurrences": self.total_occurrences,
            "file_count": len(self.files),
            "files": [{"path": f.path, "occurrences": f.occurrences} for f in self.files],
            "renamed_accounts": self.renamed_accounts,
        }


def _exact_pattern(name: str) -> re.Pattern[str]:
    """Match ``name`` only when it is a complete account name.

    Anchored so neither a longer parent nor a child segment matches:
    ``Assets:Bank:Nu`` will not match inside ``Assets:Bank:Nubank`` and
    ``Assets:Investments:XP`` will not match inside ``…:XP:Bonds``.
    """
    return re.compile(
        rf"(?<!{_NAME_CHAR})(?<!:){re.escape(name)}(?!{_NAME_CHAR})(?!:)"
    )


def _subtree_pattern(name: str) -> re.Pattern[str]:
    """Match ``name`` and every account nested beneath it.

    The trailing group keeps the child path so it can be carried over to the
    new parent: ``Assets:Investments:XP:Bonds`` → ``…:NewName:Bonds``.
    """
    return re.compile(
        rf"(?<!{_NAME_CHAR})(?<!:){re.escape(name)}((?::{_NAME_CHAR}+)*)(?!{_NAME_CHAR})"
    )


def ledger_files(main_file: Path) -> list[Path]:
    """Every file that makes up the ledger: the main file plus its includes.

    Reads the ``include`` directives textually rather than from a loaded
    ledger, so it also works when the ledger currently fails to parse (which is
    exactly when a rollback needs to find the files again).
    """
    seen: list[Path] = []
    queue = [main_file.resolve()]
    while queue:
        current = queue.pop(0)
        if current in seen or not current.exists():
            continue
        seen.append(current)
        for line in current.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped.startswith("include"):
                continue
            match = re.match(r'include\s+"([^"]+)"', stripped)
            if match:
                queue.append((current.parent / match.group(1)).resolve())
    return seen


def plan_rename(
    main_file: Path,
    old_name: str,
    new_name: str,
    *,
    include_children: bool = True,
    known_accounts: list[str] | None = None,
) -> RenamePlan:
    """Count what a rename would change, touching nothing."""
    pattern = _subtree_pattern(old_name) if include_children else _exact_pattern(old_name)

    plan = RenamePlan(
        old_name=old_name, new_name=new_name, include_children=include_children
    )

    for path in ledger_files(main_file):
        text = path.read_text(encoding="utf-8")
        count = len(pattern.findall(text))
        if count:
            plan.files.append(FileImpact(path=str(path), occurrences=count))

    if known_accounts:
        if include_children:
            plan.renamed_accounts = sorted(
                a for a in known_accounts
                if a == old_name or a.startswith(old_name + ":")
            )
        elif old_name in known_accounts:
            plan.renamed_accounts = [old_name]

    return plan


def _rewrite(text: str, old_name: str, new_name: str, include_children: bool) -> tuple[str, int]:
    """Return the rewritten text and how many replacements were made."""
    if include_children:
        pattern = _subtree_pattern(old_name)
        # Group 1 is the child path (possibly empty) and is preserved verbatim.
        return pattern.subn(lambda m: new_name + m.group(1), text)
    return _exact_pattern(old_name).subn(new_name, text)


def apply_rename(
    main_file: Path,
    old_name: str,
    new_name: str,
    *,
    include_children: bool = True,
    validate: "callable[[], list[str]] | None" = None,
) -> RenamePlan:
    """Rename an account across every ledger file, atomically.

    ``validate`` is called after writing and must return a list of error
    strings; a non-empty list triggers a full rollback. It is injected rather
    than imported so this module stays free of Fava/Beancount coupling and can
    be unit-tested on plain text.

    Raises ``RenameError`` (after restoring every file) if validation fails or
    any write errors out.
    """
    plan = plan_rename(
        main_file, old_name, new_name, include_children=include_children
    )
    if not plan.files:
        raise RenameError(f"Account '{old_name}' does not appear in any ledger file")

    targets = [Path(f.path) for f in plan.files]
    # Snapshot BEFORE the first write, so a rollback is always possible.
    backup: dict[Path, str] = {p: p.read_text(encoding="utf-8") for p in targets}

    def rollback() -> None:
        for path, original in backup.items():
            path.write_text(original, encoding="utf-8")

    try:
        for path in targets:
            rewritten, _ = _rewrite(
                backup[path], old_name, new_name, include_children
            )
            path.write_text(rewritten, encoding="utf-8")
    except OSError as exc:
        rollback()
        raise RenameError(f"Write failed, ledger restored: {exc}") from exc

    if validate is not None:
        try:
            errors = validate()
        except Exception as exc:  # a parse blow-up counts as failure
            rollback()
            raise RenameError(
                f"Ledger could not be parsed after rename, restored: {exc}"
            ) from exc
        if errors:
            rollback()
            preview = "; ".join(errors[:3])
            raise RenameError(
                f"Rename produced {len(errors)} ledger error(s), restored: {preview}"
            )

    return plan
