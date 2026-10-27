import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Bot, Camera, ChevronLeft, ExternalLink, FileText, MapPin, PenLine, Timer, Wrench } from "lucide-react";
import { getDb } from "@/lib/db";
import { CHECKLIST_KIND_LABELS, FLAG_LABELS } from "@/lib/labels";
import { fmt, num } from "@/lib/time";
import { inspectionLink } from "@/lib/services/notify";
import { Badge, Card, CardHeader, PageSkeleton, buttonClass, cx } from "@/components/ui";
import type { InspectionItem } from "@/lib/types";

export const metadata = { title: "Revisión" };

export default function InspectionReportPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = await getDb();
  const insp = await db.get("inspections", id);
  if (!insp) notFound();
  const [items, crane, assignee] = await Promise.all([
    db.select("inspection_items", { eq: { inspection_id: id }, order: { column: "position" } }),
    db.get("cranes", insp.crane_id),
    insp.assigned_to ? db.get("staff", insp.assigned_to) : Promise.resolve(null),
  ]);
  const sections = [...new Set(items.map((i) => i.section))];
  const answered = items.filter((i) => i.answered_at).length;
  const failed = items.filter((i) => i.passed === false);
  const minutes = insp.started_at && insp.completed_at ? Math.round((Date.parse(insp.completed_at) - Date.parse(insp.started_at)) / 60000) : null;
  const score = insp.quality_score;
  const maintenance = insp.kind === "mantenimiento";

  return (
    <>
      <Link href="/checklists" className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Checklists
      </Link>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-6 sm:p-8" as="div">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="dark">{crane?.code}</Badge>
              {insp.result ? (
                <Badge tone={insp.result === "aprobada" ? "green" : insp.result === "rechazada" ? "red" : "amber"}>{insp.result.replace("_", " ")}</Badge>
              ) : (
                <Badge tone={insp.status === "vencida" ? "red" : "neutral"}>{insp.status.replace("_", " ")}</Badge>
              )}
              {insp.created_by === "agente" && <Badge tone="red"><Bot className="size-3" />Agendada por Rhino</Badge>}
            </div>
            <h1 className="mt-4 text-[30px] leading-tight font-semibold sm:text-[36px]">{maintenance ? insp.title : CHECKLIST_KIND_LABELS[insp.kind]}</h1>
            <p className="mt-1 text-muted">
              <Link href={`/gruas/${crane?.id}`} className="font-medium text-ink hover:text-rhino-600">{crane?.code} {crane?.name}</Link> · programada {fmt.dateTime(insp.scheduled_for)} · límite {fmt.dateTime(insp.due_by)}
            </p>
            {maintenance && insp.maintenance_order_id && (
              <div className="mt-4 rounded-2xl bg-canvas p-4 text-[13px] leading-relaxed text-ink-2">
                <Link href={`/gruas/${insp.crane_id}#mantenimiento`} className="inline-flex items-center gap-1.5 font-semibold text-rhino-600"><Wrench className="size-4" />Ver orden de mantenimiento</Link>
                <p className="mt-2">Este checklist documenta el trabajo y sus evidencias. La orden se cierra desde el expediente cuando la revisión está aprobada; completar este registro no libera la unidad para operar.</p>
              </div>
            )}
            {insp.ai_summary && <p className="mt-5 rounded-2xl bg-canvas p-4 text-[14px] text-ink-2">{insp.ai_summary}</p>}
            {insp.status !== "completada" && insp.status !== "cancelada" && (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a href={`/c/${insp.access_token}`} target="_blank" className={buttonClass("primary")}>
                  {insp.status === "en_progreso" ? "Continuar checklist" : "Abrir checklist paso a paso"} <ExternalLink className="size-4" />
                </a>
                <span className="text-[13px] break-all text-muted">{inspectionLink(insp.access_token)}</span>
              </div>
            )}
          </Card>

          {sections.map((s) => (
            <Card key={s}>
              <CardHeader title={s} subtitle={`${items.filter((i) => i.section === s).length} puntos`} />
              <ul className="divide-y divide-line px-5 pt-2 pb-3 sm:px-6">
                {items
                  .filter((i) => i.section === s)
                  .map((it) => (
                    <li key={it.id} className="py-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-canvas text-[11px] font-semibold text-muted">{it.position}</span>
                          <span className="font-medium">{it.title}</span>
                          {it.critical && <Badge tone="red">Crítico</Badge>}
                          {it.source === "agente" && <Badge tone="dark"><Bot className="size-3" />Rhino</Badge>}
                          {it.source === "grua" && <Badge tone="outline">Propio de la grúa</Badge>}
                          {it.requires_manual_confirmation && <Badge tone={it.manual_confirmed ? "green" : "amber"}>{it.manual_confirmed ? "Manual confirmado" : "Manual pendiente"}</Badge>}
                        </div>
                        {it.source_reason && <div className="mt-0.5 text-[12px] text-rhino-600">{it.source_reason}</div>}
                        <div className="mt-1 text-[13px] text-muted">{it.instructions}</div>
                        {(it.procedure_steps?.length ?? 0) > 0 && (
                          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink-2">
                            {it.procedure_steps!.map((step, index) => <li key={`${it.id}-procedure-${index}`}>{step}</li>)}
                          </ol>
                        )}
                        {(it.reference_label || it.reference_url) && (
                          <div className="mt-3 rounded-xl bg-canvas px-3 py-2.5 text-[12px] leading-relaxed text-muted">
                            <div className="flex items-start gap-1.5"><FileText className="mt-0.5 size-3.5 shrink-0" /><span>{it.reference_label ?? "Referencia del procedimiento"}</span></div>
                            {it.reference_url && <a href={it.reference_url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block font-medium text-rhino-600 underline underline-offset-2">Consultar fuente</a>}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                          {it.answered_at ? (
                            <>
                              {it.response_type === "numero" ? (
                                <Badge tone={it.passed === false ? "red" : "neutral"}>
                                  {num(it.value_number, 1)} {it.unit}
                                </Badge>
                              ) : it.response_type === "texto" ? (
                                <p className="whitespace-pre-wrap break-words rounded-xl bg-canvas px-3 py-2 text-[13px] text-ink-2">{it.value_text}</p>
                              ) : (
                                <Badge tone={it.passed ? "green" : "red"}>{it.passed ? "OK" : "Falla"}</Badge>
                              )}
                              {it.seconds_spent != null && (
                                <span className={cx("inline-flex items-center gap-1 text-[12px]", it.seconds_spent < 5 ? "text-rhino-600" : "text-muted")}>
                                  <Timer className="size-3" /> {it.seconds_spent} s
                                </span>
                              )}
                              {it.flags.map((f) => (
                                <Badge key={f} tone="red">{FLAG_LABELS[f] ?? f}</Badge>
                              ))}
                            </>
                          ) : (
                            <span className="text-[12px] text-faint">Sin contestar</span>
                          )}
                        </div>
                        {it.notes && <p className="mt-2 rounded-xl bg-rhino-50 px-3 py-2 text-[13px] text-rhino-700">{it.notes}</p>}
                        <EvidenceGallery item={it} />
                      </div>
                    </li>
                  ))}
              </ul>
            </Card>
          ))}
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card className="p-6 text-center" as="div">
            <div className="text-[13px] font-medium text-muted">Calidad del llenado</div>
            <div className={cx("mt-2 text-[64px] leading-none font-semibold tracking-tight", score == null ? "text-faint" : score < 70 ? "text-rhino-500" : "text-ink")}>{score ?? "—"}</div>
            <div className="text-[12px] text-muted">de 100</div>
            {insp.quality_flags.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-1">
                {insp.quality_flags.map((f) => (
                  <Badge key={f} tone="red">{FLAG_LABELS[f] ?? f}</Badge>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-6" as="div">
            <dl className="space-y-3 text-[14px]">
              <div className="flex justify-between"><dt className="text-muted">Avance</dt><dd className="font-medium">{answered} / {items.length}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Fallas</dt><dd className={cx("font-medium", failed.length && "text-rhino-600")}>{failed.length}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Responsable</dt><dd className="font-medium">{assignee?.full_name ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Inicio</dt><dd>{insp.started_at ? fmt.dateTime(insp.started_at) : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Fin</dt><dd>{insp.completed_at ? fmt.dateTime(insp.completed_at) : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Duración</dt><dd>{minutes != null ? `${minutes} min` : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Horómetro</dt><dd>{insp.hour_meter_reading != null ? `${num(insp.hour_meter_reading)} h` : "—"}</dd></div>
              {insp.start_lat != null && (
                <div className="flex justify-between">
                  <dt className="text-muted">Ubicación</dt>
                  <dd>
                    <a className="inline-flex items-center gap-1 font-medium text-rhino-600" target="_blank" href={`https://maps.google.com/?q=${insp.start_lat},${insp.start_lng}`}>
                      <MapPin className="size-3.5" /> Ver mapa
                    </a>
                  </dd>
                </div>
              )}
            </dl>
            {insp.signature_name && (
              <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-[13px] text-muted">
                <PenLine className="size-4" /> Firmó: <span className="font-medium text-ink">{insp.signature_name}</span>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function EvidenceGallery({ item }: { item: InspectionItem }) {
  const requirements = item.photo_requirements ?? [];
  const minimum = item.requires_photo ? Math.max(1, item.min_photos) : 0;
  const saved = item.photo_paths.map((path, index) => ({ path, slot: item.photo_slots?.[index] ?? index }));
  const slots = [...new Set([...Array.from({ length: Math.max(minimum, requirements.length) }, (_, index) => index), ...saved.map((photo) => photo.slot)])].sort((a, b) => a - b);
  if (!slots.length) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted"><Camera className="size-3.5" />Evidencia · {item.photo_paths.length} fotos guardadas{minimum > 0 ? ` · mínimo ${minimum}` : ""}</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {slots.map((slot) => {
          const photo = saved.find((entry) => entry.slot === slot);
          const caption = requirements[slot] ?? (slot >= minimum ? "Evidencia adicional" : "Evidencia del punto");
          return (
            <figure key={`${item.id}-slot-${slot}`} className="min-w-0 overflow-hidden rounded-xl border border-line bg-white">
              {photo ? (
                <a href={`/api/files/evidencias/${photo.path}`} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] overflow-hidden bg-canvas">
                  {/* eslint-disable-next-line @next/next/no-img-element -- evidencia privada servida por /api/files */}
                  <img src={`/api/files/evidencias/${photo.path}`} alt={`${item.title} · toma ${slot + 1}: ${caption}`} loading="lazy" className="h-full w-full object-cover" />
                </a>
              ) : (
                <div className="grid aspect-[4/3] place-items-center bg-canvas text-[12px] text-faint">Foto pendiente</div>
              )}
              <figcaption className="p-2.5 text-[11px] leading-relaxed text-ink-2"><span className="font-semibold">{slot + 1}.</span> {caption}</figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
