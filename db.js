const { Pool } = require('pg');

let pool;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });
} else {
  console.log('⚠️ DATABASE_URL não configurada. Funcionalidades de histórico estarão desativadas.');
  pool = {
    query: async () => ({ rows: [] }),
    on: () => {}
  };
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    fb_account_id VARCHAR(64) NOT NULL,
    fb_user_id VARCHAR(64) NOT NULL,
    name TEXT,
    currency VARCHAR(8),
    timezone VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(fb_account_id, fb_user_id)
  );

  -- Tabela V2 para Auditoria e Centralização
  CREATE TABLE IF NOT EXISTS campaigns (
    id VARCHAR(64) PRIMARY KEY,
    account_id VARCHAR(64) NOT NULL,
    name TEXT,
    status VARCHAR(32),
    spend NUMERIC(14,2),
    impressions BIGINT,
    clicks BIGINT,
    reach BIGINT,
    frequency NUMERIC(8,4),
    roas NUMERIC(10,4),
    purchases NUMERIC(14,2),
    messages NUMERIC(14,2),
    leads NUMERIC(14,2),
    ctr NUMERIC(8,4),
    cvr NUMERIC(8,4),
    cpc NUMERIC(10,4),
    last_updated TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS analysis_runs (
    id SERIAL PRIMARY KEY,
    fb_account_id VARCHAR(64) NOT NULL,
    fb_user_id VARCHAR(64) NOT NULL,
    account_name TEXT,
    date_range VARCHAR(64),
    total_spend NUMERIC(14,2),
    total_impressions BIGINT,
    total_clicks BIGINT,
    total_reach BIGINT,
    total_purchases NUMERIC(14,2),
    total_messages NUMERIC(14,2),
    total_leads NUMERIC(14,2),
    total_revenue NUMERIC(14,2),
    avg_ctr NUMERIC(8,4),
    avg_cpc NUMERIC(10,4),
    avg_cpm NUMERIC(10,4),
    avg_frequency NUMERIC(8,4),
    roas NUMERIC(10,4),
    connect_rate NUMERIC(8,4),
    cost_per_purchase NUMERIC(10,4),
    active_campaigns INT,
    total_campaigns INT,
    health_score INT,
    health_level VARCHAR(32),
    ai_analysis JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_runs_account ON analysis_runs(fb_account_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_runs_user ON analysis_runs(fb_user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS campaign_snapshots (
    id SERIAL PRIMARY KEY,
    run_id INT REFERENCES analysis_runs(id) ON DELETE CASCADE,
    fb_account_id VARCHAR(64) NOT NULL,
    fb_campaign_id VARCHAR(64),
    campaign_name TEXT,
    status VARCHAR(32),
    objective VARCHAR(64),
    spend NUMERIC(14,2),
    impressions BIGINT,
    clicks BIGINT,
    reach BIGINT,
    ctr NUMERIC(8,4),
    cpc NUMERIC(10,4),
    cpm NUMERIC(10,4),
    frequency NUMERIC(8,4),
    purchases NUMERIC(14,2),
    messages NUMERIC(14,2),
    leads NUMERIC(14,2),
    revenue NUMERIC(14,2),
    roas NUMERIC(10,4),
    actions JSONB,
    ai_performance_status VARCHAR(64),
    ai_diagnostico TEXT,
    ai_escala TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_snap_account ON campaign_snapshots(fb_account_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_snap_campaign ON campaign_snapshots(fb_campaign_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS budget_alerts (
    id SERIAL PRIMARY KEY,
    fb_user_id VARCHAR(64) NOT NULL,
    fb_account_id VARCHAR(64) NOT NULL,
    account_name TEXT,
    alert_email TEXT NOT NULL,
    threshold_amount NUMERIC(10,2) DEFAULT 100.00,
    currency VARCHAR(8) DEFAULT 'BRL',
    active BOOLEAN DEFAULT TRUE,
    last_alert_sent TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(fb_user_id, fb_account_id)
  );

  CREATE TABLE IF NOT EXISTS campaign_notes (
    id SERIAL PRIMARY KEY,
    fb_user_id VARCHAR(64) NOT NULL,
    fb_account_id VARCHAR(64) NOT NULL,
    fb_campaign_id VARCHAR(64),
    campaign_name TEXT,
    note TEXT NOT NULL,
    type VARCHAR(32) DEFAULT 'geral',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

async function ensureColumn(table, column, definition) {
  try {
    const check = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
      [table, column]
    );
    if (check.rows.length === 0) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  } catch (err) {}
}

async function runMigrations() {
  const cols = [['date_range', 'VARCHAR(64)'], ['total_spend', 'NUMERIC(14,2)'], ['total_impressions', 'BIGINT'], ['total_clicks', 'BIGINT'], ['total_reach', 'BIGINT'], ['total_purchases', 'NUMERIC(14,2)'], ['total_messages', 'NUMERIC(14,2)'], ['total_leads', 'NUMERIC(14,2)'], ['total_revenue', 'NUMERIC(14,2)'], ['avg_ctr', 'NUMERIC(8,4)'], ['avg_cpc', 'NUMERIC(10,4)'], ['avg_cpm', 'NUMERIC(10,4)'], ['avg_frequency', 'NUMERIC(8,4)'], ['roas', 'NUMERIC(10,4)'], ['connect_rate', 'NUMERIC(8,4)'], ['cost_per_purchase', 'NUMERIC(10,4)'], ['active_campaigns', 'INT'], ['total_campaigns', 'INT'], ['health_score', 'INT'], ['health_level', 'VARCHAR(32)'], ['ai_analysis', 'JSONB']];
  for (const [c, d] of cols) await ensureColumn('analysis_runs', c, d);
}

async function initDB() {
  try {
    await pool.query(SCHEMA);
    await runMigrations();
    console.log('✅ Database schema ready');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
  }
}

async function saveRun({ fbAccountId, fbUserId, accountName, dateRange, metrics, campaigns, aiAnalysis }) {
  const { rows } = await pool.query(`
    INSERT INTO analysis_runs (
      fb_account_id, fb_user_id, account_name, date_range,
      total_spend, total_impressions, total_clicks, total_reach,
      total_purchases, total_messages, total_leads, total_revenue,
      avg_ctr, avg_cpc, avg_cpm, avg_frequency, roas,
      connect_rate, cost_per_purchase, active_campaigns, total_campaigns,
      health_score, health_level, ai_analysis
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
    RETURNING id
  `, [
    fbAccountId, fbUserId, accountName, dateRange,
    metrics.totalSpend || 0, metrics.totalImpressions || 0, metrics.totalClicks || 0, metrics.totalReach || 0,
    metrics.totalPurchases || 0, metrics.totalMessages || 0, metrics.totalLeads || 0, metrics.totalRev || 0,
    metrics.avgCtr || 0, metrics.avgCpc || 0, metrics.avgCpm || 0, metrics.avgFrequency || 0, metrics.roas || 0,
    metrics.connectRate || 0, metrics.costPerPurchase || 0, metrics.activeCampaigns || 0, metrics.totalCampaigns || 0,
    aiAnalysis?.resumo_geral?.score_saude || null, aiAnalysis?.resumo_geral?.nivel_saude || null, JSON.stringify(aiAnalysis || {})
  ]);

  const runId = rows[0].id;
  if (campaigns && campaigns.length > 0) {
    for (const c of campaigns) {
      try {
        await pool.query(`
          INSERT INTO campaign_snapshots (
            run_id, fb_account_id, fb_campaign_id, campaign_name, status, objective,
            spend, impressions, clicks, reach, ctr, cpc, cpm, frequency,
            purchases, messages, leads, revenue, roas, actions, ai_performance_status, ai_diagnostico, ai_escala
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        `, [runId, fbAccountId, c.id, c.name, c.status, c.objective, c.spend || 0, c.impressions || 0, c.clicks || 0, c.reach || 0, c.ctr || 0, c.cpc || 0, c.cpm || 0, c.frequency || 0, c.purchases || 0, c.messages || 0, c.leads || 0, c.revenue || 0, c.roas || 0, JSON.stringify(c.actions || []), c.status_performance, c.diagnostico, c.escala_sugestao]);

        const cvr = c.clicks > 0 ? (c.purchases / c.clicks) * 100 : 0;
        await pool.query(`
          INSERT INTO campaigns (id, account_id, name, status, spend, impressions, clicks, reach, frequency, roas, purchases, messages, leads, ctr, cvr, cpc, last_updated)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
          ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, status=EXCLUDED.status, spend=EXCLUDED.spend, impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks, reach=EXCLUDED.reach, frequency=EXCLUDED.frequency, roas=EXCLUDED.roas, purchases=EXCLUDED.purchases, messages=EXCLUDED.messages, leads=EXCLUDED.leads, ctr=EXCLUDED.ctr, cvr=EXCLUDED.cvr, cpc=EXCLUDED.cpc, last_updated=NOW()
        `, [c.id, fbAccountId, c.name, c.status, c.spend || 0, c.impressions || 0, c.clicks || 0, c.reach || 0, c.frequency || 0, c.roas || 0, c.purchases || 0, c.messages || 0, c.leads || 0, c.ctr || 0, cvr, c.cpc || 0]);
      } catch (e) {}
    }
  }
  return runId;
}

module.exports = {
  pool,
  initDB,
  saveRun,
  query: (text, params) => pool.query(text, params),
  getRunHistory: async (acc, limit = 60) => (await pool.query(`SELECT * FROM analysis_runs WHERE fb_account_id = $1 ORDER BY created_at DESC LIMIT $2`, [acc, limit])).rows,
  getDailyRunHistory: async (acc, limit = 90) => (await pool.query(`SELECT * FROM analysis_runs WHERE fb_account_id = $1 AND date_range LIKE 'AUTO_DAILY%' ORDER BY created_at DESC LIMIT $2`, [acc, limit])).rows,
  saveNote: async (n) => (await pool.query(`INSERT INTO campaign_notes (fb_user_id, fb_account_id, fb_campaign_id, campaign_name, note, type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [n.fbUserId, n.fbAccountId, n.fbCampaignId, n.campaignName, n.note, n.type])).rows[0],
  getNotes: async (acc, user) => (await pool.query(`SELECT * FROM campaign_notes WHERE fb_account_id = $1 AND fb_user_id = $2 ORDER BY created_at DESC`, [acc, user])).rows,
  deleteNote: async (id, user) => pool.query(`DELETE FROM campaign_notes WHERE id = $1 AND fb_user_id = $2`, [id, user]),
  upsertBudgetAlert: async (a) => (await pool.query(`INSERT INTO budget_alerts (fb_user_id, fb_account_id, account_name, alert_email, threshold_amount, currency) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (fb_user_id, fb_account_id) DO UPDATE SET alert_email=EXCLUDED.alert_email, threshold_amount=EXCLUDED.threshold_amount, currency=EXCLUDED.currency, active=TRUE RETURNING *`, [a.fbUserId, a.fbAccountId, a.accountName, a.email, a.threshold, a.currency])).rows[0],
  getBudgetAlert: async (user, acc) => (await pool.query(`SELECT * FROM budget_alerts WHERE fb_user_id = $1 AND fb_account_id = $2`, [user, acc])).rows[0]
};
