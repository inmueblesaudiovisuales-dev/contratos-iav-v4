# Arquitectura y referencia técnica — IAV Contratos v4.0

> Referencia técnica estable del sistema: base de datos, paquetes, flujos, adapter y backup.
> Cambia poco. Para el historial de cambios ve `docs/RONDAS.md`. Para credenciales ve `docs/CREDENCIALES.md`.

---

## Mapa de relaciones (qué habla con qué)

Cómo fluye una petición: **frontend** (`.html`) → `fetch` a `/api/<accion>` → `worker/src/index.js`
enruta la acción al **handler** correspondiente en `worker/src/routes/` → el handler lee/escribe **D1**
y, si hace falta, llama al **adapter** de Apps Script de forma asíncrona (`ctx.waitUntil`, el usuario no espera).

### Frontend → handler del Worker

| Frontend | Para qué sirve | Handler(s) en `worker/src/routes/` | Acciones `/api/` que llama |
|---|---|---|---|
| `admin.html` | Panel de administración (todo el back-office) | `contratos.js`, `abonos.js`, `paquetes.js`, `archivos.js`, `equipo.js`, `clientes.js`, `trabajos.js`, `actividades.js`, `config.js`, `stats.js` | `crearContrato`, `listarContratos`, `obtenerContrato`, `actualizarEstatus`, `guardarEntrega`, `reagendarPropiedad`, `reservarContrato`, `registrarAbono`, `listarPaquetes`, `crearPaquete`, `editarPaquete`, `togglePaquete`, `subirArchivo(Admin/Cliente)`, `listarArchivosCliente`, `obtenerEquipo`, `crearCliente`, `listarClientes`, `obtenerCliente`, `actualizarCliente`, `crearTrabajo`, `listarTrabajos`, `agendarLlamada(Rapida)`, `agregarNota`, `listarActividades`, `marcarActividad`, `obtenerConfig(Admin)`, `guardarConfig` |
| `portal.html` | Portal del cliente: firma, pagos, reseña, revisión | `portal.js`, `archivos.js`, `config.js` | `obtenerPortal`, `firmaCliente`, `guardarResena`, `subirArchivo`, `obtenerConfig` |
| `equipo.html` | Portal de equipo (fotógrafo/camarógrafo): solo lectura + estatus de producción | `equipo.js`, `actividades.js` | `obtenerEquipo`, `marcarProduccion`, `agregarNota` |
| `checklist.html` | Bitácora de producción / checklist de rodaje | `checklist.js`, `actividades.js` | `obtenerChecklist`, `guardarChecklist`, `agregarNota` |
| `revision.html` | Notas de revisión de video del cliente | `revision.js` | `obtenerRevision`, `guardarRevision` |

> `portal.html`, `equipo.html` y `checklist.html` autentican con el **token del contrato** en la URL (`?token=`).
> `admin.html` autentica con el header `X-Admin-Key`. `frontend/checklist-logic.js` es lógica pura (con tests en `checklist-logic.test.js`) que usa `checklist.html`.

### Handler del Worker → D1 → adapter

| Handler (`routes/`) | Tablas D1 que toca | Acciones del adapter que dispara (async) |
|---|---|---|
| `contratos.js` | `contratos`, `propiedades`, `tokens` | `notificarUpsell`, `enviarCorreoEntrega`, `reagendarPropiedad`, `enviarRecordatorioPago` |
| `portal.js` | `contratos`, `propiedades`, `tokens` | `procesarFirma` (→ Drive + PDF + Calendar), `obtenerLogoCliente` |
| `abonos.js` | `abonos`, `contratos` | `enviarCorreoAbono` |
| `revision.js` | `revisiones_video`, `contratos` | `notificarRevision` |
| `equipo.js` | `contratos`, `propiedades` | — (solo lectura/escritura D1) |
| `checklist.js` | `checklist` | — |
| `archivos.js` | `propiedades`, `clientes` | `subirArchivo`, `subirArchivoAdmin`, `subirArchivoCliente`, `listarArchivosCliente` |
| `clientes.js` | `clientes`, `contratos` | — |
| `trabajos.js` | `trabajos`, `clientes`, `contratos` | `agendarLlamadaCliente` |
| `actividades.js` | `actividades`, `trabajos`, `clientes` | `agendarLlamadaCliente` |
| `paquetes.js` | `paquetes` | — |
| `config.js` | `config` | — |
| `stats.js` | `contratos`, `abonos` | — |
| `prospectos.js` | `prospectos` | `agendarLlamadaProspecto` |
| `cron.js` (Cron Trigger horario) | lee todas las tablas | `syncBackup` (→ Sheets) |

> Dos acciones del adapter **no** las dispara un handler directamente: `procesarPDFsPendientes` corre por un **trigger de Apps Script** (cada minuto) y `primerAbono` es **fallback legacy** (ver más abajo).
> El adapter llama de vuelta al Worker (`actualizarCarpeta`, `actualizarCalendarEvent`, `actualizarPdfUrl`) para guardar los IDs de Google en D1.

### Soporte compartido del Worker

| Archivo | Lo usan |
|---|---|
| `index.js` | Entry point: enruta cada acción al handler. Edítalo al **agregar un endpoint nuevo**. |
| `auth.js` | `requireAdmin()`, `ok()`, `err()` — todos los handlers. |
| `db.js` | `query/queryOne/run/batch`, `normalizarTel` — todos los handlers. |
| `tokens.js` | Tokens de portal — `contratos.js`, `portal.js`. |
| `folios.js` | Folios `IAV-YYMM.DD-A` — `contratos.js`. |
| `google.js` | `callAdapter()` async / `callAdapterSync()` — cualquier handler que hable con el adapter. |

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
