"use server";

import { revalidatePath } from "next/cache";
import { currentStaff } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { startChecklist } from "@/lib/services/start-checklist";
import type { ChecklistKind } from "@/lib/types";
import type { FormState } from "./actions";

export async function startChecklistAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const read = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" ? value.trim() : "";
    };
    const db = await getDb();
    const staff = await currentStaff(db);
    const inspection = await startChecklist(db, {
      craneId: read("crane_id"), kind: read("kind") as ChecklistKind, planId: read("plan_id") || null,
      durationHours: read("duration_hours") ? Number(read("duration_hours")) : undefined,
    }, staff, new Date());
    revalidatePath("/checklists");
    revalidatePath(`/gruas/${inspection.crane_id}`);
    revalidatePath("/gruas");
    revalidatePath("/calendario");
    return { ok: true, message: "Revisión lista. Abriendo el paso pendiente…", checklistUrl: `/c/${inspection.access_token}` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo iniciar la revisión. Intenta de nuevo." };
  }
}
