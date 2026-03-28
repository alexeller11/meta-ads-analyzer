// benchmarks-v2.js
// Expanded Meta Ads Benchmarks with 20+ metrics per industry
// Maintains backward compatibility with existing code

const benchmarks = {
  // ── GERAL ──────────────────────────────────────────────────────────────
  Geral: {
    // Métricas básicas
    average_cpc: 1.50,
    average_ctr: 0.025,
    average_cvr: 0.020,
    average_roas: 2.0,
    typical_cpa: 100.00,

    // Métricas de campanha
    recommended_daily_budget: 50,
    min_budget_for_learning: 20,
    optimal_frequency: 2.5,
    max_frequency: 3.5,

    // Métricas de criativo
    creative_fatigue_threshold: 3.0,
    optimal_video_length: "15-30s",
    recommended_text_overlay: "< 20%",
    min_creative_count: 3,

    // Métricas de público
    lookalike_similarity: "1-5%",
    interest_targeting_breadth: "medium",
    audience_size_range: "50k-500k",
    max_audience_overlap: 20,

    // Recomendações
    recommended_platforms: ["facebook", "instagram"],
    recommended_placements: ["feed", "stories"],
    recommended_formats: ["image", "carousel", "video"],
    recommended_objective: "conversions",

    // Sazonalidade
    peak_months: ["nov", "dec"],
    low_months: ["aug", "sep"],
    
    // Thresholds (backward compatibility)
    minRoas: 2.0,
    minCtr: 1.5,
    maxCpm: 10,
    minConnectRate: 70,
    maxFrequency: 3.5
  },

  // ── E-COMMERCE ─────────────────────────────────────────────────────────
  "E-commerce": {
    average_cpc: 0.80,
    average_ctr: 0.035,
    average_cvr: 0.030,
    average_roas: 2.5,
    typical_cpa: 45.00,

    recommended_daily_budget: 100,
    min_budget_for_learning: 50,
    optimal_frequency: 2.0,
    max_frequency: 3.0,

    creative_fatigue_threshold: 2.5,
    optimal_video_length: "10-20s",
    recommended_text_overlay: "< 15%",
    min_creative_count: 5,

    lookalike_similarity: "1-3%",
    interest_targeting_breadth: "broad",
    audience_size_range: "100k-1M",
    max_audience_overlap: 15,

    recommended_platforms: ["facebook", "instagram", "audience_network"],
    recommended_placements: ["feed", "reels", "stories"],
    recommended_formats: ["carousel", "video", "collection"],
    recommended_objective: "conversions",

    peak_months: ["nov", "dec", "jan"],
    low_months: ["feb", "aug"],
    
    minRoas: 2.5,
    minCtr: 2.0,
    maxCpm: 8,
    minConnectRate: 75,
    maxFrequency: 3.0
  },

  // ── INFOPRODUTOS ───────────────────────────────────────────────────────
  "Infoprodutos": {
    average_cpc: 2.00,
    average_ctr: 0.040,
    average_cvr: 0.025,
    average_roas: 3.0,
    typical_cpa: 120.00,

    recommended_daily_budget: 75,
    min_budget_for_learning: 30,
    optimal_frequency: 2.5,
    max_frequency: 3.5,

    creative_fatigue_threshold: 3.0,
    optimal_video_length: "20-40s",
    recommended_text_overlay: "< 25%",
    min_creative_count: 4,

    lookalike_similarity: "1-5%",
    interest_targeting_breadth: "medium",
    audience_size_range: "50k-300k",
    max_audience_overlap: 20,

    recommended_platforms: ["facebook", "instagram"],
    recommended_placements: ["feed", "stories"],
    recommended_formats: ["video", "carousel"],
    recommended_objective: "conversions",

    peak_months: ["jan", "sep"],
    low_months: ["dec", "aug"],
    
    minRoas: 3.0,
    minCtr: 2.5,
    maxCpm: 12,
    minConnectRate: 70,
    maxFrequency: 3.5
  },

  // ── NEGÓCIOS LOCAIS ────────────────────────────────────────────────────
  "Negócios Locais": {
    average_cpc: 1.20,
    average_ctr: 0.030,
    average_cvr: 0.018,
    average_roas: 2.0,
    typical_cpa: 80.00,

    recommended_daily_budget: 30,
    min_budget_for_learning: 15,
    optimal_frequency: 2.0,
    max_frequency: 3.0,

    creative_fatigue_threshold: 2.5,
    optimal_video_length: "15-30s",
    recommended_text_overlay: "< 20%",
    min_creative_count: 3,

    lookalike_similarity: "1-5%",
    interest_targeting_breadth: "local",
    audience_size_range: "10k-100k",
    max_audience_overlap: 25,

    recommended_platforms: ["facebook", "instagram"],
    recommended_placements: ["feed", "local_awareness"],
    recommended_formats: ["image", "video"],
    recommended_objective: "leads",

    peak_months: ["may", "dec"],
    low_months: ["aug", "sep"],
    
    minRoas: 2.0,
    minCtr: 1.5,
    maxCpm: 6,
    minConnectRate: 65,
    maxFrequency: 3.0
  },

  // ── SERVIÇOS B2B ───────────────────────────────────────────────────────
  "Serviços B2B": {
    average_cpc: 3.50,
    average_ctr: 0.020,
    average_cvr: 0.015,
    average_roas: 3.5,
    typical_cpa: 200.00,

    recommended_daily_budget: 150,
    min_budget_for_learning: 75,
    optimal_frequency: 3.0,
    max_frequency: 4.0,

    creative_fatigue_threshold: 3.5,
    optimal_video_length: "30-60s",
    recommended_text_overlay: "< 30%",
    min_creative_count: 4,

    lookalike_similarity: "1-5%",
    interest_targeting_breadth: "narrow",
    audience_size_range: "10k-100k",
    max_audience_overlap: 30,

    recommended_platforms: ["facebook", "linkedin"],
    recommended_placements: ["feed", "stories"],
    recommended_formats: ["video", "carousel"],
    recommended_objective: "leads",

    peak_months: ["jan", "sep"],
    low_months: ["jul", "dec"],
    
    minRoas: 3.5,
    minCtr: 1.5,
    maxCpm: 15,
    minConnectRate: 80,
    maxFrequency: 4.0
  },

  // ── IMOBILIÁRIO ────────────────────────────────────────────────────────
  "Imobiliário": {
    average_cpc: 2.50,
    average_ctr: 0.025,
    average_cvr: 0.012,
    average_roas: 2.5,
    typical_cpa: 150.00,

    recommended_daily_budget: 100,
    min_budget_for_learning: 50,
    optimal_frequency: 2.5,
    max_frequency: 3.5,

    creative_fatigue_threshold: 3.0,
    optimal_video_length: "20-45s",
    recommended_text_overlay: "< 20%",
    min_creative_count: 5,

    lookalike_similarity: "1-5%",
    interest_targeting_breadth: "medium",
    audience_size_range: "50k-300k",
    max_audience_overlap: 20,

    recommended_platforms: ["facebook", "instagram"],
    recommended_placements: ["feed", "stories", "reels"],
    recommended_formats: ["carousel", "video", "collection"],
    recommended_objective: "leads",

    peak_months: ["mar", "sep"],
    low_months: ["aug", "dec"],
    
    minRoas: 2.5,
    minCtr: 1.5,
    maxCpm: 10,
    minConnectRate: 70,
    maxFrequency: 3.5
  },

  // ── SAÚDE & WELLNESS ───────────────────────────────────────────────────
  "Saúde & Wellness": {
    average_cpc: 1.80,
    average_ctr: 0.032,
    average_cvr: 0.022,
    average_roas: 2.8,
    typical_cpa: 110.00,

    recommended_daily_budget: 60,
    min_budget_for_learning: 25,
    optimal_frequency: 2.5,
    max_frequency: 3.5,

    creative_fatigue_threshold: 2.8,
    optimal_video_length: "15-30s",
    recommended_text_overlay: "< 20%",
    min_creative_count: 4,

    lookalike_similarity: "1-5%",
    interest_targeting_breadth: "medium",
    audience_size_range: "50k-300k",
    max_audience_overlap: 20,

    recommended_platforms: ["facebook", "instagram"],
    recommended_placements: ["feed", "stories", "reels"],
    recommended_formats: ["video", "carousel", "image"],
    recommended_objective: "conversions",

    peak_months: ["jan", "sep"],
    low_months: ["jul", "dec"],
    
    minRoas: 2.8,
    minCtr: 2.0,
    maxCpm: 9,
    minConnectRate: 72,
    maxFrequency: 3.5
  },

  // ── EDUCAÇÃO ───────────────────────────────────────────────────────────
  "Educação": {
    average_cpc: 1.50,
    average_ctr: 0.035,
    average_cvr: 0.020,
    average_roas: 2.5,
    typical_cpa: 95.00,

    recommended_daily_budget: 50,
    min_budget_for_learning: 20,
    optimal_frequency: 2.5,
    max_frequency: 3.5,

    creative_fatigue_threshold: 3.0,
    optimal_video_length: "20-40s",
    recommended_text_overlay: "< 25%",
    min_creative_count: 4,

    lookalike_similarity: "1-5%",
    interest_targeting_breadth: "medium",
    audience_size_range: "50k-300k",
    max_audience_overlap: 20,

    recommended_platforms: ["facebook", "instagram"],
    recommended_placements: ["feed", "stories"],
    recommended_formats: ["video", "carousel"],
    recommended_objective: "leads",

    peak_months: ["jan", "aug"],
    low_months: ["dec", "jul"],
    
    minRoas: 2.5,
    minCtr: 2.0,
    maxCpm: 8,
    minConnectRate: 70,
    maxFrequency: 3.5
  },

  // ── MODA & BELEZA ──────────────────────────────────────────────────────
  "Moda & Beleza": {
    average_cpc: 1.00,
    average_ctr: 0.045,
    average_cvr: 0.035,
    average_roas: 2.8,
    typical_cpa: 55.00,

    recommended_daily_budget: 80,
    min_budget_for_learning: 40,
    optimal_frequency: 2.0,
    max_frequency: 3.0,

    creative_fatigue_threshold: 2.5,
    optimal_video_length: "10-20s",
    recommended_text_overlay: "< 15%",
    min_creative_count: 6,

    lookalike_similarity: "1-3%",
    interest_targeting_breadth: "broad",
    audience_size_range: "100k-1M",
    max_audience_overlap: 15,

    recommended_platforms: ["facebook", "instagram", "tiktok"],
    recommended_placements: ["feed", "reels", "stories"],
    recommended_formats: ["video", "carousel", "collection"],
    recommended_objective: "conversions",

    peak_months: ["nov", "dec", "mar"],
    low_months: ["feb", "aug"],
    
    minRoas: 2.8,
    minCtr: 2.5,
    maxCpm: 7,
    minConnectRate: 75,
    maxFrequency: 3.0
  },

  // ── ALIMENTAÇÃO ────────────────────────────────────────────────────────
  "Alimentação": {
    average_cpc: 0.90,
    average_ctr: 0.040,
    average_cvr: 0.028,
    average_roas: 2.5,
    typical_cpa: 50.00,

    recommended_daily_budget: 70,
    min_budget_for_learning: 35,
    optimal_frequency: 2.0,
    max_frequency: 3.0,

    creative_fatigue_threshold: 2.5,
    optimal_video_length: "10-20s",
    recommended_text_overlay: "< 15%",
    min_creative_count: 5,

    lookalike_similarity: "1-3%",
    interest_targeting_breadth: "broad",
    audience_size_range: "100k-500k",
    max_audience_overlap: 15,

    recommended_platforms: ["facebook", "instagram"],
    recommended_placements: ["feed", "reels", "stories"],
    recommended_formats: ["video", "carousel"],
    recommended_objective: "conversions",

    peak_months: ["nov", "dec"],
    low_months: ["feb", "aug"],
    
    minRoas: 2.5,
    minCtr: 2.0,
    maxCpm: 6,
    minConnectRate: 75,
    maxFrequency: 3.0
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getBenchmark(niche) {
  return benchmarks[niche] || benchmarks["Geral"];
}

function compareToBenchmark(niche, metrics) {
  const benchmark = getBenchmark(niche);
  const comparison = {
    niche,
    metrics: {},
    score: 0,
    grade: "C"
  };

  // Compare key metrics
  const metricsToCompare = [
    { key: "roas", benchmark: benchmark.average_roas, direction: "higher" },
    { key: "ctr", benchmark: benchmark.average_ctr * 100, direction: "higher" },
    { key: "cvr", benchmark: benchmark.average_cvr * 100, direction: "higher" },
    { key: "cpc", benchmark: benchmark.average_cpc, direction: "lower" },
    { key: "frequency", benchmark: benchmark.optimal_frequency, direction: "lower" }
  ];

  let scorePoints = 0;
  let maxPoints = 0;

  metricsToCompare.forEach(({ key, benchmark: benchmarkValue, direction }) => {
    const metricValue = metrics[key] || 0;
    const ratio = benchmarkValue > 0 ? metricValue / benchmarkValue : 0;
    
    let points = 0;
    if (direction === "higher") {
      if (ratio >= 1.2) points = 20;
      else if (ratio >= 1.0) points = 15;
      else if (ratio >= 0.8) points = 10;
      else if (ratio >= 0.6) points = 5;
    } else {
      if (ratio <= 0.8) points = 20;
      else if (ratio <= 1.0) points = 15;
      else if (ratio <= 1.2) points = 10;
      else if (ratio <= 1.5) points = 5;
    }
    
    comparison.metrics[key] = {
      value: metricValue,
      benchmark: benchmarkValue,
      ratio: ratio.toFixed(2),
      status: ratio >= 0.9 && ratio <= 1.1 ? "on_target" : ratio > 1.1 ? "above" : "below"
    };
    
    scorePoints += points;
    maxPoints += 20;
  });

  comparison.score = Math.round((scorePoints / maxPoints) * 100);
  comparison.grade = comparison.score >= 75 ? "A" : comparison.score >= 60 ? "B" : "C";

  return comparison;
}

function getRecommendationsByBenchmark(niche, metrics) {
  const benchmark = getBenchmark(niche);
  const recommendations = [];

  // ROAS recommendations
  if (metrics.roas < benchmark.average_roas) {
    recommendations.push({
      priority: "high",
      category: "ROAS",
      message: `ROAS abaixo da meta (${metrics.roas.toFixed(2)}x vs ${benchmark.average_roas}x esperado)`,
      actions: [
        "Revisar qualidade da landing page",
        "Testar novos criativos",
        "Ajustar público-alvo",
        "Aumentar orçamento para otimização"
      ]
    });
  }

  // CTR recommendations
  if (metrics.ctr < benchmark.average_ctr * 100) {
    recommendations.push({
      priority: "high",
      category: "CTR",
      message: `CTR abaixo da meta (${metrics.ctr.toFixed(2)}% vs ${(benchmark.average_ctr * 100).toFixed(2)}% esperado)`,
      actions: [
        "Renovar criativos (fadiga detectada)",
        "Testar diferentes headlines",
        "Otimizar imagens/vídeos",
        "Ajustar copy do anúncio"
      ]
    });
  }

  // Frequency recommendations
  if (metrics.frequency > benchmark.max_frequency) {
    recommendations.push({
      priority: "high",
      category: "Frequency",
      message: `Frequência alta (${metrics.frequency.toFixed(2)} vs ${benchmark.max_frequency} máximo)`,
      actions: [
        "Pausar campanha temporariamente",
        "Expandir público-alvo",
        "Criar novos criativos",
        "Reduzir orçamento diário"
      ]
    });
  }

  // CPC recommendations
  if (metrics.cpc > benchmark.average_cpc * 1.2) {
    recommendations.push({
      priority: "medium",
      category: "CPC",
      message: `CPC elevado (R$ ${metrics.cpc.toFixed(2)} vs R$ ${benchmark.average_cpc.toFixed(2)} esperado)`,
      actions: [
        "Melhorar relevância do anúncio",
        "Otimizar landing page",
        "Ajustar lances",
        "Revisar público-alvo"
      ]
    });
  }

  // Budget recommendations
  if (metrics.spend < benchmark.min_budget_for_learning) {
    recommendations.push({
      priority: "medium",
      category: "Budget",
      message: `Orçamento insuficiente para aprendizado (R$ ${metrics.spend.toFixed(2)} vs R$ ${benchmark.min_budget_for_learning} mínimo)`,
      actions: [
        "Aumentar orçamento diário",
        "Consolidar ad sets",
        "Reduzir número de públicos"
      ]
    });
  }

  return recommendations;
}

module.exports = {
  benchmarks,
  getBenchmark,
  compareToBenchmark,
  getRecommendationsByBenchmark
};
