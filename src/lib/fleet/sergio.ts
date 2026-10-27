import type { Crane, CraneType } from "@/lib/types";
import type { FleetProfile, ReferencePhoto, ResearchSource } from "./types";
import { maintenancePlans, MAINTENANCE_SOURCES, type MaintenanceFamily } from "./maintenance";
import { maintenanceChecklist, CHECKLIST_VERSION } from "./maintenance-checklists";

export const FLEET_RECONCILIATION = [
  "Sergio reportó 3 National de 26 toneladas. Sólo la unidad 10 tiene una correspondencia explícita; faltan por asignar las otras 2.",
  "Confirmar si Peterbilt 2002 (09) e International 2007 son chasis de las National o unidades adicionales. International 2007 y su alcance reportado de 30 m se conservan aquí sin crear otra unidad física.",
  "Los números 03, 09 y 10 se repiten entre grúas y vehículos. GR y AP distinguen ambos grupos; PEND identifica códigos internos provisionales.",
];

const source = (id: string, title: string, url: string, scope: ResearchSource["scope"] = "model"): ResearchSource => ({ id, title, url, scope });
const OEM = {
  gmk5120: source("gmk5120", "Grove GMK5120B · ficha del fabricante", "https://www.manitowoc.com/grove/all-terrain-cranes/gmk5120b"),
  gmk5275: source("gmk5275", "Grove GMK5275 · guía del fabricante", "https://www.manitowoc.com/sites/default/files/media/divers/file/2020-01/GMK5275-Product-Guide-Imperial.pdf"),
  gmk6350: source("gmk6350", "Grove GMK6350 · guía del fabricante", "https://www.manitowoc.com/sites/default/files/media/divers/file/2020-01/GMK6350-Product-Guide-Imperial.pdf"),
  national: source("national900a", "National 900A · comparación para identificar, modelo NO confirmado", "https://www.manitowoc.com/national-crane/stand-boom-trucks/900a", "identification"),
  simon: source("simon-ro", "Terex · historia y familia RO Stinger", "https://www.terex.com/rough-terrain-cranes/en/about/legacy-brands/ro-stinger", "family"),
  freightliner: source("freightliner", "Freightliner · manuales por modelo", "https://www.freightliner.com/parts/driver-maintenance-manuals/", "identification"),
  peterbilt: source("peterbilt", "Peterbilt · mantenimiento convencional (edición de referencia 2017)", "https://dev.peterbilt.com/static-assets/documents/resources/conventional_model_maintenance_manual.pdf", "family"),
  terex: source("terex70100", "Terex BT70100 · comparación para identificar, modelo NO confirmado", "https://www.terex.com/rough-terrain-cranes/de/product/legacy-boom-trucks/bt-70100", "identification"),
  manitex: source("manitex35100", "Manitex 35100C · comparación para identificar, modelo NO confirmado", "https://www.tadano.com/uscan/en/lifting-equipment/cm-boom-trucks/35100c/", "identification"),
  matiz: source("matiz2011", "Chevrolet Matiz 2011 · manual de referencia; año de la unidad pendiente", "https://my.gm.com.mx/content/dam/gmownercenter/gmna/gmmx/dynamic/manuals/2011/chevrolet/matiz/es/om_ng-chevrolet_matiz_my11-es_MX.pdf", "family"),
  figo: source("figo2016", "Ford Figo 2016 · manual de referencia; año de la unidad pendiente", "https://www.fordservicecontent.com/Ford_Content/Catalog/owner_information/2016-OM-FIGO-2016_10_2015_version2.pdf", "family"),
};

const PHOTOS: Record<string, ReferencePhoto> = {
  matiz: { src: "/fleet/matiz.jpg", alt: "Chevrolet Matiz M150 de referencia; generación de Rhino pendiente", source_url: "https://commons.wikimedia.org/wiki/File:Chevrolet_Matiz_M150.jpg", author: "Corvettec6r", license: "Dominio público", license_url: "https://commons.wikimedia.org/wiki/File:Chevrolet_Matiz_M150.jpg#Licensing", match: "family" },
  figo: { src: "/fleet/figo.jpg", alt: "Ford Figo 2016 de referencia; año de Rhino pendiente", source_url: "https://commons.wikimedia.org/wiki/File:%2716_Ford_Figo_Hatchback.jpg", author: "Bull-Doser", license: "Dominio público", license_url: "https://commons.wikimedia.org/wiki/File:%2716_Ford_Figo_Hatchback.jpg#Licensing", match: "family" },
  cat: { src: "/fleet/cat-telehandler.jpg", alt: "CAT TH460B de referencia; modelo de Rhino pendiente", source_url: "https://commons.wikimedia.org/wiki/File:Caterpillar_TH460B_Telehandler.jpg", author: "Headwater.Equipment", license: "CC BY 3.0", license_url: "https://creativecommons.org/licenses/by/3.0/", match: "family" },
};

interface Entry {
  key: string;
  code: string;
  economic?: string;
  name: string;
  type: CraneType;
  brand: string;
  model?: string;
  year?: number;
  capacity?: string;
  reach?: string;
  families: MaintenanceFamily[];
  characteristics: string[];
  pending?: string[];
  sources?: ResearchSource[];
  photo?: ReferencePhoto;
  modelReported?: boolean;
}

export const SERGIO_ENTRIES: Entry[] = [
  { key: "hiab", code: "PEND-HIAB", name: "HIAB 4.5 · modelo pendiente", type: "camion_grua", brand: "HIAB", year: 2009, capacity: "4.5 toneladas; unidad por confirmar", families: ["hiab"], characteristics: ["Grúa hidráulica articulada reportada por Sergio. El alcance y la capacidad por radio dependen de la versión."], pending: ["Modelo, serie, tabla de cargas y chasis portador.", "Número económico y fotografía de la unidad."] },
  { key: "gr-03", code: "GR-03", economic: "03", name: "Freightliner · Simon-Ro", type: "camion_grua", brand: "Freightliner / Simon-Ro", year: 2004, capacity: "15 toneladas; unidad por confirmar", reach: "20 m de alcance reportado; configuración por confirmar", families: ["boom_truck", "truck"], characteristics: ["Familia Simon-Ro / RO Stinger: grúa telescópica sobre camión; no se asume articulada.", "Chasis y grúa requieren identificación y mantenimiento separados."], pending: ["Modelo y serie de ambos equipos; confirmar a cuál corresponde el año 2004."], sources: [OEM.simon, OEM.freightliner] },
  { key: "gr-09", code: "GR-09", economic: "09", name: "Peterbilt 2002 · grúa por identificar", type: "camion_grua", brand: "Peterbilt", year: 2002, reach: "30 m mencionados junto con International; asignación por confirmar", families: ["truck", "boom_truck"], characteristics: ["Chasis Peterbilt reportado; marca y modelo del equipo de izaje pendientes."], pending: [FLEET_RECONCILIATION[1], "No atribuirle 26 toneladas ni marca National hasta conciliar la lista."], sources: [OEM.peterbilt] },
  { key: "gr-10", code: "GR-10", economic: "10", name: "National Crane · modelo pendiente", type: "camion_grua", brand: "National Crane", year: 2007, capacity: "26 toneladas; confirmar USt o t métricas", families: ["boom_truck", "truck"], characteristics: ["Grúa telescópica sobre camión. La National 900A de catálogo se ofrece como 26 USt / 23.6 t, pero no identifica esta unidad."], pending: [FLEET_RECONCILIATION[0], FLEET_RECONCILIATION[1], "Placa, serie, modelo, chasis y fecha de fabricación por separado."], sources: [OEM.national] },
  { key: "gr-13", code: "GR-13", economic: "13", name: "Kenworth T800 · Manitex", type: "camion_grua", brand: "Kenworth / Manitex", model: "T800 / Manitex pendiente", year: 2007, capacity: "35 toneladas; confirmar USt o t métricas", reach: "30 m reportados; tipo de medida por confirmar", families: ["boom_truck", "truck"], characteristics: ["Chasis T800 reportado. La Manitex 35100C actual de 35 USt es sólo referencia de identificación; no se asigna ese modelo."], pending: ["Modelo/serie Manitex, motor del T800 y configuración de pluma."], sources: [OEM.manitex] },
  { key: "gr-16", code: "GR-16", economic: "16", name: "Liebherr LTM 1140", type: "grua_movil", brand: "Liebherr", model: "LTM 1140", year: 1994, capacity: "140 toneladas reportadas; verificar placa y tabla", reach: "68 m de altura reportada; configuración por confirmar", families: ["liebherr"], modelReported: true, characteristics: ["Grúa móvil de familia LTM reportada por Sergio. No se encontró ficha primaria que identifique exactamente la variante de 1994.", "No se sustituyen sus datos por los de la LTM 1140-5.1 moderna."], pending: ["Denominación completa, número de serie, manual correspondiente y equipos instalados."] },
  { key: "gr-17", code: "GR-17", economic: "17", name: "Grove GMK5120B", type: "grua_movil", brand: "Grove", model: "GMK5120B", year: 2000, capacity: "120 toneladas reportadas; OEM publica 120 USt / 100 t", reach: "85 m de altura/alcance reportado; configuración por confirmar", families: ["gmk"], modelReported: true, characteristics: ["Catálogo del modelo: 5 ejes, pluma telescópica de 12.8 a 51 m, cinco secciones y sistema TWIN-LOCK.", "Las 120 USt / 100 t publicadas son clasificaciones de catálogo, no una conversión ni autorización de carga para esta unidad."], pending: ["Confirmar modelo y año con serie; tabla propia, plumín, contrapesos y unidad de capacidad.", "Distinguir altura máxima con extensiones, radio horizontal y longitud de pluma."], sources: [OEM.gmk5120] },
  { key: "gr-18", code: "GR-18", economic: "18", name: "Grove GMK5275", type: "grua_movil", brand: "Grove", model: "GMK5275", year: 2007, capacity: "275 toneladas reportadas; guía OEM: 275 USt / 220 t", reach: "104 m de altura reportada; configuración por confirmar", families: ["gmk"], modelReported: true, characteristics: ["Catálogo del modelo: 5 ejes, pluma de 13.3 a 68 m con siete secciones y suspensión MEGATRAK.", "Extensiones de catálogo según configuración. No se presupone que estén instaladas.", "La página y la guía OEM muestran cifras métricas distintas; prevalece la tabla de cargas de la unidad una vez identificada."], pending: ["Unidad de capacidad, tabla por serie, extensiones y contrapesos instalados."], sources: [OEM.gmk5275] },
  { key: "gr-19", code: "GR-19", economic: "19", name: "CAT · manipulador telescópico", type: "telehandler", brand: "Caterpillar", year: 2013, families: ["telehandler"], characteristics: ["Manipulador telescópico reportado. Capacidad y alcance dependen de modelo, accesorio, posición de pluma y tabla de cargas."], pending: ["Modelo/PIN, motor, capacidad, accesorios, neumáticos y manual por serie.", "La imagen TH460B es de familia y no identifica esta unidad."], photo: PHOTOS.cat },
  { key: "gr-20", code: "GR-20", economic: "20", name: "Grove GMK6350", type: "grua_movil", brand: "Grove", model: "GMK6350", year: 2004, capacity: "350 toneladas reportadas; verificar clasificación USt en tabla propia", reach: "110 m de altura reportada; configuración por confirmar", families: ["gmk"], modelReported: true, characteristics: ["Catálogo del modelo: 6 ejes, pluma de 15.5 a 60 m en cinco secciones, suspensión MEGATRAK y TWIN-LOCK.", "Plumín fijo o abatible disponible según equipamiento; no se confirma instalación ni alcance operativo."], pending: ["Placa, tabla por serie, unidad de capacidad y combinación de pluma/plumín/contrapeso."], sources: [OEM.gmk6350] },
  { key: "gr-21", code: "GR-21", economic: "21", name: "Peterbilt · Terex", type: "camion_grua", brand: "Peterbilt / Terex", year: 2013, capacity: "35 toneladas; confirmar USt o t métricas", reach: "45 m reportados; distinguir altura de radio y pluma", families: ["boom_truck", "truck"], characteristics: ["Grúa telescópica sobre camión. BT70100 es una referencia Terex de 35 USt / 31.8 t, pero no identifica esta unidad."], pending: ["Modelo Peterbilt, motor, modelo/serie Terex y configuración de extensiones."], sources: [OEM.peterbilt, OEM.terex] },
  { key: "gr-22", code: "GR-22", economic: "22", name: "Grove 120 · modelo pendiente", type: "grua_movil", brand: "Grove", year: 2005, capacity: "120 toneladas; unidad por confirmar", families: ["mobile_crane"], characteristics: ["Segunda Grove de 120 reportada, distinta de la unidad 17.", "No se infiere GMK5120B ni se aplican intervalos exclusivos GMK hasta identificar la familia."], pending: ["Modelo, serie, familia (GMK/otra), unidad de capacidad y manual."] },
  { key: "tracto", code: "PEND-TRACTO", name: "Tractocamión", type: "tractocamion", brand: "Por confirmar", families: ["truck"], characteristics: ["Tractocamión reportado. Incluye mantenimiento del chasis y acoplamiento de quinta rueda."], pending: ["Número económico, marca, modelo, año, VIN y motor."] },
  { key: "cama-baja", code: "PEND-CAMA", name: "Cama baja", type: "remolque", brand: "Por confirmar", families: ["trailer"], characteristics: ["Remolque de plataforma baja. Capacidad de carga, ejes, cuello y rampas por identificar."], pending: ["Número económico, fabricante, serie, año, capacidad y sistema de frenos."] },
  { key: "ap-02", code: "AP-02", economic: "02", name: "Ford Ranger · 02", type: "vehiculo_apoyo", brand: "Ford", model: "Ranger", families: ["ford"], modelReported: true, characteristics: ["Pickup de apoyo. Año, generación y motorización pendientes."] },
  { key: "ap-03", code: "AP-03", economic: "03", name: "Estacas · 03", type: "vehiculo_apoyo", brand: "Por confirmar", model: "Carrocería de estacas", families: ["truck"], characteristics: ["Estacas describe la carrocería; no identifica fabricante ni chasis.", "Revisar caja, piso, estacas, seguros y anclajes de carga además del chasis."], pending: ["Marca, modelo, año, VIN, motor y sistema de frenos; plan de camión sujeto a identificación."] },
  { key: "ap-04", code: "AP-04", economic: "04", name: "Ford Ranger · 04", type: "vehiculo_apoyo", brand: "Ford", model: "Ranger", families: ["ford"], modelReported: true, characteristics: ["Segunda pickup Ranger, distinta de la unidad 02. Año y motorización pendientes."] },
  { key: "ap-06", code: "AP-06", economic: "06", name: "Ford F-150 · 06", type: "vehiculo_apoyo", brand: "Ford", model: "F-150", families: ["ford"], modelReported: true, characteristics: ["Sergio reportó «4 cilindros». Se conserva como dato pendiente y no se utiliza para seleccionar refacciones."], pending: ["Confirmar «4 cilindros» con VIN/placa; no interpretar como 4.2 L, 4×4 ni otra variante."] },
  { key: "ap-07", code: "AP-07", economic: "07", name: "Ford F-150 · 07", type: "vehiculo_apoyo", brand: "Ford", model: "F-150", families: ["ford"], modelReported: true, characteristics: ["Motor de 6 cilindros reportado, pendiente verificar variante, cilindrada y año."] },
  { key: "ap-08", code: "AP-08", economic: "08", name: "Chevrolet Silverado", type: "vehiculo_apoyo", brand: "Chevrolet", model: "Silverado", families: ["chevrolet"], modelReported: true, characteristics: ["Pickup de apoyo. No se infiere serie 1500/HD, año ni motorización."] },
  { key: "ap-09", code: "AP-09", economic: "09", name: "Chevrolet Matiz", type: "vehiculo_apoyo", brand: "Chevrolet", model: "Matiz", families: ["matiz"], modelReported: true, characteristics: ["Automóvil de apoyo. Año y motor pendientes; manual Matiz 2011 sólo como referencia de familia."], sources: [OEM.matiz], photo: PHOTOS.matiz },
  { key: "ap-10", code: "AP-10", economic: "10", name: "Nissan Tsuru", type: "vehiculo_apoyo", brand: "Nissan", model: "Tsuru", families: ["nissan"], modelReported: true, characteristics: ["Automóvil de apoyo. No se infiere generación ni motor; distribución sujeta a identificación."] },
  { key: "figo", code: "PEND-FIGO", name: "Ford Figo", type: "vehiculo_apoyo", brand: "Ford", model: "Figo", families: ["ford"], modelReported: true, characteristics: ["Automóvil de apoyo. Año, motor, transmisión y carrocería pendientes."], pending: ["Número económico y fotografía de la unidad."], sources: [OEM.figo], photo: PHOTOS.figo },
];

export const fleetId = (index: number) => `53002700-1027-4000-8000-${String(index + 1).padStart(12, "0")}`;

export function buildSergioFleet(): Crane[] {
  return SERGIO_ENTRIES.map((e, index) => {
    const plans = e.families.flatMap(maintenancePlans).map((plan) => ({ ...plan, checklist_steps: maintenanceChecklist(plan), checklist_version: CHECKLIST_VERSION }));
    const sourceIds = new Set(plans.flatMap((p) => p.source_ids));
    const sources = [...(e.sources ?? []), ...MAINTENANCE_SOURCES.filter((s) => sourceIds.has(s.id))];
    const profile: FleetProfile = {
      import_key: `sergio-2026-10-27:${e.key}`, reported_by: "Sergio", reported_on: "2026-10-27",
      economic_number: e.economic ?? null, provisional_code: !e.economic,
      reported_capacity: e.capacity ?? null, reported_reach: e.reach ?? null,
      identification_status: e.modelReported ? "model_reported" : "model_pending",
      characteristics: e.characteristics,
      pending: [...(e.pending ?? []), "VIN/serie, foto propia y manual aplicable a la unidad.", "Lecturas actuales y fecha/lectura del último servicio para activar vencimientos.", ...(e.type === "vehiculo_apoyo" ? ["Año, motor, combustible y transmisión."] : [])],
      sources: [...new Map(sources.map((s) => [s.id, s])).values()], maintenance_plans: plans, photo: e.photo ?? null,
    };
    return {
      id: fleetId(index), code: e.code, name: e.name, type: e.type, brand: e.brand,
      model: e.model ?? "Por identificar", year: e.year ?? null,
      serial_number: null, vin: null, plates: null, capacity_tons: null, boom_length_m: null,
      hour_meter: null, odometer_km: null, service_interval_hours: null, last_service_hours: null,
      base_location: null, daily_rate: null, notes: "Alta desde el listado de Sergio del 27/10/2026. Datos reportados pendientes de verificación; consultar ficha investigada y planes de mantenimiento.",
      acquired_on: null, active: true, created_at: "2026-10-27T18:00:00.000Z", fleet_profile: profile,
    };
  });
}
