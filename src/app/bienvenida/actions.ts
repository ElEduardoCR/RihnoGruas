"use server";

import { redirect } from "next/navigation";
import { bootstrapDirector } from "@/lib/services/access";

export async function bootstrapAction(_: { error: string } | null, f: FormData) {
  try {
    await bootstrapDirector({ fullName: String(f.get("full_name") ?? ""), phone: (f.get("phone") as string) || null });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar" };
  }
  redirect("/catalogos");
}
