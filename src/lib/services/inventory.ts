import type { Db } from "@/lib/db/types";
import type { Channel, InventoryItem, InventoryMovement, PurchaseCategory, Staff } from "@/lib/types";
import { env } from "@/lib/env";
import { addDays, money, num, zonedParts } from "@/lib/time";
import { raiseAlert, sendToStaff } from "./notify";

export interface StockRow extends InventoryItem {
  stock: number;
  value: number;
  low: boolean;
  compatCraneIds: string[];
  pendingOut: number;
}

export async function getStock(db: Db): Promise<StockRow[]> {
  const [items, movements, compat] = await Promise.all([
    db.select("inventory_items", { eq: { active: true }, order: { column: "name" } }),
    db.select("inventory_movements", { neq: { status: "rechazado" } }),
    db.select("inventory_compat"),
  ]);
  return items.map((it) => {
    const mine = movements.filter((m) => m.item_id === it.id);
    const stock = mine.filter((m) => m.status === "aplicado").reduce((s, m) => s + m.qty_delta, 0);
    const pendingOut = mine.filter((m) => m.status === "pendiente_autorizacion").reduce((s, m) => s - m.qty_delta, 0);
    return {
      ...it,
      stock,
      value: stock * it.unit_cost,
      low: stock <= it.min_stock,
      compatCraneIds: compat.filter((c) => c.item_id === it.id).map((c) => c.crane_id),
      pendingOut,
    };
  });
}

export async function findItem(db: Db, query: string) {
  const items = await db.select("inventory_items", { eq: { active: true } });
  const q = query.trim().toLowerCase();
  return (
    items.find((i) => i.id === query || i.sku.toLowerCase() === q) ??
    items.find((i) => i.name.toLowerCase().includes(q)) ??
    items.find((i) => q.split(/\s+/).every((w) => `${i.name} ${i.sku}`.toLowerCase().includes(w))) ??
    null
  );
}

export class InventoryError extends Error {}

const BLOCKING_FLAGS = ["incompatible", "sobre_umbral", "sin_evidencia"];
/** Señales que indican posible mal uso (no sólo trámite de autorización). */
const ANOMALY_FLAGS = ["fuera_de_horario", "consumo_atipico", "incompatible", "sin_evidencia", "diferencia_conteo"];

/**
 * Salida de almacén con controles antirrobo:
 * - destino obligatorio (grúa) y motivo
 * - pieza específica sólo a grúas compatibles
 * - cambio contra entrega (foto de la pieza usada)
 * - monto alto o fuera de regla → queda pendiente de autorización
 * - fuera de horario o consumo atípico → se aplica pero se reporta a Dirección
 */
export async function requestIssue(
  db: Db,
  input: {
    itemId: string;
    qty: number;
    craneId: string | null;
    reason: string;
    requestedBy: string | null;
    maintenanceOrderId?: string | null;
    evidencePaths?: string[];
    serialNumbers?: string[];
    channel: Channel;
  },
  now: Date,
) {
  const item = await db.get("inventory_items", input.itemId);
  if (!item) throw new InventoryError("Artículo no encontrado.");
  if (!(input.qty > 0)) throw new InventoryError("La cantidad debe ser mayor a cero.");
  if (!input.craneId) throw new InventoryError("Toda salida debe indicar la grúa destino.");
  if (!input.reason?.trim()) throw new InventoryError("Indica el motivo de la salida.");
  const crane = await db.get("cranes", input.craneId);
  if (!crane) throw new InventoryError("Grúa no encontrada.");

  const stock = (await getStock(db)).find((s) => s.id === item.id);
  const available = (stock?.stock ?? 0) - (stock?.pendingOut ?? 0);
  if (input.qty > available) {
    throw new InventoryError(`Sólo hay ${num(available)} ${item.unit} disponibles de ${item.name}.`);
  }
  if (item.serialized && (input.serialNumbers?.length ?? 0) < input.qty) {
    throw new InventoryError(`${item.name} es serializado: captura el número de serie de cada pieza.`);
  }

  const flags: string[] = [];
  const compat = await db.select("inventory_compat", { eq: { item_id: item.id } });
  const compatRow = compat.find((c) => c.crane_id === crane.id);
  if (item.scope === "especifico" && !compatRow) flags.push("incompatible");
  if (item.requires_return && !(input.evidencePaths?.length)) flags.push("sin_evidencia");
  if (input.qty * item.unit_cost > env.authorizeAboveMxn) flags.push("sobre_umbral");
  const hour = zonedParts(now).hour;
  if (hour < 7 || hour >= 19) flags.push("fuera_de_horario");
  if (!input.maintenanceOrderId && ["aceite", "filtro", "refaccion"].includes(item.category)) flags.push("sin_orden");

  if (compatRow?.expected_qty_per_service) {
    const recent = await db.select("inventory_movements", {
      eq: { item_id: item.id, crane_id: crane.id, kind: "salida" },
      gte: { created_at: addDays(now, -30).toISOString() },
    });
    const used = recent.filter((m) => m.status !== "rechazado").reduce((s, m) => s - m.qty_delta, 0);
    if (used + input.qty > compatRow.expected_qty_per_service * 1.5) flags.push("consumo_atipico");
  }

  const needsAuth = flags.some((f) => BLOCKING_FLAGS.includes(f));
  const movement = await db.insert("inventory_movements", {
    item_id: item.id,
    kind: "salida",
    qty_delta: -input.qty,
    unit_cost: item.unit_cost,
    crane_id: crane.id,
    maintenance_order_id: input.maintenanceOrderId ?? null,
    inspection_id: null,
    purchase_id: null,
    requested_by: input.requestedBy,
    authorized_by: null,
    reason: input.reason.trim(),
    evidence_paths: input.evidencePaths ?? [],
    serial_numbers: input.serialNumbers ?? [],
    status: needsAuth ? "pendiente_autorizacion" : "aplicado",
    flags,
    channel: input.channel,
  });

  const requester = input.requestedBy ? await db.get("staff", input.requestedBy) : null;
  const line = `${num(input.qty)} ${item.unit} × ${item.name} → ${crane.code} (${money(input.qty * item.unit_cost)})`;
  if (needsAuth) {
    const authorizers = (await db.select("staff", { eq: { active: true, can_authorize: true } })) as Staff[];
    await raiseAlert(db, {
      dedupe_key: `inv:autorizar:${movement.id}`,
      topic: "inventario",
      severity: "aviso",
      title: "Salida pendiente de autorización",
      body: `${line}\nSolicitó: ${requester?.full_name ?? "—"} · Motivo: ${input.reason}\nRazón: ${flags.filter((f) => BLOCKING_FLAGS.includes(f)).join(", ")}.\nResponde "autorizar salida ${movement.id.slice(0, 6)}" o revísala en la web.`,
      crane_id: crane.id,
      extraRecipients: authorizers,
    });
  } else if (flags.includes("fuera_de_horario") || flags.includes("consumo_atipico")) {
    await raiseAlert(db, {
      dedupe_key: `inv:anomalia:${movement.id}`,
      topic: "inventario",
      severity: "critica",
      title: "Movimiento de almacén atípico",
      body: `${line}\nSolicitó: ${requester?.full_name ?? "—"} · ${flags.join(", ")}.`,
      crane_id: crane.id,
    });
  }
  return { movement, item, crane, needsAuth, flags };
}

export async function resolveMovement(db: Db, movementId: string, approver: Staff, approve: boolean) {
  if (!approver.can_authorize) throw new InventoryError("No tienes permiso para autorizar salidas.");
  const mov = await findMovement(db, movementId);
  if (!mov) throw new InventoryError("Movimiento no encontrado.");
  if (mov.status !== "pendiente_autorizacion") throw new InventoryError("Ese movimiento ya fue resuelto.");
  if (approve) {
    const stock = (await getStock(db)).find((s) => s.id === mov.item_id);
    if ((stock?.stock ?? 0) < -mov.qty_delta) throw new InventoryError("Ya no hay existencia suficiente.");
  }
  const updated = await db.update("inventory_movements", mov.id, {
    status: approve ? "aplicado" : "rechazado",
    authorized_by: approver.id,
  });
  if (mov.requested_by) {
    const req = await db.get("staff", mov.requested_by);
    const item = await db.get("inventory_items", mov.item_id);
    if (req) await sendToStaff(db, req, `${approve ? "✅ Autorizada" : "❌ Rechazada"} tu salida de ${num(-mov.qty_delta)} ${item?.unit} de ${item?.name}.`, "sistema");
  }
  return updated;
}

/** Acepta id completo o prefijo corto (como se muestra en WhatsApp). */
export async function findMovement(db: Db, idOrPrefix: string): Promise<InventoryMovement | null> {
  const exact = await db.get("inventory_movements", idOrPrefix).catch(() => null);
  if (exact) return exact;
  const pending = await db.select("inventory_movements", { eq: { status: "pendiente_autorizacion" } });
  return pending.find((m) => m.id.startsWith(idOrPrefix.toLowerCase())) ?? null;
}

export async function registerPurchase(
  db: Db,
  input: {
    supplier: string;
    category: PurchaseCategory;
    description: string;
    total: number;
    craneId?: string | null;
    invoiceNumber?: string | null;
    purchasedOn?: string | null;
    lines?: { itemId: string; qty: number; unitCost: number }[];
    registeredBy: string | null;
    channel: Channel;
  },
) {
  if (!(input.total >= 0)) throw new InventoryError("Total inválido.");
  const purchase = await db.insert("purchases", {
    purchased_on: input.purchasedOn ?? new Date().toISOString().slice(0, 10),
    supplier: input.supplier.trim(),
    category: input.category,
    description: input.description.trim(),
    crane_id: input.craneId ?? null,
    total: input.total,
    invoice_number: input.invoiceNumber ?? null,
    payment_method: null,
    registered_by: input.registeredBy,
    channel: input.channel,
  });
  for (const l of input.lines ?? []) {
    const item = await db.get("inventory_items", l.itemId);
    if (!item) continue;
    await db.insert("purchase_items", { purchase_id: purchase.id, item_id: item.id, description: item.name, qty: l.qty, unit_cost: l.unitCost });
    await db.insert("inventory_movements", {
      item_id: item.id,
      kind: "entrada",
      qty_delta: l.qty,
      unit_cost: l.unitCost,
      crane_id: null,
      maintenance_order_id: null,
      inspection_id: null,
      purchase_id: purchase.id,
      requested_by: input.registeredBy,
      authorized_by: null,
      reason: `Compra ${input.invoiceNumber ?? ""}`.trim(),
      evidence_paths: [],
      serial_numbers: [],
      status: "aplicado",
      flags: [],
      channel: input.channel,
    });
    if (l.unitCost !== item.unit_cost) await db.update("inventory_items", item.id, { unit_cost: l.unitCost });
  }
  return purchase;
}

/** Conteo cíclico: registra la diferencia, ajusta y alerta si supera 5 %. */
export async function registerCount(db: Db, input: { itemId: string; countedQty: number; countedBy: string | null; notes?: string | null }) {
  const stock = (await getStock(db)).find((s) => s.id === input.itemId);
  if (!stock) throw new InventoryError("Artículo no encontrado.");
  const variance = input.countedQty - stock.stock;
  const count = await db.insert("inventory_counts", {
    item_id: stock.id,
    counted_qty: input.countedQty,
    system_qty: stock.stock,
    counted_by: input.countedBy,
    notes: input.notes ?? null,
  });
  if (variance !== 0) {
    await db.insert("inventory_movements", {
      item_id: stock.id,
      kind: "ajuste",
      qty_delta: variance,
      unit_cost: stock.unit_cost,
      crane_id: null,
      maintenance_order_id: null,
      inspection_id: null,
      purchase_id: null,
      requested_by: input.countedBy,
      authorized_by: null,
      reason: `Ajuste por conteo cíclico (${variance > 0 ? "sobrante" : "faltante"})`,
      evidence_paths: [],
      serial_numbers: [],
      status: "aplicado",
      flags: ["diferencia_conteo"],
      channel: "web",
    });
  }
  const pct = stock.stock ? Math.abs(variance) / stock.stock : variance ? 1 : 0;
  if (pct > 0.05) {
    await raiseAlert(db, {
      dedupe_key: `inv:conteo:${count.id}`,
      topic: "inventario",
      severity: variance < 0 ? "critica" : "aviso",
      title: `Diferencia en conteo: ${stock.name}`,
      body: `Sistema ${num(stock.stock)} ${stock.unit}, contado ${num(input.countedQty)} ${stock.unit} (${variance > 0 ? "+" : ""}${num(variance)} · ${money(Math.abs(variance) * stock.unit_cost)}).`,
    });
  }
  return { count, variance };
}

export async function inventoryWatch(db: Db, now: Date) {
  const [stock, movements, counts, cranes, staff] = await Promise.all([
    getStock(db),
    db.select("inventory_movements", { gte: { created_at: addDays(now, -30).toISOString() }, order: { column: "created_at", ascending: false } }),
    db.select("inventory_counts", { order: { column: "created_at", ascending: false }, limit: 20 }),
    db.select("cranes"),
    db.select("staff"),
  ]);
  const itemMap = new Map(stock.map((s) => [s.id, s]));
  const craneMap = new Map(cranes.map((c) => [c.id, c]));
  const staffMap = new Map(staff.map((s) => [s.id, s]));
  const enrich = (m: InventoryMovement) => ({
    ...m,
    item: itemMap.get(m.item_id) ?? null,
    crane: m.crane_id ? craneMap.get(m.crane_id) ?? null : null,
    requester: m.requested_by ? staffMap.get(m.requested_by) ?? null : null,
    authorizer: m.authorized_by ? staffMap.get(m.authorized_by) ?? null : null,
  });
  return {
    stock,
    lowStock: stock.filter((s) => s.low),
    pending: movements.filter((m) => m.status === "pendiente_autorizacion").map(enrich),
    flagged: movements.filter((m) => m.flags.some((f) => ANOMALY_FLAGS.includes(f)) && m.status !== "pendiente_autorizacion").map(enrich),
    movements: movements.map(enrich),
    counts: counts.map((c) => ({ ...c, item: itemMap.get(c.item_id) ?? null, counter: c.counted_by ? staffMap.get(c.counted_by) ?? null : null })),
  };
}

export type EnrichedMovement = Awaited<ReturnType<typeof inventoryWatch>>["movements"][number];

/**
 * Foto enviada por WhatsApp como evidencia de "cambio contra entrega":
 * se asocia a la salida más reciente de esa persona que la esté esperando.
 */
export async function attachEvidence(db: Db, staffId: string, path: string) {
  const since = addDays(new Date(), -1).toISOString();
  const candidates = await db.select("inventory_movements", {
    eq: { requested_by: staffId, kind: "salida" },
    gte: { created_at: since },
    order: { column: "created_at", ascending: false },
  });
  const mov = candidates.find((m) => m.flags.includes("sin_evidencia") && m.status !== "rechazado");
  if (!mov) return null;
  const flags = mov.flags.filter((f) => f !== "sin_evidencia");
  const stillBlocked = flags.some((f) => BLOCKING_FLAGS.includes(f));
  const updated = await db.update("inventory_movements", mov.id, {
    evidence_paths: [...mov.evidence_paths, path],
    flags,
    status: mov.status === "pendiente_autorizacion" && !stillBlocked ? "aplicado" : mov.status,
  });
  const item = await db.get("inventory_items", mov.item_id);
  return { movement: updated, item, applied: updated.status === "aplicado" && mov.status !== "aplicado" };
}
