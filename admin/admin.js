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
const hubMetrics = document.querySelector("[data-hub-metrics]");
const hubLatestCustomers = document.querySelector("[data-hub-latest-customers]");
const hubLatestPayments = document.querySelector("[data-hub-latest-payments]");
const hubCustomers = document.querySelector("[data-hub-customers]");
const hubPlans = document.querySelector("[data-hub-plans]");
const hubPayments = document.querySelector("[data-hub-payments]");
const customersTable = document.querySelector("[data-customers-table]");
const customerDetail = document.querySelector("[data-customer-detail]");
const plansTable = document.querySelector("[data-plans-table]");
const paymentsTable = document.querySelector("[data-payments-table]");
const customerSearch = document.querySelector("[data-customer-search]");
const customerStatus = document.querySelector("[data-customer-status]");
const customerPlan = document.querySelector("[data-customer-plan]");
const paymentStatus = document.querySelector("[data-payment-status]");
const drawer = document.querySelector("[data-drawer]");
const drawerContent = document.querySelector("[data-drawer-content]");
const closeDrawerButtons = document.querySelectorAll("[data-close-drawer]");

const configuredApiBase = String(window.FACILITA_API_BASE || "").replace(/\/$/, "");
const isLocalFile = window.location.protocol === "file:";
const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const productionApiBase = "https://facilitamei-production.up.railway.app";
const isFacilitaDomain = /(^|\.)facilitameibr\.com\.br$/i.test(window.location.hostname);
const API_BASE =
  configuredApiBase ||
  (isLocalFile || (isLocalHost && window.location.port !== "3000")
    ? "http://localhost:3000"
    : isFacilitaDomain
      ? productionApiBase
      : "");
const SESSION_KEY = "facilita_admin_session";

if (window.location.search) {
  window.history.replaceState(null, "", window.location.pathname);
}

let currentView = "customers";
let plansCache = [];
let customersCache = [];
let selectedCustomerId = null;

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

function formatDateOnly(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
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
    const target = API_BASE || window.location.origin;
    throw new Error(`A API retornou uma resposta invalida. Confira se o backend esta em ${target}.`);
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
  const targetPanel = Array.from(viewPanels).find((panel) => panel.dataset.view === viewName);
  if (!targetPanel) {
    setStatus("Esta pagina sera conectada na proxima etapa.");
    return;
  }

  currentView = viewName;
  const titles = {
    overview: "Dashboard",
    customers: "Clientes",
    plans: "Planos",
    payments: "Pagamentos",
    contracts: "Contratos",
    reports: "Relatorios",
    settings: "Configuracoes",
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

function renderHubList(container, rows, emptyMessage) {
  if (!container) return;
  container.innerHTML = rows.length
    ? rows.join("")
    : `<div class="admin-hub-row"><span>${emptyMessage}</span><small>-</small></div>`;
}

function renderAdminCommandCenter(data) {
  if (hubMetrics) {
    const cards = [
      ["Clientes ativos", data.users?.active || 0, "Total de clientes ativos"],
      ["Receita aprovada", money(data.payments?.approvedAmount), "Pagamentos aprovados"],
      ["Pagamentos pendentes", data.payments?.pending || 0, "Aguardando pagamento"],
      ["Novos clientes", data.users?.total || 0, "Base cadastrada"],
    ];

    hubMetrics.innerHTML = cards
      .map(
        ([label, value, detail]) => `
          <article class="admin-kpi-card">
            <span>${label}</span>
            <strong>${value}</strong>
            <small>${detail}</small>
          </article>
        `,
      )
      .join("");
  }

  const customerRows = (data.latestCustomers || []).slice(0, 5).map(
    (customer) => `
      <button class="admin-hub-row" type="button" data-open-customer="${customer.id}">
        <span>
          <strong>${escapeHtml(customer.nome)}</strong>
          <small>${escapeHtml(customer.email || customer.telefone || "-")}</small>
        </span>
        ${statusPill(customer.status)}
      </button>
    `,
  );

  renderHubList(hubLatestCustomers, customerRows.slice(0, 4), "Nenhum cliente recente");
  renderHubList(hubCustomers, customerRows, "Nenhum cliente cadastrado");

  const paymentRows = (data.latestPayments || []).slice(0, 6).map(
    (payment) => `
      <div class="admin-hub-row">
        <span>
          <strong>${escapeHtml(payment.user_name || payment.email || "Cliente")}</strong>
          <small>${formatDate(payment.data_pagamento || payment.created_at)}</small>
        </span>
        <span>
          <strong>${money(payment.valor)}</strong>
          ${statusPill(payment.status)}
        </span>
      </div>
    `,
  );

  renderHubList(hubLatestPayments, paymentRows.slice(0, 4), "Nenhum pagamento recente");
  renderHubList(hubPayments, paymentRows, "Nenhum pagamento encontrado");

  const planRows = plansCache.slice(0, 6).map(
    (plan) => `
      <button class="admin-hub-row" type="button" data-open-plan="${escapeHtml(plan.id)}">
        <span>
          <strong>${escapeHtml(plan.nome)}</strong>
          <small>${escapeHtml(plan.tipo_cobranca || "-")}</small>
        </span>
        <span>
          <strong>${money(plan.valor)}</strong>
          ${statusPill(plan.ativo ? "active" : "blocked")}
        </span>
      </button>
    `,
  );

  renderHubList(hubPlans, planRows, "Nenhum plano encontrado");
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
  renderAdminCommandCenter(data);
  renderCompactCustomers(data.latestCustomers);
  renderCompactPayments(data.latestPayments);
  setStatus("");
}

function getInitials(name = "") {
  const parts = String(name || "Cliente")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return `${parts[0]?.[0] || "C"}${parts[1]?.[0] || ""}`.toUpperCase();
}

function getWhatsappLink(customer = {}) {
  const phone = String(customer.telefone || customer.whatsapp || "").replace(/\D/g, "");
  const message = encodeURIComponent(`Ola, ${customer.nome || "cliente"}. Aqui e da Facilita MEI.`);
  return phone ? `https://wa.me/55${phone}?text=${message}` : `https://wa.me/5567992230801?text=${message}`;
}

function renderCustomerDetailSkeleton(message = "Carregando detalhes do cliente...") {
  if (!customerDetail) return;
  customerDetail.innerHTML = `<div class="empty-detail"><strong>${escapeHtml(message)}</strong><span>Aguarde um instante.</span></div>`;
}

function renderCustomerPreview(data) {
  if (!customerDetail) return;

  const customer = data.customer || {};
  const subscription = data.subscriptions?.[0] || {};
  const payments = data.payments || [];
  const documents = data.documents || [];
  const paidPayments = payments.filter((payment) => ["approved", "paid", "pago"].includes(String(payment.status).toLowerCase()));
  const totalPaid = paidPayments.reduce((sum, payment) => sum + Number(payment.valor || 0), 0);
  const latestPayment = payments[0];
  const paymentRows = payments.slice(0, 3).map(
    (payment) => `
      <tr>
        <td>${formatDateOnly(payment.data_pagamento || payment.created_at)}</td>
        <td>${escapeHtml(subscription.plan_name || payment.plan_name || "-")}</td>
        <td>${money(payment.valor)}</td>
        <td>${statusPill(payment.status)}</td>
        <td>${escapeHtml(payment.mercado_pago_payment_id || payment.gateway_payment_id || "-")}</td>
      </tr>
    `,
  );
  const documentRows = documents.slice(0, 5).map(
    (document) => `
      <div class="document-row">
        <span>
          <strong>${escapeHtml(document.titulo || "Documento")}</strong>
          <small>${escapeHtml(document.tipo || "documento")} &bull; ${formatDateOnly(document.created_at)}</small>
        </span>
        ${statusPill(document.status || "pendente")}
        ${
          document.arquivo_url
            ? `<a class="icon-mini-button" href="${escapeHtml(document.arquivo_url)}" target="_blank" rel="noopener" aria-label="Abrir documento">↗</a>`
            : ""
        }
      </div>
    `,
  );

  customerDetail.innerHTML = `
    <div class="detail-header">
      <h3>Detalhes do Cliente</h3>
      <button class="ghost-button compact" type="button" data-collapse-detail>Fechar ⌃</button>
    </div>
    <div class="customer-detail-grid">
      <aside class="customer-profile-card">
        <span class="profile-avatar">${escapeHtml(getInitials(customer.nome))}</span>
        ${statusPill(customer.status)}
        <h3>${escapeHtml(customer.nome || "Cliente")}</h3>
        <p>${escapeHtml(customer.email || "-")}</p>
        <p>${escapeHtml(customer.telefone || "-")}</p>
        <p>${escapeHtml(customer.documento || "-")}<small>Documento</small></p>
        <a class="ghost-button compact" href="${getWhatsappLink(customer)}" target="_blank" rel="noopener">Conversar no WhatsApp</a>
        <a class="ghost-button compact" href="mailto:${escapeHtml(customer.email || "")}">Enviar E-mail</a>
      </aside>

      <section class="customer-detail-main">
        <div class="detail-info-grid">
          <div class="detail-lines">
            <p><span>Plano</span><strong>${escapeHtml(subscription.plan_name || "Sem plano")}</strong></p>
            <p><span>Status</span><strong>${escapeHtml(subscription.status || customer.status || "-")}</strong></p>
            <p><span>Data de Cadastro</span><strong>${formatDateOnly(customer.created_at)}</strong></p>
            <p><span>Proximo Vencimento</span><strong>${formatDateOnly(subscription.data_proxima_cobranca)}</strong></p>
            <p><span>Mercado Pago</span><strong>${escapeHtml(subscription.mercado_pago_subscription_id || "-")}</strong></p>
            <p><span>E-mail</span><strong>${escapeHtml(customer.email || "-")}</strong></p>
            <p><span>Telefone</span><strong>${escapeHtml(customer.telefone || "-")}</strong></p>
          </div>

          <div class="quick-actions-card">
            <h4>Acoes rapidas</h4>
            <div class="quick-actions-grid">
              <button class="mini-action" type="button" data-open-customer="${customer.id}"><span>↻</span>Renovar Assinatura</button>
              <button class="mini-action" type="button" data-open-customer="${customer.id}"><span>⇅</span>Trocar Plano</button>
              <button class="mini-action danger" type="button" ${subscription.id ? `data-cancel-subscription="${subscription.id}"` : "disabled"}><span>⊗</span>Cancelar Assinatura</button>
              <button class="mini-action" type="button" data-open-customer="${customer.id}"><span>✎</span>Editar Cliente</button>
            </div>
          </div>

          <div class="finance-card">
            <h4>Resumo Financeiro</h4>
            <p><span>Total Pago</span><strong>${money(totalPaid)}</strong></p>
            <p><span>Ultimo Pagamento</span><strong>${formatDateOnly(latestPayment?.data_pagamento || latestPayment?.created_at)}</strong></p>
            <p><span>Situacao</span>${statusPill(latestPayment?.status || "pending")}</p>
            <p><span>Forma de Pagamento</span><strong>${escapeHtml(latestPayment?.metodo_pagamento || latestPayment?.payment_method || "Cartao de Credito")}</strong></p>
          </div>
        </div>

        <div class="customer-bottom-grid">
          <article class="panel compact-panel">
            <div class="panel-title-row">
              <h4>Historico de Pagamentos</h4>
              <button class="ghost-button compact" type="button" data-view-button="payments">Ver todos</button>
            </div>
            <div class="table-wrap mini-table-wrap">
              <table>
                <thead><tr><th>Data</th><th>Plano</th><th>Valor</th><th>Status</th><th>ID Mercado Pago</th></tr></thead>
                <tbody>${paymentRows.length ? paymentRows.join("") : `<tr><td colspan="5">Nenhum pagamento encontrado.</td></tr>`}</tbody>
              </table>
            </div>
          </article>

          <div class="side-stack">
            <article class="panel compact-panel">
              <div class="panel-title-row">
                <h4>Observacoes</h4>
                <button class="icon-mini-button" type="button" data-open-customer="${customer.id}">✎</button>
              </div>
              <p>Cliente carregado no painel administrativo. Use editar cliente para atualizar observacoes internas.</p>
            </article>
            <article class="panel compact-panel">
              <div class="panel-title-row">
                <h4>Documentos e Contratos</h4>
                <button class="ghost-button compact" type="button">Ver todos</button>
              </div>
              <div class="document-list">
                ${
                  documentRows.length
                    ? documentRows.join("")
                    : `<p>Nenhum documento cadastrado para este cliente.</p>`
                }
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>
  `;
}

async function loadCustomerPreview(customerId) {
  selectedCustomerId = Number(customerId);
  renderCustomerDetailSkeleton();
  const data = await apiRequest(`/api/admin/customers/${selectedCustomerId}`);
  renderCustomerPreview(data);
}

function renderCustomers(customers = []) {
  customersCache = customers;
  const selectedPlan = customerPlan?.value || "";
  const visibleCustomers = selectedPlan ? customers.filter((customer) => customer.plan_id === selectedPlan) : customers;

  if (visibleCustomers.length && !visibleCustomers.some((customer) => Number(customer.id) === Number(selectedCustomerId))) {
    selectedCustomerId = visibleCustomers[0].id;
  }

  if (!visibleCustomers.length) {
    selectedCustomerId = null;
  }

  customersTable.innerHTML = visibleCustomers.length
    ? customers
        .filter((customer) => !selectedPlan || customer.plan_id === selectedPlan)
        .map(
          (customer) => `
            <tr class="${Number(customer.id) === Number(selectedCustomerId) ? "is-selected" : ""}">
              <td>
                <div class="customer-cell">
                  <span class="avatar">${escapeHtml(getInitials(customer.nome))}</span>
                  <span>
                    <strong>${escapeHtml(customer.nome)}</strong>
                    <small>${escapeHtml(customer.telefone || "-")} &bull; ${escapeHtml(customer.email || "-")}</small>
                  </span>
                </div>
              </td>
              <td>
                ${escapeHtml(customer.plan_name || "Sem plano")}
                <small>${escapeHtml(customer.subscription_status || "-")} ${customer.subscription_value ? `- ${money(customer.subscription_value)}` : ""}</small>
              </td>
              <td>${statusPill(customer.status)}</td>
              <td>${formatDateOnly(customer.data_proxima_cobranca)}</td>
              <td>${formatDateOnly(customer.created_at)}</td>
              <td>
                <div class="row-actions">
                  <button class="icon-mini-button" type="button" data-preview-customer="${customer.id}" aria-label="Ver detalhes">◉</button>
                  <button class="icon-mini-button" type="button" data-open-customer="${customer.id}" aria-label="Editar">✎</button>
                  <a class="icon-mini-button" href="${getWhatsappLink(customer)}" target="_blank" rel="noopener" aria-label="WhatsApp">☏</a>
                  <button class="icon-mini-button" type="button" data-open-customer="${customer.id}" aria-label="Mais ações">⋮</button>
                </div>
              </td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="6">Nenhum cliente encontrado.</td></tr>`;

  if (selectedCustomerId) {
    loadCustomerPreview(selectedCustomerId).catch((error) => {
      if (customerDetail) {
        customerDetail.innerHTML = `<div class="empty-detail"><strong>Nao foi possivel carregar o cliente.</strong><span>${escapeHtml(error.message)}</span></div>`;
      }
    });
  } else if (customerDetail) {
    customerDetail.innerHTML = `<div class="empty-detail"><strong>Nenhum cliente selecionado</strong><span>Cadastre ou localize um cliente para ver os detalhes.</span></div>`;
  }
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
  if (customerPlan) {
    customerPlan.innerHTML = `<option value="">Todos os planos</option>${plans
      .map((plan) => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.nome)}</option>`)
      .join("")}`;
  }

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
      activateView("customers");
    } catch (loadError) {
      setStatus(loadError.message, "error");
      activateView("customers");
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
customerStatus.addEventListener("change", loadCustomers);
customerPlan?.addEventListener("change", () => renderCustomers(customersCache));
customerSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadCustomers();
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => activateView(button.dataset.viewButton));
});

document.addEventListener("click", (event) => {
  const customerButton = event.target.closest("[data-open-customer]");
  const previewButton = event.target.closest("[data-preview-customer]");
  const planButton = event.target.closest("[data-open-plan]");
  const deleteButton = event.target.closest("[data-delete-customer]");
  const cancelButton = event.target.closest("[data-cancel-subscription]");
  const newCustomerButton = event.target.closest("[data-new-customer]");
  const dynamicViewButton = event.target.closest("[data-view-button]");
  const collapseButton = event.target.closest("[data-collapse-detail]");

  if (dynamicViewButton && !Array.from(viewButtons).includes(dynamicViewButton)) {
    activateView(dynamicViewButton.dataset.viewButton);
  }
  if (customerButton) openCustomer(customerButton.dataset.openCustomer);
  if (previewButton) {
    loadCustomerPreview(previewButton.dataset.previewCustomer)
      .then(() => renderCustomers(customersCache))
      .catch((error) => setStatus(error.message, "error"));
  }
  if (planButton) openPlan(planButton.dataset.openPlan);
  if (deleteButton) deleteCustomer(deleteButton.dataset.deleteCustomer).catch((error) => setStatus(error.message, "error"));
  if (cancelButton) cancelSubscription(cancelButton.dataset.cancelSubscription).catch((error) => setStatus(error.message, "error"));
  if (newCustomerButton) setStatus("Cadastro manual de cliente sera conectado na proxima etapa.");
  if (collapseButton && customerDetail) {
    customerDetail.innerHTML = `<div class="empty-detail"><strong>Painel fechado</strong><span>Escolha outro cliente na tabela para reabrir os detalhes.</span></div>`;
  }
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
    activateView("customers");
  } catch {
    clearToken();
    showLogin();
  }
})();
