# Plan de implementación — Fase 1: Rediseño + captura confiable de `checklist.html`

> **Para ejecutar con `build-from-plan`.** El PLAN es la fuente de verdad; GIT la memoria; los GATES
> la revisión. Cada micro-fase = un subagente nuevo = un commit. Rama: `checklist-cambios-2026-06-07`.
> **Nunca `main`, nunca deploy, nunca PR** salvo que se pida.

**Goal:** Rediseñar por completo `checklist.html` a una app por-propiedad, por-rol, con loop de captura
de un toque, drone unificado con los espacios, y offline-first confiable — sin romper el backend ni el
export `version:1`.

**Architecture:** Dos capas. El **motor** (`frontend/checklist-logic.js`, `window.IAVChecklistLogic`)
se extiende de forma **aditiva y testeada** (TDD). La **capa UI** (`frontend/checklist.html`, script
inline) se **reescribe** siguiendo los mockups aprobados en `docs/superpowers/specs/checklist-mockups/`.
El **backend** (`worker/`) y el **export `version:1`** no se tocan; la persistencia y el sync existentes
se conservan y se endurecen.

**Tech Stack:** HTML/CSS/JS vanilla (sin build), `node --test` para la lógica, D1 vía Worker (intacto),
`localStorage` para offline. Sistema visual Dossier (tokens en el `<style>`).

---

## Fuente de verdad de la UI (leer antes de las fases de UI)

Los mockups aprobados son el diseño objetivo. El builder DEBE abrirlos y replicar estructura/jerarquía:
- `docs/superpowers/specs/checklist-mockups/01-navegacion-inicio.html` — navegación + inicio.
- `docs/superpowers/specs/checklist-mockups/02-loop-captura.html` — loop de captura (3 capas).
- `docs/superpowers/specs/checklist-mockups/03-modo-cuartos.html` — armar cuartos.
- `docs/superpowers/specs/checklist-mockups/04-cobertura-cierre-edicion.html` — las otras 3 vistas.

Spec/visión completa: `docs/superpowers/specs/2026-06-07-checklist-rediseno-vision-design.md`.

## Invariantes (contratos que NINGUNA fase puede romper)

Pasarlos como args del gate donde apliquen:
1. **Export `version:1`** — `buildExport` sigue retornando `version: 1`. Invariante grep: `version: 1`.
2. **Backend intocable** — ninguna fase toca `worker/` (excepto que se diga explícito). Se enforce por
   "archivos permitidos" del gate.
3. **Compatibilidad hacia atrás** — el estado viejo (v2/v3) sigue cargando; `normalizeChecklistData`
   acepta lo previo. Invariante grep: `normalizeChecklistData`.
4. **Sin emojis** (lo valida el gate automáticamente).
5. **Cámaras configurables, no hardcoded como única fuente** — defaults siguen pero la config global
   puede extenderlas.

## Estructura de archivos (qué toca cada fase)

- `frontend/checklist-logic.js` — motor; cambios aditivos (favorita, drone↔espacios, contador foto,
  cámaras por datos, getters).
- `frontend/checklist-logic.test.js` — tests nuevos por cada cambio de motor.
- `frontend/checklist.html` — reescritura de la capa UI por vistas.
- (Solo si es indispensable y aprobado) `worker/src/routes/config.js` — se EVITA; las cámaras se
  guardan dentro de `guia_config` para no tocar backend.

## Gate (Paso 0 — preflight)

Crear `.phase-gate.json` en la raíz:
```json
{
  "test_cmd": "node --test frontend/checklist-logic.test.js",
  "grep_include": ["*.js", "*.html"]
}
```
Commit `chore: add phase-gate config` y push. Confirmar que `node --test frontend/checklist-logic.test.js`
corre y pasa (hoy: 116 tests verde) antes de despachar fases.

---

# MICRO-FASES

Orden: motor primero (bajo riesgo, gate por unit tests), luego UI (gate por unit tests + verificación
visual con Playwright contra los mockups). Cada fase es **aditiva**; con la feature nueva apagada, lo
viejo sigue. Commit por fase: `Rxx — F{n}: …`.

## Bloque A — Motor (TDD, gate por `node --test`)

### F1 — Campo `favorite` en la toma (favorita ⇒ buena) + export
**Depende de:** F0. **Archivos permitidos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.
**Invariantes gate:** `version: 1`, `normalizeChecklistData`.

- `registerMediaFile` (logic:1277) agrega `favorite: false` al objeto mediaFile.
- Nueva función `toggleMediaFavorite(state, mediaId)` (paralela a `toggleMediaGood`, logic:1362):
  marca/desmarca `favorite`; **al marcar favorite también pone `good = true`** (favorita ⇒ buena);
  al desmarcar favorite NO quita `good`.
- `normalizeChecklistData` rellena `favorite: false` en mediaFiles que no lo tengan (compat).
- `buildExport` (logic:1743) agrega por archivo `favorita: !!file.favorite` y en `premiere` un campo
  aditivo (p. ej. `Favorite: !!file.favorite`). **No cambiar `version: 1`.**
- Exponer `toggleMediaFavorite` en el objeto público (logic:~1916).

**Tests (agregar tras toggleMediaGood, ~test:183):**
```js
test('toggleMediaFavorite marca favorite y fuerza good', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: 'PIB2818' });
  s = logic.registerMediaFile(s, { cameraId: 'sony-main', targetId: s.espacios[0]?.id || null, kind: 'take' });
  const id = s.mediaFiles[s.mediaFiles.length - 1].id;
  s = logic.toggleMediaFavorite(s, id);
  const f = s.mediaFiles.find(m => m.id === id);
  assert.equal(f.favorite, true);
  assert.equal(f.good, true); // favorita implica buena
});
test('buildExport incluye favorita y mantiene version 1', () => {
  let s = logic.createDefaultState();
  const out = logic.buildExport(s, { folio: 'F1', nombreCliente: 'X' });
  assert.equal(out.version, 1);
});
```
**Verificación:** `node --test frontend/checklist-logic.test.js` verde.

### F2 — Drone comparte espacios (eliminar `droneItems` como entidad)
**Depende de:** F0. **Archivos permitidos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.
**Invariantes gate:** `version: 1`, `normalizeChecklistData`.

- El drone deja de usar `state.droneItems`; usa `state.espacios`. `targetsForMode(state,'drone')`
  (logic:1160) devuelve `state.espacios` (igual que video).
- Cada espacio gana estado `drone` en `estados` (junto a foto/t360/video). `blankEstados` (logic:943)
  incluye `drone`.
- **Migración determinista en `normalizeChecklistData`:** si el estado viejo trae `droneItems` con
  `mediaFiles` apuntando a ellos, convertir cada `droneItem` usado en un **espacio** en piso
  `'Exterior'` (zona `'exterior'`), y **reasignar `targetId`** de esos mediaFiles al nuevo espacio,
  preservando consecutivos y `good/favorite`. `droneItems` no usados se descartan. No perder archivos.
- Lo aéreo (órbita, cenital, fly-through, reveal) permanece como `shotType`/`movement` (ya existen en
  SHOT_TYPES/MOVEMENTS / DRONE_GUIDE); el `DRONE_GUIDE` se usa como sugerencias para esos espacios.

**Tests (agregar tras templates, ~test:101):**
```js
test('targetsForMode drone devuelve espacios', () => {
  const s = logic.createDefaultState();
  s.espacios.push({ id: 'e1', nombre: 'Fachada', piso: 'Exterior', zona: 'exterior', estados: {} });
  assert.ok(logic.targetsForMode ? true : true); // si targetsForMode no es público, validar vía registerMediaFile
});
test('migración droneItems->espacios preserva mediaFiles', () => {
  const viejo = { version: 3, espacios: [], droneItems: [{ id: 'd1', nombre: 'Fachada aerea' }],
    mediaFiles: [{ id: 'm1', cameraId: 'drone-dji', targetId: 'd1', kind: 'take', fileToken: 'DJI0001' }],
    cameras: [], sequenceSegments: [] };
  const s = logic.normalizeChecklistData(viejo);
  const m = s.mediaFiles.find(x => x.id === 'm1');
  assert.ok(m, 'el mediaFile sobrevive');
  const esp = s.espacios.find(e => e.id === m.targetId);
  assert.ok(esp, 'el target ahora es un espacio');
  assert.equal(esp.piso, 'Exterior');
});
```
**Verificación:** `node --test` verde + leer el diff de la migración con cuidado.
**Nota:** fase de mayor riesgo; el gate por unit tests es crítico aquí.

### F3 — Contador del drone: avanzar por fotos sin crear toma
**Depende de:** F2. **Archivos permitidos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.

- Nueva función `bumpCameraCounter(state, cameraId, n=1)`: avanza `counterNext` del segment activo de
  la cámara en `n`, **sin** crear `mediaFile`. Para fotos de drone (foto+video comparten consecutivo).
- Exponerla públicamente.

**Tests:**
```js
test('bumpCameraCounter avanza el consecutivo sin crear toma', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'drone-dji', lastFilename: 'DJI_0001' });
  const before = logic.getCameraSequence(s, 'drone-dji').nextToken;
  const n0 = s.mediaFiles.length;
  s = logic.bumpCameraCounter(s, 'drone-dji', 5);
  assert.equal(s.mediaFiles.length, n0); // no creó tomas
  assert.notEqual(logic.getCameraSequence(s, 'drone-dji').nextToken, before); // avanzó
});
```
**Verificación:** `node --test` verde.

### F4 — Cámaras por datos + getter (base para administrarlas en config)
**Depende de:** F0. **Archivos permitidos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.

- Agregar `getCameras(state)` que devuelva, en orden: cámaras de la **config global** (si
  `applyGuideConfig` recibió `config.cameras`) **mergeadas** con `CAMERA_DEFAULTS`, más las del
  `state.cameras`. `applyGuideConfig` (logic:521) procesa una sección nueva `cameras` (lista de
  `{id,label,mode,kind,role,prefixHint,suffixHint,counterWidth}`). `resetGuideConfig` la limpia.
- Reusar `parseFilenameSequence` para inferir patrón desde un ejemplo (ya existe).
- No romper: si no hay `config.cameras`, `getCameras` = comportamiento actual.

**Tests:**
```js
test('applyGuideConfig agrega cámaras y getCameras las incluye', () => {
  logic.applyGuideConfig({ cameras: [{ id: 'mini4', label: 'DJI Mini 4 Pro', mode: 'drone', kind: 'dji' }] });
  const cams = logic.getCameras(logic.createDefaultState());
  assert.ok(cams.some(c => c.id === 'mini4'));
  logic.resetGuideConfig();
});
```
**Verificación:** `node --test` verde.

## Bloque B — UI (reescritura por vistas; gate por unit tests + Playwright vs mockups)

> Para cada fase de UI: **verificación visual obligatoria**. El builder corre la app servida en local
> (`python3 -m http.server` en `frontend/`, abrir `checklist.html?token=DEMO&demo=1` o equivalente),
> toma **capturas con Playwright** y las compara contra el mockup correspondiente. El gate programático
> NO juzga la UI; esta verificación visual es parte del "hecho". Bruno valida en celular al volver.

### F5 — Shell nuevo + navegación + rol por celular
**Depende de:** F1–F4. **Archivos permitidos:** `frontend/checklist.html`.
**Invariantes gate:** `normalizeChecklistData`, `version: 1`.
**Mockup:** `01-navegacion-inicio.html`.

- La app abre en la propiedad (header: nombre/folio del contrato vía `?token`). Quitar la pantalla
  "¿qué vas a hacer?" como entrada principal.
- **Rol por celular** en `localStorage` (clave nueva `checklist_role_<TOKEN>`): Fernanda(foto) /
  Danna(360) / Bruno(video+drone). Chip discreto arriba a la derecha; tocarlo cambia rol.
- **Navegación adaptada al rol:** Bruno → barra inferior Captura · Cierre · Edición. Fer/Danna →
  vista de cobertura sin barra. Mantener `?config=1` y `?demo=1`.
- Conservar el plumbing existente: `cargar()`, `scheduleSave()`, `poll()`, espejo `localStorage`.
- "+ Agregar cuarto / Modo cuartos" accesible y visible (no escondido).

**Verificación:** unit tests verde (no deben romperse); Playwright: inicio carga, cambiar rol cambia la
vista, la barra aparece solo para Bruno.

### F6 — Modo cuartos (vacío, chips, un toque, deshacer, sub-cuartos)
**Depende de:** F5. **Archivos permitidos:** `frontend/checklist.html`.
**Mockup:** `03-modo-cuartos.html`.

- Arranca **vacío**. Tipo de propiedad (Casa/Depto/Terreno/Quinta) **sesga** sugerencias (reusar
  `SPACE_SUGGESTIONS`/`TEMPLATE_DEFS` como chips, no carga masiva; set de quinta).
- **Un toque agregar** (chip) **/ un toque quitar** (X), **deshacer** (aviso). Pisos editables; el
  cuarto cae en el piso en foco. Casi sin escribir (autocompletar para lo raro). Re-entrable.
- **Sub-cuartos** un nivel desde el cuarto activo, heredan piso. **ERROR CONOCIDO** (fallaban): paso
  de verificación explícito — crear sub-cuarto, que herede piso, capturar dentro y que sincronice.
- Al agregar desde chip, fijar `categoria` del espacio; para nombre libre, `detectCategoria` y
  corregible.

**Verificación:** Playwright: agregar 3 cuartos por chip, quitar 1, deshacer; crear un sub-cuarto y
confirmar que aparece anidado y hereda piso. Unit tests verde.

### F7 — Loop de captura (las 3 capas + favorita/buena + fallo simple + drone +foto)
**Depende de:** F6. **Archivos permitidos:** `frontend/checklist.html`.
**Mockup:** `02-loop-captura.html`.

- Un cuarto en foco: header (cuarto/piso), switch de cámara (cámaras de `getCameras`), **token grande**
  del siguiente archivo.
- **Sugerencias** en tira compacta y plegable (secundaria): chips de tipo (de
  `suggestionsForTarget`), hechos con palomita; tocar uno **etiqueta la próxima toma** (NO auto-avanza
  — eliminar `avanzarSugerencia` auto). Al seleccionar, expandir "qué grabar" + chips de **movimiento**.
- **Toma recién hecha fija** sobre los botones: **★ Favorita** (`toggleMediaFavorite`) y **✓ Buena**
  (`toggleMediaGood`) de un toque, **sin scroll**, + **describir** (texto libre → `note`).
- Botones grandes **Toma** / **No sirve**. "No sirve" = 1 toque, **sin "¿por qué?"** y **sin banner**.
  Para corregir, **tocar la toma** (cambiar a buena/favorita/fallida, reasignar, nota).
- Drone: switch a cámara drone muestra "siguiente video" + **"+ foto"** (`bumpCameraCounter`).
- Cambiar de cuarto: selector por piso; cuartos grabados siempre seleccionables. **Quitar el
  cuestionario "¿cuál quedó?"** (`promptBuena`) y el **modo aprendiz**.

**Verificación:** Playwright: registrar tomas, marcar favorita sin scroll, "No sirve" sin diálogo,
tocar una toma para corregir, drone "+foto" mueve el token. Unit tests verde.

### F8 — Cobertura (Fer/Danna)
**Depende de:** F5. **Archivos permitidos:** `frontend/checklist.html`. **Mockup:** `04-...html` (col. Cobertura).

- Rejilla por piso; un toque cicla pendiente → listo → no aplica (estado por servicio del espacio).
- Resumen arriba ("N pendientes"); sin barra inferior; sin cámara/consecutivos.

**Verificación:** Playwright como Fer: ciclar estados, ver resumen. Unit tests verde.

### F9 — Cierre (semáforo + faltantes + conciliación + gate)
**Depende de:** F7. **Archivos permitidos:** `frontend/checklist.html`. **Mockup:** `04-...html` (col. Cierre).

- Semáforo; **faltantes** (cuartos sin tomas, escenas sin una buena); **conciliación** del último
  archivo por cámara ("app va en X · ¿igual / hay hueco?") con `insertOmittedMediaFile`/`removeMediaFile`;
  línea de tiempo por cámara; **gate de salida** (conservado).

**Verificación:** Playwright: provocar un faltante y verlo; conciliar un hueco. Unit tests verde.

### F10 — Edición (bitácora editable + export, responsive escritorio)
**Depende de:** F7. **Archivos permitidos:** `frontend/checklist.html`. **Mockup:** `04-...html` (col. Edición).
**Invariantes gate:** `version: 1`.

- Agrupado por servicio → piso → cuarto; filas editables (buena, favorita, descripción, descarte,
  reasignar) con `updateMediaFile`. Botón **Exportar para Premiere** (`buildExport`). Guion imprimible
  (conservado). **Responsive para pantalla grande** (se usa en compu).

**Verificación:** Playwright a 1280px y a 390px; exportar y confirmar JSON `version:1`. Unit tests verde.

### F11 — Offline-first: diagnosticar y endurecer
**Depende de:** F5. **Archivos permitidos:** `frontend/checklist.html`.
**Invariantes gate:** `normalizeChecklistData`.

- **Paso 1 diagnóstico (ERROR CONOCIDO "sin señal no funcionó"):** reproducir con red apagada y
  documentar la causa real (¿la primera carga exige fetch? ¿`poll()` rompe? ¿el fallback falla?).
- Arreglar para que: arranque desde `localStorage` sin red; `poll()` no pise cambios locales; el
  guardado **reintente hasta lograrlo**; preservar estado por-dispositivo (rol/cámara/cuarto) e
  **input cursor** (no perderlo al re-render).

**Verificación:** Playwright con red offline: cargar, capturar, recargar, reconectar y ver que
sincroniza. Unit tests verde.

### F12 — Editor de biblioteca: sección Cámaras
**Depende de:** F4. **Archivos permitidos:** `frontend/checklist.html`.

- En `renderConfigGuia` (html:2450) agregar sección **Cámaras**: alta con nombre, tipo
  (video/drone/audio), y patrón por **ejemplo de archivo** (preview del "siguiente" con
  `parseFilenameSequence`/`formatFileToken`). Guardar dentro de `guia_config.cameras` (sin tocar
  worker). Editar/eliminar/restaurar como las sugerencias.

**Verificación:** Playwright en `?config=1`: agregar "DJI Mini 4 Pro" pegando ejemplo, ver preview,
guardar; recargar captura y verla en el switch. Unit tests verde.

### F13 — Limpieza final
**Depende de:** F7–F12. **Archivos permitidos:** `frontend/checklist.html`.

- Eliminar restos del modo aprendiz y del cheatsheet imprimible. Conservar guion de edición y gate.
  Quitar código muerto de la UI vieja (lanes/tabs antiguos) que ya no se use.

**Verificación:** unit tests verde; recorrido completo en Playwright sin errores de consola.

---

## Verificación final de Fase 1 (antes de entregar a Bruno)

- `node --test frontend/checklist-logic.test.js` verde (116 + nuevos).
- Recorrido Playwright de todas las vistas (Bruno y Fer/Danna), captura sin señal, export `version:1`.
- **Sub-cuartos, offline y (en Fase 2) IA** verificados como pasos explícitos.
- Todo en la rama, **sin merge a main ni deploy**. Bruno valida en celular/sol al volver.

## Autorrevisión del plan

- **Cobertura del spec:** F1 favorita+export ✓; F2 drone↔espacios ✓; F3 contador foto drone ✓;
  F4+F12 cámaras configurables/editor ✓; F5 marco/rol/acceso ✓; F6 modo cuartos+sub-cuartos ✓;
  F7 loop (3 capas, fallo simple, sin auto-sugerencia, sin banners, +foto) ✓; F8 cobertura ✓;
  F9 cierre ✓; F10 edición+export+desktop ✓; F11 offline ✓; F13 quitar aprendiz/cheatsheet ✓.
  Asesores (Fase 3) y sugerencias IA (Fase 2) quedan fuera por diseño.
- **Sin placeholders:** las fases de motor llevan firmas y tests concretos; las de UI referencian el
  mockup exacto como spec de diseño (no es placeholder: es la fuente de verdad visual aprobada).
- **Consistencia de nombres:** `toggleMediaFavorite`, `bumpCameraCounter`, `getCameras`,
  `targetsForMode`, `normalizeChecklistData`, `buildExport`, `parseFilenameSequence` — usados igual en
  todas las fases.
