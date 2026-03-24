function safe(n) {
  const v = Number(n || 0);
  return Number.isFinite(v) ? v : 0;
}

function getBenchmark(niche = 'Geral', benchmarks = {}) {
  return benchmarks[niche] || benchmarks.Geral || {
    minRoas: 2,
    minCtr: 1,
    maxCpm: 35,
    minConnectRate: 70,
    maxFrequency: 3.5,
    targetCPA: 80,
    minSpendForDecision: 50,
    minConversionsForScale: 3,
    goodMessageCost: 10,
    acceptableMessageCost: 20
  };
}

function classifyCampaign(camp, benchmark) {
  const spend = safe(camp.spend);
  const roas = safe(camp.roas);
  const ctr = safe(camp.ctr);
  const freq = safe(camp.frequency);
  const purchases = safe(camp.purchases);
  const messages = safe(camp.messages);
  const leads = safe(camp.leads);
  const costPerPur = safe(camp.costPerPur);
  const costPerMsg = safe(camp.costPerMsg);
  const minSpend = safe(benchmark.minSpendForDecision || 50);

  let action = 'MANTER_E_OTIMIZAR';
  let priority = 'media';
  let reason = [];
  let waste = 0;
  let budgetSuggestion = 'Manter orçamento atual por enquanto.';

  if (spend >= minSpend && purchases === 0 && messages === 0 && leads === 0) {
    action = 'PAUSAR';
    priority = 'alta';
    waste = spend;
    reason.push('consumiu verba sem gerar ação útil');
    budgetSuggestion = 'Cortar verba desta campanha e redistribuir para campanhas com tração.';
  } else if (roas >= benchmark.minRoas * 1.35 && purchases >= benchmark.minConversionsForScale) {
    action = 'ESCALAR';
    priority = 'alta';
    reason.push('roas acima do benchmark com conversões suficientes');
    budgetSuggestion = 'Escalar entre 15% e 25% ao dia, monitorando CPM e frequência.';
  } else if (messages >= 8 && costPerMsg > 0 && costPerMsg <= benchmark.goodMessageCost) {
    action = 'ESCALAR';
    priority = 'alta';
    reason.push('mensagens em volume com custo saudável');
    budgetSuggestion = 'Escalar entre 10% e 20% e testar mais 2 criativos semelhantes.';
  } else if (ctr < benchmark.minCtr && spend >= minSpend) {
    action = 'RENOVAR_CRIATIVO';
    priority = 'alta';
    waste = spend * 0.35;
    reason.push('ctr abaixo do benchmark, indicando problema de gancho ou criativo');
    budgetSuggestion = 'Segurar orçamento e trocar criativos antes de escalar.';
  } else if (freq > benchmark.maxFrequency) {
    action = 'RENOVAR_CRIATIVO';
    priority = 'media';
    waste = spend * 0.2;
    reason.push('frequência elevada, com risco de fadiga');
    budgetSuggestion = 'Manter verba apenas se houver resultado; priorizar renovação criativa.';
  } else if (costPerPur > 0 && benchmark.targetCPA > 0 && costPerPur > benchmark.targetCPA * 1.2) {
    action = 'MANTER_E_OTIMIZAR';
    priority = 'media';
    waste = Math.max(0, spend * 0.2);
    reason.push('custo por compra acima da meta do nicho');
    budgetSuggestion = 'Ajustar oferta, página ou público antes de aumentar investimento.';
  } else if (messages > 0 && costPerMsg > benchmark.acceptableMessageCost) {
    action = 'TESTAR_NOVA_VARIACAO';
    priority = 'media';
    reason.push('campanha gera mensagens, mas custo já está perdendo eficiência');
    budgetSuggestion = 'Criar 2 novas variações de copy e 1 novo público antes de ampliar verba.';
  } else {
    action = 'MANTER_E_OTIMIZAR';
    priority = 'baixa';
    reason.push('campanha ainda não mostrou sinal forte de corte nem de escala');
  }

  const summary = {
    action,
    priority,
    waste: Number(waste.toFixed(2)),
    reason: reason.join('; '),
    budgetSuggestion
  };

  return summary;
}

function buildDecisionCenter(campaigns = [], metrics = {}, benchmark = {}) {
  const evaluated = campaigns.map(c => ({
    ...c,
    decision: classifyCampaign(c, benchmark)
  }));

  const toScale = evaluated.filter(c => c.decision.action === 'ESCALAR')
    .sort((a, b) => safe(b.roas) - safe(a.roas));
  const toPause = evaluated.filter(c => c.decision.action === 'PAUSAR')
    .sort((a, b) => safe(b.decision.waste) - safe(a.decision.waste));
  const toRefresh = evaluated.filter(c => c.decision.action === 'RENOVAR_CRIATIVO');
  const toTest = evaluated.filter(c => c.decision.action === 'TESTAR_NOVA_VARIACAO');

  const totalEstimatedWaste = evaluated.reduce((acc, c) => acc + safe(c.decision.waste), 0);
  const reallocationPool = toPause.reduce((acc, c) => acc + safe(c.spend), 0);

  const allocationSuggestions = [];
  if (reallocationPool > 0 && toScale.length > 0) {
    const chunk = reallocationPool / Math.min(toScale.length, 3);
    toScale.slice(0, 3).forEach(c => {
      allocationSuggestions.push({
        campaignId: c.id,
        campaignName: c.name,
        suggestedExtraBudget: Number(chunk.toFixed(2)),
        reason: 'receber verba redirecionada de campanhas com baixa eficiência'
      });
    });
  }

  const immediateActions = [];
  if (toPause.length) immediateActions.push(`Pausar ${toPause.length} campanha(s) com gasto improdutivo.`);
  if (toRefresh.length) immediateActions.push(`Renovar criativos de ${toRefresh.length} campanha(s) com sinal de fadiga ou CTR fraco.`);
  if (toScale.length) immediateActions.push(`Escalar ${toScale.length} campanha(s) com sinal claro de eficiência.`);
  if (toTest.length) immediateActions.push(`Abrir novos testes controlados em ${toTest.length} campanha(s).`);

  return {
    summary: {
      totalCampaigns: campaigns.length,
      scaleCount: toScale.length,
      pauseCount: toPause.length,
      refreshCount: toRefresh.length,
      testCount: toTest.length,
      totalEstimatedWaste: Number(totalEstimatedWaste.toFixed(2)),
      reallocationPool: Number(reallocationPool.toFixed(2))
    },
    immediateActions,
    allocationSuggestions,
    campaigns: evaluated
  };
}

module.exports = {
  getBenchmark,
  classifyCampaign,
  buildDecisionCenter
};
