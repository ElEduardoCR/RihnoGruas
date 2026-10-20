import type { Db } from "@/lib/db/types";
import type { ChecklistKind, Crane, Inspection, InspectionItem, Rental } from "@/lib/types";
import {
  MAX_PHOTOS_PER_ITEM,
  composeInspectionItems,
  deriveFocusItems,
  inspectionResult,
  scoreInspection,
  type FocusItem,
} from "@/lib/domain/checklists";
import { CHECKLIST_KIND_LABELS } from "@/lib/labels";
import { addDays, fmt } from "@/lib/time";
import { inspectionLink, raiseAlert, sendToStaff } from "./notify";

const RECENT_DAYS = 45;

/**
 * Programa una revisión personalizada para la grúa: plantilla por tipo +
 * puntos propios de la grúa + puntos derivados del historial (y los que
 * proponga el agente en `extraFocus`).
 */
export async function scheduleInspection(
  db: Db,
  input: {
    craneId: string;
    kind: ChecklistKind;
    scheduledFor: Date;
    dueBy?: Date;
    rental?: Rental | null;
    assignedTo?: string | null;
    createdBy: "web" | "agente";
    extraFocus?: FocusItem[];
    notify?: boolean;
  },
  now: Date,
): Promise<{ inspection: Inspection; items: number; focus: FocusItem[] }> {
  const crane = await db.get("cranes", input.craneId);
  if (!crane) throw new Error("Grúa no encontrada");

  const templates = await db.select("checklist_templates", { eq: { active: true } });
  const wantedKind = input.kind === "post_renta" ? "post_renta" : input.kind === "diaria" ? "diaria" : "revision_total";
  const template =
    templates.find((t) => t.kind === wantedKind && t.crane_types.includes(crane.type)) ??
    templates.find((t) => t.kind === "revision_total" && t.crane_types.includes(crane.type));
  if (!template) throw new Error(`No hay plantilla de ${wantedKind} para ${crane.type}`);

  const [templateItems, craneItems] = await Promise.all([
    db.select("checklist_template_items", { eq: { template_id: template.id } }),
    db.select("crane_checklist_items", { eq: { crane_id: crane.id, active: true } }),
  ]);

  let focus: FocusItem[] = [];
  if (input.kind !== "post_renta") {
    focus = await historyFocus(db, crane, input.rental ?? null, now);
    focus.push(...(input.extraFocus ?? []));
  }

  const assignedTo = input.assignedTo ?? input.rental?.operator_id ?? (await defaultOperator(db, crane.id));
  const inspection = await db.insert("inspections", {
    crane_id: crane.id,
    rental_id: input.rental?.id ?? null,
    template_id: template.id,
    kind: input.kind,
    title: `${CHECKLIST_KIND_LABELS[input.kind]} · ${crane.code}`,
    scheduled_for: input.scheduledFor.toISOString(),
    due_by: (input.dueBy ?? addDays(input.scheduledFor, 1)).toISOString(),
    assigned_to: assignedTo,
    status: "programada",
    created_by: input.createdBy,
    quality_flags: [],
  });

  const drafts = composeInspectionItems(templateItems, input.kind === "post_renta" ? [] : craneItems, focus);
  await db.insertMany(
    "inspection_items",
    drafts.map((d) => ({ ...d, inspection_id: inspection.id })),
  );

  if (input.notify !== false && assignedTo) {
    const op = await db.get("staff", assignedTo);
    if (op) {
      await sendToStaff(
        db,
        op,
        `🛠️ *${inspection.title}*\n${crane.name} · ${fmt.dateTime(inspection.scheduled_for)}\n` +
          `${drafts.length} puntos${focus.length ? `, ${focus.length} específicos para esta grúa` : ""}. Cada punto requiere foto (algunos piden varias).\n` +
          `Ábrela aquí cuando estés frente a la grúa: ${inspectionLink(inspection.access_token)}`,
        "sistema",
      );
    }
  }

  return { inspection, items: drafts.length, focus };
}

async function historyFocus(db: Db, crane: Crane, rental: Rental | null, now: Date) {
  const since = addDays(now, -RECENT_DAYS).toISOString();
  const [documents, lastInspections, maintenance, downtimes] = await Promise.all([
    db.select("crane_documents", { eq: { crane_id: crane.id } }),
    db.select("inspections", {
      eq: { crane_id: crane.id, status: "completada" },
      order: { column: "completed_at", ascending: false },
      limit: 1,
    }),
    db.select("maintenance_orders", { eq: { crane_id: crane.id }, gte: { scheduled_start: since } }),
    db.select("downtimes", { eq: { crane_id: crane.id }, gte: { started_at: since } }),
  ]);
  const lastFailed = lastInspections[0]
    ? (await db.select("inspection_items", { eq: { inspection_id: lastInspections[0].id, passed: false } }))
    : [];
  return deriveFocusItems({
    crane,
    now,
    rental,
    documents,
    lastFailedItems: lastFailed,
    recentMaintenance: maintenance,
    recentDowntimes: downtimes.filter((d) => d.ended_at),
  });
}

async function defaultOperator(db: Db, craneId: string) {
  const approvals = await db.select("crane_operators", { eq: { crane_id: craneId } });
  return approvals[0]?.staff_id ?? null;
}

// --------------------------------------------------------------------------
// Wizard (acceso por token enviado por WhatsApp)
// --------------------------------------------------------------------------

export async function getInspectionByToken(db: Db, token: string) {
  const rows = await db.select("inspections", { eq: { access_token: token }, limit: 1 });
  const inspection = rows[0];
  if (!inspection) return null;
  const [items, crane, assignee] = await Promise.all([
    db.select("inspection_items", { eq: { inspection_id: inspection.id }, order: { column: "position" } }),
    db.get("cranes", inspection.crane_id),
    inspection.assigned_to ? db.get("staff", inspection.assigned_to) : Promise.resolve(null),
  ]);
  return { inspection, items, crane: crane!, assignee };
}

export async function startInspection(
  db: Db,
  token: string,
  input: { lat?: number | null; lng?: number | null },
) {
  const data = await getInspectionByToken(db, token);
  if (!data) throw new Error("Revisión no encontrada");
  if (data.inspection.status === "completada" || data.inspection.status === "cancelada") return data.inspection;
  if (data.inspection.started_at) return data.inspection;
  return db.update("inspections", data.inspection.id, {
    status: "en_progreso",
    started_at: new Date().toISOString(),
    start_lat: input.lat ?? null,
    start_lng: input.lng ?? null,
  });
}

const MIN_SECONDS = 5;
const MAX_PHOTO_AGE_MS = 15 * 60_000;
const HASH_RE = /^[a-f0-9]{64}$/;

export interface PhotoRef {
  path: string;
  hash: string;
  takenAt: string | null;
}

/**
 * Sube una foto de evidencia en cuanto el operador la toma (no al final del
 * punto), para que una mala señal no haga perder varias fotos. Rechaza al
 * momento una foto que ya se usó en otro punto de la misma revisión.
 */
export async function uploadItemPhoto(
  db: Db,
  token: string,
  itemId: string,
  file: { bytes: Uint8Array; contentType: string; hash: string; takenAt: string | null },
): Promise<PhotoRef> {
  const data = await getInspectionByToken(db, token);
  if (!data) throw new Error("Revisión no encontrada");
  if (data.inspection.status === "completada") throw new Error("La revisión ya fue cerrada");
  const item = data.items.find((i) => i.id === itemId);
  if (!item) throw new Error("Punto no encontrado");
  if (!HASH_RE.test(file.hash)) throw new Error("Foto inválida, tómala de nuevo.");
  if (data.items.some((i) => i.id !== itemId && i.photo_hashes.includes(file.hash))) {
    throw new Error("Esta foto ya se usó en otro punto. Toma una foto nueva de este punto.");
  }
  const ext = file.contentType.includes("png") ? "png" : "jpg";
  const path = `${data.inspection.id}/${itemId}-${Date.now()}-${file.hash.slice(0, 8)}.${ext}`;
  await db.upload("evidencias", path, { bytes: file.bytes, contentType: file.contentType || "image/jpeg" });
  return { path, hash: file.hash, takenAt: file.takenAt };
}

export async function answerItem(
  db: Db,
  token: string,
  itemId: string,
  input: {
    passed: boolean | null;
    valueNumber: number | null;
    valueText: string | null;
    notes: string | null;
    shownAt: string;
    /** Lista final de fotos del punto (las ya guardadas que se conservan + las nuevas). */
    photos: PhotoRef[];
  },
) {
  const data = await getInspectionByToken(db, token);
  if (!data) throw new Error("Revisión no encontrada");
  if (data.inspection.status === "completada") throw new Error("La revisión ya fue cerrada");
  const item = data.items.find((i) => i.id === itemId);
  if (!item) throw new Error("Punto no encontrado");

  const now = Date.now();
  const flags = new Set<string>();
  const seconds = Math.max(0, Math.round((now - Date.parse(input.shownAt)) / 1000));
  if (seconds < MIN_SECONDS) flags.add("respuesta_rapida");

  // Fotos: las ya guardadas conservan su hash original; las nuevas deben ser de esta revisión
  const saved = new Map(item.photo_paths.map((p, i) => [p, item.photo_hashes[i]]));
  const photos = input.photos.map((p) => {
    if (saved.has(p.path)) return { ...p, hash: saved.get(p.path)!, isNew: false };
    if (!p.path.startsWith(`${data.inspection.id}/`) || !HASH_RE.test(p.hash)) throw new Error("Foto inválida, tómala de nuevo.");
    return { ...p, isNew: true };
  });
  if (photos.length > MAX_PHOTOS_PER_ITEM) throw new Error(`Máximo ${MAX_PHOTOS_PER_ITEM} fotos por punto.`);
  const needed = item.requires_photo ? Math.max(1, item.min_photos) : 0;
  if (photos.length < needed) {
    throw new Error(needed === 1 ? "Este punto requiere foto" : `Este punto requiere ${needed} fotos (llevas ${photos.length}).`);
  }
  const hashes = photos.map((p) => p.hash);
  if (new Set(hashes).size !== hashes.length) throw new Error("Repetiste la misma foto en este punto. Toma una diferente.");
  if (data.items.some((i) => i.id !== itemId && i.photo_hashes.some((h) => hashes.includes(h)))) {
    throw new Error("Una de las fotos ya se usó en otro punto. Toma una foto nueva de este punto.");
  }
  const startedAt = Date.parse(data.inspection.started_at ?? data.inspection.created_at);
  for (const p of photos.filter((x) => x.isNew)) {
    // misma foto usada en revisiones anteriores → se marca
    if (await findHashElsewhere(db, p.hash, data.inspection.id)) flags.add("foto_duplicada");
    if (p.takenAt && Date.parse(p.takenAt) < startedAt - MAX_PHOTO_AGE_MS) flags.add("foto_antigua");
  }
  // Si se conservaron todas las fotos anteriores, se conservan sus señales
  const keptAll = item.photo_paths.length > 0 && item.photo_paths.every((path) => photos.some((p) => p.path === path));
  if (keptAll) for (const f of item.flags) if (f === "foto_duplicada" || f === "foto_antigua" || f === "foto_no_coincide") flags.add(f);

  if (item.response_type === "ok_falla" && input.passed === null) throw new Error("Indica si el punto está OK o tiene falla");
  if (item.response_type === "numero" && (input.valueNumber == null || Number.isNaN(input.valueNumber))) {
    throw new Error("Escribe la lectura");
  }
  let passed = input.passed;
  if (item.response_type === "numero") {
    const out =
      (item.min_value != null && input.valueNumber! < item.min_value) ||
      (item.max_value != null && input.valueNumber! > item.max_value);
    if (out) flags.add("fuera_de_rango");
    passed = !out;
  }
  if (item.response_type === "texto") passed = true;
  if (passed === false && !input.notes?.trim()) throw new Error("Describe la falla encontrada");

  const takenTimes = photos.map((p) => p.takenAt).filter((t): t is string => Boolean(t)).sort();
  return db.update("inspection_items", itemId, {
    passed,
    value_number: input.valueNumber,
    value_text: input.valueText,
    notes: input.notes?.trim() || null,
    photo_paths: photos.map((p) => p.path),
    photo_hashes: hashes,
    photo_taken_at: takenTimes[0] ?? item.photo_taken_at,
    shown_at: input.shownAt,
    answered_at: new Date(now).toISOString(),
    seconds_spent: seconds,
    flags: [...flags],
  });
}

async function findHashElsewhere(db: Db, hash: string, inspectionId: string) {
  // Índice GIN sobre photo_hashes en Supabase
  const rows = await db.select("inspection_items", {
    contains: { photo_hashes: [hash] },
    neq: { inspection_id: inspectionId },
    limit: 1,
  });
  return rows[0] ?? null;
}

/** Cierra la revisión: resultado, calidad de llenado y decisiones automáticas. */
export async function completeInspection(db: Db, token: string, input: { signatureName: string; hourMeter: number | null }) {
  const data = await getInspectionByToken(db, token);
  if (!data) throw new Error("Revisión no encontrada");
  const { inspection, crane } = data;
  if (inspection.status === "completada") return inspection;
  const items = data.items;
  const pending = items.filter((i) => !i.answered_at);
  if (pending.length) throw new Error(`Faltan ${pending.length} puntos por contestar`);
  if (input.signatureName.trim().length < 5) throw new Error("Escribe tu nombre completo para firmar");

  const result = inspectionResult(items);
  const { score, flags } = scoreInspection(items);
  const hourMeter = input.hourMeter ?? items.find((i) => i.response_type === "numero" && i.unit === "h")?.value_number ?? null;

  const updated = await db.update("inspections", inspection.id, {
    status: "completada",
    completed_at: new Date().toISOString(),
    result,
    quality_score: score,
    quality_flags: flags,
    signature_name: input.signatureName.trim(),
    hour_meter_reading: hourMeter,
    ai_summary: summarize(items, result, score),
  });
  if (hourMeter && hourMeter > crane.hour_meter) await db.update("cranes", crane.id, { hour_meter: hourMeter });

  await afterCompletion(db, updated, items, crane);
  return updated;
}

function summarize(items: InspectionItem[], result: string, score: number) {
  const failed = items.filter((i) => i.passed === false);
  const parts = [`Resultado: ${result.replace("_", " ")}. Calidad de llenado: ${score}/100.`];
  if (failed.length) parts.push(`Fallas: ${failed.map((f) => `${f.title}${f.notes ? ` (${f.notes})` : ""}`).join("; ")}.`);
  return parts.join(" ");
}

/** Decisiones del agente al cerrar una revisión. */
async function afterCompletion(db: Db, insp: Inspection, items: InspectionItem[], crane: Crane) {
  const failed = items.filter((i) => i.passed === false);
  const critical = failed.filter((i) => i.critical);

  if (insp.result === "rechazada") {
    // 1) La grúa queda detenida automáticamente
    const open = await db.select("downtimes", { eq: { crane_id: crane.id }, isNull: ["ended_at"] });
    if (!open.length) {
      await db.insert("downtimes", {
        crane_id: crane.id,
        category: "revision_rechazada",
        reason: critical.map((c) => c.title).join(", ").slice(0, 200),
        started_at: new Date().toISOString(),
        ended_at: null,
        reported_by: insp.assigned_to,
        inspection_id: insp.id,
        notes: critical.map((c) => c.notes).filter(Boolean).join(" | ") || null,
      });
    }
    await raiseAlert(db, {
      dedupe_key: `checklist:rechazada:${insp.id}`,
      topic: "checklists",
      severity: "critica",
      title: `${crane.code} rechazada en revisión`,
      body: `${critical.map((c) => `• ${c.title}${c.notes ? `: ${c.notes}` : ""}`).join("\n")}\nLa grúa quedó *detenida* automáticamente. ${
        insp.rental_id ? "Tiene renta asociada: hay que reprogramar o buscar sustituta." : ""
      }`,
      crane_id: crane.id,
    });
  } else if (failed.length) {
    await raiseAlert(db, {
      dedupe_key: `checklist:observaciones:${insp.id}`,
      topic: "checklists",
      severity: "aviso",
      title: `${crane.code} con observaciones`,
      body: failed.map((f) => `• ${f.title}${f.notes ? `: ${f.notes}` : ""}`).join("\n"),
      crane_id: crane.id,
    });
  }

  if ((insp.quality_score ?? 100) < 70) {
    await raiseAlert(db, {
      dedupe_key: `checklist:calidad:${insp.id}`,
      topic: "checklists",
      severity: "aviso",
      title: `Revisión de ${crane.code} llenada sin cuidado`,
      body: `Calidad ${insp.quality_score}/100 (${insp.quality_flags.join(", ")}). Por política debe repetirse con supervisión del jefe de taller.`,
      crane_id: crane.id,
    });
  }
}

export async function listInspections(db: Db, from: Date) {
  const [inspections, cranes, staff] = await Promise.all([
    db.select("inspections", { gte: { scheduled_for: from.toISOString() }, order: { column: "scheduled_for", ascending: false } }),
    db.select("cranes"),
    db.select("staff"),
  ]);
  const cm = new Map(cranes.map((c) => [c.id, c]));
  const sm = new Map(staff.map((s) => [s.id, s]));
  return inspections.map((i) => ({ ...i, crane: cm.get(i.crane_id)!, assignee: i.assigned_to ? sm.get(i.assigned_to) ?? null : null }));
}

/** Marca como vencidas las revisiones que pasaron su fecha límite. */
export async function expireOverdue(db: Db, now: Date) {
  const overdue = await db.select("inspections", {
    in: { status: ["programada", "en_progreso"] },
    lt: { due_by: now.toISOString() },
  });
  for (const i of overdue) await db.update("inspections", i.id, { status: "vencida" });
  return overdue;
}
