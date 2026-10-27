import type { Crane } from "@/lib/types";

/** Reject ambiguous existing identities before writing any rows. */
export function importConflicts(existing: Crane[], incoming: Crane[]): string[] {
  const issues: string[] = [];
  const support = (c: Crane) => ["vehiculo_apoyo", "tractocamion", "remolque"].includes(c.type);
  for (const c of incoming) {
    const economic = c.fleet_profile?.economic_number;
    const owned = existing.find((e) => e.fleet_profile?.import_key === c.fleet_profile?.import_key);
    if (owned) {
      if (owned.id !== c.id) issues.push(`${c.code}: importación previa con otro ID; conciliar antes de continuar.`);
      continue; // Preserve later edits, including names, codes and verified specifications.
    }
    for (const e of existing) {
      const suffix = e.code.match(/(?:^|[- ])0*(\d+)$/)?.[1];
      const economicMatch = economic && suffix === String(Number(economic)) && support(c) === support(e);
      const sameModel = c.year != null && c.model !== "Por identificar" && e.brand === c.brand && e.model === c.model && e.year === c.year;
      if (e.id === c.id || e.code === c.code || economicMatch || sameModel) issues.push(`${c.code}: posible unidad existente ${e.code} (${e.name}); revisar antes de insertar.`);
    }
  }
  return [...new Set(issues)];
}
