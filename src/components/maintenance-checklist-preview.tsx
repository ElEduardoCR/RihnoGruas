import { Camera, ChevronDown, ClipboardCheck, FileText } from "lucide-react";
import type { MaintenancePlan, ResearchSource } from "@/lib/fleet/types";
import { Badge } from "./ui";

export function MaintenanceChecklistPreview({ plan, sources }: { plan: MaintenancePlan; sources: ResearchSource[] }) {
  const steps = plan.checklist_steps ?? [];
  const photos = steps.reduce((total, step) => total + step.min_photos, 0);
  if (!steps.length) return <p className="text-[14px] text-muted">Este plan todavía no tiene un checklist preparado.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge tone="dark"><ClipboardCheck className="size-3.5" />{steps.length} pasos</Badge>
        <Badge tone="outline"><Camera className="size-3.5" />{photos} fotos mínimas</Badge>
        <Badge tone="amber">Validar manual de la unidad</Badge>
      </div>
      <p className="rounded-2xl bg-canvas p-4 text-[13px] leading-relaxed text-ink-2">
        Al programar este trabajo tendrás un checklist para completar un paso a la vez. Cada toma tiene una indicación concreta y queda guardada en el expediente. El primer paso pide confirmar que el manual corresponde a la unidad; si falta, el trabajo permanece pendiente.
      </p>
      <ol className="space-y-3">
        {steps.map((step, index) => {
          const references = sources.filter((source) => step.source_ids.includes(source.id));
          return (
            <li key={step.id}>
              <details open={index === 0} className="group overflow-hidden rounded-2xl border border-line">
                <summary className="flex cursor-pointer list-none items-start gap-3 p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rhino-500 [&::-webkit-details-marker]:hidden">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-[12px] font-semibold text-white">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] leading-snug font-semibold">{step.title}</span>
                    <span className="mt-1 block text-[12px] text-muted">{step.section} · {step.min_photos} {step.min_photos === 1 ? "foto" : "fotos"} como mínimo</span>
                  </span>
                  <ChevronDown className="mt-1 size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="space-y-4 border-t border-line px-4 pt-4 pb-5 sm:pl-14">
                  <div className="flex flex-wrap gap-1.5">
                    {step.requires_manual_confirmation && <Badge tone="amber">Confirmación del manual</Badge>}
                    {step.critical && <Badge tone="red">Punto crítico</Badge>}
                  </div>
                  <p className="text-[13px] leading-relaxed text-ink-2">{step.instructions}</p>
                  {step.procedure_steps.length > 0 && (
                    <ol className="list-decimal space-y-2 pl-4 text-[13px] leading-relaxed text-ink-2">
                      {step.procedure_steps.map((instruction, instructionIndex) => <li key={`${step.id}-instruction-${instructionIndex}`}>{instruction}</li>)}
                    </ol>
                  )}
                  <div className="rounded-xl bg-canvas p-3.5">
                    <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold"><Camera className="size-3.5" />Fotos de este paso</div>
                    <ol className="space-y-2 text-[13px] leading-relaxed text-ink-2">
                      {step.photo_requirements.map((requirement, photoIndex) => (
                        <li key={`${step.id}-photo-${photoIndex}`} className="flex gap-2">
                          <span className="shrink-0 font-semibold text-muted">{photoIndex + 1}.</span>
                          <span>{requirement}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  {(step.reference_locator || references.length > 0) && (
                    <div className="border-t border-line pt-3 text-[12px] leading-relaxed text-muted">
                      <div className="mb-1 flex items-center gap-1.5 font-medium"><FileText className="size-3.5" />Referencia del procedimiento</div>
                      {step.reference_locator && <p className="mb-2">{step.reference_locator}</p>}
                      {references.map((source) => (
                        <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-words underline decoration-line-2 underline-offset-2 hover:text-ink">
                          {source.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
