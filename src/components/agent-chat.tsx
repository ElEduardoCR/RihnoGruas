"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, ChevronDown, Loader2, Wrench } from "lucide-react";
import { agentChatAction, loadConversationAction } from "@/app/actions";
import { RhinoMark } from "./brand";
import { cx, selectClass } from "./ui";

interface Msg {
  id: string;
  direction: "in" | "out";
  body: string;
  kind?: string;
  created_at: string;
  tools?: { name: string; ms: number; args: unknown; result: unknown }[];
}

const SUGGESTIONS = [
  "¿Cómo está la flota hoy?",
  "¿Qué titán está libre mañana?",
  "¿Qué documentos vencen este mes?",
  "¿Hay salidas de almacén por autorizar?",
  "¿Cuánto llevamos gastado este mes?",
  "Rentale la RH-09 a Constructora Altavista del lunes al miércoles",
  "Saca 20 litros de aceite hidráulico ISO 68 para la RH-02",
  "La RH-01 se quedó sin frenos, detenla",
];

/** Formato WhatsApp: *negritas*, _cursivas_ y saltos de línea. */
function WaText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_|https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <b key={i} className="font-semibold">{p.slice(1, -1)}</b>
        ) : p.startsWith("_") && p.endsWith("_") && p.length > 2 ? (
          <i key={i}>{p.slice(1, -1)}</i>
        ) : /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" className="break-all text-rhino-600 underline">{p}</a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

const time = (s: string) => new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(s));

export function AgentChat({ staff, defaultStaffId, initial }: { staff: { id: string; label: string }[]; defaultStaffId: string; initial: Msg[] }) {
  const [staffId, setStaffId] = useState(defaultStaffId);
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, pending]);

  const switchStaff = async (id: string) => {
    setStaffId(id);
    setLoading(true);
    setMessages(await loadConversationAction(id));
    setLoading(false);
  };

  const send = (value: string) => {
    const t = value.trim();
    if (!t || pending) return;
    setText("");
    const mine: Msg = { id: `tmp-${Date.now()}`, direction: "in", body: t, created_at: new Date().toISOString() };
    setMessages((m) => [...m, mine]);
    start(async () => {
      try {
        const r = await agentChatAction({ staffId, text: t });
        setMessages((m) => [...m, { id: `r-${Date.now()}`, direction: "out", body: r.reply, created_at: new Date().toISOString(), tools: r.toolCalls }]);
      } catch (e) {
        setMessages((m) => [...m, { id: `e-${Date.now()}`, direction: "out", body: `⚠️ ${e instanceof Error ? e.message : "Error"}`, created_at: new Date().toISOString() }]);
      }
    });
  };

  return (
    <div className="flex h-[720px] max-h-[calc(100dvh-140px)] min-h-[520px] flex-col overflow-hidden rounded-[22px] border border-black/[0.04] bg-white shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3 border-b border-line bg-night px-4 py-3 text-white">
        <RhinoMark className="size-9" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[15px] font-semibold">Rhino</div>
          <div className="text-[12px] text-white/50">{pending ? "escribiendo…" : "Simulador del chat de WhatsApp"}</div>
        </div>
        <div className="relative w-[210px]">
          <select value={staffId} onChange={(e) => switchStaff(e.target.value)} className={cx(selectClass, "h-9 border-white/15 bg-white/10 text-[13px] text-white focus:border-white/40 focus:ring-0")} aria-label="Hablar como">
            {staff.map((s) => (
              <option key={s.id} value={s.id} className="text-ink">{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto bg-[#f2f1ee] px-4 py-4">
        {loading && <div className="py-8 text-center text-[13px] text-muted">Cargando conversación…</div>}
        {!loading && messages.length === 0 && <div className="py-8 text-center text-[13px] text-muted">Sin mensajes. Escribe algo o usa una sugerencia.</div>}
        {messages.map((m) => (
          <div key={m.id} className={cx("flex", m.direction === "in" ? "justify-end" : "justify-start")}>
            <div className={cx("max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap shadow-[0_1px_1px_rgb(0_0_0/0.06)]", m.direction === "in" ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-white text-ink")}>
              {m.kind && m.kind !== "chat" && <div className="mb-1 text-[11px] font-semibold tracking-wide text-rhino-600 uppercase">{m.kind === "resumen" ? "Resumen matutino" : m.kind === "alerta" ? "Alerta proactiva" : "Aviso"}</div>}
              <WaText text={m.body} />
              <div className={cx("mt-1 text-right text-[10px]", m.direction === "in" ? "text-white/50" : "text-faint")}>{time(m.created_at)}</div>
              {m.tools && m.tools.length > 0 && (
                <div className="mt-2 border-t border-line pt-2">
                  <button type="button" onClick={() => setOpen(open === m.id ? null : m.id)} className="flex items-center gap-1 text-[11px] font-medium text-muted">
                    <Wrench className="size-3" /> {m.tools.length} herramienta{m.tools.length > 1 ? "s" : ""}: {m.tools.map((t) => t.name).join(", ")}
                    <ChevronDown className={cx("size-3 transition", open === m.id && "rotate-180")} />
                  </button>
                  {open === m.id && (
                    <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-canvas p-2 text-[10px] leading-snug whitespace-pre-wrap text-ink-2">
                      {m.tools.map((t) => `▸ ${t.name} (${t.ms} ms)\n${JSON.stringify(t.args)}\n→ ${JSON.stringify(t.result).slice(0, 700)}`).join("\n\n")}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex">
            <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm">
              <Loader2 className="size-4 animate-spin text-muted" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="scroll-x flex gap-2 border-t border-line px-3 pt-3">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => send(s)} disabled={pending} className="shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-[12px] whitespace-nowrap text-ink-2 hover:border-ink/30 disabled:opacity-50">
            {s}
          </button>
        ))}
        <button type="button" onClick={() => send("SÍ")} disabled={pending} className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">SÍ</button>
        <button type="button" onClick={() => send("NO")} disabled={pending} className="shrink-0 rounded-full border border-ink px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50">NO</button>
      </div>
      <form
        className="flex items-center gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe como lo harías en WhatsApp…" className="h-11 flex-1 rounded-full border border-line-2 bg-canvas px-4 text-[15px] outline-none focus:border-ink focus:bg-white" />
        <button type="submit" disabled={!text.trim() || pending} className="grid size-11 place-items-center rounded-full bg-rhino-500 text-white disabled:bg-line-2" aria-label="Enviar">
          <ArrowUp className="size-5" />
        </button>
      </form>
    </div>
  );
}
