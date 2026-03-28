// benchmarks-v2.js
// Meta Ads Benchmarks - Clean version
const benchmarks = {
  "Geral": { average_cpc: 1.50, average_ctr: 2.5, average_cvr: 1.5, average_roas: 2.0, typical_cpa: 100, recommended_daily_budget: 50, min_budget_for_learning: 20, optimal_frequency: 2.5, max_frequency: 3.5 },
  "E-commerce": { average_cpc: 0.80, average_ctr: 3.5, average_cvr: 2.5, average_roas: 3.0, typical_cpa: 80, recommended_daily_budget: 100, min_budget_for_learning: 50, optimal_frequency: 2.0, max_frequency: 3.0 },
  "SaaS": { average_cpc: 2.50, average_ctr: 2.0, average_cvr: 1.0, average_roas: 2.5, typical_cpa: 150, recommended_daily_budget: 150, min_budget_for_learning: 75, optimal_frequency: 3.0, max_frequency: 4.0 },
  "Infoprodutos": { average_cpc: 1.20, average_ctr: 4.0, average_cvr: 3.0, average_roas: 4.0, typical_cpa: 60, recommended_daily_budget: 75, min_budget_for_learning: 30, optimal_frequency: 2.5, max_frequency: 3.5 },
  "Negócios Locais": { average_cpc: 0.50, average_ctr: 3.0, average_cvr: 2.0, average_roas: 2.5, typical_cpa: 40, recommended_daily_budget: 30, min_budget_for_learning: 15, optimal_frequency: 2.0, max_frequency: 2.5 },
  "B2B": { average_cpc: 3.00, average_ctr: 1.5, average_cvr: 0.8, average_roas: 2.0, typical_cpa: 200, recommended_daily_budget: 200, min_budget_for_learning: 100, optimal_frequency: 3.5, max_frequency: 5.0 },
  "Imobiliário": { average_cpc: 1.80, average_ctr: 2.5, average_cvr: 1.2, average_roas: 2.2, typical_cpa: 120, recommended_daily_budget: 100, min_budget_for_learning: 50, optimal_frequency: 2.5, max_frequency: 3.5 },
  "Saúde": { average_cpc: 2.00, average_ctr: 2.0, average_cvr: 1.5, average_roas: 2.3, typical_cpa: 110, recommended_daily_budget: 80, min_budget_for_learning: 40, optimal_frequency: 2.5, max_frequency: 3.5 },
  "Educação": { average_cpc: 1.50, average_ctr: 3.0, average_cvr: 2.0, average_roas: 2.8, typical_cpa: 90, recommended_daily_budget: 60, min_budget_for_learning: 30, optimal_frequency: 2.5, max_frequency: 3.5 },
  "Moda": { average_cpc: 0.90, average_ctr: 3.5, average_cvr: 2.5, average_roas: 3.2, typical_cpa: 75, recommended_daily_budget: 100, min_budget_for_learning: 50, optimal_frequency: 2.0, max_frequency: 3.0 }
};

function getBenchmark(niche) {
  const normalized = niche.charAt(0).toUpperCase() + niche.slice(1).toLowerCase();
  return benchmarks[normalized] || benchmarks["Geral"];
}

function compareToBenchmark(niche, metrics) {
  const benchmark = getBenchmark(niche);
  const comparison = { niche, score: 0, grade: "C", metrics: {} };
  
  const metricsToCompare = {
    roas: { benchmark: benchmark.average_roas, operator: ">=" },
    ctr: { benchmark: benchmark.average_ctr, operator: ">=" },
    cvr: { benchmark: benchmark.average_cvr, operator: ">=" },
    cpc: { benchmark: benchmark.average_cpc, operator: "<=" },
    frequency: { benchmark: benchmark.optimal_frequency, operator: "<=" }
  };

  let passedCount = 0;
  Object.entries(metricsToCompare).forEach(([key, config]) => {
    const value = metrics[key] || 0;
    const benchmarkValue = config.benchmark;
    let status = "below";
    
    if (config.operator === ">=") {
      status = value >= benchmarkValue ? "above" : "below";
      if (status === "above") passedCount++;
    } else {
      status = value <= benchmarkValue ? "above" : "below";
      if (status === "above") passedCount++;
    }

    comparison.metrics[key] = {
      value: Number(value.toFixed(2)),
      benchmark: benchmarkValue,
      ratio: Number((value / benchmarkValue).toFixed(2)),
      status
    };
  });

  const score = Math.round((passedCount / Object.keys(metricsToCompare).length) * 100);
  comparison.score = score;
  comparison.grade = score >= 75 ? "A" : score >= 60 ? "B" : "C";
  return comparison;
}

function getRecommendationsByBenchmark(niche, metrics) {
  const benchmark = getBenchmark(niche);
  const recommendations = [];

  if (metrics.roas < benchmark.average_roas) {
    recommendations.push({
      priority: "high",
      category: "Performance",
      message: `ROAS ${metrics.roas.toFixed(2)}x vs ${benchmark.average_roas}x`,
      actions: ["Melhorar criativo", "Refinar público", "Otimizar landing page"]
    });
  }
  if (metrics.ctr < benchmark.average_ctr) {
    recommendations.push({
      priority: "high",
      category: "Creative",
      message: `CTR ${metrics.ctr.toFixed(2)}% vs ${benchmark.average_ctr}%`,
      actions: ["Testar novos criativos", "Melhorar copy", "Aumentar contraste"]
    });
  }
  if (metrics.cvr < benchmark.average_cvr) {
    recommendations.push({
      priority: "high",
      category: "Conversion",
      message: `CVR ${metrics.cvr.toFixed(2)}% vs ${benchmark.average_cvr}%`,
      actions: ["Auditar landing page", "Simplificar formulário", "Adicionar prova social"]
    });
  }
  if (metrics.cpc > benchmark.average_cpc) {
    recommendations.push({
      priority: "medium",
      category: "Budget",
      message: `CPC R$ ${metrics.cpc.toFixed(2)} vs R$ ${benchmark.average_cpc}`,
      actions: ["Revisar público", "Testar novos públicos", "Melhorar criativo"]
    });
  }
  if (metrics.frequency > benchmark.optimal_frequency) {
    recommendations.push({
      priority: "medium",
      category: "Audience",
      message: `Frequência ${metrics.frequency.toFixed(2)}x vs ${benchmark.optimal_frequency}x`,
      actions: ["Expandir público", "Criar novos públicos", "Pausar campanha"]
    });
  }
  if (metrics.spend < benchmark.min_budget_for_learning) {
    recommendations.push({
      priority: "medium",
      category: "Budget",
      message: `Orçamento R$ ${metrics.spend.toFixed(2)} vs R$ ${benchmark.min_budget_for_learning}`,
      actions: ["Aumentar orçamento", "Consolidar ad sets", "Reduzir públicos"]
    });
  }

  return recommendations;
}

module.exports = { benchmarks, getBenchmark, compareToBenchmark, getRecommendationsByBenchmark };
