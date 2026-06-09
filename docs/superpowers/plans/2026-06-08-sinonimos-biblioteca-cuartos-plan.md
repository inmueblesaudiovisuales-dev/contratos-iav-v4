# Plan — Sinónimos en el buscador + ampliación de biblioteca (F32–F33)

> **Para ejecutar con `build-from-plan`.** Rama `checklist-cambios-2026-06-07`. Una micro-fase = un commit con gate.
> Nunca `main`, nunca deploy a producción (sí preview aislado). Continúa la numeración (F32+).
> **Spec:** `docs/superpowers/specs/2026-06-08-sinonimos-biblioteca-cuartos-design.md` (fuente de verdad).

**Goal:** Que el buscador reconozca sinónimos por categoría (escribir "habitación" surfacea Recámara) y ampliar la
biblioteca con los cuartos faltantes (sugeridos + solo-buscables) y dos sub-cuartos rápidos.

## Invariantes (gate, todas las fases)
Export `version: 1` intacto. `normalizeChecklistData` carga estado viejo. Backend (`worker/`) intocable. Aditivo y
compatible. Sin emojis. Español formal con acentos en labels visibles; ids/keywords sin acentos. Áreas táctiles ≥44px.

---

## F32 — Motor: sinónimos en searchSpaces + cuartos nuevos + categoría servicio
**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`. **Invariantes:** `version: 1`, `normalizeChecklistData`.

1. **Curar `ROOM_CATEGORIES.keywords`** (agregar, NO borrar las existentes):
   - `recamara`: + `cuarto`
   - `terraza`: + `azotea`, `roofgarden`
   - `entrada`: + `vestibulo`, `hall`, `lobby`
   - `sala`: + `estancia`, `salon`
   - `estudio`: + `biblioteca`
   - `family`: + `sala de tv`, `tele`, `juegos`
   - `bodega`: + `cuarto de servicio` (servicio ya está)
   Keywords sin acentos (el matching normaliza). Mantén el orden y la forma `Object.freeze`.
2. **Categoría nueva `servicio`** en `ROOM_CATEGORIES`: `{ id:'servicio', label:'Cuarto de servicio', keywords:['servicio','sirvienta','empleada','muchacha'] }`. Si las tomas sugeridas se resuelven por `GUIDE_LIBRARY`/categoría, mapea `servicio` a un set razonable de cuarto pequeño (reusa el de `recamara`/`bodega` si no hay uno propio; NO inventes tomas nuevas si el patrón existente alcanza). Revisa cómo se resuelven las tomas por categoría antes de tocar.
3. **Cuartos nuevos SUGERIDOS** (chips) en `SPACE_LIBRARY_BY_FLOOR` con `_chip(nombre, zona, categoria, clave)`:
   - casa `'Piso 1'`: `_chip('Antecomedor','interior','comedor',false)`, `_chip('Cuarto de servicio','interior','servicio',false)`, `_chip('Baño de servicio','interior','bano',false)`.
   - casa `'Piso 2'`: `_chip('Sala de TV','interior','family',false)`, `_chip('Vestidor','interior','vestidor',false)`.
   - departamento `'Piso 1'`: `_chip('Antecomedor','interior','comedor',false)`, `_chip('Vestidor','interior','vestidor',false)`.
   - quinta `'Piso 1'`: `_chip('Antecomedor','interior','comedor',false)`, `_chip('Cuarto de servicio','interior','servicio',false)`, `_chip('Baño de servicio','interior','bano',false)`.
   (No dupliques si ya existe el mismo nombre en ese piso.)
4. **`EXTRA_SPACES` (solo-buscables):** nueva constante array de `{nombre, zona, categoria}` que NO entra a
   `suggestedSpacesFor` pero SÍ a la búsqueda:
   - `{nombre:'Cava', zona:'interior', categoria:'bodega'}`
   - `{nombre:'Bar / Cantina', zona:'interior', categoria:'sala'}`
   - `{nombre:'Cuarto de juegos', zona:'interior', categoria:'family'}`
   Concaténalo al construir `SPACE_LIBRARY_INDEX` (cada entry necesita `id` = nombre normalizado, `tipo`/`piso` pueden
   ser `null`/`'extra'`, `clave:false`). Dedup por nombre normalizado se mantiene. `suggestedSpacesFor` NO los incluye.
5. **`searchSpaces`:** además de `normNombre(entry.nombre).includes(q)`, empareja si alguna `keyword` de
   `getRoomCategories().find(c=>c.id===entry.categoria)` coincide con `q` (normalizada: `includes` en ambos sentidos
   razonable — p. ej. la keyword contiene q, para que "habit"→"habitacion" funcione). Mantén la opción `crear nuevo`
   al final y el dedup. No cambies el formato de retorno (la UI F20 lo consume).

**Tests nuevos:** `searchSpaces('habitacion')` incluye al menos una Recámara; `searchSpaces('balcon')` incluye
Balcón/Terraza; `searchSpaces('cava')` incluye Cava; `suggestedSpacesFor` de casa Piso 1 incluye Antecomedor y Cuarto
de servicio; `suggestedSpacesFor` NO incluye Cava (solo-buscable); categoría `servicio` existe; `version:1` intacto;
estado viejo carga. No rompas los 173 tests previos; deja TODO verde.

**Commit:** `F32 — motor: sinonimos por categoria en searchSpaces + cuartos nuevos (sugeridos + EXTRA_SPACES) + categoria servicio`.

## F33 — UI: sub-cuartos rápidos Balcón/Terraza y Vestidor
**Archivos:** `frontend/checklist.html`. **Invariantes:** `version: 1`.

- En los botones rápidos de "+ sub-cuarto" (busca `renderSubPick`/`addSubRapido`, hoy ofrecen **Clóset / Baño** +
  "Otro…") agrega dos botones: **Balcón / Terraza** y **Vestidor**. Usa el mismo patrón/estilo R1 (chips ≥44px) y el
  mismo camino de creación (heredan piso/zona del padre; `detectCategoria` ya mapea por nombre, pero pasa la categoría
  correcta si el patrón lo permite: terraza→'terraza', vestidor→'vestidor').
- Orden sugerido: Clóset · Baño · Balcón/Terraza · Vestidor · Otro…
- Sin emojis (íconos Tabler). `node --check` del inline debe pasar. Tests del motor siguen verde (no lo tocas).
- Verificación visual (Playwright, 390px): "+ sub-cuarto" muestra los 4 botones rápidos + Otro; agregar Balcón/Terraza
  y Vestidor funciona y hereda el piso.

**Commit:** `F33 — UI: sub-cuartos rapidos Balcon/Terraza y Vestidor`.

## Verificación final
- `node --test frontend/checklist-logic.test.js` verde. Gate por fase. Playwright en F32 (buscador) y F33 (sub-cuartos).
  Redeploy del preview al cerrar y pasar la URL a Bruno.
