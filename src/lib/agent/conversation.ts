import "server-only";
import { currentStaff } from "@/lib/auth";
import { getAdminDb, getDb } from "@/lib/db";
import type { Db } from "@/lib/db/types";
import type { Staff } from "@/lib/types";
import { summarizeConversation } from "./memory";

/** La identidad del chat se obtiene de la sesión, nunca de un selector del cliente. */
export async function webAgentContext() {
  const staff = await currentStaff(await getDb());
  if (!staff?.active) throw new Error("Inicia sesión con una cuenta activa para hablar con Rhino.");
  return { db: getAdminDb(), staff, phone: `web:${staff.id}` };
}

export function validateConversationId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("Abre una conversación nueva para continuar.");
}

export async function requireWebConversation(db: Db, staff: Staff, conversationId: unknown) {
  validateConversationId(conversationId);
  const current = await db.get("staff", staff.id);
  const conversation = await db.get("agent_conversations", conversationId);
  if (!current?.active || !conversation || conversation.staff_id !== staff.id || conversation.phone !== `web:${staff.id}`) throw new Error("Esta conversación no está disponible para tu cuenta.");
  return conversation;
}

async function previousMemory({ db, staff, phone }: Awaited<ReturnType<typeof webAgentContext>>, conversationId: string) {
  const previous = (await db.select("agent_conversations", {
    eq: { staff_id: staff.id, phone }, neq: { id: conversationId }, gt: { message_count: 0 },
    order: { column: "last_message_at", ascending: false }, limit: 1,
  }))[0];
  if (!previous) return null;
  const memory = await summarizeConversation(db, staff, previous.id, { deadline: Date.now() + 35_000 });
  return memory?.summary ? { conversationId: memory.id, summary: memory.summary, createdAt: memory.last_message_at ?? memory.created_at } : null;
}

/** Sólo se llama al entrar realmente al chat, nunca durante render ni prefetch. */
export async function openWebConversation(context: Awaited<ReturnType<typeof webAgentContext>>, conversationId: unknown) {
  validateConversationId(conversationId);
  const { db, staff, phone } = context;
  const existing = await db.get("agent_conversations", conversationId);
  if (!existing) {
    try {
      await db.insert("agent_conversations", { id: conversationId, staff_id: staff.id, phone, summary: null, summary_message_count: 0, summary_updated_at: null, message_count: 0, last_message_at: null });
    } catch (error) {
      // Reintentos simultáneos con el mismo ID deben resolver la misma visita.
      if (!(await db.get("agent_conversations", conversationId))) throw error;
    }
  }
  return webConversation(context, conversationId);
}

export async function webConversation(context: Awaited<ReturnType<typeof webAgentContext>>, conversationId: unknown) {
  const { db, staff, phone } = context;
  const conversation = await requireWebConversation(db, staff, conversationId);
  const [messages, pending] = await Promise.all([
    db.select("wa_messages", { eq: { phone, staff_id: staff.id, conversation_id: conversation.id }, order: { column: "created_at", ascending: false }, limit: 60 }),
    db.select("agent_pending_actions", { eq: { phone, staff_id: staff.id, status: "pendiente" }, gt: { expires_at: new Date().toISOString() }, order: { column: "created_at", ascending: false }, limit: 1 }),
  ]);
  return {
    conversationId: conversation.id,
    messages: messages.reverse().map(({ id, direction, body, kind, created_at }) => ({ id, direction, body, kind, created_at })),
    pending: pending[0] ? { id: pending[0].id, summary: pending[0].summary } : null,
    memory: await previousMemory(context, conversation.id),
  };
}
