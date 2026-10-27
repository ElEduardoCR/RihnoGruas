/** Read-only by default. --apply patches only versioned checklist definitions, atomically. */
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { buildSergioFleet } from "../src/lib/fleet/sergio";
import type { Crane } from "../src/lib/types";

const apply = process.argv.includes("--apply");
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, SUPABASE_PROJECT_REF: ref, SUPABASE_DB_PASSWORD: password, SUPABASE_DB_URL: customUrl } = process.env;
if (!url || !key) throw new Error("Faltan las credenciales de Supabase.");
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const catalog = buildSergioFleet();

async function main() {
  const { data, error } = await sb.from("cranes").select("id,code,fleet_profile");
  if (error) throw new Error(error.message);
  const existing = (data ?? []) as Crane[];
  const updates = catalog.map((unit) => {
    const saved = existing.find((c) => c.fleet_profile?.import_key === unit.fleet_profile!.import_key);
    if (!saved) throw new Error(`Primero importa la unidad ${unit.code}.`);
    const plans = unit.fleet_profile!.maintenance_plans;
    if (plans.some((p) => !p.checklist_steps?.length || !p.checklist_version)) throw new Error(`Faltan checklists en ${unit.code}.`);
    if (plans.some((p) => !saved.fleet_profile!.maintenance_plans.some((s) => s.id === p.id))) throw new Error(`Los planes de ${unit.code} cambiaron; revisar antes de actualizar.`);
    return { id: saved.id, import_key: saved.fleet_profile!.import_key, plans: Object.fromEntries(plans.map((p) => [p.id, { checklist_steps: p.checklist_steps, checklist_version: p.checklist_version }])) };
  });
  const count = updates.reduce((n, u) => n + Object.keys(u.plans).length, 0);
  console.log(JSON.stringify({ mode: apply ? "apply" : "preflight", units: updates.length, checklists: count, scheduled_orders: 0 }));
  if (!apply) return;
  if (!customUrl && (!ref || !password)) throw new Error("Falta conexión directa a la base para la actualización atómica.");
  const dbUrl = customUrl ?? `postgresql://postgres:${encodeURIComponent(password!)}@db.${ref}.supabase.co:5432/postgres?sslmode=require`;
  const delimiter = `$catalog_${crypto.randomUUID().replaceAll("-", "")}$`;
  // Merge into the current row under PostgreSQL's update lock, preserving all
  // profile fields, custom plans, edits and the original plan ordering.
  const sql = `DO $apply_checklist_catalog$ DECLARE changed integer; BEGIN
    WITH definitions AS (SELECT * FROM jsonb_to_recordset(${delimiter}${JSON.stringify(updates)}${delimiter}::jsonb) AS d(id uuid, import_key text, plans jsonb))
    UPDATE public.cranes c SET fleet_profile = jsonb_set(c.fleet_profile, '{maintenance_plans}',
      (SELECT jsonb_agg(p.value || coalesce(d.plans->(p.value->>'id'),'{}'::jsonb) ORDER BY p.ordinality)
       FROM jsonb_array_elements(c.fleet_profile->'maintenance_plans') WITH ORDINALITY AS p(value,ordinality)))
    FROM definitions d WHERE c.id=d.id AND c.fleet_profile->>'import_key'=d.import_key;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> ${updates.length} THEN RAISE EXCEPTION 'El catálogo cambió; no se actualizó ninguna unidad'; END IF;
    END $apply_checklist_catalog$;`;
  const folder = mkdtempSync(join(tmpdir(), "rhino-checklists-"));
  try {
    const file = join(folder, "update.sql");
    writeFileSync(file, sql, { mode: 0o600 });
    const result = spawnSync("supabase", ["db", "query", "--db-url", dbUrl, "--file", file], { encoding: "utf8", timeout: 60_000 });
    if (result.error || result.status !== 0) {
      let message = result.stderr || result.error?.message || "La actualización no terminó.";
      for (const secret of [dbUrl, password, password ? encodeURIComponent(password) : undefined]) if (secret) message = message.split(secret).join("***");
      throw new Error(message);
    }
  } finally { rmSync(folder, { recursive: true, force: true }); }
  const { data: verified, error: verifyError } = await sb.from("cranes").select("id,fleet_profile").in("id", updates.map((u) => u.id));
  if (verifyError) throw new Error(verifyError.message);
  for (const update of updates) {
    const saved = (verified as Crane[]).find((c) => c.id === update.id);
    for (const [id, expected] of Object.entries(update.plans)) {
      const actual = saved?.fleet_profile?.maintenance_plans.find((p) => p.id === id);
      if (!actual || actual.checklist_version !== expected.checklist_version || !isDeepStrictEqual(actual.checklist_steps, expected.checklist_steps)) throw new Error(`No se pudo verificar ${id}.`);
    }
  }
  console.log(`Verificados ${count} checklists en ${updates.length} unidades. Historial y órdenes conservados.`);
}
main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
