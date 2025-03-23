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
