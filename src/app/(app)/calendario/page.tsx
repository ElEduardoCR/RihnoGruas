import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { getDb } from "@/lib/db";
import { getEvents } from "@/lib/services/fleet";
import { getFormOptions } from "@/lib/services/options";
import { statusAt, statusOnDay, type FleetEvent } from "@/lib/domain/fleet";
import { STATUS_LABELS } from "@/lib/labels";
import type { CraneStatus } from "@/lib/types";
import { addDays, addMonths, atLocal, dayKey, fmt, fromDayKey, startOfDay, startOfMonth, startOfWeek, toLocalInput, zonedParts } from "@/lib/time";
import { Badge, Card, CardHeader, Empty, PageHeader, PageSkeleton, STATUS_STYLE, Tabs, buttonClass, cx } from "@/components/ui";
import { TimelineLegend, WeekTimeline } from "@/components/timeline";
import { Modal } from "@/components/modal";
import { RentalForm } from "@/components/forms";

export const metadata = { title: "Calendario" };

type SP = Promise<{ view?: string; m?: string; w?: string; d?: string }>;

export default function CalendarPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<PageSkeleton rows={2} />}>
      <Calendar searchParams={searchParams} />
    </Suspense>
  );
}

const KIND_LABEL: Record<FleetEvent["kind"], string> = { renta: "Renta", mantenimiento: "Mantenimiento", detencion: "Detenida", revision: "Revisión" };
const KIND_DOT: Record<FleetEvent["kind"], string> = { renta: "bg-ink", mantenimiento: "bg-warn-mid", detencion: "bg-rhino-500", revision: "border-2 border-rhino-500 bg-white" };

async function Calendar({ searchParams }: { searchParams: SP }) {
  await connection();
  const sp = await searchParams;
  const db = await getDb();
  const now = new Date();
  const view = sp.view === "linea" ? "linea" : "mes";
  const monthStart = sp.m ? fromDayKey(`${sp.m}-01`) : startOfMonth(now);
  const selected = sp.d ?? dayKey(now);
  const weekStart = sp.w ? startOfWeek(fromDayKey(sp.w)) : startOfWeek(now);

  const gridStart = startOfWeek(monthStart);
  const gridEnd = addDays(gridStart, 42);
  const rangeStart = view === "mes" ? gridStart : weekStart;
  const rangeEnd = view === "mes" ? gridEnd : addDays(weekStart, 14);

  const [cranes, events, opts] = await Promise.all([
    db.select("cranes", { eq: { active: true }, order: { column: "code" } }),
    getEvents(db, addDays(rangeStart, -1), addDays(rangeEnd, 1), now),
    getFormOptions(db),
  ]);
  const withStatus = cranes.map((c) => ({ ...c, status: statusAt(c.id, now, events) }));
  const monthKey = dayKey(monthStart).slice(0, 7);
  const qs = (o: Record<string, string>) => `/calendario?${new URLSearchParams({ view, m: monthKey, ...o }).toString()}`;

  return (
    <>
      <PageHeader
        title="Calendario"
        subtitle="Rentas, mantenimientos, detenciones y revisiones de toda la flotilla."
        actions={
          opts.cranes.length > 0 && (
            <Modal label="Nueva renta" title="Nueva renta" subtitle="Rhino agenda automáticamente la revisión total del día anterior." icon={<Plus className="size-4" />}>
              <RentalForm cranes={opts.cranes} clients={opts.clients} operators={opts.operators} defaults={{ start: toLocalInput(atLocal(now, 1, 7)), end: toLocalInput(atLocal(now, 2, 18)) }} />
            </Modal>
          )
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          active={view}
          tabs={[
            { key: "mes", label: "Mes por grúa", href: `/calendario?view=mes&m=${monthKey}` },
            { key: "linea", label: "Línea de tiempo", href: `/calendario?view=linea&w=${dayKey(weekStart)}` },
          ]}
        />
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted">
          {(["disponible", "rentada", "mantenimiento", "detenida"] as CraneStatus[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={cx("size-3 rounded-[4px]", STATUS_STYLE[s].bar, s === "disponible" && "bg-ok-soft ring-1 ring-ok/40")} />
              {STATUS_LABELS[s]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-2 border-rhino-500" />
            Revisión
          </span>
        </div>
      </div>

      {view === "mes" ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">
          <Card className="p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[20px] font-semibold first-letter:uppercase">{fmt.month(monthStart)}</h2>
              <div className="flex items-center gap-1">
                <Link href={qs({ m: dayKey(addMonths(monthStart, -1)).slice(0, 7) })} className={buttonClass("ghost", "sm")} aria-label="Mes anterior">
                  <ChevronLeft className="size-4" />
                </Link>
                <Link href={`/calendario?view=mes`} className={buttonClass("outline", "sm")}>Hoy</Link>
                <Link href={qs({ m: dayKey(addMonths(monthStart, 1)).slice(0, 7) })} className={buttonClass("ghost", "sm")} aria-label="Mes siguiente">
                  <ChevronRight className="size-4" />
                </Link>
              </div>
            </div>
            <div className="scroll-x">
              <div className="min-w-[700px]">
                <div className="grid grid-cols-7 pb-2 text-center text-[12px] font-medium text-muted">
                  {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
                    <div key={d}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: 42 }, (_, i) => {
                    const day = addDays(gridStart, i);
                    const key = dayKey(day);
                    const inMonth = key.slice(0, 7) === monthKey;
                    const isToday = key === dayKey(now);
                    const ds = startOfDay(day);
                    const de = addDays(ds, 1);
                    const statuses = cranes.map((c) => ({
                      c,
                      s: statusOnDay(c.id, ds, events),
                      rev: events.some((e) => e.kind === "revision" && e.crane_id === c.id && dayKey(e.start) === key),
                    }));
                    const free = statuses.filter((x) => x.s === "disponible").length;
                    const busyEvents = events.filter((e) => e.kind !== "revision" && Date.parse(e.start) >= ds.getTime() && Date.parse(e.start) < de.getTime());
                    return (
                      <Link
                        key={key}
                        href={qs({ d: key })}
                        scroll={false}
                        className={cx(
                          "group flex min-h-[112px] flex-col rounded-2xl border p-2 transition",
                          inMonth ? "border-line bg-white hover:border-ink/30" : "border-transparent bg-canvas/60 opacity-60",
                          key === selected && "border-ink ring-2 ring-ink/10",
                        )}
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className={cx("tabular grid size-6 place-items-center rounded-full text-[12px] font-semibold", isToday ? "bg-rhino-500 text-white" : "text-ink")}>
                            {Number(key.slice(8))}
                          </span>
                          {busyEvents.length > 0 && <span className="text-[10px] font-medium text-muted">{busyEvents.length} inicio{busyEvents.length > 1 ? "s" : ""}</span>}
                        </div>
                        <div className="grid grid-cols-5 gap-[3px]">
                          {statuses.map(({ c, s, rev }) => (
                            <span
                              key={c.id}
                              title={`${c.code} · ${STATUS_LABELS[s]}${rev ? " · revisión" : ""}`}
                              className={cx(
                                "relative grid h-[18px] place-items-center rounded-[5px] text-[9px] font-semibold",
                                s === "disponible" ? "bg-ok-soft text-ok" : s === "rentada" ? "bg-ink text-white" : s === "mantenimiento" ? "bg-warn-mid text-ink" : "stripes-red text-white",
                              )}
                            >
                              {c.code.replace("RH-", "")}
                              {rev && <span className="absolute -top-1 -right-1 size-2 rounded-full border-[1.5px] border-rhino-500 bg-white" />}
                            </span>
                          ))}
                        </div>
                        <div className="mt-auto pt-1.5 text-[11px] text-muted">
                          <b className="text-ok">{free}</b> disponibles
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>
          <DayPanel day={selected} cranes={cranes} events={events} />
        </div>
      ) : (
        <Card>
          <CardHeader
            title={`${fmt.short(weekStart)} – ${fmt.short(addDays(weekStart, 13))}`}
            subtitle="Dos semanas · clic en cualquier barra para ver el detalle"
            action={
              <div className="flex items-center gap-1">
                <Link href={`/calendario?view=linea&w=${dayKey(addDays(weekStart, -7))}`} className={buttonClass("ghost", "sm")} aria-label="Semana anterior">
                  <ChevronLeft className="size-4" />
                </Link>
                <Link href="/calendario?view=linea" className={buttonClass("outline", "sm")}>Hoy</Link>
                <Link href={`/calendario?view=linea&w=${dayKey(addDays(weekStart, 7))}`} className={buttonClass("ghost", "sm")} aria-label="Semana siguiente">
                  <ChevronRight className="size-4" />
                </Link>
              </div>
            }
          />
          <div className="px-5 pt-3 sm:px-6">
            <TimelineLegend />
          </div>
          <div className="px-3 pt-3 pb-4 sm:px-4">
            <WeekTimeline cranes={withStatus} events={events} start={weekStart} days={14} now={now} />
          </div>
        </Card>
      )}
    </>
  );
}

function DayPanel({ day, cranes, events }: { day: string; cranes: { id: string; code: string; name: string; capacity_tons: number }[]; events: FleetEvent[] }) {
  const ds = fromDayKey(day);
  const de = addDays(ds, 1);
  const dayEvents = events.filter((e) => Date.parse(e.start) < de.getTime() && (e.open || Date.parse(e.end) > ds.getTime()));
  const code = (id: string) => cranes.find((c) => c.id === id)?.code ?? "";
  const free = cranes.filter((c) => statusOnDay(c.id, ds, events) === "disponible");
  const p = zonedParts(ds);
  return (
    <Card className="self-start xl:sticky xl:top-6">
      <CardHeader title={<span className="first-letter:uppercase">{fmt.long(ds)}</span>} subtitle={`${p.year} · ${dayEvents.length} eventos`} />
      <div className="space-y-5 p-5 sm:p-6">
        <div>
          <div className="mb-2 text-[12px] font-medium tracking-wide text-muted uppercase">Disponibles ({free.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {free.map((c) => (
              <Link key={c.id} href={`/gruas/${c.id}`}>
                <Badge tone="green">{c.code} · {c.capacity_tons} t</Badge>
              </Link>
            ))}
            {free.length === 0 && <span className="text-[13px] text-muted">Ninguna</span>}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[12px] font-medium tracking-wide text-muted uppercase">Eventos</div>
          {dayEvents.length === 0 ? (
            <Empty title="Sin eventos este día" />
          ) : (
            <ul className="space-y-2">
              {dayEvents.map((e) => (
                <li key={e.id}>
                  <Link href={e.href} className="flex items-start gap-3 rounded-xl p-2 hover:bg-canvas">
                    <span className={cx("mt-1.5 size-2.5 shrink-0 rounded-full", KIND_DOT[e.kind])} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[14px] font-medium">
                        <span>{code(e.crane_id)}</span>
                        <span className="text-[12px] font-normal text-muted">{KIND_LABEL[e.kind]}</span>
                      </div>
                      <div className="truncate text-[13px] text-ink-2">{e.title}</div>
                      <div className="text-[12px] text-muted">
                        {fmt.dateTime(e.start)} → {e.open ? "sin fecha" : fmt.dateTime(e.end)}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
