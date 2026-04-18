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
  box.classList.add("show");
}

function hideError() {
  const box = document.getElementById("globalError");
  if (!box) return;
  box.classList.remove("show");
}

function showOk(message) {
  const box = document.getElementById("globalOk");
  if (!box) return;
  box.textContent = message;
  box.classList.add("show");
  setTimeout(() => box.classList.remove("show"), 5000);
}

function hideOk() {
  const box = document.getElementById("globalOk");
  if (!box) return;
  box.classList.remove("show");
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
  try {
    const me = await api("/api/me");
    if (!me.authenticated) {
      window.location.href = "/";
      return false;
    }

    state.me = me.user;
    const userName = document.getElementById("userName");
    if (userName) userName.textContent = me.user?.name || "Usuário";
    return true;
  } catch (e) {
    console.error("Erro de sessão:", e);
    window.location.href = "/";
    return false;
  }
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

function updateScoreRing(score) {
  const circle = document.getElementById("scoreCircle");
  const num = document.getElementById("scoreNum");
  if (!circle || !num) return;

  const val = Math.max(0, Math.min(100, Number(score || 0)));
  num.textContent = Math.round(val);

  // Perímetro do círculo r=42 é 2 * PI * 42 = 263.89
  const offset = 264 - (val / 100) * 264;
  circle.style.strokeDashoffset = offset;

  // Cor baseada no score
  if (val >= 80) circle.style.stroke = "var(--success)";
  else if (val >= 50) circle.style.stroke = "var(--warning)";
  else circle.style.stroke = "var(--danger)";
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

  // Score e Saúde
  const score = state.historyRows?.[0]?.health_score || 0;
  updateScoreRing(score);

  const hTitle = document.getElementById("healthTitle");
  const hDesc = document.getElementById("healthDesc");
  if (score >= 80) {
    hTitle.textContent = "Excelente Performance";
    hDesc.textContent = "Sua conta apresenta métricas sólidas. Continue escalando as campanhas vencedoras.";
  } else if (score >= 50) {
    hTitle.textContent = "Atenção Necessária";
    hDesc.textContent = "Existem oportunidades de otimização em algumas campanhas. Verifique a Central de Decisão.";
  } else {
    hTitle.textContent = "Performance Crítica";
    hDesc.textContent = "Métricas abaixo do esperado. Recomendamos revisar criativos e públicos imediatamente.";
  }
}

function renderCampaigns() {
  const body = document.getElementById("campaignBody");
  if (!body) return;

  if (!state.campaigns.length) {
    body.innerHTML = `<tr><td colspan="9" class="empty-state">Nenhuma campanha para exibir.</td></tr>`;
    return;
  }

  body.innerHTML = state.campaigns
    .map(
      (c) => `
      <tr>
        <td class="td-name">${c.name || "-"}</td>
        <td><span class="badge ${c.status === 'ACTIVE' ? 'badge-success' : 'badge-muted'}">${c.status || "-"}</span></td>
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
    body.innerHTML = `<tr><td colspan="7" class="empty-state">Nenhuma decisão para exibir.</td></tr>`;
    return;
  }

  body.innerHTML = state.campaigns
    .map(
      (c) => {
        const action = c.decision?.action || "MANTER";
        let badgeClass = "badge-muted";
        if (action === "ESCALAR") badgeClass = "badge-success";
        if (action === "PAUSAR") badgeClass = "badge-danger";
        if (action === "REVISAR") badgeClass = "badge-purple";

        return `
        <tr>
          <td class="td-name">${c.name || "-"}</td>
          <td><span class="badge ${c.status === 'ACTIVE' ? 'badge-success' : 'badge-muted'}">${c.status || "-"}</span></td>
          <td><span class="badge ${badgeClass}">${action}</span></td>
          <td style="white-space: normal; min-width: 200px; font-size: 12px;">${c.decision?.reason || "-"}</td>
          <td>${brMoney(c.spend)}</td>
          <td>${Number(c.roas || 0).toFixed(2)}x</td>
          <td>${brPct(c.connectRate)}</td>
        </tr>
      `;
      }
    )
    .join("");
}

async function loadBreakdown() {
  hideError();
  if (!state.selectedAccountId) {
    showError("Selecione uma conta antes.");
    return;
  }

  const btn = document.getElementById("breakdownBtn");
  btn.disabled = true;
  btn.textContent = "...";

  try {
    const type = document.getElementById("breakdownType").value;
    const res = await api(`/api/adaccounts/${state.selectedAccountId}/breakdown/${type}?${getDateQuery()}`);
    state.breakdownRows = Array.isArray(res?.data) ? res.data : [];
    renderBreakdown();
  } catch (error) {
    showError(`Erro: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Carregar Breakdown";
  }
}

function renderBreakdown() {
  const body = document.getElementById("breakdownBody");
  if (!body) return;

  if (!state.breakdownRows.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-state">Nenhum dado encontrado.</td></tr>`;
    return;
  }

  body.innerHTML = state.breakdownRows
    .map((row) => {
      const spend = Number(row.spend || 0);
      const revenue = getActionValue(row.action_values, ["offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"]);
      const purchases = getActionValue(row.actions, ["offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"]);
      const messages = getActionValue(row.actions, ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.messaging_first_reply", "onsite_conversion.total_messaging_connection"]);
      const roas = spend > 0 ? revenue / spend : 0;

      const label = row.publisher_platform || row.device_platform || row.gender || row.age || row.region || row.city || "N/A";

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
    body.innerHTML = `<tr><td colspan="11" class="empty-state">Sem histórico salvo.</td></tr>`;
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
        <td>${brPct(r.avg_ctr)}</td>
        <td>${brPct(r.connect_rate)}</td>
        <td>${brNum(r.total_messages)}</td>
        <td>${brNum(r.total_purchases)}</td>
        <td><span class="badge ${r.health_score >= 80 ? 'badge-success' : (r.health_score >= 50 ? 'badge-lime' : 'badge-danger')}">${r.health_score}</span></td>
      </tr>
    `
    )
    .join("");
}

async function loadCreatives() {
  hideError();
  if (!state.selectedAccountId) {
    showError("Selecione uma conta.");
    return;
  }

  const btn = document.getElementById("creativeBtn");
  btn.disabled = true;
  btn.textContent = "...";

  try {
    const res = await api(`/api/adaccounts/${state.selectedAccountId}/creatives?${getDateQuery()}`);
    state.creatives = Array.isArray(res?.data) ? res.data : [];
    renderCreatives();
  } catch (error) {
    showError(`Erro: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Carregar Criativos";
  }
}

function creativeMetrics(item) {
  const ins = item?.insights?.data?.[0] || {};
  const spend = Number(ins.spend || 0);
  const revenue = getActionValue(ins.action_values, ["offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"]);
  const purchases = getActionValue(ins.actions, ["offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"]);
  const messages = getActionValue(ins.actions, ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.messaging_first_reply", "onsite_conversion.total_messaging_connection"]);
  const roas = spend > 0 ? revenue / spend : 0;
  return { spend, revenue, purchases, messages, roas, ctr: Number(ins.ctr || 0) };
}

function renderCreatives() {
  const grid = document.getElementById("creativesGrid");
  if (!grid) return;

  if (!state.creatives.length) {
    grid.innerHTML = `<div class="empty-state">Nenhum criativo encontrado.</div>`;
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
      const image = item?.creative?.image_url || item?.creative?.thumbnail_url || "";

      return `
        <div class="creative-card">
          ${image ? `<img class="creative-img" src="${image}" alt="Criativo">` : `<div class="creative-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>`}
          <div class="creative-body">
            <div class="creative-name">${item.name || "Criativo sem nome"}</div>
            <div class="creative-stat">Gasto <strong>${brMoney(m.spend)}</strong></div>
            <div class="creative-stat">ROAS <strong>${m.roas.toFixed(2)}x</strong></div>
            <div class="creative-stat">CTR <strong>${brPct(m.ctr)}</strong></div>
            <div class="creative-stat">Mensagens <strong>${brNum(m.messages)}</strong></div>
            <div class="creative-stat">Compras <strong>${brNum(m.purchases)}</strong></div>
            ${sort === "champion" && index === 0 ? `<div class="creative-badge"><span class="badge badge-lime">Campeão</span></div>` : ""}
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

  const ctx = canvas.getContext('2d');
  state.trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: rows.map((r) => new Date(r.created_at).toLocaleDateString("pt-BR")),
      datasets: [
        {
          label: "ROAS",
          data: rows.map((r) => Number(r.roas || 0)),
          borderColor: '#c8fb57',
          backgroundColor: 'rgba(200, 251, 87, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: "Score",
          data: rows.map((r) => Number(r.health_score || 0)),
          borderColor: '#a78bfa',
          tension: 0.4,
          borderDash: [5, 5]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#7a8499', font: { family: 'DM Sans' } } }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#7a8499' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#7a8499' } }
      }
    }
  });
}

async function runAnalysis() {
  hideError();
  if (!state.selectedAccountId) {
    showError("Selecione uma conta.");
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
    showError(`Erro ao analisar: ${error.message}`);
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Rodar análise";
  }
}

function bindTabs() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (!tab) return;

      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll("main.main > section").forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      const panel = document.getElementById(`tab-${tab}`);
      if (panel) panel.classList.add("active");
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
    showError(`Erro ao iniciar: ${error.message}`);
    const sel = document.getElementById("accountSel");
    if (sel) sel.innerHTML = `<option value="">Erro ao carregar contas</option>`;
  }
}

window.addEventListener("DOMContentLoaded", init);
