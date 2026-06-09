# Spec — Sinónimos en el buscador + ampliación de la biblioteca de cuartos

**Fecha:** 2026-06-08. **Repo:** `contratos-iav-v4` (`frontend/checklist-logic.js` + `frontend/checklist.html`).
Independiente de los cambios de movimiento/pared/sentido.

## Contexto
La biblioteca de cuartos vive en `SPACE_LIBRARY_BY_FLOOR` (chips sugeridos por tipo+piso). El buscador
`searchSpaces(q)` empareja **solo contra el nombre** del cuarto (`normNombre(nombre).includes(q)`). Las categorías
(`ROOM_CATEGORIES`) ya tienen `keywords` (sinónimos) que hoy usa `detectCategoria` para inferir la categoría de un
nombre escrito, **pero el buscador no los usa**. Por eso al escribir "habitación" no aparece "Recámara" y el usuario
crea un cuarto nuevo duplicado.

## Meta
1. Que el buscador reconozca **sinónimos por categoría** (enfoque A, aprobado): escribir "habitación", "terraza",
   "balcón", etc. surfacea el/los cuarto(s) canónico(s) de esa categoría.
2. **Ampliar la biblioteca** con cuartos que faltan (MX residencial) y sub-cuartos rápidos.

## Parte 1 — Sinónimos en `searchSpaces`
- `searchSpaces(q)` empareja una entrada de la biblioteca si: `normNombre(entry.nombre).includes(q)` **O** alguna
  `keyword` de su `categoria` (de `ROOM_CATEGORIES`) empareja `q` (igualdad o `includes` normalizado). Se sigue
  anexando la opción `crear nuevo` al final (sin cambios). Dedup por nombre normalizado se mantiene.
- **Curaduría de `keywords`** (agregar a las listas existentes; no borrar las que ya están):
  - `recamara`: + `cuarto`
  - `terraza`: + `azotea`, `roofgarden`
  - `entrada`: + `vestibulo`, `hall`, `lobby`
  - `sala`: + `estancia`, `salon`
  - `estudio`: + `biblioteca`, `despacho` (ya está)
  - `family`: + `sala de tv`, `tele`, `juegos`
  - `bodega`: + `servicio`, `cuarto de servicio` (servicio ya está)
  - `cocina`: (sin cambios)
- Nota: "cuarto" es genérico; se acepta como sinónimo de recámara porque en campo es el uso más común, y el buscador
  igual muestra todas las coincidencias + crear nuevo, así que no fuerza nada.

## Parte 2 — Cuartos nuevos
Distinguimos **sugeridos** (aparecen como chips por piso+tipo, en `SPACE_LIBRARY_BY_FLOOR`) de **solo buscables**
(no ensucian los chips; viven en una lista nueva `EXTRA_SPACES` que `SPACE_LIBRARY_INDEX` también indexa).

### Nuevos sugeridos (chips por piso/tipo)
- **Cuarto de servicio** — interior. casa/quinta Piso 1 (zona servicio). Categoría nueva `servicio`
  (keywords: `servicio, sirvienta, empleada, muchacha`), tomas tipo cuarto pequeño.
- **Baño de servicio** — interior, junto al anterior. Categoría `bano`.
- **Antecomedor** — interior. casa/depto/quinta Piso 1. Categoría `comedor`.
- **Sala de TV** — interior. casa Piso 2 (y depto Piso 1). Categoría `family`.
- **Vestidor** — interior. casa/depto Piso 2. Categoría `vestidor` (distinto de Clóset, que es el chico).

### Nuevos solo-buscables (`EXTRA_SPACES`, no como chips por defecto)
- **Cava** — interior. Categoría `bodega` (tomas de detalle). Buscable por `cava, vinos, cellar`.
- **Bar / Cantina** — interior. Categoría `sala`. Buscable por `bar, cantina`.
- **Cuarto de juegos / Ludoteca** — interior. Categoría `family`. Buscable por `juegos, ludoteca, jugar`.
- **Despacho** — NO es cuarto nuevo: queda cubierto por **Estudio** + el sinónimo `despacho` (ya en keywords).

`EXTRA_SPACES` es un array de `{nombre, zona, categoria}` que se concatena al construir `SPACE_LIBRARY_INDEX`
(searchable) pero NO entra en `suggestedSpacesFor` (chips). Así "cava" se encuentra al buscar, sin aparecer como
chip sugerido en cada casa.

## Parte 3 — Sub-cuartos rápidos
El "+ sub-cuarto" hoy ofrece **Clóset / Baño** + "Otro…". Agregar dos botones rápidos:
- **Balcón / Terraza** (categoría `terraza`).
- **Vestidor** (categoría `vestidor`).
Quedan: Clóset, Baño, Balcón/Terraza, Vestidor, + "Otro…". (UI en `renderSubPick`/`addSubRapido` de `checklist.html`.)

## Datos / archivos
- `frontend/checklist-logic.js`: curar `ROOM_CATEGORIES.keywords`; agregar categoría `servicio`; agregar los chips
  nuevos en `SPACE_LIBRARY_BY_FLOOR`; crear `EXTRA_SPACES` y concatenarlo en `SPACE_LIBRARY_INDEX`; extender
  `searchSpaces` para emparejar por keywords de categoría. Tests nuevos.
- `frontend/checklist.html`: agregar Balcón/Terraza y Vestidor a los botones rápidos de sub-cuarto.

## Invariantes (gate)
Export `version:1` intacto. `normalizeChecklistData` carga estado viejo. Backend intocable. Aditivo y compatible.
Sin emojis. Español formal con acentos en labels; ids/keywords sin acentos. Áreas táctiles ≥44px.

## No-objetivos (YAGNI)
- No reescribir el modelo de biblioteca; solo ampliar y conectar sinónimos.
- No alias por-cuarto (se eligió por-categoría).
- No tocar las tomas sugeridas más allá de mapear los cuartos nuevos a una categoría existente/`servicio`.

## Verificación
- Unit tests: `searchSpaces('habitacion')` incluye Recámara(s); `searchSpaces('balcon')` incluye Balcón/Terraza;
  `searchSpaces('cava')` incluye Cava (vía EXTRA_SPACES); los cuartos nuevos sugeridos aparecen en
  `suggestedSpacesFor` del piso/tipo correcto; EXTRA_SPACES NO aparece en `suggestedSpacesFor`; `version:1` intacto.
- Playwright: buscar "habitación"→Recámara, "terraza"→Balcón; sub-cuarto muestra Balcón/Terraza y Vestidor.
