import type {
  ChecklistKind,
  CraneStatus,
  CraneType,
  DocType,
  DowntimeCategory,
  InventoryCategory,
  PurchaseCategory,
  StaffRole,
} from "@/lib/types";

export const CRANE_TYPE_LABELS: Record<CraneType, string> = {
  grua_movil: "Grúa móvil",
  camion_grua: "Camión grúa",
  grua_armable: "Armable en sitio",
  telehandler: "Manipulador telescópico",
  tractocamion: "Tractocamión",
  remolque: "Remolque / cama baja",
  vehiculo_apoyo: "Vehículo de apoyo",
};

export const CRANE_TYPE_LONG: Record<CraneType, string> = {
  grua_movil: "Grúa móvil (todo terreno / RT)",
  camion_grua: "Camión grúa (articulada / telescópica)",
  grua_armable: "Grúa armable en sitio (torre / celosía)",
  telehandler: "Manipulador telescópico",
  tractocamion: "Tractocamión de transporte",
  remolque: "Remolque / cama baja",
  vehiculo_apoyo: "Vehículo de apoyo",
};

export const STATUS_LABELS: Record<CraneStatus, string> = {
  disponible: "Disponible",
  rentada: "Rentada",
  mantenimiento: "Mantenimiento",
  detenida: "Detenida",
};

export const DOC_LABELS: Record<DocType, string> = {
  seguro: "Póliza de seguro",
  tarjeta_circulacion: "Tarjeta de circulación",
  verificacion: "Verificación vehicular",
  permiso_sct: "Permiso SCT carga especializada",
  certificacion_carga: "Certificación de grúa (tercero)",
  factura: "Factura",
  poliza_mantenimiento: "Póliza de mantenimiento",
  manual: "Manual / tabla de cargas",
  otro: "Otro",
};

export const DOWNTIME_LABELS: Record<DowntimeCategory, string> = {
  falla_mecanica: "Falla mecánica",
  documentacion: "Documentación",
  accidente: "Accidente",
  falta_operador: "Falta de operador",
  revision_rechazada: "Revisión rechazada",
  clima: "Clima",
  otro: "Otro",
};

export const CHECKLIST_KIND_LABELS: Record<ChecklistKind, string> = {
  revision_total: "Revisión total",
  pre_renta: "Pre-renta",
  post_renta: "Recepción post-renta",
  diaria: "Diaria del operador",
  mantenimiento: "Checklist de mantenimiento",
};

export const INVENTORY_CATEGORY_LABELS: Record<InventoryCategory, string> = {
  aceite: "Aceites y lubricantes",
  filtro: "Filtros",
  llanta: "Llantas",
  refaccion: "Refacciones",
  consumible: "Consumibles",
  herramienta: "Herramienta y accesorios",
  otro: "Otro",
};

export const PURCHASE_CATEGORY_LABELS: Record<PurchaseCategory, string> = {
  refacciones: "Refacciones",
  aceites: "Aceites",
  llantas: "Llantas",
  combustible: "Combustible",
  taller: "Taller externo",
  seguros_tramites: "Seguros y trámites",
  herramienta: "Herramienta",
  otros: "Otros",
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  direccion: "Dirección",
  administracion: "Administración",
  operador: "Operador",
  mecanico: "Mecánico",
  almacen: "Almacén",
  ventas: "Ventas",
};

export const FLAG_LABELS: Record<string, string> = {
  respuesta_rapida: "Respuesta apresurada",
  foto_duplicada: "Foto repetida",
  foto_antigua: "Foto no tomada en el momento",
  foto_no_coincide: "Foto no corresponde (IA)",
  falla_sin_nota: "Falla sin explicación",
  fuera_de_rango: "Valor fuera de rango",
  incompleta: "Incompleta",
  // inventario
  fuera_de_horario: "Fuera de horario",
  consumo_atipico: "Consumo atípico",
  incompatible: "Pieza no compatible",
  sin_evidencia: "Sin evidencia de pieza usada",
  sobre_umbral: "Monto requiere autorización",
  sin_orden: "Sin orden de trabajo",
  diferencia_conteo: "Diferencia en conteo",
};

/** "18 L", "2 piezas", "1 juego" */
export function qtyUnit(n: number, unit: string) {
  const v = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(n);
  const short: Record<string, string> = { litro: "L", kg: "kg", metro: "m" };
  if (short[unit]) return `${v} ${short[unit]}`;
  return `${v} ${Math.abs(n) === 1 ? unit : `${unit}s`}`;
}

export const flagText = (flags: string[]) => flags.map((f) => FLAG_LABELS[f] ?? f).join(", ");
