import test from "node:test";
import assert from "node:assert/strict";
import { Responses, type Response, type ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type { ReadTool, ToolCtx, WriteTool } from "./tools";
import type { StaffRole } from "@/lib/types";

test("crane edits and app navigation (offline)", async (t) => {
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "offline-crane-test-key";
  t.after(() => { if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Network forbidden in crane tests"); });
  const { toolByName, toolsFor } = await import("./tools");
  const { env } = await import("@/lib/env");
  const { runAgent } = await import("./run");
  const { demoDb } = await import("@/lib/db/demo");
  const { buildFleetPayload } = await import("@/lib/fleet/payload");
  const edit = toolByName("actualizar_grua") as WriteTool;
  const navigate = toolByName("navegar_app") as ReadTool;
  assert.equal(edit?.kind, "write");
  assert.equal(navigate?.kind, "read");

  async function fixture() {
    const db = demoDb();
    const existing = (await db.select("cranes", { eq: { code: "GR-03" } }))[0];
    const source = existing ?? (await db.select("cranes"))[0];
    const data = { ...source, code: "GR-03", name: "Unidad de prueba", brand: "Marca", model: "Modelo", year: 2018, capacity_tons: 8, plates: "ABC-123", serial_number: "SERIE-03", hour_meter: 1200, last_service_hours: 1000, service_interval_hours: 250, notes: "Nota original", active: true, fleet_profile: buildFleetPayload().cranes[0].fleet_profile };
    const crane = existing ? await db.update("cranes", existing.id, data) : await db.insert("cranes", { ...data, id: crypto.randomUUID() });
    const staff = await db.insert("staff", { full_name: "Prueba de edición", role: "direccion", active: true, phone: null, receives_alerts: false, alert_topics: [], can_authorize: true });
    const ctx: ToolCtx = { db, staff, now: new Date("2026-11-08T16:00:00.000Z"), channel: "web" };
    return { db, crane, ctx, input: { phone: `web:${staff.id}`, staffId: staff.id, now: ctx.now, trigger: "web" as const } };
  }

  await t.test("GR 03 capacity request prepares 12 tons and changes only capacity after SÍ", async (t) => {
    const { db, crane, input } = await fixture();
    const properties = edit.parameters.properties as Record<string, unknown>;
    const args = { ...Object.fromEntries(Object.keys(properties).map((field) => [field, field === "borrar_campos" ? [] : null])), grua: "gr 03", capacidad_toneladas: 12 };
    const requests: ResponseCreateParamsNonStreaming[] = [];
    t.mock.method(Responses.prototype, "create", async (body: ResponseCreateParamsNonStreaming) => {
      requests.push(structuredClone(body));
      const output = requests.length === 1
        ? [{ type: "function_call", id: "item_capacity", call_id: "call_capacity", name: "actualizar_grua", arguments: JSON.stringify(args), status: "completed" }]
        : [{ type: "message", id: "msg_capacity", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Preparé el cambio de capacidad de GR-03 a 12 toneladas. Responde SÍ para confirmar.", annotations: [] }] }];
      return { id: "resp_capacity", status: "completed", output, output_text: requests.length === 1 ? "" : "Preparé el cambio de capacidad de GR-03 a 12 toneladas. Responde SÍ para confirmar." } as Response;
    });
    const proposal = await runAgent(db, { ...input, text: "agrega que la gr 03 tiene capacidad de 12 toneladas" });
    assert.ok(proposal.pendingId);
    assert.match(proposal.pending ?? "", /GR-03/);
    assert.match(proposal.pending ?? "", /8.*12/);
    assert.deepEqual(await db.get("cranes", crane.id), crane);
    const saved = await db.get("agent_pending_actions", proposal.pendingId);
    assert.equal(saved?.tool, "actualizar_grua");
    assert.deepEqual(saved?.args.patch, { capacity_tons: 12 });
    const confirmed = await runAgent(db, { ...input, text: "SÍ", expectedPendingId: proposal.pendingId });
    assert.match(confirmed.reply, /actualizad/);
    assert.deepEqual(await db.get("cranes", crane.id), { ...crane, capacity_tons: 12 });
    assert.equal(requests.length, 2);
    assert.equal(confirmed.pendingId, null);
    assert.ok(requests[0].tools?.some((tool) => tool.type === "function" && tool.name === "actualizar_grua" && tool.strict));
  });

  await t.test("only management can edit, including when permissions are revoked after preparation", async () => {
    const { db, crane, ctx } = await fixture();
    const prepared = await edit.prepare({ grua: "GR03", capacidad_toneladas: 12 }, ctx);
    for (const role of ["operador", "mecanico", "almacen", "ventas"] as StaffRole[]) {
      const restricted = { ...ctx, staff: { ...ctx.staff, role } };
      assert.equal(toolsFor(restricted.staff).some((tool) => tool.name === edit.name), false);
      await assert.rejects(edit.prepare({ grua: "GR03", capacidad_toneladas: 12 }, restricted), /Dirección o Administración/);
      await assert.rejects(edit.execute(prepared.args, restricted), /Dirección o Administración/);
    }
    await db.update("staff", ctx.staff.id, { role: "operador" });
    await assert.rejects(edit.execute(prepared.args, ctx), /Dirección o Administración/);
    assert.deepEqual(await db.get("cranes", crane.id), crane);
  });

  await t.test("invalid values and unrelated fields cannot mutate a crane", async () => {
    const { db, crane, ctx } = await fixture();
    for (const patch of [
      { capacidad_toneladas: 0 }, { capacidad_toneladas: -12 }, { capacidad_toneladas: NaN }, { capacidad_toneladas: Infinity },
      { capacidad_toneladas: "12" }, { anio: 2026.5 }, { fecha_adquisicion: "2026-02-30" }, { tipo: "inexistente" },
      { ultimo_servicio_horas: 2000 }, { intervalo_servicio_horas: 0 }, { nombre: " " }, { fleet_profile: {} }, { status: "disponible" }, { borrar_campos: ["codigo"] },
    ]) await assert.rejects(edit.prepare({ grua: "GR-03", ...patch }, ctx));
    assert.deepEqual(await db.get("cranes", crane.id), crane);
  });

  await t.test("null values preserve the full record and only explicit clearing removes fields", async () => {
    const { db, crane, ctx } = await fixture();
    const prepared = await edit.prepare({ grua: "GR03", capacidad_toneladas: 12, placas: null, numero_serie: null, notas: null, borrar_campos: [] }, ctx);
    await edit.execute(prepared.args, ctx);
    assert.deepEqual(await db.get("cranes", crane.id), { ...crane, capacity_tons: 12 });
    const clear = await edit.prepare({ grua: "GR03", placas: null, borrar_campos: ["placas"] }, ctx);
    await edit.execute(clear.args, ctx);
    assert.deepEqual(await db.get("cranes", crane.id), { ...crane, capacity_tons: 12, plates: null });
  });

  await t.test("a changed proposed value needs a new proposal while unrelated changes are preserved", async () => {
    const { db, crane, ctx } = await fixture();
    const prepared = await edit.prepare({ grua: "GR03", capacidad_toneladas: 12 }, ctx);
    await db.update("cranes", crane.id, { capacity_tons: 10 });
    await assert.rejects(edit.execute(prepared.args, ctx), /cambiaron|nueva propuesta/);
    assert.equal((await db.get("cranes", crane.id))?.capacity_tons, 10);
    const fresh = await edit.prepare({ grua: "GR03", capacidad_toneladas: 12 }, ctx);
    await db.update("cranes", crane.id, { notes: "Nota de otra persona" });
    await edit.execute(fresh.args, ctx);
    assert.deepEqual(await db.get("cranes", crane.id), { ...crane, capacity_tons: 12, notes: "Nota de otra persona" });
  });

  await t.test("navigation returns known app links and respects destination permissions", async () => {
    const { crane, ctx } = await fixture();
    const destinations: Record<string, string> = { inicio: "/", flota: "/gruas", calendario: "/calendario", inventario: "/inventario", checklists: "/checklists", catalogos: "/catalogos", clientes: "/catalogos?tab=clientes", personal: "/catalogos?tab=personal", articulos: "/catalogos?tab=articulos", resumen: "/resumen", agente: "/agente", cuenta: "/cuenta", ficha_grua: `/gruas/${crane.id}` };
    for (const [destino, url] of Object.entries(destinations)) {
      const result = await navigate.run({ destino, grua: destino === "ficha_grua" ? "gr 03" : null }, ctx) as { url: string; etiqueta: string };
      const link = new URL(result.url);
      assert.equal(link.origin, new URL(env.appUrl).origin);
      assert.equal(`${link.pathname}${link.search}`, url);
      assert.ok(result.etiqueta);
    }
    const operator = { ...ctx, staff: { ...ctx.staff, role: "operador" as const } };
    for (const destino of ["catalogos", "clientes", "personal", "articulos", "resumen", "agente"]) await assert.rejects(navigate.run({ destino, grua: null }, operator), /permiso|Dirección|Administración/);
    const operatorLink = await navigate.run({ destino: "ficha_grua", grua: "GR03" }, operator) as { url: string };
    assert.equal(new URL(operatorLink.url).pathname, `/gruas/${crane.id}`);
    await assert.rejects(navigate.run({ destino: "https://example.test", grua: null }, ctx));
    await assert.rejects(navigate.run({ destino: "ficha_grua", grua: "GR-NO-EXISTE" }, ctx));
  });
});
