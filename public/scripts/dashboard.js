const state = {
  accounts: [],
  selectedAccountId: null,
  selectedAccount: null,
  campaigns: [],
  metrics: null,
  historyRows: [],
  breakdownRows: []
};

const brMoney = v => `R$ ${Number(v || 0).toFixed(2)}`;
const brNum = v => Number(v || 0);
const brPct = v => `${Number(v || 0).toFixed(2)}%`;

async function api(url, options = {}) {
  const r = await fetch(url, options);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Erro");
  return j;
}

async function loadAccounts() {
  const res = await api("/api/adaccounts");
  state.accounts = res.data;

  const sel = document.getElementById("accountSel");
  sel.innerHTML = "";

  res.data.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.account_id;
    opt.textContent = a.name;
    sel.appendChild(opt);
  });

  state.selectedAccountId = res.data[0].account_id;
  state.selectedAccount = res.data[0];

  sel.addEventListener("change", () => {
    state.selectedAccountId = sel.value;
    state.selectedAccount = state.accounts.find(a => a.account_id == sel.value);
  });
}

function renderOverview() {
  const m = state.metrics;

  document.getElementById("mSpend").textContent = brMoney(m.totalSpend);
  document.getElementById("mRevenue").textContent = brMoney(m.totalRev);
  document.getElementById("mRoas").textContent = m.roas.toFixed(2) + "x";
  document.getElementById("mCostPerPurchase").textContent = brMoney(m.costPerPurchase);

  document.getElementById("mImpressions").textContent = brNum(m.totalImpressions);
  document.getElementById("mReach").textContent = brNum(m.totalReach);
  document.getElementById("mFrequency").textContent = m.avgFrequency.toFixed(2);
  document.getElementById("mCpm").textContent = brMoney(m.avgCpm);

  document.getElementById("mCtr").textContent = brPct(m.avgCtr);
  document.getElementById("mCpc").textContent = brMoney(m.avgCpc);
  document.getElementById("mConnectRate").textContent = brPct(m.connectRate);

  document.getElementById("mMessages").textContent = brNum(m.totalMessages);
  document.getElementById("mPurchases").textContent = brNum(m.totalPurchases);
}

function renderCampaigns() {
  const body = document.getElementById("campaignBody");

  body.innerHTML = state.campaigns.map(c => `
    <tr>
      <td>${c.name}</td>
      <td>${c.status}</td>
      <td>${brMoney(c.spend)}</td>
      <td>${c.messages}</td>
      <td>${c.purchases}</td>
      <td>${brMoney(c.revenue)}</td>
      <td>${c.roas.toFixed(2)}x</td>
      <td>${brPct(c.ctr)}</td>
      <td>${brPct(c.connectRate)}</td>
    </tr>
  `).join("");
}

async function loadBreakdown() {
  const type = document.getElementById("breakdownType").value;
  const res = await api(`/api/adaccounts/${state.selectedAccountId}/breakdown/${type}`);

  state.breakdownRows = res.data;

  const body = document.getElementById("breakdownBody");

  body.innerHTML = res.data.map(row => {
    const spend = Number(row.spend || 0);
    const revenue = Number(row.action_values?.[0]?.value || 0);
    const purchases = Number(row.actions?.[0]?.value || 0);
    const messages = Number(row.actions?.[1]?.value || 0);

    return `
      <tr>
        <td>${row.publisher_platform || row.age || row.gender}</td>
        <td>${brMoney(spend)}</td>
        <td>${messages}</td>
        <td>${purchases}</td>
        <td>${brMoney(revenue)}</td>
        <td>${(revenue / spend).toFixed(2)}x</td>
        <td>${brPct(row.ctr)}</td>
        <td>${brMoney(row.cpm)}</td>
      </tr>
    `;
  }).join("");
}

async function loadHistory() {
  const res = await api(`/api/history/${state.selectedAccountId}`);
  state.historyRows = res;
}

function renderHistory() {
  const body = document.getElementById("historyBody");

  body.innerHTML = state.historyRows.map(r => `
    <tr>
      <td>${new Date(r.created_at).toLocaleDateString()}</td>
      <td>${brMoney(r.total_spend)}</td>
      <td>${r.total_messages}</td>
      <td>${r.total_purchases}</td>
      <td>${brMoney(r.total_revenue)}</td>
      <td>${r.roas.toFixed(2)}x</td>
      <td>${brPct(r.avg_ctr)}</td>
      <td>${brMoney(r.avg_cpc)}</td>
      <td>${brMoney(r.avg_cpm)}</td>
      <td>${r.avg_frequency.toFixed(2)}</td>
      <td>${r.health_score}</td>
    </tr>
  `).join("");
}

async function runAnalysis() {
  const campaigns = await api(`/api/adaccounts/${state.selectedAccountId}/campaigns`);
  const insights = await api(`/api/adaccounts/${state.selectedAccountId}/insights`);

  const res = await api("/api/analyze", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      accountData: state.selectedAccount,
      campaigns: campaigns.data,
      insights
    })
  });

  state.metrics = res.metrics;
  state.campaigns = res.decision.campaigns;

  await loadHistory();

  renderOverview();
  renderCampaigns();
  renderHistory();
}

document.getElementById("runBtn").addEventListener("click", runAnalysis);

loadAccounts();
