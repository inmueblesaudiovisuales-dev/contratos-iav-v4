# Rediseño de `checklist.html` — Bitácora de producción (video-first, Dossier)

**Fecha:** 2026-06-04
**Rama:** `rediseno-checklist` (clon `/Users/brunogutierrez/contratos-iav-checklist`)
**Estado:** diseño aprobado en brainstorming; pendiente plan de implementación.

---

## 1. Contexto y meta

`checklist.html` es la bitácora de producción de cada propiedad, usada **en campo desde el celular** por un equipo de 3 que trabaja en paralelo (foto / 360 / video+drone). El valor real no es marcar palomitas: es **ahorrar tiempo de edición** capturando, sin estorbar la grabación, dos datos de oro por clip: **(1) a qué espacio pertenece** y **(2) si la toma sirve o no**.

North star: *"casi invisible en campo, indispensable en edición"*. Prioridad absoluta: **eficiencia**. Cada acción frecuente = 1 toque, <3 segundos, contestando mientras se camina por los cuartos. El celular va montado en un estabilizador; se opera con un pulgar; debe ser **difícil equivocarse**.

El motor de lógica ya está implementado y funciona. **Este trabajo es un rediseño visual + UX agresivo**, no una reconstrucción. Rediseño completo sin conservadurismo. El diseño actual es malo (Montserrat pesado, mayúsculas, negros genéricos, difícil de entender); la meta es que quede **impecable y obvio**.

## 2. Restricciones no negociables (aislamiento)

- Trabajar SOLO en el clon `/Users/brunogutierrez/contratos-iav-checklist`, rama `rediseno-checklist`.
- **Nunca** push/merge a `main`. **Nunca** tocar el otro clon (`contratos-iav-v4`), ni `admin.html`, ni `portal.html`, ni `worker/`, ni adapter, ni migraciones D1, ni `wrangler deploy`.
- Push de la rama a origin = permitido (no dispara deploy).
- Sistema de diseño **Dossier** obligatorio (§4). Incrustar tokens en el `<style>` de `checklist.html` (design/ no se sirve público).

## 3. Arquitectura y frontera de seguridad

`checklist.html` tiene dos capas:
- **Capa de render/UI** (el `<script>` inline): funciones `render*()`, modales/toasts, estado de UI. **Se reescribe por completo.**
- **Motor** (`frontend/checklist-logic.js`, `window.IAVChecklistLogic`): consecutivos, registro de archivos, plantillas, normalización. La UI solo llama a `logic.*` y luego `render()` + `scheduleSave()`.

**Backend** (`worker/src/routes/checklist.js`): guarda el estado completo como blob JSON (`cuartos_json`) y lo reconstruye (`version===2`). **No se toca.** El blob tolera cualquier estructura nueva.

**Qué se toca:**
- `frontend/checklist.html` — reescritura de la capa visual/UI (alcance principal).
- `frontend/checklist-logic.js` — **se toca, con cuidado (AUTORIZADO por Bruno 2026-06-04)**, para: dimensión "piso", set de sugerencias por tipo de propiedad (incl. quinta), y (fase 2) lane Asesores con par de cámaras. Cambios **aditivos y compatibles hacia atrás** (estado viejo debe seguir cargando), preservando todo lo que ya funciona.
- `worker/` — **NO** se toca.

## 4. Sistema visual (Dossier) + criterio de claridad

Reemplazar Montserrat y TODAS las mayúsculas. Tokens en `:root` (de `design/design-system.css`):

- **Tipografía:** `Inter` (UI), `Fraunces` (nombre de cuarto/punto, números clave — sin abusar), `Spline Sans Mono` (consecutivos, folios, fechas).
- **Paleta:** `--paper-0:#F7F4EC` (fondo), `--paper-1:#FFFDF8` (tarjetas), `--paper-2:#EFEADF`, `--line:#E2DBCB`, `--onyx:#1C1C1E`, `--gold:#B08D2E` (texto/íconos dorados), `--gold-leaf:#C9A84C` (superficies/botón primario), semánticos `--ok #2F7D55` / `--warn #B0560E` / `--danger #B23A2B`.
- **Reglas:** sentence-case en todo (cero `uppercase`); cero emojis; **íconos Tabler finos** (reemplazar `...` y `X` literales); hairline dorada 1px bajo el topbar; sombras sutiles, preferir hairlines; espaciado base 4px; radios 8/10/14; objetivos de toque **≥56px en el loop**; modo claro.
- **Criterio de claridad (rector):** todo clarísimo y obvio a la primera; **nada de negros genéricos** (onyx con moderación, no como relleno por defecto); **color solo cuando ayuda a entender** (estado: pendiente/listo/no aplica, buena/fallida; agrupación por piso; cámara activa) dentro de la sobriedad Dossier — sin colores llamativos; **cero elementos innecesarios**; una decisión a la vez en pantalla.
- Reemplazar `prompt()`/`confirm()` nativos por **bottom-sheets / inputs con estilo Dossier**.

## 5. Estructura de la app — lanes

Al abrir: pantalla **"¿Qué vas a hacer?"** con 5 lanes: **Foto · 360 · Video · Drone · Asesores**. Eliges uno; la pantalla se dedica 100% a ese lane (se recuerda por celular). Cambiar de lane = **chip chico** en el topbar.

- **Foto / 360** = **cobertura** (rejilla simple).
- **Video / Drone** = **ledger** (app de cámara, consecutivo por cámara).
- **Asesores** = **puntos + par de cámaras** (FASE 2, §13).

**Estado por-dispositivo (no se sincroniza):** lane activo, cámara activa y cuarto/punto en foco son **locales de cada cel** (`localStorage`, como ya lo es el nombre). Solo se sincroniza la **data de producción** (cuartos, pisos, estados, archivos, bitácora, cámaras, secuencias, servicios). En `poll()`, al hacer merge, conservar el estado local del dispositivo en vez de adoptar el remoto. Arregla un bug latente: hoy `modoActual` y `activeCameraByMode` viven en el blob sincronizado y pueden "saltar" la pantalla de un usuario cuando otro guarda. Cambio **solo en la capa de render**.

## 6. Modelo de datos — dimensión "Piso"

Dimensión de agrupación **única** (reemplaza zona interior/exterior/amenidades como agrupador principal):

- **Pisos** editables por propiedad. Sugerencias: Sótano, Piso 1, Piso 2, Roof, Exterior, Amenidades. **Amenidades = un solo piso** aunque estén físicamente regadas. Exterior = un piso cuyos cuartos son descriptivos (Fachada, Patio, Jardín, Cochera…).
- Cada **cuarto** pertenece a un piso; el **nombre del cuarto es la descripción** (sin campos extra → rápido).
- **Sub-cuartos**: un solo nivel (Recámara → Baño, Clóset), heredan el piso del padre, se agregan **desde el cuarto activo** (un "+ sub-cuarto", sin buscar).
- El piso alimenta los metadatos de Premiere (futuro).

Motor: cada espacio gana `piso` (string). Compatibilidad (determinista): estado viejo sin `piso` deriva de `zona` (`amenidades`→"Amenidades", `exterior`→"Exterior", `interior`→"Piso 1"); si no hay zona, "Sin piso". Render agrupa por piso (captura, Cierre, Edición). Drone NO usa pisos.

## 7. Modo Cuartos (setup aditivo, re-entrable)

Botón siempre accesible para entrar/salir. **Aditivo, no destructivo** (resuelve el dolor de "ir quitando").

- **Sin plantillas-bulto.** Arrancas de cero. Eliges **tipo de propiedad** (casa / departamento / terreno / quinta) → eso **sesga las sugerencias** de chips (muestra primero los cuartos típicos de ese tipo); NO carga todo de golpe.
- Agregas cuartos con **chips ultrarrápidos** (tap = agregar) **+ autocompletar al escribir lo mínimo** (sugiere cuartos conocidos). Teclear el mínimo posible.
- Defines los **pisos** de la propiedad (tocar sugerencias + agregar/quitar). El cuarto agregado cae en el piso "en foco".
- **Quinta** necesita su propio set de sugerencias (alberca, palapa, asadores, jardines, casa principal, cabañas, baños, cocina exterior…).
- Re-entrable; agrega encima de lo existente (depto → luego amenidades → luego la recámara que faltó).

Fuente de sugerencias: reusar las listas existentes de `TEMPLATE_DEFS` (casa/depto/terreno) **como sugerencias**, no como carga masiva; agregar set de quinta.

## 8. Captura — Video / Drone ("app de cámara")

Un cuarto en foco, pantalla completa, loop de 1 toque:

- **Arriba:** nombre del cuarto (Fraunces, grande) + piso (+ padre si es sub-cuarto), y **cámara activa + el archivo que se va a crear** en mono (ej. `siguiente: PIB2819`). Token grande = **seguro anti-error** (se ve de reojo, confirma que cuadra con la cámara real).
- **En medio:** las tomas ya hechas *en este cuarto* (tokens) → confianza de guardado. La toma recién hecha permite **marcar buena de un toque** y **agregar nota** (notas en TODAS las tomas de video, no solo asesores).
- **Abajo, zona de pulgar, 2 botones grandes (≥56px), ambos avanzan el consecutivo:**
  - **"Toma"** — grabé algo que cuenta (1 toque).
  - **"No sirve"** — por defecto marca *fallida* de un toque; un mini "¿qué fue?" **opcional/saltable** permite cambiar a **no relacionado** (perrito, persona) o **vacío/accidental**.
  - Regla rectora: **un toque por archivo, siempre** — así el conteo de la app nunca se desfasa de la tarjeta.
  - Deshacer disponible (toast con undo).
- **Cambiar cuarto:** botón claro → selector **agrupado por piso** (sub-cuartos con sangría; cuartos ya grabados marcados "✓ grabado", **siempre seleccionables** → se puede regresar a cualquiera y seguir registrando). Al **salir** de un cuarto con tomas → mini-sheet **"¿cuál fue la buena en [cuarto]?"** (tocar uno o dos, o "luego"). Dato de oro en el momento natural.

**Distinción clave de archivos:** *fallida/no relacionado/vacío* = la cámara **sí creó archivo** (consume consecutivo). *"registro equivocado"* (la cámara NO creó archivo) = acción separada que **recorre el consecutivo de vuelta**.

Drone usa el mismo loop; unidades = lista de tomas aéreas sugeridas (editable):
*Fachada aérea · Reveal de fachada · Vista cenital · Órbita · Empuje al acceso · Calle/acceso · Entorno y colonia · Cercanía a vialidades · Vista que vende · Patio/jardín aéreo · Alberca aérea · Roof/terraza · Amenidades · Terreno completo · Perímetro/colindancias · Fly-through · Descenso cenital · Golden hour · Toma de cierre.*

## 9. Dos cámaras (Sony + Osmo) en Video

- **Normal:** solo Sony visible ("Sony · siguiente PIB2819"). Osmo escondida.
- **Inicio de secuencia:** lo primero al entrar al lane = **teclear una vez el último archivo** de la cámara (`20260520_PIB2818`) para enganchar el consecutivo; después no se vuelve a escribir (queda guardado; al reabrir sigue donde quedó).
- **Emergencia (Sony sin pila → Osmo):** un toque en el chip de cámara → Osmo; primera vez pide una vez el último archivo Osmo (`DJI_..._0245`→`0246`). El token grande cambia de `PIB28xx` a `DJI…02xx` → imposible no notar la cámara. Tomas de ambas conviven en el mismo cuarto (consecutivo por cámara, ya soportado).
- **Videógrafo 2** (Danna con la Osmo en paralelo): rol ligero **diferido** (no fase 1). Arquitectura preparada, no construido.

## 10. Captura — Foto / 360 (cobertura)

Rejilla limpia de cuartos (agrupada por piso). Tocar cicla **pendiente → listo → no aplica**. Sin cámara, sin consecutivos. Mismo sistema visual, mecánica mínima.

## 11. Cierre — "¿ya nos vamos?" + reparar secuencia (cronológico)

- **Semáforo Dossier:** rojo (falta antes de irnos) / amarillo (revisar) / verde (listo).
- **Conciliación con la cámara física:** **último archivo de cada cámara** ("la app va en PIB2840; ¿tu cámara?"). Si hay hueco, lo señala y se meten los faltantes de jalón.
- **Línea de tiempo por cámara (cronológica):** lista de archivos en el orden real del consecutivo, con su cuarto al lado. Permite **insertar un archivo olvidado entre dos** (todo lo posterior se recorre solo), **quitar un registro** (la cámara no creó archivo → recorre de vuelta), **reasignar** a otro cuarto, marcar buena/fallida/nota. (Motor: `insertOmittedMediaFile`, `removeMediaFile`, `updateMediaFile` — ya existen.)
- Escenas de video/drone **sin una toma buena marcada**; archivos sin identificar.

## 12. Edición (vista por cuarto, editable)

Agrupado por **servicio → piso → cuarto**, con **filas editables** (reasignar, marcar buena, nota): buenas, alternativas, descartes con motivo, notas, cámara y orden real. Produce una bitácora limpia para el futuro export a metadatos de Premiere (Scene, Shot, Camera Roll, Good, Comment, Description). `checklist.html` NO procesa esos metadatos.

## 13. FASE 2 — Lane Asesores (arquitectado, no construido en fase 1)

Servicio frecuente. Modelo distinto al de cuartos. Se diseña la arquitectura para que entre sin reescribir; se implementa **después** de aprobar Propiedad.

- **Unidades = puntos/segmentos:** set típico (Introducción, Despedida) + puntos custom + **Voz en off**.
- **Par de cámaras:** punto normal graba **Sony (video) + Osmo+DJI Mic (audio)** al mismo tiempo. **Un toque = una "toma" que crea el par `Sony ↔ Osmo` ligado** (auto-incrementa ambos consecutivos). Resuelve "saber cuál toma es cuál" al grabar. Una persona loguea el par aunque dos sostengan las cámaras (Bruno video / Fer audio).
- **Voz en off** = punto **solo-audio (Osmo)**; misma mecánica (registrar, fallida al instante, buena, **comentar**).
- Todos los puntos: buena/mala + comentarios.
- Normalmente un solo asesor (agrupación por asesor = diferida).
- Motor: nuevo `mode: 'asesor'` con par de cámaras y `pairId` ligando archivos.

## 14. Persistencia, offline y trabajo en paralelo

Señal en campo **variable (a veces hay, a veces no)** → **red de seguridad local obligatoria:**
- Espejo del estado en `localStorage` en cada cambio → no se pierde la captura aunque se caiga internet o se recargue la página.
- Sincronización **reintenta hasta lograrlo** cuando vuelve la señal (no se rinde a los 4 intentos).
- `poll()` cada 5s; al merge, **preservar el estado local por-dispositivo** (§5).
- El buscador NO debe re-renderizar y perder el cursor (bug actual a corregir).
- **Riesgo conocido (a cuidar en el plan):** dos personas editando offline y reconectando → el último en sincronizar podría pisar cambios del otro (el guardado manda el blob completo). Caso raro; la prioridad (no perder TU captura) sí queda cubierta. Evaluar merge por-campo en vez de reemplazo de blob.

## 15. Fuera de alcance / diferido

- Videógrafo 2 (rol con cuartos asignados) — diferido.
- Lane Asesores — fase 2.
- Múltiples asesores por sesión — diferido.
- Anidación de sub-cuartos más allá de un nivel — no.
- Export a metadatos de Premiere — otro programa.
- Cualquier cambio a `worker/`, backend, migraciones, deploy.

## 16. Registro de decisiones (brainstorming)

1. Captura video = **app de cámara, un cuarto en foco** (no lista de tarjetas).
2. Juicio: **"No sirve" al instante** (default fallida, opción no-relacionado/vacío); **buena al salir** del cuarto y/o de un toque en la toma recién hecha.
3. Servicio = **5 lanes**, se elige una vez, pantalla dedicada, chip chico para cambiar.
4. Setup = **aditivo + re-entrable**, **sin plantillas-bulto**; chips + autocompletar, sesgados por **tipo de propiedad** (casa/depto/terreno/quinta).
5. Cuartos **nunca se cierran**: se puede volver a cualquiera.
6. **Piso** = agrupación única, editable; Amenidades = un piso; Exterior = un piso con cuartos descriptivos; sub-cuarto un nivel hereda piso; drone sin pisos.
7. Dos cámaras = Sony default / Osmo emergencia; token grande = seguro anti-error; iniciar secuencia tecleando el último archivo una vez.
8. Estado de vista (lane/cámara/cuarto) = **por-dispositivo**, no sincronizado.
9. **Un toque por archivo, siempre** (Toma / No sirve) → conteo nunca se desfasa.
10. Verificar/reparar = **cronológico por cámara (en Cierre)** + **por cuarto (en Edición)**; sin 4ª pestaña.
11. Notas en **todas** las tomas de video, no solo asesores.
12. Offline: **espejo local + reintento hasta lograrlo**; señal variable en campo.
13. Asesores = **5º lane**, fase 2, par de cámaras ligado.
14. Fases: **Propiedad primero**, Asesores después.
15. Botones de captura: **2 (Toma / No sirve)**, sin tercer botón fijo.
16. Tocar `checklist-logic.js` (aditivo, compatible hacia atrás) = **AUTORIZADO (2026-06-04)**; backend intocable.
17. Criterio de diseño: **claridad obvia, sin negros genéricos, color solo cuando ayuda, nada innecesario.**
