const accessView = document.querySelector("[data-access-view]");
const dashboardView = document.querySelector("[data-dashboard-view]");
const loginForm = document.querySelector("[data-login-form]");
const setupForm = document.querySelector("[data-setup-form]");
const statusBox = document.querySelector("[data-client-status]");
const tabButtons = document.querySelectorAll("[data-access-tab]");
const routeButtons = document.querySelectorAll("[data-client-route]");
const clientPages = document.querySelectorAll("[data-client-page]");
const pageLinks = document.querySelectorAll("[data-go-page]");
const settingsTabButtons = document.querySelectorAll("[data-settings-tab]");
const settingsPanels = document.querySelectorAll("[data-settings-panel]");
const settingsModalButtons = document.querySelectorAll("[data-open-settings-modal]");
const settingsModals = document.querySelectorAll("[data-settings-modal]");
const closeSettingsModalButtons = document.querySelectorAll("[data-close-settings-modal]");
const addressForm = document.querySelector("[data-address-form]");
const bankForm = document.querySelector("[data-bank-form]");
const clientName = document.querySelector("[data-client-name]");
const clientFirstName = document.querySelector("[data-client-first-name]");
const clientInitials = document.querySelector("[data-client-initials]");
const sidebarPlan = document.querySelector("[data-sidebar-plan]");
const notificationBadge = document.querySelector("[data-notification-badge]");
const companyCnpj = document.querySelector("[data-company-cnpj]");
const companyStatus = document.querySelector("[data-company-status]");
const companyCnpjCopy = document.querySelector("[data-company-cnpj-copy]");
const companyStatusCopy = document.querySelector("[data-company-status-copy]");
const companyCnpjSupport = document.querySelector("[data-company-cnpj-support]");
const companyStatusSupport = document.querySelector("[data-company-status-support]");
const companyCnpjSettings = document.querySelector("[data-company-cnpj-settings]");
const companyStatusSettings = document.querySelector("[data-company-status-settings]");
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
const settingsFields = {
  companyName: document.querySelector("[data-settings-company-name]"),
  tradeName: document.querySelector("[data-settings-trade-name]"),
  cnpj: document.querySelector("[data-settings-cnpj]"),
  openDate: document.querySelector("[data-settings-open-date]"),
  companyStatus: document.querySelector("[data-settings-company-status]"),
  capital: document.querySelector("[data-settings-capital]"),
  mainActivity: document.querySelector("[data-settings-main-activity]"),
  secondaryActivity: document.querySelector("[data-settings-secondary-activity]"),
  address: document.querySelector("[data-settings-address]"),
  phone: document.querySelector("[data-settings-phone]"),
  email: document.querySelector("[data-settings-email]"),
  cep: document.querySelector("[data-settings-cep]"),
  street: document.querySelector("[data-settings-street]"),
  number: document.querySelector("[data-settings-number]"),
  complement: document.querySelector("[data-settings-complement]"),
  district: document.querySelector("[data-settings-district]"),
  city: document.querySelector("[data-settings-city]"),
  bank: document.querySelector("[data-settings-bank]"),
  agency: document.querySelector("[data-settings-agency]"),
  account: document.querySelector("[data-settings-account]"),
  accountType: document.querySelector("[data-settings-account-type]"),
  municipalRegistration: document.querySelector("[data-settings-municipal-registration]"),
  stateRegistration: document.querySelector("[data-settings-state-registration]"),
  license: document.querySelector("[data-settings-license]"),
  ccmeiDate: document.querySelector("[data-settings-ccmei-date]"),
  certificate: document.querySelector("[data-settings-certificate]"),
  accountName: document.querySelector("[data-settings-account-name]"),
  accountEmail: document.querySelector("[data-settings-account-email]"),
  accountPhone: document.querySelector("[data-settings-account-phone]"),
  accountWhatsapp: document.querySelector("[data-settings-account-whatsapp]"),
  accountDocument: document.querySelector("[data-settings-account-document]"),
  accountStatus: document.querySelector("[data-settings-account-status]"),
  accountCreated: document.querySelector("[data-settings-account-created]"),
  accountPlan: document.querySelector("[data-settings-account-plan]"),
  subscriptionStatus: document.querySelector("[data-settings-subscription-status]"),
  subscriptionValue: document.querySelector("[data-settings-subscription-value]"),
  paymentMethod: document.querySelector("[data-settings-payment-method]"),
  nextCharge: document.querySelector("[data-settings-next-charge]"),
};

const configuredApiBase = String(window.FACILITA_API_BASE || "").replace(/\/$/, "");
const isLocalFile = window.location.protocol === "file:";
const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const productionApiBase = "https://facilitamei-production.up.railway.app";
const isFacilitaDomain = /(^|\.)facilitameibr\.com\.br$/i.test(window.location.hostname);
const API_BASE =
  configuredApiBase ||
  (isLocalFile || isLocalHost ? "http://localhost:3000" : isFacilitaDomain ? productionApiBase : "");
const SESSION_KEY = "facilita_client_session";
let currentDashboardData = null;

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

function formatDocument(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 14) return formatCnpj(digits);
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return value || "Não cadastrado";
}

function setText(element, value, fallback = "Não cadastrado") {
  if (!element) return;
  element.textContent = value || fallback;
}

function setFormValue(form, name, value = "") {
  const field = form?.elements?.[name];
  if (field) field.value = value || "";
}

function fillAddressForm() {
  const client = currentDashboardData?.client || {};
  setFormValue(addressForm, "cep", client.cep);
  setFormValue(addressForm, "logradouro", client.logradouro);
  setFormValue(addressForm, "numero", client.numero);
  setFormValue(addressForm, "complemento", client.complemento);
  setFormValue(addressForm, "bairro", client.bairro);
  setFormValue(addressForm, "municipio", client.municipio || client.cidade);
  setFormValue(addressForm, "uf", client.uf);
}

function fillBankForm() {
  const client = currentDashboardData?.client || {};
  setFormValue(bankForm, "banco", client.banco);
  setFormValue(bankForm, "agencia", client.agencia);
  setFormValue(bankForm, "conta", client.conta);
  setFormValue(bankForm, "tipo_conta", client.tipo_conta);
}

function openSettingsModal(type) {
  if (type === "address") fillAddressForm();
  if (type === "bank") fillBankForm();
  settingsModals.forEach((modal) => {
    modal.hidden = modal.dataset.settingsModal !== type;
  });
}

function closeSettingsModals() {
  settingsModals.forEach((modal) => {
    modal.hidden = true;
  });
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
  if (!paymentsTable || !paymentsCount) return;
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
  if (!container) return;
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

function findDocumentByTerms(documents = [], terms = []) {
  return documents.find((document) => {
    const text = `${document.titulo || ""} ${document.tipo || ""} ${document.observacao || ""}`.toLowerCase();
    return terms.some((term) => text.includes(term));
  });
}

function renderSettings(data) {
  const client = data.client || {};
  const subscription = data.activeSubscription || {};
  const summary = data.summary || {};
  const documents = data.documents || [];
  const companyStatusText = summary.company?.regular ? "Ativa" : statusLabel(client.status);
  const companyDocument = summary.company?.cnpj || client.cnpj || client.documento;
  const ccmeiDocument = findDocumentByTerms(documents, ["ccmei", "contrato social", "cartao cnpj", "cartão cnpj"]);
  const certificateDocument = findDocumentByTerms(documents, ["certificado"]);
  const stateRegistrationDocument = findDocumentByTerms(documents, ["inscricao estadual", "inscrição estadual"]);
  const licenseDocument = findDocumentByTerms(documents, ["alvara", "alvará"]);
  const addressParts = [client.logradouro, client.numero, client.bairro, client.municipio || client.cidade, client.uf].filter(Boolean);

  setText(settingsFields.companyName, client.razao_social || client.nome);
  setText(settingsFields.tradeName, client.nome_fantasia);
  setText(settingsFields.cnpj, formatDocument(companyDocument));
  setText(settingsFields.openDate, formatDate(client.data_abertura || client.created_at));
  setText(settingsFields.companyStatus, companyStatusText);
  settingsFields.companyStatus?.classList.toggle("is-active", ["Ativa", "Ativo", "Regular"].includes(companyStatusText));
  setText(settingsFields.capital, client.capital_social ? money(client.capital_social) : "");
  setText(settingsFields.mainActivity, client.cnae_principal_descricao || client.cnae_principal_codigo);
  setText(settingsFields.secondaryActivity, client.cnae_secundario_descricao || client.cnae_secundario_codigo);
  setText(settingsFields.address, addressParts.join(", "));
  setText(settingsFields.phone, client.telefone || client.whatsapp);
  setText(settingsFields.email, client.email);
  setText(settingsFields.cep, client.cep);
  setText(settingsFields.street, client.logradouro);
  setText(settingsFields.number, client.numero);
  setText(settingsFields.complement, client.complemento);
  setText(settingsFields.district, client.bairro);
  setText(settingsFields.city, [client.municipio || client.cidade, client.uf].filter(Boolean).join(" / "));
  setText(settingsFields.bank, client.banco);
  setText(settingsFields.agency, client.agencia);
  setText(settingsFields.account, client.conta);
  setText(settingsFields.accountType, client.tipo_conta);
  setText(settingsFields.municipalRegistration, client.inscricao_municipal);
  setText(settingsFields.stateRegistration, client.inscricao_estadual || statusLabel(stateRegistrationDocument?.status));
  setText(settingsFields.license, client.alvara_status || statusLabel(licenseDocument?.status));
  setText(settingsFields.ccmeiDate, ccmeiDocument ? formatDate(ccmeiDocument.data_emissao || ccmeiDocument.created_at) : "");
  setText(settingsFields.certificate, certificateDocument ? `${statusLabel(certificateDocument.status)}${certificateDocument.data_emissao ? ` desde ${formatDate(certificateDocument.data_emissao)}` : ""}` : "");
  setText(settingsFields.accountName, client.nome);
  setText(settingsFields.accountEmail, client.email);
  setText(settingsFields.accountPhone, client.telefone);
  setText(settingsFields.accountWhatsapp, client.whatsapp || client.telefone);
  setText(settingsFields.accountDocument, formatDocument(client.documento || client.cnpj));
  setText(settingsFields.accountStatus, statusLabel(client.status));
  setText(settingsFields.accountCreated, formatDate(client.created_at));
  setText(settingsFields.accountPlan, subscription.plan_name);
  setText(settingsFields.subscriptionStatus, statusLabel(subscription.status));
  setText(settingsFields.subscriptionValue, subscription.valor ? money(subscription.valor) : "");
  setText(settingsFields.paymentMethod, subscription.metodo_pagamento);
  setText(settingsFields.nextCharge, subscription.data_proxima_cobranca ? formatDate(subscription.data_proxima_cobranca) : "");
}

function renderDashboard(data) {
  currentDashboardData = data;
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
  if (companyCnpjSupport) companyCnpjSupport.textContent = companyCnpj.textContent;
  if (companyStatusSupport) {
    companyStatusSupport.textContent = companyStatus.textContent;
    companyStatusSupport.classList.toggle("is-regular", Boolean(summary.company?.regular));
  }
  if (companyCnpjSettings) companyCnpjSettings.textContent = companyCnpj.textContent;
  if (companyStatusSettings) {
    companyStatusSettings.textContent = companyStatus.textContent;
    companyStatusSettings.classList.toggle("is-regular", Boolean(summary.company?.regular));
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
  renderSettings(data);
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
    suporte: "suporte",
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

settingsTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.settingsTab || "empresa";
    settingsTabButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    settingsPanels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.settingsPanel === tab));
  });
});

settingsModalButtons.forEach((button) => {
  button.addEventListener("click", () => {
    openSettingsModal(button.dataset.openSettingsModal);
  });
});

closeSettingsModalButtons.forEach((button) => {
  button.addEventListener("click", closeSettingsModals);
});

addressForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = addressForm.querySelector("[type='submit']");
  submitButton.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(addressForm).entries());
    await apiRequest("/api/client/settings/address", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    closeSettingsModals();
    await loadDashboard();
    showClientPage("configuracoes", false);
  } catch (error) {
    alert(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

bankForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = bankForm.querySelector("[type='submit']");
  submitButton.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(bankForm).entries());
    await apiRequest("/api/client/settings/bank", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    closeSettingsModals();
    await loadDashboard();
    showClientPage("configuracoes", false);
  } catch (error) {
    alert(error.message);
  } finally {
    submitButton.disabled = false;
  }
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
