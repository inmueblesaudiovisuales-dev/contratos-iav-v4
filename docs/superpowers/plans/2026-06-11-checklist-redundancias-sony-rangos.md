# Checklist: Sony unificada, redundancias, rangos por número y pulido — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Un subagente por tarea, revisión en dos etapas (spec + calidad). Steps con checkbox (`- [ ]`). Sin checkpoints humanos: la verificación visual la hace el ejecutor manejando el navegador del demo (Playwright headless) y revisando DOM/estado; la verificación cruzada con la app se hace con su dry-run. NO se empuja nada a producción.

**Goal:** Unificar la Sony FX30 a un solo contador, eliminar redundancias de configuración (drone, tipo, asesor), rediseñar la pantalla de inicio (acordeón) y los rangos (por número, solo foto/360), y pulir UI (toast, regreso, voz en off), sin romper la app de metadatos.

**Architecture:** Lógica pura en `frontend/checklist-logic.js` (testeable con `node --test`); UI en `frontend/checklist.html`. JSON sigue `version: 2`. La app de metadatos solo lee `archivos`/`grabaciones`/`cameras`/`vlogOsmoAction`/`folio`/`token`/`nombreCliente`; conservamos `camaraId 'sony-asesor'` y los tokens como nombre real → compatible.

**Tech Stack:** HTML/JS vanilla; `node --test`. App: Electron+React+Vitest (rama `rediseno`).

**Spec:** `docs/superpowers/specs/2026-06-11-checklist-redundancias-sony-rangos-design.md`

**Gates globales:**
- Checklist lógica: `node --test frontend/checklist-logic.test.js` verde.
- App (si se toca): `npx tsc --noEmit && npx vitest run` (+ `npm run build:app` si UI).
- Verificación visual: Playwright headless contra `http://127.0.0.1:8788/checklist.html?demo=1` (levantar `python3 -m http.server 8788` en `frontend/`).
- Verificación cruzada (Fases 1 y 5): exportar una bitácora real del demo y correrla por el dry-run de la app (`npm run dry-run -- <bitacora.json> <carpeta> <sony|dji> <camaraId>`).
- Commits descriptivos por tarea, SIN push.

---

## Fase 1 — Sony FX30 = una sola cámara (compartir secuencia)

> Riesgo alto. El contador vive en `sequenceSegments[].counterNext`; la cámara apunta con `activeSegmentId`. Hoy `sony-main` y `sony-asesor` crean segmentos separados. Objetivo: que ambas compartan UN segmento (Forma A), conservando `camaraId 'sony-asesor'` en los registros.

### Task 1.1: Helper puro `fx30CameraIds` + compartir segmento al inicializar

**Files:** Modify `frontend/checklist-logic.js`; Test `frontend/checklist-logic.test.js`.

- [ ] **Step 1: Verificar (no asumir)** la firma real de `initializeCameraSequence` (`~3123`), `getCameraSequence` (`~3113`), `getCamera`, y cómo `aplicarSecuencia` (en checklist.html `~5227`) la llama para `sony-asesor`. Confirmar que `camera.activeSegmentId` es el enlace al segmento.

- [ ] **Step 2: Test que falla.** Añadir a `checklist-logic.test.js`:

```js
test('FX30: iniciar sony-asesor reusa el segmento de sony-main si ya existe (un solo contador)', () => {
  let s = logic.createDefaultState();
  // Inicia la FX30 en video (sony-main) con un nombre real:
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: '20260611_PIB0010.MP4', archivoActual: true });
  const segMain = logic.getCameraSequence(s, 'sony-main').segment;
  // Inicia la "asesor" de la MISMA FX30: debe reusar el mismo segmento, no crear otro.
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-asesor', lastFilename: '20260611_PIB0099.MP4', archivoActual: true });
  const segAsesor = logic.getCameraSequence(s, 'sony-asesor').segment;
  assert.strictEqual(segAsesor.id, segMain.id, 'asesor comparte el segmento de la FX30');
  assert.strictEqual(s.sequenceSegments.length, 1, 'no se crea un segundo segmento para la FX30');
  // El contador NO se re-siembra al reusar (sigue el de sony-main):
  assert.strictEqual(segAsesor.counterNext, segMain.counterNext);
});

test('FX30: si asesor inicia primero, video reusa su segmento', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-asesor', lastFilename: '20260611_PIB0010.MP4', archivoActual: true });
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: '20260611_PIB0050.MP4', archivoActual: true });
  assert.strictEqual(s.sequenceSegments.length, 1);
  assert.strictEqual(logic.getCameraSequence(s, 'sony-main').segment.id, logic.getCameraSequence(s, 'sony-asesor').segment.id);
});
```

- [ ] **Step 3: Correr y ver fallar.** `node --test frontend/checklist-logic.test.js` → FAIL (hoy crea dos segmentos).

- [ ] **Step 4: Implementar.** En `checklist-logic.js`:
  - Añadir `const FX30_IDS = ['sony-main', 'sony-asesor'];` y exportarlo (o un helper `function esFx30(id){ return FX30_IDS.includes(id); }`).
  - En `initializeCameraSequence`, antes de crear un segmento nuevo: si `esFx30(options.cameraId)`, buscar si la OTRA cámara FX30 ya tiene `activeSegmentId` con segmento válido. Si lo tiene, **reusar**: `camera.activeSegmentId = <ese segmento>.id; next.activeCameraByMode[camera.mode] = camera.id; return next;` (sin crear segmento ni re-sembrar). Si no, seguir el flujo normal (crear segmento) — y queda disponible para que la otra lo reuse después.
  - Mantener intacto el resto (no FX30 sin cambios).

- [ ] **Step 5: Correr y ver pasar.** `node --test ...` → PASS (incluye los existentes).

- [ ] **Step 6: Commit.** `git add -A frontend/checklist-logic.js frontend/checklist-logic.test.js && git commit -m "feat(checklist): FX30 comparte una sola secuencia entre sony-main y sony-asesor"`

### Task 1.2: `registerAsesorFile` usa el segmento compartido; token = nombre real

**Files:** Modify `frontend/checklist-logic.js`; Test `frontend/checklist-logic.test.js`.

- [ ] **Step 1: Verificar** `registerAsesorFile` (`~3404-3467`), `pushAsesorCameraFile` (`~3372-3402`) y cómo arma `fileToken` (debe salir de `getCameraSequence(state,'sony-asesor').segment`, que ahora es el compartido). Confirmar que NO se construye desde un contador lógico independiente.

- [ ] **Step 2: Test que falla.** Verifica numeración continua entre una toma de video normal y una de asesor de la misma FX30:

```js
test('FX30: tomas de asesor continúan la numeración del video (mismo contador)', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: '20260611_PIB0010.MP4', archivoActual: true });
  // Avanza el contador de la FX30 (simulando una toma de video) y luego registra asesor.
  s = logic.bumpCameraCounter(s, 'sony-main', 1); // ahora next = 11
  // Asegura la secuencia de la cámara de audio del asesor para que registerAsesorFile no aborte:
  s = logic.initializeCameraSequence(s, { cameraId: 'tascam-asesor', lastFilename: '260611_0001.WAV', archivoActual: true });
  // Crea un punto de asesor y registra:
  s.asesorPuntos = [{ id: 'p1', nombre: 'Punto 1', tipo: 'normal', estado: 'pendiente', ordenLista: 1 }];
  s = logic.registerAsesorFile(s, { puntoId: 'p1' });
  const sonyAsesorFile = s.mediaFiles.find((f) => f.cameraId === 'sony-asesor');
  assert.ok(sonyAsesorFile, 'se creó el mediaFile de asesor con camaraId sony-asesor');
  // El número del token del asesor debe ser 11 (continuo), no 1.
  assert.match(sonyAsesorFile.fileToken, /0011$/);
});
```
> Nota: ajustar el assert al patrón real que produzca `formatFileToken` (verificar en Step 1; mantener la idea: el número es continuo con sony-main, no reinicia).

- [ ] **Step 3: Correr y ver fallar.**

- [ ] **Step 4: Implementar.** Si Task 1.1 ya hace que `getCameraSequence(state,'sony-asesor')` devuelva el segmento compartido, puede bastar con que el flujo de inicio del asesor reuse. Ajustar lo mínimo en `registerAsesorFile`/`pushAsesorCameraFile` para que el token salga del segmento compartido y el `cameraId` siga siendo `'sony-asesor'`. NO cambiar el `pairId` ni la rama de voz en off.

- [ ] **Step 5: Correr y ver pasar.**

- [ ] **Step 6: Commit.** `git commit -m "feat(checklist): registro de asesor usa el contador continuo de la FX30 (token = nombre real)"`

### Task 1.3: UI del asesor reusa la secuencia (no re-pide nombre si la FX30 ya corre)

**Files:** Modify `frontend/checklist.html`.

- [ ] **Step 1: Verificar** `abrirSecuenciaAsesor`/`iniciarSecuenciaAsesor` (`~3024-3045`) y el guard de `registrarAsesor` (`~2894`: `if (!getCameraSequence(...).segment) return abrirSecuenciaAsesor(...)`).
- [ ] **Step 2: Implementar.** Si la FX30 ya tiene segmento (porque se inició en video), al entrar al asesor NO volver a pedir el nombre de la Sony: reusar. El modal de iniciar secuencia solo aparece si la FX30 no se ha sembrado. El ícono "re-iniciar secuencia" (refresh, `~2866`) sigue permitiendo re-sembrar (afecta toda la FX30 — copy: "re-inicia la secuencia de la Sony").
- [ ] **Step 3: Verificación visual (Playwright headless).** Demo como Bruno: iniciar video Sony con un nombre; entrar a sesión de asesor; confirmar que el "siguiente token" del asesor continúa el número del video (no reinicia) y que NO se re-pide el nombre. Registrar un punto y confirmar que el token es continuo.
- [ ] **Step 4: Commit.** `git commit -m "feat(checklist): el asesor reusa la secuencia de la FX30 sin re-sembrar"`

### Task 1.4: Verificación cruzada con la app (dry-run) y export

**Files:** ninguno (verificación).

- [ ] **Step 1:** Confirmar en `buildExport` (`~3845-3907`) que el registro de asesor sale con `camaraId: 'sony-asesor'` y `archivo`/token = nombre real (no contador lógico).
- [ ] **Step 2:** En el demo, generar una bitácora con tomas de video normal + asesor de la misma FX30; exportar el JSON.
- [ ] **Step 3:** Correr el dry-run de la app (`/Users/brunogutierrez/iav-metadata-app`, `npm run dry-run -- <json> <carpeta-prueba> sony sony-asesor`) y confirmar que los registros de asesor se identifican/binean como "Asesor" y los de video como su escena. Si la app NO los identifica bien con UNA sola carpeta (fragilidad de dedupe por path en `premiereService.ts:57,70`), arreglarlo en la app (rama `rediseno`, local, con tests, sin push) y dejarlo documentado.
- [ ] **Step 4: Commit** (si hubo cambios de doc/notas). En la app, commit en `rediseno` si se tocó.

---

## Fase 2 — Una sola bandera de drone (`servicios.drone`)

### Task 2.1: Migración + lectura unificada (lógica, TDD)

**Files:** Modify `frontend/checklist-logic.js`; Test `frontend/checklist-logic.test.js`.

- [ ] **Step 1: Test que falla.**

```js
test('normalize: estado viejo con guide.incluirDrone=true conserva servicios.drone=true', () => {
  const s = logic.normalizeChecklistData({ version: 2, espacios: [], mediaFiles: [], cameras: [], sequenceSegments: [], servicios: { drone: false }, guide: { incluirDrone: true } });
  assert.strictEqual(s.servicios.drone, true);
});
test('normalize: ya no expone guide.incluirDrone', () => {
  const s = logic.normalizeChecklistData({ version: 2, espacios: [], mediaFiles: [], cameras: [], sequenceSegments: [], servicios: { drone: true }, guide: {} });
  assert.strictEqual(s.guide.incluirDrone, undefined);
});
```

- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar.** En `normalizeChecklistData`: antes de quitar el campo, `normalized.servicios.drone = (normalized.servicios.drone === true) || (normalized.guide && normalized.guide.incluirDrone === true);` y luego `delete normalized.guide.incluirDrone;`. Quitar `incluirDrone` de `createDefaultState` (`~2539`) y la lógica de derivación F35 (`~2941-2962`).
- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Commit.** `git commit -m "refactor(checklist): drone unificado a servicios.drone (migra incluirDrone sin perder dato)"`

### Task 2.2: `sesionDroneAplica` lee `servicios.drone`; quitar toggle de Armar cuartos

**Files:** Modify `frontend/checklist.html`.

- [ ] **Step 1:** Cambiar `sesionDroneAplica` (`~1910`) a `return Boolean(state.servicios && state.servicios.drone) && isBruno();` (verificar el guard de rol real).
- [ ] **Step 2:** Quitar `renderDroneToggle`/`toggleIncluirDrone` de `renderSetup` (`~2061-2082`) y su invocación.
- [ ] **Step 3: Verificación visual.** Demo: prender Drone en inicio → aparece tarjeta de sesión de drone; apagarlo → desaparece y la cobertura/dispositivos quedan coherentes. Confirmar que "Armar cuartos" ya no muestra el toggle.
- [ ] **Step 4: Commit.** `git commit -m "feat(checklist): drone se controla solo desde inicio; quitar toggle duplicado de armar cuartos"`

---

## Fase 3 — Asesor arranca apagado

### Task 3.1: Default `servicios.asesor = false`

**Files:** Modify `frontend/checklist-logic.js`; Test `frontend/checklist-logic.test.js`.

- [ ] **Step 1: Test.** `assert.strictEqual(logic.createDefaultState().servicios.asesor, false);` y verificar que `normalize` no fuerza true.
- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar.** `SERVICES_DEFAULT.asesor = false` (`~6`). Revisar tests existentes que asuman `asesor:true` por default y ajustarlos.
- [ ] **Step 4: Correr y ver pasar.**
- [ ] **Step 5: Verificación visual.** Demo nuevo: asesor NO aparece hasta prenderlo en inicio.
- [ ] **Step 6: Commit.** `git commit -m "feat(checklist): asesor arranca apagado; se enciende desde inicio"`

---

## Fase 4 — Pantalla de inicio con acordeón + tipo obligatorio

### Task 4.1: Tipo obligatorio para Empezar + quitar selector de Armar cuartos

**Files:** Modify `frontend/checklist.html`.

- [ ] **Step 1:** En `renderInicio`, deshabilitar "Empezar" si `!state.guide.tipoPropiedad` (botón disabled + texto "Elige el tipo de propiedad"). `empezarTrabajo` no marca configurado si no hay tipo.
- [ ] **Step 2:** Quitar el selector de tipo de `renderSetup` (`~2092`). Confirmar que `abrirSetup` (`~2647`) sigue sembrando `setupTipo` desde `state.guide.tipoPropiedad`.
- [ ] **Step 3: Verificación visual.** Demo: no deja Empezar sin tipo; "Armar cuartos" ya no pregunta tipo y usa el elegido.
- [ ] **Step 4: Commit.** `git commit -m "feat(checklist): tipo de propiedad obligatorio en inicio; quitar selector duplicado"`

### Task 4.2: Acordeón + entrada única (reemplaza renderRoleSelect y Saltar)

**Files:** Modify `frontend/checklist.html`.

- [ ] **Step 1:** Rediseñar `renderInicio`: rol siempre arriba; bloque de config dentro de un acordeón (abierto si `!configurado`, plegado "Ya configurado — toca para ajustar" si `configurado`). Reusar clases/variables existentes; sin colores/tipografías nuevos.
- [ ] **Step 2:** Cambiar el gate de `render()`: donde hoy `if (!roleReady()) renderRoleSelect()` (`~1668`) y el gate de `configurado`, unificar para mostrar `renderInicio()` cuando `!roleReady()`; eliminar `renderRoleSelect` del gate y la lógica de "Saltar"/`saltoInicioLocal`. "Configurar trabajo" sigue reabriendo.
- [ ] **Step 3: Verificación visual.** Demo: primera persona ve config abierta + rol; tras Empezar, en otro "dispositivo" (limpiar rol en localStorage) ve rol arriba y config plegada "Ya configurado"; reabrir funciona; estilo idéntico.
- [ ] **Step 4: Commit.** `git commit -m "feat(checklist): pantalla de inicio con acordeon (entrada unica rol+config)"`

---

## Fase 5 — Rangos de archivo por número, solo foto/360

### Task 5.1: Catálogo reducido + entrada por número

**Files:** Modify `frontend/checklist.html`.

- [ ] **Step 1:** `camarasRangoManual` → solo `{ id:'foto-sony', svc:'foto', ... }` y `{ id:'insta360', svc:'t360', ... }`. Quitar video/drone/drone-360.
- [ ] **Step 2:** Rediseñar `renderRangosManuales`: por dispositivo, mostrar prefijo+fecha como texto fijo y un input de **número** para primer y último (en vez del nombre completo con guiones). Guardar en `rangosManuales[id] = {primer, ultimo}` como cadena terminada en el número (construir nombre legible o guardar el número; la app empareja por el último grupo de dígitos). Mantener botón "Guardar" por dispositivo con confirmación e integridad (borrador en memoria, no pisar otros) — reusar lo ya hecho, adaptado a número.
- [ ] **Step 3: Verificación visual.** Demo 360 y foto: aparece bloque acotado a su cámara; escribir número, Guardar → "Guardado"; editar → vuelve a "Guardar"; guardar uno no pisa al otro; re-render no borra borrador.
- [ ] **Step 4: Verificación cruzada.** Exportar y correr dry-run de la app para foto/insta360: confirmar que acota por número correctamente.
- [ ] **Step 5: Commit.** `git commit -m "feat(checklist): rangos solo foto/360, por numero, formato compatible con la app"`

---

## Fase 6 — Pulido: toast (E3), doble regreso, voz en off visible

### Task 6.1: Confirmación en botón + deshacer en la lista (quitar toast de éxito)

**Files:** Modify `frontend/checklist.html`.

- [ ] **Step 1:** En el registro de toma media (`~5416`) y asesor (`~2905`): quitar el `showToast(... 'Deshacer')` de éxito. En su lugar: parpadeo/estado "registrada" en el propio botón de Toma, y un **"deshacer" inline** en la lista "Tomas de este punto"/recientes (preservar la función deshacer). El toast grande se conserva para errores (red/guardado).
- [ ] **Step 2: Verificación visual.** Demo: registrar tomas en ráfaga; el botón confirma sin tapar nada; el deshacer está en la lista y funciona.
- [ ] **Step 3: Commit.** `git commit -m "feat(checklist): confirmacion en boton y deshacer en lista; toast solo para errores"`

### Task 6.2: Un solo botón de regreso en sesión de asesor

**Files:** Modify `frontend/checklist.html`.

- [ ] **Step 1:** En `renderActiveView` (`~2052`), excluir también `modoActual === 'asesor'` del back-prop (que hoy solo excluye drone). Queda el "‹ Captura" de `renderAsesorCapture` (`~2837`).
- [ ] **Step 2: Verificación visual.** En sesión de asesor solo hay un regreso y vuelve a la lista.
- [ ] **Step 3: Commit.** `git commit -m "fix(checklist): un solo regreso en la sesion de asesor"`

### Task 6.3: Voz en off visible en la sesión de asesor

**Files:** Modify `frontend/checklist.html`.

- [ ] **Step 1:** En `renderAsesorCapture` (`~2820`), agregar un acceso directo visible (botón/acción) para iniciar un punto de **voz en off** (`agregarPunto(true)`), sin tener que entrar a "Cambiar punto". Reusar estilos existentes; copy claro ("Voz en off · solo audio").
- [ ] **Step 2: Verificación visual.** En la sesión de asesor se ve y funciona el acceso a voz en off; crea un punto `tipo:'voz'` que graba solo Tascam.
- [ ] **Step 3: Commit.** `git commit -m "feat(checklist): voz en off accesible directo en la sesion de asesor"`

---

## Cierre

- [ ] **Gate checklist:** `node --test frontend/checklist-logic.test.js` verde.
- [ ] **Gate app (si se tocó):** `npx tsc --noEmit && npx vitest run && npm run build:app` verde en `rediseno`.
- [ ] **Verificación cruzada hecha** (Fases 1 y 5): dry-run confirma asesor en bin "Asesor" y rangos foto/360 por número.
- [ ] **Estado viejo:** cargar un trabajo viejo (con dos segmentos Sony, incluirDrone, asesor activo) y confirmar que no se pierde nada.
- [ ] **Sin push.** Reportar a Bruno qué entró (`git log origin/main..main`) y dejar el push/deploy para su visto bueno.

## Decisiones abiertas resueltas
- Sony: Forma A (compartir secuencia, conservar rótulo `sony-asesor`).
- Tipo de propiedad: obligatorio para Empezar.
- App: arreglar en `rediseno` (local, sin push) si el dry-run lo exige.
- Despliegue: commits locales, sin push.
- Voz en off: acceso visible (sin switch-en-caliente por ahora).
