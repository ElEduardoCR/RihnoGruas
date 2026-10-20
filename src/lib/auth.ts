import "server-only";
import type { Db } from "@/lib/db/types";
import type { Staff } from "@/lib/types";
import { isDemo } from "@/lib/env";
import { createUserSupabase } from "@/lib/db";

/** Personal que usa la web. En modo demo actúa como Dirección. */
export async function currentStaff(db: Db): Promise<Staff | null> {
  if (isDemo) {
    const staff = await db.select("staff", { eq: { role: "direccion" }, limit: 1 });
    return staff[0] ?? null;
  }
  const supabase = await createUserSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const rows = await db.select("staff", { eq: { auth_user_id: data.user.id }, limit: 1 });
  return rows[0] ?? null;
}
