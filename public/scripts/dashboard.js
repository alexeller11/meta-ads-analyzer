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

  const accountsCount = document.getElementById("accountsCount");
  if (accountsCount) accountsCount.textContent = String(accounts.length);

  if (accounts.length > 0) {
    accountSel.value = String(accounts[0].account_id);
    state.selectedAccountId = String(accounts[0].account_id);
    state.selectedAccount = accounts[0];

    const selectedName = document.getElementById("selectedAccountName");
    if (selectedName) selectedName.textContent = accounts[0].name || "—";
  } else {
    const selectedName = document.getElementById("selectedAccountName");
    if (selectedName) selectedName.textContent = "—";
  }
}

function bindAccountSelect() {
  const accountSel = document.getElementById("accountSel");
  if (!accountSel) return;

  accountSel.addEventListener("change", () => {
    const selectedId = String(accountSel.value || "");
    state.selectedAccountId = selectedId;
    state.selectedAccount =
      state.accounts.find((acc) => String(acc.account_id) === selectedId) || null;

    const selectedName = document.getElementById("selectedAccountName");
    if (selectedName) selectedName.textContent = state.selectedAccount?.name || "—";
  });
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

function getActiveFilter(groupId) {
  return document.querySelector(`#${groupId} .filter-btn.active`)?.dataset.filter || "TODAS";
}

function getLifecycleStatus(campaign) {
  const status = String(campaign.status || "").toUpperCase();
  const spend = Number(campaign.spend || 0);
  const stopTime = campaign.stop_time ? new Date(campaign.stop_time) : null;
  const now = new Date();

  if (status === "PAUSED") return "PAUSADA";
  if (stopTime && stopTime < now) return "CONCLUIDA";
  if (status === "ACTIVE" && spend > 0) return "RODANDO";
  if (status === "ACTIVE") return "ATIVA";
  return "ATIVA";
}

function getActionBadgeClass(action) {
  if (action === "ESCALAR") return "success";
  if (action === "PAUSAR") return "danger";
  if (action === "RENOVAR_CRIATIVO") return "warning";
  return "primary";
}

function getMetricsFromActions(actions = [], values = []) {
  const getVal = (arr, types) => {
    if (!arr) return 0;
    const found = arr.find(x => types.includes(x.action_type));
    return parseFloat(found?.value || 0);
  };
  return {
    pur: getVal(actions, ["purchase", "offsite_conversion.fb_pixel_purchase"]),
    msg: getVal(actions, ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection"]),
    rev: getVal(values, ["purchase", "offsite_conversion.fb_pixel_purchase"])
  };
}

function renderOverview() {
  const metrics = state.metrics || {};
  const summary = state.analysis?.resumo_geral || {};
  const decision = state.decision || {};

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText("healthScore", summary.score_saude || 0);
  setText("healthTitle", summary.nivel_saude || "Sem análise ainda");
  setText("healthSummary", summary.resumo_historico || "Selecione uma conta no topo e rode a análise.");

  setText("summarySpend", `Investimento: ${brMoney(metrics.totalSpend)}`);
  setText("summaryRoas", `ROAS: ${Number(metrics.roas || 0).toFixed(2)}x`);
  setText("summaryCtr", `CTR: ${brPct(metrics.avgCtr)}`);
  setText("summaryConnect", `Connect Rate: ${brPct(metrics.connectRate)}`);

  setText("heroScale", decision.summary?.scaleCount || 0);
  setText("heroPause", decision.summary?.pauseCount || 0);

  setText("mSpend", brMoney(metrics.totalSpend));
  setText("mRevenue", brMoney(metrics.totalRev));
  setText("mRoas", `${Number(metrics.roas || 0).toFixed(2)}x`);
  setText("mCostPerPurchase", brMoney(metrics.costPerPurchase));
  setText("mImpressions", brNum(metrics.totalImpressions));
  setText("mReach", brNum(metrics.totalReach));
  setText("mFrequency", Number(metrics.avgFrequency || 0).toFixed(2));
  setText("mCpm", brMoney(metrics.avgCpm));
  setText("mCtr", brPct(metrics.avgCtr));
  setText("mCpc", brMoney(metrics.avgCpc));
  setText("mConnectRate", brPct(metrics.connectRate));
  setText("mMessages", brNum(metrics.totalMessages));
  setText("mPurchases", brNum(metrics.totalPurchases));
}

function renderComparison() {
  const body = document.getElementById("comparisonBody");
  if (!body) return;

  if (!state.comparison || !state.comparison.current || !state.comparison.previous) {
    body.innerHTML = `<tr><td colspan="4" class="empty">Ative a comparação para visualizar.</td></tr>`;
    return;
  }

  const current = state.comparison.current;
  const previous = state.comparison.previous;
  const comp = state.comparison.comparison || {};

  const rows = [
    ["Investimento", brMoney(current.totalSpend), brMoney(previous.totalSpend), `${Number(comp.spendChange || 0).toFixed(2)}%`],
    ["ROAS", `${Number(current.roas || 0).toFixed(2)}x`, `${Number(previous.roas || 0).toFixed(2)}x`, `${Number(comp.roasChange || 0).toFixed(2)}%`],
    ["CTR", brPct(current.avgCtr), brPct(previous.avgCtr), `${Number(comp.ctrChange || 0).toFixed(2)}%`],
    ["Compras", brNum(current.totalPurchases), brNum(previous.totalPurchases), `${Number(comp.purchasesChange || 0).toFixed(2)}%`],
    ["Connect Rate", brPct(current.connectRate), brPct(previous.connectRate), `${Number(comp.connectRateChange || 0).toFixed(2)}%`]
  ];

  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${row[0]}</td>
      <td>${row[1]}</td>
      <td>${row[2]}</td>
      <td>${row[3]}</td>
    </tr>
  `).join("");
}

function renderCampaigns() {
  const body = document.getElementById("campaignBody");
  if (!body) return;

  const campaigns = state.analysis?.campanhas_analise || [];
  const filter = getActiveFilter("campaignFilters");

  const filtered = campaigns.filter((campaign) => {
    if (filter === "TODAS") return true;
    return getLifecycleStatus(campaign) === filter;
  });

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty">Nenhuma campanha encontrada para esse filtro.</td></tr>`;
    return;
  }

  body.innerHTML = filtered.map((campaign) => `
    <tr>
      <td>${campaign.name}</td>
      <td><span class="badge primary">${getLifecycleStatus(campaign)}</span></td>
      <td>${brMoney(campaign.spend)}</td>
      <td>${brNum(campaign.msg || 0)}</td>
      <td>${brNum(campaign.pur || 0)}</td>
      <td>${brMoney(campaign.rev || 0)}</td>
      <td>${Number(campaign.roas || 0).toFixed(2)}x</td>
      <td>${brPct(campaign.ctr)}</td>
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
  const container = document.getElementById("auditContent");
  if (!container || !state.analysis?.audit_v2) return;
  
  const audit = state.analysis.audit_v2;
  container.innerHTML = `
    <div class="grid">
      <div class="metric-card">
        <div class="metric-label">Audit Score</div>
        <div class="metric-value">${audit.score}/100</div>
        <div class="metric-sub">Nota Geral: ${audit.grade}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Desperdício Estimado</div>
        <div class="metric-value">${brMoney(audit.total_waste)}</div>
        <div class="metric-sub">Potencial de economia</div>
      </div>
    </div>
    <div class="card" style="margin-top: 20px;">
      <div class="card-head"><h3 class="card-title">Alertas Críticos</h3></div>
      <div class="rec-list">
        ${(audit.critical_alerts || []).map(a => `
          <div class="rec-item">
            <div class="rec-title" style="color: var(--danger)">${a.message}</div>
          </div>
        `).join("") || '<div class="empty">Nenhum alerta crítico encontrado.</div>'}
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
    body.innerHTML = `<tr><td colspan="6" class="empty">Selecione uma conta primeiro.</td></tr>`;
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
    body.innerHTML = `<tr><td colspan="6" class="empty">Erro ao carregar breakdown.</td></tr>`;
  }
}

function getBreakdownLabel(row, type) {
  if (type === "platform") return row.publisher_platform || "N/A";
  if (type === "position") return row.platform_position || "N/A";
  if (type === "gender") return row.gender || "N/A";
  if (type === "age") return row.age || "N/A";
  if (type === "region") return row.region || "N/A";
  if (type === "city") return row.city || "N/A";
  if (type === "device") return row.device_platform || "N/A";
  return "N/A";
}

function renderBreakdown() {
  const body = document.getElementById("breakdownBody");
  if (!body) return;

  const type = document.getElementById("breakdownType")?.value || "platform";
  const rows = [...(state.breakdownRows || [])];

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">Selecione o tipo e clique em carregar.</td></tr>`;
    return;
  }

  rows.sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0));

  body.innerHTML = rows.map((row) => {
    const m = getMetricsFromActions(row.actions, row.action_values);
    const roas = row.spend > 0 ? m.rev / row.spend : 0;
    return `
      <tr>
        <td>${getBreakdownLabel(row, type)}</td>
        <td>${brMoney(row.spend)}</td>
        <td>${brNum(m.msg)}</td>
        <td>${brNum(m.pur)}</td>
        <td>${brMoney(m.rev)}</td>
        <td>${roas.toFixed(2)}x</td>
        <td>${brPct(row.ctr)}</td>
        <td>${brMoney(row.cpc)}</td>
      </tr>
    `;
  }).join("");
}

async function loadHistory() {
  const body = document.getElementById("historyBody");
  if (!body) return;

  if (!state.selectedAccountId) {
    body.innerHTML = `<tr><td colspan="12" class="empty">Selecione uma conta primeiro.</td></tr>`;
    return;
  }

  try {
    const res = await api(`/api/history/${state.selectedAccountId}`);
    state.historyRows = Array.isArray(res) ? res : [];
  } catch (error) {
    console.error(error);
    state.historyRows = [];
  }
}

function renderHistory() {
  const body = document.getElementById("historyBody");
  if (!body) return;

  const rows = state.historyRows || [];
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="12" class="empty">Sem histórico salvo ainda.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${new Date(row.created_at).toLocaleDateString("pt-BR")}</td>
      <td>${row.date_range || "-"}</td>
      <td>${brMoney(row.total_spend)}</td>
      <td>${brNum(row.total_messages || 0)}</td>
      <td>${brNum(row.total_purchases || 0)}</td>
      <td>${brMoney(row.total_revenue || 0)}</td>
      <td>${Number(row.roas || 0).toFixed(2)}x</td>
      <td>${brPct(row.avg_ctr)}</td>
      <td>${brMoney(row.avg_cpc)}</td>
      <td>${brMoney(row.avg_cpm)}</td>
      <td>${Number(row.avg_frequency || 0).toFixed(2)}</td>
      <td>${brNum(row.health_score)}</td>
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
  const userName = document.getElementById("userName");
  if (userName) userName.textContent = me.user?.name || "Usuário";

  const rawAccounts = await api("/api/adaccounts");
  const accounts = normalizeAccounts(rawAccounts);
  state.accounts = accounts;

  if (!accounts.length) {
    throw new Error("A API respondeu, mas nenhuma conta válida foi encontrada para montar o seletor.");
  }

  fillAccountSelect(accounts);
  showOk(`${accounts.length} conta(s) carregada(s) com sucesso.`);
}

async function loadComparison(dateConfig) {
  const compareEl = document.getElementById("comparePeriod");
  const compareEnabled = compareEl?.checked;

  if (!compareEnabled) {
    state.comparison = null;
    renderComparison();
    return;
  }

  if (!state.selectedAccountId) return;

  if (dateConfig.type === "custom") {
    state.comparison = null;
    renderComparison();
    return;
  }

  const supported = ["last_7d", "last_30d", "last_90d"];
  if (!supported.includes(dateConfig.date_preset)) {
    state.comparison = null;
    renderComparison();
    return;
  }

  try {
    state.comparison = await api(
      `/api/adaccounts/${state.selectedAccountId}/comparison?${toQuery({ date_preset: dateConfig.date_preset })}`
    );
  } catch (error) {
    console.error("Erro ao carregar comparação:", error);
    state.comparison = null;
  }

  renderComparison();
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

    if (dateConfig.type === "custom" && (!dateConfig.since || !dateConfig.until)) {
      throw new Error("Preencha as duas datas do período personalizado.");
    }

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

    await loadComparison(dateConfig);
    await loadHistory();

    renderOverview();
    renderCampaigns();
    renderDecision();
    renderInsights();
    renderHistory();
    renderTrend();

    showOk(`Análise concluída para ${state.selectedAccount?.name || "a conta selecionada"}.`);
  } catch (error) {
    console.error(error);
    showError(error.message || "Erro ao analisar.");
  } finally {
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.textContent = "Analisar";
    }
  }
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
      document.getElementById("sinceDate")?.classList.toggle("hidden", !isCustom);
      document.getElementById("untilDate")?.classList.toggle("hidden", !isCustom);
    });
  }

  const runBtn = document.getElementById("runBtn");
  if (runBtn) runBtn.addEventListener("click", runAnalysis);

  const loadBreakdownBtn = document.getElementById("loadBreakdownBtn");
  if (loadBreakdownBtn) loadBreakdownBtn.addEventListener("click", loadBreakdown);
}

async function init() {
  try {
    bindEvents();
    await loadSessionAndAccounts();
    renderComparison();
  } catch (error) {
    console.error("Erro no init:", error);
    showError(error.message || "Erro ao iniciar dashboard.");
    const accountSel = document.getElementById("accountSel");
    if (accountSel) {
      accountSel.innerHTML = `<option value="">Erro ao carregar contas</option>`;
    }
  }
}

window.addEventListener("DOMContentLoaded", init);
