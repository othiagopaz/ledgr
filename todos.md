# Goals

## Backend

### V0

- Poder criar uma despesa [OK]
- Poder criar uma receita [OK]
- Poder criar uma despesa 100% refundable [OK]
- Poder criar uma despesa partially refundable [OK]
- Poder criar receitas/despesas parceladas [OK]
- Poder criar uma despesa no cartão de crédito [OK]
- Poder criar uma transferência [OK]

### To-dos

[x] Revisar lógica de create de events e transactions
[x] Testar cada use-case de events
[x] Migrar para entidades em Events
[x] Migrar para entidades em Transactions
[x] Migrar para entidades em Categories
[x] Implementar lógica de Settlements na criação de Evens onde há transactions REFUNDABLE
[x] Criar Invoice
[x] Criar lógica de pagamento em cartão de crédito
[x] Atualizar entidades para receberem CreditCard
[x] Corrigir data da transaction para usar a paid ao invés de due_date
[x] Não está persistindo o InvoiceId depois de checar a Invoice
[x] Não está conseguindo buscar a Invoice no banco pelos filtros
[x] Entender porque o paymentDate da transaction está sendo alterado
[x] Checar datas e competências de Invoice
[x] Criar a entidade Transference
[x] Criar lógicas de transferences

### On the watch

[ ] Criar campo balance em Account
[ ] Atualizar o balance sempre que houver uma transaction naquela conta
[ ] Criar lógica de pagamento da fatura do cartão (lembrar do pgto parcial e juros)
[ ] A lógica do dueDate do cartão de crédito vai precisar ser "calibrada" pelo usuário no front-end com os daysBeforeDue
[ ] Será preciso validar a lógica de número de parcelas nas installments
[ ] Criar lógica de transactions e events com pagination
[ ] Adicionar últimos 4 digitos do cartão

### Questionamentos interessantes

- A transaction realmente precisa de um installmentNumber?
- A transaction realmente precisa de um competenceDate?

## Frontend

### V0

- Criar uma despesa [OK]
- Criar uma receita [OK]
- Criar uma transferência
- Criar uma despesa 100% refundable
- Criar uma despesa partially refundable
- Criar despesas/receitas parceladas
- Criar despesa no cartão de crédito
- Visualizar cashflow statement
- Visualizar todas as despesas
- Visualizar todas as receitas
- Visualizar P&L
- Visualizar saldo da fatura

### On the watch

[ ] Filtros no dashboard "se mexem" ao existir uma seleção
