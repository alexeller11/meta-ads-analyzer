---
title: Meta Ads Analyzer
emoji: 📊
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
---

# ⚡ Meta Ads Analyzer

Analisador inteligente de campanhas Meta Ads (Facebook + Instagram) com IA Claude Opus.

## Migração para Hugging Face Spaces

Este projeto foi configurado para rodar no Hugging Face Spaces usando Docker.

### Variáveis de Ambiente Necessárias

Para que o projeto funcione corretamente no Hugging Face Spaces, você precisa configurar as seguintes variáveis de ambiente (Secrets) nas configurações do seu Space:

- `FB_APP_ID`: ID do seu aplicativo no Facebook
- `FB_APP_SECRET`: Chave secreta do seu aplicativo no Facebook
- `DATABASE_URL`: URL de conexão com o banco de dados PostgreSQL (Neon)
- `BASE_URL`: A URL pública do seu Space (ex: `https://seu-usuario-nome-do-space.hf.space`)
- `SESSION_SECRET`: Uma string aleatória para segurança das sessões
- `ANTHROPIC_API_KEY`: Sua chave de API da Anthropic (se estiver usando o Claude)

### Configuração do Facebook Login

Após criar o Space e obter a URL pública, você precisará atualizar a URI de redirecionamento no painel de desenvolvedores do Facebook:

1. Acesse [developers.facebook.com](https://developers.facebook.com)
2. Vá para o seu aplicativo -> **Facebook Login** -> **Configurações**
3. Adicione a nova URI de redirecionamento: `https://seu-usuario-nome-do-space.hf.space/auth/facebook/callback`
