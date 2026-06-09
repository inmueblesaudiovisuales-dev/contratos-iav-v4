# Handoff — Checklist IAV: dictado de bitácora (Meta A) y tomas sugeridas con fotos (Meta B)

> Documento de continuidad al 2026-06-09. Reemplaza como referencia más reciente al handoff
> `PROMPT-CONTINUIDAD-2026-06-09-metadatos-ia.md` (sigue válido para el contexto general; este lo
> actualiza con todo lo hecho después: el incidente de pérdida, la recuperación, la prevención de
> concurrencia y los cambios de captura de secuencia). No omite nada importante. Léelo completo.

---

## 0. Quién es Bruno y cómo trabajar con él (reglas duras)

- IAV (Inmuebles Audiovisuales) es un negocio de media (foto, recorridos 360, video, drone) para
  inmuebles. Bruno es el dueño/operador. Trabaja con un equipo (p. ej. Danna, fernanda).
- Estilo de respuesta en el chat: español formal con acentos y ñ; NADA de asteriscos de markdown
  (`**`); sin emojis; sin coloquialismos mexicanos. En el producto: sin emojis nunca; acentos en
  texto visible, pero ids/clases/ids-de-icono SIN acentos.
- Proponer antes de implementar: ante cualquier cambio visual, de layout o de comportamiento,
  describe el resultado propuesto y espera aprobación explícita antes de tocar archivos. Para un bug
  con causa raíz clara puedes proceder; los cambios de diseño se acuerdan primero.
- Recomendar por valor: cuando haya opciones, elige y recomienda la mejor para el proyecto, no la más
  fácil de construir. Al presentar opciones, incluye siempre la mejor (no muestres A/B/C sin haber
  pensado si hay una D superior).
- No empujar el siguiente paso: Bruno marca el ritmo. No cierres cada mensaje sugiriendo avanzar.
- Despliegues: Claude SIEMPRE despliega lo de Cloudflare y GitHub; Bruno nunca lo hace a mano.
- Bruno pega archivos completos, no edita líneas sueltas; deja el archivo local listo antes de pedirle
  que pegue.
- Verificación con evidencia, no afirmaciones: corre comandos y, en UI, verifica VISUALMENTE (capturas
  antes/después con Playwright o el preview). No declares nada "listo" sin verlo.
- Flujo de dos sesiones: una sesión planea/prompt (esta), otra programa. Este documento es el puente.
- El editor en producción está tras Cloudflare Access: la sesión de construcción verifica en LOCAL o en
  el PREVIEW; Bruno verifica el editor en su celular/prod.

---

## 1. Repos, ramas, URLs, despliegue

### Checklist (lo principal)
- Repo local: `/Users/brunogutierrez/contratos-iav-v4` (hay un clon en
  `/Users/brunogutierrez/Documents/CLAUDE/contratos-iav-v4`; USA EL PRIMERO).
- GitHub: `inmueblesaudiovisuales-dev/contratos-iav-v4`. Production branch = `main`.
- REGLA: push a `main` despliega a PRODUCCIÓN vía GitHub Actions (~1 min). NO se toca main en este trabajo.
- Rama de trabajo: `checklist-cambios-2026-06-07`. Todo vive ahí, pusheado, NO fusionado a main.
- Stack: Cloudflare Workers + D1 (SQLite). Frontend estático en `frontend/`. Backend asíncrono opcional
  en Google Apps Script (`adapter/`) para Drive/Calendar/correos/PDF. D1 ignora foreign keys (cascadas a
  mano con `DB.batch`).
- Preview aislado a nivel worker (comparte la D1 real; usar `?demo=1` para no tocar datos):
  `cd worker && npx wrangler deploy -c wrangler.preview.toml`
  URL base: `https://contratos-iav-v4-preview.inmueblesaudiovisuales.workers.dev`
  Demo: `…/checklist?demo=1&cb=N` (`?demo=1` no persiste; `&cb=N` evita cache en celular).
  OJO: el preview comparte la D1 de producción (mismo `database_id`). Las migraciones aplicadas al
  "preview" caen en la D1 real. Para pruebas de guardado real, usar un contrato de PRUEBA desechable y
  borrarlo. (Una mejora futura sería una D1 separada para preview.)
- Token de un checklist = el `token` del contrato. URL real del editor:
  `https://contratos.inmueblesaudiovisuales.com/checklist?token=<uuid>`.

### App de metadatos (Meta C, futura)
- Repo local: `/Users/brunogutierrez/iav-metadata-app`. GitHub privado, branch `master`. NO se toca hasta
  terminar checklist.

---

## 2. Estado ACTUAL del checklist (qué pasó en esta sesión)

### 2.1 Incidente de pérdida de datos y recuperación (resuelto)
- Bruno marcó ~104 tomas de video (contrato IAV-2606.06-A, Alberto Valles Muñoz) y desaparecieron.
- Causa: el guardado reemplazaba el documento ENTERO con "last-write-wins". El equipo marcaba cobertura
  (foto/360) desde otros dispositivos al mismo tiempo; su guardado, que nunca tuvo las tomas, pisó el
  estado de Bruno. Confirmado al segundo con D1 Time Travel: a las 2026-06-06T19:12:02Z había 104
  mediaFiles; a las 19:26:48Z un guardado sin tomas las dejó en 0.
- Recuperación: con D1 Time Travel (restaurar a un punto, leer, restaurar de vuelta con el bookmark
  capturado) se rescataron 104 mediaFiles (88 Sony + 16 drone; 83 take, 12 discard, 9 omitted). Guardados
  en `/Users/brunogutierrez/contratos-iav-v4/recuperacion-mediafiles-IAV-2606.06-A.json` (NO commitear,
  trae PII). Ese archivo es el respaldo del PASO 0 pendiente.
- Memoria del incidente: `memory/project_checklist_perdida_concurrencia.md`.

### 2.2 Prevención de concurrencia (R113, F60–F65) — construida, probada, en la rama, NO integrada
Cierra el bug de forma estructural y agrega recuperación en capas. Commits en la rama:
- F60 — `logic.mergeChecklist(base, incoming)`: une dos estados por id (gana `updatedAt` mayor), funde
  cobertura por servicio, une pisos y guide. Sellos `updatedAt` en mutaciones de mediaFile.
- F61 — Lápidas: `state.tombstones` = [{id, deletedAt}]. Los borrados (mediaFile, cuarto, piso, droneItem,
  asesorPunto) registran lápida con `logic.addTombstones`/`clearTombstone`; la fusión no revive lo borrado
  salvo reedición posterior; poda a 30 días en `normalizeChecklistData`.
- F62 — Candado `rev` (cierra el bug): columna `rev` por fila de `checklist`; `guardarChecklist` hace
  compare-and-swap (`UPDATE … WHERE rev=?`); si la rev cambió devuelve `{conflict:true, cuartos, rev}`.
  El cliente (`saveNow`) fusiona y reintenta; `poll` y `cargar` fusionan en vez de reemplazar. El cliente
  manda `baseRev` y guarda `currentRev`.
- F64 — Recuperación: tabla `checklist_historial` (últimas 50 versiones por contrato) en cada guardado
  exitoso (`archivar` en checklist.js); respaldo horario de cada checklist a R2 (bucket
  `iav-checklist-backups`, binding `CHECKLIST_BACKUP`, `backupChecklistToR2` en cron.js).
- F65 — Cierre: docs (RONDAS R113, ARQUITECTURA sección de concurrencia), evidencia en
  `docs/superpowers/verificacion/f62/` y `f64/`.
- Verificado: 242 pruebas `node --test` (incl. candado del incidente: 104 tomas sobreviven a un guardado
  de cobertura con rev vieja); prueba de concurrencia contra el worker desplegado al preview (script
  `docs/superpowers/verificacion/f62/concurrency-test.cjs`).

ESTADO de la D1 REAL: ya se aplicaron a producción las piezas aditivas (columna `checklist.rev` = r65;
tabla `checklist_historial` = r66) y el bucket R2 existe. Son inofensivas para el worker de prod actual
(las ignora). Para ACTIVAR la prevención en prod basta integrar la rama a main (despliega el worker
nuevo). No faltan migraciones.

### 2.3 Captura de secuencia (F66) — construida, probada, en la rama
- "Archivo actual" en vez de "anterior": `initializeCameraSequence(state, {…, archivoActual:true})` arranca
  la secuencia EN el número capturado (no +1). La UI (`aplicarSecuencia`) siempre pasa `archivoActual:true`.
  Sin la opción se conserva el comportamiento previo (+1), probado por test.
- Sugerencia de nombre para Sony: el campo viene pre-rellenado con el nombre COMPLETO del primer archivo
  del rodaje `YYYYMMDD_PIB0001` (fecha de hoy + prefijo + número con relleno de 4 dígitos), con el número
  seleccionado. Arranca en 1 porque Bruno reinicia la numeración cada rodaje. Constante `SONY_DIGITOS = 4`.
- DJI/Osmo: SIN sugerencia (campo vacío, placeholder como antes), hasta que Bruno deje sus archivos
  consistentes. Es decisión explícita de Bruno: por ahora no auto-sugerir DJI.
- Guarda: si el campo Sony queda sin número (solo el prefijo), avisa "Completa el número del archivo".
- Helper `sugerenciaNombre(camera)` (solo sony). Dos pantallas tocadas: `abrirSecuencia` y
  `abrirSecuenciaAsesor`, por un solo punto de arranque (`aplicarSecuencia`).

### 2.4 PENDIENTES (no ejecutados a propósito)
- Integrar la rama a main (Bruno lo hará cuando integre TODA la rama; no antes).
- PASO 0: reinsertar los 104 mediaFiles recuperados en el contrato IAV-2606.06-A, ya con el sistema vivo,
  FUSIONANDO con la cobertura actual del equipo (no pisar). Solo después de integrar (si no, el worker
  viejo de prod los podría volver a pisar).

---

## 3. El contrato de datos y el modelo (fuente de verdad para A y B)

Fuentes de verdad: `frontend/checklist-logic.js` (motor puro, 242 pruebas), `frontend/checklist-logic.test.js`,
`docs/EXPORT_METADATA_HANDOFF.md`. El export es `buildExport(state, meta)` → `bitacora-<folio>.json`,
`version:1` (intacto; los campos del modo guiado son aditivos).

### 3.1 Cámaras (`state.cameras`, `CAMERA_DEFAULTS`)
| id | label | mode | kind |
|---|---|---|---|
| sony-main | Sony principal | video | sony |
| osmo-pocket-3 | Osmo Pocket 3 | video | dji (opcional) |
| drone-dji | DJI Air 3 | drone | dji |
| sony-asesor | Sony FX30 | asesor | sony (role video) |
| osmo-asesor | Osmo + DJI Mic | asesor | dji (role audio) |
- `camera.activeSegmentId` apunta al segmento de secuencia activo. `state.activeCameraByMode`.

### 3.2 Secuencias / tokens (`state.sequenceSegments`)
- Un segmento por tramo de cámara: `{ id, cameraId, prefixHint, suffixHint, counterWidth, counterStart,
  counterNext, exampleFilename, createdAt }`.
- `parseFilenameSequence(filename, kind)`: del nombre saca la ÚLTIMA corrida de dígitos como contador;
  `prefixHint` = letras justo antes del contador (para sony; para dji `prefixHint=''`), `counterWidth` =
  longitud de esos dígitos.
- `formatFileToken(segment, counter)` = `prefixHint + pad(counter, counterWidth)`.
- Token Sony = `PIB` + 4 dígitos (`PIB0082`). El nombre real `YYYYMMDD_PIB0082.MP4` CONTIENE el token.
- Token DJI/drone = 4 dígitos (`0082`), que es el contador dentro de `DJI_<14 dígitos timestamp>_0082_<sufijo>.MP4`.
  El modelo del dron viene EMBEBIDO en el MP4 (exiftool `Encoder`), no en el SRT.
- Emparejamiento (app de metadatos): "el nombre real CONTIENE el token". Por eso el timestamp único del DJI
  no estorba: solo importa que el contador con relleno esté dentro.

### 3.3 mediaFiles (las tomas; lo que crea/edita la captura)
`{ id, cameraId, segmentId, fileCounter, fileToken, targetId, scene, scenePath, shotNumber,
   kind('take'|'discard'|'omitted'), discardReason('failed'|'unrelated'|'empty'|null), good, favorite,
   note, shotType, movement, sentido, pared, suggestionId, pairId, author, createdAt, updatedAt }`.
- Helpers del motor: creación de toma (inserta con counter/token del segmento), `updateMediaFile`,
  `removeMediaFile` (renumera contadores de los vivos + registra lápida), `toggleMediaGood`,
  `toggleMediaFavorite`. CUALQUIER importador (dictado) DEBE crear mediaFiles por estos caminos o uno
  equivalente para mantener token/contador/shotNumber consistentes.
- foto y 360 NO son mediaFiles: son COBERTURA por cuarto, viven en `espacio.estados[servicio]`.

### 3.4 Espacios y cobertura
- `state.espacios`: `{ id, nombre, parentId, orden, clave, zona('interior'|'exterior'|'amenidades'),
  piso, estados, categoria }`. `state.pisos` (array de strings).
- `estados[servicio]` = `{ estado('pendiente'|'hecho'|'no_aplica'), autor, updatedAt }` para foto/t360/
  video/drone/asesor. La cobertura del equipo se marca aquí.
- Emparejar por ID de cuarto, nunca por nombre (acentos, renombrados). Lo no identificado → "sin_identificar".

### 3.5 Vocabulario del modo guiado (cerrado)
- `SHOT_TYPES` (12): wide, general, medio, detalle, transicion, pov, contrapicado, ventana, reveal,
  simetrica, textura, exterior. `MOVEMENTS` (user-facing 8: push_pull, push_in, pull_out, pan, tilt,
  travel, orbit, reveal; más históricos). `EDIT_ORDER` (orden de montaje por tipo). `PROPERTY_FOCUS`
  (frase de foco por tipo de propiedad). Ver `docs/EXPORT_METADATA_HANDOFF.md §2a`.

### 3.6 tombstones (nuevo, F61)
- `state.tombstones` = [{id, deletedAt}]. La fusión los respeta; se podan a 30 días. Para pisos, la lápida
  es `'piso:'+nombre`.

---

## 4. Las dos metas a construir

> Patrón común (arquitectura): la app NO es la inteligente. La app conoce su formato (cuartos con id,
> vocabulario, cámaras, contadores) y GENERA un prompt; Gemini (multimodal) hace el trabajo pesado (ver
> fotos / entender el dictado); la app tiene una PUERTA DE IMPORT que VALIDA y un paso de REVISAR antes de
> escribir en firme. Dos principios: (1) el prompt se genera desde el estado vivo; (2) todo import pasa por
> revisar antes de quedar en firme.

### Meta A — Dictar la bitácora (la de más valor; arrancar por aquí)

Flujo real: Bruno arma cuartos + pone números iniciales de cámara → graba un Voice Memo dictando las tomas,
manos libres → transcribe el audio → la app genera un PROMPT → lo pega en Gemini + pega la transcripción →
Gemini devuelve un JSON importable → Bruno lo pega en checklist.html → paso de REVISAR → confirma y se
llena la bitácora (mediaFiles + cobertura).

Decisiones tomadas con Bruno:
- Durante el rodaje ya NO marca tomas: solo dicta. El marcado manual de hoy queda como plan B.
- La APP es la dueña del número de archivo. Gemini solo transcribe el número final dictado; la app lo
  expande al token con el formato de cada cámara y VALIDA la secuencia (saltos/duplicados). El contador,
  que es la llave de emparejamiento, nunca depende de que Gemini sume bien.
- El formato de regreso es JSON versionado.

PAR ACORDADO (prompt + formato de import) — esto es lo que hay que construir:

PROMPT (lo genera checklist.html desde el estado vivo; inyecta cámaras activas con su contador y formato,
cuartos con id+piso, y el vocabulario cerrado):
```
Eres un asistente que ordena la bitácora de un rodaje de bienes raíces a partir de un dictado
transcrito. NO inventas: solo estructuras lo que se dictó.
CÁMARAS (cada carril lleva su propio número; <contador> = nº actual de cada cámara):
- sony-main · "Sony principal" · video · nº ~{contador}. POR DEFECTO si no se menciona otra.
- drone-dji · "DJI Air 3" · drone · nº ~{contador}.   (solo las cámaras activas del rodaje)
FRASES QUE CAMBIAN DE CÁMARA: "cambio de cámara a drone", "cambio a Osmo", "de regreso a la Sony".
CUARTOS (mapea lo hablado al id; ambiguo o inexistente -> "sin_identificar"):
[ { "id":"{id}", "nombre":"Cocina", "piso":"Planta baja" }, ... ]
VOCABULARIO CERRADO (usa SOLO estos ids; lo desconocido va a "nota"):
  shotType: wide, general, medio, detalle, transicion, pov, contrapicado, ventana, reveal, simetrica,
            textura, exterior
  movement: push_pull, push_in, pull_out, pan, tilt, travel, orbit, reveal
  mishears: "pushing"/"push"->push_in, "rivil"/"revil"->reveal, "paneo"->pan, "órbita"->orbit,
            "plano general"->general
REGLAS DE LECTURA:
- Cada toma empieza en "toma N": N es el FINAL del número de archivo de la cámara activa.
- "fallida/no sirve/mal expuesta" = descarte (fallida->failed, basura/no relacionado->unrelated,
  vacío/accidental->empty; por defecto failed).
- "quedó bien/buena" = buena; "favorita" = favorita; por defecto buena salvo descarte.
- "N fotos capturadas" o "N tomas 360" = COBERTURA, no archivos: va en "cobertura".
- Si me corrijo ("84 fallida... no, buena"), honra la ÚLTIMA corrección.
- Cuarto ambiguo ("recámara" habiendo tres) -> "sin_identificar".
REGLAS DURAS: responde SOLO el JSON; solo ids de cuarto de la lista o "sin_identificar"; shotType/
movement solo del vocabulario; no inventes tomas. Formato de respuesta abajo.
```

FORMATO DE IMPORT (lo que Gemini devuelve; lo valida la app):
```json
{
  "formato": "bitacora-dictado",
  "version": 1,
  "tomas": [
    { "orden": 1, "camara": "sony-main", "numero": 82, "cuartoId": "esp-abc",
      "shotType": "general", "movement": "push_in", "tipo": "take",
      "motivoDescarte": null, "buena": true, "favorita": false, "nota": "" }
  ],
  "cobertura": [ { "cuartoId": "esp-abc", "servicio": "foto", "cantidad": 10 } ]
}
```
La app, al importar: expande `numero` al token con el segmento de cada cámara; valida la secuencia
(saltos/duplicados); mapea `cuartoId` y calcula `shotNumber`; crea los mediaFiles (take/discard);
`cobertura` se registra como foto/360 (no crea archivos). Nada en firme hasta REVISAR.

PASO DE REVISAR (parte del MVP, no extra): lista cada toma con su token ya expandido, cámara, cuarto,
tipo y banderas; resalta saltos/duplicados de contador, "sin_identificar" (se asigna ahí), vocabulario
fuera de catálogo (queda como nota), y doble pegado ("agregar/reemplazar N", nunca duplica en silencio).
Confirmar -> escribe los mediaFiles.

Ejemplo real de cómo dicta Bruno: "toma 82 push in cocina plano general. toma 83 detalle cocina, quedó
bien, favorita. toma 84 fallida, no está bien expuesta. toma 85 recámara reveal pared izquierda. cambio
de cámara a drone. toma 1 drone fachada reveal. 10 fotos capturadas. toma 2 drone."

### Meta B — Tomas sugeridas por IA con fotos (regresan a la app)

Ya existe media maquinaria (hoy es texto, sin fotos):
- `buildPropuestaPrompt(state)` (checklist-logic.js:1130): genera un prompt desde el estado vivo con
  vocabulario cerrado e ids de cuarto; pide tomas adicionales específicas POR CUARTO basadas en una
  descripción. Formato de respuesta `{ "porCuarto": { "<id>": [ {nombre, shotType, movement, enfoque,
  priority} ] } }`.
- `parsePropuesta(texto, state)` (1173): importador tolerante (limpia fences, busca el bloque JSON, parsea
  tolerante; mapea por id de cuarto, valida vocab, reporta lo ignorado; límites MAX_PER_ROOM=6, MAX_TOTAL=40).
- Se aplica a `state.guide.proposal` y se consume con `proposalShotsFor(state, targetId)` /
  `suggestionsForTarget` para mostrar las sugerencias por cuarto durante la captura.

Meta B = extender esto para que sea con FOTOS: el prompt le dice a Bruno QUÉ fotos tomar (cuántas y de qué:
cada cuarto, accesos, vistas); Bruno se las pasa a Gemini junto con el prompt; Gemini, viendo las fotos
reales, propone sugerencias específicas de ESA casa; el formato importable es compatible y vuelve a las
sugerencias por cuarto. Decisión de Bruno: SÍ regresan a la app (no es guía mental). Probablemente vuelve
obsoleta la librería de sugerencias fija ("ya no sé si la quiero"); la versión con fotos es mejor porque se
adapta a la casa real.

El PRIMER ENTREGABLE de cada meta es el PAR (prompt exacto generado por la app + formato JSON de import).
Para A ya está acordado (arriba). Para B hay que cerrarlo (sobre la base de buildPropuestaPrompt/parsePropuesta,
añadiendo el "qué fotos tomar" al prompt y, si hace falta, ampliar el formato).

---

## 5. Todos los bugs previstos y sus soluciones

### Comunes a A y B
- Gemini devuelve texto sucio (explicaciones, ```json, comas finales). -> El importador limpia fences,
  busca el bloque JSON, parsea tolerante; si falla, error claro y NO aplica nada a medias. (Ya lo hace
  `parsePropuesta`; replicar en el de dictado.)
- Nombres de cuarto que no empatan (acentos, "Recámara principal" vs "Recamara", renombrados). -> Emparejar
  por ID de cuarto, no por nombre. El prompt lleva el id; Gemini lo regresa; lo no empatado se reporta, no
  se inventa. Normalizar acentos/case como respaldo.
- Gemini alucina cuartos/tomas inexistentes. -> Solo aceptar ids existentes; el resto se lista aparte.
- Vocabulario fuera de catálogo. -> El prompt incluye las claves válidas (SHOT_TYPES/MOVEMENTS); lo
  desconocido se guarda como texto/nota o se marca, no truena.
- Versión del formato. -> El JSON lleva versión; si sube, el importador avisa antes de procesar.
- Pegado incompleto/parcial. -> Validar completitud (brackets); no aplicar parcialmente.
- Cambia el esquema y el prompt queda viejo. -> El prompt se GENERA en vivo desde el esquema; nunca a mano.

### Meta A (dictado), propios — mayor riesgo: escribe el log que se vuelve metadato
- Números mal transcritos (84 vs 94, "PIB" parcial). Es la llave de emparejamiento. -> Doble red: (a) la app
  conoce la secuencia esperada (nº inicial + incrementos) y MARCA saltos/duplicados; (b) revisar muestra
  cada toma con su número para confirmar.
- Dictas solo el final ("82"); el archivo real es PIB0082. -> La app expande con `formatFileToken` del
  segmento de cada cámara (mismo formato que usa la captura).
- Quién manda en los contadores. -> Gemini propone; la app VALIDA contra su contador y marca diferencias;
  Bruno confirma. La app es la fuente de verdad del número.
- "Cambio de cámara a drone": cambia de carril y de contador. -> El prompt enumera las frases de cambio;
  Gemini emite la cámara por toma; el importador valida que exista y rutea al segmento correcto.
- "10 fotos capturadas": cobertura, no archivos. -> El prompt distingue foto/360 (cobertura, un conteo) de
  video/drone (tomas numeradas). El importador marca cobertura en `estados`, no crea mediaFiles.
- Descartes con motivo. -> Mapear frases al enum (failed/unrelated/empty); si no queda claro, failed; se ve
  en revisar.
- Buena/favorita. -> Mapear; por defecto buena=sí salvo descarte.
- Cuarto ambiguo (tres recámaras). -> "sin_identificar"; Bruno asigna en revisar.
- Te corriges hablando ("84 fallida... no, buena"). -> Honrar la última corrección; revisar lo atrapa.
- Doble pegado. -> El import dice "agregar/reemplazar N" y avisa si ya hay tokens iguales; nunca duplica en
  silencio.
- Cámara por defecto en video: si no dices cámara, asume sony-main. -> El prompt lo deja explícito.
- Vocabulario hablado mal transcrito ("push in"->"pushing"). -> El prompt da el vocabulario + mishears.
- Dónde corta una toma (run-on). -> El delimitador es "toma N"; el prompt instruye a partir ahí; revisar
  atrapa mis-splits.
- CONSISTENCIA con la captura: el importador debe crear mediaFiles por el MISMO camino que la captura
  (counter/token/shotNumber/segmento), no a mano, para no romper la renumeración ni el export.
- Concurrencia: si Bruno pega el dictado mientras el equipo marca cobertura, NO se pisan (ya está F62 en la
  rama). Pero el import del dictado debe entrar por el flujo normal de guardado (con `rev`/fusión).

### Meta B (sugerencias con fotos), propios
- Importar sugerencias pisa lo ya capturado. -> El import de sugerencias SOLO toca `state.guide.proposal`,
  jamás los mediaFiles ni la cobertura. Confirmar antes de reemplazar.
- Sugerencias viejas (cambiaste cuartos después de generar el prompt). -> El prompt lleva el id de cuarto;
  al importar, aplica solo lo que empata y avisa del resto.
- No sabes qué fotos tomar. -> El prompt te dice cuántas y de qué (cada cuarto, accesos, vistas).
- Fotos enormes / muchas. -> Es flujo manual (Bruno se las pasa a Gemini); la app no procesa imágenes.

---

## 6. Documentos a leer (en orden)

1. `CLAUDE.md` (reglas del repo).
2. ESTE documento.
3. `docs/EXPORT_METADATA_HANDOFF.md` y `buildExport` en `frontend/checklist-logic.js` (el contrato de datos).
4. `docs/superpowers/PROMPT-CONTINUIDAD-2026-06-09-metadatos-ia.md` (contexto previo: armar cuartos, app de
   metadatos, decisiones).
5. `docs/superpowers/plans/2026-06-08-checklist-concurrencia-prevencion-plan.md` (el plan F60–F65 ejecutado).
6. `docs/RONDAS.md` (R113 al inicio: resumen de la prevención).
7. `docs/ARQUITECTURA.md` (mapa de relaciones, D1, sección "Concurrencia del checklist").
8. Memorias relevantes en `memory/`: `project_checklist_perdida_concurrencia.md`,
   `project_metadatos_ia_gemini.md`, `project_app_metadatos_premiere.md`, `project_iconos_subset_checklist.md`,
   y los `feedback_*` de estilo/trato.
9. Para el código de captura/secuencia: `frontend/checklist.html` (`abrirSecuencia`, `abrirSecuenciaAsesor`,
   `aplicarSecuencia`, `sugerenciaNombre`) y motor (`initializeCameraSequence`, `parseFilenameSequence`,
   `formatFileToken`, `getCameraSequence`).

---

## 7. Comandos de verificación

- Tests del motor: `node --test frontend/checklist-logic.test.js` (debe dar 242 pass / 0 fail).
- Compilar el JS inline de checklist.html (atrapa errores de sintaxis):
  `node -e "const fs=require('fs');const h=fs.readFileSync('frontend/checklist.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');require('vm').compileFunction(m);console.log('inline OK')"`
- Gate de fase (DESPUÉS de commitear; compara HEAD~1..HEAD). Para un cambio que abarca varios archivos, pasa
  TODOS los archivos tocados en la lista de alcance, separados por coma:
  `bash .claude/skills/build-from-plan/phase-gate.sh "<archivos,permitidos>" "version: 1" "normalizeChecklistData"`
  GOTCHA: el check "sin emojis" lee todo archivo cambiado; un woff2 pasa, pero las PNG dan FALSO POSITIVO.
  Commitea capturas en un commit de docs SEPARADO del commit de código.
- Levantar estático para Playwright: `cd frontend && python3 -m http.server 8092` ->
  `http://localhost:8092/checklist.html?demo=1&cb=N`.
- Desplegar worker al preview (Claude despliega): `cd worker && npx wrangler deploy -c wrangler.preview.toml`.
- Consultar D1 (solo lectura para diagnóstico):
  `cd worker && npx wrangler d1 execute contratos-iav-v4 --remote --json --command="SELECT …"`.
- Para probar guardado/API contra el preview SIN tocar clientes: crear un contrato de PRUEBA, probar, y
  BORRARLO (ver `docs/superpowers/verificacion/f62/concurrency-test.cjs` como ejemplo).
- Playwright disponible como MCP (`mcp__plugin_playwright_playwright__*`); puede quedar bloqueado si hay un
  Chrome abierto ("Browser is already in use"): reintenta o usa la D1/API directo para la evidencia dura.

---

## 8. Primeros pasos sugeridos para el chat nuevo (no programar sin acordar)

1. Lee la sección 6.
2. Confirma con Bruno arrancar por la Meta A (dictado); el PAR ya está acordado (sección 4). Antes de
   programar, repásalo con él por si quiere afinar el prompt o el formato.
3. Diseña el import de dictado y el paso de REVISAR como parte del MVP. Reutiliza el patrón de
   `parsePropuesta` (limpieza tolerante, mapeo por id, reporte). Crea mediaFiles por el camino de la
   captura para no romper tokens/contadores.
4. Aterrízalo en un plan por fases (`docs/superpowers/plans/AAAA-MM-DD-…-plan.md`) ejecutable con
   `build-from-plan`: una micro-fase = un commit con gate, rama `checklist-cambios-2026-06-07`, NUNCA main,
   worker solo al preview, pruebas + verificación visual, los bugs conocidos (sección 5) como pasos
   verificables.
5. Sigue las reglas de la sección 0. Claude despliega; Bruno verifica el editor en su celular.

---

## 9. La app de metadatos (Meta C, FUTURA — solo contexto)

`/Users/brunogutierrez/iav-metadata-app` (Electron + React + `exiftool-vendored`, macOS arm64). Lee el
`bitacora-*.json`, empareja cada registro con el archivo real por consecutivo (el nombre CONTIENE el token)
y escribe XMP que Premiere lee (Scene, Shot, Good, Comment/LogComment, Description, Camera Roll/TapeName).
NO se toca hasta terminar checklist. Fase 2 futura: namespace `XMP-IAV` para los campos del modo guiado
(ver `docs/EXPORT_METADATA_HANDOFF.md §7`). El flujo de dictado (Meta A) produce una bitácora más rica que
esta app debe consumir sin fricción.

Fin del handoff.
