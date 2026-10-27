import type { Db } from "@/lib/db/types";
import type { AlertTopic, Client, Crane, CraneType, InventoryCategory, InventoryItem, Staff, StaffRole } from "@/lib/types";
import { norm } from "@/lib/text";
import { CRANE_TYPES } from "@/lib/types";

// Altas y ediciones de catálogos: grúas, clientes, personal y artículos de almacén.

export class CatalogError extends Error {}

const ALL_TOPICS: AlertTopic[] = ["documentos", "inventario", "agenda", "gastos", "checklists", "resumen", "flota"];
export const MANAGER_ROLES: StaffRole[] = ["direccion", "administracion"];

/** Sólo Dirección y Administración pueden editar catálogos. */
export function assertManager(staff: Staff | null) {
  if (!staff || !MANAGER_ROLES.includes(staff.role)) throw new CatalogError("Sólo Dirección o Administración pueden editar catálogos.");
}

const nonNeg = (v: number | null, label: string) => {
  if (v != null && (!Number.isFinite(v) || v < 0)) throw new CatalogError(`${label}: valor inválido.`);
  return v;
};

/** WhatsApp en formato internacional sin "+": 10 dígitos de México → 521XXXXXXXXXX. */
export function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10) return `521${d}`;
  if (d.length === 12 && d.startsWith("52")) return `521${d.slice(2)}`;
  if (d.length < 11) throw new CatalogError("WhatsApp inválido: usa 10 dígitos o el número con lada internacional.");
  return d;
}

const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);

// ---------------------------------------------------------------- grúas

export interface CraneInput {
  code: string;
  name: string;
  type: CraneType;
  brand: string;
  model: string;
  year: number | null;
  capacity_tons: number | null;
  boom_length_m: number | null;
  serial_number: string | null;
  vin: string | null;
  plates: string | null;
  hour_meter: number | null;
  odometer_km: number | null;
  service_interval_hours: number | null;
  last_service_hours: number | null;
  base_location: string | null;
  daily_rate: number | null;
  acquired_on: string | null;
  notes: string | null;
  active: boolean;
}

export async function saveCrane(db: Db, input: CraneInput, id?: string | null): Promise<Crane> {
  const code = input.code.trim().toUpperCase().replace(/\s+/g, "-");
  if (!code) throw new CatalogError("Indica el número económico.");
  if (!input.name.trim()) throw new CatalogError("Indica el nombre de la unidad.");
  if (!input.brand.trim() || !input.model.trim()) throw new CatalogError("Indica marca y modelo.");
  if (!CRANE_TYPES.includes(input.type)) throw new CatalogError("Selecciona un tipo de unidad válido.");
  if (input.capacity_tons != null && (!Number.isFinite(input.capacity_tons) || input.capacity_tons <= 0)) throw new CatalogError("La capacidad debe ser positiva o quedar pendiente.");
  if (input.service_interval_hours != null && (!Number.isFinite(input.service_interval_hours) || input.service_interval_hours <= 0)) throw new CatalogError("El intervalo de servicio debe ser positivo o quedar pendiente.");
  if (input.hour_meter != null && input.last_service_hours != null && input.last_service_hours > input.hour_meter) throw new CatalogError("El último servicio no puede superar el horómetro actual.");
  if (input.year != null && (input.year < 1950 || input.year > 2100)) throw new CatalogError("Año inválido.");
  const dup = (await db.select("cranes", { eq: { code } })).find((c) => c.id !== id);
  if (dup) throw new CatalogError(`Ya existe una unidad con el número económico ${code}.`);

  const row: Partial<Crane> = {
    code,
    name: input.name.trim(),
    type: input.type,
    brand: input.brand.trim(),
    model: input.model.trim(),
    year: input.year,
    capacity_tons: input.capacity_tons,
    boom_length_m: nonNeg(input.boom_length_m, "Pluma"),
    serial_number: input.serial_number,
    vin: input.vin,
    plates: input.plates?.toUpperCase() ?? null,
    hour_meter: nonNeg(input.hour_meter, "Horómetro"),
    odometer_km: nonNeg(input.odometer_km, "Odómetro"),
    service_interval_hours: nonNeg(input.service_interval_hours, "Intervalo de servicio"),
    last_service_hours: nonNeg(input.last_service_hours, "Último servicio"),
    base_location: input.base_location,
    daily_rate: nonNeg(input.daily_rate, "Tarifa"),
    acquired_on: input.acquired_on,
    notes: input.notes,
    active: input.active,
  };
  return id ? db.update("cranes", id, row) : db.insert("cranes", row);
}

// ---------------------------------------------------------------- clientes

export async function saveClient(db: Db, input: Omit<Client, "id" | "created_at">, id?: string | null): Promise<Client> {
  const name = input.name.trim();
  if (!name) throw new CatalogError("Indica el nombre del cliente.");
  const dup = (await db.select("clients")).find((c) => c.id !== id && norm(c.name) === norm(name));
  if (dup) throw new CatalogError(`Ya existe el cliente "${dup.name}".`);
  if (input.rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(input.rfc)) throw new CatalogError("RFC con formato inválido.");
  const row = { ...input, name, rfc: input.rfc?.toUpperCase() ?? null, phone: input.phone?.replace(/[^\d+]/g, "") || null };
  return id ? db.update("clients", id, row) : db.insert("clients", row);
}

// ---------------------------------------------------------------- personal

export interface StaffInput {
  full_name: string;
  role: StaffRole;
  phone: string | null;
  email: string | null;
  license_number: string | null;
  license_type: string | null;
  license_expires_on: string | null;
  receives_alerts: boolean;
  alert_topics: AlertTopic[];
  can_authorize: boolean;
  active: boolean;
  /** grúas para las que el operador queda aprobado */
  approvedCraneIds: string[] | null;
}

export async function saveStaff(db: Db, input: StaffInput, by: Staff, id?: string | null): Promise<Staff> {
  const full_name = input.full_name.trim().replace(/\s+/g, " ");
  if (full_name.length < 4) throw new CatalogError("Escribe el nombre completo.");
  const phone = normalizePhone(input.phone);
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new CatalogError("Correo inválido.");

  const all = await db.select("staff");
  if (phone && all.some((s) => s.id !== id && s.phone && last10(s.phone) === last10(phone))) {
    throw new CatalogError("Ese WhatsApp ya está registrado con otra persona.");
  }
  if (email && all.some((s) => s.id !== id && s.email?.toLowerCase() === email)) throw new CatalogError("Ese correo ya está registrado.");
  if (id === by.id && (!input.active || !MANAGER_ROLES.includes(input.role))) {
    throw new CatalogError("No puedes quitarte a ti mismo el acceso de Dirección/Administración.");
  }
  const row: Partial<Staff> = {
    full_name,
    role: input.role,
    phone,
    email,
    license_number: input.license_number,
    license_type: input.license_type,
    license_expires_on: input.license_expires_on,
    receives_alerts: input.receives_alerts,
    alert_topics: input.alert_topics.filter((t) => ALL_TOPICS.includes(t)),
    can_authorize: input.can_authorize,
    active: input.active,
  };
  const saved = id ? await db.update("staff", id, row) : await db.insert("staff", { ...row, auth_user_id: null });

  if (input.approvedCraneIds && saved.role === "operador") await syncApprovals(db, saved.id, input.approvedCraneIds, by);
  return saved;
}

async function syncApprovals(db: Db, staffId: string, craneIds: string[], by: Staff) {
  const current = await db.select("crane_operators", { eq: { staff_id: staffId } });
  for (const a of current) if (!craneIds.includes(a.crane_id)) await db.remove("crane_operators", a.id);
  for (const craneId of craneIds) {
    if (current.some((a) => a.crane_id === craneId)) continue;
    await db.insert("crane_operators", {
      crane_id: craneId,
      staff_id: staffId,
      approved_on: new Date().toISOString().slice(0, 10),
      approved_by: by.id,
      valid_until: null,
      notes: null,
    });
  }
}

export async function approveOperator(db: Db, input: { craneId: string; staffId: string; validUntil: string | null; notes: string | null }, by: Staff) {
  const op = await db.get("staff", input.staffId);
  if (!op || op.role !== "operador") throw new CatalogError("Selecciona un operador.");
  const exists = await db.select("crane_operators", { eq: { crane_id: input.craneId, staff_id: input.staffId } });
  if (exists.length) throw new CatalogError(`${op.full_name} ya está aprobado para esta grúa.`);
  return db.insert("crane_operators", {
    crane_id: input.craneId,
    staff_id: input.staffId,
    approved_on: new Date().toISOString().slice(0, 10),
    approved_by: by.id,
    valid_until: input.validUntil,
    notes: input.notes,
  });
}

// ---------------------------------------------------------------- artículos de almacén

export interface ItemInput {
  sku: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  scope: "general" | "especifico";
  min_stock: number | null;
  unit_cost: number | null;
  location: string | null;
  requires_return: boolean;
  serialized: boolean;
  notes: string | null;
  active: boolean;
  compatCraneIds: string[];
  expectedPerService: number | null;
  /** sólo al dar de alta: existencia física actual */
  initialStock: number | null;
}

export async function saveItem(db: Db, input: ItemInput, by: Staff, id?: string | null): Promise<InventoryItem> {
  const sku = input.sku.trim().toUpperCase().replace(/\s+/g, "-");
  if (!sku) throw new CatalogError("Indica el SKU o clave del artículo.");
  if (!input.name.trim()) throw new CatalogError("Indica el nombre del artículo.");
  if (input.scope === "especifico" && input.compatCraneIds.length === 0) {
    throw new CatalogError("Una refacción específica debe indicar al menos una grúa compatible.");
  }
  const dup = (await db.select("inventory_items", { eq: { sku } })).find((i) => i.id !== id);
  if (dup) throw new CatalogError(`El SKU ${sku} ya existe (${dup.name}).`);

  const row: Partial<InventoryItem> = {
    sku,
    name: input.name.trim(),
    category: input.category,
    unit: input.unit,
    scope: input.scope,
    min_stock: nonNeg(input.min_stock, "Mínimo") ?? 0,
    unit_cost: nonNeg(input.unit_cost, "Costo") ?? 0,
    location: input.location,
    requires_return: input.requires_return,
    serialized: input.serialized,
    notes: input.notes,
    active: input.active,
  };
  const saved = id ? await db.update("inventory_items", id, row) : await db.insert("inventory_items", row);

  // compatibilidad con grúas
  const current = await db.select("inventory_compat", { eq: { item_id: saved.id } });
  for (const c of current) if (!input.compatCraneIds.includes(c.crane_id)) await db.remove("inventory_compat", c.id);
  for (const craneId of input.compatCraneIds) {
    const existing = current.find((c) => c.crane_id === craneId);
    if (existing) {
      if (existing.expected_qty_per_service !== input.expectedPerService) {
        await db.update("inventory_compat", existing.id, { expected_qty_per_service: input.expectedPerService });
      }
    } else {
      await db.insert("inventory_compat", { item_id: saved.id, crane_id: craneId, expected_qty_per_service: input.expectedPerService });
    }
  }

  // existencia inicial: queda en el libro de movimientos como ajuste
  const initial = nonNeg(input.initialStock, "Existencia inicial");
  if (!id && initial && initial > 0) {
    await db.insert("inventory_movements", {
      item_id: saved.id,
      kind: "ajuste",
      qty_delta: initial,
      unit_cost: saved.unit_cost,
      crane_id: null,
      maintenance_order_id: null,
      inspection_id: null,
      purchase_id: null,
      requested_by: by.id,
      authorized_by: by.id,
      reason: "Inventario inicial",
      evidence_paths: [],
      serial_numbers: [],
      status: "aplicado",
      flags: [],
      channel: "web",
    });
  }
  return saved;
}
