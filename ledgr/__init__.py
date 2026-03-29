"""
Ledgr — reusable business logic for personal accounting.

This package contains all custom accounting logic, serializers, and data
access functions.  It is framework-agnostic and can be consumed by the
FastAPI backend, a TUI, CLI tools, or any other Python consumer.
"""

from ledgr.ledger import init_ledger, get_ledger
