import type { WriteTool } from "./tools";
import { ToolError } from "./tool-error";
import { env } from "@/lib/env";
import { INVENTORY_CATEGORY_LABELS } from "@/lib/labels";
import { assertManager, CatalogError } from "@/lib/services/catalogs";
import { assertNewInventoryItem, createInventoryItem, inventoryItemNotes, validateNewInventoryItem } from "@/lib/services/inventory-catalog";

const optionalText = (description: string) => ({ type: ["string", "null"], description });
const optionalNumber = (description: string) => ({ type: ["number", "null"], description });
const MAPPING = {
  sku: "sku", nombre: "name", categoria: "category", unidad: "unit", alcance: "scope", minimo: "min_stock", costo_unitario: "unit_cost",
  requiere_devolucion: "requires_return", serializado: "serialized", ubicacion: "location", presentacion: "presentation", referencia: "reference", notas: "notes",
} as const;

const properties = {
  sku: optionalText("Clave indicada o sugerida para aprobación; null si falta. No la asignes silenciosamente."),
  nombre: optionalText("Nombre proporcionado por el usuario. No inventes marca ni características técnicas."),
  categoria: { type: ["string", "null"], enum: [...Object.keys(INVENTORY_CATEGORY_LABELS), null], description: "Categoría indicada o propuesta para aprobación; null si falta." },
  unidad: optionalText("Unidad de consumo y de todos los movimientos, por ejemplo litro si se usa por litros. No confundir con una presentación de 208 litros."),
  alcance: { type: ["string", "null"], enum: ["general", null], description: "General permite despacho sin restricción por grúa; debe proponerse para aprobación y no certifica compatibilidad técnica. null si falta." },
  minimo: optionalNumber("Umbral de aviso en la unidad de consumo. No es existencia. No inventar; null si falta. Cero sólo si el usuario lo aprueba."),
  costo_unitario: optionalNumber("Costo en MXN por unidad de consumo (por litro si unidad=litro), no precio de la presentación. No inventar ni convertir sin datos; null si falta. Cero sólo si el usuario lo aprueba."),
  requiere_devolucion: { type: ["boolean", "null"], description: "Si exige devolver la pieza usada; preguntar o proponer explícitamente. null si falta." },
  serializado: { type: ["boolean", "null"], description: "Si se controla por número de serie; preguntar o proponer explícitamente. null si falta." },
  ubicacion: optionalText("Ubicación conocida; null si no se conoce."),
  presentacion: optionalText("Presentación descriptiva indicada, por ejemplo 208 litros. Se conserva en notas, nunca crea existencia ni conversión. Si el usuario dice referencia 208 litros y se refiere al volumen, registrarlo aquí."),
  referencia: optionalText("Referencia o código de producto indicado, si es distinto del volumen de presentación; null si no se conoce."),
  notas: optionalText("Notas dadas por el usuario; no inventar especificaciones técnicas ni compatibilidad. null si no hay."),
};

const createItem: WriteTool = {
  kind: "write", name: "crear_articulo", roles: ["direccion", "administracion"],
  description: "Da de alta un artículo de uso general en el inventario. Prepara la ficha y requiere SÍ antes de guardar. Aprovecha datos ya dados y pregunta juntos los faltantes, con sugerencias explícitas de SKU, categoría y alcance. null en faltantes devuelve qué preguntar sin crear propuesta. Conserva presentación/referencia en notas; unidad es la de consumo. No crea existencias, compras ni compatibilidad técnica, ni inventa costos o mínimos.",
  parameters: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
  async prepare(args, { db, staff }) {
    assertManager(staff);
    assertManager(await db.get("staff", staff.id));
    for (const key of Object.keys(args)) if (!Object.hasOwn(MAPPING, key)) throw new CatalogError(`El alta de artículo no admite ${key}. La existencia requiere un movimiento posterior.`);
    const input = validateNewInventoryItem(Object.fromEntries(Object.entries(MAPPING).map(([arg, field]) => [field, args[arg]])));
    await assertNewInventoryItem(db, input);
    const notes = inventoryItemNotes(input);
    const summary = [
      `Dar de alta *${input.sku} — ${input.name}*:`,
      `• Categoría: ${INVENTORY_CATEGORY_LABELS[input.category]}`,
      `• Unidad de consumo y movimientos: ${input.unit}`,
      `• Alcance: general (sin restricción de despacho por grúa; no acredita compatibilidad técnica)`,
      `• Mínimo para avisos: ${input.min_stock} ${input.unit}`,
      `• Costo unitario: ${input.unit_cost} MXN por ${input.unit}`,
      `• Requiere devolver pieza usada: ${input.requires_return ? "sí" : "no"}`,
      `• Control por número de serie: ${input.serialized ? "sí" : "no"}`,
      `• Ubicación: ${input.location ?? "sin dato"}`,
      notes ? `• Datos que se guardarán en notas:\n${notes}` : "• Notas: sin dato",
      "• Activo. Sin entrada ni existencia inicial registrada; la presentación no es stock.",
      "Revisa también los valores sugeridos. Sólo se guardarán al confirmar SÍ.",
    ].join("\n");
    return { summary, args: { input } };
  },
  async execute(args, { db, staff }) {
    const item = await createInventoryItem(db, args.input, staff);
    const url = `${env.appUrl}/inventario`;
    return { mensaje: `✅ Artículo *${item.sku} — ${item.name}* dado de alta. Unidad de consumo: ${item.unit}. No se registró entrada de existencias.\n[Ver inventario](${url})`, articulo_id: item.id, etiqueta: "Ver inventario", url };
  },
};

export const INVENTORY_CATALOG_TOOLS: WriteTool[] = [{
  ...createItem,
  async prepare(args, ctx) {
    try { return await createItem.prepare(args, ctx); }
    catch (error) { if (error instanceof CatalogError) throw new ToolError(error.message); throw error; }
  },
  async execute(args, ctx) {
    try { return await createItem.execute(args, ctx); }
    catch (error) { if (error instanceof CatalogError) throw new ToolError(error.message); throw error; }
  },
}];
