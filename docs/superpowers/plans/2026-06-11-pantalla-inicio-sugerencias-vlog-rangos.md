# Pantalla de inicio, sugerencias de nombre, vlog y rangos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Que el checklist configure el trabajo desde una pantalla de inicio y registre mejor lo grabado (sugerencias de nombre por cámara, marca de vlog, rangos a mano), y que la app de bajar material lea la marca de vlog — sin romper compatibilidad del JSON.

**Architecture:** La lógica pura nueva vive en `frontend/checklist-logic.js` (testeable con `node --test`); la UI vive en `frontend/checklist.html`. El JSON sube de contenido pero NO de versión (sigue `version: 2`, campo aditivo). La app (`iav-metadata-app`) lee el campo nuevo. Toda UI nueva reusa las variables CSS y fuentes existentes del checklist.

**Tech Stack:** HTML/JS vanilla (checklist), `node --test` (lógica del checklist); Electron + React + Vitest (app). Repos: `contratos-iav-v4` (rama `main`, push despliega a producción) e `iav-metadata-app` (rama de trabajo → merge local a `master`).

**Spec:** `docs/superpowers/specs/2026-06-11-sugerencias-vlog-rangos-design.md`

---

## Mapa de archivos

`contratos-iav-v4`:
- `frontend/checklist-logic.js` — NUEVO: `sugerirNombreArchivo(camera, folio)` (formato por cámara); MOD: `buildExport` (emite `vlogOsmoAction`), `setServiceActive`/estado (`vlogOsmoAction`).
- `frontend/checklist-logic.test.js` — MOD: tests de las funciones puras nuevas.
- `frontend/checklist.html` — MOD: `sugerenciaNombre` (delega en la función pura), `camarasRangoManual` (incluir video/drone), pantalla de inicio (nueva vista + switch de vlog), enganche en el render principal.

`iav-metadata-app`:
- `src/engine/types.ts` — MOD: `Bitacora.vlogOsmoAction?: boolean`.
- `src/renderer/...` (vista de trabajo / inventario) — MOD: mostrar el aviso + ítem de inventario.
- `test/...` — MOD: test de lectura del campo.

---

## Fase 1 — Sugerencias de nombre por cámara (lógica pura + UI)

### Task 1: `sugerirNombreArchivo` en checklist-logic.js (función pura)

**Files:**
- Modify: `frontend/checklist-logic.js` (añadir función + exportarla en el `return {...}`)
- Test: `frontend/checklist-logic.test.js`

- [ ] **Step 1: Escribir el test que falla**

Añadir a `frontend/checklist-logic.test.js` (usa `node:test` y `node:assert`, como el resto del archivo — verificar el estilo de los tests existentes y seguirlo):

```js
const { test } = require('node:test');
const assert = require('node:assert');
const logic = require('./checklist-logic.js');

test('sugerirNombreArchivo: sony usa fecha del folio + prefijo del ejemplo + 0001', () => {
  const cam = { kind: 'sony', counterExample: 'PIB2818' };
  assert.strictEqual(logic.sugerirNombreArchivo(cam, 'IAV-2606.11-A'), '20260611_PIB0001');
});

test('sugerirNombreArchivo: dji deja hueco para la hora y sufijo _D', () => {
  const cam = { kind: 'dji' };
  assert.strictEqual(logic.sugerirNombreArchivo(cam, 'IAV-2606.11-A'), 'DJI_20260611______0001_D');
});

test('sugerirNombreArchivo: tascam usa año de 2 digitos sin prefijo', () => {
  const cam = { kind: 'tascam' };
  assert.strictEqual(logic.sugerirNombreArchivo(cam, 'IAV-2606.11-A'), '260611_0001');
});

test('sugerirNombreArchivo: insta360 deja hueco de hora, _00_ y 3 digitos', () => {
  const cam = { kind: 'insta360' };
  assert.strictEqual(logic.sugerirNombreArchivo(cam, 'IAV-2606.11-A'), 'IMG_20260611______00_001');
});

test('sugerirNombreArchivo: sin formato conocido devuelve cadena vacia', () => {
  assert.strictEqual(logic.sugerirNombreArchivo({ kind: 'otra' }, 'IAV-2606.11-A'), '');
});

test('sugerirNombreArchivo: folio que no parsea cae a fecha vacia pero no truena', () => {
  assert.strictEqual(logic.sugerirNombreArchivo({ kind: 'sony', counterExample: 'PIB1' }, ''), '');
});
```

> Nota: el último caso define que sin fecha válida del folio, sony devuelve '' (no inventa fecha de hoy en la función pura; la fecha de hoy como respaldo se decide en la capa de UME, ver Task 3). Ajustar la aserción si en Step 3 se decide otro contrato, pero mantener "no truena".

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test frontend/checklist-logic.test.js`
Expected: FAIL (`sugerirNombreArchivo is not a function`).

- [ ] **Step 3: Implementar la función pura**

En `frontend/checklist-logic.js`, dentro del IIFE (junto a otras funciones puras), añadir:

```js
// Sugerencia del primer nombre de archivo por camara. Parte predecible lista; la hora (que solo
// conoce la camara) queda como hueco visible "______". Numero arranca en 0001. La fecha sale del
// folio (SISTEMA-YYMM.DD-X). Formatos reales: ver docs estructuras-tarjetas.
function fechaDesdeFolio(folio) {
  const m = String(folio || '').match(/-(\d{2})(\d{2})\.(\d{2})-/);
  if (!m) return null;
  return { yy: m[1], yyyy: '20' + m[1], mm: m[2], dd: m[3] };
}
function prefijoDesdeEjemplo(ej) {
  const m = String(ej || '').match(/([A-Za-z]+)\d+\s*$/);
  return (m && m[1]) || 'PIB';
}
function sugerirNombreArchivo(camera, folio) {
  if (!camera) return '';
  const f = fechaDesdeFolio(folio);
  const ymd = f ? (f.yyyy + f.mm + f.dd) : '';
  switch (camera.kind) {
    case 'sony':
      return ymd ? (ymd + '_' + prefijoDesdeEjemplo(camera.counterExample) + '0001') : '';
    case 'dji':
      return ymd ? ('DJI_' + ymd + '______0001_D') : '';
    case 'insta360':
      return ymd ? ('IMG_' + ymd + '______00_001') : '';
    case 'tascam':
      return f ? (f.yy + f.mm + f.dd + '_0001') : '';
    default:
      return '';
  }
}
```

Y en el objeto `return { ... }` del módulo, añadir `sugerirNombreArchivo,`.

- [ ] **Step 4: Correr y ver pasar**

Run: `node --test frontend/checklist-logic.test.js`
Expected: PASS (6 nuevos + los existentes verdes).

- [ ] **Step 5: Commit**

```bash
git add frontend/checklist-logic.js frontend/checklist-logic.test.js
git commit -m "feat(checklist): sugirNombreArchivo — formato real por camara (logica pura)"
```

### Task 2: `sugerenciaNombre` (UI) delega en la función pura

**Files:**
- Modify: `frontend/checklist.html` (función `sugerenciaNombre`, ~línea 5083)

- [ ] **Step 1: Reemplazar el cuerpo de `sugerenciaNombre`**

Hoy solo maneja sony. Reemplazar por delegación a la lógica pura, conservando el respaldo a hoy SOLO para sony (cuando no hay folio aún):

```js
function sugerenciaNombre(camera, fecha) {
  if (!camera) return '';
  const folio = meta && meta.folio;
  const base = logic.sugerirNombreArchivo(camera, folio);
  if (base) return base;
  // Respaldo: sony sin folio valido usa la fecha de hoy (comportamiento previo).
  if (camera.kind === 'sony') {
    const d = fecha instanceof Date ? fecha : new Date();
    const ymd = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    return ymd + '_' + prefijoSony(camera) + String(1).padStart(SONY_DIGITOS, '0');
  }
  return '';
}
```

> `sugerenciaNombre` ya se llama en los dos campos de captura (líneas ~2902 y ~5040) como `value="${sugerenciaNombre(camera)}"`; no hay que tocar esos llamados. Los `placeholder` de esas líneas ya muestran ejemplos por kind — verificarlos y, si hace falta, alinearlos con los nuevos formatos (insta360 incluido).

- [ ] **Step 2: Verificación visual (no hay test automático de UI aquí)**

Run: abrir `frontend/checklist.html` en el navegador con un folio de prueba (`?token=...`), iniciar secuencia en cada tipo de cámara y confirmar que el nombre sugerido sale con el formato correcto y el hueco de hora donde aplica.
Expected: Sony `20260611_PIB0001`; DJI `DJI_20260611______0001_D`; audio `260611_0001`.

- [ ] **Step 3: Commit**

```bash
git add frontend/checklist.html
git commit -m "feat(checklist): sugerencia de nombre por camara en la captura (UI)"
```

---

## Fase 2 — Marca de vlog en el estado y el JSON (lógica pura)

### Task 3: `vlogOsmoAction` en estado inicial + `setVlogOsmoAction` + buildExport

**Files:**
- Modify: `frontend/checklist-logic.js` (estado inicial ~2525, normalización ~2936, `buildExport` ~4017, nueva acción)
- Test: `frontend/checklist-logic.test.js`

- [ ] **Step 1: Escribir el test que falla**

```js
test('buildExport emite vlogOsmoAction false por defecto', () => {
  const state = logic.createInitialState ? logic.createInitialState() : null;
  // Si no hay helper de estado inicial, construir uno minimo valido para buildExport:
  const s = state || { mediaFiles: [], espacios: [], cameras: [], sequenceSegments: [], servicios: {}, rangosManuales: {}, guide: {} };
  const out = logic.buildExport(s, { folio: 'IAV-2606.11-A' });
  assert.strictEqual(out.vlogOsmoAction, false);
  assert.strictEqual(out.version, 2); // no se sube la version
});

test('buildExport refleja vlogOsmoAction true del estado', () => {
  const s = { mediaFiles: [], espacios: [], cameras: [], sequenceSegments: [], servicios: {}, rangosManuales: {}, guide: {}, vlogOsmoAction: true };
  const out = logic.buildExport(s, { folio: 'IAV-2606.11-A' });
  assert.strictEqual(out.vlogOsmoAction, true);
});

test('setVlogOsmoAction cambia el flag sin mutar el original', () => {
  const s = { vlogOsmoAction: false };
  const next = logic.setVlogOsmoAction(s, true);
  assert.strictEqual(next.vlogOsmoAction, true);
  assert.strictEqual(s.vlogOsmoAction, false);
});
```

> Verificar el nombre real del helper de estado inicial (en el código hay `clone(SERVICES_DEFAULT)` dentro de la construcción del estado ~2525). Si existe un creador de estado exportado, usarlo en el test; si no, el objeto mínimo de arriba basta para `buildExport`.

- [ ] **Step 2: Correr y ver fallar**

Run: `node --test frontend/checklist-logic.test.js`
Expected: FAIL (`setVlogOsmoAction is not a function` y/o `out.vlogOsmoAction` undefined).

- [ ] **Step 3: Implementar**

1. En el estado inicial (~línea 2525, junto a `servicios: clone(SERVICES_DEFAULT)`), añadir: `vlogOsmoAction: false,`.
2. En la normalización (~2936, junto a `normalized.servicios = ...`), añadir:
   `normalized.vlogOsmoAction = normalized.vlogOsmoAction === true;`
3. En `buildExport`, en el objeto `out` (~4017, junto a `token`/`rev`), añadir:
   `vlogOsmoAction: state.vlogOsmoAction === true,`
4. Añadir la acción pura y exportarla en el `return {...}`:

```js
function setVlogOsmoAction(state, value) {
  return Object.assign({}, state, { vlogOsmoAction: value === true });
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `node --test frontend/checklist-logic.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/checklist-logic.js frontend/checklist-logic.test.js
git commit -m "feat(checklist): vlogOsmoAction en estado y JSON (aditivo, version 2)"
```

---

## Fase 3 — Rango a mano para video y drone (UI)

### Task 4: Incluir video y drone en el apartado de rangos manuales

**Files:**
- Modify: `frontend/checklist.html` (`camarasRangoManual`, ~línea 5461; copy de `renderRangosManuales`, ~5482)

- [ ] **Step 1: Verificar el estado actual (no asumir)**

Leer `camarasRangoManual()` (~5461) y `renderRangosManuales()` (~5482). Confirmar qué servicios incluye hoy (foto y 360) y que el apartado se renderiza y es visible. Anotar el hallazgo en el commit.

- [ ] **Step 2: Extender `camarasRangoManual` a video y drone**

Hoy el catálogo se condiciona por servicios activos para foto y 360. Añadir video y drone al catálogo (con sus ids reales, que son el contrato con la app — verificar los ids en el código antes de escribirlos). El copy debe aclarar que para video/drone es una **red de seguridad**: solo se usa si no se registraron tomas en vivo (la precedencia ya existe en `buildExport`: tomas con token mandan).

- [ ] **Step 3: Verificación visual**

Run: abrir el checklist con video y drone activos y confirmar que aparecen los campos "primer / último archivo" para video y drone, con el copy de red de seguridad. Registrar una toma en vivo y confirmar que esa manda sobre el rango a mano (revisar el JSON exportado: `grabaciones[]`).
Expected: campos visibles; el rango a mano no pisa las tomas registradas.

- [ ] **Step 4: Commit**

```bash
git add frontend/checklist.html
git commit -m "feat(checklist): rango a mano tambien para video y drone (red de seguridad)"
```

---

## Fase 4 — Pantalla de inicio del trabajo (UI grande)

### Task 5: Verificar roles actuales y bandera de configuración

**Files:**
- Read/Modify: `frontend/checklist.html` (`ROLE_DEF`, `ROLE_ORDER`, `roleReady`, `renderRoleSelect` ~1714, render principal ~1640)
- Modify: `frontend/checklist-logic.js` (estado: `configurado`)

- [ ] **Step 1: Verificar (no asumir) los roles existentes**

Leer `ROLE_DEF`/`ROLE_ORDER`. El spec define roles **Video, Fotografía, 360** (drone dentro de Video; asesor NO es rol). Si los roles actuales difieren, anotar y ajustar `ROLE_DEF`/`ROLE_ORDER` a esos tres en un commit aparte, conservando compatibilidad de estados viejos.

- [ ] **Step 2: Añadir bandera `configurado` al estado**

En `checklist-logic.js`: estado inicial `configurado: false`; normalización `normalized.configurado = normalized.configurado === true;`. Acción `setConfigurado(state, true)` exportada. (Tests en `checklist-logic.test.js`: por defecto false; `setConfigurado` lo pone true sin mutar.)

- [ ] **Step 3: Commit**

```bash
git add frontend/checklist-logic.js frontend/checklist-logic.test.js
git commit -m "feat(checklist): bandera configurado en el estado (logica pura, con tests)"
```

### Task 6: Vista `renderInicio` y enganche en el render principal

**Files:**
- Modify: `frontend/checklist.html` (nueva `renderInicio()`; enganche en el render principal ~1640; reusar `setServiceActive`, `toggleServicio`, `state.guide.tipoPropiedad`, `setVlogOsmoAction`)

- [ ] **Step 1: Escribir `renderInicio()`**

Crear `renderInicio()` siguiendo la estructura aprobada (Opción A) y **reusando exactamente las clases y variables CSS existentes** (`--ink-1/2/3`, `--gold`, `--gold-soft`, `--card`, `--line`, `--font-display`, `--font-mono`, `.role-opt`, `.btn`, `.primary`, `.label`, `.action-stack`, etc.). Secciones:
  1. Saludo + folio (`meta.folio`) + cliente/fecha (`meta.nombreCliente`).
  2. "¿Quién eres?" — reusar el patrón de `renderRoleSelect`/`ROLE_ORDER` (Video, Fotografía, 360). `onclick="setRole('...')"`.
  3. Enlace "Saltar configuración y entrar" → `onclick="setConfiguradoYEntrar()"` (marca `configurado` solo-lectura local sin tocar config y entra a la vista de captura).
  4. Bloque configurable:
     - Tipo de propiedad → botones que setean `state.guide.tipoPropiedad` (reusar el control existente de la config guía; verificar su setter real).
     - Servicios → un toggle por servicio reusando `toggleServicio(key)` y `SERVICE_UI` (Video, Foto, 360, Drone, Asesor).
     - Switch "¿Estás grabando con tu Osmo Action?" → `onclick` que llama `state = logic.setVlogOsmoAction(state, !state.vlogOsmoAction); render(); scheduleSave();`.
  5. Botón "Empezar" → marca `configurado` (`state = logic.setConfigurado(state, true)`) y entra a la captura.

> No introducir colores ni fuentes nuevos. Todos los valores visuales salen de las variables/clases existentes.

- [ ] **Step 2: Enganchar en el render principal**

En el flujo de render (~1640, donde hoy `if (!roleReady()) return renderRoleSelect()`), cambiar a: mostrar `renderInicio()` cuando el trabajo **no** está `configurado` (en este dispositivo/estado); si ya está `configurado`, comportamiento actual (rol directo / landing) con acceso para **reabrir** la pantalla de inicio (p. ej. una opción "Configurar trabajo" en `abrirCambiarRol`, junto a "Armar cuartos"). La pantalla NO obliga: el enlace "Saltar" siempre permite entrar.

- [ ] **Step 3: Verificación visual (criterio de aceptación de Bruno)**

Run: abrir el checklist en un trabajo nuevo. Confirmar: (1) sale la pantalla de inicio con folio y los 3 roles; (2) se puede elegir tipo de propiedad y prender/apagar servicios, y apagar uno lo quita del checklist; (3) el switch de Osmo Action queda marcado y, al exportar, el JSON trae `vlogOsmoAction: true`; (4) "Saltar" entra sin configurar; (5) **colores y tipografía idénticos al resto del checklist**; (6) reabrir la configuración funciona.
Expected: todo lo anterior; aspecto indistinguible del resto del checklist.

- [ ] **Step 4: Commit**

```bash
git add frontend/checklist.html
git commit -m "feat(checklist): pantalla de inicio del trabajo (rol + tipo + servicios + vlog)"
```

---

## Fase 5 — La app lee y muestra la marca de vlog (iav-metadata-app)

> Repo `iav-metadata-app`, rama de trabajo. Gate: `npx tsc --noEmit && npx vitest run`.

### Task 7: Tipo `Bitacora.vlogOsmoAction`

**Files:**
- Modify: `iav-metadata-app/src/engine/types.ts` (interfaz `Bitacora`)
- Test: `iav-metadata-app/test/jsonLoader.test.ts`

- [ ] **Step 1: Test que falla**

En `test/jsonLoader.test.ts`, añadir un caso: cargar un JSON (version 2) que incluye `vlogOsmoAction: true` y un `archivos: []`, y afirmar que `loadBitacora` conserva `bitacora.vlogOsmoAction === true`. (Seguir el estilo de los tests existentes del archivo: imports desde `'vitest'`, fixtures temporales.)

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run test/jsonLoader.test.ts`
Expected: FAIL de tipos (propiedad inexistente) o aserción.

- [ ] **Step 3: Implementar**

En `src/engine/types.ts`, en la interfaz `Bitacora`, añadir (aditivo, opcional):
```ts
  vlogOsmoAction?: boolean; // el trabajo incluye vlog personal de Osmo Action (no es material del cliente)
```
`loadBitacora` ya hace `return data as Bitacora`, así que conserva el campo; no requiere otro cambio.

- [ ] **Step 4: Correr y ver pasar**

Run: `npx tsc --noEmit && npx vitest run test/jsonLoader.test.ts`
Expected: tsc limpio, PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts test/jsonLoader.test.ts
git commit -m "feat(metadatos): leer vlogOsmoAction de la bitacora (aditivo)"
```

### Task 8: Mostrar el aviso + ítem de inventario en la vista del trabajo

**Files:**
- Modify: la vista de trabajo/inventario en `src/renderer/...` (localizar dónde se muestra hoy el material/checklist del trabajo)

- [ ] **Step 1: Localizar (no asumir) dónde se muestra el material del trabajo**

Buscar en `src/renderer` el componente que muestra el inventario de material (las casillas Video/Foto/360 derivadas de la bitácora). Anotar el archivo real.

- [ ] **Step 2: Añadir el aviso y el ítem**

Cuando `bitacora.vlogOsmoAction === true`: mostrar un aviso (banner) "Este trabajo incluye vlog de Osmo Action (personal)" y un ítem en el inventario marcado como personal / se baja a mano. Reusar los componentes/estilos existentes del inventario (no inventar estilo).

- [ ] **Step 3: Verificación**

Run: `npx tsc --noEmit && npx vitest run && npm run build:app`
Expected: verde. Verificación visual en la app real (Bruno): abrir un trabajo cuya bitácora trae `vlogOsmoAction: true` y ver el aviso + el ítem.

- [ ] **Step 4: Commit**

```bash
git add src/renderer
git commit -m "feat(metadatos): mostrar aviso e inventario de vlog Osmo Action"
```

---

## Cierre

- [ ] **Gate checklist (contratos):** `node --test frontend/checklist-logic.test.js` verde + verificación visual de la pantalla de inicio y sugerencias.
- [ ] **Gate app:** `npx tsc --noEmit && npx vitest run && npm run build:app` verde.
- [ ] **Verificación de Bruno (app real / checklist real):** pantalla de inicio (rol, tipo, servicios que se quitan/activan, switch de vlog, saltar, reabrir); sugerencias de nombre por cámara; rango a mano video/drone; el JSON trae `vlogOsmoAction`; la app muestra el aviso + inventario.
- [ ] **Despliegue (lo hace Claude cuando Bruno apruebe):**
  - `contratos-iav-v4`: commit + `git push origin main` (despliega a producción). Recordar: hay commits previos sin empujar (sugerencia de nombre R-previo + docs); confirmar con Bruno qué entra.
  - `iav-metadata-app`: merge local a `master`; push solo si Bruno lo pide.

## Decisiones abiertas resueltas en el plan
- "Trabajo configurado" → bandera `configurado` en el estado (Task 5).
- Insta360 → se soporta como **formato de sugerencia** (Task 1); agregarla como cámara registrable en `CAMERA_DEFAULTS` queda fuera de este plan (no requerido para la sugerencia).
- Lógica de formato → movida a `checklist-logic.js` para poder testearla (Task 1).
