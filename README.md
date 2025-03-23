# 💰 Ledger: Controle Financeiro Pessoal com Inteligência Contábil

O **Ledger** é um sistema de controle financeiro pessoal com uma pegada contábil real.  
Inspirado nos conceitos mais sólidos da contabilidade (regime de caixa e competência), ele é uma versão moderna, poderosa e automatizável do antigo Microsoft Money — só que com cérebro.

---

## 🧠 Propósito do projeto

Gerenciar finanças pessoais de forma **realista, automatizada e estratégica**, com suporte para:

- Lançamentos por **competência** e **fluxo de caixa**
- Parcelamentos e faturas de **cartão de crédito**
- Despesas **reembolsáveis** e **compartilhadas**
- Lançamentos **off-balance** que impactam o caixa, mas não sua DRE pessoal
- Controle de múltiplas contas e transferências
- Registros recorrentes (streamings, aluguéis, assinaturas)

---

## 🧱 Arquitetura

- **Camada de domínio (Domain)**: lógica pura de negócio e entidades
- **Camada de infraestrutura (ORM)**: entities mapeadas com TypeORM para persistência
- **Camada de aplicação**: serviços que orquestram regras e acesso a dados
- **Controllers**: exposição via API

---

## 🧰 Stack utilizada

| Camada          | Tecnologia              |
| --------------- | ----------------------- |
| Backend         | NestJS + TypeScript     |
| ORM             | TypeORM                 |
| Banco de dados  | PostgreSQL (Docker)     |
| Env config      | @nestjs/config + dotenv |
| Acesso ao banco | DataGrip                |

---

## ⚙️ Como rodar o projeto do zero (primeira vez)

### 1. Suba o banco de dados com Docker:

```bash
docker-compose up -d
```

> Isso sobe um PostgreSQL local na porta 5432 com o banco `ledger`

---

### 2. Configure o `.env`

Crie um arquivo `.env.local` com as variáveis:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=ledger
DB_PASSWORD=ledger
DB_DATABASE=ledger
NODE_ENV=development
```

---

### 3. Instale as dependências:

```bash
npm install
```

---

### 4. Compile o projeto:

```bash
npm run build
```

---

### 5. Gere a primeira migration (criação do schema):

```bash
npm run migration:generate
```

---

### 6. Rode a migration no banco:

```bash
npm run migration:run
```

---

### 7. Execute o servidor:

```bash
npm run start:dev
```

> Agora o projeto está rodando com o banco ativo, tabelas criadas e pronto pra uso.

---

## 🔁 Como rodar o projeto em ambiente já configurado

Se você já tem o projeto clonado e configurado na máquina:

```bash
npm install # instala dependências
npm run build # compila para dist/
npm run migration:run # aplica as migrations pendentes (se houver)
npm run start:dev # inicia o servidor em modo dev
```

> Certifique-se de que o banco (PostgreSQL via Docker) está rodando (`docker ps`)

---

## 📜 Licença

Este projeto está sob a licença MIT.
