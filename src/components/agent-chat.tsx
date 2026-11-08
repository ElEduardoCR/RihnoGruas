"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, ArrowUp, Boxes, CalendarDays, Check, ChevronDown, CircleHelp, ClipboardCheck, Loader2, MessageSquare, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import { agentChatAction, loadConversationAction } from "@/app/actions";
import type { StaffRole, ToolCallLog } from "@/lib/types";
import { RhinoMark } from "./brand";
import { cx } from "./ui";

interface Msg {
  id: string;
  direction: "in" | "out";
  body: string;
  kind?: string;
  created_at: string;
  tools?: ToolCallLog[];
}

interface Props {
  initial: Msg[];
  initialPending: { id: string; summary: string } | null;
  user: { name: string; role: StaffRole; roleLabel: string };
  ai: boolean;
  demo: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  consultar_capacidades: "Revisar qué puedo hacer con tus permisos",
  consultar_flota: "Revisar la flota",
  consultar_grua: "Consultar el expediente de la unidad",
  buscar_disponibilidad: "Comprobar disponibilidad",
  consultar_agenda: "Consultar la agenda",
  consultar_inventario: "Revisar existencias",
  alertas_inventario: "Revisar pendientes del almacén",
  resumen_gastos: "Consultar gastos",
  documentos_por_vencer: "Revisar documentos",
  estado_revisiones: "Consultar revisiones",
  buscar_politica: "Consultar las reglas de la empresa",
  consultar_operadores: "Verificar operadores",
  consultar_clientes: "Buscar clientes",
  enviar_revision: "Compartir enlace de revisión",
  crear_renta: "Registrar renta",
  programar_revision: "Programar revisión",
  reportar_detencion: "Registrar detención",
  liberar_grua: "Liberar unidad",
  programar_mantenimiento: "Programar mantenimiento",
  registrar_salida_almacen: "Registrar salida de almacén",
  resolver_salida: "Resolver autorización de almacén",
  registrar_compra: "Registrar compra",
  registrar_cliente: "Dar de alta un cliente",
  registrar_grua: "Dar de alta una unidad",
};

/** Formato compartido con WhatsApp, sin interpretar HTML generado por el modelo. */
function MessageText({ text }: { text: string }) {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|https?:\/\/[^\s<>]+)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <strong key={i}>{part.slice(1, -1)}</strong>;
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-rhino-600 underline underline-offset-2">{part}</a>;
    return <span key={i}>{part}</span>;
  });
}

function Activity({ tools }: { tools: ToolCallLog[] }) {
  return <details className="group mt-4 rounded-xl border border-line text-[13px]">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
      <Wrench className="size-3.5" aria-hidden="true" /> Actividad de Rhino · {tools.length} {tools.length === 1 ? "paso" : "pasos"}
      <ChevronDown className="ml-auto size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <ul className="space-y-2 border-t border-line px-3.5 py-3">
      {tools.map((tool, i) => {
        const result = tool.result && typeof tool.result === "object" ? tool.result as Record<string, unknown> : {};
        const prepared = Boolean(result.requiere_confirmacion);
        const failed = Boolean(result.error);
        const confirmed = tool.name.endsWith(" (confirmada)");
        const name = tool.name.replace(/ \(confirmada\)$/, "");
        return <li key={i} className="flex items-start gap-2.5">
          {failed ? <CircleHelp className="mt-0.5 size-4 shrink-0 text-warn" /> : prepared ? <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted" /> : <Check className="mt-0.5 size-4 shrink-0 text-ok" />}
          <span className="min-w-0 flex-1">{TOOL_LABELS[name] ?? "Procesar solicitud"}<span className="block text-xs text-muted">{failed ? "No se pudo completar" : prepared ? "Preparado, pendiente de tu confirmación" : confirmed ? "Ejecutado" : "Completado"}</span></span>
        </li>;
      })}
    </ul>
  </details>;
}

export function AgentChat({ initial, initialPending, user, ai, demo }: Props) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [pendingAction, setPendingAction] = useState(initialPending);
  const [pending, start] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendLock = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = pending || loading;
  const manager = ["direccion", "administracion"].includes(user.role);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest" });
  }, [messages, pending]);

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
    }
  }, [text]);

  const reload = async () => {
    if (sendLock.current || busy) return;
    setLoading(true);
    setError(null);
    try {
      const state = await loadConversationAction();
      setMessages(state.messages);
      setPendingAction(state.pending);
    } catch {
      setError("No se pudo actualizar la conversación. Revisa tu conexión e inténtalo de nuevo.");
    } finally { setLoading(false); }
  };

  const send = (value: string) => {
    const body = value.trim();
    if (!body || busy || error || sendLock.current || body.length > 6000) return;
    sendLock.current = true;
    setError(null);
    setText("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), direction: "in", body, created_at: new Date().toISOString() }]);
    start(async () => {
      try {
        const response = await agentChatAction({ text: body, expectedPendingId: pendingAction?.id });
        setMessages((current) => [...current, { id: crypto.randomUUID(), direction: "out", body: response.reply, created_at: new Date().toISOString(), tools: response.toolCalls }]);
        setPendingAction(response.pending && response.pendingId ? { id: response.pendingId, summary: response.pending } : null);
      } catch {
        setError("No recibimos el resultado. Actualiza la conversación antes de repetir la solicitud para comprobar si se procesó.");
      } finally {
        sendLock.current = false;
        inputRef.current?.focus();
      }
    });
  };

  const suggestions = ai ? [
    user.role === "operador"
      ? { title: "Mis revisiones", text: "¿Qué revisiones tengo pendientes y cómo las completo?", icon: ClipboardCheck }
      : user.role === "mecanico"
        ? { title: "Agendar mantenimiento", text: "Quiero programar un mantenimiento. Guíame y encárgate de registrarlo.", icon: Wrench }
        : user.role === "almacen"
          ? { title: "Registrar una salida", text: "Quiero registrar una salida de almacén. Guíame y encárgate de registrarla.", icon: Boxes }
          : { title: "Agendar una renta", text: "Quiero agendar una renta. Guíame y encárgate de registrarla.", icon: CalendarDays },
    { title: "Revisar mi flota", text: "¿Cómo está la flota hoy y qué necesita atención?", icon: Wrench },
    manager
      ? { title: "Registrar una compra", text: "Quiero registrar una compra. Ayúdame con los datos necesarios y regístrala.", icon: Boxes }
      : { title: "Consultar mi agenda", text: "¿Qué tenemos programado para hoy?", icon: CalendarDays },
    { title: "No sé por dónde empezar", text: "Soy nuevo en el sistema. ¿Qué puedes hacer por mí con mis permisos?", icon: CircleHelp },
  ] : [
    { title: "Estado de la flota", text: "¿Cómo está la flota hoy?", icon: Wrench },
    ["operador", "almacen"].includes(user.role)
      ? { title: "Consultar inventario", text: "¿Qué artículos están bajo el mínimo en inventario?", icon: Boxes }
      : { title: "Unidades disponibles", text: "¿Qué grúas están disponibles mañana?", icon: CalendarDays },
    { title: "Próximas revisiones", text: "¿Qué revisiones están pendientes?", icon: ClipboardCheck },
    { title: "¿Qué puedo hacer?", text: "¿Qué puedes hacer por mí?", icon: CircleHelp },
  ];

  return <section className="flex h-full min-h-0 flex-col bg-white" aria-label="Conversación con el asistente Rhino">
    <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 px-5 sm:px-8">
      <div className="flex items-center gap-2.5">
        <span className="text-[16px] font-semibold tracking-tight">Rhino <span className="font-normal text-muted">/ Asistente</span></span>
        {demo && <span className="rounded-md bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">Demo</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden text-[12px] text-muted sm:inline">{user.roleLabel}</span>
        <button onClick={reload} disabled={busy} type="button" aria-label="Actualizar conversación" title="Actualizar conversación" className="grid size-11 place-items-center rounded-xl text-muted transition hover:bg-canvas hover:text-ink disabled:opacity-40"><RefreshCw className={cx("size-4", loading && "animate-spin")} /></button>
      </div>
    </header>

    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-8">
      {messages.length === 0 ? <div className="mx-auto flex min-h-full max-w-[740px] flex-col justify-center py-8 sm:py-12">
        <div className="mb-8 sm:mb-10">
          <div className="mb-6 flex items-center gap-2 text-[13px] font-medium text-muted"><span className="size-1.5 rounded-full bg-rhino-500" /> TU ESPACIO DE TRABAJO</div>
          <h1 className="text-[30px] leading-[1.16] font-semibold tracking-[-0.04em] sm:text-[42px]">¿Qué hacemos hoy,<br className="sm:hidden" />{" "}{user.name.split(" ")[0]}?</h1>
          <p className="mt-4 max-w-[550px] text-[15px] leading-7 text-muted">{ai ? "Cuéntame qué necesitas. Reviso si se puede hacer, te guío con los datos que falten y me encargo de la operación." : "Consulta tu operación en lenguaje sencillo. Por ahora puedo revisar datos; para registrar cambios por chat hace falta activar la IA."}</p>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {suggestions.map(({ title, text: suggestion, icon: Icon }) => <button key={title} onClick={() => send(suggestion)} disabled={busy} type="button" className="group flex min-h-[70px] items-center gap-3 rounded-2xl border border-line px-4 py-4 text-left transition hover:border-line-2 hover:bg-canvas disabled:opacity-50 sm:min-h-[82px]">
            <Icon className="size-[18px] shrink-0 text-muted" strokeWidth={1.6} />
            <span className="flex-1 text-[14px] font-medium">{title}</span>
            <ArrowRight className="size-4 shrink-0 text-muted opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>)}
        </div>
      </div> : <div role="log" aria-label="Mensajes de la conversación" aria-live="polite" aria-relevant="additions" className="mx-auto max-w-[740px] space-y-8 py-7">
        {messages.map((message) => <article key={message.id} aria-label={message.direction === "in" ? "Tu mensaje" : "Respuesta de Rhino"} className={cx("flex gap-3", message.direction === "in" && "justify-end")}>
          {message.direction === "out" && <RhinoMark className="mt-0.5 size-8 shrink-0" />}
          <div className={cx("min-w-0 text-[15px] leading-7", message.direction === "in" ? "max-w-[90%] rounded-3xl bg-[#f1f1f3] px-5 py-3 sm:max-w-[85%]" : "flex-1 pt-0.5")}>
            {message.direction === "out" && <div className="mb-1 text-[13px] font-semibold">Rhino</div>}
            <div className="whitespace-pre-wrap [overflow-wrap:anywhere]"><MessageText text={message.body} /></div>
            {Boolean(message.tools?.length) && <Activity tools={message.tools!} />}
          </div>
        </article>)}
        {pending && <div role="status" className="flex items-center gap-3 text-[14px] text-muted"><RhinoMark className="size-8" /><Loader2 className="size-4 animate-spin" /> Rhino está revisando tu solicitud…</div>}
        <div ref={endRef} />
      </div>}
    </div>

    <div className="mx-auto w-full max-w-[804px] shrink-0 px-5 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-8 sm:pb-5">
      {pendingAction && <div className="mb-3 max-h-[30dvh] overflow-y-auto rounded-2xl border border-rhino-200 bg-rhino-50/50 p-4">
        <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><ShieldCheck className="size-4 text-rhino-600" /> Lista para tu confirmación</div>
        <div className="text-[13px] leading-6 whitespace-pre-wrap"><MessageText text={pendingAction.summary} /></div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => send("SÍ")} disabled={busy || Boolean(error)} className="min-h-11 rounded-xl bg-ink px-4 text-[13px] font-medium text-white hover:bg-ink-2 disabled:opacity-50">Confirmar y ejecutar</button>
          <button type="button" onClick={() => send("NO")} disabled={busy || Boolean(error)} className="min-h-11 rounded-xl border border-line-2 bg-white px-4 text-[13px] font-medium hover:bg-canvas disabled:opacity-50">Cancelar acción</button>
        </div>
      </div>}
      {error && <div role="alert" className="mb-3 rounded-xl bg-warn-soft p-3 text-[13px] leading-5 text-ink-2">{error} <button type="button" onClick={reload} disabled={busy} className="mt-1 block min-h-9 font-semibold underline underline-offset-2">Actualizar conversación</button></div>}
      <form className="rounded-[24px] border border-line-2 bg-[#fafafa] p-3 shadow-[0_3px_16px_rgb(0_0_0/0.03)] transition focus-within:border-ink focus-within:bg-white" onSubmit={(event) => { event.preventDefault(); send(text); }}>
        <label htmlFor="rhino-message" className="sr-only">¿Qué necesitas hacer?</label>
        <textarea id="rhino-message" ref={inputRef} value={text} onChange={(event) => setText(event.target.value)} maxLength={6000} rows={2} placeholder="Pídele a Rhino lo que necesitas…" aria-describedby="rhino-composer-help" className="block min-h-[60px] w-full resize-none bg-transparent px-2 pt-1 text-[16px] leading-6 outline-none placeholder:text-muted" onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !window.matchMedia("(pointer: coarse)").matches) { event.preventDefault(); send(text); }
        }} />
        <div className="mt-1 flex items-center justify-between gap-3 pl-2">
          <div className="flex items-center gap-1.5 text-[12px] text-muted"><MessageSquare className="size-3.5" /> {ai ? "Asistente con IA" : "Modo consulta"}</div>
          <button type="submit" disabled={!text.trim() || busy || Boolean(error)} aria-label="Enviar mensaje" className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-ink-2 disabled:bg-line disabled:text-muted">{pending ? <Loader2 className="size-5 animate-spin" /> : <ArrowUp className="size-5" />}</button>
        </div>
      </form>
      <div id="rhino-composer-help" className="mt-2.5 flex flex-wrap items-center justify-center gap-x-1 text-center text-[11px] leading-5 text-muted">
        {demo ? "Estás en una demo. Los cambios se reinician al cerrar el servidor." : "Rhino usa tus permisos y verifica las reglas del ERP."}
        {manager && <Link href="/agente" className="underline underline-offset-2 hover:text-ink">Centro del agente</Link>}
      </div>
    </div>
  </section>;
}
