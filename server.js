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
  secret: process.env.SESSION_SECRET || 'meta-analyzer-ultra-v7',
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
    const r = await axios.get('https://graph.facebook.com/v19.0/me/adaccounts', { params: { fields: 'name,account_id,currency,account_status,funding_source_details,balance', access_token: req.session.accessToken, limit: 100 } });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/consolidated-balance', auth, async (req, res) => {
  try {
    const r = await axios.get('https://graph.facebook.com/v19.0/me/adaccounts', { params: { fields: 'name,balance,funding_source_details', access_token: req.session.accessToken, limit: 100 } });
    const accounts = r.data.data || [];
    let totalPrepaidBalance = 0;
    let prepaidCount = 0;
    let postpaidCount = 0;
    
    accounts.forEach(acc => {
      const isPrepaid = acc.funding_source_details?.type === 'PREPAID' || (acc.balance && parseInt(acc.balance) < 0);
      if (isPrepaid) {
        totalPrepaidBalance += Math.abs(parseFloat(acc.balance || 0) / 100);
        prepaidCount++;
      } else {
        postpaidCount++;
      }
    });
    
    res.json({ totalPrepaidBalance, prepaidCount, postpaidCount, totalAccounts: accounts.length });
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
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/campaigns`, { params: { fields: 'id,name,status,objective', access_token: req.session.accessToken, limit: 200 } });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Conjuntos de Anúncios por Campanha
app.get('/api/campaigns/:id/adsets', auth, async (req, res) => {
  try {
    const { date_preset, since, until } = req.query;
    const fields = 'id,name,status,targeting,insights.date_preset(' + (date_preset || 'last_30d') + '){impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}';
    const params = { fields, access_token: req.session.accessToken, limit: 100 };
    if (since && until) params.fields = 'id,name,status,targeting,insights.time_range({"since":"' + since + '","until":"' + until + '"}){impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}';
    const r = await axios.get(`https://graph.facebook.com/v19.0/${req.params.id}/adsets`, { params });
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
    const fields = 'id,name,status,creative,insights.date_preset(' + (date_preset || 'last_30d') + '){impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}';
    const params = { fields, access_token: req.session.accessToken, limit: 100 };
    if (since && until) params.fields = 'id,name,status,creative,insights.date_preset(' + (date_preset || 'last_30d') + '){impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}';
    const r = await axios.get(`https://graph.facebook.com/v19.0/${req.params.id}/ads`, { params });
    res.json(r.data);
  } catch (e) { 
    console.error('Erro Ads:', e.response ? e.response.data : e.message);
    res.status(500).json({ error: e.message }); 
  }
});

app.get('/api/adaccounts/:id/insights', auth, async (req, res) => {
  try {
    const { since, until, date_preset } = req.query;
    const params = { 
      fields: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_avg_time_watched_actions', 
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

app.get('/api/adaccounts/:id/creatives', auth, async (req, res) => {
  try {
    const { date_preset, since, until } = req.query;
    let time_range = null;
    if (since && until) {
      time_range = JSON.stringify({ since, until });
    }
    
    const params = { 
      fields: `id,name,status,creative{thumbnail_url,image_url,video_id},insights${time_range ? `.time_range(${time_range})` : `.date_preset(${date_preset || 'last_30d'})`}{impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values}`, 
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

app.get('/api/trend/:id', auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.json({ trend: [] });
    const trend = await db.getAccountTrend(req.params.id);
    res.json({ trend });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

// --- MOTOR DE IA SÊNIOR & GPT-4O ---
app.post('/api/analyze', auth, async (req, res) => {
  const { accountData, campaigns, insights, creatives, dateRange, previousInsights } = req.body;
  try {
    const getMetrics = (dataRows) => {
        const rows = dataRows || [];
        const getAct = (arr, type) => { const f = (arr||[]).find(x => x.action_type === type); return f ? parseFloat(f.value || 0) : 0; };
        let tSpend = 0, tImpr = 0, tClicks = 0, tPur = 0, tLds = 0, tMsg = 0, tSess = 0, tRev = 0, tReach = 0, tFreq = 0, tAddCart = 0, tInitiateCheckout = 0;
        const byId = {};
        rows.forEach(m => {
          const sp = parseFloat(m.spend || 0); 
          const cl = parseInt(m.clicks || 0); 
          const impr = parseInt(m.impressions || 0);
          const reach = parseInt(m.reach || 0);
          
          tSpend += sp; tImpr += impr; tClicks += cl; tReach += reach;
          
          const pur = getAct(m.actions,'offsite_conversion.fb_pixel_purchase') || getAct(m.actions,'purchase') || getAct(m.actions,'omni_purchase');
          const lds = getAct(m.actions,'offsite_conversion.fb_pixel_lead') || getAct(m.actions,'lead');
          const msg = getAct(m.actions,'onsite_conversion.messaging_conversation_started_7d') || getAct(m.actions,'onsite_conversion.messaging_first_reply') || getAct(m.actions,'link_click'); // Fallback para mensagens
          const sess = getAct(m.actions,'landing_page_view');
          const addCart = getAct(m.actions,'offsite_conversion.fb_pixel_add_to_cart') || getAct(m.actions,'add_to_cart');
          const initCheck = getAct(m.actions,'offsite_conversion.fb_pixel_initiate_checkout') || getAct(m.actions,'initiate_checkout');
          const rev = getAct(m.action_values,'offsite_conversion.fb_pixel_purchase') || getAct(m.action_values, 'purchase') || getAct(m.action_values,'omni_purchase');
          
          tPur += pur; tLds += lds; tMsg += msg; tSess += sess; tRev += rev; tAddCart += addCart; tInitiateCheckout += initCheck;
          
          if (!byId[m.campaign_id]) {
            byId[m.campaign_id] = { sp: 0, cl: 0, impr: 0, reach: 0, pur: 0, lds: 0, msg: 0, sess: 0, rev: 0, addCart: 0, initCheck: 0 };
          }
          byId[m.campaign_id].sp += sp;
          byId[m.campaign_id].cl += cl;
          byId[m.campaign_id].impr += impr;
          byId[m.campaign_id].reach += reach;
          byId[m.campaign_id].pur += pur;
          byId[m.campaign_id].lds += lds;
          byId[m.campaign_id].msg += msg;
          byId[m.campaign_id].sess += sess;
          byId[m.campaign_id].rev += rev;
          byId[m.campaign_id].addCart += addCart;
          byId[m.campaign_id].initCheck += initCheck;
        });
        
        tFreq = tReach > 0 ? tImpr / tReach : 0;
        
        return { 
          totalSpend: tSpend, totalImpressions: tImpr, totalClicks: tClicks, 
          totalPurchases: tPur, totalLeads: tLds, totalMessages: tMsg, 
          totalSessions: tSess, totalRev: tRev, totalReach: tReach, 
          totalAddCart: tAddCart, totalInitiateCheckout: tInitiateCheckout,
          avgFrequency: tFreq,
          roas: tSpend > 0 ? tRev / tSpend : 0, 
          avgCtr: tImpr > 0 ? (tClicks / tImpr) * 100 : 0, 
          connectRate: tClicks > 0 ? (tSess / tClicks) * 100 : 0, 
          byId 
        };tSpend > 0 ? tRev / tSpend : 0, byId };
    };

    const metrics = getMetrics(insights?.data);
    const prevMetrics = previousInsights ? getMetrics(previousInsights.data) : null;

    const enriched = campaigns.map(c => {
      const m = metrics.byId[c.id] || { pur:0, lds:0, msg:0, sess:0, rev:0, sp:0, cl:0, impr:0, reach:0, addCart:0, initCheck:0 };
      let diagIA = "Aguardando dados."; let statusPerf = "Estável"; let escalaIA = "Monitorar.";
      const campCtr = m.impr > 0 ? (m.cl / m.impr) * 100 : 0;
      const campRoas = m.sp > 0 ? m.rev / m.sp : 0;
      const costPerMsg = m.msg > 0 ? m.sp / m.msg : 0;
      const costPerPur = m.pur > 0 ? m.sp / m.pur : 0;
      const freq = m.reach > 0 ? m.impr / m.reach : 0;

      if (m.sp > 0) {
          if (campRoas > 3 || (m.msg > 10 && costPerMsg < 5)) { diagIA = "🔥 Alta performance!"; statusPerf = "Excelente"; escalaIA = "Escalar verba."; }
          else if (campRoas > 1.5 || (m.msg > 5 && costPerMsg < 10)) { diagIA = "✅ Estável."; statusPerf = "Bom"; escalaIA = "Manter."; }
          else if (m.sp > 50 && m.msg === 0 && m.pur === 0) { diagIA = "🚨 Queima de verba!"; statusPerf = "Crítico"; escalaIA = "Pausar."; }
          else if (campCtr < 0.8) { diagIA = "🪝 CTR Baixo."; statusPerf = "Criativo Ruim"; escalaIA = "Trocar criativo."; }
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
        roas: campRoas, 
        connectRate: m.cl > 0 ? (m.sess / m.cl) * 100 : 0, 
        diagnostico: diagIA, 
        status_performance: statusPerf, 
        escala_sugestao: escalaIA, 
        costPerMsg: costPerMsg,
        costPerPur: costPerPur
      };
    });

    const aiAnalysis = runAnalysisEngine(accountData, enriched, metrics, prevMetrics);
    
    // Salvar no banco para tendências se configurado
    if (process.env.DATABASE_URL) {
      try {
        await db.saveRun({
          fbAccountId: req.body.accountData.account_id,
          fbUserId: req.session.user.id,
          accountName: req.body.accountData.name,
          dateRange: req.body.dateRange,
          metrics,
          campaigns: enriched,
          aiAnalysis
        });
      } catch (dbErr) { console.error('Erro ao salvar no banco:', dbErr.message); }
    }

    res.json({ success: true, analysis: { ...aiAnalysis, campanhas_analise: enriched }, metrics, prevMetrics });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function runAnalysisEngine(accountData, campaigns, metrics, prevMetrics) {
    let score = 100;
    const otimizacoes = [];
    
    if (metrics.roas < 1.5) { score -= 20; otimizacoes.push({ prioridade: 1, titulo: 'ROAS Baixo', categoria: 'Financeiro', descricao: 'Seu retorno sobre investimento está abaixo do ideal.', acao: 'Foque nos criativos com maior CTR.' }); }
    if (metrics.connectRate < 60 && metrics.totalSpend > 50) { score -= 15; otimizacoes.push({ prioridade: 2, titulo: 'Lentidão no Site', categoria: 'Funil', descricao: 'Muitas pessoas clicam mas não esperam o site carregar.', acao: 'Otimize a velocidade da sua landing page.' }); }
    
    if (prevMetrics) {
        if (metrics.roas < prevMetrics.roas) otimizacoes.push({ prioridade: 2, titulo: 'Queda de ROAS', categoria: 'Tendência', descricao: `Seu ROAS caiu de ${prevMetrics.roas.toFixed(2)} para ${metrics.roas.toFixed(2)}.`, acao: 'Verifique se houve fadiga de criativo ou aumento de CPM.' });
    }

    return { resumo_geral: { score_saude: Math.max(0, score), nivel_saude: score > 80 ? 'Excelente' : (score > 50 ? 'Atenção' : 'Crítico') }, otimizacoes_prioritarias: otimizacoes };
}

app.post('/api/gpt-copilot', auth, async (req, res) => {
  const { data } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey === 'sua-chave-aqui' || !openai) {
    return res.json({ strategy: generateInternalStrategy(data) });
  }

  try {
    const prompt = `Você é um Diretor de Tráfego Sênior especialista em algoritmo da Meta (Andromeda). Analise os seguintes dados e gere um "Plano de Guerra" estratégico em Markdown:
    DADOS: ${JSON.stringify(data)}
    Foque em: Escala de orçamento, Fadiga de Criativo, Liquidez da conta e Otimização de ROAS.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: "Você é um estrategista de tráfego pago sênior." }, { role: "user", content: prompt }],
    });

    res.json({ strategy: completion.choices[0].message.content });
  } catch (e) {
    console.error('Erro OpenAI:', e.message);
    res.json({ strategy: generateInternalStrategy(data) });
  }
});

function generateInternalStrategy(data) {
  const { metrics, analysis } = data;
  let s = `### 🧠 Plano de Guerra (Motor Interno Sênior)\n\n`;
  s += `Sua conta está com uma pontuação de saúde de **${analysis.resumo_geral.score_saude} pts**. Aqui estão as ações prioritárias:\n\n`;
  if (metrics.roas < 2) s += `⚠️ **Ação de ROAS:** Seu retorno está baixo (${metrics.roas.toFixed(2)}). Recomendamos testar novos criativos de "topo de funil" para atrair público mais barato.\n\n`;
  if (metrics.connectRate < 70) s += `🚀 **Otimização de Site:** Sua taxa de carregamento está em ${metrics.connectRate.toFixed(1)}%. Você está perdendo dinheiro com site lento.\n\n`;
  s += `💡 **Dica Andromeda:** O algoritmo da Meta performa melhor com públicos mais amplos quando a verba é limitada. Evite segmentações muito fechadas.`;
  return s;
}

app.get('/dashboard', (req, res) => { if (!req.session.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => { 
    console.log(`Servidor rodando na porta ${PORT}`);
    if (process.env.DATABASE_URL) await db.initDB(); 
});
