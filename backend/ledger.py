"""
Thin FastAPI wrapper around ``ledgr.ledger``.

Re-exports ``get_ledger`` for use with ``Depends(get_ledger)`` in routers.
"""

from ledgr.ledger import get_ledger

__all__ = ["get_ledger"]
