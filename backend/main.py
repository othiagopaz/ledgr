"""
Entry point for the Ledgr backend.

Run with: cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8080
"""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from ledger import init_ledger
from routers import accounts, transactions, reports, cashflow, series, budget

BEANCOUNT_FILE = os.environ.get(
    "BEANCOUNT_FILE",
    os.path.join(os.path.dirname(__file__), "..", "data", "example.beancount"),
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_ledger(os.path.abspath(BEANCOUNT_FILE))
    yield


app = FastAPI(title="Ledgr", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe — used by the MCP server to detect a running backend."""
    return {"status": "ok"}

# In normal dev the Vite proxy (changeOrigin) fronts /api, so CORS isn't
# exercised — but allow the frontend origin directly for any cross-origin call.
# Default to Ledgr's dedicated frontend port (5273); keep 5173 so a bare
# `npm run dev` without LEDGR_FRONTEND_PORT still works out of the box.
_frontend_port = os.environ.get("LEDGR_FRONTEND_PORT", "5273")
_cors_origins = {f"http://localhost:{_frontend_port}", "http://localhost:5173"}
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(_cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(accounts.router)
app.include_router(transactions.router)
app.include_router(reports.router)
app.include_router(cashflow.router)
app.include_router(series.router)
app.include_router(budget.router)

# Serve frontend static files in production
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
