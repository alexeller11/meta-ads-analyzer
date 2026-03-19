// --- MOTOR ESTRATÉGICO DE ANÁLISE REVISADO ---
function runAnalysisEngine(accountData, campaigns, metrics, previousRun, dateRange) {
  const {
    avgCtr, avgCpc, avgCpm, avgFrequency,
    totalSpend, totalImpressions, totalClicks,
    activeCampaigns, totalCampaigns
  } = metrics;

  const S = accountData.currency === 'BRL' ? 'R$' : '$';
  const isBRL = accountData.currency === 'BRL';

  // Benchmarks baseados em mercado
  const bench = isBRL
    ? { ctrBom: 1.0, cpcAlto: 7.0, cpmAlto: 45, freqMax: 3.5 }
    : { ctrBom: 0.9, cpcAlto: 4.0, cpmAlto: 25, freqMax: 3.5 };

  let score = 100;
  const issues = [];

  // Lógica de Score e Diagnósticos Cruzados (IA "Hardcoded")
  if (avgCtr < bench.ctrBom) {
    score -= 20;
    // Diagnóstico Cruzado: Criativo vs Leilão
    const msg = avgCpm > bench.cpmAlto 
      ? `CTR baixo (${avgCtr.toFixed(2)}%) causado por leilão caro. Considere ampliar o público.`
      : `CTR crítico (${avgCtr.toFixed(2)}%). O seu alcance está barato, mas o criativo não gera cliques. Troque a imagem/vídeo.`;
    issues.push({ metric: 'CTR', severity: 'alta', msg });
  }

  if (avgFrequency > bench.freqMax) {
    score -= 15;
    issues.push({ metric: 'Freq', severity: 'media', msg: `Frequência de ${avgFrequency.toFixed(1)}x indica início de saturação do público.` });
  }

  if (totalSpend === 0) score = 0;
  score = Math.max(0, Math.min(100, score));

  const nivel_saude = score >= 80 ? 'Excelente' : score >= 65 ? 'Bom' : score >= 45 ? 'Atenção' : 'Crítico';

  // Otimizações Prioritárias
  const otimizacoes = [];
  if (avgCtr < bench.ctrBom) {
    otimizacoes.push({
      prioridade: 1,
      titulo: 'Renovar Criativos',
      categoria: 'Criativo',
      impacto_esperado: 'Alto',
      descricao: 'O CTR está abaixo do ideal. Teste novos ganchos nos primeiros 3 segundos dos vídeos.',
      acao: '1. Identifique os 2 anúncios que mais gastam.\n2. Crie 3 variações de headline.\n3. Rode um teste A/B por 7 dias.',
      prazo: 'Imediato'
    });
  }

  // IMPORTANTE: Removida a variável inexistente que causava o erro 500
  return {
    resumo_geral: { 
      score_saude: score, 
      nivel_saude, 
      tendencia: previousRun ? (score > previousRun.health_score ? 'melhora' : 'piora') : 'sem_historico',
      pontos_principais: issues.map(i => i.msg),
      resumo_historico: previousRun ? `Score anterior: ${previousRun.health_score} pts.` : 'Primeira análise registrada.'
    },
    campanhas_analise: campaigns.map(c => ({
      nome: c.name,
      status_performance: c.ctr >= bench.ctrBom ? 'Bom' : 'Atenção',
      gasto: `${S} ${c.spend.toFixed(2)}`,
      ctr: `${c.ctr.toFixed(2)}%`,
      cpc: `${S} ${c.cpc.toFixed(2)}`,
      frequencia: c.frequency.toFixed(2),
      problema_principal: c.ctr < bench.ctrBom ? 'Baixo engajamento' : 'Sem problemas críticos',
      acao_imediata: c.ctr < bench.ctrBom ? 'Trocar criativo' : 'Manter e monitorar'
    })),
    otimizacoes_prioritarias: otimizacoes,
    alertas_criticos: issues.filter(i => i.severity === 'alta'),
    insights_historicos: [],
    oportunidades: [
      { titulo: 'Público Semelhante (Lookalike)', descricao: 'Crie um público 1% de quem já comprou.', potencial_impacto: 'Redução de 20% no CPA' }
    ],
    plano_acao_30dias: [
      { semana: 1, foco: 'Ajuste de Criativos', acoes: ['Trocar as 3 piores peças', 'Validar Pixel'] }
    ],
    proximos_passos: ['Executar nova análise em 7 dias']
  };
}
