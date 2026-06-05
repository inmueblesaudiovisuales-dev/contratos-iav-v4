# Plan: Modo Guiado de tomas + etiquetado tipo/movimiento + cuarto rápido (checklist.html)

## Contexto

`frontend/checklist.html` es la "app de cámara" de rodaje: el fotógrafo recorre cuartos
(`state.espacios[]`) y tomas de drone (`state.droneItems[]`) y registra archivos con un botón
grande "Toma" que llama al motor `registerMediaFile` (numeración consecutiva por cámara, token
tipo `PIB2819`). Hoy funciona bien pero es **puramente manual**: no sugiere qué grabar ni captura
el *tipo de toma* (wide, detalle, reveal…) ni el *movimiento* (fija, paneo, órbita…).

Bruno (operador) quiere, sin romper lo que ya sirve:
1. **Etiquetar fácil y opcionalmente** tipo de toma + movimiento por toma.
2. Un **modo aparte dentro del checklist** ("Guiado") que, según el tipo de cuarto, **sugiera VARIAS
   tomas** y diga "en qué enfocarte" — con **lista rastreable** por cuarto.
3. **Auto-detectar la categoría** del cuarto desde su nombre, corregible con un toque.
4. **Añadir un cuarto rápido** sin entrar al menú "Armar cuartos".

Decisiones tomadas con el usuario:
- Aplica a **video y drone** (no foto/360/asesor).
- Modo **opt-in**: con Guiado apagado, todo queda idéntico al flujo actual.
- Las tomas guiadas usan **el mismo motor de numeración** (`registerMediaFile`): conservan token,
  consecutivo y numeración. Una sugerencia cumplida se **liga** a la Toma real.
- **Tomas extra** (fuera de la guía) siempre se permiten como "toma libre" y cuentan igual.
- Categoría **auto-detectada + corregible** con chip.
- La **biblioteca de tomas vive en código** (`checklist-logic.js`) como **default**, pero se resuelve
  como `defaults + overrides` para que sea **editable por el usuario**.
- **Panel de configuración incluido en este trabajo**: Bruno puede editar tomas/movimientos/categorías
  desde la app; los overrides se guardan en un **almacén global** (no por contrato).
- **Sin avisos de normativa de drone** en ningún lado del producto.
- **Objetivo: delegar.** El "en qué enfocarte" + must/nice está redactado para que un operador junior
  sepa qué grabar sin que Bruno explique.
- **Mostrar el movimiento** de cámara con una **micro-animación/ícono direccional** dentro de un
  **acordeón colapsado** (no ocupa espacio por defecto; cero archivos/hosting).
- Todo el trabajo va en la rama **`claude/clever-thompson-FQzJM`** (no `main`, no deploy).

Principio rector de diseño: el motor ya deriva el estado "hecho" de un cuarto de los `mediaFiles`
ligados (`deriveMediaTargetState`, logic.js:457). El modo guiado **no crea un sistema de estado
paralelo**: "sugerencia cumplida" se deriva de `mediaFiles` que llevan un `suggestionId`. Así undo,
borrado, re-numeración y polling/merge siguen funcionando gratis.

---

## Biblioteca de tomas (contenido curado — fruto de la investigación)

Estos datos van como constantes congeladas en `checklist-logic.js`. Cada toma sugerida:
`{ id, nombre, shotType, movement, enfoque, priority:'must'|'nice' }`. Los `id` van **namespaced**
para ser únicos globalmente (`sala.wide`, `drone.casa.orbit`, `amenity.alberca.orbit`).

### Glosario — TIPOS DE TOMA (`SHOT_TYPES`)
wide (Plano abierto), general (Plano general), medio (Plano medio), detalle (Detalle/inserto),
transicion (Transición/puente), pov (Punto de vista/recorrido), contrapicado (Contrapicado para
amplitud), ventana (Plano de ventana/vista), reveal (Revelación), simetrica (Toma simétrica),
textura (Acercamiento de textura), exterior (Exterior/fachada).

### Glosario — MOVIMIENTOS (`MOVEMENTS`)
static (Fija/estática), pan (Paneo), tilt (Cabeceo/tilt), dolly (Travelling/dolly),
push_in (Acercamiento), pull_out (Alejamiento), gimbal_walk (Caminata con gimbal / ninja walk),
orbit (Orbital), umbral (Revelación tras umbral), parallax (Parallax), tilt_up (Revelación vertical),
slider (Slider lateral), tracking (Seguimiento), pedestal (Pies a cabeza), whip (Whip pan / transición).
Notas técnicas (Osmo): modo PTF para tilts suaves; dos manos + caminata ninja; tomas largas
ininterrumpidas (dan speed-ramp al editor); **grabar siempre el reverso** del movimiento.

### Interior — `GUIDE_LIBRARY` por categoría (must/nice + enfoque)
- **entrada**: [must] push-in desde la puerta al primer cuarto (POV/gimbal_walk); [must] general del
  foyer (general/static-slider); [nice] tilt-up techo/candil (contrapicado/tilt_up); [nice] detalle
  de entrada (detalle/push_in).
- **sala**: [must] establecimiento (wide/gimbal_walk); [must] orbital sobre estar/chimenea
  (medio/orbit); [must] ventanas y luz (ventana/pan-slider); [nice] parallax con mueble en primer
  plano; [nice] detalle de feature (detalle/push_in).
- **comedor**: [must] establecimiento mesa centrada (wide/static-push_in); [must] orbital de la mesa
  (medio/orbit); [nice] tilt-up del candil (contrapicado/tilt_up); [nice] detalle vajilla (detalle/push_in).
- **cocina**: [must] establecimiento (wide/gimbal_walk); [must] orbital/slider sobre la isla
  (medio/orbit-slider); [must] push-in a estufa/campana (medio/push_in); [nice] detalle de acabados
  (textura/pan-tilt); [nice] ventana sobre fregadero (ventana/static).
- **recamara** (principal): [must] revelación tras umbral (reveal/umbral); [must] establecimiento
  (wide/gimbal_walk); [must] orbital/push-in a la cama (medio); [nice] ventana/vista (ventana/pan);
  [nice] transición a baño/vestidor (transicion/tracking).
- **recamara_sec**: [must] establecimiento (wide/static); [must] paneo desde esquina (general/pan);
  [nice] ventana (ventana/static). (Solo 2-3 tomas.)
- **bano**: [must] paneo/tilt **desde trípode** (general/static — evitar gimbal por espejos);
  [must] detalle de feature: tina/regadera/doble lavabo (detalle/tilt-push_in); [nice] detalle de
  acabados (textura/pan).
- **medio_bano**: [must] un solo plano general limpio (general/static — omitir si no aporta);
  [nice] detalle de acabado (detalle/push_in).
- **vestidor**: [must] push-in/revelación entrando (reveal/push_in); [nice] paneo mostrando
  capacidad (general/pan); [nice] detalle de organización (detalle/tilt).
- **estudio**: [must] establecimiento (wide/gimbal_walk-static); [nice] ventana/escritorio
  (ventana/pan-slider); [nice] detalle de built-ins (detalle/tilt_up).
- **lavado**: [must] plano general (general/static-push_in); [nice] detalle de tarja (detalle/push_in).
- **pasillo** (y escaleras): [must] seguimiento por el pasillo (transicion/tracking-gimbal_walk);
  [must] subida de escaleras con corte (transicion/gimbal_walk); [nice] tilt-up del hueco
  (contrapicado/tilt_up); [nice] toma simétrica (simetrica/slider).
- **family**: [must] establecimiento (wide/gimbal_walk); [must] orbital de la zona de estar
  (medio/orbit); [nice] parallax; [nice] transición a espacio contiguo (transicion/tracking).
- **terraza** (balcón): [must] revelación saliendo del interior (reveal/umbral); [must] general
  exterior y vista (ventana/pan-slider); [nice] detalle de feature exterior (detalle/push_in);
  [nice] parallax con barandal/planta.
- **garaje**: [must] plano general / capacidad (general/static-push_in); [nice] seguimiento de
  entrada (transicion/gimbal_walk).
- **bodega**: [must] plano general (general/static — omitir si no aporta); [nice] detalle de
  instalaciones (detalle/push_in).
- **generico** (fallback): [must] plano abierto del espacio (wide/static).

### Drone — `DRONE_GUIDE` por tipo de propiedad
Glosario aéreo de apoyo: establecimiento alto, órbita/POI (30-45s/vuelta), reveal con tilt,
fly-in/pull-out, cenital (top-down), ascenso vertical, parallax lateral, fly-through, seguimiento,
contexto de vecindario, dronie, feature spotlight, paneo aéreo.
- **casa**: [must] establecimiento de fachada; [must] órbita 360°; [must] cenital del lote;
  [nice] acercamiento a la entrada; [nice] vista de vecindario.
- **lujo/acreage**: [must] revelación de la finca; [must] órbita amplia; [must] cenital de
  amenidades; [nice] fly-through de amenidades; [nice] pull-out final; [nice] parallax de acceso.
- **departamento** (torre): [must] ascenso frente al edificio; [must] revelación de la vista;
  [nice] órbita del balcón; [nice] contexto urbano.
- **waterfront**: [must] revelación del agua; [must] órbita con agua de fondo; [must] cenital de
  muelle/acceso; [nice] paralelo a la costa; [nice] dronie sobre el agua.
- **terreno**: [must] cenital de límites; [must] establecimiento alto; [must] paneo de contexto;
  [nice] vuelo de perímetro; [nice] cenital de características.
- **quinta** (rancho/finca): [must] establecimiento del conjunto; [must] cenital de la extensión;
  [must] órbita de la casa principal; [nice] vuelo a fuentes de agua; [nice] pull-out panorámico.
- **comercial**: [must] cenital del predio; [must] establecimiento con acceso; [must] órbita del
  inmueble; [must] contexto de infraestructura; [nice] vuelo de logística.
- (Sin avisos de normativa: no se incluye ninguna nota legal/de vuelo en el producto.)

### Amenidades — `AMENITY_GUIDE` (video a pie; se concatena a la categoría por nombre)
alberca, jacuzzi, gimnasio, salón de eventos, lobby/recepción, roof garden/terraza azotea,
jardín/áreas verdes, asadores/BBQ, cancha (tenis/pádel), área infantil, business center/coworking,
spa/sauna, estacionamiento, elevadores/accesos, palapa, área de mascotas. Cada una con 3-5 tomas
(wide/recorrido/orbital/reveal/detalle) y enfoque, marcadas must/nice (detalle completo en la
investigación; ver "Fuentes" abajo). Regla de tres por espacio: mínimo wide + medio + detalle.

### Enfoque por tipo de propiedad — `PROPERTY_FOCUS`
casa ("amplitud y luz: abre cada cuarto y liga espacios"), departamento ("vistas + amenidades del
edificio"), terreno ("dimensión y ubicación: perímetro y panorámicas a pie"), quinta ("recreo: áreas
sociales, naturaleza, palapa/alberca/capilla/establos"), comercial ("fachada, flujo, escaparate,
áreas de cliente"). Para terreno y comercial, los wide de entorno a pie sustituyen al drone.

### Fuentes (citadas en la investigación)
Interior/gimbal: Aryeo, HomeJab, APAlmanac, DocFilm Academy, StudioBinder, PhotoUp, Momentum 360,
HDRsoft, Wyman Gentry, Insider RE Photography, Premiumbeat. Drone: HomeJab, Matterport, Carolina
Aerials, DocFilm Academy, KDH, DroneGenuity, Zeitview, JOUAV. Amenidades/
tipos: VueReka, Park Ward Village, Ben Accinelli, REtipster, MrHevia, VidTech, KPI, Shoot2Sell.
(Detalle toma-por-toma de interiores en el archivo de investigación del agente; drone y amenidades
en las notas de esta sesión.)

---

## Diseño de implementación

### 1. Constantes y helpers puros (checklist-logic.js, junto a `SPACE_SUGGESTIONS` ~163)
Constantes: `SHOT_TYPES`, `MOVEMENTS`, `GUIDE_LIBRARY`, `DRONE_GUIDE`, `AMENITY_GUIDE`,
`PROPERTY_FOCUS`, `ROOM_CATEGORIES`. Forma de una toma sugerida:
```js
{ id:'cocina.wide', nombre:'Plano abierto', shotType:'wide', movement:'static',
  enfoque:'Muestra la isla y el flujo de trabajo.', priority:'must' }
```
Helpers puros:
- `normNombre(s)` → minúsculas + sin acentos (`normalize('NFD').replace(/[̀-ͯ]/g,'')`).
- `detectCategoria(nombre)` → recorre `ROOM_CATEGORIES` (orden importa; primer keyword que aparece
  gana), fallback `'generico'`.
- `amenityFromName(nombre)` → match de amenidad por keyword, o null.
- `suggestionsForSpace(categoria, nombre)` → `GUIDE_LIBRARY[cat||generico].shots` concatenando
  `AMENITY_GUIDE[amenidad].shots` si el nombre matchea una amenidad.
- `suggestionsForDrone(tipoPropiedad)` → `DRONE_GUIDE[tipo||casa].shots`.
- `findSuggestion(id)` → búsqueda plana en las tres librerías (ids namespaced ⇒ seguro).
- `suggestionProgress(state, mode, targetId, suggestionId)` → deriva de `mediaFiles`:
  `{ done, count, files }` contando `kind==='take'` con ese `targetId`, cámara del `mode` y ese
  `suggestionId`.
Exportar todo en el objeto API (logic.js ~998-1028).

`ROOM_CATEGORIES` — **diseño de keywords cuidado** (evitar genéricos ambiguos). Reglas:
- Match por **palabra** (tokenizar `normNombre` por espacios), no `includes` crudo, para que "cuarto de
  lavado" no caiga en recámara por contener "cuarto".
- Las categorías **específicas van primero**; las genéricas al final.
- **No usar** keywords peligrosos como `"cuarto"` o `"principal"` solos (aparecen en muchos nombres:
  "cuarto de servicio", "baño principal"). Preferir términos propios del espacio.
Orden y keywords (ejemplo): `bano` ['bano','wc','toilet','sanitario'] → `medio_bano` ['medio bano','visitas']
→ `lavado` ['lavado','lavanderia'] → `bodega` ['bodega','servicio','almacen'] → `vestidor`
['vestidor','closet','walk-in'] → `cocina` ['cocina','kitchen','cocineta'] → `comedor`
['comedor','antecomedor'] → `sala` ['sala','living','estar'] → `family` ['family','tv','entretenimiento']
→ `estudio` ['estudio','oficina','office','despacho'] → `recamara`
['recamara','habitacion','dormitorio','alcoba','suite'] → `garaje` ['garaje','cochera','garage'] →
`pasillo` ['pasillo','escalera','hall','vestibulo'] → `entrada` ['entrada','recibidor','foyer','acceso']
→ `terraza` ['terraza','balcon','patio','roof'] → `exterior` ['fachada','jardin','exterior','frente'].
`generico` implícito (fallback). En empate, gana la primera de la lista. Misdetecciones se corrigen con
el **chip de categoría** (override) y/o editando keywords en el **panel de config**.

### 1b. Resolver defaults + overrides (editable por el usuario)
La biblioteca en código es el **default congelado**. Toda lectura pasa por un resolver que aplica los
overrides del usuario:
- `applyGuideConfig(config)` → fusiona `config` (overrides) sobre los defaults y deja la biblioteca
  "efectiva" en un módulo-cache (`getGuideLibrary()`, `getShotTypes()`, `getMovements()`, etc.). Si no
  hay config, devuelve los defaults tal cual.
- Forma del `config` (JSON): `{ version, categorias:{ <catId>:{ label, shots:[...] } }, drone:{...},
  amenidades:{...}, shotTypes:{...}, movements:{...}, roomCategories:[...] }`. Solo se guardan los
  campos que el usuario cambió (merge superficial por id; un shot con `removed:true` oculta un default;
  shots nuevos llevan id generado `custom.<slug>-<rand>` para no colisionar).
- `suggestionsForSpace`/`suggestionsForDrone`/`findSuggestion` leen de la biblioteca **efectiva**, no de
  las constantes directas.
- **Tres capas de override (de menor a mayor prioridad):** (1) defaults en código → (2) **config global**
  del usuario (`guia_config`, editable en el panel) → (3) **propuesta por propiedad** (`state.guide.proposal`,
  generada por IA y confirmada por el usuario; ver §8 "Puente IA"). El resolver fusiona las tres; cualquiera
  ausente se omite. La capa por propiedad vive en el blob del contrato (no global), así cada propiedad puede
  tener tomas a medida sin afectar a las demás.

### 1c. Almacén global de config (reusa la tabla `config` existente)
No se crea tabla ni migración nueva: la tabla key/value `config` ya existe (`worker/src/routes/config.js`).
- **Escritura (admin):** reusar `guardarConfig` con `{ clave:'guia_config', valor: JSON.stringify(config) }`.
- **Lectura (operador):** añadir acción pública `obtenerConfigGuia` en `config.js` que devuelve
  `{ ok:true, guia: <parsed o null> }` (dato no sensible). Registrar en `RUTAS_CONFIG` (index.js:42).
  Degrada con gracia si la clave no existe (devuelve null → defaults).
- **Carga en checklist.html:** al iniciar, `fetch('/api/obtenerConfigGuia')` → `logic.applyGuideConfig(guia)`
  antes del primer `render()`. Si falla la red, se usan defaults (la app no se bloquea).
- **checklist.html NO lleva contraseña para usarse** (capturar, modo guiado, ver la guía): queda 100%
  abierto por enlace, como hoy. **Solo el acto de EDITAR la biblioteca global pide la contraseña de admin**,
  una vez por dispositivo (no estorba el uso normal).
- **Cómo se protege solo la edición (reusa el admin existente, sin login nuevo):** `requireAdmin` valida
  `X-Admin-Key == env.ADMIN_KEY`; `admin.html` guarda esa clave en `localStorage['iav_admin_auth']`.
  checklist.html (mismo origen) la lee. Flujo del engrane de config:
  1. Si `localStorage['iav_admin_auth']` ya existe (Bruno entró a admin en este dispositivo) ⇒ abre el
     panel directo y manda `X-Admin-Key: <clave>` al guardar.
  2. Si no existe ⇒ pide la contraseña una vez; **valida llamando un endpoint admin** (p. ej.
     `obtenerConfigAdmin` con `X-Admin-Key`); si responde 200, guarda la clave en `iav_admin_auth` y abre
     el panel; si 401, la rechaza. Así **no se embebe la clave** en checklist.html y el uso normal sigue
     sin contraseña.

### 1d. Panel de configuración (UI nueva, pantalla aparte tipo "Armar cuartos")
Pantalla full-screen (no satura la captura), accesible desde un engrane en la barra del modo Guiado.
Edita la biblioteca **efectiva** y guarda el diff como `guia_config`:
- Lista de **categorías** → editar label, keywords de detección, y su lista de **shots**.
- Por **shot**: nombre, tipo de toma (select de `SHOT_TYPES`), movimiento (select de `MOVEMENTS`),
  enfoque (texto), prioridad must/nice, ocultar (default) o eliminar (custom), reordenar.
- Editar **glosarios** `SHOT_TYPES`/`MOVEMENTS` (label + pista) y agregar movimientos/tipos propios.
- Secciones equivalentes para **drone** (por tipo de propiedad) y **amenidades**.
- Botón Guardar → `POST /api/guardarConfig` (admin). Botón "Restaurar default" por sección (borra el
  override de esa sección). Cambios re-aplican `applyGuideConfig` y refrescan la guía en vivo.
- Reusar patrones existentes: `renderSetup`/`abrirSetup` como molde de pantalla, `.chip`, `.field`,
  `.action-stack`, `abrirModal`. Funciones nuevas: `abrirConfigGuia`, `renderConfigGuia`,
  `editarShotConfig`, `guardarConfigGuia`, `restaurarSeccionGuia`.

### 2. Categoría del cuarto (override opcional)
Campo nuevo opcional `categoria` en `state.espacios[]`:
- ausente ⇒ **auto** (se recalcula con `detectCategoria(nombre)` al vuelo, nunca se persiste el auto;
  así renombrar re-detecta solo).
- string ⇒ **override** del usuario (chip), se persiste.
Helper de UI `categoriaDe(space) = space.categoria || detectCategoria(space.nombre)`.
En `normalizeChecklistData` (logic.js:243-252) añadir `categoria: space.categoria || undefined` al map
de espacios. Sin backfill.

### 3. Modelo `mediaFile` + bump versión 2→3 (retrocompatible)
- `registerMediaFile` (logic.js:517-533): añadir al objeto pusheado
  `shotType: options.shotType||null, movement: options.movement||null, suggestionId: options.suggestionId||null`.
- `updateMediaFile` (logic.js:625): permitir cambiar los tres (`if (changes.X !== undefined) ...`).
- `createDefaultState` (logic.js:218): `version: 3` + `guide: { tipoPropiedad: null }`.
- `normalizeChecklistData` (logic.js:240): cambiar guarda a `data.version === 2 || data.version === 3`;
  backfill `normalized.guide = Object.assign({tipoPropiedad:null}, normalized.guide||{})`; en el
  forEach de mediaFiles, asegurar `file.shotType ??= null; file.movement ??= null; file.suggestionId ??= null`;
  forzar `normalized.version = 3` antes de `return`.
- **Polling/carga (crítico):** ampliar `data.cuartos.version === 2` → `>= 2` en checklist.html **716 y
  752**. Sin esto, un blob v3 entrante se trataría como legacy y perdería datos.
- Revisar `checklist-demo.js` para que no fije `version:2` literal (queda válido en v3 por campos opcionales).

### 4. Rastreo de sugerencias
- **Cumplida** = derivado 100% de `mediaFiles` vía `suggestionProgress` (igual patrón que
  `deriveMediaTargetState`). Sobrevive undo/borrado/merge sin flags que se desincronicen.
- **No aplica** (estado negativo, no derivable de archivos) = mapa explícito mínimo
  `space.guideSkip = { 'sala.detail': true }` (y análogo en `droneItem.guideSkip`). Campo opcional,
  sin backfill. Mutadores `marcarSugNoAplica` / `reactivarSug` togglean y `scheduleSave()`.
- Estado de una sugerencia en UI: `done` (derivado) | `skipped` (mapa) | `pending`.

### 5. UI (checklist.html) — opt-in, sin tocar tabs
- Variables UI nuevas (junto a html:559): `guideMode` (persistido en localStorage por token, como
  `coberturaVista` html:1148) y `activeSugId` (sugerencia seleccionada en el cuarto).
- En `renderMediaCapture` (html:1586), solo si `isMediaMode()`: un **segmented control** `[Manual | Guiado]`
  arriba de `cap-cam` (reusar `.seg`/`.seg-btn`, html:431).
  - `guideMode===false` ⇒ salida idéntica a la actual (cero cambios visuales).
  - `guideMode===true` ⇒ además renderiza `renderGuideList(target)` entre `renderCapNav` y `cap-takes`,
    y un **chip de categoría corregible** junto al nombre del cuarto en `cap-focus` (solo video).
- `renderGuideList(target)`: para video `suggestionsForSpace(categoriaDe(target), target.nombre)`;
  para drone `suggestionsForDrone(state.guide.tipoPropiedad)`. Cada fila (reusar `.cuarto-row`/`.cap-take`):
  nombre + `getShotTypes()[shotType].label · getMovements()[movement].label` + el `enfoque` como
  subtítulo ("en qué enfocarte"); badge "clave" para `must`; estado derivado (check verde + token(s)
  ligados); toque ⇒ `seleccionarSugerencia(sugId)` (set `activeSugId`, resalta el botón Toma); menú "…"
  ⇒ no aplica / reactivar. La lista es **compacta**; no debe crowdear la captura (filas de una línea +
  subtítulo, igual de densas que `.cap-take`).
- **Acordeón "ver movimiento" (colapsado por defecto):** cada fila incluye un `<details>` cerrado
  ("ver movimiento") que al abrir muestra una **micro-animación/ícono direccional** del movimiento.
  Implementación ligera, **sin archivos**: un set de íconos animados en CSS/SVG inline keyed por id de
  `MOVEMENTS` (ej. `pan` = flecha ↔ con `@keyframes` de traslación; `orbit` = punto girando ↻;
  `push_in` = flecha → creciendo; `tilt`/`tilt_up` = flecha ↕; `static` = punto fijo). Helper
  `movementGlyph(movId)` → HTML del glyph. Default colapsado respeta `prefers-reduced-motion` (sin
  animar). Reusar `<details>`/`<summary>` con estilos mínimos; cero dependencia.
- **Acceso al panel de config:** un engrane en la barra del modo Guiado, **visible para todos**, ⇒
  `abrirConfigGuia()`. checklist.html no pide contraseña para usarse; el engrane pide la contraseña de
  admin solo al editar (ver §1c, password-solo-al-editar). El operador ve la guía aunque no edite.
- **Botón Toma liga la sugerencia activa**: `registrarArchivo(targetId, kind, discardReason, guideCtx)`
  gana un 4º arg **opcional**. En guiado, el botón pasa `{suggestionId: activeSugId}`; la fn resuelve
  `findSuggestion` y pasa `suggestionId/shotType/movement` a `registerMediaFile`. Todas las llamadas
  actuales (`noSirve`, cards, `confirmarDescarte`) quedan intactas. Tras registrar, auto-avanza
  `activeSugId` a la siguiente sugerencia `pending`.
- **Toma libre**: con `activeSugId===null` el botón registra sin `guideCtx` ⇒ `suggestionId:null`;
  cuenta igual para el cuarto (`deriveMediaTargetState` solo mira `kind==='take'`). Aparece en
  `renderCapTakes` como hoy.
- Chip de categoría: `abrirCategoriaSheet(target.id)` ⇒ `abrirModal` con `ROOM_CATEGORIES` como chips
  + opción "Auto" (`delete space.categoria`). Set ⇒ `scheduleSave(); render()`.
- Drone: `setTipoPropiedadDrone(tipo)` siembra `state.guide.tipoPropiedad` (reusar `setupTipo` del setup
  si existe; si no, selector de chips la primera vez en guiado).

### 6. Cuarto rápido desde la captura
En `abrirCambiarCuarto` (html:1691, rama de espacios) añadir en el `action-stack` (junto a "Ordenar
recorrido", html:1707) un input + botón que reusa `nuevoEspacio` (html:1029):
```js
function agregarCuartoRapido(){
  const v=(document.getElementById('cuarto-rapido-input')||{}).value?.trim();
  if(!v) return;
  const piso=(activeTarget()||{}).piso || (state.pisos&&state.pisos[0]) || 'Piso 1';
  nuevoEspacio(v, piso, 'interior');
  const nuevo=state.espacios[state.espacios.length-1];
  activeRoomId=nuevo.id; localStorage.setItem(roomKey(), nuevo.id);
  scheduleSave(); abrirCambiarCuarto();
}
```
Drone ya tiene "Agregar toma" (`agregarItemLista('drone')`, html:1696) — sin cambio.

### 6b. Tipo de propiedad para drone (mapeo + override)
El setup tiene 4 tipos (`setupTipo`: casa/departamento/terreno/quinta) pero `DRONE_GUIDE` tiene 7
(+lujo, waterfront, comercial). Mapeo por defecto `casa→casa, departamento→departamento, terreno→terreno,
quinta→quinta`; lujo/waterfront/comercial se **eligen a mano** en el modo guiado de drone vía
`setTipoPropiedadDrone(tipo)` (chips), guardado en `state.guide.tipoPropiedad`. Si no hay valor, default
`casa`. El panel de config permite editar las listas por tipo.

### 6c. Eficiencia grabación → edición (incluida en este trabajo)
**(A) Reporte de faltantes en sitio.** Helper puro `guideCoverage(state, mode)` que, por cuarto/target,
devuelve `{ target, must:{hechas,faltan:[...]}, nice:{...} }` derivando de `suggestionProgress` sobre las
sugerencias `must`. UI: un resumen accesible desde el header del modo Guiado (`abrirFaltantes()`) y un
contador "faltan N clave" por cuarto en `renderGuideList`/`abrirCambiarCuarto`. Objetivo: ver gaps antes
de salir de la propiedad y **evitar regresar a regrabar**. Reusa el patrón de `getPendingSummary`
(logic.js) y `renderSummary` (html:1117).

**(B) Orden de edición en el export.** Cada `shotType` lleva un peso narrativo (`EDIT_ORDER`):
exterior/establecimiento ≈ 10, recorrido/POV ≈ 20, feature ≈ 30, medio ≈ 40, ventana ≈ 45,
detalle/textura ≈ 50; drone exterior se intercala (apertura ≈ 5 / cierre ≈ 90). `buildExport` añade por
archivo `ordenEdicion` (número) y un orden estable secundario por piso→cuarto→toma, para que el editor
arme el string-out casi solo. **No** se mete en `premiere.Shot` (ese sigue siendo `shotNumber`); va como
campo propio + se refleja al inicio de la Description (`[E20] …`) para que sea visible/ordenable en
Premiere por texto.

**(C) Description rica para filtrar.** `describirArchivo` antepone el código de orden y añade
tipo+movimiento legibles: ej. `[E20] video · toma buena · Plano abierto / Fija`. Premiere busca texto en
Description ⇒ el editor filtra por "wide", "órbita", "good", o por `[E10]…[E50]`.

### 6d. Compatibilidad con el pipeline downstream (app de Mac `iav-metadata-app`)
**HOY solo tocamos `checklist.html` + su worker/logic/tests/docs. El repo `iav-metadata-app` NO se toca.**
Invariante crítico: el **export se queda en `version: 1`** y solo **agrega campos opcionales**. La app de
Mac valida `SUPPORTED_VERSION = 1` y avisa si la versión es futura — subir el número la haría rechazar la
bitácora. Los campos nuevos (`tipoToma`, `movimiento`, `sugerencia`, `prioridad`, `ordenEdicion`, labels)
son ignorados por la app actual ⇒ no rompen nada; tipo+movimiento llegan al editor vía `Description` sin
cambiar la app. Como trabajamos en rama (sin merge a `main`), la app ni los ve hasta que decidamos.
**Fase 2 (otro repo, documentada hoy):** dejar en `EXPORT_METADATA_HANDOFF.md` el mapeo propuesto para que
la app de Mac, más adelante, escriba `tipoToma`/`movimiento`/`ordenEdicion` en campos XMP propios y
filtrables en Premiere (no solo Description).

### 6e. Puntos de integración ya verificados (para el constructor)
- **Disparo del export:** `exportarBitacora()` (html:2253) llama `logic.buildExport(state, meta)` y descarga
  `bitacora-<folio>.json`. Los campos nuevos son aditivos ⇒ el botón y el flujo no cambian.
- **`revision.html` NO lee `mediaFiles`/`buildExport`** ⇒ no le afectan los campos nuevos. Sin cambios ahí.
- **`checklist-demo.js`:** verificar que sigue generando estado válido en v3 (no fijar `version:2` literal);
  opcional, sembrar un par de tomas guiadas para la demo.
- **CSS/íconos:** agregar estilos para lista guiada, acordeón `<details>`, glyphs de movimiento, contador de
  faltantes y panel de config, **mobile-first, sin emojis, sin mayúsculas forzadas** (CLAUDE.md). Íconos
  Tabler (`ti-settings` para el engrane, flechas para glyphs). Reusar tokens `:root` y `.seg`/`.chip`/`.field`.

### 7. Export (Premiere) — aditivo, **`version: 1` intacto**
`buildExport` (logic.js:949) añade por archivo (todos opcionales, app de Mac los ignora):
`tipoToma: f.shotType||null`, `tipoTomaLabel`, `movimiento: f.movement||null`, `movimientoLabel`,
`sugerencia: f.suggestionId||null`, `prioridad` (must/nice de la sugerencia), `ordenEdicion` (de
`EDIT_ORDER[shotType]`, con desempate piso→cuarto→toma). Constante nueva `EDIT_ORDER` en logic.js.
Opcional: una sección `resumenGuia` en la cabecera del export (por cuarto: must hechas/faltan) derivada
de `guideCoverage`, para que el editor sepa qué es hero y qué falta.
`describirArchivo` (logic.js:940): Description = `[E<orden>] <servicio> · <estado> · <tipo> / <movimiento>`
⇒ ej. `[E20] video · toma buena · Plano abierto / Fija`. Sigue mapeando a `premiere.Description`
(XMP-dc:Description) ⇒ filtrable en Premiere sin tocar la app. Documentar TODO en
`docs/EXPORT_METADATA_HANDOFF.md` §2, incluyendo el **mapeo propuesto para fase 2** (campos XMP propios).

### 7b. Guion de edición en el export (contemplar la edición sin invadir el otro repo)
`buildExport` añade una sección opcional `guionEdicion`: lista **ordenada** (por `ordenEdicion`, luego
piso→cuarto→toma) de los clips, marcando **buenas por escena** y agrupando por cuarto, más una línea de
contexto por propiedad (`PROPERTY_FOCUS` + destacados). Es un artefacto **legible** que el editor puede
seguir tal cual para armar el string-out, sin construir UI de edición aquí. No cambia el esquema (aditivo,
`version:1`). El **flujo de edición** (cómo el editor usa ordenEdicion/good/tipo/movimiento para ir más
rápido) se **documenta** en `EXPORT_METADATA_HANDOFF.md`. Construir herramientas de edición reales
(secuencia/EDL en Premiere, rough-cut) queda **fuera**: es fase 2 del repo `iav-metadata-app`.

### 8. Puente IA: propuesta de tomas por propiedad (sin API, copiar/pegar)
Capa de override **por propiedad** (`state.guide.proposal`), generada por una IA externa barata (DeepSeek,
etc.) y **confirmada por el usuario**. No hay integración por API ni llaves: es un ciclo copiar/pegar.
- **Entrada (datos de la propiedad):** un campo de texto nuevo por contrato (`state.guide.descripcion`,
  destacados de la propiedad) + la lista de cuartos con su categoría detectada.
- **Generar el prompt (`buildPropuestaPrompt(state)`):** arma un prompt determinista que incluye (a) la
  descripción + cuartos, (b) **nuestras guidelines como vocabulario cerrado** (ids válidos de `SHOT_TYPES`/
  `MOVEMENTS`, categorías, y la biblioteca efectiva como referencia), (c) instrucción de responder en un
  **JSON estricto** con un **ejemplo (few-shot)**. Botón "Copiar prompt".
- **Parsear la respuesta (`parsePropuesta(texto)`):** **tolerante** al recibir (extrae el bloque JSON aun
  con ``` o texto alrededor) y **valida duro**: solo acepta `shotType`/`movement` que existen, solo cuartos
  que existen (por id/nombre), genera ids `custom.*`, recorta cantidades a un tope, descarta lo inválido y
  reporta qué ignoró. **Nunca aplica a ciegas.**
- **Preview + confirmar:** muestra un diff legible ("para la alberca: +reveal de la vista; para la recámara
  principal: +detalle de la vista al mar") y el usuario **acepta/ajusta/descarta** antes de escribir
  `state.guide.proposal` (→ `scheduleSave`). Editable y reversible ("Quitar propuesta").
- **Seguridad:** el texto pegado es **no confiable**; el parser valida contra vocabulario y cuartos reales,
  hay confirmación humana, y la capa por propiedad nunca toca defaults ni la config global.
- **Seam reservado desde el modelo (F3):** `state.guide = { tipoPropiedad, descripcion, proposal }` (todos
  opcionales); el resolver ya fusiona la 3ª capa. Así las fases de IA no requieren refactor.

---

## Riesgos y mitigación
1. **Romper el flujo manual** → Guiado es opt-in (`guideMode` default false ⇒ render idéntico).
   `registrarArchivo` gana arg **opcional** ⇒ llamadas actuales intactas.
2. **Polling pierde blob v3** → ampliar `version===2` a `>=2` en html:716 y 752 (obligatorio).
3. **Migración** → todos los campos nuevos `|| null` / opcionales; `normalize` v2 es superset; sin
   backfill de `categoria` (auto en runtime). Estados v1/v2 viejos siguen migrando.
4. **Derivado vs guardado** → "cumplida" 100% derivado de `mediaFiles`; solo "no aplica" usa `guideSkip`.
5. **`suggestionId` huérfano** (curaduría cambia) → `findSuggestion` null; el `mediaFile` igual cuenta
   como toma; export degrada a Description base. Sin pérdida.
6. **Colisión de ids** → ids namespaced; shots custom del usuario llevan id `custom.<slug>-<rand>`.
7. **Config global rompe la app si falla** → la carga de `obtenerConfigGuia` degrada a defaults; el
   resolver nunca lanza (merge defensivo). La app funciona sin red de config.
8. **Operador edita sin querer** → checklist.html abierto para usarse, pero **editar la biblioteca pide la
   contraseña de admin** (validada contra el worker, `guardarConfig`/`obtenerConfigAdmin` exigen
   `X-Admin-Key`). El uso normal (capturar/ver guía) no pide nada.
9. **Override apunta a shot default removido** → `findSuggestion` null ⇒ el `mediaFile` igual cuenta;
   sin pérdida. "Restaurar default" por sección permite revertir.
10. **Peso/espacio** → la animación es CSS/SVG inline (sin GIF ni hosting); el acordeón está colapsado
    por defecto; la lista guiada es compacta y solo aparece con Guiado encendido.

## Archivos a modificar
- `frontend/checklist-logic.js` — biblioteca default + `EDIT_ORDER` + **resolver** (`applyGuideConfig`/
  `getGuideLibrary`/`getShotTypes`/`getMovements`); helpers (`detectCategoria`/`suggestionProgress`/
  `suggestionsFor*`/`findSuggestion`/`guideCoverage`); cambios a `registerMediaFile`/`updateMediaFile`/
  `normalizeChecklistData`/`buildExport`/`describirArchivo`; bump estado v3 (**export sigue v1**); exports.
- `frontend/checklist.html` — variables UI; toggle Manual/Guiado en `renderMediaCapture`; `renderGuideList`
  con acordeón `<details>` + `movementGlyph`; chip de categoría; contador "faltan N clave" + `abrirFaltantes`;
  `registrarArchivo` con `guideCtx`; cuarto rápido en `abrirCambiarCuarto`; ampliar `version>=2` en 716 y
  752; carga de `obtenerConfigGuia` al inicio; **panel de config** (`abrirConfigGuia`/`renderConfigGuia`/
  `guardarConfigGuia`/`restaurarSeccionGuia`).
- `worker/src/routes/config.js` — nueva acción pública `obtenerConfigGuia` (lee clave `guia_config`,
  degrada a null). Escritura reusa `guardarConfig` (admin), sin cambios.
- `worker/src/index.js` — añadir `'obtenerConfigGuia'` a `RUTAS_CONFIG` (línea 42).
- `frontend/checklist-logic.test.js` — tests de lógica pura (resolver, merge de config, cobertura, export).
- `docs/EXPORT_METADATA_HANDOFF.md` — documentar campos nuevos (`tipoToma`/`movimiento`/`sugerencia`/
  `prioridad`/`ordenEdicion`/labels/`resumenGuia`) + **mapeo propuesto fase 2** para la app de Mac.
- `docs/RONDAS.md` — registrar la ronda (hora exacta de Monterrey).
- **NO se toca** el repo `iav-metadata-app` (fase 2).

## Plan por MICRO-FASES (cada una = una sesión de construcción separada)

Para no llenar contexto ni arrastrar errores, el build se parte en fases pequeñas e **independientes**.
Cada fase: alcance acotado, su propio commit `Rxx — …`, su verificación, y se entrega al constructor con
un prompt mínimo. Las fases de lógica (1-4) son **puras y testeables sin UI**; las de UI (6-12) son
aditivas y opt-in. Orden recomendado; las marcadas "(paralelizable)" no dependen entre sí.

- **F1 · Logic: biblioteca de datos.** Constantes `SHOT_TYPES`, `MOVEMENTS`, `GUIDE_LIBRARY`, `DRONE_GUIDE`,
  `AMENITY_GUIDE`, `PROPERTY_FOCUS`, `ROOM_CATEGORIES`, `EDIT_ORDER` + getters `getShotTypes/getMovements/
  getGuideLibrary` (devuelven defaults) + exports. Sin cambios de comportamiento. Test: shape/ids únicos.
- **F2 · Logic: detección + sugerencias.** `normNombre`, `detectCategoria` (match por palabra), `amenityFromName`,
  `suggestionsForSpace/Drone`, `findSuggestion`. Test: categorías (incl. "Cuarto de lavado"→lavado, "Baño
  principal"→bano), concatenación de amenidad. (paralelizable con F1 si F1 ya existe.)
- **F3 · Logic: modelo + migración v3.** `registerMediaFile`/`updateMediaFile` ganan `shotType/movement/
  suggestionId`; `espacio.categoria`/`guideSkip` opcionales; `createDefaultState` v3 + **seam
  `guide:{tipoPropiedad,descripcion,proposal}`** (reserva la 3ª capa para el puente IA, sin usarla aún);
  `normalizeChecklistData` v2||v3 + backfills; `suggestionProgress`, `guideCoverage`. Test: persistencia,
  toma libre cuenta, removeMediaFile des-cumple, migración v2→v3 y round-trip v3.
- **F4 · Logic: export.** `buildExport` agrega `tipoToma/…/ordenEdicion/prioridad/labels/resumenGuia` y la
  sección **`guionEdicion`** (orden + buenas por escena, §7b) **manteniendo `version:1`**; `describirArchivo`
  con `[E..] · tipo / movimiento`. Test: version:1, campos, Description, guionEdicion ordenado.
- **F5 · Logic: resolver de config.** `applyGuideConfig(config)` (merge defaults+overrides; `removed:true`
  oculta; ids `custom.*`). Getters leen lo efectivo. Test: renombrar/ocultar/agregar; sin config ⇒ defaults;
  override inválido no rompe. (Cierra la parte de lógica.)
- **F6 · Worker: lectura de config.** `obtenerConfigGuia` en `config.js` (lee clave `guia_config`, degrada a
  null) + registrar en `RUTAS_CONFIG` (index.js:42). Verificar respuesta. (paralelizable.)
- **F7 · HTML: cimientos (sin UI visible).** Ampliar `version===2`→`>=2` en html:716 y 752; cargar
  `obtenerConfigGuia` al inicio y `applyGuideConfig`; vars UI `guideMode`/`activeSugId` (persistidas). Verifica
  que con todo apagado la app se ve idéntica y el polling no pierde datos.
- **F8 · HTML: modo guiado núcleo.** Toggle `[Manual|Guiado]` en `renderMediaCapture`; `renderGuideList`
  (sugerencias, estado derivado, badge must, chip de categoría + `abrirCategoriaSheet`);
  `seleccionarSugerencia`; `registrarArchivo` gana 4º arg `guideCtx`; toma libre; auto-avance. Verifica el
  ciclo: tocar sugerencia → Toma → liga (token+check) → siguiente.
- **F9 · HTML: ver movimiento (acordeón).** `<details>` colapsado + `movementGlyph` (micro-animación CSS/SVG,
  respeta `prefers-reduced-motion`) + CSS. (paralelizable con F10/F11.)
- **F10 · HTML: faltantes en sitio.** Contador "faltan N clave" + `abrirFaltantes` (de `guideCoverage`).
  (paralelizable.)
- **F11 · HTML: cuarto rápido + tipo de propiedad drone.** Input en `abrirCambiarCuarto` (reusa
  `nuevoEspacio`); `setTipoPropiedadDrone` (chips). (paralelizable.)
- **F12 · HTML: panel de config.** `abrirConfigGuia`/`renderConfigGuia` (CRUD categorías/keywords/shots/
  glosarios/drone/amenidades) + `guardarConfigGuia` (password-solo-al-editar vía `X-Admin-Key`, validando
  contra el worker; ver §1c) + `restaurarSeccionGuia`; engrane visible para todos. Verifica editar→guardar→
  recargar refleja; restaurar revierte; usar checklist sin tocar config no pide contraseña.
- **F13 · Docs.** `EXPORT_METADATA_HANDOFF.md` (campos nuevos + `guionEdicion` + **flujo de edición**
  contemplado + mapeo fase 2) y `RONDAS.md` (hora exacta MTY).
- **F14 · Logic: puente IA (núcleo).** `buildPropuestaPrompt(state)` (prompt determinista con datos de la
  propiedad + vocabulario cerrado + few-shot JSON); `parsePropuesta(texto)` (extracción tolerante +
  validación dura contra `SHOT_TYPES`/`MOVEMENTS`/cuartos reales + ids `custom.*` + topes); 3ª capa del
  resolver lee `state.guide.proposal`. Puro y testeable. Test: JSON con basura alrededor parsea; rechaza
  shotType/cuarto inexistente; respeta tope; la propuesta válida aparece en la biblioteca efectiva.
- **F15 · HTML: puente IA (UI).** Campo `state.guide.descripcion` (destacados de la propiedad); botón
  "Copiar prompt" (`buildPropuestaPrompt`); pegar respuesta → `parsePropuesta` → **preview/diff** →
  aceptar/ajustar/descartar → escribe `state.guide.proposal` + `scheduleSave`; "Quitar propuesta". Verifica
  el ciclo completo con una respuesta de ejemplo y que un texto inválido no rompe nada.

Dependencias: F7 requiere F5+F6; F8 requiere F1-F3+F7; F4 requiere F3; F10 requiere F3; F12 requiere F5+F6+F8;
**F14 requiere F5 (resolver)**; **F15 requiere F14+F8**. F1, F2, F6, F9, F10, F11 son chicas. Cada fase corre
`node --test frontend/checklist-logic.test.js` (las de lógica) y/o verificación manual breve antes de cerrar
su commit. Las fases F14–F15 (puente IA) son las **finales**.

## Verificación
- **Tests de lógica** (obligatorio, sin red): `node --test frontend/checklist-logic.test.js`. Cubrir:
  `detectCategoria` (con/sin acentos, fallback genérico); `suggestionsForSpace/Drone` (shape +
  concatenación de amenidad); `registerMediaFile` con `{suggestionId,shotType,movement}` persiste y
  `suggestionProgress` reporta `done/count`; **toma libre** deja el cuarto en `hecho`; `removeMediaFile`
  des-cumple la sugerencia; `normalizeChecklistData` migra v2→v3 (mediaFiles ganan campos null, `guide`
  existe) y v3 round-trips; `buildExport` incluye `tipoToma/movimiento` y Description extendida;
  **resolver**: `applyGuideConfig` fusiona override (renombrar shot, ocultar default, agregar custom) y
  `getGuideLibrary` refleja el merge; sin config ⇒ defaults intactos; override con shot inválido no rompe;
  `detectCategoria('Cuarto de lavado')→lavado` y `('Baño principal')→bano` (no caen en recámara);
  `guideCoverage` reporta must faltantes correctos; `buildExport` mantiene `version:1`, agrega
  `ordenEdicion`/`prioridad`/labels y la Description lleva `[E..]`.
- **Manual en navegador** (abrir checklist.html con un token de prueba): (a) con Guiado **apagado** el
  flujo se ve y funciona idéntico; (b) Guiado **encendido** muestra sugerencias por cuarto con enfoque;
  tocar una sugerencia y dar Toma la liga (check + token), auto-avanza; (c) Toma libre cuenta; (d) chip
  de categoría corrige y persiste; (e) cuarto rápido desde "Cambiar cuarto" crea y activa el cuarto;
  (f) drone muestra guía por tipo de propiedad; (g) el acordeón "ver movimiento" abre la micro-animación
  y respeta `prefers-reduced-motion`; (h) **panel de config** (admin): editar/agregar/ocultar un shot,
  guardar, recargar y ver el cambio reflejado en la guía; "Restaurar default" revierte; (i) **faltantes**:
  con un must sin grabar, el contador "faltan N clave" y `abrirFaltantes` lo listan; al grabarlo, baja.
  Verificar que el blob de estado guardado es `version:3`, que el **export sigue `version:1`**, y que un
  segundo refresco (polling) no pierde datos.
- **Compat downstream:** exportar una bitácora de prueba y confirmar que abre en la app de Mac
  (`iav-metadata-app`) sin el aviso de "versión futura" y que la Description muestra tipo/movimiento.
- **No deploy a mano**: todo queda en la rama `claude/clever-thompson-FQzJM`; commits con mensaje
  `Rxx — …`. No `wrangler deploy`.

---

## Modelo de trabajo: esta sesión planea, otra construye

Esta es la **sesión de planeación**. El código lo harán **varias sesiones de construcción** (una por
micro-fase, ver "Plan por MICRO-FASES"), para no llenar contexto ni arrastrar errores; esta sesión
**supervisa** (revisa diffs/commits fase por fase, valida contra este plan, corre/lee tests, no escribe
código de producción). El plan de arriba es la fuente de verdad; abajo va el template de handoff por fase.

### Puerta de aprobación: ESTA sesión aprueba cada fase
- **Yo (esta sesión de planeación/supervisión) soy el aprobador de cada micro-fase.** Flujo: la otra
  sesión de Claude construye **una** fase → Bruno me **reenvía** lo que esa sesión reporte (diff/commit +
  salida de tests) → yo lo **reviso contra este plan** y respondo **APROBADO** o **CAMBIOS** (con la lista
  puntual a corregir). **No se avanza a la siguiente fase hasta que yo apruebe** la actual.
- Si reenviar el diff completo es mucho, basta con: el `git show --stat` + el diff de la fase (o el sha del
  commit en la rama) y la salida de `node --test`. Puedo pedir ver archivos puntuales si algo no cuadra.
- **Una sesión de construcción por micro-fase** (F1, F2, …), cada una arranca limpia para no llenar
  contexto. Le entrego (vía Bruno) el template de handoff de abajo con la fase específica.

### Checklist de revisión que aplico por fase (antes de aprobar)
- **Global (toda fase):** un solo commit `Rxx — …`; cambios **acotados a la fase** (no adelanta otras);
  sin emojis, sin mayúsculas forzadas, mobile-first; nada de `wrangler deploy`, merge a `main` ni PR.
- **Fases de lógica (F1–F5):** `node --test` en verde; funciones nuevas exportadas; **export sigue
  `version:1`**; migración `normalizeChecklistData` acepta v2 y v3 sin perder datos; helpers puros (sin
  tocar DOM); `detectCategoria` no cae en trampas ("Cuarto de lavado"→lavado, "Baño principal"→bano).
- **F6 (worker):** `obtenerConfigGuia` registrado en `RUTAS_CONFIG`; degrada a null sin tabla/clave;
  no expone nada sensible; escritura sigue exigiendo admin.
- **F7 (cimientos HTML):** con todo apagado, checklist se ve **idéntico**; `version>=2` en html:716 y 752;
  carga de config degrada a defaults si falla la red; sin regresiones en el polling.
- **Fases de UI (F8–F12):** opt-in real (Guiado apagado = sin cambios); reusa patrones existentes
  (`.seg`/`.chip`/`renderCapTakes`/`abrirModal`/`nuevoEspacio`); `registrarArchivo` mantiene compatibilidad
  (4º arg opcional); acordeón colapsado + `prefers-reduced-motion`; **usar checklist no pide contraseña**,
  solo editar la biblioteca la pide.
- **F13 (docs):** handoff documenta los campos nuevos + `guionEdicion` + flujo de edición + mapeo fase 2;
  `RONDAS.md` con hora exacta MTY.
- **F14–F15 (puente IA):** el texto pegado se trata como **no confiable**; `parsePropuesta` valida duro
  (solo vocabulario/cuartos reales, topes) y **siempre** hay preview + confirmación humana antes de aplicar;
  la propuesta vive en `state.guide.proposal` (por propiedad), nunca toca defaults ni config global; un texto
  inválido o vacío no rompe la app.

### TEMPLATE DE HANDOFF POR FASE (relleno la fase y se lo doy a cada sesión de build)

> Trabajas en el repo `contratos-iav-v4`, rama `claude/clever-thompson-FQzJM`. Esta es **solo la fase
> {Fn}** de un plan mayor. **Lee primero** el plan completo en
> `/root/.claude/plans/quiero-que-trabajemos-en-playful-widget.md` (secciones "Biblioteca de tomas",
> "Diseño de implementación" y "Plan por MICRO-FASES") y limítate al alcance de **{Fn}**: {pega aquí el
> bullet de la fase}.
>
> Reglas duras: implementa **solo {Fn}**, sin adelantar otras fases. Mantén todo **aditivo y opt-in** (con
> Guiado apagado, checklist.html se ve idéntico). **El export se queda en `version:1`** (nunca subir).
> checklist.html **no pide contraseña para usarse**; solo editar la biblioteca pide admin (cuando aplique).
> Sin emojis, mobile-first, sin mayúsculas forzadas. **No toques** el repo `iav-metadata-app`. **No**
> `wrangler deploy`, **no** merge a `main`, **no** PR.
>
> Al terminar: corre `node --test frontend/checklist-logic.test.js` (si la fase toca lógica) y/o haz la
> verificación manual indicada; haz **un commit** `Rxx — {Fn}: <descripción>` y `git push -u origin
> claude/clever-thompson-FQzJM`. Si la fase toca `docs/RONDAS.md`, usa la hora exacta de Monterrey
> (`TZ="America/Monterrey" date "+%Y-%m-%d %H:%M:%S %Z"`). Reporta el diff y la salida de tests; no sigas
> con otra fase.

### Qué quedó explícitamente fuera (fase 2 / otra ronda)
- Tocar `iav-metadata-app` para mapear tipo/movimiento/ordenEdicion a **campos XMP propios** filtrables en
  Premiere (hoy van en Description). Queda **documentado** en el handoff.
- **Herramientas de edición reales** (secuencia/EDL automática, rough-cut en Premiere): en este proyecto solo
  **documentamos el flujo** y emitimos el `guionEdicion` legible en el export. La automatización es fase 2 del
  otro repo.
- **Integración por API con la IA:** explícitamente NO; el puente IA es copiar/pegar con confirmación humana.
- Resolutor manual de dos drones con contadores encimados (limitación conocida de la app de Mac).
- Mover descartes a `_descartes/` (la app solo marca `Good=False`).

---

# APÉNDICE A — Investigación: tomas y movimientos de interiores (detalle toma-por-toma)

# Biblioteca de tomas y movimientos — Video inmobiliario de interiores

Curada para fotografo con Sony + gimbal (Osmo). Sin drone. Para app de checklist de rodaje.

---

## A1) GLOSARIO DE TIPOS DE TOMA (encuadre / proposito)

| Nombre ES | Termino EN | Descripcion (1 linea) | Cuando usarla |
|---|---|---|---|
| Toma de establecimiento | Establishing / Wide shot | Encuadre amplio que muestra el cuarto completo y como conecta con el resto. | Primer plano de cada espacio para orientar al espectador y dar contexto. |
| Plano general | Full / Wide shot | Cuarto entero con su distribucion y flujo, sin enfocar un objeto. | Mostrar layout y dimension real; base de cada habitacion. |
| Plano medio | Medium shot | Encuadre de una zona o feature clave (mesa de comedor, isla, sillon). | Resaltar areas funcionales y como se vive el espacio. |
| Plano de detalle / inserto | Detail / Insert shot | Aislar un elemento: grifo, textura, herraje, luminaria, molduras. | Comunicar calidad de acabados y aspiracion; cortes de ritmo. |
| Plano de transicion | Transition shot | Toma puente (umbral, pasillo, paso de luz) para conectar dos espacios. | Unir habitaciones en el edit sin cortes secos; mantener flujo. |
| Punto de vista | POV / Walkthrough | Camara a la altura de la vista que avanza como si el comprador caminara. | Recorridos inmersivos; entrada hacia el primer cuarto principal. |
| Contrapicado para amplitud | Low angle | Camara baja inclinada hacia arriba para exagerar altura y techos. | Techos altos, vigas, dobles alturas, sensacion de grandeza. |
| Plano de ventana / vista | Window / View shot | Encuadre que prioriza la ventana y la vista exterior bien expuesta. | Vender luz natural y vistas; proteger altas luces de la ventana. |
| Plano de revelacion | Reveal shot | El cuarto o feature se descubre progresivamente tras un obstaculo. | Crear sorpresa al entrar a un espacio destacado. |
| Toma simetrica | Symmetry / Centered shot | Composicion centrada sobre el eje del cuarto, lineas rectas. | Pasillos, fachadas interiores, cocinas alineadas; look limpio. |
| Plano de acercamiento textura | Texture close-up | Macro de material: piedra, madera, tela, herreria. | Reforzar percepcion de lujo y calidad de materiales. |

Fuentes A1: HomeJab, Aryeo, StudioBinder (establishing/wide/medium/insert), Cinema8, PhotoUp.

---

## A2) GLOSARIO DE MOVIMIENTOS DE CAMARA

| Nombre ES | Termino EN | Descripcion (1 linea) | Cuando usarla |
|---|---|---|---|
| Fijo / estatico | Static / Locked-off | Camara inmovil en tripie o gimbal bloqueado. | Banos con espejos, planos de detalle, exposiciones largas estables. |
| Paneo | Pan | Giro horizontal sobre eje fijo (izq-der / der-izq). | Barrer una sala amplia, mostrar molduras o piso desde una esquina. |
| Cabeceo | Tilt | Giro vertical (piso a techo / techo a piso). | Revelar altura de techo, vigas, lamparas colgantes. |
| Travelling / dolly | Dolly / Travelling | Desplazamiento fisico de la camara hacia o dentro del espacio. | Recorridos y revelaciones; base del look cinematografico. |
| Acercamiento | Push-in | Avanzar lento hacia un foco (chimenea, ventana, isla). | Dar enfasis y atraer la atencion a un feature. |
| Alejamiento | Pull-out / Push-out | Retroceder lento revelando el contexto del cuarto. | Reverso del push-in; abrir el espacio. Graba siempre el reverso. |
| Caminata con gimbal | Gimbal walk / Ninja walk | Avanzar con rodillas flexionadas y paso suave para estabilidad. | Walkthroughs y POV entre cuartos; base del recorrido. |
| Orbital | Orbit / Arc | Movimiento circular alrededor de un punto focal. | Isla de cocina, chimenea, comedor, cama principal. |
| Revelacion tras umbral | Doorway / corner reveal | Cruzar una puerta o esquina para descubrir el cuarto. | Entrada a recamara principal, sala destacada, terraza. |
| Parallax | Parallax | Desplazamiento lateral con objeto en primer plano que cruza mas rapido que el fondo. | Anadir profundidad 3D; sensacion de espacio y volumen. |
| Revelacion vertical | Vertical reveal / tilt-up reveal | Empezar bajo y subir para descubrir altura o un elemento superior. | Techos altos, candiles, dobles alturas, escaleras. |
| Slider lateral | Slider / Lateral track | Desplazamiento horizontal corto y suave sobre riel o gimbal. | Resaltar simetria y lineas arquitectonicas; barridos limpios. |
| Seguimiento | Tracking (follow / lead / side) | Acompanar un eje del cuarto avanzando, retrocediendo o de lado. | Pasillos, recorridos largos para edit con speed ramping. |
| Pies a cabeza | Toe-to-head / boot-up | Tilt desde el piso subiendo para presentar un cuarto o feature. | Apertura de un espacio destacado con dramatismo. |
| Whip pan | Whip pan | Paneo rapido y desenfocado usado como transicion. | Cortar entre cuartos en el edit con energia. |

Notas tecnicas (Osmo):
- Modo PTF (pan-tilt-follow) del gimbal para tilts verticales suaves sin joystick. (Aryeo / APAlmanac)
- Dos manos en el gimbal y caminata ninja para eliminar shake. (HomeJab / Shooting Spaces)
- Tomas largas e ininterrumpidas al cambiar de espacio: dan opciones de speed ramp y transiciones al editor. (DocFilm Academy)
- Graba SIEMPRE el reverso (push-in seguido de pull-out). (PhotoUp / HomeJab)

Fuentes A2: Aryeo (movimientos), HomeJab, APAlmanac (gimbal interiores), DocFilm Academy (8 movimientos de gimbal), SLR Lounge / BeverlyBoy (parallax y slider), Shooting Spaces.

---

## B) TOMAS RECOMENDADAS POR ESPACIO INTERIOR

Leyenda: [MUST] imprescindible · [NICE] recomendada. Campos: Toma | Tipo | Movimiento | En que enfocarte.

### Entrada / recibidor / foyer
1. [MUST] Push-in desde la puerta hacia el primer cuarto principal — Tipo: establecimiento/POV — Mov: caminata con gimbal (push-in) — Enfoca: encara la puerta y avanza para transicionar de afuera hacia adentro.
2. [MUST] Plano general del foyer — Tipo: plano general — Mov: fijo o slider corto — Enfoca: muestra el flujo hacia las demas areas, manten lineas rectas.
3. [NICE] Revelacion vertical de techo/candil — Tipo: contrapicado — Mov: revelacion vertical (tilt-up) — Enfoca: si hay doble altura o lampara, empieza bajo y sube.
4. [NICE] Detalle de acabado de entrada — Tipo: detalle/inserto — Mov: push-in lento — Enfoca: herreria, puerta, consola o piso de entrada.

### Sala / estancia
1. [MUST] Establecimiento de la sala completa — Tipo: establecimiento — Mov: caminata con gimbal entrando — Enfoca: captura todo el cuarto para que imaginen sus muebles dentro.
2. [MUST] Orbital sobre la zona de estar / chimenea — Tipo: plano medio — Mov: orbital — Enfoca: gira alrededor del foco (sillon o chimenea) manteniendo el centro.
3. [MUST] Paneo o slider mostrando ventanas y luz — Tipo: plano de ventana — Mov: paneo / slider lateral — Enfoca: protege las altas luces de la ventana, vende la luz natural.
4. [NICE] Parallax con mueble en primer plano — Tipo: plano general — Mov: parallax — Enfoca: deja un sillon cerca del lente para dar profundidad.
5. [NICE] Detalle de feature (chimenea, repisa) — Tipo: detalle — Mov: push-in — Enfoca: resalta el elemento estrella de la sala.

### Comedor
1. [MUST] Establecimiento con la mesa centrada — Tipo: establecimiento — Mov: fijo o push-in — Enfoca: composicion simetrica sobre el eje de la mesa.
2. [MUST] Orbital alrededor de la mesa — Tipo: plano medio — Mov: orbital — Enfoca: mantiene el centro de mesa como punto focal.
3. [NICE] Revelacion vertical del candil — Tipo: contrapicado — Mov: tilt-up reveal — Enfoca: si hay lampara colgante, subela como protagonista.
4. [NICE] Detalle de mesa puesta / vajilla — Tipo: detalle — Mov: push-in lento — Enfoca: vende el estilo de vida, no solo el mueble.

### Cocina
1. [MUST] Establecimiento de la cocina completa — Tipo: establecimiento — Mov: caminata con gimbal — Enfoca: gran angular 14-16mm, manten verticales rectas.
2. [MUST] Orbital o slider sobre la isla/barra — Tipo: plano medio — Mov: orbital / slider — Enfoca: la isla como punto focal; camara a la altura del pecho.
3. [MUST] Push-in a la zona de cocina (estufa/campana) — Tipo: plano medio — Mov: push-in — Enfoca: feature principal y electrodomesticos de gama.
4. [NICE] Detalle de acabados — Tipo: detalle/textura — Mov: paneo o tilt corto — Enfoca: cubierta, backsplash, herrajes, grifo.
5. [NICE] Plano de ventana sobre el fregadero — Tipo: plano de ventana — Mov: fijo — Enfoca: exposicion cuidada hacia la ventana.

### Recamara principal
1. [MUST] Revelacion tras umbral entrando — Tipo: revelacion — Mov: revelacion tras umbral (doorway reveal) — Enfoca: cruza la puerta para descubrir la recamara.
2. [MUST] Establecimiento del cuarto completo — Tipo: establecimiento — Mov: caminata con gimbal — Enfoca: muestra amplitud y luz; suficientes angulos en la suite.
3. [MUST] Orbital o push-in hacia la cama — Tipo: plano medio — Mov: orbital / push-in — Enfoca: cama como foco; encuadre limpio y simetrico.
4. [NICE] Plano de ventana / vista — Tipo: plano de ventana — Mov: paneo — Enfoca: vende la vista y la luz matinal.
5. [NICE] Transicion hacia bano/vestidor de la suite — Tipo: transicion — Mov: seguimiento (tracking) — Enfoca: toma larga para conectar la suite en el edit.

### Recamara secundaria
1. [MUST] Establecimiento del cuarto — Tipo: establecimiento — Mov: fijo o push-in corto — Enfoca: solo 2-3 tomas; muestra tamano y luz.
2. [MUST] Paneo desde una esquina — Tipo: plano general — Mov: paneo — Enfoca: camara baja para ver mas piso y menos techo.
3. [NICE] Plano de ventana — Tipo: plano de ventana — Mov: fijo — Enfoca: luz natural; expon para la ventana.

### Bano completo
1. [MUST] Paneo o tilt desde tripie — Tipo: plano general — Mov: fijo + paneo/tilt — Enfoca: usa tripie (no gimbal) para evitar aparecer en espejos.
2. [MUST] Detalle de feature (tina, regadera, doble lavabo) — Tipo: detalle — Mov: tilt o push-in — Enfoca: el elemento estrella del bano.
3. [NICE] Detalle de acabados — Tipo: textura — Mov: paneo corto — Enfoca: azulejo, grifos, herrajes; agachate para evitar reflejos.

### Medio bano
1. [MUST] Plano general unico — Tipo: plano general — Mov: fijo desde tripie — Enfoca: una sola toma limpia; cuida el espejo. Omite si no aporta valor.
2. [NICE] Detalle de acabado — Tipo: detalle — Mov: push-in corto — Enfoca: solo si el lavabo o tapiz es excepcional.

### Vestidor / closet
1. [MUST] Push-in o revelacion entrando — Tipo: revelacion/establecimiento — Mov: push-in / doorway reveal — Enfoca: el closet debe verse organizado, no vacio.
2. [NICE] Paneo mostrando capacidad — Tipo: plano general — Mov: paneo — Enfoca: resalta tamano y sistema de almacenamiento.
3. [NICE] Detalle de organizacion / isla de vestidor — Tipo: detalle — Mov: tilt o push-in — Enfoca: solo si es walk-in destacado; salta closets comunes.

### Estudio / home office
1. [MUST] Establecimiento del espacio — Tipo: establecimiento — Mov: caminata con gimbal o fijo — Enfoca: vende funcionalidad y luz para trabajar.
2. [NICE] Plano de ventana / escritorio — Tipo: plano de ventana — Mov: paneo / slider — Enfoca: luz natural sobre el area de trabajo.
3. [NICE] Detalle de built-ins / libreros — Tipo: detalle — Mov: tilt-up — Enfoca: estanteria empotrada o acabados de carpinteria.

### Cuarto de lavado
1. [MUST] Plano general — Tipo: plano general — Mov: fijo o push-in corto — Enfoca: layout, lavadora/secadora y almacenamiento; manten orden.
2. [NICE] Detalle de tarja / cubierta — Tipo: detalle — Mov: push-in — Enfoca: solo si tiene acabados o capacidad por encima del promedio.

### Pasillo / escaleras
1. [MUST] Seguimiento por el pasillo — Tipo: transicion/POV — Mov: seguimiento (tracking) / caminata con gimbal — Enfoca: movimiento lento y controlado; toma larga para el edit.
2. [MUST] Subida de escaleras con corte — Tipo: transicion — Mov: caminata con gimbal (push-in) — Enfoca: muestra los escalones y empieza a subir; corta antes de completar el tramo.
3. [NICE] Revelacion vertical del hueco de escalera — Tipo: contrapicado — Mov: tilt-up reveal — Enfoca: doble altura, barandal o candil sobre la escalera.
4. [NICE] Toma simetrica del pasillo — Tipo: simetrica — Mov: slider / push-in — Enfoca: centra el eje; lineas rectas y limpias.

### Family room / sala de TV
1. [MUST] Establecimiento del cuarto — Tipo: establecimiento — Mov: caminata con gimbal — Enfoca: amplitud y como conecta con cocina/sala.
2. [MUST] Orbital sobre la zona de estar — Tipo: plano medio — Mov: orbital — Enfoca: punto focal en el sillon o centro de entretenimiento.
3. [NICE] Parallax con mueble en primer plano — Tipo: plano general — Mov: parallax — Enfoca: profundidad y sensacion de espacio.
4. [NICE] Transicion hacia espacio contiguo — Tipo: transicion — Mov: seguimiento — Enfoca: liga el concepto abierto en el edit.

### Terraza / balcon
1. [MUST] Revelacion saliendo del interior — Tipo: revelacion/transicion — Mov: revelacion tras umbral (push-in cruzando la puerta) — Enfoca: pasa de interior a exterior cuidando exposicion.
2. [MUST] Plano general del exterior y vista — Tipo: plano de ventana/vista — Mov: paneo / slider — Enfoca: vende la vista, jardin o paisaje.
3. [NICE] Detalle de feature exterior — Tipo: detalle — Mov: push-in — Enfoca: mobiliario, asador, jardineria o piso de terraza.
4. [NICE] Parallax con barandal/planta en primer plano — Tipo: plano general — Mov: parallax — Enfoca: profundidad entre balcon y horizonte.

### Garaje / cochera
1. [MUST] Plano general del garaje — Tipo: plano general — Mov: fijo o push-in — Enfoca: capacidad (numero de autos), limpio y despejado.
2. [NICE] Seguimiento de entrada — Tipo: transicion — Mov: caminata con gimbal — Enfoca: conexion del garaje con el acceso interior.

### Bodega / cuarto de servicio
1. [MUST] Plano general — Tipo: plano general — Mov: fijo — Enfoca: capacidad de almacenamiento; orden y limpieza. Omite si no aporta valor.
2. [NICE] Detalle de instalaciones — Tipo: detalle — Mov: push-in corto — Enfoca: solo si tiene equipo o acabados relevantes.

---

## Reglas generales de captura (aplican a todo)
- Lente 14-16mm full frame: muestra layout sin distorsion excesiva. (HomeJab / Premiumbeat)
- Camara baja (por debajo de ~1.5m, a veces ~1.2m): mas piso, menos techo. (HDRsoft)
- Manten verticales rectas; solo inclina para vender altura de techo. (HomeJab)
- Banos: tripie en lugar de gimbal por los espejos. (Tips for RE Photography)
- Planea el recorrido: inicio, fin y como conecta cada cuarto antes de grabar. (HomeJab)
- 3 capas por cuarto: wide + medium + detalle. (Momentum / Insider RE Photography)
- Cuartos clave (cocina, sala, suite principal): mas angulos. Secundarios: 2-3 tomas. (Wyman Gentry)
- Graba siempre el reverso de cada movimiento. (PhotoUp)
- Cuida exposicion de ventanas (zebras / false color / monitor externo). (HomeJab)

---

## FUENTES (URLs)
Movimientos y gimbal:
- https://blog.aryeo.com/camera-movements-to-utilize-in-your-real-estate-videos/
- https://homejab.com/how-to-shoot-real-estate-video-pro-camera-gimbal-tips/
- https://apalmanac.com/gear/five-gimbal-movements-to-help-create-beautiful-interior-and-architecture-films-7882
- https://www.docfilmacademy.com/blog/cinematic-gimbal-techniques
- https://shootingspaces.net/technique/getting-smooth-gimbal-footage-for-real-estate-video/
- https://www.slrlounge.com/4-camera-movements-can-slider/
- https://beverlyboy.com/filmmaking/how-to-create-parallax-with-slider/
- https://www.premiumbeat.com/blog/how-to-achieve-perfect-dolly-shot/

Tipos de toma (cinematografia):
- https://www.studiobinder.com/camera-shots/framing/establishing-shot/
- https://cinema8.com/blog/types-of-camera-shots

Shot list inmobiliario y por cuarto:
- https://www.tipsforrealestatephotography.com/how-to/real-estate-video-equipment-settings/
- https://www.photoup.net/learn/how-to-shoot-a-real-estate-video
- https://www.momentumvirtualtours.com/how-to-shoot-real-estate-videos/
- https://www.insiderealestatephotography.com/post/how-to-make-professional-real-estate-videos
- https://www.wymangentry.com/store-1/real-estate-video-shot-list
- https://www.premiumbeat.com/blog/how-to-shoot-cinematic-real-estate-videos/
- https://www.format.com/magazine/resources/photography/real-estate-photography-tips
- https://www.hdrsoft.com/learn/best-height-for-shooting-real-estate-interiors.html
- https://blog.fulltimefilmmaker.com/how-to-shoot-real-estate-videos-top-10-tips/

---

# APÉNDICE B — Investigación: amenidades y tipos de propiedad (detalle)

# Biblioteca de tomas de video inmobiliario (a pie, camara Sony + gimbal Osmo)

Investigacion para checklist de rodaje. Tomas a pie con camara + gimbal (NO drone).
Terminos: wide (general), detalle (close-up), recorrido (walkthrough), reveal (revelado),
orbital (orbit), paneo (pan), tilt (cabeceo arriba/abajo), push-in (acercarse),
pull-out (alejarse/reveal hacia atras), tracking (seguimiento lateral), pedestal/boom
(subir-bajar vertical), parallax (movimiento lateral con primer plano).
Tecnica base de caminata: "ninja walk" (rodillas flexionadas, paso suave).
Regla de tres por espacio: minimo 1 wide + 1 medio + 1 detalle.

---

## ENTREGABLE A — TOMAS RECOMENDADAS POR AMENIDAD

Campos por toma: descripcion | tipo | movimiento | enfocarte en | must/nice

### Alberca / Piscina
1. Reveal del agua | reveal | gimbal pull-out desde detalle del agua abriendo a la alberca completa | reflejo y color del agua, calma | must
2. Recorrido del borde | recorrido | tracking lateral caminando por el camellon | continuidad y tamano real del vaso | must
3. Orbital de tumbonas/camastros | recorrido/orbital | orbital lento alrededor del area de descanso | estilo de vida, mobiliario, sombra | nice
4. Detalle de agua/escalones | detalle | fijo o micro push-in | textura del agua, acabado de piso antiderrapante | nice
5. Wide ambiental al atardecer | wide | fijo o paneo muy lento | luz, amplitud, entorno | must

### Jacuzzi
1. Reveal con tilt up | reveal | gimbal low-mode tilt up desde el agua a la vista | burbujas, vapor, vista que acompana | must
2. Detalle de jets/espuma | detalle | fijo | sensacion de relajacion, acabados | must
3. Orbital corto | orbital | orbital 90-180 grados | integracion con terraza/alberca | nice

### Gimnasio
1. Recorrido de entrada | recorrido | ninja walk push-in entrando al area | amplitud, equipamiento completo | must
2. Tracking frente a maquinas | recorrido | tracking lateral pasando equipos | variedad y estado del equipo | must
3. Detalle de pesas/cardio | detalle | fijo o micro push-in | calidad de marca del equipo | nice
4. Wide con espejo/ventanal | wide | fijo | luz natural, sensacion de espacio | must

### Salon de eventos / Usos multiples
1. Reveal de apertura | reveal | gimbal pull-out desde puerta abriendo al salon | capacidad y altura | must
2. Recorrido central | recorrido | ninja walk al centro con paneo lento | flexibilidad del espacio vacio | must
3. Detalle de cocineta/barra/bano | detalle | fijo | servicios incluidos del salon | nice
4. Tilt up a doble altura/lamparas | reveal | tilt up | elegancia, altura libre | nice

### Lobby / Recepcion
1. Push-in de ingreso | recorrido/reveal | ninja walk push-in cruzando la puerta principal | primera impresion, doble altura | must
2. Orbital del area de estar | orbital | orbital lento alrededor de sala de espera | acabados, lujo, limpieza | must
3. Detalle de mostrador/material noble | detalle | fijo o micro push-in | marmol, madera, herreria, logo | nice
4. Tilt up del vestibulo | reveal | tilt up | altura y diseno arquitectonico | nice

### Roof garden / Terraza en azotea
1. Reveal de la vista | reveal | gimbal pull-out o tilt up revelando skyline | vista panoramica como argumento de venta | must
2. Recorrido del deck | recorrido | tracking caminando por el area social | mobiliario, fogata, areas de estar | must
3. Orbital de la zona lounge | orbital | orbital al atardecer (golden hour) | ambiente, estilo de vida | must
4. Detalle de pergola/firepit | detalle | fijo | acabados de exterior | nice

### Jardin / Areas verdes
1. Recorrido por sendero | recorrido | ninja walk siguiendo el andador | tamano y mantenimiento del verde | must
2. Reveal a traves de vegetacion | reveal | parallax pasando junto a follaje en primer plano | profundidad, frescura | nice
3. Wide del area completa | wide | paneo lento | extension de las areas verdes | must
4. Detalle de jardineria/flores | detalle | fijo o micro push-in | cuidado y diseno paisajista | nice

### Asadores / Area de BBQ
1. Recorrido de la zona | recorrido | tracking frente a los asadores | numero de estaciones, equipamiento | must
2. Detalle del asador/parrilla | detalle | fijo o micro push-in | calidad del equipo, acabado en piedra | must
3. Reveal con mesas | reveal | pull-out desde asador a comedor exterior | convivencia, capacidad | nice

### Cancha (tenis / padel / multiusos)
1. Wide de cancha completa | wide | fijo o paneo lento | dimensiones reglamentarias, estado | must
2. Recorrido perimetral | recorrido | tracking caminando por la linea de fondo | iluminacion, mallas, superficie | must
3. Detalle de superficie/lineas | detalle | fijo o tilt down | calidad del piso/cristales (padel) | nice
4. Reveal desde acceso | reveal | push-in entrando a la cancha | sorpresa de la amenidad | nice

### Area infantil / Juegos
1. Wide del area de juegos | wide | fijo o paneo lento | variedad de juegos, seguridad | must
2. Recorrido entre juegos | recorrido | ninja walk entre estructuras | piso amortiguante, mantenimiento | must
3. Detalle de un juego | detalle | fijo o micro push-in | materiales, color, estado | nice

### Business center / Coworking
1. Recorrido de entrada | recorrido | ninja walk push-in | ambiente profesional, mobiliario | must
2. Tracking de estaciones de trabajo | recorrido | tracking lateral | conectividad, salas privadas | must
3. Detalle de sala de juntas/cabina | detalle | fijo | privacidad, tecnologia | nice

### Spa / Sauna
1. Reveal de ingreso | reveal | gimbal pull-out abriendo al area humeda | ambiente de relajacion | must
2. Detalle de sauna/vapor | detalle | fijo (cuidar lente con vapor) | madera, calidad, iluminacion calida | must
3. Recorrido de cabinas/area de masaje | recorrido | ninja walk lento | privacidad, lujo | nice

### Estacionamiento / Cajones
1. Recorrido por el pasillo | recorrido | tracking o push-in por la circulacion | amplitud de cajones, iluminacion | must
2. Wide del nivel | wide | fijo o paneo | numero de cajones, orden, senalizacion | must
3. Detalle de cajon/numero | detalle | fijo | medida del cajon, demarcacion | nice
4. Reveal de rampa/acceso vehicular | reveal | push-in | facilidad de maniobra | nice

### Elevadores / Accesos
1. Push-in al elevador | recorrido | ninja walk entrando a la cabina | acabados, limpieza, capacidad | must
2. Detalle de botonera/numero de pisos | detalle | fijo | numero de niveles, tecnologia | nice
3. Recorrido de control de acceso | recorrido | tracking en el filtro de seguridad | seguridad, casetas, torniquetes | must

### Palapa
1. Reveal con tilt up | reveal | tilt up desde el piso a la estructura de palma | altura y artesania del techo | must
2. Orbital de la zona social | orbital | orbital alrededor de la sala/comedor bajo palapa | convivencia, frescura, sombra | must
3. Detalle de la palma/vigas | detalle | tilt up corto o fijo | autenticidad y estado del techo | nice
4. Reveal hacia la vista | reveal | pull-out de palapa hacia alberca/naturaleza | integracion con el entorno | nice

### Area de mascotas
1. Wide del area | wide | fijo o paneo | tamano del area canina, cercado | must
2. Recorrido perimetral | recorrido | tracking caminando el contorno | superficie, sombra, agua | must
3. Detalle de estacion/lavado de mascotas | detalle | fijo | servicios extra (pet spa) | nice

---

## ENTREGABLE B — TOMAS Y ENFOQUE POR TIPO DE PROPIEDAD (a pie, no drone)

Campos por toma: descripcion | tipo | movimiento | enfocarte en | must/nice

### Departamento / Condominio
Enfasis de venta: VISTA, distribucion/flujo, amenidades del edificio.
1. Llegada al edificio + acceso | recorrido | ninja walk push-in desde la calle al lobby | ubicacion, seguridad, primera impresion | must
2. Recorrido elevador a puerta | recorrido | tracking corto (elevador, pasillo, puerta) | la rutina diaria de llegar al depto | nice
3. Recorrido de distribucion | recorrido | ninja walk continuo entrada-sala-cocina-recamaras | flujo y conexion entre espacios | must
4. Reveal de la VISTA por ventanal | reveal | pull-out o tilt desde interior hacia ventana/balcon | la vista como principal argumento, orientacion (norte/sur) | must
5. Detalle de acabados | detalle | fijo o micro push-in | cocina, banos, pisos, herrajes | must
6. Bloque de amenidades del edificio | recorrido | usar tomas del Entregable A (alberca, gym, roof) | lo que incluye la cuota, estilo de vida | must

### Terreno / Lote sin construir (lo grabable a pie)
Enfasis de venta: dimensiones, accesos, entorno, hitos del lote.
1. Recorrido del frente del lote | recorrido | tracking caminando todo el frente | metros de frente, forma del terreno | must
2. Recorrido perimetral / linderos | recorrido | ninja walk siguiendo cada lindero, mostrando mojoneras | dimensiones y limites reales del lote | must
3. Reveal del acceso/calle | reveal | push-in desde la vialidad hacia el lote | tipo de calle, accesos, conexion | must
4. Wide del entorno / vecindario | wide | paneo lento 180-360 grados desde el centro del lote | que se construye alrededor, plusvalia, entorno | must
5. Detalle de hitos | detalle | fijo | servicios (postes de luz, tomas de agua, banqueta), topografia, vegetacion existente | nice
6. Recorrido de la profundidad (fondo) | recorrido | push-in del frente al fondo | sensacion de la dimension total caminada | nice

### Quinta / Rancho / Finca campestre
Enfasis de venta: areas sociales, naturaleza, palapa, alberca, capilla, establos.
1. Recorrido de acceso/portico | recorrido | ninja walk push-in desde el porton/camino de entrada | grandeza, privacidad, llegada | must
2. Orbital del area social principal | orbital | orbital alrededor de palapa/terraza/sala exterior | convivencia, capacidad para eventos | must
3. Reveal de la alberca y jardin | reveal | pull-out desde detalle a wide de alberca + verde | descanso, naturaleza, amplitud | must
4. Recorrido por la naturaleza | recorrido | tracking por senderos/arboles con parallax de follaje | entorno natural, arboles, frescura | must
5. Detalle de capilla / establos | detalle + recorrido | push-in a la capilla; tracking frente a caballerizas | caracteristicas unicas que diferencian la finca | must
6. Wide ambiental golden hour | wide | fijo o paneo lento al atardecer | atmosfera, estilo de vida campestre | nice

### Local / Propiedad comercial
Enfasis de venta: fachada, flujo, escaparate, areas de cliente.
1. Reveal de fachada | reveal | tracking o pull-out frente a la fachada | visibilidad desde la calle, senalizacion, escaparate | must
2. Recorrido de ingreso (flujo) | recorrido | ninja walk push-in cruzando la entrada al interior | facilidad de acceso, flujo de clientes | must
3. Recorrido del area de cliente | recorrido | tracking continuo por el piso de venta/atencion | layout, metros utiles, flexibilidad del espacio | must
4. Wide del espacio diafano | wide | paneo lento | amplitud, altura libre, columnas | must
5. Detalle de instalaciones | detalle | fijo | banos, bodega, area de carga, instalaciones especiales, cortina/acceso | nice
6. Wide de estacionamiento/entorno | wide | fijo o paneo | cajones, afluencia de la zona, vialidades | must

---

## NOTAS DE PRODUCCION (Sony + gimbal Osmo)
- Hora dorada (golden hour) para exteriores: alberca, roof, palapa, rancho, fachada.
- Cuidar vapor en spa/sauna/jacuzzi (limpiar lente entre tomas).
- En terreno/comercial, los wide de entorno sustituyen al drone para dar contexto.
- Cada espacio: regla de tres (wide + medio + detalle) como minimo.
- Movimientos lentos y constantes; ninja walk para todo recorrido a pie.

## FUENTES (URLs por seccion)
General / tomas / gimbal:
- https://homejab.com/how-to-shoot-real-estate-video-pro-camera-gimbal-tips/
- https://www.momentumvirtualtours.com/how-to-shoot-real-estate-videos/
- https://www.bhphotovideo.com/explora/video/tips-and-solutions/15-cinematic-gimbal-moves-for-your-films-and-videos
- https://iluminre.com/best-gimbal-settings-for-smooth-real-estate-videos/
- https://www.docfilmacademy.com/blog/cinematic-gimbal-techniques
- https://esoft.com/resources/blog/real-estate-video-production-guide

Departamento / condominio / amenidades:
- https://vuereka.com/blog/youtube-video-ideas-for-apartment-tours
- https://redoakproperties.com/blog/what-look-whenc2a0-watching-video-tour-apartment/
- https://www.theparkwardvillage.com/amenities/
- https://liveonethousandone.com/amenities/

Terreno / lote:
- https://benaccinelli.com/what-is-the-best-way-to-sell-vacant-land/
- https://retipster.com/real-estate-sales-videos/

Rancho / finca:
- https://www.mrhevia.com/ranch-photography-video
- https://robbreport.com/shelter/auctions/rancho-el-salto-mexico-city-auction-1235586671/

Comercial:
- https://vidtech.com/cre-videos-for-retail/
- https://www.kpi-creatives.com/sps-5/commercial-real-estate-video-production
- https://shoot2sell.com/commercial-real-estate-photography-services

---

# RONDA 2 — Fixes de campo (tras prueba visual)

Decisiones del usuario:
- **Editor de biblioteca:** modo aparte **SIN token** (`checklist.html?config=1`), protegido por contraseña de admin; se usa en escritorio, no en campo. **Quitar el engrane** del checklist de trabajo.
- **IA:** sigue proponiendo **solo tomas** (no cuartos), con **prompt reforzado**.
- **Ordenar recorrido:** **agrupado y ordenado por piso**, con el piso visible.

Fases (continúan la numeración como G1..G5; un commit por fase, mismas reglas y gates):
- **G1 · Logic: prompt IA reforzado.** Reescribe `buildPropuestaPrompt` con reglas duras: (a) basarse ESTRICTAMENTE en la descripción; prohibido inventar muebles/features/condiciones que no se mencionan; (b) `enfoque` solo sobre encuadre/composición — NADA de hora del día, clima, iluminación ni logística; (c) solo cuartos de la lista (no inventar cuartos); (d) proponer solo lo genuinamente específico de la propiedad (no repetir wides genéricos); si un cuarto no tiene nada especial, no proponer nada; (e) usar SOLO ids del vocabulario cerrado; (f) responder SOLO JSON. Test: el prompt incluye las cláusulas clave y la estructura.
- **G2 · UI: des-picar sugerencia.** `seleccionarSugerencia(id)` debe **alternar**: si `activeSugId===id`, ponerlo en `null` (vuelve a "toma libre"); si no, fijarlo. 
- **G3 · UI: ordenar recorrido por piso.** `abrirOrdenarRecorrido` agrupa por piso (encabezado por piso), se ordena **dentro** de cada piso, y el recorrido global = pisos en su orden + cuartos en su orden dentro del piso. El piso es visible. Ajustar `moverRecorrido`/`recorridoTargets` para respetar el piso (no mover un cuarto fuera de su piso).
- **G4 · Demo: reinicio fácil.** Botón **"Reiniciar demo"** visible solo con `?demo=1` que limpia el estado demo de localStorage y recarga datos frescos. Enriquecer un poco la data demo (más cuartos/escenarios).
- **G5 · Config sin token + quitar engrane.** Modo `?config=1` (sin token) que arranca directo el **editor de biblioteca**: carga `obtenerConfigGuia`, `applyGuideConfig`, renderiza el panel de config full-screen, gated por `ensureAdminKey`. **Quita** el engrane/`abrirConfigGuia` del checklist de campo (modo guiado). El editor reusa `renderConfigGuia` existente.
