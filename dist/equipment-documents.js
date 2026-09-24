import {
  documentTypes,
  initialDocuments,
  todayISO,
  expiryStatus,
  validateDocument,
} from "./equipment-documents-model.js";
const dateLabel = (date) =>
  date
    ? new Date(date + "T12:00:00").toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Sin registrar";
export function createEquipmentDocuments({
  state,
  esc,
  icon,
  num,
  showDialog,
  closeButton,
  render,
  notify,
}) {
  const $ = (s) => document.querySelector(s);
  state.equipmentDocuments = structuredClone(initialDocuments);
  const documents = (id) => state.equipmentDocuments[id] || [];
  const status = (d) => expiryStatus(d, todayISO());
  const badge = (d) => {
    const s = status(d);
    return `<span class="document-status ${s.key}">${s.label}</span>`;
  };
  const timing = (d) => {
    const s = status(d);
    return s.key === "missing"
      ? "Captura la fecha de vencimiento."
      : s.days === 0
        ? "Vence hoy"
        : s.days < 0
          ? `Venció hace ${Math.abs(s.days)} ${s.days === -1 ? "día" : "días"}`
          : `Vence en ${s.days} ${s.days === 1 ? "día" : "días"}`;
  };
  function summary(f) {
    return `<div class="equipment-docs-summary"><p>DOCUMENTACIÓN DEL EQUIPO</p>${documentTypes
      .map((t) => {
        const docs = documents(f.id)
          .filter((d) => d.type === t.id)
          .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
        const d = docs[0];
        return `<div><span>${t.id === "certification" ? "Certificaciones" : t.id === "municipal" ? "Circulación municipal" : "Seguro"}${docs.length > 1 ? ` <small>(${docs.length})</small>` : ""}</span>${d ? badge(d) : '<span class="document-status missing">Sin registrar</span>'}</div>`;
      })
      .join(
        "",
      )}<button class="button secondary" data-dossier="${esc(f.id)}">${icon("list")} Ver expediente ${icon("arrow")}</button></div>`;
  }
  function overview() {
    const rows = state.fleet.flatMap((f) => documents(f.id));
    const counts = Object.fromEntries(
      ["expired", "soon", "valid"].map((k) => [
        k,
        rows.filter((d) => status(d).key === k).length,
      ]),
    );
    const missing = state.fleet.reduce(
      (n, f) =>
        n +
        documentTypes.filter(
          (t) => !documents(f.id).some((d) => d.type === t.id),
        ).length,
      0,
    );
    return `<section class="document-overview"><div><p class="eyebrow">EXPEDIENTES DE LA FLOTA</p><h2>Documentos y vencimientos</h2><p>Vigencias al ${dateLabel(todayISO())}. Avisos desde 30 días antes de vencer.</p></div><div class="document-counters"><span><b>${counts.valid}</b>Vigentes</span><span class="soon"><b>${counts.soon}</b>Por vencer</span><span class="expired"><b>${counts.expired}</b>Vencidos</span>${missing ? `<span><b>${missing}</b>Sin registrar</span>` : ""}</div></section>`;
  }
  function open(id) {
    const f = state.fleet.find((f) => f.id === id);
    if (!f) return;
    const docs = documents(id);
    showDialog(
      `<div class="dialog-heading"><div><p class="eyebrow">EXPEDIENTE DE LA GRÚA</p><h2>${esc(f.id)} · ${esc(f.name)}</h2></div>${closeButton()}</div><div class="dossier-equipment">${f.photo ? `<figure class="dossier-photo"><img src="${esc(f.photo)}" alt="Foto de referencia de ${esc(f.family || "grúa")}"><figcaption>Foto de referencia</figcaption></figure>` : ""}<div><b>${esc(f.family || "Equipo registrado")} · ${esc(f.capacity)}</b><p>${esc(f.operator)} · ${num(f.meterHours || 0)} h</p><small>${esc(f.place)}</small></div><span class="demo-pill">Datos de ejemplo</span></div><div class="dossier-toolbar"><div><h3>Documentación y vigencias</h3><p>Al ${dateLabel(todayISO())} · Próximos a vencer: 30 días o menos.</p></div><button class="button primary" data-add-document="certification">${icon("plus")} Agregar documento</button></div><div class="dossier-documents">${documentTypes
        .map((t) => {
          const typed = docs.filter((d) => d.type === t.id);
          return `<section class="dossier-group"><div class="dossier-group-heading"><h3>${t.id === "certification" ? "Certificaciones" : t.label}</h3><button class="text-link" data-add-document="${t.id}">Agregar ${icon("plus")}</button></div>${typed.length ? typed.map((d) => `<article class="dossier-document"><div class="document-heading"><h4>${esc(d.title)}</h4>${badge(d)}</div><dl><div><dt>${t.id === "insurance" ? "Póliza" : "Folio / número"}</dt><dd>${esc(d.number)}</dd></div><div><dt>Emisor</dt><dd>${esc(d.issuer)}</dd></div><div><dt>Fecha de emisión</dt><dd>${dateLabel(d.issuedOn)}</dd></div><div class="document-expiry"><dt>Fecha de vencimiento</dt><dd><b>${dateLabel(d.expiresOn)}</b><small>${timing(d)}</small></dd></div></dl>${d.notes ? `<p class="document-notes">${esc(d.notes)}</p>` : ""}<div class="document-footer"><span>${d.attachment ? `<a href="${d.attachment.url}" download="${esc(d.attachment.name)}">${icon("list")} Descargar ${esc(d.attachment.name)}</a>` : "Sin archivo adjunto"}</span><button class="button secondary" data-edit-document="${d.id}">${icon("edit")} Editar documento</button></div></article>`).join("") : `<div class="document-empty">${icon("list")}<p>Aún no se ha registrado ${t.label.toLowerCase()} para esta grúa.</p><button class="button secondary" data-add-document="${t.id}">Registrar documento</button></div>`}</section>`;
        })
        .join(
          "",
        )}</div><p class="field-help dossier-note">Pólizas, folios y certificaciones ficticios para probar el expediente. Los datos y archivos que agregues permanecen en esta visita y se eliminan al recargar.</p>`,
      "wide dossier-dialog",
    );
    $("#modal")
      .querySelectorAll("[data-add-document]")
      .forEach(
        (b) => (b.onclick = () => edit(id, undefined, b.dataset.addDocument)),
      );
    $("#modal")
      .querySelectorAll("[data-edit-document]")
      .forEach((b) => (b.onclick = () => edit(id, b.dataset.editDocument)));
  }
  function edit(craneId, documentId, type = "certification") {
    const existing = documents(craneId).find((d) => d.id === documentId);
    const draft = existing || {
      type,
      title: documentTypes.find((t) => t.id === type).label,
      number: "",
      issuer: "",
      issuedOn: todayISO(),
      expiresOn: "",
      notes: "",
    };
    let attachment = existing?.attachment || null,
      createdURL = null,
      alive = true;
    showDialog(
      `<div class="dialog-heading"><div><p class="eyebrow">EXPEDIENTE · ${esc(craneId)}</p><h2>${existing ? "Editar documento" : "Agregar documento"}</h2></div>${closeButton()}</div><form id="equipment-document-form"><label>Tipo de documento<select name="type">${documentTypes.map((t) => `<option value="${t.id}" ${t.id === draft.type ? "selected" : ""}>${t.label}</option>`).join("")}</select></label><label>Nombre del documento<input name="title" value="${esc(draft.title)}" required maxlength="120"></label><div class="form-grid"><label>Póliza / folio / número<input name="number" value="${esc(draft.number)}" required maxlength="100"></label><label>Emisor / aseguradora / municipio<input name="issuer" value="${esc(draft.issuer)}" required maxlength="160"></label><label>Fecha de emisión<input type="date" name="issuedOn" value="${draft.issuedOn}" required></label><label>Fecha de vencimiento<input type="date" name="expiresOn" value="${draft.expiresOn}" required></label></div><label>Observaciones (opcional)<textarea name="notes" rows="2" maxlength="1000">${esc(draft.notes)}</textarea></label><label class="document-upload">Adjuntar documento (opcional)<input id="document-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"><small>PDF, JPG, PNG o WebP · máximo 10 MB · archivo temporal</small></label><div id="document-attachment"></div><p class="form-error" role="alert"></p><p class="field-help">El estado se calcula con la fecha de vencimiento. Datos y archivo se eliminan al recargar la página.</p><div class="dialog-actions"><button type="button" class="button secondary" id="cancel-document">Volver al expediente</button><button class="button primary" id="save-document">Guardar documento</button></div></form>`,
      "document-editor",
    );
    const modal = $("#modal"),
      form = $("#equipment-document-form");
    const cleanup = () => {
      alive = false;
      if (createdURL) URL.revokeObjectURL(createdURL);
      createdURL = null;
      modal.removeEventListener("close", cleanup);
    };
    modal.addEventListener("close", cleanup, { once: true });
    const showAttachment = () => {
      if (!alive) return;
      $("#document-attachment").innerHTML = attachment
        ? `<div class="document-attachment"><span>${icon("list")} ${esc(attachment.name)}</span><button type="button" class="text-link" id="remove-document-file">Quitar archivo</button></div>`
        : '<p class="field-help">Sin archivo adjunto.</p>';
      if ($("#remove-document-file"))
        $("#remove-document-file").onclick = () => {
          if (createdURL) URL.revokeObjectURL(createdURL);
          createdURL = null;
          attachment = null;
          $("#document-file").value = "";
          showAttachment();
        };
    };
    showAttachment();
    $("#cancel-document").onclick = () => {
      cleanup();
      open(craneId);
    };
    $("#document-file").onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const error = form.querySelector(".form-error"),
        save = $("#save-document");
      error.textContent = "";
      if (
        file.size > 10 * 1024 * 1024 ||
        !file.size ||
        !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
          file.type,
        )
      ) {
        error.textContent =
          "Selecciona un PDF o imagen JPG, PNG o WebP de hasta 10 MB.";
        e.target.value = "";
        return;
      }
      save.disabled = true;
      e.target.disabled = true;
      let url = null;
      try {
        if (
          file.type === "application/pdf" &&
          (await file.slice(0, 5).text()) !== "%PDF-"
        )
          throw new Error("El archivo no es un PDF válido.");
        url = URL.createObjectURL(file);
        if (file.type !== "application/pdf") {
          const img = new Image();
          img.src = url;
          await img.decode();
        }
        if (!alive) {
          URL.revokeObjectURL(url);
          return;
        }
        if (createdURL) URL.revokeObjectURL(createdURL);
        createdURL = url;
        attachment = { name: file.name, type: file.type, size: file.size, url };
        showAttachment();
      } catch {
        if (url) URL.revokeObjectURL(url);
        if (alive) {
          error.textContent =
            "No se pudo leer el documento. Usa un PDF o una imagen válida.";
          e.target.value = "";
        }
      } finally {
        if (alive) {
          save.disabled = false;
          e.target.disabled = false;
        }
      }
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      try {
        const value = validateDocument({
          ...Object.fromEntries(new FormData(form)),
          id: existing?.id || crypto.randomUUID(),
        });
        const next = { ...value, ...(attachment ? { attachment } : {}) };
        const docs = documents(craneId),
          index = docs.findIndex((d) => d.id === documentId);
        if (index >= 0) {
          if (
            existing.attachment &&
            existing.attachment.url !== attachment?.url
          )
            URL.revokeObjectURL(existing.attachment.url);
          docs[index] = next;
        } else {
          state.equipmentDocuments[craneId] = [...docs, next];
        }
        createdURL = null;
        cleanup();
        render();
        open(craneId);
        notify("Documento guardado. Vigencia actualizada en esta visita.");
      } catch (err) {
        form.querySelector(".form-error").textContent = err.message;
      }
    };
  }
  function bind() {
    document
      .querySelectorAll("[data-dossier]")
      .forEach((b) => (b.onclick = () => open(b.dataset.dossier)));
  }
  return { summary, overview, open, bind };
}
