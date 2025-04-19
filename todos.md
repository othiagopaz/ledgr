# Goals

## V0

- Poder criar uma despesa [OK]
- Poder criar uma receita [OK]
- Poder criar uma despesa 100% refundable [OK]
- Poder criar uma despesa partially refundable [OK]
- Poder criar receitas/despesas parceladas [OK]
- Poder criar uma despesa no cartão de crédito [OK]
- Poder criar uma transferência

## To-dos

TODO: Criar a entidade Transference
TODO: Criar lógica de pagamento da fatura do cartão (lembrar do pgto parcial e juros)

## Questionamentos interessantes

- A transaction realmente precisa de um installmentNumber?
- A transaction realmente precisa de um competenceDate?

## On the watch

- A lógica do dueDate do cartão de crédito vai precisar ser "calibrada" pelo usuário no front-end com os daysBeforeDue
- Será preciso validar a lógica de número de parcelas nas installments
- Criar lógica de transactions e events com pagination

