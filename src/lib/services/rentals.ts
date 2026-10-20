import type { Db } from "@/lib/db/types";
import type { Crane, CraneType, Inspection, Rental } from "@/lib/types";
import { docStatus } from "@/lib/domain/fleet";
import { DOC_LABELS } from "@/lib/labels";
import { addDays, daysUntil, fmt, overlaps, startOfDay, zonedDate, zonedParts } from "@/lib/time";
import { raiseAlert } from "./notify";
import { scheduleInspection } from "./inspections";

export interface Conflict {
  kind: "renta" | "mantenimiento" | "detencion";
  label: string;
  start: string;
  end: string | null;
}

/** Conflictos de agenda de una grúa en el rango. */
export async function craneConflicts(db: Db, craneId: string, from: Date, to: Date, ignoreRentalId?: string) {
  const [rentals, maintenance, downtimes, clients] = await Promise.all([
    db.select("rentals", { eq: { crane_id: craneId }, in: { status: ["confirmada", "en_curso"] } }),
    db.select("maintenance_orders", { eq: { crane_id: craneId }, in: { status: ["programado", "en_proceso"] } }),
    db.select("downtimes", { eq: { crane_id: craneId }, isNull: ["ended_at"] }),
    db.select("clients"),
  ]);
  const out: Conflict[] = [];
  for (const r of rentals) {
    if (r.id === ignoreRentalId) continue;
    if (overlaps(from, to, new Date(r.start_at), new Date(r.end_at)))
      out.push({ kind: "renta", label: `Rentada a ${clients.find((c) => c.id === r.client_id)?.name ?? "cliente"}`, start: r.start_at, end: r.end_at });
  }
  for (const m of maintenance) {
    if (overlaps(from, to, new Date(m.scheduled_start), new Date(m.scheduled_end)))
      out.push({ kind: "mantenimiento", label: m.title, start: m.scheduled_start, end: m.scheduled_end });
  }
  for (const d of downtimes) out.push({ kind: "detencion", label: `Detenida: ${d.reason}`, start: d.started_at, end: null });
  return out;
}

/** Problemas de documentación que impedirían cubrir la renta. */
export async function documentIssues(db: Db, craneId: string, until: Date, now: Date) {
  const docs = await db.select("crane_documents", { eq: { crane_id: craneId } });
  const issues: { blocking: boolean; text: string }[] = [];
  for (const d of docs) {
    if (!d.expires_on) continue;
    const { health } = docStatus(d, now);
    if (health === "vencido") issues.push({ blocking: true, text: `${DOC_LABELS[d.doc_type]} vencido desde ${fmt.date(d.expires_on)}` });
    else if (new Date(d.expires_on) < until)
      issues.push({ blocking: false, text: `${DOC_LABELS[d.doc_type]} vence el ${fmt.date(d.expires_on)}, antes de terminar la renta` });
  }
  return issues;
}

export async function findAvailable(
  db: Db,
  q: { from: Date; to: Date; type?: CraneType | null; minCapacity?: number | null },
  now: Date,
) {
  const cranes = await db.select("cranes", { eq: { active: true }, order: { column: "code" } });
  const candidates = cranes.filter(
    (c) => (!q.type || c.type === q.type) && (!q.minCapacity || c.capacity_tons >= q.minCapacity),
  );
  const result: { crane: Crane; available: boolean; conflicts: Conflict[]; docIssues: { blocking: boolean; text: string }[] }[] = [];
  for (const crane of candidates) {
    const conflicts = await craneConflicts(db, crane.id, q.from, q.to);
    const docIssues = await documentIssues(db, crane.id, q.to, now);
    result.push({ crane, available: conflicts.length === 0 && !docIssues.some((d) => d.blocking), conflicts, docIssues });
  }
  return result;
}

export interface CreateRentalInput {
  craneId: string;
  clientId?: string | null;
  clientName?: string | null;
  operatorId?: string | null;
  start: Date;
  end: Date;
  siteAddress?: string | null;
  siteNotes?: string | null;
  rate?: number | null;
  createdBy: "web" | "agente";
}

export class RentalError extends Error {}

/**
 * Crea la renta y — decisión automática del agente — programa la revisión
 * total personalizada el día anterior y la recepción post-renta al regreso.
 */
export async function createRental(db: Db, input: CreateRentalInput, now: Date) {
  if (!(input.end > input.start)) throw new RentalError("La fecha de fin debe ser posterior al inicio.");
  if (input.end < now) throw new RentalError("La renta termina en el pasado.");
  const crane = await db.get("cranes", input.craneId);
  if (!crane) throw new RentalError("Grúa no encontrada.");

  const conflicts = await craneConflicts(db, crane.id, input.start, input.end);
  if (conflicts.length) {
    throw new RentalError(
      `${crane.code} no está disponible: ${conflicts.map((c) => `${c.label} (${fmt.dateTime(c.start)}${c.end ? ` → ${fmt.dateTime(c.end)}` : ""})`).join("; ")}.`,
    );
  }
  const docIssues = await documentIssues(db, crane.id, input.end, now);
  const blocking = docIssues.filter((d) => d.blocking);
  if (blocking.length) throw new RentalError(`${crane.code} no puede salir: ${blocking.map((b) => b.text).join("; ")}.`);

  const warnings = docIssues.filter((d) => !d.blocking).map((d) => d.text);

  // Operador: debe estar aprobado para la grúa y con licencia vigente al terminar la renta
  const approvals = await db.select("crane_operators", { eq: { crane_id: crane.id } });
  let operatorId = input.operatorId ?? null;
  if (operatorId) {
    const appr = approvals.find((a) => a.staff_id === operatorId);
    if (!appr) throw new RentalError("El operador no está aprobado para esta grúa.");
    const op = await db.get("staff", operatorId);
    if (op?.license_expires_on && daysUntil(op.license_expires_on, input.end) < 0) {
      throw new RentalError(`La licencia de ${op.full_name} vence el ${fmt.date(op.license_expires_on)}, antes de terminar la renta.`);
    }
  } else {
    for (const a of approvals) {
      const op = await db.get("staff", a.staff_id);
      if (!op?.active || (op.license_expires_on && daysUntil(op.license_expires_on, input.end) < 0)) continue;
      const busy = await db.select("rentals", { eq: { operator_id: op.id }, in: { status: ["confirmada", "en_curso"] } });
      if (busy.some((r) => overlaps(input.start, input.end, new Date(r.start_at), new Date(r.end_at)))) continue;
      operatorId = op.id;
      warnings.push(`Operador asignado automáticamente: ${op.full_name}.`);
      break;
    }
    if (!operatorId) warnings.push("No hay operador aprobado libre con licencia vigente: asigna uno manualmente.");
  }

  const clientId = input.clientId ?? (input.clientName ? await upsertClient(db, input.clientName) : null);
  if (!clientId) throw new RentalError("Indica el cliente.");

  const rental = await db.insert("rentals", {
    crane_id: crane.id,
    client_id: clientId,
    operator_id: operatorId,
    start_at: input.start.toISOString(),
    end_at: input.end.toISOString(),
    site_address: input.siteAddress ?? null,
    site_notes: input.siteNotes ?? null,
    rate: input.rate ?? crane.daily_rate,
    rate_unit: "dia",
    status: input.start <= now ? "en_curso" : "confirmada",
    created_by: input.createdBy,
    notes: null,
  });

  const inspections = await scheduleRentalInspections(db, crane, rental, now);

  const client = await db.get("clients", clientId);
  await raiseAlert(db, {
    dedupe_key: `renta:nueva:${rental.id}`,
    topic: "agenda",
    severity: "info",
    title: `Nueva renta ${crane.code}`,
    body: `${crane.name} con ${client?.name ?? "cliente"} del ${fmt.dateTime(rental.start_at)} al ${fmt.dateTime(rental.end_at)}.\nRevisión total programada: ${fmt.dateTime(inspections.pre.scheduled_for)}.`,
    crane_id: crane.id,
  });

  return { rental, crane, inspections, warnings };
}

/**
 * Regla de negocio: revisión total el día anterior a las 9:00 (o lo antes
 * posible si la renta es inminente) y recepción post-renta al regresar.
 */
export async function scheduleRentalInspections(db: Db, crane: Crane, rental: Rental, now: Date) {
  const start = new Date(rental.start_at);
  const preAt = preInspectionTime(start, now);

  const pre = await scheduleInspection(
    db,
    { craneId: crane.id, kind: "revision_total", scheduledFor: preAt, dueBy: start, rental, assignedTo: rental.operator_id, createdBy: "agente" },
    now,
  );
  const post = await scheduleInspection(
    db,
    {
      craneId: crane.id,
      kind: "post_renta",
      scheduledFor: new Date(rental.end_at),
      dueBy: addDays(startOfDay(new Date(rental.end_at)), 2),
      rental,
      assignedTo: rental.operator_id,
      createdBy: "agente",
      notify: false,
    },
    now,
  );
  return { pre: pre.inspection as Inspection, preItems: pre.items, focus: pre.focus, post: post.inspection as Inspection };
}

/**
 * Hora de la revisión previa: el día anterior a las 9:00. Si ya pasó, lo
 * antes posible pero nunca antes de las 6:00 ni después del inicio.
 */
export function preInspectionTime(start: Date, now: Date): Date {
  const p = zonedParts(addDays(start, -1));
  const dayBefore = zonedDate(p.year, p.month, p.day, 9);
  if (dayBefore >= now) return dayBefore;
  let t = new Date(Math.max(now.getTime() + 30 * 60_000, start.getTime() - 90 * 60_000));
  const tp = zonedParts(t);
  if (tp.hour < 6) {
    const six = zonedDate(tp.year, tp.month, tp.day, 6);
    if (six.getTime() <= start.getTime() - 30 * 60_000) t = six;
  }
  return t > start ? now : t;
}

async function upsertClient(db: Db, name: string) {
  const clients = await db.select("clients");
  const q = name.trim().toLowerCase();
  const found = clients.find((c) => c.name.toLowerCase() === q) ?? clients.find((c) => c.name.toLowerCase().includes(q));
  if (found) return found.id;
  const created = await db.insert("clients", { name: name.trim() });
  return created.id;
}

export async function cancelRental(db: Db, rentalId: string) {
  const rental = await db.update("rentals", rentalId, { status: "cancelada" });
  const insp = await db.select("inspections", { eq: { rental_id: rentalId }, in: { status: ["programada", "vencida"] } });
  for (const i of insp) await db.update("inspections", i.id, { status: "cancelada" });
  return rental;
}

/** Actualiza estados de rentas según la hora actual. */
export async function syncRentalStatuses(db: Db, now: Date) {
  const active = await db.select("rentals", { in: { status: ["confirmada", "en_curso"] } });
  const changed: Rental[] = [];
  for (const r of active) {
    const next =
      new Date(r.end_at) <= now ? "finalizada" : new Date(r.start_at) <= now ? "en_curso" : "confirmada";
    if (next !== r.status) changed.push(await db.update("rentals", r.id, { status: next }));
  }
  return changed;
}
