# IAV Contratos v4.0 — Documento Master

> Última actualización: 2026-06-03 18:11:58 CST (Ronda 54 — Bitacora de Produccion 2.1 UI Campo)
> Sistema anterior: v3.0 (Google Apps Script + Sheets) — sigue vivo en `inmueblesaudiovisuales.com`, sin cambios.

---

## Rama de trabajo

Todo el desarrollo va directo a `main`. No se crean ramas de feature ni se trabaja en ramas paralelas salvo instrucción explícita de Bruno. El flujo es: editar → commit → push a `main`.

---

## Qué es v4.0

Sistema de contratos de Inmuebles Audiovisuales reconstruido desde cero sobre Cloudflare. El cambio central es velocidad: v3 tardaba 2-4 segundos por operación (Apps Script frío). v4 responde en < 200ms porque todas las operaciones de datos van a D1 (SQLite en edge). Google sigue siendo el backend para carpetas de Drive, calendario, correos y PDFs — pero se llama de forma asíncrona, el usuario no espera.

---

## URLs de producción

| Recurso | URL |
|--------|-----|
| Admin | `https://contratos.inmueblesaudiovisuales.com/admin.html` |
| Portal del cliente | `https://contratos.inmueblesaudiovisuales.com/portal.html?token=<token>` |
| Portal de equipo | `https://contratos.inmueblesaudiovisuales.com/equipo.html?token=<token>` |
| Checklist de rodaje | `https://contratos.inmueblesaudiovisuales.com/checklist.html?token=<token>` |
| Revisión de video | `https://contratos.inmueblesaudiovisuales.com/revision.html?token=<token>` |
| API base | `https://contratos.inmueblesaudiovisuales.com/api/<accion>` |

---

## Credenciales y referencias

| Ítem | Valor |
|------|-------|
| Clave admin | `framedock` |
| Cloudflare account | `inmueblesaudiovisuales@gmail.com` |
| Worker name | `contratos-iav-v4` |
| D1 database | `contratos-iav-v4` |
| D1 database_id | `84ae26a8-5bbc-4cdc-ad39-ead4c6bc7500` |
| Apps Script URL | `https://script.google.com/macros/s/AKfycbwv6J6Mh-y31LYGdLBasL0bFDOloosEaiaLJDXH-TIF2-A_VpFUbh14I9zHt43LEfY/exec` |
| Sheets backup | `https://docs.google.com/spreadsheets/d/1YLscbVQJEm_SF77lfiZXyDHc0_gy543P5yitPX_KpnY` |

---

## Estructura de archivos

```
06. VERSION 4.0/
├── ARRANQUE.md              — guía de despliegue inicial (ya ejecutada)
├── MASTER_V4.md             — este archivo
├── MASTER_AUTOMATIZACION.md — plan de automatización WhatsApp (3 fases)
├── PROMPT_DEEPSEEK_BUGS.md  — historial de bugs
├── adapter/
│   └── AdapterScript4_v1.js — Apps Script desplegado en script.google.com
├── frontend/
│   ├── admin.html           — panel de administración
│   ├── portal.html          — portal del cliente (firma, pagos, reseña, revisión)
│   ├── checklist.html       — checklist de rodaje
│   ├── equipo.html          — portal de equipo (solo lectura + estatus produccion) (R31)
│   └── revision.html        — página de notas de revisión de video (R18)
└── worker/
    ├── wrangler.toml        — configuración del Worker
    ├── schema.sql           — estructura de D1 (referencia, ya aplicado)
    ├── seed-paquetes.sql    — 10 paquetes iniciales (ya aplicado)
    ├── package.json
    └── src/
        ├── index.js         — entry point, routing
        ├── auth.js          — requireAdmin(), ok(), err()
        ├── db.js            — helpers D1: query(), queryOne(), run(), batch()
        ├── tokens.js        — crearTokenPortal(), crearTokenConfigurar(), refrescarExpiry(), marcarUsado()
        ├── folios.js        — generarFolio() base + asignarFolio() → "IAV-YYMM.DD-A" (con sufijo letra)
        ├── google.js        — callAdapter() async, callAdapterSync()
        ├── cron.js          — syncToSheets() para backup horario
        └── routes/
            ├── contratos.js — ~25 endpoints del admin
            ├── portal.js    — obtenerPortal, firmaCliente, guardarResena, guardarConfiguracion
            ├── abonos.js    — registrarAbono, listarAbonos
            ├── paquetes.js  — CRUD catálogo de paquetes
            ├── stats.js     — métricas por periodo
            ├── checklist.js — obtenerChecklist, guardarChecklist
            ├── archivos.js  — subirArchivo, subirArchivoAdmin
            ├── revision.js  — obtenerRevision, guardarRevision (R18)
            ├── equipo.js    — obtenerEquipo, marcarProduccion (R31/R34)
            ├── clientes.js  — CRM clientes: crear/listar/obtener/actualizar (R35)
            ├── trabajos.js  — pipeline comercial por cliente (R35)
            └── actividades.js — llamadas/notas/actividad por cliente/trabajo (R35)
```

---

## Repositorio GitHub

**Repo:** `https://github.com/inmueblesaudiovisuales-dev/contratos-iav-v4` (privado)  
**Rama de producción:** `main`  
**Cuenta GitHub:** `inmueblesaudiovisuales-dev`  
**GitHub App:** Claude Code instalada en el repo (permisos completos de commits/PRs)  
**GitHub Actions secret:** `CLOUDFLARE_API_TOKEN` configurado

---

## Cómo trabajar desde el celular (sin Mac)

Claude Code on the Web permite trabajar 100% en la nube sin necesitar la Mac encendida:

1. Abrir `claude.ai/code` en el cel
2. Conectar repo `contratos-iav-v4` via OAuth (Settings → Integrations → GitHub)
3. Pedirle a Claude los cambios en lenguaje natural
4. Claude edita archivos, hace commit y push a `main`
5. GitHub Actions despliega a Cloudflare automáticamente en ~1 minuto

**Limitación conocida:** Claude Code on the Web no puede modificar archivos bajo `.github/workflows/` (restricción de scope OAuth). Para cambiar el workflow de deploy, se necesita la Mac.

---

## Cómo desplegar cambios

**Flujo normal (desde Mac o cel via Claude Code on the Web):**

1. Claude hace cambios en los archivos
2. Claude hace `git commit` + `git push origin main`
3. GitHub Actions dispara automáticamente `wrangler deploy`
4. Cloudflare despliega en ~1 minuto

**Claude nunca corre `wrangler deploy` directamente** — el push a `main` es suficiente.

```bash
cd "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0"
git add <archivos>
git commit -m "R16 — descripción del cambio"
git push origin main
```

Los archivos de `frontend/` se suben automáticamente como assets estáticos vía el workflow `.github/workflows/deploy.yml`.

**Para operaciones de D1** (migraciones, seeds) sigue siendo `wrangler d1 execute ... --remote` directamente desde terminal.

**El adapter de Apps Script sí requiere acción manual de Bruno**: pegar el contenido de `adapter/AdapterScript4_v1.js` en script.google.com y desplegar nueva versión. Claude entrega el archivo listo.

---

> ⚠️ **REGLA CRÍTICA — OBLIGATORIA EN CADA MODIFICACIÓN AL ADAPTER**
>
> Cada vez que se modifique `adapter/AdapterScript4_v1.js`:
>
> 1. Documentar en este `MASTER_V4.md` con el formato exacto:
>    `YYYY-MM-DD HH:MM:SS CST` — usando siempre la hora de **Monterrey** (`TZ="America/Monterrey" date`)
> 2. Indicar qué función/flujo se tocó
> 3. Indicar si requiere despliegue manual en Apps Script (casi siempre sí)
>
> **No omitir la hora. No usar "aprox". Ejecutar `TZ="America/Monterrey" date "+%Y-%m-%d %H:%M:%S %Z"` antes de documentar.**
>
> *(Regla original agregada 2026-06-02 12:00:09 CST)*

---

---

## Base de datos D1

### Tablas

| Tabla | Descripción |
|-------|-------------|
| `contratos` | Un registro por contrato. PK: `token` (UUID). Columna `entrega_express INTEGER DEFAULT 0` agregada en R17. |
| `tokens` | Tokens de portal y configurar. FK: `contrato_id` → `contratos.token`. |
| `abonos` | Pagos. FK: `contrato_token` → `contratos.token`. |
| `propiedades` | Una o más propiedades por contrato. PK compuesta: `(contrato_token, num_propiedad)`. Columnas `formato_video TEXT DEFAULT 'vertical_nativo'` y `requiere_acceso INTEGER DEFAULT 0` agregadas en R18. |
| `paquetes` | Catálogo. PK: `clave` (ej. `RES-COMBO`). |
| `checklist` | Un checklist por contrato. PK: `contrato_token`. |
| `revisiones_video` | Notas de revisión de video por contrato. FK: `contrato_id` → `contratos.token`. Columnas: `id`, `contrato_id`, `minuto_segundo`, `descripcion_ajuste`, `fecha`. Agregada en R18. |
| `prospectos` | Llamadas agendadas con prospectos. PK: `id` (UUID). Columnas: `nombre`, `telefono`, `interes`, `fecha_llamada`, `hora_llamada`, `notas`, `estatus` (pendiente/contactado/convertido/descartado), `fecha_creacion`. Agregada en R32. **Tabla creada manualmente por Bruno el 2026-06-02** (DROP + CREATE desde wrangler CLI — la primera migración había creado la tabla sin columnas). |
| `clientes` | CRM de clientes. PK: `id` (UUID). Columnas: `nombre`, `telefono`, `correo`, `origen`, `notas_perfil`, `fecha_creacion`, `fecha_ultima_actividad`. Agregada en R35. |
| `trabajos` | Pipeline comercial ligado a `clientes`. PK: `id` (UUID). Columnas: `cliente_id`, `estatus`, `interes`, JSON de paquetes/portafolio/propiedades, `presupuesto_estimado`, `notas`, `contrato_token`, fechas. Agregada en R35. |
| `actividades` | Bitácora de llamadas/notas por cliente y trabajo. PK: `id` (UUID). Columnas: `cliente_id`, `trabajo_id`, `tipo`, `descripcion`, `fecha_actividad`, `hora`, `fecha_creacion`. Agregada en R35. |

### Nota importante — D1 no soporta foreign keys
`PRAGMA foreign_keys` es ignorado en D1. Las cascadas de eliminación están implementadas manualmente en código con `db.batch()` en orden correcto: checklist → propiedades → abonos → tokens → contratos.

### Consultar D1 desde terminal
```bash
wrangler d1 execute contratos-iav-v4 --remote --command="SELECT token, folio, nombre_cliente, estatus FROM contratos ORDER BY fecha_creacion DESC LIMIT 10"
```

---

## Paquetes en catálogo

| Clave | Nombre | Precio | Tipo |
|-------|--------|--------|------|
| RES-COMBO | Paquete Residencial | $4,500 | Base |
| TER-COMBO | Paquete Terreno | $4,000 | Base |
| IND-FOTO | Fotografía profesional | $3,000 | Base |
| IND-VIDEO | Video cinemático + Drone | $3,000 | Base |
| IND-360 | Recorrido virtual 360° | $3,000 | Base |
| ADD-COMOLLEGAR | Video cómo llegar | $1,000 | Adicional |
| ADD-LANDING | Landing page | $1,200 | Adicional |
| ADD-FOLLETO | Folleto digital PDF | $800 | Adicional |
| ADD-ASESOR | Asesor en Video | $500 | Adicional |
| ADD-EXPRESS | Entrega Express | $1,000 | Adicional |

Todos los adicionales tienen columna `alcance` en D1. Desde R14, **todos** son `por_propiedad` — ADD-EXPRESS ya no es caso especial.

Además, el admin permite crear **add-ons personalizados** (nombre + precio libre) por propiedad. Se guardan en `adicionales_json` como `{ nombre: "...", precio: X, ofrecido: true, numPropiedad?: N }`.

---

## Flujo de un contrato completo

### 1. Creación (admin)
- Bruno llena el formulario en `admin.html` → `POST /api/crearContrato`
- Worker inserta en D1: `contratos` + `propiedades` + token de portal en `tokens`
- Se valida que `precioTotal > 0`
- **Async (sin esperar):** Apps Script notifica a Bruno por correo con el link del portal (solo guarda referencia — Bruno ya ve el admin)
- Admin muestra el link del portal para compartir con el cliente

### 2. Firma del cliente (portal)
- Cliente abre `portal.html?token=<token>` (token permanece en la URL para poder copiarla/compartirla)
- Selecciona adicionales si los hay, llena datos (incluyendo orientación), dibuja firma → `POST /api/firmaCliente`
- Worker actualiza contrato en D1 (estatus → "Firmado" o "En produccion" si prepagado)
- Protección anti-doble-firma: `WHERE token=? AND estatus='Pendiente firma'` + check `meta.changes`
- **Async:** Apps Script guarda la firma en Drive, registra un PDF pendiente en PropertiesService
- **Async (mismo call):** Apps Script crea carpetas Drive (año/mes de la sesión, no de hoy) para TODAS las propiedades, genera PDF de referencias y eventos Calendar; llama de vuelta al Worker con `carpetaControlId`, `carpetaEntregablesId`, `calendarEventId`
- **Async:** `procesarPDFsPendientes` (trigger cada minuto) genera el PDF desde template de Google Docs con firma insertada, lo adjunta en un email y lo manda al cliente

### 3. Primer abono
- Bruno registra el abono en admin → `POST /api/registrarAbono`
- Worker actualiza saldo en D1, cambia estatus a "Anticipo recibido"
- Devuelve `totalAbonado` en la respuesta para actualizar UI
- Guard: si ya existe `carpeta_control_id` en propiedades, no se llama `primerAbono` — **`primerAbono` es fallback legacy** para contratos firmados antes de esta versión
- **Async:** Apps Script envía correo de confirmación al cliente

### 4. Entrega
- Bruno actualiza producción/entrega en admin
- Cliente puede ver los links de entrega en el portal (etapa 3)
- `carpetaEntregablesUrl` en `obtenerContrato` ahora prefiere `carpeta_entregables_id`, con fallback a `carpeta_control_id`

---

## Flujo de correos

| Evento | Destinatario | Enviado por |
|--------|-------------|-------------|
| Contrato firmado + PDF | Cliente | Apps Script (`procesarPDFsPendientes`) |
| Abono registrado (primer abono) | Cliente | Apps Script async — asunto "Tu sesión está apartada" |
| Abono registrado (subsecuentes) | Cliente | Apps Script async — asunto "Confirmación de pago" |
| Upsell notificado | Cliente | Apps Script async |
| Recordatorio de pago | Cliente | Apps Script (trigger manual desde admin) |
| Sesión reagendada | Cliente | Apps Script async |
| Material entregado | Cliente | Apps Script async |
| Reseña nueva | Bruno | Apps Script async |
| Notas de revisión de video | Bruno | Apps Script async (`notificarRevision`) |

> Bruno NO recibe correo al crear ni al firmar contratos — ve el estado en el admin.
> El cliente NO recibe correo al crear el contrato. El primer correo es el PDF cuando firma.

---

## Cómo funciona el adapter de Apps Script

El Worker llama al adapter con `POST` y un JSON `{ action: '...', ...datos }`. Las operaciones son asíncronas via `ctx.waitUntil()` — el usuario nunca espera.

**Acciones disponibles:**

| Acción | Qué hace |
|--------|---------|
| `notificarContratoCreado` | ~~Eliminado en Ronda 8~~ — función vacía removida del handler map |
| `procesarFirma` | Guarda firma PNG en Drive, registra PDF pendiente; **crea carpetas Drive (año/mes de la sesión) + PDF referencias + eventos Calendar** para todas las propiedades; llama Worker `actualizarCarpeta` + `actualizarCalendarEvent` |
| `procesarPDFsPendientes` | Genera PDF desde template, envía al cliente, llama Worker `actualizarPdfUrl` |
| `primerAbono` | **Legacy fallback** — solo se ejecuta si el contrato no tiene `carpeta_control_id` (firmado antes de Ronda 11). Igual que `procesarFirma` pero para contratos viejos. Usa fecha de sesión (no hoy) para el mes de carpeta. |
| `enviarCorreoAbono` | Correo HTML de confirmación de pago al cliente |
| `enviarRecordatorioPago` | Correo HTML de recordatorio de saldo al cliente |
| `reagendarPropiedad` | Actualiza fecha/hora del evento Calendar; actualiza **título** del evento con nuevo folio; actualiza **descripción** con nuevo PDF URL; **renombra carpeta** con nuevo folio; **mueve carpeta** al mes/año correcto según nueva fecha; **borra PDF referencias anterior** y **regenera** con nuevo folio; llama Worker `actualizarCalendarEvent` |
| `enviarCorreoEntrega` | Correo HTML de entrega al cliente |
| `notificarUpsell` | Correo HTML de servicios adicionales |
| `subirArchivo` | Sube archivo a carpeta de propiedad (desde portal) |
| `subirArchivoAdmin` | Sube archivo a carpeta (desde admin) |
| `syncBackup` | Sobreescribe tabs en Sheets con datos de D1 |
| `agendarLlamadaProspecto` | Crea evento de 30 min en Calendar con nombre, teléfono, interés y notas del prospecto. Agregado en R32. |
| `obtenerLogoCliente` | Busca logo precargado del cliente en Drive |
| `notificarRevision` | Correo HTML a Bruno con tabla de timecodes y notas de revisión del cliente (R18) |

### Callbacks del adapter al Worker
Apps Script llama de vuelta al Worker para guardar IDs de Google en D1:
- `POST /api/actualizarCarpeta` — guarda `carpeta_control_id` y `carpeta_entregables_id` en `propiedades`
- `POST /api/actualizarCalendarEvent` — guarda `calendar_event_id` en `propiedades`
- `POST /api/actualizarPdfUrl` — guarda `pdf_contrato_url` en `contratos`

---

## Backup automático

Un Cron Trigger de Cloudflare ejecuta `syncToSheets()` cada hora (`:00`). Sincroniza las 4 tablas principales (contratos, abonos, propiedades, paquetes) a la hoja `1YLscbVQJEm_SF77lfiZXyDHc0_gy543P5yitPX_KpnY` en tabs: Contratos4, Abonos4, Propiedades4, Paquetes4.

Pérdida máxima de datos si Cloudflare falla: 1 hora.

---

## Diferencias clave con v3.0

| Aspecto | v3.0 | v4.0 |
|---------|------|------|
| Backend | Google Apps Script | Cloudflare Workers |
| Base de datos | Google Sheets | Cloudflare D1 (SQLite) |
| Velocidad | 2-4s (frío) | < 200ms |
| Routing | `?action=nombreAccion` | `/api/nombreAccion` |
| Auth admin | `?adminKey=framedock` | Header `X-Admin-Key: framedock` |
| Campos DB | PascalCase (Sheets columns) | snake_case (D1 columns) |
| Google services | Síncrono (bloquea respuesta) | Asíncrono (`ctx.waitUntil`) |
| PDF | Síncrono en la firma | Pendiente en PropertiesService, trigger separado |
| Backup | Sheets es la DB | Sheets es solo backup horario |

---

## Próximo trabajo sugerido

### Portal de producción para el equipo (R31 — completado)

Reemplazar el PDF que se genera desde Drive por una página web dinámica accesible con token. Objetivo: que el fotógrafo/camarógrafo llegue el día de la sesión y tenga toda la información sin depender de un PDF.

**URL propuesta:** `equipo.html?token=<token_equipo>` — token de solo lectura, diferente al del cliente.

**Contenido mínimo:**
- Dirección + enlace a Google Maps
- Datos de acceso/caseta (del bloque ya capturado en portal)
- Archivos subidos (QR, invitación, fachada)
- Vínculo directo a `checklist.html?token=<token>`
- Estado de producción: botón para marcar "Fotos listas" / "Video listo" que actualice D1

**Meta futura (no implementar aún):**
- Opción desde `admin.html` para crear evento de Calendar para llamadas con clientes (separado del evento de sesión)

---

## Cambios aplicados — Post-auditoría v3 → v4 (2026-05-30)

### Ronda 54 — Bitacora de Produccion 2.1 UI Campo (2026-06-03 18:11 CST)

**Cambio:** Refinamiento completo de la interfaz R53 para reducir lectura y altura, hacer visibles los riesgos y convertir Cierre/Edicion en herramientas operativas.

| ID | Archivo | Cambio |
|----|---------|--------|
| R54-01 | `docs/superpowers/specs/2026-06-03-bitacora-produccion-2-1-ui-design.md` | Spec aprobada del refinamiento UI/UX de campo. |
| R54-02 | `docs/superpowers/plans/2026-06-03-bitacora-produccion-2-1-ui.md` | Plan de implementacion R54. |
| R54-03 | `frontend/checklist.html` | Header y modos compactos, resumen orientado a riesgo, jerarquia visual de claves/amenidades, acciones semanticas, Cierre tipo semaforo, Edicion tipo timeline y onboarding con Amenidades prominente. |
| R54-04 | Verificacion | Sintaxis valida, 10 pruebas de logica aprobadas y smoke visual movil/escritorio sin desbordes ni errores de consola. |

R54 no cambia endpoints, adapter, D1 ni reglas de captura.

---

### Ronda 53 — Bitacora de Produccion 2.0 (2026-06-03 13:19 CST)

**Cambio:** Segunda iteracion profunda de `checklist.html` enfocada en UX de campo: plantillas primero, amenidades como zona propia, accion primaria clara y repeticion intencional.

| ID | Archivo | Cambio |
|----|---------|--------|
| R53-01 | `docs/superpowers/specs/2026-06-03-bitacora-produccion-2-design.md` | Spec formal de Bitacora 2.0: problemas de R48, plantillas, amenidades, reglas de captura, cierre y vista Edicion. |
| R53-02 | `docs/superpowers/plans/2026-06-03-bitacora-produccion-2.md` | Plan de implementacion R53. |
| R53-03 | `frontend/checklist-logic.js` | Agrega plantillas reales (`casa`, `departamento`, `terreno`, `amenidades`, `exterior_drone`), zonas, espacios clave, resumen por zona, prevencion de duplicados en Foto/360 y repeticion explicita en Video/Drone con `intencion`. |
| R53-04 | `frontend/checklist-logic.test.js` | Sube cobertura a 10 pruebas: plantillas, amenidades, zonas, duplicados accidentales, intenciones y pendientes clave. |
| R53-05 | `frontend/checklist.html` | Rediseño UX 2.0: pantalla inicial de plantillas, modo activo con texto completo, botones grandes `Registrar/Gestionar`, chips pasivos, Cierre por prioridad y vista Edicion separada. |
| R53-06 | `MASTER_V4.md` | Documenta R53. No requiere cambios al adapter ni a D1 fuera del JSON existente. |

---

### Ronda 48 — Bitacora de Produccion en checklist.html (2026-06-03 12:05 CST)

**Cambio:** `checklist.html` se rediseña como Bitacora de Produccion para registrar capturas en campo y dejar una secuencia util para edicion.

| ID | Archivo | Cambio |
|----|---------|--------|
| R48-01 | `frontend/checklist-logic.js` | Nuevo modulo de logica pura para formato v2, migracion legacy, servicios activos, espacios en lote, registro de capturas, undo, pendientes y filtros de bitacora. |
| R48-02 | `frontend/checklist-logic.test.js` | Pruebas con `node:test` para migracion, parsing de espacios/subespacios, orden independiente Video/Drone, servicios desactivados y undo. |
| R48-03 | `frontend/checklist.html` | Rediseño completo a Bitacora de Produccion: modos Foto/360/Video/Drone, servicios activables manualmente, espacios/subespacios, Drone separado, bitacora cronologica, cierre de pendientes, acciones secundarias y autosave. |
| R48-04 | `docs/superpowers/specs/2026-06-03-bitacora-produccion-design.md` | Spec de producto/UX aprobada para la nueva Bitacora de Produccion. |
| R48-05 | `docs/superpowers/plans/2026-06-03-bitacora-produccion.md` | Plan de implementacion usado para ejecutar R48. |
| R48-06 | `MASTER_V4.md` | Documenta R48. No requiere cambios al adapter ni a D1 fuera del JSON existente. |

---

### Ronda 37 — Rediseno completo admin: Clean SaaS (2026-06-03 00:32 CST)

**Cambio: Rediseno visual y estructural completo de admin.html**

| ID | Archivo | Cambio |
|----|---------|--------|
| R37-01 | `frontend/admin.html` CSS | CSS completo reescrito. Tokens: `--black`, `--page:#F9F9F7`, `--card:#FFFFFF`, `--gold:#C9A84C`, `--sidebar-w:200px`, `--panel-w:340px`. Mobile-first. |
| R37-02 | `frontend/admin.html` CSS | Sidebar desktop: `#sidebar` fijo 200px, items con indicador dorado, footer con engranaje. |
| R37-03 | `frontend/admin.html` CSS | Side menu mobile: `#side-menu` desliza desde izquierda, overlay oscuro, `#side-menu-overlay`. Sin bottom nav. |
| R37-04 | `frontend/admin.html` CSS | Topbar mobile: `.mobile-topbar` con hamburger, titulo de seccion, boton `+` (32x32px, border-radius:8px). |
| R37-05 | `frontend/admin.html` CSS | KPI cards: `.kpi-grid` 4 columnas en desktop. Oculto en mobile. IDs internos preservados. |
| R37-06 | `frontend/admin.html` CSS | Panel lateral: mobile = bottom sheet (88dvh, translateY), desktop = panel fijo derecha (340px, translateX). |
| R37-07 | `frontend/admin.html` HTML | Bottom nav eliminado. FAB eliminado. `#radar-sesiones` eliminado. `#hoyStrip` eliminado. `.tabs` (Contratos tab) eliminado. |
| R37-08 | `frontend/admin.html` HTML | Nuevo `#sidebar` desktop y `#side-menu` + `#side-menu-overlay` mobile. `<div class="mobile-topbar">` reemplaza topbar oscuro. `.main-content` envuelve el contenido. |
| R37-09 | `frontend/admin.html` HTML | `#statsRibbon` conserva IDs internos pero con markup de `.kpi-grid`. |
| R37-10 | `frontend/admin.html` JS | `mostrarTab` reescrita: usa `.sidebar-item` y `.sm-nav-item`. Actualiza `#topbar-section-title`. |
| R37-11 | `frontend/admin.html` JS | `abrirSideMenu` / `cerrarSideMenu` nuevas. `mostrarTabMobile` simplificada. |
| R37-12 | `frontend/admin.html` JS | `actualizarNavBadges` actualizada: usa `#bnav-badge-contratos` (sidebar) y `#sm-badge-contratos` (side menu). |
| R37-13 | `frontend/admin.html` JS | Eliminadas: `renderHoyStrip`, `renderRadar`, `toggleMenuNuevo`, `cerrarMenuNuevo`. |
| R37-14 | `frontend/admin.html` JS | `body.panel-open` reemplaza `body.panel-abierto` para activar `margin-right` en desktop. |

---

### Ronda 35 — CRM Clientes/Trabajos/Actividades + auditorías pre-merge (2026-06-02)

> **Migración D1 requerida — ejecutar manualmente si la DB aún no tiene tablas CRM:**
> ```bash
> cd worker
> wrangler d1 execute contratos-iav-v4 --remote --file=migrations/r35-clientes-trabajos.sql
> ```
>
> La D1 de producción ya tenía columnas previas (`entrega_express`, `formato_video`, `requiere_acceso`, `ocultar_formato_video`, `tiene_recorrido`, `cliente_id`). La migración R35 crea tablas/índices CRM y evita `ALTER TABLE ADD COLUMN` duplicados.

| ID | Archivo | Cambio |
|----|---------|--------|
| R35-01 | `worker/src/routes/clientes.js` | Nuevo handler CRM: `crearCliente`, `listarClientes`, `obtenerCliente`, `actualizarCliente`. `listarClientes` mantiene alias legacy (`cliente_id`, `nombre_cliente`, etc.) y suma contratos antiguos por correo cuando aún no tienen `cliente_id`. |
| R35-02 | `worker/src/routes/trabajos.js` | Nuevo pipeline comercial: crear/listar/actualizar trabajos, cambiar estatus, convertir trabajo a contrato. Escrituras relacionadas usan `batch()` y `convertido` solo se permite con contrato asociado. |
| R35-03 | `worker/src/routes/actividades.js` | Nuevo módulo de actividades: agendar llamada, agregar nota y listar actividad. Las llamadas se mandan al adapter en background con `ctx.waitUntil()`. |
| R35-04 | `worker/src/index.js` | Registra rutas CRM (`RUTAS_CLIENTES`, `RUTAS_TRABAJOS`, `RUTAS_ACTIVIDADES`) y deja `listarClientes` únicamente bajo `clientes.js`. |
| R35-05 | `worker/src/routes/contratos.js` | `crearContrato` acepta `clienteId`/`trabajoId`; valida pertenencia, rechaza anticipos negativos y limpia trabajos ligados cuando se elimina un contrato. |
| R35-06 | `worker/src/routes/portal.js` | `firmaCliente` actualiza contrato y propiedades en un solo batch para evitar firmas parciales. |
| R35-07 | `worker/src/routes/revision.js` | `guardarRevision` filtra notas vacías, inserta en batch y notifica al adapter solo lo realmente guardado. |
| R35-08 | `worker/src/google.js` + `worker/src/cron.js` | `callAdapter` y `syncToSheets` detectan respuestas `{ error }` / `{ ok:false }` aunque Apps Script responda HTTP 200. |
| R35-09 | `worker/schema.sql` + `worker/migrations/r35-clientes-trabajos.sql` | Schema completo actualizado con `clientes`, `trabajos`, `actividades` e índices. Migración R35 enfocada en tablas/índices para no chocar con columnas ya existentes. |
| R35-10 | `frontend/admin.html` | `#sec-prospectos` pasa a experiencia Clientes: pipeline, lista de clientes, dropdown Nuevo, modales cliente/trabajo, búsqueda de cliente existente en contrato y agendar llamada desde contrato. |
| R35-11 | `frontend/admin.html` | Fixes de auditoría: selección visual de cliente sincronizada con hidden `clienteId`, clientes legacy sin id no se seleccionan como existentes, limpieza de modales/form, `renderHoyStrip` con fecha local y escape HTML. |
| R35-12 | `worker/src/cron.js` | Backup horario incluye `clientes`, `trabajos` y `actividades` en `syncBackup`. |
| R35-13 | `adapter/AdapterScript4_v1.js` | 2026-06-02 22:50:23 CST: `agendarLlamadaProspecto` se consolida como `agendarLlamadaCliente`, acepta `contratoToken` para seguimiento desde contrato y `syncBackup` agrega hojas `Clientes4`, `Trabajos4`, `Actividades4`. Requiere despliegue manual en Apps Script. |
| R35-14 | `MASTER_V4.md` | Documenta R35, adapter incluido, y estado real tras merge a `main`. |

**Commits clave R35 antes de merge:**

| Commit | Descripción |
|--------|-------------|
| `992b199` | Backend R35 inicial: clientes, trabajos, actividades y contratos ligados a CRM. |
| `1fb43a7` | Frontend R35: sección Clientes, pipeline trabajos, modales y búsqueda cliente-contrato. |
| `47419ec` | Primera auditoría/fixes R35. |
| `fc38af8` | Segunda auditoría/fixes de migración, legacy y seguridad frontend. |
| `8f383e3` | Tercera auditoría/fixes: ruteo `listarClientes`, conteos legacy, batches, adapter errors, selección cliente y migración R35 segura. |

---

### Ronda 34 — Mejoras portal equipo + Calendar simplificado (2026-06-02)

> **Migración D1 requerida — ejecutar manualmente:**
> ```bash
> wrangler d1 execute contratos-iav-v4 --remote --command="ALTER TABLE contratos ADD COLUMN tiene_recorrido INTEGER DEFAULT 1"
> ```

| ID | Archivo | Cambio |
|----|---------|--------|
| R34-01 | `frontend/equipo.html` | Sección "Cliente" con nombre y teléfono (link tel:). Entregables formateados como lista (split por `·`, `\n`, `\|`). Links a carpetas Drive (Entregables + Control Interno) por propiedad. |
| R34-02 | `frontend/equipo.html` | Sección "Post-produccion" a nivel contrato: Fotografía lista, Video listo, Recorrido 360 listo (toggle + campo URL). Toggle "Incluye recorrido 360" que muestra/oculta la sección y persiste en D1. Llama `POST /api/marcarProduccion`. |
| R34-03 | `worker/src/routes/equipo.js` | `obtenerEquipo` expone `fotografiaLista`, `videoListo`, `recorridoListo`, `recorridoUrl`, `tieneRecorrido` (del contrato) y `carpetaControlId`, `carpetaEntregablesId` (por propiedad). Acción `marcarProduccion` reemplaza `marcarListos`: actualiza columnas de post-produccion en `contratos` por token (sin admin key). |
| R34-04 | `worker/src/index.js` | `marcarListos` reemplazado por `marcarProduccion` en `RUTAS_EQUIPO`. |
| R34-05 | `worker/src/routes/contratos.js` | `guardarProduccion` agrega `tiene_recorrido` al UPDATE. |
| R34-06 | `frontend/admin.html` | Tab Producción: checkbox "Incluye recorrido 360 en este contrato" que controla visibilidad de los campos de recorrido. Función `toggleRecorridoAdmin`. `tieneRecorrido` incluido en payload de `guardarProduccion`. |
| R34-07 | `adapter/AdapterScript4_v1.js` | 2026-06-02 14:31:23 CST: Descripcion de eventos Calendar simplificada en `procesarFirma`, `primerAbono` y `reagendarPropiedad`. Solo quedan: tipo/paquete, Dirección, Mapa, Cómo llegar, Portal de equipo. Eliminados: Orientación, Entregables, Foto fachada, Perímetro, Notas, Comentarios, bloque acceso, PDF Referencias, Carpeta Drive, Checklist. Requiere despliegue manual en Apps Script. |
| R34-08 | `MASTER_V4.md` | Documenta R34. |

---

### Ronda 33 — Bottom nav rediseño: 4 items iguales (2026-06-02)

> Sin migración D1. Solo cambios en `frontend/admin.html`.

| ID | Archivo | Cambio |
|----|---------|--------|
| R33-01 | `frontend/admin.html` | Bottom nav mobile reemplazado: 4 items iguales (Contratos, Nuevo, Prospectos, Ajustes). Eliminado FAB circular flotante. Todos los items tienen el mismo estilo flat con ícono + label. |
| R33-02 | `frontend/admin.html` | Estilos `.bnav-fab` eliminados. "Nuevo" en desktop se estiliza como botón dorado full-width dentro del sidebar, coherente con el diseño anterior pero sin CSS separado. |
| R33-03 | `MASTER_V4.md` | Documenta R33. |

---

### Ronda 32 — Prospectos: agendar llamadas + Calendar (2026-06-02)

> **Migración D1 requerida — ejecutar manualmente:**
> ```bash
> wrangler d1 execute contratos-iav-v4 --remote --command="CREATE TABLE IF NOT EXISTS prospectos (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, telefono TEXT NOT NULL, interes TEXT DEFAULT '', fecha_llamada TEXT NOT NULL, hora_llamada TEXT NOT NULL, notas TEXT DEFAULT '', estatus TEXT DEFAULT 'pendiente', fecha_creacion TEXT NOT NULL)"
> ```

| ID | Archivo | Cambio |
|----|---------|--------|
| R32-01 | `worker/src/routes/prospectos.js` | Nueva ruta. `crearProspecto`: guarda en D1 y llama adapter async para crear evento en Calendar. `listarProspectos`: devuelve últimos 100 ordenados por fecha. `actualizarEstatusProspecto`: cambia estatus (pendiente/contactado/convertido/descartado). |
| R32-02 | `worker/src/index.js` | Importa `handleProspectos`; agrega `RUTAS_PROSPECTOS`; enruta al handler. |
| R32-03 | `adapter/AdapterScript4_v1.js` | `agendarLlamadaProspecto`: crea evento de 30 min en Calendar con nombre, teléfono, interés y notas del prospecto. Requiere despliegue manual en Apps Script. |
| R32-04 | `frontend/admin.html` | Tab "Prospectos" en sidebar (desktop). Sección `sec-prospectos` con formulario (nombre, teléfono, fecha, hora, interés por chips, notas) + lista con estatus editable por dropdown. Badge dorado muestra count de pendientes. |
| R32-05 | `worker/schema.sql` | Tabla `prospectos` agregada. |
| R32-06 | `MASTER_V4.md` | Documenta R32. |

---

### Ronda 31 — Portal de equipo equipo.html (2026-06-02)

> **Migración D1 requerida — ejecutar manualmente:**
> ```bash
> wrangler d1 execute contratos-iav-v4 --remote --command="ALTER TABLE propiedades ADD COLUMN fotos_listas INTEGER DEFAULT 0"
> wrangler d1 execute contratos-iav-v4 --remote --command="ALTER TABLE propiedades ADD COLUMN video_listo INTEGER DEFAULT 0"
> ```

| ID | Archivo | Cambio |
|----|---------|--------|
| R31-01 | `frontend/equipo.html` | Nueva página de solo lectura para el equipo (fotógrafo/camarógrafo). Accesible con el mismo token del portal (`equipo.html?token=<token>`). Muestra: fecha/hora/tipo/paquete/formato de video, dirección + enlace Google Maps, cómo llegar, bloque de acceso/caseta estructurado (método, contacto, indicaciones para guardia, restricciones), archivos de referencia (QR/fachada), entregables, add-ons acordados, link al checklist. Tabs por propiedad si hay más de una. |
| R31-02 | `frontend/equipo.html` | Sección "Estatus de produccion" con botones por propiedad: "Marcar fotos listas" y "Marcar video listo" (solo si el paquete incluye video). Llaman a `POST /api/marcarListos` y actualizan el DOM sin recargar. |
| R31-03 | `worker/src/routes/equipo.js` | Nueva ruta. `obtenerEquipo`: devuelve datos del contrato, propiedades con `datosAcceso` del JSON de `datos_especificos`, add-ons acordados y estatus de produccion (`fotosListas`, `videoListo`). `marcarListos`: actualiza columnas `fotos_listas` / `video_listo` en `propiedades`. |
| R31-04 | `worker/src/index.js` | Importa `handleEquipo`; agrega `RUTAS_EQUIPO = ['obtenerEquipo','marcarListos']`; enruta al handler. |
| R31-05 | `frontend/admin.html` | Botón "Equipo" en la barra de acciones del panel lateral (junto a Portal). Link `equipo.html?token=<token>`. |
| R31-06 | `frontend/admin.html` | Bloque "Portal de equipo" con link copiable + botón WhatsApp en la sección de links del panel lateral (junto al bloque de Checklist). |
| R31-07 | `frontend/admin.html` | Constante `EQUIPO_BASE` agregada. |
| R31-08 | `adapter/AdapterScript4_v1.js` | 2026-06-02 13:22:25 CST: Línea `'Portal de equipo: ...'` agregada en la descripción de eventos Calendar de `procesarFirma`, `primerAbono` y `reagendarPropiedad`. Requiere despliegue manual en Apps Script. |
| R31-09 | `MASTER_V4.md` | Documenta R31. URL `equipo.html` agregada a tabla de URLs. |

---

### Ronda 30 — Rediseño UI bloque acceso/caseta en portal (2026-06-02)

> Sin migración D1. Solo cambios en `frontend/portal.html`.

| ID | Archivo | Cambio |
|----|---------|--------|
| R30-01 | `frontend/portal.html` CSS | `.acceso-btn` (Sí/No, Yo/Otro contacto): `flex:none; min-width:110px` — dejan de estirarse al 100% en desktop. |
| R30-02 | `frontend/portal.html` CSS | `.acceso-detalle`: borde izquierdo dorado, fondo blanco limpio, `margin-top:14px` — mejor separación del campo superior y jerarquía visual clara. |
| R30-03 | `frontend/portal.html` CSS | `.acceso-sep`: nuevo separador horizontal entre grupos de campos (tipo → contacto/método → caseta → punto de encuentro → restricciones). |
| R30-04 | `frontend/portal.html` JS+HTML | "Tipo de inmueble": reemplaza `<select>` por chips, consistente con el resto del formulario. Se mueve al inicio del bloque para contextualizar los campos que siguen. |
| R30-05 | `frontend/portal.html` JS | "¿Dónde nos vemos?" (quitado "o cómo entramos"): chips contextuales por tipo. Casa/privada y condominio horizontal no muestran "afuera del departamento". Departamento agrega "Nos vemos afuera del departamento". Oficina/torre agrega "Nos vemos en recepción" y "Nos vemos en la entrada de la oficina". Al cambiar tipo, si el punto seleccionado no aplica al nuevo tipo se limpia. |
| R30-06 | `frontend/portal.html` JS | Casa/privada: la sección "¿Dónde nos vemos?" se oculta completamente — no aplica. |
| R30-07 | `frontend/portal.html` JS | `restaurarAccesoDesdePayload`: corregida referencia al `<select>` eliminado. Ahora llama a `seleccionarTipoEdificio` para restaurar chips de tipo, re-renderizar chips de punto y mostrar/ocultar sección correctamente. |
| R30-08 | `frontend/portal.html` JS | Compat hacia atrás: `puntoEncuentro: 'directo_departamento'` guardado en registros anteriores se mapea a `'afuera_departamento'` al cargar. |
| R30-09 | `MASTER_V4.md` + `PROMPT_CONTINUIDAD.md` | Documenta regla: trabajar siempre en `main`, sin ramas salvo instrucción explícita de Bruno. |

**Estado del guardado en R30:**
- `requiere_acceso` → columna D1 en `propiedades` ✓
- Todos los campos de acceso → `datos_especificos.acceso` como JSON ✓
- QR/invitación subida → columna `fachada_url` en `propiedades` ✓
- Los campos de tipo de inmueble ya no dependen de un `<select>` — se leen directo de `accesoTipoEdificio[n]` en JS ✓

---

### Ronda 29 — Acceso y caseta detallado en portal (2026-06-02)

> Sin migración D1. `requiere_acceso` sigue como booleano y el detalle se guarda en `datos_especificos.acceso`.

| ID | Archivo | Cambio |
|----|---------|--------|
| R29-01 | `frontend/portal.html` | La sección de privada/caseta ahora despliega campos opcionales cuando el cliente marca "Sí": método de acceso, dueño/contacto autorizado, indicaciones para guardia, contacto de acceso tipo "Yo/Otro", tipo de inmueble, estacionamiento, punto de encuentro, restricciones y comentarios para llegar y entrar. |
| R29-02 | `frontend/portal.html` | El payload de firma conserva `requiereAcceso` como booleano y guarda el detalle estructurado en `datosEspecificos.acceso`; también restaura los campos al volver desde la revisión. |
| R29-03 | `frontend/portal.html` | El resumen previo a firma muestra "Acceso y caseta" cuando aplica. El upload "QR, invitación o referencia de acceso" se movió al bloque condicional de acceso/caseta. |
| R29-04 | `worker/src/routes/portal.js` | `obtenerPortal` devuelve `requiereAcceso` por propiedad para que el portal pueda restaurar el estado guardado. |
| R29-05 | `frontend/admin.html` | La tarjeta de cada propiedad muestra un bloque legible "Acceso y caseta" con los datos capturados, tolerando contratos viejos sin JSON de acceso. |
| R29-06 | `adapter/AdapterScript4_v1.js` | La descripción del evento Calendar agrega el bloque de acceso/caseta en firma, primer abono legacy y reagenda. Requiere desplegar manualmente el adapter en Apps Script para producción. |
| R29-07 | `adapter/AdapterScript4_v1.js` | 2026-06-02 12:11:43 CST: Calendar ahora distingue `contactoAccesoTipo` (`yo` → Cliente, `otro` → contacto capturado) dentro del bloque de acceso/caseta. Requiere despliegue manual en Apps Script. |
| R29-08 | `adapter/AdapterScript4_v1.js` | 2026-06-02 12:14:17 CST: Calendar deja de listar horario especial/elevador y agrega `puntoEncuentro` + `puntoEncuentroDetalle` dentro del bloque de acceso/caseta. Requiere despliegue manual en Apps Script. |

---

### Ronda 28 — Rediseño desktop del picker de formato en portal (2026-06-02)

> Sin cambios de D1, Worker ni adapter. Solo frontend en `portal.html`.

| ID | Archivo | Cambio |
|----|---------|--------|
| R28-01 | `frontend/portal.html` CSS | Picker desktop corregido para evitar textos encimados: más aire interno inicial, contenido en columna flexible y precio separado del copy. |
| R28-02 | `frontend/portal.html` CSS | Cards desktop compactadas después de revisión visual: menor altura mínima, menor padding y menor zona de mockup, manteniendo mobile intacto. |
| R28-03 | `frontend/portal.html` CSS+HTML | Se alinearon las líneas equivalentes "Grabado en vertical" y "Grabado en horizontal" con una clase específica para desktop. |
| R28-04 | `frontend/portal.html` HTML+CSS | Copy simplificado: se quitaron los títulos "Solo redes sociales", "Web o YouTube" y "Los dos formatos"; los canales quedan como primera línea y "Grabado en..." pasa a ser la decisión principal. La tercera opción ahora dice explícitamente "Grabado en ambos formatos". |
| R28-05 | `frontend/portal.html` CSS+HTML | Rediseño final aprobado: cards desktop con retícula fija de 5 filas (gráfico, canales, grabación, nota, precio), textos equivalentes alineados entre cards, notas sin punto inicial y placeholders invisibles de precio en las dos primeras opciones para conservar alineación. |

---

### Ronda 27 — Prompt de continuidad simplificado para Codex (2026-06-02)

| ID | Archivo | Cambio |
|----|---------|--------|
| R27-01 | `PROMPT_CONTINUIDAD.md` | Reescrito como guía corta y directa para trabajar en este repo sin depender de la computadora de Bruno. |
| R27-02 | `PROMPT_CONTINUIDAD.md` | Se eliminaron rutas absolutas obsoletas y se dejó el flujo mínimo: leer `MASTER_V4.md`, editar, verificar, documentar ronda, commit y push a `main`. |
| R27-03 | `PROMPT_CONTINUIDAD.md` | Se agregó un resumen de reglas simples para mantener el proyecto consistente: no emojis, CSS mobile-first, respetar DB/flujo y no tocar el adapter salvo que haga falta. |
| R27-04 | `PROMPT_CONTINUIDAD.md` | Regla agregada: si el objetivo no está claramente definido, Codex debe preguntar en qué se va a trabajar antes de explorar, revisar o cambiar archivos. |

### Ronda 26 — Picker de formato + control en formulario de creación (2026-06-02)

> **Migración D1** — ya ejecutada. Columna `ocultar_formato_video INTEGER DEFAULT 1` agregada a `propiedades`. La columna `formato_video` ya existía desde R18.

| ID | Archivo | Cambio |
|----|---------|--------|
| R26-01 | `frontend/portal.html` CSS | Picker de formato rediseñado: cada opción muestra un preview visual del aspect ratio (rectangulos CSS), label más corto y descriptivo, badge "Recomendado" en Vertical. |
| R26-02 | `frontend/portal.html` JS | `formatosVideo[n]` se inicializa desde `p.formatoVideo`. Si `p.ocultarFormatoVideo === 1` el picker no se renderiza — el cliente no elige. |
| R26-03 | `worker/src/routes/portal.js` | `obtenerPortal` expone `formatoVideo` y `ocultarFormatoVideo` por propiedad. |
| R26-04 | `worker/src/routes/contratos.js` | `crearContrato`: INSERT de propiedades incluye `formato_video` y `ocultar_formato_video`. Nuevo action `guardarFormatoPropiedad` para editar el formato de un contrato ya existente. |
| R26-05 | `frontend/admin.html` HTML+JS | Formulario de nuevo contrato: cada prop-card incluye `<select>` de formato y checkbox "Ocultar selector en portal" (marcado por default). Prop-card del panel lateral muestra formato actual; botón "Formato" permite editarlo post-creación. |

---

### Ronda 25 — Fixes mobile nav, panel sheet y barra de alertas (2026-06-02)

| ID | Archivo | Cambio |
|----|---------|--------|
| R25-01 | `frontend/admin.html` CSS | `#stats-bar` y `.stats-linea`: `display:none !important` global. Bloque desktop `#stats-bar` eliminado. `renderAlertas()` sigue existiendo sin errores JS pero el elemento está permanentemente oculto en desktop y mobile. |
| R25-02 | `frontend/admin.html` CSS | `.panel-header`: eliminado `position:sticky; top:0; z-index:1` en CSS global. El panel mobile (bottom sheet) ahora scrollea completo — el header no flota sobre el contenido. |
| R25-03 | `frontend/admin.html` CSS | `.panel-tabs`: eliminado `position:sticky; top:80px; z-index:1` en CSS global. Los tabs también scrollean con el contenido en mobile. |
| R25-04 | `frontend/admin.html` CSS | Nav mobile restaurado a R18: solo 3 ítems visibles — Contratos / FAB circular / Ajustes. Items extra (Clientes, Paquetes, Estadísticas) marcados con `.bnav-desktop-only { display:none !important }` en mobile, restaurados en desktop con `display:flex !important`. |
| R25-05 | `frontend/admin.html` CSS | `.bnav-item-icon { display:contents }` en mobile — elimina el cuadro de fondo en el bottom nav, dejando solo el ícono directo. En desktop se sobreescribe con `display:flex` + dimensiones + background. |
| R25-06 | `frontend/admin.html` CSS | FAB en mobile: `order:2` para que quede al centro. `.bnav-btn[data-tab="contratos"]` tiene `order:1`, `.bnav-btn[data-tab="ajustes"]` tiene `order:3`. Esto solo afecta el flex-row del bottom nav mobile. |
| R25-07 | `frontend/admin.html` CSS | Desktop: `order:0 !important` en `.bnav-btn` y `.bnav-fab` dentro de `@media (min-width:1024px)` para cancelar los `order` de mobile. |
| R25-08 | `frontend/admin.html` CSS | `.bnav-item-label` en desktop: `font-size:12.5px; text-transform:none; letter-spacing:0.01em; font-weight:500` con `!important` para sobreescribir los estilos mobile (`9px uppercase`). |
| R25-09 | `frontend/admin.html` CSS | Lifecycle pipeline (`.lifecycle`, `.lc-step`, `.lc-dot`, `.lc-label`) movido de `@media (min-width:1024px)` a CSS global — ahora se renderiza correctamente en mobile como pipeline horizontal con dots y líneas. |
| R25-10 | `frontend/admin.html` CSS | `#statsRibbon`, `.filter-chips`, `.search-icon`, `.search-shortcut`, `.toolbar-sep`: `display:none` en CSS global, restaurados en desktop con sus valores correctos. |

---

### Ronda 24 — Stats KPI cards rediseñadas (2026-06-02)

| ID | Archivo | Cambio |
|----|---------|--------|
| R24-01 | `frontend/admin.html` CSS | `.stats-ribbon` cambia de flex horizontal full-bleed a CSS grid 4 columnas con `gap:10px` y `padding:14px 24px` sobre `var(--page)`. Las cards ya no se separan con bordes; flotan sobre el fondo cálido. |
| R24-02 | `frontend/admin.html` CSS | `.stat-card` rediseñada: `background:var(--card)`, `border-radius:10px`, borde sutil `var(--border)`, `flex-direction:column`. Hover con `box-shadow` y `border-color` más oscuro. |
| R24-03 | `frontend/admin.html` CSS | Nueva clase `.stat-head` (`display:flex; justify-content:space-between`) para la fila label + ícono. Ícono movido a esquina superior derecha, reducido a 28px. |
| R24-04 | `frontend/admin.html` CSS | `.stat-label` ahora 10px uppercase con `letter-spacing:0.07em` (antes 10.5px sin transformación). `.stat-value` sube a 22px/800/letter-spacing:-0.5px (antes 18px/700). |
| R24-05 | `frontend/admin.html` CSS | `.stat-delta` rediseñada: `margin-top:5px; display:flex; align-items:center; gap:3px` (antes `margin-left:auto` — empujado a la derecha). |
| R24-06 | `frontend/admin.html` HTML | HTML de las 4 cards reestructurado con `.stat-head` wrapping label + ícono. Íconos actualizados: `ti-camera` (sesiones), `ti-signature` (pendientes firma), `ti-video` (producción), `ti-trending-up` (cobrado). |

---

### Ronda 23 — Sidebar nav items premium (2026-06-02)

| ID | Archivo | Cambio |
|----|---------|--------|
| R23-01 | `frontend/admin.html` CSS | `.bnav-btn` en desktop: `border-radius:6px`, `margin:1px 8px`, `width:calc(100% - 16px)` — nav items como pastillas redondeadas en lugar de barras full-bleed. |
| R23-02 | `frontend/admin.html` CSS | `.bnav-btn.activo`: `font-weight:600` (antes 500 igual que inactivos), `background:rgba(255,255,255,0.09)` (antes 0.07). |
| R23-03 | `frontend/admin.html` CSS | `.bnav-btn.activo::before` ajustada: `left:-8px` para anclar la barra dorada al borde del sidebar, no al borde del item redondeado. |
| R23-04 | `frontend/admin.html` CSS | `.bnav-item-icon`: `background:rgba(255,255,255,0.09)` (antes 0.06) — icon box visible sobre fondo oscuro. |
| R23-05 | `frontend/admin.html` CSS | `.bnav-fab` en desktop: `justify-content:flex-start` (antes `center`), hover `filter:brightness(1.08)` con transición, `border-radius:6px`. |
| R23-06 | `frontend/admin.html` CSS | Nueva clase `.bnav-fab-icon` (18px, dark square `rgba(0,0,0,0.15)`, border-radius 4px) — envuelve el ícono `+` dentro del FAB. |
| R23-07 | `frontend/admin.html` CSS | `.bnav-section-label`: `display:none` global (mobile), `display:block` en `@media (min-width:1024px)`. Spacing top aumentado de 10px a 16px. |
| R23-08 | `frontend/admin.html` HTML | FAB actualizado: `<span class="bnav-fab-icon"><i class="ti ti-plus"></i></span>` + `<span class="bnav-fab-label">`. |

---

### Ronda 22 — Tabla premium + toolbar chips + panel upgrade (2026-06-02)

**Fase A — Tabla premium**

| ID | Archivo | Cambio |
|----|---------|--------|
| R22-A1 | `frontend/admin.html` CSS | Clases de avatar por gradiente: `.av-a` (ámbar) `.av-b` (azul) `.av-c` (rosa) `.av-d` (morado) `.av-e` (verde) `.av-f` (naranja) — asignadas determinísticamente por `charCode % 6`. |
| R22-A2 | `frontend/admin.html` CSS | `.td-status-wrap` / `.td-status-dot` / `.td-status-label` / `.td-status-age` — columna estatus reemplazada: punto de color + label + días transcurridos. |
| R22-A3 | `frontend/admin.html` CSS | `.td-saldo-wrap` / `.td-saldo-val` (rojo/ámbar/verde) / `.saldo-bar-wrap` / `.saldo-bar-fill` — columna saldo con valor coloreado + barra de progreso 2px. |
| R22-A4 | `frontend/admin.html` JS | `renderTabla()` actualizado: avatar usa `avClasses[charCode % 6]` en lugar de `hashColor()`. Status cell con dot + label + age. Saldo cell con porcentaje pagado y color condicional. |

**Fase B — Toolbar chips**

| ID | Archivo | Cambio |
|----|---------|--------|
| R22-B1 | `frontend/admin.html` CSS | `.filter-chips` / `.filter-chip` / `.filter-chip.on` / `.chip-dot` — chips de filtro por estatus que reemplazan el `<select>` en desktop. |
| R22-B2 | `frontend/admin.html` CSS | `.search-wrap` con `.search-icon` (lupa) y `.search-shortcut` (⌘K decorativo). `.toolbar-sep` separador vertical. |
| R22-B3 | `frontend/admin.html` CSS | `#filtro-estatus` y `#btn-filtros-toggle` ocultos en desktop (`display:none !important`). |
| R22-B4 | `frontend/admin.html` HTML | Toolbar reestructurado: search input con ícono incrustado + chips de 5 estados (Pendiente/Firmado/Anticipo/Producción/Entregado) con punto de color. |
| R22-B5 | `frontend/admin.html` JS | Nueva función `toggleChip(btn)` y `getChipEstatus()`. `filtrarContratos()` actualizado para usar chips como filtro primario en desktop. |

**Fase C — Panel upgrade**

| ID | Archivo | Cambio |
|----|---------|--------|
| R22-C1 | `frontend/admin.html` CSS | `.panel-status-pill` con fondo tenue del color del estatus y punto interno `.psp-dot`. |
| R22-C2 | `frontend/admin.html` CSS | `.panel-contact` — fila de contacto (email + teléfono como links) bajo el nombre. |
| R22-C3 | `frontend/admin.html` CSS | `.panel-kpi-row` / `.panel-kpi-card` / `.panel-kpi-label` / `.panel-kpi-val` — 3 KPI cards (Total/Pagado/Saldo). |
| R22-C4 | `frontend/admin.html` CSS | `.panel-pay-progress` / `.panel-pay-bar-bg` / `.panel-pay-bar-fill` — barra de progreso gradiente verde bajo las KPIs. |
| R22-C5 | `frontend/admin.html` CSS | `.panel-action-bar` / `.panel-action-btn` — barra de acciones sticky en la base del panel (Registrar abono / WhatsApp / Portal / Extra). |
| R22-C6 | `frontend/admin.html` CSS | Desktop: panel con `overflow:hidden`, panes activos `display:flex; flex-direction:column`, scroll en el pane (`flex:1; overflow-y:auto; min-height:0`), action bar `position:static`. |
| R22-C7 | `frontend/admin.html` HTML | Panel reestructurado: `#panel-status-pill`, `#panel-contact`, `#panel-kpis`, `#panel-action-bar` como IDs nuevos. `#panel-badge` eliminado. |
| R22-C8 | `frontend/admin.html` JS | `renderPanel()` actualizado: genera pill con color tenue, links de contacto, 3 KPI cards con barra de progreso, action bar con 4 botones. |

---

### Ronda 21 — Fixes visuales desktop post-R19/R20 (2026-06-02)

| ID | Archivo | Cambio |
|----|---------|--------|
| R21-01 | `frontend/admin.html` CSS | Tabla de contratos: `border-collapse:separate; border-spacing:0` + `border-radius:10px` en el wrapper. Filas con `border-bottom` sutil en lugar de `border` completo. |
| R21-02 | `frontend/admin.html` CSS | `.td-avatar` (columna avatar en desktop): 32px, border-radius 50%, gradient dorado por defecto. Solo visible en `≥1024px` vía `.td-avatar-desktop`. |
| R21-03 | `frontend/admin.html` CSS | Left border accent en filas: `border-left: 3px solid var(--row-color)` usando custom property `--row-color` seteada por JS en cada `<tr>` según estatus. |
| R21-04 | `frontend/admin.html` CSS | Panel lateral desktop: `width:var(--panel-w)`, `position:fixed`, `right:0; top:0; bottom:0`, `transform:translateX(100%)` → `translateX(0)` al abrir. |
| R21-05 | `frontend/admin.html` CSS | `#stats-bar` estilizado como topbar: `height:52px`, `background:var(--card)`, `border-bottom:1px solid var(--border)`. |
| R21-06 | `frontend/admin.html` JS | `renderTabla()` agrega columna avatar (`td-avatar-desktop`) y setea `--row-color` en cada `<tr>` usando `ESTATUS_COLOR` map. |
| R21-07 | `frontend/admin.html` JS | `abrirPanel()` actualiza `body.panel-abierto` para que `.contenido` tenga `margin-right:var(--panel-w)` y el contenido no quede tapado. |

---

### Ronda 20 — Sidebar completo + stats delta (2026-06-02)

**Fase A: Sidebar — secciones, nav items y badges**

| ID | Archivo | Cambio |
|----|---------|--------|
| R20-01 | `frontend/admin.html` CSS | Nuevas clases desktop: `.bnav-section-label` (labels de sección en el sidebar), `.bnav-badge` (dorado) y `.bnav-badge.subtle` (gris), `.bnav-user-avatar`, `.bnav-user-name`, `.bnav-user-role` para el footer del sidebar. |
| R20-02 | `frontend/admin.html` HTML | Sidebar `.bnav-inner` reestructurado con 3 secciones: "Principal" (Contratos, Nuevo, Clientes), "Catálogos" (Paquetes), "Reportes" (Estadísticas, Ajustes). |
| R20-03 | `frontend/admin.html` HTML | Badge `#bnav-badge-contratos` (dorado) en ítem Contratos — muestra count de contratos abiertos. Badge `#bnav-badge-clientes` (sutil) en ítem Clientes — muestra total de clientes únicos. |
| R20-04 | `frontend/admin.html` HTML | Footer sidebar `.bnav-logout` actualizado: agrega `.bnav-user-avatar` (IAV), `.bnav-user-info` (nombre + rol), botón logout con solo ícono. |
| R20-05 | `frontend/admin.html` JS | Nueva función `actualizarNavBadges(contratos)` — calcula abiertos y clientes únicos por correo. Solo ejecuta en ≥1024px. Llamada desde `renderTabla()`. |
| R20-06 | `frontend/admin.html` JS | Nueva función `irASubseccion(tab, subtab, btn)` — navega a una sección y subtab en un solo paso, luego marca el ítem del sidebar como activo. Usada por los nuevos nav items (Clientes, Paquetes, Estadísticas). |

**Fase B: Stats ribbon — delta mes actual vs anterior**

| ID | Archivo | Cambio |
|----|---------|--------|
| R20-07 | `frontend/admin.html` CSS | Nueva clase `.stat-delta` (verde, `margin-left:auto`) y `.stat-delta.neg` (rojo) para mostrar variación porcentual. |
| R20-08 | `frontend/admin.html` HTML | Card "Cobrado este mes" agrega `#statDeltaCobrado` con clase `.stat-delta`. |
| R20-09 | `frontend/admin.html` JS | `actualizarStatsRibbon()` refactorizado: `cobrado` ahora filtra por `FechaCreacion` del mes actual (antes sumaba todo el histórico). Calcula `cobradoAnterior` del mes previo. Muestra delta "↑ X%" / "↓ X%" solo si hay datos del mes anterior; oculto si no hay base de comparación. |

---

### Ronda 19 — Rediseño desktop admin v2 (2026-06-02)

**Feature: Layout desktop completo con sidebar, stats ribbon, hoy strip y lifecycle pipeline**

| ID | Archivo | Cambio |
|----|---------|--------|
| R19-01 | `frontend/admin.html` CSS | `@media (min-width: 1024px)` reescrito completo. Variables: `--sidebar-w:224px`, `--panel-w:488px`, `--gold`, `--gold-light`, `--gold-text`, `--ink-1/2/3/4`, `--page:#EFEDE8`, `--sidebar-bg:#0D0D10`. Scrollbar estilizado. |
| R19-02 | `frontend/admin.html` CSS | Sidebar: `.bottom-nav` se convierte en sidebar fija izquierda (224px, fondo `#0D0D10`). Logo con ícono dorado `bnav-logo-icon` gradiente. Botón "Nuevo contrato" full-width dorado. Ítems de navegación con indicador izquierdo dorado en activo. Footer con avatar y botón logout. |
| R19-03 | `frontend/admin.html` CSS | Stats ribbon: 4 cards horizontales (`stats-ribbon`) con íconos coloreados (gold, blue, purple, green). Valores grandes (18px), labels pequeñas. Borde derecho entre cards. |
| R19-04 | `frontend/admin.html` CSS | Hoy strip: sección horizontal con header "Hoy" + fecha, divisor vertical, y `session-card`s scrolleables. Cada card con accent izquierdo del color de estatus, hora, nombre, meta, y badge de estatus con dot. |
| R19-05 | `frontend/admin.html` CSS | Tabla: `#tabla-contratos-card` con header sticky, `--row-color` como borde izquierdo de 3px por estatus. Hover agranda borde a 4px. Fila activa fondo `#FBF9F3`. Columna avatar con círculo de color generado por iniciales. |
| R19-06 | `frontend/admin.html` CSS | Panel lateral: `position:fixed; right:0; top:0; bottom:0; width:488px`. Transición `transform: translateX` 300ms cubic-bezier. Sin overlay. `.main.panel-open` → `body.panel-abierto .contenido { margin-right: var(--panel-w) }`. |
| R19-07 | `frontend/admin.html` CSS | Lifecycle pipeline: 6 pasos horizontales con dots y líneas conectoras. Done = dorado con check. Current = naranja con sombra. Labels debajo. |
| R19-08 | `frontend/admin.html` HTML | Sidebar: `bnav-logo-icon` (IAV), `bnav-logo-marca`, `bnav-logo-sub`. Botón `bnav-fab` con label "Nuevo". Footer con avatar y logout. |
| R19-09 | `frontend/admin.html` HTML | `stats-ribbon` con 4 `stat-card`s: sesiones hoy, pendientes firma, en producción, cobrado este mes. IDs para JS: `statSesionesHoy`, `statPendientesFirma`, `statEnProduccion`, `statCobradoMes`. |
| R19-10 | `frontend/admin.html` HTML | `hoy-strip` con `hoy-header`, `hoy-divider`, `hoy-cards`. Oculto por defecto, JS lo muestra si hay sesiones hoy. |
| R19-11 | `frontend/admin.html` HTML | `lifecycle-wrap` en `panel-header` después de `panel-nombre`. JS lo llena con `renderLifecycle()`. |
| R19-12 | `frontend/admin.html` HTML | Columna avatar en `thead`: `<th class="th-avatar">`. Oculto en mobile con `.th-avatar { display:none }`. |
| R19-13 | `frontend/admin.html` JS | `hashColor(str)`: genera color desde iniciales usando hash multiplicativo módulo 6 colores predefinidos. |
| R19-14 | `frontend/admin.html` JS | `actualizarStatsRibbon(contratos)`: llena los 4 stat cards con datos reales. Sesiones hoy por `FechaSesion`, pendientes por `Estatus.includes('pendiente')`, producción por `Estatus.includes('produccion')`, cobrado suma `PrecioTotal - SaldoPendiente` de completados/liquidados. Solo ejecuta en ≥1024px. |
| R19-15 | `frontend/admin.html` JS | `renderHoyStrip(contratos)`: filtra contratos con `FechaSesion` hoy, renderiza `session-card`s con color de estatus, hora, nombre, paquete y badge. Solo ejecuta en ≥1024px. |
| R19-16 | `frontend/admin.html` JS | `renderLifecycle(estatus)`: genera HTML del pipeline de 6 etapas. Calcula índice del estatus actual. Pasos anteriores = `done` con check dorado. Paso actual = `current` con dot naranja. |
| R19-17 | `frontend/admin.html` JS | `renderTabla()` modificado: agrega `td-avatar-desktop` con iniciales y color via `hashColor()`. Usa `--row-color` (antes `--row-status-color`). Llama `actualizarStatsRibbon(todosContratos)` y `renderHoyStrip(todosContratos)` al final. |
| R19-18 | `frontend/admin.html` JS | `renderPanel()` modificado: después de setear `panel-badge`, busca `.lifecycle-wrap` y le asigna `renderLifecycle(c.Estatus)`. |
| R19-19 | `frontend/admin.html` JS | `panel-abierto` ya existía en `abrirPanel()` y `cerrarPanel()`. Sin cambios necesarios. |
| R19-20 | `frontend/admin.html` JS | Colspans actualizados de 6→7 y 7→8 para acomodar nueva columna avatar. |
| R19-21 | `frontend/admin.html` CSS | `.th-avatar` y `.td-avatar-desktop` ocultos en mobile (`display:none`) para no romper vista de cards. |

**Diseño de referencia:** `mockup-desktop.html` (raíz del repo).  
**Branch:** `claude/determined-hamilton-TMJ0G` → mergeado a `main`.

---

### Ronda 18 — Revisiones de video + preparación para automatización (2026-06-02)

**Feature: Página de revisión de video**

| ID | Archivo | Cambio |
|----|---------|--------|
| R18-01 | `frontend/revision.html` | Nueva página para que el cliente envíe notas de revisión con timecode y descripción. Token desde URL `?token=X`. Muestra aviso de resolución reducida en nube, botón a carpeta Drive, links extra, revisiones anteriores (read-only), y formulario dinámico con filas timecode+descripción. |
| R18-02 | `worker/src/routes/revision.js` | Nueva ruta. `obtenerRevision`: devuelve datos del contrato + array de `revisiones_video`. `guardarRevision`: inserta en `revisiones_video` y llama adapter `notificarRevision` async. |
| R18-03 | `worker/src/index.js` | Importa `handleRevision`; agrega `RUTAS_REVISION = ['obtenerRevision','guardarRevision']`; enruta al handler. |
| R18-04 | `frontend/portal.html` | Agrega botón "Enviar notas de revisión" en etapa de entrega — solo visible cuando hay material disponible y no revocado. Link a `revision.html?token=TOKEN`. |
| R18-05 | `adapter/AdapterScript4_v1.js` | Registra `notificarRevision` en `handlers`. Nueva función que envía a Bruno correo HTML con tabla de timecodes y notas del cliente. |

**Feature: Selector de formato de video en portal (firma)**

| ID | Archivo | Cambio |
|----|---------|--------|
| R18-06 | `frontend/portal.html` CSS | Nuevas clases `.formato-grid`, `.formato-btn`, `.acceso-grid`, `.acceso-btn` para selección visual. |
| R18-07 | `frontend/portal.html` JS | Variables `formatosVideo` y `accesoCaseta` (objeto por propiedad). Inicializados en `renderEtapa1`. Default: `vertical_nativo` / `0`. |
| R18-08 | `frontend/portal.html` JS | `seleccionarFormato(n, valor)`: mapea formato → orientación para compatibilidad con adapter. Llama `actualizarTotales()`. |
| R18-09 | `frontend/portal.html` JS | `seleccionarAcceso(n, valor)`: actualiza estado y clases de botones. |
| R18-10 | `frontend/portal.html` JS | `actualizarTotales()` suma $1,500 por cada propiedad con `doble_nativo`. |
| R18-11 | `frontend/portal.html` JS | `buildAdicionalesSeleccionados()` auto-agrega `{ clave: 'doble-fmt-N', nombre: 'Doble Formato Nativo', precio: 1500, ofrecido: true }` por cada propiedad con `doble_nativo`. |
| R18-12 | `frontend/portal.html` JS | `propsPayload` en `validarYFirmar` incluye `formatoVideo` y `requiereAcceso`. |
| R18-13 | `worker/src/routes/portal.js` | `UPDATE propiedades` en `firmaCliente` guarda `formato_video` y `requiere_acceso`. |

**Feature: Políticas de revisión en portal (checkbox)**

| ID | Archivo | Cambio |
|----|---------|--------|
| R18-14 | `frontend/portal.html` | Checkbox "Entiendo que el servicio contempla máximo 2 rondas de revisiones menores..." en tarjeta de firma. |
| R18-15 | `frontend/portal.html` | `actualizarBtnFirmar()` requiere `chk-politicas` marcado además de firma y términos. |

**Feature: Mejoras al admin (búsqueda + badges)**

| ID | Archivo | Cambio |
|----|---------|--------|
| R18-16 | `frontend/admin.html` | Búsqueda incluye `TelefonoCliente`. Placeholder actualizado. |
| R18-17 | `frontend/admin.html` | Badge rojo `EXPRESS` en tabla de contratos cuando `EntregaExpress` es verdadero. |
| R18-18 | `frontend/admin.html` | Campo "Origen" en acordeón "Datos del cliente" — muestra badge verde WhatsApp o gris Admin. |

**Migraciones D1 ejecutadas (2026-06-02)**

```bash
ALTER TABLE propiedades ADD COLUMN formato_video TEXT DEFAULT 'vertical_nativo'
ALTER TABLE propiedades ADD COLUMN requiere_acceso INTEGER DEFAULT 0
CREATE TABLE IF NOT EXISTS revisiones_video (id INTEGER PRIMARY KEY AUTOINCREMENT, contrato_id TEXT NOT NULL, minuto_segundo TEXT DEFAULT '', descripcion_ajuste TEXT NOT NULL, fecha TEXT NOT NULL)
ALTER TABLE contratos ADD COLUMN origen TEXT DEFAULT 'admin'
```

---

### Ronda 17 — Fechas de entrega estimadas + fixes de auditoría (2026-06-01)

**Feature: Entrega express y fechas estimadas**

| ID | Archivo | Cambio |
|----|---------|--------|
| R17-01 | `schema.sql` | Nueva columna `entrega_express INTEGER DEFAULT 0` en `contratos` |
| R17-02 | `contratos.js` | Nueva acción `actualizarExpress` — actualiza el flag, usa `result.meta.changes` para 404 |
| R17-03 | `index.js` | `actualizarExpress` agregado a `RUTAS_CONTRATOS` |
| R17-04 | `admin.html` | Toggle "Entrega express (1 día natural)" en acordeón Propiedades |
| R17-05 | `admin.html` | Fecha de entrega estimada por tarjeta: sesión + 5 días (estándar) o + 1 día (express) |
| R17-06 | `admin.html` | `calcFechaEntrega(fechaISO, express)` — aritmética local pura (split + `new Date(y,m,d)`) sin conversión UTC |

**Fixes post-auditoría (8 bugs)**

| ID | Archivo | Fix |
|----|---------|-----|
| R17-F1 | `index.js` | `actualizarExpress` faltaba en `RUTAS_CONTRATOS` — siempre retornaba 404 |
| R17-F2 | `contratos.js` | `reagendarPropiedad` valida formato YYYY-MM-DD (inconsistencia con `crearContrato`) |
| R17-F3 | `admin.html` | `guardarExpress` actualiza DOM solo tras API exitoso; revierte checkbox en error |
| R17-F4 | `admin.html` | `calcFechaEntrega` usa `substring(0,10)` para manejar datetime strings con timezone |
| R17-F5 | `contratos.js` | `actualizarExpress` usa `result.meta.changes` en lugar de SELECT+UPDATE innecesario |
| R17-F6 | `admin.html` | `guardarExpress` verifica `tok === tokenActivo` post-await (evita mensaje en panel incorrecto) |
| R17-F7 | `admin.html` | `guardarExpress` usa `setMsg()` helper (estilos ok/error consistentes con el resto) |

---

### Ronda 16 — Corrección masiva de bugs + Folios con sufijo de letra (2026-06-01)

**Bugs corregidos (auditoría pre-E2E)**

| ID | Archivo | Cambio |
|----|---------|--------|
| B-1 | `portal.js` | Verificación de expiración del token de firma movida a `firmaCliente` — ya no bloquea la vista del portal |
| B-2 | `contratos.js` | `TRANSICIONES_BLOQUEADAS`: desde `Pendiente firma` no se puede saltar a producción/entrega; desde `Firmado` no se puede saltar a entrega |
| B-3 | `abonos.js` | Guard: no se puede registrar abono si estatus es `Pendiente firma` |
| B-5 | `contratos.js` | `crearContrato` usa `batch()` atómico — contrato + propiedades + token de portal en una sola transacción |
| B-6 | `abonos.js` | Contrato en `Completado` que recibe abono mantiene `Completado` (no regresa a `Liquidado`) |
| B-7 | `contratos.js` | `guardarEntrega` solo llama adapter si `c.correo_cliente` es truthy |
| B-8 | `portal.js` | Deduplicación de `adicionalesSeleccionados` por clave antes de procesar |
| B-10 | `contratos.js` | `estatusAbiertos` en `listarContratos` incluye `'Completado'` |
| B-12 | `contratos.js` | `revocarEntrega` agrega guards `if (!cr) return err(...)` en ambas ramas |
| B-13 | `contratos.js` | `actualizarCarpeta` solo incluye campo en SET si el valor es truthy |
| A-1 | `admin.html` | `esAd()` maneja `true`, `1` y strings (D1 devuelve enteros, no booleans) |
| A-2 | `admin.html` | Select de estatus incluye opción `'Completado'` |
| A-3 | `admin.html` | Race condition en reload del panel: captura token antes del setTimeout |
| A-4 | `admin.html` | WhatsApp checklist URL usa `esc(c.Token)` |
| P-1 | `portal.html` | `addonsGlobal.push` usa `Object.assign({}, a, ...)` — no muta `portalData` |
| P-4 | `portal.html` | Guard `hasStroke` al inicio de `enviarFirma` — previene submit sin firma dibujada |
| C-1 | `checklist.html` | Migración para formato antiguo: `{completado: bool}` → `{foto, video, t360}` |

**Feature: Folios con sufijo de letra**

| ID | Archivo | Cambio |
|----|---------|--------|
| F-1 | `folios.js` | Nueva función `asignarFolio(db, fecha)` — detecta colisiones por fecha y asigna letra secuencial (A, B, C…). Formato: `IAV-AAMM.DD-A`. |
| F-2 | `contratos.js` | `crearContrato` usa `asignarFolio()` en lugar de `generarFolio()` |
| F-3 | `contratos.js` | `reagendarPropiedad` usa `asignarFolio()` al cambiar fecha de propiedad 1 |

> Folios: si dos clientes tienen la misma fecha, reciben `IAV-2506.15-A` y `IAV-2506.15-B`. Si el cliente A reagenda, su folio cambia pero el B conserva su `-B` permanentemente.

---

### Ronda 15 — Rediseño tab Contratos + Radar de Sesiones (2026-06-01)

| ID | Archivo | Cambio |
|----|---------|--------|
| R15-B1 | `admin.html` `mostrarTab` | Eliminado bloque muerto con referencia a `renderSesionesFuturas` (función removida en sesión anterior, condición `id === 'sesiones'` nunca se cumplía). |
| R15-B2 | `admin.html` `setCiclo` | `document.querySelector('.tabla-card')` → `document.getElementById('tabla-contratos-card')`. Agrega `id="tabla-contratos-card"` al div en HTML. Evita seleccionar el elemento equivocado si hay otras `.tabla-card` antes en el DOM. |
| R15-B3 | `admin.html` `fmxnFecha` | Corregido desfase de zona horaria: `new Date(val)` → `new Date(val + 'T12:00:00')`, igual que `fmxnFechaLarga`. Evitaba que fechas ISO aparecieran un día antes en México (UTC-5/UTC-6). |
| R15-01 | `admin.html` CSS | Eliminados `.ciclo-btn`/`.activo-ciclo` del bloque de Contratos. Nuevas clases: `.contratos-tabs`, `.contratos-tab`, `.activo-ctab`, `.ctab-badge` — tabs con underline dorado y contadores. |
| R15-02 | `admin.html` CSS | Nuevas clases radar: `.radar-strip` (tira horizontal scrolleable), `.radar-pil`, `.radar-pil-hoy` (dorado), `.radar-pil-pronto` (ámbar), `.radar-pil-semana` (azul), `.radar-vacia`. |
| R15-03 | `admin.html` CSS | Nuevas clases de fila: `.tr-ses-hoy` (borde dorado), `.tr-ses-pronto` (borde ámbar), `.tr-ses-semana` (borde azul) — indicadores visuales de proximidad de sesión en tabla. |
| R15-04 | `admin.html` CSS | `.btn-filtros-toggle` con `.filtros-badge` — botón colapsable para filtros de fecha. `.barra-filtros` inicia con `display:none`. |
| R15-05 | `admin.html` HTML `#sec-contratos` | Reemplazado completamente: pill-buttons → tabs con badges (`ctab-sesiones`, `ctab-abiertos`, `ctab-todos`). `#radar-sesiones` insertado entre tabs y toolbar. Filtro de estatus movido a toolbar (siempre visible). Fechas colapsadas detrás de `btn-filtros-toggle`. |
| R15-06 | `admin.html` `setCiclo` | Maneja nuevos tabs (agrega/quita `activo-ctab`). Muestra/oculta radar, oculta botón de fechas en vista sesiones. Llama `renderRadar()` y `actualizarBadgesTabs()`. |
| R15-07 | `admin.html` `filtrarContratos` | Agrega llamadas a `actualizarBadgesTabs()` y `renderRadar()` al final. |
| R15-08 | `admin.html` `renderTabla` | Calcula `diasHastaSesion` por fila; agrega clase `tr-ses-hoy` (0 días), `tr-ses-pronto` (1–2 días), `tr-ses-semana` (3–7 días). |
| R15-09 | `admin.html` `renderStatsBar` | Simplificada de 5 a 3 tarjetas: Facturado, Cobrado, Por cobrar. Eliminadas "Contratos activos" (redundante con badge de tab) y "Sesiones esta semana" (redundante con radar). |
| R15-10 | `admin.html` `toggleFiltros` | Renombrada desde `toggleFiltrosMobile`. Alterna visibilidad de `.barra-filtros` y clase `activo` en botón. Llama `actualizarBadgeFiltros()`. |
| R15-11 | `admin.html` `renderRadar` | Nueva función. Genera píldoras de sesiones próximas (14 días) desde `todosContratos` con estatus abierto. Muestra hasta 20 sesiones ordenadas por fecha. Oculta el strip si no hay sesiones. |
| R15-12 | `admin.html` `actualizarBadgesTabs` | Nueva función. Cuenta contratos por ciclo y actualiza `ctab-badge` en los tres tabs. |
| R15-13 | `admin.html` `actualizarBadgeFiltros` | Nueva función. Muestra badge rojo en `btn-filtros-toggle` cuando hay filtros de fecha activos. |
| R15-14 | `admin.html` `limpiarFiltrosFecha` | Nueva función. Limpia `#filtro-desde` y `#filtro-hasta`, refresca `filtrarContratos()` y `actualizarBadgeFiltros()`. |

### Ronda 14 — Simplificación servicios adicionales + precio modo Personalizado (2026-06-01)

| ID | Archivo | Cambio |
|----|---------|--------|
| R14-01 | D1 remota | `UPDATE paquetes SET Alcance='por_propiedad' WHERE Clave='ADD-EXPRESS'` — ADD-EXPRESS deja de ser caso especial. |
| R14-02 | `admin.html` HTML estático | Eliminado acordeón `#detalles-globales` ("Add-ons del proyecto globales"). |
| R14-03 | `admin.html` HTML estático | Eliminada sección "Servicios ya acordados" global (`#campo-extras-catalogo`, `#lista-extras-acordados`, botón `agregarExtraLibre`). |
| R14-04 | `admin.html` `renderPropCard` | Acordeón por propiedad renombrado a "Servicios adicionales". Sub-sección A: "Opcionales" (checkboxes del catálogo, el cliente los elige en portal). Sub-sección B: "Extras cotizados" (texto libre + precio, ya incluidos en el precio total). `campo-acordados-prop-N` ya no inicia oculto. |
| R14-05 | `admin.html` `renderPropCard` | `#wrap-nombre-N` (modo Personalizado) agrega campo `#prop-precio-custom-N` (número). Al cambiar el precio, llama `precioManual=false; actualizarPrecio()`. |
| R14-06 | `admin.html` `actualizarAddonsProp` | Eliminado filtro `if (p.Alcance === 'global') return false`. ADD-EXPRESS ahora aparece como checkbox normal. |
| R14-07 | `admin.html` `actualizarAcordadosProp` | Simplificada a solo `campo-acordados-prop-N style display:block` — ya no renderiza checkboxes del catálogo. |
| R14-08 | `admin.html` `actualizarPrecio` | Loop `baseTotal`: si `modosNombre[i] === 'custom'`, usa `#prop-precio-custom-N`; si no, usa el paquete seleccionado. Eliminado selector `.extra-acordado-cat-cb:checked` (muerto). |
| R14-09 | `admin.html` `setModoNombre` | Al volver a modo 'paquete': limpia `#prop-precio-custom-N`, llama `precioManual=false; actualizarPrecio()`. |
| R14-10 | `admin.html` `leerEstadoProps` | Agrega `precioCustom` al snapshot. Elimina `acordadosChecked` (ya no hay checkboxes en acordados). |
| R14-11 | `admin.html` `restaurarEstadoProps` | Restaura `precioCustom`. Elimina restauración de `acordadosChecked`. |
| R14-12 | `admin.html` `actualizarPaquetesAdicionales` | Reducida a solo `actualizarPrecio()`. Ya no gestiona add-ons globales. |
| R14-13 | `admin.html` `crearContrato` | Eliminados tres bloques de colección de datos globales: add-ons de `#lista-adicionales`, acordados de `#campo-extras-catalogo`, libres de `#lista-extras-acordados`. |
| R14-14 | `admin.html` `limpiarFormCrear` | Eliminadas referencias a `lista-extras-acordados` y `.extra-acordado-cat-cb`. |
| R14-15 | `admin.html` | Eliminadas funciones muertas `agregarAddonPersonalizado()` y `agregarExtraLibre()`. Eliminado loop `.extra-acordado-cat-cb:checked` en `crearContrato`. |

### Ronda 13 — Toggle Paquete/Personalizado + add-ons globales acordeón + eliminación duplicarContrato (2026-05-31)

| ID | Archivo | Cambio |
|----|---------|--------|
| R13-01 | `admin.html` global | Nueva variable `var modosNombre = {};` — mapea `{ propIdx: 'paquete' \| 'custom' }` para cada propiedad del formulario. |
| R13-02 | `admin.html` `renderPropCard` | "Nombre del servicio" reemplazado por toggle "Paquete base" / "Personalizado" (botones con clase `modo-nombre-btn par-tipo-btn`). En modo paquete: muestra `#wrap-paquete-N` con el select. En modo personalizado: muestra `#wrap-nombre-N` con input de texto libre. Por defecto arranca en "Paquete base". |
| R13-03 | `admin.html` `setModoNombre(num, modo)` | Nueva función. Alterna visibilidad de `wrap-paquete-N` / `wrap-nombre-N`, limpia el campo oculto al cambiar modo, actualiza clases `activo-par` en los botones toggle. |
| R13-04 | `admin.html` `crearContrato` | `paqueteVal` respeta el modo: modo `'custom'` → usa `nombreSvc`; modo `'paquete'` → usa `paqClave \|\| nombreSvc` (comportamiento anterior). |
| R13-05 | `admin.html` `leerEstadoProps` | Agrega `modoNombre: modosNombre[i] \|\| 'paquete'` al snapshot de estado por propiedad. |
| R13-06 | `admin.html` `restaurarEstadoProps` | Restaura `modosNombre[i]` y los wraps de visibilidad y clases de botón desde `s.modoNombre` tras cada re-render. |
| R13-07 | `admin.html` `renderTodasLasProps` | Loop de inicialización `if (!modosNombre[j]) modosNombre[j] = 'paquete'` antes de restaurar estado. Llama `actualizarPaquetesAdicionales()` al final (corregía B3). |
| R13-08 | `admin.html` `quitarPropiedad` | Reindexea `modosNombre` en paralelo a `tiposProp` (`nuevosModos`). Llama `actualizarPaquetesAdicionales()` al final. Corregía bugs B7 y B8. |
| R13-09 | `admin.html` `limpiarFormCrear` | Resetea `modosNombre = {}` al limpiar el formulario. |
| R13-10 | `admin.html` HTML estático | Sección "Add-ons del proyecto" convertida a `<details id="detalles-globales">` acordeón cerrado. |
| R13-11 | `admin.html` `actualizarPaquetesAdicionales` | Oculta `#detalles-globales` cuando `numProps === 1`; al ocultarlo desmarca todos los checkboxes de `#lista-adicionales` para evitar inclusión silenciosa en el payload (corregía B9). |
| R13-12 | `admin.html` `duplicarContrato` | **Eliminada** — función completa (~97 líneas) y botón del panel lateral. No hay referencias remanentes. R12-10 queda obsoleto. |

### Ronda 12 — Add-ons por propiedad + personalizados + acordeón (2026-05-31)

| ID | Archivo | Cambio |
|----|---------|--------|
| R12-01 | `schema.sql` + D1 | Columna `alcance TEXT DEFAULT 'por_propiedad'` en `paquetes`. ADD-EXPRESS = `global`, resto = `por_propiedad`. |
| R12-02 | `portal.js` `obtenerPortal` | Separa `adicionales_json` en `ofertasStrings` / `ofertasObjs` / `acordados`. `paquetesDisponibles` incluye `numPropiedad` para filtrar por propiedad en el frontend. |
| R12-03 | `portal.js` `obtenerPortal` | Add-ons personalizados (`ofrecido: true`) se incluyen en `paquetesDisponibles` como `{ custom: true, nombre, precio }` sin lookup en catálogo. |
| R12-04 | `portal.js` `firmaCliente` | Acepta objetos en `adicionalesSeleccionados` (extrae `.clave`). Add-ons personalizados usan su propio `item.precio` sin DB lookup. |
| R12-05 | `admin.html` `renderPropCard` | Cada card de propiedad tiene secciones `#campo-addons-prop-N` y `#campo-acordados-prop-N` dentro de un `<details>` acordeón cerrado. |
| R12-06 | `admin.html` `actualizarAddonsProp`/`actualizarAcordadosProp` | Filtran add-ons por `alcance = 'por_propiedad'` y por `Tipo` de la propiedad. Preservan filas personalizadas al reconstruir. |
| R12-07 | `admin.html` `actualizarPaquetesAdicionales` | Sección global solo muestra `Alcance = 'global'` (ADD-EXPRESS). + botón "Add-on personalizado". |
| R12-08 | `admin.html` | Botones "+ Add-on personalizado" en sección global y por propiedad. Crean fila con nombre + precio libre. Se preservan al cambiar propiedades. |
| R12-09 | `admin.html` `crearContrato` | Recolecta add-ons per-prop como `{ clave, numPropiedad }` y personalizados como `{ nombre, precio, ofrecido: true }`. Recolecta acordados per-prop. |
| R12-10 | `admin.html` `duplicarContrato` | Restaura add-ons per-prop (ofrecidos + acordados + libres + personalizados) desde `adicionales_json`. |
| R12-11 | `admin.html` `actualizarPrecio` | Suma add-ons per-prop y personalizados (`.addon-libre-precio`). |
| R12-12 | `admin.html` labels | Renombrados: "Add-ons del proyecto" (global), "Add-ons opcionales" (por prop), "Servicios acordados" (por prop). |
| R12-13 | `portal.html` | Estado dividido `adicionalesOnGlobal` + `adicionalesOnProp`. `renderEtapa1` renderiza per-prop en cada card. `toggleAdicion(clave, numProp)`. `buildAdicionalesSeleccionados` devuelve mixto (strings para catálogo global, objetos para per-prop y personalizados). |
| R12-14 | `portal.html` | Polyfill `CSS.escape` para compatibilidad con navegadores viejos. |

### Ronda 11 — Carpetas en firma + reagendar completo + fixes UI (2026-05-31)

| ID | Archivo | Cambio |
|----|---------|--------|
| R11-01 | `adapter` `procesarFirma` | Carpetas Drive, PDF referencias y eventos Calendar ahora se crean al firmar (no al primer abono). Usa fecha de sesión para determinar mes/año de la carpeta. |
| R11-02 | `adapter` `primerAbono` | Corregido: usaba `new Date()` para mes/año — ahora usa `propiedades[0].fecha_sesion`. Queda como fallback legacy. |
| R11-03 | `contratos.js` `reagendarPropiedad` | Captura `folioAnterior` antes del UPDATE; manda `folioNuevo` explícito al adapter. |
| R11-04 | `adapter` `reagendarPropiedad` | Renombra carpeta con `folioNuevo` (antes usaba `contrato.folio` que era el folio viejo). |
| R11-05 | `adapter` `reagendarPropiedad` | Mueve carpeta al mes/año correcto según nueva fecha de sesión. |
| R11-06 | `adapter` `reagendarPropiedad` | Borra PDF referencias anterior (busca por `folioAnterior + " IAV"`) y regenera con nuevo folio. |
| R11-07 | `adapter` `reagendarPropiedad` | Actualiza título del evento Calendar con nuevo folio. |
| R11-08 | `adapter` `reagendarPropiedad` | Actualiza descripción del evento Calendar con nuevo URL de PDF. |
| R11-09 | `portal.html` | Token permanece en la URL (eliminado `history.replaceState`) para poder copiarla/compartirla. |
| R11-10 | `portal.js` `obtenerPortal` | `pkMap` se construye antes de `extrasAcordados` — nombres de adicionales acordados resueltos correctamente (antes mostraba ADD-ASESOR). |
| R11-11 | `portal.js` `obtenerPortal` | `extrasAcordados` incluye campo `entregables` para mostrar descripción en el resumen. |
| R11-12 | `portal.js` `obtenerPortal` | `paqueteBase` y `propiedades[].paquete` resueltos a nombre legible antes de retornar. |
| R11-13 | `portal.html` | Entregables de adicionales acordados visibles en "Resumen de tu servicio". |
| R11-14 | `portal.html` | Lista de servicios incluidos usa puntos (`·`) en lugar de checkmarks SVG. |
| R11-15 | `portal.html` | Split de entregables de adicionales usa `\n` y `\|` (antes solo `\|`). |
| R11-16 | `admin.html` | Correo del cliente ya no es obligatorio al crear contrato — puede llenarlo el cliente en su portal. |

### Ronda 10 — Estatus "Completado" (2026-05-31)

| ID | Archivo | Cambio |
|----|---------|--------|
| R10-01 | `abonos.js` | Cuando saldo llega a 0 y el contrato ya está en "Entregado" → estatus pasa a "Completado" automáticamente |
| R10-02 | `contratos.js` `guardarEntrega` | Si `saldo_pendiente <= 0` al registrar entrega → estatus "Completado"; si hay saldo → "Entregado" |
| R10-03 | `contratos.js` `revocarEntrega` | Revocación desde "Completado" → vuelve a "Liquidado" (pago se conserva) |
| R10-04 | `contratos.js` `actualizarEstatus` | "Completado" en `ESTATUSES_VALIDOS` y `TRANSICIONES_BLOQUEADAS` |
| R10-05 | `contratos.js` `actualizarContratoUpsell` | Upsell que sube precio en "Completado" → vuelve a "Entregado" |
| R10-06 | `contratos.js` `listarContratos` | "Completado" excluido de `estatusAbiertos` — solo aparece en vista "todos" |
| R10-07 | `portal.html` | "Completado" rutea a `actualizarStepper(5) + renderEtapa4()` — igual que "Entregado" |
| R10-08 | `admin.html` | Badge dorado, opción en dropdown, fecha visible |

### Ronda 9 — Auditoría exhaustiva 18 bugs (2026-05-31)

| ID | Severidad | Archivo | Corrección |
|----|-----------|---------|------------|
| B02 | CRÍTICO | `portal.js` | `nuevoEstatus` basado en `saldoPendiente === 0` en lugar de `anticipo >= precioTotal` |
| B03 | CRÍTICO | `portal.js` | `Array.isArray` check movido antes del `DELETE FROM propiedades` |
| B14 | CRÍTICO | `archivos.js` | Query de auth usa `contrato_id = ?` en lugar de `token = ?` — uploads del portal ya funcionan |
| B15 | CRÍTICO | `google.js` | `callAdapterSync` con try/catch y verificación de `res.ok` |
| B05 | FUNCIONAL | `admin.html` | `numPropiedad: pi` agregado al payload de contratos particulares multi-propiedad |
| B07 | FUNCIONAL | `adapter` | Correo de primer abono incluye "Hola [nombre]" |
| B08 | FUNCIONAL | `portal.js` | Entregables de contratos particulares usan `propiedadesFirma[0].entregables` como fallback |
| B09 | FUNCIONAL | `cron.js` | `syncToSheets` con try/catch — errores de D1 no borran tabs de Sheets |
| B17 | FUNCIONAL | `contratos.js` | `reagendarPropiedad` actualiza folio del contrato cuando se cambia fecha de propiedad 1 |
| B18 | FUNCIONAL | `admin.html` | `tipoPaquete` incluido en body de `crearContrato` estándar |
| B19/B27 | FUNCIONAL | `portal.html` + `portal.js` + `adapter` | `fachada_url` y `perimetro_url` guardados en D1 y enviados al adapter para PDF y Calendar |
| B22 | FUNCIONAL | `portal.js` | `guardarResena` permite reseñas con estatus "Liquidado" además de "Entregado" |
| B23 | FUNCIONAL | `adapter` | `reagendarPropiedad` usa `D1.calendar_event_id` como fallback cuando PropertiesService no tiene el valor |
| B10 | MENOR | `adapter` | Segundo loop en `primerAbono` usa `var j` en lugar de reusar `var i` |
| B11 | MENOR | `contratos.js` | Timestamp de notas internas usa `now()` en lugar de `toLocaleString` |
| B12 | MENOR | `portal.html` | Comprobante multi-propiedad distribuye el residuo en la última fila — suma siempre cuadra con el total |
| B21 | MENOR | `portal.html` | `orientaciones = {}` al inicio de `renderEtapa1` evita mezcla de estados en re-renders |
| D1 | — | D1 | Columnas `fachada_url TEXT` y `perimetro_url TEXT` agregadas a `propiedades` |

**Omitidos por diseño:** B01/B13 (orientación oculta + pre-inicializada — intencional), B16 (checklist sin auth admin — producción usa token de contrato sin credenciales).

### Ronda 8 — Paquetes/nombres + 11 fixes (2026-05-31)

| ID | Archivo | Corrección |
|----|---------|------------|
| R8-01 | `portal.js` | Campo `referencias` guardado en D1 al firmar y devuelto en `obtenerPortal` |
| R8-02 | `portal.js` | Adicionales string (claves) resueltos a nombres antes de `procesarFirma` |
| R8-03 | `contratos.js` | `reagendarPropiedad` resuelve clave → nombre antes de llamar adapter |
| R8-04 | `contratos.js` | `obtenerContrato` devuelve paquete como nombre (no clave) en propiedades |
| R8-05 | `contratos.js` | `exportarCSV` resuelve `paquete_base` a nombre |
| R8-06 | `contratos.js` | `actualizarContratoUpsell` resuelve `agregarAdicionales` a nombres para email |
| R8-07 | `contratos.js` | `listarClientes` excluye contratos sin correo del agrupamiento |
| R8-08 | `admin.html` | ~~Correo del cliente obligatorio~~ — revertido en R11-16 |
| R8-09 | `portal.js` + `abonos.js` | Paquete clave → nombre resuelto para `procesarFirma` y `primerAbono` |
| R8-10 | `AdapterScript4_v1.js` | `referencias` aparece en PDF de referencias y en evento Calendar |
| R8-11 | `AdapterScript4_v1.js` | `notificarContratoCreado` eliminado del handler map (código muerto) |
| R8-D1 | D1 | Columna `referencias TEXT` agregada a `propiedades`; `ADD-COMOLLEGAR` entregables actualizados |
| R8-PKG | D1 + seed | Entregables sin paréntesis; Drone separado de Video; `IND-360` con `360°` |

### Ronda 7 — Paquetes nombres (2026-05-31)

| ID | Archivo | Corrección |
|----|---------|------------|
| R7-01 | `portal.js` + `abonos.js` | Paquete clave → nombre antes de cada `callAdapter` (`procesarFirma`, `primerAbono`) |
| R7-02 | D1 + `seed-paquetes.sql` | Entregables sin paréntesis; Drone separado de Video; `IND-360` con `360°` |

### Ronda 6 — Fixes E2E post-deploy (2026-05-30)

| ID | Archivo | Corrección |
|----|---------|------------|
| E1 | `AdapterScript4_v1.js` | Header de correos usa `email-header.png` (igual que v3) en vez de SVG inline con fondo oscuro |
| E2 | `AdapterScript4_v1.js` | Nombres de carpeta de mes usan `01. Enero` (punto) en vez de `01 — Enero` (guion largo) para encontrar carpetas existentes en Drive |
| E3 | `AdapterScript4_v1.js` | PDF de referencias reemplaza copia de Slides por `DocumentApp` generado programáticamente (igual que v3): secciones CLIENTE, SESIÓN, UBICACIÓN, SOBRE LA PROPIEDAD, NOTAS; exportado como PDF y guardado en `Control Interno` |
| E4 | `AdapterScript4_v1.js` | Evento Calendar idéntico a v3: título `{folio} IA {cliente} — {paquete}`, location = maps URL, descripción con Tipo/Paquete, Dirección, Mapa, Orientación, Entregables, Notas, Comentarios del cliente, PDF Referencias, Carpeta Drive, Checklist de rodaje |

### Ronda 5 — Fixes AE2-AE9 (2026-05-30)

| ID | Severidad | Archivo | Correccion |
|----|-----------|---------|------------|
| AE2 | FUNCIONAL | `portal.html` | `apiGet` con AbortController + timeout 15s |
| AE3 | FUNCIONAL | `portal.html` | `firmaCliente` con timeout 30s en apiPost |
| AE4 | FUNCIONAL | `portal.html` | Comprobante multi-propiedad muestra monto por propiedad |
| AE5 | FUNCIONAL | `contratos.js` | `listarContratos` usa subquery para primera propiedad con direccion |
| AE6 | MENOR | `portal.js` | Abonos mapeados a camelCase en `obtenerPortal` |
| AE7 | MENOR | `tokens.js` | Eliminada funcion muerta `crearTokenConfigurar` |
| AE8 | MENOR | `contratos.js` | Eliminada llamada no-op `notificarContratoCreado` al adapter |
| AE9 | MENOR | `admin.html` | Verificado: sin cambio necesario (`carpetaEntregablesUrl` es campo calculado) |

### Ronda 4 — Auditoría exhaustiva (bfe6a4c6) — 18 fixes

| ID | Severidad | Archivo | Corrección |
|----|-----------|---------|------------|
| C1 | CRÍTICO | `stats.js` | `err` agregado al import (craseaba con periodo inválido) |
| C2 | CRÍTICO | `portal.js` | Anti-doble-firma: `WHERE estatus='Pendiente firma'` + check `meta.changes` |
| C3 | CRÍTICO | `portal.js` | `guardarConfiguracion` preserva `carpeta_control_id` y `calendar_event_id` |
| C4 | CRÍTICO | `adapter` + `contratos.js` | `calendar_event_id` ahora se persiste en D1 vía callback |
| C5 | CRÍTICO | `portal.js` | `logoPrecargadoUrl` incluido en `obtenerPortal` |
| C6 | CRÍTICO | `contratos.js` | Validación `precioTotal > 0` en `crearContrato` |
| F1 | FUNCIONAL | `abonos.js` | `totalAbonado` devuelto en `registrarAbono` |
| F2 | FUNCIONAL | `checklist.js` | Columnas configurables: `foto`, `video`, `t360` + migración automática |
| F3 | FUNCIONAL | `abonos.js` | Guard contra `primerAbono` duplicado (verifica `carpeta_control_id`) |
| F4 | FUNCIONAL | `stats.js` | Periodo `"todo"` agregado (sin filtro de fecha) |
| F5 | FUNCIONAL | `adapter` | Link al checklist en descripción del evento Calendar |
| F6 | FUNCIONAL | `portal.js` + `adapter` | `limpiarLinkMaps` implementado en ambos lados |
| F7 | FUNCIONAL | `contratos.js` | Eliminado `crearTokenConfigurar` y `linkConfigurar` (código muerto) |
| M1 | MENOR | `archivos.js` | Body parse movido después de verificación de auth |
| M2 | MENOR | `contratos.js` | Upsell: anticipo no se recalcula si ya es 100% prepago |
| M3 | MENOR | `contratos.js` + `adapter` + `schema.sql` | `carpetaEntregablesUrl` usa `carpeta_entregables_id` con fallback. Nueva columna D1 |
| M4 | MENOR | `adapter` | `reagendarPropiedad`: renombra carpeta Drive + guarda `calendar_event_id` en D1 |
| M5 | MENOR | `checklist.html` | Timeout en polling — **pendiente verificar frontend** |

### Ronda 3 — Worker + Adapter (vbb89f35e)

| Cambio | Archivo | Corrección |
|--------|---------|------------|
| B1 — revocarEntrega + estatus | `contratos.js` | Al revocar, estatus vuelve a `En produccion`. Al re-entregar, vuelve a `Entregado`. |
| B2 — guardarResena valida estatus | `portal.js` | Solo permite reseña si estatus es `Entregado` (error 403 si no). |
| B3 — obtenerChecklist retorna folio/nombreCliente | `checklist.js` | SELECT ahora pide `folio, nombre_cliente`; ambas ramas (template y existente) los incluyen. |
| A1 — comentarios en Calendar | `AdapterScript4_v1.js` | Lee `datos_especificos.comentarios` y lo agrega a la descripción del evento Calendar. |
| A2 — multi-propiedad carpeta D1 | `AdapterScript4_v1.js` | Loop sobre todas las propiedades para actualizar `carpeta_control_id` en D1, no solo la primera. |

### Ronda 2 — Worker + Adapter (v0848fffc)

| Bug | Archivo | Corrección |
|-----|---------|------------|
| Anticipo proporcional inflado en firma | `portal.js` | Mantener anticipo absoluto, `Math.max(0, total - anticipo)` |
| `guardarConfiguracion` sin validación | `portal.js` | `Array.isArray(propsData)` check antes del loop |
| Folio NaN con fecha inválida | `portal.js` | Validación de fecha antes de `generarFolio` |
| Token portal lookup incorrecto | `portal.js` | Agregado `AND usado = 0` a queries |
| Liquidado → En produccion | `contratos.js` | Bloqueada transición en `TRANSICIONES_BLOQUEADAS` |
| String `"false"` bypass forzar | `contratos.js` | `forzarBool` con comparación explícita |
| Configurar token descartado | `contratos.js` | `linkConfigurar` incluido en return |
| JSON.parse crash upsell | `contratos.js` | try-catch con fallback `[]` |
| Servicios con precio=0 ignorados | `contratos.js` | Check `!== undefined` en lugar de `!` |
| Boolean `false` → `null` | `contratos.js` | `??` en lugar de `\|\|` |
| CSV formula injection | `contratos.js` | Prefijo `'` en celdas que empiezan con `=+-@` |
| `subirArchivo` sin auth | `archivos.js` | Validación de token portal o admin key |
| Periodo inválido fallback a 2000 | `stats.js` | Validación contra whitelist |
| Top clientes por nombre | `stats.js` | Agrupar por email |
| `e.postData` null adapter | `AdapterScript4_v1.js` | Guard antes de `JSON.parse` |
| `contrato` undefined en PDF | `AdapterScript4_v1.js` | Guard `if (!contrato) return null` |
| `numPropiedad: 1` hardcodeado | `AdapterScript4_v1.js` | Usar `propiedades[0].num_propiedad` real |
| NaN % en correo PDF | `AdapterScript4_v1.js` | Guard `precio_total > 0` y `anticipo \|\| 0` |
| NaN % en correo abono | `AdapterScript4_v1.js` | Igual fix |
| `numPropiedad` undefined reagendar | `AdapterScript4_v1.js` | Validación y error temprano |

### Ronda 1 — Frontend + Backend (v5947067e)

| Bug | Archivo | Corrección |
|-----|---------|------------|
| CLABE/cuenta faltaban en portal | `portal.js` | Agregados `banco`, `clabe`, `cuenta`, `tarjeta`, `clipLink`, `waLink` en `obtenerPortal` |
| `firmaCliente` no devolvía total/anticipo/folio | `portal.js` | Agregados al return |
| Orientación hidden en portal | `portal.html` | Removido `style="display:none"` |
| Status hardcodeado `'Firmado'` | `portal.html` | Usa `data.estatus` del worker |
| `parseFloat("0")` tratado como falsy | `portal.html` | Cambiado a null-check explícito |
| `errEl` null guard faltante | `portal.html` | Agregado guard |
| NaN en `formatFechaHora` | `portal.html` | Agregado `isNaN` guard |
| Texto "Copiada" vs "Copiado" | `portal.html` | Unificado a "Copiado" |
| Anticipo 50% cuando total=0 | `portal.html` | Default a 0 |
| Abonos con campos lowercase | `admin.html` | Cambiado a PascalCase (`Metodo`, `Fecha`, `Notas`, `Monto`) |
| `AdicionalesJSON` double-parse | `admin.html` | Detecta si ya es array antes de `JSON.parse` |
| Token sin escapar en `onclick` | `admin.html` | Agregado `esc()` |
| `SaldoPendiente` undefined | `admin.html` | Usado `?? 0` |
| `safeHref` retorna `#` | `admin.html` | Cambiado a `''` |
| `codigoError` dentro de string | `contratos.js` | Devuelve JSON estructurado directamente |
| `periodo` faltante en stats | `stats.js` | Agregado al response |

---

## Estado de despliegue actual

| Capa | Versión | Estado |
|------|---------|--------|
| Worker + Frontend | R35 | Mergeado a `main` en `d6b3545`; el push a `main` dispara despliegue por GitHub Actions. |
| D1 Schema | R35 | `schema.sql` completo actualizado. D1 producción ya contiene columnas previas; aplicar `worker/migrations/r35-clientes-trabajos.sql` si faltan tablas CRM. |
| Adapter Apps Script | R35 | Sí hubo cambios en R35: `agendarLlamadaCliente` y sync CRM a Sheets. Sigue pendiente pegar/desplegar manualmente `adapter/AdapterScript4_v1.js` en script.google.com. |

---

## Formato de `adicionales_json`

Cada elemento del array puede ser uno de estos tipos:

| Tipo | Formato | Significado |
|------|---------|-------------|
| Catálogo global ofrecido | `"ADD-EXPRESS"` (string) | Add-on del catálogo, alcance global, el cliente lo ve como opcional |
| Catálogo per-prop ofrecido | `{ clave: "ADD-LANDING", numPropiedad: 1 }` | Add-on del catálogo, ofrecido solo a propiedad 1 |
| Catálogo acordado | `{ clave: "ADD-ASESOR", precio: 500 }` | Ya incluido en el precio, se muestra en resumen (no toggleable) |
| Catálogo acordado per-prop | `{ clave: "ADD-ASESOR", precio: 500, numPropiedad: 1 }` | Acordado para propiedad específica |
| Personalizado ofrecido | `{ nombre: "Tour extra", precio: 2500, ofrecido: true }` | Add-on creado manualmente, el cliente lo ve como opcional |
| Personalizado ofrecido per-prop | `{ nombre: "Tour extra", precio: 2500, ofrecido: true, numPropiedad: 1 }` | Personalizado para propiedad específica |
| Personalizado acordado | `{ nombre: "Limpieza", precio: 800 }` | Servicio libre ya incluido en el precio |
| Personalizado acordado per-prop | `{ nombre: "Limpieza", precio: 800, numPropiedad: 1 }` | Servicio libre por propiedad |

El adapter de Apps Script **no requiere cambios** — ignora `numPropiedad` y `ofrecido`.

---

## Decisiones de diseño — NO implementar

Features descartadas explícitamente. No incluirlas en ningún plan ni sugerirlas en futuras sesiones.

| Feature | Motivo |
|---------|--------|
| Correo a Bruno cuando un cliente firma el contrato | No se quiere. Bruno ve el estado en el admin. |
| Correo del cliente en la descripción del evento Calendar | No se quiere. Solo teléfono y comentarios en Calendar. |
| Recordatorio automático de sesión por correo (cron 24h antes) | No se quiere. El recordatorio manual desde admin es suficiente. |
| `MODO_BORRADOR` en adapter | No necesario en v4. |
| Limpieza automática de tokens viejos en D1 | Volumen no lo justifica. |
| `linkConfigurar` / `configurar4.html` | Eliminado. El admin ya configura propiedades para contratos particulares. |

---

## Pendientes conocidos

- [x] Adapter desplegado (2026-05-30).
- [x] Migraciones D1 de R17 y R18 ejecutadas manualmente (2026-06-02).
- [ ] **Adapter Apps Script:** desplegar nueva versión de `AdapterScript4_v1.js` en script.google.com si aún no se pegó — incluye `notificarRevision` (R18), cambios Calendar de acceso/caseta (R29/R34) y cambios R35 (`agendarLlamadaCliente`, `contratoToken`, `syncBackup` de `Clientes4`/`Trabajos4`/`Actividades4`).
- [x] **Merge a main:** R35 mergeado a `main` en `d6b3545` (2026-06-02 22:41 CST). GitHub Actions debe desplegar a Cloudflare tras el push.
- [ ] **D1 R35:** confirmar/aplicar `worker/migrations/r35-clientes-trabajos.sql` si producción no tiene `clientes`, `trabajos`, `actividades` e índices CRM.
- [ ] `procesarPDFsPendientes` en Apps Script requiere trigger automático — verificar que esté configurado en script.google.com para correr cada minuto.
- [ ] Cuando el correo del cliente está vacío al crear el contrato, no llega ningún correo en la firma. El cliente debe llenarlo en el portal antes de firmar.
- [ ] El folio solo se genera para contratos estándar con fecha de sesión. Contratos particulares no tienen folio hasta configurar la propiedad.

---

## Cómo verificar un commit de Claude o DeepSeek

**Nunca leer los archivos del disco local para verificar un commit remoto.** El disco local puede estar desactualizado.

Método correcto:

```bash
# 1. Traer el commit remoto
git fetch origin <rama>

# 2. Leer el archivo directamente del SHA del commit
git show <sha>:ruta/al/archivo

# Ejemplos:
git show 37c05c4:worker/src/routes/portal.js | grep -n "precio < 0"
git show 37c05c4:frontend/admin.html | grep -n "Entrega guardada"
git show 37c05c4:adapter/AdapterScript4_v1.js | grep -n "notificarContratoCreado"
```

`git show <sha>:archivo` consulta el objeto git del commit directamente — no depende del estado del working tree ni de si se hizo checkout. Es la única fuente confiable para verificar qué contiene un commit específico.

---

## Comandos útiles de mantenimiento

```bash
# Ver contratos recientes
wrangler d1 execute contratos-iav-v4 --remote --command="SELECT folio, nombre_cliente, estatus, fecha_creacion FROM contratos ORDER BY fecha_creacion DESC LIMIT 20"

# Ver tokens activos
wrangler d1 execute contratos-iav-v4 --remote --command="SELECT * FROM tokens WHERE usado=0 ORDER BY rowid DESC LIMIT 10"

# Verificar API
curl -H "X-Admin-Key: framedock" "https://contratos.inmueblesaudiovisuales.com/api/listarContratos"

# Redesplegar
cd "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/worker" && wrangler deploy
```
