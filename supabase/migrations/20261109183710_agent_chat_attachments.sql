-- Adjuntos privados del chat; sólo el servidor puede subir o analizar archivos.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('chat-adjuntos', 'chat-adjuntos', false, 3145728, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create policy chat_attachments_server_only on storage.objects
  as restrictive for all to anon, authenticated
  using (bucket_id <> 'chat-adjuntos')
  with check (bucket_id <> 'chat-adjuntos');

create table public.agent_attachments (
  id uuid primary key,
  staff_id uuid not null references public.staff(id),
  conversation_id uuid not null references public.agent_conversations(id),
  file_name text not null check (char_length(file_name) between 1 and 200),
  content_type text not null check (content_type in ('application/pdf','image/jpeg','image/png')),
  byte_size integer not null check (byte_size between 1 and 3145728),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text not null unique,
  extraction jsonb check (extraction is null or jsonb_typeof(extraction)='object'),
  created_at timestamptz not null default now(),
  constraint agent_attachments_storage_owner check (
    storage_path = staff_id::text || '/' || conversation_id::text || '/' || id::text ||
      case content_type when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end
  )
);
create index agent_attachments_conversation_idx on public.agent_attachments (conversation_id, created_at);
alter table public.agent_attachments enable row level security;
revoke all on public.agent_attachments from anon, authenticated;
grant select on public.agent_attachments to authenticated;
grant select, insert, update, delete on public.agent_attachments to service_role;
create policy agent_attachments_read_own on public.agent_attachments
  for select to authenticated using (exists (
    select 1 from public.staff actor where actor.id=agent_attachments.staff_id
      and actor.auth_user_id=(select auth.uid()) and actor.active
  ));

create or replace function rhino_private.validate_attachment_conversation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.agent_conversations where id=new.conversation_id
    and staff_id=new.staff_id and phone='web:' || new.staff_id::text) then
    raise exception using errcode='23503', message='El archivo no corresponde al dueño de la conversación.';
  end if;
  return new;
end;
$$;
revoke all on function rhino_private.validate_attachment_conversation() from public, anon, authenticated;
grant execute on function rhino_private.validate_attachment_conversation() to service_role;
create trigger agent_attachment_owner
  before insert or update of staff_id, conversation_id on public.agent_attachments
  for each row execute function rhino_private.validate_attachment_conversation();
