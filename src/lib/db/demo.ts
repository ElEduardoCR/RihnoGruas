import type { TableName, Tables } from "@/lib/types";
import { buildSeed, type SeedData } from "@/lib/demo/seed";
import type { Bucket, Db, Query, Scalar, StoredFile } from "./types";

// Almacén en memoria compartido por todo el proceso (server components,
// server actions y route handlers). Se reinicia al reiniciar el servidor.
interface DemoState {
  tables: SeedData;
  files: Map<string, StoredFile>;
}

const g = globalThis as unknown as { __rhinoDemo?: DemoState };

function state(): DemoState {
  if (!g.__rhinoDemo) g.__rhinoDemo = { tables: buildSeed(new Date()), files: new Map() };
  return g.__rhinoDemo;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function cmp(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string" && DATE_RE.test(a) && DATE_RE.test(b)) {
    return Date.parse(a) - Date.parse(b);
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function matches(row: Record<string, unknown>, q?: Query): boolean {
  if (!q) return true;
  for (const [k, v] of Object.entries(q.eq ?? {})) if ((row[k] ?? null) !== v) return false;
  for (const [k, v] of Object.entries(q.neq ?? {})) if ((row[k] ?? null) === v) return false;
  for (const [k, v] of Object.entries(q.in ?? {})) if (!v.includes((row[k] ?? null) as Scalar)) return false;
  for (const [k, v] of Object.entries(q.gte ?? {})) if (row[k] == null || cmp(row[k], v) < 0) return false;
  for (const [k, v] of Object.entries(q.gt ?? {})) if (row[k] == null || cmp(row[k], v) <= 0) return false;
  for (const [k, v] of Object.entries(q.lte ?? {})) if (row[k] == null || cmp(row[k], v) > 0) return false;
  for (const [k, v] of Object.entries(q.lt ?? {})) if (row[k] == null || cmp(row[k], v) >= 0) return false;
  for (const [k, v] of Object.entries(q.contains ?? {})) {
    const arr = row[k];
    if (!Array.isArray(arr) || !v.every((x) => arr.includes(x))) return false;
  }
  for (const k of q.isNull ?? []) if (row[k] != null) return false;
  for (const k of q.notNull ?? []) if (row[k] == null) return false;
  return true;
}

const ARRAY_DEFAULTS: Partial<Record<TableName, string[]>> = {
  staff: ["alert_topics"],
  inspections: ["quality_flags"],
  inspection_items: ["photo_paths", "photo_hashes", "flags"],
  inventory_movements: ["evidence_paths", "serial_numbers", "flags"],
  alerts: ["sent_to"],
  agent_runs: ["tool_calls"],
  checklist_templates: ["crane_types"],
};

function randomHex(bytes: number) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

function withDefaults<T extends TableName>(table: T, row: Partial<Tables[T]>): Tables[T] {
  const r = { ...row } as Record<string, unknown>;
  r.id ??= crypto.randomUUID();
  r.created_at ??= new Date().toISOString();
  for (const k of ARRAY_DEFAULTS[table] ?? []) r[k] ??= [];
  if (table === "inspections") r.access_token ??= randomHex(18);
  if (table === "inventory_counts") r.variance = Number(r.counted_qty) - Number(r.system_qty);
  return r as unknown as Tables[T];
}

const clone = <T>(v: T): T => structuredClone(v);

export function demoDb(): Db {
  const s = state();
  const rows = <T extends TableName>(t: T) => s.tables[t] as Tables[T][];

  return {
    mode: "demo",

    async select(table, q) {
      let out = rows(table).filter((r) => matches(r as unknown as Record<string, unknown>, q));
      if (q?.order) {
        const { column, ascending = true } = q.order;
        out = [...out].sort((a, b) => {
          const va = (a as unknown as Record<string, unknown>)[column];
          const vb = (b as unknown as Record<string, unknown>)[column];
          if (va == null) return 1;
          if (vb == null) return -1;
          return ascending ? cmp(va, vb) : cmp(vb, va);
        });
      }
      if (q?.limit) out = out.slice(0, q.limit);
      return clone(out);
    },

    async get(table, id) {
      const r = rows(table).find((x) => (x as { id: string }).id === id);
      return r ? clone(r) : null;
    },

    async insert(table, row) {
      const full = withDefaults(table, row);
      rows(table).push(full);
      return clone(full);
    },

    async insertMany(table, list) {
      const full = list.map((r) => withDefaults(table, r));
      rows(table).push(...full);
      return clone(full);
    },

    async update(table, id, patch) {
      const list = rows(table);
      const i = list.findIndex((x) => (x as { id: string }).id === id);
      if (i < 0) throw new Error(`[demo] ${table} ${id} no existe`);
      list[i] = { ...list[i], ...patch };
      return clone(list[i]);
    },

    async remove(table, id) {
      const list = rows(table);
      const i = list.findIndex((x) => (x as { id: string }).id === id);
      if (i >= 0) list.splice(i, 1);
    },

    async upload(bucket: Bucket, path: string, file: StoredFile) {
      s.files.set(`${bucket}/${path}`, file);
    },

    async download(bucket: Bucket, path: string) {
      return s.files.get(`${bucket}/${path}`) ?? null;
    },
  };
}
