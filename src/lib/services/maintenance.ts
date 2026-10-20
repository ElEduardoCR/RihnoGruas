import type { Db } from "@/lib/db/types";
import type { DowntimeCategory, MaintenanceOrder } from "@/lib/types";
import { DOWNTIME_LABELS } from "@/lib/labels";
import { addDays, fmt, overlaps } from "@/lib/time";
import { raiseAlert } from "./notify";

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
  },
) {
  if (!(input.end > input.start)) throw new Error("La fecha de fin debe ser posterior al inicio");
  const rentals = await db.select("rentals", { eq: { crane_id: input.craneId }, in: { status: ["confirmada", "en_curso"] } });
  const clash = rentals.find((r) => overlaps(input.start, input.end, new Date(r.start_at), new Date(r.end_at)));
  if (clash) throw new Error(`Choca con una renta del ${fmt.dateTime(clash.start_at)} al ${fmt.dateTime(clash.end_at)}`);
  const crane = await db.get("cranes", input.craneId);
  return db.insert("maintenance_orders", {
    crane_id: input.craneId,
    kind: input.kind,
    title: input.title.trim(),
    description: input.description ?? null,
    scheduled_start: input.start.toISOString(),
    scheduled_end: input.end.toISOString(),
    status: "programado",
    mechanic_id: input.mechanicId ?? null,
    cost: 0,
    hour_meter_at: crane?.hour_meter ?? null,
    created_by: input.createdBy,
    completed_at: null,
  });
}

export async function completeMaintenance(db: Db, id: string, cost: number, now: Date) {
  const mo = await db.get("maintenance_orders", id);
  if (!mo) throw new Error("Orden no encontrada");
  const updated = await db.update("maintenance_orders", id, { status: "completado", cost, completed_at: now.toISOString() });
  if (mo.kind === "preventivo") {
    const crane = await db.get("cranes", mo.crane_id);
    if (crane) await db.update("cranes", crane.id, { last_service_hours: crane.hour_meter });
  }
  return updated;
}
