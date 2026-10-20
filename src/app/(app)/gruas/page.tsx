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
import { CraneArt } from "@/components/brand";

export const metadata = { title: "Grúas" };

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
  const { cranes } = await getFleet(db, now);
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
      <PageHeader title="Grúas" subtitle={`${cranes.length} unidades · grúas móviles, Titanes y armables en sitio. Toca una para ver su expediente completo.`} />
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
              <div className={cx("relative h-[150px] px-6 pt-6", c.status === "rentada" ? "bg-night" : "bg-gradient-to-b from-canvas to-white")}>
                <CraneArt type={c.type} tone={c.status === "rentada" ? "dark" : "light"} />
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
                    <h3 className="truncate text-[18px] font-semibold">{c.name}</h3>
                    <p className="truncate text-[13px] text-muted">
                      {CRANE_TYPE_LABELS[c.type]} · {c.brand} {c.model}
                    </p>
                  </div>
                  <DocHealthBadge health={c.docHealth} days={null} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-[12px] text-muted">
                  <span className="flex items-center gap-1.5"><Weight className="size-3.5" /><b className="text-ink">{num(c.capacity_tons)}</b> t</span>
                  <span className="flex items-center gap-1.5"><Ruler className="size-3.5" /><b className="text-ink">{c.boom_length_m ?? "—"}</b> m</span>
                  <span className="flex items-center gap-1.5"><Gauge className="size-3.5" /><b className="text-ink">{num(c.hour_meter)}</b> h</span>
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-[12px]">
                    <span className="text-muted">Servicio</span>
                    <span className={cx("font-medium", c.service.pct >= 0.9 ? "text-rhino-600" : "text-ink-2")}>
                      {Math.round(c.service.used)} / {c.service_interval_hours} h
                    </span>
                  </div>
                  <Progress value={c.service.pct} tone={c.service.pct >= 1 ? "red" : c.service.pct >= 0.85 ? "amber" : "dark"} />
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
      {list.length === 0 && (
        <Card className="p-10 text-center text-muted">
          Ninguna grúa con esos filtros. <Link href="/gruas" className="font-medium text-rhino-600">Quitar filtros</Link>
        </Card>
      )}
      <p className="mt-6 text-[12px] text-muted">
        Salud documental: <Badge tone="green">Vigente</Badge> todo en regla · <Badge tone="amber">Por vencer</Badge> algo vence en ≤ 30 días · <Badge tone="red">Vencido</Badge> no puede salir a renta.
      </p>
    </>
  );
}
