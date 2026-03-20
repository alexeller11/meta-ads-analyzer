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
    if (req.query.since && req.query.until) {
      params.time_range = JSON.stringify({ since: req.query.since, until: req.query.until });
    } else {
      params.date_preset = req.query.date_preset || 'last_30d';
    }
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

// ─── ANALYZE (MOTOR IA ESPECIALISTA RESTAURADO) ──────────────────────────────
app.post('/api/analyze', auth, async (req, res) => {
  const { accountData, campaigns, insights, dateRange } = req.body;
  try {
    const rows = insights?.data || [];
    let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalReach = 0, freqSum = 0, freqCount = 0;
    const byId = {};
    rows.forEach(m => {
      totalSpend += parseFloat(m.spend || 0); totalImpressions += parseInt(m.impressions || 0); 
      totalClicks += parseInt(m.clicks || 0); totalReach += parseInt(m.reach || 0);
      if (m.frequency) { freqSum += parseFloat(m.frequency); freqCount++; }
      byId[m.campaign_id] = m;
    });

    const metrics = { 
      totalSpend, totalImpressions, totalClicks, totalReach,
      avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0, 
      avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0, 
      avgCpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0, 
      avgFrequency: freqCount > 0 ? freqSum / freqCount : 0,
      activeCampaigns: campaigns.filter(c => c.status === 'ACTIVE').length, 
      totalCampaigns: campaigns.length 
    };

    const enriched = campaigns.map(c => {
      const m = byId[c.id] || {};
      return { ...c, spend: parseFloat(m.spend || 0), impressions: parseInt(m.impressions || 0), clicks: parseInt(m.clicks || 0), reach: parseInt(m.reach || 0), ctr: parseFloat(m.ctr || 0), cpc: parseFloat(m.cpc || 0), cpm: parseFloat(m.cpm || 0), frequency: parseFloat(m.frequency || 0), actions: m.actions || [], action_values: m.action_values || [] };
    });
    
    const previousRun = await db.getLastRun(accountData.account_id);
    const aiAnalysis = runAnalysisEngine(accountData, enriched, metrics, previousRun);
    
    await db.saveRun({ fbAccountId: accountData.account_id, fbUserId: req.session.user.id, accountName: accountData.name, dateRange, metrics, campaigns: enriched, aiAnalysis });
    res.json({ success: true, analysis: aiAnalysis, metrics, previousRun });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const safeNum = (val) => Number(val) || 0;

function runAnalysisEngine(accountData, campaigns, metrics, previousRun) {
  const { avgCtr, avgCpc, avgCpm, avgFrequency, totalSpend, activeCampaigns, totalCampaigns } = metrics;
  const S = accountData.currency === 'BRL' ? 'R$' : accountData.currency === 'USD' ? '$' : (accountData.currency || 'R$');
  const isBRL = accountData.currency === 'BRL';

  const bench = isBRL
    ? { ctrBom: 1.0, ctrExc: 2.0, cpcBom: 3.0, cpcAlto: 7.0, cpmBom: 20, cpmAlto: 45, freqMax: 3.5, freqCrit: 5.0, roasBom: 2.0 }
    : { ctrBom: 0.9, ctrExc: 1.5, cpcBom: 1.5, cpcAlto: 4.0, cpmBom: 10, cpmAlto: 25, freqMax: 3.5, freqCrit: 5.0, roasBom: 2.0 };

  let score = 100;
  const issues = []; 

  if      (avgCtr >= bench.ctrExc) {  }
  else if (avgCtr >= bench.ctrBom) { score -= 5; }
  else if (avgCtr >= 0.5)          { score -= 15; issues.push({metric:'CTR', severity:'media', msg:`CTR de ${safeNum(avgCtr).toFixed(2)}% abaixo do benchmark de ${bench.ctrBom}%.`}); }
  else                             { score -= 28; issues.push({metric:'CTR', severity:'critica', msg:`CTR crítico: ${safeNum(avgCtr).toFixed(2)}% — renovar criativos urgente.`}); }

  if      (avgFrequency > bench.freqCrit) { score -= 20; issues.push({metric:'Freq', severity:'critica', msg:`Frequência ${safeNum(avgFrequency).toFixed(1)}x — público saturado.`}); }
  else if (avgFrequency > bench.freqMax)  { score -= 12; issues.push({metric:'Freq', severity:'alta', msg:`Frequência ${safeNum(avgFrequency).toFixed(1)}x — início de saturação.`}); }

  if      (avgCpc > bench.cpcAlto * 1.5) { score -= 15; issues.push({metric:'CPC', severity:'alta', msg:`CPC de ${S} ${safeNum(avgCpc).toFixed(2)} muito acima do ideal.`}); }
  else if (avgCpc > bench.cpcAlto)        { score -= 8; issues.push({metric:'CPC', severity:'media', msg:`CPC elevado.`}); }

  if (totalSpend === 0) { score -= 30; issues.push({metric:'Ativação', severity:'critica', msg:'Conta sem veiculação no período.'}); }

  score = Math.max(0, Math.min(100, score));

  const nivel_saude = score >= 80 ? 'Excelente' : score >= 65 ? 'Bom' : score >= 45 ? 'Atenção' : 'Crítico';
  let tendencia = 'sem_historico', variacao_score = null;
  let resumo_historico = 'Primeira análise registrada. O sistema acompanhará a evolução a partir de agora.';

  if (previousRun?.health_score != null) {
    variacao_score = score - previousRun.health_score;
    tendencia = variacao_score > 5 ? 'melhora' : variacao_score < -5 ? 'piora' : 'estavel';
    const diff = variacao_score > 0 ? `subiu ${variacao_score} pts` : variacao_score < 0 ? `caiu ${Math.abs(variacao_score)} pts` : 'estável';
    resumo_historico = `Score ${diff} vs análise anterior (era ${previousRun.health_score} pts).`;
  }

  const pontos_principais = issues.length > 0 ? issues.filter(i => i.severity !== 'baixa').slice(0, 3).map(i => i.msg) : ['Performance sólida — métricas dentro dos benchmarks.', 'Continue testando novos públicos e criativos.'];

  const campanhas_analise = campaigns.filter(c => c.impressions > 0 || c.status === 'ACTIVE').map(c => {
      let campScore = 100;
      let problema = '', acao = '';

      if (c.frequency > bench.freqCrit) { campScore -= 35; problema = `Frequência crítica: ${safeNum(c.frequency).toFixed(1)}x`; acao = `PAUSAR conjuntos esgotados e usar Lookalike.`; } 
      else if (c.frequency > bench.freqMax) { campScore -= 18; problema = `Frequência elevada: ${safeNum(c.frequency).toFixed(1)}x`; acao = `Expandir público ou rotacionar criativos.`; }
      if (c.ctr < 0.3 && c.impressions > 5000) { campScore -= 30; problema = problema || `CTR gravíssimo: ${safeNum(c.ctr).toFixed(2)}%`; acao = acao || `Pausar anúncios atuais e criar ângulos novos.`; } 
      else if (c.ctr < bench.ctrBom && c.impressions > 2000) { campScore -= 12; problema = problema || `CTR de ${safeNum(c.ctr).toFixed(2)}% abaixo do ideal`; acao = acao || `Testar headline ou hook de 3 segundos diferente.`; }
      if (c.cpc > bench.cpcAlto) { campScore -= 15; problema = problema || `CPC alto: ${S} ${safeNum(c.cpc).toFixed(2)}`; acao = acao || `Verificar estratégia de lance ou ampliar público.`; }
      if (!problema) { problema = 'Performance dentro dos parâmetros'; acao = `Escalar orçamento em 20%.`; }

      campScore = Math.max(0, Math.min(100, campScore));
      return {
        nome: c.name, status_performance: campScore >= 80 ? 'Excelente' : campScore >= 65 ? 'Bom' : campScore >= 45 ? 'Atenção' : 'Crítico',
        gasto: `${S} ${safeNum(c.spend).toFixed(2)}`, ctr: `${safeNum(c.ctr).toFixed(2)}%`, cpc: `${S} ${safeNum(c.cpc).toFixed(2)}`, frequencia: safeNum(c.frequency).toFixed(2),
        problema_principal: problema, acao_imediata: acao, campId: c.id, campStatus: c.status
      };
    });

  const otimizacoes = [];
  let pri = 1;

  if (avgCtr < bench.ctrBom && totalImpressions > 5000) {
    otimizacoes.push({ prioridade: pri++, titulo: 'Renovar criativos — causa raiz do CTR baixo', categoria: 'Criativo', impacto_esperado: 'Alto', descricao: `Seu CTR médio está em ${safeNum(avgCtr).toFixed(2)}%. Aumentar o CTR para ${bench.ctrBom}% pode reduzir drasticamente o seu custo por conversão.`, acao: `Identifique os anúncios com maior gasto e crie 3 novas variações com ganchos (hooks) diferentes nos primeiros 3 segundos.`, prazo: 'Esta semana' });
  }
  if (avgFrequency > bench.freqMax) {
    otimizacoes.push({ prioridade: pri++, titulo: `Combater saturação — Frequência de ${safeNum(avgFrequency).toFixed(1)}x`, categoria: 'Audiência', impacto_esperado: 'Alto', descricao: `O público já viu seus anúncios muitas vezes, causando "banner blindness".`, acao: `Crie um novo conjunto com público Lookalike (Semelhante) 2% baseado nos compradores recentes.`, prazo: 'Imediato' });
  }
  if (totalSpend > 0 && avgCpc > bench.cpcBom) {
    otimizacoes.push({ prioridade: pri++, titulo: 'Otimizar Custo por Clique Elevado', categoria: 'Funil', impacto_esperado: 'Alto', descricao: `O CPC está acima do benchmark. O leilão pode estar muito competitivo ou o público pequeno.`, acao: `Ative Advantage+ Placements e teste públicos abertos sem interesses definidos.`, prazo: 'Esta semana' });
  }
  
  if(pri === 1 && totalSpend > 0) {
      otimizacoes.push({ prioridade: pri++, titulo: 'Escalar orçamento — Conta Saudável', categoria: 'Crescimento', impacto_esperado: 'Médio', descricao: `Suas métricas estão estáveis e dentro do benchmark. É o momento de escalar.`, acao: `Aumente o orçamento das campanhas com melhor ROAS em até 20% a cada 3 dias.`, prazo: 'Este mês' });
  }

  return {
    resumo_geral: { score_saude: score, nivel_saude, variacao_score, tendencia, pontos_principais, resumo_historico },
    campanhas_analise,
    otimizacoes_prioritarias: otimizacoes,
    alertas_criticos: issues.filter(i => i.severity !== 'baixa').map(i => ({ tipo: i.metric, severidade: 'Alta', mensagem: i.msg, acao_requerida: 'Ação URGENTE recomendada' })),
    insights_historicos: previousRun ? [{ titulo: 'Comparativo Histórico', observacao: resumo_historico, implicacao: 'Mantenha os testes constantes.' }] : [],
    oportunidades: [{ titulo: 'Públicos Semelhantes (Lookalike)', descricao: 'O Lookalike 1-3% é incrivelmente consistente em contas maduras.', potencial_impacto: `Redução típica de 25% no CPL.`, como_implementar: 'Upload de lista de clientes.' }],
    plano_acao_30dias: [
      { semana: 1, foco: 'Correções críticas e Baseline', acoes: ['Resolver saturação e auditar públicos', 'Criar variações de criativo e ativar teste A/B'] },
      { semana: 2, foco: 'Retargeting e Lances', acoes: ['Criar campanha para visitantes dos últimos 30 dias', 'Avaliar CPC e ajustar lances'] }
    ],
    proximos_passos: ['Execute as otimizações #1', 'Reavalie a conta em 5 dias']
  };
}

// ─── OUTRAS ROTAS (IG, GOOGLE, TENDÊNCIAS) ──────────────────────────────────
app.get('/api/trend/:accountId', auth, async (req, res) => { try { res.json({ trend: await db.getAccountTrend(req.params.accountId) }); } catch (e) { res.status(500).json({ error: e.message }); } });

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
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'GOOGLE_CLIENT_ID não configurado no Render.' });
  res.redirect(googleOAuth2.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/adwords', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'], state: req.session.user?.id }));
});

app.get('/auth/google/callback', async (req, res) => {
  if (req.query.error) return res.redirect('/dashboard?google_error=denied');
  try { const { tokens } = await googleOAuth2.getToken(req.query.code); req.session.googleTokens = tokens; res.redirect('/dashboard?google=connected'); } catch (e) { res.redirect('/dashboard?google_error=failed'); }
});

app.get('/api/google/status', auth, (req, res) => res.json({ connected: !!req.session.googleTokens }));

app.get('/api/google/customers', auth, async (req, res) => {
  if (!req.session.googleTokens || !process.env.GOOGLE_DEVELOPER_TOKEN) return res.status(401).json({ error: 'Falta Google Token' });
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

app.get('/dashboard', (req, res) => { if (!req.session.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => { console.log(`🚀 Meta Ads Analyzer on port ${PORT}`); if (process.env.DATABASE_URL) await db.initDB(); });
