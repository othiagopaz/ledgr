from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()


class PostingIn(BaseModel):
    account: str
    amount: float | None = None
    currency: str | None = None


class TransactionIn(BaseModel):
    date: str
    flag: str = "*"
    payee: str | None = None
    narration: str = ""
    postings: list[PostingIn]


@router.post("/api/transactions")
def add_transaction(request: Request, body: TransactionIn):
    engine = request.app.state.engine
    result = engine.add_transaction(
        date=body.date,
        flag=body.flag,
        payee=body.payee,
        narration=body.narration,
        postings=[p.model_dump() for p in body.postings],
    )
    return result
