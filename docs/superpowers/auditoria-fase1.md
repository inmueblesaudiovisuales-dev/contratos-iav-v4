# Auditoría — Fase 1 (checklist.html / checklist-logic.js)

**Fecha:** 2026-06-07
**Rama:** `checklist-cambios-2026-06-07`
**Auditor:** sesión de auditoría (no modifica código)
**Fuentes de verdad:** visión `2026-06-07-checklist-rediseno-vision-design.md`, plan F1–F13
`2026-06-07-checklist-fase1-plan.md`, mockups `checklist-mockups/*.html`.
**Estado de tests:** `node --test frontend/checklist-logic.test.js` → **127 pass, 0 fail**.

> Método: se verifica no solo que la función exista, sino que sea **alcanzable** por el usuario
> (que haya un control en la UI que la invoque y que el flujo de render llegue). "Existe la función"
> no cuenta como HECHO si el usuario no puede llegar a ella.

---

## (a) Tabla resumen por requisito

| # | Requisito acordado | Estado | Evidencia (archivo:línea) | Nota |
|---|---|---|---|---|
| 1 | **Drone alcanzable en el loop** | **ROTO** | `checklist.html:2209`, `:837`, `:854`, `:2146`, `:1305-1316` | El switch filtra `c.mode === state.modoActual`; el rol de Bruno fija `modoActual='video'` y **no hay ningún control vivo** que ponga `modoActual='drone'`. Detalle abajo. |
| 2 | **"+foto" del drone** (`agregarFotoDrone`/`bumpCameraCounter`) | **ROTO** | `checklist.html:2216-2218`, `:2317-2322`; logic `bumpCameraCounter` (test F3 verde) | El botón "+ foto" solo se renderiza si `isDrone && nextTok`; como el modo drone es inalcanzable, el botón nunca aparece. La lógica está bien y testeada, pero es inalcanzable. |
| 3 | **Favorita** (captura + edición; favorita⇒buena; viaja al export) | **HECHO** | captura `:2284`, `:2324-2327`; edición `:3825`, `toggleFavoritaEdit`; logic `toggleMediaFavorite` (test F1 verde); export `version:1` `logic:1902` | Favorita en ambas vistas, fuerza `good`, y `buildExport` agrega el campo manteniendo `version:1`. |
| 4 | **3 capas en el loop** (tipo + movimiento + descripción) | **HECHO** | `:2226-2268` (chips tipo + movimiento al expandir), `:2278-2280` (describir), `:2311-2314` etiqueta la toma | Tipo desde `suggestionsForTarget`, movimiento al expandir, nota libre en la toma. |
| 5 | **"No sirve" = 1 toque, sin diálogo ni banner; corregir tocando** | **HECHO** | `:3038-3040` (1 toque), corregir vía `:2271-2289` / `abrirArchivo` | Sin "¿por qué?" ni banner de deshacer en el fallo. |
| 6 | **Sin auto-avance / sin promptBuena / sin aprendiz-cheatsheet** | **HECHO** | reset de pendientes `:registrarArchivo` ("No auto-avance"); `grep` de `promptBuena`/`avanzarSugerencia`/`aprendiz`/`cheatsheet` = 0 | Eliminados. |
| 7 | **Modo cuartos** (vacío, chips, 1 toque, deshacer, sub-cuartos, tipo sesga, quinta) | **HECHO** | vacío `:1141`; chips `:1546-1552`; quitar 1 toque + deshacer `:1600-1613`; sub-cuartos `:1581-1596` (heredan piso); tipo sesga `suggestionsForSpace`/`suggestionsForDrone` | Sub-cuartos crean, heredan `parent.piso`, se renderizan anidados. |
| 7b | **¿Danna/Fernanda pueden entrar a Armar cuartos?** | **HECHO** | gear en cobertura `:1958` (`cov-edit` → `abrirSetup()`); modal de rol `:1244`; `abrirSetup` sin gate de rol `:1525` | Cobertura de Fer/Danna tiene botón "Armar cuartos"; también desde el chip de rol. Acceso confirmado. |
| 8 | **Navegación por rol** (barra solo Bruno; cobertura sin barra; chip cambiable) | **HECHO** | barra `:1153` (`showBotnav = bruno`), `:1305-1317`; chip `:1209-1213`, `abrirCambiarRol` `:1237` | Barra Captura·Cierre·Edición solo para Bruno; Fer/Danna sin barra; chip cambia rol. |
| 9 | **Cobertura** (ciclo pend/listo/no aplica por servicio; resumen) | **HECHO** | `cycleCobertura` `:1981-1990`; resumen `:1956-1962` | El servicio sale del rol (`state.modoActual`); resumen "N pendientes". |
| 10 | **Cierre** (semáforo, faltantes, conciliación por cámara, línea de tiempo, gate) | **PARCIAL** | semáforo `:3567-3580`; faltantes `:3582`; conciliación `:3606-3621`; timeline `:3624-3636`; gate `:2340`, `:3601` | Todo presente y bien armado. Parcial solo porque la conciliación/timeline del **drone nunca tiene archivos** (consecuencia del #1): no hay forma de generar tomas de drone, así que esa columna queda siempre vacía. |
| 11 | **Edición** (servicio→piso→cuarto, editable, export `version:1`, responsive escritorio) | **HECHO** | agrupado `:3762-3795`; filas editables `:3815-3833`; export `:3670-3683` (`version:1`); responsive `@media (min-width:1024px)` `:244-247` | Grid de escritorio para `.edit-svc-rooms`. |
| 12 | **Offline-first** (boot localStorage, poll tolerante, reintento, foco) | **HECHO (con caveat)** | boot espejo `:1030-1042`, `:1056-1067`; poll preserva estado/ foco `:1077-1098`; reintento backoff `:1007-1017`; mirror siempre `:934-937`, `:1052` | Sólido. **Caveat:** íconos Tabler y fuentes vienen de CDN (`:9-10`); sin red en la primera visita los íconos no cargan. Documentado abajo. |
| 13 | **Cámaras en editor `?config=1`** (alta por ejemplo + preview; persiste en guia_config) | **HECHO** | `renderConfigCamaras` `:2758-2799`; `parseFilenameSequence`+preview `:2820-2824`, `:2771-2774`; persiste `:2959-2966` (`clave:'guia_config'`) | No toca el worker; guarda en `guia_config`. |
| 14 | **Contratos** (export `version:1`, backend intacto, estado viejo carga) | **HECHO** | export `logic:1902`; `normalizeChecklistData` acepta v2/v3/legacy `logic:1044-1169`; migración droneItems `logic:1033-…` (test F2 verde); worker sin tocar | Compatibilidad hacia atrás cubierta y testeada. |
| 15 | **Función huérfana / código muerto** | **PARCIAL (huecos)** | `renderModeArea` `:1351`, `renderHeader` `:1179`, `renderTabs` `:1382`, `renderCameraStrip` `:1370` (definidas, nunca llamadas); `abrirLane`/`chooseLane`/`setMode` solo invocadas desde código muerto; refs vivas a `state.droneItems` `:1994`,`:2032`,`:2038`,`:3043-3047` | F13 no terminó la limpieza. Detalle abajo. |

**Conteo:** HECHO **10** · PARCIAL **3** (#10, #12 con caveat, #15) · ROTO **2** (#1, #2) · FALTANTE **0**.

---

## Detalle del bloqueante: drone inalcanzable (#1 y #2)

**Flujo real para Bruno:**
1. `setRole('bruno')` → `applyRoleService()` → `state.modoActual = ROLE_DEF.bruno.service` = **`'video'`**
   (`checklist.html:837`, `:851-856`).
2. Entrar a un cuarto → `renderActiveView` → `renderCaptureView` → `isMediaMode()` true →
   `renderMediaCapture` (`:1649-1652`, `:2141`).
3. `isDrone = state.modoActual === 'drone'` → **siempre `false`** (`:2146`).
4. El switch de cámara: `logic.getCameras(state).filter(c => c.mode === state.modoActual)` =
   `filter(c => c.mode === 'video')` → solo Sony principal y Osmo; la cámara `drone-dji`
   (`mode:'drone'`, `logic:11`) **nunca aparece** (`:2209`).
5. El botón "+ foto" solo se pinta con `isDrone && nextTok` → **nunca** (`:2216-2218`).

**¿Hay otra forma de cambiar a drone?** No en la UI viva. `setMode('drone')` existe (`:3252`)
pero solo se invoca desde `renderModeArea` (`:1354`) y desde el modal de `abrirLane` (`:1345`),
y **ambas son código muerto** (ver #15): `renderModeArea` no se llama; `abrirLane` solo se llama
desde `renderHeader` (`:1187`), que tampoco se renderiza (lo reemplazó `renderShellHeader`,
`:1200`). Conclusión: con el shell nuevo (F5), el modo drone quedó sin punto de entrada.

**Choque de diseño rol↔modo↔servicio.** El modelo actual fija **un solo `modoActual` por rol**
(`applyRoleServiceOn`, `:851`). Eso funciona para Fer (foto) y Danna (t360), que tienen un único
servicio. Pero Bruno es **video + drone**: necesita alternar dos modos en el mismo cuarto. El
modelo "un modoActual por rol" choca con eso. El mockup `02-loop-captura.html` ya lo anticipa:
muestra un segmented control **"Sony | Drone"** dentro del loop (`02-loop-captura.html:112`), es
decir, el switch superior **no es un selector de cámaras del mismo modo, es un selector de modo**
(video vs drone) que de paso elige la cámara de ese modo.

**Fix mínimo propuesto (#1):** que el switch superior del loop sea por **modo**, no filtrado por
`modoActual`. En `renderCapCamSwitch` mostrar las cámaras de **video + drone** juntas (o un toggle
Sony/Drone como el mockup); al tocar la cámara/segmento de drone, `setCamera` (o un nuevo
`setLoopMode`) debe poner `state.modoActual='drone'` y seleccionar `activeCameraByMode.drone`;
al volver a Sony, `modoActual='video'`. Así `isDrone` se vuelve `true`, aparece "+ foto"
(#2 se arregla solo), y `darToma`/`registrarArchivo` registran contra la cámara de drone
(que comparte espacios tras F2). Mantener el rol de Bruno como "dueño de video+drone": el rol
habilita **ambos** modos; el switch del loop elige cuál está activo ahora.

---

## (b) Huecos a corregir (priorizados)

### Bloqueantes
1. **Drone inalcanzable en el loop (#1).** El switch filtra por `modoActual`, que el rol de Bruno
   fija en `'video'`, y no hay control vivo que cambie a `'drone'`. Fix: switch por modo (video+drone)
   en `renderCapCamSwitch` (`:2208`) que, al elegir drone, ponga `modoActual='drone'`. Ver detalle
   arriba.
2. **"+ foto" del drone inalcanzable (#2).** Depende del anterior: el botón se pinta solo en modo
   drone (`:2216`). Se arregla al resolver el #1; verificar después que mueve el token y no crea toma.

### Importantes
3. **Cierre/timeline de drone siempre vacíos (#10).** Como no se generan tomas de drone, la
   conciliación y la línea de tiempo de la cámara de drone nunca tienen archivos. Es secundario al
   #1, pero debe verificarse explícitamente tras el fix: provocar tomas de drone y ver que aparecen
   en la conciliación por cámara (`:3606`) y en el gate (`abrirGateSalida` ya contempla drone,
   `:2342-2349`).
4. **Referencias vivas a `state.droneItems` tras F2 (#15).** F2 eliminó `droneItems` como entidad,
   pero quedan ramas que aún lo leen cuando `modoActual==='drone'`: `activeTarget` (`:1994`),
   `recorridoTargets` (`:2032`), `esPendiente` (`:2038`) y `abrirCambiarCuarto` (`:3043-3047`).
   Hoy `normalizeChecklistData` deja `droneItems=[]` (`logic:1036`), así que **no crashea**, pero al
   habilitar el modo drone (fix #1) estas ramas operarían sobre una lista vacía/equivocada en vez de
   `state.espacios`. Fix: en esas cuatro ramas, cuando el modo es drone usar `state.espacios`
   (consistente con `targetsForMode`, `logic:1239`).

### Menores
5. **Código muerto de la UI vieja no removido en F13 (#15).** `renderModeArea` (`:1351`),
   `renderHeader` (`:1179`), `renderTabs` (`:1382`), `renderCameraStrip` (`:1370`) están definidas y
   nunca se llaman; arrastran a `abrirLane`/`chooseLane`/`setMode`/`abrirCamaras` como código
   muerto. Fix: eliminarlas (cuidando de reubicar `setMode`/`setCamera` si el fix #1 los reutiliza).
6. **Caveat de íconos/fuentes por CDN offline (#12).** Tabler y Google Fonts vienen de CDN
   (`:9-10`). Offline en primera visita (sin caché) los íconos no se ven. La app sí funciona; es
   cosmético. Documentarlo y, si se quiere robustez total offline, autoalojar el webfont más
   adelante (fuera del alcance estricto de F1).
7. **`renderCoberturaFoco` efectivamente muerto para Bruno (#15, menor).** Vive (`:1658`) pero su
   ruta (`renderCaptureView`→cobertura) no se alcanza para Bruno porque `isMediaMode()` siempre gana.
   No molesta; anotado por completitud.

---

## (c) Lo que SÍ quedó sólido

- **Motor (Bloque A):** F1 favorita⇒buena + export, F2 migración droneItems→espacios (sin perder
  archivos ni consecutivos), F3 `bumpCameraCounter`, F4 `getCameras`/config de cámaras — todo con
  **tests verdes (127/127)** y export firme en `version:1`.
- **Modo cuartos (F6):** arranca vacío, chips de un toque, quitar de un toque con **deshacer**,
  **sub-cuartos** que heredan piso, tipo de propiedad que sesga sugerencias, categoría corregible.
  El acceso para Danna/Fernanda está resuelto (gear en cobertura + modal de rol).
- **Loop de captura (F7), salvo drone:** las 3 capas (tipo/movimiento/descripción), favorita y buena
  de un toque sin scroll, "No sirve" de un toque sin diálogo ni banner, corregir tocando la toma,
  sin auto-avance, sin promptBuena, sin aprendiz/cheatsheet.
- **Navegación por rol (F5):** abre en la propiedad, chip de rol discreto y cambiable, barra inferior
  solo para Bruno, cobertura sin barra para Fer/Danna.
- **Cobertura (F8), Cierre (F9 — para video), Edición (F10):** completas; edición agrupada
  servicio→piso→cuarto, editable, responsive a 1024px, export `version:1`.
- **Offline-first (F11):** boot desde espejo local, poll que no pisa cambios locales ni el cursor,
  reintento con backoff, mirror en cada carga/guardado. Bien diseñado (solo el caveat de íconos CDN).
- **Editor de cámaras (F12):** alta por ejemplo de archivo con preview del siguiente token,
  persistencia en `guia_config` sin tocar el backend.
- **Contratos / compatibilidad (F14 invariantes):** worker intacto, `normalizeChecklistData` carga
  estado viejo, `buildExport` sigue en `version:1` (lo consume la app de Mac).

**Resumen ejecutivo:** la Fase 1 está mayormente entregada y sólida en motor, cuartos, captura
(2D), cierre, edición y offline. El **único bloqueante real es que el drone no es operable**: el
switch de cámara filtra por un `modoActual` que el rol de Bruno fija en `'video'`, sin punto de
entrada vivo al modo drone. Es un choque del modelo "un modo por rol" con que Bruno sea video+drone;
el mockup ya señalaba el switch correcto (Sony|Drone como selector de modo). Resolverlo desbloquea
también el "+foto", la conciliación de drone, y limpia las referencias huérfanas a `droneItems`.
