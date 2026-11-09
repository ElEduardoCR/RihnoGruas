import type { TableName, Tables, MaintenanceOrder, Inspection, InspectionItem, PendingAction, InventoryCount } from "@/lib/types";

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
  /** Zero-based pagination; use with an explicit limit and stable ordering. */
  offset?: number;
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
  /** Atomic comparison and update; null means the expected fields no longer match. */
  updateWhere<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>, expected: Record<string, Scalar>): Promise<Tables[T] | null>;
  /** Atomic status transition: null means another request changed or claimed the proposal. */
  updatePendingAction(
    id: string,
    expectedStatus: PendingAction["status"],
    patch: Partial<Pick<PendingAction, "status" | "resolved_at" | "result">>,
    guard?: { staffId?: string; unexpiredAt?: string },
  ): Promise<PendingAction | null>;
  remove<T extends TableName>(table: T, id: string): Promise<void>;
  upload(bucket: Bucket, path: string, file: StoredFile): Promise<void>;
  download(bucket: Bucket, path: string): Promise<StoredFile | null>;
  /** Creates the order, its checklist and frozen steps in one transaction. */
  createMaintenanceBundle?(bundle: MaintenanceBundle): Promise<MaintenanceOrder>;
  /** Records a count and its adjustment against the expected stock in one transaction. */
  createInventoryCountBundle?(input: InventoryCountInput): Promise<InventoryCount>;
}

export interface InventoryCountInput {
  itemId: string;
  countedQty: number;
  expectedStock: number;
  expectedUnit: string;
  countedBy: string | null;
  notes?: string | null;
}

export interface MaintenanceBundle {
  repeat?: boolean;
  order: Partial<MaintenanceOrder>;
  inspection: Partial<Inspection>;
  items: Partial<InspectionItem>[];
}

export type Bucket = "evidencias" | "documentos" | "chat-adjuntos";
