import type { Db } from "@/lib/db/types";
import { hasOpenAI } from "@/lib/env";
import { scoreInspection } from "@/lib/domain/checklists";
import { vision } from "./llm";

const MAX_CHECKS = 8; // puntos
const MAX_IMAGES = 16; // fotos en total por revisión

/**
 * Revisa con visión que cada foto corresponda al punto que dice evidenciar
 * (p. ej. que "foto del manómetro del extintor" realmente muestre un manómetro).
 * Prioriza puntos críticos. Si no coincide, marca el punto y recalcula la calidad.
 */
export async function verifyInspectionPhotos(db: Db, inspectionId: string) {
  if (!hasOpenAI) return { checked: 0, mismatches: 0 };
  const items = await db.select("inspection_items", { eq: { inspection_id: inspectionId } });
  const candidates = items
    .filter((i) => i.photo_paths.length && !i.flags.includes("foto_no_coincide"))
    .sort((a, b) => Number(b.critical) - Number(a.critical))
    .slice(0, MAX_CHECKS);

  let mismatches = 0;
  let budget = MAX_IMAGES;
  for (const it of candidates) {
    // Un punto puede tener varias fotos (p. ej. los 4 lados): se revisan todas, con tope global
    let verdict: { coincide: boolean; confianza: number; motivo: string } | null = null;
    for (const [k, path] of it.photo_paths.entries()) {
      if (budget-- <= 0) break;
      const file = await db.download("evidencias", path);
      if (!file || !file.contentType.startsWith("image/") || file.contentType.includes("svg")) continue;
      const dataUrl = `data:${file.contentType};base64,${Buffer.from(file.bytes).toString("base64")}`;
      const v = await checkPhoto(it.title, it.photo_hint, dataUrl, k + 1, it.photo_paths.length);
      if (!v.coincide && v.confianza >= 0.7) {
        verdict = { ...v, motivo: it.photo_paths.length > 1 ? `foto ${k + 1}: ${v.motivo}` : v.motivo };
        break;
      }
    }
    if (verdict) {
      mismatches++;
      await db.update("inspection_items", it.id, {
        flags: [...it.flags, "foto_no_coincide"],
        notes: [it.notes, `IA: ${verdict.motivo}`].filter(Boolean).join(" · "),
      });
    }
  }

  if (mismatches) {
    const updated = await db.select("inspection_items", { eq: { inspection_id: inspectionId } });
    const { score, flags } = scoreInspection(updated);
    await db.update("inspections", inspectionId, { quality_score: score, quality_flags: flags });
  }
  return { checked: candidates.length, mismatches };
}

function checkPhoto(title: string, hint: string | null, dataUrl: string, n: number, total: number) {
  return vision<{ coincide: boolean; confianza: number; motivo: string }>(
    "Eres inspector de seguridad de grúas. Evalúas si una foto es evidencia válida de un punto de revisión. Sé estricto con fotos genéricas, borrosas, de pantalla o que no muestran el componente.",
    `Punto de revisión: "${title}". Foto esperada: "${hint ?? title}"${total > 1 ? ` (foto ${n} de ${total}; cada foto puede mostrar una parte distinta, p. ej. un lado o un documento)` : ""}. ¿La foto muestra claramente lo que se pide?`,
    dataUrl,
    "verificacion_foto",
    {
      type: "object",
      properties: {
        coincide: { type: "boolean" },
        confianza: { type: "number", description: "0 a 1" },
        motivo: { type: "string" },
      },
      required: ["coincide", "confianza", "motivo"],
      additionalProperties: false,
    },
  );
}
