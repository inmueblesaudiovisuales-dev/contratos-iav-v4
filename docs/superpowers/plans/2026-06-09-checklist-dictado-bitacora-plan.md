# Plan — Meta A: dictar la bitácora (importador de dictado) — F67–F71

> Para la sesión de construcción (build-from-plan): este plan es la fuente de verdad. Cada micro-fase es
> UN commit con gate, en la rama `checklist-cambios-2026-06-07`, NUNCA a `main`, worker solo al preview.
> Lee también el handoff `docs/superpowers/PROMPT-CONTINUIDAD-2026-06-09-dictado-sugerencias.md` y el
> contrato de datos `docs/EXPORT_METADATA_HANDOFF.md`. No toques `iav-metadata-app` ni `adapter/`.

**Goal:** Que Bruno dicte las tomas de un rodaje (video + dron), las pase por Gemini con un prompt que
genera la app, y pegue de vuelta un JSON que la app valida y, tras un paso de revisar, convierte en
mediaFiles consistentes con la captura manual.

**Architecture:** La app no es la inteligente. Genera un prompt desde el estado vivo (cámaras activas con
su contador y formato, cuartos con id y piso, vocabulario cerrado); Gemini estructura el dictado; la app
tiene una puerta de import que VALIDA (tolerante, como `parsePropuesta`) y un paso de REVISAR antes de
escribir en firme. Los mediaFiles se crean por el MISMO camino que la captura (`registerMediaFile`) para
no romper token/contador/shotNumber, y el guardado entra por el flujo normal con `rev`/fusión (F62).

**Tech Stack:** Cloudflare Workers + D1; frontend estático (`frontend/checklist.html` con JS inline +
`frontend/checklist-logic.js` como motor puro probado con `node --test`). Sin build step. Gemini es manual
(Bruno pega); la app no llama a ninguna API ni transcribe audio.

---

## Conceptos y nombres (leer antes de F67)

- Carril de cámara = `state.sequenceSegments` por cámara; su `counterNext` es el próximo número de archivo.
  `formatFileToken(segment, n)` expande el número al token (`PIB0082` en Sony; `0082` en DJI/dron).
- La app es la dueña del número. Gemini transcribe el número final dictado; la app lo expande y VALIDA la
  secuencia (saltos/duplicados) contra su contador. El contador es la llave de emparejamiento con la app de
  metadatos (el nombre real del archivo CONTIENE el token).
- Fotos del dron = avance de contador, NO cobertura ni toma. La tarjeta del dron numera fotos y videos en una
  sola secuencia; ya existe `bumpCameraCounter(state, cameraId, n)` (logic.js:~2640) y su botón
  `agregarFotoDrone()` (checklist.html:3680, "mueve el consecutivo sin crear toma"). Diez fotos del dron entre
  dos videos del dron significan que el siguiente video del dron sube diez números.
- El dictado de Bruno SOLO lleva video y dron. No incluye cobertura de foto ni de 360 (eso lo marcan
  Fernanda y Danna por separado). Por tanto el importador NO usa `registerCapture` ni toca `estados[servicio]`.
- Tomas sin identificar = tomas reales (take) con cuarto pendiente; se asignan en el paso de revisar
  (`updateMediaFile`), no son descartes ni omitidas.
- Doble pegado = el import detecta tokens que ya existen para esa cámara y ofrece agregar o reemplazar; nunca
  duplica en silencio.

## Invariantes (gate, todas las fases)

- `buildExport` sigue dando `version:1`; el contrato de datos (`docs/EXPORT_METADATA_HANDOFF.md`) no cambia de
  forma. `normalizeChecklistData` sigue cargando estado viejo sin pérdidas.
- El camino de captura no cambia de comportamiento cuando NO se pasan los overrides nuevos: `registerMediaFile`
  sin `counter`/`good`/`favorite` se comporta exactamente igual que hoy (aditivo/opt-in). Hay un test que lo
  fija.
- El import entra por `saveNow` (rev/fusión F62); el aplicador devuelve el nuevo estado, no escribe directo en
  D1 ni reemplaza el documento entero.
- Sin emojis. Español con acentos en texto visible; ids/clases/ids-de-icono sin acentos. Áreas táctiles ≥44px.
- `node --test frontend/checklist-logic.test.js` debe quedar 100% verde y con MÁS pruebas que el baseline de
  242; ninguna prueba previa se rompe.
- No tocar `iav-metadata-app` ni `adapter/AdapterScript4_v1.js`.

**Gate motor (F67, F68, F69):**
`bash .claude/skills/build-from-plan/phase-gate.sh "frontend/checklist-logic.js,frontend/checklist-logic.test.js" "version: 1" "normalizeChecklistData" "function registerMediaFile"`

**Gate UI (F70):**
`bash .claude/skills/build-from-plan/phase-gate.sh "frontend/checklist.html" "version: 1" "normalizeChecklistData"`

**Gate cierre (F71):**
`bash .claude/skills/build-from-plan/phase-gate.sh "docs/RONDAS.md,docs/ARQUITECTURA.md,docs/EXPORT_METADATA_HANDOFF.md"`
(GOTCHA del gate: el check "sin emojis" lee todo archivo cambiado; las PNG dan FALSO POSITIVO. Las capturas de
evidencia van en un commit de docs SEPARADO del commit de cierre.)

---

## Formato de import `bitacora-dictado` v1 (fuente de verdad del contrato del importador)

Un solo arreglo `eventos` ordenado por `orden` (importa el ORDEN: una toma del dron después de un evento de
fotos del dron sube su número). Cada evento es `"toma"` o `"fotos"`.

```jsonc
{
  "formato": "bitacora-dictado",
  "version": 1,
  "eventos": [
    {
      "orden": 1,               // entero creciente; define la secuencia real
      "evento": "toma",
      "camara": "sony-main",    // id de cámara ACTIVA (video o dron); por defecto sony-main si no se dijo otra
      "numero": 82,             // número FINAL de archivo dictado (la app lo expande al token y lo valida)
      "cuartoId": "esp-abc",    // id real de cuarto, o "sin_identificar"
      "shotType": "general",    // id del vocabulario de tomas, o null (lo desconocido va a nota)
      "movement": "push_in",    // id de los 8 movimientos, o null
      "clase": "take",          // "take" | "discard"
      "motivoDescarte": null,   // "failed" | "unrelated" | "empty"  (solo si clase=discard; default failed)
      "buena": true,            // por defecto true salvo descarte
      "favorita": false,
      "nota": ""                // texto libre; aquí caen vocab fuera de catálogo y aclaraciones
    },
    { "orden": 6, "evento": "fotos", "camara": "drone-dji", "cantidad": 10 }
  ]
}
```

Reglas del importador al procesar (válidas para F68 validación y F69 aplicación):
- `numero` se expande con `formatFileToken(segmento, numero)` del carril de esa cámara.
- Validación de secuencia por carril: el "esperado" arranca en `getCameraSequence(state, camara).segment.counterNext`
  (el número inicial que Bruno puso al armar cuartos). Cada `toma` sube el esperado en 1; cada `fotos` lo sube en
  `cantidad`. Si `numero` != esperado → bandera `salto`. Si el token ya se usó en este import o ya existe en
  `state.mediaFiles` de esa cámara → bandera `duplicado`.
- `cuartoId` se mapea por id; si es `"sin_identificar"` o no empata → bandera `sinIdentificar`, cuarto pendiente.
- `shotType`/`movement` se validan contra `getShotTypes()` y los 8 ids de dictado; lo inválido → `null` +
  bandera `vocabFuera` (se conserva el texto original en `nota`).
- `camara` debe ser una cámara activa de video o dron; si no existe o no está activa → bandera `camaraInvalida`
  (no se aplica esa toma).
- `evento:"fotos"` solo es válido para una cámara dron; en otra cámara → `camaraInvalida`.
- Nada se escribe hasta confirmar en revisar.

## Prompt de dictado (lo genera la app en vivo; nunca se escribe a mano)

`buildDictadoPrompt(state)` inyecta, desde el estado vivo:
- Las cámaras activas de video y dron, cada una con su `id`, etiqueta, modo, contador actual y formato de
  token; deja explícito que `sony-main` es la cámara por defecto si no se menciona otra.
- Las frases de cambio de cámara ("cambio de cámara a dron", "cambio a Osmo", "de regreso a la Sony").
- Los cuartos como lista de `{ id, nombre, piso }` (el id es la llave; lo ambiguo/inexistente → `sin_identificar`).
- El vocabulario de tomas: los 12 ids de `getShotTypes()` con su etiqueta.
- El vocabulario de movimientos: EXACTAMENTE los 8 ids `push_pull, push_in, pull_out, pan, tilt, travel, orbit,
  reveal`, con la etiqueta tomada de `getMovements()` (el set se fija, las etiquetas salen del motor).
- Mishears: `"pushing"/"push"->push_in`, `"rivil"/"revil"->reveal`, `"paneo"->pan`, `"órbita"->orbit`,
  `"plano general"->general`.
- Reglas de lectura: cada toma empieza en "toma N" (N = final del número de archivo de la cámara activa);
  fallida/no sirve/mal expuesta = descarte (default failed); quedó bien = buena; favorita = favorita; default
  buena salvo descarte; "N fotos" en el dron es un evento de fotos (avanza el número del dron), no toma ni
  cobertura; si me corrijo, honra la ÚLTIMA corrección; cuarto ambiguo → `sin_identificar`.
- Reglas duras: responde SOLO el JSON con el formato `bitacora-dictado` v1; solo ids de cuarto de la lista o
  `sin_identificar`; shotType/movement solo del vocabulario; no inventes tomas.

Ejemplo real de dictado que el prompt debe saber ordenar: "toma 82 push in cocina plano general. toma 83
detalle cocina, quedó bien, favorita. toma 84 fallida, no está bien expuesta. toma 85 recámara reveal pared
izquierda. cambio de cámara a drone. toma 1 drone fachada reveal. 10 fotos capturadas. toma 2 drone."

---

## F67 — Motor: generador del prompt de dictado (`buildDictadoPrompt`) + tests

**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.

1. Añadir constante `DICTADO_MOVEMENTS = ['push_pull','push_in','pull_out','pan','tilt','travel','orbit','reveal']`
   (los 8 ids acordados; todos existen en `getMovements()`). No se exporta el arreglo crudo; se usa dentro del
   generador.
2. Añadir `buildDictadoPrompt(state)` (modelado en el estilo de `buildPropuestaPrompt`, logic.js:1130: concatena
   string). Debe:
   - Listar SOLO cámaras activas de video y dron: las de `state.cameras` con `mode` en `{'video','drone'}` cuyo
     servicio (`state.servicios[mode]`) esté activo y que tengan segmento (vía `getCameraSequence`). Para cada una
     incluir `id`, `label`, `mode`, contador actual (`getCameraSequence(state, cam.id).segment.counterNext`) y un
     ejemplo de token con `formatFileToken`. Marcar `sony-main` como la cámara por defecto.
   - Incluir la lista de cuartos `{ id, nombre, piso }` desde `state.espacios` (usar `esp.piso` cuando exista).
   - Inyectar el vocabulario de tomas desde `getShotTypes()` (id + label) y el de movimientos desde
     `DICTADO_MOVEMENTS` con label de `getMovements()`.
   - Incluir mishears, frases de cambio de cámara, reglas de lectura y reglas duras (sección "Prompt de dictado").
   - Cerrar con el esquema de respuesta `bitacora-dictado` v1 (un bloque de ejemplo del formato).
3. Exportar `buildDictadoPrompt` en el objeto `logic` (junto a `buildPropuestaPrompt`).
4. Tests (`checklist-logic.test.js`, con `node --test`), usando un `state` de prueba con cocina y una recámara,
   `sony-main` y `drone-dji` activos con contador inicial conocido:
   - El prompt contiene los `id` reales de los cuartos del estado (no nombres sueltos como llave).
   - El prompt contiene exactamente los 8 ids de movimiento de `DICTADO_MOVEMENTS` y ningún otro id de
     `getMovements()` que no esté en esa lista (p. ej. no aparece `gimbal_walk` como opción ofrecida).
   - El prompt contiene los 12 ids de `getShotTypes()`.
   - El prompt menciona `sony-main` como cámara por defecto y lista `drone-dji` solo si el servicio dron está
     activo (con dron apagado, no aparece `drone-dji`).
   - El prompt declara `"formato": "bitacora-dictado"` y `"version": 1` en el ejemplo de respuesta.

**Gate:** gate motor. Aceptación: `node --test` 100% verde (más pruebas que 242), `buildDictadoPrompt` exportado,
`version:1` de `buildExport` intacto.

---

## F68 — Motor: parser y validador tolerante (`parseDictado`) que produce el preview SIN mutar estado + tests

**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.

1. Añadir `parseDictado(texto, state)` (reusa el patrón tolerante de `parsePropuesta`, logic.js:1173: limpia
   fences ` ```json `, fallback a primer `{` … último `}`, `JSON.parse` en try/catch; si falla, retorna un
   resultado de error claro y NO aplica nada). NO clona ni muta `state`: solo lee.
2. Validar sobre el JSON parseado:
   - `formato === 'bitacora-dictado'` y `version === 1`; si `version` es otra, retornar error pidiendo revisar
     versión (no procesar). Si falta `eventos` o no es arreglo, error.
3. Construir el preview recorriendo `eventos` ordenados por `orden` (estable). Mantener por carril de cámara:
   - `esperado[camId]` inicializado en `getCameraSequence(state, camId).segment.counterNext`.
   - `tokensVistos[camId]` inicializado con los `fileToken` ya existentes en `state.mediaFiles` de esa cámara
     (para detectar doble pegado contra lo ya capturado).
   - Cámaras válidas = las activas de video/dron (mismo criterio que F67). Para `evento:"toma"`:
     - Si `camara` no es válida → item con bandera `camaraInvalida`, no afecta contadores.
     - Resolver cuarto: `state.espacios` por `id`; respaldo por `normNombre` (logic.js, ya exportado) si vino un
       nombre; si es `"sin_identificar"` o no empata → `cuartoId=null`, bandera `sinIdentificar`,
       `cuartoNombre='Sin identificar'`.
     - Validar `shotType` contra `getShotTypes()` y `movement` contra `DICTADO_MOVEMENTS`; inválido → guardar
       `null`, bandera `vocabFuera`, y anexar el valor original a `nota`.
     - `clase` = `'take'` o `'discard'`; si `discard` sin `motivoDescarte` válido (`failed|unrelated|empty`) →
       `failed`. `buena` default `true` salvo `discard`. `favorita` default `false`.
     - Bandera `salto` si `numero !== esperado[camId]`. Token = `formatFileToken(segmento, numero)`. Bandera
       `duplicado` si el token ya está en `tokensVistos[camId]`. Luego `tokensVistos[camId].add(token)` y
       `esperado[camId] = numero + 1`.
     - Empujar al preview el item con: `orden, evento:'toma', camara, numeroDictado, tokenExpandido, cuartoId,
       cuartoNombre, shotType, movement, clase, motivoDescarte, buena, favorita, nota, banderas{...}`.
   - Para `evento:"fotos"`: si la cámara no es dron válido → `camaraInvalida`; si válida, `esperado[camId] +=
     cantidad` (NO crea item de toma; sí se lista en el preview como evento de fotos con su cantidad). No marca
     tokens.
4. Devolver:
   ```jsonc
   {
     "ok": true,                 // false + "error" si el JSON no es válido/compatible
     "error": null,
     "preview": [ /* items en orden, tomas y fotos */ ],
     "resumen": { "tomas": N, "descartes": N, "fotosDron": N, "saltos": N, "duplicados": N,
                  "sinIdentificar": N, "vocabFuera": N, "camaraInvalida": N },
     "report": { "ignoradas": N, "motivos": [ "..." ] }   // mismo espíritu que parsePropuesta
   }
   ```
5. Exportar `parseDictado` en `logic`.
6. Tests (`checklist-logic.test.js`), con un `state` con cocina (id conocido) y `sony-main`+`drone-dji` activos,
   contador Sony inicial en 82 y dron en 1:
   - Parsea el dictado de ejemplo real (convertido a JSON `bitacora-dictado` v1): 4 tomas Sony + 2 tomas dron + 1
     evento de fotos; tokens expandidos correctos (`PIB0082`…`PIB0085`, dron `0001`, y dron `0012` tras 10 fotos).
   - El evento de 10 fotos del dron hace que la toma dron siguiente con `numero:12` NO marque `salto`, y que con
     `numero:2` SÍ marque `salto` (porque el esperado subió a 12).
   - Texto sucio (con ```json y explicación alrededor) parsea igual; basura total → `ok:false` con `error`.
   - `version:2` → `ok:false` con error de versión, sin preview.
   - shotType inválido (`"plano raro"`) → `shotType:null`, bandera `vocabFuera`, original en `nota`.
   - cuarto inexistente / `"sin_identificar"` → `cuartoId:null`, bandera `sinIdentificar`.
   - Un token que YA existe en `state.mediaFiles` → bandera `duplicado` (detección de doble pegado).
   - `camara` no activa o `fotos` en cámara no-dron → bandera `camaraInvalida`, sin tocar contadores.
   - `parseDictado` no muta `state` (comparar `JSON.stringify(state)` antes/después).

**Gate:** gate motor. Aceptación: `node --test` verde; `parseDictado` exportado; no muta estado.

---

## F69 — Motor: aplicador (`applyDictado`) + refactor aditivo de `registerMediaFile` + tests

**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.

1. Refactor aditivo de `registerMediaFile` (logic.js:2805) para aceptar overrides opcionales en `options`:
   - `counter` (entero): si viene, fija `segment.counterNext = counter` ANTES de insertar (de modo que el token y
     el `fileCounter` salen de `counter`); luego sigue el `counterNext++` actual. Si no viene, comportamiento
     idéntico a hoy.
   - `good` (bool) y `favorite` (bool): si vienen, se asignan al mediaFile creado (con `favorite:true` implica
     `good:true`, como `toggleMediaFavorite`). Si no vienen, quedan en `false` como hoy.
   - Sellar `updatedAt` en el mediaFile creado (coherente con F60). INVARIANTE: sin estos overrides, el resultado
     es byte-equivalente al actual (test lo fija).
2. Añadir `applyDictado(state, preview, opciones)` donde `opciones = { asignaciones: { <orden>: <cuartoId> },
   reemplazar: <bool> }`:
   - Clona el estado (`clone`). Recorre `preview` en orden:
     - Para items con bandera `camaraInvalida`: se omiten (ya se reportaron en revisar).
     - Para `evento:'fotos'` válido: `next = bumpCameraCounter(next, camara, cantidad)`.
     - Para `evento:'toma'`:
       - `targetId` = `asignaciones[orden]` si se asignó en revisar; si no, el `cuartoId` del item (puede ser
         `null` para sin identificar → toma real con cuarto pendiente).
       - Doble pegado: si el token ya existe en `next.mediaFiles` para esa cámara: si `reemplazar` es true, quitar
         primero el existente con `removeMediaFile`; si es false, OMITIR esta toma (no duplicar) y contarla en el
         reporte.
       - Crear la toma con `registerMediaFile(next, { cameraId, counter:numeroDictado, targetId, kind:clase,
         discardReason:motivoDescarte, shotType, movement, note, good, favorite, autor })`. El `shotNumber` lo
         calcula `registerMediaFile`; el token sale de `counter`.
   - Devuelve `{ state: next, report: { creadas, omitidasDuplicado, reemplazadas, fotosAplicadas } }`.
   - NO guarda en D1. El llamador (UI) pasa `next` por `saveNow`.
3. Exportar `applyDictado` en `logic`.
4. Tests (`checklist-logic.test.js`):
   - Invariante de no-regresión: `registerMediaFile` sin overrides produce el mismo mediaFile que antes (token,
     fileCounter, good=false) — fija que la captura no cambió.
   - `applyDictado` del dictado de ejemplo crea 4 mediaFiles Sony (`PIB0082`..`PIB0085`) y 2 dron (`0001`,`0012`),
     con la 84 como `discard/failed good:false`, la 83 `favorite:true good:true`, y la 85 con cuarto recámara.
   - Las 10 fotos del dron NO crean mediaFiles pero el contador del dron avanza (la toma dron siguiente queda en
     `0012`).
   - `shotNumber` se calcula por el camino de captura (dos tomas take del mismo cuarto → 1 y 2).
   - Sin identificar: con `asignaciones` vacío entra como take con `targetId:null` y scene "Sin identificar"; con
     `asignaciones[orden]=<id cocina>` entra apuntando a cocina.
   - Doble pegado: aplicar dos veces el mismo dictado con `reemplazar:false` NO duplica (omite los repetidos);
     con `reemplazar:true` deja el mismo total (quita el viejo, mete el nuevo).
   - El estado resultante pasa por `mergeChecklist` contra una copia con cobertura marcada por otro dispositivo y
     conserva tanto las tomas importadas como la cobertura (no se pisan; reusa el candado de F62).
   - `buildExport(applyDictado(...).state)` sigue dando `version:1` y exporta las tomas importadas con su token.

**Gate:** gate motor. Aceptación: `node --test` verde; `applyDictado` y el refactor exportados/compatibles;
invariante de captura intacto.

---

## F70 — UI: botón de prompt + pantalla de revisar en `checklist.html`, conectada a `saveNow`

> EJECUCIÓN HÍBRIDA — CHECKPOINT VISUAL (excepción al flujo autónomo de build-from-plan). Esta fase NO se
> ejecuta de forma autónoma. El gate de build-from-plan es programático y no puede juzgar el resultado visual.
> Secuencia obligatoria: (1) PROPONER a Bruno el diseño de la pantalla de revisar (layout, tabla por evento,
> cómo se ven las banderas, el selector de cuarto para sin identificar, el control agregar/reemplazar) y
> ESPERAR su aprobación explícita ANTES de tocar `checklist.html`; (2) construir; (3) verificar visualmente en
> el preview/Playwright; (4) Bruno aprueba el resultado visual; (5) recién entonces commitear. Respeta las
> reglas de Bruno: proponer antes de implementar, validar en visor real (el mockup no basta), elegir por valor.
> El gate UI sigue corriendo, pero es condición necesaria, no suficiente: sin el visto bueno visual no hay commit.

**Archivos:** `frontend/checklist.html`.

1. En la pestaña Edición (donde vive Exportar), agregar un punto de entrada "Dictado": un botón "Generar prompt
   de dictado" y un acceso a "Importar dictado". El botón llama a `logic.buildDictadoPrompt(state)`, copia el
   resultado al portapapeles (patrón de copiado ya existente en el archivo) y lo muestra en un área de texto para
   poder copiarlo a mano en celular si el portapapeles falla. Áreas táctiles ≥44px; sin emojis; acentos en texto.
2. "Importar dictado" abre una pantalla/modal con: un `textarea` para pegar el JSON, un botón "Revisar" que llama
   a `logic.parseDictado(texto, state)`, y la zona de resultado.
   - Si `ok:false`, mostrar el `error` de forma clara y no permitir confirmar.
   - Si `ok:true`, renderizar una tabla por evento en `orden`: para tomas → token expandido, cámara, cuarto,
     clase/banderas, shotType/movement, buena/favorita; para fotos → "Fotos dron ×N (avanza contador)". Resaltar
     visualmente `salto`, `duplicado`, `sinIdentificar`, `vocabFuera`, `camaraInvalida`.
   - Para cada fila con `sinIdentificar`, un `select` de cuartos (`state.espacios`) que llena `asignaciones[orden]`.
   - Mostrar el `resumen` y, si hay duplicados contra lo ya capturado, un control para elegir agregar (omitir
     repetidos) o reemplazar.
3. "Confirmar" llama a `logic.applyDictado(state, preview, { asignaciones, reemplazar })`, toma `result.state` y lo
   guarda por el FLUJO NORMAL (`saveNow`, con `rev`/fusión de F62) — NO escribir un guardado que reemplace el
   documento entero por fuera de `saveNow`. Tras guardar, cerrar el modal y refrescar la vista de tomas.
4. Verificación inline de sintaxis (debe imprimir `inline OK`):
   `node -e "const fs=require('fs');const h=fs.readFileSync('frontend/checklist.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');require('vm').compileFunction(m);console.log('inline OK')"`
5. Verificación visual (evidencia en `docs/superpowers/verificacion/f70/`, capturas en commit de docs SEPARADO):
   - Levantar estático: `cd frontend && python3 -m http.server 8092` → `http://localhost:8092/checklist.html?demo=1&cb=1`.
   - Con Playwright MCP (o el preview): generar el prompt y capturar; pegar el JSON del dictado de ejemplo, pulsar
     Revisar y capturar la tabla con las banderas (salto en la toma dron, sin identificar, descarte); asignar el
     cuarto de una fila sin identificar; Confirmar y capturar la bitácora con las tomas ya creadas (antes/después).
   - Desplegar el worker al preview para verificación en celular (Claude despliega):
     `cd worker && npx wrangler deploy -c wrangler.preview.toml`.

**Gate:** gate UI. Aceptación: `inline OK`; sin emojis; el flujo Revisar→Confirmar guarda por `saveNow`; evidencia
visual antes/después adjunta (en su commit de docs aparte).

---

## F71 — Cierre: documentación, evidencia y verificación end-to-end

**Archivos:** `docs/RONDAS.md`, `docs/ARQUITECTURA.md`, `docs/EXPORT_METADATA_HANDOFF.md`, y evidencia bajo
`docs/superpowers/verificacion/` (capturas en commit de docs separado por el falso positivo del gate con PNG).

1. `docs/RONDAS.md`: entrada nueva (siguiente Rxx; al cierre de este plan corresponde R114 si no se intercaló otra
   ronda — verificar el tope actual) con hora exacta de Monterrey
   (`TZ="America/Monterrey" date "+%Y-%m-%d %H:%M:%S %Z"`), resumiendo el importador de dictado (F67–F71): prompt
   generado en vivo, formato `bitacora-dictado` v1, validación de secuencia, fotos del dron como avance de
   contador, paso de revisar, creación por el camino de captura, guardado por `rev`/fusión.
2. `docs/ARQUITECTURA.md`: sección "Dictado de bitácora (import)" que describa el patrón (la app genera el prompt;
   Gemini estructura; la app valida y revisa; escribe por `registerMediaFile`/`bumpCameraCounter` y `saveNow`),
   con punteros a `buildDictadoPrompt`/`parseDictado`/`applyDictado`.
3. `docs/EXPORT_METADATA_HANDOFF.md`: nota corta de que la bitácora puede llenarse por dictado y que el esquema de
   export `version:1` no cambia (el dictado produce los mismos mediaFiles que la captura manual).
4. Verificación end-to-end contra un contrato de PRUEBA desechable en el preview (la D1 del preview es la real):
   crear un contrato de prueba, importar el dictado de ejemplo, exportar `bitacora-<folio>.json`, confirmar que el
   esquema es el de `EXPORT_METADATA_HANDOFF.md §2` (la app de metadatos lo leería sin fricción), y BORRAR el
   contrato de prueba. Guardar la evidencia (JSON exportado anonimizado o recortado, captura del export) en
   `docs/superpowers/verificacion/f71/`.
5. Correr toda la suite: `node --test frontend/checklist-logic.test.js` (verde, >242).

**Gate:** gate cierre (docs). Aceptación: docs actualizadas con hora de Monterrey; evidencia end-to-end adjunta;
suite verde; contrato de prueba borrado.

---

## Orden de ejecución y dependencias

Ejecución HÍBRIDA (acordada con Bruno):
- F67, F68, F69 y F71 se ejecutan con build-from-plan de forma casi autónoma: gates programáticos como revisión,
  un subagente de contexto fresco por fase, un commit por fase. Son lógica de motor y docs con verificación
  objetiva (node --test, invariantes, corrida end to end).
- F70 es un CHECKPOINT VISUAL, no autónomo (ver la nota al inicio de la fase): propuesta de diseño y aprobación de
  Bruno antes de tocar archivos, verificación visual en el preview, y aprobación visual antes del commit. El gate
  UI es condición necesaria pero no suficiente.

Dependencias:
- F67 → F68 → F69 son motor y van en serie (F68 usa el criterio de cámaras activas de F67; F69 usa el preview de
  F68). F70 depende de F67–F69 (consume las tres funciones). F71 depende de F70.
- Ninguna fase es paralelizable: cada una construye sobre la anterior.
- Una fase = un commit `Rxx — Fnn: …` (Rxx secuencial desde R114) = una unidad de revisión. Rama
  `checklist-cambios-2026-06-07`. Nada a `main`, nada de PR, worker SOLO al preview.
- Si una fase exige cambiar este plan (p. ej. el formato), actualizar primero el plan y registrar por qué.
