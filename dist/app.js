import { createChecklists } from "./checklists.js";
import { createExecutive } from "./executive.js";
import { initialEvents } from "./executive-model.js";
import {
  initialInventory,
  serviceOrders,
  adjustStock,
  servicePreview,
  completeService,
} from "./inventory.js";
import {
  initialFleet,
  initialRecords,
  plans,
  totals,
  profitability,
  validateRecord,
} from "./model.js";
const $ = (s) => document.querySelector(s),
  money = (n) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(n),
  num = (n) =>
    new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(n),
  esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01"/>',
  fleet:
    '<path d="M3 17h18M5 17V8h7v9M12 9h6l3 5v3M7 8V4h8M15 4v5"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
  chart: '<path d="M4 4v16h17M8 16v-5M13 16V7M18 16V3"/>',
  chat: '<path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z"/><path d="M7 10h10M7 14h6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9ZM10 21h4"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14v6Z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  pin: '<path d="M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0Z"/><circle cx="12" cy="9" r="2"/>',
  spark:
    '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  wallet:
    '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 8V4l13-2v3M16 11h5v5h-5z"/>',
};
const icon = (n, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[n] || icons.grid}</svg>`;
let executive;
let checklists;
let state = {
  fleetQuery: "",
  fleetFamily: "Todos",
  fleetStatus: "Todos",
  inventoryQuery: "",
  inventoryCategory: "Todas",
  inventoryLow: false,
  calendarKind: "Todos",
  events: structuredClone(initialEvents),
  calendarMonth: "2026-09",
  selectedDate: "2026-09-25",
  attentionFilter: "all",
  voiceInterpreted: false,
  inventory: structuredClone(initialInventory),
  stockMovements: [],
  completedServices: [],
  lastService: null,
  plan: 0,
  view: "overview",
  records: structuredClone(initialRecords).map((r) => ({
    ...r,
    closed: true,
    observations:
      r.type === "Gasto"
        ? ""
        : "Servicio concluido. Información de ejemplo registrada por el operador.",
    materialsText:
      r.type === "Mantenimiento"
        ? "Sellos hidráulicos; cantidades no capturadas."
        : "Sin materiales detallados en este registro.",
    ...(r.type === "Mantenimiento" ? { serviceHours: 4 } : {}),
    ...(r.id === 109 ? { closed: false, observations: "" } : {}),
  })),
  fleet: structuredClone(initialFleet),
  filter: "Todos",
  query: "",
  calc: {
    crane: "RH-01",
    fixed: 28000,
    hours: 80,
    variable: 650,
    margin: 30,
    rate: 1800,
  },
  reminders: [
    {
      id: 1,
      title: "Comprar filtro hidráulico",
      detail: "RH-04 · Taller central",
      date: "Hoy",
      done: false,
    },
    {
      id: 2,
      title: "Programar revisión de cable",
      detail: "RH-02 · Próximo servicio",
      date: "28 sep",
      done: false,
    },
    {
      id: 3,
      title: "Confirmar servicio de aceite",
      detail: "RH-01 · Mantenimiento preventivo",
      date: "30 sep",
      done: false,
    },
  ],
  chat: [],
};
function notify(t) {
  $("#toast").textContent = t;
  $("#toast").classList.add("show");
  setTimeout(() => $("#toast").classList.remove("show"), 3500);
}
const brand = () =>
  `<a class="brand" href="#" aria-label="Grúas Rhino, inicio"><span class="brand-mark">R<span>↗</span></span><span>GRÚAS <b>RHINO</b><small>FUERZA QUE MUEVE TU NEGOCIO</small></span></a>`;
function nav(plan, view = "overview") {
  location.hash = plan ? `propuesta-${plan}/${view}` : "";
}
function parseRoute() {
  const m = location.hash.match(
    /^#propuesta-([123])\/(overview|records|fleet|calculator|inventory|assistant|shopping|reports|attention|calendar|checklists|quote)$/,
  );
  state.plan = m ? +m[1] : 0;
  state.view = m ? m[2] : "overview";
  if (
    (state.plan < 2 &&
      ["calculator", "inventory", "checklists"].includes(state.view)) ||
    (state.plan < 3 &&
      ["assistant", "shopping", "reports", "attention", "calendar"].includes(
        state.view,
      ))
  )
    state.view = "overview";
  render();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", parseRoute);
function selector() {
  return `<div class="selector"><header class="selector-header">${brand()}<span class="proposal-label">PROPUESTA DE DESARROLLO <span>2026</span></span></header><main class="selection-main"><div class="intro"><div><p class="eyebrow"><span class="short-line"></span> EL SIGUIENTE PASO PARA GRÚAS RHINO</p><h1>Más control.<br><span>Más posibilidades.</span></h1></div><div class="intro-side"><p>Tres maneras de llevar tu operación al siguiente nivel. Entra, prueba y descubre cuál se adapta a tu negocio.</p><div class="demo-label">${icon("grid")} Demostraciones interactivas · Datos ficticios</div><a class="text-link selector-quote-link" href="#propuesta-3/quote">Configurar opcionales y total ${icon("arrow")}</a></div></div><div class="plan-grid">${plans.map((p) => `<article class="plan-card plan-${p.id}"><div class="plan-top"><span class="plan-number">0${p.id}</span><span class="plan-tag">${p.tag}</span>${icon(p.id === 1 ? "list" : p.id === 2 ? "chart" : "spark")}</div><h2>${p.title}</h2><p class="plan-desc">${p.desc}</p><a class="button plan-button" href="#propuesta-${p.id}/overview">Ver propuesta ${p.id}${icon("arrow")}</a><div class="price">${money(p.price)}<span>MXN</span></div><p class="payment-note">Pago único por desarrollo</p><div class="plan-terms"><span>${icon("wallet")}${p.monthly}</span><span>${icon("clock")}${p.term}${p.id === 3 ? "*" : ""}</span></div><ul>${p.features.map((f) => `<li>${icon("check")}${f}</li>`).join("")}</ul><span class="card-foot">${p.label}</span></article>`).join("")}</div><div class="selector-foot"><p><b>Prueba la operación antes de decidir.</b> Captura registros, calcula una tarifa y explora el asistente.</p><a href="#comparacion" class="text-link" data-action="compare">Comparar alcances ${icon("arrow")}</a></div><p class="fine-print">* La propuesta 3 tiene un plazo estimado de 2 meses en adelante, según el alcance final. Su mensualidad depende del consumo de inteligencia artificial. Los plazos de las tres propuestas son estimados.</p><div id="comparison" hidden>${comparison()}</div>${executive.quoteView()}</main><footer class="site-footer"><span>GRÚAS RHINO</span><span>Una propuesta para trabajar con mayor claridad.</span><span>Todos los importes en pesos mexicanos.</span></footer></div>`;
}
function comparison() {
  const rows = [
    ["Pago único de desarrollo", "$19,000", "$49,000", "$79,000"],
    ["Mensualidad", "$500", "$500", "Variable según consumo de IA"],
    ["Entrega estimada", "15 días", "1 mes", "Desde 2 meses, según alcance"],
    [
      "Registro, historial y gasto acumulado por grúa",
      "Incluido",
      "Incluido",
      "Incluido",
    ],
    ["Formularios guiados y recordatorios", "—", "Incluido", "Incluido"],
    ["Costos, tarifa sugerida y rentabilidad", "—", "Incluido", "Incluido"],
    [
      "Inventario y cantidades",
      "—",
      "Actualización manual",
      "Actualización manual y descuento automático por servicio",
    ],
    ["Compras sugeridas, reportes y bandeja de atención", "—", "—", "Incluido"],
    [
      "Calendario e interpretación de notas de voz por WhatsApp",
      "—",
      "—",
      "Crea mantenimientos tras confirmar datos",
    ],
    ["Asistente y resúmenes por WhatsApp", "—", "—", "Incluido"],
  ];
  return `<section class="comparison"><h2>Elige hasta dónde quieres llegar</h2><div class="table-wrap"><table><thead><tr><th>Alcance</th>${plans.map((p) => `<th>Propuesta ${p.id}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<${i ? "td" : "th"}>${v}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</tbody></table></div></section>`;
}
const names = {
  overview: "Resumen",
  records: "Registros",
  fleet: "Flota e historial",
  calculator: "Rentabilidad",
  inventory: "Inventario",
  checklists: "Checklists",
  shopping: "Lista de compras",
  reports: "Reportes",
  attention: "Requiere tu atención",
  calendar: "Calendario",
  quote: "Opcionales y total",
  assistant: "Asistente del dueño",
};
function shell() {
  const p = plans[state.plan - 1];
  return `<div class="workspace tier-${state.plan}"><aside class="sidebar">${brand()}<a href="#" class="back-link">${icon("back")} Todas las propuestas</a><div class="workspace-label">ESPACIO DE DEMOSTRACIÓN</div><nav>${[
    ["overview", "grid"],
    ["records", "list"],
    ["fleet", "fleet"],
    ...(state.plan > 1
      ? [
          ["checklists", "check"],
          ["calculator", "chart"],
          ["inventory", "grid"],
        ]
      : []),
    ...(state.plan === 3
      ? [
          ["assistant", "chat"],
          ["calendar", "clock"],
          ["shopping", "wallet"],
          ["reports", "list"],
          ["attention", "bell"],
        ]
      : []),
    ["quote", "wallet"],
  ]
    .map(
      ([v, i]) =>
        `<a href="#propuesta-${state.plan}/${v}" class="nav-item ${state.view === v ? "active" : ""}" ${state.view === v ? 'aria-current="page"' : ""}>${icon(i)}${names[v]}${v === "assistant" ? '<span class="tiny-label">IA</span>' : ""}</a>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-bottom"><span class="avatar">GR</span><div>Grúas Rhino<small>Vista de demostración</small></div></div></aside><div class="workspace-body"><header class="workspace-top"><div class="breadcrumb">Propuesta 0${state.plan}<span>/</span><b>${names[state.view]}</b></div><div class="top-actions"><span class="demo-pill">Datos de ejemplo</span><button class="icon-btn" data-action="compare" aria-label="Comparar propuestas">${icon("grid")}</button><span class="avatar">MR</span></div></header><div class="offer-strip"><span><strong>${p.title}</strong> <span class="offer-id">/ Propuesta 0${p.id}</span></span><div><b>${money(p.price)}</b> único <i></i> ${p.monthly} <i></i> ${p.term}${p.id === 3 ? " · según alcance" : ""}</div></div><main class="dashboard"><div class="page-heading"><div><p class="eyebrow">${state.plan === 3 ? "DIRECCIÓN · GRÚAS RHINO" : state.plan === 2 ? "GESTIÓN · GRÚAS RHINO" : "CONTROL · GRÚAS RHINO"}</p><h1>${state.view === "overview" ? (state.plan === 3 ? "Tu operación, bajo control." : state.plan === 2 ? "Cada maniobra cuenta." : "Resumen de operación") : names[state.view]}</h1><p>${state.view === "overview" ? "Semana de ejemplo · 21 al 27 de septiembre de 2026" : state.view === "records" ? "Registra y actualiza la información de tu operación." : state.view === "fleet" ? "Última asignación registrada, historial y gasto acumulado." : state.view === "inventory" ? (state.plan === 2 ? "Existencias al día con ajustes manuales de tu equipo." : "Registra un servicio y el asistente descuenta los insumos definidos.") : state.view === "quote" ? "Elige opcionales y revisa el total estimado de desarrollo." : state.view === "shopping" ? "Insumos necesarios para recuperar los mínimos de tu almacén." : state.view === "reports" ? "Reportes de maniobras y mantenimientos listos para revisar y guardar." : state.view === "attention" ? "Pendientes detectados en los registros y órdenes de esta demostración." : state.view === "checklists" ? "Inspección, recepción en taller y entrega de equipo con evidencias." : state.view === "calendar" ? "Reservas, operaciones, traslados y visitas al taller en una sola agenda." : state.view === "calculator" ? "Encuentra una tarifa que cubra tus costos y tu ganancia objetivo." : "Una demostración de cómo recibirías información de tu negocio."}</p></div>${["overview", "records"].includes(state.view) ? `<button class="button primary" data-action="${state.plan === 1 ? "new" : "wizard"}">${icon("plus")} ${state.plan === 1 ? "Nuevo registro" : "Registrar actividad"}</button>` : state.view === "fleet" ? `<button class="button primary" data-action="new-equipment">${icon("plus")} Registrar grúa</button>` : ""}</div>${state.view === "overview" ? overview() : state.view === "records" ? recordsView() : state.view === "fleet" ? fleetView() : state.view === "checklists" ? checklists.view() : state.view === "calculator" ? calculator() : state.view === "inventory" ? inventoryView() : ["shopping", "reports", "attention", "calendar", "quote"].includes(state.view) ? executive.view(state.view) : assistantView()}<p class="workspace-note">Demostración interactiva · Los cambios duran durante esta visita y se reinician al recargar. Todos los cálculos dependen de los datos capturados.</p></main></div></div>`;
}
function stat(label, value, sub, ic, kind = "") {
  return `<article class="stat ${kind}"><div class="stat-label">${label}${icon(ic)}</div><strong>${value}</strong><span>${sub}</span></article>`;
}
function overview() {
  const t = totals(state.records),
    w = weekTotals();
  return `${state.plan === 3 ? `<div class="executive-banner"><div class="spark-tile">${icon("spark")}</div><div><span class="eyebrow">TU RESUMEN EJECUTIVO</span><h2>${money(w.income - w.cost)} de resultado estimado esta semana.</h2><p>${w.operations} operaciones registradas. ${state.fleet.filter((f) => f.status === "En operación").length} grúas en operación y ${state.reminders.filter((r) => !r.done).length} pendientes por atender.</p></div><a href="#propuesta-3/assistant" class="button">Consultar al asistente ${icon("arrow")}</a></div>` : ""}${state.plan === 3 ? executive.overviewLinks() : ""}${state.plan > 1 ? `<a class="checklist-callout" href="#propuesta-${state.plan}/checklists"><div>${icon("check")}<span><b>Documenta la próxima revisión</b><small>${state.fleet.length} grúas · Horómetro · Checklist por puntos · Fotos</small></span></div><span>Abrir checklists ${icon("arrow")}</span></a>` : ""}<div class="stats-grid">${stat("Ingresos registrados", money(t.income), "Todas las operaciones de ejemplo", "wallet")}${stat("Gastos acumulados", money(t.cost), "Operación + gastos + mantenimiento", "list")}${stat("Resultado estimado", money(t.income - t.cost), "Ingresos menos gastos registrados", "chart", "highlight")}${stat("Horas de operación", num(t.hours) + " h", `${t.operations} operaciones capturadas`, "clock")}</div><div class="main-grid"><section class="panel"><div class="panel-heading"><div><p class="eyebrow">TU EQUIPO</p><h2>Estado de la flota</h2></div><a href="#propuesta-${state.plan}/fleet" class="text-link">Ver ${state.fleet.length} grúas ${icon("arrow")}</a></div>${state.fleet
    .slice(0, 5)
    .map(
      (f) =>
        `<div class="fleet-row"><img class="fleet-thumb" src="${f.photo}" alt="Referencia de ${esc(f.family)}"><div class="fleet-name"><b>${f.id}</b><span>${f.name} · ${f.capacity}</span></div><div class="fleet-place"><span>${esc(f.place)}</span><small>${esc(f.job)}</small></div><span class="status ${statusClass(f.status)}">${f.status}</span></div>`,
    )
    .join(
      "",
    )}<p class="panel-note">${icon("pin")} Ubicación según la última asignación registrada; sin GPS en vivo.</p></section>${
    state.plan === 1
      ? `<section class="panel total-panel"><p class="eyebrow">GASTO POR EQUIPO</p><h2>Cada peso, identificado.</h2><div class="cost-bars">${state.fleet
          .slice(0, 5)
          .map((f) => {
            const c = totals(
              state.records.filter((r) => r.crane === f.id),
            ).cost;
            return `<div><div><b>${f.id}</b><span>${money(c)}</span></div><div class="bar-track"><span style="width:${(c / t.cost) * 100}%"></span></div></div>`;
          })
          .join(
            "",
          )}</div><p class="muted">Acumulado de todos los registros de esta demostración.</p></section>`
      : remindersPanel()
  }</div>${
    state.plan > 1
      ? `<a class="inventory-callout" href="#propuesta-${state.plan}/inventory"><div>${icon("grid")}<span><b>${state.plan === 2 ? "Inventario con control manual" : "Servicios conectados al inventario"}</b><small>${state.plan === 2 ? "Actualiza las cantidades de aceites, filtros y otros insumos." : "El asistente descuenta los consumibles al registrar cada servicio definido."}</small></span></div><span>Ver inventario ${icon("arrow")}</span></a><div class="insight-grid"><section class="panel"><div class="panel-heading"><div><p class="eyebrow">RENTABILIDAD REGISTRADA</p><h2>Ingresos y gastos · primeros 5 equipos</h2></div><div class="legend"><span>Ingresos</span><span>Gastos</span></div></div><div class="chart-bars">${state.fleet
          .slice(0, 5)
          .map((f) => {
            const t = totals(state.records.filter((r) => r.crane === f.id));
            const max = Math.max(
              ...state.fleet.map(
                (f) =>
                  totals(state.records.filter((r) => r.crane === f.id)).income,
              ),
              1,
            );
            return `<div class="chart-column"><div class="bar-pair"><div style="height:${(t.income / max) * 100}%" title="Ingresos ${money(t.income)}"><span>${money(t.income)}</span></div><div style="height:${(t.cost / max) * 100}%" title="Gastos ${money(t.cost)}"><span>${money(t.cost)}</span></div></div><b>${f.id}</b></div>`;
          })
          .join(
            "",
          )}</div></section><section class="panel calculator-teaser"><span class="eyebrow">COTIZA CON CLARIDAD</span>${icon("chart")}<h2>¿Cuánto debería cobrar por hora?</h2><p>Combina tus costos y el margen deseado para encontrar una tarifa de referencia.</p><a class="button" href="#propuesta-${state.plan}/calculator">Calcular mi tarifa ${icon("arrow")}</a></section></div>`
      : ""
  }<section class="panel"><div class="panel-heading"><div><p class="eyebrow">MOVIMIENTOS</p><h2>Últimos registros</h2></div><a class="text-link" href="#propuesta-${state.plan}/records">Ver todos ${icon("arrow")}</a></div>${recordsTable([...state.records].sort((a, b) => b.date.localeCompare(a.date) || state.records.indexOf(b) - state.records.indexOf(a)).slice(0, 4))}</section>`;
}
function statusClass(s) {
  return s === "En operación"
    ? "working"
    : s === "Disponible"
      ? "available"
      : "maintenance";
}
function remindersPanel() {
  return `<section class="panel reminders"><div class="panel-heading"><div><p class="eyebrow">QUE NO SE TE PASE</p><h2>Próximos pendientes</h2></div>${icon("bell")}</div>${state.reminders
    .slice(-5)
    .map(
      (r) =>
        `<label class="reminder ${r.done ? "done" : ""}"><input type="checkbox" data-reminder="${r.id}" ${r.done ? "checked" : ""}><span><b>${esc(r.title)}</b><small>${esc(r.detail)}</small></span><em>${r.done ? "Listo" : esc(r.date)}</em></label>${state.plan === 3 ? executive.reminderLink(r.id) : ""}`,
    )
    .join(
      "",
    )}<p class="panel-note">Marca un pendiente al resolverlo.</p></section>`;
}
function recordsTable(rows) {
  return `<div class="table-wrap"><table><thead><tr><th>Fecha / tipo</th><th>Grúa y concepto</th><th>Horas</th><th>Ingreso</th><th>${state.plan > 1 ? "Gasto / costo por hora" : "Gasto"}</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${rows.length ? rows.map((r) => `<tr><td><b>${r.date.slice(8)}/${r.date.slice(5, 7)}/${r.date.slice(2, 4)}</b><small>${r.type}</small></td><td><b>${esc(r.crane)}</b><small>${esc(r.concept)}</small></td><td>${r.hours ? num(r.hours) + " h" : "—"}</td><td class="amount">${r.income ? money(r.income) : "—"}</td><td class="amount">${money(r.cost)}${state.plan > 1 && r.hours ? `<small>${money(r.cost / r.hours)} / h</small>` : ""}</td><td>${state.plan === 3 && r.type !== "Gasto" ? `<button class="icon-btn" aria-label="Ver reporte ${r.id}" data-report="${r.id}">${icon("list")}</button>` : ""}<button class="icon-btn" aria-label="Editar registro ${r.id}" data-edit="${r.id}">${icon("edit")}</button></td></tr>`).join("") : '<tr><td colspan="6" class="empty">No hay registros con estos filtros.</td></tr>'}</tbody></table></div>`;
}
function recordsView() {
  const filtered = state.records.filter(
      (r) =>
        (state.filter === "Todos" || r.type === state.filter) &&
        `${r.concept} ${r.crane}`
          .toLowerCase()
          .includes(state.query.toLowerCase()),
    ),
    t = totals(filtered);
  return `<section class="panel"><div class="records-toolbar"><div class="filter-buttons" role="group" aria-label="Tipo de registro">${["Todos", "Operación", "Mantenimiento", "Gasto"].map((f) => `<button class="${state.filter === f ? "selected" : ""}" data-filter="${f}">${f === "Operación" ? "Operaciones" : f === "Gasto" ? "Gastos" : f}</button>`).join("")}</div><input class="search-input" aria-label="Buscar registros" placeholder="Buscar grúa o concepto…" value="${esc(state.query)}" id="record-search"></div>${recordsTable(filtered)}<div class="table-total"><span>${filtered.length} registros · ${num(t.hours)} horas</span><span>Ingresos <b>${money(t.income)}</b></span><span>Gastos <b>${money(t.cost)}</b></span></div></section><div class="info-box">${icon("list")}<p>${state.plan === 1 ? "Captura manual: los totales se actualizan al guardar cada registro." : "Puedes usar la captura guiada o editar cualquier registro directamente."} Los costos de operación son gastos reales capturados; el cálculo de tarifas usa supuestos independientes.</p></div>`;
}
function fleetView() {
  const shown = state.fleet.filter(
    (f) =>
      (state.fleetFamily === "Todos" || f.family === state.fleetFamily) &&
      (state.fleetStatus === "Todos" || f.status === state.fleetStatus) &&
      `${f.id} ${f.name} ${f.operator} ${f.place}`
        .toLowerCase()
        .includes(state.fleetQuery.toLowerCase()),
  );
  return `<section class="catalog-toolbar panel"><label>Buscar grúa<input id="fleet-search" value="${esc(state.fleetQuery)}" placeholder="Número, modelo, operador o ubicación…"></label><label>Tipo<select id="fleet-family"><option>Todos</option>${[...new Set(state.fleet.map((f) => f.family).filter(Boolean))].map((f) => `<option ${f === state.fleetFamily ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></label><label>Estado<select id="fleet-status"><option>Todos</option>${[...new Set(state.fleet.map((f) => f.status))].map((v) => `<option ${v === state.fleetStatus ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label><p>${shown.length} de ${state.fleet.length} equipos</p></section><div class="fleet-cards">${
    shown
      .map((f) => {
        const t = totals(state.records.filter((r) => r.crane === f.id));
        return `<article class="panel equipment-card">${checklists.photo(f)}<div class="panel-heading"><span class="eyebrow">${esc(f.family || "Equipo registrado")}</span><span class="status ${statusClass(f.status)}">${esc(f.status)}</span></div><div class="equipment-title"><span>${esc(f.id)}</span><h2>${esc(f.name)}</h2><p>${esc(f.capacity)}${f.capacity.includes("t·m") ? " · Momento máximo" : " · Capacidad comercial"}</p><p>${esc(f.operator)}</p></div><div class="equipment-meter"><span>Horómetro</span><b>${num(f.meterHours || 0)} h</b></div><div class="assignment"><span>${icon("pin")} ${esc(f.place)}</span><b>${esc(f.job)}</b><small>Última asignación: ${esc(f.date)}</small></div><div class="equipment-totals"><div><span>Gasto acumulado</span><strong>${money(t.cost)}</strong></div><div><span>Ingresos</span><strong>${money(t.income)}</strong></div></div>${state.plan > 1 ? `<button class="button secondary fleet-checklist" data-new-checklist="${f.id}">${icon("check")} Iniciar checklist</button>` : ""}<div class="card-actions"><button class="text-link" data-history="${f.id}">Ver historial ${icon("arrow")}</button><button class="icon-btn" data-equipment="${f.id}" aria-label="Editar ${f.id}">${icon("edit")}</button></div>${f.source ? `<details class="equipment-source"><summary>Referencia del modelo</summary><p>${esc(f.capacityNote)}</p><a href="${esc(f.source)}" target="_blank" rel="noopener">Consultar fabricante ↗</a></details>` : ""}</article>`;
      })
      .join("") ||
    '<div class="executive-empty">No hay grúas con estos filtros.</div>'
  }</div><div class="info-box">${icon("pin")}<p>Activos y asignaciones de ejemplo. Fotos de referencia por familia, no de la unidad real. Capacidades sujetas a configuración; t·m indica momento de carga. <a href="./creditos.html" target="_blank" rel="noopener">Fuentes y créditos</a>.</p></div>`;
}
function bindCatalogFilters() {
  for (const [id, key] of [
    ["fleet-search", "fleetQuery"],
    ["inventory-search", "inventoryQuery"],
  ]) {
    const el = $("#" + id);
    if (el)
      el.oninput = (e) => {
        const pos = e.target.selectionStart;
        state[key] = e.target.value;
        render();
        $("#" + id).focus();
        $("#" + id).setSelectionRange(pos, pos);
      };
  }
  for (const [id, key] of [
    ["fleet-family", "fleetFamily"],
    ["fleet-status", "fleetStatus"],
    ["inventory-category", "inventoryCategory"],
  ]) {
    const el = $("#" + id);
    if (el)
      el.onchange = (e) => {
        state[key] = e.target.value;
        render();
      };
  }
  if ($("#inventory-low"))
    $("#inventory-low").onchange = (e) => {
      state.inventoryLow = e.target.checked;
      render();
    };
}
function calculator() {
  const c = state.calc;
  return `<div class="calculator-layout"><section class="panel calc-form"><p class="eyebrow">01 / TUS SUPUESTOS</p><h2>Construye tu costo por hora</h2><label>Grúa<select id="calc-crane">${state.fleet.map((f) => `<option value="${f.id}" ${f.id === c.crane ? "selected" : ""}>${f.id} · ${f.name}</option>`).join("")}</select></label><div class="form-grid"><label>Costos fijos mensuales (MXN)<input id="calc-fixed" type="number" min="0" value="${c.fixed}"><small>Ejemplo: administración y seguros.</small></label><label>Horas facturables al mes<input id="calc-hours" type="number" min="1" value="${c.hours}"><small>Horas estimadas que sí se cobran.</small></label></div><label>Costo variable por hora (MXN)<input id="calc-variable" type="number" min="0" value="${c.variable}"><small>Ejemplo: combustible, operador y desgaste.</small></label><div class="range-label"><label for="calc-margin">Margen deseado sobre venta</label><strong id="margin-value">${c.margin}%</strong></div><input id="calc-margin" type="range" min="0" max="95" step="1" value="${c.margin}"><div class="range-ends"><span>0%</span><span>95%</span></div><div class="margin-explanation">Un margen del 30% significa que de cada $100 cobrados, $30 quedan como ganancia estimada después de los costos considerados.</div></section><div><section class="rate-result"><p class="eyebrow">02 / TARIFA DE REFERENCIA</p><h2>Tu hora de trabajo vale</h2><div class="recommended-rate" id="suggested-rate"></div><p>Tarifa sugerida para el margen deseado</p><div class="cost-breakdown" id="cost-breakdown"></div></section><section class="panel chosen-rate"><p class="eyebrow">03 / PRUEBA TU PRECIO</p><label>¿Cuánto quieres cobrar por hora? (MXN)<input id="calc-rate" type="number" min="1" value="${c.rate}"></label><div id="profit-result" aria-live="polite"></div></section></div></div><div class="info-box formula-box">${icon("chart")}<div><b>Así se calcula</b><p>Costo por hora = costos fijos mensuales ÷ horas facturables + costo variable por hora.<br>Tarifa sugerida = costo por hora ÷ (1 − margen deseado).<br>Margen a tu tarifa = (tarifa elegida − costo por hora) ÷ tarifa elegida.</p><small>Se usa margen sobre venta, no recargo sobre costo. Es una estimación; incluye todos tus costos para acercarla a la realidad. Los supuestos no modifican tus gastos registrados.</small></div></div>`;
}
function updateCalc() {
  try {
    const c = state.calc,
      r = profitability(c);
    $("#suggested-rate").innerHTML =
      `${money(r.suggested)} <span>MXN / hora</span>`;
    $("#margin-value").textContent = c.margin + "%";
    $("#cost-breakdown").innerHTML =
      `<div><span>Fijo por hora</span><b>${money(c.fixed / c.hours)}</b></div><div><span>Variable por hora</span><b>${money(c.variable)}</b></div><div class="breakdown-total"><span>Costo total por hora</span><b>${money(r.cost)}</b></div>`;
    $("#profit-result").innerHTML =
      `<div class="profit-pair"><div><span>Ganancia estimada / hora</span><strong class="${r.profit < 0 ? "negative" : ""}">${money(r.profit)}</strong></div><div><span>Margen sobre venta</span><strong>${num(r.actualMargin)}%</strong></div></div><div class="profit-status ${r.actualMargin < c.margin ? "warning" : ""}">${icon(r.actualMargin >= c.margin ? "check" : "chart")}${r.profit < 0 ? "Tu tarifa no cubre el costo estimado." : r.actualMargin < c.margin ? "Tu tarifa queda por debajo del margen deseado." : "Tu tarifa alcanza el margen deseado."}</div>`;
  } catch (e) {
    $("#suggested-rate").textContent = "Revisa tus datos";
    $("#cost-breakdown").innerHTML = "";
    $("#profit-result").innerHTML = `<p class="form-error">${e.message}</p>`;
  }
}
function weekTotals() {
  return totals(
    state.records.filter(
      (r) => r.date >= "2026-09-21" && r.date <= "2026-09-27",
    ),
  );
}
function reply(kind) {
  const t = weekTotals();
  if (["compras", "agenda", "atencion"].includes(kind))
    return executive.reply(kind);
  if (kind === "inventario") return inventoryReply();
  if (kind === "ubicaciones")
    return `Estas son las últimas asignaciones registradas:\n\n${state.fleet.map((f) => `${f.id} · ${f.place}\n${f.job}`).join("\n\n")}\n\nLa ubicación depende del registro; no es GPS en vivo.`;
  if (kind === "pendientes") {
    const p = state.reminders.filter((r) => !r.done);
    return p.length
      ? `Tienes ${p.length} pendientes:\n\n${p.map((r) => `• ${r.title} · ${r.detail} (${r.date})`).join("\n\n")}`
      : "Todos los pendientes de esta demostración están completados.";
  }
  if (kind === "recordatorio") {
    const r = state.reminders.find((r) => !r.done);
    return r
      ? `Ejemplo de recordatorio por WhatsApp:\n\nRecuerda: ${r.title.toLowerCase()}.\n${r.detail}. Fecha: ${r.date}.\n\nEste mensaje es una simulación. No se envió ningún WhatsApp.`
      : "No tienes pendientes por recordar en esta demostración.";
  }
  return `Resumen del 21 al 27 de septiembre:\n\nIngresos: ${money(t.income)}\nGastos registrados: ${money(t.cost)}\nResultado estimado: ${money(t.income - t.cost)}\n${t.operations} operaciones · ${num(t.hours)} horas\n\nIncluye gastos y mantenimientos capturados en la semana. No incluye costos que aún no se hayan registrado.`;
}
function assistantView() {
  const t = weekTotals();
  return `<div class="assistant-layout"><section class="phone-panel"><header class="chat-header"><span class="assistant-avatar">${icon("spark")}</span><div><b>Asistente Rhino</b><span>Vista de conversación tipo WhatsApp</span></div><span class="demo-pill">Demo</span></header><div class="chat-feed" id="chat-feed" aria-live="polite"><div class="chat-date">SEMANA DE EJEMPLO · 21–27 SEP</div><div class="bubble incoming">Buen día. Aquí tienes el pulso de Grúas Rhino.<br><br>${money(t.income - t.cost)} de resultado estimado esta semana y ${state.reminders.filter((r) => !r.done).length} pendientes por atender.<small>Conversación simulada</small></div>${state.chat.map((m) => `<div class="bubble ${m.role === "user" ? "outgoing" : "incoming"}">${esc(m.text).replace(/\n/g, "<br>")}<small>${m.role === "user" ? "Tú" : "Asistente · demostración"}</small></div>`).join("")}</div><div class="chat-prompts"><button data-chat="resumen">Resumen semanal</button><button data-chat="ubicaciones">¿Dónde están las grúas?</button><button data-chat="pendientes">Mis pendientes</button><button data-chat="inventario">Insumos y servicios</button><button data-chat="compras">Qué comprar</button><button data-chat="agenda">Próximos eventos</button></div><form id="chat-form" class="chat-input"><input name="message" aria-label="Consulta de demostración" placeholder="Pregunta por grúas, pendientes o ganancias…" required maxlength="240"><button class="icon-btn" aria-label="Consultar demostración">${icon("arrow")}</button></form><p class="chat-disclaimer">Respuestas de ejemplo basadas en los datos de esta visita. Sin IA real ni conexión a WhatsApp.</p></section><div class="assistant-right">${executive.voiceCard()}<section class="weekly-card"><div class="panel-heading"><p class="eyebrow">LA SEMANA EN UNA MIRADA</p>${icon("chart")}</div><h2>${money(t.income - t.cost)}</h2><p>Resultado estimado · 21–27 sep</p><div class="weekly-grid"><div><span>Ingresos</span><b>${money(t.income)}</b></div><div><span>Gastos registrados</span><b>${money(t.cost)}</b></div></div><small>La precisión depende de los datos capturados.</small></section>${remindersPanel()}<button class="button reminder-preview" data-chat="recordatorio">${icon("bell")} Simular recordatorio por WhatsApp ${icon("arrow")}</button><section class="assignment-compact"><h3>Últimas asignaciones</h3>${state.fleet
    .slice(0, 5)
    .map((f) => `<div><span>${f.id}</span><b>${esc(f.place)}</b></div>`)
    .join(
      "",
    )}<a href="#propuesta-3/fleet" class="text-link">Ver detalle de cada grúa ${icon("arrow")}</a></section></div></div>`;
}
function render() {
  document.body.className = state.plan ? "in-workspace" : "at-selector";
  $("#app").innerHTML = state.plan ? shell() : selector();
  document.title = state.plan
    ? `${names[state.view]} · Propuesta ${state.plan} · Grúas Rhino`
    : "Grúas Rhino · Propuesta interactiva";
  bind();
  if (state.view === "calculator" && state.plan) updateCalc();
}
function bind() {
  executive.bind();
  checklists.bind();
  bindInventory();
  bindCatalogFilters();
  document
    .querySelectorAll('[data-action="new-equipment"]')
    .forEach((b) => (b.onclick = () => equipmentDialog()));
  document.querySelectorAll('[data-action="compare"]').forEach(
    (b) =>
      (b.onclick = (e) => {
        e.preventDefault();
        if (!state.plan) {
          $("#comparison").hidden = !$("#comparison").hidden;
          if (!$("#comparison").hidden)
            $("#comparison").scrollIntoView({ behavior: "smooth" });
        } else
          showDialog(
            `<div class="dialog-heading"><h2>Compara las propuestas</h2>${closeButton()}</div>${comparison()}<div class="compare-links">${plans.map((p) => `<a class="button" href="#propuesta-${p.id}/overview" data-close>Ver propuesta ${p.id}</a>`).join("")}</div>`,
            "wide",
          );
      }),
  );
  document
    .querySelectorAll('[data-action="new"]')
    .forEach((b) => (b.onclick = () => recordDialog()));
  document
    .querySelectorAll('[data-action="wizard"]')
    .forEach((b) => (b.onclick = () => wizard()));
  document
    .querySelectorAll("[data-edit]")
    .forEach((b) => (b.onclick = () => recordDialog(b.dataset.edit)));
  document.querySelectorAll("[data-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        state.filter = b.dataset.filter;
        render();
      }),
  );
  const search = $("#record-search");
  if (search)
    search.oninput = (e) => {
      const pos = e.target.selectionStart;
      state.query = e.target.value;
      render();
      $("#record-search").focus();
      $("#record-search").setSelectionRange(pos, pos);
    };
  document.querySelectorAll("[data-history]").forEach(
    (b) =>
      (b.onclick = () => {
        const f = state.fleet.find((f) => f.id === b.dataset.history),
          rs = state.records.filter((r) => r.crane === f.id),
          t = totals(rs);
        showDialog(
          `<div class="dialog-heading"><div><p class="eyebrow">HISTORIAL DE EQUIPO</p><h2>${f.id} · ${f.name}</h2></div>${closeButton()}</div><div class="history-total"><span>Gasto acumulado</span><b>${money(t.cost)}</b></div>${recordsTable(rs)}`,
          "wide",
        );
        $("#modal")
          .querySelectorAll("[data-edit]")
          .forEach((el) => (el.onclick = () => recordDialog(el.dataset.edit)));
        executive.bind();
      }),
  );
  document
    .querySelectorAll("[data-equipment]")
    .forEach((b) => (b.onclick = () => equipmentDialog(b.dataset.equipment)));
  document.querySelectorAll("[data-reminder]").forEach(
    (c) =>
      (c.onchange = () => {
        state.reminders.find((r) => r.id === +c.dataset.reminder).done =
          c.checked;
        render();
        notify(
          c.checked
            ? "Pendiente marcado como completado."
            : "Pendiente reabierto.",
        );
      }),
  );
  if ($("#calc-crane")) {
    $("#calc-crane").onchange = (e) => {
      const f = state.fleet.find((f) => f.id === e.target.value);
      Object.assign(state.calc, {
        crane: f.id,
        fixed: f.fixed,
        hours: f.hours,
        variable: f.variable,
      });
      render();
    };
    ["fixed", "hours", "variable", "margin", "rate"].forEach(
      (k) =>
        ($("#calc-" + k).oninput = (e) => {
          state.calc[k] = e.target.value === "" ? NaN : +e.target.value;
          updateCalc();
        }),
    );
  }
  document
    .querySelectorAll("[data-chat]")
    .forEach((b) => (b.onclick = () => addChat(b.dataset.chat)));
  if ($("#chat-form"))
    $("#chat-form").onsubmit = (e) => {
      e.preventDefault();
      const text = new FormData(e.target).get("message").trim();
      if (!text) return;
      const q = text.toLowerCase();
      const kind = /calendario|agenda|evento|programad/.test(q)
        ? "agenda"
        : /compra|reponer|faltan insumos/.test(q)
          ? "compras"
          : /atención|atencion|baja ganancia/.test(q)
            ? "atencion"
            : /inventario|insumo|existencia|stock|consumible|servicio|aceite|filtro|grasa/.test(
                  q,
                )
              ? "inventario"
              : /dónde|donde|ubic|asign|grúa|grua|mina/.test(q)
                ? "ubicaciones"
                : /pendiente|compra|mantenim/.test(q)
                  ? "pendientes"
                  : /resumen|ganancia|semana|ingreso|gasto/.test(q)
                    ? "resumen"
                    : null;
      state.chat.push(
        { role: "user", text },
        {
          role: "assistant",
          text: kind
            ? reply(kind)
            : "Esta demostración puede mostrar el resumen semanal, las asignaciones de las grúas, los pendientes y el inventario. Prueba una de las consultas sugeridas.",
        },
      );
      render();
      scrollChat();
    };
}
function scrollChat() {
  const feed = $("#chat-feed");
  if (feed) feed.scrollTop = feed.scrollHeight;
}
function addChat(kind) {
  const qs = {
    compras: "¿Qué insumos faltan para recuperar mínimos?",
    agenda: "¿Qué eventos tengo programados?",
    atencion: "¿Qué requiere mi atención?",
    inventario: "¿Cómo está el inventario después de los servicios?",
    resumen: "¿Cómo cerramos la semana?",
    ubicaciones: "¿Dónde están asignadas las grúas?",
    pendientes: "¿Qué pendientes tengo?",
    recordatorio: "Muéstrame un recordatorio por WhatsApp.",
  };
  state.chat.push(
    { role: "user", text: qs[kind] },
    { role: "assistant", text: reply(kind) },
  );
  render();
  scrollChat();
}
const closeButton = () =>
  `<button class="icon-btn" data-close aria-label="Cerrar ventana">${icon("close")}</button>`;
function showDialog(html, cls = "") {
  const d = $("#modal");
  d.className = cls;
  d.innerHTML = html;
  d.querySelectorAll("[data-close]").forEach(
    (b) => (b.onclick = () => d.close()),
  );
  if (!d.open) d.showModal();
  d.onclick = (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  };
}
function recordFields(r) {
  return `<div class="form-grid"><label>Tipo de registro<select name="type">${["Operación", "Mantenimiento", "Gasto"].map((t) => `<option ${r.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></label><label>Fecha<input type="date" name="date" value="${r.date}" required></label><label>Grúa<select name="crane">${state.fleet.map((f) => `<option ${r.crane === f.id ? "selected" : ""}>${f.id}</option>`).join("")}</select></label><label class="operation-field">Horas de operación<input name="hours" type="number" min="0.1" step="0.1" value="${r.hours || 8}" required></label></div><label>Concepto / proyecto<input name="concept" value="${esc(r.concept)}" placeholder="Ej. Montaje de estructura · Mina Santa Rita" required maxlength="140"></label><div class="form-grid"><label class="operation-field">Ingreso total (MXN)<input name="income" type="number" min="0" step="0.01" value="${r.income}" required></label><label>Gasto total (MXN)<input name="cost" type="number" min="0" step="0.01" value="${r.cost}" required></label></div>${state.plan === 3 ? executive.recordFields(r) : ""}<p class="field-help">${r.serviceId ? "Los insumos de este servicio ya se descontaron. Editar sus importes no modifica el inventario. " : ""}Captura el gasto de esta actividad una sola vez. Para operaciones, incluye combustible, operador y demás gastos directos.</p>`;
}
function formRecord(form, id) {
  const d = Object.fromEntries(new FormData(form));
  const op = d.type === "Operación";
  return validateRecord({
    id: id
      ? state.records.find((r) => String(r.id) === String(id))?.id || id
      : Date.now(),
    type: d.type,
    date: d.date,
    crane: d.crane,
    concept: d.concept.trim(),
    hours: op ? +d.hours : 0,
    income: op ? +d.income : 0,
    cost: +d.cost,
    ...(state.plan === 3
      ? {
          observations: d.observations?.trim() || "",
          materialsText: d.materialsText?.trim() || "",
          ...(d.serviceHours ? { serviceHours: +d.serviceHours } : {}),
        }
      : {}),
  });
}
function saveRecord(r) {
  if (state.plan === 3 && r.type !== "Gasto" && !r.observations)
    r.closed = false;
  if (!state.records.some((x) => x.id === r.id))
    r.closed = r.type === "Gasto" || !!r.observations;
  const ix = state.records.findIndex((x) => x.id === r.id);
  if (ix < 0) state.records.push(r);
  else state.records[ix] = { ...state.records[ix], ...r };
  $("#modal").close();
  render();
  notify(
    state.plan === 3
      ? "Registro guardado. Su reporte está disponible en Reportes."
      : "Registro guardado. Los totales están actualizados.",
  );
}
function recordDialog(id) {
  const r = id
    ? state.records.find((r) => String(r.id) === String(id))
    : {
        type: "Operación",
        date: "2026-09-25",
        crane: "RH-01",
        concept: "",
        hours: 8,
        income: 0,
        cost: 0,
      };
  showDialog(
    `<div class="dialog-heading"><div><p class="eyebrow">CAPTURA MANUAL</p><h2>${id ? "Editar" : "Nuevo"} registro</h2></div>${closeButton()}</div><form id="record-form">${recordFields(r)}<p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" data-close>Cancelar</button><button class="button primary">Guardar registro</button></div></form>`,
  );
  const f = $("#record-form");
  function toggle() {
    f.querySelectorAll(".operation-field").forEach((x) => {
      x.hidden = f.elements.type.value !== "Operación";
      x.querySelector("input").disabled = x.hidden;
    });
  }
  f.elements.type.onchange = toggle;
  toggle();
  f.onsubmit = (e) => {
    e.preventDefault();
    try {
      saveRecord(formRecord(f, id));
    } catch (e) {
      f.querySelector(".form-error").textContent = e.message;
    }
  };
}
function equipmentDialog(id) {
  const f = id
    ? state.fleet.find((f) => f.id === id)
    : {
        id: "",
        name: "",
        capacity: "",
        operator: "",
        status: "Disponible",
        place: "Patio Grúas Rhino",
        job: "Disponible para asignación",
        fixed: 28000,
        hours: 80,
        variable: 650,
      };
  showDialog(
    `<div class="dialog-heading"><h2>${id ? `Actualizar ${id}` : "Registrar grúa"}</h2>${closeButton()}</div><form id="equipment-form">${!id ? `<div class="form-grid"><label>Identificador<input name="id" placeholder="RH-05" required maxlength="12" pattern="[A-Za-z0-9-]+"></label><label>Capacidad<input name="capacity" placeholder="40 toneladas" required maxlength="40"></label></div><label>Marca y modelo<input name="name" placeholder="Grove RT 540" required maxlength="60"></label>` : ""}<label>Operador<input name="operator" value="${esc(f.operator)}" required maxlength="60"></label><label>Estado<select name="status">${["En operación", "Disponible", "Reservada", "En mantenimiento", "En taller"].map((s) => `<option ${s === f.status ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>Última ubicación asignada<input name="place" value="${esc(f.place)}" required maxlength="100"></label><label>Maniobra o proyecto<input name="job" value="${esc(f.job)}" required maxlength="140"></label><p class="field-help">Esta es una actualización manual de la asignación.</p><p class="form-error" role="alert"></p><div class="dialog-actions"><button class="button primary">Guardar ${id ? "asignación" : "grúa"}</button></div></form>`,
  );
  $("#equipment-form").onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (!id) {
      data.id = data.id.trim().toUpperCase();
      if (state.fleet.some((x) => x.id === data.id)) {
        e.target.querySelector(".form-error").textContent =
          "Ese identificador ya existe.";
        return;
      }
    }
    Object.assign(f, data, { date: "Actualizado en esta visita" });
    if (!id) state.fleet.push(f);
    $("#modal").close();
    render();
    notify("Asignación actualizada en la demostración.");
  };
}
function wizard() {
  let step = 1,
    draft = {
      type: "Operación",
      date: "2026-09-25",
      crane: "RH-01",
      concept: "",
      hours: 8,
      income: 14400,
      cost: 5200,
    };
  function draw() {
    showDialog(
      `<div class="dialog-heading"><div><p class="eyebrow">CAPTURA GUIADA</p><h2>${["", "¿Qué actividad realizaste?", "Completa los detalles", "Revisa antes de guardar"][step]}</h2></div>${closeButton()}</div><div class="wizard-steps">${["Actividad", "Detalles", "Confirmación"].map((s, i) => `<span class="${step >= i + 1 ? "current" : ""}"><b>${i + 1}</b>${s}</span>`).join("")}</div><form id="wizard-form">${step === 1 ? `<div class="activity-choices">${["Operación", "Mantenimiento", "Gasto"].map((t, i) => `<label><input type="radio" name="type" value="${t}" ${draft.type === t ? "checked" : ""}>${icon(["fleet", "clock", "wallet"][i])}<span><b>${t}</b><small>${["Una maniobra o servicio realizado", "Un servicio preventivo o reparación", "Otro gasto asociado a una grúa"][i]}</small></span></label>`).join("")}</div>${state.plan === 3 ? `<a class="inventory-wizard-link" href="#propuesta-3/inventory" data-close>${icon("grid")} Registrar servicio con descuento de insumos ${icon("arrow")}</a><p class="field-help">La captura libre no descuenta existencias. Usa un servicio definido para aplicar su lista de consumibles.</p>` : ""}` : step === 2 ? recordFields(draft) : `<div class="review-box"><span class="status available">Listo para registrar</span><h3>${esc(draft.concept)}</h3><p>${draft.type} · ${draft.crane} · ${draft.date}</p><dl><div><dt>Horas</dt><dd>${draft.hours || "—"}</dd></div><div><dt>Ingreso</dt><dd>${money(draft.income)}</dd></div><div><dt>Gasto</dt><dd>${money(draft.cost)}</dd></div>${draft.type === "Operación" ? `<div><dt>Costo registrado por hora</dt><dd>${money(draft.cost / draft.hours)}</dd></div><div><dt>Resultado de la operación</dt><dd>${money(draft.income - draft.cost)}</dd></div>` : ""}</dl></div>`}<p class="form-error" role="alert"></p><div class="dialog-actions">${step > 1 ? '<button type="button" class="button secondary" id="wizard-back">Atrás</button>' : '<button type="button" class="button secondary" data-close>Cancelar</button>'}<button class="button primary">${step === 3 ? "Guardar actividad" : "Continuar"}${icon(step === 3 ? "check" : "arrow")}</button></div></form>`,
    );
    const form = $("#wizard-form");
    if (step === 2) {
      form.elements.type.closest("label").hidden = true;
      form.querySelectorAll(".operation-field").forEach((x) => {
        x.hidden = draft.type !== "Operación";
        x.querySelector("input").disabled = x.hidden;
      });
    }
    if ($("#wizard-back"))
      $("#wizard-back").onclick = () => {
        if (step === 2) {
          const data = Object.fromEntries(new FormData(form));
          Object.assign(draft, data);
        }
        step--;
        draw();
      };
    form.onsubmit = (e) => {
      e.preventDefault();
      try {
        if (step === 1) {
          draft.type = new FormData(form).get("type");
          if (draft.type !== "Operación") {
            draft.income = 0;
            draft.cost = 0;
          }
        }
        if (step === 2) draft = formRecord(form);
        if (step === 3) {
          saveRecord(draft);
          return;
        }
        step++;
        draw();
      } catch (e) {
        form.querySelector(".form-error").textContent = e.message;
      }
    };
  }
  draw();
}
executive = createExecutive({
  state,
  $,
  esc,
  money,
  num,
  icon,
  showDialog,
  closeButton,
  nav,
  render,
  notify,
  serviceOrders,
  serviceDialog,
  recordDialog,
});
checklists = createChecklists({
  state,
  esc,
  icon,
  num,
  render,
  notify,
  nav,
  showDialog,
  closeButton,
});
parseRoute();
const ctx = document.modelContext;
if (ctx?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  for (const tool of [
    {
      name: "navigate_rhino_proposal",
      description:
        "Abre una propuesta y una vista de la demostración de Grúas Rhino.",
      inputSchema: {
        type: "object",
        properties: {
          proposal: { type: "integer", enum: [1, 2, 3] },
          view: {
            type: "string",
            enum: [
              "overview",
              "records",
              "fleet",
              "calculator",
              "inventory",
              "checklists",
              "assistant",
              "shopping",
              "reports",
              "attention",
              "calendar",
              "quote",
            ],
          },
        },
        required: ["proposal", "view"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        if (
          !input ||
          ![1, 2, 3].includes(input.proposal) ||
          !Object.keys(names).includes(input.view) ||
          (input.proposal < 2 &&
            ["calculator", "inventory", "checklists"].includes(input.view)) ||
          (input.proposal < 3 &&
            [
              "assistant",
              "shopping",
              "reports",
              "attention",
              "calendar",
            ].includes(input.view))
        )
          throw new Error("Propuesta o vista no válida.");
        nav(input.proposal, input.view);
        parseRoute();
        return { proposal: state.plan, view: state.view };
      },
    },
    {
      name: "configure_rhino_profitability",
      description:
        "Modifica los supuestos de la calculadora visible de rentabilidad de la demostración. No guarda gastos.",
      inputSchema: {
        type: "object",
        properties: Object.fromEntries(
          ["fixed", "hours", "variable", "margin", "rate"].map((k) => [
            k,
            { type: "number" },
          ]),
        ),
        required: ["fixed", "hours", "variable", "margin", "rate"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        if (
          !input ||
          Object.keys(input).some(
            (k) =>
              !["fixed", "hours", "variable", "margin", "rate"].includes(k),
          ) ||
          input.margin > 95
        )
          throw new Error("Supuestos no válidos.");
        const result = profitability(input);
        Object.assign(state.calc, input);
        nav(state.plan >= 2 ? state.plan : 2, "calculator");
        parseRoute();
        return result;
      },
    },
  ]) {
    try {
      Promise.resolve(
        ctx.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
  }
}

function inventoryReply() {
  const latest = state.lastService;
  return `${latest ? `Servicio ${latest.id} registrado para ${latest.crane}.\nDesconté una sola vez: ${latest.lines.map((l) => `${num(l.quantity)} ${l.quantity === 1 && l.unit === "pzas" ? "pza" : l.unit} de ${l.name.toLowerCase()}`).join(", ")}.\n\n` : ""}Existencias actuales:\n${state.inventory.map((i) => `• ${i.name}: ${num(i.quantity)} ${i.unit}${i.quantity < i.min ? " · Reponer" : ""}`).join("\n")}\n\n${state.completedServices.length} ${state.completedServices.length === 1 ? "servicio con descuento registrado" : "servicios con descuento registrados"} en esta visita. Los ajustes manuales también se reflejan aquí.\nDemostración: descuento basado en consumibles definidos, sin IA real ni mensajes externos.`;
}
function inventoryView() {
  const auto = state.plan === 3;
  const shown = state.inventory
    .filter(
      (i) =>
        (state.inventoryCategory === "Todas" ||
          i.category === state.inventoryCategory) &&
        (!state.inventoryLow || i.quantity < i.min) &&
        `${i.name} ${i.sku} ${i.category}`
          .toLowerCase()
          .includes(state.inventoryQuery.toLowerCase()),
    )
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    );
  return `<div class="inventory-mode ${auto ? "automatic" : ""}"><div class="spark-tile">${icon(auto ? "spark" : "edit")}</div><div><p class="eyebrow">${auto ? "OPCIÓN 3 / ASISTENTE + INVENTARIO" : "OPCIÓN 2 / CONTROL MANUAL"}</p><h2>${auto ? "Cada servicio actualiza sus insumos." : "Tú actualizas las cantidades."}</h2><p>${auto ? "Revisa los consumibles de cada orden. Al confirmar, se registra el mantenimiento y se descuenta su lista de insumos una sola vez." : "Al recibir o utilizar insumos, captura la nueva existencia y su motivo. Registrar una operación o un mantenimiento no cambia estas cantidades automáticamente."}</p></div></div>${auto && state.lastService ? `<div class="service-success" role="status">${icon("check")}<div><b>${state.lastService.id} registrado · ${state.lastService.crane}</b><p>${state.lastService.lines.map((l) => `${esc(l.name)}: ${num(l.before)} → ${num(l.after)} ${l.unit}`).join(" · ")}</p><small>Existencias al completar el servicio. El asistente ya tiene este movimiento.</small></div><a href="#propuesta-3/assistant" class="text-link">Ver asistente ${icon("arrow")}</a></div>` : ""}<section class="panel"><div class="panel-heading"><div><p class="eyebrow">ALMACÉN · DATOS DE EJEMPLO</p><h2>Existencias de insumos</h2></div><span class="stock-count">${state.inventory.filter((i) => i.quantity < i.min).length} por reponer</span></div><div class="catalog-toolbar inventory-toolbar"><label>Buscar insumo<input id="inventory-search" value="${esc(state.inventoryQuery)}" placeholder="Llantas, aceite, filtro, código…"></label><label>Categoría<select id="inventory-category"><option>Todas</option>${[
    ...new Set(state.inventory.map((i) => i.category)),
  ]
    .sort()
    .map(
      (c) =>
        `<option ${c === state.inventoryCategory ? "selected" : ""}>${esc(c)}</option>`,
    )
    .join(
      "",
    )}</select></label><label class="low-stock-toggle"><input type="checkbox" id="inventory-low" ${state.inventoryLow ? "checked" : ""}>Solo por reponer</label><p>${shown.length} de ${state.inventory.length} insumos</p></div><div class="inventory-items">${shown.map((i) => `<article class="stock-item"><div class="stock-item-head"><span class="equipment-icon">${icon("grid")}</span><span class="status ${i.quantity < i.min ? "maintenance" : "working"}">${i.quantity < i.min ? "Reponer" : "Suficiente"}</span></div><p class="stock-category">${i.category} · ${i.sku}</p><h3>${esc(i.name)}</h3><div class="stock-quantity" data-stock="${i.id}"><strong>${num(i.quantity)}</strong><span>${i.unit}</span></div><small>Ubicación de ejemplo: ${i.location}</small><p>Mínimo de referencia: ${num(i.min)} ${i.unit}</p><button class="button secondary" data-adjust="${i.id}">${icon("edit")} Ajustar existencia</button><details class="stock-compatibility"><summary>Compatibilidad por validar</summary><p>${esc(i.compatibility)}</p>${i.source ? `<a href="${esc(i.source)}" target="_blank" rel="noopener">Fuente del catálogo ↗</a>` : ""}</details></article>`).join("")}</div><p class="panel-note">Modelos, medidas y compatibilidades se validan por equipo y número de serie. Existencias, mínimos y costos son ficticios. <a href="./creditos.html" target="_blank" rel="noopener">Ver fuentes</a>. Los ajustes manuales modifican cantidades, sin generar ingresos o gastos. Los consumos de los servicios definidos se valoran al registrar el mantenimiento.</p></section>${auto ? executive.shoppingSummary() : ""}${auto ? `<section class="service-section"><div class="service-section-title"><div><p class="eyebrow">ÓRDENES DE EJEMPLO</p><h2>Registrar servicio con insumos</h2></div><span>25 de septiembre de 2026</span></div><div class="service-grid">${serviceOrders.map((order) => serviceCard(order)).join("")}</div><p class="workspace-note">La captura libre de otros mantenimientos no descuenta insumos. En esta demo, el descuento automático aplica a estas órdenes con consumibles definidos.</p></section>` : ""}<section class="panel stock-history"><div class="panel-heading"><div><p class="eyebrow">TRAZABILIDAD</p><h2>Movimientos de esta visita</h2></div><span class="stock-count">${state.stockMovements.length} ${state.stockMovements.length === 1 ? "movimiento" : "movimientos"}</span></div>${
    state.stockMovements.length
      ? `<div class="table-wrap"><table><thead><tr><th>Insumo y motivo</th><th>Origen</th><th>Antes</th><th>Cambio</th><th>Después</th></tr></thead><tbody>${[
          ...state.stockMovements,
        ]
          .reverse()
          .map((m) => {
            const i = state.inventory.find((i) => i.id === m.itemId);
            return `<tr><td><b>${i.name}</b><small>${esc(m.reason)}</small></td><td>${m.source === "service" ? "Servicio automático" : "Ajuste manual"}</td><td>${num(m.before)} ${i.unit}</td><td>${m.delta > 0 ? "+" : ""}${num(m.delta)} ${i.unit}</td><td><b>${num(m.after)} ${i.unit}</b></td></tr>`;
          })
          .join("")}</tbody></table></div>`
      : '<p class="stock-empty">Todavía no hay movimientos. Las existencias iniciales son datos ficticios para probar la propuesta.</p>'
  }</section>`;
}
function serviceCard(order) {
  const done = state.completedServices.includes(order.id),
    p = servicePreview(state.inventory, order);
  return `<article class="panel service-card"><div class="service-card-top"><span class="eyebrow">${order.id} · ${order.crane}</span><span class="status ${done ? "working" : p.available ? "available" : "maintenance"}">${done ? "Registrado" : p.available ? "Listo para registrar" : "Faltan insumos"}</span></div><h3>${order.title}</h3><p>Consumo definido para 1 servicio</p><ul class="consumable-list">${p.lines.map((l) => `<li><span>${l.name}</span><b>${num(l.quantity)} ${l.quantity === 1 && l.unit === "pzas" ? "pza" : l.unit}</b></li>`).join("")}</ul><div class="service-cost"><span>Insumos ${money(p.supplies)} + mano de obra ${money(order.labor)}</span><b>Gasto del servicio: ${money(p.supplies + order.labor)}</b></div><button class="button ${done ? "secondary" : "primary"}" data-service="${order.id}" ${done ? "disabled" : ""}>${icon(done ? "check" : "plus")}${done ? "Registrado · sin repetir descuento" : "Revisar y registrar servicio"}</button>${done ? `<button class="text-link service-report-link" data-report="${order.id}">Ver reporte de servicio ${icon("arrow")}</button>` : ""}</article>`;
}
function bindInventory() {
  document
    .querySelectorAll("[data-adjust]")
    .forEach((b) => (b.onclick = () => adjustDialog(b.dataset.adjust)));
  document
    .querySelectorAll("[data-service]")
    .forEach((b) => (b.onclick = () => serviceDialog(b.dataset.service)));
}
function adjustDialog(id) {
  const item = state.inventory.find((i) => i.id === id);
  showDialog(
    `<div class="dialog-heading"><div><p class="eyebrow">AJUSTE MANUAL</p><h2>${item.name}</h2></div>${closeButton()}</div><form id="stock-adjust-form"><p class="current-stock">Existencia actual: <b>${num(item.quantity)} ${item.unit}</b></p><label>Nueva existencia (${item.unit})<input name="quantity" type="number" min="0" max="100000" step="${item.step}" value="${item.quantity}" required></label><label>Motivo del ajuste<input name="reason" placeholder="Ej. Entrada de almacén o consumo de mantenimiento" required maxlength="140"></label><p class="field-help">Escribe el total que debe quedar, no la cantidad que entra o sale.</p><p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" data-close>Cancelar</button><button class="button primary">Guardar ajuste manual</button></div></form>`,
  );
  $("#stock-adjust-form").onsubmit = (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      const result = adjustStock(
        state.inventory,
        id,
        Number(data.get("quantity")),
        data.get("reason"),
      );
      state.inventory = result.items;
      state.stockMovements.push(result.movement);
      $("#modal").close();
      render();
      notify("Existencia actualizada manualmente.");
    } catch (err) {
      e.target.querySelector(".form-error").textContent = err.message;
    }
  };
}
function serviceDialog(orderId) {
  const order = serviceOrders.find((o) => o.id === orderId),
    preview = servicePreview(state.inventory, order);
  showDialog(
    `<div class="dialog-heading"><div><p class="eyebrow">CONFIRMAR SERVICIO · ${order.id}</p><h2>${order.title}</h2></div>${closeButton()}</div><p class="current-stock">${order.crane} · 25 sep 2026 · Mantenimiento</p><div class="service-preview">${preview.lines.map((l) => `<div class="${l.after < 0 ? "shortage" : ""}"><div><b>${l.name}</b><span>Consumo: ${num(l.quantity)} ${l.quantity === 1 && l.unit === "pzas" ? "pza" : l.unit}</span></div><span>${num(l.before)} → ${l.after < 0 ? "Falta " + num(-l.after) : num(l.after)} ${l.unit}</span></div>`).join("")}</div><div class="service-cost"><span>Insumos: ${money(preview.supplies)} · Mano de obra: ${money(order.labor)}</span><b>Se registrará un gasto de ${money(preview.supplies + order.labor)}.</b></div><p class="field-help">Confirmar crea un mantenimiento y descuenta estos insumos una sola vez. Los cambios se reflejan en el historial de la grúa y en el asistente simulado.</p>${!preview.available ? '<p class="form-error" role="alert">Existencias insuficientes. Ajusta o repón los insumos indicados antes de registrar. No se aplicó ningún cambio.</p>' : ""}<label class="service-observations">Observaciones del servicio<textarea id="service-observations" rows="3" maxlength="600">Servicio realizado conforme a la lista de consumibles.</textarea></label><p id="service-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" data-close>Cancelar</button><button class="button primary" id="confirm-service" ${!preview.available ? "disabled" : ""}>Confirmar servicio y descontar</button></div>`,
  );
  let submitted = false;
  $("#confirm-service").onclick = () => {
    if (submitted) return;
    try {
      const result = completeService(
        state.inventory,
        state.completedServices,
        orderId,
      );
      submitted = true;
      state.inventory = result.items;
      state.completedServices = result.completed;
      state.stockMovements.push(...result.movements);
      Object.assign(result.record, {
        closed: true,
        serviceHours: order.id === "MT-026" ? 2 : 1.5,
        materials: result.preview.lines.map((l) => ({
          name: l.name,
          quantity: l.quantity,
          unit: l.unit,
        })),
        observations:
          $("#service-observations").value.trim() ||
          "Servicio realizado conforme a la lista de consumibles.",
      });
      state.records.push(result.record);
      state.lastService = {
        id: order.id,
        crane: order.crane,
        lines: result.preview.lines,
      };
      state.chat.push({
        role: "assistant",
        text: `Registré ${order.id}: ${order.title} en ${order.crane}.\n\n${result.preview.lines.map((l) => `${l.name}: −${num(l.quantity)} ${l.quantity === 1 && l.unit === "pzas" ? "pza" : l.unit}. Quedan ${num(l.after)} ${l.unit}.`).join("\n")}\n\nGasto registrado: ${money(result.record.cost)} (insumos + mano de obra). El descuento se aplicó una sola vez.\nDemostración sin IA real ni envío de WhatsApp.`,
      });
      $("#modal").close();
      render();
      notify(
        "Servicio registrado. Insumos descontados una sola vez. Reporte disponible.",
      );
    } catch (err) {
      $("#service-error").textContent = err.message;
    }
  };
}
