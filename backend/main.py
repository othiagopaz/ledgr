"""
Entry point for the Ledgr backend.

Run with: cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8080
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from ledger import init_ledger
from routers import accounts, transactions, reports, cashflow, series

BEANCOUNT_FILE = os.environ.get(
    "BEANCOUNT_FILE",
    os.path.join(os.path.dirname(__file__), "..", "data", "example.beancount"),
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_ledger(os.path.abspath(BEANCOUNT_FILE))
    yield


app = FastAPI(title="Ledgr", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(accounts.router)
app.include_router(transactions.router)
app.include_router(reports.router)
app.include_router(cashflow.router)
app.include_router(series.router)

# Serve frontend static files in production
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
