require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const db = require('./db');

const app = express();

// Suporte para grandes volumes de dados (Contas com muitos anúncios)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'meta-analyzer-ultra-v6',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const REDIRECT_URI = `${process.env.BASE_URL}/auth/facebook/callback`;

// --- AUTH ---
app.get('/auth/facebook', (req, res) => {
  const scopes = ['ads_read', 'ads_management', 'business_management', 'public_profile'].join(',');
  res.redirect(`https://www.facebook.com/v19.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scopes}`);
});

app.get('/auth/facebook/callback', async (req, res) => {
  try {
    const t1 = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: { client_id: FB_APP_ID, client_secret: FB_APP_SECRET, redirect_uri: REDIRECT_URI, code: req.query.code }
    });
    const t2 = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: { grant_type: 'fb_exchange_token', client_id: FB_APP_ID, client_secret: FB_APP_SECRET, fb_exchange_token: t1.data.access_token }
    });
    req.session.accessToken = t2.data.access_token;
    const user = await axios.get('https://graph.facebook.com/v19.0/me', { params: { fields: 'id,name,picture', access_token: req.session.accessToken } });
    req.session.user = user.data;
    res.redirect('/dashboard');
  } catch (err) { res.redirect('/?error=auth_failed'); }
});

app.get('/api/me', (req, res) => res.json(req.session.user ? { authenticated: true, user: req.session.user } : { authenticated: false }));
app.get('/auth/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

function auth(req, res, next) {
  if (!req.session.accessToken) return res.status(401).json({ error: 'Sessão expirada.' });
  next();
}

// --- API DATA ---
app.get('/api/adaccounts', auth, async (req, res) => {
  try {
    const r = await axios.get('https://graph.facebook.com/v19.0/me/adaccounts', { params: { fields: 'name,account_id,currency', access_token: req.session.accessToken, limit: 100 } });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/balance', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}`, { params: { fields: 'balance,amount_spent,spend_cap', access_token: req.session.accessToken } });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/campaigns', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/campaigns`, { params: { fields: 'id,name,status', access_token: req.session.accessToken, limit: 100 } });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/insights', auth, async (req, res) => {
  try {
    const { since, until, date_preset } = req.query;
    const params = { fields: 'campaign_id,campaign_name,impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values', level: 'campaign', access_token: req.session.accessToken, limit: 200 };
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
    const params = { fields: 'impressions,clicks,spend,ctr', level: 'account', access_token: req.session.accessToken, date_preset: req.query.date_preset || 'last_30d' };
    if (req.params.type === 'device') params.breakdowns = 'device_platform';
    else if (req.params.type === 'placement') params.breakdowns = 'publisher_platform,platform_position';
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- MOTOR IA SÉNIOR ---
const safeNum = (v) => Number(v) || 0;

app.post('/api/analyze', auth, async (req, res) => {
  const { accountData, campaigns, insights, creatives, dateRange } = req.body;
  try {
    const rows = insights?.data || [];
    const getAct = (arr, type) => { const f = (arr||[]).find(x=>x.action_type===type); return f ? parseFloat(f.value||0) : 0; };
    
    let tSpend = 0, tImpr = 0, tClicks = 0, tPur = 0, tLds = 0, tMsg = 0, tSess = 0, tRev = 0;
    const byId = {};
    
    rows.forEach(m => {
      const sp = parseFloat(m.spend || 0); const cl = parseInt(m.clicks || 0); const impr = parseInt(m.impressions || 0);
      tSpend += sp; tImpr += impr; tClicks += cl;
      
      const pur = getAct(m.actions,'offsite_conversion.fb_pixel_purchase') || getAct(m.actions,'purchase');
      const lds = getAct(m.actions,'offsite_conversion.fb_pixel_lead') || getAct(m.actions,'lead');
      const msg = getAct(m.actions,'onsite_conversion.messaging_conversation_started_7d') || getAct(m.actions,'onsite_conversion.messaging_first_reply');
      const sess = getAct(m.actions,'landing_page_view');
      const rev = getAct(m.action_values,'offsite_conversion.fb_pixel_purchase');

      tPur += pur; tLds += lds; tMsg += msg; tSess += sess; tRev += rev;
      byId[m.campaign_id] = { ...m, pur, lds, msg, sess, rev, sp, cl, impr };
    });

    const metrics = { 
        totalSpend: tSpend, totalImpressions: tImpr, totalClicks: tClicks,
        totalPurchases: tPur, totalLeads: tLds, totalMsg: tMsg, totalSessions: tSess, totalRev: tRev,
        avgCtr: tImpr > 0 ? (tClicks / tImpr) * 100 : 0, avgCpc: tClicks > 0 ? tSpend / tClicks : 0,
        connectRate: tClicks > 0 ? (tSess / tClicks) * 100 : 0, roas: tSpend > 0 ? tRev / tSpend : 0
    };

    const enriched = campaigns.map(c => {
      const m = byId[c.id] || { pur:0, lds:0, msg:0, sess:0, rev:0, sp:0, cl:0, impr:0, ctr:0 };
      
      let diagIA = "Campanha estável.";
      if (m.sp > 0) {
          const campRoas = m.sp > 0 ? m.rev / m.sp : 0;
          if (campRoas > 3) diagIA = "🔥 Alta performance! Pode escalar o orçamento em 20%.";
          else if (campRoas > 0 && campRoas < 1.2) diagIA = "⚠️ ROAS baixo. Criativo ou oferta não estão convertendo.";
          else if (parseFloat(m.ctr) < 0.7) diagIA = "🪝 CTR Baixo. Público não está parando o scroll.";
      }

      return { 
          ...c, spend: m.sp, ctr: parseFloat(m.ctr || 0), impressions: m.impr, clicks: m.cl, 
          purchases: m.pur, messages: m.msg, leads: m.lds, revenue: m.rev, 
          roas: m.sp > 0 ? m.rev / m.sp : 0, connectRate: m.cl > 0 ? (m.sess / m.cl) * 100 : 0,
          diagnostico: diagIA
      };
    });
    
    const previousRun = await db.getLastRun(accountData.account_id);
    const aiAnalysis = runAnalysisEngine(accountData, enriched, metrics, previousRun);
    res.json({ success: true, analysis: aiAnalysis, metrics, previousRun });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function runAnalysisEngine(accountData, campaigns, metrics, previousRun) {
  const { avgCtr, totalSpend, connectRate, roas } = metrics;
  const S = accountData.currency === 'BRL' ? 'R$' : '$';
  let score = totalSpend > 0 ? 100 : 0;
  const otimizacoes = [];

  if (avgCtr < 1.0) {
      score -= 20;
      otimizacoes.push({ prioridade: 1, titulo: 'Fadiga Criativa', categoria: 'Criativo', descricao: 'Seu CTR está abaixo de 1%.', acao: 'Troque os ganchos dos seus vídeos.' });
  }
  if (connectRate < 50 && totalSpend > 50) {
      score -= 15;
      otimizacoes.push({ prioridade: 2, titulo: 'Lentidão no Site', categoria: 'Funil', descricao: 'Connect Rate baixo.', acao: 'Verifique a velocidade do site.' });
  }

  return { 
    resumo_geral: { score_saude: Math.max(0, score), nivel_saude: score > 80 ? 'Excelente' : 'Atenção', resumo_historico: previousRun ? `Anterior: ${previousRun.health_score} pts` : 'Novo Histórico' }, 
    campanhas_analise: campaigns, 
    otimizacoes_prioritarias: otimizacoes 
  };
}

app.get('/api/trend/:accountId', auth, async (req, res) => { try { res.json({ trend: await db.getAccountTrend(req.params.accountId) }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/dashboard', (req, res) => { if (!req.session.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => { if (process.env.DATABASE_URL) await db.initDB(); });
