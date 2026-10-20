"use server";

import { after } from "next/server";
import { getAdminDb } from "@/lib/db";
import { answerItem, completeInspection, getInspectionByToken, startInspection } from "@/lib/services/inspections";
import { verifyInspectionPhotos } from "@/lib/agent/vision-check";
import { toWizardItem, type WizardItem } from "./types";

// El wizard se abre desde un enlace con token (sin sesión): todo pasa por el token.

export async function startAction(token: string, coords: { lat: number; lng: number } | null) {
  const db = getAdminDb();
  await startInspection(db, token, { lat: coords?.lat ?? null, lng: coords?.lng ?? null });
  return { ok: true };
}

export async function saveStepAction(token: string, itemId: string, fd: FormData): Promise<{ ok: true; item: WizardItem } | { ok: false; error: string }> {
  try {
    const db = getAdminDb();
    const data = await getInspectionByToken(db, token);
    if (!data) return { ok: false, error: "Revisión no encontrada" };
    const photo = fd.get("photo");
    let uploaded: { path: string; hash: string; takenAt: string | null } | null = null;
    if (photo instanceof Blob && photo.size > 0) {
      const hash = String(fd.get("hash") ?? "");
      if (!/^[a-f0-9]{64}$/.test(hash)) return { ok: false, error: "Foto inválida, tómala de nuevo." };
      // la foto repetida se valida antes de subirla
      if (data.items.some((i) => i.id !== itemId && i.photo_hashes.includes(hash))) {
        return { ok: false, error: "Esta foto ya se usó en otro punto. Toma una foto nueva de este punto." };
      }
      const path = `${data.inspection.id}/${itemId}-${Date.now()}.jpg`;
      await db.upload("evidencias", path, { bytes: new Uint8Array(await photo.arrayBuffer()), contentType: photo.type || "image/jpeg" });
      const takenAt = fd.get("takenAt");
      uploaded = { path, hash, takenAt: typeof takenAt === "string" && takenAt ? takenAt : null };
    }
    const passedRaw = fd.get("passed");
    const value = fd.get("value");
    const item = await answerItem(db, token, itemId, {
      passed: passedRaw === "true" ? true : passedRaw === "false" ? false : null,
      valueNumber: typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)) ? Number(value) : null,
      valueText: typeof value === "string" && value.trim() !== "" ? value.trim() : null,
      notes: (fd.get("notes") as string) || null,
      shownAt: String(fd.get("shownAt") ?? new Date().toISOString()),
      photo: uploaded,
    });
    return { ok: true, item: toWizardItem(item) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar" };
  }
}

export async function completeAction(token: string, signature: string, hourMeter: number | null) {
  try {
    const db = getAdminDb();
    const insp = await completeInspection(db, token, { signatureName: signature, hourMeter });
    // Verificación de fotos con IA en segundo plano (no bloquea al operador)
    after(() => verifyInspectionPhotos(getAdminDb(), insp.id).catch((e) => console.error("[vision]", e)));
    return { ok: true as const, result: insp.result, score: insp.quality_score, flags: insp.quality_flags };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "No se pudo cerrar la revisión" };
  }
}
