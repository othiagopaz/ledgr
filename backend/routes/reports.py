from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("/api/reports/income-expense")
def get_income_expense(request: Request, interval: str = Query("monthly")):
    engine = request.app.state.engine
    return {"series": engine.get_income_expense_series(interval)}


@router.get("/api/reports/account-balance")
def get_account_balance(
    request: Request,
    account: str = Query(...),
    interval: str = Query("monthly"),
):
    engine = request.app.state.engine
    return {"series": engine.get_account_balance_series(account, interval)}


@router.get("/api/reports/net-worth")
def get_net_worth(request: Request, interval: str = Query("monthly")):
    engine = request.app.state.engine
    return {"series": engine.get_net_worth_series(interval)}


@router.get("/api/reports/income-statement")
def get_income_statement(
    request: Request,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    interval: str = Query("monthly"),
):
    engine = request.app.state.engine
    return engine.get_income_statement(from_date, to_date, interval)


@router.get("/api/reports/balance-sheet")
def get_balance_sheet(
    request: Request,
    as_of_date: str | None = Query(None),
):
    engine = request.app.state.engine
    return engine.get_balance_sheet(as_of_date)


@router.get("/api/reports/cashflow")
def get_cashflow(
    request: Request,
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    interval: str = Query("monthly"),
):
    engine = request.app.state.engine
    return engine.get_cashflow_statement(from_date, to_date, interval)
