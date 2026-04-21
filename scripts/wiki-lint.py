#!/usr/bin/env python3
"""Wiki linter for Ledgr.

Enforces the conventions defined in AGENTS.md and docs/index.md.

Checks
------
1. AGENTS.md size (<= 120 lines; warn otherwise).
2. Every page under `docs/` (except `plans/`) has YAML frontmatter with
   `type` (error if missing) and `last_updated` (warn if missing,
   error if not YYYY-MM-DD, warn if older than 90 days).
3. Page size: warn if > 500 lines (split) or < 30 lines (merge). `log.md`
   is exempt from the max; `index.md` and `log.md` are exempt from the min.
4. Broken links: every relative markdown link inside `docs/` or in
   `AGENTS.md` must resolve. Links to pages listed in
   `docs/index.md → "Pages referenced but not yet migrated"` are allowed.
5. Orphan pages: every `.md` in `docs/` (except `index.md`, `log.md`,
   and anything under `plans/`) must appear as a link in `docs/index.md`.
6. Duplicate H2 headings across pages (contradiction risk — warn).
7. Stale code references: backticked paths like `backend/foo.py` or
   `frontend/src/foo.ts` that do not exist on disk — warn.

Exit codes
----------
    0 — clean
    1 — errors (or warnings with --strict)
    2 — warnings only (without --strict)

Usage
-----
    python scripts/wiki-lint.py
    python scripts/wiki-lint.py --strict
"""
from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DOCS = REPO / "docs"
AGENTS_MD = REPO / "AGENTS.md"
INDEX_MD = DOCS / "index.md"

MAX_AGENTS_LINES = 120
MAX_PAGE_LINES = 500
MIN_PAGE_LINES = 30
STALE_DAYS = 90

FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)
LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
H2_RE = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
CODE_REF_RE = re.compile(
    r"`((?:backend|frontend/src)/[A-Za-z0-9_./\-]+\.(?:py|ts|tsx|js|jsx|css))`"
)

# Directories under docs/ whose contents are drafts / not evergreen.
DRAFT_AREAS = {"plans"}

# H2 headings that commonly repeat for structural reasons — skip in dup check.
IGNORED_DUP_HEADINGS = {
    "purpose", "rules", "architecture", "usage", "state", "overview",
    "conventions", "tests", "testing", "what this means in practice",
    "hard rules", "what not to do", "how to use", "examples", "why",
    "how to navigate", "wiki conventions", "reference", "log",
    # Structural area dividers (not contradictions)
    "backend", "frontend", "docs", "features", "brand", "principles",
    "related", "pr checklist",
}


def parse_frontmatter(text: str) -> dict[str, str] | None:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return None
    fields: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fields[k.strip()] = v.strip()
    return fields


def read_planned_pages(index_text: str) -> set[str]:
    """Extract docs-relative paths from the migration TODO section."""
    m = re.search(
        r"##\s+Pages referenced but not yet migrated(.+?)(?=\n##\s|\Z)",
        index_text,
        re.DOTALL,
    )
    if not m:
        return set()
    planned: set[str] = set()
    for line in m.group(1).splitlines():
        bullet = re.match(r"\s*[-*]\s+`([^`]+)`", line)
        if bullet:
            planned.add(bullet.group(1).strip())
    return planned


def relative_to_docs(path: Path) -> str:
    return path.relative_to(DOCS).as_posix()


def is_draft(rel: str) -> bool:
    return rel.split("/", 1)[0] in DRAFT_AREAS


def collect_docs_files() -> list[Path]:
    return sorted(p for p in DOCS.rglob("*.md") if p.is_file())


def resolve_link(source: Path, target: str) -> Path | None:
    if target.startswith(("http://", "https://", "mailto:", "#")):
        return None
    target_clean = target.split("#")[0]
    if not target_clean:
        return None
    return (source.parent / target_clean).resolve()


def extract_links(text: str) -> list[tuple[str, str]]:
    return list(LINK_RE.findall(text))


def to_docs_relative(resolved: Path) -> str | None:
    try:
        return resolved.relative_to(DOCS).as_posix()
    except ValueError:
        return None


def check_agents_md(
    errors: list[str], warnings: list[str], planned: set[str]
) -> None:
    if not AGENTS_MD.exists():
        errors.append("AGENTS.md is missing")
        return
    text = AGENTS_MD.read_text(encoding="utf-8")
    n = len(text.splitlines())
    if n > MAX_AGENTS_LINES:
        warnings.append(
            f"AGENTS.md: {n} lines (>{MAX_AGENTS_LINES}); extract detail into docs/"
        )
    for _, target in extract_links(text):
        resolved = resolve_link(AGENTS_MD, target)
        if resolved is None or resolved.exists():
            continue
        rel = to_docs_relative(resolved)
        if rel is not None and rel in planned:
            continue
        warnings.append(f"AGENTS.md: broken link → {target}")


def check_page_frontmatter_and_size(
    rel: str, text: str, errors: list[str], warnings: list[str]
) -> None:
    if is_draft(rel):
        return
    fm = parse_frontmatter(text)
    if fm is None:
        errors.append(f"{rel}: missing YAML frontmatter")
    else:
        if "type" not in fm:
            errors.append(f"{rel}: frontmatter missing `type`")
        last = fm.get("last_updated")
        if not last:
            warnings.append(f"{rel}: frontmatter missing `last_updated`")
        else:
            try:
                d = datetime.strptime(last, "%Y-%m-%d").date()
                age = (date.today() - d).days
                if age > STALE_DAYS:
                    warnings.append(
                        f"{rel}: last_updated {age} days ago (>{STALE_DAYS})"
                    )
            except ValueError:
                errors.append(
                    f"{rel}: last_updated not YYYY-MM-DD: {last!r}"
                )
    n = len(text.splitlines())
    if rel != "log.md" and n > MAX_PAGE_LINES:
        warnings.append(
            f"{rel}: {n} lines (>{MAX_PAGE_LINES}); consider splitting"
        )
    if rel not in {"index.md", "log.md"} and n < MIN_PAGE_LINES:
        warnings.append(
            f"{rel}: {n} lines (<{MIN_PAGE_LINES}); consider merging into a sibling"
        )


def check_broken_links(
    path: Path, rel: str, text: str, planned: set[str], warnings: list[str]
) -> None:
    for _, target in extract_links(text):
        resolved = resolve_link(path, target)
        if resolved is None or resolved.exists():
            continue
        resolved_rel = to_docs_relative(resolved)
        if resolved_rel is not None and resolved_rel in planned:
            continue
        warnings.append(f"{rel}: broken link → {target}")


def check_orphans(
    docs_files: list[Path], index_text: str, errors: list[str]
) -> None:
    indexed: set[str] = set()
    for _, target in extract_links(index_text):
        if target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        target_clean = target.split("#")[0]
        if not target_clean:
            continue
        resolved = (INDEX_MD.parent / target_clean).resolve()
        rel = to_docs_relative(resolved)
        if rel is not None:
            indexed.add(rel)

    for p in docs_files:
        rel = relative_to_docs(p)
        if rel in {"index.md", "log.md"} or is_draft(rel):
            continue
        if rel not in indexed:
            errors.append(f"{rel}: not registered in docs/index.md")


def check_duplicate_h2(
    docs_files: list[Path], warnings: list[str]
) -> None:
    h2_map: dict[str, list[str]] = defaultdict(list)
    for p in docs_files:
        rel = relative_to_docs(p)
        if is_draft(rel) or rel in {"index.md", "log.md"}:
            continue
        text = p.read_text(encoding="utf-8")
        for m in H2_RE.finditer(text):
            heading = m.group(1).strip().lower()
            if heading in IGNORED_DUP_HEADINGS:
                continue
            h2_map[heading].append(rel)
    for heading, pages in h2_map.items():
        if len(pages) > 1:
            warnings.append(
                f"duplicate H2 `## {heading}` in {len(pages)} pages: "
                f"{', '.join(pages)}"
            )


def check_stale_code_refs(
    docs_files: list[Path], warnings: list[str]
) -> None:
    for p in docs_files:
        rel = relative_to_docs(p)
        if is_draft(rel):
            continue
        text = p.read_text(encoding="utf-8")
        for m in CODE_REF_RE.finditer(text):
            ref = m.group(1).rstrip(".,:;)")
            if not (REPO / ref).exists():
                warnings.append(f"{rel}: references missing path `{ref}`")


def main() -> int:
    parser = argparse.ArgumentParser(description="Lint the Ledgr wiki.")
    parser.add_argument(
        "--strict", action="store_true",
        help="Treat warnings as errors (intended for CI).",
    )
    args = parser.parse_args()

    errors: list[str] = []
    warnings: list[str] = []

    if not DOCS.exists():
        print("docs/ directory is missing", file=sys.stderr)
        return 1

    docs_files = collect_docs_files()

    if not INDEX_MD.exists():
        errors.append("docs/index.md is missing")
        index_text = ""
        planned: set[str] = set()
    else:
        index_text = INDEX_MD.read_text(encoding="utf-8")
        planned = read_planned_pages(index_text)

    check_agents_md(errors, warnings, planned)

    for p in docs_files:
        rel = relative_to_docs(p)
        text = p.read_text(encoding="utf-8")
        if is_draft(rel):
            continue
        check_page_frontmatter_and_size(rel, text, errors, warnings)
        check_broken_links(p, rel, text, planned, warnings)

    check_orphans(docs_files, index_text, errors)
    check_duplicate_h2(docs_files, warnings)
    check_stale_code_refs(docs_files, warnings)

    def print_section(title: str, items: list[str]) -> None:
        if not items:
            return
        print(f"\n{title} ({len(items)})")
        print("-" * (len(title) + 5))
        for it in items:
            print(f"  {it}")

    print_section("ERRORS", errors)
    print_section("WARNINGS", warnings)

    if not errors and not warnings:
        print("wiki-lint: clean.")
        return 0

    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s).")
    if errors:
        return 1
    if args.strict and warnings:
        return 1
    return 2


if __name__ == "__main__":
    sys.exit(main())
