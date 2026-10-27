import type { Db } from "@/lib/db/types";
import type { DowntimeCategory, MaintenanceOrder } from "@/lib/types";
import { DOWNTIME_LABELS } from "@/lib/labels";
import { addDays, fmt, overlaps } from "@/lib/time";
import { raiseAlert } from "./notify";
import { assertMaintenanceEvidence, createMaintenanceSnapshot } from "@/lib/domain/maintenance-checklists";

export async function reportDowntime(
  db: Db,
  input: { craneId: string; category: DowntimeCategory; reason: string; reportedBy: string | null; notes?: string | null },
  now: Date,
) {
  const crane = await db.get("cranes", input.craneId);
  if (!crane) throw new Error("Grúa no encontrada");
  const open = await db.select("downtimes", { eq: { crane_id: crane.id }, isNull: ["ended_at"] });
  if (open.length) throw new Error(`${crane.code} ya está detenida desde ${fmt.dateTime(open[0].started_at)}: ${open[0].reason}`);

  const downtime = await db.insert("downtimes", {
    crane_id: crane.id,
    category: input.category,
    reason: input.reason.trim(),
    started_at: now.toISOString(),
    ended_at: null,
    reported_by: input.reportedBy,
    inspection_id: null,
    notes: input.notes ?? null,
  });

  // Rentas afectadas en los próximos 14 días
  const rentals = await db.select("rentals", { eq: { crane_id: crane.id }, in: { status: ["confirmada", "en_curso"] } });
  const affected = rentals.filter((r) => overlaps(now, addDays(now, 14), new Date(r.start_at), new Date(r.end_at)));
  const clients = await db.select("clients");

  await raiseAlert(db, {
    dedupe_key: `flota:detenida:${downtime.id}`,
    topic: "flota",
    severity: "critica",
    title: `${crane.code} detenida`,
    body: `${crane.name}: ${DOWNTIME_LABELS[input.category]} — ${input.reason}.${
      affected.length
        ? `\nRentas afectadas: ${affected.map((r) => `${clients.find((c) => c.id === r.client_id)?.name} (${fmt.short(r.start_at)})`).join(", ")}. Pide a Rhino buscar sustituta.`
        : ""
    }`,
    crane_id: crane.id,
  });
  return { downtime, crane, affected };
}

export async function releaseCrane(db: Db, craneId: string, notes: string | null, now: Date) {
  const open = await db.select("downtimes", { eq: { crane_id: craneId }, isNull: ["ended_at"] });
  if (!open.length) throw new Error("La grúa no está detenida");
  for (const d of open) {
    await db.update("downtimes", d.id, { ended_at: now.toISOString(), notes: [d.notes, notes].filter(Boolean).join(" | ") || null });
  }
  return open;
}

export async function scheduleMaintenance(
  db: Db,
  input: {
    craneId: string;
    kind: MaintenanceOrder["kind"];
    title: string;
    description?: string | null;
    start: Date;
    end: Date;
    mechanicId?: string | null;
    createdBy: "web" | "agente";
    planId?: string | null;
  },
) {
  if (!(input.end > input.start)) throw new Error("La fecha de fin debe ser posterior al inicio");
  const rentals = await db.select("rentals", { eq: { crane_id: input.craneId }, in: { status: ["confirmada", "en_curso"] } });
  const clash = rentals.find((r) => overlaps(input.start, input.end, new Date(r.start_at), new Date(r.end_at)));
  if (clash) throw new Error(`Choca con una renta del ${fmt.dateTime(clash.start_at)} al ${fmt.dateTime(clash.end_at)}`);
  const crane = await db.get("cranes", input.craneId);
  if (!crane?.active) throw new Error("Unidad activa no encontrada.");
  if (!input.title.trim()) throw new Error("Indica el trabajo a realizar.");
  if (input.mechanicId) {
    const mechanic = await db.get("staff", input.mechanicId);
    if (!mechanic?.active || !["mecanico", "direccion", "administracion"].includes(mechanic.role)) throw new Error("Selecciona un responsable de mantenimiento activo.");
  }
  const plan = input.planId ? crane.fleet_profile?.maintenance_plans.find((p) => p.id === input.planId) : null;
  if (input.planId && !plan) throw new Error("El plan no pertenece a esta unidad.");
  const order: Partial<MaintenanceOrder> = {
    id: crypto.randomUUID(),
    crane_id: input.craneId,
    kind: input.kind,
    title: plan?.title ?? input.title.trim(),
    description: input.description ?? null,
    scheduled_start: input.start.toISOString(),
    scheduled_end: input.end.toISOString(),
    status: "programado",
    mechanic_id: input.mechanicId ?? null,
    cost: 0,
    hour_meter_at: crane?.hour_meter ?? null,
    created_by: input.createdBy,
    completed_at: null,
    plan_id: plan?.id ?? null,
    checklist_version: plan?.checklist_version ?? null,
  };
  if (!plan) return db.insert("maintenance_orders", order);
  const open = await db.select("maintenance_orders", { eq: { crane_id: crane.id, plan_id: plan.id }, in: { status: ["programado", "en_proceso"] } });
  if (open.length) throw new Error("Ya hay una orden abierta para este plan. Abre su checklist desde el expediente.");
  if (!db.createMaintenanceBundle) throw new Error("La base necesita la actualización de checklists de mantenimiento.");
  return db.createMaintenanceBundle(createMaintenanceSnapshot(crane, plan, order));
}

export async function completeMaintenance(db: Db, id: string, cost: number, now: Date) {
  const mo = await db.get("maintenance_orders", id);
  if (!mo) throw new Error("Orden no encontrada");
  if (mo.status === "cancelado") throw new Error("La orden está cancelada.");
  if (mo.status === "completado") return mo;
  if (!Number.isFinite(cost) || cost < 0) throw new Error("El costo debe ser un número no negativo.");
  if (mo.plan_id) {
    const attempts = await db.select("inspections", { eq: { maintenance_order_id: mo.id }, order: { column: "created_at", ascending: false } });
    const inspection = attempts[0];
    if (!inspection || inspection.status !== "completada" || inspection.result !== "aprobada" || (inspection.quality_score ?? 0) < 70) throw new Error("Completa y aprueba el checklist con sus fotos antes de cerrar la orden.");
    const items = await db.select("inspection_items", { eq: { inspection_id: inspection.id } });
    assertMaintenanceEvidence(items);
    if (items.some((i) => i.passed !== true)) throw new Error("El checklist tiene trabajos pendientes o fallas.");
  }
  const updated = await db.update("maintenance_orders", id, { status: "completado", cost, completed_at: now.toISOString() });
  if (mo.kind === "preventivo" && !mo.plan_id) {
    const crane = await db.get("cranes", mo.crane_id);
    if (crane?.hour_meter != null) await db.update("cranes", crane.id, { last_service_hours: crane.hour_meter });
  }
  return updated;
}

/** A failed attempt stays in the history; repeat with an empty copy of its frozen steps. */
export async function repeatMaintenanceChecklist(db: Db, id: string) {
  const order = await db.get("maintenance_orders", id);
  if (!order?.plan_id || !["programado", "en_proceso"].includes(order.status)) throw new Error("Esta orden no tiene un checklist que se pueda repetir.");
  const attempts = await db.select("inspections", { eq: { maintenance_order_id: id }, order: { column: "created_at", ascending: false } });
  const last = attempts[0];
  if (!last || !["completada", "cancelada"].includes(last.status)) throw new Error("Termina el checklist pendiente antes de repetirlo.");
  if (last.result === "aprobada" && (last.quality_score ?? 0) >= 70 && last.status === "completada") throw new Error("El checklist ya está aprobado; puedes cerrar la orden.");
  const previousItems = await db.select("inspection_items", { eq: { inspection_id: last.id }, order: { column: "position" } });
  if (!previousItems.length || !db.createMaintenanceBundle) throw new Error("No hay pasos disponibles para repetir.");
  const inspectionId = crypto.randomUUID();
  const created = new Date().toISOString();
  await db.createMaintenanceBundle({ repeat: true, order, inspection: {
    ...last, id: inspectionId, title: `${order.title} · intento ${attempts.length + 1}`,
    access_token: `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", ""), status: "programada",
    started_at: null, completed_at: null, result: null, quality_score: null, quality_flags: [],
    hour_meter_reading: null, start_lat: null, start_lng: null, signature_name: null, ai_summary: null, created_at: created,
  }, items: previousItems.map((item) => ({
    ...item, id: crypto.randomUUID(), inspection_id: inspectionId, value_text: null, value_number: null,
    passed: null, notes: null, photo_paths: [], photo_hashes: [], photo_slots: [], manual_confirmed: false,
    photo_taken_at: null, shown_at: null, answered_at: null, seconds_spent: null, flags: [], created_at: created,
  })) });
  return db.get("inspections", inspectionId);
}
