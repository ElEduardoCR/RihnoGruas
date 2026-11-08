-- Ejecutar con psql como postgres. Toda la migración y las pruebas se revierten.
-- Requiere un miembro activo de Dirección/Administración vinculado a Auth.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '15s';
set local lock_timeout = '2s';
\ir ../migrations/20261108224753_chat_rls_permissions.sql

create temp table rls_chat_fixture on commit drop as
select id as actor_id, auth_user_id as actor_uid,
       gen_random_uuid() as other_id, gen_random_uuid() as own_message_id,
       gen_random_uuid() as other_message_id, gen_random_uuid() as pending_id
from public.staff
where active and auth_user_id is not null and role in ('direccion', 'administracion')
limit 1;
grant select on rls_chat_fixture to authenticated, anon, service_role;
do $$ begin
  if not exists (select 1 from rls_chat_fixture) then
    raise exception 'La prueba requiere personal administrativo vinculado a Auth.';
  end if;
  if has_function_privilege('anon', 'rhino_private.is_manager()', 'execute') then
    raise exception 'El rol anónimo puede ejecutar la comprobación privada de permisos.';
  end if;
end $$;

insert into public.staff (id, full_name, role)
select other_id, 'Prueba RLS temporal', 'operador' from rls_chat_fixture;
insert into public.wa_messages (id, phone, staff_id, direction, body)
select own_message_id, 'test:rls:own', actor_id, 'in', 'Prueba temporal' from rls_chat_fixture
union all
select other_message_id, 'test:rls:other', other_id, 'in', 'Prueba temporal' from rls_chat_fixture;
insert into public.agent_pending_actions (id, phone, staff_id, tool, args, summary, expires_at)
select pending_id, 'test:rls:own', actor_id, 'registrar_cliente', '{}', 'Prueba temporal', now() + interval '1 hour'
from rls_chat_fixture;

select set_config('request.jwt.claim.sub', actor_uid::text, true) from rls_chat_fixture;
set local role authenticated;
do $$ declare changed int; begin
  if not rhino_private.is_manager() then raise exception 'No reconoce a Dirección activa.'; end if;
  if (select count(*) from public.wa_messages where id in (
      select own_message_id from rls_chat_fixture union all select other_message_id from rls_chat_fixture
    )) <> 2 then raise exception 'Dirección no pudo leer la auditoría del equipo.'; end if;
  update public.staff set full_name = 'Prueba RLS administrativa'
    where id = (select other_id from rls_chat_fixture);
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Dirección no pudo editar el catálogo de personal.'; end if;
  begin
    update public.agent_pending_actions set args = '{"alterado":true}'
      where id = (select pending_id from rls_chat_fixture);
    raise exception 'Un usuario web pudo alterar argumentos de una propuesta.';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.wa_messages where id = (select own_message_id from rls_chat_fixture);
    raise exception 'Un usuario web pudo eliminar el historial.';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
-- El cambio no sale de esta transacción; otra sesión conserva el rol original.
update public.staff set role = 'operador' where id = (select actor_id from rls_chat_fixture);
set local role authenticated;
do $$ declare changed int; begin
  if rhino_private.is_manager() then raise exception 'Un operador tiene privilegios administrativos.'; end if;
  if (select count(*) from public.wa_messages where id in (
      select own_message_id from rls_chat_fixture union all select other_message_id from rls_chat_fixture
    )) <> 1 then raise exception 'Un operador puede leer una conversación ajena.'; end if;
  update public.staff set role = 'direccion' where id = (select actor_id from rls_chat_fixture);
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Un operador pudo elevar su propio rol.'; end if;
  delete from public.staff where id = (select other_id from rls_chat_fixture);
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Un operador pudo borrar personal.'; end if;
  begin
    insert into public.staff(full_name, role) values ('Alta no permitida', 'direccion');
    raise exception 'Un operador pudo crear personal de Dirección.';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
update public.staff set active = false where id = (select actor_id from rls_chat_fixture);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.wa_messages where id = (select own_message_id from rls_chat_fixture)) then
    raise exception 'Una cuenta inactiva pudo leer conversaciones.';
  end if;
end $$;

reset role;
set local role service_role;
do $$ declare changed int; begin
  update public.agent_pending_actions set summary = 'Servidor autorizado'
    where id = (select pending_id from rls_chat_fixture);
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'El servidor no puede actualizar propuestas.'; end if;
end $$;

reset role;
set local role anon;
do $$ begin
  begin
    perform id from public.wa_messages limit 1;
    raise exception 'El rol anónimo pudo consultar conversaciones.';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select 'chat_rls_permissions: OK (cambios revertidos)' as result;
rollback;
