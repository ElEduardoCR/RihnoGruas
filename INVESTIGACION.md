# Catálogo investigado para Grúas Rhino

15 modelos reales, 36 insumos y dos listas ilustrativas: 16 puntos previos al uso y 8 de mantenimiento. Investigación de fuentes primarias al 24 de septiembre de 2026. Los registros se entregan en `rhino-catalog.json`.

## Integración

- Mostrar `capacityLabel`, no añadir automáticamente «t» a todos los registros. Fassi e Hiab publican momento en t·m, que no es masa. Palfinger incluye ambos valores.
- `mainBoomMaxM`, `maxOutreachM` y `maxHoistHeightM` representan magnitudes distintas; mostrar el nombre correcto. Los máximos no son simultáneos.
- `demoAssetCode`, `demoSku`, `demoStock` y `demoMinimumStock` son inventados expresamente para probar filtros, alertas y movimientos. Los mínimos no son recomendaciones de inventario.
- Todos los `compatibleCraneIds` están vacíos y `compatibilityStatus` dice «Por validar». No generar automáticamente listas de repuestos compatibles a partir de la marca o la capacidad.
- Las fuentes respaldan existencia, clase o familia. Los filtros, sellos y mangueras genéricos no son números de parte para compra. Las notas de compatibilidad son controles de selección propuestos para la demo.
- Separar ficha del modelo de activo físico: el año, serie, placas, ubicaciones, pólizas, horas y costos reales deben capturarse por unidad. No inventar documentación certificada.
- Cada imagen debe rotularse como ilustrativa si no muestra la unidad real. La procedencia de foto no verifica disponibilidad ni propiedad.

## Casos que requieren cuidado

1. Tadano GR-1000XL-4: 100 USt corresponde a la clase de 90,7 t publicada. National NBT60XL: 60 USt / 54,4 t. Shuttlelift SCD15: 15 USt / 13,6 t.
2. Grove GRT8100-1 publica 100 USt y 100 t en fichas regionales: no son conversión entre sí. Se conservó el dato métrico de la fuente. TMS800E publica 80 USt / 70 t y es un modelo no vigente sin certificación CE según Grove; útil como activo de flota usada, no como oferta nueva universal.
3. Kobelco CKE900G-3: el catálogo marca 100 t como resultado teórico. Se eligió la cifra publicada de 90 t con polea auxiliar, y se conserva esa condición en el registro.
4. Hiab X-HiPro 232E-3 procede de una instalación FrameWorks de referencia: no transferir sus datos a otra versión de extensiones. Fassi alcanza 28,55 m con jib; Palfinger 16,3 m se refiere al máximo hidráulico.
5. Una llanta del mismo diámetro de rin puede tener distinta medida, índice y capacidad; el fabricante del equipo debe aprobar la configuración. Los tres tamaños X-CRANE 2 son opciones reales del fabricante, sin asignación a una grúa específica.
6. No asignar aceite por viscosidad solamente; confirmar aprobación OEM, fluido existente y condiciones. No mezclar grasas por color. DEF únicamente corresponde a unidades con SCR. Refrigerantes de la misma marca pueden usar químicas diferentes.
7. Un filtro requiere equivalencia por número de parte, sellado, eficiencia y circuito. Un sello necesita compuesto, perfil y dimensiones; «NBR» o «FKM» por sí solos no especifican la pieza. Manguera, terminal y prensado forman un ensamble definido.

## Checklist y mantenimiento

La lista usa controles visuales y documentales con estados «Pendiente», «Correcto», «Requiere revisión» y «No aplica». No se incluyen límites de viento, tolerancias, presiones, pares de apriete, desgaste de cable, cargas de prueba ni intervalos universales. Estos valores deben venir de los manuales exactos y del plan autorizado.

Registrar observación y evidencia por hallazgo, asociarlo a una orden de trabajo y reservar la liberación al rol responsable. Un porcentaje de checklist completado representa avance de captura; nunca certifica que el equipo sea seguro para operar.

OSHA es una referencia técnica de Estados Unidos. No se afirma cumplimiento local. Las guías Manitowoc consultadas son ejemplos de prácticas y remiten a los manuales concretos; no constituyen instrucciones válidas para toda la flota.

## Fuentes

- `liebherr_1030` — [Liebherr · LTM 1030-2.1](https://www.liebherr.com/en-us/p/ltm103021-4407335)
- `liebherr_1100` — [Liebherr · LTM 1100-5.3](https://www.liebherr.com/en-us/p/ltm110053-4407335)
- `grove_3060` — [Grove · GMK3060L-1](https://www.manitowoc.com/grove/all-terrain-cranes/gmk3060l-1)
- `tadano_ac80` — [Tadano · AC 4.080-1](https://www.tadano.com/latam/en/lifting-equipment/all-terrain-cranes/ac-4-080-1/)
- `tadano_gr1000` — [Tadano · GR-1000XL-4](https://www.tadano.com/latam/en/lifting-equipment/rough-terrain-cranes/gr-1000xl-4/)
- `grove_grt100` — [Grove · GRT8100-1](https://www.manitowoc.com/grove/rough-terrain-cranes/grt8100-1)
- `tadano_gr550` — [Tadano · GR-550XL](https://www.tadano.com/uscan/en/lifting-equipment/rough-terrain-cranes/gr-550xl/)
- `grove_tms800` — [Grove · TMS800E](https://www.manitowoc.com/grove/truck-mounted-cranes/tms800e)
- `national_nbt60` — [National Crane · NBT60XL](https://www.manitowoc.com/national-crane/swing-seat-boom-trucks/nbt60xl)
- `palfinger_36502` — [Palfinger · PK 36502](https://www.palfinger.com/europe/en/our-products/cranes/loader-cranes/models/pk-36502.html)
- `fassi_545` — [Fassi · F545RA xe-dynamic](https://www.fassi.com/fr/grues/f545ra-xe-dynamic/)
- `hiab_232` — [Hiab · X-HiPro 232E-3, instalación FrameWorks](https://www.hiab.com/es-cl/partes-y-servicios/instalaciones/instalaciones-estandar/specification-daf-x-hipro-232)
- `liebherr_lr1160` — [Liebherr · LR 1160.1](https://www.liebherr.com/en-ca/p/lr1160-4678918)
- `kobelco_900` — [Kobelco · CKE900G-3, catálogo oficial](https://www.kobelcocm-global.com/products/cranes/europe/pdf/CKE900G-3spec.pdf?230227=)
- `shuttlelift_15` — [Shuttlelift · SCD15](https://www.manitowoc.com/shuttlelift/shuttlelift-carrydeck-cranes/scd15)
- `michelin_crane2` — [Michelin · X-CRANE 2](https://business.michelinman.com/tires/michelin-x-crane-2)
- `mobil_engine` — [Mobil · Delvac 1300 Super 15W-40](https://www.mobil.com/en/lubricants/for-businesses/heavy-duty-lubricants/products/mobil-delvac-1300-super-15w-40)
- `mobil_dte` — [Mobil · DTE 20 Ultra, serie](https://www.mobil.com.de/de-de/industrial/lubricants/product-series/mobil-dte-20-ultra-series)
- `mobil_gear` — [Mobil · Mobilube HD 80W-90](https://www.mobil.co.in/en-in/our-products/oil-lubricants/mobilube-hd-80w-90)
- `mobil_grease` — [Mobil · Mobilgrease XHP, serie](https://www.global.mobil.com/-/media/pdfs/mobilgrease-xhp-series-v3-focus.pdf)
- `grove_rope` — [Grove · Manual de unidad móvil de engrase](https://www.manitowoc.com/media/18302/download)
- `fleetguard` — [Fleetguard · Refrigerantes y químicos](https://www.fleetguard.com/category/products/coolants-chemicals/0ZGPL0000000FS64AM)
- `cummins_def` — [Cummins · DEF para sistemas SCR](https://www.cummins.com/sites/default/files/files/reports/2008_2009_cummins_sustainability_report.pdf)
- `donaldson_liquid` — [Donaldson · Filtración de líquidos de motor](https://www.donaldson.com/content/dam/donaldson/engine-hydraulics-bulk/catalogs/Engine-Liquid/North-America/F110024-ENG/Donaldson-Engine-Liquid-Product-Guide.pdf)
- `donaldson_air` — [Donaldson · Filtración de aire de motor](https://www.donaldson.com/content/dam/donaldson/engine-hydraulics-bulk/catalogs/air-intake/north-america/F110027-ENG/Air-Intake-Systems-Product-Guide.pdf)
- `donaldson_hydraulic` — [Donaldson · Catálogo de filtros hidráulicos](https://ecatalog.donaldson.com/view/478028566)
- `parker_oring` — [Parker · O-Ring Handbook ORD 5700](https://discover.parker.com/Parker-ORing-Handbook-ORD-5700)
- `parker_seals` — [Parker · Hydraulic Seals](https://www.parker.com/content/dam/Parker-com/Literature/Praedifa/Catalogs/Catalog_HydrSeals_PTD3350-EN.pdf)
- `gates_hydraulic` — [Gates · Catálogo de mangueras hidráulicas](https://www.gates.com/content/dam/documents-library/catalogs/gates-hydraulic-catalog-en.pdf)
- `gates_crimp` — [Gates · eCrimp, compatibilidad de ensambles](https://www.gates.com/us/en/innovations-and-solutions/innovations/ecrimp-hydraulic-crimp-database.html)
- `loctite` — [Henkel · LOCTITE 243](https://next.henkel-adhesives.com/us/en/products/industrial-adhesives/central-pdp.html/loctite-243/BP000000316211.html)
- `wd40_contact` — [WD-40 · Specialist Contact Cleaner](https://www.wd40.com/products/contact-cleaner/)
- `wd40_cleaners` — [WD-40 · Productos de limpieza y desengrase](https://www.wd40.com/how-to/videos/)
- `3m_absorbent` — [3M · Absorbentes para hidrocarburos](https://www.3m.com/3M/en_US/p/c/cleaning-supplies/spill-control/sorbents/i/energy/oil-gas/)
- `wypall` — [Kimberly-Clark · WypAll industrial](https://www.kcprofessional.com/en-gb/brands/wypall-brand-industrial-wipes)
- `skf_nipples` — [SKF · Engrasadores](https://www.skf.com/mm/0901d1968005021c)
- `osha_inspect` — [OSHA · 1926.1412, inspecciones](https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.1412)
- `osha_operate` — [OSHA · 1926.1417, operación](https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.1417)
- `manitowoc_lube` — [Manitowoc · Guía de lubricación F2314](https://www.manitowoc.com/sites/default/files/media/divers/file/2021-09/Lubrication%20Guide_F2314_07-20-2021.pdf)
- `manitowoc_manuals` — [Manitowoc · Manuales de referencia](https://www.manitowoc.com/manuals?page=2)
