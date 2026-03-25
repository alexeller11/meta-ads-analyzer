function safeNum(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function classifyCampaignStatus(campaign, selectedPeriodHasSpend = false) {
  const status = (campaign.status || "").toUpperCase();
  const spend = safeNum(campaign.spend);
  const start = campaign.start_time ? new Date(campaign.start_time) : null;
  const stop = campaign.stop_time ? new Date(campaign.stop_time) : null;
  const now = new Date();

  if (status === "PAUSED") return "PAUSADA";
  if (stop && stop < now) return "CONCLUIDA";
  if (status === "ACTIVE" && selectedPeriodHasSpend) return "RODANDO";
  if (status === "ACTIVE") return "ATIVA";
  if (spend > 0) return "RODANDO";
  return "ATIVA";
}

function buildDecision(c, benchmarks) {
  const roas = safeNum(c.roas);
  const ctr = safeNum(c.ctr);
  const freq = safeNum(c.frequency);
  const spend = safeNum(c.spend);
  const purchases = safeNum(c.purchases);
  const messages = safeNum(c.messages);
  const leads = safeNum(c.leads);
  const connectRate = safeNum(c.connectRate);
  const costPerPur = safeNum(c.costPerPur);
  const costPerMsg = safeNum(c.costPerMsg);
  const costPerLead = safeNum(c.costPerLead);

  let action = "MANTER_E_OTIMIZAR";
  let priority = 3;
  let reason = [];
  let wasted = 0;

  if (spend <= 0) {
    return {
      action: "SEM_DADOS",
      priority: 4,
      reason: "Sem gasto no período selecionado.",
      estimatedWaste: 0,
      score: 0
    };
  }

  if (roas < benchmarks.minRoas * 0.5 && purchases === 0 && messages === 0 && leads === 0 && spend > 50) {
    action = "PAUSAR";
    priority = 1;
    wasted = spend;
    reason.push("Queima verba sem gerar ação relevante.");
  } else if (ctr < benchmarks.minCtr * 0.75 && spend > 30) {
    action = "RENOVAR_CRIATIVO";
    priority = 1;
    wasted = spend * 0.35;
    reason.push("CTR abaixo do saudável para o nicho.");
  } else if (freq > benchmarks.maxFrequency) {
    action = "RENOVAR_CRIATIVO";
    priority = 2;
    wasted = spend * 0.2;
    reason.push("Frequência alta, provável fadiga.");
  } else if (connectRate > 0 && connectRate < benchmarks.minConnectRate) {
    action = "OTIMIZAR_FUNIL";
    priority = 1;
    wasted = spend * 0.25;
    reason.push("Muitos cliques sem conexão suficiente com a página.");
  } else if (roas >= benchmarks.minRoas * 1.3 && ctr >= benchmarks.minCtr && purchases + messages + leads > 0) {
    action = "ESCALAR";
    priority = 1;
    reason.push("Campanha acima do benchmark.");
  } else if (roas >= benchmarks.minRoas || messages > 5 || leads > 5) {
    action = "MANTER_E_OTIMIZAR";
    priority = 2;
    reason.push("Campanha funcional, mas ainda com margem para melhorar.");
  } else {
    action = "TESTAR_NOVA_VARIACAO";
    priority = 2;
    wasted = spend * 0.15;
    reason.push("Campanha sem sinal forte de escala.");
  }

  const score =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          (roas * 25) +
          (ctr * 15) +
          (connectRate * 0.4) +
          ((purchases + messages + leads) * 2) -
          (Math.max(0, freq - benchmarks.maxFrequency) * 8)
        )
      )
    );

  return {
    action,
    priority,
    reason: reason.join(" "),
    estimatedWaste: Number(wasted.toFixed(2)),
    score,
    metrics: {
      roas,
      ctr,
      freq,
      spend,
      purchases,
      messages,
      leads,
      connectRate,
      costPerPur,
      costPerMsg,
      costPerLead
    }
  };
}

function summarizeDecisions(campaigns) {
  const summary = {
    ESCALAR: 0,
    PAUSAR: 0,
    MANTER_E_OTIMIZAR: 0,
    RENOVAR_CRIATIVO: 0,
    OTIMIZAR_FUNIL: 0,
    TESTAR_NOVA_VARIACAO: 0,
    SEM_DADOS: 0,
    estimatedWaste: 0,
    budgetReallocation: []
  };

  campaigns.forEach(c => {
    const key = c.decision?.action || "SEM_DADOS";
    if (summary[key] !== undefined) summary[key] += 1;
    summary.estimatedWaste += safeNum(c.decision?.estimatedWaste);
  });

  const scalable = campaigns
    .filter(c => c.decision?.action === "ESCALAR")
    .sort((a, b) => (b.roas || 0) - (a.roas || 0))
    .slice(0, 5);

  const pausable = campaigns
    .filter(c => c.decision?.action === "PAUSAR")
    .sort((a, b) => (b.spend || 0) - (a.spend || 0))
    .slice(0, 5);

  const freedBudget = pausable.reduce((acc, c) => acc + safeNum(c.spend), 0);
  const totalScaleTargets = scalable.length || 1;
  const eachExtra = freedBudget / totalScaleTargets;

  summary.budgetReallocation = scalable.map(c => ({
    campaignId: c.id,
    campaignName: c.name,
    suggestedExtraBudget: Number(eachExtra.toFixed(2))
  }));

  summary.estimatedWaste = Number(summary.estimatedWaste.toFixed(2));
  return summary;
}

function buildDecisionEngine(campaigns, benchmarks) {
  const enriched = campaigns.map(c => {
    const selectedPeriodHasSpend = safeNum(c.spend) > 0;
    const lifecycleStatus = classifyCampaignStatus(c, selectedPeriodHasSpend);
    const decision = buildDecision(c, benchmarks);
    return {
      ...c,
      lifecycleStatus,
      decision
    };
  });

  const summary = summarizeDecisions(enriched);

  return {
    campaigns: enriched,
    summary,
    actionPlan: [
      ...enriched
        .filter(c => c.decision?.priority === 1)
        .sort((a, b) => (b.decision?.estimatedWaste || 0) - (a.decision?.estimatedWaste || 0))
        .slice(0, 10)
        .map(c => ({
          campaignId: c.id,
          campaignName: c.name,
          action: c.decision.action,
          reason: c.decision.reason,
          estimatedWaste: c.decision.estimatedWaste
        }))
    ]
  };
}

module.exports = {
  buildDecisionEngine,
  classifyCampaignStatus
};
