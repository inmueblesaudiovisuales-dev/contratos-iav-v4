# Plan — Arreglos de feedback (F22–F26) + referencia visual (Track 2)

> **Para ejecutar con `build-from-plan`.** Rama `checklist-cambios-2026-06-07`. Una micro-fase = un
> commit con gate. Nunca `main`, nunca deploy a producción (sí preview aislado). Continúa la numeración (F22+).

**Origen:** feedback de Bruno tras probar el preview (F17–F21). Seis puntos: header encimado, no se puede
re-agregar Drone, arrancar sin pisos, amenidades de casa pobres, falta navegación de cuarto en el loop, y
pulido visual de toda la app.

## Invariantes (gate)
- Export `version: 1` intacto. Backend (`worker/`) intocable. `normalizeChecklistData` acepta estado viejo
  (incluidas las tomas de drone pegadas a espacios y los pisos ya guardados). Sin emojis. Aditivo y compatible.

## Estructura de archivos
- `frontend/checklist-logic.js` + `.test.js` — motor (solo F24 y F25).
- `frontend/checklist.html` — UI (F22, F23, F24-parte-UI, F26, y Track 2).

---

# TRACK 1 — Arreglos funcionales

## F22 — Header móvil sin encimar "NUEVO"
**Archivos:** `frontend/checklist.html`. **Invariantes:** `version: 1`, `normalizeChecklistData`.
- En `renderShellHeader`/`renderHeader` el `topbar-onyx` se satura en celular: el folio ("NUEVO" en demo) se
  encima con "Reiniciar demo" y el chip de rol. Reacomodar para móvil: el folio baja a su propia línea bajo el
  nombre (o se oculta si no hay folio), el nombre trunca con elipsis, y "Reiniciar demo" pasa a botón-ícono
  compacto. Nada se encima a ancho de 360–390px. Solo CSS + markup del header; no tocar la lógica.

## F23 — "Drone" re-agregable como piso
**Archivos:** `frontend/checklist.html`. **Invariantes:** `version: 1`, `normalizeChecklistData`.
- En `agregarPiso()` la lista de chips sugeridos omite "Drone"; al borrarlo no hay forma fácil de regresarlo.
  Agregar "Drone" a los chips sugeridos (filtrado si ya existe), con su ícono `ti-drone` y estilo `chip drone`.
  Al confirmarlo debe quedar reconocido como piso drone (`logic.isDronePiso('Drone')` ya devuelve true).

## F24 — Arrancar sin pisos en todos los tipos
**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`, `frontend/checklist.html`.
**Invariantes:** `version: 1`, `normalizeChecklistData`.
- **Motor:** `createDefaultState` arranca con `pisos: []` (no `PISOS_DEFAULT`). **Migración crítica:**
  `normalizeChecklistData` debe **preservar un `pisos` que ya sea un array** (incluido `[]` vacío a propósito)
  y solo **derivar** pisos (`derivePisos`) cuando `pisos` venga **ausente/undefined** (estado legacy). Así el
  estado nuevo arranca vacío y el viejo conserva/recupera sus pisos. NO cambiar `PISOS_DEFAULT` (otros usos).
- **UI:** en el render de setup (`checklist.html:~1492`) hoy `const pisos = state.pisos?.length ? ... : ['Piso 1']`
  fuerza "Piso 1". Cambiar para que con cero pisos la fila "Pisos" muestre **solo chips de un toque para añadir**
  (Exterior, Piso 1, Piso 2, Amenidades, Drone, + "otro…") y un texto guía ("Agrega tu primer piso"). Al añadir
  el primero, ese piso toma foco y aparecen sus cuartos sugeridos. `getFocusPiso()` debe tolerar `pisos` vacío.
- **Tests:** estado nuevo → `pisos` vacío; estado viejo CON `pisos` explícito → se conserva; estado legacy SIN
  `pisos` pero con espacios → deriva de los espacios (no se pierde). Demo sigue cargando.

## F25 — Amenidades de casa enriquecidas (privada/coto)
**Archivos:** `frontend/checklist-logic.js`, `frontend/checklist-logic.test.js`.
- En `SPACE_LIBRARY_BY_FLOOR.casa['Amenidades']` (hoy 3 chips) agregar el set de privada/coto: Caseta / acceso,
  Casa club, Alberca, Gimnasio, Áreas verdes, Juegos infantiles, Cancha, Asadores, Salón de eventos (reutilizar
  categorías existentes: `entrada`, `alberca`, `gimnasio`, `cancha`, `asadores`, `salon_eventos`, `jardin`…).
  Mantener Roof garden/Bodega. Aditivo; no tocar departamento/quinta. Test: `suggestedSpacesFor(state,'Amenidades','casa')`
  incluye alberca y gimnasio.

## F26 — Navegación de cuarto en el loop (barra ‹ · Cambiar · Siguiente ›)
**Archivos:** `frontend/checklist.html`. **Invariantes:** `version: 1`.
- El loop vivo (`renderMediaCapture`, mockup 02) no incluye navegación de cuarto; solo el chevron "‹ Cuartos"
  que abre el diálogo. `renderCapNav('cuarto','abrirCambiarCuarto()')` (barra ‹ anterior · Cambiar · Siguiente ›,
  usa `siguienteCuarto(±1)`) ya existe pero solo en render muerto. Traerla al loop vivo (en drone/terreno usar
  el equivalente de punto/sujeto). Respeta `recorridoEspacios`/límites de piso de `siguienteCuarto`. Verifica que
  avanzar/retroceder funcione y no rompa la captura.

## Verificación Track 1
- `node --test frontend/checklist-logic.test.js` verde. Gate por fase. Playwright en fases con UI (F22, F23, F24, F26)
  contra ancho de celular; capturas en `docs/superpowers/verificacion/fNN/`. Redeploy del preview al cerrar.

---

# TRACK 2 — Pulido visual de toda la app (requiere OK de Bruno al rumbo)

**Rumbo aprobado en concepto:** mantener identidad (papel cálido + canto dorado + display serif para nombres de
cuarto); elevar ejecución (escala de espaciado consistente, segmented/chips al nivel 3DVista, tarjetas con
profundidad sutil, dorado solo como acento, jerarquía tipográfica clara, mejores estados vacíos).

**De-riesgo (orden obligatorio):**
1. **R1 — Pantalla de referencia:** restilizar SOLO el loop de captura (`renderMediaCapture` y sus capas) como
   referencia del lenguaje visual. Deploy a preview. **Bruno valida el feel en celular y aprueba el rumbo.**
2. **R2+ — Propagación:** solo con OK de Bruno, aplicar el mismo lenguaje al resto (setup, cobertura, cierre,
   edición, config), una vista por fase con gate + captura. No propagar antes del visto bueno.

## Después
- F27 — limpieza de código muerto (`renderModeArea`/`abrirLane`/`renderHeader`/`renderCapNav` viejo si queda sin uso).
- F28 — íconos offline (auto-hospedar/inline la fuente Tabler).
