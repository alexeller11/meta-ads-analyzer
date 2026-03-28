# Meta Ads Analyzer - Integration Guide (V2 Features)

## 📋 Overview

Este guia explica como integrar os 3 novos módulos (Auditoria Profunda, Benchmarking, Landing Page Audit) no seu meta-ads-analyzer existente.

## 🚀 Quick Start

### 1. Copiar Novos Módulos

```bash
# Copie os seguintes arquivos para seu repositório:
cp decision-engine-v2.js seu-repo/
cp benchmarks-v2.js seu-repo/
cp landing-page-audit.js seu-repo/
```

### 2. Integrar com Server.js

Abra seu `server.js` e adicione no topo:

```javascript
// Importar novos módulos
const decisionEngineV2 = require("./decision-engine-v2");
const benchmarksV2 = require("./benchmarks-v2");
const landingPageAudit = require("./landing-page-audit");
```

### 3. Adicionar Novas Rotas

Copie todas as rotas do arquivo `server-integration.js` e adicione ao seu `server.js` após as rotas existentes.

### 4. Atualizar Database Schema

Execute as seguintes queries no seu PostgreSQL:

```sql
-- Adicionar tabelas para novos dados
CREATE TABLE IF NOT EXISTS audit_runs (
  id SERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  audit_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS landing_page_audits (
  id SERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  url TEXT NOT NULL,
  campaign_id TEXT,
  audit_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- Criar índices para performance
CREATE INDEX idx_audit_runs_account ON audit_runs(account_id);
CREATE INDEX idx_landing_page_audits_account ON landing_page_audits(account_id);
```

## 📊 Novos Endpoints

### Auditoria Profunda (46+ Checks)

#### GET `/api/audit-summary/:accountId`
Retorna auditoria completa de todas as campanhas

```bash
curl -X GET "http://localhost:3000/api/audit-summary/123456?dateRange=7d" \
  -H "Authorization: Bearer token"
```

**Response:**
```json
{
  "status": "success",
  "audit": {
    "campaigns": [...],
    "summary": {
      "scaleCount": 2,
      "pauseCount": 1,
      "creativeCount": 3,
      "funnelCount": 1,
      "keepCount": 5,
      "noDataCount": 0
    },
    "totalWaste": 500.00,
    "averageScore": 72.5,
    "accountGrade": "B"
  }
}
```

#### GET `/api/campaign-audit/:campaignId`
Auditoria detalhada de uma campanha específica

```bash
curl -X GET "http://localhost:3000/api/campaign-audit/campaign_123" \
  -H "Authorization: Bearer token"
```

#### GET `/api/audit-checks`
Lista de todos os 46+ checks disponíveis

```bash
curl -X GET "http://localhost:3000/api/audit-checks" \
  -H "Authorization: Bearer token"
```

### Benchmarking (20+ Métricas)

#### GET `/api/benchmarks`
Lista de todos os nichos disponíveis

```bash
curl -X GET "http://localhost:3000/api/benchmarks" \
  -H "Authorization: Bearer token"
```

**Response:**
```json
{
  "status": "success",
  "niches": ["Geral", "E-commerce", "Infoprodutos", "Negócios Locais", ...],
  "count": 9
}
```

#### GET `/api/benchmarks/:niche`
Benchmarks para um nicho específico

```bash
curl -X GET "http://localhost:3000/api/benchmarks/saas" \
  -H "Authorization: Bearer token"
```

**Response:**
```json
{
  "status": "success",
  "niche": "SaaS",
  "benchmark": {
    "average_cpc": 2.50,
    "average_ctr": 0.045,
    "average_cvr": 0.035,
    "average_roas": 3.5,
    "typical_cpa": 150.00,
    "recommended_daily_budget": 100,
    "min_budget_for_learning": 50,
    ...
  }
}
```

#### POST `/api/compare-to-benchmark`
Comparar métricas de campanha com benchmark

```bash
curl -X POST "http://localhost:3000/api/compare-to-benchmark" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "niche": "E-commerce",
    "metrics": {
      "roas": 2.8,
      "ctr": 2.5,
      "cvr": 2.0,
      "cpc": 1.20,
      "frequency": 2.0
    }
  }'
```

**Response:**
```json
{
  "status": "success",
  "comparison": {
    "niche": "E-commerce",
    "score": 85,
    "grade": "A",
    "metrics": {
      "roas": {
        "value": 2.8,
        "benchmark": 2.5,
        "ratio": "1.12",
        "status": "above"
      },
      ...
    }
  },
  "recommendations": [...]
}
```

#### POST `/api/benchmark-recommendations`
Obter recomendações baseadas em benchmark

```bash
curl -X POST "http://localhost:3000/api/benchmark-recommendations" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "niche": "E-commerce",
    "metrics": {
      "roas": 1.5,
      "ctr": 1.0,
      "cvr": 0.5,
      "cpc": 2.50,
      "frequency": 4.0
    }
  }'
```

### Landing Page Audit (23 Checks)

#### POST `/api/audit-landing-page`
Auditar uma landing page

```bash
curl -X POST "http://localhost:3000/api/audit-landing-page" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/landing",
    "campaignId": "campaign_123"
  }'
```

**Response:**
```json
{
  "status": "success",
  "url": "https://example.com/landing",
  "audit": {
    "overall_score": 75,
    "grade": "B",
    "total_checks": 23,
    "passed": 17,
    "failed": 6,
    "category_summary": {
      "Performance": {
        "passed": 4,
        "total": 5,
        "percentage": 80
      },
      "Conversion Optimization": {
        "passed": 4,
        "total": 6,
        "percentage": 67
      },
      ...
    },
    "issues": [
      {
        "id": "PERF_01",
        "name": "Mobile LCP",
        "category": "Performance",
        "severity": "high",
        "message": "LCP lento (3200ms > 2500ms) - Impacta conversão",
        "recommendation": "Otimize imagens, use lazy loading, minimize CSS/JS"
      },
      ...
    ],
    "impact_on_conversion": {
      "estimated_cvr_loss": 35,
      "message": "Problemas críticos detectados - Conversão pode estar 40%+ abaixo do potencial"
    }
  },
  "correlation": {
    "landing_page_score": 75,
    "campaign_ctr": 2.5,
    "campaign_cvr": 1.2,
    "campaign_roas": 2.0,
    "analysis": {
      "primary_issue": "Landing page quality is likely the main conversion bottleneck",
      "recommendation": "Fix landing page issues before scaling ad spend"
    }
  }
}
```

#### GET `/api/landing-page-checks`
Lista de todos os 23 checks de landing page

```bash
curl -X GET "http://localhost:3000/api/landing-page-checks" \
  -H "Authorization: Bearer token"
```

#### GET `/api/landing-page-audits/:accountId`
Histórico de auditorias de landing page

```bash
curl -X GET "http://localhost:3000/api/landing-page-audits/account_123?limit=10" \
  -H "Authorization: Bearer token"
```

### Full Analysis (Combinado)

#### POST `/api/full-analysis`
Executar análise completa: campanha + benchmark + landing page

```bash
curl -X POST "http://localhost:3000/api/full-analysis" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "campaignId": "campaign_123",
    "landingPageUrl": "https://example.com/landing",
    "niche": "E-commerce"
  }'
```

**Response:**
```json
{
  "status": "success",
  "campaign_audit": {...},
  "benchmark_comparison": {...},
  "landing_page_audit": {...},
  "recommendations": [
    {
      "source": "campaign_audit",
      "priority": "high",
      "message": "...",
      "action": "..."
    },
    ...
  ]
}
```

## 🎨 Atualizar Dashboard

### Adicionar Novas Abas

No arquivo `public/dashboard.html`, adicione novas seções:

```html
<!-- Adicionar ao sidebar -->
<button class="tab-btn" data-tab="audit-v2">Auditoria V2</button>
<button class="tab-btn" data-tab="benchmarks">Benchmarks</button>
<button class="tab-btn" data-tab="landing-page">Landing Page</button>

<!-- Adicionar conteúdo das abas -->
<div id="audit-v2" class="tab-content">
  <!-- Auditoria V2 content -->
</div>

<div id="benchmarks" class="tab-content">
  <!-- Benchmarks content -->
</div>

<div id="landing-page" class="tab-content">
  <!-- Landing Page content -->
</div>
```

### Atualizar JavaScript

No arquivo `public/scripts/dashboard.js`, adicione:

```javascript
// Carregar auditoria V2
async function loadAuditV2(accountId) {
  const response = await api(`/api/audit-summary/${accountId}`);
  if (response.audit) {
    renderAuditV2(response.audit);
  }
}

// Carregar benchmarks
async function loadBenchmarks(niche, metrics) {
  const response = await api(`/api/compare-to-benchmark`, {
    method: "POST",
    body: JSON.stringify({ niche, metrics })
  });
  if (response.comparison) {
    renderBenchmarks(response.comparison);
  }
}

// Carregar landing page audit
async function loadLandingPageAudit(url, campaignId) {
  const response = await api(`/api/audit-landing-page`, {
    method: "POST",
    body: JSON.stringify({ url, campaignId })
  });
  if (response.audit) {
    renderLandingPageAudit(response.audit);
  }
}
```

## 🚀 Deploy no Railway

### 1. Fazer Push do Código

```bash
git add decision-engine-v2.js benchmarks-v2.js landing-page-audit.js
git add server-integration.js INTEGRATION_GUIDE.md
git commit -m "Add V2 features: 46+ audit checks, benchmarking, landing page audit"
git push origin main
```

### 2. Railway Detecta Mudanças

Railway automaticamente:
- Detecta o push
- Inicia novo build
- Executa `npm install` (se houver novas dependências)
- Redeploy automático

### 3. Verificar Deploy

```bash
# Testar novo endpoint
curl -X GET "https://seu-app.railway.app/api/audit-checks" \
  -H "Authorization: Bearer seu-token"
```

## 📦 Dependências

Nenhuma dependência nova é necessária! Os módulos usam apenas:
- `axios` (já instalado)
- JavaScript nativo

## 🧪 Testes Locais

### 1. Instalar Dependências

```bash
npm install
```

### 2. Iniciar Servidor

```bash
npm start
```

### 3. Testar Endpoints

```bash
# Terminal 1: Servidor rodando
npm start

# Terminal 2: Testar endpoints
curl -X GET "http://localhost:3000/api/benchmarks"
curl -X GET "http://localhost:3000/api/audit-checks"
curl -X GET "http://localhost:3000/api/landing-page-checks"
```

## 🔄 Backward Compatibility

Todos os novos módulos mantêm compatibilidade com código existente:

- ✅ `decision-engine.js` continua funcionando
- ✅ `benchmarks.js` continua funcionando
- ✅ Novas rotas não afetam rotas existentes
- ✅ Dashboard existente continua funcionando

## 📝 Próximos Passos

1. **Integrar com Playwright** - Análise real de landing pages (não mock)
2. **Adicionar Machine Learning** - Prever performance antes de lançar
3. **Integração com Google Ads** - Multi-plataforma
4. **Webhooks** - Alertas em tempo real

## 💡 Dicas

- Use `/api/audit-checks` para listar todos os checks disponíveis
- Use `/api/benchmarks` para listar todos os nichos
- Use `/api/full-analysis` para análise completa em uma chamada
- Salve resultados no banco para histórico e comparação temporal

## 🆘 Troubleshooting

### Erro: "Cannot find module 'decision-engine-v2'"

**Solução:** Certifique-se que os arquivos estão no mesmo diretório que `server.js`

### Erro: "Database table not found"

**Solução:** Execute as queries SQL de schema no seu banco de dados

### Erro: "Unauthorized"

**Solução:** Adicione o header `Authorization: Bearer token` em todas as requisições

---

**Versão:** 2.0.0  
**Data:** 2026-03-28  
**Compatibilidade:** Node.js 18+, PostgreSQL 12+
