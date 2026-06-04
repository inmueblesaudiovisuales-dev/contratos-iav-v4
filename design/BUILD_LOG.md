# BUILD LOG — Rediseño IAV (admin + portal)

> Bitácora de ejecución. Para retomar: leer `design/SPEC_REDISENO_IAV.md` + `design/design-system.css` + `design/B-dossier.html` + este log + `MASTER_V4.md` (R58).

## Estado (al cierre de la sesión nocturna 2026-06-04)
- [x] **Fase 2 — Backend** (migración r58 APLICADA + config + dedupe + agendarLlamadaRapida + marcarActividad + archivos cliente + fix subida + adapter). **Desplegado y verificado en producción.**
- [x] **Fase 0 — Cimientos** (sistema de diseño Dossier aplicado a admin + portal por remapeo de tokens; respaldos creados). **Desplegado y verificado.**
- [~] **Fase 1 — Admin** (en progreso):
  - [x] 1.6 Ajustes (Datos bancarios + Plantillas).
  - [x] **Nav + pantalla Hoy (R59, commit 8794191, DESPLEGADO)**: shell nuevo topbar onyx + tabs Hoy/Contratos/Clientes + canto dorado + bottom-nav móvil con FAB + menú (⋯) con Clientes/Métricas/Paquetes/Ajustes/Salir; se eliminó sidebar/side-menu/mobile-topbar. Pantalla `#sec-hoy` con saludo+fecha, total por cobrar, botón Nuevo contrato, Sesiones de la semana, Llamadas de hoy (endpoint `listarActividadesPendientes`), lista Por cobrar con botón **Cobrar** (WhatsApp con CLABE+plantilla de config), y film-strip "radar" con punto que respira. **Unificó Contratos** (un solo modelo `listarContratos`): esto arregló el bug donde alternar las sub-tabs Confirmados/Prospectos colapsaba la lista a 1 fila. Verificado en navegador.
  - [x] **1.4 Panel de contrato (R59)**: scroll único (sin tabs), orden Pago → Datos → Acciones → Llamada; Cobrar por WhatsApp; **selector de 9 estatus eliminado** → estatus informativo + acciones explícitas + Cancelar/Reactivar.
  - [x] **1.2 Nuevo contrato (R59)**: anticipo prominente (Sin/50%/100%/Otro), 1 propiedad por defecto, anticipo recordado por cliente.
  - [x] **1.5 Clientes (R59)**: directorio único sin pipeline; expediente con Contratos + hilo de Llamadas y notas (marcar hecha/agregar) + Lo cotizado + Archivos + Recontratar.
  - [x] **Features 5.x**: agendar llamada rápida (modal), cobro CLABE (Hoy + panel), recontratar, anticipo recordado, archivos de cliente UI.
  - **Falta (menor)**: 1.3 restyle de la lista Contratos al patrón `.ledger` con tabs Abiertos/Todos (hoy funciona la tabla unificada; pendiente cosmético). Quitado el chip ⌘K.
- [x] **Fase 3 — Portal**: 3.3 (CLABE desde config) + **arreglo del contrato de datos portal→equipo** + **3.2 reducción del bloque de acceso a 5 campos (versión agresiva)**, verificado end-to-end con contrato de prueba creado y borrado (equipo.html recibe tipoEdificio/contactoAccesoNombre/comentariosAcceso). Backfill de contratos viejos. Mayúsculas neutralizadas. Falta 3.1 fino (precio en vivo de adicionales — verificar si ya existe).
- [~] **Fase 4 — Integración + QA**: cobro/portal usan config; panel/Hoy/Clientes verificados en navegador sin errores de consola. Falta recorrido ANEXO G formal en móvil real.
- [x] **Fase 5 — Auditoría (parcial)**: fix "Crear contrato" que aparecía en todo panel de contrato; glifos ✕ → íconos Tabler. No se crearon datos de prueba esta sesión (nada que borrar).

## Sesión 2026-06-04 (R59) — resumen
Ejecutado de corrido a `main` (verificado en navegador con Playwright en cada paso):
1. **Nav + Hoy** (8794191): shell topbar/tabs/bottom-nav/FAB + pantalla Hoy + **unifica Contratos** (arregla bug de sub-tabs Confirmados/Prospectos que colapsaba la lista). Endpoint `listarActividadesPendientes`.
2. **Panel 1.4** (6d37279): scroll único Pago→Datos→Acciones→Llamada, Cobrar por WhatsApp, **sin selector de 9 estatus** (informativo + acciones explícitas + Cancelar).
3. **Nuevo contrato 1.2** (8c649c8): anticipo Sin/50%/100%/Otro, 1 propiedad por defecto.
4. **Clientes 1.5** (386189b): directorio único sin pipeline; expediente con contratos + hilo de actividades + archivos + Recontratar; agendar llamada rápida (5.x).
5. **Portal Fase 3** (0c25400): fix contrato de datos portal→equipo + limpieza de mayúsculas.
6. **Fase 5** (2273955): fixes de auditoría.

### Acción pendiente de Bruno (sin cambios)
1. Desplegar `adapter/AdapterScript4_v1.js` (necesario para archivos de cliente).
2. Llenar Datos bancarios en Admin → Ajustes (para que Cobrar por WhatsApp y el portal muestren tu CLABE).

---

## ✅ LO QUE QUEDÓ HECHO, DESPLEGADO Y VERIFICADO

### Fase 2 — Backend (commits 973e2d1, c3be510) — EN PRODUCCIÓN
- **Migración `r58-rediseno.sql` APLICADA en D1 remoto** (verificado por PRAGMA): `clientes` +4 cols (`sin_anticipo`, `anticipo_default`, `logo_url`, `carpeta_cliente_id`), `actividades` +2 cols (`estado`, `resultado`), tabla `config` creada. `schema.sql` actualizado.
- **config.js**: `obtenerConfig` (público, solo claves bancarias), `obtenerConfigAdmin`, `guardarConfig`. Degrada con gracia si la tabla no existe. — *verificado live: `obtenerConfig` responde.*
- **clientes.js**: `buscarClientePorTelefono` (dedupe por tel normalizado) — *verificado live*; `actualizarCliente` acepta `sinAnticipo/anticipoDefault/logoUrl` + `_soloPreferencias` con fallback.
- **actividades.js**: `agendarLlamadaRapida` (atómico: dedupe → reusa/crea trabajo → actividad → Calendar) y `marcarActividad` — *verificado live*.
- **archivos.js**: `subirArchivoCliente` + `listarArchivosCliente` (carpeta Drive por cliente); **fix de subida**: `subirArchivoAdmin` cae a la carpeta del cliente si la del proyecto no existe (causa del "siempre falla").
- **db.js**: `normalizarTel()` para dedupe.
- Degradación con gracia (Anexo I.4-bis) en config, clientes, actividades.

### Fase 0 — Sistema de diseño Dossier (commit 7a6287e) — EN PRODUCCIÓN
- Fuentes: Montserrat/JetBrains/Courier → **Fraunces (display) + Inter (UI) + Spline Sans Mono (cifras)** en admin y portal.
- `:root` remapeado a la paleta Dossier en ambos archivos. Como todo usa `var(--*)`, reestiliza la app completa de forma coherente.
- Sin MAYÚSCULAS decorativas, sin Courier/Montserrat. Botón primario = `--gold-leaf` con texto onyx. Canto dorado bajo el topbar.
- **Verificado en navegador** (Playwright): admin (login) y portal (estado sin token) cargan sin errores de consola y se ven on-brand. Cero cambios a markup/JS → sin riesgo funcional.

### Fase 1.6 — Ajustes: Datos bancarios + Plantillas WhatsApp (commit 5b055d4) — EN PRODUCCIÓN
- Dos tabs nuevas en Ajustes con formularios; `guardar/cargarConfigBancario` y `guardar/cargarPlantillas` vía `guardarConfig`/`obtenerConfigAdmin`. Plantillas con defaults de Anexo B.1.
- **Verificado**: login real + navegación a la pane; render on-brand, sin errores.

### Fase 3.3 — Portal: pago con CLABE desde config (commit 018820d) — EN PRODUCCIÓN
- `mergeConfigBancario()` trae CLABE/banco/titular/OXXO/Clip de `obtenerConfig` y los fusiona en `portalData` (en init y en reintentos post-firma). Degrada con gracia.
- **Verificado**: portal carga sin errores.

---

## ⚠️ ACCIONES QUE REQUIEREN TU MANO (Bruno)
1. **Desplegar el adapter** `adapter/AdapterScript4_v1.js` en script.google.com (publicar nueva versión). R58 agrega `subirArchivoCliente` y `listarArchivosCliente`. Sin esto, subir/listar archivos de cliente da error controlado (no rompe nada).
2. **Llenar los datos bancarios** en Admin → Ajustes → Datos bancarios (CLABE, banco, titular, OXXO, Clip). Hoy están vacíos en `config`; en cuanto los guardes, el portal del cliente mostrará tu CLABE automáticamente y el cobro por WhatsApp también (cuando se implemente el botón).
3. (Opcional) Revisa/ajusta las plantillas de WhatsApp en Ajustes → Plantillas.

---

## 📋 LO QUE FALTA (plan preciso para la siguiente sesión)
Orden sugerido. Cada sub-paso: commit + verificar en navegador contra wireframe (Anexo A) y mockup `B-dossier.html`.

**Fase 1 — Admin (reestructura de IA, lo grande):**
- **Nav**: reemplazar markup `#sidebar`/`#side-menu` (Trabajos/Clientes) por **topbar onyx + tabs `Hoy · Contratos · Clientes`** y **bottom-nav móvil con FAB dorado central** (clases ya existen en `design-system.css`: `.topbar`, `.tabs`, `.bottom-nav`, `.fab`). Renombrar la sección `sec-trabajos` → `Contratos` (quitar sub-tabs Confirmados/Por firmar/Prospectos). `mostrarTab` ya maneja secciones; agregar caso `hoy`.
- **1.1 Hoy** (sección nueva `#sec-hoy`): saludo+fecha, "Por cobrar $X" (suma saldos), botón Nuevo contrato, Sesiones de la semana, Llamadas de hoy, Por cobrar (lista con botón Cobrar), film-strip (`.filmstrip/.frame` ya en design-system). Datos de `listarContratos`/`listarActividades` filtrados en frontend.
- **1.2 Nuevo contrato**: ocultar multipropiedad (`agregarPropiedad`/`renderTodasLasProps`) → UI por defecto 1 propiedad; anticipo prominente con botones Sin anticipo/50%/100%/Otro; tras crear, link con Copiar/WhatsApp.
- **1.3 Contratos lista**: ledger (`.ledger/.ledger-row` del design-system); tabs Abiertos/Todos; búsqueda discreta (quitar chip ⌘K).
- **1.4 Panel**: reorganizar a Pago primero (abono + Cobrar por WhatsApp con CLABE de config + plantilla cobro), luego datos, luego "Más acciones" (reagendar/cancelar/entregado). Quitar selector de 9 estatus → estatus informativo + acciones explícitas.
- **1.5 Clientes**: quitar pipeline/chips/columna prospectos; dejar buscador + lista + expediente (contacto editable, historial contratos, hilo actividades con marcar hecha+resumen vía `marcarActividad`, lo cotizado, archivos cliente vía `subirArchivoCliente`/`listarArchivosCliente`, Recontratar).
- **Features 5.x**: cobro CLABE (botón en Hoy/panel), agendar llamada rápida (form simple → `agendarLlamadaRapida`), recontratar + anticipo recordado (usar `clientes.sin_anticipo/anticipo_default/logo_url`).

**Fase 3 — Portal:**
- **3.1** claridad del form (lenguaje simple, ejemplos, revelar progresivo, adicionales con precio en vivo).
- **3.2** simplificar bloque de acceso de ~14 a ~5 campos (fundir torre/piso/depto en uno; fundir caseta/estacionamiento/restricciones/comentarios en un textarea). Mapear los campos fundidos a las columnas existentes que lee `equipo.html` (`instruccionesCaseta`/`comentarios`) — NO romper equipo.

**Fases 4–5:** ANEXO G completo + auditoría de bugs + eliminar datos de prueba.

---

## Decisiones tomadas
- **Orden**: se hizo Fase 2 (backend) ANTES del frontend (Anexo I.1) y se aplicó la migración de inmediato (única razón de correr local). Las features dependientes degradan con gracia.
- **Migración nombrada `r58`** (R57 ya estaba tomada por la auditoría de checklist; cumple "mínimo r57").
- **Estrategia de reskin**: en vez de reescribir 9k líneas de markup/JS de un jalón (riesgo de romper producción con clientes esperando), se aplicó el design-system por **remapeo de tokens** — transformación visual completa, on-brand, con cero riesgo funcional, verificada. La reestructura de IA (arriba) queda como trabajo siguiente, idealmente con revisión visual por sub-paso (Anexo H).
- **OXXO/7-Eleven** en el portal conserva el texto instructivo hardcodeado (default razonable); CLABE/banco/titular/Clip sí salen de config.
- No se tocaron `equipo.html`, `checklist.html`, `chat.html`, `revision.html`.

## Pendiente menor / notas
- Glifos `✕`/`✓` de texto siguen en algunos botones de cierre (no son emojis a color; bajo prioridad — sustituir por íconos Tabler en la pasada de Fase 5).
- No se crearon datos de prueba en producción (solo lecturas / endpoints validados con payloads vacíos).
