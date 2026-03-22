# Meta Ads Analyzer - Análise de Estado Atual

## Resumo da Sessão Anterior

A sessão anterior focou em:
1. Ler a função `analyzeCampaignFull` no dashboard para entender como está implementada
2. Adicionar função de recomendações Andromeda ao dashboard
3. Atualizar a função `analyzeCampaignFull` para incluir as recomendações Andromeda
4. Fazer commit das alterações no dashboard

## Estado Atual do Projeto

### Arquitetura
- **Frontend**: HTML/CSS/JavaScript estático em `/public/dashboard.html`
- **Backend**: Express.js em `server.js` com rotas REST
- **Persistência**: PostgreSQL (opcional) via `db.js`
- **IA**: OpenAI GPT (opcional) para análises avançadas

### Funcionalidades Implementadas

#### 1. Dashboard Principal (`public/dashboard.html`)
- ✅ Seleção de contas Meta Ads
- ✅ Filtro de datas (últimos 7/30 dias, mês, personalizado)
- ✅ Abas: Visão Geral, Insights IA, Campanhas, Criativos, Breakdown, Tendências, Notas, Alertas
- ✅ Análise por campanha com funil completo
- ✅ Recomendações Andromeda (função `generateAndromedaRecommendations`)
- ✅ Gráficos com Chart.js
- ✅ Modal para análises detalhadas

#### 2. Backend (`server.js`)
- ✅ Autenticação OAuth Facebook
- ✅ Endpoints para contas, campanhas, insights, criativos
- ✅ Motor de análise IA (`runAnalysisEngine`)
- ✅ Análise por campanha (`/api/gpt-campaign`)
- ✅ Breakdown por dispositivo, plataforma, posição, gênero, idade, região
- ✅ Tendências (se DB configurado)
- ✅ Alertas de saldo baixo

#### 3. Recomendações Andromeda (`generateAndromedaRecommendations`)
- ✅ Análise de ROAS (crítico, moderado, excelente)
- ✅ Análise de CTR (muito baixo, abaixo da média)
- ✅ Análise de Frequência (fadiga, elevada)
- ✅ Análise de CPA (alto)
- ✅ Princípios Andromeda (Escala > Segmentação, Dados > Criatividade, etc.)

## Problemas Identificados

### 1. Precisão dos Dados
- A função `getMetrics` em `server.js` pode estar contando ações duplicadas
- Não há validação de dados nulos ou inválidos
- A conversão de valores de ações pode ter imprecisões

### 2. UX/UI
- Falta responsividade para mobile
- Falta dark mode toggle
- Falta feedback visual em operações assíncronas
- Falta validação de entrada do utilizador

### 3. Performance
- Sem cache de dados
- Sem paginação em tabelas grandes
- Sem lazy loading de imagens
- Sem compressão de respostas

### 4. Integrações
- Falta exportação de dados (CSV, PDF)
- Falta integração com Google Sheets
- Falta integração com Slack/email para alertas

## Próximos Passos

### Fase 2: Corrigir Precisão dos Dados
1. Validar e sanitizar dados de entrada
2. Implementar tratamento de erros robusto
3. Adicionar logging para debugging
4. Criar testes unitários para `getMetrics`

### Fase 3: Melhorias de UX/UI
1. Implementar dark mode toggle
2. Melhorar responsividade para mobile
3. Adicionar tooltips e help text
4. Implementar confirmações para ações críticas

### Fase 4: Integrações e Performance
1. Implementar exportação CSV/PDF
2. Adicionar cache de dados
3. Implementar paginação
4. Otimizar queries ao Graph API

## Tecnologias Utilizadas
- Node.js + Express
- PostgreSQL + Drizzle (opcional)
- OpenAI API (opcional)
- Chart.js para gráficos
- Facebook Graph API v19.0
- Nodemailer para alertas

## Variáveis de Ambiente Necessárias
- `FB_APP_ID`, `FB_APP_SECRET`, `BASE_URL`
- `SESSION_SECRET`, `PORT`, `NODE_ENV`
- `DATABASE_URL` (opcional)
- `OPENAI_API_KEY` (opcional)
- `ALERT_EMAIL_USER`, `ALERT_EMAIL_PASS`, `ALERT_EMAIL_TO` (opcional)
