require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const db = require('./db');

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
  if (req.query.error) return res.redirect('/?error=auth_denied');
  try {
    const t1 = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: { client_id: FB_APP_ID, client_secret: FB_APP_SECRET, redirect_uri: REDIRECT_URI, code: req.query.code }
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
    const { since, until, date_preset } = req.query;
    const params = {
      fields: 'campaign_id,campaign_name,impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,action_values',
      level: 'campaign', access_token: req.session.accessToken, limit: 200
    };
    if (since && until) params.time_range = JSON.stringify({ since, until });
    else params.date_preset = date_preset || 'last_30d';
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/adaccounts/:id/breakdown/:type', auth, async (req, res) => {
  try {
    const params = { fields: 'impressions,clicks,spend,cpm,ctr,cpc', level: 'account', access_token: req.session.accessToken, limit: 100 };
    if (req.params.type === 'device') params.breakdowns = 'device_platform';
    else if (req.params.type === 'placement') params.breakdowns = 'publisher_platform,platform_position';
    
    if (req.query.since && req.query.until) params.time_range = JSON.stringify({ since: req.query.since, until: req.query.until });
    else params.date_preset = req.query.date_preset || 'last_30d';
    
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, { params });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// NOVO: Rota para puxar Criativos e os seus dados individuais
app.get('/api/adaccounts/:id/creatives', auth, async (req, res) => {
  try {
    const { since, until, date_preset } = req.query;
    let insightsParam = since && until ? `insights.time_range({"since":"${since}","until":"${until}"})` : `insights.date_preset(${date_preset || 'last_30d'})`;
    
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/ads`, {
      params: {
        fields: `id,name,status,campaign{name},creative{id,name,thumbnail_url,image_url,body,title},${insightsParam}{impressions,clicks,spend,ctr,cpc,cpm,frequency,actions,action_values}`,
        access_token: req.session.accessToken,
        limit: 100
      }
    });
    res.json(r.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── MOTOR DE ANÁLISE IA (SÉNIOR) ───────────────────────────────────────────
app.post('/api/analyze', auth, async (req, res) => {
  const { accountData, campaigns, insights, dateRange } = req.body;
  try {
    const rows = insights?.data || [];
    const getAct = (arr, type) => { const f = (arr||[]).find(x=>x.action_type===type); return f ? parseFloat(f.value||0) : 0; };
    
    let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalReach = 0, freqSum = 0, freqCount = 0;
    let totalPurchases = 0, totalLeads = 0, totalMsg = 0, totalSessions = 0, totalRev = 0;
    const byId = {};
    
    rows.forEach(m => {
      const sp = parseFloat(m.spend || 0);
      const cl = parseInt(m.clicks || 0);
      const a = m.actions || [];
      const v = m.action_values || [];

      totalSpend += sp;
      totalImpressions += parseInt(m.impressions || 0);
      totalClicks += cl;
      totalReach += parseInt(m.reach || 0);
      if(m.frequency) { freqSum += parseFloat(m.frequency); freqCount++; }
      
      const pur = getAct(a,'offsite_conversion.fb_pixel_purchase') || getAct(a,'purchase');
      const lds = getAct(a,'offsite_conversion.fb_pixel_lead') || getAct(a,'lead');
      const msg = getAct(a,'onsite_conversion.messaging_conversation_started_7d') || getAct(a,'onsite_conversion.messaging_first_reply');
      const sess = getAct(a,'landing_page_view');
      const rev = getAct(v,'offsite_conversion.fb_pixel_purchase');

      totalPurchases += pur; totalLeads += lds; totalMsg += msg; totalSessions += sess; totalRev += rev;
      byId[m.campaign_id] = { ...m, pur, lds, msg, sess, rev, sp, cl };
    });

    const metrics = { 
      totalSpend, totalImpressions, totalClicks, totalReach, totalPurchases, totalLeads, totalMsg, totalSessions, totalRev,
      avgCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0, 
      avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      avgCpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
      avgFrequency: freqCount > 0 ? freqSum / freqCount : 0,
      connectRate: totalClicks > 0 ? (totalSessions / totalClicks) * 100 : 0,
      roas: totalSpend > 0 ? totalRev / totalSpend : 0,
      activeCampaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
      totalCampaigns: campaigns.length
    };

    const enriched = campaigns.map(c => {
      const m = byId[c.id] || { pur:0, lds:0, msg:0, sess:0, rev:0, sp:0, cl:0 };
      return { 
        ...c, spend: m.sp, ctr: parseFloat(m.ctr || 0), cpc: parseFloat(m.cpc || 0), cpm: parseFloat(m.cpm || 0), frequency: parseFloat(m.frequency || 0), 
        impressions: parseInt(m.impressions || 0), clicks: m.cl, purchases: m.pur, leads: m.lds, messages: m.msg, sessions: m.sess, revenue: m.rev,
        roas: m.sp > 0 ? m.rev / m.sp : 0, connectRate: m.cl > 0 ? (m.sess / m.cl) * 100 : 0
      };
    });
    
    const previousRun = await db.getLastRun(accountData.account_id);
    const aiAnalysis = runAnalysisEngine(accountData, enriched, metrics, previousRun);
    
    await db.saveRun({ fbAccountId: accountData.account_id, fbUserId: req.session.user.id, accountName: accountData.name, dateRange, metrics, campaigns: enriched, aiAnalysis });
    res.json({ success: true, analysis: aiAnalysis, metrics, previousRun });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const safeNum = (val) => Number(val) || 0;

function runAnalysisEngine(accountData, campaigns, metrics, previousRun) {
  const { avgCtr, avgCpc, avgCpm, avgFrequency, totalSpend, connectRate, roas, totalLeads, totalMsg, totalPurchases } = metrics;
  const S = accountData.currency === 'BRL' ? 'R$' : '$';
  
  let score = totalSpend > 0 ? 100 : 0;
  const issues = [];
  const otimizacoes = [];
  const alertas = [];
  let pri = 1;

  const benchCtr = 1.2; const benchCpc = 3.5; const benchFreq = 3.0;

  if (totalSpend === 0) {
    score -= 40;
    alertas.push({ mensagem: 'Sem investimento no período.', acao_requerida: 'Verifique se há limite de gastos atingido ou falha no cartão.' });
  } else {
    if (avgCtr < benchCtr) {
      score -= 15;
      if (avgFrequency > benchFreq) {
        issues.push(`Fadiga de Criativo Severa: CTR baixo e alta frequência.`);
        otimizacoes.push({ prioridade: pri++, titulo: 'Combater Saturação Urgente', categoria: 'Criativo/Público', impacto_esperado: 'Alto', descricao: `O público parou de clicar (CTR de ${safeNum(avgCtr).toFixed(2)}%). Isso inflaciona o CPA.`, acao: 'Pause os anúncios antigos. Crie novos criativos e expanda o seu público em 30%.' });
      } else {
        issues.push(`Desconexão de Oferta: CTR baixo (${safeNum(avgCtr).toFixed(2)}%) com público novo.`);
        otimizacoes.push({ prioridade: pri++, titulo: 'Melhorar Ganchos (Hooks)', categoria: 'Criativo', impacto_esperado: 'Alto', descricao: `O anúncio não está a reter atenção.`, acao: 'Teste os 3 primeiros segundos do vídeo com foco na dor primária do cliente.' });
      }
    }
    if (avgCpc > benchCpc) {
      score -= 10;
      if (avgCpm > 30) {
        issues.push(`Leilão Altamente Competitivo: CPM de ${S} ${safeNum(avgCpm).toFixed(2)}.`);
        otimizacoes.push({ prioridade: pri++, titulo: 'Fugir de Leilões Caros', categoria: 'Estrutura', impacto_esperado: 'Médio', descricao: `A briga está cara para esse público.`, acao: 'Mude para públicos Advantage+ (Broad) para o algoritmo encontrar impressões mais baratas.' });
      }
    }
    if (metrics.totalSessions > 0 && connectRate < 60) {
      score -= 15;
      otimizacoes.push({ prioridade: pri++, titulo: 'Vazamento no Site', categoria: 'Landing Page', impacto_esperado: 'Crítico', descricao: `Apenas ${safeNum(connectRate).toFixed(0)}% dos cliques chegam a carregar a página.`, acao: 'Otimize a velocidade do site e remova o posicionamento "Audience Network".' });
    }
    const hasConversions = (totalPurchases + totalLeads + totalMsg) > 0;
    if (totalSpend > 100 && !hasConversions) {
      score -= 20;
      alertas.push({ mensagem: `Gastou ${S} ${totalSpend.toFixed(2)} sem gerar conversões rastreadas.`, acao_requerida: 'Verifique o Pixel.' });
    }
    if (totalPurchases > 0 && roas < 1.5) {
      score -= 15;
      otimizacoes.push({ prioridade: pri++, titulo: 'Cortar Campanhas Sangrentas', categoria: 'Orçamento', impacto_esperado: 'Crítico', descricao: `ROAS negativo (${safeNum(roas).toFixed(2)}x).`, acao: 'Pause conjuntos não lucrativos e foque numa campanha de Retargeting.' });
    } else if (roas > 3.0) {
      otimizacoes.push({ prioridade: pri++, titulo: 'Escala de Lucro', categoria: 'Estratégia', impacto_esperado: 'Alto', descricao: `O ROAS está saudável (${safeNum(roas).toFixed(2)}x).`, acao: 'Aumente o orçamento das campanhas campeãs em 20% a cada 48 horas.' });
    }
  }

  score = Math.max(0, Math.min(100, score));
  const nivel_saude = score >= 85 ? 'Excelente' : score >= 65 ? 'Bom' : score >= 45 ? 'Atenção' : 'Crítico';

  const campanhas_analise = campaigns.map(c => {
    let diag = 'Analisando';
    if(c.spend === 0) diag = 'Sem Investimento';
    else if(c.roas > 2.5) diag = 'Escalar Imediatamente';
    else if(c.roas > 0 && c.roas < 1.5) diag = 'ROAS Negativo (Pausar)';
    else if(c.ctr < 1.0) diag = 'Baixo Engajamento';
    else if(c.cpc > 4.0) diag = 'Leilão Caro';
    else diag = 'Performance Estável';

    return { 
      campId: c.id, nome: c.name || 'Desconhecida', campStatus: c.status,
      gasto: `${S} ${safeNum(c.spend).toFixed(2)}`, ctr: `${safeNum(c.ctr).toFixed(2)}%`, cpc: `${S} ${safeNum(c.cpc).toFixed(2)}`, frequencia: `${safeNum(c.frequency).toFixed(2)}x`,
      impressoes: safeNum(c.impressions), cliques: safeNum(c.clicks), mensagens: safeNum(c.messages), leads: safeNum(c.leads), compras: safeNum(c.purchases), 
      receita: safeNum(c.revenue), roas: c.roas > 0 ? `${safeNum(c.roas).toFixed(2)}x` : '-', connectRate: c.connectRate > 0 ? `${safeNum(c.connectRate).toFixed(1)}%` : '-',
      diagnostico: diag, spendRaw: safeNum(c.spend)
    };
  });

  return {
    resumo_geral: { score_saude: score, nivel_saude, pontos_principais: issues.length ? issues : ['Métricas Saudáveis.'], resumo_historico: previousRun ? `Score anterior: ${previousRun.health_score} pts.` : 'Primeira análise profunda.' },
    campanhas_analise, otimizacoes_prioritarias: otimizacoes, alertas_criticos: alertas
  };
}

// ─── TENDENCIAS E HISTORICO ───────────────────────────────────────────────────
app.get('/api/trend/:accountId', auth, async (req, res) => { try { res.json({ trend: await db.getAccountTrend(req.params.accountId) }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/dashboard', (req, res) => { if (!req.session.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => { console.log(`🚀 API on port ${PORT}`); if (process.env.DATABASE_URL) await db.initDB(); });
