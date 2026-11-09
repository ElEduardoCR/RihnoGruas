import test from "node:test";
import assert from "node:assert/strict";
import { Responses, type Response, type ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type { StaffRole, TableName, Tables } from "@/lib/types";
import type { ToolCtx } from "./tools";

test("inventory catalog creation asks, proposes and confirms without inventing stock (offline)", async (t) => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "offline-new-item-key";
  t.after(() => { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Network forbidden in inventory catalog tests"); });
  const { INVENTORY_CATALOG_TOOLS } = await import("./inventory-catalog-tools");
  const { toolsFor } = await import("./tools");
  const { runAgent } = await import("./run");
  const { demoDb } = await import("@/lib/db/demo");
  const { getStock } = await import("@/lib/services/inventory");
  const { validateNewInventoryItem } = await import("@/lib/services/inventory-catalog");
  const tool = INVENTORY_CATALOG_TOOLS[0];

  async function fixture(role: StaffRole = "direccion") {
    const db = demoDb();
    const staff = await db.insert("staff", { full_name: "Alta de prueba", role, active: true, phone: null, receives_alerts: false, alert_topics: [] });
    const ctx: ToolCtx = { db, staff, channel: "web", now: new Date("2026-11-08T16:00:00Z") };
    const args = { sku: `DTE25-${crypto.randomUUID()}`, nombre: `Aceite DTE 25 hidráulico ${crypto.randomUUID()}`, categoria: "aceite", unidad: "litros", alcance: "general", minimo: 20, costo_unitario: 100, requiere_devolucion: false, serializado: false, presentacion: "208 litros", referencia: null, ubicacion: null, notas: "Uso informado por el usuario" };
    return { db, staff, ctx, args, input: { phone: `web:${staff.id}`, staffId: staff.id, now: ctx.now, trigger: "web" as const } };
  }

  await t.test("incomplete DTE 25 asks only for missing data; complete proposal remains unwritten until SÍ", async (t) => {
    const { db, args, input } = await fixture();
    const incomplete = { ...args, sku: null, categoria: null, alcance: null, minimo: null, costo_unitario: null, requiere_devolucion: null, serializado: null };
    const requests: ResponseCreateParamsNonStreaming[] = [];
    t.mock.method(Responses.prototype, "create", async (body: ResponseCreateParamsNonStreaming) => {
      requests.push(structuredClone(body));
      const i = requests.length - 1;
      const output = i % 2 === 0
        ? [{ type: "function_call", id: `fc_${i}`, call_id: `call_${i}`, name: tool.name, arguments: JSON.stringify(i === 0 ? incomplete : args), status: "completed" }]
        : [{ type: "message", id: `msg_${i}`, role: "assistant", status: "completed", content: [{ type: "output_text", text: i === 1 ? "Confirma SKU y controles; indica costo por litro y mínimo." : "Revisa la propuesta y responde SÍ.", annotations: [] }] }];
      return { id: `resp_${i}`, status: "completed", output, output_text: "" } as Response;
    });
    const initial = await runAgent(db, { ...input, text: `Agrega ${args.nombre}, referencia/presentación 208 litros, uso por litros` });
    assert.equal(initial.pendingId, null);
    assert.equal((await db.select("inventory_items", { eq: { sku: args.sku } })).length, 0);
    const missing = JSON.stringify(initial.toolCalls[0].result);
    assert.match(missing, /Faltan datos/);
    assert.match(missing, /SKU.*categoría.*mínimo.*costo/);
    assert.match(missing, /Puedes sugerir.*categoría aceite/);
    assert.doesNotMatch(missing.split(". Pregunta")[0], /(?:alta: |, )(?:nombre|unidad de consumo|presentación)(?:,|$)/);

    const proposal = await runAgent(db, { ...input, text: `Acepto SKU ${args.sku}, categoría aceite, uso general, sin serie ni devolución. Costo 100 por litro y mínimo 20 litros.` });
    assert.ok(proposal.pendingId);
    assert.match(proposal.pending ?? "", /Presentación: 208 litros/);
    assert.match(proposal.pending ?? "", /Unidad de consumo y movimientos: litro/);
    assert.match(proposal.pending ?? "", /100 MXN por litro/);
    assert.equal((await db.select("inventory_items", { eq: { sku: args.sku } })).length, 0);
    const confirmed = await runAgent(db, { ...input, text: "SÍ", expectedPendingId: proposal.pendingId });
    assert.match(confirmed.reply, /dado de alta/);
    const item = (await db.select("inventory_items", { eq: { sku: args.sku.toUpperCase() } }))[0];
    assert.ok(item);
    assert.equal(item.unit, "litro");
    assert.equal(item.unit_cost, 100);
    assert.equal(item.min_stock, 20);
    assert.match(item.notes ?? "", /Presentación: 208 litros\nUnidad de consumo: litro/);
    assert.equal((await getStock(db)).find((row) => row.id === item.id)?.stock, 0);
    assert.equal((await db.select("inventory_movements", { eq: { item_id: item.id } })).length, 0);
    assert.equal((await db.select("inventory_compat", { eq: { item_id: item.id } })).length, 0);
    assert.equal(requests.length, 4, "Confirmation executes the reviewed payload without another model call");
  });

  await t.test("only active catalog managers may prepare and confirm; role revocation is reread", async () => {
    for (const role of ["almacen", "operador", "mecanico", "ventas"] as StaffRole[]) {
      const { ctx, args } = await fixture(role);
      assert.equal(toolsFor(ctx.staff).includes(tool), false);
      await assert.rejects(tool.prepare(args, ctx), /Dirección o Administración/);
    }
    const { db, ctx, args } = await fixture("administracion");
    assert.ok(toolsFor(ctx.staff).includes(tool));
    const prepared = await tool.prepare(args, ctx);
    await db.update("staff", ctx.staff.id, { role: "almacen" });
    await assert.rejects(tool.execute(prepared.args, ctx), /Dirección o Administración/);
    await db.update("staff", ctx.staff.id, { role: "administracion", active: false });
    await assert.rejects(tool.prepare(args, ctx), /Dirección o Administración/);
    assert.equal((await db.select("inventory_items", { eq: { sku: args.sku.toUpperCase() } })).length, 0);
  });

  await t.test("malformed, hidden stock and technical values never prepare; units retain their meaning", async () => {
    const { db, ctx, args } = await fixture();
    for (const patch of [{ costo_unitario: null }, { minimo: null }, { costo_unitario: Infinity }, { minimo: -1 }, { categoria: "hidraulico" }, { unidad: "208 litros" }, { requiere_devolucion: "no" }, { alcance: "especifico" }, { existencia: 208 }, { initialStock: 208 }, { compatCraneIds: ["crane"] }, { nombre: {} }]) {
      await assert.rejects(tool.prepare({ ...args, ...patch }, ctx));
    }
    const prepared = await tool.prepare(args, ctx);
    const input = prepared.args.input as Record<string, unknown>;
    await assert.rejects(tool.execute({ input: { ...input, unit_cost: NaN } }, ctx), /número finito/);
    await assert.rejects(tool.execute({ input: { ...input, stock: 208 } }, ctx), /no admite stock/);
    assert.equal(validateNewInventoryItem({ ...input, unit: "m2" }).unit, "m²");
    assert.equal(validateNewInventoryItem({ ...input, unit: "m3" }).unit, "m³");
    assert.equal((await db.select("inventory_items", { eq: { sku: args.sku.toUpperCase() } })).length, 0);
  });

  await t.test("existing or newly occupied SKUs and indistinguishable names require a new proposal", async () => {
    const { db, ctx, args } = await fixture();
    const prepared = await tool.prepare(args, ctx);
    await db.insert("inventory_items", { sku: args.sku.toUpperCase(), name: "Registro concurrente", active: false });
    await assert.rejects(tool.execute(prepared.args, ctx), /SKU.*ya existe.*inactivo/);
    await assert.rejects(tool.prepare({ ...args, sku: args.sku.toLowerCase() }, ctx), /SKU.*ya existe/);
    const other = await fixture();
    await other.db.insert("inventory_items", { sku: `OTHER-${crypto.randomUUID()}`, name: other.args.nombre, active: true });
    await assert.rejects(tool.prepare(other.args, other.ctx), /Ya existe un artículo llamado/);
  });

  await t.test("parallel inserts with the same normalized SKU respect the database unique constraint", async (t) => {
    const { db, ctx, args } = await fixture();
    const first = await tool.prepare(args, ctx);
    const second = await tool.prepare({ ...args, sku: args.sku.toLowerCase() }, ctx);
    const insert = db.insert.bind(db);
    const occupied = new Set<string>();
    let attempts = 0;
    // Demo has no SQL indexes: reproduce the existing inventory_items.sku UNIQUE boundary.
    t.mock.method(db, "insert", async (table: TableName, row: Partial<Tables[TableName]>) => {
      if (table === "inventory_items") {
        attempts += 1;
        const sku = (row as Partial<Tables["inventory_items"]>).sku!;
        if (occupied.has(sku)) throw new Error('[db] insert inventory_items: duplicate key value violates unique constraint "inventory_items_sku_key"');
        occupied.add(sku);
      }
      return insert(table, row);
    });
    const results = await Promise.allSettled([tool.execute(first.args, ctx), tool.execute(second.args, ctx)]);
    assert.equal(attempts, 2, "Both validated snapshots reach the unique insert boundary");
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    assert.match(String(rejected.reason), /acaba de ser registrado.*no se creó un duplicado/);
    assert.equal((await db.select("inventory_items", { eq: { sku: args.sku.toUpperCase() } })).length, 1);
  });
});
