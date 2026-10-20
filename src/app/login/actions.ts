"use server";

import { redirect } from "next/navigation";
import { createUserSupabase } from "@/lib/db";
import { isDemo } from "@/lib/env";

export async function signInAction(_: { error: string } | null, f: FormData) {
  if (isDemo) redirect("/");
  const email = String(f.get("email") ?? "").trim();
  const password = String(f.get("password") ?? "");
  const next = String(f.get("next") ?? "/");
  const supabase = await createUserSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Correo o contraseña incorrectos." };
  redirect(next.startsWith("/") ? next : "/");
}
