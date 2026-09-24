export const checklistTypes = [
  "Inspección antes de uso",
  "Recepción en taller",
  "Entrega de equipo",
];
const common = [
  [
    "documents",
    "Documentación y operador",
    "Manual, registros de inspección e identificación disponibles.",
  ],
  [
    "structure",
    "Estructura y conexiones",
    "Registrar condición visible de pluma, pasadores y puntos de unión.",
  ],
  [
    "hydraulic",
    "Sistema hidráulico",
    "Registrar fugas visibles y condición de mangueras y conexiones.",
  ],
  [
    "hook",
    "Gancho y accesorios",
    "Registrar condición visible e identificación de accesorios de izaje.",
  ],
  [
    "controls",
    "Controles e indicadores",
    "Registrar resultado de la revisión según el procedimiento del fabricante.",
  ],
  [
    "area",
    "Entorno y apoyos",
    "Registrar condiciones del área, accesos y apoyos previstos.",
  ],
];
export function checklistItems(fleet, type) {
  const items = common.map(([id, title, detail]) => ({ id, title, detail }));
  const tracks = /oruga|araña/i.test(fleet.family || "");
  items.splice(2, 0, {
    id: "running",
    title: tracks ? "Orugas y tren de rodaje" : "Llantas y tren de rodaje",
    detail: tracks
      ? "Registrar condición visible de cadenas, zapatas y rodillos."
      : "Registrar condición visible de llantas, rines y fijaciones; consultar especificaciones del equipo.",
  });
  items.push({
    id: "support",
    title: "Estabilizadores y apoyos",
    detail:
      "Registrar condición visible; indicar «No aplica» si el equipo no los incorpora.",
  });
  items.push({
    id: "rope",
    title: "Cable, poleas y malacate",
    detail:
      "Registrar condición conforme al manual. No aplica si no incorpora cable o malacate; los límites de descarte se consultan con el fabricante.",
  });
  if (type === "Recepción en taller")
    items.push({
      id: "workshop",
      title: "Motivo de ingreso y pendientes",
      detail:
        "Identificar fallas reportadas y trabajos solicitados antes de programar el servicio.",
    });
  if (type === "Entrega de equipo")
    items.push({
      id: "handover",
      title: "Documentos y accesorios entregados",
      detail:
        "Registrar inventario de accesorios y observaciones del responsable que recibe.",
    });
  return items;
}
export function validateInspection(draft, fleet, step = 5) {
  const crane = fleet.find((f) => f.id === draft.crane);
  if (!crane || !checklistTypes.includes(draft.type))
    throw new Error("Selecciona un tipo de checklist y una grúa.");
  if (step >= 2) {
    if (
      !draft.operator?.trim() ||
      !draft.place?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(draft.date || "")
    )
      throw new Error("Completa responsable, fecha y ubicación.");
    const date = new Date(draft.date + "T12:00:00Z");
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== draft.date
    )
      throw new Error("Revisa la fecha de captura.");
    if (
      draft.meter === "" ||
      !Number.isFinite(+draft.meter) ||
      +draft.meter < (crane.meterHours || 0) ||
      +draft.meter > 999999
    )
      throw new Error(
        "La lectura debe ser igual o mayor al horómetro registrado y menor a 1,000,000 h.",
      );
  }
  if (
    step >= 3 &&
    checklistItems(crane, draft.type).some(
      (i) => !["ok", "issue", "na"].includes(draft.answers?.[i.id]),
    )
  )
    throw new Error("Responde cada punto de la revisión para continuar.");
  if (
    step >= 4 &&
    Object.values(draft.answers || {}).includes("issue") &&
    !draft.notes?.trim()
  )
    throw new Error("Describe las observaciones encontradas antes de guardar.");
  if (step >= 5 && !draft.confirmed)
    throw new Error("Confirma que revisaste la captura.");
  return {
    crane,
    needsReview: Object.values(draft.answers || {}).includes("issue"),
  };
}
