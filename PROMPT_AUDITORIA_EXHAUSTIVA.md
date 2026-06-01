# Prompt — Auditoría exhaustiva del sistema IAV Contratos v4.0

Eres un auditor de software senior especializado en sistemas web fullstack. Tu tarea es hacer una auditoría exhaustiva del sistema de contratos de Inmuebles Audiovisuales v4.0 y generar un reporte con todos los bugs, regresiones, y problemas encontrados.

## Contexto del sistema

Sistema de gestión de contratos para una productora audiovisual inmobiliaria. Reconstruido desde cero sobre Cloudflare Workers + D1 (antes Google Apps Script + Sheets).

**Arquitectura de 3 capas:**
1. **Cloudflare Worker** — backend API + assets estáticos (JS ES modules)
2. **Frontend HTML** — 3 archivos HTML vanilla con `<script>` inline (sin build step, sin frameworks)
3. **Adapter Google Apps Script** — 1 archivo JS monolítico (sin `import`/`export`) que maneja Drive, Calendar, Gmail, PDFs

**Flujo principal:**
- Admin crea contrato → genera token de portal
- Cliente firma en portal → se genera PDF diferido y se envía por correo
- Admin registra abonos → primer abono crea carpetas Drive + eventos Calendar
- Admin gestiona producción y entrega → cliente recibe correos HTML

### URLs de producción

| Recurso | URL |
|--------|-----|
| Admin | `https://contratos.inmueblesaudiovisuales.com/admin.html` |
| Portal | `https://contratos.inmueblesaudiovisuales.com/portal.html?token=<token>` |
| Checklist | `https://contratos.inmueblesaudiovisuales.com/checklist.html?token=<token>` |
| API | `https://contratos.inmueblesaudiovisuales.com/api/<accion>` |

### Credenciales
- Admin key: `framedock` (Header `X-Admin-Key` o query param `adminKey`)
- D1 database: `contratos-iav-v4` (Cloudflare account: `inmueblesaudiovisuales@gmail.com`)

### Convenciones importantes
- D1 usa snake_case. El frontend `admin.html` tiene función `d1ToPascal()` que convierte a PascalCase (ej. `carpeta_control_id` → `CarpetaControlId`). El frontend `portal.html` espera camelCase del Worker (el Worker mapea manualmente)
- D1 NO soporta `PRAGMA foreign_keys` — las cascadas son manuales con `db.batch()`
- El adapter se llama de forma asíncrona (`ctx.waitUntil`) — el usuario no espera respuesta
- No hay build step. Los HTML son servidos directamente por el Worker como assets estáticos
- No uses `import`/`export`/`require` en el adapter (es Google Apps Script vanilla)

---

## Archivos a auditar

### Worker (`worker/src/`)
1. `index.js` — entry point, router con `RUTAS_CONTRATOS`, `RUTAS_PORTAL`, etc.
2. `auth.js` — `requireAdmin()`, `ok()`, `err()`
3. `db.js` — `query()`, `queryOne()`, `run()`, `batch()`, `uuid()`, `now()`, `parseFecha()`
4. `tokens.js` — `crearTokenPortal()`, `crearTokenConfigurar()`, `refrescarExpiry()`, `marcarUsado()`
5. `folios.js` — `generarFolio()` → "IAV-YYMM.DD"
6. `google.js` — `callAdapter()` async, `callAdapterSync()` sync
7. `cron.js` — `syncToSheets()` backup horario
8. `routes/contratos.js` — ~25 endpoints admin (crear, listar, upsell, entrega, reagendar, etc.) + callbacks adapter
9. `routes/portal.js` — `obtenerPortal`, `firmaCliente`, `guardarResena`, `guardarConfiguracion`
10. `routes/abonos.js` — `registrarAbono`, `listarAbonos`
11. `routes/paquetes.js` — CRUD catálogo
12. `routes/stats.js` — métricas por periodo
13. `routes/checklist.js` — `obtenerChecklist`, `guardarChecklist`
14. `routes/archivos.js` — `subirArchivo`, `subirArchivoAdmin`

### Frontend (`frontend/`)
15. `admin.html` — panel de administración (~3333 líneas)
16. `portal.html` — portal del cliente (~2108 líneas)
17. `checklist.html` — checklist de rodaje

### Adapter
18. `adapter/AdapterScript4_v1.js` — Apps Script (727 líneas)

### Documentación
19. `MASTER_V4.md` — documento master del sistema
20. `AUDITORIA-EXHAUSTIVA-v4.md` — auditoría previa con bugs encontrados
21. `PROMPT_DEEPSEEK_BUGS.md` — historial de bugs corregidos en rondas anteriores
22. `schema.sql` — estructura D1

---

## Base de datos (D1)

```sql
-- contratos: 37 columnas
contratos (token PK, folio, nombre_cliente, correo_cliente, telefono_cliente,
  tipo_contrato, tipo_paquete, paquete_base, adicionales_json, precio_base, precio_total,
  anticipo, saldo_pendiente, estatus, fecha_creacion, fecha_firma, fecha_ultimo_abono,
  fecha_entrega, firma_base64_url, entrega_drive_link, entrega_links_extra,
  num_propiedades, pdf_contrato_url, notas_contrato, oculto, notas_internas,
  sesion_completada, recordatorio_enviado, calificacion, resena_texto,
  fotografia_lista, video_listo, recorrido_listo, recorrido_url, entrega_revocada)

-- propiedades: 16 columnas
propiedades (contrato_token, num_propiedad PK compuesta, tipo, paquete, entregables,
  fecha_sesion, hora_sesion, direccion, link_maps, orientacion, sobre_la_propiedad,
  datos_especificos, logo_url, carpeta_control_id, calendar_event_id, carpeta_entregables_id, nota_interna)

-- tokens: 5 columnas
tokens (token PK, contrato_id, tipo, expira, usado)

-- abonos: 7 columnas
abonos (id PK, contrato_token, monto, metodo, fecha, fecha_registro, notas)

-- paquetes: 8 columnas (catálogo)
paquetes (clave PK, tipo, nombre, precio, es_adicional, entregables, activo, orden)

-- checklist: 4 columnas
checklist (contrato_token PK, cuartos_json, fecha_creacion, fecha_actualizacion)
```

### Estatus válidos
`Pendiente firma` → `Firmado` → `Anticipo recibido` → `En produccion` → `Entregado` → `Liquidado`

---

## Instrucciones de auditoría

### Fase 1: Verificación de fixes anteriores (18 bugs de Ronda 4)

Verifica que cada uno de estos bugs esté CORRECTAMENTE arreglado en el código fuente actual. Para cada uno, lee el archivo correspondiente, verifica que el fix esté presente y que no haya efectos secundarios:

1. **C1** — `worker/src/routes/stats.js`: ¿`err` está en el import? ¿El código usa `err()` sin crashear?
2. **C2** — `worker/src/routes/portal.js` `firmaCliente`: ¿El UPDATE incluye `AND estatus='Pendiente firma'`? ¿Se verifica `result.meta.changes`?
3. **C3** — `worker/src/routes/portal.js` `guardarConfiguracion`: ¿Se preservan `carpeta_control_id` y `calendar_event_id` al reconfigurar?
4. **C4** — `adapter/AdapterScript4_v1.js` `primerAbono`: ¿Se hace callback a `/api/actualizarCalendarEvent` tras crear evento? ¿El endpoint existe en `contratos.js`?
5. **C5** — `worker/src/routes/portal.js` `obtenerPortal`: ¿Se llama `obtenerLogoCliente`? ¿El response incluye `logoPrecargadoUrl`?
6. **C6** — `worker/src/routes/contratos.js` `crearContrato`: ¿Hay validación `precioTotal > 0`?
7. **F1** — `worker/src/routes/abonos.js` `registrarAbono`: ¿Se calcula y devuelve `totalAbonado`?
8. **F2** — `worker/src/routes/checklist.js`: ¿El formato es `{cuartos, columnas}`? ¿Hay migración de datos viejos?
9. **F3** — `worker/src/routes/abonos.js`: ¿Hay guard contra re-llamada a `primerAbono`?
10. **F4** — `worker/src/routes/stats.js`: ¿El periodo `"todo"` existe y funciona sin filtro de fecha?
11. **F5** — `adapter/AdapterScript4_v1.js` `primerAbono`: ¿La descripción del evento Calendar incluye link al checklist?
12. **F6** — `worker/src/routes/portal.js` + `adapter/AdapterScript4_v1.js`: ¿Existe `limpiarLinkMaps` en ambos lados? ¿Se aplica al guardar y al mostrar?
13. **F7** — `worker/src/routes/contratos.js`: ¿Se eliminó `crearTokenConfigurar` de `crearContrato`? ¿El import ya no lo incluye?
14. **M1** — `worker/src/routes/archivos.js`: ¿`request.json()` se ejecuta después de la verificación de auth?
15. **M2** — `worker/src/routes/contratos.js` `actualizarContratoUpsell`: ¿El recálculo de anticipo tiene guard `c.anticipo < c.precio_total`?
16. **M3** — `worker/src/routes/contratos.js` `obtenerContrato`: ¿`carpetaEntregablesUrl` prefiere `carpeta_entregables_id`? ¿La columna existe en D1? ¿El adapter la envía?
17. **M4** — `adapter/AdapterScript4_v1.js` `reagendarPropiedad`: ¿Se renombra carpeta Drive si cambió folio? ¿Se hace callback a `actualizarCalendarEvent`?
18. **M5** — `frontend/checklist.html`: ¿Las llamadas fetch tienen timeout con AbortController?

### Fase 2: Verificación de features v3.0 en frontend

Revisa `frontend/admin.html` y verifica si estas features de v3.0 están presentes. Para cada una, indica si existe, si funciona, o si está rota:

| # | Feature | Qué buscar |
|---|---------|------------|
| V1 | Pestaña "Sesiones" | `renderSesionesFuturas()` o sección de sesiones agrupadas por día |
| V2 | Alerta sesión hoy | `#alerta-sesion-hoy` o banner dorado |
| V3 | Días en estatus | `diasEnEstatus()` o subtítulo con días |
| V4 | Alerta expiración | Badge warning 60h en Pendiente firma |
| V5 | Duplicar contrato | `duplicarContrato()` o botón "Duplicar" |
| V6 | WhatsApp inteligente | `generarMensajeWhatsApp()` con switch por estatus |
| V7 | 5ta tarjeta métricas | Sesiones esta semana en stats bar |
| V8 | Filtros por fecha | `#filtro-fecha-desde`, `#filtro-fecha-hasta` |
| V9 | Nota interna por propiedad | `toggleNotaInterna()` o `guardarNotaInterna()` en prop-card |

### Fase 3: Auditoría general de bugs

Revisa TODO el código en busca de:

1. **Errores de lógica**: condiciones invertidas, casos no manejados, race conditions
2. **Errores de datos**: campos ausentes en queries/responses, tipo de dato incorrecto, JSON.parse sin try-catch
3. **Errores de seguridad**: endpoints sin auth, inyección SQL (aunque D1 usa prepared statements), exposición de datos sensibles
4. **Regresiones**: features de v3.0 ausentes o rotas
5. **Edge cases**: contratos con 0 propiedades, múltiples propiedades, montos negativos, strings vacíos, null/undefined
6. **Consistencia**: mismatch entre lo que envía el Worker y lo que espera el frontend, mismatch entre Worker y adapter
7. **Validación**: campos requeridos no validados, datos que deberían rechazarse
8. **Errores de import/export**: funciones usadas pero no importadas, imports no usados
9. **Formato de respuesta**: endpoints que no siguen el patrón `ok({...})` / `err('mensaje', código)`

### Fase 4: Flujos end-to-end

Traza mentalmente estos flujos completos y verifica que no haya huecos:

1. **Crear contrato estándar → firmar → primer abono → entregar**: ¿Cada paso actualiza D1 correctamente? ¿Los callbacks al adapter tienen todos los datos?
2. **Contrato particular**: ¿Funciona sin tokenConfigurar? ¿El admin puede configurar propiedades?
3. **Multi-propiedad**: ¿Carpetas Drive, eventos Calendar, y D1 se crean para todas las propiedades?
4. **Reagendar**: ¿Se actualiza D1, Calendar, Drive, y se notifica al cliente?
5. **Upsell**: ¿Se recalcula precio, anticipo, y saldo correctamente? ¿El cliente recibe notificación?
6. **Portal del cliente**: ¿Se muestran abonos, adicionales, logo precargado, datos bancarios?

---

## Formato del reporte

Estructura tu reporte así:

```markdown
# Reporte de Auditoría — IAV Contratos v4.0

## 1. Verificación de fixes Ronda 4
| # | Fix | Estado | Observaciones |
|---|-----|--------|---------------|
| C1 | err import | ✅/❌ | ... |

## 2. Features v3.0 en frontend
| # | Feature | ¿Existe? | ¿Funciona? | Detalle |
|---|---------|----------|------------|---------|

## 3. Bugs nuevos encontrados
### CRÍTICOS
| ID | Archivo:línea | Descripción | Fix sugerido |
|----|---------------|-------------|--------------|

### FUNCIONALES
...

### MENORES
...

## 4. Problemas de consistencia
(Worker↔Frontend, Worker↔Adapter, D1 schema↔Código)

## 5. Resumen
| Severidad | Cantidad |
|-----------|----------|
| CRÍTICO | N |
| FUNCIONAL | N |
| MENOR | N |
```

---

## NOTAS IMPORTANTES

- El código NO tiene build step. Los HTML usan `<script>` vanilla.
- El adapter es Apps Script (no Node.js) — `var`, `function`, sin `import`/`export`.
- El Worker usa ES modules.
- No hagas cambios al código. Solo audita y reporta.
- Si encuentras un bug, incluye archivo, número de línea, causa raíz, y fix sugerido.
- Sé exhaustivo. Cada endpoint, cada handler, cada flujo debe ser revisado.
