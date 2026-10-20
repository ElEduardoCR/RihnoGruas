import { createHmac, timingSafeEqual } from "node:crypto";
import { env, hasWhatsApp } from "@/lib/env";

// WhatsApp Cloud API (Meta). https://developers.facebook.com/docs/whatsapp/cloud-api

const graph = (path: string) => `https://graph.facebook.com/${env.waApiVersion}/${path}`;

export interface SendResult {
  ok: boolean;
  simulated?: boolean;
  id?: string;
  error?: string;
}

async function post(body: unknown): Promise<SendResult> {
  if (!hasWhatsApp) return { ok: true, simulated: true };
  const res = await fetch(graph(`${env.waPhoneNumberId}/messages`), {
    method: "POST",
    headers: { Authorization: `Bearer ${env.waToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message: string } };
  if (!res.ok) return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
  return { ok: true, id: json.messages?.[0]?.id };
}

/** WhatsApp limita el cuerpo de texto a 4096 caracteres. */
export function sendText(to: string, body: string) {
  return post({ messaging_product: "whatsapp", to, type: "text", text: { body: body.slice(0, 4096), preview_url: true } });
}

/**
 * Fuera de la ventana de 24 h sólo se permiten plantillas aprobadas.
 * La plantilla (WHATSAPP_ALERT_TEMPLATE) debe tener un único parámetro {{1}} en el cuerpo.
 */
export function sendTemplate(to: string, text: string) {
  const param = text.replace(/\s*\n+\s*/g, " · ").replace(/\s{4,}/g, "   ").slice(0, 1000);
  return post({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: env.waAlertTemplate,
      language: { code: env.waTemplateLang },
      components: [{ type: "body", parameters: [{ type: "text", text: param }] }],
    },
  });
}

export function markRead(messageId: string) {
  return post({ messaging_product: "whatsapp", status: "read", message_id: messageId });
}

/** Valida X-Hub-Signature-256 con el App Secret de Meta. */
export function verifySignature(rawBody: string, header: string | null): boolean {
  if (!env.waAppSecret) return true; // sin secreto configurado (desarrollo)
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", env.waAppSecret).update(rawBody).digest("hex");
  const a = Buffer.from(header.slice(7), "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface IncomingMessage {
  id: string;
  from: string;
  name: string | null;
  text: string;
  type: string;
  mediaId: string | null;
  timestamp: number;
}

/** Extrae mensajes entrantes del payload del webhook. */
export function parseWebhook(payload: unknown): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  const p = payload as {
    entry?: {
      changes?: {
        value?: {
          contacts?: { wa_id: string; profile?: { name?: string } }[];
          messages?: {
            id: string;
            from: string;
            timestamp: string;
            type: string;
            text?: { body: string };
            image?: { id: string; caption?: string };
            document?: { id: string; caption?: string };
            interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
            button?: { text: string };
          }[];
        };
      }[];
    }[];
  };
  for (const entry of p.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      for (const m of v?.messages ?? []) {
        const contact = v?.contacts?.find((c) => c.wa_id === m.from);
        const text =
          m.text?.body ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          m.button?.text ??
          m.image?.caption ??
          m.document?.caption ??
          "";
        out.push({
          id: m.id,
          from: m.from,
          name: contact?.profile?.name ?? null,
          text,
          type: m.type,
          mediaId: m.image?.id ?? m.document?.id ?? null,
          timestamp: Number(m.timestamp) * 1000,
        });
      }
    }
  }
  return out;
}

/** Descarga un archivo multimedia enviado por WhatsApp (foto de evidencia). */
export async function downloadMedia(mediaId: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!hasWhatsApp) return null;
  const meta = await fetch(graph(mediaId), { headers: { Authorization: `Bearer ${env.waToken}` } });
  if (!meta.ok) return null;
  const { url, mime_type } = (await meta.json()) as { url: string; mime_type: string };
  const file = await fetch(url, { headers: { Authorization: `Bearer ${env.waToken}` } });
  if (!file.ok) return null;
  return { bytes: new Uint8Array(await file.arrayBuffer()), contentType: mime_type };
}
