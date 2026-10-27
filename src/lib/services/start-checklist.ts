import type { Db } from "@/lib/db/types";
import type { ChecklistKind, Inspection, Staff } from "@/lib/types";
import { scheduleInspection, selectInspectionTemplate, startInspection } from "./inspections";
import { scheduleMaintenance } from "./maintenance";

const KINDS: readonly string[] = ["revision_total", "pre_renta", "post_renta", "diaria", "mantenimiento"];
const OPEN_STATUSES = ["programada", "en_progreso", "vencida"] as const;
const MAINTENANCE_ROLES: readonly string[] = ["direccion", "administracion", "mecanico"];

/** Start from the web now, without notifications or a second scheduling form. */
export async function startChecklist(
  db: Db,
  input: { craneId: string; kind: ChecklistKind; planId?: string | null; durationHours?: number },
  staff: Staff | null,
  now: Date,
): Promise<Inspection> {
  if (!staff?.active || ![...MAINTENANCE_ROLES, "operador"].includes(staff.role)) throw new Error("No tienes permiso para iniciar revisiones.");
  if (!KINDS.includes(input.kind)) throw new Error("Selecciona un tipo de revisión válido.");
  if (!Number.isFinite(now.getTime())) throw new Error("No se pudo determinar la fecha de inicio.");
  if (input.kind === "mantenimiento" && !MAINTENANCE_ROLES.includes(staff.role)) throw new Error("El mantenimiento debe iniciarlo Dirección, Administración o un mecánico.");
  if (input.kind === "mantenimiento" && ![1, 2, 4, 8].includes(input.durationHours ?? 0)) throw new Error("Selecciona una duración de mantenimiento de 1, 2, 4 u 8 horas.");
  if (input.kind !== "mantenimiento" && input.planId) throw new Error("El plan solo corresponde a una revisión de mantenimiento.");
  const crane = await db.get("cranes", input.craneId);
  if (!crane?.active) throw new Error("Selecciona una unidad activa.");

  let inspection: Inspection | undefined;
  if (input.kind === "mantenimiento") {
    const plan = crane.fleet_profile?.maintenance_plans.find((p) => p.id === input.planId);
    if (!plan) throw new Error("Selecciona un plan de mantenimiento de esta unidad.");
    const orders = await db.select("maintenance_orders", {
      eq: { crane_id: crane.id, plan_id: plan.id }, in: { status: ["programado", "en_proceso"] },
      order: { column: "created_at", ascending: false }, limit: 1,
    });
    let order = orders[0];
    if (!order) {
      order = await scheduleMaintenance(db, {
        craneId: crane.id, kind: "preventivo", planId: plan.id, title: plan.title,
        start: now, end: new Date(now.getTime() + input.durationHours! * 3600_000), mechanicId: staff.id, createdBy: "web",
      });
    }
    const attempts = await db.select("inspections", {
      eq: { maintenance_order_id: order.id }, order: { column: "created_at", ascending: false }, limit: 1,
    });
    inspection = attempts[0];
    if (!inspection || !OPEN_STATUSES.some((status) => status === inspection?.status)) throw new Error("Este trabajo ya tiene una orden abierta. Cierra la orden o repite su checklist desde el expediente.");
    if (inspection.kind !== "mantenimiento" || inspection.crane_id !== crane.id) throw new Error("El checklist no corresponde al mantenimiento de esta unidad.");
    if (!inspection.started_at && !(Date.parse(order.scheduled_start) <= now.getTime() && now.getTime() < Date.parse(order.scheduled_end))) throw new Error("Este mantenimiento tiene otro horario reservado. Revisa la orden en el expediente antes de empezarlo.");
  } else {
    const pending = await db.select("inspections", {
      eq: { crane_id: crane.id, kind: input.kind }, in: { status: OPEN_STATUSES },
      lte: { scheduled_for: now.toISOString() }, order: { column: "created_at", ascending: false },
    });
    inspection = pending.find((i) => (!i.assigned_to || i.assigned_to === staff.id) && Date.parse(i.scheduled_for) <= now.getTime());
    if (!inspection) {
      // A missing template must fail before an inspection is inserted. The
      // check below also protects resumption and catches a concurrent edit.
      const templates = await db.select("checklist_templates", { eq: { active: true } });
      const template = selectInspectionTemplate(templates, crane, input.kind);
      if (!template || !(await db.select("checklist_template_items", { eq: { template_id: template.id }, limit: 1 })).length) throw new Error("Este tipo de revisión todavía no tiene pasos configurados para la unidad.");
      ({ inspection } = await scheduleInspection(db, {
        craneId: crane.id, kind: input.kind, scheduledFor: now,
        dueBy: new Date(now.getTime() + 24 * 3600_000), assignedTo: staff.id, createdBy: "web", notify: false,
      }, now));
    }
  }

  const items = await db.select("inspection_items", { eq: { inspection_id: inspection.id }, limit: 1 });
  if (!items.length) throw new Error("La revisión no tiene pasos. Revisa su configuración antes de iniciarla.");
  if (!inspection.assigned_to) await db.update("inspections", inspection.id, { assigned_to: staff.id });
  return startInspection(db, inspection.access_token, {});
}
