import test from "node:test";
import assert from "node:assert/strict";
import { AGENDA_EDIT_TOOLS } from "./agenda-tools";
import type { ReadTool, WriteTool, ToolCtx } from "./tools";
import { demoDb } from "@/lib/db/demo";
import { getStock } from "@/lib/services/inventory";
import { runAgent } from "./run";

const now = new Date("2026-11-08T16:00:00Z");
const read = (name: string) => AGENDA_EDIT_TOOLS.find(t => t.name === name) as ReadTool;
const write = (name: string) => AGENDA_EDIT_TOOLS.find(t => t.name === name) as WriteTool;
async function fixture() {
  const db = demoDb();
  const staff = await db.insert("staff", { full_name: "Prueba agenda", role: "direccion", active: true, receives_alerts: false, alert_topics: [], phone: null, can_authorize: true });
  const code = `GR-TEST-${crypto.randomUUID()}`;
  const crane = await db.insert("cranes", { code, name: "Unidad prueba", active: true, type: "camion_grua", brand: "Prueba", model: "Modelo", capacity_tons: 12 });
  const client = await db.insert("clients", { name: `Cliente ${crypto.randomUUID()}`, contact_name: "Prueba" });
  const rental = await db.insert("rentals", { crane_id: crane.id, client_id: client.id, operator_id: null, start_at: "2026-11-25T13:00:00Z", end_at: "2026-11-26T00:00:00Z", site_address: "Obra anterior", site_notes: "Acceso norte", rate: 1000, rate_unit: "dia", status: "confirmada", notes: "Conservar notas", created_by: "web" });
  const ctx: ToolCtx = { db, staff, now, channel: "web" };
  return { db, ctx, crane, client, rental };
}

test("rental search resolves real IDs and rejects invalid filters", async () => {
  const { ctx, crane, rental } = await fixture();
  const result = await read("consultar_rentas").run({ grua: crane.code, cliente: null, fecha: "2026-11-25" }, ctx) as { rentas: { renta_id: string; url: string }[] };
  assert.equal(result.rentas.length, 1);
  assert.equal(result.rentas[0].renta_id, rental.id);
  assert.ok(result.rentas[0].url.endsWith(`/gruas/${crane.id}#agenda`));
  await assert.rejects(read("consultar_rentas").run({ fecha: "2026-02-31" }, ctx), /fecha/);
  await assert.rejects(read("consultar_rentas").run({ grua: "GR-NO-EXISTE" }, ctx), /unidad/);
});

test("rental corrections require confirmation and preserve unrequested data", async () => {
  const { db, ctx, rental } = await fixture();
  const tool = write("actualizar_renta");
  const prepared = await tool.prepare({ renta_id: rental.id, direccion_obra: "Obra nueva", tarifa: 1500, notas: null }, ctx);
  assert.match(prepared.summary, /Obra anterior → Obra nueva/);
  assert.equal((await db.get("rentals", rental.id))?.site_address, "Obra anterior");
  // An unrelated field edited after preparation must survive confirmation.
  await db.update("rentals", rental.id, { notes: "Nota agregada por otro usuario" });
  const pending = await db.insert("agent_pending_actions", { phone: `web:${ctx.staff.id}`, staff_id: ctx.staff.id, tool: tool.name, args: prepared.args, summary: prepared.summary, status: "pendiente", expires_at: "2026-11-08T17:00:00Z", resolved_at: null, result: null });
  const reply = await runAgent(db, { phone: `web:${ctx.staff.id}`, staffId: ctx.staff.id, trigger: "web", text: "SÍ", expectedPendingId: pending.id, now });
  assert.match(reply.reply, /actualizados/);
  const saved = (await db.get("rentals", rental.id))!;
  assert.equal(saved.site_address, "Obra nueva");
  assert.equal(saved.rate, 1500);
  assert.equal(saved.site_notes, "Acceso norte");
  assert.equal(saved.notes, "Nota agregada por otro usuario");
  assert.equal(saved.start_at, rental.start_at);
  assert.equal(saved.end_at, rental.end_at);
  assert.equal((await db.get("agent_pending_actions", pending.id))?.status, "confirmada");
});

test("rental corrections reject stale proposals, invalid values and unauthorized roles", async () => {
  const { db, ctx, rental } = await fixture();
  const tool = write("actualizar_renta");
  await assert.rejects(tool.prepare({ renta_id: rental.id, tarifa: -2 }, ctx), /tarifa/);
  await assert.rejects(tool.prepare({ renta_id: rental.id }, ctx), /corregir/);
  const prepared = await tool.prepare({ renta_id: rental.id, tarifa: 1400 }, ctx);
  await db.update("rentals", rental.id, { rate: 1700 });
  await assert.rejects(tool.execute(prepared.args, ctx), /cambió/);
  assert.equal((await db.get("rentals", rental.id))?.rate, 1700);
  const unauthorized = { ...ctx, staff: { ...ctx.staff, role: "operador" as const } };
  await assert.rejects(tool.prepare({ renta_id: rental.id, tarifa: 1400 }, unauthorized), /permiso/);
  await assert.rejects(tool.execute(prepared.args, unauthorized), /permiso/);
});

test("cancelling a future rental cancels only its pending inspections", async () => {
  const { db, ctx, rental } = await fixture();
  const pending = await db.insert("inspections", { rental_id: rental.id, crane_id: rental.crane_id, status: "programada" });
  const finished = await db.insert("inspections", { rental_id: rental.id, crane_id: rental.crane_id, status: "completada" });
  const tool = write("cancelar_renta");
  const proposal = await tool.prepare({ renta_id: rental.id }, ctx);
  assert.equal((await db.get("rentals", rental.id))?.status, "confirmada");
  await tool.execute(proposal.args, ctx);
  assert.equal((await db.get("rentals", rental.id))?.status, "cancelada");
  assert.equal((await db.get("inspections", pending.id))?.status, "cancelada");
  assert.equal((await db.get("inspections", finished.id))?.status, "completada");
  await assert.rejects(tool.execute(proposal.args, ctx), /Sólo puedo cancelar/);
});

test("cancellation rechecks dates and refuses a rental already in progress", async () => {
  const { db, ctx, rental } = await fixture();
  const tool = write("cancelar_renta");
  const proposal = await tool.prepare({ renta_id: rental.id }, ctx);
  await db.update("rentals", rental.id, { start_at: "2026-11-08T10:00:00Z", status: "en_curso" });
  await assert.rejects(tool.execute(proposal.args, ctx), /Sólo puedo cancelar/);
  assert.equal((await db.get("rentals", rental.id))?.status, "en_curso");
});

test("physical counts are auditable and reject a changed stock snapshot", async () => {
  const { db, ctx } = await fixture();
  // Avoid outgoing alerts from this isolated fixture.
  for (const s of await db.select("staff")) await db.update("staff", s.id, { receives_alerts: false });
  const item = await db.insert("inventory_items", { sku: `TEST-${crypto.randomUUID()}`, name: "Pieza de prueba", unit: "pza", active: true, unit_cost: 1, min_stock: 0, scope: "general", category: "refaccion" });
  await db.insert("inventory_movements", { item_id: item.id, status: "aplicado", kind: "entrada", qty_delta: 10 });
  const tool = write("registrar_conteo");
  await assert.rejects(tool.prepare({ articulo: item.sku, cantidad_contada: -1 }, ctx), /no negativo/);
  const proposal = await tool.prepare({ articulo: item.sku, cantidad_contada: 8, notas: "Conteo físico de prueba" }, ctx);
  assert.equal((await getStock(db)).find(i => i.id === item.id)?.stock, 10);
  await db.insert("inventory_movements", { item_id: item.id, status: "aplicado", kind: "entrada", qty_delta: 2 });
  await assert.rejects(tool.execute(proposal.args, ctx), /inventario cambió/);
  assert.equal((await db.select("inventory_counts", { eq: { item_id: item.id } })).length, 0);
  const fresh = await tool.prepare({ articulo: item.sku, cantidad_contada: 8, notas: "Conteo revisado" }, ctx);
  await tool.execute(fresh.args, ctx);
  assert.equal((await getStock(db)).find(i => i.id === item.id)?.stock, 8);
  const counts = await db.select("inventory_counts", { eq: { item_id: item.id } });
  assert.equal(counts.length, 1);
  assert.equal(counts[0].system_qty, 12);
  assert.equal(counts[0].counted_qty, 8);
  assert.equal(counts[0].counted_by, ctx.staff.id);
});
