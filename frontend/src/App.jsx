import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API_URL = import.meta.env.VITE_API_URL || "https://mindmoney-production.up.railway.app";
const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("mm_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const fmt = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const CATEGORY_COLORS = {
  Moradia:"#818cf8", Alimentação:"#fb923c", Transporte:"#38bdf8",
  Lazer:"#f472b6", Saúde:"#34d399", Educação:"#fbbf24",
  Salário:"#4ade80", Freelance:"#a78bfa", Outros:"#94a3b8",
};
const EXPENSE_CATEGORIES = ["Moradia","Alimentação","Transporte","Lazer","Saúde","Educação","Outros"];
const INCOME_CATEGORIES  = ["Salário","Freelance","Outros"];

// ── Theme ─────────────────────────────────────────────────────────────────────
const DARK = {
  bg: "#050810", card: "rgba(15,23,42,0.7)", border: "rgba(74,222,128,0.1)",
  text: "#e2e8f0", muted: "#64748b", sidebar: "rgba(5,8,16,0.95)",
};
const LIGHT = {
  bg: "#f0fdf4", card: "rgba(255,255,255,0.9)", border: "rgba(34,197,94,0.2)",
  text: "#0f172a", muted: "#64748b", sidebar: "rgba(240,253,244,0.98)",
};

// ── PDF Export ────────────────────────────────────────────────────────────────
function exportPDF(user, summary, transactions, filters) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(10,15,30);
  doc.rect(0,0,pageW,40,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(22); doc.setTextColor(34,197,94);
  doc.text("MindMoney",14,18);
  doc.setFontSize(10); doc.setTextColor(148,163,184);
  doc.text("Relatório Financeiro Comportamental",14,26);
  doc.setFontSize(9); doc.setTextColor(100,116,139);
  const now = new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"});
  doc.text(`Gerado em ${now}`,14,34);
  doc.text(`Usuário: ${user.name} (${user.email})`,pageW-14,34,{align:"right"});
  if (filters.startDate||filters.endDate) doc.text(`Período: ${filters.startDate||"início"} até ${filters.endDate||"hoje"}`,pageW/2,34,{align:"center"});
  let y=50;
  const kpis=[
    {label:"Saldo Total",value:summary.balance,color:summary.balance>=0?[34,197,94]:[248,113,113]},
    {label:"Total Receitas",value:summary.totalIncome,color:[34,197,94]},
    {label:"Total Gastos",value:summary.totalExpenses,color:[248,113,113]},
  ];
  const cardW=(pageW-28-8)/3;
  kpis.forEach((kpi,i)=>{
    const x=14+i*(cardW+4);
    doc.setFillColor(15,23,42); doc.roundedRect(x,y,cardW,22,3,3,"F");
    doc.setFontSize(8); doc.setTextColor(100,116,139); doc.text(kpi.label.toUpperCase(),x+4,y+8);
    doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(...kpi.color);
    doc.text(fmt(kpi.value),x+4,y+17); doc.setFont("helvetica","normal");
  });
  y+=32;
  if (summary.totalIncome>0) {
    const rate=((summary.totalIncome-summary.totalExpenses)/summary.totalIncome*100).toFixed(1);
    doc.setFillColor(15,23,42); doc.roundedRect(14,y,pageW-28,14,3,3,"F");
    doc.setFontSize(9); doc.setTextColor(148,163,184); doc.text("Taxa de Poupança: ",18,y+9);
    doc.setTextColor(34,197,94); doc.setFont("helvetica","bold"); doc.text(`${rate}%`,60,y+9);
    doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
    const msg=parseFloat(rate)>=20?"✓ Excelente!":parseFloat(rate)>=10?"⚡ Pode melhorar.":"⚠ Abaixo do recomendado.";
    doc.text(msg,80,y+9); y+=22;
  }
  if (summary.insight) {
    doc.setFillColor(15,23,42); doc.roundedRect(14,y,pageW-28,18,3,3,"F");
    doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(56,189,248);
    doc.text(summary.insight.title,18,y+7);
    doc.setFont("helvetica","normal"); doc.setTextColor(148,163,184);
    doc.text(doc.splitTextToSize(summary.insight.message,pageW-44)[0]||"",18,y+13); y+=26;
  }
  if (summary.categoryData?.length>0) {
    doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(255,255,255);
    doc.text("Gastos por Categoria",14,y); y+=4;
    autoTable(doc,{startY:y,head:[["Categoria","Valor","% do Total"]],
      body:summary.categoryData.map(c=>[c.name,fmt(c.value),summary.totalExpenses>0?((c.value/summary.totalExpenses)*100).toFixed(1)+"%":"0%"]),
      styles:{fontSize:9,cellPadding:4,fillColor:[15,23,42],textColor:[226,232,240]},
      headStyles:{fillColor:[34,197,94],textColor:[10,15,30],fontStyle:"bold"},
      alternateRowStyles:{fillColor:[20,30,50]},margin:{left:14,right:14}});
    y=doc.lastAutoTable.finalY+12;
  }
  if (transactions?.length>0) {
    if (y>220){doc.addPage();y=20;}
    doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(255,255,255);
    doc.text("Extrato de Transações",14,y); y+=4;
    autoTable(doc,{startY:y,head:[["Data","Descrição","Categoria","Tipo","Valor"]],
      body:transactions.map(tx=>[new Date(tx.date+"T00:00:00").toLocaleDateString("pt-BR"),tx.description||tx.category,tx.category,tx.type==="income"?"Receita":"Gasto",(tx.type==="income"?"+":"-")+fmt(tx.amount)]),
      styles:{fontSize:8,cellPadding:3,fillColor:[15,23,42],textColor:[226,232,240]},
      headStyles:{fillColor:[30,41,59],textColor:[148,163,184],fontStyle:"bold"},
      alternateRowStyles:{fillColor:[20,30,50]},
      didParseCell:(data)=>{if(data.column.index===4&&data.section==="body"){const v=data.cell.raw||"";data.cell.styles.textColor=v.startsWith("+")?[34,197,94]:[248,113,113];}},
      margin:{left:14,right:14}});
  }
  const pageCount=doc.internal.getNumberOfPages();
  for(let i=1;i<=pageCount;i++){
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(71,85,105);
    doc.text("MindMoney — Relatório gerado automaticamente",14,doc.internal.pageSize.getHeight()-8);
    doc.text(`Página ${i} de ${pageCount}`,pageW-14,doc.internal.pageSize.getHeight()-8,{align:"right"});
  }
  doc.save(`mindmoney-relatorio-${new Date().toISOString().split("T")[0]}.pdf`);
}

// ── Notification Toast ────────────────────────────────────────────────────────
function NotificationToast({ notifications, onDismiss }) {
  if (!notifications.length) return null;
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((n, i) => (
        <div key={i} className="flex items-start gap-3 p-4 rounded-xl border shadow-lg animate-fade-up"
          style={{background:n.type==="danger"?"rgba(248,113,113,0.15)":"rgba(251,191,36,0.15)", borderColor:n.type==="danger"?"rgba(248,113,113,0.4)":"rgba(251,191,36,0.4)", backdropFilter:"blur(12px)"}}>
          <span className="text-lg">{n.type==="danger"?"🚨":"⚠️"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white" style={{fontFamily:"Syne"}}>{n.title}</p>
            <p className="text-xs mt-0.5" style={{color:n.type==="danger"?"#fca5a5":"#fde68a"}}>{n.message}</p>
          </div>
          <button onClick={()=>onDismiss(i)} className="text-slate-400 hover:text-white text-xs ml-1">✕</button>
        </div>
      ))}
    </div>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) return (
    <div className="glass-card p-3 text-sm" style={{minWidth:140}}>
      <p className="text-slate-300 font-semibold mb-1">{label}</p>
      {payload.map((p,i)=><p key={i} style={{color:p.color}}>{p.name}: {fmt(p.value)}</p>)}
    </div>
  );
  return null;
};

// ── Auth Page ─────────────────────────────────────────────────────────────────
function AuthPage({ onLogin, theme }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({email:"demo@mindmoney.com",password:"demo123",name:""});
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const {data} = await api.post(mode==="login"?"/api/auth/login":"/api/auth/register",form);
      localStorage.setItem("mm_token",data.token); onLogin(data.user);
    } catch(err){setError(err.response?.data?.error||"Erro ao autenticar");}
    finally{setLoading(false);}
  };
  const t = theme==="dark" ? DARK : LIGHT;
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{background:t.bg}}>
      <div className="glow-bg"/><div className="glow-bg-2"/>
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8 animate-fade-up">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg" style={{fontFamily:"Syne"}}>M</span>
            </div>
            <span className="text-2xl font-bold" style={{fontFamily:"Syne",color:t.text}}>Mind<span className="text-green-400">Money</span></span>
          </div>
          <p className="text-sm" style={{color:t.muted}}>Inteligência financeira comportamental</p>
        </div>
        <div className="glass-card p-8 animate-fade-up stagger-1" style={{background:t.card,borderColor:t.border}}>
          <div className="flex gap-1 rounded-xl p-1 mb-7" style={{background:theme==="dark"?"rgba(15,23,42,0.6)":"rgba(0,0,0,0.05)"}}>
            {["login","register"].map(m=>(
              <button key={m} onClick={()=>{setMode(m);setError("");}}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200"
                style={{fontFamily:"Syne",background:mode===m?"linear-gradient(135deg,#22c55e,#16a34a)":"transparent",color:mode===m?"white":t.muted}}>
                {m==="login"?"Entrar":"Cadastrar"}
              </button>
            ))}
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode==="register"&&<div><label className="label">Nome</label><input className="input-field" placeholder="Seu nome" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></div>}
            <div><label className="label">Email</label><input className="input-field" type="email" placeholder="seu@email.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required/></div>
            <div><label className="label">Senha</label><input className="input-field" type="password" placeholder="••••••••" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required/></div>
            {error&&<div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3">{error}</div>}
            <button type="submit" className="btn-primary w-full py-3 text-base mt-2" disabled={loading}>{loading?"Aguarde...":mode==="login"?"Entrar":"Criar conta"}</button>
          </form>
          {mode==="login"&&<p className="text-center text-xs mt-5" style={{color:t.muted}}>Demo: <span style={{color:t.text}}>demo@mindmoney.com / demo123</span></p>}
        </div>
      </div>
    </div>
  );
}

// ── Add Transaction Modal ─────────────────────────────────────────────────────
function AddTransactionModal({ onClose, onAdd }) {
  const [form, setForm] = useState({type:"expense",amount:"",category:"Alimentação",description:"",date:new Date().toISOString().split("T")[0]});
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const categories = form.type==="expense"?EXPENSE_CATEGORIES:INCOME_CATEGORIES;
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount||parseFloat(form.amount)<=0){setError("Informe um valor válido");return;}
    setLoading(true); setError("");
    try{const{data}=await api.post("/api/transactions",form);onAdd(data);onClose();}
    catch(err){setError(err.response?.data?.error||"Erro ao salvar");}
    finally{setLoading(false);}
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(5,8,16,0.85)",backdropFilter:"blur(8px)"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="glass-card p-6 w-full max-w-md animate-fade-up">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">Nova Transação</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors">✕</button>
        </div>
        <div className="flex gap-2 mb-5">
          {["expense","income"].map(t=>(
            <button key={t} onClick={()=>setForm({...form,type:t,category:t==="expense"?"Alimentação":"Salário"})}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 border"
              style={{fontFamily:"Syne",background:form.type===t?(t==="expense"?"rgba(248,113,113,0.15)":"rgba(74,222,128,0.15)"):"transparent",borderColor:form.type===t?(t==="expense"?"rgba(248,113,113,0.5)":"rgba(74,222,128,0.5)"):"rgba(148,163,184,0.15)",color:form.type===t?(t==="expense"?"#f87171":"#4ade80"):"#64748b"}}>
              {t==="expense"?"💸 Gasto":"💰 Receita"}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Valor (R$)</label><input className="input-field" type="number" step="0.01" min="0.01" placeholder="0,00" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} required/></div>
            <div><label className="label">Data</label><input className="input-field" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required/></div>
          </div>
          <div><label className="label">Categoria</label>
            <select className="input-field" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
              {categories.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="label">Descrição (opcional)</label><input className="input-field" placeholder="Ex: Supermercado Extra" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>
          {error&&<div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3">{error}</div>}
          <div className="flex gap-3 pt-1">
            <button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading?"Salvando...":"Adicionar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ── Edit Transaction Modal ────────────────────────────────────────────────────
function EditTransactionModal({ transaction, onClose, onSave }) {
  const [form, setForm] = useState({
    type: transaction.type,
    amount: transaction.amount,
    category: transaction.category,
    description: transaction.description || "",
    date: transaction.date,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const categories = form.type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) { setError("Informe um valor válido"); return; }
    setLoading(true); setError("");
    try {
      const { data } = await api.patch(`/api/transactions/${transaction.id}`, form);
      onSave(data); onClose();
    } catch(err) { setError(err.response?.data?.error || "Erro ao salvar"); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{background:"rgba(5,8,16,0.85)",backdropFilter:"blur(8px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="glass-card p-6 w-full max-w-md animate-fade-up">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">✏️ Editar Transação</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors">✕</button>
        </div>
        <div className="flex gap-2 mb-5">
          {["expense","income"].map(t => (
            <button key={t} onClick={() => setForm({...form, type:t, category:t==="expense"?"Alimentação":"Salário"})}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 border"
              style={{fontFamily:"Syne", background:form.type===t?(t==="expense"?"rgba(248,113,113,0.15)":"rgba(74,222,128,0.15)"):"transparent", borderColor:form.type===t?(t==="expense"?"rgba(248,113,113,0.5)":"rgba(74,222,128,0.5)"):"rgba(148,163,184,0.15)", color:form.type===t?(t==="expense"?"#f87171":"#4ade80"):"#64748b"}}>
              {t==="expense"?"💸 Gasto":"💰 Receita"}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Valor (R$)</label>
              <input className="input-field" type="number" step="0.01" min="0.01" value={form.amount}
                onChange={e=>setForm({...form,amount:e.target.value})} required/>
            </div>
            <div><label className="label">Data</label>
              <input className="input-field" type="date" value={form.date}
                onChange={e=>setForm({...form,date:e.target.value})} required/>
            </div>
          </div>
          <div><label className="label">Categoria</label>
            <select className="input-field" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
              {categories.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="label">Descrição</label>
            <input className="input-field" placeholder="Ex: Supermercado Extra" value={form.description}
              onChange={e=>setForm({...form,description:e.target.value})}/>
          </div>
          {error && <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg p-3">{error}</div>}
          <div className="flex gap-3 pt-1">
            <button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading?"Salvando...":"Salvar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Period Filter ─────────────────────────────────────────────────────────────
function PeriodFilter({ filters, onChange }) {
  const presets=[{label:"Este mês",value:"thisMonth"},{label:"Mês passado",value:"lastMonth"},{label:"3 meses",value:"last3"},{label:"Este ano",value:"thisYear"},{label:"Tudo",value:"all"}];
  const applyPreset=(preset)=>{
    const now=new Date(); let startDate="",endDate="";
    if(preset==="thisMonth"){startDate=new Date(now.getFullYear(),now.getMonth(),1).toISOString().split("T")[0];endDate=new Date(now.getFullYear(),now.getMonth()+1,0).toISOString().split("T")[0];}
    else if(preset==="lastMonth"){startDate=new Date(now.getFullYear(),now.getMonth()-1,1).toISOString().split("T")[0];endDate=new Date(now.getFullYear(),now.getMonth(),0).toISOString().split("T")[0];}
    else if(preset==="last3"){startDate=new Date(now.getFullYear(),now.getMonth()-2,1).toISOString().split("T")[0];endDate=new Date(now.getFullYear(),now.getMonth()+1,0).toISOString().split("T")[0];}
    else if(preset==="thisYear"){startDate=`${now.getFullYear()}-01-01`;endDate=`${now.getFullYear()}-12-31`;}
    onChange({startDate,endDate,preset});
  };
  return (
    <div className="glass-card p-4 mb-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Período:</span>
        <div className="flex flex-wrap gap-2">
          {presets.map(p=>(
            <button key={p.value} onClick={()=>applyPreset(p.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
              style={{fontFamily:"Syne",background:filters.preset===p.value?"linear-gradient(135deg,#22c55e,#16a34a)":"rgba(255,255,255,0.05)",color:filters.preset===p.value?"white":"#64748b"}}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <input type="date" className="input-field text-xs py-1.5" style={{width:130}} value={filters.startDate} onChange={e=>onChange({...filters,startDate:e.target.value,preset:"custom"})}/>
          <span className="text-slate-500 text-xs">até</span>
          <input type="date" className="input-field text-xs py-1.5" style={{width:130}} value={filters.endDate} onChange={e=>onChange({...filters,endDate:e.target.value,preset:"custom"})}/>
        </div>
      </div>
    </div>
  );
}

// ── Insight Card ──────────────────────────────────────────────────────────────
function InsightCard({ insight }) {
  if (!insight) return null;
  const styles={positive:{border:"rgba(74,222,128,0.3)",bg:"rgba(74,222,128,0.07)",dot:"#4ade80"},warning:{border:"rgba(251,191,36,0.3)",bg:"rgba(251,191,36,0.07)",dot:"#fbbf24"},danger:{border:"rgba(248,113,113,0.3)",bg:"rgba(248,113,113,0.07)",dot:"#f87171"},info:{border:"rgba(56,189,248,0.3)",bg:"rgba(56,189,248,0.07)",dot:"#38bdf8"}};
  const s=styles[insight.type]||styles.info;
  return (
    <div className="rounded-2xl p-5 border" style={{background:s.bg,borderColor:s.border}}>
      <div className="flex items-start gap-3">
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1" style={{background:s.dot,boxShadow:`0 0 8px ${s.dot}`}}/>
        <div><p className="font-bold text-white mb-1" style={{fontFamily:"Syne"}}>{insight.title}</p><p className="text-sm text-slate-300 leading-relaxed">{insight.message}</p></div>
      </div>
    </div>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────
function ProfileTab({ user, onUpdate, onLogout, theme, onThemeToggle }) {
  const [nameForm, setNameForm] = useState({ name: user.name });
  const [passForm, setPassForm] = useState({ currentPassword:"", newPassword:"", confirm:"" });
  const [nameMsg, setNameMsg] = useState("");
  const [passMsg, setPassMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleNameSave = async (e) => {
    e.preventDefault(); setLoading(true); setNameMsg("");
    try {
      const { data } = await api.patch("/api/profile", { name: nameForm.name });
      localStorage.setItem("mm_token", data.token);
      onUpdate(data.user);
      setNameMsg("✅ Nome atualizado!");
    } catch(err) { setNameMsg("❌ " + (err.response?.data?.error||"Erro")); }
    finally { setLoading(false); }
  };

  const handlePassSave = async (e) => {
    e.preventDefault();
    if (passForm.newPassword !== passForm.confirm) { setPassMsg("❌ As senhas não coincidem"); return; }
    if (passForm.newPassword.length < 4) { setPassMsg("❌ Senha muito curta (mín. 4 caracteres)"); return; }
    setLoading(true); setPassMsg("");
    try {
      await api.patch("/api/profile", { currentPassword: passForm.currentPassword, newPassword: passForm.newPassword });
      setPassMsg("✅ Senha alterada com sucesso!");
      setPassForm({ currentPassword:"", newPassword:"", confirm:"" });
    } catch(err) { setPassMsg("❌ " + (err.response?.data?.error||"Erro")); }
    finally { setLoading(false); }
  };

  const initials = user.name.split(" ").map(n=>n[0]).join("").toUpperCase().slice(0,2);

  return (
    <div className="pb-20 md:pb-0 max-w-lg">
      <div className="mb-6 animate-fade-up">
        <h1 className="text-2xl font-bold text-white">Meu Perfil</h1>
        <p className="text-slate-400 text-sm mt-0.5">Gerencie suas informações pessoais</p>
      </div>

      {/* Avatar */}
      <div className="glass-card p-6 mb-4 animate-fade-up stagger-1">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-2xl font-bold" style={{fontFamily:"Syne"}}>{initials}</span>
          </div>
          <div>
            <p className="text-xl font-bold text-white" style={{fontFamily:"Syne"}}>{user.name}</p>
            <p className="text-slate-400 text-sm">{user.email}</p>
          </div>
        </div>
      </div>

      {/* Theme Toggle */}
      <div className="glass-card p-5 mb-4 animate-fade-up stagger-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-white" style={{fontFamily:"Syne"}}>Aparência</p>
            <p className="text-xs text-slate-400 mt-0.5">Alternar entre modo escuro e claro</p>
          </div>
          <button onClick={onThemeToggle}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-200"
            style={{background:theme==="dark"?"rgba(251,191,36,0.1)":"rgba(99,102,241,0.1)", borderColor:theme==="dark"?"rgba(251,191,36,0.3)":"rgba(99,102,241,0.3)", color:theme==="dark"?"#fbbf24":"#818cf8"}}>
            <span>{theme==="dark"?"☀️":"🌙"}</span>
            <span className="text-sm font-semibold" style={{fontFamily:"Syne"}}>{theme==="dark"?"Modo Claro":"Modo Escuro"}</span>
          </button>
        </div>
      </div>

      {/* Edit Name */}
      <div className="glass-card p-5 mb-4 animate-fade-up stagger-2">
        <h3 className="font-bold text-white mb-4" style={{fontFamily:"Syne"}}>✏️ Editar Nome</h3>
        <form onSubmit={handleNameSave} className="space-y-3">
          <div><label className="label">Nome completo</label><input className="input-field" value={nameForm.name} onChange={e=>setNameForm({name:e.target.value})} required/></div>
          {nameMsg && <p className="text-sm">{nameMsg}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>Salvar Nome</button>
        </form>
      </div>

      {/* Change Password */}
      <div className="glass-card p-5 mb-4 animate-fade-up stagger-3">
        <h3 className="font-bold text-white mb-4" style={{fontFamily:"Syne"}}>🔒 Alterar Senha</h3>
        <form onSubmit={handlePassSave} className="space-y-3">
          <div><label className="label">Senha atual</label><input className="input-field" type="password" placeholder="••••••••" value={passForm.currentPassword} onChange={e=>setPassForm({...passForm,currentPassword:e.target.value})} required/></div>
          <div><label className="label">Nova senha</label><input className="input-field" type="password" placeholder="••••••••" value={passForm.newPassword} onChange={e=>setPassForm({...passForm,newPassword:e.target.value})} required/></div>
          <div><label className="label">Confirmar nova senha</label><input className="input-field" type="password" placeholder="••••••••" value={passForm.confirm} onChange={e=>setPassForm({...passForm,confirm:e.target.value})} required/></div>
          {passMsg && <p className="text-sm">{passMsg}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>Alterar Senha</button>
        </form>
      </div>

      {/* Logout */}
      <div className="glass-card p-5 animate-fade-up stagger-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-white" style={{fontFamily:"Syne"}}>Sair da conta</p>
            <p className="text-xs text-slate-400 mt-0.5">Encerrar sessão atual</p>
          </div>
          <button onClick={onLogout} className="px-4 py-2 rounded-xl border border-red-400/30 bg-red-400/10 text-red-400 text-sm font-semibold hover:bg-red-400/20 transition-all" style={{fontFamily:"Syne"}}>
            Sair →
          </button>
        </div>
      </div>
    </div>
  );
}



// ── Recurring Tab ─────────────────────────────────────────────────────────────
function RecurringTab({ allCategories }) {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({amount:"",category:"Alimentação",description:"",type:"expense",frequency:"monthly",next_date:new Date().toISOString().split("T")[0]});

  useEffect(() => { api.get("/api/recurring").then(r=>setItems(r.data)).catch(()=>{}); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    const {data} = await api.post("/api/recurring", form);
    setItems(p=>[data,...p]);
    setShowForm(false);
    setForm({amount:"",category:"Alimentação",description:"",type:"expense",frequency:"monthly",next_date:new Date().toISOString().split("T")[0]});
  };

  const handleDelete = async (id) => {
    await api.delete(`/api/recurring/${id}`);
    setItems(p=>p.filter(r=>r.id!==id));
  };

  const freqLabel = {daily:"Diário",weekly:"Semanal",monthly:"Mensal",yearly:"Anual"};
  const expCats = [...EXPENSE_CATEGORIES, ...allCategories.filter(c=>c.type==="expense").map(c=>c.name)];
  const incCats = [...INCOME_CATEGORIES, ...allCategories.filter(c=>c.type==="income").map(c=>c.name)];

  return (
    <div className="pb-20 md:pb-0">
      <div className="flex items-center justify-between mb-6 animate-fade-up">
        <div><h1 className="text-2xl font-bold text-white">📆 Recorrentes</h1><p className="text-slate-400 text-sm mt-0.5">{items.length} transação(ões) automática(s)</p></div>
        <button className="btn-primary flex items-center gap-2" onClick={()=>setShowForm(!showForm)}><span className="text-lg leading-none">+</span> Nova</button>
      </div>
      {showForm && (
        <div className="glass-card p-5 mb-5 animate-fade-up">
          <h3 className="font-bold text-white mb-4">Nova Transação Recorrente</h3>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="flex gap-2">
              {["expense","income"].map(t=>(
                <button key={t} type="button" onClick={()=>setForm({...form,type:t,category:t==="expense"?"Alimentação":"Salário"})}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all border"
                  style={{fontFamily:"Syne",background:form.type===t?(t==="expense"?"rgba(248,113,113,0.15)":"rgba(74,222,128,0.15)"):"transparent",borderColor:form.type===t?(t==="expense"?"rgba(248,113,113,0.5)":"rgba(74,222,128,0.5)"):"rgba(148,163,184,0.15)",color:form.type===t?(t==="expense"?"#f87171":"#4ade80"):"#64748b"}}>
                  {t==="expense"?"💸 Gasto":"💰 Receita"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Valor (R$)</label><input className="input-field" type="number" step="0.01" min="0.01" placeholder="0,00" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} required/></div>
              <div><label className="label">Frequência</label>
                <select className="input-field" value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})}>
                  <option value="daily">Diário</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                  <option value="yearly">Anual</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Categoria</label>
                <select className="input-field" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
                  {(form.type==="expense"?expCats:incCats).map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className="label">Próxima data</label><input className="input-field" type="date" value={form.next_date} onChange={e=>setForm({...form,next_date:e.target.value})} required/></div>
            </div>
            <div><label className="label">Descrição</label><input className="input-field" placeholder="Ex: Netflix, Aluguel..." value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>
            <div className="flex gap-3">
              <button type="button" className="btn-ghost flex-1" onClick={()=>setShowForm(false)}>Cancelar</button>
              <button type="submit" className="btn-primary flex-1">Criar</button>
            </div>
          </form>
        </div>
      )}
      {items.length===0?(
        <div className="glass-card p-10 text-center animate-fade-up"><p className="text-4xl mb-3">📆</p><p className="text-white font-semibold">Nenhuma recorrência</p><p className="text-slate-400 text-sm mt-1">Cadastre salário, aluguel, assinaturas...</p></div>
      ):(
        <div className="space-y-3 animate-fade-up">
          {items.map(item=>(
            <div key={item.id} className="glass-card glass-card-hover p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{background:`${CATEGORY_COLORS[item.category]||"#94a3b8"}20`}}>{item.type==="income"?"💰":"💸"}</div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">{item.description||item.category}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="tag" style={{background:`${CATEGORY_COLORS[item.category]||"#94a3b8"}20`,color:CATEGORY_COLORS[item.category]||"#94a3b8"}}>{item.category}</span>
                  <span className="tag" style={{background:"rgba(56,189,248,0.1)",color:"#38bdf8"}}>{freqLabel[item.frequency]}</span>
                  <span className="text-xs text-slate-500">Próx: {new Date(item.next_date+"T00:00:00").toLocaleDateString("pt-BR")}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className="font-bold" style={{fontFamily:"Syne",color:item.type==="income"?"#4ade80":"#f87171"}}>{item.type==="income"?"+":"-"}{fmt(item.amount)}</p>
                <button onClick={()=>handleDelete(item.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors text-sm">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Categories Tab ────────────────────────────────────────────────────────────
function CategoriesTab({ onUpdate }) {
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({name:"",color:"#94a3b8",type:"expense"});
  const [error, setError] = useState("");
  const COLORS = ["#818cf8","#f472b6","#fb923c","#34d399","#38bdf8","#fbbf24","#a78bfa","#f87171","#94a3b8","#4ade80"];

  useEffect(() => { api.get("/api/categories").then(r=>setCategories(r.data)).catch(()=>{}); }, []);

  const handleAdd = async (e) => {
    e.preventDefault(); setError("");
    try {
      const {data} = await api.post("/api/categories", form);
      setCategories(p=>[...p,data]);
      setShowForm(false);
      setForm({name:"",color:"#94a3b8",type:"expense"});
      if (onUpdate) onUpdate([...categories, data]);
    } catch(err) { setError(err.response?.data?.error||"Erro ao criar"); }
  };

  const handleDelete = async (id) => {
    await api.delete(`/api/categories/${id}`);
    const updated = categories.filter(c=>c.id!==id);
    setCategories(updated);
    if (onUpdate) onUpdate(updated);
  };

  const expCats = categories.filter(c=>c.type==="expense");
  const incCats = categories.filter(c=>c.type==="income");

  return (
    <div className="pb-20 md:pb-0">
      <div className="flex items-center justify-between mb-6 animate-fade-up">
        <div><h1 className="text-2xl font-bold text-white">🏷️ Categorias</h1><p className="text-slate-400 text-sm mt-0.5">Personalize suas categorias</p></div>
        <button className="btn-primary flex items-center gap-2" onClick={()=>setShowForm(!showForm)}><span className="text-lg leading-none">+</span> Nova</button>
      </div>
      {showForm && (
        <div className="glass-card p-5 mb-5 animate-fade-up">
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="flex gap-2">
              {["expense","income"].map(t=>(
                <button key={t} type="button" onClick={()=>setForm({...form,type:t})}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all border"
                  style={{fontFamily:"Syne",background:form.type===t?(t==="expense"?"rgba(248,113,113,0.15)":"rgba(74,222,128,0.15)"):"transparent",borderColor:form.type===t?(t==="expense"?"rgba(248,113,113,0.5)":"rgba(74,222,128,0.5)"):"rgba(148,163,184,0.15)",color:form.type===t?(t==="expense"?"#f87171":"#4ade80"):"#64748b"}}>
                  {t==="expense"?"💸 Gasto":"💰 Receita"}
                </button>
              ))}
            </div>
            <div><label className="label">Nome da categoria</label><input className="input-field" placeholder="Ex: Pets, Viagem..." value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></div>
            <div><label className="label">Cor</label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {COLORS.map(c=>(
                  <button key={c} type="button" onClick={()=>setForm({...form,color:c})}
                    className="w-7 h-7 rounded-full transition-all"
                    style={{background:c,outline:form.color===c?"3px solid white":"none",outlineOffset:"2px"}}/>
                ))}
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button type="button" className="btn-ghost flex-1" onClick={()=>setShowForm(false)}>Cancelar</button>
              <button type="submit" className="btn-primary flex-1">Criar</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[{title:"💸 Gastos",items:expCats},{title:"💰 Receitas",items:incCats}].map(group=>(
          <div key={group.title} className="glass-card p-5 animate-fade-up">
            <h3 className="font-bold text-white mb-4 text-sm">{group.title} — Personalizadas</h3>
            {group.items.length===0?(
              <p className="text-slate-500 text-sm text-center py-4">Nenhuma categoria personalizada ainda</p>
            ):(
              <div className="space-y-2">
                {group.items.map(cat=>(
                  <div key={cat.id} className="flex items-center justify-between p-3 rounded-xl" style={{background:"rgba(255,255,255,0.03)"}}>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full flex-shrink-0" style={{background:cat.color}}/>
                      <span className="text-white text-sm font-medium">{cat.name}</span>
                    </div>
                    <button onClick={()=>handleDelete(cat.id)} className="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:text-red-400 transition-colors text-xs">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="glass-card p-5 mt-4 animate-fade-up">
        <h3 className="font-bold text-white mb-4 text-sm">📋 Categorias Padrão</h3>
        <div className="flex flex-wrap gap-2">
          {[...EXPENSE_CATEGORIES,...INCOME_CATEGORIES].map(c=>(
            <span key={c} className="tag px-3 py-1.5" style={{background:`${CATEGORY_COLORS[c]||"#94a3b8"}20`,color:CATEGORY_COLORS[c]||"#94a3b8"}}>{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Comparison Tab ────────────────────────────────────────────────────────────
function ComparisonTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/comparison").then(r=>{setData(r.data);setLoading(false);}).catch(()=>setLoading(false));
  }, []);

  if (loading) return <div className="glass-card p-10 text-center"><p className="text-slate-400">Carregando...</p></div>;
  if (!data.length) return <div className="glass-card p-10 text-center"><p className="text-4xl mb-3">📊</p><p className="text-white font-semibold">Sem dados suficientes</p><p className="text-slate-400 text-sm mt-1">Adicione transações para ver o comparativo</p></div>;

  const best = [...data].sort((a,b)=>parseFloat(b.savingsRate)-parseFloat(a.savingsRate))[0];
  const worst = [...data].sort((a,b)=>parseFloat(a.savingsRate)-parseFloat(b.savingsRate))[0];

  return (
    <div className="pb-20 md:pb-0">
      <div className="mb-6 animate-fade-up">
        <h1 className="text-2xl font-bold text-white">📊 Comparativo Mensal</h1>
        <p className="text-slate-400 text-sm mt-0.5">Evolução dos últimos 6 meses</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-5 animate-fade-up">
        <div className="glass-card p-4" style={{borderColor:"rgba(74,222,128,0.2)"}}>
          <p className="text-xs text-slate-500 mb-1">🏆 Melhor mês</p>
          <p className="font-bold text-green-400" style={{fontFamily:"Syne"}}>{best.label}</p>
          <p className="text-xs text-slate-400 mt-0.5">Poupança: {best.savingsRate}%</p>
        </div>
        <div className="glass-card p-4" style={{borderColor:"rgba(248,113,113,0.2)"}}>
          <p className="text-xs text-slate-500 mb-1">📉 Mês mais difícil</p>
          <p className="font-bold text-red-400" style={{fontFamily:"Syne"}}>{worst.label}</p>
          <p className="text-xs text-slate-400 mt-0.5">Poupança: {worst.savingsRate}%</p>
        </div>
      </div>

      {/* Chart */}
      <div className="glass-card p-5 mb-5 animate-fade-up stagger-2">
        <h3 className="font-bold text-white mb-4 text-sm">Receitas vs Gastos</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} barGap={4} barSize={20}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
            <XAxis dataKey="label" tick={{fill:"#475569",fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:"#475569",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`}/>
            <Tooltip content={({active,payload,label})=>{
              if(active&&payload?.length) return (
                <div className="glass-card p-3 text-xs" style={{minWidth:160}}>
                  <p className="text-slate-300 font-semibold mb-2">{label}</p>
                  {payload.map((p,i)=><p key={i} style={{color:p.color}}>{p.name}: {fmt(p.value)}</p>)}
                </div>
              ); return null;
            }}/>
            <Bar dataKey="income" name="Receitas" fill="#4ade80" radius={[4,4,0,0]}/>
            <Bar dataKey="expense" name="Gastos" fill="#f87171" radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly table */}
      <div className="glass-card p-5 animate-fade-up stagger-3">
        <h3 className="font-bold text-white mb-4 text-sm">Detalhamento Mensal</h3>
        <div className="space-y-3">
          {data.slice().reverse().map((m,i)=>{
            const balance = m.income - m.expense;
            const rate = parseFloat(m.savingsRate);
            return (
              <div key={i} className="p-4 rounded-xl border" style={{background:"rgba(255,255,255,0.03)",borderColor:"rgba(255,255,255,0.06)"}}>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-bold text-white" style={{fontFamily:"Syne"}}>{m.label}</p>
                  <span className="text-xs px-2 py-1 rounded-lg font-semibold" style={{background:rate>=20?"rgba(74,222,128,0.15)":rate>=10?"rgba(251,191,36,0.15)":"rgba(248,113,113,0.15)",color:rate>=20?"#4ade80":rate>=10?"#fbbf24":"#f87171"}}>{rate}% poupado</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-slate-500">Receitas</p><p className="text-green-400 font-semibold mt-0.5">{fmt(m.income)}</p></div>
                  <div><p className="text-slate-500">Gastos</p><p className="text-red-400 font-semibold mt-0.5">{fmt(m.expense)}</p></div>
                  <div><p className="text-slate-500">Saldo</p><p className="font-semibold mt-0.5" style={{color:balance>=0?"#4ade80":"#f87171"}}>{fmt(balance)}</p></div>
                </div>
                <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{width:`${Math.min(rate,100)}%`,background:rate>=20?"#4ade80":rate>=10?"#fbbf24":"#f87171"}}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Cards Tab ─────────────────────────────────────────────────────────────────
const CARD_COLORS = ["#818cf8","#f472b6","#fb923c","#34d399","#38bdf8","#fbbf24","#a78bfa","#f87171"];

function CardsTab() {
  const [cards, setCards] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [cardData, setCardData] = useState(null);
  const [showTxForm, setShowTxForm] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0,7));
  const [form, setForm] = useState({name:"",limit_amount:"",closing_day:"",due_day:"",color:"#818cf8"});
  const [txForm, setTxForm] = useState({amount:"",category:"Alimentação",description:"",date:new Date().toISOString().split("T")[0]});
  const [loadingCard, setLoadingCard] = useState(false);

  useEffect(() => { api.get("/api/cards").then(r => setCards(r.data)).catch(()=>{}); }, []);

  const loadCardData = async (card, month) => {
    setLoadingCard(true);
    try {
      const { data } = await api.get(`/api/cards/${card.id}/transactions`, { params: { month } });
      setCardData(data);
    } catch {}
    finally { setLoadingCard(false); }
  };

  const handleSelectCard = (card) => {
    setSelectedCard(card);
    loadCardData(card, selectedMonth);
  };

  const handleMonthChange = (month) => {
    setSelectedMonth(month);
    if (selectedCard) loadCardData(selectedCard, month);
  };

  const handleAddCard = async (e) => {
    e.preventDefault();
    const { data } = await api.post("/api/cards", form);
    setCards(p => [data, ...p]);
    setShowForm(false);
    setForm({name:"",limit_amount:"",closing_day:"",due_day:"",color:"#818cf8"});
  };

  const handleDeleteCard = async (id) => {
    if (!confirm("Excluir cartão e todas as transações?")) return;
    await api.delete(`/api/cards/${id}`);
    setCards(p => p.filter(c => c.id !== id));
    if (selectedCard?.id === id) { setSelectedCard(null); setCardData(null); }
  };

  const handleAddTx = async (e) => {
    e.preventDefault();
    await api.post(`/api/cards/${selectedCard.id}/transactions`, txForm);
    setShowTxForm(false);
    setTxForm({amount:"",category:"Alimentação",description:"",date:new Date().toISOString().split("T")[0]});
    loadCardData(selectedCard, selectedMonth);
  };

  const handleDeleteTx = async (txId) => {
    await api.delete(`/api/cards/${selectedCard.id}/transactions/${txId}`);
    loadCardData(selectedCard, selectedMonth);
  };

  const usedPct = cardData ? Math.min((cardData.total / cardData.card.limit_amount) * 100, 100) : 0;
  const isOver80 = usedPct >= 80;
  const isOver100 = usedPct >= 100;

  return (
    <div className="pb-20 md:pb-0">
      <div className="flex items-center justify-between mb-6 animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold text-white">💳 Cartões de Crédito</h1>
          <p className="text-slate-400 text-sm mt-0.5">{cards.length} cartão(ões) cadastrado(s)</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(!showForm)}>
          <span className="text-lg leading-none">+</span> Novo Cartão
        </button>
      </div>

      {/* Add Card Form */}
      {showForm && (
        <div className="glass-card p-5 mb-5 animate-fade-up">
          <h3 className="font-bold text-white mb-4">Novo Cartão</h3>
          <form onSubmit={handleAddCard} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Nome do Cartão</label><input className="input-field" placeholder="Ex: Nubank" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></div>
              <div><label className="label">Limite (R$)</label><input className="input-field" type="number" min="1" step="0.01" placeholder="5000" value={form.limit_amount} onChange={e=>setForm({...form,limit_amount:e.target.value})} required/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Dia de Fechamento</label><input className="input-field" type="number" min="1" max="31" placeholder="15" value={form.closing_day} onChange={e=>setForm({...form,closing_day:e.target.value})} required/></div>
              <div><label className="label">Dia de Vencimento</label><input className="input-field" type="number" min="1" max="31" placeholder="22" value={form.due_day} onChange={e=>setForm({...form,due_day:e.target.value})} required/></div>
            </div>
            <div>
              <label className="label">Cor do Cartão</label>
              <div className="flex gap-2 mt-1">
                {CARD_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm({...form,color:c})}
                    className="w-7 h-7 rounded-full transition-all duration-200"
                    style={{background:c, outline:form.color===c?"3px solid white":"none", outlineOffset:"2px"}}/>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" className="btn-ghost flex-1" onClick={()=>setShowForm(false)}>Cancelar</button>
              <button type="submit" className="btn-primary flex-1">Adicionar Cartão</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {cards.length === 0 ? (
          <div className="glass-card p-10 text-center col-span-2 animate-fade-up">
            <p className="text-4xl mb-3">💳</p>
            <p className="text-white font-semibold">Nenhum cartão cadastrado</p>
            <p className="text-slate-400 text-sm mt-1">Adicione seu primeiro cartão de crédito!</p>
          </div>
        ) : cards.map(card => (
          <div key={card.id}
            className="glass-card-hover rounded-2xl p-5 cursor-pointer transition-all duration-200 border"
            style={{background:`linear-gradient(135deg, ${card.color}22, ${card.color}11)`, borderColor:selectedCard?.id===card.id?card.color:"rgba(255,255,255,0.08)"}}
            onClick={() => handleSelectCard(card)}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-bold text-white text-lg" style={{fontFamily:"Syne"}}>{card.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">Fecha dia {card.closing_day} · Vence dia {card.due_day}</p>
              </div>
              <button onClick={e=>{e.stopPropagation();handleDeleteCard(card.id);}} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors text-sm">✕</button>
            </div>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Limite total</p>
                <p className="text-xl font-bold" style={{color:card.color, fontFamily:"Syne"}}>{fmt(card.limit_amount)}</p>
              </div>
              <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center" style={{borderColor:card.color}}>
                <span style={{color:card.color, fontSize:14}}>💳</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Card Detail */}
      {selectedCard && (
        <div className="glass-card p-5 animate-fade-up">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-white text-lg" style={{fontFamily:"Syne"}}>{selectedCard.name}</h3>
              <p className="text-xs text-slate-400">Fatura de {selectedMonth}</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="month" className="input-field text-xs py-1.5" style={{width:140}} value={selectedMonth} onChange={e=>handleMonthChange(e.target.value)}/>
              <button className="btn-primary py-2 px-3 text-xs flex items-center gap-1" onClick={()=>setShowTxForm(!showTxForm)}>
                <span>+</span> Lançamento
              </button>
            </div>
          </div>

          {/* Add Transaction Form */}
          {showTxForm && (
            <form onSubmit={handleAddTx} className="bg-slate-900/50 rounded-xl p-4 mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Valor (R$)</label><input className="input-field" type="number" step="0.01" min="0.01" placeholder="0,00" value={txForm.amount} onChange={e=>setTxForm({...txForm,amount:e.target.value})} required/></div>
                <div><label className="label">Data</label><input className="input-field" type="date" value={txForm.date} onChange={e=>setTxForm({...txForm,date:e.target.value})} required/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Categoria</label>
                  <select className="input-field" value={txForm.category} onChange={e=>setTxForm({...txForm,category:e.target.value})}>
                    {EXPENSE_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="label">Descrição</label><input className="input-field" placeholder="Ex: Restaurante" value={txForm.description} onChange={e=>setTxForm({...txForm,description:e.target.value})}/></div>
              </div>
              <div className="flex gap-3">
                <button type="button" className="btn-ghost flex-1 text-sm" onClick={()=>setShowTxForm(false)}>Cancelar</button>
                <button type="submit" className="btn-primary flex-1 text-sm">Adicionar</button>
              </div>
            </form>
          )}

          {/* Usage Bar */}
          {cardData && !loadingCard && (
            <>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">Fatura atual</span>
                <span className="font-bold" style={{color:isOver100?"#f87171":isOver80?"#fbbf24":selectedCard.color, fontFamily:"Syne"}}>{fmt(cardData.total)}</span>
              </div>
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden mb-1">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{width:`${usedPct}%`, background:isOver100?"#f87171":isOver80?"#fbbf24":selectedCard.color}}/>
              </div>
              <div className="flex justify-between text-xs text-slate-500 mb-4">
                <span>{usedPct.toFixed(1)}% utilizado</span>
                <span>Disponível: <span className="text-green-400 font-semibold">{fmt(Math.max(cardData.available,0))}</span></span>
              </div>

              {isOver100 && <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg p-2 mb-4">🚨 Limite ultrapassado! Revise seus gastos.</div>}
              {isOver80 && !isOver100 && <div className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-lg p-2 mb-4">⚠️ Você usou mais de 80% do limite do cartão.</div>}

              {/* Transactions List */}
              {cardData.transactions.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-6">Nenhum lançamento neste mês</p>
              ) : (
                <div className="space-y-2">
                  {cardData.transactions.map(tx => (
                    <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl" style={{background:"rgba(255,255,255,0.03)"}}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{background:`${CATEGORY_COLORS[tx.category]||"#94a3b8"}20`}}>💳</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{tx.description||tx.category}</p>
                        <div className="flex items-center gap-2">
                          <span className="tag" style={{background:`${CATEGORY_COLORS[tx.category]||"#94a3b8"}20`,color:CATEGORY_COLORS[tx.category]||"#94a3b8"}}>{tx.category}</span>
                          <span className="text-xs text-slate-500">{new Date(tx.date+"T00:00:00").toLocaleDateString("pt-BR")}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm text-red-400" style={{fontFamily:"Syne"}}>-{fmt(tx.amount)}</p>
                        <button onClick={()=>handleDeleteTx(tx.id)} className="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:text-red-400 transition-colors text-xs">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {loadingCard && <div className="text-center py-6"><p className="text-slate-400 text-sm">Carregando...</p></div>}
        </div>
      )}
    </div>
  );
}

// ── Goals Tab ─────────────────────────────────────────────────────────────────
function GoalsTab() {
  const [goals,setGoals]=useState([]); const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({title:"",target_amount:"",category:"",deadline:""});
  const [depositId,setDepositId]=useState(null); const [depositVal,setDepositVal]=useState("");
  useEffect(()=>{api.get("/api/goals").then(r=>setGoals(r.data)).catch(()=>{});}, []);
  const handleAdd=async(e)=>{e.preventDefault();const{data}=await api.post("/api/goals",form);setGoals(p=>[data,...p]);setShowForm(false);setForm({title:"",target_amount:"",category:"",deadline:""}); };
  const handleDeposit=async(goal)=>{const val=parseFloat(depositVal);if(!val||val<=0)return;const newVal=Math.min(goal.current_amount+val,goal.target_amount);const{data}=await api.patch(`/api/goals/${goal.id}`,{current_amount:newVal});setGoals(p=>p.map(g=>g.id===goal.id?data:g));setDepositId(null);setDepositVal("");};
  const handleDelete=async(id)=>{await api.delete(`/api/goals/${id}`);setGoals(p=>p.filter(g=>g.id!==id));};
  return (
    <div className="pb-20 md:pb-0">
      <div className="flex items-center justify-between mb-6 animate-fade-up">
        <div><h1 className="text-2xl font-bold text-white">Metas Financeiras</h1><p className="text-slate-400 text-sm mt-0.5">{goals.length} metas cadastradas</p></div>
        <button className="btn-primary flex items-center gap-2" onClick={()=>setShowForm(!showForm)}><span className="text-lg leading-none">+</span> Nova Meta</button>
      </div>
      {showForm&&(
        <div className="glass-card p-5 mb-5 animate-fade-up">
          <h3 className="font-bold text-white mb-4">Nova Meta</h3>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Título</label><input className="input-field" placeholder="Ex: Viagem" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required/></div>
              <div><label className="label">Valor Alvo (R$)</label><input className="input-field" type="number" min="1" step="0.01" placeholder="5000" value={form.target_amount} onChange={e=>setForm({...form,target_amount:e.target.value})} required/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Categoria</label><select className="input-field" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option value="">Geral</option>{[...EXPENSE_CATEGORIES,...INCOME_CATEGORIES].map(c=><option key={c} value={c}>{c}</option>)}</select></div>
              <div><label className="label">Prazo</label><input className="input-field" type="date" value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})}/></div>
            </div>
            <div className="flex gap-3"><button type="button" className="btn-ghost flex-1" onClick={()=>setShowForm(false)}>Cancelar</button><button type="submit" className="btn-primary flex-1">Criar Meta</button></div>
          </form>
        </div>
      )}
      {goals.length===0?(
        <div className="glass-card p-10 text-center animate-fade-up"><p className="text-4xl mb-3">🎯</p><p className="text-white font-semibold">Nenhuma meta ainda</p><p className="text-slate-400 text-sm mt-1">Crie sua primeira meta financeira!</p></div>
      ):(
        <div className="space-y-4 animate-fade-up">
          {goals.map(goal=>{
            const pct=Math.min((goal.current_amount/goal.target_amount)*100,100); const done=pct>=100;
            return (
              <div key={goal.id} className="glass-card glass-card-hover p-5">
                <div className="flex items-start justify-between mb-3">
                  <div><p className="font-bold text-white" style={{fontFamily:"Syne"}}>{done?"✅ ":"🎯 "}{goal.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {goal.category&&<span className="tag" style={{background:"rgba(74,222,128,0.1)",color:"#4ade80"}}>{goal.category}</span>}
                      {goal.deadline&&<span className="text-xs text-slate-500">Prazo: {new Date(goal.deadline+"T00:00:00").toLocaleDateString("pt-BR")}</span>}
                    </div>
                  </div>
                  <button onClick={()=>handleDelete(goal.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors text-sm">✕</button>
                </div>
                <div className="flex justify-between text-sm mb-2"><span className="text-slate-400">{fmt(goal.current_amount)} guardados</span><span className="text-white font-semibold">{fmt(goal.target_amount)}</span></div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-3"><div className="h-full rounded-full transition-all duration-700" style={{width:`${pct}%`,background:done?"linear-gradient(90deg,#4ade80,#22c55e)":"linear-gradient(90deg,#38bdf8,#818cf8)"}}/></div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold" style={{color:done?"#4ade80":"#38bdf8"}}>{pct.toFixed(1)}% concluído</span>
                  {!done&&(depositId===goal.id?(
                    <div className="flex items-center gap-2">
                      <input className="input-field text-xs py-1" style={{width:100}} type="number" min="1" step="0.01" placeholder="R$ valor" value={depositVal} onChange={e=>setDepositVal(e.target.value)}/>
                      <button className="btn-primary py-1 px-3 text-xs" onClick={()=>handleDeposit(goal)}>+</button>
                      <button className="btn-ghost py-1 px-3 text-xs" onClick={()=>{setDepositId(null);setDepositVal("");}}>✕</button>
                    </div>
                  ):(<button className="btn-ghost py-1 px-3 text-xs" onClick={()=>setDepositId(goal.id)}>+ Adicionar valor</button>))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Alerts Tab ────────────────────────────────────────────────────────────────
function AlertsTab({ summary }) {
  const [alerts,setAlerts]=useState([]); const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({category:"Alimentação",limit_amount:""});
  useEffect(()=>{api.get("/api/alerts").then(r=>setAlerts(r.data)).catch(()=>{});}, []);
  const handleAdd=async(e)=>{e.preventDefault();const{data}=await api.post("/api/alerts",form);setAlerts(p=>[data,...p]);setShowForm(false);setForm({category:"Alimentação",limit_amount:""});};
  const handleDelete=async(id)=>{await api.delete(`/api/alerts/${id}`);setAlerts(p=>p.filter(a=>a.id!==id));};
  const getCategorySpend=(cat)=>summary?.categoryData?.find(c=>c.name===cat)?.value||0;
  return (
    <div className="pb-20 md:pb-0">
      <div className="flex items-center justify-between mb-6 animate-fade-up">
        <div><h1 className="text-2xl font-bold text-white">Alertas de Limite</h1><p className="text-slate-400 text-sm mt-0.5">Seja avisado quando ultrapassar seu limite</p></div>
        <button className="btn-primary flex items-center gap-2" onClick={()=>setShowForm(!showForm)}><span className="text-lg leading-none">+</span> Novo Alerta</button>
      </div>
      {showForm&&(
        <div className="glass-card p-5 mb-5 animate-fade-up">
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Categoria</label><select className="input-field" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{EXPENSE_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
              <div><label className="label">Limite (R$)</label><input className="input-field" type="number" min="1" step="0.01" placeholder="500" value={form.limit_amount} onChange={e=>setForm({...form,limit_amount:e.target.value})} required/></div>
            </div>
            <div className="flex gap-3"><button type="button" className="btn-ghost flex-1" onClick={()=>setShowForm(false)}>Cancelar</button><button type="submit" className="btn-primary flex-1">Criar Alerta</button></div>
          </form>
        </div>
      )}
      {alerts.length===0?(
        <div className="glass-card p-10 text-center animate-fade-up"><p className="text-4xl mb-3">🔔</p><p className="text-white font-semibold">Nenhum alerta configurado</p><p className="text-slate-400 text-sm mt-1">Crie alertas para controlar seus gastos por categoria!</p></div>
      ):(
        <div className="space-y-3 animate-fade-up">
          {alerts.map(alert=>{
            const spent=getCategorySpend(alert.category); const pct=Math.min((spent/alert.limit_amount)*100,100);
            const exceeded=spent>alert.limit_amount; const warning=pct>=80&&!exceeded;
            return (
              <div key={alert.id} className="glass-card glass-card-hover p-5" style={{borderColor:exceeded?"rgba(248,113,113,0.3)":warning?"rgba(251,191,36,0.3)":"rgba(74,222,128,0.1)"}}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:`${CATEGORY_COLORS[alert.category]||"#94a3b8"}20`}}><span>{exceeded?"🚨":warning?"⚠️":"✅"}</span></div>
                    <div><p className="font-bold text-white" style={{fontFamily:"Syne"}}>{alert.category}</p><p className="text-xs text-slate-500">Limite: {fmt(alert.limit_amount)}</p></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-bold text-sm" style={{fontFamily:"Syne",color:exceeded?"#f87171":warning?"#fbbf24":"#4ade80"}}>{fmt(spent)}</p>
                    <button onClick={()=>handleDelete(alert.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors text-sm">✕</button>
                  </div>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-1"><div className="h-full rounded-full transition-all duration-700" style={{width:`${pct}%`,background:exceeded?"#f87171":warning?"#fbbf24":"#4ade80"}}/></div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{pct.toFixed(1)}% do limite usado</span>
                  {exceeded&&<span className="text-red-400 font-semibold">Ultrapassado em {fmt(spent-alert.limit_amount)}!</span>}
                  {warning&&<span className="text-yellow-400 font-semibold">Atenção! Quase no limite.</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ── Mobile Nav ────────────────────────────────────────────────────────────────
function MobileNav({ navItems, activeTab, setActiveTab, isDark }) {
  const [showMore, setShowMore] = useState(false);
  const mainTabs = navItems.slice(0, 4); // Dashboard, Transações, Cartões, Recorrentes
  const moreTabs = navItems.slice(4);    // Comparativo, Categorias, Metas, Alertas, Insights, Perfil

  const isMoreActive = moreTabs.some(t => t.id === activeTab);

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div className="fixed inset-0 z-30" onClick={() => setShowMore(false)}>
          <div className="fixed bottom-20 left-4 right-4 z-40 rounded-2xl p-3 border"
            style={{background:isDark?"rgba(10,15,30,0.98)":"rgba(240,253,244,0.98)",borderColor:"rgba(74,222,128,0.2)",backdropFilter:"blur(20px)"}}
            onClick={e=>e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-2">
              {moreTabs.map(item=>(
                <button key={item.id} onClick={()=>{setActiveTab(item.id);setShowMore(false);}}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all"
                  style={{background:activeTab===item.id?"rgba(74,222,128,0.15)":"rgba(255,255,255,0.04)",color:activeTab===item.id?"#4ade80":isDark?"#94a3b8":"#475569"}}>
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-xs font-medium" style={{fontFamily:"DM Sans"}}>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden z-20 border-t"
        style={{borderColor:"rgba(255,255,255,0.05)",background:isDark?"rgba(5,8,16,0.97)":"rgba(240,253,244,0.97)",backdropFilter:"blur(12px)",paddingBottom:"env(safe-area-inset-bottom)"}}>
        <div className="flex items-center h-16">
          {mainTabs.map(item=>(
            <button key={item.id} onClick={()=>{setActiveTab(item.id);setShowMore(false);}}
              className="flex-1 flex flex-col items-center gap-1 py-2 transition-colors"
              style={{color:activeTab===item.id?"#4ade80":"#475569"}}>
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px] font-medium" style={{fontFamily:"DM Sans"}}>{item.label}</span>
            </button>
          ))}
          {/* More button */}
          <button onClick={()=>setShowMore(!showMore)}
            className="flex-1 flex flex-col items-center gap-1 py-2 transition-colors"
            style={{color:isMoreActive||showMore?"#4ade80":"#475569"}}>
            <span className="text-xl">{showMore?"✕":"⋯"}</span>
            <span className="text-[10px] font-medium" style={{fontFamily:"DM Sans"}}>{isMoreActive ? moreTabs.find(t=>t.id===activeTab)?.label : "Mais"}</span>
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user,setUser]=useState(null); const [initialized,setInitialized]=useState(false);
  const [transactions,setTransactions]=useState([]); const [summary,setSummary]=useState(null);
  const [activeTab,setActiveTab]=useState("dashboard"); const [showModal,setShowModal]=useState(false);
  const [loadingData,setLoadingData]=useState(false);
  const [filters,setFilters]=useState({startDate:"",endDate:"",preset:"all"});
  const [search,setSearch]=useState("");
  const [editingTx,setEditingTx]=useState(null);
  const [customCategories,setCustomCategories]=useState([]);

  useEffect(()=>{ if(user) api.get("/api/categories").then(r=>setCustomCategories(r.data)).catch(()=>{}); },[user]);
  const [theme,setTheme]=useState(()=>localStorage.getItem("mm_theme")||"dark");
  const [notifications,setNotifications]=useState([]);

  useEffect(()=>{
    const token=localStorage.getItem("mm_token");
    if(token){try{const p=JSON.parse(atob(token.split(".")[1]));if(p.exp*1000>Date.now())setUser({id:p.id,email:p.email,name:p.name});else localStorage.removeItem("mm_token");}catch{localStorage.removeItem("mm_token");}}
    setInitialized(true);
  },[]);

  useEffect(()=>{
    localStorage.setItem("mm_theme",theme);
    document.body.style.backgroundColor = theme==="dark"?"#050810":"#f0fdf4";
    document.body.style.color = theme==="dark"?"#e2e8f0":"#0f172a";
  },[theme]);

  const checkAlerts = useCallback(async (summaryData) => {
    if (!summaryData?.categoryData) return;
    try {
      const {data: alerts} = await api.get("/api/alerts");
      const triggered = [];
      alerts.forEach(alert => {
        const spent = summaryData.categoryData.find(c=>c.name===alert.category)?.value||0;
        if (spent > alert.limit_amount) {
          triggered.push({type:"danger",title:`🚨 Limite ultrapassado: ${alert.category}`,message:`Você gastou ${fmt(spent)} de ${fmt(alert.limit_amount)} nesta categoria.`});
        } else if ((spent/alert.limit_amount)*100 >= 80) {
          triggered.push({type:"warning",title:`⚠️ Quase no limite: ${alert.category}`,message:`${((spent/alert.limit_amount)*100).toFixed(0)}% do limite de ${fmt(alert.limit_amount)} utilizado.`});
        }
      });
      if (triggered.length) setNotifications(triggered);
    } catch {}
  }, []);

  const fetchData = useCallback(async () => {
    if (!user) return; setLoadingData(true);
    try {
      const params={};
      if(filters.startDate) params.startDate=filters.startDate;
      if(filters.endDate) params.endDate=filters.endDate;
      const [txRes,sumRes]=await Promise.all([api.get("/api/transactions",{params}),api.get("/api/summary",{params})]);
      setTransactions(txRes.data); setSummary(sumRes.data);
      checkAlerts(sumRes.data);
    } catch(err){console.error(err);}
    finally{setLoadingData(false);}
  },[user,filters,checkAlerts]);

  useEffect(()=>{if(user)fetchData();},[user,fetchData]);

  const handleLogout=()=>{localStorage.removeItem("mm_token");setUser(null);setTransactions([]);setSummary(null);};
  const handleDelete=async(id)=>{if(!confirm("Remover esta transação?"))return;try{await api.delete(`/api/transactions/${id}`);fetchData();}catch{alert("Erro ao remover");}};

  if(!initialized) return null;
  if(!user) return <AuthPage onLogin={setUser} theme={theme}/>;

  const pieColors=Object.values(CATEGORY_COLORS);
  const navItems=[
    {id:"dashboard",icon:"◈",label:"Dashboard"},
    {id:"transactions",icon:"⟳",label:"Transações"},
    {id:"cards",icon:"💳",label:"Cartões"},
    {id:"recurring",icon:"📆",label:"Recorrentes"},
    {id:"comparison",icon:"📊",label:"Comparativo"},
    {id:"categories",icon:"🏷️",label:"Categorias"},
    {id:"goals",icon:"🎯",label:"Metas"},
    {id:"alerts",icon:"🔔",label:"Alertas"},
    {id:"insights",icon:"◎",label:"Insights"},
    {id:"profile",icon:"👤",label:"Perfil"},
  ];

  const isDark = theme==="dark";

  return (
    <div className="min-h-screen relative" style={{background:isDark?"#050810":"#f0fdf4"}}>
      {isDark&&<><div className="glow-bg"/><div className="glow-bg-2"/></>}
      <NotificationToast notifications={notifications} onDismiss={i=>setNotifications(p=>p.filter((_,idx)=>idx!==i))}/>
      {showModal&&<AddTransactionModal onClose={()=>setShowModal(false)} onAdd={fetchData}/>}
      {editingTx&&<EditTransactionModal transaction={editingTx} onClose={()=>setEditingTx(null)} onSave={()=>{setEditingTx(null);fetchData();}}/>}

      <div className="flex min-h-screen relative z-10">
        {/* Sidebar — icon only */}
        <aside className="hidden md:flex flex-col items-center w-16 py-5 gap-1 border-r flex-shrink-0" style={{borderColor:"rgba(255,255,255,0.05)",background:isDark?"rgba(5,8,16,0.6)":LIGHT.sidebar}}>
          {/* Logo */}
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center mb-5 flex-shrink-0">
            <span className="text-white font-bold text-base" style={{fontFamily:"Syne"}}>M</span>
          </div>

          {/* Nav icons */}
          {navItems.map(item=>(
            <div key={item.id} className="relative group w-full flex justify-center">
              <button onClick={()=>setActiveTab(item.id)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all duration-200"
                style={{background:activeTab===item.id?"rgba(74,222,128,0.15)":"transparent", color:activeTab===item.id?"#4ade80":isDark?"#64748b":"#94a3b8", boxShadow:activeTab===item.id?"inset 0 0 0 1.5px rgba(74,222,128,0.4)":"none"}}>
                {item.icon}
              </button>
              {/* Tooltip */}
              <div className="absolute left-14 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <div className="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap" style={{background:isDark?"rgba(15,23,42,0.95)":"rgba(255,255,255,0.95)", color:isDark?"#e2e8f0":"#0f172a", border:"1px solid rgba(255,255,255,0.08)", boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>
                  {item.label}
                </div>
              </div>
            </div>
          ))}

          <div className="flex-1"/>

          {/* Add button */}
          <div className="relative group w-full flex justify-center mb-1">
            <button onClick={()=>setShowModal(true)}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold transition-all duration-200"
              style={{background:"linear-gradient(135deg,#22c55e,#16a34a)", color:"white", boxShadow:"0 4px 12px rgba(34,197,94,0.3)"}}>
              +
            </button>
            <div className="absolute left-14 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <div className="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap" style={{background:isDark?"rgba(15,23,42,0.95)":"rgba(255,255,255,0.95)", color:isDark?"#e2e8f0":"#0f172a", border:"1px solid rgba(255,255,255,0.08)", boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>
                Nova Transação
              </div>
            </div>
          </div>

          {/* Theme + Logout */}
          <div className="relative group w-full flex justify-center">
            <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all duration-200 hover:bg-white/5">
              {isDark?"☀️":"🌙"}
            </button>
            <div className="absolute left-14 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <div className="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap" style={{background:isDark?"rgba(15,23,42,0.95)":"rgba(255,255,255,0.95)", color:isDark?"#e2e8f0":"#0f172a", border:"1px solid rgba(255,255,255,0.08)", boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>
                {isDark?"Modo Claro":"Modo Escuro"}
              </div>
            </div>
          </div>

          <div className="relative group w-full flex justify-center mt-1">
            <button onClick={()=>setActiveTab("profile")}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all duration-200 hover:bg-white/5"
              style={{background:activeTab==="profile"?"rgba(74,222,128,0.15)":"transparent"}}>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold" style={{fontFamily:"Syne"}}>{user.name[0].toUpperCase()}</span>
              </div>
            </button>
            <div className="absolute left-14 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <div className="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap" style={{background:isDark?"rgba(15,23,42,0.95)":"rgba(255,255,255,0.95)", color:isDark?"#e2e8f0":"#0f172a", border:"1px solid rgba(255,255,255,0.08)", boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>
                {user.name}
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-5 md:p-8 overflow-auto">
          <div className="flex items-center justify-between mb-6 md:hidden">
            <span className="text-lg font-bold" style={{fontFamily:"Syne",color:isDark?"white":"#0f172a"}}>Mind<span className="text-green-400">Money</span></span>
            <div className="flex items-center gap-2">
              <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{background:"rgba(255,255,255,0.05)"}}>{isDark?"☀️":"🌙"}</button>
              <button className="btn-primary py-2 px-4 text-sm" onClick={()=>setShowModal(true)}>+ Novo</button>
            </div>
          </div>

          {/* Mobile bottom nav */}
          <MobileNav navItems={navItems} activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark}/>

          {/* DASHBOARD */}
          {activeTab==="dashboard"&&(
            <div className="pb-20 md:pb-0">
              <div className="flex items-start justify-between mb-5 animate-fade-up">
                <div><p className="text-slate-400 text-sm mb-0.5">Bem-vindo de volta,</p><h1 className="text-2xl font-bold" style={{color:isDark?"white":"#0f172a"}}>{user.name} 👋</h1></div>
                {summary&&<button onClick={()=>exportPDF(user,summary,transactions,filters)} className="btn-ghost flex items-center gap-2 text-sm"><span>📤</span> Exportar PDF</button>}
              </div>
              <PeriodFilter filters={filters} onChange={setFilters}/>
              {loadingData?(<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">{[0,1,2].map(i=><div key={i} className="glass-card p-5 h-24 animate-pulse"/>)}</div>):summary&&(
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    {[{label:"Saldo Total",value:summary.balance,color:summary.balance>=0?"#4ade80":"#f87171",sub:"Receitas - Gastos"},{label:"Total Receitas",value:summary.totalIncome,color:"#4ade80",sub:"No período"},{label:"Total Gastos",value:summary.totalExpenses,color:"#f87171",sub:"No período"}].map((card,i)=>(
                      <div key={i} className={`glass-card glass-card-hover p-5 animate-fade-up stagger-${i+1}`} style={{background:isDark?undefined:"rgba(255,255,255,0.8)"}}>
                        <p className="label">{card.label}</p>
                        <p className="text-2xl font-bold mt-1" style={{color:card.color,fontFamily:"Syne"}}>{fmt(card.value)}</p>
                        <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                    <div className="glass-card p-5 lg:col-span-2 animate-fade-up stagger-3">
                      <h3 className="font-bold mb-4 text-sm" style={{color:isDark?"white":"#0f172a"}}>Evolução Mensal</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={summary.monthlyData}>
                          <defs>
                            <linearGradient id="cR" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4ade80" stopOpacity={0.3}/><stop offset="95%" stopColor="#4ade80" stopOpacity={0}/></linearGradient>
                            <linearGradient id="cG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f87171" stopOpacity={0.3}/><stop offset="95%" stopColor="#f87171" stopOpacity={0}/></linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
                          <XAxis dataKey="month" tick={{fill:"#475569",fontSize:11}} axisLine={false} tickLine={false}/>
                          <YAxis tick={{fill:"#475569",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`}/>
                          <Tooltip content={<CustomTooltip/>}/>
                          <Area type="monotone" dataKey="receitas" name="Receitas" stroke="#4ade80" fill="url(#cR)" strokeWidth={2} dot={false}/>
                          <Area type="monotone" dataKey="gastos" name="Gastos" stroke="#f87171" fill="url(#cG)" strokeWidth={2} dot={false}/>
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="glass-card p-5 animate-fade-up stagger-4">
                      <h3 className="font-bold mb-4 text-sm" style={{color:isDark?"white":"#0f172a"}}>Gastos por Categoria</h3>
                      {summary.categoryData.length>0?(
                        <><ResponsiveContainer width="100%" height={140}><PieChart><Pie data={summary.categoryData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">{summary.categoryData.map((e,i)=><Cell key={i} fill={CATEGORY_COLORS[e.name]||pieColors[i%pieColors.length]}/>)}</Pie><Tooltip formatter={v=>fmt(v)}/></PieChart></ResponsiveContainer>
                        <div className="space-y-1.5 mt-2">{summary.categoryData.slice(0,4).map((cat,i)=><div key={i} className="flex items-center justify-between text-xs"><div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{background:CATEGORY_COLORS[cat.name]||pieColors[i]}}/><span className="text-slate-400">{cat.name}</span></div><span className="text-slate-300 font-medium">{fmt(cat.value)}</span></div>)}</div></>
                      ):<p className="text-slate-500 text-sm text-center py-8">Sem dados de gastos</p>}
                    </div>
                  </div>
                  <InsightCard insight={summary.insight}/>
                </>
              )}
            </div>
          )}

          {/* TRANSACTIONS */}
          {activeTab==="transactions"&&(
            <div className="pb-20 md:pb-0">
              <div className="flex items-center justify-between mb-5 animate-fade-up">
                <div><h1 className="text-2xl font-bold" style={{color:isDark?"white":"#0f172a"}}>Transações</h1><p className="text-slate-400 text-sm mt-0.5">{transactions.length} registros</p></div>
                <div className="hidden md:flex items-center gap-2">
                  {summary&&transactions.length>0&&<button onClick={()=>exportPDF(user,summary,transactions,filters)} className="btn-ghost flex items-center gap-2 text-sm"><span>📤</span> PDF</button>}
                  <button className="btn-primary flex items-center gap-2" onClick={()=>setShowModal(true)}><span className="text-lg leading-none">+</span> Adicionar</button>
                </div>
              </div>
              <PeriodFilter filters={filters} onChange={setFilters}/>
              {/* Search Bar */}
              <div className="relative mb-4">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
                <input className="input-field pl-9" placeholder="Buscar por descrição ou categoria..." value={search} onChange={e=>setSearch(e.target.value)}/>
                {search && <button onClick={()=>setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs">✕</button>}
              </div>
              {loadingData?(<div className="space-y-3">{[0,1,2,3].map(i=><div key={i} className="glass-card h-16 animate-pulse"/>)}</div>):transactions.length===0?(
                <div className="glass-card p-10 text-center animate-fade-up"><p className="text-4xl mb-3">📭</p><p className="font-semibold" style={{color:isDark?"white":"#0f172a"}}>Nenhuma transação no período</p></div>
              ):(
                <div className="space-y-2 animate-fade-up">
                  {transactions.filter(tx => !search || (tx.description||"").toLowerCase().includes(search.toLowerCase()) || tx.category.toLowerCase().includes(search.toLowerCase())).map(tx=>(
                    <div key={tx.id} className="glass-card glass-card-hover p-4 flex items-center gap-4" style={{background:isDark?undefined:"rgba(255,255,255,0.8)"}}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{background:`${CATEGORY_COLORS[tx.category]||"#94a3b8"}20`}}>{tx.type==="income"?"💰":"💸"}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate" style={{color:isDark?"white":"#0f172a"}}>{tx.description||tx.category}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="tag" style={{background:`${CATEGORY_COLORS[tx.category]||"#94a3b8"}20`,color:CATEGORY_COLORS[tx.category]||"#94a3b8"}}>{tx.category}</span>
                          <span className="text-xs text-slate-500">{new Date(tx.date+"T00:00:00").toLocaleDateString("pt-BR")}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <p className="font-bold text-base" style={{fontFamily:"Syne",color:tx.type==="income"?"#4ade80":"#f87171"}}>{tx.type==="income"?"+":"-"}{fmt(tx.amount)}</p>
                        <button onClick={()=>setEditingTx(tx)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 transition-colors text-sm" title="Editar">✏️</button>
                        <button onClick={()=>handleDelete(tx.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors text-sm" title="Excluir">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab==="cards"&&<CardsTab/>}
          {activeTab==="recurring"&&<RecurringTab allCategories={customCategories}/>}
          {activeTab==="comparison"&&<ComparisonTab/>}
          {activeTab==="categories"&&<CategoriesTab onUpdate={setCustomCategories}/>}
          {activeTab==="goals"&&<GoalsTab/>}
          {activeTab==="alerts"&&<AlertsTab summary={summary}/>}

          {/* INSIGHTS */}
          {activeTab==="insights"&&(
            <div className="pb-20 md:pb-0">
              <div className="mb-5 animate-fade-up"><h1 className="text-2xl font-bold" style={{color:isDark?"white":"#0f172a"}}>IA Insights</h1><p className="text-slate-400 text-sm mt-0.5">Análise comportamental dos seus gastos</p></div>
              <PeriodFilter filters={filters} onChange={setFilters}/>
              {summary?(
                <div className="space-y-4">
                  <InsightCard insight={summary.insight}/>
                  <div className="glass-card p-5 animate-fade-up stagger-2">
                    <h3 className="font-bold mb-4" style={{color:isDark?"white":"#0f172a"}}>📊 Análise por Categoria</h3>
                    <div className="space-y-3">
                      {summary.categoryData.length>0?summary.categoryData.map((cat,i)=>{
                        const pct=summary.totalExpenses>0?((cat.value/summary.totalExpenses)*100).toFixed(1):0;
                        return(<div key={i}><div className="flex justify-between text-sm mb-1"><span className="text-slate-300 flex items-center gap-2"><span className="w-2 h-2 rounded-full inline-block" style={{background:CATEGORY_COLORS[cat.name]||"#94a3b8"}}/>{cat.name}</span><span className="text-slate-400 font-medium">{fmt(cat.value)} <span className="text-slate-500">({pct}%)</span></span></div><div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{width:`${pct}%`,background:CATEGORY_COLORS[cat.name]||"#94a3b8"}}/></div></div>);
                      }):<p className="text-slate-500 text-sm">Sem dados de gastos.</p>}
                    </div>
                  </div>
                  <div className="glass-card p-5 animate-fade-up stagger-3">
                    <h3 className="font-bold mb-3" style={{color:isDark?"white":"#0f172a"}}>💡 Taxa de Poupança</h3>
                    {summary.totalIncome>0?(<><div className="flex items-end gap-2 mb-2"><span className="text-4xl font-bold text-green-400" style={{fontFamily:"Syne"}}>{(((summary.totalIncome-summary.totalExpenses)/summary.totalIncome)*100).toFixed(1)}%</span><span className="text-slate-400 text-sm mb-1">da renda</span></div><p className="text-slate-400 text-sm">{(((summary.totalIncome-summary.totalExpenses)/summary.totalIncome)*100)>=20?"✅ Excelente! Acima da meta de 20%.":(((summary.totalIncome-summary.totalExpenses)/summary.totalIncome)*100)>=10?"⚡ Poupando, mas pode melhorar.":"⚠️ Abaixo do recomendado (20%)."}</p></>):<p className="text-slate-500 text-sm">Adicione receitas para calcular.</p>}
                  </div>
                  {summary.categoryData.length>0&&(
                    <div className="glass-card p-5 animate-fade-up stagger-4">
                      <h3 className="font-bold mb-4" style={{color:isDark?"white":"#0f172a"}}>📈 Distribuição de Gastos</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={summary.categoryData} barSize={28}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                          <XAxis dataKey="name" tick={{fill:"#475569",fontSize:10}} axisLine={false} tickLine={false}/>
                          <YAxis tick={{fill:"#475569",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`}/>
                          <Tooltip content={<CustomTooltip/>}/>
                          <Bar dataKey="value" name="Gasto" radius={[6,6,0,0]}>{summary.categoryData.map((e,i)=><Cell key={i} fill={CATEGORY_COLORS[e.name]||pieColors[i%pieColors.length]}/>)}</Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ):<div className="glass-card p-10 text-center animate-fade-up"><p className="text-4xl mb-3">🤖</p><p className="text-white font-semibold">Carregando...</p></div>}
            </div>
          )}

          {/* PROFILE */}
          {activeTab==="profile"&&(
            <ProfileTab user={user} onUpdate={u=>{setUser(u);}} onLogout={handleLogout} theme={theme} onThemeToggle={()=>setTheme(t=>t==="dark"?"light":"dark")}/>
          )}
        </main>
      </div>
    </div>
  );
}
