import test from "node:test";
import assert from "node:assert/strict";
import type { Db, Query, Scalar } from "@/lib/db/types";
import type { Staff, TableName, Tables, ToolCallLog } from "@/lib/types";
import { toolByName, toolsFor, type ToolCtx, type WriteTool } from "./tools";
import { runAgent } from "./run";
import { hasOpenAI } from "@/lib/env";
import { CONFIRM_RE } from "./prompt";
import { fallbackAgent } from "./fallback";

const now = new Date("2026-11-08T16:00:00.000Z");

/** Isolated database; these tests never access a configured service or send messages. */
function memoryDb() {
  const tables = new Map<TableName, unknown[]>();
  const rows = <T extends TableName>(table: T) => (tables.get(table) ?? []) as Tables[T][];
  const matches = (row: Record<string, unknown>, q?: Query) => {
    for (const [key, value] of Object.entries(q?.eq ?? {})) if (row[key] !== value) return false;
    for (const [key, values] of Object.entries(q?.in ?? {})) if (!values.includes(row[key] as Scalar)) return false;
    for (const [key, value] of Object.entries(q?.gte ?? {})) if (String(row[key]) < String(value)) return false;
    return true;
  };
  const db: Db = {
    mode: "demo",
    async select(table, q) {
      let result = rows(table).filter((row) => matches(row as unknown as Record<string, unknown>, q));
      if (q?.order) {
        const { column, ascending = true } = q.order;
        const value = (row: unknown) => String((row as Record<string, unknown>)[column]);
        result = [...result].sort((a, b) => value(a).localeCompare(value(b)) * (ascending ? 1 : -1));
      }
      return structuredClone(q?.limit ? result.slice(0, q.limit) : result);
    },
    async get(table, id) { return structuredClone(rows(table).find((row) => row.id === id) ?? null); },
    async insert(table, input) {
      const row = { id: crypto.randomUUID(), created_at: now.toISOString(), ...structuredClone(input) } as Tables[typeof table];
      tables.set(table, [...rows(table), row]);
      return structuredClone(row);
    },
    async insertMany(table, inputs) { return Promise.all(inputs.map((row) => db.insert(table, row))); },
    async update(table, id, patch) {
      const existing = rows(table).find((row) => row.id === id);
      assert.ok(existing);
      const updated = { ...existing, ...structuredClone(patch) };
      tables.set(table, rows(table).map((row) => row.id === id ? updated : row));
      return structuredClone(updated);
    },
    async updatePendingAction(id, expectedStatus, patch, guard) {
      const existing = rows("agent_pending_actions").find((row) => row.id === id);
      if (!existing || existing.status !== expectedStatus) return null;
      if (guard?.staffId && existing.staff_id !== guard.staffId) return null;
      if (guard?.unexpiredAt && Date.parse(existing.expires_at) <= Date.parse(guard.unexpiredAt)) return null;
      const updated = { ...existing, ...structuredClone(patch) };
      tables.set("agent_pending_actions", rows("agent_pending_actions").map((row) => row.id === id ? updated : row));
      return structuredClone(updated);
    },
    async updateWhere(table, id, patch, expected) {
      const existing = rows(table).find((row) => row.id === id && Object.entries(expected).every(([key, value]) => ((row as unknown as Record<string, unknown>)[key] ?? null) === value));
      if (!existing) return null;
      const updated = { ...existing, ...structuredClone(patch) };
      tables.set(table, rows(table).map((row) => row.id === id ? updated : row));
      return structuredClone(updated);
    },
    async remove() { throw new Error("Unexpected deletion"); },
    async upload() { throw new Error("Unexpected upload"); },
    async download() { throw new Error("Unexpected download"); },
  };
  return db;
}

async function fixture(role: Staff["role"] = "direccion") {
  const db = memoryDb();
  const staff = await db.insert("staff", {
    id: "staff-session", full_name: "María Martínez", role, active: true, phone: null,
    email: "maria@example.test", auth_user_id: "auth-session", receives_alerts: false,
    alert_topics: [], can_authorize: role === "direccion", license_number: null,
    license_type: null, license_expires_on: null,
  });
  const ctx: ToolCtx = { db, staff, now, channel: "web" };
  return { db, staff, ctx };
}

const clientArgs = { nombre: "Constructora del Norte", contacto: null, telefono: null, correo: null, rfc: null, direccion: null, notas: null };
const clientTool = toolByName("registrar_cliente") as WriteTool;

async function pendingClient(db: Db, ctx: ToolCtx) {
  const prepared = await clientTool.prepare(clientArgs, ctx);
  return db.insert("agent_pending_actions", { phone: `web:${ctx.staff.id}`, staff_id: ctx.staff.id, tool: clientTool.name, args: prepared.args, summary: prepared.summary, status: "pendiente", expires_at: new Date(now.getTime() + 30 * 60_000).toISOString(), resolved_at: null, result: null });
}

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function confirmationInput(ctx: ToolCtx, pendingId: string, text = "SÍ") {
  return { phone: `web:${ctx.staff.id}`, staffId: ctx.staff.id, expectedPendingId: pendingId, text, trigger: "web" as const, now };
}

test("catalog tools enforce roles and authorization capabilities", async () => {
  const { ctx } = await fixture("operador");
  assert.equal(toolsFor(ctx.staff).some((tool) => tool.name === "registrar_cliente" || tool.name === "registrar_grua"), false);
  await assert.rejects(clientTool.prepare(clientArgs, ctx), /Dirección o Administración/);
  await assert.rejects(clientTool.execute({ input: { name: "Inválido" } }, ctx), /Dirección o Administración/);
  const manager = { ...ctx.staff, role: "administracion" as const, can_authorize: false };
  assert.equal(toolsFor(manager).some((tool) => tool.name === "resolver_salida"), false);
});

test("client preparation validates without writing and confirmation uses existing service", async () => {
  const { db, ctx } = await fixture();
  await assert.rejects(clientTool.prepare({ ...clientArgs, correo: "incorrecto" }, ctx), /correo/);
  const prepared = await clientTool.prepare(clientArgs, ctx);
  assert.equal((await db.select("clients")).length, 0);
  const result = await clientTool.execute(prepared.args, ctx);
  assert.match(result.mensaje, /registrado/);
  const clients = await db.select("clients");
  assert.equal(clients.length, 1);
  assert.equal(clients[0].rfc, null);
  await assert.rejects(clientTool.prepare({ ...clientArgs, nombre: "constructora del norte" }, ctx), /ya está registrado/);
});

test("crane onboarding preserves unknown values and rejects duplicate codes", async () => {
  const { db, ctx } = await fixture();
  const tool = toolByName("registrar_grua") as WriteTool;
  const args = { codigo: "gr-99", nombre: "Unidad nueva", tipo: "grua_movil", marca: "Grove", modelo: "RT540E", anio: null, capacidad_toneladas: null, numero_serie: null, placas: null, tarifa_diaria: null, notas: null };
  const prepared = await tool.prepare(args, ctx);
  assert.equal((await db.select("cranes")).length, 0);
  await tool.execute(prepared.args, ctx);
  const cranes = await db.select("cranes");
  assert.equal(cranes[0].code, "GR-99");
  assert.equal(cranes[0].capacity_tons, null);
  assert.equal(cranes[0].daily_rate, null);
  await assert.rejects(tool.prepare(args, ctx), /Ya existe/);
});

test("web confirmation uses the session staff identity without requiring a phone", async () => {
  const { db, ctx } = await fixture();
  const pending = await pendingClient(db, ctx);
  const result = await runAgent(db, { phone: `web:${ctx.staff.id}`, staffId: ctx.staff.id, expectedPendingId: pending.id, text: "SÍ", trigger: "web", now });
  assert.equal(result.staff?.id, ctx.staff.id);
  assert.match(result.reply, /Cliente .* registrado/);
  assert.equal(result.pending, null);
  assert.equal(result.pendingId, null);
  assert.equal((await db.select("clients")).length, 1);
  assert.equal((await db.get("agent_pending_actions", pending.id))?.status, "confirmada");
  const repeat = await runAgent(db, { phone: `web:${ctx.staff.id}`, staffId: ctx.staff.id, text: "SÍ", trigger: "web", now });
  assert.match(repeat.reply, /No hay una acción pendiente/);
  assert.equal((await db.select("clients")).length, 1);
});

test("simultaneous confirmations claim one execution even after both read the same proposal", { timeout: 5000 }, async (t) => {
  const { db, ctx } = await fixture();
  const pending = await pendingClient(db, ctx);
  const bothRead = signal();
  const select = db.select;
  let readers = 0;
  t.mock.method(db, "select", async (table: TableName, query?: Query) => {
    const snapshot = await select(table, query);
    if (table === "agent_pending_actions" && query?.eq?.status === "pendiente" && readers < 2) {
      if (++readers === 2) bothRead.resolve();
      await bothRead.promise;
    }
    return snapshot;
  });
  const execute = t.mock.method(clientTool, "execute", clientTool.execute);
  const replies = await Promise.all([runAgent(db, confirmationInput(ctx, pending.id)), runAgent(db, confirmationInput(ctx, pending.id))]);
  assert.equal(execute.mock.callCount(), 1);
  assert.equal((await db.select("clients")).length, 1);
  assert.equal((await db.get("agent_pending_actions", pending.id))?.status, "confirmada");
  assert.equal(replies.filter((result) => /Cliente .* registrado/.test(result.reply)).length, 1);
  assert.ok(replies.some((result) => /ya se está procesando o fue resuelta/.test(result.reply)));
});

test("a stale cancellation cannot overwrite an execution already claimed", { timeout: 5000 }, async (t) => {
  const { db, ctx } = await fixture();
  const pending = await pendingClient(db, ctx);
  const cancellationRead = signal();
  const resumeCancellation = signal();
  const executionStarted = signal();
  const finishExecution = signal();
  const select = db.select;
  let blockRead = true;
  t.mock.method(db, "select", async (table: TableName, query?: Query) => {
    const snapshot = await select(table, query);
    if (blockRead && table === "agent_pending_actions" && query?.eq?.status === "pendiente") {
      blockRead = false;
      cancellationRead.resolve();
      await resumeCancellation.promise;
    }
    return snapshot;
  });
  const execute = clientTool.execute;
  t.mock.method(clientTool, "execute", async (args: Record<string, unknown>, context: ToolCtx) => {
    executionStarted.resolve();
    await finishExecution.promise;
    return execute(args, context);
  });
  const cancelling = runAgent(db, confirmationInput(ctx, pending.id, "NO"));
  await cancellationRead.promise;
  const confirming = runAgent(db, confirmationInput(ctx, pending.id));
  try {
    await executionStarted.promise;
    resumeCancellation.resolve();
    const cancelled = await cancelling;
    assert.match(cancelled.reply, /no la cancelé/);
    assert.equal((await db.get("agent_pending_actions", pending.id))?.status, "en_proceso");
  } finally {
    resumeCancellation.resolve();
    finishExecution.resolve();
    await Promise.all([cancelling, confirming]);
  }
  assert.equal((await db.select("clients")).length, 1);
  assert.equal((await db.get("agent_pending_actions", pending.id))?.status, "confirmada");
});

test("a stale confirmation cannot execute a proposal that cancellation already resolved", { timeout: 5000 }, async (t) => {
  const { db, ctx } = await fixture();
  const pending = await pendingClient(db, ctx);
  const confirmationRead = signal();
  const resumeConfirmation = signal();
  const select = db.select;
  let blockRead = true;
  t.mock.method(db, "select", async (table: TableName, query?: Query) => {
    const snapshot = await select(table, query);
    if (blockRead && table === "agent_pending_actions" && query?.eq?.status === "pendiente") {
      blockRead = false;
      confirmationRead.resolve();
      await resumeConfirmation.promise;
    }
    return snapshot;
  });
  const execute = t.mock.method(clientTool, "execute", clientTool.execute);
  const confirming = runAgent(db, confirmationInput(ctx, pending.id));
  try {
    await confirmationRead.promise;
    await runAgent(db, confirmationInput(ctx, pending.id, "NO"));
  } finally {
    resumeConfirmation.resolve();
  }
  const result = await confirming;
  assert.match(result.reply, /ya se está procesando o fue resuelta/);
  assert.equal(execute.mock.callCount(), 0);
  assert.equal((await db.select("clients")).length, 0);
  assert.equal((await db.get("agent_pending_actions", pending.id))?.status, "cancelada");
});

test("an execution with an uncertain outcome is terminal and never retried by confirmation", async (t) => {
  const { db, ctx } = await fixture();
  const pending = await pendingClient(db, ctx);
  const execute = clientTool.execute;
  const attempted = t.mock.method(clientTool, "execute", async (args: Record<string, unknown>, context: ToolCtx) => {
    await execute(args, context);
    throw new Error("Se perdió la respuesta después de guardar");
  });
  await runAgent(db, confirmationInput(ctx, pending.id));
  assert.equal((await db.get("agent_pending_actions", pending.id))?.status, "fallida");
  assert.equal((await db.select("clients")).length, 1);
  const repeated = await runAgent(db, confirmationInput(ctx, pending.id));
  assert.equal(repeated.pendingId, null);
  assert.equal(attempted.mock.callCount(), 1);
  assert.equal((await db.select("clients")).length, 1);
  assert.equal((await db.get("agent_pending_actions", pending.id))?.status, "fallida");
});

test("cancelled or expired proposals never create client records", async () => {
  for (const expired of [false, true]) {
    const { db, ctx } = await fixture();
    const pending = await pendingClient(db, ctx);
    if (expired) await db.update("agent_pending_actions", pending.id, { expires_at: new Date(now.getTime() - 1).toISOString() });
    const result = await runAgent(db, { phone: `web:${ctx.staff.id}`, staffId: ctx.staff.id, expectedPendingId: pending.id, text: expired ? "SÍ" : "NO", trigger: "web", now });
    assert.equal(result.pending, null);
    assert.equal((await db.select("clients")).length, 0);
    assert.equal((await db.get("agent_pending_actions", pending.id))?.status, expired ? "expirada" : "cancelada");
  }
});

test("revoked permissions are rechecked before confirming a prepared operation", async () => {
  const { db, ctx } = await fixture();
  const pending = await pendingClient(db, ctx);
  await db.update("staff", ctx.staff.id, { role: "operador" });
  const result = await runAgent(db, { phone: `web:${ctx.staff.id}`, staffId: ctx.staff.id, expectedPendingId: pending.id, text: "SÍ", trigger: "web", now });
  assert.match(result.reply, /No tienes permiso/);
  assert.equal((await db.select("clients")).length, 0);
  assert.equal((await db.get("agent_pending_actions", pending.id))?.status, "cancelada");
});

test("preparation rejects impossible dates instead of silently moving the action", async () => {
  const { ctx } = await fixture();
  const tool = toolByName("buscar_disponibilidad");
  assert.equal(tool?.kind, "read");
  if (tool?.kind !== "read") return;
  await assert.rejects(tool.run({ desde: "2026-02-30", hasta: "2026-03-01", tipo: null, capacidad_minima: null }, ctx), /no existe/);
  await assert.rejects(tool.run({ desde: "2026-11-08T25:00", hasta: "2026-11-09", tipo: null, capacidad_minima: null }, ctx), /no existe/);
});

test("confirmation recognizes accented Spanish without accepting ambiguous statements", () => {
  assert.equal(CONFIRM_RE.test("SÍ"), true);
  assert.equal(CONFIRM_RE.test("sí."), true);
  assert.equal(CONFIRM_RE.test("sí, pero cambia la fecha"), false);
  assert.equal(CONFIRM_RE.test("sí a todo"), false);
});

test("basic-mode follow-up keeps the pending proposal and never writes the operation", { skip: hasOpenAI }, async () => {
  const { db, ctx } = await fixture();
  const pending = await pendingClient(db, ctx);
  const result = await runAgent(db, { phone: `web:${ctx.staff.id}`, staffId: ctx.staff.id, text: "¿Cómo empiezo?", trigger: "web", now });
  assert.equal(result.pending, pending.summary);
  assert.equal(result.pendingId, pending.id);
  assert.equal((await db.get("agent_pending_actions", pending.id))?.status, "pendiente");
  assert.equal((await db.select("clients")).length, 0);
  assert.match(result.reply, /consultas básicas/);
});

test("inactive web session identity does not fall back to another staff phone", async () => {
  const { db, ctx } = await fixture();
  await db.update("staff", ctx.staff.id, { phone: "5215551234567" });
  await db.insert("staff", { ...ctx.staff, id: "disabled-user", active: false });
  const result = await runAgent(db, { phone: "5215551234567", staffId: "disabled-user", text: "SÍ", trigger: "web", now });
  assert.equal(result.staff, null);
  assert.equal((await db.select("clients")).length, 0);
});

test("a stale web confirmation or cancellation cannot resolve another tab's proposal", async () => {
  for (const text of ["SÍ", "NO"]) {
    const { db, ctx } = await fixture();
    const previous = await pendingClient(db, ctx);
    await db.update("agent_pending_actions", previous.id, { status: "cancelada", resolved_at: now.toISOString() });
    const current = await pendingClient(db, ctx);
    const result = await runAgent(db, { phone: `web:${ctx.staff.id}`, staffId: ctx.staff.id, expectedPendingId: previous.id, text, trigger: "web", now });
    assert.match(result.reply, /Revisa el resumen actualizado/);
    assert.equal(result.pendingId, current.id);
    assert.equal(result.pending, current.summary);
    assert.equal((await db.get("agent_pending_actions", current.id))?.status, "pendiente");
    assert.equal((await db.select("clients")).length, 0);
    assert.equal(result.toolCalls.length, 0);
  }
});

test("web confirmation and cancellation require the displayed proposal id", async () => {
  for (const text of ["SÍ", "NO"]) {
    const { db, ctx } = await fixture();
    const pending = await pendingClient(db, ctx);
    const result = await runAgent(db, { phone: `web:${ctx.staff.id}`, staffId: ctx.staff.id, text, trigger: "web", now });
    assert.match(result.reply, /No ejecuté ni cancelé/);
    assert.equal(result.pendingId, pending.id);
    assert.equal(result.pending, pending.summary);
    assert.equal((await db.get("agent_pending_actions", pending.id))?.status, "pendiente");
    assert.equal((await db.select("clients")).length, 0);
  }
});

test("basic mode denies unavailable role queries instead of answering a different question", async () => {
  const { ctx } = await fixture("operador");
  const log: ToolCallLog[] = [];
  const reply = await fallbackAgent("¿Qué grúas están disponibles mañana?", ctx, log);
  assert.match(reply, /Tu perfil no tiene permiso para esa consulta/);
  assert.equal(log.some((call) => call.name === "consultar_flota"), false);
  assert.equal(log.length, 0);
  for (const question of ["hola", "¿Cómo empiezo?"]) {
    const help = await fallbackAgent(question, ctx, []);
    assert.match(help, /Estado de la flotilla/);
    assert.doesNotMatch(help, /Disponibilidad|libre mañana|Gastos del mes|Alertas de almacén/);
  }
});
