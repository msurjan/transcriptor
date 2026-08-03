-- Pantalla de exportación: registro de quién/cuándo exportó cada sondaje,
-- y snapshot del dato tal como lo entregó el transcriptor (para poder medir
-- % de efectividad del modelo comparando contra el valor final post-QA).

alter table filas_transcripcion
  add column if not exists datos_original jsonb;

alter table sondajes
  add column if not exists exportado_por uuid references usuarios(id),
  add column if not exists exportado_en timestamptz;
