/**
 * AI Data Analysis Agent — inspirado em Shubhamsaboo/awesome-llm-apps
 * Integração com OpenAI para análise inteligente de campanhas Meta Ads
 *
 * Uso:
 *   const agent = new AiAnalysisAgent({ apiKey: process.env.OPENAI_API_KEY });
 *   const insights = await agent.analyze(campaignData);
 */

const { OpenAI } = require('openai');

class AiAnalysisAgent {
  constructor({ apiKey, model = 'gpt-4o-mini' } = {}) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  /**
   * Analisa dados de campanhas e retorna insights acionáveis
   * @param {Object} campaignData - Dados brutos de campanhas Meta Ads
   * @returns {Promise<Object>} insights, recomendações e score
   */
  async analyze(campaignData) {
    const systemPrompt = `Você é um especialista em tráfego pago com foco em Meta Ads.
    Analise os dados de campanhas fornecidos e retorne:
    1. Principais insights de performance
    2. Campanhas com melhor e pior ROI
    3. Recomendações de otimização priorizadas
    4. Score geral da conta (0-10)
    Responda em JSON estruturado.`;

    const userPrompt = `Dados das campanhas:\n${JSON.stringify(campaignData, null, 2)}`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content);
  }

  /**
   * Gera recomendações de audiência baseadas em performance histórica
   * @param {Array} historicalData - Histórico de campanhas
   * @returns {Promise<Object>} sugestões de audiência
   */
  async suggestAudiences(historicalData) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'Você é um especialista em audiências do Meta Ads. Analise o histórico e sugira novas audiências e lookalikes com maior potencial de conversão. Responda em JSON.',
        },
        {
          role: 'user',
          content: `Histórico:\n${JSON.stringify(historicalData, null, 2)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content);
  }

  /**
   * Detecta anomalias nos dados de campanhas (gastos, CTR, CPA)
   * @param {Array} metricsTimeSeries - Série temporal de métricas
   * @returns {Promise<Object>} anomalias detectadas e alertas
   */
  async detectAnomalies(metricsTimeSeries) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'Você é um analista de dados. Identifique anomalias, picos e quedas inesperadas nas métricas de campanhas. Responda em JSON com campo "anomalias" e "alertas".',
        },
        {
          role: 'user',
          content: `Métricas:\n${JSON.stringify(metricsTimeSeries, null, 2)}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content);
  }
}

module.exports = { AiAnalysisAgent };
