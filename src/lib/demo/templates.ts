import type { CraneType, ResponseType } from "@/lib/types";

// [sección, título, instrucciones, foto sugerida, crítico, tipo, unidad, min, max]
type Row = [string, string, string, string | null, boolean, ResponseType?, string?, number?, number?];

export interface TemplateDef {
  key: string;
  name: string;
  kind: "revision_total" | "post_renta" | "diaria";
  crane_types: CraneType[];
  description: string;
  items: Row[];
}

/**
 * Puntos que por naturaleza requieren varias fotos (título → mínimo).
 * Debe coincidir con supabase/migrations/20261019000000_fotos_por_punto.sql
 */
export const MULTI_PHOTO: Record<string, number> = {
  "Daños visibles nuevos": 4,
  "Tarjeta de circulación, póliza y permiso SCT": 3,
  "Tarjeta de circulación y póliza a bordo": 2,
  "Llantas sin cortes y con presión correcta": 2,
  "Llantas y birlos": 2,
  "Estabilizadores extienden, nivelan y retraen": 2,
  "Estabilizadores extienden y sostienen": 2,
  "Tramos de torre / celosía sin fisuras": 2,
};

export const TEMPLATE_DEFS: TemplateDef[] = [
  {
    key: "rt_movil",
    name: "Revisión total · Grúa móvil",
    kind: "revision_total",
    crane_types: ["grua_movil"],
    description: "Revisión completa previa a renta para grúas todo terreno y RT.",
    items: [
      ["Documentación", "Tarjeta de circulación y póliza a bordo", "Ambos documentos originales deben estar en la cabina y ser legibles.", "Una foto de cada documento", true],
      ["Estructura y pluma", "Pluma sin fisuras ni deformaciones", "Extiende la pluma por secciones. Busca fisuras, abolladuras, pintura cuarteada o soldaduras nuevas.", "Foto de la pluma extendida completa", true],
      ["Estructura y pluma", "Pernos y seguros de pluma y plumín", "Todos los pernos con su seguro (chaveta o pasador) colocado.", "Foto de pernos con seguro", false],
      ["Cables y gancho", "Cable principal en buen estado", "Sin hilos rotos, aplastamientos, jaulas de pájaro ni corrosión. Revisa los primeros 3 m desde el gancho.", "Foto del cable en el tambor", true],
      ["Cables y gancho", "Gancho con pestillo funcional", "El pestillo cierra solo; el gancho no tiene apertura ni giro anormal.", "Foto del gancho mostrando el pestillo", true],
      ["Sistema hidráulico", "Nivel de aceite hidráulico", "Con estabilizadores y pluma recogidos, el nivel debe estar entre MIN y MAX de la mirilla.", "Foto de la mirilla", false],
      ["Sistema hidráulico", "Mangueras y conexiones sin fugas", "Revisa bomba, válvulas y mangueras. Cualquier goteo activo es falla.", "Foto de la zona de bomba y mangueras", true],
      ["Sistema hidráulico", "Estabilizadores extienden, nivelan y retraen", "Extiende los 4 estabilizadores, nivela con la burbuja y retrae. Sin descenso por sí solos.", "Foto de los estabilizadores de cada lado", true],
      ["Motor y fluidos", "Nivel de aceite de motor", "Motor apagado y frío. Lee la bayoneta.", "Foto de la bayoneta", false],
      ["Motor y fluidos", "Nivel de anticongelante", "Revisa el depósito de expansión, sin abrir el radiador caliente.", "Foto del depósito", false],
      ["Motor y fluidos", "Lectura de horómetro", "Escribe la lectura exacta del horómetro.", "Foto del horómetro legible", false, "numero", "h", 0, 50000],
      ["Llantas", "Llantas sin cortes y con presión correcta", "Revisa las 4 llantas: cortes, chipotes y presión.", "Foto de las llantas de cada lado", false],
      ["Seguridad", "Limitador de momento de carga (LMI) sin errores", "Enciende el LMI. Debe calibrar sin códigos de error y mostrar la configuración correcta.", "Foto de la pantalla del LMI", true],
      ["Seguridad", "Alarma de reversa, luces y torreta", "Activa la reversa y la torreta; verifica luces de trabajo.", "Foto con la torreta encendida", false],
      ["Seguridad", "Extintor vigente y cargado", "Aguja del manómetro en verde y etiqueta de recarga vigente.", "Foto del manómetro del extintor", false],
      ["Accesorios", "Tapetes, calzas y señalamientos a bordo", "4 tapetes de estabilizadores, 2 calzas, conos y cinta.", "Foto de los accesorios", false],
    ],
  },
  {
    key: "rt_titan",
    name: "Revisión total · Titán",
    kind: "revision_total",
    crane_types: ["camion_grua"],
    description: "Revisión completa de camión con grúa articulada (Titán).",
    items: [
      ["Documentación", "Tarjeta de circulación, póliza y permiso SCT", "Originales a bordo y legibles; permiso SCT de carga especializada vigente.", "Una foto de cada documento", true],
      ["Documentación", "Engomado de verificación vigente", "Holograma visible en el parabrisas.", "Foto del holograma", false],
      ["Grúa articulada", "Brazos sin fisuras ni deformaciones", "Despliega la grúa por completo; revisa uniones y soldaduras.", "Foto de la grúa desplegada", true],
      ["Grúa articulada", "Pernos y bujes sin holgura", "Mueve cada articulación sin carga; no debe haber golpeteo.", "Foto de las articulaciones principales", false],
      ["Grúa articulada", "Cilindros de articulación sin fugas", "Sin escurrimientos en vástagos ni sellos.", "Foto de los cilindros", true],
      ["Grúa articulada", "Mandos y control remoto responden", "Prueba todos los movimientos desde palancas y control remoto, incluido el paro de emergencia.", "Foto del control remoto", true],
      ["Grúa articulada", "Gancho y pestillo", "Pestillo cierra solo, gancho sin apertura.", "Foto del gancho", true],
      ["Grúa articulada", "Tabla de cargas visible", "La tabla de cargas debe estar legible junto a los mandos.", "Foto de la tabla de cargas", false],
      ["Camión", "Nivel de aceite de motor", "Motor apagado, lee la bayoneta.", "Foto de la bayoneta", false],
      ["Camión", "Presión de aire y frenos", "La presión debe llegar a 120 psi y no caer con el motor apagado.", "Foto del manómetro de aire", true],
      ["Camión", "Llantas y birlos", "Sin cortes, desgaste parejo; birlos completos y apretados.", "Foto de las llantas de cada lado", false],
      ["Camión", "Lectura de odómetro / horómetro", "Escribe la lectura del horómetro de la toma de fuerza.", "Foto del horómetro", false, "numero", "h", 0, 50000],
      ["Seguridad", "Estabilizadores extienden y sostienen", "Extiende ambos lados; no deben bajar por sí solos.", "Foto de los estabilizadores de cada lado", true],
      ["Seguridad", "Luces, torreta y alarma de reversa", "Prueba todas las luces exteriores.", "Foto con la torreta encendida", false],
      ["Seguridad", "Extintor y conos", "Extintor con carga vigente y 4 conos a bordo.", "Foto del extintor y conos", false],
    ],
  },
  {
    key: "rt_armable",
    name: "Revisión total · Armable en sitio",
    kind: "revision_total",
    crane_types: ["grua_armable"],
    description: "Revisión de componentes antes de transportar y armar en obra (torre o celosía).",
    items: [
      ["Documentación", "Certificación vigente y manual de montaje", "Certificación de tercero acreditado y manual del fabricante en la caja de documentos.", "Foto de la certificación", true],
      ["Estructura", "Tramos de torre / celosía sin fisuras", "Revisa cada tramo: cordones, diagonales y soldaduras. Marca con gis los dudosos.", "Fotos de los tramos (agrega una por cada tramo dudoso)", true],
      ["Estructura", "Pasadores y tornillería de unión completos", "Cuenta pasadores, tornillos y seguros por tramo. Deben estar completos y sin daño en la rosca.", "Foto del lote de tornillería", true],
      ["Estructura", "Contrapesos y lastre completos", "Verifica cantidad y peso de cada bloque contra el manual.", "Foto de los contrapesos", true],
      ["Mecanismos", "Cable de elevación y de carro", "Sin hilos rotos, aplastamiento ni corrosión.", "Foto del cable en el tambor", true],
      ["Mecanismos", "Freno de giro y de elevación", "Prueba en banco: el freno sostiene sin patinar.", "Foto del mecanismo de freno", true],
      ["Mecanismos", "Nivel de aceite en reductores", "Revisa mirillas de reductores de elevación, giro y carro.", "Foto de las mirillas", false],
      ["Seguridad", "Limitadores de carga y momento", "Prueba de funcionamiento de limitadores y finales de carrera.", "Foto del tablero de limitadores", true],
      ["Seguridad", "Anemómetro funcionando", "El anemómetro gira libre y marca en la cabina/tablero.", "Foto del anemómetro", false],
      ["Eléctrico", "Tablero eléctrico y cableado", "Sin cables pelados, conectores completos, paro de emergencia funcional.", "Foto del tablero abierto", true],
      ["Accesorios", "Eslingas y grilletes de montaje", "Cuenta y revisa etiquetas de capacidad legibles.", "Foto de los accesorios de montaje", false],
      ["Registro", "Lectura de horómetro", "Escribe la lectura del horómetro del tablero.", "Foto del horómetro", false, "numero", "h", 0, 80000],
    ],
  },
  {
    key: "post_renta",
    name: "Recepción post-renta",
    kind: "post_renta",
    crane_types: ["grua_movil", "camion_grua", "grua_armable"],
    description: "Recepción al regresar de renta: daños, consumos y accesorios.",
    items: [
      ["Recepción", "Daños visibles nuevos", "Rodea la unidad y compara contra la salida. Describe cualquier golpe nuevo.", "Una foto de cada uno de los 4 lados", true],
      ["Recepción", "Fugas nuevas", "Revisa piso bajo la unidad y zonas hidráulicas.", "Foto bajo la unidad", true],
      ["Recepción", "Lectura de horómetro", "Escribe la lectura al regresar.", "Foto del horómetro", false, "numero", "h", 0, 80000],
      ["Recepción", "Nivel de combustible (%)", "Escribe el porcentaje del tanque.", "Foto del indicador", false, "numero", "%", 0, 100],
      ["Recepción", "Accesorios completos", "Eslingas, grilletes, tapetes y conos devueltos.", "Foto de los accesorios", false],
    ],
  },
];
