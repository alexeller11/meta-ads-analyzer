require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const db = require('./db');
const nodemailer = require('nodemailer');
const { OpenAI } = require('openai');

const app = express();

// --- CONFIGURAÇÃO PARA RAILWAY (PROXY REVERSO) ---
app.set('trust proxy', 1);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'meta-analyzer-ultra-v8',
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

// Configuração OpenAI
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Configuração de E-mail para Alertas
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ALERT_EMAIL_USER,
    pass: process.env.ALERT_EMAIL_PASS
  }
});

async function sendLowBalanceAlert(accountName, balance) {
  if (!process.env.ALERT_EMAIL_USER || !process.env.ALERT_EMAIL_TO) return;
  try {
    await transporter.sendMail({
      from: `"Meta Ads Analyzer" <${process.env.ALERT_EMAIL_USER}>`,
      to: process.env.ALERT_EMAIL_TO,
      subject: `🚨 ALERTA: Saldo Baixo na Conta ${accountName}`,
      text: `A conta ${accountName} está com saldo de R$ ${balance.toFixed(2)}. Adicione fundos para evitar a pausa dos anúncios.`,
      html: `<h2>Alerta de Saldo Baixo</h2><p>A conta <b>${accountName}</b> está com saldo de <b>R$ ${balance.toFixed(2)}</b>.</p><p>Adicione fundos imediatamente.</p>`
    });
  } catch (e) { console.error('Erro ao enviar e-mail:', e); }
}

// --- AUTH ---
app.get('/auth/facebook', (req, res) => {
  const scopes = ['ads_read', 'ads_management', 'business_management', 'public_profile'].join(',');
  res.redirect(`https://www.facebook.com/v19.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scopes}`);
});

app.get('/auth/facebook/callback', async (req, res) => {
  if (!req.query.code) return res.redirect('/?error=no_code');
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
  } catch (err) {
    console.error('Erro no Callback:', err.response ? JSON.stringify(err.response.data) : err.message);
    res.redirect('/?error=auth_failed');
  }
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
    const r = await axios.get('https://graph.facebook.com/v19.0/me/adaccounts', {
      params: { fields: 'name,account_id,currency,account_status,funding_source_details,balance', access_token: req.session.accessToken, limit: 100 }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/consolidated-balance', auth, async (req, res) => {
  try {
    const r = await axios.get('https://graph.facebook.com/v19.0/me/adaccounts', {
      params: { fields: 'name,balance,funding_source_details', access_token: req.session.accessToken, limit: 100 }
    });
    const accounts = r.data.data || [];
    let totalPrepaidBalance = 0, prepaidCount = 0, postpaidCount = 0;
    accounts.forEach(acc => {
      const isPrepaid = acc.funding_source_details?.type === 'PREPAID' || (acc.balance && parseInt(acc.balance) < 0);
      if (isPrepaid) { totalPrepaidBalance += Math.abs(parseFloat(acc.balance || 0) / 100); prepaidCount++; }
      else postpaidCount++;
    });
    res.json({ totalPrepaidBalance, prepaidCount, postpaidCount, totalAccounts: accounts.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/balance', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}`, {
      params: { fields: 'name,balance,amount_spent,spend_cap,funding_source_details,account_status', access_token: req.session.accessToken }
    });
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
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/campaigns`, {
      params: { fields: 'id,name,status,objective,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time', access_token: req.session.accessToken, limit: 200 }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Conjuntos de Anúncios por Campanha
app.get('/api/campaigns/:id/adsets', auth, async (req, res) => {
  try {
    const { date_preset, since, until } = req.query;
    let insightsField;
    if (since && until) {
      insightsField = `insights.time_range({"since":"${since}","until":"${until}"}){impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}`;
    } else {
      insightsField = `insights.date_preset(${date_preset || 'last_30d'}){impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}`;
    }
    const fields = `id,name,status,targeting,${insightsField}`;
    const r = await axios.get(`https://graph.facebook.com/v19.0/${req.params.id}/adsets`, {
      params: { fields, access_token: req.session.accessToken, limit: 100 }
    });
    res.json(r.data);
  } catch (e) {
    console.error('Erro AdSets:', e.response ? e.response.data : e.message);
    res.status(500).json({ error: e.message });
  }
});

// Anúncios por Conjunto
app.get('/api/adsets/:id/ads', auth, async (req, res) => {
  try {
    const { date_preset, since, until } = req.query;
    let insightsField;
    if (since && until) {
      insightsField = `insights.time_range({"since":"${since}","until":"${until}"}){impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}`;
    } else {
      insightsField = `insights.date_preset(${date_preset || 'last_30d'}){impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}`;
    }
    const fields = `id,name,status,creative,${insightsField}`;
    const r = await axios.get(`https://graph.facebook.com/v19.0/${req.params.id}/ads`, {
      params: { fields, access_token: req.session.accessToken, limit: 100 }
    });
    res.json(r.data);
  } catch (e) {
    console.error('Erro Ads:', e.response ? e.response.data : e.message);
    res.status(500).json({ error: e.message });
  }
});

// INSIGHTS PRINCIPAIS - com todas as métricas de funil
app.get('/api/adaccounts/:id/insights', auth, async (req, res) => {
  try {
    const { since, until, date_preset } = req.query;
    const params = {
      fields: [
        'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
        'impressions', 'clicks', 'spend', 'cpc', 'cpm', 'ctr',
        'reach', 'frequency',
        'actions', 'action_values',
        'video_p25_watched_actions', 'video_p50_watched_actions',
        'video_p75_watched_actions', 'video_p100_watched_actions',
        'video_avg_time_watched_actions',
        'unique_clicks', 'unique_ctr',
        'cost_per_action_type', 'cost_per_unique_click'
      ].join(','),
      level: 'ad',
      access_token: req.session.accessToken,
      limit: 500
    };
    if (since && until) {
      params.time_range = JSON.stringify({ since, until });
    } else {
      params.date_preset = date_preset || 'last_30d';
    }
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) {
    console.error('Erro Insights:', e.response ? e.response.data : e.message);
    res.status(500).json({ error: e.message });
  }
});

// CRIATIVOS com métricas completas
app.get('/api/adaccounts/:id/creatives', auth, async (req, res) => {
  try {
    const { date_preset, since, until } = req.query;
    let insightsField;
    if (since && until) {
      insightsField = `insights.time_range({"since":"${since}","until":"${until}"}){impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}`;
    } else {
      insightsField = `insights.date_preset(${date_preset || 'last_30d'}){impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}`;
    }
    const params = {
      fields: `id,name,status,creative{thumbnail_url,image_url,video_id,body,title,call_to_action_type},${insightsField}`,
      access_token: req.session.accessToken,
      limit: 100
    };
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/ads`, { params });
    res.json(r.data);
  } catch (e) {
    console.error('Erro Creatives:', e.response ? e.response.data : e.message);
    res.status(500).json({ error: e.message });
  }
});

// TENDÊNCIAS do banco de dados
app.get('/api/trend/:id', auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json({ trend: [] });
    const trend = await db.getAccountTrend(req.params.id);
    res.json({ trend });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// BREAKDOWN detalhado
app.get('/api/adaccounts/:id/breakdown/:type', auth, async (req, res) => {
  try {
    const { type } = req.params;
    const { date_preset, since, until } = req.query;
    const params = {
      fields: 'impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values',
      level: 'account',
      access_token: req.session.accessToken
    };
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
  } catch (e) {
    console.error('Erro Breakdown:', e.response ? e.response.data : e.message);
    res.status(500).json({ error: e.message });
  }
});

// ANÁLISE DE CAMPANHA INDIVIDUAL (funil completo: campanha -> conjunto -> anúncio)
app.get('/api/campaigns/:id/funnel', auth, async (req, res) => {
  try {
    const { date_preset, since, until } = req.query;
    const timeParam = since && until
      ? `time_range({"since":"${since}","until":"${until}"})`
      : `date_preset(${date_preset || 'last_30d'})`;

    const insightsFields = `impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values`;

    // Buscar adsets da campanha
    const adsets = await axios.get(`https://graph.facebook.com/v19.0/${req.params.id}/adsets`, {
      params: {
        fields: `id,name,status,insights.${timeParam}{${insightsFields}}`,
        access_token: req.session.accessToken,
        limit: 100
      }
    });

    // Para cada adset, buscar os ads
    const adsetData = adsets.data.data || [];
    const enrichedAdsets = await Promise.all(adsetData.map(async (adset) => {
      try {
        const ads = await axios.get(`https://graph.facebook.com/v19.0/${adset.id}/ads`, {
          params: {
            fields: `id,name,status,creative{thumbnail_url,image_url},insights.${timeParam}{${insightsFields}}`,
            access_token: req.session.accessToken,
            limit: 100
          }
        });
        return { ...adset, ads: ads.data.data || [] };
      } catch (e) {
        return { ...adset, ads: [] };
      }
    }));

    res.json({ adsets: enrichedAdsets });
  } catch (e) {
    console.error('Erro Funnel:', e.response ? e.response.data : e.message);
    res.status(500).json({ error: e.message });
  }
});

// NOTAS de campanha
app.post('/api/notes', auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Banco de dados não configurado.' });
    const { fbAccountId, fbCampaignId, campaignName, note, type } = req.body;
    const saved = await db.saveNote({ fbUserId: req.session.user.id, fbAccountId, fbCampaignId, campaignName, note, type });
    res.json(saved);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/notes/:accountId', auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json([]);
    const notes = await db.getNotes(req.params.accountId, req.session.user.id);
    res.json(notes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/notes/:id', auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Banco de dados não configurado.' });
    await db.deleteNote(req.params.id, req.session.user.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ALERTAS de orçamento
app.post('/api/alerts', auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Banco de dados não configurado.' });
    const { fbAccountId, accountName, email, threshold, currency } = req.body;
    const alert = await db.upsertBudgetAlert({ fbUserId: req.session.user.id, fbAccountId, accountName, email, threshold, currency });
    res.json(alert);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/alerts/:accountId', auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json(null);
    const alert = await db.getBudgetAlert(req.session.user.id, req.params.accountId);
    res.json(alert);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// HISTÓRICO de análises
app.get('/api/history/:accountId', auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json([]);
    const history = await db.getRunHistory(req.params.accountId);
    res.json(history);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- MOTOR DE ANÁLISE E IA ---

// Helper: extrair valor de actions
function getAct(arr, type) {
  const f = (arr || []).find(x => x.action_type === type);
  return f ? parseFloat(f.value || 0) : 0;
}

// Helper: extrair múltiplos tipos de action
function getActMulti(arr, types) {
  let total = 0;
  for (const type of types) total += getAct(arr, type);
  return total;
}

function getMetrics(dataRows) {
  const rows = dataRows || [];
  let tSpend = 0, tImpr = 0, tClicks = 0, tPur = 0, tLds = 0, tMsg = 0;
  let tSess = 0, tRev = 0, tReach = 0, tFreq = 0, tAddCart = 0, tInitiateCheckout = 0;
  let tCalls = 0, tVideoViews = 0, tCpv = 0;
  const byId = {};

  rows.forEach(m => {
    const sp = parseFloat(m.spend || 0);
    const cl = parseInt(m.clicks || 0);
    const impr = parseInt(m.impressions || 0);
    const reach = parseInt(m.reach || 0);

    tSpend += sp; tImpr += impr; tClicks += cl; tReach += reach;

    // Compras - múltiplos tipos
    const pur = getActMulti(m.actions, [
      'offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase'
    ]);
    // Leads
    const lds = getActMulti(m.actions, [
      'offsite_conversion.fb_pixel_lead', 'lead', 'onsite_conversion.lead_grouped'
    ]);
    // Mensagens
    const msg = getActMulti(m.actions, [
      'onsite_conversion.messaging_conversation_started_7d',
      'onsite_conversion.messaging_first_reply',
      'onsite_conversion.total_messaging_connection'
    ]);
    // Sessões / Landing Page Views
    const sess = getAct(m.actions, 'landing_page_view');
    // Carrinho
    const addCart = getActMulti(m.actions, [
      'offsite_conversion.fb_pixel_add_to_cart', 'add_to_cart'
    ]);
    // Checkout
    const initCheck = getActMulti(m.actions, [
      'offsite_conversion.fb_pixel_initiate_checkout', 'initiate_checkout'
    ]);
    // Ligações
    const calls = getActMulti(m.actions, [
      'onsite_conversion.call_now_click_mobile', 'click_to_call_call_confirm'
    ]);
    // Visualizações de vídeo
    const videoViews = getActMulti(m.actions, [
      'video_view', 'video_plays_unique'
    ]);
    // Receita
    const rev = getActMulti(m.action_values, [
      'offsite_conversion.fb_pixel_purchase', 'purchase', 'omni_purchase'
    ]);

    tPur += pur; tLds += lds; tMsg += msg; tSess += sess;
    tRev += rev; tAddCart += addCart; tInitiateCheckout += initCheck;
    tCalls += calls; tVideoViews += videoViews;

    if (!byId[m.campaign_id]) {
      byId[m.campaign_id] = {
        sp: 0, cl: 0, impr: 0, reach: 0, pur: 0, lds: 0, msg: 0,
        sess: 0, rev: 0, addCart: 0, initCheck: 0, calls: 0, videoViews: 0
      };
    }
    const b = byId[m.campaign_id];
    b.sp += sp; b.cl += cl; b.impr += impr; b.reach += reach;
    b.pur += pur; b.lds += lds; b.msg += msg; b.sess += sess;
    b.rev += rev; b.addCart += addCart; b.initCheck += initCheck;
    b.calls += calls; b.videoViews += videoViews;
  });

  tFreq = tReach > 0 ? tImpr / tReach : 0;
  tCpv = tVideoViews > 0 ? tSpend / tVideoViews : 0;

  return {
    totalSpend: tSpend,
    totalImpressions: tImpr,
    totalClicks: tClicks,
    totalPurchases: tPur,
    totalLeads: tLds,
    totalMessages: tMsg,
    totalSessions: tSess,
    totalRev: tRev,
    totalReach: tReach,
    totalAddCart: tAddCart,
    totalInitiateCheckout: tInitiateCheckout,
    totalCalls: tCalls,
    totalVideoViews: tVideoViews,
    avgFrequency: tFreq,
    avgCpv: tCpv,
    roas: tSpend > 0 ? tRev / tSpend : 0,
    avgCtr: tImpr > 0 ? (tClicks / tImpr) * 100 : 0,
    avgCpc: tClicks > 0 ? tSpend / tClicks : 0,
    avgCpm: tImpr > 0 ? (tSpend / tImpr) * 1000 : 0,
    connectRate: tClicks > 0 ? (tSess / tClicks) * 100 : 0,
    costPerPurchase: tPur > 0 ? tSpend / tPur : 0,
    costPerMessage: tMsg > 0 ? tSpend / tMsg : 0,
    costPerLead: tLds > 0 ? tSpend / tLds : 0,
    byId
  };
}

app.post('/api/analyze', auth, async (req, res) => {
  const { accountData, campaigns, insights, creatives, dateRange, previousInsights } = req.body;
  try {
    const metrics = getMetrics(insights?.data);
    const prevMetrics = previousInsights ? getMetrics(previousInsights.data) : null;

    const enriched = (campaigns || []).map(c => {
      const m = metrics.byId[c.id] || {
        sp: 0, cl: 0, impr: 0, reach: 0, pur: 0, lds: 0, msg: 0,
        sess: 0, rev: 0, addCart: 0, initCheck: 0, calls: 0, videoViews: 0
      };
      const campCtr = m.impr > 0 ? (m.cl / m.impr) * 100 : 0;
      const campRoas = m.sp > 0 ? m.rev / m.sp : 0;
      const costPerMsg = m.msg > 0 ? m.sp / m.msg : 0;
      const costPerPur = m.pur > 0 ? m.sp / m.pur : 0;
      const costPerLead = m.lds > 0 ? m.sp / m.lds : 0;
      const freq = m.reach > 0 ? m.impr / m.reach : 0;
      const cpv = m.videoViews > 0 ? m.sp / m.videoViews : 0;

      let diagIA = "Aguardando dados.";
      let statusPerf = "Sem dados";
      let escalaIA = "Monitorar.";

      if (m.sp > 0) {
        if (campRoas > 4 || (m.msg > 20 && costPerMsg < 3)) {
          diagIA = "🔥 Performance excepcional!";
          statusPerf = "Excelente";
          escalaIA = "Escalar verba 20-30%.";
        } else if (campRoas > 2.5 || (m.msg > 10 && costPerMsg < 7)) {
          diagIA = "✅ Alta performance.";
          statusPerf = "Muito Bom";
          escalaIA = "Escalar verba 10-15%.";
        } else if (campRoas > 1.5 || (m.msg > 5 && costPerMsg < 12)) {
          diagIA = "📊 Performance estável.";
          statusPerf = "Bom";
          escalaIA = "Manter e otimizar.";
        } else if (m.sp > 100 && m.msg === 0 && m.pur === 0 && m.lds === 0) {
          diagIA = "🚨 Queima de verba sem retorno!";
          statusPerf = "Crítico";
          escalaIA = "Pausar imediatamente.";
        } else if (campCtr < 0.8 && m.sp > 30) {
          diagIA = "🪝 CTR muito baixo — criativo fraco.";
          statusPerf = "Criativo Ruim";
          escalaIA = "Trocar criativo urgente.";
        } else if (freq > 3.5) {
          diagIA = "😴 Fadiga de audiência detectada.";
          statusPerf = "Fadiga";
          escalaIA = "Renovar criativos ou expandir público.";
        } else {
          diagIA = "⚠️ Performance abaixo do ideal.";
          statusPerf = "Atenção";
          escalaIA = "Revisar segmentação e criativos.";
        }
      }

      return {
        ...c,
        spend: m.sp,
        ctr: campCtr,
        impressions: m.impr,
        reach: m.reach,
        frequency: freq,
        clicks: m.cl,
        purchases: m.pur,
        messages: m.msg,
        leads: m.lds,
        revenue: m.rev,
        addCart: m.addCart,
        initCheck: m.initCheck,
        calls: m.calls,
        videoViews: m.videoViews,
        roas: campRoas,
        connectRate: m.cl > 0 ? (m.sess / m.cl) * 100 : 0,
        diagnostico: diagIA,
        status_performance: statusPerf,
        escala_sugestao: escalaIA,
        costPerMsg,
        costPerPur,
        costPerLead,
        cpv
      };
    });

    const aiAnalysis = runAnalysisEngine(accountData, enriched, metrics, prevMetrics);

    // Salvar no banco para tendências se configurado
    if (process.env.DATABASE_URL) {
      try {
        await db.saveRun({
          fbAccountId: accountData.account_id,
          fbUserId: req.session.user.id,
          accountName: accountData.name,
          dateRange,
          metrics: {
            ...metrics,
            activeCampaigns: enriched.filter(c => c.status === 'ACTIVE').length,
            totalCampaigns: enriched.length
          },
          campaigns: enriched,
          aiAnalysis
        });
      } catch (dbErr) { console.error('Erro ao salvar no banco:', dbErr.message); }
    }

    res.json({
      success: true,
      analysis: { ...aiAnalysis, campanhas_analise: enriched },
      metrics,
      prevMetrics
    });
  } catch (err) {
    console.error('Erro /api/analyze:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function runAnalysisEngine(accountData, campaigns, metrics, prevMetrics) {
  let score = 100;
  const otimizacoes = [];

  // Análise de ROAS
  if (metrics.roas < 1) {
    score -= 30;
    otimizacoes.push({
      prioridade: 1, titulo: 'ROAS Negativo', categoria: 'Financeiro',
      descricao: `Seu ROAS está em ${metrics.roas.toFixed(2)}x — você está perdendo dinheiro.`,
      acao: 'Pause campanhas com ROAS < 1 e redirecione verba para as que performam.'
    });
  } else if (metrics.roas < 1.5) {
    score -= 20;
    otimizacoes.push({
      prioridade: 1, titulo: 'ROAS Baixo', categoria: 'Financeiro',
      descricao: `Seu retorno está em ${metrics.roas.toFixed(2)}x, abaixo do ideal (mínimo 1.5x).`,
      acao: 'Foque nos criativos com maior CTR e revise as páginas de destino.'
    });
  }

  // Análise de CTR
  if (metrics.avgCtr < 0.8 && metrics.totalSpend > 50) {
    score -= 15;
    otimizacoes.push({
      prioridade: 2, titulo: 'CTR Baixo', categoria: 'Criativo',
      descricao: `Seu CTR médio está em ${metrics.avgCtr.toFixed(2)}%, indicando criativos pouco atrativos.`,
      acao: 'Teste novos formatos de criativo: vídeos curtos, carrosséis e UGC tendem a ter CTR mais alto.'
    });
  }

  // Análise de Connect Rate (taxa de carregamento do site)
  if (metrics.connectRate < 60 && metrics.totalSpend > 50) {
    score -= 15;
    otimizacoes.push({
      prioridade: 2, titulo: 'Lentidão no Site', categoria: 'Funil',
      descricao: `Apenas ${metrics.connectRate.toFixed(1)}% dos cliques chegam à página. Você está desperdiçando verba.`,
      acao: 'Otimize a velocidade da landing page. Use Google PageSpeed Insights para diagnóstico.'
    });
  }

  // Análise de Frequência
  if (metrics.avgFrequency > 4) {
    score -= 10;
    otimizacoes.push({
      prioridade: 2, titulo: 'Fadiga de Audiência', categoria: 'Alcance',
      descricao: `Frequência média de ${metrics.avgFrequency.toFixed(2)} — seu público está vendo o mesmo anúncio muitas vezes.`,
      acao: 'Renove os criativos ou expanda o público-alvo para reduzir a fadiga.'
    });
  }

  // Análise de CPM alto
  if (metrics.avgCpm > 50 && metrics.totalSpend > 100) {
    score -= 10;
    otimizacoes.push({
      prioridade: 3, titulo: 'CPM Elevado', categoria: 'Custo',
      descricao: `Seu CPM está em R$ ${metrics.avgCpm.toFixed(2)}, acima da média do mercado.`,
      acao: 'Teste públicos mais amplos ou lookalike audiences para reduzir o CPM.'
    });
  }

  // Análise de tendência (comparação com período anterior)
  if (prevMetrics) {
    if (metrics.roas < prevMetrics.roas * 0.8) {
      otimizacoes.push({
        prioridade: 1, titulo: 'Queda Significativa de ROAS', categoria: 'Tendência',
        descricao: `Seu ROAS caiu de ${prevMetrics.roas.toFixed(2)}x para ${metrics.roas.toFixed(2)}x (-${(((prevMetrics.roas - metrics.roas) / prevMetrics.roas) * 100).toFixed(0)}%).`,
        acao: 'Verifique se houve fadiga de criativo, aumento de CPM ou mudança no público.'
      });
    }
    if (metrics.totalSpend > prevMetrics.totalSpend * 1.3) {
      otimizacoes.push({
        prioridade: 2, titulo: 'Aumento de Gastos', categoria: 'Tendência',
        descricao: `Seus gastos aumentaram ${(((metrics.totalSpend - prevMetrics.totalSpend) / prevMetrics.totalSpend) * 100).toFixed(0)}% em relação ao período anterior.`,
        acao: 'Verifique se o aumento de gastos está gerando retorno proporcional.'
      });
    }
  }

  // Campanhas críticas
  const criticalCamps = campaigns.filter(c => c.status_performance === 'Crítico');
  if (criticalCamps.length > 0) {
    score -= criticalCamps.length * 5;
    otimizacoes.push({
      prioridade: 1, titulo: `${criticalCamps.length} Campanha(s) Crítica(s)`, categoria: 'Campanhas',
      descricao: `${criticalCamps.map(c => c.name).join(', ')} estão queimando verba sem retorno.`,
      acao: 'Pause essas campanhas imediatamente e revise a estratégia.'
    });
  }

  const resumo_historico = score > 80
    ? `Conta saudável com ${campaigns.filter(c => c.spend > 0).length} campanhas ativas gerando resultados.`
    : score > 50
    ? `Conta com oportunidades de melhoria. ${otimizacoes.length} pontos de atenção identificados.`
    : `Conta em estado crítico. Ação imediata necessária para evitar desperdício de verba.`;

  return {
    resumo_geral: {
      score_saude: Math.max(0, score),
      nivel_saude: score > 80 ? 'Excelente' : (score > 50 ? 'Atenção' : 'Crítico'),
      resumo_historico
    },
    otimizacoes_prioritarias: otimizacoes.sort((a, b) => a.prioridade - b.prioridade)
  };
}

// GPT COPILOT - Análise IA avançada
app.post('/api/gpt-copilot', auth, async (req, res) => {
  const { data } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey === 'sua-chave-aqui' || !openai) {
    return res.json({ strategy: generateInternalStrategy(data) });
  }

  try {
    const prompt = `Você é um Diretor de Tráfego Sênior especialista em algoritmo da Meta (Andromeda) com 10+ anos de experiência. Analise os seguintes dados e gere um "Plano de Guerra" estratégico detalhado em Markdown:

DADOS DA CONTA:
${JSON.stringify(data, null, 2)}

Forneça:
1. **Diagnóstico Rápido** (3-5 linhas sobre o estado atual)
2. **Top 3 Ações Imediatas** (o que fazer AGORA)
3. **Estratégia de Escala** (como crescer nos próximos 30 dias)
4. **Alertas de Risco** (o que pode dar errado)
5. **KPIs para Monitorar** (métricas-chave para acompanhar)

Seja direto, específico e use dados concretos dos números fornecidos.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Você é um estrategista de tráfego pago sênior especializado em Meta Ads. Seja direto, use dados concretos e forneça ações práticas." },
        { role: "user", content: prompt }
      ],
      max_tokens: 1500
    });

    res.json({ strategy: completion.choices[0].message.content });
  } catch (e) {
    console.error('Erro OpenAI:', e.message);
    res.json({ strategy: generateInternalStrategy(data) });
  }
});

// GPT ANÁLISE DE CAMPANHA INDIVIDUAL
app.post('/api/gpt-campaign', auth, async (req, res) => {
  const { campaign, adsets, metrics } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey === 'sua-chave-aqui' || !openai) {
    return res.json({ analysis: generateCampaignAnalysis(campaign, adsets, metrics) });
  }

  try {
    const prompt = `Analise esta campanha de Meta Ads e forneça um diagnóstico completo do funil:

CAMPANHA: ${campaign.name}
STATUS: ${campaign.status}
OBJETIVO: ${campaign.objective || 'N/A'}

MÉTRICAS:
- Gasto: R$ ${campaign.spend?.toFixed(2)}
- ROAS: ${campaign.roas?.toFixed(2)}x
- CTR: ${campaign.ctr?.toFixed(2)}%
- Alcance: ${campaign.reach?.toLocaleString()}
- Frequência: ${campaign.frequency?.toFixed(2)}
- Compras: ${campaign.purchases}
- Mensagens: ${campaign.messages}
- Custo/Compra: R$ ${campaign.costPerPur?.toFixed(2)}

CONJUNTOS DE ANÚNCIOS:
${JSON.stringify(adsets?.slice(0, 5), null, 2)}

Forneça:
1. **Diagnóstico do Funil** (Campanha → Conjunto → Anúncio)
2. **Gargalos Identificados** (onde está perdendo performance)
3. **Ações Específicas** por nível do funil
4. **Sugestão de Escala ou Pausa**`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Você é um especialista em Meta Ads. Analise o funil completo e forneça diagnóstico preciso." },
        { role: "user", content: prompt }
      ],
      max_tokens: 1000
    });

    res.json({ analysis: completion.choices[0].message.content });
  } catch (e) {
    console.error('Erro OpenAI Campaign:', e.message);
    res.json({ analysis: generateCampaignAnalysis(campaign, adsets, metrics) });
  }
});

function generateCampaignAnalysis(campaign, adsets, metrics) {
  let s = `### 🔍 Análise de Funil: ${campaign.name}\n\n`;
  s += `**Status:** ${campaign.status} | **Performance:** ${campaign.status_performance || 'N/A'}\n\n`;
  s += `**Diagnóstico:** ${campaign.diagnostico || 'Aguardando dados.'}\n\n`;
  s += `**Métricas Principais:**\n`;
  s += `- Gasto: R$ ${(campaign.spend || 0).toFixed(2)}\n`;
  s += `- ROAS: ${(campaign.roas || 0).toFixed(2)}x\n`;
  s += `- CTR: ${(campaign.ctr || 0).toFixed(2)}%\n`;
  s += `- Frequência: ${(campaign.frequency || 0).toFixed(2)}\n\n`;
  s += `**Sugestão de Escala:** ${campaign.escala_sugestao || 'Monitorar.'}\n\n`;
  if (adsets && adsets.length > 0) {
    s += `**Conjuntos de Anúncios (${adsets.length}):**\n`;
    adsets.slice(0, 3).forEach(a => {
      const ins = a.insights?.data?.[0];
      s += `- ${a.name}: ${ins ? `R$ ${parseFloat(ins.spend || 0).toFixed(2)} gasto, CTR ${parseFloat(ins.ctr || 0).toFixed(2)}%` : 'Sem dados'}\n`;
    });
  }
  return s;
}

function generateInternalStrategy(data) {
  const { metrics, analysis } = data;
  let s = `### 🧠 Plano de Guerra (Motor Interno Sênior)\n\n`;
  s += `**Score de Saúde:** ${analysis?.resumo_geral?.score_saude || 0} pts — ${analysis?.resumo_geral?.nivel_saude || 'N/A'}\n\n`;
  s += `**Diagnóstico Rápido:**\n`;
  s += `Conta com R$ ${(metrics?.totalSpend || 0).toFixed(2)} investidos, gerando ROAS de ${(metrics?.roas || 0).toFixed(2)}x.\n\n`;
  if ((metrics?.roas || 0) < 2) s += `⚠️ **Ação de ROAS:** Retorno baixo (${(metrics?.roas || 0).toFixed(2)}x). Teste novos criativos de topo de funil.\n\n`;
  if ((metrics?.connectRate || 0) < 70) s += `🚀 **Otimização de Site:** Taxa de carregamento em ${(metrics?.connectRate || 0).toFixed(1)}%. Otimize a velocidade.\n\n`;
  if ((metrics?.avgFrequency || 0) > 3) s += `😴 **Fadiga de Audiência:** Frequência de ${(metrics?.avgFrequency || 0).toFixed(2)}. Renove os criativos.\n\n`;
  s += `💡 **Dica Andromeda:** O algoritmo da Meta performa melhor com públicos mais amplos quando a verba é limitada. Evite segmentações muito fechadas.`;
  return s;
}

app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  if (process.env.DATABASE_URL) await db.initDB();
});
