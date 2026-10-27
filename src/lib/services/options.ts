import type { Db } from "@/lib/db/types";
import { ROLE_LABELS } from "@/lib/labels";

/** Catálogos para los formularios de la web. */
export async function getFormOptions(db: Db) {
  const [cranes, clients, staff, stock, compat] = await Promise.all([
    db.select("cranes", { eq: { active: true }, order: { column: "code" } }),
    db.select("clients", { order: { column: "name" } }),
    db.select("staff", { eq: { active: true }, order: { column: "full_name" } }),
    db.select("inventory_items", { eq: { active: true }, order: { column: "name" } }),
    db.select("inventory_compat"),
  ]);
  return {
    cranes: cranes.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}${c.capacity_tons == null ? "" : ` (${c.capacity_tons} t)`}` })),
    clients: clients.map((c) => ({ id: c.id, label: c.name })),
    operators: staff.filter((s) => s.role === "operador").map((s) => ({ id: s.id, label: s.full_name })),
    mechanics: staff.filter((s) => s.role === "mecanico").map((s) => ({ id: s.id, label: s.full_name })),
    staff: staff.map((s) => ({ id: s.id, label: `${s.full_name} · ${ROLE_LABELS[s.role]}` })),
    items: stock.map((i) => ({
      id: i.id,
      label: `${i.name} (${i.sku})`,
      unit: i.unit,
      serialized: i.serialized,
      requiresReturn: i.requires_return,
      scope: i.scope,
      compat: compat.filter((c) => c.item_id === i.id).map((c) => c.crane_id),
    })),
  };
}
