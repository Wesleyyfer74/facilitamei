const accessView = document.querySelector("[data-access-view]");
const dashboardView = document.querySelector("[data-dashboard-view]");
const loginForm = document.querySelector("[data-login-form]");
const setupForm = document.querySelector("[data-setup-form]");
const statusBox = document.querySelector("[data-client-status]");
const tabButtons = document.querySelectorAll("[data-access-tab]");
const routeButtons = document.querySelectorAll("[data-client-route]");
const clientPages = document.querySelectorAll("[data-client-page]");
const pageLinks = document.querySelectorAll("[data-go-page]");
const clientName = document.querySelector("[data-client-name]");
const clientFirstName = document.querySelector("[data-client-first-name]");
const clientInitials = document.querySelector("[data-client-initials]");
const sidebarPlan = document.querySelector("[data-sidebar-plan]");
const notificationBadge = document.querySelector("[data-notification-badge]");
const companyCnpj = document.querySelector("[data-company-cnpj]");
const companyStatus = document.querySelector("[data-company-status]");
const companyCnpjCopy = document.querySelector("[data-company-cnpj-copy]");
const companyStatusCopy = document.querySelector("[data-company-status-copy]");
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
const paymentsTable = document.querySelector("[data-payments-table]");
const paymentsCount = document.querySelector("[data-payments-count]");
const contractsList = document.querySelector("[data-contracts-list]");
const documentsCards = document.querySelector("[data-documents-cards]");
const documentsHistory = document.querySelector("[data-documents-history]");
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

function showClientPage(page = "dashboard", updateHash = true) {
  const targetPage = document.querySelector(`[data-client-page="${page}"]`) ? page : "dashboard";
  clientPages.forEach((item) => item.classList.toggle("is-active", item.dataset.clientPage === targetPage));
  routeButtons.forEach((item) => item.classList.toggle("is-active", item.dataset.clientRoute === targetPage));
  if (updateHash) history.replaceState(null, "", `#${targetPage === "servicos" ? "servicos-rapidos" : targetPage}`);
  window.scrollTo({ top: 0, behavior: "auto" });
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

function getDocumentIcon(document = {}) {
  const text = `${document.titulo || ""} ${document.tipo || ""}`.toLowerCase();
  if (text.includes("cnpj")) return "🪪";
  if (text.includes("contrato") || text.includes("ccmei")) return "📄";
  if (text.includes("inscri")) return "🏛️";
  if (text.includes("declara")) return "📋";
  if (text.includes("nota") || text.includes("nf")) return "📑";
  return "📁";
}

function renderDocumentRequestCard() {
  return `
    <article class="document-card request-document-card">
      <span class="document-icon">📄+</span>
      <h3>Precisando de outro documento?</h3>
      <p>Fale com a nossa equipe e solicite o documento que você precisa.</p>
      <a href="https://wa.me/5567992230801?text=Olá,%20preciso%20solicitar%20um%20documento%20da%20minha%20empresa." target="_blank" rel="noopener">Solicitar documento</a>
    </article>
  `;
}

function renderDocuments(documents = []) {
  const sortedDocuments = [...documents].sort((a, b) => {
    const dateA = new Date(a.data_emissao || a.created_at || 0).getTime();
    const dateB = new Date(b.data_emissao || b.created_at || 0).getTime();
    return dateB - dateA;
  });

  const cards = sortedDocuments
    .slice(0, 3)
    .map((document) => {
      const fileUrl = document.arquivo_url || "";
      const action = fileUrl
        ? `<a href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener">Baixar PDF</a>`
        : `<button type="button" disabled>Sem arquivo</button>`;

      return `
        <article class="document-card">
          <span class="document-icon">${getDocumentIcon(document)}</span>
          <h3>${escapeHtml(document.titulo || document.tipo || "Documento")}</h3>
          <p>${escapeHtml(document.observacao || "Documento cadastrado no sistema da Facilita.")}</p>
          <div class="document-meta">
            <span>Emitido em</span>
            <strong>${formatDate(document.data_emissao || document.created_at)}</strong>
            <span>Situação</span>
            <b>${escapeHtml(statusLabel(document.status))}</b>
          </div>
          ${action}
        </article>
      `;
    })
    .join("");

  documentsCards.innerHTML = `${cards}${renderDocumentRequestCard()}`;
  documentsHistory.innerHTML = sortedDocuments.length
    ? sortedDocuments
        .map((document) => {
          const fileUrl = document.arquivo_url || "";
          return `
            <tr>
              <td><span class="table-document-icon">${getDocumentIcon(document)}</span>${escapeHtml(document.titulo || document.tipo || "Documento")}</td>
              <td>${formatDate(document.data_emissao || document.created_at)}</td>
              <td><span class="status-pill">${escapeHtml(statusLabel(document.status))}</span></td>
              <td>${fileUrl ? `<a href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener">PDF</a>` : "-"}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="4">Nenhum documento cadastrado ainda.</td></tr>`;
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
  if (companyCnpjCopy) companyCnpjCopy.textContent = companyCnpj.textContent;
  if (companyStatusCopy) {
    companyStatusCopy.textContent = companyStatus.textContent;
    companyStatusCopy.classList.toggle("is-regular", Boolean(summary.company?.regular));
  }

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
  renderPayments(data.payments || []);
  renderCards(contractsList, data.contracts || [], "Nenhum contrato registrado ainda.", "contrato");
  renderDocuments(data.documents || []);
}

async function loadDashboard() {
  const data = await apiRequest("/api/client/dashboard");
  renderDashboard(data);
  showDashboard();
}

function pageFromHash() {
  const hash = window.location.hash.replace("#", "");
  const map = {
    dashboard: "dashboard",
    documentos: "documentos",
    "servicos-rapidos": "servicos",
    servicos: "servicos",
    configuracoes: "configuracoes",
  };
  return map[hash] || "dashboard";
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

routeButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    showClientPage(button.dataset.clientRoute || "dashboard");
  });
});

pageLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showClientPage(link.dataset.goPage || "dashboard");
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
    showClientPage(pageFromHash(), false);
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
    showClientPage(pageFromHash(), false);
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
    showClientPage(pageFromHash(), false);
  } catch {
    clearToken();
    showAccess();
  }
})();
