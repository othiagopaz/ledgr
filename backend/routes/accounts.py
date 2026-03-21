from fastapi import APIRouter, Request, Query

router = APIRouter()


@router.get("/api/accounts")
def get_accounts(request: Request):
    engine = request.app.state.engine
    return {
        "accounts": engine.get_accounts(),
        "errors": [str(e) for e in engine.errors],
    }


@router.get("/api/account-names")
def get_account_names(request: Request):
    engine = request.app.state.engine
    return {"accounts": engine.get_account_names()}


@router.get("/api/payees")
def get_payees(request: Request):
    engine = request.app.state.engine
    return {"payees": engine.get_payees()}


@router.get("/api/errors")
def get_errors(request: Request):
    engine = request.app.state.engine
    return {"errors": engine.get_errors(), "count": len(engine.errors)}


@router.get("/api/options")
def get_options(request: Request):
    engine = request.app.state.engine
    return engine.get_options()


@router.get("/api/suggestions")
def get_suggestions(request: Request, payee: str = Query(...)):
    engine = request.app.state.engine
    return engine.get_suggestions(payee)
