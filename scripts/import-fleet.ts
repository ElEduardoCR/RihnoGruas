/** Default is a read-only preflight. --apply inserts missing records, never resets history. */
import { createClient } from "@supabase/supabase-js";
import { buildFleetPayload } from "../src/lib/fleet/payload";
import type { Crane } from "../src/lib/types";
import { importConflicts } from "../src/lib/fleet/import-plan";

const payload = buildFleetPayload();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apply = process.argv.includes("--apply");
if (!url || !key) throw new Error("Faltan credenciales de Supabase en .env.local.");
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }) } });
const fail = (context: string, message: string) => { throw new Error(`${context}: ${message.startsWith("<!") ? "La base aún no está disponible." : message}`); };

async function main() {
  const { data, error } = await sb.from("cranes").select("*");
  if (error) fail("Consulta de flota", error.message);
  const existing = (data ?? []) as Crane[];
  const issues = importConflicts(existing, payload.cranes);
  if (issues.length) fail("No se modificó la base", issues.join("\n"));
  const { error: schemaError } = await sb.from("cranes").select("fleet_profile").limit(1);
  if (schemaError) fail("Primero aplicar la migración flota_sergio", schemaError.message);
  const newCranes = payload.cranes.filter((c) => !existing.some((e) => e.fleet_profile?.import_key === c.fleet_profile?.import_key));
  console.log(JSON.stringify({ mode: apply ? "apply" : "preflight", existing: existing.length, new_units: newCranes.length, already_imported: payload.cranes.length - newCranes.length, plans: payload.cranes.reduce((n,c) => n + (c.fleet_profile?.maintenance_plans.length ?? 0), 0), scheduled_orders: 0 }, null, 2));
  if (!apply) return;
  // Insert-only upserts make a resumed import safe and preserve subsequent user edits.
  const batches = { ...payload, cranes: newCranes };
  for (const [table, rows] of Object.entries(batches)) {
    if (!rows.length) continue;
    const { error: writeError } = await sb.from(table).upsert(rows as unknown as Record<string, unknown>[], { onConflict: "id", ignoreDuplicates: true });
    if (writeError) fail(table, writeError.message);
    console.log(`${table}: verificado/insertado ${rows.length}`);
  }
  for (const [table, rows] of Object.entries(payload)) {
    const { data: saved, error: readError } = await sb.from(table).select("id").in("id", rows.map((r) => r.id));
    if (readError) fail(`Verificación ${table}`, readError.message);
    if (saved?.length !== rows.length) fail(table, `Se esperaban ${rows.length} filas; se encontraron ${saved?.length ?? 0}.`);
  }
  console.log("Carga completa y verificada. Historial, lecturas y órdenes existentes conservados.");
}

main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
