import type { Db } from "@/lib/db/types";
import { hasOpenAI } from "@/lib/env";
import { getFleet } from "@/lib/services/fleet";
import { expireOverdue } from "@/lib/services/inspections";
import { raiseAlert, sendToStaff } from "@/lib/services/notify";
import { scheduleRentalInspections, syncRentalStatuses } from "@/lib/services/rentals";
import { monthlyExpenses } from "@/lib/services/expenses";
import { addDays, dayKey, fmt, money, startOfDay } from "@/lib/time";
import { collectInsights } from "./insights";
import { chat } from "./llm";

/**
 * Escaneo periódico (cron). Rhino actúa sin que se lo pidan:
 * 1. Mantiene estados al día (rentas en curso/finalizadas, revisiones vencidas).
 * 2. Toma decisiones de agenda (programa revisiones faltantes antes de cada renta).
 * 3. Envía por WhatsApp las alertas nuevas a quien corresponde (sin repetir).
 */
export async function runProactiveScan(db: Db, now: Date) {
  await syncRentalStatuses(db, now);
  const expired = await expireOverdue(db, now);

  // Decisión automática: toda renta próxima debe tener su revisión total
  const decisions: string[] = [];
  const rentals = await db.select("rentals", { eq: { status: "confirmada" }, lt: { start_at: addDays(now, 7).toISOString() } });
  for (const r of rentals) {
    const existing = await db.select("inspections", { eq: { rental_id: r.id } });
    if (existing.some((i) => i.kind !== "post_renta" && i.status !== "cancelada")) continue;
    const crane = await db.get("cranes", r.crane_id);
    if (!crane) continue;
    const res = await scheduleRentalInspections(db, crane, r, now);
    decisions.push(`Programé revisión total de ${crane.code} para ${fmt.dateTime(res.pre.scheduled_for)} (renta del ${fmt.short(r.start_at)}).`);
  }
  if (decisions.length) {
    await raiseAlert(db, { dedupe_key: `agente:decisiones:${now.toISOString().slice(0, 13)}`, topic: "agenda", severity: "info", title: "Rhino programó revisiones", body: decisions.join("\n") });
  }

  const insights = await collectInsights(db, now);
  let newAlerts = 0;
  for (const i of insights) {
    if (i.severity === "info") continue;
    const a = await raiseAlert(db, { dedupe_key: i.key, topic: i.topic, severity: i.severity, title: i.title, body: i.body, crane_id: i.crane_id });
    if (a) newAlerts++;
  }
  return { insights: insights.length, newAlerts, decisions, expiredInspections: expired.length };
}

/** Resumen matutino personalizado para quien sigue el tema "resumen". */
export async function sendDailyBrief(db: Db, now: Date) {
  const recipients = (await db.select("staff", { eq: { active: true, receives_alerts: true } })).filter((s) => s.phone && s.alert_topics.includes("resumen"));
  if (!recipients.length) return { sent: 0 };

  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const { cranes, events } = await getFleet(db, now);
  const insights = (await collectInsights(db, now)).filter((i) => i.severity !== "info").slice(0, 6);
  const months = await monthlyExpenses(db, now, 2);
  const count = (s: string) => cranes.filter((c) => c.status === s).length;
  const code = (id: string) => cranes.find((c) => c.id === id)?.code ?? "";
  const startingSoon = events.filter((e) => e.kind === "renta" && Date.parse(e.start) >= today.getTime() && Date.parse(e.start) < addDays(tomorrow, 1).getTime());
  const endingToday = events.filter((e) => e.kind === "renta" && dayKey(e.end) === dayKey(now));
  const reviewsToday = events.filter((e) => e.kind === "revision" && dayKey(e.start) === dayKey(now) && e.status !== "completada");

  const facts = [
    `Flotilla: ${count("rentada")} rentadas, ${count("disponible")} disponibles, ${count("mantenimiento")} en mantenimiento, ${count("detenida")} detenidas (de ${cranes.length}).`,
    `Rentas que inician hoy/mañana: ${startingSoon.map((e) => `${code(e.crane_id)} con ${e.title} (${fmt.dateTime(e.start)})`).join("; ") || "ninguna"}.`,
    `Rentas que terminan hoy: ${endingToday.map((e) => `${code(e.crane_id)} (${e.title})`).join("; ") || "ninguna"}.`,
    `Revisiones de hoy: ${reviewsToday.map((e) => `${code(e.crane_id)} ${e.title} ${fmt.time(e.start)}`).join("; ") || "ninguna"}.`,
    `Gasto del mes: ${money(months[1]?.total ?? 0)} (mes anterior completo: ${money(months[0]?.total ?? 0)}).`,
    `Pendientes importantes:\n${insights.map((i) => `- [${i.severity}] ${i.title}: ${i.body}`).join("\n") || "- ninguno"}`,
  ].join("\n");

  let sent = 0;
  for (const s of recipients) {
    const already = await db.select("wa_messages", { eq: { phone: s.phone!, kind: "resumen" }, gte: { created_at: today.toISOString() }, limit: 1 });
    if (already.length) continue;
    let body = "";
    if (hasOpenAI) {
      try {
        const { message } = await chat(
          [
            { role: "system", content: "Eres Rhino, asistente de una empresa de grúas. Escribe el resumen matutino de WhatsApp en español de México: saludo con el nombre, 4 a 7 viñetas '•' priorizando lo urgente, *negritas* en grúas y cifras. Usa EXCLUSIVAMENTE los datos proporcionados; no inventes ni agregues cifras. Máximo 900 caracteres." },
            { role: "user", content: `Destinatario: ${s.full_name} (${s.role}).\nFecha: ${fmt.long(now)}.\nDatos:\n${facts}` },
          ],
          [],
        );
        body = message.content?.trim() ?? "";
      } catch (e) {
        console.error("[brief]", e);
      }
    }
    if (!body) {
      body = `☀️ *Buenos días, ${s.full_name.split(" ")[0]}.* Resumen de ${fmt.long(now)}:\n• ${facts.split("\n").slice(0, 5).join("\n• ")}${insights.length ? `\n${insights.slice(0, 4).map((i) => `${i.severity === "critica" ? "🚨" : "⚠️"} ${i.title}`).join("\n")}` : ""}`;
    }
    await sendToStaff(db, s, body, "resumen");
    sent++;
  }
  return { sent };
}
