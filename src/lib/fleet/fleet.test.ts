import test from "node:test";
import assert from "node:assert/strict";
import { buildFleetPayload } from "./payload";
import { importConflicts } from "./import-plan";
import { docsHealth, docStatus, serviceUsage } from "@/lib/domain/fleet";
import { cancelRental, createRental, documentIssues, findAvailable, identificationIssue } from "@/lib/services/rentals";
import { demoDb } from "@/lib/db/demo";

test("an unrecorded expiration never certifies document validity", () => {
  const now = new Date("2026-11-09T16:00:00.000Z");
  const unknown = { expires_on: null };
  const expired = { expires_on: "2026-10-01" };
  const approaching = { expires_on: "2026-11-20" };
  const current = { expires_on: "2027-11-09" };
  assert.deepEqual(docStatus(unknown, now), { health: "sin_fecha", days: null });
  assert.equal(docStatus(expired, now).health, "vencido");
  assert.equal(docStatus(approaching, now).health, "por_vencer");
  assert.equal(docStatus(current, now).health, "ok");
  assert.equal(docsHealth([unknown], now), "sin_fecha");
  assert.equal(docsHealth([current, unknown], now), "sin_fecha");
  assert.equal(docsHealth([unknown, approaching], now), "por_vencer");
  assert.equal(docsHealth([unknown, approaching, expired], now), "vencido");
  assert.equal(docsHealth([current], now), "ok");
});

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

test("recording administrative capacity never clears identification restrictions on imported lifting equipment", () => {
  const imported = buildFleetPayload().cranes.find((crane) => crane.code === "GR-03")!;
  for (const type of ["grua_movil", "camion_grua", "grua_armable", "telehandler"] as const) {
    const original = { ...imported, type, capacity_tons: null };
    const issue = identificationIssue(original);
    assert.ok(issue);
    assert.equal(identificationIssue({ ...original, capacity_tons: 12 }), issue);
    assert.equal(identificationIssue({ ...original, fleet_profile: null }), null);
    assert.equal(identificationIssue({ ...original, fleet_profile: null, capacity_tons: 12 }), null);
  }
  for (const type of ["tractocamion", "remolque", "vehiculo_apoyo"] as const) {
    assert.equal(identificationIssue({ ...imported, type, capacity_tons: 12 }), null);
  }
});

test("GR-03 can store and filter 12 tonnes while its rental restriction stays unchanged", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("This verification must never call a remote service"); });
  const db = demoDb();
  const payload = buildFleetPayload();
  const imported = payload.cranes.find((crane) => crane.code === "GR-03")!;
  const crane = await db.insert("cranes", { ...structuredClone(imported), id: crypto.randomUUID() });
  const template = payload.checklist_templates.find((row) => row.kind === "revision_total" && row.crane_types.includes(crane.type))!;
  await db.insert("checklist_templates", { ...template, id: crypto.randomUUID() });
  const now = new Date("2026-11-08T16:00:00.000Z");
  const from = new Date("2026-11-10T16:00:00.000Z");
  const to = new Date("2026-11-11T16:00:00.000Z");
  const before = await documentIssues(db, crane.id, to, now);
  assert.ok(before.some((issue) => issue.blocking && /tabla de cargas/.test(issue.text)));

  const saved = await db.update("cranes", crane.id, { capacity_tons: 12 });
  assert.equal(saved.capacity_tons, 12);
  assert.deepEqual(saved.fleet_profile, crane.fleet_profile);
  assert.deepEqual(await documentIssues(db, crane.id, to, now), before);
  const matches = await findAvailable(db, { from, to, minCapacity: 12 }, now);
  const result = matches.find((match) => match.crane.id === crane.id);
  assert.ok(result, "The recorded value still participates in capacity filters");
  assert.equal(result.crane.capacity_tons, 12);
  assert.equal(result.available, false);
  assert.deepEqual(result.docIssues, before);

  await assert.rejects(createRental(db, { craneId: crane.id, clientName: "Cliente de prueba", start: from, end: to, createdBy: "agente" }, now), /tabla de cargas/);
  assert.equal((await db.select("rentals", { eq: { crane_id: crane.id } })).length, 0);
  assert.equal((await db.select("inspections", { eq: { crane_id: crane.id } })).length, 0);
});

test("rental cancellation preserves an inspection completed after the pending list was read", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("This verification must never call a remote service"); });
  const db = demoDb();
  const rentalSeed = (await db.select("rentals"))[0];
  const inspectionSeed = (await db.select("inspections"))[0];
  assert.ok(rentalSeed && inspectionSeed);
  const rental = await db.insert("rentals", { ...rentalSeed, id: crypto.randomUUID(), status: "confirmada" });
  const finishing = await db.insert("inspections", { ...inspectionSeed, id: crypto.randomUUID(), rental_id: rental.id, status: "programada", completed_at: null });
  const stillPending = await db.insert("inspections", { ...inspectionSeed, id: crypto.randomUUID(), rental_id: rental.id, status: "vencida", completed_at: null });
  const completedAt = "2026-11-08T18:00:00.000Z";
  const select = db.select.bind(db);
  t.mock.method(db, "select", async (...args: Parameters<typeof db.select>) => {
    const snapshot = await select(...args);
    if (args[0] === "inspections" && args[1]?.eq?.rental_id === rental.id) {
      await db.update("inspections", finishing.id, { status: "completada", completed_at: completedAt });
    }
    return snapshot;
  });

  const cancelled = await cancelRental(db, rental.id, { status: "confirmada" });
  assert.equal(cancelled.status, "cancelada");
  const finished = await db.get("inspections", finishing.id);
  assert.equal(finished?.status, "completada");
  assert.equal(finished?.completed_at, completedAt);
  assert.equal((await db.get("inspections", stillPending.id))?.status, "cancelada");
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
