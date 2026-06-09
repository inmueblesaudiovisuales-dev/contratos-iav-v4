# Spec — Sub-controles de movimiento: Sentido (Push/Pull) y Pared (Reveal)

**Fecha:** 2026-06-08. **Repo principal:** `contratos-iav-v4` (`frontend/checklist.html` + `frontend/checklist-logic.js`).
**Repo diferido:** `iav-metadata-app` (solo la última fase, cuando Bruno lo autorice).

## Contexto y meta
El tagger de la bitácora (plano + movimiento) vive en dos lugares: la capa **Sugeridas** (antes de grabar,
`renderCapSugStrip`) y la línea **Etiqueta** de "recién grabada" (después de grabar, `renderCapLatest`, F27).
Hoy el set curado de movimientos son 7: Push in, Pull out, Paneo, Tilt, Travel, Órbita, Reveal.

Bruno necesita, para **empatar transiciones en edición**, anotar dos cosas que hoy no se pueden:
- En un **Reveal**: de qué **lado está la pared** por la que se abre el cuarto. Es un dato espacial **no reversible**
  (reversar el clip no mueve la pared) y por eso vale anotarlo.
- En un movimiento de profundidad: si fue **push in** o **pull out** — pero estos son el mismo clip reversado, así
  que no merecen dos botones; basta un sub-dato opcional.

Decisión de diseño (validada con mockups `docs/superpowers/auditoria-diseno/mockup-pared-02.png`): un **patrón único
de sub-control contextual** — eliges un movimiento y, si tiene variante, aparece su sub-control debajo de la rejilla.

## Modelo

### Movimientos (rejilla limpia de 6)
Fusionar **Push in + Pull out → "Push/Pull"** (un solo botón de profundidad, reversible). La rejilla queda 3×2 sin
huecos: **Push/Pull, Paneo, Tilt, Travel, Órbita, Reveal**.

### Sub-controles contextuales (opcionales — no rompen el "un toque")
Al seleccionar un movimiento con variante, aparece un sub-control debajo de la rejilla, **seleccionado en tinte
neutro** (consistente con R1, sin azul que ya significa "drone"):
- **Push/Pull → Sentido:** `Push in` · `Pull out`.
- **Reveal → Pared:** `Izquierda` · `Derecha` (ícono literal: barra de pared a un lado del cuadro).
- **Paneo, Tilt, Travel, Órbita → ninguno** por ahora. El patrón es **extensible**: si más adelante se quiere
  Pared en un Travel usado de transición, o dirección en Paneo, se habilita sin rediseño.

Ambos sub-controles son **opcionales**: si no se eligen, la toma queda con el movimiento a secas. Tocar de nuevo la
opción activa la limpia (mismo patrón que `seleccionarPlano`/`seleccionarMovimiento`).

### Dónde vive
En el **mismo tagger**, idéntico antes de grabar (`renderCapSugStrip`, fija los `pending*` de la próxima toma) y
después (`renderCapLatest`/Etiqueta F27, edita la toma ya grabada). Misma UI, mismos componentes.

## Datos (motor `checklist-logic.js`)
- `CURATED_MOVEMENTS` pasa a **6**: `['push_pull','pan','tilt','travel','orbit','reveal']`. Se agrega un id nuevo
  `push_pull` a `MOVEMENTS` (label "Push/Pull"). **No se borran** `push_in`/`pull_out` del mapa `MOVEMENTS`
  (compatibilidad de estado viejo y de sugerencias históricas).
- Dos campos **nuevos y opcionales** por archivo en `mediaFiles`:
  - `sentido`: `'in' | 'out' | null` — solo significativo cuando `movement === 'push_pull'`.
  - `pared`: `'izq' | 'der' | null` — solo significativo cuando `movement === 'reveal'`.
- **Migración (`normalizeChecklistData`):** una toma vieja con `movement === 'push_in'` → `{ movement:'push_pull',
  sentido:'in' }`; `'pull_out'` → `{ movement:'push_pull', sentido:'out' }`. No se pierde nada. El resto del estado
  viejo carga igual.
- Helpers nuevos: getters/labels para sentido y pared; el set de opciones de cada sub-control.

## Export (`buildExport`) — `version:1` intacto, aditivo
- Se agregan campos discretos por archivo (junto a los actuales `movimiento`/`movimientoLabel`): `sentido` y
  `pared`, con sus labels (`sentidoLabel`, `paredLabel`). La app de Mac actual los **ignora** (ya está diseñada para campos
  aditivos), así que esto **no la rompe**.
- Además se **componen en el texto que ya llega a Premiere hoy** (`describirArchivo` → `premiere.Description`), con
  **tokens consistentes y buscables**:
  - Push/Pull con sentido → `… / Push/Pull (in)` (o `(out)`).
  - Reveal con pared → `… / Reveal · pared izq` (o `· pared der`).
  Así el valor llega a Premiere **de inmediato** (buscable con Find), antes de tocar la app de metadatos.

## Mapeo a Premiere / XMP — FASE FINAL DIFERIDA (`iav-metadata-app`)
**No se implementa hasta que Bruno lo autorice.** Documentado aquí para cuando se haga:
- `toXmpFields` (`src/engine/xmpFields.ts`) mapea a campos XMP-dm que Premiere muestra como **columnas**:
  - movimiento → `XMP-xmpDM:CameraMove`
  - plano → `XMP-xmpDM:ShotSize` (Abierto/Detalle = tamaño de cuadro)
- Como XMP-dm **no tiene** campo "lado de pared", pared/sentido se **anexan al `CameraMove`** con el mismo token
  consistente (`Reveal · pared izq`, `Push/Pull · in`) → una columna real que se ordena/filtra/busca en Premiere.
- Requiere extender `types.ts` y los tests `xmpFields.test.ts` / `xmpWriter.int.test.ts`. Gate propio del repo.

## Vocabulario (tokens estables — importan para la búsqueda en Premiere)
- Sentido: `in` / `out`. Pared: `pared izq` / `pared der`. Movimiento Push/Pull: label "Push/Pull". Siempre escritos
  igual; nunca variar mayúsculas/acentos en el token de búsqueda.

## Invariantes (gate)
- `version:1` intacto. `normalizeChecklistData` carga estado viejo (incl. push_in/pull_out migrados). Backend
  (`worker/`) intocable. Aditivo y compatible. Sin emojis. Áreas táctiles ≥44px. Español formal con acentos.

## No-objetivos (YAGNI)
- No se agrega dirección/variante a Paneo, Tilt, Travel, Órbita (extensible, pero fuera de alcance ahora).
- No se toca la app de metadatos en este ciclo (fase final, aparte).
- No se reintroducen movimientos descartados (Estático, Seguimiento, Gimbal).

## Verificación
- Unit tests del motor (fusión, migración push_in/pull_out, export con sentido/pared, `version:1`).
- Playwright: rejilla de 6 sin huecos; Push/Pull muestra Sentido; Reveal muestra Pared; ambos opcionales; el
  Description del export lleva los tokens correctos. Antes y después de grabar.
