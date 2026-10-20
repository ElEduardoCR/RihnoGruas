import type { Db } from "@/lib/db/types";
import { env, hasOpenAI } from "@/lib/env";
import { addDays, dayKey } from "@/lib/time";
import { runAgent } from "./run";

/**
 * Conjunto base de evaluación (la guía recomienda 20+ casos con respuesta
 * esperada). Verifica que el agente elija la herramienta correcta y que la
 * respuesta contenga el dato clave. Los casos están escritos contra los datos
 * de demostración; ajústalos a la operación real.
 */
export interface EvalCase {
  id: string;
  input: string;
  tools: string[] | "none"; // al menos una de estas debe llamarse
  include?: RegExp;
  asksConfirmation?: boolean;
}

export function evalCases(now: Date): EvalCase[] {
  const d = (n: number) => dayKey(addDays(now, n));
  return [
    { id: "flota-estado", input: "¿Cómo está la flota hoy?", tools: ["consultar_flota"], include: /RH-06/ },
    { id: "flota-detenidas", input: "¿Qué grúas están detenidas?", tools: ["consultar_flota"], include: /RH-06/ },
    { id: "disp-titan", input: "¿Qué titán tengo libre pasado mañana?", tools: ["buscar_disponibilidad"] },
    { id: "disp-capacidad", input: `Necesito una grúa de al menos 60 toneladas del ${d(12)} al ${d(13)}`, tools: ["buscar_disponibilidad"], include: /RH-(05|07|10)/ },
    { id: "docs-vencen", input: "¿Qué documentos vencen en los próximos 30 días?", tools: ["documentos_por_vencer"], include: /RH-03/ },
    { id: "docs-grua", input: "¿Cuándo vence el seguro de la RH-03?", tools: ["consultar_grua", "documentos_por_vencer"], include: /RH-03/ },
    { id: "operadores-grove", input: "¿Quiénes pueden operar la Grove?", tools: ["consultar_grua", "consultar_operadores"], include: /Ram[oó]n|Jorge|H[eé]ctor/ },
    { id: "inv-aceite", input: "¿Cuánto aceite hidráulico tenemos?", tools: ["consultar_inventario"], include: /\d/ },
    { id: "inv-pendientes", input: "¿Hay salidas de almacén pendientes de autorizar?", tools: ["alertas_inventario"], include: /llanta|11R22/i },
    { id: "inv-sospechoso", input: "¿Hubo algún movimiento sospechoso en el almacén?", tools: ["alertas_inventario"], include: /RH-03|horario/i },
    { id: "gastos-mes", input: "¿Cuánto llevamos gastado este mes?", tools: ["resumen_gastos"], include: /\$/ },
    { id: "gastos-categoria", input: "¿En qué categoría gastamos más este mes?", tools: ["resumen_gastos"] },
    { id: "revisiones-pend", input: "¿Qué revisiones están pendientes?", tools: ["estado_revisiones"], include: /RH-0/ },
    { id: "revision-rh07", input: "¿Cómo salió la última revisión de la RH-07?", tools: ["estado_revisiones", "consultar_grua"], include: /RH-07/ },
    { id: "politica-monto", input: "¿Qué pasa si saco una refacción de más de 5 mil pesos?", tools: ["buscar_politica"], include: /autoriz/i },
    { id: "politica-licencia", input: "¿Un operador con licencia vencida puede operar una grúa?", tools: ["buscar_politica", "consultar_operadores"], include: /\bno\b/i },
    { id: "agenda-semana", input: "¿Qué hay en la agenda de los próximos 7 días?", tools: ["consultar_agenda"] },
    { id: "crear-renta", input: `Rentale la RH-04 a Constructora Altavista del ${d(12)} al ${d(14)}`, tools: ["crear_renta"], asksConfirmation: true },
    { id: "renta-detenida", input: `Rentale la RH-06 a Desarrollos Cumbre el ${d(1)}`, tools: ["crear_renta", "buscar_disponibilidad", "consultar_grua", "consultar_flota"], include: /detenid|no (está|esta) disponible|no puede/i },
    { id: "detencion", input: "Reporta la RH-05 detenida por fuga de aceite en el motor", tools: ["reportar_detencion"], asksConfirmation: true },
    { id: "salida", input: "Saca 20 litros de aceite hidráulico ISO 68 para la RH-02, es para relleno del sistema", tools: ["registrar_salida_almacen"], asksConfirmation: true },
    { id: "programar-revision", input: `Programa una revisión total para la RH-09 el ${d(2)} a las 10:00`, tools: ["programar_revision"], asksConfirmation: true },
    { id: "saludo", input: "hola", tools: "none" },
    { id: "tarifa", input: "¿Cuánto cobramos por día un titán?", tools: ["buscar_politica", "consultar_flota", "consultar_grua", "buscar_disponibilidad"], include: /14,?500|15,?500|22,?000/ },
  ];
}

export interface EvalResult {
  id: string;
  input: string;
  passed: boolean;
  reasons: string[];
  toolsCalled: string[];
  reply: string;
}

export async function runEvals(db: Db, phone: string, now = new Date()) {
  const cases = evalCases(now);
  const results: EvalResult[] = [];
  const batch = 4;
  for (let i = 0; i < cases.length; i += batch) {
    const chunk = cases.slice(i, i + batch);
    const out = await Promise.all(
      chunk.map(async (c) => {
        const r = await runAgent(db, { phone, text: c.input, trigger: "eval", now });
        const called = r.toolCalls.map((t) => t.name);
        const reasons: string[] = [];
        if (c.tools === "none") {
          if (called.length) reasons.push(`No debía usar herramientas (usó ${called.join(", ")})`);
        } else if (!c.tools.some((t) => called.includes(t))) {
          reasons.push(`Esperaba ${c.tools.join(" o ")}; usó ${called.join(", ") || "ninguna"}`);
        }
        if (c.include && !c.include.test(r.reply)) reasons.push(`La respuesta no contiene ${c.include}`);
        if (c.asksConfirmation && !/\bS[ÍI]\b/.test(r.reply)) reasons.push("No pidió confirmación");
        return { id: c.id, input: c.input, passed: reasons.length === 0, reasons, toolsCalled: called, reply: r.reply };
      }),
    );
    results.push(...out);
  }
  const passed = results.filter((r) => r.passed).length;
  const summary = { total: results.length, passed, accuracy: Math.round((passed / results.length) * 100), model: hasOpenAI ? env.openaiModel : "reglas" };
  await db.insert("agent_runs", {
    trigger: "eval",
    phone,
    staff_id: null,
    input: `Evaluación (${results.length} casos)`,
    output: `${summary.accuracy}% (${passed}/${results.length}) · ${summary.model}`,
    model: summary.model,
    tool_calls: results.map((r) => ({ name: r.id, args: r.input, result: { passed: r.passed, reasons: r.reasons, tools: r.toolsCalled, reply: r.reply }, ms: 0 })),
    tokens_in: null,
    tokens_out: null,
    latency_ms: null,
    error: null,
    rating: null,
  });
  return { summary, results };
}
