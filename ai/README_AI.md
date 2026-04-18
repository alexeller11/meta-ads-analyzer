# 🤖 AI Data Analysis Agent — Meta Ads Analyzer

Integração com o projeto [awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps) adaptada para análise inteligente de campanhas Meta Ads.

## O que faz

- **`analyze(campaignData)`** — Analisa dados de campanhas e retorna insights, recomendações priorizadas e score geral da conta
- **`suggestAudiences(historicalData)`** — Sugere novas audiências e lookalikes baseado no histórico de performance
- **`detectAnomalies(metricsTimeSeries)`** — Detecta anomalias em CTR, CPA, gasto e outras métricas

## Configuração

```bash
npm install openai
```

Adicione no `.env`:
```
OPENAI_API_KEY=sk-...
```

## Uso

```js
const { AiAnalysisAgent } = require('./ai/ai_analysis_agent');

const agent = new AiAnalysisAgent({ apiKey: process.env.OPENAI_API_KEY });

// Analisar campanhas
const insights = await agent.analyze(campaignData);
console.log(insights);

// Sugerir audiências
const audiences = await agent.suggestAudiences(historicalData);

// Detectar anomalias
const anomalies = await agent.detectAnomalies(metricsTimeSeries);
```

## Referência

Inspirado no **AI Data Analysis Agent** do repositório [Shubhamsaboo/awesome-llm-apps](https://github.com/Shubhamsaboo/awesome-llm-apps) — #1 GitHub Trending.
