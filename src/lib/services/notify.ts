import type { Db } from "@/lib/db/types";
import type { Alert, AlertTopic, Staff, WaMessage } from "@/lib/types";
import { env } from "@/lib/env";
import { sendTemplate, sendText } from "@/lib/whatsapp";

const WINDOW_MS = 24 * 3600_000;

/**
 * Envía un mensaje de WhatsApp y lo registra. Si el contacto no ha escrito en
 * las últimas 24 h, usa la plantilla aprobada de alertas (requisito de Meta).
 */
export async function sendToPhone(db: Db, phone: string, body: string, kind: WaMessage["kind"], staffId: string | null = null) {
  const lastIn = await db.select("wa_messages", {
    eq: { phone, direction: "in" },
    order: { column: "created_at", ascending: false },
    limit: 1,
  });
  const insideWindow = lastIn[0] && Date.now() - Date.parse(lastIn[0].created_at) < WINDOW_MS;
  const result = !insideWindow && env.waAlertTemplate ? await sendTemplate(phone, body) : await sendText(phone, body);
  await db.insert("wa_messages", {
    phone,
    staff_id: staffId,
    direction: "out",
    body: result.ok ? body : `${body}\n\n[no enviado: ${result.error}]`,
    kind,
    wa_message_id: result.id ?? null,
  });
  return result;
}

export async function sendToStaff(db: Db, s: Staff, body: string, kind: WaMessage["kind"] = "alerta") {
  if (!s.phone || !s.active) return null;
  return sendToPhone(db, s.phone, body, kind, s.id);
}

export async function recipientsFor(db: Db, topic: AlertTopic): Promise<Staff[]> {
  const staff = await db.select("staff", { eq: { active: true, receives_alerts: true } });
  return staff.filter((s) => s.phone && s.alert_topics.includes(topic));
}

const SEVERITY_ICON: Record<Alert["severity"], string> = { info: "ℹ️", aviso: "⚠️", critica: "🚨" };

/**
 * Registra una alerta y la envía por WhatsApp a quienes siguen el tema.
 * dedupe_key evita repetir la misma alerta en cada escaneo.
 */
export async function raiseAlert(
  db: Db,
  a: Pick<Alert, "dedupe_key" | "topic" | "severity" | "title" | "body"> & { crane_id?: string | null; extraRecipients?: Staff[] },
): Promise<Alert | null> {
  const existing = await db.select("alerts", { eq: { dedupe_key: a.dedupe_key }, limit: 1 });
  if (existing.length) return null;
  const recipients = await recipientsFor(db, a.topic);
  for (const r of a.extraRecipients ?? []) if (!recipients.some((x) => x.id === r.id)) recipients.push(r);
  const text = `${SEVERITY_ICON[a.severity]} *${a.title}*\n${a.body}`;
  const sentTo: string[] = [];
  for (const r of recipients) {
    const res = await sendToStaff(db, r, text);
    if (res?.ok && r.phone) sentTo.push(r.phone);
  }
  return db.insert("alerts", {
    dedupe_key: a.dedupe_key,
    topic: a.topic,
    severity: a.severity,
    title: a.title,
    body: a.body,
    crane_id: a.crane_id ?? null,
    sent_to: sentTo,
    sent_at: sentTo.length ? new Date().toISOString() : null,
    acknowledged_at: null,
  });
}

export const inspectionLink = (token: string) => `${env.appUrl}/c/${token}`;
