/**
 * Pobla Supabase.
 *
 *   npm run db:seed              → datos de demostración completos (relativos a hoy)
 *   npm run db:seed -- --catalogos → sólo plantillas de checklist y políticas (arranque real)
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { buildSeed, type SeedData } from "../src/lib/demo/seed";
import type { TableName } from "../src/lib/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY (.env.local)");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const onlyCatalogs = process.argv.includes("--catalogos");
const force = process.argv.includes("--force");

// Orden que respeta llaves foráneas
const ORDER: TableName[] = [
  "staff",
  "cranes",
  "crane_documents",
  "crane_operators",
  "clients",
  "rentals",
  "maintenance_orders",
  "checklist_templates",
  "checklist_template_items",
  "crane_checklist_items",
  "inspections",
  "inspection_items",
  "downtimes",
  "inventory_items",
  "inventory_compat",
  "purchases",
  "purchase_items",
  "inventory_movements",
  "inventory_counts",
  "wa_messages",
  "agent_runs",
  "agent_pending_actions",
  "alerts",
  "knowledge_docs",
];
const CATALOGS: TableName[] = ["checklist_templates", "checklist_template_items", "knowledge_docs"];

async function insert(table: TableName, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => {
      const copy = { ...r };
      if (table === "inventory_counts") delete copy.variance; // columna generada
      return copy;
    });
    const { error } = await sb.from(table).insert(chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`  ✓ ${table}: ${rows.length}`);
}

async function main() {
  const { count } = await sb.from(onlyCatalogs ? "checklist_templates" : "cranes").select("*", { count: "exact", head: true });
  if (count && !force) {
    console.error(`La base ya tiene datos (${count}). Usa --force para insertar de todos modos.`);
    process.exit(1);
  }
  const data: SeedData = buildSeed(new Date());
  console.log(onlyCatalogs ? "Insertando catálogos…" : "Insertando datos de demostración…");
  for (const table of ORDER) {
    if (onlyCatalogs && !CATALOGS.includes(table)) continue;
    await insert(table, data[table] as unknown as Record<string, unknown>[]);
  }

  if (process.env.OPENAI_API_KEY) {
    const { embedMissingKnowledge } = await import("../src/lib/agent/knowledge");
    const n = await embedMissingKnowledge();
    console.log(`  ✓ embeddings de políticas: ${n}`);
  } else {
    console.log("  · Sin OPENAI_API_KEY: los embeddings se generarán en el primer cron /api/cron/scan");
  }
  console.log("Listo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
