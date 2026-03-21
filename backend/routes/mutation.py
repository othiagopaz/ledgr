from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()


class PostingIn(BaseModel):
    account: str
    amount: float | None = None
    currency: str | None = None
    cost: float | None = None
    cost_currency: str | None = None
    price: float | None = None
    price_currency: str | None = None


class TransactionIn(BaseModel):
    date: str
    flag: str = "*"
    payee: str | None = None
    narration: str = ""
    postings: list[PostingIn]


class EditTransactionIn(TransactionIn):
    lineno: int


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


@router.put("/api/transactions")
def edit_transaction(request: Request, body: EditTransactionIn):
    engine = request.app.state.engine
    result = engine.edit_transaction(
        lineno=body.lineno,
        date=body.date,
        flag=body.flag,
        payee=body.payee,
        narration=body.narration,
        postings=[p.model_dump() for p in body.postings],
    )
    return result


@router.delete("/api/transactions/{lineno}")
def delete_transaction(request: Request, lineno: int):
    engine = request.app.state.engine
    result = engine.delete_transaction(lineno)
    return result
