-- Run after the migration. Fixtures and checks are rolled back together.
begin;

do $$
declare
  actor public.staff%rowtype;
  other_id uuid := gen_random_uuid();
  conversation_id uuid := gen_random_uuid();
  other_conversation uuid := gen_random_uuid();
  attachment_id uuid := gen_random_uuid();
  other_attachment uuid := gen_random_uuid();
  object_id uuid := gen_random_uuid();
  rejected boolean;
begin
  select * into actor from public.staff where active and auth_user_id is not null limit 1;
  if not found then raise exception 'Test requires active staff linked to auth.'; end if;
  perform set_config('rhino.test_staff_id', actor.id::text, true);
  perform set_config('rhino.test_auth_id', actor.auth_user_id::text, true);
  perform set_config('rhino.test_attachment', attachment_id::text, true);
  perform set_config('rhino.test_other_attachment', other_attachment::text, true);
  perform set_config('rhino.test_object', object_id::text, true);
  if not exists(select 1 from storage.buckets where id='chat-adjuntos' and public=false and file_size_limit=3145728 and allowed_mime_types @> array['application/pdf','image/jpeg','image/png']) then
    raise exception 'Private attachment bucket constraints are missing';
  end if;
  if has_table_privilege('anon','public.agent_attachments','SELECT') or has_table_privilege('authenticated','public.agent_attachments','INSERT') or has_table_privilege('authenticated','public.agent_attachments','UPDATE') or has_table_privilege('authenticated','public.agent_attachments','DELETE') then
    raise exception 'Unexpected attachment metadata privileges';
  end if;
  insert into public.staff(id,full_name,role,active) values(other_id,'Rollback attachment fixture','direccion',true);
  insert into public.agent_conversations(id,staff_id,phone) values
    (conversation_id,actor.id,'web:'||actor.id::text),(other_conversation,other_id,'web:'||other_id::text);
  insert into public.agent_attachments(id,staff_id,conversation_id,file_name,content_type,byte_size,sha256,storage_path) values
    (attachment_id,actor.id,conversation_id,'test.pdf','application/pdf',20,repeat('a',64),actor.id::text||'/'||conversation_id::text||'/'||attachment_id::text||'.pdf'),
    (other_attachment,other_id,other_conversation,'test.pdf','application/pdf',20,repeat('b',64),other_id::text||'/'||other_conversation::text||'/'||other_attachment::text||'.pdf');
  insert into storage.objects(id,bucket_id,name) values(object_id,'chat-adjuntos',actor.id::text||'/'||conversation_id::text||'/'||attachment_id::text||'.pdf');

  rejected := false;
  begin
    update public.agent_attachments set conversation_id=other_conversation,
      storage_path=actor.id::text||'/'||other_conversation::text||'/'||attachment_id::text||'.pdf'
      where id=attachment_id;
  exception when foreign_key_violation then rejected := true;
  end;
  if not rejected then raise exception 'Cross-owner attachment accepted'; end if;

  rejected := false;
  begin
    update public.agent_attachments set storage_path='other-user/file.pdf' where id=attachment_id;
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'Unscoped storage path accepted'; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('rhino.test_auth_id'),true);
do $$
declare rejected boolean := false;
begin
  if not exists(select 1 from public.agent_attachments where id=current_setting('rhino.test_attachment')::uuid) then raise exception 'Owner cannot read metadata'; end if;
  if exists(select 1 from public.agent_attachments where id=current_setting('rhino.test_other_attachment')::uuid) then raise exception 'Other owner metadata visible'; end if;
  if exists(select 1 from storage.objects where id=current_setting('rhino.test_object')::uuid) then raise exception 'Authenticated storage reads bypass server'; end if;
  begin
    insert into storage.objects(bucket_id,name) values('chat-adjuntos','forbidden.pdf');
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Authenticated storage insertion accepted'; end if;
  update storage.objects set name='forbidden.pdf' where id=current_setting('rhino.test_object')::uuid;
  if found then raise exception 'Authenticated storage update accepted'; end if;
  begin
    delete from storage.objects where id=current_setting('rhino.test_object')::uuid;
    if found then raise exception 'Authenticated storage deletion accepted'; end if;
  exception when others then
    -- Current Storage also rejects direct SQL DELETE before evaluating rows.
    if sqlerrm not like 'Direct deletion from storage tables is not allowed.%' then raise; end if;
  end;
end;
$$;
reset role;

update public.staff set active=false where id=current_setting('rhino.test_staff_id')::uuid;
set local role authenticated;
do $$
begin
  if exists(select 1 from public.agent_attachments where id=current_setting('rhino.test_attachment')::uuid) then raise exception 'Inactive owner can read metadata'; end if;
end;
$$;
reset role;

set local role anon;
do $$
declare rejected boolean := false;
begin
  if exists(select 1 from storage.objects where id=current_setting('rhino.test_object')::uuid) then raise exception 'Anonymous storage read accepted'; end if;
  begin
    insert into storage.objects(bucket_id,name) values('chat-adjuntos','anonymous.pdf');
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Anonymous storage insertion accepted'; end if;
end;
$$;
reset role;

rollback;
