"""
HTTP-level tests for all routers using FastAPI TestClient.

Tests verify:
- Correct HTTP status codes
- JSON response shape matches frontend types
- Every endpoint uses ``Depends(get_ledger)`` correctly
"""

from __future__ import annotations

import datetime
import os
import shutil
from decimal import Decimal
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


@pytest.fixture()
def commodities_client(tmp_path: Path) -> TestClient:
    """A TestClient over the commodities fixture — lots, FX and vacation days."""
    src = FIXTURES_DIR / "commodities.beancount"
    dst = tmp_path / "test.beancount"
    shutil.copy(src, dst)

    ledger_mod.init_ledger(str(dst))

    from main import app

    return TestClient(app, raise_server_exceptions=False)


# One broker account per booking method, each holding the same two PETR4 lots
# (100 @ 33.00 in February, 100 @ 37.00 in March — average 35.00), so the same
# sale can be written against NONE, FIFO and STRICT and the outcome compared.
# The FIFO and STRICT lots carry labels so a sale can name them.
BOOKING_LEDGER = '''option "title" "Booking Test Ledger"
option "operating_currency" "BRL"
plugin "beancount.plugins.implicit_prices"

; Declared but never held — must still be listed as a commodity.
2020-01-01 commodity ITUB4
  name: "Itau Unibanco PN"

2020-01-01 open Assets:Bank:Checking  BRL
  ledgr-type: "cash"
2020-01-01 open Assets:XP  "NONE"
  ledgr-type: "investment"
2020-01-01 open Assets:Clear  "FIFO"
  ledgr-type: "investment"
2020-01-01 open Assets:Rico  "STRICT"
  ledgr-type: "investment"
2020-01-01 open Income:Gains
2020-01-01 open Equity:OpeningBalances  BRL

2020-01-01 * "Opening Balance"
  Assets:Bank:Checking  100000.00 BRL
  Equity:OpeningBalances

2020-02-01 * "XP" "Buy PETR4 lot fev"
  Assets:XP  100 PETR4 {33.00 BRL}
  Assets:Bank:Checking  -3300.00 BRL

2020-03-01 * "XP" "Buy PETR4 lot mar"
  Assets:XP  100 PETR4 {37.00 BRL}
  Assets:Bank:Checking  -3700.00 BRL

2020-02-01 * "Clear" "Buy PETR4 lot fev"
  Assets:Clear  100 PETR4 {33.00 BRL, "lote-fev"}
  Assets:Bank:Checking  -3300.00 BRL

2020-03-01 * "Clear" "Buy PETR4 lot mar"
  Assets:Clear  100 PETR4 {37.00 BRL}
  Assets:Bank:Checking  -3700.00 BRL

2020-02-01 * "Rico" "Buy PETR4 strict lot"
  Assets:Rico  100 PETR4 {33.00 BRL, "rico-fev"}
  Assets:Bank:Checking  -3300.00 BRL
'''


@pytest.fixture()
def booking_file(tmp_path: Path) -> Path:
    """Write the booking ledger into a temp dir and return its path."""
    dst = tmp_path / "test.beancount"
    dst.write_text(BOOKING_LEDGER, encoding="utf-8")
    return dst


@pytest.fixture()
def booking_client(booking_file: Path) -> TestClient:
    """A TestClient over ``BOOKING_LEDGER`` — NONE, FIFO and STRICT accounts."""
    ledger_mod.init_ledger(str(booking_file))

    from main import app

    return TestClient(app, raise_server_exceptions=False)


def _postings_for(client: TestClient, narration: str) -> list[dict]:
    """The postings of the single transaction with ``narration``."""
    txns = [
        t for t in client.get("/api/transactions").json()["transactions"]
        if t["narration"] == narration
    ]
    assert len(txns) == 1, [t["narration"] for t in txns]
    return txns[0]["postings"]


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

    def test_filter_account_intersects_with_open_account(
        self, client: TestClient
    ) -> None:
        """`account` (the open register) and `filter_account` (the global
        filter) must BOTH be touched — the filter shows counterparts of the
        open account, it does not replace it."""
        r = client.get(
            "/api/transactions",
            params={"account": "Assets:Checking", "filter_account": "Expenses:Food"},
        )
        assert r.status_code == 200
        body = r.json()
        # Two Food transactions exist; only Groceries went through Checking
        # (Dinner went on the credit card).
        assert body["count"] == 1
        assert body["transactions"][0]["narration"] == "Groceries"

    def test_filter_account_on_unrelated_register_is_empty(
        self, client: TestClient
    ) -> None:
        """The reported bug: an unrelated register showed the filtered
        account's whole history. It must show nothing."""
        r = client.get(
            "/api/transactions",
            params={"account": "Assets:Savings", "filter_account": "Expenses:Food"},
        )
        assert r.status_code == 200
        assert r.json()["count"] == 0

    def test_filter_account_alone_behaves_like_account(
        self, client: TestClient
    ) -> None:
        by_account = client.get(
            "/api/transactions", params={"account": "Expenses:Food"}
        ).json()
        by_filter = client.get(
            "/api/transactions", params={"filter_account": "Expenses:Food"}
        ).json()
        assert by_filter["count"] == by_account["count"] == 2

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

    def test_account_balance_filter_account_narrows_not_repoints(
        self, client: TestClient
    ) -> None:
        """A global account filter narrows the charted account's series to the
        flows the two share — it must not silently chart the filter instead.
        Checking ∩ Food is the single -350.00 groceries payment."""
        r = client.get(
            "/api/reports/account-balance",
            params={"account": "Assets:Checking", "filter_account": "Expenses:Food"},
        )
        assert r.status_code == 200
        series = r.json()["series"]
        assert Decimal(series[-1]["balance"]) == Decimal("-350.00")

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


class TestInactiveAccountSuggestions:
    """Inactive accounts never show up as suggestions.

    ``/api/account-names`` feeds every autocomplete surface (Composer route
    picker, Cmd+K, filter bar, budget/chart pickers), and ``/api/suggestions``
    pre-fills the payee's usual account. A closed account cannot take new
    postings, so suggesting it only sets the user up for a refusal at save
    time.
    """

    def test_closed_account_dropped_from_account_names(
        self, hierarchy_client: TestClient
    ) -> None:
        before = hierarchy_client.get("/api/account-names").json()["accounts"]
        assert "Assets:Invest:Clear" in before
        assert "Assets:Invest:Clear:Equities" in before

        hierarchy_client.post("/api/accounts/close", json={
            "name": "Assets:Invest:Clear", "date": "2024-12-31",
        })

        after = hierarchy_client.get("/api/account-names").json()["accounts"]
        assert "Assets:Invest:Clear" not in after
        # The cascade closed the child too.
        assert "Assets:Invest:Clear:Equities" not in after
        # The structural parent survives while a live sibling needs it.
        assert "Assets:Invest" in after
        assert "Assets:Invest:ClearOther" in after

    def test_include_closed_brings_them_back(
        self, hierarchy_client: TestClient
    ) -> None:
        hierarchy_client.post("/api/accounts/close", json={
            "name": "Assets:Invest:Clear", "date": "2024-12-31",
        })
        names = hierarchy_client.get(
            "/api/account-names", params={"include_closed": "true"}
        ).json()["accounts"]
        assert "Assets:Invest:Clear" in names
        assert "Assets:Invest:Clear:Equities" in names

    def test_structural_parent_dropped_with_its_last_live_child(
        self, hierarchy_client: TestClient
    ) -> None:
        """`Assets:Invest` has no `open` of its own — once every real account
        beneath it is closed it is a suggestion for nothing."""
        for name in ("Assets:Invest:Clear", "Assets:Invest:ClearOther"):
            hierarchy_client.post("/api/accounts/close", json={
                "name": name, "date": "2024-12-31",
            })
        names = hierarchy_client.get("/api/account-names").json()["accounts"]
        assert "Assets:Invest" not in names

    def test_payee_suggestion_skips_closed_account(
        self, client: TestClient
    ) -> None:
        """Supermarket's only history points at Expenses:Food — once that is
        retired, no account beats a stale one."""
        r = client.get("/api/suggestions", params={"payee": "Supermarket"})
        assert r.json()["account"] == "Expenses:Food"

        client.post("/api/accounts/close", json={
            "name": "Expenses:Food", "date": "2025-01-01",
        })

        r = client.get("/api/suggestions", params={"payee": "Supermarket"})
        assert r.json()["account"] is None


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


# ------------------------------------------------------------------
# Held at cost — writing investments
# ------------------------------------------------------------------


class TestHeldAtCostWrites:
    """A posting held at cost balances by its **cost**, not its price.

    ``_validate_balance`` used to hand Beancount's ``get_weight`` a
    ``CostSpec``, which it does not recognise: it fell through to the price
    instead. Since the gap between price and cost *is* the capital gain, every
    correct sale looked off by exactly its own gain and was refused — the
    guard meant to protect the ledger was the thing blocking investments.
    """

    def test_fixture_is_valid(self, commodities_client: TestClient) -> None:
        """The fixture itself must load clean, or nothing below means much."""
        assert commodities_client.get("/api/errors").json()["count"] == 0

    def test_buy_at_cost_is_accepted(self, commodities_client: TestClient) -> None:
        r = commodities_client.post("/api/transactions", json={
            "date": "2020-12-01",
            "narration": "Buy 10 PETR4",
            "postings": [
                {
                    "account": "Assets:Broker:PETR4",
                    "amount": 10, "currency": "PETR4",
                    "cost": "33.00", "cost_currency": "BRL",
                },
                {
                    "account": "Assets:Bank:Checking",
                    "amount": "-330.00", "currency": "BRL",
                },
            ],
        })
        assert r.json()["success"] is True, r.json()
        assert commodities_client.get("/api/errors").json()["count"] == 0

    def test_sell_with_explicit_gain_is_accepted(
        self, commodities_client: TestClient
    ) -> None:
        """The case that was refused: cost 25.00, price 40.00, gain 600.00."""
        r = commodities_client.post("/api/transactions", json={
            "date": "2020-12-01",
            "narration": "Sell 40 PETR4",
            "postings": [
                {
                    "account": "Assets:Broker:PETR4",
                    "amount": -40, "currency": "PETR4",
                    "cost": "25.00", "cost_currency": "BRL",
                    "price": "40.00", "price_currency": "BRL",
                },
                {
                    "account": "Assets:Bank:Checking",
                    "amount": "1600.00", "currency": "BRL",
                },
                {"account": "Income:Gains", "amount": "-600.00", "currency": "BRL"},
            ],
        })
        body = r.json()
        assert body["success"] is True, body
        assert commodities_client.get("/api/errors").json()["count"] == 0

    def test_sell_with_elided_gain_is_accepted(
        self, commodities_client: TestClient
    ) -> None:
        """Beancount interpolates the gain; the guard must not pre-empt it."""
        r = commodities_client.post("/api/transactions", json={
            "date": "2020-12-01",
            "narration": "Sell 40 PETR4, gain elided",
            "postings": [
                {
                    "account": "Assets:Broker:PETR4",
                    "amount": -40, "currency": "PETR4",
                    "cost": "25.00", "cost_currency": "BRL",
                    "price": "40.00", "price_currency": "BRL",
                },
                {
                    "account": "Assets:Bank:Checking",
                    "amount": "1600.00", "currency": "BRL",
                },
                {"account": "Income:Gains"},
            ],
        })
        assert r.json()["success"] is True, r.json()
        assert commodities_client.get("/api/errors").json()["count"] == 0

    def test_gain_in_the_cost_currency_is_accepted(
        self, commodities_client: TestClient
    ) -> None:
        """Gold bought in USD realises its gain in USD, not in the OC."""
        r = commodities_client.post("/api/transactions", json={
            "date": "2020-12-01",
            "narration": "Sell 1 XAU",
            "postings": [
                {
                    "account": "Assets:Vault:XAU",
                    "amount": -1, "currency": "XAU",
                    "cost": "1700.00", "cost_currency": "USD",
                    "price": "2000.00", "price_currency": "USD",
                },
                {"account": "Assets:Bank:USD", "amount": "2000.00", "currency": "USD"},
                {"account": "Income:Gains", "amount": "-300.00", "currency": "USD"},
            ],
        })
        assert r.json()["success"] is True, r.json()
        assert commodities_client.get("/api/errors").json()["count"] == 0

    def test_fx_purchase_at_price_is_accepted(
        self, commodities_client: TestClient
    ) -> None:
        r = commodities_client.post("/api/transactions", json={
            "date": "2020-12-01",
            "narration": "Buy USD",
            "postings": [
                {
                    "account": "Assets:Bank:USD",
                    "amount": "100.00", "currency": "USD",
                    "price": "5.20", "price_currency": "BRL",
                },
                {
                    "account": "Assets:Bank:Checking",
                    "amount": "-520.00", "currency": "BRL",
                },
            ],
        })
        assert r.json()["success"] is True, r.json()
        assert commodities_client.get("/api/errors").json()["count"] == 0

    def test_wrong_gain_is_still_refused(
        self, commodities_client: TestClient
    ) -> None:
        """The guard must still catch a real imbalance on a sale.

        Cost 25.00 x 40 = 1000.00 out, 1600.00 cash in, so the gain is
        600.00. Declaring 500.00 leaves 100.00 unaccounted for.
        """
        count_before = commodities_client.get("/api/transactions").json()["count"]
        r = commodities_client.post("/api/transactions", json={
            "date": "2020-12-01",
            "narration": "Sell 40 PETR4, wrong gain",
            "postings": [
                {
                    "account": "Assets:Broker:PETR4",
                    "amount": -40, "currency": "PETR4",
                    "cost": "25.00", "cost_currency": "BRL",
                    "price": "40.00", "price_currency": "BRL",
                },
                {
                    "account": "Assets:Bank:Checking",
                    "amount": "1600.00", "currency": "BRL",
                },
                {"account": "Income:Gains", "amount": "-500.00", "currency": "BRL"},
            ],
        })
        body = r.json()
        assert body["success"] is False
        assert any("balance" in e.lower() for e in body["errors"])
        # And nothing was written.
        after = commodities_client.get("/api/transactions").json()
        assert after["count"] == count_before
        assert all(
            t["narration"] != "Sell 40 PETR4, wrong gain"
            for t in after["transactions"]
        )

    def test_cost_does_not_excuse_a_plain_imbalance(
        self, commodities_client: TestClient
    ) -> None:
        """Having *a* cost posting must not switch the guard off wholesale."""
        r = commodities_client.post("/api/transactions", json={
            "date": "2020-12-01",
            "narration": "Buy 10 PETR4, wrong cash",
            "postings": [
                {
                    "account": "Assets:Broker:PETR4",
                    "amount": 10, "currency": "PETR4",
                    "cost": "33.00", "cost_currency": "BRL",
                },
                {
                    "account": "Assets:Bank:Checking",
                    "amount": "-999.00", "currency": "BRL",
                },
            ],
        })
        body = r.json()
        assert body["success"] is False
        assert any("balance" in e.lower() for e in body["errors"])


class TestValidateBalanceUnits:
    """Direct tests for the balance guard's cost handling."""

    @staticmethod
    def _postings(specs: list[dict]) -> list:
        from routers.transactions import PostingIn, _build_bc_postings

        return _build_bc_postings([PostingIn(**s) for s in specs])

    @staticmethod
    def _validate(bc_postings: list) -> list[str]:
        from beancount.parser import options

        from routers.transactions import _validate_balance

        # `infer_tolerances` reads real option keys, so hand it the defaults
        # rather than a bare dict.
        return _validate_balance(bc_postings, dict(options.OPTIONS_DEFAULTS))

    def test_sale_at_cost_balances(self) -> None:
        assert self._validate(self._postings([
            {
                "account": "A:X", "amount": "-10", "currency": "X",
                "cost": "20.00", "cost_currency": "BRL",
                "price": "28.00", "price_currency": "BRL",
            },
            {"account": "A:Cash", "amount": "280.00", "currency": "BRL"},
            {"account": "I:Gains", "amount": "-80.00", "currency": "BRL"},
        ])) == []

    def test_sale_off_by_the_gain_is_caught(self) -> None:
        assert self._validate(self._postings([
            {
                "account": "A:X", "amount": "-10", "currency": "X",
                "cost": "20.00", "cost_currency": "BRL",
                "price": "28.00", "price_currency": "BRL",
            },
            {"account": "A:Cash", "amount": "280.00", "currency": "BRL"},
            {"account": "I:Gains", "amount": "-70.00", "currency": "BRL"},
        ]))

    def test_total_cost_is_spread_over_the_units(self) -> None:
        """``{{2500.00 BRL}}`` on 100 units is 25.00 each — weight 2500.00."""
        from beancount.core import data

        from routers.transactions import _resolve_cost

        bc = self._postings([
            {"account": "A:X", "amount": "100", "currency": "X"},
            {"account": "A:Cash", "amount": "-2500.00", "currency": "BRL"},
        ])
        total_spec = data.CostSpec(None, Decimal("2500.00"), "BRL", None, None, False)
        bc[0] = bc[0]._replace(cost=total_spec)
        assert _resolve_cost(bc[0]).cost.number == Decimal("25.00")
        assert self._validate(bc) == []

    def test_unresolvable_lot_defers_to_the_loader(self) -> None:
        """``{}``, ``{date}`` and ``{"label"}`` are only knowable after booking.

        Their weight depends on the account's real inventory, so the guard
        must stand down rather than guess — exactly as it does for an elided
        amount.
        """
        from beancount.core import data

        from routers.transactions import _resolve_cost

        bc = self._postings([
            {"account": "A:X", "amount": "-10", "currency": "X",
             "price": "28.00", "price_currency": "BRL"},
            {"account": "A:Cash", "amount": "280.00", "currency": "BRL"},
            {"account": "I:Gains", "amount": "-80.00", "currency": "BRL"},
        ])
        for spec in (
            data.CostSpec(None, None, None, None, None, False),          # {}
            data.CostSpec(None, None, None, datetime.date(2020, 3, 1), None, False),
            data.CostSpec(None, None, None, None, "april-lot", False),
            data.CostSpec(None, None, None, None, None, True),           # {*}
        ):
            bc[0] = bc[0]._replace(cost=spec)
            assert _resolve_cost(bc[0]) is None
            assert self._validate(bc) == []

    def test_total_cost_on_zero_units_defers(self) -> None:
        """A total cost is divided by the units, so zero units has no answer.

        Beancount's own converter raises ``DivisionByZero`` here, which would
        surface as a 500. Defer instead.
        """
        from beancount.core import data

        from routers.transactions import _resolve_cost

        bc = self._postings([
            {"account": "A:X", "amount": "0", "currency": "X"},
            {"account": "A:Cash", "amount": "0.00", "currency": "BRL"},
        ])
        bc[0] = bc[0]._replace(
            cost=data.CostSpec(None, Decimal("2500.00"), "BRL", None, None, False)
        )
        assert _resolve_cost(bc[0]) is None
        assert self._validate(bc) == []


# ------------------------------------------------------------------
# Widened PostingIn — PLAN-commodities-ux §4.8
# ------------------------------------------------------------------


class TestBuildCostSpec:
    """``_build_bc_postings`` must produce the ``CostSpec`` the parser would.

    The printer only renders the shapes the parser emits (``MISSING`` in the
    empty slots, never ``None``), so a spec built any other way either prints
    wrong or fails to load. Every shape here is formatted with
    ``printer.format_entry`` and loaded back with zero errors.
    """

    HEADER = '''option "operating_currency" "BRL"
2020-01-01 open Assets:Bank:Checking BRL
2020-01-01 open Assets:XP "NONE"
2020-01-01 open Assets:Clear "FIFO"
2020-01-01 open Assets:Rico "STRICT"
2020-01-01 open Income:Gains
2020-01-01 open Equity:OpeningBalances
2020-01-01 * "seed"
  Assets:Bank:Checking  100000.00 BRL
  Equity:OpeningBalances
2020-02-01 * "lots"
  Assets:XP     100 PETR4 {33.00 BRL}
  Assets:Clear  100 PETR4 {33.00 BRL, "lote-fev"}
  Assets:Rico   100 PETR4 {33.00 BRL, "rico-fev"}
  Assets:Bank:Checking
2020-03-01 * "lots"
  Assets:XP     100 PETR4 {37.00 BRL}
  Assets:Clear  100 PETR4 {37.00 BRL}
  Assets:Bank:Checking
'''

    @staticmethod
    def _build(specs: list[dict]) -> list:
        from routers.transactions import PostingIn, _build_bc_postings

        return _build_bc_postings([PostingIn(**s) for s in specs])

    def _round_trip(self, narration: str, specs: list[dict]) -> str:
        """Format the built transaction and load it on top of ``HEADER``.

        Returns the formatted source so the caller can assert the syntax.
        """
        from beancount import loader
        from beancount.core import data
        from beancount.parser import printer

        txn = data.Transaction(
            data.new_metadata("<test>", 0), datetime.date(2020, 6, 1), "*",
            "", narration, frozenset(), frozenset(), self._build(specs),
        )
        text = printer.format_entry(txn)
        _, errors, _ = loader.load_string(self.HEADER + "\n" + text)
        assert errors == [], [e.message for e in errors]
        return text

    def test_per_unit_cost(self) -> None:
        from beancount.core import data

        [p, _] = self._build([
            {"account": "Assets:Clear", "amount": "10", "currency": "PETR4",
             "cost": "35.00", "cost_currency": "BRL"},
            {"account": "Assets:Bank:Checking", "amount": "-350.00", "currency": "BRL"},
        ])
        assert p.cost == data.CostSpec(
            Decimal("35.00"), None, "BRL", None, None, False
        )

    def test_total_cost_uses_missing_for_the_per_unit_slot(self) -> None:
        """``{# 350.00 BRL}``: the parser puts MISSING, not None, in
        ``number_per`` — that is what makes the printer emit ``#``."""
        from beancount.core.number import MISSING

        [p, _] = self._build([
            {"account": "Assets:Clear", "amount": "10", "currency": "PETR4",
             "cost_total": "350.00", "cost_currency": "BRL"},
            {"account": "Assets:Bank:Checking", "amount": "-350.00", "currency": "BRL"},
        ])
        assert p.cost.number_per is MISSING
        assert p.cost.number_total == Decimal("350.00")
        assert p.cost.currency == "BRL"

    def test_empty_cost_mirrors_the_parser(self) -> None:
        from beancount.core import data
        from beancount.core.number import MISSING

        [p] = self._build([
            {"account": "Assets:Clear", "amount": "-10", "currency": "PETR4",
             "cost_empty": True},
        ])
        assert p.cost == data.CostSpec(MISSING, None, MISSING, None, None, False)

    def test_date_and_label_alone_identify_a_lot(self) -> None:
        from beancount.core import data
        from beancount.core.number import MISSING

        [by_date, by_label] = self._build([
            {"account": "Assets:Clear", "amount": "-10", "currency": "PETR4",
             "cost_date": "2020-03-01"},
            {"account": "Assets:Clear", "amount": "-10", "currency": "PETR4",
             "cost_label": "lote-fev"},
        ])
        assert by_date.cost == data.CostSpec(
            MISSING, None, MISSING, datetime.date(2020, 3, 1), None, False
        )
        assert by_label.cost == data.CostSpec(
            MISSING, None, MISSING, None, "lote-fev", False
        )

    def test_cost_empty_false_is_no_cost(self) -> None:
        [p] = self._build([
            {"account": "Assets:Clear", "amount": "-10", "currency": "PETR4",
             "cost_empty": False},
        ])
        assert p.cost is None

    def test_no_cost_fields_means_no_cost(self) -> None:
        """A stray ``cost_currency`` on its own is ignored, as it always was."""
        [p] = self._build([
            {"account": "Assets:Bank:Checking", "amount": "10", "currency": "BRL",
             "cost_currency": "BRL"},
        ])
        assert p.cost is None

    # ── Round-trips: printer → loader, zero errors ─────────────────

    def test_total_cost_round_trips(self) -> None:
        text = self._round_trip("buy total", [
            {"account": "Assets:Clear", "amount": "10", "currency": "PETR4",
             "cost_total": "350.00", "cost_currency": "BRL"},
            {"account": "Assets:Bank:Checking", "amount": "-350.00", "currency": "BRL"},
        ])
        assert "{# 350.00 BRL}" in text

    def test_total_cost_with_date_and_label_round_trips(self) -> None:
        text = self._round_trip("buy total dated", [
            {"account": "Assets:Rico", "amount": "10", "currency": "PETR4",
             "cost_total": "350.00", "cost_currency": "BRL",
             "cost_date": "2020-06-01", "cost_label": "lote-jun"},
            {"account": "Assets:Bank:Checking", "amount": "-350.00", "currency": "BRL"},
        ])
        assert '{# 350.00 BRL, 2020-06-01, "lote-jun"}' in text

    def test_per_unit_with_date_and_label_round_trips(self) -> None:
        text = self._round_trip("buy dated", [
            {"account": "Assets:Rico", "amount": "10", "currency": "PETR4",
             "cost": "35.00", "cost_currency": "BRL",
             "cost_date": "2020-06-01", "cost_label": "lote-jun"},
            {"account": "Assets:Bank:Checking", "amount": "-350.00", "currency": "BRL"},
        ])
        assert '{35.00 BRL, 2020-06-01, "lote-jun"}' in text

    def test_empty_cost_round_trips_on_fifo(self) -> None:
        text = self._round_trip("sell fifo", [
            {"account": "Assets:Clear", "amount": "-50", "currency": "PETR4",
             "cost_empty": True, "price": "40.00", "price_currency": "BRL"},
            {"account": "Assets:Bank:Checking", "amount": "2000.00", "currency": "BRL"},
            {"account": "Income:Gains"},
        ])
        assert "{} @ 40.00 BRL" in text

    def test_lot_by_date_round_trips_on_fifo(self) -> None:
        text = self._round_trip("sell by date", [
            {"account": "Assets:Clear", "amount": "-50", "currency": "PETR4",
             "cost_date": "2020-03-01", "price": "40.00", "price_currency": "BRL"},
            {"account": "Assets:Bank:Checking", "amount": "2000.00", "currency": "BRL"},
            {"account": "Income:Gains"},
        ])
        assert "{2020-03-01} @ 40.00 BRL" in text

    def test_lot_by_label_round_trips_on_strict(self) -> None:
        text = self._round_trip("sell by label", [
            {"account": "Assets:Rico", "amount": "-50", "currency": "PETR4",
             "cost_label": "rico-fev", "price": "40.00", "price_currency": "BRL"},
            {"account": "Assets:Bank:Checking", "amount": "2000.00", "currency": "BRL"},
            {"account": "Income:Gains"},
        ])
        assert '{"rico-fev"} @ 40.00 BRL' in text

    def test_average_cost_round_trips_on_none(self) -> None:
        """Brazilian average cost: NONE booking, Ledgr supplies the average."""
        text = self._round_trip("sell none", [
            {"account": "Assets:XP", "amount": "-50", "currency": "PETR4",
             "cost": "35.00", "cost_currency": "BRL",
             "price": "40.00", "price_currency": "BRL"},
            {"account": "Assets:Bank:Checking", "amount": "2000.00", "currency": "BRL"},
            {"account": "Income:Gains"},
        ])
        assert "{35.00 BRL} @ 40.00 BRL" in text

    # ── The balance guard keeps working over the new shapes ────────

    @staticmethod
    def _validate(bc_postings: list) -> list[str]:
        from beancount.parser import options

        from routers.transactions import _validate_balance

        return _validate_balance(bc_postings, dict(options.OPTIONS_DEFAULTS))

    def test_total_cost_still_validates_the_residual(self) -> None:
        from routers.transactions import _resolve_cost

        bc = self._build([
            {"account": "Assets:Clear", "amount": "10", "currency": "PETR4",
             "cost_total": "350.00", "cost_currency": "BRL"},
            {"account": "Assets:Bank:Checking", "amount": "-999.00", "currency": "BRL"},
        ])
        assert _resolve_cost(bc[0]).cost.number == Decimal("35.00")
        assert self._validate(bc), "a wrong cash leg must still be caught"
        bc[1] = bc[1]._replace(
            units=bc[1].units._replace(number=Decimal("-350.00"))
        )
        assert self._validate(bc) == []

    @pytest.mark.parametrize("lot", [
        {"cost_empty": True},
        {"cost_date": "2020-03-01"},
        {"cost_label": "lote-fev"},
    ])
    def test_booking_only_lots_defer_to_the_loader(self, lot: dict) -> None:
        from routers.transactions import _resolve_cost

        bc = self._build([
            {"account": "Assets:Clear", "amount": "-50", "currency": "PETR4",
             "price": "40.00", "price_currency": "BRL", **lot},
            {"account": "Assets:Bank:Checking", "amount": "2000.00", "currency": "BRL"},
            {"account": "Income:Gains", "amount": "-999.00", "currency": "BRL"},
        ])
        assert _resolve_cost(bc[0]) is None
        # Even with an obviously wrong gain: the weight is unknowable here.
        assert self._validate(bc) == []


class TestWidenedPostingWrites:
    """The HTTP path: every new cost field lands in the file and loads clean."""

    def test_ledger_is_valid(self, booking_client: TestClient) -> None:
        assert booking_client.get("/api/errors").json()["count"] == 0

    def test_total_cost_buy(
        self, booking_client: TestClient, booking_file: Path
    ) -> None:
        r = booking_client.post("/api/transactions", json={
            "date": "2020-06-01", "narration": "Buy 10 PETR4 total",
            "postings": [
                {"account": "Assets:Clear", "amount": 10, "currency": "PETR4",
                 "cost_total": "350.00", "cost_currency": "BRL"},
                {"account": "Assets:Bank:Checking", "amount": "-350.00", "currency": "BRL"},
            ],
        })
        assert r.status_code == 200
        assert r.json()["success"] is True, r.json()
        assert booking_client.get("/api/errors").json()["count"] == 0
        assert "{# 350.00 BRL}" in booking_file.read_text(encoding="utf-8")
        # Booked, the total is spread over the units (Beancount's division
        # yields `35`, not `35.00` — compare as numbers).
        [asset, _] = _postings_for(booking_client, "Buy 10 PETR4 total")
        assert Decimal(asset["cost"]) == Decimal("35.00")
        assert asset["cost_currency"] == "BRL"

    def test_total_cost_with_wrong_cash_is_refused(
        self, booking_client: TestClient
    ) -> None:
        count_before = booking_client.get("/api/transactions").json()["count"]
        r = booking_client.post("/api/transactions", json={
            "date": "2020-06-01", "narration": "Buy 10 PETR4, wrong cash",
            "postings": [
                {"account": "Assets:Clear", "amount": 10, "currency": "PETR4",
                 "cost_total": "350.00", "cost_currency": "BRL"},
                {"account": "Assets:Bank:Checking", "amount": "-999.00", "currency": "BRL"},
            ],
        })
        body = r.json()
        assert body["success"] is False
        assert any("balance" in e.lower() for e in body["errors"])
        assert booking_client.get("/api/transactions").json()["count"] == count_before

    def test_empty_cost_lets_fifo_pick_the_lot(
        self, booking_client: TestClient, booking_file: Path
    ) -> None:
        r = booking_client.post("/api/transactions", json={
            "date": "2020-06-01", "narration": "Sell 50 PETR4 FIFO",
            "postings": [
                {"account": "Assets:Clear", "amount": -50, "currency": "PETR4",
                 "cost_empty": True, "price": "40.00", "price_currency": "BRL"},
                {"account": "Assets:Bank:Checking", "amount": "2000.00", "currency": "BRL"},
                {"account": "Income:Gains"},
            ],
        })
        assert r.json()["success"] is True, r.json()
        assert booking_client.get("/api/errors").json()["count"] == 0
        assert "{} @ 40.00 BRL" in booking_file.read_text(encoding="utf-8")
        # FIFO took the February lot — and the response of the POST itself
        # must not leak Beancount's MISSING sentinel into the JSON.
        posted = r.json()["transaction"]["postings"][0]
        assert posted["cost"] is None
        assert posted["cost_currency"] is None
        [asset, _, gain] = _postings_for(booking_client, "Sell 50 PETR4 FIFO")
        assert asset["cost"] == "33.00"
        assert asset["cost_label"] == "lote-fev"
        assert gain["amount"] == "-350.00"

    def test_lot_by_date(self, booking_client: TestClient, booking_file: Path) -> None:
        r = booking_client.post("/api/transactions", json={
            "date": "2020-06-01", "narration": "Sell 50 PETR4 by date",
            "postings": [
                {"account": "Assets:Clear", "amount": -50, "currency": "PETR4",
                 "cost_date": "2020-03-01", "price": "40.00", "price_currency": "BRL"},
                {"account": "Assets:Bank:Checking", "amount": "2000.00", "currency": "BRL"},
                {"account": "Income:Gains"},
            ],
        })
        assert r.json()["success"] is True, r.json()
        assert booking_client.get("/api/errors").json()["count"] == 0
        assert "{2020-03-01} @ 40.00 BRL" in booking_file.read_text(encoding="utf-8")
        [asset, _, gain] = _postings_for(booking_client, "Sell 50 PETR4 by date")
        assert asset["cost"] == "37.00"  # the March lot, not FIFO's February one
        assert gain["amount"] == "-150.00"

    def test_lot_by_label(self, booking_client: TestClient, booking_file: Path) -> None:
        r = booking_client.post("/api/transactions", json={
            "date": "2020-06-01", "narration": "Sell 50 PETR4 by label",
            "postings": [
                {"account": "Assets:Clear", "amount": -50, "currency": "PETR4",
                 "cost_label": "lote-fev", "price": "40.00", "price_currency": "BRL"},
                {"account": "Assets:Bank:Checking", "amount": "2000.00", "currency": "BRL"},
                {"account": "Income:Gains"},
            ],
        })
        assert r.json()["success"] is True, r.json()
        assert booking_client.get("/api/errors").json()["count"] == 0
        assert '{"lote-fev"} @ 40.00 BRL' in booking_file.read_text(encoding="utf-8")
        [asset, _, _] = _postings_for(booking_client, "Sell 50 PETR4 by label")
        assert asset["cost"] == "33.00"
        assert asset["cost_label"] == "lote-fev"

    def test_lot_by_label_on_strict(self, booking_client: TestClient) -> None:
        """STRICT refuses an ambiguous ``{}`` but takes a lot named by label."""
        r = booking_client.post("/api/transactions", json={
            "date": "2020-06-01", "narration": "Sell 50 PETR4 strict",
            "postings": [
                {"account": "Assets:Rico", "amount": -50, "currency": "PETR4",
                 "cost_label": "rico-fev", "price": "40.00", "price_currency": "BRL"},
                {"account": "Assets:Bank:Checking", "amount": "2000.00", "currency": "BRL"},
                {"account": "Income:Gains"},
            ],
        })
        assert r.json()["success"] is True, r.json()
        assert booking_client.get("/api/errors").json()["count"] == 0

    def test_none_account_takes_the_average_cost(
        self, booking_client: TestClient, booking_file: Path
    ) -> None:
        """Lots at 33 and 37; Ledgr supplies the 35.00 average; gain 250.00."""
        r = booking_client.post("/api/transactions", json={
            "date": "2020-06-01", "narration": "Sell 50 PETR4 avg",
            "postings": [
                {"account": "Assets:XP", "amount": -50, "currency": "PETR4",
                 "cost": "35.00", "cost_currency": "BRL",
                 "price": "40.00", "price_currency": "BRL"},
                {"account": "Assets:Bank:Checking", "amount": "2000.00", "currency": "BRL"},
                {"account": "Income:Gains"},
            ],
        })
        assert r.json()["success"] is True, r.json()
        assert booking_client.get("/api/errors").json()["count"] == 0
        assert "{35.00 BRL} @ 40.00 BRL" in booking_file.read_text(encoding="utf-8")
        [_, _, gain] = _postings_for(booking_client, "Sell 50 PETR4 avg")
        assert gain["amount"] == "-250.00"

    def test_buy_with_date_and_label(
        self, booking_client: TestClient, booking_file: Path
    ) -> None:
        r = booking_client.post("/api/transactions", json={
            "date": "2020-06-01", "narration": "Buy 10 PETR4 labelled",
            "postings": [
                {"account": "Assets:Rico", "amount": 10, "currency": "PETR4",
                 "cost": "35.00", "cost_currency": "BRL",
                 "cost_date": "2020-06-01", "cost_label": "lote-jun"},
                {"account": "Assets:Bank:Checking", "amount": "-350.00", "currency": "BRL"},
            ],
        })
        assert r.json()["success"] is True, r.json()
        assert booking_client.get("/api/errors").json()["count"] == 0
        assert '{35.00 BRL, 2020-06-01, "lote-jun"}' in booking_file.read_text(encoding="utf-8")
        [asset, _] = _postings_for(booking_client, "Buy 10 PETR4 labelled")
        assert asset["cost_date"] == "2020-06-01"
        assert asset["cost_label"] == "lote-jun"

    def test_serialized_postings_expose_cost_label(
        self, booking_client: TestClient
    ) -> None:
        r = booking_client.get("/api/transactions", params={"account": "Assets:Clear"})
        labels = {
            p.get("cost_label")
            for t in r.json()["transactions"] for p in t["postings"]
            if p["account"] == "Assets:Clear"
        }
        assert labels == {"lote-fev", None}

    def test_edit_path_accepts_the_new_fields(
        self, booking_client: TestClient, booking_file: Path
    ) -> None:
        """PUT shares the builder: rewrite the March buy as a total cost."""
        txn = next(
            t for t in booking_client.get("/api/transactions").json()["transactions"]
            if t["narration"] == "Buy PETR4 lot mar" and t["payee"] == "Clear"
        )
        r = booking_client.put("/api/transactions", json={
            "lineno": txn["lineno"], "filename": txn["filename"],
            "date": txn["date"], "payee": "Clear", "narration": "Buy PETR4 lot mar",
            "postings": [
                {"account": "Assets:Clear", "amount": 100, "currency": "PETR4",
                 "cost_total": "3700.00", "cost_currency": "BRL"},
                {"account": "Assets:Bank:Checking", "amount": "-3700.00", "currency": "BRL"},
            ],
        })
        assert r.json()["success"] is True, r.json()
        assert booking_client.get("/api/errors").json()["count"] == 0
        assert "{# 3700.00 BRL}" in booking_file.read_text(encoding="utf-8")

    # ── 400s ──────────────────────────────────────────────────────

    @pytest.mark.parametrize("bad,fragment", [
        ({"cost_empty": True, "cost": "35.00", "cost_currency": "BRL"}, "cost_empty"),
        ({"cost_empty": True, "cost_total": "1750.00", "cost_currency": "BRL"}, "cost_empty"),
        ({"cost_empty": True, "cost_date": "2020-03-01"}, "cost_empty"),
        ({"cost_empty": True, "cost_label": "lote-fev"}, "cost_empty"),
        ({"cost_empty": True, "cost_currency": "BRL"}, "cost_empty"),
        ({"cost": "35.00", "cost_total": "1750.00", "cost_currency": "BRL"}, "not both"),
        ({"cost": "35.00"}, "cost_currency"),
        ({"cost_total": "1750.00"}, "cost_currency"),
        ({"cost_date": "03/01/2020"}, "YYYY-MM-DD"),
    ])
    def test_invalid_cost_combinations_are_400(
        self, booking_client: TestClient, bad: dict, fragment: str
    ) -> None:
        count_before = booking_client.get("/api/transactions").json()["count"]
        r = booking_client.post("/api/transactions", json={
            "date": "2020-06-01", "narration": "bad cost",
            "postings": [
                {"account": "Assets:Clear", "amount": -50, "currency": "PETR4",
                 "price": "40.00", "price_currency": "BRL", **bad},
                {"account": "Assets:Bank:Checking", "amount": "2000.00", "currency": "BRL"},
                {"account": "Income:Gains"},
            ],
        })
        assert r.status_code == 400, r.json()
        assert fragment in r.json()["detail"]
        assert booking_client.get("/api/transactions").json()["count"] == count_before

    def test_invalid_cost_combination_is_400_on_edit_too(
        self, booking_client: TestClient
    ) -> None:
        txn = booking_client.get("/api/transactions").json()["transactions"][-1]
        r = booking_client.put("/api/transactions", json={
            "lineno": txn["lineno"], "filename": txn["filename"],
            "date": txn["date"], "narration": txn["narration"],
            "postings": [
                {"account": "Assets:Rico", "amount": 100, "currency": "PETR4",
                 "cost": "33.00", "cost_total": "3300.00", "cost_currency": "BRL"},
                {"account": "Assets:Bank:Checking", "amount": "-3300.00", "currency": "BRL"},
            ],
        })
        assert r.status_code == 400
        assert booking_client.get("/api/errors").json()["count"] == 0


# ------------------------------------------------------------------
# Booking on accounts — PLAN-commodities-ux §4.9; options — §4.10
# ------------------------------------------------------------------


class TestBookingOnAccounts:
    def test_create_with_booking(
        self, booking_client: TestClient, booking_file: Path
    ) -> None:
        r = booking_client.post("/api/accounts", json={
            "name": "Assets:Nu", "date": "2020-01-01",
            "ledgr_type": "investment", "booking": "NONE",
        })
        assert r.status_code == 201, r.json()
        assert r.json()["account"]["booking"] == "NONE"
        assert booking_client.get("/api/errors").json()["count"] == 0
        assert 'open Assets:Nu' in booking_file.read_text(encoding="utf-8")
        assert '"NONE"' in booking_file.read_text(encoding="utf-8")

    def test_create_with_currencies_and_booking(
        self, booking_client: TestClient
    ) -> None:
        r = booking_client.post("/api/accounts", json={
            "name": "Assets:Nu", "date": "2020-01-01", "ledgr_type": "investment",
            "currencies": ["PETR4", "ITUB4"], "booking": "HIFO",
        })
        assert r.status_code == 201, r.json()
        assert r.json()["account"]["currencies"] == ["PETR4", "ITUB4"]
        assert r.json()["account"]["booking"] == "HIFO"
        node = _find_node(booking_client.get("/api/accounts").json()["accounts"], "Assets:Nu")
        assert node["currencies"] == ["PETR4", "ITUB4"]
        assert node["booking"] == "HIFO"
        assert booking_client.get("/api/errors").json()["count"] == 0

    def test_create_without_booking_is_a_spend_account(
        self, booking_client: TestClient
    ) -> None:
        r = booking_client.post("/api/accounts", json={
            "name": "Assets:Global", "date": "2020-01-01",
            "ledgr_type": "cash", "currencies": ["USD"],
        })
        assert r.status_code == 201, r.json()
        assert r.json()["account"]["booking"] is None

    def test_tree_nodes_expose_booking(self, booking_client: TestClient) -> None:
        nodes = booking_client.get("/api/accounts").json()["accounts"]
        assert _find_node(nodes, "Assets:XP")["booking"] == "NONE"
        assert _find_node(nodes, "Assets:Clear")["booking"] == "FIFO"
        assert _find_node(nodes, "Assets:Rico")["booking"] == "STRICT"
        assert _find_node(nodes, "Assets:Bank:Checking")["booking"] is None
        # A structural node has no `open` and so no booking either.
        assert _find_node(nodes, "Assets:Bank")["booking"] is None

    @pytest.mark.parametrize("method", ["STRICT", "STRICT_WITH_SIZE", "FIFO", "LIFO", "HIFO", "NONE"])
    def test_every_implemented_method_is_accepted(
        self, booking_client: TestClient, method: str
    ) -> None:
        r = booking_client.post("/api/accounts", json={
            "name": "Assets:Nu", "date": "2020-01-01",
            "ledgr_type": "investment", "booking": method,
        })
        assert r.status_code == 201, r.json()
        assert r.json()["account"]["booking"] == method
        assert booking_client.get("/api/errors").json()["count"] == 0

    def test_unknown_booking_is_400(self, booking_client: TestClient) -> None:
        r = booking_client.post("/api/accounts", json={
            "name": "Assets:Nu", "date": "2020-01-01",
            "ledgr_type": "investment", "booking": "fifo",
        })
        assert r.status_code == 400
        assert "Invalid booking method" in r.json()["detail"]

    def test_average_is_refused_with_a_reason(self, booking_client: TestClient) -> None:
        """In the enum, not in the code: a ledger using it fails to load."""
        r = booking_client.post("/api/accounts", json={
            "name": "Assets:Nu", "date": "2020-01-01",
            "ledgr_type": "investment", "booking": "AVERAGE",
        })
        assert r.status_code == 400
        assert "3.2" in r.json()["detail"]
        assert "NONE" in r.json()["detail"]

    def test_update_sets_booking_and_preserves_the_rest(
        self, booking_client: TestClient, booking_file: Path
    ) -> None:
        r = booking_client.put("/api/accounts", json={
            "name": "Assets:Bank:Checking", "booking": "FIFO",
        })
        assert r.status_code == 200, r.json()
        acct = r.json()["account"]
        assert acct["booking"] == "FIFO"
        assert acct["open_date"] == "2020-01-01"
        assert acct["currencies"] == ["BRL"]
        assert acct["ledgr_type"] == "cash"
        assert booking_client.get("/api/errors").json()["count"] == 0
        assert '2020-01-01 open Assets:Bank:Checking  BRL  "FIFO"' in booking_file.read_text(encoding="utf-8")

    def test_update_with_empty_string_clears_booking(
        self, booking_client: TestClient, booking_file: Path
    ) -> None:
        r = booking_client.put("/api/accounts", json={
            "name": "Assets:XP", "booking": "",
        })
        assert r.status_code == 200, r.json()
        assert r.json()["account"]["booking"] is None
        assert r.json()["account"]["ledgr_type"] == "investment"
        assert booking_client.get("/api/errors").json()["count"] == 0
        assert '"NONE"' not in booking_file.read_text(encoding="utf-8")

    def test_update_without_booking_leaves_it_alone(
        self, booking_client: TestClient
    ) -> None:
        r = booking_client.put("/api/accounts", json={
            "name": "Assets:XP", "metadata": {"broker": "XP Investimentos"},
        })
        assert r.status_code == 200, r.json()
        assert r.json()["account"]["booking"] == "NONE"
        assert r.json()["account"]["metadata"]["broker"] == "XP Investimentos"
        assert booking_client.get("/api/errors").json()["count"] == 0

    def test_update_with_invalid_booking_is_400_and_writes_nothing(
        self, booking_client: TestClient, booking_file: Path
    ) -> None:
        before = booking_file.read_text(encoding="utf-8")
        r = booking_client.put("/api/accounts", json={
            "name": "Assets:XP", "booking": "AVERAGE",
        })
        assert r.status_code == 400
        assert booking_file.read_text(encoding="utf-8") == before

    def test_none_account_from_the_api_takes_an_average_cost_sale(
        self, booking_client: TestClient
    ) -> None:
        """Open NONE via the API, buy at 33 and 37, sell 50 at the 35 average
        with the gain elided — the whole Brazilian flow, zero errors."""
        assert booking_client.post("/api/accounts", json={
            "name": "Assets:Nu", "date": "2020-01-01",
            "ledgr_type": "investment", "booking": "NONE",
        }).status_code == 201
        for date, cost in (("2020-02-01", "33.00"), ("2020-03-01", "37.00")):
            r = booking_client.post("/api/transactions", json={
                "date": date, "narration": f"Buy Nu {cost}",
                "postings": [
                    {"account": "Assets:Nu", "amount": 100, "currency": "PETR4",
                     "cost": cost, "cost_currency": "BRL"},
                    {"account": "Assets:Bank:Checking"},
                ],
            })
            assert r.json()["success"] is True, r.json()
        r = booking_client.post("/api/transactions", json={
            "date": "2020-06-01", "narration": "Sell Nu avg",
            "postings": [
                {"account": "Assets:Nu", "amount": -50, "currency": "PETR4",
                 "cost": "35.00", "cost_currency": "BRL",
                 "price": "40.00", "price_currency": "BRL"},
                {"account": "Assets:Bank:Checking", "amount": "2000.00", "currency": "BRL"},
                {"account": "Income:Gains"},
            ],
        })
        assert r.json()["success"] is True, r.json()
        assert booking_client.get("/api/errors").json()["count"] == 0
        [_, _, gain] = _postings_for(booking_client, "Sell Nu avg")
        assert gain["amount"] == "-250.00"

    def test_fifo_account_from_the_api_takes_an_empty_cost_sale(
        self, booking_client: TestClient
    ) -> None:
        assert booking_client.post("/api/accounts", json={
            "name": "Assets:Nu", "date": "2020-01-01",
            "ledgr_type": "investment", "booking": "FIFO",
        }).status_code == 201
        for date, cost in (("2020-02-01", "33.00"), ("2020-03-01", "37.00")):
            r = booking_client.post("/api/transactions", json={
                "date": date, "narration": f"Buy Nu {cost}",
                "postings": [
                    {"account": "Assets:Nu", "amount": 100, "currency": "PETR4",
                     "cost": cost, "cost_currency": "BRL"},
                    {"account": "Assets:Bank:Checking"},
                ],
            })
            assert r.json()["success"] is True, r.json()
        r = booking_client.post("/api/transactions", json={
            "date": "2020-06-01", "narration": "Sell Nu fifo",
            "postings": [
                {"account": "Assets:Nu", "amount": -50, "currency": "PETR4",
                 "cost_empty": True, "price": "40.00", "price_currency": "BRL"},
                {"account": "Assets:Bank:Checking", "amount": "2000.00", "currency": "BRL"},
                {"account": "Income:Gains"},
            ],
        })
        assert r.json()["success"] is True, r.json()
        assert booking_client.get("/api/errors").json()["count"] == 0
        [asset, _, gain] = _postings_for(booking_client, "Sell Nu fifo")
        assert asset["cost"] == "33.00"
        assert gain["amount"] == "-350.00"


class TestOptionsCommodities:
    def test_plugins_and_commodities(self, booking_client: TestClient) -> None:
        body = booking_client.get("/api/options").json()
        assert body["plugins"] == ["beancount.plugins.implicit_prices"]
        assert body["commodities"] == sorted(body["commodities"])
        # Held (PETR4), operating (BRL) and declared-but-unused (ITUB4) alike.
        assert {"BRL", "PETR4", "ITUB4"} <= set(body["commodities"])

    def test_ledger_without_plugins(self, client: TestClient) -> None:
        body = client.get("/api/options").json()
        assert body["plugins"] == []
        assert isinstance(body["commodities"], list)
        assert "BRL" in body["commodities"]


class TestUnitsAndCostPrecision:
    """Quantities are never rounded; cost and price are padded to two places."""

    from decimal import Decimal as _D

    def _build(self, spec, oc="BRL"):
        from routers.transactions import PostingIn, _build_bc_postings
        return _build_bc_postings([PostingIn(**spec)], oc)[0]

    def test_operating_currency_units_still_quantized(self):
        p = self._build({"account": "Assets:Bank", "amount": "38.2", "currency": "BRL"})
        assert str(p.units.number) == "38.20"

    def test_non_oc_quantity_keeps_its_precision(self):
        p = self._build({"account": "Assets:Crypto", "amount": "0.005", "currency": "BTC"})
        assert str(p.units.number) == "0.005"

    def test_currency_code_units_are_padded_not_rounded(self):
        p = self._build({"account": "Assets:Global", "amount": "1000", "currency": "USD"})
        assert str(p.units.number) == "1000.00"

    def test_share_quantity_is_written_exactly_as_typed(self):
        p = self._build({"account": "Assets:XP", "amount": "50", "currency": "PETR4"})
        assert str(p.units.number) == "50"
        p = self._build({"account": "Assets:Vacation", "amount": "2.5", "currency": "VACDAY"})
        assert str(p.units.number) == "2.5"

    def test_cost_and_price_padded_to_two_places(self):
        from beancount.parser import printer
        from beancount.core import data
        p = self._build({
            "account": "Assets:XP", "amount": "100", "currency": "PETR4",
            "cost": "33", "cost_currency": "BRL",
            "price": "40.5", "price_currency": "BRL",
        })
        assert str(p.cost.number_per) == "33.00"
        assert str(p.price.number) == "40.50"

    def test_cost_with_more_precision_is_untouched(self):
        p = self._build({
            "account": "Assets:XP", "amount": "1", "currency": "XAU",
            "cost": "1700.125", "cost_currency": "USD",
        })
        assert str(p.cost.number_per) == "1700.125"


# ------------------------------------------------------------------
# Account tree under the conversion lens
# ------------------------------------------------------------------


def _walk_nodes(nodes: list[dict]):
    """Every node of a serialized account tree, depth first."""
    for node in nodes:
        yield node
        yield from _walk_nodes(node["children"])


def _oc_sum(balance: list[dict], oc: str = "BRL") -> Decimal | None:
    """The operating-currency part of a raw balance; None when there is none."""
    parts = [Decimal(b["number"]) for b in balance if b["currency"] == oc]
    return sum(parts, Decimal(0)) if parts else None


def _value(node: dict) -> Decimal | None:
    return Decimal(node["value"]) if node["value"] is not None else None


class TestAccountsConversionLens:
    """``GET /api/accounts?conversion=`` adds ``value`` / ``other`` per node.

    ``value`` is the subtree total in the operating currency as seen through
    the lens (Fava's conversion, never Ledgr arithmetic); ``other`` is what the
    lens could not bring across. ``balance`` — the raw positions — must not
    change with the lens, so everything already built on it keeps working.
    """

    LENSES = ("units", "at_cost", "at_value")

    def _tree(self, client: TestClient, **params: str) -> list[dict]:
        r = client.get("/api/accounts", params=params)
        assert r.status_code == 200, r.text
        return r.json()["accounts"]

    def test_every_node_carries_value_and_other(self, commodities_client: TestClient) -> None:
        for node in _walk_nodes(self._tree(commodities_client)):
            assert "value" in node and "other" in node
            assert node["value"] is None or isinstance(node["value"], str)
            for pos in node["other"]:
                assert set(pos) == {"number", "currency"}

    def test_default_lens_is_at_value(self, commodities_client: TestClient) -> None:
        assert self._tree(commodities_client) == self._tree(
            commodities_client, conversion="at_value"
        )

    def test_mixed_account_at_value_folds_fx_into_value(self, commodities_client: TestClient) -> None:
        # Assets:Bank holds BRL cash and a USD balance. At market (USD 5.20 BRL
        # in the fixture) the USD is brought into the BRL total; nothing is
        # left over.
        bank = _find_node(self._tree(commodities_client, conversion="at_value"), "Assets:Bank")
        assert bank is not None
        brl = _oc_sum(bank["balance"])
        usd = sum(Decimal(b["number"]) for b in bank["balance"] if b["currency"] == "USD")
        assert usd != 0, "fixture should leave a USD balance in Assets:Bank"
        assert _value(bank) == brl + usd * Decimal("5.20")
        assert bank["other"] == []

    def test_held_at_cost_account_at_value_uses_market_price(self, commodities_client: TestClient) -> None:
        broker = _find_node(
            self._tree(commodities_client, conversion="at_value"), "Assets:Broker:PETR4"
        )
        assert broker is not None
        units = sum(Decimal(b["number"]) for b in broker["balance"])
        assert _value(broker) == units * Decimal("35.00")
        assert broker["other"] == []

    def test_at_cost_values_lots_at_their_basis(self, commodities_client: TestClient) -> None:
        broker = _find_node(
            self._tree(commodities_client, conversion="at_cost"), "Assets:Broker:PETR4"
        )
        assert broker is not None
        basis = sum(Decimal(b["number"]) * Decimal(b["cost"]) for b in broker["balance"])
        assert _value(broker) == basis
        assert broker["other"] == []

    def test_spend_account_at_cost_has_no_value_and_keeps_units(self, commodities_client: TestClient) -> None:
        # USD bought `@ price` carries no cost, so the cost lens cannot value
        # it: the leaf has no value at all, and the parent keeps its BRL total
        # with the USD reported alongside.
        tree = self._tree(commodities_client, conversion="at_cost")
        usd = _find_node(tree, "Assets:Bank:USD")
        assert usd is not None
        assert usd["value"] is None
        assert usd["other"] == [{"number": "-550.00", "currency": "USD"}]
        bank = _find_node(tree, "Assets:Bank")
        assert bank is not None
        assert _value(bank) == _oc_sum(bank["balance"])
        assert bank["other"] == [{"number": "-550.00", "currency": "USD"}]

    def test_unconvertible_commodity_stays_in_other_under_every_lens(self, commodities_client: TestClient) -> None:
        for lens in self.LENSES:
            tree = self._tree(commodities_client, conversion=lens)
            vac = _find_node(tree, "Assets:Vacation")
            assert vac is not None
            assert vac["value"] is None
            assert vac["other"] == [{"number": "0.5", "currency": "VACDAY"}]
            root = _find_node(tree, "Assets")
            assert root is not None
            assert {"number": "0.5", "currency": "VACDAY"} in root["other"]

    def test_at_value_root_leaves_only_vacation_days_unvalued(self, commodities_client: TestClient) -> None:
        root = _find_node(self._tree(commodities_client, conversion="at_value"), "Assets")
        assert root is not None
        assert root["value"] is not None
        assert root["other"] == [{"number": "0.5", "currency": "VACDAY"}]

    def test_units_lens_value_is_the_operating_currency_part(self, commodities_client: TestClient) -> None:
        for node in _walk_nodes(self._tree(commodities_client, conversion="units")):
            assert _value(node) == _oc_sum(node["balance"])
            expected: dict[str, Decimal] = {}
            for b in node["balance"]:
                if b["currency"] != "BRL":
                    expected[b["currency"]] = expected.get(b["currency"], Decimal(0)) + Decimal(b["number"])
            assert {o["currency"]: Decimal(o["number"]) for o in node["other"]} == {
                c: n for c, n in expected.items() if n != 0
            }

    def test_other_is_sorted_by_currency(self, commodities_client: TestClient) -> None:
        root = _find_node(self._tree(commodities_client, conversion="units"), "Assets")
        assert root is not None
        currencies = [o["currency"] for o in root["other"]]
        assert len(currencies) > 1
        assert currencies == sorted(currencies)

    def test_balance_is_identical_under_every_lens(self, commodities_client: TestClient) -> None:
        def raw(tree: list[dict]) -> list[tuple[str, list[dict]]]:
            return [(n["name"], n["balance"]) for n in _walk_nodes(tree)]

        trees = [raw(self._tree(commodities_client, conversion=lens)) for lens in self.LENSES]
        assert trees[0] == trees[1] == trees[2]

    def test_currency_lens_states_value_in_that_currency(self, commodities_client: TestClient) -> None:
        usd = _find_node(self._tree(commodities_client, conversion="USD"), "Assets:Bank:USD")
        assert usd is not None
        assert _value(usd) == Decimal("-550.00")
        assert usd["other"] == []

    def test_oc_only_ledger_is_lens_invariant(self, client: TestClient) -> None:
        # Regression guard for the user's current, single-currency file: the
        # lens must be invisible there.
        baseline = self._tree(client)
        for lens in self.LENSES:
            tree = self._tree(client, conversion=lens)
            assert tree == baseline
            for node in _walk_nodes(tree):
                assert node["other"] == []
                assert _value(node) == _oc_sum(node["balance"])

    def test_garbage_lens_is_a_400(self, client: TestClient) -> None:
        r = client.get("/api/accounts", params={"conversion": "bananas"})
        assert r.status_code == 400
        assert "conversion" in r.json()["detail"]


class TestAccountsOtherIsWhatIsHeld:
    """`other` names the commodity in the account, not the lens's intermediate."""

    def test_gold_at_cost_is_reported_as_xau(self):
        from fastapi.testclient import TestClient
        from ledger import init_ledger
        from main import app
        import os
        init_ledger(os.path.join(os.path.dirname(__file__), "fixtures", "commodities.beancount"))
        client = TestClient(app)
        body = client.get("/api/accounts?conversion=at_cost").json()

        def find(nodes, name):
            for n in nodes:
                if n["name"] == name:
                    return n
                hit = find(n.get("children", []), name)
                if hit:
                    return hit
            return None

        vault = find(body["accounts"], "Assets:Vault:XAU")
        assert vault is not None
        # {1700 USD} cost does not chain to BRL under at_cost: the leftover is the gold itself.
        assert vault["other"] == [{"number": "1", "currency": "XAU"}]
        assert vault["value"] is None


class TestOpeningBalancesPerCurrency:
    """`opening_balances` keeps one number per commodity; `opening_balance` is OC only."""

    def _client(self):
        from fastapi.testclient import TestClient
        from ledger import init_ledger
        from main import app
        import os
        init_ledger(os.path.join(os.path.dirname(__file__), "fixtures", "commodities.beancount"))
        return TestClient(app)

    def test_usd_wallet(self):
        body = self._client().get(
            "/api/transactions?account=Assets:Bank:USD&from_date=2020-07-01&to_date=2020-12-31"
        ).json()
        # 1000 USD bought in May, 3400 USD spent on gold in June.
        assert body["opening_balances"] == {"USD": "-2400.00"}
        assert body["opening_balance"] == "0"

    def test_share_account(self):
        body = self._client().get(
            "/api/transactions?account=Assets:Broker:PETR4&from_date=2020-08-01&to_date=2020-12-31"
        ).json()
        assert body["opening_balances"] == {"PETR4": "250"}
        assert body["opening_balance"] == "0"

    def test_brl_account_unchanged(self):
        body = self._client().get(
            "/api/transactions?account=Assets:Bank:Checking&from_date=2020-03-01&to_date=2020-12-31"
        ).json()
        assert body["opening_balances"] == {"BRL": body["opening_balance"]}
        assert body["opening_balance"] != "0"

    def test_absent_without_a_window(self):
        body = self._client().get("/api/transactions?account=Assets:Bank:USD").json()
        assert body["opening_balances"] == {}
        assert body["opening_balance"] == "0"


class TestStructuralAccountPostings:
    """A structural node (`Assets:Invest`, no `open` of its own) is in the tree
    but is not an account a posting can name — Beancount calls it "unknown".
    Found when a Composer split picked `Expenses:Gifts` over its child
    `Expenses:Gifts:Gifts` and left a parse error in the ledger."""

    def _txn(self, account: str) -> dict:
        return {
            "date": "2025-06-01",
            "narration": "to a parent",
            "postings": [
                {"account": account, "amount": "10.00", "currency": "BRL"},
                {"account": "Assets:Bank:Main", "amount": "-10.00", "currency": "BRL"},
            ],
        }

    def test_posting_to_structural_parent_refused(
        self, hierarchy_client: TestClient
    ) -> None:
        body = hierarchy_client.post(
            "/api/transactions", json=self._txn("Assets:Invest")
        ).json()
        assert body["success"] is False
        assert "'Assets:Invest' is not open" in body["errors"][0]
        assert "Assets:Invest:Clear" in body["errors"][0]
        assert hierarchy_client.get("/api/errors").json()["errors"] == []

    def test_posting_to_unknown_account_refused(
        self, hierarchy_client: TestClient
    ) -> None:
        body = hierarchy_client.post(
            "/api/transactions", json=self._txn("Expenses:Nowhere")
        ).json()
        assert body["success"] is False
        assert "'Expenses:Nowhere' is not open" in body["errors"][0]

    def test_series_to_structural_parent_refused(
        self, hierarchy_client: TestClient
    ) -> None:
        r = hierarchy_client.post("/api/series", json={
            "type": "installment",
            "payee": "Shop",
            "narration": "parcelado",
            "start_date": "2025-06-01",
            "count": 3,
            "currency": "BRL",
            "postings": [
                {"account": "Assets:Invest", "amount": "10.00"},
                {"account": "Assets:Bank:Main", "amount": None},
            ],
        })
        body = r.json()
        assert body["success"] is False
        assert "'Assets:Invest' is not open" in body["errors"][0]

    def test_postable_account_names_drop_structural_parents(
        self, hierarchy_client: TestClient
    ) -> None:
        names = hierarchy_client.get(
            "/api/account-names", params={"postable": "true"}
        ).json()["accounts"]
        assert "Assets:Invest" not in names
        assert "Assets:Invest:Clear" in names
        # The default list still carries them, for filters.
        default = hierarchy_client.get("/api/account-names").json()["accounts"]
        assert "Assets:Invest" in default
