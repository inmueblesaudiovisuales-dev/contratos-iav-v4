# Prompt de continuidad — Checklist IAV + app de metadatos + flujos con IA (Gemini)

> Pégame completo como primer mensaje en el chat nuevo. Eres Claude Code trabajando con Bruno
> (Inmuebles Audiovisuales, IAV). Este documento te pone al día de TODO: lo ya hecho, las reglas,
> el contrato de datos, la app de metadatos, las dos próximas metas y todos los errores previstos
> con sus soluciones. No omitas nada de aquí; es el estado real al 2026-06-09.

---

## 0. Quién es Bruno y cómo trabajar con él (reglas duras)

- IAV es un negocio de media (foto, recorridos 360, video, drone) para inmuebles. Bruno es el dueño/operador.
- Estilo de respuesta en el chat: español formal con acentos y ñ; NADA de asteriscos de markdown (`**`);
  sin emojis; sin coloquialismos mexicanos. En el producto: sin emojis nunca; acentos en texto visible,
  pero IDs/clases/ids-de-icono SIN acentos.
- Proponer antes de implementar: ante cualquier cambio visual, de layout o de comportamiento, describe el
  resultado propuesto y espera aprobación explícita de Bruno antes de tocar archivos. Para arreglar un bug
  evidente con causa raíz clara, puedes proceder, pero los cambios de diseño se acuerdan primero.
- Recomendar por valor: cuando haya opciones, elige y recomienda la mejor para el proyecto, no la más fácil
  de construir. Al presentar opciones, incluye siempre la mejor (no muestres A/B/C sin haber pensado si hay
  una D superior).
- No empujar el siguiente paso: Bruno marca el ritmo. No cierres cada mensaje sugiriendo avanzar.
- Despliegues: Claude SIEMPRE despliega lo de Cloudflare y GitHub; Bruno nunca lo hace a mano.
- Bruno pega archivos completos, no edita líneas sueltas; deja el archivo local listo antes de pedirle que pegue.
- Verificación con evidencia, no afirmaciones: corre comandos y, en UI, verifica VISUALMENTE con Playwright
  (capturas antes/después). No declares nada "listo" sin verlo.
- Flujo de dos sesiones: una sesión planea/prompt, otra programa. Este documento es el handoff entre ellas.

---

## 1. Repos, ramas y URLs

### Checklist (lo principal ahorita)
- Repo local: `/Users/brunogutierrez/contratos-iav-v4` (hay un clon en `/Users/brunogutierrez/Documents/CLAUDE/contratos-iav-v4`, usa el primero).
- GitHub: `inmueblesaudiovisuales-dev/contratos-iav-v4`. Production branch = `main`.
- REGLA: push a `main` despliega a PRODUCCIÓN vía GitHub Actions (~1 min). En este trabajo NO tocamos main.
- Rama de trabajo actual: `checklist-cambios-2026-06-07`. Todo lo de abajo vive ahí, pusheado, NO fusionado a main.
- Stack: Cloudflare Workers + D1 (SQLite). Frontend estático en `frontend/`. D1 ignora foreign keys (cascadas a mano con DB.batch).
- Preview aislado (para celular, NO es producción):
  `cd worker && npx wrangler deploy -c wrangler.preview.toml`
  URL: `https://contratos-iav-v4-preview.inmueblesaudiovisuales.workers.dev/checklist?demo=1&cb=N`
  (`?demo=1` = modo demo sin tocar datos; `&cb=N` para evitar cache en celular).
- El editor en producción está tras Cloudflare Access. La sesión de construcción verifica en LOCAL (Playwright)
  y el visor en preview; Bruno verifica el editor en prod y en su celular.

### App de metadatos
- Repo local: `/Users/brunogutierrez/iav-metadata-app`. GitHub: `inmueblesaudiovisuales-dev/iav-metadata-app` (privado). Branch `master`.
- NO se tocó en este trabajo. Es la meta 3 (ver sección 6).

---

## 2. Qué se trabajó en esta tanda (Armar cuartos, F50–F56)

La pantalla "Armar cuartos" del checklist (`frontend/checklist.html`, JS inline + `frontend/checklist-logic.js`,
motor puro con 228 pruebas). Todo verificado con Playwright y desplegado al preview. Commits Fxx en la rama:

- F50: tres bugs. (4.1) al agregar el primer cuarto ya no salta a Captura — `setupStepPlus`/`setupPickerCustom`
  fijan `setupOpen=true`. (4.2) cuadros de icono vacíos — se regeneró el subset de Tabler. (4.3) el botón "−"
  salía vacío porque faltaba `ti-minus` en el subset (misma causa que 4.2); ya muestra el glifo, glifo del
  stepper a 22px. También cache-bust `?v=fNN` en el CSS y woff2.
- F51: (revertido en F52) — se había hecho que la Recámara dejara la planta baja con 2+ pisos; Bruno lo
  revirtió: la Recámara se queda SIEMPRE en planta baja.
- F52/F53: "Agregar otro" dejó de ser lista plana + escribir. Ahora es un acordeón de CATEGORÍAS, cerrado
  (compacto), por RELEVANCIA según la sección donde estás (en Amenidades salen primero las amenidades, etc.),
  con una categoría "Otras zonas" al fondo para llegar a todo, y "Otro (escribir)" colapsado para crear a
  mano. Etiqueta del botón por sección: "Agregar otro cuarto" / "Agregar otro espacio" / "Agregar otra
  amenidad". Subcuartos: se quitó "Vestidor" (queda Clóset, Baño, Balcón).
- F54: renombrar pisos (tocar el nombre/lápiz → input + sugerencias Sótano/Entrepiso/etc. + texto libre), para
  casas con sótano o niveles abajo. El piso ahora se identifica por su NOMBRE real (`state.pisos[i]`), no por
  el label de índice: `setupScope` y el bloque de piso usan el nombre guardado; al renombrar se re-etiquetan
  los espacios de ese piso. También se arregló el "blip" del stepper de Pisos: el primer "+" agrega directo la
  planta alta (materializa la planta baja implícita), un toque = un piso visible.
- F55: nuevo concepto "Cuarto de juegos" en interior (casa, departamento, quinta) y amenidades, icono
  `ti-device-gamepad-2` (agregado al subset). Aparece en "Áreas sociales" y "Amenidades sociales" del picker.
- F56: bug pre-existente reportado por Bruno. Tras visitar la "Sesión de drone" una vez, picar cualquier
  cuarto mostraba la sesión de drone (cámaras DJI, sin Sony) hasta "Reiniciar demo". Causa: `entrarSesionDrone`
  fija `state.modoActual='drone'` y persiste la lane 'drone' en localStorage; `entrarCuarto` no la regresaba,
  y `activeTarget()` (en modo drone `currentTargets()` son targets virtuales, no espacios) caía a `list[0]` =
  la sesión de drone. Fix: `entrarCuarto`, si `modoActual` es 'drone'/'asesor', regresa a la lane de cuarto del
  rol (primer modo no-drone de `loopModesForRole()`; 'video' para Bruno) y la persiste.

Estado: "Armar cuartos" está completo y pulido. Lo único parado: un bug de captura/drone que originalmente no
se pudo reproducir resultó ser F56 (ya arreglado). No hay nada a medias en esta tanda.

### Detalle técnico de "Armar cuartos" (mapa rápido del código en checklist.html)
- `renderSetup()` arma la pantalla; `setupScope(key)` ('f0','f1'…|'ext'|'ame') → {zona,piso,floorIndex}.
- `setupStepPlus/Minus`, `setupStepPisos` (con el fix del blip), `setupRenamePiso/setupStartRename` (F54).
- `setupVisibleFor` (default por scope + instancias), `setupSectionRows` (etiqueta por zona).
- Picker por categorías: `SETUP_CATS` (cada categoría tiene `zona` y `bases`), `setupPickerCats(sc)`
  (relevantes de la zona + "Otras zonas" aplanada y deduplicada), `setupPickerHtml`, `setupTogglePickerCat`,
  `setupPickerAdd` (rutea: interior al piso actual, exterior/amenidades a su sección, con toast si cae en otra),
  `setupPickerCustom` (input "Otro escribir" + autocompletado `searchSpaces`).
- `SETUP_ICON_MAP` (icono de concepto → clase `ti-*`), `setupIconClass`.
- Subcuartos: `setupInstances` (chips Clóset/Baño/Balcón → `addSubRapido`).
- Motor en checklist-logic.js: `BASE_CONCEPTS` ({casa,departamento,quinta}), `catalogByZone`, `defaultVisible(zona,floorIndex)`
  (PB siempre incluye Recámara), `nextRoomName`, `floorLabel`, `nextFloorName`, `baseConcept`, `detectCategoria`,
  `searchSpaces`.

### Iconos (importante para futuros cambios)
- La app usa un SUBSET self-hosted de Tabler 3.44.0 (`frontend/assets/tabler-icons.css` + `tabler-icons-subset.woff2`),
  NO el webfont completo. Si agregas una clase `ti-*` que no está en el subset, sale un cuadro vacío.
- Para sumar iconos: `npm pack @tabler/icons-webfont@3.44.0` (trae woff2 completo + min css con codepoints);
  `pyftsubset` (fonttools+brotli en un venv por PEP 668) sobre el woff2 completo a la unión de (todas las clases
  `ti-*` usadas en el HTML ∪ las del subset actual); reconstruir el CSS con esas reglas. Bumpear `?v=fNN` en el
  `<link>` del CSS y en los `src` del @font-face (cache-busting para el celular). Verificar VISUALMENTE que
  `getComputedStyle(i,'::before').content` no sea `none`/vacío en todos los `i.ti`.
- Hay un script de referencia que se usó: `/tmp/make_subset.py` (escanea tokens `ti-*` del html + clases del
  css actual, mapea codepoints del min css completo, corre pyftsubset, escribe el woff2 y `/tmp/subset_rules.txt`;
  el CSS se reconstruye a mano con esas reglas).

---

## 3. Cómo correr y verificar (comandos)

- Tests del motor: `node --test frontend/checklist-logic.test.js` (debe dar 228 pass / 0 fail).
- Compilación del JS inline de checklist.html (atrapa errores de sintaxis):
  `node -e "const fs=require('fs');const h=fs.readFileSync('frontend/checklist.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');require('vm').compileFunction(m);console.log('inline OK')"`
- Gate del repo (DESPUÉS de commitear; compara HEAD~1..HEAD):
  `bash .claude/skills/build-from-plan/phase-gate.sh "<archivos,permitidos>" "version: 1" "normalizeChecklistData"`
  Para motor usa `"frontend/checklist-logic.js,frontend/checklist-logic.test.js"`; para UI `"frontend/checklist.html"`;
  para iconos agrega `"frontend/assets/*"`.
- GOTCHA del gate: su check "sin emojis" lee TODO archivo cambiado; un woff2 binario pasa, pero las PNG dan
  FALSO POSITIVO (bytes que decodifican a emojis). Commitea las capturas de verificación en un commit de docs
  SEPARADO del commit de código que pasa por el gate.
- Levantar para Playwright (estático): `cd frontend && python3 -m http.server 8092` →
  `http://localhost:8092/checklist.html?demo=1&cb=N`. Rol Bruno → "Armar cuartos". Demo se reinicia con el
  botón "Reiniciar demo" (limpia localStorage). Para volver a entrar al setup desde captura: "Agregar cuarto ·
  Modo cuartos".
- Playwright disponible como MCP (`mcp__plugin_playwright_playwright__*`). Para ver iconos/estado, evaluar JS en
  página (window.state NO está expuesto; lee del DOM).

---

## 4. EL PUENTE: contrato de datos checklist → app de metadatos

Esto es el corazón de todo lo que sigue. Fuente de verdad: `buildExport(state, meta)` en
`frontend/checklist-logic.js` y el doc `frontend/checklist-logic.test.js` + `docs/EXPORT_METADATA_HANDOFF.md`.

- El checklist exporta `bitacora-<folio>.json` (pestaña Edición → Exportar). `version: 1` (intacto; campos del
  modo guiado son aditivos).
- Por cada archivo de video/drone/asesor (foto y 360 NO salen: son cobertura, no archivos), el export trae:
  `archivo` (token de emparejamiento), `consecutivo`, `ancho` (padding), `ejemploNombre`, `camara`, `camaraId`,
  `camaraTipo` ("sony"|"dji"), `servicio` ("video"|"drone"|"asesor"), `escena`, `escenaRuta` (cuarto > subcuarto),
  `piso` (null en drone/asesor), `toma` (shotNumber), `tipo` ("take"|"discard"|"omitted"), `motivoDescarte`
  ("failed"|"unrelated"|"empty"), `buena`, `favorita`, `nota`, `par` (asesor Sony↔Osmo), `autor`, `hora`,
  y campos del modo guiado: `tipoToma`/`tipoTomaLabel`, `movimiento`/`movimientoLabel`, `sentido`, `pared`,
  `sugerencia`, `prioridad`, `ordenEdicion`, y un bloque `premiere` ya mapeado:
  `Scene` (=escenaRuta||escena), `Shot` (=toma), `Camera Roll` (=camara), `Good`, `Favorite`, `Comment` (=nota),
  `Description` (texto: `[E<ordenEdicion>] <servicio> · <estado> · <tipoTomaLabel> / <movimientoLabel>`).
- Además: `resumenGuia` (cobertura must por cuarto/target) y `guionEdicion` (clips ordenados para string-out).
- CLAVE comprobada: `escena` se snapshotea AL CAPTURAR (`f.scene`), pero `piso` se lee EN VIVO del espacio
  (`espacio.piso`). Por eso renombrar un piso a "Sótano" se refleja solo en el export y `premiere.Scene` usa el
  cuarto, no el piso. "Cuarto de juegos" sale como escena/Scene normal. El emparejamiento es por consecutivo de
  cámara (captura), no por el armado. Es decir: lo de "Armar cuartos" NO rompe el contrato (verificado con un
  buildExport real: escena "Cuarto de juegos", piso "Sótano", premiere.Scene "Cuarto de juegos", archivo "PIB0091").

### Cámaras reales y emparejamiento (lo único hecho a la medida de IAV)
- Sony FX30 = `<fecha>_PIB<contador>.MP4` (proxies `<fecha>_PIB<contador>S03.MP4`). Token = `PIB####`; el nombre
  CONTIENE el token; excluir proxies S03.
- DJI Air 3, Mini 4 Pro (drones), Osmo Pocket 3, Osmo Action = `DJI_<14 dígitos>_<contador>_<sufijo>.MP4`. Token =
  el contador con padding (p.ej. `0091`). El MODELO viene EMBEBIDO en el MP4 (exiftool tag `Encoder`: "DJI Air3",
  "DJI Mini4 Pro", "DJI OsmoPocket3", "DJI OsmoAction5 Pro") → así se distinguen dos drones en la misma carpeta.
  No depende del SRT (lo borran).
- Emparejar: por carpeta asignada a mano, escaneo NO recursivo del nivel superior, solo `.MP4` originales (ignora
  `.LRF`/`.SRT`/`.XML` y subcarpetas de proxies). Sony: el stem TERMINA con el token. DJI: parsear y emparejar
  por contador.

---

## 5. La app de metadatos (iav-metadata-app) — estado actual

- App de escritorio macOS (Electron + React + `exiftool-vendored`, que empaqueta exiftool). Solo Apple Silicon
  (arm64). Sin firma de pago: clic derecho la primera vez + firma ad-hoc. Layout: barra lateral + 5 pasos
  (Proyecto, Cámaras, Revisar, Aplicar, Reporte).
- Lee el `bitacora-*.json`, empareja cada registro con el archivo real por consecutivo, y escribe XMP embebido
  con exiftool para que Premiere lo lea. Mapeo CONFIRMADO en Premiere 2026:
  `XMP-xmpDM:Scene`→Scene, `XMP-xmpDM:ShotName`→Shot, `XMP-xmpDM:Good`→Good (casilla; se escribe como cadena
  'True'/'False'), `XMP-xmpDM:LogComment`→Log Note, `XMP-dc:Description`→Description, `XMP-xmpDM:TapeName`→Tape
  Name (el "Camera Roll"). OJO: `XMP-xmpDM:Comment` y `XMP-xmpDM:CameraRoll` NO son escribibles en exiftool 13.55.
- Comportamiento: respaldo antes de escribir; "Revisar" es el modo prueba; descartes → Good=False + motivo;
  "Sin identificar" se reporta, no se adivina.
- ESTADO (2026-06-05): construida, fusionada a master, repo privado, 24 pruebas en verde (incl. 2 de integración
  exiftool sobre clips reales), .dmg arm64 con firma ad-hoc y exiftool empaquetado verificado dentro del .app.
- Notas técnicas: el preload debe emitirse como `index.cjs` (no `.js`, por `"type":"module"`); validar
  `window.api` por CDP. Bugs ya corregidos: token vacío emparejaba con todo (ahora unmatched); undoStore se
  limpia al cargar bitácora nueva; errores de loadBitacora ahora se muestran en la UI.
- PENDIENTE de Bruno (no de código): confirmar en su Premiere Pro 2026 los 6 campos sobre una copia ya escrita,
  y el caso de DOS drones con una bitácora real (el motor ya separa por modelo embebido; falta una bitácora real
  de ese caso).
- Docs en ese repo: `docs/superpowers/specs/2026-06-04-app-metadatos-premiere-design.md`; planes en
  `docs/superpowers/plans/` (1-nucleo motor TDD, 2-app Electron+React, 3-empaque arm64 + firma ad-hoc).

---

## 6. PRÓXIMAS METAS (en orden de prioridad de Bruno)

> ALCANCE AHORA: solo se trabaja en CHECKLIST (metas A y B, que son features de checklist.html). La app de
> metadatos (meta C) es meta FUTURA: NO se toca hasta que Bruno dé por terminado el checklist. No arranques en
> la app de metadatos. La meta C queda documentada aquí solo como contexto de hacia dónde va todo.

### Meta A (idea 2, la de más valor): dictar la bitácora en vez de escribirla
Flujo deseado:
1. Bruno arma los cuartos en checklist.html y pone el número inicial de archivo de cada cámara.
2. Graba un Voice Memo mientras filma, manos libres, dictando las tomas. Ejemplo real de cómo habla:
   "toma 82 push in cocina plano general. toma 83 detalle cocina, quedó bien, favorita. toma 84 fallida, no
   está bien expuesta. toma 85 recámara reveal pared izquierda. cambio de cámara a drone. toma 1 drone fachada
   reveal. 10 fotos capturadas. toma 2 drone." (Dicta solo el FINAL del número de archivo, no el nombre completo.)
3. Transcribe el audio (cualquier herramienta de transcripción).
4. checklist.html le DA UN PROMPT (generado por la app desde su propio esquema/vocabulario/cuartos/cámaras).
5. Bruno se lo pega a Gemini; como segundo mensaje le pega la transcripción.
6. Gemini SUMA y ORDENA los videos (incrementa contadores) y devuelve un TEXTO en un formato importable.
7. Bruno pega ese texto en checklist.html y se llena solita la bitácora (mediaFiles/registros), pasando por un
   PASO DE REVISAR antes de escribir en firme.

Decisiones tomadas con Bruno:
- Durante la grabación ya NO marca tomas en la app: solo dicta. El trabajo en la app se mueve a antes (armar +
  números) y después (pegar + revisar/confirmar). El marcado manual de hoy se queda como respaldo (plan B).
- Gemini hace la suma de contadores; la app valida.
- El formato de regreso debe ser importable (estructurado, JSON).

### Meta B (idea 1): sugerencias de toma por IA con fotos, que REGRESAN a la app
Flujo deseado:
1. Bruno arma los cuartos. La app genera un PROMPT con todos los cuartos (y su formato) + le dice qué fotos
   tomar con el celular.
2. Bruno toma fotos de varias partes de la casa y se las pasa a Gemini junto con el prompt.
3. Gemini, viendo las fotos reales, propone sugerencias de toma y transiciones de real estate específicas de
   ESA casa.
4. Gemini devuelve un formato IMPORTABLE compatible; Bruno lo pega en checklist.html y se vuelven las
   sugerencias de toma por cuarto que la app muestra durante la captura.
- Decisión: SÍ regresan a la app (no es solo una guía mental). Por eso necesitamos un formato de import de
  sugerencias. Esto probablemente vuelve obsoleta la librería de sugerencias fija que la app tiene hoy (Bruno
  dijo "ya no sé si la quiero"); la versión con fotos es mejor porque se adapta a la casa real.

### Meta C (FUTURA — NO ahora — la app de metadatos)
No se aborda hasta terminar checklist (metas A y B). No empieces aquí; queda solo como contexto.
"Modificar iav-metadata-app para que durante la importación de archivos se pongan los metadatos que saquemos de
checklist.html." Nota: la app YA hace el núcleo de esto (importa carpetas, empareja por
consecutivo, escribe los 6 campos de Premiere desde la bitácora). Aclara con Bruno qué falta exactamente; lo más
probable es una de estas (o ambas):
- Escribir además los campos del modo guiado como un namespace XMP propio `XMP-IAV` (fase 2, ya documentada en
  `docs/EXPORT_METADATA_HANDOFF.md` sección 7: ShotType, Movement, EditOrder, Priority, SuggestionId…), que hoy
  solo viajan dentro de `premiere.Description` como texto. Requiere un `.ExifTool_config` para registrar el namespace.
- Asegurar que consuma sin fricción la bitácora MÁS RICA que producirá el flujo de dictado (Meta A): mismas
  escenas, pisos (incluido renombrados como "Sótano"), favoritas, descartes con motivo, cambios de cámara.

### El patrón común (arquitectura que une A y B)
La app NO intenta ser la inteligente. La app conoce su formato (cuartos con id, vocabulario de tomas, cámaras,
contadores) y GENERA un prompt; Gemini (multimodal) hace el trabajo pesado (ver fotos / entender el dictado); y
la app tiene una PUERTA DE IMPORT que recibe el resultado y lo valida. Mantener la inteligencia fuera del código
es a propósito (menos que mantener, mejores resultados).

Dos principios que cubren casi todos los riesgos:
1. El prompt se genera desde el estado en vivo de la app (única fuente de verdad del formato, vocabulario y cuartos).
2. Todo import pasa por un paso de REVISAR antes de escribir en firme.

---

## 7. TODOS los errores previstos y sus soluciones

### Comunes a A y B
- Gemini devuelve texto sucio (explicaciones, ```json, comas finales). → El importador limpia los fences, busca
  el bloque JSON, parsea tolerante; si falla, error claro y NO aplica nada a medias.
- Nombres de cuarto que no empatan (acentos, "Recámara principal" vs "Recamara", renombrados). → Emparejar por
  ID de cuarto, no por nombre. El prompt lleva el id de cada cuarto; Gemini lo regresa; el importador mapea por
  id. Lo no empatado se reporta, no se inventa. Normalizar acentos/case como respaldo.
- Gemini alucina cuartos/tomas inexistentes. → El importador solo acepta ids existentes; el resto se lista aparte.
- Vocabulario fuera de catálogo (tipo de toma/movimiento que la app no tiene). → El prompt incluye las claves
  válidas (las de SHOT_TYPES/MOVEMENTS); lo desconocido se guarda como texto libre o se marca, no truena.
- Emojis o formato raro en la salida. → Se limpian al importar (regla del producto: sin emojis).
- Cambia el esquema de la app y el prompt queda viejo. → El prompt se GENERA en vivo desde el esquema; nunca a mano.
- Versión del formato de import. → El JSON lleva un número de versión; si sube, el importador avisa antes de procesar.
- Pegado incompleto/parcial. → Validar completitud (brackets) y no aplicar parcialmente.

### Meta B (sugerencias por IA), propios
- Importar sugerencias pisa lo ya capturado. → El import de sugerencias SOLO toca la lista de sugerencias, jamás
  los mediaFiles ni la bitácora. Confirmar antes de reemplazar.
- Sugerencias viejas: cambiaste cuartos después de generar el prompt. → El prompt lleva marca de tiempo/estado;
  al importar, aplica solo lo que empata y avisa del resto.
- No sabes qué fotos tomar. → El prompt te dice cuántas y de qué (cada cuarto, accesos, vistas).

### Meta A (dictar la bitácora), propios — mayor riesgo: escribe el log que se vuelve metadato
- Números mal transcritos (84 vs 94, "PIB" parcial). Es la llave de emparejamiento. → Doble red: (a) la app
  conoce la secuencia esperada (número inicial + incrementos) y MARCA saltos o duplicados; (b) el paso de
  revisar muestra cada toma con su número para confirmar.
- Dictas solo el final ("82"); el archivo real es PIB0082 / contador con padding. → La app expande "82" al token
  completo usando el formato de cada cámara (igual que la app de metadatos para emparejar).
- Quién manda en los contadores (Gemini suma). Riesgo: Gemini cuenta mal/salta/duplica. → Gemini propone orden y
  números, pero la app los valida contra su propio contador y marca diferencias; Bruno confirma. La app es la
  fuente de verdad del número.
- "Cambio de cámara a drone": cambia de carril y el contador del drone es otro. → El prompt enumera las frases
  de cambio; Gemini emite la cámara por toma; el importador valida que esa cámara exista y rutea.
- "10 fotos capturadas": es COBERTURA, no archivos con número (foto/360 no salen como archivos). → El prompt
  distingue fotos/360 (cobertura, un conteo) de video/drone (tomas numeradas). El importador marca cobertura, no
  crea archivos.
- Descartes con motivo ("fallida, mal expuesta"). → El prompt mapea las frases al enum real
  (failed/unrelated/empty); si no queda claro, "failed" por defecto; se ve en revisar.
- Buena/favorita ("quedó bien, favorita"). → El prompt mapea; por defecto buena=sí salvo descarte.
- Cuarto ambiguo: dices "recámara" y hay tres. → El prompt pide marcar "sin identificar" en vez de adivinar;
  Bruno asigna en revisar. (O dicta "recámara principal".)
- Te corriges hablando ("toma 84 fallida... no, buena"). → El prompt instruye a honrar la última corrección;
  revisar lo atrapa.
- Doble pegado. → El import dice "voy a agregar/reemplazar N tomas" y avisa si ya hay tomas con esos tokens;
  nunca duplica en silencio.
- Cámara por defecto en video: si no dices cámara, asume la Sony principal. → El prompt deja explícito el default.
- Dato mal mapeado se vuelve metadato equivocado en el video. → Doble red: el revisar de la checklist, y luego
  el modo "Revisar" de la app de metadatos antes de escribir a los archivos.
- Vocabulario hablado mal transcrito ("push in"→"pushing", "reveal"→"rivil"). → El prompt da el vocabulario
  controlado + sinónimos/mishears comunes para mapear con tolerancia.
- Dónde corta una toma y empieza otra (run-on). → El delimitador es "toma N"; el prompt instruye a partir ahí;
  revisar atrapa mis-splits.

---

## 8. Primeros pasos sugeridos para el chat nuevo (no empieces a programar sin acordar)

1. Lee este documento completo y `docs/EXPORT_METADATA_HANDOFF.md` y `buildExport` en checklist-logic.js.
2. Confirma con Bruno por cuál meta de CHECKLIST arrancar: A (dictado, la de más valor) o B (sugerencias por IA
   con fotos). La meta C (app de metadatos) NO se toca todavía: es hasta terminar checklist.
3. Para A y B, el primer entregable de diseño es el PAR: el prompt exacto que genera la app + el formato JSON de
   importación. Es el corazón. Propónlo y acuérdalo con Bruno ANTES de tocar código (regla de proponer primero).
4. Diseña el paso de "Revisar" del import como parte del MVP, no como extra.
5. Sigue las reglas de la sección 0 (sin emojis, acentos, sin asteriscos, verificar con Playwright/comandos,
   commits Fxx con gate verde, push a la rama checklist-cambios-2026-06-07, NUNCA a main, deploy al preview;
   Claude despliega, Bruno no).

Fin del prompt de continuidad.
