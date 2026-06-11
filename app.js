const header = document.querySelector("[data-header]");
const menu = document.querySelector("[data-menu]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const checkoutForm = document.querySelector("[data-checkout-form]");
const checkoutSelect = document.querySelector("[data-checkout-select]");
const checkoutStatus = document.querySelector("[data-checkout-status]");
const checkoutPlan = document.querySelector("[data-checkout-plan]");
const checkoutPrice = document.querySelector("[data-checkout-price]");
const checkoutModal = document.querySelector("[data-checkout-modal]");
const checkoutCloseButtons = document.querySelectorAll("[data-checkout-close]");
const aboutModal = document.querySelector("[data-about-modal]");
const aboutOpenButton = document.querySelector("[data-about-open]");
const aboutCloseButtons = document.querySelectorAll("[data-about-close]");
const aboutScroll = document.querySelector("[data-about-scroll]");
const leadModal = document.querySelector("[data-lead-modal]");
const leadOpenButtons = document.querySelectorAll("[data-lead-open]");
const leadCloseButtons = document.querySelectorAll("[data-lead-close]");
const leadForm = document.querySelector("[data-lead-form]");
const leadKicker = document.querySelector("[data-lead-kicker]");
const leadTitle = document.querySelector("[data-lead-title]");
const leadDescription = document.querySelector("[data-lead-description]");
const leadInterest = document.querySelector("[data-lead-interest]");
const leadStatus = document.querySelector("[data-lead-status]");
const leadDialog = document.querySelector("[data-lead-dialog]");
const leadStandard = document.querySelector("[data-lead-standard]");
const meiWizard = document.querySelector("[data-mei-wizard]");
const meiCopy = document.querySelector("[data-mei-copy]");
const meiField = document.querySelector("[data-mei-field]");
const meiProgress = document.querySelector("[data-mei-progress]");
const meiCounter = document.querySelector("[data-mei-counter]");
const meiPrev = document.querySelector("[data-mei-prev]");
const meiNext = document.querySelector("[data-mei-next]");
const meiStatus = document.querySelector("[data-mei-status]");
const paymentSubmit = document.querySelector("[data-payment-submit]");
const paymentResult = document.querySelector("[data-payment-result]");
const resultKicker = document.querySelector("[data-result-kicker]");
const resultPlan = document.querySelector("[data-result-plan]");
const resultStatus = document.querySelector("[data-result-status]");
const subscriptionMessage = document.querySelector("[data-subscription-message]");
const backToPaymentButton = document.querySelector("[data-back-to-payment]");
const whatsappAttendance = document.querySelector("[data-whatsapp-attendance]");
const planButtons = document.querySelectorAll("[data-plan-id]");
const planCards = document.querySelectorAll(".plan-card");
const plansSection = document.querySelector(".plans");
const heroParticlesCanvas = document.querySelector("[data-hero-particles]");

const isLocalFile = window.location.protocol === "file:";
const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const configuredApiBase = String(window.FACILITA_API_BASE || "").replace(/\/$/, "");
const API_BASE = configuredApiBase || (isLocalFile || (isLocalHost && window.location.port !== "3000") ? "http://localhost:3000" : "");

async function parseJsonResponse(response, fallbackMessage) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(fallbackMessage || "A API retornou uma resposta invalida. Confira a URL do backend no config.js.");
  }
}

let planDetails = {
  "start-mei": {
    title: "Start MEI",
    price: "R$ 89,99 /mes",
    amount: 89.99,
    billing: "subscription",
  },
  "servicos": {
    title: "Facilita MEI Servicos",
    price: "R$ 99,99 /mes",
    amount: 99.99,
    billing: "subscription",
  },
  "premium": {
    title: "Facilita Premium",
    price: "R$ 149,99 /mes",
    amount: 149.99,
    billing: "subscription",
  },
  "comercio": {
    title: "Facilita MEI Comercio",
    price: "R$ 110,00 /mes",
    amount: 110,
    billing: "subscription",
  },
  "full": {
    title: "Facilita MEI Full",
    price: "R$ 199,99 /mes",
    amount: 199.99,
    billing: "subscription",
  },
};

let statusPollingId;
let mercadoPagoInstance;
let mercadoPagoCardForm;
let aboutRevealObserver;
let heroParticlesCleanup;

function syncHeader() {
  header.classList.toggle("is-scrolled", window.scrollY > 24);
}

const hero = document.querySelector(".hero");
const heroBg = document.querySelector(".hero-bg");
const heroPerson = document.querySelector(".hero-person");
const heroContent = document.querySelector(".hero-content");

function updateHeroParallax() {
  if (!hero || !heroBg || !heroPerson || !heroContent) return;

  const scrollY = window.scrollY;
  const heroBottom = hero.getBoundingClientRect().bottom;
  const progress = Math.max(0, Math.min(1, 1 - heroBottom / window.innerHeight));
  const offset = Math.min(scrollY * 0.2, 120);

  heroBg.style.transform = `translate3d(0, ${offset * 0.35}px, 0)`;
  heroPerson.style.transform = `translate3d(0, ${offset * 0.6}px, 0) scale(${1 + progress * 0.008})`;
  heroContent.style.transform = `translate3d(0, ${offset * 0.2}px, 0)`;
}

function updatePlansParallax() {
  if (!plansSection) return;

  const rect = plansSection.getBoundingClientRect();
  const viewportCenter = window.innerHeight / 2;
  const sectionCenter = rect.top + rect.height / 2;
  const distance = sectionCenter - viewportCenter;
  const offset = Math.max(-44, Math.min(44, distance * -0.05));
  const progress = Math.max(0, Math.min(1, 1 - Math.abs(distance) / (window.innerHeight + rect.height)));

  plansSection.style.setProperty("--plans-parallax", `${offset}px`);
  plansSection.style.setProperty("--plans-glow-x", `${42 + progress * 16}%`);
}

function initHeroParticles() {
  if (!heroParticlesCanvas || !window.THREE || prefersReducedMotion) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 1, 1000);
  camera.position.z = 180;

  const renderer = new THREE.WebGLRenderer({
    canvas: heroParticlesCanvas,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));

  const gold = new THREE.Color("#ffd978");
  const amber = new THREE.Color("#b86d18");
  const galaxyLayers = [
    {
      count: window.innerWidth < 720 ? 240 : 520,
      radiusX: 620,
      radiusY: 260,
      depth: 360,
      size: 0.82,
      opacity: 0.38,
      speed: 0.00028,
      drift: 0.00012,
      x: 96,
    },
    {
      count: window.innerWidth < 720 ? 220 : 470,
      radiusX: 500,
      radiusY: 220,
      depth: 260,
      size: 1.18,
      opacity: 0.58,
      speed: 0.00062,
      drift: 0.00022,
      x: 78,
    },
    {
      count: window.innerWidth < 720 ? 90 : 210,
      radiusX: 380,
      radiusY: 170,
      depth: 170,
      size: 1.78,
      opacity: 0.78,
      speed: 0.00108,
      drift: 0.00038,
      x: 46,
    },
  ];

  const particleGroups = galaxyLayers.map((layer) => {
    const positions = new Float32Array(layer.count * 3);
    const colors = new Float32Array(layer.count * 3);
    const baseY = new Float32Array(layer.count);
    const phases = new Float32Array(layer.count);
    const amplitudes = new Float32Array(layer.count);

    for (let index = 0; index < layer.count; index += 1) {
      const i = index * 3;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 0.55);
      const verticalNoise = (Math.random() - 0.5) * 34;

      positions[i] = Math.cos(angle) * layer.radiusX * radius;
      positions[i + 1] = Math.sin(angle) * layer.radiusY * radius + verticalNoise;
      positions[i + 2] = (Math.random() - 0.5) * layer.depth;
      baseY[index] = positions[i + 1];
      phases[index] = Math.random() * Math.PI * 2;
      amplitudes[index] = 1.5 + Math.random() * (4 + layer.size * 3);

      const color = gold.clone().lerp(amber, Math.random() * 0.68);
      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: layer.size,
      transparent: true,
      opacity: layer.opacity,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    points.position.x = layer.x;
    scene.add(points);

    return {
      ...layer,
      amplitudes,
      baseY,
      geometry,
      material,
      phases,
      points,
      positions,
    };
  });

  function resizeParticles() {
    const rect = heroParticlesCanvas.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(rect.height, 1);
    camera.updateProjectionMatrix();
  }

  let frameId;
  function animateParticles() {
    const elapsed = Date.now() * 0.001;

    particleGroups.forEach((group, groupIndex) => {
      group.points.rotation.y += group.speed;
      group.points.rotation.x = Math.sin(elapsed * (0.12 + groupIndex * 0.04)) * (0.035 + groupIndex * 0.018);
      group.points.rotation.z = Math.sin(elapsed * (0.08 + groupIndex * 0.03)) * (0.018 + groupIndex * 0.01);
      group.material.opacity = group.opacity + Math.sin(elapsed * (0.75 + groupIndex * 0.22)) * 0.08;

      const positionAttribute = group.geometry.attributes.position;
      for (let index = 0; index < group.count; index += 1) {
        const yIndex = index * 3 + 1;
        const waveSpeed = 0.25 + groupIndex * 0.18 + group.drift * 900;
        positionAttribute.array[yIndex] =
          group.baseY[index] + Math.sin(elapsed * waveSpeed + group.phases[index]) * group.amplitudes[index];
      }
      positionAttribute.needsUpdate = true;
    });

    renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(animateParticles);
  }

  resizeParticles();
  animateParticles();
  window.addEventListener("resize", resizeParticles);

  heroParticlesCleanup = () => {
    window.cancelAnimationFrame(frameId);
    window.removeEventListener("resize", resizeParticles);
    particleGroups.forEach((group) => {
      group.geometry.dispose();
      group.material.dispose();
    });
    renderer.dispose();
  };
}

function initHeroGsap() {
  if (!window.gsap || prefersReducedMotion) return;

  gsap.from(".site-header", {
    y: -26,
    opacity: 0,
    duration: 0.7,
    ease: "power3.out",
  });

  gsap.from(".hero-content .eyebrow, .hero-content h1, .hero-copy", {
    y: 34,
    opacity: 0,
    duration: 0.82,
    stagger: 0.11,
    ease: "power3.out",
    delay: 0.12,
  });

  gsap.from(".hero-path-heading, .hero-path-card, .trust-row span", {
    y: 18,
    opacity: 0,
    duration: 0.58,
    stagger: 0.08,
    ease: "power3.out",
    delay: 0.48,
    clearProps: "opacity,transform",
  });

  gsap.from(".hero-showcase", {
    x: 38,
    opacity: 0,
    duration: 0.9,
    ease: "power3.out",
    delay: 0.42,
  });

  gsap.from(".lock-hero", {
    x: 56,
    y: 26,
    rotation: 3,
    opacity: 0,
    duration: 1.05,
    ease: "power3.out",
    delay: 0.32,
  });

  gsap.to(".lock-hero", {
    y: "-=12",
    duration: 3.4,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
  });

  document.querySelectorAll(".hero-actions .button, .hero-path-card").forEach((button) => {
    button.addEventListener("mouseenter", () => {
      gsap.to(button, { scale: 1.04, duration: 0.18, ease: "power2.out" });
    });
    button.addEventListener("mouseleave", () => {
      gsap.to(button, { scale: 1, duration: 0.18, ease: "power2.out" });
    });
  });
}

window.addEventListener(
  "scroll",
  () => {
    syncHeader();
    updateHeroParallax();
    updatePlansParallax();
  },
  { passive: true },
);

syncHeader();
updateHeroParallax();
updatePlansParallax();

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

initHeroParticles();
initHeroGsap();

if (!prefersReducedMotion) {
  const animateTargets = document.querySelectorAll(".reveal, .service-card, .plan-card, .footer div");

  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -8% 0px",
    },
  );

  animateTargets.forEach((target) => revealObserver.observe(target));
} else {
  document.querySelectorAll(".reveal").forEach((target) => target.classList.add("is-visible"));
}

menuToggle.addEventListener("click", () => {
  const isOpen = menu.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

menu.addEventListener("click", (event) => {
  if (event.target.matches("a")) {
    menu.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
  }
});

function updateCheckout(planId) {
  const selectedPlan = planId || "start-mei";
  const details = planDetails[selectedPlan] || planDetails["start-mei"];

  if (checkoutSelect) checkoutSelect.value = selectedPlan;
  if (checkoutPlan) checkoutPlan.textContent = details.title;
  if (checkoutPrice) checkoutPrice.textContent = details.price;
  if (resultPlan) resultPlan.textContent = details.title;
  if (paymentSubmit) paymentSubmit.textContent = "Assinar plano";

  planCards.forEach((card) => {
    const button = card.querySelector("[data-plan-id]");
    card.classList.toggle("selected", button?.dataset.planId === selectedPlan);
  });
}

function getAttendanceUrl({ planId, customer }) {
  const details = planDetails[planId] || planDetails["start-mei"];
  const message = [
    "Ola, acabei de assinar um plano no site Facilita MEI.",
    "",
    `Nome: ${customer.name || customer.nome || ""}`,
    `Plano: ${details.title}`,
    `Valor: ${details.price}`,
    `WhatsApp: ${customer.phone || customer.telefone || ""}`,
    `E-mail: ${customer.email || ""}`,
    `CPF/CNPJ: ${customer.document || customer.documento || ""}`,
  ].join("\n");

  return `https://wa.me/5567996750853?text=${encodeURIComponent(message)}`;
}

function formatPrice(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

async function loadPlansFromBackend() {
  try {
    const response = await fetch(`${API_BASE}/api/plans`);
    const data = await parseJsonResponse(response, "Nao foi possivel carregar os planos. Confira a URL do backend no config.js.");

    if (!response.ok || !Array.isArray(data.plans)) return;

    planDetails = data.plans.reduce((accumulator, plan) => {
      accumulator[plan.id] = {
        title: plan.title,
        price: `${formatPrice(plan.price)} /mes`,
        amount: Number(plan.price),
        billing: plan.billing,
      };
      return accumulator;
    }, { ...planDetails });

    updateCheckout(checkoutSelect?.value || "start-mei");
  } catch {
    // A exibicao usa fallback local, mas o backend continua sendo a autoridade do preco.
  }
}

function resetPaymentResult() {
  window.clearInterval(statusPollingId);
  statusPollingId = null;

  if (paymentResult) paymentResult.hidden = true;
  if (resultKicker) resultKicker.textContent = "Assinatura";
  if (resultStatus) resultStatus.textContent = "Aguardando pagamento";
  if (subscriptionMessage) subscriptionMessage.textContent = "";
}

function openCheckout(planName) {
  updateCheckout(planName);
  if (!checkoutModal) return;

  checkoutModal.hidden = false;
  checkoutModal.classList.add("is-opening");
  document.body.classList.add("modal-open");
  checkoutStatus.textContent = "";
  if (checkoutForm) checkoutForm.hidden = false;
  checkoutForm?.classList.remove("is-processing");
  resetPaymentResult();
  ensureMercadoPagoCardForm().catch((error) => {
    checkoutStatus.textContent = error.message;
  });
  window.setTimeout(() => checkoutForm?.querySelector("input")?.focus(), 60);
  window.setTimeout(() => checkoutModal.classList.remove("is-opening"), 620);
}

function closeCheckout() {
  if (!checkoutModal) return;

  checkoutModal.hidden = true;
  checkoutModal.classList.remove("is-opening");
  document.body.classList.remove("modal-open");
  resetPaymentResult();
}

function initAboutReveal() {
  if (!aboutScroll || aboutRevealObserver || prefersReducedMotion) return;

  aboutRevealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    {
      root: aboutScroll,
      threshold: 0.18,
      rootMargin: "0px 0px -10% 0px",
    },
  );

  document.querySelectorAll(".about-reveal").forEach((item) => aboutRevealObserver.observe(item));
}

function openAboutModal() {
  if (!aboutModal) return;

  aboutModal.hidden = false;
  document.body.classList.add("modal-open");
  if (aboutScroll) aboutScroll.scrollTop = 0;
  initAboutReveal();
  window.setTimeout(() => {
    document.querySelectorAll(".about-reveal").forEach((item) => {
      if (prefersReducedMotion) item.classList.add("is-visible");
    });
  }, 40);
}

function closeAboutModal() {
  if (!aboutModal) return;

  aboutModal.hidden = true;
  document.body.classList.remove("modal-open");
}

const leadModalContent = {
  "sou-mei": {
    kicker: "Ja tenho MEI",
    title: "Vamos cuidar do seu MEI",
    description: "Informe seus dados para receber orientacao sobre regularizacao, notas fiscais, PGDAS e suporte mensal.",
    interest: "Sou MEI",
  },
  "quero-ser-mei": {
    kicker: "Quero abrir MEI",
    title: "Vamos abrir seu MEI",
    description: "Preencha o formulario para iniciarmos seu atendimento de abertura com seguranca e orientacao correta.",
    interest: "Quero Ser MEI",
  },
  "area-cliente": {
    kicker: "Area do cliente",
    title: "Acesse pelo atendimento",
    description: "Informe seus dados para nossa equipe localizar seu cadastro e orientar o proximo passo.",
    interest: "Area do cliente",
  },
  especialista: {
    kicker: "Atendimento especializado",
    title: "Fale com um especialista",
    description: "Envie seus dados para nossa equipe entender sua necessidade e chamar voce no WhatsApp.",
    interest: "Fale com especialista",
  },
};

const meiWizardSteps = [
  {
    title: "Vamos descobrir o <span>melhor plano para voce</span>",
    description: "Responda algumas perguntas rapidas para receber a melhor solucao para seu MEI.",
    field: "",
    button: "Comecar",
  },
  {
    title: "Qual sera sua atividade?",
    description: "Selecione a opcao que melhor descreve o seu negocio.",
    name: "atividade_tipo",
    type: "options",
    required: true,
    button: "Continuar",
    options: [
      { label: "Prestacao de servico", icon: "&#128100;" },
      { label: "Comercio", icon: "&#128722;" },
      { label: "Ecommerce", icon: "&#128188;" },
      { label: "Beleza", icon: "&#9986;" },
      { label: "Transporte", icon: "&#128666;" },
      { label: "Outro", icon: "&#8943;", detailName: "atividade_tipo_outro", detailLabel: "Descreva sua atividade" },
    ],
  },
  {
    title: "Qual e o seu nome completo?",
    description: "Assim nossa equipe ja inicia seu atendimento com seus dados corretos.",
    name: "nome",
    label: "Nome completo",
    type: "text",
    autocomplete: "name",
    required: true,
  },
  {
    title: "Como podemos falar com voce?",
    description: "Use o WhatsApp principal e um e-mail que voce acessa com facilidade.",
    fields: [
      { name: "whatsapp", label: "WhatsApp", type: "tel", autocomplete: "tel", required: true },
      { name: "email", label: "E-mail", type: "email", autocomplete: "email", required: true },
    ],
  },
  {
    title: "Informe seu CPF",
    description: "Esse dado ajuda na abertura e conferencia inicial do cadastro.",
    name: "cpf",
    label: "CPF",
    type: "text",
    inputmode: "numeric",
    required: true,
  },
  {
    title: "Onde voce quer abrir o MEI?",
    description: "Cidade e estado ajudam a orientar o processo corretamente.",
    fields: [
      { name: "cidade", label: "Cidade", type: "text", required: true },
      { name: "uf", label: "UF", type: "text", maxlength: "2", required: true },
    ],
  },
  {
    title: "Qual atividade voce pretende exercer?",
    description: "Conte resumidamente o que voce vende ou qual servico pretende prestar.",
    name: "atividade",
    label: "Atividade principal",
    type: "textarea",
    required: true,
  },
  {
    title: "Quando voce quer comecar?",
    description: "Finalize com a urgencia do atendimento e alguma observacao importante.",
    fields: [
      {
        name: "prazo",
        label: "Prazo desejado",
        type: "select",
        required: true,
        options: ["O quanto antes", "Ainda esta semana", "Este mes", "Estou pesquisando"],
      },
      { name: "observacao", label: "Observacao", type: "textarea" },
    ],
    button: "Enviar atendimento",
  },
];

let meiWizardStep = 0;
const meiWizardAnswers = {};

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMeiField(field) {
  const value = escapeHtml(meiWizardAnswers[field.name] || "");
  const required = field.required ? "required" : "";
  const autocomplete = field.autocomplete ? `autocomplete="${field.autocomplete}"` : "";
  const inputmode = field.inputmode ? `inputmode="${field.inputmode}"` : "";
  const maxlength = field.maxlength ? `maxlength="${field.maxlength}"` : "";

  if (field.type === "textarea") {
    return `<label>${field.label}<textarea name="${field.name}" ${required}>${value}</textarea></label>`;
  }

  if (field.type === "select") {
    const options = field.options
      .map((option) => `<option value="${escapeHtml(option)}" ${meiWizardAnswers[field.name] === option ? "selected" : ""}>${option}</option>`)
      .join("");
    return `<label>${field.label}<select name="${field.name}" ${required}><option value="">Selecione</option>${options}</select></label>`;
  }

  if (field.type === "options") {
    const options = field.options
      .map((option) => {
        const checked = meiWizardAnswers[field.name] === option.label ? "checked" : "";
        const detail = option.detailName
          ? `<div class="mei-option-detail" data-option-detail="${option.label}">
              <input name="${option.detailName}" type="text" value="${escapeHtml(meiWizardAnswers[option.detailName] || "")}" placeholder="${option.detailLabel}" />
            </div>`
          : "";
        return `
          <div class="mei-option-item">
            <label class="mei-option-card">
              <input type="radio" name="${field.name}" value="${escapeHtml(option.label)}" ${checked} ${required} />
              <span aria-hidden="true">${option.icon}</span>
              <strong>${option.label}</strong>
            </label>
            ${detail}
          </div>
        `;
      })
      .join("");

    return `<div class="mei-option-grid">${options}</div>`;
  }

  return `<label>${field.label}<input name="${field.name}" type="${field.type}" value="${value}" ${required} ${autocomplete} ${inputmode} ${maxlength} /></label>`;
}

function renderMeiWizard() {
  const step = meiWizardSteps[meiWizardStep];
  if (!step || !meiWizard || !meiCopy || !meiField) return;

  leadDialog?.classList.toggle("is-form-step", meiWizardStep > 0);

  if (meiCounter) meiCounter.textContent = `${meiWizardStep + 1} de ${meiWizardSteps.length}`;
  if (meiProgress) {
    meiProgress.innerHTML = meiWizardSteps
      .map((_, index) => `<span class="${index <= meiWizardStep ? "is-active" : ""}"></span>`)
      .join("");
  }

  meiCopy.innerHTML = `<h2>${step.title}</h2><p>${step.description}</p>`;
  const fields = step.fields || (step.name ? [step] : []);
  meiField.hidden = fields.length === 0;
  meiField.innerHTML = fields.map(renderMeiField).join("");
  syncMeiOptionDetails();

  if (meiPrev) meiPrev.hidden = meiWizardStep === 0;
  if (meiNext) meiNext.innerHTML = `${step.button || "Continuar"} <span aria-hidden="true">&#8594;</span>`;
  if (meiStatus) meiStatus.textContent = "";
}

function syncMeiOptionDetails() {
  const details = meiField?.querySelectorAll("[data-option-detail]") || [];

  details.forEach((detail) => {
    const optionValue = detail.dataset.optionDetail;
    const input = detail.querySelector("input");
    const selected = Boolean(meiField?.querySelector(`input[type="radio"][value="${optionValue}"]:checked`));
    detail.hidden = !selected;
    if (input) input.required = selected;
  });
}

function collectCurrentMeiStep() {
  const fields = meiField?.querySelectorAll("input, textarea, select") || [];
  const radioGroups = new Set();

  for (const field of fields) {
    if (field.type === "radio") {
      radioGroups.add(field.name);
      continue;
    }

    const value = field.value.trim();
    if (field.required && !value) {
      field.focus();
      if (meiStatus) meiStatus.textContent = "Preencha este campo para continuar.";
      return false;
    }

    meiWizardAnswers[field.name] = value;
  }

  for (const groupName of radioGroups) {
    const selected = meiField?.querySelector(`input[name="${groupName}"]:checked`);
    if (!selected) {
      if (meiStatus) meiStatus.textContent = "Selecione uma opcao para continuar.";
      return false;
    }
    meiWizardAnswers[groupName] = selected.value;
  }

  const visibleDetails = meiField?.querySelectorAll("[data-option-detail]:not([hidden]) input") || [];
  for (const field of visibleDetails) {
    const value = field.value.trim();
    if (field.required && !value) {
      field.focus();
      if (meiStatus) meiStatus.textContent = "Descreva sua atividade para continuar.";
      return false;
    }
    meiWizardAnswers[field.name] = value;
  }

  return true;
}

function sendMeiWizard() {
  const message = [
    "Ola, quero abrir meu MEI pelo site Facilita MEI.",
    `Nome: ${meiWizardAnswers.nome || "-"}`,
    `WhatsApp: ${meiWizardAnswers.whatsapp || "-"}`,
    `E-mail: ${meiWizardAnswers.email || "-"}`,
    `CPF: ${meiWizardAnswers.cpf || "-"}`,
    `Cidade/UF: ${meiWizardAnswers.cidade || "-"} - ${meiWizardAnswers.uf || "-"}`,
    `Tipo de atividade: ${meiWizardAnswers.atividade_tipo || "-"}`,
    `Atividade informada em outro: ${meiWizardAnswers.atividade_tipo_outro || "-"}`,
    `Atividade: ${meiWizardAnswers.atividade || "-"}`,
    `Prazo: ${meiWizardAnswers.prazo || "-"}`,
    `Observacao: ${meiWizardAnswers.observacao || "-"}`,
  ].join("\n");

  if (meiStatus) meiStatus.textContent = "Abrindo atendimento no WhatsApp...";
  window.open(`https://wa.me/5567996750853?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
}

function startMeiWizard() {
  Object.keys(meiWizardAnswers).forEach((key) => delete meiWizardAnswers[key]);
  meiWizardStep = 0;
  renderMeiWizard();
}

function openLeadModal(type = "sou-mei") {
  if (!leadModal) return;

  const isMeiWizard = type === "quero-ser-mei";
  leadDialog?.classList.toggle("is-mei-wizard", isMeiWizard);
  if (leadStandard) leadStandard.hidden = isMeiWizard;
  if (meiWizard) meiWizard.hidden = !isMeiWizard;

  if (isMeiWizard) {
    startMeiWizard();
    leadModal.hidden = false;
    document.body.classList.add("modal-open");
    return;
  }

  const content = leadModalContent[type] || leadModalContent["sou-mei"];
  if (leadKicker) leadKicker.textContent = content.kicker;
  if (leadTitle) leadTitle.textContent = content.title;
  if (leadDescription) leadDescription.textContent = content.description;
  if (leadInterest) leadInterest.value = content.interest;
  if (leadStatus) leadStatus.textContent = "";

  leadModal.hidden = false;
  document.body.classList.add("modal-open");
  window.setTimeout(() => leadForm?.querySelector("input[name='name']")?.focus(), 60);
}

function closeLeadModal() {
  if (!leadModal) return;

  leadModal.hidden = true;
  leadDialog?.classList.remove("is-mei-wizard");
  if (leadStandard) leadStandard.hidden = false;
  if (meiWizard) meiWizard.hidden = true;
  document.body.classList.remove("modal-open");
}

function submitLeadForm(event) {
  event.preventDefault();

  const payload = Object.fromEntries(new FormData(leadForm));
  const message = [
    "Ola, gostaria de atendimento pelo site Facilita MEI.",
    `Interesse: ${payload.interest || "-"}`,
    `Nome: ${payload.name || "-"}`,
    `WhatsApp: ${payload.phone || "-"}`,
    `E-mail: ${payload.email || "-"}`,
    `CPF/CNPJ: ${payload.document || "-"}`,
    `Mensagem: ${payload.message || "-"}`,
  ].join("\n");

  if (leadStatus) leadStatus.textContent = "Abrindo atendimento no WhatsApp...";
  window.open(`https://wa.me/5567996750853?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
}

function animatePlanToCheckout(card, planId) {
  openCheckout(planId);
}

planButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    const card = event.currentTarget.closest(".plan-card");
    animatePlanToCheckout(card, button.dataset.planId);
  });
});

checkoutCloseButtons.forEach((button) => {
  button.addEventListener("click", closeCheckout);
});

aboutOpenButton?.addEventListener("click", openAboutModal);

aboutCloseButtons.forEach((button) => {
  button.addEventListener("click", closeAboutModal);
});

leadOpenButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.leadType === "sou-mei") {
      document.querySelector("#planos")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    openLeadModal(button.dataset.leadType);
  });
});

leadCloseButtons.forEach((button) => {
  button.addEventListener("click", closeLeadModal);
});

leadForm?.addEventListener("submit", submitLeadForm);

meiPrev?.addEventListener("click", () => {
  if (meiWizardStep <= 0) return;
  meiWizardStep -= 1;
  renderMeiWizard();
});

meiNext?.addEventListener("click", () => {
  if (!collectCurrentMeiStep()) return;

  if (meiWizardStep >= meiWizardSteps.length - 1) {
    sendMeiWizard();
    return;
  }

  meiWizardStep += 1;
  renderMeiWizard();
  window.setTimeout(() => meiField?.querySelector("input, textarea, select")?.focus(), 40);
});

meiField?.addEventListener("change", (event) => {
  if (event.target.matches("input[type='radio']")) {
    syncMeiOptionDetails();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && leadModal && !leadModal.hidden) {
    closeLeadModal();
    return;
  }

  if (event.key === "Escape" && aboutModal && !aboutModal.hidden) {
    closeAboutModal();
    return;
  }

  if (event.key === "Escape" && checkoutModal && !checkoutModal.hidden) {
    closeCheckout();
  }
});

checkoutSelect?.addEventListener("change", (event) => {
  updateCheckout(event.target.value);
});

document.querySelector("#form-checkout__identificationNumber")?.addEventListener("input", (event) => {
  syncIdentificationType(event.target.value);
});

function renderSubscription(data, planId, customer) {
  const details = planDetails[planId] || planDetails["start-mei"];
  if (!paymentResult) return;

  paymentResult.hidden = false;
  if (checkoutForm) checkoutForm.hidden = true;
  if (resultKicker) resultKicker.textContent = "Assinatura concluida";
  if (resultPlan) resultPlan.textContent = details.title;
  if (resultStatus) resultStatus.textContent = data.message || "Plano assinado com sucesso.";
  if (subscriptionMessage) {
    subscriptionMessage.textContent = "Agora fale com o atendimento para continuar o processo.";
  }
  if (whatsappAttendance) whatsappAttendance.href = getAttendanceUrl({ planId, customer });

  checkoutForm?.classList.remove("is-processing");
}

function startPaymentStatusPolling(paymentId) {
  window.clearInterval(statusPollingId);

  statusPollingId = window.setInterval(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/payments/${paymentId}/status`);
      const data = await parseJsonResponse(response, "Nao foi possivel consultar o status do pagamento.");

      if (!response.ok) return;

      if (resultStatus) resultStatus.textContent = data.message || "Aguardando confirmacao.";

      if (["approved", "rejected", "cancelled", "refunded"].includes(data.status)) {
        window.clearInterval(statusPollingId);
        statusPollingId = null;
      }
    } catch {
      // O webhook continua sendo a confirmacao principal; a consulta local e apenas apoio visual.
    }
  }, 8000);
}

async function loadMercadoPago() {
  if (mercadoPagoInstance) return mercadoPagoInstance;

  const configResponse = await fetch(`${API_BASE}/api/config`);
  const config = await parseJsonResponse(configResponse, "Nao foi possivel carregar a configuracao do Mercado Pago. Confira a URL do backend no config.js.");
  const publicKey = config.mercadoPagoPublicKey || config.publicKey;

  if (!publicKey) {
    throw new Error("Configure MERCADO_PAGO_PUBLIC_KEY no arquivo .env para aceitar cartao.");
  }

  if (!window.MercadoPago) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Nao foi possivel carregar o MercadoPago.js."));
      document.head.appendChild(script);
    });
  }

  mercadoPagoInstance = new window.MercadoPago(publicKey, { locale: "pt-BR" });
  return mercadoPagoInstance;
}

function syncIdentificationType(documentValue = "") {
  const identificationType = document.querySelector("#form-checkout__identificationType");
  if (!identificationType) return;

  identificationType.value = String(documentValue).replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF";
}

function getSelectedPlanAmount() {
  const planId = checkoutSelect?.value || "start-mei";
  const details = planDetails[planId] || planDetails["start-mei"];
  return String(details.amount || 1);
}

async function submitSubscriptionWithToken(cardTokenId) {
  const payload = Object.fromEntries(new FormData(checkoutForm));
  syncIdentificationType(payload.document);

  checkoutStatus.textContent = "Criando assinatura recorrente no Mercado Pago...";
  checkoutForm.classList.add("is-processing");
  resetPaymentResult();

  const response = await fetch(`${API_BASE}/api/subscriptions/card`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      planId: payload.planId,
      nome: payload.name,
      email: payload.email,
      telefone: payload.phone,
      documento: payload.document,
      cardTokenId,
    }),
  });
  const data = await parseJsonResponse(response, "O backend retornou uma resposta invalida. Confira se o config.js aponta para o Railway.");

  if (!response.ok) {
    throw new Error(data.error || "Nao foi possivel criar a assinatura.");
  }

  checkoutStatus.textContent = "";
  renderSubscription(data, payload.planId, payload);
}

async function ensureMercadoPagoCardForm() {
  if (mercadoPagoCardForm || !checkoutForm) return mercadoPagoCardForm;

  const mp = await loadMercadoPago();
  mercadoPagoCardForm = mp.cardForm({
    amount: getSelectedPlanAmount(),
    iframe: true,
    form: {
      id: "form-checkout",
      cardNumber: {
        id: "form-checkout__cardNumber",
        placeholder: "Numero do cartao",
      },
      expirationDate: {
        id: "form-checkout__expirationDate",
        placeholder: "MM/AA",
      },
      securityCode: {
        id: "form-checkout__securityCode",
        placeholder: "CVV",
      },
      cardholderName: {
        id: "cardholderName",
        placeholder: "Nome impresso no cartao",
      },
      issuer: {
        id: "form-checkout__issuer",
        placeholder: "Banco emissor",
      },
      installments: {
        id: "form-checkout__installments",
        placeholder: "Parcelas",
      },
      identificationType: {
        id: "form-checkout__identificationType",
        placeholder: "Tipo de documento",
      },
      identificationNumber: {
        id: "form-checkout__identificationNumber",
        placeholder: "CPF ou CNPJ",
      },
      cardholderEmail: {
        id: "form-checkout__cardholderEmail",
        placeholder: "E-mail",
      },
    },
    callbacks: {
      onFormMounted: (error) => {
        if (error) {
          checkoutStatus.textContent = "Nao foi possivel iniciar o formulario seguro do Mercado Pago.";
        }
      },
      onSubmit: async (event) => {
        event.preventDefault();

        try {
          syncIdentificationType(document.querySelector("#form-checkout__identificationNumber")?.value);
          const { token } = mercadoPagoCardForm.getCardFormData();
          if (!token) throw new Error("Nao foi possivel gerar o token do cartao.");
          await submitSubscriptionWithToken(token);
        } catch (error) {
          if (checkoutForm) checkoutForm.hidden = false;
          checkoutForm.classList.remove("is-processing");
          const message = String(error.message || "");
          checkoutStatus.textContent = message.includes("Card token service not found")
            ? "O Mercado Pago recusou o token de teste. Ative/crie as contas de teste e use o e-mail do comprador de teste no checkout."
            : `${message} Verifique as credenciais de teste e o cartao usado.`;
        }
      },
      onFetching: () => {
        checkoutStatus.textContent = "Validando dados do cartao com Mercado Pago...";
        return () => {
          checkoutStatus.textContent = "";
        };
      },
    },
  });

  return mercadoPagoCardForm;
}

backToPaymentButton?.addEventListener("click", () => {
  resetPaymentResult();
  if (checkoutForm) checkoutForm.hidden = false;
});

updateCheckout("start-mei");
loadPlansFromBackend();
