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

// ─── MOTOR ESTRATÉGICO DE ANÁLISE ─────────────────

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

  let score = 100;
  const issues = []; 

  // Lógica Score
  if      (avgCtr >= bench.ctrExc) {  }
  else if (avgCtr >= bench.ctrBom) { score -= 5; }
  else if (avgCtr >= 0.5)          { score -= 15; issues.push({metric:'CTR', severity:'media', msg:`CTR de ${avgCtr.toFixed(2)}% abaixo do benchmark de ${bench.ctrBom}%`}); }
  else if (avgCtr >= 0.3)          { score -= 22; issues.push({metric:'CTR', severity:'alta', msg:`CTR crítico: ${avgCtr.toFixed(2)}% — criativo não está engajando`}); }
  else                              { score -= 28; issues.push({metric:'CTR', severity:'critica', msg:`CTR gravíssimo: ${avgCtr.toFixed(2)}% — trocar criativos é urgente`}); }

  if      (avgFrequency > bench.freqCrit) { score -= 20; issues.push({metric:'Freq', severity:'critica', msg:`Frequência ${avgFrequency.toFixed(1)}x — público saturado`}); }
  else if (avgFrequency > bench.freqMax)  { score -= 12; issues.push({metric:'Freq', severity:'alta', msg:`Frequência ${avgFrequency.toFixed(1)}x — início de saturação`}); }

  if      (avgCpc > bench.cpcAlto * 1.5) { score -= 15; issues.push({metric:'CPC', severity:'alta', msg:`CPC ${S} ${avgCpc.toFixed(2)} — muito acima do ideal`}); }
  else if (avgCpc > bench.cpcAlto)        { score -= 8; issues.push({metric:'CPC', severity:'media', msg:`CPC ${S} ${avgCpc.toFixed(2)} elevado`}); }

  if      (avgCpm > bench.cpmAlto * 1.5) { score -= 10; issues.push({metric:'CPM', severity:'media', msg:`CPM ${S} ${avgCpm.toFixed(2)} — leilão muito disputado`}); }
  else if (avgCpm > bench.cpmAlto)        { score -= 5; }

  if (totalSpend === 0)                                { score -= 30; issues.push({metric:'Ativação', severity:'critica', msg:'Sem gasto no período — conta sem veiculação'}); }
  else if (activeCampaigns === 0 && totalCampaigns > 0){ score -= 20; issues.push({metric:'Ativação', severity:'critica', msg:'Todas as campanhas pausadas'}); }

  score = Math.max(0, Math.min(100, score));

  // Nível e tendência
  const nivel_saude = score >= 80 ? 'Excelente' : score >= 65 ? 'Bom' : score >= 45 ? 'Atenção' : score >= 25 ? 'Crítico' : 'Emergência';
  let tendencia = 'sem_historico', variacao_score = null;
  let resumo_historico = 'Primeira análise registrada. A partir de agora o sistema acompanha a evolução da conta.';

  if (previousRun?.health_score != null) {
    variacao_score = score - previousRun.health_score;
    tendencia = variacao_score > 5 ? 'melhora' : variacao_score < -5 ? 'piora' : 'estavel';
    const dt = new Date(previousRun.created_at).toLocaleDateString('pt-BR');
    const diff = variacao_score > 0 ? `subiu ${variacao_score} pts` : variacao_score < 0 ? `caiu ${Math.abs(variacao_score)} pts` : 'estável';
    resumo_historico = `Score ${diff} vs análise de ${dt} (era ${previousRun.health_score} pts).`;
  }

  const pontos_principais = issues.length > 0 ? issues.filter(i => i.severity !== 'baixa').slice(0, 3).map(i => i.msg) : ['Performance sólida — métricas dentro ou acima dos benchmarks'];

  const campanhas_analise = campaigns
    .filter(c => c.impressions > 0 || c.status === 'ACTIVE')
    .map(c => {
      let campScore = 100;
      let problema = '', acao = '', diagnostico_completo = '';

      if (c.frequency > bench.freqCrit) { campScore -= 35; problema = `Frequência crítica: ${c.frequency.toFixed(1)}x — público esgotado`; acao = `PAUSAR imediatamente os conjuntos.`; } 
      else if (c.frequency > bench.freqMax) { campScore -= 18; problema = `Frequência elevada: ${c.frequency.toFixed(1)}x — início de saturação`; acao = `Expandir público em 30-50%.`; }
      if (c.ctr < 0.3 && c.impressions > 5000) { campScore -= 30; problema = problema || `CTR gravíssimo: ${c.ctr.toFixed(2)}%`; acao = acao || `Pausar os anúncios atuais e testar novos.`; } 
      else if (c.ctr < bench.ctrBom && c.impressions > 2000) { campScore -= 12; problema = problema || `CTR de ${c.ctr.toFixed(2)}% abaixo do ideal`; acao = acao || `Testar headline diferente.`; }
      if (c.cpc > bench.cpcAlto) { campScore -= 15; problema = problema || `CPC alto: ${S} ${c.cpc.toFixed(2)}`; acao = acao || `Verificar se a estratégia de lance é automática.`; }
      
      const getAct = (arr, type) => { const f = (arr||[]).find(a => a.action_type === type); return f ? parseFloat(f.value || 0) : 0; };
      const campRev = getAct(c.action_values, 'offsite_conversion.fb_pixel_purchase');
      const campRoas = c.spend > 0 ? campRev / c.spend : 0;
      if (campRoas > 0 && campRoas < bench.roasBom && c.spend > 50) { campScore -= 10; problema = problema || `ROAS baixo: ${campRoas.toFixed(2)}x`; acao = acao || `Revisar funil de conversão.`; }

      if (!problema) { problema = 'Performance dentro dos parâmetros'; acao = `Documentar o que está funcionando.`; }

      campScore = Math.max(0, Math.min(100, campScore));
      return {
        nome: c.name,
        status_performance: campScore >= 80 ? 'Excelente' : campScore >= 65 ? 'Bom' : campScore >= 45 ? 'Atenção' : 'Crítico',
        gasto: `${S} ${c.spend.toFixed(2)}`,
        ctr: `${c.ctr.toFixed(2)}%`,
        cpc: `${S} ${c.cpc.toFixed(2)}`,
        frequencia: c.frequency.toFixed(2),
        problema_principal: problema,
        acao_imediata: acao,
        campId: c.id,
        campStatus: c.status
      };
    });

  const otimizacoes = [];
  let pri = 1;

  if (avgCtr < bench.ctrBom && totalImpressions > 5000) {
    otimizacoes.push({ prioridade: pri++, titulo: 'Renovar criativos — causa raiz do CTR baixo', categoria: 'Criativo', impacto_esperado: 'Alto', descricao: `CTR de ${avgCtr.toFixed(2)}% vs benchmark de ${bench.ctrBom}%. Aumentar CTR reduz CPM efetivo.`, acao: `Identificar anúncios com maior gasto e CTR mais baixo. Criar 3 variações.`, prazo: 'Esta semana' });
  }
  if (avgFrequency > bench.freqMax) {
    otimizacoes.push({ prioridade: pri++, titulo: `Combater saturação — ${avgFrequency.toFixed(1)}x de frequência`, categoria: 'Audiência', impacto_esperado: 'Alto', descricao: `Acima de ${bench.freqMax}x o CTR começa a cair exponencialmente e o CPM sobe.`, acao: `Criar novo conjunto de anúncios com público Lookalike 2% baseado nos compradores.`, prazo: 'Imediato' });
  }
  if (totalSpend > 0 && avgCpc > bench.cpcBom) {
    otimizacoes.push({ prioridade: pri++, titulo: 'Otimizar custo por resultado — CPC/CPL acima do ideal', categoria: 'Funil', impacto_esperado: 'Alto', descricao: `Verifique se a landing page carrega rápido e se a oferta é clara.`, acao: `Testar público mais amplo.`, prazo: 'Esta semana' });
  }

  otimizacoes.push({ prioridade: pri++, titulo: 'Implementar / otimizar campanha de Retargeting', categoria: 'Funil', impacto_esperado: 'Alto', descricao: `Visitantes do site têm 3-5x mais chance de comprar do que público frio.`, acao: `Criar Público Personalizado dos últimos 30 dias.`, prazo: 'Esta semana' });
  otimizacoes.push({ prioridade: pri++, titulo: 'Sistema contínuo de testes A/B', categoria: 'Metodologia', impacto_esperado: 'Médio', descricao: `Contas que crescem testam constantemente.`, acao: `Definir uma variável por teste: criativo OU público OU landing page.`, prazo: 'Este mês' });

  const alertas = issues.filter(i => i.severity !== 'baixa').map(i => ({ tipo: i.metric, severidade: i.severity, mensagem: i.msg, acao_requerida: 'Revisar urgência no painel' }));
  const insights_historicos = previousRun ? [{ titulo: 'Comparativo vs Análise Anterior', observacao: resumo_historico, implicacao: 'Mantenha acompanhamento semanal.' }] : [];
  const oportunidades = [{ titulo: 'Lookalike Audience dos melhores clientes', descricao: 'O Lookalike 1-3% é consistente em contas maduras.', potencial_impacto: `Redução típica de 25-45% no CPL.`, como_implementar: 'Upload CSV de emails.' }];
  const plano_acao_30dias = [
    { semana: 1, foco: 'Correções críticas e baseline', acoes: ['Resolver saturação', 'Criar variações de criativo'] },
    { semana: 2, foco: 'Otimização de funil e lances', acoes: ['Analisar testes A/B', 'Campanha de Retargeting'] },
    { semana: 3, foco: 'Expansão e novos públicos', acoes: ['Lançar Lookalike'] },
    { semana: 4, foco: 'Consolidação e escala', acoes: ['Avaliar ROAS', 'Planejar escala'] }
  ];

  return {
    resumo_geral: { score_saude: score, nivel_saude, variacao_score, tendencia, pontos_principais, resumo_historico },
    // CORREÇÃO: A propriedade metricas_comparativas que causava o Erro 500 foi TOTALMENTE removida daqui.
    campanhas_analise,
    otimizacoes_prioritarias: otimizacoes,
    alertas_criticos: alertas,
    insights_historicos,
    oportunidades,
    plano_acao_30dias,
    proximos_passos: ['Executar nova análise em 7 dias']
  };
}

// ─── EMAIL SERVICE ────────────────────────────────────────────────────────────

function createMailTransporter() {
  return nodemailer.createTransport({
    service: 'gmail', auth: { user: process.env.ALERT_EMAIL_USER, pass: process.env.ALERT_EMAIL_PASS }
  });
}

// ─── ALERT ROUTES ─────────────────────────────────────────────────────────────

app.get('/api/alert/:accountId', auth, async (req, res) => {
  try {
    const alert = await db.getBudgetAlert(req.session.user.id, req.params.accountId);
    res.json({ alert: alert || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/alert', auth, async (req, res) => {
  const { accountId, accountName, email, threshold, currency } = req.body;
  if (!accountId || !email) return res.status(400).json({ error: 'accountId e email obrigatórios' });
  try {
    const alert = await db.upsertBudgetAlert({
      fbUserId: req.session.user.id, fbAccountId: accountId, accountName, email, threshold: parseFloat(threshold) || 100, currency: currency || 'BRL'
    });
    res.json({ success: true, alert });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/alert/:accountId', auth, async (req, res) => {
  try {
    await db.deleteBudgetAlert(req.session.user.id, req.params.accountId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── CAMPAIGN ACTIONS ────────────────────────────────────────────────────────

app.post('/api/campaigns/:campaignId/toggle', auth, async (req, res) => {
  const { newStatus } = req.body; 
  if (!['ACTIVE','PAUSED'].includes(newStatus)) return res.status(400).json({ error: 'Status inválido' });
  try {
    const r = await axios.post(`https://graph.facebook.com/v19.0/${req.params.campaignId}`,
      { status: newStatus, access_token: req.session.accessToken }
    );
    res.json({ success: true, status: newStatus });
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
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
  try {
    const notes = await db.getNotes(req.params.accountId, req.session.user.id);
    res.json({ notes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notes', auth, async (req, res) => {
  const { accountId, campaignId, campaignName, note, type } = req.body;
  if (!accountId || !note) return res.status(400).json({ error: 'Campos obrigatórios: accountId, note' });
  try {
    const saved = await db.saveNote({ fbUserId: req.session.user.id, fbAccountId: accountId, fbCampaignId: campaignId, campaignName, note, type });
    res.json({ success: true, note: saved });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/notes/:id', auth, async (req, res) => {
  try {
    await db.deleteNote(parseInt(req.params.id), req.session.user.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── INSTAGRAM CONTENT PLANNING ─────────────────────────────────────────────

app.get('/api/instagram/accounts', auth, async (req, res) => {
  try {
    const pages = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
      params: { fields: 'id,name,instagram_business_account{id,name,username,profile_picture_url,followers_count,media_count}', access_token: req.session.accessToken, limit: 20 }
    });
    const igAccounts = [];
    (pages.data.data || []).forEach(page => {
      if (page.instagram_business_account) igAccounts.push({ pageId: page.id, pageName: page.name, ...page.instagram_business_account });
    });
    res.json({ data: igAccounts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/instagram/:igId/media', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/${req.params.igId}/media`, {
      params: { fields: 'id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,reach,impressions,engagement,saved,shares,ig_id,permalink', access_token: req.session.accessToken, limit: 24 }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const { generateContentPlanEngine } = require('./content_engine');

app.post('/api/content-plan', auth, (req, res) => {
  const { niche, igUsername, businessName, recentPosts, accountMetrics, tone, audience } = req.body;
  if (!niche) return res.status(400).json({ error: 'Nicho obrigatorio' });
  try {
    const plan = generateContentPlanEngine({ niche, igUsername, businessName, recentPosts, accountMetrics, tone, audience });
    res.json({ success: true, plan });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GOOGLE ADS AUTH ──────────────────────────────────────────────────────────

app.get('/auth/google', auth, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'Google Client ID nao configurado. Adicione GOOGLE_CLIENT_ID no .env' });
  const url = googleOAuth2.generateAuthUrl({
    access_type: 'offline', prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/adwords', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
    state: req.session.user?.id || 'anon'
  });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.redirect('/dashboard?google_error=denied');
  try {
    const { tokens } = await googleOAuth2.getToken(code);
    req.session.googleTokens = tokens;
    res.redirect('/dashboard?google=connected');
  } catch (e) { res.redirect('/dashboard?google_error=failed'); }
});

app.get('/api/google/status', auth, (req, res) => { res.json({ connected: !!req.session.googleTokens }); });

app.get('/api/google/customers', auth, async (req, res) => {
  if (!req.session.googleTokens) return res.status(401).json({ error: 'Google nao conectado' });
  if (!process.env.GOOGLE_DEVELOPER_TOKEN) return res.status(400).json({ error: 'GOOGLE_DEVELOPER_TOKEN nao configurado' });
  try {
    googleOAuth2.setCredentials(req.session.googleTokens);
    const token = await googleOAuth2.getAccessToken();
    const r = await axios.get('https://googleads.googleapis.com/v17/customers:listAccessibleCustomers', {
      headers: { 'Authorization': `Bearer ${token.token}`, 'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN }
    });
    const customers = [];
    for (const resourceName of (r.data.resourceNames || []).slice(0,10)) {
      const custId = resourceName.replace('customers/','');
      try {
        const detail = await axios.post(`https://googleads.googleapis.com/v17/customers/${custId}/googleAds:search`,
          { query: "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.status FROM customer LIMIT 1" },
          { headers: { 'Authorization': `Bearer ${token.token}`, 'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN, 'login-customer-id': custId } }
        );
        if (detail.data.results?.[0]) {
          const c = detail.data.results[0].customer;
          customers.push({ id: c.id, name: c.descriptiveName, currency: c.currencyCode, status: c.status });
        }
      } catch(err) { customers.push({ id: custId, name: custId, currency:'BRL', status:'UNKNOWN' }); }
    }
    res.json({ customers });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/google/customers/:custId/campaigns', auth, async (req, res) => {
  if (!req.session.googleTokens) return res.status(401).json({ error: 'Google nao conectado' });
  try {
    googleOAuth2.setCredentials(req.session.googleTokens);
    const token = await googleOAuth2.getAccessToken();
    const custId = req.params.custId;
    const dr = req.query.date_range || 'LAST_30_DAYS';
    const r = await axios.post(`https://googleads.googleapis.com/v17/customers/${custId}/googleAds:search`,
      { query: `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.conversions, metrics.conversions_value, metrics.search_impression_share, metrics.search_top_impression_share FROM campaign WHERE segments.date DURING ${dr} AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 100` },
      { headers: { 'Authorization': `Bearer ${token.token}`, 'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN, 'login-customer-id': custId } }
    );
    res.json({ data: r.data.results || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/google/customers/:custId/metrics', auth, async (req, res) => {
  if (!req.session.googleTokens) return res.status(401).json({ error: 'Google nao conectado' });
  try {
    googleOAuth2.setCredentials(req.session.googleTokens);
    const token = await googleOAuth2.getAccessToken();
    const custId = req.params.custId;
    const dr = req.query.date_range || 'LAST_30_DAYS';
    const r = await axios.post(`https://googleads.googleapis.com/v17/customers/${custId}/googleAds:search`,
      { query: `SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.average_cpm, metrics.conversions, metrics.conversions_value, metrics.search_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM customer WHERE segments.date DURING ${dr}` },
      { headers: { 'Authorization': `Bearer ${token.token}`, 'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN, 'login-customer-id': custId } }
    );
    let totalCost=0,totalImpr=0,totalClicks=0,totalConv=0,totalConvValue=0;
    (r.data.results||[]).forEach(row=>{
      const m=row.metrics||{};
      totalCost+=parseInt(m.costMicros||0); totalImpr+=parseInt(m.impressions||0); totalClicks+=parseInt(m.clicks||0);
      totalConv+=parseFloat(m.conversions||0); totalConvValue+=parseFloat(m.conversionsValue||0);
    });
    const spend=totalCost/1e6;
    res.json({ spend, impressions:totalImpr, clicks:totalClicks, ctr:totalImpr>0?(totalClicks/totalImpr)*100:0, avgCpc:totalClicks>0?spend/totalClicks:0, avgCpm:totalImpr>0?(spend/totalImpr)*1000:0, conversions:totalConv, conversionsValue:totalConvValue, roas:spend>0?totalConvValue/spend:0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
  if (process.env.DATABASE_URL) {
    await db.initDB();
  } else {
    console.warn('⚠️  DATABASE_URL não configurado');
  }
});
