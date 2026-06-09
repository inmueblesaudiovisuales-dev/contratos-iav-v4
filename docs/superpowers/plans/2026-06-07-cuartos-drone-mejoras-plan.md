# Plan — Mejoras: Modo Cuartos v2 + Drone como piso + Terreno

> **Para ejecutar con `build-from-plan`.** Rama `checklist-cambios-2026-06-07`. Una micro-fase = un
> commit con gate. Nunca `main`, nunca deploy. Continúa la numeración (F17+).

**Goal:** Hacer que armar cuartos sea rápido (biblioteca grande + buscador + auto-sugerencia por piso/tipo)
y que el drone funcione mucho mejor (drone como **piso** con vocabulario aéreo propio, híbrido con cámara
drone en exteriores), con Terreno como un solo sujeto.

**Decisiones (aprobadas en brainstorming, mockups validados):**
- **Modo Cuartos v2:** arranca vacío; **buscador** sobre toda la biblioteca; chips **auto-sugeridos por
  piso en foco + tipo de propiedad**; biblioteca más grande; **pasillos** y **entrada/recibidor** incluidos;
  **sub-cuartos = Clóset / Baño** de un toque (+ "Otro…").
- **Drone como piso (híbrido):** existe un **piso "Drone"** cuyos cuartos son sujetos aéreos (fachada
  aérea, órbita de la casa, entorno/colonia, vista que vende, jardín/alberca aérea, golden hour…) con
  **sugerencias aéreas**; ahí la cámara es el drone. **Además**, en espacios **exteriores** (Exterior, Roof,
  Amenidades) se puede cambiar a cámara drone y queda ligado a esa misma escena. La cámara drone **no**
  aparece en interiores.
- **Vocabulario aéreo propio:** las tomas de drone usan tipos aéreos (Cenital, Órbita, Fachada aérea,
  Fly-through, Reveal aéreo, Entorno, Empuje al acceso…), no Abierto/Detalle.
- **Terreno:** tipo de propiedad Terreno = **un solo sujeto** (sin cuartos); los puntos (terreno completo,
  perímetro/colindancias, acceso, vista que vende, cercanía a vialidades, entorno) son **tomas sugeridas**.

**Mockups (fuente de verdad de UI):**
- `docs/superpowers/specs/checklist-mockups/05-modo-cuartos-v2.html` — buscador + auto-sugerencia + sub-cuartos.
- `docs/superpowers/specs/checklist-mockups/06-drone-piso-terreno.html` — piso Drone, terreno, loop aéreo.
- `docs/superpowers/specs/checklist-mockups/07-sugerencias-etiquetar.html` — panel sugerencias (ya en F16).

## Invariantes (gate)
- Export `version: 1` intacto. Backend (`worker/`) intocable. `normalizeChecklistData` acepta estado viejo
  (las tomas de drone ya pegadas a espacios por F2 siguen válidas). Sin emojis. Aditivo y compatible.

## Estructura de archivos
- `frontend/checklist-logic.js` + `frontend/checklist-logic.test.js` — modelo: piso Drone, biblioteca
  aérea, vocabulario aéreo, resolución de cámara por piso/zona, terreno, biblioteca de cuartos + búsqueda.
- `frontend/checklist.html` — UI: Modo Cuartos v2, loop con cámara drone por espacio y sugerencias aéreas,
  vista terreno.

---

# MICRO-FASES

## F17 — Motor: biblioteca aérea + vocabulario aéreo + sujetos de drone
**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`. **Invariantes:** `version: 1`, `normalizeChecklistData`.
- Define una **biblioteca de sujetos aéreos** (reusar/extender `DRONE_DEFAULTS`/`DRONE_GUIDE`): lista de
  sujetos (Fachada aérea, Órbita de la casa, Entorno/colonia, Vista que vende, Jardín aéreo, Alberca aérea,
  Roof/terraza, Golden hour, Terreno completo, Perímetro/colindancias, Acceso/calle, Cercanía a vialidades).
- Define el **vocabulario aéreo de tomas** (tipos): Establecimiento, Órbita, Cenital, Reveal aéreo,
  Fly-through, Empuje al acceso, Entorno. Expón `getDroneShotTypes()`/sugerencias aéreas por sujeto.
- `suggestionsForTarget` en modo drone devuelve las **sugerencias aéreas** del sujeto (no las de video).
- **(A) Sesgo por tipo de propiedad:** los sujetos aéreos sugeridos cambian según `guide.tipoPropiedad`:
  casa → fachada/órbita de la casa; depto → exterior del edificio/roof/amenidades/entorno; quinta →
  terreno/alberca/palapa/cabañas; terreno → terreno completo/colindancias/vialidades. Helper
  `suggestedAerialSubjects(state, tipoPropiedad)`.
- **(C) Vocabulario aéreo en el export:** confirma que `buildExport` lleva el `tipoToma`/label aéreo
  (Órbita/Cenital/Fly-through…) por archivo, **sin cambiar `version:1`**. Test: un archivo de drone con
  shotType aéreo aparece con su label en el export.
- No borres `SHOT_TYPES`/`MOVEMENTS` existentes (compat). Tests de las nuevas listas/getters.

## F18 — Motor: piso Drone + cámara por zona + terreno
**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`. **Invariantes:** `version: 1`, `normalizeChecklistData`.
- **Piso Drone:** un piso especial (p. ej. `state.pisos` incluye "Drone" y se marca con `kind:'drone'` vía
  un set/lista `DRONE_PISOS` o un campo). Sus espacios son sujetos aéreos.
- **Cámara por zona:** helper `camerasForEspacio(state, espacio)` que devuelve las cámaras disponibles según
  el piso/zona del espacio: piso Drone → cámaras drone; Exterior/Roof/Amenidades → Sony/Osmo **+** drones;
  interiores → solo Sony/Osmo. La UI usará esto en el switch (reemplaza el filtro por rol de F14 para el loop).
- **(B) Dos drones por defecto:** las cámaras drone por defecto son **DJI Air 3** y **DJI Mini 4 Pro**
  (ambas), cada una con su patrón/consecutivo; `camerasForEspacio` devuelve ambas donde el drone aplica.
- **Terreno:** helper para que, con `guide.tipoPropiedad==='terreno'`, el modelo represente **un solo
  sujeto** (un espacio único "El terreno") en vez de lista de cuartos; sus sugerencias son las del terreno.
- Migración: estado viejo sin piso Drone sigue cargando; las tomas de drone ya pegadas a espacios no se pierden.
- Tests: `camerasForEspacio` por zona; piso Drone; terreno single-subject.

## F19 — Motor/datos: biblioteca de cuartos por piso/tipo + búsqueda + pasillos/entrada
**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.
- Amplía la biblioteca de cuartos (`SPACE_SUGGESTIONS`/`TEMPLATE_DEFS`) e **indéxala por piso y tipo de
  propiedad**: `suggestedSpacesFor(state, piso, tipoPropiedad)` devuelve los chips típicos de ese piso+tipo
  (Piso 1 casa → recibidor/sala/comedor/cocina/pasillo/baño visitas; Exterior → fachada/jardín/cochera/alberca…).
  Incluye **Pasillo** y **Entrada/Recibidor** con sus sugerencias de tomas en `GUIDE_LIBRARY`/`ROOM_CATEGORIES`.
- `searchSpaces(query)` que busca en toda la biblioteca (normalizado) y devuelve coincidencias + opción
  "crear nuevo". Tests de indexado y búsqueda.

## F20 — UI: Modo Cuartos v2
**Archivos:** `frontend/checklist.html`. **Mockups:** 05 y 06 (A y B).
- Buscador que usa `searchSpaces`; chips **auto-sugeridos** por piso en foco + tipo (`suggestedSpacesFor`).
- **Piso Drone** seleccionable (estilo distinto); al enfocarlo, los chips son **sujetos aéreos**; sin
  clóset/baño ahí.
- **Sub-cuartos**: al "+ sub-cuarto", botones rápidos **Clóset / Baño** + "Otro…".
- **Terreno**: con tipo Terreno, en vez de armar cuartos, muestra **"El terreno"** (sujeto único) con sus
  tomas sugeridas; no lista de cuartos.
- Verificación visual (Playwright) contra mockups 05/06.

## F21 — UI: loop con cámara drone por espacio + sugerencias aéreas + terreno
**Archivos:** `frontend/checklist.html`. **Mockup:** 06 (C). **Invariantes:** `version: 1`.
- El switch de cámara del loop usa `camerasForEspacio` (F18): drone solo en piso Drone/exteriores.
- **(B)** El switch muestra **ambos drones** (Air 3 / Mini 4 Pro) donde aplica; elegir uno fija esa cámara
  y su contador propio.
- En modo drone, el panel "Sugeridas" muestra el **vocabulario aéreo** (F17) y el token dice "siguiente
  video" + "+ foto" (ya existe). En piso Drone la cámara entra en drone por defecto.
- **Terreno**: el loop opera contra el sujeto único con sus tomas aéreas sugeridas.
- Verificación visual (Playwright): drone alcanzable solo donde toca; sugerencias aéreas; terreno.

## Verificación final
- `node --test frontend/checklist-logic.test.js` verde.
- Playwright: armar cuartos (buscador, auto-sugerencia, sub-cuartos, piso Drone, terreno); loop de drone con
  vocabulario aéreo; drone NO aparece en interiores. Export `version:1`. Todo en la rama, sin deploy.

## Después de este plan (fases sueltas)
- F22 — limpieza de código muerto restante (renderModeArea/abrirLane/renderHeader y otros).
- F23 — íconos offline (auto-hospedar la fuente de íconos o inline) para que la app se vea sin señal.

(Los dos drones por defecto se integraron en F18/F21, ya no son fase suelta.)
