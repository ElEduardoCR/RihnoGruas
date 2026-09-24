import { demoFleet, extraRecords } from "./demo-data.js";
export const initialFleet = demoFleet;
export const initialRecords = [
  ...extraRecords,
  {
    id: 101,
    type: "Operación",
    date: "2026-09-21",
    crane: "RH-01",
    concept: "Mina Santa Rita · Montaje de estructura",
    hours: 8,
    income: 14400,
    cost: 5200,
  },
  {
    id: 102,
    type: "Operación",
    date: "2026-09-22",
    crane: "RH-02",
    concept: "Industrial Norte · Izaje de transformador",
    hours: 10,
    income: 24000,
    cost: 8000,
  },
  {
    id: 103,
    type: "Operación",
    date: "2026-09-22",
    crane: "RH-03",
    concept: "Constructora del Norte · Colocación de losas",
    hours: 6,
    income: 8400,
    cost: 3000,
  },
  {
    id: 104,
    type: "Operación",
    date: "2026-09-23",
    crane: "RH-01",
    concept: "Mina Santa Rita · Montaje de estructura",
    hours: 9,
    income: 16200,
    cost: 5850,
  },
  {
    id: 105,
    type: "Operación",
    date: "2026-09-24",
    crane: "RH-02",
    concept: "Industrial Norte · Movimiento de maquinaria",
    hours: 8,
    income: 19200,
    cost: 6400,
  },
  {
    id: 106,
    type: "Operación",
    date: "2026-09-25",
    crane: "RH-03",
    concept: "Obra Los Encinos · Maniobra de acero",
    hours: 7,
    income: 9800,
    cost: 3500,
  },
  {
    id: 107,
    type: "Mantenimiento",
    date: "2026-09-24",
    crane: "RH-04",
    concept: "Cambio de sellos y servicio hidráulico",
    hours: 0,
    income: 0,
    cost: 7200,
  },
  {
    id: 109,
    type: "Operación",
    date: "2026-09-25",
    crane: "RH-01",
    concept: "Mina El Roble · Maniobra de apoyo",
    hours: 4,
    income: 6000,
    cost: 5300,
  },
  {
    id: 108,
    type: "Gasto",
    date: "2026-09-25",
    crane: "RH-01",
    concept: "Traslado y casetas",
    hours: 0,
    income: 0,
    cost: 1400,
  },
];
export const plans = [
  {
    id: 1,
    title: "Control operativo",
    price: 19000,
    monthly: "$500 / mes",
    term: "15 días",
    tag: "ORDEN Y VISIBILIDAD",
    desc: "Toda tu operación, en un solo lugar.",
    features: [
      "Registro manual de operaciones",
      "Ingresos, gastos y mantenimientos",
      "Historial y gasto acumulado por grúa",
    ],
    label: "Una base clara para empezar",
  },
  {
    id: 2,
    title: "Gestión guiada y rentabilidad",
    price: 49000,
    monthly: "$500 / mes",
    term: "1 mes",
    tag: "DECISIONES CON NÚMEROS",
    desc: "Captura mejor. Cotiza con criterio.",
    features: [
      "Todo lo incluido en Control operativo",
      "Captura guiada y recordatorios",
      "Costos por operación y por hora",
      "Tarifa sugerida y rentabilidad estimada",
      "Inventario con cantidades manuales",
    ],
    label: "Más control en cada maniobra",
  },
  {
    id: 3,
    title: "Asistente inteligente del dueño",
    price: 79000,
    monthly: "Variable según consumo de IA",
    term: "Desde 2 meses",
    tag: "UNA VISIÓN MÁS COMPLETA",
    desc: "Tu negocio también puede informarte.",
    features: [
      "Todo lo incluido en Gestión guiada",
      "Recordatorios por WhatsApp",
      "Asignaciones y pendientes a la mano",
      "Resumen de ganancias estimadas",
      "Descuento automático de insumos por servicio",
      "Lista de compras según mínimos",
      "Reportes de servicio para compartir",
      "Bandeja de asuntos que requieren atención",
      "Calendario de eventos y mantenimientos",
      "Audios por WhatsApp → evento tras confirmación",
    ],
    label: "Información útil, donde estés",
  },
];
export function totals(records) {
  return records.reduce(
    (a, r) => ({
      income: a.income + r.income,
      cost: a.cost + r.cost,
      hours: a.hours + r.hours,
      operations: a.operations + (r.type === "Operación" ? 1 : 0),
    }),
    { income: 0, cost: 0, hours: 0, operations: 0 },
  );
}
export function profitability({ fixed, hours, variable, margin, rate }) {
  if (
    ![fixed, hours, variable, margin, rate].every(Number.isFinite) ||
    fixed < 0 ||
    hours <= 0 ||
    variable < 0 ||
    margin < 0 ||
    margin > 95 ||
    rate <= 0
  )
    throw new Error(
      "Revisa los valores: horas y tarifa mayores a cero; margen de 0 a 95%.",
    );
  const cost = fixed / hours + variable;
  return {
    cost,
    suggested: cost / (1 - margin / 100),
    profit: rate - cost,
    actualMargin: ((rate - cost) / rate) * 100,
  };
}
export function validateRecord(r) {
  if (!r.concept.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !r.crane)
    throw new Error("Completa la fecha, la grúa y el concepto.");
  if (
    ![r.hours, r.income, r.cost].every(Number.isFinite) ||
    r.cost < 0 ||
    r.income < 0 ||
    r.hours < 0 ||
    (r.type === "Operación" && r.hours <= 0)
  )
    throw new Error("Revisa las horas y los importes.");
  return r;
}
