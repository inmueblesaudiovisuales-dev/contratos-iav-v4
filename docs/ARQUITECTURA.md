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
| `admin.html` | Panel de administración (todo el back-office) | `contratos.js`, `abonos.js`, `paquetes.js`, `archivos.js`, `equipo.js`, `clientes.js`, `trabajos.js`, `actividades.js`, `config.js`, `stats.js` | Usa prácticamente **todos** los endpoints de admin. Principales: `crearContrato`, `listarContratos`, `obtenerContrato`, `actualizarEstatus`, `guardarProduccion`, `guardarEntrega`, `reagendarPropiedad`, `reservarContrato`, `actualizarContratoUpsell`, `eliminarContrato`, `exportarCSV`, `registrarAbono`, `listarPaquetes(Todos)`, `crear/editar/togglePaquete`, `subirArchivo(Admin/Cliente)`, `listarArchivosCliente`, `obtenerEquipo`, `crear/listar/obtener/actualizarCliente`, `crear/listar/actualizarTrabajo`, `agendarLlamada(Rapida)`, `agregarNota`, `listar/marcarActividad`, `obtenerConfig(Admin)`, `guardarConfig` |
| `portal.html` | Portal del cliente: firma, pagos, reseña, revisión | `portal.js`, `archivos.js`, `config.js` | `obtenerPortal`, `firmaCliente`, `guardarResena`, `subirArchivo`, `obtenerConfig`. En la etapa de entrega consulta `obtenerEntrega` y, si hay galería publicada, redirige a `entrega.html`. |
| `entrega.html` | Galería de entrega "El Estreno" (R113): Estreno, hero con video de Stream, fotos desde Cloudflare Images, 360, Kit, reseña, recontratación | `portal.js` | `obtenerEntrega` (lectura cliente). Las fotos se sirven directo desde `imagedelivery.net` (Cloudflare Images, variantes flexibles). Gestión en admin: `prepararEntrega` (sube fotos a Images + video a Stream), `guardarConfigEntrega`, `publicarEntrega` (en `contratos.js`). Adapter: `prepararCarpetaEntrega`. |
| `equipo.html` | Portal de equipo (fotógrafo/camarógrafo): solo lectura + estatus de producción | `equipo.js`, `actividades.js` | `obtenerEquipo`, `marcarProduccion`, `agregarNota` |
| `checklist.html` | Bitácora de producción / checklist de rodaje | `checklist.js`, `actividades.js` | `obtenerChecklist`, `guardarChecklist`, `agregarNota` |
| `revision.html` | Notas de revisión de video del cliente | `revision.js` | `obtenerRevision`, `guardarRevision` |

> `portal.html`, `equipo.html` y `checklist.html` autentican con el **token del contrato** en la URL (`?token=`).
> `admin.html` autentica con el header `X-Admin-Key`. `frontend/checklist-logic.js` es lógica pura (con tests en `checklist-logic.test.js`) que usa `checklist.html`.

### Handler del Worker → D1 → adapter

| Handler (`routes/`) | Tablas D1 que toca | Acciones del adapter que dispara (async) |
|---|---|---|
| `contratos.js` | `contratos`, `propiedades`, `tokens` | `crearCarpetas`, `crearEventoReservado`, `reagendarPropiedad`, `notificarUpsell`, `enviarCorreoEntrega`, `enviarRecordatorioPago` |
| `portal.js` | `contratos`, `propiedades`, `tokens` | `procesarFirma` (→ Drive + PDF + Calendar), `crearEventoReservado`, `obtenerLogoCliente`, `notificarResena` |
| `abonos.js` | `abonos`, `contratos` | `crearEventoReservado`, `enviarCorreoAbono` |
| `revision.js` | `revisiones_video`, `contratos` | `notificarRevision` |
| `equipo.js` | `contratos`, `propiedades` | — (solo lectura/escritura D1) |
| `checklist.js` | `checklist` | — |
| `archivos.js` | `propiedades`, `clientes` | `subirArchivo`, `subirArchivoAdmin`, `subirArchivoCliente`, `listarArchivosCliente` |
| `clientes.js` | `clientes`, `contratos` | — |
| `trabajos.js` | `trabajos`, `clientes`, `contratos` | `agendarLlamadaCliente`, `crearEventoReservado` |
| `actividades.js` | `actividades`, `trabajos`, `clientes` | `agendarLlamadaCliente` |
| `paquetes.js` | `paquetes` | — |
| `config.js` | `config` | — |
| `stats.js` | `contratos`, `abonos`, `trabajos` | — |
| `cron.js` (Cron Trigger horario) | lee todas las tablas | `syncBackup` (→ Sheets) |

> **No hay handler `prospectos.js`**: la feature de prospectos (R32) quedó absorbida por `clientes.js` / `trabajos.js` / `actividades.js` (R35). En el adapter, `agendarLlamadaProspecto` sobrevive solo como **alias** de `agendarLlamadaCliente`. En `stats.js`/`trabajos.js`, "prospectos" es un **grupo de estatus** del pipeline (`Nuevo`, `En cotizacion`), no una tabla ni una ruta.
>
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
| ~~`prospectos`~~ | **Obsoleta (R32).** Reemplazada por `clientes`/`trabajos`/`actividades` en R35. **No está en `schema.sql`** y el código actual no la usa. Puede existir aún en la D1 de producción como tabla huérfana. "Prospectos" hoy es solo un grupo de estatus del pipeline de `trabajos`. |
| `clientes` | CRM de clientes. PK: `id` (UUID). Columnas: `nombre`, `telefono`, `correo`, `origen`, `notas_perfil`, `fecha_creacion`, `fecha_ultima_actividad`. Agregada en R35. |
| `trabajos` | Pipeline comercial ligado a `clientes`. PK: `id` (UUID). Columnas: `cliente_id`, `estatus`, `interes`, JSON de paquetes/portafolio/propiedades, `presupuesto_estimado`, `notas`, `contrato_token`, fechas. Agregada en R35. |
| `actividades` | Bitácora de llamadas/notas por cliente y trabajo. PK: `id` (UUID). Columnas: `cliente_id`, `trabajo_id`, `tipo`, `descripcion`, `fecha_actividad`, `hora`, `fecha_creacion`. Agregada en R35. |
| `config` | Configuración clave/valor del sistema (ej. datos bancarios `pago_cuenta`/`pago_tarjeta` que lee el portal). Editable desde Ajustes en el admin. Agregada en R58. |

### Nota importante — D1 no soporta foreign keys
`PRAGMA foreign_keys` es ignorado en D1. Las cascadas de eliminación están implementadas manualmente en código con `db.batch()`. Orden real en `eliminarContrato` (`contratos.js`): `revisiones_video` → `checklist` → `propiedades` → `abonos` → `tokens` → `contratos`.

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

Todos los adicionales tienen columna `alcance` en D1. Desde R14, **todos** son `por_propiedad` — ADD-EXPRESS ya no es caso especial. (Nota: `worker/seed-paquetes.sql` aún muestra ADD-EXPRESS como `global` porque es el seed original; la D1 de producción se actualizó a `por_propiedad` por comando directo en R14.)

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
- Selecciona adicionales si los hay, llena datos (formato de video, acceso/caseta), dibuja firma → `POST /api/firmaCliente`
- Worker actualiza contrato en D1: estatus → **"Firmado"**. **Modelo de saldo (R60):** el anticipo es un primer pago *sugerido*, no un pago hecho — firmar **NO** resta el anticipo del saldo. El `saldo_pendiente` queda igual al `precio_total` y solo baja con abonos reales.
- Protección anti-doble-firma: `WHERE token=? AND estatus='Pendiente firma'` + check `meta.changes`
- **Async:** Apps Script guarda la firma en Drive, registra un PDF pendiente en PropertiesService
- **Async (mismo call):** Apps Script crea carpetas Drive (año/mes de la sesión, no de hoy) para TODAS las propiedades, genera PDF de referencias y eventos Calendar; llama de vuelta al Worker con `carpetaControlId`, `carpetaEntregablesId`, `calendarEventId`
- **Async:** `procesarPDFsPendientes` (trigger cada minuto) genera el PDF desde template de Google Docs con firma insertada, lo adjunta en un email y lo manda al cliente

### 3. Primer abono
- Bruno registra el abono en admin → `POST /api/registrarAbono`
- Worker baja el `saldo_pendiente` en D1 y ajusta estatus: **"Reservado"** en el primer abono o pago parcial; **"Completado"** si el saldo llega a 0 (no regresa de un estatus más avanzado)
- Si el abono activa "Reservado" por primera vez, dispara `crearEventoReservado` (Calendar)
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
| `procesarFirma` | Guarda firma PNG en Drive, registra PDF pendiente; **crea carpetas Drive (año/mes de la sesión) + PDF referencias + eventos Calendar** para todas las propiedades; llama Worker `actualizarCarpeta` + `actualizarCalendarEvent` |
| `crearCarpetas` | Crea/garantiza la carpeta Drive del contrato (idempotente, helper `getOrCreateFolder_`). La dispara `contratos.js`. |
| `crearEventoReservado` | Crea un **marcador de 30 min en Calendar para hoy** ("Reservado — {nombre}", texto neutral con tel + URL de equipo) al reservar/abonar **sin afirmar pago**. La disparan `contratos.js` (`reservarContrato`), `abonos.js`, `portal.js`, `trabajos.js`. |
| `procesarPDFsPendientes` | Genera PDF desde template, envía al cliente, llama Worker `actualizarPdfUrl`. **Corre por trigger de Apps Script cada minuto, no por un handler.** |
| `primerAbono` | **Legacy fallback** — solo se ejecuta si el contrato no tiene `carpeta_control_id` (firmado antes de Ronda 11). Igual que `procesarFirma` pero para contratos viejos. Usa fecha de sesión (no hoy) para el mes de carpeta. |
| `enviarCorreoAbono` | Correo HTML de confirmación de pago al cliente |
| `enviarRecordatorioPago` | Correo HTML de recordatorio de saldo al cliente |
| `reagendarPropiedad` | Actualiza fecha/hora del evento Calendar; actualiza **título** (con nuevo folio, separador ` · `) y **descripción** (bloque estándar: tipo/paquete, dirección, mapa, cómo llegar, portal de equipo); **renombra carpeta** con nuevo folio; **mueve carpeta** al mes/año correcto según nueva fecha; **borra PDF referencias anterior** y **regenera** con nuevo folio; llama Worker `actualizarCalendarEvent`; envía correo de reagendamiento al cliente |
| `enviarCorreoEntrega` | Correo HTML de entrega al cliente |
| `notificarUpsell` | Correo HTML de servicios adicionales |
| `subirArchivo` | Sube archivo a carpeta de propiedad (desde portal) |
| `subirArchivoAdmin` | Sube archivo a carpeta (desde admin) |
| `subirArchivoCliente` / `listarArchivosCliente` | Sube/lista archivos en la carpeta del cliente en Drive (carpeta "Clientes/{nombre — id}"). Las dispara `archivos.js`. |
| `syncBackup` | Sobreescribe tabs en Sheets con datos de D1 (lo dispara `cron.js`) |
| `agendarLlamadaCliente` | Crea evento de 30 min en Calendar para una llamada con el cliente/prospecto. La disparan `actividades.js` y `trabajos.js`. `agendarLlamadaProspecto` es un **alias** de esta misma función. |
| `obtenerLogoCliente` | Busca logo precargado del cliente en Drive |
| `notificarRevision` | Correo HTML a Bruno con tabla de timecodes y notas de revisión del cliente (R18) |
| `notificarResena` | Correo HTML a Bruno cuando un cliente deja una reseña. La dispara `portal.js` (`guardarResena`). |

### Callbacks del adapter al Worker
Apps Script llama de vuelta al Worker para guardar IDs de Google en D1:
- `POST /api/actualizarCarpeta` — guarda `carpeta_control_id` y `carpeta_entregables_id` en `propiedades`
- `POST /api/actualizarCalendarEvent` — guarda `calendar_event_id` en `propiedades`
- `POST /api/actualizarPdfUrl` — guarda `pdf_contrato_url` en `contratos`

---

## Backup automático

Un Cron Trigger de Cloudflare (`"0 * * * *"`) ejecuta `syncToSheets()` cada hora (`:00`). Sincroniza **7 tablas** (`contratos`, `abonos`, `propiedades`, `paquetes`, `clientes`, `trabajos`, `actividades`) al Sheets de backup (ver `docs/CREDENCIALES.md`) en tabs: `Contratos4`, `Abonos4`, `Propiedades4`, `Paquetes4`, `Clientes4`, `Trabajos4`, `Actividades4`.

Pérdida máxima de datos si Cloudflare falla: 1 hora.

---

## Diferencias clave con v3.0

Ver la tabla comparativa en `docs/PROYECTO.md` → "Diferencias clave con v3.0".

---

---

## Despliegue y migraciones

| Capa | Cómo se despliega |
|------|-------------------|
| Worker + Frontend | Push a `main` → GitHub Actions corre `wrangler deploy` (~1 min). Nunca a mano. |
| D1 (schema) | `worker/schema.sql` es la referencia. Los cambios reales se aplican con migraciones manuales en `worker/migrations/*.sql` vía `wrangler d1 execute ... --remote --file=...`. Migraciones existentes: `r35-clientes-trabajos.sql`, `r36-v5-schema.sql`, `r37-backfill-trabajos.sql`, `r58-rediseno.sql`. |
| Adapter Apps Script | **Manual:** Bruno pega `adapter/AdapterScript4_v1.js` en script.google.com y publica nueva versión. Obligatorio cada vez que cambie el adapter (ver REGLA DEL ADAPTER en `CLAUDE.md`). |

> El estado "última versión desplegada" no se documenta aquí porque caduca: la fuente de verdad es el historial de `git log` en `main` y la última entrada de `docs/RONDAS.md`.

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

## Pendientes y gotchas conocidos

Comportamientos vigentes a tener en cuenta (no son bugs, son limitaciones de diseño):

- **El adapter requiere despliegue manual** tras cada cambio (ver REGLA DEL ADAPTER en `CLAUDE.md`). Si algo que toca Drive/Calendar/correos "no pasa", el primer sospechoso es que la última versión del adapter no se publicó en script.google.com.
- **`procesarPDFsPendientes` depende de un trigger de Apps Script** (cada minuto). Si no se generan/envían PDFs, verificar que el trigger siga activo en script.google.com.
- **Correo vacío al crear contrato:** si el cliente no tiene correo al crearse el contrato, no llega correo al firmar. El cliente debe llenarlo en el portal antes de firmar.
- **Folio:** solo se genera para contratos estándar con fecha de sesión. Los contratos particulares no tienen folio hasta configurar la propiedad.
- **Migraciones D1 son manuales:** al agregar columnas/tablas hay que correr la migración en remoto; el push a `main` no toca D1.
- **Modo guiado de tomas (checklist):** capa opt-in sobre `checklist.html` con biblioteca/resolver/config/IA y export enriquecido (`version:1` intacto). La biblioteca global vive en la tabla `config` (clave `guia_config`); se edita en `checklist.html?config=1` (admin). El adapter `registrarUsoTomas` (buzón al Sheet `UsoTomas`) **requiere despliegue manual**. Detalle y estado en `docs/MODO_GUIADO_HANDOFF.md`.

> Esta lista es de limitaciones estables. Los pendientes puntuales de cada cambio viven en su entrada de `docs/RONDAS.md`.

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

# Verificar API (la clave admin está en docs/CREDENCIALES.md)
curl -H "X-Admin-Key: <clave-admin>" "https://contratos.inmueblesaudiovisuales.com/api/listarContratos"

# Desplegar: NO se corre wrangler deploy a mano. Solo push a main:
git push origin main   # GitHub Actions hace el deploy
```
