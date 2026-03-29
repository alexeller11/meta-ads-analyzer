const state = {
  me: null,
  accounts: [],
  selectedAccountId: null,
  selectedAccount: null,
  analysis: null,
  metrics: null,
  decision: null,
  comparison: null,
  creatives: [],
  breakdownRows: [],
  historyRows: [],
  charts: {
    trend: null
  }
};

const brMoney = (v) =>
  `R$ ${Number(v || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const brNum = (v) => Number(v || 0).toLocaleString("pt-BR");
const brPct = (v) => `${Number(v || 0).toFixed(2)}%`;

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  let json = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(json?.error || text || `Erro ${response.status}`);
  }

  return json;
}

function showError(message) {
  const box = document.getElementById("globalError");
  if (!box) return;
  box.textContent = message;
  box.classList.remove("hidden");
}

function hideError() {
  const box = document.getElementById("globalError");
  if (!box) return;
  box.classList.add("hidden");
}

function showOk(message) {
  const box = document.getElementById("globalOk");
  if (!box) return;
  box.textContent = message;
  box.classList.remove("hidden");
}

function hideOk() {
  const box = document.getElementById("globalOk");
  if (!box) return;
  box.classList.add("hidden");
}

function normalizeAccounts(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.accounts)) return payload.accounts;
  return [];
}

function fillAccountSelect(accounts) {
  const accountSel = document.getElementById("accountSel");
  if (!accountSel) return;

  accountSel.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecione a conta";
  accountSel.appendChild(placeholder);

  accounts.forEach((acc) => {
    const option = document.createElement("option");
    option.value = String(acc.account_id || "");
    option.textContent = String(acc.name || acc.account_id || "Conta sem nome");
    accountSel.appendChild(option);
  });

  if (accounts.length > 0) {
    accountSel.value = String(accounts[0].account_id);
  }
}

function getActiveFilter(groupId) {
  const root = document.getElementById(groupId);
  if (!root) return "TODAS";
  const active = root.querySelector(".filter-btn.active");
  return active ? active.dataset.filter : "TODAS";
}

function getLifecycleStatus(campaign) {
  const status = String(campaign.status || "").toUpperCase();
  if (status === "PAUSED") return "PAUSADA";
  if (campaign.spend > 0) return "RODANDO";
  return "ATIVA";
}

function getActionBadgeClass(action) {
  if (!action) return "secondary";
  if (action === "ESCALAR") return "success";
  if (action === "PAUSAR") return "danger";
  return "primary";
}

function renderOverview() {
  const m = state.metrics;
  if (!m) return;

  document.getElementById("mSpend").textContent = brMoney(m.totalSpend);
  document.getElementById("mRevenue").textContent = brMoney(m.totalRevenue);
  document.getElementById("mRoas").textContent = `${Number(m.avgRoas || 0).toFixed(2)}x`;
  document.getElementById("mCostPerPurchase").textContent = brMoney(m.avgCostPerPurchase);

  document.getElementById("mImpressions").textContent = brNum(m.totalImpressions);
  document.getElementById("mReach").textContent = brNum(m.totalReach);
  document.getElementById("mFrequency").textContent = Number(m.avgFrequency || 0).toFixed(2);
  document.getElementById("mCpm").textContent = brMoney(m.avgCpm);

  document.getElementById("mCtr").textContent = brPct(m.avgCtr);
  document.getElementById("mCpc").textContent = brMoney(m.avgCpc);
  document.getElementById("mConnectRate").textContent = brPct(m.connectRate);
  document.getElementById("mMessages").textContent = brNum(m.totalMessages);
  document.getElementById("mPurchases").textContent = brNum(m.totalPurchases);
}

function renderCampaigns() {
  const body = document.getElementById("campaignsBody");
  if (!body) return;

  const list = state.campaigns || [];
  const filter = getActiveFilter("campaignFilters");

  const filtered = list.filter((campaign) => {
    if (filter === "TODAS") return true;
    return getLifecycleStatus(campaign) === filter;
  });

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="11" class="empty">Nenhuma campanha encontrada.</td></tr>`;
    return;
  }

  body.innerHTML = filtered.map((campaign) => `
    <tr>
      <td>${campaign.name}</td>
      <td><span class="badge primary">${getLifecycleStatus(campaign)}</span></td>
      <td>${brMoney(campaign.spend)}</td>
      <td>${brNum(campaign.messages)}</td>
      <td>${brNum(campaign.purchases)}</td>
      <td>${brMoney(campaign.revenue || campaign.rev)}</td>
      <td>${Number(campaign.roas || 0).toFixed(2)}x</td>
      <td>${brPct(campaign.ctr)}</td>
      <td>${brPct(campaign.hookRate || 0)}</td>
      <td>${brPct(campaign.holdRate || 0)}</td>
      <td>${brPct(campaign.connectRate)}</td>
    </tr>
  `).join("");
}

function renderDecision() {
  const body = document.getElementById("decisionBody");
  if (!body) return;

  const campaigns = state.decision?.campaigns || [];
  const filter = getActiveFilter("decisionFilters");

  const filtered = campaigns.filter((campaign) => {
    if (filter === "TODAS") return true;
    return getLifecycleStatus(campaign) === filter;
  });

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">Nenhuma decisão encontrada para esse filtro.</td></tr>`;
    return;
  }

  body.innerHTML = filtered.map((campaign) => `
    <tr>
      <td>${campaign.name}</td>
      <td><span class="badge primary">${getLifecycleStatus(campaign)}</span></td>
      <td><span class="badge ${getActionBadgeClass(campaign.decision?.action)}">${String(campaign.decision?.action || "MANTER").replaceAll("_", " ")}</span></td>
      <td>${campaign.decision?.reason || "-"}</td>
      <td>${brMoney(campaign.spend)}</td>
      <td>${Number(campaign.roas || 0).toFixed(2)}x</td>
    </tr>
  `).join("");
}

function renderInsights() {
  const wrapper = document.getElementById("analysisList");
  if (!wrapper) return;

  const insights = state.analysis?.otimizacoes_prioritarias || [];

  if (!insights.length) {
    wrapper.innerHTML = `<div class="empty">Rode uma análise para ver os insights.</div>`;
    return;
  }

  wrapper.innerHTML = insights.map((item) => `
    <div class="insight-item">
      <div class="insight-item-title">${item.titulo || "Insight"}</div>
      <div class="insight-item-text">${item.descricao || item.acao || ""}</div>
    </div>
  `).join("");
}

function renderAudit() {
  const summary = document.getElementById("auditSummaryContent");
  const funnel = document.getElementById("funnelLeakContent");
  const scale = document.getElementById("scaleProContent");
  const alerts = document.getElementById("auditAlertsContent");
  
  if (!state.analysis?.audit_v2) return;
  const audit = state.analysis.audit_v2;
  const scalePro = state.analysis.scale_pro;

  if (summary) {
    summary.innerHTML = `
      <div class="grid">
        <div class="metric-card">
          <div class="metric-label">Audit Score</div>
          <div class="metric-value">${audit.score}/100</div>
          <div class="metric-sub">Nota Geral: ${audit.grade}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Desperdício Estimado</div>
          <div class="metric-value">${brMoney(audit.total_waste)}</div>
          <div class="metric-sub">Capital recuperável</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Escala Preditiva</div>
          <div class="metric-value">+${scalePro?.total_potential || 0}%</div>
          <div class="metric-sub">Potencial de crescimento</div>
        </div>
      </div>
    `;
  }

  if (funnel) {
    const leak = audit.funnel_leak || {};
    funnel.innerHTML = `
      <div class="rec-item">
        <div class="rec-title">Conexão Anúncio > LP</div>
        <div class="rec-desc" style="color: ${leak.creative_to_lp.includes('ALTO') ? 'var(--danger)' : 'var(--success)'}">${leak.creative_to_lp}</div>
      </div>
      <div class="rec-item">
        <div class="rec-title">Conversão LP > Checkout</div>
        <div class="rec-desc" style="color: ${leak.lp_to_checkout.includes('BAIXA') ? 'var(--danger)' : 'var(--success)'}">${leak.lp_to_checkout}</div>
      </div>
    `;
  }

  if (scale) {
    const recs = scalePro?.recommendations || [];
    scale.innerHTML = recs.length > 0 
      ? recs.map(r => `
        <div class="rec-item">
          <div class="rec-title" style="color: var(--success)">${r.name}</div>
          <div class="rec-desc">${r.rec}</div>
        </div>
      `).join("")
      : '<div class="empty">Nenhuma campanha pronta para escala agressiva no momento.</div>';
  }

  if (alerts) {
    alerts.innerHTML = `
      <div class="card">
        <div class="card-head"><h3 class="card-title">Checklist de Auditoria Crítica</h3></div>
        <div class="rec-list">
          ${(audit.critical_alerts || []).map(a => `
            <div class="rec-item">
              <div class="rec-title" style="color: var(--danger)">[${a.category || 'CRÍTICO'}] ${a.message}</div>
            </div>
          `).join("") || '<div class="empty">Nenhum alerta crítico encontrado.</div>'}
        </div>
      </div>
    `;
  }
}

function renderLpAudit() {
  const container = document.getElementById("lpContent");
  if (!container || !state.analysis?.lp_audit) return;
  
  const lp = state.analysis.lp_audit;
  container.innerHTML = `
    <div class="grid">
      <div class="metric-card">
        <div class="metric-label">LP Score</div>
        <div class="metric-value">${lp.overall_score}/100</div>
        <div class="metric-sub">Nota: ${lp.grade}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Perda de Conversão</div>
        <div class="metric-value">${lp.impact_on_conversion.estimated_cvr_loss}%</div>
        <div class="metric-sub">${lp.impact_on_conversion.message}</div>
      </div>
    </div>
    <div class="card" style="margin-top: 20px;">
      <div class="card-head"><h3 class="card-title">Checklist de Otimização</h3></div>
      <div class="rec-list">
        ${lp.issues.map(i => `
          <div class="rec-item">
            <div class="rec-title" style="color: var(--danger)">[${i.category}] ${i.name}</div>
            <div class="rec-desc">${i.message}</div>
          </div>
        `).join("")}
        ${lp.passed_checks.map(i => `
          <div class="rec-item">
            <div class="rec-title" style="color: var(--success)">[${i.category}] ${i.name} - OK</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

async function renderBenchmarks() {
  const container = document.getElementById("benchmarksContent");
  if (!container) return;
  
  const niche = document.getElementById("nicheSel")?.value || "Geral";
  try {
    const res = await api(`/api/benchmarks/${niche}`);
    const b = res.benchmark || {};
    container.innerHTML = `
      <div class="card">
        <div class="card-head"><h3 class="card-title">Referência de Mercado: ${niche}</h3></div>
        <div class="grid">
          <div class="metric-card">
            <div class="metric-label">CTR Alvo</div>
            <div class="metric-value">${b.ctr}%</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">ROAS Alvo</div>
            <div class="metric-value">${b.roas}x</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">CPC Alvo</div>
            <div class="metric-value">${brMoney(b.cpc)}</div>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="card error">Erro ao carregar benchmarks: ${e.message}</div>`;
  }
}

function getDateConfig() {
  const preset = document.getElementById("dateSel")?.value || "last_30d";

  if (preset === "custom") {
    return {
      type: "custom",
      since: document.getElementById("sinceDate")?.value || "",
      until: document.getElementById("untilDate")?.value || ""
    };
  }

  return {
    type: "preset",
    date_preset: preset
  };
}

function toQuery(obj) {
  const params = new URLSearchParams();
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, value);
    }
  });
  return params.toString();
}

function getCreativeMetrics(item) {
  const ins = item?.insights?.data?.[0] || {};
  const actions = ins.actions || [];
  const values = ins.action_values || [];

  const getByContains = (arr, term) => {
    const found = arr.find((x) => String(x.action_type || "").includes(term));
    return Number(found?.value || 0);
  };

  const spend = Number(ins.spend || 0);
  const revenue = getByContains(values, "purchase");
  const purchases = getByContains(actions, "purchase");
  const messages = getByContains(actions, "message");
  const roas = spend > 0 ? revenue / spend : 0;

  return {
    spend,
    revenue,
    purchases,
    messages,
    roas,
    ctr: Number(ins.ctr || 0)
  };
}

async function loadCreatives() {
  const grid = document.getElementById("creativesGrid");
  if (!grid) return;

  if (!state.selectedAccountId) {
    grid.innerHTML = `<div class="empty full-span">Selecione uma conta primeiro.</div>`;
    return;
  }

  try {
    const dateConfig = getDateConfig();
    const query = dateConfig.type === "custom"
      ? toQuery({ since: dateConfig.since, until: dateConfig.until })
      : toQuery({ date_preset: dateConfig.date_preset });

    const res = await api(`/api/adaccounts/${state.selectedAccountId}/creatives?${query}`);
    state.creatives = res.data || [];
    renderCreatives();
  } catch (error) {
    console.error(error);
    grid.innerHTML = `<div class="empty full-span">Erro ao carregar criativos.</div>`;
  }
}

function renderCreatives() {
  const grid = document.getElementById("creativesGrid");
  if (!grid) return;

  let list = [...(state.creatives || [])];
  const filter = getActiveFilter("creativeFilters");

  if (!list.length) {
    grid.innerHTML = `<div class="empty full-span">Nenhum criativo encontrado.</div>`;
    return;
  }

  if (filter === "CAMPEAO") list.sort((a, b) => getCreativeMetrics(b).roas - getCreativeMetrics(a).roas);
  if (filter === "MENSAGENS") list.sort((a, b) => getCreativeMetrics(b).messages - getCreativeMetrics(a).messages);
  if (filter === "COMPRAS") list.sort((a, b) => getCreativeMetrics(b).purchases - getCreativeMetrics(a).purchases);

  grid.innerHTML = list.map((item, idx) => {
    const metrics = getCreativeMetrics(item);
    const image = item?.creative?.image_url || item?.creative?.thumbnail_url || "";

    return `
      <div class="creative-card">
        ${image ? `<img src="${image}" alt="Criativo" />` : `<div class="empty">Sem imagem</div>`}
        <div class="creative-info">
          <div class="creative-name">${item.name || "Criativo sem nome"}</div>
          <div class="creative-line">Gasto: ${brMoney(metrics.spend)}</div>
          <div class="creative-line">ROAS: ${metrics.roas.toFixed(2)}x</div>
          <div class="creative-line">CTR: ${brPct(metrics.ctr)}</div>
          <div class="creative-line">Mensagens: ${brNum(metrics.messages)}</div>
          <div class="creative-line">Compras: ${brNum(metrics.purchases)}</div>
          ${filter === "CAMPEAO" && idx === 0 ? `<div class="creative-line"><strong>Criativo campeão</strong></div>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

async function loadBreakdown() {
  const body = document.getElementById("breakdownBody");
  if (!body) return;

  if (!state.selectedAccountId) {
    body.innerHTML = `<tr><td colspan="8" class="empty">Selecione uma conta primeiro.</td></tr>`;
    return;
  }

  try {
    const type = document.getElementById("breakdownType")?.value || "platform";
    const dateConfig = getDateConfig();
    const query = dateConfig.type === "custom"
      ? toQuery({ since: dateConfig.since, until: dateConfig.until })
      : toQuery({ date_preset: dateConfig.date_preset });

    const res = await api(`/api/adaccounts/${state.selectedAccountId}/breakdown/${type}?${query}`);
    state.breakdownRows = res.data || [];
    renderBreakdown();
  } catch (error) {
    console.error(error);
    body.innerHTML = `<tr><td colspan="8" class="empty">Erro ao carregar breakdown.</td></tr>`;
  }
}

function renderBreakdown() {
  const body = document.getElementById("breakdownBody");
  if (!body) return;

  const type = document.getElementById("breakdownType")?.value || "platform";
  const rows = state.breakdownRows || [];

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty">Nenhum dado encontrado para esse breakdown.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((row) => {
    const label = row.publisher_platform || row.platform_position || row.gender || row.age || row.region || "N/A";
    const spend = Number(row.spend || 0);
    const revenue = Number(row.action_values?.find(x => x.action_type.includes('purchase'))?.value || 0);
    const roas = spend > 0 ? revenue / spend : 0;
    const messages = Number(row.actions?.find(x => x.action_type.includes('message'))?.value || 0);
    const purchases = Number(row.actions?.find(x => x.action_type.includes('purchase'))?.value || 0);

    return `
      <tr>
        <td>${label}</td>
        <td>${brMoney(spend)}</td>
        <td>${brNum(messages)}</td>
        <td>${brNum(purchases)}</td>
        <td>${brMoney(revenue)}</td>
        <td>${roas.toFixed(2)}x</td>
        <td>${brPct(row.ctr)}</td>
        <td>${brMoney(row.cpm)}</td>
      </tr>
    `;
  }).join("");
}

async function loadHistory() {
  if (!state.selectedAccountId) return;
  try {
    const res = await api(`/api/adaccounts/${state.selectedAccountId}/history`);
    state.historyRows = res.data || [];
  } catch (error) {
    console.error("Erro ao carregar histórico:", error);
  }
}

function renderHistory() {
  const body = document.getElementById("historyBody");
  if (!body) return;

  const rows = state.historyRows || [];
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="12" class="empty">Rode uma análise para popular o histórico.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${new Date(row.created_at).toLocaleDateString("pt-BR")}</td>
      <td>${row.date_range || "-"}</td>
      <td>${brMoney(row.total_spend)}</td>
      <td>${brNum(row.total_messages)}</td>
      <td>${brNum(row.total_purchases)}</td>
      <td>${brMoney(row.total_revenue)}</td>
      <td>${Number(row.roas || 0).toFixed(2)}x</td>
      <td>${brPct(row.avg_ctr)}</td>
      <td>${brMoney(row.avg_cpc)}</td>
      <td>${brMoney(row.avg_cpm)}</td>
      <td>${Number(row.avg_frequency || 0).toFixed(2)}</td>
      <td>${row.health_score || 0}</td>
    </tr>
  `).join("");
}

function renderTrend() {
  const canvas = document.getElementById("trendChart");
  const fallback = document.getElementById("trendFallback");
  if (!canvas || !fallback || typeof Chart === "undefined") return;

  const rows = [...(state.historyRows || [])].reverse();

  if (state.charts.trend) {
    state.charts.trend.destroy();
    state.charts.trend = null;
  }

  if (!rows.length) {
    fallback.classList.remove("hidden");
    return;
  }

  fallback.classList.add("hidden");

  state.charts.trend = new Chart(canvas, {
    type: "line",
    data: {
      labels: rows.map((row) => new Date(row.created_at).toLocaleDateString("pt-BR")),
      datasets: [
        { label: "Score", data: rows.map((row) => Number(row.health_score || 0)) },
        { label: "ROAS", data: rows.map((row) => Number(row.roas || 0)) },
        { label: "Gasto", data: rows.map((row) => Number(row.total_spend || 0)) }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
}

async function loadSessionAndAccounts() {
  hideError();
  hideOk();

  const me = await api("/api/me");
  if (!me.authenticated) {
    window.location.href = "/";
    return;
  }

  state.me = me.user;
  const rawAccounts = await api("/api/adaccounts");
  const accounts = normalizeAccounts(rawAccounts);
  state.accounts = accounts;

  if (!accounts.length) {
    throw new Error("Nenhuma conta de anúncios encontrada.");
  }

  fillAccountSelect(accounts);
  showOk(`${accounts.length} conta(s) carregada(s).`);
}

async function runAnalysis() {
  hideError();
  hideOk();

  if (!state.selectedAccountId) {
    showError("Selecione uma conta antes de analisar.");
    return;
  }

  const runBtn = document.getElementById("runBtn");
  if (runBtn) {
    runBtn.disabled = true;
    runBtn.textContent = "Analisando...";
  }

  try {
    const dateConfig = getDateConfig();
    const query = dateConfig.type === "custom"
      ? toQuery({ since: dateConfig.since, until: dateConfig.until })
      : toQuery({ date_preset: dateConfig.date_preset });

    const [campaignsRes, insightsRes] = await Promise.all([
      api(`/api/adaccounts/${state.selectedAccountId}/campaigns`),
      api(`/api/adaccounts/${state.selectedAccountId}/insights?${query}`)
    ]);

    const analyzeRes = await api("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountData: state.selectedAccount,
        campaigns: campaignsRes.data || [],
        insights: insightsRes,
        dateRange: JSON.stringify(dateConfig),
        niche: document.getElementById("nicheSel")?.value || "Geral"
      })
    });

    state.analysis = analyzeRes.analysis;
    state.metrics = analyzeRes.metrics;
    state.decision = analyzeRes.decision;
    state.campaigns = analyzeRes.decision?.campaigns || [];

    await loadHistory();

    renderOverview();
    renderCampaigns();
    renderDecision();
    renderInsights();
    renderHistory();
    renderTrend();
    renderAudit();
    renderLpAudit();
    renderBenchmarks();

    showOk(`Análise concluída com sucesso.`);
  } catch (error) {
    console.error(error);
    showError(error.message || "Erro ao analisar.");
  } finally {
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.textContent = "Rodar Auditoria V2";
    }
  }
}

function bindTabs() {
  const buttons = document.querySelectorAll(".nav-btn");
  const sections = document.querySelectorAll(".tab-section");

  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const tab = button.dataset.tab;
      if (!tab) return;

      buttons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      sections.forEach((section) => section.classList.add("hidden"));
      const target = document.getElementById(`tab-${tab}`);
      if (target) target.classList.remove("hidden");

      if (tab === "creatives") {
        await loadCreatives();
      } else if (tab === "breakdown") {
        renderBreakdown();
      } else if (tab === "trend") {
        await loadHistory();
        renderTrend();
      } else if (tab === "history") {
        await loadHistory();
        renderHistory();
      } else if (tab === "audit") {
        renderAudit();
      } else if (tab === "lp") {
        renderLpAudit();
      } else if (tab === "benchmarks") {
        renderBenchmarks();
      }
    });
  });
}

function bindFilterGroup(groupId, callback) {
  const root = document.getElementById(groupId);
  if (!root) return;

  root.querySelectorAll(".filter-btn").forEach((button) => {
    button.addEventListener("click", () => {
      root.querySelectorAll(".filter-btn").forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      callback();
    });
  });
}

function bindAccountSelect() {
  const accountSel = document.getElementById("accountSel");
  if (!accountSel) return;

  accountSel.addEventListener("change", () => {
    state.selectedAccountId = accountSel.value;
    state.selectedAccount = state.accounts.find(a => String(a.account_id) === String(state.selectedAccountId));
  });
}

function bindEvents() {
  bindAccountSelect();
  bindTabs();
  bindFilterGroup("campaignFilters", renderCampaigns);
  bindFilterGroup("decisionFilters", renderDecision);
  bindFilterGroup("creativeFilters", renderCreatives);

  const dateSel = document.getElementById("dateSel");
  if (dateSel) {
    dateSel.addEventListener("change", () => {
      const isCustom = dateSel.value === "custom";
      document.getElementById("customDates")?.classList.toggle("hidden", !isCustom);
    });
  }

  const runBtn = document.getElementById("runBtn");
  if (runBtn) runBtn.addEventListener("click", runAnalysis);

  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      if (!state.analysis) {
        alert("Rode uma análise primeiro.");
        return;
      }
      try {
        const res = await api("/api/export-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state })
        });
        const blob = new Blob([res.markdown], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `auditoria_meta_ads_${new Date().toISOString().split('T')[0]}.md`;
        a.click();
      } catch (e) {
        alert("Erro ao exportar: " + e.message);
      }
    });
  }
}

async function init() {
  try {
    bindEvents();
    await loadSessionAndAccounts();
  } catch (error) {
    console.error("Erro no init:", error);
    showError(error.message || "Erro ao iniciar dashboard.");
  }
}

window.addEventListener("DOMContentLoaded", init);
