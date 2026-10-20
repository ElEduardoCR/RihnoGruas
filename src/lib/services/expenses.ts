import type { Db } from "@/lib/db/types";
import type { PurchaseCategory } from "@/lib/types";
import { addMonths, dayKey, fmt, startOfMonth } from "@/lib/time";

export const EXPENSE_CATEGORIES: PurchaseCategory[] = [
  "combustible",
  "refacciones",
  "taller",
  "llantas",
  "aceites",
  "seguros_tramites",
  "herramienta",
  "otros",
];

export async function expenseSummary(db: Db, from: Date, to: Date) {
  const [purchases, maintenance, cranes] = await Promise.all([
    db.select("purchases", { gte: { purchased_on: dayKey(from) }, lt: { purchased_on: dayKey(to) } }),
    db.select("maintenance_orders", { eq: { status: "completado" }, gte: { completed_at: from.toISOString() }, lt: { completed_at: to.toISOString() } }),
    db.select("cranes"),
  ]);
  const byCategory = new Map<PurchaseCategory, number>();
  const byCrane = new Map<string, number>();
  for (const p of purchases) {
    byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + p.total);
    if (p.crane_id) byCrane.set(p.crane_id, (byCrane.get(p.crane_id) ?? 0) + p.total);
  }
  const total = purchases.reduce((s, p) => s + p.total, 0);
  return {
    total,
    count: purchases.length,
    byCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    byCrane: [...byCrane.entries()]
      .map(([craneId, amount]) => ({ crane: cranes.find((c) => c.id === craneId)!, amount }))
      .filter((x) => x.crane)
      .sort((a, b) => b.amount - a.amount),
    maintenanceCost: maintenance.reduce((s, m) => s + m.cost, 0),
  };
}

export interface MonthRow {
  key: string;
  label: string;
  total: number;
  byCategory: Record<PurchaseCategory, number>;
}

/** Gasto mensual por categoría de los últimos `months` meses (incluye el actual). */
export async function monthlyExpenses(db: Db, now: Date, months = 6): Promise<MonthRow[]> {
  const first = addMonths(startOfMonth(now), -(months - 1));
  const purchases = await db.select("purchases", { gte: { purchased_on: dayKey(first) } });
  const rows: MonthRow[] = Array.from({ length: months }, (_, i) => {
    const m = addMonths(first, i);
    return {
      key: dayKey(m).slice(0, 7),
      label: fmt.monthShort(m),
      total: 0,
      byCategory: Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0])) as Record<PurchaseCategory, number>,
    };
  });
  for (const p of purchases) {
    const row = rows.find((r) => r.key === p.purchased_on.slice(0, 7));
    if (!row) continue;
    row.byCategory[p.category] += p.total;
    row.total += p.total;
  }
  return rows;
}

export async function latestPurchases(db: Db, limit = 6) {
  const [purchases, cranes] = await Promise.all([
    db.select("purchases", { order: { column: "created_at", ascending: false }, limit }),
    db.select("cranes"),
  ]);
  return purchases.map((p) => ({ ...p, crane: p.crane_id ? cranes.find((c) => c.id === p.crane_id) ?? null : null }));
}
