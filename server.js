require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const db = require('./db');
const nodemailer = require('nodemailer');

const app = express();

// --- CONFIGURAÇÃO PARA RAILWAY (PROXY REVERSO) ---
app.set('trust proxy', 1);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'meta-analyzer-ultra-v6',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: true, 
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const REDIRECT_URI = `${process.env.BASE_URL}/auth/facebook/callback`;

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
    const r = await axios.get('https://graph.facebook.com/v19.0/me/adaccounts', { params: { fields: 'name,account_id,currency,account_status,funding_source_details', access_token: req.session.accessToken, limit: 100 } });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/balance', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}`, { params: { fields: 'name,balance,amount_spent,spend_cap,funding_source_details', access_token: req.session.accessToken } });
    const data = r.data;
    
    // Identificar tipo de conta
    const funding = data.funding_source_details || {};
    data.is_prepaid = funding.type === 'PREPAID' || (data.balance && parseInt(data.balance) < 0);
    data.readable_balance = data.balance ? Math.abs(parseFloat(data.balance) / 100) : 0;
    
    // Alerta de saldo baixo (< R$ 100,00)
    if (data.is_prepaid && data.readable_balance < 100) {
        await sendLowBalanceAlert(data.name, data.readable_balance);
    }
    
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/campaigns', auth, async (req, res) => {
  try {
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/campaigns`, { params: { fields: 'id,name,status,objective', access_token: req.session.accessToken, limit: 100 } });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/insights', auth, async (req, res) => {
  try {
    const { since, until, date_preset } = req.query;
    const params = { fields: 'campaign_id,campaign_name,impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values', level: 'campaign', access_token: req.session.accessToken, limit: 200 };
    if (since && until) params.time_range = JSON.stringify({ since, until });
    else params.date_preset = date_preset || 'last_30d';
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/creatives', auth, async (req, res) => {
  try {
    const { date_preset, since, until } = req.query;
    const params = { 
      fields: `id,name,status,creative{thumbnail_url,image_url},insights.date_preset(${date_preset || 'last_30d'}){impressions,clicks,spend,ctr,actions,action_values}`, 
      access_token: req.session.accessToken, 
      limit: 50 
    };
    if (since && until) {
        params.fields = `id,name,status,creative{thumbnail_url,image_url},insights.time_range({"since":"${since}","until":"${until}"}){impressions,clicks,spend,ctr,actions,action_values}`;
    }
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/ads`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/breakdown/:type', auth, async (req, res) => {
  try {
    const { type } = req.params;
    const { date_preset, since, until } = req.query;
    const params = {
      fields: 'impressions,clicks,spend,ctr,actions,action_values',
      level: 'account',
      access_token: req.session.accessToken,
    };
    if (since && until) params.time_range = JSON.stringify({ since, until });
    else params.date_preset = date_preset || 'last_30d';

    if (type === 'device') params.breakdowns = 'device_platform';
    else if (type === 'platform') params.breakdowns = 'publisher_platform';
    else if (type === 'position') params.breakdowns = 'platform_position';

    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- MOTOR DE IA SÊNIOR ---
app.post('/api/analyze', auth, async (req, res) => {
  const { accountData, campaigns, insights, creatives, dateRange, previousInsights } = req.body;
  try {
    const getMetrics = (dataRows) => {
        const rows = dataRows || [];
        const getAct = (arr, type) => { 
            const f = (arr||[]).find(x => x.action_type === type); 
            return f ? parseFloat(f.value || 0) : 0; 
        };
        let tSpend = 0, tImpr = 0, tClicks = 0, tPur = 0, tLds = 0, tMsg = 0, tSess = 0, tRev = 0;
        const byId = {};
        rows.forEach(m => {
          const sp = parseFloat(m.spend || 0); 
          const cl = parseInt(m.clicks || 0); 
          const impr = parseInt(m.impressions || 0);
          tSpend += sp; tImpr += impr; tClicks += cl;
          
          // Métricas de Conversão
          const pur = getAct(m.actions,'offsite_conversion.fb_pixel_purchase') || getAct(m.actions,'purchase');
          const lds = getAct(m.actions,'offsite_conversion.fb_pixel_lead') || getAct(m.actions,'lead');
          const msg = getAct(m.actions,'onsite_conversion.messaging_conversation_started_7d') || getAct(m.actions,'onsite_conversion.messaging_first_reply');
          const sess = getAct(m.actions,'landing_page_view');
          const rev = getAct(m.action_values,'offsite_conversion.fb_pixel_purchase') || getAct(m.action_values, 'purchase');
          
          tPur += pur; tLds += lds; tMsg += msg; tSess += sess; tRev += rev;
          byId[m.campaign_id] = { ...m, pur, lds, msg, sess, rev, sp, cl, impr };
        });
        return { 
            totalSpend: tSpend, totalImpressions: tImpr, totalClicks: tClicks, totalPurchases: tPur, 
            totalLeads: tLds, totalMsg: tMsg, totalSessions: tSess, totalRev: tRev, 
            avgCtr: tImpr > 0 ? (tClicks / tImpr) * 100 : 0, avgCpc: tClicks > 0 ? tSpend / tClicks : 0, 
            connectRate: tClicks > 0 ? (tSess / tClicks) * 100 : 0, roas: tSpend > 0 ? tRev / tSpend : 0,
            byId
        };
    };

    const metrics = getMetrics(insights?.data);
    const prevMetrics = previousInsights ? getMetrics(previousInsights.data) : null;

    const enriched = campaigns.map(c => {
      const m = metrics.byId[c.id] || { pur:0, lds:0, msg:0, sess:0, rev:0, sp:0, cl:0, impr:0, ctr:0 };
      let diagIA = "Campanha com poucos dados.";
      let statusPerf = "Estável";
      let escalaIA = "Aguardando mais dados.";

      if (m.sp > 0) {
          const campRoas = m.sp > 0 ? m.rev / m.sp : 0;
          const campCtr = parseFloat(m.ctr || 0);
          const campConnect = m.cl > 0 ? (m.sess / m.cl) * 100 : 0;
          const costPerMsg = m.msg > 0 ? m.sp / m.msg : 0;

          if (campRoas > 3 || (m.msg > 10 && costPerMsg < 5)) { 
              diagIA = "🔥 Alta performance! Otimização de criativo e público validada."; 
              statusPerf = "Excelente";
              escalaIA = "Sugestão: Aumentar orçamento em 20% a cada 48h.";
          }
          else if (campRoas > 1.5 || (m.msg > 5 && costPerMsg < 10)) { 
              diagIA = "✅ Performance estável. ROI dentro da meta."; 
              statusPerf = "Bom";
              escalaIA = "Sugestão: Manter orçamento e monitorar CTR.";
          }
          else if (m.sp > 50 && m.msg === 0 && m.pur === 0) {
              diagIA = "🚨 Alerta de Queima de Verba! Sem conversões após gasto relevante.";
              statusPerf = "Crítico (Gasto)";
              escalaIA = "Sugestão: Pausar imediatamente e revisar oferta.";
          }
          else if (campCtr < 0.8) { 
              diagIA = "🪝 CTR Baixo. O público não está clicando no seu anúncio."; 
              statusPerf = "Crítico (Criativo)";
              escalaIA = "Sugestão: Trocar criativo por um com gancho mais forte.";
          }
          else if (campConnect < 50) { 
              diagIA = "📉 Perda de Tráfego. O site está demorando para carregar."; 
              statusPerf = "Crítico (Site)";
              escalaIA = "Sugestão: Otimizar velocidade do site ou checkout.";
          }
      }
      return { 
          ...c, 
          spend: m.sp, ctr: parseFloat(m.ctr || 0), impressions: m.impr, clicks: m.cl, 
          purchases: m.pur, messages: m.msg, leads: m.lds, revenue: m.rev, 
          roas: m.sp > 0 ? m.rev / m.sp : 0, connectRate: m.cl > 0 ? (m.sess / m.cl) * 100 : 0, 
          diagnostico: diagIA, status_performance: statusPerf, escala_sugestao: escalaIA,
          costPerMsg: m.msg > 0 ? m.sp / m.msg : 0
      };
    });

    const previousRun = await db.getLastRun(accountData.account_id);
    const aiAnalysis = runAnalysisEngine(accountData, enriched, metrics, previousRun);

    await db.saveRun({
        fbAccountId: accountData.account_id,
        fbUserId: req.session.user.id,
        accountName: accountData.name,
        dateRange: dateRange || 'last_30d',
        metrics: { ...metrics, activeCampaigns: enriched.filter(x=>x.status==='ACTIVE').length, totalCampaigns: enriched.length },
        campaigns: enriched,
        aiAnalysis: aiAnalysis
    });

    res.json({ success: true, analysis: aiAnalysis, metrics, prevMetrics, previousRun });
  } catch (err) { 
    console.error('Erro na análise IA:', err);
    res.status(500).json({ error: err.message }); 
  }
});

function runAnalysisEngine(accountData, campaigns, metrics, previousRun) {
  const { avgCtr, totalSpend, connectRate, roas, totalMsg, totalPurchases } = metrics;
  let score = totalSpend > 0 ? 100 : 0;
  const otimizacoes = [];

  if (avgCtr < 1.0) {
      score -= 20;
      otimizacoes.push({ prioridade: 1, titulo: 'Fadiga Criativa', categoria: 'Criativo', descricao: `CTR (${avgCtr.toFixed(2)}%) abaixo do ideal.`, acao: 'Troque os criativos campeões que estão caindo.' });
  }
  if (connectRate < 60 && totalSpend > 50) {
      score -= 15;
      otimizacoes.push({ prioridade: 2, titulo: 'Gargalo no Site', categoria: 'Site', descricao: `Apenas ${connectRate.toFixed(1)}% dos cliques chegam à página.`, acao: 'Otimize a velocidade do seu site.' });
  }
  if (roas < 1.5 && totalSpend > 100 && totalMsg < 5 && totalPurchases < 1) {
      score -= 25;
      otimizacoes.push({ prioridade: 1, titulo: 'ROI Insustentável', categoria: 'Oferta', descricao: 'O retorno está abaixo do breakeven.', acao: 'Revise sua oferta ou mude o público.' });
  }

  return { 
    resumo_geral: { 
        score_saude: Math.max(0, score), 
        nivel_saude: score > 80 ? 'Excelente' : (score > 50 ? 'Atenção' : 'Crítico'),
        resumo_historico: previousRun ? `Saúde anterior: ${previousRun.health_score} pts.` : 'Primeira análise registrada.'
    }, 
    campanhas_analise: campaigns.sort((a,b) => b.spend - a.spend), 
    otimizacoes_prioritarias: otimizacoes 
  };
}

app.get('/api/trend/:accountId', auth, async (req, res) => { try { res.json({ trend: await db.getAccountTrend(req.params.accountId) }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/dashboard', (req, res) => { if (!req.session.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => { if (process.env.DATABASE_URL) await db.initDB(); });
