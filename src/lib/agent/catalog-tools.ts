import type { WriteTool } from "./tools";
import { ToolError } from "./tool-error";
import type { Db } from "@/lib/db/types";
import { INVENTORY_CATEGORY_LABELS } from "@/lib/labels";
import { env } from "@/lib/env";
import { norm } from "@/lib/text";
import { assertManager, CatalogError } from "@/lib/services/catalogs";
import { editClient, editItem, requestedChanges, validateClientName, validateClientPatch, validateItemPatch, type CatalogPatch } from "@/lib/services/catalog-edits";

const optionalText = (description: string) => ({ type: ["string", "null"], description: `${description}; null conserva el valor actual.` });
const optionalNumber = (description: string) => ({ type: ["number", "null"], description: `${description}; null conserva el valor actual.` });
const fields = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const clearFields = (values: string[]) => ({ type: "array", items: { type: "string", enum: values }, description: "Sólo los campos que el usuario pidió borrar explícitamente; [] si no pidió borrar." });

const CLIENT_MAP: Record<string, string> = { nombre: "name", contacto: "contact_name", telefono: "phone", correo: "email", rfc: "rfc", direccion: "address", notas: "notes" };
const ITEM_MAP: Record<string, string> = { nombre: "name", categoria: "category", ubicacion: "location", minimo: "min_stock", costo_unitario: "unit_cost", notas: "notes" };
const LABELS: Record<string, string> = { name: "Nombre", contact_name: "Contacto", phone: "Teléfono", email: "Correo", rfc: "RFC", address: "Dirección", notes: "Notas", category: "Categoría", unit: "Unidad", location: "Ubicación", min_stock: "Existencia mínima", unit_cost: "Costo unitario" };

function patchFromArgs(args: Record<string, unknown>, mapping: Record<string, string>, clearable: string[], selector: string) {
  const allowed = new Set([selector, "borrar_campos", ...Object.keys(mapping)]);
  for (const key of Object.keys(args)) if (!allowed.has(key)) throw new CatalogError(`No se puede cambiar ${key} con esta operación.`);
  const patch: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(mapping)) if (args[key] !== undefined && args[key] !== null) patch[column] = args[key];
  const erase = args.borrar_campos ?? [];
  if (!Array.isArray(erase) || erase.some((field) => typeof field !== "string" || !clearable.includes(field))) throw new CatalogError("La lista de campos que quieres borrar no es válida.");
  for (const field of erase as string[]) {
    if (Object.hasOwn(patch, mapping[field])) throw new CatalogError(`Indica si quieres cambiar o borrar ${field}, no ambas cosas.`);
    patch[mapping[field]] = null;
  }
  return patch;
}

function selector(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new CatalogError(`Indica ${label}.`);
  return value.trim();
}

async function findClient(db: Db, query: unknown) {
  const q = selector(query, "el cliente que quieres editar");
  const clients = await db.select("clients");
  const exact = clients.filter((client) => client.id === q || norm(client.name) === norm(q));
  const matches = exact.length ? exact : clients.filter((client) => norm(`${client.name} ${client.contact_name ?? ""}`).includes(norm(q)));
  if (matches.length !== 1) throw new CatalogError(matches.length ? `Hay varios clientes que coinciden: ${matches.map((client) => client.name).join(", ")}. Indica el nombre completo.` : `No encontré el cliente ${q}. Consulta los clientes registrados.`);
  return matches[0];
}

async function findItem(db: Db, query: unknown) {
  const q = selector(query, "el artículo o su SKU");
  const items = await db.select("inventory_items", { eq: { active: true } });
  const compact = (value: string) => norm(value).replace(/[\s_-]+/g, "");
  const exact = items.filter((item) => item.id === q || compact(item.sku) === compact(q) || norm(item.name) === norm(q));
  const matches = exact.length ? exact : items.filter((item) => norm(`${item.sku} ${item.name}`).includes(norm(q)));
  if (matches.length !== 1) throw new CatalogError(matches.length ? `Hay varios artículos que coinciden: ${matches.map((item) => `${item.sku} ${item.name}`).join(", ")}. Indica el SKU.` : `No encontré el artículo ${q}. Consulta el inventario.`);
  return matches[0];
}

function summary(label: string, patch: CatalogPatch, before: CatalogPatch) {
  const show = (value: unknown) => value === null ? "sin dato" : String(value);
  return [`Actualizar ${label}:`, ...Object.keys(patch).map((key) => `• ${LABELS[key]}: ${show(before[key])} → ${show(patch[key])}`)].join("\n");
}

const updateClient: WriteTool = {
  kind: "write", name: "actualizar_cliente", roles: ["direccion", "administracion"],
  description: "Edita datos de un cliente existente: nombre, contacto, teléfono, correo, RFC, dirección o notas. Sólo cambia lo solicitado, null conserva; borrar_campos requiere petición explícita. Prepara resumen antes/después y requiere confirmación.",
  parameters: fields({
    cliente: { type: "string", description: "Nombre completo o ID del cliente existente." },
    nombre: optionalText("Nombre o razón social"), contacto: optionalText("Persona de contacto"), telefono: optionalText("Teléfono"), correo: optionalText("Correo electrónico"), rfc: optionalText("RFC"), direccion: optionalText("Dirección"), notas: optionalText("Notas completas que desea guardar"),
    borrar_campos: clearFields(["contacto", "telefono", "correo", "rfc", "direccion", "notas"]),
  }),
  async prepare(args, { db, staff }) {
    assertManager(staff);
    const client = await findClient(db, args.cliente);
    const candidate = validateClientPatch(patchFromArgs(args, CLIENT_MAP, ["contacto", "telefono", "correo", "rfc", "direccion", "notas"], "cliente"));
    await validateClientName(db, client.id, candidate);
    const { patch, before } = requestedChanges(client, candidate);
    return { summary: summary(`al cliente *${client.name}*`, patch, before), args: { clientId: client.id, patch, before } };
  },
  async execute(args, { db, staff }) {
    const client = await editClient(db, selector(args.clientId, "el cliente de la propuesta"), args.patch, args.before, staff);
    const url = `${env.appUrl}/catalogos?tab=clientes`;
    return { mensaje: `✅ Cliente *${client.name}* actualizado.\n[Ver clientes](${url})`, cliente_id: client.id, etiqueta: "Ver clientes", url };
  },
};

const updateItem: WriteTool = {
  kind: "write", name: "actualizar_articulo", roles: ["direccion", "administracion"],
  description: "Edita la ficha de un artículo existente: nombre, categoría, ubicación, existencia mínima, costo unitario o notas. Conserva unidad de medida, existencias físicas, compatibilidad con grúas y controles de entrega. null conserva; borrar_campos requiere petición explícita. Requiere confirmación.",
  parameters: fields({
    articulo: { type: "string", description: "SKU, nombre o ID del artículo existente." }, nombre: optionalText("Nombre del artículo"),
    categoria: { type: ["string", "null"], enum: [...Object.keys(INVENTORY_CATEGORY_LABELS), null], description: "Categoría; null conserva." },
    ubicacion: optionalText("Ubicación en almacén"), minimo: optionalNumber("Existencia mínima para avisos, no existencia física"), costo_unitario: optionalNumber("Costo unitario en MXN"), notas: optionalText("Notas completas que desea guardar"),
    borrar_campos: clearFields(["ubicacion", "notas"]),
  }),
  async prepare(args, { db, staff }) {
    assertManager(staff);
    const item = await findItem(db, args.articulo);
    const candidate = validateItemPatch(patchFromArgs(args, ITEM_MAP, ["ubicacion", "notas"], "articulo"));
    const { patch, before } = requestedChanges(item, candidate);
    return { summary: summary(`el artículo *${item.sku} ${item.name}*`, patch, before), args: { itemId: item.id, patch, before } };
  },
  async execute(args, { db, staff }) {
    const item = await editItem(db, selector(args.itemId, "el artículo de la propuesta"), args.patch, args.before, staff);
    const url = `${env.appUrl}/catalogos?tab=articulos`;
    return { mensaje: `✅ Artículo *${item.sku} ${item.name}* actualizado.\n[Ver artículos](${url})`, articulo_id: item.id, etiqueta: "Ver artículos", url };
  },
};

function withCatalogErrors(tool: WriteTool): WriteTool {
  return {
    ...tool,
    async prepare(args, ctx) {
      try { return await tool.prepare(args, ctx); }
      catch (error) { if (error instanceof CatalogError) throw new ToolError(error.message); throw error; }
    },
    async execute(args, ctx) {
      try { return await tool.execute(args, ctx); }
      catch (error) { if (error instanceof CatalogError) throw new ToolError(error.message); throw error; }
    },
  };
}

export const CATALOG_EDIT_TOOLS: WriteTool[] = [updateClient, updateItem].map(withCatalogErrors);
