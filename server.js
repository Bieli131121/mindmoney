const express = require("express");
const initSqlJs = require("sql.js");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3001;
const JWT_SECRET = "mindmoney-secret-2024";
const DB_PATH = path.join(__dirname, "mindmoney.db");

app.use(cors());
app.use(express.json());

let db;

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, name TEXT NOT NULL);`);
  db.run(`CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, amount REAL NOT NULL, category TEXT NOT NULL, description TEXT, date TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'expense', created_at TEXT DEFAULT (datetime('now')));`);
  db.run(`CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, target_amount REAL NOT NULL, current_amount REAL NOT NULL DEFAULT 0, category TEXT, deadline TEXT, created_at TEXT DEFAULT (datetime('now')));`);
  db.run(`CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, limit_amount REAL NOT NULL, closing_day INTEGER NOT NULL, due_day INTEGER NOT NULL, color TEXT DEFAULT '#818cf8', created_at TEXT DEFAULT (datetime('now')));`);
  db.run(`CREATE TABLE IF NOT EXISTS card_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, card_id INTEGER NOT NULL, amount REAL NOT NULL, category TEXT NOT NULL, description TEXT, date TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));`);
  db.run(`CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, category TEXT NOT NULL, limit_amount REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT (datetime('now')));`);

  const existing = db.exec("SELECT id FROM users WHERE email = 'demo@mindmoney.com'");
  if (!existing.length || !existing[0].values.length) {
    db.run("INSERT INTO users (email, password, name) VALUES ('demo@mindmoney.com', 'demo123', 'Demo User')");
    saveDb();
    const res = db.exec("SELECT id FROM users WHERE email = 'demo@mindmoney.com'");
    const uid = res[0].values[0][0];
    [
      [uid,3500,"Salário","Salário mensal","2024-01-05","income"],
      [uid,890,"Moradia","Aluguel","2024-01-10","expense"],
      [uid,320,"Alimentação","Supermercado","2024-01-12","expense"],
      [uid,150,"Transporte","Combustível","2024-01-14","expense"],
      [uid,80,"Lazer","Cinema e jantar","2024-01-18","expense"],
      [uid,200,"Saúde","Plano de saúde","2024-01-20","expense"],
      [uid,500,"Freelance","Projeto extra","2024-01-22","income"],
      [uid,60,"Educação","Curso online","2024-01-25","expense"],
      [uid,3500,"Salário","Salário mensal","2024-02-05","income"],
      [uid,890,"Moradia","Aluguel","2024-02-10","expense"],
      [uid,450,"Alimentação","Supermercado","2024-02-14","expense"],
      [uid,200,"Lazer","Show","2024-02-20","expense"],
      [uid,3500,"Salário","Salário mensal","2024-03-05","income"],
      [uid,890,"Moradia","Aluguel","2024-03-10","expense"],
      [uid,280,"Alimentação","Supermercado","2024-03-15","expense"],
      [uid,120,"Transporte","Uber","2024-03-18","expense"],
    ].forEach(s => db.run(`INSERT INTO transactions (user_id,amount,category,description,date,type) VALUES (${s[0]},${s[1]},'${s[2]}','${s[3]}','${s[4]}','${s[5]}')`));
  }
  saveDb();
}

function dbAll(sql, params=[]) {
  try {
    let i=0;
    const filled = sql.replace(/\?/g, () => { const v=params[i++]; if(v==null) return "NULL"; if(typeof v==="number") return v; return `'${String(v).replace(/'/g,"''")}'`; });
    const result = db.exec(filled);
    if (!result.length) return [];
    const {columns,values} = result[0];
    return values.map(row => Object.fromEntries(columns.map((col,j) => [col,row[j]])));
  } catch(e) { return []; }
}

function dbGet(sql, params=[]) { return dbAll(sql,params)[0] || null; }

function dbRun(sql, params=[]) {
  let i=0;
  const filled = sql.replace(/\?/g, () => { const v=params[i++]; if(v==null) return "NULL"; if(typeof v==="number") return v; return `'${String(v).replace(/'/g,"''")}'`; });
  db.run(filled);
  const row = db.exec("SELECT last_insert_rowid() as id");
  saveDb();
  return row.length ? row[0].values[0][0] : null;
}

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return res.status(401).json({error:"Token não fornecido"});
  try { req.user = jwt.verify(h.split(" ")[1], JWT_SECRET); next(); }
  catch { return res.status(401).json({error:"Token inválido"}); }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post("/api/auth/login", (req,res) => {
  const {email,password} = req.body;
  if (!email||!password) return res.status(400).json({error:"Email e senha obrigatórios"});
  const user = dbGet("SELECT * FROM users WHERE email = ? AND password = ?", [email,password]);
  if (!user) return res.status(401).json({error:"Credenciais inválidas"});
  const token = jwt.sign({id:user.id,email:user.email,name:user.name}, JWT_SECRET, {expiresIn:"7d"});
  res.json({token, user:{id:user.id,email:user.email,name:user.name}});
});

app.post("/api/auth/register", (req,res) => {
  const {email,password,name} = req.body;
  if (!email||!password||!name) return res.status(400).json({error:"Todos os campos são obrigatórios"});
  if (dbGet("SELECT id FROM users WHERE email = ?", [email])) return res.status(409).json({error:"Email já cadastrado"});
  const id = dbRun("INSERT INTO users (email,password,name) VALUES (?,?,?)", [email,password,name]);
  const token = jwt.sign({id,email,name}, JWT_SECRET, {expiresIn:"7d"});
  res.status(201).json({token, user:{id,email,name}});
});

// ── Profile ───────────────────────────────────────────────────────────────────
app.get("/api/profile", auth, (req,res) => {
  const user = dbGet("SELECT id,email,name FROM users WHERE id = ?", [req.user.id]);
  if (!user) return res.status(404).json({error:"Usuário não encontrado"});
  res.json(user);
});

app.patch("/api/profile", auth, (req,res) => {
  const {name, currentPassword, newPassword} = req.body;
  const user = dbGet("SELECT * FROM users WHERE id = ?", [req.user.id]);
  if (!user) return res.status(404).json({error:"Usuário não encontrado"});

  if (name) {
    dbRun("UPDATE users SET name = ? WHERE id = ?", [name, req.user.id]);
  }

  if (newPassword) {
    if (!currentPassword) return res.status(400).json({error:"Senha atual é obrigatória"});
    if (user.password !== currentPassword) return res.status(401).json({error:"Senha atual incorreta"});
    dbRun("UPDATE users SET password = ? WHERE id = ?", [newPassword, req.user.id]);
  }

  const updated = dbGet("SELECT id,email,name FROM users WHERE id = ?", [req.user.id]);
  const token = jwt.sign({id:updated.id,email:updated.email,name:updated.name}, JWT_SECRET, {expiresIn:"7d"});
  res.json({user:updated, token});
});

// ── Transactions ──────────────────────────────────────────────────────────────
app.get("/api/transactions", auth, (req,res) => {
  const { startDate, endDate, type, category } = req.query;
  let sql = "SELECT * FROM transactions WHERE user_id = ?";
  const params = [req.user.id];
  if (startDate) { sql += " AND date >= ?"; params.push(startDate); }
  if (endDate)   { sql += " AND date <= ?"; params.push(endDate); }
  if (type)      { sql += " AND type = ?";  params.push(type); }
  if (category)  { sql += " AND category = ?"; params.push(category); }
  sql += " ORDER BY date DESC";
  res.json(dbAll(sql, params));
});

app.post("/api/transactions", auth, (req,res) => {
  const {amount,category,description,date,type} = req.body;
  if (!amount||!category||!date) return res.status(400).json({error:"Campos obrigatórios faltando"});
  const id = dbRun("INSERT INTO transactions (user_id,amount,category,description,date,type) VALUES (?,?,?,?,?,?)",
    [req.user.id,parseFloat(amount),category,description||"",date,type||"expense"]);
  res.status(201).json(dbGet("SELECT * FROM transactions WHERE id = ?", [id]));
});


app.patch("/api/transactions/:id", auth, (req,res) => {
  const {amount,category,description,date,type} = req.body;
  if (!dbGet("SELECT id FROM transactions WHERE id = ? AND user_id = ?", [req.params.id,req.user.id]))
    return res.status(404).json({error:"Transação não encontrada"});
  dbRun("UPDATE transactions SET amount=?,category=?,description=?,date=?,type=? WHERE id=?",
    [parseFloat(amount),category,description||"",date,type||"expense",req.params.id]);
  res.json(dbGet("SELECT * FROM transactions WHERE id = ?", [req.params.id]));
});

app.delete("/api/transactions/:id", auth, (req,res) => {
  if (!dbGet("SELECT id FROM transactions WHERE id = ? AND user_id = ?", [req.params.id,req.user.id]))
    return res.status(404).json({error:"Não encontrada"});
  dbRun("DELETE FROM transactions WHERE id = ?", [req.params.id]);
  res.json({success:true});
});

// ── Summary ───────────────────────────────────────────────────────────────────
app.get("/api/summary", auth, (req,res) => {
  const { startDate, endDate } = req.query;
  let sql = "SELECT * FROM transactions WHERE user_id = ?";
  const params = [req.user.id];
  if (startDate) { sql += " AND date >= ?"; params.push(startDate); }
  if (endDate)   { sql += " AND date <= ?"; params.push(endDate); }
  const txs = dbAll(sql, params);
  const totalIncome   = txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const totalExpenses = txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const balance = totalIncome - totalExpenses;
  const byCategory = {};
  txs.filter(t=>t.type==="expense").forEach(t=>{ byCategory[t.category]=(byCategory[t.category]||0)+t.amount; });
  const categoryData = Object.entries(byCategory).map(([name,value])=>({name,value}));
  const monthlyMap = {};
  txs.forEach(t=>{ const m=t.date.substring(0,7); if(!monthlyMap[m]) monthlyMap[m]={income:0,expense:0}; monthlyMap[m][t.type]+=t.amount; });
  const monthlyData = Object.entries(monthlyMap).sort(([a],[b])=>a.localeCompare(b)).slice(-6).map(([m,d])=>({
    month: new Date(m+"-01").toLocaleDateString("pt-BR",{month:"short",year:"2-digit"}),
    receitas:d.income, gastos:d.expense
  }));
  const savingsRate = totalIncome>0 ? ((totalIncome-totalExpenses)/totalIncome)*100 : 0;
  const top = [...categoryData].sort((a,b)=>b.value-a.value)[0];
  let insight;
  if (totalExpenses>totalIncome) insight={type:"danger",title:"⚠️ Alerta de Gastos",message:`Seus gastos (R$ ${totalExpenses.toFixed(2)}) superam sua renda. Revise urgentemente.`};
  else if (savingsRate<10) insight={type:"warning",title:"💡 Poupança Baixa",message:`Poupando apenas ${savingsRate.toFixed(1)}%. Meta: 20%. Reduza gastos com ${top?.name||"lazer"}.`};
  else if (savingsRate>=20) insight={type:"positive",title:"🎉 Parabéns!",message:`Poupando ${savingsRate.toFixed(1)}% da renda. Excelente! Considere investir o excedente.`};
  else insight={type:"info",title:"📊 Comportamento Estável",message:`Taxa de poupança: ${savingsRate.toFixed(1)}%. Pode melhorar reduzindo gastos com "${top?.name||"supérfluos"}".`};
  res.json({totalIncome,totalExpenses,balance,categoryData,monthlyData,insight});
});

// ── Goals ─────────────────────────────────────────────────────────────────────
app.get("/api/goals", auth, (req,res) => {
  res.json(dbAll("SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]));
});
app.post("/api/goals", auth, (req,res) => {
  const {title,target_amount,category,deadline} = req.body;
  if (!title||!target_amount) return res.status(400).json({error:"Título e valor são obrigatórios"});
  const id = dbRun("INSERT INTO goals (user_id,title,target_amount,category,deadline) VALUES (?,?,?,?,?)",
    [req.user.id,parseFloat(target_amount),title,category||"",deadline||""]);
  res.status(201).json(dbGet("SELECT * FROM goals WHERE id = ?", [id]));
});
app.patch("/api/goals/:id", auth, (req,res) => {
  const {current_amount} = req.body;
  if (!dbGet("SELECT id FROM goals WHERE id = ? AND user_id = ?", [req.params.id,req.user.id]))
    return res.status(404).json({error:"Meta não encontrada"});
  dbRun("UPDATE goals SET current_amount = ? WHERE id = ?", [parseFloat(current_amount),req.params.id]);
  res.json(dbGet("SELECT * FROM goals WHERE id = ?", [req.params.id]));
});
app.delete("/api/goals/:id", auth, (req,res) => {
  if (!dbGet("SELECT id FROM goals WHERE id = ? AND user_id = ?", [req.params.id,req.user.id]))
    return res.status(404).json({error:"Meta não encontrada"});
  dbRun("DELETE FROM goals WHERE id = ?", [req.params.id]);
  res.json({success:true});
});

// ── Alerts ────────────────────────────────────────────────────────────────────
app.get("/api/alerts", auth, (req,res) => {
  res.json(dbAll("SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]));
});
app.post("/api/alerts", auth, (req,res) => {
  const {category,limit_amount} = req.body;
  if (!category||!limit_amount) return res.status(400).json({error:"Categoria e limite são obrigatórios"});
  const id = dbRun("INSERT INTO alerts (user_id,category,limit_amount) VALUES (?,?,?)",
    [req.user.id,category,parseFloat(limit_amount)]);
  res.status(201).json(dbGet("SELECT * FROM alerts WHERE id = ?", [id]));
});
app.delete("/api/alerts/:id", auth, (req,res) => {
  if (!dbGet("SELECT id FROM alerts WHERE id = ? AND user_id = ?", [req.params.id,req.user.id]))
    return res.status(404).json({error:"Alerta não encontrado"});
  dbRun("DELETE FROM alerts WHERE id = ?", [req.params.id]);
  res.json({success:true});
});


// ── Credit Cards ──────────────────────────────────────────────────────────────
app.get("/api/cards", auth, (req,res) => {
  res.json(dbAll("SELECT * FROM cards WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]));
});

app.post("/api/cards", auth, (req,res) => {
  const {name, limit_amount, closing_day, due_day, color} = req.body;
  if (!name||!limit_amount||!closing_day||!due_day) return res.status(400).json({error:"Campos obrigatórios faltando"});
  const id = dbRun("INSERT INTO cards (user_id,name,limit_amount,closing_day,due_day,color) VALUES (?,?,?,?,?,?)",
    [req.user.id, name, parseFloat(limit_amount), parseInt(closing_day), parseInt(due_day), color||"#818cf8"]);
  res.status(201).json(dbGet("SELECT * FROM cards WHERE id = ?", [id]));
});

app.delete("/api/cards/:id", auth, (req,res) => {
  if (!dbGet("SELECT id FROM cards WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]))
    return res.status(404).json({error:"Cartão não encontrado"});
  dbRun("DELETE FROM cards WHERE id = ?", [req.params.id]);
  dbRun("DELETE FROM card_transactions WHERE card_id = ?", [req.params.id]);
  res.json({success:true});
});

app.get("/api/cards/:id/transactions", auth, (req,res) => {
  const { month } = req.query;
  const card = dbGet("SELECT * FROM cards WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  if (!card) return res.status(404).json({error:"Cartão não encontrado"});
  let sql = "SELECT * FROM card_transactions WHERE card_id = ?";
  const params = [req.params.id];
  if (month) { sql += " AND strftime('%Y-%m', date) = ?"; params.push(month); }
  sql += " ORDER BY date DESC";
  const transactions = dbAll(sql, params);
  const total = transactions.reduce((s,t) => s + t.amount, 0);
  const available = card.limit_amount - total;
  res.json({ card, transactions, total, available });
});

app.post("/api/cards/:id/transactions", auth, (req,res) => {
  const {amount, category, description, date} = req.body;
  if (!amount||!category||!date) return res.status(400).json({error:"Campos obrigatórios faltando"});
  const card = dbGet("SELECT * FROM cards WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  if (!card) return res.status(404).json({error:"Cartão não encontrado"});
  const id = dbRun("INSERT INTO card_transactions (card_id,amount,category,description,date) VALUES (?,?,?,?,?)",
    [req.params.id, parseFloat(amount), category, description||"", date]);
  res.status(201).json(dbGet("SELECT * FROM card_transactions WHERE id = ?", [id]));
});

app.delete("/api/cards/:cardId/transactions/:id", auth, (req,res) => {
  const card = dbGet("SELECT id FROM cards WHERE id = ? AND user_id = ?", [req.params.cardId, req.user.id]);
  if (!card) return res.status(404).json({error:"Cartão não encontrado"});
  dbRun("DELETE FROM card_transactions WHERE id = ? AND card_id = ?", [req.params.id, req.params.cardId]);
  res.json({success:true});
});

initDb().then(() => app.listen(PORT, () => console.log(`✅ MindMoney API rodando em http://localhost:${PORT}`)));
