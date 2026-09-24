import { expandedEvents } from "./demo-data.js";
export const voiceExample = {
  id: "nota-001",
  transcript:
    "Programa para la RH-02 una revisión del cable de izaje el 2 de octubre de 2026 a las 9 de la mañana, en el taller central. Revisar desgaste, lubricación y puntos de anclaje.",
  title: "Revisión del cable de izaje",
  crane: "RH-02",
  date: "2026-10-02",
  time: "09:00",
  place: "Taller central",
  details: "Revisar desgaste, lubricación y puntos de anclaje.",
};
export const initialEvents = [
  ...expandedEvents,
  {
    id: "evento-1",
    reminderId: 1,
    title: "Comprar filtro hidráulico",
    crane: "RH-04",
    date: "2026-09-25",
    time: "10:00",
    place: "Taller central",
    details: "Compra pendiente registrada para el servicio hidráulico.",
    kind: "Pendiente",
  },
  {
    id: "evento-2",
    reminderId: 2,
    title: "Revisión de cable",
    crane: "RH-02",
    date: "2026-09-28",
    time: "09:00",
    place: "Taller central",
    details: "Revisión preventiva del cable de izaje.",
    kind: "Mantenimiento",
  },
  {
    id: "evento-3",
    reminderId: 3,
    title: "Servicio de aceite",
    crane: "RH-01",
    date: "2026-09-30",
    time: "08:30",
    place: "Taller central",
    details: "Confirmar y realizar mantenimiento preventivo.",
    kind: "Mantenimiento",
  },
];
export function shoppingList(items) {
  return items
    .map((i) => ({
      ...i,
      missing: Math.max(0, Math.round((i.min - i.quantity) * 10) / 10),
    }))
    .filter((i) => i.missing > 0);
}
export function attentionItems(records, orders, completed) {
  const items = [];
  for (const r of records.filter((r) => r.type !== "Gasto")) {
    const reasons = [];
    const margin = r.income > 0 ? ((r.income - r.cost) / r.income) * 100 : 0;
    if (r.type === "Operación" && margin < 20)
      reasons.push({
        kind: "margin",
        text:
          r.income > 0
            ? `Margen registrado de ${margin.toFixed(1)}%, por debajo de la referencia de 20%.`
            : "Operación sin ingreso registrado.",
      });
    if (r.closed === false)
      reasons.push({
        kind: "pending",
        text: "Servicio registrado, pendiente de cierre.",
      });
    if (!r.observations?.trim())
      reasons.push({
        kind: "missing",
        text: "Faltan observaciones del servicio.",
      });
    if (reasons.length)
      items.push({
        id: String(r.id),
        type: "record",
        title: r.concept,
        crane: r.crane,
        reasons,
      });
  }
  for (const o of orders.filter((o) => !completed.includes(o.id)))
    items.push({
      id: o.id,
      type: "order",
      title: o.title,
      crane: o.crane,
      reasons: [
        {
          kind: "pending",
          text: "Orden de mantenimiento pendiente de registrar y cerrar.",
        },
      ],
    });
  return items;
}
export const eventKinds = [
  "Reserva",
  "En operación",
  "Mantenimiento",
  "Taller",
  "Traslado",
  "Pendiente",
];
export const occursOn = (event, date) =>
  event.date <= date && (event.endDate || event.date) >= date;
export function prepareEvent(events, draft, fleet, sourceId, id) {
  if (sourceId && events.some((e) => e.sourceId === sourceId && e.id !== id))
    throw new Error(
      "Esta nota ya creó un evento. Puedes editarlo desde el calendario.",
    );
  if (
    !draft.title?.trim() ||
    !draft.details?.trim() ||
    !draft.place?.trim() ||
    !fleet.some((f) => f.id === draft.crane)
  )
    throw new Error("Completa mantenimiento, grúa, ubicación y detalles.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)
  )
    throw new Error("Revisa la fecha y la hora.");
  const day = new Date(draft.date + "T12:00:00Z");
  if (
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== draft.date
  )
    throw new Error("La fecha no es válida.");
  if (
    events.some(
      (e) =>
        e.id !== id &&
        e.date === draft.date &&
        e.time === draft.time &&
        e.crane === draft.crane &&
        e.title.toLowerCase().trim() === draft.title.toLowerCase().trim(),
    )
  )
    throw new Error("Ya existe un evento igual para esa grúa, fecha y hora.");
  const endDate = draft.endDate || draft.date,
    endTime = draft.endTime || draft.time;
  const end = new Date(endDate + "T12:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
    !Number.isFinite(end.getTime()) ||
    end.toISOString().slice(0, 10) !== endDate ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) ||
    endDate < draft.date ||
    (endDate === draft.date && endTime < draft.time)
  )
    throw new Error(
      "La fecha y hora de fin deben ser iguales o posteriores al inicio.",
    );
  const kind = draft.kind || "Mantenimiento";
  if (!eventKinds.includes(kind))
    throw new Error("Selecciona un tipo de evento válido.");
  return {
    endDate,
    endTime,
    kind,
    operator: (draft.operator || "").trim(),
    client: (draft.client || "").trim(),
    title: draft.title.trim(),
    crane: draft.crane,
    date: draft.date,
    time: draft.time,
    place: draft.place.trim(),
    details: draft.details.trim(),
    ...(sourceId ? { sourceId } : {}),
  };
}
