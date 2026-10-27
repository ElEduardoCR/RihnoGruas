alter table public.maintenance_orders add column plan_id text, add column checklist_version text;
create unique index maintenance_open_plan on public.maintenance_orders(crane_id, plan_id)
  where plan_id is not null and status in ('programado', 'en_proceso');
alter table public.inspections add column maintenance_order_id uuid references public.maintenance_orders(id);
create index inspections_maintenance_order on public.inspections(maintenance_order_id,created_at desc) where maintenance_order_id is not null;
create unique index inspections_maintenance_open on public.inspections(maintenance_order_id)
  where maintenance_order_id is not null and status in ('programada','en_progreso','vencida');
alter table public.inspections drop constraint inspections_kind_check;
alter table public.inspections add constraint inspections_kind_check
  check (kind in ('revision_total','pre_renta','post_renta','diaria','mantenimiento'));
alter table public.inspections add constraint inspections_maintenance_link
  check ((kind = 'mantenimiento') = (maintenance_order_id is not null));
alter table public.inspection_items
  add column procedure_steps text[] not null default '{}',
  add column photo_requirements text[] not null default '{}',
  add column reference_label text,
  add column reference_url text,
  add column requires_manual_confirmation boolean not null default false,
  add column manual_confirmed boolean not null default false,
  add column photo_slots int[] not null default '{}';

-- Uses the caller's RLS permissions. No elevated privileges or public execution.
create function public.create_maintenance_checklist(p_order jsonb, p_inspection jsonb, p_items jsonb, p_repeat boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  o public.maintenance_orders;
  i public.inspections;
  saved public.maintenance_orders;
  equipment public.cranes;
begin
  if auth.uid() is not null and not exists (
    select 1 from public.staff where auth_user_id = auth.uid() and active and role in ('direccion','administracion','mecanico')
  ) then raise exception 'No tienes permiso para programar mantenimientos'; end if;
  o := jsonb_populate_record(null::public.maintenance_orders, p_order);
  i := jsonb_populate_record(null::public.inspections, p_inspection);
  select * into equipment from public.cranes where id = o.crane_id and active for update;
  if not found then raise exception 'Unidad activa no encontrada'; end if;
  if o.id is null or i.id is null or i.maintenance_order_id is distinct from o.id
    or i.crane_id is distinct from o.crane_id or i.kind is distinct from 'mantenimiento'
    or o.plan_id is null or o.checklist_version is null then
    raise exception 'Orden y checklist incompatibles';
  end if;
  if not exists (select 1 from jsonb_array_elements(equipment.fleet_profile->'maintenance_plans') p where p->>'id' = o.plan_id) then
    raise exception 'Plan no registrado en la unidad';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) < 3 or jsonb_array_length(p_items) > 100 then
    raise exception 'Checklist sin pasos válidos';
  end if;
  if exists (select 1 from jsonb_populate_recordset(null::public.inspection_items, p_items) s
    where s.inspection_id is distinct from i.id or s.min_photos not between 1 and 8
      or s.requires_photo is distinct from true or cardinality(s.photo_requirements) is distinct from s.min_photos) then
    raise exception 'Los pasos requieren tomas de evidencia definidas';
  end if;
  if not exists (select 1 from jsonb_populate_recordset(null::public.inspection_items, p_items) s where s.position = 0 and s.requires_manual_confirmation) then
    raise exception 'Falta comprobar el manual al inicio';
  end if;
  if not p_repeat and exists (select 1 from public.rentals r where r.crane_id = o.crane_id and r.status in ('confirmada','en_curso')
    and r.start_at < o.scheduled_end and r.end_at > o.scheduled_start) then raise exception 'El mantenimiento choca con una renta'; end if;
  if p_repeat then
    select * into saved from public.maintenance_orders where id = o.id and crane_id = o.crane_id and plan_id = o.plan_id and status in ('programado','en_proceso') for update;
    if not found then raise exception 'La orden no está abierta'; end if;
    if exists (select 1 from public.inspections where maintenance_order_id = o.id and status not in ('completada','cancelada')) then raise exception 'Ya hay un checklist pendiente'; end if;
  else
    insert into public.maintenance_orders(id,crane_id,kind,title,description,scheduled_start,scheduled_end,status,mechanic_id,cost,hour_meter_at,created_by,plan_id,checklist_version)
    values(o.id,o.crane_id,o.kind,o.title,o.description,o.scheduled_start,o.scheduled_end,'programado',o.mechanic_id,0,o.hour_meter_at,o.created_by,o.plan_id,o.checklist_version)
    returning * into saved;
  end if;
  insert into public.inspections(id,crane_id,kind,title,scheduled_for,due_by,assigned_to,status,created_by,maintenance_order_id)
    values(i.id,o.crane_id,'mantenimiento',i.title,o.scheduled_start,o.scheduled_end,o.mechanic_id,'programada',o.created_by,o.id);
  insert into public.inspection_items(id,inspection_id,position,section,title,instructions,response_type,unit,min_value,max_value,
    requires_photo,min_photos,photo_hint,critical,source,source_reason,procedure_steps,photo_requirements,reference_label,reference_url,requires_manual_confirmation)
    select s.id,i.id,s.position,s.section,s.title,s.instructions,s.response_type,s.unit,s.min_value,s.max_value,
      true,s.min_photos,s.photo_hint,s.critical,'plantilla',s.source_reason,s.procedure_steps,s.photo_requirements,s.reference_label,s.reference_url,s.requires_manual_confirmation
    from jsonb_populate_recordset(null::public.inspection_items,p_items) s;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.create_maintenance_checklist(jsonb,jsonb,jsonb,boolean) from public, anon;
grant execute on function public.create_maintenance_checklist(jsonb,jsonb,jsonb,boolean) to authenticated, service_role;

-- Keep the invariant even if an order is updated outside the web form.
create function public.require_maintenance_checklist_completion()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare completed public.inspections;
begin
  if new.plan_id is not null and new.status = 'completado' then
    select * into completed from public.inspections where maintenance_order_id = new.id order by created_at desc limit 1;
    if not found or completed.status <> 'completada' or completed.result is distinct from 'aprobada'
      or coalesce(completed.quality_score,0) < 70 then
      raise exception 'Completa y aprueba el checklist de mantenimiento antes de cerrar la orden';
    end if;
    if not exists (select 1 from public.inspection_items where inspection_id = completed.id)
      or exists (select 1 from public.inspection_items item where inspection_id = completed.id and
        (answered_at is null or passed is distinct from true or (requires_manual_confirmation and not manual_confirmed)
         or cardinality(photo_paths) < min_photos
         or cardinality(photo_slots) <> cardinality(photo_paths)
         or cardinality(photo_hashes) <> cardinality(photo_paths)
         or not (photo_slots @> array(select generate_series(0, item.min_photos - 1)))
         or cardinality(photo_slots) <> (select count(distinct slot) from unnest(item.photo_slots) slot)
         or exists (select 1 from unnest(item.photo_slots) slot where slot < 0))) then
      raise exception 'El checklist tiene pasos o evidencias pendientes';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.require_maintenance_checklist_completion() from public, anon;
create trigger maintenance_checklist_before_completion before insert or update on public.maintenance_orders
  for each row execute function public.require_maintenance_checklist_completion();
