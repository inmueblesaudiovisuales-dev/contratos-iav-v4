# Checklist JSON version 2 para la app de metadatos — Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** Que `exportarBitacora()` produzca un JSON `version: 2` con `token`, `rev`, `entrega`, `logo`, `negocio` y `grabaciones[]`, sin que la app toque la DB ni Drive, manteniendo intacto el formato `archivos[]` (version 1) y el candado de concurrencia por `rev`.

**Arquitectura:** El ensamblado de los bloques que vienen de la DB (`entrega`, `logo`, `negocio`) vive en `checklist.html`: un fetch a `obtenerContrato?token=…` enriquece el objeto `meta` con objetos ya listos. `buildExport` (lógica pura en `checklist-logic.js`) solo los pasa tal cual (omitiendo los ausentes) y deriva `grabaciones[]` del estado. Los rangos manuales de foto/360 viven en `state.rangosManuales` para pasar por el mismo guardado con candado por `rev` y se funden por cámara en `mergeChecklist`.

**Stack:** Frontend vanilla JS (`checklist.html` + `checklist-logic.js`), pruebas con `node:test` (`node --test frontend/checklist-logic.test.js`). Sin build. Worker NO se toca (`obtenerContrato` ya hace `SELECT *`).

**Fuente de verdad:** `iav-metadata-app/docs/integracion/2026-06-10-checklist-cambios-para-la-app.md`.

**Regla de despliegue:** este repo despliega al empujar a `main`. NO empujar hasta que Bruno verifique un export real. Trabajar y commitear en `main` local; mantener el push pausado.

---

## Estructura de archivos

- Modificar: `frontend/checklist-logic.js`
  - `createDefaultState()` (~línea 2535): agregar `rangosManuales: {}`.
  - `mergeChecklist(base, incoming)` (línea 1845): fundir `rangosManuales` por cámara.
  - `normalizeChecklistData()` (línea 2929, rama version 2/3): garantizar `rangosManuales` presente.
  - `buildExport(state, meta)` (línea 3823): subir a `version: 2`, pasar `token`/`rev`/`entrega`/`logo`/`negocio` desde `meta`, derivar `grabaciones[]`.
- Modificar: `frontend/checklist-logic.test.js`: pruebas nuevas para lo anterior.
- Modificar: `frontend/checklist.html`
  - `cargar()` (línea 1505): tras fijar `meta`, llamar a un helper que hace fetch a `obtenerContrato` y enriquece `meta.entrega/logo/negocio` (try/catch que degrada).
  - `exportarBitacora()` (línea 5437): fijar `meta.token = TOKEN` y `meta.rev = currentRev` antes de `buildExport`.
  - Vista de edición (`renderEditView`, alrededor de línea 5400-5450): panel "Rangos de archivo" que escribe `state.rangosManuales` y dispara `scheduleSave`.

---

### Task 1: `rangosManuales` en el estado (default, normalización, fusión)

**Files:**
- Modify: `frontend/checklist-logic.js:2535` (createDefaultState), `:2929` (normalizeChecklistData), `:1845` (mergeChecklist)
- Test: `frontend/checklist-logic.test.js`

- [ ] **Step 1: Escribir la prueba que falla**

Agregar al final de `frontend/checklist-logic.test.js`:

```javascript
test('createDefaultState incluye rangosManuales vacio', () => {
  const s = logic.normalizeChecklistData({ version: 3, espacios: [] });
  assert.deepEqual(s.rangosManuales, {});
});

test('normalizeChecklistData preserva rangosManuales entrante', () => {
  const s = logic.normalizeChecklistData({
    version: 3,
    espacios: [],
    rangosManuales: { 'foto-sony': { primer: 'DSC00101', ultimo: 'DSC00260' } },
  });
  assert.deepEqual(s.rangosManuales, { 'foto-sony': { primer: 'DSC00101', ultimo: 'DSC00260' } });
});

test('mergeChecklist funde rangosManuales por camara sin perder ninguno', () => {
  const base = logic.normalizeChecklistData({
    version: 3, espacios: [],
    rangosManuales: { 'foto-sony': { primer: 'DSC00101', ultimo: 'DSC00260' } },
  });
  const incoming = logic.normalizeChecklistData({
    version: 3, espacios: [],
    rangosManuales: { 'insta360': { primer: 'IMG_0001', ultimo: 'IMG_0090' } },
  });
  const merged = logic.mergeChecklist(base, incoming);
  assert.deepEqual(merged.rangosManuales, {
    'foto-sony': { primer: 'DSC00101', ultimo: 'DSC00260' },
    'insta360': { primer: 'IMG_0001', ultimo: 'IMG_0090' },
  });
});

test('mergeChecklist: incoming gana en la misma camara', () => {
  const base = logic.normalizeChecklistData({
    version: 3, espacios: [],
    rangosManuales: { 'foto-sony': { primer: 'DSC00001', ultimo: 'DSC00100' } },
  });
  const incoming = logic.normalizeChecklistData({
    version: 3, espacios: [],
    rangosManuales: { 'foto-sony': { primer: 'DSC00101', ultimo: 'DSC00260' } },
  });
  const merged = logic.mergeChecklist(base, incoming);
  assert.deepEqual(merged.rangosManuales['foto-sony'], { primer: 'DSC00101', ultimo: 'DSC00260' });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test frontend/checklist-logic.test.js 2>&1 | tail -6`
Esperado: FALLA (rangosManuales undefined / fusión plana pierde uno).

- [ ] **Step 3: Implementar el mínimo**

En `createDefaultState()` (dentro del objeto que retorna, junto a `tombstones: []`):

```javascript
      tombstones: [],
      rangosManuales: {},
      guide: { tipoPropiedad: null, descripcion: '', proposal: null, incluirDrone: false },
```

En `normalizeChecklistData()`, rama version 2/3, junto a las otras normalizaciones (p. ej. tras `normalized.bitacora = normalized.bitacora || [];`):

```javascript
      normalized.rangosManuales = (normalized.rangosManuales && typeof normalized.rangosManuales === 'object')
        ? normalized.rangosManuales : {};
```

En `mergeChecklist()`, antes del `return merged;` final:

```javascript
    // rangosManuales: fundir por cameraId (incoming gana en la misma camara). Un Object.assign
    // plano del merged perderia las camaras que solo estan en base; aqui se unen ambas.
    merged.rangosManuales = Object.assign({}, base.rangosManuales || {}, incoming.rangosManuales || {});
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test frontend/checklist-logic.test.js 2>&1 | tail -6`
Esperado: PASS (todas verdes, 275 previas + 4 nuevas = 279).

- [ ] **Step 5: Commit**

```bash
git add frontend/checklist-logic.js frontend/checklist-logic.test.js
git commit -m "R109 — checklist: rangosManuales en estado (default, normalize, merge por camara)"
```

---

### Task 2: `buildExport` sube a version 2 y pasa token/rev/entrega/logo/negocio desde meta

**Files:**
- Modify: `frontend/checklist-logic.js:3973` (objeto de retorno de buildExport)
- Test: `frontend/checklist-logic.test.js`

- [ ] **Step 1: Escribir la prueba que falla**

```javascript
test('buildExport version 2 con token, rev y bloques de negocio desde meta', () => {
  const state = logic.normalizeChecklistData({
    version: 3, espacios: [],
    mediaFiles: [{ id: 'm1', cameraId: 'sony-main', fileToken: 'C0012', fileCounter: 12, kind: 'take' }],
  });
  const meta = {
    folio: '2026-06-001', nombreCliente: 'ABC', token: 'tok-123', rev: 7,
    entrega: { carpetaEntregablesId: '1AbC', carpetaEntregablesUrl: 'https://drive.google.com/drive/folders/1AbC', carpetaControlId: '1XyZ' },
    logo: { url: 'https://drive.google.com/uc?export=download&id=FILE', todos: [{ id: 'FILE', nombre: 'logo.png' }] },
    negocio: { paquete: 'Paquete Basico - Casa', entregablesTexto: '50 fotos' },
  };
  const out = logic.buildExport(state, meta);
  assert.equal(out.version, 2);
  assert.equal(out.token, 'tok-123');
  assert.equal(out.rev, 7);
  assert.deepEqual(out.entrega, meta.entrega);
  assert.deepEqual(out.logo, meta.logo);
  assert.deepEqual(out.negocio, meta.negocio);
  // archivos[] no cambia de forma
  assert.equal(out.archivos[0].archivo, 'C0012');
});

test('buildExport omite entrega/logo/negocio si meta no los trae (contrato sin firmar / sin red)', () => {
  const state = logic.normalizeChecklistData({
    version: 3, espacios: [],
    mediaFiles: [{ id: 'm1', cameraId: 'sony-main', fileToken: 'C0012', fileCounter: 12, kind: 'take' }],
  });
  const out = logic.buildExport(state, { folio: 'F', nombreCliente: 'C' });
  assert.equal(out.version, 2);
  assert.equal(out.token, '');
  assert.ok(!('entrega' in out));
  assert.ok(!('logo' in out));
  assert.ok(!('negocio' in out));
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test frontend/checklist-logic.test.js 2>&1 | tail -6`
Esperado: FALLA (version sigue en 1; sin token/rev/entrega).

- [ ] **Step 3: Implementar el mínimo**

En `buildExport`, reemplazar el objeto de retorno (línea ~3973) por:

```javascript
    const out = {
      version: 2,
      token: meta.token || '',
      rev: meta.rev != null ? meta.rev : null,
      folio: meta.folio || '',
      cliente: meta.nombreCliente || '',
      exportadoEn: new Date().toISOString(),
      totalArchivos: archivos.length,
      archivos,
      resumenGuia,
      guionEdicion,
    };
    if (meta.entrega) out.entrega = meta.entrega;
    if (meta.logo) out.logo = meta.logo;
    if (meta.negocio) out.negocio = meta.negocio;
    return out;
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test frontend/checklist-logic.test.js 2>&1 | tail -6`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/checklist-logic.js frontend/checklist-logic.test.js
git commit -m "R110 — checklist: buildExport version 2 con token/rev/entrega/logo/negocio desde meta"
```

---

### Task 3: `buildExport` deriva `grabaciones[]` del estado y de los rangos manuales

**Files:**
- Modify: `frontend/checklist-logic.js` (dentro de buildExport, antes de armar `out`)
- Test: `frontend/checklist-logic.test.js`

Regla: una fila por cámara. Para cámaras con tomas en `state.mediaFiles`: agrupar por `cameraId` (TODOS los `kind`: take, discard, omitted), ordenar por `fileCounter`, tomar primer y último `fileToken` y el conteo. Para cámaras en `state.rangosManuales` que NO tengan tomas logueadas: usar `{ primer, ultimo }` con `conteo: null`. La etiqueta `camara` sale de `state.cameras`; si no está, usar el id.

- [ ] **Step 1: Escribir la prueba que falla**

```javascript
test('buildExport deriva grabaciones de mediaFiles agrupando por camara, todos los kind', () => {
  const state = logic.normalizeChecklistData({
    version: 3, espacios: [],
    mediaFiles: [
      { id: 'a', cameraId: 'sony-main', fileToken: 'C0048', fileCounter: 48, kind: 'discard' },
      { id: 'b', cameraId: 'sony-main', fileToken: 'C0012', fileCounter: 12, kind: 'take' },
      { id: 'c', cameraId: 'sony-main', fileToken: 'C0030', fileCounter: 30, kind: 'omitted' },
    ],
  });
  const out = logic.buildExport(state, { folio: 'F', nombreCliente: 'C' });
  const g = out.grabaciones.find((x) => x.camaraId === 'sony-main');
  assert.equal(g.primerArchivo, 'C0012');
  assert.equal(g.ultimoArchivo, 'C0048');
  assert.equal(g.conteo, 3);
});

test('buildExport incluye rangos manuales para camaras sin tomas logueadas', () => {
  const state = logic.normalizeChecklistData({
    version: 3, espacios: [], mediaFiles: [],
    rangosManuales: { 'foto-sony': { primer: 'DSC00101', ultimo: 'DSC00260' } },
  });
  const out = logic.buildExport(state, { folio: 'F', nombreCliente: 'C' });
  const g = out.grabaciones.find((x) => x.camaraId === 'foto-sony');
  assert.equal(g.primerArchivo, 'DSC00101');
  assert.equal(g.ultimoArchivo, 'DSC00260');
  assert.equal(g.conteo, null);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test frontend/checklist-logic.test.js 2>&1 | tail -6`
Esperado: FALLA (out.grabaciones undefined).

- [ ] **Step 3: Implementar el mínimo**

En `buildExport`, justo antes de construir `out`, agregar:

```javascript
    // grabaciones[]: rango de archivos por camara para acotar el emparejado en la app.
    // Cubre TODOS los kind (take/discard/omitted). Las camaras de foto/360 no se loguean
    // toma por toma; sus rangos vienen de state.rangosManuales (entrada manual).
    const porCamara = new Map();
    (state.mediaFiles || []).forEach((f) => {
      if (!f || !f.cameraId) return;
      if (!porCamara.has(f.cameraId)) porCamara.set(f.cameraId, []);
      porCamara.get(f.cameraId).push(f);
    });
    const grabaciones = [];
    porCamara.forEach((files, cameraId) => {
      const cam = camById(cameraId);
      const ordenados = files.slice().sort((a, b) => (a.fileCounter || 0) - (b.fileCounter || 0));
      grabaciones.push({
        camaraId: cameraId,
        camara: cam.label || cameraId,
        primerArchivo: ordenados[0].fileToken || null,
        ultimoArchivo: ordenados[ordenados.length - 1].fileToken || null,
        conteo: ordenados.length,
      });
    });
    Object.keys(state.rangosManuales || {}).forEach((cameraId) => {
      if (porCamara.has(cameraId)) return; // ya cubierta por tomas logueadas
      const r = state.rangosManuales[cameraId] || {};
      if (!r.primer && !r.ultimo) return;
      const cam = camById(cameraId);
      grabaciones.push({
        camaraId: cameraId,
        camara: cam.label || cameraId,
        primerArchivo: r.primer || null,
        ultimoArchivo: r.ultimo || null,
        conteo: null,
      });
    });
```

Y agregar `grabaciones` al objeto `out` (después de `guionEdicion`):

```javascript
      guionEdicion,
      grabaciones,
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test frontend/checklist-logic.test.js 2>&1 | tail -6`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/checklist-logic.js frontend/checklist-logic.test.js
git commit -m "R111 — checklist: buildExport deriva grabaciones[] (mediaFiles + rangos manuales)"
```

---

### Task 4: `checklist.html` trae entrega/logo/negocio desde `obtenerContrato` y enriquece `meta`

**Files:**
- Modify: `frontend/checklist.html` (helper nuevo + llamada en `cargar()` línea 1505-1530)

No hay prueba unitaria (es glue con la red y la DB); se verifica con un export real en la Task 7. El helper degrada en silencio si falla.

- [ ] **Step 1: Agregar el helper de ensamblado**

Antes de `async function cargar()` (línea 1505), agregar:

```javascript
// Trae los datos de negocio del contrato (carpeta de entregables, logos, paquete) y deja
// meta.entrega/meta.logo/meta.negocio listos. La app NUNCA toca la DB; este fetch es el unico
// puente y vive aqui, en checklist.html (que si esta conectado). Degrada en silencio: si no
// hay red o el token es invalido, meta se queda sin esos bloques y el export sale igual.
async function enriquecerMetaDesdeContrato() {
  if (!TOKEN) return;
  try {
    const data = await apiGet({ action: 'obtenerContrato' });
    if (!data || data.error) return;
    const prop = (data.propiedades && data.propiedades[0]) || {};

    // entrega: solo si ya existe carpeta (se crea al firmar). Sin firmar -> se omite.
    const carpetaId = prop.carpeta_entregables_id || '';
    if (carpetaId || data.carpetaEntregablesUrl) {
      meta.entrega = {
        carpetaEntregablesId: carpetaId || null,
        carpetaEntregablesUrl: data.carpetaEntregablesUrl || (carpetaId ? 'https://drive.google.com/drive/folders/' + carpetaId : null),
        carpetaControlId: prop.carpeta_control_id || null,
      };
    }

    // logo: preferir logos_json (ids confiables); si no, sacar el id de logo_url con regex.
    let todos = [];
    if (prop.logos_json) {
      try {
        const parsed = JSON.parse(prop.logos_json);
        if (Array.isArray(parsed)) {
          todos = parsed.map((l) => ({
            id: l.id || l.fileId || extraerIdDrive(l.url || ''),
            nombre: l.nombre || l.name || 'logo',
          })).filter((l) => l.id);
        }
      } catch (_) { /* ignora json malformado */ }
    }
    if (!todos.length && prop.logo_url) {
      const id = extraerIdDrive(prop.logo_url);
      if (id) todos = [{ id, nombre: 'logo' }];
    }
    if (todos.length) {
      meta.logo = {
        url: 'https://drive.google.com/uc?export=download&id=' + todos[0].id,
        todos,
      };
    }

    // negocio: texto guia (no se parsea), el paquete ya viene con nombre.
    if (prop.paquete || prop.entregables) {
      meta.negocio = {
        paquete: prop.paquete || '',
        entregablesTexto: prop.entregables || '',
      };
    }
  } catch (_) { /* sin red / token invalido: el export sale sin estos bloques */ }
}

// Extrae el FILE_ID de una URL de Drive (formatos /d/<id> o ?id=<id>).
function extraerIdDrive(url) {
  const m = String(url || '').match(/\/d\/([^/?&]+)/) || String(url || '').match(/[?&]id=([^&]+)/);
  return m ? m[1] : '';
}
```

- [ ] **Step 2: Llamar al helper en `cargar()`**

En `cargar()`, justo después de `meta = { folio: data.folio || '', nombreCliente: data.nombreCliente || '' };` (línea 1509), agregar:

```javascript
    await enriquecerMetaDesdeContrato();
```

- [ ] **Step 3: Verificar que no rompe el arranque (lint manual)**

Run: `node -e "require('fs').readFileSync('frontend/checklist.html','utf8'); console.log('html legible')"`
Verificar a ojo que el bloque quedó dentro de `<script>` y que `apiGet` admite `{ action: 'obtenerContrato' }` (usa el mismo TOKEN; ya lo agrega `apiGet`).

- [ ] **Step 4: Commit**

```bash
git add frontend/checklist.html
git commit -m "R112 — checklist.html: fetch a obtenerContrato enriquece meta (entrega/logo/negocio) con degradacion"
```

---

### Task 5: `exportarBitacora` inyecta `token` y `rev` en el export

**Files:**
- Modify: `frontend/checklist.html:5437` (exportarBitacora) y `:5453` (imprimirGuionEdicion no requiere cambio)

- [ ] **Step 1: Fijar token/rev antes de `buildExport`**

En `exportarBitacora()`, reemplazar la primera línea:

```javascript
function exportarBitacora() {
  meta.token = TOKEN;
  meta.rev = currentRev;
  const data = logic.buildExport(state, meta);
```

- [ ] **Step 2: Verificar legible**

Run: `node -e "require('fs').readFileSync('frontend/checklist.html','utf8'); console.log('ok')"`
Esperado: `ok`.

- [ ] **Step 3: Commit**

```bash
git add frontend/checklist.html
git commit -m "R113 — checklist.html: exportarBitacora inyecta token y rev vigente en el export"
```

---

### Task 6: Panel "Rangos de archivo" para foto y 360 (entrada manual)

**Files:**
- Modify: `frontend/checklist.html` (vista de edición, `renderEditView`, y un setter)

El panel muestra una fila por cada dispositivo de foto/360 con su servicio activo. CORRECCIÓN tras revisar el código: foto y 360 NO son cámaras en `state.cameras` (CAMERA_DEFAULTS solo tiene video/drone/asesor); son servicios (`state.servicios.foto`, `state.servicios.t360`). Por eso el catálogo es fijo (los tres del spec: Fotos Sony, Insta360, Drone 360), condicionado por los servicios activos. Los ids del catálogo son el contrato con la app consumidora. Cada fila: dos `input` de texto, "primer archivo" y "último archivo". Al cambiar, escribe `state.rangosManuales[id] = { primer, ultimo }` y llama `scheduleSave()` (pasa por el candado por `rev`). Son opcionales. El panel va dentro de `renderExportBar()` (línea 5415) para verse en las dos vistas de edición (`renderEditView` y `renderMediaEditView`).

- [ ] **Step 1: Agregar el setter**

Cerca de los otros helpers de la vista de edición, agregar:

```javascript
function setRangoManual(cameraId, campo, valor) {
  if (!state.rangosManuales) state.rangosManuales = {};
  const actual = state.rangosManuales[cameraId] || { primer: '', ultimo: '' };
  actual[campo] = valor.trim();
  if (!actual.primer && !actual.ultimo) {
    delete state.rangosManuales[cameraId];
  } else {
    state.rangosManuales[cameraId] = actual;
  }
  scheduleSave();
}

// Dispositivos de rango manual: foto y 360 (servicios, no camaras de state.cameras).
// Catalogo fijo condicionado por servicios activos. Los ids son el contrato con la app.
function camarasRangoManual() {
  const cat = [];
  const svc = state.servicios || {};
  if (svc.foto) cat.push({ id: 'foto-sony', label: 'Fotos Sony' });
  if (svc.t360) cat.push({ id: 'insta360', label: 'Insta360' });
  if (svc.t360 && svc.drone) cat.push({ id: 'drone-360', label: 'Drone 360' });
  return cat;
}
```

- [ ] **Step 2: Renderizar el panel dentro de `renderExportBar()`**

Agregar un helper de render y enchufarlo al final del template de `renderExportBar()` (después de `${renderDictadoBar()}`):

```javascript
function renderRangosManuales() {
  const cams = camarasRangoManual();
  if (!cams.length) return '';
  return `<div class="rangos-bar">
    <div class="rangos-copy"><strong>Rangos de archivo (foto y 360)</strong><span>Opcional. Primer y último archivo de cada dispositivo que no se registra toma por toma.</span></div>
    ${cams.map((c) => {
      const r = (state.rangosManuales || {})[c.id] || {};
      return `<div class="rango-fila">
        <span class="rango-cam">${esc(c.label || c.id)}</span>
        <input type="text" class="rango-input" placeholder="primer archivo" value="${esc(r.primer || '')}"
          onchange="setRangoManual('${c.id}', 'primer', this.value)">
        <input type="text" class="rango-input" placeholder="último archivo" value="${esc(r.ultimo || '')}"
          onchange="setRangoManual('${c.id}', 'ultimo', this.value)">
      </div>`;
    }).join('')}
  </div>`;
}
```

Y en `renderExportBar()` cambiar la última línea del template de `${renderDictadoBar()}`;\` a:

```javascript
  ${renderDictadoBar()}
  ${renderRangosManuales()}`;
```

- [ ] **Step 3: Verificar legible y que `esc` existe**

Run: `node -e "const s=require('fs').readFileSync('frontend/checklist.html','utf8'); console.log(/function esc\\(/.test(s)?'esc ok':'FALTA esc')"`
Esperado: `esc ok` (si falta, usar el helper de escape vigente de la vista de edición).

- [ ] **Step 4: Commit**

```bash
git add frontend/checklist.html
git commit -m "R114 — checklist.html: panel Rangos de archivo (foto/360) escribe state.rangosManuales"
```

---

### Task 7: Gate completo y verificación de export real (la cierra Bruno)

**Files:** ninguno (verificación).

- [ ] **Step 1: Suite verde**

Run: `node --test frontend/checklist-logic.test.js 2>&1 | tail -8`
Esperado: `pass` = 275 + nuevas, `fail 0`.

- [ ] **Step 2: Auditoría de bugs del diff**

Despachar `feature-dev:code-reviewer` (devuelve reporte inline) sobre el diff de las tareas 1-6, o `/code-review` en nivel alto. Corregir hallazgos reales (correctitud, fugas, casos límite); ignorar nitpicks. Volver a correr la suite y commitear las correcciones.

- [ ] **Step 3: Verificación que solo Bruno puede hacer (NO empujar antes)**

Anotar para Bruno:
1. Abrir checklist.html con un `token` real de un folio FIRMADO (con carpeta de entregables y logo).
2. Exportar y abrir el JSON: confirmar `version: 2`, `token`, `rev`, `entrega` (con URL de carpeta), `logo.url` (descarga directa que funciona), `negocio`, y `grabaciones[]` con primer/último por cámara.
3. Probar un token de folio SIN firmar: el export sale sin `entrega`, sin romper.
4. Anotar primer/último de foto y 360 en el panel; reexportar y confirmar que aparecen en `grabaciones[]` con `conteo: null`.
5. Editar en dos pestañas a la vez (concurrencia): confirmar que los rangos manuales no se pisan (candado por `rev` + fusión por cámara).

- [ ] **Step 4: Empujar SOLO cuando Bruno lo verifique y lo pida**

```bash
git push origin main   # dispara el deploy; ejecutar únicamente tras el visto bueno de Bruno
```

---

## Auto-revisión del plan (contra el spec)

1. **Cobertura del spec:**
   - Fetch a `obtenerContrato` con try/catch que degrada → Task 4 (helper) ✓
   - `version: 2` + `token` + `rev` → Task 2 ✓; inyección de TOKEN/currentRev → Task 5 ✓
   - `entrega`/`logo`/`negocio` (omitir el que no tenga dato; sin firmar omite entrega) → Task 4 (ensamblado, omite entrega si no hay carpeta) + Task 2 (passthrough con omisión) ✓
   - Logo desde `logos_json` preferido, regex de respaldo desde `logo_url` → Task 4 ✓
   - `grabaciones[]` cubre TODOS los kind y usa rangos manuales → Task 3 ✓
   - Panel "Rangos de archivo" en `state.rangosManuales`, dentro del candado por `rev` → Task 6 + Task 1 (persistencia/fusión) ✓
   - No cambiar formato de `archivos[]`; campos nuevos aditivos → Task 2 conserva `archivos` ✓
   - Worker sin cambios → confirmado en el encabezado ✓
2. **Sin placeholders:** cada paso de código trae el código real. ✓
3. **Consistencia de tipos:** `rangosManuales` siempre `{ [cameraId]: { primer, ultimo } }` en default, normalize, merge, setter, panel y buildExport. `meta.entrega/logo/negocio` con la misma forma en helper (Task 4), passthrough (Task 2) y prueba. ✓

**Brechas conocidas que se dejan conscientes:** la etiqueta exacta de las cámaras de foto/360 y sus `mode` reales deben confirmarse contra `CAMERA_DEFAULTS` al ejecutar la Task 6 (la lista de ids/modes es un punto de ajuste, no una invención de reglas nuevas). El ensamblado de `logos_json` asume un arreglo de objetos con `id`/`url`; si el formato real difiere, ajustar el `map` en Task 4 al verlo en un contrato real.
