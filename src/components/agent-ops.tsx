"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, FlaskConical, Loader2, Radar, Sun, XCircle } from "lucide-react";
import { runEvalsAction, runScanAction, sendBriefAction } from "@/app/actions";
import type { EvalResult } from "@/lib/agent/evals";
import { FormMessage } from "./modal";
import { buttonClass, cx } from "./ui";

export function AgentActions() {
  const [scan, scanAction, scanning] = useActionState(runScanAction, null);
  const [brief, briefAction, briefing] = useActionState(sendBriefAction, null);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <form action={scanAction}>
          <button disabled={scanning} className={cx(buttonClass("dark"), "w-full")}>
            {scanning ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />} Escanear ahora
          </button>
        </form>
        <form action={briefAction}>
          <button disabled={briefing} className={cx(buttonClass("outline"), "w-full")}>
            {briefing ? <Loader2 className="size-4 animate-spin" /> : <Sun className="size-4" />} Resumen matutino
          </button>
        </form>
      </div>
      <FormMessage state={scan} />
      <FormMessage state={brief} />
    </div>
  );
}

export function EvalRunner({ last }: { last: { output: string; created_at: string } | null }) {
  const [pending, start] = useTransition();
  const [data, setData] = useState<{ summary: { total: number; passed: number; accuracy: number; model: string }; results: EvalResult[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              setData(await runEvalsAction());
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            }
          })
        }
        disabled={pending}
        className={cx(buttonClass("primary"), "w-full")}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
        {pending ? "Evaluando 24 casos…" : "Correr evaluación"}
      </button>
      {error && <p className="mt-2 text-[13px] text-rhino-600">{error}</p>}
      {!data && last && <p className="mt-3 text-[13px] text-muted">Última: <b className="text-ink">{last.output}</b></p>}
      {data && (
        <div className="mt-4">
          <div className="flex items-baseline gap-2">
            <span className={cx("text-[40px] font-semibold", data.summary.accuracy < 80 ? "text-rhino-500" : "text-ink")}>{data.summary.accuracy}%</span>
            <span className="text-[13px] text-muted">{data.summary.passed}/{data.summary.total} · {data.summary.model}</span>
          </div>
          <ul className="mt-3 max-h-[360px] space-y-1.5 overflow-y-auto">
            {data.results.map((r) => (
              <li key={r.id} className="rounded-xl bg-canvas px-3 py-2 text-[12px]" title={r.reply}>
                <div className="flex items-center gap-2">
                  {r.passed ? <CheckCircle2 className="size-3.5 shrink-0 text-ok" /> : <XCircle className="size-3.5 shrink-0 text-rhino-500" />}
                  <span className="truncate font-medium">{r.input}</span>
                </div>
                {!r.passed && <div className="mt-0.5 pl-5.5 text-rhino-600">{r.reasons.join(" · ")}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
