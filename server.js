require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const db = require('./db');

const app = express();

// 🚀 Aumenta o limite para suportar contas grandes com muitos criativos
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'meta-ads-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const REDIRECT_URI = `${BASE_URL}/auth/facebook/callback`;

// --- AUTHENTICATION ---
app.get('/auth/facebook', (req, res) => {
  const scopes = ['ads_read', 'ads_management', 'business_management', 'public_profile'].join(',');
  res.redirect(`https://www.facebook.com/v19.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scopes}&response_type=code`);
});

app.get('/auth/facebook/callback', async (req, res) => {
  if (req.query.error) return res.redirect('/?error=auth_denied');
  try {
    const t1 = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: { client_id: FB_APP_ID, client_secret: FB_APP_SECRET, redirect_uri: REDIRECT_URI, code: req.query.code }
    });
    const t2 = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: { grant_type: 'fb_exchange_token', client_id: FB_APP_ID, client_secret: FB_APP_SECRET, fb_exchange_token: t1.data.access_token }
    });
    const token = t2.data.access_token;
    const user = await axios.get('https://graph.facebook.com/v19.0/me', {
      params: { fields: 'id,name,email,picture', access_token: token }
    });
    req.session.user = user.data;
    req.session.accessToken = token;
    res.redirect('/dashboard');
  } catch (err) {
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.get('/api/me', (req, res) => res.json(req.session.user ? { authenticated: true, user: req.session.user } : { authenticated: false }));

function auth(req, res, next) {
  if (!req.session.accessToken) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// --- META API ENDPOINTS ---
app.get('/api/adaccounts', auth, async (req, res) => {
  try {
    const r = await axios.get('https://graph.facebook.com/v19.0/me/adaccounts', {
      params: { fields: 'name,account_id,currency,account_status', access_token: req.session.accessToken, limit: 100 }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/balance', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}`, {
      params: { fields: 'balance,amount_spent,spend_cap,currency', access_token: req.session.accessToken }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/campaigns', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/campaigns`, {
      params: { fields: 'id,name,status', access_token: req.session.accessToken, limit: 100 }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/insights', auth, async (req, res) => {
  try {
    const { since, until, date_preset } = req.query;
    const params = {
      fields: 'campaign_id,campaign_name,impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values',
      level: 'campaign', access_token: req.session.accessToken, limit: 200
    };
    if (since && until) params.time_range = JSON.stringify({ since, until });
    else params.date_preset = date_preset || 'last_30d';
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/creatives', auth, async (req, res) => {
  try {
    const { date_preset } = req.query;
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/ads`, {
      params: { fields: `id,name,status,creative{thumbnail_url,image_url},insights.date_preset(${date_preset || 'last_30d'}){impressions,clicks,spend,ctr,actions,action_values}`, access_token: req.session.accessToken, limit: 50 }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/breakdown/:type', auth, async (req, res) => {
  try {
    const { date_preset } = req.query;
    const params = { fields: 'impressions,clicks,spend,ctr,cpc', level: 'account', access_token: req.session.accessToken, date_preset: date_preset || 'last_30d' };
    if (req.params.type === 'device') params.breakdowns = 'device_platform';
    else if (req.params.type === 'placement') params.breakdowns = 'publisher_platform,platform_position';
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ANALYZE ENGINE (SÉNIOR) ---
app.post('/api/analyze', auth, async (req, res) => {
  const { accountData, campaigns, insights, creatives, dateRange } = req.body;
  try {
    const rows = insights?.data || [];
    const getAct = (arr, type) => { const f = (arr||[]).find(x=>x.action_type===type); return f ? parseFloat(f.value||0) : 0; };
    
    let tSpend = 0, tImpr = 0, tClicks = 0, tReach = 0, fSum = 0, fCount = 0;
    let tPur = 0, tLds = 0, tMsg = 0, tSess = 0, tRev = 0;
    const byId = {};
    
    rows.forEach(m => {
      const sp = parseFloat(m.spend || 0); const cl = parseInt(m.clicks || 0);
      tSpend += sp; tImpr += parseInt(m.impressions || 0); tClicks += cl; tReach += parseInt(m.reach || 0);
      if(m.frequency) { fSum += parseFloat(m.frequency); fCount++; }
      const pur = getAct(m.actions,'offsite_conversion.fb_pixel_purchase') || getAct(m.actions,'purchase');
      const lds = getAct(m.actions,'offsite_conversion.fb_pixel_lead') || getAct(m.actions,'lead');
      const msg = getAct(m.actions,'onsite_conversion.messaging_conversation_started_7d') || getAct(m.actions,'onsite_conversion.messaging_first_reply');
      const sess = getAct(m.actions,'landing_page_view');
      const rev = getAct(m.action_values,'offsite_conversion.fb_pixel_purchase');
      tPur += pur; tLds += lds; tMsg += msg; tSess += sess; tRev += rev;
      byId[m.campaign_id] = { ...m, pur, lds, msg, sess, rev, sp, cl };
    });

    const metrics = { 
        totalSpend: tSpend, totalImpressions: tImpr, totalClicks: tClicks, totalReach: tReach,
        totalPurchases: tPur, totalLeads: tLds, totalMsg: tMsg, totalSessions: tSess, totalRev: tRev,
        avgCtr: tImpr > 0 ? (tClicks / tImpr) * 100 : 0, avgCpc: tClicks > 0 ? tSpend / tClicks : 0,
        avgCpm: tImpr > 0 ? (tSpend / tImpr) * 1000 : 0, avgFrequency: fCount > 0 ? fSum / fCount : 0,
        connectRate: tClicks > 0 ? (tSess / tClicks) * 100 : 0, roas: tSpend > 0 ? tRev / tSpend : 0
    };

    const enriched = campaigns.map(c => {
      const m = byId[c.id] || { pur:0, lds:0, msg:0, sess:0, rev:0, sp:0, cl:0, impr:0 };
      return { ...c, spend: m.sp, ctr: parseFloat(m.ctr || 0), cpc: parseFloat(m.cpc || 0), impressions: m.impr || 0, clicks: m.cl || 0, purchases: m.pur, messages: m.msg, revenue: m.rev, roas: m.sp > 0 ? m.rev / m.sp : 0, connectRate: m.cl > 0 ? (m.sess / m.cl) * 100 : 0 };
    });
    
    const previousRun = await db.getLastRun(accountData.account_id);
    const aiAnalysis = runAnalysisEngine(accountData, enriched, metrics, creatives, previousRun);
    res.json({ success: true, analysis: aiAnalysis, metrics, previousRun });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function runAnalysisEngine(accountData, campaigns, metrics, creativesRaw, previousRun) {
  const { avgCtr, avgCpc, avgCpm, avgFrequency, totalSpend, connectRate, roas } = metrics;
  const S = accountData.currency === 'BRL' ? 'R$' : '$';
  const safeNum = (v) => Number(v) || 0;

  let score = totalSpend > 0 ? 100 : 0;
  const otimizacoes = [];
  const issues = [];

  if (avgCtr < 1.0) { score -= 20; issues.push("CTR baixo: anúncios pouco atrativos."); }
  if (connectRate < 60 && totalSpend > 50) { score -= 15; issues.push("Fuga de tráfego: site lento ou Audience Network ativada."); }
  if (roas > 0 && roas < 1.5) { score -= 20; issues.push("Sangria de Caixa: ROI negativo."); }

  if (avgCtr < 1.0) {
    otimizacoes.push({ prioridade: 1, titulo: 'Renovar Criativos', categoria: 'Criativo', impacto_esperado: 'Alto', descricao: `CTR médio de ${safeNum(avgCtr).toFixed(2)}%.`, acao: 'Ação: Troque os ganchos (hooks) dos vídeos imediatamente.' });
  }

  const campanhas_analise = campaigns.map(c => ({
    nome: c.name, gasto: `${S} ${safeNum(c.spend).toFixed(2)}`, ctr: `${safeNum(c.ctr).toFixed(2)}%`, cpc: `${S} ${safeNum(c.cpc).toFixed(2)}`,
    roas: c.roas > 0 ? `${safeNum(c.roas).toFixed(2)}x` : '-', mensagens: c.messages, connectRate: `${safeNum(c.connectRate).toFixed(1)}%`,
    diagnostico: c.roas > 2 ? 'Escalar' : c.ctr < 1 ? 'Trocar Criativo' : 'Estável', spendRaw: c.spend, campStatus: c.status
  }));

  return { resumo_geral: { score_saude: Math.max(0, score), nivel_saude: score > 85 ? 'Excelente' : score > 60 ? 'Saudável' : 'Crítico', pontos_principais: issues, resumo_historico: previousRun ? `Score anterior: ${previousRun.health_score} pts` : 'Iniciando histórico' }, campanhas_analise, otimizacoes_prioritarias: otimizacoes, alertas_criticos: [] };
}

// --- HISTORICO ---
app.get('/api/trend/:accountId', auth, async (req, res) => { try { res.json({ trend: await db.getAccountTrend(req.params.accountId) }); } catch (e) { res.status(500).json({ error: e.message }); } });

// --- PAGES ---
app.get('/dashboard', (req, res) => { if (!req.session.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => { console.log(`🚀 API on port ${PORT}`); if (process.env.DATABASE_URL) await db.initDB(); });
