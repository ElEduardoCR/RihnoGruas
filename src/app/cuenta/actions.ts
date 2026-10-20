"use server";

import { createUserSupabase } from "@/lib/db";
import { isDemo } from "@/lib/env";

export async function changePasswordAction(_: { ok: boolean; message: string } | null, f: FormData) {
  if (isDemo) return { ok: false, message: "En modo demo no hay cuentas." };
  const password = String(f.get("password") ?? "");
  const confirm = String(f.get("confirm") ?? "");
  if (password.length < 10) return { ok: false, message: "Usa al menos 10 caracteres." };
  if (password !== confirm) return { ok: false, message: "Las contraseñas no coinciden." };
  const { error } = await (await createUserSupabase()).auth.updateUser({ password });
  if (error) return { ok: false, message: `No se pudo cambiar: ${error.message}` };
  return { ok: true, message: "Contraseña actualizada." };
}
