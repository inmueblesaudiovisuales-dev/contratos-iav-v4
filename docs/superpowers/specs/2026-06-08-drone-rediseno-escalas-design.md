# Spec — Rediseño de drone: escalas en vez de pseudo-cuartos

**Fecha:** 2026-06-08. **Repo:** `contratos-iav-v4` (`frontend/checklist-logic.js` + `frontend/checklist.html`).
Revisa/revierte parte de F17/F18 (drone-como-piso). No toca `iav-metadata-app`.

## Problema
El modelo actual hace del **drone un piso** cuyos "cuartos" son sujetos aéreos (Fachada aérea, Roof/terraza,
Golden hour…). Eso mezcla **lugares, escalas de contexto y condiciones** como si fueran cuartos, cuando son
**tomas**. En "Armar cuartos" te obliga a curar pseudo-cuartos irrelevantes.

## Principio (mismo patrón que Terreno)
El drone **no es una lista de cuartos que curas**; es una **lane que vuelas**, y sus sujetos aéreos son **tomas
sugeridas** — igual que Terreno (un solo sujeto, sus puntos son tomas sugeridas).

## Estructura

### Drone fuera de "Armar cuartos" → interruptor
- En "Armar cuartos" el drone deja de ser un piso con chips. Pasa a un **interruptor "incluir tomas de drone"**
  (`state.guide.incluirDrone`, boolean). Sin curar pseudo-cuartos.

### Drone en Captura → objetivos por escala
Con el drone incluido, la lane de drone presenta **objetivos por escala** (no se curan) como targets especiales
(`kind:'drone'`, con `scale`). **OJO — NO es "análogo a Terreno":** Terreno materializa UN sujeto en
`state.espacios`; drone tiene MUCHOS targets y si se materializaran reaparecerían como pseudo-cuartos en "Armar
cuartos" y en los targets de video (que comparten `state.espacios`). Por eso los targets de drone son **virtuales**:
`droneScaleTargets(state)` se **calcula al vuelo** y `targetsForMode(state,'drone')` lo devuelve (hoy devuelve
`state.espacios`). NO se persisten. Las escalas:
- **Propiedad** — la casa/lote/edificio en sí, pegado.
- **Amenidades** — del coto/fraccionamiento o del edificio (solo si aplica: privada/coto/depto).
- **Inmediato / colonia** — la calle y lo de junto.
- **Ubicación / contexto** — lejos, contexto espacial.

**Propiedad / Amenidades = derivadas de los espacios reales.** Los targets de estas dos escalas NO son fijos: se
**derivan de los espacios exteriores/amenidad que el usuario armó**. Por cada Alberca / Jardín / Roof / Casa club
que exista, la lane ofrece su **toma aérea** (Alberca aérea, Jardín aéreo…), **cada una con sus propias tomas
sugeridas** (vocabulario aéreo compartido: cenital, órbita, reveal/push-in, establecimiento; sesgado por feature
donde aplique). Si la propiedad no tiene alberca, no se sugiere "alberca aérea". A esto se suman targets fijos
property-wide: **Salida a contexto**, **Fachada/Órbita de la casa** y **Cenital giratorio**.

**Inmediato / Ubicación = targets fijos** (no dependen de espacios): acceso/calle/colonia; ubicación/vialidades/hito,
cada uno con sus tomas sugeridas.

### Sin golden hour
Se elimina "Golden hour" del vocabulario (no lo usan; graban cuando pueden).

### Cámara — decisión resuelta (con Bruno)
El drone vive **solo en su lane**: se **quita el híbrido** "cámara drone en espacios exteriores" de F18. El drone SÍ
graba features concretos (alberca, jardín, roof…), pero eso se resuelve **derivando esos targets en la lane** (ver
"Propiedad/Amenidades derivadas"), no metiendo la cámara drone en cada espacio de cuarto. `camerasForEspacio` da las
cámaras drone (Air 3 + Mini 4 Pro) a los targets de drone.

## Contenido — tomas sugeridas (curado con Bruno)

### Toma canónica (must en TODOS los tipos)
- **Salida a contexto** — reveal en reversa: cerrado en la propiedad, sales muy alto y lejos para ubicarla en la
  zona. La toma de cierre. (Absorbe los "Reveal de la casa/lote/quinta" sueltos.) Movimiento: pull-out + ascenso.

### Terreno — lista única (14; sin sesgo por subtipo)
**Reconciliación con el sujeto único:** cuando `tipoPropiedad==='terreno'`, el modelo ya usa
`terrenoSingleSubject` (un solo "El terreno", materializado, `kind:'drone'`). Ese sujeto **es** el target de drone y
porta esta lista de 14. Terreno **no** pasa por `droneFeatureTargets` (no tiene espacios que derivar); entra a
`droneScaleTargets` por el camino de compat (es un `kind:'drone'`). Así se evita el doble conteo.

Must: Cenital de límites · Establecimiento desde altura · Referencia de escala (coche/persona para dimensión) ·
Acceso/frente a calle · Vista que vende · Dónde iría la casa · Salida a contexto.
Opcionales: Órbita del terreno · Topografía/barrido lateral · Fly-through del lote · Cercanía a vialidades ·
Referencia a un hito · Entorno/desarrollo vecino · Perímetro/colindancias.

### Casa — *vende fachada, volumen y entorno*
- Propiedad: Fachada aérea [must] · Órbita de la casa [must] · Salida a contexto [must] · Patio/jardín/alberca
  aéreo · Roof/azotea · Vista que vende · Cenital giratorio [must] · Contrapicado de fachada · Órbita ascendente ·
  Fly-through · Reveal con primer plano · Reveal sobre barda [situacional, solo si hay muro/portón].
- Amenidades (si privada/coto): casa club · alberca común · áreas verdes.
- Inmediato/colonia: calle y acceso · la cuadra/vecindario.
- Ubicación: ubicación en la ciudad · cercanía a vialidades · hito.

### Quinta — *vende extensión, terrenos y amenidades (el "wow" de escala)*
- Propiedad: Salida a contexto [must] · Órbita de la propiedad [must] · Alberca/palapa aérea [must] · Cenital
  giratorio [must] · casa principal/fachada aérea · jardines/áreas verdes · cancha/cabañas/área de evento · Vista
  desde terraza · Reveal de la vista.
- Inmediato: acceso/caseta/entrada · entorno natural (bosque, lago, montaña).
- Ubicación: cómo se llega · ubicación regional.

### Departamento — *vende el edificio, LA VISTA y la UBICACIÓN*
- Edificio (Propiedad): Exterior del edificio [must] · La vista desde esa altura [must] · Salida a contexto
  [must] · el balcón/terraza del depto desde fuera · Reveal de la vista.
- Amenidades del edificio: Roof garden/terraza común [must] · alberca/áreas comunes · lobby/acceso.
- Inmediato/colonia: La zona/colonia [must] · la calle.
- Ubicación: ubicación en la ciudad · vialidades · hito.

### Catálogo de movimientos "standout" (se reusan donde aplican)
Cenital giratorio · Órbita ascendente · Fly-through/pasada · Contrapicado de fachada · Reveal con primer plano
(parallax) · Vista desde terraza/alberca · Reveal de la vista · Reveal sobre barda [situacional].

## Datos / modelo (motor)
- `DRONE_SCALES`: constante `[{id:'propiedad',...},{id:'amenidades', appliesWhen},{id:'inmediato',...},{id:'ubicacion',...}]`.
- Pool aéreo (**EXTIENDE** `AERIAL_SUBJECTS`, no lo reemplaza): cada toma `{ id, label, shotType, movement, scale,
  must, tipos:['casa'|'quinta'|'departamento'|'terreno'|'all'], situacional? }`. Sin golden hour.
  **Aditivo en ids (compat):** los ids aéreos viejos (`aereo.*`) se conservan y deben seguir siendo resolubles por
  `findSuggestion` (hoy `findSuggestion` no escanea el pool aéreo — arreglarlo, aditivo), o el export pierde la
  etiqueta de las tomas aéreas viejas.
- `droneScaleTargets(state)`: devuelve los targets de la lane de drone:
  - **Propiedad/Amenidades:** **derivados de los espacios exteriores/amenidad reales** (`droneFeatureTargets(state)`):
    por cada espacio exterior/amenidad → su versión aérea (id propio, `scale`, deriva de `espacio.id`), **cada uno
    con sus tomas sugeridas** (vocabulario aéreo compartido, sesgado por feature). + targets fijos property-wide
    (Salida a contexto, Fachada/Órbita, Cenital giratorio).
  - **Inmediato/Ubicación:** targets **fijos** del pool (acceso/calle/colonia; ubicación/vialidades/hito).
  - **Camino de compat:** suma los espacios `kind:'drone'` que ya existan en el estado (drone-piso viejo +
    terreno-único), de-dup por id, para no perder tomas viejas al cargar.
  - Amenidades solo si aplica (privada/coto/depto).
  - **Virtual:** se calcula al vuelo, NO se persiste; `targetsForMode(state,'drone')` lo devuelve.
- `suggestionsForTarget(state,'drone', target)`: para un target de drone devuelve sus tomas sugeridas (las del
  vocabulario aéreo de su feature/escala), must primero.
- `suggestedAerialSubjects`/lo que hoy sesga por tipo se reorganiza alrededor de escalas y de los espacios reales
  (aditivo donde se pueda).

## UI (checklist.html)
- "Armar cuartos": quitar el piso Drone con chips; agregar el interruptor "incluir tomas de drone".
- Captura: la lane de drone materializa los targets de escala (al incluir drone), navegables como cuartos; cada
  uno con sus tomas sugeridas aéreas. Reusa el loop R1 y la barra de navegación de cuarto.

## Migración / compatibilidad (gate)
- `version:1` intacto. `normalizeChecklistData` debe **seguir cargando estado viejo**: las tomas de drone ya
  pegadas a espacios (pseudo-cuartos del modelo F17/F18) **no se pierden** — esos espacios siguen siendo targets
  válidos aunque el modelo nuevo no los cree. El piso "Drone" viejo simplemente ya no se ofrece en Armar cuartos.
- **Mecanismo concreto (importante):** `normalizeChecklistData` huérfana (`kind:'omitted'`) toda toma cuyo
  `targetId` no esté en `targetsForMode(mode)` (`checklist-logic.js:1592-1604`). Como `targetsForMode('drone')`
  pasará a devolver `droneScaleTargets`, éste **debe incluir los espacios `kind:'drone'` preexistentes** del estado
  para que las tomas viejas no se huérfanen. Test obligatorio: cargar estado viejo (drone-piso + 1 toma) por
  `normalizeChecklistData` y verificar que la toma NO queda `omitted` y el target es alcanzable.
- **`incluirDrone` al migrar:** si el estado viejo no trae el campo pero tiene drone-piso/tomas de drone, se
  normaliza a `true` (si no, las tomas migradas quedan invisibles).
- Backend (`worker/`) intocable. Aditivo donde se pueda; sin emojis; español formal con acentos; áreas ≥44px.

## No-objetivos (YAGNI)
- Sin sesgo por subtipo de terreno (lista única).
- Sin golden hour ni condiciones de hora.
- Sin manifiesto de sesión / orientación / secuencias Premiere (eso es backlog de metadatos, otra sesión).

## Verificación
- Unit tests: `droneScaleTargets` por tipo (amenidades solo donde aplica; incluye derivados + fijos + `kind:'drone'`
  viejos, de-dup); `suggestionsForTarget` de cada escala devuelve las tomas correctas y "Salida a contexto" como must
  en todos los tipos; sin golden hour en el pool; ids aéreos viejos resueltos por `findSuggestion`;
  `targetsForMode('drone')` devuelve `droneScaleTargets`; `incluirDrone` se infiere a true con estado viejo de drone;
  migración por `normalizeChecklistData` de estado viejo con drone-piso no pierde tomas (no `omitted`); `version:1`
  intacto.
- Verificación visual: **este entorno no tiene Playwright/browser MCP.** Se hace verificación estructural
  (`node --check` del inline + gate + inspección del DOM generado) y se redespliega el preview para que Bruno valide
  en su celular: "incluir drone" en Armar cuartos (sin pseudo-cuartos); en Captura la lane de drone muestra las 4
  escalas con sus tomas sugeridas; drone alcanzable donde toca; estado viejo carga.
