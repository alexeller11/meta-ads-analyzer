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
// Servir ficheiros estáticos de forma robusta no Render
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
    console.error('Auth Error:', err.message);
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/campaigns', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/campaigns`, {
      params: { fields: 'id,name,status,objective,daily_budget,lifetime_budget,budget_remaining', access_token: req.session.accessToken, limit: 100 }
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

// ─── ANALYZE ────────────────────────────────────────────────────────────────

app.post('/api/analyze', auth, async (req, res) => {
  const { accountData, campaigns, insights, dateRange } = req.body;
  try {
    const rows = insights?.data || [];
    let totalSpend = 0, totalImpressions = 0, totalClicks = 0;
    const byId = {};
    rows.forEach(m => {
      totalSpend += parseFloat(m.spend || 0);
      totalImpressions += parseInt(m.impressions || 0);
      totalClicks += parseInt(m.clicks || 0);
      byId[m.campaign_id] = m;
    });

    const metrics = {
      totalSpend, totalImpressions, totalClicks,
      avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      avgCpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
      activeCampaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
      totalCampaigns: campaigns.length
    };

    const enriched = campaigns.map(c => {
      const m = byId[c.id] || {};
      return { ...c, spend: parseFloat(m.spend || 0), ctr: parseFloat(m.ctr || 0), cpc: parseFloat(m.cpc || 0), frequency: parseFloat(m.frequency || 1) };
    });

    const previousRun = await db.getLastRun(accountData.account_id);
    const aiAnalysis = runAnalysisEngine(accountData, enriched, metrics, previousRun);

    const runId = await db.saveRun({
      fbAccountId: accountData.account_id, fbUserId: req.session.user.id,
      accountName: accountData.name, dateRange, metrics, campaigns: enriched, aiAnalysis
    });

    res.json({ success: true, runId, analysis: aiAnalysis, metrics, previousRun });
  } catch (err) {
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function runAnalysisEngine(accountData, campaigns, metrics, previousRun) {
  const { avgCtr, avgCpc, totalSpend } = metrics;
  const S = accountData.currency === 'BRL' ? 'R$' : '$';
  let score = totalSpend > 0 ? 100 : 0;
  const issues = [];

  if (avgCtr < 1.0) { score -= 20; issues.push(`CTR de ${avgCtr.toFixed(2)}% está abaixo do benchmark.`); }
  if (avgCpc > 5.0) { score -= 15; issues.push(`CPC elevado: ${S} ${avgCpc.toFixed(2)}`); }

  return {
    resumo_geral: { 
      score_saude: Math.max(0, score), 
      nivel_saude: score >= 80 ? 'Excelente' : score >= 60 ? 'Bom' : 'Atenção',
      tendencia: previousRun ? (score > previousRun.health_score ? 'melhora' : 'piora') : 'sem_historico',
      pontos_principais: issues,
      resumo_historico: previousRun ? `Score anterior: ${previousRun.health_score} pts.` : 'Primeira análise.'
    },
    campanhas_analise: campaigns.map(c => ({
      nome: c.name, status_performance: c.ctr > 1.2 ? 'Excelente' : 'Regular',
      gasto: `${S} ${c.spend.toFixed(2)}`, ctr: `${c.ctr.toFixed(2)}%`, cpc: `${S} ${c.cpc.toFixed(2)}`, frequencia: c.frequency.toFixed(2)
    })),
    otimizacoes_prioritarias: avgCtr < 1.0 ? [{ prioridade: 1, titulo: 'Renovar Criativos', categoria: 'Criativo', impacto_esperado: 'Alto', descricao: 'O CTR está baixo, teste novos formatos.' }] : [],
    alertas_criticos: totalSpend === 0 ? [{ tipo: 'Orçamento', severidade: 'Alta', mensagem: 'Conta sem gastos no período.' }] : [],
    insights_historicos: [], oportunidades: [], plano_acao_30dias: [], proximos_passos: []
  };
}

// ─── PÁGINAS ───────────────────────────────────────────────────────────────────

app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Meta Ads Analyzer on port ${PORT}`);
  if (process.env.DATABASE_URL) await db.initDB();
});
