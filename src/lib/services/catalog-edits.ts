import type { Db } from "@/lib/db/types";
import type { Client, InventoryItem, Staff } from "@/lib/types";
import { INVENTORY_CATEGORY_LABELS } from "@/lib/labels";
import { norm } from "@/lib/text";
import { assertManager, CatalogError } from "./catalogs";

type Value = string | number | null;
export type CatalogPatch = Record<string, Value>;
type ClientField = "name" | "contact_name" | "phone" | "email" | "rfc" | "address" | "notes";
type ItemField = "name" | "category" | "location" | "min_stock" | "unit_cost" | "notes";
export type ClientPatch = Partial<Pick<Client, ClientField>>;
export type ItemPatch = Partial<Pick<InventoryItem, ItemField>>;

const CLIENT_FIELDS = new Set(["name", "contact_name", "phone", "email", "rfc", "address", "notes"]);
const ITEM_FIELDS = new Set(["name", "category", "location", "min_stock", "unit_cost", "notes"]);

function patchObject(raw: unknown, allowed: Set<string>): CatalogPatch {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new CatalogError("Los cambios del catálogo no son válidos.");
  const entries = Object.entries(raw);
  if (!entries.length) throw new CatalogError("Indica al menos un dato que quieras cambiar.");
  for (const [field, value] of entries) {
    if (!allowed.has(field)) throw new CatalogError(`No se puede cambiar el campo ${field} con esta operación.`);
    if (value !== null && typeof value !== "string" && typeof value !== "number") throw new CatalogError(`Valor inválido para ${field}.`);
  }
  return Object.fromEntries(entries) as CatalogPatch;
}

function text(value: Value, label: string, nullable = true): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !value.trim()) throw new CatalogError(`${label}: indica un texto válido; para borrarlo usa borrar_campos.`);
  return value.trim();
}

export function validateClientPatch(raw: unknown): ClientPatch {
  const patch = patchObject(raw, CLIENT_FIELDS);
  for (const [key, value] of Object.entries(patch)) patch[key] = text(value, key, key !== "name");
  if (typeof patch.email === "string") {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(patch.email)) throw new CatalogError("El correo no tiene un formato válido.");
    patch.email = patch.email.toLowerCase();
  }
  if (typeof patch.rfc === "string") {
    patch.rfc = patch.rfc.toUpperCase();
    if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(patch.rfc)) throw new CatalogError("El RFC no tiene un formato válido.");
  }
  if (typeof patch.phone === "string") {
    if (!/^\+?[\d\s().-]+$/.test(patch.phone)) throw new CatalogError("El teléfono no tiene un formato válido.");
    const digits = patch.phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) throw new CatalogError("El teléfono debe tener entre 7 y 15 dígitos.");
    patch.phone = `${patch.phone.startsWith("+") ? "+" : ""}${digits}`;
  }
  return patch as ClientPatch;
}

export function validateItemPatch(raw: unknown): ItemPatch {
  const patch = patchObject(raw, ITEM_FIELDS);
  for (const [key, value] of Object.entries(patch)) {
    if (key === "min_stock" || key === "unit_cost") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new CatalogError(`${key === "min_stock" ? "Existencia mínima" : "Costo unitario"}: indica un número mayor o igual a cero.`);
    } else {
      patch[key] = text(value, key, key === "location" || key === "notes");
    }
  }
  if (patch.category !== undefined && !Object.hasOwn(INVENTORY_CATEGORY_LABELS, patch.category as string)) throw new CatalogError("Selecciona una categoría de artículo válida.");
  return patch as ItemPatch;
}

export function requestedChanges(current: object, raw: object): { patch: CatalogPatch; before: CatalogPatch } {
  const row = current as CatalogPatch;
  const patch: CatalogPatch = {};
  const before: CatalogPatch = {};
  for (const [key, value] of Object.entries(raw)) {
    if (row[key] === value) continue;
    patch[key] = value;
    before[key] = row[key] ?? null;
  }
  if (!Object.keys(patch).length) throw new CatalogError("Los datos ya tienen esos valores; no hay cambios que confirmar.");
  return { patch, before };
}

function checkSnapshot(current: object, patch: object, before: unknown) {
  if (!before || typeof before !== "object" || Array.isArray(before)) throw new CatalogError("Falta la ficha original de esta propuesta. Solicita una nueva propuesta.");
  const expected = before as CatalogPatch;
  const row = current as CatalogPatch;
  if (Object.keys(expected).length !== Object.keys(patch).length || Object.keys(patch).some((key) => !Object.hasOwn(expected, key) || (row[key] ?? null) !== expected[key])) {
    throw new CatalogError("Los datos cambiaron después de preparar esta edición. Solicita una nueva propuesta con los valores actuales.");
  }
}

export async function validateClientName(db: Db, clientId: string, patch: ClientPatch) {
  if (patch.name === undefined) return;
  const duplicate = (await db.select("clients")).some((client) => client.id !== clientId && norm(client.name) === norm(patch.name!));
  if (duplicate) throw new CatalogError(`Ya existe otro cliente con el nombre ${patch.name}.`);
}

async function assertCurrentManager(db: Db, by: Staff) {
  assertManager(by);
  const current = await db.get("staff", by.id);
  if (!current?.active) throw new CatalogError("Tu acceso ya no está activo. No se aplicaron cambios.");
  assertManager(current);
}

export async function editClient(db: Db, clientId: string, rawPatch: unknown, before: unknown, by: Staff): Promise<Client> {
  await assertCurrentManager(db, by);
  const patch = validateClientPatch(rawPatch);
  const current = await db.get("clients", clientId);
  if (!current) throw new CatalogError("El cliente ya no existe. Solicita una nueva propuesta.");
  checkSnapshot(current, patch, before);
  await validateClientName(db, clientId, patch);
  const saved = await db.updateWhere("clients", clientId, patch, before as CatalogPatch);
  if (!saved) throw new CatalogError("Los datos cambiaron al confirmar esta edición. Solicita una nueva propuesta con los valores actuales.");
  return saved;
}

export async function editItem(db: Db, itemId: string, rawPatch: unknown, before: unknown, by: Staff): Promise<InventoryItem> {
  await assertCurrentManager(db, by);
  const patch = validateItemPatch(rawPatch);
  const current = await db.get("inventory_items", itemId);
  if (!current?.active) throw new CatalogError("El artículo ya no está activo o no existe. Solicita una nueva propuesta.");
  checkSnapshot(current, patch, before);
  // Edición de ficha solamente: no toca existencias, compatibilidad ni controles de salida.
  const saved = await db.updateWhere("inventory_items", itemId, patch, { ...before as CatalogPatch, active: true });
  if (!saved) throw new CatalogError("Los datos cambiaron al confirmar esta edición. Solicita una nueva propuesta con los valores actuales.");
  return saved;
}
