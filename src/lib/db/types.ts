import type { TableName, Tables } from "@/lib/types";

export type Scalar = string | number | boolean | null;

export interface Query {
  eq?: Record<string, Scalar>;
  neq?: Record<string, Scalar>;
  in?: Record<string, readonly Scalar[]>;
  gte?: Record<string, string | number>;
  gt?: Record<string, string | number>;
  lte?: Record<string, string | number>;
  lt?: Record<string, string | number>;
  /** columna arreglo que contiene todos los valores */
  contains?: Record<string, readonly Scalar[]>;
  isNull?: string[];
  notNull?: string[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
}

export interface StoredFile {
  bytes: Uint8Array;
  contentType: string;
}

export interface Db {
  mode: "demo" | "supabase";
  select<T extends TableName>(table: T, q?: Query): Promise<Tables[T][]>;
  get<T extends TableName>(table: T, id: string): Promise<Tables[T] | null>;
  insert<T extends TableName>(table: T, row: Partial<Tables[T]>): Promise<Tables[T]>;
  insertMany<T extends TableName>(table: T, rows: Partial<Tables[T]>[]): Promise<Tables[T][]>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<Tables[T]>;
  remove<T extends TableName>(table: T, id: string): Promise<void>;
  upload(bucket: Bucket, path: string, file: StoredFile): Promise<void>;
  download(bucket: Bucket, path: string): Promise<StoredFile | null>;
}

export type Bucket = "evidencias" | "documentos";
