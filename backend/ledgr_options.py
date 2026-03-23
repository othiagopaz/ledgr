"""
Ledgr-specific options parsed from ``custom`` directives in the ``.beancount`` file.

Usage in ``.beancount``::

    2024-01-01 custom "ledgr-option" "investment_account_prefixes" "Assets:Investments Assets:Broker"

Follows the same pattern as Fava's ``fava-option`` directives
(see ``fava/core/fava_options.py``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Iterable
    from beancount.core import data


# Default prefixes for accounts considered "investment" in the Cash Flow
# classifier.  Override with ledgr-option investment_account_prefixes.
DEFAULT_INVESTMENT_PREFIXES: tuple[str, ...] = (
    "Assets:Investments",
    "Assets:Broker",
)


@dataclass
class LedgrOptions:
    """Options for Ledgr parsed from the .beancount file."""

    investment_account_prefixes: tuple[str, ...] = DEFAULT_INVESTMENT_PREFIXES


def parse_ledgr_options(entries: Iterable[data.Directive]) -> LedgrOptions:
    """Parse ``custom "ledgr-option"`` entries from the ledger.

    Unrecognised option names are silently ignored (forward-compatible).
    """
    options = LedgrOptions()

    for entry in entries:
        if getattr(entry, "type", None) != "ledgr-option":
            continue
        values = getattr(entry, "values", None)
        if not values or len(values) < 2:
            continue

        name = values[0].value if hasattr(values[0], "value") else str(values[0])
        raw = values[1].value if hasattr(values[1], "value") else str(values[1])

        if name == "investment_account_prefixes":
            prefixes = tuple(p.strip() for p in raw.split() if p.strip())
            if prefixes:
                options.investment_account_prefixes = prefixes

    return options
