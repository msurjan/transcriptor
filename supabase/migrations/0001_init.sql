-- Graiph Transcripción de Sondajes — esquema inicial v1
-- Correr en el MISMO proyecto Supabase que ya usa el cotizador (no crear uno nuevo).

create table if not exists usuarios (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  rol         text not null check (rol in ('transcriptor','qa','lider','admin')),
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

create table if not exists empresas (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null unique,
  config_plantilla  jsonb default '{}'::jsonb,  -- futuro: leyenda de codigos propia de la empresa
  creado_en         timestamptz not null default now()
);

create table if not exists sondajes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id),
  codigo      text not null,                     -- ej. "DDH-T-10"
  pdf_path    text,                               -- ruta en Supabase Storage, bucket sondajes-pdfs
  metros_totales numeric,
  estado      text not null default 'cargado'
              check (estado in ('cargado','en_qa','en_validacion','validado')),
  creado_por  uuid references usuarios(id),
  creado_en   timestamptz not null default now(),
  unique (empresa_id, codigo)
);

create table if not exists filas_transcripcion (
  id              uuid primary key default gen_random_uuid(),
  sondaje_id      uuid not null references sondajes(id) on delete cascade,
  desde           numeric not null,
  hasta           numeric not null,
  datos           jsonb not null default '{}'::jsonb,  -- todas las columnas variables por plantilla

  estado_qa       text not null default 'pendiente'
                  check (estado_qa in ('pendiente','aprobado','corregido','rechazado')),
  comentario_qa   text,
  revisado_por    uuid references usuarios(id),
  revisado_en     timestamptz,

  estado_lider    text not null default 'pendiente'
                  check (estado_lider in ('pendiente','validado','rechazado')),
  comentario_lider text,
  validado_por    uuid references usuarios(id),
  validado_en     timestamptz,

  creado_en       timestamptz not null default now(),
  unique (sondaje_id, desde, hasta)
);

create index if not exists idx_filas_sondaje on filas_transcripcion(sondaje_id);
create index if not exists idx_filas_revisor on filas_transcripcion(revisado_por);
create index if not exists idx_filas_validador on filas_transcripcion(validado_por);

-- Vista rapida para la metrica "cuanto revisa cada usuario"
create or replace view metricas_revision as
select
  u.nombre,
  count(*) filter (where f.revisado_por = u.id)  as filas_revisadas_qa,
  count(*) filter (where f.validado_por = u.id)  as filas_validadas_lider
from usuarios u
left join filas_transcripcion f
  on f.revisado_por = u.id or f.validado_por = u.id
group by u.nombre;

-- Storage buckets (correr en el dashboard de Supabase > Storage, o via API,
-- esto queda como referencia de los nombres a usar):
--   sondajes-pdfs        (los PDF originales escaneados)
--   sondajes-exportados   (los .xlsx finales validados)
