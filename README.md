# Graiph — Transcripción de Sondajes

Lee `SCOPE.md` antes que nada. Si algo no está ahí, no se construye todavía.

## Cómo arrancar (paso a paso, sin saltarse ninguno)

### 1. Crear el repositorio en GitHub
1. Entra a github.com → botón verde "New" → nombre `graiph-transcripcion` →
   **privado** (esto tiene lógica de precios internos, no va público) →
   crear, SIN agregar README/licencia (ya los traemos).
2. GitHub te va a mostrar comandos — **ignóralos por ahora**, ya tienes
   este repo armado localmente, solo falta conectarlo (paso 3).

### 2. Descomprimir esta carpeta en tu computador
Descomprime el .zip donde trabajes normalmente (ej. `Documentos/graiph-transcripcion`).

### 3. Conectar y subir el primer commit
Este .zip ya trae un primer commit hecho ("scope + arquitectura + esquema
inicial de base de datos"). Abre una terminal DENTRO de la carpeta
descomprimida y corre, en orden:
```bash
git remote add origin https://github.com/TU-USUARIO/graiph-transcripcion.git
git branch -M main
git push -u origin main
```
De ahora en adelante, la regla simple para los próximos commits:
- Terminaste una parte que funciona (ej. "la pantalla de login ya anda") → commit.
- Nunca commitear algo roto a `main`. Si Claude Code te dice "esto todavía
  no funciona", no hagas commit todavía.
- Mensaje de commit: qué cambió, en una línea, en español, sin relleno
  ("agrega pantalla de login" no "cambios varios").

### 4. Abrir esto en Claude Code
```bash
cd graiph-transcripcion
claude
```
(si no tienes Claude Code instalado: `npm install -g @anthropic-ai/claude-code`,
o revisa claude.com/product/claude-code para el instalador de escritorio).

Dentro de Claude Code, tu primer mensaje debería ser literalmente:
> "Lee SCOPE.md y ARCHITECTURE.md completos antes de escribir código.
> Construye primero la pantalla de login (selector de nombre) y la tabla
> `usuarios` conectada a Supabase. No avances a la pantalla de transcriptor
> hasta que esto funcione y yo lo pruebe."

Esto lo obliga a construir en el mismo orden de piezas pequeñas y
verificables que hemos usado en este chat — no todo junto.

### 5. Supabase
El SQL de `supabase/migrations/0001_init.sql` se corre en el **mismo
proyecto Supabase que ya usa el cotizador** (Dashboard → SQL Editor → pegar
y ejecutar). No crear un proyecto nuevo — así ambas herramientas comparten
usuarios/empresas si algún día conviene.

## Estructura
```
SCOPE.md                          <- que se construye y que no (v1)
ARCHITECTURE.md                   <- por qué está diseñado así
supabase/migrations/0001_init.sql <- esquema de base de datos
web/                               <- Claude Code construye la app acá
```
