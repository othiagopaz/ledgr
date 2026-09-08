"""
HTTP tests for ``routers/commodities.py`` — commodities, prices, holdings.

Every test runs the real FastAPI app over a real ``FavaLedger`` pointed at a
temp copy of ``fixtures/commodities.beancount`` (no mocks).  The expected
numbers below are derived by hand from that fixture:

    Assets:Broker:PETR4 (FIFO)  40 PETR4 {25.00 BRL} + 30 PETR4 {30.00 BRL}
                                → 70 units, cost 1900.00, price 35.00
    Assets:Vault:XAU   (HIFO)   1 XAU {1700.00 USD}, price 1900.00 USD,
                                USD→BRL 5.20 → 9880.00 BRL market
    Assets:XP          (NONE)   100 ITUB4 {33} + 100 ITUB4 {37} − 50 ITUB4 {35}
                                → 150 units, cost 5250.00, average 35.00
    Assets:Bank:USD    (spend)  −550.00 USD held at price, USD→BRL 5.20
    Assets:Vacation             0.5 VACDAY, no cost, no price
"""

from __future__ import annotations

import datetime
import shutil
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import ledger as ledger_mod

FIXTURES_DIR = Path(__file__).parent / "fixtures"

PLUGIN_LINES = (
    'plugin "beancount.plugins.implicit_prices"\n'
    'plugin "beancount.plugins.currency_accounts" "Equity:CurrencyTrading"\n'
)

UNDECLARED_BTC = """
2020-01-01 open Assets:Crypto
  ledgr-type: "investment"

2020-12-01 * "Exchange" "Buy BTC"
  Assets:Crypto              0.5 BTC {150000.00 BRL}
  Assets:Bank:Checking  -75000.00 BRL
"""


def _make_client(tmp_path: Path, prepend: str = "", append: str = "") -> tuple[TestClient, Path]:
    src = FIXTURES_DIR / "commodities.beancount"
    dst = tmp_path / "test.beancount"
    text = src.read_text()
    dst.write_text(prepend + text + append)
    ledger_mod.init_ledger(str(dst))
    from main import app

    return TestClient(app, raise_server_exceptions=False), dst


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    return _make_client(tmp_path)[0]


@pytest.fixture()
def client_and_file(tmp_path: Path) -> tuple[TestClient, Path]:
    return _make_client(tmp_path)


@pytest.fixture()
def plugin_client(tmp_path: Path) -> TestClient:
    """The fixture with ``implicit_prices`` and ``currency_accounts`` on."""
    return _make_client(tmp_path, prepend=PLUGIN_LINES)[0]


@pytest.fixture()
def btc_client(tmp_path: Path) -> TestClient:
    """The fixture plus a commodity that has no ``commodity`` directive."""
    return _make_client(tmp_path, append=UNDECLARED_BTC)[0]


def _row(body: dict, symbol: str) -> dict:
    return next(c for c in body["commodities"] if c["symbol"] == symbol)


def _position(body: dict, account: str, commodity: str) -> dict:
    return next(
        p for p in body["positions"]
        if p["account"] == account and p["commodity"] == commodity
    )


# ------------------------------------------------------------------
# GET /api/commodities (§4.1)
# ------------------------------------------------------------------


class TestGetCommodities:
    def test_fixture_is_valid(self, client: TestClient) -> None:
        """The NONE account added for average cost must not cost a single error."""
        assert client.get("/api/errors").json()["count"] == 0

    def test_top_level_shape(self, client: TestClient) -> None:
        body = client.get("/api/commodities").json()
        assert body["operating_currency"] == "BRL"
        assert body["plugins"] == {
            "implicit_prices": False,
            "coherent_cost": False,
            "check_average_cost": False,
            "currency_accounts": False,
        }
        assert body["currency_trading_account"] is None
        assert [c["symbol"] for c in body["commodities"]] == sorted(
            c["symbol"] for c in body["commodities"]
        )

    def test_declared_row(self, client: TestClient) -> None:
        row = _row(client.get("/api/commodities").json(), "PETR4")
        assert row == {
            "symbol": "PETR4",
            "declared": True,
            "name": "Petrobras PN",
            "precision": None,
            "metadata": {"asset-class": "equity"},
            "is_operating": False,
            "holders": ["Assets:Broker:PETR4"],
            "latest_price": {"number": "35.00", "quote": "BRL", "date": "2020-12-31"},
            "pairs": [{"quote": "BRL", "count": 1}],
        }

    def test_operating_currency_row(self, client: TestClient) -> None:
        row = _row(client.get("/api/commodities").json(), "BRL")
        assert row["is_operating"] is True
        assert row["latest_price"] is None
        assert row["pairs"] == []
        assert "Assets:Bank:Checking" in row["holders"]

    def test_latest_price_falls_back_to_cost_currency_pair(self, client: TestClient) -> None:
        """Gold is only quoted in USD — that pair is what the row shows."""
        row = _row(client.get("/api/commodities").json(), "XAU")
        assert row["latest_price"] == {
            "number": "1900.00", "quote": "USD", "date": "2020-12-31"
        }
        assert row["pairs"] == [{"quote": "USD", "count": 1}]

    def test_commodity_without_price_or_holders_elsewhere(self, client: TestClient) -> None:
        row = _row(client.get("/api/commodities").json(), "VACDAY")
        assert row["latest_price"] is None
        assert row["holders"] == [
            "Assets:Vacation", "Expenses:VacationTaken", "Income:VacationAccrued"
        ]

    def test_includes_undeclared_commodity(self, btc_client: TestClient) -> None:
        """A symbol that only ever appears in a posting is still listed."""
        assert btc_client.get("/api/errors").json()["count"] == 0
        row = _row(btc_client.get("/api/commodities").json(), "BTC")
        assert row["declared"] is False
        assert row["name"] is None
        assert row["precision"] is None
        assert row["metadata"] == {}
        assert row["holders"] == ["Assets:Crypto"]
        assert row["latest_price"] is None

    def test_holders_follow_the_filters(self, client: TestClient) -> None:
        """``to_date`` is exclusive: on 2020-02-01 nobody holds shares yet."""
        body = client.get("/api/commodities?to_date=2020-02-01").json()
        assert _row(body, "PETR4")["holders"] == []
        assert _row(body, "ITUB4")["holders"] == []
        # The catalog itself is unfiltered.
        assert {c["symbol"] for c in body["commodities"]} >= {"PETR4", "ITUB4", "XAU"}

    def test_view_mode_validation(self, client: TestClient) -> None:
        assert client.get("/api/commodities?view_mode=actual").status_code == 200
        assert client.get("/api/commodities?view_mode=bogus").status_code == 422

    def test_plugins_reported(self, plugin_client: TestClient) -> None:
        assert plugin_client.get("/api/errors").json()["count"] == 0
        body = plugin_client.get("/api/commodities").json()
        assert body["plugins"]["implicit_prices"] is True
        assert body["plugins"]["currency_accounts"] is True
        assert body["plugins"]["coherent_cost"] is False
        assert body["currency_trading_account"] == "Equity:CurrencyTrading"

    def test_implicit_prices_show_up_in_pair_counts(self, plugin_client: TestClient) -> None:
        """``implicit_prices`` synthesises a price from every cost annotation."""
        row = _row(plugin_client.get("/api/commodities").json(), "PETR4")
        # 20.00 (Feb), 25.00 (Mar), 30.00 (Apr) from the buys + 35.00 declared.
        # Sales reuse a lot's cost, so they add nothing new on their days.
        assert row["pairs"][0]["quote"] == "BRL"
        assert row["pairs"][0]["count"] >= 4


# ------------------------------------------------------------------
# POST / PUT /api/commodities (§4.2, §4.3)
# ------------------------------------------------------------------


class TestWriteCommodities:
    def test_post_declares_then_409_on_duplicate(self, client_and_file) -> None:
        client, path = client_and_file
        r = client.post("/api/commodities", json={
            "symbol": "ITSA4", "name": "Itausa", "precision": 2,
            "metadata": {"asset-class": "equity"}, "date": "2020-01-01",
        })
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["commodity"]["symbol"] == "ITSA4"
        assert body["commodity"]["declared"] is True
        assert body["commodity"]["name"] == "Itausa"
        assert body["commodity"]["precision"] == 2
        assert body["commodity"]["metadata"] == {"asset-class": "equity"}
        assert body["commodity"]["holders"] == []

        # Written through FavaLedger.file, visible on the next read, ledger clean.
        assert "2020-01-01 commodity ITSA4" in path.read_text()
        assert client.get("/api/errors").json()["count"] == 0
        assert _row(client.get("/api/commodities").json(), "ITSA4")["precision"] == 2

        dup = client.post("/api/commodities", json={"symbol": "ITSA4"})
        assert dup.status_code == 409

    def test_post_already_declared_in_fixture_is_409(self, client: TestClient) -> None:
        assert client.post("/api/commodities", json={"symbol": "PETR4"}).status_code == 409

    def test_post_rejects_bad_symbol(self, client: TestClient) -> None:
        assert client.post("/api/commodities", json={"symbol": "petr4"}).status_code == 400
        assert client.post("/api/commodities", json={"symbol": "P-"}).status_code == 400

    def test_post_rejects_bad_date_and_reserved_metadata(self, client: TestClient) -> None:
        assert client.post("/api/commodities", json={
            "symbol": "ITSA4", "date": "2020-13-01",
        }).status_code == 400
        assert client.post("/api/commodities", json={
            "symbol": "ITSA4", "metadata": {"name": "x"},
        }).status_code == 400
        assert client.post("/api/commodities", json={
            "symbol": "ITSA4", "metadata": {"Bad Key": "x"},
        }).status_code == 400
        assert client.post("/api/commodities", json={
            "symbol": "ITSA4", "precision": -1,
        }).status_code == 400

    def test_put_404_when_undeclared(self, client: TestClient) -> None:
        r = client.put("/api/commodities", json={"symbol": "NOPE", "name": "x"})
        assert r.status_code == 404

    def test_put_rewrites_directive(self, client_and_file) -> None:
        client, path = client_and_file
        r = client.put("/api/commodities", json={
            "symbol": "PETR4", "name": "Petrobras PN (edited)", "precision": 2,
            "metadata": {"isin": "BRPETRACNPR6"},
        })
        assert r.status_code == 200, r.text
        row = r.json()["commodity"]
        assert row["name"] == "Petrobras PN (edited)"
        assert row["precision"] == 2
        # metadata is replaced wholesale — asset-class is gone, isin is in.
        assert row["metadata"] == {"isin": "BRPETRACNPR6"}
        assert client.get("/api/errors").json()["count"] == 0
        text = path.read_text()
        assert text.count("commodity PETR4") == 1
        assert 'name: "Petrobras PN (edited)"' in text
        assert "precision: 2" in text

    def test_put_keeps_omitted_fields(self, client: TestClient) -> None:
        client.put("/api/commodities", json={"symbol": "XAU", "precision": 3})
        row = _row(client.get("/api/commodities").json(), "XAU")
        assert row["name"] == "Gold (troy ounce)"
        assert row["metadata"] == {"asset-class": "commodity"}
        assert row["precision"] == 3

    def test_put_empty_name_clears_it(self, client: TestClient) -> None:
        client.put("/api/commodities", json={"symbol": "USD", "name": ""})
        assert _row(client.get("/api/commodities").json(), "USD")["name"] is None
        assert client.get("/api/errors").json()["count"] == 0


# ------------------------------------------------------------------
# GET / POST /api/prices (§4.4, §4.5)
# ------------------------------------------------------------------


class TestPrices:
    def test_pairs(self, client: TestClient) -> None:
        body = client.get("/api/prices").json()
        assert body["pairs"] == [
            {"base": "ITUB4", "quote": "BRL", "count": 1,
             "latest": {"date": "2020-12-31", "number": "38.00"}},
            {"base": "PETR4", "quote": "BRL", "count": 1,
             "latest": {"date": "2020-12-31", "number": "35.00"}},
            {"base": "USD", "quote": "BRL", "count": 1,
             "latest": {"date": "2020-12-31", "number": "5.20"}},
            {"base": "XAU", "quote": "USD", "count": 1,
             "latest": {"date": "2020-12-31", "number": "1900.00"}},
        ]

    def test_history_for_one_pair(self, client: TestClient) -> None:
        body = client.get("/api/prices?base=PETR4&quote=BRL").json()
        assert body == {
            "base": "PETR4", "quote": "BRL",
            "prices": [{"date": "2020-12-31", "number": "35.00"}],
        }

    def test_history_of_unknown_pair_is_empty(self, client: TestClient) -> None:
        body = client.get("/api/prices?base=PETR4&quote=USD").json()
        assert body["prices"] == []

    def test_history_of_inverse_pair_is_derived(self, client: TestClient) -> None:
        """Fava derives BRL→USD from the declared USD→BRL rate."""
        body = client.get("/api/prices?base=BRL&quote=USD").json()
        assert len(body["prices"]) == 1
        assert Decimal(body["prices"][0]["number"]) == pytest.approx(Decimal(1) / Decimal("5.20"))

    def test_only_one_of_base_quote_is_400(self, client: TestClient) -> None:
        assert client.get("/api/prices?base=PETR4").status_code == 400
        assert client.get("/api/prices?quote=BRL").status_code == 400

    def test_post_price_then_history_is_ascending(self, client_and_file) -> None:
        client, path = client_and_file
        # A later point and an EARLIER one — both appended at the end of the
        # file, both must come back in date order.
        r = client.post("/api/prices", json={
            "date": "2021-01-31", "base": "USD", "number": "5.50", "quote": "BRL",
        })
        assert r.status_code == 201, r.text
        assert r.json() == {"ok": True}
        r = client.post("/api/prices", json={
            "date": "2020-06-30", "base": "USD", "number": "5.10", "quote": "BRL",
        })
        assert r.status_code == 201, r.text

        body = client.get("/api/prices?base=USD&quote=BRL").json()
        assert body["prices"] == [
            {"date": "2020-06-30", "number": "5.10"},
            {"date": "2020-12-31", "number": "5.20"},
            {"date": "2021-01-31", "number": "5.50"},
        ]
        pair = next(p for p in client.get("/api/prices").json()["pairs"] if p["base"] == "USD")
        assert pair["count"] == 3
        assert pair["latest"] == {"date": "2021-01-31", "number": "5.50"}
        assert "2021-01-31 price USD" in path.read_text()
        assert client.get("/api/errors").json()["count"] == 0

    def test_post_price_accepts_a_bare_json_number(self, client: TestClient) -> None:
        """The contract sends a string (precision-preserving); a JSON number
        is tolerated rather than 422'd."""
        r = client.post("/api/prices", json={
            "date": "2021-03-31", "base": "USD", "number": 5.4, "quote": "BRL",
        })
        assert r.status_code == 201, r.text
        latest = client.get("/api/prices?base=USD&quote=BRL").json()["prices"][-1]
        assert latest["date"] == "2021-03-31"
        assert Decimal(latest["number"]) == Decimal("5.4")

    def test_new_price_moves_the_commodity_row(self, client: TestClient) -> None:
        client.post("/api/prices", json={
            "date": "2021-02-28", "base": "PETR4", "number": "41.00", "quote": "BRL",
        })
        row = _row(client.get("/api/commodities").json(), "PETR4")
        assert row["latest_price"] == {"number": "41.00", "quote": "BRL", "date": "2021-02-28"}
        assert row["pairs"] == [{"quote": "BRL", "count": 2}]

    @pytest.mark.parametrize("body", [
        {"base": "USD", "number": "5.50", "quote": "BRL"},                      # no date
        {"date": "2021-13-01", "base": "USD", "number": "5.50", "quote": "BRL"},  # bad date
        {"date": "2021-01-01", "base": "usd", "number": "5.50", "quote": "BRL"},  # bad base
        {"date": "2021-01-01", "base": "USD", "number": "5.50", "quote": "br"},   # bad quote
        {"date": "2021-01-01", "base": "USD", "quote": "BRL"},                    # no number
        {"date": "2021-01-01", "base": "USD", "number": "abc", "quote": "BRL"},   # bad number
        {"date": "2021-01-01", "base": "USD", "number": "-1", "quote": "BRL"},    # negative
        {"date": "2021-01-01", "base": "USD", "number": "0", "quote": "BRL"},     # zero
        {"date": "2021-01-01", "base": "USD", "number": "5.50", "quote": "USD"},  # same
    ])
    def test_post_price_rejects_bad_input(self, client_and_file, body: dict) -> None:
        client, path = client_and_file
        before = path.read_text()
        assert client.post("/api/prices", json=body).status_code == 400
        assert path.read_text() == before


# ------------------------------------------------------------------
# GET /api/holdings (§4.6)
# ------------------------------------------------------------------


class TestHoldings:
    def test_top_level(self, client: TestClient) -> None:
        body = client.get("/api/holdings").json()
        assert body["operating_currency"] == "BRL"
        assert body["conversion"] == "at_value"
        assert body["fx_result"] is None
        assert {(p["account"], p["commodity"]) for p in body["positions"]} == {
            ("Assets:Bank:USD", "USD"),
            ("Assets:Broker:PETR4", "PETR4"),
            ("Assets:Vacation", "VACDAY"),
            ("Assets:Vault:XAU", "XAU"),
            ("Assets:XP", "ITUB4"),
        }

    def test_flows_are_not_holdings(self, client: TestClient) -> None:
        """``Income:Gains`` holds −150 USD, but a gain is a flow, not a position."""
        body = client.get("/api/holdings").json()
        assert all(p["account"].startswith("Assets") for p in body["positions"])

    def test_fifo_account_with_lots(self, client: TestClient) -> None:
        p = _position(client.get("/api/holdings").json(), "Assets:Broker:PETR4", "PETR4")
        assert p["booking"] == "FIFO"
        assert p["held_at_cost"] is True
        assert p["units"] == "70"
        assert p["cost_currency"] == "BRL"
        assert p["cost_total"] == "1900.00"
        assert p["avg_cost"] == "27.14"           # 1900 / 70, at BRL precision
        assert p["price"] == {"number": "35.00", "quote": "BRL", "date": "2020-12-31"}
        assert p["market_value"] == "2450.00"     # 70 × 35
        assert p["unrealized"] == "550.00"        # 2450 − 1900
        assert p["unrealized_pct"] == "28.95"     # 550 / 1900
        assert p["lots"] == [
            {"date": "2020-03-01", "label": None, "units": "40", "cost": "25.00"},
            {"date": "2020-04-01", "label": "april-lot", "units": "30", "cost": "30.00"},
        ]

    def test_hifo_account_cost_in_usd_converted_through_usd_brl(self, client: TestClient) -> None:
        p = _position(client.get("/api/holdings").json(), "Assets:Vault:XAU", "XAU")
        assert p["booking"] == "HIFO"
        assert p["held_at_cost"] is True
        assert p["units"] == "1"
        assert p["cost_currency"] == "USD"
        assert p["cost_total"] == "1700.00"       # in the cost currency
        assert p["avg_cost"] == "1700.00"
        assert p["price"] == {"number": "1900.00", "quote": "USD", "date": "2020-12-31"}
        assert p["market_value"] == "9880.00"     # 1 × 1900 USD × 5.20
        assert p["unrealized"] == "1040.00"       # 9880 − 1700 × 5.20
        assert p["unrealized_pct"] == "11.76"     # 1040 / 8840
        assert p["lots"] == [
            {"date": "2020-06-01", "label": None, "units": "1", "cost": "1700.00"},
        ]

    def test_none_account_average_cost_after_the_sale(self, client: TestClient) -> None:
        """Under NONE the sale is a third position beside the buys; the
        average over the three is still 35.00 and there are no lots to show."""
        p = _position(client.get("/api/holdings").json(), "Assets:XP", "ITUB4")
        assert p["booking"] == "NONE"
        assert p["held_at_cost"] is True
        assert p["units"] == "150"                # 100 + 100 − 50
        assert p["cost_total"] == "5250.00"       # 3300 + 3700 − 1750
        assert p["avg_cost"] == "35.00"
        assert p["lots"] is None
        assert p["price"] == {"number": "38.00", "quote": "BRL", "date": "2020-12-31"}
        assert p["market_value"] == "5700.00"
        assert p["unrealized"] == "450.00"
        assert p["unrealized_pct"] == "8.57"

    def test_none_account_average_cost_before_the_sale(self, client: TestClient) -> None:
        """This is the number the Composer pre-fills into the sale (§2.3)."""
        p = _position(
            client.get("/api/holdings?to_date=2020-10-01").json(), "Assets:XP", "ITUB4"
        )
        assert p["units"] == "200"
        assert p["cost_total"] == "7000.00"
        assert p["avg_cost"] == "35.00"
        assert p["lots"] is None
        # No price existed yet as of that date, so nothing is valued.
        assert p["price"] is None
        assert p["price_age_days"] is None
        assert p["market_value"] is None
        assert p["unrealized"] is None
        assert p["unrealized_pct"] is None
        assert p["weight_pct"] is None

    def test_spend_account_held_at_price(self, client: TestClient) -> None:
        p = _position(client.get("/api/holdings").json(), "Assets:Bank:USD", "USD")
        assert p["booking"] is None
        assert p["held_at_cost"] is False
        assert p["units"] == "-550.00"
        assert p["cost_currency"] is None
        assert p["cost_total"] is None
        assert p["avg_cost"] is None
        assert p["price"] == {"number": "5.20", "quote": "BRL", "date": "2020-12-31"}
        assert p["market_value"] == "-2860.00"
        assert p["unrealized"] is None
        assert p["unrealized_pct"] is None
        assert p["lots"] is None

    def test_commodity_with_no_price_path(self, client: TestClient) -> None:
        p = _position(client.get("/api/holdings").json(), "Assets:Vacation", "VACDAY")
        assert p["held_at_cost"] is False
        assert p["units"] == "0.5"
        assert p["price"] is None
        assert p["market_value"] is None
        assert p["weight_pct"] is None

    def test_totals_and_weights(self, client: TestClient) -> None:
        body = client.get("/api/holdings").json()
        # cost in OC: 1900 + 1700×5.20 + 5250
        assert body["totals"]["cost_total"] == "15990.00"
        # market: 2450 + 9880 + 5700 − 2860
        assert body["totals"]["market_value"] == "15170.00"
        # 550 + 1040 + 450
        assert body["totals"]["unrealized"] == "2040.00"
        weights = {
            (p["account"], p["commodity"]): p["weight_pct"] for p in body["positions"]
        }
        assert weights[("Assets:Broker:PETR4", "PETR4")] == "16.15"
        assert weights[("Assets:Vault:XAU", "XAU")] == "65.13"
        assert weights[("Assets:XP", "ITUB4")] == "37.57"
        assert weights[("Assets:Bank:USD", "USD")] == "-18.85"
        total_weight = sum(Decimal(w) for w in weights.values() if w is not None)
        assert total_weight == pytest.approx(Decimal(100), abs=Decimal("0.05"))

    def test_price_age_relative_to_today_or_to_date(self, client: TestClient) -> None:
        p = _position(client.get("/api/holdings").json(), "Assets:Broker:PETR4", "PETR4")
        expected = (datetime.date.today() - datetime.date(2020, 12, 31)).days
        assert p["price_age_days"] == expected

        p = _position(
            client.get("/api/holdings?to_date=2021-01-31").json(),
            "Assets:Broker:PETR4", "PETR4",
        )
        assert p["price_age_days"] == 31

    def test_conversion_validation_and_echo(self, client: TestClient) -> None:
        assert client.get("/api/holdings?conversion=garbage").status_code == 400
        assert client.get("/api/holdings?conversion=at_cost").json()["conversion"] == "at_cost"
        assert client.get("/api/holdings?conversion=units").json()["conversion"] == "units"

    def test_currency_conversion_changes_the_valuation_currency(self, client: TestClient) -> None:
        body = client.get("/api/holdings?conversion=USD").json()
        assert body["conversion"] == "USD"
        xau = _position(body, "Assets:Vault:XAU", "XAU")
        assert xau["market_value"] == "1900.00"
        assert xau["unrealized"] == "200.00"
        usd = _position(body, "Assets:Bank:USD", "USD")
        assert usd["market_value"] == "-550.00"

    def test_view_mode_accepted(self, client: TestClient) -> None:
        assert client.get("/api/holdings?view_mode=actual").status_code == 200
        assert client.get("/api/holdings?view_mode=comparative").status_code == 422

    def test_fx_result_when_currency_accounts_is_on(self, plugin_client: TestClient) -> None:
        """The plugin books the 1000 USD @ 5.00 purchase into the trading pair;
        at 5.20 that pair is worth −200 BRL — the FX result, realised and
        unrealised together (§2.1)."""
        body = plugin_client.get("/api/holdings").json()
        assert body["fx_result"] == {
            "account": "Equity:CurrencyTrading",
            "market_value": "-200.00",
        }
        # The plugin's own postings never show up as holdings.
        assert all(
            not p["account"].startswith("Equity") for p in body["positions"]
        )


class TestEnablePlugins:
    """POST /api/plugins/enable writes plugin lines into the top-level file."""

    LEDGER = (
        'option "operating_currency" "BRL"\n'
        'include "inc.beancount"\n'
        '2026-01-01 open Assets:Bank BRL\n'
        '2026-01-01 open Assets:Global USD\n'
    )
    INC = '2026-01-02 open Expenses:Misc BRL\n'

    def _client(self, tmp_path):
        from fastapi.testclient import TestClient
        from ledger import init_ledger
        from main import app
        main = tmp_path / "main.beancount"
        main.write_text(self.LEDGER)
        (tmp_path / "inc.beancount").write_text(self.INC)
        init_ledger(str(main))
        return TestClient(app), main

    def test_enables_all_four_and_opens_the_trading_account(self, tmp_path):
        client, main = self._client(tmp_path)
        before = client.get("/api/commodities").json()["plugins"]
        assert not any(before.values())

        r = client.post("/api/plugins/enable", json={"plugins": [
            "implicit_prices", "coherent_cost", "check_average_cost", "currency_accounts",
        ]})
        assert r.status_code == 200, r.text
        body = r.json()
        assert all(body["plugins"].values())
        assert body["currency_trading_account"] == "Equity:CurrencyTrading"
        assert set(body["added"]) == {
            "implicit_prices", "coherent_cost", "check_average_cost", "currency_accounts",
        }

        text = main.read_text()
        lines = text.split("\n")
        # Right after the option line, in the TOP-LEVEL file (included files are ignored).
        assert lines[0] == 'option "operating_currency" "BRL"'
        assert lines[1] == 'plugin "beancount.plugins.implicit_prices"'
        assert lines[4] == 'plugin "beancount.plugins.currency_accounts" "Equity:CurrencyTrading"'
        assert "open Equity:CurrencyTrading" in text
        assert "plugin" not in (tmp_path / "inc.beancount").read_text()
        assert client.get("/api/errors").json()["count"] == 0

    def test_idempotent(self, tmp_path):
        client, main = self._client(tmp_path)
        client.post("/api/plugins/enable", json={"plugins": ["implicit_prices"]})
        r = client.post("/api/plugins/enable", json={"plugins": ["implicit_prices"]})
        assert r.json()["added"] == []
        assert main.read_text().count('plugin "beancount.plugins.implicit_prices"') == 1

    def test_unknown_plugin_is_400(self, tmp_path):
        client, _ = self._client(tmp_path)
        r = client.post("/api/plugins/enable", json={"plugins": ["auto_accounts"]})
        assert r.status_code == 400
