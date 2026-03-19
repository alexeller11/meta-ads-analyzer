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
app.use(express.static('public'));

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
    console.error('Auth:', err.response?.data || err.message);
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

app.get('/api/adaccounts/:id/balance', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}`, {
      params: { fields: 'name,balance,amount_spent,spend_cap,currency,account_status', access_token: req.session.accessToken }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.get('/api/adaccounts/:id/campaigns', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/campaigns`, {
      params: { fields: 'id,name,status,objective,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time', access_token: req.session.accessToken, limit: 100 }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.get('/api/adaccounts/:id/insights', auth, async (req, res) => {
  try {
    const params = {
      fields: 'campaign_id,campaign_name,impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values,cost_per_action_type,unique_clicks,outbound_clicks',
      level: 'campaign',
      access_token: req.session.accessToken,
      limit: 200
    };
    if (req.query.since && req.query.until) {
      params.time_range = JSON.stringify({ since: req.query.since, until: req.query.until });
    } else {
      params.date_preset = req.query.date_preset || 'last_30d';
    }
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

// ─── ANALYZE ────────────────────────────────────────────────────────────────

app.post('/api/analyze', auth, async (req, res) => {
  const { accountData, campaigns, insights, dateRange } = req.body;
  if (!accountData || !campaigns || !insights) return res.status(400).json({ error: 'Dados incompletos' });
  
  const fbUserId = req.session.user.id;

  try {
    const rows = insights?.data || [];
    let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalReach = 0, freqSum = 0, freqCount = 0;
    const byId = {};

    rows.forEach(m => {
      totalSpend += parseFloat(m.spend || 0);
      totalImpressions += parseInt(m.impressions || 0);
      totalClicks += parseInt(m.clicks || 0);
      totalReach += parseInt(m.reach || 0);
      if (m.frequency) { freqSum += parseFloat(m.frequency); freqCount++; }
      if (m.campaign_id) byId[m.campaign_id] = m;
    });

    const metrics = {
      totalSpend, totalImpressions, totalClicks, totalReach,
      avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      avgCpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
      avgFrequency: freqCount > 0 ? freqSum / freqCount : 0,
      activeCampaigns: (campaigns || []).filter(c => c.status === 'ACTIVE').length,
      totalCampaigns: (campaigns || []).length
    };

    const enriched = (campaigns || []).map(c => {
      const m = byId[c.id] || {};
      return {
        ...c,
        spend: parseFloat(m.spend || 0),
        impressions: parseInt(m.impressions || 0),
        clicks: parseInt(m.clicks || 0),
        reach: parseInt(m.reach || 0),
        ctr: parseFloat(m.ctr || 0),
        cpc: parseFloat(m.cpc || 0),
        cpm: parseFloat(m.cpm || 0),
        frequency: parseFloat(m.frequency || 0),
        actions: m.actions || []
      };
    });

    const previousRun = await db.getLastRun(accountData.account_id);
    const aiAnalysis = runAnalysisEngine(accountData, enriched, metrics, previousRun, dateRange);

    const runId = await db.saveRun({
      fbAccountId: accountData.account_id,
      fbUserId,
      accountName: accountData.name,
      dateRange,
      metrics,
      campaigns: enriched,
      aiAnalysis
    });

    res.json({ success: true, runId, analysis: aiAnalysis, metrics, previousRun });
  } catch (err) {
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function runAnalysisEngine(accountData, campaigns, metrics, previousRun, dateRange) {
  const { avgCtr, avgCpc, avgCpm, avgFrequency, totalSpend } = metrics;
  const S = accountData.currency === 'BRL' ? 'R$' : '$';
  const isBRL = accountData.currency === 'BRL';

  const bench = isBRL
    ? { ctrBom: 1.0, cpcAlto: 7.0, cpmAlto: 45, freqMax: 3.5 }
    : { ctrBom: 0.9, cpcAlto: 4.0, cpmAlto: 25, freqMax: 3.5 };

  let score = 100;
  const issues = [];

  if (avgCtr < bench.ctrBom) {
    score -= 20;
    const msg = avgCpm > bench.cpmAlto 
      ? `CTR baixo (${avgCtr.toFixed(2)}%) causado por leilão caro. Considere ampliar o público.`
      : `CTR crítico (${avgCtr.toFixed(2)}%). O seu alcance está barato, mas o criativo não gera cliques. Troque a imagem/vídeo.`;
    issues.push({ metric: 'CTR', severity: 'alta', msg });
  }

  if (avgFrequency > bench.freqMax) {
    score -= 15;
    issues.push({ metric: 'Freq', severity: 'media', msg: `Frequência de ${avgFrequency.toFixed(1)}x indica início de saturação do público.` });
  }

  if (totalSpend === 0) score = 0;
  score = Math.max(0, Math.min(100, score));

  const nivel_saude = score >= 80 ? 'Excelente' : score >= 65 ? 'Bom' : score >= 45 ? 'Atenção' : 'Crítico';

  return {
    resumo_geral: { 
      score_saude: score, 
      nivel_saude, 
      tendencia: previousRun ? (score > previousRun.health_score ? 'melhora' : 'piora') : 'sem_historico',
      pontos_principais: issues.map(i => i.msg),
      resumo_historico: previousRun ? `Score anterior: ${previousRun.health_score} pts.` : 'Primeira análise registrada.'
    },
    campanhas_analise: campaigns.map(c => ({
      nome: c.name,
      status_performance: c.ctr >= bench.ctrBom ? 'Bom' : 'Atenção',
      gasto: `${S} ${c.spend.toFixed(2)}`,
      ctr: `${c.ctr.toFixed(2)}%`,
      cpc: `${S} ${c.cpc.toFixed(2)}`,
      frequencia: c.frequency.toFixed(2),
      problema_principal: c.ctr < bench.ctrBom ? 'Baixo engajamento' : 'Sem problemas críticos',
      acao_imediata: c.ctr < bench.ctrBom ? 'Trocar criativo' : 'Manter e monitorar'
    })),
    otimizacoes_prioritarias: avgCtr < bench.ctrBom ? [{
      prioridade: 1, titulo: 'Renovar Criativos', categoria: 'Criativo', impacto_esperado: 'Alto',
      descricao: 'O CTR está abaixo do ideal.', prazo: 'Imediato',
      acao: '1. Identifique os 2 anúncios que mais gastam. 2. Crie novas headlines.'
    }] : [],
    alertas_criticos: issues.filter(i => i.severity === 'alta'),
    insights_historicos: [],
    oportunidades: [{ titulo: 'Público Semelhante', descricao: 'Crie um público Lookalike 1%.', potencial_impacto: 'Redução de CPA' }],
    plano_acao_30dias: [{ semana: 1, foco: 'Ajuste de Criativos', acoes: ['Trocar peças saturadas'] }],
    proximos_passos: ['Executar nova análise em 7 dias']
  };
}

// ─── OUTRAS ROTAS (ABREVIADO PARA O EXEMPLO) ─────────────────────────────────

app.get('/api/history/:accountId', auth, async (req, res) => {
  try { res.json({ runs: await db.getRunHistory(req.params.accountId) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/lastrun/:accountId', auth, async (req, res) => {
  try { res.json({ run: await db.getLastRun(req.params.accountId) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server on port ${PORT}`);
  if (process.env.DATABASE_URL) await db.initDB();
});
