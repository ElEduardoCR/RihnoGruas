/**
 * Atajos de la CLI de Supabase que leen las credenciales de .env.local
 * (la contraseña de la base nunca se escribe en la terminal ni en git).
 *
 *   npm run db:push    aplica las migraciones pendientes de supabase/migrations
 *   npm run db:status  muestra qué migraciones ya están aplicadas
 *   npm run db:link    (opcional) vincula la carpeta si la CLI tiene sesión
 *                      con la cuenta dueña del proyecto (supabase login)
 *
 * push/status se conectan directo a la base con SUPABASE_PROJECT_REF +
 * SUPABASE_DB_PASSWORD, así que no dependen de la cuenta de la CLI. En una
 * red sin IPv6, define SUPABASE_DB_URL con la cadena del "Session pooler"
 * (Supabase → Connect) y se usará en su lugar.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const { SUPABASE_PROJECT_REF: ref, SUPABASE_DB_PASSWORD: password, SUPABASE_DB_URL: customUrl } = process.env;
const action = process.argv[2];

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function dbUrl() {
  if (customUrl) return customUrl;
  if (!ref) fail("Falta SUPABASE_PROJECT_REF en .env.local (lo que va antes de .supabase.co).");
  if (!password) fail("Falta SUPABASE_DB_PASSWORD en .env.local (Settings → Database del proyecto).");
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres?sslmode=require`;
}

const commands = {
  push: () => ["db", "push", "--db-url", dbUrl()],
  status: () => ["migration", "list", "--db-url", dbUrl()],
  link: () => {
    if (!ref) fail("Falta SUPABASE_PROJECT_REF en .env.local.");
    return ["link", "--project-ref", ref];
  },
};

if (!commands[action]) fail(`Uso: node scripts/supabase.mjs ${Object.keys(commands).join(" | ")}`);

// Argumentos extra se pasan tal cual (p. ej. npm run db:push -- --yes)
const args = [...commands[action](), ...process.argv.slice(3)];
const r = spawnSync("supabase", args, {
  stdio: ["inherit", "pipe", "pipe"],
  env: { ...process.env, SUPABASE_DB_PASSWORD: password ?? "" },
  encoding: "utf8",
});
// Nunca mostrar la contraseña aunque la CLI la imprima en un error
const mask = (t) => (password ? t.split(password).join("***").split(encodeURIComponent(password)).join("***") : t);
process.stdout.write(mask(r.stdout ?? ""));
process.stderr.write(mask(r.stderr ?? ""));
if (r.error) fail(`No se pudo ejecutar la CLI de Supabase: ${r.error.message}`);
process.exit(r.status ?? 1);
