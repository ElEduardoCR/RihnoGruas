import "server-only";
import type { Db } from "@/lib/db/types";
import type { InventoryCategory, InventoryItem, Staff } from "@/lib/types";
import { INVENTORY_CATEGORY_LABELS } from "@/lib/labels";
import { norm } from "@/lib/text";
import { assertManager, CatalogError } from "./catalogs";

export interface NewInventoryItem {
  sku: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  scope: "general";
  min_stock: number;
  unit_cost: number;
  requires_return: boolean;
  serialized: boolean;
  location: string | null;
  presentation: string | null;
  reference: string | null;
  notes: string | null;
}

const LABELS = {
  sku: "SKU o clave", name: "nombre", category: "categoría", unit: "unidad de consumo",
  scope: "alcance de uso", min_stock: "mínimo por unidad de consumo", unit_cost: "costo unitario en MXN por unidad de consumo",
  requires_return: "si exige devolver la pieza usada", serialized: "si se controla por número de serie",
};
const OPTIONAL = ["location", "presentation", "reference", "notes"] as const;
const ALLOWED = new Set([...Object.keys(LABELS), ...OPTIONAL]);
const skuKey = (value: string) => value.trim().toUpperCase().replace(/\s+/g, "-");

function text(value: unknown, label: string, max = 300): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new CatalogError(`${label}: indica un texto de 1 a ${max} caracteres.`);
  return value.trim();
}

/** Presentation is descriptive. It never supplies stock, cost or a conversion factor. */
export function validateNewInventoryItem(raw: unknown): NewInventoryItem {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new CatalogError("Indica los datos del artículo que quieres dar de alta.");
  const input = raw as Record<string, unknown>;
  for (const key of Object.keys(input)) if (!ALLOWED.has(key)) throw new CatalogError(`El alta de artículo no admite ${key}. La existencia se registra con un movimiento posterior.`);
  const missing = Object.entries(LABELS).filter(([field]) => input[field] == null || input[field] === "").map(([, label]) => label);
  if (missing.length) {
    const suggestions: string[] = [];
    if (!input.sku && typeof input.name === "string" && input.name.trim()) {
      const suggested = norm(input.name).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
      if (suggested) suggestions.push(`SKU ${suggested}`);
    }
    if (!input.category && typeof input.name === "string" && /\baceite\b/.test(norm(input.name))) suggestions.push("categoría aceite");
    if (!input.scope) suggestions.push("alcance general (sin restricción de despacho por grúa; no certifica compatibilidad técnica)");
    throw new CatalogError(`Faltan datos para preparar el alta: ${missing.join(", ")}. Pregunta juntos sólo estos datos; conserva los que ya proporcionó el usuario.${suggestions.length ? ` Puedes sugerir para su aprobación: ${suggestions.join("; ")}.` : ""} No inventes costo ni mínimo: si quedan en 0, el usuario debe aprobarlo explícitamente. La presentación no es la existencia física.`);
  }
  const sku = skuKey(text(input.sku, "SKU", 80));
  const name = text(input.name, "Nombre");
  if (typeof input.category !== "string" || !Object.hasOwn(INVENTORY_CATEGORY_LABELS, input.category)) throw new CatalogError("Selecciona una categoría válida del inventario.");
  const unitRaw = text(input.unit, "Unidad de consumo", 40);
  const unit = ["l", "lt", "lts", "litros", "litro"].includes(norm(unitRaw)) ? "litro" : unitRaw.toLowerCase().replace(/^(mm|cm|m|km)\s*\^?([23])$/, (_, length: string, power: string) => `${length}${power === "2" ? "²" : "³"}`);
  if (/\d/.test(unit)) throw new CatalogError("La unidad de consumo debe ser una unidad, por ejemplo litro; la cantidad de la presentación va por separado.");
  if (input.scope !== "general") throw new CatalogError("Esta alta permite uso general. Un artículo específico necesita definir su compatibilidad por grúa antes de darlo de alta.");
  for (const field of ["min_stock", "unit_cost"] as const) {
    if (typeof input[field] !== "number" || !Number.isFinite(input[field]) || input[field] < 0) throw new CatalogError(`${LABELS[field]}: indica un número finito mayor o igual a cero.`);
  }
  for (const field of ["requires_return", "serialized"] as const) {
    if (typeof input[field] !== "boolean") throw new CatalogError(`Confirma ${LABELS[field]} con sí o no.`);
  }
  const optional = Object.fromEntries(OPTIONAL.map((field) => [field, input[field] == null ? null : text(input[field], field, field === "notes" ? 4000 : 500)])) as Pick<NewInventoryItem, typeof OPTIONAL[number]>;
  return { sku, name, category: input.category as InventoryCategory, unit, scope: "general", min_stock: input.min_stock as number, unit_cost: input.unit_cost as number, requires_return: input.requires_return as boolean, serialized: input.serialized as boolean, ...optional };
}

export async function assertNewInventoryItem(db: Db, input: NewInventoryItem) {
  const items = await db.select("inventory_items");
  const sameSku = items.find((item) => skuKey(item.sku) === input.sku);
  if (sameSku) throw new CatalogError(`El SKU ${input.sku} ya existe (${sameSku.name}${sameSku.active ? "" : ", inactivo"}). Revisa el artículo existente o elige otra clave; no se creó un duplicado.`);
  const sameName = items.find((item) => norm(item.name) === norm(input.name));
  if (sameName) throw new CatalogError(`Ya existe un artículo llamado ${sameName.name} (${sameName.sku}${sameName.active ? "" : ", inactivo"}). Revisa si es el mismo; si es otra presentación, distínguela en el nombre y SKU.`);
}

export function inventoryItemNotes(input: NewInventoryItem): string | null {
  return [input.presentation && `Presentación: ${input.presentation}`, input.reference && `Referencia: ${input.reference}`, input.presentation && `Unidad de consumo: ${input.unit}`, input.notes].filter(Boolean).join("\n") || null;
}

/** A single item insertion: no stock ledger, compatibility, or implied purchases. */
export async function createInventoryItem(db: Db, raw: unknown, by: Staff): Promise<InventoryItem> {
  assertManager(by);
  assertManager(await db.get("staff", by.id));
  const input = validateNewInventoryItem(raw);
  await assertNewInventoryItem(db, input);
  try {
    return await db.insert("inventory_items", {
      sku: input.sku, name: input.name, category: input.category, unit: input.unit, scope: input.scope,
      min_stock: input.min_stock, unit_cost: input.unit_cost, location: input.location,
      requires_return: input.requires_return, serialized: input.serialized, notes: inventoryItemNotes(input), active: true,
    });
  } catch (error) {
    // Supabase's Db wrapper retains the constraint message, while direct adapters may keep code 23505.
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "23505" || (error instanceof Error && /duplicate key|unique constraint|inventory_items_sku_key/i.test(error.message))) {
      throw new CatalogError(`El SKU ${input.sku} acaba de ser registrado por otra operación. Revisa el catálogo antes de preparar otra alta; no se creó un duplicado.`);
    }
    throw error;
  }
}
