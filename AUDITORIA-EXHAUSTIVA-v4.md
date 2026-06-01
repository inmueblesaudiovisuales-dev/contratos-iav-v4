# Auditoría Exhaustiva — IAV Contratos v4.0 vs v3.0

> Fecha: 2026-05-30 · Auditor: Claude  
> Alcance: Worker (todas las rutas), Adapter, Schema D1, Frontend (parcial)  
> Referencia: MASTER_V4.md, ContextoMaster3_v1.md, PROMPT_DEEPSEEK_BUGS.md

---

## CRÍTICOS

### C1 — `stats.js` no importa `err` — `/api/listarStats` crashea con periodo inválido

**Archivo:** `worker/src/routes/stats.js:11`  
**Problema:** `handleStats` usa `err('Periodo no válido', 400)` pero el import solo incluye `query`, `requireAdmin` y `ok`. Si alguien manda `?periodo=invalid`, el Worker lanza `ReferenceError: err is not defined` y el request falla con 500.  
**Fix:** Cambiar `import { requireAdmin, ok } from '../auth.js'` por `import { requireAdmin, ok, err } from '../auth.js'`.

```diff
- import { requireAdmin, ok } from '../auth.js';
+ import { requireAdmin, ok, err } from '../auth.js';
```

---

### C2 — Sin LockService — doble firma puede generar 2 PDFs y 2 correos

**Archivo:** `worker/src/routes/portal.js:firmaCliente`  
**Problema:** v3 usaba `LockService.getScriptLock()` en `accionManejarFirmaCliente3` para prevenir que el doble tap del cliente generara dos PDFs y dos correos. v4 no tiene equivalente. Dos POST rápidos pueden pasar ambos el check `estatus !== 'Pendiente firma'` antes de que alguno haga el UPDATE, generando 2 PDFs, 2 correos al cliente, y potencial inconsistencia de precio.  
**Fix:** Opción A — Cambiar el UPDATE para incluir `WHERE estatus = 'Pendiente firma'` y verificar `result.meta.changes` para saber si realmente se actualizó. Si `changes === 0`, retornar error de que el contrato ya fue firmado. Opción B — Usar `ctx` para almacenar un flag de "procesando" por token (menos robusto porque los Workers son stateless).

```js
// En firmaCliente, cambiar:
await run(db,
  `UPDATE contratos SET estatus=?, ... WHERE token=?`,
  [nuevoEstatus, ..., token]
);
// Por:
const result = await run(db,
  `UPDATE contratos SET estatus=?, ... WHERE token=? AND estatus='Pendiente firma'`,
  [nuevoEstatus, ..., token]
);
if (result.meta.changes === 0) return err('El contrato ya fue firmado', 409);
```

---

### C3 — `guardarConfiguracion` borra `carpeta_control_id` y `calendar_event_id` existentes

**Archivo:** `worker/src/routes/portal.js:228`  
**Problema:** Hace `DELETE FROM propiedades WHERE contrato_token = ?` y re-inserta desde cero. Si el primer abono ya ocurrió (carpetas Drive y eventos Calendar ya existen), `carpeta_control_id` y `calendar_event_id` se pierden al borrar y no se restauran en el INSERT. En v3, `guardarPropiedades3` leía estos IDs antes del DELETE y los preservaba al re-insertar.  
**Fix:** Antes del DELETE, leer los valores existentes de `carpeta_control_id` y `calendar_event_id` por `num_propiedad`. Incluirlos en el INSERT.

```js
// Antes del DELETE:
const { results: propsExistentes } = await query(db,
  'SELECT num_propiedad, carpeta_control_id, calendar_event_id FROM propiedades WHERE contrato_token = ?',
  [contratoToken]
);
const idsPorProp = {};
propsExistentes.forEach(p => {
  idsPorProp[p.num_propiedad] = {
    carpeta_control_id: p.carpeta_control_id,
    calendar_event_id: p.calendar_event_id
  };
});

// En el INSERT, agregar las columnas:
await run(db,
  `INSERT INTO propiedades (contrato_token, num_propiedad, tipo, paquete, entregables,
   fecha_sesion, hora_sesion, datos_especificos, carpeta_control_id, calendar_event_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
  [contratoToken, p.numPropiedad, p.tipo, p.paquete, p.entregables || '',
   p.fechaSesion, p.horaSesion || '',
   idsPorProp[p.numPropiedad]?.carpeta_control_id || null,
   idsPorProp[p.numPropiedad]?.calendar_event_id || null]
);
```

---

### C4 — `calendar_event_id` nunca se persiste en D1 (solo en PropertiesService del adapter)

**Archivos:** `adapter/AdapterScript4_v1.js:primerAbono`, `worker/src/routes/contratos.js`  
**Problema:** El adapter guarda los IDs de eventos Calendar en `PropertiesService.getScriptProperties()` (`cal_${token}_${numProp}`) pero nunca los escribe en D1. El endpoint `/api/actualizarCarpeta` solo actualiza `carpeta_control_id`, no `calendar_event_id`. La columna `calendar_event_id` en la tabla `propiedades` está siempre `NULL`. Si PropertiesService se resetea (poco frecuente pero posible al hacer deploy del adapter), `reagendarPropiedad` no encuentra los eventos y falla silenciosamente.  
**Fix:** (a) Agregar un callback desde el adapter al Worker para guardar `calendar_event_id` en D1 durante `primerAbono`, igual que se hace con `carpeta_control_id`. (b) En `reagendarPropiedad` del adapter, buscar primero en D1 (vía `body.calendarEventId`), luego en PropertiesService como fallback. (c) El Worker debe incluir `calendar_event_id` en la respuesta de `obtenerContrato` para que el admin pueda pasar el ID al reagendar.

---

### C5 — `obtenerPortal` no devuelve `logoPrecargadoUrl` aunque el portal lo espera

**Archivos:** `worker/src/routes/portal.js:obtenerPortal`, `frontend/portal.html:768`  
**Problema:** El portal (`portal.html` línea 768) lee `portalData.logoPrecargadoUrl` para pre-cargar logos de clientes existentes. El handler `obtenerLogoCliente` existe en el adapter, pero `obtenerPortal` en el Worker nunca lo llama ni incluye `logoPrecargadoUrl` en la respuesta. El portal siempre recibe `undefined` y nunca muestra logos precargados. Regresión directa de v3.0.  
**Fix:** En `obtenerPortal`, llamar al adapter y agregar el campo:

```js
const logoData = await callAdapterSync(env, 'obtenerLogoCliente', {
  correo: contratoFinal.correo_cliente
});
// En el return ok({...}), agregar:
logoPrecargadoUrl: logoData?.logoPrecargadoUrl || null,
```

---

### C6 — Sin validación de `precioTotal <= 0` al crear contrato

**Archivo:** `worker/src/routes/contratos.js:87-89`  
**Problema:** `const totalNum = parseFloat(precioTotal) || 0;` permite crear contratos con precio $0 o negativo sin rechazar. Un contrato con `precioTotal=0` pasa directo a `En produccion` al firmar sin pasar por pago. v3 tenía validación explícita de `precioTotal > 0`.  
**Fix:** Agregar después del parse:

```js
if (totalNum <= 0) return err('El precio total debe ser mayor a $0');
```

---

## FUNCIONALES

### F1 — `registrarAbono` no devuelve `totalAbonado`

**Archivo:** `worker/src/routes/abonos.js:76`  
**Problema:** La respuesta solo incluye `nuevoSaldo` y `estatus`. v3 devolvía `totalAbonado` para que el frontend actualice la UI sin recargar el panel. El admin.html probablemente espera este campo para actualizar la barra de progreso de pagos.  
**Fix:** Calcular `totalAbonado` e incluirlo:

```js
const totalAbonado = (abonosPrevios.reduce((s, a) => s + a.monto, 0)) + monto;
return ok({ ok: true, nuevoSaldo, estatus: nuevoEstatus, totalAbonado });
```

---

### F2 — Checklist sin soporte de columnas configurables (foto, video, t360)

**Archivos:** `worker/src/routes/checklist.js`, `frontend/checklist.html`  
**Problema:** v3 soportaba columnas configurables por checklist: `{ foto: boolean, video: boolean, t360: boolean }`. El worker devolvía `{ cuartos, columnas }`. v4 solo tiene `{ nombre, completado }` para cada cuarto (booleano único), sin columnas. El usuario no puede marcar independientemente fotografía, video y 360 por cuarto.  
**Fix:** Ampliar el schema de `cuartos_json` para incluir columnas, o migrar al formato de v3 (`{cuartos, columnas}`). Actualizar `guardarChecklist` y `obtenerChecklist` para aceptar y devolver el objeto `columnas`.

---

### F3 — `primerAbono` no evita eventos Calendar duplicados al re-registrar abono

**Archivo:** `worker/src/routes/abonos.js:35,67`  
**Problema:** Usa `esPrimerAbono` (basado en `abonosPrevios.length === 0`) para decidir si llama `primerAbono`. Si se borra el único abono y se registra otro, `esPrimerAbono` vuelve a ser `true` y `primerAbono` crea carpetas Drive duplicadas y eventos Calendar duplicados. v3 verificaba `!prop.CalendarEventID` antes de crear el evento, y `!prop.CarpetaControlID` antes de crear carpetas.  
**Fix:** Antes de llamar `callAdapter(ctx, env, 'primerAbono', ...)`, verificar si las propiedades ya tienen `carpeta_control_id` o `calendar_event_id`:

```js
const { results: propsCheck } = await query(db,
  'SELECT num_propiedad, carpeta_control_id FROM propiedades WHERE contrato_token = ?',
  [token]
);
const yaTieneCarpeta = propsCheck.some(p => p.carpeta_control_id);
if (!yaTieneCarpeta) {
  callAdapter(ctx, env, 'primerAbono', { ... });
}
```

---

### F4 — `listarStats` falta el periodo `"todo"` (sin filtro de fecha)

**Archivo:** `worker/src/routes/stats.js:10`  
**Problema:** `PERIODOS_VALIDOS = ['mes', 'trimestre', 'anio']`. v3 soportaba también `'todo'` para ver estadísticas de todos los tiempos. El admin.html probablemente tiene un selector con esta opción.  
**Fix:**

```js
const PERIODOS_VALIDOS = ['mes', 'trimestre', 'anio', 'todo'];
// ...
let desde;
if (periodo === 'mes') desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
else if (periodo === 'trimestre') desde = new Date(ahora.getFullYear(), Math.floor(ahora.getMonth() / 3) * 3, 1);
else if (periodo === 'anio') desde = new Date(ahora.getFullYear(), 0, 1);
else desde = null; // 'todo' — sin filtro

// En las queries:
const contratosQuery = desde
  ? query(db, 'SELECT * FROM contratos WHERE oculto = 0 AND fecha_creacion >= ?', [desde.toISOString()])
  : query(db, 'SELECT * FROM contratos WHERE oculto = 0');
```

---

### F5 — Link al checklist de rodaje ausente en descripción del evento Calendar

**Archivo:** `adapter/AdapterScript4_v1.js:primerAbono`  
**Problema:** v3 incluía `Checklist de rodaje: https://inmueblesaudiovisuales.com/checklist.html?token=<token>` en la descripción del evento Calendar, para que Bruno pudiera abrir el checklist directamente desde Google Calendar. v4 no incluye esta línea.  
**Fix:** Agregar al array de `descripcion`:

```js
'Checklist: https://contratos.inmueblesaudiovisuales.com/checklist.html?token=' + token,
```

---

### F6 — `limpiarLinkMaps` no implementado — URLs de Google Calendar embed no se decodifican

**Archivos:** `adapter/AdapterScript4_v1.js`, `worker/src/routes/portal.js`  
**Problema:** v3 tenía `limpiarLinkMaps(url)` para detectar y decodificar URLs envueltas por Google Calendar (`https://www.google.com/url?q=...`). Esto prevenía que los links de Maps se corrompieran al mostrarse en la descripción del evento Calendar. v4 no tiene equivalente. Cuando un cliente pega un link desde Google Maps en el portal, puede llegar envuelto.  
**Fix:** Implementar `limpiarLinkMaps` en el Worker (al guardar `link_maps` en `firmaCliente`) y en el Adapter (al construir la descripción del evento Calendar):

```js
function limpiarLinkMaps(url) {
  if (!url) return url;
  var m = url.match(/[?&]q=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  return url;
}
```

---

### F7 — `crearTokenConfigurar` crea token huérfano en contratos particulares

**Archivo:** `worker/src/routes/contratos.js:134-137`  
**Problema:** Para `tipoContrato === 'particular'`, se crea un token de tipo `configurar` vía `crearTokenConfigurar`. Pero `configurar4.html` fue eliminado del sistema. El token se inserta en la tabla `tokens` y nunca se usa, quedando como registro huérfano. No causa errores, pero es código muerto que acumula basura en D1.  
**Fix:** Remover las líneas 133-136 y la variable `linkConfigurar`. Si se necesita en el futuro, se puede restaurar del historial.

---

## MENORES

### M1 — `subirArchivoAdmin` consume body antes de verificar admin key

**Archivo:** `worker/src/routes/archivos.js:7-8`  
**Problema:** `const body = await request.json();` se ejecuta en el scope superior de `handleArchivos`, para todos los requests, incluso los no autenticados. Si un atacante manda un POST muy grande sin auth, el Worker lo procesa completo antes de rechazarlo.  
**Fix:** Mover el body parse adentro de los bloques `if (action === '...')`, después de la verificación de auth.

---

### M2 — `actualizarContratoUpsell` recalcula anticipo proporcional — en prepago 100% sobra

**Archivo:** `worker/src/routes/contratos.js:213-218`  
**Problema:** En contratos con prepago 100% (`anticipo === precioTotal`), añadir servicios vía upsell sube el anticipo proporcionalmente, aunque el cliente ya pagó todo y no debe nada adicional. El anticipo ajustado queda mayor al precio original. Documentado como conocido en MASTER_V4.  
**Fix:** Solo recalcular cuando el anticipo original no cubría el 100%:

```js
if (precioFinal !== c.precio_total && c.precio_total > 0 && c.anticipo < c.precio_total) {
  const pct = c.anticipo / c.precio_total;
  nuevoAnticipo = Math.round(precioFinal * pct);
}
```

---

### M3 — `obtenerContrato` enlaza a carpeta de Control Interno, no a Entregables

**Archivo:** `worker/src/routes/contratos.js:53-56`  
**Problema:** `carpetaEntregablesUrl` se construye con `carpeta_control_id` directamente: `https://drive.google.com/drive/folders/${carpeta_control_id}`. Esto abre la carpeta "Control Interno", no la carpeta "Entregables" que es la que contiene el material para el cliente. En v3, `obtenerCarpetaEntregablesURL3` derivaba la carpeta "Entregables" desde `CarpetaControlID` (subía al padre y buscaba la subcarpeta cuyo nombre terminara en "Entregables").  
**Fix:** Similar a v3 — derivar la carpeta Entregables, o agregar columna `carpeta_entregables_id` en `propiedades` y un nuevo callback desde el adapter.

---

### M4 — `reagendarPropiedad` no renombra carpetas Drive ni actualiza `calendar_event_id` en D1

**Archivo:** `adapter/AdapterScript4_v1.js:reagendarPropiedad`  
**Problema:** En v3, `accionReagendarPropiedad3` renombraba la carpeta de Drive si el folio o sufijo cambiaba, y actualizaba `CalendarEventID` en Propiedades3. v4 solo actualiza la fecha/hora del evento Calendar y manda correo. No toca Drive ni D1.  
**Fix:** Al reagendar, si el folio cambió, renombrar la carpeta del proyecto. Y actualizar `calendar_event_id` en D1 vía callback al Worker si el evento se recreó.

---

### M5 — Frontend checklist: probablemente sin timeout en `apiGet` (polling)

**Archivo:** `frontend/checklist.html`  
**Problema:** v3 checklist.html usaba AbortController + timeout 10s en las llamadas fetch durante el polling, para evitar requests colgados. v4 checklist.html — no verificado en detalle pero probablemente sin timeout.  
**Fix:** Agregar `AbortController` con timeout de 10s en las funciones `apiGet` del checklist.

---

## CARACTERÍSTICAS v3 PRESENTES EN FRONTEND — NO VERIFICADAS EN v4

Estas features del `admin.html` de v3 requieren revisión directa del HTML de v4 (~3333 líneas). Se listan para verificación manual:

| # | Feature v3 | Qué buscar en `admin.html` v4 |
|---|-----------|-------------------------------|
| V1 | Pestaña "Sesiones" (sesiones futuras agrupadas por día) | Tab o sección con `renderSesionesFuturas()` |
| V2 | Alerta de sesión hoy (banner dorado) | `#alerta-sesion-hoy` |
| V3 | Días en estatus (subtítulo bajo badge) | `diasEnEstatus()` |
| V4 | Icono alerta expiración (60h en Pendiente firma) | Badge warning junto a estatus |
| V5 | Duplicar contrato (botón en panel) | `duplicarContrato()` o botón "Duplicar" |
| V6 | WhatsApp inteligente (mensaje contextual según estatus) | `generarMensajeWhatsApp()` con switch por estatus |
| V7 | 5ta tarjeta métricas (Sesiones esta semana) | Stats bar con 5 cards |
| V8 | Filtros por fecha de creación (desde/hasta) | `#filtro-fecha-desde`, `#filtro-fecha-hasta` |
| V9 | Nota interna por propiedad (botón en prop-card) | `toggleNotaInterna()` o `guardarNotaInterna()` |

---

## RESUMEN

| Severidad | Cantidad | IDs |
|---|---|---|
| CRÍTICO | 6 | C1, C2, C3, C4, C5, C6 |
| FUNCIONAL | 7 | F1, F2, F3, F4, F5, F6, F7 |
| MENOR | 5 | M1, M2, M3, M4, M5 |
| Frontend sin verificar | 9 | V1–V9 |

**Total: 18 bugs/regresiones backend + 9 features frontend sin verificar.**
