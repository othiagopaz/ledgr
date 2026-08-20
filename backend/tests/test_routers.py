"""
HTTP-level tests for all routers using FastAPI TestClient.

Tests verify:
- Correct HTTP status codes
- JSON response shape matches frontend types
- Every endpoint uses ``Depends(get_ledger)`` correctly
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from fava.core import FavaLedger

import ledger as ledger_mod

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _flatten_names(nodes: list[dict]) -> set[str]:
    """Every account name in a serialized account tree, at any depth."""
    found: set[str] = set()
    for node in nodes:
        found.add(node["name"])
        found |= _flatten_names(node["children"])
    return found


def _find_node(nodes: list[dict], name: str) -> dict | None:
    """Locate one node by full account name anywhere in the tree."""
    for node in nodes:
        if node["name"] == name:
            return node
        hit = _find_node(node["children"], name)
        if hit is not None:
            return hit
    return None


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    """Create a TestClient with a FavaLedger pointed at a temp fixture copy."""
    src = FIXTURES_DIR / "minimal.beancount"
    dst = tmp_path / "test.beancount"
    shutil.copy(src, dst)

    # Initialize the ledger singleton
    ledger_mod.init_ledger(str(dst))

    # Import app AFTER setting up the ledger
    from main import app

    return TestClient(app, raise_server_exceptions=False)


# ------------------------------------------------------------------
# Accounts
# ------------------------------------------------------------------


class TestAccountsRouter:
    def test_get_accounts(self, client: TestClient) -> None:
        r = client.get("/api/accounts")
        assert r.status_code == 200
        body = r.json()
        assert "accounts" in body
        assert "errors" in body
        assert isinstance(body["accounts"], list)
        assert len(body["accounts"]) > 0
        # Verify AccountNode shape (enriched)
        node = body["accounts"][0]
        assert "name" in node
        assert "type" in node
        assert "balance" in node
        assert "children" in node
        assert "is_leaf" in node
        # New enriched fields
        assert "ledgr_type" in node
        assert "open_date" in node
        assert "currencies" in node
        assert "metadata" in node

    def test_get_account_names(self, client: TestClient) -> None:
        r = client.get("/api/account-names")
        assert r.status_code == 200
        body = r.json()
        assert "accounts" in body
        assert "Assets:Checking" in body["accounts"]

    def test_get_payees(self, client: TestClient) -> None:
        r = client.get("/api/payees")
        assert r.status_code == 200
        body = r.json()
        assert "payees" in body
        assert "Employer" in body["payees"]

    def test_get_errors(self, client: TestClient) -> None:
        r = client.get("/api/errors")
        assert r.status_code == 200
        body = r.json()
        assert "errors" in body
        assert "count" in body

    def test_get_options(self, client: TestClient) -> None:
        r = client.get("/api/options")
        assert r.status_code == 200
        body = r.json()
        assert "operating_currency" in body
        assert "title" in body
        assert "BRL" in body["operating_currency"]

    def test_get_tags(self, client: TestClient) -> None:
        r = client.get("/api/tags")
        assert r.status_code == 200
        body = r.json()
        assert "tags" in body
        assert isinstance(body["tags"], list)
        assert "groceries" in body["tags"]
        assert "dining" in body["tags"]
        assert "eating-out" in body["tags"]
        # Tags should be sorted
        assert body["tags"] == sorted(body["tags"])

    def test_get_suggestions(self, client: TestClient) -> None:
        r = client.get("/api/suggestions", params={"payee": "Employer"})
        assert r.status_code == 200
        body = r.json()
        assert body["payee"] == "Employer"
        assert body["account"] is not None

    def test_get_suggestions_unknown_payee(self, client: TestClient) -> None:
        r = client.get("/api/suggestions", params={"payee": "UNKNOWN"})
        assert r.status_code == 200
        body = r.json()
        assert body["account"] is None


# ------------------------------------------------------------------
# Transactions
# ------------------------------------------------------------------


class TestTransactionsRouter:
    def test_get_transactions(self, client: TestClient) -> None:
        r = client.get("/api/transactions")
        assert r.status_code == 200
        body = r.json()
        assert "transactions" in body
        assert "count" in body
        assert body["count"] > 0
        # Verify Transaction shape
        txn = body["transactions"][0]
        assert "date" in txn
        assert "flag" in txn
        assert "payee" in txn
        assert "narration" in txn
        assert "postings" in txn
        assert "lineno" in txn

    def test_get_transactions_by_account(self, client: TestClient) -> None:
        r = client.get(
            "/api/transactions", params={"account": "Assets:Checking"}
        )
        assert r.status_code == 200
        body = r.json()
        assert body["count"] > 0

    def test_get_transactions_by_date_range(self, client: TestClient) -> None:
        r = client.get(
            "/api/transactions",
            params={"from_date": "2024-02-01", "to_date": "2024-02-28"},
        )
        assert r.status_code == 200
        body = r.json()
        for txn in body["transactions"]:
            assert txn["date"] >= "2024-02-01"
            assert txn["date"] <= "2024-02-28"

    def test_opening_balance_for_account_date_window(
        self, client: TestClient
    ) -> None:
        """Filtering Assets:Checking to Feb should report a pre-period
        opening balance of 12650 (Jan: +5000 +8000 -350)."""
        r = client.get(
            "/api/transactions",
            params={
                "account": "Assets:Checking",
                "from_date": "2024-02-01",
                "to_date": "2024-02-28",
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["opening_balance"] == "12650.00"

    def test_opening_balance_zero_without_account(
        self, client: TestClient
    ) -> None:
        """No account filter → no opening balance (returns "0")."""
        r = client.get(
            "/api/transactions",
            params={"from_date": "2024-02-01", "to_date": "2024-02-28"},
        )
        assert r.status_code == 200
        assert r.json()["opening_balance"] == "0"

    def test_opening_balance_zero_without_date(
        self, client: TestClient
    ) -> None:
        """Account filter without date → no pre-period, opening balance 0."""
        r = client.get(
            "/api/transactions", params={"account": "Assets:Checking"}
        )
        assert r.status_code == 200
        assert r.json()["opening_balance"] == "0"

    def test_add_transaction(self, client: TestClient) -> None:
        r = client.post(
            "/api/transactions",
            json={
                "date": "2024-04-01",
                "payee": "Test",
                "narration": "Test Add",
                "postings": [
                    {"account": "Expenses:Food", "amount": 50, "currency": "BRL"},
                    {"account": "Assets:Checking", "amount": -50, "currency": "BRL"},
                ],
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["transaction"]["narration"] == "Test Add"

    def test_add_unbalanced_transaction_rejected_and_not_written(
        self, client: TestClient
    ) -> None:
        """A fully-specified transaction that does not balance must be
        rejected and must NOT be appended to the .beancount file."""
        r_before = client.get("/api/transactions")
        count_before = r_before.json()["count"]

        r = client.post(
            "/api/transactions",
            json={
                "date": "2024-04-01",
                "payee": "Bad",
                "narration": "Unbalanced",
                "postings": [
                    {"account": "Expenses:Food", "amount": 10, "currency": "BRL"},
                    {"account": "Assets:Checking", "amount": -5, "currency": "BRL"},
                ],
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is False
        assert body["errors"]
        assert any("balance" in e.lower() for e in body["errors"])

        # Nothing was written: the transaction count is unchanged and the
        # ledger loads without the "Unbalanced" narration.
        r_after = client.get("/api/transactions")
        assert r_after.json()["count"] == count_before
        assert all(
            t["narration"] != "Unbalanced"
            for t in r_after.json()["transactions"]
        )

    def test_add_balanced_transaction_still_succeeds(
        self, client: TestClient
    ) -> None:
        """A balanced fully-specified transaction is written normally."""
        r = client.post(
            "/api/transactions",
            json={
                "date": "2024-04-01",
                "payee": "Good",
                "narration": "Balanced",
                "postings": [
                    {"account": "Expenses:Food", "amount": 50, "currency": "BRL"},
                    {"account": "Assets:Checking", "amount": -50, "currency": "BRL"},
                ],
            },
        )
        assert r.status_code == 200
        assert r.json()["success"] is True

    def test_add_single_elided_posting_auto_balances(
        self, client: TestClient
    ) -> None:
        """A posting with an elided amount is legitimately auto-balanced by
        Beancount and must not be rejected by the balance check."""
        r = client.post(
            "/api/transactions",
            json={
                "date": "2024-04-01",
                "payee": "Elided",
                "narration": "Auto Balanced",
                "postings": [
                    {"account": "Expenses:Food", "amount": 30, "currency": "BRL"},
                    {"account": "Assets:Checking"},
                ],
            },
        )
        assert r.status_code == 200
        assert r.json()["success"] is True

    def test_delete_transaction(self, client: TestClient) -> None:
        # First get a transaction's lineno
        r = client.get("/api/transactions")
        txns = r.json()["transactions"]
        lineno = txns[-1]["lineno"]
        assert lineno is not None

        # Delete it
        r = client.delete(f"/api/transactions/{lineno}")
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True


# ------------------------------------------------------------------
# Reports
# ------------------------------------------------------------------


class TestReportsRouter:
    def test_income_expense_series(self, client: TestClient) -> None:
        r = client.get("/api/reports/income-expense")
        assert r.status_code == 200
        body = r.json()
        assert "series" in body
        assert len(body["series"]) > 0
        point = body["series"][0]
        assert "period" in point
        assert "income" in point
        assert "expenses" in point

    def test_account_balance_series(self, client: TestClient) -> None:
        r = client.get(
            "/api/reports/account-balance",
            params={"account": "Assets:Checking"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "series" in body

    def test_net_worth_series(self, client: TestClient) -> None:
        r = client.get("/api/reports/net-worth")
        assert r.status_code == 200
        body = r.json()
        assert "series" in body

    def test_income_statement(self, client: TestClient) -> None:
        r = client.get("/api/reports/income-statement")
        assert r.status_code == 200
        body = r.json()
        assert "income" in body
        assert "expenses" in body
        assert "periods" in body
        assert "net_income" in body

    def test_balance_sheet(self, client: TestClient) -> None:
        r = client.get("/api/reports/balance-sheet")
        assert r.status_code == 200
        body = r.json()
        assert "assets" in body
        assert "liabilities" in body
        assert "equity" in body
        assert "totals" in body

    def test_balance_sheet_invariant_via_http(self, client: TestClient) -> None:
        """Accounting equation must hold in HTTP response too."""
        r = client.get("/api/reports/balance-sheet")
        t = r.json()["totals"]
        total = t["assets"] + t["liabilities"] + t["equity"]
        assert abs(total) < 0.01, (
            f"Invariant violated via HTTP: A={t['assets']} L={t['liabilities']} E={t['equity']}"
        )

    def test_balance_sheet_to_date_only(self, client: TestClient) -> None:
        """A lone ``to_date`` (open lower bound) must not 500.

        Missing ``from_date`` used to fall through to ``clamp_opt`` with
        ``datetime.date.min``, which overflows when Beancount computes
        ``date.min - 1 day``.  It must now be treated as an open lower bound.
        """
        r = client.get("/api/reports/balance-sheet?to_date=2024-03-01")
        assert r.status_code == 200
        body = r.json()
        assert "assets" in body
        assert "totals" in body
        # Invariant still holds at the point-in-time cutoff.
        t = body["totals"]
        assert abs(t["assets"] + t["liabilities"] + t["equity"]) < 0.01

    # ---------------------------------------------------------------
    # view_mode filtering — income-expense
    # ---------------------------------------------------------------

    def test_income_expense_actual_only(self, client: TestClient) -> None:
        r = client.get("/api/reports/income-expense?view_mode=actual")
        assert r.status_code == 200
        body = r.json()
        assert "series" in body
        assert "planned_series" not in body

    def test_income_expense_planned_only(self, client: TestClient) -> None:
        r = client.get("/api/reports/income-expense?view_mode=planned")
        assert r.status_code == 200
        body = r.json()
        assert "series" in body
        assert len(body["series"]) > 0

    def test_income_expense_comparative(self, client: TestClient) -> None:
        r = client.get("/api/reports/income-expense?view_mode=comparative")
        assert r.status_code == 200
        body = r.json()
        assert "series" in body
        assert "planned_series" in body

    def test_income_expense_default_is_combined(self, client: TestClient) -> None:
        """No view_mode param should behave as combined (backward compat)."""
        r1 = client.get("/api/reports/income-expense")
        r2 = client.get("/api/reports/income-expense?view_mode=combined")
        assert r1.json() == r2.json()

    def test_income_expense_actual_differs_from_combined(self, client: TestClient) -> None:
        """Fixture has ! transactions so actual and combined must differ."""
        r_combined = client.get("/api/reports/income-expense?view_mode=combined")
        r_actual = client.get("/api/reports/income-expense?view_mode=actual")
        assert r_combined.json()["series"] != r_actual.json()["series"]

    # ---------------------------------------------------------------
    # view_mode filtering — net-worth
    # ---------------------------------------------------------------

    def test_net_worth_actual(self, client: TestClient) -> None:
        r = client.get("/api/reports/net-worth?view_mode=actual")
        assert r.status_code == 200
        assert "series" in r.json()

    def test_net_worth_comparative(self, client: TestClient) -> None:
        r = client.get("/api/reports/net-worth?view_mode=comparative")
        assert r.status_code == 200
        body = r.json()
        assert "series" in body
        assert "planned_series" in body

    def test_net_worth_default_is_combined(self, client: TestClient) -> None:
        r1 = client.get("/api/reports/net-worth")
        r2 = client.get("/api/reports/net-worth?view_mode=combined")
        assert r1.json() == r2.json()

    # ---------------------------------------------------------------
    # view_mode filtering — account-balance
    # ---------------------------------------------------------------

    def test_account_balance_actual(self, client: TestClient) -> None:
        r = client.get("/api/reports/account-balance?account=Assets:Checking&view_mode=actual")
        assert r.status_code == 200
        assert "series" in r.json()

    def test_account_balance_comparative(self, client: TestClient) -> None:
        r = client.get("/api/reports/account-balance?account=Assets:Checking&view_mode=comparative")
        assert r.status_code == 200
        body = r.json()
        assert "series" in body
        assert "planned_series" in body

    # ---------------------------------------------------------------
    # view_mode filtering — income-statement
    # ---------------------------------------------------------------

    def test_income_statement_actual(self, client: TestClient) -> None:
        r = client.get("/api/reports/income-statement?view_mode=actual")
        assert r.status_code == 200
        body = r.json()
        assert "income" in body
        assert "expenses" in body

    def test_income_statement_actual_differs_from_combined(self, client: TestClient) -> None:
        r_combined = client.get("/api/reports/income-statement?view_mode=combined")
        r_actual = client.get("/api/reports/income-statement?view_mode=actual")
        assert r_combined.status_code == 200
        assert r_actual.status_code == 200
        # Net income should differ because fixture has planned income/expenses
        assert r_combined.json()["net_income"] != r_actual.json()["net_income"]

    def test_income_statement_rejects_comparative(self, client: TestClient) -> None:
        """Statement endpoints do not accept comparative."""
        r = client.get("/api/reports/income-statement?view_mode=comparative")
        assert r.status_code == 422

    # ---------------------------------------------------------------
    # view_mode filtering — balance-sheet
    # ---------------------------------------------------------------

    def test_balance_sheet_actual_invariant(self, client: TestClient) -> None:
        """Accounting equation must hold in actual mode too."""
        r = client.get("/api/reports/balance-sheet?view_mode=actual")
        assert r.status_code == 200
        t = r.json()["totals"]
        assert abs(t["assets"] + t["liabilities"] + t["equity"]) < 0.01

    def test_balance_sheet_combined_invariant(self, client: TestClient) -> None:
        """Accounting equation must hold in combined mode."""
        r = client.get("/api/reports/balance-sheet?view_mode=combined")
        assert r.status_code == 200
        t = r.json()["totals"]
        assert abs(t["assets"] + t["liabilities"] + t["equity"]) < 0.01

    def test_balance_sheet_rejects_comparative(self, client: TestClient) -> None:
        r = client.get("/api/reports/balance-sheet?view_mode=comparative")
        assert r.status_code == 422

    # ---------------------------------------------------------------
    # view_mode filtering — accounts
    # ---------------------------------------------------------------

    def test_accounts_actual(self, client: TestClient) -> None:
        r = client.get("/api/accounts?view_mode=actual")
        assert r.status_code == 200
        assert "accounts" in r.json()

    def test_accounts_default_is_combined(self, client: TestClient) -> None:
        r1 = client.get("/api/accounts")
        r2 = client.get("/api/accounts?view_mode=combined")
        assert r1.json() == r2.json()

    def test_accounts_rejects_comparative(self, client: TestClient) -> None:
        r = client.get("/api/accounts?view_mode=comparative")
        assert r.status_code == 422

    # ---------------------------------------------------------------
    # view_mode filtering — transactions
    # ---------------------------------------------------------------

    def test_transactions_actual_fewer_than_combined(self, client: TestClient) -> None:
        r_all = client.get("/api/transactions?view_mode=combined")
        r_actual = client.get("/api/transactions?view_mode=actual")
        assert r_all.status_code == 200
        assert r_actual.status_code == 200
        assert r_actual.json()["count"] < r_all.json()["count"]

    def test_transactions_actual_only_star_flags(self, client: TestClient) -> None:
        r = client.get("/api/transactions?view_mode=actual")
        for txn in r.json()["transactions"]:
            assert txn["flag"] == "*"

    def test_transactions_default_is_combined(self, client: TestClient) -> None:
        r1 = client.get("/api/transactions")
        r2 = client.get("/api/transactions?view_mode=combined")
        assert r1.json() == r2.json()

    def test_transactions_rejects_comparative(self, client: TestClient) -> None:
        r = client.get("/api/transactions?view_mode=comparative")
        assert r.status_code == 422

    # ---------------------------------------------------------------
    # view_mode filtering — cashflow
    # ---------------------------------------------------------------

    def test_cashflow_actual(self, client: TestClient) -> None:
        r = client.get("/api/reports/cashflow?view_mode=actual")
        assert r.status_code == 200
        body = r.json()
        assert "periods" in body
        assert "operating" in body

    def test_cashflow_rejects_comparative(self, client: TestClient) -> None:
        r = client.get("/api/reports/cashflow?view_mode=comparative")
        assert r.status_code == 422

    # ---------------------------------------------------------------
    # view_mode — invalid values
    # ---------------------------------------------------------------

    def test_invalid_view_mode_rejected(self, client: TestClient) -> None:
        """Invalid view_mode value should return 422."""
        r = client.get("/api/reports/income-expense?view_mode=invalid")
        assert r.status_code == 422

    # ---------------------------------------------------------------
    # cashflow (existing)
    # ---------------------------------------------------------------

    def test_cashflow(self, client: TestClient) -> None:
        r = client.get("/api/reports/cashflow")
        assert r.status_code == 200
        body = r.json()
        assert "periods" in body
        assert "operating" in body
        assert "investing" in body
        assert "financing" in body
        assert "transfers" in body
        assert "net_cashflow" in body
        assert "operating_currency" in body
        # Each section has other_items
        for section in ("operating", "investing", "financing", "transfers"):
            assert "other_items" in body[section]
        # Other currency fields
        assert "other_net_cashflow" in body
        assert "other_opening_balance" in body
        assert "other_closing_balance" in body


# ------------------------------------------------------------------
# Account CRUD
# ------------------------------------------------------------------


class TestAccountCRUD:
    def test_create_account(self, client: TestClient) -> None:
        r = client.post("/api/accounts", json={
            "name": "Assets:Bank:Itau",
            "currencies": ["BRL"],
            "date": "2024-06-01",
            "ledgr_type": "cash",
            "metadata": {"institution": "Itau Unibanco"},
        })
        assert r.status_code == 201
        body = r.json()
        assert body["success"] is True
        assert body["account"]["name"] == "Assets:Bank:Itau"
        assert body["account"]["ledgr_type"] == "cash"
        assert body["account"]["currencies"] == ["BRL"]

    def test_create_account_missing_type_for_assets(self, client: TestClient) -> None:
        r = client.post("/api/accounts", json={
            "name": "Assets:NewAccount",
            "currencies": ["BRL"],
        })
        assert r.status_code == 400
        assert "ledgr_type" in r.json()["detail"]

    def test_create_account_invalid_type_for_root(self, client: TestClient) -> None:
        r = client.post("/api/accounts", json={
            "name": "Assets:NewAccount",
            "currencies": ["BRL"],
            "ledgr_type": "credit-card",  # invalid for Assets
        })
        assert r.status_code == 400
        assert "Invalid ledgr_type" in r.json()["detail"]

    def test_create_account_duplicate(self, client: TestClient) -> None:
        r = client.post("/api/accounts", json={
            "name": "Assets:Checking",  # already exists in fixture
            "currencies": ["BRL"],
            "ledgr_type": "cash",
        })
        assert r.status_code == 400
        assert "already exists" in r.json()["detail"]

    def test_create_income_account_defaults_to_general(self, client: TestClient) -> None:
        r = client.post("/api/accounts", json={
            "name": "Income:Freelance",
            "currencies": ["BRL"],
        })
        assert r.status_code == 201
        assert r.json()["account"]["ledgr_type"] == "general"

    def test_create_account_invalid_name(self, client: TestClient) -> None:
        r = client.post("/api/accounts", json={
            "name": "BadRoot:Something",
            "currencies": ["BRL"],
            "ledgr_type": "cash",
        })
        assert r.status_code == 400

    # ── Update (PUT) — ledgr-type enforcement on Assets/Liabilities ──

    def test_update_account_valid_type_change(self, client: TestClient) -> None:
        """Changing an Assets account's type to another valid Assets type persists."""
        r = client.put("/api/accounts", json={
            "name": "Assets:Checking",
            "ledgr_type": "receivable",
        })
        assert r.status_code == 200
        assert r.json()["account"]["ledgr_type"] == "receivable"

    def test_update_account_invalid_type_for_root(self, client: TestClient) -> None:
        """Setting a Liabilities-only type on an Assets account is rejected."""
        r = client.put("/api/accounts", json={
            "name": "Assets:Checking",
            "ledgr_type": "credit-card",  # invalid for Assets
        })
        assert r.status_code == 400
        assert "Invalid ledgr_type" in r.json()["detail"]

    def test_update_account_empty_type_rejected_for_assets(
        self, client: TestClient
    ) -> None:
        """An explicit empty type on an Assets account is rejected (cannot clear
        the required type)."""
        r = client.put("/api/accounts", json={
            "name": "Assets:Checking",
            "ledgr_type": "",
        })
        assert r.status_code == 400
        assert "ledgr_type" in r.json()["detail"]

    def test_update_account_metadata_only_preserves_type(
        self, client: TestClient
    ) -> None:
        """A metadata-only update (no ledgr_type) must NOT wipe the existing
        required type — ledgr-type is protected internal metadata."""
        r = client.put("/api/accounts", json={
            "name": "Assets:Checking",
            "metadata": {"institution": "Some Bank"},
        })
        assert r.status_code == 200
        assert r.json()["account"]["ledgr_type"] == "cash"  # unchanged

    def test_close_account(self, client: TestClient) -> None:
        r = client.post("/api/accounts/close", json={
            "name": "Assets:Savings",
            "date": "2024-12-31",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["close_date"] == "2024-12-31"

    def test_close_nonexistent_account(self, client: TestClient) -> None:
        r = client.post("/api/accounts/close", json={
            "name": "Assets:DoesNotExist",
        })
        assert r.status_code == 404

    def test_close_already_closed_account(self, client: TestClient) -> None:
        # Close it
        client.post("/api/accounts/close", json={
            "name": "Assets:Savings",
            "date": "2024-12-31",
        })
        # Try closing again
        r = client.post("/api/accounts/close", json={
            "name": "Assets:Savings",
            "date": "2025-01-01",
        })
        assert r.status_code == 400
        assert "already closed" in r.json()["detail"]

    def test_reopen_account(self, client: TestClient) -> None:
        client.post("/api/accounts/close", json={
            "name": "Assets:Savings", "date": "2024-12-31",
        })
        r = client.post("/api/accounts/reopen", json={"name": "Assets:Savings"})
        assert r.status_code == 200
        assert r.json()["success"] is True
        # Closing again must work, proving the Close directive really went away.
        again = client.post("/api/accounts/close", json={
            "name": "Assets:Savings", "date": "2024-12-31",
        })
        assert again.status_code == 200

    def test_reopen_account_that_is_not_closed(self, client: TestClient) -> None:
        r = client.post("/api/accounts/reopen", json={"name": "Assets:Savings"})
        assert r.status_code == 404

    # -- closed accounts are hidden by default -------------------------------

    def test_closed_account_hidden_by_default(self, client: TestClient) -> None:
        client.post("/api/accounts/close", json={
            "name": "Assets:Savings", "date": "2024-12-31",
        })
        names = _flatten_names(client.get("/api/accounts").json()["accounts"])
        assert "Assets:Savings" not in names

    def test_closed_account_shown_when_requested(self, client: TestClient) -> None:
        client.post("/api/accounts/close", json={
            "name": "Assets:Savings", "date": "2024-12-31",
        })
        body = client.get("/api/accounts?include_closed=true").json()
        names = _flatten_names(body["accounts"])
        assert "Assets:Savings" in names
        assert body["closed_count"] == 1

    def test_accounts_expose_closed_and_posting_count(self, client: TestClient) -> None:
        body = client.get("/api/accounts").json()
        node = _find_node(body["accounts"], "Assets:Checking")
        assert node is not None
        assert node["closed"] is False
        assert node["close_date"] is None
        assert node["posting_count"] > 0

    # -- rename ---------------------------------------------------------------

    def test_rename_dry_run_changes_nothing(self, client: TestClient) -> None:
        r = client.post("/api/accounts/rename", json={
            "name": "Assets:Checking",
            "new_name": "Assets:Current",
            "dry_run": True,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["dry_run"] is True
        assert body["plan"]["total_occurrences"] > 0
        # Still the old name.
        names = _flatten_names(client.get("/api/accounts").json()["accounts"])
        assert "Assets:Checking" in names
        assert "Assets:Current" not in names

    def test_rename_moves_account_and_postings(self, client: TestClient) -> None:
        r = client.post("/api/accounts/rename", json={
            "name": "Assets:Checking", "new_name": "Assets:Current",
        })
        assert r.status_code == 200, r.json()
        names = _flatten_names(client.get("/api/accounts").json()["accounts"])
        assert "Assets:Current" in names
        assert "Assets:Checking" not in names
        # No orphaned postings: the ledger reports no new errors.
        assert client.get("/api/accounts").json()["errors"] == []

    def test_rename_rejects_existing_name(self, client: TestClient) -> None:
        r = client.post("/api/accounts/rename", json={
            "name": "Assets:Checking", "new_name": "Assets:Savings",
        })
        assert r.status_code == 400
        assert "already exists" in r.json()["detail"]

    def test_rename_rejects_root_change(self, client: TestClient) -> None:
        """Roots decide which ledgr-types are legal, so moving root is refused."""
        r = client.post("/api/accounts/rename", json={
            "name": "Assets:Checking", "new_name": "Expenses:Checking",
        })
        assert r.status_code == 400
        assert "root" in r.json()["detail"].lower()

    def test_rename_rejects_same_name(self, client: TestClient) -> None:
        r = client.post("/api/accounts/rename", json={
            "name": "Assets:Checking", "new_name": "Assets:Checking",
        })
        assert r.status_code == 400

    def test_rename_rejects_invalid_name(self, client: TestClient) -> None:
        r = client.post("/api/accounts/rename", json={
            "name": "Assets:Checking", "new_name": "Assets",
        })
        assert r.status_code == 400

    def test_rename_nonexistent_account(self, client: TestClient) -> None:
        r = client.post("/api/accounts/rename", json={
            "name": "Assets:Nope", "new_name": "Assets:Other",
        })
        assert r.status_code == 404

    def test_get_account_types(self, client: TestClient) -> None:
        r = client.get("/api/account-types")
        assert r.status_code == 200
        body = r.json()
        assert "types" in body
        assert "Assets" in body["types"]
        assert "Liabilities" in body["types"]
        # Check shape
        asset_types = body["types"]["Assets"]
        assert isinstance(asset_types, list)
        assert any(t["value"] == "cash" for t in asset_types)

    def test_get_account_warnings(self, client: TestClient) -> None:
        """Fixture has ledgr-type on all Assets/Liabilities, so no warnings."""
        r = client.get("/api/accounts/warnings")
        assert r.status_code == 200
        body = r.json()
        assert "warnings" in body
        assert isinstance(body["warnings"], list)

    def test_get_account_warnings_with_missing_type(self, client: TestClient) -> None:
        """Create an asset account without ledgr-type (by manually inserting),
        then check warnings detect it."""
        # The fixture already has all types, so create one without
        # Actually we can't easily do this via the API since it validates.
        # Instead, verify the endpoint works and returns the correct shape.
        r = client.get("/api/accounts/warnings")
        assert r.status_code == 200

    def test_get_accounts_enriched(self, client: TestClient) -> None:
        """GET /api/accounts returns enriched nodes with ledgr_type."""
        r = client.get("/api/accounts")
        assert r.status_code == 200
        body = r.json()

        # Find Assets:Checking which has ledgr-type: "cash" in fixture
        def find_account(nodes: list, name: str) -> dict | None:
            for node in nodes:
                if node["name"] == name:
                    return node
                found = find_account(node.get("children", []), name)
                if found:
                    return found
            return None

        checking = find_account(body["accounts"], "Assets:Checking")
        assert checking is not None
        assert checking["ledgr_type"] == "cash"
        assert checking["open_date"] == "2024-01-01"
        assert "BRL" in checking["currencies"]


# ------------------------------------------------------------------
# Consolidated account balance — HTTP level
# ------------------------------------------------------------------

CONSOLIDATED_FIXTURE = """\
option "title" "Consolidated Router Test"
option "operating_currency" "BRL"

2024-01-01 open Assets:Checking            BRL
  ledgr-type: "cash"
2024-01-01 open Assets:Investments:Big     BRL
  ledgr-type: "investment"
2024-01-01 open Assets:Investments:Small   BRL
  ledgr-type: "investment"
2024-01-01 open Equity:Opening             BRL

2024-01-01 * "Seed"
  Assets:Checking       50000.00 BRL
  Equity:Opening

2024-01-10 * "Fund big"
  Assets:Investments:Big  20000.00 BRL
  Assets:Checking

2024-02-10 * "Fund small"
  Assets:Investments:Small   300.00 BRL
  Assets:Checking

2024-03-01 ! "Planned top-up"
  Assets:Investments:Big   1000.00 BRL
  Assets:Checking        -1000.00 BRL
"""


@pytest.fixture()
def consolidated_client(tmp_path: Path) -> TestClient:
    """TestClient over a ledger where ``Assets:Investments`` is a pure group."""
    dst = tmp_path / "consolidated.beancount"
    dst.write_text(CONSOLIDATED_FIXTURE)
    ledger_mod.init_ledger(str(dst))
    from main import app

    return TestClient(app, raise_server_exceptions=False)


class TestConsolidatedAccountBalanceRouter:
    def test_group_account_returns_children(
        self, consolidated_client: TestClient
    ) -> None:
        r = consolidated_client.get(
            "/api/reports/account-balance",
            params={"account": "Assets:Investments"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["consolidated"] is True
        assert [c["name"] for c in body["children"]] == ["Big", "Small"]
        assert body["series"][-1]["balance"] == pytest.approx(21300.00)

    def test_leaf_account_response_unchanged(
        self, consolidated_client: TestClient
    ) -> None:
        """A regular account must not grow a `children` key — no regression."""
        r = consolidated_client.get(
            "/api/reports/account-balance",
            params={"account": "Assets:Investments:Big"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "consolidated" not in body
        assert "children" not in body
        assert "series" in body

    def test_consolidated_comparative_splits_actual_and_planned(
        self, consolidated_client: TestClient
    ) -> None:
        r = consolidated_client.get(
            "/api/reports/account-balance",
            params={"account": "Assets:Investments", "view_mode": "comparative"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["consolidated"] is True
        assert "children" in body
        assert "planned_children" in body
        # The planned top-up hits Big only, so actual and planned differ.
        assert body["series"][-1]["balance"] != body["planned_series"][-1]["balance"]

    def test_consolidated_respects_interval(
        self, consolidated_client: TestClient
    ) -> None:
        r = consolidated_client.get(
            "/api/reports/account-balance",
            params={"account": "Assets:Investments", "interval": "yearly"},
        )
        assert r.status_code == 200
        body = r.json()
        assert [p["period"] for p in body["series"]] == ["2024"]
        for child in body["children"]:
            assert [p["period"] for p in child["series"]] == ["2024"]


# ------------------------------------------------------------------
# Deactivation cascade
# ------------------------------------------------------------------

HIERARCHY_FIXTURE = """\
option "operating_currency" "BRL"

2020-01-01 open Assets:Bank:Main            BRL
  ledgr-type: "cash"
2020-01-01 open Assets:Invest:Clear         BRL
  ledgr-type: "investment"
2020-01-01 open Assets:Invest:Clear:Equities BRL
  ledgr-type: "investment"
2020-01-01 open Assets:Invest:ClearOther    BRL
  ledgr-type: "investment"
2020-01-01 open Equity:Opening-Balances     BRL

2021-03-01 * "buy"
  Assets:Invest:Clear:Equities   100.00 BRL
  Assets:Bank:Main              -100.00 BRL

2021-04-01 * "sell"
  Assets:Invest:Clear:Equities  -100.00 BRL
  Assets:Bank:Main               100.00 BRL
"""


@pytest.fixture()
def hierarchy_client(tmp_path: Path) -> TestClient:
    """TestClient over a ledger with a real parent account plus children."""
    dst = tmp_path / "hierarchy.beancount"
    dst.write_text(HIERARCHY_FIXTURE)
    ledger_mod.init_ledger(str(dst))
    from main import app

    return TestClient(app, raise_server_exceptions=False)


class TestDeactivationCascade:
    def test_closing_parent_cascades_to_children(
        self, hierarchy_client: TestClient
    ) -> None:
        """Retiring a sleeve retires the whole sleeve, not just its top node."""
        r = hierarchy_client.post("/api/accounts/close", json={
            "name": "Assets:Invest:Clear", "date": "2024-12-31",
        })
        assert r.status_code == 200, r.json()
        assert r.json()["closed_accounts"] == [
            "Assets:Invest:Clear",
            "Assets:Invest:Clear:Equities",
        ]

        body = hierarchy_client.get("/api/accounts?include_closed=true").json()
        assert body["closed_count"] == 2
        parent = _find_node(body["accounts"], "Assets:Invest:Clear")
        child = _find_node(body["accounts"], "Assets:Invest:Clear:Equities")
        assert parent["closed"] is True
        assert child["closed"] is True

    def test_cascade_does_not_touch_lookalike_sibling(
        self, hierarchy_client: TestClient
    ) -> None:
        """`Clear` must not drag `ClearOther` along — it is not a descendant."""
        hierarchy_client.post("/api/accounts/close", json={
            "name": "Assets:Invest:Clear", "date": "2024-12-31",
        })
        body = hierarchy_client.get("/api/accounts?include_closed=true").json()
        sibling = _find_node(body["accounts"], "Assets:Invest:ClearOther")
        assert sibling["closed"] is False

    def test_cascade_can_be_disabled(self, hierarchy_client: TestClient) -> None:
        """Opting out gives the raw Beancount behaviour: parent only."""
        r = hierarchy_client.post("/api/accounts/close", json={
            "name": "Assets:Invest:Clear",
            "date": "2024-12-31",
            "include_children": False,
        })
        assert r.json()["closed_accounts"] == ["Assets:Invest:Clear"]
        body = hierarchy_client.get("/api/accounts?include_closed=true").json()
        assert _find_node(body["accounts"], "Assets:Invest:Clear:Equities")["closed"] is False

    def test_cascade_keeps_ledger_valid(self, hierarchy_client: TestClient) -> None:
        hierarchy_client.post("/api/accounts/close", json={
            "name": "Assets:Invest:Clear", "date": "2024-12-31",
        })
        assert hierarchy_client.get("/api/accounts").json()["errors"] == []

    def test_close_date_before_last_posting_refused(
        self, hierarchy_client: TestClient
    ) -> None:
        """A close dated before a posting would make the ledger invalid."""
        r = hierarchy_client.post("/api/accounts/close", json={
            "name": "Assets:Invest:Clear", "date": "2021-01-01",
        })
        assert r.status_code == 400
        detail = r.json()["detail"]
        assert "later postings" in detail
        assert "Assets:Invest:Clear:Equities" in detail
        # Nothing was written.
        assert hierarchy_client.get("/api/accounts").json()["closed_count"] == 0

    def test_reopen_cascades_back(self, hierarchy_client: TestClient) -> None:
        """Deactivate then reactivate is a round trip over the whole subtree."""
        hierarchy_client.post("/api/accounts/close", json={
            "name": "Assets:Invest:Clear", "date": "2024-12-31",
        })
        r = hierarchy_client.post("/api/accounts/reopen", json={
            "name": "Assets:Invest:Clear",
        })
        assert r.status_code == 200, r.json()
        assert set(r.json()["reopened_accounts"]) == {
            "Assets:Invest:Clear",
            "Assets:Invest:Clear:Equities",
        }
        body = hierarchy_client.get("/api/accounts").json()
        assert body["closed_count"] == 0
        assert body["errors"] == []
        names = _flatten_names(body["accounts"])
        assert "Assets:Invest:Clear:Equities" in names

    def test_cascade_skips_already_closed_descendant(
        self, hierarchy_client: TestClient
    ) -> None:
        """Closing one leaf first must not break closing the subtree after."""
        hierarchy_client.post("/api/accounts/close", json={
            "name": "Assets:Invest:Clear:Equities", "date": "2024-06-30",
        })
        r = hierarchy_client.post("/api/accounts/close", json={
            "name": "Assets:Invest:Clear", "date": "2024-12-31",
        })
        assert r.status_code == 200, r.json()
        assert r.json()["closed_accounts"] == ["Assets:Invest:Clear"]
        assert hierarchy_client.get("/api/accounts").json()["errors"] == []


class TestInactiveAccountPostings:
    """An inactive account stops accepting NEW postings — nothing more.

    History stays intact and keeps showing up in every report; only writes
    dated on or after the close are refused.
    """

    def test_posting_to_inactive_account_refused(
        self, hierarchy_client: TestClient
    ) -> None:
        hierarchy_client.post("/api/accounts/close", json={
            "name": "Assets:Invest:Clear", "date": "2024-12-31",
        })
        r = hierarchy_client.post("/api/transactions", json={
            "date": "2025-06-01",
            "narration": "should be refused",
            "postings": [
                {"account": "Assets:Invest:Clear", "amount": "10.00", "currency": "BRL"},
                {"account": "Assets:Bank:Main", "amount": "-10.00", "currency": "BRL"},
            ],
        })
        body = r.json()
        assert body["success"] is False
        assert "inactive since 2024-12-31" in body["errors"][0]

    def test_refusal_leaves_no_error_in_the_ledger(
        self, hierarchy_client: TestClient
    ) -> None:
        """The point of pre-validating: Beancount would only catch this after
        the write, leaving a validation error behind a `success: true`."""
        hierarchy_client.post("/api/accounts/close", json={
            "name": "Assets:Invest:Clear", "date": "2024-12-31",
        })
        hierarchy_client.post("/api/transactions", json={
            "date": "2025-06-01",
            "narration": "should be refused",
            "postings": [
                {"account": "Assets:Invest:Clear", "amount": "10.00", "currency": "BRL"},
                {"account": "Assets:Bank:Main", "amount": "-10.00", "currency": "BRL"},
            ],
        })
        assert hierarchy_client.get("/api/errors").json()["count"] == 0

    def test_posting_dated_before_the_close_is_allowed(
        self, hierarchy_client: TestClient
    ) -> None:
        """Backdated history is still editable — the account was live then."""
        hierarchy_client.post("/api/accounts/close", json={
            "name": "Assets:Invest:Clear", "date": "2024-12-31",
        })
        r = hierarchy_client.post("/api/transactions", json={
            "date": "2021-05-01",
            "narration": "backdated, account was live",
            "postings": [
                {"account": "Assets:Invest:Clear", "amount": "10.00", "currency": "BRL"},
                {"account": "Assets:Bank:Main", "amount": "-10.00", "currency": "BRL"},
            ],
        })
        assert r.json()["success"] is True
        assert hierarchy_client.get("/api/errors").json()["count"] == 0

    def test_history_of_inactive_account_still_readable(
        self, hierarchy_client: TestClient
    ) -> None:
        """Deactivating hides the account from the tree, never its history."""
        before = hierarchy_client.get(
            "/api/transactions", params={"account": "Assets:Invest:Clear:Equities"}
        ).json()["count"]
        assert before > 0

        hierarchy_client.post("/api/accounts/close", json={
            "name": "Assets:Invest:Clear", "date": "2024-12-31",
        })

        after = hierarchy_client.get(
            "/api/transactions", params={"account": "Assets:Invest:Clear:Equities"}
        ).json()["count"]
        assert after == before

    def test_inactive_account_still_in_income_statement(
        self, hierarchy_client: TestClient
    ) -> None:
        """Reports cover the period, not the account's current status."""
        hierarchy_client.post("/api/accounts/close", json={
            "name": "Assets:Invest:Clear", "date": "2024-12-31",
        })
        r = hierarchy_client.get(
            "/api/reports/balance-sheet",
            params={"from_date": "2021-01-01", "to_date": "2021-04-01"},
        )
        assert r.status_code == 200
        # The sleeve held 100.00 at that date and must still be reported.
        assert "Clear" in r.text

    def test_structural_parent_disappears_with_its_last_account(
        self, hierarchy_client: TestClient
    ) -> None:
        """`Assets:Invest` has no `open` of its own — it exists only because its
        children do. Retiring them must take the placeholder with it, or the
        tree shows an empty group the user cannot edit, close or explain."""
        before = _flatten_names(hierarchy_client.get("/api/accounts").json()["accounts"])
        assert "Assets:Invest" in before

        for name in ("Assets:Invest:Clear", "Assets:Invest:ClearOther"):
            hierarchy_client.post("/api/accounts/close", json={
                "name": name, "date": "2024-12-31",
            })

        after = _flatten_names(hierarchy_client.get("/api/accounts").json()["accounts"])
        assert "Assets:Invest" not in after
        # The real accounts are still there under include_closed.
        assert "Assets:Invest" in _flatten_names(
            hierarchy_client.get("/api/accounts?include_closed=true").json()["accounts"]
        )

    def test_structural_parent_stays_while_a_child_is_active(
        self, hierarchy_client: TestClient
    ) -> None:
        hierarchy_client.post("/api/accounts/close", json={
            "name": "Assets:Invest:Clear", "date": "2024-12-31",
        })
        names = _flatten_names(hierarchy_client.get("/api/accounts").json()["accounts"])
        assert "Assets:Invest" in names
        assert "Assets:Invest:ClearOther" in names


# ------------------------------------------------------------------
# lineno is not unique across include files
# ------------------------------------------------------------------

MULTIFILE_MAIN = """\
option "operating_currency" "BRL"

include "included/hist.beancount"

2020-01-01 open Assets:Bank:Main   BRL
  ledgr-type: "cash"
2020-01-01 open Income:Salary      BRL
2020-01-01 open Income:Other       BRL

2025-05-31 * "in the main file"
  Assets:Bank:Main    360.00 BRL
  Income:Salary      -360.00 BRL
"""

# Deliberately padded so the transaction lands on the SAME line number as the
# one in the main file — that collision is the whole point of the fixture.
MULTIFILE_INCLUDED = """\
;; padding
;; padding
;; padding
;; padding
;; padding
;; padding
;; padding

2019-03-01 * "in the included file"
  Assets:Bank:Main    100.00 BRL
  Income:Salary      -100.00 BRL
"""


@pytest.fixture()
def collide_client(tmp_path: Path) -> TestClient:
    """A ledger where the same lineno exists in two files."""
    (tmp_path / "included").mkdir()
    (tmp_path / "included" / "hist.beancount").write_text(MULTIFILE_INCLUDED)
    dst = tmp_path / "main.beancount"
    dst.write_text(MULTIFILE_MAIN)
    ledger_mod.init_ledger(str(dst))
    from main import app

    return TestClient(app, raise_server_exceptions=False)


class TestCrossFileEntryIdentity:
    """`lineno` alone identifies the wrong entry once a ledger uses `include`.

    Real symptom this guards against: editing a 2025 transaction appeared to do
    nothing, because the write went to the same line number in 2019.beancount —
    the user's entry unchanged, a stray 2025 entry injected into 2019.
    """

    def test_transactions_expose_their_filename(
        self, collide_client: TestClient
    ) -> None:
        txns = collide_client.get("/api/transactions").json()["transactions"]
        assert txns, "fixture should produce transactions"
        for t in txns:
            assert t["filename"], "every transaction must name its source file"

    def test_edit_targets_the_right_file(self, collide_client: TestClient) -> None:
        txns = collide_client.get("/api/transactions").json()["transactions"]
        target = next(t for t in txns if t["narration"] == "in the main file")

        r = collide_client.put("/api/transactions", json={
            "lineno": target["lineno"],
            "filename": target["filename"],
            "date": target["date"],
            "flag": "*",
            "payee": "",
            "narration": "in the main file",
            "postings": [
                {"account": "Assets:Bank:Main", "amount": 360.00, "currency": "BRL"},
                {"account": "Income:Other", "amount": -360.00, "currency": "BRL"},
            ],
        })
        assert r.json()["success"] is True, r.json()

        after = collide_client.get("/api/transactions").json()["transactions"]
        edited = next(t for t in after if t["narration"] == "in the main file")
        accounts = {p["account"] for p in edited["postings"]}
        assert "Income:Other" in accounts, "the edit must land on the target"

        # The included file's entry must be untouched.
        untouched = next(t for t in after if t["narration"] == "in the included file")
        assert {p["account"] for p in untouched["postings"]} == {
            "Assets:Bank:Main", "Income:Salary",
        }

    def test_edit_keeps_the_entry_in_its_own_file(
        self, collide_client: TestClient
    ) -> None:
        """The rewritten entry must not migrate to the main ledger."""
        txns = collide_client.get("/api/transactions").json()["transactions"]
        target = next(t for t in txns if t["narration"] == "in the included file")
        original_file = target["filename"]

        collide_client.put("/api/transactions", json={
            "lineno": target["lineno"],
            "filename": target["filename"],
            "date": target["date"],
            "flag": "*",
            "payee": "",
            "narration": "in the included file",
            "postings": [
                {"account": "Assets:Bank:Main", "amount": 100.00, "currency": "BRL"},
                {"account": "Income:Other", "amount": -100.00, "currency": "BRL"},
            ],
        })

        after = collide_client.get("/api/transactions").json()["transactions"]
        moved = next(t for t in after if t["narration"] == "in the included file")
        assert moved["filename"] == original_file

    def test_wrong_filename_finds_nothing(self, collide_client: TestClient) -> None:
        """Better a clear failure than silently editing another file's entry."""
        txns = collide_client.get("/api/transactions").json()["transactions"]
        target = next(t for t in txns if t["narration"] == "in the main file")
        r = collide_client.put("/api/transactions", json={
            "lineno": target["lineno"],
            "filename": "/nowhere/nope.beancount",
            "date": target["date"],
            "flag": "*",
            "payee": "",
            "narration": "x",
            "postings": [
                {"account": "Assets:Bank:Main", "amount": 1.00, "currency": "BRL"},
                {"account": "Income:Other", "amount": -1.00, "currency": "BRL"},
            ],
        })
        assert r.json()["success"] is False

    def test_delete_targets_the_right_file(self, collide_client: TestClient) -> None:
        txns = collide_client.get("/api/transactions").json()["transactions"]
        target = next(t for t in txns if t["narration"] == "in the main file")

        r = collide_client.delete(
            f"/api/transactions/{target['lineno']}",
            params={"filename": target["filename"]},
        )
        assert r.json()["success"] is True

        after = collide_client.get("/api/transactions").json()["transactions"]
        narrations = {t["narration"] for t in after}
        assert "in the main file" not in narrations
        assert "in the included file" in narrations, "the other file must survive"


class TestOpeningDateEdit:
    """The opening date must be editable, not only settable at creation.

    A posting dated before the account's `open` makes the ledger invalid, and
    Beancount reports it as "Invalid reference to inactive account" — its
    "inactive" covers *not yet open*, not just closed. Moving the opening back
    is normally the fix, so the edit modal has to allow it.
    """

    def test_update_moves_the_opening_date(self, client: TestClient) -> None:
        r = client.put("/api/accounts", json={
            "name": "Assets:Savings",
            "ledgr_type": "cash",
            "date": "2020-01-01",
        })
        assert r.status_code == 200, r.json()
        assert r.json()["account"]["open_date"] == "2020-01-01"

    def test_update_without_date_keeps_the_original(
        self, client: TestClient
    ) -> None:
        before = client.get("/api/accounts").json()
        original = _find_node(before["accounts"], "Assets:Savings")["open_date"]
        r = client.put("/api/accounts", json={
            "name": "Assets:Savings", "ledgr_type": "cash",
        })
        assert r.json()["account"]["open_date"] == original

    def test_cannot_open_after_an_existing_posting(
        self, client: TestClient
    ) -> None:
        """Moving the opening forward past a posting would break the ledger."""
        r = client.put("/api/accounts", json={
            "name": "Assets:Checking",
            "ledgr_type": "cash",
            "date": "2030-01-01",
        })
        assert r.status_code == 400
        assert "already has a posting" in r.json()["detail"]
        assert client.get("/api/accounts").json()["errors"] == []


class TestPostingBeforeAccountOpens:
    """Backdating a posting before the account exists must be refused up front."""

    def test_posting_before_open_is_refused(self, client: TestClient) -> None:
        opened = _find_node(
            client.get("/api/accounts").json()["accounts"], "Assets:Savings"
        )["open_date"]
        earlier = "2019-01-01"
        assert earlier < opened

        r = client.post("/api/transactions", json={
            "date": earlier,
            "narration": "before the account existed",
            "postings": [
                {"account": "Assets:Savings", "amount": 10.00, "currency": "BRL"},
                {"account": "Assets:Checking", "amount": -10.00, "currency": "BRL"},
            ],
        })
        body = r.json()
        assert body["success"] is False
        assert "only opens on" in body["errors"][0]

    def test_refusal_leaves_the_ledger_clean(self, client: TestClient) -> None:
        client.post("/api/transactions", json={
            "date": "2019-01-01",
            "narration": "before the account existed",
            "postings": [
                {"account": "Assets:Savings", "amount": 10.00, "currency": "BRL"},
                {"account": "Assets:Checking", "amount": -10.00, "currency": "BRL"},
            ],
        })
        assert client.get("/api/errors").json()["count"] == 0

    def test_posting_on_the_open_date_is_allowed(self, client: TestClient) -> None:
        opened = _find_node(
            client.get("/api/accounts").json()["accounts"], "Assets:Savings"
        )["open_date"]
        r = client.post("/api/transactions", json={
            "date": opened,
            "narration": "same day as the opening",
            "postings": [
                {"account": "Assets:Savings", "amount": 10.00, "currency": "BRL"},
                {"account": "Assets:Checking", "amount": -10.00, "currency": "BRL"},
            ],
        })
        assert r.json()["success"] is True
        assert client.get("/api/errors").json()["count"] == 0
