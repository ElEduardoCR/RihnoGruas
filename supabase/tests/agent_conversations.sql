-- Run after the migration in a transaction. No fixture survives ROLLBACK.
begin;

do $$
declare
  actor public.staff%rowtype;
  other_id uuid := gen_random_uuid();
  own_id uuid := gen_random_uuid();
  other_conversation uuid := gen_random_uuid();
  latest timestamptz := now();
  invalid_accepted boolean;
begin
  select * into actor from public.staff where active and auth_user_id is not null limit 1;
  if not found then raise exception 'Test requires an active staff record linked to auth.'; end if;
  perform set_config('rhino.test_staff_id', actor.id::text, true);
  perform set_config('rhino.test_auth_id', actor.auth_user_id::text, true);
  perform set_config('rhino.test_conversation_id', own_id::text, true);
  perform set_config('rhino.test_other_conversation', other_conversation::text, true);

  insert into public.staff(id, full_name, role, active) values (other_id, 'Rollback conversation fixture', 'operador', true);
  insert into public.agent_conversations(id, staff_id, phone) values
    (own_id, actor.id, 'web:' || actor.id::text),
    (other_conversation, other_id, 'web:' || other_id::text);
  insert into public.wa_messages(conversation_id, staff_id, phone, direction, body, created_at) values
    (own_id, actor.id, 'web:' || actor.id::text, 'in', 'Solicitud de prueba', latest),
    (own_id, actor.id, 'web:' || actor.id::text, 'out', 'Respuesta anterior de prueba', latest - interval '1 minute');
  if not exists(select 1 from public.agent_conversations where id=own_id and message_count=2 and last_message_at=latest) then
    raise exception 'Message counter or latest timestamp is incorrect';
  end if;

  invalid_accepted := false;
  begin
    insert into public.wa_messages(conversation_id, staff_id, phone, direction, body)
    values (own_id, other_id, 'web:' || other_id::text, 'in', 'Must be rejected');
    invalid_accepted := true;
  exception when foreign_key_violation then null;
  end;
  if invalid_accepted then raise exception 'Cross-owner message accepted'; end if;

  invalid_accepted := false;
  begin
    insert into public.wa_messages(conversation_id, staff_id, phone, direction, body)
    values (own_id, actor.id, '5216140000000', 'in', 'Must be rejected');
    invalid_accepted := true;
  exception when foreign_key_violation then null;
  end;
  if invalid_accepted then raise exception 'Cross-channel message accepted'; end if;

  invalid_accepted := false;
  begin
    update public.agent_conversations set summary='Invalid', summary_message_count=3 where id=own_id;
    invalid_accepted := true;
  exception when check_violation then null;
  end;
  if invalid_accepted then raise exception 'Summary claimed unseen messages'; end if;

  update public.agent_conversations set summary='Summary of two messages', summary_message_count=2, summary_updated_at=now() where id=own_id and summary_message_count=0;
  update public.agent_conversations set summary='Stale summary', summary_message_count=1 where id=own_id and summary_message_count=0;
  if found then raise exception 'Stale summary overwrote new memory'; end if;
  if has_table_privilege('anon', 'public.agent_conversations', 'SELECT') or has_table_privilege('authenticated', 'public.agent_conversations', 'INSERT') or has_table_privilege('authenticated', 'public.agent_conversations', 'UPDATE') or has_table_privilege('authenticated', 'public.agent_conversations', 'DELETE') then
    raise exception 'Unexpected conversation privileges';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('rhino.test_auth_id'), true);
do $$
begin
  if not exists(select 1 from public.agent_conversations where id=current_setting('rhino.test_conversation_id')::uuid) then raise exception 'Owner cannot read conversation'; end if;
  if exists(select 1 from public.agent_conversations where id=current_setting('rhino.test_other_conversation')::uuid) then raise exception 'Another staff conversation is visible'; end if;
end;
$$;
reset role;

rollback;
