import type { SupabaseClient } from "@supabase/supabase-js";
import type { TableName, Tables } from "@/lib/types";
import type { Bucket, Db, Query, StoredFile } from "./types";

type AnyClient = SupabaseClient;

// Aplica el filtro genérico al query builder de PostgREST
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyQuery(builder: any, q?: Query) {
  if (!q) return builder;
  for (const [k, v] of Object.entries(q.eq ?? {})) builder = v === null ? builder.is(k, null) : builder.eq(k, v);
  for (const [k, v] of Object.entries(q.neq ?? {})) builder = builder.neq(k, v);
  for (const [k, v] of Object.entries(q.in ?? {})) builder = builder.in(k, v as unknown[]);
  for (const [k, v] of Object.entries(q.gte ?? {})) builder = builder.gte(k, v);
  for (const [k, v] of Object.entries(q.gt ?? {})) builder = builder.gt(k, v);
  for (const [k, v] of Object.entries(q.lte ?? {})) builder = builder.lte(k, v);
  for (const [k, v] of Object.entries(q.lt ?? {})) builder = builder.lt(k, v);
  for (const [k, v] of Object.entries(q.contains ?? {})) builder = builder.contains(k, v as unknown[]);
  for (const k of q.isNull ?? []) builder = builder.is(k, null);
  for (const k of q.notNull ?? []) builder = builder.not(k, "is", null);
  if (q.order) builder = builder.order(q.order.column, { ascending: q.order.ascending ?? true });
  if (q.limit) builder = builder.limit(q.limit);
  return builder;
}

function fail(table: string, op: string, error: { message: string } | null): never {
  throw new Error(`[db] ${op} ${table}: ${error?.message ?? "error desconocido"}`);
}

export function supabaseDb(client: AnyClient): Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (t: TableName) => client.from(t) as any;
  return {
    mode: "supabase",

    async createMaintenanceBundle(bundle) {
      const { data, error } = await client.rpc("create_maintenance_checklist", {
        p_order: bundle.order, p_inspection: bundle.inspection, p_items: bundle.items, p_repeat: bundle.repeat ?? false,
      });
      if (error) fail("maintenance_orders", "create bundle", error);
      return data as Tables["maintenance_orders"];
    },

    async select<T extends TableName>(table: T, q?: Query) {
      const { data, error } = await applyQuery(tbl(table).select("*"), q);
      if (error) fail(table, "select", error);
      return (data ?? []) as Tables[T][];
    },

    async get<T extends TableName>(table: T, id: string) {
      const { data, error } = await tbl(table).select("*").eq("id", id).maybeSingle();
      if (error) fail(table, "get", error);
      return (data ?? null) as Tables[T] | null;
    },

    async insert<T extends TableName>(table: T, row: Partial<Tables[T]>) {
      const { data, error } = await tbl(table).insert(row).select("*").single();
      if (error) fail(table, "insert", error);
      return data as Tables[T];
    },

    async insertMany<T extends TableName>(table: T, rows: Partial<Tables[T]>[]) {
      if (rows.length === 0) return [];
      const { data, error } = await tbl(table).insert(rows).select("*");
      if (error) fail(table, "insert", error);
      return (data ?? []) as Tables[T][];
    },

    async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>) {
      const { data, error } = await tbl(table).update(patch).eq("id", id).select("*").single();
      if (error) fail(table, "update", error);
      return data as Tables[T];
    },

    async remove<T extends TableName>(table: T, id: string) {
      const { error } = await tbl(table).delete().eq("id", id);
      if (error) fail(table, "delete", error);
    },

    async upload(bucket: Bucket, path: string, file: StoredFile) {
      const { error } = await client.storage
        .from(bucket)
        .upload(path, file.bytes, { contentType: file.contentType, upsert: false });
      if (error) throw new Error(`[storage] upload ${bucket}/${path}: ${error.message}`);
    },

    async download(bucket: Bucket, path: string) {
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) return null;
      return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || "application/octet-stream" };
    },
  };
}
