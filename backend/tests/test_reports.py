"""
Tests for the accounting reports — Income Statement, Balance Sheet, and series.

The key invariant (AGENTS.md §10): after ``cap_opt()``, the accounting
equation holds: ``Assets + Liabilities + Equity == 0`` (in Beancount's
sign convention where credit accounts are negative).
"""

from __future__ import annotations

import datetime
import json
import shutil
from decimal import Decimal
from pathlib import Path

import pytest
from beancount import loader
from beancount.core import data, realization
from beancount.ops import summarize
from fastapi.testclient import TestClient
from fava.core import FavaLedger

import ledger as ledger_mod
from cashflow import compute_cashflow, date_to_period
from routers import reports as reports_router
from serializers import (
    attach_other_currencies_to_balance_tree,
    attach_other_currencies_to_report_tree,
    build_balance_tree,
    build_report_tree,
    collect_commodities,
    decimal_to_report_number,
    format_other_balances,
    parse_conversion,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures"


# ------------------------------------------------------------------
# Balance Sheet — accounting invariant
# ------------------------------------------------------------------


class TestBalanceSheet:
    @staticmethod
    def _compute_balance_sheet(
        ledger: FavaLedger,
        as_of_date: str | None = None,
        conversion: str = "at_cost",
    ) -> dict:
        """Compute the balance sheet through the **router's own** code path.

        Deliberately delegates rather than reimplementing. This helper used to
        be a ~75-line copy of ``_compute_balance_sheet``, which meant the
        accounting invariant below was asserted against the test's copy and
        not against the report Ledgr actually serves — a real violation in
        ``routers/reports.py`` could sail through this suite. It did: the
        shipped report broke the equation on any held-at-cost position while
        this test stayed green.
        """
        entries = ledger.all_entries
        if as_of_date:
            cutoff = datetime.date.fromisoformat(as_of_date)
            entries = [e for e in entries if e.date <= cutoff]
        oc = ledger.options["operating_currency"][0]
        return reports_router._compute_balance_sheet(
            entries,
            ledger.options,
            oc,
            conversion=conversion,
            prices=ledger.prices,
            precisions=ledger.format_decimal.precisions,
        )

    @staticmethod
    def _assert_equation(result: dict) -> None:
        """``A + L + E == unrealized_gains`` (Beancount signs: credits negative).

        At cost ``unrealized_gains`` is ``0.00`` and this is the classic
        ``A + L + E = 0``.  At market value the books do not close on their own
        — nobody posted the market move — and the report says by how much;
        in the positive convention the UI shows, ``A == L + E + unrealised``.
        """
        t = result["totals"]
        total = t["assets"] + t["liabilities"] + t["equity"]
        unrealized = float(Decimal(result["unrealized_gains"]))
        assert total == pytest.approx(unrealized, abs=0.01), (
            f"Accounting equation violated under {result['conversion']}: "
            f"A={t['assets']} + L={t['liabilities']} + E={t['equity']} = {total}, "
            f"unrealized_gains={result['unrealized_gains']}"
        )

    @pytest.mark.parametrize("conversion", ["at_cost", "at_value"])
    def test_accounting_equation(self, ledger: FavaLedger, conversion: str) -> None:
        """The fundamental accounting invariant: A + L + E = 0.

        After ``cap_opt()`` closes Income/Expenses into Equity, the three
        permanent account types must sum to zero — plus the computed
        unrealised gains when the sheet is stated at market.
        """
        result = self._compute_balance_sheet(ledger, conversion=conversion)
        self._assert_equation(result)
        if conversion == "at_cost":
            assert result["unrealized_gains"] == "0.00"

    @pytest.mark.parametrize("conversion", ["at_cost", "at_value"])
    def test_accounting_equation_cashflow_fixture(
        self, cashflow_ledger: FavaLedger, conversion: str
    ) -> None:
        """Invariant holds on a richer fixture too."""
        result = self._compute_balance_sheet(cashflow_ledger, conversion=conversion)
        self._assert_equation(result)

    def test_default_lens_is_cost_and_unchanged(self, ledger: FavaLedger) -> None:
        """Calling without a lens is the historical at-cost report."""
        default = self._compute_balance_sheet(ledger)
        explicit = self._compute_balance_sheet(ledger, conversion="at_cost")
        assert default == explicit
        assert default["conversion"] == "at_cost"

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
    @pytest.mark.parametrize("conversion", ["at_cost", "at_value"])
    def test_oc_equation_holds(
        self, multicurrency_ledger: FavaLedger, conversion: str
    ) -> None:
        """A + L + E = unrealised for operating currency only."""
        result = TestBalanceSheet._compute_balance_sheet(
            multicurrency_ledger, conversion=conversion
        )
        TestBalanceSheet._assert_equation(result)

    def test_has_operating_currency(self, multicurrency_ledger: FavaLedger) -> None:
        result = TestBalanceSheet._compute_balance_sheet(multicurrency_ledger)
        assert result["operating_currency"] == "USD"

    def test_other_totals_hold_only_valueless_commodities(
        self, multicurrency_ledger: FavaLedger
    ) -> None:
        """"Other currencies" is for commodities with no OC value — not for
        anything whose cost happens to be in another currency.

        `5 VACHR` has no cost and no price, so it belongs there. The 100 ITOT
        cost 3500.00 USD and must NOT: leaving it here strands its USD cost
        outside the totals and breaks the accounting equation above.
        """
        result = TestBalanceSheet._compute_balance_sheet(multicurrency_ledger)
        assert "other_totals" in result
        currencies = [i["currency"] for i in result["other_totals"]["assets"]]
        assert "VACHR" in currencies
        assert "ITOT" not in currencies

    def test_oc_total_counts_held_at_cost_at_its_cost(
        self, multicurrency_ledger: FavaLedger
    ) -> None:
        """A position held at cost counts toward the OC total at that cost."""
        result = TestBalanceSheet._compute_balance_sheet(multicurrency_ledger)
        # USD cash: 10000 + 5000 - 200 - 3500 + 5000 = 16300
        # plus 100 ITOT {35.00 USD}                  =  3500
        # (5 VACHR has no cost and no price — excluded)
        assert result["totals"]["assets"] == pytest.approx(19800.0, abs=0.01)


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


# ------------------------------------------------------------------
# Consolidated account balance — parent accounts with no own postings
# ------------------------------------------------------------------

CONSOLIDATED_LEDGER = """\
option "title" "Consolidated Test"
option "operating_currency" "BRL"

2024-01-01 open Assets:Checking                      BRL
  ledgr-type: "cash"
2024-01-01 open Assets:Investments:Big               BRL
  ledgr-type: "investment"
2024-01-01 open Assets:Investments:Small             BRL
  ledgr-type: "investment"
2024-01-01 open Assets:Investments:Nested:A          BRL
  ledgr-type: "investment"
2024-01-01 open Assets:Investments:Nested:B          BRL
  ledgr-type: "investment"
2024-01-01 open Assets:Investments:Untouched         BRL
  ledgr-type: "investment"
2024-01-01 open Equity:Opening                       BRL

2024-01-01 * "Seed"
  Assets:Checking        100000.00 BRL
  Equity:Opening

2024-01-10 * "Fund big"
  Assets:Investments:Big   40000.00 BRL
  Assets:Checking

2024-01-11 * "Fund small"
  Assets:Investments:Small    500.00 BRL
  Assets:Checking

2024-02-10 * "Fund nested A"
  Assets:Investments:Nested:A  1000.00 BRL
  Assets:Checking

2024-02-11 * "Fund nested B"
  Assets:Investments:Nested:B   250.00 BRL
  Assets:Checking

2024-03-10 * "Top up big"
  Assets:Investments:Big    2000.00 BRL
  Assets:Checking
"""


@pytest.fixture
def consolidated_entries(tmp_path):
    """Entries for a ledger where ``Assets:Investments`` is a pure group."""
    from beancount import loader

    path = tmp_path / "consolidated.beancount"
    path.write_text(CONSOLIDATED_LEDGER)
    entries, errors, _ = loader.load_file(str(path))
    assert not errors
    return entries


class TestConsolidatedAccountBalance:
    """A parent with no postings of its own rolls up its children.

    Matching such an account exactly yields a flat zero line — accurate but
    useless.  These tests pin the roll-up and, critically, the reconciliation
    invariant: the children must sum to the consolidated total in *every*
    period, or the chart would show two contradictory numbers.
    """

    def test_detects_group_account(self, consolidated_entries) -> None:
        from routers.reports import _has_descendants, _has_own_postings

        assert not _has_own_postings(consolidated_entries, "Assets:Investments")
        assert _has_descendants(consolidated_entries, "Assets:Investments")

    def test_leaf_account_is_not_consolidated(self, consolidated_entries) -> None:
        from routers.reports import _has_descendants, _has_own_postings

        assert _has_own_postings(consolidated_entries, "Assets:Checking")
        assert not _has_descendants(consolidated_entries, "Assets:Checking")

    def test_child_bucket_aggregates_grandchildren(self) -> None:
        from routers.reports import _child_bucket

        assert (
            _child_bucket("Assets:Investments:Nested:A", "Assets:Investments")
            == "Assets:Investments:Nested"
        )
        assert (
            _child_bucket("Assets:Investments:Big", "Assets:Investments")
            == "Assets:Investments:Big"
        )

    def test_consolidated_total_is_sum_of_descendants(
        self, consolidated_entries
    ) -> None:
        from routers.reports import _compute_account_balance_consolidated

        result = _compute_account_balance_consolidated(
            consolidated_entries, "Assets:Investments", "monthly"
        )
        # 40000 + 500 + 1000 + 250 + 2000
        assert result["series"][-1]["balance"] == pytest.approx(43750.00)

    def test_children_reconcile_with_total_every_period(
        self, consolidated_entries
    ) -> None:
        from routers.reports import _compute_account_balance_consolidated

        result = _compute_account_balance_consolidated(
            consolidated_entries, "Assets:Investments", "monthly"
        )
        for i, point in enumerate(result["series"]):
            child_sum = sum(c["series"][i]["balance"] for c in result["children"])
            assert child_sum == pytest.approx(point["balance"]), (
                f"period {point['period']} does not reconcile"
            )

    def test_grandchildren_aggregate_into_one_child_row(
        self, consolidated_entries
    ) -> None:
        from routers.reports import _compute_account_balance_consolidated

        result = _compute_account_balance_consolidated(
            consolidated_entries, "Assets:Investments", "monthly"
        )
        names = {c["name"] for c in result["children"]}
        assert "Nested" in names
        assert "Nested:A" not in names
        nested = next(c for c in result["children"] if c["name"] == "Nested")
        assert nested["series"][-1]["balance"] == pytest.approx(1250.00)

    def test_children_sorted_by_descending_magnitude(
        self, consolidated_entries
    ) -> None:
        from routers.reports import _compute_account_balance_consolidated

        result = _compute_account_balance_consolidated(
            consolidated_entries, "Assets:Investments", "monthly"
        )
        assert [c["name"] for c in result["children"]] == ["Big", "Nested", "Small"]

    def test_never_moved_child_is_dropped(self, consolidated_entries) -> None:
        """An account opened but never posted to must not add a flat zero line."""
        from routers.reports import _compute_account_balance_consolidated

        result = _compute_account_balance_consolidated(
            consolidated_entries, "Assets:Investments", "monthly"
        )
        assert "Untouched" not in {c["name"] for c in result["children"]}

    def test_all_children_share_the_period_axis(self, consolidated_entries) -> None:
        """Every child series must be index-aligned with the total, so the
        frontend can zip them into one row per period."""
        from routers.reports import _compute_account_balance_consolidated

        result = _compute_account_balance_consolidated(
            consolidated_entries, "Assets:Investments", "monthly"
        )
        periods = [p["period"] for p in result["series"]]
        for child in result["children"]:
            assert [p["period"] for p in child["series"]] == periods

    def test_child_carries_zero_before_first_movement(
        self, consolidated_entries
    ) -> None:
        """Nested is funded in February — January must read 0, not be missing."""
        from routers.reports import _compute_account_balance_consolidated

        result = _compute_account_balance_consolidated(
            consolidated_entries, "Assets:Investments", "monthly"
        )
        nested = next(c for c in result["children"] if c["name"] == "Nested")
        jan = next(p for p in nested["series"] if p["period"] == "2024-01")
        assert jan["balance"] == 0

    def test_drilling_into_a_child_group_consolidates_too(
        self, consolidated_entries
    ) -> None:
        from routers.reports import _compute_account_balance_consolidated

        result = _compute_account_balance_consolidated(
            consolidated_entries, "Assets:Investments:Nested", "monthly"
        )
        assert {c["name"] for c in result["children"]} == {"A", "B"}
        assert result["series"][-1]["balance"] == pytest.approx(1250.00)


# ------------------------------------------------------------------
# Conversion lenses over HTTP (PLAN-commodities-ux §4.7)
# ------------------------------------------------------------------

LENSES = ("units", "at_cost", "at_value")

REPORT_URLS = (
    "/api/reports/net-worth?interval=yearly",
    "/api/reports/income-statement?interval=yearly",
    "/api/reports/balance-sheet?view_mode=combined",
    "/api/reports/account-balance?account=Assets:Checking&interval=yearly",
    "/api/reports/income-expense?interval=yearly",
)


def _http_client(tmp_path: Path, fixture: str) -> TestClient:
    src = FIXTURES_DIR / fixture
    dst = tmp_path / "test.beancount"
    shutil.copy(src, dst)
    ledger_mod.init_ledger(str(dst))
    from main import app

    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture()
def oc_only_client(tmp_path: Path) -> TestClient:
    """``minimal.beancount`` — every posting in the operating currency."""
    return _http_client(tmp_path, "minimal.beancount")


@pytest.fixture()
def commodities_client(tmp_path: Path) -> TestClient:
    return _http_client(tmp_path, "commodities.beancount")


def _canonical(body: dict) -> str:
    """The response minus the echoed lens, serialised deterministically."""
    body = dict(body)
    body.pop("conversion", None)
    return json.dumps(body, sort_keys=True)


class TestConversionLensesOnOcOnlyLedger:
    """Regression guard for the user's current file: with nothing outside the
    operating currency, the lens must be invisible — every report returns
    byte-identical numbers under ``units``, ``at_cost``, ``at_value`` and the
    operating currency itself."""

    @pytest.mark.parametrize("url", REPORT_URLS)
    def test_every_lens_is_identical(self, oc_only_client: TestClient, url: str) -> None:
        baseline = oc_only_client.get(url)
        assert baseline.status_code == 200, baseline.text
        for lens in (*LENSES, "BRL"):
            r = oc_only_client.get(f"{url}&conversion={lens}")
            assert r.status_code == 200, r.text
            assert _canonical(r.json()) == _canonical(baseline.json()), lens

    def test_default_is_at_value(self, oc_only_client: TestClient) -> None:
        body = oc_only_client.get("/api/reports/balance-sheet").json()
        assert body["conversion"] == "at_value"
        assert body["unrealized_gains"] == "0.00"
        body = oc_only_client.get("/api/reports/income-statement").json()
        assert body["conversion"] == "at_value"

    @pytest.mark.parametrize("url", REPORT_URLS)
    def test_garbage_lens_is_400(self, oc_only_client: TestClient, url: str) -> None:
        for bad in ("garbage", "AT_VALUE", "XYZ"):
            r = oc_only_client.get(f"{url}&conversion={bad}")
            assert r.status_code == 400, (bad, r.text)


class TestConversionLensesOnCommoditiesLedger:
    """The fixture with lots, FX and vacation days, through the real endpoints.

    Hand-derived (see ``test_commodities.py`` for the per-position numbers):
    BRL cash 88760; PETR4 cost 1900 / market 2450; ITUB4 cost 5250 / market
    5700; XAU cost 1700 USD / market 1900 USD; USD cash −550; USD→BRL 5.20.
    """

    @staticmethod
    def _equation(body: dict) -> None:
        t = body["totals"]
        residual = Decimal(str(t["assets"])) + Decimal(str(t["liabilities"])) + Decimal(str(t["equity"]))
        assert residual == pytest.approx(Decimal(body["unrealized_gains"]), abs=Decimal("0.01")), body

    @pytest.mark.parametrize("lens", ["at_cost", "at_value", "USD"])
    def test_balance_sheet_equation_holds_under_every_valued_lens(
        self, commodities_client: TestClient, lens: str
    ) -> None:
        """``A == L + E + unrealized_gains`` — at cost the residual is zero;
        at market (``at_value`` *or* a currency lens) it is the unrealised
        gain, and the sheet still adds up."""
        body = commodities_client.get(f"/api/reports/balance-sheet?conversion={lens}").json()
        assert body["conversion"] == lens
        self._equation(body)
        if lens == "at_cost":
            assert body["unrealized_gains"] == "0.00"
        else:
            assert Decimal(body["unrealized_gains"]) != 0

    def test_balance_sheet_at_value_numbers(self, commodities_client: TestClient) -> None:
        body = commodities_client.get("/api/reports/balance-sheet?conversion=at_value").json()
        # 88760 + 2450 + 5700 + 9880 − 2860
        assert body["totals"]["assets"] == pytest.approx(103930.0)
        assert body["unrealized_gains"] == "2040.00"
        # Only the commodity with no price path is left over.
        assert [o["currency"] for o in body["other_totals"]["assets"]] == ["VACDAY"]

    def test_unrealized_gains_match_the_holdings_total(self, commodities_client: TestClient) -> None:
        """Two independent paths to the same number: the Balance Sheet's
        residual and the Holdings table's sum of per-position gains."""
        sheet = commodities_client.get("/api/reports/balance-sheet?conversion=at_value").json()
        holdings = commodities_client.get("/api/holdings?conversion=at_value").json()
        assert sheet["unrealized_gains"] == holdings["totals"]["unrealized"]

    def test_balance_sheet_at_cost_keeps_unpriced_currency_in_other(
        self, commodities_client: TestClient
    ) -> None:
        body = commodities_client.get("/api/reports/balance-sheet?conversion=at_cost").json()
        # 88760 + 1900 + 5250; gold's cost is in USD and stays there at cost.
        assert body["totals"]["assets"] == pytest.approx(95910.0)
        other = {o["currency"]: o["amount"] for o in body["other_totals"]["assets"]}
        assert other == {"USD": "1150.00", "VACDAY": "0.5"}

    def test_balance_sheet_as_of_date_values_at_that_date(self, commodities_client: TestClient) -> None:
        """Before any price directive exists ``at_value`` falls back to cost
        (Fava's rule) and USD cash, having no price path yet, is left over."""
        body = commodities_client.get(
            "/api/reports/balance-sheet?conversion=at_value&to_date=2020-10-01"
        ).json()
        self._equation(body)
        assert body["unrealized_gains"] == "0.00"
        assert {o["currency"] for o in body["other_totals"]["assets"]} == {"USD", "VACDAY"}

    def test_net_worth_no_longer_drops_non_oc_positions(self, commodities_client: TestClient) -> None:
        def nw(lens: str) -> float:
            body = commodities_client.get(
                f"/api/reports/net-worth?interval=yearly&conversion={lens}"
            ).json()
            return body["series"][-1]["net_worth"]

        assert nw("units") == pytest.approx(88760.0)      # historical: BRL cash only
        assert nw("at_cost") == pytest.approx(95910.0)    # + shares at cost
        assert nw("at_value") == pytest.approx(103930.0)  # + market, + USD at 5.20

    def test_income_statement_carries_usd_gain_to_oc_at_value(
        self, commodities_client: TestClient
    ) -> None:
        units = commodities_client.get(
            "/api/reports/income-statement?interval=yearly&conversion=units"
        ).json()
        value = commodities_client.get(
            "/api/reports/income-statement?interval=yearly&conversion=at_value"
        ).json()
        # BRL gains: 400 + 50 + 20 + 190 (FIFO) + 250 (ITUB4) = 910
        assert units["net_income"]["2020"] == pytest.approx(910.0)
        assert {o["currency"] for o in units["other_net_income"]} == {"USD", "VACDAY"}
        # + the 150 USD gold gain at the year-end rate 5.20 = 780
        assert value["net_income"]["2020"] == pytest.approx(1690.0)
        assert [o["currency"] for o in value["other_net_income"]] == ["VACDAY"]

    def test_income_expense_follows_the_lens(self, commodities_client: TestClient) -> None:
        def income(lens: str) -> float:
            body = commodities_client.get(
                f"/api/reports/income-expense?interval=yearly&conversion={lens}"
            ).json()
            return body["series"][-1]["income"]

        assert income("units") == pytest.approx(910.0)
        assert income("at_value") == pytest.approx(1690.0)

    def test_account_balance_units_vs_value(self, commodities_client: TestClient) -> None:
        def balance(lens: str) -> float:
            body = commodities_client.get(
                "/api/reports/account-balance?account=Assets:Vault:XAU"
                f"&interval=yearly&conversion={lens}"
            ).json()
            return body["series"][-1]["balance"]

        assert balance("units") == pytest.approx(1.0)        # 1 XAU
        assert balance("at_cost") == pytest.approx(0.0)      # cost is in USD, not BRL
        assert balance("at_value") == pytest.approx(9880.0)  # 1900 USD × 5.20
        assert balance("USD") == pytest.approx(1900.0)

    def test_currency_lens_is_a_known_currency_only(self, commodities_client: TestClient) -> None:
        assert commodities_client.get("/api/reports/net-worth?conversion=USD").status_code == 200
        assert commodities_client.get("/api/reports/net-worth?conversion=EUR").status_code == 400


class TestCollectCommodities:
    def test_operating_currency_without_a_number_is_still_known(self) -> None:
        """Beancount 3 leaves ``options["commodities"]`` empty; the set has to
        be rebuilt — and must not lose an operating currency that only ever
        appears in the option line."""
        entries, errors, options = loader.load_string(
            'option "operating_currency" "BRL"\n'
            "2020-01-01 open Assets:A\n"
            "2020-01-01 open Assets:B\n"
            '2020-01-02 * "x"\n'
            "  Assets:A   1 FOO {2 BAR}\n"
            "  Assets:B   -2 BAR\n"
            '2020-01-03 * "y"\n'
            "  Assets:A   1 QUX @ 3 ZED\n"
            "  Assets:B   -3 ZED\n"
            "2020-01-04 price QUX 4 ONLYPRICE\n"
        )
        assert not errors
        assert options["commodities"] == set()
        known = collect_commodities(entries, options)
        assert known == {"BRL", "FOO", "BAR", "QUX", "ZED", "ONLYPRICE"}
        assert parse_conversion("BAR", known) == "BAR"
        assert parse_conversion("EUR", known) is None
        assert parse_conversion(None, known) == "at_value"
