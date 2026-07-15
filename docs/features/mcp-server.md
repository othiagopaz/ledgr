---
type: feature
last_updated: 2026-07-15
---

# MCP server — drive Ledgr from an LLM

`backend/mcp_server.py` exposes Ledgr to an LLM (Claude Desktop, Claude Code)
as [MCP](https://modelcontextprotocol.io) tools: record transactions, pull
period reports, query transactions/accounts, and read the budget — in natural
language.

## The one rule still holds

The MCP server is a **thin HTTP client over the FastAPI backend**. It calls the
same endpoints the frontend calls; it never imports Beancount or FavaLedger.
So *Beancount/Fava do the accounting, Ledgr presents it* — the MCP is just
another presentation surface.

The one exception is a **defensive balance check** in `add_transaction`
(`_balance_error`): before POSTing, it rejects fully-specified postings that
don't sum to zero per currency. This is not duplicated accounting — it's a
guardrail at the LLM→file boundary, because an LLM routinely gets amounts
slightly wrong and the backend currently writes unbalanced entries silently
(see [`pitfalls.md`](../pitfalls.md)). Postings with an elided amount pass
through untouched for Beancount to auto-balance.

## Backend lifecycle — reuse-or-spawn

You don't have to open the app first. On the first tool call the server:

1. GETs `{LEDGR_API_URL}/health`. If it answers, it **reuses** that backend —
   the one from `Ledgr.command`, or a previous MCP run.
2. Otherwise it **spawns** a headless `uvicorn` (backend only, no frontend, no
   browser) on the same port, waits for `/health`, and keeps it alive for the
   MCP process's lifetime (terminated on exit via `atexit`).

`GET /health` was added to `backend/main.py` solely for this probe.

## Configuration (env vars)

| Var | Default | Purpose |
|---|---|---|
| `LEDGR_API_URL` | `http://localhost:8080` | Backend base URL. |
| `LEDGR_BEANCOUNT_FILE` | the real Drive `financeiro.beancount` | Ledger the **spawned** backend loads. Ignored when reusing a running backend. Point at `data/example.beancount` for safe testing. |
| `LEDGR_AUTOSTART` | `1` | `0` = only reuse a running backend, never spawn. |

## Dates are exclusive-end — use `month="YYYY-MM"`

The backend treats `to_date` as **exclusive** (the last day is not included).
So "all of July" is `[2026-07-01, 2026-08-01)`, and asking for
`to_date=2026-07-31` silently drops transactions dated the 31st — producing a
different total than the app's UI. This is subtle and an LLM naturally gets it
wrong (it reads "July" as `07-01`..`07-31`).

Guard: every period tool (`cashflow`, `income_statement`, `income_vs_expense`,
`net_worth`, `balance_sheet`) accepts `month="YYYY-MM"`, resolved by
`_month_range()` to the same exclusive-end range the frontend uses
(`resolvePeriodDates` in `frontend/src/utils/dateUtils.ts`). This is the one
correct way to ask for a single month — the tool descriptions steer the LLM to
it. Explicit `from_date`/`to_date` still work, documented as exclusive-end.

`balance_sheet` also sends a far-past `from_date` because the endpoint 500s on
a lone `to_date` (see [`pitfalls.md`](../pitfalls.md)).

## Planned vs actual — `view_mode`

Every read tool takes `view_mode`:

- `actual` — only confirmed transactions (flag `*`). "What really happened."
- `planned` — only planned/pending (flag `!`). "What's forecast."
- `combined` — both (**default**). Matches the app with the Planned toggle ON.

This mirrors the app's Planned toggle. The default is `combined`, so existing
behavior is unchanged; the LLM picks `actual`/`planned` when the question calls
for it. Invalid values fall back to `combined`.

`get_budget` is included: `view_mode` materially changes it — in `actual`,
each envelope's consumed amount and the net-cash-flow bridge count only
confirmed transactions; `combined`/`planned` fold in pending ones.

## Tools

| Tool | Endpoint |
|---|---|
| `add_transaction` | `POST /api/transactions` (+ balance guard) |
| `suggest_posting` | `GET /api/suggestions` |
| `income_statement` | `GET /api/reports/income-statement` |
| `balance_sheet` | `GET /api/reports/balance-sheet` |
| `cashflow` | `GET /api/reports/cashflow` |
| `income_vs_expense` | `GET /api/reports/income-expense` |
| `net_worth` | `GET /api/reports/net-worth` |
| `list_transactions` | `GET /api/transactions` |
| `list_accounts` | `GET /api/accounts` |
| `account_balance` | `GET /api/reports/account-balance` |
| `get_budget` | `GET /api/budget` |

Period tools take `month="YYYY-MM"` (recommended) or `from_date`/`to_date`.
All read tools take `view_mode` (actual/planned/combined), `get_budget` included.

## Wiring into Claude Code

```bash
claude mcp add ledgr -- \
  /Users/thiagopaz/Repositories/ledgr/backend/.venv/bin/python \
  /Users/thiagopaz/Repositories/ledgr/backend/mcp_server.py
```

For **Claude Desktop**, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ledgr": {
      "command": "/Users/thiagopaz/Repositories/ledgr/backend/.venv/bin/python",
      "args": ["/Users/thiagopaz/Repositories/ledgr/backend/mcp_server.py"]
    }
  }
}
```

Use the venv interpreter (it has `mcp`, `fava`, `uvicorn`). To test against the
example ledger instead of the real one, add
`"env": {"LEDGR_BEANCOUNT_FILE": "/Users/thiagopaz/Repositories/ledgr/data/example.beancount"}`.

## Manual smoke test

```bash
cd backend
LEDGR_BEANCOUNT_FILE="$(pwd)/../data/example.beancount" \
  .venv/bin/python -c "import mcp_server as m; print(m.list_accounts().keys())"
```
