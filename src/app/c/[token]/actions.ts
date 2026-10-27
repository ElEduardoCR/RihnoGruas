"use server";

import { after } from "next/server";
import { getAdminDb } from "@/lib/db";
import { answerItem, completeInspection, startInspection, uploadItemPhoto, type PhotoRef } from "@/lib/services/inspections";
import { verifyInspectionPhotos } from "@/lib/agent/vision-check";
import { toWizardItem, type WizardItem } from "./types";

// El wizard se abre desde un enlace con token (sin sesión): todo pasa por el token.

export async function startAction(token: string, coords: { lat: number; lng: number } | null) {
  const db = getAdminDb();
  await startInspection(db, token, { lat: coords?.lat ?? null, lng: coords?.lng ?? null });
  return { ok: true };
}

/** Sube una foto en cuanto se toma. */
export async function uploadPhotoAction(token: string, itemId: string, fd: FormData): Promise<{ ok: true; photo: PhotoRef } | { ok: false; error: string }> {
  try {
    const photo = fd.get("photo");
    if (!(photo instanceof Blob) || photo.size === 0) return { ok: false, error: "No se recibió la foto." };
    const takenAt = fd.get("takenAt");
    const ref = await uploadItemPhoto(getAdminDb(), token, itemId, {
      bytes: new Uint8Array(await photo.arrayBuffer()),
      contentType: photo.type || "image/jpeg",
      hash: String(fd.get("hash") ?? ""),
      takenAt: typeof takenAt === "string" && takenAt ? takenAt : null,
    });
    return { ok: true, photo: ref };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo subir la foto" };
  }
}

export async function saveStepAction(
  token: string,
  itemId: string,
  input: { passed: boolean | null; value: string; notes: string; shownAt: string; photos: PhotoRef[]; manualConfirmed?: boolean },
): Promise<{ ok: true; item: WizardItem } | { ok: false; error: string }> {
  try {
    const value = input.value.trim();
    const item = await answerItem(getAdminDb(), token, itemId, {
      passed: input.passed,
      valueNumber: value !== "" && !Number.isNaN(Number(value)) ? Number(value) : null,
      valueText: value || null,
      notes: input.notes || null,
      shownAt: input.shownAt,
      photos: input.photos,
      manualConfirmed: input.manualConfirmed,
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
