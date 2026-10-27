import type { MaintenancePlan, ResearchSource } from "./types";

export type MaintenanceFamily =
  | "gmk"
  | "mobile_crane"
  | "liebherr"
  | "hiab"
  | "boom_truck"
  | "telehandler"
  | "truck"
  | "trailer"
  | "ford"
  | "chevrolet"
  | "matiz"
  | "nissan";

export const MAINTENANCE_SOURCES: ResearchSource[] = [
  {
    id: "gmk-structural-bulletin",
    title: "Grove GMK · Boletín 3 302 970: inspección adicional de estructuras (2020)",
    url: "https://eu100.manitowoc.com/gmkmaintenance/documents/SB%20D20-003%203_302_970_English%20US.pdf",
    scope: "family",
  },
  {
    id: "manitowoc-serial-manuals",
    title: "Manitowoc · Manuales de referencia y documentación por número de serie",
    url: "https://www.manitowoc.com/manuals",
    scope: "identification",
  },
  {
    id: "national-maintenance-reference",
    title: "National Crane · Manual 600E2 (2019), referencia de familia; no identifica las unidades",
    url: "https://www.manitowoc.com/media/14973/download",
    scope: "family",
  },
  {
    id: "liebherr-service",
    title: "Liebherr · Servicio de grúas móviles y de orugas, repuestos y documentación por serie",
    url: "https://www.liebherr.com/en-us/mobile-and-crawler-cranes/service/customer-service-4407470",
    scope: "family",
  },
  {
    id: "hiab-procare",
    title: "HIAB · Inspecciones y mantenimiento ProCare de grúas cargadoras",
    url: "https://www.hiab.com/en-au/parts--services/services/service-and-maintenance-contracts/procare-hiab",
    scope: "family",
  },
  {
    id: "manitex-inspection",
    title: "Manitex · Inspección de entrega, lubricación y comprobaciones del equipo",
    url: "https://manitex-uptime.com/pdf/Registration_and_PDI_Instructions.pdf",
    scope: "family",
  },
  {
    id: "terex-ro-identification",
    title: "Terex · Identificación y soporte del legado Simon-RO / RO Stinger",
    url: "https://www.terex.com/rough-terrain-cranes/en/about/legacy-brands/ro-stinger",
    scope: "identification",
  },
  {
    id: "cat-telehandler-maintenance",
    title: "Caterpillar · Mantenimiento de manipuladores telescópicos",
    url: "https://www.cat.com/en_IN/support/maintenance/compact-equipment-maintenance/telehandler-maintenance.html",
    scope: "family",
  },
  {
    id: "cat-telehandler-service",
    title: "Caterpillar · Sistemas a revisar y diferencias entre servicio inicial y recurrente",
    url: "https://www.cat.com/en_US/articles/for-owners/telehandlers/telehandler-250-hour-service-interval.html",
    scope: "family",
  },
  {
    id: "freightliner-manuals",
    title: "Freightliner · Manuales de conducción y mantenimiento por modelo",
    url: "https://www.freightliner.com/parts/driver-maintenance-manuals/",
    scope: "identification",
  },
  {
    id: "kenworth-maintenance-reference",
    title: "Kenworth · Manual W900/T660/T800/C500/963 (2017), referencia de familia",
    url: "https://www.kenworth.com/media/2nklfejp/y53-1203-1e1_en.pdf",
    scope: "family",
  },
  {
    id: "peterbilt-maintenance-reference",
    title: "Peterbilt · Mantenimiento de modelos convencionales (2017), referencia de familia",
    url: "https://dev.peterbilt.com/static-assets/documents/resources/conventional_model_maintenance_manual.pdf",
    scope: "family",
  },
  {
    id: "international-manuals",
    title: "International · Consulta de manuales del operador por modelo",
    url: "https://www.internationalusedtrucks.com/customers-general-operation-questions/",
    scope: "identification",
  },
  {
    id: "trailer-maintenance-reference",
    title: "Fontaine Heavy-Haul · Guía de remolques de cama baja; fabricante de la unidad pendiente",
    url: "https://fontaineheavy-haul.com/pdfs/OwnersGuide.pdf",
    scope: "family",
  },
  {
    id: "ford-manuals",
    title: "Ford México · Manuales de Ranger, F-150 y Figo por año y versión",
    url: "https://www.ford.mx/mi-ford/manual-propietario/manual-propietario-sitemap/",
    scope: "identification",
  },
  {
    id: "ford-maintenance-family",
    title: "Ford México · Tipos de servicio y distinción entre uso normal y severo",
    url: "https://www.ford.mx/blog/experto/cuando-realizar-servicio-automotriz-noviembre2022/",
    scope: "family",
  },
  {
    id: "figo-maintenance-reference",
    title: "Ford · Manual Figo/Ka 2016, referencia; año y motor de la unidad pendientes",
    url: "https://www.fordservicecontent.com/Ford_Content/Catalog/owner_information/2016-OM-FIGO-2016_10_2015_version2.pdf",
    scope: "family",
  },
  {
    id: "silverado-maintenance-family",
    title: "Chevrolet · Mantenimiento de Silverado según motor, versión y uso",
    url: "https://es.chevrolet.com/certified-service/maintenance/silverado",
    scope: "family",
  },
  {
    id: "matiz-maintenance-reference",
    title: "Chevrolet · Manual Matiz 2011, referencia; año y motor de la unidad pendientes",
    url: "https://my.gm.com.mx/content/dam/gmownercenter/gmna/gmmx/dynamic/manuals/2011/chevrolet/matiz/es/om_ng-chevrolet_matiz_my11-es_MX.pdf",
    scope: "family",
  },
  {
    id: "nissan-manuals",
    title: "Nissan México · Manuales y mantenimiento por modelo y año",
    url: "https://www.nissan.com.mx/duenos-nissan/respaldo-nissan/manuales.html",
    scope: "identification",
  },
  {
    id: "tsuru-maintenance-reference",
    title: "Nissan · Manual del conductor Tsuru, referencia publicada por distribuidor autorizado",
    url: "https://www.nissanacueducto.mx/ResourceFiles/pdf/nissan-2016-tsuru-manual.pdf",
    scope: "family",
  },
];

const pendingCadence = "Frecuencia pendiente del manual correspondiente a la serie, uso e historial de servicio.";
const preUseCadence = "Propuesta: antes de cada jornada o uso; completar con el manual de la unidad.";

function plan(
  id: string,
  title: string,
  description: string,
  tasks: string[],
  source_ids: string[],
  options: Partial<Pick<MaintenancePlan, "cadence" | "basis" | "interval_hours" | "interval_km" | "interval_months">> = {},
): MaintenancePlan {
  return {
    id,
    title,
    description,
    tasks,
    cadence: pendingCadence,
    interval_hours: null,
    interval_km: null,
    interval_months: null,
    basis: "preliminary",
    source_ids,
    ...options,
  };
}

const plans: Record<MaintenanceFamily, MaintenancePlan[]> = {
  gmk: [
    plan("gmk-preuse", "Revisión previa de grúa y traslado", "Lista inicial para completar con el manual de la GMK y sus accesorios.", [
      "Registrar odómetro y horómetros del chasis y de la superestructura por separado.",
      "Inspeccionar fugas, neumáticos, luces, frenos y elementos de acceso.",
      "Revisar cable, gancho, poleas, apoyos, estabilizadores y seguros de transporte.",
      "Comprobar mandos y dispositivos de seguridad con el procedimiento del fabricante.",
    ], ["manitowoc-serial-manuals"], { cadence: preUseCadence }),
    plan("gmk-carrier-structure", "Inspección estructural del chasis", "Boletín adicional GMK 3 302 970; se integra a las inspecciones existentes y no sustituye el manual por serie.", [
      "Inspeccionar visualmente el acero estructural del chasis y las zonas indicadas en el boletín.",
      "Buscar grietas, deformaciones, abolladuras y dobleces; documentar ubicación y fotografías.",
      "Remitir cualquier daño a Manitowoc Crane Care para evaluación antes de continuar el trabajo.",
    ], ["gmk-structural-bulletin", "manitowoc-serial-manuals"], {
      cadence: "Cada mes o aproximadamente 2,000 km, lo que ocurra primero; validar aplicación del boletín a la unidad.",
      interval_km: 2000,
      interval_months: 1,
      basis: "manufacturer_family",
    }),
    plan("gmk-upper-structure", "Inspección de superestructura, pluma y extensión", "Inspección adicional del boletín GMK 3 302 970, con el horómetro de la superestructura.", [
      "Inspeccionar visualmente la estructura de la superestructura y la pluma principal.",
      "Revisar la extensión de celosía cuando esté equipada, incluidas las zonas señaladas por el boletín.",
      "Registrar grietas, deformaciones, abolladuras o dobleces y solicitar evaluación del fabricante.",
    ], ["gmk-structural-bulletin", "manitowoc-serial-manuals"], {
      cadence: "Cada mes o 100 horas de operación de la superestructura, lo que ocurra primero; validar aplicación del boletín.",
      interval_hours: 100,
      interval_months: 1,
      basis: "manufacturer_family",
    }),
    plan("gmk-mechanisms", "Izaje, giro, telescopaje y estabilización", "Alcance preliminar; los puntos de engrase y criterios de desgaste se obtienen del manual exacto.", [
      "Revisar cable y terminales, gancho, poleas y freno del cabrestante.",
      "Inspeccionar patines, mecanismos de extensión y bloqueo de pluma según configuración.",
      "Revisar corona y reductor de giro, fijaciones, estabilizadores y cilindros.",
      "Verificar limitadores, indicadores y sensores instalados mediante el procedimiento autorizado.",
    ], ["manitowoc-serial-manuals"]),
    plan("gmk-powertrain-fluids", "Motores, transmisión e hidráulico", "Preparar servicios separados de chasis y superestructura; no se conoce el historial ni los motores instalados.", [
      "Identificar cada motor y sus filtros; revisar admisión, combustible y enfriamiento.",
      "Inspeccionar fugas y niveles en transmisión, ejes, reductores y sistema hidráulico.",
      "Definir aceite, filtros y recambios mediante manuales de motor y grúa por serie.",
      "Registrar fecha y lectura real de cada servicio antes de calcular el siguiente vencimiento.",
    ], ["manitowoc-serial-manuals"]),
  ],
  mobile_crane: [
    plan("mobile-preuse", "Revisión previa de grúa móvil", "Propuesta para la Grove 120 toneladas de 2005; el modelo no está identificado y no se aplican intervalos de la familia GMK.", [
      "Registrar odómetro y horómetros disponibles, identificando a qué sistema corresponde cada uno.",
      "Inspeccionar fugas, neumáticos, luces, frenos y elementos de acceso.",
      "Revisar cable, gancho, poleas, apoyos y seguros de transporte según equipamiento.",
      "Comprobar mandos y seguridades mediante el procedimiento del manual que corresponda a la serie.",
    ], ["manitowoc-serial-manuals"], { cadence: preUseCadence }),
    plan("mobile-structure-lifting", "Estructura y equipo de izaje", "Alcance preliminar para completar una vez identificados modelo, serie y configuración.", [
      "Inspeccionar estructura, soldaduras, uniones y pasadores visibles.",
      "Revisar cable, terminales, gancho, poleas y cabrestante conforme al manual exacto.",
      "Identificar el tipo de pluma y sus accesorios antes de establecer puntos de revisión.",
      "Documentar grietas, deformaciones, corrosión y desgaste para evaluación técnica.",
    ], ["manitowoc-serial-manuals"]),
    plan("mobile-hydraulics-lubrication", "Hidráulico, giro y lubricación", "No se ha confirmado el sistema hidráulico, la pluma ni el plan de lubricación de esta unidad.", [
      "Inspeccionar mangueras, tuberías, cilindros y conexiones visibles para detectar daños o fugas.",
      "Revisar mecanismos de giro y apoyos que efectivamente equipe la grúa.",
      "Identificar filtros, reductores y puntos de engrase mediante documentación por serie.",
      "Definir lubricantes y recambios solo después de recuperar manual e historial.",
    ], ["manitowoc-serial-manuals"]),
    plan("mobile-carrier-engine", "Motor, chasis y transmisión", "Lista inicial sin atribuir motores, ejes ni componentes de otros modelos Grove.", [
      "Identificar motores, transmisión y chasis instalados mediante sus placas.",
      "Revisar admisión, combustible, enfriamiento y fugas visibles.",
      "Inspeccionar frenos, dirección, suspensión y ruedas según configuración.",
      "Registrar servicios previos y lecturas actuales antes de fijar intervalos.",
    ], ["manitowoc-serial-manuals"]),
  ],
  liebherr: [
    plan("liebherr-preuse", "Revisión previa de la LTM", "Propuesta inicial para una LTM 1140 reportada; confirmar variante y serie antes de completar procedimientos.", [
      "Registrar odómetro y horómetros disponibles, identificando el motor al que pertenecen.",
      "Inspeccionar fugas, neumáticos, luces, frenos, accesos y seguros de transporte.",
      "Revisar cable, gancho, poleas, estabilizadores y pasadores visibles.",
      "Comprobar mandos, indicadores y seguridades instaladas según su manual.",
    ], ["liebherr-service"], { cadence: preUseCadence }),
    plan("liebherr-structure-lifting", "Estructura y mecanismos de elevación", "Alcance de inspección preliminar que debe validar servicio Liebherr para esta unidad de 1994.", [
      "Examinar pluma, chasis, soldaduras y uniones para detectar grietas, corrosión o deformación.",
      "Inspeccionar cable, terminales, gancho, poleas y cabrestante con criterios del fabricante.",
      "Revisar patines, extensiones, pasadores y bloqueo de pluma según equipamiento.",
      "Documentar hallazgos y remitir defectos estructurales a un especialista de la marca.",
    ], ["liebherr-service"]),
    plan("liebherr-hydraulics-lubrication", "Hidráulico, giro y lubricación", "Los lubricantes y puntos de servicio dependen de la variante y número de serie.", [
      "Inspeccionar cilindros, vástagos, mangueras, conexiones y fugas.",
      "Revisar estabilizadores, corona de giro y reductores.",
      "Verificar funcionamiento del engrase centralizado si equipa y completar puntos del manual.",
      "Definir filtros y recambios de fluidos con la documentación correspondiente a la grúa.",
    ], ["liebherr-service"]),
    plan("liebherr-carrier-engine", "Chasis, motores y tren de transmisión", "Plan preliminar separado del equipo de izaje; confirmar motores y componentes instalados.", [
      "Revisar motor, admisión, combustible, bandas, mangueras y enfriamiento.",
      "Inspeccionar frenos, sistema neumático, dirección y suspensión.",
      "Revisar transmisión, ejes, cardanes, ruedas y neumáticos.",
      "Recuperar historial y manuales por serie para establecer recambios e intervalos.",
    ], ["liebherr-service"]),
  ],
  hiab: [
    plan("hiab-preuse", "Revisión previa de grúa articulada", "Propuesta de inspección inicial; falta identificar el modelo HIAB de 2009.", [
      "Inspeccionar estructura, fijaciones al camión, articulaciones y seguros de transporte.",
      "Revisar estabilizadores, apoyos, gancho y accesorios instalados.",
      "Buscar fugas o daños visibles en mangueras, tuberías y cilindros.",
      "Comprobar mandos y dispositivos de seguridad según el manual del equipo.",
    ], ["hiab-procare"], { cadence: preUseCadence }),
    plan("hiab-lubrication-wear", "Articulaciones, patines y lubricación", "Tareas de la familia HIAB; puntos y productos pendientes del modelo y serie.", [
      "Revisar holguras y desgaste de bulones, bujes y articulaciones.",
      "Inspeccionar patines y superficies de deslizamiento de las extensiones.",
      "Lubricar únicamente los puntos y superficies indicados por el fabricante.",
      "Revisar desplazamiento y estado de las vigas de estabilizadores.",
    ], ["hiab-procare"], { basis: "manufacturer_family" }),
    plan("hiab-hydraulics", "Servicio hidráulico", "HIAB contempla filtros y aceite hidráulico; frecuencia y especificación deben confirmarse para esta grúa.", [
      "Inspeccionar mangueras, tuberías, uniones, vástagos y sellos.",
      "Verificar nivel y condición del aceite con el procedimiento correspondiente.",
      "Identificar filtros y definir su recambio con el manual e historial.",
      "Evaluar fugas y funcionamiento antes de autorizar ajustes o reparaciones.",
    ], ["hiab-procare"], { basis: "manufacturer_family" }),
    plan("hiab-controls-structure", "Mandos, seguridades y estructura", "Inspección de familia basada en ProCare; no equivale a una certificación de esta unidad.", [
      "Revisar estructura y fijaciones para detectar daños, corrosión o piezas sueltas.",
      "Inspeccionar cableado y componentes electrónicos instalados.",
      "Verificar funciones, recorrido y dispositivos de seguridad mediante procedimiento del fabricante.",
      "Registrar recomendaciones y reparaciones necesarias con responsable técnico.",
    ], ["hiab-procare"], { basis: "manufacturer_family" }),
  ],
  boom_truck: [
    plan("boom-preuse", "Revisión previa del equipo telescópico", "Propuesta para National, Manitex, Terex y Simon-RO; requiere modelo, serie y equipamiento de cada grúa.", [
      "Revisar cable, terminales, gancho, poleas y seguros visibles.",
      "Inspeccionar pluma, apoyos, estabilizadores, anclajes al camión y fugas.",
      "Comprobar PTO, mandos, parada y dispositivos de seguridad instalados según manual.",
      "Verificar tabla de carga correspondiente y registrar horómetro del equipo.",
    ], ["national-maintenance-reference", "manitex-inspection", "terex-ro-identification"], { cadence: preUseCadence }),
    plan("boom-hoist", "Cable, gancho, poleas y cabrestante", "Lista de familia; diámetro, lubricante, criterios de descarte y procedimientos pendientes de identificación.", [
      "Inspeccionar cable y terminales para detectar deterioro y medir según criterios del fabricante.",
      "Revisar gancho, pestillo, giro del bloque y estado de poleas.",
      "Comprobar tambor, enrollado, fugas y freno del cabrestante mediante procedimiento autorizado.",
      "Documentar defectos y sustituir componentes únicamente conforme a especificación del equipo.",
    ], ["national-maintenance-reference", "manitowoc-serial-manuals", "manitex-inspection"]),
    plan("boom-structure-lubrication", "Pluma, giro, estabilizadores y anclaje", "La lubricación debe respetar los materiales de patines y los puntos del modelo exacto.", [
      "Inspeccionar estructura, soldaduras, pasadores y fijaciones al subchasis.",
      "Revisar extensiones, patines y mecanismos de telescopaje según configuración.",
      "Revisar giro, reductor y estabilizadores; aplicar engrase solo donde indique el manual.",
      "Comprobar seguros de transporte y registrar holguras o deformaciones.",
    ], ["national-maintenance-reference", "manitex-inspection"]),
    plan("boom-hydraulics-safety", "Hidráulico, PTO y dispositivos de seguridad", "Plan preliminar del equipo de izaje; el camión requiere además su propio servicio de chasis y motor.", [
      "Revisar depósito, filtros, mangueras, cilindros, conexiones y fugas hidráulicas.",
      "Inspeccionar accionamiento y fijaciones de la toma de fuerza y bomba.",
      "Verificar indicadores y limitadores de carga, y anticolisión de bloques si equipa, según manual.",
      "Definir aceite, filtros y recambios con modelo, serie e historial confirmados.",
    ], ["national-maintenance-reference", "manitex-inspection", "terex-ro-identification"]),
  ],
  telehandler: [
    plan("telehandler-preuse", "Revisión previa del manipulador CAT", "Propuesta para la unidad 2013; no se conoce el modelo, capacidad ni accesorios autorizados.", [
      "Revisar fugas, niveles, neumáticos y daños visibles de la máquina.",
      "Inspeccionar horquillas o accesorio instalado, acoplador y mecanismo de retención.",
      "Comprobar frenos, dirección, mandos y dispositivos de seguridad según manual.",
      "Registrar horómetro y verificar que la tabla de capacidad corresponda al accesorio.",
    ], ["cat-telehandler-maintenance", "cat-telehandler-service"], { cadence: preUseCadence }),
    plan("telehandler-boom", "Pluma, patines, cadenas y articulaciones", "Tareas de familia CAT; confirmar presencia de cadenas, estabilizadores y sistema de bloqueo de eje.", [
      "Inspeccionar pluma y articulaciones para detectar desgaste o daño.",
      "Revisar patines y cadenas internas cuando formen parte del modelo.",
      "Lubricar los puntos indicados en el manual correspondiente.",
      "Verificar estabilización del eje trasero y estabilizadores si están equipados.",
    ], ["cat-telehandler-service"], { basis: "manufacturer_family" }),
    plan("telehandler-drivetrain", "Transmisión, ejes y reductores", "La guía CAT distingue servicios de asentamiento y recurrentes; sus intervalos no se asignan a esta unidad sin identificarla.", [
      "Revisar fugas y niveles de transmisión, caja de transferencia, ejes y reductores de rueda.",
      "Inspeccionar frenos, dirección y neumáticos.",
      "Confirmar tipo de aceite y condiciones de servicio en el manual por serie.",
      "Separar el servicio inicial de los recambios recurrentes al recuperar el historial.",
    ], ["cat-telehandler-service"], { basis: "manufacturer_family" }),
    plan("telehandler-engine-hydraulics", "Motor, enfriamiento e hidráulico", "Familias de servicio pendientes de convertir en intervalos con el modelo y número de producto CAT.", [
      "Inspeccionar admisión, filtros, bandas, mangueras y rejillas del radiador.",
      "Revisar niveles, fugas y condición de fluidos del motor y sistema hidráulico.",
      "Revisar cilindros y conexiones de la pluma y el accesorio.",
      "Identificar filtros y especificaciones antes de programar recambios.",
    ], ["cat-telehandler-maintenance", "cat-telehandler-service"]),
  ],
  truck: [
    plan("truck-preuse", "Revisión previa del camión", "Base para Freightliner, Peterbilt, Kenworth, International y tracto; ajustar al chasis y componentes reales.", [
      "Registrar odómetro y horómetro; revisar niveles y fugas visibles.",
      "Comprobar neumáticos, ruedas, luces, espejos y cinturón.",
      "Verificar frenos, presión y fugas del sistema neumático cuando equipe.",
      "Revisar acoplamiento y conexiones del remolque, o anclaje y seguros del equipo montado, según uso.",
    ], ["kenworth-maintenance-reference", "peterbilt-maintenance-reference"], { cadence: preUseCadence }),
    plan("truck-engine", "Motor, combustible y enfriamiento", "Los manuales de familia no determinan el motor de estos camiones; validar VIN y placa de motor.", [
      "Inspeccionar admisión, filtros, separador de agua si equipa y líneas de combustible.",
      "Revisar aceite, refrigerante, bandas, mangueras y radiador.",
      "Identificar filtros, fluidos y procedimiento de servicio por fabricante de motor.",
      "Registrar último servicio y uso severo o tiempo de operación con PTO antes de fijar frecuencia.",
    ], ["freightliner-manuals", "kenworth-maintenance-reference", "peterbilt-maintenance-reference", "international-manuals"]),
    plan("truck-brakes-chassis", "Frenos, dirección, suspensión y ruedas", "Inspección de chasis pesado; los componentes varían según configuración y modificaciones.", [
      "Revisar frenos, líneas, depósitos y secador de aire cuando equipe.",
      "Inspeccionar dirección, terminales, suspensión, soportes y fijaciones.",
      "Revisar neumáticos, ruedas, rodamientos y sellos por condición y especificación.",
      "Inspeccionar bastidor, subchasis, caja de estacas y anclajes de carga cuando correspondan.",
    ], ["kenworth-maintenance-reference", "peterbilt-maintenance-reference"]),
    plan("truck-transmission-coupling", "Transmisión, PTO y acoplamiento", "Servicio por componentes; identificar transmisión, ejes y quinta rueda antes de seleccionar repuestos.", [
      "Revisar transmisión, embrague si equipa, cardanes, crucetas y diferenciales.",
      "Inspeccionar toma de fuerza y sus fijaciones en camiones con equipo hidráulico.",
      "Revisar y lubricar quinta rueda y seguro de acople si es tracto, conforme a su fabricante.",
      "Definir lubricantes y recambios con los manuales de los componentes instalados.",
    ], ["kenworth-maintenance-reference", "peterbilt-maintenance-reference"]),
  ],
  trailer: [
    plan("trailer-preuse", "Revisión previa de cama baja", "Propuesta de familia de remolque; Fontaine se usa como referencia, sin atribuir esa marca a la unidad.", [
      "Inspeccionar acople, perno rey, seguros y conexiones de aire y electricidad.",
      "Revisar neumáticos, ruedas, luces y funcionamiento de frenos.",
      "Examinar piso, anclajes de carga, rampas y seguros de transporte.",
      "Revisar cuello desmontable y circuito hidráulico únicamente si la unidad los equipa.",
    ], ["trailer-maintenance-reference"], { cadence: preUseCadence }),
    plan("trailer-running-gear", "Ejes, suspensión, frenos y ruedas", "Tareas preliminares; el manual y los fabricantes de ejes y frenos determinarán las frecuencias.", [
      "Inspeccionar frenos, líneas y depósitos; corregir conexiones sueltas o rozamientos.",
      "Revisar ejes, suspensión, bujes, resortes y fijaciones según configuración.",
      "Inspeccionar rodamientos, sellos, ruedas y desgaste de neumáticos.",
      "Evaluar alineación cuando exista desgaste irregular y registrar la corrección.",
    ], ["trailer-maintenance-reference"]),
    plan("trailer-structure", "Estructura, acoplamiento y rampas", "Plan preliminar sin intervalo de recambio; confirmar fabricante, capacidad y configuración de la cama baja.", [
      "Limpiar e inspeccionar bastidor, soldaduras, piso y anclajes para detectar daños.",
      "Revisar desgaste y fijación del perno rey y elementos de acople.",
      "Revisar rampas, bisagras, pasadores, seguros y mecanismos de elevación si equipa.",
      "Documentar grietas o deformaciones y obtener instrucciones de reparación del fabricante.",
    ], ["trailer-maintenance-reference"]),
  ],
  ford: [
    plan("ford-preuse", "Revisión previa de Ranger, F-150 o Figo", "Propuesta de inspección básica; el año, motor y transmisión de cada vehículo siguen pendientes.", [
      "Registrar kilometraje y revisar testigos, niveles y fugas visibles.",
      "Comprobar frenos, neumáticos, luces, limpiaparabrisas y cinturones.",
      "Inspeccionar carga y anclajes de la caja en las pickups.",
      "Confirmar por VIN la identidad de la F-150 reportada como cuatro cilindros antes de asignar motor.",
    ], ["ford-manuals", "figo-maintenance-reference"], { cadence: preUseCadence }),
    plan("ford-engine-filters", "Motor, aceite, filtros y encendido", "El servicio debe elegirse por motor y combustible; no hay un intervalo único para Ranger, F-150 y Figo.", [
      "Identificar motor, combustible y especificación de aceite en el manual correspondiente.",
      "Revisar filtros de aire, aceite, combustible y cabina según equipamiento.",
      "Preparar cambios de aceite y filtros con historial y condiciones de uso confirmados.",
      "Revisar bujías o componentes de encendido solo cuando apliquen al motor instalado.",
    ], ["ford-manuals", "ford-maintenance-family"]),
    plan("ford-brakes-running-gear", "Frenos, neumáticos, dirección y suspensión", "Base de mantenimiento de familia Ford; confirmar capacidades y presiones en la etiqueta y manual del vehículo.", [
      "Inspeccionar frenos, líneas, nivel y condición del líquido conforme al manual.",
      "Revisar desgaste de neumáticos y definir rotación compatible con su montaje.",
      "Inspeccionar dirección, suspensión, rodamientos y guardapolvos.",
      "Revisar batería, terminales y funcionamiento de luces.",
    ], ["ford-manuals", "ford-maintenance-family", "figo-maintenance-reference"]),
    plan("ford-cooling-transmission", "Enfriamiento, transmisión y distribución", "Año y motor determinan fluidos, componentes e intervalos; no asumir banda o cadena de distribución.", [
      "Revisar refrigerante, radiador, bandas de accesorios y mangueras.",
      "Inspeccionar transmisión y embrague según versión; revisar diferenciales y transferencia solo si equipa.",
      "Identificar el sistema de distribución antes de crear cualquier recambio.",
      "Definir servicio normal o severo con base en carga, polvo, recorridos y manual exacto.",
    ], ["ford-manuals", "ford-maintenance-family", "figo-maintenance-reference"]),
  ],
  chevrolet: [
    plan("chevrolet-preuse", "Revisión previa de Silverado", "Propuesta básica; el año, serie y motor de la Silverado siguen pendientes.", [
      "Registrar odómetro y revisar testigos, niveles y fugas visibles.",
      "Comprobar frenos, neumáticos, luces, limpiaparabrisas y cinturones.",
      "Revisar batería y terminales.",
      "Inspeccionar caja y sujeción de carga cuando se utilice para transportar materiales.",
    ], ["silverado-maintenance-family"], { cadence: preUseCadence }),
    plan("chevrolet-engine", "Aceite, filtración y motor de Silverado", "Faltan año, serie, combustible y motor para seleccionar especificaciones de esta pickup.", [
      "Seleccionar manual y filtros mediante VIN, año y motor.",
      "Revisar admisión, aceite y fugas del motor; atender indicador de vida del aceite si equipa.",
      "Preparar recambio de aceite y filtros según historial y uso, sin aplicar un kilometraje genérico.",
      "Revisar encendido o sistema de combustible según motorización confirmada.",
    ], ["silverado-maintenance-family"]),
    plan("chevrolet-brakes-chassis", "Frenos, dirección, suspensión y neumáticos", "Base de revisión de Silverado; refacciones y criterios se seleccionan por año y versión.", [
      "Inspeccionar frenos, conductos y fluido con el procedimiento del manual.",
      "Revisar dirección, suspensión, rodamientos y guardapolvos.",
      "Evaluar desgaste y presión de neumáticos; definir rotación apropiada al montaje.",
      "Registrar condiciones de remolque, carga pesada o polvo que modifiquen el servicio de Silverado.",
    ], ["silverado-maintenance-family"]),
    plan("chevrolet-cooling-drivetrain", "Enfriamiento, transmisión y distribución", "Alcance preliminar para Silverado; fluidos y componentes dependen de año, motor y transmisión.", [
      "Inspeccionar refrigerante, radiador, mangueras y bandas de accesorios.",
      "Revisar transmisión y sus líneas según versión.",
      "Revisar diferenciales y caja de transferencia únicamente si equipa.",
      "Identificar distribución, refrigerante y fluidos antes de programar recambios.",
    ], ["silverado-maintenance-family"]),
  ],
  matiz: [
    plan("matiz-preuse", "Revisión previa del Matiz", "Propuesta básica; falta identificar año, motor y transmisión de esta unidad.", [
      "Registrar kilometraje y revisar testigos, niveles y fugas visibles.",
      "Comprobar frenos, neumáticos, luces, limpiaparabrisas y cinturones.",
      "Inspeccionar batería y terminales.",
      "Registrar ruidos, vibraciones o cambios en funcionamiento para diagnóstico.",
    ], ["matiz-maintenance-reference"], { cadence: preUseCadence }),
    plan("matiz-engine", "Motor, aceite, filtros y encendido", "El manual Matiz 2011 es referencia de familia, no confirmación del año o motorización de la unidad.", [
      "Identificar motor y manual antes de seleccionar aceite, filtros o bujías.",
      "Revisar admisión, aceite, líneas de combustible y fugas.",
      "Inspeccionar componentes de encendido según versión.",
      "Preparar recambios según historial y condiciones de uso confirmadas.",
    ], ["matiz-maintenance-reference"]),
    plan("matiz-brakes-chassis", "Frenos, dirección, suspensión y neumáticos", "Lista preliminar para completar con el programa de mantenimiento del año correcto.", [
      "Inspeccionar frenos, freno de estacionamiento, líneas y líquido.",
      "Revisar dirección, suspensión, rodamientos y guardapolvos.",
      "Evaluar desgaste y presión de neumáticos según etiqueta del vehículo.",
      "Registrar holguras, fugas o desgaste irregular para su corrección.",
    ], ["matiz-maintenance-reference"]),
    plan("matiz-cooling-transmission", "Enfriamiento, transeje y distribución", "No se asignan fluidos ni un recambio de distribución hasta confirmar la motorización.", [
      "Inspeccionar refrigerante, radiador, mangueras y bandas de accesorios.",
      "Revisar fugas y condición del transeje según versión manual o automática.",
      "Revisar embrague y mandos si corresponde.",
      "Identificar sistema de distribución y fluidos requeridos mediante el manual exacto.",
    ], ["matiz-maintenance-reference"]),
  ],
  nissan: [
    plan("tsuru-preuse", "Revisión previa del Tsuru", "Propuesta básica; falta confirmar año, generación y motor, sin atribuir automáticamente la versión B13.", [
      "Registrar kilometraje y revisar testigos, niveles y fugas visibles.",
      "Comprobar frenos, neumáticos, luces, limpiaparabrisas y cinturones.",
      "Inspeccionar batería, terminales y elementos de seguridad del vehículo.",
      "Registrar ruidos, vibraciones o cambios en la conducción para diagnóstico.",
    ], ["nissan-manuals", "tsuru-maintenance-reference"], { cadence: preUseCadence }),
    plan("tsuru-engine", "Motor, filtración y encendido", "El manual consultado es una referencia de Tsuru; año y motor instalados deben verificarse antes de elegir piezas.", [
      "Identificar VIN, motor y manual de mantenimiento correspondiente.",
      "Revisar aceite, filtro de aire, líneas de combustible y fugas.",
      "Inspeccionar bujías y componentes de encendido que correspondan a la versión.",
      "Preparar recambios de aceite y filtros según historial, polvo y condiciones de manejo.",
    ], ["nissan-manuals", "tsuru-maintenance-reference"]),
    plan("tsuru-brakes-running-gear", "Frenos, dirección, suspensión y neumáticos", "Lista de servicio preliminar para completar con el programa del año correcto.", [
      "Inspeccionar frenos, freno de estacionamiento, líneas y líquido.",
      "Revisar dirección, suspensión, guardapolvos y rodamientos.",
      "Inspeccionar desgaste de neumáticos y presión conforme a la etiqueta del vehículo.",
      "Registrar holguras, desgaste irregular o fugas para corregir según manual.",
    ], ["tsuru-maintenance-reference"]),
    plan("tsuru-cooling-transmission", "Enfriamiento, transmisión y bandas", "No se asigna cambio de banda de distribución sin identificar el motor y su sistema real.", [
      "Revisar radiador, refrigerante, mangueras y bandas de accesorios.",
      "Inspeccionar fugas y condición de transmisión o transeje según versión.",
      "Revisar embrague y sus mandos cuando corresponda.",
      "Confirmar especificaciones de fluidos y sistema de distribución antes de preparar recambios.",
    ], ["nissan-manuals", "tsuru-maintenance-reference"]),
  ],
};

/** Each unit receives its own editable copy; family research is not a serial-specific service schedule. */
export function maintenancePlans(family: MaintenanceFamily): MaintenancePlan[] {
  return plans[family].map((item) => ({
    ...item,
    tasks: [...item.tasks],
    source_ids: [...item.source_ids],
  }));
}
