from fastapi import APIRouter, Request

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
