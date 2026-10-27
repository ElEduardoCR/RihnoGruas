-- Support vehicles share the existing dossier, documents, inventory and workshop.
-- Unknown values must remain unknown; no invented operating limits or service history.
alter table public.cranes drop constraint cranes_type_check;
alter table public.cranes add constraint cranes_type_check check (
  type in ('grua_movil','camion_grua','grua_armable','telehandler','tractocamion','remolque','vehiculo_apoyo')
);
alter table public.cranes alter column capacity_tons drop not null;
alter table public.cranes alter column hour_meter drop not null;
alter table public.cranes alter column hour_meter drop default;
alter table public.cranes alter column last_service_hours drop not null;
alter table public.cranes alter column last_service_hours drop default;
alter table public.cranes alter column service_interval_hours drop not null;
alter table public.cranes alter column service_interval_hours drop default;
alter table public.cranes add column fleet_profile jsonb;
alter table public.cranes add constraint cranes_fleet_profile_object
  check (fleet_profile is null or jsonb_typeof(fleet_profile) = 'object');
create unique index cranes_fleet_import_key on public.cranes ((fleet_profile->>'import_key'))
  where fleet_profile->>'import_key' is not null;
comment on column public.cranes.fleet_profile is
  'Reported inventory, sourced research and draft maintenance plans; not a load chart or verified operating specification.';
