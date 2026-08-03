# SCOPE — Graiph Transcripción de Sondajes (v1)

Este documento es la fuente de verdad del alcance del MVP. Si en algún momento
del desarrollo se propone agregar algo que no está aquí, la respuesta por
defecto es NO hasta que se evalúe explícitamente y se actualice este archivo.
Esa es la regla, no una sugerencia.

## Decisiones de alcance ya cerradas (30-jul-2026)

| Decisión | Resuelto como | Por qué |
|---|---|---|
| Autenticación | Selector de nombre + contraseña compartida por rol (`admin` → "admin", el resto → "graiph"), actualizado 31-jul-2026 | No es seguridad real (la clave anon de Supabase ya queda visible en el navegador de todos modos) — es solo un filtro para que no entre cualquiera al usarse desde internet. Recuperación de cuenta y passwords por persona siguen fuera de v1. |
| Validación del líder | Reusa el QA tool en "modo líder" | El líder ve lo que ya marcó el junior (estado + comentario) y agrega su propio veredicto. No se construye una pantalla nueva desde cero. |
| Motor de construcción | Claude Code, único | No se mezcla con Antigravity en v1. |
| Persistencia | Supabase (ya en uso en el cotizador) — Postgres + Storage + sin login de Supabase Auth (ver punto de autenticación) | Un solo backend para todas las herramientas de Graiph, no uno nuevo por proyecto. |
| Descarga | Botón "Exportar" simultáneo: descarga .xlsx local + queda guardado en Supabase Storage | Ya lo teníamos resuelto en el QA tool v0, solo se conecta a Storage. |
| Borrar sondaje | Solo `admin`, desde la lista en `transcriptor.html`, con confirmación previa | Necesario para corregir errores de carga (empresa/código equivocado) sin dejar basura en la base. Borra la fila del sondaje (las filas de `filas_transcripcion` caen en cascada) y el PDF de Storage. |
| Pantalla de exportación (3-ago-2026) | Pantalla nueva `exportar.html`, separada del QA tool, solo para `lider`/`admin`. Lista TODOS los sondajes (cualquier estado, no solo los validados) con progreso QA, % de efectividad del modelo y quién/cuándo exportó cada uno. Selección múltiple + exportar en `.xlsx` o `.csv`, un archivo por sondaje seleccionado (no un combinado). | El líder/admin necesita visibilidad de todo el pipeline, no solo de lo ya validado. "Un archivo por sondaje" porque cada sondaje es una entrega independiente al cliente. |
| Auditoría de cambios | Se mantiene la decisión original: solo el último estado + quién + cuándo (`revisado_por/revisado_en`, `validado_por/validado_en`, y ahora `exportado_por/exportado_en`). NO se agrega un historial completo de cambios. | Confirmado explícitamente al construir la pantalla de exportación (3-ago-2026) — sigue fuera de alcance de v1, ver abajo. |
| % de efectividad del modelo de transcripción | Campo por campo: se compara el valor final (post-QA) contra `datos_original` (snapshot tomado al momento de la carga, antes de cualquier edición de QA), por cada columna de cada fila. Sondajes cargados antes de este cambio no tienen `datos_original` y se muestran como "N/D", no como 0%. | Es la métrica más precisa para saber qué tan bien transcribe el modelo, no solo si la fila se tocó o no. |

## Transcriptor: resuelto (30-jul-2026)

**Opción A, manual vía Claude.ai.** El PDF se procesa en una conversación
normal de Claude.ai (como se hizo con DDH-T-10 en este proyecto), siguiendo
el master prompt/proceso ya validado. La pantalla Transcriptor NO llama a
ninguna API — solo permite: elegir empresa, subir el PDF original, y subir
el Excel ya transcrito (mismas columnas Desde/Hasta que usa el QA tool).

Por qué: el costo marginal es cero (ya cubierto por la suscripción de
Claude.ai), no hay que construir manejo de errores/reintentos de una API en
producción, y hay un filtro humano gratis (quien transcribe ve la cartilla
mientras la procesa) que una versión 100% automática no tendría.

Automatizar esto vía API queda **fuera de alcance de v1** — no por costo de
tokens (es bajo, unos $10-15 USD estimados para las 8.474 m de Tassa), sino
porque la ingeniería de hacerlo confiable sin supervisión humana no está
justificada todavía con un solo cliente en producción. Se reevalúa si el
volumen de clientes en paralelo lo justifica.

## Fuera de alcance de v1 (explícitamente, para no reabrir la conversación cada vez)

- Passwords por persona (individuales) / recuperación de cuenta / roles administrables desde UI. La contraseña compartida por rol (ver tabla de arriba) es la única excepción.
- Log de auditoría completo (histórico de cada cambio de estado). v1 solo
  guarda el último estado + quién + cuándo, no el historial completo.
- Vista en tiempo real del avance de todos los juniors para el CEO (más allá
  de lo que el líder ve en su propia validación).
- Métrica de tiempo por fila (cronómetro automático). Se puede agregar
  después si el piloto cronometrado del junior (pendiente desde el mensaje
  anterior) confirma que vale la pena medirlo con precisión.
- Multi-idioma, multi-tenant fuera de Graiph, cualquier cosa no mencionada
  arriba.

## Roles

| Rol | Puede | No puede |
|---|---|---|
| `transcriptor` | Elegir empresa, subir PDF, cargar datos iniciales | Marcar estado QA ni validar |
| `qa` | Marcar Aprobado/Corregido/Rechazado, editar valores, comentar | Validar como líder |
| `lider` | Ver el trabajo de QA, marcar Validado/Rechazado final, exportar (`exportar.html`) | — |
| `admin` (Ignacio) | Todo lo anterior + gestionar empresas/usuarios + borrar sondajes ya cargados | — |

## Flujo de un sondaje

```
cargado -> en_qa -> en_validacion -> validado (exportable)
```
