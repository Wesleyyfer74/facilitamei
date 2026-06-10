const loginView = document.querySelector("[data-login-view]");
const dashboardView = document.querySelector("[data-dashboard-view]");
const loginForm = document.querySelector("[data-login-form]");
const loginStatus = document.querySelector("[data-login-status]");
const adminStatus = document.querySelector("[data-admin-status]");
const viewTitle = document.querySelector("[data-view-title]");
const viewButtons = document.querySelectorAll("[data-view-button]");
const viewPanels = document.querySelectorAll("[data-view]");
const metrics = document.querySelector("[data-metrics]");
const latestCustomers = document.querySelector("[data-latest-customers]");
const latestPayments = document.querySelector("[data-latest-payments]");
const customersTable = document.querySelector("[data-customers-table]");
const plansTable = document.querySelector("[data-plans-table]");
const paymentsTable = document.querySelector("[data-payments-table]");
const customerSearch = document.querySelector("[data-customer-search]");
const customerStatus = document.querySelector("[data-customer-status]");
const paymentStatus = document.querySelector("[data-payment-status]");
const drawer = document.querySelector("[data-drawer]");
const drawerContent = document.querySelector("[data-drawer-content]");
const closeDrawerButtons = document.querySelectorAll("[data-close-drawer]");

const configuredApiBase = String(window.FACILITA_API_BASE || "").replace(/\/$/, "");
const isLocalFile = window.location.protocol === "file:";
const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const API_BASE = configuredApiBase || (isLocalFile || (isLocalHost && window.location.port !== "3000") ? "http://localhost:3000" : "");
const SESSION_KEY = "facilita_admin_session";

if (window.location.search) {
  window.history.replaceState(null, "", window.location.pathname);
}

let currentView = "overview";
let plansCache = [];

function getToken() {
  return localStorage.getItem(SESSION_KEY) || "";
}

function setToken(token) {
  localStorage.setItem(SESSION_KEY, token);
}

function clearToken() {
  localStorage.removeItem(SESSION_KEY);
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(message = "", type = "info") {
  adminStatus.textContent = message;
  adminStatus.style.color = type === "error" ? "var(--danger)" : "var(--gold-strong)";
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
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error("Nao consegui conectar ao backend. Verifique se o servidor esta rodando e se o CORS local foi liberado.");
  }

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("A API retornou uma resposta invalida. Confira se a URL do backend esta correta.");
  }

  if (response.status === 401) {
    clearToken();
    showLogin();
    throw new Error(data.error || "Sessao expirada.");
  }

  if (!response.ok) {
    throw new Error(data.error || "Erro na API administrativa.");
  }

  return data;
}

function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
}

function activateView(viewName) {
  currentView = viewName;
  const titles = {
    overview: "Dashboard",
    customers: "Clientes",
    plans: "Planos",
    payments: "Pagamentos",
  };

  viewTitle.textContent = titles[viewName] || "Dashboard";
  viewButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.viewButton === viewName));
  viewPanels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.view === viewName));
  loadCurrentView();
}

function statusPill(status) {
  return `<span class="status-pill ${escapeHtml(status || "")}">${escapeHtml(status || "-")}</span>`;
}

function renderMetrics(data) {
  const cards = [
    ["Clientes", data.users?.total || 0, `${data.users?.active || 0} ativos`],
    ["Assinaturas", data.subscriptions?.total || 0, `${data.subscriptions?.active || 0} ativas`],
    ["Pagamentos aprovados", data.payments?.approved || 0, money(data.payments?.approvedAmount)],
    ["Pendencias", Number(data.users?.pending || 0) + Number(data.payments?.pending || 0), "clientes/pagamentos"],
  ];

  metrics.innerHTML = cards
    .map(
      ([label, value, detail]) => `
        <article class="metric-card">
          <span>${label}</span>
          <strong>${value}</strong>
          <small>${detail}</small>
        </article>
      `,
    )
    .join("");
}

function renderCompactCustomers(rows = []) {
  latestCustomers.innerHTML = rows.length
    ? rows
        .map(
          (customer) => `
            <div class="compact-row">
              <div>
                <strong>${escapeHtml(customer.nome)}</strong>
                <small>${escapeHtml(customer.email)}</small>
              </div>
              ${statusPill(customer.status)}
            </div>
          `,
        )
        .join("")
    : "<p>Nenhum cliente cadastrado ainda.</p>";
}

function renderCompactPayments(rows = []) {
  latestPayments.innerHTML = rows.length
    ? rows
        .map(
          (payment) => `
            <div class="compact-row">
              <div>
                <strong>${money(payment.valor)}</strong>
                <small>${escapeHtml(payment.user_name || payment.email || "-")}</small>
              </div>
              ${statusPill(payment.status)}
            </div>
          `,
        )
        .join("")
    : "<p>Nenhum pagamento registrado ainda.</p>";
}

async function loadOverview() {
  setStatus("Carregando dashboard...");
  const data = await apiRequest("/api/admin/dashboard");
  renderMetrics(data);
  renderCompactCustomers(data.latestCustomers);
  renderCompactPayments(data.latestPayments);
  setStatus("");
}

function renderCustomers(customers = []) {
  customersTable.innerHTML = customers.length
    ? customers
        .map(
          (customer) => `
            <tr>
              <td>
                <strong>${escapeHtml(customer.nome)}</strong>
                <small>ID ${customer.id} - Doc: ${escapeHtml(customer.documento || "-")}</small>
              </td>
              <td>
                ${escapeHtml(customer.email)}
                <small>${escapeHtml(customer.telefone || "-")}</small>
              </td>
              <td>
                ${escapeHtml(customer.plan_name || "Sem plano")}
                <small>${escapeHtml(customer.subscription_status || "-")} ${customer.subscription_value ? `- ${money(customer.subscription_value)}` : ""}</small>
              </td>
              <td>${statusPill(customer.status)}</td>
              <td>
                <div class="row-actions">
                  <button class="mini-button" type="button" data-open-customer="${customer.id}">Abrir</button>
                </div>
              </td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="5">Nenhum cliente encontrado.</td></tr>`;
}

async function loadCustomers() {
  setStatus("Carregando clientes...");
  const params = new URLSearchParams();
  if (customerSearch.value.trim()) params.set("search", customerSearch.value.trim());
  if (customerStatus.value) params.set("status", customerStatus.value);
  const data = await apiRequest(`/api/admin/customers?${params.toString()}`);
  renderCustomers(data.customers);
  setStatus("");
}

function renderPlans(plans = []) {
  plansCache = plans;
  plansTable.innerHTML = plans.length
    ? plans
        .map(
          (plan) => `
            <tr>
              <td>
                <strong>${escapeHtml(plan.nome)}</strong>
                <small>${escapeHtml(plan.id)} - ${escapeHtml(plan.servico || "")}</small>
              </td>
              <td>${money(plan.valor)}</td>
              <td>${escapeHtml(plan.tipo_cobranca)} / ${escapeHtml(plan.tipo_frequencia)}</td>
              <td>
                ${plan.mercado_pago_plan_id ? "Associado" : "Pendente"}
                <small>${escapeHtml(plan.mercado_pago_plan_id || "-")}</small>
              </td>
              <td>
                <div class="row-actions">
                  <button class="mini-button" type="button" data-open-plan="${escapeHtml(plan.id)}">Editar</button>
                </div>
              </td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="5">Nenhum plano encontrado.</td></tr>`;
}

async function loadPlans() {
  setStatus("Carregando planos...");
  const data = await apiRequest("/api/admin/plans");
  renderPlans(data.plans);
  setStatus("");
}

function renderPayments(payments = []) {
  paymentsTable.innerHTML = payments.length
    ? payments
        .map(
          (payment) => `
            <tr>
              <td>
                <strong>${escapeHtml(payment.user_name || "-")}</strong>
                <small>${escapeHtml(payment.email || "")}</small>
              </td>
              <td>${money(payment.valor)}</td>
              <td>${statusPill(payment.status)}</td>
              <td>${formatDate(payment.data_pagamento || payment.created_at)}</td>
              <td>${escapeHtml(payment.mercado_pago_payment_id)}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="5">Nenhum pagamento encontrado.</td></tr>`;
}

async function loadPayments() {
  setStatus("Carregando pagamentos...");
  const params = new URLSearchParams();
  if (paymentStatus.value) params.set("status", paymentStatus.value);
  const data = await apiRequest(`/api/admin/payments?${params.toString()}`);
  renderPayments(data.payments);
  setStatus("");
}

async function loadCurrentView() {
  try {
    if (currentView === "overview") await loadOverview();
    if (currentView === "customers") await loadCustomers();
    if (currentView === "plans") await loadPlans();
    if (currentView === "payments") await loadPayments();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function openDrawer(html) {
  drawerContent.innerHTML = html;
  drawer.hidden = false;
}

function closeDrawer() {
  drawer.hidden = true;
  drawerContent.innerHTML = "";
}

async function openCustomer(customerId) {
  try {
    setStatus("Abrindo cliente...");
    const data = await apiRequest(`/api/admin/customers/${customerId}`);
    const customer = data.customer;
    const latestSubscription = data.subscriptions[0];
    const planOptions = plansCache
      .map((plan) => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.nome)} - ${money(plan.valor)}</option>`)
      .join("");

    openDrawer(`
      <div class="drawer-content">
        <div>
          <p class="eyebrow">Cliente #${customer.id}</p>
          <h2>${escapeHtml(customer.nome)}</h2>
          ${statusPill(customer.status)}
        </div>

        <form class="form-grid" data-customer-form data-customer-id="${customer.id}">
          <label>Nome<input name="nome" value="${escapeHtml(customer.nome)}" required /></label>
          <label>E-mail<input name="email" type="email" value="${escapeHtml(customer.email)}" required /></label>
          <div class="form-grid two-cols">
            <label>Telefone<input name="telefone" value="${escapeHtml(customer.telefone || "")}" /></label>
            <label>Documento<input name="documento" value="${escapeHtml(customer.documento || "")}" /></label>
          </div>
          <label>
            Status do cliente
            <select name="status">
              ${["pending", "active", "blocked", "cancelled"]
                .map((status) => `<option value="${status}" ${customer.status === status ? "selected" : ""}>${status}</option>`)
                .join("")}
            </select>
          </label>
          <div class="action-bar">
            <button class="gold-button" type="submit">Salvar cliente</button>
            <button class="danger-button" type="button" data-delete-customer="${customer.id}">Excluir do banco</button>
          </div>
        </form>

        ${
          latestSubscription
            ? `
              <article class="panel">
                <h3>Assinatura atual</h3>
                <p><strong>${escapeHtml(latestSubscription.plan_name)}</strong></p>
                <p>${statusPill(latestSubscription.status)} ${money(latestSubscription.valor)}</p>
                <form class="form-grid" data-subscription-form data-subscription-id="${latestSubscription.id}">
                  <label>
                    Trocar plano local
                    <select name="planId">
                      <option value="">Manter plano atual</option>
                      ${planOptions}
                    </select>
                  </label>
                  <label>
                    Status da assinatura
                    <select name="status">
                      ${["pending", "authorized", "active", "paused", "cancelled", "expired", "rejected"]
                        .map(
                          (status) =>
                            `<option value="${status}" ${latestSubscription.status === status ? "selected" : ""}>${status}</option>`,
                        )
                        .join("")}
                    </select>
                  </label>
                  <div class="action-bar">
                    <button class="gold-button" type="submit">Salvar assinatura</button>
                    <button class="danger-button" type="button" data-cancel-subscription="${latestSubscription.id}">Cancelar no Mercado Pago</button>
                  </div>
                </form>
              </article>
            `
            : `<article class="panel"><h3>Assinatura</h3><p>Cliente ainda nao possui assinatura registrada.</p></article>`
        }

        <article class="panel">
          <h3>Historico de pagamentos</h3>
          <div class="history-list">
            ${
              data.payments.length
                ? data.payments
                    .map(
                      (payment) => `
                        <div class="history-item">
                          <strong>${money(payment.valor)}</strong> ${statusPill(payment.status)}
                          <small>${formatDate(payment.data_pagamento || payment.created_at)}</small>
                        </div>
                      `,
                    )
                    .join("")
                : "<p>Nenhum pagamento registrado.</p>"
            }
          </div>
        </article>
      </div>
    `);
    setStatus("");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function openPlan(planId) {
  const plan = plansCache.find((item) => item.id === planId);
  if (!plan) return;

  openDrawer(`
    <div class="drawer-content">
      <div>
        <p class="eyebrow">Plano</p>
        <h2>${escapeHtml(plan.nome)}</h2>
      </div>
      <form class="form-grid" data-plan-form data-plan-id="${escapeHtml(plan.id)}">
        <label>Nome<input name="nome" value="${escapeHtml(plan.nome)}" required /></label>
        <label>Descricao<textarea name="descricao">${escapeHtml(plan.descricao || "")}</textarea></label>
        <div class="form-grid two-cols">
          <label>Valor<input name="valor" type="number" step="0.01" value="${Number(plan.valor)}" required /></label>
          <label>Ordem<input name="ordem" type="number" value="${Number(plan.ordem || 0)}" /></label>
        </div>
        <div class="form-grid two-cols">
          <label>Frequencia<input name="frequencia" type="number" value="${Number(plan.frequencia || 1)}" /></label>
          <label>
            Tipo frequencia
            <select name="tipo_frequencia">
              <option value="months" ${plan.tipo_frequencia === "months" ? "selected" : ""}>months</option>
              <option value="days" ${plan.tipo_frequencia === "days" ? "selected" : ""}>days</option>
            </select>
          </label>
        </div>
        <label>Servico<input name="servico" value="${escapeHtml(plan.servico || "")}" /></label>
        <div class="form-grid two-cols">
          <label>
            Tipo cobranca
            <select name="tipo_cobranca">
              <option value="subscription" ${plan.tipo_cobranca === "subscription" ? "selected" : ""}>subscription</option>
              <option value="single" ${plan.tipo_cobranca === "single" ? "selected" : ""}>single</option>
            </select>
          </label>
          <label>
            Ativo
            <select name="ativo">
              <option value="1" ${plan.ativo ? "selected" : ""}>Sim</option>
              <option value="0" ${!plan.ativo ? "selected" : ""}>Nao</option>
            </select>
          </label>
        </div>
        <button class="gold-button" type="submit">Salvar plano</button>
      </form>
    </div>
  `);
}

async function saveCustomer(form) {
  const formData = new FormData(form);
  const customerId = form.dataset.customerId;
  await apiRequest(`/api/admin/customers/${customerId}`, {
    method: "PATCH",
    body: JSON.stringify(Object.fromEntries(formData.entries())),
  });
  setStatus("Cliente salvo.");
  closeDrawer();
  await loadCustomers();
}

async function saveSubscription(form) {
  const formData = new FormData(form);
  const subscriptionId = form.dataset.subscriptionId;
  const payload = Object.fromEntries(formData.entries());
  if (!payload.planId) delete payload.planId;

  await apiRequest(`/api/admin/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  setStatus("Assinatura atualizada.");
  closeDrawer();
  await loadCustomers();
}

async function savePlan(form) {
  const formData = new FormData(form);
  const planId = form.dataset.planId;
  const payload = Object.fromEntries(formData.entries());
  payload.ativo = payload.ativo === "1";

  await apiRequest(`/api/admin/plans/${planId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  setStatus("Plano salvo.");
  closeDrawer();
  await loadPlans();
}

async function deleteCustomer(customerId) {
  if (!window.confirm("Excluir este cliente do banco local? Historico local de pagamentos e assinaturas tambem sera removido.")) return;

  await apiRequest(`/api/admin/customers/${customerId}`, { method: "DELETE" });
  setStatus("Cliente excluido do banco local.");
  closeDrawer();
  await loadCustomers();
}

async function cancelSubscription(subscriptionId) {
  if (!window.confirm("Cancelar esta assinatura no Mercado Pago e marcar cliente como cancelado?")) return;

  await apiRequest(`/api/admin/subscriptions/${subscriptionId}/cancel`, { method: "POST" });
  setStatus("Assinatura cancelada.");
  closeDrawer();
  await loadCustomers();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginStatus.textContent = "Validando acesso...";

  try {
    const formData = new FormData(loginForm);
    const data = await apiRequest("/api/admin/auth/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
    setToken(data.token);
    loginStatus.textContent = "";
    showDashboard();
    try {
      await loadPlans();
      activateView("overview");
    } catch (loadError) {
      setStatus(loadError.message, "error");
      activateView("overview");
    }
  } catch (error) {
    loginStatus.textContent = error.message;
  }
});

document.querySelector("[data-logout]").addEventListener("click", async () => {
  try {
    await apiRequest("/api/admin/auth/logout", { method: "POST" });
  } catch {
    // The local session should be cleared even if the network request fails.
  }
  clearToken();
  showLogin();
});

document.querySelector("[data-refresh]").addEventListener("click", loadCurrentView);
document.querySelector("[data-search-customers]").addEventListener("click", loadCustomers);
document.querySelector("[data-filter-payments]").addEventListener("click", loadPayments);
customerSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadCustomers();
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => activateView(button.dataset.viewButton));
});

document.addEventListener("click", (event) => {
  const customerButton = event.target.closest("[data-open-customer]");
  const planButton = event.target.closest("[data-open-plan]");
  const deleteButton = event.target.closest("[data-delete-customer]");
  const cancelButton = event.target.closest("[data-cancel-subscription]");

  if (customerButton) openCustomer(customerButton.dataset.openCustomer);
  if (planButton) openPlan(planButton.dataset.openPlan);
  if (deleteButton) deleteCustomer(deleteButton.dataset.deleteCustomer).catch((error) => setStatus(error.message, "error"));
  if (cancelButton) cancelSubscription(cancelButton.dataset.cancelSubscription).catch((error) => setStatus(error.message, "error"));
});

document.addEventListener("submit", (event) => {
  const customerForm = event.target.closest("[data-customer-form]");
  const subscriptionForm = event.target.closest("[data-subscription-form]");
  const planForm = event.target.closest("[data-plan-form]");

  if (customerForm) {
    event.preventDefault();
    saveCustomer(customerForm).catch((error) => setStatus(error.message, "error"));
  }

  if (subscriptionForm) {
    event.preventDefault();
    saveSubscription(subscriptionForm).catch((error) => setStatus(error.message, "error"));
  }

  if (planForm) {
    event.preventDefault();
    savePlan(planForm).catch((error) => setStatus(error.message, "error"));
  }
});

closeDrawerButtons.forEach((button) => button.addEventListener("click", closeDrawer));

(async function bootAdmin() {
  if (!getToken()) {
    showLogin();
    return;
  }

  try {
    await apiRequest("/api/admin/auth/me");
    showDashboard();
    await loadPlans();
    activateView("overview");
  } catch {
    clearToken();
    showLogin();
  }
})();
