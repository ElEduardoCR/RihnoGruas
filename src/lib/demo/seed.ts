import type {
  AgentRun,
  Alert,
  ChecklistTemplate,
  ChecklistTemplateItem,
  Client,
  Crane,
  CraneChecklistItem,
  CraneDocument,
  CraneOperator,
  CraneType,
  DocType,
  Downtime,
  Inspection,
  InspectionItem,
  InventoryCompat,
  InventoryCount,
  InventoryItem,
  InventoryMovement,
  KnowledgeDoc,
  MaintenanceOrder,
  PendingAction,
  Purchase,
  PurchaseCategory,
  PurchaseItem,
  Rental,
  Staff,
  TableName,
  Tables,
  WaMessage,
} from "@/lib/types";
import { composeInspectionItems, deriveFocusItems, inspectionResult, scoreInspection } from "@/lib/domain/checklists";
import { addDays, dayKey, startOfDay, zonedDate, zonedParts } from "@/lib/time";
import { MULTI_PHOTO, TEMPLATE_DEFS } from "./templates";
import { KNOWLEDGE } from "./knowledge";

export type SeedData = { [K in TableName]: Tables[K][] };

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Datos de demostración realistas, siempre relativos a "hoy" para que el
 * tablero luzca vivo. También se usa para poblar Supabase (scripts/seed.ts).
 */
export function buildSeed(now: Date): SeedData {
  const rnd = mulberry32(7);
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const hex = () => Array.from({ length: 16 }, () => Math.floor(rnd() * 16).toString(16)).join("");
  const uid = () => crypto.randomUUID();

  const today = startOfDay(now);
  const tp = zonedParts(today);
  /** Instante relativo a hoy (días, hora local). */
  const at = (d: number, h = 8, m = 0) => zonedDate(tp.year, tp.month, tp.day + d, h, m).toISOString();
  const day = (d: number) => dayKey(addDays(today, d));
  const created = at(-400);

  // ------------------------------------------------------------------ personal
  const person = (p: Partial<Staff> & Pick<Staff, "full_name" | "role">): Staff => ({
    id: uid(),
    auth_user_id: null,
    phone: null,
    email: null,
    license_number: null,
    license_type: null,
    license_expires_on: null,
    receives_alerts: false,
    alert_topics: [],
    can_authorize: false,
    active: true,
    created_at: created,
    ...p,
  });

  const director = person({
    full_name: "Andrés Villalobos",
    role: "direccion",
    phone: "5215511110001",
    email: "direccion@gruasrhino.mx",
    receives_alerts: true,
    alert_topics: ["documentos", "inventario", "agenda", "gastos", "checklists", "resumen", "flota"],
    can_authorize: true,
  });
  const admin = person({
    full_name: "Mariana Quiroz",
    role: "administracion",
    phone: "5215511110002",
    email: "admin@gruasrhino.mx",
    receives_alerts: true,
    alert_topics: ["documentos", "gastos", "inventario", "resumen"],
    can_authorize: true,
  });
  const ventas = person({
    full_name: "Sofía Herrera",
    role: "ventas",
    phone: "5215511110003",
    receives_alerts: true,
    alert_topics: ["agenda"],
  });
  const op = (full_name: string, phone: string, licDays: number) =>
    person({
      full_name,
      role: "operador",
      phone,
      license_number: `LF-${Math.floor(between(100000, 999999))}`,
      license_type: "Federal tipo E",
      license_expires_on: day(licDays),
    });
  const jorge = op("Jorge Ramírez", "5215511110010", 120);
  const luis = op("Luis Alberto Mendoza", "5215511110011", 12);
  const ramon = op("Ramón Ortega", "5215511110012", 300);
  const daniel = op("Daniel Fuentes", "5215511110013", 200);
  const hector = op("Héctor Salas", "5215511110014", -5);
  const oscar = op("Óscar Treviño", "5215511110015", 410);
  const mecanico = person({
    full_name: "Miguel Ángel Cruz",
    role: "mecanico",
    phone: "5215511110020",
    receives_alerts: true,
    alert_topics: ["checklists", "flota"],
  });
  const mecanico2 = person({ full_name: "Esteban Juárez", role: "mecanico", phone: "5215511110021" });
  const almacen = person({
    full_name: "Patricia León",
    role: "almacen",
    phone: "5215511110030",
    receives_alerts: true,
    alert_topics: ["inventario"],
  });
  const staff = [director, admin, ventas, jorge, luis, ramon, daniel, hector, oscar, mecanico, mecanico2, almacen];

  // ------------------------------------------------------------------ grúas
  const crane = (p: Partial<Crane> & Pick<Crane, "code" | "name" | "type" | "brand" | "model" | "capacity_tons">): Crane => ({
    id: uid(),
    year: 2018,
    serial_number: null,
    vin: null,
    plates: null,
    boom_length_m: null,
    hour_meter: 0,
    odometer_km: null,
    service_interval_hours: 250,
    last_service_hours: 0,
    base_location: "Patio Querétaro",
    daily_rate: null,
    notes: null,
    acquired_on: null,
    active: true,
    created_at: created,
    ...p,
  });

  const rh01 = crane({ code: "RH-01", name: "Titán 18", type: "camion_grua", brand: "Hiab", model: "X-HiPro 422 / International 7400", year: 2019, capacity_tons: 18, boom_length_m: 19.6, plates: "QR-41-875", vin: "1HTWGAZT9KJ104512", serial_number: "HB422-19-0331", hour_meter: 6120, odometer_km: 187400, last_service_hours: 5980, daily_rate: 14500, acquired_on: "2019-04-11" });
  const rh02 = crane({ code: "RH-02", name: "Titán 35", type: "camion_grua", brand: "Fassi", model: "F1150RA / Kenworth T370", year: 2021, capacity_tons: 35, boom_length_m: 26.4, plates: "QR-52-114", vin: "2NKHHM6X9MM456120", serial_number: "F1150-21-0088", hour_meter: 4310, odometer_km: 98200, last_service_hours: 4140, daily_rate: 22000, acquired_on: "2021-08-02", notes: "Unidad insignia. Operar sólo con radio control." });
  const rh03 = crane({ code: "RH-03", name: "Titán 20", type: "camion_grua", brand: "Palfinger", model: "PK 65002 / Freightliner M2", year: 2017, capacity_tons: 20, boom_length_m: 21, plates: "QR-38-902", vin: "1FVACXDT7HHJ88231", serial_number: "PK65-17-1204", hour_meter: 8850, odometer_km: 241300, last_service_hours: 8600, daily_rate: 15500, acquired_on: "2017-11-20" });
  const rh04 = crane({ code: "RH-04", name: "Grove RT540E", type: "grua_movil", brand: "Grove", model: "RT540E", year: 2016, capacity_tons: 36, boom_length_m: 31, plates: "MAQ-0458", serial_number: "225314", hour_meter: 9420, last_service_hours: 9250, daily_rate: 19000, acquired_on: "2018-02-14", notes: "Cilindro telescópico reparado el mes pasado." });
  const rh05 = crane({ code: "RH-05", name: "Liebherr LTM 1060", type: "grua_movil", brand: "Liebherr", model: "LTM 1060-3.1", year: 2020, capacity_tons: 60, boom_length_m: 48, plates: "MAQ-0611", vin: "WLA1060318L045233", serial_number: "045233", hour_meter: 3890, odometer_km: 41200, last_service_hours: 3650, daily_rate: 32000, acquired_on: "2020-06-30" });
  const rh06 = crane({ code: "RH-06", name: "Tadano GR-550XL", type: "grua_movil", brand: "Tadano", model: "GR-550XL-2", year: 2018, capacity_tons: 50, boom_length_m: 43, plates: "MAQ-0532", serial_number: "FC5523", hour_meter: 7210, last_service_hours: 7010, daily_rate: 27500, acquired_on: "2018-09-05" });
  const rh07 = crane({ code: "RH-07", name: "Terex RT 780", type: "grua_movil", brand: "Terex", model: "RT 780", year: 2015, capacity_tons: 72, boom_length_m: 39, plates: "MAQ-0391", serial_number: "RT780-1544", hour_meter: 11240, last_service_hours: 11050, daily_rate: 34000, acquired_on: "2016-01-18" });
  const rh08 = crane({ code: "RH-08", name: "Potain MDT 219", type: "grua_armable", brand: "Potain", model: "MDT 219 J10", year: 2019, capacity_tons: 10, boom_length_m: 65, serial_number: "MDT219-0912", hour_meter: 5520, last_service_hours: 5400, service_interval_hours: 500, daily_rate: 9500, base_location: "Obra Torre Azul, Querétaro", acquired_on: "2019-03-01", notes: "Grúa torre. Altura bajo gancho actual 42 m." });
  const rh09 = crane({ code: "RH-09", name: "Liebherr 110 EC-B", type: "grua_armable", brand: "Liebherr", model: "110 EC-B 6 FR.tronic", year: 2017, capacity_tons: 6, boom_length_m: 55, serial_number: "110ECB-7731", hour_meter: 7100, last_service_hours: 6900, service_interval_hours: 500, daily_rate: 8200, acquired_on: "2017-07-12" });
  const rh10 = crane({ code: "RH-10", name: "Manitowoc 2250", type: "grua_armable", brand: "Manitowoc", model: "2250 (oruga de celosía)", year: 2014, capacity_tons: 272, boom_length_m: 91, serial_number: "2251102", hour_meter: 12880, last_service_hours: 12700, service_interval_hours: 300, daily_rate: 68000, acquired_on: "2019-10-01", notes: "Requiere 6 tractocamiones para traslado y 2 días de armado." });
  const cranes = [rh01, rh02, rh03, rh04, rh05, rh06, rh07, rh08, rh09, rh10];

  // ------------------------------------------------------------------ documentos
  const docs: CraneDocument[] = [];
  const doc = (c: Crane, doc_type: DocType, title: string, expiresIn: number | null, extra: Partial<CraneDocument> = {}) =>
    docs.push({
      id: uid(),
      crane_id: c.id,
      doc_type,
      title,
      number: null,
      issuer: null,
      issued_on: expiresIn != null ? day(expiresIn - 365) : day(-700),
      expires_on: expiresIn != null ? day(expiresIn) : null,
      coverage: null,
      amount: null,
      file_path: null,
      notes: null,
      created_at: created,
      ...extra,
    });

  const insExp: Record<string, number> = { "RH-01": 140, "RH-02": 210, "RH-03": 9, "RH-04": 95, "RH-05": 260, "RH-06": 180, "RH-07": 44, "RH-08": 300, "RH-09": 120, "RH-10": 75 };
  const certExp: Record<string, number> = { "RH-01": 160, "RH-02": 230, "RH-03": 90, "RH-04": 200, "RH-05": 310, "RH-06": 150, "RH-07": -3, "RH-08": 190, "RH-09": 25, "RH-10": 240 };
  for (const c of cranes) {
    doc(c, "seguro", "Póliza de responsabilidad civil y daños", insExp[c.code], {
      number: `PL-${Math.floor(between(1e6, 9e6))}`,
      issuer: c.capacity_tons > 50 ? "Seguros Atlas" : "GNP Seguros",
      coverage: `RC $${c.capacity_tons > 50 ? "10" : "5"} MDP · daños materiales · robo total`,
      amount: Math.round(between(48000, 120000)),
    });
    doc(c, "certificacion_carga", "Certificación anual de grúa", certExp[c.code], {
      number: `CERT-${Math.floor(between(1000, 9999))}`,
      issuer: "Inspecciones Técnicas del Centro (UV acreditada)",
    });
    doc(c, "factura", "Factura de adquisición", null, { number: `A-${Math.floor(between(1000, 9999))}`, issuer: c.brand });
    doc(c, "manual", "Manual del operador y tabla de cargas", null, { issuer: c.brand });
    if (c.type !== "grua_armable") {
      doc(c, "tarjeta_circulacion", "Tarjeta de circulación", c.code === "RH-05" ? 18 : Math.round(between(200, 700)), {
        number: `TC-${c.plates}`,
        issuer: c.type === "camion_grua" ? "SICT · Autotransporte federal" : "Gobierno de Querétaro",
      });
    }
    if (c.type === "camion_grua") {
      doc(c, "verificacion", "Verificación físico-mecánica y de emisiones", c.code === "RH-01" ? 20 : Math.round(between(60, 170)), { issuer: "Centro de verificación autorizado" });
      doc(c, "permiso_sct", "Permiso de carga especializada", Math.round(between(90, 330)), { number: `SCT-${Math.floor(between(10000, 99999))}`, issuer: "SICT" });
    }
  }

  // ------------------------------------------------------------------ operadores aprobados
  const approvals: CraneOperator[] = [];
  const approve = (c: Crane, s: Staff, validDays: number | null = 365) =>
    approvals.push({ id: uid(), crane_id: c.id, staff_id: s.id, approved_on: day(-300), approved_by: director.id, valid_until: validDays == null ? null : day(validDays), notes: null, created_at: created });
  approve(rh01, jorge); approve(rh01, luis); approve(rh01, daniel);
  approve(rh02, jorge); approve(rh02, daniel);
  approve(rh03, luis); approve(rh03, daniel, 40);
  approve(rh04, ramon); approve(rh04, hector); approve(rh04, jorge);
  approve(rh05, oscar); approve(rh05, ramon);
  approve(rh06, hector); approve(rh06, oscar);
  approve(rh07, ramon); approve(rh07, oscar, 20);
  approve(rh08, daniel); approve(rh08, luis);
  approve(rh09, luis); approve(rh09, daniel);
  approve(rh10, oscar); approve(rh10, ramon);

  // ------------------------------------------------------------------ clientes
  const client = (name: string, contact_name: string, rfc: string, address: string): Client => ({
    id: uid(), name, contact_name, phone: null, email: null, rfc, address, notes: null, created_at: created,
  });
  const altavista = client("Constructora Altavista", "Ing. Paola Ríos", "CAL150312AB1", "Blvd. Bernardo Quintana 4100, Querétaro");
  const cumbre = client("Desarrollos Cumbre", "Arq. Tomás Nieto", "DCU180820KJ2", "Av. Constituyentes 220, Querétaro");
  const naves = client("Naves Industriales del Norte", "Ing. Ernesto Garza", "NIN120101PL3", "Parque Industrial El Marqués, Qro.");
  const torreAzul = client("Edificaciones Torre Azul", "Ing. Lucía Campos", "ETA190505QW4", "Av. Universidad 1200, Querétaro");
  const sierra = client("Montajes Sierra Madre", "Ing. Raúl Treviño", "MSM100909ZX5", "Carretera 57 km 12, San Luis Potosí");
  const bajio = client("Energía Eólica del Bajío", "Ing. Carla Mena", "EEB210707RT6", "Parque eólico, Dolores Hidalgo, Gto.");
  const clients = [altavista, cumbre, naves, torreAzul, sierra, bajio];

  // ------------------------------------------------------------------ rentas
  const rentals: Rental[] = [];
  const rent = (c: Crane, cl: Client, opr: Staff | null, s: string, e: string, status: Rental["status"], extra: Partial<Rental> = {}) => {
    const r: Rental = {
      id: uid(), crane_id: c.id, client_id: cl.id, operator_id: opr?.id ?? null, start_at: s, end_at: e,
      site_address: cl.address, site_notes: null, rate: c.daily_rate, rate_unit: "dia", status,
      created_by: "web", notes: null, created_at: at(-30), ...extra,
    };
    rentals.push(r);
    return r;
  };
  // historial
  rent(rh01, naves, jorge, at(-24, 7), at(-21, 18), "finalizada");
  rent(rh02, sierra, daniel, at(-19, 7), at(-12, 18), "finalizada");
  rent(rh04, altavista, ramon, at(-16, 7), at(-13, 18), "finalizada");
  rent(rh05, bajio, oscar, at(-22, 7), at(-15, 18), "finalizada");
  rent(rh07, sierra, ramon, at(-11, 7), at(-6, 18), "finalizada");
  rent(rh06, cumbre, hector, at(-10, 7), at(-7, 18), "finalizada");
  rent(rh09, torreAzul, luis, at(-60, 7), at(-9, 18), "finalizada");
  rent(rh10, bajio, oscar, at(-34, 7), at(-20, 18), "finalizada", { rate: 68000 });
  // semana actual y próximas
  rent(rh01, altavista, jorge, at(-4, 7), at(-2, 18), "finalizada");
  const r01 = rent(rh01, cumbre, luis, at(0, 7), at(1, 18), "en_curso", { site_notes: "Izaje de equipos de aire acondicionado a azotea, 4 niveles." });
  rent(rh02, naves, jorge, at(-3, 7), at(7, 18), "en_curso", { site_notes: "Montaje de estructura metálica, piezas de hasta 12 t." });
  const r04 = rent(rh04, cumbre, ramon, at(1, 7), at(4, 18), "confirmada", { site_notes: "Terreno de terracería compactada; colocar placas bajo estabilizadores.", created_by: "agente" });
  const r05prev = rent(rh05, altavista, oscar, at(-4, 7), at(-1, 18), "finalizada");
  const r05 = rent(rh05, bajio, oscar, at(3, 7), at(6, 18), "confirmada", { site_notes: "Cambio de góndola en aerogenerador, viento máximo permitido 30 km/h." });
  const r07 = rent(rh07, sierra, ramon, at(-2, 7), at(2, 18), "en_curso");
  rent(rh08, torreAzul, daniel, at(-45, 7), at(60, 18), "en_curso", { rate: 9500, notes: "Renta mensual de obra; incluye operador." });
  const r10 = rent(rh10, naves, oscar, at(4, 7), at(10, 18), "confirmada", { site_notes: "Montaje de puente grúa de 80 t. Armado en sitio 2 días previos.", rate: 68000 });
  rent(rh01, torreAzul, jorge, at(5, 7), at(6, 18), "confirmada");
  rent(rh09, cumbre, luis, at(9, 7), at(30, 18), "cotizada");

  // ------------------------------------------------------------------ mantenimiento y detenciones
  const maint: MaintenanceOrder[] = [];
  const mo = (c: Crane, kind: MaintenanceOrder["kind"], title: string, s: string, e: string, status: MaintenanceOrder["status"], cost: number, extra: Partial<MaintenanceOrder> = {}) => {
    const m: MaintenanceOrder = {
      id: uid(), crane_id: c.id, kind, title, description: null, scheduled_start: s, scheduled_end: e, status,
      mechanic_id: mecanico.id, cost, hour_meter_at: c.hour_meter - (status === "completado" ? 120 : 0), created_by: "web",
      completed_at: status === "completado" ? e : null, created_at: at(-60), ...extra,
    };
    maint.push(m);
    return m;
  };
  mo(rh04, "correctivo", "Reparación de sello del cilindro telescópico", at(-33, 8), at(-29, 18), "completado", 23800, { description: "Fuga en sello principal del telescópico; cambio de kit de sellos y prueba de presión." });
  mo(rh02, "preventivo", "Servicio 250 h grúa y camión", at(-26, 8), at(-25, 16), "completado", 9800);
  mo(rh07, "preventivo", "Servicio 250 h", at(-40, 8), at(-39, 17), "completado", 12400);
  mo(rh05, "preventivo", "Servicio 500 h Liebherr", at(-70, 8), at(-68, 17), "completado", 31500);
  mo(rh10, "preventivo", "Revisión de orugas y rodillos", at(-18, 8), at(-16, 17), "completado", 41200);
  const mo03 = mo(rh03, "preventivo", "Servicio 250 h + cambio de balatas", at(-1, 8), at(1, 18), "en_proceso", 0, { description: "Cambio de aceite de motor e hidráulico, filtros y balatas traseras." });
  mo(rh06, "correctivo", "Reparación bomba hidráulica principal", at(3, 8), at(5, 18), "programado", 0, { description: "Cambio de kit de sellos de bomba; refacción ya en almacén.", created_by: "agente" });
  mo(rh09, "preventivo", "Servicio 500 h torre", at(8, 8), at(8, 17), "programado", 0, { created_by: "agente" });

  const downtimes: Downtime[] = [];
  downtimes.push({ id: uid(), crane_id: rh04.id, category: "falla_mecanica", reason: "Fuga en sello del cilindro telescópico", started_at: at(-34, 10), ended_at: at(-29, 18), reported_by: ramon.id, inspection_id: null, notes: null, created_at: at(-34, 10) });

  // ------------------------------------------------------------------ plantillas de checklist
  const templates: ChecklistTemplate[] = [];
  const templateItems: ChecklistTemplateItem[] = [];
  const tplByKey: Record<string, ChecklistTemplate> = {};
  for (const def of TEMPLATE_DEFS) {
    const t: ChecklistTemplate = { id: uid(), name: def.name, kind: def.kind, crane_types: def.crane_types, description: def.description, active: true, created_at: created };
    templates.push(t);
    tplByKey[def.key] = t;
    def.items.forEach(([section, title, instructions, photo_hint, critical, response_type, unit, min, max], i) =>
      templateItems.push({
        id: uid(), template_id: t.id, position: i, section, title, instructions, response_type: response_type ?? "ok_falla",
        unit: unit ?? null, min_value: min ?? null, max_value: max ?? null, requires_photo: true, min_photos: MULTI_PHOTO[title] ?? 1, photo_hint, critical, created_at: created,
      }),
    );
  }
  const totalTemplateFor = (type: CraneType) => templates.find((t) => t.kind === "revision_total" && t.crane_types.includes(type))!;
  const itemsOf = (t: ChecklistTemplate) => templateItems.filter((i) => i.template_id === t.id);

  const craneItems: CraneChecklistItem[] = [];
  const ci = (c: Crane, section: string, title: string, instructions: string, reason: string, critical = false, extra: Partial<CraneChecklistItem> = {}) =>
    craneItems.push({ id: uid(), crane_id: c.id, section, title, instructions, response_type: "ok_falla", unit: null, requires_photo: true, min_photos: 1, photo_hint: null, critical, reason, active: true, created_at: created, ...extra });
  ci(rh04, "Sistema hidráulico", "Sello del cilindro telescópico", "Extiende el telescópico al 100% y espera 5 minutos. No debe haber escurrimiento ni descenso.", "Reparado hace un mes", true, { photo_hint: "Foto del vástago extendido" });
  ci(rh02, "Cables y gancho", "Diámetro del cable principal", "Mide con vernier a 1 m del gancho. Mínimo permitido 15.2 mm.", "Cable al 70% de vida útil", true, { response_type: "numero", unit: "mm", photo_hint: "Foto del vernier sobre el cable" });
  ci(rh06, "Sistema hidráulico", "Bomba hidráulica principal", "Revisa escurrimientos en la base de la bomba con el motor encendido.", "Historial de fuga en bomba", true, { photo_hint: "Foto de la base de la bomba" });
  ci(rh08, "Seguridad", "Sistema anticolisión con grúa vecina", "Prueba la zona restringida configurada contra la grúa de la obra colindante.", "Obra con dos grúas torre", true, { photo_hint: "Foto de la pantalla del anticolisión" });
  ci(rh10, "Orugas", "Zapatas y rodillos de oruga", "Revisa zapatas fracturadas y rodillos sin giro. Cuenta pernos de zapata.", "Rodillos cambiados hace 3 semanas", false, { photo_hint: "Una foto de cada oruga", min_photos: 2 });
  ci(rh07, "Estructura y pluma", "Soldadura en base de la pluma", "Revisa la soldadura reforzada en la base de la pluma: sin fisuras.", "Refuerzo estructural en 2023", true, { photo_hint: "Foto de la soldadura" });

  // ------------------------------------------------------------------ inspecciones
  const inspections: Inspection[] = [];
  const inspItems: InspectionItem[] = [];
  const inspect = (opts: {
    c: Crane; kind: Inspection["kind"]; template: ChecklistTemplate; scheduled: string; due: string; who: Staff;
    rental?: Rental | null; status: Inspection["status"]; createdBy?: "agente" | "web";
    answer?: { startedAt: string; fast?: boolean; failTitles?: Record<string, string>; dupPhotos?: boolean };
  }) => {
    const insp: Inspection = {
      id: uid(), crane_id: opts.c.id, rental_id: opts.rental?.id ?? null, template_id: opts.template.id, kind: opts.kind,
      title: `${opts.template.name} · ${opts.c.code}`, scheduled_for: opts.scheduled, due_by: opts.due, assigned_to: opts.who.id,
      status: opts.status, access_token: hex() + hex(), started_at: null, completed_at: null, result: null, quality_score: null,
      quality_flags: [], hour_meter_reading: null, start_lat: null, start_lng: null, signature_name: null, ai_summary: null,
      created_by: opts.createdBy ?? "agente", created_at: at(-5),
    };
    const own = craneItems.filter((x) => x.crane_id === opts.c.id);
    // Las revisiones pendientes llevan los puntos que Rhino deriva del historial
    const since = Date.parse(at(-45));
    const focus =
      opts.status === "programada" && opts.kind !== "post_renta"
        ? deriveFocusItems({
            crane: opts.c,
            now,
            rental: opts.rental ?? null,
            documents: docs.filter((x) => x.crane_id === opts.c.id),
            lastFailedItems: [],
            recentMaintenance: maint.filter((m) => m.crane_id === opts.c.id && Date.parse(m.scheduled_start) >= since),
            recentDowntimes: downtimes.filter((d) => d.crane_id === opts.c.id && d.ended_at && Date.parse(d.started_at) >= since),
          })
        : [];
    const drafts = composeInspectionItems(itemsOf(opts.template), opts.kind === "post_renta" ? [] : own, focus);
    const rows: InspectionItem[] = drafts.map((d) => ({ ...d, id: uid(), inspection_id: insp.id, created_at: insp.created_at }));
    if (opts.answer) {
      let t = Date.parse(opts.answer.startedAt);
      const dupHash = hex();
      rows.forEach((it, i) => {
        const secs = opts.answer!.fast && i % 3 !== 0 ? Math.round(between(2, 4)) : Math.round(between(25, 110));
        it.shown_at = new Date(t).toISOString();
        t += secs * 1000;
        it.answered_at = new Date(t).toISOString();
        it.seconds_spent = secs;
        const n = Math.max(1, it.min_photos);
        it.photo_paths = Array.from({ length: n }, (_, k) => `demo/${insp.id}/${i}-${k}.jpg`);
        it.photo_hashes = Array.from({ length: n }, (_, k) => (k === 0 && opts.answer!.dupPhotos && (i === 4 || i === 6) ? dupHash : hex()));
        it.photo_taken_at = it.answered_at;
        const fail = opts.answer!.failTitles?.[it.title];
        if (it.response_type === "numero") {
          it.value_number = it.unit === "%" ? 62 : it.unit === "mm" ? 15.6 : opts.c.hour_meter - 6;
          it.passed = true;
        } else if (it.response_type === "texto") {
          it.value_text = "Revisado, configuración correcta.";
          it.passed = true;
        } else {
          it.passed = !fail;
          it.notes = fail ?? null;
        }
        if (secs < 5) it.flags.push("respuesta_rapida");
        if (opts.answer!.dupPhotos && i === 6) it.flags.push("foto_duplicada");
      });
      const { score, flags } = scoreInspection(rows);
      insp.started_at = opts.answer.startedAt;
      insp.completed_at = new Date(t).toISOString();
      insp.status = "completada";
      insp.result = inspectionResult(rows);
      insp.quality_score = score;
      insp.quality_flags = flags;
      insp.hour_meter_reading = opts.c.hour_meter - 6;
      insp.signature_name = opts.who.full_name;
    }
    inspections.push(insp);
    inspItems.push(...rows);
    return insp;
  };

  const tm = totalTemplateFor("grua_movil");
  const tt = totalTemplateFor("camion_grua");
  const ta = totalTemplateFor("grua_armable");
  const post = tplByKey["post_renta"];

  inspect({ c: rh01, kind: "revision_total", template: tt, scheduled: at(-1, 15), due: at(0, 7), who: luis, rental: r01, status: "completada", answer: { startedAt: at(-1, 15, 10) } });
  const i06 = inspect({ c: rh06, kind: "revision_total", template: tm, scheduled: at(-3, 9), due: at(-3, 18), who: hector, status: "completada", createdBy: "web", answer: { startedAt: at(-3, 9, 5), failTitles: { "Mangueras y conexiones sin fugas": "Fuga activa en la base de la bomba hidráulica principal, escurre aceite al piso.", "Bomba hidráulica principal": "Escurrimiento constante con motor encendido." } } });
  inspect({ c: rh07, kind: "revision_total", template: tm, scheduled: at(-3, 8), due: at(-2, 7), who: ramon, rental: r07, status: "completada", answer: { startedAt: at(-3, 8, 12), fast: true, dupPhotos: true, failTitles: { "Extintor vigente y cargado": "Manómetro en zona roja." } } });
  inspect({ c: rh05, kind: "post_renta", template: post, scheduled: at(-1, 19), due: at(0, 12), who: oscar, rental: r05prev, status: "completada", answer: { startedAt: at(-1, 19, 5) } });
  inspect({ c: rh04, kind: "revision_total", template: tm, scheduled: at(0, 9), due: at(1, 7), who: ramon, rental: r04, status: "programada" });
  inspect({ c: rh05, kind: "revision_total", template: tm, scheduled: at(2, 10), due: at(3, 7), who: oscar, rental: r05, status: "programada" });
  inspect({ c: rh10, kind: "revision_total", template: ta, scheduled: at(2, 9), due: at(4, 7), who: oscar, rental: r10, status: "programada" });
  inspect({ c: rh03, kind: "revision_total", template: tt, scheduled: at(-2, 9), due: at(-1, 9), who: luis, status: "vencida", createdBy: "agente" });

  downtimes.push({ id: uid(), crane_id: rh06.id, category: "revision_rechazada", reason: "Fuga en bomba hidráulica principal", started_at: at(-3, 11), ended_at: null, reported_by: hector.id, inspection_id: i06.id, notes: "Etiquetada fuera de servicio (LOTO) en patio.", created_at: at(-3, 11) });

  // ------------------------------------------------------------------ inventario
  type ItemDef = [string, string, InventoryItem["category"], string, "general" | "especifico", number, number, string, number, Crane[], number?, boolean?, boolean?];
  // sku, nombre, categoría, unidad, alcance, mínimo, costo, ubicación, stock objetivo, grúas compatibles, consumo/servicio, cambio contra entrega, serializado
  const engineCranes = [rh01, rh02, rh03, rh04, rh05, rh06, rh07];
  const itemDefs: ItemDef[] = [
    ["ACE-HID-68", "Aceite hidráulico ISO 68", "aceite", "litro", "general", 200, 35, "Almacén A · Rack 1", 520, [rh01, rh02, rh03, rh04, rh05, rh06, rh07], 60],
    ["ACE-MOT-1540", "Aceite de motor SAE 15W-40", "aceite", "litro", "general", 80, 68, "Almacén A · Rack 1", 102, engineCranes, 28],
    ["ACE-ENG-8090", "Aceite de engranes 80W-90", "aceite", "litro", "general", 40, 85, "Almacén A · Rack 1", 60, [rh08, rh09, rh10], 20],
    ["GRA-EP2", "Grasa EP2 multipropósito", "consumible", "kg", "general", 20, 95, "Almacén A · Rack 2", 34, [], undefined],
    ["ANT-5050", "Anticongelante 50/50", "consumible", "litro", "general", 40, 48, "Almacén A · Rack 2", 26, [], undefined],
    ["LIQ-DOT4", "Líquido de frenos DOT 4", "consumible", "litro", "general", 8, 160, "Almacén A · Rack 2", 12, [], undefined],
    ["FIL-HID-RT540", "Filtro hidráulico Grove RT540E", "filtro", "pieza", "especifico", 2, 2850, "Almacén B · Gaveta 4", 1, [rh04], 1, true],
    ["FIL-ACE-ISB", "Filtro de aceite Cummins ISB/QSB", "filtro", "pieza", "especifico", 4, 640, "Almacén B · Gaveta 2", 9, [rh01, rh02, rh04, rh06, rh07], 1],
    ["FIL-AIR-LTM", "Filtro de aire Liebherr LTM 1060", "filtro", "pieza", "especifico", 1, 3900, "Almacén B · Gaveta 5", 2, [rh05], 1, true],
    ["FIL-DSL-SEP", "Filtro de diésel separador de agua", "filtro", "pieza", "general", 6, 520, "Almacén B · Gaveta 1", 14, [], undefined],
    ["LLA-11R225", "Llanta 11R22.5 (Titanes)", "llanta", "pieza", "especifico", 4, 9800, "Patio · Rack llantas", 6, [rh01, rh02, rh03], undefined, true, true],
    ["LLA-385-25", "Llanta 385/95R25 (Grove RT540E)", "llanta", "pieza", "especifico", 2, 29000, "Patio · Rack llantas", 3, [rh04], undefined, true, true],
    ["LLA-445-25", "Llanta 445/95R25 (Tadano / Terex)", "llanta", "pieza", "especifico", 2, 34500, "Patio · Rack llantas", 1, [rh06, rh07], undefined, true, true],
    ["CAB-16-636", "Cable de acero 16 mm 6x36 IWRC", "refaccion", "metro", "especifico", 50, 310, "Almacén C · Carrete 1", 180, [rh04, rh06]],
    ["CAB-19-AG", "Cable antigiro 19 mm (torre)", "refaccion", "metro", "especifico", 60, 520, "Almacén C · Carrete 2", 240, [rh08, rh09]],
    ["SEL-TEL-RT540", "Kit sellos cilindro telescópico RT540E", "refaccion", "juego", "especifico", 1, 11800, "Almacén B · Estante 7", 1, [rh04], 1, true],
    ["SEL-BOM-GR550", "Kit sellos bomba hidráulica Tadano GR-550", "refaccion", "juego", "especifico", 1, 12900, "Almacén B · Estante 7", 1, [rh06], 1, true],
    ["BAT-31-950", "Batería grupo 31 · 950 CCA", "refaccion", "pieza", "general", 2, 3450, "Almacén B · Estante 2", 3, [], undefined, true, true],
    ["BAL-TRA-TIT", "Juego de balatas eje trasero Titán", "refaccion", "juego", "especifico", 2, 4200, "Almacén B · Estante 3", 4, [rh01, rh02, rh03], 1, true],
    ["MAN-HID-12", "Manguera hidráulica 1/2\" alta presión", "refaccion", "metro", "general", 10, 380, "Almacén C · Muro", 22, []],
    ["ROD-ORU-2250", "Rodillo inferior de oruga Manitowoc 2250", "refaccion", "pieza", "especifico", 2, 18500, "Patio · Contenedor 2", 2, [rh10], undefined, true],
    ["ESL-5T-3M", "Eslinga sintética 5 t × 3 m", "herramienta", "pieza", "general", 6, 1150, "Almacén D · Accesorios", 10, []],
    ["GRI-85T", "Grillete 8.5 t", "herramienta", "pieza", "general", 8, 890, "Almacén D · Accesorios", 14, []],
    ["EXT-PQS-9", "Extintor PQS 9 kg", "herramienta", "pieza", "general", 3, 1250, "Almacén D · Seguridad", 2, []],
  ];

  const items: InventoryItem[] = [];
  const compat: InventoryCompat[] = [];
  const bySku: Record<string, InventoryItem> = {};
  const target: Record<string, number> = {};
  for (const [sku, name, category, unit, scope, min, cost, location, stock, cs, perService, requiresReturn, serialized] of itemDefs) {
    const it: InventoryItem = {
      id: uid(), sku, name, category, unit, scope, min_stock: min, unit_cost: cost, location,
      requires_return: Boolean(requiresReturn), serialized: Boolean(serialized), notes: null, active: true, created_at: created,
    };
    items.push(it);
    bySku[sku] = it;
    target[sku] = stock;
    for (const c of cs) compat.push({ id: uid(), item_id: it.id, crane_id: c.id, expected_qty_per_service: perService ?? null, created_at: created });
  }

  const movements: InventoryMovement[] = [];
  const move = (sku: string, kind: InventoryMovement["kind"], qty: number, when: string, extra: Partial<InventoryMovement> = {}) => {
    const it = bySku[sku];
    const m: InventoryMovement = {
      id: uid(), item_id: it.id, kind, qty_delta: kind === "salida" ? -Math.abs(qty) : qty, unit_cost: it.unit_cost,
      crane_id: null, maintenance_order_id: null, inspection_id: null, purchase_id: null, requested_by: mecanico.id,
      authorized_by: almacen.id, reason: null, evidence_paths: [], serial_numbers: [], status: "aplicado", flags: [],
      channel: "web", created_at: when, ...extra,
    };
    movements.push(m);
    return m;
  };

  // Compras (gasto) + entradas al almacén
  const purchases: Purchase[] = [];
  const purchaseItems: PurchaseItem[] = [];
  const buy = (when: number, supplier: string, category: PurchaseCategory, description: string, total: number, c: Crane | null = null, lines: [string, number][] = []) => {
    const p: Purchase = {
      id: uid(), purchased_on: day(when), supplier, category, description, crane_id: c?.id ?? null, total: Math.round(total),
      invoice_number: `F-${Math.floor(between(10000, 99999))}`, payment_method: rnd() > 0.4 ? "Transferencia" : "Tarjeta corporativa",
      registered_by: admin.id, channel: rnd() > 0.6 ? "whatsapp" : "web", created_at: at(when, 13),
    };
    purchases.push(p);
    for (const [sku, qty] of lines) {
      const it = bySku[sku];
      purchaseItems.push({ id: uid(), purchase_id: p.id, item_id: it.id, description: it.name, qty, unit_cost: it.unit_cost, created_at: p.created_at });
      move(sku, "entrada", qty, at(when, 15), { purchase_id: p.id, reason: `Compra ${p.invoice_number}`, requested_by: almacen.id });
    }
    return p;
  };

  // Gasto recurrente de los últimos 6 meses
  for (let w = 26; w >= 1; w--) {
    const d = -w * 7 + 2;
    buy(d, "Gasolinera Corporativa del Centro", "combustible", "Diésel · carga semanal flotilla", between(26000, 41000));
    if (w % 2 === 0) buy(d + 1, ["Refaccionaria Industrial Querétaro", "Hidráulica del Bajío", "Grúas Partes MX"][w % 3], "refacciones", ["Mangueras y conexiones hidráulicas", "Refacciones de frenos", "Pernos, bujes y seguros", "Kit eléctrico de luces"][w % 4], between(4200, 26000), cranes[w % cranes.length]);
    if (w % 4 === 1) buy(d + 2, "Lubricantes del Bajío", "aceites", "Aceites y grasas de reposición", between(7000, 16000));
    if (w % 5 === 0) buy(d + 3, "Taller Hidráulico Ortiz", "taller", "Rectificado de vástago y reparación de cilindro", between(9000, 38000), cranes[(w * 3) % cranes.length]);
    if (w % 6 === 2) buy(d + 1, "Llantera Mexicana", "llantas", "Llantas de reposición", between(19000, 52000), cranes[(w + 2) % 3]);
    if (w % 3 === 0) buy(d + 4, "Ferretería Industrial Celaya", "herramienta", "Herramienta y EPP", between(1800, 7500));
  }
  buy(-128, "Seguros Atlas", "seguros_tramites", "Renovación pólizas RH-05 y RH-10", 168400);
  buy(-75, "SICT", "seguros_tramites", "Permisos de carga especializada Titanes", 21600);
  buy(-30, "Taller Hidráulico Ortiz", "taller", "Reparación sello cilindro telescópico RH-04", 23800, rh04, [["SEL-TEL-RT540", 1]]);
  // Últimas compras (esta semana)
  buy(-4, "Grúas Partes MX", "refacciones", "Kit de sellos bomba hidráulica Tadano GR-550", 12900, rh06, [["SEL-BOM-GR550", 1]]);
  buy(-3, "Llantera Mexicana", "llantas", "2 llantas 385/95R25 para Grove RT540E", 58000, rh04, [["LLA-385-25", 2]]);
  buy(-2, "Gasolinera Corporativa del Centro", "combustible", "Diésel · carga semanal flotilla", 34650);
  buy(-1, "Lubricantes del Bajío", "aceites", "Aceite hidráulico ISO 68 · 2 tambores de 208 L", 14560, null, [["ACE-HID-68", 416]]);
  buy(0, "Refaccionaria Industrial Querétaro", "refacciones", "Filtros de aceite Cummins y filtros de diésel", 6840, null, [["FIL-ACE-ISB", 6], ["FIL-DSL-SEP", 4]]);

  // Salidas normales (con orden de trabajo y evidencia)
  const out = (sku: string, qty: number, c: Crane, when: number, reason: string, extra: Partial<InventoryMovement> = {}) =>
    move(sku, "salida", qty, at(when, 10), { crane_id: c.id, reason, evidence_paths: [`demo/mov/${sku}-${when}.jpg`], ...extra });
  out("ACE-HID-68", 60, rh02, -25, "Servicio 250 h");
  out("ACE-MOT-1540", 28, rh02, -25, "Servicio 250 h");
  out("FIL-ACE-ISB", 1, rh02, -25, "Servicio 250 h");
  out("ACE-HID-68", 180, rh04, -30, "Reparación cilindro telescópico — relleno de sistema");
  out("SEL-TEL-RT540", 1, rh04, -30, "Reparación cilindro telescópico", { evidence_paths: ["demo/mov/sello-usado.jpg"] });
  out("ACE-ENG-8090", 20, rh10, -17, "Revisión de orugas");
  out("ROD-ORU-2250", 2, rh10, -17, "Cambio de rodillos inferiores", { evidence_paths: ["demo/mov/rodillos-usados.jpg"] });
  out("ACE-MOT-1540", 30, rh07, -39, "Servicio 250 h");
  out("FIL-ACE-ISB", 1, rh07, -39, "Servicio 250 h");
  out("ACE-MOT-1540", 26, rh03, -1, "Servicio 250 h en proceso", { maintenance_order_id: mo03.id });
  out("BAL-TRA-TIT", 1, rh03, 0, "Cambio de balatas eje trasero", { maintenance_order_id: mo03.id, evidence_paths: ["demo/mov/balatas-usadas.jpg"] });
  out("ESL-5T-3M", 2, rh02, -3, "Accesorios para montaje de estructura", { requested_by: jorge.id });
  out("GRI-85T", 4, rh02, -3, "Accesorios para montaje de estructura", { requested_by: jorge.id });

  // Movimientos sospechosos que el agente debe reportar
  move("ACE-HID-68", "salida", 40, at(-2, 23, 40), { crane_id: rh03.id, reason: "Relleno de aceite", requested_by: luis.id, authorized_by: null, flags: ["fuera_de_horario", "consumo_atipico", "sin_orden"], channel: "whatsapp" });
  move("FIL-HID-RT540", "salida", 1, at(-1, 12, 15), { crane_id: rh07.id, reason: "Cambio de filtro hidráulico", requested_by: ramon.id, authorized_by: null, status: "pendiente_autorizacion", flags: ["incompatible", "sin_evidencia"] });
  move("LLA-11R225", "salida", 2, at(0, 9, 30), { crane_id: rh01.id, reason: "Cambio de llantas delanteras", requested_by: jorge.id, authorized_by: null, status: "pendiente_autorizacion", flags: ["sobre_umbral"], serial_numbers: ["B2L4471029", "B2L4471033"], channel: "whatsapp" });
  move("BAT-31-950", "salida", 1, at(-6, 17, 50), { crane_id: rh06.id, reason: "Batería descargada", requested_by: hector.id, authorized_by: almacen.id, flags: ["sin_evidencia"] });

  // Saldo inicial para cuadrar con el stock objetivo
  for (const it of items) {
    const applied = movements.filter((m) => m.item_id === it.id && m.status === "aplicado").reduce((s, m) => s + m.qty_delta, 0);
    const initial = target[it.sku] - applied + (it.sku === "ACE-MOT-1540" ? 18 : 0);
    if (initial !== 0) move(it.sku, "ajuste", initial, at(-190, 9), { reason: "Inventario inicial", requested_by: almacen.id });
  }
  // Conteo cíclico con faltante (y su ajuste)
  const counts: InventoryCount[] = [
    { id: uid(), item_id: bySku["ACE-MOT-1540"].id, counted_qty: 102, system_qty: 120, variance: -18, counted_by: almacen.id, notes: "Faltan ~18 L respecto al sistema.", created_at: at(-1, 18) },
    { id: uid(), item_id: bySku["GRI-85T"].id, counted_qty: 14, system_qty: 14, variance: 0, counted_by: almacen.id, notes: null, created_at: at(-1, 18) },
  ];
  move("ACE-MOT-1540", "ajuste", -18, at(-1, 18, 5), { reason: "Ajuste por conteo cíclico (faltante)", requested_by: almacen.id, flags: ["diferencia_conteo"] });

  // ------------------------------------------------------------------ agente: conversación, alertas, auditoría
  const msgs: WaMessage[] = [];
  const msg = (who: Staff, direction: "in" | "out", body: string, when: string, kind: WaMessage["kind"] = "chat") =>
    msgs.push({ id: uid(), phone: who.phone!, staff_id: who.id, direction, body, kind, wa_message_id: null, created_at: when });
  msg(director, "out", "☀️ *Buenos días, Andrés.* Resumen de hoy:\n• 4 grúas rentadas, 1 en mantenimiento (RH-03) y 1 detenida (RH-06).\n• Mañana sale RH-04 con Desarrollos Cumbre; su revisión total está programada hoy a las 9:00 con Ramón.\n• ⚠️ La póliza de RH-03 vence en 9 días.", at(0, 7), "resumen");
  msg(director, "in", "¿Qué grúa de más de 40 toneladas tengo libre el martes?", at(0, 8, 12));
  msg(director, "out", "El martes tienes libre la *RH-07 Terex RT 780 (72 t)*: su renta con Montajes Sierra Madre termina el domingo. La *RH-05 Liebherr 60 t* y la *RH-10 Manitowoc 272 t* están rentadas, y la *RH-06 Tadano 50 t* sigue detenida por la fuga en la bomba.\n\n📌 Por cierto: hay 2 salidas de almacén esperando tu autorización.", at(0, 8, 13));
  msg(almacen, "out", "🔒 *Salida pendiente de autorización*\n2 × Llanta 11R22.5 para RH-01 ($19,600). Solicitó: Jorge Ramírez.", at(0, 9, 31), "alerta");

  const alerts: Alert[] = [];
  const alert = (dedupe_key: string, topic: Alert["topic"], severity: Alert["severity"], title: string, body: string, c: Crane | null, when: string, sent = true) =>
    alerts.push({ id: uid(), dedupe_key, topic, severity, title, body, crane_id: c?.id ?? null, sent_to: sent ? [director.phone!] : [], sent_at: sent ? when : null, acknowledged_at: null, created_at: when });
  alert(`doc:${rh03.code}:seguro:30`, "documentos", "aviso", "Póliza de RH-03 por vencer", "La póliza de seguro de RH-03 Titán 20 vence en 9 días.", rh03, at(-1, 7));
  alert(`checklist:rechazada:${i06.id}`, "checklists", "critica", "RH-06 rechazada en revisión", "Fuga activa en bomba hidráulica principal. Grúa detenida automáticamente.", rh06, at(-3, 10));
  alert(`inv:anomalia:ACE-HID-68:rh03`, "inventario", "critica", "Salida atípica de aceite hidráulico", "40 L de aceite hidráulico a RH-03 a las 23:40, sin orden de trabajo.", rh03, at(-2, 23, 45));

  const runs: AgentRun[] = [
    { id: uid(), trigger: "whatsapp", phone: director.phone, staff_id: director.id, input: "¿Qué grúa de más de 40 toneladas tengo libre el martes?", output: msgs[2].body, model: "gpt-5-mini", tool_calls: [{ name: "buscar_disponibilidad", args: { desde: day(4), hasta: day(4), capacidad_minima: 40 }, result: { disponibles: [] }, ms: 38 }, { name: "consultar_flota", args: {}, result: "…", ms: 22 }], tokens_in: 3820, tokens_out: 160, latency_ms: 4100, error: null, rating: 5, created_at: at(0, 8, 12) },
  ];
  const pending: PendingAction[] = [];

  const knowledge: KnowledgeDoc[] = KNOWLEDGE.map((k) => ({ id: uid(), title: k.title, source: k.source, content: k.content, created_at: created }));

  return {
    staff,
    cranes,
    crane_documents: docs,
    crane_operators: approvals,
    clients,
    rentals,
    maintenance_orders: maint,
    downtimes,
    checklist_templates: templates,
    checklist_template_items: templateItems,
    crane_checklist_items: craneItems,
    inspections,
    inspection_items: inspItems,
    inventory_items: items,
    inventory_compat: compat,
    purchases,
    purchase_items: purchaseItems,
    inventory_movements: movements,
    inventory_counts: counts,
    wa_messages: msgs,
    agent_runs: runs,
    agent_pending_actions: pending,
    alerts,
    knowledge_docs: knowledge,
  };
}

