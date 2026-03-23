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
    attach_other_currencies_to_balance_tree,
    attach_other_currencies_to_report_tree,
    build_balance_tree,
    build_report_tree,
    decimal_to_report_number,
    format_other_balances,
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
        oc = ledger.options["operating_currency"][0]

        def section_total(root_type: str) -> float:
            node = realization.get(real_root, root_type)
            if node is None:
                return 0.0
            bal = realization.compute_balance(node)
            total = Decimal(0)
            for pos in bal:
                if pos.units.currency == oc:
                    total += pos.units.number
            return decimal_to_report_number(total)

        def section_other_total(root_type: str) -> list[dict]:
            node = realization.get(real_root, root_type)
            if node is None:
                return []
            bal = realization.compute_balance(node)
            by_curr: dict[str, Decimal] = {}
            for pos in bal:
                if pos.units.currency != oc:
                    c = pos.units.currency
                    by_curr[c] = by_curr.get(c, Decimal(0)) + pos.units.number
            return format_other_balances(by_curr)

        def build_section(root_type: str) -> list[dict]:
            node = realization.get(real_root, root_type)
            if node is None:
                return []
            account_balance: dict[str, Decimal] = {}
            account_balance_other: dict[str, dict[str, Decimal]] = {}
            for child in realization.iter_children(node):
                if child.account:
                    # Own postings only — build_balance_tree rolls up children
                    bal = child.balance
                    for pos in bal:
                        curr = pos.units.currency
                        if curr == oc:
                            account_balance[child.account] = (
                                account_balance.get(child.account, Decimal(0))
                                + pos.units.number
                            )
                        else:
                            if child.account not in account_balance_other:
                                account_balance_other[child.account] = {}
                            account_balance_other[child.account][curr] = (
                                account_balance_other[child.account].get(curr, Decimal(0))
                                + pos.units.number
                            )
            all_accts = set(account_balance.keys()) | set(account_balance_other.keys())
            tree = build_balance_tree(all_accts, account_balance)
            attach_other_currencies_to_balance_tree(tree, account_balance_other)
            return tree

        return {
            "assets": build_section("Assets"),
            "liabilities": build_section("Liabilities"),
            "equity": build_section("Equity"),
            "totals": {
                "assets": section_total("Assets"),
                "liabilities": section_total("Liabilities"),
                "equity": section_total("Equity"),
            },
            "operating_currency": oc,
            "other_totals": {
                "assets": section_other_total("Assets"),
                "liabilities": section_other_total("Liabilities"),
                "equity": section_other_total("Equity"),
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

        oc = ledger.options["operating_currency"][0]
        txns = [e for e in clamped if isinstance(e, data.Transaction)]
        account_period: dict[str, dict[str, Decimal]] = {}
        account_period_other: dict[str, dict[str, dict[str, Decimal]]] = {}
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
                curr = p.units.currency
                if curr == oc:
                    if p.account not in account_period:
                        account_period[p.account] = {}
                    account_period[p.account][period] = (
                        account_period[p.account].get(period, Decimal(0))
                        + p.units.number
                    )
                else:
                    if p.account not in account_period_other:
                        account_period_other[p.account] = {}
                    if period not in account_period_other[p.account]:
                        account_period_other[p.account][period] = {}
                    account_period_other[p.account][period][curr] = (
                        account_period_other[p.account][period].get(curr, Decimal(0))
                        + p.units.number
                    )

        periods = sorted(periods_set)
        all_accts = set(account_period.keys()) | set(account_period_other.keys())

        def _build_tree(root_type: str, negate: bool = False) -> list[dict]:
            accts = {a for a in all_accts if a.startswith(root_type + ":")}
            if root_type in all_accts:
                accts.add(root_type)
            return build_report_tree(accts, account_period, periods, negate)

        income_tree = _build_tree("Income", negate=True)
        expenses_tree = _build_tree("Expenses")
        attach_other_currencies_to_report_tree(
            income_tree, account_period_other, periods, negate=True,
        )
        attach_other_currencies_to_report_tree(
            expenses_tree, account_period_other, periods, negate=False,
        )

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

        other_net_agg: dict[str, Decimal] = {}
        for acct, periods_data in account_period_other.items():
            sign = -1 if acct.startswith("Income") else 1
            for _period, curr_data in periods_data.items():
                for curr, val in curr_data.items():
                    other_net_agg[curr] = other_net_agg.get(curr, Decimal(0)) + val * sign

        return {
            "income": income_tree,
            "expenses": expenses_tree,
            "periods": periods,
            "net_income": net_income,
            "operating_currency": oc,
            "other_net_income": format_other_balances(other_net_agg),
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
# Multi-currency separation
# ------------------------------------------------------------------


class TestMultiCurrencyBalanceSheet:
    def test_oc_equation_holds(self, multicurrency_ledger: FavaLedger) -> None:
        """A + L + E = 0 for operating currency only."""
        result = TestBalanceSheet._compute_balance_sheet(multicurrency_ledger)
        t = result["totals"]
        total = t["assets"] + t["liabilities"] + t["equity"]
        assert total == pytest.approx(0.0, abs=0.01), (
            f"OC equation violated: A={t['assets']} L={t['liabilities']} E={t['equity']} = {total}"
        )

    def test_has_operating_currency(self, multicurrency_ledger: FavaLedger) -> None:
        result = TestBalanceSheet._compute_balance_sheet(multicurrency_ledger)
        assert result["operating_currency"] == "USD"

    def test_other_totals_present(self, multicurrency_ledger: FavaLedger) -> None:
        result = TestBalanceSheet._compute_balance_sheet(multicurrency_ledger)
        assert "other_totals" in result
        # The fixture has ITOT in Assets:Brokerage
        asset_others = result["other_totals"]["assets"]
        currencies = [item["currency"] for item in asset_others]
        assert "ITOT" in currencies

    def test_oc_totals_exclude_non_oc(self, multicurrency_ledger: FavaLedger) -> None:
        """OC totals must not include ITOT or VACHR amounts."""
        result = TestBalanceSheet._compute_balance_sheet(multicurrency_ledger)
        # Assets total should only contain USD balances
        # Checking: 10000 + 5000 - 200 - 3500 + 5000 = 16300 USD
        # (100 ITOT in Brokerage excluded from OC total)
        assert result["totals"]["assets"] == pytest.approx(16300.0, abs=0.01)


class TestMultiCurrencyIncomeStatement:
    def test_has_operating_currency(self, multicurrency_ledger: FavaLedger) -> None:
        result = TestIncomeStatement._compute_income_statement(multicurrency_ledger)
        assert result["operating_currency"] == "USD"

    def test_net_income_excludes_non_oc(self, multicurrency_ledger: FavaLedger) -> None:
        """Net income should only include USD amounts."""
        result = TestIncomeStatement._compute_income_statement(multicurrency_ledger)
        total_net = sum(result["net_income"].values())
        # USD income: 5000 + 5000 = 10000, USD expenses: 200 + 150 = 350
        # Net = 10000 - 350 = 9650
        assert total_net == pytest.approx(9650.0, abs=0.01)

    def test_other_net_income_present(self, multicurrency_ledger: FavaLedger) -> None:
        result = TestIncomeStatement._compute_income_statement(multicurrency_ledger)
        assert "other_net_income" in result
        currencies = [item["currency"] for item in result["other_net_income"]]
        assert "VACHR" in currencies

    def test_tree_nodes_have_other_fields(self, multicurrency_ledger: FavaLedger) -> None:
        result = TestIncomeStatement._compute_income_statement(multicurrency_ledger)
        # Walk income tree to find nodes with other_total
        def has_other(nodes: list[dict]) -> bool:
            for n in nodes:
                if n.get("other_total"):
                    return True
                if has_other(n.get("children", [])):
                    return True
            return False
        assert has_other(result["income"]), "Income tree should have other_total for VACHR"


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
