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
  const scopes = ['ads_read', 'ads_management', 'business_management', 'public_profile', 'pages_show_list', 'instagram_basic'].join(',');
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
    console.error('Auth Error:', err.message);
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

// ─── MOTOR DE ANÁLISE IA ESPECIALISTA ────────────────────────────────────────
app.post('/api/analyze', auth, async (req, res) => {
  const { accountData, campaigns, insights, dateRange } = req.body;
  try {
    const rows = insights?.data || [];
    let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalReach = 0, freqSum = 0, freqCount = 0;
    const byId = {};
    
    rows.forEach(m => {
      totalSpend += parseFloat(m.spend || 0); 
      totalImpressions += parseInt(m.impressions || 0); 
      totalClicks += parseInt(m.clicks || 0); 
      totalReach += parseInt(m.reach || 0);
      if(m.frequency) { freqSum += parseFloat(m.frequency); freqCount++; }
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
      return { 
        ...c, 
        spend: parseFloat(m.spend || 0), 
        ctr: parseFloat(m.ctr || 0), 
        cpc: parseFloat(m.cpc || 0), 
        cpm: parseFloat(m.cpm || 0), 
        frequency: parseFloat(m.frequency || 0), 
        impressions: parseInt(m.impressions || 0), 
        clicks: parseInt(m.clicks || 0) 
      };
    });
    
    const previousRun = await db.getLastRun(accountData.account_id);
    const aiAnalysis = runAnalysisEngine(accountData, enriched, metrics, previousRun);
    
    await db.saveRun({ fbAccountId: accountData.account_id, fbUserId: req.session.user.id, accountName: accountData.name, dateRange, metrics, campaigns: enriched, aiAnalysis });
    res.json({ success: true, analysis: aiAnalysis, metrics, previousRun });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

const safeNum = (val) => Number(val) || 0;

function runAnalysisEngine(accountData, campaigns, metrics, previousRun) {
  // Correção do erro de destruturação: todas as variáveis extraídas corretamente
  const { avgCtr, avgCpc, avgCpm, avgFrequency, totalSpend, totalImpressions, activeCampaigns } = metrics;
  const S = accountData.currency === 'BRL' ? 'R$' : '$';
  
  let score = totalSpend > 0 ? 100 : 0;
  const issues = [];
  const otimizacoes = [];
  const alertas = [];
  let pri = 1;

  const benchCtr = 1.2;
  const benchCpc = 3.5;
  const benchFreq = 3.0;

  // Lógica Especialista Senior: Cruzamento de Dados
  if (totalSpend === 0) {
    score -= 40;
    alertas.push({ mensagem: 'Sem investimento. A conta não gastou nada no período selecionado.', acao_requerida: 'Verifique se há limite de gastos da conta atingido ou falha no cartão de crédito.' });
  } else {
    // Análise de CTR e Saturação (Funil Topo)
    if (avgCtr < benchCtr) {
      score -= 15;
      if (avgFrequency > benchFreq) {
        issues.push(`Fadiga de Criativo Severa: CTR baixo (${safeNum(avgCtr).toFixed(2)}%) com alta frequência (${safeNum(avgFrequency).toFixed(2)}x).`);
        otimizacoes.push({ prioridade: pri++, titulo: 'Combater Saturação Urgente', categoria: 'Criativo e Público', impacto_esperado: 'Alto', descricao: `Seu público já viu o mesmo anúncio muitas vezes (${safeNum(avgFrequency).toFixed(1)}x em média) e parou de clicar (CTR de ${safeNum(avgCtr).toFixed(2)}%). Isso inflaciona o seu CPA.`, acao: 'Ação: Pause os anúncios antigos. Crie novos criativos com abordagens/ganchos diferentes e expanda seu público em 30%.' });
      } else {
        issues.push(`Desconexão de Oferta: CTR baixo (${safeNum(avgCtr).toFixed(2)}%) mesmo com público fresco.`);
        otimizacoes.push({ prioridade: pri++, titulo: 'Melhorar Ganchos (Hooks)', categoria: 'Criativo', impacto_esperado: 'Alto', descricao: `O público é novo (Frequência ok), mas o anúncio não está chamando atenção (CTR ${safeNum(avgCtr).toFixed(2)}%). A oferta ou a imagem não estão conectando.`, acao: 'Ação: Teste os 3 primeiros segundos do vídeo ou crie títulos de imagem mais agressivos focados na dor do cliente.' });
      }
    }

    // Análise de CPC e CPM (Leilão)
    if (avgCpc > benchCpc) {
      score -= 10;
      if (avgCpm > 30) {
        issues.push(`Leilão Altamente Competitivo: CPM de ${S} ${safeNum(avgCpm).toFixed(2)} está gerando CPCs caros.`);
        otimizacoes.push({ prioridade: pri++, titulo: 'Fugir de Leilões Caros', categoria: 'Lances e Estrutura', impacto_esperado: 'Médio', descricao: `O seu custo por clique está em ${S} ${safeNum(avgCpc).toFixed(2)} porque o CPM (custo para aparecer) está altíssimo. Você está brigando com tubarões pelo mesmo público restrito.`, acao: 'Ação: Abra a segmentação (use Advantage+ ou Broad) para permitir que a Meta encontre bolsões de inventário mais baratos.' });
      } else {
        issues.push(`Rejeição de Anúncio: CPM barato, mas CPC alto. As pessoas veem mas não clicam.`);
      }
    }

    // Escalabilidade
    if (score >= 85 && activeCampaigns > 0) {
      otimizacoes.push({ prioridade: pri++, titulo: 'Fase de Escala (Scale Up)', categoria: 'Estratégia', impacto_esperado: 'Alto', descricao: 'A conta apresenta indicadores muito saudáveis. É o momento exato para injetar mais orçamento sem quebrar o algoritmo.', acao: 'Ação: Aumente o orçamento das campanhas campeãs em 20% a cada 3 dias, ou duplique a campanha para públicos semelhantes (Lookalike 1% e 3%).' });
    }
  }

  score = Math.max(0, Math.min(100, score));
  const nivel_saude = score >= 85 ? 'Excelente' : score >= 65 ? 'Bom' : score >= 45 ? 'Atenção' : 'Crítico';

  const campanhas_analise = campaigns.map(c => {
    let statusPerf = 'Atenção';
    let prob = 'Baixo Engajamento';
    if(c.spend === 0) { statusPerf = 'Parada'; prob = 'Sem Gasto'; }
    else if(c.ctr > 1.2 && c.cpc < benchCpc) { statusPerf = 'Excelente'; prob = 'Nenhum, escalar!'; }
    else if(c.ctr >= 0.8) { statusPerf = 'Bom'; prob = 'Pode melhorar CTR'; }

    return { 
      nome: c.name, campStatus: c.status, status_performance: statusPerf,
      gasto: `${S} ${safeNum(c.spend).toFixed(2)}`, ctr: `${safeNum(c.ctr).toFixed(2)}%`, 
      cpc: `${S} ${safeNum(c.cpc).toFixed(2)}`, frequencia: `${safeNum(c.frequency).toFixed(2)}x`,
      problema_principal: prob,
      spendRaw: safeNum(c.spend) // Usado no frontend para o filtro "Rodando"
    };
  });

  return {
    resumo_geral: { score_saude: score, nivel_saude, pontos_principais: issues.length ? issues : ['Estrutura técnica sólida.', 'Métricas de leilão favoráveis.'] },
    campanhas_analise,
    otimizacoes_prioritarias: otimizacoes,
    alertas_criticos: alertas,
    plano_acao_30dias: [
      { semana: 1, foco: 'Diagnóstico & Limpeza', acoes: ['Pausar anúncios com CTR < 0.5%', 'Criar novos ganchos visuais'] },
      { semana: 2, foco: 'Teste de Públicos', acoes: ['Testar Lookalike 2% vs Público Aberto (Broad)'] }
    ]
  };
}

// ─── INSTAGRAM CONTENT ────────────────────────────────────────────────────────
app.get('/api/instagram/accounts', auth, async (req, res) => {
  try {
    // Alterado para buscar paginas com contas IG associadas
    const pages = await axios.get('https://graph.facebook.com/v19.0/me/accounts', { 
      params: { fields: 'instagram_business_account{id,username,profile_picture_url}', access_token: req.session.accessToken } 
    });
    const igAccounts = []; 
    if (pages.data && pages.data.data) {
      pages.data.data.forEach(p => { 
        if (p.instagram_business_account) igAccounts.push(p.instagram_business_account); 
      });
    }
    res.json({ data: igAccounts });
  } catch (e) { 
    console.error("IG API Error:", e.response?.data || e.message);
    res.status(500).json({ error: 'Falha ao buscar Instagram. Confirme se a sua página está vinculada a uma conta IG Profissional.' }); 
  }
});

const { generateContentPlanEngine } = require('./content_engine');
app.post('/api/content-plan', auth, (req, res) => {
  try { res.json({ success: true, plan: generateContentPlanEngine(req.body) }); } 
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── TENDENCIAS ───────────────────────────────────────────────────────────────
app.get('/api/trend/:accountId', auth, async (req, res) => { 
  try { res.json({ trend: await db.getAccountTrend(req.params.accountId) }); } 
  catch (e) { res.status(500).json({ error: e.message }); } 
});

// ─── ROUTES PADRÃO ───────────────────────────────────────────────────────────
app.get('/dashboard', (req, res) => { if (!req.session.user) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => { console.log(`🚀 API on port ${PORT}`); if (process.env.DATABASE_URL) await db.initDB(); });
