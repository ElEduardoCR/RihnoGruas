import type { Db } from "@/lib/db/types";
import type { Channel, CraneType, DowntimeCategory, PurchaseCategory, Staff, StaffRole } from "@/lib/types";
import { docStatus } from "@/lib/domain/fleet";
import { CHECKLIST_KIND_LABELS, CRANE_TYPE_LABELS, DOC_LABELS, PURCHASE_CATEGORY_LABELS } from "@/lib/labels";
import { env } from "@/lib/env";
import { findCrane, getCraneDossier, getEvents, getFleet } from "@/lib/services/fleet";
import { craneConflicts, createRental, documentIssues, findAvailable, identificationIssue, preInspectionTime } from "@/lib/services/rentals";
import { scheduleInspection, listInspections } from "@/lib/services/inspections";
import { releaseCrane, reportDowntime, scheduleMaintenance } from "@/lib/services/maintenance";
import { findMovement, getStock, inventoryWatch, registerPurchase, requestIssue, resolveMovement } from "@/lib/services/inventory";
import { expenseSummary, latestPurchases } from "@/lib/services/expenses";
import { inspectionLink, sendToStaff } from "@/lib/services/notify";
import { addDays, daysUntil, fmt, money, startOfDay, zonedDate, zonedParts } from "@/lib/time";
import { searchKnowledge } from "./knowledge";
import { norm } from "@/lib/text";
import { flagText, qtyUnit } from "@/lib/labels";

export interface ToolCtx {
  db: Db;
  now: Date;
  staff: Staff;
  channel: Channel;
}

type Args = Record<string, unknown>;
type Schema = Record<string, unknown>;

interface BaseTool {
  name: string;
  description: string;
  parameters: Schema;
  roles?: StaffRole[];
}
export interface ReadTool extends BaseTool {
  kind: "read";
  run(args: Args, ctx: ToolCtx): Promise<unknown>;
}
export interface WriteTool extends BaseTool {
  kind: "write";
  /** Valida y resuelve nombres → ids. No modifica datos. */
  prepare(args: Args, ctx: ToolCtx): Promise<{ summary: string; args: Args }>;
  /** Ejecuta tras la confirmación humana. */
  execute(args: Args, ctx: ToolCtx): Promise<{ mensaje: string } & Record<string, unknown>>;
}
export type Tool = ReadTool | WriteTool;

export class ToolError extends Error {}

// ---------------------------------------------------------------- esquemas (modo strict)
const str = (description: string) => ({ type: "string", description });
const optStr = (description: string) => ({ type: ["string", "null"], description });
const optNum = (description: string) => ({ type: ["number", "null"], description });
const num = (description: string) => ({ type: "number", description });
const bool = (description: string) => ({ type: "boolean", description });
const en = (values: string[], description: string) => ({ type: "string", enum: values, description });
const optEn = (values: string[], description: string) => ({ type: ["string", "null"], enum: [...values, null], description });
const obj = (properties: Record<string, Schema>): Schema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const CRANE_TYPES = Object.keys(CRANE_TYPE_LABELS);
const MGMT: StaffRole[] = ["direccion", "administracion"];
const DATE_HINT = "Fecha local CDMX en formato YYYY-MM-DD o YYYY-MM-DDTHH:mm";

// ---------------------------------------------------------------- helpers
function parseWhen(value: unknown, defaultHour: number, label: string): Date {
  const s = String(value ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2}))?/);
  if (!m) throw new ToolError(`${label}: fecha inválida "${s}". Usa YYYY-MM-DD o YYYY-MM-DDTHH:mm.`);
  const [, y, mo, d, h, mi] = m;
  return zonedDate(Number(y), Number(mo), Number(d), h ? Number(h) : defaultHour, mi ? Number(mi) : 0);
}

async function craneOrThrow(db: Db, q: unknown) {
  const c = await findCrane(db, String(q ?? ""));
  if (!c) {
    const all = await db.select("cranes", { eq: { active: true }, order: { column: "code" } });
    throw new ToolError(`No encontré una única unidad para "${q}". Usa su código completo (GR-03, AP-03 o RH-04); el prefijo distingue números repetidos. Unidades: ${all.map((x) => `${x.code} ${x.name}`).join(", ")}.`);
  }
  return c;
}

async function findStaff(db: Db, q: unknown, role?: StaffRole) {
  const s = norm(String(q ?? ""));
  if (!s) return null;
  const staff = await db.select("staff", { eq: { active: true } });
  const pool = role ? staff.filter((x) => x.role === role) : staff;
  const n = (x: { full_name: string }) => norm(x.full_name);
  return pool.find((x) => n(x) === s) ?? pool.find((x) => n(x).includes(s)) ?? pool.find((x) => s.split(/\s+/).every((w) => n(x).includes(w))) ?? null;
}

async function matchItems(db: Db, query: string) {
  const stock = await getStock(db);
  const q = norm(query);
  const exact = stock.find((s) => norm(s.sku) === q || norm(s.name) === q);
  if (exact) return [exact];
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  const hits = stock.filter((s) => words.every((w) => norm(`${s.name} ${s.sku} ${s.category}`).includes(w)));
  // "aceite" no debe confundirse con "filtro de aceite": prioriza los que empiezan igual
  const starts = hits.filter((s) => norm(s.name).startsWith(words[0] ?? ""));
  return starts.length ? starts : hits;
}

const craneLabel = (c: { code: string; name: string }) => `${c.code} ${c.name}`;

// ---------------------------------------------------------------- herramientas de lectura
const consultarFlota: ReadTool = {
  kind: "read",
  name: "consultar_flota",
  description: "Estado de agenda de la flota: disponible, rentada, mantenimiento o detenida, con evento actual y siguiente. Disponible sólo describe la agenda: una restriccion_renta impide ofrecer la unidad. Datos no verificados se devuelven null o sin_documentos.",
  parameters: obj({
    estado: optEn(["disponible", "rentada", "mantenimiento", "detenida"], "Filtrar por estado, o null para todas"),
    tipo: optEn(CRANE_TYPES, "Filtrar por tipo, o null"),
  }),
  async run(a, { db, now }) {
    const { cranes } = await getFleet(db, now);
    return cranes
      .filter((c) => (!a.estado || c.status === a.estado) && (!a.tipo || c.type === a.tipo))
      .map((c) => ({
        grua: craneLabel(c),
        tipo: CRANE_TYPE_LABELS[c.type],
        capacidad_t: c.capacity_tons,
        estado: c.status,
        ahora: c.current ? `${c.current.kind}: ${c.current.title} (hasta ${c.current.open ? "sin fecha" : fmt.dateTime(c.current.end)})` : null,
        siguiente: c.next ? `${c.next.kind}: ${c.next.title} (${fmt.dateTime(c.next.start)})` : null,
        documentos: c.documents.length ? c.docHealth : "sin_documentos",
        restriccion_renta: identificationIssue(c),
        uso_servicio_pct: c.service.known ? Math.round(c.service.pct * 100) : null,
        tarifa_dia: c.daily_rate,
      }));
  },
};

const consultarGrua: ReadTool = {
  kind: "read",
  name: "consultar_grua",
  description: "Expediente completo de una grúa: datos técnicos, documentos con vigencia, operadores aprobados, agenda próxima, última revisión, mantenimiento, consumo de almacén y gasto.",
  parameters: obj({ grua: str("Código completo (GR-03, AP-03, RH-04), nombre o modelo único de la unidad") }),
  async run(a, { db, now }) {
    const c = await craneOrThrow(db, a.grua);
    const d = (await getCraneDossier(db, c.id, now))!;
    const t = now.getTime();
    const lastInsp = d.inspections.find((i) => i.status === "completada");
    return {
      grua: craneLabel(c),
      tipo: CRANE_TYPE_LABELS[c.type],
      marca_modelo: `${c.brand} ${c.model} ${c.year ?? ""}`.trim(),
      capacidad_t: c.capacity_tons,
      pluma_m: c.boom_length_m,
      placas: c.plates,
      serie: c.serial_number,
      horometro_h: c.hour_meter,
      ficha_investigada: c.fleet_profile ?? null,
      servicio: d.service.known ? `${Math.round(d.service.used)} de ${c.service_interval_hours} h usadas desde el último servicio` : "Pendiente: faltan horómetro, historial o intervalo confirmado",
      estado: d.status,
      restriccion_renta: identificationIssue(c),
      detencion_abierta: d.downtimes.find((x) => !x.ended_at)?.reason ?? null,
      documentos: d.documents.map((doc) => {
        const s = docStatus(doc, now);
        return { tipo: DOC_LABELS[doc.doc_type], numero: doc.number, emisor: doc.issuer, vence: doc.expires_on ? fmt.date(doc.expires_on) : "sin vencimiento", estado: s.health, dias: s.days };
      }),
      operadores_aprobados: d.operators.map((o) => ({
        nombre: o.staff.full_name,
        licencia_vence: o.staff.license_expires_on ? fmt.date(o.staff.license_expires_on) : null,
        licencia_vigente: !o.staff.license_expires_on || daysUntil(o.staff.license_expires_on, now) >= 0,
        aprobacion_vence: o.valid_until ? fmt.date(o.valid_until) : null,
      })),
      agenda_proxima: d.events
        .filter((e) => Date.parse(e.end) > t && Date.parse(e.start) < addDays(now, 21).getTime())
        .slice(0, 8)
        .map((e) => ({ tipo: e.kind, titulo: e.title, inicio: fmt.dateTime(e.start), fin: e.open ? "abierta" : fmt.dateTime(e.end), estado: e.status })),
      ultima_revision: lastInsp ? { fecha: fmt.dateTime(lastInsp.completed_at!), resultado: lastInsp.result, calidad: lastInsp.quality_score, resumen: lastInsp.ai_summary } : null,
      mantenimientos_recientes: d.maintenance.slice(0, 4).map((m) => ({ titulo: m.title, tipo: m.kind, estado: m.status, fecha: fmt.date(m.scheduled_start), costo: m.cost })),
      consumo_almacen_30d: d.movements
        .filter((m) => m.kind === "salida" && m.status === "aplicado" && daysUntil(m.created_at, now) >= -30)
        .map((m) => `${-m.qty_delta} ${m.item?.unit} ${m.item?.name}`),
      gasto_directo_total: d.purchases.reduce((s, p) => s + p.total, 0),
      notas: c.notes,
    };
  },
};

const buscarDisponibilidad: ReadTool = {
  kind: "read",
  name: "buscar_disponibilidad",
  description: "Qué grúas están libres en un rango de fechas (sin rentas, mantenimientos ni detenciones y con documentos vigentes). Opcionalmente por tipo y capacidad mínima.",
  roles: [...MGMT, "ventas", "mecanico"],
  parameters: obj({
    desde: str(`Inicio. ${DATE_HINT}. Si sólo es fecha se toma 00:00`),
    hasta: str(`Fin. ${DATE_HINT}. Si sólo es fecha se toma 23:59`),
    tipo: optEn(CRANE_TYPES, "Tipo de unidad: grúa móvil, camión grúa, armable, telehandler, tractocamión, remolque o vehículo de apoyo; null para todas"),
    capacidad_minima: optNum("Toneladas mínimas, o null"),
  }),
  async run(a, { db, now }) {
    const from = parseWhen(a.desde, 0, "desde");
    let to = parseWhen(a.hasta, 23, "hasta");
    if (!String(a.hasta).includes("T") && !String(a.hasta).includes(" ")) to = zonedDate(zonedParts(to).year, zonedParts(to).month, zonedParts(to).day, 23, 59);
    const res = await findAvailable(db, { from, to, type: (a.tipo as CraneType) ?? null, minCapacity: (a.capacidad_minima as number) ?? null }, now);
    return {
      rango: `${fmt.dateTime(from)} → ${fmt.dateTime(to)}`,
      disponibles: res.filter((r) => r.available).map((r) => ({ grua: craneLabel(r.crane), tipo: CRANE_TYPE_LABELS[r.crane.type], capacidad_t: r.crane.capacity_tons, tarifa_dia: r.crane.daily_rate, avisos: r.docIssues.map((d) => d.text) })),
      no_disponibles: res.filter((r) => !r.available).map((r) => ({ grua: craneLabel(r.crane), capacidad_t: r.crane.capacity_tons, motivos: [...r.conflicts.map((c) => `${c.label} (${fmt.dateTime(c.start)}${c.end ? ` → ${fmt.dateTime(c.end)}` : ""})`), ...r.docIssues.filter((d) => d.blocking).map((d) => d.text)] })),
    };
  },
};

const consultarAgenda: ReadTool = {
  kind: "read",
  name: "consultar_agenda",
  description: "Rentas, mantenimientos, detenciones y revisiones programadas en un rango de fechas, opcionalmente de una grúa.",
  parameters: obj({ desde: str(DATE_HINT), hasta: str(DATE_HINT), grua: optStr("Grúa o null para todas") }),
  async run(a, { db, now }) {
    const from = parseWhen(a.desde, 0, "desde");
    const to = addDays(startOfDay(parseWhen(a.hasta, 0, "hasta")), 1);
    const crane = a.grua ? await craneOrThrow(db, a.grua) : null;
    const [events, cranes] = await Promise.all([getEvents(db, from, to, now), db.select("cranes")]);
    const cm = new Map(cranes.map((c) => [c.id, c]));
    return events
      .filter((e) => !crane || e.crane_id === crane.id)
      .slice(0, 60)
      .map((e) => ({ grua: cm.get(e.crane_id)?.code, tipo: e.kind, titulo: e.title, detalle: e.subtitle, inicio: fmt.dateTime(e.start), fin: e.open ? "abierta" : fmt.dateTime(e.end), estado: e.status }));
  },
};

const consultarInventario: ReadTool = {
  kind: "read",
  name: "consultar_inventario",
  description: "Existencias del almacén (aceites, filtros, llantas, refacciones, consumibles, herramienta) con mínimo, ubicación y grúas compatibles.",
  parameters: obj({
    buscar: optStr("Texto a buscar (nombre, SKU o categoría) o null"),
    grua: optStr("Sólo artículos que sirven a esta grúa (generales + específicos compatibles), o null"),
    solo_bajo_minimo: { type: ["boolean", "null"], description: "true para sólo artículos en o bajo el mínimo" },
  }),
  async run(a, { db }) {
    let stock = await getStock(db);
    const cranes = await db.select("cranes");
    const cm = new Map(cranes.map((c) => [c.id, c.code]));
    if (a.buscar) {
      const words = norm(String(a.buscar)).split(/\s+/).filter((w) => w.length > 2);
      stock = stock.filter((s) => words.some((w) => norm(`${s.name} ${s.sku} ${s.category}`).includes(w)));
    }
    if (a.grua) {
      const c = await craneOrThrow(db, a.grua);
      stock = stock.filter((s) => s.compatCraneIds.includes(c.id) || (s.scope === "general" && s.compatCraneIds.length === 0));
    }
    if (a.solo_bajo_minimo) stock = stock.filter((s) => s.low);
    return stock.slice(0, 30).map((s) => ({
      sku: s.sku,
      articulo: s.name,
      existencia: s.stock,
      unidad: s.unit,
      minimo: s.min_stock,
      bajo_minimo: s.low,
      pendiente_autorizar: s.pendingOut,
      alcance: s.scope,
      compatible_con: s.compatCraneIds.map((id) => cm.get(id)),
      ubicacion: s.location,
      costo_unitario: s.unit_cost,
      cambio_contra_entrega: s.requires_return,
    }));
  },
};

const alertasInventario: ReadTool = {
  kind: "read",
  name: "alertas_inventario",
  description: "Control antirrobo: salidas pendientes de autorización, movimientos atípicos (fuera de horario, consumo excesivo, pieza incompatible, sin evidencia), diferencias en conteos y artículos bajo mínimo.",
  roles: [...MGMT, "almacen"],
  parameters: obj({}),
  async run(_, { db, now }) {
    const w = await inventoryWatch(db, now);
    return {
      pendientes_autorizacion: w.pending.map((m) => ({ id: m.id.slice(0, 6), articulo: m.item?.name, cantidad: -m.qty_delta, unidad: m.item?.unit, grua: m.crane?.code, solicito: m.requester?.full_name, motivo: m.reason, monto: money(-m.qty_delta * (m.unit_cost ?? 0)), señales: m.flags, fecha: fmt.dateTime(m.created_at) })),
      movimientos_atipicos: w.flagged.slice(0, 10).map((m) => ({ articulo: m.item?.name, cantidad: m.qty_delta, grua: m.crane?.code, solicito: m.requester?.full_name, señales: m.flags, fecha: fmt.dateTime(m.created_at), estado: m.status })),
      conteos: w.counts.filter((c) => c.variance !== 0).map((c) => ({ articulo: c.item?.name, sistema: c.system_qty, contado: c.counted_qty, diferencia: c.variance, fecha: fmt.dateTime(c.created_at) })),
      bajo_minimo: w.lowStock.map((s) => `${s.name}: ${s.stock} ${s.unit} (mín ${s.min_stock})`),
    };
  },
};

const resumenGastos: ReadTool = {
  kind: "read",
  name: "resumen_gastos",
  description: "Gasto (compras registradas) en un periodo: total, por categoría, por grúa y últimas compras.",
  roles: MGMT,
  parameters: obj({ desde: str(DATE_HINT), hasta: str(`${DATE_HINT} (inclusive)`), grua: optStr("Grúa o null") }),
  async run(a, { db }) {
    const from = startOfDay(parseWhen(a.desde, 0, "desde"));
    const to = addDays(startOfDay(parseWhen(a.hasta, 0, "hasta")), 1);
    const s = await expenseSummary(db, from, to);
    const crane = a.grua ? await craneOrThrow(db, a.grua) : null;
    const latest = (await latestPurchases(db, 40)).filter((p) => (!crane || p.crane_id === crane.id) && new Date(p.purchased_on) >= from).slice(0, 8);
    return {
      periodo: `${fmt.date(from)} – ${fmt.date(addDays(to, -1))}`,
      total: s.total,
      compras: s.count,
      por_categoria: s.byCategory.map((c) => ({ categoria: PURCHASE_CATEGORY_LABELS[c.category], monto: c.amount })),
      por_grua: s.byCrane.slice(0, 10).map((c) => ({ grua: c.crane.code, monto: c.amount })),
      ultimas_compras: latest.map((p) => ({ fecha: fmt.date(p.purchased_on), proveedor: p.supplier, descripcion: p.description, total: p.total, grua: p.crane?.code ?? null })),
    };
  },
};

const documentosPorVencer: ReadTool = {
  kind: "read",
  name: "documentos_por_vencer",
  description: "Documentos de grúas (seguro, tarjeta de circulación, verificación, permiso SCT, certificación) y licencias de operadores vencidos o por vencer.",
  roles: [...MGMT, "ventas", "mecanico"],
  parameters: obj({ dias: num("Horizonte en días, p. ej. 30") }),
  async run(a, { db, now }) {
    const days = Number(a.dias) || 30;
    const [docs, cranes, staff] = await Promise.all([db.select("crane_documents"), db.select("cranes"), db.select("staff", { eq: { role: "operador", active: true } })]);
    const cm = new Map(cranes.map((c) => [c.id, c]));
    return {
      documentos: docs
        .filter((d) => d.expires_on && daysUntil(d.expires_on, now) <= days)
        .sort((x, y) => x.expires_on!.localeCompare(y.expires_on!))
        .map((d) => ({ grua: cm.get(d.crane_id)?.code, documento: DOC_LABELS[d.doc_type], vence: fmt.date(d.expires_on!), dias: daysUntil(d.expires_on!, now) })),
      licencias: staff
        .filter((s) => s.license_expires_on && daysUntil(s.license_expires_on, now) <= days)
        .map((s) => ({ operador: s.full_name, vence: fmt.date(s.license_expires_on!), dias: daysUntil(s.license_expires_on!, now) })),
    };
  },
};

const estadoRevisiones: ReadTool = {
  kind: "read",
  name: "estado_revisiones",
  description: "Revisiones (checklists) próximas, vencidas y recientes con resultado y calidad de llenado (0-100).",
  parameters: obj({ grua: optStr("Grúa o null para todas") }),
  async run(a, { db, now }) {
    const crane = a.grua ? await craneOrThrow(db, a.grua) : null;
    const list = (await listInspections(db, addDays(now, -14))).filter((i) => !crane || i.crane_id === crane.id);
    const row = (i: (typeof list)[number]) => ({ grua: i.crane.code, tipo: CHECKLIST_KIND_LABELS[i.kind], fecha: fmt.dateTime(i.scheduled_for), asignada_a: i.assignee?.full_name ?? null, estado: i.status, resultado: i.result, calidad: i.quality_score, señales: i.quality_flags });
    return {
      proximas: list.filter((i) => i.status === "programada" || i.status === "en_progreso").reverse().map(row),
      vencidas: list.filter((i) => i.status === "vencida").map(row),
      completadas_recientes: list.filter((i) => i.status === "completada").slice(0, 8).map(row),
    };
  },
};

const buscarPolitica: ReadTool = {
  kind: "read",
  name: "buscar_politica",
  description: "Busca en las políticas y procedimientos internos (almacén, revisiones, operadores, documentación, fallas, tarifas).",
  parameters: obj({ pregunta: str("Lo que quieres saber, en lenguaje natural") }),
  async run(a, { db }) {
    return searchKnowledge(db, String(a.pregunta ?? ""));
  },
};

const consultarOperadores: ReadTool = {
  kind: "read",
  name: "consultar_operadores",
  description: "Operadores con su licencia y las grúas para las que están aprobados; opcionalmente sólo los aprobados para una grúa.",
  roles: [...MGMT, "ventas", "mecanico"],
  parameters: obj({ grua: optStr("Grúa o null") }),
  async run(a, { db, now }) {
    const [ops, approvals, cranes] = await Promise.all([db.select("staff", { eq: { role: "operador", active: true } }), db.select("crane_operators"), db.select("cranes")]);
    const crane = a.grua ? await craneOrThrow(db, a.grua) : null;
    return ops
      .filter((o) => !crane || approvals.some((x) => x.staff_id === o.id && x.crane_id === crane.id))
      .map((o) => ({
        nombre: o.full_name,
        licencia: o.license_type,
        licencia_vence: o.license_expires_on ? fmt.date(o.license_expires_on) : null,
        licencia_vigente: !o.license_expires_on || daysUntil(o.license_expires_on, now) >= 0,
        aprobado_en: approvals.filter((x) => x.staff_id === o.id).map((x) => cranes.find((c) => c.id === x.crane_id)?.code),
      }));
  },
};

const enviarRevision: ReadTool = {
  kind: "read",
  name: "enviar_revision",
  description: "Reenvía por WhatsApp al operador asignado el enlace del wizard de la próxima revisión pendiente de una grúa.",
  roles: [...MGMT, "mecanico", "operador"],
  parameters: obj({ grua: str("Grúa") }),
  async run(a, { db, staff }) {
    const c = await craneOrThrow(db, a.grua);
    const pend = (await db.select("inspections", { eq: { crane_id: c.id }, in: { status: ["programada", "en_progreso", "vencida"] }, order: { column: "scheduled_for" } }))[0];
    if (!pend) throw new ToolError(`${c.code} no tiene revisiones pendientes.`);
    const assignee = pend.assigned_to ? await db.get("staff", pend.assigned_to) : null;
    const target = assignee ?? staff;
    await sendToStaff(db, target, `🛠️ *${pend.title}* · ${fmt.dateTime(pend.scheduled_for)}\nÁbrela frente a la grúa: ${inspectionLink(pend.access_token)}`, "sistema");
    return { enviado_a: target.full_name, revision: pend.title, enlace: inspectionLink(pend.access_token) };
  },
};

// ---------------------------------------------------------------- herramientas que modifican (con confirmación)
const crearRenta: WriteTool = {
  kind: "write",
  name: "crear_renta",
  description: "Prepara una renta de grúa. Valida disponibilidad, documentos y operador. Al confirmarse, programa automáticamente la revisión total y la recepción post-renta.",
  roles: [...MGMT, "ventas"],
  parameters: obj({
    grua: str("Grúa a rentar"),
    cliente: str("Nombre del cliente (si no existe se da de alta)"),
    inicio: str(`${DATE_HINT}. Si no dan hora usa 07:00`),
    fin: str(`${DATE_HINT}. Si no dan hora usa 18:00`),
    operador: optStr("Nombre del operador o null para asignar automáticamente"),
    direccion_obra: optStr("Dirección del sitio o null"),
    notas_sitio: optStr("Condiciones de la maniobra o null"),
    tarifa_diaria: optNum("MXN por día o null para la tarifa base"),
  }),
  async prepare(a, { db, now }) {
    const c = await craneOrThrow(db, a.grua);
    const start = parseWhen(a.inicio, 7, "inicio");
    const end = parseWhen(a.fin, 18, "fin");
    if (!(end > start)) throw new ToolError("La fecha de fin debe ser posterior al inicio.");
    if (end < now) throw new ToolError("Esas fechas ya pasaron.");
    const conflicts = await craneConflicts(db, c.id, start, end);
    if (conflicts.length) throw new ToolError(`${c.code} no está disponible: ${conflicts.map((x) => `${x.label} (${fmt.dateTime(x.start)}${x.end ? ` → ${fmt.dateTime(x.end)}` : ""})`).join("; ")}. Sugiere otra grúa con buscar_disponibilidad.`);
    const docs = await documentIssues(db, c.id, end, now);
    if (docs.some((d) => d.blocking)) throw new ToolError(`${c.code} no puede salir: ${docs.filter((d) => d.blocking).map((d) => d.text).join("; ")}.`);
    let operatorId: string | null = null;
    let operatorName = "asignación automática";
    if (a.operador) {
      const op = await findStaff(db, a.operador, "operador");
      if (!op) throw new ToolError(`No encontré al operador "${a.operador}".`);
      const ok = (await db.select("crane_operators", { eq: { crane_id: c.id, staff_id: op.id } })).length > 0;
      if (!ok) throw new ToolError(`${op.full_name} no está aprobado para ${c.code}. Usa consultar_operadores.`);
      operatorId = op.id;
      operatorName = op.full_name;
    }
    const clients = await db.select("clients");
    const cq = norm(String(a.cliente));
    const client = clients.find((x) => norm(x.name) === cq) ?? clients.find((x) => norm(x.name).includes(cq) || cq.includes(norm(x.name)));
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
    const rate = (a.tarifa_diaria as number) ?? c.daily_rate ?? 0;
    const pre = preInspectionTime(start, now);
    const summary = [
      `Renta de *${craneLabel(c)}* para *${client?.name ?? `${a.cliente} (cliente nuevo)`}*`,
      `${fmt.dateTime(start)} → ${fmt.dateTime(end)} (${days} día${days > 1 ? "s" : ""}) · ${money(rate)}/día ≈ ${money(rate * days)}`,
      `Operador: ${operatorName}`,
      `Revisión total automática: ${fmt.dateTime(pre)}`,
      ...docs.map((d) => `⚠️ ${d.text}`),
    ].join("\n");
    return {
      summary,
      args: { craneId: c.id, clientId: client?.id ?? null, clientName: client ? null : a.cliente, operatorId, start: start.toISOString(), end: end.toISOString(), siteAddress: a.direccion_obra ?? null, siteNotes: a.notas_sitio ?? null, rate },
    };
  },
  async execute(a, { db, now }) {
    const r = await createRental(
      db,
      { craneId: a.craneId as string, clientId: a.clientId as string | null, clientName: a.clientName as string | null, operatorId: a.operatorId as string | null, start: new Date(a.start as string), end: new Date(a.end as string), siteAddress: a.siteAddress as string | null, siteNotes: a.siteNotes as string | null, rate: a.rate as number, createdBy: "agente" },
      now,
    );
    return {
      mensaje: `✅ Renta confirmada: *${craneLabel(r.crane)}* del ${fmt.dateTime(r.rental.start_at)} al ${fmt.dateTime(r.rental.end_at)}.\n🛠️ Revisión total programada ${fmt.dateTime(r.inspections.pre.scheduled_for)} (${r.inspections.preItems} puntos, ${r.inspections.focus.length} específicos de esta grúa) y recepción post-renta al regreso.${r.warnings.length ? `\n${r.warnings.map((w) => `• ${w}`).join("\n")}` : ""}`,
      renta_id: r.rental.id,
    };
  },
};

const programarRevision: WriteTool = {
  kind: "write",
  name: "programar_revision",
  description: "Programa una revisión (checklist con fotos) personalizada para una grúa. Puedes agregar puntos extra específicos con su motivo.",
  roles: [...MGMT, "mecanico"],
  parameters: obj({
    grua: str("Grúa"),
    fecha_hora: str(`${DATE_HINT}. Si no dan hora usa 09:00`),
    tipo: en(["revision_total", "diaria", "post_renta"], "Tipo de revisión"),
    asignar_a: optStr("Nombre de quien la hará o null para el operador aprobado"),
    puntos_extra: {
      type: ["array", "null"],
      description: "Puntos adicionales que tú consideras necesarios por el historial de la grúa, o null",
      items: obj({ titulo: str("Qué revisar"), instrucciones: str("Cómo revisarlo"), motivo: str("Por qué se agrega") }),
    },
  }),
  async prepare(a, { db }) {
    const c = await craneOrThrow(db, a.grua);
    const when = parseWhen(a.fecha_hora, 9, "fecha_hora");
    const who = a.asignar_a ? await findStaff(db, a.asignar_a) : null;
    if (a.asignar_a && !who) throw new ToolError(`No encontré a "${a.asignar_a}".`);
    const extra = (a.puntos_extra as { titulo: string; instrucciones: string; motivo: string }[] | null) ?? [];
    return {
      summary: `${CHECKLIST_KIND_LABELS[a.tipo as "revision_total"]} de *${craneLabel(c)}* el ${fmt.dateTime(when)}${who ? ` con ${who.full_name}` : ""}.${extra.length ? `\nPuntos extra:\n${extra.map((e) => `• ${e.titulo} (${e.motivo})`).join("\n")}` : ""}`,
      args: { craneId: c.id, when: when.toISOString(), kind: a.tipo, assignedTo: who?.id ?? null, extra },
    };
  },
  async execute(a, { db, now }) {
    const r = await scheduleInspection(
      db,
      {
        craneId: a.craneId as string,
        kind: a.kind as "revision_total",
        scheduledFor: new Date(a.when as string),
        assignedTo: a.assignedTo as string | null,
        createdBy: "agente",
        extraFocus: (a.extra as { titulo: string; instrucciones: string; motivo: string }[]).map((e) => ({ section: "Indicaciones de Rhino", title: e.titulo, instructions: e.instrucciones, reason: e.motivo })),
      },
      now,
    );
    return { mensaje: `✅ Revisión programada ${fmt.dateTime(r.inspection.scheduled_for)} con ${r.items} puntos (${r.focus.length} personalizados). Envié el enlace al responsable.\n${inspectionLink(r.inspection.access_token)}` };
  },
};

const reportarDetencion: WriteTool = {
  kind: "write",
  name: "reportar_detencion",
  description: "Marca una grúa como detenida (fuera de servicio) por falla, accidente, documentación, etc. Notifica a Dirección y detecta rentas afectadas.",
  parameters: obj({
    grua: str("Grúa"),
    categoria: en(["falla_mecanica", "documentacion", "accidente", "falta_operador", "clima", "otro"], "Causa"),
    motivo: str("Descripción breve de la falla"),
  }),
  async prepare(a, { db, now }) {
    const c = await craneOrThrow(db, a.grua);
    const open = await db.select("downtimes", { eq: { crane_id: c.id }, isNull: ["ended_at"] });
    if (open.length) throw new ToolError(`${c.code} ya está detenida desde ${fmt.dateTime(open[0].started_at)}: ${open[0].reason}.`);
    const rentals = await db.select("rentals", { eq: { crane_id: c.id }, in: { status: ["confirmada", "en_curso"] } });
    const affected = rentals.filter((r) => Date.parse(r.end_at) > now.getTime() && Date.parse(r.start_at) < addDays(now, 14).getTime());
    return {
      summary: `Detener *${craneLabel(c)}*: ${a.motivo}.${affected.length ? `\n⚠️ ${affected.length} renta(s) afectada(s) en los próximos 14 días.` : ""}`,
      args: { craneId: c.id, category: a.categoria, reason: a.motivo },
    };
  },
  async execute(a, { db, now, staff }) {
    const r = await reportDowntime(db, { craneId: a.craneId as string, category: a.category as DowntimeCategory, reason: a.reason as string, reportedBy: staff.id }, now);
    return { mensaje: `🛑 *${r.crane.code}* registrada como detenida. Avisé a Dirección.${r.affected.length ? ` Hay ${r.affected.length} renta(s) afectada(s): pídeme buscar sustituta.` : ""}` };
  },
};

const liberarGrua: WriteTool = {
  kind: "write",
  name: "liberar_grua",
  description: "Libera una grúa detenida (cierra la detención) cuando la falla ya fue resuelta.",
  roles: [...MGMT, "mecanico"],
  parameters: obj({ grua: str("Grúa"), notas: optStr("Qué se reparó, o null") }),
  async prepare(a, { db }) {
    const c = await craneOrThrow(db, a.grua);
    const open = await db.select("downtimes", { eq: { crane_id: c.id }, isNull: ["ended_at"] });
    if (!open.length) throw new ToolError(`${c.code} no está detenida.`);
    return { summary: `Liberar *${craneLabel(c)}* (detenida por: ${open[0].reason}).${a.notas ? `\nNotas: ${a.notas}` : ""}`, args: { craneId: c.id, notes: a.notas ?? null } };
  },
  async execute(a, { db, now }) {
    await releaseCrane(db, a.craneId as string, a.notes as string | null, now);
    return { mensaje: "✅ Grúa liberada y disponible." };
  },
};

const programarMantenimiento: WriteTool = {
  kind: "write",
  name: "programar_mantenimiento",
  description: "Programa un mantenimiento preventivo o correctivo. Verifica que no choque con rentas.",
  roles: [...MGMT, "mecanico"],
  parameters: obj({
    grua: str("Grúa"),
    tipo: en(["preventivo", "correctivo"], "Tipo"),
    titulo: str("Trabajo a realizar"),
    inicio: str(`${DATE_HINT}. Si no dan hora usa 08:00`),
    fin: str(`${DATE_HINT}. Si no dan hora usa 18:00`),
    descripcion: optStr("Detalle o null"),
  }),
  async prepare(a, { db }) {
    const c = await craneOrThrow(db, a.grua);
    const start = parseWhen(a.inicio, 8, "inicio");
    const end = parseWhen(a.fin, 18, "fin");
    const rentals = await db.select("rentals", { eq: { crane_id: c.id }, in: { status: ["confirmada", "en_curso"] } });
    const clash = rentals.find((r) => start < new Date(r.end_at) && new Date(r.start_at) < end);
    if (clash) throw new ToolError(`Choca con la renta del ${fmt.dateTime(clash.start_at)} al ${fmt.dateTime(clash.end_at)}.`);
    return { summary: `Mantenimiento ${a.tipo} de *${craneLabel(c)}*: ${a.titulo}\n${fmt.dateTime(start)} → ${fmt.dateTime(end)}`, args: { craneId: c.id, kind: a.tipo, title: a.titulo, description: a.descripcion ?? null, start: start.toISOString(), end: end.toISOString() } };
  },
  async execute(a, { db }) {
    await scheduleMaintenance(db, { craneId: a.craneId as string, kind: a.kind as "preventivo", title: a.title as string, description: a.description as string | null, start: new Date(a.start as string), end: new Date(a.end as string), createdBy: "agente" });
    return { mensaje: "✅ Mantenimiento programado en el calendario." };
  },
};

const registrarSalida: WriteTool = {
  kind: "write",
  name: "registrar_salida_almacen",
  description: "Solicita una salida de almacén hacia una grúa. Aplica controles antirrobo: compatibilidad, cambio contra entrega, monto, horario y consumo atípico. Puede quedar pendiente de autorización.",
  roles: [...MGMT, "almacen", "mecanico", "operador"],
  parameters: obj({
    articulo: str("Nombre o SKU del artículo"),
    cantidad: num("Cantidad en la unidad del artículo"),
    grua: str("Grúa destino"),
    motivo: str("Para qué se usa"),
    numeros_serie: { type: ["array", "null"], items: { type: "string" }, description: "Números de serie si el artículo es serializado (llantas, baterías), o null" },
  }),
  async prepare(a, { db, now }) {
    const matches = await matchItems(db, String(a.articulo));
    if (!matches.length) throw new ToolError(`No encontré "${a.articulo}" en el almacén.`);
    if (matches.length > 1) throw new ToolError(`"${a.articulo}" es ambiguo. Pregunta cuál: ${matches.slice(0, 6).map((m) => m.name).join(" / ")}.`);
    const item = matches[0];
    const c = await craneOrThrow(db, a.grua);
    const qty = Number(a.cantidad);
    if (!(qty > 0)) throw new ToolError("Cantidad inválida.");
    if (qty > item.stock - item.pendingOut) throw new ToolError(`Sólo hay ${qtyUnit(item.stock - item.pendingOut, item.unit)} disponibles de ${item.name}.`);
    const notes: string[] = [];
    if (item.scope === "especifico" && !item.compatCraneIds.includes(c.id)) notes.push("pieza NO compatible con esa grúa");
    if (qty * item.unit_cost > env.authorizeAboveMxn) notes.push(`monto mayor a ${money(env.authorizeAboveMxn)}`);
    if (item.requires_return) notes.push("requiere foto de la pieza usada (cambio contra entrega)");
    const h = zonedParts(now).hour;
    if (h < 7 || h >= 19) notes.push("fuera del horario de almacén");
    return {
      summary: `Salida: *${qtyUnit(qty, item.unit)} de ${item.name}* → *${craneLabel(c)}* (${money(qty * item.unit_cost)})\nMotivo: ${a.motivo}${notes.length ? `\n⚠️ Quedará pendiente/reportada: ${notes.join("; ")}.` : ""}`,
      args: { itemId: item.id, qty, craneId: c.id, reason: a.motivo, serials: a.numeros_serie ?? [] },
    };
  },
  async execute(a, { db, now, staff, channel }) {
    const r = await requestIssue(db, { itemId: a.itemId as string, qty: a.qty as number, craneId: a.craneId as string, reason: a.reason as string, requestedBy: staff.id, serialNumbers: a.serials as string[], channel }, now);
    return {
      mensaje: r.needsAuth
        ? `⏳ Salida registrada como *pendiente de autorización* (${flagText(r.flags)}). Avisé a quien puede autorizar.${r.item.requires_return ? "\n📸 Envía foto de la pieza usada al almacén." : ""}`
        : `✅ Salida aplicada: ${qtyUnit(a.qty as number, r.item.unit)} de ${r.item.name} → ${r.crane.code}.${r.flags.length ? ` Señales: ${flagText(r.flags)}.` : ""}`,
    };
  },
};

const resolverSalida: WriteTool = {
  kind: "write",
  name: "resolver_salida",
  description: "Autoriza o rechaza una salida de almacén pendiente (por id corto de 6 caracteres que aparece en alertas_inventario).",
  roles: [...MGMT, "almacen"],
  parameters: obj({ movimiento: str("Id o prefijo del movimiento"), autorizar: bool("true para autorizar, false para rechazar") }),
  async prepare(a, { db, staff }) {
    if (!staff.can_authorize) throw new ToolError("No tienes permiso para autorizar salidas.");
    const m = await findMovement(db, String(a.movimiento));
    if (!m || m.status !== "pendiente_autorizacion") throw new ToolError("No encontré esa salida pendiente. Consulta alertas_inventario.");
    const item = await db.get("inventory_items", m.item_id);
    const crane = m.crane_id ? await db.get("cranes", m.crane_id) : null;
    return { summary: `${a.autorizar ? "AUTORIZAR" : "RECHAZAR"} salida de ${qtyUnit(-m.qty_delta, item?.unit ?? "")} de ${item?.name} → ${crane?.code ?? "—"} (${money(-m.qty_delta * (m.unit_cost ?? 0))}). Señales: ${flagText(m.flags)}.`, args: { id: m.id, approve: Boolean(a.autorizar) } };
  },
  async execute(a, { db, staff }) {
    await resolveMovement(db, a.id as string, staff, a.approve as boolean);
    return { mensaje: a.approve ? "✅ Salida autorizada y aplicada al inventario." : "❌ Salida rechazada. Avisé al solicitante." };
  },
};

const registrarCompra: WriteTool = {
  kind: "write",
  name: "registrar_compra",
  description: "Registra una compra/gasto. Si es un artículo de almacén con cantidad, también da entrada al inventario.",
  roles: [...MGMT, "almacen"],
  parameters: obj({
    proveedor: str("Proveedor"),
    categoria: en(["refacciones", "aceites", "llantas", "combustible", "taller", "seguros_tramites", "herramienta", "otros"], "Categoría de gasto"),
    descripcion: str("Qué se compró"),
    total: num("Total en MXN con IVA"),
    grua: optStr("Grúa a la que se carga el gasto, o null si es general"),
    articulo: optStr("Artículo de almacén que entra (nombre o SKU), o null"),
    cantidad: optNum("Cantidad que entra al almacén, o null"),
    factura: optStr("Folio de factura o null"),
  }),
  async prepare(a, { db }) {
    const crane = a.grua ? await craneOrThrow(db, a.grua) : null;
    let item = null;
    if (a.articulo) {
      const m = await matchItems(db, String(a.articulo));
      if (m.length !== 1) throw new ToolError(m.length ? `Artículo ambiguo: ${m.slice(0, 6).map((x) => x.name).join(" / ")}.` : `No encontré "${a.articulo}" en el catálogo.`);
      item = m[0];
      if (!a.cantidad) throw new ToolError("Indica la cantidad que entra al almacén.");
    }
    return {
      summary: `Compra a *${a.proveedor}*: ${a.descripcion} · *${money(Number(a.total))}* (${PURCHASE_CATEGORY_LABELS[a.categoria as PurchaseCategory]})${crane ? ` · cargo a ${crane.code}` : ""}${item ? `\nEntrada al almacén: ${qtyUnit(Number(a.cantidad), item.unit)} de ${item.name}` : ""}`,
      args: { supplier: a.proveedor, category: a.categoria, description: a.descripcion, total: Number(a.total), craneId: crane?.id ?? null, itemId: item?.id ?? null, qty: a.cantidad ?? null, invoice: a.factura ?? null },
    };
  },
  async execute(a, { db, staff, channel }) {
    await registerPurchase(db, {
      supplier: a.supplier as string,
      category: a.category as PurchaseCategory,
      description: a.description as string,
      total: a.total as number,
      craneId: a.craneId as string | null,
      invoiceNumber: a.invoice as string | null,
      lines: a.itemId ? [{ itemId: a.itemId as string, qty: a.qty as number, unitCost: Math.round(((a.total as number) / (a.qty as number)) * 100) / 100 }] : [],
      registeredBy: staff.id,
      channel,
    });
    return { mensaje: `✅ Compra registrada${a.itemId ? " y entrada aplicada al almacén" : ""}.` };
  },
};

export const TOOLS: Tool[] = [
  consultarFlota,
  consultarGrua,
  buscarDisponibilidad,
  consultarAgenda,
  consultarInventario,
  alertasInventario,
  resumenGastos,
  documentosPorVencer,
  estadoRevisiones,
  buscarPolitica,
  consultarOperadores,
  enviarRevision,
  crearRenta,
  programarRevision,
  reportarDetencion,
  liberarGrua,
  programarMantenimiento,
  registrarSalida,
  resolverSalida,
  registrarCompra,
];

export function toolsFor(staff: Staff) {
  return TOOLS.filter((t) => !t.roles || t.roles.includes(staff.role));
}

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);
