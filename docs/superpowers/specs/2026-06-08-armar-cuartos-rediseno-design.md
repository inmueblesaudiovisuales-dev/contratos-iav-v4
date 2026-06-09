# Rediseño de "Armar cuartos" (checklist.html) — esquema vivo

Fecha: 2026-06-08
Estado: spec para revisión
Mockup aprobado: `worker/mock-armar-cuartos/index.html` (desplegado en
`iav-mock-armar-cuartos.inmueblesaudiovisuales.workers.dev`). El mockup es la fuente visual de verdad.

## 1. Problema

El "Armar cuartos" actual tiene tres dolores que reportó Bruno:

1. **Quitar es lejos.** Al tocar un chip sugerido el cuarto se agrega a una lista que vive hasta
   el fondo (después de sugerencias + toggle de drone); el chip solo se desactiva con palomita.
   Agregar y deshacer están en lugares distintos → hay que hacer scroll para corregir un toque por error.
2. **Sin orden ni agrupación clara.** La lista se ordena por orden de captura y las sugerencias son
   una nube plana; las zonas (interior/exterior/amenidades) no se usan como grupos visibles.
3. **Fricción al armar caminando.** Obliga a elegir piso primero, ver sus sugerencias y buscar lo que
   falta. Bruno quiere armar la lista mientras camina la casa, sin batallar ni buscar lo común.

## 2. Decisiones (brainstorming)

- **Desde cero, sin fricción** (respeta F24: no se pre-llena la casa). El acelerador es opcional.
- **Esquema vivo:** la pantalla *es* el esquema de la casa. No hay nube de chips separada de la lista;
  lo que agregas se ve en el mismo lugar, agrupado por zona y en orden natural.
- **Pisos opcionales:** se empieza a agregar de inmediato; por defecto todo cae en "Planta baja";
  "Agregar planta" es opcional; el piso es agrupación, no requisito.
- **Numeración real** (no contador genérico): Recámara, Recámara 2, Recámara 3 — para identificar en
  captura y edición. (Coincide con la convención que ya usa la biblioteca del motor.)
- **Sub-cuartos se conservan** y se agregan fácil, inline desde el renglón del cuarto.
- **Tres formas de agregar**, todas fuera del arranque rápido:
  1. **Arranque rápido (opcional):** steppers de Recámaras/Baños/Medios baños/Pisos + típicos
     (Sala/Comedor/Cocina/Fachada) → "Generar esqueleto".
  2. **Agregar cuarto (global):** botón grande fijo al pulgar → hoja inferior con mosaicos por zona;
     cada toque suelta el cuarto en el esquema y la hoja se queda abierta para seguir; buscar adentro.
  3. **Agregar cuarto aquí (contextual):** botón al final de cada sección (cada planta, Exterior,
     Amenidades) que abre la hoja ya apuntando a ese piso/zona — para cuando pasas y notas que faltó algo.

## 3. El motor ya encaja (no se rediseña la biblioteca)

`checklist-logic.js` ya clasifica cada espacio de plantilla con una **zona** (`interior` / `exterior` /
`amenidades`), ya trae **numeración** ("Recamara principal", "Recamara 2", "Recamara 3") y ya soporta
**sub-cuartos por padre** (p. ej. `['Bano principal','interior',false,'Recamara principal']`,
`['Closet','interior',false,'Recamara principal']`). Por lo tanto el rediseño es **casi todo UI**:

- Catálogo de la hoja = `logic.suggestedSpacesFor(state, focusP, tipo)` y `logic.searchSpaces(query)`
  (lo que ya alimenta los chips y el buscador hoy), **agrupado por su zona** en las tres pestañas.
- Sub-cuartos = `logic.nuevoEspacio(nombre, piso, zona, parentId, categoria)` con `parentId` (ya existe).
- Numeración = la convención de nombres existente; ver §5.
- **No se toca el modelo de datos:** `state.espacios` (con `piso`, `zona`, `parentId`, `orden`,
  `categoria`), `state.pisos`, `version:1` y `normalizeChecklistData` quedan intactos. Estados viejos
  cargan igual.

## 4. UX — tres bloques (ver mockup)

Una sola superficie con scroll. Orden vertical:

1. **Tipo de propiedad** (segmented) — igual que hoy.
2. **Arranque rápido (card colapsable, opcional).** Steppers Recámaras/Baños/Medios baños/Pisos +
   toggles Sala/Comedor/Cocina/Fachada + botón "Generar esqueleto". Tras generar, se colapsa solo;
   reabrible. No es destructivo si está vacío; ver §5 sobre regenerar.
3. **Esquema vivo.** Secciones en orden: cada **planta** (Interior), luego **Exterior**, luego
   **Amenidades**. Cada sección con encabezado (nombre + ícono + conteo). Cada cuarto es un renglón con:
   ícono, nombre numerado, **+1** (duplicar: siguiente número), **bote** (quitar en su sitio), chips
   punteados de **sub-cuarto** (Clóset/Baño/Vestidor/Balcón) y los sub-cuartos listados debajo con su X.
   Al final de cada sección: **"Agregar cuarto aquí"**. Entre plantas y Exterior: **"Agregar planta"**.
4. **Toggle de drone** (incluir tomas de drone) — se conserva tal cual (F38/F39 intactos).
5. **Footer fijo:** conteo total + **"Agregar cuarto"** (abre la hoja) + **"Listo"** (habilitado con ≥1 cuarto).

**Hoja inferior (bottom sheet) para agregar:** pestañas Interior / Exterior / Amenidades; en Interior, un
selector "Agregar a: <planta>"; buscador; rejilla de **mosaicos** (ícono + nombre) en orden de recorrido;
cada mosaico muestra un badge con cuántos llevas de ese tipo; tocar agrega y **la hoja permanece abierta**.

**Terreno:** sin cambios. Mantiene su vista propia (sujeto único + tomas sugeridas); no aplica el esquema
de cuartos ni la hoja.

## 5. Reglas de datos

- **Pisos.** Si no hay pisos, se asume "Planta baja" para los cuartos de interior (no se exige crear piso
  antes de agregar). "Agregar planta" añade "Planta alta", luego "Planta 3", etc. Exterior y Amenidades
  son property-wide (no llevan piso, o un piso lógico fijo). Los cuartos guardan `piso` como hoy.
- **Numeración.** Al agregar un cuarto cuya base ya existe en el mismo ámbito (interior: misma planta;
  exterior/amenidades: global), el nombre se numera: base → "base 2" → "base 3". La **primera** instancia
  conserva el nombre base que trae la biblioteca (p. ej. "Recamara principal" si así viene en la plantilla,
  o "Sala"); las siguientes numeran sobre la base ("Recamara 2"…). Bruno confirmó querer la numeración
  explícita para identificar todo. El usuario puede renombrar (función existente).
- **Sub-cuartos.** Se crean con `parentId` apuntando al cuarto. Heredan `piso` y `zona` del padre.
  Numerados igual dentro del padre (Baño, Baño 2). Quitar el padre arrastra sus sub-cuartos (cascada en
  código, como hoy en `quitarEspacio`).
- **Zona.** Cada cuarto guarda su `zona` (de la biblioteca o inferida). Define en qué sección/pestaña vive.
- **Arranque rápido.** "Generar esqueleto" crea, sobre el estado actual, las plantas pedidas y los cuartos
  numerados (Recámaras/Baños/Medios baños) + los típicos marcados + Fachada en Exterior. Decisión a fijar
  en el plan: si ya hay cuartos, "Generar" **suma** (no borra) o pide confirmación; default propuesto:
  suma de forma idempotente por nombre (no duplica los que ya existan).

## 6. Cambios en `frontend/checklist.html` (UI)

Se reescribe la familia del setup, conservando los nombres de función que el resto del archivo invoca
cuando aplique. A revisar/replantear en el plan:

- **Reescribir:** `renderSetup`, `renderSetupList`, `renderSetupSuggest`, `setupRoomRow`, `renderSubPick`,
  `renderSetupSearchDrop`, `renderPisoAddChips` (el modelo de chips de piso con foco desaparece; pisos
  pasan a secciones del esquema + "Agregar planta").
- **Nuevo:** render del esquema vivo por sección; render de la hoja (pestañas/selector de planta/mosaicos);
  `abrirHojaAgregar()` / `abrirHojaAgregarEn(zona, piso)`; helpers de numeración y de agrupación por zona;
  `renderArranqueRapido()` + `generarEsqueleto()`.
- **Conservar/reutilizar:** `nuevoEspacio`, `quitarEspacio` (cascada), `renombrarEspacio`,
  `cambiarPisoEspacio`, `accionesEspacio`, `agregarPiso`/`quitarPiso`, `cerrarSetup`/`abrirSetup`,
  `renderDroneToggle`, y los helpers de `logic` (`suggestedSpacesFor`, `searchSpaces`, `detectCategoria`,
  `isDronePiso`/aéreos donde aplique).
- **Estado de UI nuevo:** target activo de la hoja (zona + piso), si la hoja está abierta, estado del
  arranque rápido (colapsado + valores de steppers). Nada de esto se persiste en el contrato; solo UI.

Reglas duras del proyecto: sin emojis (iconos Tabler `ti ti-*` como el resto de `checklist.html`),
áreas táctiles ≥44px, mobile-first, sistema R1, español con acentos en texto visible (ids sin acentos),
`version:1` intacto.

## 7. Fuera de alcance

- **portal.html** (que el cliente arme el esqueleto) — queda en `docs/superpowers/backlog-checklist.md`.
- **Eliminar `parentId` del motor** — se conserva (compat + sub-cuartos).
- **Flujo de captura, drone (F38/F39) y terreno** — no cambian; solo consumen `state.espacios`.

## 8. Verificación

- `node --test frontend/checklist-logic.test.js` (214 pass) sigue verde; si se agregan helpers de lógica,
  con sus tests.
- JS inline de `checklist.html` compila (gate de `build-from-plan`): tests + sintaxis + alcance +
  invariantes (`version: 1`, `normalizeChecklistData`) + sin emojis.
- Validación manual en preview workers.dev (demo), comparando contra el mockup aprobado: agregar/quitar en
  sitio, numeración, sub-cuartos, hoja global y contextual, arranque rápido, pisos opcionales, terreno
  intacto, toggle de drone y sesión de drone intactos.
