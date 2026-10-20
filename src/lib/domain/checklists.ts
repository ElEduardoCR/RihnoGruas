import type {
  ChecklistTemplateItem,
  Crane,
  CraneChecklistItem,
  CraneDocument,
  Downtime,
  InspectionItem,
  MaintenanceOrder,
  Rental,
} from "@/lib/types";
import { DOC_LABELS } from "@/lib/labels";
import { daysUntil, fmt } from "@/lib/time";

export type DraftItem = Omit<InspectionItem, "id" | "inspection_id" | "created_at">;

// Función (no objeto) para que cada punto tenga sus propios arreglos
const blank = () => ({
  value_text: null,
  value_number: null,
  passed: null,
  notes: null,
  photo_paths: [],
  photo_hashes: [],
  photo_taken_at: null,
  shown_at: null,
  answered_at: null,
  seconds_spent: null,
  flags: [],
}) satisfies Partial<DraftItem>;

export interface FocusItem {
  section: string;
  title: string;
  instructions: string;
  reason: string;
  critical?: boolean;
  response_type?: "ok_falla" | "numero" | "texto";
  unit?: string;
  photo_hint?: string;
  min_photos?: number;
}

/**
 * Puntos de atención que el agente agrega a la revisión según el historial de la grúa.
 * Son reglas deterministas (no dependen del LLM) para que la revisión sea predecible.
 */
export function deriveFocusItems(input: {
  crane: Crane;
  now: Date;
  rental?: Pick<Rental, "start_at" | "end_at" | "site_notes"> | null;
  documents: CraneDocument[];
  lastFailedItems: Pick<InspectionItem, "title" | "notes" | "answered_at">[];
  recentMaintenance: MaintenanceOrder[];
  recentDowntimes: Downtime[];
}): FocusItem[] {
  const { crane, now, rental, documents } = input;
  const out: FocusItem[] = [];

  for (const f of input.lastFailedItems) {
    out.push({
      section: "Seguimiento",
      title: `Reverificar: ${f.title}`,
      instructions: `Falló en la revisión anterior${f.answered_at ? ` (${fmt.short(f.answered_at)})` : ""}${
        f.notes ? `: "${f.notes}"` : ""
      }. Confirma que ya fue corregido.`,
      reason: "Falla en revisión anterior",
      critical: true,
      photo_hint: "Foto del punto corregido",
    });
  }

  for (const m of input.recentMaintenance.filter((m) => m.kind === "correctivo" && m.status === "completado")) {
    out.push({
      section: "Seguimiento",
      title: `Validar reparación: ${m.title}`,
      instructions: "Revisa que la reparación reciente no presente fugas, holguras ni ruidos anormales.",
      reason: `Correctivo completado ${m.completed_at ? fmt.short(m.completed_at) : "recientemente"}`,
      photo_hint: "Foto de la zona reparada",
    });
  }

  for (const d of input.recentDowntimes) {
    out.push({
      section: "Seguimiento",
      title: `Causa de detención resuelta: ${d.reason}`,
      instructions: "La grúa estuvo detenida por esta causa. Verifica en sitio que quedó resuelta.",
      reason: `Detención del ${fmt.short(d.started_at)}`,
      critical: true,
      photo_hint: "Foto de la zona que causó la detención",
    });
  }

  const used = crane.hour_meter - crane.last_service_hours;
  if (used >= crane.service_interval_hours * 0.85) {
    out.push({
      section: "Servicio",
      title: "Servicio preventivo próximo",
      instructions: `Horómetro ${Math.round(crane.hour_meter)} h · ${Math.round(used)} de ${crane.service_interval_hours} h desde el último servicio. Revisa niveles, filtros y engrase con especial cuidado.`,
      reason: "Horas de uso cerca del intervalo de servicio",
      photo_hint: "Foto de filtros y niveles",
    });
  }

  const coverUntil = rental ? new Date(rental.end_at) : now;
  for (const doc of documents) {
    if (!doc.expires_on) continue;
    const left = daysUntil(doc.expires_on, now);
    const expiresDuring = new Date(doc.expires_on) < coverUntil;
    if (left <= 30 || expiresDuring) {
      out.push({
        section: "Documentación",
        title: `Vigencia de ${DOC_LABELS[doc.doc_type]}`,
        instructions:
          left < 0
            ? `VENCIDO desde ${fmt.date(doc.expires_on)}. No debe salir a renta sin documento vigente.`
            : `Vence el ${fmt.date(doc.expires_on)} (${left} días)${expiresDuring ? ", antes de que termine la renta" : ""}. Confirma que el original a bordo coincide.`,
        reason: "Documento por vencer",
        critical: left < 0 || expiresDuring,
        photo_hint: "Foto del documento a bordo",
      });
    }
  }

  if (rental?.site_notes) {
    out.push({
      section: "Maniobra",
      title: "Condiciones del sitio de la renta",
      instructions: `Notas del cliente: "${rental.site_notes}". Verifica que la configuración, accesorios y contrapesos son los adecuados.`,
      reason: "Requerimiento específico de la renta",
      response_type: "texto",
      photo_hint: "Foto de accesorios preparados",
    });
  }

  return out;
}

/** Une plantilla + puntos propios de la grúa + puntos del agente en una revisión ordenada. */
export function composeInspectionItems(
  templateItems: ChecklistTemplateItem[],
  craneItems: CraneChecklistItem[],
  focus: FocusItem[],
): DraftItem[] {
  const items: DraftItem[] = [];
  let pos = 0;

  for (const f of focus) {
    items.push({
      ...blank(),
      position: pos++,
      section: f.section,
      title: f.title,
      instructions: f.instructions,
      response_type: f.response_type ?? "ok_falla",
      unit: f.unit ?? null,
      min_value: null,
      max_value: null,
      requires_photo: true,
      min_photos: f.min_photos ?? 1,
      photo_hint: f.photo_hint ?? null,
      critical: f.critical ?? false,
      source: "agente",
      source_reason: f.reason,
    });
  }

  for (const t of [...templateItems].sort((a, b) => a.position - b.position)) {
    items.push({
      ...blank(),
      position: pos++,
      section: t.section,
      title: t.title,
      instructions: t.instructions,
      response_type: t.response_type,
      unit: t.unit,
      min_value: t.min_value,
      max_value: t.max_value,
      requires_photo: t.requires_photo,
      min_photos: t.min_photos,
      photo_hint: t.photo_hint,
      critical: t.critical,
      source: "plantilla",
      source_reason: null,
    });
  }

  for (const c of craneItems.filter((c) => c.active)) {
    items.push({
      ...blank(),
      position: pos++,
      section: c.section,
      title: c.title,
      instructions: c.instructions,
      response_type: c.response_type,
      unit: c.unit,
      min_value: null,
      max_value: null,
      requires_photo: c.requires_photo,
      min_photos: c.min_photos,
      photo_hint: c.photo_hint,
      critical: c.critical,
      source: "grua",
      source_reason: c.reason,
    });
  }

  return items;
}

/** Calidad del llenado: penaliza respuestas apresuradas, fotos repetidas o viejas. */
export function scoreInspection(items: InspectionItem[]) {
  const flags = new Set<string>();
  let penalty = 0;
  for (const it of items) {
    for (const f of it.flags) {
      flags.add(f);
      penalty += FLAG_PENALTY[f] ?? 3;
    }
  }
  const answered = items.filter((i) => i.answered_at).length;
  if (answered < items.length) {
    flags.add("incompleta");
    penalty += (items.length - answered) * 5;
  }
  return { score: Math.max(0, Math.min(100, 100 - penalty)), flags: [...flags] };
}

/** Máximo de fotos por punto (cada una se comprime a ~300 KB en el teléfono). */
export const MAX_PHOTOS_PER_ITEM = 8;

export const FLAG_PENALTY: Record<string, number> = {
  respuesta_rapida: 4,
  foto_duplicada: 15,
  foto_antigua: 10,
  foto_no_coincide: 12,
  falla_sin_nota: 6,
  fuera_de_rango: 2,
};

export function inspectionResult(items: InspectionItem[]) {
  const failed = items.filter((i) => i.passed === false);
  if (failed.some((i) => i.critical)) return "rechazada" as const;
  if (failed.length > 0) return "con_observaciones" as const;
  return "aprobada" as const;
}
