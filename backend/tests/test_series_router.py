"""Integration tests for the series router using FastAPI TestClient.

Uses real FavaLedger instances with fixture files — never mocks.
"""

from __future__ import annotations

import datetime
import shutil
from decimal import Decimal
from pathlib import Path

import pytest
from beancount.core import data
from fastapi.testclient import TestClient

import ledger as ledger_mod


def _series_txns(series_id: str) -> list[data.Transaction]:
    """All transactions for a series, sorted by date — read from the live ledger."""
    led = ledger_mod.get_ledger()
    txns = [
        e for e in led.all_entries
        if isinstance(e, data.Transaction)
        and e.meta.get("ledgr-series") == series_id
    ]
    return sorted(txns, key=lambda t: t.date)


def _leg(txn: data.Transaction, account: str) -> Decimal | None:
    """The amount on ``account`` in ``txn`` (None if auto-balance / absent)."""
    for p in txn.postings:
        if p.account == account:
            return p.units.number if p.units else None
    return None

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


@pytest.fixture()
def noncontiguous_client(tmp_path: Path) -> TestClient:
    """Installment series confirmed OUT OF ORDER (seqs 1,2,5 confirmed; 3,4 pending)."""
    src = FIXTURES_DIR / "series_noncontiguous.beancount"
    dst = tmp_path / "series_noncontiguous.beancount"
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

    def test_non_iso_end_date_is_clean_400_not_500(
        self, minimal_client: TestClient
    ) -> None:
        # A day-first display string (e.g. from the Until field) must not become
        # an unhandled ValueError → 500; it's a clean 400 with a helpful detail.
        r = minimal_client.post("/api/series", json={
            "type": "recurring",
            "payee": "Netflix",
            "narration": "Assinatura",
            "start_date": "2025-04-01",
            "end_date": "31/12/2026",
            "currency": "BRL",
            "postings": [
                {"account": "Expenses:Food", "amount": "55.90"},
                {"account": "Assets:Checking", "amount": "-55.90"},
            ],
        })
        assert r.status_code == 400
        assert "ISO date" in r.json()["detail"]


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

    def test_amount_is_total_split_needs_auto_balance(
        self, minimal_client: TestClient
    ) -> None:
        # amount_is_total with >1 positive leg divides every leg by count, which
        # needs an auto-balance leg to absorb per-installment rounding. All-explicit
        # legs (no auto) are rejected with a clear 400.
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
        assert "auto-balance" in r.json()["detail"]

    def test_amount_is_total_split_divides_every_leg(
        self, minimal_client: TestClient
    ) -> None:
        # Total 1200 across 10, split Food 600 / Ent 600 with an auto payment leg:
        # each installment is the whole txn at 1/10 → Food 60, Ent 60, auto -120.
        r = minimal_client.post("/api/series", json={
            "type": "installment",
            "payee": "Combo",
            "narration": "MP total",
            "start_date": "2025-01-01",
            "count": 10,
            "currency": "BRL",
            "amount_is_total": True,
            "postings": [
                {"account": "Expenses:Food", "amount": "600"},
                {"account": "Expenses:Entertainment", "amount": "600"},
                {"account": "Assets:Checking"},
            ],
        })
        assert r.status_code == 200
        sid = r.json()["series_id"]
        txns = _series_txns(sid)
        assert len(txns) == 10
        # Every installment: each explicit leg 60, Checking balances to -120
        # (beancount elaborates the auto posting to the concrete number on load).
        for t in txns:
            assert _leg(t, "Expenses:Food") == Decimal("60.00")
            assert _leg(t, "Expenses:Entertainment") == Decimal("60.00")
            assert _leg(t, "Assets:Checking") == Decimal("-120.00")
        # Legs sum to their typed totals exactly (no drift).
        assert sum(_leg(t, "Expenses:Food") for t in txns) == Decimal("600.00")

    def test_amount_is_total_split_remainder_on_last(
        self, minimal_client: TestClient
    ) -> None:
        # 1000 across 3 → 333.33 per, last installment 333.34 so each leg sums
        # to exactly its typed total.
        r = minimal_client.post("/api/series", json={
            "type": "installment",
            "payee": "Rem",
            "narration": "MP remainder",
            "start_date": "2025-01-01",
            "count": 3,
            "currency": "BRL",
            "amount_is_total": True,
            "postings": [
                {"account": "Expenses:Food", "amount": "1000"},
                {"account": "Expenses:Entertainment", "amount": "1000"},
                {"account": "Assets:Checking"},
            ],
        })
        assert r.status_code == 200
        txns = _series_txns(r.json()["series_id"])
        assert [_leg(t, "Expenses:Food") for t in txns] == [
            Decimal("333.33"), Decimal("333.33"), Decimal("333.34"),
        ]
        # Both explicit legs sum to exactly 1000 across the run.
        assert sum(_leg(t, "Expenses:Food") for t in txns) == Decimal("1000.00")
        assert sum(_leg(t, "Expenses:Entertainment") for t in txns) == Decimal("1000.00")


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


# ------------------------------------------------------------------
# POST /api/series/{id}/revise — edit the whole pending run (both types)
# ------------------------------------------------------------------


def _series(client: TestClient, sid: str) -> dict:
    """Fetch one series summary by id (or {} if gone)."""
    for s in client.get("/api/series").json()["series"]:
        if s["series_id"] == sid:
            return s
    return {}


def _txns(client: TestClient, account: str) -> list[dict]:
    return client.get(
        "/api/transactions", params={"account": account}
    ).json()["transactions"]


class TestReviseInstallmentSeries:
    """Revise an installment plan: change count / total / amount / accounts.

    Fixture tv-fixture001: 3 txns @ 500 BRL, seq 1&2 confirmed (*), seq 3
    pending (!). Confirmed installments must survive byte-for-byte except their
    'total' counter; only the pending tail is rewritten.
    """

    def test_extend_count_rewrites_only_pending(
        self, series_client: TestClient
    ) -> None:
        # 3 → 5 installments: 2 confirmed kept, 1 old pending replaced by 3 new.
        r = series_client.post(
            "/api/series/tv-fixture001/revise",
            json={"count": 5},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["success"] is True
        assert body["kept"] == 2                 # the 2 confirmed
        assert body["transactions_created"] == 3  # new pending: seq 3,4,5

        s = _series(series_client, "tv-fixture001")
        assert s["total"] == 5
        assert s["confirmed"] == 2
        assert s["pending"] == 3

    def test_confirmed_installments_untouched(
        self, series_client: TestClient
    ) -> None:
        series_client.post(
            "/api/series/tv-fixture001/revise", json={"count": 5}
        )
        txns = _txns(series_client, "Expenses:Electronics")
        confirmed = sorted(
            (t for t in txns if t["flag"] == "*"), key=lambda t: t["date"]
        )
        assert [t["date"] for t in confirmed] == ["2025-01-15", "2025-02-15"]
        for t in confirmed:
            assert t["postings"][0]["amount"] == "500.00"
            # counter bumped to the new total
            assert str(t["metadata"]["ledgr-series-total"]) in ("5", "5.0")

    def test_new_pending_dates_continue_monthly(
        self, series_client: TestClient
    ) -> None:
        series_client.post(
            "/api/series/tv-fixture001/revise", json={"count": 5}
        )
        txns = _txns(series_client, "Expenses:Electronics")
        pending = sorted(
            (t for t in txns if t["flag"] == "!"), key=lambda t: t["date"]
        )
        # last confirmed is 2025-02-15 → pending continue Mar, Apr, May.
        assert [t["date"] for t in pending] == [
            "2025-03-15", "2025-04-15", "2025-05-15",
        ]

    def test_revise_amount_is_total_rounding_ties_out(
        self, series_client: TestClient
    ) -> None:
        # Keep 5 installments but declare a new TOTAL of 1000 split across them.
        # 2 confirmed already sit at 500 each (=1000 posted). Revising the total
        # only re-divides the PENDING run over the remaining slots.
        r = series_client.post(
            "/api/series/tv-fixture001/revise",
            json={
                "count": 5,
                "amount_is_total": True,
                "postings": [
                    {"account": "Expenses:Electronics", "amount": "300"},
                    {"account": "Liabilities:CreditCard", "amount": "-300"},
                ],
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["success"] is True
        # 300 / 3 pending = 100.00 each, ties out exactly.
        txns = _txns(series_client, "Expenses:Electronics")
        pending = [t for t in txns if t["flag"] == "!"]
        assert len(pending) == 3
        assert sum(float(t["postings"][0]["amount"]) for t in pending) == 300.00

    def test_revise_amount_is_total_remainder_on_last(
        self, series_client: TestClient
    ) -> None:
        # 100 over 3 pending → 33.33, 33.33, 33.34 (remainder on the last).
        series_client.post(
            "/api/series/tv-fixture001/revise",
            json={
                "count": 5,
                "amount_is_total": True,
                "postings": [
                    {"account": "Expenses:Electronics", "amount": "100"},
                    {"account": "Liabilities:CreditCard", "amount": "-100"},
                ],
            },
        )
        txns = _txns(series_client, "Expenses:Electronics")
        pending = sorted(
            (t for t in txns if t["flag"] == "!"), key=lambda t: t["date"]
        )
        amounts = [float(t["postings"][0]["amount"]) for t in pending]
        assert amounts == [33.33, 33.33, 33.34]
        assert round(sum(amounts), 2) == 100.00

    def test_revise_amount_is_total_multiposting_divides_every_leg(
        self, series_client: TestClient
    ) -> None:
        # Revise to a multiposting total-form: 300 split Electronics 150 / Fees 150
        # with an auto CreditCard leg, over the 3 pending slots → each pending
        # installment Electronics 50, Fees 50, CreditCard auto -100.
        r = series_client.post(
            "/api/series/tv-fixture001/revise",
            json={
                "count": 5,
                "amount_is_total": True,
                "postings": [
                    {"account": "Expenses:Electronics", "amount": "150"},
                    {"account": "Expenses:Fees", "amount": "150"},
                    {"account": "Liabilities:CreditCard"},
                ],
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["success"] is True
        txns = _txns(series_client, "Expenses:Electronics")
        pending = [t for t in txns if t["flag"] == "!"]
        assert len(pending) == 3
        for t in pending:
            elec = next(p for p in t["postings"] if p["account"] == "Expenses:Electronics")
            fees = next(p for p in t["postings"] if p["account"] == "Expenses:Fees")
            assert float(elec["amount"]) == 50.00
            assert float(fees["amount"]) == 50.00
        # Confirmed installments (500 each) are untouched.
        confirmed = [t for t in txns if t["flag"] == "*"]
        assert all(t["postings"][0]["amount"] == "500.00" for t in confirmed)

    def test_revise_amount_is_total_multiposting_needs_auto(
        self, series_client: TestClient
    ) -> None:
        # All-explicit multiposting total-form (no auto leg) → clean 400.
        r = series_client.post(
            "/api/series/tv-fixture001/revise",
            json={
                "count": 5,
                "amount_is_total": True,
                "postings": [
                    {"account": "Expenses:Electronics", "amount": "150"},
                    {"account": "Expenses:Fees", "amount": "150"},
                    {"account": "Liabilities:CreditCard", "amount": "-300"},
                ],
            },
        )
        assert r.status_code == 400
        assert "auto-balance" in r.json()["detail"]

    def test_revise_change_accounts_on_pending(
        self, series_client: TestClient
    ) -> None:
        r = series_client.post(
            "/api/series/tv-fixture001/revise",
            json={
                "count": 3,   # unchanged count → rewrite the single pending
                "postings": [
                    {"account": "Expenses:Food", "amount": "500"},
                    {"account": "Liabilities:CreditCard", "amount": "-500"},
                ],
            },
        )
        assert r.status_code == 200, r.text
        # This series' pending installment now hits Food, not Electronics.
        # (Scope to the series via metadata — Food is shared with split-fix003.)
        electronics_pending = [
            t for t in _txns(series_client, "Expenses:Electronics")
            if t["flag"] == "!"
            and t["metadata"].get("ledgr-series") == "tv-fixture001"
        ]
        food_pending = [
            t for t in _txns(series_client, "Expenses:Food")
            if t["flag"] == "!"
            and t["metadata"].get("ledgr-series") == "tv-fixture001"
        ]
        assert electronics_pending == []       # moved off Electronics
        assert len(food_pending) == 1          # …onto Food
        assert food_pending[0]["postings"][0]["account"] == "Expenses:Food"

    def test_regenerated_postings_inherit_currency(
        self, series_client: TestClient
    ) -> None:
        # New postings supplied without a currency must inherit the series' BRL,
        # not fall back to a bare (currency-less) amount.
        series_client.post(
            "/api/series/tv-fixture001/revise",
            json={
                "count": 4,
                "postings": [
                    {"account": "Expenses:Electronics", "amount": "250"},
                    {"account": "Liabilities:CreditCard", "amount": "-250"},
                ],
            },
        )
        txns = _txns(series_client, "Expenses:Electronics")
        pending = [
            t for t in txns if t["flag"] == "!"
            and t["metadata"].get("ledgr-series") == "tv-fixture001"
        ]
        assert pending
        assert all(p_["currency"] == "BRL" for t in pending for p_ in t["postings"])

    def test_noncontiguous_confirmed_seqs_stay_unique(
        self, noncontiguous_client: TestClient
    ) -> None:
        """Confirmed seqs {1,2,5}, pending {3,4}. Revise must NOT duplicate seq 5.

        Regression: numbering the regenerated run from len(confirmed) assumed
        confirmed seqs were 1..c and collided with the out-of-order confirmed 5.
        """
        r = noncontiguous_client.post(
            "/api/series/noncontig001/revise", json={"count": 5}
        )
        assert r.status_code == 200, r.text

        txns = _txns(noncontiguous_client, "Expenses:Electronics")
        mine = [
            t for t in txns
            if t["metadata"].get("ledgr-series") == "noncontig001"
        ]
        seqs = sorted(int(t["metadata"]["ledgr-series-seq"]) for t in mine)
        # Every seq 1..5 present exactly once — no duplicate, no gap.
        assert seqs == [1, 2, 3, 4, 5], f"corrupted seqs: {seqs}"
        # totals all read 5
        totals = {int(t["metadata"]["ledgr-series-total"]) for t in mine}
        assert totals == {5}
        # confirmed set unchanged (still exactly the original 3)
        confirmed_seqs = sorted(
            int(t["metadata"]["ledgr-series-seq"])
            for t in mine if t["flag"] == "*"
        )
        assert confirmed_seqs == [1, 2, 5]

    def test_noncontiguous_grow_count_fills_and_appends(
        self, noncontiguous_client: TestClient
    ) -> None:
        """Grow 5→7 with confirmed {1,2,5}: pending must cover {3,4,6,7}, unique."""
        r = noncontiguous_client.post(
            "/api/series/noncontig001/revise", json={"count": 7}
        )
        assert r.status_code == 200, r.text
        txns = _txns(noncontiguous_client, "Expenses:Electronics")
        mine = [
            t for t in txns
            if t["metadata"].get("ledgr-series") == "noncontig001"
        ]
        seqs = sorted(int(t["metadata"]["ledgr-series-seq"]) for t in mine)
        assert seqs == [1, 2, 3, 4, 5, 6, 7], f"corrupted seqs: {seqs}"
        pending_seqs = sorted(
            int(t["metadata"]["ledgr-series-seq"])
            for t in mine if t["flag"] == "!"
        )
        assert pending_seqs == [3, 4, 6, 7]

    def test_rejects_count_below_confirmed(
        self, series_client: TestClient
    ) -> None:
        # 2 already confirmed; can't shrink total to 1.
        r = series_client.post(
            "/api/series/tv-fixture001/revise", json={"count": 1}
        )
        assert r.status_code == 400

    def test_not_found(self, series_client: TestClient) -> None:
        r = series_client.post(
            "/api/series/nonexistent/revise", json={"count": 5}
        )
        assert r.status_code == 404


class TestReviseRecurringSeries:
    """Revise a recurring plan: change amount / frequency / horizon / accounts.

    Fixture netflix-fix002: 4 monthly txns @ 55.90, 1 confirmed (Jan), 3 pending
    (Feb–Apr). Confirmed txns survive; the pending run is regenerated.
    """

    def test_change_amount_rewrites_pending(
        self, series_client: TestClient
    ) -> None:
        r = series_client.post(
            "/api/series/netflix-fix002/revise",
            json={
                "end_date": "2025-04-01",   # same horizon → same 3 pending slots
                "postings": [
                    {"account": "Expenses:Subscriptions", "amount": "65.90"},
                    {"account": "Assets:Bank:Checking", "amount": "-65.90"},
                ],
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["success"] is True
        assert r.json()["kept"] == 1

        txns = _txns(series_client, "Expenses:Subscriptions")
        confirmed = [t for t in txns if t["flag"] == "*"]
        pending = [t for t in txns if t["flag"] == "!"]
        # confirmed Jan stays at 55.90; pending now 65.90
        assert confirmed[0]["postings"][0]["amount"] == "55.90"
        assert len(pending) == 3
        assert all(t["postings"][0]["amount"] == "65.90" for t in pending)

    def test_change_frequency_to_weekly(
        self, series_client: TestClient
    ) -> None:
        # Switch the pending run to weekly, one month horizon after last confirmed.
        r = series_client.post(
            "/api/series/netflix-fix002/revise",
            json={"frequency": "weekly", "end_date": "2025-02-19"},
        )
        assert r.status_code == 200, r.text
        s = _series(series_client, "netflix-fix002")
        assert s["frequency"] == "weekly"
        # pending regenerated at 7-day steps from Feb 1 (one week after Jan 1...
        # actually one *period* after the last confirmed date Jan 1 → Jan 8),
        # bounded by Feb 19.
        txns = _txns(series_client, "Expenses:Subscriptions")
        pending = sorted(
            (t for t in txns if t["flag"] == "!"), key=lambda t: t["date"]
        )
        dates = [t["date"] for t in pending]
        # 7-day cadence, all within horizon
        for a, b in zip(dates, dates[1:]):
            d0 = datetime.date.fromisoformat(a)
            d1 = datetime.date.fromisoformat(b)
            assert (d1 - d0).days == 7
        assert confirmed_count(series_client, "netflix-fix002") == 1

    def test_confirmed_recurring_untouched(
        self, series_client: TestClient
    ) -> None:
        series_client.post(
            "/api/series/netflix-fix002/revise",
            json={
                "end_date": "2025-04-01",
                "postings": [
                    {"account": "Expenses:Subscriptions", "amount": "65.90"},
                    {"account": "Assets:Bank:Checking", "amount": "-65.90"},
                ],
            },
        )
        txns = _txns(series_client, "Expenses:Subscriptions")
        confirmed = [t for t in txns if t["flag"] == "*"]
        assert len(confirmed) == 1
        assert confirmed[0]["date"] == "2025-01-01"
        assert confirmed[0]["postings"][0]["amount"] == "55.90"

    def test_not_found(self, series_client: TestClient) -> None:
        r = series_client.post(
            "/api/series/nonexistent/revise",
            json={"end_date": "2025-06-01"},
        )
        assert r.status_code == 404

    def test_summary_reflects_pending_run_after_amount_change(
        self, series_client: TestClient
    ) -> None:
        # After editing the pending amount, the summary's amount_per_txn +
        # postings must reflect the PENDING run (what the user sees/edits), not
        # the untouched confirmed run. tv-fixture001: 500 confirmed, revise
        # pending to 600.
        series_client.post(
            "/api/series/tv-fixture001/revise",
            json={
                "count": 3,
                "postings": [
                    {"account": "Expenses:Electronics", "amount": "600"},
                    {"account": "Liabilities:CreditCard", "amount": "-600"},
                ],
            },
        )
        s = _series(series_client, "tv-fixture001")
        assert s["amount_per_txn"] == "600.00", "summary must show the pending amount"
        # the representative postings also reflect 600
        pos = [p for p in s["postings"] if p["amount"] and float(p["amount"]) > 0]
        assert pos[0]["amount"] == "600.00"

    def test_add_installments_keeps_pending_amount(
        self, series_client: TestClient
    ) -> None:
        # Edit pending to 600, then ADD installments (count only). New pending
        # must be 600 (the pending run's amount), not the confirmed 500.
        series_client.post(
            "/api/series/tv-fixture001/revise",
            json={"count": 3, "postings": [
                {"account": "Expenses:Electronics", "amount": "600"},
                {"account": "Liabilities:CreditCard", "amount": "-600"},
            ]},
        )
        r = series_client.post("/api/series/tv-fixture001/revise", json={"count": 5})
        assert r.status_code == 200, r.text
        pend = sorted(
            (t for t in _txns(series_client, "Expenses:Electronics")
             if t["flag"] == "!" and t["metadata"].get("ledgr-series") == "tv-fixture001"),
            key=lambda t: t["date"],
        )
        assert len(pend) == 3
        assert all(t["postings"][0]["amount"] == "600.00" for t in pend)

    def test_revise_multiposting_applies_to_whole_pending_run(
        self, series_client: TestClient
    ) -> None:
        # split-fix003: 3-posting recurring (Food 60 / Fun 40 / Bank -100),
        # 1 confirmed + 2 pending. Editing all three postings must rewrite every
        # pending txn and leave the confirmed one byte-identical.
        r = series_client.post(
            "/api/series/split-fix003/revise",
            json={
                "end_date": "2025-03-01",
                "postings": [
                    {"account": "Expenses:Food", "amount": "70"},
                    {"account": "Expenses:Entertainment", "amount": "50"},
                    {"account": "Assets:Bank:Checking", "amount": "-120"},
                ],
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["success"] is True
        assert r.json()["kept"] == 1

        txns = sorted(
            (t for t in _txns(series_client, "Expenses:Food")
             if t["metadata"].get("ledgr-series") == "split-fix003"),
            key=lambda t: t["date"],
        )
        confirmed = [t for t in txns if t["flag"] == "*"]
        pending = [t for t in txns if t["flag"] == "!"]
        # confirmed untouched (still 60/40/-100)
        assert confirmed[0]["postings"][0]["amount"] == "60.00"
        # every pending rewritten to the new 3-posting shape
        assert len(pending) == 2
        for t in pending:
            by_acct = {p["account"]: p["amount"] for p in t["postings"]}
            assert by_acct["Expenses:Food"] == "70.00"
            assert by_acct["Expenses:Entertainment"] == "50.00"
            assert by_acct["Assets:Bank:Checking"] == "-120.00"


class TestGetSeriesTransactions:
    """GET /api/series/{id}/transactions — membership is metadata, not account."""

    def test_returns_every_occurrence_sorted(
        self, series_client: TestClient
    ) -> None:
        r = series_client.get("/api/series/split-fix003/transactions")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["count"] == 3
        dates = [t["date"] for t in body["transactions"]]
        assert dates == sorted(dates)
        assert all(
            t["metadata"]["ledgr-series"] == "split-fix003"
            for t in body["transactions"]
        )

    def test_includes_occurrences_on_other_accounts(
        self, series_client: TestClient
    ) -> None:
        # Regression: revising re-points the PENDING run to a new account while
        # confirmed occurrences keep the old one. Gathering occurrences by a
        # single representative account then dropped the confirmed ones — the
        # list showed "2 of 3" while the summary still counted 3. Querying by
        # series id must return every occurrence regardless of account.
        r = series_client.post(
            "/api/series/split-fix003/revise",
            json={
                "end_date": "2025-03-01",
                "postings": [
                    {"account": "Expenses:Food", "amount": "60.00"},
                    {"account": "Expenses:Entertainment", "amount": "40.00"},
                    {"account": "Assets:Bank:Savings", "amount": "-100.00"},
                ],
            },
        )
        assert r.status_code == 200, r.text

        body = series_client.get(
            "/api/series/split-fix003/transactions"
        ).json()
        assert body["count"] == 3, "confirmed occurrence must not disappear"

        # The two runs really do live on different accounts...
        accounts = {
            p["account"]
            for t in body["transactions"]
            for p in t["postings"]
            if p["amount"] and Decimal(p["amount"]) < 0
        }
        assert accounts == {"Assets:Bank:Checking", "Assets:Bank:Savings"}
        # ...and the summary count agrees with the list (the original symptom).
        assert _series(series_client, "split-fix003")["total"] == body["count"]

    def test_unknown_series_returns_empty(
        self, series_client: TestClient
    ) -> None:
        r = series_client.get("/api/series/does-not-exist/transactions")
        assert r.status_code == 200
        assert r.json() == {"transactions": [], "count": 0}


def confirmed_count(client: TestClient, sid: str) -> int:
    return _series(client, sid).get("confirmed", -1)
