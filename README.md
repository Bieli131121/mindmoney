# 🧠 MindMoney — Finanças Comportamentais

MVP completo com React + Vite, Node.js/Express e SQLite.

---

## 📁 Estrutura de Pastas

```
mindmoney/
├── server.js          ← API Backend (Node.js + Express + SQLite)
├── package.json       ← Dependências do backend
│
└── frontend/
    ├── package.json   ← Dependências do frontend
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx    ← Toda a UI
        └── index.css  ← Estilos globais
```

---

## 🚀 Como Executar

### 1. Instalar dependências do Backend

```bash
# Na pasta raiz do projeto (mindmoney/)
npm install
```

### 2. Instalar dependências do Frontend

```bash
cd frontend
npm install
cd ..
```

### 3. Iniciar o Backend (em um terminal)

```bash
# Na pasta raiz (mindmoney/)
npm start
# ou para hot-reload:
# npx nodemon server.js
```
> API rodando em: http://localhost:3001

### 4. Iniciar o Frontend (em outro terminal)

```bash
cd frontend
npm run dev
```
> App rodando em: http://localhost:5173

---

## 🔑 Login Demo

| Campo  | Valor                  |
|--------|------------------------|
| Email  | demo@mindmoney.com     |
| Senha  | demo123                |

O banco SQLite (`mindmoney.db`) é criado automaticamente na pasta raiz com dados de exemplo na primeira execução.

---

## ✨ Funcionalidades

- **Dashboard** com KPIs (Saldo, Receitas, Gastos), gráfico de área mensal e pizza por categoria
- **Transações** — listagem, adição e remoção de receitas/gastos
- **IA Insights** — análise comportamental com taxa de poupança, breakdown por categoria e conselho personalizado
- **Autenticação JWT** simulada com persistência de sessão
- **Design dark** com glassmorphism e animações suaves
- **Responsivo** — funciona em mobile e desktop

---

## 🛠️ Stack

| Camada    | Tecnologia                            |
|-----------|---------------------------------------|
| Frontend  | React 18 + Vite + Tailwind CSS        |
| Gráficos  | Recharts                              |
| Backend   | Node.js + Express                     |
| Banco     | SQLite (better-sqlite3)               |
| Auth      | JWT (jsonwebtoken)                    |
