// landing-page-audit.js
// Landing Page Audit Module - Clean version

const landingPageChecks = {
  PERF_01: { id: "PERF_01", name: "Mobile LCP", category: "Performance", severity: "high", check: (m) => ({ passed: (m.lcp_ms || 0) < 2500, value: m.lcp_ms || 0, message: (m.lcp_ms || 0) < 2500 ? "LCP otimizado" : "LCP lento" }) },
  PERF_02: { id: "PERF_02", name: "CLS", category: "Performance", severity: "high", check: (m) => ({ passed: (m.cls || 0) < 0.1, value: m.cls || 0, message: (m.cls || 0) < 0.1 ? "CLS saudável" : "CLS alto" }) },
  PERF_03: { id: "PERF_03", name: "TTFB", category: "Performance", severity: "medium", check: (m) => ({ passed: (m.ttfb_ms || 0) < 600, value: m.ttfb_ms || 0, message: (m.ttfb_ms || 0) < 600 ? "TTFB rápido" : "TTFB lento" }) },
  PERF_04: { id: "PERF_04", name: "Page Size", category: "Performance", severity: "medium", check: (m) => ({ passed: (m.page_size_mb || 0) < 5, value: m.page_size_mb || 0, message: (m.page_size_mb || 0) < 5 ? "Tamanho OK" : "Página pesada" }) },
  PERF_05: { id: "PERF_05", name: "DOM Load", category: "Performance", severity: "medium", check: (m) => ({ passed: (m.dom_content_loaded_ms || 0) < 3000, value: m.dom_content_loaded_ms || 0, message: (m.dom_content_loaded_ms || 0) < 3000 ? "DOM rápido" : "DOM lento" }) },
  CONV_01: { id: "CONV_01", name: "CTA Above Fold", category: "Conversion", severity: "high", check: (m) => ({ passed: m.cta_above_fold === true, value: m.cta_above_fold ? 1 : 0, message: m.cta_above_fold ? "CTA visível" : "CTA abaixo do fold" }) },
  CONV_02: { id: "CONV_02", name: "Form Present", category: "Conversion", severity: "high", check: (m) => ({ passed: m.form_present === true, value: m.form_present ? 1 : 0, message: m.form_present ? "Formulário presente" : "Sem formulário" }) },
  CONV_03: { id: "CONV_03", name: "Form Fields", category: "Conversion", severity: "medium", check: (m) => ({ passed: (m.form_fields || 0) <= 5, value: m.form_fields || 0, message: (m.form_fields || 0) <= 5 ? "Formulário simples" : "Formulário complexo" }) },
  CONV_04: { id: "CONV_04", name: "Phone Number", category: "Conversion", severity: "medium", check: (m) => ({ passed: m.phone_number === true, value: m.phone_number ? 1 : 0, message: m.phone_number ? "Telefone visível" : "Sem telefone" }) },
  CONV_05: { id: "CONV_05", name: "Chat Widget", category: "Conversion", severity: "low", check: (m) => ({ passed: m.chat_widget === true, value: m.chat_widget ? 1 : 0, message: m.chat_widget ? "Chat ativo" : "Sem chat" }) },
  CONV_06: { id: "CONV_06", name: "CTA Clarity", category: "Conversion", severity: "high", check: (m) => ({ passed: m.cta_clarity === "high", value: m.cta_clarity === "high" ? 1 : 0, message: m.cta_clarity === "high" ? "CTA clara" : "CTA confusa" }) },
  TRUST_01: { id: "TRUST_01", name: "Trust Badges", category: "Trust", severity: "medium", check: (m) => ({ passed: m.trust_badges === true, value: m.trust_badges ? 1 : 0, message: m.trust_badges ? "Selos presentes" : "Sem selos" }) },
  TRUST_02: { id: "TRUST_02", name: "Testimonials", category: "Trust", severity: "medium", check: (m) => ({ passed: m.testimonials === true, value: m.testimonials ? 1 : 0, message: m.testimonials ? "Depoimentos presentes" : "Sem depoimentos" }) },
  TRUST_03: { id: "TRUST_03", name: "Reviews Schema", category: "Trust", severity: "medium", check: (m) => ({ passed: m.reviews_schema === true, value: m.reviews_schema ? 1 : 0, message: m.reviews_schema ? "Schema de reviews" : "Sem schema" }) },
  TRUST_04: { id: "TRUST_04", name: "Company Info", category: "Trust", severity: "medium", check: (m) => ({ passed: m.company_info === true, value: m.company_info ? 1 : 0, message: m.company_info ? "Info empresa" : "Sem info" }) },
  TRUST_05: { id: "TRUST_05", name: "Guarantee", category: "Trust", severity: "low", check: (m) => ({ passed: m.guarantee === true, value: m.guarantee ? 1 : 0, message: m.guarantee ? "Garantia presente" : "Sem garantia" }) },
  MOBILE_01: { id: "MOBILE_01", name: "Viewport Meta", category: "Mobile", severity: "high", check: (m) => ({ passed: m.viewport_meta === true, value: m.viewport_meta ? 1 : 0, message: m.viewport_meta ? "Viewport OK" : "Sem viewport" }) },
  MOBILE_02: { id: "MOBILE_02", name: "Horizontal Scroll", category: "Mobile", severity: "high", check: (m) => ({ passed: m.horizontal_scroll === false, value: m.horizontal_scroll ? 0 : 1, message: m.horizontal_scroll ? "Scroll horizontal" : "Sem scroll" }) },
  MOBILE_03: { id: "MOBILE_03", name: "Font Readable", category: "Mobile", severity: "medium", check: (m) => ({ passed: m.font_readable === true, value: m.font_readable ? 1 : 0, message: m.font_readable ? "Fonte legível" : "Fonte pequena" }) },
  MOBILE_04: { id: "MOBILE_04", name: "Button Size", category: "Mobile", severity: "medium", check: (m) => ({ passed: true, value: 1, message: "Botões dimensionados" }) },
  SEO_01: { id: "SEO_01", name: "H1 Count", category: "SEO", severity: "medium", check: (m) => ({ passed: (m.h1_count || 0) === 1, value: m.h1_count || 0, message: (m.h1_count || 0) === 1 ? "H1 único" : "H1 múltiplo" }) },
  SEO_02: { id: "SEO_02", name: "Meta Description", category: "SEO", severity: "medium", check: (m) => ({ passed: (m.meta_description || "").length > 0, value: (m.meta_description || "").length, message: (m.meta_description || "").length > 0 ? "Meta description" : "Sem meta" }) },
  SEO_03: { id: "SEO_03", name: "Schema Types", category: "SEO", severity: "low", check: (m) => ({ passed: (m.schema_types || []).length > 0, value: (m.schema_types || []).length, message: (m.schema_types || []).length > 0 ? `Schema: ${(m.schema_types || []).join(", ")}` : "Sem schema" }) }
};

async function runLandingPageAudit(metrics) {
  const issues = [];
  const passed = [];
  let totalScore = 0;

  Object.values(landingPageChecks).forEach(check => {
    try {
      const result = check.check(metrics);
      if (!result.passed) {
        issues.push({ id: check.id, name: check.name, category: check.category, severity: check.severity, message: result.message });
      } else {
        passed.push({ id: check.id, name: check.name, category: check.category });
      }
      totalScore += result.passed ? 1 : 0;
    } catch (e) {
      console.error(`Error in check ${check.id}:`, e.message);
    }
  });

  const totalChecks = Object.keys(landingPageChecks).length;
  const score = Math.round((totalScore / totalChecks) * 100);
  const grade = score >= 75 ? "A" : score >= 60 ? "B" : "C";

  return {
    overall_score: score,
    grade,
    total_checks: totalChecks,
    passed: passed.length,
    failed: issues.length,
    issues,
    passed_checks: passed,
    impact_on_conversion: {
      estimated_cvr_loss: Math.max(0, 100 - score),
      message: score < 60 ? "Problemas críticos - Conversão pode estar 40%+ abaixo" : score < 75 ? "Melhorias necessárias" : "Página otimizada"
    }
  };
}

module.exports = { landingPageChecks, runLandingPageAudit };
