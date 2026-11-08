-- Conteos confirmados por el agente: validar y ajustar existencias en una sola transacción.
-- El servidor identifica al empleado; la función no se concede a sesiones web directas.
create or replace function public.create_inventory_count(p_input jsonb)
returns public.inventory_counts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.inventory_items%rowtype;
  v_count public.inventory_counts%rowtype;
  v_item_id uuid;
  v_staff_id uuid;
  v_counted numeric;
  v_expected numeric;
  v_system numeric;
  v_variance numeric;
  v_unit text;
begin
  if jsonb_typeof(p_input) is distinct from 'object'
     or jsonb_typeof(p_input->'itemId') is distinct from 'string'
     or jsonb_typeof(p_input->'countedBy') is distinct from 'string'
     or jsonb_typeof(p_input->'countedQty') is distinct from 'number'
     or jsonb_typeof(p_input->'expectedStock') is distinct from 'number'
     or jsonb_typeof(p_input->'expectedUnit') is distinct from 'string'
     or (p_input ? 'notes' and jsonb_typeof(p_input->'notes') not in ('string', 'null')) then
    raise exception using errcode = '22023', message = 'Datos del conteo o de la propuesta inválidos.';
  end if;
  v_item_id := (p_input->>'itemId')::uuid;
  v_staff_id := (p_input->>'countedBy')::uuid;
  v_counted := (p_input->>'countedQty')::numeric;
  v_expected := (p_input->>'expectedStock')::numeric;
  v_unit := p_input->>'expectedUnit';
  if v_counted < 0 or length(btrim(v_unit)) = 0 then
    raise exception using errcode = '22023', message = 'La cantidad contada debe ser no negativa y la unidad es obligatoria.';
  end if;
  perform 1 from public.staff
  where id = v_staff_id and active and role in ('direccion', 'administracion', 'almacen')
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'Sin permiso para registrar este conteo.';
  end if;

  -- Todos los conteos del mismo artículo se serializan aquí antes de leer el libro mayor.
  select * into v_item from public.inventory_items where id = v_item_id for update;
  if not found or not v_item.active then
    raise exception using errcode = '22023', message = 'Artículo no encontrado o inactivo.';
  end if;
  select coalesce(sum(qty_delta), 0) into v_system
  from public.inventory_movements where item_id = v_item_id and status = 'aplicado';
  -- Sólo la expectativa tolera el ruido binario de JS (p. ej. 0.1 + 0.2); no se redondea el libro.
  if abs(v_system - v_expected) > 0.000000001 or v_item.unit is distinct from v_unit then
    raise exception using errcode = '40001', message = 'El inventario cambió desde el resumen. Prepara nuevamente el conteo.';
  end if;
  v_variance := v_counted - v_system;
  insert into public.inventory_counts (item_id, counted_qty, system_qty, counted_by, notes)
  values (v_item_id, v_counted, v_system, v_staff_id, p_input->>'notes')
  returning * into v_count;
  if v_variance <> 0 then
    insert into public.inventory_movements (
      item_id, kind, qty_delta, unit_cost, requested_by, reason, status, flags, channel
    ) values (
      v_item_id, 'ajuste', v_variance, v_item.unit_cost, v_staff_id,
      'Ajuste por conteo cíclico (' || case when v_variance > 0 then 'sobrante' else 'faltante' end || ')',
      'aplicado', array['diferencia_conteo'], 'agente'
    );
  end if;
  return v_count;
end;
$$;

revoke all on function public.create_inventory_count(jsonb) from public, anon, authenticated;
grant execute on function public.create_inventory_count(jsonb) to service_role;
