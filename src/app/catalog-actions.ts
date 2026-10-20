"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { currentStaff } from "@/lib/auth";
import { isDemo } from "@/lib/env";
import {
  CatalogError,
  approveOperator,
  assertManager,
  saveClient,
  saveCrane,
  saveItem,
  saveStaff,
} from "@/lib/services/catalogs";
import { grantWebAccess } from "@/lib/services/access";
import type { AlertTopic, CraneType, InventoryCategory, StaffRole } from "@/lib/types";
import type { FormState } from "./actions";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const num = (f: FormData, k: string) => {
  const v = str(f, k);
  if (v == null) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  if (Number.isNaN(n)) throw new CatalogError(`Valor numérico inválido en "${k}".`);
  return n;
};
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
const list = (f: FormData, k: string) => f.getAll(k).filter((v): v is string => typeof v === "string" && v !== "");

async function manager() {
  const db = await getDb();
  const me = await currentStaff(db);
  assertManager(me);
  return { db, me: me! };
}

function done(message: string, details?: string[]): FormState {
  revalidatePath("/", "layout");
  return { ok: true, message, details };
}

const fail = (e: unknown): FormState => {
  if (e instanceof CatalogError) return { ok: false, message: e.message };
  const msg = e instanceof Error ? e.message : String(e);
  // violaciones de restricciones de la base con mensaje entendible
  if (/duplicate key|unique/i.test(msg)) return { ok: false, message: "Ya existe un registro con esos datos (clave repetida)." };
  console.error("[catalogos]", e);
  return { ok: false, message: "No se pudo guardar. Revisa los datos e intenta de nuevo." };
};

export async function saveCraneAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { db } = await manager();
    const id = str(f, "id");
    const crane = await saveCrane(
      db,
      {
        code: str(f, "code") ?? "",
        name: str(f, "name") ?? "",
        type: (str(f, "type") ?? "grua_movil") as CraneType,
        brand: str(f, "brand") ?? "",
        model: str(f, "model") ?? "",
        year: num(f, "year"),
        capacity_tons: num(f, "capacity_tons"),
        boom_length_m: num(f, "boom_length_m"),
        serial_number: str(f, "serial_number"),
        vin: str(f, "vin"),
        plates: str(f, "plates"),
        hour_meter: num(f, "hour_meter"),
        odometer_km: num(f, "odometer_km"),
        service_interval_hours: num(f, "service_interval_hours"),
        last_service_hours: num(f, "last_service_hours"),
        base_location: str(f, "base_location"),
        daily_rate: num(f, "daily_rate"),
        acquired_on: str(f, "acquired_on"),
        notes: str(f, "notes"),
        active: id ? bool(f, "active") : true,
      },
      id,
    );
    return done(id ? `${crane.code} actualizada.` : `${crane.code} dada de alta.`, id ? [] : ["Siguiente: carga sus documentos (seguro, tarjeta de circulación…) y aprueba a sus operadores desde el expediente."]);
  } catch (e) {
    return fail(e);
  }
}

export async function saveClientAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { db } = await manager();
    const id = str(f, "id");
    const c = await saveClient(
      db,
      {
        name: str(f, "name") ?? "",
        contact_name: str(f, "contact_name"),
        phone: str(f, "phone"),
        email: str(f, "email"),
        rfc: str(f, "rfc"),
        address: str(f, "address"),
        notes: str(f, "notes"),
      },
      id,
    );
    return done(id ? `${c.name} actualizado.` : `${c.name} dado de alta.`);
  } catch (e) {
    return fail(e);
  }
}

export async function saveStaffAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { db, me } = await manager();
    const id = str(f, "id");
    const role = (str(f, "role") ?? "operador") as StaffRole;
    const staff = await saveStaff(
      db,
      {
        full_name: str(f, "full_name") ?? "",
        role,
        phone: str(f, "phone"),
        email: str(f, "email"),
        license_number: str(f, "license_number"),
        license_type: str(f, "license_type"),
        license_expires_on: str(f, "license_expires_on"),
        receives_alerts: bool(f, "receives_alerts"),
        alert_topics: list(f, "alert_topics") as AlertTopic[],
        can_authorize: bool(f, "can_authorize"),
        active: id ? bool(f, "active") : true,
        approvedCraneIds: role === "operador" ? list(f, "approved_cranes") : null,
      },
      me,
      id,
    );
    const details: string[] = [];
    if (bool(f, "web_access") && !staff.auth_user_id) {
      if (isDemo) details.push("En modo demo no se crean accesos web.");
      else {
        const r = await grantWebAccess(staff);
        details.push(
          r.tempPassword
            ? `Acceso web creado para ${staff.email}. Contraseña temporal: ${r.tempPassword} — compártela por un medio seguro; se cambia en "Mi cuenta".`
            : `Se vinculó el acceso web existente de ${staff.email}.`,
        );
      }
    }
    if (!staff.phone) details.push("Sin WhatsApp no recibirá avisos ni podrá hablar con Rhino.");
    return done(id ? `${staff.full_name} actualizado.` : `${staff.full_name} dado de alta.`, details);
  } catch (e) {
    return fail(e);
  }
}

export async function grantAccessAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { db } = await manager();
    const staff = await db.get("staff", str(f, "id") ?? "");
    if (!staff) throw new CatalogError("Persona no encontrada.");
    const r = await grantWebAccess(staff);
    return done(
      r.tempPassword ? `Acceso creado. Contraseña temporal: ${r.tempPassword}` : "Se vinculó su acceso existente.",
      r.tempPassword ? ["Compártela por un medio seguro; la puede cambiar en \"Mi cuenta\". No se volverá a mostrar."] : [],
    );
  } catch (e) {
    return fail(e);
  }
}

export async function saveItemAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { db, me } = await manager();
    const id = str(f, "id");
    const item = await saveItem(
      db,
      {
        sku: str(f, "sku") ?? "",
        name: str(f, "name") ?? "",
        category: (str(f, "category") ?? "otro") as InventoryCategory,
        unit: str(f, "unit") ?? "pieza",
        scope: str(f, "scope") === "especifico" ? "especifico" : "general",
        min_stock: num(f, "min_stock"),
        unit_cost: num(f, "unit_cost"),
        location: str(f, "location"),
        requires_return: bool(f, "requires_return"),
        serialized: bool(f, "serialized"),
        notes: str(f, "notes"),
        active: id ? bool(f, "active") : true,
        compatCraneIds: list(f, "compat"),
        expectedPerService: num(f, "expected_per_service"),
        initialStock: id ? null : num(f, "initial_stock"),
      },
      me,
      id,
    );
    return done(id ? `${item.name} actualizado.` : `${item.name} dado de alta.`);
  } catch (e) {
    return fail(e);
  }
}

export async function approveOperatorAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const { db, me } = await manager();
    await approveOperator(db, { craneId: str(f, "crane_id") ?? "", staffId: str(f, "staff_id") ?? "", validUntil: str(f, "valid_until"), notes: str(f, "notes") }, me);
    return done("Operador aprobado para esta grúa.");
  } catch (e) {
    return fail(e);
  }
}

export async function revokeOperatorAction(approvalId: string) {
  const { db } = await manager();
  await db.remove("crane_operators", approvalId);
  revalidatePath("/", "layout");
}
