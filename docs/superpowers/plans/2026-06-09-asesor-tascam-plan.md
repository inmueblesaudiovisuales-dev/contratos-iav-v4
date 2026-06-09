# Plan — Asesor con audio Tascam + entrada al modo asesor — F75–F77

> Build por micro-fases. Rama `checklist-asesor-tascam-2026-06-09`, NUNCA a `main`, worker solo al preview.
> Contexto acordado con Bruno y con la sesión de iav-metadata-app (pareo del audio por NOMBRE de archivo).

**Goal:** Que el modo asesor sea alcanzable (como el dron) y que el audio del asesor sea un archivo externo
(DJI Mic a Tascam), no la Osmo; el export lleva la llave de pareo (par) y el nombre sugerido del audio para
que la app de metadatos empareje audio↔video por nombre.

**Architecture:** El asesor deja de grabar un par Sony+Osmo dentro de la app. Graba solo el video de la Sony
FX30 (sony-asesor) y marca que tiene audio externo; la voz en off es un registro solo-audio sin video. El
audio físico vive en la Tascam y se renombra al ingestar (en la app de metadatos) usando `audioSugerido` (=
`par`). La entrada al modo asesor se reconecta como una tarjeta en la lista de captura, espejo de la sesión de
dron.

**Tech Stack:** Frontend estático: `frontend/checklist-logic.js` (motor puro, `node --test`) y
`frontend/checklist.html` (JS inline). Sin build step.

---

## Conceptos y contrato (leer antes de F75)

- Punto de asesor: `state.asesorPuntos[]` = `{ id, nombre, tipo, estado, ordenLista, ... }`. Se le agrega un
  `codigo` corto y estable: `P` + dos dígitos (`P01`, `P02`, ...). Se asigna al crear y NO se renumera al
  borrar/reordenar; un punto nuevo toma el siguiente número no usado (max actual + 1).
- Llave de pareo: `par = codigo + "_T" + toma` (p. ej. `P03_T2`). ASCII seguro para archivos por construcción.
- `audioSugerido = par` (idéntico). El archivo de audio se renombrará a `<par>.WAV/.MP3` al ingestar.
- Audio del asesor: externo (Tascam), un micro, un archivo por toma, mono. La app NO captura el audio.
- Export (aditivo, `version` sigue en 1):
  - Pareja normal (asesor a cuadro): UN registro = video Sony (`camaraId:"sony-asesor"`, `camaraTipo:"sony"`,
    `servicio:"asesor"`) con `puntoId`, `escena`/`escenaRuta`/`piso`, `toma`, `par`, `audioExterno:true`,
    `audioSugerido`. Sin registro de audio aparte.
  - Voz en off: UN registro solo-audio con `soloAudio:true`, `audioExterno:true`, los mismos campos
    (`puntoId`/`escena`/`escenaRuta`/`piso`/`toma`/`par`/`audioSugerido`) y `archivo`/`consecutivo` en `null`
    (sin token de video).

## Invariantes (gate, todas las fases)

- `buildExport` sigue dando `version:1`; `normalizeChecklistData` carga estado viejo sin pérdidas (incluye
  backfill de `codigo` en puntos que no lo tengan, de forma estable).
- El camino de captura de video/dron/cuartos NO cambia (`registerMediaFile` intacto). Solo cambia
  `registerAsesorFile` y lo propio del asesor.
- Sin emojis. Acentos en texto visible; ids/claves sin acentos. Áreas táctiles ≥44px.
- `node --test frontend/checklist-logic.test.js` 100% verde y por arriba del baseline (268); ninguna previa se
  rompe.
- No tocar `iav-metadata-app` ni `adapter/`.

**Gate motor (F75):**
`bash .claude/skills/build-from-plan/phase-gate.sh "frontend/checklist-logic.js,frontend/checklist-logic.test.js" "version: 1" "normalizeChecklistData" "function registerMediaFile"`

**Gate UI (F76):**
`bash .claude/skills/build-from-plan/phase-gate.sh "frontend/checklist.html" "version: 1" "normalizeChecklistData"`

**Gate cierre (F77):**
`bash .claude/skills/build-from-plan/phase-gate.sh "docs/RONDAS.md,docs/ARQUITECTURA.md,docs/EXPORT_METADATA_HANDOFF.md"`

---

## F75 — Motor: código de punto, audio Tascam en `registerAsesorFile`, export del asesor + tests

**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.

1. Código de punto estable:
   - En `createAsesorPuntos` asigna `codigo: 'P' + String(index+1).padStart(2,'0')`.
   - Donde se agregan puntos nuevos (busca el creador de punto de asesor en el motor; si la creación vive en la
     UI, añade un helper `nextAsesorCodigo(state)` en el motor que devuelva `'P' + pad(maxCodigoNum+1)`), asigna
     el siguiente número no usado (max de los números de `codigo` existentes + 1). Estable: no se renumera.
   - En `normalizeChecklistData`: backfill: a cada punto sin `codigo`, asígnale uno usando el siguiente no usado,
     en orden de `ordenLista`/aparición. No cambies los `codigo` ya existentes.
2. Helper `parAsesor(codigo, toma)` → `` `${codigo}_T${toma}` `` y `audioSugeridoAsesor(codigo, toma)` (idéntico
   a `par`). Exporta `parAsesor`.
3. Reescribe `registerAsesorFile(state, options)`:
   - Quita la creación del archivo `osmo-asesor`. Ya no se crea un mediaFile de audio Osmo.
   - Punto normal (tipo distinto de `'voz'`): crea UN mediaFile en `sony-asesor` (video), por el patrón actual
     (token/counter del segmento sony-asesor, shotNumber por punto), y añade `pairId = parAsesor(codigo, shotNumber)`,
     `audioExterno: true`. Marca `state.asesorPuntos` del punto como hecho como hoy.
   - Voz en off (tipo `'voz'`): crea UN mediaFile solo-audio: `cameraId: 'tascam-asesor'`, sin segmento ni token
     (`segmentId:null`, `fileCounter:null`, `fileToken:null`), `kind:'take'`, `soloAudio:true`,
     `audioExterno:true`, `targetId:puntoId`, `scene`/`scenePath = punto.nombre`, `shotNumber` por punto,
     `pairId = parAsesor(codigo, shotNumber)`, `author`, `createdAt`, `updatedAt`. No avanza ningún contador de
     cámara.
   - Mantén `role`/`pairId` coherentes; ya no hay dos cámaras, así que no hay dos archivos por punto normal.
4. `buildExport`: para los mediaFiles de asesor, agrega al registro exportado:
   - `puntoId` (= `targetId`), `par` (= `pairId`), `audioExterno: true`, `audioSugerido` (= `par`).
   - Para `soloAudio`: además `soloAudio: true`, y `archivo`/`consecutivo` en `null`, `camaraId: 'tascam-asesor'`,
     `camaraTipo: null`. El bloque `premiere` para solo-audio puede llevar `Scene`/`Comment` pero `Shot`/`Good`
     como hoy (no truena la app de metadatos: ignora lo que no use).
   - Para el video normal de asesor: `camaraId:"sony-asesor"`, `camaraTipo:"sony"`, `servicio:"asesor"` (ya hoy),
     más los campos nuevos.
   - `version` sigue en 1.
5. Tests (`checklist-logic.test.js`):
   - `createAsesorPuntos` asigna `codigo` `P01`, `P02`, ... y son únicos.
   - `nextAsesorCodigo` da el siguiente no usado tras borrar uno (no reusa ni renumera).
   - `normalizeChecklistData` backfillea `codigo` en puntos sin él y NO cambia los existentes.
   - `registerAsesorFile` de un punto normal crea UN solo mediaFile (sony-asesor), con `pairId='P0X_T1'` y
     `audioExterno:true`; NO crea ningún mediaFile osmo-asesor.
   - `registerAsesorFile` de voz en off crea UN mediaFile `soloAudio:true`, sin token (`fileToken` null), con
     `pairId` correcto.
   - `buildExport`: el registro de asesor normal trae `puntoId`, `par`, `audioExterno:true`, `audioSugerido===par`,
     `camaraId:"sony-asesor"`; el de voz en off trae `soloAudio:true`, `archivo` null, `audioSugerido===par`.
   - `buildExport` sigue dando `version:1` y los registros de video/dron/cuartos no cambian de forma.

**Gate:** gate motor. Aceptación: `node --test` verde (>268); `version:1` intacto; `registerMediaFile` intacto.

---

## F76 — UI: entrada al modo asesor (como el dron) + captura sin Osmo — CHECKPOINT VISUAL

**Archivos:** `frontend/checklist.html`.

> EJECUCIÓN HÍBRIDA — CHECKPOINT VISUAL. No autónoma. (1) PROPONER a Bruno el diseño (la tarjeta de entrada a
> Asesores en la lista de captura, espejo de la sesión de dron; y cómo se ve la captura del punto sin la Osmo:
> solo el video Sony con una nota de "audio en Tascam", y el caso voz en off) y ESPERAR aprobación antes de
> tocar `checklist.html`. (2) construir. (3) verificar visual en el preview. (4) Bruno aprueba el visual. (5)
> commitear. El gate UI es necesario pero no suficiente.

1. Tarjeta de entrada a Asesores en la lista de captura, gateada por `state.servicios.asesor`, espejo de
   `renderDroneSessionCard`/`entrarSesionDrone`/`salirSesionDrone`. Funciones nuevas `entrarSesionAsesor()`
   (fija `state.modoActual='asesor'`, abre la vista de captura) y `salirSesionAsesor()` (vuelve a la lista).
2. La captura de asesor (`renderAsesorCapture`) se ajusta al modelo nuevo: ya no muestra el par Sony+Osmo;
   muestra el punto, el token de la Sony FX30 y una nota de que el audio va por la Tascam (externo). Para puntos
   de voz en off, captura solo-audio (sin token de video).
3. Reusar el guardado normal (`saveNow`/`scheduleSave`); no inventar otro camino.
4. Verificación inline (`inline OK`) y visual en el preview (capturas antes/después en
   `docs/superpowers/verificacion/f76/`, en commit de docs aparte): entrar a Asesores desde la lista, grabar un
   punto (queda 1 mediaFile sony-asesor con su par), grabar una voz en off (queda 1 solo-audio), salir.
5. Desplegar el worker al preview (Claude despliega).

**Gate:** gate UI. Aceptación: `inline OK`; entrada a asesor funciona; captura sin Osmo; guardado por `saveNow`;
evidencia visual.

---

## F77 — Cierre: documentación y verificación

**Archivos:** `docs/RONDAS.md`, `docs/ARQUITECTURA.md`, `docs/EXPORT_METADATA_HANDOFF.md`, evidencia.

1. `docs/RONDAS.md`: entrada nueva (siguiente Rxx, hora de Monterrey con
   `TZ="America/Monterrey" date "+%Y-%m-%d %H:%M:%S %Z"`) resumiendo F75–F77: código de punto estable, audio del
   asesor externo (Tascam), `par`/`audioSugerido`, voz en off como solo-audio, y la entrada al modo asesor como
   el dron.
2. `docs/ARQUITECTURA.md`: actualizar la sección de asesor (par por `codigo+toma`, audio externo, entrada como
   sesión).
3. `docs/EXPORT_METADATA_HANDOFF.md`: documentar los campos nuevos del lado asesor (`puntoId`, `par`,
   `audioExterno`, `audioSugerido`, `soloAudio`) y que el audio se renombra a `audioSugerido` al ingestar.
4. Suite verde (`node --test`).

**Gate:** gate cierre (docs).

---

## Orden y dependencias

- F75 (motor) → F76 (UI, consume el motor; CHECKPOINT VISUAL) → F77 (cierre). En serie.
- Una fase = un commit `Rxx — Fnn: …` (Rxx siguiente; revisar el tope de RONDAS). Rama
  `checklist-asesor-tascam-2026-06-09`. Nada a `main`, worker solo al preview.
- F75 y F77 con build-from-plan autónomo; F76 es checkpoint visual con Bruno.
