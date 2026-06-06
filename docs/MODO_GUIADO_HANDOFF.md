# Handoff — Modo Guiado de tomas (checklist)

Documento vivo para **retomar el feature del modo guiado** sin contexto previo. Resume qué es, dónde
vive cada pieza, qué está hecho y qué queda. El historial fino está en `docs/RONDAS.md`; el plan
completo y la biblioteca curada en `docs/superpowers/plans/2026-06-05-modo-guiado-tomas-plan.md`.

## Qué es
Una capa **opcional y opt-in** sobre `checklist.html` (la "app de cámara") que:
- Sugiere **qué tomas grabar por cuarto** según su categoría (modo Guiado), con "en qué enfocarte".
- Permite **etiquetar tipo de toma y movimiento** por toma (ligado a la sugerencia).
- Detecta la **categoría del cuarto** desde su nombre (corregible).
- Da **faltantes en sitio**, **gate de salida**, **modo aprendiz** (wizard para delegar), **cheatsheet
  imprimible** y **guion de edición** imprimible.
- **Puente IA** (copiar/pegar, sin API): propone tomas extra por propiedad.
- Enriquece el **export** (Premiere) con tipo/movimiento/orden de edición — **sin romper `version:1`**.

Con Guiado apagado, la captura es **idéntica** a antes.

## Dónde vive cada pieza
- **`frontend/checklist-logic.js`** (lógica pura, testeada):
  - Biblioteca: `SHOT_TYPES` (con `ejemplo`), `MOVEMENTS`, `GUIDE_LIBRARY`, `DRONE_GUIDE`,
    `AMENITY_GUIDE`, `PROPERTY_FOCUS`, `ROOM_CATEGORIES`, `EDIT_ORDER`.
  - **Resolver de 3 capas**: defaults → config global (`applyGuideConfig`) → propuesta por propiedad
    (`state.guide.proposal`). Getters efectivos: `getShotTypes/getMovements/getGuideLibrary/getDroneGuide/
    getAmenityGuide/getRoomCategories`.
  - Helpers: `detectCategoria`, `suggestionsForSpace/Drone/Target`, `findSuggestion(id, state?)`,
    `suggestionProgress`, `guideCoverage`, `capasCubiertas`, `buildPropuestaPrompt`, `parsePropuesta`.
  - Modelo: `mediaFile` lleva `shotType/movement/suggestionId` (opcionales); estado en **v3**
    (`createDefaultState`/`normalizeChecklistData` aceptan v2||v3). `guide:{tipoPropiedad,descripcion,proposal}`.
  - Export: `buildExport` agrega `tipoToma/movimiento/sugerencia/prioridad/ordenEdicion/labels` +
    `resumenGuia` + `guionEdicion`. **`version:1` intacto.**
- **`frontend/checklist.html`** (UI):
  - Toggle `[Manual|Guiado]`, `renderGuideList` (sugerencias + acordeón de movimiento + ejemplos),
    botón Toma por sugerencia, toma libre, auto-avance, buena inline, reintentar, chip de categoría.
  - Faltantes (`abrirFaltantes`), **gate de salida global** (`abrirGateSalida`), **modo aprendiz**
    (`iniciarAprendiz`/`renderAprendiz`), cheatsheet (`imprimirGuia`), guion (`imprimirGuionEdicion`).
  - **Puente IA**: `abrirPropuestaIA` (descripción, copiar prompt, pegar/analizar/aplicar/quitar).
  - **Editor de biblioteca SIN token**: modo **`?config=1`** (`iniciarConfigMode`), protegido por
    contraseña de admin (`ensureAdminKey` → valida contra `/api/obtenerConfigAdmin`). El uso normal del
    checklist **no pide contraseña**.
  - **Modo demo**: `?demo=1` (datos de ejemplo, sin backend) + botón "Reiniciar demo".
  - Polling lee `version >= 2`.
- **`worker/src/routes/config.js`**: acción pública `obtenerConfigGuia` (lee clave `guia_config`).
  Escritura por `guardarConfig` (admin). La biblioteca global vive en la tabla `config`.
- **`adapter/AdapterScript4_v1.js`**: `registrarUsoTomas` — **buzón** que anexa al Sheet maestro
  (tab `UsoTomas`) una fila por toma con `usada` (para el loop de aprendizaje). **Requiere despliegue
  manual** en script.google.com.

## Estado
- **Completo y en `main`** (mergeado). Lógica: **116 tests verde** (`node --test frontend/checklist-logic.test.js`).
- `revision.html` no se vio afectado. El export sigue `version:1` (compatible con la app de Mac).

## Cómo probar
- Lógica: `node --test frontend/checklist-logic.test.js`.
- Navegador sin backend: servir `frontend/` y abrir `checklist.html?demo=1` (Guiado, aprendiz, gate,
  imprimibles, IA). El editor de biblioteca: `checklist.html?config=1` (necesita backend para validar admin).

## Pendiente / próximos pasos
1. **Loop de aprendizaje** (otro repo `iav-metadata-app`): F2 = leer la secuencia final de Premiere
   (FCP XML/EDL), cruzar tokens, **POST a `registrarUsoTomas`** → Sheet `UsoTomas` (buzón ya listo).
   Contrato del POST en `docs/RONDAS.md` (R90). Roadmap de las 4 funciones de esa app en
   `docs/superpowers/specs/2026-06-06-iav-metadata-app-4-funciones.md`.
2. **Fase 2 app de Mac**: mapear tipo/movimiento/ordenEdicion a campos XMP propios filtrables en
   Premiere (hoy van en `Description`). Documentado en `docs/EXPORT_METADATA_HANDOFF.md`.
3. **Backlog menor**: `guideCoverage` se llama 2x por render en algunos puntos (memoizar si molesta).

## Docs relacionados
- Plan + biblioteca: `docs/superpowers/plans/2026-06-05-modo-guiado-tomas-plan.md`.
- Contrato del export: `docs/EXPORT_METADATA_HANDOFF.md`.
- Roadmap app de Mac: `docs/superpowers/specs/2026-06-06-iav-metadata-app-4-funciones.md`.
