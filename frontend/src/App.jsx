import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ── Axios instance ────────────────────────────────────────────────────────────
const api = axios.create({ baseURL: "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("mm_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const CATEGORY_COLORS = {
  Moradia: "#818cf8",
  Alimentação: "#fb923c",
  Transporte: "#38bdf8",
  Lazer: "#f472b6",
  Saúde: "#34d399",
  Educação: "#fbbf24",
  Salário: "#4ade80",
  Freelance: "#a78bfa",
  Outros: "#94a3b8",
};

const EXPENSE_CATEGORIES = ["Moradia", "Alimentação", "Transporte", "Lazer", "Saúde", "Educação", "Outros"];
const INCOME_CATEGORIES = ["Salário", "Freelance", "Outros"];

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card p-3 text-sm" style={{ minWidth: 140 }}>
        <p className="text-slate-300 font-semibold mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: {fmt(p.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ══════════════════════════════════════════════════════════════════════════════
// AUTH PAGE
// ══════════════════════════════════════════════════════════════════════════════
function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "demo@mindmoney.com", password: "demo123", name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const { data } = await api.post(endpoint, form);
      localStorage.setItem("mm_token", data.token);
      onLogin(data.user);
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="glow-bg" />
      <div className="glow-bg-2" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-up">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg" style={{ fontFamily: 'Syne' }}>M</span>
            </div>
            <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Syne' }}>
              Mind<span className="text-green-400">Money</span>
            </span>
          </div>
          <p className="text-slate-400 text-sm">Inteligência financeira comportamental</p>
        </div>

        <div className="glass-card p-8 animate-fade-up stagger-1">
          {/* Tabs */}
          <div className="flex gap-1 bg-slate-900/60 rounded-xl p-1 mb-7">
            {["login", "register"].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200"
                style={{
                  fontFamily: 'Syne',
                  background: mode === m ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'transparent',
                  color: mode === m ? 'white' : '#64748b',
                }}
              >
                {m === "login" ? "Entrar" : "Cadastrar"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="label">Nome</label>
                <input
                  className="input-field"
                  placeholder="Seu nome"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input
                className="input-field"
                type="email"
                placeholder="seu@email.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Senha</label>
              <input
                className="input-field"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full py-3 text-base mt-2" disabled={loading}>
              {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
            </button>
          </form>

          {mode === "login" && (
            <p className="text-center text-xs text-slate-500 mt-5">
              Demo: <span className="text-slate-400">demo@mindmoney.com / demo123</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADD TRANSACTION MODAL
// ══════════════════════════════════════════════════════════════════════════════
function AddTransactionModal({ onClose, onAdd }) {
  const [form, setForm] = useState({
    type: "expense",
    amount: "",
    category: "Alimentação",
    description: "",
    date: new Date().toISOString().split("T")[0],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const categories = form.type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const handleTypeChange = (type) => {
    const defaultCat = type === "expense" ? "Alimentação" : "Salário";
    setForm({ ...form, type, category: defaultCat });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError("Informe um valor válido");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/transactions", form);
      onAdd(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(5, 8, 16, 0.85)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass-card p-6 w-full max-w-md animate-fade-up">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">Nova Transação</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Type Toggle */}
        <div className="flex gap-2 mb-5">
          {["expense", "income"].map((t) => (
            <button
              key={t}
              onClick={() => handleTypeChange(t)}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 border"
              style={{
                fontFamily: 'Syne',
                background: form.type === t
                  ? t === "expense" ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.15)'
                  : 'transparent',
                borderColor: form.type === t
                  ? t === "expense" ? 'rgba(248,113,113,0.5)' : 'rgba(74,222,128,0.5)'
                  : 'rgba(148,163,184,0.15)',
                color: form.type === t
                  ? t === "expense" ? '#f87171' : '#4ade80'
                  : '#64748b',
              }}
            >
              {t === "expense" ? "💸 Gasto" : "💰 Receita"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor (R$)</label>
              <input
                className="input-field"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Data</label>
              <input
                className="input-field"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <label className="label">Categoria</label>
            <select
              className="input-field"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Descrição (opcional)</label>
            <input
              className="input-field"
              placeholder="Ex: Supermercado Extra"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" className="btn-ghost flex-1" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? "Salvando..." : "Adicionar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// INSIGHT CARD
// ══════════════════════════════════════════════════════════════════════════════
function InsightCard({ insight }) {
  if (!insight) return null;

  const styles = {
    positive: { border: 'rgba(74,222,128,0.3)', bg: 'rgba(74,222,128,0.07)', dot: '#4ade80' },
    warning:  { border: 'rgba(251,191,36,0.3)',  bg: 'rgba(251,191,36,0.07)',  dot: '#fbbf24' },
    danger:   { border: 'rgba(248,113,113,0.3)', bg: 'rgba(248,113,113,0.07)', dot: '#f87171' },
    info:     { border: 'rgba(56,189,248,0.3)',  bg: 'rgba(56,189,248,0.07)',  dot: '#38bdf8' },
  };

  const s = styles[insight.type] || styles.info;

  return (
    <div
      className="rounded-2xl p-5 border animate-fade-up stagger-4"
      style={{ background: s.bg, borderColor: s.border }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 pulse-slow"
          style={{ background: s.dot, boxShadow: `0 0 8px ${s.dot}`, marginTop: '4px' }}
        />
        <div>
          <p className="font-bold text-white mb-1" style={{ fontFamily: 'Syne' }}>
            {insight.title}
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">{insight.message}</p>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showModal, setShowModal] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  // Restore session
  useEffect(() => {
    const token = localStorage.getItem("mm_token");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        if (payload.exp * 1000 > Date.now()) {
          setUser({ id: payload.id, email: payload.email, name: payload.name });
        } else {
          localStorage.removeItem("mm_token");
        }
      } catch {
        localStorage.removeItem("mm_token");
      }
    }
    setInitialized(true);
  }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoadingData(true);
    try {
      const [txRes, sumRes] = await Promise.all([
        api.get("/transactions"),
        api.get("/summary"),
      ]);
      setTransactions(txRes.data);
      setSummary(sumRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  const handleLogin = (userData) => setUser(userData);

  const handleLogout = () => {
    localStorage.removeItem("mm_token");
    setUser(null);
    setTransactions([]);
    setSummary(null);
  };

  const handleAddTransaction = (tx) => {
    setTransactions((prev) => [tx, ...prev]);
    fetchData(); // refresh summary
  };

  const handleDelete = async (id) => {
    if (!confirm("Remover esta transação?")) return;
    try {
      await api.delete(`/transactions/${id}`);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      fetchData();
    } catch (err) {
      alert("Erro ao remover");
    }
  };

  if (!initialized) return null;
  if (!user) return <AuthPage onLogin={handleLogin} />;

  const pieColors = Object.values(CATEGORY_COLORS);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen relative">
      <div className="glow-bg" />
      <div className="glow-bg-2" />

      {showModal && (
        <AddTransactionModal
          onClose={() => setShowModal(false)}
          onAdd={handleAddTransaction}
        />
      )}

      {/* ── Sidebar / Nav ────────────────────────────────────────────────── */}
      <div className="flex min-h-screen relative z-10">
        <aside className="hidden md:flex flex-col w-60 p-5 gap-2 border-r border-white/5">
          {/* Brand */}
          <div className="flex items-center gap-2.5 px-2 mb-6 mt-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold" style={{ fontFamily: 'Syne' }}>M</span>
            </div>
            <span className="text-lg font-bold text-white" style={{ fontFamily: 'Syne' }}>
              Mind<span className="text-green-400">Money</span>
            </span>
          </div>

          {/* Nav links */}
          {[
            { id: "dashboard", icon: "◈", label: "Dashboard" },
            { id: "transactions", icon: "⟳", label: "Transações" },
            { id: "insights", icon: "◎", label: "IA Insights" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-left"
              style={{
                fontFamily: 'DM Sans',
                background: activeTab === item.id ? 'rgba(74,222,128,0.1)' : 'transparent',
                color: activeTab === item.id ? '#4ade80' : '#64748b',
                borderLeft: activeTab === item.id ? '2px solid #4ade80' : '2px solid transparent',
              }}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}

          <div className="flex-1" />

          {/* Add button */}
          <button
            className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-sm"
            onClick={() => setShowModal(true)}
          >
            <span className="text-lg leading-none">+</span> Nova Transação
          </button>

          {/* User */}
          <div className="mt-3 px-3 py-3 rounded-xl bg-slate-900/50 border border-white/5">
            <p className="text-xs font-semibold text-white truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
            <button
              onClick={handleLogout}
              className="text-xs text-slate-500 hover:text-red-400 transition-colors mt-1.5"
            >
              Sair →
            </button>
          </div>
        </aside>

        {/* ── Main Content ─────────────────────────────────────────────────── */}
        <main className="flex-1 p-5 md:p-8 overflow-auto">
          {/* Mobile header */}
          <div className="flex items-center justify-between mb-6 md:hidden">
            <span className="text-lg font-bold text-white" style={{ fontFamily: 'Syne' }}>
              Mind<span className="text-green-400">Money</span>
            </span>
            <button className="btn-primary py-2 px-4 text-sm" onClick={() => setShowModal(true)}>
              + Novo
            </button>
          </div>

          {/* Mobile bottom nav */}
          <div className="fixed bottom-0 left-0 right-0 md:hidden z-20 border-t border-white/5"
            style={{ background: 'rgba(5,8,16,0.95)', backdropFilter: 'blur(12px)' }}>
            <div className="flex">
              {[
                { id: "dashboard", icon: "◈", label: "Dashboard" },
                { id: "transactions", icon: "⟳", label: "Transações" },
                { id: "insights", icon: "◎", label: "Insights" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className="flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors"
                  style={{ color: activeTab === item.id ? '#4ade80' : '#475569' }}
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── DASHBOARD TAB ─────────────────────────────────────────────── */}
          {activeTab === "dashboard" && (
            <div className="pb-20 md:pb-0">
              <div className="mb-7 animate-fade-up">
                <p className="text-slate-400 text-sm mb-0.5">Bem-vindo de volta,</p>
                <h1 className="text-2xl font-bold text-white">{user.name} 👋</h1>
              </div>

              {/* KPI Cards */}
              {loadingData ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  {[0,1,2].map(i => (
                    <div key={i} className="glass-card p-5 h-24 animate-pulse" style={{ animationDelay: `${i*0.1}s` }} />
                  ))}
                </div>
              ) : summary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  {[
                    { label: "Saldo Total", value: summary.balance, color: summary.balance >= 0 ? '#4ade80' : '#f87171', sub: "Receitas - Gastos" },
                    { label: "Total Receitas", value: summary.totalIncome, color: '#4ade80', sub: "No período" },
                    { label: "Total Gastos", value: summary.totalExpenses, color: '#f87171', sub: "No período" },
                  ].map((card, i) => (
                    <div key={i} className={`glass-card glass-card-hover p-5 animate-fade-up stagger-${i+1}`}>
                      <p className="label">{card.label}</p>
                      <p className="text-2xl font-bold mt-1" style={{ color: card.color, fontFamily: 'Syne' }}>
                        {fmt(card.value)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Charts Row */}
              {summary && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                  {/* Area chart */}
                  <div className="glass-card p-5 lg:col-span-2 animate-fade-up stagger-3">
                    <h3 className="font-bold text-white mb-4 text-sm">Evolução Mensal</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={summary.monthlyData}>
                        <defs>
                          <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="month" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="receitas" name="Receitas" stroke="#4ade80" fill="url(#colorReceitas)" strokeWidth={2} dot={false} />
                        <Area type="monotone" dataKey="gastos" name="Gastos" stroke="#f87171" fill="url(#colorGastos)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Pie chart */}
                  <div className="glass-card p-5 animate-fade-up stagger-4">
                    <h3 className="font-bold text-white mb-4 text-sm">Gastos por Categoria</h3>
                    {summary.categoryData.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={140}>
                          <PieChart>
                            <Pie
                              data={summary.categoryData}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={65}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {summary.categoryData.map((entry, index) => (
                                <Cell key={index} fill={CATEGORY_COLORS[entry.name] || pieColors[index % pieColors.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v) => fmt(v)} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="space-y-1.5 mt-2">
                          {summary.categoryData.slice(0, 4).map((cat, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[cat.name] || pieColors[i] }} />
                                <span className="text-slate-400">{cat.name}</span>
                              </div>
                              <span className="text-slate-300 font-medium">{fmt(cat.value)}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-slate-500 text-sm text-center py-8">Sem dados de gastos</p>
                    )}
                  </div>
                </div>
              )}

              {/* Insight summary on dashboard */}
              {summary && (
                <div className="animate-fade-up stagger-5">
                  <InsightCard insight={summary.insight} />
                </div>
              )}
            </div>
          )}

          {/* ── TRANSACTIONS TAB ──────────────────────────────────────────── */}
          {activeTab === "transactions" && (
            <div className="pb-20 md:pb-0">
              <div className="flex items-center justify-between mb-6 animate-fade-up">
                <div>
                  <h1 className="text-2xl font-bold text-white">Transações</h1>
                  <p className="text-slate-400 text-sm mt-0.5">{transactions.length} registros</p>
                </div>
                <button className="btn-primary hidden md:flex items-center gap-2" onClick={() => setShowModal(true)}>
                  <span className="text-lg leading-none">+</span> Adicionar
                </button>
              </div>

              {loadingData ? (
                <div className="space-y-3">
                  {[0,1,2,3].map(i => <div key={i} className="glass-card h-16 animate-pulse" />)}
                </div>
              ) : transactions.length === 0 ? (
                <div className="glass-card p-10 text-center animate-fade-up">
                  <p className="text-4xl mb-3">📭</p>
                  <p className="text-white font-semibold">Nenhuma transação ainda</p>
                  <p className="text-slate-400 text-sm mt-1">Adicione sua primeira transação acima</p>
                </div>
              ) : (
                <div className="space-y-2 animate-fade-up">
                  {transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="glass-card glass-card-hover p-4 flex items-center gap-4"
                    >
                      {/* Category dot */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                        style={{ background: `${CATEGORY_COLORS[tx.category] || '#94a3b8'}20` }}
                      >
                        {tx.type === "income" ? "💰" : "💸"}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm truncate">
                          {tx.description || tx.category}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className="tag"
                            style={{
                              background: `${CATEGORY_COLORS[tx.category] || '#94a3b8'}20`,
                              color: CATEGORY_COLORS[tx.category] || '#94a3b8',
                            }}
                          >
                            {tx.category}
                          </span>
                          <span className="text-xs text-slate-500">
                            {new Date(tx.date + "T00:00:00").toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <p
                          className="font-bold text-base"
                          style={{
                            fontFamily: 'Syne',
                            color: tx.type === "income" ? "#4ade80" : "#f87171",
                          }}
                        >
                          {tx.type === "income" ? "+" : "-"}{fmt(tx.amount)}
                        </p>
                        <button
                          onClick={() => handleDelete(tx.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── INSIGHTS TAB ──────────────────────────────────────────────── */}
          {activeTab === "insights" && (
            <div className="pb-20 md:pb-0">
              <div className="mb-7 animate-fade-up">
                <h1 className="text-2xl font-bold text-white">IA Insights</h1>
                <p className="text-slate-400 text-sm mt-0.5">Análise comportamental dos seus gastos</p>
              </div>

              {summary ? (
                <div className="space-y-4">
                  {/* Main insight */}
                  <InsightCard insight={summary.insight} />

                  {/* Breakdown */}
                  <div className="glass-card p-5 animate-fade-up stagger-2">
                    <h3 className="font-bold text-white mb-4">📊 Análise por Categoria</h3>
                    <div className="space-y-3">
                      {summary.categoryData.length > 0 ? (
                        summary.categoryData.map((cat, i) => {
                          const pct = summary.totalExpenses > 0
                            ? ((cat.value / summary.totalExpenses) * 100).toFixed(1)
                            : 0;
                          return (
                            <div key={i}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-slate-300 flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: CATEGORY_COLORS[cat.name] || '#94a3b8' }} />
                                  {cat.name}
                                </span>
                                <span className="text-slate-400 font-medium">{fmt(cat.value)} <span className="text-slate-500">({pct}%)</span></span>
                              </div>
                              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{
                                    width: `${pct}%`,
                                    background: CATEGORY_COLORS[cat.name] || '#94a3b8',
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-slate-500 text-sm">Sem dados de gastos para analisar.</p>
                      )}
                    </div>
                  </div>

                  {/* Savings rate card */}
                  <div className="glass-card p-5 animate-fade-up stagger-3">
                    <h3 className="font-bold text-white mb-3">💡 Taxa de Poupança</h3>
                    {summary.totalIncome > 0 ? (
                      <>
                        <div className="flex items-end gap-2 mb-2">
                          <span className="text-4xl font-bold text-green-400" style={{ fontFamily: 'Syne' }}>
                            {((( summary.totalIncome - summary.totalExpenses) / summary.totalIncome) * 100).toFixed(1)}%
                          </span>
                          <span className="text-slate-400 text-sm mb-1">da renda</span>
                        </div>
                        <p className="text-slate-400 text-sm">
                          {(((summary.totalIncome - summary.totalExpenses) / summary.totalIncome) * 100) >= 20
                            ? "✅ Excelente! Você está acima da meta de 20% de poupança."
                            : (((summary.totalIncome - summary.totalExpenses) / summary.totalIncome) * 100) >= 10
                            ? "⚡ Você está poupando, mas pode melhorar. Meta: 20% da renda."
                            : "⚠️ Sua taxa de poupança está abaixo do recomendado (20%)."}
                        </p>
                      </>
                    ) : (
                      <p className="text-slate-500 text-sm">Adicione receitas para calcular sua taxa de poupança.</p>
                    )}
                  </div>

                  {/* Bar chart by category */}
                  {summary.categoryData.length > 0 && (
                    <div className="glass-card p-5 animate-fade-up stagger-4">
                      <h3 className="font-bold text-white mb-4">📈 Distribuição de Gastos</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={summary.categoryData} barSize={28}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                          <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="value" name="Gasto" radius={[6, 6, 0, 0]}>
                            {summary.categoryData.map((entry, index) => (
                              <Cell key={index} fill={CATEGORY_COLORS[entry.name] || pieColors[index % pieColors.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ) : (
                <div className="glass-card p-10 text-center animate-fade-up">
                  <p className="text-4xl mb-3">🤖</p>
                  <p className="text-white font-semibold">Carregando insights...</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
