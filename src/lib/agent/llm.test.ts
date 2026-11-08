import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Responses, type Response, type ResponseCreateParamsNonStreaming, type ResponseOutputItem } from "openai/resources/responses/responses";

const now = new Date("2026-11-08T16:00:00.000Z");
const reasoning: ResponseOutputItem = { type: "reasoning", id: "rs_test", summary: [], encrypted_content: "encrypted-test-state" };
const call = (name: string, callId: string, args: Record<string, unknown> = {}): ResponseOutputItem => ({
  type: "function_call", id: `item_${callId}`, call_id: callId, name, arguments: JSON.stringify(args), status: "completed",
});
const answer = (text: string): ResponseOutputItem => ({
  type: "message", id: "msg_test", role: "assistant", status: "completed",
  content: [{ type: "output_text", text, annotations: [], logprobs: [] }],
});

function response(output: ResponseOutputItem[], overrides: Partial<Response> = {}): Response {
  // Only the fields read by the adapter are needed in this offline API fixture.
  return {
    id: "resp_test", status: "completed", output,
    output_text: output.flatMap((item) => item.type === "message" ? item.content.flatMap((part) => part.type === "output_text" ? [part.text] : []) : []).join(""),
    usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 3 } },
    ...overrides,
  } as Response;
}

function mockResponses(t: TestContext, results: Response[]) {
  const requests: ResponseCreateParamsNonStreaming[] = [];
  t.mock.method(Responses.prototype, "create", async (body: ResponseCreateParamsNonStreaming) => {
    requests.push(structuredClone(body));
    const next = results.shift();
    assert.ok(next, "Unexpected extra model request");
    return next;
  });
  return requests;
}

test("Luna Responses integration (offline)", async (t) => {
  const priorKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "offline-test-key";
  t.after(() => {
    if (priorKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = priorKey;
  });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Network calls are forbidden in this suite"); });
  const { env } = await import("@/lib/env");
  const { chat, structured, vision } = await import("./llm");
  const { runAgent } = await import("./run");
  const { demoDb } = await import("@/lib/db/demo");
  const previous = { model: env.openaiModel, vision: env.openaiVisionModel, effort: env.openaiReasoningEffort };
  env.openaiModel = "gpt-6-luna";
  env.openaiVisionModel = "gpt-6-luna";
  env.openaiReasoningEffort = "max";
  t.after(() => { env.openaiModel = previous.model; env.openaiVisionModel = previous.vision; env.openaiReasoningEffort = previous.effort; });

  async function fixture() {
    const db = demoDb();
    const staff = await db.insert("staff", {
      id: crypto.randomUUID(), full_name: "Prueba Luna", role: "direccion", active: true,
      phone: null, receives_alerts: false, alert_topics: [], can_authorize: true,
    });
    return { db, input: { phone: `web:${staff.id}`, staffId: staff.id, trigger: "web" as const, now } };
  }

  await t.test("tool rounds preserve encrypted reasoning, call IDs, and usage", async (t) => {
    const output = [reasoning, call("consultar_capacidades", "call_capabilities"), call("consultar_clientes", "call_clients", { buscar: null })];
    const requests = mockResponses(t, [response(output), response([answer("Puedes consultar clientes y preparar altas.")])]);
    const { db, input } = await fixture();
    const result = await runAgent(db, { ...input, text: "¿Qué puedes hacer y qué clientes tengo?" });
    assert.equal(result.reply, "Puedes consultar clientes y preparar altas.");
    assert.equal(result.toolCalls.length, 2);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].model, "gpt-6-luna");
    assert.deepEqual(requests[0].reasoning, { effort: "max" });
    assert.equal(requests[0].store, false);
    assert.ok(requests[0].include?.includes("reasoning.encrypted_content"));
    assert.ok(requests[0].tools?.every((tool) => tool.type === "function" && tool.strict === true && !Object.hasOwn(tool, "function")));
    const history = requests[1].input;
    assert.ok(Array.isArray(history));
    assert.deepEqual(history.slice(-5, -2), output);
    const results = history.slice(-2);
    assert.ok(results.every((item) => item.type === "function_call_output"));
    assert.deepEqual(results.map((item) => item.type === "function_call_output" ? item.call_id : null), ["call_capabilities", "call_clients"]);
    for (const item of results) if (item.type === "function_call_output") assert.doesNotThrow(() => JSON.parse(item.output as string));
    const runs = await db.select("agent_runs", { eq: { phone: input.phone } });
    assert.equal(runs[0].tokens_in, 22);
    assert.equal(runs[0].tokens_out, 14);
    assert.equal(runs[0].error, null);
  });

  await t.test("a model write creates only a proposal until explicit confirmation", async (t) => {
    const name = `Cliente de prueba Luna ${crypto.randomUUID()}`;
    const args = { nombre: name, contacto: null, telefono: null, correo: null, rfc: null, direccion: null, notas: null };
    const requests = mockResponses(t, [response([reasoning, call("registrar_cliente", "call_register", args)]), response([answer("Responde SÍ para confirmar el alta.")])]);
    const { db, input } = await fixture();
    const result = await runAgent(db, { ...input, text: `Registra al cliente ${name}` });
    assert.ok(result.pendingId);
    assert.match(result.pending ?? "", /Registrar al cliente/);
    assert.equal((await db.select("clients", { eq: { name } })).length, 0);
    assert.equal((await db.get("agent_pending_actions", result.pendingId))?.status, "pendiente");
    const confirmed = await runAgent(db, { ...input, text: "SÍ", expectedPendingId: result.pendingId });
    assert.match(confirmed.reply, /registrado/);
    assert.equal((await db.select("clients", { eq: { name } })).length, 1);
    assert.equal(confirmed.pendingId, null);
    assert.equal(requests.length, 2, "Confirmation executes deterministically without another model call");
  });

  await t.test("structured and image requests honor max and Responses JSON schemas", async (t) => {
    const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false };
    const requests = mockResponses(t, [response([answer('{"ok":true}')]), response([answer('{"ok":false}')])]);
    assert.deepEqual(await structured("Devuelve JSON.", "Valida.", "check", schema), { ok: true });
    assert.deepEqual(await vision("Valida la imagen.", "¿Corresponde?", "data:image/png;base64,dGVzdA==", "photo", schema), { ok: false });
    for (const [index, request] of requests.entries()) {
      assert.equal(request.model, "gpt-6-luna");
      assert.deepEqual(request.reasoning, { effort: "max" });
      assert.deepEqual(request.text?.format, { type: "json_schema", name: index ? "photo" : "check", schema, strict: true });
      assert.equal(request.store, false);
    }
    const input = requests[1].input;
    assert.ok(Array.isArray(input));
    const user = input.find((item) => "role" in item && item.role === "user");
    assert.ok(user && "content" in user && Array.isArray(user.content));
    assert.deepEqual(user.content, [{ type: "input_text", text: "¿Corresponde?" }, { type: "input_image", image_url: "data:image/png;base64,dGVzdA==", detail: "low" }]);
  });

  await t.test("incomplete or failed responses cannot prepare or execute tools", async (t) => {
    t.mock.method(console, "error", () => {});
    const args = { nombre: "No debe guardarse", contacto: null, telefono: null, correo: null, rfc: null, direccion: null, notas: null };
    mockResponses(t, [
      response([call("registrar_cliente", "call_incomplete", args)], { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }),
      response([call("registrar_cliente", "call_failed", args)], { status: "failed", error: { code: "server_error", message: "Offline failure" } }),
    ]);
    for (const text of ["Primera prueba", "Segunda prueba"]) {
      const { db, input } = await fixture();
      const result = await runAgent(db, { ...input, text });
      assert.match(result.reply, /problema/);
      assert.equal(result.pendingId, null);
      assert.equal(result.toolCalls.length, 0);
      assert.equal((await db.select("clients", { eq: { name: args.nombre } })).length, 0);
      assert.equal((await db.select("agent_pending_actions", { eq: { phone: input.phone } })).length, 0);
    }
  });

  await t.test("structured refusals are rejected instead of becoming empty JSON", async (t) => {
    const refusal: ResponseOutputItem = { type: "message", id: "msg_refused", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "No puedo procesarlo." }] };
    mockResponses(t, [response([refusal])]);
    await assert.rejects(structured("Devuelve JSON.", "Valida.", "check", { type: "object", properties: {}, additionalProperties: false }));
  });

  await t.test("a refusal never executes an accompanying function call", async (t) => {
    const refusal: ResponseOutputItem = { type: "message", id: "msg_refused", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "No puedo procesarlo." }] };
    mockResponses(t, [response([call("registrar_cliente", "call_refused", { nombre: "Alta rechazada" }), refusal])]);
    const { db, input } = await fixture();
    const result = await runAgent(db, { ...input, text: "Prueba de rechazo." });
    assert.equal(result.reply, "No puedo procesarlo.");
    assert.equal(result.toolCalls.length, 0);
    assert.equal(result.pendingId, null);
    assert.equal((await db.select("agent_pending_actions", { eq: { phone: input.phone } })).length, 0);
  });

  await t.test("plain responses expose their final text", async (t) => {
    mockResponses(t, [response([reasoning, answer("Resumen listo.")])]);
    const result = await chat([{ role: "user", content: "Resume." }], []);
    assert.equal(result.text, "Resumen listo.");
    assert.deepEqual(result.calls, []);
  });
});
