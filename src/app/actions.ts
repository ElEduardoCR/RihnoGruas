"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminDb, getDb } from "@/lib/db";
import { currentStaff } from "@/lib/auth";
import { createRental, cancelRental, RentalError } from "@/lib/services/rentals";
import { scheduleInspection } from "@/lib/services/inspections";
import { completeMaintenance, releaseCrane, reportDowntime, scheduleMaintenance, repeatMaintenanceChecklist } from "@/lib/services/maintenance";
import { registerCount, registerPurchase, requestIssue, resolveMovement } from "@/lib/services/inventory";
import { runAgent } from "@/lib/agent/run";
import { runProactiveScan, sendDailyBrief } from "@/lib/agent/proactive";
import { fmt, zonedDate } from "@/lib/time";
import type { DowntimeCategory, PurchaseCategory } from "@/lib/types";
import { isDemo } from "@/lib/env";
import { createUserSupabase } from "@/lib/db";

export type FormState = { ok: boolean; message: string; details?: string[]; checklistUrl?: string } | null;

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const numOf = (f: FormData, k: string) => {
  const v = str(f, k);
  return v == null ? null : Number(v.replace(/[$,\s]/g, ""));
};
/** "2026-10-17T07:00" (hora local CDMX) → Date */
const localDate = (v: string | null) => {
  if (!v) return null;
  const [d, t = "00:00"] = v.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [h, min] = t.split(":").map(Number);
  return zonedDate(y, m, day, h, min);
};
const fail = (e: unknown): FormState => ({ ok: false, message: e instanceof Error ? e.message : "Error inesperado" });

function refresh() {
  revalidatePath("/", "layout");
}

export async function createRentalAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const db = await getDb();
    const now = new Date();
    const start = localDate(str(f, "start"));
    const end = localDate(str(f, "end"));
    if (!start || !end) return { ok: false, message: "Indica inicio y fin de la renta." };
    const r = await createRental(
      db,
      {
        craneId: str(f, "crane_id")!,
        clientId: str(f, "client_id"),
        clientName: str(f, "client_name"),
        operatorId: str(f, "operator_id"),
        start,
        end,
        siteAddress: str(f, "site_address"),
        siteNotes: str(f, "site_notes"),
        rate: numOf(f, "rate"),
        createdBy: "web",
      },
      now,
    );
    refresh();
    return {
      ok: true,
      message: `Renta creada. Rhino programó la revisión total para ${fmt.dateTime(r.inspections.pre.scheduled_for)} (${r.inspections.preItems} puntos, ${r.inspections.focus.length} personalizados) y la recepción post-renta.`,
      details: r.warnings,
    };
  } catch (e) {
    if (e instanceof RentalError) return { ok: false, message: e.message };
    return fail(e);
  }
}

export async function cancelRentalAction(id: string) {
  const db = await getDb();
  await cancelRental(db, id);
  refresh();
}

export async function reportDowntimeAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const db = await getDb();
    const me = await currentStaff(db);
    const r = await reportDowntime(
      db,
      { craneId: str(f, "crane_id")!, category: (str(f, "category") ?? "otro") as DowntimeCategory, reason: str(f, "reason") ?? "Sin detalle", reportedBy: me?.id ?? null },
      new Date(),
    );
    refresh();
    return { ok: true, message: `${r.crane.code} marcada como detenida.`, details: r.affected.length ? [`${r.affected.length} renta(s) afectada(s). Rhino avisó a Dirección.`] : [] };
  } catch (e) {
    return fail(e);
  }
}

export async function releaseCraneAction(craneId: string) {
  const db = await getDb();
  await releaseCrane(db, craneId, "Liberada desde la web", new Date());
  refresh();
}

export async function scheduleInspectionAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const db = await getDb();
    const when = localDate(str(f, "scheduled_for"));
    if (!when) return { ok: false, message: "Indica fecha y hora." };
    const r = await scheduleInspection(
      db,
      { craneId: str(f, "crane_id")!, kind: (str(f, "kind") ?? "revision_total") as "revision_total", scheduledFor: when, assignedTo: str(f, "assigned_to"), createdBy: "web" },
      new Date(),
    );
    refresh();
    return { ok: true, message: `Revisión programada con ${r.items} puntos (${r.focus.length} personalizados). Se envió el enlace al operador.` };
  } catch (e) {
    return fail(e);
  }
}

export async function scheduleMaintenanceAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const db = await getDb();
    const me = await currentStaff(db);
    if (!me || !["direccion", "administracion", "mecanico"].includes(me.role)) throw new Error("No tienes permiso para programar mantenimientos.");
    const start = localDate(str(f, "start"));
    const end = localDate(str(f, "end"));
    if (!start || !end) return { ok: false, message: "Indica inicio y fin." };
    const order = await scheduleMaintenance(db, {
      craneId: str(f, "crane_id")!,
      kind: (str(f, "kind") ?? "preventivo") as "preventivo",
      title: str(f, "title") ?? "Mantenimiento",
      description: str(f, "description"),
      start,
      end,
      mechanicId: str(f, "mechanic_id"),
      createdBy: "web",
      planId: str(f, "plan_id"),
    });
    const inspections = order.plan_id ? await db.select("inspections", { eq: { maintenance_order_id: order.id }, order: { column: "created_at", ascending: false }, limit: 1 }) : [];
    refresh();
    return { ok: true, message: inspections.length ? "Mantenimiento y checklist programados." : "Mantenimiento programado.", checklistUrl: inspections[0] ? `/c/${inspections[0].access_token}` : undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function completeMaintenanceAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const db = await getDb();
    const me = await currentStaff(db);
    if (!me || !["direccion", "administracion", "mecanico"].includes(me.role)) throw new Error("No tienes permiso para cerrar mantenimientos.");
    await completeMaintenance(db, str(f, "id")!, numOf(f, "cost") ?? 0, new Date());
    refresh();
    return { ok: true, message: "Orden cerrada." };
  } catch (e) {
    return fail(e);
  }
}

export async function repeatMaintenanceChecklistAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const db = await getDb();
    const me = await currentStaff(db);
    if (!me || !["direccion", "administracion", "mecanico"].includes(me.role)) throw new Error("No tienes permiso para repetir este checklist.");
    const inspection = await repeatMaintenanceChecklist(db, str(f, "id")!);
    if (!inspection) throw new Error("No se pudo recuperar el nuevo checklist.");
    refresh();
    return { ok: true, message: "Nuevo intento preparado. El anterior permanece en el historial.", checklistUrl: `/c/${inspection.access_token}` };
  } catch (e) { return fail(e); }
}

export async function requestIssueAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const db = await getDb();
    const me = await currentStaff(db);
    const evidence: string[] = [];
    const file = f.get("evidence");
    if (file instanceof File && file.size > 0) {
      const path = `inventario/${crypto.randomUUID()}.${file.type.includes("png") ? "png" : "jpg"}`;
      await db.upload("evidencias", path, { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type || "image/jpeg" });
      evidence.push(path);
    }
    const serials = (str(f, "serials") ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    const r = await requestIssue(
      db,
      {
        itemId: str(f, "item_id")!,
        qty: numOf(f, "qty") ?? 0,
        craneId: str(f, "crane_id"),
        reason: str(f, "reason") ?? "",
        requestedBy: me?.id ?? null,
        maintenanceOrderId: str(f, "maintenance_order_id"),
        evidencePaths: evidence,
        serialNumbers: serials,
        channel: "web",
      },
      new Date(),
    );
    refresh();
    return r.needsAuth
      ? { ok: true, message: "Salida registrada como PENDIENTE de autorización.", details: [`Motivos: ${r.flags.join(", ")}`, "Rhino notificó a quienes pueden autorizar."] }
      : { ok: true, message: "Salida aplicada al inventario.", details: r.flags.length ? [`Señales registradas: ${r.flags.join(", ")}`] : [] };
  } catch (e) {
    return fail(e);
  }
}

export async function resolveMovementAction(id: string, approve: boolean) {
  const db = await getDb();
  const me = await currentStaff(db);
  if (!me) throw new Error("Sin sesión");
  await resolveMovement(db, id, me, approve);
  refresh();
}

export async function registerPurchaseAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const db = await getDb();
    const me = await currentStaff(db);
    const itemId = str(f, "item_id");
    const qty = numOf(f, "qty");
    const total = numOf(f, "total") ?? 0;
    await registerPurchase(db, {
      supplier: str(f, "supplier") ?? "Proveedor",
      category: (str(f, "category") ?? "otros") as PurchaseCategory,
      description: str(f, "description") ?? "Compra",
      total,
      craneId: str(f, "crane_id"),
      invoiceNumber: str(f, "invoice"),
      purchasedOn: str(f, "date"),
      lines: itemId && qty ? [{ itemId, qty, unitCost: Math.round((total / qty) * 100) / 100 }] : [],
      registeredBy: me?.id ?? null,
      channel: "web",
    });
    refresh();
    return { ok: true, message: itemId ? "Compra registrada y entrada aplicada al almacén." : "Compra registrada." };
  } catch (e) {
    return fail(e);
  }
}

export async function registerCountAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const db = await getDb();
    const me = await currentStaff(db);
    const r = await registerCount(db, { itemId: str(f, "item_id")!, countedQty: numOf(f, "counted") ?? 0, countedBy: me?.id ?? null, notes: str(f, "notes") });
    refresh();
    return { ok: true, message: r.variance === 0 ? "Conteo cuadra con el sistema." : `Diferencia de ${r.variance > 0 ? "+" : ""}${r.variance}. Se ajustó el inventario y se notificó si supera 5 %.` };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Agente
// ---------------------------------------------------------------------------

export async function agentChatAction(input: { staffId: string; text: string }) {
  // El simulador usa el mismo camino que WhatsApp, con el teléfono del empleado elegido.
  const db = isDemo ? await getDb() : getAdminDb();
  const me = await currentStaff(await getDb());
  if (!me || !["direccion", "administracion"].includes(me.role)) throw new Error("Sólo Dirección/Administración pueden usar el simulador");
  const staff = await db.get("staff", input.staffId);
  if (!staff?.phone) throw new Error("Ese empleado no tiene teléfono registrado");
  const res = await runAgent(db, { phone: staff.phone, text: input.text, trigger: "web" });
  refresh();
  return res;
}

export async function runScanAction(): Promise<FormState> {
  const db = isDemo ? await getDb() : getAdminDb();
  const r = await runProactiveScan(db, new Date());
  refresh();
  return { ok: true, message: `Escaneo listo: ${r.insights} hallazgos, ${r.newAlerts} alertas nuevas enviadas.` };
}

export async function sendBriefAction(): Promise<FormState> {
  const db = isDemo ? await getDb() : getAdminDb();
  const r = await sendDailyBrief(db, new Date());
  refresh();
  return { ok: true, message: `Resumen enviado a ${r.sent} persona(s).` };
}

export async function signOutAction() {
  if (!isDemo) {
    const supabase = await createUserSupabase();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

export async function loadConversationAction(staffId: string) {
  const db = await getDb();
  const me = await currentStaff(db);
  if (!me || !["direccion", "administracion"].includes(me.role)) throw new Error("Sin permiso");
  const staff = await db.get("staff", staffId);
  if (!staff?.phone) return [];
  const msgs = await db.select("wa_messages", { eq: { phone: staff.phone }, order: { column: "created_at", ascending: false }, limit: 40 });
  return msgs.reverse().map((m) => ({ id: m.id, direction: m.direction, body: m.body, kind: m.kind, created_at: m.created_at }));
}

export async function runEvalsAction() {
  const db = isDemo ? await getDb() : getAdminDb();
  const me = await currentStaff(await getDb());
  if (!me || !["direccion", "administracion"].includes(me.role)) throw new Error("Sin permiso");
  const director = (await db.select("staff", { eq: { role: "direccion", active: true }, limit: 1 }))[0];
  if (!director?.phone) throw new Error("Registra un teléfono para Dirección");
  const { runEvals } = await import("@/lib/agent/evals");
  const r = await runEvals(db, director.phone);
  refresh();
  return r;
}

/** Alta o renovación de un documento del expediente (con archivo PDF/imagen). */
export async function saveDocumentAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const db = await getDb();
    const craneId = str(f, "crane_id");
    if (!craneId) return { ok: false, message: "Falta la grúa." };
    let filePath: string | undefined;
    const file = f.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > 4 * 1024 * 1024) return { ok: false, message: "El archivo pesa más de 4 MB." };
      const ext = file.type === "application/pdf" ? "pdf" : file.type.includes("png") ? "png" : "jpg";
      filePath = `${craneId}/${crypto.randomUUID()}.${ext}`;
      await db.upload("documentos", filePath, { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type || "application/octet-stream" });
    }
    const fields = {
      number: str(f, "number"),
      issuer: str(f, "issuer"),
      issued_on: str(f, "issued_on"),
      expires_on: str(f, "expires_on"),
      coverage: str(f, "coverage"),
      ...(filePath ? { file_path: filePath } : {}),
    };
    const id = str(f, "doc_id");
    if (id) {
      // En una renovación sólo se cambia lo que se capturó (no se borran fechas ni folios)
      const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null));
      await db.update("crane_documents", id, patch);
    } else {
      const docType = (str(f, "doc_type") ?? "otro") as import("@/lib/types").DocType;
      await db.insert("crane_documents", {
        crane_id: craneId,
        doc_type: docType,
        title: str(f, "title") ?? "Documento",
        amount: null,
        notes: null,
        file_path: null,
        ...fields,
      });
    }
    refresh();
    return { ok: true, message: id ? "Documento renovado." : "Documento agregado al expediente." };
  } catch (e) {
    return fail(e);
  }
}
