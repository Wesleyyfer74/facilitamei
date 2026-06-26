const accessView = document.querySelector("[data-access-view]");
const dashboardView = document.querySelector("[data-dashboard-view]");
const loginForm = document.querySelector("[data-login-form]");
const setupForm = document.querySelector("[data-setup-form]");
const statusBox = document.querySelector("[data-client-status]");
const tabButtons = document.querySelectorAll("[data-access-tab]");
const clientName = document.querySelector("[data-client-name]");
const clientFirstName = document.querySelector("[data-client-first-name]");
const clientInitials = document.querySelector("[data-client-initials]");
const sidebarPlan = document.querySelector("[data-sidebar-plan]");
const notificationBadge = document.querySelector("[data-notification-badge]");
const companyCnpj = document.querySelector("[data-company-cnpj]");
const companyStatus = document.querySelector("[data-company-status]");
const dasDate = document.querySelector("[data-das-date]");
const dasStatus = document.querySelector("[data-das-status]");
const invoicesMonth = document.querySelector("[data-invoices-month]");
const declarationLabel = document.querySelector("[data-declaration-label]");
const declarationStatus = document.querySelector("[data-declaration-status]");
const pendingCount = document.querySelector("[data-pending-count]");
const pendingDetail = document.querySelector("[data-pending-detail]");
const dueList = document.querySelector("[data-due-list]");
const financeMonth = document.querySelector("[data-finance-month]");
const financeLimit = document.querySelector("[data-finance-limit]");
const financeAvailable = document.querySelector("[data-finance-available]");
const financeProgress = document.querySelector("[data-finance-progress]");
const financeProgressLabel = document.querySelector("[data-finance-progress-label]");
const companyList = document.querySelector("[data-company-list]");
const clientDetails = document.querySelector("[data-client-details]");
const paymentsTable = document.querySelector("[data-payments-table]");
const paymentsCount = document.querySelector("[data-payments-count]");
const contractsList = document.querySelector("[data-contracts-list]");
const documentsList = document.querySelector("[data-documents-list]");
const refreshDashboardButton = document.querySelector("[data-refresh-dashboard]");

const configuredApiBase = String(window.FACILITA_API_BASE || "").replace(/\/$/, "");
const isLocalFile = window.location.protocol === "file:";
const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const productionApiBase = "https://facilitamei-production.up.railway.app";
const isFacilitaDomain = /(^|\.)facilitameibr\.com\.br$/i.test(window.location.hostname);
const API_BASE =
  configuredApiBase ||
  (isLocalFile || isLocalHost ? "http://localhost:3000" : isFacilitaDomain ? productionApiBase : "");
const SESSION_KEY = "facilita_client_session";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getToken() {
  return localStorage.getItem(SESSION_KEY) || "";
}

function setToken(token) {
  localStorage.setItem(SESSION_KEY, token);
}

function clearToken() {
  localStorage.removeItem(SESSION_KEY);
}

function setStatus(message = "", type = "info") {
  statusBox.textContent = message;
  statusBox.style.color = type === "error" ? "var(--danger)" : "var(--gold-strong)";
}

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error("Nao consegui conectar ao backend. Confira a URL da API.");
  }

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("A API retornou uma resposta invalida.");
  }

  if (response.status === 401) {
    clearToken();
    showAccess();
    throw new Error(data.error || "Sessao expirada.");
  }

  if (!response.ok) throw new Error(data.error || "Erro na area do cliente.");
  return data;
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatCnpj(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 14) return "Não informado";
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function statusLabel(status = "") {
  const labels = {
    active: "Ativo",
    authorized: "Ativo",
    approved: "Pago",
    paid: "Pago",
    pago: "Pago",
    pending: "Pendente",
    in_process: "Em analise",
    paused: "Pausado",
    cancelled: "Cancelado",
    expired: "Expirado",
    rejected: "Recusado",
    pendente: "Pendente",
    enviado: "Enviado",
    assinado: "Assinado",
    expirado: "Expirado",
    vencido: "Vencido",
    recusado: "Recusado",
  };
  return labels[String(status || "").toLowerCase()] || status || "-";
}

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || "C"}${parts[1]?.[0] || parts[0]?.[1] || "L"}`.toUpperCase();
}

function showAccess() {
  accessView.hidden = false;
  dashboardView.hidden = true;
}

function showDashboard() {
  accessView.hidden = true;
  dashboardView.hidden = false;
}

function renderDetails(client = {}, subscription = {}) {
  clientDetails.innerHTML = [
    ["Nome", client.nome],
    ["E-mail", client.email],
    ["Telefone", client.telefone || client.whatsapp],
    ["Documento", client.cnpj || client.documento],
    ["Status", statusLabel(client.status)],
    ["Plano", subscription.plan_name],
    ["Status assinatura", statusLabel(subscription.status)],
    ["Próxima cobrança", formatDate(subscription.data_proxima_cobranca)],
  ]
    .map(([label, value]) => `<p><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "-")}</strong></p>`)
    .join("");
}

function renderPayments(payments = []) {
  paymentsCount.textContent = `${payments.length} registro(s)`;
  paymentsTable.innerHTML = payments.length
    ? payments
        .map(
          (payment) => `
            <tr>
              <td>${formatDate(payment.data_pagamento || payment.created_at)}</td>
              <td>${money(payment.valor)}</td>
              <td><span class="status-pill">${escapeHtml(statusLabel(payment.status))}</span></td>
              <td>${escapeHtml(payment.mercado_pago_payment_id || "-")}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="4">Nenhum pagamento registrado ainda.</td></tr>`;
}

function renderCards(container, items = [], emptyMessage, type) {
  container.innerHTML = items.length
    ? items
        .map((item) => {
          const fileUrl = item.arquivo_url || item.assinatura_url || "";
          return `
            <article class="mini-card">
              <strong>${escapeHtml(item.titulo || item.tipo || "Registro")}</strong>
              <p>${escapeHtml(statusLabel(item.status))} ${item.observacao ? `- ${escapeHtml(item.observacao)}` : ""}</p>
              <small>${formatDate(item.data_envio || item.data_emissao || item.created_at)}</small>
              ${fileUrl ? `<p><a href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener">Abrir ${type}</a></p>` : ""}
            </article>
          `;
        })
        .join("")
    : `<article class="mini-card"><p>${escapeHtml(emptyMessage)}</p></article>`;
}

function renderDueItems(items = []) {
  dueList.innerHTML = items.length
    ? items
        .map(
          (item) => `
            <article class="due-item">
              <span>${item.type === "payment" ? "💳" : item.type === "contract" ? "📄" : item.type === "document" ? "📁" : "📅"}</span>
              <div>
                <strong>${escapeHtml(item.title || "Registro")}</strong>
                <p>${escapeHtml(item.description || statusLabel(item.status))}</p>
              </div>
              <b>${formatDate(item.dueDate)}</b>
            </article>
          `,
        )
        .join("")
    : `<article class="due-item is-empty"><span>✅</span><div><strong>Nenhum vencimento pendente</strong><p>O banco nao retornou pendencias para este cliente.</p></div></article>`;
}

function renderCompanyChecks(checks = []) {
  companyList.innerHTML = checks.length
    ? checks
        .map(
          (check) => `
            <article class="company-check ${check.ok ? "is-ok" : "is-warning"}">
              <span>${check.ok ? "✓" : "!"}</span>
              <div>
                <strong>${escapeHtml(check.title || "Verificacao")}</strong>
                <p>${escapeHtml(check.description || "-")}</p>
              </div>
            </article>
          `,
        )
        .join("")
    : `<article class="company-check is-warning"><span>!</span><div><strong>Sem verificações</strong><p>Nenhum dado retornado pelo backend.</p></div></article>`;
}

function renderDashboard(data) {
  const client = data.client || {};
  const subscription = data.activeSubscription || {};
  const summary = data.summary || {};
  const declaration = summary.declaration || null;
  const annualRevenue = Number(summary.annualRevenue || 0);
  const annualLimit = Number(summary.annualLimit || 0);
  const annualAvailable = Number(summary.annualAvailable || 0);
  const usedPercent = annualLimit > 0 ? Math.min((annualRevenue / annualLimit) * 100, 100) : 0;
  const fullName = client.nome || "Cliente";
  const firstName = fullName.split(/\s+/)[0] || "Cliente";
  const planTitle = subscription.plan_name || "Sem plano ativo";
  const hasActiveSubscription = ["active", "authorized"].includes(String(subscription.status || "").toLowerCase());

  clientName.textContent = fullName;
  clientFirstName.textContent = firstName;
  clientInitials.textContent = initials(fullName);
  sidebarPlan.textContent = planTitle;
  notificationBadge.textContent = String(summary.pendingTotal || 0);

  companyCnpj.textContent = formatCnpj(summary.company?.cnpj || client.cnpj || client.documento);
  companyStatus.textContent = summary.company?.regular ? "Regular" : statusLabel(client.status);
  companyStatus.classList.toggle("is-regular", Boolean(summary.company?.regular));

  dasDate.textContent = summary.nextDue ? formatDate(summary.nextDue) : "Não cadastrada";
  dasStatus.textContent = hasActiveSubscription ? "Em dia no sistema" : "Sem assinatura ativa";
  invoicesMonth.textContent = String(summary.invoicesThisMonth || 0);
  declarationLabel.textContent = declaration?.titulo || declaration?.tipo || "DASN";
  declarationStatus.textContent = declaration ? statusLabel(declaration.status) : "Sem registro";
  pendingCount.textContent = String(summary.pendingTotal || 0);
  pendingDetail.textContent = `${summary.pendingPayments || 0} pagamento(s), ${summary.pendingDocuments || 0} documento(s), ${summary.pendingContracts || 0} contrato(s)`;

  financeMonth.textContent = money(summary.monthlyRevenue);
  financeLimit.textContent = money(annualLimit);
  financeAvailable.textContent = `${money(annualAvailable)} disponível`;
  financeProgress.style.width = `${usedPercent}%`;
  financeProgressLabel.textContent = `${usedPercent.toFixed(1).replace(".", ",")}% utilizado`;

  renderDueItems(summary.dueItems || []);
  renderCompanyChecks(summary.companyChecks || []);
  renderDetails(client, subscription);
  renderPayments(data.payments || []);
  renderCards(contractsList, data.contracts || [], "Nenhum contrato registrado ainda.", "contrato");
  renderCards(documentsList, data.documents || [], "Nenhum documento registrado ainda.", "documento");
}

async function loadDashboard() {
  const data = await apiRequest("/api/client/dashboard");
  renderDashboard(data);
  showDashboard();
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.accessTab;
    tabButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    loginForm.classList.toggle("is-active", tab === "login");
    setupForm.classList.toggle("is-active", tab === "setup");
    setStatus("");
  });
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Validando acesso...");
  try {
    const payload = Object.fromEntries(new FormData(loginForm).entries());
    const data = await apiRequest("/api/client/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setToken(data.token);
    setStatus("");
    await loadDashboard();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Criando seu acesso...");
  try {
    const payload = Object.fromEntries(new FormData(setupForm).entries());
    const data = await apiRequest("/api/client/auth/setup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setToken(data.token);
    setStatus("");
    await loadDashboard();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.querySelector("[data-logout]").addEventListener("click", async () => {
  try {
    await apiRequest("/api/client/auth/logout", { method: "POST" });
  } catch {
    // A sessao local precisa sair mesmo se o backend estiver indisponivel.
  }
  clearToken();
  showAccess();
});

refreshDashboardButton?.addEventListener("click", async () => {
  refreshDashboardButton.disabled = true;
  try {
    await loadDashboard();
  } finally {
    refreshDashboardButton.disabled = false;
  }
});

(async function bootClientArea() {
  if (!getToken()) {
    showAccess();
    return;
  }

  try {
    await apiRequest("/api/client/auth/me");
    await loadDashboard();
  } catch {
    clearToken();
    showAccess();
  }
})();
