# Reporte de Auditoría — IAV Contratos v4.0

> Fecha: 2026-05-30 · Versión auditada: `02422d2c` (Worker) + adapter pendiente de deploy
> Auditor: Claude · Alcance: Worker (completo), Adapter (completo), Frontend (completo), D1 schema

---

## 1. Verificación de fixes Ronda 4

| # | Fix | Estado | Observaciones |
|---|-----|--------|---------------|
| C1 | `err` import en stats.js | ✅ | `stats.js:2` — importa `{ requireAdmin, ok, err }` |
| C2 | Anti-doble-firma en portal.js | ✅ | `:182` WHERE incluye `AND estatus='Pendiente firma'`. `:187` verifica `result.meta?.changes` |
| C3 | `guardarConfiguracion` preserva IDs | ✅ | Preserva `carpeta_control_id`, `calendar_event_id` y `carpeta_entregables_id` |
| C4 | `calendar_event_id` en D1 | ✅ | Adapter `:334-347` + Worker `contratos.js:399-406`. Endpoint registrado en `index.js:22` |
| C5 | `logoPrecargadoUrl` en portal | ✅ | `portal.js:79-89` llama `callAdapterSync`. `:141` incluido en respuesta |
| C6 | Validación `precioTotal > 0` | ✅ | `contratos.js:91` — `if (totalNum <= 0) return err(...)` |
| F1 | `totalAbonado` en registrarAbono | ✅ | `abonos.js:79` — calculado y retornado |
| F2 | Checklist columnas | ✅ | `checklist.js` — formato `{cuartos, columnas}`, `migrarFormato()` para compatibilidad |
| F3 | Guard contra re-primerAbono | ✅ | `abonos.js:71` — verifica `yaTieneCarpeta` |
| F4 | Periodo `"todo"` en stats | ✅ | `stats.js:10,13-25` — queries condicionales sin filtro |
| F5 | Checklist link en Calendar | ✅ | `adapter:323` — incluido en array `descripcion` |
| F6 | `limpiarLinkMaps` implementado | ✅ | `portal.js:6-11` + `adapter:746-751`. Aplicado en `firmaCliente` y `primerAbono` |
| F7 | Eliminar `linkConfigurar` | ✅ | `contratos.js` — removido de `crearContrato` y del import |
| M1 | Body parse después de auth | ✅ | `archivos.js:9,34` — `request.json()` dentro de cada `if (action === ...)` |
| M2 | Guard prepago 100% en upsell | ✅ | `contratos.js:213` — `&& c.anticipo < c.precio_total` |
| M3 | `carpetaEntregablesUrl` correcto | ✅ | `contratos.js:54-58` prefiere `carpeta_entregables_id`. Columna D1 creada. Adapter la envía |
| M4 | `reagendar` mejorado | ✅ | `adapter:530-561` — renombra Drive + callback `calendar_event_id` |
| M5 | Timeout en checklist polling | ✅ | `checklist.html:426-443` — AbortController con 10s ya existía |

---

## 2. Bugs encontrados en esta auditoría

### CRÍTICOS

*Ninguno — AE1 detectado y corregido en el mismo deploy (`02422d2c`)*

<details>
<summary>AE1 (CORREGIDO) — guardarConfiguracion no preservaba carpeta_entregables_id</summary>

**Archivo:** `worker/src/routes/portal.js:254`
**Fix aplicado:** Query pre-DELETE ahora incluye `carpeta_entregables_id`. INSERT incluye la columna.
</details>

---

### FUNCIONALES (4)

#### AE2 — Portal `apiGet` sin timeout — carga infinita si la red falla

**Archivo:** `frontend/portal.html:408-416`  
**Problema:** `apiGet()` no usa `AbortController`. Si el Worker no responde, el portal muestra "Cargando tu contrato..." para siempre. El checklist.html sí tiene timeout (10s).  
**Fix:** Agregar AbortController con timeout de 15s, igual que en checklist.html.

#### AE3 — Portal `firmaCliente` sin timeout — botón bloqueado si el POST se cuelga

**Archivo:** `frontend/portal.html:1419-1427`  
**Problema:** El POST de firma se llama sin `timeoutMs`. Si la red falla, el botón dice "Firmando contrato..." permanentemente. La subida de archivos en el portal sí usa timeout.  
**Fix:** Pasar `timeoutMs: 30000` en la llamada a `apiPost`.

#### AE4 — `_renderComprobante` muestra `—` para todas las propiedades multi-propiedad

**Archivo:** `frontend/portal.html:1131-1138`  
**Problema:** Para contratos con 2+ propiedades, cada fila de servicios muestra `—` en vez del monto. El total general sí es correcto, pero el desglose queda ilegible.  
**Fix:** Mostrar el monto individual por propiedad en vez de `—`.

#### AE5 — `renderSesionesFuturas` no muestra dirección para multi-propiedad

**Archivo:** `frontend/admin.html:2684`  
**Problema:** `listarContratos` hace LEFT JOIN solo con `num_propiedad = 1`. Si la propiedad 1 no tiene dirección (porque el cliente aún no llena el portal), la pestaña Sesiones muestra dirección vacía aunque otras propiedades sí tengan.  
**Fix:** Usar la primera propiedad con dirección no vacía, o hacer subquery que busque `MIN(num_propiedad)` donde `direccion IS NOT NULL`.

---

### MENORES (4)

#### AE6 — `abonos` en portal vienen en snake_case (inconsistente con el resto)

**Archivo:** `worker/src/routes/portal.js:40-43,115`  
**Problema:** La respuesta de `obtenerPortal` mapea propiedades a camelCase explícitamente, pero los abonos se pasan crudos desde D1 en snake_case (`monto`, `metodo`, `fecha`). El portal los lee correctamente en snake_case, así que funciona, pero es inconsistente y frágil. Si alguien estandariza el portal a camelCase, se rompe.  
**Fix:** Mapear abonos a camelCase igual que propiedades:
```js
abonos: abonosPortal.map(a => ({
  monto: a.monto, metodo: a.metodo, fecha: a.fecha, fechaRegistro: a.fecha_registro
}))
```

#### AE7 — `crearTokenConfigurar` es código muerto en tokens.js

**Archivo:** `worker/src/tokens.js:13-21`  
**Problema:** La función existe pero `contratos.js` ya no la importa. `portal.js` tampoco. Es código muerto.  
**Fix:** Eliminar la función o mantenerla documentando que no se usa.

#### AE8 — `notificarContratoCreado` en adapter es no-op pero se sigue llamando

**Archivo:** `adapter/AdapterScript4_v1.js:416-418`  
**Problema:** La función está vacía (solo un comentario), pero el Worker hace `callAdapter(ctx, env, 'notificarContratoCreado', ...)` en cada contrato nuevo. Es un fetch innecesario al adapter.  
**Fix:** Remover la llamada desde `contratos.js:137` y el handler del adapter.

#### AE9 — `carpeta_entregables_id` no está en el mapeo de `d1ToPascal`

**Archivo:** `frontend/admin.html` (función `d1ToPascal`)  
**Problema:** Si en algún momento `propiedades` incluye `carpeta_entregables_id`, `d1ToPascal` lo convertirá a `CarpetaEntregablesId` (regla general: `_i` → `I` + mayúscula siguiente). Pero no está explícitamente documentado ni probado. Podría sorprender si alguien espera `CarpetaEntregablesID` o `CarpetaEntregablesId`.  
**Fix:** Verificar que el admin.html lea `CarpetaEntregablesId` donde corresponda, o agregar un test de `d1ToPascal('carpeta_entregables_id')`.

---

## 3. Análisis de features v3.0 en admin.html

Revisión de V1-V9 del `AUDITORIA-EXHAUSTIVA-v4.md`:

| # | Feature | ¿Existe? | Detalle |
|---|---------|----------|---------|
| V1 | Pestaña Sesiones | ✅ | `renderSesionesFuturasTab()` en línea 2647. Funciona con `listarContratos` (LEFT JOIN prop 1) |
| V2 | Alerta sesión hoy | ✅ | `#alerta-sesion-hoy` en línea 897. Muestra banner dorado si hay sesión |
| V3 | Días en estatus | ✅ | `diasEnEstatus()` en línea 1606. Calcula días desde último cambio |
| V4 | Alerta expiración | ✅ | Badge `warning` en línea 1698. Muestra warning si >60h en Pendiente firma |
| V5 | Duplicar contrato | ✅ | `duplicarContrato(token)` en línea 2384. Clona contrato existente |
| V6 | WhatsApp inteligente | ✅ | `generarMensajeWhatsApp(contrato)` en línea 1435. Switch por estatus |
| V7 | 5ta tarjeta métricas | ✅ | Stats bar con 5 cards. Sesiones esta semana existe (card 5) |
| V8 | Filtros por fecha | ✅ | `#filtro-fecha-desde`, `#filtro-fecha-hasta` en línea 511. Funciona con `data-filtro` |
| V9 | Nota interna por propiedad | ✅ | `guardarNotaPropiedad` endpoint. Botón en prop-card (línea 1786) |

**Conclusión V1-V9:** Las 9 features de v3.0 están presentes y funcionales en admin.html v4.0.

---

## 4. Consistencia Worker ↔ Frontend

### Admin (`obtenerContrato`)

| Campo Worker | Tipo | Admin espera | Match |
|-------------|------|-------------|-------|
| `contrato` | snake_case (raw D1) | PascalCase via `d1ToPascal` | ✅ |
| `propiedades` | snake_case (raw D1) | PascalCase via `d1ToPascal` | ✅ |
| `abonos` | snake_case (raw D1) | PascalCase via `d1ToPascal` | ✅ |
| `totalAbonado` | camelCase (JS var) | `data.totalAbonado` | ✅ |
| `carpetaEntregablesUrl` | camelCase (JS var) | `data.carpetaEntregablesUrl` | ✅ |

### Portal (`obtenerPortal`)

| Campo Worker | Tipo | Portal espera | Match |
|-------------|------|-------------|-------|
| `nombreCliente` | camelCase (explícito) | `d.nombreCliente` | ✅ |
| `precioTotal` | camelCase (explícito) | `d.precioTotal` | ✅ |
| `propiedades[].paquete` | camelCase (explícito) | `p.paquete` | ✅ |
| `abonos[].monto` | **snake_case** (raw D1) | `a.monto` | ✅ (funciona pero inconsistente) |
| `totalAbonado` | camelCase (JS var) | `d.totalAbonado` | ✅ |
| `logoPrecargadoUrl` | camelCase (JS var) | `d.logoPrecargadoUrl` | ✅ |
| `todosAdicionales` | camelCase (JS var) | `d.todosAdicionales` | ✅ |

### Checklist (`obtenerChecklist`)

| Campo Worker | Tipo | Checklist espera | Match |
|-------------|------|----------------|-------|
| `cuartos` | array (nuevo formato) | `data.cuartos` | ✅ |
| `columnas` | objeto (nuevo formato) | `data.columnas` | ✅ |
| `esTemplate` | boolean | `data.esTemplate` | ✅ |

---

## 5. Consistencia Worker ↔ Adapter

### Datos enviados al adapter (`firmaCliente` → `procesarFirma`)

| Campo | ¿Incluido? | ¿Usado por adapter? |
|-------|-----------|-------------------|
| `contrato.precio_total` | ✅ | PDF + correo |
| `contrato.anticipo` | ✅ | PDF + correo |
| `contrato.saldo_pendiente` | ✅ | PDF + correo |
| `contrato.estatus` | ✅ | No usado directamente |
| `contrato.correo_cliente` | ✅ | `enviarCorreoConPDF_` |
| `contrato.telefono_cliente` | ✅ | PDF |
| `contrato.adicionales_json` | ✅ (stringified) | PDF |
| `firmaBase64` | ✅ | PNG en Drive |
| `propiedades` | ✅ | No usado en PDF (solo prop1) |

### Datos enviados al adapter (`registrarAbono` → `primerAbono`)

| Campo | ¿Incluido? | ¿Usado por adapter? |
|-------|-----------|-------------------|
| `contrato` (completo) | ✅ | Carpetas, Calendar, Slides |
| `propiedades` (array) | ✅ | Loop para IDs D1, Calendar |
| `folio` | ✅ | Nombre carpeta, evento |

### Callbacks del adapter al Worker

| Callback | Endpoint Worker | ¿Registrado en index.js? | ¿Funciona? |
|----------|----------------|------------------------|-----------|
| `actualizarCarpeta` | `contratos.js:383` | ✅ `RUTAS_CONTRATOS` | ✅ |
| `actualizarCalendarEvent` | `contratos.js:399` | ✅ `RUTAS_CONTRATOS` | ✅ |
| `actualizarPdfUrl` | `contratos.js:408` | ✅ `RUTAS_CONTRATOS` | ✅ |

---

## 6. Seguridad

| Aspecto | Estado |
|---------|--------|
| Admin key en header | ✅ `X-Admin-Key` en `requireAdmin()` |
| Admin key en query param (fallback inseguro) | ⚠️ `auth.js:3` acepta `adminKey` en URL. Esto expone la key en logs del servidor. Práctica aceptada para APIs internas pero no ideal |
| Prepared statements D1 | ✅ Todos los queries usan `?` placeholders |
| CSV formula injection | ✅ `contratos.js:73` — prefijo `'` en celdas que empiezan con `=+-@` |
| Token portal sin auth en archivos | ✅ `archivos.js:18-24` — validación de token portal |
| CORS | ✅ `*` allow-origin con métodos restringidos |

---

## 7. Resumen

| Severidad | Cantidad | IDs |
|-----------|----------|-----|
| CRÍTICO | 0 | — (AE1 corregido) |
| FUNCIONAL | 4 | AE2, AE3, AE4, AE5 |
| MENOR | 4 | AE6, AE7, AE8, AE9 |
| **Total bugs nuevos** | **8** | |
| **Fixes R4 verificados** | **18/18** | C1-C6, F1-F7, M1-M5 |
| **Features v3.0 presentes** | **9/9** | V1-V9 |

---

## 8. Acciones recomendadas

### Inmediatas (críticas)
1. **AE1** — Fix `guardarConfiguracion` para preservar `carpeta_entregables_id` (1 archivo, 3 líneas)

### Próxima ronda
2. **AE2, AE3** — Agregar timeouts en portal.html `apiGet` y `firmaCliente`
3. **AE4** — Fix comprobante multi-propiedad en portal.html
4. **AE5** — Fix dirección en `renderSesionesFuturas` de admin.html
5. **AE6** — Estandarizar abonos a camelCase en `obtenerPortal`

### Baja prioridad
6. **AE7** — Eliminar `crearTokenConfigurar` de tokens.js
7. **AE8** — Eliminar llamada `notificarContratoCreado` del Worker
8. **AE9** — Verificar `d1ToPascal` para `carpeta_entregables_id`
