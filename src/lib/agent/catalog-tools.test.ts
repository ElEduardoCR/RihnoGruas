import test from "node:test";
import assert from "node:assert/strict";
import { Responses, type Response, type ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type { ToolCtx } from "./tools";
import type { StaffRole } from "@/lib/types";

test("catalog edits preserve data and require confirmation (offline)", async (t) => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "offline-catalog-test-key";
  t.after(() => { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Network forbidden in catalog tests"); });
  const { CATALOG_EDIT_TOOLS } = await import("./catalog-tools");
  const { toolsFor } = await import("./tools");
  const { runAgent } = await import("./run");
  const { demoDb } = await import("@/lib/db/demo");
  const clientTool = CATALOG_EDIT_TOOLS.find((tool) => tool.name === "actualizar_cliente")!;
  const itemTool = CATALOG_EDIT_TOOLS.find((tool) => tool.name === "actualizar_articulo")!;

  async function fixture(role: StaffRole = "direccion") {
    const db = demoDb();
    const staff = await db.insert("staff", { id: crypto.randomUUID(), role, active: true, full_name: "Prueba de catálogo", phone: null, receives_alerts: false, alert_topics: [], can_authorize: role === "direccion" });
    const client = await db.insert("clients", { name: `Cliente ${crypto.randomUUID()}`, contact_name: "Ana", phone: "6141234567", email: "ana@example.test", rfc: "XAXX010101000", address: "Patio norte", notes: "Conservar esta nota" });
    const item = await db.insert("inventory_items", { sku: `TEST-${crypto.randomUUID()}`, name: "Filtro de prueba", category: "filtro", unit: "pieza", scope: "especifico", min_stock: 3, unit_cost: 150, location: "A-1", requires_return: true, serialized: true, notes: "Conservar controles", active: true });
    const crane = (await db.select("cranes"))[0];
    await db.insert("inventory_compat", { item_id: item.id, crane_id: crane.id, expected_qty_per_service: 1 });
    await db.insert("inventory_movements", { item_id: item.id, kind: "ajuste", qty_delta: 8, unit_cost: 150, status: "aplicado", reason: "Fixture", channel: "web" });
    const ctx: ToolCtx = { db, staff, now: new Date("2026-11-08T16:00:00.000Z"), channel: "web" };
    return { db, client, item, ctx, input: { phone: `web:${staff.id}`, staffId: staff.id, now: ctx.now, trigger: "web" as const } };
  }

  await t.test("client and item changes stay pending until SÍ and retain every unrequested field", async (t) => {
    const { db, client, item, input } = await fixture();
    for (const entry of [
      { tool: clientTool, args: { cliente: client.id, telefono: "(614) 765-4321", nombre: null, contacto: null, correo: null, rfc: null, direccion: null, notas: null, borrar_campos: [] }, table: "clients" as const, record: client, expected: { ...client, phone: "6147654321" }, text: `Cambia el teléfono de ${client.name} a 6147654321` },
      { tool: itemTool, args: { articulo: item.sku, ubicacion: "B-4", minimo: 0, nombre: null, categoria: null, costo_unitario: null, notas: null, borrar_campos: [] }, table: "inventory_items" as const, record: item, expected: { ...item, location: "B-4", min_stock: 0 }, text: `El ${item.sku} está en B-4 y su mínimo es cero` },
    ]) {
      const compat = await db.select("inventory_compat", { eq: { item_id: item.id } });
      const stock = await db.select("inventory_movements", { eq: { item_id: item.id } });
      const requests: ResponseCreateParamsNonStreaming[] = [];
      const mock = t.mock.method(Responses.prototype, "create", async (body: ResponseCreateParamsNonStreaming) => {
        requests.push(structuredClone(body));
        const output = requests.length === 1
          ? [{ type: "function_call", id: "item_edit", call_id: "call_edit", name: entry.tool.name, arguments: JSON.stringify(entry.args), status: "completed" }]
          : [{ type: "message", id: "msg_edit", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Revisa los cambios y responde SÍ para confirmar.", annotations: [] }] }];
        return { id: "resp_edit", status: "completed", output, output_text: requests.length === 1 ? "" : "Revisa los cambios y responde SÍ para confirmar." } as Response;
      });
      const proposal = await runAgent(db, { ...input, text: entry.text });
      assert.ok(proposal.pendingId);
      assert.match(proposal.pending ?? "", /→/);
      assert.deepEqual(await db.get(entry.table, entry.record.id), entry.record);
      const confirmed = await runAgent(db, { ...input, text: "SÍ", expectedPendingId: proposal.pendingId });
      assert.match(confirmed.reply, /actualizado/);
      assert.match(confirmed.reply, /\]\(https?:\/\/[^\s]+\/catalogos\?tab=/);
      assert.deepEqual(await db.get(entry.table, entry.record.id), entry.expected);
      assert.deepEqual(await db.select("inventory_compat", { eq: { item_id: item.id } }), compat);
      assert.deepEqual(await db.select("inventory_movements", { eq: { item_id: item.id } }), stock);
      assert.equal(requests.length, 2);
      mock.mock.restore();
    }
  });

  await t.test("only management can prepare or execute a catalog edit", async () => {
    const { db, client, item, ctx } = await fixture();
    const clientPrepared = await clientTool.prepare({ cliente: client.id, contacto: "Beatriz" }, ctx);
    const itemPrepared = await itemTool.prepare({ articulo: item.id, ubicacion: "B-4" }, ctx);
    for (const role of ["operador", "mecanico", "almacen", "ventas"] as StaffRole[]) {
      const restricted = { ...ctx, staff: { ...ctx.staff, role } };
      assert.equal(toolsFor(restricted.staff).some((tool) => CATALOG_EDIT_TOOLS.includes(tool as typeof clientTool)), false);
      await assert.rejects(clientTool.prepare({ cliente: client.id, contacto: "Beatriz" }, restricted), /Dirección o Administración/);
      await assert.rejects(clientTool.execute(clientPrepared.args, restricted), /Dirección o Administración/);
      await assert.rejects(itemTool.prepare({ articulo: item.id, ubicacion: "B-4" }, restricted), /Dirección o Administración/);
      await assert.rejects(itemTool.execute(itemPrepared.args, restricted), /Dirección o Administración/);
    }
    await db.update("staff", ctx.staff.id, { role: "operador" });
    await assert.rejects(clientTool.execute(clientPrepared.args, ctx), /Dirección o Administración/);
    await assert.rejects(itemTool.execute(itemPrepared.args, ctx), /Dirección o Administración/);
  });

  await t.test("invalid values, ambiguous selectors and forbidden stock fields never prepare changes", async () => {
    const { db, client, item, ctx } = await fixture();
    for (const patch of [{ correo: "incorrecto" }, { rfc: "ABC" }, { telefono: "abc123" }, { nombre: " " }, { activo: false }, { borrar_campos: ["nombre"] }]) {
      await assert.rejects(clientTool.prepare({ cliente: client.id, ...patch }, ctx));
    }
    for (const patch of [{ minimo: -1 }, { minimo: NaN }, { costo_unitario: Infinity }, { categoria: "desconocida" }, { unidad: " " }, { existencia: 99 }, { scope: "general" }, { requires_return: false }, { borrar_campos: ["minimo"] }]) {
      await assert.rejects(itemTool.prepare({ articulo: item.id, ...patch }, ctx));
    }
    await db.insert("clients", { ...client, id: crypto.randomUUID(), name: `${client.name} sucursal` });
    await db.insert("inventory_items", { ...item, id: crypto.randomUUID(), sku: `TEST-${crypto.randomUUID()}`, name: "Filtro duplicado de prueba" });
    await assert.rejects(clientTool.prepare({ cliente: "Cliente", contacto: "Alguien" }, ctx), /varios clientes/);
    await assert.rejects(itemTool.prepare({ articulo: "Filtro", ubicacion: "B" }, ctx), /varios artículos/);
    assert.deepEqual(await db.get("clients", client.id), client);
    assert.deepEqual(await db.get("inventory_items", item.id), item);
  });

  await t.test("null preserves data and clearing requires explicit fields", async () => {
    const { db, client, item, ctx } = await fixture();
    await assert.rejects(clientTool.prepare({ cliente: client.id, telefono: null, correo: null, borrar_campos: [] }, ctx), /al menos un dato/);
    const prep = await clientTool.prepare({ cliente: client.id, correo: null, borrar_campos: ["correo"] }, ctx);
    await clientTool.execute(prep.args, ctx);
    assert.deepEqual(await db.get("clients", client.id), { ...client, email: null });
    const itemPrep = await itemTool.prepare({ articulo: item.id, ubicacion: null, borrar_campos: ["ubicacion"] }, ctx);
    await itemTool.execute(itemPrep.args, ctx);
    assert.deepEqual(await db.get("inventory_items", item.id), { ...item, location: null });
    await assert.rejects(itemTool.prepare({ articulo: item.id, ubicacion: "A", borrar_campos: ["ubicacion"] }, ctx), /no ambas/);
  });

  await t.test("changes to requested fields invalidate proposals, other fields survive confirmation", async () => {
    const { db, client, item, ctx } = await fixture();
    const clientPrep = await clientTool.prepare({ cliente: client.id, contacto: "Beatriz" }, ctx);
    await db.update("clients", client.id, { contact_name: "Carla" });
    await assert.rejects(clientTool.execute(clientPrep.args, ctx), /nueva propuesta/);
    assert.equal((await db.get("clients", client.id))?.contact_name, "Carla");
    const itemPrep = await itemTool.prepare({ articulo: item.id, ubicacion: "B-4" }, ctx);
    await db.update("inventory_items", item.id, { location: "C-5" });
    await assert.rejects(itemTool.execute(itemPrep.args, ctx), /nueva propuesta/);
    const fresh = await itemTool.prepare({ articulo: item.id, ubicacion: "B-4" }, ctx);
    await db.update("inventory_items", item.id, { notes: "Nueva nota concurrente" });
    await itemTool.execute(fresh.args, ctx);
    assert.deepEqual(await db.get("inventory_items", item.id), { ...item, location: "B-4", notes: "Nueva nota concurrente" });
  });

  await t.test("execution revalidates names and patches without accepting extra fields", async () => {
    const { db, client, item, ctx } = await fixture();
    const nextName = `Nuevo nombre ${crypto.randomUUID()}`;
    const prep = await clientTool.prepare({ cliente: client.id, nombre: nextName }, ctx);
    await db.insert("clients", { ...client, id: crypto.randomUUID(), name: nextName });
    await assert.rejects(clientTool.execute(prep.args, ctx), /otro cliente/);
    const itemPrep = await itemTool.prepare({ articulo: item.id, minimo: 4 }, ctx);
    await assert.rejects(itemTool.execute({ ...itemPrep.args, patch: { ...itemPrep.args.patch as object, requires_return: false } }, ctx), /No se puede cambiar/);
    await assert.rejects(itemTool.execute({ ...itemPrep.args, patch: { min_stock: -1 } }, ctx), /mayor o igual/);
    assert.deepEqual(await db.get("inventory_items", item.id), item);
  });
});
