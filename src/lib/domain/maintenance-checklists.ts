import type { Crane, Inspection, InspectionItem, MaintenanceOrder } from "@/lib/types";
import type { MaintenanceBundle } from "@/lib/db/types";
import type { MaintenancePlan } from "@/lib/fleet/types";

export function createMaintenanceSnapshot(crane: Crane, plan: MaintenancePlan, order: Partial<MaintenanceOrder>, now = new Date()): MaintenanceBundle {
  const steps = plan.checklist_steps;
  if (!steps || steps.length < 3 || !steps[0].requires_manual_confirmation || !plan.checklist_version) throw new Error("Este plan aún no tiene un checklist validado para programar.");
  const inspectionId = crypto.randomUUID();
  const inspection: Partial<Inspection> = {
    id: inspectionId, crane_id: crane.id, maintenance_order_id: order.id,
    kind: "mantenimiento", title: `${plan.title} · ${crane.code}`,
    scheduled_for: order.scheduled_start, due_by: order.scheduled_end,
    assigned_to: order.mechanic_id ?? null, status: "programada", created_by: order.created_by,
    access_token: `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", ""),
    rental_id: null, template_id: null, started_at: null, completed_at: null, result: null,
    quality_score: null, quality_flags: [], hour_meter_reading: null, start_lat: null, start_lng: null,
    signature_name: null, ai_summary: null, created_at: now.toISOString(),
  };
  const items: Partial<InspectionItem>[] = steps.map((step, position) => {
    if (step.min_photos < 1 || step.min_photos > 8 || step.photo_requirements.length !== step.min_photos) throw new Error(`Las tomas de «${step.title}» no están completas.`);
    const source = crane.fleet_profile?.sources.find((s) => step.source_ids.includes(s.id));
    if (!source) throw new Error(`Falta la fuente de «${step.title}».`);
    return {
      id: crypto.randomUUID(), inspection_id: inspectionId, position, section: step.section,
      title: step.title, instructions: step.instructions, procedure_steps: [...step.procedure_steps],
      response_type: step.response_type, unit: step.unit, min_value: step.min_value, max_value: step.max_value,
      requires_photo: true, min_photos: step.min_photos, photo_hint: step.photo_hint, photo_requirements: [...step.photo_requirements],
      critical: step.critical, source: "plantilla", source_reason: `Plan ${plan.id} · versión ${plan.checklist_version}; ${plan.basis === "manufacturer_family" ? "referencia de familia" : "procedimiento base pendiente de cotejar con manual"}`,
      reference_label: `${source.title} · ${step.reference_locator}`, reference_url: source.url,
      requires_manual_confirmation: step.requires_manual_confirmation, manual_confirmed: false,
      value_text: null, value_number: null, passed: null, notes: null, photo_paths: [], photo_hashes: [], photo_slots: [],
      photo_taken_at: null, shown_at: null, answered_at: null, seconds_spent: null, flags: [], created_at: now.toISOString(),
    };
  });
  return { order, inspection, items };
}

export function assertMaintenanceEvidence(items: InspectionItem[]) {
  if (!items.length || !items.some((i) => i.requires_manual_confirmation)) throw new Error("El checklist no tiene pasos o falta verificar el manual.");
  for (const item of items) {
    if (!item.answered_at) throw new Error(`Falta completar «${item.title}».`);
    if (item.requires_manual_confirmation && !item.manual_confirmed) throw new Error("Confirma el manual correspondiente a esta unidad.");
    if (item.photo_paths.length < item.min_photos || item.photo_hashes.length !== item.photo_paths.length || item.photo_slots?.length !== item.photo_paths.length) throw new Error(`Faltan evidencias en «${item.title}».`);
    const slots = new Set(item.photo_slots);
    if (slots.size !== item.photo_paths.length || Array.from({ length: item.min_photos }, (_, k) => k).some((slot) => !slots.has(slot))) throw new Error(`Faltan las tomas indicadas en «${item.title}».`);
  }
}
