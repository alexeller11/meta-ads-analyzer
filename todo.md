# Meta Ads Analyzer (NVIDIA Powered) - TODO

## Fase 1: Arquitetura e Modelo de Dados
- [ ] Definir schema de base de dados (users, businessManagers, adAccounts, campaigns, metrics, creatives, anomalies)
- [ ] Criar migrations com Drizzle ORM
- [ ] Implementar query helpers em server/db.ts

## Fase 2: Autenticação OAuth e Dashboard
- [ ] Implementar OAuth com Manus
- [ ] Criar DashboardLayout com sidebar
- [ ] Implementar seletor de Business Managers
- [ ] Agrupar contas de anúncios por BM
- [ ] Criar página Home com redirecionamento para dashboard

## Fase 3: Tabela de Campanhas
- [ ] Criar componente de tabela de campanhas
- [ ] Exibir métricas: CTR, ROAS, CPA
- [ ] Implementar botão de análise por IA (modal com análise)
- [ ] Integrar com API da NVIDIA Llama 3.1
- [ ] Criar procedure tRPC para análise de campanha

## Fase 4: Laboratório de Copy
- [ ] Criar interface do Laboratório de Copy
- [ ] Implementar busca de top 5 criativos por ROAS
- [ ] Integrar gerador de variações de textos com Llama 3.1
- [ ] Exibir variações geradas com opção de copiar/exportar
- [ ] Criar procedure tRPC para geração de copy

## Fase 5: Deteção de Anomalias
- [ ] Implementar cálculo de padrão histórico (média, desvio padrão)
- [ ] Criar sistema de alertas para CPA acima do padrão
- [ ] Criar sistema de alertas para ROAS abaixo do padrão
- [ ] Implementar painel de alertas no dashboard
- [ ] Criar procedure tRPC para listar anomalias
- [ ] Integrar notificações em tempo real

## Fase 6: Análise Visual de Criativos
- [ ] Criar interface para upload/seleção de imagens/vídeos
- [ ] Integrar com modelo de visão computacional da NVIDIA (NeVA)
- [ ] Gerar feedback sobre composição, texto e elementos visuais
- [ ] Exibir análise em modal com recomendações
- [ ] Criar procedure tRPC para análise visual

## Fase 7: Plano de Guerra (Copilot)
- [ ] Criar interface do Plano de Guerra (Copilot)
- [ ] Implementar geração de estratégia completa por conta
- [ ] Integrar recomendações da IA (Llama 3.1)
- [ ] Exibir plano com seções: diagnóstico, oportunidades, ações
- [ ] Criar procedure tRPC para gerar plano de guerra

## Fase 8: Testes e Entrega
- [ ] Escrever testes vitest para procedures críticas
- [ ] Testar fluxo completo de autenticação
- [ ] Testar multi-tenancy e isolamento de dados
- [ ] Testar integrações com IA
- [ ] Criar checkpoint final
- [ ] Documentar API e funcionalidades
