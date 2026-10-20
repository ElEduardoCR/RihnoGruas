import type { Db } from "@/lib/db/types";
import { hasOpenAI } from "@/lib/env";
import { scoreInspection } from "@/lib/domain/checklists";
import { vision } from "./llm";

const MAX_CHECKS = 8;

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
  for (const it of candidates) {
    const file = await db.download("evidencias", it.photo_paths[0]);
    if (!file || !file.contentType.startsWith("image/") || file.contentType.includes("svg")) continue;
    const dataUrl = `data:${file.contentType};base64,${Buffer.from(file.bytes).toString("base64")}`;
    const verdict = await vision<{ coincide: boolean; confianza: number; motivo: string }>(
      "Eres inspector de seguridad de grúas. Evalúas si una foto es evidencia válida de un punto de revisión. Sé estricto con fotos genéricas, borrosas, de pantalla o que no muestran el componente.",
      `Punto de revisión: "${it.title}". Foto esperada: "${it.photo_hint ?? it.title}". ¿La foto muestra claramente ese componente?`,
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
    if (!verdict.coincide && verdict.confianza >= 0.7) {
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
