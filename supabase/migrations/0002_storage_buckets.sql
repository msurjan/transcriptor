-- Buckets de Storage para el Transcriptor — correr en el mismo proyecto Supabase.
-- Acceso abierto (sin restricción), mismo criterio ya usado en 0001_init.sql:
-- sin seguridad real en v1 (ver SCOPE.md).

insert into storage.buckets (id, name, public)
values
  ('sondajes-pdfs', 'sondajes-pdfs', true),
  ('sondajes-exportados', 'sondajes-exportados', true)
on conflict (id) do nothing;

create policy "anon lee sondajes-pdfs"
  on storage.objects for select to anon
  using (bucket_id = 'sondajes-pdfs');

create policy "anon sube sondajes-pdfs"
  on storage.objects for insert to anon
  with check (bucket_id = 'sondajes-pdfs');

create policy "anon lee sondajes-exportados"
  on storage.objects for select to anon
  using (bucket_id = 'sondajes-exportados');

create policy "anon sube sondajes-exportados"
  on storage.objects for insert to anon
  with check (bucket_id = 'sondajes-exportados');
