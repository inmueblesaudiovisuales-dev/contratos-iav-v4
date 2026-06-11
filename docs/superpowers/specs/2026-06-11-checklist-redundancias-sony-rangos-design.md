# Checklist: Sony unificada, redundancias de configuración, rangos por número y pulido — diseño

Fecha: 2026-06-11. Toca `contratos-iav-v4` (checklist) y, solo si la verificación cruzada lo exige, `iav-metadata-app` (rama `rediseno`).

## Objetivo

Resolver un conjunto de problemas reales detectados explorando la app, sin romper la compatibilidad con la app de metadatos (que consume el JSON exportado y genera el XML de Premiere):

1. **Sony FX30 modelada como dos cámaras** (`sony-main` y `sony-asesor`) con contadores separados, siendo una sola cámara/SD con numeración continua. Es el problema de fondo.
2. **Redundancia/conflicto de la bandera de drone** (`servicios.drone` vs `guide.incluirDrone`).
3. **Tipo de propiedad** preguntado en dos pantallas.
4. **Asesor** encendido por default.
5. **Pantalla de inicio**: la segunda persona debería solo elegir rol; config en acordeón.
6. **Rangos de archivo**: rediseño por número, solo foto/360.
7. **Toast** invasivo; **doble botón de regreso**; **voz en off** invisible.

## Contrato con la app de metadatos (verificado, es la frontera de compatibilidad)

La app SOLO lee del JSON de la bitácora: `archivos`, `grabaciones`, `cameras`, `vlogOsmoAction`, `folio`, `token`, `nombreCliente` (`iav-metadata-app/src/engine/types.ts:77-88`). NO lee `guide`/`tipoPropiedad`/`incluirDrone`/`servicios`.

- **Identificación del asesor en el XML:** depende exclusivamente de `camaraId === 'sony-asesor'` → bin `['Asesor', escena]` (`premiereService.ts:59,62`; `premiereBins.ts:27,47`).
- **Emparejado archivo↔registro:** por el **token literal del nombre real** del archivo (`record.archivo`, p. ej. `PIB2903`), con `stem.endsWith(token)` (`matcher.ts:7-20`; `types.ts:14`). NO usa el contador lógico del checklist.
- **El contador (`fileCounter`)** solo se usa en la INGESTA por rango numérico (`fileRange.ts`), para foto/360, emparejando por el último grupo de dígitos del nombre. No participa en el XML.
- **El campo `par`** (Sony↔Tascam) NO se usa en ninguna parte de la app.

**Implicación:** solo las Fases 1 (toca `archivos`/`cameras`) y 5 (toca `grabaciones`) pueden afectar la app. Las Fases 2, 3, 4 y 6 son invisibles para la app.

## Mejora 1 — Sony FX30 = una sola cámara (Forma A: compartir secuencia)

**Decisión: Forma A.** Se conserva `sony-asesor` como cámara/rótulo (para que `cameras` y el bin "Asesor" de la app no cambien), pero su **secuencia/contador se comparte con `sony-main`** (la FX30 es una sola cámara con un solo contador continuo).

Modelo actual: el contador vive en `sequenceSegments[].counterNext`; cada cámara apunta a su segmento con `camera.activeSegmentId`; `initializeCameraSequence` crea un segmento nuevo y setea `activeSegmentId` (`checklist-logic.js:3123-3143`).

Diseño:
- Definir el conjunto "cámaras de la FX30" = `['sony-main', 'sony-asesor']` (kind `sony`, son la misma cámara física).
- Al iniciar la secuencia de CUALQUIERA de las dos: si la otra ya tiene `activeSegmentId` (la FX30 ya está corriendo), **reusar ese segmento** (apuntar ambas al mismo `activeSegmentId`) en vez de crear uno nuevo y SIN re-sembrar. Si ninguna lo tiene, crear el segmento y apuntar ambas a él.
- `registerAsesorFile` sigue creando el mediaFile con `cameraId: 'sony-asesor'` (rótulo) pero su token sale del **segmento compartido** → numeración continua y verdadera.
- "Re-iniciar secuencia" (ícono refresh) sobre la FX30 re-siembra el segmento compartido (afecta toda la FX30, que es lo correcto). Comportamiento consciente, documentado en el copy.

Riesgos a cubrir (pasos explícitos en el plan):
- Orden de inicio (asesor primero o video primero) → ambos convergen a un solo segmento.
- No re-sembrar al reusar (no resetear el contador).
- Estados viejos con DOS segmentos: NO se migran a la fuerza; el flujo nuevo comparte de aquí en adelante; `normalizeChecklistData` no debe romper.
- El token exportado debe seguir siendo el nombre real (prefijo del archivo + número), no el contador lógico.

Verificación obligatoria: (a) confirmar en `buildExport` que `archivo`/`fileToken` se arma del nombre real; (b) **export real del demo → dry-run de la app** confirmando que los clips de asesor caen en bin "Asesor" y los de video en su escena.

## Mejora 2 — Una sola bandera de drone

`state.servicios.drone` (pantalla de inicio) es la única fuente de verdad. Se elimina `guide.incluirDrone`.

- `sesionDroneAplica` (`checklist.html:1910`) pasa a leer `state.servicios.drone`.
- Se quita el toggle "Incluir tomas de drone" de "Armar cuartos" (`renderDroneToggle`/`toggleIncluirDrone`, `checklist.html:2061-2079`).
- `createDefaultState` (`checklist-logic.js:2539`) y `normalizeChecklistData` (`:2941-2962`) dejan de inicializar/derivar `incluirDrone`.
- **Migración sin pérdida:** al normalizar un estado entrante, `servicios.drone = servicios.drone === true || guide.incluirDrone === true` (si cualquiera decía drone, se conserva). Luego se elimina `guide.incluirDrone`.

App: no lee estos campos → sin impacto.

## Mejora 3 — Asesor arranca apagado

`SERVICES_DEFAULT.asesor = false` (`checklist-logic.js:6`). La tarjeta de asesor ya respeta `servicios.asesor && isBruno` (`checklist.html:1941`). Solo afecta trabajos nuevos; los viejos conservan su valor guardado. App: sin impacto de formato.

## Mejora 4 — Pantalla de inicio con acordeón (entrada única) + tipo obligatorio

`renderInicio` se vuelve la entrada única (reemplaza el `renderRoleSelect` del gate, usado solo en `checklist.html:1668`):

- **Rol siempre arriba** ("¿Quién eres?": Video/Fotografía/360, claves de persona intactas).
- **Configuración en acordeón:** abierto si NO está `configurado`; plegado "Ya configurado — toca para ajustar" si ya lo está. La segunda persona solo elige su rol.
- **Tipo de propiedad OBLIGATORIO:** "Empezar" queda deshabilitado hasta elegir tipo (garantiza catálogo en "Armar cuartos").
- Se elimina la lógica de "Saltar"/`saltoInicioLocal` (ya no hace falta con el acordeón).
- Se quita el selector de tipo de "Armar cuartos" (`renderSetup`); `setupTipo` se sigue sembrando desde `state.guide.tipoPropiedad` en `abrirSetup` (`checklist.html:2647`).

Gate del render: mostrar `renderInicio` cuando no hay rol en este dispositivo (`!roleReady()`); con la config plegada si `configurado`. Reabrir vía "Configurar trabajo".

App: `tipoPropiedad` no se lee → sin impacto.

## Mejora 5 — Rangos de archivo por número, solo foto/360

`camarasRangoManual` se reduce a `foto-sony` (svc foto) e `insta360` (svc t360). Video y drone son tomas en vivo (sus `grabaciones` salen de `porCamara` en `buildExport`, no del bloque manual). Drone-360 se elimina del bloque.

UI: por dispositivo, el prefijo+fecha son **contexto fijo** (texto), y se pide **solo el número** del primer y último archivo. Botón "Guardar" por dispositivo con confirmación (E3-style) e integridad por dispositivo (no pisa otros; borrador en memoria entre re-renders).

Almacenamiento (para que la app empareje por número): `state.rangosManuales[id] = { primer, ultimo }` donde cada valor es una cadena **terminada en el número** que el operador puso (la app toma el último grupo de dígitos; prefijo/fecha/hora son indiferentes para el emparejado). `buildExport` ya emite `grabaciones` con `camaraId` y `primerArchivo`/`ultimoArchivo` desde `rangosManuales` (`checklist-logic.js:4007-4017`). El primero puede quedar vacío (tarjeta en reset).

Verificación: export real con un rango foto/360 → dry-run confirma el acotado por número.

## Mejora 6 — Pulido de UI

- **Toast (E3):** el éxito de "Toma registrada" se confirma **en el propio botón** (parpadeo "registrada"); el **"Deshacer"** se mueve a la **lista de tomas** (cada toma con su deshacer inline). El toast grande se reserva para errores (red/guardado). Call sites de éxito a cambiar: `checklist.html:5416` (media) y `:2905` (asesor).
- **Doble regreso:** en `renderActiveView` (`checklist.html:2052`) excluir también `modoActual === 'asesor'` del back-prop (espejo del trato del drone). Queda solo el "‹ Captura" (`salirSesionAsesor`) de la sesión de asesor.
- **Voz en off visible:** acceso directo en la sesión de asesor (no enterrado en "Cambiar punto"). Se conserva `agregarPunto(true)` / `tipo:'voz'`; solo se surface un botón visible en `renderAsesorCapture`.

App: sin impacto.

## Decisiones tomadas (no requieren más input)

- Tipo de propiedad: **obligatorio** para Empezar.
- Si el dry-run revela que la app necesita ajuste: **se arregla en `iav-metadata-app` rama `rediseno`, local, con tests verdes, sin push**.
- Despliegue: **commits locales, sin push**. NADA se empuja a producción.
- Sony: **Forma A** (compartir secuencia, conservar rótulo `sony-asesor`).
- Voz en off: **acceso visible** en la sesión de asesor (no se agrega el switch-en-caliente por ahora; queda como posible mejora futura).

## Compatibilidad y despliegue

- JSON: sigue `version: 2`. Cambios compatibles. La app no requiere cambios salvo que el dry-run lo demuestre.
- `contratos-iav-v4`: commits a `main` local, SIN push (push despliega a producción).
- `iav-metadata-app`: rama `rediseno`, merge local a `master` al final si aplica, sin push.
