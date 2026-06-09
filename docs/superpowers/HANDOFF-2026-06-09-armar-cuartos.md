# HANDOFF — Rediseño "Armar cuartos" (versión consolidada)

> **Fecha:** 2026-06-08 19:41 (America/Monterrey). **Rama:** `checklist-cambios-2026-06-07`.
> **HEAD al entregar:** `23fec03` (F49). **Este es el handoff más reciente: ignora handoffs anteriores para este tema.**
> **Para:** una sesión LOCAL de Claude Code con Playwright, para verificar VISUALMENTE que todo se vea bien
> y arreglar los bugs abiertos. Lee también `CLAUDE.md` (reglas del repo) antes de tocar nada.

---

## 0. TL;DR (qué tienes que hacer)

1. Checkout de la rama `checklist-cambios-2026-06-07` y ponte al día (`git pull`).
2. Levanta la app y ábrela con Playwright para VER "Armar cuartos" (rol Bruno). Es lo que esta sesión remota
   no pudo hacer (sin navegador) y por eso se colaron bugs visuales.
3. Arregla, en este orden, los **3 bugs abiertos** (sección 4). Son la prioridad.
4. Aplica las **mejoras** pendientes (sección 5) si hay tiempo.
5. Verifica con el **gate** + compilación inline + tests + chequeo de íconos + **Playwright visual** (sección 7).
6. Commit por cambio con gate verde, push a la rama. NUNCA a `main`, NUNCA deploy a producción.
   Para ver en celular: redepliega el **preview aislado** (sección 6).

---

## 1. Contexto del proyecto

- IAV Contratos v4: Cloudflare Workers + D1, frontend estático en `frontend/`. El checklist de captura
  (foto/360/video/drone) vive en `frontend/checklist.html` (UI, JS inline) + `frontend/checklist-logic.js`
  (motor puro, testeable con `node --test`).
- **Reglas duras (de `CLAUDE.md`):** push a `main` despliega a producción vía GitHub Actions — **no** estamos en
  main. Trabajamos SOLO en `checklist-cambios-2026-06-07`. **Nunca** `wrangler deploy` a producción; sí al
  preview aislado. Sin emojis en el producto (iconos Tabler `ti ti-*`). Español con acentos en texto visible;
  ids/clases/ids-de-icono sin acentos. CSS mobile-first, sistema de diseño "R1" (tokens `--sp-*`, `--ts-*`,
  `--tint`, `--ink-*`, `--gold`; clases existentes). D1 no soporta foreign keys.
- **Preferencias de Bruno (el usuario):** NO usar asteriscos de markdown (`**`) en las respuestas de chat.
  Quiere las cosas fáciles de entender y de picar; valora ver el resultado real (por eso esta sesión local).

## 2. Qué estamos construyendo y por qué

Rediseño de la pantalla "Armar cuartos" (donde el equipo arma la lista de espacios de una propiedad antes de
capturar). Dolores originales de Bruno:
1. Quitar un cuarto picado por error obligaba a hacer scroll hasta una lista al fondo.
2. Los cuartos no tenían orden ni agrupación clara.
3. Quería armar la casa "mientras la camina", sin buscar ni batallar.

Tras varias iteraciones (F40–F46 fue un primer rediseño "esquema vivo + hoja + arranque rápido" que a Bruno
le pareció confuso/roto), Bruno pidió **REPLANTEAR a una sola pantalla consolidada**. Esa es la versión actual
(F47–F49) y la que hay que pulir.

### Visión de la versión consolidada (lo aprobado)

Una sola pantalla "Armar cuartos", todo inline, **sin lista aparte ni popup**:
- Selector de **Tipo de propiedad** (Casa / Depto / Terreno / Quinta).
- **Pisos** con stepper (− cantidad +).
- **Un bloque por piso** (Planta baja, Planta alta, Planta 3…). Cada bloque lista cuartos comunes de ese piso,
  cada uno con un **stepper (− cantidad +)**. El número ES la lista: Recámara en 3 = "Recámara principal",
  "Recámara 2", "Recámara 3".
- **Subcuartos inline:** un cuarto con cantidad ≥1 tiene una flecha (chevron) que despliega sus instancias;
  a cada instancia le agregas Clóset / Baño / Vestidor / Balcón.
- **"Agregar otro"** por sección: abre un picker de chips con los demás tipos de esa zona y **se queda abierto**
  hasta cerrarlo; al final un campo **"Otro cuarto…" con autocompletado** contra la biblioteca (con sinónimos)
  y opción "crear nuevo".
- Secciones **Exterior** y **Amenidades** (property-wide, sin piso) con el mismo modelo.
- Toggle **"incluir tomas de drone"** (no se toca, viene de F38/F39).
- Footer "Listo, a capturar".
- **Terreno** tiene su propia vista (un solo sujeto, no se arman cuartos) — NO se toca.

### Mockup aprobado (VERDAD VISUAL)

`worker/mock-armar-cuartos/index.html` — maqueta autocontenida (HTML/CSS/JS con iconos SVG inline, sin
dependencias) que Bruno aprobó. **Cuando dudes de cómo debe verse/comportarse algo, este mockup manda.**
Desplegado en: `https://iav-mock-armar-cuartos.inmueblesaudiovisuales.workers.dev`
(deploy del mockup: `cd worker && npx wrangler deploy -c wrangler.mock-armar.toml`).

Diferencia clave mockup vs app real: el mockup usa SVG inline (siempre se ven los iconos); la app real usa una
fuente Tabler **subset** local que NO trae los glifos nuevos → de ahí el bug del cuadro vacío (sección 4).

## 3. Estado actual del código (mapa)

### Motor: `frontend/checklist-logic.js` (NO romper; 227 tests en verde)
Helpers nuevos/relevantes (todos exportados en `logic`):
- `BASE_CONCEPTS` = `{ casa:[...], departamento:[...], quinta:[...] }`. Cada concepto:
  `{ base, zona('interior'|'exterior'|'amenidades'), icon (nombre Tabler SIN prefijo), firstName?, repeatable? }`.
  `firstName` solo en Recámara ('Recámara principal'); `repeatable` en Recámara/Baño/Medio baño/Cochera/Estacionamiento.
- `catalogByZone(tipo)` → `{interior:[...],exterior:[...],amenidades:[...]}` (orden de recorrido). `terreno` → `{}`.
- `baseConcept(nombre)` → normaliza un nombre a su concepto base ("Recámara 2" → "Recámara").
- `nextRoomName(existingNames, concept)` → siguiente nombre numerado (usa firstName la 1a vez).
- `floorLabel(i)` → 'Planta baja'(0)/'Planta alta'(1)/'Planta '+(i+1)(≥2). `nextFloorName(pisos)` → siguiente label libre.
- `defaultVisible(zona, floorIndex)` → bases visibles por defecto:
  interior 0 = ['Sala','Comedor','Cocina','Medio baño','Recámara','Baño']; interior ≥1 = ['Recámara','Baño','Sala','Estudio'];
  exterior = ['Fachada']; amenidades = [].
- `planSkeleton(...)` existe pero **ya NO lo usa la UI consolidada** (era del arranque rápido viejo). Inerte; puede quedarse.
- Otros del motor que SÍ se consumen: `detectCategoria`, `searchSpaces` (autocompletado de "Otro cuarto…"),
  `isDronePiso`, `terrenoSingleSubject`, `suggestedAerialSubjects`.

### UI: `frontend/checklist.html` (JS inline). Funciones de la pantalla consolidada:
- `renderSetup()` — arma toda la pantalla (tipo → pisos → bloques por piso → Exterior → Amenidades → drone toggle → footer).
- `setupScope(key)` — `'f0'/'f1'/…`→ interior+`floorLabel(i)`; `'ext'`→exterior; `'ame'`→amenidades. Devuelve `{zona,piso,floorIndex}`.
- `setupScopeEspacios(sc)` — espacios raíz del ámbito (interior: misma planta; ext/ame: global; excluye `parentId`).
- `setupVisible` (estado UI, objeto clave→[bases]) + `setupVisibleFor(key,sc)` — inicializa con `defaultVisible` y
  siempre añade conceptos que ya tengan instancias.
- `setupStepperRow(key, base, first)` — pinta la fila (chevron + icono `.cs-ic` + nombre + stepper `.cs-step`).
- `setupStepPlus(key, base)` / `setupStepMinus(key, base)` — crean/quitan instancia (`nuevoEspacio`/`quitarEspacio`).
- `setupStepPisos(delta)` — agrega/quita planta (`confirmarPiso(nextFloorName)` / quita si vacía, si no toast).
- `setupToggleRow(key,base)` + `setupExpand` + `setupInstances(insts)` — desplegado de subcuartos (chips
  Clóset/Baño/Vestidor/Balcón → `addSubRapido(instId, nombre[, cat])`).
- `setupTogglePicker` + `setupPicker` + `setupPickerQuery` + `setupPickerHtml(key)` + `setupPickerPick` +
  `setupPickerCustom` — el "Agregar otro" (picker abierto + input "Otro cuarto…" con `searchSpaces`).
- `setupIconClass(name)` + `SETUP_ICON_MAP` — mapea el `icon` del concepto a clase `ti-*` (fallback `ti-door`).
- Reutilizadas intactas: `nuevoEspacio`, `quitarEspacio` (cascada manual), `cambiarPisoEspacio`, `accionesEspacio`,
  `confirmarPiso`/`quitarPiso`, `renderDroneToggle`, `renderSetupTerreno`, `cerrarSetup`, `abrirSetup`, `setSetupTipo`.
- **Control de vista:** `let activeView='captura'`, `let setupOpen=false`, `let capturaScreen='lista'`.
  En `render()` (~línea 1459): `const showSetup = setupOpen || !state.espacios.length;`  ← clave para el bug 4.1.
- CSS relevante: `.cs-row`, `.cs-ic`, `.cs-nm`, `.cs-step`, `.cs-sb` (botón stepper), `.cs-sb.add` (el +),
  `.cs-chev`, `.cs-qn` (~líneas 694-703).

### Iconos (CRÍTICO): `frontend/assets/`
- La app NO usa el webfont completo de Tabler. Usa un **subset self-hosted**:
  `tabler-icons.css` (~2.4KB) + `tabler-icons-subset.woff2` + `tabler-icons-filled-subset.woff2`.
- Ese subset solo trae los glifos que el código usaba ANTES (p. ej. `ti-drone`, `ti-stairs`, `ti-paw`, etc.).
  **NO trae** `ti-sofa`, `ti-cup`, `ti-bed`, `ti-bath`, `ti-tools-kitchen-2`, `ti-mood-kid`, `ti-ball-football`,
  `ti-briefcase`, `ti-massage`, `ti-binoculars`, `ti-confetti`, `ti-building-community`, `ti-door-enter`,
  `ti-wash-machine`, `ti-device-tv`, `ti-device-laptop`, `ti-puzzle`, `ti-box`, `ti-shield-half`, `ti-plant-2`, …
  → por eso TODAS las filas salen con un cuadro tintado vacío.

### Especificación y plan (fuente de verdad escrita)
- Spec: `docs/superpowers/specs/2026-06-08-armar-cuartos-rediseno-design.md`.
- Plan (con TODO el historial F40–F49): `docs/superpowers/plans/2026-06-08-armar-cuartos-rediseno-plan.md`.
  La sección "REPLANTEO CONSOLIDADO" describe F47–F49 (la versión actual).
- Backlog (futuro, NO ahora): `docs/superpowers/backlog-checklist.md` (cliente arma el esqueleto desde portal.html).

## 4. BUGS ABIERTOS (prioridad — esto es lo que falló)

### 4.1 BUG (alto): al agregar el primer cuarto, te saca de "Armar cuartos" a "Capturar"
- **Síntoma:** entras a Armar cuartos (casa nueva, sin cuartos), picas "+" o "Agregar" en el primer cuarto y
  la pantalla se va sola a la vista de captura.
- **Causa raíz (confirmada):** en `render()`, `const showSetup = setupOpen || !state.espacios.length;`. Cuando
  entras con la casa vacía, el setup se muestra SOLO porque `!state.espacios.length` es true (no porque
  `setupOpen` sea true). Al crear el primer espacio, `state.espacios.length` pasa a ≥1 → `showSetup` se vuelve
  false → el render cambia a captura.
- **Fix sugerido:** asegurar que al estar "armando" `setupOpen` quede en `true` y solo se cierre con
  "Listo, a capturar" (`cerrarSetup`). Opciones: (a) en `setupStepPlus` / `setupPickerPick` / `setupPickerCustom`
  poner `setupOpen = true` antes de `render()`; o (b) en `render()`, cuando se entra al setup por
  `!state.espacios.length`, hacer `setupOpen = true`. Verifica que NO rompa el caso de salir con "Listo" ni el
  arranque normal de la app. Pruébalo con Playwright: agregar 1 cuarto NO debe cambiar de pantalla.

### 4.2 BUG (alto): cuadro tintado vacío junto a cada cuarto (faltan los iconos)
- **Síntoma:** cada fila muestra un cuadrado tintado vacío donde debería ir el icono del cuarto. Bruno lo ha
  reportado 3 veces ("no entiendo el propósito de ese cuadrado vacío") — es el contenedor `.cs-ic` con el `<i>`
  sin glifo.
- **Causa raíz (confirmada):** la fuente Tabler es un **subset** (ver sección 3) que no incluye los glifos nuevos.
- **Fix sugerido (elige y verifica visualmente):**
  - (Recomendado) **Regenerar el subset** `frontend/assets/tabler-icons-subset.woff2` + `tabler-icons.css` para
    incluir TODOS los iconos que usa la pantalla (los de `SETUP_ICON_MAP` / `BASE_CONCEPTS` + los ya existentes).
    Mantiene la filosofía offline/ligera del proyecto. Hay herramientas de subsetting de Tabler (glyph subset).
  - Alternativa: cambiar a la hoja/fuente Tabler COMPLETA (CDN o woff2 completo local). Más pesada y el proyecto
    eligió subset a propósito — consúltalo con Bruno si te inclinas por esto.
  - Asegúrate de que NINGÚN icono usado quede sin glifo. Verifica VISUALMENTE con Playwright (no basta con que la
    clase exista en el CSS; el glifo debe estar en el woff2). Considera también revisar que los iconos elegidos
    sean los correctos por concepto (Sala=sofá, Cocina=utensilios, etc.).

### 4.3 BUG (medio): el botón "−" (menos) se ve feo / inconsistente con el "+"
- **Síntoma:** Bruno: "ese círculo está horrible, debería ser un UI similar al + pero con −".
- **Causa:** `.cs-sb` (el −) es un círculo con borde y fondo tinte; `.cs-sb.add` (el +) es dorado relleno.
  Se ven distintos.
- **Fix sugerido:** hacer el "−" visualmente consistente con el "+" (misma forma/peso; p. ej. mismo círculo
  limpio, diferenciados solo por el glifo y quizá el color de acción). Decide el look mirando el mockup y
  valida con Bruno/Playwright. Mantén ≥44px.

### 4.4 REPORTADO (verificar): en casa de 1 piso "no se sugiere Recámara en planta baja"
- `logic.defaultVisible('interior', 0)` SÍ incluye 'Recámara' (y el screenshot reciente ya la muestra), así que
  puede ser una observación previa al último deploy. **Verifica con Playwright** en una casa de 1 piso que la
  Planta baja arranca con Sala/Comedor/Cocina/Medio baño/Recámara/Baño. Si NO aparece Recámara, revisa que el
  bloque del piso por defecto (cuando `state.pisos` está vacío) pase `floorIndex = 0` a `setupVisibleFor`.

## 5. MEJORAS / METAS (después de los bugs)

- **Lo que Bruno quiere lograr:** una pantalla donde armar toda la casa (cuartos, subcuartos, amenidades) sea
  rápido, claro y "fácil de picar", sin batallar, viendo la casa. Todo en una sola pantalla (ya está; hay que
  pulir el render).
- Defaults por piso afinados a la realidad MX: arriba SÍ suele haber sala (family), casi nunca cocina; a veces
  bar/terraza. (Ya reflejado en `defaultVisible`; ajusta si al verlo no cuadra.)
- "Agregar otro" se queda abierto hasta cerrarlo (ya implementado; verifícalo) y "Otro cuarto…" autocompleta con
  `searchSpaces` + sinónimos + crear nuevo (ya implementado; verifícalo visualmente).
- Amenidades amplias ya incluidas (Alberca, Casa club, Gimnasio, Cancha, Áreas verdes, Caseta, Asadores, Palapa,
  Cocina exterior, Parque, Área canina, Ludoteca, Área infantil, Sala de negocios, Salón de eventos, Cowork, Spa,
  Cine). Exterior ampliado (Alberca, Palapa, Fuente, Pérgola, Deck, Fogatero, Estacionamiento, Mirador, Bodega…).
  Si Bruno pide más, agrégalas en `BASE_CONCEPTS` (motor, con test) + su icono en el subset + `SETUP_ICON_MAP`.
- Pulir lo visual en general: que se vea como el mockup aprobado, limpio, mobile-first, R1.
- **Fuera de alcance ahora (backlog):** que el cliente arme el esqueleto desde `portal.html` y que alimente
  `checklist.html` (`docs/superpowers/backlog-checklist.md`).

## 6. Cómo correr / desplegar

- **Tests del motor:** `node --test frontend/checklist-logic.test.js` (debe dar 227 pass / 0 fail).
- **Compilación del JS inline de checklist.html (rápida, atrapa errores de sintaxis):**
  ```
  node -e "const fs=require('fs');const h=fs.readFileSync('frontend/checklist.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');require('vm').compileFunction(m);console.log('inline OK')"
  ```
- **Gate del proyecto (corre tests + sintaxis + alcance + invariantes + sin emojis). Córrelo DESPUÉS de commitear
  (compara `HEAD~1..HEAD`):**
  ```
  bash .claude/skills/build-from-plan/phase-gate.sh "frontend/checklist.html" "version: 1" "normalizeChecklistData"
  ```
  Para fases de motor: `... "frontend/checklist-logic.js,frontend/checklist-logic.test.js" ...`.
- **Ver en navegador (Playwright):**
  - Opción A (rápida, estática): servir `frontend/` y abrir `checklist.html?demo=1` (modo demo = UI sin tocar
    datos). Ej.: `cd frontend && python3 -m http.server 8080` → `http://localhost:8080/checklist.html?demo=1`.
    Si el modo demo necesita el worker para algo, usa la opción B.
  - Opción B (fiel): `cd worker && npx wrangler dev -c wrangler.preview.toml` (usa D1 real; `?demo=1` para no
    tocar datos) y abre la URL local que imprime wrangler.
  - Opción C: apunta Playwright al **preview desplegado** (abajo) tras pushear y redeployar.
  - Flujo para llegar a "Armar cuartos": rol **Bruno**, propiedad nueva (o estado vacío) → la pantalla de armar
    cuartos. Si ya hay cuartos, hay una entrada de edición ("Armar"/editar) desde la barra.
- **Preview aislado en workers.dev (para que Bruno lo vea en su celular). NO es producción:**
  ```
  cd worker && npx wrangler deploy -c wrangler.preview.toml
  ```
  URL: `https://contratos-iav-v4-preview.inmueblesaudiovisuales.workers.dev/checklist?demo=1`
  (agrega `&cb=N` para evitar cache en el celular).
- **NUNCA** `git push origin main` ni deploy a producción.

## 7. Definición de "terminado" para esta tanda

- Los 3 bugs (4.1, 4.2, 4.3) arreglados y **verificados visualmente con Playwright** (capturas antes/después).
- 4.4 verificado.
- `node --test` 227 pass; compilación inline OK; gate PASA; sin emojis; sin código colgante.
- Todos los iconos de la pantalla se VEN (ningún cuadro vacío) — verificado en el navegador, no solo en CSS.
- Se ve como el mockup aprobado. Commits con mensajes claros (continúa numeración Fxx si sigues el plan, p. ej.
  F50…), push a `checklist-cambios-2026-06-07`. Redeploy del preview y avisar a Bruno con la URL.

## 8. Skills a usar (Claude Code)

- `superpowers:verification-before-completion` — antes de declarar algo "listo": corre comandos y muestra
  evidencia (aquí, además, capturas de Playwright). Evidencia antes que afirmaciones.
- `superpowers:systematic-debugging` — para los bugs (4.1/4.2), encuentra causa raíz antes de parchar
  (ya tienes las causas raíz aquí; confírmalas).
- `build-from-plan` (skill del repo) — el flujo de micro-fases con gate. El gate está en
  `.claude/skills/build-from-plan/phase-gate.sh`. Una fase = un commit con gate.
- `superpowers:brainstorming` — solo si vas a CAMBIAR el diseño (no para arreglar bugs). Para pulir lo acordado
  no hace falta.
- Si usas subagentes para tareas independientes: `superpowers:subagent-driven-development`.
- Verifica VISUALMENTE con Playwright en cada bug; esta es la razón de mover el trabajo a local.

## 9. Reglas de oro (no las rompas)

- Rama `checklist-cambios-2026-06-07`. Nunca `main`. Nunca deploy a producción (sí preview aislado).
- `frontend/checklist.html` y `frontend/checklist-logic.js` son los archivos de este trabajo. NO toques
  `worker/` (backend), NI `iav-metadata-app`. (El subset de iconos en `frontend/assets/` SÍ se puede tocar para
  el bug 4.2.)
- Invariantes que el gate exige: `version: 1` intacto, `normalizeChecklistData` carga estado viejo sin pérdidas,
  sin emojis. Terreno y la Sesión de drone (F38/F39) no cambian de comportamiento.
- En el chat con Bruno: sin asteriscos de markdown.
