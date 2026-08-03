# ARQUITECTURA — Graiph Transcripción de Sondajes (v1)

## Stack (deliberadamente aburrido)

- **Backend**: Supabase (Postgres + Storage). Ya existe el proyecto (se usa
  en el cotizador) — se agregan tablas nuevas ahí, no se crea un proyecto
  Supabase separado. Un solo backend para todas las herramientas internas.
- **Frontend**: HTML + JS vanilla, sin framework, una página por rol
  (`transcriptor.html`, `qa.html`, `exportar.html`).
  Es la misma línea de las dos herramientas ya construidas (cotizador, QA
  tool v0) — no se introduce React/Next.js para una app de 3 pantallas y
  ~5 usuarios internos. Si el proyecto crece, se reevalúa; no antes.
- **Hosting**: a definir con Claude Code — Vercel es la opción por defecto
  si no hay una preferencia distinta (Graiph ya tiene el connector
  disponible).
- **Motor de construcción**: Claude Code.

Por qué "aburrido" es la decisión correcta acá: el problema no es técnico
(la app es CRUD + un visor de PDF), es de gente (3 roles, ~5 personas) y de
disciplina de datos (que la transcripción sea confiable). Un stack más
sofisticado no resuelve ninguno de esos dos problemas — solo agrega
superficie de mantenimiento para un no-programador que ya dijo que
gestiona mal el control de versiones.

## Por qué los datos de cada fila van en una columna `jsonb`, no en columnas fijas

Ya confirmamos que cada EMPRESA tiene su propia plantilla fija de columnas
(Bear Creek ≠ otra minera), pero varía ENTRE empresas. Si `filas_transcripcion`
tuviera una columna por cada campo posible (alteración, brecha, estructura,
óxidos...), cada empresa nueva con columnas distintas requeriría una
migración de base de datos. Guardando el contenido de la fila como `jsonb`
(`{"Clay (undiff.)": "m", "Jarosite %": "2", ...}`), el esquema no cambia
nunca — solo cambian las claves del objeto, que vienen del Excel/plantilla
que se cargó. `Desde` y `Hasta` sí son columnas propias (`numeric`), porque
son las que se usan para la calibración automática PDF↔fila y para
ordenar/filtrar — todo lo demás es variable por empresa y vive en el jsonb.

## Esquema (ver `supabase/migrations/0001_init.sql` para el SQL real)

```
usuarios          (id, nombre, rol, activo)
empresas          (id, nombre, config_plantilla jsonb)   -- futuro: leyenda de códigos por empresa
sondajes          (id, empresa_id, codigo, pdf_path, columnas jsonb, estado, creado_por, creado_en,
                   exportado_por, exportado_en)
filas_transcripcion
                  (id, sondaje_id, desde, hasta, datos jsonb, datos_original jsonb,
                   estado_qa, comentario_qa, revisado_por, revisado_en,
                   estado_lider, comentario_lider, validado_por, validado_en)
```

`datos_original` es una copia de `datos` tomada en el momento de la carga
(antes de cualquier edición de QA) — nunca se modifica después. Sirve solo
para calcular el % de efectividad del modelo en `exportar.html`; sondajes
cargados antes de este campo lo tienen `null` y su efectividad se muestra
como "N/D".

`estado` de un sondaje: `cargado -> en_qa -> en_validacion -> validado`.
`estado_qa` de una fila: `pendiente | aprobado | corregido | rechazado` (el
esquema permite `rechazado`, pero la pantalla de QA ya no lo usa — ver
"Marcado automático" abajo). `rechazado` sigue existiendo como valor válido
por compatibilidad con datos viejos.
`estado_lider` de una fila: `pendiente | validado | rechazado`.

### Marcado automático de `estado_qa` (31-jul-2026)

QA no marca a mano la mayoría de las filas: si el junior edita cualquier
valor de una fila (mientras estaba `pendiente`), esa fila pasa sola a
`corregido`. Si el junior pasa a otra fila sin haber editado la actual,
esa fila pasa sola a `aprobado` (se asume que ya estaba bien). Los botones
Aprobar/Corregir siguen disponibles para marcar a mano si hace falta. No
existe un flujo de "rechazar" una fila — el trabajo es siempre revisar y
corregir ahí mismo, no reenviar nada.

## Flujo end-to-end

1. **Transcriptor** elige empresa (de la tabla `empresas`), sube el PDF
   (va a Supabase Storage, bucket `sondajes-pdfs`), y carga las filas
   iniciales — el mecanismo exacto de cómo se generan esas filas es la
   pregunta pendiente en `SCOPE.md`. El sondaje queda en estado `cargado`,
   luego pasa a `en_qa`.
2. **QA** (uno o más juniors, cada uno con su propio sondaje asignado) abre
   `qa.html?sondaje=ID`, revisa fila por fila con el mismo visor PDF↔Excel
   ya construido, pero leyendo/escribiendo contra Supabase en vez de un
   archivo local. Cada fila marcada queda con `revisado_por` = el nombre
   elegido en el selector de usuario. Al seleccionar una fila (si la página
   correspondiente ya está calibrada), el visor de PDF hace zoom automático
   hasta llenar el ancho visible del panel y hace scroll para dejar centrado
   el tramo (Desde–Hasta) resaltado, así el tramo que se está revisando
   siempre queda a la vista tanto en la tabla como en el PDF.
3. Cuando todas las filas de un sondaje tienen `estado_qa != pendiente`, el
   sondaje pasa a `en_validacion`.
4. **Líder** abre la misma pantalla en modo líder (`qa.html?sondaje=ID&modo=lider`,
   **todavía no construido**): ve el estado_qa y comentario de cada fila,
   puede editar si encuentra un error, y marca `estado_lider`. Cuando el
   100% está `validado`, el sondaje pasa a `validado`.
5. **Exportar** (`exportar.html`, roles `lider`/`admin`): pantalla aparte
   que lista TODOS los sondajes (cualquier estado), con progreso de QA y %
   de efectividad del modelo por sondaje. Se pueden seleccionar varios con
   checkboxes ("Seleccionar todos" incluido) y exportar en `.xlsx` o `.csv`
   — un archivo por sondaje seleccionado, descargado localmente Y subido a
   Supabase Storage (bucket `sondajes-exportados`) en el mismo click. Cada
   exportación deja registrado `exportado_por`/`exportado_en` en `sondajes`
   (se sobrescribe en cada nueva exportación — no hay historial de
   exportaciones anteriores, ver "Auditoría" en SCOPE.md).

## Métrica "cuánto revisa cada usuario"

Se calcula directamente de la tabla `filas_transcripcion`:
`COUNT(*) GROUP BY revisado_por` (filas de QA) y `GROUP BY validado_por`
(filas de validación del líder). No se necesita una tabla de log aparte
para v1 — ver "Fuera de alcance" en SCOPE.md.
