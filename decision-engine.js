// decision-engine.js

function calculateCampaignScore(c) {
  let score = 50;

  if (c.roas > 3) score += 25;
  else if (c.roas > 2) score += 15;
  else if (c.roas < 1) score -= 20;

  if (c.ctr > 2) score += 10;
  else if (c.ctr < 0.8) score -= 10;

  if (c.frequency > 3) score -= 10;

  if (c.connectRate > 70) score += 10;
  else if (c.connectRate < 50) score -= 10;

  if (c.purchases > 3) score += 10;
  if (c.messages > 10) score += 5;

  return Math.max(0, Math.min(100, score));
}

function analyzeCampaign(c) {
  const score = calculateCampaignScore(c);

  let action = 'MANTER';
  let priority = 3;
  let reason = '';
  let waste = 0;

  // 🔴 PAUSAR
  if (c.spend > 100 && c.purchases === 0 && c.messages === 0) {
    action = 'PAUSAR';
    priority = 1;
    waste = c.spend;
    reason = 'Gasto alto sem retorno direto.';
  }

  // 🟡 CRIATIVO
  else if (c.frequency > 3.5 || c.ctr < 0.8) {
    action = 'RENOVAR_CRIATIVO';
    priority = 2;
    waste = c.spend * 0.3;
    reason = 'Fadiga ou baixo poder de clique.';
  }

  // 🟡 FUNIL
  else if (c.connectRate < 60 && c.clicks > 20) {
    action = 'AJUSTAR_FUNIL';
    priority = 2;
    waste = c.spend * 0.2;
    reason = 'Clique não está virando visita real.';
  }

  // 🟢 ESCALAR
  else if (c.roas >= 2.5 || c.purchases >= 3) {
    action = 'ESCALAR';
    priority = 1;
    reason = 'Campanha com resultado consistente.';
  }

  return {
    ...c,
    score,
    decision: {
      action,
      priority,
      reason,
      waste
    }
  };
}

function analyzeAccount(campaigns) {
  const analyzed = campaigns.map(analyzeCampaign);

  const summary = {
    scale: analyzed.filter(c => c.decision.action === 'ESCALAR'),
    pause: analyzed.filter(c => c.decision.action === 'PAUSAR'),
    creative: analyzed.filter(c => c.decision.action === 'RENOVAR_CRIATIVO'),
    funnel: analyzed.filter(c => c.decision.action === 'AJUSTAR_FUNIL')
  };

  const totalWaste = analyzed.reduce((acc, c) => acc + (c.decision.waste || 0), 0);

  return {
    campaigns: analyzed,
    summary,
    totalWaste
  };
}

module.exports = {
  analyzeCampaign,
  analyzeAccount
};
