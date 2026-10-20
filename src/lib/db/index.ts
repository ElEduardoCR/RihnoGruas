import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env, isDemo } from "@/lib/env";
import { demoDb } from "./demo";
import { supabaseDb } from "./supabase";
import type { Db } from "./types";

export type { Db, Query } from "./types";

/** Cliente con la sesión del usuario web: RLS aplica (sólo personal activo). */
export async function createUserSupabase() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: el proxy refresca la sesión.
        }
      },
    },
  });
}

/** Cliente service_role: sólo para el agente, webhook de WhatsApp, crons y enlaces con token. */
export function createAdminSupabase() {
  return createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Acceso a datos para la web (respeta RLS). */
export async function getDb(): Promise<Db> {
  if (isDemo) return demoDb();
  return supabaseDb(await createUserSupabase());
}

/** Acceso a datos privilegiado (agente, webhooks, crons, wizard por token). */
export function getAdminDb(): Db {
  if (isDemo) return demoDb();
  return supabaseDb(createAdminSupabase());
}
