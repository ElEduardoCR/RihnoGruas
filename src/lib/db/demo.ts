import type { AgentConversation, TableName, Tables, WaMessage } from "@/lib/types";
import { buildSeed, type SeedData } from "@/lib/demo/seed";
import { buildFleetPreview } from "@/lib/fleet/preview";
import type { Bucket, Db, Query, Scalar, StoredFile } from "./types";

// Almacén en memoria compartido por todo el proceso (server components,
// server actions y route handlers). Se reinicia al reiniciar el servidor.
interface DemoState {
  tables: SeedData;
  files: Map<string, StoredFile>;
}

const g = globalThis as unknown as { __rhinoDemo?: DemoState };

function state(): DemoState {
  if (!g.__rhinoDemo) g.__rhinoDemo = { tables: process.env.FLEET_PREVIEW === "1" ? buildFleetPreview(new Date()) : buildSeed(new Date()), files: new Map() };
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
  if (table === "agent_conversations") {
    r.message_count ??= 0;
    r.last_message_at ??= null;
    r.summary ??= null;
    r.summary_message_count ??= 0;
    r.summary_updated_at ??= null;
  }
  if (table === "wa_messages") r.conversation_id ??= null;
  return r as unknown as Tables[T];
}

const clone = <T>(v: T): T => structuredClone(v);

export function demoDb(): Db {
  const s = state();
  // The dev server may retain demo state across this schema addition.
  s.tables.agent_conversations ??= [];
  const rows = <T extends TableName>(t: T) => s.tables[t] as Tables[T][];

  function validateConversation(row: AgentConversation) {
    if (!rows("staff").some((staff) => staff.id === row.staff_id) || row.phone !== `web:${row.staff_id}`) throw new Error("La conversación no corresponde a un empleado válido.");
    if (!Number.isInteger(row.message_count) || row.message_count < 0 || !Number.isInteger(row.summary_message_count) || row.summary_message_count < 0 || row.summary_message_count > row.message_count) throw new Error("El contador del resumen no corresponde a los mensajes.");
    if (row.summary !== null && (typeof row.summary !== "string" || Array.from(row.summary).length > 6000)) throw new Error("El resumen supera el límite de 6,000 caracteres.");
  }

  function prepareInserts<T extends TableName>(table: T, list: Tables[T][]) {
    if (table === "agent_conversations") {
      const ids = new Set(rows("agent_conversations").map((row) => row.id));
      for (const entry of list) {
        const conversation = entry as AgentConversation;
        if (ids.has(conversation.id)) throw new Error('duplicate key value violates unique constraint "agent_conversations_pkey"');
        validateConversation(conversation);
        ids.add(conversation.id);
      }
    }
    if (table !== "wa_messages") return;
    const updates = new Map<string, AgentConversation>();
    for (const entry of list) {
      const message = entry as WaMessage;
      if (!message.conversation_id) continue;
      const current = updates.get(message.conversation_id) ?? rows("agent_conversations").find((row) => row.id === message.conversation_id);
      if (!current || current.staff_id !== message.staff_id || current.phone !== message.phone) throw new Error("La conversación no corresponde al empleado y canal del mensaje.");
      updates.set(current.id, {
        ...current, message_count: current.message_count + 1,
        last_message_at: !current.last_message_at || Date.parse(message.created_at) > Date.parse(current.last_message_at) ? message.created_at : current.last_message_at,
      });
    }
    // Validate the whole batch before changing counters, mirroring one SQL transaction.
    for (const [id, conversation] of updates) {
      const index = rows("agent_conversations").findIndex((row) => row.id === id);
      rows("agent_conversations")[index] = conversation;
    }
  }

  return {
    mode: "demo",

    async createInventoryCountBundle(input) {
      if (!Number.isFinite(input.countedQty) || input.countedQty < 0 || !Number.isFinite(input.expectedStock) || typeof input.expectedUnit !== "string" || !input.expectedUnit.trim()) throw new Error("Conteo o inventario esperado inválido.");
      const staff = rows("staff").find((person) => person.id === input.countedBy && person.active);
      if (!staff || !["direccion", "administracion", "almacen"].includes(staff.role)) throw new Error("Sin permiso para registrar este conteo.");
      const item = rows("inventory_items").find((entry) => entry.id === input.itemId && entry.active);
      if (!item) throw new Error("Artículo no encontrado o inactivo.");
      const systemQty = rows("inventory_movements").filter((movement) => movement.item_id === item.id && movement.status === "aplicado").reduce((sum, movement) => sum + movement.qty_delta, 0);
      if (Math.abs(systemQty - input.expectedStock) > 1e-9 || item.unit !== input.expectedUnit) throw new Error("El inventario cambió desde el resumen. Prepara nuevamente el conteo.");
      const variance = input.countedQty - systemQty;
      const count = withDefaults("inventory_counts", { item_id: item.id, counted_qty: input.countedQty, system_qty: systemQty, counted_by: input.countedBy, notes: input.notes ?? null });
      const movement = variance === 0 ? null : withDefaults("inventory_movements", {
        item_id: item.id, kind: "ajuste", qty_delta: variance, unit_cost: item.unit_cost,
        crane_id: null, maintenance_order_id: null, inspection_id: null, purchase_id: null,
        requested_by: input.countedBy, authorized_by: null,
        reason: `Ajuste por conteo cíclico (${variance > 0 ? "sobrante" : "faltante"})`,
        evidence_paths: [], serial_numbers: [], status: "aplicado", flags: ["diferencia_conteo"], channel: "agente",
      });
      // Comparación y ambas escrituras sin await: el segundo conteo observa el primero.
      rows("inventory_counts").push(count);
      if (movement) rows("inventory_movements").push(movement);
      return clone(count);
    },

    async createMaintenanceBundle(bundle) {
      const order = withDefaults("maintenance_orders", bundle.order);
      const inspection = withDefaults("inspections", bundle.inspection);
      const items = bundle.items.map((i) => withDefaults("inspection_items", i));
      if (!order.id || inspection.maintenance_order_id !== order.id || items.some((i) => i.inspection_id !== inspection.id)) throw new Error("El checklist no corresponde a esta orden.");
      if (bundle.repeat) {
        if (!s.tables.maintenance_orders.some((m) => m.id === order.id && ["programado", "en_proceso"].includes(m.status))) throw new Error("La orden no está abierta.");
        if (s.tables.inspections.some((i) => i.maintenance_order_id === order.id && !["completada", "cancelada"].includes(i.status))) throw new Error("Ya hay un checklist pendiente.");
      } else {
        if (s.tables.maintenance_orders.some((m) => m.crane_id === order.crane_id && m.plan_id === order.plan_id && ["programado", "en_proceso"].includes(m.status))) throw new Error("Ya existe una orden abierta para este plan.");
        s.tables.maintenance_orders.push(order);
      }
      s.tables.inspections.push(inspection);
      s.tables.inspection_items.push(...items);
      return clone(order);
    },

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
      if (q?.offset !== undefined) out = out.slice(q.offset);
      if (q?.limit !== undefined) out = out.slice(0, q.limit);
      else if (q?.offset !== undefined) out = out.slice(0, 100);
      return clone(out);
    },

    async get(table, id) {
      const r = rows(table).find((x) => (x as { id: string }).id === id);
      return r ? clone(r) : null;
    },

    async insert(table, row) {
      const full = withDefaults(table, row);
      prepareInserts(table, [full]);
      rows(table).push(full);
      return clone(full);
    },

    async insertMany(table, list) {
      const full = list.map((r) => withDefaults(table, r));
      prepareInserts(table, full);
      rows(table).push(...full);
      return clone(full);
    },

    async update(table, id, patch) {
      const list = rows(table);
      const i = list.findIndex((x) => (x as { id: string }).id === id);
      if (i < 0) throw new Error(`[demo] ${table} ${id} no existe`);
      const updated = { ...list[i], ...patch };
      if (table === "agent_conversations") validateConversation(updated as AgentConversation);
      list[i] = updated;
      return clone(list[i]);
    },

    async updateWhere(table, id, patch, expected) {
      const list = rows(table);
      const i = list.findIndex((row) => row.id === id && matches(row as unknown as Record<string, unknown>, { eq: expected }));
      if (i < 0) return null;
      // Compare and write synchronously, so concurrent confirmations cannot both win.
      const updated = { ...list[i], ...patch };
      if (table === "agent_conversations") validateConversation(updated as AgentConversation);
      list[i] = updated;
      return clone(list[i]);
    },

    async updatePendingAction(id, expectedStatus, patch, guard) {
      const list = rows("agent_pending_actions");
      const i = list.findIndex((row) => row.id === id && row.status === expectedStatus
        && (!guard?.staffId || row.staff_id === guard.staffId)
        && (!guard?.unexpiredAt || Date.parse(row.expires_at) > Date.parse(guard.unexpiredAt)));
      if (i < 0) return null;
      // No await entre la comparación y la escritura: una sola solicitud puede reclamarla.
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
