# Bitacora de Produccion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `frontend/checklist.html` into a field-first Bitacora de Produccion with capture modes, spaces/subspaces, batch space entry, chronological log, service toggles, and closing review.

**Architecture:** Keep the existing Cloudflare endpoint contract (`obtenerChecklist` / `guardarChecklist`) and store the new data shape inside the existing `checklist.cuartos_json` JSON. Extract pure checklist state helpers to `frontend/checklist-logic.js` so migration, parsing, service toggles, capture registration, undo, and pending calculations can be tested without a browser. Rebuild `frontend/checklist.html` as a standalone HTML/CSS/JS page that uses those helpers and preserves polling/autosave behavior.

**Tech Stack:** Static HTML/CSS/vanilla JavaScript, Cloudflare Worker existing API, Node.js built-in `node:test` for helper tests, Playwright/browser verification for UI.

---

## File Structure

- Create `frontend/checklist-logic.js`
  - Pure state helpers exposed as `window.IAVChecklistLogic` in the browser and `module.exports` in Node tests.
  - Responsibilities: default state, legacy migration, batch parsing, service toggles, capture registration, undo, pending summaries, log filtering.
- Create `frontend/checklist-logic.test.js`
  - Node built-in tests for the pure helper behaviors.
- Modify `frontend/checklist.html`
  - Full UI rewrite for Bitacora de Produccion while preserving API URLs, token loading, autosave, polling, name persistence, error/loading states, and static deploy compatibility.
- Modify `MASTER_V4.md`
  - Document R46 after implementation and update the top "Ultima actualizacion" line.

---

### Task 1: Logic Helpers and Failing Tests

**Files:**
- Create: `frontend/checklist-logic.test.js`
- Create: `frontend/checklist-logic.js`

- [ ] **Step 1: Create failing tests for migration, batch parsing, capture order, services, and pending summaries**

Create `frontend/checklist-logic.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('./checklist-logic.js');

test('migrates legacy checklist format to version 2 with active services and drone defaults', () => {
  const migrated = logic.normalizeChecklistData({
    cuartos: [
      { nombre: 'Sala', foto: 'Ana', video: 'Bruno', t360: false },
      { nombre: 'Cocina', foto: false, video: false, t360: 'Luis' },
    ],
    columnas: { foto: true, video: true, t360: false },
  });

  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.servicios, { foto: true, t360: false, video: true, drone: true });
  assert.equal(migrated.espacios.length, 2);
  assert.equal(migrated.espacios[0].estados.foto.estado, 'hecho');
  assert.equal(migrated.espacios[0].estados.video.estado, 'hecho');
  assert.equal(migrated.espacios[1].estados.t360.estado, 'hecho');
  assert.equal(migrated.droneItems.length > 0, true);
  assert.deepEqual(migrated.bitacora, []);
});

test('parses pasted spaces with indentation and parent arrow syntax', () => {
  const parsed = logic.parseSpacesText(`Sala
Recamara principal
  Bano principal
  Closet
Recamara 2 > Bano
Terraza`);

  assert.deepEqual(parsed.map((item) => item.nombre), [
    'Sala',
    'Recamara principal',
    'Bano principal',
    'Closet',
    'Recamara 2',
    'Bano',
    'Terraza',
  ]);
  const recamara = parsed.find((item) => item.nombre === 'Recamara principal');
  const banoPrincipal = parsed.find((item) => item.nombre === 'Bano principal');
  const recamara2 = parsed.find((item) => item.nombre === 'Recamara 2');
  const bano2 = parsed.find((item) => item.nombre === 'Bano');
  assert.equal(banoPrincipal.parentId, recamara.id);
  assert.equal(bano2.parentId, recamara2.id);
});

test('registers video and drone captures with independent sequence numbers', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala\nCocina');
  const salaId = state.espacios.find((item) => item.nombre === 'Sala').id;
  const cocinaId = state.espacios.find((item) => item.nombre === 'Cocina').id;
  const droneId = state.droneItems[0].id;

  state = logic.registerCapture(state, { tipo: 'video', targetId: salaId, autor: 'Bruno', now: new Date('2026-06-03T17:00:00Z') });
  state = logic.registerCapture(state, { tipo: 'video', targetId: cocinaId, autor: 'Bruno', now: new Date('2026-06-03T17:01:00Z') });
  state = logic.registerCapture(state, { tipo: 'drone', targetId: droneId, autor: 'Bruno', now: new Date('2026-06-03T17:02:00Z') });

  assert.equal(state.bitacora[0].orden, 1);
  assert.equal(state.bitacora[1].orden, 2);
  assert.equal(state.bitacora[2].orden, 1);
  assert.equal(state.espacios.find((item) => item.id === cocinaId).estados.video.ultimoOrden, 2);
  assert.equal(state.droneItems[0].estado, 'hecho');
  assert.equal(state.droneItems[0].ultimoOrden, 1);
});

test('disabled services are excluded from pending summary without deleting history', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.registerCapture(state, { tipo: 't360', targetId: salaId, autor: 'Luis', now: new Date('2026-06-03T17:00:00Z') });
  state = logic.setServiceActive(state, 't360', false);

  const summary = logic.getPendingSummary(state);
  assert.equal(summary.byService.t360, undefined);
  assert.equal(state.bitacora.length, 1);
  assert.equal(state.bitacora[0].tipo, 't360');
});

test('undo removes the last capture and restores the target state when no previous capture exists', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.registerCapture(state, { tipo: 'foto', targetId: salaId, autor: 'Ana', now: new Date('2026-06-03T17:00:00Z') });
  state = logic.undoLastLog(state);

  assert.equal(state.bitacora.length, 0);
  assert.equal(state.espacios[0].estados.foto.estado, 'pendiente');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test frontend/checklist-logic.test.js
```

Expected: FAIL because `frontend/checklist-logic.js` does not exist or exported functions are missing.

- [ ] **Step 3: Implement minimal helper module**

Create `frontend/checklist-logic.js` with:

```javascript
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IAVChecklistLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const SERVICES_DEFAULT = { foto: true, t360: true, video: true, drone: true };
  const SERVICE_LABELS = { foto: 'Foto', t360: '360', video: 'Video', drone: 'Drone' };
  const DRONE_DEFAULTS = [
    'Fachada aerea',
    'Vista general de propiedad',
    'Calle / acceso',
    'Entorno / ubicacion',
    'Amenidades',
    'Terreno completo',
    'Roof / terraza',
    'Toma de cierre',
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function blankEstados() {
    return {
      foto: { estado: 'pendiente' },
      t360: { estado: 'pendiente' },
      video: { estado: 'pendiente' },
    };
  }

  function createDroneItems() {
    return DRONE_DEFAULTS.map((nombre, index) => ({
      id: 'drone-default-' + index,
      nombre,
      estado: 'pendiente',
      ordenLista: index + 1,
    }));
  }

  function createDefaultState() {
    return {
      version: 2,
      servicios: clone(SERVICES_DEFAULT),
      modoActual: 'video',
      espacios: [],
      droneItems: createDroneItems(),
      bitacora: [],
    };
  }

  function legacyValueToState(value) {
    if (!value) return { estado: 'pendiente' };
    return { estado: 'hecho', autor: typeof value === 'string' ? value : '', hora: '' };
  }

  function normalizeChecklistData(data) {
    if (data && data.version === 2) {
      const normalized = Object.assign(createDefaultState(), clone(data));
      normalized.servicios = Object.assign(clone(SERVICES_DEFAULT), normalized.servicios || {});
      normalized.espacios = (normalized.espacios || []).map((space, index) => ({
        id: space.id || makeId('esp'),
        nombre: space.nombre || 'Espacio sin nombre',
        parentId: space.parentId || null,
        orden: space.orden || index + 1,
        clave: !!space.clave,
        estados: Object.assign(blankEstados(), space.estados || {}),
      }));
      normalized.droneItems = (normalized.droneItems && normalized.droneItems.length ? normalized.droneItems : createDroneItems())
        .map((item, index) => ({
          id: item.id || makeId('drone'),
          nombre: item.nombre || 'Toma drone',
          estado: item.estado || 'pendiente',
          ordenLista: item.ordenLista || index + 1,
          ultimoOrden: item.ultimoOrden || null,
          noAplica: !!item.noAplica,
        }));
      normalized.bitacora = normalized.bitacora || [];
      return normalized;
    }

    const base = createDefaultState();
    const legacyRooms = data && Array.isArray(data.cuartos) ? data.cuartos : [];
    const legacyCols = data && data.columnas ? data.columnas : {};
    base.servicios = {
      foto: legacyCols.foto !== false,
      t360: legacyCols.t360 !== false,
      video: legacyCols.video !== false,
      drone: true,
    };
    base.espacios = legacyRooms.map((room, index) => ({
      id: room.id || 'legacy-' + index,
      nombre: room.nombre || 'Espacio sin nombre',
      parentId: null,
      orden: index + 1,
      clave: false,
      estados: {
        foto: legacyValueToState(room.foto || room.completado),
        t360: legacyValueToState(room.t360 || room.completado),
        video: legacyValueToState(room.video || room.completado),
      },
    }));
    return base;
  }

  function parseSpacesText(text) {
    const result = [];
    const stack = [];
    String(text || '').split(/\r?\n/).forEach((rawLine) => {
      if (!rawLine.trim()) return;
      const arrowParts = rawLine.split('>').map((part) => part.trim()).filter(Boolean);
      if (arrowParts.length > 1) {
        let parentId = null;
        arrowParts.forEach((name) => {
          let existing = result.find((item) => item.nombre === name && item.parentId === parentId);
          if (!existing) {
            existing = { id: makeId('esp'), nombre: name, parentId, orden: result.length + 1 };
            result.push(existing);
          }
          parentId = existing.id;
        });
        return;
      }
      const indent = rawLine.match(/^\s*/)[0].replace(/\t/g, '  ').length;
      const level = Math.floor(indent / 2);
      const item = { id: makeId('esp'), nombre: rawLine.trim(), parentId: null, orden: result.length + 1 };
      if (level > 0 && stack[level - 1]) item.parentId = stack[level - 1].id;
      stack[level] = item;
      stack.length = level + 1;
      result.push(item);
    });
    return result;
  }

  function addSpacesFromText(state, text) {
    const next = clone(state);
    const parsed = parseSpacesText(text);
    parsed.forEach((item) => {
      next.espacios.push({
        id: item.id,
        nombre: item.nombre,
        parentId: item.parentId,
        orden: next.espacios.length + 1,
        clave: false,
        estados: blankEstados(),
      });
    });
    return next;
  }

  function setServiceActive(state, service, active) {
    const next = clone(state);
    next.servicios[service] = !!active;
    if (!next.servicios[next.modoActual]) {
      next.modoActual = Object.keys(next.servicios).find((key) => next.servicios[key]) || 'video';
    }
    return next;
  }

  function getNextOrder(state, tipo) {
    return state.bitacora.filter((entry) => entry.tipo === tipo && entry.orden).length + 1;
  }

  function formatTime(now) {
    const date = now instanceof Date ? now : new Date();
    return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
  }

  function findTargetName(state, tipo, targetId) {
    const list = tipo === 'drone' ? state.droneItems : state.espacios;
    const item = list.find((entry) => entry.id === targetId);
    return item ? item.nombre : '';
  }

  function registerCapture(state, options) {
    const next = clone(state);
    const tipo = options.tipo;
    const targetId = options.targetId;
    const order = tipo === 'video' || tipo === 'drone' ? getNextOrder(next, tipo) : null;
    const hora = formatTime(options.now);
    const log = {
      id: makeId('log'),
      tipo,
      orden: order,
      targetId,
      nombre: findTargetName(next, tipo, targetId),
      autor: options.autor || 'Anonimo',
      hora,
      nota: '',
      bandera: '',
    };

    if (tipo === 'drone') {
      const item = next.droneItems.find((entry) => entry.id === targetId);
      if (item) {
        item.estado = 'hecho';
        item.autor = log.autor;
        item.hora = hora;
        item.ultimoOrden = order;
      }
    } else {
      const space = next.espacios.find((entry) => entry.id === targetId);
      if (space) {
        space.estados[tipo] = { estado: 'hecho', autor: log.autor, hora };
        if (order) space.estados[tipo].ultimoOrden = order;
      }
    }

    next.bitacora.push(log);
    return next;
  }

  function undoLastLog(state) {
    const next = clone(state);
    const log = next.bitacora.pop();
    if (!log) return next;
    if (log.tipo === 'drone') {
      const item = next.droneItems.find((entry) => entry.id === log.targetId);
      const previous = next.bitacora.filter((entry) => entry.tipo === 'drone' && entry.targetId === log.targetId).pop();
      if (item) {
        if (previous) {
          item.estado = 'hecho';
          item.ultimoOrden = previous.orden || null;
          item.autor = previous.autor || '';
          item.hora = previous.hora || '';
        } else {
          item.estado = 'pendiente';
          delete item.ultimoOrden;
          delete item.autor;
          delete item.hora;
        }
      }
      return next;
    }
    const space = next.espacios.find((entry) => entry.id === log.targetId);
    if (space && space.estados[log.tipo]) {
      const previous = next.bitacora.filter((entry) => entry.tipo === log.tipo && entry.targetId === log.targetId).pop();
      if (previous) {
        space.estados[log.tipo] = { estado: 'hecho', autor: previous.autor || '', hora: previous.hora || '' };
        if (previous.orden) space.estados[log.tipo].ultimoOrden = previous.orden;
      } else {
        space.estados[log.tipo] = { estado: 'pendiente' };
      }
    }
    return next;
  }

  function getPendingSummary(state) {
    const summary = { byService: {}, totalPending: 0, totalRequired: 0, totalDone: 0 };
    ['foto', 't360', 'video'].forEach((service) => {
      if (!state.servicios[service]) return;
      const pending = state.espacios
        .filter((space) => (space.estados[service] || {}).estado !== 'hecho' && (space.estados[service] || {}).estado !== 'no_aplica')
        .map((space) => space.nombre);
      const required = state.espacios
        .filter((space) => (space.estados[service] || {}).estado !== 'no_aplica').length;
      summary.byService[service] = { label: SERVICE_LABELS[service], pending, required, done: required - pending.length };
      summary.totalPending += pending.length;
      summary.totalRequired += required;
      summary.totalDone += required - pending.length;
    });
    if (state.servicios.drone) {
      const pending = state.droneItems
        .filter((item) => item.estado !== 'hecho' && !item.noAplica)
        .map((item) => item.nombre);
      const required = state.droneItems.filter((item) => !item.noAplica).length;
      summary.byService.drone = { label: SERVICE_LABELS.drone, pending, required, done: required - pending.length };
      summary.totalPending += pending.length;
      summary.totalRequired += required;
      summary.totalDone += required - pending.length;
    }
    return summary;
  }

  function filterLog(state, filter) {
    if (!filter || filter === 'todo') return state.bitacora;
    if (filter === 'notas') return state.bitacora.filter((entry) => entry.nota || entry.bandera);
    return state.bitacora.filter((entry) => entry.tipo === filter);
  }

  return {
    SERVICES_DEFAULT,
    SERVICE_LABELS,
    DRONE_DEFAULTS,
    createDefaultState,
    normalizeChecklistData,
    parseSpacesText,
    addSpacesFromText,
    setServiceActive,
    registerCapture,
    undoLastLog,
    getPendingSummary,
    filterLog,
  };
});
```

- [ ] **Step 4: Run tests to verify helpers pass**

Run:

```bash
node --test frontend/checklist-logic.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit logic helpers**

Run:

```bash
git add frontend/checklist-logic.js frontend/checklist-logic.test.js
git commit -m "R46 — logica bitacora de produccion"
```

---

### Task 2: Rebuild Checklist UI as Bitacora de Produccion

**Files:**
- Modify: `frontend/checklist.html`

- [ ] **Step 1: Replace the HTML document with the new app shell**

Use a single-page static document with:

- Google Font Montserrat.
- `<script src="./checklist-logic.js"></script>` before the inline page script.
- Topbar with folio, cliente, sync, name input, and services button.
- Primary mode switch.
- Three tabs: Captura, Bitacora, Cierre.
- Main container `#main`.
- Bottom toast with undo support.
- Modal/overlay shells for services, batch spaces, and item actions.

- [ ] **Step 2: Implement mobile-first CSS**

Design direction:

- Field utility, not marketing: dense, calm, high contrast, easy outdoors.
- Palette: off-white page, white surfaces, onyx text/actions, IAV gold as accent, distinct service colors only as small chips.
- Cards no larger than needed; border radius 8px or less for repeated UI.
- Sticky top controls; thumb-friendly buttons; no nested cards.
- Desktop max width around 860px with centered work surface.

- [ ] **Step 3: Implement state and API glue**

Preserve the current API behavior:

```javascript
const API = 'https://contratos.inmueblesaudiovisuales.com/api';
const TOKEN = new URLSearchParams(location.search).get('token') || '';
```

Use:

- `apiGet({ action: 'obtenerChecklist' })`
- `apiPost({ action: 'guardarChecklist', cuartos: state })`

Because the Worker stores `body.cuartos` inside `{ cuartos: body.cuartos, columnas: body.columnas }`, load should normalize either:

- `data.cuartos` as a version 2 object, or
- `{ cuartos: data.cuartos, columnas: data.columnas }` as legacy.

Save can send:

```javascript
apiPost({ action: 'guardarChecklist', cuartos: state, columnas: state.servicios })
```

- [ ] **Step 4: Implement render functions**

Required render units inside `checklist.html`:

- `renderHeader(data)`
- `renderModeSwitch()`
- `renderTabs()`
- `renderCaptureView()`
- `renderLogView()`
- `renderCloseView()`
- `renderServicesModal()`
- `renderBatchModal()`
- `renderActionsModal()`
- `renderToast(message, undoHandler)`

- [ ] **Step 5: Implement capture interactions**

Required behaviors:

- Tapping a normal space in Foto/360/Video calls `logic.registerCapture`.
- Tapping a drone item in Drone calls `logic.registerCapture`.
- Video and Drone chips show sequence number.
- After capture, show toast with `Deshacer`.
- `Deshacer` calls `logic.undoLastLog`.
- Autosave uses the existing debounce + retry pattern.

- [ ] **Step 6: Implement batch spaces and templates**

Required behaviors:

- `+ Espacios` opens a textarea.
- Pasting a list with indentation creates subspaces.
- Template buttons append text to the textarea.
- Confirming applies `logic.addSpacesFromText`.
- Existing spaces are not deleted.

- [ ] **Step 7: Implement services active modal**

Required behaviors:

- Toggle Foto, 360, Video, Drone manually.
- Disabled services disappear from mode switch and pending summary.
- If current mode is disabled, switch to the next active service.
- Keep historical log entries visible.

- [ ] **Step 8: Implement secondary actions**

Required minimum for v1:

- For a space/service: mark no aplica, clear state, add subspace, edit name, delete space.
- For a log entry: mark usar, no usar, repetida, problema, add note, delete log.

- [ ] **Step 9: Run manual syntax check**

Run:

```bash
node --check frontend/checklist-logic.js
```

Expected: no syntax errors.

For `frontend/checklist.html`, run a browser load in Task 4 because it contains inline browser code.

- [ ] **Step 10: Commit UI rebuild**

Run:

```bash
git add frontend/checklist.html
git commit -m "R46 — rediseña checklist como bitacora"
```

---

### Task 3: Documentation Update

**Files:**
- Modify: `MASTER_V4.md`

- [ ] **Step 1: Update top timestamp**

Use:

```bash
TZ="America/Monterrey" date "+%Y-%m-%d %H:%M:%S %Z"
```

Update the first block to reference R46 and Bitacora de Produccion.

- [ ] **Step 2: Add R46 section near the top of applied changes**

Add a section before R37:

```markdown
### Ronda 46 — Bitacora de Produccion en checklist.html (usar la hora real de Monterrey del momento de documentar)

**Cambio:** `checklist.html` se rediseña como Bitacora de Produccion para registrar capturas en campo y dejar secuencia util para edicion.

| ID | Archivo | Cambio |
|----|---------|--------|
| R46-01 | `frontend/checklist-logic.js` | Nuevo modulo de logica pura para formato v2, migracion legacy, servicios activos, espacios en lote, registro de capturas, undo, pendientes y filtros de bitacora. |
| R46-02 | `frontend/checklist-logic.test.js` | Pruebas con `node:test` para migracion, parsing de espacios/subespacios, orden independiente Video/Drone, servicios desactivados y undo. |
| R46-03 | `frontend/checklist.html` | Rediseño completo a Bitacora de Produccion: modos Foto/360/Video/Drone, espacios/subespacios, Drone separado, bitacora cronologica, cierre de pendientes, acciones secundarias y autosave. |
| R46-04 | `MASTER_V4.md` | Documenta R46. No requiere cambios al adapter ni a D1 fuera del JSON existente. |
```

- [ ] **Step 3: Commit docs**

Run:

```bash
git add MASTER_V4.md
git commit -m "R46 — documenta bitacora de produccion"
```

---

### Task 4: Verification

**Files:**
- Verify: `frontend/checklist.html`
- Verify: `frontend/checklist-logic.js`
- Verify: `frontend/checklist-logic.test.js`

- [ ] **Step 1: Run helper tests**

Run:

```bash
node --test frontend/checklist-logic.test.js
```

Expected: PASS.

- [ ] **Step 2: Start local static server**

Run:

```bash
python3 -m http.server 8789 --directory frontend
```

Expected: local server available at `http://localhost:8789`.

- [ ] **Step 3: Open checklist without token**

Open:

```text
http://localhost:8789/checklist.html
```

Expected: visible friendly error that token is missing. No JavaScript console errors.

- [ ] **Step 4: Browser smoke test with mocked API**

Use Playwright route interception for:

- `GET https://contratos.inmueblesaudiovisuales.com/api/obtenerChecklist?...`
- `POST https://contratos.inmueblesaudiovisuales.com/api/guardarChecklist`

Mock `obtenerChecklist` with:

```json
{
  "ok": true,
  "folio": "IAV-2606.03-A",
  "nombreCliente": "Casa Demo",
  "cuartos": {
    "version": 2,
    "servicios": { "foto": true, "t360": true, "video": true, "drone": true },
    "modoActual": "video",
    "espacios": [],
    "droneItems": [],
    "bitacora": []
  },
  "columnas": { "foto": true, "t360": true, "video": true, "drone": true }
}
```

Then verify:

- Page loads.
- Batch add creates spaces and subspaces.
- Selecting Video and tapping spaces creates Video 01 / Video 02.
- Selecting Drone shows drone list and creates Drone 01.
- Disabling 360 removes it from pending counts.
- Bitacora tab shows chronological log.
- Cierre tab shows pending summary.

- [ ] **Step 5: Mobile screenshot review**

Use browser viewport around `390x844`.

Expected:

- Top controls fit.
- Mode buttons are thumb-friendly.
- Space list is readable.
- No overlapping text or controls.
- Cierre view is scannable.

- [ ] **Step 6: Desktop screenshot review**

Use browser viewport around `1280x900`.

Expected:

- Content remains centered and does not stretch awkwardly.
- Log and close views are easy to scan.
- No layout overlap.

- [ ] **Step 7: Final status check**

Run:

```bash
git status --short --branch
git log --oneline -5
```

Expected: local branch contains R46 commits and no unintended uncommitted files except a running server process, if any.

---

## Self-Review

- Spec coverage: The plan covers service toggles, modes, spaces/subspaces, batch entry, drone mode, chronological bitacora, cierre, migration, and no DB/adapter changes.
- Placeholder scan: No TBD/TODO placeholders are required for implementation.
- Type consistency: The plan consistently uses `foto`, `t360`, `video`, `drone`, `espacios`, `droneItems`, and `bitacora`.
