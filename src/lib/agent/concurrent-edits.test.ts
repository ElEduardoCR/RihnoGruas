import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { demoDb } from "@/lib/db/demo";
import { supabaseDb } from "@/lib/db/supabase";
import { editClient, editItem } from "@/lib/services/catalog-edits";
import { prepareCraneUpdate, updateCrane } from "@/lib/services/catalogs";
import { AGENDA_EDIT_TOOLS } from "./agenda-tools";
import { CATALOG_EDIT_TOOLS } from "./catalog-tools";
import type { ToolCtx, WriteTool } from "./tools";

async function fixture() {
  const db = demoDb();
  const staff = await db.insert("staff", { full_name: "Confirmación concurrente", active: true, role: "direccion", receives_alerts: false, alert_topics: [] });
  const client = await db.insert("clients", { name: `Cliente ${crypto.randomUUID()}`, phone: "6141111111", notes: null });
  const item = await db.insert("inventory_items", { sku: `CAS-${crypto.randomUUID()}`, name: "Aceite de prueba", category: "aceite", unit: "litro", location: "A-1", min_stock: 0, unit_cost: 100, active: true });
  const ctx: ToolCtx = { db, staff, now: new Date("2026-11-08T16:00:00Z"), channel: "web" };
  return { db, staff, client, item, ctx };
}

function onlyOneApplied(results: PromiseSettledResult<unknown>[]) {
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.match(String(rejected.reason), /cambi|propuesta/i);
}

test("Supabase conditional updates send ID and null/scalar guards and return null on a stale row", async () => {
  let calls = 0;
  const client = createClient("https://offline.example.test", "offline-test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(init?.method, "PATCH");
      assert.equal(url.pathname, "/rest/v1/clients");
      assert.equal(url.searchParams.get("id"), "eq.client-1");
      assert.equal(url.searchParams.get("notes"), "is.null");
      assert.equal(url.searchParams.get("phone"), "eq.6141111111");
      assert.deepEqual(JSON.parse(String(init?.body)), { notes: "Confirmada" });
      calls += 1;
      return new Response(JSON.stringify(calls === 1 ? [{ id: "client-1", notes: "Confirmada" }] : []), { status: 200, headers: { "Content-Type": "application/json" } });
    } },
  });
  const db = supabaseDb(client);
  assert.equal((await db.updateWhere("clients", "client-1", { notes: "Confirmada" }, { notes: null, phone: "6141111111" }))?.notes, "Confirmada");
  assert.equal(await db.updateWhere("clients", "client-1", { notes: "Confirmada" }, { notes: null, phone: "6141111111" }), null);
  assert.equal(calls, 2);
});

test("simultaneous client confirmations compare null fields atomically", async () => {
  const { db, staff, client } = await fixture();
  onlyOneApplied(await Promise.allSettled([
    editClient(db, client.id, { notes: "Primera nota" }, { notes: null }, staff),
    editClient(db, client.id, { notes: "Segunda nota" }, { notes: null }, staff),
  ]));
  const saved = (await db.get("clients", client.id))!;
  assert.ok(["Primera nota", "Segunda nota"].includes(saved.notes!));
  assert.equal(saved.phone, client.phone);
});

test("simultaneous item confirmations cannot overwrite the first confirmed edit", async () => {
  const { db, staff, item } = await fixture();
  onlyOneApplied(await Promise.allSettled([
    editItem(db, item.id, { location: "B-2" }, { location: item.location }, staff),
    editItem(db, item.id, { location: "C-3" }, { location: item.location }, staff),
  ]));
  const saved = (await db.get("inventory_items", item.id))!;
  assert.ok(["B-2", "C-3"].includes(saved.location!));
  assert.equal(saved.unit, item.unit);
});

test("simultaneous crane confirmations preserve the winning capacity and unrelated fields", async () => {
  const { db, staff } = await fixture();
  const source = (await db.select("cranes"))[0];
  const crane = await db.insert("cranes", { ...source, id: crypto.randomUUID(), code: `CAS-${crypto.randomUUID()}`, capacity_tons: 8 });
  const first = await prepareCraneUpdate(db, crane.id, { capacity_tons: 12 }, staff);
  const second = await prepareCraneUpdate(db, crane.id, { capacity_tons: 15 }, staff);
  await db.update("cranes", crane.id, { notes: "Nota posterior al resumen" });
  onlyOneApplied(await Promise.allSettled([
    updateCrane(db, crane.id, first.patch, first.before, staff),
    updateCrane(db, crane.id, second.patch, second.before, staff),
  ]));
  const saved = (await db.get("cranes", crane.id))!;
  assert.ok([12, 15].includes(saved.capacity_tons!));
  assert.equal(saved.notes, "Nota posterior al resumen");
});

test("simultaneous rental confirmations apply only one proposed rate", async () => {
  const { db, client, ctx } = await fixture();
  const crane = (await db.select("cranes"))[0];
  const rental = await db.insert("rentals", { crane_id: crane.id, client_id: client.id, start_at: "2026-11-25T13:00:00Z", end_at: "2026-11-26T00:00:00Z", rate: 1000, rate_unit: "dia", status: "confirmada", notes: "Conservar" });
  const tool = AGENDA_EDIT_TOOLS.find((t) => t.name === "actualizar_renta") as WriteTool;
  const first = await tool.prepare({ renta_id: rental.id, tarifa: 1500 }, ctx);
  const second = await tool.prepare({ renta_id: rental.id, tarifa: 2000 }, ctx);
  onlyOneApplied(await Promise.allSettled([tool.execute(first.args, ctx), tool.execute(second.args, ctx)]));
  const saved = (await db.get("rentals", rental.id))!;
  assert.ok([1500, 2000].includes(saved.rate!));
  assert.equal(saved.notes, rental.notes);
});

test("item units with movements, counts or purchases cannot be relabeled by chat", async () => {
  for (const table of ["inventory_movements", "inventory_counts", "purchase_items"] as const) {
    const { db, staff, item, ctx } = await fixture();
    await db.insert(table, { item_id: item.id });
    const tool = CATALOG_EDIT_TOOLS.find((t) => t.name === "actualizar_articulo")!;
    await assert.rejects(tool.prepare({ articulo: item.id, unidad: "galón" }, ctx), /unidad/);
    await assert.rejects(editItem(db, item.id, { unit: "galón" }, { unit: "litro" }, staff), /unit/);
    assert.equal((await db.get("inventory_items", item.id))?.unit, "litro");
  }
});

test("chat also preserves unused item units so a first movement cannot race a unit edit", async () => {
  const { db, staff, item, ctx } = await fixture();
  const tool = CATALOG_EDIT_TOOLS.find((t) => t.name === "actualizar_articulo")!;
  assert.equal(Object.hasOwn(tool.parameters.properties as object, "unidad"), false);
  await assert.rejects(tool.prepare({ articulo: item.id, unidad: "galón" }, ctx), /unidad/);
  await assert.rejects(editItem(db, item.id, { unit: "galón" }, { unit: "litro" }, staff), /unit/);
  assert.equal((await db.get("inventory_items", item.id))?.unit, "litro");
});
