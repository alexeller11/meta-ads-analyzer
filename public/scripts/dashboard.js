// ─── STATE ──────────────────────────────────────────────────────────────────
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
  trendChart: null,
  fatigueAlerts: [],
  burningCampaigns: [],
  filters: { campaign: "TODAS", decision: "TODAS" }
};

// ─── FORMATTERS ──────────────────────────────────────────────────────────────
const brMoney = (v) =>
  `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const brNum   = (v) => Number(v || 0).toLocaleString("pt-BR");
const brPct   = (v) => `${Number(v || 0).toFixed(2)}%`;
const brX     = (v) => `${Number(v || 0).toFixed(2)}x`;

// ─── API ─────────────────────────────────────────────────────────────────────
async function api(url, options = {}) {
  const response = await fetch(url, options);
  const text     = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : {}; } catch { json = null; }
  if (!response.ok) throw new Error(json?.error || text || `Erro ${response.status}`);
  return json;
}

function showError(message) {
  const box = document.getElementById("globalError");
  if (!box) return;
  box.textContent = message;
  box.classList.add("show");
  setTimeout(() => box.classList.remove("show"), 8000);
}

function hideError() {
  const box = document.getElementById("globalError");
  if (box) box.classList.remove("show");
}

function showOk(message) {
  const box = document.getElementById("globalOk");
  if (!box) return;
  box.textContent = message;
  box.classList.add("show");
  setTimeout(() => box.classList.remove("show"), 5000);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
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

// ─── SESSION ──────────────────────────────────────────────────────────────────
async function loadSession() {
  try {
    const me = await api("/api/me");
    if (!me.authenticated) { window.location.href = "/"; return false; }
    state.me = me.user;
    const el = document.getElementById("userName");
    if (el) el.textContent = me.user?.name || "Usuário";
    return true;
  } catch(e) {
    window.location.href = "/";
    return false;
  }
}

async function loadAccounts() {
  const res = await api("/api/adaccounts");
  const accounts = Array.isArray(res?.data) ? res.data : [];
  if (!accounts.length) throw new Error("Nenhuma conta de anúncios encontrada.");

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
  state.selectedAccount   = accounts[0];
  sel.value = accounts[0].account_id;

  sel.addEventListener("change", () => {
    state.selectedAccountId = sel.value;
    state.selectedAccount   = state.accounts.find((a) => String(a.account_id) === String(sel.value)) || null;
  });

  showOk(`${accounts.length} conta(s) carregada(s).`);
}

// ─── SCORE RING ───────────────────────────────────────────────────────────────
function updateScoreRing(score) {
  const circle = document.getElementById("scoreCircle");
  const num    = document.getElementById("scoreNum");
  if (!circle || !num) return;

  const val    = Math.max(0, Math.min(100, Number(score || 0)));
  num.textContent              = Math.round(val);
  circle.style.strokeDashoffset = 264 - (val / 100) * 264;

  if (val >= 80)      circle.style.stroke = "var(--success)";
  else if (val >= 50) circle.style.stroke = "var(--warning)";
  else                circle.style.stroke = "var(--danger)";
}

// ─── OVERVIEW ─────────────────────────────────────────────────────────────────
function renderOverview() {
  const m = state.metrics;
  if (!m) return;

  document.getElementById("mSpend").textContent           = brMoney(m.totalSpend);
  document.getElementById("mRevenue").textContent         = brMoney(m.totalRev);
  document.getElementById("mRoas").textContent            = brX(m.roas);
  document.getElementById("mCostPerPurchase").textContent = brMoney(m.costPerPurchase);
  document.getElementById("mImpressions").textContent     = brNum(m.totalImpressions);
  document.getElementById("mReach").textContent           = brNum(m.totalReach);
  document.getElementById("mFrequency").textContent       = Number(m.avgFrequency || 0).toFixed(2);
  document.getElementById("mCpm").textContent             = brMoney(m.avgCpm);
  document.getElementById("mCtr").textContent             = brPct(m.avgCtr);
  document.getElementById("mCpc").textContent             = brMoney(m.avgCpc);
  document.getElementById("mConnectRate").textContent     = brPct(m.connectRate);
  document.getElementById("mMessages").textContent        = brNum(m.totalMessages);
  document.getElementById("mPurchases").textContent       = brNum(m.totalPurchases);

  // NOVO: Connect Rate corrigido — mostrar tooltip explicativo
  const connectEl = document.getElementById("mConnectRate");
  if (connectEl) {
    connectEl.title = "Connect Rate = landing_page_views ÷ link_clicks (cliques em links, não total)";
  }

  const score = state.historyRows?.[0]?.health_score || 0;
  updateScoreRing(score);

  const hTitle = document.getElementById("healthTitle");
  const hDesc  = document.getElementById("healthDesc");

  if (score >= 80) {
    hTitle.textContent = "Excelente Performance";
    hDesc.textContent  = "Conta saudável com boa base para escala. Veja as campanhas recomendadas para escalar.";
  } else if (score >= 50) {
    hTitle.textContent = "Atenção Necessária";
    hDesc.textContent  = "Existem oportunidades de otimização. Verifique a Central de Decisão para ações prioritárias.";
  } else {
    hTitle.textContent = "Performance Crítica";
    hDesc.textContent  = "Métricas abaixo do esperado. Revise imediatamente campanhas críticas na Central de Decisão.";
  }

  // NOVO: renderizar alertas de fadiga preditiva e campanhas queimando
  renderAlertBanners();
}

// ─── NOVO: banners de alerta inline ─────────────────────────────────────────
function renderAlertBanners() {
  const container = document.getElementById("alertBanners");
  if (!container) return;

  let html = "";

  // Campanhas queimando verba
  if (state.burningCampaigns?.length > 0) {
    html += `<div class="alert-banner alert-banner-danger">
      <strong>🔥 ${state.burningCampaigns.length} campanha(s) queimando verba sem conversão</strong>
      <span>${state.burningCampaigns.map(c => c.name).join(", ")}</span>
      <span>Gasto total: ${brMoney(state.burningCampaigns.reduce((a,c) => a + parseFloat(c.spend||0), 0))}</span>
    </div>`;
  }

  // Alertas de fadiga preditiva
  if (state.fatigueAlerts?.length > 0) {
    html += `<div class="alert-banner alert-banner-warning">
      <strong>📉 Fadiga preditiva detectada em ${state.fatigueAlerts.length} campanha(s)</strong>
      ${state.fatigueAlerts.map(a => `<span><b>${a.campaignName}:</b> ${a.reason}</span>`).join("")}
    </div>`;
  }

  container.innerHTML = html;
}

// ─── CAMPANHAS ────────────────────────────────────────────────────────────────
function renderCampaigns() {
  const body = document.getElementById("campaignBody");
  if (!body) return;

  let list = state.campaigns;
  if (state.filters.campaign !== "TODAS") {
    list = list.filter((c) => c.status === state.filters.campaign);
  }

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="11" class="empty-state">Nenhuma campanha para exibir.</td></tr>`;
    return;
  }

  body.innerHTML = list.map((c) => {
    const isBurning  = state.burningCampaigns?.some(b => b.id === c.id);
    const isFatigue  = state.fatigueAlerts?.some(f => f.campaignId === c.id);
    const rowClass   = isBurning ? "row-danger" : isFatigue ? "row-warning" : "";
    const warn       = isBurning ? "🔥" : isFatigue ? "📉" : "";

    return `<tr class="${rowClass}">
      <td class="td-name" title="${c.name}">${warn} ${c.name || "-"}</td>
      <td><span class="badge ${c.status === "ACTIVE" ? "badge-success" : "badge-muted"}">${c.status || "-"}</span></td>
      <td style="font-size:11px;color:var(--muted)">${c.objectiveLabel || "-"}</td>
      <td>${brMoney(c.spend)}</td>
      <td>${brX(c.roas)}</td>
      <td>${brPct(c.ctr)}</td>
      <td title="Hook Rate = link_clicks / impressions">${brPct(c.hookRate)}</td>
      <td title="Connect Rate = landing_page_views / link_clicks (corrigido)">${brPct(c.connectRate)}</td>
      <td>${brNum(c.messages)}</td>
      <td>${brNum(c.purchases)}</td>
      <td class="td-ia">
        <button class="btn-ia-sm" title="Analisar com IA" onclick="analyzeCampaignIA('${c.id}', '${(c.name||"").replace(/'/g,"\\'")}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>
        </button>
      </td>
    </tr>`;
  }).join("");
}

// ─── CENTRAL DE DECISÃO ───────────────────────────────────────────────────────
function renderDecision() {
  const body = document.getElementById("decisionBody");
  if (!body) return;

  let list = state.campaigns;
  if (state.filters.decision !== "TODAS") {
    if (state.filters.decision === "ESCALAR") {
      list = list.filter(c => c.decision?.action === "ESCALAR" || c.status_performance === "Excelente" || c.status_performance === "Muito Bom");
    } else if (state.filters.decision === "PAUSAR") {
      list = list.filter(c => c.decision?.action === "PAUSAR" || c.status_performance === "Crítico");
    } else if (state.filters.decision === "REVISAR") {
      list = list.filter(c => c.decision?.action === "RENOVAR_CRIATIVO" || c.status_performance === "Fadiga" || c.status_performance === "Criativo Ruim");
    }
  }

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="9" class="empty-state">Nenhuma decisão para exibir.</td></tr>`;
    return;
  }

  body.innerHTML = list.map((c) => {
    const action    = c.decision?.action || c.status_performance || "MANTER";
    const isBurning = state.burningCampaigns?.some(b => b.id === c.id);
    const isFatigue = state.fatigueAlerts?.some(f => f.campaignId === c.id);

    let badgeClass = "badge-muted";
    let actionLabel = action;
    if (action === "ESCALAR" || c.status_performance === "Excelente") { badgeClass = "badge-success"; actionLabel = "↑ Escalar"; }
    if (action === "PAUSAR" || c.status_performance === "Crítico")     { badgeClass = "badge-danger";  actionLabel = "⏸ Pausar"; }
    if (action === "RENOVAR_CRIATIVO" || c.status_performance === "Fadiga") { badgeClass = "badge-warning"; actionLabel = "🎨 Criativo"; }

    // NOVO: sugestão de escala com valor em reais
    let scaleHint = "";
    if ((action === "ESCALAR" || c.status_performance === "Excelente" || c.status_performance === "Muito Bom") && c.spend > 0) {
      const roas      = parseFloat(c.roas || 0);
      const budget    = parseFloat(c.spend || 0);
      const pct       = roas >= 4 ? 30 : roas >= 3 ? 20 : 10;
      const newBudget = budget * (1 + pct / 100);
      const gain      = (newBudget - budget) * roas;
      scaleHint = `<br><small style="color:var(--success)">+${pct}% = +R$ ${(newBudget - budget).toFixed(0)}/dia → +R$ ${gain.toFixed(0)} receita</small>`;
    }

    const fatigueBadge = isFatigue ? `<span class="badge badge-warning" style="margin-left:4px">Fadiga Prev.</span>` : "";
    const burningBadge = isBurning ? `<span class="badge badge-danger" style="margin-left:4px">🔥 Queimando</span>` : "";

    return `<tr>
      <td class="td-name" title="${c.name}">${c.name || "-"} ${fatigueBadge} ${burningBadge}</td>
      <td><span class="badge ${c.status === "ACTIVE" ? "badge-success" : "badge-muted"}">${c.status || "-"}</span></td>
      <td><span class="badge ${badgeClass}">${actionLabel}</span></td>
      <td style="white-space:normal;min-width:180px;font-size:12px">${c.decision?.reason || c.diagnostico || "-"}${scaleHint}</td>
      <td>${brMoney(c.spend)}</td>
      <td>${brX(c.roas)}</td>
      <td title="Connect Rate corrigido (link_clicks)">${brPct(c.connectRate)}</td>
      <td title="Hook Rate = link_clicks / impressions">${brPct(c.hookRate)}</td>
      <td class="td-ia">
        <button class="btn-ia-sm" onclick="analyzeCampaignIA('${c.id}','${(c.name||"").replace(/'/g,"\\'")}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>
        </button>
      </td>
    </tr>`;
  }).join("");
}

// ─── BREAKDOWN ────────────────────────────────────────────────────────────────
async function loadBreakdown() {
  hideError();
  if (!state.selectedAccountId) { showError("Selecione uma conta."); return; }

  const btn = document.getElementById("breakdownBtn");
  btn.disabled = true;
  btn.textContent = "...";

  try {
    const type = document.getElementById("breakdownType").value;
    const res  = await api(`/api/adaccounts/${state.selectedAccountId}/breakdown/${type}?${getDateQuery()}`);
    state.breakdownRows = Array.isArray(res?.data) ? res.data : [];
    renderBreakdown();
  } catch(err) {
    showError(`Erro: ${err.message}`);
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

  body.innerHTML = state.breakdownRows.map((row) => {
    const spend    = Number(row.spend || 0);
    const revenue  = getActionValue(row.action_values, ["offsite_conversion.fb_pixel_purchase","purchase","omni_purchase"]);
    const purchases= getActionValue(row.actions, ["offsite_conversion.fb_pixel_purchase","purchase","omni_purchase"]);
    const messages = getActionValue(row.actions, ["onsite_conversion.messaging_conversation_started_7d","onsite_conversion.messaging_first_reply"]);
    // CORRIGIDO: usa inline_link_clicks para connect rate
    const linkClicks   = Number(row.inline_link_clicks || 0) || getActionValue(row.actions, ["link_click"]);
    const sessions     = getActionValue(row.actions, ["landing_page_view"]);
    const connectRate  = linkClicks > 0 ? ((sessions / linkClicks) * 100).toFixed(1) : "—";
    const roas         = spend > 0 ? revenue / spend : 0;
    const label        = row.publisher_platform || row.device_platform || row.gender || row.age || row.region || row.city || "N/A";

    return `<tr>
      <td>${label}</td>
      <td>${brMoney(spend)}</td>
      <td>${brNum(messages)}</td>
      <td>${brNum(purchases)}</td>
      <td>${brMoney(revenue)}</td>
      <td>${roas.toFixed(2)}x</td>
      <td>${brPct(row.ctr)}</td>
      <td>${connectRate}%</td>
    </tr>`;
  }).join("");
}

// ─── HISTORY ──────────────────────────────────────────────────────────────────
async function loadHistory() {
  if (!state.selectedAccountId) return;
  const res = await api(`/api/history/${state.selectedAccountId}`);
  state.historyRows = Array.isArray(res) ? res : [];
}

function renderHistory() {
  const body = document.getElementById("historyBody");
  if (!body) return;

  if (!state.historyRows.length) {
    body.innerHTML = `<tr><td colspan="12" class="empty-state">Sem histórico salvo.</td></tr>`;
    return;
  }

  body.innerHTML = state.historyRows.map((r) => `
    <tr>
      <td>${new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
      <td>${brMoney(r.total_spend)}</td>
      <td>${brMoney(r.total_revenue)}</td>
      <td>${Number(r.roas || 0).toFixed(2)}x</td>
      <td>${brMoney(r.cost_per_purchase)}</td>
      <td>${brNum(r.total_impressions)}</td>
      <td>${brPct(r.avg_ctr)}</td>
      <td title="Connect Rate corrigido (link_clicks)">${brPct(r.connect_rate)}</td>
      <td>${brNum(r.total_messages)}</td>
      <td>${brNum(r.total_purchases)}</td>
      <td>${Number(r.avg_frequency || 0).toFixed(2)}</td>
      <td><span class="badge ${r.health_score >= 80 ? "badge-success" : r.health_score >= 50 ? "badge-warning" : "badge-danger"}">${r.health_score}</span></td>
    </tr>
  `).join("");
}

// ─── CRIATIVOS ────────────────────────────────────────────────────────────────
async function loadCreatives() {
  hideError();
  if (!state.selectedAccountId) { showError("Selecione uma conta."); return; }

  const btn = document.getElementById("creativeBtn");
  btn.disabled    = true;
  btn.textContent = "...";

  try {
    const res = await api(`/api/adaccounts/${state.selectedAccountId}/creatives?${getDateQuery()}`);
    state.creatives = Array.isArray(res?.data) ? res.data : [];
    renderCreatives();
  } catch(err) {
    showError(`Erro: ${err.message}`);
  } finally {
    btn.disabled    = false;
    btn.textContent = "Carregar Criativos";
  }
}

function creativeMetrics(item) {
  const ins     = item?.insights?.data?.[0] || {};
  const spend   = Number(ins.spend || 0);
  const revenue = getActionValue(ins.action_values, ["offsite_conversion.fb_pixel_purchase","purchase","omni_purchase"]);
  const purchases = getActionValue(ins.actions, ["offsite_conversion.fb_pixel_purchase","purchase","omni_purchase"]);
  const messages  = getActionValue(ins.actions, ["onsite_conversion.messaging_conversation_started_7d","onsite_conversion.messaging_first_reply"]);
  const roas    = spend > 0 ? revenue / spend : 0;

  // NOVO: Hook Rate corrigido
  const impr     = Number(ins.impressions || 0);
  const linkCl   = Number(ins.inline_link_clicks || 0) || getActionValue(ins.actions, ["link_click"]);
  const hookRate = impr > 0 ? (linkCl / impr) * 100 : 0;

  const sessions    = getActionValue(ins.actions, ["landing_page_view"]);
  const connectRate = linkCl > 0 ? (sessions / linkCl) * 100 : 0;

  return { spend, revenue, purchases, messages, roas, ctr: Number(ins.ctr || 0), hookRate, connectRate };
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
    if (sort === "messages")  return mb.messages  - ma.messages;
    if (sort === "purchases") return mb.purchases - ma.purchases;
    if (sort === "hookRate")  return mb.hookRate  - ma.hookRate;
    return mb.roas - ma.roas;
  });

  grid.innerHTML = list.map((item, index) => {
    const m     = creativeMetrics(item);
    const image = item?.creative?.image_url || item?.creative?.thumbnail_url || "";

    return `
      <div class="creative-card" style="position:relative">
        ${image
          ? `<img class="creative-img" src="${image}" alt="Criativo" loading="lazy">`
          : `<div class="creative-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>`
        }
        <div class="creative-body">
          <div class="creative-name" title="${item.name||""}">${item.name || "Sem nome"}</div>
          <div class="creative-stat">Gasto <strong>${brMoney(m.spend)}</strong></div>
          <div class="creative-stat">ROAS <strong>${m.roas.toFixed(2)}x</strong></div>
          <div class="creative-stat" title="Hook Rate = link_clicks / impressions">Hook Rate <strong>${m.hookRate.toFixed(2)}%</strong></div>
          <div class="creative-stat" title="Connect Rate = LPV / link_clicks (corrigido)">Connect <strong>${m.connectRate.toFixed(1)}%</strong></div>
          <div class="creative-stat">Mensagens <strong>${brNum(m.messages)}</strong></div>
          <div class="creative-stat">Compras <strong>${brNum(m.purchases)}</strong></div>
          <div class="creative-footer">
            <button class="btn-ia-sm" title="Analisar Criativo" onclick="analyzeCreativeIA('${item.id}','${(item.name||"").replace(/'/g,"\\'")}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>
            </button>
          </div>
          ${index === 0 ? `<div style="position:absolute;top:10px;right:10px"><span class="badge badge-lime">🏆 Campeão</span></div>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

// ─── TREND ────────────────────────────────────────────────────────────────────
function renderTrend() {
  const canvas = document.getElementById("trendChart");
  if (!canvas) return;

  if (state.trendChart) { state.trendChart.destroy(); state.trendChart = null; }

  const rows = [...state.historyRows].reverse();
  if (!rows.length) return;

  const ctx = canvas.getContext("2d");
  state.trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: rows.map((r) => new Date(r.created_at).toLocaleDateString("pt-BR")),
      datasets: [
        {
          label: "ROAS",
          data: rows.map((r) => Number(r.roas || 0)),
          borderColor: "#c8fb57",
          backgroundColor: "rgba(200,251,87,0.1)",
          tension: 0.4,
          fill: true,
          yAxisID: "y"
        },
        {
          label: "Score",
          data: rows.map((r) => Number(r.health_score || 0)),
          borderColor: "#a78bfa",
          tension: 0.4,
          borderDash: [5, 5],
          yAxisID: "y1"
        },
        {
          label: "Connect Rate %",
          data: rows.map((r) => Number(r.connect_rate || 0)),
          borderColor: "#22d3ee",
          tension: 0.4,
          borderDash: [3, 3],
          yAxisID: "y"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#7a8499", font: { family: "Inter" } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.raw;
              if (ctx.dataset.label === "ROAS") return `ROAS: ${v.toFixed(2)}x`;
              if (ctx.dataset.label === "Score") return `Score: ${Math.round(v)}`;
              return `${ctx.dataset.label}: ${v.toFixed(1)}%`;
            }
          }
        }
      },
      scales: {
        x:  { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#7a8499" } },
        y:  { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#7a8499" }, position: "left" },
        y1: { grid: { drawOnChartArea: false }, ticks: { color: "#a78bfa" }, position: "right", min: 0, max: 100 }
      }
    }
  });
}

// ─── ANÁLISE PRINCIPAL ────────────────────────────────────────────────────────
async function runAnalysis() {
  hideError();
  if (!state.selectedAccountId) { showError("Selecione uma conta."); return; }

  const runBtn = document.getElementById("runBtn");
  runBtn.disabled    = true;
  runBtn.textContent = "Analisando...";

  try {
    const [campaigns, insights] = await Promise.all([
      api(`/api/adaccounts/${state.selectedAccountId}/campaigns`),
      api(`/api/adaccounts/${state.selectedAccountId}/insights?${getDateQuery()}`)
    ]);

    const res = await api("/api/analyze", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountData: state.selectedAccount,
        campaigns:   campaigns.data || [],
        insights,
        dateRange:   getDateQuery()
      })
    });

    state.metrics          = res.metrics;
    state.campaigns        = res.decision?.campaigns || [];
    state.fatigueAlerts    = res.analysis?.fatigue_alerts || [];
    state.burningCampaigns = res.analysis?.burning_campaigns || [];

    await loadHistory();

    renderOverview();
    renderCampaigns();
    renderDecision();
    renderHistory();
    renderTrend();

    // Mudar para aba visão geral
    switchTab("overview");
    showOk("Análise concluída.");

    // NOVO: mostrar resumo rápido de alertas
    const totalIssues = state.burningCampaigns.length + state.fatigueAlerts.length;
    if (totalIssues > 0) {
      setTimeout(() => {
        showError(`⚠️ ${totalIssues} alerta(s) detectado(s). Veja os banners na Visão Geral.`);
      }, 1500);
    }
  } catch(err) {
    showError(`Erro ao analisar: ${err.message}`);
  } finally {
    runBtn.disabled    = false;
    runBtn.textContent = "Rodar análise";
  }
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll("main.main > section").forEach((p) => p.classList.remove("active"));

  const btn   = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
  const panel = document.getElementById(`tab-${tab}`);
  if (btn)   btn.classList.add("active");
  if (panel) panel.classList.add("active");

  if (tab === "trend") renderTrend();
}

function bindTabs() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      switchTab(tab);
    });
  });
}

// ─── FILTROS ──────────────────────────────────────────────────────────────────
function bindFilters() {
  document.querySelectorAll("#campaignFilters .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#campaignFilters .pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.filters.campaign = btn.dataset.value;
      renderCampaigns();
    });
  });

  document.querySelectorAll("#decisionFilters .pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#decisionFilters .pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.filters.decision = btn.dataset.value;
      renderDecision();
    });
  });
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function openAiModal(title, content) {
  document.getElementById("aiModalTitle").textContent  = title;
  document.getElementById("aiModalContent").innerHTML  = content;
  document.getElementById("aiModal").classList.add("show");
}

// ─── IA: CAMPANHA ─────────────────────────────────────────────────────────────
window.analyzeCampaignIA = async (id, name) => {
  const camp = state.campaigns.find((c) => String(c.id) === String(id));
  if (!camp) return;

  openAiModal(`Análise IA: ${name}`, `<div class="empty-state">Gerando diagnóstico...</div>`);

  try {
    const res = await api("/api/gpt-campaign", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ campaign: camp, adsets: [], metrics: state.metrics })
    });

    if (res.analysis && res.analysis.length > 50) {
      document.getElementById("aiModalContent").innerHTML = `<pre style="white-space:pre-wrap;font-size:13px;line-height:1.7">${res.analysis}</pre>`;
    } else {
      // Fallback local se GPT não disponível
      const roas     = parseFloat(camp.roas || 0);
      const ctr      = parseFloat(camp.ctr || 0);
      const connect  = parseFloat(camp.connectRate || 0);
      const hookRate = parseFloat(camp.hookRate || 0);
      const freq     = parseFloat(camp.frequency || 0);
      const isMsg    = camp.objectiveLabel?.includes("Mensagens") || (camp.messages > 0 && camp.purchases === 0);

      const costLabel = isMsg
        ? `Custo/msg: ${brMoney(camp.costPerMsg)}`
        : `Custo/venda: ${brMoney(camp.costPerPur)}`;

      document.getElementById("aiModalContent").innerHTML = `
        <div style="display:flex;flex-direction:column;gap:16px">
          <div>
            <h3 style="color:var(--lime);margin-bottom:8px">Diagnóstico</h3>
            <p>${camp.diagnostico || "—"}</p>
            <p style="color:var(--muted);font-size:12px">Objetivo: ${camp.objectiveLabel || "—"}</p>
          </div>
          <div>
            <h3 style="color:var(--lime);margin-bottom:8px">Métricas-chave</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div class="metric-card"><div class="metric-label">ROAS</div><div class="metric-value" style="font-size:20px">${roas.toFixed(2)}x</div></div>
              <div class="metric-card"><div class="metric-label">Hook Rate</div><div class="metric-value" style="font-size:20px">${hookRate.toFixed(2)}%</div><div class="metric-sub">link_clicks / impressões</div></div>
              <div class="metric-card"><div class="metric-label">Connect Rate</div><div class="metric-value" style="font-size:20px">${connect.toFixed(1)}%</div><div class="metric-sub">corrigido (link_clicks)</div></div>
              <div class="metric-card"><div class="metric-label">${isMsg ? "Custo/msg" : "Custo/venda"}</div><div class="metric-value" style="font-size:20px">${isMsg ? brMoney(camp.costPerMsg) : brMoney(camp.costPerPur)}</div></div>
            </div>
          </div>
          <div>
            <h3 style="color:var(--lime);margin-bottom:8px">Recomendação</h3>
            <p>${camp.escala_sugestao || "—"}</p>
            ${freq > 3 ? `<p style="color:var(--warning);font-size:12px">⚠️ Frequência de ${freq.toFixed(2)} — considere renovar o criativo.</p>` : ""}
            ${hookRate < 1 ? `<p style="color:var(--warning);font-size:12px">⚠️ Hook Rate baixo — os primeiros 3 segundos do criativo não estão gerando clique.</p>` : ""}
            ${connect < 60 && camp.spend > 30 ? `<p style="color:var(--warning);font-size:12px">⚠️ Connect Rate abaixo de 60% — verifique velocidade da página e pixel.</p>` : ""}
          </div>
          <p style="font-size:11px;color:var(--muted)">Configure OPENAI_API_KEY para análises GPT-4o mais aprofundadas.</p>
        </div>
      `;
    }
  } catch(e) {
    document.getElementById("aiModalContent").innerHTML = `<p style="color:var(--danger)">Erro: ${e.message}</p>`;
  }
};

// ─── IA: CRIATIVO ─────────────────────────────────────────────────────────────
window.analyzeCreativeIA = (id, name) => {
  const item = state.creatives.find((c) => String(c.id) === String(id));
  if (!item) return;
  const m = creativeMetrics(item);

  openAiModal(`Criativo: ${name}`, `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div>
        <h3 style="color:var(--lime);margin-bottom:8px">Performance</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="metric-card"><div class="metric-label">ROAS</div><div class="metric-value" style="font-size:20px">${m.roas.toFixed(2)}x</div></div>
          <div class="metric-card"><div class="metric-label">Hook Rate</div><div class="metric-value" style="font-size:20px">${m.hookRate.toFixed(2)}%</div><div class="metric-sub">link_clicks / impressões</div></div>
          <div class="metric-card"><div class="metric-label">Connect Rate</div><div class="metric-value" style="font-size:20px">${m.connectRate.toFixed(1)}%</div></div>
          <div class="metric-card"><div class="metric-label">CTR Total</div><div class="metric-value" style="font-size:20px">${m.ctr.toFixed(2)}%</div></div>
        </div>
      </div>
      <div>
        <h3 style="color:var(--lime);margin-bottom:8px">Diagnóstico de Criativo</h3>
        ${m.hookRate < 1
          ? `<p style="color:var(--warning)">⚠️ Hook Rate abaixo de 1% — os primeiros frames não estão gerando clique. Teste um gancho mais forte: pergunta, afirmação polêmica ou visual de impacto.</p>`
          : `<p style="color:var(--success)">✅ Hook Rate saudável — o criativo está gerando cliques de forma eficiente.</p>`
        }
        ${m.connectRate < 65 && m.spend > 30
          ? `<p style="color:var(--warning)">⚠️ Connect Rate baixo — usuários clicam mas não chegam na página. Verifique pixel e velocidade.</p>`
          : ""
        }
        <p>Gasto total: <strong>${brMoney(m.spend)}</strong> | Mensagens: <strong>${brNum(m.messages)}</strong> | Compras: <strong>${brNum(m.purchases)}</strong></p>
      </div>
      <div>
        <h3 style="color:var(--lime);margin-bottom:8px">Próximo passo</h3>
        <p>Crie uma variação deste criativo alterando apenas o gancho (primeira frase/cena). Mantenha tudo igual e teste 2-3 aberturas diferentes para encontrar o ângulo de venda mais eficiente.</p>
      </div>
    </div>
  `);
};

// ─── BOTÕES IA OVERVIEW ───────────────────────────────────────────────────────
function bindAiButtons() {
  const overviewBtn = document.getElementById("overviewAiBtn");
  if (overviewBtn) {
    overviewBtn.addEventListener("click", async () => {
      if (!state.metrics) return showError("Rode uma análise primeiro.");
      openAiModal("Plano de Guerra IA", `<div class="empty-state">Gerando estratégia...</div>`);
      try {
        const res = await api("/api/gpt-copilot", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            data: {
              metrics:   state.metrics,
              campaigns: state.campaigns,
              niche:     document.getElementById("nicheSel")?.value || "Geral"
            }
          })
        });
        const text = res.strategy || "Sem estratégia disponível.";
        document.getElementById("aiModalContent").innerHTML = `<pre style="white-space:pre-wrap;font-size:13px;line-height:1.7">${text}</pre>`;
      } catch(e) {
        document.getElementById("aiModalContent").innerHTML = `<p style="color:var(--danger)">Erro: ${e.message}</p>`;
      }
    });
  }

  const closeBtn = document.getElementById("closeAiModal");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      document.getElementById("aiModal").classList.remove("show");
    });
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const ok = await loadSession();
    if (!ok) return;

    await loadAccounts();
    bindTabs();
    bindFilters();
    bindAiButtons();

    document.getElementById("runBtn").addEventListener("click", runAnalysis);
    document.getElementById("breakdownBtn").addEventListener("click", loadBreakdown);
    document.getElementById("creativeBtn").addEventListener("click", loadCreatives);
    document.getElementById("creativeSort").addEventListener("change", renderCreatives);

    document.getElementById("dateSel").addEventListener("change", () => {
      const custom = document.getElementById("dateSel").value === "custom";
      document.getElementById("customDates").classList.toggle("hidden", !custom);
    });
  } catch(err) {
    showError(`Erro ao iniciar: ${err.message}`);
    const sel = document.getElementById("accountSel");
    if (sel) sel.innerHTML = `<option value="">Erro ao carregar</option>`;
  }
}

window.addEventListener("DOMContentLoaded", init);
