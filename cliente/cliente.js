const accessView = document.querySelector("[data-access-view]");
const dashboardView = document.querySelector("[data-dashboard-view]");
const loginForm = document.querySelector("[data-login-form]");
const setupForm = document.querySelector("[data-setup-form]");
const statusBox = document.querySelector("[data-client-status]");
const tabButtons = document.querySelectorAll("[data-access-tab]");
const clientName = document.querySelector("[data-client-name]");
const planName = document.querySelector("[data-plan-name]");
const planDetail = document.querySelector("[data-plan-detail]");
const planStatus = document.querySelector("[data-plan-status]");
const nextCharge = document.querySelector("[data-next-charge]");
const clientDetails = document.querySelector("[data-client-details]");
const paymentsTable = document.querySelector("[data-payments-table]");
const paymentsCount = document.querySelector("[data-payments-count]");
const contractsList = document.querySelector("[data-contracts-list]");
const documentsList = document.querySelector("[data-documents-list]");

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
  };
  return labels[status] || status || "-";
}

function showAccess() {
  accessView.hidden = false;
  dashboardView.hidden = true;
}

function showDashboard() {
  accessView.hidden = true;
  dashboardView.hidden = false;
}

function renderDetails(client = {}) {
  clientDetails.innerHTML = [
    ["Nome", client.nome],
    ["E-mail", client.email],
    ["Telefone", client.telefone || client.whatsapp],
    ["Documento", client.documento || client.cnpj],
    ["Status", statusLabel(client.status)],
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

function renderDashboard(data) {
  const client = data.client || {};
  const subscription = data.activeSubscription || {};

  clientName.textContent = client.nome || "Area do cliente";
  planName.textContent = subscription.plan_name || "Sem assinatura ativa";
  planDetail.textContent = subscription.plan_description || "Quando sua assinatura estiver ativa, os detalhes aparecem aqui.";
  planStatus.textContent = `Status: ${statusLabel(subscription.status)}`;
  nextCharge.textContent = `Proxima cobranca: ${formatDate(subscription.data_proxima_cobranca)}`;

  renderDetails(client);
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
