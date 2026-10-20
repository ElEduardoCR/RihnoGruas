# Grúas Rhino · Gestión de flotilla con agente IA por WhatsApp

Sistema de gestión para una flotilla de **grúas móviles, Titanes (camión grúa articulada) y grúas armables en sitio** (torre y oruga de celosía). La idea central: el equipo **no tiene que entrar a la web**. **Rhino**, un agente de IA, atiende por WhatsApp, toma decisiones de agenda, vigila documentos, almacén y revisiones, y **avisa lo importante aunque nadie lo pregunte**. La web queda como tablero de control y auditoría.

**Stack:** Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS v4 · Supabase (Postgres + Auth + Storage + pgvector) · OpenAI (function calling, visión, embeddings) · WhatsApp Cloud API · Vercel (hosting + cron).

---

## Módulos

| Módulo | Qué hace |
|---|---|
| **Dashboard** | “Rhino te informa” (los hallazgos que también llegan por WhatsApp), KPIs de la flotilla, línea de tiempo de la semana por grúa, gasto mensual y por categoría y grúa, grúas detenidas con lo que dejan de facturar, últimas compras, próximas revisiones y estado del almacén. |
| **Calendario** | Vista mensual con el estado de **cada grúa cada día** (disponible, rentada, mantenimiento, detenida y revisiones), panel del día y línea de tiempo de dos semanas. |
| **Grúas** | Catálogo filtrable y **expediente detallado**: ficha técnica, documentos con vigencia (seguro, tarjeta de circulación, verificación, permiso SCT, certificación…), operadores aprobados con estado de licencia, agenda, revisiones, puntos propios de revisión, mantenimiento, consumo de almacén y gastos. |
| **Inventario** | Insumos **generales** (aceites, consumibles) y refacciones **específicas por grúa** (compatibilidad). Libro de movimientos inmutable, conteos cíclicos, compras y **controles antirrobo** (ver abajo). |
| **Checklists** | Revisiones tipo **wizard** (un punto a la vez, foto obligatoria) que el operador abre desde un enlace de WhatsApp. **Personalizadas por grúa** y con **calidad de llenado** medida. |
| **Agente Rhino** | Simulador del chat de WhatsApp, bitácora de decisiones (cada herramienta que usó), alertas enviadas, escaneo proactivo manual y **evaluación de precisión** con 24 casos. |

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
            runAgent()  ── ¿"SÍ"/"NO" a una acción pendiente? ──▶ ejecuta / cancela (determinista)
                 │
                 ▼
        OpenAI (function calling, strict) ◀──▶ 20 herramientas (lectura y escritura)
                 │                                    │
                 │                                    ▼
                 │                     servicios de negocio + reglas (rentas, revisiones,
                 │                     inventario antirrobo, mantenimiento) ──▶ Supabase
                 ▼
     respuesta + "📌 Por cierto" (hallazgo relevante que la persona no conoce)

Vercel Cron ──▶ /api/cron/brief (7:00) y /api/cron/scan ──▶ hallazgos ──▶ alertas por WhatsApp
```

- **Herramientas de lectura**: flota, expediente, disponibilidad, agenda, inventario, alertas de almacén, gastos, vencimientos, revisiones, operadores, políticas (RAG) y reenvío de revisión.
- **Herramientas de escritura**: crear renta, programar revisión (con puntos extra que el modelo justifica), reportar detención, liberar grúa, programar mantenimiento, salida de almacén, autorizar/rechazar salida y registrar compra. **Nunca se ejecutan sin un “SÍ”**: la herramienta valida y prepara un resumen; el cambio ocurre hasta la confirmación.
- **Permisos por rol** (dirección, administración, ventas, mecánico, almacén, operador). Números no registrados no pueden usar el bot.
- **Sin `OPENAI_API_KEY`** Rhino responde consultas por reglas con las mismas herramientas (útil para demo o contingencia).

### Precisión según la guía *Optimizing LLM accuracy* de OpenAI

| Recomendación de la guía | Implementación |
|---|---|
| Empezar con prompt engineering: instrucciones claras, pasos, ejemplos | `src/lib/agent/prompt.ts`: rol, fecha/hora CDMX, usuario y rol, pasos de trabajo, estilo WhatsApp y ejemplos few-shot. |
| Dar contexto/referencia en lugar de confiar en la memoria del modelo (RAG) | Todo dato de la operación sale de **herramientas** sobre la base; políticas internas por **búsqueda vectorial** (pgvector, `match_knowledge`). Se devuelven pocos fragmentos para no meter ruido. |
| Herramientas externas y dividir tareas | 20 herramientas con esquemas **strict**; la lógica crítica (disponibilidad, documentos, antirrobo, agenda de revisiones) es **código determinista**, el modelo sólo decide qué consultar y cómo explicarlo. |
| Evaluar con 20+ casos y medir cada cambio | `src/lib/agent/evals.ts`: 24 casos (herramienta correcta, dato clave en la respuesta, pide confirmación). Se corren desde **Agente Rhino → Correr evaluación**. |
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
2. Ejecuta la migración `supabase/migrations/20261016000000_init.sql` (SQL Editor, o `supabase link` + `supabase db push`). Crea tablas, restricciones (p. ej. una grúa no puede rentarse dos veces en el mismo horario), RLS, buckets privados `evidencias` y `documentos`, y la función de búsqueda vectorial.
3. Copia `.env.example` a `.env.local` y llena las variables de Supabase.
4. Carga datos:
   - Para probar con datos de ejemplo: `npm run db:seed`
   - Para arrancar en limpio sólo con plantillas de checklist y políticas: `npm run db:seed -- --catalogos`
5. Crea los usuarios de la web en **Authentication → Users** y vincúlalos con su registro en `staff`:
   ```sql
   update staff set auth_user_id = (select id from auth.users where email = 'direccion@empresa.mx')
   where email = 'direccion@empresa.mx';
   ```
   Las políticas RLS sólo dejan ver datos a personal activo vinculado. El agente, el webhook y los crons usan la `service_role` del lado del servidor.
6. Captura en `staff.phone` el WhatsApp de cada persona en formato `521XXXXXXXXXX`, sus `alert_topics` (`documentos`, `inventario`, `agenda`, `gastos`, `checklists`, `resumen`, `flota`) y quién puede autorizar (`can_authorize`).

### 2. WhatsApp Cloud API (Meta)
1. En developers.facebook.com crea una app de tipo **Business** y agrega el producto **WhatsApp**.
2. Registra el número exclusivo del bot y copia el **Phone number ID** y un **token permanente** (usuario de sistema) → `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN`.
3. En **Webhooks** configura la URL `https://TU-DOMINIO/api/whatsapp`, un **Verify token** (el mismo valor en `WHATSAPP_VERIFY_TOKEN`) y suscríbete al campo `messages`. Copia el **App Secret** en `WHATSAPP_APP_SECRET`.
4. WhatsApp sólo permite mensajes libres dentro de las **24 h** posteriores al último mensaje de la persona. Para las alertas proactivas crea y aprueba una plantilla (categoría *Utility*) con un parámetro, por ejemplo `rhino_alerta`: “Rhino: {{1}}”, y ponla en `WHATSAPP_ALERT_TEMPLATE`. Rhino usa la plantilla automáticamente fuera de la ventana.

### 3. OpenAI
`OPENAI_API_KEY` y `OPENAI_MODEL` (por defecto `gpt-5-mini`). El acceso al modelo está aislado en `src/lib/agent/llm.ts`, así que cambiar de modelo o proveedor sólo toca ese archivo.

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
src/app/(app)/            Web: dashboard, calendario, grúas, inventario, checklists, agente
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
- Subida de archivos PDF al expediente (la columna `file_path` y el visor `/api/files` ya existen).
- Plantillas de WhatsApp adicionales (resumen matutino, solicitud de autorización con botones).
- Exportar `agent_runs` calificados a JSONL para fine-tuning cuando haya 50+ ejemplos buenos.
- Modo offline (PWA) del wizard para obras sin señal.
