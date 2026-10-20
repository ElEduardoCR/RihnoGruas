// Tipos de fila que reflejan supabase/migrations/20261016000000_init.sql

export type CraneType = "grua_movil" | "camion_grua" | "grua_armable";
export type CraneStatus = "disponible" | "rentada" | "mantenimiento" | "detenida";
export type StaffRole = "direccion" | "administracion" | "operador" | "mecanico" | "almacen" | "ventas";
export type AlertTopic = "documentos" | "inventario" | "agenda" | "gastos" | "checklists" | "resumen" | "flota";
export type Channel = "web" | "whatsapp" | "agente";

export interface Staff {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  role: StaffRole;
  phone: string | null;
  email: string | null;
  license_number: string | null;
  license_type: string | null;
  license_expires_on: string | null;
  receives_alerts: boolean;
  alert_topics: AlertTopic[];
  can_authorize: boolean;
  active: boolean;
  created_at: string;
}

export interface Crane {
  id: string;
  code: string;
  name: string;
  type: CraneType;
  brand: string;
  model: string;
  year: number | null;
  serial_number: string | null;
  vin: string | null;
  plates: string | null;
  capacity_tons: number;
  boom_length_m: number | null;
  hour_meter: number;
  odometer_km: number | null;
  service_interval_hours: number;
  last_service_hours: number;
  base_location: string | null;
  daily_rate: number | null;
  notes: string | null;
  acquired_on: string | null;
  active: boolean;
  created_at: string;
}

export type DocType =
  | "seguro"
  | "tarjeta_circulacion"
  | "verificacion"
  | "permiso_sct"
  | "certificacion_carga"
  | "factura"
  | "poliza_mantenimiento"
  | "manual"
  | "otro";

export interface CraneDocument {
  id: string;
  crane_id: string;
  doc_type: DocType;
  title: string;
  number: string | null;
  issuer: string | null;
  issued_on: string | null;
  expires_on: string | null;
  coverage: string | null;
  amount: number | null;
  file_path: string | null;
  notes: string | null;
  created_at: string;
}

export interface CraneOperator {
  id: string;
  crane_id: string;
  staff_id: string;
  approved_on: string;
  approved_by: string | null;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  rfc: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

export type RentalStatus = "cotizada" | "confirmada" | "en_curso" | "finalizada" | "cancelada";

export interface Rental {
  id: string;
  crane_id: string;
  client_id: string;
  operator_id: string | null;
  start_at: string;
  end_at: string;
  site_address: string | null;
  site_notes: string | null;
  rate: number | null;
  rate_unit: "dia" | "hora" | "servicio";
  status: RentalStatus;
  created_by: "web" | "agente";
  notes: string | null;
  created_at: string;
}

export interface MaintenanceOrder {
  id: string;
  crane_id: string;
  kind: "preventivo" | "correctivo";
  title: string;
  description: string | null;
  scheduled_start: string;
  scheduled_end: string;
  status: "programado" | "en_proceso" | "completado" | "cancelado";
  mechanic_id: string | null;
  cost: number;
  hour_meter_at: number | null;
  created_by: "web" | "agente";
  completed_at: string | null;
  created_at: string;
}

export type DowntimeCategory =
  | "falla_mecanica"
  | "documentacion"
  | "accidente"
  | "falta_operador"
  | "revision_rechazada"
  | "clima"
  | "otro";

export interface Downtime {
  id: string;
  crane_id: string;
  category: DowntimeCategory;
  reason: string;
  started_at: string;
  ended_at: string | null;
  reported_by: string | null;
  inspection_id: string | null;
  notes: string | null;
  created_at: string;
}

export type ChecklistKind = "revision_total" | "pre_renta" | "post_renta" | "diaria";
export type ResponseType = "ok_falla" | "numero" | "texto";

export interface ChecklistTemplate {
  id: string;
  name: string;
  kind: ChecklistKind;
  crane_types: CraneType[];
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface ChecklistTemplateItem {
  id: string;
  template_id: string;
  position: number;
  section: string;
  title: string;
  instructions: string | null;
  response_type: ResponseType;
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  requires_photo: boolean;
  photo_hint: string | null;
  critical: boolean;
  created_at: string;
}

export interface CraneChecklistItem {
  id: string;
  crane_id: string;
  section: string;
  title: string;
  instructions: string | null;
  response_type: ResponseType;
  unit: string | null;
  requires_photo: boolean;
  photo_hint: string | null;
  critical: boolean;
  reason: string | null;
  active: boolean;
  created_at: string;
}

export type InspectionStatus = "programada" | "en_progreso" | "completada" | "vencida" | "cancelada";
export type InspectionResult = "aprobada" | "con_observaciones" | "rechazada";

export interface Inspection {
  id: string;
  crane_id: string;
  rental_id: string | null;
  template_id: string | null;
  kind: ChecklistKind;
  title: string;
  scheduled_for: string;
  due_by: string;
  assigned_to: string | null;
  status: InspectionStatus;
  access_token: string;
  started_at: string | null;
  completed_at: string | null;
  result: InspectionResult | null;
  quality_score: number | null;
  quality_flags: string[];
  hour_meter_reading: number | null;
  start_lat: number | null;
  start_lng: number | null;
  signature_name: string | null;
  ai_summary: string | null;
  created_by: "web" | "agente";
  created_at: string;
}

export interface InspectionItem {
  id: string;
  inspection_id: string;
  position: number;
  section: string;
  title: string;
  instructions: string | null;
  response_type: ResponseType;
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  requires_photo: boolean;
  photo_hint: string | null;
  critical: boolean;
  source: "plantilla" | "grua" | "agente";
  source_reason: string | null;
  value_text: string | null;
  value_number: number | null;
  passed: boolean | null;
  notes: string | null;
  photo_paths: string[];
  photo_hashes: string[];
  photo_taken_at: string | null;
  shown_at: string | null;
  answered_at: string | null;
  seconds_spent: number | null;
  flags: string[];
  created_at: string;
}

export type InventoryCategory = "aceite" | "filtro" | "llanta" | "refaccion" | "consumible" | "herramienta" | "otro";

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  scope: "general" | "especifico";
  min_stock: number;
  unit_cost: number;
  location: string | null;
  requires_return: boolean;
  serialized: boolean;
  notes: string | null;
  active: boolean;
  created_at: string;
}

export interface InventoryCompat {
  id: string;
  item_id: string;
  crane_id: string;
  expected_qty_per_service: number | null;
  created_at: string;
}

export type PurchaseCategory =
  | "refacciones"
  | "aceites"
  | "llantas"
  | "combustible"
  | "taller"
  | "seguros_tramites"
  | "herramienta"
  | "otros";

export interface Purchase {
  id: string;
  purchased_on: string;
  supplier: string;
  category: PurchaseCategory;
  description: string;
  crane_id: string | null;
  total: number;
  invoice_number: string | null;
  payment_method: string | null;
  registered_by: string | null;
  channel: Channel;
  created_at: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  item_id: string | null;
  description: string;
  qty: number;
  unit_cost: number;
  created_at: string;
}

export type MovementKind = "entrada" | "salida" | "ajuste" | "devolucion";
export type MovementStatus = "aplicado" | "pendiente_autorizacion" | "rechazado";

export interface InventoryMovement {
  id: string;
  item_id: string;
  kind: MovementKind;
  qty_delta: number;
  unit_cost: number | null;
  crane_id: string | null;
  maintenance_order_id: string | null;
  inspection_id: string | null;
  purchase_id: string | null;
  requested_by: string | null;
  authorized_by: string | null;
  reason: string | null;
  evidence_paths: string[];
  serial_numbers: string[];
  status: MovementStatus;
  flags: string[];
  channel: Channel;
  created_at: string;
}

export interface InventoryCount {
  id: string;
  item_id: string;
  counted_qty: number;
  system_qty: number;
  variance: number;
  counted_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface WaMessage {
  id: string;
  phone: string;
  staff_id: string | null;
  direction: "in" | "out";
  body: string;
  kind: "chat" | "alerta" | "resumen" | "sistema";
  wa_message_id: string | null;
  created_at: string;
}

export interface ToolCallLog {
  name: string;
  args: unknown;
  result: unknown;
  ms: number;
}

export interface AgentRun {
  id: string;
  trigger: "whatsapp" | "web" | "cron" | "evento" | "eval";
  phone: string | null;
  staff_id: string | null;
  input: string;
  output: string | null;
  model: string | null;
  tool_calls: ToolCallLog[];
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  error: string | null;
  rating: number | null;
  created_at: string;
}

export interface PendingAction {
  id: string;
  phone: string;
  staff_id: string | null;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  status: "pendiente" | "confirmada" | "cancelada" | "expirada";
  expires_at: string;
  resolved_at: string | null;
  result: unknown;
  created_at: string;
}

export interface Alert {
  id: string;
  dedupe_key: string;
  topic: AlertTopic;
  severity: "info" | "aviso" | "critica";
  title: string;
  body: string;
  crane_id: string | null;
  sent_to: string[];
  sent_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  source: string | null;
  content: string;
  created_at: string;
}

export interface Tables {
  staff: Staff;
  cranes: Crane;
  crane_documents: CraneDocument;
  crane_operators: CraneOperator;
  clients: Client;
  rentals: Rental;
  maintenance_orders: MaintenanceOrder;
  downtimes: Downtime;
  checklist_templates: ChecklistTemplate;
  checklist_template_items: ChecklistTemplateItem;
  crane_checklist_items: CraneChecklistItem;
  inspections: Inspection;
  inspection_items: InspectionItem;
  inventory_items: InventoryItem;
  inventory_compat: InventoryCompat;
  purchases: Purchase;
  purchase_items: PurchaseItem;
  inventory_movements: InventoryMovement;
  inventory_counts: InventoryCount;
  wa_messages: WaMessage;
  agent_runs: AgentRun;
  agent_pending_actions: PendingAction;
  alerts: Alert;
  knowledge_docs: KnowledgeDoc;
}

export type TableName = keyof Tables;
