import type { ChecklistKind, ChecklistTemplate, ChecklistTemplateItem, CraneChecklistItem, CraneType, KnowledgeDoc } from "@/lib/types";
import { CRANE_TYPE_LABELS, CHECKLIST_KIND_LABELS } from "@/lib/labels";
import { buildSergioFleet, FLEET_RECONCILIATION } from "./sergio";

const created = "2026-10-27T18:00:00.000Z";
const id = (group: number, n: number) => `53002700-1027-4000-${group}-${String(n).padStart(12, "0")}`;
// Keep these slots stable when adding equipment or rearranging the fleet list.
const TYPE_SLOT: Record<CraneType, number> = { camion_grua: 0, grua_movil: 1, telehandler: 2, tractocamion: 3, remolque: 4, vehiculo_apoyo: 5, grua_armable: 6 };
const KIND_SLOT: Record<ChecklistKind, number> = { revision_total: 0, pre_renta: 1, post_renta: 2, diaria: 3, mantenimiento: 4 };
const liftingTypes: CraneType[] = ["grua_movil", "camion_grua", "grua_armable", "telehandler"];

export function getFleetTemplateId(type: CraneType, kind: ChecklistKind): string {
  return id(8100, TYPE_SLOT[type] * 10 + KIND_SLOT[kind] + 1);
}

type Point = [title: string, instructions: string, critical: boolean];
const ROAD: Point[] = [
  ["Frenos, dirección y neumáticos", "Inspeccionar condición, fugas, daños, sujeción de ruedas y pruebas funcionales autorizadas por el manual. Detener si existe falla.", true],
  ["Niveles, fugas y enfriamiento", "Con el equipo asegurado y según el manual, revisar niveles e indicios de fugas. No abrir circuitos calientes o presurizados.", true],
  ["Luces, cinturón y equipo de emergencia", "Revisar luces, avisos, cinturón, extintor y equipo de emergencia aplicable.", true],
];
const LIFT: Point[] = [
  ["Pluma, estructura y fijaciones", "Inspeccionar visualmente deformaciones, fisuras, patines y fijaciones accesibles. No realizar ajustes ni pruebas de carga sin procedimiento autorizado.", true],
  ["Elementos de elevación instalados", "Revisar gancho, seguros y accesorios instalados según el manual. Inspeccionar cable, terminales, poleas y malacate sólo si equipa; una grúa articulada HIAB puede no tenerlos. Fotografiar los componentes presentes.", true],
  ["Estabilizadores, hidráulico y dispositivos de seguridad", "Verificar apoyos, cilindros, mangueras, fugas y prueba funcional de limitadores/anticolisión según manual y configuración.", true],
];
const POINTS: Record<CraneType, Point[]> = {
  grua_movil: [...ROAD, ...LIFT],
  camion_grua: [...ROAD, ...LIFT],
  grua_armable: [...LIFT, ["Montaje, contrapesos y apoyos", "Verificar configuración de montaje, arriostramiento/apoyos y contrapesos contra el manual de la unidad.", true]],
  telehandler: [...ROAD, ["Horquillas y acoplador", "Inspeccionar horquillas, carro, seguros y accesorio instalado; verificar su tabla de cargas.", true], ["Pluma y sistema hidráulico", "Inspeccionar pluma, patines, mangueras, cilindros y seguros. Revisar estabilización y cadenas sólo si equipa, según manual.", true]],
  tractocamion: [...ROAD, ["Quinta rueda y conexiones", "Revisar quinta rueda, seguro de acople y conexiones de aire/electricidad hacia el remolque según procedimiento del fabricante.", true]],
  remolque: [["Estructura, rampas y anclajes", "Inspeccionar cuello, plataforma, soldaduras, piso, rampas y puntos de sujeción; circuito hidráulico sólo si equipa.", true], ["Ejes, suspensión, frenos y neumáticos", "Revisar ejes, suspensión, sellos/rodamientos, frenos y conexiones, neumáticos y ruedas según configuración.", true], ["Perno rey, acople y luces", "Verificar perno rey, acoplamiento, conexiones, luces y reflejantes.", true]],
  vehiculo_apoyo: [...ROAD, ["Carrocería y sujeción de carga", "Revisar carrocería, puertas y cinturones. En pickups/estacas revisar caja, piso, estacas, seguros y anclajes de carga.", true]],
};

/** Persisted draft plans and compatible checklists, never fabricated work orders. */
export function buildFleetPayload() {
  const cranes = buildSergioFleet();
  const templates: ChecklistTemplate[] = [];
  const items: ChecklistTemplateItem[] = [];
  const kinds: ChecklistKind[] = ["revision_total", "pre_renta", "post_renta", "diaria"];
  const types = [...new Set(cranes.map((c) => c.type))];
  for (const type of types) {
    for (const kind of kinds) {
      const templateSlot = TYPE_SLOT[type] * 10 + KIND_SLOT[kind] + 1;
      const templateId = getFleetTemplateId(type, kind);
      templates.push({ id: templateId, name: `${CHECKLIST_KIND_LABELS[kind]} · ${CRANE_TYPE_LABELS[type]} · flota Sergio`, kind, crane_types: [type], description: "Inspección visual y funcional base. Confirmar configuración y manual por serie antes de usar. No sustituye servicio especializado ni certificación.", active: true, created_at: created });
      const points: Point[] = [["Identificación, manual y configuración", "Confirmar placa/VIN y manual de la unidad. En equipos de izaje, verificar tabla de cargas correspondiente a accesorios y configuración; si falta no liberar para operación.", liftingTypes.includes(type)], ...POINTS[type]];
      for (const [i, [title, instructions, critical]] of points.entries()) items.push({
        id: id(8200, templateSlot * 100 + i), template_id: templateId,
        position: i + 1, section: "Inspección base", title, instructions, critical,
        response_type: "ok_falla", unit: null, min_value: null, max_value: null,
        requires_photo: true, min_photos: 1, photo_hint: "Foto legible del punto inspeccionado en la unidad real.", created_at: created,
      });
    }
  }
  const ownItems: CraneChecklistItem[] = cranes.flatMap((c, index) => [{
    id: id(8300, index + 1), crane_id: c.id, section: "Identificación de la unidad",
    title: `${liftingTypes.includes(c.type) ? "Verificar identificación y configuración de izaje" : "Verificar placa/VIN de la unidad"} · ${c.code}`,
    instructions: liftingTypes.includes(c.type)
      ? "Verificar placa/serie y correspondencia del manual y tabla de cargas con la unidad, accesorios y configuración real. Confirmar los dispositivos de seguridad instalados según ese manual. No liberar para izaje sin esta identificación y configuración verificadas."
      : "Verificar que placa/VIN correspondan a esta unidad. Registrar diferencias para corregir su ficha; este punto documental no constituye una falla mecánica.",
    response_type: "ok_falla" as const, unit: null,
    requires_photo: true, min_photos: 1, photo_hint: "Placa del equipo o VIN legible; evidencia de la configuración real.",
    critical: liftingTypes.includes(c.type), reason: "Identificación de la unidad y configuración segura de izaje cuando aplica.", active: true, created_at: created,
  }, {
    id: id(8301, index + 1), crane_id: c.id, section: "Datos de catálogo pendientes",
    title: `Registrar datos por completar · ${c.code}`,
    instructions: `Anotar datos disponibles y los que siguen pendientes; no declarar una falla mecánica por información administrativa faltante. ${c.fleet_profile!.pending.join(" ")}`,
    response_type: "texto" as const, unit: null,
    requires_photo: false, min_photos: 0, photo_hint: null,
    critical: false, reason: "Seguimiento de identificación, conciliación e historial; no implica detención automática.", active: true, created_at: created,
  }]);
  const knowledge: KnowledgeDoc[] = [{ id: id(8400, 1), title: "Conciliación de flota de Sergio · 27/10/2026", source: "Listado de Sergio e investigación de fabricantes", content: [...FLEET_RECONCILIATION, "Las capacidades y alcances reportados no son límites operativos verificados. No usar fotos de referencia para identificar unidades. Las frecuencias numéricas de inspección GMK provienen del boletín de familia; cambios de aceites/filtros requieren manual por serie y lecturas/historial. Consultar fleet_profile en el expediente de cada equipo para fuentes y planes."].join("\n"), created_at: created }];
  return { cranes, checklist_templates: templates, checklist_template_items: items, crane_checklist_items: ownItems, knowledge_docs: knowledge };
}
