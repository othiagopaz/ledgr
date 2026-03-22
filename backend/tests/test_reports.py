"""
Tests for the accounting reports — Income Statement, Balance Sheet, and series.

The key invariant (AGENTS.md §10): after ``cap_opt()``, the accounting
equation holds: ``Assets + Liabilities + Equity == 0`` (in Beancount's
sign convention where credit accounts are negative).
"""

from __future__ import annotations

import datetime
from decimal import Decimal

import pytest
from beancount.core import data, realization
from beancount.ops import summarize
from fava.core import FavaLedger

from cashflow import compute_cashflow, date_to_period
from serializers import (
    build_balance_tree,
    build_report_tree,
    decimal_to_report_number,
)


# ------------------------------------------------------------------
# Balance Sheet — accounting invariant
# ------------------------------------------------------------------


class TestBalanceSheet:
    @staticmethod
    def _compute_balance_sheet(ledger: FavaLedger, as_of_date: str | None = None) -> dict:
        """Compute balance sheet using the same logic as the router."""
        closed = summarize.cap_opt(ledger.all_entries, ledger.options)

        if as_of_date:
            cutoff = datetime.date.fromisoformat(as_of_date)
            closed = [e for e in closed if e.date <= cutoff]

        real_root = realization.realize(closed)

        def section_total(root_type: str) -> float:
            node = realization.get(real_root, root_type)
            if node is None:
                return 0.0
            bal = realization.compute_balance(node)
            total = Decimal(0)
            for pos in bal:
                total += pos.units.number
            return decimal_to_report_number(total)

        def build_section(root_type: str) -> list[dict]:
            node = realization.get(real_root, root_type)
            if node is None:
                return []
            account_balance: dict[str, Decimal] = {}
            for child in realization.iter_children(node):
                if child.account:
                    bal = realization.compute_balance(child)
                    for pos in bal:
                        account_balance[child.account] = (
                            account_balance.get(child.account, Decimal(0))
                            + pos.units.number
                        )
            return build_balance_tree(set(account_balance.keys()), account_balance)

        return {
            "assets": build_section("Assets"),
            "liabilities": build_section("Liabilities"),
            "equity": build_section("Equity"),
            "totals": {
                "assets": section_total("Assets"),
                "liabilities": section_total("Liabilities"),
                "equity": section_total("Equity"),
            },
        }

    def test_accounting_equation(self, ledger: FavaLedger) -> None:
        """The fundamental accounting invariant: A + L + E = 0.

        After ``cap_opt()`` closes Income/Expenses into Equity, the three
        permanent account types must sum to zero.
        """
        result = self._compute_balance_sheet(ledger)
        t = result["totals"]
        total = t["assets"] + t["liabilities"] + t["equity"]
        assert total == pytest.approx(0.0, abs=0.01), (
            f"Accounting equation violated: "
            f"A={t['assets']} + L={t['liabilities']} + E={t['equity']} = {total}"
        )

    def test_accounting_equation_cashflow_fixture(
        self, cashflow_ledger: FavaLedger
    ) -> None:
        """Invariant holds on a richer fixture too."""
        result = self._compute_balance_sheet(cashflow_ledger)
        t = result["totals"]
        total = t["assets"] + t["liabilities"] + t["equity"]
        assert total == pytest.approx(0.0, abs=0.01)

    def test_has_expected_sections(self, ledger: FavaLedger) -> None:
        result = self._compute_balance_sheet(ledger)
        assert "assets" in result
        assert "liabilities" in result
        assert "equity" in result
        assert "totals" in result

    def test_assets_tree_has_children(self, ledger: FavaLedger) -> None:
        result = self._compute_balance_sheet(ledger)
        assert len(result["assets"]) > 0

    def test_as_of_date_filters(self, ledger: FavaLedger) -> None:
        full = self._compute_balance_sheet(ledger)
        partial = self._compute_balance_sheet(ledger, as_of_date="2024-01-31")
        assert partial["totals"]["assets"] != full["totals"]["assets"]

    def test_balance_sheet_node_shape(self, ledger: FavaLedger) -> None:
        result = self._compute_balance_sheet(ledger)
        for node in result["assets"]:
            assert "name" in node
            assert "balance" in node
            assert "children" in node


# ------------------------------------------------------------------
# Income Statement
# ------------------------------------------------------------------


class TestIncomeStatement:
    @staticmethod
    def _compute_income_statement(
        ledger: FavaLedger,
        from_date: str | None = None,
        to_date: str | None = None,
        interval: str = "monthly",
    ) -> dict:
        """Compute income statement using the same logic as the router."""
        begin = datetime.date.fromisoformat(from_date) if from_date else None
        end = datetime.date.fromisoformat(to_date) if to_date else None

        txn_dates = [
            e.date for e in ledger.all_entries
            if isinstance(e, data.Transaction)
        ]
        if not txn_dates:
            return {"income": [], "expenses": [], "periods": [], "net_income": {}}

        if begin is None:
            begin = min(txn_dates)
        if end is None:
            end = max(txn_dates) + datetime.timedelta(days=1)
        else:
            end = end + datetime.timedelta(days=1)

        clamped, _ = summarize.clamp_opt(
            ledger.all_entries, begin, end, ledger.options
        )

        txns = [e for e in clamped if isinstance(e, data.Transaction)]
        account_period: dict[str, dict[str, Decimal]] = {}
        periods_set: set[str] = set()

        for txn in txns:
            period = date_to_period(txn.date, interval)
            periods_set.add(period)
            for p in txn.postings:
                if p.units is None:
                    continue
                acct_type = p.account.split(":")[0]
                if acct_type not in ("Income", "Expenses"):
                    continue
                if p.account not in account_period:
                    account_period[p.account] = {}
                account_period[p.account][period] = (
                    account_period[p.account].get(period, Decimal(0))
                    + p.units.number
                )

        periods = sorted(periods_set)

        def _build_tree(root_type: str, negate: bool = False) -> list[dict]:
            accts = {a for a in account_period if a.startswith(root_type + ":")}
            if root_type in account_period:
                accts.add(root_type)
            return build_report_tree(accts, account_period, periods, negate)

        net_income: dict[str, float] = {}
        for period in periods:
            inc = sum(
                float(-account_period[a].get(period, Decimal(0)))
                for a in account_period if a.startswith("Income")
            )
            exp = sum(
                float(account_period[a].get(period, Decimal(0)))
                for a in account_period if a.startswith("Expenses")
            )
            net_income[period] = round(inc - exp, 2)

        return {
            "income": _build_tree("Income", negate=True),
            "expenses": _build_tree("Expenses"),
            "periods": periods,
            "net_income": net_income,
        }

    def test_has_expected_sections(self, ledger: FavaLedger) -> None:
        result = self._compute_income_statement(ledger)
        assert "income" in result
        assert "expenses" in result
        assert "periods" in result
        assert "net_income" in result

    def test_has_periods(self, ledger: FavaLedger) -> None:
        result = self._compute_income_statement(ledger)
        assert len(result["periods"]) > 0

    def test_date_filtering(self, ledger: FavaLedger) -> None:
        result = self._compute_income_statement(
            ledger, from_date="2024-01-01", to_date="2024-01-31"
        )
        assert all(p.startswith("2024-01") for p in result["periods"])

    def test_net_income_is_number(self, ledger: FavaLedger) -> None:
        result = self._compute_income_statement(ledger)
        for period in result["periods"]:
            assert isinstance(result["net_income"][period], (int, float))

    def test_income_statement_node_shape(self, ledger: FavaLedger) -> None:
        result = self._compute_income_statement(ledger)
        for node in result["income"]:
            assert "name" in node
            assert "totals" in node
            assert "total" in node
            assert "children" in node


# ------------------------------------------------------------------
# Series
# ------------------------------------------------------------------


class TestSeries:
    def test_income_expense_series(self, ledger: FavaLedger) -> None:
        txns = [e for e in ledger.all_entries if isinstance(e, data.Transaction)]
        buckets: dict[str, dict[str, Decimal]] = {}
        for txn in txns:
            period = date_to_period(txn.date, "monthly")
            if period not in buckets:
                buckets[period] = {"income": Decimal(0), "expenses": Decimal(0)}
            for p in txn.postings:
                if p.units is None:
                    continue
                if p.account.startswith("Income"):
                    buckets[period]["income"] += -p.units.number
                elif p.account.startswith("Expenses"):
                    buckets[period]["expenses"] += p.units.number

        result = [
            {
                "period": period,
                "income": decimal_to_report_number(buckets[period]["income"]),
                "expenses": decimal_to_report_number(buckets[period]["expenses"]),
            }
            for period in sorted(buckets)
        ]
        assert len(result) > 0
        for point in result:
            assert isinstance(point["income"], (int, float))
            assert isinstance(point["expenses"], (int, float))

    def test_account_balance_series(self, ledger: FavaLedger) -> None:
        # Just verify the computation logic works
        txns = sorted(
            [e for e in ledger.all_entries if isinstance(e, data.Transaction)],
            key=lambda t: t.date,
        )
        running = Decimal(0)
        for txn in txns:
            for p in txn.postings:
                if p.account == "Assets:Checking" and p.units is not None:
                    running += p.units.number

        assert running != 0  # Should have a non-zero balance

    def test_net_worth_series(self, ledger: FavaLedger) -> None:
        txns = sorted(
            [e for e in ledger.all_entries if isinstance(e, data.Transaction)],
            key=lambda t: t.date,
        )
        assets = Decimal(0)
        for txn in txns:
            for p in txn.postings:
                if p.units is None:
                    continue
                if p.account.startswith("Assets"):
                    assets += p.units.number

        assert assets != 0


# ------------------------------------------------------------------
# Cashflow (via cashflow.py module)
# ------------------------------------------------------------------


class TestCashflowViaModule:
    def test_cashflow_statement(self, cashflow_ledger: FavaLedger) -> None:
        result = compute_cashflow(cashflow_ledger.all_entries)
        assert "periods" in result
        assert "operating" in result
        assert "investing" in result
        assert "financing" in result
        assert "transfers" in result
