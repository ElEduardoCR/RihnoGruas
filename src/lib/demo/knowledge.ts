// Políticas internas que el agente consulta (RAG). En Supabase se guardan en
// knowledge_docs con su embedding; edítalas para reflejar las reglas reales.
export const KNOWLEDGE = [
  {
    title: "Política de revisiones",
    source: "Manual de operación interna v3",
    content:
      "Toda grúa debe tener una revisión total completada y aprobada antes de salir a renta. El agente la programa automáticamente el día hábil anterior al inicio de la renta y la asigna al operador de la renta. " +
      "Si la revisión resulta rechazada (falla en un punto crítico), la grúa queda detenida y no puede salir hasta que un mecánico libere la falla. " +
      "Al regresar de renta se hace una recepción post-renta el mismo día. Las revisiones se llenan en el wizard con foto obligatoria por punto; " +
      "una calidad de llenado menor a 70 puntos obliga a repetir la revisión con supervisión del jefe de taller.",
  },
  {
    title: "Política de almacén y control de refacciones",
    source: "Reglamento de almacén 2026",
    content:
      "Toda salida de almacén debe indicar la grúa destino y el motivo. Las piezas marcadas como 'cambio contra entrega' (filtros especiales, sellos, baterías, balatas, rodillos) requieren foto de la pieza usada devuelta. " +
      "Las salidas con valor mayor a $5,000 MXN o de piezas no compatibles con la grúa destino quedan pendientes hasta que Dirección o Administración las autorice. " +
      "El horario de almacén es de 7:00 a 19:00; cualquier salida fuera de horario se reporta a Dirección. Se hace conteo cíclico semanal de aceites y llantas; diferencias mayores al 5% se investigan.",
  },
  {
    title: "Operadores autorizados",
    source: "Manual de operación interna v3",
    content:
      "Sólo pueden operar una grúa los operadores aprobados en su expediente, con licencia federal tipo E vigente y constancia DC-3 de operación de grúas. " +
      "Un operador con licencia vencida no puede ser asignado a rentas. Las aprobaciones por grúa tienen vigencia y se renuevan con evaluación práctica del jefe de taller.",
  },
  {
    title: "Documentación obligatoria por tipo de grúa",
    source: "Cumplimiento normativo",
    content:
      "Titanes (camión grúa): tarjeta de circulación federal, póliza de seguro, verificación físico-mecánica y de emisiones, permiso SCT de carga especializada y certificación anual de grúa. " +
      "Grúas móviles: póliza de seguro, tarjeta de circulación (si circulan por vía pública), certificación anual de grúa y tabla de cargas a bordo. " +
      "Grúas armables en sitio (torre y celosía): certificación anual, póliza de seguro, manual de montaje y memoria de cálculo de la cimentación por obra. Ninguna grúa sale con documentos vencidos.",
  },
  {
    title: "Procedimiento ante falla o detención",
    source: "Manual de seguridad",
    content:
      "Ante una falla: detener la maniobra, bajar la carga de forma segura, reportar por WhatsApp al agente Rhino ('RH-0X detenida por ...'), etiquetar fuera de servicio (bloqueo y etiquetado LOTO) y avisar al jefe de taller. " +
      "El agente registra la detención, notifica a Dirección y reprograma o busca grúa sustituta para las rentas afectadas.",
  },
  {
    title: "Tarifas y condiciones comerciales",
    source: "Lista de precios 2026",
    content:
      "Las rentas se cotizan por día de 10 horas con operador. Titanes desde $14,500/día, grúas móviles de 36 a 72 t entre $19,000 y $34,000/día, grúas torre por mes. " +
      "El traslado se cobra aparte. La Manitowoc 2250 requiere 2 días de armado y 6 tractocamiones de traslado. Viento máximo de operación: 30 km/h para grúas móviles y 72 km/h para torre fuera de servicio (veleta libre).",
  },
];
