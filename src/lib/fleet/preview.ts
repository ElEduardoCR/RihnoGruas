import { buildSeed, type SeedData } from "@/lib/demo/seed";
import { createMaintenanceSnapshot } from "@/lib/domain/maintenance-checklists";
import type { Inspection, InspectionItem, MaintenanceOrder } from "@/lib/types";
import { buildFleetPayload } from "./payload";

/** Explicit local preview: real inventory, no fabricated operations or readings. */
export function buildFleetPreview(now: Date): SeedData {
  const seed = buildSeed(now);
  const empty = Object.fromEntries(Object.keys(seed).map((table) => [table, []])) as unknown as SeedData;
  const preview: SeedData = { ...empty, ...buildFleetPayload(), staff: seed.staff.filter((s) => s.role === "direccion").slice(0, 1).map((s) => ({ ...s, phone: null, receives_alerts: false })) };
  // This explicit QA fixture can only exist in the local, in-memory preview.
  if (process.env.NODE_ENV === "production" || process.env.DEMO_MODE !== "1" || process.env.FLEET_PREVIEW !== "1" || process.env.CHECKLIST_PREVIEW !== "1") return preview;
  const crane = preview.cranes.find((c) => c.fleet_profile?.maintenance_plans.some((p) => p.checklist_steps?.length));
  const plan = crane?.fleet_profile?.maintenance_plans.find((p) => p.checklist_steps?.length);
  if (!crane || !plan) throw new Error("La vista de prueba necesita un plan con pasos de mantenimiento.");
  const order: MaintenanceOrder = {
    id: crypto.randomUUID(), crane_id: crane.id, kind: "preventivo", title: `DEMO · ${plan.title}`,
    description: "DEMO — prueba local del checklist. No representa un servicio programado ni realizado.",
    scheduled_start: now.toISOString(), scheduled_end: new Date(now.getTime() + 2 * 60 * 60_000).toISOString(),
    status: "programado", mechanic_id: null, cost: 0, hour_meter_at: null, created_by: "web", completed_at: null,
    created_at: now.toISOString(), plan_id: plan.id, checklist_version: plan.checklist_version ?? null,
  };
  const bundle = createMaintenanceSnapshot(crane, plan, order, now);
  return {
    ...preview,
    maintenance_orders: [order],
    inspections: [{ ...bundle.inspection, title: `DEMO · ${bundle.inspection.title}`, access_token: "demo-maintenance-preview" } as Inspection],
    inspection_items: bundle.items as InspectionItem[],
  };
}
