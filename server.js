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
  // BRL: mercado BR é mais competitivo — CPCs e CPMs maiores
  const bench = isBRL
    ? { ctrBom: 1.0, ctrExc: 2.0, cpcBom: 3.0, cpcAlto: 7.0, cpmBom: 20, cpmAlto: 45, freqMax: 3.5, freqCrit: 5.0, roasBom: 2.0, roasExc: 4.0 }
    : { ctrBom: 0.9, ctrExc: 1.5, cpcBom: 1.5, cpcAlto: 4.0, cpmBom: 10, cpmAlto: 25, freqMax: 3.5, freqCrit: 5.0, roasBom: 2.0, roasExc: 4.0 };

  // ── Score de saúde — multidimensional ────────────────────────────────────
  let score = 100;
  const issues = []; // {metric, severity, msg}

  // CTR (peso 25) — eficiência do criativo
  if      (avgCtr >= bench.ctrExc) { /* ótimo */ }
  else if (avgCtr >= bench.ctrBom) { score -= 5; }
  else if (avgCtr >= 0.5)          { score -= 15; issues.push({metric:'CTR', severity:'media', msg:`CTR de ${avgCtr.toFixed(2)}% abaixo do benchmark de ${bench.ctrBom}%`}); }
  else if (avgCtr >= 0.3)          { score -= 22; issues.push({metric:'CTR', severity:'alta', msg:`CTR crítico: ${avgCtr.toFixed(2)}% — criativo não está engajando`}); }
  else                              { score -= 28; issues.push({metric:'CTR', severity:'critica', msg:`CTR gravíssimo: ${avgCtr.toFixed(2)}% — trocar criativos é urgente`}); }

  // Frequência (peso 20) — saturação
  if      (avgFrequency > bench.freqCrit) { score -= 20; issues.push({metric:'Freq', severity:'critica', msg:`Frequência ${avgFrequency.toFixed(1)}x — público saturado`}); }
  else if (avgFrequency > bench.freqMax)  { score -= 12; issues.push({metric:'Freq', severity:'alta', msg:`Frequência ${avgFrequency.toFixed(1)}x — início de saturação`}); }
  else if (avgFrequency > 2.5)            { score -= 4; }
  else if (avgFrequency < 1.2 && totalSpend > 100) { score -= 6; issues.push({metric:'Freq', severity:'baixa', msg:`Frequência ${avgFrequency.toFixed(1)}x muito baixa — público muito amplo ou verba insuficiente`}); }

  // CPC (peso 15) — eficiência de custo
  if      (avgCpc > bench.cpcAlto * 1.5) { score -= 15; issues.push({metric:'CPC', severity:'alta', msg:`CPC ${S} ${avgCpc.toFixed(2)} — muito acima do ideal`}); }
  else if (avgCpc > bench.cpcAlto)        { score -= 8; issues.push({metric:'CPC', severity:'media', msg:`CPC ${S} ${avgCpc.toFixed(2)} elevado`}); }
  else if (avgCpc > bench.cpcBom)         { score -= 3; }

  // CPM (peso 10) — custo de alcance
  if      (avgCpm > bench.cpmAlto * 1.5) { score -= 10; issues.push({metric:'CPM', severity:'media', msg:`CPM ${S} ${avgCpm.toFixed(2)} — leilão muito disputado`}); }
  else if (avgCpm > bench.cpmAlto)        { score -= 5; }

  // Ativação (peso 10) — conta parada
  if (totalSpend === 0)                                { score -= 30; issues.push({metric:'Ativação', severity:'critica', msg:'Sem gasto no período — conta sem veiculação'}); }
  else if (activeCampaigns === 0 && totalCampaigns > 0){ score -= 20; issues.push({metric:'Ativação', severity:'critica', msg:'Todas as campanhas pausadas'}); }
  else if (activeCampaigns / Math.max(totalCampaigns,1) < 0.15) { score -= 8; issues.push({metric:'Ativação', severity:'media', msg:'Menos de 15% das campanhas ativas'}); }

  // Alcance (peso 5) — diversificação
  const ctr_real = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  if (Math.abs(ctr_real - avgCtr) > 0.5 && totalImpressions > 10000) {
    score -= 3; // pequena penalidade por inconsistência de dados
  }

  score = Math.max(0, Math.min(100, score));

  // ── Nível e tendência ────────────────────────────────────────────────────
  const nivel_saude = score >= 80 ? 'Excelente' : score >= 65 ? 'Bom' : score >= 45 ? 'Atenção' : score >= 25 ? 'Crítico' : 'Emergência';
  let tendencia = 'sem_historico', variacao_score = null;
  let resumo_historico = 'Primeira análise registrada. A partir de agora o sistema acompanha a evolução da conta.';

  if (previousRun?.health_score != null) {
    variacao_score = score - previousRun.health_score;
    tendencia = variacao_score > 5 ? 'melhora' : variacao_score < -5 ? 'piora' : 'estavel';
    const dt = new Date(previousRun.created_at).toLocaleDateString('pt-BR');
    const diff = variacao_score > 0 ? `subiu ${variacao_score} pts` : variacao_score < 0 ? `caiu ${Math.abs(variacao_score)} pts` : 'estável';
    resumo_historico = `Score ${diff} vs análise de ${dt} (era ${previousRun.health_score} pts). ${
      tendencia === 'melhora' ? 'As otimizações estão surtindo efeito.' :
      tendencia === 'piora'   ? 'Atenção: a conta está piorando — revise as ações tomadas.' :
      'Conta estável. Hora de testar novas abordagens para crescer.'
    }`;
  }

  const pontos_principais = issues.length > 0
    ? issues.filter(i => i.severity !== 'baixa').slice(0, 3).map(i => i.msg)
    : score >= 80
    ? ['Performance sólida — métricas dentro ou acima dos benchmarks', 'Foco em escalar o que está funcionando', 'Continue testando novos públicos e criativos']
    : ['Verifique as otimizações prioritárias abaixo', 'Execute as ações críticas antes de aumentar verba'];

  // ── Análise por campanha — estratégica ───────────────────────────────────
  const campanhas_analise = campaigns
    .filter(c => c.impressions > 0 || c.status === 'ACTIVE')
    .map(c => {
      let campScore = 100;
      let problema = '', acao = '', diagnostico_completo = '';

      // Saturação — maior risco operacional
      if (c.frequency > bench.freqCrit) {
        campScore -= 35;
        problema = `Frequência crítica: ${c.frequency.toFixed(1)}x — público esgotado`;
        acao = `PAUSAR imediatamente os conjuntos com frequência > ${bench.freqCrit}x. Criar novo conjunto com público Lookalike 2-3% baseado nos compradores. Aguardar 72h antes de reativar com público novo.`;
        diagnostico_completo = `A frequência elevadíssima indica que cada pessoa do público vê o anúncio ${c.frequency.toFixed(0)} vezes. Isso causa "banner blindness" (o cérebro ignora automaticamente), queda de CTR e aumento de CPM. O algoritmo penaliza anúncios que as pessoas ocultam.`;
      } else if (c.frequency > bench.freqMax) {
        campScore -= 18;
        problema = `Frequência elevada: ${c.frequency.toFixed(1)}x — início de saturação`;
        acao = `Expandir público em 30-50% (ampliar faixa etária, adicionar interesses similares ou ativar Advantage+ Audience). Alternar criativos — inserir 2-3 variações novas no mesmo conjunto.`;
        diagnostico_completo = `Frequência acima de ${bench.freqMax}x começa a gerar fadiga. CTR tende a cair nas próximas semanas se não houver ação. Prioridade: renovação de criativo antes de expandir público.`;
      }

      // CTR — qualidade do criativo vs público
      if (c.ctr < 0.3 && c.impressions > 5000) {
        campScore -= 30;
        problema = problema || `CTR gravíssimo: ${c.ctr.toFixed(2)}% (bench: ${bench.ctrBom}%)`;
        acao = acao || `Pausar os anúncios atuais. Criar 3 variações totalmente diferentes: 1) vídeo de 6-15s mostrando o produto/serviço em uso, 2) imagem com depoimento de cliente real, 3) oferta direta com preço ou benefício em destaque. Testar A/B por 5-7 dias.`;
        diagnostico_completo = diagnostico_completo || `CTR abaixo de 0,3% com volume significativo indica desalinhamento criativo x público. O anúncio pode não estar chamando atenção no feed, ou o público não reconhece relevância. Solução: testar ângulos completamente novos.`;
      } else if (c.ctr < bench.ctrBom && c.impressions > 2000) {
        campScore -= 12;
        problema = problema || `CTR de ${c.ctr.toFixed(2)}% abaixo do benchmark de ${bench.ctrBom}%`;
        acao = acao || `Testar headline diferente — usar pergunta direta ou número específico (ex: "Economize R$X" ou "3 motivos para..."). Testar thumbnail/imagem inicial diferente. Revisar o hook dos primeiros 3 segundos se for vídeo.`;
      }

      // CPC — eficiência de custo
      if (c.cpc > bench.cpcAlto) {
        campScore -= 15;
        problema = problema || `CPC alto: ${S} ${c.cpc.toFixed(2)}`;
        acao = acao || `Verificar se a estratégia de lance é automática (Menor Custo). Se sim: ampliar o público — públicos pequenos (<100k) leilão mais competitivo = CPC maior. Ativar Advantage+ Placements para o algoritmo encontrar inventário mais barato.`;
        diagnostico_completo = diagnostico_completo || `CPC alto pode ter 3 causas: 1) público muito pequeno e disputado, 2) criativo com baixo relevance score (o Meta cobra mais de quem o público ignora), 3) objetivo de campanha não alinhado com a ação esperada.`;
      }

      // ROAS (se disponível nas campanhas)
      const campActions = c.actions || [];
      const getAct = (arr, type) => { const f = (arr||[]).find(a => a.action_type === type); return f ? parseFloat(f.value || 0) : 0; };
      const campRev = getAct(c.action_values, 'offsite_conversion.fb_pixel_purchase');
      const campRoas = c.spend > 0 ? campRev / c.spend : 0;
      if (campRoas > 0 && campRoas < bench.roasBom && c.spend > 50) {
        campScore -= 10;
        problema = problema || `ROAS baixo: ${campRoas.toFixed(2)}x (mín. ideal: ${bench.roasBom}x)`;
        acao = acao || `Revisar funil de conversão — a campanha gera cliques mas perde na conversão. Verificar: landing page mobile, tempo de carregamento, clareza da oferta e processo de checkout. Testar anúncio com preço/oferta mais explícita.`;
      }

      // Campanha pausada com histórico de gasto
      if (c.status === 'PAUSED' && c.spend > 0) {
        problema = problema || 'Campanha pausada com histórico de gasto no período';
        acao = acao || `Analisar o motivo da pausa: foi por baixo desempenho ou proposital? Se tinha boa performance antes, considerar reativar com criativo atualizado. Se foi por frequência alta, renovar público antes de reativar.`;
      }

      if (!problema) {
        problema = 'Performance dentro dos parâmetros — sem problemas críticos';
        acao = `Documentar o que está funcionando (criativo, público, oferta) e testar escalar o orçamento em +20-30% a cada 3-5 dias enquanto o ROAS/CPL se mantiver estável.`;
      }

      campScore = Math.max(0, Math.min(100, campScore));
      const status_performance = campScore >= 80 ? 'Excelente' : campScore >= 65 ? 'Bom' : campScore >= 45 ? 'Atenção' : 'Crítico';

      return {
        nome: c.name,
        status_performance,
        gasto: `${S} ${c.spend.toFixed(2)}`,
        ctr: `${c.ctr.toFixed(2)}%`,
        cpc: `${S} ${c.cpc.toFixed(2)}`,
        frequencia: c.frequency.toFixed(2),
        problema_principal: problema,
        acao_imediata: acao,
        diagnostico: diagnostico_completo || null
      };
    });

  // ── Otimizações estratégicas priorizadas ─────────────────────────────────
  const otimizacoes = [];
  let pri = 1;

  if (avgCtr < bench.ctrBom && totalImpressions > 5000) {
    const potencial = avgCtr > 0 ? ((bench.ctrBom / avgCtr - 1) * 100).toFixed(0) : 100;
    otimizacoes.push({
      prioridade: pri++,
      titulo: 'Renovar criativos — causa raiz do CTR baixo',
      categoria: 'Criativo',
      impacto_esperado: 'Alto',
      descricao: `CTR de ${avgCtr.toFixed(2)}% vs benchmark de ${bench.ctrBom}%. Aumentar CTR para ${bench.ctrBom}% pode reduzir CPM efetivo em até ${potencial}% sem mudar verba. Cada 0,1pp de melhora no CTR = algoritmo entrega para público mais qualificado e mais barato.`,
      acao: `1. Identificar os 2-3 anúncios com maior gasto e CTR mais baixo — esses são os que mais drenam verba desnecessariamente.\n2. Para cada um, criar 3 variações: (a) vídeo UGC/depoimento real de cliente, (b) imagem com copy focada no problema que resolve, (c) antes/depois ou resultado concreto.\n3. Ativar Teste A/B nativo do Meta (Ferramentas > Teste A/B) com orçamento dividido igualmente.\n4. Após 7 dias com mínimo de 2.000 impressões por variação, pausar os perdedores.\n5. Sempre ter pelo menos 3 criativos ativos por conjunto para o algoritmo otimizar.`,
      prazo: 'Esta semana'
    });
  }

  if (avgFrequency > bench.freqMax) {
    const diasEstimados = avgFrequency > bench.freqCrit ? 3 : 7;
    otimizacoes.push({
      prioridade: pri++,
      titulo: `Combater saturação — ${avgFrequency.toFixed(1)}x de frequência`,
      categoria: 'Audiência',
      impacto_esperado: 'Alto',
      descricao: `Frequência de ${avgFrequency.toFixed(1)}x significa que cada pessoa do público viu os anúncios ~${Math.round(avgFrequency)} vezes no período. Acima de ${bench.freqMax}x o CTR começa a cair exponencialmente e o CPM sobe — o algoritmo percebe que o público está cansado. Sem ação em ${diasEstimados} dias, o CPL vai subir 30-60%.`,
      acao: `1. IMEDIATO: Criar novo conjunto de anúncios com público Lookalike 2% baseado nos compradores (ou engajadores se não houver compras).\n2. Usar Advantage+ Audience nos novos conjuntos — deixar o algoritmo encontrar o público sozinho com orientação mínima.\n3. Activar Audience Network como posicionamento adicional para dividir a frequência entre mais inventários.\n4. Nos conjuntos existentes saturados: rodar por mais 3 dias para o algoritmo otimizar os novos e então pausar os antigos.\n5. Meta: manter frequência entre 1,5x e 3,0x por semana para campanhas de awareness, e < 2x para conversão.`,
      prazo: 'Imediato'
    });
  }

  const temGasto = totalSpend > 0;
  if (temGasto && avgCpc > bench.cpcBom) {
    otimizacoes.push({
      prioridade: pri++,
      titulo: 'Otimizar custo por resultado — CPC/CPL acima do ideal',
      categoria: 'Funil',
      impacto_esperado: 'Alto',
      descricao: `CPC de ${S} ${avgCpc.toFixed(2)} pode estar escondendo um problema maior: anúncio gera cliques mas o site/landing page não converte. Antes de mexer nos anúncios, é essencial medir onde o usuário abandona o funil.`,
      acao: `1. Verificar se o Pixel do Meta está instalado e registrando os eventos corretos (ViewContent, AddToCart, Purchase/Lead).\n2. No Gerenciador de Eventos (pixel), confirmar que os eventos disparam corretamente acessando a página de vendas/contato.\n3. Testar a landing page no celular (85%+ do tráfego Meta vem de mobile): velocidade < 3s, formulário funcionando, botão visível sem scroll.\n4. Criar um conjunto com objetivo de Conversão (não de tráfego) — o Meta consegue encontrar pessoas mais propensas a converter.\n5. Se CPC é alto mas conversão é boa: o problema é só custo — testar público mais amplo (Advantage+ Shopping ou Broad sem interesse).`,
      prazo: 'Esta semana'
    });
  }

  const pctAtivas = totalCampaigns > 0 ? activeCampaigns / totalCampaigns : 1;
  if (pctAtivas < 0.5 && totalCampaigns > 3) {
    otimizacoes.push({
      prioridade: pri++,
      titulo: 'Auditar e reorganizar estrutura de campanhas',
      categoria: 'Estrutura',
      impacto_esperado: 'Médio',
      descricao: `Apenas ${(pctAtivas * 100).toFixed(0)}% das ${totalCampaigns} campanhas está ativa. Muitas campanhas paradas fragmentam o histórico de aprendizado do algoritmo e dificultam a análise. A Meta favorece contas com estrutura limpa.`,
      acao: `1. Auditar as ${totalCampaigns - activeCampaigns} campanhas pausadas: identificar quais tiveram melhor histórico de ROAS/CPL.\n2. Arquivar (não pausar) campanhas sem resultados relevantes — limpeza da interface e do histórico.\n3. Consolidar campanhas similares: em vez de 5 campanhas pequenas, ter 2-3 maiores com mais verba por conjunto (mínimo R$30-50/dia por conjunto para o algoritmo aprender).\n4. Estrutura recomendada: 1 campanha de Conversão + 1 de Retargeting + 1 de Topo de Funil/Reconhecimento.`,
      prazo: 'Este mês'
    });
  }

  otimizacoes.push({
    prioridade: pri++,
    titulo: 'Implementar / otimizar campanha de Retargeting',
    categoria: 'Funil',
    impacto_esperado: 'Alto',
    descricao: `Visitantes do site que viram um anúncio mas não converteram têm 3-5x mais chance de comprar do que público frio. Uma campanha de retargeting bem estruturada normalmente tem ROAS 2-4x maior que campanhas de aquisição, com CPL 40-60% menor.`,
    acao: `1. Criar Público Personalizado: Públicos > Criar Público > Site > Todos os visitantes dos últimos 30 dias.\n2. Criar audiences mais específicas: Visitantes da página de produto (últimos 14 dias) e Adicionou ao carrinho mas não comprou (últimos 7 dias).\n3. Campanha separada só para esses públicos — orçamento menor (20-30% do budget total de aquisição).\n4. Criativos diferentes: usar prova social (avaliações, depoimentos), oferta especial ou urgência (frete grátis, desconto limitado).\n5. Excluir compradores recentes para não desperdiçar verba em quem já converteu.`,
    prazo: 'Esta semana'
  });

  if (avgCtr >= bench.ctrBom && avgCpc <= bench.cpcBom) {
    otimizacoes.push({
      prioridade: pri++,
      titulo: 'Escalar budget de forma inteligente',
      categoria: 'Crescimento',
      impacto_esperado: 'Alto',
      descricao: `Conta com boa performance é oportunidade de escalar. Aumentar budget de forma incorreta pode destruir o aprendizado do algoritmo (fase de aprendizado reinicia). A regra de ouro: nunca mais de 20-30% de aumento por vez.`,
      acao: `1. Regra dos 20%: aumentar budget em no máximo 20-30% a cada 3-5 dias nos conjuntos com melhor ROAS.\n2. Para escalas maiores: duplicar o conjunto de anúncios (não aumentar o budget do original) — o algoritmo começa uma nova fase de aprendizado sem destruir o histórico do conjunto original.\n3. Horizontal scaling: criar novos conjuntos com públicos diferentes (Lookalike 3%, 5%, interesses não testados) usando os mesmos criativos campeões.\n4. Monitorar o CPL/ROAS a cada 24h durante a escala — se piorar mais de 20%, voltar ao budget anterior.`,
      prazo: 'Esta semana'
    });
  }

  if (avgCpm > bench.cpmAlto) {
    otimizacoes.push({
      prioridade: pri++,
      titulo: `Reduzir CPM — ${S} ${avgCpm.toFixed(2)} está acima do ideal`,
      categoria: 'Lances',
      impacto_esperado: 'Médio',
      descricao: `CPM alto significa que você está pagando mais para cada 1.000 pessoas alcançadas. Pode ser causado por: público muito restrito e disputado, posicionamentos caros (Stories, Feed principal) ou baixo relevance score do criativo.`,
      acao: `1. Ativar Advantage+ Placements — o algoritmo automaticamente prioriza posicionamentos com menor CPM.\n2. Adicionar Audience Network e Instagram Explore como posicionamentos — CPM historicamente 30-50% menor.\n3. Se CPM continuar alto com público amplo: o problema é o relevance score — o algoritmo está cobrando mais porque o público está ignorando o anúncio (resolver pelo criativo).\n4. Testar horários de menor competição: entre 13h e 17h no Brasil o CPM tende a ser 10-20% menor que no período noturno.`,
      prazo: 'Esta semana'
    });
  }

  otimizacoes.push({
    prioridade: pri++,
    titulo: 'Sistema contínuo de testes A/B',
    categoria: 'Metodologia',
    impacto_esperado: 'Médio',
    descricao: `Contas que crescem de forma consistente têm uma coisa em comum: testam constantemente. Sem metodologia de teste, é impossível saber o que realmente está causando melhora ou piora — você fica gerenciando por feeling.`,
    acao: `1. Definir uma variável por teste: criativo OU público OU landing page — nunca mais de uma ao mesmo tempo.\n2. Usar o Teste A/B nativo do Meta (Ferramentas > Teste A/B) — statistically significant.\n3. Mínimo de 7 dias e 50 eventos de conversão por variação para resultado confiável.\n4. Calendário de testes: Semana 1-2 = testar criativo, Semana 3-4 = testar público, Mês 2 = testar landing page/oferta.\n5. Documentar os resultados no sistema de Notas — criar histórico de aprendizados da conta.`,
    prazo: 'Este mês'
  });

  // ── Alertas críticos ─────────────────────────────────────────────────────
  const alertas = [];
  if (avgFrequency > bench.freqCrit) {
    alertas.push({ tipo: 'Saturação', severidade: 'Alta', mensagem: `Frequência de ${avgFrequency.toFixed(1)}x — EMERGÊNCIA: público completamente saturado. CTR vai despencar e CPM vai subir nas próximas 48-72h se não houver ação.`, acao_requerida: 'Criar novo conjunto de anúncios com público diferente HOJE. Pausar os conjuntos com frequência mais alta.' });
  }
  if (totalSpend === 0) {
    alertas.push({ tipo: 'Orçamento', severidade: 'Alta', mensagem: 'Conta sem nenhum gasto no período selecionado — possível problema de pagamento, limite atingido ou todas as campanhas pausadas.', acao_requerida: 'Verificar em Configurações > Faturamento se há falha de pagamento. Verificar se limite de gasto da conta foi atingido.' });
  }
  if (activeCampaigns === 0 && totalCampaigns > 0) {
    alertas.push({ tipo: 'Performance', severidade: 'Alta', mensagem: `${totalCampaigns} campanhas existem mas nenhuma está ativa — conta completamente parada.`, acao_requerida: 'Reativar as campanhas com melhor histórico ou criar uma nova campanha de emergência.' });
  }
  if (avgCtr < 0.3 && totalImpressions > 10000) {
    alertas.push({ tipo: 'Criativo', severidade: 'Alta', mensagem: `CTR de ${avgCtr.toFixed(2)}% com ${(totalImpressions/1000).toFixed(0)}K impressões — o algoritmo vai começar a entregar para público progressivamente pior (penalidade de relevância).`, acao_requerida: 'Pausar ou substituir os criativos principais imediatamente. CPM vai subir se o CTR continuar abaixo de 0,3%.' });
  }
  if (avgCpc > bench.cpcAlto * 2) {
    alertas.push({ tipo: 'Custo', severidade: 'Alta', mensagem: `CPC de ${S} ${avgCpc.toFixed(2)} está ${((avgCpc / bench.cpcAlto - 1) * 100).toFixed(0)}% acima do limite aceitável.`, acao_requerida: 'Revisar estratégia de lances, tamanho de público e relevância dos criativos com urgência.' });
  }

  // ── Insights históricos — comparativo inteligente ─────────────────────────
  const insights_historicos = [];
  if (previousRun) {
    const prev = {
      ctr: Number(previousRun.avg_ctr), cpc: Number(previousRun.avg_cpc), cpm: Number(previousRun.avg_cpm), freq: Number(previousRun.avg_frequency), spend: Number(previousRun.total_spend)
    };
    const varPct = (cur, old) => old > 0 ? (((cur - old) / old) * 100).toFixed(1) : null;

    if (Math.abs(avgCtr - prev.ctr) > 0.08) {
      const pct = varPct(avgCtr, prev.ctr);
      const up = avgCtr > prev.ctr;
      insights_historicos.push({
        titulo: `CTR ${up ? 'melhorou' : 'piorou'} ${Math.abs(pct)}%`,
        observacao: `De ${prev.ctr.toFixed(2)}% para ${avgCtr.toFixed(2)}%.`,
        implicacao: up ? `Boa notícia: o criativo ou público está mais alinhado. Identifique o que mudou e documente — é o que está funcionando.` : `Sinal de alerta: criativo pode estar saturando. ${avgCtr < bench.ctrBom ? 'Prioridade: renovar criativos.' : 'Monitore nos próximos 7 dias.'}`
      });
    }

    if (Math.abs(avgCpc - prev.cpc) > 0.3) {
      const up = avgCpc > prev.cpc;
      insights_historicos.push({
        titulo: `CPC ${up ? 'aumentou' : 'caiu'} — ${S} ${prev.cpc.toFixed(2)} → ${S} ${avgCpc.toFixed(2)}`,
        observacao: `Variação de ${varPct(avgCpc, prev.cpc)}% em relação à análise anterior.`,
        implicacao: up ? `Causas prováveis: aumento de competição no leilão, queda de relevance score ou público ficando mais restrito. Verificar frequência.` : `Ótimo sinal: otimizações de lance ou melhora de relevance score estão funcionando. Oportunidade de escalar.`
      });
    }

    if (prev.freq > 0 && Math.abs(avgFrequency - prev.freq) > 0.2) {
      const up = avgFrequency > prev.freq;
      insights_historicos.push({
        titulo: `Frequência ${up ? 'cresceu' : 'caiu'}: ${prev.freq.toFixed(1)}x → ${avgFrequency.toFixed(1)}x`,
        observacao: `Variação de ${varPct(avgFrequency, prev.freq)}%.`,
        implicacao: up ? avgFrequency > bench.freqMax ? `ATENÇÃO: já passou do limite seguro. Agir antes de nova análise.` : `Tendência de crescimento — monitorar. Se superar ${bench.freqMax}x, será necessário expandir público.` : `Frequência se normalizando — pode ser resultado de expansão de público ou criativo novo. Boa tendência.`
      });
    }

    const spendVar = varPct(totalSpend, prev.spend);
    if (spendVar && Math.abs(parseFloat(spendVar)) > 15) {
      const up = totalSpend > prev.spend;
      insights_historicos.push({
        titulo: `Gasto ${up ? 'aumentou' : 'diminuiu'} ${Math.abs(spendVar)}%`,
        observacao: `De ${S} ${prev.spend.toFixed(2)} para ${S} ${totalSpend.toFixed(2)} no período.`,
        implicacao: up ? avgCtr >= bench.ctrBom ? `Escala com boa performance — continue monitorando o CPL/ROAS para garantir que a eficiência se mantém.` : `Mais verba com performance ruim = prejuízo maior. Prioridade: resolver a qualidade antes de escalar.` : `Redução de gasto pode ser intencional (otimização) ou sinal de problema (limite de gasto, campanhas pausadas). Verificar o motivo.`
      });
    }

    if (insights_historicos.length === 0) {
      insights_historicos.push({
        titulo: 'Conta estável — sem variações significativas',
        observacao: `Métricas principais com menos de 10% de variação desde ${new Date(previousRun.created_at).toLocaleDateString('pt-BR')}.`,
        implicacao: `Estabilidade pode ser positiva (performance consistente) ou negativa (estagnação). Se os resultados são bons: manter e testar crescimento. Se são mediocres: é hora de mudança estratégica — mesmo resultado diferente exige abordagem diferente.`
      });
    }
  } else {
    insights_historicos.push({
      titulo: 'Primeira análise registrada',
      observacao: 'Sem histórico anterior para comparação.',
      implicacao: 'A partir de agora o sistema registra a evolução. Execute análises semanais para ter comparativos consistentes e detectar tendências antes que se tornem problemas.'
    });
  }

  // ── Oportunidades estratégicas de crescimento ────────────────────────────
  const oportunidades = [
    { titulo: 'Lookalike Audience dos melhores clientes', descricao: 'Se você tem uma lista de compradores ou leads qualificados, o Lookalike 1-3% é consistentemente o público com melhor performance em contas maduras do Meta.', potencial_impacto: `Redução típica de 25-45% no CPL e aumento de ROAS em 60-120% vs público frio de interesse. Resultado começa a aparecer em 3-7 dias após o algoritmo aprender.`, como_implementar: 'Gerenciador > Públicos > Criar Público Personalizado > Lista de clientes (upload CSV de emails). Depois: Criar Público > Semelhante > selecionar a lista como fonte > escala 1-3%.' },
    { titulo: 'Vídeos curtos (6-15s) para topo de funil', descricao: 'Conteúdo em vídeo curto no Reels tem CPM 20-40% menor que feed de imagem. Além disso, quem assiste 75%+ do vídeo pode ser usado como público de retargeting — quente e barato.', potencial_impacto: `Alcance orgânico adicional sem custo extra. Público de vídeo-viewers criado automaticamente para retargeting a custo muito baixo.`, como_implementar: 'Criar vídeo de 6-15s em formato vertical 9:16 com gancho nos primeiros 2 segundos. Selecionar posicionamento Reels no conjunto. Criar Público de Videoviews (75%+) após 7 dias rodando.' },
    { titulo: 'Campanha de engajamento para aquecer audiência', descricao: 'Estratégia de "warming": campanha de engajamento barata (R$15-25/dia) cria público quente que converte 2-4x mais na campanha de conversão. ROI total da conta melhora.', potencial_impacto: `Redução de até 50% no CPL da campanha de conversão quando alimentada com público quente (engajadores dos últimos 30 dias).`, como_implementar: 'Nova campanha com objetivo Engajamento > usar conteúdo educativo ou entretenimento relacionado ao produto > após 14 dias, criar Público Personalizado de "Pessoas que interagiram" > usar esse público na campanha de conversão.' },
    { titulo: 'Advantage+ Shopping Campaigns (se ecommerce)', descricao: 'A Meta consolidou o ASC como o tipo de campanha com melhor performance para ecommerce. O algoritmo tem total autonomia para testar criativos, públicos e posicionamentos.', potencial_impacto: `Contas que migraram para ASC reportam ROAS 15-30% maior que campanhas manuais equivalentes, com menos tempo de gestão.`, como_implementar: 'Criar campanha > tipo "Advantage+ Shopping" > fazer upload de catálogo de produtos > inserir 8-10 criativos variados > deixar o algoritmo otimizar por 14 dias antes de avaliar.' }
  ];

  // ── Plano de ação 30 dias — estratégico ──────────────────────────────────
  const plano_acao_30dias = [
    { semana: 1, foco: 'Correções críticas e baseline', acoes: [ issues.some(i => i.metric === 'Freq') ? `Resolver saturação: criar novos conjuntos com público Lookalike e pausar os com frequência > ${bench.freqMax}x` : 'Auditar todos os públicos e confirmar que não há sobreposição entre conjuntos', issues.some(i => i.metric === 'CTR') ? 'Criar 3 variações de criativo para os anúncios com CTR mais baixo e ativar Teste A/B' : 'Documentar os criativos campeões e identificar o padrão de sucesso', 'Verificar e validar instalação do Pixel em todas as páginas importantes (produto, obrigado, checkout)', `Confirmar que o objetivo de campanha está correto para o que você quer medir: se quer compras, use Conversão/Vendas de catálogo, não Tráfego` ] },
    { semana: 2, foco: 'Otimização de funil e lances', acoes: [ 'Analisar resultados do Teste A/B da Semana 1 — pausar os criativos perdedores', 'Criar campanha de Retargeting para visitantes dos últimos 30 dias com criativo de prova social', avgCpc > bench.cpcBom ? 'Mudar estratégia de lance para Custo por resultado ou Menor custo em conjuntos com CPC alto' : 'Testar aumento de 20% de budget nos conjuntos com melhor ROAS', 'Criar Lookalike Audience 1-3% baseado nos compradores ou leads mais recentes' ] },
    { semana: 3, foco: 'Expansão e novos públicos', acoes: [ 'Lançar o Lookalike criado na Semana 2 em campanha de aquisição nova', 'Testar 1 posicionamento novo: Reels ou Audience Network nos conjuntos atuais', 'Novo criativo baseado nas aprendizagens das 2 primeiras semanas: aplicar o ângulo vencedor do teste A/B', 'Revisar segmentação por dispositivo: se resultado vem mais de desktop ou mobile, concentrar verba' ] },
    { semana: 4, foco: 'Consolidação e escala', acoes: [ 'Avaliar o ROAS/CPL de todo o mês: quais campanhas superam benchmark e quais ficam abaixo?', 'Arquivar campanhas e conjuntos com performance abaixo do mínimo aceitável — limpeza da conta', avgCtr >= bench.ctrBom && avgCpc <= bench.cpcBom ? 'Planejar escala: duplicar os conjuntos campeões com budget 50-100% maior' : 'Planejar nova rodada de testes para o próximo mês com foco no ponto mais fraco identificado', 'Registrar os aprendizados do mês nas Notas do sistema para referência futura' ] }
  ];

  const proximos_passos = [
    otimizacoes[0] ? `${otimizacoes[0].prazo === 'Imediato' ? 'URGENTE' : 'Esta semana'}: ${otimizacoes[0].titulo}` : 'Auditar criativos e públicos ativos',
    otimizacoes[1] ? `Em seguida: ${otimizacoes[1].titulo}` : 'Criar campanha de retargeting',
    'Executar nova análise em 7 dias para medir o impacto das otimizações',
    'Documentar tudo nas Notas — criativo testado, público, resultado e aprendizado'
  ];

  // IMPORTANTE: Aqui removemos o "metricas_comparativas" que quebrava o script anteriormente.
  return {
    resumo_geral: { score_saude: score, nivel_saude, variacao_score, tendencia, pontos_principais, resumo_historico },
    campanhas_analise,
    otimizacoes_prioritarias: otimizacoes,
    alertas_criticos: alertas,
    insights_historicos,
    oportunidades,
    plano_acao_30dias,
    proximos_passos
  };
}

// ─── EMAIL SERVICE ────────────────────────────────────────────────────────────

function createMailTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.ALERT_EMAIL_USER,
      pass: process.env.ALERT_EMAIL_PASS
    }
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
      fbUserId: req.session.user.id,
      fbAccountId: accountId,
      accountName,
      email,
      threshold: parseFloat(threshold) || 100,
      currency: currency || 'BRL'
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
  const { newStatus } = req.body; // 'ACTIVE' or 'PAUSED'
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
    const params = {
      fields: 'impressions,clicks,spend,cpm,ctr,cpc,reach,actions,action_values',
      breakdowns: 'publisher_platform,platform_position',
      level: 'account',
      access_token: req.session.accessToken, limit: 100
    };
    if (req.query.since && req.query.until) params.time_range = JSON.stringify({ since: req.query.since, until: req.query.until });
    else params.date_preset = req.query.date_preset || 'last_30d';
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.get('/api/adaccounts/:id/breakdown/device', auth, async (req, res) => {
  try {
    const params = {
      fields: 'impressions,clicks,spend,cpm,ctr,cpc,reach,actions,action_values',
      breakdowns: 'device_platform',
      level: 'account',
      access_token: req.session.accessToken, limit: 50
    };
    if (req.query.since && req.query.until) params.time_range = JSON.stringify({ since: req.query.since, until: req.query.until });
    else params.date_preset = req.query.date_preset || 'last_30d';
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.get('/api/adaccounts/:id/breakdown/daily', auth, async (req, res) => {
  try {
    const params = {
      fields: 'impressions,clicks,spend,cpm,ctr,cpc,reach,actions,action_values,frequency',
      time_increment: 1,
      level: 'account',
      access_token: req.session.accessToken, limit: 90
    };
    if (req.query.since && req.query.until) params.time_range = JSON.stringify({ since: req.query.since, until: req.query.until });
    else params.date_preset = req.query.date_preset || 'last_30d';
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
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
    const saved = await db.saveNote({
      fbUserId: req.session.user.id,
      fbAccountId: accountId,
      fbCampaignId: campaignId,
      campaignName,
      note,
      type
    });
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
      if (page.instagram_business_account) {
        igAccounts.push({ pageId: page.id, pageName: page.name, ...page.instagram_business_account });
      }
    });
    res.json({ data: igAccounts });
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.get('/api/instagram/:igId/media', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/${req.params.igId}/media`, {
      params: {
        fields: 'id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,reach,impressions,engagement,saved,shares,ig_id,permalink',
        access_token: req.session.accessToken,
        limit: 24
      }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.get('/api/instagram/:igId/insights', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/${req.params.igId}/insights`, {
      params: {
        metric: 'reach,impressions,profile_views,website_clicks,follower_count',
        period: 'day',
        since: Math.floor(Date.now()/1000) - 30*86400,
        until: Math.floor(Date.now()/1000),
        access_token: req.session.accessToken
      }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

const { generateContentPlanEngine } = require('./content_engine');

app.post('/api/content-plan', auth, (req, res) => {
  const { niche, igUsername, businessName, recentPosts, accountMetrics, tone, audience } = req.body;
  if (!niche) return res.status(400).json({ error: 'Nicho obrigatorio' });
  try {
    const plan = generateContentPlanEngine({ niche, igUsername, businessName, recentPosts, accountMetrics, tone, audience });
    res.json({ success: true, plan });
  } catch (e) {
    console.error('Content plan error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GOOGLE ADS AUTH E METRICAS ──────────────────────────────────────────────────────────

app.get('/auth/google', auth, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'Google Client ID nao configurado. Adicione GOOGLE_CLIENT_ID no .env' });
  const url = googleOAuth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/adwords',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
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
  } catch (e) {
    console.error('Google auth error:', e.message);
    res.redirect('/dashboard?google_error=failed');
  }
});

app.get('/api/google/status', auth, (req, res) => {
  res.json({ connected: !!req.session.googleTokens });
});

app.get('/api/google/customers', auth, async (req, res) => {
  if (!req.session.googleTokens) return res.status(401).json({ error: 'Google nao conectado' });
  if (!process.env.GOOGLE_DEVELOPER_TOKEN) return res.status(400).json({ error: 'GOOGLE_DEVELOPER_TOKEN nao configurado' });
  try {
    googleOAuth2.setCredentials(req.session.googleTokens);
    const token = await googleOAuth2.getAccessToken();
    const r = await axios.get('https://googleads.googleapis.com/v17/customers:listAccessibleCustomers', {
      headers: {
        'Authorization': `Bearer ${token.token}`,
        'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN
      }
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
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
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
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
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
      totalCost+=parseInt(m.costMicros||0);
      totalImpr+=parseInt(m.impressions||0);
      totalClicks+=parseInt(m.clicks||0);
      totalConv+=parseFloat(m.conversions||0);
      totalConvValue+=parseFloat(m.conversionsValue||0);
    });
    const spend=totalCost/1e6;
    res.json({ spend, impressions:totalImpr, clicks:totalClicks, ctr:totalImpr>0?(totalClicks/totalImpr)*100:0, avgCpc:totalClicks>0?spend/totalClicks:0, avgCpm:totalImpr>0?(spend/totalImpr)*1000:0, conversions:totalConv, conversionsValue:totalConvValue, roas:spend>0?totalConvValue/spend:0 });
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
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
