"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ClipboardCheck, Play, Wrench } from "lucide-react";
import { startChecklistAction } from "@/app/checklist-actions";
import type { ChecklistKind } from "@/lib/types";
import { useFormAction } from "./forms";
import { FormMessage } from "./modal";
import { Badge, Field, buttonClass, cx, selectClass } from "./ui";

const dropdownClass = cx(selectClass, "appearance-auto bg-none");

export interface StartInspectionUnit {
  id: string;
  label: string;
  plans: { id: string; title: string; steps: number; photos: number }[];
}

const REVIEW_TYPES: { id: ChecklistKind; label: string; description: string }[] = [
  { id: "diaria", label: "Revisión diaria", description: "Comprueba el estado de la unidad antes de la jornada." },
  { id: "revision_total", label: "Revisión total", description: "Recorre los sistemas de la unidad y los puntos de su historial." },
  { id: "pre_renta", label: "Antes de una renta", description: "Revisa la unidad antes de entregarla para un trabajo." },
  { id: "post_renta", label: "Después de una renta", description: "Documenta el estado de la unidad al recibirla de regreso." },
  { id: "mantenimiento", label: "Mantenimiento según plan", description: "Elige el servicio y sigue su procedimiento con las fotos indicadas." },
];

export function StartInspectionForm({ units, canMaintain, responsibleName, initialUnit, initialKind, initialPlan }: {
  units: StartInspectionUnit[];
  canMaintain: boolean;
  responsibleName: string;
  initialUnit?: string;
  initialKind?: string;
  initialPlan?: string;
}) {
  const router = useRouter();
  const choices = REVIEW_TYPES.filter((type) => canMaintain || type.id !== "mantenimiento");
  const [unitId, setUnitId] = useState(units.some((unit) => unit.id === initialUnit) ? initialUnit! : "");
  const [kind, setKind] = useState(choices.some((type) => type.id === initialKind) ? initialKind! : "diaria");
  const [planId, setPlanId] = useState(initialPlan ?? "");
  const { state, pending, form } = useFormAction(startChecklistAction);
  const unit = units.find((entry) => entry.id === unitId);
  const plan = unit?.plans.find((entry) => entry.id === planId);
  const selectedType = choices.find((type) => type.id === kind)!;
  const ready = Boolean(unit && (kind !== "mantenimiento" || plan));

  useEffect(() => {
    if (state?.ok && state.checklistUrl) router.push(state.checklistUrl);
  }, [state, router]);

  if (state?.ok && state.checklistUrl) return (
    <div className="space-y-4" aria-live="polite">
      <FormMessage state={state} />
      <Link href={state.checklistUrl} className={buttonClass("primary", "lg") + " w-full"}><Play className="size-4" />Continuar al checklist</Link>
    </div>
  );

  return (
    <form {...form} className="space-y-6">
      <fieldset disabled={pending} className="space-y-5 disabled:opacity-70">
        <Field label="Unidad">
          <select name="crane_id" required value={unitId} onChange={(event) => { setUnitId(event.target.value); setPlanId(""); }} className={dropdownClass}>
            <option value="" disabled>Selecciona la unidad que vas a revisar</option>
            {units.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select>
        </Field>
        <Field label="Tipo de revisión" hint={selectedType.description}>
          <select name="kind" required value={kind} onChange={(event) => setKind(event.target.value)} className={dropdownClass}>
            {choices.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </Field>
        {kind === "mantenimiento" && (
          <div className="space-y-3">
            <Field label="Plan de mantenimiento">
              <select name="plan_id" required value={plan?.id ?? ""} onChange={(event) => setPlanId(event.target.value)} disabled={!unit || unit.plans.length === 0} className={dropdownClass}>
                <option value="" disabled>{unit ? "Selecciona el trabajo que vas a realizar" : "Primero selecciona una unidad"}</option>
                {unit?.plans.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
              </select>
            </Field>
            {unit && unit.plans.length === 0 && <p className="rounded-xl bg-warn-soft p-3 text-[13px] text-ink-2">Esta unidad aún no tiene un plan con checklist. Puedes iniciar una revisión diaria o total.</p>}
            {plan && <div className="flex flex-wrap gap-2"><Badge tone="outline"><ClipboardCheck className="size-3.5" />{plan.steps} pasos</Badge><Badge tone="outline"><Camera className="size-3.5" />{plan.photos} fotos mínimas</Badge></div>}
            <Field label="Tiempo previsto" hint="Para un trabajo nuevo, la unidad quedará reservada durante este tiempo. Si ya está programado, se conserva su horario.">
              <select name="duration_hours" required defaultValue="2" className={dropdownClass}>
                <option value="1">1 hora</option>
                <option value="2">2 horas</option>
                <option value="4">4 horas</option>
                <option value="8">8 horas</option>
              </select>
            </Field>
            <p className="flex items-start gap-2 rounded-xl bg-canvas p-3 text-[13px] leading-relaxed text-ink-2"><Wrench className="mt-0.5 size-4 shrink-0" />El primer paso pide comprobar el manual correspondiente al modelo y serie de esta unidad.</p>
          </div>
        )}
      </fieldset>
      <div className="rounded-2xl bg-canvas p-4 text-[13px] leading-relaxed text-ink-2">
        <p><span className="font-medium">Inicias como:</span> {responsibleName}</p>
        <p className="mt-1">Al empezar se abre el primer paso pendiente. Si ya hay una revisión abierta para este trabajo, la retomas sin crear otra. El avance se guarda al completar cada punto.</p>
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending || !ready} className={buttonClass("primary", "lg") + " w-full"}>
        <Play className="size-4" />{pending ? "Abriendo checklist…" : "Empezar revisión"}
      </button>
    </form>
  );
}
