require("dotenv").config();
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const path = require("path");
const db = require("./db");
const benchmarks = require("./benchmarks");
const nodemailer = require("nodemailer");
const { OpenAI } = require("openai");
const decisionEngine = require("./decision-engine-v2");
const decisionEngineV2 = require("./decision-engine-v2");
const benchmarksV2 = require("./benchmarks-v2");
const landingPageAudit = require("./landing-page-audit");

const app = express();

app.set("trust proxy", 1);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
  secret: process.env.SESSION_SECRET || "meta-analyzer-ultra-v9",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: "lax"
  }
}));

const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const REDIRECT_URI = `${process.env.BASE_URL}/auth/facebook/callback`;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const transporter = nodemailer.createTransport({
  service: "gmail",
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
      text: `A conta ${accountName} está com saldo de R$ ${balance.toFixed(2)}.`,
      html: `<h2>Alerta de Saldo Baixo</h2><p>A conta <b>${accountName}</b> está com saldo de <b>R$ ${balance.toFixed(2)}</b>.</p>`
    });
  } catch (e) {
    console.error("Erro ao enviar e-mail:", e.message);
  }
}

function auth(req, res, next) {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: "Sessão expirada." });
  }
  next();
}

function getAct(arr, type) {
  if (!Array.isArray(arr) || !type) return 0;
  const found = arr.find(x => x && x.action_type === type);
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

function getMetrics(dataRows) {
  const rows = Array.isArray(dataRows) ? dataRows : [];
  let tSpend = 0, tImpr = 0, tClicks = 0, tPur = 0, tLds = 0, tMsg = 0;
  let tSess = 0, tRev = 0, tReach = 0, tFreq = 0, tAddCart = 0, tInitiateCheckout = 0;
  let tCalls = 0, tVideoViews = 0;
  const byId = {};

  rows.forEach(m => {
    const sp = Math.max(0, parseFloat(m?.spend || 0) || 0);
    const cl = Math.max(0, parseInt(m?.clicks || 0) || 0);
    const impr = Math.max(0, parseInt(m?.impressions || 0) || 0);
    const reach = Math.max(0, parseInt(m?.reach || 0) || 0);

    tSpend += sp;
    tImpr += impr;
    tClicks += cl;
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
    const sess = getAct(m.actions, "landing_page_view");
    const addCart = getActMulti(m.actions, [
      "offsite_conversion.fb_pixel_add_to_cart", "add_to_cart"
    ]);
    const initCheck = getActMulti(m.actions, [
      "offsite_conversion.fb_pixel_initiate_checkout", "initiate_checkout"
    ]);
    const calls = getActMulti(m.actions, [
      "onsite_conversion.call_now_click_mobile", "click_to_call_call_confirm"
    ]);
    const videoViews = getActMulti(m.actions, [
      "video_view", "video_plays_unique"
    ]);
    const rev = getActMulti(m.action_values, [
      "offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"
    ]);

    tPur += pur;
    tLds += lds;
    tMsg += msg;
    tSess += sess;
    tRev += rev;
    tAddCart += addCart;
    tInitiateCheckout += initCheck;
    tCalls += calls;
    tVideoViews += videoViews;

    const campId = m.campaign_id || "unknown";
    if (!byId[campId]) {
      byId[campId] = {
        sp: 0, cl: 0, impr: 0, reach: 0, pur: 0, lds: 0, msg: 0,
        sess: 0, rev: 0, addCart: 0, initCheck: 0, calls: 0, videoViews: 0
      };
    }

    byId[campId].sp += sp;
    byId[campId].cl += cl;
    byId[campId].impr += impr;
    byId[campId].reach += reach;
    byId[campId].pur += pur;
    byId[campId].lds += lds;
    byId[campId].msg += msg;
    byId[campId].sess += sess;
    byId[campId].rev += rev;
    byId[campId].addCart += addCart;
    byId[campId].initCheck += initCheck;
    byId[campId].calls += calls;
    byId[campId].videoViews += videoViews;
  });

  tFreq = tReach > 0 ? tImpr / tReach : 0;

  const safe = n => {
    const x = Number(n || 0);
    return Number.isFinite(x) ? x : 0;
  };

  return {
    totalSpend: safe(tSpend),
    totalImpressions: safe(tImpr),
    totalClicks: safe(tClicks),
    totalPurchases: safe(tPur),
    totalLeads: safe(tLds),
    totalMessages: safe(tMsg),
    totalSessions: safe(tSess),
    totalRev: safe(tRev),
    totalReach: safe(tReach),
    totalAddCart: safe(tAddCart),
    totalInitiateCheckout: safe(tInitiateCheckout),
    totalCalls: safe(tCalls),
    totalVideoViews: safe(tVideoViews),
    avgFrequency: safe(tFreq),
    roas: safe(tSpend > 0 ? tRev / tSpend : 0),
    avgCtr: safe(tImpr > 0 ? (tClicks / tImpr) * 100 : 0),
    avgCpc: safe(tClicks > 0 ? tSpend / tClicks : 0),
    avgCpm: safe(tImpr > 0 ? (tSpend / tImpr) * 1000 : 0),
    connectRate: safe(tClicks > 0 ? (tSess / tClicks) * 100 : 0),
    costPerPurchase: safe(tPur > 0 ? tSpend / tPur : 0),
    costPerMessage: safe(tMsg > 0 ? tSpend / tMsg : 0),
    costPerLead: safe(tLds > 0 ? tSpend / tLds : 0),
    byId
  };
}

function buildComparisonFromMetrics(currentMetrics, prevMetrics) {
  const variation = (current, previous) => ((current - previous) / (previous || 1)) * 100;

  return {
    current: currentMetrics,
    previous: prevMetrics,
    comparison: {
      spendChange: variation(currentMetrics.totalSpend, prevMetrics.totalSpend),
      roasChange: variation(currentMetrics.roas, prevMetrics.roas),
      ctrChange: variation(currentMetrics.avgCtr, prevMetrics.avgCtr),
      purchasesChange: variation(currentMetrics.totalPurchases, prevMetrics.totalPurchases),
      connectRateChange: variation(currentMetrics.connectRate, prevMetrics.connectRate)
    }
  };
}

function getComparisonPreset(preset) {
  if (preset === "last_7d") return "last_7d_excluding_today";
  if (preset === "last_30d") return "last_30d_excluding_today";
  if (preset === "last_90d") return "last_90d_excluding_today";
  return null;
}

function buildCustomPreviousRange(since, until) {
  if (!since || !until) return null;

  const start = new Date(`${since}T00:00:00`);
  const end = new Date(`${until}T00:00:00`);
  const diffDays = Math.round((end - start) / 86400000) + 1;

  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);

  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (diffDays - 1));

  const formatDate = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  return {
    since: formatDate(prevStart),
    until: formatDate(prevEnd)
  };
}

function getBrazilDateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const get = type => parts.find(p => p.type === type)?.value || "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour") || 0)
  };
}

async function hasDaily8amSnapshotToday(fbAccountId, fbUserId) {
  const { date } = getBrazilDateParts();
  const label = `AUTO_DAILY_08_${date}`;
  const { rows } = await db.pool.query(
    `SELECT id FROM analysis_runs WHERE fb_account_id = $1 AND fb_user_id = $2 AND date_range = $3 LIMIT 1`,
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
    fbAccountId,
    fbUserId,
    accountName,
    dateRange: `AUTO_DAILY_08_${date}`,
    metrics: {
      ...metrics,
      activeCampaigns: campaigns.filter(c => c.status === "ACTIVE").length,
      totalCampaigns: campaigns.length
    },
    campaigns,
    aiAnalysis
  });
}

/* AUTH */
app.get("/auth/facebook", (req, res) => {
  const scopes = ["ads_read", "ads_management", "business_management", "public_profile"].join(",");
  res.redirect(`https://www.facebook.com/v19.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scopes}`);
});

app.get("/auth/facebook/callback", async (req, res) => {
  if (!req.query.code) return res.redirect("/?error=no_code");
  try {
    const t1 = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
      params: {
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        redirect_uri: REDIRECT_URI,
        code: req.query.code
      }
    });

    const t2 = await axios.get("https://graph.facebook.com/v19.0/oauth/access_token", {
      params: {
        grant_type: "fb_exchange_token",
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        fb_exchange_token: t1.data.access_token
      }
    });

    req.session.accessToken = t2.data.access_token;

    const user = await axios.get("https://graph.facebook.com/v19.0/me", {
      params: {
        fields: "id,name,picture",
        access_token: req.session.accessToken
      }
    });

    req.session.user = user.data;
    res.redirect("/dashboard");
  } catch (err) {
    console.error("Erro no callback:", err.response?.data || err.message);
    res.redirect("/?error=auth_failed");
  }
});

app.get("/api/me", (req, res) => {
  res.json(req.session.user
    ? { authenticated: true, user: req.session.user }
    : { authenticated: false });
});

app.get("/auth/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.get("/api/debug/env", (req, res) => {
  res.json({
    FB_APP_ID: process.env.FB_APP_ID || null,
    hasFB_APP_SECRET: !!process.env.FB_APP_SECRET,
    BASE_URL: process.env.BASE_URL || null,
    NODE_ENV: process.env.NODE_ENV || null
  });
});

/* CORE DATA */
app.get("/api/adaccounts", auth, async (req, res) => {
  try {
    const r = await axios.get("https://graph.facebook.com/v19.0/me/adaccounts", {
      params: {
        fields: "name,account_id,currency,account_status,funding_source_details,balance",
        access_token: req.session.accessToken,
        limit: 100
      }
    });
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/adaccounts/:id/balance", auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}`, {
      params: {
        fields: "name,balance,amount_spent,spend_cap,funding_source_details,account_status",
        access_token: req.session.accessToken
      }
    });

    const data = r.data;
    const funding = data.funding_source_details || {};
    data.is_prepaid = funding.type === "PREPAID" || (data.balance && parseInt(data.balance) < 0);
    data.readable_balance = data.balance ? Math.abs(parseFloat(data.balance) / 100) : 0;

    if (data.is_prepaid && data.readable_balance < 100) {
      await sendLowBalanceAlert(data.name, data.readable_balance);
    }

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/adaccounts/:id/campaigns", auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/campaigns`, {
      params: {
        fields: "id,name,status,objective,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time",
        access_token: req.session.accessToken,
        limit: 300
      }
    });
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/adaccounts/:id/insights", auth, async (req, res) => {
  try {
    const { since, until, date_preset } = req.query;

    const params = {
      fields: [
        "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
        "impressions", "clicks", "spend", "cpc", "cpm", "ctr",
        "reach", "frequency",
        "actions", "action_values",
        "video_p25_watched_actions", "video_p50_watched_actions",
        "video_p75_watched_actions", "video_p100_watched_actions",
        "video_avg_time_watched_actions",
        "unique_clicks", "unique_ctr",
        "cost_per_action_type", "cost_per_unique_click"
      ].join(","),
      level: "ad",
      access_token: req.session.accessToken,
      limit: 500
    };

    if (since && until) {
      params.time_range = JSON.stringify({ since, until });
    } else {
      params.date_preset = date_preset || "last_30d";
    }

    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) {
    console.error("Erro insights:", e.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/adaccounts/:id/comparison", auth, async (req, res) => {
  try {
    const { date_preset, since, until } = req.query;

    const currentParams = {
      fields: "impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values",
      level: "account",
      access_token: req.session.accessToken
    };

    const previousParams = {
      fields: "impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values",
      level: "account",
      access_token: req.session.accessToken
    };

    if (since && until) {
      currentParams.time_range = JSON.stringify({ since, until });
      const prev = buildCustomPreviousRange(since, until);
      if (prev) previousParams.time_range = JSON.stringify(prev);
    } else {
      currentParams.date_preset = date_preset || "last_30d";
      previousParams.date_preset = getComparisonPreset(date_preset || "last_30d") || "last_30d_excluding_today";
    }

    const [currentRes, previousRes] = await Promise.all([
      axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params: currentParams }),
      axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params: previousParams })
    ]);

    const currentMetrics = getMetrics(currentRes.data?.data);
    const previousMetrics = getMetrics(previousRes.data?.data);

    res.json(buildComparisonFromMetrics(currentMetrics, previousMetrics));
  } catch (e) {
    console.error("Erro comparison:", e.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/adaccounts/:id/creatives", auth, async (req, res) => {
  try {
    const { date_preset, since, until } = req.query;
    let insightsField;

    if (since && until) {
      insightsField = `insights.time_range({"since":"${since}","until":"${until}"}){impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}`;
    } else {
      insightsField = `insights.date_preset(${date_preset || "last_30d"}){impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}`;
    }

    const params = {
      fields: `id,name,status,creative{thumbnail_url,image_url,video_id,body,title,call_to_action_type},${insightsField}`,
      access_token: req.session.accessToken,
      limit: 200
    };

    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/ads`, { params });
    res.json(r.data);
  } catch (e) {
    console.error("Erro creatives:", e.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/adaccounts/:id/breakdown/:type", auth, async (req, res) => {
  try {
    const { type } = req.params;
    const { date_preset, since, until } = req.query;

    const params = {
      fields: "impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values",
      level: "account",
      access_token: req.session.accessToken
    };

    if (since && until) {
      params.time_range = JSON.stringify({ since, until });
    } else {
      params.date_preset = date_preset || "last_30d";
    }

    if (type === "device") params.breakdowns = "device_platform";
    else if (type === "platform") params.breakdowns = "publisher_platform";
    else if (type === "position") params.breakdowns = "platform_position";
    else if (type === "gender") params.breakdowns = "gender";
    else if (type === "age") params.breakdowns = "age";
    else if (type === "region") params.breakdowns = "region";
    else if (type === "city") params.breakdowns = "city";
    else params.breakdowns = "publisher_platform";

    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) {
    console.error("Erro breakdown:", e.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/campaigns/:id/funnel", auth, async (req, res) => {
  try {
    const { date_preset, since, until } = req.query;
    const timeParam = since && until
      ? `time_range({"since":"${since}","until":"${until}"})`
      : `date_preset(${date_preset || "last_30d"})`;

    const insightsFields = "impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values";

    const adsets = await axios.get(`https://graph.facebook.com/v19.0/${req.params.id}/adsets`, {
      params: {
        fields: `id,name,status,targeting,insights.${timeParam}{${insightsFields}}`,
        access_token: req.session.accessToken,
        limit: 100
      }
    });

    const adsetData = adsets.data.data || [];
    const enrichedAdsets = await Promise.all(
      adsetData.map(async adset => {
        try {
          const ads = await axios.get(`https://graph.facebook.com/v19.0/${adset.id}/ads`, {
            params: {
              fields: `id,name,status,creative{thumbnail_url,image_url,body,title},insights.${timeParam}{${insightsFields}}`,
              access_token: req.session.accessToken,
              limit: 100
            }
          });
          return { ...adset, ads: ads.data.data || [] };
        } catch {
          return { ...adset, ads: [] };
        }
      })
    );

    res.json({ adsets: enrichedAdsets });
  } catch (e) {
    console.error("Erro funnel:", e.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/trend/:id", auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json({ trend: [] });
    const trend = await db.getAccountTrend(req.params.id);
    res.json({ trend });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* NOTES */
app.post("/api/notes", auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Banco não configurado." });
    const { fbAccountId, fbCampaignId, campaignName, note, type } = req.body;
    const saved = await db.saveNote({
      fbUserId: req.session.user.id,
      fbAccountId,
      fbCampaignId,
      campaignName,
      note,
      type
    });
    res.json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/notes/:accountId", auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json([]);
    const notes = await db.getNotes(req.params.accountId, req.session.user.id);
    res.json(notes);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/notes/:id", auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Banco não configurado." });
    await db.deleteNote(req.params.id, req.session.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ALERTS */
app.post("/api/alerts", auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Banco não configurado." });
    const { fbAccountId, accountName, email, threshold, currency } = req.body;
    const alert = await db.upsertBudgetAlert({
      fbUserId: req.session.user.id,
      fbAccountId,
      accountName,
      email,
      threshold,
      currency
    });
    res.json(alert);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/alerts/:accountId", auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json(null);
    const alert = await db.getBudgetAlert(req.session.user.id, req.params.accountId);
    res.json(alert);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/history/:accountId", auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json([]);
    const history = await db.getDailyRunHistory(req.params.accountId);
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ANALYZE */
app.post("/api/analyze", auth, async (req, res) => {
  try {
    const {
      accountData,
      campaigns,
      insights,
      dateRange,
      niche = "Geral",
      previousInsights
    } = req.body;

    if (!accountData || !campaigns || !insights) {
      return res.status(400).json({ error: "accountData, campaigns e insights são obrigatórios." });
    }

    const metrics = getMetrics(insights?.data);
    const prevMetrics = previousInsights ? getMetrics(previousInsights?.data) : null;

    const enriched = (campaigns || []).map(c => {
      const m = metrics.byId[c.id] || {
        sp: 0, cl: 0, impr: 0, reach: 0, pur: 0, lds: 0, msg: 0,
        sess: 0, rev: 0, addCart: 0, initCheck: 0, calls: 0, videoViews: 0
      };

      const ctr = m.impr > 0 ? (m.cl / m.impr) * 100 : 0;
      const roas = m.sp > 0 ? m.rev / m.sp : 0;
      const costPerMsg = m.msg > 0 ? m.sp / m.msg : 0;
      const costPerPur = m.pur > 0 ? m.sp / m.pur : 0;
      const costPerLead = m.lds > 0 ? m.sp / m.lds : 0;
      const frequency = m.reach > 0 ? m.impr / m.reach : 0;
      const connectRate = m.cl > 0 ? (m.sess / m.cl) * 100 : 0;

      let diagnostico = "Aguardando dados.";
      let statusPerformance = "Sem dados";
      let escala = "Monitorar.";

      if (m.sp > 0) {
        if (roas > 4 || (m.msg > 20 && costPerMsg < 3)) {
          diagnostico = "🔥 Performance excepcional.";
          statusPerformance = "Excelente";
          escala = "Escalar 20% a 30%.";
        } else if (roas > 2.5 || (m.msg > 10 && costPerMsg < 7)) {
          diagnostico = "✅ Performance forte.";
          statusPerformance = "Muito Bom";
          escala = "Escalar 10% a 15%.";
        } else if (roas > 1.5 || (m.msg > 5 && costPerMsg < 12)) {
          diagnostico = "📊 Performance estável.";
          statusPerformance = "Bom";
          escala = "Manter e otimizar.";
        } else if (m.sp > 100 && m.msg === 0 && m.pur === 0 && m.lds === 0) {
          diagnostico = "🚨 Queima verba sem retorno.";
          statusPerformance = "Crítico";
          escala = "Pausar imediatamente.";
        } else if (ctr < 0.8 && m.sp > 30) {
          diagnostico = "🪝 CTR baixo, criativo fraco.";
          statusPerformance = "Criativo Ruim";
          escala = "Trocar criativo.";
        } else if (frequency > 3.5) {
          diagnostico = "😴 Fadiga detectada.";
          statusPerformance = "Fadiga";
          escala = "Renovar criativo ou expandir público.";
        } else {
          diagnostico = "⚠️ Abaixo do ideal.";
          statusPerformance = "Atenção";
          escala = "Revisar segmentação e criativos.";
        }
      }

      return {
        ...c,
        spend: m.sp,
        ctr,
        impressions: m.impr,
        reach: m.reach,
        frequency,
        clicks: m.cl,
        purchases: m.pur,
        messages: m.msg,
        leads: m.lds,
        revenue: m.rev,
        addCart: m.addCart,
        initCheck: m.initCheck,
        calls: m.calls,
        videoViews: m.videoViews,
        roas,
        connectRate,
        diagnostico,
        status_performance: statusPerformance,
        escala_sugestao: escala,
        costPerMsg,
        costPerPur,
        costPerLead,
        actions: c.actions || []
      };
    });

    const decision = decisionEngine.analyzeAccount(enriched);
    
    // Injetar auditoria e benchmarks no aiAnalysis
    const aiAnalysis = runAnalysisEngine(accountData, decision.campaigns, metrics, prevMetrics, niche);
    aiAnalysis.audit_v2 = {
      score: decision.averageScore,
      grade: decision.accountGrade,
      total_waste: decision.totalWaste,
      critical_alerts: decision.campaigns
        .flatMap(c => c.audit?.alerts || [])
        .filter(a => a.severity === 'high')
        .slice(0, 5)
    };

    if (process.env.DATABASE_URL) {
      try {
        await db.saveRun({
          fbAccountId: accountData.account_id,
          fbUserId: req.session.user.id,
          accountName: accountData.name,
          dateRange,
          metrics: {
            ...metrics,
            activeCampaigns: decision.campaigns.filter(c => c.status === "ACTIVE").length,
            totalCampaigns: decision.campaigns.length
          },
          campaigns: decision.campaigns,
          aiAnalysis
        });

        await saveAutomaticDaily8amSnapshotIfNeeded({
          fbAccountId: accountData.account_id,
          fbUserId: req.session.user.id,
          accountName: accountData.name,
          metrics,
          campaigns: decision.campaigns,
          aiAnalysis
        });
      } catch (dbErr) {
        console.error("Erro salvar DB:", dbErr.message);
      }
    }

    res.json({
      analysis: {
        ...aiAnalysis,
        campanhas_analise: decision.campaigns
      },
      metrics,
      decision
    });
  } catch (err) {
    console.error("Erro /api/analyze:", err.message);
    res.status(500).json({ error: err.message });
  }
});

function runAnalysisEngine(accountData, campaigns, metrics, prevMetrics, niche = "Geral") {
  let score = 100;
  const otimizacoes = [];
  const b = benchmarks[niche] || benchmarks.Geral;

  if (metrics.roas < b.minRoas * 0.5) {
    score -= 30;
    otimizacoes.push({
      prioridade: 1,
      titulo: "ROAS crítico",
      categoria: "Financeiro",
      descricao: `ROAS em ${metrics.roas.toFixed(2)}x, abaixo do benchmark de ${b.minRoas}x.`,
      acao: "Pause os raladores de verba e concentre investimento nas campanhas com sinal real."
    });
  } else if (metrics.roas < b.minRoas) {
    score -= 15;
    otimizacoes.push({
      prioridade: 1,
      titulo: "ROAS abaixo do ideal",
      categoria: "Financeiro",
      descricao: `ROAS em ${metrics.roas.toFixed(2)}x para o nicho ${niche}.`,
      acao: "Revise oferta, página e distribuição de verba."
    });
  }

  if (metrics.avgCtr < b.minCtr && metrics.totalSpend > 50) {
    score -= 15;
    otimizacoes.push({
      prioridade: 2,
      titulo: "CTR abaixo do benchmark",
      categoria: "Criativo",
      descricao: `CTR médio de ${metrics.avgCtr.toFixed(2)}%.`,
      acao: "Teste novos ganchos, thumb, copy e primeiras linhas."
    });
  }

  if (metrics.connectRate < b.minConnectRate && metrics.totalSpend > 50) {
    score -= 15;
    otimizacoes.push({
      prioridade: 2,
      titulo: "Connect Rate baixo",
      categoria: "Funil",
      descricao: `Apenas ${metrics.connectRate.toFixed(1)}% dos cliques viram landing page view.`,
      acao: "Melhore velocidade, compatibilidade mobile e tracking da página."
    });
  }

  if (metrics.avgFrequency > b.maxFrequency) {
    score -= 10;
    otimizacoes.push({
      prioridade: 2,
      titulo: "Frequência alta",
      categoria: "Alcance",
      descricao: `Frequência média de ${metrics.avgFrequency.toFixed(2)}.`,
      acao: "Renove criativos e expanda público."
    });
  }

  if (metrics.avgCpm > b.maxCpm && metrics.totalSpend > 100) {
    score -= 10;
    otimizacoes.push({
      prioridade: 3,
      titulo: "CPM alto",
      categoria: "Leilão",
      descricao: `CPM em R$ ${metrics.avgCpm.toFixed(2)}.`,
      acao: "Revise relevância criativa e amplitude de público."
    });
  }

  if (prevMetrics) {
    if (metrics.roas < prevMetrics.roas * 0.8) {
      otimizacoes.push({
        prioridade: 1,
        titulo: "Queda de ROAS vs período anterior",
        categoria: "Tendência",
        descricao: `ROAS caiu de ${prevMetrics.roas.toFixed(2)}x para ${metrics.roas.toFixed(2)}x.`,
        acao: "Verifique fadiga, aumento de CPM e queda de CTR."
      });
    }
    if (metrics.connectRate < prevMetrics.connectRate * 0.9) {
      otimizacoes.push({
        prioridade: 2,
        titulo: "Piora de Connect Rate",
        categoria: "Tendência",
        descricao: `Connect Rate caiu de ${prevMetrics.connectRate.toFixed(1)}% para ${metrics.connectRate.toFixed(1)}%.`,
        acao: "Audite tracking, pixel, velocidade e experiência mobile."
      });
    }
  }

  const criticalCamps = campaigns.filter(c => c.status_performance === "Crítico");
  if (criticalCamps.length > 0) {
    score -= criticalCamps.length * 5;
    otimizacoes.push({
      prioridade: 1,
      titulo: `${criticalCamps.length} campanha(s) crítica(s)`,
      categoria: "Campanhas",
      descricao: criticalCamps.map(c => c.name).join(", "),
      acao: "Pausar ou revisar imediatamente."
    });
  }

  return {
    resumo_geral: {
      score_saude: Math.max(0, score),
      nivel_saude: score > 80 ? "Excelente" : score > 50 ? "Atenção" : "Crítico",
      resumo_historico:
        score > 80
          ? "Conta saudável, com boa base para escala."
          : score > 50
            ? "Conta com oportunidades claras de otimização."
            : "Conta em estado crítico, com perda de eficiência."
    },
    otimizacoes_prioritarias: otimizacoes.sort((a, b) => a.prioridade - b.prioridade)
  };
}

function generateCampaignAnalysis(campaign, adsets) {
  let s = `### 🔍 Análise da campanha: ${campaign.name}\n\n`;
  s += `**Status:** ${campaign.status}\n\n`;
  s += `**Diagnóstico:** ${campaign.diagnostico || "Sem diagnóstico"}\n\n`;
  s += `**Métricas:**\n`;
  s += `- Gasto: R$ ${(campaign.spend || 0).toFixed(2)}\n`;
  s += `- Impressões: ${Number(campaign.impressions || 0).toLocaleString("pt-BR")}\n`;
  s += `- Alcance: ${Number(campaign.reach || 0).toLocaleString("pt-BR")}\n`;
  s += `- CTR: ${(campaign.ctr || 0).toFixed(2)}%\n`;
  s += `- Connect Rate: ${(campaign.connectRate || 0).toFixed(2)}%\n`;
  s += `- ROAS: ${(campaign.roas || 0).toFixed(2)}x\n`;
  s += `- Frequência: ${(campaign.frequency || 0).toFixed(2)}\n`;
  s += `- Compras: ${campaign.purchases || 0}\n`;
  s += `- Mensagens: ${campaign.messages || 0}\n\n`;
  s += `**Ação recomendada:** ${campaign.escala_sugestao || "Monitorar"}\n\n`;

  if (Array.isArray(adsets) && adsets.length > 0) {
    s += `### Adsets\n`;
    adsets.slice(0, 5).forEach(a => {
      const ins = a.insights?.data?.[0];
      s += `- ${a.name}: Gasto R$ ${parseFloat(ins?.spend || 0).toFixed(2)}, CTR ${parseFloat(ins?.ctr || 0).toFixed(2)}%\n`;
    });
  }

  return s;
}

function generateInternalStrategy(data) {
  const { metrics, analysis } = data;
  let s = `### 🧠 Plano de Guerra\n\n`;
  s += `**Score de saúde:** ${analysis?.resumo_geral?.score_saude || 0}\n\n`;
  s += `- Investimento: R$ ${(metrics?.totalSpend || 0).toFixed(2)}\n`;
  s += `- ROAS: ${(metrics?.roas || 0).toFixed(2)}x\n`;
  s += `- Connect Rate: ${(metrics?.connectRate || 0).toFixed(1)}%\n`;
  s += `- CTR: ${(metrics?.avgCtr || 0).toFixed(2)}%\n\n`;
  s += `**Prioridade:** atacar desperdício, criativo fraco e gargalo de página antes de escalar.`;
  return s;
}

app.post("/api/gpt-copilot", auth, async (req, res) => {
  const { data } = req.body;

  if (!process.env.OPENAI_API_KEY || !openai) {
    return res.json({ strategy: generateInternalStrategy(data) });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Você é um estrategista sênior de Meta Ads. Seja direto, orientado por números e decisões."
        },
        {
          role: "user",
          content: `Analise os dados abaixo e gere um plano de guerra claro:\n\n${JSON.stringify(data, null, 2)}`
        }
      ],
      max_tokens: 1400
    });

    res.json({ strategy: completion.choices[0].message.content });
  } catch (e) {
    console.error("Erro OpenAI:", e.message);
    res.json({ strategy: generateInternalStrategy(data) });
  }
});

app.post("/api/gpt-campaign", auth, async (req, res) => {
  const { campaign, adsets, metrics } = req.body;

  if (!process.env.OPENAI_API_KEY || !openai) {
    return res.json({ analysis: generateCampaignAnalysis(campaign, adsets, metrics) });
  }

  try {
    const prompt = `
Analise esta campanha de tráfego pago.

Dados:
- Nome: ${campaign.name}
- Gasto: ${campaign.spend}
- Impressões: ${campaign.impressions}
- Alcance: ${campaign.reach}
- CTR: ${campaign.ctr}
- ROAS: ${campaign.roas}
- Frequência: ${campaign.frequency}
- Connect Rate: ${campaign.connectRate}
- Compras: ${campaign.purchases}
- Mensagens: ${campaign.messages}
- Leads: ${campaign.leads}

Responda como um gestor de tráfego experiente.

Formato obrigatório:
1. Diagnóstico direto
2. Problema principal
3. Ação recomendada objetiva
4. Se deve pausar, manter ou escalar
5. O que testar primeiro
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Você é um especialista em Meta Ads. Analise campanha, funil, criativo e segmentação."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 1100
    });

    res.json({ analysis: completion.choices[0].message.content });
  } catch (e) {
    console.error("Erro OpenAI campaign:", e.message);
    res.json({ analysis: generateCampaignAnalysis(campaign, adsets, metrics) });
  }
});

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

// ============================================================================
// V2 ENDPOINTS - Auditoria, Benchmarking, Landing Page
// ============================================================================

app.get("/api/audit-summary/:accountId", auth, async (req, res) => {
  try {
    const { accountId } = req.params;
    const campaigns = await db.query(
      `SELECT id, name, status, spend, impressions, clicks, reach, frequency, roas, purchases, messages, leads, ctr, cvr, cpc FROM campaigns WHERE account_id = $1 LIMIT 50`,
      [accountId]
    );
    if (!campaigns.rows.length) return res.json({ status: "success", audit: { campaigns: [], summary: {} } });
    const auditResults = decisionEngineV2.analyzeAccount(campaigns.rows);
    res.json({ status: "success", audit: auditResults, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error("Audit error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/campaign-audit/:campaignId", auth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const result = await db.query(
      `SELECT id, name, status, spend, impressions, clicks, reach, frequency, roas, purchases, messages, leads, ctr, cvr, cpc FROM campaigns WHERE id = $1`,
      [campaignId]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Campaign not found" });
    const auditResults = decisionEngineV2.analyzeCampaign(result.rows[0]);
    res.json({ status: "success", campaign_id: campaignId, audit: auditResults, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error("Campaign audit error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/audit-checks", auth, (req, res) => {
  try {
    const checks = Object.values(decisionEngineV2.auditChecks).map(check => ({
      id: check.id, name: check.name, category: check.category, severity: check.severity, description: check.description || ""
    }));
    res.json({ status: "success", total_checks: checks.length, checks: checks.sort((a, b) => a.category.localeCompare(b.category)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/benchmarks", auth, (req, res) => {
  try {
    const niches = Object.keys(benchmarksV2.benchmarks);
    res.json({ status: "success", niches, count: niches.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/benchmarks/:niche", auth, (req, res) => {
  try {
    const { niche } = req.params;
    const benchmark = benchmarksV2.getBenchmark(niche);
    res.json({ status: "success", niche, benchmark, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/compare-to-benchmark", auth, (req, res) => {
  try {
    const { niche, metrics } = req.body;
    if (!niche || !metrics) return res.status(400).json({ error: "niche and metrics required" });
    const comparison = benchmarksV2.compareToBenchmark(niche, metrics);
    const recommendations = benchmarksV2.getRecommendationsByBenchmark(niche, metrics);
    res.json({ status: "success", comparison, recommendations, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/benchmark-recommendations", auth, (req, res) => {
  try {
    const { niche, metrics } = req.body;
    if (!niche || !metrics) return res.status(400).json({ error: "niche and metrics required" });
    const recommendations = benchmarksV2.getRecommendationsByBenchmark(niche, metrics);
    res.json({ status: "success", niche, recommendations, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/audit-landing-page", auth, async (req, res) => {
  try {
    const { url, campaignId } = req.body;
    if (!url) return res.status(400).json({ error: "url required" });
    const pageMetrics = { lcp_ms: 2100, cls: 0.05, ttfb_ms: 450, dom_content_loaded_ms: 1800, page_size_mb: 2.5, cta_above_fold: true, form_present: true, form_fields: 4, phone_number: true, chat_widget: false, viewport_meta: true, horizontal_scroll: false, font_readable: true, testimonials: true, trust_badges: true, reviews_schema: true, company_info: true, guarantee: false, cta_clarity: "high", h1_count: 1, meta_description: "Example", schema_types: ["Organization"] };
    const auditResults = await landingPageAudit.runLandingPageAudit(pageMetrics);
    res.json({ status: "success", url, audit: auditResults, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error("Landing page audit error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/landing-page-checks", auth, (req, res) => {
  try {
    const checks = Object.values(landingPageAudit.landingPageChecks).map(check => ({
      id: check.id, name: check.name, category: check.category, severity: check.severity, description: check.description
    }));
    res.json({ status: "success", total_checks: checks.length, checks: checks.sort((a, b) => a.category.localeCompare(b.category)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/full-analysis", auth, async (req, res) => {
  try {
    const { campaignId, landingPageUrl, niche } = req.body;
    if (!campaignId) return res.status(400).json({ error: "campaignId required" });
    const campaignResult = await db.query(
      `SELECT id, name, status, spend, impressions, clicks, reach, frequency, roas, purchases, messages, leads, ctr, cvr, cpc FROM campaigns WHERE id = $1`,
      [campaignId]
    );
    if (!campaignResult.rows.length) return res.status(404).json({ error: "Campaign not found" });
    const campaign = campaignResult.rows[0];
    const campaignAudit = decisionEngineV2.analyzeCampaign(campaign);
    let benchmarkComparison = null;
    if (niche) {
      benchmarkComparison = benchmarksV2.compareToBenchmark(niche, { roas: campaign.roas, ctr: campaign.ctr, cvr: campaign.cvr, cpc: campaign.cpc, frequency: campaign.frequency });
    }
    let landingPageResults = null;
    if (landingPageUrl) {
      const pageMetrics = { lcp_ms: 2100, cls: 0.05, cta_above_fold: true, form_present: true, form_fields: 4 };
      landingPageResults = await landingPageAudit.runLandingPageAudit(pageMetrics);
    }
    res.json({ status: "success", campaign_audit: campaignAudit, benchmark_comparison: benchmarkComparison, landing_page_audit: landingPageResults, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error("Full analysis error:", e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  if (process.env.DATABASE_URL) await db.initDB();
});
/* ROUTES */
