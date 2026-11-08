import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { CalendarCheck2, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { getDb } from "@/lib/db";
import { getEvents } from "@/lib/services/fleet";
import { getFormOptions } from "@/lib/services/options";
import { statusOnDay, type FleetEvent } from "@/lib/domain/fleet";
import { resolveCalendarRange } from "@/lib/calendar";
import { addDays, addMonths, atLocal, dayKey, fmt, fromDayKey, toLocalInput } from "@/lib/time";
import { Badge, Card, CardHeader, PageHeader, PageSkeleton, Tabs, buttonClass, cx } from "@/components/ui";
import { CalendarAvailability, type CalendarUnit } from "@/components/calendar-availability";
import { TimelineLegend, WeekTimeline } from "@/components/timeline";
import { Modal } from "@/components/modal";
import { RentalForm } from "@/components/forms";

export const metadata = { title: "Calendario" };
type SP = Promise<{ view?: string; m?: string; w?: string; d?: string }>;

export default function CalendarPage({ searchParams }: { searchParams: SP }) {
  return <Suspense fallback={<PageSkeleton rows={2} />}><Calendar searchParams={searchParams} /></Suspense>;
}

const KIND_LABEL: Record<FleetEvent["kind"], string> = { renta: "Renta", mantenimiento: "Mantenimiento", detencion: "Detención", revision: "Revisión" };
const KIND_PLURAL: Record<FleetEvent["kind"], string> = { renta: "rentas", mantenimiento: "mantenimientos", detencion: "detenciones", revision: "revisiones" };
const KIND_DOT: Record<FleetEvent["kind"], string> = { renta: "bg-ink", mantenimiento: "bg-warn", detencion: "bg-rhino-500", revision: "border-2 border-rhino-500 bg-white" };
const KINDS: FleetEvent["kind"][] = ["detencion", "renta", "mantenimiento", "revision"];

function eventsOnDay(events: FleetEvent[], day: Date) {
  const start = day.getTime();
  const end = addDays(day, 1).getTime();
  return events.filter((event) => Date.parse(event.start) < end && (event.open || Date.parse(event.end) > start));
}

async function Calendar({ searchParams }: { searchParams: SP }) {
  await connection();
  const sp = await searchParams;
  const db = await getDb();
  const now = new Date();
  const { view, monthStart, monthKey, selected, weekStart, gridStart, rangeStart, rangeEnd } = resolveCalendarRange(sp, now);
  const [cranes, events, opts] = await Promise.all([
    db.select("cranes", { eq: { active: true }, order: { column: "code" } }),
    getEvents(db, addDays(rangeStart, -1), addDays(rangeEnd, 1), now),
    getFormOptions(db),
  ]);
  const qs = (values: Record<string, string>) => `/calendario?${new URLSearchParams(values).toString()}`;
  const monthHref = (offset: number) => {
    const date = dayKey(addMonths(monthStart, offset));
    return qs({ view: "mes", m: date.slice(0, 7), d: date });
  };
  const dayData = Array.from({ length: view === "mes" ? 42 : 0 }, (_, i) => {
    const date = addDays(gridStart, i);
    return {
      date,
      key: dayKey(date),
      free: cranes.filter((crane) => statusOnDay(crane.id, date, events) === "disponible").length,
      events: eventsOnDay(events, date),
    };
  });

  return <>
    <PageHeader title="Calendario" subtitle="La actividad de tu flotilla, día a día. Selecciona una fecha para ver el detalle." actions={opts.cranes.length > 0 && (
      <Modal label="Nueva renta" title="Nueva renta" subtitle="Rhino agenda automáticamente la revisión total del día anterior." icon={<Plus className="size-4" />}>
        <RentalForm cranes={opts.cranes} clients={opts.clients} operators={opts.operators} defaults={{ start: toLocalInput(atLocal(now, 1, 7)), end: toLocalInput(atLocal(now, 2, 18)) }} />
      </Modal>
    )} />
    <div className="flex flex-wrap items-center justify-between gap-x-4">
      <Tabs active={view} tabs={[
        { key: "mes", label: "Vista mensual", href: qs({ view: "mes", m: selected.slice(0, 7), d: selected }) },
        { key: "linea", label: "Línea de tiempo", href: qs({ view: "linea", w: selected, d: selected }) },
      ]} />
      {view === "mes" && <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted" aria-label="Tipos de evento">
        {(["renta", "mantenimiento", "detencion", "revision"] as const).map((kind) => <span key={kind} className="inline-flex items-center gap-1.5"><span className={cx("size-2 shrink-0 rounded-full", KIND_DOT[kind])} aria-hidden />{KIND_LABEL[kind]}</span>)}
      </div>}
    </div>

    {view === "mes" ? <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div>
            <h2 className="text-[19px] font-semibold first-letter:uppercase sm:text-[22px]">{fmt.month(monthStart)}</h2>
            <p className="mt-1 text-[12px] text-muted">{cranes.length} unidades en la flotilla</p>
          </div>
          <div className="flex items-center gap-1">
            <Link href={monthHref(-1)} className={cx(buttonClass("ghost", "sm"), "size-11 p-0")} aria-label="Mes anterior"><ChevronLeft className="size-4" /></Link>
            <Link href="/calendario?view=mes" className={cx(buttonClass("outline", "sm"), "h-10")}>Hoy</Link>
            <Link href={monthHref(1)} className={cx(buttonClass("ghost", "sm"), "size-11 p-0")} aria-label="Mes siguiente"><ChevronRight className="size-4" /></Link>
          </div>
        </div>
        <div className="grid grid-cols-7 border-y border-line bg-canvas/50 py-2.5 text-center text-[11px] font-medium text-muted sm:text-[12px]">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => <div key={day}>{day}</div>)}
        </div>
        <div className="grid grid-cols-7" aria-label={`Calendario de ${fmt.month(monthStart)}`}>
          {dayData.map(({ date, key, free, events: dailyEvents }, index) => {
            const inMonth = key.slice(0, 7) === monthKey;
            const chosen = key === selected;
            const today = key === dayKey(now);
            const groups = KINDS.map((kind) => ({ kind, count: dailyEvents.filter((event) => event.kind === kind).length })).filter((group) => group.count > 0);
            const hiddenEvents = groups.slice(2).reduce((sum, group) => sum + group.count, 0);
            return <Link key={key} href={qs({ view: "mes", m: monthKey, d: key })} scroll={false} aria-current={chosen ? "date" : undefined}
              aria-label={`${fmt.long(date)}. ${free} de ${cranes.length} unidades libres en agenda. ${dailyEvents.length} eventos.${groups.map(({ kind, count }) => ` ${count} ${KIND_PLURAL[kind]}.`).join("")}${chosen ? " Día seleccionado." : " Ver detalle."}`}
              className={cx("relative flex min-h-[84px] min-w-0 flex-col gap-1 border-b border-line px-1.5 py-2 transition-colors hover:bg-canvas sm:min-h-[100px] sm:px-2.5", index % 7 !== 6 && "border-r", !inMonth && "bg-canvas/60", chosen && "z-10 bg-rhino-50/70 shadow-[inset_0_0_0_1.5px_var(--color-rhino-500)] hover:bg-rhino-50")}
            >
              <span className={cx("tabular grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-medium", today ? "bg-rhino-500 text-white" : chosen ? "font-semibold text-rhino-700" : inMonth ? "text-ink" : "text-muted")}>{Number(key.slice(8))}</span>
              {(inMonth || chosen) && <>
                <div className="hidden min-w-0 space-y-0.5 sm:block">
                  {groups.slice(0, 2).map(({ kind, count }) => <span key={kind} className="flex min-w-0 items-center gap-1.5 text-[10px] leading-[17px] text-ink-2"><span className={cx("size-1.5 shrink-0 rounded-full", KIND_DOT[kind])} aria-hidden /><span className="truncate">{count} {count === 1 ? KIND_LABEL[kind].toLowerCase() : KIND_PLURAL[kind]}</span></span>)}
                  {hiddenEvents > 0 && <span className="block text-[10px] text-muted">+{hiddenEvents} más</span>}
                </div>
                {dailyEvents.length > 0 && <span className="truncate text-[10px] text-ink-2 sm:hidden">{dailyEvents.length} evt.</span>}
                <span className={cx("mt-auto flex items-baseline gap-1 text-[10px] sm:text-[11px]", free > 0 ? "text-[#246b45]" : "text-muted")}><span className="tabular font-semibold">{free}</span><span className="hidden min-[380px]:inline">libres</span></span>
              </>}
            </Link>;
          })}
        </div>
        <div className="flex items-start gap-2 px-4 py-3.5 text-[11px] leading-5 text-muted sm:px-6"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#246b45]" aria-hidden /><span>El número verde indica unidades libres en agenda. Abre un día para consultar cuáles.</span></div>
      </Card>
      <DayPanel key={selected} day={selected} cranes={cranes} events={events} />
    </div> : <Card>
      <CardHeader title={`${fmt.short(weekStart)} – ${fmt.short(addDays(weekStart, 13))}`} subtitle="Dos semanas · selecciona una barra para ver el detalle" action={<div className="flex items-center gap-1">
        <Link href={qs({ view: "linea", w: dayKey(addDays(weekStart, -7)), d: dayKey(addDays(weekStart, -7)) })} className={cx(buttonClass("ghost", "sm"), "size-11 p-0")} aria-label="Semana anterior"><ChevronLeft className="size-4" /></Link>
        <Link href="/calendario?view=linea" className={buttonClass("outline", "sm")}>Hoy</Link>
        <Link href={qs({ view: "linea", w: dayKey(addDays(weekStart, 7)), d: dayKey(addDays(weekStart, 7)) })} className={cx(buttonClass("ghost", "sm"), "size-11 p-0")} aria-label="Semana siguiente"><ChevronRight className="size-4" /></Link>
      </div>} />
      <div className="px-5 pt-3 sm:px-6"><TimelineLegend /></div>
      <div className="px-3 pt-3 pb-4 sm:px-4"><WeekTimeline cranes={cranes} events={events} start={weekStart} days={14} now={now} /></div>
    </Card>}
  </>;
}

function DayPanel({ day, cranes, events }: { day: string; cranes: CalendarUnit[]; events: FleetEvent[] }) {
  const date = fromDayKey(day);
  const dailyEvents = eventsOnDay(events, date);
  const free = cranes.filter((crane) => statusOnDay(crane.id, date, events) === "disponible");
  const occupied = cranes.length - free.length;
  return <Card className="self-start xl:sticky xl:top-6" id="calendar-day-detail">
    <div className="border-b border-line px-5 py-5">
      <p className="mb-1.5 text-[11px] font-medium tracking-[0.08em] text-muted uppercase">Día seleccionado</p>
      <h2 className="text-[18px] font-semibold first-letter:uppercase">{fmt.long(date)}</h2>
      <p className="mt-1 text-[12px] text-muted">{dailyEvents.length} {dailyEvents.length === 1 ? "evento" : "eventos"} · {day.slice(0, 4)}</p>
    </div>
    <div className="space-y-5 p-5">
      <div>
        <h3 className="mb-3 text-[13px] font-semibold">Actividad del día</h3>
        {dailyEvents.length === 0 ? <div className="rounded-2xl bg-canvas/70 px-4 py-5">
          <CalendarCheck2 className="mb-3 size-5 text-muted" strokeWidth={1.5} aria-hidden />
          <p className="text-[13px] font-medium">Sin eventos programados</p>
          <p className="mt-1 text-[12px] leading-5 text-muted">Consulta abajo las unidades libres para esta fecha.</p>
        </div> : <ul className="max-h-[360px] space-y-1 overflow-y-auto overscroll-contain">
          {dailyEvents.map((event) => <li key={event.id}><Link href={event.href} className="flex items-start gap-2.5 rounded-xl px-2 py-3 hover:bg-canvas">
            <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", KIND_DOT[event.kind])} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="text-[13px] font-semibold">{cranes.find((crane) => crane.id === event.crane_id)?.code}</span><span className="text-[11px] text-muted">{KIND_LABEL[event.kind]}</span>{event.status === "cotizada" && <Badge tone="outline">Cotizada</Badge>}</div>
              <p className="mt-0.5 text-[12px] leading-5 text-ink-2">{event.title}</p>
              <p className="mt-1 text-[11px] leading-4 text-muted">{fmt.dateTime(event.start)}<br />{event.open ? "Sin fecha de liberación" : `Hasta ${fmt.dateTime(event.end)}`}</p>
            </div>
          </Link></li>)}
        </ul>}
      </div>
      <div className="border-t border-line pt-5">
        <div className="mb-3 flex items-end justify-between gap-2"><div><p className="text-[13px] font-medium">Libres en agenda</p><p className="mt-1 text-[11px] text-muted">Sin renta, taller ni detención</p></div><div className="text-[28px] leading-none font-semibold tracking-tight text-[#246b45]">{free.length}<span className="ml-1 text-[13px] font-normal text-muted">/ {cranes.length}</span></div></div>
        {cranes.length > 0 && <div className="mb-3 flex h-1.5 overflow-hidden rounded-full bg-line" aria-hidden><span className="bg-[#246b45]/65" style={{ width: `${free.length / cranes.length * 100}%` }} /></div>}
        <p className="mb-4 text-[11px] text-muted">{occupied} {occupied === 1 ? "unidad con ocupación" : "unidades con ocupación"}</p>
        <CalendarAvailability units={free.map(({ id, code, name, type, capacity_tons }) => ({ id, code, name, type, capacity_tons }))} />
        <p className="mt-3 text-[11px] leading-5 text-muted">La renta también requiere documentos y operador vigentes.</p>
      </div>
    </div>
  </Card>;
}
