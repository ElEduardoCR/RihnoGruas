import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Camera, ExternalLink, Footprints, Gauge, Sparkles, Timer } from "lucide-react";
import { getDb } from "@/lib/db";
import { listInspections } from "@/lib/services/inspections";
import { CHECKLIST_KIND_LABELS, CRANE_TYPE_LABELS, FLAG_LABELS } from "@/lib/labels";
import { addDays, fmt } from "@/lib/time";
import { Badge, Card, CardHeader, PageHeader, PageSkeleton, Stat, Tabs, buttonClass, cx } from "@/components/ui";

export const metadata = { title: "Checklists" };

type SP = Promise<{ tab?: string }>;

export default function ChecklistsPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<PageSkeleton rows={2} />}>
      <Checklists searchParams={searchParams} />
    </Suspense>
  );
}

async function Checklists({ searchParams }: { searchParams: SP }) {
  await connection();
  const { tab = "pendientes" } = await searchParams;
  const db = await getDb();
  const now = new Date();
  const [list, templates, templateItems] = await Promise.all([
    listInspections(db, addDays(now, -60)),
    db.select("checklist_templates", { eq: { active: true } }),
    db.select("checklist_template_items"),
  ]);
  const pending = list.filter((i) => ["programada", "en_progreso", "vencida"].includes(i.status)).sort((a, b) => Date.parse(a.scheduled_for) - Date.parse(b.scheduled_for));
  const done = list.filter((i) => i.status === "completada");
  const scored = done.filter((i) => i.quality_score != null);
  const avgQuality = scored.length ? Math.round(scored.reduce((s, i) => s + i.quality_score!, 0) / scored.length) : null;
  const rows = tab === "completadas" ? done : pending;

  return (
    <>
      <PageHeader
        title="Checklists"
        subtitle="Rhino agenda una revisión personalizada antes de cada renta. El operador la llena desde WhatsApp, paso a paso y con foto obligatoria en cada punto."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Pendientes" value={pending.filter((i) => i.status !== "vencida").length} hint="programadas o en curso" />
        <Stat label="Vencidas" value={pending.filter((i) => i.status === "vencida").length} hint="no se hicieron a tiempo" tone="red" />
        <Stat label="Calidad promedio" value={avgQuality ?? "—"} hint="de 100 · últimos 60 días" tone={avgQuality != null && avgQuality < 80 ? "amber" : "green"} icon={<Gauge className="size-4" />} />
        <Stat label="Rechazadas" value={done.filter((i) => i.result === "rechazada").length} hint="grúa detenida automáticamente" tone="dark" />
      </div>

      <Tabs
        active={tab}
        tabs={[
          { key: "pendientes", label: "Pendientes", href: "/checklists", count: pending.length },
          { key: "completadas", label: "Completadas", href: "/checklists?tab=completadas" },
          { key: "plantillas", label: "Plantillas", href: "/checklists?tab=plantillas" },
        ]}
      />

      {tab !== "plantillas" ? (
        <Card>
          <div className="scroll-x px-2 py-2 sm:px-3">
            <table className="w-full min-w-[820px] text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-muted">
                  <th className="px-3 py-3 font-medium">Grúa</th>
                  <th className="px-3 py-3 font-medium">Revisión</th>
                  <th className="px-3 py-3 font-medium">{tab === "completadas" ? "Completada" : "Programada"}</th>
                  <th className="px-3 py-3 font-medium">Responsable</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 text-right font-medium">Calidad</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} className="border-t border-line">
                    <td className="px-3 py-3">
                      <div className="font-semibold">{i.crane.code}</div>
                      <div className="text-[12px] text-muted">{i.crane.name}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{CHECKLIST_KIND_LABELS[i.kind]}</div>
                      <div className="text-[12px] text-muted">{i.created_by === "agente" ? "Agendada por Rhino" : "Agendada en web"}{i.rental_id ? " · previa a renta" : ""}</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-[13px]">
                      {fmt.dateTime(tab === "completadas" ? i.completed_at! : i.scheduled_for)}
                      {tab !== "completadas" && <div className="text-[12px] text-muted">límite {fmt.dateTime(i.due_by)}</div>}
                    </td>
                    <td className="px-3 py-3 text-[13px]">{i.assignee?.full_name ?? "—"}</td>
                    <td className="px-3 py-3">
                      {i.result ? (
                        <Badge tone={i.result === "aprobada" ? "green" : i.result === "rechazada" ? "red" : "amber"}>{i.result.replace("_", " ")}</Badge>
                      ) : (
                        <Badge tone={i.status === "vencida" ? "red" : i.status === "en_progreso" ? "amber" : "neutral"}>{i.status.replace("_", " ")}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {i.quality_score != null ? (
                        <div>
                          <span className={cx("tabular font-semibold", i.quality_score < 70 ? "text-rhino-600" : "")}>{i.quality_score}</span>
                          {i.quality_flags.length > 0 && <div className="text-[11px] text-rhino-600">{i.quality_flags.map((f) => FLAG_LABELS[f] ?? f).join(", ")}</div>}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-2">
                        {i.status !== "completada" && (
                          <a href={`/c/${i.access_token}`} target="_blank" className={buttonClass("outline", "sm")}>
                            Wizard <ExternalLink className="size-3" />
                          </a>
                        )}
                        <Link href={`/checklists/${i.id}`} className={buttonClass(i.status === "completada" ? "dark" : "ghost", "sm")}>
                          {i.status === "completada" ? "Reporte" : "Detalle"}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="p-10 text-center text-muted">Nada por aquí.</div>}
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => {
            const items = templateItems.filter((x) => x.template_id === t.id);
            const sections = [...new Set(items.map((x) => x.section))];
            return (
              <Card key={t.id} className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[18px] font-semibold">{t.name}</h3>
                    <p className="mt-1 text-[13px] text-muted">{t.description}</p>
                  </div>
                  <Badge tone="dark">{items.length} pasos</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {t.crane_types.map((c) => (
                    <Badge key={c} tone="outline">{CRANE_TYPE_LABELS[c]}</Badge>
                  ))}
                </div>
                <ul className="mt-4 space-y-1.5 text-[13px]">
                  {sections.map((s) => (
                    <li key={s} className="flex justify-between border-t border-line pt-1.5">
                      <span>{s}</span>
                      <span className="text-muted">
                        {items.filter((x) => x.section === s).length} · {items.filter((x) => x.section === s && x.critical).length} críticos
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-6 p-6 sm:p-8" as="div">
        <CardHeader title="Por qué ya no se llenan “sin conciencia”" className="p-0" />
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [Footprints, "Un punto a la vez", "Wizard paso a paso: no se puede marcar todo de golpe ni avanzar sin contestar."],
            [Camera, "Foto en cada punto", "Tomada con la cámara en el momento; se detectan fotos repetidas o viejas."],
            [Timer, "Tiempo por paso", "Respuestas en menos de 5 s se marcan como apresuradas y bajan la calidad."],
            [Sparkles, "Personalizada", "Rhino agrega puntos según fallas previas, reparaciones, horómetro, documentos y la maniobra."],
          ].map(([Icon, title, text]) => {
            const I = Icon as typeof Camera;
            return (
              <div key={title as string}>
                <I className="size-5 text-rhino-500" />
                <div className="mt-2 font-semibold">{title as string}</div>
                <p className="mt-1 text-[13px] text-muted">{text as string}</p>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
