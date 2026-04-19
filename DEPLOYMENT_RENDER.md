# 🚀 Deploy no Render

Para hospedar o **Meta Ads Analyzer** no Render e usar a API da NVIDIA como motor principal, siga estes passos:

## 1. Criar um Web Service no Render
1. Acesse o [Dashboard do Render](https://dashboard.render.com).
2. Clique em **New +** e selecione **Web Service**.
3. Conecte seu repositório GitHub.
4. Configure os campos básicos:
   - **Name**: `meta-ads-analyzer`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

## 2. Configurar Variáveis de Ambiente
No menu **Environment** do seu serviço no Render, adicione as seguintes chaves:

| Chave | Valor Sugerido | Descrição |
| :--- | :--- | :--- |
| `NVIDIA_API_KEY` | `nvapi-xxxx` | Sua chave da NVIDIA (Motor Principal) |
| `AI_MODEL` | `meta/llama-3.1-405b-instruct` | Modelo da NVIDIA a ser usado |
| `FB_APP_ID` | `seu_id` | ID do App no Facebook Developers |
| `FB_APP_SECRET` | `sua_secret` | Secret do App no Facebook Developers |
| `BASE_URL` | `https://seu-app.onrender.com` | URL pública do seu app no Render |
| `SESSION_SECRET` | `uma-frase-longa-e-segura` | Chave para sessões de usuário |
| `DATABASE_URL` | `postgresql://...` | URL do seu banco PostgreSQL (opcional) |
| `NODE_ENV` | `production` | Ambiente de execução |

## 3. Configurar o Facebook Login
No [Facebook Developers](https://developers.facebook.com):
1. Vá em **Configurações do Cliente OAuth**.
2. Adicione o Redirect URI: `https://seu-app.onrender.com/auth/facebook/callback`.

## 4. Banco de Dados (Opcional)
Se quiser salvar o histórico de análises e tendências:
1. Crie um **PostgreSQL** no Render ou use um externo (como Neon.tech).
2. Copie a URL de conexão para a variável `DATABASE_URL`.

---
Desenvolvido para maximizar seu ROAS com o poder da NVIDIA! 🚀
