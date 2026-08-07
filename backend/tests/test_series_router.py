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

    def test_filter_by_date_shows_full_series_counts(
        self, series_client: TestClient
    ) -> None:
        """A date filter decides *which* series surface, but each summary
        still describes the WHOLE series. Netflix runs Jan..Apr (1 confirmed,
        3 pending); restricting to January must surface it with its full
        counts — not truncated to the single in-window txn. This is the
        regression guard for the "filtered series looks 1/1 complete" bug.
        """
        r = series_client.get(
            "/api/series",
            params={"from_date": "2025-01-01", "to_date": "2025-02-01"},
        )
        assert r.status_code == 200
        netflix = next(
            s for s in r.json()["series"] if s["series_id"] == "netflix-fix002"
        )
        assert netflix["total"] == 4
        assert netflix["confirmed"] == 1
        assert netflix["pending"] == 3
        # Dates reflect the full span, not the filtered window.
        assert netflix["first_date"] == "2025-01-01"
        assert netflix["last_date"] == "2025-04-01"


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
# POST /api/series — recurring frequency (weekly / yearly)
# ------------------------------------------------------------------


class TestCreateSeriesFrequency:
    def _post(self, client, frequency, start, end):
        return client.post("/api/series", json={
            "type": "recurring",
            "payee": "Gym",
            "narration": "Membership",
            "start_date": start,
            "end_date": end,
            "currency": "BRL",
            "frequency": frequency,
            "postings": [
                {"account": "Expenses:Health", "amount": "30"},
                {"account": "Assets:Checking", "amount": "-30"},
            ],
        })

    def test_weekly_count(self, minimal_client: TestClient) -> None:
        # Jan 1 → Jan 29 weekly = 5 occurrences (1, 8, 15, 22, 29).
        r = self._post(minimal_client, "weekly", "2025-01-01", "2025-01-29")
        assert r.status_code == 200
        assert r.json()["count"] == 5

    def test_yearly_count(self, minimal_client: TestClient) -> None:
        # 2025 → 2027 yearly = 3 occurrences.
        r = self._post(minimal_client, "yearly", "2025-06-10", "2027-06-10")
        assert r.status_code == 200
        assert r.json()["count"] == 3

    def test_weekly_frequency_in_summary(self, minimal_client: TestClient) -> None:
        assert self._post(
            minimal_client, "weekly", "2025-01-01", "2025-01-29"
        ).status_code == 200
        listed = minimal_client.get("/api/series").json()["series"]
        gym = next(s for s in listed if s["payee"] == "Gym")
        assert gym["frequency"] == "weekly"

    def test_monthly_default_frequency_in_summary(
        self, minimal_client: TestClient
    ) -> None:
        """A series created without 'frequency' reports 'monthly'."""
        r = minimal_client.post("/api/series", json={
            "type": "recurring",
            "payee": "Rent",
            "narration": "Flat",
            "start_date": "2025-01-01",
            "end_date": "2025-03-01",
            "currency": "BRL",
            "postings": [
                {"account": "Expenses:Rent", "amount": "1000"},
                {"account": "Assets:Checking", "amount": "-1000"},
            ],
        })
        assert r.status_code == 200
        listed = minimal_client.get("/api/series").json()["series"]
        rent = next(s for s in listed if s["payee"] == "Rent")
        assert rent["frequency"] == "monthly"

    def test_rejects_frequency_for_installment(
        self, minimal_client: TestClient
    ) -> None:
        r = minimal_client.post("/api/series", json={
            "type": "installment",
            "payee": "Store",
            "narration": "TV",
            "start_date": "2025-01-01",
            "count": 3,
            "currency": "BRL",
            "frequency": "weekly",
            "postings": [
                {"account": "Expenses:Stuff", "amount": "100"},
                {"account": "Liabilities:CC", "amount": "-100"},
            ],
        })
        assert r.status_code == 400

    def test_installment_monthly_frequency_allowed(
        self, minimal_client: TestClient
    ) -> None:
        """Explicit monthly on installment is the default and must not 400."""
        r = minimal_client.post("/api/series", json={
            "type": "installment",
            "payee": "Store",
            "narration": "TV",
            "start_date": "2025-01-01",
            "count": 3,
            "currency": "BRL",
            "frequency": "monthly",
            "postings": [
                {"account": "Expenses:Stuff", "amount": "100"},
                {"account": "Liabilities:CC", "amount": "-100"},
            ],
        })
        assert r.status_code == 200


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

    def test_extend_preserves_weekly_cadence(
        self, minimal_client: TestClient
    ) -> None:
        """A weekly series extends by weeks, not months, and keeps its freq key."""
        created = minimal_client.post("/api/series", json={
            "type": "recurring",
            "payee": "Weekly",
            "narration": "Cleaner",
            "start_date": "2025-01-01",
            "end_date": "2025-01-15",   # 3 occurrences: Jan 1, 8, 15
            "currency": "BRL",
            "frequency": "weekly",
            "postings": [
                {"account": "Expenses:Home", "amount": "50"},
                {"account": "Assets:Checking", "amount": "-50"},
            ],
        }).json()
        sid = created["series_id"]
        assert created["count"] == 3

        # Extend three more weeks: Jan 22, 29, Feb 5.
        r = minimal_client.post(
            f"/api/series/{sid}/extend",
            json={"new_end_date": "2025-02-05"},
        )
        assert r.status_code == 200
        assert r.json()["transactions_created"] == 3

        listed = minimal_client.get("/api/series").json()["series"]
        summary = next(s for s in listed if s["series_id"] == sid)
        assert summary["frequency"] == "weekly"
        # Last date must be the weekly boundary, not a month later.
        assert summary["last_date"] == "2025-02-05"
        assert summary["total"] == 6


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
