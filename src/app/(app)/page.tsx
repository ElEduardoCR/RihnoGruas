import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { AlertTriangle, ArrowUpRight, ChevronRight, CircleAlert, Info, PackageX, Plus, ShieldAlert, Wrench } from "lucide-react";
import { getDb } from "@/lib/db";
import { currentStaff } from "@/lib/auth";
import { getFleet } from "@/lib/services/fleet";
import { collectInsights } from "@/lib/agent/insights";
import { expenseSummary, latestPurchases, monthlyExpenses } from "@/lib/services/expenses";
import { inventoryWatch } from "@/lib/services/inventory";
import { listInspections } from "@/lib/services/inspections";
import { getFormOptions } from "@/lib/services/options";
import { PURCHASE_CATEGORY_LABELS, CHECKLIST_KIND_LABELS } from "@/lib/labels";
import { addDays, atLocal, daysUntil, fmt, money, startOfDay, startOfMonth, startOfWeek, toLocalInput, zonedParts } from "@/lib/time";
import { Badge, Card, CardHeader, Empty, LinkButton, PageHeader, PageSkeleton, Stat, StatusPill, cx } from "@/components/ui";
import { MonthlyColumns, HBars } from "@/components/charts";
import { TimelineLegend, WeekTimeline } from "@/components/timeline";
import { Modal } from "@/components/modal";
import { RentalForm } from "@/components/forms";
import { RhinoMark } from "@/components/brand";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

const SEV = {
  critica: { icon: ShieldAlert, cls: "text-rhino-500" },
  aviso: { icon: AlertTriangle, cls: "text-warn-mid" },
  info: { icon: Info, cls: "text-white/50" },
};

async function Dashboard() {
  await connection();
  const db = await getDb();
  const now = new Date();
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  const [me, { cranes, events }, insights, months, latest, month, inv, inspections, opts] = await Promise.all([
    currentStaff(db),
    getFleet(db, now),
    collectInsights(db, now),
    monthlyExpenses(db, now, 6),
    latestPurchases(db, 6),
    expenseSummary(db, monthStart, addDays(startOfDay(now), 1)),
    inventoryWatch(db, now),
    listInspections(db, addDays(now, -2)),
    getFormOptions(db),
  ]);

  const count = (s: string) => cranes.filter((c) => c.status === s).length;
  const stopped = cranes.filter((c) => c.status === "detenida");
  const hour = zonedParts(now).hour;
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const upcomingReviews = inspections
    .filter((i) => i.status === "programada" || i.status === "en_progreso" || i.status === "vencida")
    .sort((a, b) => Date.parse(a.scheduled_for) - Date.parse(b.scheduled_for))
    .slice(0, 5);
  const prevMonth = months[months.length - 2]?.total ?? 0;
  const thisMonth = months[months.length - 1]?.total ?? 0;
  const dayOfMonth = zonedParts(now).day;

  // Utilización de la semana: horas rentadas / horas disponibles
  const weekEnd = addDays(weekStart, 7);
  const rentedMs = events
    .filter((e) => e.kind === "renta" && e.status !== "cotizada")
    .reduce((s, e) => s + Math.max(0, Math.min(Date.parse(e.end), weekEnd.getTime()) - Math.max(Date.parse(e.start), weekStart.getTime())), 0);
  const utilization = rentedMs / (cranes.length * 7 * 86_400_000);

  return (
    <>
      <PageHeader
        eyebrow={<span className="inline-block first-letter:uppercase">{fmt.long(now)}</span>}
        title={`${greeting}${me ? `, ${me.full_name.split(" ")[0]}` : ""}.`}
        subtitle="Esto es lo que pasa hoy en la flotilla. Rhino lo vigila y te avisa por WhatsApp."
        actions={
          <>
            <LinkButton href="/agente" variant="outline">Hablar con Rhino</LinkButton>
            <Modal label="Nueva renta" title="Nueva renta" subtitle="Rhino valida disponibilidad, documentos y operador, y agenda la revisión total." icon={<Plus className="size-4" />}>
              <RentalForm cranes={opts.cranes} clients={opts.clients} operators={opts.operators} defaults={{ start: toLocalInput(atLocal(now, 1, 7)), end: toLocalInput(atLocal(now, 2, 18)) }} />
            </Modal>
          </>
        }
      />

      {/* Rhino informa */}
      <Card className="mb-6 overflow-hidden bg-night text-white" as="div">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[260px_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <RhinoMark className="size-10" />
              <div>
                <div className="text-[17px] font-semibold">Rhino te informa</div>
                <div className="text-[13px] text-white/50">{insights.filter((i) => i.severity !== "info").length} asuntos requieren atención</div>
              </div>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-white/60">
              Esto mismo llega por WhatsApp a cada responsable, sin que tenga que entrar al sistema.
            </p>
          </div>
          <ul className="divide-y divide-white/[0.08]">
            {insights.slice(0, 5).map((i) => {
              const S = SEV[i.severity];
              return (
                <li key={i.key}>
                  <Link href={i.href} className="group flex items-start gap-3 py-3 first:pt-0">
                    <S.icon className={cx("mt-0.5 size-[18px] shrink-0", S.cls)} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium">{i.title}</div>
                      <div className="line-clamp-2 text-[13px] text-white/55">{i.body}</div>
                    </div>
                    <ChevronRight className="mt-0.5 size-4 shrink-0 text-white/30 transition group-hover:translate-x-0.5 group-hover:text-white" />
                  </Link>
                </li>
              );
            })}
            {insights.length === 0 && <li className="py-3 text-[14px] text-white/60">Todo en orden. Nada urgente por ahora.</li>}
          </ul>
        </div>
      </Card>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Stat label="Rentadas" value={count("rentada")} hint={`de ${cranes.length} grúas`} tone="dark" />
        <Stat label="Disponibles" value={count("disponible")} hint="listas para salir" tone="green" icon={<span className="size-2 rounded-full bg-ok" />} />
        <Stat label="Mantenimiento" value={count("mantenimiento")} hint="en taller" tone="amber" icon={<Wrench className="size-4" />} />
        <Stat label="Detenidas" value={count("detenida")} hint={stopped.length ? stopped.map((s) => s.code).join(", ") : "ninguna"} tone="red" icon={<CircleAlert className="size-4" />} />
        <Stat label="Utilización semana" value={`${Math.round(utilization * 100)}%`} hint="horas rentadas / disponibles" />
      </div>

      {/* Semana */}
      <Card className="mb-6">
        <CardHeader
          title="Programado esta semana"
          subtitle={`${fmt.short(weekStart)} – ${fmt.short(addDays(weekStart, 6))}`}
          action={<LinkButton href="/calendario" size="sm" variant="ghost">Calendario <ArrowUpRight className="size-3.5" /></LinkButton>}
        />
        <div className="px-5 pt-4 sm:px-6">
          <TimelineLegend />
        </div>
        <div className="px-3 pt-3 pb-4 sm:px-4">
          <WeekTimeline cranes={cranes} events={events} start={weekStart} now={now} compact />
        </div>
      </Card>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        {/* Gasto */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Gasto mensual"
            subtitle={`Compras registradas · ${fmt.month(now)} lleva ${money(thisMonth)} en ${dayOfMonth} días (mes anterior ${money(prevMonth)})`}
          />
          <div className="grid gap-8 p-5 sm:p-6 md:grid-cols-[1.4fr_1fr]">
            <MonthlyColumns
              data={months.map((m) => ({
                key: m.key,
                label: m.label,
                total: m.total,
                breakdown: Object.entries(m.byCategory)
                  .filter(([, v]) => v > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => ({ label: PURCHASE_CATEGORY_LABELS[k as keyof typeof PURCHASE_CATEGORY_LABELS], value: v })),
              }))}
            />
            <div>
              <div className="mb-3 text-[13px] font-medium text-muted">Este mes por categoría</div>
              {month.byCategory.length ? (
                <HBars rows={month.byCategory.slice(0, 6).map((c) => ({ label: PURCHASE_CATEGORY_LABELS[c.category], value: c.amount }))} accentFirst />
              ) : (
                <Empty title="Sin compras este mes" />
              )}
            </div>
          </div>
        </Card>

        {/* Detenidas */}
        <Card>
          <CardHeader title="Grúas detenidas" subtitle="Cada día detenida deja de facturar" />
          <div className="p-5 sm:p-6">
            {stopped.length === 0 ? (
              <Empty title="Ninguna grúa detenida" />
            ) : (
              <ul className="space-y-3">
                {stopped.map((c) => {
                  const days = c.current ? -daysUntil(c.current.start, now) : 0;
                  return (
                    <li key={c.id}>
                      <Link href={`/gruas/${c.id}`} className="block rounded-2xl border border-rhino-100 bg-rhino-50/60 p-4 transition hover:border-rhino-200">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{c.code} · {c.name}</span>
                          <StatusPill status="detenida" />
                        </div>
                        <div className="mt-1.5 text-[13px] text-ink-2">{c.current?.title}</div>
                        <div className="mt-3 flex items-center gap-4 text-[12px] text-muted">
                          <span><b className="text-ink">{days}</b> días</span>
                          <span><b className="text-ink">{money(days * (c.daily_rate ?? 0))}</b> sin facturar</span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-6 mb-3 text-[13px] font-medium text-muted">Gasto del mes por grúa</div>
            {month.byCrane.length ? (
              <HBars rows={month.byCrane.slice(0, 5).map((c) => ({ label: c.crane.code, sub: c.crane.name, value: c.amount }))} />
            ) : (
              <p className="text-[13px] text-muted">Sin gastos asignados a grúas este mes.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Últimas compras" action={<LinkButton href="/inventario?tab=compras" size="sm" variant="ghost">Ver todas</LinkButton>} />
          <div className="scroll-x px-2 pb-3 sm:px-3">
            <table className="w-full min-w-[560px] text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-muted">
                  <th className="px-3 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 font-medium">Concepto</th>
                  <th className="px-3 py-3 font-medium">Categoría</th>
                  <th className="px-3 py-3 font-medium">Grúa</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {latest.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-3 py-3 whitespace-nowrap text-muted">{fmt.short(p.purchased_on)}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{p.description}</div>
                      <div className="text-[12px] text-muted">{p.supplier}{p.channel === "whatsapp" && " · vía WhatsApp"}</div>
                    </td>
                    <td className="px-3 py-3"><Badge>{PURCHASE_CATEGORY_LABELS[p.category]}</Badge></td>
                    <td className="px-3 py-3 text-muted">{p.crane?.code ?? "General"}</td>
                    <td className="tabular px-3 py-3 text-right font-semibold">{money(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Próximas revisiones" subtitle="Agendadas por Rhino antes de cada renta" action={<LinkButton href="/checklists" size="sm" variant="ghost">Todas</LinkButton>} />
            <ul className="px-3 pt-2 pb-3">
              {upcomingReviews.map((i) => (
                <li key={i.id}>
                  <Link href={`/checklists/${i.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-canvas">
                    <div className={cx("grid size-10 shrink-0 place-items-center rounded-xl text-[12px] font-semibold", i.status === "vencida" ? "bg-rhino-500 text-white" : "bg-canvas text-ink")}>
                      {i.crane.code.replace("RH-", "")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">{CHECKLIST_KIND_LABELS[i.kind]} · {i.crane.code}</div>
                      <div className="text-[12px] text-muted">{fmt.dateTime(i.scheduled_for)} · {i.assignee?.full_name ?? "sin asignar"}</div>
                    </div>
                    {i.status === "vencida" ? <Badge tone="red">Vencida</Badge> : i.status === "en_progreso" ? <Badge tone="amber">En curso</Badge> : null}
                  </Link>
                </li>
              ))}
              {upcomingReviews.length === 0 && <Empty title="Sin revisiones pendientes" />}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Almacén" subtitle="Control antirrobo" action={<LinkButton href="/inventario?tab=alertas" size="sm" variant="ghost">Revisar</LinkButton>} />
            <div className="grid grid-cols-3 gap-2 p-5 pt-4 text-center">
              <div className="rounded-2xl bg-canvas p-3">
                <div className="text-[22px] font-semibold">{inv.pending.length}</div>
                <div className="text-[11px] leading-tight text-muted">por autorizar</div>
              </div>
              <div className="rounded-2xl bg-rhino-50 p-3">
                <div className="text-[22px] font-semibold text-rhino-600">{inv.flagged.length}</div>
                <div className="text-[11px] leading-tight text-muted">movimientos atípicos</div>
              </div>
              <div className="rounded-2xl bg-canvas p-3">
                <div className="text-[22px] font-semibold">{inv.lowStock.length}</div>
                <div className="text-[11px] leading-tight text-muted">bajo mínimo</div>
              </div>
            </div>
            <ul className="px-5 pb-5 text-[13px]">
              {inv.lowStock.slice(0, 4).map((s) => (
                <li key={s.id} className="flex items-center justify-between border-t border-line py-2">
                  <span className="flex items-center gap-2"><PackageX className="size-3.5 text-muted" />{s.name}</span>
                  <span className="tabular font-medium">{s.stock} / {s.min_stock} {s.unit}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
