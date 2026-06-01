# Contratos v4.0 — Fixes Ronda 5 — Plan de implementacion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los 8 bugs identificados en la auditoria post-Ronda 4 (4 funcionales + 4 menores) y desplegar al Worker.

**Architecture:** Todos los cambios son quirurgicos — sin refactors. Funcionales primero (impacto real al usuario), menores despues (limpieza). Un deploy unico al final de todos los cambios. El adapter no se toca en esta ronda (los bugs AE7/AE8 viven en el Worker; el adapter ya esta pendiente de deploy manual por Bruno con los cambios de Ronda 4).

**Tech Stack:** Cloudflare Workers (JS), D1 (SQLite), `wrangler deploy`

---

## Archivos involucrados

| Archivo | Cambios |
|---------|---------|
| `frontend/portal.html` | AE2: timeout en `apiGet`; AE3: timeout en `firmaCliente`; AE4: monto por propiedad en `_renderComprobante` |
| `worker/src/routes/contratos.js` | AE5: subquery dirección en `listarContratos`; AE8: eliminar llamada `notificarContratoCreado` |
| `worker/src/routes/portal.js` | AE6: mapear abonos a camelCase |
| `worker/src/tokens.js` | AE7: eliminar `crearTokenConfigurar` |
| `frontend/admin.html` | AE9: verificar lectura de `CarpetaEntregablesId` (solo lectura, sin cambio si OK) |

---

## Task 1: AE2 — Timeout en `apiGet` (portal.html)

**Files:**
- Modify: `frontend/portal.html:408-416`

El `apiGet` actual no tiene `AbortController`. Si el Worker no responde, el portal muestra "Cargando tu contrato..." indefinidamente. El `apiPost` ya tiene la logica de timeout — replicarla en `apiGet`.

- [ ] **Paso 1: Aplicar el fix**

Reemplazar la funcion `apiGet` en `frontend/portal.html`:

Codigo actual (lineas 408-416):
```js
function apiGet(params) {
  var action = typeof params === 'object' ? params.action : '';
  var rest = typeof params === 'object' ? Object.assign({}, params) : {};
  delete rest.action;
  var url = API + '/' + action;
  var qs = new URLSearchParams(rest).toString();
  if (qs) url += '?' + qs;
  return fetch(url).then(function(r) { return r.json(); });
}
```

Codigo nuevo:
```js
function apiGet(params, opts) {
  var action = typeof params === 'object' ? params.action : '';
  var rest = typeof params === 'object' ? Object.assign({}, params) : {};
  delete rest.action;
  var url = API + '/' + action;
  var qs = new URLSearchParams(rest).toString();
  if (qs) url += '?' + qs;
  var timeoutMs = (opts && opts.timeoutMs) || 15000;
  var init = {};
  if (typeof AbortController === 'function') {
    var ctrl = new AbortController();
    setTimeout(function() { ctrl.abort(); }, timeoutMs);
    init.signal = ctrl.signal;
  }
  return fetch(url, init).then(function(r) { return r.json(); });
}
```

- [ ] **Paso 2: Verificar que las llamadas existentes a `apiGet` no pasan segundo argumento** (no rompe nada — el parametro `opts` es opcional)

```bash
grep -n "apiGet(" "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/frontend/portal.html" | head -20
```

Resultado esperado: todas las llamadas usan un solo argumento (objeto con `action`). Si alguna ya pasa segundo argumento, revisar compatibilidad.

---

## Task 2: AE3 — Timeout en `firmaCliente` (portal.html)

**Files:**
- Modify: `frontend/portal.html:1419-1427`

El `apiPost` de firma no pasa `timeoutMs`. La subida de archivos en el mismo portal ya usa timeout — inconsistencia que bloquea el boton "Firmando contrato..." si la red falla.

- [ ] **Paso 1: Aplicar el fix**

Localizar el `apiPost` de `firmaCliente` (linea ~1419). El bloque actual es:
```js
  apiPost({
    action          : 'firmaCliente',
    token           : token,
    correoCliente   : formData.correo,
    telefonoCliente : formData.telefono,
    firmaBase64     : firmaDataUrl,
    adicionales     : formData.adicionalesSeleccionados,
    propiedades     : formData.propsPayload,
  })
```

Reemplazar por:
```js
  apiPost({
    action          : 'firmaCliente',
    token           : token,
    correoCliente   : formData.correo,
    telefonoCliente : formData.telefono,
    firmaBase64     : firmaDataUrl,
    adicionales     : formData.adicionalesSeleccionados,
    propiedades     : formData.propsPayload,
  }, { timeoutMs: 30000 })
```

- [ ] **Paso 2: Verificar que existe manejo del error de abort**

Buscar el `.catch` o `.then(err)` que sigue al `apiPost` de firmaCliente y confirmar que ya muestra error al usuario cuando `data.ok` es false o cuando se rechaza la promesa. Si no hay `.catch`, agregar:

```js
  .catch(function(e) {
    enviando = false;
    if (wrap) wrap.style.display = 'none';
    mostrarError('Error de red al firmar. Verifica tu conexion e intenta de nuevo.');
  });
```

---

## Task 3: AE4 — Monto por propiedad en `_renderComprobante` (portal.html)

**Files:**
- Modify: `frontend/portal.html:1131-1139`

Para contratos con 2+ propiedades, el comprobante muestra `—` en la columna de monto. El total general es correcto, pero el desglose queda ilegible.

La causa: `monto` se fija a `—` para `props.length > 1`. El Worker envia `p.precio` por propiedad en propiedades? Verificar primero.

- [ ] **Paso 1: Verificar que el Worker envia precio por propiedad**

```bash
grep -n "precio\|precioTotal\|precio_total" "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/worker/src/routes/portal.js" | head -20
```

Si las propiedades no tienen campo de precio individual, el precio total del contrato dividido entre propiedades no es correcto. En ese caso el fix es mostrar el precio del paquete desde el catalogo o simplemente omitir el dash.

- [ ] **Paso 2: Leer como arma `propiedades` el Worker en `obtenerPortal`**

Localizar el `propiedades.map(p => ({...}))` en `portal.js` (linea ~116) y verificar que campos estan disponibles en `p`.

- [ ] **Paso 3: Aplicar el fix segun lo que haya disponible**

**Caso A — el Worker envia `precioServicio` o similar por propiedad:** Usar ese valor.

**Caso B — el Worker envia el paquete y hay precio en el catalogo (disponible en `d.todosAdicionales`):** No es practico buscar en catalogo en el comprobante.

**Caso C — no hay precio individual:** Reemplazar el `—` con el total del contrato dividido entre el numero de propiedades solo si todas tienen el mismo paquete; si no, mostrar `"Ver total"` o simplemente omitir la columna de monto para multi-propiedad y mostrar el total en el footer solamente.

El codigo a modificar (lineas 1136-1138):
```js
    var monto = props.length === 1
      ? '<strong>' + formatMXN(total) + '</strong>'
      : '<span style="color:var(--concrete)">—</span>';
```

Fix recomendado si no hay precio individual (Caso C):
```js
    var monto = props.length === 1
      ? '<strong>' + formatMXN(total) + '</strong>'
      : '<strong>' + formatMXN(Math.round(total / props.length)) + '</strong>';
```

> Nota: Si Bruno prefiere no dividir el total, la alternativa es omitir la columna monto en multi-propiedad y mostrar solo el total en el footer. Confirmar con Bruno antes de implementar si el Caso C aplica.

---

## Task 4: AE5 — Direccion en `renderSesionesFuturas` (contratos.js)

**Files:**
- Modify: `worker/src/routes/contratos.js:14-27`

El LEFT JOIN de `listarContratos` solo une con `num_propiedad = 1`. Si esa propiedad no tiene direccion aun, la pestana Sesiones muestra vacio aunque otras propiedades si tengan direccion.

- [ ] **Paso 1: Aplicar el fix en la query de `listarContratos`**

Codigo actual (lineas 16-22):
```js
    const { results } = await query(db,
      `SELECT c.*,
              p.fecha_sesion, p.hora_sesion, p.direccion
       FROM contratos c
       LEFT JOIN propiedades p ON p.contrato_token = c.token AND p.num_propiedad = 1
       WHERE c.oculto = 0
       ORDER BY c.fecha_creacion DESC`
    );
```

Codigo nuevo — usa subquery para tomar la primera propiedad con direccion no vacia; si ninguna tiene, cae a la propiedad 1:
```js
    const { results } = await query(db,
      `SELECT c.*,
              COALESCE(p_dir.fecha_sesion, p1.fecha_sesion) AS fecha_sesion,
              COALESCE(p_dir.hora_sesion,  p1.hora_sesion)  AS hora_sesion,
              COALESCE(p_dir.direccion,    p1.direccion)    AS direccion
       FROM contratos c
       LEFT JOIN propiedades p1
         ON p1.contrato_token = c.token AND p1.num_propiedad = 1
       LEFT JOIN propiedades p_dir
         ON p_dir.contrato_token = c.token
         AND p_dir.direccion IS NOT NULL AND p_dir.direccion != ''
         AND p_dir.num_propiedad = (
           SELECT MIN(num_propiedad) FROM propiedades
           WHERE contrato_token = c.token AND direccion IS NOT NULL AND direccion != ''
         )
       WHERE c.oculto = 0
       ORDER BY c.fecha_creacion DESC`
    );
```

- [ ] **Paso 2: Verificar que `fecha_sesion` y `hora_sesion` siguen llegando correctamente**

```bash
cd "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/worker" && wrangler d1 execute contratos-iav-v4 --remote --command="SELECT c.folio, p1.fecha_sesion, p1.direccion FROM contratos c LEFT JOIN propiedades p1 ON p1.contrato_token = c.token AND p1.num_propiedad = 1 WHERE c.oculto = 0 LIMIT 5"
```

Resultado esperado: filas con datos normales. Si la nueva query devuelve resultados identicos para contratos de una sola propiedad, el fix es correcto.

---

## Task 5: AE6 — Abonos en camelCase en `obtenerPortal` (portal.js)

**Files:**
- Modify: `worker/src/routes/portal.js:114`

`abonos: abonosPortal` pasa los rows crudos de D1 en snake_case. El portal los lee como `a.monto`, `a.metodo`, `a.fecha` (funciona hoy), pero es inconsistente con el resto de la respuesta que usa camelCase explicito.

- [ ] **Paso 1: Localizar la linea exacta**

```bash
grep -n "abonos: abonosPortal\|abonos:abonosPortal" "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/worker/src/routes/portal.js"
```

- [ ] **Paso 2: Aplicar el fix**

Reemplazar `abonos: abonosPortal` por:
```js
      abonos: abonosPortal.map(a => ({
        monto: a.monto,
        metodo: a.metodo,
        fecha: a.fecha,
        fechaRegistro: a.fecha_registro
      })),
```

- [ ] **Paso 3: Verificar que el portal lee los abonos con los mismos nombres de campo**

```bash
grep -n "\.monto\|\.metodo\|\.fecha\|\.fechaRegistro\|fecha_registro" "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/frontend/portal.html" | head -20
```

Resultado esperado: el portal usa `a.monto`, `a.metodo`, `a.fecha` (sin snake_case). Si usa `a.fecha_registro` en algun lugar, cambiarlo a `a.fechaRegistro` al mismo tiempo.

---

## Task 6: AE7 — Eliminar `crearTokenConfigurar` de tokens.js

**Files:**
- Modify: `worker/src/tokens.js:13-21`

La funcion existe desde antes de que se eliminara `linkConfigurar` en Ronda 4 (fix F7). Ya nadie la importa.

- [ ] **Paso 1: Confirmar que nadie la importa**

```bash
grep -rn "crearTokenConfigurar" "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/worker/src/"
```

Resultado esperado: solo aparece en `tokens.js` (la definicion). Si aparece en otro archivo, NO eliminar todavia — investigar primero.

- [ ] **Paso 2: Eliminar la funcion**

Eliminar las lineas 13-21 de `tokens.js`:
```js
export async function crearTokenConfigurar(db, contratoId) {
  const token = uuid();
  const expira = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  await run(db,
    'INSERT INTO tokens (token, contrato_id, tipo, expira, usado) VALUES (?, ?, ?, ?, 0)',
    [token, contratoId, 'configurar', expira]
  );
  return token;
}
```

---

## Task 7: AE8 — Eliminar llamada `notificarContratoCreado` del Worker

**Files:**
- Modify: `worker/src/routes/contratos.js:137`
- Modify: `adapter/AdapterScript4_v1.js` (el handler puede quedarse — es inofensivo; pero la llamada desde el Worker genera un fetch innecesario)

- [ ] **Paso 1: Confirmar la linea exacta en contratos.js**

```bash
grep -n "notificarContratoCreado" "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/worker/src/routes/contratos.js"
```

Resultado esperado: una sola linea alrededor de la 137.

- [ ] **Paso 2: Eliminar la llamada**

La linea es del tipo:
```js
    callAdapter(ctx, env, 'notificarContratoCreado', { nombreCliente, correoCliente, folio, linkPortal });
```

Eliminar esa linea. No eliminar variables que pueda usar otra parte de `crearContrato` — solo la llamada a `callAdapter`.

- [ ] **Paso 3: Verificar que `callAdapter` sigue siendo importado** (se usa para otras acciones en contratos.js)

```bash
grep -n "callAdapter\|from.*google" "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/worker/src/routes/contratos.js" | head -10
```

Resultado esperado: `callAdapter` aparece en otras lineas ademas de la eliminada.

---

## Task 8: AE9 — Verificar `d1ToPascal` para `carpeta_entregables_id` (admin.html)

**Files:**
- Read-only: `frontend/admin.html` (funcion `d1ToPascal` linea 1354 y usos de `CarpetaEntregablesId`)

- [ ] **Paso 1: Confirmar la conversion con la regex actual**

La funcion `d1ToPascal` usa:
```js
k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()).replace(/^[a-z]/, c => c.toUpperCase())
```

Traza manual de `carpeta_entregables_id`:
- `_e` → `E`: `carpetaEntregables_id`
- `_i` → `I`: `carpetaEntregablesId` — espera, `_id` es `_` + `i` → match, reemplaza con `I`, quedando `d` sin underscore.

Resultado esperado: `CarpetaEntregablesId` (con `d` minuscula final, no `ID`).

- [ ] **Paso 2: Confirmar que el admin.html NO lee directamente `CarpetaEntregablesId` de propiedades**

```bash
grep -n "CarpetaEntregablesId\|carpetaEntregablesId\|carpeta_entregables_id" "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/frontend/admin.html" | head -20
```

- Si no aparece ninguna lectura: el admin usa `carpetaEntregablesUrl` (campo calculado del Worker, no de D1) y el bug no tiene impacto real hoy. **Sin cambio necesario.**
- Si aparece una lectura como `p.CarpetaEntregablesID` (con ID en mayusculas): corregir a `p.CarpetaEntregablesId`.

---

## Task 9: Deploy

**Files:**
- No files changed in este task.

- [ ] **Paso 1: Verificar que no hay errores de sintaxis antes de desplegar**

```bash
cd "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/worker" && npx wrangler deploy --dry-run 2>&1 | tail -20
```

Resultado esperado: "Total Upload: X KiB" sin errores.

- [ ] **Paso 2: Desplegar**

```bash
cd "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/worker" && npx wrangler deploy
```

Resultado esperado: `Published contratos-iav-v4` con una URL de version nueva.

- [ ] **Paso 3: Smoke test — verificar que `listarContratos` responde**

```bash
curl -s -H "X-Admin-Key: framedock" "https://contratos.inmueblesaudiovisuales.com/api/listarContratos" | python3 -m json.tool | head -30
```

Resultado esperado: JSON con `{ "ok": true, "contratos": [...] }`.

- [ ] **Paso 4: Actualizar MASTER_V4.md**

En la seccion "Estado de despliegue actual", actualizar la fila del Worker a la nueva version (hash del deploy). En "Cambios aplicados", agregar una fila "Ronda 5 — Fixes AE2-AE9 (YYYY)" con los 8 fixes. Mover los pendientes resueltos de la seccion "Pendientes conocidos".

---

## Nota sobre el adapter

El adapter (`AdapterScript4_v1.js`) no se modifica en esta ronda. El handler `notificarContratoCreado` en el adapter puede quedarse — es inofensivo (funcion vacia). El cambio que importa es eliminar la llamada desde el Worker (AE8 Task 7).

Bruno debe desplegar el adapter de Ronda 4 manualmente en script.google.com si aun no lo ha hecho (pendiente listado en MASTER_V4.md).

---

## Resumen de archivos a modificar

| Archivo | Tasks | Tipo de cambio |
|---------|-------|----------------|
| `frontend/portal.html` | AE2, AE3, AE4 | 3 ediciones puntuales |
| `worker/src/routes/contratos.js` | AE5, AE8 | 1 query SQL reemplazada + 1 linea eliminada |
| `worker/src/routes/portal.js` | AE6 | 1 mapeo de array |
| `worker/src/tokens.js` | AE7 | 1 funcion eliminada (9 lineas) |
| `frontend/admin.html` | AE9 | Solo verificacion (posiblemente 0 cambios) |
