"""Tests for the Budget feature — pure aggregation (``budgets.py``) and the
router (``routers/budget.py``).

All tests use real FavaLedger instances pointed at ``fixtures/budget.beancount``
— never mocks.  See AGENTS.md §10.
"""

from __future__ import annotations

import datetime
import shutil
from decimal import Decimal
from pathlib import Path

import pytest
from beancount.core import data
from fastapi.testclient import TestClient
from fava.core import FavaLedger

import ledger as ledger_mod
from account_types import build_account_type_map, is_budgetable_allocation
from budgets import (
    accounts_with_activity,
    budgeted_accounts,
    dedupe_ghost_subtrees,
    detect_overlap_warnings,
    list_budget_directives,
    overlaps_budgeted,
    section_for_account,
    sum_account_postings,
    sum_cash_delta,
)
from cashflow import compute_cashflow
from ledger import get_filtered_entries

FIXTURES_DIR = Path(__file__).parent / "fixtures"

JAN_START = datetime.date(2024, 1, 1)
JAN_END = datetime.date(2024, 2, 1)
FEB_START = datetime.date(2024, 2, 1)
FEB_END = datetime.date(2024, 3, 1)


# ==================================================================
# Pure functions (budgets.py)
# ==================================================================


class TestListBudgetDirectives:
    def test_filters_by_month(self, budget_ledger: FavaLedger) -> None:
        jan = list_budget_directives(budget_ledger.all_entries, JAN_START, JAN_END)
        # 5 directives in January, the February Rent directive excluded.
        assert len(jan) == 5
        assert all(JAN_START <= d.date < JAN_END for d in jan)

        feb = list_budget_directives(budget_ledger.all_entries, FEB_START, FEB_END)
        assert len(feb) == 1
        assert str(feb[0].values[0].value) == "Expenses:Rent"

    def test_empty_month_returns_nothing(self, budget_ledger: FavaLedger) -> None:
        mar = list_budget_directives(
            budget_ledger.all_entries,
            datetime.date(2024, 3, 1),
            datetime.date(2024, 4, 1),
        )
        assert mar == []


class TestSumAccountPostings:
    def _jan_entries(self, ledger: FavaLedger) -> list:
        return get_filtered_entries(
            ledger, "combined", from_date=JAN_START, to_date=JAN_END
        )

    def test_splits_by_flag(self, budget_ledger: FavaLedger) -> None:
        entries = self._jan_entries(budget_ledger)
        realized, pending = sum_account_postings(
            entries, "Expenses:Food:Restaurant", "BRL"
        )
        # 200 confirmed (*), 100 pending (!)
        assert realized == Decimal("200.00")
        assert pending == Decimal("100.00")

    def test_includes_descendants(self, budget_ledger: FavaLedger) -> None:
        entries = self._jan_entries(budget_ledger)
        # Expenses:Food has a direct 150 grocery posting + 200/100 under
        # its Restaurant descendant.
        realized, pending = sum_account_postings(entries, "Expenses:Food", "BRL")
        assert realized == Decimal("350.00")  # 150 + 200
        assert pending == Decimal("100.00")

    def test_skips_synthetic_s_entries(self, budget_ledger: FavaLedger) -> None:
        # clamp_opt injects flag-'S' opening-balance transactions when a window
        # is clamped to start mid-period.  They must never be counted.
        entries = get_filtered_entries(
            budget_ledger,
            "combined",
            from_date=datetime.date(2024, 1, 20),
            to_date=JAN_END,
        )
        assert any(
            getattr(e, "flag", None) == "S" for e in entries
        ), "clamp should produce at least one synthetic S entry here"

        # Append a synthetic S transaction posting directly to a budgeted
        # account to prove the flag filter excludes it explicitly.
        from beancount.core import amount as bc_amount

        s_txn: data.Transaction = data.Transaction(
            meta={},
            date=datetime.date(2024, 1, 20),
            flag="S",
            payee=None,
            narration="synthetic",
            tags=frozenset(),
            links=frozenset(),
            postings=[
                data.Posting(
                    account="Expenses:Rent",
                    units=bc_amount.Amount(Decimal("9999.00"), "BRL"),
                    cost=None,
                    price=None,
                    flag=None,
                    meta=None,
                )
            ],
        )
        realized, pending = sum_account_postings(
            [*entries, s_txn], "Expenses:Rent", "BRL"
        )
        # Only the real 3000 rent (dated 2024-01-25, inside the window) — the
        # 9999 'S' posting is excluded.
        assert realized == Decimal("3000.00")
        assert pending == Decimal("0.00")

    def test_non_oc_postings_ignored(self, budget_ledger: FavaLedger) -> None:
        entries = self._jan_entries(budget_ledger)
        realized, _ = sum_account_postings(entries, "Income:Salary", "USD")
        assert realized == Decimal(0)

    def test_cash_counterpart_excludes_interest(
        self, budget_ledger: FavaLedger
    ) -> None:
        # August: investment gets a 1000 cash contribution + 150 interest
        # (Income leg, no cash). With require_cash_counterpart only the 1000
        # contribution counts.
        type_map = build_account_type_map(budget_ledger.all_entries)
        entries = get_filtered_entries(
            budget_ledger,
            "combined",
            from_date=datetime.date(2024, 8, 1),
            to_date=datetime.date(2024, 9, 1),
        )
        realized, _ = sum_account_postings(
            entries,
            "Assets:Investments:Stocks",
            "BRL",
            require_cash_counterpart=True,
            type_map=type_map,
        )
        assert realized == Decimal("1000.00")
        # Without the filter, both legs count (1000 + 150).
        raw_realized, _ = sum_account_postings(
            entries, "Assets:Investments:Stocks", "BRL"
        )
        assert raw_realized == Decimal("1150.00")


class TestSectionForAccount:
    def test_roots_map_to_sections(self) -> None:
        assert section_for_account("Income:Salary") == "income"
        assert section_for_account("Expenses:Rent") == "expenses"
        assert section_for_account("Assets:Investments:Stocks") == "allocations"
        assert section_for_account("Liabilities:CreditCard") == "allocations"
        assert section_for_account("Equity:OpeningBalances") is None


class TestBudgetedAccounts:
    def test_distinct_first_seen_order(self, budget_ledger: FavaLedger) -> None:
        jan = list_budget_directives(budget_ledger.all_entries, JAN_START, JAN_END)
        accounts = budgeted_accounts(jan)
        assert accounts == [
            "Income:Salary",
            "Expenses:Food:Restaurant",
            "Expenses:Rent",
            "Assets:Investments:Stocks",
            "Liabilities:Loan",
        ]


class TestActivityHelpers:
    def test_accounts_with_activity_excludes_cash(
        self, budget_ledger: FavaLedger
    ) -> None:
        type_map = build_account_type_map(budget_ledger.all_entries)
        entries = get_filtered_entries(
            budget_ledger,
            "combined",
            from_date=datetime.date(2024, 8, 1),
            to_date=datetime.date(2024, 9, 1),
        )
        active = accounts_with_activity(entries, "BRL", "combined", type_map)
        assert "Expenses:Subscriptions" in active
        assert "Income:Interest" in active
        # Cash funding account excluded.
        assert "Assets:Bank:Checking" not in active

    def test_accounts_with_activity_actual_excludes_pending(
        self, budget_ledger: FavaLedger
    ) -> None:
        type_map = build_account_type_map(budget_ledger.all_entries)
        entries = get_filtered_entries(
            budget_ledger,
            "actual",
            from_date=datetime.date(2024, 8, 1),
            to_date=datetime.date(2024, 9, 1),
        )
        active = accounts_with_activity(entries, "BRL", "actual", type_map)
        # Subscriptions has a confirmed charge, so still present in actual.
        assert "Expenses:Subscriptions" in active

    def test_overlaps_budgeted_both_directions(self) -> None:
        budgeted = {"Expenses:Food:Restaurant"}
        # ancestor of a budgeted account
        assert overlaps_budgeted("Expenses:Food", budgeted) is True
        # descendant of a budgeted account
        assert overlaps_budgeted(
            "Expenses:Food:Restaurant:Lunch", {"Expenses:Food:Restaurant"}
        ) is True
        # exact match
        assert overlaps_budgeted("Expenses:Food:Restaurant", budgeted) is True
        # unrelated
        assert overlaps_budgeted("Expenses:Rent", budgeted) is False

    def test_dedupe_ghost_subtrees_keeps_ancestor(self) -> None:
        # Parent + child both candidates → keep only the ancestor (its rolled-up
        # sum already represents the whole subtree; child would double-count).
        kept = dedupe_ghost_subtrees(
            ["Expenses:Food", "Expenses:Food:Coffee", "Expenses:Rent"]
        )
        assert set(kept) == {"Expenses:Food", "Expenses:Rent"}
        # Siblings (no ancestry) both survive.
        assert set(
            dedupe_ghost_subtrees(["Expenses:Food:Coffee", "Expenses:Food:Tea"])
        ) == {"Expenses:Food:Coffee", "Expenses:Food:Tea"}


class TestOverlapWarnings:
    def test_parent_descendant_overlap_warns(self) -> None:
        warnings = detect_overlap_warnings(
            ["Expenses:Food", "Expenses:Food:Restaurant"]
        )
        assert len(warnings) == 1
        assert "Expenses:Food:Restaurant" in warnings[0]
        assert "Expenses:Food" in warnings[0]

    def test_no_overlap_no_warning(self) -> None:
        warnings = detect_overlap_warnings(
            ["Expenses:Food", "Expenses:Rent", "Income:Salary"]
        )
        assert warnings == []


# ==================================================================
# Router (routers/budget.py)
# ==================================================================


@pytest.fixture()
def budget_client(tmp_path: Path) -> TestClient:
    """TestClient backed by a writable copy of the budget fixture."""
    src = FIXTURES_DIR / "budget.beancount"
    dst = tmp_path / "budget.beancount"
    shutil.copy(src, dst)

    ledger_mod.init_ledger(str(dst))

    from main import app

    return TestClient(app, raise_server_exceptions=False)


def _section(body: dict, key: str) -> dict:
    return next(s for s in body["sections"] if s["key"] == key)


def _envelope(body: dict, section_key: str, account: str) -> dict:
    section = _section(body, section_key)
    return next(e for e in section["envelopes"] if e["account"] == account)


class TestGetBudget:
    def test_returns_pool_sections_closure(self, budget_client: TestClient) -> None:
        r = budget_client.get("/api/budget?month=2024-01")
        assert r.status_code == 200
        body = r.json()
        assert body["month"] == "2024-01"
        assert body["operating_currency"] == "BRL"
        assert {s["key"] for s in body["sections"]} == {
            "income",
            "expenses",
            "allocations",
        }

    def test_closure_arithmetic(self, budget_client: TestClient) -> None:
        body = budget_client.get("/api/budget?month=2024-01").json()
        pool = body["pool"]
        assert pool["income_allocated"] == 12000.00
        assert pool["expense_allocated"] == 3500.00
        assert pool["allocation_allocated"] == 2500.00
        # 12000 - 3500 - 2500 = 6000
        assert pool["unallocated"] == 6000.00

    def test_allocated_comes_from_fava(self, budget_client: TestClient) -> None:
        body = budget_client.get("/api/budget?month=2024-01").json()
        restaurant = _envelope(body, "expenses", "Expenses:Food:Restaurant")
        # Matches the directive figure exactly over a full calendar month.
        assert restaurant["allocated"] == 500.00

    def test_monthly_directive_round_trips_exactly(
        self, budget_client: TestClient
    ) -> None:
        body = budget_client.get("/api/budget?month=2024-01").json()
        # Every envelope's allocated equals its directive's bare number.
        assert _envelope(body, "income", "Income:Salary")["allocated"] == 12000.00
        assert _envelope(body, "expenses", "Expenses:Rent")["allocated"] == 3000.00
        assert (
            _envelope(body, "allocations", "Assets:Investments:Stocks")["allocated"]
            == 2000.00
        )

    def test_income_sign_normalization(self, budget_client: TestClient) -> None:
        body = budget_client.get("/api/budget?month=2024-01").json()
        salary = _envelope(body, "income", "Income:Salary")
        # Income postings are credits (negative) but realized reads positive.
        assert salary["realized"] == 12000.00
        assert salary["free"] == 0.00

    def test_income_requires_cash_leg(self, budget_client: TestClient) -> None:
        # August: Income:Interest is reinvested (Income → investment, NO cash
        # leg). Budget income counts only cash-touching receipts — mirroring the
        # Cash Flow Statement — so reinvested interest is NOT budget income and
        # earns no income row/subtotal. (A pension benefit that goes straight to
        # an investment behaves identically.)
        body = budget_client.get("/api/budget?month=2024-08").json()
        income = _section(body, "income")
        assert income["subtotal"]["realized"] == 0.00
        accounts = [e["account"] for e in income["envelopes"]]
        assert "Income:Interest" not in accounts

    def test_realized_pending_actual_mode_splits(
        self, budget_client: TestClient
    ) -> None:
        # In actual mode the columns stay split (true realized / true pending).
        body = budget_client.get(
            "/api/budget?month=2024-01&view_mode=actual"
        ).json()
        restaurant = _envelope(body, "expenses", "Expenses:Food:Restaurant")
        assert restaurant["realized"] == 200.00
        assert restaurant["pending"] == 100.00
        # actual view: free = 500 - 200 = 300 (pending ignored)
        assert restaurant["free"] == 300.00

    def test_combined_mode_folds_pending_into_realized(
        self, budget_client: TestClient
    ) -> None:
        # "Actual + Planned" treats planned as done: realized shows 200 + 100,
        # pending blanks to 0, free unchanged (500 - 300 = 200).
        body = budget_client.get("/api/budget?month=2024-01").json()
        restaurant = _envelope(body, "expenses", "Expenses:Food:Restaurant")
        assert restaurant["realized"] == 300.00
        assert restaurant["pending"] == 0.00
        assert restaurant["free"] == 200.00

    def test_credit_card_purchase_drains_expense_not_card(
        self, budget_client: TestClient
    ) -> None:
        # Use actual mode so the column is the raw realized (not pending-folded).
        body = budget_client.get(
            "/api/budget?month=2024-01&view_mode=actual"
        ).json()
        # The 200 restaurant purchase is funded by the credit card, but it
        # drained the *expense* envelope at purchase time — the card is just the
        # instrument and is not budgeted at all.
        restaurant = _envelope(body, "expenses", "Expenses:Food:Restaurant")
        assert restaurant["realized"] == 200.00
        # No envelope tracks Liabilities:CreditCard, so the card drained nothing.
        alloc_accounts = {
            e["account"] for e in _section(body, "allocations")["envelopes"]
        }
        assert "Liabilities:CreditCard" not in alloc_accounts
        # The dedicated loan-paydown envelope sees only its explicit +500.
        loan = _envelope(body, "allocations", "Liabilities:Loan")
        assert loan["realized"] == 500.00

    def test_allocations_section_has_both_roots(
        self, budget_client: TestClient
    ) -> None:
        body = budget_client.get("/api/budget?month=2024-01").json()
        accounts = {
            e["account"] for e in _section(body, "allocations")["envelopes"]
        }
        assert accounts == {
            "Assets:Investments:Stocks",
            "Liabilities:Loan",
        }

    def test_subtotals(self, budget_client: TestClient) -> None:
        body = budget_client.get("/api/budget?month=2024-01").json()
        expenses = _section(body, "expenses")
        assert expenses["subtotal"]["allocated"] == 3500.00
        # combined: realized folds pending — restaurant 200+100, rent 3000 = 3300
        assert expenses["subtotal"]["realized"] == 3300.00
        assert expenses["subtotal"]["pending"] == 0.00


class TestGhostRows:
    """v2 Change 2 — unbudgeted-but-active accounts surface as ghost rows."""

    def test_unbudgeted_expense_appears_as_ghost(
        self, budget_client: TestClient
    ) -> None:
        # Actual mode keeps the columns split so we can see realized vs pending.
        body = budget_client.get(
            "/api/budget?month=2024-08&view_mode=actual"
        ).json()
        # Expenses:Subscriptions is not budgeted in August but has activity.
        sub = _envelope(body, "expenses", "Expenses:Subscriptions")
        assert sub["is_ghost"] is True
        assert sub["allocated"] == 0.00
        assert sub["realized"] == 49.90
        assert sub["pending"] == 100.00

    def test_ghost_combined_folds_pending(
        self, budget_client: TestClient
    ) -> None:
        # In combined mode the ghost's pending folds into realized (planned = done).
        body = budget_client.get("/api/budget?month=2024-08").json()
        sub = _envelope(body, "expenses", "Expenses:Subscriptions")
        assert sub["realized"] == 149.90
        assert sub["pending"] == 0.00

    def test_ghost_count_reported(self, budget_client: TestClient) -> None:
        body = budget_client.get("/api/budget?month=2024-08").json()
        # One ghost: Expenses:Subscriptions (credit-card purchase, accrual).
        # Income:Interest is reinvested (no cash leg) so it is NOT budget income
        # — it mirrors the Cash Flow Statement, which never sees it.
        assert body["ghost_count"] == 1

    def test_ghosts_feed_closure(self, budget_client: TestClient) -> None:
        body = budget_client.get("/api/budget?month=2024-08").json()
        pool = body["pool"]
        # Reinvested interest (150, no cash leg) does NOT count as income.
        # expenses ghost 149.90 (49.90+100) - allocations 1000 (budgeted).
        assert pool["income_allocated"] == 0.00
        assert pool["expense_allocated"] == 149.90
        assert pool["allocation_allocated"] == 1000.00
        assert pool["unallocated"] == -1149.90

    def test_ghost_activity_follows_view_mode(
        self, budget_client: TestClient
    ) -> None:
        # In actual mode the subscription ghost's pending (!) is excluded from
        # free and from the closure.
        body = budget_client.get(
            "/api/budget?month=2024-08&view_mode=actual"
        ).json()
        sub = _envelope(body, "expenses", "Expenses:Subscriptions")
        assert sub["realized"] == 49.90
        assert sub["free"] == -49.90  # only realized counts
        assert body["pool"]["expense_allocated"] == 49.90

    def test_ghost_child_of_budgeted_parent_not_shown(
        self, budget_client: TestClient
    ) -> None:
        # January: Expenses:Food (parent) has a direct grocery posting and its
        # child Expenses:Food:Restaurant is budgeted. The parent must NOT ghost
        # — its spend already rolls into the budgeted child's subtree.
        body = budget_client.get("/api/budget?month=2024-01").json()
        accounts = {
            e["account"] for e in _section(body, "expenses")["envelopes"]
        }
        assert "Expenses:Food" not in accounts

    def test_overlapping_ghosts_not_double_counted(
        self, budget_client: TestClient
    ) -> None:
        # Clear the January Restaurant directive so its parent Expenses:Food
        # (direct grocery 150 + rolled-up Restaurant 200/100) and the child
        # Restaurant are BOTH unbudgeted-and-active. Only the ancestor should
        # surface, and the subtotal must not double-count the child.
        budget_client.put(
            "/api/budget",
            json={
                "month": "2024-01",
                "account": "Expenses:Food:Restaurant",
                "amount": None,
            },
        )
        # Actual mode so realized is the raw (non-folded) sum.
        body = budget_client.get(
            "/api/budget?month=2024-01&view_mode=actual"
        ).json()
        accounts = {
            e["account"] for e in _section(body, "expenses")["envelopes"]
        }
        # Ancestor kept, descendant folded in.
        assert "Expenses:Food" in accounts
        assert "Expenses:Food:Restaurant" not in accounts
        food = _envelope(body, "expenses", "Expenses:Food")
        # 150 grocery + 200 confirmed restaurant = 350 realized (no dup).
        assert food["realized"] == 350.00
        # Expenses subtotal: Rent 3000 (budgeted) + Food 350 ghost = 3350.
        assert _section(body, "expenses")["subtotal"]["realized"] == 3350.00

    def test_cash_account_never_ghosts(self, budget_client: TestClient) -> None:
        # Assets:Bank:Checking funds everything but is a cash account — it must
        # never surface as an allocation ghost.
        body = budget_client.get("/api/budget?month=2024-08").json()
        accounts = {
            e["account"] for e in _section(body, "allocations")["envelopes"]
        }
        assert "Assets:Bank:Checking" not in accounts


class TestAllocationCashLeg:
    """v2 Change 3 — investment allocations count transfers, not interest."""

    def test_interest_excluded_contribution_counted(
        self, budget_client: TestClient
    ) -> None:
        body = budget_client.get("/api/budget?month=2024-08").json()
        inv = _envelope(body, "allocations", "Assets:Investments:Stocks")
        # 1000 contribution (cash leg) counts; 150 interest (Income leg) does not.
        assert inv["realized"] == 1000.00

    def test_debt_paydown_still_counts(self, budget_client: TestClient) -> None:
        # January loan paydown (Assets:Cash -> Liabilities:Loan) has a cash leg.
        body = budget_client.get("/api/budget?month=2024-01").json()
        loan = _envelope(body, "allocations", "Liabilities:Loan")
        assert loan["realized"] == 500.00

    def test_expense_envelope_not_cash_filtered(
        self, budget_client: TestClient
    ) -> None:
        # Credit-card-funded restaurant (no cash leg) still drains the EXPENSE
        # envelope — the cash-leg rule applies only to allocations. Actual mode
        # so realized is the raw 200 (not pending-folded).
        body = budget_client.get(
            "/api/budget?month=2024-01&view_mode=actual"
        ).json()
        restaurant = _envelope(body, "expenses", "Expenses:Food:Restaurant")
        assert restaurant["realized"] == 200.00


class TestSubtotalRounding:
    def test_subtotal_sums_raw_not_rounded(
        self, budget_client: TestClient
    ) -> None:
        # July: Restaurant realized 33.333, Rent realized 33.334. Per-envelope
        # each rounds to 33.33, but the true subtotal is 66.667 → 66.67.
        # Summing rounded floats would wrongly give 66.66.
        body = budget_client.get("/api/budget?month=2024-07").json()
        expenses = _section(body, "expenses")
        assert expenses["subtotal"]["realized"] == 66.67


class TestClosureWithoutTransactions:
    def test_closure_computable_from_directives_alone(
        self, budget_client: TestClient
    ) -> None:
        # February has only a single directive (Rent 3100) and no transactions.
        body = budget_client.get("/api/budget?month=2024-02").json()
        assert body["pool"]["expense_allocated"] == 3100.00
        assert body["pool"]["income_allocated"] == 0.00
        # unallocated = 0 - 3100 - 0 = -3100 (over-allocated, but computable)
        assert body["pool"]["unallocated"] == -3100.00
        rent = _envelope(body, "expenses", "Expenses:Rent")
        assert rent["allocated"] == 3100.00
        assert rent["realized"] == 0.00


class TestPutBudget:
    def test_creates_then_edits_in_place(self, budget_client: TestClient) -> None:
        # Create a brand-new envelope for a previously-unbudgeted account.
        r = budget_client.put(
            "/api/budget",
            json={
                "month": "2024-03",
                "account": "Expenses:Food",
                "amount": "400.00",
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert _envelope(body, "expenses", "Expenses:Food")["allocated"] == 400.00

        # Edit it — must not create a duplicate directive.
        r2 = budget_client.put(
            "/api/budget",
            json={
                "month": "2024-03",
                "account": "Expenses:Food",
                "amount": "450.00",
            },
        )
        body2 = r2.json()
        food_envelopes = [
            e
            for e in _section(body2, "expenses")["envelopes"]
            if e["account"] == "Expenses:Food"
        ]
        assert len(food_envelopes) == 1
        assert food_envelopes[0]["allocated"] == 450.00

    def test_clear_removes_directive(self, budget_client: TestClient) -> None:
        # Clear the existing January Restaurant directive. The directive is gone
        # and the spend stays visible — but because the parent Expenses:Food is
        # itself unbudgeted-and-active (direct grocery posting), the Restaurant
        # spend folds into that ancestor ghost (no double-count, v2 Change 2).
        r = budget_client.put(
            "/api/budget",
            json={
                "month": "2024-01",
                "account": "Expenses:Food:Restaurant",
                "amount": None,
            },
        )
        assert r.status_code == 200
        body = r.json()
        food = _envelope(body, "expenses", "Expenses:Food")
        assert food["is_ghost"] is True
        assert food["allocated"] == 0.00
        # Directive removed: no budgeted Restaurant envelope remains.
        accounts = {
            (e["account"], e["is_ghost"])
            for e in _section(body, "expenses")["envelopes"]
        }
        assert ("Expenses:Food:Restaurant", False) not in accounts

    def test_zero_amount_clears(self, budget_client: TestClient) -> None:
        r = budget_client.put(
            "/api/budget",
            json={"month": "2024-01", "account": "Expenses:Rent", "amount": "0"},
        )
        body = r.json()
        rent = _envelope(body, "expenses", "Expenses:Rent")
        assert rent["is_ghost"] is True
        assert rent["allocated"] == 0.00

    def test_clear_unbudgeted_no_activity_disappears(
        self, budget_client: TestClient
    ) -> None:
        # Create then clear an envelope on an account with NO activity in March:
        # it should disappear entirely (no ghost, since nothing was consumed).
        budget_client.put(
            "/api/budget",
            json={"month": "2024-03", "account": "Expenses:Rent", "amount": "100"},
        )
        body = budget_client.put(
            "/api/budget",
            json={"month": "2024-03", "account": "Expenses:Rent", "amount": "0"},
        ).json()
        accounts = {
            e["account"] for e in _section(body, "expenses")["envelopes"]
        }
        assert "Expenses:Rent" not in accounts

    def test_nan_amount_rejected(self, budget_client: TestClient) -> None:
        r = budget_client.put(
            "/api/budget",
            json={
                "month": "2024-03",
                "account": "Expenses:Rent",
                "amount": "NaN",
            },
        )
        assert r.status_code == 400
        # And nothing was written: 2024-03 still has no Rent envelope.
        body = budget_client.get("/api/budget?month=2024-03").json()
        accounts = {
            e["account"] for e in _section(body, "expenses")["envelopes"]
        }
        assert "Expenses:Rent" not in accounts

    def test_negative_amount_rejected(self, budget_client: TestClient) -> None:
        r = budget_client.put(
            "/api/budget",
            json={
                "month": "2024-03",
                "account": "Expenses:Rent",
                "amount": "-50",
            },
        )
        assert r.status_code == 400

    def test_equity_rejected(self, budget_client: TestClient) -> None:
        r = budget_client.put(
            "/api/budget",
            json={
                "month": "2024-01",
                "account": "Equity:OpeningBalances",
                "amount": "100.00",
            },
        )
        assert r.status_code == 400

    def test_unknown_account_rejected(self, budget_client: TestClient) -> None:
        r = budget_client.put(
            "/api/budget",
            json={
                "month": "2024-01",
                "account": "Expenses:DoesNotExist",
                "amount": "100.00",
            },
        )
        assert r.status_code == 400

    def test_cash_account_rejected(self, budget_client: TestClient) -> None:
        # Cash accounts are funding sources, not allocation envelopes → 400.
        r = budget_client.put(
            "/api/budget",
            json={
                "month": "2024-03",
                "account": "Assets:Bank:Checking",
                "amount": "100.00",
            },
        )
        assert r.status_code == 400

    def test_credit_card_rejected(self, budget_client: TestClient) -> None:
        # Credit card is a payment instrument, not an allocation → 400.
        r = budget_client.put(
            "/api/budget",
            json={
                "month": "2024-03",
                "account": "Liabilities:CreditCard",
                "amount": "100.00",
            },
        )
        assert r.status_code == 400

    def test_investment_and_loan_accepted(
        self, budget_client: TestClient
    ) -> None:
        # The two valid allocation types succeed.
        r1 = budget_client.put(
            "/api/budget",
            json={
                "month": "2024-03",
                "account": "Assets:Investments:Stocks",
                "amount": "100.00",
            },
        )
        assert r1.status_code == 200
        r2 = budget_client.put(
            "/api/budget",
            json={
                "month": "2024-03",
                "account": "Liabilities:Loan",
                "amount": "100.00",
            },
        )
        assert r2.status_code == 200

    @staticmethod
    def _nov_rent_lines() -> list[str]:
        path = ledger_mod.get_ledger().beancount_file_path
        return [
            ln
            for ln in Path(path).read_text().splitlines()
            if ln.startswith("2024-11-01")
            and "Expenses:Rent" in ln
            and 'custom "budget"' in ln
        ]

    def test_edit_dedupes_duplicate_directives(
        self, budget_client: TestClient
    ) -> None:
        # November has TWO budget directives for Expenses:Rent (both 500). Fava
        # uses the last; editing must converge to a single directive at the new
        # value (regression: previously the edit silently no-op'd).
        before = budget_client.get("/api/budget?month=2024-11").json()
        assert _envelope(before, "expenses", "Expenses:Rent")["allocated"] == 500.00
        assert len(self._nov_rent_lines()) == 2  # the duplicate exists

        r = budget_client.put(
            "/api/budget",
            json={"month": "2024-11", "account": "Expenses:Rent", "amount": "750"},
        )
        assert r.status_code == 200
        assert _envelope(r.json(), "expenses", "Expenses:Rent")["allocated"] == 750.00

        # The file now has exactly one Rent directive for November, at 750.
        lines = self._nov_rent_lines()
        assert len(lines) == 1
        assert "750" in lines[0]

    def test_clear_removes_all_duplicates(
        self, budget_client: TestClient
    ) -> None:
        budget_client.put(
            "/api/budget",
            json={"month": "2024-11", "account": "Expenses:Rent", "amount": None},
        )
        assert self._nov_rent_lines() == []


class TestCopyBudget:
    def test_copies_into_empty_month(self, budget_client: TestClient) -> None:
        r = budget_client.post(
            "/api/budget/copy",
            json={"from_month": "2024-01", "to_month": "2024-04"},
        )
        assert r.status_code == 200
        body = r.json()
        # April now mirrors January's allocations.
        assert body["pool"]["income_allocated"] == 12000.00
        assert body["pool"]["unallocated"] == 6000.00

    def test_overwrites_populated_target(self, budget_client: TestClient) -> None:
        # February already has a single Rent directive (3100). Copying Jan→Feb
        # OVERWRITES: February ends as an exact mirror of January.
        r = budget_client.post(
            "/api/budget/copy",
            json={"from_month": "2024-01", "to_month": "2024-02"},
        )
        assert r.status_code == 200
        body = r.json()
        # February now mirrors January, not its old 3100 Rent.
        assert body["pool"]["income_allocated"] == 12000.00
        assert body["pool"]["unallocated"] == 6000.00
        rent = _envelope(body, "expenses", "Expenses:Rent")
        assert rent["allocated"] == 3000.00  # January's value, overwriting 3100

    def test_overwrite_leaves_no_duplicates(
        self, budget_client: TestClient
    ) -> None:
        # November has a DUPLICATE Rent directive. Copying into it overwrites
        # both, leaving exactly one Rent directive (January's 3000).
        budget_client.post(
            "/api/budget/copy",
            json={"from_month": "2024-01", "to_month": "2024-11"},
        )
        path = ledger_mod.get_ledger().beancount_file_path
        nov_rent = [
            ln
            for ln in Path(path).read_text().splitlines()
            if ln.startswith("2024-11-01")
            and "Expenses:Rent" in ln
            and 'custom "budget"' in ln
        ]
        assert len(nov_rent) == 1
        assert "3000" in nov_rent[0]

    def test_rejects_empty_source(self, budget_client: TestClient) -> None:
        r = budget_client.post(
            "/api/budget/copy",
            json={"from_month": "2024-09", "to_month": "2024-11"},
        )
        assert r.status_code == 400

    def test_copy_skips_excluded_type_directives(
        self, budget_client: TestClient
    ) -> None:
        # October has a legacy credit-card directive + a valid Rent one. Copying
        # to an empty month must carry the Rent envelope but drop the
        # now-excluded credit-card directive (PUT rejects it; copy must too).
        r = budget_client.post(
            "/api/budget/copy",
            json={"from_month": "2024-10", "to_month": "2025-01"},
        )
        assert r.status_code == 200
        body = r.json()
        expense_accounts = {
            e["account"] for e in _section(body, "expenses")["envelopes"]
        }
        assert "Expenses:Rent" in expense_accounts
        # The credit-card directive is not carried forward anywhere.
        all_accounts = {
            e["account"] for s in body["sections"] for e in s["envelopes"]
        }
        assert "Liabilities:CreditCard" not in all_accounts


class TestOverlapWarningEndToEnd:
    def test_overlapping_envelope_warning(self, budget_client: TestClient) -> None:
        # Budget the parent Expenses:Food while its descendant Restaurant is
        # already budgeted → overlap warning.
        budget_client.put(
            "/api/budget",
            json={
                "month": "2024-01",
                "account": "Expenses:Food",
                "amount": "800.00",
            },
        )
        body = budget_client.get("/api/budget?month=2024-01").json()
        assert any(
            "Expenses:Food:Restaurant" in w and "Expenses:Food" in w
            for w in body["warnings"]
        )


class TestDescendantAllocation:
    """v4 Change 1 — budgeting an untyped parent whose child is a loan works."""

    def test_is_budgetable_allocation_descendant(
        self, budget_ledger: FavaLedger
    ) -> None:
        type_map = build_account_type_map(budget_ledger.all_entries)
        # Untyped parent with a loan-typed child → budgetable.
        assert is_budgetable_allocation("Liabilities:Mortgage", type_map) is True
        # The typed child itself → budgetable.
        assert (
            is_budgetable_allocation("Liabilities:Mortgage:BankA", type_map) is True
        )
        # A cash account with no investment/loan descendant → not budgetable.
        assert is_budgetable_allocation("Assets:Bank:Checking", type_map) is False

    def test_parent_loan_budget_renders(self, budget_client: TestClient) -> None:
        # December: parent Liabilities:Mortgage is budgeted (800); the payment
        # posts to the typed child. The parent must appear in allocations with
        # the child's 800 rolled up.
        body = budget_client.get("/api/budget?month=2024-12").json()
        mortgage = _envelope(body, "allocations", "Liabilities:Mortgage")
        assert mortgage["allocated"] == 800.00
        assert mortgage["realized"] == 800.00
        assert mortgage["is_ghost"] is False

    def test_parent_loan_budget_accepted_at_write(
        self, budget_client: TestClient
    ) -> None:
        r = budget_client.put(
            "/api/budget",
            json={
                "month": "2024-03",
                "account": "Liabilities:Mortgage",
                "amount": "500",
            },
        )
        assert r.status_code == 200


class TestCashBridge:
    """v4 Change 2 — indirect-method bridge ties to the Cash Flow Statement."""

    def _cashflow_net(self, month: str) -> float:
        ledger = ledger_mod.get_ledger()
        year, mon = (int(x) for x in month.split("-"))
        start = datetime.date(year, mon, 1)
        end = (
            datetime.date(year + 1, 1, 1)
            if mon == 12
            else datetime.date(year, mon + 1, 1)
        )
        entries = get_filtered_entries(
            ledger, "combined", from_date=start, to_date=end
        )
        tm = build_account_type_map(ledger.all_entries)
        cf = compute_cashflow(entries, "monthly", "BRL", type_map=tm)
        return list(cf["net_cashflow"].values())[0]

    def test_bridge_ties_to_cashflow_jan(
        self, budget_client: TestClient
    ) -> None:
        body = budget_client.get("/api/budget?month=2024-01").json()
        ncf = body["bridge"]["net_cash_flow"]["realized"]
        assert ncf == self._cashflow_net("2024-01")

    def test_bridge_ties_to_cashflow_aug(
        self, budget_client: TestClient
    ) -> None:
        body = budget_client.get("/api/budget?month=2024-08").json()
        ncf = body["bridge"]["net_cash_flow"]["realized"]
        assert ncf == self._cashflow_net("2024-08")

    def test_bridge_components_sum(self, budget_client: TestClient) -> None:
        body = budget_client.get("/api/budget?month=2024-01").json()
        b = body["bridge"]
        inc = _section(body, "income")["subtotal"]["realized"]
        exp = _section(body, "expenses")["subtotal"]["realized"]
        # net_income = income - expenses
        assert b["net_income"]["realized"] == round(inc - exp, 2)
        # net_income - allocations - other = net_cash_flow
        assert round(
            b["net_income"]["realized"]
            - b["allocations"]["realized"]
            - b["other_non_cash"]["realized"],
            2,
        ) == b["net_cash_flow"]["realized"]

    def test_bridge_allocations_matches_section(
        self, budget_client: TestClient
    ) -> None:
        body = budget_client.get("/api/budget?month=2024-01").json()
        assert (
            body["bridge"]["allocations"]["realized"]
            == _section(body, "allocations")["subtotal"]["realized"]
        )

    def test_bridge_has_three_columns(self, budget_client: TestClient) -> None:
        body = budget_client.get("/api/budget?month=2024-01").json()
        for row in ("net_income", "allocations", "other_non_cash", "net_cash_flow"):
            assert set(body["bridge"][row].keys()) == {
                "allocated",
                "realized",
                "pending",
            }

    def test_allocated_column_is_projection(
        self, budget_client: TestClient
    ) -> None:
        # "Allocated = will-be": Net Cash Flow.allocated is the projected cash if
        # the plan plays out = budgeted income − budgeted expenses/allocations −
        # actual non-cash. It ties down the Allocated column like Realized does.
        body = budget_client.get("/api/budget?month=2024-01").json()
        b = body["bridge"]
        assert round(
            b["net_income"]["allocated"]
            - b["allocations"]["allocated"]
            - b["other_non_cash"]["allocated"],
            2,
        ) == b["net_cash_flow"]["allocated"]
        # net_income.allocated = budgeted income − budgeted expenses
        inc = _section(body, "income")["subtotal"]["allocated"]
        exp = _section(body, "expenses")["subtotal"]["allocated"]
        assert b["net_income"]["allocated"] == round(inc - exp, 2)

    def test_other_allocated_mirrors_realized(
        self, budget_client: TestClient
    ) -> None:
        # "Other non-cash" has no budget, so its Allocated mirrors its Realized.
        body = budget_client.get("/api/budget?month=2024-08").json()
        other = body["bridge"]["other_non_cash"]
        assert other["allocated"] == other["realized"]


class TestSumCashDelta:
    def test_sums_only_cash_accounts(self, budget_ledger: FavaLedger) -> None:
        type_map = build_account_type_map(budget_ledger.all_entries)
        entries = get_filtered_entries(
            budget_ledger,
            "combined",
            from_date=datetime.date(2024, 12, 1),
            to_date=datetime.date(2025, 1, 1),
        )
        # December has only the 800 mortgage payment: cash out 800.
        assert sum_cash_delta(entries, "BRL", "combined", type_map) == Decimal(
            "-800.00"
        )


class TestInvalidMonth:
    def test_bad_month_format(self, budget_client: TestClient) -> None:
        r = budget_client.get("/api/budget?month=2024-13")
        assert r.status_code == 400
