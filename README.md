# 🧾 Ledger

> Um sistema de controle financeiro pessoal moderno, inspirado nos conceitos contábeis clássicos e construído com foco em robustez, escalabilidade e clareza.

---

## ✨ Visão Geral

**Ledger** é um backend modular para gestão de finanças pessoais com suporte real a:

- Regime de **Competência** e **Caixa**
- Parcelamentos e controle de faturas
- Cartões de crédito e contas bancárias
- Transferências e adiantamentos
- Pagamentos **recorrentes**
- Classificação por categorias

---

## 🧠 Arquitetura

- **🧱 Clean Architecture** com camadas bem definidas
- **DDD (Domain-Driven Design)** com separação entre Domínio, Aplicação e Infraestrutura
- **Repositórios abstratos** com injeção de dependência via providers
- **Entidades ricas** com comportamento encapsulado
- **Validação com DTOs e class-validator**

---

## 🏗️ Estrutura de Pastas

```bash
src/
├── domain/                  # Lógica de negócio pura
│   └── financial-entry/
│       ├── financial-entry.entity.ts
│       └── financial-entry.types.ts
│
├── modules/                # Módulos da aplicação (Nest)
│   └── financial-entry/
│       ├── controllers/
│       ├── services/
│       ├── dto/
│       ├── repositories/
│       ├── entities/
│       └── mappers/
│
├── shared/                 # Utilitários, enums e base classes
│   ├── base.repository.ts
│   └── enums/
│
└── main.ts
```

---

## 🚀 Stack

- **Nest.js** - Framework principal
- **TypeORM** - ORM para PostgreSQL
- **PostgreSQL** - Banco de dados relacional
- **TypeScript** - Tipagem forte
- **class-validator** / **class-transformer** - Validação e transformação de dados
- **uuid** - Identificadores únicos

---

## 🧪 Modo Dev (sem banco)

Para rodar sem precisar configurar banco de dados, o projeto já está preparado com um **repositório em memória**.

### ➤ Executar:

```bash
npm install
npm run start:dev
```

Você poderá fazer requisições como:

```bash
POST /financial-entries
Content-Type: application/json

{
  "description": "Compra no cartão",
  "amount": 1200,
  "installments": 6,
  "date": "2025-04-01",
  "type": "expense",
  "categoryId": "cat-tv",
  "creditCardId": "card-001"
}
```

---

## 📦 TODO (Roadmap)

- [ ] Módulo de `Installment`
- [ ] Suporte a `Invoice` e pagamento de faturas
- [ ] Lançamentos `recorrentes`
- [ ] Módulo de `Transferências`
- [ ] Autenticação e gerenciamento de usuários
- [ ] Painel gráfico (Dashboard com Nest + Front)

---

## 🧠 Filosofia

Este projeto não é um simples CRUD. É uma tentativa séria de aplicar princípios contábeis reais à vida financeira pessoal, com:

- Separação entre compromisso e execução
- Controle de competência versus caixa
- Clareza nos dados e responsabilidade de cada entidade

---

## 🧑‍💻 Autor

**Thiago Paz** — empreendedor, racional, e curioso compulsivo.  
Arquitetura limpa, código com propósito.

---

## 📜 Licença

MIT — pode usar, modificar e escalar. Só não faz bobagem.
