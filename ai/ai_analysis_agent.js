/**
 * AI Data Analysis Agent — Meta Ads Analyzer
 * Insights, sugestão de audiências, detecção de anomalias
 * Integração com OpenAI (gpt-4o-mini por padrão)
 */

const { OpenAI } = require('openai');

// Cache simples em memória para evitar chamadas repetidas
const _cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { _cache.delete(key); return null; }
  return entry.data;
}
function cacheSet(key, data) {
  _cache.set(key, { data, ts: Date.now() });
}

class AiAnalysisAgent {
  constructor({ apiKey, model = 'gpt-4o-mini', baseURL = null } = {}) {
    if (!apiKey) {
      console.warn('⚠️ AiAnalysisAgent: API Key não configurada. Respostas serão mock.');
      this.mock = true;
    } else {
      const config = { apiKey };
      if (baseURL) config.baseURL = baseURL;
      this.client = new OpenAI(config);
      this.mock = false;
    }
    this.model = model;
  }

  // ─── Utilitário interno ───────────────────────────────────────────────────
  async _chat(messages, cacheKey = null) {
    if (cacheKey) {
      const cached = cacheGet(cacheKey);
      if (cached) return cached;
    }

    if (this.mock) return this._mockResponse();

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 2000,
      });
      const result = JSON.parse(response.choices[0].message.content);
      if (cacheKey) cacheSet(cacheKey, result);
      return result;
    } catch (err) {
      console.error('❌ AiAnalysisAgent erro OpenAI:', err.message);
      throw new Error(`Falha na análise IA: ${err.message}`);
    }
  }

  _mockResponse() {
    return {
      mock: true,
      mensagem: 'OPENAI_API_KEY não configurada. Configure a variável de ambiente para análises reais.',
      insights: [],
      recomendacoes: [],
      score: null
    };
  }

  // ─── 1. Análise completa de campanhas ─────────────────────────────────────
  /**
   * Analisa campanhas + métricas do dashboard e retorna insights acionáveis
   * @param {Object} payload - { campaigns, dashboardMetrics, dateRange, accountName }
   */
  async analyze({ campaigns = [], dashboardMetrics = {}, dateRange = '', accountName = '' } = {}) {
    const cacheKey = `analyze_${accountName}_${dateRange}_${campaigns.length}`;

    const systemPrompt = `Você é um especialista sênior em tráfego pago com foco em Meta Ads.
Analise os dados de campanhas e métricas do dashboard e retorne um JSON com EXATAMENTE esta estrutura:
{
  "resumo_executivo": "string com 2-3 frases resumindo a situação da conta",
  "score_conta": number (0-10),
  "nivel_saude": "Excelente|Bom|Regular|Crítico",
  "insights": [
    { "tipo": "positivo|negativo|neutro", "titulo": "string", "descricao": "string", "impacto": "alto|medio|baixo" }
  ],
  "campanhas_destaque": {
    "melhor_roas": { "nome": "string", "roas": number, "motivo": "string" },
    "pior_desempenho": { "nome": "string", "problema": "string", "acao": "string" },
    "escalar": ["string"],
    "pausar": ["string"]
  },
  "metricas_criticas": [
    { "metrica": "string", "valor_atual": "string", "benchmark": "string", "status": "ok|atencao|critico", "acao": "string" }
  ],
  "recomendacoes": [
    { "prioridade": 1, "titulo": "string", "descricao": "string", "impacto_esperado": "string" }
  ],
  "proximos_passos": ["string"]
}`;

    const userContent = JSON.stringify({
      conta: accountName,
      periodo: dateRange,
      metricas_dashboard: dashboardMetrics,
      campanhas: campaigns.map(c => ({
        id: c.id,
        nome: c.name || c.campaign_name,
        status: c.status,
        gasto: c.spend,
        impressoes: c.impressions,
        cliques: c.clicks,
        ctr: c.ctr,
        cpc: c.cpc,
        cpm: c.cpm,
        frequencia: c.frequency,
        roas: c.roas,
        compras: c.purchases,
        mensagens: c.messages,
        leads: c.leads,
        receita: c.revenue
      }))
    }, null, 2);

    return this._chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Dados para análise:\n${userContent}` }
    ], cacheKey);
  }

  // ─── 2. Sugestão de Audiências ─────────────────────────────────────────────
  /**
   * Sugere audiências baseadas em histórico de campanhas
   * @param {Array} historicalData - runs de análise anteriores
   */
  async suggestAudiences(historicalData = []) {
    if (!historicalData.length) return { audiencias: [], mensagem: 'Sem histórico suficiente para sugestões.' };

    const cacheKey = `audiences_${historicalData.length}_${historicalData[0]?.fb_account_id || ''}`;

    const systemPrompt = `Você é especialista em audiências do Meta Ads.
Com base no histórico de performance, sugira audiências e estratégias. Retorne JSON:
{
  "audiencias_recomendadas": [
    {
      "tipo": "Lookalike|Custom|Interesse|Comportamento",
      "descricao": "string",
      "base": "string",
      "potencial_conversao": "alto|medio|baixo",
      "justificativa": "string"
    }
  ],
  "segmentos_excluir": ["string"],
  "estrategia_retargeting": "string",
  "proxima_acao": "string"
}`;

    return this._chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Histórico (últimos ${historicalData.length} períodos):\n${JSON.stringify(historicalData.slice(0, 10), null, 2)}` }
    ], cacheKey);
  }

  // ─── 3. Detecção de Anomalias ─────────────────────────────────────────────
  /**
   * Detecta anomalias comparando métricas atuais com histórico
   * @param {Object} current - métricas atuais
   * @param {Array} history - histórico de runs
   */
  async detectAnomalies(current = {}, history = []) {
    // Detecção estatística simples (sem IA) para resposta rápida
    const statistical = this._statisticalAnomalies(current, history);

    // Se não há IA configurada, retorna apenas detecção estatística
    if (this.mock) return { ...statistical, ai_insights: null };

    const cacheKey = `anomalies_${current.fb_account_id}_${current.created_at || Date.now()}`;

    const systemPrompt = `Você é analista de dados de tráfego pago.
Identifique anomalias, picos e quedas nas métricas. Retorne JSON:
{
  "anomalias": [
    { "metrica": "string", "valor_atual": number, "valor_esperado": number, "variacao_pct": number, "severidade": "critica|alta|media|baixa", "possivel_causa": "string", "acao_recomendada": "string" }
  ],
  "alertas": ["string"],
  "status_geral": "normal|atencao|critico",
  "resumo": "string"
}`;

    const aiResult = await this._chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Métricas atuais:\n${JSON.stringify(current)}\n\nHistórico recente (últimos ${history.length} períodos):\n${JSON.stringify(history.slice(0, 15), null, 2)}` }
    ], cacheKey);

    return { ...statistical, ai_insights: aiResult };
  }

  // ─── 4. Análise para Central de Decisões ─────────────────────────────────
  /**
   * Gera dados enriquecidos para exibir na Central de Decisões do dashboard
   * Inclui métricas do dashboard + decisões prioritárias
   */
  async decisionCenterAnalysis({ campaigns = [], metrics = {}, history = [] } = {}) {
    const cacheKey = `decision_${metrics.fb_account_id || ''}_${campaigns.length}`;

    const systemPrompt = `Você é um consultor de performance em Meta Ads.
Gere uma análise focada em DECISÕES IMEDIATAS. Retorne JSON:
{
  "decisoes_urgentes": [
    { "campanha": "string", "acao": "pausar|escalar|otimizar|testar", "motivo": "string", "impacto_financeiro": "string" }
  ],
  "oportunidades": [
    { "titulo": "string", "descricao": "string", "roi_esperado": "string", "dificuldade": "facil|medio|complexo" }
  ],
  "orcamento": {
    "redistribuicao": "string",
    "campanhas_aumentar": ["string"],
    "campanhas_reduzir": ["string"]
  },
  "metricas_foco": [
    { "nome": "string", "valor": "string", "tendencia": "subindo|estavel|caindo", "acao": "string" }
  ],
  "resumo_executivo": "string"
}`;

    return this._chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Métricas dashboard:\n${JSON.stringify(metrics)}\n\nCampanhas:\n${JSON.stringify(campaigns.slice(0, 20))}\n\nHistórico (${history.length} registros disponíveis)` }
    ], cacheKey);
  }

  // ─── 5. Detecção estatística (sem IA) ────────────────────────────────────
  _statisticalAnomalies(current, history) {
    if (!history.length || !current) return { anomalias_estatisticas: [], status_estatistico: 'sem_dados' };

    const metrics = ['total_spend', 'avg_ctr', 'avg_cpc', 'roas', 'avg_cpm', 'total_clicks'];
    const anomalias = [];

    for (const metric of metrics) {
      const values = history.map(h => parseFloat(h[metric] || 0)).filter(v => v > 0);
      if (values.length < 3) continue;

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const std = Math.sqrt(values.map(v => Math.pow(v - mean, 2)).reduce((a, b) => a + b, 0) / values.length);
      const current_val = parseFloat(current[metric] || 0);
      const z = std > 0 ? Math.abs(current_val - mean) / std : 0;

      if (z > 2) {
        const variacao = mean > 0 ? ((current_val - mean) / mean * 100).toFixed(1) : 0;
        anomalias.push({
          metrica: metric,
          valor_atual: current_val,
          media_historica: parseFloat(mean.toFixed(4)),
          variacao_pct: parseFloat(variacao),
          z_score: parseFloat(z.toFixed(2)),
          severidade: z > 3 ? 'critica' : 'alta'
        });
      }
    }

    return {
      anomalias_estatisticas: anomalias,
      status_estatistico: anomalias.some(a => a.severidade === 'critica') ? 'critico' : anomalias.length > 0 ? 'atencao' : 'normal'
    };
  }

  // ─── 6. Limpar cache ─────────────────────────────────────────────────────
  clearCache() {
    _cache.clear();
    console.log('🗑️ Cache AI limpo.');
  }
}

// Singleton para reutilizar em todo o servidor
let _instance = null;
function getAgent() {
  if (!_instance) {
    const apiKey = process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY;
    const baseURL = process.env.NVIDIA_API_KEY ? 'https://integrate.api.nvidia.com/v1' : null;
    const model = process.env.AI_MODEL || (process.env.NVIDIA_API_KEY ? 'meta/llama-3.1-405b-instruct' : 'gpt-4o-mini');
    
    _instance = new AiAnalysisAgent({ 
      apiKey, 
      model,
      baseURL
    });
  }
  return _instance;
}

module.exports = { AiAnalysisAgent, getAgent };
