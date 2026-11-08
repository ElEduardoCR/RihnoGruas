import "server-only";
import { currentStaff } from "@/lib/auth";
import { getAdminDb, getDb } from "@/lib/db";

/** La identidad del chat se obtiene de la sesión, nunca de un selector del cliente. */
export async function webAgentContext() {
  const staff = await currentStaff(await getDb());
  if (!staff?.active) throw new Error("Inicia sesión con una cuenta activa para hablar con Rhino.");
  return { db: getAdminDb(), staff, phone: `web:${staff.id}` };
}

export async function webConversation({ db, staff, phone }: Awaited<ReturnType<typeof webAgentContext>>) {
  const [messages, pending] = await Promise.all([
    db.select("wa_messages", { eq: { phone, staff_id: staff.id }, order: { column: "created_at", ascending: false }, limit: 60 }),
    db.select("agent_pending_actions", { eq: { phone, staff_id: staff.id, status: "pendiente" }, gt: { expires_at: new Date().toISOString() }, order: { column: "created_at", ascending: false }, limit: 1 }),
  ]);
  return {
    messages: messages.reverse().map(({ id, direction, body, kind, created_at }) => ({ id, direction, body, kind, created_at })),
    pending: pending[0] ? { id: pending[0].id, summary: pending[0].summary } : null,
  };
}
