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

---

## F34 — Motor A: escalas + pool de tomas aéreas + suggestionsForTarget
**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.

- **`DRONE_SCALES`**: constante `[{id:'propiedad',label:'Propiedad'},{id:'amenidades',label:'Amenidades'},
  {id:'inmediato',label:'Inmediato / colonia'},{id:'ubicacion',label:'Ubicación / contexto'}]`.
- **Pool de tomas aéreas** (reemplaza/extiende `AERIAL_SUBJECTS`): cada toma `{id,label,shotType,movement,scale,
  must,tipos,situacional?}`. **Quita "Golden hour".** Incluye:
  - Canónica: **Salida a contexto** (must, tipos:'all', scale:'ubicacion' o cross — ver spec).
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
  de cada escala devuelve lo esperado; terreno = 14; `version:1` intacto.
- **Commit:** `F34 — motor: escalas de drone + pool de tomas aereas (sin golden hour) + suggestionsForTarget`.

## F35 — Motor B: derivar targets de espacios reales + incluir-drone + quitar piso/híbrido + migración
**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.

- **`state.guide.incluirDrone`** (boolean, default razonable; para Bruno/rol con drone, on). Aditivo en
  `createDefaultState`/`normalizeChecklistData`.
- **`droneFeatureTargets(state)`**: por cada espacio exterior/amenidad real (zona exterior/amenidades) genera su
  target aéreo `{id:'drone-feat-'+espacio.id, nombre:espacio.nombre+' aérea', scale:('amenidades' si la zona es
  amenidad, si no 'propiedad'), kind:'drone', featOf:espacio.id}`. No genera para interiores. Si no hay alberca, no
  hay "Alberca aérea".
- **`droneScaleTargets(state)`**: `droneFeatureTargets` + los targets **fijos** (property-wide de Propiedad: Salida
  a contexto, Fachada/Órbita, Cenital giratorio; e Inmediato/Ubicación del pool). Amenidades solo si aplica
  (privada/coto/depto: detectar por tipo/guide o por existir espacios amenidad).
- **Quitar drone-como-piso:** el piso "Drone" deja de ofrecerse como piso curable. NO borrar `DRONE_PISO`/
  `isDronePiso` si el estado viejo los usa; pero el flujo nuevo no crea pseudo-cuartos de drone.
- **Quitar híbrido:** `camerasForEspacio` ya no agrega cámara drone a espacios exteriores de cuarto; las cámaras
  drone (Air 3 + Mini 4 Pro) se dan a los **targets de drone** (los de `droneScaleTargets`/feature). Interiores sin
  drone (igual que hoy).
- **Migración (crítica):** `normalizeChecklistData` debe **seguir cargando estado viejo**: los espacios de drone
  (pseudo-cuartos de F17/F18, `kind:'drone'`) y sus `mediaFiles` **no se pierden** — siguen siendo targets válidos.
  El terreno-único sigue funcionando. Tests con estado viejo (drone-piso + una toma de drone pegada) que confirmen
  que la toma sobrevive y el espacio sigue alcanzable.
- **Tests:** `droneFeatureTargets` deriva Alberca/Jardín aérea cuando existen esos espacios y NO cuando no;
  `droneScaleTargets` incluye fijos + derivados; amenidades solo donde aplica; `camerasForEspacio` ya no mete drone
  en interiores ni en exteriores de cuarto; migración no pierde tomas; `version:1` intacto.
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
- **Materialización:** análoga a `materializarTerrenoSiAplica` pero para la lane de drone (y cuidando el bug que ya
  arreglamos: no dejar al usuario atorado; materializar al entrar a la lane o al incluir drone).
- Sin emojis (Tabler). `node --check` del inline OK. Tests del motor verde (no se toca).
- Verificación visual (Playwright, 390px): "incluir drone" en Armar cuartos (sin pseudo-cuartos); en Captura la lane
  muestra las escalas con sus targets derivados (arma una casa con Alberca y Jardín → aparecen "Alberca aérea" y
  "Jardín aérea"); navegación; tomas sugeridas; ambos drones; estado viejo carga sin romper.
- **Commit:** `F36 — UI: interruptor incluir-drone + lane de drone por escalas (targets derivados) en Captura`.

## Verificación final
- `node --test frontend/checklist-logic.test.js` verde. Gate por fase. Playwright en F36. Redeploy del preview al
  cerrar y pasar la URL a Bruno.

## Después (backlog, otra sesión)
- App de metadatos (manifiesto de sesión, columnas XMP, secuencias Premiere), orientación por sesión, sync por git.
  Ver `docs/superpowers/backlog-app-metadatos.md`.
