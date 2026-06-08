# Plan — Rediseño de "Armar cuartos" (esquema vivo) — F40–F44

> **Para ejecutar con `build-from-plan`.** Rama `checklist-cambios-2026-06-07`. Una micro-fase = un commit con gate.
> Nunca `main`, nunca deploy a producción (sí preview aislado). Continúa la numeración (F40+).
> **Spec:** `docs/superpowers/specs/2026-06-08-armar-cuartos-rediseno-design.md` (fuente de verdad).
> **Mockup aprobado (verdad visual):** `worker/mock-armar-cuartos/index.html`.

**Goal:** Reemplazar "Armar cuartos" por un **esquema vivo** (la pantalla es la casa, por piso/zona, con
agregar/quitar en sitio, numeración y sub-cuartos inline), una **hoja para agregar** (global y contextual) y un
**arranque rápido** opcional por números — sobre el modelo de datos existente, sin tocar terreno ni drone.

**Architecture:** Helpers puros en `checklist-logic.js` (catálogo por zona, numeración, planner del esqueleto) con
tests; la UI en `checklist.html` los consume. `state.espacios`/`state.pisos`/`version:1`/`normalizeChecklistData`
intactos. Reutiliza `nuevoEspacio`, `quitarEspacio` (cascada), `renombrarEspacio`, `cambiarPisoEspacio`,
`renderDroneToggle`, `logic.suggestedSpacesFor`, `logic.searchSpaces`, `logic.detectCategoria`.

**Tech Stack:** HTML/CSS/JS inline (mobile-first, sistema R1, iconos Tabler `ti ti-*`), `node --test`.

## Invariantes (gate, todas las fases)
`version:1` intacto. `normalizeChecklistData` carga estado viejo sin pérdidas. Backend (`worker/`) intocable.
Terreno (vista propia) y drone (F38/F39: toggle, sesión, captura) **no cambian** — solo consumen `state.espacios`.
Sin emojis (Tabler). Español con acentos en texto visible; ids sin acentos. Áreas táctiles ≥44px. No tocar
`iav-metadata-app`.

**Gate UI (F41–F44):**
`bash .claude/skills/build-from-plan/phase-gate.sh "frontend/checklist.html" "version: 1" "normalizeChecklistData"`
**Gate motor (F40):** el mismo, apuntando a `frontend/checklist-logic.js` (corre `node --test` + sintaxis + alcance).

## Decisiones transversales (leer antes de F40)
1. **Tres zonas = las del motor.** Cada espacio de plantilla ya trae `zona ∈ {interior, exterior, amenidades}`
   (`checklist-logic.js:42-164`). Las pestañas/secciones de la UI son exactamente esas tres.
2. **Catálogo de la hoja = conceptos base deduplicados.** La biblioteca tiene entradas numeradas distintas
   ("Recamara principal", "Recamara 2", "Recamara 3"). La hoja muestra **un** mosaico por concepto base
   ("Recámara"); la numeración la hace `nextRoomName` al agregar. Por eso F40 define `BASE_CONCEPTS` (curados) en vez
   de mostrar la lista cruda.
3. **Pisos opcionales.** Si `state.pisos` está vacío, los cuartos de interior usan piso `'Planta baja'` por defecto;
   "Agregar planta" añade 'Planta alta', 'Planta 3'… Exterior/Amenidades no llevan piso (piso `null`/lógico fijo),
   como property-wide. No se exige crear piso antes de agregar.
4. **Nada nuevo se persiste fuera de `state.espacios`/`state.pisos`.** El estado de la hoja, el arranque rápido y el
   target activo de la hoja son **solo UI** (variables de módulo, no van al contrato).

---

## F40 — Motor: catálogo por zona, numeración y planner del esqueleto (con tests)
**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.

Añadir (aditivo, exportar en el objeto `logic`):

- **`BASE_CONCEPTS`**: por `tipo`, lista curada de conceptos base para la hoja, cada uno
  `{ base, zona, icon, firstName?, repeatable? }`. `base` es el texto del mosaico ("Recámara", "Baño",
  "Medio baño", "Sala", "Comedor", "Cocina", "Recibidor", "Estudio", "Cuarto de TV", "Lavandería",
  "Cuarto de servicio", "Fachada", "Jardín", "Terraza", "Cochera", "Patio", "Roof garden", "Alberca",
  "Casa club", "Gimnasio", "Cancha", "Áreas verdes", "Caseta", …). `firstName` permite que la primera
  instancia tenga nombre propio (Recámara → primera "Recámara principal"). `repeatable:true` para los que
  numeran (Recámara, Baño, Medio baño, Cochera). Derivar de `SPACE_SUGGESTIONS[tipo]` deduplicando por
  concepto base + completar con los del mockup; `icon` mapea a un set de iconos Tabler.
- **`catalogByZone(tipo)`** → `{ interior:[...], exterior:[...], amenidades:[...] }` con los `BASE_CONCEPTS` del
  tipo agrupados por `zona`, en orden de recorrido. Para `terreno` devuelve `{}` (no aplica).
- **`baseConcept(nombre)`** → string: normaliza un nombre a su concepto base ("Recámara 2" → "Recámara",
  "Recámara principal" → "Recámara", "Baño 3" → "Baño"). Usa minúsculas/sin acentos para comparar; devuelve el
  `base` canónico de `BASE_CONCEPTS` si coincide, si no el nombre tal cual.
- **`nextRoomName(existingNames, concept)`** → string: dado el arreglo de nombres ya usados en el ámbito y un
  `concept` de `BASE_CONCEPTS`, devuelve el siguiente nombre. Si no hay ninguno y `concept.firstName`, devuelve
  `firstName`; si no, `base`. Si ya existen, devuelve `base + ' ' + n` con `n` el menor entero ≥2 libre
  (contando por `baseConcept`).
- **`planSkeleton(tipo, { rec, ban, med, pisos, opts })`** → arreglo ordenado de
  `{ nombre, zona, piso, parentId:null }` que el UI materializa con `nuevoEspacio`. Reglas:
  - crea `pisos` plantas ('Planta baja', 'Planta alta', 'Planta 3'…);
  - típicos marcados en `opts` (Sala/Comedor/Cocina → interior, Planta baja; Fachada → exterior);
  - `rec` recámaras y `ban` baños numerados (a 'Planta alta' si `pisos>1`, si no 'Planta baja');
  - `med` medios baños (Planta baja);
  - **idempotente por nombre dentro del propio plan** (no genera dos veces el mismo nombre).
    (La fusión con `state.espacios` existentes la hace el Uo en F43: no duplica nombres ya presentes.)

- [ ] **Step 1 — test (rojo):** en `checklist-logic.test.js` agregar:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const logic = require('./checklist-logic.js');

test('catalogByZone agrupa por zona y dedupe recamaras', () => {
  const cat = logic.catalogByZone('casa');
  assert.ok(cat.interior.some(c => c.base === 'Recámara'));
  assert.equal(cat.interior.filter(c => c.base === 'Recámara').length, 1);
  assert.ok(cat.exterior.some(c => c.base === 'Fachada'));
});

test('nextRoomName numera con firstName', () => {
  const rec = logic.BASE_CONCEPTS.casa.find(c => c.base === 'Recámara');
  assert.equal(logic.nextRoomName([], rec), 'Recámara principal');
  assert.equal(logic.nextRoomName(['Recámara principal'], rec), 'Recámara 2');
  assert.equal(logic.nextRoomName(['Recámara principal', 'Recámara 2'], rec), 'Recámara 3');
});

test('baseConcept normaliza', () => {
  assert.equal(logic.baseConcept('Recámara 2'), 'Recámara');
  assert.equal(logic.baseConcept('Recamara principal'), 'Recámara');
});

test('planSkeleton arma plantas y numera', () => {
  const plan = logic.planSkeleton('casa', { rec: 3, ban: 2, med: 1, pisos: 2, opts: { Sala: true, Cocina: true, Fachada: true } });
  const nombres = plan.map(p => p.nombre);
  assert.ok(nombres.includes('Sala'));
  assert.ok(nombres.includes('Recámara principal') && nombres.includes('Recámara 3'));
  assert.ok(plan.find(p => p.nombre === 'Recámara principal').piso === 'Planta alta');
  assert.ok(plan.find(p => p.nombre === 'Fachada').zona === 'exterior');
});

test('catalogByZone terreno vacío', () => {
  assert.deepEqual(logic.catalogByZone('terreno'), {});
});
```

- [ ] **Step 2 — correr y ver fallar:** `node --test frontend/checklist-logic.test.js` → FAIL (funciones no definidas).
- [ ] **Step 3 — implementar** `BASE_CONCEPTS`, `catalogByZone`, `baseConcept`, `nextRoomName`, `planSkeleton` y
  exportarlas en el objeto `logic`. Mantener todo lo existente sin cambios.
- [ ] **Step 4 — correr y ver pasar:** `node --test frontend/checklist-logic.test.js` → 214 previos + nuevos en verde.
- [ ] **Step 5 — gate:** `bash .claude/skills/build-from-plan/phase-gate.sh "frontend/checklist-logic.js" "version: 1" "normalizeChecklistData"` → PASA.
- [ ] **Step 6 — commit:** `F40 — motor: catalogo por zona, numeracion y planner de esqueleto (con tests)`.

## F41 — UI A: esquema vivo (secciones por piso/zona, renglón con +1/quitar/sub inline)
**Archivos:** `frontend/checklist.html`.

- **Reescribir `renderSetupList`** → render del esquema por secciones, en orden: cada planta de `state.pisos`
  (o 'Planta baja' por defecto) con sus cuartos `interior`, luego sección **Exterior**, luego **Amenidades**
  (cuartos cuya `zona` sea exterior/amenidades, property-wide). Encabezado por sección: ícono + nombre + conteo.
- **Reescribir `setupRoomRow`** → renglón con: ícono (de `BASE_CONCEPTS`/zona), nombre numerado, botón **+1**
  (`duplicarEspacio(id)`: agrega otra instancia del mismo concepto con `nextRoomName`), botón **quitar**
  (`quitarEspacio(id)`, cascada existente), barra de chips de sub-cuarto (Clóset/Baño/Vestidor/Balcón →
  `addSubRapido`, ya existe) y los sub-cuartos listados debajo con su X. Todo en sitio (sin lista al fondo).
- **Nuevo `duplicarEspacio(id)`**: encuentra el espacio, calcula `nextRoomName` sobre los nombres del mismo
  ámbito (misma planta para interior; global para exterior/amenidades) usando `logic.baseConcept`, y crea con
  `nuevoEspacio(nombre, piso, zona, null, categoria)`.
- **Botón "Agregar planta"** entre la última planta y Exterior → `agregarPiso()` (existe). Mantener
  `quitarPiso`/`renombrar`/`cambiarPisoEspacio` accesibles desde `accionesEspacio` (long-press/menú existente).
- Por ahora el esquema se muestra aunque la sección de agregar siga siendo la vieja (se reemplaza en F42); meta:
  que el render del esquema compile y se vea, sin romper el flujo actual.
- **Gate** UI → PASA. **Commit:** `F41 — UI: esquema vivo (secciones piso/zona, renglon +1/quitar/sub inline)`.

## F42 — UI B: hoja para agregar (global + contextual) con mosaicos, pestañas y buscador
**Archivos:** `frontend/checklist.html`.

- **Nuevo bottom sheet** `renderHojaAgregar()` + scrim, con: pestañas Interior/Exterior/Amenidades; en Interior un
  selector "Agregar a: <planta>"; buscador (reusa `logic.searchSpaces` para resultados fuera del catálogo base);
  rejilla de **mosaicos** desde `logic.catalogByZone(tipo)[zona]` (ícono + base), cada uno con badge del conteo
  actual de ese concepto. Tocar un mosaico → `agregarDesdeHoja(zona, base)` que numera con `nextRoomName` y crea con
  `nuevoEspacio`; **la hoja permanece abierta** (re-render del sheet + del esquema detrás).
- **Estado UI nuevo:** `hojaOpen` (bool), `hojaZona` ('interior'|'exterior'|'amenidades'), `hojaPiso` (string).
- **`abrirHojaAgregar()`** (zona por defecto 'interior', piso = primera planta) y **`abrirHojaAgregarEn(zona, piso)`**
  (contextual) y **`cerrarHojaAgregar()`**.
- **Botón global "Agregar cuarto"** en el footer fijo → `abrirHojaAgregar()`. **Botón "Agregar cuarto aquí"** al
  final de cada sección (planta/Exterior/Amenidades) → `abrirHojaAgregarEn(zona, piso)`.
- **Reemplazar** `renderSetupSuggest` y `renderSetupSearchDrop` (la nube de chips + dropdown viejos) por la hoja.
  El buscador inline viejo del setup se retira (su rol pasa al buscador de la hoja).
- **Gate** UI → PASA. **Commit:** `F42 — UI: hoja para agregar (mosaicos por zona, global + contextual)`.

## F43 — UI C: arranque rápido + pisos opcionales + recableado de `renderSetup`
**Archivos:** `frontend/checklist.html`.

- **Nuevo `renderArranqueRapido()`**: card colapsable con steppers Recámaras/Baños/Medios baños/Pisos + toggles
  Sala/Comedor/Cocina/Fachada + botón "Generar esqueleto". Estado UI: `qsCollapsed`, `qsValores`.
- **`generarEsqueleto()`**: llama `logic.planSkeleton(tipo, qsValores)`, asegura las plantas en `state.pisos`, y
  materializa cada item con `nuevoEspacio` **omitiendo los nombres ya presentes** en el mismo ámbito (idempotente
  contra `state.espacios`). Colapsa la card al terminar. `scheduleSave(); render()`.
- **Pisos opcionales:** en `renderSetup`, si `state.pisos` vacío, no exigir crear piso; el esquema usa 'Planta baja'
  por defecto y las altas se añaden con "Agregar planta". **Retirar `renderPisoAddChips`** y el modelo de chips de
  piso "con foco" (`setSetupPiso`/`getFocusPiso` dejan de usarse para el foco; si quedan referencias muertas,
  eliminarlas o neutralizarlas sin romper el archivo).
- **Recablear `renderSetup`** al orden final: Tipo de propiedad → Arranque rápido → Esquema vivo (F41) →
  Toggle de drone (`renderDroneToggle`, intacto) → footer (conteo + "Agregar cuarto" + "Listo, a capturar").
  **Terreno** sigue desviándose a `renderSetupTerreno` (sin cambios).
- **Gate** UI → PASA. **Commit:** `F43 — UI: arranque rapido + pisos opcionales + renderSetup recableado`.

## F44 — Integración, limpieza y verificación final
**Archivos:** `frontend/checklist.html` (y, si hace falta, ajustes menores).

- **Compat:** abrir un estado viejo (con cuartos y sub-cuartos ya armados, incl. drone-piso viejo) y confirmar que
  `normalizeChecklistData` no orfana nada y el esquema los muestra agrupados por su `zona`/piso. Cuartos sin `zona`
  → inferir con `logic.detectCategoria`/heurística a 'interior' por defecto.
- **No-regresión:** terreno entra a su vista propia; el toggle de drone y la **Sesión de drone** (F39) siguen
  apareciendo y funcionando; el flujo de captura lee `state.espacios` igual.
- **Limpieza:** eliminar funciones/CSS muertos del setup viejo (`renderSetupSuggest`, `renderSetupSearchDrop`,
  `renderPisoAddChips`, helpers de foco de piso) que ya no se referencien. Verificar con grep que no queden llamadas
  colgantes.
- **Verificación estructural:** `node -e` que compila el JS inline de `checklist.html`; `node --test` 214+; gate UI.
- **Validación manual (preview aislado):** desplegar `wrangler.preview.toml`, abrir `?demo=1`, recorrer contra el
  mockup: agregar/quitar en sitio, numeración (Recámara principal/2/3), sub-cuartos inline, hoja global y
  contextual, arranque rápido idempotente, pisos opcionales, Exterior/Amenidades property-wide, terreno y drone
  intactos. (El render real lo valida Bruno en su celular.)
- **Gate** UI → PASA. **Commit:** `F44 — integracion, limpieza y verificacion del rediseno de Armar cuartos`.

---

## Self-review (cobertura del spec)
- Dolor 1 (quitar lejos) → F41 (quitar en sitio en el renglón). ✔
- Dolor 2 (orden/agrupación) → F41 (secciones por zona/piso) + F40 (catálogo ordenado). ✔
- Dolor 3 (armar caminando) → F42 (hoja global+contextual) + F43 (arranque rápido, pisos opcionales). ✔
- Numeración real → F40 (`nextRoomName`) consumida en F41/F42/F43. ✔
- Sub-cuartos conservados → F41 (chips inline, reusa `addSubRapido`/`parentId`). ✔
- Modelo de datos / `version:1` / `normalizeChecklistData` intactos → invariantes + F44 compat. ✔
- Terreno y drone intactos → invariantes + F43/F44 no-regresión. ✔
- portal.html fuera de alcance → backlog. ✔

---

## Ronda de ajustes (feedback Bruno, 2026-06-08 — F45 motor, F46 UI)

Feedback sobre el preview de F40–F44. Decisiones tomadas con Bruno:

1. **Hoja "Agregar cuarto":** tocar el mosaico AGREGA (como hoy); cada mosaico con conteo ≥1 muestra un
   **ícono de basura** para quitar uno de ese concepto (deshacer sin salir de la hoja).
2. **Arranque rápido por piso:** el stepper "Pisos" define cuántos bloques aparecen; **cada bloque**
   (Planta baja, Planta alta, Planta 3…) trae sus propios steppers Recámaras/Baños/Medios baños **y** sus
   toggles de típicos (Sala/Comedor/Cocina) — "por piso también". **Fachada** queda como toggle general
   (exterior). Resuelve "¿de qué piso es cada cosa?" desde el origen (sin auto-asignación sorpresa).
3. **Mover de piso:** botón visible de "mover de piso" en cada renglón interior (reusa `cambiarPisoEspacio`).
4. **Amenidades disponibles para casa** (y enriquecer quinta/depto): Alberca, Casa club, Gimnasio, Cancha,
   Áreas verdes, Caseta, Asadores, Palapa, Cocina exterior, Jardines.
5. **Nombres de piso unificados:** Planta baja / Planta alta / Planta 3 / Planta 4. "Agregar planta" agrega la
   siguiente planta con este esquema (+ "Otro…" texto libre); se quitan las sugerencias legacy
   (Sótano/Piso N/Exterior/Amenidades/Casa principal).
6. **Secciones vacías discretas** (no caja-placeholder que parece rota) + **fallback de ícono real**
   (no `ti-square`).
7. **Arranque rápido colapsado** si ya hay cuartos en el estado.

### F45 — Motor: amenidades para casa, `planSkeleton` por piso, naming de pisos (con tests)
**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.

- **`BASE_CONCEPTS.casa` gana zona amenidades** (Alberca, Casa club, Gimnasio, Cancha, Áreas verdes, Caseta,
  Asadores, Palapa, Cocina exterior, Jardines) con íconos Tabler razonables; enriquecer quinta/depto con los que
  falten (Caseta, Asadores, Palapa, Cocina exterior). `catalogByZone('casa').amenidades` deja de ser `[]`.
- **`planSkeleton(tipo, spec)` nueva firma:** `spec = { floors: [{ rec, ban, med, opts:{Sala,Comedor,Cocina} }, …],
  fachada: bool }`. `floors[i]` → piso `logic.floorLabel(i)`. Numeración de recámaras/baños/medios **global**
  (PB primero, luego PA…) para que los nombres sean únicos e identificables (Recámara principal, Recámara 2, 3…).
  Típicos (Sala/Comedor/Cocina) por piso según `opts`. `fachada` → exterior, una vez.
- **`floorLabel(index)`** → 'Planta baja' (0), 'Planta alta' (1), 'Planta '+(i+1) (≥2). **`nextFloorName(pisos)`**
  → el siguiente label no usado, saltando pisos drone.
- **Tests:** `catalogByZone('casa').amenidades` incluye 'Caseta' y 'Alberca'; `planSkeleton` por-piso coloca las
  recámaras en su piso y numera global; `floorLabel`/`nextFloorName` dan la secuencia esperada. Mantener 219+ verde.
- **Gate motor** (ambos archivos) → PASA. **Commit:** `F45 — motor: amenidades casa, planSkeleton por piso, naming pisos (tests)`.

### F46 — UI: arranque rápido por piso, basura en hoja, mover de piso, naming/limpieza
**Archivos:** `frontend/checklist.html`.

- **`renderArranqueRapido` por piso:** stepper "Pisos" arriba; un bloque por piso (`floorLabel`) con steppers
  Recámaras/Baños/Medios baños + toggles Sala/Comedor/Cocina; toggle general Fachada. Estado UI
  `qsValores = { floors:[{rec,ban,med,opts}], fachada }`; al cambiar "Pisos" crece/encoge `floors`. `generarEsqueleto`
  llama la nueva `logic.planSkeleton(setupTipo, qsValores)` (idempotente por nombre). **`qsCollapsed = true`** por
  defecto si `state.espacios` ya tiene cuartos.
- **Hoja:** en `renderHojaAgregar`, cada mosaico con `cnt ≥ 1` muestra un botón de basura
  (`onclick` → `quitarUnoDesdeHoja(zona, base)` que borra la última instancia de ese concepto en el ámbito).
  Tocar el cuerpo del mosaico sigue llamando `agregarDesdeHoja`.
- **Mover de piso:** en `setupRoomRow` (solo interior, no drone) un botón visible (ícono `ti-stairs`/`ti-arrows-up-down`)
  → `cambiarPisoEspacio(id)` (modal existente). 
- **`agregarPiso` unificado:** agrega `logic.nextFloorName(state.pisos)` directo (sin el modal de sugerencias
  legacy); conservar una opción "Otro…" de texto libre. Quitar Exterior/Amenidades/Casa principal/Piso N de cualquier
  lista de pisos.
- **Secciones vacías discretas:** `.setup-sec-empty` como línea sutil (no caja). **Fallback de ícono** en
  `setupRoomIcon`/`setupIconClass` → ícono real (p. ej. `ti-door` interior, `ti-building` amenidades) en vez de
  `ti-square`. Cubrir en `SETUP_ICON_MAP` los íconos nuevos de amenidades (asadores/palapa/cocina exterior/jardines).
- **Gate UI** → PASA. **Commit:** `F46 — UI: arranque rapido por piso, basura en hoja, mover de piso, naming/limpieza`.
