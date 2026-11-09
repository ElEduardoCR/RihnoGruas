import type { ReadTool } from "./tools";
import { ToolError } from "./tool-error";
import { getConversationMemory } from "./memory";

export const MEMORY_TOOLS: ReadTool[] = [{
  kind: "read", name: "consultar_memoria",
  description: "Recupera conversaciones anteriores del chat web de esta misma persona. Sin consulta ni ID lista resúmenes guardados; consulta busca texto literal en originales, tolerando acentos; conversacion_id abre los mensajes originales de un ID devuelto. Sólo lee memoria: nunca autoriza ni ejecuta acciones. Si hasMore, continúa con nextOffset antes de afirmar que falta un dato. Un resumen parcial no sustituye los originales.",
  parameters: {
    type: "object", additionalProperties: false, required: ["consulta", "conversacion_id", "desplazamiento", "limite"],
    properties: {
      consulta: { type: ["string", "null"], description: "Texto literal a buscar en conversaciones propias; null para listar o abrir." },
      conversacion_id: { type: ["string", "null"], description: "ID devuelto por esta herramienta para abrir originales; null para listar o buscar." },
      desplazamiento: { type: ["integer", "null"], description: "nextOffset de la página anterior o 0/null para iniciar. Conservar los demás filtros al continuar." },
      limite: { type: ["integer", "null"], description: "Máximo de resultados de 1 a 10; null usa 5. Los mensajes originales se entregan completos." },
    },
  },
  async run(args, { db, staff }) {
    if (args.consulta != null && typeof args.consulta !== "string") throw new ToolError("Indica un texto de búsqueda válido.");
    if (args.conversacion_id != null && typeof args.conversacion_id !== "string") throw new ToolError("Indica un ID de conversación válido.");
    if (args.consulta && args.conversacion_id) throw new ToolError("Busca por texto o abre un ID de conversación, una opción a la vez.");
    if (args.desplazamiento != null && typeof args.desplazamiento !== "number") throw new ToolError("Indica un desplazamiento numérico.");
    if (args.limite != null && typeof args.limite !== "number") throw new ToolError("Indica un límite numérico.");
    if (typeof args.limite === "number" && (!Number.isInteger(args.limite) || args.limite < 1 || args.limite > 10)) throw new ToolError("El límite de memoria debe ser de 1 a 10.");
    try {
      return await getConversationMemory(db, staff, { query: args.consulta as string | null, conversationId: args.conversacion_id as string | null, offset: args.desplazamiento as number | undefined ?? undefined, limit: args.limite as number | undefined ?? 5 });
    } catch (error) {
      throw new ToolError(error instanceof Error ? error.message : "No pude recuperar esa memoria.");
    }
  },
}];
