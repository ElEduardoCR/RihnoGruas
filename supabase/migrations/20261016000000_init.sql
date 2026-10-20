-- =====================================================================
-- Grúas Rhino · Esquema inicial
-- Gestión de flotilla de grúas móviles, Titanes (camión grúa) y grúas
-- armables en sitio, administrada por un agente IA vía WhatsApp.
-- =====================================================================

-- En Supabase las extensiones viven en el esquema "extensions"
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------
-- Personal (usuarios web, operadores y contactos de WhatsApp)
-- ---------------------------------------------------------------------
create table staff (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  role text not null check (role in ('direccion','administracion','operador','mecanico','almacen','ventas')),
  phone text unique,                       -- E.164 sin "+", p. ej. 5215512345678
  email text,
  license_number text,
  license_type text,
  license_expires_on date,
  receives_alerts boolean not null default false,
  alert_topics text[] not null default '{}', -- documentos, inventario, agenda, gastos, checklists, resumen
  can_authorize boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Grúas y expediente
-- ---------------------------------------------------------------------
create table cranes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,               -- número económico (RH-01)
  name text not null,
  type text not null check (type in ('grua_movil','camion_grua','grua_armable')),
  brand text not null,
  model text not null,
  year int,
  serial_number text,
  vin text,
  plates text,
  capacity_tons numeric not null,
  boom_length_m numeric,
  hour_meter numeric not null default 0,
  odometer_km numeric,
  service_interval_hours numeric not null default 250,
  last_service_hours numeric not null default 0,
  base_location text,
  daily_rate numeric,
  notes text,
  acquired_on date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table crane_documents (
  id uuid primary key default gen_random_uuid(),
  crane_id uuid not null references cranes(id) on delete cascade,
  doc_type text not null check (doc_type in ('seguro','tarjeta_circulacion','verificacion','permiso_sct','certificacion_carga','factura','poliza_mantenimiento','manual','otro')),
  title text not null,
  number text,
  issuer text,
  issued_on date,
  expires_on date,
  coverage text,
  amount numeric,
  file_path text,                           -- ruta en el bucket "documentos"
  notes text,
  created_at timestamptz not null default now()
);
create index on crane_documents (crane_id);
create index on crane_documents (expires_on);

-- Operadores aprobados para manipular cada grúa
create table crane_operators (
  id uuid primary key default gen_random_uuid(),
  crane_id uuid not null references cranes(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  approved_on date not null default current_date,
  approved_by uuid references staff(id),
  valid_until date,
  notes text,
  created_at timestamptz not null default now(),
  unique (crane_id, staff_id)
);

-- ---------------------------------------------------------------------
-- Clientes, rentas, mantenimiento y detenciones
-- ---------------------------------------------------------------------
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  rfc text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create table rentals (
  id uuid primary key default gen_random_uuid(),
  crane_id uuid not null references cranes(id),
  client_id uuid not null references clients(id),
  operator_id uuid references staff(id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  site_address text,
  site_notes text,
  rate numeric,
  rate_unit text not null default 'dia' check (rate_unit in ('dia','hora','servicio')),
  status text not null default 'confirmada' check (status in ('cotizada','confirmada','en_curso','finalizada','cancelada')),
  created_by text not null default 'web' check (created_by in ('web','agente')),
  notes text,
  created_at timestamptz not null default now(),
  check (end_at > start_at),
  -- Una grúa no puede estar rentada dos veces en el mismo horario
  constraint rentals_no_overlap exclude using gist (
    crane_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (status in ('confirmada','en_curso'))
);
create index on rentals (start_at, end_at);

create table maintenance_orders (
  id uuid primary key default gen_random_uuid(),
  crane_id uuid not null references cranes(id),
  kind text not null check (kind in ('preventivo','correctivo')),
  title text not null,
  description text,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  status text not null default 'programado' check (status in ('programado','en_proceso','completado','cancelado')),
  mechanic_id uuid references staff(id),
  cost numeric not null default 0,
  hour_meter_at numeric,
  created_by text not null default 'web' check (created_by in ('web','agente')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);
create index on maintenance_orders (scheduled_start, scheduled_end);

create table downtimes (
  id uuid primary key default gen_random_uuid(),
  crane_id uuid not null references cranes(id),
  category text not null check (category in ('falla_mecanica','documentacion','accidente','falta_operador','revision_rechazada','clima','otro')),
  reason text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  reported_by uuid references staff(id),
  inspection_id uuid,
  notes text,
  created_at timestamptz not null default now()
);
create index on downtimes (crane_id, ended_at);

-- ---------------------------------------------------------------------
-- Checklists (wizard con evidencia fotográfica)
-- ---------------------------------------------------------------------
create table checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('revision_total','pre_renta','post_renta','diaria')),
  crane_types text[] not null default '{}',
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates(id) on delete cascade,
  position int not null,
  section text not null,
  title text not null,
  instructions text,
  response_type text not null default 'ok_falla' check (response_type in ('ok_falla','numero','texto')),
  unit text,
  min_value numeric,
  max_value numeric,
  requires_photo boolean not null default true,
  photo_hint text,
  critical boolean not null default false,
  created_at timestamptz not null default now()
);

-- Puntos de revisión exclusivos de una grúa (historial, fallas conocidas, accesorios)
create table crane_checklist_items (
  id uuid primary key default gen_random_uuid(),
  crane_id uuid not null references cranes(id) on delete cascade,
  section text not null,
  title text not null,
  instructions text,
  response_type text not null default 'ok_falla' check (response_type in ('ok_falla','numero','texto')),
  unit text,
  requires_photo boolean not null default true,
  photo_hint text,
  critical boolean not null default false,
  reason text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table inspections (
  id uuid primary key default gen_random_uuid(),
  crane_id uuid not null references cranes(id),
  rental_id uuid references rentals(id) on delete set null,
  template_id uuid references checklist_templates(id),
  kind text not null check (kind in ('revision_total','pre_renta','post_renta','diaria')),
  title text not null,
  scheduled_for timestamptz not null,
  due_by timestamptz not null,
  assigned_to uuid references staff(id),
  status text not null default 'programada' check (status in ('programada','en_progreso','completada','vencida','cancelada')),
  -- token del enlace del wizard (aleatoriedad fuerte de gen_random_uuid, sin depender del esquema de pgcrypto)
  access_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  started_at timestamptz,
  completed_at timestamptz,
  result text check (result in ('aprobada','con_observaciones','rechazada')),
  quality_score int,
  quality_flags text[] not null default '{}',
  hour_meter_reading numeric,
  start_lat double precision,
  start_lng double precision,
  signature_name text,
  ai_summary text,
  created_by text not null default 'agente' check (created_by in ('web','agente')),
  created_at timestamptz not null default now()
);
create index on inspections (scheduled_for);
create index on inspections (crane_id, status);
alter table downtimes add constraint downtimes_inspection_fk foreign key (inspection_id) references inspections(id) on delete set null;

create table inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  position int not null,
  section text not null,
  title text not null,
  instructions text,
  response_type text not null default 'ok_falla' check (response_type in ('ok_falla','numero','texto')),
  unit text,
  min_value numeric,
  max_value numeric,
  requires_photo boolean not null default true,
  photo_hint text,
  critical boolean not null default false,
  source text not null default 'plantilla' check (source in ('plantilla','grua','agente')),
  source_reason text,
  value_text text,
  value_number numeric,
  passed boolean,
  notes text,
  photo_paths text[] not null default '{}',
  photo_hashes text[] not null default '{}',
  photo_taken_at timestamptz,
  shown_at timestamptz,
  answered_at timestamptz,
  seconds_spent int,
  flags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on inspection_items (inspection_id, position);
create index on inspection_items using gin (photo_hashes);

-- ---------------------------------------------------------------------
-- Inventario con trazabilidad (antirrobo)
-- ---------------------------------------------------------------------
create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category text not null check (category in ('aceite','filtro','llanta','refaccion','consumible','herramienta','otro')),
  unit text not null default 'pieza',
  scope text not null default 'general' check (scope in ('general','especifico')),
  min_stock numeric not null default 0,
  unit_cost numeric not null default 0,
  location text,
  requires_return boolean not null default false,  -- cambio contra entrega de pieza usada
  serialized boolean not null default false,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Compatibilidad pieza ↔ grúa y consumo esperado por servicio
create table inventory_compat (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items(id) on delete cascade,
  crane_id uuid not null references cranes(id) on delete cascade,
  expected_qty_per_service numeric,
  created_at timestamptz not null default now(),
  unique (item_id, crane_id)
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  purchased_on date not null default current_date,
  supplier text not null,
  category text not null check (category in ('refacciones','aceites','llantas','combustible','taller','seguros_tramites','herramienta','otros')),
  description text not null,
  crane_id uuid references cranes(id),
  total numeric not null check (total >= 0),
  invoice_number text,
  payment_method text,
  registered_by uuid references staff(id),
  channel text not null default 'web' check (channel in ('web','whatsapp','agente')),
  created_at timestamptz not null default now()
);
create index on purchases (purchased_on);

create table purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  item_id uuid references inventory_items(id),
  description text not null,
  qty numeric not null,
  unit_cost numeric not null,
  created_at timestamptz not null default now()
);

-- Libro mayor de movimientos: el stock es la suma de qty_delta aplicados
create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items(id),
  kind text not null check (kind in ('entrada','salida','ajuste','devolucion')),
  qty_delta numeric not null check (qty_delta <> 0),
  unit_cost numeric,
  crane_id uuid references cranes(id),
  maintenance_order_id uuid references maintenance_orders(id),
  inspection_id uuid references inspections(id),
  purchase_id uuid references purchases(id),
  requested_by uuid references staff(id),
  authorized_by uuid references staff(id),
  reason text,
  evidence_paths text[] not null default '{}',
  serial_numbers text[] not null default '{}',
  status text not null default 'aplicado' check (status in ('aplicado','pendiente_autorizacion','rechazado')),
  flags text[] not null default '{}',
  channel text not null default 'web' check (channel in ('web','whatsapp','agente')),
  created_at timestamptz not null default now()
);
create index on inventory_movements (item_id, status);
create index on inventory_movements (crane_id, created_at);

create table inventory_counts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items(id),
  counted_qty numeric not null,
  system_qty numeric not null,
  variance numeric generated always as (counted_qty - system_qty) stored,
  counted_by uuid references staff(id),
  notes text,
  created_at timestamptz not null default now()
);

create view v_stock as
select i.id as item_id, i.sku, i.name, i.min_stock,
       coalesce(sum(m.qty_delta) filter (where m.status = 'aplicado'), 0) as stock
from inventory_items i
left join inventory_movements m on m.item_id = i.id
group by i.id;

-- ---------------------------------------------------------------------
-- Agente IA: conversación, auditoría, confirmaciones, alertas y RAG
-- ---------------------------------------------------------------------
create table wa_messages (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  staff_id uuid references staff(id),
  direction text not null check (direction in ('in','out')),
  body text not null,
  kind text not null default 'chat' check (kind in ('chat','alerta','resumen','sistema')),
  wa_message_id text unique,
  created_at timestamptz not null default now()
);
create index on wa_messages (phone, created_at desc);

-- Cada ejecución del agente queda registrada: auditoría + dataset para evals / fine-tuning
create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('whatsapp','web','cron','evento','eval')),
  phone text,
  staff_id uuid references staff(id),
  input text not null,
  output text,
  model text,
  tool_calls jsonb not null default '[]',
  tokens_in int,
  tokens_out int,
  latency_ms int,
  error text,
  rating int check (rating between 1 and 5),
  created_at timestamptz not null default now()
);
create index on agent_runs (created_at desc);

-- Acciones que modifican datos esperan confirmación humana ("SÍ")
create table agent_pending_actions (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  staff_id uuid references staff(id),
  tool text not null,
  args jsonb not null,
  summary text not null,
  status text not null default 'pendiente' check (status in ('pendiente','confirmada','cancelada','expirada')),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  result jsonb,
  created_at timestamptz not null default now()
);
create index on agent_pending_actions (phone, status);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  topic text not null check (topic in ('documentos','inventario','agenda','gastos','checklists','resumen','flota')),
  severity text not null default 'aviso' check (severity in ('info','aviso','critica')),
  title text not null,
  body text not null,
  crane_id uuid references cranes(id) on delete cascade,
  sent_to text[] not null default '{}',
  sent_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index on alerts (created_at desc);

create table knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source text,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index on knowledge_docs using hnsw (embedding vector_cosine_ops);

create or replace function match_knowledge(query_embedding vector(1536), match_count int default 4)
returns table (id uuid, title text, source text, content text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select k.id, k.title, k.source, k.content, 1 - (k.embedding <=> query_embedding) as similarity
  from knowledge_docs k
  where k.embedding is not null
  order by k.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------
-- Seguridad: RLS. Sólo personal activo vinculado a auth.users accede
-- desde la web; el agente, el webhook y los crons usan service_role.
-- ---------------------------------------------------------------------
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where auth_user_id = auth.uid() and active);
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'staff','cranes','crane_documents','crane_operators','clients','rentals',
    'maintenance_orders','downtimes','checklist_templates','checklist_template_items',
    'crane_checklist_items','inspections','inspection_items','inventory_items',
    'inventory_compat','purchases','purchase_items','inventory_movements','inventory_counts',
    'wa_messages','agent_runs','agent_pending_actions','alerts','knowledge_docs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy staff_all on %I for all to authenticated using (is_staff()) with check (is_staff())', t);
  end loop;
end $$;

alter view v_stock set (security_invoker = true);

-- Storage: evidencias de checklists/almacén y documentos del expediente
insert into storage.buckets (id, name, public) values
  ('evidencias', 'evidencias', false),
  ('documentos', 'documentos', false)
on conflict (id) do nothing;

create policy "staff lee archivos" on storage.objects for select to authenticated
  using (bucket_id in ('evidencias','documentos') and is_staff());
create policy "staff sube archivos" on storage.objects for insert to authenticated
  with check (bucket_id in ('evidencias','documentos') and is_staff());
