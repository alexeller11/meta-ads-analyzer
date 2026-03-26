// decision-engine.js

function safeNum(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function getLifecycleStatus(campaign) {
  const status = String(campaign.status || "").toUpperCase();
  const spend = safeNum(campaign.spend);
  const stopTime = campaign.stop_time ? new Date(campaign.stop_time) : null;
  const now = new Date();

  if (status === "PAUSED") return "PAUSADA";
  if (stopTime && stopTime < now) return "CONCLUIDA";
  if (status === "ACTIVE" && spend > 0) return "RODANDO";
  if (status === "ACTIVE") return "ATIVA";
  return "ATIVA";
}

function calculateCampaignScore(campaign) {
  let score = 50;

  const roas = safeNum(campaign.roas);
  const ctr = safeNum(campaign.ctr);
  const frequency = safeNum(campaign.frequency);
  const connectRate = safeNum(campaign.connectRate);
  const purchases = safeNum(campaign.purchases);
  const messages = safeNum(campaign.messages);
  const leads = safeNum(campaign.leads);

  if (roas > 4) score += 30;
  else if (roas > 3) score += 24;
  else if (roas > 2) score += 16;
  else if (roas < 1) score -= 18;

  if (ctr > 2.5) score += 14;
  else if (ctr > 1.5) score += 8;
  else if (ctr < 0.8) score -= 12;

  if (connectRate > 80) score += 10;
  else if (connectRate > 70) score += 6;
  else if (connectRate < 50) score -= 10;

  if (frequency > 4) score -= 12;
  else if (frequency > 3) score -= 6;

  if (purchases >= 5) score += 12;
  else if (purchases >= 2) score += 8;

  if (messages >= 15) score += 8;
  else if (messages >= 5) score += 4;

  if (leads >= 10) score += 6;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function analyzeCampaign(campaign) {
  const c = {
    ...campaign,
    spend: safeNum(campaign.spend),
    impressions: safeNum(campaign.impressions),
    reach: safeNum(campaign.reach),
    ctr: safeNum(campaign.ctr),
    clicks: safeNum(campaign.clicks),
    frequency: safeNum(campaign.frequency),
    roas: safeNum(campaign.roas),
    purchases: safeNum(campaign.purchases),
    messages: safeNum(campaign.messages),
    leads: safeNum(campaign.leads),
    connectRate: safeNum(campaign.connectRate),
    costPerPur: safeNum(campaign.costPerPur),
    costPerMsg: safeNum(campaign.costPerMsg),
    costPerLead: safeNum(campaign.costPerLead)
  };

  const lifecycleStatus = getLifecycleStatus(c);
  const score = calculateCampaignScore(c);

  let action = "MANTER_E_OTIMIZAR";
  let priority = 3;
  let waste = 0;
  let reason = "Campanha funcional, com margem para melhoria.";

  if (c.spend <= 0) {
    action = "SEM_DADOS";
    priority = 4;
    waste = 0;
    reason = "Sem gasto no período selecionado.";
  } else if (c.spend > 100 && c.purchases === 0 && c.messages === 0 && c.leads === 0) {
    action = "PAUSAR";
    priority = 1;
    waste = c.spend;
    reason = "Gasto alto sem gerar conversão, mensagem ou lead.";
  } else if (c.frequency > 3.5 || c.ctr < 0.8) {
    action = "RENOVAR_CRIATIVO";
    priority = 2;
    waste = c.spend * 0.3;
    reason = "Fadiga ou baixo poder de clique do criativo.";
  } else if (c.connectRate > 0 && c.connectRate < 60 && c.clicks > 20) {
    action = "AJUSTAR_FUNIL";
    priority = 2;
    waste = c.spend * 0.2;
    reason = "Muitos cliques não estão virando visita real.";
  } else if (c.roas >= 2.5 || c.purchases >= 3 || c.messages >= 10) {
    action = "ESCALAR";
    priority = 1;
    waste = 0;
    reason = "Campanha com resultado consistente.";
  }

  return {
    ...c,
    lifecycleStatus,
    score,
    decision: {
      action,
      priority,
      waste: Number(waste.toFixed(2)),
      reason
    }
  };
}

function analyzeAccount(campaigns) {
  const analyzed = campaigns.map(analyzeCampaign);

  const summary = {
    scale: analyzed.filter(c => c.decision.action === "ESCALAR"),
    pause: analyzed.filter(c => c.decision.action === "PAUSAR"),
    creative: analyzed.filter(c => c.decision.action === "RENOVAR_CRIATIVO"),
    funnel: analyzed.filter(c => c.decision.action === "AJUSTAR_FUNIL"),
    keep: analyzed.filter(c => c.decision.action === "MANTER_E_OTIMIZAR"),
    noData: analyzed.filter(c => c.decision.action === "SEM_DADOS")
  };

  const totalWaste = analyzed.reduce((acc, c) => acc + safeNum(c.decision?.waste), 0);

  return {
    campaigns: analyzed,
    summary: {
      scaleCount: summary.scale.length,
      pauseCount: summary.pause.length,
      creativeCount: summary.creative.length,
      funnelCount: summary.funnel.length,
      keepCount: summary.keep.length,
      noDataCount: summary.noData.length
    },
    totalWaste: Number(totalWaste.toFixed(2))
  };
}

module.exports = {
  analyzeCampaign,
  analyzeAccount,
  getLifecycleStatus
};
