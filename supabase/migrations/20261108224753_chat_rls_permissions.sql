-- El servidor del agente valida sesión, permisos y confirmación antes de escribir.
-- El cliente autenticado no puede alterar propuestas, conversación ni auditoría.
-- La consulta de personal permanece disponible para los catálogos y currentStaff.

alter table public.staff enable row level security;
drop policy if exists staff_all on public.staff;

revoke all on public.staff from anon;
revoke truncate, references, trigger on public.staff from authenticated;
grant select, insert, update, delete on public.staff to authenticated;

-- La comprobación de rol consulta staff sin reentrar en sus propias políticas.
-- El esquema no se expone en la Data API; sólo responde sobre auth.uid().
create schema if not exists rhino_private;
revoke all on schema rhino_private from public, anon;
grant usage on schema rhino_private to authenticated, service_role;

create or replace function rhino_private.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.staff actor
    where actor.auth_user_id = (select auth.uid()) and actor.active
      and actor.role in ('direccion', 'administracion')
  );
$$;
revoke all on function rhino_private.is_manager() from public, anon;
grant execute on function rhino_private.is_manager() to authenticated, service_role;

create policy staff_read on public.staff
  for select to authenticated
  using ((select public.is_staff()));

create policy staff_manager_insert on public.staff
  for insert to authenticated
  with check ((select rhino_private.is_manager()));

create policy staff_manager_update on public.staff
  for update to authenticated
  using ((select rhino_private.is_manager()))
  with check ((select rhino_private.is_manager()));

create policy staff_manager_delete on public.staff
  for delete to authenticated
  using ((select rhino_private.is_manager()));

do $$
declare t text;
begin
  foreach t in array array['agent_pending_actions', 'wa_messages', 'agent_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format($policy$
      create policy agent_read_own_or_manager on public.%I
        for select to authenticated
        using (exists (
          select 1 from public.staff actor
          where actor.auth_user_id = (select auth.uid()) and actor.active
            and (actor.id = %I.staff_id or actor.role in ('direccion', 'administracion'))
        ))
    $policy$, t, t);
  end loop;
end $$;
