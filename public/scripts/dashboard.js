const state = {
  me: null,
  accounts: [],
  selectedAccountId: null,
  selectedAccount: null,
  analysis: null,
  metrics: null,
  decision: null
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

  accountSel.addEventListener("change", () => {
    const selectedId = String(accountSel.value || "");
    state.selectedAccountId = selectedId;
    state.selectedAccount =
      state.accounts.find((acc) => String(acc.account_id) === selectedId) || null;

    document.getElementById("selectedAccountName").textContent =
      state.selectedAccount?.name || "—";
  });
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
  document.getElementById("mRoas").textContent =
    `${Number(metrics.roas || 0).toFixed(2)}x`;
  document.getElementById("mCostPerPurchase").textContent =
    brMoney(metrics.costPerPurchase);
}

function renderCampaigns() {
  const body = document.getElementById("campaignBody");
  const campaigns = state.analysis?.campanhas_analise || [];

  if (!campaigns.length) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="empty">Rode uma análise para ver campanhas.</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = campaigns
    .map(
      (campaign) => `
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
      `
    )
    .join("");
}

function getDateConfig() {
  return {
    type: "preset",
    date_preset: document.getElementById("dateSel").value
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
  document.getElementById("userName").textContent = me.user?.name || "Usuário";

  const rawAccounts = await api("/api/adaccounts");
  console.log("RAW /api/adaccounts", rawAccounts);

  const accounts = normalizeAccounts(rawAccounts);
  state.accounts = accounts;

  if (!accounts.length) {
    showError("A API respondeu, mas nenhuma conta válida foi encontrada para montar o seletor.");
    return;
  }

  fillAccountSelect(accounts);
  showOk(`${accounts.length} conta(s) carregada(s) com sucesso.`);
}

async function runAnalysis() {
  hideError();
  hideOk();

  if (!state.selectedAccountId) {
    showError("Selecione uma conta antes de analisar.");
    return;
  }

  const runBtn = document.getElementById("runBtn");
  runBtn.disabled = true;
  runBtn.textContent = "Analisando...";

  try {
    const dateConfig = getDateConfig();
    const query = toQuery({ date_preset: dateConfig.date_preset });

    const [campaignsRes, insightsRes] = await Promise.all([
      api(`/api/adaccounts/${state.selectedAccountId}/campaigns`),
      api(`/api/adaccounts/${state.selectedAccountId}/insights?${query}`)
    ]);

    const analyzeRes = await api("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
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

    renderOverview();
    renderCampaigns();
    showOk(`Análise concluída para ${state.selectedAccount?.name || "a conta selecionada"}.`);
  } catch (error) {
    console.error(error);
    showError(error.message || "Erro ao analisar.");
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Analisar";
  }
}

function bindEvents() {
  bindAccountSelect();
  document.getElementById("runBtn").addEventListener("click", runAnalysis);
}

async function init() {
  bindEvents();
  await loadSessionAndAccounts();
}

init();
