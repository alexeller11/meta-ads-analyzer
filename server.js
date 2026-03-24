require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const nodemailer = require('nodemailer');
const { OpenAI } = require('openai');
const db = require('./db');
const benchmarks = require('./benchmarks');
const { getBenchmark, buildDecisionCenter } = require('./decision-engine');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'meta-analyzer-ultra-v9',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const REDIRECT_URI = `${process.env.BASE_URL}/auth/facebook/callback`;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ALERT_EMAIL_USER,
    pass: process.env.ALERT_EMAIL_PASS
  }
});

function auth(req, res, next) {
  if (!req.session.accessToken) return res.status(401).json({ error: 'Sessão expirada.' });
  next();
}

async function sendLowBalanceAlert(accountName, balance) {
  if (!process.env.ALERT_EMAIL_USER || !process.env.ALERT_EMAIL_TO) return;
  try {
    await transporter.sendMail({
      from: `"Meta Ads Analyzer" <${process.env.ALERT_EMAIL_USER}>`,
      to: process.env.ALERT_EMAIL_TO,
      subject: `🚨 ALERTA: Saldo baixo em ${accountName}`,
      text: `Conta ${accountName} com saldo de R$ ${balance.toFixed(2)}.`
    });
  } catch (e) {
    console.error('Erro ao enviar e-mail:', e.message);
  }
}

function getAct(arr, type) {
  if (!Array.isArray(arr)) return 0;
  const item = arr.find(x => x?.action_type === type);
  const v = parseFloat(item?.value || 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function getActMulti(arr, types) {
  for (const t of (types || [])) {
    const value = getAct(arr, t);
    if (value > 0) return value;
  }
  return 0;
}

function sanitize(val) {
  const num = Number(val || 0);
  return Number.isFinite(num) ? num : 0;
}

function getMetrics(dataRows) {
  const rows = Array.isArray(dataRows) ? dataRows : [];
  let tSpend = 0, tImpr = 0, tClicks = 0, tPur = 0, tLds = 0, tMsg = 0;
  let tSess = 0, tRev = 0, tReach = 0, tAddCart = 0, tInitiateCheckout = 0;
  let tCalls = 0, tVideoViews = 0;
  const byId = {};

  rows.forEach(m => {
    const sp = sanitize(m.spend);
    const cl = sanitize(m.clicks);
    const impr = sanitize(m.impressions);
    const reach = sanitize(m.reach);

    tSpend += sp; tImpr += impr; tClicks += cl; tReach += reach;

    const pur = getActMulti(m.actions, ['offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase']);
    const lds = getActMulti(m.actions, ['offsite_conversion.fb_pixel_lead', 'lead', 'onsite_conversion.lead_grouped']);
    const msg = getActMulti(m.actions, [
      'onsite_conversion.messaging_conversation_started_7d',
      'onsite_conversion.messaging_first_reply',
      'onsite_conversion.total_messaging_connection'
    ]);
    const sess = getAct(m.actions, 'landing_page_view');
    const addCart = getActMulti(m.actions, ['offsite_conversion.fb_pixel_add_to_cart', 'add_to_cart']);
    const initCheck = getActMulti(m.actions, ['offsite_conversion.fb_pixel_initiate_checkout', 'initiate_checkout']);
    const calls = getActMulti(m.actions, ['onsite_conversion.call_now_click_mobile', 'click_to_call_call_confirm']);
    const videoViews = getActMulti(m.actions, ['video_view', 'video_plays_unique']);
    const rev = getActMulti(m.action_values, ['offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase']);

    tPur += pur; tLds += lds; tMsg += msg; tSess += sess; tRev += rev;
    tAddCart += addCart; tInitiateCheckout += initCheck; tCalls += calls; tVideoViews += videoViews;

    const campId = m.campaign_id || 'unknown';
    if (!byId[campId]) byId[campId] = { sp: 0, cl: 0, impr: 0, reach: 0, pur: 0, lds: 0, msg: 0, sess: 0, rev: 0, addCart: 0, initCheck: 0, calls: 0, videoViews: 0 };
    const b = byId[campId];
    b.sp += sp; b.cl += cl; b.impr += impr; b.reach += reach; b.pur += pur; b.lds += lds; b.msg += msg; b.sess += sess; b.rev += rev; b.addCart += addCart; b.initCheck += initCheck; b.calls += calls; b.videoViews += videoViews;
  });

  const avgFrequency = tReach > 0 ? tImpr / tReach : 0;
  return {
    totalSpend: sanitize(tSpend),
    totalImpressions: sanitize(tImpr),
    totalClicks: sanitize(tClicks),
    totalPurchases: sanitize(tPur),
    totalLeads: sanitize(tLds),
    totalMessages: sanitize(tMsg),
    totalSessions: sanitize(tSess),
    totalRev: sanitize(tRev),
    totalReach: sanitize(tReach),
    totalAddCart: sanitize(tAddCart),
    totalInitiateCheckout: sanitize(tInitiateCheckout),
    totalCalls: sanitize(tCalls),
    totalVideoViews: sanitize(tVideoViews),
    avgFrequency: sanitize(avgFrequency),
    avgCpv: sanitize(tVideoViews > 0 ? tSpend / tVideoViews : 0),
    roas: sanitize(tSpend > 0 ? tRev / tSpend : 0),
    avgCtr: sanitize(tImpr > 0 ? (tClicks / tImpr) * 100 : 0),
    avgCpc: sanitize(tClicks > 0 ? tSpend / tClicks : 0),
    avgCpm: sanitize(tImpr > 0 ? (tSpend / tImpr) * 1000 : 0),
    connectRate: sanitize(tClicks > 0 ? (tSess / tClicks) * 100 : 0),
    costPerPurchase: sanitize(tPur > 0 ? tSpend / tPur : 0),
    costPerMessage: sanitize(tMsg > 0 ? tSpend / tMsg : 0),
    costPerLead: sanitize(tLds > 0 ? tSpend / tLds : 0),
    byId
  };
}

function runAnalysisEngine({ niche = 'Geral', campaigns = [], metrics = {}, prevMetrics = null }) {
  const benchmark = getBenchmark(niche, benchmarks);
  let score = 100;
  const items = [];

  if (metrics.roas < benchmark.minRoas * 0.5) {
    score -= 28;
    items.push({ prioridade: 1, categoria: 'Financeiro', titulo: 'ROAS crítico', descricao: `ROAS em ${metrics.roas.toFixed(2)}x, muito abaixo do benchmark do nicho.`, acao: 'Cortar desperdício e redistribuir orçamento para campanhas eficientes.' });
  } else if (metrics.roas < benchmark.minRoas) {
    score -= 14;
    items.push({ prioridade: 1, categoria: 'Financeiro', titulo: 'ROAS abaixo do ideal', descricao: `ROAS em ${metrics.roas.toFixed(2)}x ainda abaixo da meta do nicho.`, acao: 'Revisar oferta, público e criativos antes de ampliar gasto.' });
  }

  if (metrics.avgCtr < benchmark.minCtr && metrics.totalSpend >= benchmark.minSpendForDecision) {
    score -= 12;
    items.push({ prioridade: 2, categoria: 'Criativo', titulo: 'CTR baixo', descricao: `CTR médio em ${metrics.avgCtr.toFixed(2)}%, sugerindo criativos fracos ou promessa pouco atrativa.`, acao: 'Criar novas aberturas, ganchos e primeiras cenas.' });
  }

  if (metrics.connectRate < benchmark.minConnectRate && metrics.totalClicks > 30) {
    score -= 12;
    items.push({ prioridade: 2, categoria: 'Funil', titulo: 'Perda entre clique e página', descricao: `Connect rate em ${metrics.connectRate.toFixed(1)}%, abaixo do esperado.`, acao: 'Revisar carregamento, consistência da oferta e UX da página.' });
  }

  if (metrics.avgFrequency > benchmark.maxFrequency) {
    score -= 10;
    items.push({ prioridade: 2, categoria: 'Fadiga', titulo: 'Frequência alta', descricao: `Frequência média em ${metrics.avgFrequency.toFixed(2)}, com risco de saturação.`, acao: 'Renovar criativos e abrir público novo.' });
  }

  if (prevMetrics && prevMetrics.roas > 0 && metrics.roas < prevMetrics.roas * 0.8) {
    score -= 10;
    items.push({ prioridade: 1, categoria: 'Tendência', titulo: 'Queda relevante de ROAS', descricao: `ROAS caiu de ${prevMetrics.roas.toFixed(2)}x para ${metrics.roas.toFixed(2)}x.`, acao: 'Checar se a queda veio de CPM, CTR, frequência ou piora do funil.' });
  }

  const critical = campaigns.filter(c => c.status_performance === 'Crítico');
  if (critical.length) {
    score -= Math.min(20, critical.length * 5);
    items.push({ prioridade: 1, categoria: 'Campanhas', titulo: `${critical.length} campanha(s) crítica(s)`, descricao: 'Há campanhas queimando verba sem responder em resultado.', acao: 'Pausar ou reestruturar imediatamente.' });
  }

  return {
    resumo_geral: {
      score_saude: Math.max(0, score),
      nivel_saude: score > 80 ? 'Excelente' : score > 55 ? 'Atenção' : 'Crítico',
      resumo_historico: score > 80 ? 'Conta saudável, com bons sinais operacionais.' : score > 55 ? 'Conta com pontos de melhoria que já merecem ação.' : 'Conta em zona crítica, com perda de eficiência e risco de desperdício.'
    },
    otimizacoes_prioritarias: items.sort((a, b) => a.prioridade - b.prioridade)
  };
}

function internalStrategy(data) {
  const { metrics, analysis, decisionCenter } = data;
  return [
    `# Plano de Guerra`,
    ``,
    `## Leitura executiva`,
    `Score de saúde: **${analysis?.resumo_geral?.score_saude || 0}**`,
    `ROAS: **${metrics?.roas?.toFixed(2) || '0.00'}x**`,
    `Desperdício estimado: **R$ ${(decisionCenter?.summary?.totalEstimatedWaste || 0).toFixed(2)}**`,
    ``,
    `## Ações imediatas`,
    ...(decisionCenter?.immediateActions || []).map(x => `- ${x}`),
    ``,
    `## Escala`,
    ...(decisionCenter?.allocationSuggestions?.length ? decisionCenter.allocationSuggestions.map(x => `- ${x.campaignName}: sugerir +R$ ${x.suggestedExtraBudget.toFixed(2)} por estar em faixa de eficiência`) : ['- Nenhuma sugestão clara de escala neste momento.']),
    ``,
    `## Foco diário`,
    `- ROAS`,
    `- CTR`,
    `- Frequência`,
    `- Custo por resultado principal`,
    ``,
    `## Observação`,
    `Escalar só o que converte com margem. O resto deve ser mantido sob teste ou cortado.`
  ].join('\n');
}

app.get('/auth/facebook', (req, res) => {
  const scopes = ['ads_read', 'ads_management', 'business_management', 'public_profile'].join(',');
  res.redirect(`https://www.facebook.com/v19.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scopes}`);
});

app.get('/auth/facebook/callback', async (req, res) => {
  if (!req.query.code) return res.redirect('/?error=no_code');
  try {
    const t1 = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', { params: { client_id: FB_APP_ID, client_secret: FB_APP_SECRET, redirect_uri: REDIRECT_URI, code: req.query.code } });
    const t2 = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', { params: { grant_type: 'fb_exchange_token', client_id: FB_APP_ID, client_secret: FB_APP_SECRET, fb_exchange_token: t1.data.access_token } });
    req.session.accessToken = t2.data.access_token;
    const user = await axios.get('https://graph.facebook.com/v19.0/me', { params: { fields: 'id,name,picture', access_token: req.session.accessToken } });
    req.session.user = user.data;
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Erro no callback:', err.response?.data || err.message);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/api/me', (req, res) => res.json(req.session.user ? { authenticated: true, user: req.session.user } : { authenticated: false }));
app.get('/auth/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

app.get('/api/adaccounts', auth, async (req, res) => {
  try {
    const r = await axios.get('https://graph.facebook.com/v19.0/me/adaccounts', { params: { fields: 'name,account_id,currency,account_status,funding_source_details,balance', access_token: req.session.accessToken, limit: 100 } });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/balance', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}`, { params: { fields: 'name,balance,amount_spent,spend_cap,funding_source_details,account_status', access_token: req.session.accessToken } });
    const data = r.data;
    const funding = data.funding_source_details || {};
    data.is_prepaid = funding.type === 'PREPAID' || (data.balance && parseInt(data.balance) < 0);
    data.readable_balance = data.balance ? Math.abs(parseFloat(data.balance) / 100) : 0;
    if (data.is_prepaid && data.readable_balance < 100) await sendLowBalanceAlert(data.name, data.readable_balance);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/campaigns', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/campaigns`, { params: { fields: 'id,name,status,objective,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time', access_token: req.session.accessToken, limit: 200 } });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/insights', auth, async (req, res) => {
  try {
    const { since, until, date_preset } = req.query;
    const params = {
      fields: [
        'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
        'impressions', 'clicks', 'spend', 'cpc', 'cpm', 'ctr',
        'reach', 'frequency', 'actions', 'action_values',
        'video_p25_watched_actions', 'video_p50_watched_actions',
        'video_p75_watched_actions', 'video_p100_watched_actions',
        'unique_clicks', 'unique_ctr', 'cost_per_action_type', 'cost_per_unique_click'
      ].join(','),
      level: 'ad',
      access_token: req.session.accessToken,
      limit: 500
    };
    if (since && until) params.time_range = JSON.stringify({ since, until });
    else params.date_preset = date_preset || 'last_30d';
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) {
    console.error('Erro Insights:', e.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/adaccounts/:id/creatives', auth, async (req, res) => {
  try {
    const { date_preset, since, until } = req.query;
    const insightsField = since && until
      ? `insights.time_range({"since":"${since}","until":"${until}"}){impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}`
      : `insights.date_preset(${date_preset || 'last_30d'}){impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}`;
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/ads`, {
      params: {
        fields: `id,name,status,creative{thumbnail_url,image_url,video_id,body,title,call_to_action_type},${insightsField}`,
        access_token: req.session.accessToken,
        limit: 100
      }
    });
    res.json(r.data);
  } catch (e) {
    console.error('Erro creatives:', e.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/adaccounts/:id/comparison', auth, async (req, res) => {
  try {
    const { date_preset, since, until } = req.query;
    const params = { fields: 'impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values', level: 'account', access_token: req.session.accessToken };
    if (since && until) params.time_range = JSON.stringify({ since, until });
    else params.date_preset = date_preset || 'last_30d';

    const currentRes = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    const current = getMetrics(currentRes.data?.data);

    const prevParams = { ...params };
    if (date_preset === 'last_7d') prevParams.date_preset = 'last_7d_excluding_today';
    else if (date_preset === 'last_14d') prevParams.date_preset = 'last_14d_excluding_today';
    else if (date_preset === 'last_30d') prevParams.date_preset = 'last_30d_excluding_today';
    else if (date_preset === 'last_90d') prevParams.date_preset = 'last_90d_excluding_today';
    else prevParams.date_preset = 'last_30d_excluding_today';

    const prevRes = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params: prevParams }).catch(() => ({ data: { data: [] } }));
    const previous = getMetrics(prevRes.data?.data);

    res.json({
      current,
      previous,
      comparison: {
        spendChange: previous.totalSpend ? ((current.totalSpend - previous.totalSpend) / previous.totalSpend) * 100 : 0,
        roasChange: previous.roas ? ((current.roas - previous.roas) / previous.roas) * 100 : 0,
        ctrChange: previous.avgCtr ? ((current.avgCtr - previous.avgCtr) / previous.avgCtr) * 100 : 0
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/adaccounts/:id/breakdown/:type', auth, async (req, res) => {
  try {
    const { type } = req.params;
    const { date_preset, since, until } = req.query;
    const params = { fields: 'impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values', level: 'account', access_token: req.session.accessToken };
    if (since && until) params.time_range = JSON.stringify({ since, until });
    else params.date_preset = date_preset || 'last_30d';
    if (type === 'device') params.breakdowns = 'device_platform';
    else if (type === 'platform') params.breakdowns = 'publisher_platform';
    else if (type === 'position') params.breakdowns = 'platform_position';
    else if (type === 'gender') params.breakdowns = 'gender';
    else if (type === 'age') params.breakdowns = 'age';
    else if (type === 'region') params.breakdowns = 'region';
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/trend/:id', auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json({ trend: [] });
    const trend = await db.getAccountTrend(req.params.id);
    res.json({ trend });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notes', auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Banco não configurado.' });
    const { fbAccountId, fbCampaignId, campaignName, note, type } = req.body;
    const saved = await db.saveNote({ fbUserId: req.session.user.id, fbAccountId, fbCampaignId, campaignName, note, type });
    res.json(saved);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/notes/:accountId', auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json([]);
    res.json(await db.getNotes(req.params.accountId, req.session.user.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/notes/:id', auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Banco não configurado.' });
    await db.deleteNote(req.params.id, req.session.user.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/alerts', auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Banco não configurado.' });
    const { fbAccountId, accountName, email, threshold, currency } = req.body;
    const alert = await db.upsertBudgetAlert({ fbUserId: req.session.user.id, fbAccountId, accountName, email, threshold, currency });
    res.json(alert);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/alerts/:accountId', auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json(null);
    res.json(await db.getBudgetAlert(req.session.user.id, req.params.accountId));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/history/:accountId', auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json([]);
    res.json(await db.getRunHistory(req.params.accountId));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/analyze', auth, async (req, res) => {
  try {
    const { accountData, campaigns = [], insights, dateRange, niche = 'Geral', previousMetrics = null } = req.body;
    if (!accountData || !insights) return res.status(400).json({ error: 'accountData e insights são obrigatórios.' });

    const metrics = getMetrics(insights?.data);
    const benchmark = getBenchmark(niche, benchmarks);

    const enriched = campaigns.map(c => {
      const m = metrics.byId[c.id] || { sp: 0, cl: 0, impr: 0, reach: 0, pur: 0, lds: 0, msg: 0, sess: 0, rev: 0, addCart: 0, initCheck: 0, calls: 0, videoViews: 0 };
      const ctr = m.impr > 0 ? (m.cl / m.impr) * 100 : 0;
      const roas = m.sp > 0 ? m.rev / m.sp : 0;
      const frequency = m.reach > 0 ? m.impr / m.reach : 0;
      const costPerMsg = m.msg > 0 ? m.sp / m.msg : 0;
      const costPerPur = m.pur > 0 ? m.sp / m.pur : 0;
      const costPerLead = m.lds > 0 ? m.sp / m.lds : 0;

      let diagnostico = 'Monitorar.';
      let status_performance = 'Sem dados';
      let escala_sugestao = 'Monitorar.';

      if (m.sp > 0) {
        if (roas >= benchmark.minRoas * 1.35 || (m.msg >= 8 && costPerMsg <= benchmark.goodMessageCost)) {
          diagnostico = 'Campanha com ótima eficiência.';
          status_performance = 'Excelente';
          escala_sugestao = 'Escalar entre 15% e 25%.';
        } else if (m.sp >= benchmark.minSpendForDecision && m.msg === 0 && m.pur === 0 && m.lds === 0) {
          diagnostico = 'Consumiu verba sem resposta útil.';
          status_performance = 'Crítico';
          escala_sugestao = 'Pausar e reestruturar.';
        } else if (ctr < benchmark.minCtr && m.sp >= benchmark.minSpendForDecision) {
          diagnostico = 'Criativo não está segurando atenção.';
          status_performance = 'Criativo Ruim';
          escala_sugestao = 'Trocar criativo antes de escalar.';
        } else if (frequency > benchmark.maxFrequency) {
          diagnostico = 'Frequência alta, com risco de fadiga.';
          status_performance = 'Fadiga';
          escala_sugestao = 'Renovar criativos e abrir público.';
        } else {
          diagnostico = 'Campanha com sinal misto. Vale otimizar antes de subir verba.';
          status_performance = 'Atenção';
          escala_sugestao = 'Manter e otimizar.';
        }
      }

      return {
        ...c,
        spend: sanitize(m.sp),
        ctr: sanitize(ctr),
        impressions: sanitize(m.impr),
        reach: sanitize(m.reach),
        frequency: sanitize(frequency),
        clicks: sanitize(m.cl),
        purchases: sanitize(m.pur),
        messages: sanitize(m.msg),
        leads: sanitize(m.lds),
        revenue: sanitize(m.rev),
        addCart: sanitize(m.addCart),
        initCheck: sanitize(m.initCheck),
        calls: sanitize(m.calls),
        videoViews: sanitize(m.videoViews),
        roas: sanitize(roas),
        connectRate: sanitize(m.cl > 0 ? (m.sess / m.cl) * 100 : 0),
        diagnostico,
        status_performance,
        escala_sugestao,
        costPerMsg: sanitize(costPerMsg),
        costPerPur: sanitize(costPerPur),
        costPerLead: sanitize(costPerLead),
        cpv: sanitize(m.videoViews > 0 ? m.sp / m.videoViews : 0)
      };
    });

    const analysis = runAnalysisEngine({ niche, campaigns: enriched, metrics, prevMetrics: previousMetrics });
    const decisionCenter = buildDecisionCenter(enriched, metrics, benchmark);

    if (process.env.DATABASE_URL) {
      try {
        await db.saveRun({
          fbAccountId: accountData.account_id,
          fbUserId: req.session.user.id,
          accountName: accountData.name,
          dateRange,
          metrics: { ...metrics, activeCampaigns: enriched.filter(c => c.status === 'ACTIVE').length, totalCampaigns: enriched.length },
          campaigns: enriched,
          aiAnalysis: { ...analysis, decisionCenter }
        });
      } catch (e) {
        console.error('Erro ao salvar histórico:', e.message);
      }
    }

    res.json({ success: true, metrics, prevMetrics: previousMetrics, analysis: { ...analysis, campanhas_analise: enriched, decision_center: decisionCenter } });
  } catch (e) {
    console.error('Erro /api/analyze:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/gpt-copilot', auth, async (req, res) => {
  const { data } = req.body;
  if (!openai) return res.json({ strategy: internalStrategy(data) });
  try {
    const prompt = `Você é um diretor de tráfego pago sênior. Analise estes dados e escreva um plano de guerra em markdown, direto, com foco em corte de desperdício, escala e priorização. Dados: ${JSON.stringify(data).slice(0, 12000)}`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Seja objetivo, estratégico e orientado a decisão.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1200
    });
    res.json({ strategy: completion.choices[0].message.content });
  } catch (e) {
    res.json({ strategy: internalStrategy(data) });
  }
});

app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  res.sendFile(path.resolve(__dirname, 'public', 'dashboard.html'));
});
app.get('/', (req, res) => res.sendFile(path.resolve(__dirname, 'public', 'index.html')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.includes('.')) return next();
  res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  if (process.env.DATABASE_URL) await db.initDB();
});
