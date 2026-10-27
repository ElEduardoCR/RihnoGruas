import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CalendarPlus, ChevronLeft, ClipboardCheck, FileText, OctagonAlert, Pencil, Phone, Play, ShieldCheck, UserPlus, Wrench } from "lucide-react";
import { getDb } from "@/lib/db";
import { getCraneDossier } from "@/lib/services/fleet";
import { getFormOptions } from "@/lib/services/options";
import { docStatus } from "@/lib/domain/fleet";
import { CHECKLIST_KIND_LABELS, CRANE_TYPE_LONG, DOC_LABELS, DOWNTIME_LABELS, PURCHASE_CATEGORY_LABELS, flagText, qtyUnit } from "@/lib/labels";
import { atLocal, daysUntil, fmt, money, num, toLocalInput } from "@/lib/time";
import { Badge, Card, CardHeader, DocHealthBadge, Empty, KeyValue, PageSkeleton, Progress, StatusPill, buttonClass, cx } from "@/components/ui";
import { FleetPhoto, FleetResearchPanel } from "@/components/fleet-profile";
import { Modal } from "@/components/modal";
import { CompleteMaintenanceForm, DocumentForm, DowntimeForm, InspectionForm, MaintenanceForm, RentalForm, RepeatMaintenanceChecklistForm } from "@/components/forms";
import { releaseCraneAction } from "@/app/actions";
import { revokeOperatorAction } from "@/app/catalog-actions";
import { ApproveOperatorForm, CraneForm, RevokeButton } from "@/components/catalog-forms";
import { currentStaff } from "@/lib/auth";
import { MANAGER_ROLES } from "@/lib/services/catalogs";

export const metadata = { title: "Expediente de unidad" };

export default function CranePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Dossier params={params} />
    </Suspense>
  );
}

const SECTIONS = [
  ["ficha", "Ficha técnica"],
  ["documentos", "Documentos"],
  ["operadores", "Operadores"],
  ["agenda", "Agenda"],
  ["revisiones", "Revisiones"],
  ["mantenimiento", "Mantenimiento"],
  ["consumo", "Consumo"],
  ["gastos", "Gastos"],
];

async function Dossier({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = await getDb();
  const now = new Date();
  const d = await getCraneDossier(db, id, now);
  if (!d) notFound();
  const [opts, me, allStaff] = await Promise.all([getFormOptions(db), currentStaff(db), db.select("staff", { eq: { role: "operador", active: true }, order: { column: "full_name" } })]);
  const canEdit = Boolean(me && MANAGER_ROLES.includes(me.role));
  const canStart = Boolean(me?.active && ["direccion", "administracion", "mecanico", "operador"].includes(me.role));
  const approvable = allStaff.filter((s) => !d.operators.some((o) => o.staff_id === s.id)).map((s) => ({ id: s.id, label: s.full_name }));
  const { crane: c } = d;
  const sections = c.fleet_profile ? [["investigacion", "Investigación"], ["planes", "Planes de mantenimiento"], ...SECTIONS] : SECTIONS;
  const maintenanceDefaults = { start: toLocalInput(atLocal(now, 1, 8)), end: toLocalInput(atLocal(now, 1, 18)) };
  const openDowntime = d.downtimes.find((x) => !x.ended_at);
  const t = now.getTime();
  const upcoming = d.events.filter((e) => Date.parse(e.end) > t || e.open).slice(0, 10);
  const past = d.rentals.filter((r) => Date.parse(r.end_at) <= t && r.status !== "cancelada").slice(0, 6);
  const consumption = d.movements.filter((m) => m.kind === "salida");
  const spent = d.purchases.reduce((s, p) => s + p.total, 0) + d.maintenance.reduce((s, m) => s + m.cost, 0);
  const rentedDays = d.rentals.filter((r) => r.status !== "cancelada" && r.status !== "cotizada").reduce((s, r) => s + (Date.parse(r.end_at) - Date.parse(r.start_at)) / 86_400_000, 0);

  return (
    <>
      <Link href="/gruas" className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Flota y equipos
      </Link>

      {/* Encabezado */}
      <Card className="mb-6 overflow-hidden" as="div">
        <div className="grid lg:grid-cols-[1fr_420px]">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="dark">{c.code}</Badge>
              <StatusPill status={d.status} />
              <Badge tone="outline">{CRANE_TYPE_LONG[c.type]}</Badge>
              {c.fleet_profile && <Badge tone="amber">Identificación pendiente</Badge>}
              {d.documents.length === 0 && <Badge tone="neutral">Sin documentos</Badge>}
            </div>
            <h1 className="mt-4 text-[34px] leading-tight font-semibold sm:text-[44px]">{c.name}</h1>
            <p className="mt-1 text-[15px] text-muted">
              {c.brand} {c.model} · {c.year ?? "Año por confirmar"} · {c.base_location ?? "Base por confirmar"}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["Capacidad verificada", c.capacity_tons == null ? "—" : `${num(c.capacity_tons)} t`],
                ["Pluma verificada", c.boom_length_m == null ? "—" : `${num(c.boom_length_m)} m`],
                ["Horómetro", c.hour_meter == null ? "—" : `${num(c.hour_meter)} h`],
                ["Tarifa base", c.daily_rate == null ? "—" : `${money(c.daily_rate)}/día`],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="text-[12px] text-muted">{k}</div>
                  <div className="tabular text-[20px] font-semibold">{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 max-w-md">
              {d.service.known ? (
                <>
                  <div className="mb-1.5 flex justify-between text-[12px]">
                    <span className="text-muted">Uso desde el último servicio</span>
                    <span className="font-medium">{Math.round(d.service.used)} de {c.service_interval_hours} h</span>
                  </div>
                  <Progress value={d.service.pct} tone={d.service.pct >= 1 ? "red" : d.service.pct >= 0.85 ? "amber" : "dark"} />
                </>
              ) : (
                <p className="rounded-2xl bg-canvas px-4 py-3 text-[13px] text-muted">Servicio · Pendiente de lecturas y manual</p>
              )}
            </div>
            <div className="mt-7 flex flex-wrap gap-2">
              {canStart && <Link href={`/checklists/iniciar?unidad=${c.id}`} className={buttonClass("primary")}><Play className="size-4" />Iniciar revisión</Link>}
              <Modal label="Rentar" title={`Rentar ${c.code}`} icon={<CalendarPlus className="size-4" />} variant="outline">
                <RentalForm cranes={opts.cranes} clients={opts.clients} operators={opts.operators} craneId={c.id} defaults={{ start: toLocalInput(atLocal(now, 1, 7)), end: toLocalInput(atLocal(now, 2, 18)) }} />
              </Modal>
              <Modal label="Programar revisión" title={`Revisión de ${c.code}`} subtitle="Se personaliza con el historial de la grúa y se envía el enlace por WhatsApp." icon={<ClipboardCheck className="size-4" />} variant="outline">
                <InspectionForm craneId={c.id} staff={opts.staff} defaultWhen={toLocalInput(atLocal(now, 1, 9))} />
              </Modal>
              {canEdit && (
                <Modal label="Editar datos" title={`Editar ${c.code}`} icon={<Pencil className="size-4" />} variant="ghost" wide>
                  <CraneForm crane={c} />
                </Modal>
              )}
              <Modal label="Mantenimiento" title={`Mantenimiento de ${c.code}`} icon={<Wrench className="size-4" />} variant="outline">
                <MaintenanceForm craneId={c.id} mechanics={opts.mechanics} defaults={maintenanceDefaults} />
              </Modal>
              {openDowntime ? (
                <form action={releaseCraneAction.bind(null, c.id)}>
                  <button className={buttonClass("dark")}>
                    <ShieldCheck className="size-4" /> Liberar grúa
                  </button>
                </form>
              ) : (
                <Modal label="Reportar detención" title={`Detener ${c.code}`} subtitle="Se notifica a Dirección y se detectan rentas afectadas." icon={<OctagonAlert className="size-4" />} variant="danger-ghost">
                  <DowntimeForm craneId={c.id} />
                </Modal>
              )}
            </div>
          </div>
          <div className={cx("relative flex items-end p-8", d.status === "rentada" ? "bg-night" : "bg-gradient-to-br from-canvas to-white")}>
            <FleetPhoto profile={c.fleet_profile} type={c.type} tone={d.status === "rentada" ? "dark" : "light"} />
          </div>
        </div>
        {c.fleet_profile && (
          <div className="border-t border-line bg-canvas/60 px-6 py-4 text-[13px] leading-relaxed text-muted sm:px-8">
            <span className="font-medium text-ink">Disponible describe la agenda.</span> La identificación, la capacidad aplicable y los documentos deben verificarse antes de asignar esta unidad a un trabajo. Los datos reportados por Sergio están en la ficha de investigación.
          </div>
        )}
        {openDowntime && (
          <div id="estado" className="flex flex-wrap items-center gap-3 border-t border-rhino-100 bg-rhino-50 px-6 py-4 text-[14px] sm:px-8">
            <OctagonAlert className="size-5 text-rhino-600" />
            <span className="font-semibold text-rhino-700">Detenida desde {fmt.dateTime(openDowntime.started_at)}</span>
            <span className="text-ink-2">
              {DOWNTIME_LABELS[openDowntime.category]} · {openDowntime.reason}
            </span>
            {openDowntime.inspection_id && (
              <Link href={`/checklists/${openDowntime.inspection_id}`} className="font-medium text-rhino-600 underline-offset-2 hover:underline">
                Ver revisión que la detuvo
              </Link>
            )}
          </div>
        )}
      </Card>

      <nav className="scroll-x sticky top-14 z-20 -mx-4 mb-6 border-b border-black/5 bg-canvas/85 px-4 py-2 backdrop-blur-xl lg:top-0">
        <div className="flex gap-1">
          {sections.map(([k, label]) => (
            <a key={k} href={`#${k}`} className="rounded-full px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-muted hover:bg-black/5 hover:text-ink">
              {label}
            </a>
          ))}
        </div>
      </nav>

      {c.fleet_profile && (
        <div className="mb-6">
          <FleetResearchPanel profile={c.fleet_profile} craneId={c.id} mechanics={opts.mechanics} defaults={maintenanceDefaults} canEdit={Boolean(me?.active && ["direccion", "administracion", "mecanico"].includes(me.role))} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card id="ficha" className="scroll-mt-20">
          <CardHeader title="Ficha técnica" />
          <dl className="px-5 pt-2 pb-4 sm:px-6">
            <KeyValue label="Marca / modelo">{c.brand} {c.model}</KeyValue>
            <KeyValue label="Año">{c.year}</KeyValue>
            <KeyValue label="No. de serie" mono>{c.serial_number}</KeyValue>
            <KeyValue label="VIN" mono>{c.vin}</KeyValue>
            <KeyValue label="Placas" mono>{c.plates}</KeyValue>
            <KeyValue label="Capacidad verificada">{c.capacity_tons == null ? null : `${num(c.capacity_tons)} t`}</KeyValue>
            <KeyValue label="Longitud de pluma">{c.boom_length_m == null ? null : `${num(c.boom_length_m)} m`}</KeyValue>
            <KeyValue label="Horómetro">{c.hour_meter == null ? null : `${num(c.hour_meter)} h`}</KeyValue>
            <KeyValue label="Odómetro">{c.odometer_km == null ? null : `${num(c.odometer_km)} km`}</KeyValue>
            <KeyValue label="Intervalo de servicio">{c.service_interval_hours == null ? null : `${num(c.service_interval_hours)} h`}</KeyValue>
            <KeyValue label="Último servicio a las">{c.last_service_hours == null ? null : `${num(c.last_service_hours)} h`}</KeyValue>
            <KeyValue label="Adquirida">{c.acquired_on ? fmt.date(c.acquired_on) : null}</KeyValue>
            <KeyValue label="Días rentada (registrados)">{d.rentals.length === 0 ? "Sin rentas registradas" : num(rentedDays, 0)}</KeyValue>
          </dl>
          {c.notes && <p className="mx-5 mb-5 rounded-2xl bg-canvas p-4 text-[13px] text-ink-2 sm:mx-6">{c.notes}</p>}
        </Card>

        <Card id="documentos" className="scroll-mt-20 xl:col-span-2">
          <CardHeader
            title="Documentos"
            subtitle="Vigencias vigiladas por Rhino: avisa a 30, 15 y 7 días y bloquea rentas con documentos vencidos."
            action={
              <Modal label="Agregar" title={`Nuevo documento · ${c.code}`} size="sm" variant="outline">
                <DocumentForm craneId={c.id} />
              </Modal>
            }
          />
          <div className="scroll-x px-2 pb-3 sm:px-3">
            <table className="w-full min-w-[620px] text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-muted">
                  <th className="px-3 py-3 font-medium">Documento</th>
                  <th className="px-3 py-3 font-medium">Número / emisor</th>
                  <th className="px-3 py-3 font-medium">Vigencia</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium">Archivo</th>
                </tr>
              </thead>
              <tbody>
                {d.documents.map((doc) => {
                  const s = docStatus(doc, now);
                  return (
                    <tr key={doc.id} className="border-t border-line align-top">
                      <td className="px-3 py-3">
                        <div className="font-medium">{DOC_LABELS[doc.doc_type]}</div>
                        <div className="text-[12px] text-muted">{doc.title}</div>
                        {doc.coverage && <div className="mt-0.5 text-[12px] text-muted">{doc.coverage}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-mono text-[13px]">{doc.number ?? "—"}</div>
                        <div className="text-[12px] text-muted">{doc.issuer}</div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-[13px]">
                        {doc.expires_on ? (
                          <>
                            {doc.issued_on && <span className="text-muted">{fmt.short(doc.issued_on)} → </span>}
                            <b className="font-medium">{fmt.date(doc.expires_on)}</b>
                          </>
                        ) : (
                          <span className="text-muted">Permanente</span>
                        )}
                      </td>
                      <td className="px-3 py-3">{doc.expires_on ? <DocHealthBadge health={s.health} days={s.days} /> : <Badge>N/A</Badge>}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {doc.file_path ? (
                            <a href={`/api/files/documentos/${doc.file_path}`} target="_blank" className="inline-flex items-center gap-1 text-[13px] font-medium text-rhino-600">
                              <FileText className="size-3.5" /> Ver
                            </a>
                          ) : (
                            <span className="text-[12px] whitespace-nowrap text-faint">Sin archivo</span>
                          )}
                          <Modal label={doc.expires_on ? "Renovar" : "Subir"} title={`${DOC_LABELS[doc.doc_type]} · ${c.code}`} size="sm" variant="ghost">
                            <DocumentForm craneId={c.id} doc={{ id: doc.id, label: doc.title, number: doc.number, issuer: doc.issuer, coverage: doc.coverage }} />
                          </Modal>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card id="operadores" className="scroll-mt-20">
          <CardHeader
            title="Operadores aprobados"
            subtitle="Únicos autorizados para manipular esta grúa"
            action={
              canEdit && (
                <Modal label="Aprobar" title={`Aprobar operador · ${c.code}`} size="sm" variant="outline" icon={<UserPlus className="size-3.5" />}>
                  <ApproveOperatorForm craneId={c.id} operators={approvable} />
                </Modal>
              )
            }
          />
          <ul className="space-y-2 p-4 sm:p-5">
            {d.operators.map((o) => {
              const lic = o.staff.license_expires_on ? daysUntil(o.staff.license_expires_on, now) : null;
              const appr = o.valid_until ? daysUntil(o.valid_until, now) : null;
              return (
                <li key={o.id} className="rounded-2xl border border-line p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{o.staff.full_name}</div>
                      <div className="text-[12px] text-muted">
                        {o.staff.license_type} · {o.staff.license_number}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {lic != null && (lic < 0 ? <Badge tone="red">Licencia vencida</Badge> : lic <= 30 ? <Badge tone="amber">Licencia {lic} d</Badge> : <Badge tone="green">Licencia vigente</Badge>)}
                      {canEdit && <RevokeButton action={revokeOperatorAction.bind(null, o.id)} />}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                    <span>Aprobado {fmt.short(o.approved_on)}</span>
                    {o.valid_until && <span className={cx(appr != null && appr <= 30 && "font-medium text-warn")}>Aprobación hasta {fmt.short(o.valid_until)}</span>}
                    {o.staff.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" /> +{o.staff.phone}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
            {d.operators.length === 0 && <Empty title="Sin operadores aprobados">Nadie puede operar esta grúa hasta aprobar a alguien.</Empty>}
          </ul>
        </Card>

        <Card id="agenda" className="scroll-mt-20 xl:col-span-2">
          <CardHeader title="Agenda" subtitle="En curso y próximos eventos" />
          <ul className="px-3 pt-2 pb-3">
            {upcoming.map((e) => (
              <li key={e.id}>
                <Link href={e.href} className="flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-canvas">
                  <span className={cx("h-10 w-1.5 shrink-0 rounded-full", e.kind === "renta" ? "bg-ink" : e.kind === "mantenimiento" ? "bg-warn-mid" : e.kind === "detencion" ? "bg-rhino-500" : "border-2 border-rhino-500")} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{e.title}</div>
                    <div className="truncate text-[12px] text-muted">{e.subtitle}</div>
                  </div>
                  <div className="text-right text-[12px] whitespace-nowrap text-muted">
                    <div>{fmt.dateTime(e.start)}</div>
                    <div>→ {e.open ? "sin fecha" : fmt.dateTime(e.end)}</div>
                  </div>
                </Link>
              </li>
            ))}
            {upcoming.length === 0 && <Empty title="Sin eventos próximos" />}
          </ul>
          {past.length > 0 && (
            <div className="border-t border-line px-6 py-4">
              <div className="mb-2 text-[12px] font-medium tracking-wide text-muted uppercase">Últimas rentas</div>
              <div className="flex flex-wrap gap-2">
                {past.map((r) => (
                  <Badge key={r.id} tone="outline">
                    {r.client?.name} · {fmt.short(r.start_at)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card id="revisiones" className="scroll-mt-20 xl:col-span-2">
          <CardHeader title="Revisiones" subtitle="Checklists con evidencia fotográfica y calidad de llenado" action={<Link href="/checklists" className="text-[13px] font-medium text-rhino-600">Todas</Link>} />
          <div className="scroll-x px-2 pb-3 sm:px-3">
            <table className="w-full min-w-[560px] text-[14px]">
              <tbody>
                {d.inspections.slice(0, 8).map((i) => (
                  <tr key={i.id} className="border-t border-line first:border-0">
                    <td className="px-3 py-3">
                      <Link href={`/checklists/${i.id}`} className="font-medium hover:text-rhino-600">{CHECKLIST_KIND_LABELS[i.kind]}</Link>
                      <div className="text-[12px] text-muted">{fmt.dateTime(i.scheduled_for)} · {i.assignee?.full_name ?? "sin asignar"}</div>
                    </td>
                    <td className="px-3 py-3">
                      {i.result ? (
                        <Badge tone={i.result === "aprobada" ? "green" : i.result === "rechazada" ? "red" : "amber"}>{i.result.replace("_", " ")}</Badge>
                      ) : (
                        <Badge tone={i.status === "vencida" ? "red" : "neutral"}>{i.status.replace("_", " ")}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {i.quality_score != null && (
                        <span className={cx("tabular font-semibold", i.quality_score < 70 ? "text-rhino-600" : "text-ink")}>{i.quality_score}<span className="text-[12px] font-normal text-muted">/100</span></span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.inspections.length === 0 && <Empty title="Sin revisiones" />}
          </div>
        </Card>

        <Card className="scroll-mt-20">
          <CardHeader title="Puntos propios de esta grúa" subtitle="Se agregan a cada revisión total" />
          <ul className="space-y-2 p-4 sm:p-5">
            {d.ownChecklistItems.map((it) => (
              <li key={it.id} className="rounded-2xl bg-canvas p-3.5">
                <div className="flex items-center gap-2 text-[14px] font-medium">
                  {it.title}
                  {it.critical && <Badge tone="red">Crítico</Badge>}
                </div>
                <div className="mt-0.5 text-[12px] text-muted">{it.reason}</div>
              </li>
            ))}
            {d.ownChecklistItems.length === 0 && <p className="text-[13px] text-muted">Usa la plantilla general de su tipo.</p>}
          </ul>
        </Card>

        <Card id="mantenimiento" className="scroll-mt-20 xl:col-span-2">
          <CardHeader title="Mantenimiento" subtitle={d.maintenance.length > 0 ? `Costo registrado ${money(d.maintenance.reduce((s, m) => s + m.cost, 0))}` : "Sin historial de servicios registrado"} />
          <div className="scroll-x px-2 pb-3 sm:px-3">
            <table className="w-full min-w-[560px] text-[14px]">
              <tbody>
                {d.maintenance.map((m) => {
                  const checklist = d.inspections.filter((inspection) => inspection.maintenance_order_id === m.id).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
                  const checklistApproved = checklist?.status === "completada" && checklist.result === "aprobada" && (checklist.quality_score ?? 0) >= 70;
                  const needsChecklist = Boolean(m.plan_id);
                  const canClose = !needsChecklist || checklistApproved;
                  const openOrder = m.status !== "completado" && m.status !== "cancelado";
                  const canRepeat = needsChecklist && (checklist?.status === "cancelada" || (checklist?.status === "completada" && !checklistApproved));
                  const checklistLabel = checklistApproved ? "Checklist aprobado" : checklist?.status === "completada" ? "Checklist no aprobado para cierre" : checklist?.status === "cancelada" ? "Checklist cancelado" : checklist?.status === "en_progreso" ? "Checklist en curso" : "Checklist pendiente";
                  return (
                  <tr key={m.id} className="border-t border-line align-top first:border-0">
                    <td className="px-3 py-3">
                      <div className="font-medium">{m.title}</div>
                      <div className="text-[12px] text-muted">
                        {m.kind === "preventivo" ? "Preventivo" : "Correctivo"} · {fmt.short(m.scheduled_start)} → {fmt.short(m.scheduled_end)}
                        {m.created_by === "agente" && " · programado por Rhino"}
                      </div>
                      {needsChecklist && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge tone={checklistApproved ? "green" : checklist?.status === "completada" ? "red" : "amber"}>{checklistLabel}</Badge>
                          {checklist && <Link href={`/checklists/${checklist.id}`} className="text-[12px] font-medium text-rhino-600 hover:underline">Ver expediente del checklist</Link>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={m.status === "completado" ? "green" : m.status === "en_proceso" ? "amber" : "neutral"}>{m.status.replace("_", " ")}</Badge>
                    </td>
                    <td className="tabular px-3 py-3 text-right font-medium">{m.cost ? money(m.cost) : "—"}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {openOrder && checklist && !["completada", "cancelada"].includes(checklist.status) && (
                          <Link href={`/c/${checklist.access_token}`} className={buttonClass("primary", "sm")}>
                            <ClipboardCheck className="size-3.5" />{checklist.status === "en_progreso" ? "Continuar checklist" : "Abrir checklist"}
                          </Link>
                        )}
                        {openOrder && canClose && (
                          <Modal label="Cerrar" title="Cerrar orden de mantenimiento" size="sm" variant="outline">
                            <CompleteMaintenanceForm id={m.id} />
                          </Modal>
                        )}
                        {openOrder && canRepeat && (
                          <Modal label="Repetir checklist" title="Repetir checklist de mantenimiento" size="sm" variant="outline">
                            <RepeatMaintenanceChecklistForm id={m.id} />
                          </Modal>
                        )}
                        {openOrder && !canClose && <p className="max-w-[200px] text-[12px] leading-relaxed text-muted">El cierre se habilita con el checklist aprobado y la evidencia completa.</p>}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {d.maintenance.length === 0 && <Empty title="Sin órdenes de mantenimiento" />}
          </div>
        </Card>

        <Card id="consumo" className="scroll-mt-20">
          <CardHeader title="Consumo de almacén" subtitle="Todo lo que salió del almacén hacia esta grúa" />
          <ul className="px-5 pt-2 pb-5 text-[13px] sm:px-6">
            {consumption.slice(0, 10).map((m) => (
              <li key={m.id} className="border-t border-line py-2.5 first:border-0">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{m.item?.name}</span>
                  <span className="tabular shrink-0 font-semibold">{qtyUnit(-m.qty_delta, m.item?.unit ?? "")}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                  {fmt.dateTime(m.created_at)} · {m.reason}
                  {m.status !== "aplicado" && <Badge tone="amber">{m.status.replaceAll("_", " ")}</Badge>}
                  {m.flags.filter((f) => f !== "sin_orden").length > 0 && <Badge tone="red">{flagText(m.flags.filter((f) => f !== "sin_orden"))}</Badge>}
                </div>
              </li>
            ))}
            {consumption.length === 0 && <Empty title="Sin consumos registrados" />}
          </ul>
          <div className="border-t border-line px-5 py-4 sm:px-6">
            <div className="mb-2 text-[12px] font-medium tracking-wide text-muted uppercase">Refacciones específicas compatibles</div>
            <div className="flex flex-wrap gap-1.5">
              {d.compatibleItems.filter((x) => x.item.scope === "especifico").map((x) => (
                <Badge key={x.id} tone="outline">{x.item.name}</Badge>
              ))}
            </div>
          </div>
        </Card>

        <Card id="gastos" className="scroll-mt-20 xl:col-span-3">
          <CardHeader title="Gastos asignados" subtitle={d.purchases.length > 0 || d.maintenance.length > 0 ? `Total registrado (compras + mantenimiento): ${money(spent)}` : "Sin gastos registrados"} />
          <div className="scroll-x px-2 pb-3 sm:px-3">
            <table className="w-full min-w-[560px] text-[14px]">
              <tbody>
                {d.purchases.slice(0, 12).map((p) => (
                  <tr key={p.id} className="border-t border-line first:border-0">
                    <td className="px-3 py-3 whitespace-nowrap text-muted">{fmt.date(p.purchased_on)}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{p.description}</div>
                      <div className="text-[12px] text-muted">{p.supplier}</div>
                    </td>
                    <td className="px-3 py-3"><Badge>{PURCHASE_CATEGORY_LABELS[p.category]}</Badge></td>
                    <td className="tabular px-3 py-3 text-right font-semibold">{money(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.purchases.length === 0 && <Empty title="Sin compras asignadas a esta grúa" />}
          </div>
        </Card>
      </div>
    </>
  );
}
