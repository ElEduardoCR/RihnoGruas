import {
  shoppingList,
  attentionItems,
  voiceExample,
  prepareEvent,
  eventKinds,
  occursOn,
} from "./executive-model.js";
import { plans } from "./model.js";
const extraDefaults = [
  {
    id: "cobro",
    title: "Seguimiento de servicios a cobro",
    price: 15000,
    description: "Estado del servicio, facturación y seguimiento de pagos.",
  },
  {
    id: "programacion",
    title: "Programación avanzada de grúas y operadores",
    price: 20000,
    description:
      "Planeación de disponibilidad y asignaciones. Amplía el calendario visible incluido en la opción 3.",
  },
  {
    id: "variaciones",
    title: "Análisis de variaciones de costos",
    price: 12000,
    description:
      "Comparación de patrones de costo para señalar variaciones. Amplía los cálculos y alertas sencillas incluidos.",
  },
  {
    id: "gps",
    title: "Integración con proveedor GPS compatible",
    price: 18000,
    description:
      "Solo integración. Equipos y cuotas del proveedor se cotizan aparte, sin importe definido.",
  },
];
const dateText = (d) =>
  new Date(d + "T12:00:00").toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const monthText = (m) =>
  new Date(m + "-01T12:00:00").toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });
export function createExecutive(api) {
  const {
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
  } = api;
  state.extras = extraDefaults.map((e) => ({ ...e, selected: false }));
  state.quotePlan = 3;
  const list = () => shoppingList(state.inventory);
  const attention = () =>
    attentionItems(state.records, serviceOrders, state.completedServices);
  const record = (id) => state.records.find((r) => String(r.id) === String(id));
  const eventDone = (e) =>
    !!(e.reminderId
      ? state.reminders.find((r) => r.id === e.reminderId)?.done
      : e.done);
  const reportButton = (id) =>
    `<button class="button secondary" data-report="${id}">${icon("list")} Ver reporte</button>`;
  function shoppingSummary() {
    const rows = list();
    return `<a href="#propuesta-3/shopping" class="inventory-callout"><div>${icon("wallet")}<span><b>${rows.length ? `${rows.length} insumo${rows.length === 1 ? "" : "s"} por reponer` : "Inventario sobre los mínimos"}</b><small>${rows.length ? rows.map((r) => `${num(r.missing)} ${r.unit} de ${r.name.toLowerCase()}`).join(" · ") : "La lista de compras se actualiza después de cada consumo o ajuste."}</small></span></div><span>Ver lista de compras ${icon("arrow")}</span></a>`;
  }
  function shoppingView() {
    const rows = list();
    return `<div class="executive-explainer">${icon("wallet")}<p>La lista calcula <b>mínimo − existencia actual</b>, con un mínimo de cero. Solo propone cantidades; no realiza compras ni descuenta dinero.</p></div><section class="panel"><div class="panel-heading"><div><p class="eyebrow">REPOSICIÓN AUTOMÁTICA</p><h2>${rows.length ? "Tu lista de compras" : "No necesitas reponer para alcanzar mínimos"}</h2></div><span class="stock-count">${rows.length} insumos</span></div>${rows.length ? `<div class="purchase-list">${rows.map((i) => `<article><div><h3>${i.name}</h3><p>Existencia: ${num(i.quantity)} ${i.unit} · Mínimo: ${num(i.min)} ${i.unit}</p></div><div><strong>${num(i.missing)} <small>${i.unit}</small></strong><span>Cantidad sugerida</span></div></article>`).join("")}</div>` : '<div class="executive-empty">Todos los insumos están en su mínimo o por encima. Prueba registrar el servicio hidráulico MT-026 para ver cómo se actualiza esta lista.</div>'}<div class="panel-bottom"><a class="button primary" href="#propuesta-3/inventory">Abrir inventario ${icon("arrow")}</a></div></section><p class="workspace-note">Los pendientes de compras capturados manualmente se conservan en recordatorios; esta lista se calcula exclusivamente con las existencias y mínimos actuales.</p>`;
  }
  function overviewLinks() {
    return `<div class="executive-shortcuts">${[
      [
        "attention",
        "bell",
        "Requiere tu atención",
        `${attention().length + (state.inspections || []).filter((r) => r.needsReview && !state.reminders.find((m) => m.inspectionId === r.id)?.done).length} asuntos por revisar`,
      ],
      [
        "calendar",
        "clock",
        "Calendario",
        `${state.events.filter((e) => !eventDone(e)).length} eventos pendientes`,
      ],
      [
        "shopping",
        "wallet",
        "Lista de compras",
        `${list().length} insumos bajo mínimo`,
      ],
      [
        "reports",
        "list",
        "Reportes de servicio",
        `${state.records.filter((r) => r.type !== "Gasto").length} reportes disponibles`,
      ],
    ]
      .map(
        ([v, i, t, d]) =>
          `<a href="#propuesta-3/${v}">${icon(i)}<div><b>${t}</b><span>${d}</span></div>${icon("arrow")}</a>`,
      )
      .join("")}</div>`;
  }
  function attentionView() {
    const items = attention(),
      filter = state.attentionFilter,
      shown = items.filter(
        (i) => filter === "all" || i.reasons.some((r) => r.kind === filter),
      );
    return `${
      state.inspections?.filter(
        (r) =>
          r.needsReview &&
          !state.reminders.find((m) => m.inspectionId === r.id)?.done,
      ).length
        ? `<section class="panel inspection-alerts"><div class="panel-heading"><h2>Hallazgos en checklists</h2></div>${state.inspections
            .filter(
              (r) =>
                r.needsReview &&
                !state.reminders.find((m) => m.inspectionId === r.id)?.done,
            )
            .map(
              (r) =>
                `<article><div><b>${esc(r.crane)} · ${esc(r.id)}</b><p>${esc(r.notes)}</p></div><button class="button secondary" data-inspection="${r.id}">Ver checklist</button></article>`,
            )
            .join("")}</section>`
        : ""
    }<section class="panel"><div class="attention-filters">${[
      ["all", "Todos"],
      ["margin", "Baja ganancia"],
      ["pending", "Sin cerrar"],
      ["missing", "Datos faltantes"],
    ]
      .map(
        ([k, t]) =>
          `<button data-attention-filter="${k}" class="${filter === k ? "selected" : ""}">${t}<span>${k === "all" ? items.length : items.filter((i) => i.reasons.some((r) => r.kind === k)).length}</span></button>`,
      )
      .join(
        "",
      )}</div><div class="attention-list">${shown.length ? shown.map((i) => `<article><span class="attention-symbol">${icon("bell")}</span><div><p>${i.crane} · ${i.type === "order" ? "Orden " + i.id : "Registro " + i.id}</p><h3>${esc(i.title)}</h3><ul>${i.reasons.map((r) => `<li>${esc(r.text)}</li>`).join("")}</ul></div><button class="button secondary" ${i.type === "order" ? `data-open-order="${i.id}"` : `data-report="${i.id}"`}>Abrir ${i.type === "order" ? "orden" : "registro"} ${icon("arrow")}</button></article>`).join("") : '<div class="executive-empty">No hay asuntos en esta categoría con los datos actuales.</div>'}</div></section><div class="executive-explainer">${icon("chart")}<p>La referencia de baja ganancia es un margen sobre ingreso menor al <b>20%</b>: (ingreso − gasto registrado) ÷ ingreso. Los avisos desaparecen al corregir los datos o cerrar el servicio. No se usan análisis estadísticos.</p></div>`;
  }
  function reportsView() {
    return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">DOCUMENTACIÓN DE SERVICIOS</p><h2>Maniobras y mantenimientos</h2></div><span class="stock-count">${state.records.filter((r) => r.type !== "Gasto").length} reportes</span></div><div class="report-list">${[
      ...state.records,
    ]
      .filter((r) => r.type !== "Gasto")
      .reverse()
      .map(
        (r) =>
          `<article><div><span class="status ${r.closed === false ? "maintenance" : "working"}">${r.closed === false ? "Pendiente de cierre" : "Listo para compartir"}</span><h3>${esc(r.concept)}</h3><p>${r.crane} · ${dateText(r.date)} · ${r.type}</p></div>${reportButton(r.id)}</article>`,
      )
      .join(
        "",
      )}</div></section><div class="executive-explainer">${icon("list")}<p>Abre un reporte para revisar materiales y observaciones. Puedes descargarlo como archivo HTML o usar <b>Imprimir / guardar PDF</b>. No se envía a terceros.</p></div>`;
  }
  function materials(r) {
    if (r.materials?.length)
      return `<ul>${r.materials.map((m) => `<li><b>${esc(m.name)}</b><span>${num(m.quantity)} ${esc(m.quantity === 1 && m.unit === "pzas" ? "pza" : m.unit)}</span></li>`).join("")}</ul>${r.materialsText ? `<p>${esc(r.materialsText)}</p>` : ""}`;
    return `<p>${esc(r.materialsText || "Materiales no capturados.")}</p>`;
  }
  function reportMarkup(r) {
    const f = state.fleet.find((f) => f.id === r.crane),
      h = r.type === "Operación" ? r.hours : r.serviceHours;
    return `<article class="report-sheet" id="report-sheet"><header><div><strong>GRÚAS RHINO</strong><p>Reporte de ${r.type === "Operación" ? "maniobra" : "mantenimiento"}</p></div><div><b>RS-${esc(r.id)}</b><span>${dateText(r.date)}</span></div></header><div class="report-status">${r.closed === false ? "BORRADOR · PENDIENTE DE CIERRE" : "SERVICIO CERRADO · LISTO PARA COMPARTIR"}</div><h1>${esc(r.concept)}</h1><dl class="report-facts"><div><dt>Grúa</dt><dd>${esc(r.crane)} · ${esc(f?.name || "Equipo registrado")}</dd></div><div><dt>Fecha del servicio</dt><dd>${dateText(r.date)}</dd></div><div><dt>Proyecto / servicio</dt><dd>${esc(r.concept)}</dd></div><div><dt>Horas registradas</dt><dd>${h ? num(h) + " h" : "No capturadas"}</dd></div></dl><section><h2>Materiales utilizados</h2>${materials(r)}</section><section><h2>Observaciones</h2><p>${esc(r.observations || "Pendientes de capturar.")}</p></section><footer>Documento de demostración · Datos ficticios de Grúas Rhino.<br>Los materiales corresponden al registro del servicio; no a la ubicación actual de la grúa.</footer></article>`;
  }
  function reportDialog(id) {
    const r = record(id);
    if (!r || r.type === "Gasto") return;
    showDialog(
      `<div class="dialog-heading no-print"><div><p class="eyebrow">REPORTE DE SERVICIO</p><h2>RS-${esc(r.id)}</h2></div>${closeButton()}</div><div class="report-actions no-print"><button class="button primary" id="print-report">Imprimir / guardar PDF</button><button class="button secondary" id="download-report">Descargar reporte</button><button class="text-link" id="edit-report-record">Editar registro</button>${r.closed === false ? '<button class="button primary" id="close-report-service">Completar y cerrar servicio</button>' : ""}</div>${reportMarkup(r)}`,
      "wide report-dialog",
    );
    $("#print-report").onclick = () => {
      document.body.classList.add("printing-report");
      window.addEventListener(
        "afterprint",
        () => document.body.classList.remove("printing-report"),
        { once: true },
      );
      window.print();
    };
    $("#download-report").onclick = () => {
      const content = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reporte RS-${esc(r.id)} · Grúas Rhino</title><style>body{font:16px/1.6 Arial,sans-serif;color:#25374b;max-width:850px;margin:40px auto;padding:25px}header{display:flex;justify-content:space-between;border-bottom:3px solid #d3ae5d;padding-bottom:20px}header strong{font-size:25px}header span{display:block}h1{font-size:27px}h2{font-size:18px}dt,footer{color:#708090}dd{margin:0}dl{display:grid;grid-template-columns:1fr 1fr;gap:20px}section{border-top:1px solid #dce4e8;padding:15px 0}li{display:flex;justify-content:space-between}footer{border-top:1px solid #dce4e8;padding-top:20px;font-size:13px}.report-status{margin:20px 0;color:#957231;font-size:13px}@media print{body{margin:0;padding:0}}</style>${reportMarkup(r)}</html>`;
      const url = URL.createObjectURL(
        new Blob([content], { type: "text/html;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reporte-Rhino-${r.id}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      notify("Reporte preparado. Revisa las descargas del navegador.");
    };
    $("#edit-report-record").onclick = () => recordDialog(r.id);
    if ($("#close-report-service"))
      $("#close-report-service").onclick = () => closeServiceDialog(r.id);
  }
  function closeServiceDialog(id) {
    const r = record(id);
    showDialog(
      `<div class="dialog-heading"><h2>Cerrar servicio ${esc(r.id)}</h2>${closeButton()}</div><form id="close-service-form"><p class="current-stock">${r.crane} · ${esc(r.concept)}</p><label>Observaciones<textarea name="observations" required maxlength="600" rows="3">${esc(r.observations || "")}</textarea></label>${r.type === "Mantenimiento" ? `<label>Horas de mantenimiento<input type="number" name="serviceHours" min="0.1" step="0.1" value="${r.serviceHours || ""}" required></label>` : ""}<label>Materiales usados (o escribe «Sin materiales»)<textarea name="materialsText" rows="2" required maxlength="600">${esc(r.materialsText || "")}</textarea></label><p class="field-help">Cerrar el servicio completa su reporte. No modifica ingresos, gastos ni descuenta inventario otra vez.</p><p class="form-error" role="alert"></p><div class="dialog-actions"><button class="button primary">Confirmar cierre</button></div></form>`,
    );
    $("#close-service-form").onsubmit = (e) => {
      e.preventDefault();
      if (r.closed === true) return;
      const data = Object.fromEntries(new FormData(e.target));
      if (!data.observations.trim() || !data.materialsText.trim()) {
        e.target.querySelector(".form-error").textContent =
          "Completa observaciones y materiales.";
        return;
      }
      r.observations = data.observations.trim();
      r.materialsText = data.materialsText.trim();
      if (data.serviceHours) r.serviceHours = +data.serviceHours;
      r.closed = true;
      render();
      reportDialog(id);
      notify("Servicio cerrado. Reporte listo para compartir.");
    };
  }
  function recordFields(r) {
    return `<div class="report-fields"><label>Observaciones del servicio<textarea name="observations" rows="2" maxlength="600">${esc(r.observations || "")}</textarea></label><label>Materiales usados / notas de materiales<textarea name="materialsText" rows="2" maxlength="600">${esc(r.materialsText || "")}</textarea></label>${r.type === "Mantenimiento" ? `<label>Horas de mantenimiento (si se conocen)<input type="number" name="serviceHours" min="0.1" step="0.1" value="${r.serviceHours || ""}"></label>` : ""}</div>`;
  }
  function voiceCard() {
    const created = state.events.find((e) => e.sourceId === voiceExample.id);
    return `<section class="voice-card"><div class="voice-card-heading"><span class="assistant-avatar">${icon("chat")}</span><div><p class="eyebrow">NOTA DE VOZ POR WHATSAPP</p><h3>De una nota a tu calendario</h3></div></div><span class="voice-demo-label">Transcripción de ejemplo · sin reproducción de audio</span><blockquote>“${voiceExample.transcript}”</blockquote>${created ? `<div class="voice-created">${icon("check")}Evento creado: ${esc(created.title)}<small>${dateText(created.date)} · ${created.time} · ${created.crane}</small></div><button class="button" data-calendar-event="${created.id}">Ver evento en calendario ${icon("arrow")}</button>` : `<button class="button" data-voice>${icon("spark")} ${state.voiceInterpreted ? "Revisar datos interpretados" : "Interpretar nota de ejemplo"}</button>`}<p class="voice-disclaimer">Simulación de interpretación, sin conexión a WhatsApp ni procesamiento real. En la propuesta, el asistente interpreta audios y solicita confirmar los datos antes de crear el evento.</p></section>`;
  }
  function voiceDialog() {
    const existing = state.events.find((e) => e.sourceId === voiceExample.id);
    if (existing) {
      openCalendarEvent(existing.id);
      return;
    }
    state.voiceInterpreted = true;
    eventForm({ ...voiceExample }, true);
  }
  const eventClass = (e) =>
    ({
      Reserva: "reservation",
      "En operación": "operation",
      Mantenimiento: "maintenance",
      Taller: "workshop",
      Traslado: "transfer",
      Pendiente: "pending",
    })[e.kind] || "pending";
  function eventForm(draft = {}, fromVoice = false) {
    const isEdit = state.events.some((e) => e.id === draft.id);
    const d = {
      title: "",
      crane: state.fleet[0].id,
      place: "",
      date: state.selectedDate,
      time: "08:00",
      details: "",
      kind: "Reserva",
      operator: "",
      client: "",
      ...draft,
    };
    if (fromVoice) d.kind = "Mantenimiento";
    showDialog(
      `<div class="dialog-heading"><div><p class="eyebrow">${fromVoice ? "NOTA DE VOZ · REVISAR DATOS" : "AGENDA DE OPERACIÓN"}</p><h2>${isEdit ? "Editar evento" : fromVoice ? "Confirma el mantenimiento" : "Programar evento"}</h2></div>${closeButton()}</div><form id="event-form"><div class="form-grid"><label>Tipo<select name="kind">${eventKinds.map((k) => `<option ${k === d.kind ? "selected" : ""}>${k}</option>`).join("")}</select></label><label>Grúa<select name="crane">${state.fleet.map((f) => `<option value="${f.id}" ${f.id === d.crane ? "selected" : ""}>${f.id} · ${esc(f.name)}</option>`).join("")}</select></label></div><label>Evento / trabajo<input name="title" value="${esc(d.title)}" required maxlength="100"></label><div class="form-grid"><label>Fecha de inicio<input type="date" name="date" value="${d.date}" required></label><label>Hora de inicio<input type="time" name="time" value="${d.time}" required></label><label>Fecha de fin<input type="date" name="endDate" value="${d.endDate || d.date}" required></label><label>Hora de fin<input type="time" name="endTime" value="${d.endTime || d.time}" required></label><label>Ubicación<input name="place" value="${esc(d.place)}" required maxlength="120"></label><label>Cliente / proyecto (opcional)<input name="client" value="${esc(d.client)}" maxlength="120"></label><label class="full-span">Operador / responsable (opcional)<input name="operator" value="${esc(d.operator)}" maxlength="100"></label></div><label>Detalles<textarea name="details" rows="3" maxlength="600" required>${esc(d.details)}</textarea></label><p class="field-help">${fromVoice ? "Revisa los datos interpretados antes de crear el evento." : "Programación manual de ejemplo; verifica disponibilidad antes de asignar."} Hora local de la operación.</p><p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" data-close>Cancelar</button><button class="button primary">${isEdit ? "Guardar cambios" : "Confirmar y crear evento"}</button></div></form>`,
    );
    let submitted = false;
    $("#event-form").onsubmit = (e) => {
      e.preventDefault();
      if (submitted) return;
      try {
        const value = prepareEvent(
          state.events,
          Object.fromEntries(new FormData(e.target)),
          state.fleet,
          fromVoice ? voiceExample.id : d.sourceId,
          isEdit ? d.id : undefined,
        );
        let ev;
        if (isEdit) {
          ev = state.events.find((v) => v.id === d.id);
          Object.assign(ev, value);
        } else {
          const rid = Date.now();
          ev = {
            ...value,
            id: "evento-" + crypto.randomUUID(),
            reminderId: rid,
            done: false,
          };
          state.events.push(ev);
          state.reminders.push({ id: rid, done: false });
        }
        if (ev.reminderId) {
          const reminder = state.reminders.find((r) => r.id === ev.reminderId);
          Object.assign(reminder, {
            title: ev.title,
            detail: ev.crane + " · " + ev.place,
            date: dateText(ev.date) + " · " + ev.time,
          });
        }
        submitted = true;
        state.calendarMonth = ev.date.slice(0, 7);
        state.selectedDate = ev.date;
        state.chat.push({
          role: "assistant",
          text: `${isEdit ? "Actualicé" : "Creé"} «${ev.title}»: ${ev.crane}, ${dateText(ev.date)} a las ${ev.time}. Ya aparece en el calendario de esta visita.`,
        });
        $("#modal").close();
        render();
        notify(
          isEdit
            ? "Evento actualizado."
            : "Evento confirmado en el calendario.",
        );
      } catch (err) {
        e.target.querySelector(".form-error").textContent = err.message;
      }
    };
  }
  function calendarView() {
    const [year, month] = state.calendarMonth.split("-").map(Number),
      first = new Date(year, month - 1, 1),
      offset = (first.getDay() + 6) % 7,
      days = new Date(year, month, 0).getDate(),
      total = Math.ceil((offset + days) / 7) * 7;
    const filtered = state.events.filter(
      (e) => state.calendarKind === "Todos" || e.kind === state.calendarKind,
    );
    const onDate = filtered
      .filter((e) => occursOn(e, state.selectedDate))
      .sort((a, b) => a.time.localeCompare(b.time));
    const upcoming = filtered
      .filter(
        (e) => !eventDone(e) && (e.endDate || e.date) >= state.selectedDate,
      )
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return `<div class="calendar-actions"><div class="calendar-legend">${eventKinds.map((k) => `<span><i class="event-dot ${eventClass({ kind: k })}"></i>${k}</span>`).join("")}</div><button class="button primary" data-new-event>${icon("plus")} Nuevo evento</button></div><div class="calendar-filter"><label>Mostrar<select id="calendar-kind"><option>Todos</option>${eventKinds.map((k) => `<option ${state.calendarKind === k ? "selected" : ""}>${k}</option>`).join("")}</select></label><span>${filtered.length} eventos de ejemplo y de esta visita</span></div><div class="calendar-layout"><section class="panel calendar-panel"><div class="calendar-toolbar"><h2>${monthText(state.calendarMonth)}</h2><div><button class="icon-btn" data-month="-1" aria-label="Mes anterior">${icon("back")}</button><button class="button secondary" data-month="demo">Semana demo</button><button class="icon-btn" data-month="1" aria-label="Mes siguiente">${icon("arrow")}</button></div></div><div class="calendar-grid"><div class="calendar-weekdays">${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => `<span>${d}</span>`).join("")}</div><div class="calendar-days">${Array.from(
      { length: total },
      (_, i) => {
        const n = i - offset + 1;
        if (n < 1 || n > days)
          return '<span class="calendar-empty" aria-hidden="true"></span>';
        const date = state.calendarMonth + "-" + String(n).padStart(2, "0"),
          events = filtered.filter((e) => occursOn(e, date));
        return `<button class="calendar-day ${date === state.selectedDate ? "selected" : ""} ${events.length ? "has-events" : ""}" data-day="${date}" aria-label="${dateText(date)}, ${events.length} ${events.length === 1 ? "evento" : "eventos"}" aria-pressed="${date === state.selectedDate}"><b>${n}</b><span class="day-dots">${events
          .slice(0, 5)
          .map(
            (e) =>
              `<i class="event-dot ${eventClass(e)} ${eventDone(e) ? "done" : ""}"></i>`,
          )
          .join(
            "",
          )}</span>${events.length ? `<span class="day-count">${events.length} evento${events.length === 1 ? "" : "s"}</span>` : ""}</button>`;
      },
    ).join(
      "",
    )}</div></div><p class="panel-note">Selecciona un día para ver las asignaciones y los trabajos programados.</p></section><section class="panel day-agenda"><div class="panel-heading"><div><p class="eyebrow">DÍA SELECCIONADO · ${onDate.length} ${onDate.length === 1 ? "EVENTO" : "EVENTOS"}</p><h2>${dateText(state.selectedDate)}</h2></div></div>${onDate.length ? onDate.map(eventCard).join("") : '<div class="executive-empty">No hay eventos con este filtro en el día seleccionado.</div>'}</section></div><section class="panel upcoming-events"><div class="panel-heading"><div><p class="eyebrow">DESDE EL DÍA SELECCIONADO</p><h2>Próximos en la agenda</h2></div><a href="#propuesta-3/assistant" class="text-link">Crear desde nota de voz ${icon("arrow")}</a></div>${upcoming.length ? upcoming.slice(0, 12).map(eventCard).join("") : '<div class="executive-empty">No hay eventos pendientes a partir de este día.</div>'}${upcoming.length > 12 ? `<p class="panel-note">Mostrando los siguientes 12 de ${upcoming.length}. Selecciona fechas posteriores para seguir explorando.</p>` : ""}</section>`;
  }
  function eventCard(e) {
    return `<article class="event-card event-${eventClass(e)}"><div class="event-time"><b>${e.time}${e.endTime && e.endTime !== e.time ? "–" + e.endTime : ""}</b><span>${dateText(e.date)}</span>${e.endDate && e.endDate !== e.date ? `<small>Hasta ${dateText(e.endDate)}</small>` : ""}</div><div><span class="event-kind ${eventClass(e)}">${eventDone(e) ? "Completado · " : ""}${esc(e.kind)}</span><h3>${esc(e.title)}</h3><p>${esc(e.crane)} · ${esc(e.place)}</p>${e.operator ? `<small>${esc(e.operator)}</small>` : ""}</div><button class="icon-btn" data-event="${e.id}" aria-label="Ver evento ${esc(e.title)}">${icon("arrow")}</button></article>`;
  }
  function eventDialog(id) {
    const ev = state.events.find((e) => e.id === id);
    if (!ev) return;
    showDialog(
      `<div class="dialog-heading"><div><p class="eyebrow">${esc(ev.kind)}</p><h2>${esc(ev.title)}</h2></div>${closeButton()}</div><div class="event-detail"><span class="event-kind ${eventClass(ev)}">${eventDone(ev) ? "Completado" : ev.kind}</span><h3>${dateText(ev.date)} · ${ev.time}</h3>${ev.endTime ? `<p>Fin: ${dateText(ev.endDate || ev.date)} · ${ev.endTime}</p>` : ""}<p>${esc(ev.crane)} · ${esc(ev.place)}</p><p>${esc(ev.operator || "Responsable por asignar")}${ev.client ? " · " + esc(ev.client) : ""}</p><p>${esc(ev.details)}</p><small>${ev.sourceId ? "Creado tras confirmar una nota de voz de ejemplo." : "Evento de demostración guardado solo durante esta visita."}</small></div><div class="dialog-actions"><button class="button secondary" id="edit-event">Editar evento</button><button class="button primary" id="toggle-event">${eventDone(ev) ? "Marcar pendiente" : "Marcar completado"}</button></div>`,
    );
    $("#edit-event").onclick = () => eventForm(ev);
    $("#toggle-event").onclick = () => {
      const reminder = state.reminders.find((r) => r.id === ev.reminderId);
      if (reminder) reminder.done = !reminder.done;
      else ev.done = !ev.done;
      render();
      eventDialog(id);
    };
  }
  function openCalendarEvent(id) {
    const ev = state.events.find((e) => e.id === id);
    if (!ev) return;
    state.calendarMonth = ev.date.slice(0, 7);
    state.selectedDate = ev.date;
    $("#modal").close();
    nav(3, "calendar");
    render();
  }
  function reminderLink(id) {
    const ev = state.events.find((e) => e.reminderId === id);
    return ev
      ? `<button class="reminder-calendar-link" data-calendar-event="${ev.id}">Ver en calendario ${icon("arrow")}</button>`
      : "";
  }
  function reply(kind) {
    if (kind === "compras") {
      const rows = list();
      return rows.length
        ? `Para recuperar los mínimos del inventario:\n\n${rows.map((i) => `• ${num(i.missing)} ${i.unit} de ${i.name.toLowerCase()} (actual: ${num(i.quantity)}; mínimo: ${num(i.min)}).`).join("\n")}\n\nEs una lista sugerida, no una compra realizada.`
        : "Todos los insumos alcanzan sus mínimos. No hay cantidades por reponer en la lista automática.";
    }
    if (kind === "agenda")
      return (
        state.events
          .filter((e) => !eventDone(e))
          .map(
            (e) =>
              `${dateText(e.date)} · ${e.time}\n${e.crane}: ${e.title}\n${e.place}`,
          )
          .join("\n\n") || "No tienes eventos pendientes."
      );
    return (
      attention()
        .map(
          (i) =>
            `${i.crane} · ${i.title}\n${i.reasons.map((r) => r.text).join(" ")}`,
        )
        .join("\n\n") || "No hay asuntos que requieran atención."
    );
  }
  function quoteView() {
    const plan = plans[(state.plan || state.quotePlan) - 1],
      selected = state.extras.filter((e) => e.selected),
      sum = selected.reduce((s, e) => s + e.price, 0);
    return `<section class="quote-section" id="opciones-adicionales"><div class="quote-heading"><div><p class="eyebrow">PERSONALIZA TU PROPUESTA</p><h2>Opcionales con costos</h2><p>Precios de ejemplo · pendientes de confirmar</p></div><label>Propuesta base<select id="quote-plan">${plans.map((p) => `<option value="${p.id}" ${p.id === plan.id ? "selected" : ""}>${p.id}. ${p.title}</option>`).join("")}</select></label></div><div class="quote-layout"><div><div class="optional-grid">${state.extras.map((e) => `<label class="optional-item ${e.selected ? "chosen" : ""}"><input type="checkbox" data-extra="${e.id}" ${e.selected ? "checked" : ""}><span><b>${e.title}</b><small>${e.description}</small><strong>${money(e.price)} MXN</strong></span></label>`).join("")}</div><details class="quote-config"><summary>Configurar importes de ejemplo</summary><form id="extra-price-form"><p>Estos valores editables no son precios aprobados ni estimaciones de mercado.</p>${state.extras.map((e) => `<label>${e.title} (MXN)<input type="number" name="${e.id}" min="0" max="1000000000" step="1" required value="${e.price}"></label>`).join("")}<p class="form-error" role="alert"></p><button class="button secondary">Guardar importes</button></form></details></div><aside class="quote-summary"><p class="eyebrow">RESUMEN DE DESARROLLO</p><h3>${plan.title}</h3><dl><div><dt>Precio base aprobado</dt><dd>${money(plan.price)}</dd></div>${selected.map((e) => `<div><dt>${e.title}</dt><dd>${money(e.price)}</dd></div>`).join("")}<div><dt>Opcionales seleccionados</dt><dd>${money(sum)}</dd></div></dl><div class="quote-total"><span>Total estimado</span><strong>${money(plan.price + sum)}</strong><small>MXN · pago único de desarrollo</small></div><div class="quote-monthly"><span>Mensualidad por separado</span><b>${plan.monthly}</b><p>${plan.id === 3 ? "Según consumo de inteligencia artificial; sin cuota fija definida." : "Mensualidad de la propuesta base."}</p></div><p class="quote-note">Opcionales pendientes de confirmar. ${selected.some((e) => e.id === "gps") ? "Equipos GPS y cuotas del proveedor se cotizan aparte. " : ""}El plazo base es ${plan.term.toLowerCase()}${plan.id === 3 ? ", según alcance final" : ""}; el impacto de los opcionales se definirá al confirmar el alcance.</p></aside></div><p class="quote-included">La propuesta 3 ya incluye compras sugeridas, reportes, bandeja de atención, calendario visible e interpretación de notas de voz con confirmación. No se cobran nuevamente como extras. Los opcionales mostrados son alcances cotizables, no módulos funcionales de esta demo.</p></section>`;
  }
  function bind() {
    if ($("#calendar-kind"))
      $("#calendar-kind").onchange = (e) => {
        state.calendarKind = e.target.value;
        render();
      };
    document
      .querySelectorAll("[data-new-event]")
      .forEach((b) => (b.onclick = () => eventForm()));
    document
      .querySelectorAll("[data-report]")
      .forEach((b) => (b.onclick = () => reportDialog(b.dataset.report)));
    document
      .querySelectorAll("[data-open-order]")
      .forEach((b) => (b.onclick = () => serviceDialog(b.dataset.openOrder)));
    document.querySelectorAll("[data-attention-filter]").forEach(
      (b) =>
        (b.onclick = () => {
          state.attentionFilter = b.dataset.attentionFilter;
          render();
        }),
    );
    document
      .querySelectorAll("[data-voice]")
      .forEach((b) => (b.onclick = voiceDialog));
    document
      .querySelectorAll("[data-event]")
      .forEach((b) => (b.onclick = () => eventDialog(b.dataset.event)));
    document
      .querySelectorAll("[data-calendar-event]")
      .forEach(
        (b) => (b.onclick = () => openCalendarEvent(b.dataset.calendarEvent)),
      );
    document.querySelectorAll("[data-day]").forEach(
      (b) =>
        (b.onclick = () => {
          state.selectedDate = b.dataset.day;
          render();
        }),
    );
    document.querySelectorAll("[data-month]").forEach(
      (b) =>
        (b.onclick = () => {
          if (b.dataset.month === "demo") {
            state.calendarMonth = "2026-09";
            state.selectedDate = "2026-09-25";
          } else {
            const [y, m] = state.calendarMonth.split("-").map(Number),
              d = new Date(y, m - 1 + Number(b.dataset.month), 1);
            state.calendarMonth =
              d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
            state.selectedDate = state.calendarMonth + "-01";
          }
          render();
        }),
    );
    document.querySelectorAll("[data-extra]").forEach(
      (b) =>
        (b.onchange = () => {
          state.extras.find((e) => e.id === b.dataset.extra).selected =
            b.checked;
          render();
        }),
    );
    if ($("#quote-plan"))
      $("#quote-plan").onchange = (e) => {
        state.quotePlan = +e.target.value;
        if (state.plan) nav(state.quotePlan, "quote");
        else render();
      };
    if ($("#extra-price-form"))
      $("#extra-price-form").onsubmit = (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        if (
          state.extras.some(
            (x) => !Number.isFinite(+d[x.id]) || +d[x.id] < 0 || +d[x.id] > 1e9,
          )
        ) {
          e.target.querySelector(".form-error").textContent =
            "Usa importes válidos, mayores o iguales a cero.";
          return;
        }
        state.extras.forEach((x) => (x.price = +d[x.id]));
        render();
        notify("Importes de ejemplo actualizados.");
      };
  }
  return {
    view: (name) =>
      ({
        shopping: shoppingView,
        reports: reportsView,
        attention: attentionView,
        calendar: calendarView,
        quote: quoteView,
      })[name](),
    bind,
    voiceCard,
    recordFields,
    overviewLinks,
    shoppingSummary,
    reply,
    reminderLink,
    quoteView,
  };
}
