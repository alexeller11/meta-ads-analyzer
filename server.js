require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const nodemailer = require('nodemailer');
const path = require('path');
const db = require('./db');
const { google } = require('googleapis');

const googleOAuth2 = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.BASE_URL + '/auth/google/callback'
);

const app = express();
app.use(express.json());
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

// ─── AUTH ────────────────────────────────────────────────────────────────────
app.get('/auth/facebook', (req, res) => {
  const scopes = ['ads_read', 'ads_management', 'business_management', 'public_profile'].join(',');
  res.redirect(`https://www.facebook.com/v19.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scopes}&response_type=code`);
});

app.get('/auth/facebook/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.redirect('/?error=auth_denied');
  try {
    const t1 = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: { client_id: FB_APP_ID, client_secret: FB_APP_SECRET, redirect_uri: REDIRECT_URI, code }
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

// ─── META API ────────────────────────────────────────────────────────────────
app.get('/api/adaccounts', auth, async (req, res) => {
  try {
    const r = await axios.get('https://graph.facebook.com/v19.0/me/adaccounts', {
      params: { fields: 'name,account_id,currency,account_status', access_token: req.session.accessToken, limit: 100 }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/campaigns', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/campaigns`, {
      params: { fields: 'id,name,status,objective', access_token: req.session.accessToken, limit: 100 }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/insights', auth, async (req, res) => {
  try {
    const params = {
      fields: 'campaign_id,campaign_name,impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values',
      level: 'campaign', access_token: req.session.accessToken, limit: 200
    };
    if (req.query.since && req.query.until) params.time_range = JSON.stringify({ since: req.query.since, until: req.query.until });
    else params.date_preset = req.query.date_preset || 'last_30d';
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/breakdown/:type', auth, async (req, res) => {
  try {
    const params = { fields: 'impressions,clicks,spend,cpm,ctr,cpc', level: 'account', access_token: req.session.accessToken, limit: 100 };
    if (req.params.type === 'device') params.breakdowns = 'device_platform';
    else if (req.params.type === 'placement') params.breakdowns = 'publisher_platform,platform_position';
    else if (req.params.type === 'daily') params.time_increment = 1;
    
    if (req.query.since && req.query.until) params.time_range = JSON.stringify({ since: req.query.since, until: req.query.until });
    else params.date_preset = req.query.date_preset || 'last_30d';
    
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── MOTOR DE ANÁLISE ────────────────────────────────────────────────────────
app.post('/api/analyze', auth, async (req, res) => {
  const { accountData, campaigns, insights, dateRange } = req.body;
  try {
    const rows = insights?.data || [];
    let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalReach = 0, freqSum = 0, freqCount = 0;
    const byId = {};
    rows.forEach(m => {
      totalSpend += parseFloat(m.spend || 0); totalImpressions += parseInt(m.impressions || 0); totalClicks += parseInt(m.clicks || 0); totalReach += parseInt(m.reach || 0);
      if(m.frequency) { freqSum += parseFloat(m.frequency); freqCount++; }
      byId[m.campaign_id] = m;
    });
    const metrics = { 
      totalSpend, totalImpressions, totalClicks, totalReach,
      avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0, 
      avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      avgFrequency: freqCount > 0 ? freqSum / freqCount : 0,
      activeCampaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
      totalCampaigns: campaigns.length
    };
    const enriched = campaigns.map(c => {
      const m = byId[c.id] || {};
      return { ...c, spend: parseFloat(m.spend || 0), ctr: parseFloat(m.ctr || 0), cpc: parseFloat(m.cpc || 0), frequency: parseFloat(m.frequency || 0), actions: m.actions||[], action_values: m.action_values||[] };
    });
    
    const previousRun = await db.getLastRun(accountData.account_id);
    const aiAnalysis = runAnalysisEngine(accountData, enriched, metrics, previousRun);
    
    await db.saveRun({ fbAccountId: accountData.account_id, fbUserId: req.session.user.id, accountName: accountData.name, dateRange, metrics, campaigns: enriched, aiAnalysis });
    res.json({ success: true, analysis: aiAnalysis, metrics, previousRun });
  } catch (err) { 
    console.error(err);
    res.status(500).json({ error: err.message }); 
  }
});

// PROTEÇÃO CONTRA O ERRO DE TOFIXED:
const safeNum = (val) => Number(val) || 0;

function runAnalysisEngine(accountData, campaigns, metrics, previousRun) {
  const { avgCtr, avgCpc, avgFrequency, totalSpend } = metrics;
  const S = accountData.currency === 'BRL' ? 'R$' : '$';
  let score = totalSpend > 0 ? 95 : 0;
  const issues = [];
  
  if (avgCtr < 1.0) { score -= 20; issues.push(`CTR de ${safeNum(avgCtr).toFixed(2)}% abaixo do benchmark.`); }
  if (avgCpc > 5.0) { score -= 15; issues.push(`CPC elevado: ${S} ${safeNum(avgCpc).toFixed(2)}.`); }
  if (avgFrequency > 4.0) { score -= 15; issues.push(`Frequência alta de ${safeNum(avgFrequency).toFixed(1)}x.`); }
  
  return {
    resumo_geral: { score_saude: Math.max(0,score), nivel_saude: score >= 80 ? 'Excelente' : score >= 60 ? 'Bom' : 'Atenção', resumo_historico: previousRun ? `Score anterior: ${previousRun.health_score} pts.` : 'Sem histórico.', pontos_principais: issues.length ? issues : ['Métricas saudáveis'] },
    campanhas_analise: campaigns.map(c => ({ 
      nome: c.name || 'Desconhecida', 
      status_performance: safeNum(c.ctr) > 1 ? 'Bom' : 'Atenção', 
      gasto: `${S} ${safeNum(c.spend).toFixed(2)}`, 
      ctr: `${safeNum(c.ctr).toFixed(2)}%`, 
      cpc: `${S} ${safeNum(c.cpc).toFixed(2)}`, 
      frequencia: `${safeNum(c.frequency).toFixed(2)}x`,
      problema_principal: safeNum(c.ctr) < 1 ? 'Baixo engajamento' : '-',
      campStatus: c.status
    })),
    otimizacoes_prioritarias: safeNum(avgCtr) < 1 ? [{ prioridade: 1, titulo: 'Melhorar Criativos', categoria: 'Criativo', impacto_esperado: 'Alto', descricao: 'O CTR da conta está muito baixo. Troque os criativos atuais por novos formatos em vídeo.', acao: 'Crie variações novas.' }] : [{ prioridade: 1, titulo: 'Escalar orçamento', categoria: 'Escala', impacto_esperado: 'Médio', descricao: 'Conta com performance estável.', acao: 'Aumente o budget em 20%.' }],
    alertas_criticos: totalSpend === 0 ? [{ mensagem: 'Conta sem gastos no período.', acao_requerida: 'Verificar pagamentos' }] : [],
    insights_historicos: [], oportunidades: [], plano_acao_30dias: [], proximos_passos: []
  };
}

// ─── INSTAGRAM E OUTRAS ROTAS ────────────────────────────────────────────────────────
app.get('/api/instagram/accounts', auth, async (req, res) => {
  try {
    const pages = await axios.get('https://graph.facebook.com/v19.0/me/accounts', { params: { fields: 'instagram_business_account{id,name,username,profile_picture_url,followers_count}', access_token: req.session.accessToken } });
    const igAccounts = []; (pages.data.data || []).forEach(p => { if (p.instagram_business_account) igAccounts.push(p.instagram_business_account); });
    res.json({ data: igAccounts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const { generateContentPlanEngine } = require('./content_engine');
app.post('/api/content-plan', auth, (req, res) => {
  try { res.json({ success: true, plan: generateContentPlanEngine(req.body) }); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/auth/google', auth, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'GOOGLE_CLIENT_ID não configurado.' });
  res.redirect(googleOAuth2.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/adwords', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'], state: req.session.user?.id }));
});

app.get('/auth/google/callback', async (req, res) => {
  if (req.query.error) return res.redirect('/dashboard?google_error=denied');
  try { const { tokens } = await googleOAuth2.getToken(req.query.code); req.session.googleTokens = tokens; res.redirect('/dashboard?google=connected'); } catch (e) { res.redirect('/dashboard?google_error=failed'); }
});
app.get('/api/google/status', auth, (req, res) => res.json({ connected: !!req.session.googleTokens }));

app.get('/dashboard', (req, res) => { if (!req.session.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => { console.log(`🚀 Meta Ads Analyzer on port ${PORT}`); if (process.env.DATABASE_URL) await db.initDB(); });
