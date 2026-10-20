import { after, type NextRequest } from "next/server";
import { getAdminDb } from "@/lib/db";
import { env } from "@/lib/env";
import { downloadMedia, markRead, parseWebhook, verifySignature, type IncomingMessage } from "@/lib/whatsapp";
import { findStaffByPhone, runAgent } from "@/lib/agent/run";
import { attachEvidence } from "@/lib/services/inventory";
import { sendToPhone } from "@/lib/services/notify";
import { qtyUnit } from "@/lib/labels";

export const maxDuration = 60;

/** Verificación del webhook (Meta → Configuración → Webhooks). */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && env.waVerifyToken && p.get("hub.verify_token") === env.waVerifyToken) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Mensajes entrantes. Se responde 200 de inmediato y el agente trabaja en segundo plano. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Firma inválida", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }
  const messages = parseWebhook(payload);
  if (messages.length) after(() => Promise.all(messages.map(handle)).then(() => undefined));
  return Response.json({ ok: true });
}

async function handle(m: IncomingMessage) {
  const db = getAdminDb();
  // Meta reintenta entregas: ignorar duplicados
  const dup = await db.select("wa_messages", { eq: { wa_message_id: m.id }, limit: 1 });
  if (dup.length) return;
  await markRead(m.id).catch(() => null);

  let text = m.text;
  if (m.mediaId && (m.type === "image" || m.type === "document")) {
    const staff = await findStaffByPhone(db, m.from);
    const media = await downloadMedia(m.mediaId);
    if (staff && media) {
      const path = `whatsapp/${m.id}.${media.contentType.includes("png") ? "png" : "jpg"}`;
      await db.upload("evidencias", path, media);
      const r = await attachEvidence(db, staff.id, path);
      if (r && !text) {
        await db.insert("wa_messages", { phone: m.from, staff_id: staff.id, direction: "in", body: "[foto de evidencia]", kind: "chat", wa_message_id: m.id });
        await sendToPhone(
          db,
          m.from,
          `📸 Evidencia recibida para la salida de ${qtyUnit(-r.movement.qty_delta, r.item?.unit ?? "")} de ${r.item?.name}.${r.applied ? " ✅ Quedó aplicada." : r.movement.status === "pendiente_autorizacion" ? " Sigue pendiente de autorización." : ""}`,
          "chat",
          staff.id,
        );
        return;
      }
      text = `${text ? `${text}\n` : ""}[El usuario envió una foto${r ? " que se guardó como evidencia de su salida de almacén" : ""}]`;
    }
  }
  if (!text.trim()) text = `[mensaje de tipo ${m.type}]`;
  await runAgent(db, { phone: m.from, text, trigger: "whatsapp", waMessageId: m.id });
}
