import "server-only";
import { randomInt } from "node:crypto";
import { createAdminSupabase, createUserSupabase, getAdminDb } from "@/lib/db";
import { isDemo } from "@/lib/env";
import type { AlertTopic, Staff } from "@/lib/types";
import { CatalogError, normalizePhone } from "./catalogs";

// Acceso a la web (Supabase Auth). Los operadores no lo necesitan: usan
// WhatsApp y los enlaces de revisión.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const tempPassword = () => Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

async function findAuthUserByEmail(email: string) {
  const admin = createAdminSupabase().auth.admin;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw new CatalogError(`No se pudo consultar usuarios: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Da acceso web a una persona del personal: vincula su usuario si ya existe
 * en Supabase Auth o lo crea con una contraseña temporal (se muestra una vez).
 */
export async function grantWebAccess(staff: Staff): Promise<{ created: boolean; tempPassword: string | null }> {
  if (isDemo) throw new CatalogError("En modo demo no se crean accesos web.");
  if (!staff.email) throw new CatalogError("Captura el correo para darle acceso a la web.");
  if (staff.auth_user_id) return { created: false, tempPassword: null };
  const existing = await findAuthUserByEmail(staff.email);
  let userId = existing?.id ?? null;
  let password: string | null = null;
  if (!userId) {
    password = tempPassword();
    const { data, error } = await createAdminSupabase().auth.admin.createUser({ email: staff.email, password, email_confirm: true });
    if (error || !data.user) throw new CatalogError(`No se pudo crear el acceso: ${error?.message ?? "error desconocido"}`);
    userId = data.user.id;
  }
  await getAdminDb().update("staff", staff.id, { auth_user_id: userId });
  return { created: !existing, tempPassword: password };
}

export type SessionState =
  | { kind: "sin_sesion" }
  | { kind: "listo"; staff: Staff }
  | { kind: "primer_acceso"; email: string }
  | { kind: "sin_acceso"; email: string };

/**
 * Situación del usuario con sesión: ya es personal, es el primer usuario del
 * sistema (configura Dirección) o no tiene acceso. Si Dirección lo registró
 * con su correo, se vincula automáticamente.
 */
export async function sessionState(): Promise<SessionState> {
  const { data } = await (await createUserSupabase()).auth.getUser();
  const user = data.user;
  if (!user) return { kind: "sin_sesion" };
  const db = getAdminDb();
  const mine = await db.select("staff", { eq: { auth_user_id: user.id }, limit: 1 });
  if (mine[0]) return mine[0].active ? { kind: "listo", staff: mine[0] } : { kind: "sin_acceso", email: user.email ?? "" };
  const email = (user.email ?? "").toLowerCase();
  const all = await db.select("staff");
  const byEmail = all.find((s) => s.active && !s.auth_user_id && s.email?.toLowerCase() === email);
  if (byEmail) return { kind: "listo", staff: await db.update("staff", byEmail.id, { auth_user_id: user.id }) };
  return all.length === 0 ? { kind: "primer_acceso", email } : { kind: "sin_acceso", email };
}

/** El primer usuario que entra al sistema vacío queda como Dirección. */
export async function bootstrapDirector(input: { fullName: string; phone: string | null }) {
  const state = await sessionState();
  if (state.kind !== "primer_acceso") throw new CatalogError("El sistema ya tiene personal registrado.");
  const { data } = await (await createUserSupabase()).auth.getUser();
  const topics: AlertTopic[] = ["documentos", "inventario", "agenda", "gastos", "checklists", "resumen", "flota"];
  const name = input.fullName.trim().replace(/\s+/g, " ");
  if (name.length < 4) throw new CatalogError("Escribe tu nombre completo.");
  return getAdminDb().insert("staff", {
    auth_user_id: data.user!.id,
    full_name: name,
    role: "direccion",
    phone: normalizePhone(input.phone),
    email: state.email,
    license_number: null,
    license_type: null,
    license_expires_on: null,
    receives_alerts: true,
    alert_topics: topics,
    can_authorize: true,
    active: true,
  });
}
