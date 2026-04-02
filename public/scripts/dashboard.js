const state = {
  me: null,
  accounts: [],
  selectedAccountId: null,
  selectedAccount: null,
  campaigns: [],
  metrics: null,
  historyRows: [],
  breakdownRows: []
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

function getActionValue(arr, typeList) {
  if (!Array.isArray(arr)) return 0;
  for (const type of typeList) {
    const found = arr.find((x) => String(x.action_type || "") === type);
    const value = Number(found?.value || 0);
    if (value > 0) return value;
  }
  return 0;
}

async function loadSession() {
  const me = await api("/api/me");
  if (!me.authenticated) {
    window.location.href = "/";
    return false;
  }

  state.me = me.user;
  const userName = document.getElementById("userName");
  if (userName) userName.textContent = me.user?.name || "Usuário";
  return true;
}

async function loadAccounts() {
  const res = await api("/api/adaccounts");
  const accounts = Array.isArray(res?.data) ? res.data : [];

  if (!accounts.length) {
    throw new Error("Nenhuma conta de anúncios encontrada.");
  }

  state.accounts = accounts;

  const sel = document.getElementById("accountSel");
  sel.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecione a conta";
  sel.appendChild(placeholder);

  accounts.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a.account_id;
    opt.textContent = a.name;
    sel.appendChild(opt);
  });

  sel.value = accounts[0].account_id;
  state.selectedAccountId = accounts[0].account_id;
  state.selectedAccount = accounts[0];

  sel.addEventListener("change", () => {
    state.selectedAccountId = sel.value;
    state.selectedAccount = state.accounts.find((a) => String(a.account_id) === String(sel.value)) || null;
  });

  showOk(`${accounts.length} conta(s) carregada(s) com sucesso.`);
}

function renderOverview() {
  const m = state.metrics;
  if (!m) return;

  document.getElementById("mSpend").textContent = brMoney(m.totalSpend);
  document.getElementById("mRevenue").textContent = brMoney(m.totalRev);
  document.getElementById("mRoas").textContent = `${Number(m.roas || 0).toFixed(2)}x`;
  document.getElementById("mCostPerPurchase").textContent = brMoney(m.costPerPurchase);

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
  const body = document.getElementById("campaignBody");
  if (!body) return;

  if (!state.campaigns.length) {
    body.innerHTML = `<tr><td colspan="9" class="empty">Nenhuma campanha para exibir.</td></tr>`;
    return;
  }

  body.innerHTML = state.campaigns.map((c) => `
    <tr>
      <td>${c.name || "-"}</td>
      <td>${c.status || "-"}</td>
      <td>${brMoney(c.spend)}</td>
      <td>${brNum(c.messages)}</td>
      <td>${brNum(c.purchases)}</td>
      <td>${brMoney(c.revenue)}</td>
      <td>${Number(c.roas || 0).toFixed(2)}x</td>
      <td>${brPct(c.ctr)}</td>
      <td>${brPct(c.connectRate)}</td>
    </tr>
  `).join("");
}

async function loadBreakdown() {
  hideError();
  hideOk();

  if (!state.selectedAccountId) {
    showError("Selecione uma conta antes de carregar breakdown.");
    return;
  }

  try {
    const type = document.getElementById("breakdownType").value;
    const res = await api(`/api/adaccounts/${state.selectedAccountId}/breakdown/${type}`);
    state.breakdownRows = Array.isArray(res?.data) ? res.data : [];
    renderBreakdown();
  } catch (error) {
    console.error(error);
    showError(`Erro ao carregar breakdown: ${error.message}`);
  }
}

function renderBreakdown() {
  const body = document.getElementById("breakdownBody");
  if (!body) return;

  if (!state.breakdownRows.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty">Nenhum dado de breakdown encontrado.</td></tr>`;
    return;
  }

  body.innerHTML = state.breakdownRows.map((row) => {
    const spend = Number(row.spend || 0);

    const revenue = getActionValue(row.action_values, [
      "offsite_conversion.fb_pixel_purchase",
      "purchase",
      "omni_purchase"
    ]);

    const purchases = getActionValue(row.actions, [
      "offsite_conversion.fb_pixel_purchase",
      "purchase",
      "omni_purchase"
    ]);

    const messages = getActionValue(row.actions, [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply",
      "onsite_conversion.total_messaging_connection"
    ]);

    const roas = spend > 0 ? revenue / spend : 0;

    const label =
      row.publisher_platform ||
      row.device_platform ||
      row.gender ||
      row.age ||
      row.region ||
      row.city ||
      row.platform_position ||
      "N/A";

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
  const res = await api(`/api/history/${state.selectedAccountId}`);
  state.historyRows = Array.isArray(res) ? res : [];
}

function renderHistory() {
  const body = document.getElementById("historyBody");
  if (!body) return;

  if (!state.historyRows.length) {
    body.innerHTML = `<tr><td colspan="11" class="empty">Sem histórico salvo ainda.</td></tr>`;
    return;
  }

  body.innerHTML = state.historyRows.map((r) => `
    <tr>
      <td>${new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
      <td>${brMoney(r.total_spend)}</td>
      <td>${brNum(r.total_messages)}</td>
      <td>${brNum(r.total_purchases)}</td>
      <td>${brMoney(r.total_revenue)}</td>
      <td>${Number(r.roas || 0).toFixed(2)}x</td>
      <td>${brPct(r.avg_ctr)}</td>
      <td>${brMoney(r.avg_cpc)}</td>
      <td>${brMoney(r.avg_cpm)}</td>
      <td>${Number(r.avg_frequency || 0).toFixed(2)}</td>
      <td>${brNum(r.health_score)}</td>
    </tr>
  `).join("");
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
    const date_preset = document.getElementById("dateSel").value;

    const campaigns = await api(`/api/adaccounts/${state.selectedAccountId}/campaigns`);
    const insights = await api(`/api/adaccounts/${state.selectedAccountId}/insights?date_preset=${date_preset}`);

    const res = await api("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountData: state.selectedAccount,
        campaigns: campaigns.data || [],
        insights,
        dateRange: JSON.stringify({ type: "preset", date_preset })
      })
    });

    state.metrics = res.metrics;
    state.campaigns = res.decision?.campaigns || [];

    await loadHistory();

    renderOverview();
    renderCampaigns();
    renderHistory();

    showOk("Análise concluída com sucesso.");
  } catch (error) {
    console.error(error);
    showError(`Erro ao analisar: ${error.message}`);
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Rodar análise";
  }
}

async function init() {
  try {
    const ok = await loadSession();
    if (!ok) return;

    await loadAccounts();

    document.getElementById("runBtn").addEventListener("click", runAnalysis);
    document.getElementById("breakdownBtn").addEventListener("click", loadBreakdown);
  } catch (error) {
    console.error(error);
    showError(`Erro ao iniciar dashboard: ${error.message}`);
    const sel = document.getElementById("accountSel");
    if (sel) {
      sel.innerHTML = `<option value="">Erro ao carregar contas</option>`;
    }
  }
}

window.addEventListener("DOMContentLoaded", init);
