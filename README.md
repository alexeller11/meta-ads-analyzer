# ⚡ Meta Ads Analyzer

Analisador inteligente de campanhas Meta Ads (Facebook + Instagram) com IA Claude Opus.

## Funcionalidades

- 🔗 **Login Social** com Facebook — puxa todas as contas de anúncios automaticamente
- 📊 **Métricas em tempo real** — CTR, CPC, CPM, spend, impressões, cliques
- 🧠 **Análise por IA** — Claude Opus analisa cada campanha e gera insights acionáveis
- 🎯 **Otimizações prioritárias** — lista ranqueada com impacto esperado e passo a passo
- 🚨 **Alertas críticos** — detecção automática de problemas
- 💡 **Oportunidades** — identificação de melhorias não óbvias
- 📅 **Plano de ação 30 dias** — cronograma semanal de implementação

---

## Setup

### 1. Clonar e instalar

```bash
git clone <repo>
cd meta-ads-analyzer
npm install
```

### 2. Criar App no Facebook

1. Acesse [developers.facebook.com](https://developers.facebook.com)
2. Crie um novo app → **Empresa** → Meta
3. Adicione os produtos:
   - **Facebook Login** (Web)
   - **Marketing API**
4. Em **Facebook Login → Configurações**, adicione a URI de redirecionamento:
   - Local: `http://localhost:3000/auth/facebook/callback`
   - Produção: `https://seu-app.onrender.com/auth/facebook/callback`
5. Em **Análise do app**, solicite as permissões:
   - `ads_read`
   - `ads_management`
   - `read_insights`
   - `business_management`

> **Nota**: Para testar localmente, você pode usar o app em modo de desenvolvimento sem precisar da revisão da Meta, desde que a conta do Facebook seja de um administrador/testador do app.

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` com suas credenciais:

```
FB_APP_ID=123456789
FB_APP_SECRET=abc123def456...
ANTHROPIC_API_KEY=sk-ant-...
BASE_URL=http://localhost:3000
SESSION_SECRET=uma-string-aleatoria-segura
```

### 4. Rodar

```bash
npm start
# ou para desenvolvimento:
npm run dev
```

Acesse `http://localhost:3000`

---

## Deploy no Render

1. Faça push do código para GitHub
2. No [Render](https://render.com), crie um novo **Web Service**
3. Conecte o repositório
4. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node
5. Adicione as variáveis de ambiente (mesmas do `.env`)
6. Atualize `BASE_URL` para `https://seu-app.onrender.com`
7. Adicione a URL de callback no Facebook App

---

## Estrutura

```
meta-ads-analyzer/
├── server.js          # Backend Express + rotas API
├── package.json
├── .env.example
├── public/
│   ├── index.html     # Landing page
│   └── dashboard.html # App principal
└── README.md
```

---

## Permissões Meta API

| Permissão | Uso |
|---|---|
| `ads_read` | Leitura de contas, campanhas e métricas |
| `ads_management` | Necessário para Marketing API |
| `read_insights` | Dados de performance e analytics |
| `business_management` | Acesso a Business Manager |

> O app usa **apenas leitura** — nunca modifica suas campanhas.
