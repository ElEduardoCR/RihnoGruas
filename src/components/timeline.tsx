import Link from "next/link";
import type { FleetEvent } from "@/lib/domain/fleet";
import type { Crane, CraneStatus } from "@/lib/types";
import { addDays, dayKey, fmt } from "@/lib/time";
import { STATUS_STYLE, cx } from "./ui";

const KIND_STYLE: Record<FleetEvent["kind"], string> = {
  renta: "bg-ink text-white",
  mantenimiento: "bg-warn-mid text-ink",
  detencion: "stripes-red text-white",
  revision: "",
};

export function TimelineLegend() {
  const items = [
    { label: "Rentada", el: <span className="h-2.5 w-5 rounded-[3px] bg-ink" /> },
    { label: "Mantenimiento", el: <span className="h-2.5 w-5 rounded-[3px] bg-warn-mid" /> },
    { label: "Detenida", el: <span className="stripes-red h-2.5 w-5 rounded-[3px]" /> },
    { label: "Revisión", el: <span className="size-2.5 rounded-full border-2 border-rhino-500 bg-white" /> },
    { label: "Disponible", el: <span className="h-2.5 w-5 rounded-[3px] border border-dashed border-line-2 bg-white" /> },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.el}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Línea de tiempo tipo Gantt: una fila por grúa, una columna por día. */
export function WeekTimeline({
  cranes,
  events,
  start,
  days = 7,
  now,
  compact = false,
}: {
  cranes: (Crane & { status?: CraneStatus })[];
  events: FleetEvent[];
  start: Date;
  days?: number;
  now: Date;
  compact?: boolean;
}) {
  const end = addDays(start, days);
  const span = end.getTime() - start.getTime();
  const dayList = Array.from({ length: days }, (_, i) => addDays(start, i));
  const todayKey = dayKey(now);
  const nowPct = ((now.getTime() - start.getTime()) / span) * 100;
  const pos = (iso: string) => Math.max(0, Math.min(100, ((Date.parse(iso) - start.getTime()) / span) * 100));
  const rowH = compact ? 44 : 52;

  return (
    <div className="scroll-x">
      <div className="min-w-[760px]">
        <div className="flex border-b border-line">
          <div className="w-[176px] shrink-0" />
          <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days}, minmax(0,1fr))` }}>
            {dayList.map((d) => {
              const isToday = dayKey(d) === todayKey;
              return (
                <div key={d.toISOString()} className="flex items-center justify-center gap-1.5 pb-2.5 text-[12px]">
                  <span className="capitalize text-muted">{fmt.weekday(d)}</span>
                  <span className={cx("tabular grid size-6 place-items-center rounded-full font-semibold", isToday ? "bg-rhino-500 text-white" : "text-ink")}>
                    {Number(dayKey(d).slice(8))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        {cranes.map((c) => {
          const mine = events.filter((e) => e.crane_id === c.id && Date.parse(e.start) < end.getTime() && (e.open || Date.parse(e.end) > start.getTime()));
          const main = mine.filter((e) => e.kind !== "revision");
          const revisions = mine.filter((e) => e.kind === "revision");
          return (
            <div key={c.id} className="flex border-b border-line last:border-0">
              <Link href={`/gruas/${c.id}`} className="flex w-[176px] shrink-0 items-center gap-2.5 py-2 pr-3 hover:opacity-70">
                {c.status && <span className={cx("size-2 shrink-0 rounded-full", STATUS_STYLE[c.status].dot)} />}
                <div className="min-w-0 leading-tight">
                  <div className="text-[13px] font-semibold text-ink">{c.code}</div>
                  <div className="truncate text-[12px] text-muted">{c.name}</div>
                </div>
              </Link>
              <div className="relative flex-1" style={{ height: rowH }}>
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days}, minmax(0,1fr))` }}>
                  {dayList.map((d) => (
                    <div key={d.toISOString()} className={cx("border-l border-line/70", dayKey(d) === todayKey && "bg-rhino-50/40")} />
                  ))}
                </div>
                {main.length === 0 && (
                  <div className="absolute inset-x-1 top-1/2 h-6 -translate-y-1/2 rounded-md border border-dashed border-line-2" />
                )}
                {main.map((e) => {
                  const left = pos(e.start);
                  const right = e.open ? 100 : pos(e.end);
                  const width = Math.max(1.2, right - left);
                  return (
                    <Link
                      key={e.id}
                      href={e.href}
                      title={`${e.title}${e.subtitle ? ` · ${e.subtitle}` : ""}\n${fmt.dateTime(e.start)} → ${e.open ? "sin fecha de liberación" : fmt.dateTime(e.end)}`}
                      className={cx(
                        "absolute top-1/2 flex h-7 -translate-y-1/2 items-center overflow-hidden rounded-[7px] px-2 text-[12px] font-medium whitespace-nowrap shadow-[0_0_0_2px_#fff] transition hover:brightness-110",
                        KIND_STYLE[e.kind],
                        e.kind === "renta" && e.status === "cotizada" && "border border-dashed border-ink bg-white text-ink",
                        e.open && "rounded-r-none",
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      {width > 9 && <span className="truncate">{e.title}</span>}
                    </Link>
                  );
                })}
                {revisions.map((e) => (
                  <Link
                    key={e.id}
                    href={e.href}
                    title={`${e.title} · ${e.status}\n${fmt.dateTime(e.start)}`}
                    className={cx(
                      "absolute bottom-1 z-10 size-3 -translate-x-1/2 rounded-full border-2 border-rhino-500 shadow-[0_0_0_2px_#fff]",
                      e.status === "completada" ? "bg-rhino-500" : "bg-white",
                    )}
                    style={{ left: `${pos(e.start)}%` }}
                  />
                ))}
                {nowPct > 0 && nowPct < 100 && <div className="absolute top-0 bottom-0 z-20 w-px bg-rhino-500" style={{ left: `${nowPct}%` }} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
