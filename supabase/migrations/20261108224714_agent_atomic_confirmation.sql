-- La confirmación reclama la propuesta con un UPDATE condicionado a status=pendiente.
-- en_proceso nunca se devuelve a pendiente: tras una interrupción se revisa el resultado
-- antes de crear otra propuesta, para evitar repetir una operación que pudo aplicarse.
alter table public.agent_pending_actions
  drop constraint if exists agent_pending_actions_status_check;

alter table public.agent_pending_actions
  add constraint agent_pending_actions_status_check
  check (status in ('pendiente', 'en_proceso', 'confirmada', 'cancelada', 'expirada', 'fallida'));
