import type { InspectionItem } from "@/lib/types";

export interface WizardItem {
  id: string;
  section: string;
  title: string;
  instructions: string | null;
  procedure_steps: string[];
  photo_requirements: string[];
  reference_label: string | null;
  reference_url: string | null;
  requires_manual_confirmation: boolean;
  manual_confirmed: boolean;
  response_type: InspectionItem["response_type"];
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  requires_photo: boolean;
  min_photos: number;
  photo_hint: string | null;
  critical: boolean;
  source: InspectionItem["source"];
  source_reason: string | null;
  answered: boolean;
  passed: boolean | null;
  value_number: number | null;
  value_text: string | null;
  notes: string | null;
  photos: { path: string; hash: string; takenAt: string | null; slot: number }[];
  flags: string[];
}

export function toWizardItem(i: InspectionItem): WizardItem {
  return {
    id: i.id,
    section: i.section,
    title: i.title,
    instructions: i.instructions,
    procedure_steps: i.procedure_steps ?? [],
    photo_requirements: i.photo_requirements ?? [],
    reference_label: i.reference_label ?? null,
    reference_url: i.reference_url ?? null,
    requires_manual_confirmation: i.requires_manual_confirmation ?? false,
    manual_confirmed: i.manual_confirmed ?? false,
    response_type: i.response_type,
    unit: i.unit,
    min_value: i.min_value,
    max_value: i.max_value,
    requires_photo: i.requires_photo,
    min_photos: i.min_photos,
    photo_hint: i.photo_hint,
    critical: i.critical,
    source: i.source,
    source_reason: i.source_reason,
    answered: Boolean(i.answered_at),
    passed: i.passed,
    value_number: i.value_number,
    value_text: i.value_text,
    notes: i.notes,
    // el hash viaja al cliente sólo para detectar fotos repetidas al instante
    photos: i.photo_paths.map((path, k) => ({ path, hash: i.photo_hashes[k] ?? "", takenAt: null, slot: i.photo_slots?.[k] ?? k })),
    flags: i.flags,
  };
}
