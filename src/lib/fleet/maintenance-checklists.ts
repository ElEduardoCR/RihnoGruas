import type { MaintenanceChecklistStep, MaintenancePlan } from "./types";

/** Changing a procedure creates a new version; completed inspections keep their snapshot. */
export const CHECKLIST_VERSION = "2026-10-27.1";

type StepDefinition = {
  section: string;
  title: string;
  instructions: string;
  procedure_steps: string[];
  photo_requirements: string[];
  photo_hint: string;
  critical: boolean;
  topic: string;
  response_type?: MaintenanceChecklistStep["response_type"];
};

function step(
  section: string,
  title: string,
  instructions: string,
  procedure_steps: string[],
  photo_requirements: string[],
  photo_hint: string,
  topic: string,
  critical = true,
): StepDefinition {
  return { section, title, instructions, procedure_steps, photo_requirements, photo_hint, topic, critical };
}

// These are original inspection prompts, not a replacement or transcription of an OEM manual.
// Model-specific measurements, fluids, dismantling and tests require the verified unit manual.
const steps = {
  safe: step("Preparación", "Asegurar la unidad y el área", "Aplica el procedimiento de estacionamiento, apoyo y aislamiento del manual confirmado. El personal debe estar autorizado para el trabajo.", [
    "Ubica la unidad en el área de mantenimiento y delimita el acceso; retira la carga y deja los implementos en la posición indicada por el fabricante.",
    "Inmoviliza la unidad y aísla las fuentes de energía según el trabajo. Comprueba ausencia de movimiento y de energía almacenada antes de tocar componentes.",
    "Si la revisión exige energizar o mover el equipo, termina primero la inspección estática y sigue exclusivamente la secuencia del manual, con el área despejada. Nunca trabajes debajo de una carga o componente sostenido solo hidráulicamente.",
  ], ["Vista general con la unidad inmovilizada, área delimitada y apoyos o bloqueo visibles."], "Una vista general debe mostrar las condiciones reales de trabajo antes de intervenir.", "Estacionamiento, seguridad durante mantenimiento y aislamiento de energía"),

  readings: { ...step("Registro inicial", "Registrar las lecturas de servicio", "Identifica a qué sistema pertenece cada lectura. No sustituyas un horómetro por el odómetro ni estimes valores faltantes.", [
    "Localiza el odómetro y los horómetros que efectivamente tenga la unidad.",
    "Anota cada valor con su unidad y etiqueta: chasis, superestructura, motor o equipo; registra «No equipado» cuando corresponda.",
    "Relaciona las lecturas con el último servicio disponible y anota cualquier indicador ilegible o sustituido.",
  ], ["Tablero o contador con lectura e identificación del sistema; agrega fotos si hay varios contadores."], "La lectura permite asociar este trabajo con el uso real; añade una imagen por contador que no aparezca en la primera.", "Instrumentación e historial de mantenimiento", false), response_type: "texto" },

  levels: step("Inspección inicial", "Revisar niveles y fugas visibles", "Usa la posición, temperatura y tiempo de espera del manual de cada depósito. No abras un circuito caliente o presurizado.", [
    "Identifica los depósitos y puntos de lectura accesibles de la unidad; distingue aceite de motor, refrigerante e hidráulico cuando existan.",
    "Comprueba cada nivel con el procedimiento correspondiente y registra el resultado; no rellenes con un producto sin especificación confirmada.",
    "Busca manchas en el suelo y humedad en conexiones; registra origen y ubicación de cualquier fuga, sin buscarla con la mano.",
  ], ["Puntos de lectura revisados, con marcas visibles; agrega una imagen por depósito adicional.", "Parte inferior o suelo de la unidad, mostrando presencia o ausencia de fugas."], "Se requiere evidencia del nivel y del área de fugas porque son comprobaciones distintas.", "Comprobación de niveles y fugas"),

  access: step("Seguridad de uso", "Revisar accesos y protecciones", "Revisa únicamente desde accesos seguros; no subas a la pluma ni retires protecciones para conseguir una foto.", [
    "Comprueba escalones, pasamanos, plataformas y superficies antideslizantes accesibles.",
    "Revisa que guardas y tapas estén presentes y sujetas; detecta piezas sueltas, bordes dañados u obstrucciones.",
    "Comprueba la legibilidad de las advertencias correspondientes a las zonas inspeccionadas; registra las faltantes.",
  ], ["Acceso principal y pasamanos.", "Guardas y señalización de la zona de trabajo."], "Las dos vistas muestran el acceso del operador y la protección frente a partes móviles.", "Accesos, guardas y avisos"),

  lights: step("Seguridad de uso", "Comprobar luces y señalización", "Realiza la comprobación eléctrica desde una posición segura y con el área despejada.", [
    "Activa las luces y señales que equipa la unidad conforme al manual: posición, freno, giro, reversa y trabajo cuando corresponda.",
    "Revisa lentes, soportes, reflectantes y conexiones visibles; registra cada punto que no funcione.",
    "Verifica limpiaparabrisas, lavador y espejos cuando existan, sin mantener la prueba si la visibilidad o el equipo presentan un defecto.",
  ], ["Luces y señales delanteras en prueba.", "Luces y señales posteriores en prueba."], "Las vistas de ambos extremos permiten identificar qué grupos se comprobaron.", "Luces, visibilidad y equipo de seguridad"),

  restraints: step("Seguridad de uso", "Revisar asiento, cinturón y puesto del operador", "Una foto documenta el estado visible; el cierre del cinturón y los ajustes deben comprobarse físicamente.", [
    "Inspecciona cinta, anclajes y hebilla del cinturón; comprueba que cierre y libere correctamente según el manual.",
    "Revisa fijación del asiento, ajustes, espejos y visibilidad del puesto.",
    "Registra testigos anormales, alarmas o daños que puedan afectar la operación.",
  ], ["Asiento, cinturón extendido, hebilla y anclajes visibles."], "La imagen debe mostrar la cinta y el cierre, no solo el interior de la cabina.", "Asiento, cinturón y puesto del operador"),

  tires: step("Rodaje", "Inspeccionar neumáticos por posición", "Usa presión y límites de desgaste de la etiqueta y manual aplicables a la configuración real. No se incluyen valores genéricos.", [
    "Recorre todas las posiciones y anota identificación, cortes, abultamientos, objetos, desgaste irregular y condición de la válvula.",
    "Mide presión bajo las condiciones indicadas en el manual y registra cada lectura junto con su valor de referencia.",
    "Comprueba compatibilidad del montaje y, en ruedas dobles, la condición visible del conjunto; documenta todos los ejes adicionales.",
  ], ["Neumáticos del sector delantero izquierdo, incluyendo costado y banda.", "Neumáticos del sector delantero derecho, incluyendo costado y banda.", "Neumáticos del sector posterior izquierdo; agrega fotos para los ejes adicionales.", "Neumáticos del sector posterior derecho; agrega fotos para los ejes adicionales."], "Cuatro vistas cubren ambos lados y extremos; cada eje adicional y cada defecto necesita una foto identificada.", "Neumáticos: inspección, presión y desgaste"),

  wheels: step("Rodaje", "Revisar ruedas, cubos y sellos", "No reaprietes fijaciones ni levantes la unidad sin el procedimiento, equipo y valores correctos.", [
    "Inspecciona rines, fijaciones y marcas de desplazamiento en todas las posiciones accesibles.",
    "Busca fugas de sellos, daño y calentamiento previamente reportado en cubos o rodamientos; no toques componentes calientes.",
    "Si el manual exige medir juego o torque, registra herramienta, resultado y criterio; deriva la intervención a personal capacitado.",
  ], ["Ruedas y cubos del lado izquierdo, con fijaciones visibles.", "Ruedas y cubos del lado derecho, con fijaciones visibles."], "Los dos lados documentan conjuntos diferentes; agrega detalles por posición cuando el conjunto no sea visible.", "Ruedas, rodamientos y sellos"),

  brakes: step("Frenos", "Inspeccionar el sistema de frenos", "Sigue el procedimiento específico del sistema instalado. No realices una prueba de circulación si existe una falla previa.", [
    "Identifica el tipo de freno y revisa líneas, uniones y componentes accesibles por eje, buscando fugas, roce, daño o piezas sueltas.",
    "Comprueba nivel o indicadores que correspondan; si se requieren mediciones de desgaste, usa los puntos y límites del manual y registra los valores.",
    "Comprueba el freno de servicio únicamente con la prueba autorizada para la unidad; registra resultado y cualquier desvío, ruido o respuesta anormal.",
  ], ["Componentes y conductos de freno del conjunto delantero o primer eje.", "Componentes y conductos de freno del conjunto posterior; agrega fotos por eje adicional."], "La revisión debe distinguir los conjuntos de freno; una foto del pedal no acredita su estado.", "Sistema de frenos: inspección y prueba funcional"),

  parking: step("Frenos", "Verificar el freno de estacionamiento", "El método de retención depende de la unidad; conserva los medios de seguridad indicados por el fabricante.", [
    "Inspecciona mando, cableado o circuito del freno de estacionamiento según configuración.",
    "Aplica la prueba indicada en el manual dentro de un área controlada y con personal autorizado.",
    "Registra si el mando y la indicación corresponden con el resultado; ante pérdida de retención, inmoviliza y reporta.",
  ], ["Mando e indicador del freno de estacionamiento durante la comprobación."], "Documenta la configuración y la indicación; el resultado de retención se anota en la respuesta.", "Freno de estacionamiento"),

  air: step("Frenos", "Revisar circuito neumático, depósitos y secador", "Solo aplica si equipa sistema neumático. La presión de prueba, pérdidas admisibles y drenado deben venir de su manual.", [
    "Identifica depósitos, secador, conexiones y manómetros; revisa fijaciones, roce y daños visibles.",
    "Ejecuta las comprobaciones de presión, alarma y pérdida de aire prescritas; registra lecturas y límites utilizados sin aflojar una conexión presurizada.",
    "Realiza drenado o servicio del secador solo cuando lo indique el programa confirmado. Si no equipa, registra esa configuración y su evidencia.",
  ], ["Depósitos, secador y conexiones accesibles, o evidencia de que no equipa.", "Manómetros e indicadores durante la prueba; si no equipa, identificación del sistema de freno instalado."], "Se documenta tanto el circuito físico como la lectura utilizada para juzgarlo.", "Sistema neumático y secador de aire"),

  steering: step("Dirección", "Revisar dirección y terminales", "No ajustes holguras a criterio; compara únicamente con el procedimiento y límites del fabricante.", [
    "Inspecciona terminales, barras, uniones, guardapolvos y fijaciones accesibles de la dirección.",
    "Revisa fugas y el nivel del circuito de asistencia cuando exista, con el método especificado.",
    "Comprueba respuesta o juego mediante la prueba del manual y registra las mediciones; evita puntos de atrapamiento.",
  ], ["Conjunto de dirección del lado izquierdo.", "Conjunto de dirección del lado derecho y conexiones de asistencia accesibles."], "Ambos lados pueden presentar daños distintos; documenta cada conjunto dirigido adicional.", "Dirección, terminales y asistencia"),

  suspension: step("Suspensión", "Revisar suspensión y sus soportes", "La configuración puede incluir resortes, bolsas de aire u otros elementos; identifica lo realmente instalado.", [
    "Recorre cada eje y revisa elementos elásticos, amortiguadores, bujes y soportes visibles.",
    "Busca desplazamiento, roturas, fugas, contacto anormal y fijaciones faltantes, sin colocarte bajo la unidad sin soportes certificados.",
    "Registra juego o desgaste que requiera medición y realiza dicha comprobación solo conforme al manual.",
  ], ["Suspensión delantera o del primer eje, con soportes visibles.", "Suspensión posterior, con detalle de los elementos elásticos."], "Las vistas separan los conjuntos de suspensión; añade fotos si hay otros ejes.", "Suspensión, bujes y soportes"),

  frame: step("Estructura", "Inspeccionar bastidor y subchasis", "Limpia solo lo necesario para observar sin eliminar indicios de daño; no sueldes, perfores ni endereces para cerrar la revisión.", [
    "Recorre ambos largueros y travesaños accesibles; busca grietas, corrosión, dobleces, abolladuras o pérdida de elementos.",
    "Revisa uniones del bastidor con el subchasis, soportes y equipo montado cuando exista.",
    "Ubica cada hallazgo por lado y posición; toma un detalle adicional y solicita evaluación técnica antes de liberar un daño estructural.",
  ], ["Larguero y uniones del lado izquierdo.", "Larguero y uniones del lado derecho."], "Los dos lados son superficies independientes; agrega acercamientos de cualquier discontinuidad.", "Inspección de bastidor, subchasis y uniones"),

  welds: step("Estructura", "Revisar soldaduras y zonas de concentración de esfuerzo", "Es una inspección visual. No acredita la integridad interna ni sustituye ensayos indicados por el fabricante.", [
    "Identifica en el manual o boletín las uniones y zonas que deben revisarse para esta serie.",
    "Observa el contorno de las soldaduras y el material próximo con iluminación adecuada; busca fisuras, corrosión, desprendimiento de pintura o deformación.",
    "Relaciona cada hallazgo con una vista general y un acercamiento; cualquier sospecha de grieta requiere evaluación técnica, no una reparación improvisada.",
  ], ["Ubicación general de las uniones estructurales revisadas.", "Acercamiento de la unión de mayor desgaste o de la zona señalada en el manual."], "Una vista ubica la unión y la otra permite examinar su superficie.", "Inspección visual de soldaduras y acero estructural"),

  mount: step("Estructura", "Revisar anclaje de la grúa al chasis", "No apliques valores de apriete de otro modelo; cualquier reapriete requiere especificación y secuencia de esta instalación.", [
    "Localiza base, subchasis, soportes y elementos de fijación del equipo.",
    "Inspecciona ambos lados buscando separación, desplazamiento, corrosión, deformación o elementos faltantes.",
    "Si se prescribe comprobación de torque, registra método, valor de referencia y resultado; reporta cualquier movimiento del anclaje.",
  ], ["Anclajes y soporte de la grúa del lado izquierdo.", "Anclajes y soporte de la grúa del lado derecho."], "La fijación debe quedar visible en ambos lados de la instalación.", "Base, subbase y fijaciones al vehículo"),

  upper: step("Estructura", "Inspeccionar estructura giratoria y soportes", "Revisa las zonas que identifica el manual de esta grúa sin atribuirle diagramas de otra variante.", [
    "Identifica la plataforma o superestructura, soportes de pluma y puntos de unión que deban observarse.",
    "Busca grietas, deformación, corrosión, piezas faltantes y daños de las soldaduras visibles.",
    "Revisa fijaciones y retención del contrapeso si equipa; documenta cada defecto para evaluación especializada.",
  ], ["Superestructura y soporte de pluma del lado izquierdo.", "Superestructura y soporte de pluma del lado derecho."], "Ambas vistas permiten revisar caras y uniones que una sola foto oculta.", "Inspección de la superestructura"),

  boom: step("Pluma", "Inspeccionar las caras y uniones de la pluma", "Inspecciona desde accesos seguros en las posiciones autorizadas. No extiendas ni eleves la pluma para fotografiarla sin la secuencia del manual.", [
    "Identifica tipo de pluma, secciones y accesorios instalados.",
    "Revisa caras visibles, uniones y zonas señaladas en el manual buscando golpes, abolladuras, dobleces, grietas o corrosión.",
    "Registra cada defecto por sección y cara; detén el uso ante sospecha de daño estructural y solicita evaluación.",
  ], ["Pluma y uniones desde el lado izquierdo.", "Pluma y uniones desde el lado derecho.", "Zona de base y apoyo de la pluma.", "Cabeza de pluma y extremo visible desde una posición segura."], "Las cuatro vistas cubren lados, base y cabeza; no es necesario acercarse a una zona insegura.", "Inspección de la pluma principal"),

  lattice: step("Extensión", "Inspeccionar extensión o plumín instalado", "Solo aplica si equipa. Confirma modelo de accesorio y compatibilidad; no despliegues un plumín sin procedimiento autorizado.", [
    "Identifica extensión, plumín y uniones instaladas o almacenadas en la unidad.",
    "Revisa cordones, diagonales o secciones, soldaduras, pasadores y retenes visibles, según el tipo real.",
    "Registra deformación, grieta o piezas faltantes; si no equipa, documenta la configuración y no atribuyas una extensión a la grúa.",
  ], ["Vista general de la extensión y sus secciones, o zona de montaje sin accesorio.", "Uniones y pasadores de la extensión, o identificación de la configuración sin extensión."], "Se distinguen el cuerpo del accesorio y sus conexiones; la ausencia también debe quedar sustentada.", "Inspección de extensión y accesorios de pluma"),

  pins: step("Articulaciones", "Revisar pasadores, retenes y bujes", "No retires pasadores ni sometas la articulación a carga para estimar juego.", [
    "Localiza articulaciones y retenes de la pluma, soporte y accesorios indicados en el manual.",
    "Revisa presencia, correcta retención, corrosión, marcas de desplazamiento y desgaste visible.",
    "Si se requiere medir juego, registra el punto y usa el método y límite documentados; deriva cualquier falta de retención a reparación.",
  ], ["Pasadores y retenes de la articulación de base.", "Pasadores y retenes de la articulación o unión siguiente."], "Dos articulaciones representan puntos de carga diferentes; agrega fotos de las demás previstas por el manual.", "Pasadores, retenes, articulaciones y bujes"),

  pads: step("Telescopaje", "Revisar patines y superficies de deslizamiento", "No engrases una superficie por apariencia: algunos patines requieren un tratamiento específico o no admiten grasa.", [
    "Identifica en el manual los patines accesibles y la posición segura de inspección.",
    "Revisa desgaste, fisuras, fijaciones y marcas de contacto en las superficies; no ajustes separaciones sin el método correspondiente.",
    "Registra mediciones prescritas y compara con el límite de esa serie; limpia o lubrica únicamente donde lo indique el fabricante.",
  ], ["Patines y superficie de una cara accesible de la pluma.", "Patines y superficie de la cara opuesta accesible."], "Se necesitan caras diferentes para observar desgaste desigual y contacto.", "Patines de desgaste y superficies deslizantes"),

  extension: step("Telescopaje", "Revisar mecanismo de extensión y retracción", "Identifica si usa cables, cadenas u otro mecanismo; no ajustes tensión con criterios de otra grúa.", [
    "Confirma en el manual el mecanismo instalado y los accesos de inspección autorizados.",
    "Revisa elementos accesibles, anclajes, guías y retenciones buscando desgaste, roce, corrosión o daño.",
    "Realiza una prueba de extensión o medición solo si el manual confirmado la prescribe y el equipo superó la revisión estática; registra resultado y referencia.",
  ], ["Mecanismo y guías accesibles de extensión.", "Anclaje o retención del mecanismo, sin retirar una guarda en servicio."], "La guía y el anclaje tienen modos de deterioro diferentes.", "Mecanismo de telescopaje, extensión y retracción"),

  outriggers: step("Estabilización", "Revisar estabilizadores y placas de apoyo", "Comprueba cada apoyo que equipe la unidad. Si no equipa estabilizadores, registra «No equipado, confirmado en manual» y documenta la configuración desde los cuatro sectores. El despliegue o prueba requiere el procedimiento y superficie de apoyo del manual.", [
    "Revisa vigas, cajas, pasadores y seguros visibles, buscando deformación, daños o piezas faltantes.",
    "Inspecciona cilindros y placas de apoyo, incluyendo unión y retención; identifica cada posición.",
    "Comprueba funcionamiento o retención solo conforme al procedimiento autorizado y sin personas en el recorrido; agrega fotos si hay apoyos adicionales.",
  ], ["Apoyos del sector delantero izquierdo, o configuración si no equipa.", "Apoyos del sector delantero derecho, o configuración si no equipa.", "Apoyos del sector posterior izquierdo, o configuración si no equipa.", "Apoyos del sector posterior derecho, o configuración si no equipa."], "Cada posición soporta carga y requiere evidencia propia; documenta la configuración real si tiene menos de cuatro apoyos.", "Estabilizadores, placas de apoyo y retención"),

  transport: step("Transporte", "Revisar seguros y posiciones de transporte", "La posición de traslado y sus cierres dependen de la configuración autorizada.", [
    "Identifica en el manual los seguros de pluma, gancho, accesorios, apoyos y componentes desmontables que correspondan.",
    "Revisa presencia y estado de pasadores, retenes y apoyos de transporte.",
    "Comprueba que cada elemento quede en su posición final indicada; registra cualquier seguro que no pueda cerrar correctamente.",
  ], ["Pluma o implemento con su seguro de transporte.", "Apoyos y accesorios asegurados para traslado."], "Las vistas acreditan cierres de sistemas diferentes antes del traslado.", "Posición y seguros de transporte"),

  rope: step("Izaje", "Inspeccionar cable y terminales", "El criterio de descarte depende del cable y del manual. No uses la mano para detectar alambres rotos ni inspecciones cable en movimiento.", [
    "Identifica cable y terminales; consulta el recorrido, método de inspección y criterios aplicables.",
    "Examina el tramo exigido por el manual en condiciones seguras, buscando alambres rotos, corrosión, aplastamientos, cocas y alteraciones visibles.",
    "Revisa terminales y retenciones, anota ubicación de hallazgos y mediciones prescritas; cualquier duda requiere evaluación de personal calificado.",
  ], ["Recorrido del cable o tramo revisado, mostrando su ubicación.", "Acercamiento del cable y de su terminal; agrega detalles de cualquier deterioro."], "Una foto sitúa el tramo y otra permite observar el cable y su terminación.", "Cable de izaje: inspección y terminales"),

  hook: step("Izaje", "Revisar gancho, pestillo y bloque", "No apliques porcentajes o ángulos de descarte de otro gancho; usa identificación y límites del componente instalado.", [
    "Identifica el gancho o bloque y revisa el cuerpo buscando grietas, deformación, corrosión o daño por calor.",
    "Comprueba presencia, cierre y estado del pestillo, además de fijaciones y giro según el manual.",
    "Registra las medidas que exija el procedimiento con su criterio; si falta retención o hay deformación, impide su uso hasta evaluación.",
  ], ["Perfil completo del gancho y bloque.", "Acercamiento de garganta, pestillo y retención."], "El perfil evidencia deformación y el acercamiento muestra el cierre de seguridad.", "Gancho, pestillo y bloque de carga"),

  sheaves: step("Izaje", "Inspeccionar poleas y guías de cable", "Mantén el cable detenido y el sistema asegurado. No introduzcas manos en ranuras o puntos de atrapamiento.", [
    "Identifica las poleas y guías de la cabeza, bloque y accesorios que deban revisarse.",
    "Observa ranuras, bridas, fijaciones y guardas buscando desgaste, fisuras o desalineación visible.",
    "Verifica asiento del cable y giro libre solo con el procedimiento seguro del manual; registra cualquier roce o bloqueo.",
  ], ["Poleas y guías de la cabeza de pluma desde acceso seguro.", "Poleas del bloque o segundo conjunto instalado."], "Los conjuntos superior e inferior trabajan de forma distinta y deben quedar identificados.", "Poleas, guías y recorrido del cable"),

  winch: step("Izaje", "Revisar tambor y cabrestante", "La comprobación del freno del cabrestante requiere el procedimiento de la grúa; no se improvisa una prueba con carga.", [
    "Inspecciona tambor, fijaciones, carcasa y guardas accesibles; busca daños o fugas.",
    "Revisa enrollado y asiento del cable con el criterio del manual, sin manipularlo en movimiento.",
    "Comprueba el freno únicamente con la prueba autorizada por el fabricante y personal competente; registra método y resultado o la imposibilidad de efectuarla.",
  ], ["Tambor y distribución del cable detenido.", "Carcasa, fijaciones y zona de freno o reductor accesible."], "Una imagen revisa el enrollado y la otra documenta el mecanismo y posibles fugas.", "Cabrestante, tambor y freno de izaje"),

  ropeLubrication: step("Izaje", "Verificar lubricación del cable", "El lubricante y método deben ser compatibles con el cable instalado; no apliques un producto genérico.", [
    "Confirma si corresponde lubricar el cable en este servicio y cuál es el producto aprobado.",
    "Inspecciona contaminación y condición superficial; prepara el cable solo como indique el procedimiento.",
    "Si procede, realiza la lubricación con el equipo inmovilizado y registra producto, zonas atendidas y resultado; si no procede, justifica según manual e historial.",
  ], ["Estado del cable antes del servicio.", "Estado del cable después y etiqueta del producto; si no se intervino, punto revisado y criterio documentado."], "La comparación evita confundir una inspección con una lubricación realizada.", "Lubricación y conservación del cable", false),

  slew: step("Giro", "Revisar corona, reductor y fijaciones de giro", "No ajustes juego ni torque sin los valores y secuencia del manual del conjunto instalado.", [
    "Inspecciona corona, reductor, soportes y tornillería visibles, con el giro asegurado.",
    "Busca fugas, daño, desplazamiento o contaminación; revisa nivel del reductor si el procedimiento lo contempla.",
    "Mide juego o realiza prueba de giro solo cuando la documentación y condiciones de seguridad lo permitan; registra resultado.",
  ], ["Zona accesible de corona y sus fijaciones.", "Reductor, conexiones y zona de sellos."], "Se separan unión estructural y mecanismo motriz, ambos relevantes para el giro.", "Corona de giro, reductor y fijaciones"),

  grease: step("Lubricación", "Atender los puntos de engrase del manual", "La lista de puntos, producto y frecuencia debe ser de la serie y configuración reales.", [
    "Marca en el esquema del manual los puntos que corresponden al servicio y confirma el lubricante.",
    "Limpia las conexiones y lubrica únicamente con el método y cantidad prescritos; no fuerces un punto obstruido.",
    "Registra los puntos atendidos y los inaccesibles u obstruidos; limpia el exceso donde indique el procedimiento.",
  ], ["Esquema aplicable y puntos identificados antes del trabajo.", "Puntos atendidos y etiqueta del lubricante utilizado."], "La evidencia relaciona la ruta de engrase con el producto y el trabajo realizado.", "Tabla de lubricación y puntos de engrase", false),

  centralGrease: step("Lubricación", "Revisar engrase centralizado si equipa", "No presupongas que la unidad tiene este sistema. Verifica su marca, modelo y esquema.", [
    "Identifica bomba, depósito, líneas y distribuidores del sistema instalado, o documenta que no equipa.",
    "Comprueba nivel, fijaciones, daños, fugas y conexiones según su manual.",
    "Realiza la comprobación de alimentación a los puntos conforme al procedimiento y registra alertas o líneas sin suministro.",
  ], ["Bomba y depósito, o zona de instalación sin sistema.", "Distribuidor y líneas accesibles, o puntos de engrase manual que confirman la configuración."], "La bomba por sí sola no demuestra suministro; también se documenta la distribución.", "Sistema de lubricación centralizado", false),

  hoses: step("Hidráulico", "Inspeccionar mangueras, tuberías y conexiones", "No busques fugas con la mano ni aprietes un circuito bajo presión. Detén y aísla antes de intervenir.", [
    "Recorre visualmente los circuitos accesibles, identificando rutas y zonas de movimiento.",
    "Busca abrasión, ampollas, aplastamiento, fisuras, torceduras, fugas y abrazaderas faltantes.",
    "Registra ubicación y conexión afectada; cualquier sustitución debe respetar especificación, ruta y procedimiento del fabricante.",
  ], ["Recorrido de mangueras y tuberías del circuito principal.", "Conexiones y zonas flexibles próximas a articulaciones."], "La ruta y las conexiones presentan deterioros distintos; añade detalle de cada fuga o roce.", "Mangueras, tuberías y conexiones hidráulicas"),

  cylinders: step("Hidráulico", "Revisar cilindros, vástagos y sellos", "La inspección es estática salvo prueba expresamente indicada en el manual. No te coloques bajo un elemento sostenido por un cilindro.", [
    "Identifica cilindros de elevación, extensión, apoyos o accesorio que correspondan al alcance.",
    "Revisa vástagos y camisas visibles buscando rayas, corrosión, golpes, fugas y daños de soportes.",
    "Comprueba válvulas de retención o deriva únicamente con la prueba autorizada; registra el cilindro y resultado de cada comprobación.",
  ], ["Cilindro principal, vástago y unión accesibles.", "Sellos y conexiones de los cilindros restantes del sistema; agrega fotos por componente."], "El cuerpo y las zonas de sellado requieren acercamientos distintos.", "Cilindros hidráulicos y válvulas de retención"),

  hydraulicLevel: step("Hidráulico", "Comprobar depósito y nivel hidráulico", "La posición de cilindros y temperatura modifican la lectura; usa exclusivamente las condiciones del manual confirmado.", [
    "Identifica depósito, indicador y respiradero; confirma posición del equipo requerida para la lectura.",
    "Revisa nivel y condición visible, sin abrir un depósito caliente o presurizado.",
    "Registra resultado y especificación de cualquier producto agregado; investiga una pérdida antes de limitarte a rellenar.",
  ], ["Indicador de nivel con sus marcas y depósito identificado."], "La foto debe permitir relacionar la lectura con el depósito correcto.", "Nivel del depósito hidráulico y respiradero"),

  hydraulicFilter: step("Hidráulico", "Identificar y atender filtros hidráulicos", "El recambio depende de manual, indicador e historial. No retires un filtro de un sistema presurizado.", [
    "Identifica ubicación y referencia de filtros e indicadores; registra su condición.",
    "Si corresponde reemplazar, confirma repuesto y procedimiento, aísla y despresuriza según el manual; realiza el trabajo con control de contaminación.",
    "Verifica instalación y ausencia de fuga conforme al procedimiento. Si no corresponde cambio, registra el criterio e historial que lo sustentan.",
  ], ["Filtro instalado e indicador antes de la intervención.", "Filtro final y referencia del repuesto; si no hubo cambio, identificación legible e indicador revisado."], "Las dos imágenes distinguen identificación previa y condición final del servicio.", "Filtros del circuito hidráulico", false),

  fluidService: { ...step("Servicio de fluidos", "Documentar el servicio autorizado de fluidos", "Este paso no autoriza un recambio sin especificación. Completa el trabajo que indique el programa del manual de la unidad.", [
    "Anota sistema, fluido, especificación, cantidad prescrita, intervalo e historial que justifican el servicio; no mezcles sistemas ni productos.",
    "Realiza el recambio o toma de muestra únicamente mediante el procedimiento confirmado, con personal y medios adecuados.",
    "Registra cantidad real, repuestos, lectura de servicio y comprobación final de nivel y fugas; si no corresponde intervenir, registra motivo y próxima condición de servicio sin inventar fecha.",
  ], ["Identificación de los productos y repuestos aprobados, o referencia del criterio de no intervención.", "Nivel o indicador final del sistema atendido."], "Se documentan la especificación usada y el resultado, no solo un envase.", "Fluidos, capacidades y programa de mantenimiento", false), response_type: "texto" },

  pto: step("Accionamiento", "Revisar toma de fuerza y bomba si equipa", "No actives una PTO sin confirmar sus condiciones de uso; mantén guardas y distancia de las partes giratorias.", [
    "Identifica toma de fuerza, transmisión de accionamiento y bomba; si no equipa, registra configuración.",
    "Con el accionamiento aislado, inspecciona fijaciones, guardas, líneas y fugas visibles.",
    "Comprueba acople y funcionamiento solamente con la secuencia autorizada y el área despejada; registra ruidos, vibración o fugas.",
  ], ["Toma de fuerza y sus fijaciones, o evidencia de que no equipa.", "Bomba, conexiones y guardas del accionamiento, o configuración alternativa."], "El accionamiento y la bomba son conjuntos distintos y requieren dos vistas.", "Toma de fuerza, accionamiento y bomba"),

  controls: step("Mandos", "Comprobar mandos e indicadores", "Solo realiza pruebas de movimiento después de superar la inspección estática y confirmar el procedimiento específico.", [
    "Identifica cada puesto, mando e indicador instalado; revisa etiquetas, retorno, fijaciones y daños visibles.",
    "Ejecuta las comprobaciones prescritas sin personas en el recorrido y bajo las condiciones de configuración del manual.",
    "Registra funciones comprobadas, respuesta y cualquier comportamiento anormal; no ajustes o puentees un control para continuar.",
  ], ["Puesto principal con mandos e indicadores identificables.", "Segundo puesto o detalle de los mandos durante la comprobación."], "Las imágenes identifican los controles probados; anota el resultado porque una foto no demuestra su funcionamiento.", "Controles, instrumentación y comprobación funcional"),

  safety: step("Seguridades", "Verificar dispositivos de seguridad instalados", "No improvises pruebas de sobrecarga ni anules sensores. Usa el método específico de cada dispositivo y personal competente.", [
    "Identifica en manual y unidad los dispositivos que realmente equipa: parada, limitación, anticolisión de bloques, alarmas u otros.",
    "Inspecciona sensores, soportes, cables y señalización; compara configuración con la tabla de carga o accesorio correspondiente.",
    "Realiza cada prueba autorizada, registra resultado por dispositivo y detén la operación ante falla o prueba pendiente de un sistema crítico.",
  ], ["Dispositivos o sensores de seguridad identificados en la unidad.", "Panel o indicador del resultado de la prueba autorizada."], "Se documenta el dispositivo físico y su indicación; los resultados deben registrarse individualmente.", "Dispositivos de seguridad, limitadores y pruebas prescritas"),

  electrical: step("Eléctrico", "Inspeccionar cableado y conexiones", "Aísla el circuito según el manual antes de manipular conexiones. No rocíes equipos electrónicos ni retires sellos de calibración.", [
    "Revisa rutas accesibles de cableado, conectores, soportes y fundas.",
    "Busca roce, aislamiento dañado, conductores expuestos, corrosión, humedad o conexiones sueltas.",
    "Registra el circuito y ubicación del defecto; las reparaciones y comprobaciones eléctricas deben seguir el diagrama aplicable.",
  ], ["Ruta principal de cableado con protecciones visibles.", "Conectores o caja accesible del sistema inspeccionado."], "La ruta y el punto de conexión permiten identificar diferentes causas de fallo.", "Cableado, conectores y componentes eléctricos"),

  capacity: step("Configuración", "Verificar tabla de carga y accesorio", "Los datos reportados de capacidad no reemplazan la tabla correspondiente al número de serie y configuración.", [
    "Identifica implemento, contrapesos, pluma y apoyos que afectan la capacidad según la unidad.",
    "Comprueba que la tabla de carga o capacidad y sus advertencias correspondan a esa configuración y sean legibles.",
    "Registra incompatibilidad, documento faltante o accesorio sin identificación; no autorices izaje con una tabla de otro equipo.",
  ], ["Tabla de carga o capacidad legible y su identificación.", "Accesorio o configuración instalada en la unidad."], "Se compara el documento de capacidad con el equipo que efectivamente está montado.", "Tabla de carga, configuración y accesorios autorizados"),

  forks: step("Accesorio", "Inspeccionar horquillas o implemento", "Identifica el accesorio real. Una reparación o límite de desgaste requiere el manual de ese implemento.", [
    "Comprueba identificación y compatibilidad del implemento con la máquina y su tabla de capacidad.",
    "Revisa cada horquilla, talón, punta y retención, o los puntos equivalentes del accesorio instalado, buscando grietas, deformación y desgaste.",
    "Registra mediciones prescritas y condición de cada pieza; no endereces ni sueldes un accesorio para declararlo conforme.",
  ], ["Vista completa de ambas horquillas o del implemento instalado.", "Detalle de talones y retenciones, o puntos de carga equivalentes del accesorio."], "El conjunto y las zonas de carga deben verse por separado para comprobar integridad e identificación.", "Horquillas e implementos"),

  coupler: step("Accesorio", "Verificar acoplador y retención", "No te sitúes entre la máquina y el accesorio; sigue el procedimiento de enganche y comprobación del manual.", [
    "Inspecciona acoplador, pasadores, seguros y conexiones del implemento.",
    "Confirma retención y posición de los seguros mediante la comprobación prescrita, sin personas en la zona de movimiento.",
    "Registra juego, daño o falta de cierre; si no se puede comprobar la retención, mantén el accesorio fuera de uso.",
  ], ["Acoplador y retención del lado izquierdo.", "Acoplador y retención del lado derecho."], "Los dos lados permiten verificar la retención completa del accesorio.", "Acoplador rápido y seguro del implemento"),

  chains: step("Pluma", "Inspeccionar cadenas internas si equipa", "CAT menciona esta tarea para determinados modelos. Confirma si esta máquina usa cadenas y no extrapoles su tensión o intervalo.", [
    "Identifica el mecanismo en el manual por número de producto y registra si equipa cadenas.",
    "Revisa solo los tramos, anclajes y guías accesibles mediante el procedimiento autorizado; no desarmes la pluma para una inspección improvisada.",
    "Registra lubricación, desgaste y mediciones prescritas; cualquier ajuste o acceso interno debe hacerlo personal capacitado con el procedimiento correcto.",
  ], ["Cadena o mecanismo de extensión accesible; si no equipa, configuración identificada.", "Anclaje o guía inspeccionada, o evidencia documental de la configuración sin cadenas."], "La cadena y sus anclajes requieren evidencia diferente; no se exige entrar a un acceso inseguro.", "Cadenas internas de la pluma y anclajes"),

  rearStability: step("Estabilización", "Verificar estabilización del eje trasero si equipa", "Confirma la presencia y funcionamiento previsto del sistema para este modelo; no lo fuerces ni lo puentes.", [
    "Identifica sistema de estabilización o bloqueo del eje y sus conexiones, si existe.",
    "Inspecciona soportes, cilindros, sensores y fugas visibles en condiciones seguras.",
    "Realiza únicamente la prueba de funcionamiento del manual y registra resultado; si no equipa, documenta su configuración.",
  ], ["Eje trasero y componentes de estabilización, o vista que identifique la configuración sin sistema."], "La vista debe identificar el conjunto real de estabilización del eje.", "Sistema de estabilización del eje trasero"),

  engineIdentity: { ...step("Motor", "Confirmar motor y especificaciones de servicio", "El año o marca del chasis no identifican por sí solos el motor instalado.", [
    "Lee placa o código del motor y registra fabricante, modelo, serie y combustible; identifica cada motor si la grúa tiene más de uno.",
    "Relaciona el motor con su manual y registra especificación de aceite, filtros y servicio aplicable, sin copiar datos de otra unidad.",
    "Revisa historial y condiciones de uso, incluyendo polvo, carga y tiempo con PTO; registra lo desconocido antes de decidir recambios.",
  ], ["Placa o código legible del motor; agrega una foto por motor adicional.", "Sección aplicable de especificaciones o programa del motor identificado."], "La placa vincula el componente con el documento que define sus consumibles.", "Identificación del motor y programa de servicio", false), response_type: "texto" },

  engineOil: step("Motor", "Comprobar aceite del motor", "Respeta temperatura, posición y espera del manual. Si hay dos motores, registra cada uno por separado.", [
    "Identifica el punto de comprobación de aceite del motor y deja la unidad en las condiciones indicadas.",
    "Lee el nivel mediante el método de su manual y revisa fugas visibles en cárter, filtro y conexiones.",
    "Registra nivel, anomalías e identificación del motor; si requiere relleno, confirma primero especificación y causa de la pérdida.",
  ], ["Lectura de aceite con marcas o indicador visibles; agrega imagen por cada motor adicional."], "La imagen debe mostrar la lectura real y permitir identificar el motor revisado.", "Comprobación del aceite del motor"),

  oilChange: step("Motor", "Realizar cambio de aceite y filtro cuando corresponda", "Solo procede con especificación, repuesto e intervalo confirmados. No resetees un recordatorio si el servicio no se realizó.", [
    "Confirma vencimiento o condición de recambio con el historial y manual; registra producto y referencia de filtro aprobados.",
    "Realiza el cambio siguiendo el procedimiento del motor identificado, incluyendo aislamiento, drenaje, montaje y disposición del aceite usado.",
    "Comprueba nivel y ausencia de fugas con la secuencia del fabricante; registra cantidad real, lectura y, si aplica, restablecimiento del indicador. Si no corresponde cambiar, justifica con historial y manual.",
  ], ["Filtro y zona del motor antes del servicio.", "Etiqueta del aceite y referencia del filtro utilizado; si no hubo cambio, criterio de servicio documentado.", "Filtro instalado y lectura final de aceite."], "Las tres evidencias relacionan estado inicial, consumibles correctos y resultado final.", "Cambio de aceite y filtro del motor", false),

  airFilter: step("Motor", "Revisar admisión y filtro de aire", "No limpies un elemento con aire comprimido o solvente salvo autorización explícita del fabricante.", [
    "Inspecciona entrada, ductos, abrazaderas, carcasa e indicador de restricción si equipa.",
    "Comprueba el elemento con el método del manual evitando introducir polvo al motor; registra daño, contaminación o restricción.",
    "Sustituye solo cuando corresponda y con la referencia correcta; comprueba sellado y cierre de carcasa.",
  ], ["Admisión, carcasa e indicador antes de la revisión.", "Elemento y sellado o carcasa final; identifica el repuesto si se cambió."], "Se documentan el recorrido del aire y el resultado de la revisión del elemento.", "Admisión y filtro de aire", false),

  fuel: step("Motor", "Inspeccionar combustible y separador si equipa", "No abras líneas presurizadas de inyección ni drenes combustible cerca de fuentes de ignición.", [
    "Identifica sistema de combustible, filtros y separador de agua cuando exista.",
    "Revisa líneas, conexiones, soportes y señales de fuga; comprueba el indicador del separador según el manual.",
    "Realiza drenado o recambio únicamente si procede y mediante la secuencia prescrita; registra producto, repuesto y comprobación final.",
  ], ["Líneas y conexiones de combustible accesibles.", "Filtro o separador y su identificación, según equipamiento."], "Las líneas y el filtrado requieren vistas diferentes para identificar fugas y componentes.", "Circuito de combustible, filtros y separador"),

  ignition: step("Motor", "Revisar encendido según motorización", "Solo aplica al sistema efectivamente instalado. No presupongas bujías, cables o intervalos por el nombre del vehículo.", [
    "Confirma motor y tipo de encendido o sistema equivalente en el manual.",
    "Inspecciona componentes y conexiones accesibles; registra contaminación, aislamiento dañado o síntomas reportados.",
    "Mide, diagnostica o sustituye componentes solo con el procedimiento y especificaciones correctos; documenta si no aplica a esa motorización.",
  ], ["Componentes de encendido instalados o identificación del sistema alternativo.", "Conexiones y referencia del componente revisado o sustituido."], "La evidencia identifica el sistema real y la pieza examinada.", "Encendido y bujías según motor", false),

  cabinFilter: step("Cabina", "Revisar filtro de cabina si equipa", "Confirma ubicación y presencia en el manual; no desmontes piezas siguiendo instrucciones de otro modelo.", [
    "Identifica el alojamiento y verifica que la unidad equipe filtro de cabina.",
    "Revisa suciedad, daño y orientación mediante el procedimiento indicado.",
    "Limpia el alojamiento o sustituye el filtro solo como prescribe el fabricante; registra referencia y cierre final, o ausencia confirmada.",
  ], ["Alojamiento y elemento revisado, o evidencia de que no equipa."], "La foto identifica el elemento real o la configuración que explica su ausencia.", "Filtro de aire de cabina", false),

  coolant: step("Enfriamiento", "Comprobar refrigerante y depósito", "No abras el tapón con el circuito caliente o presurizado. No mezcles refrigerantes por semejanza de color.", [
    "Identifica depósito y condiciones de lectura en el manual del motor.",
    "Comprueba nivel y condición visible con el motor en la condición prescrita; busca fugas en depósito, tapón y conexiones.",
    "Registra resultado; cualquier relleno, prueba o recambio requiere especificación y procedimiento confirmado.",
  ], ["Depósito identificado y nivel de refrigerante con marcas visibles."], "La foto debe permitir leer el nivel sin abrir un sistema caliente.", "Nivel y servicio del refrigerante"),

  radiator: step("Enfriamiento", "Revisar radiador, rejillas y mangueras", "Permite que el sistema alcance una condición segura y aísla ventiladores según el manual antes de acercarte.", [
    "Inspecciona rejillas, radiador e intercambiadores accesibles por ambos lados posibles.",
    "Busca obstrucciones, aletas dañadas, fugas, roce y deterioro de mangueras o abrazaderas.",
    "Limpia solo con el método autorizado que no dañe aletas ni electrónica; registra condición final y reparaciones pendientes.",
  ], ["Radiador y rejillas antes de la revisión o limpieza.", "Mangueras, conexiones y condición final del área atendida."], "Las fotos documentan obstrucción y conexiones, además del resultado cuando hubo limpieza.", "Radiador, intercambiadores y mangueras", false),

  belts: step("Motor", "Inspeccionar bandas de accesorios", "Revisa con el motor detenido y aislado. Este paso no identifica ni autoriza un cambio de distribución.", [
    "Localiza las bandas de accesorios y su ruta en el motor identificado.",
    "Inspecciona grietas, bordes, desgaste, contaminación y condición visible de poleas y tensor.",
    "Mide tensión o realiza sustitución únicamente con método, herramienta y límites del manual; registra resultado.",
  ], ["Ruta de la banda y poleas accesibles.", "Detalle de banda y tensor en la zona de mayor desgaste."], "La ruta permite identificar el circuito y el acercamiento muestra la condición de desgaste.", "Bandas de accesorios y tensores", false),

  battery: step("Eléctrico", "Revisar batería y terminales", "Evita cortocircuitos y fuentes de ignición; cualquier desconexión o prueba debe seguir el manual del vehículo.", [
    "Inspecciona sujeción, carcasa, terminales y cables sin apoyar herramientas sobre los polos.",
    "Busca corrosión, fuga, daño o aislamiento suelto; identifica el tipo de batería antes de cualquier servicio.",
    "Realiza limpieza o prueba solo con el procedimiento correcto y registra resultado y estado final.",
  ], ["Batería y sujeción completa.", "Terminales y cables con estado visible."], "La fijación y las conexiones son comprobaciones independientes.", "Batería, sujeción y terminales", false),

  transmission: step("Transmisión", "Revisar transmisión o transeje", "Confirma tipo y modelo: no todos permiten comprobar nivel de la misma manera ni con el mismo fluido.", [
    "Identifica transmisión o transeje y su procedimiento de comprobación.",
    "Revisa carcasa, soportes, líneas y sellos accesibles buscando fugas o daños.",
    "Comprueba nivel o condición solo como lo prescribe el manual y registra resultado; no abras tapones sin saber la condición y procedimiento requeridos.",
  ], ["Transmisión o transeje identificado con carcasa y conexiones visibles.", "Punto de lectura o sellos revisados conforme al procedimiento."], "Se registra tanto el conjunto real como el punto usado para evaluarlo.", "Transmisión o transeje: fugas y nivel"),

  clutch: step("Transmisión", "Revisar embrague y mandos si equipa", "Identifica si usa embrague y el tipo de accionamiento; no ajustes recorrido sin la especificación correcta.", [
    "Revisa pedal, varillaje, cable o circuito hidráulico instalado, según versión.",
    "Busca fugas, daño, fijaciones sueltas y cambios reportados en el funcionamiento.",
    "Comprueba recorrido o actuación con el método del manual; registra resultado o documenta la configuración sin embrague accionado por el operador.",
  ], ["Mando del embrague y su configuración, o selector si no equipa.", "Accionamiento y conexiones accesibles, o identificación de la transmisión alternativa."], "Se relacionan el mando y el mecanismo que transmite su acción.", "Embrague y accionamiento", false),

  shafts: step("Transmisión", "Inspeccionar cardanes, crucetas o semiejes", "La inspección bajo la unidad requiere soportes y accesos seguros; no trabajes con el tren motriz girando.", [
    "Identifica cardanes, crucetas, semiejes o juntas que equipa la unidad.",
    "Revisa fijaciones, guardapolvos, retenes, golpes, fugas y señales de desplazamiento.",
    "Comprueba juego o lubrica únicamente según el procedimiento y puntos del manual; registra ubicación de cualquier anomalía.",
  ], ["Conjunto delantero o primera unión del tren de transmisión.", "Conjunto posterior o unión opuesta, con guardapolvos y fijaciones visibles."], "Las uniones de cada extremo pueden deteriorarse de manera distinta.", "Árboles de transmisión, crucetas y semiejes"),

  axles: step("Transmisión", "Revisar ejes, diferenciales y reductores", "Identifica cada conjunto instalado; el aceite y método de nivel pueden variar entre ejes y reductores.", [
    "Inspecciona carcasas, soportes y sellos de cada eje, diferencial y reductor que corresponda.",
    "Busca fugas, golpes y daños; comprueba nivel solo con la posición y procedimiento indicados.",
    "Registra cada lectura y servicio por componente. Si corresponde recambio, usa la especificación de ese conjunto y su historial.",
  ], ["Eje o diferencial delantero, o primer conjunto instalado.", "Eje o diferencial posterior y reductores; agrega fotos por conjunto adicional."], "Las fotos distinguen conjuntos con fluidos y condiciones de servicio independientes.", "Ejes, diferenciales y reductores"),

  transfer: step("Transmisión", "Revisar caja de transferencia si equipa", "Confirma primero su existencia y modelo; no atribuyas tracción integral a una unidad sin identificarla.", [
    "Identifica caja de transferencia, soportes, conexiones y selector cuando exista.",
    "Revisa fugas y daños; comprueba el nivel solo con el procedimiento correspondiente.",
    "Registra condición y especificación aplicable o documenta que no equipa; evita una prueba de tracción fuera de las condiciones del manual.",
  ], ["Caja de transferencia y sellos accesibles, o identificación de la configuración sin caja."], "La imagen acredita la presencia y condición del conjunto revisado.", "Caja de transferencia", false),

  distribution: { ...step("Distribución", "Identificar distribución y su programa de servicio", "La unidad puede usar banda, cadena u otro sistema. No se crea un recambio hasta identificar motor y manual.", [
    "Relaciona código de motor con el sistema de distribución indicado por su fabricante.",
    "Registra si existe revisión o sustitución programada, su condición y el historial documentado; no inventes un intervalo.",
    "Si está vencido o se detectan síntomas, deriva el trabajo al procedimiento específico y personal capacitado; no desmontes para completar esta identificación.",
  ], ["Código de motor y sección del manual que identifica distribución o su programa; agrega fotos si no caben juntos."], "Se requiere evidencia de identificación, sin retirar cubiertas para obtener una foto del mecanismo.", "Distribución: identificación y programa del motor", false), response_type: "texto" },

  rotation: step("Rodaje", "Definir rotación y revisión de alineación", "La rotación depende de medidas, dirección de giro, ruedas dobles y configuración; no apliques un patrón universal.", [
    "Registra posición y desgaste de cada neumático y confirma si el manual permite rotación en ese montaje.",
    "Si corresponde, realiza la rotación siguiendo patrón, elevación y apriete prescritos; registra nuevas posiciones.",
    "Si hay desgaste irregular, solicita diagnóstico de alineación o suspensión y registra resultado; no declares corregida la causa solo por rotar.",
  ], ["Patrón de desgaste antes del servicio, con posición identificada.", "Posiciones finales o informe de alineación; si no procede, montaje y criterio documentados."], "La comparación permite rastrear neumáticos y la corrección del desgaste irregular.", "Rotación de neumáticos y alineación", false),

  load: step("Carga", "Inspeccionar caja y anclajes de carga", "Aplica a cajas, estacas o superficies de carga que efectivamente equipe la unidad. En automóviles o chasis sin caja de carga, registra «No equipado, confirmado en manual» y documenta su carrocería; no se exige una caja a un Figo.", [
    "Revisa piso, paredes, estacas, compuertas y seguros según configuración.",
    "Inspecciona puntos de anclaje buscando deformación, corrosión, grietas o fijaciones faltantes.",
    "Comprueba que la carga y su sujeción, si están presentes, no oculten defectos ni interfieran con los seguros; registra las zonas no accesibles.",
  ], ["Vista general del piso o caja de carga, o carrocería que confirme que no equipa.", "Anclajes, estacas o seguros de compuerta accesibles, o segunda vista de la configuración sin caja."], "La superficie de apoyo y los elementos de retención deben documentarse por separado; si no equipa, ambas vistas acreditan su configuración.", "Caja, plataforma y anclajes de carga"),

  fifthWheel: step("Acoplamiento", "Revisar quinta rueda y seguro si equipa", "Identifica fabricante de quinta rueda; el enganche, prueba y lubricación requieren su procedimiento específico.", [
    "Inspecciona placa, soporte, fijaciones, mordazas y mecanismo visible con el conjunto asegurado.",
    "Comprueba cierre y retención solo mediante el método autorizado; no te coloques entre vehículos sin aseguramiento y coordinación.",
    "Lubrica donde indique el fabricante y registra desgaste o daño. Si no equipa quinta rueda, documenta la configuración real del vehículo.",
  ], ["Quinta rueda, placa y soportes, o configuración sin quinta rueda.", "Seguro y mecanismo de cierre accesible, o acoplamiento alternativo identificado."], "Las dos vistas muestran superficie de carga y mecanismo de retención.", "Quinta rueda, lubricación y seguro de acople"),

  kingpin: step("Acoplamiento", "Revisar perno rey y placa de acople", "No apliques límites de desgaste de otro fabricante. El acceso debe ser seguro y el remolque estar sostenido conforme a su manual.", [
    "Identifica perno rey, placa y fijaciones; revisa daños, grietas, desgaste o marcas de desplazamiento.",
    "Mide los puntos prescritos con el instrumento correcto y registra valor y límite del componente.",
    "Comprueba limpieza, lubricación y retención conforme al manual; reporta cualquier daño antes del acoplamiento.",
  ], ["Placa y zona de montaje del perno rey.", "Detalle del perno rey y puntos de medición accesibles."], "La unión estructural y la superficie de enganche deben verse de cerca y en contexto.", "Perno rey y placa de acoplamiento"),

  trailerLines: step("Conexiones", "Revisar conexiones de aire y electricidad", "Inmoviliza ambos vehículos antes de manipular conexiones; no desacoples líneas bajo condiciones no autorizadas.", [
    "Revisa conectores, mangueras, cables, soportes y holgura de recorrido.",
    "Busca sellos dañados, roce, tensión, fugas o conectores sin retención.",
    "Verifica respuesta de luces y circuito neumático con el procedimiento del conjunto y registra resultado.",
  ], ["Conexiones neumáticas y recorrido de mangueras.", "Conexión eléctrica y cableado del remolque."], "Aire y electricidad necesitan evidencia independiente aunque compartan zona.", "Conexiones neumáticas y eléctricas del remolque"),

  ramps: step("Cama baja", "Inspeccionar rampas, bisagras y seguros", "No permanezcas debajo de una rampa sostenida solo por su accionamiento. Usa el bloqueo que indique su fabricante.", [
    "Inspecciona superficie, largueros y soldaduras de cada rampa.",
    "Revisa bisagras, pasadores, retenes y accionamiento accesible buscando desgaste, deformación o fuga.",
    "Comprueba bloqueo de transporte y movimiento solo según el procedimiento; si no equipa rampas, registra la configuración.",
  ], ["Rampas y superficie de carga, o configuración sin rampas.", "Bisagras, pasadores y seguros de transporte, o segunda vista de la configuración sin rampas."], "La estructura y el mecanismo de retención tienen funciones distintas y necesitan dos vistas.", "Rampas, bisagras y seguros"),

  neck: step("Cama baja", "Revisar cuello desmontable o mecanismo de elevación", "Solo aplica si equipa. Su secuencia de apoyo, desacople y bloqueo es específica del fabricante.", [
    "Identifica cuello, apoyos, pasadores y tipo de accionamiento reales.",
    "Inspecciona estructura, retenes y conexiones visibles; si es hidráulico, revisa mangueras y cilindros sin buscar fugas con la mano.",
    "Comprueba seguros o función solo con el procedimiento autorizado. Documenta si usa un cuello fijo u otra configuración.",
  ], ["Cuello y puntos de unión, con configuración identificable.", "Seguros y accionamiento o unión fija según equipamiento."], "La unión estructural y sus retenes requieren documentación separada.", "Cuello, mecanismos de elevación y seguros"),

  trailerSupports: step("Cama baja", "Revisar apoyos de estacionamiento", "Identifica los apoyos que equipa este remolque y su procedimiento; no te sitúes debajo de una unidad sin soporte seguro.", [
    "Inspecciona patas, placas, soportes y fijaciones accesibles, o documenta la configuración sin patas de apoyo.",
    "Busca deformaciones, grietas, corrosión, piezas faltantes y daños del accionamiento.",
    "Comprueba retención y posición de transporte únicamente conforme al manual. Si no equipa, registra «No equipado, confirmado en manual» y el método de apoyo autorizado.",
  ], ["Apoyo izquierdo y su unión al bastidor, o configuración sin patas.", "Apoyo derecho y accionamiento, o método de apoyo documentado si no equipa."], "Los lados deben revisarse por separado para identificar daños de apoyo o retención.", "Apoyos de estacionamiento del remolque"),

  final: { ...step("Cierre", "Registrar resultado y condición final", "Una fotografía no autoriza la puesta en servicio. Toda falla crítica debe quedar resuelta y verificada por el responsable antes de liberar la unidad.", [
    "Comprueba que herramientas y materiales se retiraron y que tapas, guardas y accesos quedaron en la condición indicada por el manual.",
    "Registra trabajo realizado, mediciones, refacciones, fluidos, puntos no accesibles y pendientes; conserva el vínculo con el manual usado.",
    "Documenta condición final y responsable de la revisión. Si quedó un defecto de seguridad o una prueba crítica pendiente, deja la unidad inmovilizada y registra la acción requerida.",
  ], ["Vista final de la unidad o área atendida, con guardas colocadas y condición de entrega visible."], "La vista final documenta la entrega; adjunta además cualquier defecto o bloqueo pendiente.", "Verificación posterior al mantenimiento y registro de defectos", false), response_type: "texto" },
} satisfies Record<string, StepDefinition>;

type StepKey = keyof typeof steps;
type ReferenceContext = "gmk" | "gmkCarrier" | "gmkUpper" | "mobile" | "liebherr" | "hiab" | "boom" | "cat" | "truck" | "trailer" | "ford" | "chevrolet" | "matiz" | "tsuru";
type PlanDefinition = { reference: ReferenceContext; steps: StepKey[] };

/** Explicit coverage is intentional: changing a plan title must never alter its procedure. */
const planDefinitions: Record<string, PlanDefinition> = {
  "gmk-preuse": { reference: "gmk", steps: ["readings", "levels", "tires", "lights", "brakes", "access", "rope", "hook", "sheaves", "outriggers", "transport", "safety"] },
  "gmk-carrier-structure": { reference: "gmkCarrier", steps: ["readings", "frame", "welds", "mount", "outriggers"] },
  "gmk-upper-structure": { reference: "gmkUpper", steps: ["readings", "upper", "welds", "boom", "lattice", "pins"] },
  "gmk-mechanisms": { reference: "gmk", steps: ["readings", "rope", "hook", "sheaves", "winch", "pads", "extension", "slew", "outriggers", "cylinders", "safety"] },
  "gmk-powertrain-fluids": { reference: "gmk", steps: ["readings", "engineIdentity", "engineOil", "airFilter", "fuel", "coolant", "radiator", "transmission", "axles", "hydraulicLevel", "fluidService"] },
  "mobile-preuse": { reference: "mobile", steps: ["readings", "levels", "tires", "lights", "brakes", "access", "rope", "hook", "sheaves", "outriggers", "transport", "safety"] },
  "mobile-structure-lifting": { reference: "mobile", steps: ["readings", "frame", "upper", "boom", "pins", "welds", "rope", "hook", "sheaves", "winch"] },
  "mobile-hydraulics-lubrication": { reference: "mobile", steps: ["readings", "hoses", "cylinders", "hydraulicLevel", "hydraulicFilter", "slew", "outriggers", "grease", "fluidService"] },
  "mobile-carrier-engine": { reference: "mobile", steps: ["readings", "engineIdentity", "engineOil", "airFilter", "fuel", "coolant", "radiator", "brakes", "steering", "suspension", "transmission", "wheels"] },
  "liebherr-preuse": { reference: "liebherr", steps: ["readings", "levels", "tires", "lights", "brakes", "access", "rope", "hook", "sheaves", "outriggers", "transport", "safety"] },
  "liebherr-structure-lifting": { reference: "liebherr", steps: ["readings", "frame", "upper", "boom", "welds", "pins", "pads", "extension", "rope", "hook", "sheaves", "winch"] },
  "liebherr-hydraulics-lubrication": { reference: "liebherr", steps: ["readings", "hoses", "cylinders", "hydraulicLevel", "hydraulicFilter", "outriggers", "slew", "centralGrease", "grease", "fluidService"] },
  "liebherr-carrier-engine": { reference: "liebherr", steps: ["readings", "engineIdentity", "airFilter", "fuel", "belts", "coolant", "brakes", "air", "steering", "suspension", "shafts", "axles"] },
  "hiab-preuse": { reference: "hiab", steps: ["readings", "boom", "mount", "pins", "transport", "outriggers", "hook", "hoses", "cylinders", "controls", "safety"] },
  "hiab-lubrication-wear": { reference: "hiab", steps: ["readings", "pins", "pads", "extension", "outriggers", "grease", "slew"] },
  "hiab-hydraulics": { reference: "hiab", steps: ["readings", "hoses", "cylinders", "hydraulicLevel", "hydraulicFilter", "fluidService", "controls"] },
  "hiab-controls-structure": { reference: "hiab", steps: ["readings", "boom", "mount", "pins", "welds", "electrical", "controls", "safety"] },
  "boom-preuse": { reference: "boom", steps: ["readings", "capacity", "rope", "hook", "sheaves", "boom", "outriggers", "mount", "hoses", "pto", "controls", "safety"] },
  "boom-hoist": { reference: "boom", steps: ["readings", "rope", "hook", "sheaves", "winch", "ropeLubrication", "safety"] },
  "boom-structure-lubrication": { reference: "boom", steps: ["readings", "boom", "welds", "pins", "mount", "pads", "extension", "slew", "outriggers", "grease", "transport"] },
  "boom-hydraulics-safety": { reference: "boom", steps: ["readings", "hydraulicLevel", "hydraulicFilter", "hoses", "cylinders", "pto", "electrical", "controls", "safety", "fluidService"] },
  "telehandler-preuse": { reference: "cat", steps: ["readings", "levels", "tires", "forks", "coupler", "brakes", "steering", "restraints", "controls", "safety", "capacity"] },
  "telehandler-boom": { reference: "cat", steps: ["readings", "boom", "pins", "pads", "chains", "grease", "rearStability", "outriggers"] },
  "telehandler-drivetrain": { reference: "cat", steps: ["readings", "transmission", "transfer", "axles", "wheels", "shafts", "brakes", "steering", "tires", "fluidService"] },
  "telehandler-engine-hydraulics": { reference: "cat", steps: ["readings", "engineIdentity", "engineOil", "airFilter", "belts", "coolant", "radiator", "hydraulicLevel", "hydraulicFilter", "hoses", "cylinders", "fluidService"] },
  "truck-preuse": { reference: "truck", steps: ["readings", "levels", "tires", "wheels", "lights", "restraints", "brakes", "parking", "air", "fifthWheel", "load"] },
  "truck-engine": { reference: "truck", steps: ["readings", "engineIdentity", "engineOil", "oilChange", "airFilter", "fuel", "coolant", "radiator", "belts"] },
  "truck-brakes-chassis": { reference: "truck", steps: ["readings", "brakes", "parking", "air", "steering", "suspension", "tires", "wheels", "frame", "load"] },
  "truck-transmission-coupling": { reference: "truck", steps: ["readings", "transmission", "clutch", "shafts", "axles", "pto", "fifthWheel", "fluidService"] },
  "trailer-preuse": { reference: "trailer", steps: ["kingpin", "trailerLines", "tires", "wheels", "lights", "brakes", "load", "ramps", "neck"] },
  "trailer-running-gear": { reference: "trailer", steps: ["brakes", "air", "suspension", "axles", "wheels", "tires", "rotation", "grease"] },
  "trailer-structure": { reference: "trailer", steps: ["frame", "welds", "load", "kingpin", "ramps", "neck", "trailerSupports"] },
  "ford-preuse": { reference: "ford", steps: ["readings", "levels", "brakes", "parking", "tires", "lights", "restraints", "load"] },
  "ford-engine-filters": { reference: "ford", steps: ["readings", "engineIdentity", "engineOil", "oilChange", "airFilter", "fuel", "cabinFilter", "ignition"] },
  "ford-brakes-running-gear": { reference: "ford", steps: ["readings", "brakes", "parking", "tires", "rotation", "steering", "suspension", "wheels", "shafts", "battery", "lights"] },
  "ford-cooling-transmission": { reference: "ford", steps: ["readings", "engineIdentity", "coolant", "radiator", "belts", "transmission", "clutch", "axles", "transfer", "distribution", "fluidService"] },
  "chevrolet-preuse": { reference: "chevrolet", steps: ["readings", "levels", "brakes", "parking", "tires", "lights", "restraints", "battery", "load"] },
  "chevrolet-engine": { reference: "chevrolet", steps: ["readings", "engineIdentity", "engineOil", "oilChange", "airFilter", "fuel", "ignition"] },
  "chevrolet-brakes-chassis": { reference: "chevrolet", steps: ["readings", "brakes", "parking", "steering", "suspension", "wheels", "shafts", "tires", "rotation", "load"] },
  "chevrolet-cooling-drivetrain": { reference: "chevrolet", steps: ["readings", "engineIdentity", "coolant", "radiator", "belts", "transmission", "axles", "transfer", "distribution", "fluidService"] },
  "matiz-preuse": { reference: "matiz", steps: ["readings", "levels", "brakes", "parking", "tires", "lights", "restraints", "battery"] },
  "matiz-engine": { reference: "matiz", steps: ["readings", "engineIdentity", "engineOil", "oilChange", "airFilter", "fuel", "ignition"] },
  "matiz-brakes-chassis": { reference: "matiz", steps: ["readings", "brakes", "parking", "steering", "suspension", "wheels", "shafts", "tires", "rotation"] },
  "matiz-cooling-transmission": { reference: "matiz", steps: ["readings", "engineIdentity", "coolant", "radiator", "belts", "transmission", "clutch", "distribution", "fluidService"] },
  "tsuru-preuse": { reference: "tsuru", steps: ["readings", "levels", "brakes", "parking", "tires", "lights", "restraints", "battery"] },
  "tsuru-engine": { reference: "tsuru", steps: ["readings", "engineIdentity", "engineOil", "oilChange", "airFilter", "fuel", "ignition"] },
  "tsuru-brakes-running-gear": { reference: "tsuru", steps: ["readings", "brakes", "parking", "steering", "suspension", "wheels", "shafts", "tires", "rotation"] },
  "tsuru-cooling-transmission": { reference: "tsuru", steps: ["readings", "engineIdentity", "coolant", "radiator", "belts", "transmission", "clutch", "distribution", "fluidService"] },
};

const referenceNotes: Record<ReferenceContext, string> = {
  gmk: "Manitowoc, consulta de manual por número de serie. Procedimiento y página de la unidad pendientes de vincular; este es un checklist base.",
  gmkCarrier: "Grove GMK, boletín 3 302 970 (07.01.2020), §1.1.1 y §1.2.1–1.2.2, páginas impresas 1-1 y 1-3–1-4. Verificar las zonas aplicables en sus diagramas y completar con el manual por serie.",
  gmkUpper: "Grove GMK, boletín 3 302 970 (07.01.2020), §1.2.1 y §1.2.3–1.2.5, páginas impresas 1-3 y 1-5–1-7. Verificar los diagramas de superestructura, pluma y extensión; completar con el manual por serie.",
  mobile: "Manitowoc, consulta de manual por número de serie. Modelo de esta Grove pendiente; no se le atribuye el boletín GMK. Sección y página del procedimiento exacto por confirmar.",
  liebherr: "Liebherr, servicio y documentación por número de serie. Variante LTM 1140 de 1994 pendiente de confirmar; no se usa el manual de una LTM moderna como equivalente. Sección y página por confirmar.",
  hiab: "HIAB ProCare, apartados «Inspection» y «Essential»: alcance de servicio de familia, sin procedimiento ni límites por serie. Completar sección y página con el manual del modelo HIAB identificado.",
  boom: "National 600E2 (2019), referencia de familia, capítulos 5 «Lubrication» y 6 «Maintenance Checklist». No confirma el modelo de ninguna unidad ni sustituye manuales Manitex, Terex o Simon-RO. Completar con manual por marca y serie; Manitex PDI es referencia de entrega, no programa periódico.",
  cat: "Caterpillar, artículos «Telehandler Maintenance» y «250-Hour Service Interval»: referencias de familia. Su intervalo no se aplica al CAT 2013 sin modelo y número de producto. Procedimiento, sección y página del OMM exacto por confirmar.",
  truck: "Manuales de familia Kenworth y Peterbilt (2017) y consulta de manuales Freightliner/International. El chasis y sus componentes deben identificarse por VIN y placas; estas referencias no fijan el procedimiento de unidades 2002–2007. Sección y página exactas por confirmar.",
  trailer: "Fontaine Heavy-Haul, Owner’s Guide: referencia de familia de cama baja, sin atribuir esa marca a esta unidad. Validar fabricante y configuración; sección y página del manual aplicable por confirmar.",
  ford: "Ford México, manuales por año y modelo; Figo/Ka 2016 únicamente como referencia cuando figure entre las fuentes. No aplica como manual de Ranger o F-150. Confirmar VIN, año y motor; sección y página de la unidad por vincular.",
  chevrolet: "Chevrolet, mantenimiento de Silverado por año, motor y uso: referencia de familia. Año y motorización de la unidad pendientes; sección y página de su manual por vincular.",
  matiz: "Chevrolet Matiz 2011: referencia de familia; año y motor de la unidad pendientes. No se verificó una página de procedimiento aplicable a esta unidad; completar con su manual e historial.",
  tsuru: "Nissan, Manual del conductor Tsuru publicado por distribuidor autorizado: referencia de familia, capítulos 7 «Recomendaciones preventivas» y 8 «Mantenimiento». La fecha del enlace no confirma año o motor de la unidad; verificar edición y sección exactas.",
};

function referenceFor(plan: MaintenancePlan, context: ReferenceContext, key: StepKey): string {
  if (context === "boom" && plan.source_ids.includes("national-maintenance-reference")) {
    const nationalLocators: Partial<Record<StepKey, string>> = {
      rope: "National 600E2, §6 «Hoist Cable Inspection and Maintenance», páginas impresas 6-3–6-4.",
      ropeLubrication: "National 600E2, §5 «Wire Rope Lubrication», página impresa 5-8.",
      hydraulicLevel: "National 600E2, §5 «Hydraulic Oil Reservoir Level», página impresa 5-8.",
      grease: "National 600E2, capítulo 5, tablas de lubricación.",
      hook: "National 600E2, §6 «Daily Inspections» y «Monthly Inspections», páginas impresas 6-1–6-2.",
      sheaves: "National 600E2, §6 «Daily Inspections» y «Monthly Inspections», páginas impresas 6-1–6-2.",
      winch: "National 600E2, §6 «Weekly Inspections» y «Monthly Inspections», página impresa 6-2.",
      safety: "National 600E2, §6 «Daily Inspections», página impresa 6-1; prueba exacta por dispositivo y serie pendiente.",
    };
    if (nationalLocators[key]) return `${nationalLocators[key]} Referencia de familia, no procedimiento confirmado para esta unidad. Verificar manual de su marca, modelo y serie antes de ejecutar.`;
  }
  if ((context === "gmkCarrier" || context === "gmkUpper") && (key === "readings" || key === "safe" || key === "final")) {
    return "Boletín GMK 3 302 970, §1.1.1: lecturas e inspección adicional. Estacionamiento, aislamiento y liberación: manual de la unidad por serie, sección exacta por confirmar.";
  }
  return `${referenceNotes[context]} Tema a localizar: ${steps[key].topic}.`;
}

function manualConfirmation(plan: MaintenancePlan, context: ReferenceContext): MaintenanceChecklistStep {
  return {
    id: `${plan.id}:manual`,
    section: "Manual aplicable",
    title: "Confirmar manual, serie y procedimiento",
    instructions: "Antes de ejecutar este checklist, el responsable debe vincular el manual que corresponde a la unidad. Las fuentes de familia ayudan a preparar la revisión, pero no confirman tolerancias, productos, capacidad ni intervalos de este equipo.",
    procedure_steps: [
      "Fotografía la placa y registra marca, modelo, número de serie o VIN y configuración; para equipos montados, distingue grúa y chasis.",
      `Localiza el manual aplicable a «${plan.title}» y anota título, edición o revisión, modelo y rango de series que cubre. Incluye manual del componente cuando corresponda.`,
      "Anota sección, página y procedimiento de este servicio; confirma puntos de inspección, condiciones seguras, valores, herramientas y consumibles antes de realizarlo.",
      "En un punto que solo aplica a equipo opcional, confirma su ausencia en el manual, registra «No equipado, confirmado en manual» en observaciones y fotografía la configuración. Solo entonces puede marcarse conforme; no uses esta opción para una pieza faltante o una revisión pendiente.",
      "Si el manual o la identidad no se pueden confirmar, registra lo pendiente y conserva la revisión como borrador; no autorices ajustes, pruebas con carga, desmontajes o recambios basados en otro modelo.",
    ],
    response_type: "texto",
    unit: null,
    min_value: null,
    max_value: null,
    min_photos: 2,
    photo_requirements: ["Placa legible de la unidad o componente que vincule modelo y serie con este servicio.", "Portada o identificación del manual y procedimiento aplicable; agrega fotos para mostrar edición, rango de series y página de trabajo."],
    photo_hint: "La primera imagen identifica el equipo y la segunda el documento usado. Adjunta páginas adicionales cuando una sola foto no muestre edición, cobertura y procedimiento.",
    critical: true,
    source_ids: [...plan.source_ids],
    reference_locator: referenceNotes[context],
    requires_manual_confirmation: true,
  };
}

export function maintenanceChecklist(plan: MaintenancePlan): MaintenanceChecklistStep[] {
  const definition = planDefinitions[plan.id];
  if (!definition) throw new Error(`No existe checklist curado para el plan ${plan.id}`);

  return [
    manualConfirmation(plan, definition.reference),
    ...(["safe", ...definition.steps, "final"] as StepKey[]).map((key): MaintenanceChecklistStep => {
      const item: StepDefinition = steps[key];
      return {
        id: `${plan.id}:${key}`,
        section: item.section,
        title: item.title,
        instructions: item.instructions,
        procedure_steps: [...item.procedure_steps],
        response_type: item.response_type ?? "ok_falla",
        unit: null,
        min_value: null,
        max_value: null,
        min_photos: item.photo_requirements.length,
        photo_requirements: [...item.photo_requirements],
        photo_hint: item.photo_hint,
        critical: item.critical,
        source_ids: [...plan.source_ids],
        reference_locator: referenceFor(plan, definition.reference, key),
        requires_manual_confirmation: false,
      };
    }),
  ];
}
