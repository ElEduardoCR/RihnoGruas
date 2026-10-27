import type { ToolCallLog } from "@/lib/types";
import { env } from "@/lib/env";
import { addDays, dayKey, money, zonedParts } from "@/lib/time";
import { flagText, qtyUnit } from "@/lib/labels";
import { toolByName, toolsFor, type ToolCtx } from "./tools";

/**
 * Agente por reglas para cuando no hay OPENAI_API_KEY (demo / contingencia).
 * Usa las mismas herramientas de lectura que el agente con IA.
 */
export async function fallbackAgent(text: string, ctx: ToolCtx, log: ToolCallLog[]): Promise<string> {
  const t = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const allowed = new Set(toolsFor(ctx.staff).map((x) => x.name));
  const call = async <T>(name: string, args: Record<string, unknown>): Promise<T | null> => {
    if (!allowed.has(name)) return null;
    const tool = toolByName(name);
    if (!tool || tool.kind !== "read") return null;
    const t0 = Date.now();
    try {
      const result = await tool.run(args, ctx);
      log.push({ name, args, result, ms: Date.now() - t0 });
      return result as T;
    } catch (e) {
      log.push({ name, args, result: { error: String(e) }, ms: Date.now() - t0 });
      throw e;
    }
  };
  const today = dayKey(ctx.now);
  const name = ctx.staff.full_name.split(" ")[0];

  try {
    if (/\b(rent(a|ale|ar)|aparta|det(en|ien)|libera|saca|salida|compr(e|a|amos)|registra|programa|autoriza)/.test(t) && !/\?|cuanto|cual|que /.test(t)) {
      return `Para registrar cambios por WhatsApp necesito el modo IA activo (falta OPENAI_API_KEY). Mientras tanto puedes hacerlo en la web: ${env.appUrl}`;
    }

    const codes = t.match(/\b(?:rh|gr|ap)[\s-]*\d{1,3}\b|\bpend-[a-z]+\b/g) ?? [];
    if (codes.length > 1) return "Indica una unidad por consulta con su código completo, por ejemplo GR-03 o AP-03.";
    const code = codes[0];
    if (code) {
      const g = await call<Record<string, unknown> & { documentos: { tipo: string; estado: string; vence: string }[]; agenda_proxima: { tipo: string; titulo: string; inicio: string }[]; operadores_aprobados: { nombre: string; licencia_vigente: boolean }[] }>("consultar_grua", { grua: code });
      if (g) {
        const docsBad = g.documentos.filter((d) => d.estado !== "ok");
        return [
          `*${g.grua}* · ${g.tipo}${g.capacidad_t == null ? " · capacidad pendiente / no aplica" : ` · ${g.capacidad_t} t`}`,
          `Estado de agenda: *${g.estado}*${g.detencion_abierta ? ` (${g.detencion_abierta})` : ""}${g.restriccion_renta ? `\n⚠️ ${g.restriccion_renta}` : ""}`,
          `Horómetro: ${g.horometro_h == null ? "pendiente" : `${g.horometro_h} h`} · ${g.servicio}`,
          docsBad.length ? `⚠️ Documentos: ${docsBad.map((d) => `${d.tipo} (${d.estado}, ${d.vence})`).join("; ")}` : g.documentos.length ? "✅ Documentos registrados vigentes" : "Documentos pendientes de registrar",
          `Operadores: ${g.operadores_aprobados.map((o) => `${o.nombre}${o.licencia_vigente ? "" : " ⚠️ licencia vencida"}`).join(", ")}`,
          g.agenda_proxima.length ? `Próximo:\n${g.agenda_proxima.slice(0, 4).map((e) => `• ${e.inicio} ${e.tipo}: ${e.titulo}`).join("\n")}` : "Sin eventos próximos.",
        ].join("\n");
      }
    }

    if (/(libre|disponib)/.test(t)) {
      const day = parseDay(t, ctx.now) ?? dayKey(addDays(ctx.now, 1));
      const tipo = /(titan|camion)/.test(t) ? "camion_grua" : /movil/.test(t) ? "grua_movil" : /(torre|armable|oruga|celosia)/.test(t) ? "grua_armable" : null;
      const cap = t.match(/(\d+)\s*(t\b|ton)/);
      const r = await call<{ rango: string; disponibles: { grua: string; capacidad_t: number | null; tarifa_dia: number | null }[]; no_disponibles: { grua: string; motivos: string[] }[] }>("buscar_disponibilidad", { desde: day, hasta: day, tipo, capacidad_minima: cap ? Number(cap[1]) : null });
      if (r) {
        return r.disponibles.length
          ? `Libres el ${r.rango.split("→")[0].trim()}:\n${r.disponibles.map((d) => `• *${d.grua}*${d.capacidad_t == null ? "" : ` (${d.capacidad_t} t)`} · ${d.tarifa_dia == null ? "tarifa pendiente" : `${money(d.tarifa_dia)}/día`}`).join("\n")}`
          : `No hay unidades disponibles para renta con esos criterios. Motivos:\n${r.no_disponibles.slice(0, 5).map((d) => `• ${d.grua}: ${d.motivos[0]}`).join("\n")}`;
      }
    }

    if (/(politica|regla|se permite|puedo|procedimiento|que hago)/.test(t)) {
      const r = await call<{ titulo: string; contenido: string }[]>("buscar_politica", { pregunta: text });
      if (r?.length) return `📘 *${r[0].titulo}*\n${r[0].contenido}`;
    }

    if (/(vence|venc|document|seguro|poliza|licencia|tarjeta)/.test(t)) {
      const r = await call<{ documentos: { grua: string; documento: string; vence: string; dias: number }[]; licencias: { operador: string; vence: string; dias: number }[] }>("documentos_por_vencer", { dias: 30 });
      if (r) {
        const lines = [
          ...r.documentos.map((d) => `• *${d.grua}* ${d.documento}: ${d.dias < 0 ? `VENCIDO (${d.vence})` : `vence ${d.vence} (${d.dias} d)`}`),
          ...r.licencias.map((l) => `• Licencia de ${l.operador}: ${l.dias < 0 ? `VENCIDA (${l.vence})` : `vence ${l.vence}`}`),
        ];
        return lines.length ? `Vencimientos en los próximos 30 días:\n${lines.join("\n")}` : "No hay vencimientos registrados para los próximos 30 días; los documentos pendientes de registrar no se pueden evaluar.";
      }
    }

    if (/(robo|autoriz|pendiente|anomal|sospech|faltante)/.test(t)) {
      const r = await call<{ pendientes_autorizacion: { id: string; articulo: string; cantidad: number; unidad: string; grua: string; monto: string; solicito: string }[]; movimientos_atipicos: { articulo: string; cantidad: number; grua: string; señales: string[]; fecha: string }[]; conteos: { articulo: string; diferencia: number }[] }>("alertas_inventario", {});
      if (r) {
        return [
          `🔒 *Pendientes de autorizar:* ${r.pendientes_autorizacion.length}`,
          ...r.pendientes_autorizacion.map((p) => `• [${p.id}] ${qtyUnit(p.cantidad, p.unidad)} ${p.articulo} → ${p.grua} (${p.monto}) · ${p.solicito}`),
          `🚩 *Movimientos atípicos:* ${r.movimientos_atipicos.length}`,
          ...r.movimientos_atipicos.slice(0, 4).map((m) => `• ${m.articulo} (${Math.abs(m.cantidad)}) → ${m.grua ?? "—"} · ${flagText(m.señales)} (${m.fecha})`),
          ...r.conteos.map((c) => `• Conteo ${c.articulo}: ${c.diferencia > 0 ? "+" : ""}${c.diferencia}`),
        ].join("\n");
      }
    }

    const invWord = t.match(/(aceite|filtro|llanta|cable|sello|bateria|balata|grasa|eslinga|grillete|extintor)/);
    if (invWord || /(inventario|stock|existencia|almacen|refaccion)/.test(t)) {
      const r = await call<{ articulo: string; existencia: number; unidad: string; minimo: number; bajo_minimo: boolean }[]>("consultar_inventario", { buscar: invWord?.[1] ?? null, grua: null, solo_bajo_minimo: invWord ? null : true });
      if (r) {
        return r.length
          ? `${invWord ? "Existencias" : "Artículos en o bajo el mínimo"}:\n${r.slice(0, 10).map((i) => `• ${i.articulo}: *${qtyUnit(i.existencia, i.unidad)}*${i.bajo_minimo ? ` ⚠️ (mín ${i.minimo})` : ""}`).join("\n")}`
          : "No encontré artículos con ese criterio.";
      }
    }

    if (/(gast|compr|cuanto llev|dinero)/.test(t)) {
      const p = zonedParts(ctx.now);
      const from = `${p.year}-${String(p.month).padStart(2, "0")}-01`;
      const r = await call<{ periodo: string; total: number; por_categoria: { categoria: string; monto: number }[]; ultimas_compras: { fecha: string; descripcion: string; total: number }[] }>("resumen_gastos", { desde: from, hasta: today, grua: null });
      if (r) {
        return [`💰 Gasto ${r.periodo}: *${money(r.total)}*`, ...r.por_categoria.slice(0, 5).map((c) => `• ${c.categoria}: ${money(c.monto)}`), "Últimas compras:", ...r.ultimas_compras.slice(0, 3).map((c) => `• ${c.fecha} ${c.descripcion} · ${money(c.total)}`)].join("\n");
      }
    }

    if (/(revision|checklist)/.test(t)) {
      const r = await call<{ proximas: { grua: string; tipo: string; fecha: string; asignada_a: string }[]; vencidas: { grua: string; tipo: string }[]; completadas_recientes: { grua: string; resultado: string; calidad: number }[] }>("estado_revisiones", { grua: null });
      if (r) {
        return [
          `🛠️ *Próximas:*`,
          ...r.proximas.slice(0, 5).map((i) => `• ${i.fecha} *${i.grua}* ${i.tipo} · ${i.asignada_a ?? "sin asignar"}`),
          r.vencidas.length ? `⏰ *Vencidas:* ${r.vencidas.map((v) => v.grua).join(", ")}` : "",
          `✅ *Recientes:* ${r.completadas_recientes.slice(0, 4).map((c) => `${c.grua} ${c.resultado} (${c.calidad}/100)`).join(", ")}`,
        ].filter(Boolean).join("\n");
      }
    }

    if (/(flota|estado|como (esta|va)|resumen|detenid|rentad|gruas)/.test(t)) {
      const r = await call<{ grua: string; estado: string; ahora: string | null; restriccion_renta: string | null }[]>("consultar_flota", { estado: null, tipo: null });
      if (r) {
        const by = (s: string) => r.filter((c) => c.estado === s);
        const free = by("disponible").filter((c) => !c.restriccion_renta);
        const pending = r.filter((c) => c.restriccion_renta);
        return [
          `🏗️ *Flotilla:* ${free.length} sin eventos ni bloqueo de identificación · ${by("rentada").length} rentadas · ${by("mantenimiento").length} en mantenimiento · ${by("detenida").length} detenidas`,
          ...by("detenida").map((c) => `🛑 *${c.grua}*: ${c.ahora}`),
          ...by("mantenimiento").map((c) => `🔧 *${c.grua}*: ${c.ahora}`),
          `Sin eventos: ${free.map((c) => c.grua.split(" ")[0]).join(", ") || "ninguna"}`,
          ...(pending.length ? [`Pendientes de verificar capacidad y tabla de cargas: ${pending.map((c) => c.grua.split(" ")[0]).join(", ")}.`] : []),
        ].join("\n");
      }
    }
    if (/(agenda|semana|programad|calendario|que hay)/.test(t)) {
      const r = await call<{ grua: string; tipo: string; titulo: string; inicio: string; fin: string }[]>("consultar_agenda", { desde: today, hasta: dayKey(addDays(ctx.now, 6)), grua: null });
      if (r) return `📅 Próximos 7 días:\n${r.filter((e) => e.tipo !== "revision").slice(0, 10).map((e) => `• *${e.grua}* ${e.tipo}: ${e.titulo} (${e.inicio} → ${e.fin})`).join("\n")}`;
    }

  } catch (e) {
    return `No pude consultar eso: ${e instanceof Error ? e.message : e}`;
  }

  return `Hola ${name} 👋 Soy *Rhino*. Puedo decirte:\n• Estado de la flotilla ("¿cómo está la flota?")\n• Una grúa ("RH-04")\n• Disponibilidad ("¿qué titán está libre mañana?")\n• Vencimientos de documentos\n• Inventario y alertas de almacén\n• Gastos del mes y revisiones pendientes`;
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function parseDay(t: string, now: Date): string | null {
  if (/pasado manana/.test(t)) return dayKey(addDays(now, 2));
  if (/manana/.test(t)) return dayKey(addDays(now, 1));
  if (/\bhoy\b/.test(t)) return dayKey(now);
  const wd = WEEKDAYS.findIndex((d) => t.includes(d));
  if (wd >= 0) {
    const cur = zonedParts(now).weekday;
    const delta = ((wd - cur + 7) % 7) || 7;
    return dayKey(addDays(now, delta));
  }
  const iso = t.match(/(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}
