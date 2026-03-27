const state = {
  me: null,
  accounts: [],
  selectedAccountId: null,
  selectedAccount: null,
  analysis: null,
  metrics: null,
  decision: null,
  comparison: null
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
  box.textContent = message;
  box.classList.remove("hidden");
}

function hideError() {
  document.getElementById("globalError").classList.add("hidden");
}

function showOk(message) {
  const box = document.getElementById("globalOk");
  box.textContent = message;
  box.classList.remove("hidden");
}

function hideOk() {
  document.getElementById("globalOk").classList.add("hidden");
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

  document.getElementById("accountsCount").textContent = String(accounts.length);

  if (accounts.length > 0) {
    accountSel.value = String(accounts[0].account_id);
    state.selectedAccountId = String(accounts[0].account_id);
    state.selectedAccount = accounts[0];
    document.getElementById("selectedAccountName").textContent = accounts[0].name || "—";
  } else {
    document.getElementById("selectedAccountName").textContent = "—";
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

    document.getElementById("selectedAccountName").textContent =
      state.selectedAccount?.name || "—";
  });
}

function bindTabs() {
  const buttons = document.querySelectorAll(".nav-btn");
  const sections = document.querySelectorAll(".tab-section");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      if (!tab) return;

      buttons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      sections.forEach((section) => section.classList.add("hidden"));
      const target = document.getElementById(`tab-${tab}`);
      if (target) target.classList.remove("hidden");
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

function renderOverview() {
  const metrics = state.metrics || {};
  const summary = state.analysis?.resumo_geral || {};
  const decision = state.decision || {};

  document.getElementById("healthScore").textContent = summary.score_saude || 0;
  document.getElementById("healthTitle").textContent =
    summary.nivel_saude || "Sem análise ainda";
  document.getElementById("healthSummary").textContent =
    summary.resumo_historico || "Selecione uma conta no topo e rode a análise.";

  document.getElementById("summarySpend").textContent =
    `Investimento: ${brMoney(metrics.totalSpend)}`;
  document.getElementById("summaryRoas").textContent =
    `ROAS: ${Number(metrics.roas || 0).toFixed(2)}x`;
  document.getElementById("summaryCtr").textContent =
    `CTR: ${brPct(metrics.avgCtr)}`;
  document.getElementById("summaryConnect").textContent =
    `Connect Rate: ${brPct(metrics.connectRate)}`;

  document.getElementById("heroScale").textContent =
    decision.summary?.scaleCount || 0;
  document.getElementById("heroPause").textContent =
    decision.summary?.pauseCount || 0;

  document.getElementById("mSpend").textContent = brMoney(metrics.totalSpend);
  document.getElementById("mRevenue").textContent = brMoney(metrics.totalRev);
  document.getElementById("mRoas").textContent = `${Number(metrics.roas || 0).toFixed(2)}x`;
  document.getElementById("mCostPerPurchase").textContent = brMoney(metrics.costPerPurchase);

  document.getElementById("mImpressions").textContent = brNum(metrics.totalImpressions);
  document.getElementById("mReach").textContent = brNum(metrics.totalReach);
  document.getElementById("mFrequency").textContent = Number(metrics.avgFrequency || 0).toFixed(2);
  document.getElementById("mCpm").textContent = brMoney(metrics.avgCpm);

  document.getElementById("mCtr").textContent = brPct(metrics.avgCtr);
  document.getElementById("mCpc").textContent = brMoney(metrics.avgCpc);
  document.getElementById("mConnectRate").textContent = brPct(metrics.connectRate);
  document.getElementById("mMessages").textContent = brNum(metrics.totalMessages);
  document.getElementById("mPurchases").textContent = brNum(metrics.totalPurchases);
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
      <td>${brNum(campaign.impressions)}</td>
      <td>${brNum(campaign.reach)}</td>
      <td>${brPct(campaign.ctr)}</td>
      <td>${brPct(campaign.connectRate)}</td>
      <td>${Number(campaign.roas || 0).toFixed(2)}x</td>
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

function getDateConfig() {
  const preset = document.getElementById("dateSel").value;

  if (preset === "custom") {
    return {
      type: "custom",
      since: document.getElementById("sinceDate").value,
      until: document.getElementById("untilDate").value
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
        niche: document.getElementById("nicheSel").value
      })
    });

    state.analysis = analyzeRes.analysis;
    state.metrics = analyzeRes.metrics;
    state.decision = analyzeRes.decision;

    await loadComparison(dateConfig);

    renderOverview();
    renderCampaigns();
    renderDecision();
    renderInsights();

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

  const dateSel = document.getElementById("dateSel");
  if (dateSel) {
    dateSel.addEventListener("change", () => {
      const isCustom = dateSel.value === "custom";
      document.getElementById("sinceDate")?.classList.toggle("hidden", !isCustom);
      document.getElementById("untilDate")?.classList.toggle("hidden", !isCustom);
    });
  }

  const runBtn = document.getElementById("runBtn");
  if (runBtn) {
    runBtn.addEventListener("click", runAnalysis);
  }
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
