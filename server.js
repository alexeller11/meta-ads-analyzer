require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const nodemailer = require('nodemailer');
const path = require('path');
const db = require('./db');
const { google } = require('googleapis');

// Google Ads OAuth2 client
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

// Comparativo período anterior
app.get('/api/adaccounts/:id/insights-compare', auth, async (req, res) => {
  try {
    const { since, until, date_preset } = req.query;
    let sinceDate, untilDate;
    if (since && until) {
      sinceDate = new Date(since); untilDate = new Date(until);
    } else {
      untilDate = new Date(); untilDate.setDate(untilDate.getDate() - 1);
      const days = { last_7d:7, last_14d:14, last_30d:30, last_60d:60, last_90d:90 }[date_preset] || 30;
      sinceDate = new Date(untilDate); sinceDate.setDate(sinceDate.getDate() - days + 1);
    }
    const diffMs = untilDate - sinceDate;
    const prevUntil = new Date(sinceDate - 86400000);
    const prevSince = new Date(prevUntil - diffMs);
    const fmt = d => d.toISOString().split('T')[0];
    const params = {
      fields: 'campaign_id,impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values',
      level: 'campaign',
      time_range: JSON.stringify({ since: fmt(prevSince), until: fmt(prevUntil) }),
      access_token: req.session.accessToken, limit: 200
    };
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json({ ...r.data, prevPeriod: { since: fmt(prevSince), until: fmt(prevUntil) } });
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

// Criativos com métricas
app.get('/api/adaccounts/:id/creatives', auth, async (req, res) => {
  try {
    const { since, until, date_preset } = req.query;
    let insightsParam;
    if (since && until) {
      insightsParam = `insights.time_range({"since":"${since}","until":"${until}"})`;
    } else {
      insightsParam = `insights.date_preset(${date_preset || 'last_30d'})`;
    }
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/ads`, {
      params: {
        fields: `id,name,status,campaign_id,campaign{name},adset_id,adset{name},creative{id,name,thumbnail_url,image_url,body,title,call_to_action_type},${insightsParam}{impressions,clicks,spend,ctr,cpc,cpm,frequency,reach,actions,action_values}`,
        access_token: req.session.accessToken,
        limit: 100
      }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

// ─── HISTORY API ─────────────────────────────────────────────────────────────

app.get('/api/history/:accountId', auth, async (req, res) => {
  try { res.json({ runs: await db.getRunHistory(req.params.accountId, 60) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/history/run/:runId', auth, async (req, res) => {
  try {
    const run = await db.getRunDetail(parseInt(req.params.runId), req.session.user.id);
    if (!run) return res.status(404).json({ error: 'Not found' });
    res.json({ run });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/trend/:accountId', auth, async (req, res) => {
  try { res.json({ trend: await db.getAccountTrend(req.params.accountId, 90) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/compare/:r1/:r2', auth, async (req, res) => {
  try {
    const runs = await db.compareRuns(parseInt(req.params.r1), parseInt(req.params.r2), req.session.user.id);
    if (runs.length < 2) return res.status(404).json({ error: 'Runs not found' });
    const [before, after] = runs;
    const delta = (a, b) => (a && b) ? (((b - a) / Math.abs(a)) * 100).toFixed(1) : null;
    res.json({
      before, after,
      deltas: {
        spend: delta(before.total_spend, after.total_spend),
        ctr: delta(before.avg_ctr, after.avg_ctr),
        cpc: delta(before.avg_cpc, after.avg_cpc),
        cpm: delta(before.avg_cpm, after.avg_cpm),
        health_score: delta(before.health_score, after.health_score),
        impressions: delta(before.total_impressions, after.total_impressions),
        clicks: delta(before.total_clicks, after.total_clicks),
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/lastrun/:accountId', auth, async (req, res) => {
  try { res.json({ run: await db.getLastRun(req.params.accountId) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ANALYZE (motor de regras — sem API externa) ──────────────────────────────

app.post('/api/analyze', auth, async (req, res) => {
  const { accountData, campaigns, insights, dateRange } = req.body;
  const fbUserId = req.session.user.id;

  try {
    // Computar métricas agregadas
    const rows = insights?.data || [];
    let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalReach = 0, freqSum = 0, freqCount = 0;
    const byId = {};

    rows.forEach(m => {
      totalSpend    += parseFloat(m.spend || 0);
      totalImpressions += parseInt(m.impressions || 0);
      totalClicks   += parseInt(m.clicks || 0);
      totalReach    += parseInt(m.reach || 0);
      if (m.frequency) { freqSum += parseFloat(m.frequency); freqCount++; }
      if (m.campaign_id) byId[m.campaign_id] = m;
    });

    const metrics = {
      totalSpend, totalImpressions, totalClicks, totalReach,
      avgCtr:       totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      avgCpc:       totalClicks > 0 ? totalSpend / totalClicks : 0,
      avgCpm:       totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
      avgFrequency: freqCount > 0 ? freqSum / freqCount : 0,
      activeCampaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
      totalCampaigns:  campaigns.length
    };

    const enriched = campaigns.map(c => {
      const m = byId[c.id] || {};
      return {
        ...c,
        spend:       parseFloat(m.spend || 0),
        impressions: parseInt(m.impressions || 0),
        clicks:      parseInt(m.clicks || 0),
        reach:       parseInt(m.reach || 0),
        ctr:         parseFloat(m.ctr || 0),
        cpc:         parseFloat(m.cpc || 0),
        cpm:         parseFloat(m.cpm || 0),
        frequency:   parseFloat(m.frequency || 0),
        actions:     m.actions || []
      };
    });

    // Buscar análise anterior para comparação histórica
    const previousRun = await db.getLastRun(accountData.account_id);

    // Rodar motor de regras
    const aiAnalysis = runAnalysisEngine(accountData, enriched, metrics, previousRun, dateRange);

    // Salvar no banco
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

// ─── MOTOR ESTRATÉGICO DE ANÁLISE (v3 — Estrategista Expert) ─────────────────

function runAnalysisEngine(accountData, campaigns, metrics, previousRun, dateRange) {
  const {
    avgCtr, avgCpc, avgCpm, avgFrequency,
    totalSpend, totalImpressions, totalClicks, totalReach,
    activeCampaigns, totalCampaigns
  } = metrics;

  const S = accountData.currency === 'BRL' ? 'R$' : accountData.currency === 'USD' ? '$' : (accountData.currency || 'R$');
  const isBRL = accountData.currency === 'BRL';

  // ── Benchmarks contextuais por moeda ────────────────────────────────────
  const bench = isBRL
    ? { ctrBom: 1.0, ctrExc: 2.0, cpcBom: 3.0, cpcAlto: 7.0, cpmBom: 20, cpmAlto: 45, freqMax: 3.5, freqCrit: 5.0, roasBom: 2.0, roasExc: 4.0 }
    : { ctrBom: 0.9, ctrExc: 1.5, cpcBom: 1.5, cpcAlto: 4.0, cpmBom: 10, cpmAlto: 25, freqMax: 3.5, freqCrit: 5.0, roasBom: 2.0, roasExc: 4.0 };

  // ── Score de saúde — multidimensional ────────────────────────────────────
  let score = 100;
  const issues = []; 

  // CTR (peso 25)
  if      (avgCtr >= bench.ctrExc) { }
  else if (avgCtr >= bench.ctrBom) { score -= 5; }
  else if (avgCtr >= 0.5)          { score -= 15; issues.push({metric:'CTR', severity:'media', msg:`CTR de ${avgCtr.toFixed(2)}% abaixo do benchmark de ${bench.ctrBom}%`}); }
  else if (avgCtr >= 0.3)          { score -= 22; issues.push({metric:'CTR', severity:'alta', msg:`CTR crítico: ${avgCtr.toFixed(2)}% — criativo não está engajando`}); }
  else                              { score -= 28; issues.push({metric:'CTR', severity:'critica', msg:`CTR gravíssimo: ${avgCtr.toFixed(2)}% — trocar criativos é urgente`}); }

  // Frequência (peso 20)
  if      (avgFrequency > bench.freqCrit) { score -= 20; issues.push({metric:'Freq', severity:'critica', msg:`Frequência ${avgFrequency.toFixed(1)}x — público saturado`}); }
  else if (avgFrequency > bench.freqMax)  { score -= 12; issues.push({metric:'Freq', severity:'alta', msg:`Frequência ${avgFrequency.toFixed(1)}x — início de saturação`}); }
  else if (avgFrequency > 2.5)            { score -= 4; }
  else if (avgFrequency < 1.2 && totalSpend > 100) { score -= 6; issues.push({metric:'Freq', severity:'baixa', msg:`Frequência ${avgFrequency.toFixed(1)}x muito baixa`}); }

  // CPC (peso 15)
  if      (avgCpc > bench.cpcAlto * 1.5) { score -= 15; issues.push({metric:'CPC', severity:'alta', msg:`CPC ${S} ${avgCpc.toFixed(2)} — muito acima do ideal`}); }
  else if (avgCpc > bench.cpcAlto)        { score -= 8; issues.push({metric:'CPC', severity:'media', msg:`CPC ${S} ${avgCpc.toFixed(2)} elevado`}); }

  // Ativação (peso 10)
  if (totalSpend === 0)                                { score -= 30; issues.push({metric:'Ativação', severity:'critica', msg:'Sem gasto no período'}); }
  else if (activeCampaigns === 0 && totalCampaigns > 0){ score -= 20; issues.push({metric:'Ativação', severity:'critica', msg:'Todas as campanhas pausadas'}); }

  score = Math.max(0, Math.min(100, score));

  // Nível e tendência
  const nivel_saude = score >= 80 ? 'Excelente' : score >= 65 ? 'Bom' : score >= 45 ? 'Atenção' : score >= 25 ? 'Crítico' : 'Emergência';
  let tendencia = 'sem_historico', variacao_score = null;
  let resumo_historico = 'Primeira análise registrada.';

  if (previousRun?.health_score != null) {
    variacao_score = score - previousRun.health_score;
    tendencia = variacao_score > 5 ? 'melhora' : variacao_score < -5 ? 'piora' : 'estavel';
    const dt = new Date(previousRun.created_at).toLocaleDateString('pt-BR');
    resumo_historico = `Score vs análise de ${dt} (era ${previousRun.health_score} pts).`;
  }

  const pontos_principais = issues.length > 0 ? issues.filter(i => i.severity !== 'baixa').slice(0, 3).map(i => i.msg) : ['Performance sólida'];

  // Análise por campanha
  const campanhas_analise = campaigns
    .filter(c => c.impressions > 0 || c.status === 'ACTIVE')
    .map(c => {
      let campScore = 100;
      let problema = '', acao = '';

      if (c.frequency > bench.freqCrit) { campScore -= 35; problema = `Frequência crítica: ${c.frequency.toFixed(1)}x`; acao = `PAUSAR imediatamente os conjuntos.`; } 
      else if (c.frequency > bench.freqMax) { campScore -= 18; problema = `Frequência elevada: ${c.frequency.toFixed(1)}x`; acao = `Expandir público.`; }

      if (c.ctr < 0.3 && c.impressions > 5000) { campScore -= 30; problema = problema || `CTR gravíssimo: ${c.ctr.toFixed(2)}%`; acao = acao || `Trocar criativos imediatamente.`; } 

      if (!problema) { problema = 'Performance dentro dos parâmetros'; acao = `Documentar e escalar.`; }
      campScore = Math.max(0, Math.min(100, campScore));
      
      return {
        nome: c.name, status_performance: campScore >= 80 ? 'Excelente' : campScore >= 65 ? 'Bom' : campScore >= 45 ? 'Atenção' : 'Crítico',
        gasto: `${S} ${c.spend.toFixed(2)}`, ctr: `${c.ctr.toFixed(2)}%`, cpc: `${S} ${c.cpc.toFixed(2)}`, frequencia: c.frequency.toFixed(2),
        problema_principal: problema, acao_imediata: acao
      };
    });

  const otimizacoes = [];
  let pri = 1;
  if (avgCtr < bench.ctrBom && totalImpressions > 5000) {
    otimizacoes.push({ prioridade: pri++, titulo: 'Renovar criativos', categoria: 'Criativo', impacto_esperado: 'Alto', descricao: `CTR de ${avgCtr.toFixed(2)}% baixo.`, acao: `Testar ganchos diferentes.`, prazo: 'Esta semana' });
  }

  return {
    resumo_geral: { score_saude: score, nivel_saude, variacao_score, tendencia, pontos_principais, resumo_historico },
    // CORREÇÃO: Removido "metricas_comparativas" que causava erro 500
    campanhas_analise,
    otimizacoes_prioritarias: otimizacoes,
    alertas_criticos: issues.filter(i => i.severity !== 'baixa').map(i => ({ tipo: i.metric, severidade: 'Alta', mensagem: i.msg, acao_requerida: 'Revisar' })),
    insights_historicos: previousRun ? [{ titulo: 'Histórico', observacao: resumo_historico, implicacao: 'Monitore tendências.' }] : [],
    oportunidades: [{ titulo: 'Lookalike', descricao: 'Use listas de clientes.', potencial_impacto: 'Alto' }],
    plano_acao_30dias: [{ semana: 1, foco: 'Ajustes', acoes: ['Revisar criativos'] }],
    proximos_passos: ['Nova análise em 7 dias']
  };
}

// ─── EMAIL SERVICE ────────────────────────────────────────────────────────────

function createMailTransporter() {
  return nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.ALERT_EMAIL_USER, pass: process.env.ALERT_EMAIL_PASS } });
}

// ─── ALERT ROUTES ─────────────────────────────────────────────────────────────

app.get('/api/alert/:accountId', auth, async (req, res) => {
  try { res.json({ alert: await db.getBudgetAlert(req.session.user.id, req.params.accountId) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/alert', auth, async (req, res) => {
  const { accountId, accountName, email, threshold, currency } = req.body;
  try { res.json({ success: true, alert: await db.upsertBudgetAlert({ fbUserId: req.session.user.id, fbAccountId: accountId, accountName, email, threshold: parseFloat(threshold) || 100, currency: currency || 'BRL' }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/alert/:accountId', auth, async (req, res) => {
  try { await db.deleteBudgetAlert(req.session.user.id, req.params.accountId); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── CAMPAIGN ACTIONS ────────────────────────────────────────────────────────

app.post('/api/campaigns/:campaignId/toggle', auth, async (req, res) => {
  const { newStatus } = req.body;
  try { await axios.post(`https://graph.facebook.com/v19.0/${req.params.campaignId}`, { status: newStatus, access_token: req.session.accessToken }); res.json({ success: true, status: newStatus }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── BREAKDOWN ENDPOINTS ──────────────────────────────────────────────────────

app.get('/api/adaccounts/:id/breakdown/placement', auth, async (req, res) => {
  try {
    const params = { fields: 'impressions,clicks,spend,cpm,ctr,cpc,reach,actions,action_values', breakdowns: 'publisher_platform,platform_position', level: 'account', access_token: req.session.accessToken, limit: 100 };
    if (req.query.since && req.query.until) params.time_range = JSON.stringify({ since: req.query.since, until: req.query.until });
    else params.date_preset = req.query.date_preset || 'last_30d';
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/breakdown/device', auth, async (req, res) => {
  try {
    const params = { fields: 'impressions,clicks,spend,cpm,ctr,cpc,reach,actions,action_values', breakdowns: 'device_platform', level: 'account', access_token: req.session.accessToken, limit: 50 };
    if (req.query.since && req.query.until) params.time_range = JSON.stringify({ since: req.query.since, until: req.query.until });
    else params.date_preset = req.query.date_preset || 'last_30d';
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/breakdown/daily', auth, async (req, res) => {
  try {
    const params = { fields: 'impressions,clicks,spend,cpm,ctr,cpc,reach,actions,action_values,frequency', time_increment: 1, level: 'account', access_token: req.session.accessToken, limit: 90 };
    if (req.query.since && req.query.until) params.time_range = JSON.stringify({ since: req.query.since, until: req.query.until });
    else params.date_preset = req.query.date_preset || 'last_30d';
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── NOTES ───────────────────────────────────────────────────────────────────

app.get('/api/notes/:accountId', auth, async (req, res) => {
  try { res.json({ notes: await db.getNotes(req.params.accountId, req.session.user.id) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notes', auth, async (req, res) => {
  const { accountId, campaignId, campaignName, note, type } = req.body;
  try { res.json({ success: true, note: await db.saveNote({ fbUserId: req.session.user.id, fbAccountId: accountId, fbCampaignId: campaignId, campaignName, note, type }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/notes/:id', auth, async (req, res) => {
  try { await db.deleteNote(parseInt(req.params.id), req.session.user.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── INSTAGRAM CONTENT PLANNING ─────────────────────────────────────────────

app.get('/api/instagram/accounts', auth, async (req, res) => {
  try {
    const pages = await axios.get('https://graph.facebook.com/v19.0/me/accounts', { params: { fields: 'id,name,instagram_business_account{id,name,username,profile_picture_url,followers_count,media_count}', access_token: req.session.accessToken, limit: 20 } });
    const igAccounts = [];
    (pages.data.data || []).forEach(page => { if (page.instagram_business_account) igAccounts.push({ pageId: page.id, pageName: page.name, ...page.instagram_business_account }); });
    res.json({ data: igAccounts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/instagram/:igId/media', auth, async (req, res) => {
  try { const r = await axios.get(`https://graph.facebook.com/v19.0/${req.params.igId}/media`, { params: { fields: 'id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,reach,impressions,engagement,saved,shares,ig_id,permalink', access_token: req.session.accessToken, limit: 24 } }); res.json(r.data); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

const { generateContentPlanEngine } = require('./content_engine');

app.post('/api/content-plan', auth, (req, res) => {
  const { niche, igUsername, businessName, recentPosts, accountMetrics, tone, audience } = req.body;
  try { res.json({ success: true, plan: generateContentPlanEngine({ niche, igUsername, businessName, recentPosts, accountMetrics, tone, audience }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PAGES ───────────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Meta Ads Analyzer v2 on port ${PORT}`);
  if (process.env.DATABASE_URL) await db.initDB();
});
