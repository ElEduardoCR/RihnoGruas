"use server";

import { redirect } from "next/navigation";
import { createUserSupabase } from "@/lib/db";
import { isDemo } from "@/lib/env";

export async function signInAction(_: { error: string } | null, f: FormData) {
  if (isDemo) redirect("/");
  const identifier = String(f.get("email") ?? "").trim().toLowerCase();
  const email = identifier === "admin" ? "admin@rhino.invalid" : identifier;
  const password = String(f.get("password") ?? "");
  const next = String(f.get("next") ?? "/");
  const supabase = await createUserSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Usuario, correo o contraseña incorrectos." };
  const internalPath = next.startsWith("/") && !next.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(next);
  redirect(internalPath ? next : "/");
}
