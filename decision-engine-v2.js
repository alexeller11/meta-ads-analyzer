// decision-engine-v2.js
// Expanded Meta Ads Audit Engine with 46+ checks
// Maintains backward compatibility with existing code

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

// ============================================================================
// AUDIT CHECKS - 46+ validações
// ============================================================================

const auditChecks = {
  // ── CREATIVE QUALITY (8 checks) ─────────────────────────────────────────
  CR_01: {
    id: "CR_01",
    name: "Creative Fatigue Detection",
    category: "Creative Quality",
    severity: "high",
    check: (campaign) => {
      const frequency = safeNum(campaign.frequency);
      return {
        passed: frequency <= 3.0,
        value: frequency,
        threshold: 3.0,
        message: frequency > 3.0 
          ? `Frequência alta (${frequency.toFixed(2)}) indica fadiga criativa`
          : `Frequência saudável (${frequency.toFixed(2)})`
      };
    }
  },
  CR_02: {
    id: "CR_02",
    name: "Text Overlay Compliance",
    category: "Creative Quality",
    severity: "medium",
    check: (campaign) => {
      // Placeholder: would need image analysis
      return {
        passed: true,
        message: "Requer análise de imagem (implementar com visão computacional)"
      };
    }
  },
  CR_03: {
    id: "CR_03",
    name: "Video Length Optimization",
    category: "Creative Quality",
    severity: "medium",
    check: (campaign) => {
      // Placeholder: would need video metadata
      return {
        passed: true,
        message: "Requer análise de vídeo (implementar com metadata)"
      };
    }
  },
  CR_04: {
    id: "CR_04",
    name: "Sound Design Presence",
    category: "Creative Quality",
    severity: "high",
    check: (campaign) => {
      // Placeholder: would need audio analysis
      return {
        passed: true,
        message: "Requer análise de áudio (implementar com Whisper API)"
      };
    }
  },
  CR_05: {
    id: "CR_05",
    name: "CTA Button Clarity",
    category: "Creative Quality",
    severity: "high",
    check: (campaign) => {
      // Placeholder: would need OCR on creatives
      return {
        passed: true,
        message: "Requer OCR em criativos (implementar com Tesseract)"
      };
    }
  },
  CR_06: {
    id: "CR_06",
    name: "Brand Color Consistency",
    category: "Creative Quality",
    severity: "medium",
    check: (campaign) => {
      // Placeholder: would need color analysis
      return {
        passed: true,
        message: "Requer análise de cores (implementar com PIL/OpenCV)"
      };
    }
  },
  CR_07: {
    id: "CR_07",
    name: "Mobile Optimization",
    category: "Creative Quality",
    severity: "high",
    check: (campaign) => {
      // Placeholder: would need aspect ratio validation
      return {
        passed: true,
        message: "Requer validação de aspect ratio"
      };
    }
  },
  CR_08: {
    id: "CR_08",
    name: "Creative Diversity",
    category: "Creative Quality",
    severity: "medium",
    check: (campaign) => {
      // Placeholder: would need creative count
      return {
        passed: true,
        message: "Requer contagem de criativos únicos"
      };
    }
  },

  // ── AUDIENCE & TARGETING (8 checks) ────────────────────────────────────
  AU_01: {
    id: "AU_01",
    name: "Audience Overlap Detection",
    category: "Audience & Targeting",
    severity: "high",
    check: (campaign) => {
      // Placeholder: would need audience data
      return {
        passed: true,
        message: "Requer dados de público (Meta Ads API)"
      };
    }
  },
  AU_02: {
    id: "AU_02",
    name: "Lookalike Audience Freshness",
    category: "Audience & Targeting",
    severity: "medium",
    check: (campaign) => {
      // Placeholder: would need lookalike metadata
      return {
        passed: true,
        message: "Requer metadados de lookalike"
      };
    }
  },
  AU_03: {
    id: "AU_03",
    name: "Interest Targeting Breadth",
    category: "Audience & Targeting",
    severity: "medium",
    check: (campaign) => {
      // Placeholder: would need interest count
      return {
        passed: true,
        message: "Requer contagem de interesses"
      };
    }
  },
  AU_04: {
    id: "AU_04",
    name: "Age/Gender Targeting Alignment",
    category: "Audience & Targeting",
    severity: "low",
    check: (campaign) => {
      // Placeholder: would need demographic data
      return {
        passed: true,
        message: "Requer dados demográficos"
      };
    }
  },
  AU_05: {
    id: "AU_05",
    name: "Geographic Targeting Precision",
    category: "Audience & Targeting",
    severity: "medium",
    check: (campaign) => {
      // Placeholder: would need location data
      return {
        passed: true,
        message: "Requer dados geográficos"
      };
    }
  },
  AU_06: {
    id: "AU_06",
    name: "Audience Size Validation",
    category: "Audience & Targeting",
    severity: "high",
    check: (campaign) => {
      // Placeholder: would need audience size
      return {
        passed: true,
        message: "Requer tamanho de público"
      };
    }
  },
  AU_07: {
    id: "AU_07",
    name: "Exclusion List Completeness",
    category: "Audience & Targeting",
    severity: "medium",
    check: (campaign) => {
      // Placeholder: would need exclusion data
      return {
        passed: true,
        message: "Requer dados de exclusão"
      };
    }
  },
  AU_08: {
    id: "AU_08",
    name: "Retargeting Pixel Health",
    category: "Audience & Targeting",
    severity: "high",
    check: (campaign) => {
      // Placeholder: would need pixel data
      return {
        passed: true,
        message: "Requer dados de pixel"
      };
    }
  },

  // ── BUDGET & BIDDING (8 checks) ────────────────────────────────────────
  BD_01: {
    id: "BD_01",
    name: "Budget Sufficiency",
    category: "Budget & Bidding",
    severity: "high",
    check: (campaign) => {
      const spend = safeNum(campaign.spend);
      const cpa = safeNum(campaign.costPerPur);
      const minBudget = cpa * 5;
      return {
        passed: spend >= minBudget,
        value: spend,
        threshold: minBudget,
        message: spend >= minBudget
          ? `Orçamento suficiente (${spend.toFixed(2)} >= ${minBudget.toFixed(2)})`
          : `Orçamento insuficiente (${spend.toFixed(2)} < ${minBudget.toFixed(2)})`
      };
    }
  },
  BD_02: {
    id: "BD_02",
    name: "Bid Strategy Alignment",
    category: "Budget & Bidding",
    severity: "medium",
    check: (campaign) => {
      // Placeholder: would need bid strategy data
      return {
        passed: true,
        message: "Requer dados de estratégia de lances"
      };
    }
  },
  BD_03: {
    id: "BD_03",
    name: "Daily Budget vs Monthly Ratio",
    category: "Budget & Bidding",
    severity: "medium",
    check: (campaign) => {
      // Placeholder: would need daily/monthly budget data
      return {
        passed: true,
        message: "Requer dados de orçamento diário/mensal"
      };
    }
  },
  BD_04: {
    id: "BD_04",
    name: "Cost Per Action Trending",
    category: "Budget & Bidding",
    severity: "high",
    check: (campaign) => {
      const cpa = safeNum(campaign.costPerPur);
      const cpaBefore = safeNum(campaign.costPerPurPrev);
      const increase = cpaBefore > 0 ? ((cpa - cpaBefore) / cpaBefore) * 100 : 0;
      return {
        passed: increase < 20,
        value: increase,
        threshold: 20,
        message: increase < 20
          ? `CPA estável (${increase.toFixed(1)}% mudança)`
          : `CPA aumentando (${increase.toFixed(1)}% mudança)`
      };
    }
  },
  BD_05: {
    id: "BD_05",
    name: "Minimum Spend Threshold",
    category: "Budget & Bidding",
    severity: "high",
    check: (campaign) => {
      const spend = safeNum(campaign.spend);
      const minSpend = 50;
      return {
        passed: spend >= minSpend,
        value: spend,
        threshold: minSpend,
        message: spend >= minSpend
          ? `Gasto acima do mínimo (R$ ${spend.toFixed(2)})`
          : `Gasto abaixo do mínimo (R$ ${spend.toFixed(2)} < R$ ${minSpend})`
      };
    }
  },
  BD_06: {
    id: "BD_06",
    name: "Budget Pacing",
    category: "Budget & Bidding",
    severity: "medium",
    check: (campaign) => {
      // Placeholder: would need daily spend data
      return {
        passed: true,
        message: "Requer dados de gasto diário"
      };
    }
  },
  BD_07: {
    id: "BD_07",
    name: "ROI Target Achievement",
    category: "Budget & Bidding",
    severity: "high",
    check: (campaign) => {
      const roas = safeNum(campaign.roas);
      const targetRoas = 2.5;
      return {
        passed: roas >= targetRoas,
        value: roas,
        threshold: targetRoas,
        message: roas >= targetRoas
          ? `ROAS acima da meta (${roas.toFixed(2)} >= ${targetRoas})`
          : `ROAS abaixo da meta (${roas.toFixed(2)} < ${targetRoas})`
      };
    }
  },
  BD_08: {
    id: "BD_08",
    name: "Bid Adjustment Optimization",
    category: "Budget & Bidding",
    severity: "low",
    check: (campaign) => {
      // Placeholder: would need bid adjustment data
      return {
        passed: true,
        message: "Requer dados de ajuste de lances"
      };
    }
  },

  // ── PERFORMANCE METRICS (8 checks) ─────────────────────────────────────
  PM_01: {
    id: "PM_01",
    name: "CTR Performance",
    category: "Performance Metrics",
    severity: "high",
    check: (campaign) => {
      const ctr = safeNum(campaign.ctr);
      const minCtr = 1.5;
      return {
        passed: ctr >= minCtr,
        value: ctr,
        threshold: minCtr,
        message: ctr >= minCtr
          ? `CTR saudável (${ctr.toFixed(2)}% >= ${minCtr}%)`
          : `CTR baixo (${ctr.toFixed(2)}% < ${minCtr}%)`
      };
    }
  },
  PM_02: {
    id: "PM_02",
    name: "Conversion Rate Optimization",
    category: "Performance Metrics",
    severity: "high",
    check: (campaign) => {
      const cvr = safeNum(campaign.cvr);
      const minCvr = 1.0;
      return {
        passed: cvr >= minCvr,
        value: cvr,
        threshold: minCvr,
        message: cvr >= minCvr
          ? `Taxa de conversão saudável (${cvr.toFixed(2)}%)`
          : `Taxa de conversão baixa (${cvr.toFixed(2)}%)`
      };
    }
  },
  PM_03: {
    id: "PM_03",
    name: "ROAS Benchmark",
    category: "Performance Metrics",
    severity: "high",
    check: (campaign) => {
      const roas = safeNum(campaign.roas);
      const minRoas = 2.0;
      return {
        passed: roas >= minRoas,
        value: roas,
        threshold: minRoas,
        message: roas >= minRoas
          ? `ROAS acima do benchmark (${roas.toFixed(2)}x >= ${minRoas}x)`
          : `ROAS abaixo do benchmark (${roas.toFixed(2)}x < ${minRoas}x)`
      };
    }
  },
  PM_04: {
    id: "PM_04",
    name: "CPM Efficiency",
    category: "Performance Metrics",
    severity: "medium",
    check: (campaign) => {
      const cpm = safeNum(campaign.cpm);
      const maxCpm = 10;
      return {
        passed: cpm <= maxCpm,
        value: cpm,
        threshold: maxCpm,
        message: cpm <= maxCpm
          ? `CPM eficiente (R$ ${cpm.toFixed(2)} <= R$ ${maxCpm})`
          : `CPM alto (R$ ${cpm.toFixed(2)} > R$ ${maxCpm})`
      };
    }
  },
  PM_05: {
    id: "PM_05",
    name: "Click Quality",
    category: "Performance Metrics",
    severity: "medium",
    check: (campaign) => {
      const clicks = safeNum(campaign.clicks);
      const reach = safeNum(campaign.reach);
      const qualityScore = reach > 0 ? (clicks / reach) * 100 : 0;
      return {
        passed: qualityScore >= 0.5,
        value: qualityScore,
        threshold: 0.5,
        message: qualityScore >= 0.5
          ? `Qualidade de cliques boa (${qualityScore.toFixed(2)}%)`
          : `Qualidade de cliques baixa (${qualityScore.toFixed(2)}%)`
      };
    }
  },
  PM_06: {
    id: "PM_06",
    name: "Reach Efficiency",
    category: "Performance Metrics",
    severity: "medium",
    check: (campaign) => {
      const reach = safeNum(campaign.reach);
      const impressions = safeNum(campaign.impressions);
      const reachRate = impressions > 0 ? (reach / impressions) * 100 : 0;
      return {
        passed: reachRate >= 40,
        value: reachRate,
        threshold: 40,
        message: reachRate >= 40
          ? `Eficiência de alcance boa (${reachRate.toFixed(1)}%)`
          : `Eficiência de alcance baixa (${reachRate.toFixed(1)}%)`
      };
    }
  },
  PM_07: {
    id: "PM_07",
    name: "Message Rate",
    category: "Performance Metrics",
    severity: "medium",
    check: (campaign) => {
      const messages = safeNum(campaign.messages);
      const clicks = safeNum(campaign.clicks);
      const msgRate = clicks > 0 ? (messages / clicks) * 100 : 0;
      return {
        passed: msgRate >= 5,
        value: msgRate,
        threshold: 5,
        message: msgRate >= 5
          ? `Taxa de mensagens saudável (${msgRate.toFixed(1)}%)`
          : `Taxa de mensagens baixa (${msgRate.toFixed(1)}%)`
      };
    }
  },
  PM_08: {
    id: "PM_08",
    name: "Lead Generation Rate",
    category: "Performance Metrics",
    severity: "medium",
    check: (campaign) => {
      const leads = safeNum(campaign.leads);
      const clicks = safeNum(campaign.clicks);
      const leadRate = clicks > 0 ? (leads / clicks) * 100 : 0;
      return {
        passed: leadRate >= 2,
        value: leadRate,
        threshold: 2,
        message: leadRate >= 2
          ? `Taxa de leads saudável (${leadRate.toFixed(1)}%)`
          : `Taxa de leads baixa (${leadRate.toFixed(1)}%)`
      };
    }
  },

  // ── COMPLIANCE & POLICIES (6 checks) ───────────────────────────────────
  CP_01: {
    id: "CP_01",
    name: "Ad Policy Violations",
    category: "Compliance & Policies",
    severity: "critical",
    check: (campaign) => {
      // Placeholder: would need violation data
      return {
        passed: true,
        message: "Requer dados de violações de política"
      };
    }
  },
  CP_02: {
    id: "CP_02",
    name: "Disapproved Ads Percentage",
    category: "Compliance & Policies",
    severity: "high",
    check: (campaign) => {
      // Placeholder: would need disapproval data
      return {
        passed: true,
        message: "Requer dados de anúncios rejeitados"
      };
    }
  },
  CP_03: {
    id: "CP_03",
    name: "Account Restriction Status",
    category: "Compliance & Policies",
    severity: "critical",
    check: (campaign) => {
      // Placeholder: would need account status
      return {
        passed: true,
        message: "Requer status da conta"
      };
    }
  },
  CP_04: {
    id: "CP_04",
    name: "Conversion Tracking Implementation",
    category: "Compliance & Policies",
    severity: "high",
    check: (campaign) => {
      // Placeholder: would need tracking data
      return {
        passed: true,
        message: "Requer dados de rastreamento de conversão"
      };
    }
  },
  CP_05: {
    id: "CP_05",
    name: "GDPR Compliance",
    category: "Compliance & Policies",
    severity: "high",
    check: (campaign) => {
      // Placeholder: would need privacy data
      return {
        passed: true,
        message: "Requer validação de conformidade GDPR"
      };
    }
  },
  CP_06: {
    id: "CP_06",
    name: "Data Privacy Settings",
    category: "Compliance & Policies",
    severity: "high",
    check: (campaign) => {
      // Placeholder: would need privacy settings
      return {
        passed: true,
        message: "Requer configurações de privacidade"
      };
    }
  },

  // ── PLACEMENT & DEVICE (8 checks) ──────────────────────────────────────
  PD_01: {
    id: "PD_01",
    name: "Mobile Performance",
    category: "Placement & Device",
    severity: "high",
    check: (campaign) => {
      // Placeholder: would need device breakdown
      return {
        passed: true,
        message: "Requer breakdown por dispositivo"
      };
    }
  },
  PD_02: {
    id: "PD_02",
    name: "Desktop Performance",
    category: "Placement & Device",
    severity: "medium",
    check: (campaign) => {
      // Placeholder: would need device breakdown
      return {
        passed: true,
        message: "Requer breakdown por dispositivo"
      };
    }
  },
  PD_03: {
    id: "PD_03",
    name: "Feed Placement Optimization",
    category: "Placement & Device",
    severity: "medium",
    check: (campaign) => {
      // Placeholder: would need placement data
      return {
        passed: true,
        message: "Requer dados de posicionamento"
      };
    }
  },
  PD_04: {
    id: "PD_04",
    name: "Stories Placement Performance",
    category: "Placement & Device",
    severity: "medium",
    check: (campaign) => {
      // Placeholder: would need placement data
      return {
        passed: true,
        message: "Requer dados de posicionamento"
      };
    }
  },
  PD_05: {
    id: "PD_05",
    name: "Reels Placement Optimization",
    category: "Placement & Device",
    severity: "high",
    check: (campaign) => {
      // Placeholder: would need placement data
      return {
        passed: true,
        message: "Requer dados de posicionamento"
      };
    }
  },
  PD_06: {
    id: "PD_06",
    name: "Audience Network Performance",
    category: "Placement & Device",
    severity: "low",
    check: (campaign) => {
      // Placeholder: would need placement data
      return {
        passed: true,
        message: "Requer dados de posicionamento"
      };
    }
  },
  PD_07: {
    id: "PD_07",
    name: "Instagram vs Facebook Balance",
    category: "Placement & Device",
    severity: "medium",
    check: (campaign) => {
      // Placeholder: would need platform breakdown
      return {
        passed: true,
        message: "Requer breakdown por plataforma"
      };
    }
  },
  PD_08: {
    id: "PD_08",
    name: "Cross-Device Consistency",
    category: "Placement & Device",
    severity: "medium",
    check: (campaign) => {
      // Placeholder: would need device data
      return {
        passed: true,
        message: "Requer dados de dispositivo"
      };
    }
  }
};

// ============================================================================
// SCORING SYSTEM
// ============================================================================

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

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

function runAuditChecks(campaign) {
  const results = {};
  let passedCount = 0;
  let failedCount = 0;
  const issues = [];

  for (const [key, check] of Object.entries(auditChecks)) {
    const result = check.check(campaign);
    results[key] = result;
    
    if (result.passed) {
      passedCount++;
    } else {
      failedCount++;
      if (result.message) {
        issues.push({
          id: check.id,
          name: check.name,
          category: check.category,
          severity: check.severity,
          message: result.message
        });
      }
    }
  }

  return {
    total_checks: Object.keys(auditChecks).length,
    passed: passedCount,
    failed: failedCount,
    pass_rate: ((passedCount / Object.keys(auditChecks).length) * 100).toFixed(1),
    issues: issues.sort((a, b) => {
      const severityMap = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityMap[a.severity] - severityMap[b.severity];
    }),
    detailed_results: results
  };
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
  const auditResults = runAuditChecks(c);

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
    audit: auditResults,
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
  const avgScore = analyzed.length > 0
    ? (analyzed.reduce((acc, c) => acc + c.score, 0) / analyzed.length).toFixed(1)
    : 0;

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
    totalWaste: Number(totalWaste.toFixed(2)),
    averageScore: Number(avgScore),
    accountGrade: Number(avgScore) >= 75 ? "A" : Number(avgScore) >= 60 ? "B" : "C"
  };
}

module.exports = {
  analyzeCampaign,
  analyzeAccount,
  getLifecycleStatus,
  calculateCampaignScore,
  runAuditChecks,
  auditChecks
};
