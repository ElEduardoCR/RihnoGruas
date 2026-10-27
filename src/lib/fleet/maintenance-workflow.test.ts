import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Db, MaintenanceBundle, Query, Scalar, StoredFile } from "@/lib/db/types";
import type { Inspection, InspectionItem, MaintenanceOrder, TableName, Tables } from "@/lib/types";
import type { MaintenancePlan } from "./types";
import { buildFleetPayload } from "./payload";
import { assertMaintenanceEvidence, createMaintenanceSnapshot } from "@/lib/domain/maintenance-checklists";
import { completeMaintenance, repeatMaintenanceChecklist, scheduleMaintenance } from "@/lib/services/maintenance";
import { answerItem, completeInspection, startInspection, uploadItemPhoto, type PhotoRef } from "@/lib/services/inspections";
import { toWizardItem } from "@/app/c/[token]/types";

const created = "2026-10-27T18:00:00.000Z";

/** An isolated store: these tests never open a configured Supabase connection. */
function memoryDb() {
  const tables = new Map<TableName, unknown[]>();
  const files = new Map<string, StoredFile>();
  const writes: { table: TableName; id: string }[] = [];
  const bundles: MaintenanceBundle[] = [];
  const rows = <T extends TableName>(table: T) => (tables.get(table) ?? []) as Tables[T][];
  const matches = (row: Record<string, unknown>, q?: Query) => {
    for (const [k, v] of Object.entries(q?.eq ?? {})) if (row[k] !== v) return false;
    for (const [k, v] of Object.entries(q?.neq ?? {})) if (row[k] === v) return false;
    for (const [k, v] of Object.entries(q?.in ?? {})) if (!v.includes(row[k] as Scalar)) return false;
    for (const [k, v] of Object.entries(q?.contains ?? {})) if (!Array.isArray(row[k]) || !v.every((value) => (row[k] as unknown[]).includes(value))) return false;
    for (const k of q?.isNull ?? []) if (row[k] != null) return false;
    return true;
  };
  const db: Db = {
    mode: "demo",
    async select(table, q) {
      let result = rows(table).filter((r) => matches(r as unknown as Record<string, unknown>, q));
      if (q?.order) {
        const { column, ascending = true } = q.order;
        const value = (r: unknown) => String((r as Record<string, unknown>)[column]);
        result = [...result].sort((a, b) => value(a).localeCompare(value(b)) * (ascending ? 1 : -1));
      }
      return structuredClone(q?.limit ? result.slice(0, q.limit) : result);
    },
    async get(table, id) { return structuredClone(rows(table).find((r) => r.id === id) ?? null); },
    async insert(table, row) {
      const record = { id: crypto.randomUUID(), created_at: created, ...structuredClone(row) } as Tables[typeof table];
      tables.set(table, [...rows(table), record]);
      writes.push({ table, id: record.id });
      return structuredClone(record);
    },
    async insertMany(table, records) { return Promise.all(records.map((record) => db.insert(table, record))); },
    async update(table, id, patch) {
      const index = rows(table).findIndex((r) => r.id === id);
      assert.notEqual(index, -1, `Fixture row ${table}/${id} must exist`);
      const record = { ...rows(table)[index], ...structuredClone(patch) };
      tables.set(table, rows(table).map((r, i) => i === index ? record : r));
      writes.push({ table, id });
      return structuredClone(record);
    },
    async remove() { throw new Error("Unexpected removal"); },
    async upload(bucket, path, file) { files.set(`${bucket}/${path}`, structuredClone(file)); },
    async download(bucket, path) { return structuredClone(files.get(`${bucket}/${path}`) ?? null); },
    async createMaintenanceBundle(bundle) {
      bundles.push(structuredClone(bundle));
      const order = bundle.repeat ? (await db.get("maintenance_orders", bundle.order.id!))! : await db.insert("maintenance_orders", bundle.order);
      await db.insert("inspections", bundle.inspection);
      await db.insertMany("inspection_items", bundle.items);
      return order;
    },
  };
  return { db, writes, bundles, seed<T extends TableName>(table: T, records: Tables[T][]) { tables.set(table, structuredClone(records)); } };
}

function fixture() {
  const crane = structuredClone(buildFleetPayload().cranes[0]);
  const source = crane.fleet_profile!.sources[0];
  const plan: MaintenancePlan = {
    id: "test-plan", title: "Servicio documentado", description: "Plan de prueba", tasks: ["Revisar"], cadence: "Según manual", interval_hours: null, interval_km: null, interval_months: null,
    basis: "manufacturer_family", source_ids: [source.id], checklist_version: "test-v1",
    checklist_steps: ["Identificar manual", "Revisar componente", "Verificar trabajo"].map((title, i) => ({
      id: `step-${i}`, section: "Servicio", title, instructions: "Seguir el procedimiento verificado.", procedure_steps: ["Asegurar equipo", "Seguir manual"],
      response_type: i === 0 ? "texto" : "ok_falla", unit: null, min_value: null, max_value: null, min_photos: i === 0 ? 2 : 1,
      photo_requirements: i === 0 ? ["Placa legible", "Manual aplicable"] : ["Componente revisado"], photo_hint: "Fotografiar la unidad real", critical: i > 0,
      source_ids: [source.id], reference_locator: "Sección de mantenimiento", requires_manual_confirmation: i === 0,
    })),
  };
  crane.fleet_profile!.maintenance_plans = [plan];
  const order: MaintenanceOrder = {
    id: "order-1", crane_id: crane.id, kind: "preventivo", title: plan.title, description: null, scheduled_start: created, scheduled_end: "2026-10-27T20:00:00.000Z",
    status: "programado", mechanic_id: null, cost: 0, hour_meter_at: null, created_by: "web", completed_at: null, created_at: created, plan_id: plan.id, checklist_version: plan.checklist_version,
  };
  const snapshot = createMaintenanceSnapshot(crane, plan, order, new Date(created));
  const inspection = { ...snapshot.inspection, status: "en_progreso", started_at: created } as Inspection;
  const items = snapshot.items as InspectionItem[];
  const store = memoryDb();
  store.seed("cranes", [crane]);
  store.seed("maintenance_orders", [order]);
  store.seed("inspections", [inspection]);
  store.seed("inspection_items", items);
  return { ...store, crane, plan, order, inspection, items };
}

function completedItems(items: InspectionItem[]) {
  return items.map((item) => ({
    ...item, answered_at: created, passed: true, manual_confirmed: item.requires_manual_confirmation === true,
    value_text: item.requires_manual_confirmation ? "Manual de esta unidad, edición y serie verificadas" : null,
    photo_paths: Array.from({ length: item.min_photos }, (_, n) => `${item.inspection_id}/${item.id}-${n}.jpg`),
    photo_hashes: Array.from({ length: item.min_photos }, (_, n) => createHash("sha256").update(`${item.id}-${n}`).digest("hex")),
    photo_slots: Array.from({ length: item.min_photos }, (_, n) => n),
  }));
}

async function uploadedPhotos(db: Db, inspection: Inspection, item: InspectionItem): Promise<PhotoRef[]> {
  return Promise.all(Array.from({ length: item.min_photos }, async (_, slot) => {
    const bytes = new Uint8Array([255, 216, 255, slot, item.position]);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const path = `${inspection.id}/${item.id}-${slot}-${hash.slice(0, 8)}.jpg`;
    await db.upload("evidencias", path, { bytes, contentType: "image/jpeg" });
    return { path, hash, slot, takenAt: created };
  }));
}

const answer = (photos: PhotoRef[]) => ({ passed: null, valueNumber: null, valueText: "Manual, edición y serie cotejados", notes: null, shownAt: created, photos, manualConfirmed: true });

test("a scheduled checklist freezes its source, instructions and required photos", () => {
  const { crane, plan, order } = fixture();
  const snapshot = createMaintenanceSnapshot(crane, plan, order, new Date(created));
  const first = snapshot.items[0];
  plan.checklist_steps![0].procedure_steps[0] = "Cambio posterior";
  plan.checklist_steps![0].photo_requirements[0] = "Otra toma";
  assert.equal(first.procedure_steps![0], "Asegurar equipo");
  assert.equal(first.photo_requirements![0], "Placa legible");
  assert.equal(first.manual_confirmed, false);
  assert.deepEqual(first.photo_slots, []);
  assert.match(first.reference_label!, /Sección de mantenimiento/);
  assert.equal(snapshot.inspection.maintenance_order_id, order.id);
  assert.equal(new Set(snapshot.items.map((i) => i.id)).size, snapshot.items.length);
  assert.throws(() => assertMaintenanceEvidence(snapshot.items as InspectionItem[]), /Falta completar/);
});

test("a snapshot refuses a plan without its manual gate, source or photo specification", () => {
  const { crane, plan, order } = fixture();
  for (const change of [
    (p: MaintenancePlan) => { p.checklist_steps![0].requires_manual_confirmation = false; },
    (p: MaintenancePlan) => { p.checklist_steps![1].source_ids = ["missing"]; },
    (p: MaintenancePlan) => { p.checklist_steps![0].photo_requirements = ["Only one"]; },
  ]) {
    const bad = structuredClone(plan);
    change(bad);
    assert.throws(() => createMaintenanceSnapshot(crane, bad, order));
  }
});

test("completion requires the verified manual and every labelled photo slot", () => {
  const { items } = fixture();
  const good = completedItems(items);
  assert.doesNotThrow(() => assertMaintenanceEvidence(good));
  for (const change of [
    (rows: InspectionItem[]) => { rows[0].manual_confirmed = false; },
    (rows: InspectionItem[]) => { rows[0].photo_slots = [0, 2]; },
    (rows: InspectionItem[]) => { rows[0].photo_slots = [0, 0]; },
    (rows: InspectionItem[]) => { rows[0].photo_hashes.pop(); },
    (rows: InspectionItem[]) => { rows[1].answered_at = null; },
  ]) {
    const bad = structuredClone(good);
    change(bad);
    assert.throws(() => assertMaintenanceEvidence(bad));
  }
  assert.throws(() => assertMaintenanceEvidence([]));
  assert.throws(() => assertMaintenanceEvidence(good.filter((i) => !i.requires_manual_confirmation)));
});

test("resuming preserves the required shot labels, saved slot order and manual confirmation", () => {
  const { items } = fixture();
  const gate = completedItems(items)[0];
  const reversed = { ...gate, photo_paths: [...gate.photo_paths].reverse(), photo_hashes: [...gate.photo_hashes].reverse(), photo_slots: [1, 0] };
  const resumed = toWizardItem(reversed);
  assert.equal(resumed.manual_confirmed, true);
  assert.equal(resumed.answered, true);
  assert.equal(resumed.photo_requirements[resumed.photos[0].slot], "Manual aplicable");
  assert.equal(resumed.photo_requirements[resumed.photos[1].slot], "Placa legible");
  assert.equal(resumed.photos[0].path, gate.photo_paths[1]);
  assert.deepEqual(toWizardItem({ ...gate, photo_slots: undefined }).photos.map((p) => p.slot), [0, 1], "Legacy inspection photos still receive their original sequential slots");
});

test("manual confirmation and its written identification are mandatory before answering", async () => {
  const { db, inspection, items } = fixture();
  const photos = await uploadedPhotos(db, inspection, items[0]);
  await assert.rejects(answerItem(db, inspection.access_token, items[0].id, { ...answer(photos), manualConfirmed: false }), /manual correcto/);
  await assert.rejects(answerItem(db, inspection.access_token, items[0].id, { ...answer(photos), valueText: " " }), /información solicitada/);
  assert.equal((await db.get("inspection_items", items[0].id))!.answered_at, null);
  const saved = await answerItem(db, inspection.access_token, items[0].id, answer(photos));
  assert.equal(saved.manual_confirmed, true);
  assert.deepEqual(saved.photo_slots, [0, 1]);
});

test("later maintenance steps cannot upload or answer before the manual gate", async () => {
  const { db, inspection, items } = fixture();
  await assert.rejects(answerItem(db, inspection.access_token, items[1].id, { ...answer([]), passed: true }), /pasos anteriores/);
  const bytes = new Uint8Array([255, 216, 255, 0]);
  await assert.rejects(uploadItemPhoto(db, inspection.access_token, items[1].id, { bytes, contentType: "image/jpeg", hash: createHash("sha256").update(bytes).digest("hex"), takenAt: created }), /pasos anteriores/);
  await db.update("inspection_items", items[0].id, { answered_at: created, manual_confirmed: false });
  await assert.rejects(answerItem(db, inspection.access_token, items[1].id, { ...answer([]), passed: true }), /pasos anteriores/);
});

test("upload verifies the hash of the transmitted image bytes", async () => {
  const { db, inspection, items } = fixture();
  const bytes = new Uint8Array([255, 216, 255, 1]);
  const input = { bytes, contentType: "image/jpeg", hash: createHash("sha256").update(bytes).digest("hex"), takenAt: created };
  await assert.rejects(uploadItemPhoto(db, inspection.access_token, items[0].id, { ...input, hash: "0".repeat(64) }), /no coincide/);
  const photo = await uploadItemPhoto(db, inspection.access_token, items[0].id, input);
  assert.equal(photo.hash, input.hash);
  assert.deepEqual((await db.download("evidencias", photo.path))!.bytes, bytes);
});

test("injected paths, false hashes, repeated photos and unfilled slots are rejected", async () => {
  const { db, inspection, items } = fixture();
  const photos = await uploadedPhotos(db, inspection, items[0]);
  const scenarios = [
    [{ ...photos[0], path: `${inspection.id}/${items[0].id}-not-uploaded.jpg` }, photos[1]],
    [{ ...photos[0], path: `other-inspection/${items[0].id}-0.jpg` }, photos[1]],
    [{ ...photos[0], hash: "a".repeat(64) }, photos[1]],
    [photos[0], { ...photos[0], slot: 1 }],
    [photos[0], { ...photos[1], slot: 2 }],
  ];
  for (const invalid of scenarios) await assert.rejects(answerItem(db, inspection.access_token, items[0].id, answer(invalid)));
  assert.equal((await db.get("inspection_items", items[0].id))!.answered_at, null);
  await answerItem(db, inspection.access_token, items[0].id, answer(photos));
  await assert.rejects(answerItem(db, inspection.access_token, items[0].id, answer(photos.map((p) => ({ ...p, slot: 1 - p.slot! })))), /conservar la toma/);
});

test("cancelled checklists and orders cannot start, answer, upload or sign", async () => {
  for (const target of ["inspection", "order"] as const) {
    const { db, inspection, order, items, writes } = fixture();
    if (target === "inspection") await db.update("inspections", inspection.id, { status: "cancelada" });
    else await db.update("maintenance_orders", order.id, { status: "cancelado" });
    const before = writes.length;
    await assert.rejects(startInspection(db, inspection.access_token, {}), /cancelad/);
    await assert.rejects(answerItem(db, inspection.access_token, items[0].id, answer([])), /cancelad/);
    await assert.rejects(uploadItemPhoto(db, inspection.access_token, items[0].id, { bytes: new Uint8Array(), contentType: "image/jpeg", hash: "0".repeat(64), takenAt: null }), /cancelad/);
    await assert.rejects(completeInspection(db, inspection.access_token, { signatureName: "Técnico de prueba", hourMeter: null }), /cancelad/);
    assert.equal(writes.length, before);
  }
});

test("signing cannot approve missing manual evidence even if every step is marked answered", async () => {
  const { db, seed, inspection, items } = fixture();
  const completed = completedItems(items);
  completed[0].manual_confirmed = false;
  seed("inspection_items", completed);
  await assert.rejects(completeInspection(db, inspection.access_token, { signatureName: "Técnico de prueba", hourMeter: null }), /manual/);
  assert.equal((await db.get("inspections", inspection.id))!.status, "en_progreso");
});

test("scheduling a plan creates its frozen checklist in the same bundle and prevents duplicate orders", async () => {
  const { db, seed, crane, plan, bundles } = fixture();
  seed("maintenance_orders", []);
  seed("inspections", []);
  seed("inspection_items", []);
  const input = { craneId: crane.id, kind: "preventivo" as const, title: "Solicitud", start: new Date(created), end: new Date("2026-10-27T20:00:00.000Z"), createdBy: "web" as const, planId: plan.id };
  const order = await scheduleMaintenance(db, input);
  assert.equal(bundles.length, 1);
  assert.equal(bundles[0].inspection.maintenance_order_id, order.id);
  assert.equal(bundles[0].items.length, plan.checklist_steps!.length);
  assert.equal(order.title, plan.title);
  await assert.rejects(scheduleMaintenance(db, input), /orden abierta/);
  assert.equal(bundles.length, 1);
});

test("closing a plan requires its latest approved attempt with complete evidence and no failures", async () => {
  const { db, seed, order, inspection, items, writes } = fixture();
  seed("inspection_items", completedItems(items));
  for (const patch of [
    { status: "en_progreso" as const, result: null, quality_score: null },
    { status: "completada" as const, result: "rechazada" as const, quality_score: 100 },
    { status: "completada" as const, result: "aprobada" as const, quality_score: 69 },
  ]) {
    seed("inspections", [{ ...inspection, ...patch }]);
    await assert.rejects(completeMaintenance(db, order.id, 50, new Date(created)), /checklist/);
  }
  const approved: Inspection = { ...inspection, status: "completada", result: "aprobada", quality_score: 100 };
  seed("inspections", [approved, { ...inspection, id: "later-attempt", created_at: "2026-10-27T19:00:00.000Z" }]);
  await assert.rejects(completeMaintenance(db, order.id, 50, new Date(created)), /checklist/);
  seed("inspections", [approved]);
  const failed = completedItems(items);
  failed[1].passed = false;
  seed("inspection_items", failed);
  await assert.rejects(completeMaintenance(db, order.id, 50, new Date(created)), /fallas/);
  seed("inspection_items", completedItems(items));
  const done = await completeMaintenance(db, order.id, 50, new Date(created));
  assert.equal(done.status, "completado");
  assert.equal(writes.filter((w) => w.table === "cranes").length, 0, "A specific plan must not reset the whole unit's service counter");
  const count = writes.length;
  const again = await completeMaintenance(db, order.id, 900, new Date("2026-10-28T00:00:00.000Z"));
  assert.equal(again.cost, 50);
  assert.equal(writes.length, count, "Closing twice must not overwrite the original completion");
});

test("repeat keeps the failed attempt and its frozen procedure, but clears all evidence and approval", async () => {
  const { db, seed, order, inspection, items, crane, bundles } = fixture();
  seed("inspections", [{ ...inspection, status: "completada", result: "rechazada", quality_score: 95, signature_name: "Primera firma", completed_at: created }]);
  seed("inspection_items", completedItems(items));
  crane.fleet_profile!.maintenance_plans[0].checklist_steps![1].title = "Plan editado después";
  seed("cranes", [crane]);
  const next = await repeatMaintenanceChecklist(db, order.id);
  assert.ok(next);
  assert.notEqual(next.id, inspection.id);
  assert.notEqual(next.access_token, inspection.access_token);
  assert.equal(next.signature_name, null);
  assert.equal(next.result, null);
  assert.equal(bundles[0].repeat, true);
  assert.equal((await db.get("inspections", inspection.id))!.result, "rechazada");
  const fresh = await db.select("inspection_items", { eq: { inspection_id: next.id } });
  assert.equal(fresh[1].title, items[1].title);
  for (const item of fresh) {
    assert.equal(item.answered_at, null);
    assert.equal(item.manual_confirmed, false);
    assert.equal(item.passed, null);
    assert.deepEqual(item.photo_paths, []);
    assert.deepEqual(item.photo_hashes, []);
    assert.deepEqual(item.photo_slots, []);
  }
  await assert.rejects(repeatMaintenanceChecklist(db, order.id), /checklist pendiente/);
});
