# Rediseño checklist.html — Fase 1 (Propiedad) · Plan de implementación

> **Para workers agénticos:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Reescribir la capa visual/UX de `frontend/checklist.html` al sistema Dossier, video-first, con lanes (Foto/360/Video/Drone), pisos, setup aditivo, loop de captura "app de cámara", Cierre con conciliación y Edición — preservando el motor y el backend.

**Architecture:** `checklist.html` mantiene su estructura de un archivo (HTML + `<style>` Dossier embebido + `<script>` de render/UI). El `<script>` se reescribe; el `<style>` se reemplaza por Dossier. El motor `checklist-logic.js` recibe cambios **aditivos y compatibles hacia atrás** (campo `piso`, lista `pisos`, plantilla quinta, sugerencias por tipo). El backend NO se toca. La verificación de UI es por **captura (playwright, viewport móvil)** contra el mockup aprobado y los tokens Dossier; los cambios del motor se verifican con **asserts en node**. Bruno revisa capturas en los checkpoints (tareas 3, 5, 6, 9).

**Tech Stack:** HTML/CSS/JS vanilla (sin build), Inter+Fraunces+Spline Sans Mono, Tabler Icons (webfont CDN), `window.IAVChecklistLogic` (UMD), playwright para capturas, node para tests del motor.

**Referencias:**
- Spec: `docs/superpowers/specs/2026-06-04-checklist-rediseno-design.md`
- Mockup aprobado de Captura: `design/mockups/captura-video.html`
- Tokens Dossier: `design/design-system.css`

**Reglas de aislamiento (recordatorio):** rama `rediseno-checklist`; NUNCA push/merge a `main`; NUNCA tocar `worker/`, `admin.html`, `portal.html`, el otro clon, ni deploy. Commits frecuentes a la rama.

**Cómo capturar (reusar en cada tarea de UI):**
```bash
# server local (una vez, en background)
cd /Users/brunogutierrez/contratos-iav-checklist/frontend && python3 -m http.server 8777 --bind 127.0.0.1
```
Luego, vía playwright MCP: `browser_resize(412, 900)` → `browser_navigate('http://127.0.0.1:8777/checklist.html?demo=1&screen=<x>')` → `browser_take_screenshot(fullPage)`. Revisar la imagen antes de avanzar.

---

## File Structure

- **Modify** `frontend/checklist.html` — reescritura de `<style>` (Dossier) y `<script>` (render/UI). Sigue siendo el archivo único de UI.
- **Modify** `frontend/checklist-logic.js` — aditivo: `piso` en espacios, lista `pisos` en estado, `TEMPLATE_DEFS.quinta`, export de sugerencias por tipo, compat de carga. Preservar API y comportamiento existentes.
- **Create** `frontend/checklist-demo.js` — bootstrap de modo demo (datos de ejemplo, API stub) activado solo con `?demo=1`. NO se carga en producción salvo ese flag.
- **Create** `test/checklist-logic.test.mjs` — asserts en node para los cambios del motor.

---

## Task 1: Modo demo para poder capturar sin backend

**Files:**
- Create: `frontend/checklist-demo.js`
- Modify: `frontend/checklist.html` (cargar demo solo si `?demo=1`; stub de API)

- [ ] **Step 1: Crear `checklist-demo.js` con un estado de ejemplo realista**

Exporta `window.IAVChecklistDemo = { meta, state }` usando la forma v2 del motor: una propiedad "Casa Cumbres · Sra. Martínez", folio "IAV-0428", con `pisos` (Exterior, Piso 1, Piso 2, Amenidades), ~10 espacios con `piso` y un par de subespacios (Recámara principal → Baño, Clóset), servicios `{foto:true,t360:true,video:true,drone:true}`, una cámara Sony con secuencia iniciada en `PIB2816` y 3 `mediaFiles` en Recámara principal (`PIB2816` good, `PIB2817` discard/failed, `PIB2818` take), para reproducir el mockup.

```js
window.IAVChecklistDemo = {
  meta: { folio: 'IAV-0428', nombreCliente: 'Casa Cumbres · Sra. Martínez' },
  build(logic) {
    let s = logic.createDefaultState();
    s.pisos = ['Exterior', 'Piso 1', 'Piso 2', 'Amenidades'];
    const mk = (nombre, piso, clave, parent) => ({ nombre, piso, clave: !!clave, parent });
    const defs = [
      mk('Fachada','Exterior',true), mk('Jardín','Exterior'),
      mk('Sala','Piso 1',true), mk('Cocina','Piso 1',true), mk('Comedor','Piso 1'),
      mk('Recámara principal','Piso 2',true),
      mk('Baño principal','Piso 2',false,'Recámara principal'),
      mk('Clóset','Piso 2',false,'Recámara principal'),
      mk('Alberca','Amenidades',true), mk('Gimnasio','Amenidades'),
    ];
    const byName = {};
    defs.forEach((d, i) => {
      const esp = { id: 'demo-esp-' + i, nombre: d.nombre, piso: d.piso, zona: 'interior',
        clave: d.clave, parentId: d.parent ? byName[d.parent] : null, orden: i + 1,
        estados: { foto:{estado:'pendiente'}, t360:{estado:'pendiente'}, video:{estado:'pendiente'} } };
      byName[d.nombre] = esp.id; s.espacios.push(esp);
    });
    s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: '20260520_PIB2815' });
    const rec = byName['Recámara principal'];
    s = logic.registerMediaFile(s, { cameraId:'sony-main', targetId:rec, kind:'take', autor:'tú' });   // 2816
    s = logic.toggleMediaGood(s, s.mediaFiles[s.mediaFiles.length-1].id);
    s = logic.registerMediaFile(s, { cameraId:'sony-main', targetId:rec, kind:'discard', discardReason:'failed', autor:'tú' }); // 2817
    s = logic.registerMediaFile(s, { cameraId:'sony-main', targetId:rec, kind:'take', autor:'tú' });   // 2818
    return s;
  }
};
```

- [ ] **Step 2: En `checklist.html`, cargar el demo y stubear la API cuando `?demo=1`**

Antes de `cargar()` (cerca del final del `<script>`), agregar: si `new URLSearchParams(location.search).get('demo')==='1'`, cargar `checklist-demo.js`, fijar `meta` y `state = window.IAVChecklistDemo.build(logic)`, reemplazar `saveNow`/`poll` por no-ops, y llamar `render()` directamente (sin `fetch`). El `?screen=` selecciona la vista inicial (`activeView`/lane) para capturar pantallas específicas.

- [ ] **Step 3: Verificar** — `python3 -m http.server` + navegar `?demo=1`, confirmar que renderiza sin red (aún con el diseño viejo; esto es solo el harness).

- [ ] **Step 4: Commit**
```bash
git add frontend/checklist-demo.js frontend/checklist.html
git commit -m "feat(checklist): modo demo (?demo=1) para capturas sin backend"
```

---

## Task 2: Motor — dimensión `piso`, lista `pisos`, quinta y sugerencias (aditivo, compatible)

**Files:**
- Modify: `frontend/checklist-logic.js`
- Test: `test/checklist-logic.test.mjs`

- [ ] **Step 1: Escribir tests que fallan** (`test/checklist-logic.test.mjs`)

```js
import assert from 'node:assert';
import logic from '../frontend/checklist-logic.js';

// piso se preserva en v2
let s = logic.normalizeChecklistData({ version:2, espacios:[{ id:'a', nombre:'Sala', piso:'Piso 1' }] });
assert.equal(s.espacios[0].piso, 'Piso 1', 'piso v2 preservado');

// estado viejo sin piso deriva de zona (determinista)
s = logic.normalizeChecklistData({ version:2, espacios:[
  { id:'b', nombre:'Alberca', zona:'amenidades' },
  { id:'c', nombre:'Fachada', zona:'exterior' },
  { id:'d', nombre:'Cuarto', zona:'interior' } ]});
assert.equal(s.espacios[0].piso, 'Amenidades');
assert.equal(s.espacios[1].piso, 'Exterior');
assert.equal(s.espacios[2].piso, 'Piso 1');

// lista de pisos por defecto existe
assert.ok(Array.isArray(s.pisos));

// quinta existe en sugerencias
assert.ok(logic.SPACE_SUGGESTIONS.quinta && logic.SPACE_SUGGESTIONS.quinta.length, 'quinta');

// legacy array sigue cargando
s = logic.normalizeChecklistData({ cuartos:[{ nombre:'Sala', completado:true }], columnas:{foto:true} });
assert.equal(s.espacios[0].nombre, 'Sala');
assert.ok(s.espacios[0].piso);
console.log('OK');
```

- [ ] **Step 2: Correr y ver fallar** — `node test/checklist-logic.test.mjs` → falla (`piso` undefined / `SPACE_SUGGESTIONS` undefined).

- [ ] **Step 3: Implementar en `checklist-logic.js`**

a) Helper de compat (cerca de `normalizeZone`, ~línea 144):
```js
function pisoFromZona(zona) {
  if (zona === 'amenidades') return 'Amenidades';
  if (zona === 'exterior') return 'Exterior';
  if (zona === 'interior') return 'Piso 1';
  return 'Sin piso';
}
const PISOS_DEFAULT = ['Exterior', 'Piso 1', 'Piso 2', 'Amenidades'];
```

b) En `createDefaultState` (~158): agregar `pisos: PISOS_DEFAULT.slice(),`.

c) En `normalizeChecklistData` rama v2 (~181-189): mapear `piso`:
```js
piso: space.piso || pisoFromZona(normalizeZone(space.zona)),
```
y tras mapear espacios: `normalized.pisos = Array.isArray(normalized.pisos) && normalized.pisos.length ? normalized.pisos : derivePisos(normalized.espacios);`
donde `derivePisos(espacios)` devuelve los pisos únicos en orden de aparición, o `PISOS_DEFAULT` si vacío.

d) En la rama legacy (~241-253): agregar `piso: pisoFromZona('interior')` a cada espacio y `base.pisos = PISOS_DEFAULT.slice();`.

e) `buildTemplateSpaces` (~602): agregar `piso: row[4] || pisoFromZona(row[1]),` al item (las filas de plantilla pueden traer piso en índice 4; si no, deriva de zona).

f) Agregar `TEMPLATE_DEFS.quinta` (junto a las otras, ~125) con spaces `[nombre, zona, clave, parent, piso]`: Fachada/Acceso/Caseta (Exterior), Casa principal/Sala/Cocina/Comedor/Recámaras/Baños (Piso 1), Alberca/Palapa/Asadores/Jardines/Cocina exterior/Cancha/Cabañas/Baño de alberca (Amenidades).

g) Exportar sugerencias por tipo. Agregar:
```js
const SPACE_SUGGESTIONS = {
  casa: TEMPLATE_DEFS.casa.spaces,
  departamento: TEMPLATE_DEFS.departamento.spaces,
  terreno: TEMPLATE_DEFS.terreno.spaces,
  quinta: TEMPLATE_DEFS.quinta.spaces,
};
```
y agregarlo al objeto `return { ... SPACE_SUGGESTIONS, ... }`.

- [ ] **Step 4: Correr tests** — `node test/checklist-logic.test.mjs` → `OK`.

- [ ] **Step 5: Verificar que el demo y un estado v2 real siguen cargando** (cargar `?demo=1`, sin errores en consola).

- [ ] **Step 6: Commit**
```bash
git add frontend/checklist-logic.js test/checklist-logic.test.mjs
git commit -m "feat(checklist-logic): dimensión piso, lista pisos, quinta y sugerencias (aditivo)"
```

---

## Task 3: Sistema visual Dossier en `<style>` (CHECKPOINT visual)

**Files:**
- Modify: `frontend/checklist.html` (bloque `<style>` y `<head>` fonts/icons)

- [ ] **Step 1: Reemplazar fuentes en `<head>`** — quitar Montserrat; agregar Fraunces+Inter+Spline Sans Mono y Tabler webfont (los `<link>` del spec §4).

- [ ] **Step 2: Reemplazar `:root` y base por tokens Dossier** (de `design/design-system.css`): paleta `--paper-*/--onyx/--gold*/--ink-*/--ok/--warn/--danger`, `--font-ui/display/mono`, espaciado 4px, radios, sombras sutiles. `body` con `--font-ui`, fondo `--paper-0`.

- [ ] **Step 3: Definir componentes base reutilizables** (tomar del mockup aprobado `design/mockups/captura-video.html` como referencia 1:1): `.topbar` (onyx + canto dorado), `.lane-chip`, `.sync`, botones `.btn`/`.btn-primary`(gold-leaf)/`.btn-onyx`/`.btn-ghost`/`.btn-danger`, `.field`/inputs (foco dorado), `.chip`/`.seg-btn`, `.badge`(good/fail/warn/info, sentence-case, punto de color), `.card`, bottom-sheet `.sheet`+`.overlay`, `.toast`. **Sin uppercase, sin emojis, íconos Tabler.**

- [ ] **Step 4: Capturar y revisar** — navegar `?demo=1` y verificar que el shell (aunque el render siga viejo) toma tipografía/paleta Dossier; comparar con el mockup. **Checkpoint con Bruno: enviar captura.**

- [ ] **Step 5: Commit**
```bash
git add frontend/checklist.html
git commit -m "feat(checklist): sistema visual Dossier (tokens, fuentes, componentes base)"
```

---

## Task 4: App shell — entrada por lane, topbar, estado por-dispositivo, offline y bug del buscador

**Files:**
- Modify: `frontend/checklist.html` (`<script>`: render shell, estado local, poll/save)

- [ ] **Step 1: Estado por-dispositivo en localStorage** — `modoActual` (lane), `activeCameraByMode` y `activeRoomId` se leen/escriben en `localStorage` (claves por token de contrato). Helpers `loadLocalView()` / `saveLocalView()`.

- [ ] **Step 2: Preservar estado local en `poll()`** — al construir `next` y antes de `state = next`, copiar las claves locales:
```js
next.modoActual = state.modoActual;
next.activeCameraByMode = state.activeCameraByMode;
// activeRoomId vive en variable de módulo, no en state
```
Así el sync remoto no cambia la vista del dispositivo.

- [ ] **Step 3: Red de seguridad offline** — en cada `scheduleSave`, escribir también el estado a `localStorage` (`checklist_state_<token>`). Al `cargar()`, si el `fetch` falla pero hay copia local, usarla y marcar `dirty=true` para reintentar. En `saveNow`, **reintentar indefinidamente** con backoff (no rendirse a los 4 intentos); el toast informa "sin conexión, se guardará al volver la señal".

- [ ] **Step 4: Pantalla de entrada de lane** — `renderLaneEntry()`: 5 opciones grandes (Foto/360/Video/Drone/Asesores) con ícono Tabler y una línea de qué hace. Asesores aparece deshabilitado con etiqueta "pronto" (fase 2). Elegir lane → `modoActual`, `saveLocalView()`, `render()`. Se recuerda al reabrir.

- [ ] **Step 5: Topbar Dossier** — `renderHeader()`: marca IAV (monograma dorado) + nombre/folio de propiedad (mono el folio) + `.lane-chip` (abre selector de lane) + `.sync`. Botón "Armar cuartos" accesible.

- [ ] **Step 6: Arreglar bug del buscador** — el campo de búsqueda NO debe re-renderizar toda la app por tecla; filtrar in-place (actualizar solo la lista) o conservar foco/cursor tras render.

- [ ] **Step 7: Capturar y revisar** — `?demo=1&screen=entry` muestra la entrada de lane; elegir Video lleva al shell.

- [ ] **Step 8: Commit**
```bash
git add frontend/checklist.html
git commit -m "feat(checklist): shell, entrada por lane, estado por-dispositivo, offline y fix buscador"
```

---

## Task 5: Modo "Armar cuartos" (setup aditivo) (CHECKPOINT visual)

**Files:**
- Modify: `frontend/checklist.html` (`<script>`)

- [ ] **Step 1: Selector de tipo de propiedad** — al entrar al setup sin espacios, mostrar `.seg-btn` para casa/departamento/terreno/quinta. Elegir tipo NO carga todo; **sesga las sugerencias** (`logic.SPACE_SUGGESTIONS[tipo]`).

- [ ] **Step 2: Pisos editables** — fila de chips de pisos (sugerencias `Sótano/Piso 1/Piso 2/Roof/Exterior/Amenidades`) que agregan/quitan a `state.pisos`. Un piso "en foco" donde caen los cuartos nuevos.

- [ ] **Step 3: Chips de cuartos + autocompletar** — chips de los cuartos sugeridos del tipo (tap = agregar al piso en foco) + input con autocompletar (sugiere nombres conocidos; enter = agregar; teclear lo mínimo). Cada agregado crea un espacio `{ id, nombre, piso, parentId:null, clave, estados, orden }` y `scheduleSave()`.

- [ ] **Step 4: Lista con sangría** — un textarea/lista rápida donde la sangría marca subespacio del de arriba (reusar `logic.addSpacesFromText`, extendido para asignar `piso` del foco).

- [ ] **Step 5: Aditivo y re-entrable** — "Armar cuartos" se puede reabrir; agrega sobre lo existente (no destruye). Sin botón "reemplazar todo" por defecto.

- [ ] **Step 6: Capturar y revisar** — `?demo=1&screen=setup`. **Checkpoint con Bruno: enviar captura.**

- [ ] **Step 7: Commit**
```bash
git add frontend/checklist.html
git commit -m "feat(checklist): modo Armar cuartos aditivo (chips, pisos, sugerencias por tipo)"
```

---

## Task 6: Captura Video/Drone — "app de cámara" (CHECKPOINT visual, el corazón)

**Files:**
- Modify: `frontend/checklist.html` (`<script>`)

- [ ] **Step 1: Render del cuarto en foco** — replicar el mockup aprobado: piso (dorado) + nombre del cuarto (Fraunces grande) + (padre si subespacio). `activeRoomId` define el foco; default = primer cuarto del primer piso.

- [ ] **Step 2: Tarjeta de cámara + siguiente archivo** — `.cam` con cámara activa (Sony) y `siguiente archivo · PIB2819` (mono, dorado) vía `logic.getCameraSequence`. Botón swap → sheet de cámara (Sony/Osmo). Si no hay secuencia, el sheet de iniciar secuencia (Step 5).

- [ ] **Step 3: Lista "Tomas en este cuarto"** — `mediaFilesForTarget(activeRoomId)`; la más reciente resaltada con "Marcar buena" (un toque → `logic.toggleMediaGood`); fallida = badge rojo; buena = badge verde. Cada toma: opción de nota (sheet) — notas en todas las tomas.

- [ ] **Step 4: Zona de pulgar — Toma / No sirve** — dos botones ≥56px. "Toma" (gold-leaf, muestra `+1 · <siguiente token>`) → `logic.registerMediaFile(kind:'take')`. "No sirve" (rojo) → `logic.registerMediaFile(kind:'discard', discardReason:'failed')`; mini-sheet opcional "¿qué fue?" para cambiar a `unrelated`/`empty`. Toast con deshacer.

- [ ] **Step 5: Iniciar/cambiar secuencia (sheet Dossier)** — reemplaza el `prompt`: input para el último archivo, `logic.initializeCameraSequence`. Validar con `logic.parseFilenameSequence`; toast si no hay consecutivo.

- [ ] **Step 6: Drone** — mismo loop; las unidades son `state.droneItems` (lista aérea). Sin pisos. "Cambiar toma" en vez de "Cambiar cuarto".

- [ ] **Step 7: Capturar y revisar** — `?demo=1&screen=captura` debe verse como el mockup. **Checkpoint con Bruno: enviar captura.**

- [ ] **Step 8: Commit**
```bash
git add frontend/checklist.html
git commit -m "feat(checklist): captura video/drone app-de-cámara (Toma/No sirve, secuencia, marcar buena)"
```

---

## Task 7: Cambiar cuarto (por piso) + "¿cuál fue la buena?" al salir

**Files:**
- Modify: `frontend/checklist.html` (`<script>`)

- [ ] **Step 1: Sheet selector por piso** — "Cambiar cuarto" abre un sheet con cuartos **agrupados por `state.pisos`**, subespacios con sangría, cuartos ya grabados con "✓ grabado" (siempre seleccionables). Tocar → cambia `activeRoomId`, `saveLocalView()`, cierra.

- [ ] **Step 2: "+ sub-cuarto desde el cuarto activo"** — en el foco o en el selector, agregar subespacio que hereda el piso del padre (reemplaza el `prompt` por sheet con input).

- [ ] **Step 3: Mini-sheet "¿cuál fue la buena?"** — al cambiar de cuarto, si el cuarto que se deja tuvo `take`s sin ninguna `good`, mostrar sheet con sus tokens; tocar uno/dos → `logic.toggleMediaGood`; "luego" cierra sin marcar. Saltable, no bloqueante.

- [ ] **Step 4: Capturar y revisar** — `?demo=1&screen=cambiar`.

- [ ] **Step 5: Commit**
```bash
git add frontend/checklist.html
git commit -m "feat(checklist): cambiar cuarto por piso + selección de buena al salir"
```

---

## Task 8: Captura Foto/360 (cobertura)

**Files:**
- Modify: `frontend/checklist.html` (`<script>`)

- [ ] **Step 1: Rejilla por piso** — cuartos agrupados por `state.pisos`; cada tarjeta muestra el estado del servicio activo (foto o t360).

- [ ] **Step 2: Toque cicla estado** — pendiente → listo → no aplica (escribe `space.estados[modo]`), `scheduleSave()`. Sin cámara ni consecutivos. Color: verde listo, rojo no aplica, neutro pendiente.

- [ ] **Step 3: Capturar y revisar** — `?demo=1&screen=foto`.

- [ ] **Step 4: Commit**
```bash
git add frontend/checklist.html
git commit -m "feat(checklist): cobertura foto/360 (rejilla por piso, ciclo de estado)"
```

---

## Task 9: Cierre — semáforo + conciliación + línea de tiempo cronológica (CHECKPOINT visual)

**Files:**
- Modify: `frontend/checklist.html` (`<script>`)

- [ ] **Step 1: Semáforo** — paneles rojo/amarillo/verde con `logic.getPendingSummary` (rojo: claves/amenidades pendientes y servicios incompletos; amarillo: excepciones/no aplica/descartes; verde: completos). Estilo Dossier (sin los negros actuales).

- [ ] **Step 2: Conciliación con la cámara** — por cámara con secuencia: "la app va en `<último token>`" + recordatorio "confirma contra tu cámara". Escenas de video/drone sin una buena marcada. Archivos sin identificar (con botón resolver).

- [ ] **Step 3: Línea de tiempo cronológica por cámara** — lista de `mediaFiles` de la cámara en orden de `fileCounter`, con cuarto al lado. Acciones por archivo (sheets): insertar olvidado antes (`logic.insertOmittedMediaFile`), quitar registro (`logic.removeMediaFile`), reasignar (`logic.updateMediaFile {targetId}`), marcar buena/fallida, nota. (Reemplazar todos los `confirm/prompt` por sheets.)

- [ ] **Step 4: Capturar y revisar** — `?demo=1&screen=cierre`. **Checkpoint con Bruno: enviar captura.**

- [ ] **Step 5: Commit**
```bash
git add frontend/checklist.html
git commit -m "feat(checklist): Cierre con semáforo, conciliación y línea de tiempo editable"
```

---

## Task 10: Edición (vista por cuarto, editable)

**Files:**
- Modify: `frontend/checklist.html` (`<script>`)

- [ ] **Step 1: Agrupar por servicio → piso → cuarto** — usar `logic.getMediaSceneGroups`; ordenar por piso. Mostrar buenas, otras, descartes (con motivo), sin identificar, cámara, notas.

- [ ] **Step 2: Filas editables** — reasignar, marcar buena, agregar/editar nota (sheets, no prompt).

- [ ] **Step 3: Capturar y revisar** — `?demo=1&screen=edicion`.

- [ ] **Step 4: Commit**
```bash
git add frontend/checklist.html
git commit -m "feat(checklist): Edición por cuarto editable, agrupada por piso"
```

---

## Task 11: Pasada de pulido + flujo completo

**Files:**
- Modify: `frontend/checklist.html`

- [ ] **Step 1: Barrer `prompt()`/`confirm()` restantes** — que ninguno quede; todos en sheets Dossier.
- [ ] **Step 2: Íconos Tabler** — reemplazar todo `...`/`X` literal por íconos finos; revisar que ninguno falte.
- [ ] **Step 3: Revisar alineación/espaciado al pixel** en cada pantalla (escala 4px, hairlines, simetría).
- [ ] **Step 4: Quitar el `<script src="./checklist-demo.js">` de la carga normal** (solo bajo `?demo=1`); confirmar que la app real (con token) carga, captura, guarda y reconcilia.
- [ ] **Step 5: Capturas de flujo completo** (entry → setup → captura → cambiar → cierre → edición) para revisión final con Bruno.
- [ ] **Step 6: Commit**
```bash
git add frontend/checklist.html
git commit -m "feat(checklist): pulido final fase 1 (sheets, íconos, alineación)"
```

---

## Cobertura del spec (self-review)

- §4 Dossier → Task 3. §5 lanes + estado por-dispositivo → Task 4. §6 piso → Task 2. §7 setup aditivo → Task 5. §8 captura video/drone → Task 6. §9 dos cámaras → Task 6 (swap/secuencia). §10 foto/360 → Task 8. §11 Cierre + cronológico → Task 9. §12 Edición → Task 10. §14 offline + buscador → Task 4. Demo/capturas → Task 1. Pulido/anti-prompt → Task 11.
- **Diferido (no en fase 1, correcto):** lane Asesores (§13), Videógrafo 2, múltiples asesores.
- **Riesgo conocido (spec §14):** merge offline en paralelo (último gana). Mitigado: copia local nunca pierde TU captura; evaluación de merge por-campo queda fuera de fase 1, anotada.
