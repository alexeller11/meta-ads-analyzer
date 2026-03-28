// server-integration.js
// Integration code to add to server.js
// Add these routes and functions to your existing server.js

// ============================================================================
// IMPORTS (Add to top of server.js)
// ============================================================================
/*
const decisionEngineV2 = require("./decision-engine-v2");
const benchmarksV2 = require("./benchmarks-v2");
const landingPageAudit = require("./landing-page-audit");
*/

// ============================================================================
// NEW ROUTES - Add these to server.js after existing routes
// ============================================================================

// ── AUDIT ENDPOINTS ────────────────────────────────────────────────────────

/**
 * GET /api/audit-summary/:accountId
 * Returns comprehensive audit summary with 46+ checks
 */
app.get("/api/audit-summary/:accountId", auth, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { dateRange = "7d" } = req.query;

    // Get campaigns for account
    const campaigns = await getCampaignsForAccount(accountId, dateRange);
    
    // Run V2 audit on all campaigns
    const auditResults = decisionEngineV2.analyzeAccount(campaigns);
    
    // Save to database
    await db.query(
      `INSERT INTO audit_runs (account_id, audit_data, created_at) 
       VALUES ($1, $2, NOW())`,
      [accountId, JSON.stringify(auditResults)]
    );

    res.json({
      status: "success",
      audit: auditResults,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error("Audit error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/campaign-audit/:campaignId
 * Returns detailed audit for a specific campaign with all 46+ checks
 */
app.get("/api/campaign-audit/:campaignId", auth, async (req, res) => {
  try {
    const { campaignId } = req.params;

    // Get campaign data
    const campaign = await getCampaignData(campaignId);
    
    // Run detailed audit
    const auditResults = decisionEngineV2.analyzeCampaign(campaign);
    
    res.json({
      status: "success",
      campaign_id: campaignId,
      audit: auditResults,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error("Campaign audit error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/audit-checks
 * Get detailed information about all 46+ audit checks
 */
app.get("/api/audit-checks", auth, (req, res) => {
  try {
    const checks = Object.values(decisionEngineV2.auditChecks).map(check => ({
      id: check.id,
      name: check.name,
      category: check.category,
      severity: check.severity,
      description: check.description || ""
    }));

    res.json({
      status: "success",
      total_checks: checks.length,
      checks: checks.sort((a, b) => a.category.localeCompare(b.category))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── BENCHMARK ENDPOINTS ────────────────────────────────────────────────────

/**
 * GET /api/benchmarks/:niche
 * Returns benchmarks for a specific niche (20+ metrics)
 */
app.get("/api/benchmarks/:niche", auth, (req, res) => {
  try {
    const { niche } = req.params;
    const benchmark = benchmarksV2.getBenchmark(niche);

    res.json({
      status: "success",
      niche,
      benchmark,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/benchmarks
 * Returns list of all available niches
 */
app.get("/api/benchmarks", auth, (req, res) => {
  try {
    const niches = Object.keys(benchmarksV2.benchmarks);

    res.json({
      status: "success",
      niches,
      count: niches.length
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/compare-to-benchmark
 * Compare campaign metrics to industry benchmark
 */
app.post("/api/compare-to-benchmark", auth, async (req, res) => {
  try {
    const { niche, metrics } = req.body;

    if (!niche || !metrics) {
      return res.status(400).json({ error: "niche and metrics required" });
    }

    const comparison = benchmarksV2.compareToBenchmark(niche, metrics);
    const recommendations = benchmarksV2.getRecommendationsByBenchmark(niche, metrics);

    res.json({
      status: "success",
      comparison,
      recommendations,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/benchmark-recommendations
 * Get actionable recommendations based on benchmark comparison
 */
app.post("/api/benchmark-recommendations", auth, async (req, res) => {
  try {
    const { niche, metrics } = req.body;

    if (!niche || !metrics) {
      return res.status(400).json({ error: "niche and metrics required" });
    }

    const recommendations = benchmarksV2.getRecommendationsByBenchmark(niche, metrics);

    res.json({
      status: "success",
      niche,
      recommendations,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── LANDING PAGE AUDIT ENDPOINTS ───────────────────────────────────────────

/**
 * POST /api/audit-landing-page
 * Audit a landing page for conversion optimization
 */
app.post("/api/audit-landing-page", auth, async (req, res) => {
  try {
    const { url, campaignId } = req.body;

    if (!url) {
      return res.status(400).json({ error: "url required" });
    }

    // Placeholder: In production, would use Playwright to analyze page
    // For now, return mock data structure
    const pageMetrics = {
      lcp_ms: 2100,
      cls: 0.05,
      ttfb_ms: 450,
      dom_content_loaded_ms: 1800,
      page_size_mb: 2.5,
      cta_above_fold: true,
      form_present: true,
      form_fields: 4,
      phone_number: true,
      chat_widget: false,
      viewport_meta: true,
      horizontal_scroll: false,
      font_readable: true,
      testimonials: true,
      trust_badges: true,
      reviews_schema: true,
      company_info: true,
      guarantee: false,
      cta_clarity: "high",
      h1_count: 1,
      meta_description: "Example meta description",
      schema_types: ["Organization", "Product"]
    };

    // Run audit
    const auditResults = await landingPageAudit.runLandingPageAudit(pageMetrics);

    // If campaignId provided, correlate with campaign performance
    let correlation = null;
    if (campaignId) {
      const campaign = await getCampaignData(campaignId);
      correlation = landingPageAudit.correlateWithCampaignPerformance(
        auditResults,
        campaign
      );
    }

    // Save to database
    await db.query(
      `INSERT INTO landing_page_audits (account_id, url, campaign_id, audit_data, created_at) 
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.session.accountId, url, campaignId || null, JSON.stringify(auditResults)]
    );

    res.json({
      status: "success",
      url,
      audit: auditResults,
      correlation,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error("Landing page audit error:", e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/landing-page-checks
 * Get list of all landing page audit checks
 */
app.get("/api/landing-page-checks", auth, (req, res) => {
  try {
    const checks = Object.values(landingPageAudit.landingPageChecks).map(check => ({
      id: check.id,
      name: check.name,
      category: check.category,
      severity: check.severity,
      description: check.description
    }));

    res.json({
      status: "success",
      total_checks: checks.length,
      checks: checks.sort((a, b) => a.category.localeCompare(b.category))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/landing-page-audits/:accountId
 * Get history of landing page audits for account
 */
app.get("/api/landing-page-audits/:accountId", auth, async (req, res) => {
  try {
    const { accountId } = req.params;
    const { limit = 10 } = req.query;

    const result = await db.query(
      `SELECT id, url, campaign_id, audit_data, created_at 
       FROM landing_page_audits 
       WHERE account_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [accountId, limit]
    );

    res.json({
      status: "success",
      audits: result.rows.map(row => ({
        id: row.id,
        url: row.url,
        campaign_id: row.campaign_id,
        audit: JSON.parse(row.audit_data),
        created_at: row.created_at
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── COMBINED ANALYSIS ENDPOINTS ────────────────────────────────────────────

/**
 * POST /api/full-analysis
 * Run full analysis: campaign audit + benchmark + landing page
 */
app.post("/api/full-analysis", auth, async (req, res) => {
  try {
    const { campaignId, landingPageUrl, niche } = req.body;

    if (!campaignId) {
      return res.status(400).json({ error: "campaignId required" });
    }

    // 1. Campaign Audit
    const campaign = await getCampaignData(campaignId);
    const campaignAudit = decisionEngineV2.analyzeCampaign(campaign);

    // 2. Benchmark Comparison
    let benchmarkComparison = null;
    if (niche) {
      benchmarkComparison = benchmarksV2.compareToBenchmark(niche, {
        roas: campaign.roas,
        ctr: campaign.ctr,
        cvr: campaign.cvr,
        cpc: campaign.cpc,
        frequency: campaign.frequency
      });
    }

    // 3. Landing Page Audit (if URL provided)
    let landingPageResults = null;
    if (landingPageUrl) {
      const pageMetrics = {
        // Placeholder metrics - would be populated from actual page analysis
        lcp_ms: 2100,
        cls: 0.05,
        cta_above_fold: true,
        form_present: true,
        form_fields: 4
        // ... other metrics
      };
      landingPageResults = await landingPageAudit.runLandingPageAudit(pageMetrics);
    }

    res.json({
      status: "success",
      campaign_audit: campaignAudit,
      benchmark_comparison: benchmarkComparison,
      landing_page_audit: landingPageResults,
      recommendations: generateCombinedRecommendations(
        campaignAudit,
        benchmarkComparison,
        landingPageResults
      ),
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error("Full analysis error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate combined recommendations from all three analyses
 */
function generateCombinedRecommendations(campaignAudit, benchmarkComparison, landingPageAudit) {
  const recommendations = [];

  // From campaign audit
  if (campaignAudit.audit && campaignAudit.audit.issues) {
    campaignAudit.audit.issues.forEach(issue => {
      if (issue.severity === "high") {
        recommendations.push({
          source: "campaign_audit",
          priority: "high",
          message: issue.message,
          action: issue.recommendation
        });
      }
    });
  }

  // From benchmark comparison
  if (benchmarkComparison && benchmarkComparison.metrics) {
    Object.entries(benchmarkComparison.metrics).forEach(([metric, data]) => {
      if (data.status === "below") {
        recommendations.push({
          source: "benchmark",
          priority: "medium",
          message: `${metric} está abaixo do benchmark (${data.value} vs ${data.benchmark} esperado)`,
          action: `Otimize ${metric} para atingir benchmark`
        });
      }
    });
  }

  // From landing page audit
  if (landingPageAudit && landingPageAudit.issues) {
    landingPageAudit.issues.forEach(issue => {
      if (issue.severity === "high") {
        recommendations.push({
          source: "landing_page",
          priority: "high",
          message: issue.message,
          action: issue.recommendation
        });
      }
    });
  }

  // Sort by priority
  return recommendations.sort((a, b) => {
    const priorityMap = { high: 0, medium: 1, low: 2 };
    return priorityMap[a.priority] - priorityMap[b.priority];
  });
}

/**
 * Mock function - replace with actual implementation
 */
async function getCampaignData(campaignId) {
  // In production, fetch from Meta Ads API
  return {
    id: campaignId,
    name: "Sample Campaign",
    status: "ACTIVE",
    spend: 1000,
    impressions: 50000,
    clicks: 1500,
    ctr: 3.0,
    reach: 40000,
    frequency: 1.25,
    roas: 2.5,
    purchases: 10,
    messages: 25,
    leads: 5,
    connectRate: 75,
    costPerPur: 100,
    costPerMsg: 40,
    costPerLead: 200,
    cpc: 0.67,
    cvr: 0.67
  };
}

/**
 * Mock function - replace with actual implementation
 */
async function getCampaignsForAccount(accountId, dateRange) {
  // In production, fetch from Meta Ads API
  return [
    {
      id: "campaign_1",
      name: "Campaign 1",
      status: "ACTIVE",
      spend: 1000,
      impressions: 50000,
      clicks: 1500,
      ctr: 3.0,
      reach: 40000,
      frequency: 1.25,
      roas: 2.5,
      purchases: 10,
      messages: 25,
      leads: 5,
      connectRate: 75,
      costPerPur: 100,
      costPerMsg: 40,
      costPerLead: 200
    }
  ];
}

// ============================================================================
// DATABASE SCHEMA ADDITIONS
// ============================================================================

/*
Add these tables to your db.js migrations:

CREATE TABLE IF NOT EXISTS audit_runs (
  id SERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  audit_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS landing_page_audits (
  id SERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  url TEXT NOT NULL,
  campaign_id TEXT,
  audit_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX idx_audit_runs_account ON audit_runs(account_id);
CREATE INDEX idx_landing_page_audits_account ON landing_page_audits(account_id);
*/

module.exports = {
  generateCombinedRecommendations,
  getCampaignData,
  getCampaignsForAccount
};
