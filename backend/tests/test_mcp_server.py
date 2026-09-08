"""Tests for the MCP server's own guardrails.

``mcp_server`` is a thin HTTP client over the backend, so almost nothing here
needs testing — except the checks it performs *before* calling the backend.
``_balance_error`` is the LLM→file guardrail, and a guardrail that refuses
valid input is worse than none.

Importing the module is safe: the backend is only reached on a tool call.
"""

from __future__ import annotations

import warnings

import pytest

with warnings.catch_warnings():
    # The `mcp` SDK emits a pydantic_settings warning about one of its own
    # models at import time. Third-party and pre-existing — scoped here so it
    # does not become the first of many in the suite's output.
    warnings.simplefilter("ignore")
    import mcp_server
    from mcp_server import _balance_error, add_transaction


class TestBalanceError:
    def test_balanced_pair_passes(self) -> None:
        assert _balance_error([
            {"account": "Expenses:Food", "amount": "45.90", "currency": "BRL"},
            {"account": "Assets:Bank", "amount": "-45.90", "currency": "BRL"},
        ]) is None

    def test_unbalanced_pair_is_caught(self) -> None:
        err = _balance_error([
            {"account": "Expenses:Food", "amount": "45.90", "currency": "BRL"},
            {"account": "Assets:Bank", "amount": "-40.00", "currency": "BRL"},
        ])
        assert err is not None
        assert "do not balance" in err

    def test_elided_amount_defers(self) -> None:
        assert _balance_error([
            {"account": "Expenses:Food", "amount": "45.90", "currency": "BRL"},
            {"account": "Assets:Bank"},
        ]) is None

    def test_empty_postings_are_refused(self) -> None:
        assert _balance_error([]) is not None

    def test_not_a_number_is_caught(self) -> None:
        err = _balance_error([
            {"account": "Expenses:Food", "amount": "quarenta", "currency": "BRL"},
            {"account": "Assets:Bank", "amount": "-40.00", "currency": "BRL"},
        ])
        assert err is not None
        assert "not a valid number" in err

    # ── Held at cost / converted at a price ────────────────────────
    # These balance by weight (units x cost, or units x price), not by a
    # per-currency sum of amounts. The naive sum rejected every one of them.

    def test_share_sale_is_not_refused(self) -> None:
        """Cost 20.00 x 10 out, 280.00 cash in, 80.00 gain. Correct entry.

        The amount sum sees ``-10 X`` and ``+200.00 BRL`` and used to call it
        unbalanced — it was rejecting entries by their capital gain.
        """
        assert _balance_error([
            {
                "account": "Assets:Broker:X", "amount": "-10", "currency": "X",
                "cost": "20.00", "cost_currency": "BRL",
                "price": "28.00", "price_currency": "BRL",
            },
            {"account": "Assets:Bank", "amount": "280.00", "currency": "BRL"},
            {"account": "Income:Gains", "amount": "-80.00", "currency": "BRL"},
        ]) is None

    def test_share_purchase_is_not_refused(self) -> None:
        assert _balance_error([
            {
                "account": "Assets:Broker:X", "amount": "10", "currency": "X",
                "cost": "20.00", "cost_currency": "BRL",
            },
            {"account": "Assets:Bank", "amount": "-200.00", "currency": "BRL"},
        ]) is None

    def test_fx_purchase_is_not_refused(self) -> None:
        """Two legs in two currencies, joined by a price. Perfectly valid —
        and the naive sum refused it in full, so the MCP could not record any
        currency exchange at all."""
        assert _balance_error([
            {
                "account": "Assets:Bank:USD", "amount": "1000.00",
                "currency": "USD", "price": "5.00", "price_currency": "BRL",
            },
            {"account": "Assets:Bank:BRL", "amount": "-5000.00", "currency": "BRL"},
        ]) is None

    def test_plain_imbalance_is_still_caught_alongside_a_cost(self) -> None:
        """Standing down is per-transaction, so the backend owns the real
        check — but a transaction with no cost and no price still gets the
        cheap guardrail."""
        assert _balance_error([
            {"account": "Expenses:Fees", "amount": "10.00", "currency": "BRL"},
            {"account": "Assets:Bank", "amount": "-5.00", "currency": "BRL"},
        ]) is not None

    # ── The widened cost vocabulary (PLAN-commodities-ux §4.8) ─────────
    # A lot named by total, date, label or `{}` balances by a weight only
    # the backend can resolve (it has to book the lot). Same stand-down.

    @pytest.mark.parametrize("extra", [
        {"cost_total": "1750.00", "cost_currency": "BRL"},
        {"cost_date": "2026-02-01"},
        {"cost_label": "lote-fev"},
        {"cost_empty": True},
    ])
    def test_lot_identifiers_stand_the_guard_down(self, extra: dict) -> None:
        """Sold 50 PETR4 for 2000.00 cash with an explicit 250.00 gain.

        The amount sum sees ``-50 PETR4`` and ``+1750.00 BRL`` and would call
        every one of these unbalanced. None of them is."""
        assert _balance_error([
            {
                "account": "Assets:XP", "amount": "-50", "currency": "PETR4",
                "price": "40.00", "price_currency": "BRL", **extra,
            },
            {"account": "Assets:Bank", "amount": "2000.00", "currency": "BRL"},
            {"account": "Income:Gains", "amount": "-250.00", "currency": "BRL"},
        ]) is None

    def test_cost_empty_false_is_not_a_cost(self) -> None:
        """An explicit ``cost_empty: false`` carries no cost, so the cheap
        guard still applies."""
        assert _balance_error([
            {"account": "Expenses:Fees", "amount": "10.00", "currency": "BRL",
             "cost_empty": False},
            {"account": "Assets:Bank", "amount": "-5.00", "currency": "BRL"},
        ]) is not None


class TestAddTransactionPassthrough:
    """``add_transaction`` forwards postings to the backend unchanged.

    The MCP must not know the cost vocabulary — the backend validates it and
    answers 400 on a bad combination. Anything the MCP dropped or renamed
    here would silently change what gets written."""

    def test_new_posting_fields_reach_the_backend_verbatim(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        captured: dict = {}

        def fake_post(path: str, json: dict) -> dict:
            captured["path"] = path
            captured["json"] = json
            return {"success": True}

        monkeypatch.setattr(mcp_server, "_post", fake_post)

        postings = [
            {
                "account": "Assets:Clear", "amount": "-50", "currency": "PETR4",
                "cost_empty": True,
                "price": "40.00", "price_currency": "BRL",
            },
            {
                "account": "Assets:Rico", "amount": "10", "currency": "PETR4",
                "cost_total": "350.00", "cost_currency": "BRL",
                "cost_date": "2026-02-01", "cost_label": "lote-fev",
            },
            {"account": "Assets:Bank", "amount": "1650.00", "currency": "BRL"},
            {"account": "Income:Gains"},
        ]
        result = add_transaction(
            date="2026-06-01", postings=postings, narration="passthrough",
        )

        assert result == {"success": True}
        assert captured["path"] == "/api/transactions"
        assert captured["json"]["postings"] == postings
        assert captured["json"]["date"] == "2026-06-01"
