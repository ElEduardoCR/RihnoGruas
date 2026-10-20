import type { InspectionItem } from "@/lib/types";

export interface WizardItem {
  id: string;
  section: string;
  title: string;
  instructions: string | null;
  response_type: InspectionItem["response_type"];
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  requires_photo: boolean;
  photo_hint: string | null;
  critical: boolean;
  source: InspectionItem["source"];
  source_reason: string | null;
  answered: boolean;
  passed: boolean | null;
  value_number: number | null;
  value_text: string | null;
  notes: string | null;
  photo: string | null;
  flags: string[];
}

export function toWizardItem(i: InspectionItem): WizardItem {
  return {
    id: i.id,
    section: i.section,
    title: i.title,
    instructions: i.instructions,
    response_type: i.response_type,
    unit: i.unit,
    min_value: i.min_value,
    max_value: i.max_value,
    requires_photo: i.requires_photo,
    photo_hint: i.photo_hint,
    critical: i.critical,
    source: i.source,
    source_reason: i.source_reason,
    answered: Boolean(i.answered_at),
    passed: i.passed,
    value_number: i.value_number,
    value_text: i.value_text,
    notes: i.notes,
    photo: i.photo_paths[0] ?? null,
    flags: i.flags,
  };
}
