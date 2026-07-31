-- Guarda la calibración de páginas del visor PDF↔fila (pantalla QA) para que
-- no se pierda al recargar la página o volver otro día a seguir revisando.
-- Formato: { "<numero_pagina>": { "yTop": n, "yBottom": n, "depthTop": n, "depthBottom": n } }

alter table sondajes
  add column if not exists calibracion_pdf jsonb not null default '{}'::jsonb;
