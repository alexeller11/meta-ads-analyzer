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

  CREATE INDEX IF NOT EXISTS idx_alerts_user ON budget_alerts(fb_user_id);
  CREATE INDEX IF NOT EXISTS idx_alerts_active ON budget_alerts(active, last_alert_sent);

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

  CREATE INDEX IF NOT EXISTS idx_notes_account ON campaign_notes(fb_account_id, created_at DESC);
`;

async function ensureColumn(table, column, definition) {
  try {
    const check = await pool.query(
      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2
      `,
      [table, column]
    );

    if (check.rows.length === 0) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`✅ Coluna adicionada: ${table}.${column}`);
    }
  } catch (err) {
    console.error(`❌ Erro ao garantir coluna ${table}.${column}:`, err.message);
  }
}

async function runMigrations() {
  const analysisRunColumns = [
    ['date_range', 'VARCHAR(64)'],
    ['total_spend', 'NUMERIC(14,2)'],
    ['total_impressions', 'BIGINT'],
    ['total_clicks', 'BIGINT'],
    ['total_reach', 'BIGINT'],
    ['total_purchases', 'NUMERIC(14,2)'],
    ['total_messages', 'NUMERIC(14,2)'],
    ['total_leads', 'NUMERIC(14,2)'],
    ['total_revenue', 'NUMERIC(14,2)'],
    ['avg_ctr', 'NUMERIC(8,4)'],
    ['avg_cpc', 'NUMERIC(10,4)'],
    ['avg_cpm', 'NUMERIC(10,4)'],
    ['avg_frequency', 'NUMERIC(8,4)'],
    ['roas', 'NUMERIC(10,4)'],
    ['active_campaigns', 'INT'],
    ['total_campaigns', 'INT'],
    ['health_score', 'INT'],
    ['health_level', 'VARCHAR(32)'],
    ['ai_analysis', 'JSONB']
  ];

  const campaignSnapshotColumns = [
    ['status', 'VARCHAR(32)'],
    ['objective', 'VARCHAR(64)'],
    ['spend', 'NUMERIC(14,2)'],
    ['impressions', 'BIGINT'],
    ['clicks', 'BIGINT'],
    ['reach', 'BIGINT'],
    ['ctr', 'NUMERIC(8,4)'],
    ['cpc', 'NUMERIC(10,4)'],
    ['cpm', 'NUMERIC(10,4)'],
    ['frequency', 'NUMERIC(8,4)'],
    ['purchases', 'NUMERIC(14,2)'],
    ['messages', 'NUMERIC(14,2)'],
    ['leads', 'NUMERIC(14,2)'],
    ['revenue', 'NUMERIC(14,2)'],
    ['roas', 'NUMERIC(10,4)'],
    ['actions', 'JSONB'],
    ['ai_performance_status', 'VARCHAR(64)'],
    ['ai_diagnostico', 'TEXT'],
    ['ai_escala', 'TEXT']
  ];

  for (const [column, definition] of analysisRunColumns) {
    await ensureColumn('analysis_runs', column, definition);
  }

  for (const [column, definition] of campaignSnapshotColumns) {
    await ensureColumn('campaign_snapshots', column, definition);
  }
}

async function initDB() {
  try {
    await pool.query(SCHEMA);
    await runMigrations();
    console.log('✅ Database schema ready (Neon)');
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
      active_campaigns, total_campaigns,
      health_score, health_level, ai_analysis
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
    RETURNING id
  `, [
    fbAccountId, fbUserId, accountName, dateRange,
    metrics.totalSpend || 0,
    metrics.totalImpressions || 0,
    metrics.totalClicks || 0,
    metrics.totalReach || 0,
    metrics.totalPurchases || 0,
    metrics.totalMessages || 0,
    metrics.totalLeads || 0,
    metrics.totalRev || 0,
    metrics.avgCtr || 0,
    metrics.avgCpc || 0,
    metrics.avgCpm || 0,
    metrics.avgFrequency || 0,
    metrics.roas || 0,
    metrics.activeCampaigns || 0,
    metrics.totalCampaigns || 0,
    aiAnalysis?.resumo_geral?.score_saude || null,
    aiAnalysis?.resumo_geral?.nivel_saude || null,
    JSON.stringify(aiAnalysis || {})
  ]);

  const runId = rows[0].id;

  if (campaigns && campaigns.length > 0) {
    for (const c of campaigns) {
      try {
        await pool.query(`
          INSERT INTO campaign_snapshots (
            run_id, fb_account_id, fb_campaign_id, campaign_name, status, objective,
            spend, impressions, clicks, reach, ctr, cpc, cpm, frequency,
            purchases, messages, leads, revenue, roas,
            actions, ai_performance_status, ai_diagnostico, ai_escala
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        `, [
          runId,
          fbAccountId,
          c.id,
          c.name,
          c.status || null,
          c.objective || null,
          c.spend || 0,
          c.impressions || 0,
          c.clicks || 0,
          c.reach || 0,
          c.ctr || 0,
          c.cpc || 0,
          c.cpm || 0,
          c.frequency || 0,
          c.purchases || 0,
          c.messages || 0,
          c.leads || 0,
          c.revenue || 0,
          c.roas || 0,
          JSON.stringify(c.actions || []),
          c.status_performance || null,
          c.diagnostico || null,
          c.escala_sugestao || null
        ]);
      } catch (snapErr) {
        console.error('Erro ao salvar snapshot de campanha:', snapErr.message);
      }
    }
  }

  return runId;
}

async function getRunHistory(fbAccountId, limit = 60) {
  const { rows } = await pool.query(`
    SELECT id, created_at, date_range, account_name,
           total_spend, total_impressions, total_clicks, total_reach,
           total_purchases, total_messages, total_revenue,
           avg_ctr, avg_cpc, avg_cpm, avg_frequency, roas,
           active_campaigns, total_campaigns,
           health_score, health_level
    FROM analysis_runs
    WHERE fb_account_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [fbAccountId, limit]);
  return rows;
}

async function getRunDetail(runId, fbUserId) {
  const { rows } = await pool.query(`
    SELECT * FROM analysis_runs
    WHERE id = $1 AND fb_user_id = $2
  `, [runId, fbUserId]);
  return rows[0] || null;
}

async function getCampaignHistory(fbCampaignId, limit = 20) {
  const { rows } = await pool.query(`
    SELECT cs.*, ar.created_at as run_date, ar.date_range
    FROM campaign_snapshots cs
    JOIN analysis_runs ar ON ar.id = cs.run_id
    WHERE cs.fb_campaign_id = $1
    ORDER BY ar.created_at DESC
    LIMIT $2
  `, [fbCampaignId, limit]);
  return rows;
}

async function getAccountTrend(fbAccountId, days = 90) {
  const { rows } = await pool.query(`
    SELECT
      DATE(created_at) as date,
      AVG(avg_ctr)::NUMERIC(8,4) as avg_ctr,
      AVG(avg_cpc)::NUMERIC(10,4) as avg_cpc,
      AVG(avg_cpm)::NUMERIC(10,4) as avg_cpm,
      SUM(total_spend)::NUMERIC(14,2) as total_spend,
      SUM(total_revenue)::NUMERIC(14,2) as total_revenue,
      AVG(roas)::NUMERIC(10,4) as avg_roas,
      AVG(health_score)::INT as avg_health,
      AVG(avg_frequency)::NUMERIC(8,4) as avg_frequency,
      COUNT(*) as run_count
    FROM analysis_runs
    WHERE fb_account_id = $1
      AND created_at > NOW() - INTERVAL '${days} days'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `, [fbAccountId]);
  return rows;
}

async function compareRuns(runId1, runId2, fbUserId) {
  const { rows } = await pool.query(`
    SELECT id, created_at, date_range, total_spend, total_impressions,
           total_clicks, avg_ctr, avg_cpc, avg_cpm, avg_frequency,
           health_score, health_level, active_campaigns, roas
    FROM analysis_runs
    WHERE id = ANY($1) AND fb_user_id = $2
    ORDER BY created_at ASC
  `, [[runId1, runId2], fbUserId]);
  return rows;
}

async function getLastRun(fbAccountId) {
  const { rows } = await pool.query(`
    SELECT * FROM analysis_runs
    WHERE fb_account_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `, [fbAccountId]);
  return rows[0] || null;
}

async function upsertBudgetAlert({ fbUserId, fbAccountId, accountName, email, threshold, currency }) {
  const { rows } = await pool.query(`
    INSERT INTO budget_alerts (fb_user_id, fb_account_id, account_name, alert_email, threshold_amount, currency, active)
    VALUES ($1,$2,$3,$4,$5,$6,true)
    ON CONFLICT (fb_user_id, fb_account_id) DO UPDATE SET
      alert_email = EXCLUDED.alert_email,
      threshold_amount = EXCLUDED.threshold_amount,
      account_name = EXCLUDED.account_name,
      currency = EXCLUDED.currency,
      active = true
    RETURNING *
  `, [fbUserId, fbAccountId, accountName, email, threshold || 100, currency || 'BRL']);
  return rows[0];
}

async function getBudgetAlert(fbUserId, fbAccountId) {
  const { rows } = await pool.query(
    `SELECT * FROM budget_alerts WHERE fb_user_id=$1 AND fb_account_id=$2`,
    [fbUserId, fbAccountId]
  );
  return rows[0] || null;
}

async function deleteBudgetAlert(fbUserId, fbAccountId) {
  await pool.query(
    `DELETE FROM budget_alerts WHERE fb_user_id=$1 AND fb_account_id=$2`,
    [fbUserId, fbAccountId]
  );
}

async function getAllActiveAlerts() {
  const { rows } = await pool.query(`
    SELECT * FROM budget_alerts
    WHERE active = true
    AND (last_alert_sent IS NULL OR last_alert_sent < NOW() - INTERVAL '6 hours')
  `);
  return rows;
}

async function markAlertSent(id) {
  await pool.query(
    `UPDATE budget_alerts SET last_alert_sent = NOW() WHERE id=$1`,
    [id]
  );
}

module.exports = {
  pool,
  initDB,
  saveNote: async ({ fbUserId, fbAccountId, fbCampaignId, campaignName, note, type }) => {
    const { rows } = await pool.query(
      `INSERT INTO campaign_notes (fb_user_id, fb_account_id, fb_campaign_id, campaign_name, note, type)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [fbUserId, fbAccountId, fbCampaignId || null, campaignName || null, note, type || 'geral']
    );
    return rows[0];
  },
  getNotes: async (fbAccountId, fbUserId) => {
    const { rows } = await pool.query(
      `SELECT * FROM campaign_notes WHERE fb_account_id=$1 AND fb_user_id=$2 ORDER BY created_at DESC LIMIT 100`,
      [fbAccountId, fbUserId]
    );
    return rows;
  },
  deleteNote: async (id, fbUserId) => {
    await pool.query(`DELETE FROM campaign_notes WHERE id=$1 AND fb_user_id=$2`, [id, fbUserId]);
  },
  saveRun,
  getRunHistory,
  getRunDetail,
  getCampaignHistory,
  getAccountTrend,
  compareRuns,
  getLastRun,
  upsertBudgetAlert,
  getBudgetAlert,
  deleteBudgetAlert,
  getAllActiveAlerts,
  markAlertSent
};
