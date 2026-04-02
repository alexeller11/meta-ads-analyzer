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

function calculateAdvancedMetrics(c) {
  const impressions = safeNum(c.impressions);
  const clicks = safeNum(c.clicks);
  const spend = safeNum(c.spend);
  const reach = safeNum(c.reach);
  const purchases = safeNum(c.purchases);
  const revenue = safeNum(c.revenue || c.rev);

  const hookRate = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const holdRate = reach > 0 ? (clicks / reach) * 100 : 0;

  let connectRate = 0;
  if (typeof c.connectRate !== "undefined" && c.connectRate !== null) {
    connectRate = safeNum(c.connectRate);
  } else if (safeNum(c.landing_page_views) > 0 && clicks > 0) {
    connectRate = (safeNum(c.landing_page_views) / clicks) * 100;
  }

  const conversionRate = clicks > 0 ? (purchases / clicks) * 100 : 0;
  const roas = spend > 0 ? revenue / spend : 0;

  let scalePotential = 0;
  let scaleRecommendation = "Manter";

  if (roas > 4.0 && purchases >= 5) {
    scalePotential = 30;
    scaleRecommendation = "Escala Agressiva (+30% cada 48h)";
  } else if (roas > 2.5 && purchases >= 3) {
    scalePotential = 15;
    scaleRecommendation = "Escala Moderada (+15% cada 48h)";
  } else if (roas < 1.5 && spend > 50) {
    scalePotential = -20;
    scaleRecommendation = "Reduzir Orçamento (-20%)";
  }

  return {
    hookRate: Number(hookRate.toFixed(2)),
    holdRate: Number(holdRate.toFixed(2)),
    connectRate: Number(connectRate.toFixed(2)),
    conversionRate: Number(conversionRate.toFixed(2)),
    roas: Number(roas.toFixed(2)),
    scalePotential,
    scaleRecommendation
  };
}

const auditChecks = {
  CR_HOOK: {
    id: "CR_HOOK",
    name: "Hook Rate (CTR)",
    category: "Creative",
    severity: "high",
    check: (c) => ({
      passed: c.hookRate >= 1.5,
      value: c.hookRate,
      message: c.hookRate >= 1.5 ? "Gancho forte" : "Gancho fraco (CTR < 1.5%)"
    })
  },
  CR_HOLD: {
    id: "CR_HOLD",
    name: "Hold Rate",
    category: "Creative",
    severity: "medium",
    check: (c) => ({
      passed: c.holdRate >= 2.0,
      value: c.holdRate,
      message: c.holdRate >= 2.0 ? "Boa retenção" : "Baixa retenção no anúncio"
    })
  },
  CR_FATIGUE: {
    id: "CR_FATIGUE",
    name: "Creative Fatigue",
    category: "Creative",
    severity: "high",
    check: (c) => ({
      passed: safeNum(c.frequency) <= 3.0,
      value: c.frequency,
      message: safeNum(c.frequency) > 3.0 ? "Fadiga detectada" : "Frequência saudável"
    })
  },
  FN_CONNECT: {
    id: "FN_CONNECT",
    name: "Connect Rate",
    category: "Funnel",
    severity: "high",
    check: (c) => ({
      passed: c.connectRate >= 70,
      value: c.connectRate,
      message: c.connectRate < 70 ? "Furo no funil: Página lenta ou tracking falhando" : "Conexão saudável"
    })
  },
  FN_CVR: {
    id: "FN_CVR",
    name: "Conversion Rate",
    category: "Funnel",
    severity: "high",
    check: (c) => ({
      passed: c.conversionRate >= 1.0,
      value: c.conversionRate,
      message: c.conversionRate < 1.0 ? "Baixa conversão na página" : "Taxa de conversão OK"
    })
  },
  SC_ROAS: {
    id: "SC_ROAS",
    name: "ROAS Target",
    category: "Scaling",
    severity: "high",
    check: (c) => ({
      passed: c.roas >= 2.0,
      value: c.roas,
      message: c.roas < 2.0 ? "Abaixo do ROAS de equilíbrio" : "ROAS lucrativo"
    })
  },
  SC_VOLUME: {
    id: "SC_VOLUME",
    name: "Purchase Volume",
    category: "Scaling",
    severity: "medium",
    check: (c) => ({
      passed: safeNum(c.purchases) >= 3,
      value: c.purchases,
      message: safeNum(c.purchases) < 3 ? "Volume baixo para escalar" : "Volume pronto para escala"
    })
  }
};

function runAuditChecks(c) {
  const adv = calculateAdvancedMetrics(c);
  const campaignWithAdv = { ...c, ...adv };
  const alerts = [];
  let score = 100;

  Object.values(auditChecks).forEach((check) => {
    const res = check.check(campaignWithAdv);
    if (!res.passed) {
      alerts.push({
        id: check.id,
        message: res.message,
        severity: check.severity,
        category: check.category
      });
      score -= check.severity === "high" ? 15 : 7;
    }
  });

  return {
    score: Math.max(0, score),
    alerts,
    metrics: adv
  };
}

function analyzeCampaign(campaign) {
  const c = {
    ...campaign,
    spend: safeNum(campaign.spend),
    impressions: safeNum(campaign.impressions),
    reach: safeNum(campaign.reach),
    clicks: safeNum(campaign.clicks),
    purchases: safeNum(campaign.purchases),
    revenue: safeNum(campaign.revenue || campaign.rev),
    connectRate: safeNum(campaign.connectRate)
  };

  const audit = runAuditChecks(c);
  const lifecycleStatus = getLifecycleStatus(c);

  let action = "MANTER";
  if (audit.metrics.scalePotential > 0) action = "ESCALAR";
  if (audit.score < 50) action = "PAUSAR";
  if (safeNum(c.frequency) > 3.0 && safeNum(c.spend) > 50) action = "RENOVAR_CRIATIVO";

  return {
    ...c,
    ...audit.metrics,
    lifecycleStatus,
    auditScore: audit.score,
    auditAlerts: audit.alerts,
    decision: {
      action,
      reason: audit.metrics.scaleRecommendation,
      priority: audit.metrics.scalePotential > 0 ? 1 : 3
    }
  };
}

function analyzeAccount(campaigns) {
  const analyzed = campaigns.map(analyzeCampaign);
  const avgScore =
    analyzed.length > 0
      ? analyzed.reduce((acc, c) => acc + c.auditScore, 0) / analyzed.length
      : 0;

  const totalWaste = analyzed.reduce(
    (acc, c) => acc + (c.auditScore < 40 ? safeNum(c.spend) : 0),
    0
  );

  return {
    campaigns: analyzed,
    averageScore: Math.round(avgScore),
    accountGrade: avgScore >= 80 ? "A" : avgScore >= 60 ? "B" : "C",
    totalWaste: Number(totalWaste.toFixed(2)),
    summary: {
      scaleCount: analyzed.filter((c) => c.decision.action === "ESCALAR").length,
      pauseCount: analyzed.filter((c) => c.decision.action === "PAUSAR").length,
      keepCount: analyzed.filter((c) => c.decision.action === "MANTER").length,
      creativeCount: analyzed.filter((c) => c.decision.action === "RENOVAR_CRIATIVO").length
    }
  };
}

module.exports = {
  analyzeCampaign,
  analyzeAccount,
  getLifecycleStatus,
  calculateAdvancedMetrics,
  auditChecks
};
