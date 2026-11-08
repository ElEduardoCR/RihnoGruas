import type { ReadTool, WriteTool, ToolCtx } from "./tools";
import type { Rental, StaffRole } from "@/lib/types";
import type { Scalar } from "@/lib/db/types";
import { ToolError } from "./tool-error";
import { findCrane } from "@/lib/services/fleet";
import { cancelRental } from "@/lib/services/rentals";
import { getStock, registerCount } from "@/lib/services/inventory";
import { env } from "@/lib/env";
import { norm } from "@/lib/text";
import { fmt, money, zonedParts } from "@/lib/time";

type Args = Record<string, unknown>;
const SALES: StaffRole[] = ["direccion", "administracion", "ventas"];
const STORE: StaffRole[] = ["direccion", "administracion", "almacen"];
const str = (description: string) => ({ type: "string", description });
const optional = (type: string, description: string) => ({ type: [type, "null"], description });
const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const link = (path: string) => `${env.appUrl.replace(/\/$/, "")}${path}`;
function permitted(ctx: ToolCtx, roles: StaffRole[]) {
  if (!ctx.staff.active || !roles.includes(ctx.staff.role)) throw new ToolError("Tu rol no tiene permiso para esta operación.");
}
function required(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new ToolError(`Indica ${label}.`);
  return value.trim();
}
function dayOf(iso: string) {
  const p = zonedParts(new Date(iso));
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
async function rentalById(ctx: ToolCtx, id: unknown) {
  permitted(ctx, SALES);
  const rental = await ctx.db.get("rentals", required(id, "la renta obtenida de consultar_rentas"));
  if (!rental) throw new ToolError("No encontré esa renta. Consulta las rentas para elegir una vigente.");
  return rental;
}
async function rentalLabel(ctx: ToolCtx, r: Rental) {
  const [crane, client] = await Promise.all([ctx.db.get("cranes", r.crane_id), ctx.db.get("clients", r.client_id)]);
  return `${crane?.code ?? "Unidad"} · ${client?.name ?? "Cliente"} · ${fmt.dateTime(r.start_at)} → ${fmt.dateTime(r.end_at)}`;
}
function editable(r: Rental) {
  if (!["cotizada", "confirmada", "en_curso"].includes(r.status)) throw new ToolError("Esta renta ya está finalizada o cancelada; conserva su historial y solicita una renta nueva.");
}
function unchanged(row: Rental, expected: Record<string, unknown>) {
  if (Object.entries(expected).some(([key, value]) => row[key as keyof Rental] !== value)) {
    throw new ToolError("La renta cambió desde que preparé el resumen. Consulta de nuevo y prepara una propuesta actualizada.");
  }
}

const consultarRentas: ReadTool = {
  kind: "read", name: "consultar_rentas", roles: SALES,
  description: "Busca rentas existentes por unidad, cliente o fecha y devuelve su identificador. Úsala antes de corregir dirección/notas/tarifa o cancelar; si hay varias, pide elegir por unidad/cliente/fechas, nunca pide UUID al usuario.",
  parameters: obj({ grua: optional("string", "Código o nombre de unidad, null para todas"), cliente: optional("string", "Nombre o contacto del cliente, null para todos"), fecha: optional("string", "Día local YYYY-MM-DD incluido en la renta, null sin filtro") }),
  async run(a, ctx) {
    permitted(ctx, SALES);
    const crane = a.grua ? await findCrane(ctx.db, String(a.grua)) : null;
    if (a.grua && !crane) throw new ToolError("No encontré una única unidad; indica su código completo.");
    const date = a.fecha == null ? null : required(a.fecha, "la fecha");
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new ToolError("La fecha debe ser un día válido YYYY-MM-DD.");
    const [rentals, cranes, clients] = await Promise.all([ctx.db.select("rentals", { order: { column: "start_at", ascending: false } }), ctx.db.select("cranes"), ctx.db.select("clients")]);
    const q = norm(String(a.cliente ?? ""));
    const matches = rentals.filter(r => {
      const client = clients.find(c => c.id === r.client_id);
      return (!crane || r.crane_id === crane.id) && (!q || norm(`${client?.name ?? ""} ${client?.contact_name ?? ""}`).includes(q)) && (!date || (dayOf(r.start_at) <= date && dayOf(r.end_at) >= date));
    });
    return { total: matches.length, rentas: matches.slice(0, 30).map(r => ({ renta_id: r.id, grua: cranes.find(c => c.id === r.crane_id)?.code, cliente: clients.find(c => c.id === r.client_id)?.name, inicio: fmt.dateTime(r.start_at), fin: fmt.dateTime(r.end_at), estado: r.status, direccion_obra: r.site_address, notas_sitio: r.site_notes, notas: r.notes, tarifa: r.rate, unidad_tarifa: r.rate_unit, url: link(`/gruas/${r.crane_id}#agenda`) })) };
  },
};

const rentalFields = { direccion_obra: "site_address", notas_sitio: "site_notes", notas: "notes", tarifa: "rate", unidad_tarifa: "rate_unit" } as const;
const fieldLabels: Record<string, string> = { site_address: "Dirección de obra", site_notes: "Condiciones del sitio", notes: "Notas", rate: "Tarifa", rate_unit: "Unidad de tarifa" };
function rentalPatch(a: Args): Partial<Rental> {
  const patch: Partial<Rental> = {};
  for (const [key, field] of Object.entries(rentalFields)) {
    const value = a[key];
    if (value == null) continue;
    if (field === "rate") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new ToolError("La tarifa debe ser un número no negativo.");
      patch.rate = value;
    } else if (field === "rate_unit") {
      if (!["dia", "hora", "servicio"].includes(String(value))) throw new ToolError("La unidad de tarifa debe ser día, hora o servicio.");
      patch.rate_unit = value as Rental["rate_unit"];
    } else {
      const text = required(value, fieldLabels[field]);
      if (text.length > 2000) throw new ToolError("Resume el texto en menos de 2,000 caracteres.");
      patch[field] = text;
    }
  }
  if (!Object.keys(patch).length) throw new ToolError("Indica qué dato de la renta necesitas corregir.");
  return patch;
}
const actualizarRenta: WriteTool = {
  kind: "write", name: "actualizar_renta", roles: SALES,
  description: "Corrige dirección de obra, condiciones del sitio, notas, tarifa o unidad de cobro de una renta existente. Consulta primero consultar_rentas. Null conserva el dato. No cambia fechas, grúa, cliente ni operador.",
  parameters: obj({ renta_id: str("Identificador devuelto por consultar_rentas"), direccion_obra: optional("string", "Nueva dirección, null conserva"), notas_sitio: optional("string", "Nuevas condiciones del sitio, null conserva"), notas: optional("string", "Nuevas notas, null conserva"), tarifa: optional("number", "Nueva tarifa MXN, null conserva"), unidad_tarifa: { type: ["string", "null"], enum: ["dia", "hora", "servicio", null], description: "Unidad de cobro, null conserva" } }),
  async prepare(a, ctx) {
    const r = await rentalById(ctx, a.renta_id); editable(r);
    const patch = rentalPatch(a);
    const changes = Object.entries(patch).filter(([key, value]) => r[key as keyof Rental] !== value);
    if (!changes.length) throw new ToolError("La renta ya tiene esos datos; no hay cambios que aplicar.");
    const expected = Object.fromEntries([...["status", "crane_id", "client_id", "start_at", "end_at"].map(k => [k, r[k as keyof Rental]]), ...Object.keys(patch).map(k => [k, r[k as keyof Rental]])]);
    return { summary: `Actualizar renta *${await rentalLabel(ctx, r)}*:\n${changes.map(([k, v]) => `• ${fieldLabels[k]}: ${r[k as keyof Rental] ?? "sin dato"} → ${k === "rate" ? money(v as number) : v}`).join("\n")}`, args: { renta_id: r.id, values: a, expected } };
  },
  async execute(a, ctx) {
    const r = await rentalById(ctx, a.renta_id); editable(r);
    if (!a.expected || typeof a.expected !== "object" || !a.values || typeof a.values !== "object") throw new ToolError("Propuesta inválida; prepara nuevamente el cambio.");
    unchanged(r, a.expected as Record<string, unknown>);
    const saved = await ctx.db.updateWhere("rentals", r.id, rentalPatch(a.values as Args), a.expected as Record<string, Scalar>);
    if (!saved) throw new ToolError("La renta cambió al confirmar. Consulta de nuevo y prepara una propuesta con los valores actuales.");
    const url = link(`/gruas/${r.crane_id}#agenda`);
    return { mensaje: `Datos de la renta actualizados. [Ver agenda de la unidad](${url})`, url, etiqueta: "Ver agenda de la unidad" };
  },
};

const cancelarRenta: WriteTool = {
  kind: "write", name: "cancelar_renta", roles: SALES,
  description: "Cancela una renta cotizada o confirmada que todavía no empieza y sus revisiones pendientes. Busca primero consultar_rentas y muestra unidad, cliente y fechas antes de confirmar. No cancela servicios en curso o finalizados.",
  parameters: obj({ renta_id: str("Identificador obtenido de consultar_rentas") }),
  async prepare(a, ctx) {
    const r = await rentalById(ctx, a.renta_id);
    cancellable(r, ctx);
    const inspections = await ctx.db.select("inspections", { eq: { rental_id: r.id }, in: { status: ["programada", "vencida"] } });
    return { summary: `Cancelar renta *${await rentalLabel(ctx, r)}*.\nTambién se cancelarán ${inspections.length} revisiones pendientes vinculadas. Se conservará el historial.`, args: { renta_id: r.id, expected: { status: r.status, crane_id: r.crane_id, client_id: r.client_id, start_at: r.start_at, end_at: r.end_at } } };
  },
  async execute(a, ctx) {
    const r = await rentalById(ctx, a.renta_id); cancellable(r, ctx);
    if (!a.expected || typeof a.expected !== "object") throw new ToolError("Propuesta inválida; prepara nuevamente la cancelación.");
    unchanged(r, a.expected as Record<string, unknown>);
    await cancelRental(ctx.db, r.id, a.expected as Record<string, Scalar>);
    const url = link(`/gruas/${r.crane_id}#agenda`);
    return { mensaje: `Renta y revisiones pendientes canceladas. [Ver agenda](${url})`, url, etiqueta: "Ver agenda" };
  },
};
function cancellable(r: Rental, ctx: ToolCtx) {
  if (!["cotizada", "confirmada"].includes(r.status) || Date.parse(r.start_at) <= ctx.now.getTime()) throw new ToolError("Sólo puedo cancelar rentas cotizadas o confirmadas que aún no empiezan. Esta renta requiere revisar su estado actual.");
}

const registrarConteo: WriteTool = {
  kind: "write", name: "registrar_conteo", roles: STORE,
  description: "Registra una cantidad físicamente contada por el usuario y ajusta existencias mediante un movimiento auditable. No inventa conteos. Distingue de cambiar mínimo/costo del catálogo. Si cambió el inventario después del resumen pide revisar el conteo.",
  parameters: obj({ articulo: str("SKU o nombre único del artículo"), cantidad_contada: { type: "number", minimum: 0, description: "Cantidad realmente contada y proporcionada por el usuario" }, notas: optional("string", "Notas del conteo o null") }),
  async prepare(a, ctx) {
    permitted(ctx, STORE);
    const q = norm(required(a.articulo, "el artículo"));
    const items = await getStock(ctx.db);
    const exact = items.filter(i => norm(i.sku) === q || norm(i.name) === q);
    const matches = exact.length ? exact : items.filter(i => norm(`${i.sku} ${i.name}`).includes(q));
    if (matches.length !== 1) throw new ToolError(matches.length ? `Elige el SKU: ${matches.slice(0, 6).map(i => `${i.sku} ${i.name}`).join(", ")}.` : "No encontré ese artículo.");
    validateCount(a.cantidad_contada);
    const item = matches[0];
    const notes = a.notas == null ? null : required(a.notas, "notas del conteo");
    return { summary: `Registrar conteo de *${item.sku} ${item.name}*: sistema ${item.stock} ${item.unit} → contado ${a.cantidad_contada} ${item.unit}.\nSe guardará el conteo y, si hay diferencia, un movimiento de ajuste.`, args: { itemId: item.id, countedQty: a.cantidad_contada, expectedStock: item.stock, expectedUnit: item.unit, notes } };
  },
  async execute(a, ctx) {
    permitted(ctx, STORE); validateCount(a.countedQty);
    const item = (await getStock(ctx.db)).find(i => i.id === a.itemId);
    if (!item || typeof a.expectedStock !== "number" || !Number.isFinite(a.expectedStock) || Math.abs(item.stock - a.expectedStock) > 1e-9 || item.unit !== a.expectedUnit) throw new ToolError("El inventario cambió desde el resumen. Revisa las existencias y prepara nuevamente el conteo.");
    const result = await registerCount(ctx.db, { itemId: item.id, countedQty: a.countedQty as number, countedBy: ctx.staff.id, expectedStock: a.expectedStock as number, expectedUnit: a.expectedUnit as string, notes: a.notes == null ? null : required(a.notes, "notas del conteo") });
    const url = link("/inventario");
    return { mensaje: `Conteo de ${item.sku} registrado: ${a.countedQty} ${item.unit}. ${result.variance === 0 ? "Coincide con el sistema." : `Ajuste aplicado: ${result.variance > 0 ? "+" : ""}${result.variance} ${item.unit}.`}${result.alertWarning ? ` ${result.alertWarning}` : ""} [Ver almacén](${url})`, url, etiqueta: "Ver almacén" };
  },
};
function validateCount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new ToolError("La cantidad contada debe ser un número no negativo.");
}

export const AGENDA_EDIT_TOOLS = [consultarRentas, actualizarRenta, cancelarRenta, registrarConteo];
