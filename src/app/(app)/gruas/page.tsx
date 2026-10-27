import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Gauge, Ruler, Weight } from "lucide-react";
import { getDb } from "@/lib/db";
import { getFleet } from "@/lib/services/fleet";
import { CRANE_TYPE_LABELS, STATUS_LABELS } from "@/lib/labels";
import type { CraneStatus, CraneType } from "@/lib/types";
import { fmt, num } from "@/lib/time";
import { Badge, Card, DocHealthBadge, PageHeader, PageSkeleton, Progress, StatusPill, cx } from "@/components/ui";
import { CraneIcon } from "@/components/brand";
import { FleetPhoto } from "@/components/fleet-profile";
import { FLEET_RECONCILIATION } from "@/lib/fleet/sergio";
import { Modal } from "@/components/modal";
import { CraneForm } from "@/components/catalog-forms";
import { Plus } from "lucide-react";
import { currentStaff } from "@/lib/auth";
import { MANAGER_ROLES } from "@/lib/services/catalogs";

export const metadata = { title: "Flota y equipos" };

type SP = Promise<{ tipo?: string; estado?: string }>;

export default function CranesPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<PageSkeleton rows={2} />}>
      <Cranes searchParams={searchParams} />
    </Suspense>
  );
}

async function Cranes({ searchParams }: { searchParams: SP }) {
  await connection();
  const sp = await searchParams;
  const db = await getDb();
  const now = new Date();
  const [{ cranes }, me] = await Promise.all([getFleet(db, now), currentStaff(db)]);
  const canEdit = Boolean(me && MANAGER_ROLES.includes(me.role));
  const hasSergioFleet = cranes.some((c) => c.fleet_profile?.import_key.startsWith("sergio-2026-10-27:"));
  const tipo = sp.tipo as CraneType | undefined;
  const estado = sp.estado as CraneStatus | undefined;
  const list = cranes.filter((c) => (!tipo || c.type === tipo) && (!estado || c.status === estado));
  const href = (o: { tipo?: string | null; estado?: string | null }) => {
    const p = new URLSearchParams();
    const t = o.tipo === undefined ? tipo : o.tipo;
    const e = o.estado === undefined ? estado : o.estado;
    if (t) p.set("tipo", t);
    if (e) p.set("estado", e);
    return `/gruas${p.size ? `?${p}` : ""}`;
  };
  const chip = (active: boolean) =>
    cx("h-8 rounded-full px-3.5 text-[13px] font-medium transition inline-flex items-center", active ? "bg-ink text-white" : "bg-white text-ink-2 border border-line hover:border-line-2");

  return (
    <>
      <PageHeader
        title="Flota y equipos"
        subtitle={`${cranes.length} unidades registradas · grúas, equipos de carga, transporte y vehículos de apoyo. Abre una para consultar su expediente y mantenimiento.`}
        actions={
          canEdit && (
            <Modal label="Nueva unidad" title="Nueva unidad" icon={<Plus className="size-4" />} wide>
              <CraneForm />
            </Modal>
          )
        }
      />
      {hasSergioFleet && (
        <Card className="mb-6 border-warn-mid/20 bg-warn-soft/40 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold">Conciliación del listado de Sergio</h2>
            <Badge tone="amber">Identidades por confirmar</Badge>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">Las menciones pendientes se conservan aquí y no se cuentan como unidades adicionales.</p>
          <ul className="mt-3 list-disc space-y-2 pl-4 text-[13px] leading-relaxed text-ink-2">
            {FLEET_RECONCILIATION.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </Card>
      )}
      {cranes.length === 0 && (
        <Card className="p-10 text-center" as="div">
          <CraneIcon className="mx-auto size-10 text-faint" />
          <div className="mt-3 text-[17px] font-semibold">Aún no hay unidades</div>
          <p className="mx-auto mt-1 max-w-md text-[14px] text-muted">Da de alta la primera con “Nueva unidad”. Después completa sus documentos y responsables desde el expediente.</p>
        </Card>
      )}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={href({ tipo: null })} className={chip(!tipo)}>Todas</Link>
        {(Object.keys(CRANE_TYPE_LABELS) as CraneType[]).map((t) => (
          <Link key={t} href={href({ tipo: t })} className={chip(tipo === t)}>
            {CRANE_TYPE_LABELS[t]} <span className="ml-1.5 opacity-50">{cranes.filter((c) => c.type === t).length}</span>
          </Link>
        ))}
        <span className="mx-1 hidden w-px bg-line-2 sm:block" />
        {(Object.keys(STATUS_LABELS) as CraneStatus[]).map((s) => (
          <Link key={s} href={href({ estado: estado === s ? null : s })} className={chip(estado === s)}>
            {STATUS_LABELS[s]} <span className="ml-1.5 opacity-50">{cranes.filter((c) => c.status === s).length}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((c) => (
          <Link key={c.id} href={`/gruas/${c.id}`} className="group">
            <Card className="h-full overflow-hidden transition group-hover:-translate-y-0.5 group-hover:shadow-[var(--shadow-pop)]" as="article">
              <div className={cx("relative h-[200px] px-5 pt-12 pb-2", c.status === "rentada" ? "bg-night" : "bg-gradient-to-b from-canvas to-white")}>
                <FleetPhoto profile={c.fleet_profile} type={c.type} tone={c.status === "rentada" ? "dark" : "light"} compact />
                <div className="absolute top-4 left-4 flex gap-2">
                  <span className={cx("rounded-full px-2.5 py-1 text-[12px] font-semibold", c.status === "rentada" ? "bg-white/10 text-white" : "bg-white text-ink shadow-sm")}>{c.code}</span>
                </div>
                <div className="absolute top-4 right-4">
                  <StatusPill status={c.status} className={c.status === "rentada" ? "bg-white text-ink" : undefined} />
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[18px] leading-snug font-semibold">{c.name}</h3>
                    <p className="truncate text-[13px] text-muted">
                      {CRANE_TYPE_LABELS[c.type]} · {c.brand} {c.model}
                    </p>
                  </div>
                  {c.documents.length === 0 ? <Badge tone="neutral">Sin documentos</Badge> : <DocHealthBadge health={c.docHealth} days={null} />}
                </div>
                {c.fleet_profile && <div className="mt-2"><Badge tone="amber">Identificación pendiente</Badge></div>}
                <div className="mt-4 grid grid-cols-3 gap-2 text-[12px] text-muted">
                  <span className="flex items-center gap-1.5" title="Capacidad verificada"><Weight className="size-3.5 shrink-0" /><span className="sr-only">Capacidad verificada: </span><b className="text-ink">{c.capacity_tons == null ? "—" : `${num(c.capacity_tons)} t`}</b></span>
                  <span className="flex items-center gap-1.5" title="Longitud de pluma verificada"><Ruler className="size-3.5 shrink-0" /><span className="sr-only">Pluma: </span><b className="text-ink">{c.boom_length_m == null ? "—" : `${num(c.boom_length_m)} m`}</b></span>
                  <span className="flex items-center gap-1.5" title="Lectura del horómetro"><Gauge className="size-3.5 shrink-0" /><span className="sr-only">Horómetro: </span><b className="text-ink">{c.hour_meter == null ? "—" : `${num(c.hour_meter)} h`}</b></span>
                </div>
                <div className="mt-4">
                  {c.service.known ? (
                    <>
                      <div className="mb-1.5 flex justify-between text-[12px]">
                        <span className="text-muted">Servicio</span>
                        <span className={cx("font-medium", c.service.pct >= 0.9 ? "text-rhino-600" : "text-ink-2")}>
                          {Math.round(c.service.used)} / {c.service_interval_hours} h
                        </span>
                      </div>
                      <Progress value={c.service.pct} tone={c.service.pct >= 1 ? "red" : c.service.pct >= 0.85 ? "amber" : "dark"} />
                    </>
                  ) : (
                    <p className="rounded-xl bg-canvas px-3 py-2 text-[12px] text-muted">Servicio · Pendiente de lecturas y manual</p>
                  )}
                </div>
                <div className="mt-4 border-t border-line pt-3 text-[13px]">
                  {c.current ? (
                    <span className="text-ink-2">
                      <b className="font-medium text-ink">Ahora:</b> {c.current.title}
                      {!c.current.open && <span className="text-muted"> · hasta {fmt.short(c.current.end)}</span>}
                    </span>
                  ) : c.next ? (
                    <span className="text-ink-2">
                      <b className="font-medium text-ink">Siguiente:</b> {c.next.title} <span className="text-muted">· {fmt.short(c.next.start)}</span>
                    </span>
                  ) : (
                    <span className="text-muted">Sin eventos programados</span>
                  )}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      {list.length === 0 && cranes.length > 0 && (
        <Card className="p-10 text-center text-muted">
          Ninguna unidad con esos filtros. <Link href="/gruas" className="font-medium text-rhino-600">Quitar filtros</Link>
        </Card>
      )}
      <div className="mt-6 space-y-3 rounded-2xl border border-line bg-white p-4 text-[12px] leading-relaxed text-muted">
        <p><span className="font-medium text-ink">Disponible describe la agenda.</span> La identificación, la capacidad aplicable y los documentos deben verificarse antes de asignar una unidad a un trabajo.</p>
        <p>Documentos registrados: <Badge tone="green">Vigente</Badge> sin vencimientos · <Badge tone="amber">Por vencer</Badge> vence en ≤ 30 días · <Badge tone="red">Vencido</Badge> impide rentar · <Badge tone="neutral">Sin documentos</Badge> expediente pendiente.</p>
      </div>
    </>
  );
}
