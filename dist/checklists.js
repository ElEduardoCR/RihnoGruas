import {
  checklistTypes,
  checklistItems,
  validateInspection,
} from "./checklist-model.js";
const labels = {
  ok: "Sin observación",
  issue: "Con observación",
  na: "No aplica",
};
export function createChecklists(api) {
  const {
    state,
    esc,
    icon,
    num,
    render,
    notify,
    nav,
    showDialog,
    closeButton,
  } = api;
  state.inspections = [];
  state.checklistDraft = null;
  const $ = (s) => document.querySelector(s);
  const steps = [
    "Selecciona la grúa",
    "Lectura del horómetro",
    "Revisión por puntos",
    "Fotos y observaciones",
    "Revisa y guarda",
  ];
  const photo = (f, cls = "", linked = true) =>
    f.photo
      ? `<figure class="crane-photo ${cls}"><img src="${esc(f.photo)}" alt="Foto de referencia de grúa ${esc(f.family || "móvil")}" loading="lazy"><figcaption>${f.family === "Industrial" ? "Referencia · Iron Fairy" : "Foto de referencia"}${linked ? ' · <a href="./creditos.html" target="_blank" rel="noopener">Créditos</a>' : ""}</figcaption></figure>`
      : `<div class="crane-photo no-photo">${icon("fleet")}<span>Equipo sin foto de referencia</span></div>`;
  function start(id) {
    if (!state.checklistDraft) {
      const f = state.fleet.find((f) => f.id === id);
      state.checklistDraft = {
        step: 1,
        type: checklistTypes[0],
        crane: f?.id || "",
        meter: f?.meterHours ?? "",
        operator: f?.operator || "",
        place: f?.place || "",
        date: "2026-09-25",
        answers: {},
        notes: "",
        photos: [],
        confirmed: false,
        query: "",
      };
    }
    nav(state.plan, "checklists");
    render();
  }
  function photos(d, category) {
    const ps = d.photos.filter((p) => !category || p.category === category);
    return ps.length
      ? `<div class="evidence-grid">${ps.map((p) => `<figure><a href="${p.url}" target="_blank" rel="noopener"><img src="${p.url}" alt="Evidencia: ${esc(p.name)}"></a><figcaption><b>${p.category === "meter" ? "Horómetro" : "Revisión"}</b><span>${esc(p.name)}</span><button type="button" class="text-link" data-remove-photo="${p.id}">Quitar foto</button></figcaption></figure>`).join("")}</div>`
      : "";
  }
  function upload(category) {
    return `<label class="upload-box">${icon("plus")}<b>${category === "meter" ? "Agregar foto del horómetro" : "Agregar fotos de la revisión"}</b><span>JPG, PNG o WebP · hasta 8 MB por foto · máximo 6 en total</span><input type="file" data-photo-upload="${category}" accept="image/jpeg,image/png,image/webp" ${category === "meter" ? "" : "multiple"}></label><p class="field-help">Las fotos se quedan en esta página. Se borran al recargar.</p>`;
  }
  function view() {
    const d = state.checklistDraft;
    if (!d)
      return `<section class="inspection-intro"><div><p class="eyebrow">CAPTURA GUIADA · EQUIPO A EQUIPO</p><h2>Una revisión, paso a paso.</h2><p>Selecciona la grúa, registra su horómetro y documenta cada punto con observaciones y fotos.</p><button class="button primary" data-new-checklist>${icon("plus")} Iniciar checklist</button></div><ol>${steps.map((s, i) => `<li><span>0${i + 1}</span>${s}</li>`).join("")}</ol></section><section class="panel"><div class="panel-heading"><div><p class="eyebrow">ESTA VISITA</p><h2>Checklists capturados</h2></div><span class="stock-count">${state.inspections.length} ${state.inspections.length === 1 ? "registro" : "registros"}</span></div>${
        state.inspections.length
          ? `<div class="inspection-list">${[...state.inspections]
              .reverse()
              .map(
                (r) =>
                  `<article><div><span class="status ${r.needsReview ? "maintenance" : "working"}">${r.needsReview ? "Requiere revisión" : "Captura completa"}</span><h3>${esc(r.crane)} · ${esc(r.type)}</h3><p>${esc(r.operator)} · ${r.date} · ${num(r.meter)} h · ${r.photos.length} ${r.photos.length === 1 ? "foto" : "fotos"}</p></div><button class="button secondary" data-inspection="${r.id}">Ver checklist ${icon("arrow")}</button></article>`,
              )
              .join("")}</div>`
          : '<div class="executive-empty">Aún no hay checklists en esta visita. Prueba capturar la primera revisión.</div>'
      }</section><p class="workspace-note">Plantilla de demostración. La revisión real debe seguir el manual del equipo y el procedimiento de la empresa; guardar una captura no autoriza operar la grúa.</p>`;
    const f = state.fleet.find((f) => f.id === d.crane);
    let body = "";
    if (d.step === 1) {
      const shown = state.fleet.filter((f) =>
        `${f.id} ${f.name} ${f.family}`
          .toLowerCase()
          .includes(d.query.toLowerCase()),
      );
      body = `<label>Tipo de checklist<select name="type">${checklistTypes.map((t) => `<option ${t === d.type ? "selected" : ""}>${t}</option>`).join("")}</select></label><label>Buscar equipo<input id="checklist-search" placeholder="Número, modelo o tipo de grúa…" value="${esc(d.query)}"></label><div class="crane-picker">${shown.map((f) => `<button type="button" class="crane-choice ${f.id === d.crane ? "chosen" : ""}" data-pick-crane="${f.id}" aria-pressed="${f.id === d.crane}">${photo(f, "", false)}<span><small>${f.id} · ${esc(f.family || "Equipo")}</small><b>${esc(f.name)}</b><em>${esc(f.capacity)} · ${num(f.meterHours || 0)} h</em><span class="status ${f.status === "En operación" ? "working" : f.status === "Disponible" ? "available" : "maintenance"}">${esc(f.status)}</span></span>${f.id === d.crane ? '<strong class="selection-check">✓</strong>' : ""}</button>`).join("") || "<p>No hay equipos con esa búsqueda.</p>"}</div>`;
    }
    if (d.step === 2)
      body = `<div class="meter-layout">${photo(f)}<div><div class="meter-current"><span>Horómetro registrado</span><strong>${num(f.meterHours || 0)} <small>h</small></strong><p>${esc(f.id)} · ${esc(f.name)}</p></div><label>Lectura actual del horómetro (h)<input name="meter" type="number" min="${f.meterHours || 0}" max="999999" step="0.1" required value="${d.meter}"></label><p class="field-help">Lectura acumulada del equipo; independiente de las horas facturables.</p></div></div><div class="form-grid"><label>Responsable de la captura<input name="operator" required maxlength="100" value="${esc(d.operator)}"></label><label>Fecha<input name="date" type="date" required value="${d.date}"></label><label class="full-span">Ubicación / proyecto<input name="place" required maxlength="150" value="${esc(d.place)}"></label></div>${upload("meter")}${photos(d, "meter")}`;
    if (d.step === 3)
      body = `<p class="inspection-guidance">Registra lo observado siguiendo el manual y el procedimiento del equipo. Cada punto necesita una respuesta.</p><div class="checklist-progress"><b>${Object.keys(d.answers).length} de ${checklistItems(f, d.type).length} respondidos</b><span>Los hallazgos quedarán pendientes de revisión.</span></div><div class="inspection-points">${checklistItems(
        f,
        d.type,
      )
        .map(
          (i, n) =>
            `<fieldset><legend><span>${String(n + 1).padStart(2, "0")}</span>${i.title}</legend><p>${i.detail}</p><div class="answer-options">${Object.entries(
              labels,
            )
              .map(
                ([v, l]) =>
                  `<label class="${d.answers[i.id] === v ? "chosen " + v : ""}"><input type="radio" name="answer-${i.id}" value="${v}" ${d.answers[i.id] === v ? "checked" : ""} required>${l}</label>`,
              )
              .join("")}</div></fieldset>`,
        )
        .join("")}</div>`;
    if (d.step === 4)
      body = `<label>Observaciones y seguimiento ${Object.values(d.answers).includes("issue") ? "(obligatorio)" : "(opcional)"}<textarea name="notes" rows="5" maxlength="1500" placeholder="Describe lo observado, ubicación del hallazgo y seguimiento requerido…">${esc(d.notes)}</textarea></label>${Object.values(d.answers).includes("issue") ? '<p class="inspection-warning">Hay puntos con observaciones. Al guardar se creará un pendiente de revisión para este equipo.</p>' : ""}${upload("review")}${photos(d)}<p class="field-help">Las fotos son opcionales en esta demo. Puedes volver para agregar o quitar evidencias antes de guardar.</p>`;
    if (d.step === 5)
      body = `${summary(d, f)}<label class="inspection-confirm"><input type="checkbox" name="confirmed" ${d.confirmed ? "checked" : ""}>Revisé la lectura, las respuestas y las evidencias de esta captura.</label><p class="field-help">Guardar registra la inspección y actualiza el horómetro. No cierra mantenimientos ni descuenta inventario.</p>`;
    return `<div class="inspection-workspace"><aside class="inspection-steps"><p class="eyebrow">TU CHECKLIST</p><h2>${esc(d.type)}</h2><ol>${steps.map((s, i) => `<li class="${d.step === i + 1 ? "current" : d.step > i + 1 ? "complete" : ""}" ${d.step === i + 1 ? 'aria-current="step"' : ""}><span>${d.step > i + 1 ? "✓" : i + 1}</span>${s}</li>`).join("")}</ol>${f ? `<div class="selected-equipment"><b>${f.id}</b><span>${esc(f.name)}</span><small>${esc(f.family || "Equipo")}</small></div>` : ""}<button class="text-link" data-cancel-checklist>Descartar captura</button><p>Datos temporales.<br>Se reinician al recargar.</p></aside><section class="panel inspection-body"><div class="inspection-heading"><p class="eyebrow">PASO ${d.step} DE 5</p><h2>${steps[d.step - 1]}</h2></div><form id="inspection-form">${body}<p class="form-error" id="inspection-error" role="alert"></p><div class="inspection-actions">${d.step > 1 ? `<button type="button" class="button secondary" data-checklist-back>${icon("back")} Anterior</button>` : "<span></span>"}<button class="button primary" id="inspection-next">${d.step === 5 ? "Guardar checklist" : "Continuar"} ${icon(d.step === 5 ? "check" : "arrow")}</button></div></form></section></div>`;
  }
  function summary(d, f) {
    const needs = Object.values(d.answers).includes("issue");
    return `<div class="inspection-summary"><span class="status ${needs ? "maintenance" : "working"}">${needs ? "Requiere revisión de hallazgos" : "Captura sin observaciones reportadas"}</span><div class="inspection-summary-top">${photo(f)}<div><h3>${esc(f.id)} · ${esc(f.name)}</h3><p>${esc(d.type)}</p><strong>${num(+d.meter)} h</strong><p>${esc(d.operator)} · ${d.date}</p><p>${esc(d.place)}</p></div></div><dl>${checklistItems(
      f,
      d.type,
    )
      .map(
        (i) =>
          `<div><dt>${i.title}</dt><dd class="answer-${d.answers[i.id]}">${labels[d.answers[i.id]] || "Pendiente"}</dd></div>`,
      )
      .join(
        "",
      )}</dl><h3>Observaciones</h3><p class="preserve-lines">${esc(d.notes || "Sin observaciones adicionales.")}</p><h3>Evidencias · ${d.photos.length}</h3>${d.photos.length ? `<div class="evidence-grid">${d.photos.map((p) => `<figure><a href="${p.url}" target="_blank" rel="noopener"><img src="${p.url}" alt="${esc(p.name)}"></a><figcaption>${p.category === "meter" ? "Horómetro" : "Revisión"} · ${esc(p.name)}</figcaption></figure>`).join("")}</div>` : "<p>No se adjuntaron fotos.</p>"}</div>`;
  }
  function capture() {
    const form = $("#inspection-form"),
      d = state.checklistDraft;
    if (!form || !d) return;
    const data = Object.fromEntries(new FormData(form));
    for (const k of ["type", "meter", "operator", "date", "place", "notes"])
      if (k in data) d[k] = data[k];
    if (d.step === 5) d.confirmed = !!data.confirmed;
  }
  function error(message) {
    const el = $("#inspection-error");
    if (el) {
      el.textContent = message;
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
  function inspect(id) {
    const r = state.inspections.find((r) => r.id === id);
    if (!r) return;
    showDialog(
      `<div class="dialog-heading"><div><p class="eyebrow">${esc(r.id)} · GUARDADO EN ESTA VISITA</p><h2>Detalle del checklist</h2></div>${closeButton()}</div>${summary(r, r.equipment)}<p class="field-help">Captura de demostración; no representa una autorización para operar.</p>`,
      "wide",
    );
  }
  function bind() {
    document
      .querySelectorAll("[data-new-checklist]")
      .forEach((b) => (b.onclick = () => start(b.dataset.newChecklist)));
    document
      .querySelectorAll("[data-inspection]")
      .forEach((b) => (b.onclick = () => inspect(b.dataset.inspection)));
    if (!$("#inspection-form")) return;
    const d = state.checklistDraft;
    $("#inspection-form").oninput = capture;
    const type = $('[name="type"]');
    if (type)
      type.onchange = () => {
        capture();
        d.answers = {};
        render();
      };
    const search = $("#checklist-search");
    if (search)
      search.oninput = (e) => {
        const pos = e.target.selectionStart;
        d.query = e.target.value;
        render();
        $("#checklist-search").focus();
        $("#checklist-search").setSelectionRange(pos, pos);
      };
    document.querySelectorAll("[data-pick-crane]").forEach(
      (b) =>
        (b.onclick = () => {
          if (d.crane !== b.dataset.pickCrane) {
            const f = state.fleet.find((f) => f.id === b.dataset.pickCrane);
            d.photos.forEach((p) => URL.revokeObjectURL(p.url));
            Object.assign(d, {
              crane: f.id,
              meter: f.meterHours || 0,
              operator: f.operator,
              place: f.place,
              answers: {},
              photos: [],
              notes: "",
              confirmed: false,
            });
          }
          render();
        }),
    );
    document.querySelectorAll('[name^="answer-"]').forEach(
      (input) =>
        (input.onchange = () => {
          d.answers[input.name.slice(7)] = input.value;
          const y = window.scrollY;
          render();
          document
            .querySelector(`[name="${input.name}"][value="${input.value}"]`)
            ?.focus({ preventScroll: true });
          window.scrollTo(0, y);
        }),
    );
    $("[data-cancel-checklist]").onclick = () => {
      d.photos.forEach((p) => URL.revokeObjectURL(p.url));
      state.checklistDraft = null;
      render();
      notify("Captura descartada.");
    };
    if ($("[data-checklist-back]"))
      $("[data-checklist-back]").onclick = () => {
        capture();
        d.step--;
        render();
        window.scrollTo(0, 0);
      };
    document.querySelectorAll("[data-remove-photo]").forEach(
      (b) =>
        (b.onclick = () => {
          capture();
          const p = d.photos.find((p) => p.id === b.dataset.removePhoto);
          URL.revokeObjectURL(p.url);
          d.photos = d.photos.filter((p) => p.id !== b.dataset.removePhoto);
          render();
        }),
    );
    document.querySelectorAll("[data-photo-upload]").forEach(
      (input) =>
        (input.onchange = async () => {
          capture();
          const files = [...input.files],
            craneAtUpload = d.crane,
            category = input.dataset.photoUpload;
          input.disabled = true;
          $("#inspection-next").disabled = true;
          let problem = "";
          for (const file of files) {
            if (d.photos.length >= 6) {
              problem = "Se permiten hasta 6 fotos por checklist.";
              break;
            }
            if (
              !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
              file.size > 8 * 1024 * 1024 ||
              file.size === 0
            ) {
              problem = "Usa imágenes JPG, PNG o WebP de hasta 8 MB.";
              continue;
            }
            const url = URL.createObjectURL(file);
            try {
              const img = new Image();
              img.src = url;
              await img.decode();
              if (state.checklistDraft !== d || d.crane !== craneAtUpload) {
                URL.revokeObjectURL(url);
                return;
              }
              if (d.photos.length >= 6) {
                URL.revokeObjectURL(url);
                problem = "Se permiten hasta 6 fotos por checklist.";
                break;
              }
              d.photos.push({
                id: crypto.randomUUID(),
                url,
                name: file.name,
                category,
                size: file.size,
              });
            } catch {
              URL.revokeObjectURL(url);
              problem = "No se pudo leer una de las imágenes.";
            }
          }
          render();
          if (problem) error(problem);
        }),
    );
    $("#inspection-form").onsubmit = (e) => {
      e.preventDefault();
      capture();
      try {
        const result = validateInspection(d, state.fleet, d.step);
        if (d.step < 5) {
          d.step++;
          render();
          window.scrollTo(0, 0);
          return;
        }
        const id =
          "CK-" + String(state.inspections.length + 1).padStart(3, "0");
        const record = {
          ...d,
          id,
          meter: +d.meter,
          answers: { ...d.answers },
          photos: d.photos.map((p) => ({ ...p })),
          equipment: { ...result.crane },
          needsReview: result.needsReview,
        };
        state.inspections.push(record);
        result.crane.meterHours = +d.meter;
        if (result.needsReview)
          state.reminders.push({
            id: Date.now(),
            title: "Revisar hallazgos · " + id,
            detail: d.crane + " · " + d.notes,
            date: "Por revisar",
            done: false,
            inspectionId: id,
          });
        state.checklistDraft = null;
        render();
        window.scrollTo(0, 0);
        notify("Checklist guardado en esta visita. Horómetro actualizado.");
      } catch (err) {
        error(err.message);
      }
    };
  }
  return { view, bind, start, photo, inspect };
}
