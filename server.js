require("dotenv").config();
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const db = require("./db");
const benchmarks = require("./benchmarks");
const nodemailer = require("nodemailer");
const { OpenAI } = require("openai");
const decisionEngine = require("./decision-engine-v2");

const app = express();

app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
        "style-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
        "img-src": ["'self'", "data:", "https:", "http:"],
        "connect-src": ["'self'", "https://graph.facebook.com", "https://api.openai.com"],
      },
    },
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api", limiter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || (() => { throw new Error("SESSION_SECRET não configurado."); })(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "lax"
    }
  })
);

const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const REDIRECT_URI = `${process.env.BASE_URL}/auth/facebook/callback`;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.ALERT_EMAIL_USER, pass: process.env.ALERT_EMAIL_PASS }
});

// ─── HELPERS ────────────────────────────────────────────────────────────────

function isValidDateString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validateAnalyzePayload(body) {
  const { accountData, campaigns, insights } = body || {};
  if (!accountData || typeof accountData !== "object") return "accountData é obrigatório.";
  if (!Array.isArray(campaigns)) return "campaigns é obrigatório e deve ser array.";
  if (!insights || !Array.isArray(insights.data)) return "insights.data é obrigatório e deve ser array.";
  return null;
}

function auth(req, res, next) {
  if (!req.session.accessToken) return res.status(401).json({ error: "Sessão expirada." });
  next();
}

// ─── CORRIGIDO: getAct agora valida tipo do array ────────────────────────────
function getAct(arr, type) {
  if (!Array.isArray(arr) || !type) return 0;
  const found = arr.find((x) => x && String(x.action_type || "") === String(type));
  const val = parseFloat(found?.value || 0);
  return Number.isFinite(val) ? Math.max(0, val) : 0;
}

function getActMulti(arr, types) {
  if (!Array.isArray(arr) || !Array.isArray(types)) return 0;
  for (const type of types) {
    const val = getAct(arr, type);
    if (val > 0) return val;
  }
  return 0;
}

// ─── CORRIGIDO: Connect Rate usa link_clicks, não clicks totais ──────────────
// clicks totais = cliques em reações, shares, etc.
// link_clicks = apenas cliques que direcionam para URL → base correta para Connect Rate
function getMetrics(dataRows) {
  const rows = Array.isArray(dataRows) ? dataRows : [];
  let tSpend = 0, tImpr = 0, tClicks = 0, tLinkClicks = 0;
  let tPur = 0, tLds = 0, tMsg = 0;
  let tSess = 0, tRev = 0, tReach = 0;
  let tAddCart = 0, tInitiateCheckout = 0, tCalls = 0, tVideoViews = 0;
  const byId = {};

  rows.forEach((m) => {
    const sp    = Math.max(0, parseFloat(m?.spend || 0) || 0);
    const cl    = Math.max(0, parseInt(m?.clicks || 0) || 0);
    const impr  = Math.max(0, parseInt(m?.impressions || 0) || 0);
    const reach = Math.max(0, parseInt(m?.reach || 0) || 0);

    // CORRIGIDO: link_clicks do campo actions (inline_link_clicks é mais preciso)
    const linkCl = Math.max(
      0,
      parseInt(m?.inline_link_clicks || 0) ||
      getAct(m?.actions, "link_click") ||
      0
    );

    tSpend += sp;
    tImpr  += impr;
    tClicks += cl;
    tLinkClicks += linkCl;
    tReach += reach;

    const pur = getActMulti(m.actions, [
      "offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"
    ]);
    const lds = getActMulti(m.actions, [
      "offsite_conversion.fb_pixel_lead", "lead", "onsite_conversion.lead_grouped"
    ]);
    const msg = getActMulti(m.actions, [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply",
      "onsite_conversion.total_messaging_connection"
    ]);
    const sess     = getAct(m.actions, "landing_page_view");
    const addCart  = getActMulti(m.actions, ["offsite_conversion.fb_pixel_add_to_cart","add_to_cart"]);
    const initCheck= getActMulti(m.actions, ["offsite_conversion.fb_pixel_initiate_checkout","initiate_checkout"]);
    const calls    = getActMulti(m.actions, ["onsite_conversion.call_now_click_mobile","click_to_call_call_confirm"]);
    const videoViews = getActMulti(m.actions, ["video_view","video_plays_unique"]);
    const rev = getActMulti(m.action_values, [
      "offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"
    ]);

    tPur  += pur;
    tLds  += lds;
    tMsg  += msg;
    tSess += sess;
    tRev  += rev;
    tAddCart += addCart;
    tInitiateCheckout += initCheck;
    tCalls += calls;
    tVideoViews += videoViews;

    const campId = m.campaign_id || "unknown";
    if (!byId[campId]) {
      byId[campId] = {
        sp: 0, cl: 0, linkCl: 0, impr: 0, reach: 0,
        pur: 0, lds: 0, msg: 0, sess: 0, rev: 0,
        addCart: 0, initCheck: 0, calls: 0, videoViews: 0
      };
    }
    byId[campId].sp       += sp;
    byId[campId].cl       += cl;
    byId[campId].linkCl   += linkCl;
    byId[campId].impr     += impr;
    byId[campId].reach    += reach;
    byId[campId].pur      += pur;
    byId[campId].lds      += lds;
    byId[campId].msg      += msg;
    byId[campId].sess     += sess;
    byId[campId].rev      += rev;
    byId[campId].addCart  += addCart;
    byId[campId].initCheck+= initCheck;
    byId[campId].calls    += calls;
    byId[campId].videoViews += videoViews;
  });

  const tFreq = tReach > 0 ? tImpr / tReach : 0;
  const safe  = (n) => { const x = Number(n || 0); return Number.isFinite(x) ? x : 0; };

  // CORRIGIDO: usa linkClicks como base do connect rate, não clicks totais
  const baseForConnect = tLinkClicks > 0 ? tLinkClicks : tClicks;

  return {
    totalSpend:             safe(tSpend),
    totalImpressions:       safe(tImpr),
    totalClicks:            safe(tClicks),
    totalLinkClicks:        safe(tLinkClicks),
    totalPurchases:         safe(tPur),
    totalLeads:             safe(tLds),
    totalMessages:          safe(tMsg),
    totalSessions:          safe(tSess),
    totalRev:               safe(tRev),
    totalReach:             safe(tReach),
    totalAddCart:           safe(tAddCart),
    totalInitiateCheckout:  safe(tInitiateCheckout),
    totalCalls:             safe(tCalls),
    totalVideoViews:        safe(tVideoViews),
    avgFrequency:           safe(tFreq),
    roas:                   safe(tSpend > 0 ? tRev / tSpend : 0),
    avgCtr:                 safe(tImpr > 0 ? (tClicks / tImpr) * 100 : 0),
    avgCpc:                 safe(tClicks > 0 ? tSpend / tClicks : 0),
    avgCpm:                 safe(tImpr > 0 ? (tSpend / tImpr) * 1000 : 0),
    // CORRIGIDO: Connect Rate = landing_page_views / link_clicks
    connectRate:            safe(baseForConnect > 0 ? (tSess / baseForConnect) * 100 : 0),
    costPerPurchase:        safe(tPur > 0 ? tSpend / tPur : 0),
    costPerMessage:         safe(tMsg > 0 ? tSpend / tMsg : 0),
    costPerLead:            safe(tLds > 0 ? tSpend / tLds : 0),
    byId
  };
}

function variation(current, previous) {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function buildComparisonFromMetrics(currentMetrics, prevMetrics) {
  return {
    current: currentMetrics,
    previous: prevMetrics,
    comparison: {
      spendChange:       variation(currentMetrics.totalSpend,     prevMetrics.totalSpend),
      roasChange:        variation(currentMetrics.roas,           prevMetrics.roas),
      ctrChange:         variation(currentMetrics.avgCtr,         prevMetrics.avgCtr),
      purchasesChange:   variation(currentMetrics.totalPurchases, prevMetrics.totalPurchases),
      connectRateChange: variation(currentMetrics.connectRate,    prevMetrics.connectRate)
    }
  };
}

function getComparisonPreset(preset) {
  if (preset === "last_7d")  return "last_7d_excluding_today";
  if (preset === "last_30d") return "last_30d_excluding_today";
  if (preset === "last_90d") return "last_90d_excluding_today";
  return null;
}

function buildCustomPreviousRange(since, until) {
  if (!since || !until) return null;
  const start    = new Date(`${since}T00:00:00`);
  const end      = new Date(`${until}T00:00:00`);
  const diffDays = Math.round((end - start) / 86400000) + 1;
  const prevEnd  = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (diffDays - 1));
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  return { since: fmt(prevStart), until: fmt(prevEnd) };
}

function getBrazilDateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour") || 0) };
}

async function hasDaily8amSnapshotToday(fbAccountId, fbUserId) {
  const { date } = getBrazilDateParts();
  const label = `AUTO_DAILY_08_${date}`;
  const { rows } = await db.pool.query(
    `SELECT id FROM analysis_runs WHERE fb_account_id=$1 AND fb_user_id=$2 AND date_range=$3 LIMIT 1`,
    [fbAccountId, fbUserId, label]
  );
  return !!rows[0];
}

async function saveAutomaticDaily8amSnapshotIfNeeded({ fbAccountId, fbUserId, accountName, metrics, campaigns, aiAnalysis }) {
  if (!process.env.DATABASE_URL) return;
  const { date, hour } = getBrazilDateParts();
  if (hour < 8) return;
  const alreadySaved = await hasDaily8amSnapshotToday(fbAccountId, fbUserId);
  if (alreadySaved) return;
  await db.saveRun({
    fbAccountId, fbUserId, accountName,
    dateRange: `AUTO_DAILY_08_${date}`,
    metrics: { ...metrics, activeCampaigns: campaigns.filter(c => c.status==="ACTIVE").length, totalCampaigns: campaigns.length },
    campaigns,
    aiAnalysis
  });
}

async function fetchAllPages(url, baseParams) {
  let nextUrl = url;
  let params  = { ...baseParams };
  const data  = [];
  while (nextUrl) {
    const response = await axios.get(nextUrl, { params });
    if (Array.isArray(response.data?.data)) data.push(...response.data.data);
    nextUrl = response.data?.paging?.next || null;
    params  = undefined;
  }
  return data;
}

async function sendLowBalanceAlert(accountName, balance) {
  if (!process.env.ALERT_EMAIL_USER || !process.env.ALERT_EMAIL_TO) return;
  try {
    await transporter.sendMail({
      from: `"Meta Ads Analyzer" <${process.env.ALERT_EMAIL_USER}>`,
      to:   process.env.ALERT_EMAIL_TO,
      subject: `🚨 ALERTA: Saldo Baixo na Conta ${accountName}`,
      html: `<h2>Alerta de Saldo Baixo</h2><p>A conta <b>${accountName}</b> está com saldo de <b>R$ ${balance.toFixed(2)}</b>.</p>`
    });
  } catch(e) { console.error("Erro e-mail:", e.message); }
}

// ─── NOVO: alertas automáticos de campanhas queimando verba ─────────────────
async function sendBurningCampaignAlert(accountName, campaignName, spend) {
  if (!process.env.ALERT_EMAIL_USER || !process.env.ALERT_EMAIL_TO) return;
  try {
    await transporter.sendMail({
      from: `"Meta Ads Analyzer" <${process.env.ALERT_EMAIL_USER}>`,
      to: process.env.ALERT_EMAIL_TO,
      subject: `🔥 CAMPANHA QUEIMANDO VERBA: ${campaignName}`,
      html: `
        <h2>Campanha Queimando Verba Sem Conversão</h2>
        <p>Conta: <b>${accountName}</b></p>
        <p>Campanha: <b>${campaignName}</b></p>
        <p>Gasto sem conversão: <b>R$ ${spend.toFixed(2)}</b></p>
        <p>Nenhuma mensagem, compra ou lead foi gerado. Recomendamos pausar ou revisar imediatamente.</p>
      `
    });
  } catch(e) { console.error("Erro e-mail campanha:", e.message); }
}

// ─── NOVO: detectar fadiga preditiva por tendência de CTR ───────────────────
function detectPredictiveFatigue(campaignHistory) {
  if (!Array.isArray(campaignHistory) || campaignHistory.length < 3) {
    return { hasFatigue: false, reason: null };
  }

  const recent = campaignHistory.slice(-3);
  const ctrs   = recent.map(r => parseFloat(r.avg_ctr || 0));

  const allDecreasing = ctrs[0] > ctrs[1] && ctrs[1] > ctrs[2];
  const totalDrop     = ctrs[0] > 0 ? ((ctrs[0] - ctrs[2]) / ctrs[0]) * 100 : 0;

  if (allDecreasing && totalDrop >= 15) {
    return {
      hasFatigue: true,
      reason: `CTR caiu ${totalDrop.toFixed(1)}% em 3 períodos consecutivos (${ctrs[0].toFixed(2)}% → ${ctrs[2].toFixed(2)}%). Renove o criativo antes que a performance piore.`
    };
  }

  return { hasFatigue: false, reason: null };
}

// ─── NOVO: benchmarks por objetivo de campanha ──────────────────────────────
const objectiveBenchmarks = {
  OUTCOME_LEADS: {
    label: "Geração de Leads",
    minRoas: 1.0,
    minCtr: 1.5,
    maxFrequency: 3.5,
    minConnectRate: 65,
    maxCpm: 40,
    primaryMetric: "leads",
    secondaryMetric: "costPerLead"
  },
  OUTCOME_SALES: {
    label: "Conversões / Vendas",
    minRoas: 2.0,
    minCtr: 1.0,
    maxFrequency: 3.5,
    minConnectRate: 70,
    maxCpm: 35,
    primaryMetric: "purchases",
    secondaryMetric: "costPerPurchase"
  },
  OUTCOME_ENGAGEMENT: {
    label: "Engajamento",
    minRoas: 0,
    minCtr: 2.0,
    maxFrequency: 5.0,
    minConnectRate: 0,
    maxCpm: 20,
    primaryMetric: "clicks",
    secondaryMetric: "avgCtr"
  },
  OUTCOME_TRAFFIC: {
    label: "Tráfego",
    minRoas: 0,
    minCtr: 1.8,
    maxFrequency: 4.0,
    minConnectRate: 60,
    maxCpm: 25,
    primaryMetric: "totalSessions",
    secondaryMetric: "connectRate"
  },
  MESSAGES: {
    label: "Mensagens",
    minRoas: 1.5,
    minCtr: 1.2,
    maxFrequency: 3.0,
    minConnectRate: 60,
    maxCpm: 30,
    primaryMetric: "messages",
    secondaryMetric: "costPerMessage"
  },
  DEFAULT: {
    label: "Geral",
    minRoas: 2.0,
    minCtr: 1.0,
    maxFrequency: 3.5,
    minConnectRate: 70,
    maxCpm: 35,
    primaryMetric: "roas",
    secondaryMetric: "avgCtr"
  }
};

function getObjectiveBenchmark(objective) {
  const key = String(objective || "").toUpperCase();
  return objectiveBenchmarks[key] || objectiveBenchmarks.DEFAULT;
}

// ─── AUTH ────────────────────────────────────────────────────────────────────
app.get("/auth/facebook", (req, res) => {
  const scopes = ["ads_read","ads_management","business_management","public_profile"].join(",");
  res.redirect(
    `https://www.facebook.com/v19.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scopes}`
  );
});

app.get("/auth/facebook/callback", async (req, res) => {
  if (!req.query.code) return res.redirect("/?error=no_code");
  try {
    const t1 = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
      params: { client_id: FB_APP_ID, client_secret: FB_APP_SECRET, redirect_uri: REDIRECT_URI, code: req.query.code }
    });
    const t2 = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
      params: { grant_type: "fb_exchange_token", client_id: FB_APP_ID, client_secret: FB_APP_SECRET, fb_exchange_token: t1.data.access_token }
    });
    req.session.accessToken = t2.data.access_token;
    const user = await axios.get("https://graph.facebook.com/v19.0/me", {
      params: { fields: "id,name,picture", access_token: req.session.accessToken }
    });
    req.session.user = user.data;
    res.redirect("/dashboard");
  } catch (err) {
    console.error("Erro callback:", err.response?.data || err.message);
    res.redirect("/?error=auth_failed");
  }
});

app.get("/api/me", (req, res) => {
  res.json(req.session.user ? { authenticated: true, user: req.session.user } : { authenticated: false });
});

app.get("/auth/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.get("/health", (req, res) => res.status(200).json({ ok: true, service: "meta-ads-analyzer" }));

// ─── AD ACCOUNTS ─────────────────────────────────────────────────────────────
app.get("/api/adaccounts", auth, async (req, res) => {
  try {
    const data = await fetchAllPages("https://graph.facebook.com/v19.0/me/adaccounts", {
      fields: "name,account_id,currency,account_status,funding_source_details,balance",
      access_token: req.session.accessToken,
      limit: 100
    });
    res.json({ data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/adaccounts/:id/campaigns", auth, async (req, res) => {
  try {
    const data = await fetchAllPages(`https://graph.facebook.com/v19.0/act_${req.params.id}/campaigns`, {
      fields: "id,name,status,objective,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time",
      access_token: req.session.accessToken,
      limit: 100
    });
    res.json({ data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/adaccounts/:id/insights", auth, async (req, res) => {
  try {
    const { since, until, date_preset } = req.query;
    if ((since && !until) || (!since && until)) return res.status(400).json({ error: "since e until devem ser informados juntos." });
    if (since && (!isValidDateString(since) || !isValidDateString(until))) return res.status(400).json({ error: "Datas inválidas. Use YYYY-MM-DD." });

    const params = {
      fields: [
        "campaign_id","campaign_name","adset_id","adset_name","ad_id","ad_name",
        "impressions","clicks","inline_link_clicks","spend","cpc","cpm","ctr",
        "reach","frequency","actions","action_values",
        "video_p25_watched_actions","video_p50_watched_actions",
        "video_p75_watched_actions","video_p100_watched_actions",
        "video_avg_time_watched_actions","unique_clicks","unique_ctr",
        "cost_per_action_type","cost_per_unique_click"
      ].join(","),
      level: "ad",
      access_token: req.session.accessToken,
      limit: 100
    };
    if (since && until) { params.time_range = JSON.stringify({ since, until }); }
    else { params.date_preset = date_preset || "last_30d"; }

    const data = await fetchAllPages(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, params);
    res.json({ data });
  } catch(e) {
    console.error("Erro insights:", e.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/adaccounts/:id/comparison", auth, async (req, res) => {
  try {
    const { date_preset, since, until } = req.query;
    if ((since && !until)||(!since && until)) return res.status(400).json({ error: "since e until devem ser informados juntos." });
    if (since && (!isValidDateString(since)||!isValidDateString(until))) return res.status(400).json({ error: "Datas inválidas." });

    const fields = "impressions,clicks,inline_link_clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values";
    const currentParams  = { fields, level: "account", access_token: req.session.accessToken, limit: 100 };
    const previousParams = { fields, level: "account", access_token: req.session.accessToken, limit: 100 };

    if (since && until) {
      currentParams.time_range  = JSON.stringify({ since, until });
      const prev = buildCustomPreviousRange(since, until);
      if (prev) previousParams.time_range = JSON.stringify(prev);
    } else {
      currentParams.date_preset  = date_preset || "last_30d";
      previousParams.date_preset = getComparisonPreset(date_preset || "last_30d") || "last_30d_excluding_today";
    }

    const [currentData, previousData] = await Promise.all([
      fetchAllPages(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, currentParams),
      fetchAllPages(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, previousParams)
    ]);

    res.json(buildComparisonFromMetrics(getMetrics(currentData), getMetrics(previousData)));
  } catch(e) {
    console.error("Erro comparison:", e.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/adaccounts/:id/creatives", auth, async (req, res) => {
  try {
    const { date_preset, since, until } = req.query;
    if ((since && !until)||(!since && until)) return res.status(400).json({ error: "since e until devem ser informados juntos." });
    if (since && (!isValidDateString(since)||!isValidDateString(until))) return res.status(400).json({ error: "Datas inválidas." });

    const insightsField = since && until
      ? `insights.time_range({"since":"${since}","until":"${until}"}){impressions,clicks,inline_link_clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}`
      : `insights.date_preset(${date_preset || "last_30d"}){impressions,clicks,inline_link_clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}`;

    const data = await fetchAllPages(`https://graph.facebook.com/v19.0/act_${req.params.id}/ads`, {
      fields: `id,name,status,creative{thumbnail_url,image_url,video_id,body,title,call_to_action_type},${insightsField}`,
      access_token: req.session.accessToken,
      limit: 100
    });
    res.json({ data });
  } catch(e) {
    console.error("Erro creatives:", e.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/adaccounts/:id/breakdown/:type", auth, async (req, res) => {
  try {
    const { type } = req.params;
    const { date_preset, since, until } = req.query;
    if ((since && !until)||(!since && until)) return res.status(400).json({ error: "since e until devem ser informados juntos." });
    if (since && (!isValidDateString(since)||!isValidDateString(until))) return res.status(400).json({ error: "Datas inválidas." });

    const params = {
      fields: "impressions,clicks,inline_link_clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values",
      level: "account",
      access_token: req.session.accessToken,
      limit: 100
    };
    if (since && until) { params.time_range = JSON.stringify({ since, until }); }
    else { params.date_preset = date_preset || "last_30d"; }

    const breakdownMap = {
      device: "device_platform", platform: "publisher_platform",
      position: "platform_position", gender: "gender",
      age: "age", region: "region", city: "city"
    };
    if (!breakdownMap[type]) return res.status(400).json({ error: "Breakdown inválido." });
    params.breakdowns = breakdownMap[type];

    const data = await fetchAllPages(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, params);
    res.json({ data });
  } catch(e) {
    console.error("Erro breakdown:", e.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/history/:accountId", auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json([]);
    const history = await db.getDailyRunHistory(req.params.accountId);
    res.json(history);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── NOVO: endpoint de histórico de campanha para fadiga preditiva ───────────
app.get("/api/campaign-history/:accountId/:campaignId", auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json([]);
    const { rows } = await db.pool.query(
      `SELECT avg_ctr, created_at FROM campaign_snapshots
       WHERE fb_account_id=$1 AND fb_campaign_id=$2
       ORDER BY created_at DESC LIMIT 10`,
      [req.params.accountId, req.params.campaignId]
    );
    res.json(rows.reverse());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── NOVO: endpoint de escala com cálculo de orçamento sugerido ──────────────
app.post("/api/scale-recommendation", auth, (req, res) => {
  const { currentBudget, roas, targetRoas = 2.0, attributionWindow = 7 } = req.body;

  if (!currentBudget || !roas) {
    return res.status(400).json({ error: "currentBudget e roas são obrigatórios." });
  }

  const budget = parseFloat(currentBudget);
  const currentRoas = parseFloat(roas);

  let scalePercent = 0;
  let recommendation = "Manter";
  let urgency = "low";

  if (currentRoas >= 4.0) {
    scalePercent = 30;
    recommendation = "Escala agressiva";
    urgency = "high";
  } else if (currentRoas >= 3.0) {
    scalePercent = 20;
    recommendation = "Escala moderada";
    urgency = "high";
  } else if (currentRoas >= 2.5) {
    scalePercent = 10;
    recommendation = "Escala conservadora";
    urgency = "medium";
  } else if (currentRoas >= 2.0) {
    scalePercent = 0;
    recommendation = "Manter e otimizar";
    urgency = "low";
  } else {
    scalePercent = -20;
    recommendation = "Reduzir orçamento";
    urgency = "high";
  }

  const newBudget     = budget * (1 + scalePercent / 100);
  const budgetDelta   = newBudget - budget;
  const projectedRev  = newBudget * currentRoas;
  const revenueGain   = budgetDelta * currentRoas;

  res.json({
    currentBudget:    parseFloat(budget.toFixed(2)),
    suggestedBudget:  parseFloat(newBudget.toFixed(2)),
    budgetIncrease:   parseFloat(budgetDelta.toFixed(2)),
    scalePercent,
    recommendation,
    urgency,
    projectedDailyRevenue: parseFloat(projectedRev.toFixed(2)),
    estimatedDailyRevenueGain: parseFloat(revenueGain.toFixed(2)),
    attributionWindow,
    note: `Aumente o orçamento em ${scalePercent}% a cada 48h. Monitorar por 3 dias antes de novo ajuste.`
  });
});

// ─── NOVO: alertas automáticos de campanhas queimando verba ─────────────────
app.post("/api/check-burning-campaigns", auth, async (req, res) => {
  const { campaigns, accountName, thresholdSpend = 50 } = req.body;
  if (!Array.isArray(campaigns)) return res.status(400).json({ error: "campaigns é obrigatório." });

  const burning = campaigns.filter(c => {
    const spend    = parseFloat(c.spend || 0);
    const hasConv  = (c.messages || 0) > 0 || (c.purchases || 0) > 0 || (c.leads || 0) > 0;
    return spend >= thresholdSpend && !hasConv;
  });

  if (burning.length > 0 && accountName) {
    for (const c of burning) {
      await sendBurningCampaignAlert(accountName, c.name, parseFloat(c.spend || 0));
    }
  }

  res.json({
    burningCount:     burning.length,
    totalWaste:       burning.reduce((acc, c) => acc + parseFloat(c.spend || 0), 0),
    campaigns:        burning.map(c => ({ id: c.id, name: c.name, spend: c.spend }))
  });
});

// ─── MAIN ANALYZE ─────────────────────────────────────────────────────────────
app.post("/api/analyze", auth, async (req, res) => {
  try {
    const validationError = validateAnalyzePayload(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const { accountData, campaigns, insights, dateRange, niche = "Geral", previousInsights } = req.body;

    const metrics     = getMetrics(insights?.data);
    const prevMetrics = previousInsights ? getMetrics(previousInsights?.data) : null;

    const enriched = (campaigns || []).map((c) => {
      const m = metrics.byId[c.id] || {
        sp: 0, cl: 0, linkCl: 0, impr: 0, reach: 0,
        pur: 0, lds: 0, msg: 0, sess: 0, rev: 0,
        addCart: 0, initCheck: 0, calls: 0, videoViews: 0
      };

      const ctr          = m.impr > 0 ? (m.cl / m.impr) * 100 : 0;
      const roas         = m.sp > 0 ? m.rev / m.sp : 0;
      const costPerMsg   = m.msg > 0 ? m.sp / m.msg : 0;
      const costPerPur   = m.pur > 0 ? m.sp / m.pur : 0;
      const costPerLead  = m.lds > 0 ? m.sp / m.lds : 0;
      const frequency    = m.reach > 0 ? m.impr / m.reach : 0;
      const cpc          = m.cl > 0 ? m.sp / m.cl : 0;
      const cpm          = m.impr > 0 ? (m.sp / m.impr) * 1000 : 0;

      // CORRIGIDO: Connect Rate usa link_clicks como denominador
      const baseForConnect = m.linkCl > 0 ? m.linkCl : m.cl;
      const connectRate    = baseForConnect > 0 ? (m.sess / baseForConnect) * 100 : 0;

      // NOVO: Hook Rate = link_clicks / impressions (qualidade do criativo em gerar clique)
      const hookRate = m.impr > 0 ? (m.linkCl / m.impr) * 100 : 0;

      // NOVO: diagnóstico por objetivo da campanha
      const objBenchmark   = getObjectiveBenchmark(c.objective);
      let diagnostico      = "Aguardando dados.";
      let statusPerformance= "Sem dados";
      let escala           = "Monitorar.";

      if (m.sp > 0) {
        const isMessagesCampaign = c.objective === "MESSAGES" || (m.msg > 0 && m.pur === 0 && m.lds === 0);

        if (isMessagesCampaign) {
          // CAMPANHA DE MENSAGENS — julgada por custo por mensagem
          if (m.msg > 20 && costPerMsg < 3) {
            diagnostico = "🔥 Excelente custo por mensagem.";
            statusPerformance = "Excelente";
            escala = `Escalar 20-30%. Projeção: ${m.msg} msg/dia com R$ ${m.sp.toFixed(0)} → mais msg por escala.`;
          } else if (m.msg > 10 && costPerMsg < 7) {
            diagnostico = "✅ Boa performance de mensagens.";
            statusPerformance = "Bom";
            escala = "Escalar 10-15%.";
          } else if (m.msg > 0 && costPerMsg <= 15) {
            diagnostico = "📊 Performance aceitável.";
            statusPerformance = "Atenção";
            escala = "Testar novos criativos para reduzir CPM.";
          } else if (m.sp > 100 && m.msg === 0) {
            diagnostico = "🚨 Queima verba sem iniciar conversa.";
            statusPerformance = "Crítico";
            escala = "Pausar imediatamente.";
          }
        } else {
          // CAMPANHA DE CONVERSÃO / VENDAS — julgada por ROAS
          if (roas > 4 || m.pur >= 10) {
            diagnostico = `🔥 Performance excepcional (ROAS ${roas.toFixed(2)}x).`;
            statusPerformance = "Excelente";
            escala = "Escalar 20-30% a cada 48h.";
          } else if (roas > 2.5 || m.pur >= 5) {
            diagnostico = `✅ Performance forte (ROAS ${roas.toFixed(2)}x).`;
            statusPerformance = "Muito Bom";
            escala = "Escalar 10-15%.";
          } else if (roas > 1.5 || m.lds >= 5) {
            diagnostico = "📊 Performance estável.";
            statusPerformance = "Bom";
            escala = "Manter e otimizar.";
          } else if (m.sp > 100 && m.msg === 0 && m.pur === 0 && m.lds === 0) {
            diagnostico = "🚨 Queima verba sem retorno.";
            statusPerformance = "Crítico";
            escala = "Pausar imediatamente.";
          } else if (ctr < 0.8 && m.sp > 30) {
            diagnostico = "🪝 Hook Rate baixo, criativo não gera clique.";
            statusPerformance = "Criativo Ruim";
            escala = "Trocar criativo. Teste novo gancho nos primeiros 3 segundos.";
          } else if (frequency > objBenchmark.maxFrequency) {
            diagnostico = "😴 Fadiga detectada pelo algoritmo.";
            statusPerformance = "Fadiga";
            escala = "Renovar criativo ou expandir público.";
          } else {
            diagnostico = "⚠️ Abaixo do ideal para o objetivo.";
            statusPerformance = "Atenção";
            escala = "Revisar segmentação e criativos.";
          }
        }
      }

      return {
        ...c,
        spend: m.sp, ctr, cpc, cpm,
        impressions: m.impr, reach: m.reach, frequency, clicks: m.cl,
        linkClicks: m.linkCl,
        purchases: m.pur, messages: m.msg, leads: m.lds,
        revenue: m.rev, addCart: m.addCart, initCheck: m.initCheck,
        calls: m.calls, videoViews: m.videoViews,
        roas, connectRate, hookRate,
        landing_page_views: m.sess,
        diagnostico, status_performance: statusPerformance,
        escala_sugestao: escala,
        costPerMsg, costPerPur, costPerLead,
        objectiveLabel: getObjectiveBenchmark(c.objective).label,
        actions: c.actions || []
      };
    });

    const decision   = decisionEngine.analyzeAccount(enriched);
    const aiAnalysis = runAnalysisEngine(accountData, decision.campaigns, metrics, prevMetrics, niche);

    // NOVO: detectar fadiga preditiva por CTR
    const fatigueAlerts = [];
    if (process.env.DATABASE_URL) {
      for (const camp of decision.campaigns) {
        try {
          const { rows } = await db.pool.query(
            `SELECT avg_ctr, created_at FROM campaign_snapshots
             WHERE fb_account_id=$1 AND fb_campaign_id=$2
             ORDER BY created_at DESC LIMIT 10`,
            [accountData.account_id, camp.id]
          );
          const fatigue = detectPredictiveFatigue(rows.reverse());
          if (fatigue.hasFatigue) {
            fatigueAlerts.push({ campaignId: camp.id, campaignName: camp.name, reason: fatigue.reason });
          }
        } catch { /* silencioso */ }
      }
    }

    if (process.env.DATABASE_URL) {
      try {
        await db.saveRun({
          fbAccountId:  accountData.account_id,
          fbUserId:     req.session.user.id,
          accountName:  accountData.name,
          dateRange,
          metrics: {
            ...metrics,
            activeCampaigns: decision.campaigns.filter(c => c.status === "ACTIVE").length,
            totalCampaigns:  decision.campaigns.length
          },
          campaigns:  decision.campaigns,
          aiAnalysis
        });
        await saveAutomaticDaily8amSnapshotIfNeeded({
          fbAccountId: accountData.account_id,
          fbUserId:    req.session.user.id,
          accountName: accountData.name,
          metrics,
          campaigns:   decision.campaigns,
          aiAnalysis
        });
      } catch(dbErr) {
        console.error("Erro salvar DB:", dbErr.message);
      }
    }

    // NOVO: verificar campanhas queimando verba e disparar alerta
    const burningCampaigns = decision.campaigns.filter(c => {
      const spend   = parseFloat(c.spend || 0);
      const hasConv = (c.messages || 0) > 0 || (c.purchases || 0) > 0 || (c.leads || 0) > 0;
      return spend >= 50 && !hasConv;
    });

    if (burningCampaigns.length > 0 && accountData.name) {
      for (const c of burningCampaigns) {
        await sendBurningCampaignAlert(accountData.name, c.name, parseFloat(c.spend || 0));
      }
    }

    res.json({
      analysis: {
        ...aiAnalysis,
        campanhas_analise: decision.campaigns,
        fatigue_alerts: fatigueAlerts,
        burning_campaigns: burningCampaigns.map(c => ({ id: c.id, name: c.name, spend: c.spend }))
      },
      metrics,
      decision,
      comparison: prevMetrics ? buildComparisonFromMetrics(metrics, prevMetrics) : null,
      aiAvailable: !!openai
    });
  } catch(err) {
    console.error("Erro /api/analyze:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── ENGINE DE ANÁLISE ────────────────────────────────────────────────────────
function runAnalysisEngine(accountData, campaigns, metrics, prevMetrics, niche = "Geral") {
  let score        = 100;
  const otimizacoes= [];
  const b          = benchmarks[niche] || benchmarks.Geral;

  // ROAS
  if (metrics.roas < b.minRoas * 0.5) {
    score -= 30;
    otimizacoes.push({ prioridade: 1, titulo: "ROAS crítico", categoria: "Financeiro",
      descricao: `ROAS em ${metrics.roas.toFixed(2)}x, muito abaixo do benchmark de ${b.minRoas}x para ${niche}.`,
      acao: "Pause os raladores de verba e concentre investimento nas campanhas com sinal real."
    });
  } else if (metrics.roas < b.minRoas) {
    score -= 15;
    otimizacoes.push({ prioridade: 1, titulo: "ROAS abaixo do ideal", categoria: "Financeiro",
      descricao: `ROAS em ${metrics.roas.toFixed(2)}x vs benchmark de ${b.minRoas}x para ${niche}.`,
      acao: "Revise oferta, página e distribuição de verba."
    });
  }

  // CTR
  if (metrics.avgCtr < b.minCtr && metrics.totalSpend > 50) {
    score -= 15;
    otimizacoes.push({ prioridade: 2, titulo: "CTR abaixo do benchmark", categoria: "Criativo",
      descricao: `CTR médio de ${metrics.avgCtr.toFixed(2)}% vs mínimo de ${b.minCtr}%.`,
      acao: "Teste novos ganchos, thumbnail, copy e primeiras linhas. Foque nos primeiros 3 segundos do vídeo."
    });
  }

  // CORRIGIDO: Connect Rate agora usa a métrica corrigida
  if (metrics.connectRate < b.minConnectRate && metrics.totalSpend > 50) {
    score -= 15;
    otimizacoes.push({ prioridade: 2, titulo: "Connect Rate baixo", categoria: "Funil",
      descricao: `Apenas ${metrics.connectRate.toFixed(1)}% dos link_clicks viram visualização de página.`,
      acao: "Melhore velocidade, compatibilidade mobile e tracking. Verifique se o pixel está disparando corretamente."
    });
  }

  // Frequência
  if (metrics.avgFrequency > b.maxFrequency) {
    score -= 10;
    otimizacoes.push({ prioridade: 2, titulo: "Frequência alta", categoria: "Alcance",
      descricao: `Frequência média de ${metrics.avgFrequency.toFixed(2)} vs máximo recomendado de ${b.maxFrequency}.`,
      acao: "Renove criativos e expanda público. Crie variações do criativo campeão."
    });
  }

  // CPM
  if (metrics.avgCpm > b.maxCpm && metrics.totalSpend > 100) {
    score -= 10;
    otimizacoes.push({ prioridade: 3, titulo: "CPM alto", categoria: "Leilão",
      descricao: `CPM em R$ ${metrics.avgCpm.toFixed(2)} vs máximo de R$ ${b.maxCpm}.`,
      acao: "Revise relevância criativa e amplitude de público. Teste novos públicos lookalike."
    });
  }

  // Comparação com período anterior
  if (prevMetrics) {
    if (prevMetrics.roas > 0 && metrics.roas < prevMetrics.roas * 0.8) {
      otimizacoes.push({ prioridade: 1, titulo: "Queda de ROAS vs período anterior", categoria: "Tendência",
        descricao: `ROAS caiu de ${prevMetrics.roas.toFixed(2)}x para ${metrics.roas.toFixed(2)}x (${(((metrics.roas - prevMetrics.roas)/prevMetrics.roas)*100).toFixed(1)}%).`,
        acao: "Verifique fadiga de criativo, aumento de CPM e queda de CTR. Analise se houve mudança de leilão."
      });
    }
    if (prevMetrics.connectRate > 0 && metrics.connectRate < prevMetrics.connectRate * 0.9) {
      otimizacoes.push({ prioridade: 2, titulo: "Piora de Connect Rate", categoria: "Tendência",
        descricao: `Connect Rate caiu de ${prevMetrics.connectRate.toFixed(1)}% para ${metrics.connectRate.toFixed(1)}%.`,
        acao: "Audite tracking, pixel, velocidade e experiência mobile. Verifique se o evento de landing_page_view está sendo disparado."
      });
    }
  }

  // Campanhas críticas
  const criticalCamps = campaigns.filter(c => c.status_performance === "Crítico");
  if (criticalCamps.length > 0) {
    score -= criticalCamps.length * 5;
    otimizacoes.push({ prioridade: 1, titulo: `${criticalCamps.length} campanha(s) queimando verba`, categoria: "Campanhas",
      descricao: criticalCamps.map(c => `${c.name} (R$ ${parseFloat(c.spend || 0).toFixed(2)})`).join(", "),
      acao: "Pausar imediatamente. Total desperdiçado: R$ " + criticalCamps.reduce((acc, c) => acc + parseFloat(c.spend || 0), 0).toFixed(2)
    });
  }

  // NOVO: campanhas com potencial de escala identificadas
  const scaleCamps = campaigns.filter(c => c.status_performance === "Excelente" || c.status_performance === "Muito Bom");
  if (scaleCamps.length > 0) {
    otimizacoes.push({ prioridade: 3, titulo: `${scaleCamps.length} campanha(s) com potencial de escala`, categoria: "Oportunidade",
      descricao: scaleCamps.map(c => `${c.name} (ROAS ${parseFloat(c.roas || 0).toFixed(2)}x)`).join(", "),
      acao: "Aumente o orçamento em 10-20% a cada 48h nestas campanhas. Duplique os públicos lookalike."
    });
  }

  return {
    resumo_geral: {
      score_saude: Math.max(0, score),
      nivel_saude: score > 80 ? "Excelente" : score > 50 ? "Atenção" : "Crítico",
      resumo_historico: score > 80
        ? "Conta saudável, com boa base para escala."
        : score > 50 ? "Conta com oportunidades claras de otimização."
        : "Conta em estado crítico, com perda de eficiência."
    },
    otimizacoes_prioritarias: otimizacoes.sort((a, b) => a.prioridade - b.prioridade)
  };
}

// ─── GPT ANALYSIS ─────────────────────────────────────────────────────────────
app.post("/api/gpt-campaign", auth, async (req, res) => {
  if (!openai) return res.json({ analysis: "OpenAI não configurada. Adicione OPENAI_API_KEY para análises avançadas." });

  const { campaign, adsets, metrics } = req.body;
  try {
    const prompt = `Você é um gestor de tráfego sênior especialista em Meta Ads.
Analise esta campanha com dados reais e forneça diagnóstico preciso:

CAMPANHA: ${campaign.name}
Objetivo: ${campaign.objective || "Não informado"}
Gasto: R$ ${parseFloat(campaign.spend || 0).toFixed(2)}
ROAS: ${parseFloat(campaign.roas || 0).toFixed(2)}x
CTR: ${parseFloat(campaign.ctr || 0).toFixed(2)}%
Hook Rate: ${parseFloat(campaign.hookRate || 0).toFixed(2)}%
Connect Rate: ${parseFloat(campaign.connectRate || 0).toFixed(2)}% (baseado em link_clicks)
Frequência: ${parseFloat(campaign.frequency || 0).toFixed(2)}
Mensagens: ${campaign.messages || 0}
Compras: ${campaign.purchases || 0}
Custo por Mensagem: R$ ${parseFloat(campaign.costPerMsg || 0).toFixed(2)}

Forneça:
1. Diagnóstico do funil (onde está o gargalo principal)
2. Análise do criativo baseada no Hook Rate e CTR
3. 3 ações específicas e mensuráveis para melhorar performance
4. Sugestão de escala com % de aumento e justificativa

Seja direto e prático. Sem enrolação.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
      temperature: 0.3
    });
    res.json({ analysis: completion.choices[0].message.content });
  } catch(e) {
    console.error("Erro GPT campaign:", e.message);
    res.json({ analysis: `Erro ao gerar análise: ${e.message}` });
  }
});

app.post("/api/gpt-copilot", auth, async (req, res) => {
  if (!openai) return res.json({ strategy: "OpenAI não configurada." });

  const { data } = req.body;
  try {
    const prompt = `Você é um gestor de tráfego sênior para Meta Ads.
Analise a conta e crie um plano de guerra para os próximos 7 dias:

Nicho: ${data.niche || "Geral"}
ROAS Geral: ${parseFloat(data.metrics?.roas || 0).toFixed(2)}x
CTR Médio: ${parseFloat(data.metrics?.avgCtr || 0).toFixed(2)}%
Connect Rate: ${parseFloat(data.metrics?.connectRate || 0).toFixed(2)}%
Frequência: ${parseFloat(data.metrics?.avgFrequency || 0).toFixed(2)}
Gasto Total: R$ ${parseFloat(data.metrics?.totalSpend || 0).toFixed(2)}
Receita Total: R$ ${parseFloat(data.metrics?.totalRev || 0).toFixed(2)}
Campanhas: ${(data.campaigns || []).length}

Top campanhas:
${(data.campaigns || []).slice(0, 5).map(c =>
  `- ${c.name}: ROAS ${parseFloat(c.roas||0).toFixed(2)}x | Gasto R$ ${parseFloat(c.spend||0).toFixed(2)} | ${c.status_performance}`
).join("\n")}

Forneça:
1. Diagnóstico geral (3 linhas)
2. O que PAUSAR esta semana (com motivo)
3. O que ESCALAR esta semana (com % e valor sugerido)
4. O que TESTAR nos próximos 7 dias
5. Uma ação de melhoria de funil

Seja específico e acionável.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
      temperature: 0.3
    });
    res.json({ strategy: completion.choices[0].message.content });
  } catch(e) {
    console.error("Erro GPT copilot:", e.message);
    res.json({ strategy: `Erro: ${e.message}` });
  }
});

// ─── NOTES & ALERTS ──────────────────────────────────────────────────────────
app.get("/api/notes/:accountId", auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json([]);
    const notes = await db.getNotes(req.params.accountId, req.session.user.id);
    res.json(notes);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/notes", auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json({ ok: true });
    const { fbAccountId, note, type } = req.body;
    const saved = await db.saveNote({ fbUserId: req.session.user.id, fbAccountId, note, type });
    res.json(saved);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/alerts/:accountId", auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json(null);
    const alert = await db.getBudgetAlert(req.session.user.id, req.params.accountId);
    res.json(alert || null);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/alerts", auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json({ ok: true });
    const { fbAccountId, accountName, email, threshold, currency } = req.body;
    const saved = await db.upsertBudgetAlert({
      fbUserId: req.session.user.id,
      fbAccountId, accountName,
      email, threshold: parseFloat(threshold) || 100,
      currency: currency || "BRL"
    });
    res.json(saved);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/trend/:accountId", auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json({ trend: [] });
    const history = await db.getRunHistory(req.params.accountId, 60);
    const trend = history.map(r => ({
      date:        r.created_at,
      avg_health:  r.health_score || 0,
      total_spend: r.total_spend  || 0,
      avg_roas:    r.roas         || 0,
      avg_ctr:     r.avg_ctr      || 0,
      connect_rate:r.connect_rate || 0
    }));
    res.json({ trend: trend.reverse() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/daily-metrics/:accountId", auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json([]);
    const history = await db.getDailyRunHistory(req.params.accountId, 90);
    res.json(history);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── PAGES ───────────────────────────────────────────────────────────────────
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/");
  res.sendFile(path.resolve(__dirname, "public", "dashboard.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.resolve(__dirname, "public", "index.html"));
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/auth") || req.path.includes(".")) return next();
  res.sendFile(path.resolve(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  if (process.env.DATABASE_URL) await db.initDB();
});
