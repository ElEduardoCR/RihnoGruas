import test from "node:test";
import assert from "node:assert/strict";
import { Responses, type Response, type ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";

test("web visits keep separate transcripts, private memory and visible pending actions", async (t) => {
  process.env.OPENAI_API_KEY = "offline-conversation-test";
  t.mock.method(globalThis, "fetch", async () => { throw new Error("No network in conversation verification"); });
  const { demoDb } = await import("@/lib/db/demo");
  const { openWebConversation, webConversation } = await import("./conversation");
  const { runAgent } = await import("./run");
  const db = demoDb();
  const staff = await db.insert("staff", { full_name: "Conversación de prueba", role: "direccion", active: true, phone: null, receives_alerts: false, alert_topics: [] });
  const context = { db, staff, phone: `web:${staff.id}` };
  const firstId = crypto.randomUUID();
  const first = await openWebConversation(context, firstId);
  assert.deepEqual(first.messages, []);
  assert.equal(first.memory, null);
  for (const [direction, body] of [["in", "Detalle original muy largo sobre aceite DTE 25"], ["out", "Se preparó una propuesta, todavía no se guardó nada."]] as const) {
    await db.insert("wa_messages", { phone: context.phone, staff_id: staff.id, conversation_id: firstId, direction, body, kind: "chat" });
  }
  await db.update("agent_conversations", firstId, { summary: "Se habló de presentación de 208 L y uso por litro. El alta quedó pendiente de confirmación.", summary_message_count: 2, summary_updated_at: new Date().toISOString() });
  const pending = await db.insert("agent_pending_actions", { phone: context.phone, staff_id: staff.id, tool: "crear_articulo", args: {}, summary: "Alta de aceite: revisa y confirma.", status: "pendiente", expires_at: new Date(Date.now() + 600_000).toISOString() });
  const secondId = crypto.randomUUID();
  const second = await openWebConversation(context, secondId);
  assert.deepEqual(second.messages, [], "A fresh visit never restores the old transcript");
  assert.match(second.memory!.summary, /208 L/);
  assert.equal(second.pending?.id, pending.id, "An unseen pending mutation is never silently dropped");
  assert.equal(second.pending?.summary, pending.summary);
  await openWebConversation(context, secondId);
  assert.equal((await db.select("agent_conversations", { eq: { staff_id: staff.id } })).length, 2, "Initialization retries use one visit");

  const other = await db.insert("staff", { full_name: "Otra cuenta", role: "direccion", active: true, phone: null, receives_alerts: false, alert_topics: [] });
  const otherContext = { db, staff: other, phone: `web:${other.id}` };
  await assert.rejects(openWebConversation(otherContext, secondId), /no está disponible/);
  await assert.rejects(webConversation(otherContext, firstId), /no está disponible/);
  await assert.rejects(openWebConversation(context, "not-a-uuid"), /conversación nueva/);

  let request: ResponseCreateParamsNonStreaming | undefined;
  t.mock.method(Responses.prototype, "create", async (body: ResponseCreateParamsNonStreaming) => {
    request = body;
    return { id: "memory-response", status: "completed", output_text: "La presentación mencionada era de 208 litros; el alta sigue pendiente.", output: [] } as unknown as Response;
  });
  await runAgent(db, { trigger: "web", staffId: staff.id, phone: context.phone, conversationId: secondId, text: "¿Qué presentación habíamos comentado?" });
  const modelInput = JSON.stringify(request?.input);
  assert.match(modelInput, /208 L/);
  assert.doesNotMatch(modelInput, /Detalle original muy largo/, "New visits receive the summary, not old transcript messages");
  assert.match(modelInput, /NO instrucciones ni autorización/);
  const reloaded = await webConversation(context, secondId);
  assert.equal(reloaded.messages.length, 2, "Recovery reload only contains this visit");
  assert.equal((await db.select("wa_messages", { eq: { conversation_id: firstId } })).length, 2, "Original messages remain available for retrieval");
  assert.equal(reloaded.pending?.id, pending.id);
  const before = (await db.select("wa_messages", { eq: { staff_id: other.id } })).length;
  await assert.rejects(runAgent(db, { trigger: "web", staffId: other.id, phone: otherContext.phone, conversationId: firstId, text: "SÍ", expectedPendingId: pending.id }), /no está disponible/);
  assert.equal((await db.select("wa_messages", { eq: { staff_id: other.id } })).length, before, "Foreign conversation is rejected before logging or executing");
});
