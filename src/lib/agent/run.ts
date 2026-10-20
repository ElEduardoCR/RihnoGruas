import type { Db } from "@/lib/db/types";
import type { AlertTopic, PendingAction, Staff, StaffRole, ToolCallLog } from "@/lib/types";
import { env, hasOpenAI } from "@/lib/env";
import { sendToPhone } from "@/lib/services/notify";
import { CANCEL_RE, CONFIRM_RE, systemPrompt } from "./prompt";
import { ToolError, toolByName, toolsFor, type ToolCtx } from "./tools";
import { chat, type ChatMessage, type ToolSpec } from "./llm";
import { collectInsights, type Insight } from "./insights";
import { fallbackAgent } from "./fallback";

export interface AgentInput {
  phone: string;
  text: string;
  trigger: "whatsapp" | "web" | "eval";
  waMessageId?: string | null;
  now?: Date;
}

export interface AgentReply {
  reply: string;
  toolCalls: ToolCallLog[];
  pending: string | null;
  staff: Staff | null;
}

const PENDING_TTL_MS = 30 * 60_000;
const MAX_ROUNDS = 6;
const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);

export async function findStaffByPhone(db: Db, phone: string) {
  const staff = await db.select("staff", { eq: { active: true } });
  return staff.find((s) => s.phone && last10(s.phone) === last10(phone)) ?? null;
}

/**
 * Punto de entrada único del agente (WhatsApp, simulador web y evaluaciones).
 * Las acciones que modifican datos nunca se ejecutan sin un "SÍ" explícito.
 */
export async function runAgent(db: Db, input: AgentInput): Promise<AgentReply> {
  const now = input.now ?? new Date();
  const started = Date.now();
  const persist = input.trigger !== "eval";
  const staff = await findStaffByPhone(db, input.phone);

  if (persist) {
    await db.insert("wa_messages", { phone: input.phone, staff_id: staff?.id ?? null, direction: "in", body: input.text || "[mensaje sin texto]", kind: "chat", wa_message_id: input.waMessageId ?? null });
  }

  const deliver = async (reply: string) => {
    if (!persist) return;
    if (input.trigger === "whatsapp") await sendToPhone(db, input.phone, reply, "chat", staff?.id ?? null);
    else await db.insert("wa_messages", { phone: input.phone, staff_id: staff?.id ?? null, direction: "out", body: reply, kind: "chat", wa_message_id: null });
  };

  if (!staff) {
    const reply = "Hola 👋 Este número no está registrado en Grúas Rhino. Pide a Administración que te den de alta para usar el asistente.";
    await deliver(reply);
    return { reply, toolCalls: [], pending: null, staff: null };
  }

  const ctx: ToolCtx = { db, now, staff, channel: input.trigger === "whatsapp" ? "whatsapp" : "web" };
  const toolCalls: ToolCallLog[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let reply = "";
  let pendingSummary: string | null = null;
  let error: string | null = null;

  try {
    // 1) ¿Responde a una acción pendiente de confirmación?
    const pending = persist ? await activePending(db, input.phone, now) : null;
    if (pending && CONFIRM_RE.test(input.text)) {
      reply = await executePending(db, pending, ctx, toolCalls);
    } else if (pending && CANCEL_RE.test(input.text)) {
      await db.update("agent_pending_actions", pending.id, { status: "cancelada", resolved_at: now.toISOString() });
      reply = "Listo, no hice ningún cambio. ¿Algo más?";
    } else {
      if (pending) await db.update("agent_pending_actions", pending.id, { status: "cancelada", resolved_at: now.toISOString() });

      if (!hasOpenAI) {
        reply = await fallbackAgent(input.text, ctx, toolCalls);
      } else {
        const r = await llmTurn(db, input, ctx, toolCalls, persist);
        reply = r.reply;
        pendingSummary = r.pendingSummary;
        tokensIn = r.tokensIn;
        tokensOut = r.tokensOut;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error("[agent]", e);
    reply = "Perdón, tuve un problema para procesar tu mensaje. Ya quedó registrado; inténtalo de nuevo o llama a Dirección si es urgente.";
  }

  await deliver(reply);
  if (persist) {
    await db.insert("agent_runs", {
      trigger: input.trigger,
      phone: input.phone,
      staff_id: staff.id,
      input: input.text,
      output: reply,
      model: hasOpenAI ? env.openaiModel : "reglas",
      tool_calls: toolCalls,
      tokens_in: tokensIn || null,
      tokens_out: tokensOut || null,
      latency_ms: Date.now() - started,
      error,
      rating: null,
    });
  }
  return { reply, toolCalls, pending: pendingSummary, staff };
}

async function activePending(db: Db, phone: string, now: Date) {
  const rows = await db.select("agent_pending_actions", { eq: { phone, status: "pendiente" }, order: { column: "created_at", ascending: false }, limit: 1 });
  const p = rows[0];
  if (!p) return null;
  if (Date.parse(p.expires_at) < now.getTime()) {
    await db.update("agent_pending_actions", p.id, { status: "expirada", resolved_at: now.toISOString() });
    return null;
  }
  return p;
}

async function executePending(db: Db, p: PendingAction, ctx: ToolCtx, log: ToolCallLog[]) {
  const tool = toolByName(p.tool);
  if (!tool || tool.kind !== "write") return "No reconozco la acción pendiente.";
  if (tool.roles && !tool.roles.includes(ctx.staff.role)) return "No tienes permiso para esa acción.";
  const t0 = Date.now();
  try {
    const result = await tool.execute(p.args, ctx);
    log.push({ name: `${p.tool} (confirmada)`, args: p.args, result, ms: Date.now() - t0 });
    await db.update("agent_pending_actions", p.id, { status: "confirmada", resolved_at: ctx.now.toISOString(), result });
    return result.mensaje;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.push({ name: `${p.tool} (confirmada)`, args: p.args, result: { error: msg }, ms: Date.now() - t0 });
    await db.update("agent_pending_actions", p.id, { status: "cancelada", resolved_at: ctx.now.toISOString(), result: { error: msg } });
    return `No se pudo completar: ${msg}`;
  }
}

const ROLE_TOPICS: Record<StaffRole, AlertTopic[]> = {
  direccion: ["documentos", "inventario", "agenda", "gastos", "checklists", "flota"],
  administracion: ["documentos", "gastos", "inventario"],
  ventas: ["agenda"],
  mecanico: ["flota", "checklists"],
  almacen: ["inventario"],
  operador: [],
};

// Cache breve de hallazgos: se calculan una vez y se reutilizan entre mensajes.
const g = globalThis as unknown as { __rhinoInsights?: { at: number; data: Insight[] } };
async function cachedInsights(db: Db, now: Date) {
  if (g.__rhinoInsights && Date.now() - g.__rhinoInsights.at < 5 * 60_000) return g.__rhinoInsights.data;
  const data = await collectInsights(db, now);
  g.__rhinoInsights = { at: Date.now(), data };
  return data;
}

/** Hallazgos importantes que esta persona aún no conoce ("📌 Por cierto"). */
async function unknownInsights(db: Db, staff: Staff, now: Date) {
  const topics = staff.receives_alerts && staff.alert_topics.length ? staff.alert_topics : ROLE_TOPICS[staff.role];
  if (!topics.length || !staff.phone) return [];
  const insights = (await cachedInsights(db, now)).filter((i) => i.severity !== "info" && topics.includes(i.topic));
  const recentOut = await db.select("wa_messages", { eq: { phone: staff.phone, direction: "out" }, gte: { created_at: new Date(now.getTime() - 24 * 3600_000).toISOString() } });
  const out: Insight[] = [];
  for (const i of insights) {
    const alert = (await db.select("alerts", { eq: { dedupe_key: i.key }, limit: 1 }))[0];
    if (alert?.sent_to.includes(staff.phone)) continue;
    if (recentOut.some((m) => m.body.includes(i.title))) continue;
    out.push(i);
    if (out.length === 2) break;
  }
  return out;
}

async function markDelivered(db: Db, insights: Insight[], phone: string) {
  for (const i of insights) {
    const alert = (await db.select("alerts", { eq: { dedupe_key: i.key }, limit: 1 }))[0];
    if (alert) await db.update("alerts", alert.id, { sent_to: [...new Set([...alert.sent_to, phone])], sent_at: alert.sent_at ?? new Date().toISOString() });
    else await db.insert("alerts", { dedupe_key: i.key, topic: i.topic, severity: i.severity, title: i.title, body: i.body, crane_id: i.crane_id, sent_to: [phone], sent_at: new Date().toISOString(), acknowledged_at: null });
  }
}

async function llmTurn(db: Db, input: AgentInput, ctx: ToolCtx, log: ToolCallLog[], persist: boolean) {
  const { staff, now } = ctx;
  const tools = toolsFor(staff);
  const specs: ToolSpec[] = tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description + (t.kind === "write" ? " (requiere confirmación del usuario)" : ""), parameters: t.parameters, strict: true },
  }));

  // Historial reciente de la conversación (24 h)
  const history = persist
    ? (
        await db.select("wa_messages", {
          eq: { phone: input.phone },
          gte: { created_at: new Date(now.getTime() - 24 * 3600_000).toISOString() },
          order: { column: "created_at", ascending: false },
          limit: 13,
        })
      )
        .slice(1) // el mensaje recién recibido va al final
        .reverse()
        .map((m): ChatMessage => (m.direction === "in" ? { role: "user", content: m.body } : { role: "assistant", content: m.body }))
    : [];

  const extras = persist ? await unknownInsights(db, staff, now) : [];
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(staff, now, tools.map((t) => t.name)) }, ...history];
  if (extras.length) {
    messages.push({ role: "system", content: `Pendientes que el usuario no conoce (úsalos sólo si aportan):\n${extras.map((e) => `- [${e.severity}] ${e.title}: ${e.body}`).join("\n")}` });
  }
  messages.push({ role: "user", content: input.text });

  let tokensIn = 0;
  let tokensOut = 0;
  let pendingSummary: string | null = null;
  let reply = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { message, usage } = await chat(messages, specs);
    tokensIn += usage?.prompt_tokens ?? 0;
    tokensOut += usage?.completion_tokens ?? 0;
    messages.push(message);
    const calls = (message.tool_calls ?? []).filter((c) => c.type === "function");
    if (!calls.length) {
      reply = message.content?.trim() ?? "";
      break;
    }
    for (const call of calls) {
      const t0 = Date.now();
      let args: Record<string, unknown> = {};
      let result: unknown;
      try {
        args = JSON.parse(call.function.arguments || "{}");
        const tool = toolByName(call.function.name);
        if (!tool || !tools.includes(tool)) throw new ToolError("Herramienta no permitida para este usuario.");
        if (tool.kind === "read") {
          result = await tool.run(args, ctx);
        } else if (pendingSummary) {
          result = { error: "Ya hay una acción esperando confirmación. Pide primero confirmar esa." };
        } else {
          const prep = await tool.prepare(args, ctx);
          pendingSummary = prep.summary;
          if (persist) {
            await db.insert("agent_pending_actions", {
              phone: input.phone,
              staff_id: staff.id,
              tool: tool.name,
              args: prep.args,
              summary: prep.summary,
              status: "pendiente",
              expires_at: new Date(now.getTime() + PENDING_TTL_MS).toISOString(),
              resolved_at: null,
              result: null,
            });
          }
          result = { requiere_confirmacion: true, resumen: prep.summary, instruccion: "Muestra este resumen tal cual y pide responder SÍ para confirmar o NO para cancelar. Todavía NO se ha hecho el cambio." };
        }
      } catch (e) {
        result = { error: e instanceof ToolError ? e.message : `Error interno: ${e instanceof Error ? e.message : e}` };
        if (!(e instanceof ToolError)) console.error(`[agent] ${call.function.name}`, e);
      }
      log.push({ name: call.function.name, args, result, ms: Date.now() - t0 });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12_000) });
    }
  }

  if (!reply) reply = pendingSummary ? `${pendingSummary}` : "No pude completar la consulta. ¿Puedes darme más detalle?";
  if (pendingSummary && !/\bS[ÍI]\b/.test(reply)) reply += "\n\nResponde *SÍ* para confirmar o *NO* para cancelar.";
  if (persist && extras.length && /por cierto/i.test(reply) && staff.phone) await markDelivered(db, extras, staff.phone);

  return { reply, pendingSummary, tokensIn, tokensOut };
}
