-- Run in a transaction after the atomic_inventory_count migration, then ROLLBACK.
-- All UUIDs and SKU values below are disposable fixtures created by this test.
create temporary table inventory_count_fixture (item_id uuid, staff_id uuid);
insert into inventory_count_fixture values (gen_random_uuid(), gen_random_uuid());
grant select on inventory_count_fixture to service_role;

insert into public.staff (id, full_name, role, active, receives_alerts)
select staff_id, 'PRUEBA ROLLBACK CONTEO', 'almacen', true, false from inventory_count_fixture;
insert into public.inventory_items (id, sku, name, category, unit, unit_cost)
select item_id, 'ROLLBACK-' || item_id::text, 'PRUEBA ROLLBACK CONTEO', 'consumible', 'pieza', 10 from inventory_count_fixture;
insert into public.inventory_movements (item_id, kind, qty_delta, status, channel)
select item_id, 'entrada', 8, 'aplicado', 'web' from inventory_count_fixture;

do $$
begin
  if has_function_privilege('anon', 'public.create_inventory_count(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.create_inventory_count(jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.create_inventory_count(jsonb)', 'EXECUTE') then
    raise exception 'FAIL: permisos RPC de conteo incorrectos';
  end if;
end;
$$;

set local role anon;
do $$ begin
  begin
    perform public.create_inventory_count('{}'::jsonb);
    raise exception 'FAIL: anon ejecutó RPC';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin
    perform public.create_inventory_count('{}'::jsonb);
    raise exception 'FAIL: authenticated ejecutó RPC';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role service_role;
do $$
declare
  v_item uuid;
  v_staff uuid;
  v_count public.inventory_counts;
  v_payload jsonb;
  v_stock numeric;
begin
  select item_id, staff_id into v_item, v_staff from inventory_count_fixture;
  v_payload := jsonb_build_object('itemId', v_item, 'countedBy', v_staff, 'countedQty', 5, 'expectedStock', 8, 'expectedUnit', 'pieza');
  v_count := public.create_inventory_count(v_payload);
  if v_count.system_qty <> 8 or v_count.counted_qty <> 5 or v_count.variance <> -3 then
    raise exception 'FAIL: conteo calculado incorrectamente';
  end if;
  begin
    perform public.create_inventory_count(v_payload);
    raise exception 'FAIL: se aceptó el stock anterior por segunda vez';
  exception when serialization_failure then null;
  end;
  select sum(qty_delta) into v_stock from public.inventory_movements where item_id = v_item and status = 'aplicado';
  if v_stock <> 5
     or (select count(*) from public.inventory_counts where item_id = v_item) <> 1
     or (select count(*) from public.inventory_movements where item_id = v_item and kind = 'ajuste') <> 1 then
    raise exception 'FAIL: conteo duplicado o movimiento adicional';
  end if;
  begin
    perform public.create_inventory_count(v_payload || jsonb_build_object('expectedStock', 5, 'expectedUnit', 'litro'));
    raise exception 'FAIL: aceptó unidad distinta';
  exception when serialization_failure then null;
  end;

  -- La comparación acepta únicamente el ruido binario de la expectativa; conserva numeric exacto.
  delete from public.inventory_movements where item_id = v_item;
  insert into public.inventory_movements(item_id, kind, qty_delta, status, channel)
  values (v_item, 'entrada', 0.1, 'aplicado', 'web'), (v_item, 'entrada', 0.2, 'aplicado', 'web');
  v_count := public.create_inventory_count(v_payload || jsonb_build_object('expectedStock', 0.30000000000000004, 'countedQty', 0.2));
  select sum(qty_delta) into v_stock from public.inventory_movements where item_id = v_item and status = 'aplicado';
  if v_count.system_qty <> 0.3 or v_count.variance <> -0.1 or v_stock <> 0.2 then
    raise exception 'FAIL: comparación decimal o ajuste exacto incorrectos';
  end if;
end;
$$;
reset role;
