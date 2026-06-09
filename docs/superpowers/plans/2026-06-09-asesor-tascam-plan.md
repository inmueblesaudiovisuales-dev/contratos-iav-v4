# Plan — Asesor con Tascam como cámara + entrada al modo asesor — F75–F77

> Build por micro-fases. Rama `checklist-asesor-tascam-2026-06-09`, NUNCA a `main`, worker solo al preview.
> DISEÑO ACTUALIZADO 2026-06-09: la Tascam es UNA CÁMARA MÁS con su propia secuencia de nombre de archivo
> (Bruno teclea el primer nombre y se numera solo), igual que Sony/DJI. El emparejamiento es por TOKEN REAL (el
> token va dentro del nombre), como Sony/DJI. NO hay nombre sugerido ni renombrado al ingestar. Esto reemplaza
> el enfoque previo (audioExterno/audioSugerido).

**Goal:** Modo asesor alcanzable (como el dron) y audio del asesor capturado como una cámara Tascam con su
secuencia; cada punto graba la pareja video Sony + audio Tascam (ambos con token real, ligados por `par`); voz
en off es una toma solo de Tascam.

## Conceptos y contrato (leer antes de F75)

- Cámaras de asesor: `sony-asesor` (Sony FX30, video) y `tascam-asesor` (Tascam, audio). La `tascam-asesor`
  REEMPLAZA a `osmo-asesor` como dispositivo de audio del asesor y tiene su propia secuencia (segmento) como
  cualquier cámara.
- `tascam-asesor`: `{ id:'tascam-asesor', label:'Tascam (DJI Mic)', mode:'asesor', kind:'tascam', role:'audio' }`.
- Punto de asesor: se le agrega `codigo` corto y estable (`P01`, `P02`, ...; asignado al crear, no se renumera).
- `par = codigo + "_T" + toma` (p. ej. `P03_T2`). Idéntico en el registro Sony y el Tascam de la misma toma.
- Token: cada cámara expande su token real desde su secuencia (`parseFilenameSequence`/`formatFileToken`). Para
  `kind:'tascam'`, el parseo toma la última corrida de dígitos como contador (prefijo = letras justo antes; en
  `240609_0001` el prefijo queda vacío y el token es `0001`). El nombre real CONTIENE el token.
- Export (aditivo, `version` sigue en 1):
  - Punto normal: DOS registros: Sony (`camaraId "sony-asesor"`, `camaraTipo "sony"`) y Tascam
    (`camaraId "tascam-asesor"`, `camaraTipo "tascam"`), ambos `servicio "asesor"`, con su token real
    (`archivo`/`consecutivo`/`ancho`/`ejemploNombre`), `escena`/`escenaRuta`/`piso`, `toma`, `par`.
  - Voz en off: UN registro Tascam con `soloAudio: true` (sin registro de Sony en esa toma).
  - SE ELIMINAN `audioExterno` y `audioSugerido` (el audio ahora es un registro con token real).

## Invariantes (gate, todas las fases)

- `buildExport` sigue dando `version:1`; `normalizeChecklistData` carga estado viejo sin pérdidas (backfill de
  `codigo`).
- El camino de captura de video/dron/cuartos NO cambia (`registerMediaFile` intacto). Solo cambia el asesor.
- `camaraTipo "tascam"` es nuevo; Sony/DJI no cambian.
- Sin emojis. Acentos en texto visible; ids/claves sin acentos. Áreas táctiles ≥44px.
- `node --test` 100% verde y por arriba del baseline; ninguna previa se rompe.
- No tocar `iav-metadata-app` ni `adapter/`.

**Gate motor (F75):** `bash .claude/skills/build-from-plan/phase-gate.sh "frontend/checklist-logic.js,frontend/checklist-logic.test.js" "version: 1" "normalizeChecklistData" "function registerMediaFile"`
**Gate UI (F76):** `bash .claude/skills/build-from-plan/phase-gate.sh "frontend/checklist.html" "version: 1" "normalizeChecklistData"`
**Gate cierre (F77):** `bash .claude/skills/build-from-plan/phase-gate.sh "docs/RONDAS.md,docs/ARQUITECTURA.md,docs/EXPORT_METADATA_HANDOFF.md"`

---

## F75 — Motor: Tascam como cámara + pareja Sony+Tascam con tokens reales + export + tests

**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.

Nota: una versión previa de F75 (commit R124) usó el enfoque audioExterno/audioSugerido; esta fase lo REVISA al
diseño Tascam-como-cámara.

1. CAMERA_DEFAULTS: reemplaza `osmo-asesor` por `tascam-asesor` (`kind:'tascam'`, `role:'audio'`,
   `mode:'asesor'`, label "Tascam (DJI Mic)"). (Si conviene conservar `osmo-asesor` por retro-compat de estados
   viejos, déjalo en el arreglo pero NO lo uses en `registerAsesorFile`; lo importante es que el asesor grabe
   con `tascam-asesor`.)
2. `parseFilenameSequence`: soporta `kind:'tascam'` (igual que el parseo genérico: última corrida de dígitos =
   contador; prefijo = letras inmediatamente antes). `formatFileToken` ya sirve.
3. Código de punto estable: `createAsesorPuntos` asigna `codigo 'P'+pad2(index+1)`; helper `nextAsesorCodigo`;
   `normalizeChecklistData` backfillea `codigo` sin cambiar los existentes. Helper `parAsesor(codigo, toma)`
   exportado.
4. `registerAsesorFile(state, options)`:
   - Punto normal (tipo != 'voz'): crea DOS mediaFiles, `sony-asesor` (video) y `tascam-asesor` (audio), cada
     uno con su token/counter real de su segmento (avanza ambos contadores), `shotNumber` por punto,
     `pairId = parAsesor(codigo, shotNumber)`. Marca el punto como hecho.
   - Voz en off (tipo == 'voz'): crea UN mediaFile `tascam-asesor` (audio) con su token real, `soloAudio:true`,
     `pairId`. No crea Sony.
   - Requiere que ambos segmentos (sony-asesor y tascam-asesor) estén inicializados para punto normal; para voz
     en off, solo el de tascam-asesor.
5. `buildExport`: el registro `tascam-asesor` sale con `camaraTipo "tascam"`, su token real, `servicio "asesor"`,
   `par`, y `soloAudio:true` si aplica. El `sony-asesor` como hoy + `par`. `version` sigue en 1. Mapea
   `kind 'tascam'` -> `camaraTipo 'tascam'`. NO emitas `audioExterno` ni `audioSugerido`.
6. Tests: codigo P01/P02 únicos y backfill estable; punto normal crea 2 mediaFiles (sony-asesor + tascam-asesor)
   con el mismo `par` y tokens reales distintos; voz en off crea 1 mediaFile tascam-asesor con `soloAudio:true`;
   `parseFilenameSequence` con un nombre tipo `20260609_0001` da token `0001`; `buildExport` saca el registro
   tascam con `camaraTipo "tascam"`, token real y `par`, y NO trae audioExterno/audioSugerido; `version:1`
   intacto; registros de video/dron/cuartos sin cambios; `registerMediaFile` intacto.

**Gate:** gate motor. `node --test` verde (> baseline).

---

## F76 — UI: entrada al modo asesor + captura con secuencia de Tascam — CHECKPOINT VISUAL

**Archivos:** `frontend/checklist.html`.

> CHECKPOINT VISUAL: proponer a Bruno y aprobar antes de commitear; verificar en preview.

1. Tarjeta "Sesión de asesor" en la lista de captura, gateada por `state.servicios.asesor` y por ser el rol
   operador (Bruno: usar `isBruno()`, NO `loopModesForRole().includes('asesor')`, porque ningún rol trae asesor
   en su loop). Espejo de la sesión de dron: `entrarSesionAsesor()`/`salirSesionAsesor()`.
2. Captura de asesor: muestra el punto, y para punto normal el token de la Sony FX30 Y el token de la Tascam,
   con su control para poner el PRIMER nombre de archivo de cada una (reusa el flujo de secuencia que ya usa la
   Sony: `abrirSecuencia`/`initializeCameraSequence`). Grabar el punto avanza ambas y crea la pareja. Voz en off:
   solo el token de la Tascam.
3. Reusar `saveNow`/`scheduleSave`.
4. Verificación inline + visual en preview (capturas en `docs/superpowers/verificacion/f76/`, commit de docs
   aparte). Desplegar al preview.

**Gate:** gate UI.

---

## F77 — Cierre: documentación y verificación

`docs/RONDAS.md` (Rxx + hora Monterrey), `docs/ARQUITECTURA.md` (asesor: Tascam como cámara, par por
codigo+toma, voz en off), `docs/EXPORT_METADATA_HANDOFF.md` (campos nuevos del asesor: registro tascam con
camaraTipo "tascam", par, soloAudio; emparejado por token real). Suite verde.

## Orden

F75 (motor) -> F76 (UI, checkpoint visual) -> F77 (cierre). En serie. Una fase = un commit `Rxx — Fnn: …`.
