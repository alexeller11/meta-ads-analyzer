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
    console.error('Auth Error:', err.response?.data?.error || err.message);
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
      params: { fields: 'name,account_id,currency,account_status,business_name,timezone_name,amount_spent,balance,spend_cap', access_token: req.session.accessToken, limit: 100 }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.get('/api/adaccounts/:id/campaigns', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/campaigns`, {
      params: { fields: 'id,name,status,objective,daily_budget,lifetime_budget,budget_remaining', access_token: req.session.accessToken, limit: 100 }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
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
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.get('/api/adaccounts/:id/creatives', auth, async (req, res) => {
  try {
    const params = {
      fields: `id,name,status,campaign_id,campaign{name},creative{id,name,thumbnail_url,image_url,body,title},insights.date_preset(${req.query.date_preset || 'last_30d'}){impressions,clicks,spend,ctr,cpc,cpm,frequency,actions}`,
      access_token: req.session.accessToken, limit: 100
    };
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/ads`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
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
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

// ─── MOTOR DE ANÁLISE ────────────────────────────────────────────────────────
app.post('/api/analyze', auth, async (req, res) => {
  const { accountData, campaigns, insights, dateRange } = req.body;
  try {
    const rows = insights?.data || [];
    let totalSpend = 0, totalImpressions = 0, totalClicks = 0;
    const byId = {};
    rows.forEach(m => {
      totalSpend += parseFloat(m.spend || 0); totalImpressions += parseInt(m.impressions || 0); totalClicks += parseInt(m.clicks || 0);
      byId[m.campaign_id] = m;
    });
    const metrics = { totalSpend, totalImpressions, totalClicks, avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0, avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0 };
    const enriched = campaigns.map(c => {
      const m = byId[c.id] || {};
      return { ...c, spend: parseFloat(m.spend || 0), ctr: parseFloat(m.ctr || 0), cpc: parseFloat(m.cpc || 0), frequency: parseFloat(m.frequency || 0), impressions: parseInt(m.impressions || 0), clicks: parseInt(m.clicks || 0) };
    });
    
    const previousRun = await db.getLastRun(accountData.account_id);
    const aiAnalysis = runAnalysisEngine(accountData, enriched, metrics, previousRun);
    
    await db.saveRun({ fbAccountId: accountData.account_id, fbUserId: req.session.user.id, accountName: accountData.name, dateRange, metrics, campaigns: enriched, aiAnalysis });
    res.json({ success: true, analysis: aiAnalysis, metrics, previousRun });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function runAnalysisEngine(accountData, campaigns, metrics, previousRun) {
  const { avgCtr, avgCpc, totalSpend, totalImpressions } = metrics;
  const S = accountData.currency === 'BRL' ? 'R$' : '$';
  let score = totalSpend > 0 ? 85 : 0;
  const issues = [];
  if (avgCtr < 1.0) { score -= 20; issues.push(`CTR de ${avgCtr.toFixed(2)}% abaixo do benchmark de 1%.`); }
  if (avgCpc > 5.0) { score -= 15; issues.push(`CPC muito elevado: ${S} ${avgCpc.toFixed(2)}.`); }
  
  return {
    resumo_geral: { score_saude: Math.max(0,score), nivel_saude: score >= 80 ? 'Excelente' : score >= 60 ? 'Bom' : 'Atenção', resumo_historico: previousRun ? `Score anterior: ${previousRun.health_score} pts.` : 'Sem histórico.', pontos_principais: issues },
    campanhas_analise: campaigns.map(c => ({ nome: c.name, status_performance: c.ctr > 1 ? 'Bom' : 'Atenção', gasto: `${S} ${c.spend.toFixed(2)}`, ctr: `${c.ctr.toFixed(2)}%`, cpc: `${S} ${c.cpc.toFixed(2)}`, frequencia: c.frequency.toFixed(2) })),
    otimizacoes_prioritarias: avgCtr < 1 ? [{ prioridade: 1, titulo: 'Melhorar Criativos', categoria: 'Criativo', descricao: 'O CTR da conta está muito baixo. Troque os criativos atuais por novos formatos em vídeo.' }] : [],
    alertas_criticos: totalSpend === 0 ? [{ mensagem: 'Conta sem gastos no período.', acao_requerida: 'Verificar pagamentos ou se campanhas estão ativas.' }] : []
  };
}

// ─── OUTRAS ROTAS (HISTORY, NOTES, IG, GOOGLE) ───────────────────────────────
app.get('/api/history/:accountId', auth, async (req, res) => { try { res.json({ runs: await db.getRunHistory(req.params.accountId) }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/trend/:accountId', auth, async (req, res) => { try { res.json({ trend: await db.getAccountTrend(req.params.accountId) }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/notes/:accountId', auth, async (req, res) => { try { res.json({ notes: await db.getNotes(req.params.accountId, req.session.user.id) }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/notes', auth, async (req, res) => { const { accountId, campaignId, campaignName, note, type } = req.body; try { res.json({ success: true, note: await db.saveNote({ fbUserId: req.session.user.id, fbAccountId: accountId, fbCampaignId: campaignId, campaignName, note, type }) }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/instagram/accounts', auth, async (req, res) => {
  try {
    const pages = await axios.get('https://graph.facebook.com/v19.0/me/accounts', { params: { fields: 'instagram_business_account{id,name,username,profile_picture_url,followers_count}', access_token: req.session.accessToken } });
    const igAccounts = []; (pages.data.data || []).forEach(p => { if (p.instagram_business_account) igAccounts.push(p.instagram_business_account); });
    res.json({ data: igAccounts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/instagram/:igId/media', auth, async (req, res) => {
  try { const r = await axios.get(`https://graph.facebook.com/v19.0/${req.params.igId}/media`, { params: { fields: 'id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,reach,impressions,engagement', access_token: req.session.accessToken, limit: 24 } }); res.json(r.data); }
  catch (e) { res.status(500).json({ error: e.message }); }
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

app.get('/api/google/customers', auth, async (req, res) => {
  if (!req.session.googleTokens || !process.env.GOOGLE_DEVELOPER_TOKEN) return res.status(401).json({ error: 'Configuração Google ausente.' });
  try {
    googleOAuth2.setCredentials(req.session.googleTokens); const token = await googleOAuth2.getAccessToken();
    const r = await axios.get('https://googleads.googleapis.com/v17/customers:listAccessibleCustomers', { headers: { 'Authorization': `Bearer ${token.token}`, 'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN } });
    const customers = [];
    for (const name of (r.data.resourceNames || []).slice(0,10)) {
      const custId = name.replace('customers/','');
      try {
        const detail = await axios.post(`https://googleads.googleapis.com/v17/customers/${custId}/googleAds:search`, { query: "SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1" }, { headers: { 'Authorization': `Bearer ${token.token}`, 'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN, 'login-customer-id': custId } });
        if (detail.data.results?.[0]) { const c = detail.data.results[0].customer; customers.push({ id: c.id, name: c.descriptiveName, currency: c.currencyCode }); }
      } catch(err) { customers.push({ id: custId, name: custId }); }
    }
    res.json({ customers });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/google/customers/:custId/metrics', auth, async (req, res) => {
  if (!req.session.googleTokens) return res.status(401).json({ error: 'Google nao conectado' });
  try {
    googleOAuth2.setCredentials(req.session.googleTokens); const token = await googleOAuth2.getAccessToken();
    const r = await axios.post(`https://googleads.googleapis.com/v17/customers/${req.params.custId}/googleAds:search`, { query: `SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.conversions FROM customer WHERE segments.date DURING ${req.query.date_range || 'LAST_30_DAYS'}` }, { headers: { 'Authorization': `Bearer ${token.token}`, 'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN, 'login-customer-id': req.params.custId } });
    let spend=0, impr=0, clicks=0, conv=0;
    (r.data.results||[]).forEach(row=>{ const m=row.metrics||{}; spend+=parseInt(m.costMicros||0)/1e6; impr+=parseInt(m.impressions||0); clicks+=parseInt(m.clicks||0); conv+=parseFloat(m.conversions||0); });
    res.json({ spend, impressions: impr, clicks, ctr: impr>0?(clicks/impr)*100:0, avgCpc: clicks>0?spend/clicks:0, conversions: conv });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/dashboard', (req, res) => { if (!req.session.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => { console.log(`🚀 API on port ${PORT}`); if (process.env.DATABASE_URL) await db.initDB(); });
