"""Integration tests for the series router using FastAPI TestClient.

Uses real FavaLedger instances with fixture files — never mocks.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import ledger as ledger_mod

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture()
def series_client(tmp_path: Path) -> TestClient:
    """TestClient backed by the series fixture."""
    src = FIXTURES_DIR / "series.beancount"
    dst = tmp_path / "series.beancount"
    shutil.copy(src, dst)

    ledger_mod.init_ledger(str(dst))

    from main import app

    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture()
def minimal_client(tmp_path: Path) -> TestClient:
    """TestClient backed by the minimal fixture (no existing series)."""
    src = FIXTURES_DIR / "minimal.beancount"
    dst = tmp_path / "minimal.beancount"
    shutil.copy(src, dst)

    ledger_mod.init_ledger(str(dst))

    from main import app

    return TestClient(app, raise_server_exceptions=False)


# ------------------------------------------------------------------
# GET /api/series
# ------------------------------------------------------------------


class TestListSeries:
    def test_returns_existing_series(self, series_client: TestClient) -> None:
        r = series_client.get("/api/series")
        assert r.status_code == 200
        body = r.json()
        assert "series" in body
        assert len(body["series"]) == 3  # tv, netflix, split

    def test_summary_shape(self, series_client: TestClient) -> None:
        r = series_client.get("/api/series")
        body = r.json()
        s = body["series"][0]
        expected_keys = {
            "series_id", "type", "payee", "narration",
            "amount_per_txn", "currency", "total", "confirmed",
            "pending", "first_date", "last_date",
            "account_from", "account_to",
            "postings", "is_split",
        }
        assert expected_keys.issubset(s.keys())

    def test_installment_counts(self, series_client: TestClient) -> None:
        r = series_client.get("/api/series")
        body = r.json()
        installment = next(
            s for s in body["series"] if s["type"] == "installment"
        )
        assert installment["total"] == 3
        assert installment["confirmed"] == 2
        assert installment["pending"] == 1

    def test_recurring_counts(self, series_client: TestClient) -> None:
        r = series_client.get("/api/series")
        body = r.json()
        recurring = next(
            s for s in body["series"]
            if s["type"] == "recurring" and s["series_id"] == "netflix-fix002"
        )
        assert recurring["total"] == 4
        assert recurring["confirmed"] == 1
        assert recurring["pending"] == 3

    def test_split_series_fields(self, series_client: TestClient) -> None:
        r = series_client.get("/api/series")
        body = r.json()
        split = next(
            s for s in body["series"] if s["series_id"] == "split-fix003"
        )
        assert split["is_split"] is True
        assert len(split["postings"]) == 3
        # amount_per_txn = sum of positive postings = 60 + 40 = 100
        assert split["amount_per_txn"] == "100.00"

    def test_simple_series_not_split(self, series_client: TestClient) -> None:
        r = series_client.get("/api/series")
        body = r.json()
        netflix = next(
            s for s in body["series"] if s["series_id"] == "netflix-fix002"
        )
        assert netflix["is_split"] is False

    def test_empty_when_no_series(self, minimal_client: TestClient) -> None:
        r = minimal_client.get("/api/series")
        assert r.status_code == 200
        body = r.json()
        assert body["series"] == []

    def test_filter_by_date_hides_out_of_range_series(
        self, series_client: TestClient
    ) -> None:
        """Fixture installments run 2025-01-15..2025-03-15; narrowing to
        April should return nothing since no txn falls in that window."""
        r = series_client.get(
            "/api/series",
            params={"from_date": "2025-04-15", "to_date": "2025-05-15"},
        )
        assert r.status_code == 200
        assert r.json()["series"] == []

    def test_filter_by_account_keeps_matching_series(
        self, series_client: TestClient
    ) -> None:
        """Only TV installment and split combo touch Expenses:Electronics /
        Expenses:Food — Netflix doesn't, so filtering by
        Assets:Bank:Checking should exclude the TV installment."""
        r = series_client.get(
            "/api/series", params={"account": "Assets:Bank:Checking"}
        )
        assert r.status_code == 200
        ids = {s["series_id"] for s in r.json()["series"]}
        assert "tv-fixture001" not in ids
        assert "netflix-fix002" in ids
        assert "split-fix003" in ids

    def test_filter_by_date_narrows_counts(
        self, series_client: TestClient
    ) -> None:
        """Restrict to Jan 2025 — Netflix should surface with only its
        single January txn counted."""
        r = series_client.get(
            "/api/series",
            params={"from_date": "2025-01-01", "to_date": "2025-02-01"},
        )
        assert r.status_code == 200
        netflix = next(
            s for s in r.json()["series"] if s["series_id"] == "netflix-fix002"
        )
        assert netflix["total"] == 1
        assert netflix["confirmed"] == 1
        assert netflix["pending"] == 0


# ------------------------------------------------------------------
# POST /api/series — installment
# ------------------------------------------------------------------


class TestCreateInstallmentSeries:
    def test_creates_correct_count(self, minimal_client: TestClient) -> None:
        r = minimal_client.post("/api/series", json={
            "type": "installment",
            "payee": "Store",
            "narration": "TV",
            "start_date": "2025-04-15",
            "count": 6,
            "currency": "BRL",
            "postings": [
                {"account": "Expenses:Food", "amount": "250.00"},
                {"account": "Liabilities:CreditCard", "amount": "-250.00"},
            ],
        })
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["count"] == 6
        assert body["transactions_created"] == 6

    def test_appears_in_list(self, minimal_client: TestClient) -> None:
        minimal_client.post("/api/series", json={
            "type": "installment",
            "payee": "Store",
            "narration": "Gadget",
            "start_date": "2025-05-01",
            "count": 3,
            "currency": "BRL",
            "postings": [
                {"account": "Expenses:Food", "amount": "100"},
                {"account": "Liabilities:CreditCard", "amount": "-100"},
            ],
        })
        r = minimal_client.get("/api/series")
        body = r.json()
        assert len(body["series"]) == 1
        assert body["series"][0]["type"] == "installment"
        assert body["series"][0]["total"] == 3

    def test_rejects_without_count(self, minimal_client: TestClient) -> None:
        r = minimal_client.post("/api/series", json={
            "type": "installment",
            "payee": "Store",
            "narration": "TV",
            "start_date": "2025-04-15",
            "currency": "BRL",
            "postings": [
                {"account": "Expenses:Food", "amount": "250.00"},
                {"account": "Liabilities:CreditCard", "amount": "-250.00"},
            ],
        })
        assert r.status_code == 400

    def test_amount_is_total(self, minimal_client: TestClient) -> None:
        r = minimal_client.post("/api/series", json={
            "type": "installment",
            "payee": "Store",
            "narration": "TV",
            "start_date": "2025-01-01",
            "count": 3,
            "amount_is_total": True,
            "currency": "BRL",
            "postings": [
                {"account": "Expenses:Food", "amount": "1000"},
                {"account": "Liabilities:CreditCard", "amount": "-1000"},
            ],
        })
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["count"] == 3

        # Verify the transactions have correct amounts via the list endpoint
        series_id = body["series_id"]
        txns_r = minimal_client.get("/api/transactions")
        txns = txns_r.json()["transactions"]
        series_txns = [
            t for t in txns
            if t.get("metadata", {}).get("ledgr-series") == series_id
        ]
        amounts = [
            abs(float(p["amount"]))
            for t in series_txns
            for p in t["postings"]
            if float(p["amount"]) > 0
        ]
        # R$1000 / 3 = R$333.33, R$333.33, R$333.34
        assert sum(amounts) == pytest.approx(1000.0)


# ------------------------------------------------------------------
# POST /api/series — recurring
# ------------------------------------------------------------------


class TestCreateRecurringSeries:
    def test_creates_correct_count(self, minimal_client: TestClient) -> None:
        r = minimal_client.post("/api/series", json={
            "type": "recurring",
            "payee": "Netflix",
            "narration": "Assinatura",
            "start_date": "2025-04-01",
            "end_date": "2025-09-01",
            "currency": "BRL",
            "postings": [
                {"account": "Expenses:Food", "amount": "55.90"},
                {"account": "Assets:Checking", "amount": "-55.90"},
            ],
        })
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["count"] == 6  # Apr through Sep inclusive

    def test_rejects_without_end_date(self, minimal_client: TestClient) -> None:
        r = minimal_client.post("/api/series", json={
            "type": "recurring",
            "payee": "Netflix",
            "narration": "Assinatura",
            "start_date": "2025-04-01",
            "currency": "BRL",
            "postings": [
                {"account": "Expenses:Food", "amount": "55.90"},
                {"account": "Assets:Checking", "amount": "-55.90"},
            ],
        })
        assert r.status_code == 400


# ------------------------------------------------------------------
# POST /api/series — validation
# ------------------------------------------------------------------


class TestSeriesValidation:
    def test_rejects_amount_is_total_for_recurring(
        self, minimal_client: TestClient
    ) -> None:
        r = minimal_client.post("/api/series", json={
            "type": "recurring",
            "payee": "Netflix",
            "narration": "Sub",
            "start_date": "2025-04-01",
            "end_date": "2025-06-01",
            "currency": "BRL",
            "postings": [
                {"account": "Expenses:Food", "amount": "100"},
                {"account": "Assets:Checking", "amount": "-100"},
            ],
            "amount_is_total": True,
        })
        assert r.status_code == 400

    def test_rejects_less_than_two_postings(
        self, minimal_client: TestClient
    ) -> None:
        r = minimal_client.post("/api/series", json={
            "type": "recurring",
            "payee": "P",
            "narration": "N",
            "start_date": "2025-04-01",
            "end_date": "2025-06-01",
            "currency": "BRL",
            "postings": [
                {"account": "Expenses:Food", "amount": "100"},
            ],
        })
        assert r.status_code == 400

    def test_rejects_multiple_auto_balance(
        self, minimal_client: TestClient
    ) -> None:
        r = minimal_client.post("/api/series", json={
            "type": "recurring",
            "payee": "P",
            "narration": "N",
            "start_date": "2025-04-01",
            "end_date": "2025-06-01",
            "currency": "BRL",
            "postings": [
                {"account": "Expenses:Food"},
                {"account": "Assets:Checking"},
            ],
        })
        assert r.status_code == 400


# ------------------------------------------------------------------
# POST /api/series — split (multi-posting)
# ------------------------------------------------------------------


class TestCreateSplitSeries:
    def test_creates_three_posting_series(
        self, minimal_client: TestClient
    ) -> None:
        r = minimal_client.post("/api/series", json={
            "type": "recurring",
            "payee": "Combo",
            "narration": "Monthly split",
            "start_date": "2025-04-01",
            "end_date": "2025-06-01",
            "currency": "BRL",
            "postings": [
                {"account": "Expenses:Food", "amount": "60"},
                {"account": "Expenses:Entertainment", "amount": "40"},
                {"account": "Assets:Checking", "amount": "-100"},
            ],
        })
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["count"] == 3

        # Verify it appears as split in list
        r2 = minimal_client.get("/api/series")
        series = r2.json()["series"][0]
        assert series["is_split"] is True
        assert len(series["postings"]) == 3

    def test_split_with_auto_balance(
        self, minimal_client: TestClient
    ) -> None:
        r = minimal_client.post("/api/series", json={
            "type": "recurring",
            "payee": "Combo",
            "narration": "Auto balance split",
            "start_date": "2025-04-01",
            "end_date": "2025-05-01",
            "currency": "BRL",
            "postings": [
                {"account": "Expenses:Food", "amount": "60"},
                {"account": "Expenses:Entertainment", "amount": "40"},
                {"account": "Assets:Checking"},
            ],
        })
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True

    def test_rejects_amount_is_total_for_split(
        self, minimal_client: TestClient
    ) -> None:
        r = minimal_client.post("/api/series", json={
            "type": "installment",
            "payee": "P",
            "narration": "N",
            "start_date": "2025-01-01",
            "count": 3,
            "currency": "BRL",
            "amount_is_total": True,
            "postings": [
                {"account": "Expenses:Food", "amount": "60"},
                {"account": "Expenses:Entertainment", "amount": "40"},
                {"account": "Assets:Checking", "amount": "-100"},
            ],
        })
        assert r.status_code == 400


# ------------------------------------------------------------------
# POST /api/series/{id}/extend
# ------------------------------------------------------------------


class TestExtendSeries:
    def test_extend_recurring(self, series_client: TestClient) -> None:
        r = series_client.post(
            "/api/series/netflix-fix002/extend",
            json={"new_end_date": "2025-07-01"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["transactions_created"] == 3  # May, Jun, Jul

    def test_extend_with_new_amount(self, series_client: TestClient) -> None:
        r = series_client.post(
            "/api/series/netflix-fix002/extend",
            json={"new_end_date": "2025-06-01", "new_amount": "65.90"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["transactions_created"] == 2  # May, Jun

    def test_rejects_installment_extend(
        self, series_client: TestClient
    ) -> None:
        r = series_client.post(
            "/api/series/tv-fixture001/extend",
            json={"new_end_date": "2025-12-01"},
        )
        assert r.status_code == 400

    def test_rejects_past_end_date(self, series_client: TestClient) -> None:
        r = series_client.post(
            "/api/series/netflix-fix002/extend",
            json={"new_end_date": "2025-01-01"},
        )
        assert r.status_code == 400

    def test_not_found(self, series_client: TestClient) -> None:
        r = series_client.post(
            "/api/series/nonexistent/extend",
            json={"new_end_date": "2025-12-01"},
        )
        assert r.status_code == 404


class TestExtendSplitSeries:
    def test_extend_split_series_carries_postings(
        self, series_client: TestClient
    ) -> None:
        """Extending a split series carries forward all postings."""
        r = series_client.post(
            "/api/series/split-fix003/extend",
            json={"new_end_date": "2025-06-01"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["transactions_created"] == 3  # Apr, May, Jun

    def test_extend_split_rejects_new_amount(
        self, series_client: TestClient
    ) -> None:
        """Cannot provide new_amount when extending a split series."""
        r = series_client.post(
            "/api/series/split-fix003/extend",
            json={"new_end_date": "2025-06-01", "new_amount": "200"},
        )
        assert r.status_code == 400


# ------------------------------------------------------------------
# DELETE /api/series/{id}
# ------------------------------------------------------------------


class TestCancelSeries:
    def test_deletes_pending_only(self, series_client: TestClient) -> None:
        r = series_client.delete("/api/series/netflix-fix002")
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["deleted"] == 3   # 3 pending
        assert body["kept"] == 1      # 1 confirmed

    def test_confirmed_transactions_remain(
        self, series_client: TestClient
    ) -> None:
        series_client.delete("/api/series/tv-fixture001")
        r = series_client.get("/api/series")
        body = r.json()
        # The installment series should still show (2 confirmed txns remain)
        tv_series = [
            s for s in body["series"] if s["series_id"] == "tv-fixture001"
        ]
        assert len(tv_series) == 1
        assert tv_series[0]["total"] == 2
        assert tv_series[0]["confirmed"] == 2
        assert tv_series[0]["pending"] == 0

    def test_not_found(self, series_client: TestClient) -> None:
        r = series_client.delete("/api/series/nonexistent")
        assert r.status_code == 404


# ------------------------------------------------------------------
# PUT /api/transactions — ledgr-* metadata preservation
# ------------------------------------------------------------------


class TestEditTransactionPreservesSeriesMetadata:
    """Editing a series transaction must keep ledgr-* metadata intact.

    Regression: before the fix, edit_transaction built a fresh metadata dict
    that discarded all ledgr-series* keys, causing the transaction to vanish
    from its series and the progress count to drop.
    """

    def test_edit_preserves_ledgr_series_metadata(
        self, series_client: TestClient
    ) -> None:
        # Get the pending installment txn (3/3 of tv-fixture001)
        r = series_client.get(
            "/api/transactions", params={"account": "Expenses:Electronics"}
        )
        txns = r.json()["transactions"]
        pending = [t for t in txns if t["flag"] == "!"]
        assert len(pending) == 1
        txn = pending[0]
        lineno = txn["lineno"]
        assert lineno is not None

        # Edit: flip flag to *
        r = series_client.put("/api/transactions", json={
            "lineno": lineno,
            "date": txn["date"],
            "flag": "*",
            "payee": txn["payee"],
            "narration": txn["narration"],
            "postings": [
                {"account": p["account"], "amount": float(p["amount"]), "currency": p["currency"]}
                for p in txn["postings"]
                if p["amount"] is not None
            ],
        })
        assert r.json()["success"] is True

        # The series should still show 3 total and 3 confirmed
        r = series_client.get("/api/series")
        tv = next(
            s for s in r.json()["series"] if s["series_id"] == "tv-fixture001"
        )
        assert tv["total"] == 3, "Total must not drop after editing a transaction"
        assert tv["confirmed"] == 3, "Confirmed must reflect the flag flip"
        assert tv["pending"] == 0
