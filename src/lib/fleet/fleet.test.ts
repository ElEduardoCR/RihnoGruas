import test from "node:test";
import assert from "node:assert/strict";
import { buildFleetPayload } from "./payload";
import { importConflicts } from "./import-plan";
import { serviceUsage } from "@/lib/domain/fleet";
import { identificationIssue } from "@/lib/services/rentals";

test("reported identities stay separate; uncertain National chassis do not become extra assets", () => {
  const p = buildFleetPayload();
  assert.equal(p.cranes.length, 23);
  assert.equal(new Set(p.cranes.map((c) => c.code)).size, 23);
  assert.equal(p.cranes.filter((c) => c.brand === "National Crane").length, 1);
  for (const suffix of ["03", "09", "10"]) {
    assert.ok(p.cranes.find((c) => c.code === `GR-${suffix}`));
    assert.ok(p.cranes.find((c) => c.code === `AP-${suffix}`));
  }
  assert.match(p.knowledge_docs[0].content, /otras 2/);
  assert.match(p.knowledge_docs[0].content, /International 2007/);
});

test("import can be resumed and preserves verified data and operator edits", () => {
  const { cranes } = buildFleetPayload();
  assert.deepEqual(importConflicts([], cranes), []);
  assert.deepEqual(importConflicts(cranes, cranes), []);
  const edited = cranes.map((c) => ({ ...c, name: `${c.name} editado`, hour_meter: 1700, capacity_tons: 100 }));
  assert.deepEqual(importConflicts(edited, cranes), []);
  assert.ok(importConflicts([{ ...cranes[1], id: "existing", code: "RH-03", fleet_profile: null }], cranes).length);
  assert.ok(importConflicts([{ ...cranes[1], id: "different" }], cranes).length);
});

test("unknown specifications never become zero or a guessed service deadline", () => {
  for (const c of buildFleetPayload().cranes) {
    assert.equal(c.capacity_tons, null);
    assert.equal(c.boom_length_m, null);
    assert.equal(c.hour_meter, null);
    assert.equal(c.last_service_hours, null);
    assert.equal(c.service_interval_hours, null);
    assert.equal(serviceUsage(c).known, false);
    if (["grua_movil", "camion_grua", "telehandler"].includes(c.type)) assert.ok(identificationIssue(c));
  }
});

test("each equipment category has compatible inspections and sourced maintenance plans", () => {
  const p = buildFleetPayload();
  for (const c of p.cranes) {
    for (const kind of ["revision_total", "post_renta", "diaria"]) assert.ok(p.checklist_templates.some((t) => t.kind === kind && t.crane_types.includes(c.type)));
    const profile = c.fleet_profile!;
    assert.ok(profile.maintenance_plans.length >= 3);
    for (const plan of profile.maintenance_plans) {
      assert.ok(plan.tasks.length > 0);
      assert.ok(plan.source_ids.every((source) => profile.sources.some((s) => s.id === source)));
      if (plan.interval_hours != null || plan.interval_km != null || plan.interval_months != null) {
        assert.ok(["GMK5120B", "GMK5275", "GMK6350"].includes(c.model));
        assert.equal(plan.basis, "manufacturer_family");
      }
    }
  }
  assert.ok(!p.cranes.find((c) => c.code === "GR-22")!.fleet_profile!.sources.some((s) => s.id.includes("liebherr")));
  assert.ok(!p.cranes.find((c) => c.code === "AP-09")!.fleet_profile!.sources.some((s) => s.title.includes("Silverado")));
  assert.ok(!("maintenance_orders" in p));
});

test("imported inspection templates win over legacy templates regardless of query order", async () => {
  const { selectInspectionTemplate } = await import("@/lib/services/inspections");
  const { getFleetTemplateId } = await import("./payload");
  const p = buildFleetPayload();
  const national = p.cranes.find((c) => c.code === "GR-10")!;
  const imported = p.checklist_templates.find((t) => t.id === getFleetTemplateId(national.type, "revision_total"))!;
  const legacy = { ...imported, id: "legacy-articulated-template", name: "Revisión total · Titán" };
  for (const templates of [[legacy, ...p.checklist_templates], [...p.checklist_templates].reverse().concat(legacy)]) {
    assert.equal(selectInspectionTemplate(templates, national, "revision_total")?.id, imported.id);
    assert.equal(selectInspectionTemplate(templates, national, "pre_renta")?.id, getFleetTemplateId(national.type, "pre_renta"));
  }
  assert.equal(selectInspectionTemplate([legacy, { ...imported, active: false }], national, "revision_total")?.id, legacy.id);
  assert.equal(selectInspectionTemplate([legacy, ...p.checklist_templates], { ...national, fleet_profile: null }, "revision_total")?.id, legacy.id);
  assert.equal(getFleetTemplateId("camion_grua", "revision_total"), "53002700-1027-4000-8100-000000000001");
  assert.equal(getFleetTemplateId("grua_movil", "pre_renta"), "53002700-1027-4000-8100-000000000012");
});

test("HIAB inspections require the lifting equipment actually installed", async () => {
  const { getFleetTemplateId } = await import("./payload");
  const p = buildFleetPayload();
  const hiab = p.cranes.find((c) => c.code === "PEND-HIAB")!;
  const templateId = getFleetTemplateId(hiab.type, "revision_total");
  const point = p.checklist_template_items.find((i) => i.template_id === templateId && i.title === "Elementos de elevación instalados")!;
  assert.ok(point);
  assert.match(point.instructions!, /malacate sólo si equipa/);
  assert.match(point.instructions!, /Fotografiar los componentes presentes/);
  assert.ok(!p.checklist_template_items.some((i) => i.template_id === templateId && i.title === "Gancho, cable, poleas y malacate"));
});

test("administrative catalog gaps do not reject an otherwise sound inspection", async () => {
  const { composeInspectionItems, inspectionResult } = await import("@/lib/domain/checklists");
  const p = buildFleetPayload();
  const crane = p.cranes.find((c) => c.code === "GR-10")!;
  const own = p.crane_checklist_items.filter((i) => i.crane_id === crane.id);
  const administrative = own.find((i) => i.section === "Datos de catálogo pendientes")!;
  assert.equal(administrative.critical, false);
  assert.equal(administrative.response_type, "texto");
  assert.equal(administrative.requires_photo, false);
  const answers = composeInspectionItems([], own, []).map((item, index) => ({
    ...item, id: `item-${index}`, inspection_id: "inspection", created_at: "2026-10-27T18:00:00.000Z",
    passed: item.section !== "Datos de catálogo pendientes",
  }));
  assert.equal(inspectionResult(answers), "con_observaciones");
  const unsafe = answers.map((item) => item.critical ? { ...item, passed: false } : item);
  assert.equal(inspectionResult(unsafe), "rechazada");
  const ranger = p.cranes.find((c) => c.code === "AP-02")!;
  assert.ok(p.crane_checklist_items.filter((i) => i.crane_id === ranger.id).every((i) => !i.critical));
});
