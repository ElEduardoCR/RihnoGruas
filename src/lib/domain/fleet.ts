import type {
  Client,
  Crane,
  CraneDocument,
  CraneStatus,
  Downtime,
  Inspection,
  MaintenanceOrder,
  Rental,
} from "@/lib/types";
import { CHECKLIST_KIND_LABELS } from "@/lib/labels";
import { addDays, daysUntil, startOfDay } from "@/lib/time";

export type EventKind = "renta" | "mantenimiento" | "detencion" | "revision";

export interface FleetEvent {
  id: string;
  kind: EventKind;
  crane_id: string;
  title: string;
  subtitle: string | null;
  start: string;
  end: string;
  status: string;
  open?: boolean;
  href: string;
}

export function buildEvents(input: {
  now: Date;
  rentals: Rental[];
  maintenance: MaintenanceOrder[];
  downtimes: Downtime[];
  inspections: Inspection[];
  clients: Client[];
}): FleetEvent[] {
  const clientName = new Map(input.clients.map((c) => [c.id, c.name]));
  const events: FleetEvent[] = [];
  const openEnd = addDays(startOfDay(input.now), 1).toISOString();

  for (const r of input.rentals) {
    if (r.status === "cancelada") continue;
    events.push({
      id: r.id,
      kind: "renta",
      crane_id: r.crane_id,
      title: clientName.get(r.client_id) ?? "Renta",
      subtitle: r.site_address,
      start: r.start_at,
      end: r.end_at,
      status: r.status,
      href: `/gruas/${r.crane_id}#agenda`,
    });
  }
  for (const m of input.maintenance) {
    if (m.status === "cancelado") continue;
    events.push({
      id: m.id,
      kind: "mantenimiento",
      crane_id: m.crane_id,
      title: m.title,
      subtitle: m.kind === "preventivo" ? "Preventivo" : "Correctivo",
      start: m.scheduled_start,
      end: m.completed_at ?? m.scheduled_end,
      status: m.status,
      href: `/gruas/${m.crane_id}#mantenimiento`,
    });
  }
  for (const d of input.downtimes) {
    const end = d.ended_at ?? (new Date(openEnd) > new Date(d.started_at) ? openEnd : d.started_at);
    events.push({
      id: d.id,
      kind: "detencion",
      crane_id: d.crane_id,
      title: d.reason,
      subtitle: d.ended_at ? "Detención cerrada" : "Detenida actualmente",
      start: d.started_at,
      end,
      status: d.ended_at ? "cerrada" : "abierta",
      open: !d.ended_at,
      href: `/gruas/${d.crane_id}#estado`,
    });
  }
  for (const i of input.inspections) {
    if (i.status === "cancelada") continue;
    const start = i.scheduled_for;
    const end = i.completed_at ?? new Date(new Date(start).getTime() + 2 * 3600_000).toISOString();
    events.push({
      id: i.id,
      kind: "revision",
      crane_id: i.crane_id,
      title: CHECKLIST_KIND_LABELS[i.kind],
      subtitle: i.result ? `Resultado: ${i.result.replace("_", " ")}` : i.status,
      start,
      end: new Date(end) > new Date(start) ? end : new Date(new Date(start).getTime() + 3600_000).toISOString(),
      status: i.status,
      href: `/checklists/${i.id}`,
    });
  }
  return events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** Estado de una grúa en un instante: detenida > mantenimiento > rentada > disponible. */
export function statusAt(craneId: string, at: Date, events: FleetEvent[]): CraneStatus {
  const t = at.getTime();
  const active = events.filter(
    (e) => e.crane_id === craneId && Date.parse(e.start) <= t && (e.open || Date.parse(e.end) > t),
  );
  if (active.some((e) => e.kind === "detencion")) return "detenida";
  if (active.some((e) => e.kind === "mantenimiento" && e.status !== "completado")) return "mantenimiento";
  if (active.some((e) => e.kind === "renta" && e.status !== "cotizada")) return "rentada";
  return "disponible";
}

/** Estado predominante de la grúa durante un día (para el calendario). */
export function statusOnDay(craneId: string, dayStart: Date, events: FleetEvent[]): CraneStatus {
  const s = dayStart.getTime();
  const e = addDays(dayStart, 1).getTime();
  const active = events.filter(
    (ev) => ev.crane_id === craneId && Date.parse(ev.start) < e && (ev.open ? true : Date.parse(ev.end) > s) && Date.parse(ev.start) < e,
  );
  if (active.some((x) => x.kind === "detencion")) return "detenida";
  if (active.some((x) => x.kind === "mantenimiento")) return "mantenimiento";
  if (active.some((x) => x.kind === "renta" && x.status !== "cotizada")) return "rentada";
  return "disponible";
}

export type DocHealth = "ok" | "por_vencer" | "vencido";

export function docStatus(doc: Pick<CraneDocument, "expires_on">, now: Date): { health: DocHealth; days: number | null } {
  if (!doc.expires_on) return { health: "ok", days: null };
  const days = daysUntil(doc.expires_on, now);
  return { health: days < 0 ? "vencido" : days <= 30 ? "por_vencer" : "ok", days };
}

export function docsHealth(docs: CraneDocument[], now: Date): DocHealth {
  const states = docs.map((d) => docStatus(d, now).health);
  if (states.includes("vencido")) return "vencido";
  if (states.includes("por_vencer")) return "por_vencer";
  return "ok";
}

export function serviceUsage(c: Pick<Crane, "hour_meter" | "last_service_hours" | "service_interval_hours">) {
  const used = c.hour_meter - c.last_service_hours;
  return { used, pct: Math.min(1.2, used / c.service_interval_hours), remaining: c.service_interval_hours - used };
}
