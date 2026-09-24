# Grúas Rhino · Propuesta interactiva

Sitio de propuesta y demostración, construido con HTML semántico, CSS adaptable y módulos JavaScript nativos. No necesita compilación ni dependencias para servirlo.

## Ver localmente

Desde esta carpeta:

```sh
python3 -m http.server 4174 --bind 127.0.0.1 --directory dist
```

Abrir http://127.0.0.1:4174.

## Contenido

- Propuesta 1: $19,000 de desarrollo, $500 mensuales, 15 días estimados.
- Propuesta 2: $49,000 de desarrollo, $500 mensuales, 1 mes estimado.
- Propuesta 3: $79,000 de desarrollo, mensualidad variable según consumo de IA, desde 2 meses según alcance final.
- Selector, comparación, registros manuales, alta y asignación de grúas, historial, gasto acumulado, captura guiada, pendientes, calculadora y asistente de demostración.

Los datos son ficticios, compartidos entre propuestas durante una misma visita y se reinician al recargar. No hay persistencia remota, IA, GPS ni conexión real con WhatsApp. La información de ubicación corresponde a la última asignación registrada.

## Cálculos

El resultado registrado es la suma de ingresos menos la suma de gastos capturados. La semana de ejemplo es del 21 al 27 de septiembre de 2026. El asistente filtra las operaciones y gastos dentro de ese periodo.

La calculadora usa supuestos independientes de los registros:

- Costo por hora = fijo mensual / horas facturables + variable por hora.
- Tarifa sugerida = costo por hora / (1 − margen sobre venta).
- Margen a tarifa elegida = (tarifa − costo por hora) / tarifa.

Los montos se calculan sin redondeo interno y se muestran en pesos enteros. Un margen del 30% es margen sobre venta, no recargo sobre costo.

## Publicación

Vercel sirve `dist/` como sitio estático. `vercel.json` ejecuta `npm test` antes de publicar. Repositorio: https://github.com/ElEduardoCR/RihnoGruas. El archivo `.openai/hosting.json` conserva la identidad histórica del proyecto original de Sites; este despliegue usa Vercel. No se necesita ninguna variable de entorno ni base de datos.

```sh
npm test
npx vercel --prod
```

## Inventarios (opciones 2 y 3)

La opción 1 no ofrece inventarios. La opción 2 permite ajustar manualmente existencias, con motivo e historial de movimientos. Las capturas libres de actividades no cambian el inventario.

La opción 3 añade órdenes de mantenimiento con listas de consumibles visibles. Confirmar una orden registra el mantenimiento y su gasto, descuenta cantidades una sola vez y añade un resumen al asistente simulado. Los costos de insumos son de ejemplo; el ajuste manual de existencias no registra gastos.

- MT-026: 20 L de aceite hidráulico, 1 filtro hidráulico y 2 kg de grasa; $3,610 de insumos + $800 de mano de obra = $4,410.
- MT-027: 3 kg de grasa y 1 filtro de aire; $1,190 de insumos + $400 de mano de obra = $1,590.
- Se rechazan cantidades negativas, fracciones de piezas, órdenes duplicadas y servicios sin existencias suficientes. La validación de disponibilidad ocurre antes de modificar cualquier insumo.
- Editar el registro financiero de un servicio no repite su descuento ni modifica sus consumos.
- Los datos y movimientos se conservan durante la visita; se reinician al recargar.

## Ampliación de la propuesta 3

- **Lista de compras:** calcula `máximo(0, mínimo − existencia)`, después de cada consumo o ajuste. No registra compras ni pagos.
- **Reportes:** disponibles para operaciones y mantenimientos, con grúa, servicio/proyecto, horas, materiales y observaciones. Descarga HTML y opción de imprimir/guardar PDF desde el navegador. Los servicios sin cierre muestran un borrador.
- **Requiere tu atención:** muestra un margen registrado menor al 20%, servicios/órdenes pendientes y observaciones faltantes. Los enlaces abren los registros reales; resolverlos actualiza la bandeja. El registro de ejemplo 109 tiene ingreso $6,000, gasto $5,300 y cierre pendiente para demostrar las tres causas.
- **Calendario:** navega meses y días, muestra detalles, permite editar eventos y comparte el estado de completado con recordatorios.
- **Nota de voz:** transcripción de ejemplo, interpretación simulada, edición de grúa/fecha/hora/ubicación/detalles y confirmación explícita. Crea un evento y recordatorio una sola vez y registra una confirmación en la conversación. No reproduce ni procesa audio, no accede al micrófono ni a WhatsApp.

## Opcionales de ejemplo

Los precios base permanecen en $19,000, $49,000 y $79,000. Los opcionales son alcances cotizables, sin implementar módulos externos. Importes de ejemplo editables, **pendientes de confirmar**, no precios de mercado ni aprobados:

- Seguimiento de servicios a cobro: $15,000.
- Programación avanzada de grúas y operadores: $20,000.
- Análisis de variaciones de costos: $12,000.
- Integración con proveedor GPS compatible: $18,000. Equipos y cuotas del proveedor se cotizan aparte.

El total de desarrollo suma precio base y opcionales seleccionados. La mensualidad se muestra aparte: $500 para opciones 1/2 y variable según IA para 3. Compras sugeridas, reportes, atención, calendario visible y notas de voz ya están incluidos en la propuesta 3 y no se cobran como extras.

## Validación de lógica

```sh
node --test tests/logic.test.mjs
```

Cubre compras por mínimos, consumo único y atómico, falta de existencias, ajustes inválidos, resolución de atención, creación/edición de eventos, duplicados, fechas inválidas y cálculo de rentabilidad.


## Demostración ampliada

- 15 grúas reales como modelos de referencia, en seis familias: todo terreno, terreno difícil, sobre camión, articuladas, sobre orugas e industriales. Activos, operadores, horómetros y asignaciones ficticios.
- 36 insumos en siete categorías, con búsqueda, mínimos ficticios, ubicación de almacén y notas de compatibilidad por validar. Referencias comerciales no equivalen a repuestos aprobados para un equipo.
- 39 eventos en septiembre y octubre de 2026: reservas, operación, mantenimiento, taller, traslados y pendientes. Creación, edición, rangos de fecha/hora, filtros y completado manual. No hay optimización ni validación automática de disponibilidad.
- 33 registros de operaciones, gastos y mantenimientos.
- Tres checklists: inspección antes de uso, recepción en taller y entrega. Cinco pasos: grúa con foto, horómetro, revisión por puntos, fotos/observaciones, revisión final. Guardar actualiza el horómetro y crea un pendiente si hay hallazgos. No representa autorización de operación ni consume inventario.
- Fotos JPG/PNG/WebP de hasta 8 MB, máximo seis por captura. Se decodifican localmente y se muestran mediante URLs de objetos; no se envían al servidor. Se liberan al retirarlas o descartar el borrador. Todas las capturas desaparecen al recargar; no se usa localStorage, sessionStorage, IndexedDB ni backend.
- Las fotos de catálogo se comparten entre equipos por familia y se identifican como referencias, no como fotos del activo real. Créditos visibles en `dist/creditos.html`; fuentes completas en `INVESTIGACION.md` y `dist/catalogo-investigado.json`.

## Pruebas

`npm test` verifica cálculos, consistencia de datos y fotos locales, descuentos atómicos, compras por mínimo, checklists incompletos/hallazgos/horómetro y rangos válidos de calendario. La carga temporal de archivos y la eliminación al recargar también se verifican en navegador.


## Expediente documental por grúa

Cada equipo tiene un expediente accesible desde **Flota y expedientes → Ver expediente**. Las 15 grúas incluyen 60 documentos ficticios: seguro, certificación de inspección, certificación de prueba de carga y tarjeta de circulación municipal. Cada documento registra emisor, póliza/folio, emisión, vencimiento y observaciones. Se pueden editar o agregar documentos por equipo.

Las vigencias se calculan respecto a la fecha local del navegador: vigente a más de 30 días, por vencer entre 0 y 30 días inclusive, y vencido desde el día siguiente al vencimiento. Se validan fechas reales y que el vencimiento no sea anterior a la emisión. El resumen de la flota y las fichas se actualizan al guardar; no se crean notificaciones externas.

Se puede adjuntar un PDF o imagen JPG/PNG/WebP de hasta 10 MB. Los adjuntos son opcionales, se mantienen mediante URLs de objetos locales y solo se descargan por acción del usuario. Reemplazar, quitar o cancelar libera los archivos temporales correspondientes. Datos y adjuntos se reinician al recargar; no se suben a Vercel. Los ejemplos no representan pólizas, certificaciones ni permisos reales.
