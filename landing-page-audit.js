// landing-page-audit.js
// Landing Page Audit Module for Meta Ads Analyzer
// Analyzes landing pages for conversion optimization

const axios = require("axios");

// ============================================================================
// LANDING PAGE AUDIT CHECKS
// ============================================================================

const landingPageChecks = {
  // ── PERFORMANCE (5 checks) ─────────────────────────────────────────────
  PERF_01: {
    id: "PERF_01",
    name: "Mobile LCP (Largest Contentful Paint)",
    category: "Performance",
    severity: "high",
    description: "LCP should be < 2.5s on mobile",
    check: async (metrics) => {
      const lcp = metrics.lcp_ms || 0;
      return {
        passed: lcp < 2500,
        value: lcp,
        threshold: 2500,
        message: lcp < 2500
          ? `LCP otimizado (${lcp}ms < 2500ms)`
          : `LCP lento (${lcp}ms > 2500ms) - Impacta conversão`
      };
    }
  },
  PERF_02: {
    id: "PERF_02",
    name: "CLS (Cumulative Layout Shift)",
    category: "Performance",
    severity: "high",
    description: "CLS should be < 0.1",
    check: async (metrics) => {
      const cls = metrics.cls || 0;
      return {
        passed: cls < 0.1,
        value: cls,
        threshold: 0.1,
        message: cls < 0.1
          ? `CLS saudável (${cls} < 0.1)`
          : `CLS alto (${cls} > 0.1) - Usuários abandonam página`
      };
    }
  },
  PERF_03: {
    id: "PERF_03",
    name: "TTFB (Time to First Byte)",
    category: "Performance",
    severity: "medium",
    description: "TTFB should be < 600ms",
    check: async (metrics) => {
      const ttfb = metrics.ttfb_ms || 0;
      return {
        passed: ttfb < 600,
        value: ttfb,
        threshold: 600,
        message: ttfb < 600
          ? `TTFB rápido (${ttfb}ms < 600ms)`
          : `TTFB lento (${ttfb}ms > 600ms) - Servidor lento`
      };
    }
  },
  PERF_04: {
    id: "PERF_04",
    name: "DOM Content Loaded",
    category: "Performance",
    severity: "medium",
    description: "DCL should be < 2s",
    check: async (metrics) => {
      const dcl = metrics.dom_content_loaded_ms || 0;
      return {
        passed: dcl < 2000,
        value: dcl,
        threshold: 2000,
        message: dcl < 2000
          ? `DCL rápido (${dcl}ms < 2000ms)`
          : `DCL lento (${dcl}ms > 2000ms)`
      };
    }
  },
  PERF_05: {
    id: "PERF_05",
    name: "Page Size",
    category: "Performance",
    severity: "medium",
    description: "Page size should be < 3MB",
    check: async (metrics) => {
      const pageSize = metrics.page_size_mb || 0;
      return {
        passed: pageSize < 3,
        value: pageSize,
        threshold: 3,
        message: pageSize < 3
          ? `Tamanho otimizado (${pageSize}MB < 3MB)`
          : `Página pesada (${pageSize}MB > 3MB) - Reduz conversão em 7% por segundo`
      };
    }
  },

  // ── CONVERSION OPTIMIZATION (6 checks) ─────────────────────────────────
  CONV_01: {
    id: "CONV_01",
    name: "CTA Above Fold",
    category: "Conversion Optimization",
    severity: "high",
    description: "Primary CTA should be visible without scrolling",
    check: async (metrics) => {
      const ctaAboveFold = metrics.cta_above_fold || false;
      return {
        passed: ctaAboveFold,
        value: ctaAboveFold,
        message: ctaAboveFold
          ? "CTA visível acima da dobra - Bom!"
          : "CTA abaixo da dobra - Reduz conversão em até 30%"
      };
    }
  },
  CONV_02: {
    id: "CONV_02",
    name: "Form Friction",
    category: "Conversion Optimization",
    severity: "high",
    description: "Form should have 3-5 fields max",
    check: async (metrics) => {
      const formFields = metrics.form_fields || 0;
      const optimalRange = { min: 3, max: 5 };
      return {
        passed: formFields >= optimalRange.min && formFields <= optimalRange.max,
        value: formFields,
        threshold: `${optimalRange.min}-${optimalRange.max}`,
        message: formFields >= optimalRange.min && formFields <= optimalRange.max
          ? `Formulário otimizado (${formFields} campos)`
          : formFields < optimalRange.min
            ? `Formulário muito curto (${formFields} campos) - Faltam dados`
            : `Formulário muito longo (${formFields} campos) - Reduz conversão em ${(formFields - 5) * 10}%`
      };
    }
  },
  CONV_03: {
    id: "CONV_03",
    name: "Form Presence",
    category: "Conversion Optimization",
    severity: "high",
    description: "Landing page should have a conversion form",
    check: async (metrics) => {
      const formPresent = metrics.form_present || false;
      return {
        passed: formPresent,
        value: formPresent,
        message: formPresent
          ? "Formulário presente - Bom!"
          : "Sem formulário - Impossível capturar leads"
      };
    }
  },
  CONV_04: {
    id: "CONV_04",
    name: "Phone Number Visibility",
    category: "Conversion Optimization",
    severity: "medium",
    description: "Phone number should be visible for mobile users",
    check: async (metrics) => {
      const phoneVisible = metrics.phone_number || false;
      return {
        passed: phoneVisible,
        value: phoneVisible,
        message: phoneVisible
          ? "Telefone visível - Facilita contato"
          : "Telefone não visível - Reduz leads em 15-20%"
      };
    }
  },
  CONV_05: {
    id: "CONV_05",
    name: "Chat Widget",
    category: "Conversion Optimization",
    severity: "low",
    description: "Chat widget for real-time support",
    check: async (metrics) => {
      const chatPresent = metrics.chat_widget || false;
      return {
        passed: chatPresent,
        value: chatPresent,
        message: chatPresent
          ? "Chat widget presente - Aumenta conversão em 5-10%"
          : "Sem chat widget - Oportunidade perdida"
      };
    }
  },
  CONV_06: {
    id: "CONV_06",
    name: "CTA Button Clarity",
    category: "Conversion Optimization",
    severity: "high",
    description: "CTA button should be clear and contrasting",
    check: async (metrics) => {
      const ctaClarity = metrics.cta_clarity || "unknown";
      return {
        passed: ctaClarity === "high",
        value: ctaClarity,
        message: ctaClarity === "high"
          ? "CTA botão claro e contrastante"
          : "CTA botão pouco visível - Reduz cliques"
      };
    }
  },

  // ── TRUST & CREDIBILITY (5 checks) ─────────────────────────────────────
  TRUST_01: {
    id: "TRUST_01",
    name: "Testimonials",
    category: "Trust & Credibility",
    severity: "medium",
    description: "Page should include customer testimonials",
    check: async (metrics) => {
      const testimonials = metrics.testimonials || false;
      return {
        passed: testimonials,
        value: testimonials,
        message: testimonials
          ? "Depoimentos presentes - Aumenta confiança"
          : "Sem depoimentos - Oportunidade de aumentar confiança em 25%"
      };
    }
  },
  TRUST_02: {
    id: "TRUST_02",
    name: "Trust Badges",
    category: "Trust & Credibility",
    severity: "medium",
    description: "Page should display trust badges (SSL, security, etc)",
    check: async (metrics) => {
      const trustBadges = metrics.trust_badges || false;
      return {
        passed: trustBadges,
        value: trustBadges,
        message: trustBadges
          ? "Badges de confiança presentes"
          : "Sem badges - Adicione SSL, certificados, prêmios"
      };
    }
  },
  TRUST_03: {
    id: "TRUST_03",
    name: "Reviews Schema",
    category: "Trust & Credibility",
    severity: "medium",
    description: "Page should have reviews schema markup",
    check: async (metrics) => {
      const reviewsSchema = metrics.reviews_schema || false;
      return {
        passed: reviewsSchema,
        value: reviewsSchema,
        message: reviewsSchema
          ? "Schema de avaliações presente"
          : "Sem schema - Adicione avaliações estruturadas"
      };
    }
  },
  TRUST_04: {
    id: "TRUST_04",
    name: "Company Info",
    category: "Trust & Credibility",
    severity: "medium",
    description: "Page should display company information",
    check: async (metrics) => {
      const companyInfo = metrics.company_info || false;
      return {
        passed: companyInfo,
        value: companyInfo,
        message: companyInfo
          ? "Informações da empresa visíveis"
          : "Sem informações - Adicione sobre, endereço, contato"
      };
    }
  },
  TRUST_05: {
    id: "TRUST_05",
    name: "Money-Back Guarantee",
    category: "Trust & Credibility",
    severity: "low",
    description: "Page should mention money-back guarantee",
    check: async (metrics) => {
      const guarantee = metrics.guarantee || false;
      return {
        passed: guarantee,
        value: guarantee,
        message: guarantee
          ? "Garantia mencionada - Aumenta confiança"
          : "Sem garantia - Oportunidade de aumentar conversão"
      };
    }
  },

  // ── MOBILE OPTIMIZATION (4 checks) ────────────────────────────────────
  MOBILE_01: {
    id: "MOBILE_01",
    name: "Viewport Meta Tag",
    category: "Mobile Optimization",
    severity: "high",
    description: "Page should have viewport meta tag",
    check: async (metrics) => {
      const viewportMeta = metrics.viewport_meta || false;
      return {
        passed: viewportMeta,
        value: viewportMeta,
        message: viewportMeta
          ? "Viewport meta tag presente"
          : "Sem viewport - Página não responsiva em mobile"
      };
    }
  },
  MOBILE_02: {
    id: "MOBILE_02",
    name: "Horizontal Scroll",
    category: "Mobile Optimization",
    severity: "high",
    description: "Page should not have horizontal scroll",
    check: async (metrics) => {
      const noHorizontalScroll = !metrics.horizontal_scroll;
      return {
        passed: noHorizontalScroll,
        value: !metrics.horizontal_scroll,
        message: noHorizontalScroll
          ? "Sem scroll horizontal - Bom!"
          : "Scroll horizontal detectado - Reduz conversão em 20%"
      };
    }
  },
  MOBILE_03: {
    id: "MOBILE_03",
    name: "Font Readability",
    category: "Mobile Optimization",
    severity: "medium",
    description: "Font size should be readable on mobile",
    check: async (metrics) => {
      const fontReadable = metrics.font_readable || false;
      return {
        passed: fontReadable,
        value: fontReadable,
        message: fontReadable
          ? "Fonte legível em mobile"
          : "Fonte pequena - Aumente para mínimo 16px"
      };
    }
  },
  MOBILE_04: {
    id: "MOBILE_04",
    name: "Touch-Friendly Buttons",
    category: "Mobile Optimization",
    severity: "medium",
    description: "Buttons should be touch-friendly (min 44x44px)",
    check: async (metrics) => {
      const touchFriendly = metrics.touch_friendly || false;
      return {
        passed: touchFriendly,
        value: touchFriendly,
        message: touchFriendly
          ? "Botões otimizados para toque"
          : "Botões muito pequenos - Aumente para 44x44px mínimo"
      };
    }
  },

  // ── SEO & SCHEMA (3 checks) ────────────────────────────────────────────
  SEO_01: {
    id: "SEO_01",
    name: "Meta Description",
    category: "SEO & Schema",
    severity: "low",
    description: "Page should have meta description",
    check: async (metrics) => {
      const metaDesc = metrics.meta_description || "";
      return {
        passed: metaDesc.length > 0,
        value: metaDesc.length,
        message: metaDesc.length > 0
          ? `Meta description presente (${metaDesc.length} caracteres)`
          : "Sem meta description - Adicione para melhorar CTR em search"
      };
    }
  },
  SEO_02: {
    id: "SEO_02",
    name: "H1 Tag",
    category: "SEO & Schema",
    severity: "medium",
    description: "Page should have exactly one H1 tag",
    check: async (metrics) => {
      const h1Count = metrics.h1_count || 0;
      return {
        passed: h1Count === 1,
        value: h1Count,
        message: h1Count === 1
          ? "H1 tag presente e único"
          : h1Count === 0
            ? "Sem H1 tag - Adicione título principal"
            : `Múltiplos H1 tags (${h1Count}) - Mantenha apenas um`
      };
    }
  },
  SEO_03: {
    id: "SEO_03",
    name: "Schema Markup",
    category: "SEO & Schema",
    severity: "medium",
    description: "Page should have structured data markup",
    check: async (metrics) => {
      const schemaTypes = metrics.schema_types || [];
      return {
        passed: schemaTypes.length > 0,
        value: schemaTypes.length,
        message: schemaTypes.length > 0
          ? `Schema markup presente (${schemaTypes.join(", ")})`
          : "Sem schema markup - Adicione para rich snippets"
      };
    }
  }
};

// ============================================================================
// AUDIT FUNCTIONS
// ============================================================================

async function runLandingPageAudit(pageMetrics) {
  const results = {};
  let passedCount = 0;
  let failedCount = 0;
  const issues = [];
  const categoryScores = {};

  for (const [key, check] of Object.entries(landingPageChecks)) {
    const result = await check.check(pageMetrics);
    results[key] = result;
    
    const category = check.category;
    if (!categoryScores[category]) {
      categoryScores[category] = { passed: 0, total: 0 };
    }
    categoryScores[category].total++;
    
    if (result.passed) {
      passedCount++;
      categoryScores[category].passed++;
    } else {
      failedCount++;
      if (result.message) {
        issues.push({
          id: check.id,
          name: check.name,
          category: check.category,
          severity: check.severity,
          message: result.message,
          recommendation: getRecommendation(check.id, result)
        });
      }
    }
  }

  // Calculate category scores
  const categorySummary = {};
  for (const [category, scores] of Object.entries(categoryScores)) {
    categorySummary[category] = {
      passed: scores.passed,
      total: scores.total,
      percentage: Math.round((scores.passed / scores.total) * 100)
    };
  }

  // Calculate overall score
  const overallScore = Math.round((passedCount / Object.keys(landingPageChecks).length) * 100);
  const grade = overallScore >= 80 ? "A" : overallScore >= 60 ? "B" : "C";

  return {
    overall_score: overallScore,
    grade,
    total_checks: Object.keys(landingPageChecks).length,
    passed: passedCount,
    failed: failedCount,
    pass_rate: ((passedCount / Object.keys(landingPageChecks).length) * 100).toFixed(1),
    category_summary: categorySummary,
    issues: issues.sort((a, b) => {
      const severityMap = { high: 0, medium: 1, low: 2 };
      return severityMap[a.severity] - severityMap[b.severity];
    }),
    detailed_results: results,
    impact_on_conversion: calculateConversionImpact(issues)
  };
}

function getRecommendation(checkId, result) {
  const recommendations = {
    PERF_01: "Otimize imagens, use lazy loading, minimize CSS/JS",
    PERF_02: "Evite layout shifts usando aspect-ratio nas imagens",
    PERF_03: "Use CDN, otimize servidor, cache de browser",
    PERF_04: "Minimize CSS/JS, adie scripts não-críticos",
    PERF_05: "Comprima imagens, remova scripts desnecessários",
    CONV_01: "Mova CTA para acima da dobra (primeira tela)",
    CONV_02: "Reduza campos do formulário para 3-5 máximo",
    CONV_03: "Adicione formulário de captura de leads",
    CONV_04: "Adicione telefone clicável em mobile",
    CONV_05: "Implemente chat widget (Drift, Intercom, etc)",
    CONV_06: "Use cor contrastante, aumentar tamanho do botão",
    TRUST_01: "Adicione 3-5 depoimentos de clientes",
    TRUST_02: "Adicione badges SSL, prêmios, certificações",
    TRUST_03: "Implemente Google Reviews ou similar",
    TRUST_04: "Adicione seção 'Sobre', endereço, contato",
    TRUST_05: "Mencione garantia de 30 dias ou similar",
    MOBILE_01: "Adicione <meta name='viewport' content='width=device-width'>",
    MOBILE_02: "Verifique CSS media queries, remova overflow-x",
    MOBILE_03: "Aumente font-size para mínimo 16px",
    MOBILE_04: "Aumente botões para mínimo 44x44 pixels",
    SEO_01: "Escreva meta description com 150-160 caracteres",
    SEO_02: "Adicione um único H1 tag com palavra-chave",
    SEO_03: "Implemente schema.org markup (Organization, Product, etc)"
  };
  
  return recommendations[checkId] || "Revise este elemento";
}

function calculateConversionImpact(issues) {
  let estimatedImpact = 0;
  const impactMap = {
    high: 15,
    medium: 5,
    low: 2
  };

  issues.forEach(issue => {
    estimatedImpact += impactMap[issue.severity] || 0;
  });

  return {
    estimated_cvr_loss: Math.min(estimatedImpact, 80),
    message: estimatedImpact > 40
      ? "Problemas críticos detectados - Conversão pode estar 40%+ abaixo do potencial"
      : estimatedImpact > 20
        ? "Problemas moderados - Conversão pode estar 20-40% abaixo do potencial"
        : "Poucos problemas - Landing page está bem otimizada"
  };
}

// ============================================================================
// CORRELATION ANALYSIS
// ============================================================================

function correlateWithCampaignPerformance(landingAudit, campaignMetrics) {
  const correlation = {
    landing_page_score: landingAudit.overall_score,
    campaign_ctr: campaignMetrics.ctr || 0,
    campaign_cvr: campaignMetrics.cvr || 0,
    campaign_roas: campaignMetrics.roas || 0,
    analysis: {}
  };

  // Analyze correlations
  if (landingAudit.overall_score < 60 && campaignMetrics.cvr < 1) {
    correlation.analysis.primary_issue = "Landing page quality is likely the main conversion bottleneck";
    correlation.analysis.recommendation = "Fix landing page issues before scaling ad spend";
  } else if (landingAudit.overall_score > 80 && campaignMetrics.cvr < 1) {
    correlation.analysis.primary_issue = "Landing page is good, but ad targeting/creative may be weak";
    correlation.analysis.recommendation = "Focus on improving ad creative and audience targeting";
  } else if (landingAudit.overall_score > 80 && campaignMetrics.cvr > 2) {
    correlation.analysis.primary_issue = "Both landing page and campaign are performing well";
    correlation.analysis.recommendation = "Consider scaling budget to maximize ROI";
  }

  return correlation;
}

module.exports = {
  landingPageChecks,
  runLandingPageAudit,
  correlateWithCampaignPerformance,
  getRecommendation,
  calculateConversionImpact
};
