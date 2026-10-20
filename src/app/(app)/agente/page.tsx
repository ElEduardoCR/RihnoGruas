import { Suspense } from "react";
import { connection } from "next/server";
import { BookOpen, Database, FlaskConical, Hand, MessagesSquare, ShieldCheck, Wrench } from "lucide-react";
import { getDb } from "@/lib/db";
import { env, hasOpenAI, hasWhatsApp, isDemo } from "@/lib/env";
import { ROLE_LABELS } from "@/lib/labels";
import { fmt } from "@/lib/time";
import { Badge, Card, CardHeader, PageHeader, PageSkeleton, cx } from "@/components/ui";
import { AgentChat } from "@/components/agent-chat";
import { AgentActions, EvalRunner } from "@/components/agent-ops";

export const metadata = { title: "Agente Rhino" };

export default function AgentPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={2} />}>
      <Agent />
    </Suspense>
  );
}

async function Agent() {
  await connection();
  const db = await getDb();
  const [staff, runs, alerts] = await Promise.all([
    db.select("staff", { eq: { active: true }, order: { column: "full_name" } }),
    db.select("agent_runs", { order: { column: "created_at", ascending: false }, limit: 40 }),
    db.select("alerts", { order: { column: "created_at", ascending: false }, limit: 12 }),
  ]);
  const withPhone = staff.filter((s) => s.phone);
  const director = withPhone.find((s) => s.role === "direccion") ?? withPhone[0];
  const initial = director
    ? (await db.select("wa_messages", { eq: { phone: director.phone! }, order: { column: "created_at", ascending: false }, limit: 40 }))
        .reverse()
        .map((m) => ({ id: m.id, direction: m.direction, body: m.body, kind: m.kind, created_at: m.created_at }))
    : [];
  const chats = runs.filter((r) => r.trigger !== "eval").slice(0, 12);
  const lastEval = runs.find((r) => r.trigger === "eval");
  const staffName = new Map(staff.map((s) => [s.id, s.full_name]));

  return (
    <>
      <PageHeader
        title="Agente Rhino"
        subtitle="Rhino atiende al equipo por WhatsApp, decide qué es importante y lo avisa sin que se lo pidan. Aquí puedes probarlo y auditar cada decisión."
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
          {director && (
            <AgentChat
              staff={withPhone.map((s) => ({ id: s.id, label: `${s.full_name} · ${ROLE_LABELS[s.role]}` }))}
              defaultStaffId={director.id}
              initial={initial}
            />
          )}

          <Card>
            <CardHeader title="Bitácora de decisiones" subtitle="Cada mensaje queda registrado con las herramientas que usó: auditoría y base para evaluar y afinar el modelo." />
            <ul className="divide-y divide-line px-5 pt-2 pb-3 sm:px-6">
              {chats.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                    <span>{fmt.dateTime(r.created_at)}</span>
                    <Badge tone={r.trigger === "whatsapp" ? "green" : "outline"}>{r.trigger}</Badge>
                    {r.staff_id && <span>{staffName.get(r.staff_id)}</span>}
                    {r.latency_ms != null && <span>· {(r.latency_ms / 1000).toFixed(1)} s</span>}
                    {r.model && <span>· {r.model}</span>}
                    {r.error && <Badge tone="red">error</Badge>}
                  </div>
                  <div className="mt-1 text-[14px] font-medium">“{r.input}”</div>
                  {r.tool_calls.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {r.tool_calls.map((t, i) => (
                        <Badge key={i} tone="neutral"><Wrench className="size-3" />{t.name}</Badge>
                      ))}
                    </div>
                  )}
                  <p className="mt-1.5 line-clamp-2 text-[13px] whitespace-pre-line text-muted">{r.output}</p>
                </li>
              ))}
              {chats.length === 0 && <li className="py-6 text-center text-[13px] text-muted">Aún no hay conversaciones.</li>}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <h2 className="text-[17px] font-semibold">Estado</h2>
            <ul className="mt-4 space-y-3 text-[14px]">
              <Status ok={hasWhatsApp} label="WhatsApp Cloud API" detail={hasWhatsApp ? "Conectado" : "Simulado: configura WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID"} />
              <Status ok={hasOpenAI} label="Modelo de IA" detail={hasOpenAI ? env.openaiModel : "Sin OPENAI_API_KEY: respuestas por reglas"} />
              <Status ok={!isDemo} label="Base de datos" detail={isDemo ? "Demo en memoria" : "Supabase"} />
            </ul>
            <div className="mt-4 rounded-2xl bg-canvas p-3 text-[12px] text-muted">
              Webhook de WhatsApp: <span className="font-mono break-all text-ink">{env.appUrl}/api/whatsapp</span>
            </div>
            <div className="mt-4">
              <AgentActions />
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <FlaskConical className="size-5 text-rhino-500" />
              <h2 className="text-[17px] font-semibold">Evaluación de precisión</h2>
            </div>
            <p className="mt-1 mb-4 text-[13px] text-muted">24 preguntas con respuesta esperada: ¿elige la herramienta correcta, da el dato correcto y pide confirmación antes de cambiar algo?</p>
            <EvalRunner last={lastEval ? { output: lastEval.output ?? "", created_at: lastEval.created_at } : null} />
          </Card>

          <Card className="bg-night p-5 text-white sm:p-6" as="div">
            <h2 className="text-[17px] font-semibold">Cómo se asegura la precisión</h2>
            <p className="mt-1 text-[12px] text-white/50">Siguiendo la guía “Optimizing LLM accuracy” de OpenAI</p>
            <ul className="mt-4 space-y-3.5 text-[13px] leading-relaxed text-white/70">
              <li className="flex gap-3"><BookOpen className="mt-0.5 size-4 shrink-0 text-rhino-400" /><span><b className="text-white">Prompt claro y con pasos</b>, fecha y rol del usuario en contexto, y ejemplos (few-shot) del estilo esperado.</span></li>
              <li className="flex gap-3"><Database className="mt-0.5 size-4 shrink-0 text-rhino-400" /><span><b className="text-white">Contexto, no memoria:</b> cada dato sale de herramientas sobre la base de datos y de políticas internas con búsqueda vectorial (RAG). Pocos resultados y precisos.</span></li>
              <li className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-rhino-400" /><span><b className="text-white">Reglas deterministas</b> para lo crítico: disponibilidad, documentos, operadores, antirrobo y la revisión antes de cada renta las decide el código, no el modelo.</span></li>
              <li className="flex gap-3"><Hand className="mt-0.5 size-4 shrink-0 text-rhino-400" /><span><b className="text-white">Humano en el ciclo:</b> todo cambio requiere un “SÍ”. Si hay duda, pregunta o escala a Dirección.</span></li>
              <li className="flex gap-3"><FlaskConical className="mt-0.5 size-4 shrink-0 text-rhino-400" /><span><b className="text-white">Evaluaciones</b> con 24 casos de referencia para medir cada cambio de prompt o modelo.</span></li>
              <li className="flex gap-3"><MessagesSquare className="mt-0.5 size-4 shrink-0 text-rhino-400" /><span><b className="text-white">Bitácora completa</b> de entradas, herramientas y respuestas: base para afinar (fine-tuning) cuando haya 50+ ejemplos buenos.</span></li>
            </ul>
          </Card>

          <Card>
            <CardHeader title="Alertas enviadas" subtitle="Lo que Rhino avisó sin que se lo pidieran" />
            <ul className="divide-y divide-line px-5 pt-2 pb-3 sm:px-6">
              {alerts.map((a) => (
                <li key={a.id} className="py-3">
                  <div className="flex items-center gap-2">
                    <span className={cx("size-2 rounded-full", a.severity === "critica" ? "bg-rhino-500" : a.severity === "aviso" ? "bg-warn-mid" : "bg-line-2")} />
                    <span className="text-[14px] font-medium">{a.title}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 pl-4 text-[12px] text-muted">{a.body}</p>
                  <div className="mt-1 pl-4 text-[11px] text-faint">
                    {fmt.dateTime(a.created_at)} · {a.topic} · {a.sent_to.length ? `enviada a ${a.sent_to.length}` : "sin destinatarios"}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function Status({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={cx("mt-1.5 size-2.5 shrink-0 rounded-full", ok ? "bg-ok" : "bg-warn-mid")} />
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-[12px] text-muted">{detail}</div>
      </div>
    </li>
  );
}
