-- Conversaciones web separadas; la memoria conserva el vínculo con su historial.
create table public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id),
  phone text not null,
  created_at timestamptz not null default now(),
  message_count integer not null default 0 check (message_count >= 0),
  last_message_at timestamptz,
  summary text check (summary is null or char_length(summary) <= 6000),
  summary_message_count integer not null default 0,
  summary_updated_at timestamptz,
  constraint agent_conversations_web_owner check (phone = 'web:' || staff_id::text),
  constraint agent_conversations_summary_count check (summary_message_count >= 0 and summary_message_count <= message_count)
);
create index agent_conversations_staff_activity_idx
  on public.agent_conversations (staff_id, last_message_at desc) where message_count > 0;

alter table public.agent_conversations enable row level security;
revoke all on public.agent_conversations from anon, authenticated;
grant select on public.agent_conversations to authenticated;
grant select, insert, update, delete on public.agent_conversations to service_role;
create policy agent_conversations_read_own on public.agent_conversations
  for select to authenticated
  using (exists (
    select 1 from public.staff actor
    where actor.id = agent_conversations.staff_id
      and actor.auth_user_id = (select auth.uid()) and actor.active
  ));

alter table public.wa_messages
  add column conversation_id uuid references public.agent_conversations(id);
create index wa_messages_conversation_created_idx
  on public.wa_messages (conversation_id, created_at, id) where conversation_id is not null;

-- Una conversación histórica por persona; WhatsApp conserva su ruta existente.
insert into public.agent_conversations (staff_id, phone, created_at, message_count, last_message_at)
select staff_id, phone, min(created_at), count(*)::integer, max(created_at)
from public.wa_messages
where staff_id is not null and phone = 'web:' || staff_id::text
group by staff_id, phone;

update public.wa_messages message
set conversation_id = conversation.id
from public.agent_conversations conversation
where message.staff_id = conversation.staff_id and message.phone = conversation.phone;

-- Escritura del servidor solamente. El dueño y el canal deben coincidir incluso
-- usando service_role, y el contador se actualiza dentro de la misma transacción.
create or replace function rhino_private.count_conversation_message()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.conversation_id is null then return new; end if;
  update public.agent_conversations
  set message_count = message_count + 1,
      last_message_at = greatest(last_message_at, new.created_at)
  where id = new.conversation_id
    and staff_id = new.staff_id and phone = new.phone;
  if not found then
    raise exception using errcode = '23503', message = 'La conversación no corresponde al empleado y canal del mensaje.';
  end if;
  return new;
end;
$$;
revoke all on function rhino_private.count_conversation_message() from public, anon, authenticated;
grant execute on function rhino_private.count_conversation_message() to service_role;
create trigger wa_message_conversation_count
  before insert on public.wa_messages
  for each row execute function rhino_private.count_conversation_message();
