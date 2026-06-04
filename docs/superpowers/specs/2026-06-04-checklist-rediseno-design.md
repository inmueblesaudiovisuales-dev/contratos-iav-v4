# Rediseño de `checklist.html` — Bitácora de producción (video-first, Dossier)

**Fecha:** 2026-06-04
**Rama:** `rediseno-checklist` (clon `/Users/brunogutierrez/contratos-iav-checklist`)
**Estado:** diseño aprobado en brainstorming; pendiente plan de implementación.

---

## 1. Contexto y meta

`checklist.html` es la bitácora de producción de cada propiedad, usada **en campo desde el celular** por un equipo de 3 que trabaja en paralelo (foto / 360 / video+drone). El valor real no es marcar palomitas: es **ahorrar tiempo de edición** capturando, sin estorbar la grabación, dos datos de oro por clip: **(1) a qué espacio pertenece** y **(2) si la toma sirve o no**.

North star: *"casi invisible en campo, indispensable en edición"*. Prioridad absoluta: **eficiencia**. Cada acción frecuente = 1 toque, <3 segundos, contestando mientras se camina por los cuartos. El celular va montado en un estabilizador; se opera con un pulgar; debe ser **difícil equivocarse**.

El motor de lógica ya está implementado y funciona (consecutivos por cámara, marcar buena, descartes, plantillas, etc.). **Este trabajo es un rediseño visual + UX agresivo**, no una reconstrucción. Bruno autorizó rediseño completo sin conservadurismo.

## 2. Restricciones no negociables (aislamiento)

- Trabajar SOLO en el clon `/Users/brunogutierrez/contratos-iav-checklist`, rama `rediseno-checklist`.
- **Nunca** push/merge a `main`. **Nunca** tocar el otro clon (`contratos-iav-v4`), ni `admin.html`, ni `portal.html`, ni `worker/` (salvo lo de checklist, ver §3), ni adapter, ni migraciones D1, ni `wrangler deploy`.
- Push de la rama a origin = permitido (no dispara deploy).
- Sistema de diseño **Dossier** obligatorio (ver §4). Incrustar tokens en el `<style>` de `checklist.html` (design/ no se sirve público).

## 3. Arquitectura y frontera de seguridad

`checklist.html` tiene dos capas:
- **Capa de render/UI** (el `<script>` inline): funciones `render*()`, manejo de modales/toasts, estado de UI. **Esto se reescribe por completo.**
- **Motor** (`frontend/checklist-logic.js`, `window.IAVChecklistLogic`): consecutivos, registro de archivos, plantillas, normalización de estado. La UI solo llama a `logic.*` y luego `render()` + `scheduleSave()`.

**Backend** (`worker/src/routes/checklist.js`): guarda el estado completo como blob JSON (`cuartos_json`) y lo reconstruye (`version===2`). **No se toca.** El blob tolera cualquier estructura nueva.

**Qué se toca:**
- `frontend/checklist.html` — reescritura de la capa visual/UI (alcance principal).
- `frontend/checklist-logic.js` — **probablemente se toca, con cuidado** (PENDIENTE DE AUTORIZACIÓN DE BRUNO), para soportar: dimensión "piso", y (fase 2) lane Asesores con par de cámaras. Si se autoriza: cambios aditivos y compatibles hacia atrás (estado viejo debe seguir cargando), preservando todo lo que ya funciona. Si no se autoriza, se buscará meter "piso" como dato libre en el blob desde la capa de render sin tocar el motor (más frágil; por eso se prefiere tocar el logic).
- `worker/` — **NO** se toca.

## 4. Sistema visual (Dossier)

Reemplazar Montserrat y TODAS las mayúsculas. Tokens en `:root` (tomados de `design/design-system.css`):

- **Tipografía:** `Inter` (UI), `Fraunces` (nombre de cuarto/punto, números clave — sin abusar), `Spline Sans Mono` (consecutivos, folios, fechas tabulares).
- **Paleta:** `--paper-0:#F7F4EC` (fondo), `--paper-1:#FFFDF8` (tarjetas), `--paper-2:#EFEADF`, `--line:#E2DBCB`, `--onyx:#1C1C1E`, `--gold:#B08D2E` (texto/íconos dorados), `--gold-leaf:#C9A84C` (superficies/botón primario), semánticos `--ok #2F7D55` / `--warn #B0560E` / `--danger #B23A2B`.
- **Reglas:** sentence-case en todo (cero `text-transform:uppercase`); cero emojis; **íconos Tabler finos** monocromáticos (reemplazar `...` y `X` literales); hairline dorada 1px bajo el topbar; sombras sutiles, preferir hairlines; espaciado base 4px; radios 8/10/14; objetivos de toque **≥56px en el loop de captura**; modo claro únicamente.
- Reemplazar `prompt()`/`confirm()` nativos por **bottom-sheets / inputs con estilo Dossier**.

## 5. Estructura de la app — lanes

Al abrir: pantalla **"¿Qué vas a hacer?"** con 5 lanes: **Foto · 360 · Video · Drone · Asesores**. Eliges uno; la pantalla se dedica 100% a ese lane. Cambiar de lane = **chip chico** en el topbar (no estorba; sirve para cuando la persona de 360 cubre video).

- **Foto / 360** = modelo de **cobertura** (rejilla simple).
- **Video / Drone** = modelo de **ledger** (app de cámara, par no aplica; consecutivo por cámara).
- **Asesores** = modelo de **puntos + par de cámaras** (FASE 2, ver §12).

**Estado por-dispositivo (no se sincroniza):** el lane activo, la cámara activa y el cuarto/punto en foco son **locales de cada cel** (como ya lo es el nombre, en `localStorage`). Solo se sincroniza la **data de producción** (cuartos, pisos, estados, archivos, bitácora, cámaras, secuencias, servicios activos). Implementación: al hacer *merge* en `poll()`, conservar el lane/cámara/cuarto local del dispositivo en vez de adoptar los del estado remoto. Esto arregla un bug latente: hoy `modoActual` y `activeCameraByMode` viven en el blob sincronizado y pueden "saltar" la pantalla de un usuario cuando otro guarda — lo que rompería el trabajo en paralelo. Es un cambio **solo en la capa de render** (no en el motor).

## 6. Modelo de datos — dimensión "Piso"

Nueva dimensión de agrupación **única** (reemplaza zona interior/exterior/amenidades como agrupador principal):

- **Pisos** editables por propiedad. Sugerencias: Sótano, Piso 1, Piso 2, Roof, Exterior, Amenidades. **Amenidades = un solo piso** aunque estén físicamente regadas. Exterior es un piso cuyos cuartos son descriptivos (Fachada, Patio, Jardín, Cochera…).
- Cada **cuarto** pertenece a un piso. El **nombre del cuarto es la descripción** (no hay campos extra → rápido).
- **Sub-cuartos**: un solo nivel (Recámara → Baño, Clóset). Heredan el piso del padre.
- El piso alimenta los metadatos de Premiere (futuro export).

Cambio en el motor: cada espacio gana un campo `piso` (string). Compatibilidad (determinista): estado viejo sin `piso` deriva su piso de la `zona` existente (`amenidades`→"Amenidades", `exterior`→"Exterior", `interior`→"Piso 1"); si no hay zona, "Sin piso". Los agrupadores de render (`renderSpaceGroups`, vistas de Cierre/Edición) pasan a agrupar por piso.

## 7. Modo Cuartos (setup aditivo, re-entrable)

Botón siempre accesible para entrar/salir. **Aditivo, no destructivo** (resuelve el dolor de "ir quitando" de las plantillas):

- Defines los **pisos** de la propiedad (tocar sugerencias + agregar/quitar).
- Agregas cuartos por **chips por categoría** (tap para agregar) **+ lista rápida** (teclear; **sangría = sub-cuarto**). El cuarto agregado cae en el piso "en foco" del setup.
- **Sugerencias** según lo que ya hay.
- Re-entrable en cualquier momento; agrega encima de lo existente (depto → luego amenidades → luego la recámara que faltó).
- Sub-cuarto también se agrega **desde el cuarto activo** en captura (un "+ sub-cuarto", sin buscar).

## 8. Captura — Video / Drone ("app de cámara")

Un cuarto en foco, pantalla completa, loop de 1 toque:

- **Arriba:** nombre del cuarto (Fraunces, grande) + piso (+ padre si es sub-cuarto), y **cámara activa + el archivo que se va a crear** en mono (ej. `siguiente: PIB2819`). Este token grande es el **seguro anti-error**: se ve de reojo y confirma que cuadra con la cámara real.
- **En medio:** las tomas ya hechas *en este cuarto* (sus tokens) → confianza de guardado. Cada toma recién hecha permite **marcar buena de un toque** (si se sabe al instante).
- **Abajo, zona de pulgar, botones grandes (≥56px):** **"Toma"** (registra archivo, 1 toque) y **"Fallida"** (registra descarte, 1 toque). Colores/posición bien distintos. Deshacer disponible (toast con undo, ya existe en el motor).
- **Cambiar cuarto:** botón claro → selector **agrupado por piso** (sub-cuartos con sangría; cuartos ya grabados marcados "✓ grabado", siempre seleccionables → se puede **regresar a cualquier cuarto** y seguir registrando). Al **salir** de un cuarto que tuvo tomas → mini-sheet **"¿Cuál fue la buena en [cuarto]?"** con los tokens de esa escena (tocar uno o dos, o "luego"). Aquí cae el dato de oro, en el momento natural en que ya se sabe.

Drone usa el mismo loop; las "unidades" son la lista de tomas aéreas (Fachada aérea, Vista general…).

**Decisión de botones:** 2 botones (Toma / Fallida), buena marcada al salir y/o de un toque en la toma recién hecha. Sin tercer botón "Buena" fijo (evita confundirlo con "Toma").

## 9. Dos cámaras (Sony + Osmo) en Video

- **Normal:** solo Sony visible; "Sony · siguiente PIB2819". Osmo escondida.
- **Emergencia (Sony sin pila → Osmo):** un toque en el chip de cámara → Osmo; la primera vez pide **una sola vez** el último archivo de la Osmo para enganchar su consecutivo (`DJI_..._0245` → `0246`). El token grande cambia de `PIB28xx` a `DJI…02xx` → imposible no notar en qué cámara estás. Tomas de ambas cámaras conviven en el mismo cuarto (consecutivo independiente por cámara, ya soportado por el motor).
- **Videógrafo 2** (Danna con la Osmo grabando en paralelo): rol ligero **diferido** (no fase 1). Se diseña la arquitectura para no bloquearlo, pero no se construye ahora.

## 10. Captura — Foto / 360 (cobertura)

Rejilla limpia de cuartos (agrupada por piso). Tocar un cuarto cicla **pendiente → listo → no aplica**. Sin cámara, sin consecutivos, sin par. Mismo sistema visual, mecánica mínima.

## 11. Cierre — "¿ya nos vamos?"

Restyle Dossier del semáforo actual:
- **Rojo:** falta antes de irnos (espacios/amenidades pendientes prioritarios, servicios incompletos).
- **Amarillo:** revisar (excepciones, no aplica, descartes, servicios apagados).
- **Verde:** listo.
- **Reconciliar archivos:** **último archivo de cada cámara** (para cotejar con la cámara física) + escenas de video/drone **sin una toma buena marcada** + archivos sin identificar.

## 12. Edición

Restyle de la vista agrupada por **servicio → piso → cuarto**: buenas, alternativas, descartes con motivo, notas, cámara y orden real. Produce una bitácora limpia y consistente para el futuro export a metadatos de Premiere (Scene, Shot, Camera Roll, Good, Comment, Description). `checklist.html` NO procesa esos metadatos; solo deja la bitácora lista.

## 13. FASE 2 — Lane Asesores (arquitectado, no construido en fase 1)

Servicio frecuente: grabar asesores. Modelo distinto al de cuartos. Se diseña la arquitectura para que entre sin reescribir nada; se implementa **después** de aprobar Propiedad.

- **Unidades = puntos/segmentos** (no cuartos): set típico (Introducción, Despedida) + puntos custom sobre la marcha + **Voz en off**.
- **Par de cámaras:** un punto normal graba **Sony (video) + Osmo+DJI Mic (audio)** al mismo tiempo. **Un toque = una "toma" que crea el par `Sony ↔ Osmo` ligado** (auto-incrementa ambos consecutivos). Resuelve el dolor central: "saber cuál toma es cuál" queda resuelto al grabar. Una persona loguea el par aunque dos personas sostengan las cámaras (Bruno video / Fer audio).
- **Voz en off** = punto **solo-audio (Osmo)**; misma mecánica (registrar, fallida al instante, marcar buena, **comentar**: se trabó / estornudó / se cortó).
- Todos los puntos: buena/mala + comentarios.
- Normalmente un solo asesor (agrupación por asesor = diferida).
- Cambio en el motor: nuevo `mode: 'asesor'` con par de cámaras y `pairId` ligando archivos.

## 14. Persistencia y trabajo en paralelo

- `saveNow()` sigue mandando el estado de producción completo; backend igual.
- `poll()` cada 5s; al hacer merge, **preservar el estado local por-dispositivo** (lane, cámara, cuarto/punto en foco) — ver §5.
- Save optimista con reintentos (ya existe). El buscador NO debe re-renderizar y perder el cursor (bug actual a corregir).

## 15. Fuera de alcance / diferido

- Videógrafo 2 (rol con cuartos asignados) — diferido.
- Lane Asesores — fase 2.
- Múltiples asesores por sesión — diferido.
- Anidación de sub-cuartos más allá de un nivel — no.
- Export a metadatos de Premiere — otro programa, fuera de checklist.html.
- Cualquier cambio a `worker/`, backend, migraciones, deploy.

## 16. Registro de decisiones (brainstorming)

1. Modelo de captura video = **app de cámara, un cuarto en foco** (no lista de tarjetas).
2. Juicio de calidad = **fallida al instante** (se sabe), **buena al salir** del cuarto.
3. Servicio = **se elige una vez** (5 lanes), pantalla dedicada, chip chico para cambiar.
4. Setup de cuartos = **aditivo + re-entrable**, chips + lista con sangría.
5. Cuartos **nunca se cierran**: se puede volver a cualquiera.
6. **Piso** = dimensión de agrupación única, editable por propiedad; Amenidades = un piso; Exterior = un piso con cuartos descriptivos. Sub-cuarto un nivel, hereda piso.
7. Dos cámaras = Sony default / Osmo emergencia; token grande como seguro anti-error.
8. Estado de vista (lane/cámara/cuarto) = **por-dispositivo**, no sincronizado.
9. Asesores = **5º lane**, fase 2, par de cámaras ligado.
10. Fases: **Propiedad primero**, Asesores después; arquitectura lista para ambos.
11. Botones de captura: **2 (Toma/Fallida)**, sin tercer botón "Buena".
12. Tocar `checklist-logic.js` (aditivo, compatible hacia atrás) = **propuesto, pendiente de confirmación de Bruno**; backend intocable.
