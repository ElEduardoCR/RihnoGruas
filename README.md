# Grúas Rhino · Gestión de flotilla con agente IA por WhatsApp

Sistema de gestión para una flotilla de **grúas móviles, Titanes (camión grúa articulada) y grúas armables en sitio** (torre y oruga de celosía). **Rhino**, un agente de IA, es la entrada principal al ERP: el usuario explica lo que necesita, Rhino consulta datos y permisos, pide lo que falta y ejecuta las acciones disponibles desde el chat. Los módulos siguen accesibles en el menú izquierdo. El mismo agente atiende por WhatsApp y vigila documentos, almacén, agenda y revisiones.

**Stack:** Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS v4 · Supabase (Postgres + Auth + Storage + pgvector) · OpenAI (function calling, visión, embeddings) · WhatsApp Cloud API · Vercel (hosting + cron).

---

## Módulos

| Módulo | Qué hace |
|---|---|
| **Chat Rhino · `/`** | Conversación principal para pedir acciones sin conocer los módulos. Sugerencias para empezar, consulta de capacidades según el rol, datos y validaciones reales, confirmación de cambios y resultado de la ejecución. |
| **Resumen · `/resumen`** | “Rhino te informa” (los hallazgos que también llegan por WhatsApp), KPIs de la flotilla, línea de tiempo de la semana por grúa, gasto mensual y por categoría y grúa, grúas detenidas con lo que dejan de facturar, últimas compras, próximas revisiones y estado del almacén. |
| **Calendario** | Vista mensual con el estado de **cada grúa cada día** (disponible, rentada, mantenimiento, detenida y revisiones), panel del día y línea de tiempo de dos semanas. |
| **Grúas** | Catálogo filtrable y **expediente detallado**: ficha técnica, documentos con vigencia (seguro, tarjeta de circulación, verificación, permiso SCT, certificación…), operadores aprobados con estado de licencia, agenda, revisiones, puntos propios de revisión, mantenimiento, consumo de almacén y gastos. |
| **Inventario** | Insumos **generales** (aceites, consumibles) y refacciones **específicas por grúa** (compatibilidad). Libro de movimientos inmutable, conteos cíclicos, compras y **controles antirrobo** (ver abajo). |
| **Checklists** | Revisiones tipo **wizard** (un punto a la vez, foto obligatoria) que el operador abre desde un enlace de WhatsApp. **Personalizadas por grúa** y con **calidad de llenado** medida. |
| **Catálogos** | Alta y edición de grúas, clientes, personal (puesto, WhatsApp, avisos, licencia, grúas aprobadas, acceso web) y artículos de almacén (general o específico por grúa, controles antirrobo, existencia inicial). Guía de “Primeros pasos” mientras falten datos. |
| **Actividad del agente · `/agente`** | Bitácora de decisiones (cada herramienta que usó), alertas enviadas, escaneo proactivo manual y **evaluación de precisión** con 24 casos. |

### Decisiones que Rhino toma solo
- **Renta creada → revisión total agendada** el día anterior a las 9:00 (o lo antes posible, nunca antes de las 6:00) y **recepción post-renta** al regreso. Le envía el enlace al operador.
- **Revisión personalizada:** a la plantilla por tipo de grúa le agrega los puntos propios de la grúa y los que deriva del historial: fallas de la revisión anterior, reparaciones y detenciones recientes, horómetro cerca del servicio, documentos que vencen durante la renta y las condiciones de la maniobra.
- **Revisión rechazada** (falla crítica) → la grúa queda **detenida** automáticamente y avisa a Dirección.
- **Grúa detenida con renta próxima** → propone la **sustituta** disponible del mismo tipo y capacidad.
- **No permite rentar** con documentos vencidos, choques de agenda u operador no aprobado o con licencia vencida (asigna uno válido si no se indica).
- **Escaneo diario**: documentos y licencias por vencer (30/15/7 días), revisiones vencidas o llenadas sin cuidado, servicio por horómetro, stock bajo, salidas por autorizar, movimientos atípicos, grúas ociosas y gasto arriba del promedio.

### Antirrobo en almacén
- Toda salida va a una **grúa**, con motivo y quién la pidió; el stock es la suma de un **libro de movimientos** que no se borra.
- Una refacción **específica** no sale a una grúa **incompatible** sin autorización.
- **Cambio contra entrega**: filtros especiales, sellos, baterías, balatas y rodillos requieren **foto de la pieza usada** (puede mandarse por WhatsApp y se asocia sola).
- Montos mayores a `INVENTORY_AUTHORIZE_ABOVE_MXN` quedan **pendientes de autorización** (se autoriza por WhatsApp o web).
- **Consumo atípico** (más de 1.5× lo esperado por servicio en 30 días) y salidas **fuera de horario** se reportan al momento.
- **Conteos cíclicos**: diferencias mayores a 5 % generan alerta y ajuste trazable. Llantas y baterías son **serializadas**.

### Checklists que sí se llenan con conciencia
- Wizard: **un punto por pantalla**, no se puede avanzar sin foto y respuesta; una falla exige descripción.
- **Varias fotos por punto** (hasta 8): cada punto define un mínimo (`min_photos`), p. ej. 4 para “daños visibles” (un lado por foto) o 2 para “tarjeta y póliza”. Cada foto se sube en cuanto se toma y se puede quitar o repetir.
- Foto tomada con la cámara en el momento: se rechaza una **foto repetida** dentro de la revisión y se marcan fotos usadas en revisiones anteriores o tomadas antes de iniciar.
- **Tiempo por punto**: respuestas en menos de 5 s se marcan como apresuradas.
- Ubicación al iniciar, firma y declaración al cerrar.
- **Calidad de llenado (0–100)**; por debajo de 70 Rhino avisa y la política pide repetirla con supervisión.
- Con `OPENAI_API_KEY`, la **visión** revisa en segundo plano que cada foto corresponda al punto (p. ej. que la “foto del manómetro” muestre un manómetro).

---

## Cómo funciona el agente

```
WhatsApp ──▶ /api/whatsapp (firma Meta, deduplicación, after())
                 │
                 ▼
Chat web ──▶ runAgent()  ── ¿"SÍ"/"NO" a una acción pendiente? ──▶ ejecuta / cancela (determinista)
                 │
                 ▼
        OpenAI (function calling, strict) ◀──▶ herramientas (lectura y escritura)
                 │                                    │
                 │                                    ▼
                 │                     servicios de negocio + reglas (rentas, revisiones,
                 │                     inventario antirrobo, mantenimiento) ──▶ Supabase
                 ▼
     respuesta + "📌 Por cierto" (hallazgo relevante que la persona no conoce)

Vercel Cron ──▶ /api/cron/brief (7:00) y /api/cron/scan ──▶ hallazgos ──▶ alertas por WhatsApp
```

- **Guía desde el chat**: Rhino identifica la intención y consulta las capacidades disponibles para el rol; busca los datos existentes antes de preguntarlos. Si falta información, la pide en lenguaje sencillo. Si una acción no está disponible o incumple una regla, explica el impedimento y el siguiente paso, sin afirmar que la ejecutó.
- **Conversación limpia y memoria privada**: cada entrada al chat web abre una visita nueva sin cargar las burbujas anteriores. Se conserva un resumen breve de la última conversación y Rhino puede buscar o abrir sus mensajes originales con `consultar_memoria`. La memoria está aislada por usuario, no autoriza operaciones y no sustituye consultar el estado actual. Las propuestas pendientes continúan visibles y requieren su confirmación. Actualizar recupera sólo los mensajes de la visita actual; recargar la página o salir y volver inicia otra.
- **Herramientas de lectura**: capacidades del agente, flota, expediente, disponibilidad, agenda y búsqueda de rentas, inventario, alertas de almacén, gastos, vencimientos, revisiones, operadores, políticas (RAG) y reenvío de revisión. «Llévame a la ficha de GR-03» devuelve un acceso directo que permanece en el historial.
- **Herramientas de escritura**: altas y edición de clientes, grúas y artículos; crear renta, corregir dirección/notas/tarifa de una renta o cancelar una renta futura; registrar un conteo físico de inventario; programar revisión (con puntos extra que el modelo justifica), reportar detención, liberar grúa, programar mantenimiento, salida de almacén, autorizar/rechazar salida y registrar compra. La herramienta valida y prepara un resumen; después de la confirmación, **Rhino ejecuta el cambio** y devuelve el resultado. No envía al usuario a capturar de nuevo en un formulario las acciones que ya puede ejecutar.
- **Alta guiada de artículos**: pregunta los datos obligatorios que faltan y puede sugerir clave, categoría y configuración para que el usuario las acepte o corrija. La presentación se guarda en las notas y la unidad de consumo se mantiene separada: «208 L, uso por litros» no registra 208 litros de existencia ni una compra. Costo y mínimo se confirman por unidad de consumo.
- **Ediciones concretas**: «La GR-03 tiene capacidad de 12 toneladas», «Cambia el teléfono del cliente…» o «El mínimo del filtro… es 8» modifican sólo lo solicitado. Los campos omitidos se conservan; borrar un dato exige pedirlo explícitamente. Si otro usuario cambia los mismos campos antes de confirmar, Rhino pide revisar una propuesta nueva. Registrar una capacidad no certifica la identificación ni la tabla de cargas del equipo importado.
- **Permisos por rol** (dirección, administración, ventas, mecánico, almacén, operador). El chat web usa el usuario autenticado; WhatsApp identifica al personal activo por teléfono. Números no registrados no pueden usar el bot.
- **Sin `OPENAI_API_KEY`** Rhino responde consultas por reglas con las mismas herramientas (útil para demo o contingencia).

Verificación local: `npm run agent:check` prueba permisos, propuestas y confirmaciones, altas, aislamiento de identidad y firmas de WhatsApp sin llamar a servicios externos. `npm run fleet:check` comprueba los flujos de la flotilla.

### Precisión según la guía *Optimizing LLM accuracy* de OpenAI

| Recomendación de la guía | Implementación |
|---|---|
| Empezar con prompt engineering: instrucciones claras, pasos, ejemplos | `src/lib/agent/prompt.ts`: rol, fecha/hora CDMX, usuario y rol, pasos de trabajo, estilo WhatsApp y ejemplos few-shot. |
| Dar contexto/referencia en lugar de confiar en la memoria del modelo (RAG) | Todo dato de la operación sale de **herramientas** sobre la base; políticas internas por **búsqueda vectorial** (pgvector, `match_knowledge`). Se devuelven pocos fragmentos para no meter ruido. |
| Herramientas externas y dividir tareas | Herramientas con esquemas **strict**; la lógica crítica (disponibilidad, documentos, antirrobo, agenda de revisiones) es **código determinista**, el modelo sólo decide qué consultar y cómo explicarlo. |
| Evaluar con 20+ casos y medir cada cambio | `src/lib/agent/evals.ts`: 24 casos (herramienta correcta, dato clave en la respuesta, pide confirmación). Se corren desde **Actividad del agente → Correr evaluación**. |
| “¿Qué tan preciso es suficiente?”: humano en el ciclo donde el error cuesta | Confirmación obligatoria para cambios, autorizaciones de almacén, preguntar cuando falta un dato y escalar a Dirección si hay riesgo. |
| Recolectar ejemplos reales para fine-tuning (“prompt baking”) | `agent_runs` guarda entrada, herramientas, respuesta, latencia y calificación: base para un dataset de 50+ ejemplos cuando haga falta afinar. |

---

## Correr en local (modo demo)

```bash
npm install
```

```bash
npm run dev
```

Abre http://localhost:3000. Sin variables de Supabase la app arranca en **modo demo**: datos realistas en memoria, siempre relativos a la fecha de hoy (10 grúas, operadores, rentas, inventario, 6 meses de compras, revisiones y alertas). Reiniciar el servidor reinicia los datos.

---

## Puesta en producción

### 1. Supabase
1. Crea un proyecto en Supabase.
2. Ejecuta las migraciones de `supabase/migrations/` en orden (SQL Editor, o `supabase link` + `supabase db push`). Crea tablas, restricciones (p. ej. una grúa no puede rentarse dos veces en el mismo horario), RLS, buckets privados `evidencias` y `documentos`, y la función de búsqueda vectorial.
3. Copia `.env.example` a `.env.local` y llena las variables de Supabase.
4. Carga datos:
   - Para probar con datos de ejemplo: `npm run db:seed`
   - Para arrancar en limpio sólo con plantillas de checklist y políticas: `npm run db:seed -- --catalogos`
5. **Primer acceso:** crea tu usuario en Supabase → **Authentication → Users → Add user** (correo y contraseña, “Auto confirm user”) y entra a la app. Como la base no tiene personal, la app te pide nombre y WhatsApp y te deja como **Dirección**.
6. En **Catálogos** da de alta grúas, personal, clientes y artículos. Al registrar a alguien con correo puedes darle **acceso web**: la app crea su usuario con una contraseña temporal (se muestra una sola vez) que cambia en **Mi cuenta**. Si su usuario ya existía en Supabase con ese correo, se vincula solo al entrar.
7. Migraciones futuras: `npm run db:status` y `npm run db:push` (toman el ref y la contraseña de `.env.local`).

### 2. WhatsApp Cloud API (Meta)

El agente y el webhook ya existen; no hace falta construir otro bot. Empieza conectando un número de prueba al mismo ERP:

1. Abre la [guía de inicio de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started), crea o selecciona tu app y configura WhatsApp para tu negocio. Comienza con el número de prueba y los destinatarios de prueba que permita tu cuenta.
2. Publica la aplicación con HTTPS, base persistente y `APP_URL=https://TU-DOMINIO`. La URL del webhook debe ser accesible para Meta; un `localhost` sin acceso público no sirve.
3. Guarda en el servidor `WHATSAPP_PHONE_NUMBER_ID` (ID del número, no el número telefónico), `WHATSAPP_TOKEN` (token de acceso) y `WHATSAPP_APP_SECRET` (secreto de la app). Para producción, sustituye el token temporal por uno de usuario de sistema con acceso a la cuenta de WhatsApp y permisos de mensajería/gestión; revisa la vigencia que Meta indique al generarlo. No compartas estas claves en el chat ni las pongas en variables `NEXT_PUBLIC_`.
4. Elige `WHATSAPP_VERIFY_TOKEN` y configura en Meta el callback `https://TU-DOMINIO/api/whatsapp` con ese mismo valor. El Verify token autentica el registro inicial; el App Secret valida cada mensaje posterior. **Sin App Secret el webhook rechaza los mensajes**, incluso en desarrollo.
5. Suscríbete al campo `messages` y comprueba que la app esté suscrita a tu WhatsApp Business Account (WABA). Meta documenta `POST /{WABA-ID}/subscribed_apps` en su [colección oficial de Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=folder-13382743-148258e1-3240-4eed-8a78-049bb1d1fe25). Verificar la URL por sí solo no comprueba que lleguen mensajes reales.
6. Configura `OPENAI_API_KEY` para la conversación con IA y registra tu teléfono y rol en **Catálogos → Personal**. Envía desde ese teléfono una consulta como “¿Qué puedes hacer por mí?”; después prueba una acción sobre datos de prueba, confirma el resumen y verifica el resultado y su bitácora en el ERP.
7. Para avisos fuera de la ventana de atención de 24 h, configura una plantilla aprobada con un parámetro `{{1}}` mediante `WHATSAPP_ALERT_TEMPLATE`, y su idioma exacto en `WHATSAPP_TEMPLATE_LANG` (por defecto `es_MX`). El envío de alertas depende de esa aprobación y de la configuración de Meta; no queda activado sólo por guardar el nombre de una plantilla.

**Alcance actual:** el chat web y WhatsApp usan el mismo motor y permisos, con conversaciones separadas. Sin `OPENAI_API_KEY` hay respuestas por reglas; sin credenciales de WhatsApp los envíos se simulan y no llegan a un teléfono. No hay transcripción de audios ni seguimiento de confirmaciones de entrega de Meta. Las imágenes pueden asociarse a evidencia de almacén; el tratamiento de documentos no sustituye un flujo completo de archivos.

**Antes de ampliar el piloto:** el webhook procesa en segundo plano con `after()` y un límite de 60 segundos; todavía no usa una cola persistente con reintentos. Existe deduplicación por ID de mensaje. Las confirmaciones reclaman la propuesta de forma atómica antes de ejecutarla, para que dos solicitudes simultáneas no repitan la misma operación. Una propuesta que queda `en_proceso` tras una interrupción o `fallida` tras un error requiere revisar los registros antes de solicitar otra operación; no se reintenta automáticamente.

La autenticación del webhook se prueba sin red ni credenciales reales con `npx tsx --test src/lib/whatsapp.test.ts`.

### 3. OpenAI
`OPENAI_API_KEY`, `OPENAI_MODEL=gpt-6-luna` y `OPENAI_REASONING_EFFORT=max` son la configuración del agente. Rhino usa la API Responses para combinar razonamiento y herramientas, conservando el contexto entre consultas. El mismo nivel de razonamiento se aplica a las salidas estructuradas y la validación de fotos; `OPENAI_VISION_MODEL` permite elegir otro modelo para visión. El acceso al modelo está aislado en `src/lib/agent/llm.ts`.

El chat web de `/` dispone de hasta 300 segundos para completar sus consultas. Antes de publicar esta versión, aplica las migraciones `agent_atomic_confirmation` y `chat_rls_permissions`: agregan los estados de ejecución y restringen la escritura de propuestas, conversación y auditoría al servidor. El personal sólo puede editarse desde cuentas activas de Dirección o Administración. `supabase/tests/chat_rls_permissions.sql` comprueba estos permisos dentro de una transacción que se revierte.

### 4. GitHub + Vercel
1. Sube el repositorio a GitHub e impórtalo en Vercel.
2. Carga todas las variables de `.env.example` en **Project → Settings → Environment Variables** (incluye `APP_URL` con tu dominio y un `CRON_SECRET` aleatorio).
3. `vercel.json` define dos crons diarios: **resumen matutino** a las 7:00 CDMX (`0 13 * * *` UTC) y **escaneo** a las 14:00 CDMX. En el plan Pro puedes hacer el escaneo cada hora (`0 * * * *`); el plan Hobby sólo permite crons diarios.
4. Rentas, revisiones, salidas de almacén y detenciones disparan sus alertas **en el momento**, sin esperar al cron.

---

## Estructura

```
supabase/migrations/      Esquema, RLS, storage y búsqueda vectorial
scripts/seed.ts           Poblar Supabase (demo o sólo catálogos)
src/app/(app)/            Web: chat principal, resumen, calendario, grúas, inventario, checklists, actividad del agente
src/app/c/[token]/        Wizard de revisión (móvil, acceso por enlace con token)
src/app/api/whatsapp/     Webhook de WhatsApp
src/app/api/cron/         Escaneo proactivo y resumen matutino
src/app/api/files/        Fotos y documentos privados
src/lib/agent/            Prompt, herramientas, orquestador, hallazgos, RAG, visión, evaluaciones
src/lib/services/         Reglas de negocio (rentas, revisiones, inventario, mantenimiento, gastos, avisos)
src/lib/domain/           Lógica pura (estados de grúa, personalización y calidad de revisiones)
src/lib/db/               Acceso a datos: Supabase o memoria (demo) con la misma interfaz
src/lib/demo/             Datos de demostración, plantillas de checklist y políticas
```

## Siguientes pasos sugeridos

### Flota de Sergio (27 de octubre de 2026)

El catálogo investigado está en `src/lib/fleet/sergio.ts`: 23 unidades identificables, con referencias pendientes para conciliar las 3 National y el International. Los prefijos GR/AP evitan confundir números económicos repetidos; PEND identifica claves internas provisionales.

- `npm run fleet:check`: comprueba identidades, importación repetible, fuentes y manejo de datos desconocidos.
- `npm run fleet:preview`: abre una vista local en el puerto 3100, con esta flota y sin operaciones ficticias. Los cambios de esta vista se reinician al detenerla.
- `npm run db:push`: aplica la migración que incorpora categorías de apoyo, datos desconocidos y fichas investigadas.
- `npm run fleet:import`: consulta la base y detecta posibles duplicados sin escribir.
- `npm run fleet:import -- --apply`: inserta unidades, planes dentro del expediente, plantillas por categoría, puntos propios y conciliación para Rhino. No modifica registros importados previamente ni programa fechas de servicio. Si se interrumpe, puede repetirse.

Las capacidades y alturas reportadas se conservan separadas de los valores operativos verificados. Las grúas importadas con capacidad métrica pendiente no pueden confirmarse para renta. Los planes contienen tareas y fuentes; la programación se hace desde el expediente tras validar manual, serie e historial. Sólo dos inspecciones de la familia GMK tienen intervalos numéricos respaldados por un boletín del fabricante. Las fotos de CAT, Matiz y Figo son referencias de familia con crédito y licencia en su expediente, no fotos de las unidades de Rhino.

### Checklists interactivos de mantenimiento

`src/lib/fleet/maintenance-checklists.ts` define 48 procedimientos base vinculados a los 114 planes de las 23 unidades. Cada paso especifica instrucciones, tomas fotográficas y referencia. La primera comprobación exige identificar la placa y el manual aplicable a la serie; los documentos de familia no sustituyen ese manual. No se inventan tolerancias, torques, fluidos o intervalos pendientes.

- Aplica la migración `checklists_mantenimiento` con `npm run db:push`.
- `npm run fleet:checklists` verifica la carga; `npm run fleet:checklists -- --apply` actualiza únicamente las definiciones de checklist dentro de los planes existentes, conservando el resto del expediente e historial.
- Abre **Checklists → Mantenimiento**, entra al expediente de la unidad y usa **Ver checklist** o **Programar** en el plan. Programar crea la orden y una copia de sus pasos en una sola operación; no envía mensajes.
- Para empezar en ese momento, usa **Checklists → Iniciar revisión**: selecciona unidad y tipo, y pulsa **Empezar revisión**. En mantenimiento elige también el plan y el tiempo previsto. Se abre el primer paso pendiente, se retoman revisiones abiertas compatibles y no se envían mensajes. El expediente incluye el mismo acceso y cada plan tiene **Iniciar este trabajo**.
- El enlace de ejecución guarda cada paso, sus fotos por toma, observaciones y firma final. El cierre de la orden exige el último intento aprobado, con evidencia completa y calidad mínima. Repetir conserva el intento anterior. Un servicio parcial no reinicia el contador de servicio general ni libera automáticamente una unidad detenida.
- `npm run fleet:check` incluye cobertura de catálogo y pruebas del flujo, secuencia, manual, fotos, repetición y cierre. Para probar sin tocar la base, `CHECKLIST_PREVIEW=1 npm run fleet:preview` agrega un único trabajo marcado DEMO, en memoria, disponible en `/c/demo-maintenance-preview`. Esta prueba está deshabilitada en producción.

- Subida de archivos PDF al expediente (la columna `file_path` y el visor `/api/files` ya existen).
- Plantillas de WhatsApp adicionales (resumen matutino, solicitud de autorización con botones).
- Exportar `agent_runs` calificados a JSONL para fine-tuning cuando haya 50+ ejemplos buenos.
- Modo offline (PWA) del wizard para obras sin señal.
