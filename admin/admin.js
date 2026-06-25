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
const dashboardKpis = document.querySelector("[data-dashboard-kpis]");
const dashboardCustomers = document.querySelector("[data-dashboard-customers]");
const dashboardPayments = document.querySelector("[data-dashboard-payments]");
const dashboardFinancial = document.querySelector("[data-dashboard-financial]");
const hubMetrics = document.querySelector("[data-hub-metrics]");
const hubLatestCustomers = document.querySelector("[data-hub-latest-customers]");
const hubLatestPayments = document.querySelector("[data-hub-latest-payments]");
const hubCustomers = document.querySelector("[data-hub-customers]");
const hubPlans = document.querySelector("[data-hub-plans]");
const hubPayments = document.querySelector("[data-hub-payments]");
const customersTable = document.querySelector("[data-customers-table]");
const customerDetail = document.querySelector("[data-customer-detail]");
const plansTable = document.querySelector("[data-plans-table]");
const planDetail = document.querySelector("[data-plan-detail]");
const paymentsTable = document.querySelector("[data-payments-table]");
const paymentsSummary = document.querySelector("[data-payments-summary]");
const paymentsCount = document.querySelector("[data-payments-count]");
const contractsTable = document.querySelector("[data-contracts-table]");
const contractsSummary = document.querySelector("[data-contracts-summary]");
const contractsCount = document.querySelector("[data-contracts-count]");
const customerSearch = document.querySelector("[data-customer-search]");
const customerStatus = document.querySelector("[data-customer-status]");
const customerPlan = document.querySelector("[data-customer-plan]");
const paymentStatus = document.querySelector("[data-payment-status]");
const paymentFilterButtons = document.querySelectorAll("[data-payment-filter]");
const contractSearch = document.querySelector("[data-contract-search]");
const contractStatus = document.querySelector("[data-contract-status]");
const contractPlan = document.querySelector("[data-contract-plan]");
const contractPeriod = document.querySelector("[data-contract-period]");
const exportContractsButton = document.querySelector("[data-export-contracts]");
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

let currentView = "overview";
let plansCache = [];
let customersCache = [];
let contractsCache = [];
let selectedCustomerId = null;
let selectedPlanId = null;
let currentPaymentFilter = "";

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

function relativeDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  const now = new Date();
  const diffDays = Math.floor((now - date) / 86400000);
  if (diffDays <= 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  return `${diffDays} dias atras`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function iconSvg(name, className = "admin-svg-icon") {
  const paths = {
    home: '<path d="M4 11.5 12 5l8 6.5v7a1 1 0 0 1-1 1h-5v-5h-4v5H5a1 1 0 0 1-1-1z"/>',
    users: '<path d="M16 18c0-2.2-1.8-4-4-4s-4 1.8-4 4"/><circle cx="12" cy="9" r="3"/><path d="M19 18c0-1.6-.9-3-2.2-3.7M17 7.2a2.5 2.5 0 0 1 0 4.6"/>',
    plan: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    card: '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M3.5 10h17M7 15h3"/>',
    contract: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v5h4M10 12h6M10 16h6"/>',
    chart: '<path d="M5 19V11M12 19V5M19 19v-9"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 3.1h5l.4-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z"/>',
    money: '<path d="M12 3v18"/><path d="M16 7.5c-.8-1-2-1.5-3.8-1.5-2 0-3.2.9-3.2 2.2 0 3.6 7.2 1.5 7.2 5.5 0 1.7-1.5 3-4.1 3-1.9 0-3.4-.7-4.2-1.8"/>',
    pending: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/>',
    newUser: '<path d="M15 18c0-2.2-1.8-4-4-4s-4 1.8-4 4"/><circle cx="11" cy="9" r="3"/><path d="M18 8v6M15 11h6"/>',
    cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 21v-9"/>',
    ticket: '<path d="M5 7h14v4a2 2 0 0 0 0 4v4H5v-4a2 2 0 0 0 0-4z"/><path d="M12 8v8"/>',
    growth: '<path d="M4 17 9 12l4 4 7-8"/><path d="M15 8h5v5"/>',
    renew: '<path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 1-2-5"/>',
    swap: '<path d="M7 7h11l-3-3"/><path d="M18 7l-3 3"/><path d="M17 17H6l3 3"/><path d="M6 17l3-3"/>',
    cancel: '<circle cx="12" cy="12" r="8"/><path d="m8.5 8.5 7 7M15.5 8.5l-7 7"/>',
    edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m13.5 8.5 2 2"/>',
    eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="3"/>',
    whatsapp: '<path d="M12 4a8 8 0 0 0-6.8 12.2L4 20l4-1.1A8 8 0 1 0 12 4z"/><path d="M9.2 8.8c.2-.5.4-.5.7-.5h.5c.2 0 .4.1.5.4l.7 1.6c.1.2.1.4-.1.6l-.4.5c-.1.2-.2.3 0 .6.4.8 1.4 1.8 2.2 2.2.3.2.5.1.6 0l.6-.5c.2-.1.4-.2.6-.1l1.5.7c.3.1.4.3.4.6 0 .5-.3 1.2-.7 1.5-.5.4-1.7.5-3.5-.4-2.9-1.4-4.8-4.1-5-5.8-.2-1 .3-1.3.8-1.4z"/>',
    dots: '<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>',
    send: '<path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4z"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  };
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.plan}</svg>`;
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
  const labels = {
    active: "Ativo",
    authorized: "Ativo",
    approved: "Pago",
    paid: "Pago",
    pago: "Pago",
    inactive: "Inativo",
    inativo: "Inativo",
    ativo: "Ativo",
    associado: "Associado",
    pendente: "Pendente",
    pending: "Pendente",
    in_process: "Pendente",
    cancelled: "Cancelado",
    canceled: "Cancelado",
    rejected: "Recusado",
    assinado: "Assinado",
    enviado: "Enviado",
    expirado: "Expirado",
    cancelado: "Cancelado",
  };
  const key = String(status || "")
    .trim()
    .toLowerCase();
  return `<span class="status-pill ${escapeHtml(key)}">${escapeHtml(labels[key] || status || "-")}</span>`;
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

function renderDashboardHome(data) {
  if (!dashboardKpis) return;

  const monthlyRevenue = Number(data.payments?.monthlyApprovedAmount || 0);
  const annualRevenue = monthlyRevenue * 12;
  const approvedPayments = Number(data.payments?.approved || 0);
  const totalUsers = Number(data.users?.total || 0);
  const activeUsers = Number(data.users?.active || 0);
  const conversionRate = totalUsers ? `${((activeUsers / totalUsers) * 100).toFixed(1).replace(".", ",")}%` : "0%";

  const kpis = [
    {
      icon: "users",
      title: "Clientes Ativos",
      value: data.users?.active || 0,
      detail: "Total de clientes ativos",
      action: "Ver clientes ->",
      view: "customers",
    },
    {
      icon: "money",
      title: "Receita Mensal",
      value: money(monthlyRevenue),
      detail: "Este mes",
      action: "Ver relatorios ->",
      view: "payments",
    },
    {
      icon: "pending",
      title: "Pagamentos Pendentes",
      value: data.payments?.pending || 0,
      detail: "Aguardando pagamento",
      action: "Ver pagamentos ->",
      view: "payments",
    },
    {
      icon: "newUser",
      title: "Novos Clientes (30 dias)",
      value: data.users?.newLast30 || 0,
      detail: "Novos cadastros",
      action: "Ver clientes ->",
      view: "customers",
    },
  ];

  dashboardKpis.innerHTML = kpis
    .map(
      (card) => `
        <article class="dashboard-kpi-card">
          <span class="dashboard-kpi-icon">${iconSvg(card.icon)}</span>
          <h3>${escapeHtml(card.title)}</h3>
          <strong>${escapeHtml(card.value)}</strong>
          <small>${escapeHtml(card.detail)}</small>
          <button type="button" data-view-button="${card.view}">${escapeHtml(card.action)}</button>
        </article>
      `,
    )
    .join("");

  dashboardCustomers.innerHTML = (data.latestCustomers || []).length
    ? data.latestCustomers
        .slice(0, 5)
        .map(
          (customer) => `
            <tr>
              <td>
                <div class="customer-cell">
                  <span class="avatar">${escapeHtml(getInitials(customer.nome))}</span>
                  <strong>${escapeHtml(customer.nome || "Cliente")}</strong>
                </div>
              </td>
              <td>${escapeHtml(customer.plan_name || "Sem plano")}</td>
              <td>${escapeHtml(relativeDate(customer.created_at))}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="3">Nenhum cliente encontrado.</td></tr>`;

  dashboardPayments.innerHTML = (data.latestPayments || []).length
    ? data.latestPayments
        .slice(0, 5)
        .map(
          (payment) => `
            <tr>
              <td>${escapeHtml(payment.user_name || payment.email || "Cliente")}</td>
              <td>${escapeHtml(payment.plan_name || "-")}</td>
              <td>${money(payment.valor)}</td>
              <td>${statusPill(payment.status)}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="4">Nenhum pagamento encontrado.</td></tr>`;

  dashboardFinancial.innerHTML = [
    ["cube", "Receita Anual", money(annualRevenue)],
    ["ticket", "Ticket Medio", money(data.payments?.averageApprovedAmount)],
    ["growth", "Taxa de Conversao", conversionRate],
    ["money", "Clientes Cancelados", data.users?.cancelled || 0],
  ]
    .map(
      ([icon, label, value]) => `
        <div class="dashboard-financial-item">
          <span>${iconSvg(icon)}</span>
          <p>${escapeHtml(label)}<strong>${escapeHtml(value)}</strong></p>
        </div>
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
  renderDashboardHome(data);
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

function emptyText(value, fallback = "Nao cadastrado") {
  if (value === null || value === undefined || value === "") return fallback;
  return value;
}

function renderDetailItem(label, value, className = "") {
  return `<p class="${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(emptyText(value))}</strong></p>`;
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
            ? `<a class="icon-mini-button" href="${escapeHtml(document.arquivo_url)}" target="_blank" rel="noopener" aria-label="Abrir documento">+</a>`
            : ""
        }
      </div>
    `,
  );

  customerDetail.innerHTML = `
    <div class="detail-header">
      <h3>Detalhes do Cliente</h3>
      <button class="ghost-button compact" type="button" data-collapse-detail>Fechar ^</button>
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
            <h4>Dados do cliente</h4>
            ${renderDetailItem("ID interno", customer.id)}
            ${renderDetailItem("Nome", customer.nome)}
            ${renderDetailItem("E-mail", customer.email)}
            ${renderDetailItem("Telefone", customer.telefone)}
            ${renderDetailItem("WhatsApp", customer.whatsapp || customer.telefone)}
            ${renderDetailItem("Documento", customer.documento)}
            ${customer.cnpj ? renderDetailItem("CNPJ", customer.cnpj) : ""}
            ${renderDetailItem("Status do cliente", customer.status)}
            ${renderDetailItem("Login ativo", Number(customer.cliente_login_ativo) === 0 ? "Nao" : "Sim")}
            ${renderDetailItem("Cadastro", formatDateOnly(customer.created_at))}
            ${renderDetailItem("Atualizado em", formatDateOnly(customer.updated_at))}

            <h4>Assinatura</h4>
            ${renderDetailItem("ID assinatura", subscription.id)}
            ${renderDetailItem("Plano", subscription.plan_name || "Sem plano")}
            ${renderDetailItem("Plano ID", subscription.plan_id)}
            ${renderDetailItem("Status assinatura", subscription.status)}
            ${renderDetailItem("Valor", subscription.valor ? money(subscription.valor) : "")}
            ${renderDetailItem("Metodo de pagamento", subscription.metodo_pagamento)}
            ${renderDetailItem("Inicio", formatDateOnly(subscription.data_inicio))}
            ${renderDetailItem("Proxima cobranca", formatDateOnly(subscription.data_proxima_cobranca))}
            ${renderDetailItem("Criada em", formatDateOnly(subscription.created_at))}

            <h4>Gateway</h4>
            ${renderDetailItem("Mercado Pago", subscription.mercado_pago_subscription_id, "long-value")}
            ${subscription.init_point ? renderDetailItem("Link checkout", subscription.init_point, "long-value") : ""}
          </div>

          <div class="quick-actions-card">
            <h4>Acoes rapidas</h4>
            <div class="quick-actions-grid">
              <button class="mini-action" type="button" data-open-customer="${customer.id}"><span>${iconSvg("renew")}</span>Renovar Assinatura</button>
              <button class="mini-action" type="button" data-open-customer="${customer.id}"><span>${iconSvg("swap")}</span>Trocar Plano</button>
              <button class="mini-action danger" type="button" ${subscription.id ? `data-cancel-subscription="${subscription.id}"` : "disabled"}><span>${iconSvg("cancel")}</span>Cancelar Assinatura</button>
              <button class="mini-action" type="button" data-open-customer="${customer.id}"><span>${iconSvg("edit")}</span>Editar Cliente</button>
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
                <button class="icon-mini-button" type="button" data-open-customer="${customer.id}">E</button>
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

  if (!visibleCustomers.length || !visibleCustomers.some((customer) => Number(customer.id) === Number(selectedCustomerId))) {
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
                  <button class="icon-mini-button" type="button" data-preview-customer="${customer.id}" aria-label="Ver detalhes">${iconSvg("eye")}</button>
                  <button class="icon-mini-button" type="button" data-open-customer="${customer.id}" aria-label="Editar">${iconSvg("edit")}</button>
                  <a class="icon-mini-button" href="${getWhatsappLink(customer)}" target="_blank" rel="noopener" aria-label="WhatsApp">${iconSvg("whatsapp")}</a>
                  <button class="icon-mini-button" type="button" data-open-customer="${customer.id}" aria-label="Mais acoes">${iconSvg("dots")}</button>
                </div>
              </td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="6">Nenhum cliente encontrado.</td></tr>`;

  if (!selectedCustomerId && customerDetail) {
    customerDetail.innerHTML = `<div class="empty-detail"><strong>Detalhes fechados</strong><span>Clique no icone de abrir em um cliente para visualizar os dados.</span></div>`;
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

function getPlanIcon(planId = "") {
  const icons = {
    "start-mei": "home",
    servicos: "chart",
    premium: "cube",
    comercio: "card",
    full: "plan",
  };
  return icons[planId] || "plan";
}

function planFeatures(plan) {
  if (!Array.isArray(plan.features) || !plan.features.length) {
    return ["Nenhum item incluso cadastrado no banco."];
  }

  return plan.features
    .map((feature) => String(feature.descricao || "").trim())
    .filter(Boolean);
}

function renderPlanDetail(plan) {
  if (!planDetail) return;

  if (!plan) {
    planDetail.innerHTML = `
      <div class="empty-detail">
        <strong>Selecione um plano</strong>
        <span>Clique em um plano da tabela para ver configuracoes e resumo.</span>
      </div>
    `;
    return;
  }

  const activeClients = Number(plan.active_clients || 0);
  const monthlyRevenue = Number(plan.monthly_revenue || 0);
  const mercadoPagoStatus = plan.mercado_pago_plan_id ? "Associado" : "Pendente";

  planDetail.innerHTML = `
    <div class="plan-detail-title">
      <h3>Detalhes do plano selecionado</h3>
    </div>
    <div class="plan-detail-grid">
      <article class="selected-plan-card">
        <span class="selected-plan-icon">${iconSvg(getPlanIcon(plan.id))}</span>
        <h4>${escapeHtml(plan.nome)}</h4>
        <strong>${money(plan.valor)} <small>/ mes</small></strong>
        <p>${activeClients} clientes ativos</p>
      </article>

      <article class="plan-feature-card">
        <h4>Inclui:</h4>
        <ul class="plan-feature-list">
          ${planFeatures(plan).map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
        </ul>
      </article>

      <article class="plan-config-card">
        <h4>Configuracoes</h4>
        <p><span>Status:</span>${statusPill(plan.ativo ? "Ativo" : "Inativo")}</p>
        <p><span>Mercado Pago:</span>${statusPill(mercadoPagoStatus)}</p>
        <button class="ghost-button compact" type="button" data-open-plan="${escapeHtml(plan.id)}">Editar Plano</button>
      </article>

      <article class="plan-summary-card">
        <h4>Resumo do Plano</h4>
        <p><span>Valor Mensal</span><strong>${money(plan.valor)}</strong></p>
        <p><span>Clientes Ativos</span><strong>${activeClients}</strong></p>
        <p><span>Receita Mensal</span><strong>${money(monthlyRevenue)}</strong></p>
        <p><span>Criado em</span><strong>${formatDateOnly(plan.created_at)}</strong></p>
        <p><span>Mercado Pago</span><strong class="${plan.mercado_pago_plan_id ? "ok-text" : "warn-text"}">${escapeHtml(mercadoPagoStatus)}</strong></p>
      </article>
    </div>
  `;
}

function renderPlans(plans = []) {
  plansCache = plans;
  if (customerPlan) {
    customerPlan.innerHTML = `<option value="">Todos os planos</option>${plans
      .map((plan) => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.nome)}</option>`)
      .join("")}`;
  }

  if (contractPlan) {
    const selectedValue = contractPlan.value;
    contractPlan.innerHTML = `<option value="">Todos os planos</option>${plans
      .map((plan) => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.nome)}</option>`)
      .join("")}`;
    contractPlan.value = plans.some((plan) => plan.id === selectedValue) ? selectedValue : "";
  }

  if (plans.length && !plans.some((plan) => plan.id === selectedPlanId)) {
    selectedPlanId = plans.find((plan) => plan.id === "premium")?.id || plans[0].id;
  }

  plansTable.innerHTML = plans.length
    ? plans
        .map(
          (plan) => `
            <tr class="${plan.id === selectedPlanId ? "is-selected" : ""}" data-select-plan="${escapeHtml(plan.id)}">
              <td>
                <button class="plan-cell" type="button" data-select-plan="${escapeHtml(plan.id)}">
                  <span class="plan-icon-box">${iconSvg(getPlanIcon(plan.id))}</span>
                  <span>
                    <strong>${escapeHtml(plan.nome)}</strong>
                    <small>${escapeHtml(plan.descricao || plan.servico || plan.id)}</small>
                  </span>
                </button>
              </td>
              <td>${money(plan.valor)} <small>/ mes</small></td>
              <td>${Number(plan.active_clients || 0)}</td>
              <td>${statusPill(plan.ativo ? "Ativo" : "Inativo")}</td>
              <td>
                <div class="row-actions">
                  <button class="icon-mini-button" type="button" data-open-plan="${escapeHtml(plan.id)}" aria-label="Editar plano">${iconSvg("edit")}</button>
                  <button class="icon-mini-button" type="button" data-select-plan="${escapeHtml(plan.id)}" aria-label="Mais detalhes">${iconSvg("dots")}</button>
                </div>
              </td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="5">Nenhum plano encontrado.</td></tr>`;

  renderPlanDetail(plans.find((plan) => plan.id === selectedPlanId));
}

async function loadPlans() {
  setStatus("Carregando planos...");
  const data = await apiRequest("/api/admin/plans");
  renderPlans(data.plans);
  setStatus("");
}

function renderPayments(payments = [], summary = {}) {
  paymentsTable.innerHTML = payments.length
    ? payments
        .map(
          (payment) => `
            <tr>
              <td>
                <div class="customer-cell">
                  <span class="avatar">${escapeHtml(getInitials(payment.user_name || payment.email || "Cliente"))}</span>
                  <span>
                    <strong>${escapeHtml(payment.user_name || payment.email || "Cliente")}</strong>
                    <small>${escapeHtml(payment.email || "")}</small>
                  </span>
                </div>
              </td>
              <td>${escapeHtml(payment.plan_name || "Sem plano")}</td>
              <td>${money(payment.valor)}</td>
              <td>${statusPill(payment.status)}</td>
              <td>${formatDateOnly(payment.data_pagamento || payment.created_at)}</td>
              <td>${escapeHtml(payment.mercado_pago_payment_id)}</td>
              <td>
                <div class="row-actions">
                  <button class="icon-mini-button" type="button" data-preview-customer="${payment.user_id}" aria-label="Ver cliente">${iconSvg("eye")}</button>
                </div>
              </td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="7">Nenhum pagamento encontrado.</td></tr>`;

  if (paymentsCount) {
    paymentsCount.textContent = `Mostrando ${payments.length} de ${Number(summary.total || payments.length)} pagamentos`;
  }

  if (paymentsSummary) {
    const monthlyRevenue = Number(summary.monthlyApprovedAmount || 0);
    const annualRevenue = Number(summary.approvedAmount || 0) || monthlyRevenue * 12;
    const pendingAmount = Number(summary.pendingAmount || 0);
    const approved = Number(summary.approved || 0);
    const total = Number(summary.total || 0);
    const approvalRate = total ? `${((approved / total) * 100).toFixed(0)}%` : "0%";

    paymentsSummary.innerHTML = [
      ["money", "Receita (Este mes)", money(monthlyRevenue)],
      ["chart", "Receita (Ano)", money(annualRevenue)],
      ["card", "Pagamentos Pendentes", money(pendingAmount)],
      ["growth", "Taxa de Aprovacao", approvalRate],
    ]
      .map(
        ([icon, label, value]) => `
          <article class="payment-summary-item">
            <span>${iconSvg(icon)}</span>
            <p>${escapeHtml(label)}<strong>${escapeHtml(value)}</strong></p>
          </article>
        `,
      )
      .join("");
  }
}

async function loadPayments() {
  setStatus("Carregando pagamentos...");
  const params = new URLSearchParams();
  const status = paymentStatus?.value || currentPaymentFilter;
  if (status) params.set("status", status);
  const data = await apiRequest(`/api/admin/payments?${params.toString()}`);
  renderPayments(data.payments, data.summary);
  setStatus("");
}

function renderContracts(contracts = [], summary = {}) {
  contractsCache = contracts;

  if (contractsSummary) {
    const total = Number(summary.total || 0);
    const signed = Number(summary.signed || 0);
    const pending = Number(summary.pending || 0);
    const expired = Number(summary.expired || 0);
    const signedRate = total ? `${((signed / total) * 100).toFixed(2)}% do total` : "0% do total";
    const pendingRate = total ? `${((pending / total) * 100).toFixed(2)}% do total` : "0% do total";
    const expiredRate = total ? `${((expired / total) * 100).toFixed(2)}% do total` : "0% do total";

    contractsSummary.innerHTML = [
      ["Total de Contratos", total, "Todos os contratos", ""],
      ["Assinados", signed, signedRate, "ok-value"],
      ["Pendentes", pending, pendingRate, "warn-value"],
      ["Expirados", expired, expiredRate, "danger-value"],
    ]
      .map(
        ([label, value, detail, className]) => `
          <article class="contract-stat-card">
            <span>${escapeHtml(label)}</span>
            <strong class="${escapeHtml(className)}">${escapeHtml(value)}</strong>
            <small>${escapeHtml(detail)}</small>
          </article>
        `,
      )
      .join("");
  }

  if (contractsTable) {
    contractsTable.innerHTML = contracts.length
      ? contracts
          .map((contract) => {
            const statusKey = String(contract.status || "").toLowerCase();
            const isSigned = statusKey === "assinado";
            const fileUrl = contract.arquivo_url || contract.assinatura_url || "";
            const actionButton = isSigned && fileUrl
              ? `<a class="icon-mini-button" href="${escapeHtml(fileUrl)}" target="_blank" rel="noreferrer" aria-label="Baixar contrato">${iconSvg("download")}</a>`
              : `<button class="icon-mini-button ${isSigned ? "is-disabled" : ""}" type="button" data-send-contract="${contract.id}" aria-label="Enviar contrato">${iconSvg("send")}</button>`;

            return `
              <tr>
                <td>
                  <div class="customer-cell">
                    <span class="avatar">${escapeHtml(getInitials(contract.user_name || contract.email || "Cliente"))}</span>
                    <span>
                      <strong>${escapeHtml(contract.user_name || contract.email || "Cliente")}</strong>
                      <small>${escapeHtml(contract.email || "")}</small>
                    </span>
                  </div>
                </td>
                <td>
                  <strong>${escapeHtml(contract.plan_name || "Sem plano")}</strong>
                  <small>${money(contract.plan_value)} / mes</small>
                </td>
                <td>${formatDate(contract.data_envio || contract.created_at)}</td>
                <td>
                  ${statusPill(contract.status)}
                  <small>${isSigned ? "Assinado digitalmente" : statusKey === "expirado" ? "Prazo expirado" : "Aguardando assinatura"}</small>
                </td>
                <td>${formatDate(contract.data_assinatura)}</td>
                <td>
                  <div class="row-actions">
                    <button class="icon-mini-button" type="button" data-preview-customer="${contract.user_id}" aria-label="Ver cliente">${iconSvg("eye")}</button>
                    ${actionButton}
                    <button class="icon-mini-button" type="button" aria-label="Mais opcoes">${iconSvg("dots")}</button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="6">Nenhum contrato encontrado.</td></tr>`;
  }

  if (contractsCount) {
    contractsCount.textContent = `Mostrando ${contracts.length} de ${Number(summary.total || contracts.length)} contratos`;
  }
}

async function loadContracts() {
  setStatus("Carregando contratos...");
  if (contractPlan && !plansCache.length) {
    const plansData = await apiRequest("/api/admin/plans");
    renderPlans(plansData.plans || []);
  }
  const params = new URLSearchParams();
  const search = contractSearch?.value?.trim() || "";
  if (search) params.set("search", search);
  if (contractStatus?.value) params.set("status", contractStatus.value);
  if (contractPlan?.value) params.set("planId", contractPlan.value);
  if (contractPeriod?.value) params.set("period", contractPeriod.value);
  const data = await apiRequest(`/api/admin/contracts?${params.toString()}`);
  renderContracts(data.contracts, data.summary);
  if (data.warning) setStatus(data.warning, "error");
  else setStatus("");
}

async function generateBulkContracts() {
  setStatus("Gerando contratos em massa...");
  const data = await apiRequest("/api/admin/contracts/generate-bulk", { method: "POST" });
  setStatus(data.message || "Contratos atualizados.");
  await loadContracts();
}

async function sendContract(contractId) {
  setStatus("Atualizando envio do contrato...");
  const data = await apiRequest(`/api/admin/contracts/${contractId}/send`, { method: "POST" });
  setStatus(data.message || "Contrato atualizado.");
  await loadContracts();
}

function exportContractsCsv() {
  if (!contractsCache.length) {
    setStatus("Nao ha contratos carregados para exportar.", "error");
    return;
  }

  const rows = [
    ["Cliente", "Email", "Plano", "Valor", "Status", "Data envio", "Data assinatura", "Contrato"],
    ...contractsCache.map((contract) => [
      contract.user_name || "",
      contract.email || "",
      contract.plan_name || "",
      Number(contract.plan_value || 0).toFixed(2),
      contract.status || "",
      contract.data_envio || contract.created_at || "",
      contract.data_assinatura || "",
      contract.arquivo_url || contract.assinatura_url || "",
    ]),
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `contratos-facilita-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadCurrentView() {
  try {
    if (currentView === "overview") await loadOverview();
    if (currentView === "customers") await loadCustomers();
    if (currentView === "plans") await loadPlans();
    if (currentView === "payments") await loadPayments();
    if (currentView === "contracts") await loadContracts();
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

function openNewCustomer() {
  openDrawer(`
    <div class="drawer-content">
      <div>
        <p class="eyebrow">Cadastro manual</p>
        <h2>Novo cliente</h2>
        <p>Crie o cliente no banco com login por e-mail e senha de acesso.</p>
      </div>

      <form class="form-grid" data-create-customer-form>
        <label>Nome completo<input name="nome" required autocomplete="name" /></label>
        <label>E-mail / login<input name="email" type="email" required autocomplete="email" /></label>
        <div class="form-grid two-cols">
          <label>Senha de acesso<input name="password" type="password" minlength="8" required autocomplete="new-password" /></label>
          <label>Telefone / WhatsApp<input name="telefone" inputmode="numeric" autocomplete="tel" /></label>
        </div>
        <div class="form-grid two-cols">
          <label>CPF ou CNPJ<input name="documento" inputmode="numeric" /></label>
          <label>
            Status do cliente
            <select name="status">
              <option value="pending">Pendente</option>
              <option value="active">Ativo</option>
              <option value="blocked">Bloqueado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </label>
        </div>
        <label class="checkbox-line">
          <input name="cliente_login_ativo" type="checkbox" checked />
          Login do cliente ativo
        </label>
        <div class="action-bar">
          <button class="gold-button" type="submit">Criar cliente</button>
          <button class="ghost-button" type="button" data-close-drawer>Cancelar</button>
        </div>
      </form>
    </div>
  `);
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

function openNewPlan() {
  openDrawer(`
    <div class="drawer-content">
      <div>
        <p class="eyebrow">Plano</p>
        <h2>Novo plano</h2>
        <p>Crie o plano no banco local. Depois associe ao Mercado Pago quando o modelo de assinatura estiver pronto.</p>
      </div>
      <form class="form-grid" data-create-plan-form>
        <div class="form-grid two-cols">
          <label>ID interno<input name="id" placeholder="ex: premium" required /></label>
          <label>Nome<input name="nome" placeholder="Nome do plano" required /></label>
        </div>
        <label>Descricao<textarea name="descricao" placeholder="Resumo do que este plano inclui"></textarea></label>
        <div class="form-grid two-cols">
          <label>Valor<input name="valor" type="number" step="0.01" min="0.01" required /></label>
          <label>Ordem<input name="ordem" type="number" value="0" /></label>
        </div>
        <div class="form-grid two-cols">
          <label>Frequencia<input name="frequencia" type="number" value="1" min="1" /></label>
          <label>
            Tipo frequencia
            <select name="tipo_frequencia">
              <option value="months">months</option>
              <option value="days">days</option>
            </select>
          </label>
        </div>
        <label>Servico<input name="servico" placeholder="ex: bot_whatsapp_premium" /></label>
        <div class="form-grid two-cols">
          <label>
            Tipo cobranca
            <select name="tipo_cobranca">
              <option value="subscription">subscription</option>
              <option value="single">single</option>
            </select>
          </label>
          <label>
            Ativo
            <select name="ativo">
              <option value="1">Sim</option>
              <option value="0">Nao</option>
            </select>
          </label>
        </div>
        <div class="action-bar">
          <button class="gold-button" type="submit">Criar plano</button>
          <button class="ghost-button" type="button" data-close-drawer>Cancelar</button>
        </div>
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

async function createCustomer(form) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.cliente_login_ativo = form.elements.cliente_login_ativo?.checked || false;

  const data = await apiRequest("/api/admin/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  setStatus("Cliente criado.");
  closeDrawer();
  await loadCustomers();

  if (data.customer?.id) {
    await loadCustomerPreview(data.customer.id);
  }
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

async function createPlan(form) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.ativo = payload.ativo === "1";

  const data = await apiRequest("/api/admin/plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  selectedPlanId = data.plan?.id || payload.id;
  setStatus("Plano criado.");
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

document.querySelector("[data-refresh]")?.addEventListener("click", loadCurrentView);
document.querySelector("[data-search-customers]").addEventListener("click", loadCustomers);
document.querySelector("[data-filter-payments]")?.addEventListener("click", loadPayments);
customerStatus.addEventListener("change", loadCustomers);
customerPlan?.addEventListener("change", () => renderCustomers(customersCache));
customerSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadCustomers();
});

paymentFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentPaymentFilter = button.dataset.paymentFilter || "";
    paymentFilterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    loadPayments().catch((error) => setStatus(error.message, "error"));
  });
});

contractStatus?.addEventListener("change", () => loadContracts().catch((error) => setStatus(error.message, "error")));
contractPlan?.addEventListener("change", () => loadContracts().catch((error) => setStatus(error.message, "error")));
contractPeriod?.addEventListener("change", () => loadContracts().catch((error) => setStatus(error.message, "error")));
contractSearch?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadContracts().catch((error) => setStatus(error.message, "error"));
});
exportContractsButton?.addEventListener("click", exportContractsCsv);

viewButtons.forEach((button) => {
  button.addEventListener("click", () => activateView(button.dataset.viewButton));
});

document.addEventListener("click", (event) => {
  const customerButton = event.target.closest("[data-open-customer]");
  const previewButton = event.target.closest("[data-preview-customer]");
  const planButton = event.target.closest("[data-open-plan]");
  const selectPlanButton = event.target.closest("[data-select-plan]");
  const deleteButton = event.target.closest("[data-delete-customer]");
  const cancelButton = event.target.closest("[data-cancel-subscription]");
  const newCustomerButton = event.target.closest("[data-new-customer]");
  const newPlanButton = event.target.closest("[data-new-plan]");
  const contractBulkButton = event.target.closest("[data-contract-bulk]");
  const sendContractButton = event.target.closest("[data-send-contract]");
  const dynamicViewButton = event.target.closest("[data-view-button]");
  const collapseButton = event.target.closest("[data-collapse-detail]");
  const closeButton = event.target.closest("[data-close-drawer]");

  if (dynamicViewButton && !Array.from(viewButtons).includes(dynamicViewButton)) {
    activateView(dynamicViewButton.dataset.viewButton);
  }
  if (customerButton) openCustomer(customerButton.dataset.openCustomer);
  if (previewButton) {
    loadCustomerPreview(previewButton.dataset.previewCustomer)
      .then(() => renderCustomers(customersCache))
      .catch((error) => setStatus(error.message, "error"));
  }
  if (selectPlanButton && !planButton) {
    selectedPlanId = selectPlanButton.dataset.selectPlan;
    renderPlans(plansCache);
  }
  if (planButton) openPlan(planButton.dataset.openPlan);
  if (deleteButton) deleteCustomer(deleteButton.dataset.deleteCustomer).catch((error) => setStatus(error.message, "error"));
  if (cancelButton) cancelSubscription(cancelButton.dataset.cancelSubscription).catch((error) => setStatus(error.message, "error"));
  if (newCustomerButton) openNewCustomer();
  if (newPlanButton) openNewPlan();
  if (contractBulkButton) generateBulkContracts().catch((error) => setStatus(error.message, "error"));
  if (sendContractButton) sendContract(sendContractButton.dataset.sendContract).catch((error) => setStatus(error.message, "error"));
  if (closeButton) closeDrawer();
  if (collapseButton && customerDetail) {
    selectedCustomerId = null;
    renderCustomers(customersCache);
    customerDetail.innerHTML = `<div class="empty-detail"><strong>Detalhes fechados</strong><span>Clique no icone de abrir em um cliente para visualizar os dados.</span></div>`;
  }
});

document.addEventListener("submit", (event) => {
  const createCustomerForm = event.target.closest("[data-create-customer-form]");
  const createPlanForm = event.target.closest("[data-create-plan-form]");
  const customerForm = event.target.closest("[data-customer-form]");
  const subscriptionForm = event.target.closest("[data-subscription-form]");
  const planForm = event.target.closest("[data-plan-form]");

  if (createCustomerForm) {
    event.preventDefault();
    createCustomer(createCustomerForm).catch((error) => setStatus(error.message, "error"));
  }

  if (createPlanForm) {
    event.preventDefault();
    createPlan(createPlanForm).catch((error) => setStatus(error.message, "error"));
  }

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
