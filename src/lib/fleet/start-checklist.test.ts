import test from "node:test";
import assert from "node:assert/strict";
import type { Db, Query, Scalar } from "@/lib/db/types";
import type { ChecklistKind, Inspection, InspectionItem, Staff, TableName, Tables } from "@/lib/types";
import { buildFleetPayload } from "./payload";
import { startChecklist } from "@/lib/services/start-checklist";

const now = new Date("2026-10-27T20:00:00.000Z");
const staff: Staff = {
  id: "reviewer", auth_user_id: null, full_name: "Responsable de prueba", role: "direccion", phone: "+520000000000", email: null,
  license_number: null, license_type: null, license_expires_on: null, receives_alerts: true, alert_topics: ["checklists"],
  can_authorize: true, active: true, created_at: now.toISOString(),
};

/** Local data only; a notification path is an immediate test failure. */
function fixture() {
  const tables = new Map<TableName, unknown[]>();
  const writes: TableName[] = [];
  const rows = <T extends TableName>(table: T) => (tables.get(table) ?? []) as Tables[T][];
  const checkTable = (table: TableName) => assert.ok(!["wa_messages", "alerts"].includes(table), "Starting must not send messages or alerts");
  const matches = (row: Record<string, unknown>, q?: Query) => {
    for (const [k, v] of Object.entries(q?.eq ?? {})) if ((row[k] ?? null) !== v) return false;
    for (const [k, v] of Object.entries(q?.in ?? {})) if (!v.includes(row[k] as Scalar)) return false;
    for (const [k, v] of Object.entries(q?.lte ?? {})) if (String(row[k]) > String(v)) return false;
    for (const [k, v] of Object.entries(q?.gte ?? {})) if (String(row[k]) < String(v)) return false;
    return true;
  };
  const db: Db = {
    mode: "demo",
    async select(table, q) {
      checkTable(table);
      let result = rows(table).filter((r) => matches(r as unknown as Record<string, unknown>, q));
      if (q?.order) {
        const { column, ascending = true } = q.order;
        const value = (r: unknown) => String((r as Record<string, unknown>)[column]);
        result = [...result].sort((a, b) => value(a).localeCompare(value(b)) * (ascending ? 1 : -1));
      }
      return structuredClone(q?.limit ? result.slice(0, q.limit) : result);
    },
    async get(table, id) { checkTable(table); return structuredClone(rows(table).find((r) => r.id === id) ?? null); },
    async insert(table, row) {
      checkTable(table);
      const record = { id: crypto.randomUUID(), access_token: crypto.randomUUID(), created_at: now.toISOString(), started_at: null, photo_hashes: [], photo_paths: [], flags: [], ...structuredClone(row) } as unknown as Tables[typeof table];
      tables.set(table, [...rows(table), record]);
      writes.push(table);
      return structuredClone(record);
    },
    async insertMany(table, records) { return Promise.all(records.map((record) => db.insert(table, record))); },
    async update(table, id, patch) {
      checkTable(table);
      const old = rows(table).find((r) => r.id === id);
      assert.ok(old, `Missing fixture ${table}/${id}`);
      const updated = { ...old, ...structuredClone(patch) };
      tables.set(table, rows(table).map((r) => r.id === id ? updated : r));
      writes.push(table);
      return structuredClone(updated);
    },
    async createMaintenanceBundle(bundle) {
      const order = await db.insert("maintenance_orders", bundle.order);
      await db.insert("inspections", bundle.inspection);
      await db.insertMany("inspection_items", bundle.items);
      return order;
    },
    async remove() { throw new Error("Unexpected removal"); },
    async upload() { throw new Error("Unexpected upload"); },
    async download() { throw new Error("Unexpected download"); },
  };
  const payload = buildFleetPayload();
  tables.set("cranes", structuredClone(payload.cranes));
  tables.set("checklist_templates", structuredClone(payload.checklist_templates));
  tables.set("checklist_template_items", structuredClone(payload.checklist_template_items));
  tables.set("crane_checklist_items", structuredClone(payload.crane_checklist_items));
  tables.set("staff", [structuredClone(staff)]);
  const crane = payload.cranes[0];
  const plan = crane.fleet_profile!.maintenance_plans[0];
  const seed = <T extends TableName>(table: T, records: Tables[T][]) => tables.set(table, structuredClone(records));
  return { db, writes, rows, seed, crane, plan };
}

function pending(craneId: string, patch: Partial<Inspection> = {}): Inspection {
  return {
    id: "pending", crane_id: craneId, rental_id: null, template_id: null, kind: "diaria", title: "Revisión existente",
    scheduled_for: "2026-10-27T18:00:00.000Z", due_by: "2026-10-28T18:00:00.000Z", assigned_to: staff.id,
    status: "programada", access_token: "pending-token", started_at: null, completed_at: null, result: null,
    quality_score: null, quality_flags: [], hour_meter_reading: null, start_lat: null, start_lng: null, signature_name: null,
    ai_summary: null, created_by: "web", created_at: "2026-10-27T18:00:00.000Z", ...patch,
  };
}

function evidence(inspectionId: string): InspectionItem {
  return { id: "step", inspection_id: inspectionId, position: 0, title: "Paso guardado", section: "Revisión", instructions: "Inspeccionar", response_type: "ok_falla", unit: null, min_value: null, max_value: null, requires_photo: true, min_photos: 1, photo_hint: null, critical: true, source: "plantilla", source_reason: null, value_text: null, value_number: null, passed: true, notes: "Nota anterior", photo_paths: ["saved-photo"], photo_hashes: ["saved-hash"], photo_taken_at: null, shown_at: null, answered_at: now.toISOString(), seconds_spent: 30, flags: [], created_at: now.toISOString() };
}

test("start rejects invalid permissions, types, inactive units and foreign plans before writing", async () => {
  const cases: Array<(f: ReturnType<typeof fixture>) => Promise<unknown>> = [
    (f) => startChecklist(f.db, { craneId: f.crane.id, kind: "diaria" }, null, now),
    (f) => startChecklist(f.db, { craneId: f.crane.id, kind: "diaria" }, { ...staff, active: false }, now),
    (f) => startChecklist(f.db, { craneId: f.crane.id, kind: "diaria" }, { ...staff, role: "ventas" }, now),
    (f) => startChecklist(f.db, { craneId: f.crane.id, kind: "wrong" as ChecklistKind }, staff, now),
    (f) => startChecklist(f.db, { craneId: "missing", kind: "diaria" }, staff, now),
    (f) => startChecklist(f.db, { craneId: f.crane.id, kind: "mantenimiento", planId: f.plan.id, durationHours: 2 }, { ...staff, role: "operador" }, now),
    (f) => startChecklist(f.db, { craneId: f.crane.id, kind: "mantenimiento", planId: "foreign", durationHours: 2 }, staff, now),
    (f) => startChecklist(f.db, { craneId: f.crane.id, kind: "mantenimiento", planId: f.plan.id, durationHours: 3 }, staff, now),
    (f) => startChecklist(f.db, { craneId: f.crane.id, kind: "mantenimiento", planId: f.plan.id }, staff, now),
    (f) => startChecklist(f.db, { craneId: f.crane.id, kind: "diaria", planId: f.plan.id }, staff, now),
  ];
  for (const execute of cases) {
    const f = fixture();
    await assert.rejects(execute(f));
    assert.deepEqual(f.writes, []);
  }
  const f = fixture();
  f.seed("cranes", [{ ...f.crane, active: false }]);
  await assert.rejects(startChecklist(f.db, { craneId: f.crane.id, kind: "diaria" }, staff, now), /activa/);
  assert.deepEqual(f.writes, []);
});

test("every operational type starts at its first step, assigned to this user, without messages", async () => {
  for (const kind of ["diaria", "revision_total", "pre_renta", "post_renta"] as const) {
    const f = fixture();
    const result = await startChecklist(f.db, { craneId: f.crane.id, kind }, staff, now);
    assert.equal(result.kind, kind);
    assert.equal(result.status, "en_progreso");
    assert.ok(result.started_at);
    assert.equal(result.assigned_to, staff.id);
    assert.equal(result.scheduled_for, now.toISOString());
    assert.equal(result.due_by, "2026-10-28T20:00:00.000Z");
    assert.ok(f.rows("inspection_items").length > 0);
    assert.equal(f.rows("maintenance_orders").length, 0);
    assert.equal(f.rows("inspections").length, 1);
  }
});

test("starting again resumes a due checklist and preserves its answers instead of duplicating it", async () => {
  for (const status of ["programada", "en_progreso", "vencida"] as const) {
    const f = fixture();
    const existing = pending(f.crane.id, { status, assigned_to: null });
    const saved = evidence(existing.id);
    f.seed("inspections", [existing]);
    f.seed("inspection_items", [saved]);
    const result = await startChecklist(f.db, { craneId: f.crane.id, kind: "diaria" }, staff, now);
    assert.equal(result.id, existing.id);
    assert.equal(result.assigned_to, staff.id);
    assert.equal(result.status, "en_progreso");
    assert.equal(f.rows("inspections").length, 1);
    assert.deepEqual(f.rows("inspection_items"), [saved]);
  }
});

test("resumption does not take another person's, future, other-kind or closed checklist", async () => {
  for (const patch of [
    { assigned_to: "someone-else" },
    { scheduled_for: "2026-10-28T18:00:00.000Z" },
    { kind: "revision_total" as const },
    { status: "completada" as const },
    { status: "cancelada" as const },
  ]) {
    const f = fixture();
    const existing = pending(f.crane.id, patch);
    f.seed("inspections", [existing]);
    const result = await startChecklist(f.db, { craneId: f.crane.id, kind: "diaria" }, staff, now);
    assert.notEqual(result.id, existing.id);
    assert.deepEqual(await f.db.get("inspections", existing.id), existing);
  }
});

test("missing or empty templates and empty pending checklists never begin an empty review", async () => {
  for (const table of ["checklist_templates", "checklist_template_items"] as const) {
    const f = fixture();
    f.seed(table, []);
    await assert.rejects(startChecklist(f.db, { craneId: f.crane.id, kind: "diaria" }, staff, now), /pasos configurados/);
    assert.deepEqual(f.writes, []);
  }
  const f = fixture();
  const existing = pending(f.crane.id);
  f.seed("inspections", [existing]);
  await assert.rejects(startChecklist(f.db, { craneId: f.crane.id, kind: "diaria" }, staff, now), /no tiene pasos/);
  assert.deepEqual(f.writes, []);
});

test("maintenance starts a frozen checklist with the chosen duration and reuses its open order", async () => {
  const f = fixture();
  const input = { craneId: f.crane.id, kind: "mantenimiento" as const, planId: f.plan.id, durationHours: 2 };
  const first = await startChecklist(f.db, input, staff, now);
  assert.equal(first.status, "en_progreso");
  assert.ok(first.started_at);
  assert.equal(first.assigned_to, staff.id);
  const order = f.rows("maintenance_orders")[0];
  assert.equal(order.status, "en_proceso");
  assert.equal(order.scheduled_end, "2026-10-27T22:00:00.000Z");
  assert.equal(first.maintenance_order_id, order.id);
  assert.equal(f.rows("inspection_items").length, f.plan.checklist_steps!.length);
  assert.equal(f.rows("inspection_items")[0].manual_confirmed, false);
  const again = await startChecklist(f.db, { ...input, durationHours: 8 }, staff, new Date(now.getTime() + 30_000));
  assert.equal(again.id, first.id);
  assert.equal(f.rows("maintenance_orders").length, 1);
  assert.equal(f.rows("inspections").length, 1);
  assert.deepEqual(f.rows("maintenance_orders")[0], order, "Resuming preserves the stored reservation duration");
});

test("an open maintenance order with a closed latest attempt requires deliberate closure or repeat", async () => {
  for (const status of ["completada", "cancelada"] as const) {
    const f = fixture();
    const input = { craneId: f.crane.id, kind: "mantenimiento" as const, planId: f.plan.id, durationHours: 2 };
    const first = await startChecklist(f.db, input, staff, now);
    await f.db.update("inspections", first.id, { status });
    const before = [...f.writes];
    await assert.rejects(startChecklist(f.db, input, staff, now), /Cierra la orden o repite/);
    assert.deepEqual(f.writes, before);
    assert.equal(f.rows("maintenance_orders").length, 1);
    assert.equal(f.rows("inspections").length, 1);
  }
});

test("an empty existing maintenance checklist cannot begin or mark its order in progress", async () => {
  const f = fixture();
  const input = { craneId: f.crane.id, kind: "mantenimiento" as const, planId: f.plan.id, durationHours: 2 };
  const first = await startChecklist(f.db, input, staff, now);
  await f.db.update("inspections", first.id, { status: "programada", started_at: null });
  await f.db.update("maintenance_orders", first.maintenance_order_id!, { status: "programado" });
  f.seed("inspection_items", []);
  const before = [...f.writes];
  await assert.rejects(startChecklist(f.db, input, staff, now), /no tiene pasos/);
  assert.deepEqual(f.writes, before);
  assert.equal(f.rows("maintenance_orders")[0].status, "programado");
});

test("a future or expired maintenance reservation cannot start early or late, while an ongoing record can resume", async () => {
  for (const [start, end] of [
    ["2026-10-28T20:00:00.000Z", "2026-10-28T22:00:00.000Z"],
    ["2026-10-26T20:00:00.000Z", "2026-10-27T20:00:00.000Z"],
  ]) {
    const f = fixture();
    const input = { craneId: f.crane.id, kind: "mantenimiento" as const, planId: f.plan.id, durationHours: 2 };
    const first = await startChecklist(f.db, input, staff, now);
    await f.db.update("inspections", first.id, { started_at: null, status: "programada" });
    await f.db.update("maintenance_orders", first.maintenance_order_id!, { scheduled_start: start, scheduled_end: end, status: "programado" });
    const before = [...f.writes];
    await assert.rejects(startChecklist(f.db, input, staff, now), /otro horario reservado/);
    assert.deepEqual(f.writes, before);
    await f.db.update("inspections", first.id, { started_at: first.started_at, status: "en_progreso" });
    await f.db.update("maintenance_orders", first.maintenance_order_id!, { status: "en_proceso" });
    const order = structuredClone(f.rows("maintenance_orders")[0]);
    assert.equal((await startChecklist(f.db, input, staff, now)).id, first.id);
    assert.deepEqual(f.rows("maintenance_orders")[0], order);
  }
});
