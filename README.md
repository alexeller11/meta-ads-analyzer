---
title: Meta Ads Analyzer
emoji: ⚡
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: true
---

# ⚡ Meta Ads Analyzer — Inteligência Sênior

Ferramenta profissional de análise de campanhas do Meta (Facebook/Instagram) com IA integrada.

## 🚀 Funcionalidades

### 📊 Visão Geral
- **Investimento & Retorno**: Gasto total, receita, ROAS e lucro estimado
- **Alcance & Engajamento**: Alcance, impressões, frequência e CTR médio
- **Funil de Conversão**: Mensagens, compras, leads, carrinhos e checkouts
- **Custos por Ação**: CPC, CPM, custo por compra e custo por mensagem

### 🧠 Insights IA
- Score de saúde da conta (0-100)
- Recomendações priorizadas com ações específicas
- Análise de tendências vs. período anterior
- **Plano de Guerra GPT-4o** com estratégia completa

### 📋 Campanhas
- Tabela completa com todas as métricas de funil
- Filtros: **Todas**, **Ativas**, **Rodando** (com gasto real)
- **Botão IA** em cada campanha — analisa o funil completo (Campanha → Conjunto → Anúncio)
- Diagnóstico automático: Excelente, Muito Bom, Bom, Atenção, Crítico, Fadiga

### 🖼️ Criativos Campeões
- Ordenação por: Melhor ROAS, Mais Cliques, Maior Gasto, Mais Compras, Mais Mensagens
- Visualização com thumbnail do criativo
- Métricas: gasto, ROAS, CTR, cliques, compras, mensagens

### 📉 Breakdown Detalhado
- **Dispositivo**: Desktop, Mobile, Tablet
- **Plataforma**: Facebook, Instagram, Audience Network
- **Posicionamento**: Feed, Stories, Reels, etc.
- **Gênero**: Masculino, Feminino
- **Idade**: Faixas etárias
- **Região**: Estado/Cidade

### 📈 Tendências
- Gráfico de evolução do score de saúde ao longo do tempo
- Gráfico de gasto diário
- Histórico de análises com métricas completas

### 📝 Notas
- Adicione observações por conta/campanha
- Categorias: Geral, Criativo, Público, Orçamento, Resultado

### 🔔 Alertas
- Alertas automáticos de saldo baixo por e-mail
- Configuração de limite personalizado por conta

## ⚙️ Variáveis de Ambiente

```env
# Meta / Facebook (obrigatório)
FB_APP_ID=seu_app_id
FB_APP_SECRET=seu_app_secret

# Servidor (obrigatório)
BASE_URL=https://seu-dominio.up.railway.app
SESSION_SECRET=string-secreta-aleatoria
PORT=3000
NODE_ENV=production

# Banco de Dados PostgreSQL (opcional — para tendências e histórico)
DATABASE_URL=postgresql://usuario:senha@host/banco?sslmode=require

# OpenAI (opcional — para análises GPT-4o avançadas)
OPENAI_API_KEY=sk-...

# Alertas de E-mail (opcional)
ALERT_EMAIL_USER=seu@gmail.com
ALERT_EMAIL_PASS=sua-senha-de-app-gmail
ALERT_EMAIL_TO=destinatario@email.com
```

## Configuração do Facebook Login

1. Acesse [developers.facebook.com](https://developers.facebook.com)
2. Crie um App do tipo **Business**
3. Adicione o produto **Facebook Login**
4. Configure o Redirect URI: `https://seu-dominio.up.railway.app/auth/facebook/callback`
5. Para Hugging Face: `https://Alexeller-meta-ads-analyzer.hf.space/auth/facebook/callback`
6. Solicite as permissões: `ads_read`, `ads_management`, `business_management`

## 🚂 Deploy no Railway

1. Conecte o repositório GitHub ao Railway
2. Configure as variáveis de ambiente
3. O deploy é automático a cada push na branch `main`

## 🤗 Deploy no Hugging Face Spaces

A sincronização com o Hugging Face Spaces é automática via GitHub Actions.
Configure o secret `HF_TOKEN` no repositório GitHub.

## 📦 Instalação Local

```bash
git clone https://github.com/alexeller11/meta-ads-analyzer.git
cd meta-ads-analyzer
npm install
cp .env.example .env
# Configure as variáveis no .env
npm start
```

## 🛠️ Stack Tecnológica

- **Backend**: Node.js + Express.js
- **Frontend**: HTML5 + CSS3 + JavaScript (Vanilla)
- **Banco de Dados**: PostgreSQL (Neon.tech)
- **IA**: OpenAI GPT-4o
- **Gráficos**: Chart.js
- **Deploy**: Railway + Hugging Face Spaces
- **CI/CD**: GitHub Actions

---

Desenvolvido com ❤️ para maximizar o ROAS das suas campanhas Meta.
