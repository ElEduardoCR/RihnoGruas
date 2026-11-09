import type { Db } from "@/lib/db/types";
import type { Channel, Client, CraneType, DowntimeCategory, PurchaseCategory, Staff, StaffRole } from "@/lib/types";
import { docStatus } from "@/lib/domain/fleet";
import { CHECKLIST_KIND_LABELS, CRANE_TYPE_LABELS, DOC_LABELS, PURCHASE_CATEGORY_LABELS } from "@/lib/labels";
import { env } from "@/lib/env";
import { findCrane, getCraneDossier, getEvents, getFleet } from "@/lib/services/fleet";
import { craneConflicts, createRental, documentIssues, findAvailable, identificationIssue, preInspectionTime } from "@/lib/services/rentals";
import { scheduleInspection, listInspections } from "@/lib/services/inspections";
import { releaseCrane, reportDowntime, scheduleMaintenance } from "@/lib/services/maintenance";
import { findMovement, getStock, inventoryWatch, registerPurchase, requestIssue, resolveMovement } from "@/lib/services/inventory";
import { expenseSummary, latestPurchases } from "@/lib/services/expenses";
import { assertManager, CatalogError, prepareCraneUpdate, saveClient, saveCrane, updateCrane, type CraneInput, type CranePatch } from "@/lib/services/catalogs";
import { inspectionLink, sendToStaff } from "@/lib/services/notify";
import { addDays, daysUntil, fmt, money, startOfDay, zonedDate, zonedParts } from "@/lib/time";
import { searchKnowledge } from "./knowledge";
import { norm } from "@/lib/text";
import { flagText, qtyUnit } from "@/lib/labels";
import { ToolError } from "./tool-error";
import { CATALOG_EDIT_TOOLS } from "./catalog-tools";
import { AGENDA_EDIT_TOOLS } from "./agenda-tools";
import { INVENTORY_CATALOG_TOOLS } from "./inventory-catalog-tools";

export { ToolError } from "./tool-error";

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
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2}))?$/);
  if (!m) throw new ToolError(`${label}: fecha inválida "${s}". Usa YYYY-MM-DD o YYYY-MM-DDTHH:mm.`);
  const [, y, mo, d, h, mi] = m;
  const hour = h ? Number(h) : defaultHour;
  const minute = mi ? Number(mi) : 0;
  const date = zonedDate(Number(y), Number(mo), Number(d), hour, minute);
  const p = zonedParts(date);
  if (p.year !== Number(y) || p.month !== Number(mo) || p.day !== Number(d) || p.hour !== hour || p.minute !== minute) {
    throw new ToolError(`${label}: esa fecha u hora no existe. Indica una fecha válida.`);
  }
  return date;
}

async function craneOrThrow(db: Db, q: unknown, includeInactive = false) {
  if (includeInactive) {
    const query = String(q ?? "").trim();
    const compact = (value: string) => norm(value).replace(/[\s-]+/g, "");
    const exact = (await db.select("cranes")).filter((crane) => crane.id === query || compact(crane.code) === compact(query));
    if (exact.length === 1) return exact[0];
  }
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
const appLink = (path: string, etiqueta: string) => ({ etiqueta, url: `${env.appUrl}${path}` });
const craneLink = (c: { id: string; code: string }) => appLink(`/gruas/${encodeURIComponent(c.id)}`, `Abrir ficha de ${c.code}`);

const APP_DESTINATIONS: Record<string, { path: string; label: string; roles?: StaffRole[] }> = {
  inicio: { path: "/", label: "Abrir asistente Rhino" },
  flota: { path: "/gruas", label: "Abrir flota y equipos" },
  calendario: { path: "/calendario", label: "Abrir calendario" },
  inventario: { path: "/inventario", label: "Abrir inventario" },
  checklists: { path: "/checklists", label: "Abrir revisiones" },
  catalogos: { path: "/catalogos", label: "Abrir catálogos", roles: MGMT },
  clientes: { path: "/catalogos?tab=clientes", label: "Abrir catálogo de clientes", roles: MGMT },
  personal: { path: "/catalogos?tab=personal", label: "Abrir catálogo de personal", roles: MGMT },
  articulos: { path: "/catalogos?tab=articulos", label: "Abrir catálogo de artículos", roles: MGMT },
  resumen: { path: "/resumen", label: "Abrir resumen de la operación", roles: MGMT },
  agente: { path: "/agente", label: "Abrir centro del agente", roles: MGMT },
  cuenta: { path: "/cuenta", label: "Abrir mi cuenta" },
};

const navegarApp: ReadTool = {
  kind: "read",
  name: "navegar_app",
  description: "Obtiene un enlace fiable para abrir una pantalla de Rhino cuando el usuario pide ir, abrir, ver la ficha o 'llévame ahí'. Usa ficha_grua y el código de la unidad mencionada para su expediente. Devuelve etiqueta y URL; no cambia datos ni abre pantallas automáticamente.",
  parameters: obj({
    destino: en(["ficha_grua", ...Object.keys(APP_DESTINATIONS)], "Pantalla de Rhino que el usuario quiere abrir"),
    grua: optStr("Código de la unidad para ficha_grua; null para los módulos generales"),
  }),
  async run(a, { db, staff }) {
    if (!staff.active) throw new ToolError("Necesitas una cuenta activa para abrir las pantallas de Rhino.");
    if (a.destino === "ficha_grua") {
      if (typeof a.grua !== "string" || !a.grua.trim()) throw new ToolError("Indica qué unidad quieres abrir, por ejemplo GR-03.");
      return craneLink(await craneOrThrow(db, a.grua, true));
    }
    const destination = typeof a.destino === "string" && Object.hasOwn(APP_DESTINATIONS, a.destino) ? APP_DESTINATIONS[a.destino] : null;
    if (!destination) throw new ToolError("Esa pantalla no existe en Rhino. Elige flota, calendario, inventario, revisiones o uno de los módulos disponibles.");
    if (destination.roles && !destination.roles.includes(staff.role)) throw new ToolError("Tu perfil no tiene permiso para abrir ese módulo. Pide acceso a Dirección o Administración.");
    return appLink(destination.path, destination.label);
  },
};

// ---------------------------------------------------------------- herramientas de lectura
const consultarCapacidades: ReadTool = {
  kind: "read",
  name: "consultar_capacidades",
  description: "Acciones y consultas que este usuario puede pedir al agente según su rol. Úsala para orientar a alguien nuevo o comprobar el alcance antes de prometer una operación.",
  parameters: obj({}),
  async run(_a, { staff }) {
    return {
      consultas: toolsFor(staff).filter((t) => t.kind === "read" && t.name !== "consultar_capacidades").map((t) => ({ nombre: t.name, descripcion: t.description })),
      acciones: toolsFor(staff).filter((t) => t.kind === "write").map((t) => ({ nombre: t.name, descripcion: t.description })),
      proceso: "Consultar datos y condiciones, pedir sólo datos indispensables, preparar el resumen y ejecutar al confirmar. No se pueden ejecutar acciones ausentes de esta lista.",
    };
  },
};

const consultarClientes: ReadTool = {
  kind: "read",
  name: "consultar_clientes",
  description: "Busca clientes por nombre o contacto para evitar pedir datos que ya están registrados. Devuelve coincidencias para que el usuario pueda elegir si el nombre es ambiguo.",
  roles: [...MGMT, "ventas"],
  parameters: obj({ buscar: optStr("Nombre del cliente o contacto, o null para ver los primeros clientes") }),
  async run(a, { db }) {
    const q = norm(String(a.buscar ?? ""));
    const clients = await db.select("clients", { order: { column: "name" } });
    return clients.filter((c) => !q || norm(`${c.name} ${c.contact_name ?? ""}`).includes(q)).slice(0, 30)
      .map((c) => ({ nombre: c.name, contacto: c.contact_name, telefono: c.phone, correo: c.email, rfc: c.rfc, direccion: c.address }));
  },
};

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
      grua_id: c.id,
      enlace: craneLink(c),
      tipo: CRANE_TYPE_LABELS[c.type],
      marca_modelo: `${c.brand} ${c.model} ${c.year ?? ""}`.trim(),
      capacidad_t: c.capacity_tons,
      pluma_m: c.boom_length_m,
      placas: c.plates,
      serie: c.serial_number,
      horometro_h: c.hour_meter,
      ficha_investigada: c.fleet_profile ? {
        identificacion: c.fleet_profile.identification_status,
        capacidad_reportada_original: c.fleet_profile.reported_capacity,
        alcance_reportado_original: c.fleet_profile.reported_reach,
        pendientes: c.fleet_profile.pending.slice(0, 8),
        fuentes: c.fleet_profile.sources.slice(0, 5).map(({ title, url }) => ({ titulo: title, url })),
        planes: c.fleet_profile.maintenance_plans.map(({ id, title }) => ({ id, titulo: title })),
        aviso: "La investigación conserva lo reportado originalmente; capacidad_t es el dato vigente de la ficha. Ninguno sustituye la tabla de cargas o documentos de la unidad.",
      } : null,
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
  description: "Existencias del almacén (aceites, filtros, llantas, refacciones, consumibles, herramienta) con unidad de consumo, mínimo, costo por unidad, ubicación, notas de presentación y grúas compatibles.",
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
      notas: s.notes,
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
const textValue = (value: unknown) => typeof value === "string" ? value.trim() || null : null;
const catalogFailure = (error: unknown): never => {
  if (error instanceof CatalogError) throw new ToolError(error.message);
  throw error;
};

const registrarCliente: WriteTool = {
  kind: "write",
  name: "registrar_cliente",
  description: "Da de alta un cliente desde la conversación. Sólo el nombre es indispensable; no inventes RFC, teléfono o correo. Comprueba duplicados antes de preparar el alta.",
  roles: MGMT,
  parameters: obj({ nombre: str("Nombre o razón social"), contacto: optStr("Persona de contacto"), telefono: optStr("Teléfono"), correo: optStr("Correo"), rfc: optStr("RFC"), direccion: optStr("Dirección"), notas: optStr("Notas") }),
  async prepare(a, { db, staff }) {
    assertManager(staff);
    const name = textValue(a.nombre);
    if (!name) throw new ToolError("Indica el nombre del cliente.");
    const clients = await db.select("clients");
    if (clients.some((c) => norm(c.name) === norm(name))) throw new ToolError(`El cliente ${name} ya está registrado. Puedo consultar sus datos.`);
    const email = textValue(a.correo)?.toLowerCase() ?? null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ToolError("El correo no tiene un formato válido.");
    const rfc = textValue(a.rfc)?.toUpperCase() ?? null;
    if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) throw new ToolError("El RFC no tiene un formato válido.");
    const input: Omit<Client, "id" | "created_at"> = { name, contact_name: textValue(a.contacto), phone: textValue(a.telefono), email, rfc, address: textValue(a.direccion), notes: textValue(a.notas) };
    return {
      summary: [`Registrar al cliente *${name}*.`, ...Object.entries({ Contacto: input.contact_name, Teléfono: input.phone, Correo: input.email, RFC: input.rfc, Dirección: input.address, Notas: input.notes }).filter(([, v]) => v).map(([label, value]) => `${label}: ${value}`), "Los datos no proporcionados quedarán pendientes."].join("\n"),
      args: { input },
    };
  },
  async execute(a, { db, staff }) {
    assertManager(staff);
    const client = await saveClient(db, a.input as Omit<Client, "id" | "created_at">);
    return { mensaje: `✅ Cliente *${client.name}* registrado. Ya puedes pedirme una renta a su nombre.`, cliente_id: client.id };
  },
};

const registrarGrua: WriteTool = {
  kind: "write",
  name: "registrar_grua",
  description: "Da de alta una unidad de la flotilla con código, nombre, tipo, marca y modelo. Capacidad, año, serie y tarifa pueden quedar pendientes; no los deduzcas del modelo. El alta no verifica documentos ni habilita operadores.",
  roles: MGMT,
  parameters: obj({ codigo: str("Número económico único, incluido su prefijo"), nombre: str("Nombre de la unidad"), tipo: en(CRANE_TYPES, "Tipo de unidad"), marca: str("Marca"), modelo: str("Modelo"), anio: optNum("Año confirmado o null"), capacidad_toneladas: optNum("Capacidad verificada en toneladas o null"), numero_serie: optStr("Número de serie o null"), placas: optStr("Placas o null"), tarifa_diaria: optNum("Tarifa diaria en MXN o null"), notas: optStr("Notas o null") }),
  async prepare(a, { db, staff }) {
    assertManager(staff);
    const code = textValue(a.codigo)?.toUpperCase().replace(/\s+/g, "-");
    const name = textValue(a.nombre);
    const brand = textValue(a.marca);
    const model = textValue(a.modelo);
    if (!code || !name || !brand || !model) throw new ToolError("Para registrar la unidad necesito número económico, nombre, marca y modelo.");
    if (!CRANE_TYPES.includes(String(a.tipo))) throw new ToolError("Indica un tipo de unidad válido.");
    for (const field of ["anio", "capacidad_toneladas", "tarifa_diaria"]) {
      if (a[field] != null && (typeof a[field] !== "number" || !Number.isFinite(a[field]) || Number(a[field]) < 0)) throw new ToolError(`${field}: indica un número válido o déjalo pendiente.`);
    }
    if (a.anio != null && (!Number.isInteger(a.anio) || Number(a.anio) < 1950 || Number(a.anio) > 2100)) throw new ToolError("Indica un año válido.");
    if (a.capacidad_toneladas === 0) throw new ToolError("La capacidad debe ser mayor que cero o quedar pendiente.");
    if ((await db.select("cranes", { eq: { code } })).length) throw new ToolError(`Ya existe una unidad con el número económico ${code}.`);
    const input: CraneInput = { code, name, type: a.tipo as CraneType, brand, model, year: (a.anio as number | null) ?? null, capacity_tons: (a.capacidad_toneladas as number | null) ?? null, serial_number: textValue(a.numero_serie), plates: textValue(a.placas), daily_rate: (a.tarifa_diaria as number | null) ?? null, notes: textValue(a.notas), boom_length_m: null, vin: null, hour_meter: null, odometer_km: null, service_interval_hours: null, last_service_hours: null, base_location: null, acquired_on: null, active: true };
    return {
      summary: [`Registrar *${code} ${name}*: ${brand} ${model} · ${CRANE_TYPE_LABELS[input.type]}.`, `Capacidad: ${input.capacity_tons == null ? "pendiente" : `${input.capacity_tons} t`} · tarifa: ${input.daily_rate == null ? "pendiente" : `${money(input.daily_rate)}/día`}.`, `Año: ${input.year ?? "pendiente"} · serie: ${input.serial_number ?? "pendiente"} · placas: ${input.plates ?? "pendientes"}.`, ...(input.notes ? [`Notas: ${input.notes}`] : []), "El alta no verifica documentos, tabla de cargas ni operadores."].join("\n"),
      args: { input },
    };
  },
  async execute(a, { db, staff }) {
    assertManager(staff);
    const crane = await saveCrane(db, a.input as CraneInput);
    return { mensaje: `✅ Unidad *${crane.code} ${crane.name}* registrada. Faltan los documentos y operadores aprobados; el alta por sí sola no acredita que esté lista para trabajar.`, grua_id: crane.id };
  },
};

const CRANE_UPDATE_FIELDS: Record<string, { field: keyof CraneInput; label: string; parameter: Schema; clearable?: boolean; unit?: string }> = {
  codigo: { field: "code", label: "Número económico", parameter: optStr("Nuevo número económico; null conserva el actual") },
  nombre: { field: "name", label: "Nombre", parameter: optStr("Nuevo nombre de la unidad; null conserva") },
  tipo: { field: "type", label: "Tipo de unidad", parameter: optEn(CRANE_TYPES, "Nuevo tipo; null conserva") },
  marca: { field: "brand", label: "Marca", parameter: optStr("Marca proporcionada por el usuario; null conserva") },
  modelo: { field: "model", label: "Modelo", parameter: optStr("Modelo proporcionado por el usuario; null conserva") },
  anio: { field: "year", label: "Año", parameter: optNum("Año proporcionado; null conserva"), clearable: true },
  capacidad_toneladas: { field: "capacity_tons", label: "Capacidad", parameter: optNum("Capacidad en toneladas indicada por Administración; no exige certificarla para registrarla. Null conserva"), clearable: true, unit: "t" },
  pluma_metros: { field: "boom_length_m", label: "Longitud de pluma", parameter: optNum("Metros de pluma proporcionados; null conserva"), clearable: true, unit: "m" },
  numero_serie: { field: "serial_number", label: "Número de serie", parameter: optStr("Número de serie; null conserva"), clearable: true },
  vin: { field: "vin", label: "VIN", parameter: optStr("VIN; null conserva"), clearable: true },
  placas: { field: "plates", label: "Placas", parameter: optStr("Placas; null conserva"), clearable: true },
  horometro_horas: { field: "hour_meter", label: "Horómetro", parameter: optNum("Lectura actual en horas; null conserva"), clearable: true, unit: "h" },
  odometro_km: { field: "odometer_km", label: "Odómetro", parameter: optNum("Lectura actual en kilómetros; null conserva"), clearable: true, unit: "km" },
  intervalo_servicio_horas: { field: "service_interval_hours", label: "Intervalo de servicio", parameter: optNum("Intervalo en horas indicado por el usuario; null conserva"), clearable: true, unit: "h" },
  ultimo_servicio_horas: { field: "last_service_hours", label: "Horómetro del último servicio", parameter: optNum("Lectura en horas del último servicio; null conserva"), clearable: true, unit: "h" },
  ubicacion_base: { field: "base_location", label: "Ubicación base", parameter: optStr("Base de la unidad; null conserva"), clearable: true },
  tarifa_diaria: { field: "daily_rate", label: "Tarifa diaria", parameter: optNum("Tarifa diaria en MXN; null conserva"), clearable: true, unit: "MXN/día" },
  fecha_adquisicion: { field: "acquired_on", label: "Fecha de adquisición", parameter: optStr("Fecha real YYYY-MM-DD; null conserva"), clearable: true },
  notas: { field: "notes", label: "Notas", parameter: optStr("Texto completo de notas que el usuario pidió guardar; null conserva"), clearable: true },
  activa: { field: "active", label: "Unidad activa", parameter: { type: ["boolean", "null"], description: "true activa, false desactiva; null conserva. Sólo si el usuario lo pide expresamente" } },
};

function cranePatchFromArgs(a: Args): CranePatch {
  const allowed = new Set(["grua", "borrar_campos", ...Object.keys(CRANE_UPDATE_FIELDS)]);
  if (Object.keys(a).some((field) => !allowed.has(field))) throw new ToolError("La solicitud contiene un campo que no se puede editar en la ficha de la unidad.");
  const entries: [keyof CraneInput, unknown][] = [];
  for (const [name, spec] of Object.entries(CRANE_UPDATE_FIELDS)) {
    const value = a[name];
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) throw new ToolError(`${spec.label}: proporciona el dato o solicita explícitamente borrarlo.`);
    entries.push([spec.field, typeof value === "string" ? value.trim() : value]);
  }
  const clear = a.borrar_campos ?? [];
  if (!Array.isArray(clear)) throw new ToolError("borrar_campos debe ser una lista de campos solicitados expresamente por el usuario.");
  for (const field of new Set(clear)) {
    const spec = typeof field === "string" && Object.hasOwn(CRANE_UPDATE_FIELDS, field) ? CRANE_UPDATE_FIELDS[field] : null;
    if (!spec?.clearable) throw new ToolError(`No se puede borrar el campo ${String(field)}.`);
    if (a[field as string] != null) throw new ToolError(`${spec.label}: elige entre guardar un valor o borrarlo.`);
    entries.push([spec.field, null]);
  }
  return Object.fromEntries(entries) as CranePatch;
}

function craneChanges(patch: CranePatch, before: CranePatch) {
  return Object.values(CRANE_UPDATE_FIELDS).filter((spec) => Object.hasOwn(patch, spec.field)).map((spec) => ({
    campo: spec.label,
    antes: before[spec.field] ?? null,
    despues: patch[spec.field] ?? null,
    unidad: spec.unit ?? null,
  }));
}

const craneValue = (value: unknown, unit: string | null) => value == null ? "pendiente" : typeof value === "boolean" ? (value ? "sí" : "no") : `${value}${unit ? ` ${unit}` : ""}`;

const actualizarGrua: WriteTool = {
  kind: "write",
  name: "actualizar_grua",
  description: "Actualiza datos de una unidad EXISTENTE, por ejemplo 'agrega que GR 03 tiene capacidad de 12 toneladas'. Guarda el dato proporcionado por Dirección/Administración sin exigir documentación para capturarlo. Sólo cambia campos pedidos: null u omitido conserva, borrar_campos sólo borra lo solicitado explícitamente. Presenta antes/después y espera confirmación. No certifica tabla de cargas/documentos ni aprueba inspecciones; conserva investigación y datos no pedidos.",
  roles: MGMT,
  parameters: obj({
    grua: str("Código de la unidad existente, por ejemplo GR 03 o GR-03; también nombre/modelo único"),
    ...Object.fromEntries(Object.entries(CRANE_UPDATE_FIELDS).map(([name, spec]) => [name, spec.parameter])),
    borrar_campos: { type: "array", items: en(Object.entries(CRANE_UPDATE_FIELDS).filter(([, spec]) => spec.clearable).map(([name]) => name), "Campo que el usuario solicitó borrar"), description: "[] normalmente. Sólo campos que el usuario pidió explícitamente dejar sin dato" },
  }),
  async prepare(a, { db, staff }) {
    assertManager(staff);
    const crane = await craneOrThrow(db, a.grua, true);
    const prepared = await prepareCraneUpdate(db, crane.id, cranePatchFromArgs(a), staff).catch(catalogFailure);
    const changes = craneChanges(prepared.patch, prepared.before);
    const link = craneLink(crane);
    return {
      summary: [
        `Actualizar *${craneLabel(crane)}*:`,
        ...changes.map((change) => `${change.campo}: ${craneValue(change.antes, change.unidad)} → ${craneValue(change.despues, change.unidad)}.`),
        ...(Object.hasOwn(prepared.patch, "capacity_tons") ? ["La capacidad se registra como dato proporcionado por Administración. Este cambio no certifica la tabla de cargas ni los documentos y no aprueba inspecciones."] : []),
        "Los demás datos y la investigación de la unidad se conservan.",
        `[${link.etiqueta}](${link.url})`,
      ].join("\n"),
      args: { craneId: crane.id, patch: prepared.patch, before: prepared.before },
    };
  },
  async execute(a, { db, staff }) {
    assertManager(staff);
    if (typeof a.craneId !== "string" || !a.craneId) throw new ToolError("La unidad de la propuesta no es válida. Prepara una nueva solicitud.");
    const crane = await updateCrane(db, a.craneId, a.patch as CranePatch, a.before as CranePatch, staff).catch(catalogFailure);
    const changes = craneChanges(a.patch as CranePatch, a.before as CranePatch);
    const link = craneLink(crane);
    return {
      mensaje: [`✅ Ficha de *${craneLabel(crane)}* actualizada.`, ...changes.map((change) => `${change.campo}: ${craneValue(change.antes, change.unidad)} → ${craneValue(change.despues, change.unidad)}.`), ...(Object.hasOwn(a.patch as object, "capacity_tons") ? ["Capacidad registrada como dato proporcionado por Administración; no certifica tabla de cargas/documentos ni aprueba inspecciones."] : []), `[${link.etiqueta}](${link.url})`].join("\n"),
      grua_id: crane.id,
      enlace: link,
      cambios: changes,
    };
  },
};

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
  consultarCapacidades,
  navegarApp,
  consultarClientes,
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
  registrarCliente,
  registrarGrua,
  actualizarGrua,
  ...CATALOG_EDIT_TOOLS,
  ...AGENDA_EDIT_TOOLS,
  ...INVENTORY_CATALOG_TOOLS,
];

export function toolsFor(staff: Staff) {
  return TOOLS.filter((t) => (!t.roles || t.roles.includes(staff.role)) && (t.name !== "resolver_salida" || staff.can_authorize));
}

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);
