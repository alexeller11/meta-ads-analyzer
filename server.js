require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const nodemailer = require('nodemailer');
const path = require('path');
const db = require('./db');

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
      params: { fields: 'name,account_id,currency,account_status,business_name,timezone_name,amount_spent', access_token: req.session.accessToken, limit: 100 }
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
    const r = await axios.get(`https://graph.facebook.com/v19.0/act_${req.params.id}/insights`, {
      params: {
        fields: 'campaign_id,campaign_name,impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,cost_per_action_type,unique_clicks',
        date_preset: req.query.date_preset || 'last_30d',
        level: 'campaign',
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

// ─── MOTOR DE ANÁLISE POR REGRAS ─────────────────────────────────────────────

function runAnalysisEngine(accountData, campaigns, metrics, previousRun, dateRange) {
  const { avgCtr, avgCpc, avgCpm, avgFrequency, totalSpend, activeCampaigns, totalCampaigns } = metrics;
  const currency = accountData.currency === 'BRL' ? 'R$' : accountData.currency === 'USD' ? '$' : (accountData.currency || 'R$');

  // ── Score de saúde ────────────────────────────────────────────────────────
  let score = 100;
  const problemas = [];

  // CTR
  if (avgCtr < 0.3)       { score -= 25; problemas.push('CTR crítico (abaixo de 0,3%)'); }
  else if (avgCtr < 0.8)  { score -= 15; problemas.push('CTR abaixo do ideal'); }
  else if (avgCtr < 1.0)  { score -= 8; }

  // Frequência
  if (avgFrequency > 5)   { score -= 20; problemas.push('Frequência muito alta — saturação de audiência'); }
  else if (avgFrequency > 3.5) { score -= 12; problemas.push('Frequência elevada — risco de saturação'); }
  else if (avgFrequency > 2.5) { score -= 5; }

  // CPC
  if (avgCpc > 10)        { score -= 15; problemas.push('CPC muito alto'); }
  else if (avgCpc > 5)    { score -= 8; }

  // CPM
  if (avgCpm > 60)        { score -= 12; problemas.push('CPM elevado — audiência muito disputada'); }
  else if (avgCpm > 35)   { score -= 6; }

  // Campanhas ativas vs total
  const pctAtivas = totalCampaigns > 0 ? activeCampaigns / totalCampaigns : 1;
  if (pctAtivas < 0.3 && totalCampaigns > 2) { score -= 10; problemas.push('Maioria das campanhas pausadas'); }

  // Sem gasto
  if (totalSpend === 0)   { score -= 30; problemas.push('Sem investimento no período'); }

  score = Math.max(0, Math.min(100, score));

  let nivel_saude, tendencia = 'sem_historico', variacao_score = null, resumo_historico = 'Primeira análise registrada.';

  if (score >= 80)      nivel_saude = 'Excelente';
  else if (score >= 60) nivel_saude = 'Bom';
  else if (score >= 40) nivel_saude = 'Atenção';
  else                  nivel_saude = 'Crítico';

  // Comparação histórica
  if (previousRun && previousRun.health_score != null) {
    variacao_score = score - previousRun.health_score;
    tendencia = variacao_score > 3 ? 'melhora' : variacao_score < -3 ? 'piora' : 'estavel';
    const diff = variacao_score > 0 ? `subiu ${variacao_score} pontos` : variacao_score < 0 ? `caiu ${Math.abs(variacao_score)} pontos` : 'manteve estável';
    const dataAnterior = new Date(previousRun.created_at).toLocaleDateString('pt-BR');
    resumo_historico = `Score ${diff} em relação à análise de ${dataAnterior} (era ${previousRun.health_score}pts).`;
  }

  const pontos_principais = problemas.length > 0
    ? problemas.slice(0, 3)
    : score >= 80
      ? ['Conta com boa performance geral', 'Métricas dentro dos benchmarks', 'Continue monitorando tendências']
      : ['Verifique as otimizações sugeridas', 'Acompanhe as métricas semanalmente'];

  // ── Métricas comparativas ─────────────────────────────────────────────────
  const metricas_comparativas = [
    {
      nome: 'CTR Médio',
      valor_atual: `${avgCtr.toFixed(2)}%`,
      valor_anterior: previousRun ? `${Number(previousRun.avg_ctr).toFixed(2)}%` : null,
      variacao_pct: previousRun && previousRun.avg_ctr > 0 ? (((avgCtr - previousRun.avg_ctr) / previousRun.avg_ctr) * 100).toFixed(1) : null,
      benchmark: '1–3%',
      status: avgCtr >= 1 ? 'acima' : avgCtr >= 0.5 ? 'dentro' : 'abaixo',
      interpretacao: avgCtr >= 1 ? 'Bom engajamento do criativo com o público.' : avgCtr >= 0.5 ? 'CTR aceitável, mas há espaço para melhorar criativos.' : 'CTR baixo — o criativo ou segmentação precisa de revisão urgente.'
    },
    {
      nome: 'CPC Médio',
      valor_atual: `${currency} ${avgCpc.toFixed(2)}`,
      valor_anterior: previousRun ? `${currency} ${Number(previousRun.avg_cpc).toFixed(2)}` : null,
      variacao_pct: previousRun && previousRun.avg_cpc > 0 ? (((avgCpc - previousRun.avg_cpc) / previousRun.avg_cpc) * 100).toFixed(1) : null,
      benchmark: `${currency} 1,00 – 4,00`,
      status: avgCpc <= 4 ? 'dentro' : avgCpc <= 8 ? 'abaixo' : 'abaixo',
      interpretacao: avgCpc <= 4 ? 'Custo por clique eficiente.' : avgCpc <= 8 ? 'CPC moderado, monitore.' : 'CPC elevado — revise lances e segmentação.'
    },
    {
      nome: 'CPM Médio',
      valor_atual: `${currency} ${metrics.avgCpm.toFixed(2)}`,
      valor_anterior: previousRun ? `${currency} ${Number(previousRun.avg_cpm).toFixed(2)}` : null,
      variacao_pct: previousRun && previousRun.avg_cpm > 0 ? (((metrics.avgCpm - previousRun.avg_cpm) / previousRun.avg_cpm) * 100).toFixed(1) : null,
      benchmark: `${currency} 10 – 35`,
      status: metrics.avgCpm <= 35 ? 'dentro' : 'abaixo',
      interpretacao: metrics.avgCpm <= 35 ? 'Custo de alcance adequado.' : metrics.avgCpm <= 60 ? 'CPM acima do ideal — audiência competitiva.' : 'CPM muito alto — segmentação pode estar muito restrita.'
    },
    {
      nome: 'Frequência Média',
      valor_atual: `${avgFrequency.toFixed(2)}x`,
      valor_anterior: previousRun ? `${Number(previousRun.avg_frequency).toFixed(2)}x` : null,
      variacao_pct: previousRun && previousRun.avg_frequency > 0 ? (((avgFrequency - previousRun.avg_frequency) / previousRun.avg_frequency) * 100).toFixed(1) : null,
      benchmark: '1,5 – 3,0x',
      status: avgFrequency <= 3 ? 'dentro' : 'abaixo',
      interpretacao: avgFrequency <= 1.5 ? 'Frequência baixa — público amplo ou verba reduzida.' : avgFrequency <= 3 ? 'Frequência ideal.' : avgFrequency <= 5 ? 'Frequência alta — risco de saturação do público.' : 'Frequência crítica — público saturado, troque criativo ou expanda audiência.'
    }
  ];

  // ── Análise por campanha ──────────────────────────────────────────────────
  const campanhas_analise = campaigns
    .filter(c => c.impressions > 0 || c.status === 'ACTIVE')
    .map(c => {
      let campScore = 100;
      let problema = '';
      let acao = '';

      if (c.frequency > 5)      { campScore -= 30; problema = 'Frequência crítica — público esgotado'; acao = 'Pause esta campanha e crie um novo conjunto de anúncios com público diferente ou lookalike.'; }
      else if (c.frequency > 3.5) { campScore -= 15; problema = 'Frequência elevada — início de saturação'; acao = 'Expanda o público ou adicione novos criativos para a campanha.'; }

      if (c.ctr < 0.3 && c.impressions > 1000) { campScore -= 25; problema = problema || 'CTR muito baixo'; acao = acao || 'Teste novos criativos — imagens diferentes, copy mais direto ou oferta mais clara.'; }
      else if (c.ctr < 0.8 && c.impressions > 1000) { campScore -= 10; problema = problema || 'CTR abaixo do benchmark'; acao = acao || 'Teste variações do criativo — headline e imagem principais.'; }

      if (c.cpc > 10) { campScore -= 20; problema = problema || 'CPC muito alto'; acao = acao || 'Reduza o lance máximo ou mude para estratégia de lance automático.'; }

      if (c.status === 'PAUSED' && c.spend > 0) { problema = problema || 'Campanha pausada com histórico de gasto'; acao = acao || 'Avalie se vale reativar com orçamento ajustado.'; }

      if (!problema) { problema = 'Sem problemas críticos identificados'; acao = 'Monitore as métricas e teste novos criativos para escalar.'; }

      campScore = Math.max(0, campScore);
      let status_performance = campScore >= 80 ? 'Excelente' : campScore >= 60 ? 'Bom' : campScore >= 40 ? 'Atenção' : 'Crítico';

      return {
        nome: c.name,
        status_performance,
        gasto: `${currency} ${c.spend.toFixed(2)}`,
        ctr: `${c.ctr.toFixed(2)}%`,
        cpc: `${currency} ${c.cpc.toFixed(2)}`,
        frequencia: c.frequency.toFixed(2),
        problema_principal: problema,
        acao_imediata: acao
      };
    });

  // ── Otimizações prioritárias ──────────────────────────────────────────────
  const otimizacoes = [];
  let pri = 1;

  if (avgFrequency > 3.5) {
    otimizacoes.push({
      prioridade: pri++,
      titulo: 'Combater saturação de audiência',
      categoria: 'Audiência',
      impacto_esperado: 'Alto',
      descricao: `Frequência média de ${avgFrequency.toFixed(1)}x indica que o mesmo público está vendo o anúncio repetidas vezes, causando queda no CTR e aumento no CPC.`,
      acao: '1. Acesse o Gerenciador de Anúncios. 2. Nos conjuntos de anúncios afetados, clique em Editar. 3. Em Público, expanda a faixa etária ou interesses. 4. Ou crie um Público Semelhante (Lookalike) baseado nos compradores/leads existentes. 5. Salve e monitore a frequência por 5 dias.',
      prazo: 'Imediato'
    });
  }

  if (avgCtr < 0.8 && totalImpressions > 5000) {
    otimizacoes.push({
      prioridade: pri++,
      titulo: 'Melhorar CTR com novos criativos',
      categoria: 'Criativo',
      impacto_esperado: 'Alto',
      descricao: `CTR médio de ${avgCtr.toFixed(2)}% está abaixo do benchmark de 1%. Isso significa que o criativo atual não está chamando atenção suficiente no feed.`,
      acao: '1. Crie pelo menos 3 variações de imagem/vídeo para a campanha principal. 2. Teste headlines diferentes — uma com pergunta, uma com número, uma com benefício direto. 3. Ative o Teste A/B nativo do Meta para medir qual performa melhor. 4. Após 7 dias, pause os criativos com CTR mais baixo.',
      prazo: 'Esta semana'
    });
  }

  if (avgCpc > 6) {
    otimizacoes.push({
      prioridade: pri++,
      titulo: 'Reduzir custo por clique',
      categoria: 'Lance',
      impacto_esperado: 'Alto',
      descricao: `CPC médio de ${currency} ${avgCpc.toFixed(2)} está acima do ideal. Pode ser causado por lances muito altos ou segmentação muito específica aumentando a competição.`,
      acao: '1. Nos conjuntos com CPC alto, mude a estratégia de lance para "Menor custo" (automático). 2. Se já estiver automático, amplie o público removendo restrições de interesse desnecessárias. 3. Ative a opção "Expansão de público detalhado" nas configurações do conjunto.',
      prazo: 'Esta semana'
    });
  }

  if (campaigns.filter(c => c.status === 'ACTIVE').length === 0 && campaigns.length > 0) {
    otimizacoes.push({
      prioridade: pri++,
      titulo: 'Reativar campanhas ou criar novas',
      categoria: 'Estrutura',
      impacto_esperado: 'Alto',
      descricao: 'Nenhuma campanha está ativa no período analisado. A conta está sem veicular anúncios.',
      acao: '1. Acesse o Gerenciador de Anúncios. 2. Revise as campanhas pausadas e identifique as que tiveram melhor histórico. 3. Ajuste o orçamento e reative. 4. Se necessário, crie uma nova campanha do zero com objetivo de Conversão ou Tráfego.',
      prazo: 'Imediato'
    });
  }

  if (avgCpm > 40) {
    otimizacoes.push({
      prioridade: pri++,
      titulo: 'Reduzir CPM com ajustes de segmentação',
      categoria: 'Segmentação',
      impacto_esperado: 'Médio',
      descricao: `CPM de ${currency} ${metrics.avgCpm.toFixed(2)} indica alta competição no leilão. O público pode estar muito restrito ou em horário/posicionamento caro.`,
      acao: '1. No Gerenciador de Anúncios, vá em Conjunto de Anúncios > Editar. 2. Em Posicionamentos, mude de "Manual" para "Advantage+ Placements" (automático). 3. Revise a faixa etária e amplie se possível. 4. Evite segmentar interesses muito específicos — prefira públicos de 500 mil+ pessoas.',
      prazo: 'Esta semana'
    });
  }

  // Sempre adicionar otimização de retargeting como oportunidade base
  otimizacoes.push({
    prioridade: pri++,
    titulo: 'Estruturar campanha de retargeting',
    categoria: 'Estrutura',
    impacto_esperado: 'Alto',
    descricao: 'Pessoas que já visitaram seu site ou interagiram com seus anúncios convertem em média 3x mais. Se não há campanha de retargeting ativa, este é um gap importante.',
    acao: '1. No Gerenciador de Anúncios, vá em Públicos > Criar Público > Público Personalizado. 2. Selecione "Site" como fonte e configure para visitantes dos últimos 30 dias. 3. Crie uma campanha separada segmentando apenas esse público. 4. Use criativos com prova social (depoimentos, avaliações) ou oferta especial.',
    prazo: 'Este mês'
  });

  otimizacoes.push({
    prioridade: pri++,
    titulo: 'Ativar testes A/B sistemáticos',
    categoria: 'Criativo',
    impacto_esperado: 'Médio',
    descricao: 'Sem testes A/B contínuos, é impossível saber o que realmente funciona. A Meta oferece ferramenta nativa de teste sem custo adicional.',
    acao: '1. No Gerenciador de Anúncios, clique em "Teste A/B" no menu superior. 2. Escolha a variável a testar: criativo, público ou posicionamento. 3. Configure o orçamento dividido igualmente. 4. Duração mínima de 7 dias para resultado estatisticamente válido. 5. Pause o perdedor e escale o vencedor.',
    prazo: 'Este mês'
  });

  // ── Alertas críticos ──────────────────────────────────────────────────────
  const alertas = [];

  if (avgFrequency > 5) {
    alertas.push({
      tipo: 'Saturação',
      severidade: 'Alta',
      mensagem: `Frequência média de ${avgFrequency.toFixed(1)}x — público completamente saturado. Performance vai cair rapidamente.`,
      acao_requerida: 'Pause os conjuntos com frequência mais alta hoje mesmo e troque o público.'
    });
  }

  if (totalSpend === 0) {
    alertas.push({
      tipo: 'Orçamento',
      severidade: 'Alta',
      mensagem: 'Nenhum investimento registrado no período selecionado.',
      acao_requerida: 'Verifique se há campanhas ativas e se o método de pagamento está em dia.'
    });
  }

  if (activeCampaigns === 0 && totalCampaigns > 0) {
    alertas.push({
      tipo: 'Performance',
      severidade: 'Alta',
      mensagem: 'Todas as campanhas estão pausadas — conta sem veiculação.',
      acao_requerida: 'Reative as campanhas de melhor histórico ou crie novas.'
    });
  }

  if (avgCtr < 0.3 && totalImpressions > 10000) {
    alertas.push({
      tipo: 'Performance',
      severidade: 'Alta',
      mensagem: `CTR de ${avgCtr.toFixed(2)}% com ${(metrics.totalImpressions/1000).toFixed(0)}K impressões — criativo não está engajando.`,
      acao_requerida: 'Troque os criativos principais com urgência.'
    });
  }

  if (avgCpc > 15) {
    alertas.push({
      tipo: 'Orçamento',
      severidade: 'Alta',
      mensagem: `CPC de ${currency} ${avgCpc.toFixed(2)} — cada clique está custando muito acima do normal.`,
      acao_requerida: 'Revise a estratégia de lances e segmentação imediatamente.'
    });
  }

  // ── Insights históricos ───────────────────────────────────────────────────
  const insights_historicos = [];

  if (previousRun) {
    const ctrAnterior = Number(previousRun.avg_ctr);
    const cpcAnterior = Number(previousRun.avg_cpc);
    const freqAnterior = Number(previousRun.avg_frequency);

    if (Math.abs(avgCtr - ctrAnterior) > 0.1) {
      const dir = avgCtr > ctrAnterior ? 'subiu' : 'caiu';
      const diff = Math.abs(avgCtr - ctrAnterior).toFixed(2);
      insights_historicos.push({
        titulo: `CTR ${dir} ${diff} pontos percentuais`,
        observacao: `CTR foi de ${ctrAnterior.toFixed(2)}% para ${avgCtr.toFixed(2)}% — variação de ${(((avgCtr - ctrAnterior) / (ctrAnterior || 1)) * 100).toFixed(0)}%.`,
        implicacao: avgCtr > ctrAnterior ? 'Os criativos ou público estão mais alinhados. Continue com a estratégia atual.' : 'Possível saturação de criativo ou público. Revise e teste novas peças.'
      });
    }

    if (Math.abs(avgCpc - cpcAnterior) > 0.5) {
      const dir = avgCpc > cpcAnterior ? 'aumentou' : 'diminuiu';
      insights_historicos.push({
        titulo: `CPC ${dir} desde a última análise`,
        observacao: `CPC foi de ${currency} ${cpcAnterior.toFixed(2)} para ${currency} ${avgCpc.toFixed(2)}.`,
        implicacao: avgCpc < cpcAnterior ? 'Otimizações de lance ou segmentação surtiram efeito.' : 'Aumento de competição no leilão ou queda de relevância do anúncio.'
      });
    }

    if (freqAnterior > 0 && Math.abs(avgFrequency - freqAnterior) > 0.3) {
      const dir = avgFrequency > freqAnterior ? 'cresceu' : 'diminuiu';
      insights_historicos.push({
        titulo: `Frequência ${dir}`,
        observacao: `Frequência foi de ${freqAnterior.toFixed(1)}x para ${avgFrequency.toFixed(1)}x.`,
        implicacao: avgFrequency > freqAnterior ? 'O público está vendo mais vezes — monitore CTR para detectar saturação.' : 'Frequência controlada — público mais fresco.'
      });
    }

    if (insights_historicos.length === 0) {
      insights_historicos.push({
        titulo: 'Conta estável em relação à análise anterior',
        observacao: `Métricas principais sem variação significativa desde ${new Date(previousRun.created_at).toLocaleDateString('pt-BR')}.`,
        implicacao: 'Estabilidade pode ser positiva. Se os resultados são bons, mantenha. Se são ruins, é hora de testar algo novo.'
      });
    }
  } else {
    insights_historicos.push({
      titulo: 'Primeira análise registrada',
      observacao: 'Não há dados históricos anteriores para comparação.',
      implicacao: 'A partir desta análise, o sistema vai registrar a evolução da conta. Execute análises regularmente para obter comparativos.'
    });
  }

  // ── Oportunidades ─────────────────────────────────────────────────────────
  const oportunidades = [
    {
      titulo: 'Público Lookalike dos melhores clientes',
      descricao: 'Se você tem uma lista de clientes ou compradores, criar um Lookalike 1-3% é uma das ações com maior retorno possível no Meta.',
      potencial_impacto: 'Pode reduzir o CPC em até 40% e aumentar a taxa de conversão vs público frio.',
      como_implementar: 'Gerenciador > Públicos > Criar Público > Público Semelhante > Suba uma lista de emails de clientes como fonte.'
    },
    {
      titulo: 'Anúncios em vídeo curto (Reels)',
      descricao: 'O inventário de Reels tem CPM historicamente mais baixo que o feed tradicional, com alcance maior.',
      potencial_impacto: 'CPM até 30% menor com alcance orgânico adicional para quem assistir ao vídeo completo.',
      como_implementar: 'Crie um vídeo de 15-30 segundos em formato vertical 9:16 e selecione o posicionamento Reels manualmente no conjunto de anúncios.'
    },
    {
      titulo: 'Campanha de engajamento para aquecer público',
      descricao: 'Antes de pedir conversão, uma campanha de engajamento barata cria um público quente que converte muito mais.',
      potencial_impacto: 'Público que engajou converte em média 2-4x mais que público frio com custo 50-70% menor.',
      como_implementar: 'Crie uma campanha com objetivo Engajamento, orçamento baixo (R$15-30/dia), e use o público engajado como fonte de retargeting na campanha de conversão.'
    }
  ];

  // ── Plano de ação 30 dias ─────────────────────────────────────────────────
  const plano_acao_30dias = [
    {
      semana: 1,
      foco: 'Resolver problemas críticos',
      acoes: [
        avgFrequency > 3.5 ? 'Expandir público ou trocar criativo nas campanhas com frequência alta' : 'Auditar segmentação de todas as campanhas ativas',
        avgCtr < 0.8 ? 'Criar 3 variações de criativo para teste nos anúncios com CTR baixo' : 'Documentar os criativos que estão performando bem',
        'Verificar método de pagamento e limites de gasto da conta',
        'Configurar pixel do Meta no site se ainda não estiver instalado'
      ]
    },
    {
      semana: 2,
      foco: 'Otimização de lances e públicos',
      acoes: [
        'Revisar estratégia de lance em todos os conjuntos — preferir automático',
        'Criar público Lookalike baseado em compradores ou leads',
        'Ativar Advantage+ Placements nos conjuntos que ainda usam posicionamento manual',
        avgCpc > 5 ? 'Testar redução de 20% no orçamento nos conjuntos com CPC mais alto' : 'Testar aumento de verba nos conjuntos com melhor CTR'
      ]
    },
    {
      semana: 3,
      foco: 'Testes A/B e novos criativos',
      acoes: [
        'Iniciar teste A/B formal entre os 2 melhores criativos',
        'Criar campanha de retargeting para visitantes do site (últimos 30 dias)',
        'Testar anúncio em formato vídeo/Reels se ainda não tiver',
        'Pausar os anúncios com menor CTR após 7+ dias de veiculação'
      ]
    },
    {
      semana: 4,
      foco: 'Escala e análise de resultados',
      acoes: [
        'Aumentar verba em 20% nos conjuntos vencedores do teste A/B',
        'Pausar definitivamente os anúncios com performance abaixo da média',
        'Analisar relatório de posicionamento e desativar os menos eficientes',
        'Executar nova análise completa e comparar com esta para medir evolução'
      ]
    }
  ];

  // ── Próximos passos ───────────────────────────────────────────────────────
  const proximos_passos = [
    otimizacoes[0] ? `${otimizacoes[0].prazo === 'Imediato' ? 'AGORA' : 'Esta semana'}: ${otimizacoes[0].titulo}` : 'Revisar campanhas ativas',
    avgFrequency > 3 ? 'Expandir ou trocar público das campanhas com frequência alta' : 'Testar novo criativo para melhorar CTR',
    'Configurar campanha de retargeting se não existir',
    'Criar Lookalike Audience baseado nos melhores clientes',
    'Executar nova análise em 7 dias para acompanhar a evolução'
  ];

  return {
    resumo_geral: {
      score_saude: score,
      nivel_saude,
      variacao_score,
      tendencia,
      pontos_principais,
      resumo_historico
    },
    metricas_comparativas,
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

async function sendBudgetAlertEmail({ toEmail, accountName, remainingBudget, threshold, currency }) {
  const transporter = createMailTransporter();
  const currSymbol = currency === 'BRL' ? 'R$' : currency === 'USD' ? '$' : currency;

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#08090d;color:#e8eaf0;border-radius:12px;overflow:hidden">
    <div style="background:#1877F2;padding:24px 32px">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px">⚡ Meta Ads Analyzer</div>
      <div style="font-size:13px;opacity:0.8;margin-top:4px">Alerta de Orçamento</div>
    </div>
    <div style="padding:32px">
      <div style="background:#161923;border:1px solid #1e2433;border-radius:10px;padding:20px;margin-bottom:24px">
        <div style="font-size:13px;color:#8892a4;margin-bottom:6px">CONTA DE ANÚNCIOS</div>
        <div style="font-size:18px;font-weight:700">${accountName}</div>
      </div>
      <div style="background:rgba(255,152,0,0.1);border:1px solid rgba(255,152,0,0.3);border-radius:10px;padding:20px;margin-bottom:24px">
        <div style="font-size:13px;color:#ff9800;font-weight:700;margin-bottom:10px">⚠️ ORÇAMENTO BAIXO</div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:13px;color:#8892a4">Saldo restante</div>
            <div style="font-size:32px;font-weight:800;color:#ff9800">${currSymbol} ${parseFloat(remainingBudget).toFixed(2)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;color:#8892a4">Limite de alerta</div>
            <div style="font-size:20px;font-weight:700;color:#8892a4">${currSymbol} ${parseFloat(threshold).toFixed(2)}</div>
          </div>
        </div>
      </div>
      <div style="background:#161923;border-radius:10px;padding:20px;margin-bottom:24px">
        <div style="font-size:13px;font-weight:700;margin-bottom:12px">O que fazer agora:</div>
        <div style="font-size:13px;color:#8892a4;line-height:1.8">
          1. Acesse o <strong style="color:#e8eaf0">Gerenciador de Anúncios</strong> do Facebook<br>
          2. Vá em <strong style="color:#e8eaf0">Configurações da conta</strong> → <strong style="color:#e8eaf0">Faturamento</strong><br>
          3. Adicione crédito ou verifique o método de pagamento<br>
          4. Sem ação, seus anúncios podem ser pausados automaticamente pelo Meta
        </div>
      </div>
      <a href="https://www.facebook.com/adsmanager" style="display:block;text-align:center;background:#1877F2;color:#fff;padding:14px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">
        Acessar Gerenciador de Anúncios →
      </a>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #1e2433;font-size:11px;color:#3d4456;text-align:center">
      Alerta enviado por Meta Ads Analyzer • Para desativar acesse o dashboard
    </div>
  </div>`;

  await transporter.sendMail({
    from: `"Meta Ads Analyzer" <${process.env.ALERT_EMAIL_USER}>`,
    to: toEmail,
    subject: `⚠️ Orçamento baixo: ${accountName} — ${currSymbol} ${parseFloat(remainingBudget).toFixed(2)} restantes`,
    html
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

    // Envia email de confirmação
    try {
      const currSymbol = currency === 'BRL' ? 'R$' : '$';
      const transporter = createMailTransporter();
      await transporter.sendMail({
        from: `"Meta Ads Analyzer" <${process.env.ALERT_EMAIL_USER}>`,
        to: email,
        subject: '✅ Alerta de orçamento ativado — Meta Ads Analyzer',
        html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#08090d;color:#e8eaf0;border-radius:12px">
          <h2 style="color:#00e676;margin-top:0">✅ Alerta ativado com sucesso!</h2>
          <p style="color:#8892a4">Você receberá um email neste endereço quando o saldo da conta <strong style="color:#e8eaf0">${accountName}</strong> estiver abaixo de <strong style="color:#ff9800">${currSymbol} ${parseFloat(threshold||100).toFixed(2)}</strong>.</p>
          <p style="color:#3d4456;font-size:12px;margin-top:24px">Para desativar, acesse o Meta Ads Analyzer e clique em "Remover alerta".</p>
        </div>`
      });
    } catch(emailErr) {
      console.warn('Confirmation email failed:', emailErr.message);
    }

    res.json({ success: true, alert });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/alert/:accountId', auth, async (req, res) => {
  try {
    await db.deleteBudgetAlert(req.session.user.id, req.params.accountId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── BACKGROUND JOB: checar saldo a cada 1h ──────────────────────────────────

async function checkBudgetAlerts() {
  try {
    const alerts = await db.getAllActiveAlerts();
    if (!alerts.length) return;

    for (const alert of alerts) {
      try {
        // Buscar saldo da conta via Meta API — precisamos do token do usuário
        // Como não guardamos o token, usamos o amount_spent do último run como proxy
        const lastRun = await db.getLastRun(alert.fb_account_id);
        if (!lastRun) continue;

        // Buscar saldo diretamente da Meta API usando token de sistema (se disponível)
        // Por ora, verifica se o last run tem dados recentes (menos de 2h)
        const runAge = (Date.now() - new Date(lastRun.created_at).getTime()) / 1000 / 60; // minutos
        if (runAge > 120) continue; // só alerta se análise foi feita recentemente

        // O trigger real de alerta vem do endpoint /api/check-budget chamado pelo dashboard
      } catch(err) {
        console.error('Alert check error for', alert.fb_account_id, err.message);
      }
    }
  } catch(err) {
    console.error('checkBudgetAlerts error:', err.message);
  }
}

// Rota chamada pelo dashboard após carregar dados da conta (tem acesso ao token)
app.post('/api/check-budget', auth, async (req, res) => {
  const { accountId, accountName, remainingBudget, currency } = req.body;
  if (!accountId || remainingBudget === undefined) return res.json({ checked: false });

  try {
    const alert = await db.getBudgetAlert(req.session.user.id, accountId);
    if (!alert || !alert.active) return res.json({ checked: true, alerted: false });

    const remaining = parseFloat(remainingBudget);
    const threshold = parseFloat(alert.threshold_amount);

    if (remaining <= threshold) {
      // Checar se já enviou nas últimas 6h
      const lastSent = alert.last_alert_sent;
      const hoursSince = lastSent ? (Date.now() - new Date(lastSent).getTime()) / 1000 / 3600 : 999;

      if (hoursSince >= 6) {
        await sendBudgetAlertEmail({
          toEmail: alert.alert_email,
          accountName: accountName || alert.account_name,
          remainingBudget: remaining,
          threshold,
          currency: currency || alert.currency
        });
        await db.markAlertSent(alert.id);
        console.log(`📧 Budget alert sent for ${accountName} → ${alert.alert_email}`);
        return res.json({ checked: true, alerted: true, sentTo: alert.alert_email });
      }
    }
    res.json({ checked: true, alerted: false, remaining, threshold });
  } catch(e) {
    console.error('check-budget error:', e.message);
    res.json({ checked: false, error: e.message });
  }
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
