import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CalendarPlus, Camera, ChevronDown, ClipboardCheck, ClipboardList, FileSearch, Wrench } from "lucide-react";
import type { FleetProfile, MaintenancePlan, ResearchSource } from "@/lib/fleet/types";
import type { CraneType } from "@/lib/types";
import { CraneArt } from "./brand";
import { MaintenanceForm } from "./forms";
import { Modal } from "./modal";
import { Badge, Card, CardHeader, buttonClass, cx } from "./ui";
import { MaintenanceChecklistPreview } from "./maintenance-checklist-preview";

const SOURCE_SCOPE: Record<ResearchSource["scope"], string> = {
  model: "Modelo",
  family: "Familia de equipos",
  identification: "Identificación",
};

function workDescription(plan: MaintenancePlan, sources: ResearchSource[]) {
  const references = sources.filter((source) => plan.source_ids.includes(source.id));
  return [
    plan.description,
    "Trabajos a revisar:",
    ...plan.tasks.map((task) => `• ${task}`),
    `Frecuencia de referencia: ${plan.cadence}`,
    "Validar alcance e intervalos con el manual correspondiente al número de serie y el historial de esta unidad antes del servicio.",
    ...references.map((source) => `${source.title}: ${source.url}`),
  ].join("\n");
}

export function FleetPhoto({
  profile,
  type,
  tone = "light",
  compact = false,
}: {
  profile?: FleetProfile | null;
  type: CraneType;
  tone?: "light" | "dark";
  compact?: boolean;
}) {
  const photo = profile?.photo;
  const caption = photo ? "Referencia de familia · no es la unidad Rhino" : "Ilustración · foto pendiente";

  return (
    <figure className="flex h-full w-full min-w-0 flex-col">
      <div className={cx("relative min-h-0 flex-1 overflow-hidden", !compact && "min-h-[210px] sm:min-h-[260px]", photo && "rounded-2xl bg-white")}>
        {photo ? (
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes={compact ? "(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw" : "(max-width: 1024px) 100vw, 420px"}
            className="object-contain"
          />
        ) : (
          <CraneArt type={type} tone={tone} className="absolute inset-0 h-full w-full" />
        )}
      </div>
      <figcaption className={cx("mt-2 text-center text-[11px] leading-relaxed", tone === "dark" ? "text-white/70" : "text-muted")}>
        <span>{caption}</span>
        {photo && !compact && (
          <span className="mt-1 block">
            {photo.author}{" · "}
            <a href={photo.license_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-75">
              {photo.license}
            </a>{" · "}
            <a href={photo.source_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-75">
              Fuente de la fotografía
            </a>
          </span>
        )}
      </figcaption>
    </figure>
  );
}

export function FleetResearchPanel({
  profile,
  craneId,
  mechanics,
  defaults,
  canEdit,
}: {
  profile: FleetProfile;
  craneId: string;
  mechanics: { id: string; label: string }[];
  defaults: { start: string; end: string };
  canEdit: boolean;
}) {
  return (
    <div className="space-y-6">
      <Card id="investigacion" className="scroll-mt-20">
        <CardHeader
          title="Lo que sabemos de esta unidad"
          subtitle={`Listado de ${profile.reported_by} · datos por cotejar con placa y documentos.`}
        />
        <div className="space-y-5 px-5 pt-4 pb-5 sm:px-6 sm:pb-6">
          <div className="flex flex-wrap gap-2">
            <Badge tone={profile.identification_status === "model_pending" ? "amber" : "outline"}>
              {profile.identification_status === "model_pending" ? "Modelo por identificar" : "Modelo reportado"}
            </Badge>
            {profile.economic_number && <Badge tone="neutral">Económico {profile.economic_number}</Badge>}
            {profile.provisional_code && <Badge tone="amber">Código provisional</Badge>}
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-canvas p-4">
              <dt className="text-[12px] text-muted">Capacidad reportada</dt>
              <dd className="mt-1 text-[17px] leading-snug font-semibold text-ink">{profile.reported_capacity ?? "Por confirmar"}</dd>
            </div>
            <div className="rounded-2xl bg-canvas p-4">
              <dt className="text-[12px] text-muted">Altura / alcance reportado</dt>
              <dd className="mt-1 text-[17px] leading-snug font-semibold text-ink">{profile.reported_reach ?? "Por confirmar"}</dd>
            </div>
          </dl>
          {(profile.reported_capacity || profile.reported_reach) && (
            <p className="text-[13px] leading-relaxed text-muted">
              La capacidad, sus unidades y la configuración de pluma deben confirmarse con la tabla de carga de esta unidad para planear una maniobra.
            </p>
          )}

          <div>
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <FileSearch className="size-4 text-muted" aria-hidden /> Características de catálogo
            </h3>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">Información de las fuentes consultadas; el equipamiento instalado se confirma en la unidad.</p>
            {profile.characteristics.length > 0 ? (
              <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-ink-2">
                {profile.characteristics.map((characteristic, index) => (
                  <li key={`${index}-${characteristic}`} className="flex gap-2.5">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-rhino-500" aria-hidden />
                    <span>{characteristic}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-2xl bg-canvas px-4 py-3 text-[13px] text-muted">Falta identificar el modelo para completar su ficha de catálogo.</p>
            )}
          </div>

          {profile.pending.length > 0 && (
            <details className="group rounded-2xl border border-line bg-canvas/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-[14px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rhino-500 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2">
                  <ClipboardList className="size-4 shrink-0 text-muted" aria-hidden />
                  Por confirmar en esta unidad
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge tone="amber">{profile.pending.length}</Badge>
                  <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
                </span>
              </summary>
              <ul className="list-disc space-y-2 px-4 pt-1 pb-4 pl-9 text-[13px] leading-relaxed text-ink-2">
                {profile.pending.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
              </ul>
            </details>
          )}

          {profile.sources.length > 0 && (
            <details className="group border-t border-line pt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-[13px] font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rhino-500 [&::-webkit-details-marker]:hidden">
                Fuentes consultadas ({profile.sources.length})
                <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <ul className="mt-3 space-y-2">
                {profile.sources.map((source) => (
                  <li key={source.id} className="rounded-xl border border-line px-3 py-2.5">
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="flex items-start justify-between gap-3 text-[13px] font-medium text-ink hover:text-rhino-600">
                      <span className="min-w-0 break-words">{source.title}</span>
                      <ArrowUpRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    </a>
                    <div className="mt-1.5"><Badge tone="neutral">{SOURCE_SCOPE[source.scope]}</Badge></div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Card>

      <Card id="planes" className="scroll-mt-20">
        <CardHeader
          title="Planes de mantenimiento"
          subtitle="Trabajos preparados a partir del equipo reportado y las fuentes disponibles."
        />
        <div className="px-5 pt-4 pb-5 sm:px-6 sm:pb-6">
          <p className="mb-4 rounded-2xl bg-canvas p-4 text-[13px] leading-relaxed text-ink-2">
            Cada plan tiene su guía de revisión y evidencia fotográfica. Antes de ejecutar el trabajo, el mecánico confirma el manual por número de serie, las lecturas y el historial de la unidad. Programar un checklist no registra el servicio como realizado.
          </p>
          {profile.maintenance_plans.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {profile.maintenance_plans.map((plan) => {
                const sources = profile.sources.filter((source) => plan.source_ids.includes(source.id));
                const steps = plan.checklist_steps ?? [];
                const photoCount = steps.reduce((total, step) => total + step.min_photos, 0);
                return (
                  <article key={plan.id} className="flex min-w-0 flex-col rounded-2xl border border-line p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-canvas text-ink-2"><Wrench className="size-4" aria-hidden /></span>
                      <h3 className="pt-1 text-[15px] leading-snug font-semibold text-ink">{plan.title}</h3>
                    </div>
                    <p className="mt-3 text-[13px] leading-relaxed text-muted">{plan.description}</p>
                    {steps.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Badge tone="outline"><ClipboardCheck className="size-3" />{steps.length} pasos</Badge>
                        <Badge tone="outline"><Camera className="size-3" />{photoCount} fotos mínimas</Badge>
                      </div>
                    )}
                    <ul className="mt-3 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-ink-2">
                      {plan.tasks.map((task, index) => <li key={`${index}-${task}`}>{task}</li>)}
                    </ul>
                    <div className="mt-4 rounded-xl bg-canvas px-3 py-2.5">
                      <div className="text-[11px] font-medium text-muted">Frecuencia de referencia</div>
                      <p className="mt-1 text-[13px] leading-relaxed font-medium text-ink">{plan.cadence}</p>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                        {plan.basis === "manufacturer_family" ? "Base: fabricante, para esta familia de equipos. Validar aplicación a la serie." : "Base: plan preliminar. Intervalos pendientes de validar con el manual."}
                      </p>
                    </div>
                    {sources.length > 0 && (
                      <div className="mt-3 space-y-1 text-[12px] text-muted">
                        {sources.map((source) => (
                          <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className="block break-words underline decoration-line-2 underline-offset-2 hover:text-ink">
                            {source.title} · {SOURCE_SCOPE[source.scope]}
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="mt-auto flex flex-wrap gap-2 pt-4">
                      {canEdit && steps.length > 0 && (
                        <Link href={`/checklists/iniciar?unidad=${encodeURIComponent(craneId)}&tipo=mantenimiento&plan=${encodeURIComponent(plan.id)}`} className={buttonClass("primary", "sm")}>
                          <ClipboardCheck className="size-4" />Iniciar este trabajo
                        </Link>
                      )}
                      {steps.length > 0 && (
                        <Modal label="Ver checklist" title={plan.title} subtitle="Consulta cada paso y las fotos necesarias antes de programarlo." variant="outline" size="sm" icon={<ClipboardCheck className="size-4" />} wide>
                          <MaintenanceChecklistPreview plan={plan} sources={profile.sources} />
                        </Modal>
                      )}
                      {canEdit && (
                        <Modal
                          label="Programar este trabajo"
                          title={plan.title}
                          subtitle="Confirma el alcance con el mecánico y elige la fecha de atención."
                          variant="outline"
                          size="sm"
                          icon={<CalendarPlus className="size-4" />}
                        >
                          <MaintenanceForm craneId={craneId} planId={plan.id} mechanics={mechanics} defaults={{ ...defaults, title: plan.title, description: workDescription(plan, profile.sources) }} />
                        </Modal>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="py-3 text-[13px] text-muted">Identifica el modelo y su manual para preparar los trabajos de mantenimiento.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
