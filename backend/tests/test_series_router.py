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
        assert len(body["series"]) == 2

    def test_summary_shape(self, series_client: TestClient) -> None:
        r = series_client.get("/api/series")
        body = r.json()
        s = body["series"][0]
        expected_keys = {
            "series_id", "type", "payee", "narration",
            "amount_per_txn", "currency", "total", "confirmed",
            "pending", "first_date", "last_date",
            "account_from", "account_to",
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
            s for s in body["series"] if s["type"] == "recurring"
        )
        assert recurring["total"] == 4
        assert recurring["confirmed"] == 1
        assert recurring["pending"] == 3

    def test_empty_when_no_series(self, minimal_client: TestClient) -> None:
        r = minimal_client.get("/api/series")
        assert r.status_code == 200
        body = r.json()
        assert body["series"] == []


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
            "amount": "250.00",
            "currency": "BRL",
            "account_from": "Liabilities:CreditCard",
            "account_to": "Expenses:Food",
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
            "amount": "100",
            "currency": "BRL",
            "account_from": "Liabilities:CreditCard",
            "account_to": "Expenses:Food",
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
            "amount": "250.00",
            "currency": "BRL",
            "account_from": "Liabilities:CreditCard",
            "account_to": "Expenses:Food",
        })
        assert r.status_code == 400

    def test_amount_is_total(self, minimal_client: TestClient) -> None:
        r = minimal_client.post("/api/series", json={
            "type": "installment",
            "payee": "Store",
            "narration": "TV",
            "start_date": "2025-01-01",
            "count": 3,
            "amount": "1000",
            "amount_is_total": True,
            "currency": "BRL",
            "account_from": "Liabilities:CreditCard",
            "account_to": "Expenses:Food",
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
            "amount": "55.90",
            "currency": "BRL",
            "account_from": "Assets:Checking",
            "account_to": "Expenses:Food",
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
            "amount": "55.90",
            "currency": "BRL",
            "account_from": "Assets:Checking",
            "account_to": "Expenses:Food",
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
            "amount": "100",
            "amount_is_total": True,
            "currency": "BRL",
            "account_from": "Assets:Checking",
            "account_to": "Expenses:Food",
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
