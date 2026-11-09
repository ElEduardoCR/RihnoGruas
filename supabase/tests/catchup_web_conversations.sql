-- Catch up messages written by the previous deployment after schema migration.
-- Default is a dry run: inspect the reported counts, then replace the final
-- ROLLBACK with COMMIT to apply. Safe to repeat: only unassigned web messages move.
-- Run after old deployment invocations finish; a later repeat covers any stragglers.
begin;
set local lock_timeout = '5s';
lock table public.wa_messages in share row exclusive mode;

create temporary table conversation_catchup on commit drop as
select gen_random_uuid() as id, staff_id, phone,
       min(created_at) as created_at, count(*)::integer as message_count,
       max(created_at) as last_message_at
from public.wa_messages
where conversation_id is null and staff_id is not null
  and phone = 'web:' || staff_id::text
group by staff_id, phone;

insert into public.agent_conversations(id, staff_id, phone, created_at, message_count, last_message_at)
select id, staff_id, phone, created_at, message_count, last_message_at
from conversation_catchup;

update public.wa_messages message
set conversation_id = catchup.id
from conversation_catchup catchup
where message.conversation_id is null
  and message.staff_id = catchup.staff_id and message.phone = catchup.phone;

select count(*) as conversations_to_assign, coalesce(sum(message_count), 0) as messages_to_assign
from conversation_catchup;

rollback;
