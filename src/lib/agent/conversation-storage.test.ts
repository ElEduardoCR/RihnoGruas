import test from "node:test";
import assert from "node:assert/strict";
import { demoDb } from "@/lib/db/demo";

async function fixture() {
  const db = demoDb();
  const staff = await db.insert("staff", { full_name: "Memoria de prueba", role: "direccion", active: true });
  const phone = `web:${staff.id}`;
  const conversation = await db.insert("agent_conversations", { staff_id: staff.id, phone });
  return { db, staff, phone, conversation };
}

test("new conversations start empty and duplicate IDs do not create another session", async () => {
  const { db, conversation } = await fixture();
  assert.equal(conversation.message_count, 0);
  assert.equal(conversation.last_message_at, null);
  assert.equal(conversation.summary, null);
  assert.equal(conversation.summary_message_count, 0);
  await assert.rejects(db.insert("agent_conversations", conversation), /duplicate key/);
  assert.equal((await db.select("agent_conversations", { eq: { id: conversation.id } })).length, 1);
});

test("parallel and backdated messages count once without moving last activity backwards", async () => {
  const { db, staff, phone, conversation } = await fixture();
  const input = { conversation_id: conversation.id, staff_id: staff.id, phone, direction: "in" as const, body: "Dato de prueba" };
  await Promise.all([
    db.insert("wa_messages", { ...input, created_at: "2026-11-09T18:00:00Z" }),
    db.insert("wa_messages", { ...input, created_at: "2026-11-09T17:00:00Z" }),
  ]);
  const saved = (await db.get("agent_conversations", conversation.id))!;
  assert.equal(saved.message_count, 2);
  assert.equal(saved.last_message_at, "2026-11-09T18:00:00Z");
  await db.insert("wa_messages", { phone, staff_id: staff.id, body: "Legado", direction: "out" });
  assert.equal((await db.get("agent_conversations", conversation.id))?.message_count, 2);
});

test("cross-owner or cross-channel messages fail without advancing either session", async () => {
  const { db, staff, phone, conversation } = await fixture();
  const other = await db.insert("staff", { full_name: "Otra persona", role: "operador", active: true });
  const input = { conversation_id: conversation.id, staff_id: staff.id, phone, direction: "in" as const, body: "Dato privado" };
  for (const wrong of [{ staff_id: other.id }, { staff_id: null }, { phone: "5216140000000" }, { conversation_id: crypto.randomUUID() }]) {
    await assert.rejects(db.insert("wa_messages", { ...input, ...wrong }), /no corresponde/);
  }
  await assert.rejects(db.insertMany("wa_messages", [input, { ...input, staff_id: other.id }]), /no corresponde/);
  assert.equal((await db.get("agent_conversations", conversation.id))?.message_count, 0);
  assert.equal((await db.select("wa_messages", { eq: { conversation_id: conversation.id } })).length, 0);
});

test("summaries cannot claim unseen messages and stale writes cannot replace new memory", async () => {
  const { db, staff, phone, conversation } = await fixture();
  await db.insertMany("wa_messages", ["Solicitud", "Respuesta"].map((body) => ({ conversation_id: conversation.id, staff_id: staff.id, phone, direction: "in" as const, body })));
  await assert.rejects(db.update("agent_conversations", conversation.id, { summary: "Falso", summary_message_count: 3 }), /contador/);
  await assert.rejects(db.update("agent_conversations", conversation.id, { summary: "x".repeat(6001) }), /límite/);
  const current = await db.updateWhere("agent_conversations", conversation.id, { summary: "Resumen completo", summary_message_count: 2 }, { summary_message_count: 0 });
  assert.ok(current);
  const stale = await db.updateWhere("agent_conversations", conversation.id, { summary: "Resumen anterior", summary_message_count: 1 }, { summary_message_count: 0 });
  assert.equal(stale, null);
  assert.equal((await db.get("agent_conversations", conversation.id))?.summary, "Resumen completo");
});

test("message pagination stays scoped to the chosen conversation", async () => {
  const { db, staff, phone, conversation } = await fixture();
  await db.insertMany("wa_messages", [0, 1, 2, 3].map((n) => ({ conversation_id: conversation.id, staff_id: staff.id, phone, direction: "in" as const, body: `${n}`, created_at: `2026-11-09T18:00:0${n}Z` })));
  const page = await db.select("wa_messages", { eq: { conversation_id: conversation.id, staff_id: staff.id, phone }, order: { column: "created_at" }, offset: 1, limit: 2 });
  assert.deepEqual(page.map((message) => message.body), ["1", "2"]);
  assert.deepEqual(await db.select("wa_messages", { eq: { conversation_id: conversation.id }, limit: 0 }), []);
});
