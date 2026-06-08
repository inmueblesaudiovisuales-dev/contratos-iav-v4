# Plan — Rediseño de drone por escalas (F34–F36)

> **Para ejecutar con `build-from-plan`.** Rama `checklist-cambios-2026-06-07`. Una micro-fase = un commit con gate.
> Nunca `main`, nunca deploy a producción (sí preview aislado). Continúa la numeración (F34+).
> **Spec:** `docs/superpowers/specs/2026-06-08-drone-rediseno-escalas-design.md` (fuente de verdad).

**Goal:** Que el drone deje de ser un piso con pseudo-cuartos y se vuelva una **lane por escalas** (Propiedad /
Amenidades / Inmediato / Ubicación), donde Propiedad/Amenidades **se derivan de los espacios reales** (cada feature
con sus tomas aéreas sugeridas), con "Salida a contexto" como must canónica y sin golden hour. Un interruptor
"incluir drone" en Armar cuartos. Sin perder las tomas de drone del estado viejo.

## Invariantes (gate, todas las fases)
`version:1` intacto. `normalizeChecklistData` carga estado viejo (incl. drone-piso viejo y sus tomas — NO se
pierden). Backend (`worker/`) intocable. Aditivo donde se pueda; migración explícita donde no. Sin emojis. Español
formal con acentos en labels; ids sin acentos. Áreas táctiles ≥44px. No tocar `iav-metadata-app`.

## Decisión arquitectónica transversal (leer antes de F34–F36)
Esta decisión resuelve tres riesgos que el plan original no conectaba con el código real. Es la base de F35/F36.

1. **Los targets de drone son VIRTUALES, no se persisten en `state.espacios`.** Terreno materializa UN sujeto en
   `state.espacios` (`materializarTerrenoSiAplica`); drone tiene MUCHOS targets derivados (features aéreos + fijos).
   Si se materializaran en `state.espacios` reaparecerían en "Armar cuartos" y en los targets de video (que también
   leen `state.espacios`) — exactamente el pseudo-cuarto que el spec elimina. Por eso `droneScaleTargets(state)` se
   **calcula al vuelo** cada vez; NO se guarda. El patrón NO es "análogo a Terreno": Terreno persiste, drone no.
2. **`targetsForMode(state,'drone')` debe devolver `droneScaleTargets(state)`** (hoy devuelve `state.espacios`,
   `checklist-logic.js:1720-1724`). Es el punto de consumo de los targets virtuales: lo usan la captura, el resolver
   de escena (`getScenePath`/`getSceneData`) y el bucle de validación de `normalizeChecklistData`.
3. **Compatibilidad de tomas viejas = `droneScaleTargets` incluye los espacios `kind:'drone'` preexistentes.**
   `normalizeChecklistData` huérfana (`kind:'omitted'`) toda toma cuyo `targetId` no esté en
   `targetsForMode(mode)` (`checklist-logic.js:1592-1604`). Como las tomas de drone-piso viejas apuntan a
   pseudo-cuartos viejos, si `targetsForMode('drone')` deja de incluirlos, **se pierden**. Por eso
   `droneScaleTargets` debe **sumar los espacios `kind:'drone'` que ya existan en el estado** (camino de compat),
   además de los targets nuevos por escala. Test obligatorio en F35.

---

## F34 — Motor A: escalas + pool de tomas aéreas + suggestionsForTarget
**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.

- **`DRONE_SCALES`**: constante `[{id:'propiedad',label:'Propiedad'},{id:'amenidades',label:'Amenidades'},
  {id:'inmediato',label:'Inmediato / colonia'},{id:'ubicacion',label:'Ubicación / contexto'}]`.
- **Pool de tomas aéreas** (EXTIENDE `AERIAL_SUBJECTS`, **no lo reemplaza**): cada toma `{id,label,shotType,
  movement,scale,must,tipos,situacional?}`. **Quita "Golden hour".**
  - **Aditivo en los ids (crítico para compat):** los ids aéreos viejos (`aereo.fachada.establecimiento`,
    `aereo.alberca.cenital`, etc., `checklist-logic.js:392-436`) **deben seguir existiendo y siendo resolubles**;
    las tomas viejas los traen en `suggestionId` y el export los usa para la etiqueta. No renombrar ni borrar ids.
    Además, hacer que `findSuggestion` (`:855-879`) **encuentre también las tomas del pool aéreo** (hoy NO escanea
    `AERIAL_SUBJECTS`, así que las etiquetas aéreas viejas ya son frágiles); arreglarlo aquí, aditivo.
  - Incluye:
  - Canónica: **Salida a contexto** (must, tipos:'all'). **Escala fijada: la porta un target FIJO property-wide**
    (no se cuelga de un feature derivado), para que `suggestionsForTarget` siempre la pueda ofrecer como must de
    cierre en todos los tipos.
  - Fijas de contexto (inmediato/ubicacion): acceso/calle, colonia/vecindario, cercanía a vialidades, hito,
    ubicación en la ciudad, entorno/desarrollo vecino.
  - Property-wide de Propiedad: Fachada aérea, Órbita de la casa, Cenital giratorio (must según tipo).
  - Vocabulario aéreo de movimientos "standout" reutilizable: Cenital giratorio, Órbita ascendente, Fly-through,
    Contrapicado de fachada, Reveal con primer plano, Vista desde terraza, Reveal de la vista, Reveal sobre barda
    (situacional). Establecer cómo se asocian a un feature (vocabulario de tomas sugeridas por feature).
  - Terreno: la lista única de 14 (must/opcionales del spec).
- **`getDroneShotTypes`/vocabulario aéreo**: actualizar sin golden hour; mantener compat de ids viejos.
- **`suggestionsForTarget(state,'drone',target)`**: devuelve las tomas sugeridas del target (por su `scale`/feature
  + tipo), **must primero**. Para un feature derivado (p. ej. "Alberca aérea") devuelve el vocabulario aéreo de ese
  feature.
- **Tests:** el pool NO contiene golden hour; "Salida a contexto" es must en todos los tipos; `suggestionsForTarget`
  de cada escala devuelve lo esperado; terreno = 14; **ids aéreos viejos siguen resueltos por `findSuggestion`**;
  `version:1` intacto.
- **Commit:** `F34 — motor: escalas de drone + pool de tomas aereas (sin golden hour) + suggestionsForTarget`.

## F35 — Motor B: derivar targets de espacios reales + incluir-drone + quitar piso/híbrido + migración
**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.

- **`state.guide.incluirDrone`** (boolean). Aditivo en `createDefaultState` (default `false`; el rol/UI lo
  enciende, no el motor — `createDefaultState` no conoce el rol). **Migración del default en `normalizeChecklistData`
  (crítica):** si el estado entrante NO trae el campo PERO tiene drone-piso o tomas de drone (`kind:'drone'` en
  `espacios`, o `mediaFiles` de cámara drone), `incluirDrone` se normaliza a **`true`** — si no, las tomas viejas
  sobreviven pero quedan **invisibles** (no hay lane que las muestre). Si no hay rastro de drone, queda en `false`.
- **`droneFeatureTargets(state)`**: por cada espacio exterior/amenidad real (zona exterior/amenidades) genera su
  target aéreo `{id:'drone-feat-'+espacio.id, nombre:espacio.nombre+' aérea', scale:('amenidades' si la zona es
  amenidad, si no 'propiedad'), kind:'drone', featOf:espacio.id}`. No genera para interiores. Si no hay alberca, no
  hay "Alberca aérea". **NO incluye espacios que ya sean `kind:'drone'`** (esos son drone viejo, se manejan en
  `droneScaleTargets` por el camino de compat, ver abajo) ni el terreno-único.
- **`droneScaleTargets(state)`** = **targets virtuales, se calcula al vuelo, NO se persiste** (ver "Decisión
  arquitectónica transversal"). Compone:
  1. `droneFeatureTargets(state)` (derivados de espacios reales).
  2. Targets **fijos** property-wide de Propiedad: Salida a contexto, Fachada/Órbita, Cenital giratorio.
  3. Targets **fijos** de Inmediato/Ubicación (del pool).
  4. **Camino de compat:** los espacios `kind:'drone'` que ya existan en el estado (drone-piso viejo + terreno-único)
     — para que sus tomas no se huérfanen al cargar (ver Migración).
  - Amenidades (escala) solo si aplica (privada/coto/depto: detectar por `guide.tipoPropiedad` o por existir
    espacios de zona amenidad). De-dup por id (un feature derivado y un espacio viejo no deben duplicarse).
- **`targetsForMode(state,'drone')` cambia: devuelve `droneScaleTargets(state)`** (hoy devuelve `state.espacios`,
  `:1720-1724`). Este es el cambio que conecta los targets virtuales con la captura, `getScenePath`/`getSceneData` y
  el bucle de validación de `normalizeChecklistData`. **Sin este cambio las tomas nuevas de drone se huérfanan.**
- **Quitar drone-como-piso:** el piso "Drone" deja de ofrecerse como piso curable. NO borrar `DRONE_PISO`/
  `isDronePiso` (el estado viejo los usa y el camino de compat los lee); el flujo nuevo no crea pseudo-cuartos.
- **Quitar híbrido:** `camerasForEspacio` ya no agrega cámara drone a espacios exteriores de cuarto; las cámaras
  drone (Air 3 + Mini 4 Pro) se dan a los **targets de drone** (los `kind:'drone'` de `droneScaleTargets`).
  Interiores sin drone (igual que hoy).
- **Terreno (reconciliación, ver spec):** terreno conserva su sujeto único (`terrenoSingleSubject`, materializado,
  `kind:'drone'`) y ESE sujeto es el target de drone, ahora con la **lista única de 14** del pool. Terreno **no**
  pasa por `droneFeatureTargets` (no tiene espacios que derivar); entra a `droneScaleTargets` por el camino de compat
  (es un `kind:'drone'`). Evita doble conteo.
- **Migración (crítica):** `normalizeChecklistData` debe **seguir cargando estado viejo**: los espacios de drone
  (pseudo-cuartos de F17/F18, `kind:'drone'`) y sus `mediaFiles` **no se pierden**. El mecanismo concreto: el bucle
  de validación (`:1592-1604`) valida contra `targetsForMode('drone')` = `droneScaleTargets`, que **incluye los
  `kind:'drone'` viejos** (punto 4 arriba) → la toma NO se vuelve `omitted`. El terreno-único sigue funcionando.
- **Tests:** `droneFeatureTargets` deriva Alberca/Jardín aérea cuando existen esos espacios y NO cuando no;
  `droneScaleTargets` incluye fijos + derivados + los `kind:'drone'` viejos, de-dup; amenidades solo donde aplica;
  `camerasForEspacio` ya no mete drone en interiores ni en exteriores de cuarto; `targetsForMode('drone')` devuelve
  `droneScaleTargets`; **`incluirDrone` se infiere a `true` al cargar estado viejo con drone**; **migración por
  `normalizeChecklistData` de un estado viejo (drone-piso + 1 toma pegada): la toma NO queda `omitted` y su target
  es alcanzable**; `version:1` intacto.
- **Commit:** `F35 — motor: derivar targets de drone de espacios reales + incluirDrone + quitar piso/hibrido + migracion`.

## F36 — UI: interruptor en Armar cuartos + lane de drone por escalas en Captura
**Archivos:** `frontend/checklist.html`. **Mockup de referencia visual:** patrón Terreno/loop R1.

- **Armar cuartos:** quitar el piso "Drone" con chips de pseudo-cuartos. Agregar un **interruptor "incluir tomas de
  drone"** (toggle limpio, estilo R1) que setea `state.guide.incluirDrone`. Sin lista de sujetos aéreos que curar.
- **Captura (lane de drone):** cuando `incluirDrone`, la lane materializa los **targets de escala** de
  `droneScaleTargets` (derivados de espacios reales + fijos), navegables como cuartos (barra de navegación R1).
  Agruparlos/etiquetarlos por escala (Propiedad · Amenidades · Inmediato · Ubicación). Cada target con sus tomas
  aéreas sugeridas (capa Sugeridas). Reusa el loop R1, el switch de cámara (ambos drones), Salida a contexto como
  sugerencia must.
- **Materialización (OJO, NO es como Terreno):** los targets de drone son **virtuales** (`droneScaleTargets`,
  calculado al vuelo) — **no se materializan en `state.espacios`** (eso recrearía los pseudo-cuartos). Lo único que
  se persiste es `guide.incluirDrone` (el interruptor) y, como hoy, el target activo / las tomas. La lane lee
  `targetsForMode('drone')` directamente. Cuidar el patrón de no dejar al usuario atorado (como el fix de terreno):
  al incluir drone, seleccionar un target activo válido de la lane.
- Sin emojis (Tabler). `node --check` del inline OK. Tests del motor verde (no se toca).
- Verificación visual: **este entorno NO tiene Playwright/browser MCP** (confirmado al arranque). Se hace
  verificación **estructural** (`node --check` del inline + gate + inspección del DOM/HTML generado) y se **redespliega
  el preview** para que Bruno valide en su celular (390px). Cubrir: "incluir drone" en Armar cuartos (sin
  pseudo-cuartos); en Captura la lane muestra las escalas con sus targets derivados (arma una casa con Alberca y
  Jardín → aparecen "Alberca aérea" y "Jardín aérea"); navegación; tomas sugeridas; ambos drones; estado viejo carga
  sin romper.
- **Propuesta visual antes del HTML:** presentar a Bruno la propuesta de UI (interruptor en Armar cuartos +
  agrupación de las 4 escalas en Captura) y esperar su OK antes de escribir el HTML.
- **Commit:** `F36 — UI: interruptor incluir-drone + lane de drone por escalas (targets derivados) en Captura`.

## Verificación final
- `node --test frontend/checklist-logic.test.js` verde. Gate por fase (lo corre Bruno/orquestador, no el builder).
  En F36, verificación **estructural** (sin Playwright en este entorno) + redeploy del preview y pasar la URL a Bruno
  (texto plano, sin markdown) para validación en celular.

## Después (backlog, otra sesión)
- App de metadatos (manifiesto de sesión, columnas XMP, secuencias Premiere), orientación por sesión, sync por git.
  Ver `docs/superpowers/backlog-app-metadatos.md`.
