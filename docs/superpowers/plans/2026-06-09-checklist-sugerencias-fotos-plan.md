# Plan — Meta B: tomas sugeridas por IA con fotos — F72–F74

> Para la sesión de construcción (build-from-plan): este plan es la fuente de verdad. Cada micro-fase es UN
> commit con gate, en la rama `checklist-cambios-2026-06-07`, NUNCA a `main`, worker solo al preview. Lee el
> spec `docs/superpowers/specs/2026-06-09-meta-b-sugerencias-fotos-design.md` (PAR cerrado) y el handoff
> `docs/superpowers/PROMPT-CONTINUIDAD-2026-06-09-dictado-sugerencias.md` (sección 4, Meta B). No toques
> `iav-metadata-app` ni `adapter/`.

**Goal:** Que la app genere un prompt con fotos (qué fotografiar + instrucciones para Gemini) que produzca
sugerencias de tomas concretas por cuarto, basadas en las fotos reales de la casa, y que regresen a
`state.guide.proposal` por el flujo de propuesta IA ya existente.

**Architecture:** La app no es la inteligente: genera el prompt en vivo (espacios reales por piso y zona con
ids; instrucción de fotografiar todo; instrucción a Gemini de proponer tomas concretas por espacio y asignarlas
al id correcto). Gemini ve las fotos y regresa el JSON `porCuarto` ya existente; la app lo valida con
`parsePropuesta` (sin cambios) y, tras revisar, lo deja en `state.guide.proposal`. La descripción de texto se
retira.

**Tech Stack:** Frontend estático: `frontend/checklist-logic.js` (motor puro, `node --test`) y
`frontend/checklist.html` (JS inline). Sin build step. Gemini es manual (Bruno pega prompt + fotos y trae el
JSON); la app no procesa imágenes ni llama a ninguna API.

---

## Conceptos y nombres (leer antes de F72)

- `buildPropuestaPrompt(state)` (`checklist-logic.js:1130`): hoy arma el prompt desde `guide.descripcion`.
  Se reescribe a la versión con fotos; conserva el mismo nombre y punto de entrada.
- `parsePropuesta(texto, state)` (`checklist-logic.js:1173`): importador tolerante; devuelve
  `{ proposal:{porCuarto:{id:[{nombre,shotType,movement,enfoque,priority}]}}, report:{agregadas,ignoradas,motivos} }`.
  NO se modifica.
- Consumo: `state.guide.proposal` → `proposalShotsFor`/`suggestionsForTarget` durante la captura. Sin cambios.
- UI: `renderPropuestaIA()` (`checklist.html:3911`) ya muestra la propuesta agrupada por cuarto (itera
  `porCuarto`) y tiene el flujo pegar → parsear → confirmar/quitar. Hoy también pinta un campo de descripción
  (`guide.descripcion`, `editarDescripcion`/`state.guide.descripcion = val` cerca de `:3979`) que se retira.
- Espacios: `state.espacios` con `nombre`, `piso`, `zona` ('interior'|'exterior'|'amenidades'), `id`.

## Invariantes (gate, todas las fases)

- `parsePropuesta` no cambia de forma; `state.guide.proposal` y su consumo (`proposalShotsFor`,
  `suggestionsForTarget`) siguen igual. `buildExport` sigue dando `version:1`.
- El import de la Meta B SOLO toca `state.guide.proposal`; jamás mediaFiles ni cobertura.
- Sin emojis. Acentos en texto visible; ids/clases/ids-de-icono sin acentos. Áreas táctiles ≥44px, mobile-first.
- `node --test frontend/checklist-logic.test.js` queda 100% verde y por arriba del baseline (265); ninguna
  prueba previa se rompe.
- No tocar `iav-metadata-app` ni `adapter/AdapterScript4_v1.js`.

**Gate motor (F72):**
`bash .claude/skills/build-from-plan/phase-gate.sh "frontend/checklist-logic.js,frontend/checklist-logic.test.js" "version: 1" "normalizeChecklistData" "function parsePropuesta"`

**Gate UI (F73):**
`bash .claude/skills/build-from-plan/phase-gate.sh "frontend/checklist.html" "version: 1" "normalizeChecklistData"`

**Gate cierre (F74):**
`bash .claude/skills/build-from-plan/phase-gate.sh "docs/RONDAS.md,docs/ARQUITECTURA.md"`
(GOTCHA: el check "sin emojis" lee todo archivo cambiado; RONDAS y ARQUITECTURA traen caracteres como ✓ o ⚠
PREEXISTENTES que dan falso positivo. Verifica con `git diff HEAD~1..HEAD` que la fase NO agregó emojis; si solo
son preexistentes, el gate de docs se considera pasado por excepción documentada.)

---

## El prompt con fotos (qué genera F72)

`buildPropuestaPrompt(state)` reescrito. Conserva el estilo de concatenación de string del actual. Genera:

- Lista de espacios REALES de `state.espacios`, agrupados por `piso` y por `zona`, cada uno con `id` y `nombre`.
  Doble función: guía de qué fotografiar y tabla de ids para que Gemini mapee. (Si un espacio no tiene piso,
  agruparlo bajo una etiqueta neutra como "Sin piso"; respetar el orden de `state.espacios`.)
- Instrucción para Bruno (arriba): toma fotos de todos estos espacios, en el orden que quieras, y súbelas junto
  con este prompt.
- Instrucción para Gemini: recibirás fotos de la propiedad; identifica cada espacio y asígnalo al `id` correcto
  de la lista; propón tomas concretas y específicas de ESTA casa por espacio (ejemplos: "push in en la cocina",
  "detalle del candelabro en la sala"); `nombre` = la acción concreta; `enfoque` = el sujeto o encuadre (nada de
  hora del día, clima ni logística); `shotType` y `movement` SOLO del vocabulario cerrado; `priority` must|nice.
- Vocabulario cerrado de `shotType` (`getShotTypes()`) y `movement` (`getMovements()`) con ids y etiquetas,
  generado en vivo (igual que hoy).
- Reglas duras (heredadas, adaptadas): básate en lo que VES en las fotos (reemplaza "básate en la descripcion");
  propón tomas solo para espacios de la lista; PROHIBIDO inventar espacios; usa solo ids exactos del vocabulario;
  si un espacio no tiene nada destacable, omítelo; responde ÚNICAMENTE el JSON, sin markdown; máximo 6 por espacio.

Se elimina toda mención y uso de `guide.descripcion` en el prompt.

## El formato de import (sin cambios)

```jsonc
{ "porCuarto": { "<id>": [ { "nombre": "...", "shotType": "<id>", "movement": "<id>", "enfoque": "...", "priority": "must|nice" } ] } }
```

`parsePropuesta` se reutiliza tal cual.

---

## F72 — Motor: reescribir `buildPropuestaPrompt` a la versión con fotos + tests

**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.

1. Reescribir `buildPropuestaPrompt(state)` (logic.js:1130) a la versión con fotos descrita arriba:
   - Construir la lista de espacios desde `state.espacios`, agrupados por `piso` (orden de aparición; los que no
     tengan piso bajo "Sin piso") y dentro de cada piso por `zona`. Cada entrada incluye `id` y `nombre`.
   - Emitir la instrucción para Bruno (fotografiar todos los espacios, orden libre, subir con el prompt) y la
     instrucción para Gemini (identificar y asignar por id; tomas concretas por espacio; nombre=acción,
     enfoque=sujeto/encuadre).
   - Inyectar `shotType` (`getShotTypes()`) y `movement` (`getMovements()`) con id + etiqueta.
   - Reglas duras adaptadas (básate en las fotos; no inventar espacios; solo ids del vocabulario; omite espacios
     sin nada destacable; solo JSON; máximo 6 por espacio).
   - NO leer ni mencionar `guide.descripcion`.
2. `parsePropuesta` NO se toca.
3. Tests (`checklist-logic.test.js`), con un `state` con dos pisos y cuartos de distintas zonas (p. ej. Planta
   baja: Cocina interior, Fachada exterior; Planta alta: Recamara interior), ids conocidos:
   - El prompt contiene los `id` reales de todos los espacios (la lista de mapeo).
   - El prompt agrupa por piso: aparecen las etiquetas de los pisos del estado.
   - El prompt NO contiene la palabra "descripcion" ni usa `guide.descripcion` (probar que con
     `guide.descripcion` puesto a un texto, el prompt no lo incluye).
   - El prompt contiene los ids de `getShotTypes()` y `getMovements()`.
   - El prompt incluye la instrucción de fotografiar y de responder solo el JSON con `porCuarto`.
   - Sanity de ida y vuelta: una respuesta de ejemplo `{porCuarto:{<idReal>:[{nombre,shotType,movement,enfoque,priority}]}}`
     pasa por `parsePropuesta(state)` y `report.agregadas >= 1` con el id mapeado (confirma compatibilidad del
     formato, sin tocar el parser).

**Gate:** gate motor. Aceptación: `node --test` verde (>265); `buildPropuestaPrompt` sin dependencia de
descripción; `parsePropuesta` intacto; `version:1` intacto.

---

## F73 — UI: ajustar el área de propuesta IA (quitar descripción, texto de fotos) — CHECKPOINT VISUAL

**Archivos:** `frontend/checklist.html`.

> EJECUCIÓN HÍBRIDA — CHECKPOINT VISUAL (excepción al flujo autónomo). Esta fase NO se ejecuta de forma
> autónoma. Secuencia: (1) PROPONER a Bruno el ajuste visual (cómo queda el área de propuesta IA sin el campo de
> descripción y con el texto de fotos) y ESPERAR su aprobación antes de tocar `checklist.html`; (2) construir;
> (3) verificar visualmente en el preview/Playwright; (4) Bruno aprueba el resultado visual; (5) recién entonces
> commitear. El gate UI es condición necesaria pero no suficiente.

1. En `renderPropuestaIA()` (checklist.html:3911) y alrededores: quitar el campo de descripción y su handler
   (`editarDescripcion`/la línea `state.guide.descripcion = val` cerca de `:3979`). No borrar `guide.descripcion`
   del estado (retro-compat de estados viejos); solo dejar de pintarlo y de usarlo en este flujo.
2. Actualizar el texto de ayuda del área: explicar el flujo con fotos (genera el prompt, toma fotos de todos los
   espacios, pega el prompt y las fotos en Gemini, trae el JSON y pégalo aquí). El botón "Generar prompt" sigue
   llamando a `logic.buildPropuestaPrompt(state)` (ahora la versión con fotos).
3. La propuesta ya se muestra agrupada por cuarto (`renderPropuestaIA` itera `porCuarto`); mantener eso. El
   flujo pegar → `parsePropuesta` → confirmar/quitar (con el reporte de ignorados) se conserva sin cambios de
   guardado.
4. Verificación inline (debe imprimir `inline OK`):
   `node -e "const fs=require('fs');const h=fs.readFileSync('frontend/checklist.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');require('vm').compileFunction(m);console.log('inline OK')"`
5. Verificación visual (evidencia en `docs/superpowers/verificacion/f73/`, capturas en commit de docs SEPARADO):
   - Estático: `cd frontend && python3 -m http.server 8092` → `http://localhost:8092/checklist.html?demo=1&cb=1`.
   - Con Playwright/preview: generar el prompt con fotos y capturar; pegar una respuesta de ejemplo y capturar la
     propuesta agrupada por cuarto; confirmar que ya no aparece el campo de descripción.
   - Desplegar el worker al preview (Claude despliega): `cd worker && npx wrangler deploy -c wrangler.preview.toml`.

**Gate:** gate UI. Aceptación: `inline OK`; sin campo de descripción en el flujo; el prompt generado es el de
fotos; evidencia visual antes/después (en su commit de docs aparte).

---

## F74 — Cierre: documentación y verificación

**Archivos:** `docs/RONDAS.md`, `docs/ARQUITECTURA.md`, y evidencia bajo `docs/superpowers/verificacion/`
(capturas en commit de docs separado por el falso positivo del gate con PNG).

1. `docs/RONDAS.md`: entrada nueva (siguiente Rxx; verificar el tope actual) con hora de Monterrey
   (`TZ="America/Monterrey" date "+%Y-%m-%d %H:%M:%S %Z"`), resumiendo la Meta B (F72–F74): prompt con fotos
   generado en vivo (espacios por piso y zona con ids; sin descripción), sugerencias de tomas concretas por
   cuarto, formato `porCuarto` reutilizado (parsePropuesta sin cambios), import solo a `state.guide.proposal`.
2. `docs/ARQUITECTURA.md`: en la sección de propuesta IA / sugerencias, anotar que el prompt ahora es con fotos
   (Gemini ve la casa y asigna por id) y que la descripción de texto se retiró del flujo; punteros a
   `buildPropuestaPrompt`/`parsePropuesta` y a `renderPropuestaIA`.
3. Verificación end-to-end (opcional, en el preview con un contrato de PRUEBA desechable si se quiere validar el
   guardado real): generar el prompt, pegar una respuesta de ejemplo, confirmar que la propuesta aparece por
   cuarto en la captura. Evidencia en `docs/superpowers/verificacion/f74/`.
4. Suite: `node --test frontend/checklist-logic.test.js` (verde, >265).

**Gate:** gate cierre (docs). Aceptación: docs actualizadas con hora de Monterrey; suite verde; evidencia
adjunta.

---

## Orden de ejecución y dependencias

Ejecución HÍBRIDA (como la Meta A):
- F72 y F74 con build-from-plan casi autónomo (gates programáticos, un commit por fase).
- F73 es CHECKPOINT VISUAL, no autónomo (ver la nota al inicio de la fase).

Dependencias:
- F72 (motor) → F73 (UI, consume el prompt nuevo) → F74 (cierre). Ninguna es paralelizable.
- Una fase = un commit `Rxx — Fnn: …` (Rxx secuencial desde el tope actual de RONDAS). Rama
  `checklist-cambios-2026-06-07`. Nada a `main`, nada de PR, worker solo al preview.
- Si una fase exige cambiar este plan, actualizar primero el plan y registrar por qué.
