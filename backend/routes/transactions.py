from fastapi import APIRouter, Query, Request

router = APIRouter()


@router.get("/api/transactions")
def get_transactions(
    request: Request,
    account: str | None = Query(None),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
):
    engine = request.app.state.engine
    txns = engine.get_transactions(account=account, from_date=from_date, to_date=to_date)
    return {"transactions": txns, "count": len(txns)}
