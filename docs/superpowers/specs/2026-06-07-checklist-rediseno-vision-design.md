# Visión — Rediseño total de `checklist.html` (bitácora de producción)

**Fecha:** 2026-06-07
**Rama:** `checklist-cambios-2026-06-07`
**Estado:** visión aprobada en brainstorming (mockups revisados con Bruno). Pendiente: specs por fase.

Este documento es el **marco**. No es un plan de implementación: define el modelo mental, la
estructura, el modelo de datos y el alcance por fases. Cada fase tendrá su propio spec + plan.

---

## 1. Contexto y meta

Bruno usó la app en campo y **no puede operarla solo** en su estado actual. Problemas reales:
marcar "buena" exige scroll; una toma "fallida" no se corrige fácil; la sugerencia siguiente se
auto-aplica y estorba; banners de "deshacer" e interrogatorio de "¿por qué salió mal?" molestan;
el drone es una entidad separada cuando debería compartir escenas con la cámara; no se puede
describir una toma en campo (encuadre/movimiento); las sugerencias de IA están rotas; armar
cuartos es un dolor (vienen rellenos, borrar cuesta dos clics; los sub-cuartos fallaban); la UI
está saturada y las vistas no se entienden; sin señal la app no funciona.

**Mandato:** rediseño extremo, sin límites, aunque el resultado no se parezca a la versión actual.
Diseñar lo ideal para el negocio, que funcione excelente siempre.

**North star:** *"casi invisible en campo, indispensable en edición"*. Prioridad absoluta:
eficiencia y claridad. Cada acción frecuente = 1 toque, operable con un pulgar, difícil
equivocarse. **Nada de vistas escondidas por mal diseño.** Legible en exteriores con sol (contraste
alto, toques grandes).

## 2. Negocio y workflow (contexto que rige el diseño)

- Equipo de **3, los tres en cada sesión**, cada quien dueño de un servicio:
  - **Fernanda** → fotografía.
  - **Danna** → recorrido virtual 360.
  - **Bruno** → video + drone (video y fotos con drone).
- Cámaras reales: **Sony FX30** (video), **Osmo Pocket 3**, **DJI Air 3** y **DJI Mini 4 Pro**
  (drones). El modelo debe permitir **agregar cámaras en el futuro** (lista configurable, no fija).
  Entregables al cliente: **Fotos (JPG) + Video (MP4)**; el 360 es el recorrido inmersivo aparte.
- Las **fotos de drone** importan **solo** porque comparten el consecutivo físico de la tarjeta con
  los videos de drone: mueven el número del **siguiente video**. No se catalogan como entregable.

## 3. El marco (modelo mental)

- **La app abre en LA PROPIEDAD** (la sesión / folio), no en "¿qué vas a hacer?".
- **Acceso por link de sesión.** El admin genera/comparte el **link de la propiedad del día**; los 3
  lo abren en su celular y caen en la misma sesión sincronizada. Cada quien elige su rol. El link
  queda cacheado offline para seguir trabajando sin señal.
- **Una sola propiedad compartida y sincronizada.** Los 3 celulares ven los mismos cuartos. Quien
  sea (típicamente Danna) **arma los cuartos** y a Fer y a Bruno les aparecen al instante.
- **Rol por celular, discreto y cambiable.** Un chip en la esquina dice quién eres; tocarlo cambia
  de rol. Reemplaza la pantalla de "elige servicio". El celular recuerda el rol.
- **La vista depende del rol** — misma propiedad, distinta herramienta.
- **Offline-first** (ver §9).

| Rol | Vista | Mecánica | Navegación |
|---|---|---|---|
| Fernanda (foto) / Danna (360) | **Cobertura** | Rejilla de cuartos por piso; un toque cicla pendiente → listo → no aplica. Sin cámara ni consecutivos. | Sin barra inferior. Faltantes se ven en la propia rejilla (resumen "N pendientes"). |
| Bruno (video + drone) | **Captura** | Lista de cuartos por piso → entras a uno → loop de cámara. | Barra inferior: **Captura · Cierre · Edición**. |

## 4. Modelo de datos (cambios de fondo)

Aditivos y compatibles hacia atrás (el estado viejo debe seguir cargando). El backend
(`worker/src/routes/checklist.js`, blob `cuartos_json`) **no se toca**. El **export se mantiene en
`version:1`** (lo consume la app de Mac `iav-metadata-app`).

1. **Espacios unificados.** Se elimina `droneItems`. El drone usa la **misma lista de espacios** que
   las demás cámaras. Lo aéreo (órbita, cenital, fly-through, reveal) es **tipo de toma / movimiento**,
   no una entidad. Lo que no es un lugar (entorno, colonia, vialidades, terreno completo, perímetro)
   vive como **espacios descriptivos** en el piso "Exterior". Migración determinista de `droneItems`
   existentes a espacios.
2. **Favorita además de buena.** Hoy solo existe `good`. Se agrega `favorite`. **Buena** = sirve;
   **favorita** = la que más gustó. **Favorita implica buena** (un gesto para "la mejor"). La favorita
   **viaja al export** de forma aditiva (sin romper `version:1`) para aprovecharla en edición.
3. **Tres capas por toma, todas opcionales:** **tipo** (shotType), **movimiento** (movement) y
   **descripción libre** (texto). Ya soportadas en el export (`tipoToma`, `movimiento`, nota).
4. **Contador del drone (foto + video juntos).** En el loop de drone, además de "Toma" (video), un
   control **"+ foto"** que **avanza el consecutivo sin crear una toma catalogada**, para que el
   siguiente video de drone tenga el número correcto.
5. **Sin auto-sugerencia.** Se elimina el auto-avance (`avanzarSugerencia` ya no auto-selecciona la
   siguiente). Las sugerencias nunca se aplican solas.
6. **Flujo de fallo simple.** "No sirve" = 1 toque → fallida, **sin "¿por qué?"** y **sin banner de
   deshacer**. Para corregir cualquier toma (incluida una fallida) se **toca directo** y se cambia
   (buena, favorita, fallida, reasignar cuarto, nota).
7. **Fuera el modo aprendiz** y el cheatsheet imprimible. **Se conservan** el guion de edición
   imprimible y el gate de salida.
8. **Cámaras configurables y extensibles, administradas desde el editor de biblioteca (`?config=1`).**
   Lista editable (defaults: Sony FX30, Osmo Pocket 3, DJI Air 3, DJI Mini 4 Pro). El switch de cámara
   en el loop muestra las relevantes. El control **"+ foto"** aplica a las cámaras de drone
   (foto+video comparten contador). Agregar una cámara nueva no requiere tocar código.
   - **Alta de cámara:** nombre, tipo (video / drone / audio) y **patrón de numeración**. El patrón se captura
     **pegando un ejemplo del nombre de archivo**; el motor infiere **prefijo + número + sufijo + ancho**
     (reusar `parseFilenameSequence`) y muestra **vista previa del "siguiente"** para confirmar. Soporta
     patrón Sony (prefijo + número aditivo) y DJI (número aditivo + letra/sufijo al final). Respaldo:
     selector manual *solo número* vs *número + sufijo*.
   - **Patrón vs número del día:** el **patrón** (prefijo/sufijo/ancho) vive en la **cámara** (config,
     reutilizable entre sesiones). El **número actual** se engancha en **campo** tecleando una vez el
     último archivo (`initializeCameraSequence`), sin redefinir el patrón.

## 5. Captura — el loop (vista de Bruno)

Un cuarto en foco, pensado para el pulgar. De arriba a abajo:

- **Header:** "‹ Cuartos" + nombre del cuarto (Fraunces) + piso.
- **Cámara:** switch **Sony / Drone** + token grande del **siguiente archivo** (mono) como seguro
  anti-error. En Drone: "siguiente video" + botón **"+ foto"** (mueve el contador).
- **Sugerencias (tira compacta y plegable, secundaria — nunca protagonista):** chips de tipos de
  toma del cuarto, con palomita los hechos. Tocar un chip **etiqueta tu próxima "Toma"** (no
  auto-avanza). Al seleccionar, se expande con guía de **"qué grabar"** + chips de **movimiento**
  (el recomendado ya marcado, cambiable). "Toma libre" si no seleccionas nada.
- **Tomas del cuarto:** lista; tocar una para editarla.
- **Toma recién hecha (fija, sobre los botones — sin scroll):** **★ Favorita** y **✓ Buena** de un
  toque + **describir** (texto libre opcional).
- **Zona del pulgar:** dos botones grandes (≥56px) **Toma** / **No sirve**, ambos avanzan el
  consecutivo.
- **Cambiar de cuarto:** selector agrupado por piso; los cuartos ya grabados siempre seleccionables.

## 6. Modo cuartos (armar la propiedad)

- **Arranca vacío.** Nada pre-cargado.
- **Tipo de propiedad** (Casa / Depto / Terreno / Quinta) **sesga las sugerencias** (Quinta: alberca,
  palapa, asadores, cabañas, etc.). Reusar las listas de `TEMPLATE_DEFS` como **sugerencias**, no
  como carga masiva; agregar set de quinta.
- **Pisos** editables (tocar sugerencias + agregar/quitar). El cuarto cae en el **piso en foco**.
- **Un toque agregar** (chip) **/ un toque quitar** (X en el cuarto), sin confirmaciones de dos pasos.
  **Deshacer** disponible (aviso que regresa lo quitado).
- **Sub-cuartos** de un nivel desde el cuarto activo ("+ sub-cuarto"), heredan el piso.
  **VERIFICAR a fondo** (en la app actual fallaban): crear, heredar piso, capturar dentro, sincronizar.
- **Casi sin escribir** (campo de texto con autocompletar solo para lo raro). **Re-entrable y
  aditivo.**
- **Categoría del cuarto:** al agregar desde un chip, el cuarto queda con su **categoría** (sala,
  cocina, baño…) para que las sugerencias salgan bien. Para nombres libres, la categoría se detecta
  y es **corregible** (no depender solo del nombre).

## 7. Cierre — "¿ya nos vamos?" (vista de Bruno)

- **Semáforo** (rojo / amarillo / verde).
- **Faltantes:** cuartos sin tomas, escenas sin una buena marcada.
- **Conciliación con la cámara física:** último archivo por cámara ("Sony va en PIB2840 · ¿igual o
  hay hueco?"); si hay hueco, insertar faltantes. Línea de tiempo cronológica por cámara
  (insertar / quitar / reasignar). Motor existente: `insertOmittedMediaFile`, `removeMediaFile`,
  `updateMediaFile`.
- **Gate de salida** (conservado).
- Para Fer/Danna no es una pestaña; sus faltantes viven en su propia rejilla de Cobertura.

## 8. Edición — bitácora para post (vista de Bruno)

- Agrupado por **servicio → piso → cuarto**, filas editables (buena, favorita, descripción, descarte
  con motivo, reasignar, cámara, orden real).
- Botón **Exportar para Premiere** (`buildExport`, `version:1`, intacto). Guion de edición imprimible.
- **Optimizada para pantalla grande (escritorio):** es la vista que se usa en la compu al editar;
  debe ser responsive, no solo mobile-first.

## 9. Offline-first (Fase 1)

- La app **carga y guarda primero en el celular** (espejo en `localStorage` en cada cambio).
- Sin señal se sigue capturando; la sincronización **reintenta hasta lograrlo** al volver la señal.
- `poll()` preserva el **estado por-dispositivo** (rol, cámara activa, cuarto en foco) en el merge.
- El buscador/inputs no deben re-renderizar y perder el cursor.
- Riesgo conocido (a cuidar): dos personas editando offline y reconectando podrían pisarse (el
  guardado manda el blob completo). La prioridad —no perder TU captura— sí queda cubierta. Evaluar
  merge por-campo más adelante.

## 10. Alcance por fases

| Fase | Contenido |
|---|---|
| **Visión** (este doc) | Marco completo aprobado. |
| **Fase 1 — Rediseño + captura confiable** | Marco/navegación nueva; rol por celular; cuartos compartidos; Modo cuartos vacío con chips y deshacer (incl. sub-cuartos verificados); loop de captura (buena/favorita 1 toque, tipo+movimiento+descripción, flujo de fallo simple, sin auto-sugerencia, sin banners); drone unificado + contador "+ foto"; Cobertura, Cierre, Edición; **offline-first**; quitar modo aprendiz/cheatsheet. Export `version:1` intacto. |
| **Fase 2 — Sugerencias con IA** | Rediseño del flujo: cuartos → **destacados** de la propiedad → fotos del cel → prompt mejor armado → aplicar sugerencias **de verdad** (arreglar el bug de IDs que no coinciden y se descartan en silencio). Caen en la tira de sugerencias del loop. |
| **Fase 3 — Asesores** | Modo asesor: par video+audio, dispositivos de audio configurables, puntos (intro/despedida/voz en off), tolerancia a desfase del par. **Arquitectado en esta visión** (ver §15); se construye aquí. |

## 11. Fuera de alcance / diferido

- **Dictado por voz / micrófono en la app:** descartado por ahora (Bruno no lo quiere integrado). La
  descripción se escribe a mano. Revisar a futuro solo si surge una forma externa que no meta micrófono
  en la UI.
- **Asesores:** no entra en Fase 1, pero **sí se arquitecta** en esta visión (ver §15) y se construye
  en su propia fase (Fase 3).
- **Cualquier cambio a `worker/`, backend, migraciones, deploy.**
- **Procesamiento de metadatos de Premiere:** lo hace la app de Mac, no `checklist.html`.

## 12. Errores conocidos a convertir en pasos verificables (para los planes)

1. **Sub-cuartos fallaban** → paso explícito de creación + captura + sincronización, verificado en la
   app real.
2. **Sugerencias de IA no se aplicaban** (IDs de cuarto no coinciden → descarte silencioso) → Fase 2,
   con verificación de que las sugerencias aparecen en el cuarto correcto.
3. **Sin señal no funcionaba** → offline-first con prueba de captura sin red y reconexión.
4. **Migración de propiedades ya capturadas** (drone separado → espacios) → verificar que no se
   pierdan archivos ni consecutivos al cargar estado viejo.

## 13. Lo que se preserva (contratos invisibles)

- Backend `worker/src/routes/checklist.js` (blob `cuartos_json`, `version===2`).
- `buildExport` en `version:1` (app de Mac `iav-metadata-app`).
- Motor `checklist-logic.js` como capa de lógica pura, testeada (`node --test
  frontend/checklist-logic.test.js`); se extiende de forma aditiva.
- Modos `?config=1` (editor de biblioteca: sugerencias **y cámaras**, tras contraseña de admin) y
  `?demo=1` (datos de ejemplo, sin backend).

## 14. Verificación (para los planes)

- **Lógica pura:** `node --test frontend/checklist-logic.test.js`, extendido con los casos nuevos
  (favorita, contador "+ foto" del drone, migración droneItems→espacios, sub-cuartos).
- **Navegador local:** recorrer captura, modo cuartos (incl. sub-cuartos), cobertura, cierre, edición.
- **Celular real:** incluida **captura sin señal** y reconexión (offline-first), y legibilidad en sol.
- **Export:** confirmar `version:1` y que la app de Mac (`iav-metadata-app`) lo sigue leyendo.

## 15. Asesores (arquitectado ahora — se construye en Fase 3)

Add-on dentro de la propiedad. La toma es un **par video + audio** contra un **punto** (no un cuarto).
Casi siempre **intro y despedida** (a veces recorrido hablado).

- **Dispositivos de audio como cámaras configurables.** Las cámaras tienen tipo **audio** (Osmo
  Pocket 3, DJI Mic 2, DJI Mic), dadas de alta desde el editor con su patrón de numeración. Se debe
  poder grabar **solo con DJI Mic 2** (o DJI Mic), sin Osmo, si así se trabaja.
- **Par ligado (`pairId`).** Un toque crea el par cámara-de-video + dispositivo-de-audio y avanza
  **ambos** consecutivos. **Voz en off** = punto solo-audio.
- **Ambos nombres de archivo siempre visibles** (ej. `Sony PIB2820 ↔ DJI 0034`), para confirmar contra
  los dos aparatos físicos. Es el seguro anti-error del par.
- **Tolerar errores humanos (desfase del par).** Un toque accidental en el mic o la cámara crea un
  archivo de más (o de menos) y rompe el 1:1. La app debe permitir **corregir el contador de un solo
  dispositivo** y marcar un **archivo suelto sin par** (como la conciliación de Cierre, pero por par).
- **Puntos:** Intro, Despedida, custom. Cada toma: **buena + qué punto + comentario**.
- **Vive como sección "Asesor"** en la vista de Bruno (no como cuartos).
- Motor: modo `asesor`, `asesorPuntos`, par por `pairId` (ya existe parcialmente; se rediseña en su
  fase). Nota: el "asesor como entidad propia / su URL" ligado a contratos sigue **aplazado** y es
  distinto de este modo de grabación.

## 16. Ideas futuras (backlog — fuera de fases 1–3)

- **Sincronizar drone con audio.** El drone no trae buen audio; el audio se graba aparte (DJI Mic 2 +
  Osmo). Hoy Bruno usa un marcador visual de sincronía (pantalla blanca que parpadea a rojo y vuelve a
  blanco) para alinear en edición. A futuro, la app podría **generar ese marcador** (destello en el cel
  + un tono que capte el mic) y **registrar el punto de sync ligando el clip de drone con su audio**,
  para alinear sin adivinar. Se brainstormea a su tiempo.
