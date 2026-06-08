# Plan — Sentido (Push/Pull) + Pared (Reveal) + limpieza + íconos offline

> **Para ejecutar con `build-from-plan`.** Rama `checklist-cambios-2026-06-07`. Una micro-fase = un commit con
> gate. Nunca `main`, nunca deploy a producción (sí preview aislado). Continúa la numeración (F28+).
> **Spec:** `docs/superpowers/specs/2026-06-08-movimiento-pared-sentido-design.md` (fuente de verdad).
> **Mockups:** `docs/superpowers/auditoria-diseno/mockup-pared-02.png`.

**Goal:** Que el equipo pueda anotar el **Sentido** (push in / pull out) y la **Pared** (izq/der de un reveal) como
sub-controles contextuales del tagger, fusionando Push in/Pull out en un solo "Push/Pull", y que esos datos viajen
al export para empatar transiciones en Premiere. Cerrar además la limpieza de código muerto y los íconos offline.

## Invariantes (gate, todas las fases)
Export `version: 1` intacto. `normalizeChecklistData` carga estado viejo (incl. push_in/pull_out migrados). Backend
(`worker/`) intocable. Aditivo y compatible. Sin emojis. Áreas táctiles ≥44px. Español formal con acentos.
La app de metadatos (`iav-metadata-app`) **NO se toca** en este plan (fase final aparte, diferida).

---

## F28 — Motor: Push/Pull + campos sentido/pared + migración + export
**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`. **Invariantes:** `version: 1`, `normalizeChecklistData`.

- **Fusión Push/Pull:** agrega el id `push_pull` a `MOVEMENTS` (label "Push/Pull", hint de profundidad). NO borres
  `push_in`/`pull_out` del mapa (compat). Cambia `CURATED_MOVEMENTS` a los 6:
  `['push_pull','pan','tilt','travel','orbit','reveal']`.
- **Campos nuevos por archivo** (en `mediaFiles`, opcionales): `sentido` (`'in'|'out'|null`, solo con
  `movement==='push_pull'`) y `pared` (`'izq'|'der'|null`, solo con `movement==='reveal'`). Acéptalos en
  `registerMediaFile`/`updateMediaFile`/`normalizeChecklistData` de forma aditiva (default `null`).
- **Migración** en `normalizeChecklistData`: una toma vieja con `movement==='push_in'` → `{movement:'push_pull',
  sentido:'in'}`; `'pull_out'` → `{movement:'push_pull', sentido:'out'}`. No tocar el resto. Tomas con `movement`
  ya en `push_pull`/otros se respetan.
- **Helpers/labels:** expón el set de opciones de cada sub-control y sus labels: `sentidoLabel('in')='Push in'`,
  `sentidoLabel('out')='Pull out'`; `paredLabel('izq')='Izquierda'`, `paredLabel('der')='Derecha'`. Define las
  listas (p. ej. `SENTIDO_OPTS=['in','out']`, `PARED_OPTS=['izq','der']`) y getters.
- **Export (`buildExport`):** agrega campos discretos por archivo: `sentido`, `sentidoLabel`, `pared`, `paredLabel`
  (junto a `movimiento`/`movimientoLabel`). Y **compón los tokens** en `describirArchivo` → `premiere.Description`,
  consistentes y buscables:
  - Push/Pull con sentido → el sufijo de movimiento dice `Push/Pull (in)` / `Push/Pull (out)`.
  - Reveal con pared → el sufijo dice `Reveal · pared izq` / `Reveal · pared der`.
  - Sin sentido/pared → solo el label del movimiento, como hoy. `version:1` permanece (1 ocurrencia literal).
- **Tests nuevos:** (a) `CURATED_MOVEMENTS` tiene 6 e incluye `push_pull`, no `push_in`/`pull_out`; (b) migración
  push_in→push_pull+in y pull_out→push_pull+out; (c) export de una toma push_pull con sentido lleva el token
  `Push/Pull (in)` en Description y `sentido:'in'` discreto; (d) export de un reveal con pared lleva `Reveal · pared
  izq` y `pared:'izq'`; (e) `version:1` intacto; (f) estado viejo sin estos campos carga igual. No rompas los 163.

## F29 — UI: sub-controles contextuales en el tagger
**Archivos:** `frontend/checklist.html`. **Invariantes:** `version: 1`. **Mockup:** `mockup-pared-02.png`.

- **Rejilla a 6:** la rejilla de Movimiento (`cap-mvgrid`/`cap-mv`) usa `logic.CURATED_MOVEMENTS` (ya son 6), así
  que queda 3×2 sin huecos. El botón `push_pull` usa un ícono de doble flecha (←|→) en `MOV_SVGS`.
- **Patrón de sub-control contextual:** debajo de la rejilla, si el movimiento elegido tiene variante, muestra su
  sub-control (mismo estilo R1, seleccionado en **tinte neutro**, áreas ≥44px):
  - `push_pull` → **Sentido**: dos opciones `Push in` / `Pull out`.
  - `reveal` → **Pared**: dos opciones `Izquierda` / `Derecha`, con el ícono literal (barra de pared a un lado del
    cuadro, como en el mockup; SVG inline).
  - otros movimientos → nada.
- **Dos taggers, mismo componente:** aplica en `renderCapSugStrip` (antes de grabar: setea variables pending —
  agrega `pendingSentido`/`pendingPared`, que `darToma` persistirá en la toma) y en `renderCapLatest`/Etiqueta F27
  (después: edita la toma con `logic.updateMediaFile`, funciones nuevas `etiquetarSentidoToma`/`etiquetarParedToma`).
  Tocar de nuevo la opción activa la limpia.
- **Línea colapsada (F27):** el slot de Etiqueta muestra, además de plano/movimiento, el sentido/pared si están
  puestos (p. ej. "Abierto · Push/Pull (in)" o "Reveal · pared izq"), usando los labels curados.
- **`darToma`** debe guardar `sentido`/`pared` pendientes en la toma nueva (aditivo; default null).
- Verificación visual (Playwright, 390px): rejilla de 6 sin huecos; elegir Push/Pull muestra Sentido; elegir Reveal
  muestra Pared; ambos opcionales; se reflejan en la línea colapsada y en el meta de la toma; antes y después de grabar.

## F30 — Limpieza de código muerto (UI vieja)
**Archivos:** `frontend/checklist.html`. **Invariantes:** `version: 1`, `normalizeChecklistData`.

- Quitar funciones/estilos muertos de la UI vieja que ya no se usan tras el shell nuevo y R1: candidatos
  `renderModeArea`, `abrirLane`, `renderHeader` (el viejo), el `renderCapNav` viejo si quedó sin uso tras F26, y
  huérfanos asociados. **Antes de borrar cada uno, confírmalo:** `grep -n "<nombre>" frontend/checklist.html` debe
  mostrar solo su definición (0 llamadas) — si tiene llamadas vivas, NO lo borres.
- No cambiar comportamiento visible. `node --check` del inline debe pasar; los 163+ tests verde (no tocas el motor).
- Verificación: recorrer la app en Playwright (setup, loop, cierre, edición, cobertura) y confirmar que nada se rompió.

## F31 — Íconos offline
**Archivos:** `frontend/checklist.html` (y assets de fuente si se auto-hospedan en `frontend/`). **Invariantes:** `version: 1`.

- Los íconos Tabler vienen por CDN; sin señal no cargan. Auto-hospedar o inline la fuente/íconos usados para que la
  app se vea sin red. Opción preferida por valor: **subconjunto inline/local** de solo los íconos que la app usa
  (no toda la fuente), servido desde `frontend/` (mismo Worker), con fallback.
- Las fuentes de texto ya tienen fallback de sistema; aquí es solo el set de íconos.
- Verificación: cargar la app con red desactivada (o bloqueando el CDN en Playwright) y confirmar que los íconos
  aparecen. `node --check` OK; tests verde.

## Verificación final
- `node --test frontend/checklist-logic.test.js` verde. Gate por fase. Playwright en F29/F30/F31. Redeploy del
  preview al cerrar las fases de UI y pasar la URL a Bruno.

## Después de este plan (fuera de alcance, diferido)
- **XMP columnas en `iav-metadata-app`:** `toXmpFields` → `CameraMove` (movimiento + token pared/sentido) y
  `ShotSize` (plano); tests `xmpFields`/`xmpWriter`. Solo cuando Bruno lo autorice.
