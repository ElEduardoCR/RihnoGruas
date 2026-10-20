import type { Db } from "@/lib/db/types";
import type { Crane, CraneDocument, CraneStatus, Staff } from "@/lib/types";
import {
  buildEvents,
  docsHealth,
  serviceUsage,
  statusAt,
  type DocHealth,
  type FleetEvent,
} from "@/lib/domain/fleet";
import { addDays, startOfDay } from "@/lib/time";
import { norm } from "@/lib/text";

export interface CraneView extends Crane {
  status: CraneStatus;
  current: FleetEvent | null;
  next: FleetEvent | null;
  docHealth: DocHealth;
  documents: CraneDocument[];
  service: ReturnType<typeof serviceUsage>;
}

/** Eventos (rentas, mantenimiento, detenciones, revisiones) que tocan el rango. */
export async function getEvents(db: Db, from: Date, to: Date, now: Date) {
  const f = from.toISOString();
  const t = to.toISOString();
  const [rentals, maintenance, downtimes, inspections, clients] = await Promise.all([
    db.select("rentals", { lt: { start_at: t }, gt: { end_at: f } }),
    db.select("maintenance_orders", { lt: { scheduled_start: t }, gt: { scheduled_end: f } }),
    db.select("downtimes", { lt: { started_at: t } }),
    db.select("inspections", { gte: { scheduled_for: addDays(from, -1).toISOString() }, lt: { scheduled_for: t } }),
    db.select("clients"),
  ]);
  const relevantDowntimes = downtimes.filter((d) => !d.ended_at || new Date(d.ended_at) > from);
  return buildEvents({ now, rentals, maintenance, downtimes: relevantDowntimes, inspections, clients });
}

export async function getFleet(db: Db, now: Date): Promise<{ cranes: CraneView[]; events: FleetEvent[] }> {
  const from = addDays(startOfDay(now), -45);
  const to = addDays(startOfDay(now), 60);
  const [cranes, docs, events] = await Promise.all([
    db.select("cranes", { eq: { active: true }, order: { column: "code" } }),
    db.select("crane_documents"),
    getEvents(db, from, to, now),
  ]);
  const t = now.getTime();
  const views = cranes.map((c) => {
    const mine = events.filter((e) => e.crane_id === c.id);
    const documents = docs.filter((d) => d.crane_id === c.id);
    const status = statusAt(c.id, now, events);
    const current =
      mine.find((e) => e.kind !== "revision" && Date.parse(e.start) <= t && (e.open || Date.parse(e.end) > t)) ?? null;
    const next = mine.find((e) => Date.parse(e.start) > t) ?? null;
    return { ...c, status, current, next, docHealth: docsHealth(documents, now), documents, service: serviceUsage(c) };
  });
  return { cranes: views, events };
}

export async function getStaffMap(db: Db) {
  const staff = await db.select("staff");
  return new Map<string, Staff>(staff.map((s) => [s.id, s]));
}

/** Busca una grúa por número económico, nombre o id (tolerante a "rh4", "RH 04", "grove"). */
export async function findCrane(db: Db, query: string): Promise<Crane | null> {
  const cranes = await db.select("cranes", { eq: { active: true } });
  const q = norm(query);
  const byId = cranes.find((c) => c.id === query);
  if (byId) return byId;
  const codeMatch = q.match(/rh[\s-]*0*(\d{1,2})/);
  if (codeMatch) {
    const code = `RH-${codeMatch[1].padStart(2, "0")}`;
    const c = cranes.find((x) => x.code === code);
    if (c) return c;
  }
  return (
    cranes.find((c) => norm(c.name) === q) ??
    cranes.find((c) => norm(`${c.name} ${c.brand} ${c.model}`).includes(q)) ??
    cranes.find((c) => q.split(/\s+/).some((w) => w.length > 3 && norm(`${c.name} ${c.brand}`).includes(w))) ??
    null
  );
}

export async function getCraneDossier(db: Db, id: string, now: Date) {
  const crane = await db.get("cranes", id);
  if (!crane) return null;
  const [documents, approvals, staff, rentals, maintenance, downtimes, inspections, clients, movements, items, purchases, ownItems, compat] =
    await Promise.all([
      db.select("crane_documents", { eq: { crane_id: id }, order: { column: "expires_on" } }),
      db.select("crane_operators", { eq: { crane_id: id } }),
      db.select("staff"),
      db.select("rentals", { eq: { crane_id: id }, order: { column: "start_at", ascending: false } }),
      db.select("maintenance_orders", { eq: { crane_id: id }, order: { column: "scheduled_start", ascending: false } }),
      db.select("downtimes", { eq: { crane_id: id }, order: { column: "started_at", ascending: false } }),
      db.select("inspections", { eq: { crane_id: id }, order: { column: "scheduled_for", ascending: false } }),
      db.select("clients"),
      db.select("inventory_movements", { eq: { crane_id: id }, order: { column: "created_at", ascending: false } }),
      db.select("inventory_items"),
      db.select("purchases", { eq: { crane_id: id }, order: { column: "purchased_on", ascending: false } }),
      db.select("crane_checklist_items", { eq: { crane_id: id } }),
      db.select("inventory_compat", { eq: { crane_id: id } }),
    ]);
  const events = buildEvents({ now, rentals, maintenance, downtimes, inspections, clients });
  const staffMap = new Map(staff.map((s) => [s.id, s]));
  const itemMap = new Map(items.map((i) => [i.id, i]));
  return {
    crane,
    status: statusAt(id, now, events),
    service: serviceUsage(crane),
    documents,
    operators: approvals
      .map((a) => ({ ...a, staff: staffMap.get(a.staff_id)! }))
      .filter((a) => a.staff)
      .sort((a, b) => a.staff.full_name.localeCompare(b.staff.full_name)),
    events,
    rentals: rentals.map((r) => ({ ...r, client: clients.find((c) => c.id === r.client_id) ?? null, operator: r.operator_id ? staffMap.get(r.operator_id) ?? null : null })),
    maintenance,
    downtimes,
    inspections: inspections.map((i) => ({ ...i, assignee: i.assigned_to ? staffMap.get(i.assigned_to) ?? null : null })),
    movements: movements.map((m) => ({ ...m, item: itemMap.get(m.item_id) ?? null })),
    purchases,
    ownChecklistItems: ownItems,
    compatibleItems: compat.map((c) => ({ ...c, item: itemMap.get(c.item_id)! })).filter((c) => c.item),
    staffMap,
  };
}

export type CraneDossier = NonNullable<Awaited<ReturnType<typeof getCraneDossier>>>;
