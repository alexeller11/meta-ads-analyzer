# Meta Ads Analyzer V2 - Railway Deployment Guide

## 🚀 Deploy no Railway em 5 Minutos

### Pré-requisitos

- ✅ Conta no Railway (https://railway.app)
- ✅ Repositório GitHub com o código
- ✅ Variáveis de ambiente configuradas

### Passo 1: Conectar GitHub ao Railway

1. Acesse [railway.app](https://railway.app)
2. Clique em "New Project"
3. Selecione "Deploy from GitHub"
4. Autorize Railway a acessar seu GitHub
5. Selecione o repositório `meta-ads-analyzer`

### Passo 2: Configurar Variáveis de Ambiente

No painel do Railway, vá para "Variables" e adicione:

```env
# Banco de Dados
DATABASE_URL=postgresql://user:password@host:5432/meta_ads

# Autenticação
JWT_SECRET=seu_jwt_secret_aqui
FACEBOOK_APP_ID=seu_facebook_app_id
FACEBOOK_APP_SECRET=seu_facebook_app_secret

# Session
SESSION_SECRET=seu_session_secret_aqui

# Servidor
NODE_ENV=production
PORT=3000

# Opcional: APIs de IA (para futuras melhorias)
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
```

### Passo 3: Configurar Banco de Dados

#### Opção A: PostgreSQL no Railway (Recomendado)

1. No painel do Railway, clique em "New"
2. Selecione "Database" → "PostgreSQL"
3. Railway cria automaticamente `DATABASE_URL`
4. Execute as migrations:

```bash
# Conectar ao banco
psql $DATABASE_URL

# Executar schema
\i schema.sql
```

#### Opção B: Neon (Alternativa)

1. Crie banco em https://neon.tech
2. Copie a connection string
3. Adicione como `DATABASE_URL` no Railway

### Passo 4: Executar Migrations

```bash
# SSH no Railway
railway shell

# Executar migrations
node db.js
```

### Passo 5: Deploy

```bash
# Push para GitHub
git add .
git commit -m "Deploy V2 features to Railway"
git push origin main
```

Railway automaticamente:
1. Detecta o push
2. Inicia build
3. Executa `npm install`
4. Inicia servidor com `npm start`
5. Disponibiliza em `https://seu-app.railway.app`

## ✅ Verificar Deploy

### 1. Testar Saúde da Aplicação

```bash
curl https://seu-app.railway.app/health
```

Esperado:
```json
{ "status": "ok" }
```

### 2. Testar Novos Endpoints

```bash
# Listar benchmarks
curl https://seu-app.railway.app/api/benchmarks

# Listar audit checks
curl https://seu-app.railway.app/api/audit-checks

# Listar landing page checks
curl https://seu-app.railway.app/api/landing-page-checks
```

### 3. Verificar Logs

No painel do Railway:
1. Vá para "Logs"
2. Procure por erros
3. Verifique se servidor iniciou corretamente

## 🔧 Troubleshooting

### Erro: "Cannot connect to database"

**Solução:**
1. Verifique `DATABASE_URL` em Variables
2. Certifique-se que banco está rodando
3. Teste conexão localmente:
   ```bash
   psql $DATABASE_URL -c "SELECT 1"
   ```

### Erro: "Module not found"

**Solução:**
1. Verifique se todos os arquivos foram commitados
2. Execute `npm install` localmente
3. Verifique `package.json`

### Erro: "Port already in use"

**Solução:**
1. Railway usa porta dinâmica via `PORT` env var
2. Certifique-se que `server.js` usa `process.env.PORT`

### Aplicação lenta

**Solução:**
1. Verifique logs de performance
2. Aumente recursos no Railway (CPU/RAM)
3. Otimize queries do banco

## 📊 Monitorar Performance

### Métricas no Railway

1. **CPU Usage** - Deve estar < 80%
2. **Memory Usage** - Deve estar < 85%
3. **Network I/O** - Monitore picos
4. **Disk Usage** - Deve estar < 90%

### Alertas Recomendados

Configure alertas no Railway para:
- CPU > 80%
- Memory > 85%
- Restart count > 3 em 1 hora
- Response time > 5s

## 🔄 Atualizar Código

### Fazer Deploy de Novas Mudanças

```bash
# Fazer mudanças no código
# ...

# Commit e push
git add .
git commit -m "Update features"
git push origin main

# Railway automaticamente redeploy
```

### Rollback para Versão Anterior

1. No painel do Railway, vá para "Deployments"
2. Selecione deployment anterior
3. Clique em "Redeploy"

## 🛡️ Segurança

### Checklist de Segurança

- [ ] `JWT_SECRET` é único e forte
- [ ] `DATABASE_URL` não está em código
- [ ] HTTPS está ativado (Railway faz automaticamente)
- [ ] CORS está configurado corretamente
- [ ] Rate limiting está ativado
- [ ] Validação de entrada em todos os endpoints

### Proteger Endpoints Sensíveis

```javascript
// Adicionar autenticação em endpoints críticos
app.post("/api/audit-landing-page", auth, async (req, res) => {
  // Apenas usuários autenticados podem acessar
});
```

## 📈 Escalabilidade

### Para Suportar Mais Usuários

1. **Aumentar Recursos**
   - Railway: Aumente CPU/RAM no painel
   - Custo aumenta proporcionalmente

2. **Usar Cache**
   - Redis para cache de benchmarks
   - Reduz queries ao banco

3. **Otimizar Queries**
   - Use índices no PostgreSQL
   - Implemente pagination

4. **Separar Serviços**
   - API em um container
   - Worker para análises pesadas em outro

## 💰 Custos Estimados

### Railway Pricing (2026)

| Recurso | Preço |
|---------|-------|
| 512MB RAM | $5/mês |
| 1GB RAM | $10/mês |
| 2GB RAM | $20/mês |
| PostgreSQL 1GB | $10/mês |
| PostgreSQL 10GB | $50/mês |

**Estimativa para 100 usuários:** $30-50/mês

## 🚨 Manutenção

### Backup do Banco

```bash
# Backup automático no Railway (diário)
# Ou fazer backup manual:
pg_dump $DATABASE_URL > backup.sql
```

### Limpeza de Dados Antigos

```bash
# Remover auditorias com mais de 90 dias
DELETE FROM audit_runs 
WHERE created_at < NOW() - INTERVAL '90 days';
```

### Atualizar Dependências

```bash
# Verificar atualizações
npm outdated

# Atualizar
npm update

# Testar
npm test

# Deploy
git push origin main
```

## 📞 Suporte

### Railway Support

- Docs: https://docs.railway.app
- Community: https://railway.app/community
- Email: support@railway.app

### Seu Suporte

Para problemas específicos do meta-ads-analyzer:
1. Verifique logs no Railway
2. Teste endpoints com curl
3. Verifique banco de dados

## 🎯 Próximas Melhorias

- [ ] Implementar Playwright para análise real de landing pages
- [ ] Adicionar Machine Learning para previsões
- [ ] Integrar com Google Ads API
- [ ] Implementar webhooks para alertas
- [ ] Dashboard em tempo real com WebSockets

---

**Versão:** 2.0.0  
**Data:** 2026-03-28  
**Plataforma:** Railway  
**Status:** Pronto para Production
