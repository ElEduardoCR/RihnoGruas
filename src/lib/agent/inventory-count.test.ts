import test from "node:test";
import assert from "node:assert/strict";
import type { Db, Query } from "@/lib/db/types";
import type { TableName } from "@/lib/types";
import type { WriteTool } from "./tools";

test("confirmed inventory counts are atomic (offline)", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Network forbidden in count tests"); });
  const { demoDb } = await import("@/lib/db/demo");
  const { getStock, registerCount } = await import("@/lib/services/inventory");
  const { AGENDA_EDIT_TOOLS } = await import("./agenda-tools");
  const tool = AGENDA_EDIT_TOOLS.find((entry) => entry.name === "registrar_conteo") as WriteTool;

  async function fixture(qty = 8) {
    const db = demoDb();
    const staff = await db.insert("staff", { full_name: "Conteo de prueba", role: "almacen", active: true, receives_alerts: false, phone: null, alert_topics: [] });
    const item = await db.insert("inventory_items", { sku: `COUNT-${crypto.randomUUID()}`, name: "Pieza de prueba", category: "consumible", unit: "pieza", scope: "general", min_stock: 0, unit_cost: 10, requires_return: false, serialized: false, active: true });
    if (qty) await db.insert("inventory_movements", { item_id: item.id, kind: "entrada", qty_delta: qty, status: "aplicado", channel: "web" });
    const select = db.select.bind(db);
    t.mock.method(db, "select", async (table: TableName, query?: Query) => {
      if (table === "staff" && query?.eq?.receives_alerts) return [];
      return select(table, query);
    });
    return { db, item, staff, input: { itemId: item.id, countedQty: 5, expectedStock: qty, expectedUnit: item.unit, countedBy: staff.id } };
  }

  await t.test("two 8-to-5 confirmations yield stock 5, one count, and one adjustment", async (t) => {
    const { db, item, input } = await fixture();
    const bundle = t.mock.fn(db.createInventoryCountBundle!);
    db.createInventoryCountBundle = bundle;
    const results = await Promise.allSettled([registerCount(db, input), registerCount(db, input)]);
    assert.equal(bundle.mock.callCount(), 2, "Both snapshots reach the atomic boundary");
    assert.equal(results.filter((entry) => entry.status === "fulfilled").length, 1);
    const loser = results.find((entry) => entry.status === "rejected");
    assert.ok(loser?.status === "rejected");
    assert.match(String(loser.reason), /inventario cambió/);
    assert.equal((await getStock(db)).find((row) => row.id === item.id)?.stock, 5);
    const counts = await db.select("inventory_counts", { eq: { item_id: item.id } });
    const adjustments = await db.select("inventory_movements", { eq: { item_id: item.id, kind: "ajuste" } });
    assert.equal(counts.length, 1);
    assert.equal(counts[0].system_qty, 8);
    assert.equal(counts[0].variance, -3);
    assert.equal(adjustments.length, 1);
    assert.equal(adjustments[0].qty_delta, -3);
  });

  await t.test("the chat count passes its expected stock to the atomic boundary", async (t) => {
    const { db, item, staff } = await fixture();
    const ctx = { db, staff, now: new Date("2026-11-08T16:00:00Z"), channel: "web" as const };
    const prepared = await tool.prepare({ articulo: item.sku, cantidad_contada: 5, notas: null }, ctx);
    const bundle = t.mock.fn(db.createInventoryCountBundle!);
    db.createInventoryCountBundle = bundle;
    await tool.execute(prepared.args, ctx);
    assert.equal(bundle.mock.callCount(), 1);
    assert.equal(bundle.mock.calls[0].arguments[0].expectedStock, 8);
    assert.equal(bundle.mock.calls[0].arguments[0].expectedUnit, "pieza");
  });

  await t.test("stale units, revoked staff and absent RPC never fall back to partial writes", async () => {
    const { db, item, staff, input } = await fixture();
    await db.update("inventory_items", item.id, { unit: "caja" });
    await assert.rejects(registerCount(db, input), /inventario cambió/);
    await db.update("inventory_items", item.id, { unit: "pieza" });
    await db.update("staff", staff.id, { active: false });
    await assert.rejects(registerCount(db, input), /permiso/);
    const missing: Db = { ...db, mode: "supabase", createInventoryCountBundle: undefined };
    await assert.rejects(registerCount(missing, input), /atómico.*no está disponible/);
    assert.equal((await db.select("inventory_counts", { eq: { item_id: item.id } })).length, 0);
    assert.equal((await db.select("inventory_movements", { eq: { item_id: item.id, kind: "ajuste" } })).length, 0);
  });

  await t.test("an alert failure reports a saved count and never repeats its adjustment", async (t) => {
    const { db, item, input } = await fixture();
    const select = db.select.bind(db);
    t.mock.method(console, "error", () => {});
    t.mock.method(db, "select", async (table: TableName, query?: Query) => {
      if (table === "alerts") throw new Error("Offline alert failure");
      return select(table, query);
    });
    const result = await registerCount(db, input);
    assert.match(result.alertWarning ?? "", /quedaron guardados/);
    assert.equal(result.variance, -3);
    assert.equal((await getStock(db)).find((row) => row.id === item.id)?.stock, 5);
    await assert.rejects(registerCount(db, input), /inventario cambió/);
    assert.equal((await db.select("inventory_counts", { eq: { item_id: item.id } })).length, 1);
  });

  await t.test("tiny floating point differences in expectations do not reject a decimal count", async () => {
    const { db, item, input } = await fixture(0.1);
    await db.insert("inventory_movements", { item_id: item.id, kind: "entrada", qty_delta: 0.2, status: "aplicado", channel: "web" });
    const result = await registerCount(db, { ...input, expectedStock: 0.3, countedQty: 0.2 });
    assert.equal(result.count.system_qty, 0.1 + 0.2, "Comparison does not round the stored ledger");
    assert.ok(Math.abs((await getStock(db)).find((row) => row.id === item.id)!.stock - 0.2) < 1e-12);
    await assert.rejects(registerCount(db, { ...input, expectedStock: 0.20001, countedQty: 0.1 }), /inventario cambió/);
  });
});
