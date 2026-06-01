# Reporte completo de cambios — IAV Contratos v4.0

> Fecha: 2026-05-30  
> Archivos modificados: `worker/src/routes/contratos.js`, `portal.js`, `abonos.js`, `archivos.js`, `stats.js`, `frontend/portal.html`, `frontend/admin.html`, `adapter/AdapterScript4_v1.js`  
> Deploy final: `d291e887`

---

## Ronda 1 — Bugs iniciales detectados en sesiones anteriores

### B1 — Anticipo no recalculado al añadir servicios (firmaCliente)
- **Archivo:** `worker/src/routes/portal.js` — `firmaCliente`
- **Por qué:** El anticipo era fijo al valor original del contrato, ignorando servicios adicionales seleccionados por el cliente.
- **Fix:** `anticipo = Math.round(nuevoTotal × pctOriginal)` antes de guardar.

### B2 — `\n` literal visible en entregables del portal (Etapa 1)
- **Archivo:** `frontend/portal.html` — `renderEtapa1`
- **Por qué:** Los entregables del paquete base contenían `\n` como texto literal escapado en DB.
- **Fix:** Agregar `.replace(/\\n/g, '\n')` antes de `split(/[|\n]/)`.

### B3 — PDF dice "Ninguno" en adicionales aunque se seleccionaron
- **Archivo:** `adapter/AdapterScript4_v1.js` — `generarPDF_`
- **Por qué:** `adicionales_json` contiene strings (claves) y objetos; el PDF solo mostraba objetos.
- **Fix:** Iterar todos los elementos; mapear strings a nombres del paquete.

### B4 — Firma no aparece en el PDF generado
- **Archivo:** `adapter/AdapterScript4_v1.js` — `generarPDF_`
- **Por qué:** `firmaFile` (archivo en Drive) se recibía pero nunca se insertaba en el documento.
- **Fix:** `body.findText('{{firma}}')` → eliminar texto placeholder → `insertImage`.

### B5 — `procesarFirma` envía anticipo ORIGINAL al adapter (no recalculado)
- **Archivo:** `worker/src/routes/portal.js` — `procesarFirma`
- **Por qué:** En el spread `...contrato` se enviaba el anticipo de DB, no el recalculado.
- **Fix:** Agregar `anticipo: anticipo` al objeto enviado al adapter.

### B6 — Upsell no recalcula anticipo al cambiar precio
- **Archivo:** `worker/src/routes/contratos.js` — `actualizarContratoUpsell`
- **Por qué:** Al añadir servicios, `precioFinal` cambiaba pero el anticipo no.
- **Fix:** Recalcular `nuevoAnticipo = Math.round(precioFinal × pctOriginal)`.

### B7 — `crearContrato` no valida anticipo
- **Archivo:** `worker/src/routes/contratos.js` — `crearContrato`
- **Por qué:** Anticipo podía ser negativo o mayor al total → saldo inválido.
- **Fix:** Parsear y clamp: `saldoPendiente = Math.max(0, totalNum - anticNum)`.

### B8 — `\n` literal en entregables del PDF
- **Archivo:** `adapter/AdapterScript4_v1.js` — `generarPDF_`
- **Por qué:** Texto con `\n` o pipes se insertaba crudo en Google Doc.
- **Fix:** Reemplazar `\\n` y `|` por `, ` antes de insertar en template.

### B9 — Multi-propiedad: solo carpeta para propiedad 1 en primerAbono
- **Archivo:** `adapter/AdapterScript4_v1.js` — `primerAbono`
- **Por qué:** `carpeta_${token}_1` solo guardaba para numPropiedad=1.
- **Fix:** Loop sobre todas las propiedades para guardar el mismo `carpetaControl` ID.

### B10 — Comprobante no muestra adicionales del cliente
- **Archivos:** `worker/src/routes/portal.js` + `frontend/portal.html`
- **Por qué:** Solo mostraba `extrasAcordados` (objetos); strings ignorados.
- **Fix:** Nuevo campo `todosAdicionales` en respuesta del worker; frontend lo usa.

### B11 — `exportarCSV` falla en admin
- **Archivo:** `worker/src/routes/contratos.js` — `exportarCSV`
- **Por qué:** Retornaba CSV crudo; el admin hacía `res.json()` y fallaba.
- **Fix:** Retornar `ok({ ok: true, csv: header + rows })` como JSON.

### B12 — Subida de archivos: nombres de campo incorrectos
- **Archivo:** `frontend/portal.html` — `subirArchivoPortal`
- **Por qué:** Portal enviaba `fileBase64, fileName, propIndex`; worker esperaba `base64, nombre, numPropiedad`.
- **Fix:** Renombrar campos, strip del prefijo dataURL.

### B13 — `crearContrato` usa `precioTotal` sin parsear en INSERT
- **Archivo:** `worker/src/routes/contratos.js` — `crearContrato`
- **Por qué:** `precioTotal` y `anticipo` del body sin validación numérica.
- **Fix:** Usar `totalNum` y `anticNum` parseados con `parseFloat`.

---

## Ronda 2 — Segunda auditoría (cambios corregidos al inicio de sesión)

| # | Bug | Archivo | Corrección |
|---|-----|---------|------------|
| R2a | Anticipo no se recalcula al añadir servicios | `portal.js:firmaCliente` | `anticipo = Math.round(precioTotal × pctOriginal)` |
| R2b | Entregables con `\n` visible en Etapa 1 portal | `portal.html` | `replace(/\\n/g, '\n')` antes del split |
| R2c | Contrato dice "Ninguno" cuando hay adicionales | `AdapterScript4_v1.js:generarPDF_` | Incluye strings + objetos de `adicionales_json` |
| R2d | Firma no aparece en PDF | `AdapterScript4_v1.js:generarPDF_` | `findText('{{firma}}')` → inserta imagen |

---

## Ronda 3 — Tercera auditoría

| # | Severidad | Bug | Archivo | Corrección |
|---|----------|-----|---------|------------|
| R3-B21 | **Crítico** | PDF/correo con anticipo original, no recalculado | `portal.js:173` | Agregar `anticipo` al spread del contrato enviado al adapter |
| R3-B9 | **Crítico** | Upsell no recalcula anticipo al subir precio | `contratos.js:210` | Recalcular `nuevoAnticipo` proporcional al precio |
| R3-B16 | **Crítico** | `crearContrato` sin validar anticipo → saldo negativo | `contratos.js:85` | Parsear y clamp: `Math.max(0, total - anticipo)` |
| R3-B26 | **Crítico** | Exportar CSV devolvía raw text, admin fallaba | `contratos.js:60` | Retornar `ok({ csv: ... })` como JSON |
| R3-B34 | **Crítico** | Subida archivos portal: field names no coincidían | `portal.html:2048` | Renombrar campos + strip base64 prefix |
| R3-B8 | Medium | `\n` literal en entregables del PDF | `AdapterScript4_v1.js:150` | `.replace(/\\n/g, ', ')` |
| R3-B14 | Medium | Multi-propiedad: carpeta solo para prop #1 | `AdapterScript4_v1.js` | Guardar carpeta para todas las `numPropiedad` |
| R3-B18 | Medium | Comprobante sin adicionales del cliente | `portal.js` + `portal.html` | Campo `todosAdicionales`; frontend lo usa |

---

## Ronda 4 — Cuarta auditoría exhaustiva (Worker + Frontend)

### Backend — Worker

| Bug | Archivo | Por qué | Corrección |
|-----|---------|--------|------------|
| **Crítico:** `codigoError` enterrado en string JSON | `contratos.js:155` | `err(JSON.stringify({...}))` envolvía datos estructurados como string en campo `error`. Frontend no podía leer `codigoError`. | `new Response(JSON.stringify({ok:false, codigoError:..., estatusActual:...}), {status:409})` |
| **Crítico:** CLABE/cuenta faltaban en portal | `portal.js:obtenerPortal` | El adapter tiene los datos bancarios pero el worker nunca los devolvía al frontend. Clientes veían campos de pago vacíos. | Agregar `banco`, `titular`, `clabe`, `cuenta`, `tarjeta`, `clipLink`, `waLink` al response |
| **Alto:** `firmaCliente` retornaba solo `{ok, estatus}` | `portal.js:198` | Frontend necesitaba `total`, `anticipo`, `folio` para renderizar etapa 2 sin esperar refresh. | Agregar `total: precioTotal`, `anticipo`, `folio: contrato.folio` al return |
| Medio: `periodo` faltante en stats | `stats.js:52` | Frontend leía `s.periodo` para mostrar label ("este mes", etc.) → siempre `undefined`. | Agregar `periodo` al response |

### Frontend — portal.html

| Bug | Por qué | Corrección |
|-----|---------|------------|
| **Alto:** Orientación permanentemente oculta | `display:none` inline; usuarios nunca podían seleccionar | Removido `style="display:none"` (luego revertido por solicitud de Bruno) |
| **Alto:** Status hardcodeado `'Firmado'` | Ignoraba que el worker puede devolver `'En produccion'` (prepago) | `portalData.estatus = data.estatus \|\| 'Firmado'` |
| **Alto:** `errEl` null sin guard en `enviarFirma` | Si `#error-firma` no existe en DOM → TypeError | `if (errEl) errEl.style.display = 'none'` |
| Medio: `parseFloat("0")` tratado como falsy | `parseFloat("0") \|\| fallback` → 0 es falsy, caía al fallback | Comparar `!= null && !== ''` antes del `parseFloat` |
| Medio: NaN en `formatFechaHora` | `parseInt('ab')` = `NaN` → hora incorrecta | `if (isNaN(hh)) hh = 0` |
| Bajo: "Copiada" vs "Copiado" | Inconsistencia de género en todos los botones copy | Unificado a "Copiado" |
| Bajo: Anticipo 50% cuando total=0 | Contratos gratuitos mostraban "50%" | Default a `0` |

### Frontend — admin.html

| Bug | Por qué | Corrección |
|-----|---------|------------|
| **Crítico:** Abonos siempre vacíos (campos lowercase) | `d1ToPascal` convierte `monto→Monto` pero template usaba `a.monto` | `a.Metodo`, `a.Fecha`, `a.Notas`, `a.Monto` |
| **Crítico:** `AdicionalesJSON` double-parse | `d1ToPascal` ya parseaba; `renderPanel` volvía a `JSON.parse` sobre array → `[]` | `Array.isArray(c.AdicionalesJSON) ? c.AdicionalesJSON : JSON.parse(...)` |
| Alto: Token sin escapar en `onclick` | `c.Token` directo en string de JS → injection risk | `esc(c.Token)` |
| Bajo: `SaldoPendiente` undefined sin clase CSS | `undefined <= 0` = false, mostraba ✓ sin color verde | `(c.SaldoPendiente ?? 0)` |
| Bajo: `safeHref` retorna `#` | Click en link inválido navegaba al top de la página | Cambiado a `''` |

---

## Ronda 5 — Quinta auditoría (Worker + Adapter)

### Backend — Worker

| Bug | Archivo | Por qué | Corrección |
|-----|---------|--------|------------|
| **Crítico:** Anticipo inflado en `firmaCliente` | `portal.js:152-157` | Recalcular anticipo proporcional al añadir add-ons inflaba el anticipo. Si era prepago 100%, añadir servicios ponía `anticipo >= precioTotal` y saldo podía ser negativo. | Mantener anticipo absoluto: `saldoPendiente = Math.max(0, precioTotal - anticipo)` |
| **Crítico:** `guardarConfiguracion` sin validar array | `portal.js:232` | Si `propsData` es null/undefined → `for...of` lanza TypeError después del DELETE (DB inconsistente) | `if (!Array.isArray(propsData)) return err(...)` |
| **Alto:** Liquidado podía retroceder a En produccion | `contratos.js:147-151` | `TRANSICIONES_BLOQUEADAS['Liquidado']` solo bloqueaba 3 estatus, no 'En produccion' ni 'Entregado' | Bloquear también `'En produccion'` y `'Entregado'` |
| **Alto:** String `"false"` bypass forzar | `contratos.js:152` | `if (!forzar)` — `"false"` es string no vacío → truthy → bypass | `const forzarBool = forzar === true \|\| forzar === 'true';` |
| **Alto:** Configurar token creado pero nunca devuelto | `contratos.js:131-137` | `crearTokenConfigurar` retorna token pero se descartaba; `linkConfigurar` siempre `null` | Guardar retorno y construir URL; incluir `linkConfigurar` en response |
| **Alto:** JSON.parse crash en upsell | `contratos.js:177` | Malformed `adicionales_json` en DB → `JSON.parse` lanza 500 | try-catch con fallback `[]` |
| **Alto:** Folio NaN con fecha inválida | `portal.js:242` | `generarFolio("invalido")` produce `IAV-NaNNaN.NaN` sin validación | Validar fecha con `parseFecha` y `isNaN` antes de generar |
| **Alto:** `subirArchivo` sin auth | `archivos.js:12-17` | Cualquiera con un token de contrato podía subir archivos a Drive | Validar token portal (usado=0, no expirado) o admin key |
| Medio: Servicios con precio=0 ignorados | `contratos.js:192,197` | `!svc?.precio` rechazaba `0`; `ajustePrecioManual` rechazaba `0` | Check `!== undefined && !== null` |
| Medio: Boolean `false` → `null` en guardarProduccion | `contratos.js:272` | `fotografiaLista \|\| null` → `false` es falsy → almacena `null` | `?? null` en lugar de `\|\| null` |
| Medio: CSV formula injection | `contratos.js:70` | Celdas empezando con `=+-\@` se interpretan como fórmulas en Excel | Prefijo `'` en valores peligrosos |
| Medio: Token portal lookup con fila incorrecta | `portal.js:27` | `ORDER BY rowid DESC LIMIT 1` sin filtrar `usado=0` → podía devolver token ya usado | `AND usado = 0` |
| Medio: Refrescar expiry de tokens usados | `portal.js:247` | UPDATE sin `AND usado=0` → resucitaba tokens expirados | `AND usado=0` |
| Medio: Periodo inválido → datos desde año 2000 | `stats.js:15` | `else desde = new Date('2000-01-01')` sin límite | Validar contra whitelist `['mes','trimestre','anio']` |
| Medio: Top clientes agrupados por nombre | `stats.js:31-32` | Dos "Juan Perez" distintos se combinaban | Agrupar por `correo_cliente` |

### Adapter — Apps Script

| Bug | Por qué | Corrección |
|-----|---------|------------|
| **Crítico:** `e.postData` null | POST mal formado → `TypeError` antes del try/catch | `e.postData && e.postData.contents ? JSON.parse(...) : {}` |
| **Crítico:** `contrato` undefined en PDF | `procesarFirma` podía guardar `undefined` en PropertiesService | `if (!contrato) return null` |
| **Crítico:** `numPropiedad: 1` hardcodeado | `primerAbono` guardaba carpeta para todas las props pero notificaba al worker solo con `numPropiedad: 1` | `propiedades[0].num_propiedad \|\| 1` |
| **Alto:** NaN en porcentaje de correo | `0/0` o `undefined/0` → `NaN%` en email PDF y abono | Guard: `precio_total > 0` y `anticipo \|\| 0` |
| **Alto:** `numPropiedad` undefined en reagendar | Si falta, key de calendar es `cal_xxx_undefined` → nunca coincide | Validar y retornar error temprano |

---

## Resumen de archivos modificados

| Archivo | Cambios totales |
|---------|----------------|
| `worker/src/routes/contratos.js` | 11 fixes (anticipo, upsell, CSV, estatus, forzar, config token, JSON parse, precio=0, boolean null, formula injection) |
| `worker/src/routes/portal.js` | 10 fixes (CLABE/cuenta, firmaCliente fields, anticipo absoluto, guardarConfig validación, NaN folio, token queries, tokens usado=0) |
| `worker/src/routes/stats.js` | 3 fixes (periodo, whitelist, top clientes por email) |
| `worker/src/routes/archivos.js` | 1 fix (auth en subirArchivo) |
| `frontend/portal.html` | 8 fixes (orientación, status, parseFloat, null guard, NaN, copy text, anticipo 0, upload fields) |
| `frontend/admin.html` | 5 fixes (abonos PascalCase, AdicionalesJSON, token escape, SaldoPendiente, safeHref) |
| `adapter/AdapterScript4_v1.js` | 8 fixes (postData, contrato, numPropiedad, NaN %, numProp undefined, adicionales strings, firma img, entregables) |

**Total: ~46 bugs corregidos en 5 rondas de auditoría.**

---

## Estado de despliegue

| Capa | Última versión | Estado |
|------|---------------|--------|
| Worker + Frontend | `d291e887` | ✅ Desplegado |
| Adapter Apps Script | — | ⚠️ **Pendiente** — pegar `AdapterScript4_v1.js` en script.google.com |
