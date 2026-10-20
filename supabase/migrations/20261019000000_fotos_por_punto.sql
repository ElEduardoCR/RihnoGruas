-- Varias fotos por punto de revisión: cada punto define cuántas fotos mínimas
-- requiere (p. ej. "daños visibles" = 4 lados). Las rutas ya eran arreglos.

alter table checklist_template_items
  add column min_photos int not null default 1 check (min_photos between 0 and 8);

alter table crane_checklist_items
  add column min_photos int not null default 1 check (min_photos between 0 and 8);

alter table inspection_items
  add column min_photos int not null default 1 check (min_photos between 0 and 8);

-- Puntos de las plantillas base que por naturaleza piden varias fotos
update checklist_template_items set min_photos = 4 where title = 'Daños visibles nuevos';
update checklist_template_items set min_photos = 3 where title = 'Tarjeta de circulación, póliza y permiso SCT';
update checklist_template_items set min_photos = 2 where title in (
  'Tarjeta de circulación y póliza a bordo',
  'Llantas sin cortes y con presión correcta',
  'Llantas y birlos',
  'Estabilizadores extienden, nivelan y retraen',
  'Estabilizadores extienden y sostienen',
  'Tramos de torre / celosía sin fisuras'
);
