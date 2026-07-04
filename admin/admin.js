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
const reportsKpis = document.querySelector("[data-reports-kpis]");
const reportRevenueChart = document.querySelector("[data-report-revenue-chart]");
const reportStatusChart = document.querySelector("[data-report-status-chart]");
const reportCustomersChart = document.querySelector("[data-report-customers-chart]");
const reportPlans = document.querySelector("[data-report-plans]");
const reportActivities = document.querySelector("[data-report-activities]");
const reportQuick = document.querySelector("[data-report-quick]");
const settingsIntegrations = document.querySelector("[data-settings-integrations]");
const settingsOptions = document.querySelector("[data-settings-options]");
const settingsInfo = document.querySelector("[data-settings-info]");
const settingsQuick = document.querySelector("[data-settings-quick]");
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
const exportReportButton = document.querySelector("[data-export-report]");
const drawer = document.querySelector("[data-drawer]");
const drawerContent = document.querySelector("[data-drawer-content]");
const closeDrawerButtons = document.querySelectorAll("[data-close-drawer]");
const notificationsBadge = document.querySelector("[data-notifications-badge]");

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
let reportsCache = null;
let selectedCustomerId = null;
let selectedPlanId = null;
let currentPaymentFilter = "";
let notificationTimer = null;

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
    email: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="m4 8 8 5 8-5"/>',
    webhook: '<path d="M8 17a4 4 0 0 1-3.6-5.8l2.1-3.8a4 4 0 0 1 7 3.8l-.6 1"/><path d="M16 7a4 4 0 0 1 3.6 5.8l-2.1 3.8a4 4 0 0 1-7-3.8l.6-1"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    palette: '<path d="M12 4a8 8 0 0 0 0 16h1.5a1.7 1.7 0 0 0 1.2-2.9 1.7 1.7 0 0 1 1.2-2.9H18a6 6 0 0 0-6-10.2z"/><circle cx="8.5" cy="10" r=".8"/><circle cx="11" cy="8" r=".8"/><circle cx="13.5" cy="10" r=".8"/>',
    bell: '<path d="M18 16H6l1.5-2v-4.2a4.5 4.5 0 0 1 9 0V14z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
    cloud: '<path d="M17 18a4 4 0 0 0 0-8 5 5 0 0 0-9.5-1.5A4.5 4.5 0 0 0 8 18z"/><path d="M12 13v7M9 16l3-3 3 3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 0 1 4.5 1.2c0 1.8-2.3 2-2.3 3.8"/><path d="M12 17h.01"/>',
    key: '<circle cx="8" cy="15" r="3"/><path d="m10.2 12.8 7-7M15 6h3v3"/>',
  };
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.plan}</svg>`;
}

function setStatus(message = "", type = "info") {
  adminStatus.textContent = message;
  adminStatus.style.color = type === "error" ? "var(--danger)" : "var(--gold-strong)";
}

function showAdminNoticeModal({ title = "Aviso", message = "" } = {}) {
  let modal = document.querySelector("[data-admin-notice-modal]");

  if (!modal) {
    modal = document.createElement("div");
    modal.className = "admin-notice-modal";
    modal.dataset.adminNoticeModal = "";
    modal.innerHTML = `
      <div class="admin-notice-backdrop" data-close-admin-notice></div>
      <section class="admin-notice-card" role="dialog" aria-modal="true" aria-labelledby="admin-notice-title">
        <button class="admin-notice-close" type="button" data-close-admin-notice aria-label="Fechar">&times;</button>
        <span class="admin-notice-icon">${iconSvg("lock")}</span>
        <p class="eyebrow">Acesso restrito</p>
        <h3 id="admin-notice-title" data-admin-notice-title></h3>
        <p data-admin-notice-message></p>
        <button class="gold-button" type="button" data-close-admin-notice>Entendi</button>
      </section>
    `;
    document.body.appendChild(modal);
  }

  modal.querySelector("[data-admin-notice-title]").textContent = title;
  modal.querySelector("[data-admin-notice-message]").textContent = message;
  modal.hidden = false;
}

function closeAdminNoticeModal() {
  const modal = document.querySelector("[data-admin-notice-modal]");
  if (modal) modal.hidden = true;
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

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
  if (notificationTimer) {
    window.clearInterval(notificationTimer);
    notificationTimer = null;
  }
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  refreshNotifications({ silent: true }).catch(() => {});
  if (!notificationTimer) {
    notificationTimer = window.setInterval(() => {
      refreshNotifications({ silent: true }).catch(() => {});
    }, 60000);
  }
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

async function openContractTemplate() {
  setStatus("Carregando modelo de contrato...");
  const data = await apiRequest("/api/admin/contracts/template");
  const template = data.template || {
    nome: "Contrato de Prestacao de Servicos Facilita MEI",
    conteudo: "",
  };

  openDrawer(`
    <div class="drawer-content">
      <div>
        <p class="eyebrow">Contratos</p>
        <h2>Modelo de Contrato</h2>
        <p>Edite o texto base usado para gerar os contratos dos clientes.</p>
      </div>

      <form class="form-grid" data-contract-template-form>
        <label>Nome do modelo<input name="nome" value="${escapeHtml(template.nome || "")}" required /></label>
        <label>
          Conteudo do contrato
          <textarea name="conteudo" rows="16" required>${escapeHtml(template.conteudo || "")}</textarea>
        </label>
        <div class="drawer-helper">
          Variaveis disponiveis: {{cliente_nome}}, {{cliente_email}}, {{plano_nome}}, {{plano_valor}}.
        </div>
        <div class="action-bar">
          <button class="gold-button" type="submit">Salvar modelo</button>
          <button class="ghost-button" type="button" data-close-drawer>Cancelar</button>
        </div>
      </form>
    </div>
  `);
  setStatus("");
}

async function saveContractTemplate(form) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  const data = await apiRequest("/api/admin/contracts/template", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  setStatus(data.message || "Modelo salvo.");
  closeDrawer();
}

async function openContractReminders() {
  setStatus("Carregando lembretes de contrato...");
  const data = await apiRequest("/api/admin/contracts/reminders");
  const settings = data.settings || {
    ativo: 1,
    dias_primeiro_lembrete: 2,
    intervalo_dias: 3,
    max_lembretes: 3,
    canal_email: 1,
    canal_whatsapp: 1,
    mensagem_padrao: "",
  };

  openDrawer(`
    <div class="drawer-content">
      <div>
        <p class="eyebrow">Contratos</p>
        <h2>Lembretes Automaticos</h2>
        <p>Configure a regra que sera usada para lembrar clientes com contrato pendente.</p>
      </div>

      <form class="form-grid" data-contract-reminder-form>
        <label class="checkbox-line">
          <input name="ativo" type="checkbox" ${Number(settings.ativo) ? "checked" : ""} />
          Lembretes automaticos ativos
        </label>
        <div class="form-grid two-cols">
          <label>Primeiro lembrete apos dias<input name="dias_primeiro_lembrete" type="number" min="0" value="${Number(settings.dias_primeiro_lembrete || 2)}" /></label>
          <label>Intervalo entre lembretes<input name="intervalo_dias" type="number" min="1" value="${Number(settings.intervalo_dias || 3)}" /></label>
        </div>
        <label>Maximo de lembretes<input name="max_lembretes" type="number" min="1" value="${Number(settings.max_lembretes || 3)}" /></label>
        <div class="form-grid two-cols">
          <label class="checkbox-line">
            <input name="canal_email" type="checkbox" ${Number(settings.canal_email) ? "checked" : ""} />
            Enviar por e-mail
          </label>
          <label class="checkbox-line">
            <input name="canal_whatsapp" type="checkbox" ${Number(settings.canal_whatsapp) ? "checked" : ""} />
            Preparar WhatsApp
          </label>
        </div>
        <label>
          Mensagem padrao
          <textarea name="mensagem_padrao" rows="6">${escapeHtml(settings.mensagem_padrao || "")}</textarea>
        </label>
        <div class="drawer-helper">
          Por enquanto a regra fica salva no banco. O disparo automatico pode ser ligado depois com rotina agendada.
        </div>
        <div class="action-bar">
          <button class="gold-button" type="submit">Salvar lembretes</button>
          <button class="ghost-button" type="button" data-close-drawer>Cancelar</button>
        </div>
      </form>
    </div>
  `);
  setStatus("");
}

async function saveContractReminders(form) {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.ativo = Boolean(form.elements.ativo?.checked);
  payload.canal_email = Boolean(form.elements.canal_email?.checked);
  payload.canal_whatsapp = Boolean(form.elements.canal_whatsapp?.checked);

  const data = await apiRequest("/api/admin/contracts/reminders", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  setStatus(data.message || "Lembretes salvos.");
  closeDrawer();
}

async function openContractHistory() {
  setStatus("Carregando historico de contratos...");
  const data = await apiRequest("/api/admin/contracts/history");
  const events = data.events || [];

  openDrawer(`
    <div class="drawer-content">
      <div>
        <p class="eyebrow">Contratos</p>
        <h2>Historico de Envio</h2>
        <p>Ultimas acoes registradas para contratos e modelos.</p>
      </div>

      <div class="contract-history-list">
        ${
          events.length
            ? events
                .map(
                  (event) => `
                    <article class="contract-history-item">
                      <div>
                        <strong>${escapeHtml(event.acao || "acao")}</strong>
                        ${statusPill(event.status || "registrado")}
                      </div>
                      <p>${escapeHtml(event.mensagem || event.contract_title || "Evento registrado no painel.")}</p>
                      <small>
                        ${escapeHtml(event.user_name || event.email || "Sistema")}
                        ${event.destino ? ` - ${escapeHtml(event.destino)}` : ""}
                        - ${formatDate(event.created_at)}
                      </small>
                    </article>
                  `,
                )
                .join("")
            : `<article class="contract-history-item"><p>Nenhum historico registrado ainda.</p></article>`
        }
      </div>
    </div>
  `);
  setStatus("");
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

function monthLabel(period = "") {
  const [year, month] = String(period).split("-").map(Number);
  if (!year || !month) return period || "-";
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}

function lastSixMonths() {
  const now = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function normalizeMonthlyRows(rows = [], valueKey) {
  const valuesByPeriod = Object.fromEntries(rows.map((row) => [row.period, Number(row[valueKey] || 0)]));
  return lastSixMonths().map((period) => ({
    period,
    label: monthLabel(period),
    value: valuesByPeriod[period] || 0,
  }));
}

function renderLineChart(rows = []) {
  const width = 620;
  const height = 230;
  const padding = { top: 24, right: 20, bottom: 42, left: 62 };
  const max = Math.max(...rows.map((item) => item.value), 1);
  const points = rows.map((item, index) => {
    const x = padding.left + (index * (width - padding.left - padding.right)) / Math.max(rows.length - 1, 1);
    const y = padding.top + (1 - item.value / max) * (height - padding.top - padding.bottom);
    return { ...item, x, y };
  });
  const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = padding.top + ratio * (height - padding.top - padding.bottom);
    const value = max * (1 - ratio);
    return `<g><line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" /><text x="8" y="${y + 4}">${money(value)}</text></g>`;
  });

  return `
    <svg class="report-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Receita nos ultimos seis meses">
      <g class="report-grid">${grid.join("")}</g>
      <path class="report-line" d="${path}" />
      ${points
        .map(
          (point) => `
            <g class="report-point">
              <circle cx="${point.x}" cy="${point.y}" r="5" />
              <text x="${point.x}" y="${point.y - 12}">${money(point.value)}</text>
              <text class="axis-label" x="${point.x}" y="${height - 12}">${escapeHtml(point.label)}</text>
            </g>
          `,
        )
        .join("")}
    </svg>
  `;
}

function renderBarChart(rows = []) {
  const max = Math.max(...rows.map((item) => item.value), 1);
  return `
    <div class="report-bar-chart">
      ${rows
        .map(
          (item) => `
            <div class="report-bar-item">
              <span>${escapeHtml(item.value)}</span>
              <i style="height: ${Math.max(12, (item.value / max) * 150)}px"></i>
              <small>${escapeHtml(item.label)}</small>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderDonutChart(rows = []) {
  const approved = Number(rows.find((row) => row.status_group === "approved")?.total || 0);
  const pending = Number(rows.find((row) => row.status_group === "pending")?.total || 0);
  const cancelled = Number(rows.find((row) => row.status_group === "cancelled")?.total || 0);
  const total = approved + pending + cancelled;
  const approvedDeg = total ? (approved / total) * 360 : 0;
  const pendingDeg = total ? (pending / total) * 360 : 0;
  const percent = (value) => (total ? `${((value / total) * 100).toFixed(1)}%` : "0%");

  return `
    <div class="report-donut-wrap">
      <div
        class="report-donut"
        style="--approved-deg:${approvedDeg}deg; --pending-deg:${pendingDeg}deg"
      >
        <span>Total<strong>${total}</strong></span>
      </div>
      <div class="report-donut-legend">
        <p><i class="ok"></i>Aprovados <strong>${approved} (${percent(approved)})</strong></p>
        <p><i class="warn"></i>Pendentes <strong>${pending} (${percent(pending)})</strong></p>
        <p><i class="danger"></i>Cancelados <strong>${cancelled} (${percent(cancelled)})</strong></p>
      </div>
    </div>
  `;
}

function renderReports(data = {}) {
  reportsCache = data;
  const summary = data.summary || {};
  const totalPayments = Number(summary.totalPayments || 0);
  const approvedPayments = Number(summary.approvedPayments || 0);
  const approvalRate = totalPayments ? `${((approvedPayments / totalPayments) * 100).toFixed(0)}%` : "0%";

  if (reportsKpis) {
    reportsKpis.innerHTML = [
      ["money", "Receita (Este mes)", money(summary.monthlyRevenue), "Dados do mes atual"],
      ["chart", "Receita (Ano)", money(summary.annualRevenue), "Acumulado no ano"],
      ["users", "Novos Clientes", summary.newCustomers || 0, "Ultimos 30 dias"],
      ["card", "Pagamentos Aprovados", approvedPayments, "Pagamentos confirmados"],
      ["growth", "Taxa de Aprovacao", approvalRate, "Pagamentos aprovados"],
    ]
      .map(
        ([icon, label, value, detail]) => `
          <article class="report-kpi-card">
            <span>${iconSvg(icon)}</span>
            <p>${escapeHtml(label)}</p>
            <strong>${escapeHtml(value)}</strong>
            <small>${escapeHtml(detail)}</small>
          </article>
        `,
      )
      .join("");
  }

  const revenueMonths = normalizeMonthlyRows(data.revenueMonths || [], "revenue");
  const customerMonths = normalizeMonthlyRows(data.customerMonths || [], "total");
  if (reportRevenueChart) reportRevenueChart.innerHTML = renderLineChart(revenueMonths);
  if (reportCustomersChart) reportCustomersChart.innerHTML = renderBarChart(customerMonths);
  if (reportStatusChart) reportStatusChart.innerHTML = renderDonutChart(data.paymentStatus || []);

  if (reportPlans) {
    const totalRevenue = (data.planPerformance || []).reduce((sum, plan) => sum + Number(plan.monthly_revenue || 0), 0);
    reportPlans.innerHTML = `
      <table class="report-plan-table">
        <thead><tr><th>Plano</th><th>Clientes</th><th>Receita</th><th>% do total</th></tr></thead>
        <tbody>
          ${(data.planPerformance || [])
            .map((plan) => {
              const percent = totalRevenue ? (Number(plan.monthly_revenue || 0) / totalRevenue) * 100 : 0;
              return `
                <tr>
                  <td><span class="plan-icon-box">${iconSvg(getPlanIcon(plan.id))}</span><strong>${escapeHtml(plan.nome)}</strong></td>
                  <td>${Number(plan.active_clients || 0)}</td>
                  <td>${money(plan.monthly_revenue)}</td>
                  <td><span class="report-progress"><i style="width:${percent.toFixed(1)}%"></i></span>${percent.toFixed(1)}%</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  if (reportActivities) {
    reportActivities.innerHTML = (data.activities || []).length
      ? data.activities
          .map((activity) => {
            const type = String(activity.type || "");
            const status = String(activity.status || "");
            const icon = type === "payment" ? (["cancelled", "rejected"].includes(status) ? "cancel" : "money") : type === "contract" ? "contract" : "users";
            const title =
              type === "payment"
                ? `Pagamento ${["approved", "paid", "pago"].includes(status) ? "recebido" : "registrado"} de ${activity.user_name || "cliente"}`
                : type === "contract"
                  ? `Contrato ${status || "registrado"} para ${activity.user_name || "cliente"}`
                  : `Novo cliente cadastrado: ${activity.user_name || "cliente"}`;
            return `
              <article class="report-activity-row">
                <span>${iconSvg(icon)}</span>
                <p><strong>${escapeHtml(title)}</strong><small>${escapeHtml(activity.plan_name || "")}${activity.valor ? ` - ${money(activity.valor)}` : ""}</small></p>
                <time>${formatDate(activity.occurred_at)}</time>
              </article>
            `;
          })
          .join("")
      : `<p class="empty-note">Nenhuma atividade encontrada.</p>`;
  }

  if (reportQuick) {
    reportQuick.innerHTML = [
      ["plan", "Financeiro", "Receitas e pagamentos", "payments"],
      ["users", "Clientes", "Cadastros e crescimento", "customers"],
      ["card", "Planos", "Desempenho dos planos", "plans"],
      ["contract", "Contratos", "Status e assinaturas", "contracts"],
      ["download", "Exportar dados", "Download de relatorios", ""],
    ]
      .map(
        ([icon, title, detail, view]) => `
          <button class="quick-report-row" type="button" ${view ? `data-view-button="${view}"` : "data-export-report"}>
            <span>${iconSvg(icon)}</span>
            <p><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></p>
            <b>›</b>
          </button>
        `,
      )
      .join("");
  }
}

async function loadReports() {
  setStatus("Carregando relatorios...");
  const data = await apiRequest("/api/admin/reports");
  renderReports(data);
  setStatus("");
}

function exportReportsCsv() {
  if (!reportsCache) {
    setStatus("Carregue os relatorios antes de exportar.", "error");
    return;
  }

  const rows = [
    ["Tipo", "Nome", "Valor"],
    ["Resumo", "Receita mensal", Number(reportsCache.summary?.monthlyRevenue || 0).toFixed(2)],
    ["Resumo", "Receita anual", Number(reportsCache.summary?.annualRevenue || 0).toFixed(2)],
    ["Resumo", "Novos clientes", reportsCache.summary?.newCustomers || 0],
    ["Resumo", "Pagamentos aprovados", reportsCache.summary?.approvedPayments || 0],
    ...(reportsCache.planPerformance || []).map((plan) => ["Plano", plan.nome, Number(plan.monthly_revenue || 0).toFixed(2)]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-facilita-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function settingsStatusPill(isConnected) {
  return `<span class="settings-status ${isConnected ? "connected" : "warning"}">${isConnected ? "Conectado" : "Configurar"}</span>`;
}

function renderSettings(data = {}) {
  const integrations = data.integrations || {};
  const system = data.system || {};
  const counts = system.counts || {};
  const services = system.services || {};
  const storage = system.storage || {};
  const storagePercent = Math.max(0, Math.min(100, Number(storage.percent || 0)));
  const usedMb = Number(storage.usedMb || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const quotaMb = Number(storage.quotaMb || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const environmentLabel = system.environment === "production" ? "Producao" : system.environment || "development";

  if (settingsIntegrations) {
    settingsIntegrations.innerHTML = [
      ["webhook", "Mercado Pago", "Gerencie suas credenciais e configuracoes do Mercado Pago.", integrations.mercadoPago],
      ["whatsapp", "WhatsApp", "Configure a integracao para envio de mensagens via WhatsApp.", integrations.whatsapp],
      ["email", "E-mail (SMTP)", "Configure o servidor SMTP para envio de e-mails do sistema.", integrations.email],
      ["webhook", "Webhooks", "Configure webhooks para receber eventos de integracoes.", integrations.webhooks],
    ]
      .map(
        ([icon, title, detail, connected]) => `
          <button class="settings-row" type="button" data-settings-action="${escapeHtml(title)}">
            <span class="settings-row-icon">${iconSvg(icon)}</span>
            <p><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></p>
            ${settingsStatusPill(Boolean(connected))}
            <b>›</b>
          </button>
        `,
      )
      .join("");
  }

  if (settingsOptions) {
    settingsOptions.innerHTML = [
      ["plan", "Dados da Empresa", "Gerencie os dados cadastrais da sua empresa, logo e informacoes de contato."],
      ["users", "Usuarios e Permissoes", "Gerencie os usuarios do sistema e suas permissoes de acesso."],
      ["lock", "Seguranca", "Configure politicas de seguranca, autenticacao em duas etapas e sessoes."],
      ["palette", "Personalizacao", "Personalize o sistema com sua identidade visual, cores e preferencias."],
      ["bell", "Notificacoes", "Configure notificacoes do sistema, alertas e preferencias de comunicacao."],
      ["cloud", "Backup e Dados", "Gerencie backups, exportacao de dados e recuperacao do sistema."],
      ["contract", "Logs do Sistema", "Visualize logs de atividades, auditorias e eventos do sistema."],
    ]
      .map(
        ([icon, title, detail]) => `
          <button class="settings-option-row" type="button" data-settings-action="${escapeHtml(title)}">
            <span>${iconSvg(icon)}</span>
            <p><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></p>
            <b>›</b>
          </button>
        `,
      )
      .join("");
  }

  if (settingsInfo) {
    settingsInfo.innerHTML = `
      <p><span>${iconSvg("settings")}Versao do Sistema:</span><strong>${escapeHtml(system.version || "0.1.0")}</strong></p>
      <p><span>${iconSvg("cube")}Ambiente:</span><strong>${escapeHtml(environmentLabel)}</strong></p>
      <p><span>${iconSvg("card")}Banco de Dados:</span><strong>${escapeHtml(system.database || "Verificando")} - ${escapeHtml(system.databaseName || "DB")}</strong></p>
      <p><span>${iconSvg("growth")}Status dos Servicos:</span>${statusPill(services.database && services.mercadoPago ? "Ativo" : "Pendente")}</p>
      <p><span>${iconSvg("users")}Clientes:</span><strong>${Number(counts.users || 0)} cadastrados</strong></p>
      <p><span>${iconSvg("plan")}Planos:</span><strong>${Number(counts.plans || 0)} planos no banco</strong></p>
      <p><span>${iconSvg("contract")}Contratos:</span><strong>${Number(counts.contracts || 0)} contratos no banco</strong></p>
      <p><span>${iconSvg("settings")}Tabelas:</span><strong>${Number(system.tablesCount || 0)} tabelas verificadas</strong></p>
      <p class="storage-line"><span>${iconSvg("cloud")}Armazenamento Utilizado:</span><strong>${usedMb} MB / ${quotaMb} MB (${storagePercent}%)</strong></p>
      <div class="storage-bar"><i style="width:${storagePercent}%"></i></div>
    `;
  }

  if (settingsQuick) {
    settingsQuick.innerHTML = [
      ["download", "Exportar Dados", "Baixar dados do banco", "export-data"],
      ["cloud", "Fazer Backup", "Backup logico do banco", "backup"],
      ["renew", "Limpar Cache", "Recarregar dados do banco", "clear-cache"],
      ["key", "Alterar Senha", "Senha via Railway env", "password"],
      ["help", "Central de Ajuda", "Resumo tecnico do sistema", "help"],
    ]
      .map(
        ([icon, title, detail, action]) => `
          <button type="button" data-settings-quick="${escapeHtml(action)}">
            <span>${iconSvg(icon)}</span>
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(detail)}</small>
          </button>
        `,
      )
      .join("");
  }
}

async function loadSettings() {
  setStatus("Carregando configuracoes...");
  const data = await apiRequest("/api/admin/settings");
  renderSettings(data);
  setStatus("");
}

async function exportSettingsData() {
  setStatus("Exportando dados reais do banco...");
  const data = await apiRequest("/api/admin/settings/export-data");
  downloadJson(`facilita-dados-${new Date().toISOString().slice(0, 10)}.json`, data);
  setStatus("Exportacao gerada.");
}

async function createSettingsBackup() {
  setStatus("Preparando backup logico...");
  const backup = await apiRequest("/api/admin/settings/backup", { method: "POST" });
  const data = await apiRequest("/api/admin/settings/export-data");
  downloadJson(backup.filename || `backup-facilita-${new Date().toISOString().slice(0, 10)}.json`, {
    backup,
    data,
  });
  setStatus(backup.message || "Backup preparado.");
}

async function clearSettingsCache() {
  const data = await apiRequest("/api/admin/settings/clear-cache", { method: "POST" });
  setStatus(data.message || "Cache limpo.");
  await loadSettings();
}

function openPasswordInfo() {
  openDrawer(`
    <div class="drawer-content">
      <div>
        <p class="eyebrow">Seguranca</p>
        <h2>Alterar senha administrativa</h2>
        <p>A senha do admin nao fica salva no frontend nem solta no banco. Ela deve ser alterada nas variaveis do Railway.</p>
      </div>
      <article class="panel">
        <h3>Variaveis usadas</h3>
        <div class="detail-grid">
          <p><span>Login</span><strong>ADMIN_EMAIL</strong></p>
          <p><span>Senha</span><strong>ADMIN_PASSWORD</strong></p>
          <p><span>Chave interna</span><strong>ADMIN_API_KEY</strong></p>
        </div>
      </article>
      <div class="drawer-helper">
        Apos alterar a senha no Railway, faca redeploy do backend para a nova variavel entrar em uso.
      </div>
    </div>
  `);
}

function openSettingsHelp() {
  openDrawer(`
    <div class="drawer-content">
      <div>
        <p class="eyebrow">Central de Ajuda</p>
        <h2>Resumo tecnico do painel</h2>
        <p>Esta pagina usa dados reais do banco conectado ao backend administrativo.</p>
      </div>
      <article class="panel">
        <h3>O que esta ligado ao banco</h3>
        <div class="history-list">
          <div class="history-item"><strong>Clientes</strong><small>Usuarios cadastrados, assinaturas, pagamentos e contratos.</small></div>
          <div class="history-item"><strong>Exportacao</strong><small>Baixa um JSON com os dados principais, sem senhas.</small></div>
          <div class="history-item"><strong>Backup logico</strong><small>Gera um pacote JSON com resumo e dados atuais do banco.</small></div>
          <div class="history-item"><strong>Integracoes</strong><small>Mostra status com base nas variaveis configuradas no Railway.</small></div>
        </div>
      </article>
    </div>
  `);
}

async function handleSettingsQuick(action) {
  if (action === "export-data") return exportSettingsData();
  if (action === "backup") return createSettingsBackup();
  if (action === "clear-cache") return clearSettingsCache();
  if (action === "password") return openPasswordInfo();
  if (action === "help") return openSettingsHelp();
  return setStatus("Acao de configuracao nao encontrada.", "error");
}

async function loadCurrentView() {
  try {
    if (currentView === "overview") await loadOverview();
    if (currentView === "customers") await loadCustomers();
    if (currentView === "plans") await loadPlans();
    if (currentView === "payments") await loadPayments();
    if (currentView === "contracts") await loadContracts();
    if (currentView === "reports") await loadReports();
    if (currentView === "settings") await loadSettings();
    refreshNotifications({ silent: true }).catch(() => {});
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

function renderNotificationBadge(count = 0) {
  if (!notificationsBadge) return;
  const total = Number(count || 0);
  notificationsBadge.hidden = total <= 0;
  notificationsBadge.textContent = total > 99 ? "99+" : String(total);
}

function notificationIcon(type) {
  const icons = {
    cliente: "users",
    pagamento: "card",
    contrato: "contract",
    sistema: "bell",
  };
  return iconSvg(icons[type] || "bell");
}

async function refreshNotifications({ silent = false } = {}) {
  if (!silent) setStatus("Carregando notificacoes...");
  const data = await apiRequest("/api/admin/notifications");
  renderNotificationBadge(data.count || 0);
  if (!silent) setStatus("");
  return data;
}

async function openNotifications() {
  const data = await refreshNotifications();
  const items = data.items || [];

  openDrawer(`
    <div class="drawer-content">
      <div>
        <p class="eyebrow">Central de notificacoes</p>
        <h2>Notificacoes do sistema</h2>
        <p>Eventos recentes e pendencias detectadas diretamente no banco de dados.</p>
      </div>

      <div class="notification-list">
        ${
          items.length
            ? items
                .map(
                  (item) => `
                    <article class="notification-item ${escapeHtml(item.severity || "info")}">
                      <span>${notificationIcon(item.type)}</span>
                      <div>
                        <strong>${escapeHtml(item.title || "Notificacao")}</strong>
                        <p>${escapeHtml(item.detail || "Evento registrado no sistema.")}</p>
                        <small>${formatDate(item.created_at)}</small>
                      </div>
                    </article>
                  `,
                )
                .join("")
            : `<article class="notification-item info"><span>${iconSvg("bell")}</span><div><strong>Nenhuma notificacao no momento</strong><p>Quando surgir algo novo no sistema, o sino sera atualizado.</p></div></article>`
        }
      </div>
    </div>
  `);
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
exportReportButton?.addEventListener("click", exportReportsCsv);

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
  const contractTemplateButton = event.target.closest("[data-contract-template]");
  const contractRemindersButton = event.target.closest("[data-contract-reminders]");
  const contractHistoryButton = event.target.closest("[data-contract-history]");
  const sendContractButton = event.target.closest("[data-send-contract]");
  const dynamicExportReportButton = event.target.closest("[data-export-report]");
  const settingsActionButton = event.target.closest("[data-settings-action]");
  const settingsQuickButton = event.target.closest("[data-settings-quick]");
  const notificationsButton = event.target.closest("[data-notifications-button]");
  const dynamicViewButton = event.target.closest("[data-view-button]");
  const collapseButton = event.target.closest("[data-collapse-detail]");
  const closeAdminNoticeButton = event.target.closest("[data-close-admin-notice]");
  const closeButton = event.target.closest("[data-close-drawer]");

  if (closeAdminNoticeButton) closeAdminNoticeModal();
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
  if (contractTemplateButton) openContractTemplate().catch((error) => setStatus(error.message, "error"));
  if (contractRemindersButton) openContractReminders().catch((error) => setStatus(error.message, "error"));
  if (contractHistoryButton) openContractHistory().catch((error) => setStatus(error.message, "error"));
  if (sendContractButton) sendContract(sendContractButton.dataset.sendContract).catch((error) => setStatus(error.message, "error"));
  if (dynamicExportReportButton && dynamicExportReportButton !== exportReportButton) exportReportsCsv();
  if (settingsQuickButton) handleSettingsQuick(settingsQuickButton.dataset.settingsQuick).catch((error) => setStatus(error.message, "error"));
  if (notificationsButton) openNotifications().catch((error) => setStatus(error.message, "error"));
  if (settingsActionButton) {
    if (settingsActionButton.dataset.settingsAction === "Mercado Pago") {
      showAdminNoticeModal({
        title: "Mercado Pago",
        message: "Consulte o setor de TI.",
      });
      setStatus("Mercado Pago: consulte o setor de TI.");
    } else {
      setStatus(`${settingsActionButton.dataset.settingsAction}: configuracao detalhada sera conectada na proxima etapa.`);
    }
  }
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
  const contractTemplateForm = event.target.closest("[data-contract-template-form]");
  const contractReminderForm = event.target.closest("[data-contract-reminder-form]");

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

  if (contractTemplateForm) {
    event.preventDefault();
    saveContractTemplate(contractTemplateForm).catch((error) => setStatus(error.message, "error"));
  }

  if (contractReminderForm) {
    event.preventDefault();
    saveContractReminders(contractReminderForm).catch((error) => setStatus(error.message, "error"));
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
