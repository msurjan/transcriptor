-- Guarda el orden real de las columnas variables (las que vienen del Excel,
-- sin contar Desde/Hasta) tal como estaban en el archivo original.
-- No se puede confiar en las claves de "datos" (jsonb) para esto: jsonb
-- no garantiza el orden de las claves de un objeto, solo json (texto) lo hace.

alter table sondajes
  add column if not exists columnas jsonb not null default '[]'::jsonb;
