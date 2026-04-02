const state = {
  me: null,
  accounts: [],
  selectedAccountId: null,
  selectedAccount: null,
  campaigns: [],
  metrics: null,
  historyRows: [],
  breakdownRows: [],
  creatives: [],
  trendChart: null
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

function getDateQuery() {
  const preset = document.getElementById("dateSel").value;
  if (preset === "custom") {
    const since = document.getElementById("sinceDate").value;
    const until = document.getElementById("untilDate").value;
    return `since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`;
  }
  return `date_preset=${encodeURIComponent(preset)}`;
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

  accounts.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a.account_id;
    opt.textContent = a.name;
    sel.appendChild(opt);
  });

  state.selectedAccountId = accounts[0].account_id;
  state.selectedAccount = accounts[0];
  sel.value = accounts[0].account_id;

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

  body.innerHTML = state.campaigns
    .map(
      (c) => `
      <tr>
        <td>${c.name || "-"}</td>
        <td>${c.lifecycleStatus || c.status || "-"}</td>
        <td>${brMoney(c.spend)}</td>
        <td>${brNum(c.messages)}</td>
        <td>${brNum(c.purchases)}</td>
        <td>${brMoney(c.revenue)}</td>
        <td>${Number(c.roas || 0).toFixed(2)}x</td>
        <td>${brPct(c.ctr)}</td>
        <td>${brPct(c.connectRate)}</td>
      </tr>
    `
    )
    .join("");
}

function renderDecision() {
  const body = document.getElementById("decisionBody");
  if (!body) return;

  if (!state.campaigns.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty">Nenhuma decisão para exibir.</td></tr>`;
    return;
  }

  body.innerHTML = state.campaigns
    .map(
      (c) => `
      <tr>
        <td>${c.name || "-"}</td>
        <td>${c.lifecycleStatus || c.status || "-"}</td>
        <td>${c.decision?.action || "MANTER"}</td>
        <td>${c.decision?.reason || "-"}</td>
        <td>${brMoney(c.spend)}</td>
        <td>${Number(c.roas || 0).toFixed(2)}x</td>
        <td>${brPct(c.connectRate)}</td>
      </tr>
    `
    )
    .join("");
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
    const res = await api(`/api/adaccounts/${state.selectedAccountId}/breakdown/${type}?${getDateQuery()}`);
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

  body.innerHTML = state.breakdownRows
    .map((row) => {
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
    })
    .join("");
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
    body.innerHTML = `<tr><td colspan="15" class="empty">Sem histórico salvo ainda.</td></tr>`;
    return;
  }

  body.innerHTML = state.historyRows
    .map(
      (r) => `
      <tr>
        <td>${new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
        <td>${brMoney(r.total_spend)}</td>
        <td>${brMoney(r.total_revenue)}</td>
        <td>${Number(r.roas || 0).toFixed(2)}x</td>
        <td>${brMoney(r.cost_per_purchase)}</td>
        <td>${brNum(r.total_impressions)}</td>
        <td>${brNum(r.total_reach)}</td>
        <td>${Number(r.avg_frequency || 0).toFixed(2)}</td>
        <td>${brMoney(r.avg_cpm)}</td>
        <td>${brPct(r.avg_ctr)}</td>
        <td>${brMoney(r.avg_cpc)}</td>
        <td>${brPct(r.connect_rate)}</td>
        <td>${brNum(r.total_messages)}</td>
        <td>${brNum(r.total_purchases)}</td>
        <td>${brNum(r.health_score)}</td>
      </tr>
    `
    )
    .join("");
}

async function loadCreatives() {
  hideError();

  if (!state.selectedAccountId) {
    showError("Selecione uma conta antes de carregar criativos.");
    return;
  }

  try {
    const res = await api(`/api/adaccounts/${state.selectedAccountId}/creatives?${getDateQuery()}`);
    state.creatives = Array.isArray(res?.data) ? res.data : [];
    renderCreatives();
  } catch (error) {
    console.error(error);
    showError(`Erro ao carregar criativos: ${error.message}`);
  }
}

function creativeMetrics(item) {
  const ins = item?.insights?.data?.[0] || {};
  const spend = Number(ins.spend || 0);
  const revenue = getActionValue(ins.action_values, [
    "offsite_conversion.fb_pixel_purchase",
    "purchase",
    "omni_purchase"
  ]);
  const purchases = getActionValue(ins.actions, [
    "offsite_conversion.fb_pixel_purchase",
    "purchase",
    "omni_purchase"
  ]);
  const messages = getActionValue(ins.actions, [
    "onsite_conversion.messaging_conversation_started_7d",
    "onsite_conversion.messaging_first_reply",
    "onsite_conversion.total_messaging_connection"
  ]);
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

function renderCreatives() {
  const grid = document.getElementById("creativesGrid");
  if (!grid) return;

  if (!state.creatives.length) {
    grid.innerHTML = `<div class="empty-card">Nenhum criativo encontrado.</div>`;
    return;
  }

  const sort = document.getElementById("creativeSort").value;
  const list = [...state.creatives];

  list.sort((a, b) => {
    const ma = creativeMetrics(a);
    const mb = creativeMetrics(b);
    if (sort === "messages") return mb.messages - ma.messages;
    if (sort === "purchases") return mb.purchases - ma.purchases;
    return mb.roas - ma.roas;
  });

  grid.innerHTML = list
    .map((item, index) => {
      const m = creativeMetrics(item);
      const image =
        item?.creative?.image_url ||
        item?.creative?.thumbnail_url ||
        "";

      return `
        <div class="creative-card">
          ${image ? `<img src="${image}" alt="Criativo">` : `<div class="creative-image-placeholder">Sem imagem</div>`}
          <div class="creative-info">
            <div class="creative-title">${item.name || "Criativo sem nome"}</div>
            <div class="creative-line">Gasto: ${brMoney(m.spend)}</div>
            <div class="creative-line">Receita: ${brMoney(m.revenue)}</div>
            <div class="creative-line">ROAS: ${m.roas.toFixed(2)}x</div>
            <div class="creative-line">CTR: ${brPct(m.ctr)}</div>
            <div class="creative-line">Mensagens: ${brNum(m.messages)}</div>
            <div class="creative-line">Compras: ${brNum(m.purchases)}</div>
            ${sort === "champion" && index === 0 ? `<div class="creative-badge">Criativo campeão</div>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderTrend() {
  const canvas = document.getElementById("trendChart");
  if (!canvas) return;

  if (state.trendChart) {
    state.trendChart.destroy();
    state.trendChart = null;
  }

  const rows = [...state.historyRows].reverse();
  if (!rows.length) return;

  state.trendChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: rows.map((r) => new Date(r.created_at).toLocaleDateString("pt-BR")),
      datasets: [
        {
          label: "ROAS",
          data: rows.map((r) => Number(r.roas || 0))
        },
        {
          label: "Investimento",
          data: rows.map((r) => Number(r.total_spend || 0))
        },
        {
          label: "Score",
          data: rows.map((r) => Number(r.health_score || 0))
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
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
    const campaigns = await api(`/api/adaccounts/${state.selectedAccountId}/campaigns`);
    const insights = await api(`/api/adaccounts/${state.selectedAccountId}/insights?${getDateQuery()}`);

    const res = await api("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountData: state.selectedAccount,
        campaigns: campaigns.data || [],
        insights,
        dateRange: getDateQuery()
      })
    });

    state.metrics = res.metrics;
    state.campaigns = res.decision?.campaigns || [];

    await loadHistory();

    renderOverview();
    renderCampaigns();
    renderDecision();
    renderHistory();
    renderTrend();

    showOk("Análise concluída com sucesso.");
  } catch (error) {
    console.error(error);
    showError(`Erro ao analisar: ${error.message}`);
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Rodar análise";
  }
}

function bindTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));

      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");
    });
  });
}

async function init() {
  try {
    const ok = await loadSession();
    if (!ok) return;

    await loadAccounts();

    bindTabs();

    document.getElementById("runBtn").addEventListener("click", runAnalysis);
    document.getElementById("breakdownBtn").addEventListener("click", loadBreakdown);
    document.getElementById("creativeBtn").addEventListener("click", loadCreatives);
    document.getElementById("creativeSort").addEventListener("change", renderCreatives);

    document.getElementById("dateSel").addEventListener("change", () => {
      const custom = document.getElementById("dateSel").value === "custom";
      document.getElementById("customDates").classList.toggle("hidden", !custom);
    });
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
