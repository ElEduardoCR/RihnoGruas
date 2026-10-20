import type { Db } from "@/lib/db/types";
import { env, hasOpenAI, isDemo } from "@/lib/env";
import { createAdminSupabase } from "@/lib/db";
import { embed } from "./llm";

interface Hit {
  titulo: string;
  fuente: string | null;
  contenido: string;
  relevancia: number;
}

const STOP = new Set(["que", "qué", "de", "la", "el", "los", "las", "para", "por", "con", "una", "un", "se", "en", "es", "y", "o", "a", "del", "al", "cuál", "cual", "como", "cómo"]);
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

/**
 * RAG sobre políticas internas. Con Supabase + OpenAI usa búsqueda vectorial
 * (pgvector, match_knowledge); en demo, coincidencia de palabras.
 * Se devuelven pocos fragmentos: más contexto irrelevante baja la precisión.
 */
export async function searchKnowledge(db: Db, question: string, k = 3): Promise<Hit[]> {
  if (!isDemo && hasOpenAI) {
    try {
      const vector = await embed(question);
      const { data, error } = await createAdminSupabase().rpc("match_knowledge", { query_embedding: vector, match_count: k });
      if (!error && data?.length) {
        return (data as { title: string; source: string | null; content: string; similarity: number }[])
          .filter((d) => d.similarity > 0.2)
          .map((d) => ({ titulo: d.title, fuente: d.source, contenido: d.content, relevancia: Math.round(d.similarity * 100) / 100 }));
      }
    } catch (e) {
      console.warn("[rag] búsqueda vectorial falló, uso palabras clave", e);
    }
  }
  const docs = await db.select("knowledge_docs");
  const q = new Set(words(question));
  return docs
    .map((d) => {
      const w = words(`${d.title} ${d.title} ${d.content}`);
      const score = w.filter((x) => q.has(x)).length / Math.max(1, q.size);
      return { titulo: d.title, fuente: d.source, contenido: d.content, relevancia: Math.round(score * 100) / 100 };
    })
    .filter((h) => h.relevancia > 0)
    .sort((a, b) => b.relevancia - a.relevancia)
    .slice(0, k);
}

/** Genera embeddings faltantes (se llama desde scripts/seed.ts o /api/cron). */
export async function embedMissingKnowledge() {
  if (isDemo || !hasOpenAI) return 0;
  const sb = createAdminSupabase();
  const { data } = await sb.from("knowledge_docs").select("id,title,content").is("embedding", null);
  for (const d of data ?? []) {
    const vector = await embed(`${d.title}\n${d.content}`);
    await sb.from("knowledge_docs").update({ embedding: vector }).eq("id", d.id);
  }
  return data?.length ?? 0;
}

export const knowledgeModel = env.openaiEmbeddingModel;
