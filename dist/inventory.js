import { expandedSupplies } from "./demo-data.js";
export const initialInventory = [
  ...expandedSupplies,
  {
    id: "aceite-h",
    category: "Aceites y lubricantes",
    sku: "DEM-0006",
    location: "A-06",
    compatibility:
      "Confirmar viscosidad y aprobación OEM; cantidades de ejemplo, no receta del fabricante.",
    name: "Aceite hidráulico ISO 68",
    unit: "L",
    quantity: 32,
    min: 15,
    cost: 120,
    step: 0.1,
  },
  {
    id: "filtro-h",
    category: "Filtros",
    sku: "DEM-0017",
    location: "B-03",
    compatibility: "Validar circuito y número de parte con el fabricante.",
    name: "Filtro hidráulico",
    unit: "pzas",
    quantity: 3,
    min: 2,
    cost: 850,
    step: 1,
  },
  {
    id: "grasa",
    category: "Aceites y lubricantes",
    sku: "DEM-0008",
    location: "A-08",
    compatibility:
      "Confirmar consistencia, espesante y compatibilidad con la grasa existente.",
    name: "Grasa multipropósito",
    unit: "kg",
    quantity: 10,
    min: 3,
    cost: 180,
    step: 0.1,
  },
  {
    id: "filtro-a",
    category: "Filtros",
    sku: "DEM-0015",
    location: "B-01",
    compatibility: "Confirmar referencia exacta de la carcasa y del motor.",
    name: "Filtro de aire",
    unit: "pzas",
    quantity: 4,
    min: 2,
    cost: 650,
    step: 1,
  },
];
export const serviceOrders = [
  {
    id: "MT-026",
    title: "Servicio preventivo hidráulico",
    crane: "RH-02",
    date: "2026-09-25",
    labor: 800,
    consumables: [
      { id: "aceite-h", quantity: 20 },
      { id: "filtro-h", quantity: 1 },
      { id: "grasa", quantity: 2 },
    ],
  },
  {
    id: "MT-027",
    title: "Lubricación y cambio de filtro de aire",
    crane: "RH-03",
    date: "2026-09-25",
    labor: 400,
    consumables: [
      { id: "grasa", quantity: 3 },
      { id: "filtro-a", quantity: 1 },
    ],
  },
];
export function adjustStock(items, id, quantity, reason) {
  const item = items.find((i) => i.id === id);
  if (
    !item ||
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    quantity > 100000 ||
    Math.abs(quantity / item.step - Math.round(quantity / item.step)) > 1e-7
  )
    throw new Error(
      "Usa una cantidad válida, sin negativos: piezas enteras o una decimal para litros y kilos.",
    );
  if (!reason?.trim()) throw new Error("Escribe el motivo del ajuste.");
  if (quantity === item.quantity)
    throw new Error("La cantidad no cambió. Revisa el ajuste.");
  return {
    items: items.map((i) => (i.id === id ? { ...i, quantity } : i)),
    movement: {
      itemId: id,
      before: item.quantity,
      after: quantity,
      delta: Math.round((quantity - item.quantity) * 10) / 10,
      reason: reason.trim(),
      source: "manual",
    },
  };
}
export function servicePreview(items, order) {
  const lines = order.consumables.map((c) => {
    const item = items.find((i) => i.id === c.id);
    if (!item) throw new Error("Insumo no encontrado.");
    return {
      ...c,
      name: item.name,
      unit: item.unit,
      before: item.quantity,
      after: Math.round((item.quantity - c.quantity) * 10) / 10,
      cost: item.cost * c.quantity,
    };
  });
  return {
    lines,
    available: lines.every((l) => l.after >= 0),
    supplies: lines.reduce((s, l) => s + l.cost, 0),
  };
}
export function completeService(items, completed, orderId) {
  const order = serviceOrders.find((o) => o.id === orderId);
  if (!order) throw new Error("Servicio no encontrado.");
  if (completed.includes(orderId))
    throw new Error(
      "Este servicio ya fue registrado. Sus insumos no se descontaron otra vez.",
    );
  const preview = servicePreview(items, order);
  if (!preview.available)
    throw new Error(
      "Existencias insuficientes. Revisa o repón los insumos antes de registrar el servicio.",
    );
  const movements = preview.lines.map((l) => ({
    itemId: l.id,
    before: l.before,
    after: l.after,
    delta: -l.quantity,
    reason: order.id + " · " + order.title,
    source: "service",
  }));
  return {
    items: items.map((i) => {
      const line = preview.lines.find((l) => l.id === i.id);
      return line ? { ...i, quantity: line.after } : i;
    }),
    completed: [...completed, order.id],
    movements,
    record: {
      id: order.id,
      type: "Mantenimiento",
      date: order.date,
      crane: order.crane,
      concept: order.id + " · " + order.title,
      hours: 0,
      income: 0,
      cost: preview.supplies + order.labor,
      serviceId: order.id,
    },
    preview,
  };
}
