# Prompt de auditoría — Implementación v5.0 (código real en producción)

Pega este prompt en una sesión nueva (sin contexto de conversaciones anteriores).

---

## Instrucciones para el auditor

Eres un ingeniero senior revisando código **ya desplegado en producción**. Las modificaciones implementan la unificación de contratos v5.0 en un sistema de contratos para fotografía/video inmobiliario. Tu tarea es encontrar todos los bugs que haya introducido esta implementación antes de que el equipo haga pruebas manuales.

**El sistema:**
- Cloudflare Workers (ES modules, V8), D1 (SQLite edge, sin FK — cascadas en código)
- Google Apps Script adapter (Rhino — NO `const`/`let`, arrow functions, spread, `Array.find/includes`)
- Frontend vanilla JS (`var`/`let`/`const` mezclados — no Rhino)
- El admin crea contratos; el cliente firma desde un portal; el adapter escucha `procesarFirma` y crea carpetas en Drive + eventos en Calendar

**Resumen de los cambios desplegados:**
1. `worker/src/routes/contratos.js` — `crearContrato` reescrito: ya no distingue tipo, siempre inserta `'estandar'`, requiere `propiedades[]`, genera folio desde `propsData[0].fechaSesion`
2. `worker/src/routes/portal.js` — `firmaCliente`: eliminado guard `tipo_contrato !== 'particular'`; `guardarConfiguracion`: reemplazado con 410
3. `frontend/admin.html` — formulario unificado sin sub-tabs, nuevas funciones de prop cards, funciones reemplazadas (`crearContrato`, `actualizarPrecio`, `limpiarFormCrear`, `duplicarContrato`, `cargarPaquetes`, `actualizarPaquetesAdicionales`)
4. `frontend/portal.html` — eliminadas variables `esParticular`/`esP`, reemplazadas por guards defensivos sobre existencia de datos

---

## Código implementado

### A. `worker/src/routes/contratos.js` — bloque `crearContrato` (líneas 97–174)

```js
if (action === 'crearContrato') {
  const body = await request.json();
  const { nombreCliente, correoCliente, telefonoCliente,
          tipoPaquete, paqueteBase, adicionales, extrasAcordados,
          precioTotal, anticipo, notasContrato, numPropiedades,
          propiedades: propsData } = body;

  if (!nombreCliente) return err('Nombre del cliente requerido');
  if (!propsData || !propsData.length) return err('Al menos una propiedad es requerida');
  if (propsData.length > 20) return err('Máximo 20 propiedades por contrato');

  const totalNum = parseFloat(precioTotal) || 0;
  if (totalNum <= 0) return err('El precio total debe ser mayor a $0');
  const anticNum = Math.min(
    anticipo !== undefined && anticipo !== '' ? parseFloat(anticipo) || 0 : 0,
    totalNum
  );

  const prop1 = propsData[0];
  const fechaRe = /^\d{4}-\d{2}-\d{2}$/;
  for (let vi = 0; vi < propsData.length; vi++) {
    const vp = propsData[vi];
    if (vp.fechaSesion && !fechaRe.test(vp.fechaSesion)) {
      return err('Formato de fecha inválido en propiedad ' + (vi + 1) + ' (esperado YYYY-MM-DD)');
    }
    if (vp.entregables && vp.entregables.length > 2000) {
      return err('Entregables de propiedad ' + (vi + 1) + ' exceden 2000 caracteres');
    }
  }

  const token = uuid();
  const paqueteBaseFinal = paqueteBase || prop1?.paquete || '';
  const tipoPaqueteFinal = tipoPaquete || prop1?.tipo || '';
  const paquete = await queryOne(db, 'SELECT precio FROM paquetes WHERE clave = ?', [paqueteBaseFinal]);
  const precioBase = paquete?.precio ?? totalNum;
  const saldoPendiente = Math.max(0, totalNum - anticNum);

  const adicionalesOfrecidos = (adicionales || []).filter(Boolean);
  const extrasObjs = (extrasAcordados || []).map(e =>
    e.clave ? { clave: e.clave, precio: e.precio } : { nombre: e.nombre, precio: e.precio }
  );
  const adicionalesJSON = JSON.stringify([...adicionalesOfrecidos, ...extrasObjs]);

  const folio = prop1.fechaSesion ? generarFolio(prop1.fechaSesion) : null;

  await run(db,
    `INSERT INTO contratos (token, folio, nombre_cliente, correo_cliente, telefono_cliente,
     tipo_contrato, tipo_paquete, paquete_base, adicionales_json, precio_base, precio_total,
     anticipo, saldo_pendiente, estatus, fecha_creacion, num_propiedades, notas_contrato)
     VALUES (?, ?, ?, ?, ?, 'estandar', ?, ?, ?, ?, ?, ?, ?, 'Pendiente firma', ?, ?, ?)`,
    [token, folio, nombreCliente, correoCliente || '', telefonoCliente || '',
     tipoPaqueteFinal, paqueteBaseFinal,
     adicionalesJSON, precioBase, totalNum, anticNum, saldoPendiente,
     now(), propsData.length, notasContrato || '']
  );

  for (let i = 0; i < propsData.length; i++) {
    const p = propsData[i];
    await run(db,
      `INSERT INTO propiedades (contrato_token, num_propiedad, tipo, paquete, entregables,
       fecha_sesion, hora_sesion, direccion, link_maps, orientacion, sobre_la_propiedad,
       referencias, fachada_url, perimetro_url, logo_url, datos_especificos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [token, i + 1, p.tipo || tipoPaqueteFinal, p.paquete || paqueteBaseFinal,
       p.entregables || '', p.fechaSesion || '', p.horaSesion || '',
       p.direccion || '', p.linkMaps || '', p.orientacion || '',
       p.sobreLaPropiedad || '', p.referencias || '', p.fachadaUrl || '',
       p.perimetroUrl || '', p.logoUrl || '', JSON.stringify(p.datosEspecificos || {})]
    );
  }

  await crearTokenPortal(db, token, 72);

  const linkPortal = `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`;
  return ok({ ok: true, token, folio, url: linkPortal, linkPortal });
}
```

---

### B. `worker/src/routes/portal.js` — cambios en `firmaCliente` y `guardarConfiguracion`

**`firmaCliente` (líneas 160–249):** El guard eliminado era `contrato.tipo_contrato !== 'particular' &&` antes de `adicionalesSeleccionados?.length`. El bloque ahora es:

```js
if (adicionalesSeleccionados?.length) {
  for (const clave of adicionalesSeleccionados) {
    const p = await queryOne(db, 'SELECT precio FROM paquetes WHERE clave = ?', [clave]);
    if (p) {
      precioTotal += p.precio;
      adicionalesAceptados.push(clave);
    }
  }
}
```

Y el payload al adapter (fire-and-forget via `callAdapter`):

```js
callAdapter(ctx, env, 'procesarFirma', {
  token, firmaBase64,
  contrato: {
    ...contrato,
    precio_total: precioTotal,
    anticipo: anticipo,
    saldo_pendiente: saldoPendiente,
    estatus: nuevoEstatus,
    correo_cliente: correoCliente || contrato.correo_cliente,
    telefono_cliente: telefonoCliente || contrato.telefono_cliente,
    adicionales_json: JSON.stringify(adicionalesNombres),
    paquete_base: pkMap[contrato.paquete_base] || contrato.paquete_base,
  },
  linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`,
  propiedades: propiedadesFirma.map(p => ({ ...p, paquete: pkMap[p.paquete] || p.paquete })),
  entregables: entregablesAdapter
});
```

Nota: `entregablesAdapter = paqueteInfo?.entregables || propiedadesFirma[0]?.entregables || ''` donde `paqueteInfo` viene de `SELECT entregables FROM paquetes WHERE clave = ?` usando `contrato.paquete_base`.

**`guardarConfiguracion` (línea 266–268):**
```js
if (action === 'guardarConfiguracion') {
  return err('Este endpoint ha sido deprecado en v5.0. Los contratos ahora se crean directamente con propiedades desde el admin.', 410);
}
```

---

### C. `frontend/admin.html` — funciones nuevas y reemplazadas

#### Variables globales añadidas (junto a las existentes):
```js
var tiposProp  = {};  // { 1: 'Residencial', 2: 'Terreno', ... }
var numProps   = 1;
```
`precioManual` y `anticipoManual` ya existían como `let` en el archivo.

#### `leerEstadoProps` / `restaurarEstadoProps`
```js
function leerEstadoProps() {
  var estado = {};
  for (var i = 1; i <= numProps; i++) {
    estado[i] = {
      nombreServicio: (document.getElementById('prop-nombre-servicio-' + i) || {value:''}).value,
      paquete:        (document.getElementById('prop-paquete-' + i)        || {value:''}).value,
      entregables:    (document.getElementById('prop-entregables-' + i)    || {value:''}).value,
      fecha:          (document.getElementById('prop-fecha-' + i)          || {value:''}).value,
      hora:           (document.getElementById('prop-hora-' + i)           || {value:'10:00'}).value,
    };
  }
  return estado;
}

function restaurarEstadoProps(estado) {
  for (var i = 1; i <= numProps; i++) {
    var s = estado[i];
    if (!s) continue;
    var nomEl  = document.getElementById('prop-nombre-servicio-' + i);
    var entEl  = document.getElementById('prop-entregables-' + i);
    var fechEl = document.getElementById('prop-fecha-' + i);
    var horaEl = document.getElementById('prop-hora-' + i);
    var paqEl  = document.getElementById('prop-paquete-' + i);
    if (nomEl  && s.nombreServicio) nomEl.value  = s.nombreServicio;
    if (entEl  && s.entregables)    entEl.value  = s.entregables;
    if (fechEl && s.fecha)          fechEl.value = s.fecha;
    if (horaEl && s.hora)           horaEl.value = s.hora;
    if (paqEl  && s.paquete) {
      for (var j = 0; j < paqEl.options.length; j++) {
        if (paqEl.options[j].value === s.paquete) { paqEl.selectedIndex = j; break; }
      }
    }
  }
}
```

#### `renderPropCard` / `renderTodasLasProps` / `agregarPropiedad`
```js
function renderPropCard(i, tipo) {
  return '<div class="prop-card-par" ...>' +
    '...' +
    (numProps > 1 ? '<button ... onclick="quitarPropiedad(' + i + ')">Quitar</button>' : '') +
    '...' +
    '<button ... data-prop="' + i + '" data-tipo="Residencial" onclick="setTipoProp(' + i + ',\'Residencial\')">Residencial</button>' +
    '<button ... data-prop="' + i + '" data-tipo="Terreno" onclick="setTipoProp(' + i + ',\'Terreno\')">Terreno</button>' +
    '<input ... id="prop-nombre-servicio-' + i + '">' +
    '<select id="prop-paquete-' + i + '" onchange="onPaqueteChangeProp(' + i + ')"><option value="">— Sin paquete —</option></select>' +
    '<textarea id="prop-entregables-' + i + '" maxlength="2000"></textarea>' +
    '<input type="date" id="prop-fecha-' + i + '">' +
    '<input type="time" id="prop-hora-' + i + '" value="10:00">' +
  '</div>';
}

function renderTodasLasProps() {
  var estado = leerEstadoProps();
  var container = document.getElementById('props-container');
  if (!container) return;
  var html = '';
  for (var i = 1; i <= numProps; i++) {
    if (!tiposProp[i]) tiposProp[i] = 'Residencial';
    html += renderPropCard(i, tiposProp[i]);
  }
  container.innerHTML = html;
  for (var j = 1; j <= numProps; j++) actualizarSelectPaqueteProp(j);
  restaurarEstadoProps(estado);
}

function agregarPropiedad() {
  numProps++;
  tiposProp[numProps] = 'Residencial';
  renderTodasLasProps();
}
```

#### `quitarPropiedad`
```js
function quitarPropiedad(num) {
  if (numProps <= 1) return;
  var estado = leerEstadoProps();
  var nuevosTipos = {};
  var nuevoEstado = {};
  var j = 1;
  for (var i = 1; i <= numProps; i++) {
    if (i === num) continue;
    nuevosTipos[j] = tiposProp[i] || 'Residencial';
    nuevoEstado[j] = estado[i] || {};
    j++;
  }
  tiposProp = nuevosTipos;
  numProps--;
  var container = document.getElementById('props-container');
  if (!container) return;
  var html = '';
  for (var k = 1; k <= numProps; k++) {
    html += renderPropCard(k, tiposProp[k]);
  }
  container.innerHTML = html;
  for (var m = 1; m <= numProps; m++) actualizarSelectPaqueteProp(m);
  restaurarEstadoProps(nuevoEstado);
}
```

#### `setTipoProp` / `actualizarSelectPaqueteProp` / `onPaqueteChangeProp`
```js
function setTipoProp(num, tipo) {
  tiposProp[num] = tipo;
  var btns = document.querySelectorAll('.par-tipo-btn[data-prop="' + num + '"]');
  btns.forEach(function(b) {
    b.classList.toggle('activo-par', b.dataset.tipo === tipo);
  });
  actualizarSelectPaqueteProp(num);
  actualizarPaquetesAdicionales();
}

function actualizarSelectPaqueteProp(num) {
  var select = document.getElementById('prop-paquete-' + num);
  if (!select) return;
  var tipo = tiposProp[num] || 'Residencial';
  var valorActual = select.value;
  var disponibles = paquetes.filter(function(p) {
    if (p.EsAdicional) return false;
    return p.Tipo === tipo || p.Tipo === 'Ambos';
  });
  select.innerHTML = '<option value="">— Sin paquete —</option>';
  disponibles.forEach(function(p) {
    var opt = document.createElement('option');
    opt.value            = p.Clave;
    opt.dataset.precio   = p.Precio    || 0;
    opt.dataset.entregables = p.Entregables || '';
    opt.dataset.nombre   = p.Nombre    || p.Clave;
    opt.textContent = (p.Nombre || p.Clave) + (p.Precio ? ' — ' + fmxn(p.Precio) : '');
    select.appendChild(opt);
  });
  if (valorActual) {
    for (var i = 0; i < select.options.length; i++) {
      if (select.options[i].value === valorActual) { select.selectedIndex = i; break; }
    }
  }
}

function onPaqueteChangeProp(num) {
  var select   = document.getElementById('prop-paquete-' + num);
  var textarea = document.getElementById('prop-entregables-' + num);
  if (!select || !textarea) return;
  var val = select.value;
  if (!val) return;
  var opt = select.options[select.selectedIndex];
  textarea.value = opt.dataset.entregables || '';
  actualizarPrecio();
}
```

#### `cargarPaquetes` / `actualizarPaquetesAdicionales` / `actualizarPrecio`
```js
async function cargarPaquetes() {
  try {
    const data = await apiGet({ action: 'listarPaquetes' });
    if (data.ok) {
      paquetes = data.paquetes;
      actualizarPaquetesAdicionales();
      renderTodasLasProps();
    }
  } catch (e) { console.error('Error cargando paquetes:', e); }
}

function actualizarPaquetesAdicionales() {
  var tipo = tiposProp[1] || 'Residencial';
  var adds = paquetes.filter(function(p) { return p.EsAdicional && (p.Tipo === tipo || p.Tipo === 'Ambos'); });

  var lista    = document.getElementById('lista-adicionales');
  var campoAdd = document.getElementById('campo-adicionales');
  if (!lista || !campoAdd) return;

  if (!adds.length) {
    campoAdd.style.display = 'none';
    lista.innerHTML = '';
  } else {
    campoAdd.style.display = 'block';
    lista.innerHTML = adds.map(function(p) {
      return '<label class="add-item">' +
        '<input type="checkbox" value="' + esc(p.Clave) + '" data-precio="' + p.Precio + '">' +
        '<span class="add-item-nombre">' + esc(p.Nombre) + '</span>' +
        '<span class="add-item-precio">+' + fmxn(p.Precio) + '</span>' +
        '</label>';
    }).join('');
  }

  var contCatalogo = document.getElementById('campo-extras-catalogo');
  if (contCatalogo) {
    if (!adds.length) {
      contCatalogo.innerHTML = '';
    } else {
      contCatalogo.innerHTML = '<p ...>Del catálogo:</p>' +
        adds.map(function(p) {
          return '<label class="add-item">' +
            '<input type="checkbox" class="extra-acordado-cat-cb" value="' + esc(p.Clave) + '" data-precio="' + p.Precio + '" onchange="actualizarPrecio()">' +
            '<span class="add-item-nombre">' + esc(p.Nombre) + '</span>' +
            '<span class="add-item-precio">+' + fmxn(p.Precio) + '</span>' +
            '</label>';
        }).join('');
    }
  }

  actualizarPrecio();
}

function actualizarPrecio() {
  if (precioManual) return;
  var baseTotal = 0;
  for (var i = 1; i <= numProps; i++) {
    var sel = document.getElementById('prop-paquete-' + i);
    if (sel && sel.value) {
      var opt = sel.options[sel.selectedIndex];
      baseTotal += parseFloat((opt && opt.dataset && opt.dataset.precio) || 0) || 0;
    }
  }
  var sumaExtras = 0;
  document.querySelectorAll('.extra-acordado-cat-cb:checked').forEach(function(cb) {
    sumaExtras += parseFloat(cb.dataset.precio) || 0;
  });
  document.querySelectorAll('.extra-libre-precio').forEach(function(inp) {
    sumaExtras += parseFloat(inp.value) || 0;
  });
  document.getElementById('est-precio-total').value = baseTotal + sumaExtras;
  actualizarAnticipo('est');
}
```

#### `crearContrato` (admin)
```js
async function crearContrato() {
  // ... (lee est-nombre, est-correo, est-telefono, est-precio-total, est-anticipo)
  // Valida nombre y ptotal
  // Lee adds desde #lista-adicionales :checked
  // Lee extrasAcordados desde .extra-acordado-cat-cb:checked + #lista-extras-acordados > div
  // Loop i=1..numProps: lee tiposProp[i], prop-nombre-servicio-i, prop-paquete-i, prop-entregables-i, prop-fecha-i, prop-hora-i
  // Valida que cada prop tenga (nombreSvc || paqClave) y fechaProp
  // paqueteVal = paqClave || nombreSvc
  // Si i===1: paqueteBase = paqueteVal; tipoPaquete = tipoProp
  // POST body: { action:'crearContrato', nombreCliente, correoCliente, telefonoCliente,
  //              tipoPaquete, paqueteBase, adicionales, extrasAcordados,
  //              precioTotal, anticipo, numPropiedades:numProps, propiedades }
  // Cada prop en propiedades: { numPropiedad:i, tipo, paquete:paqueteVal, entregables, fechaSesion, horaSesion }
  // En éxito: renderiza resultado-crear con link + botón copiar + botón WhatsApp; llama limpiarFormCrear()
}
```

#### `limpiarFormCrear`
```js
function limpiarFormCrear() {
  // Limpia est-nombre, est-correo, est-telefono, est-precio-total, est-anticipo
  // Limpia lista-extras-acordados, desmarca .extra-acordado-cat-cb
  precioManual   = false;
  anticipoManual = false;
  numProps       = 1;
  tiposProp      = { 1: 'Residencial' };
  renderTodasLasProps();
  actualizarPaquetesAdicionales();
  cerrarDropdownAC();
  // Quita #ac-logo-hint-est si existe
}
```

#### `duplicarContrato`
```js
function duplicarContrato() {
  var ctx = window._contratoActivo;  // { c: {...}, adicionales: [...], propiedades: [...] }
  // c tiene campos PascalCase: NombreCliente, CorreoCliente, TelefonoCliente, PrecioTotal, Anticipo
  // propiedades: [{ Tipo, Paquete, Entregables, FechaSesion, HoraSesion }]
  // adicionales: array mezclado de strings (claves ofrecidas) y objetos (extras acordados)
  cerrarPanel();
  irANuevo();
  requestAnimationFrame(function() {
    // Llena est-nombre, est-correo, est-telefono
    numProps  = Math.max(1, propiedades.length);
    tiposProp = {};
    propiedades.forEach(function(p, i) { tiposProp[i + 1] = p.Tipo || 'Residencial'; });
    if (!propiedades.length) tiposProp[1] = 'Residencial';
    renderTodasLasProps();
    // Pobla prop-nombre-servicio-n, prop-paquete-n, prop-entregables-n, prop-fecha-n, prop-hora-n
    // nomEl.value = p.Paquete (nota: usa Paquete como nombre del servicio)
    // Marca adicionales string en #lista-adicionales
    precioManual = anticipoManual = true;
    // Llena est-precio-total, est-anticipo
  });
}
```

---

### D. `frontend/portal.html` — cambios en `renderEtapa1` y `renderRevision`

Las variables `esParticular` y `esP` fueron eliminadas completamente (grep confirma 0 coincidencias). Los condicionales que las usaban fueron reemplazados:

| Condición original | Condición nueva | Efecto |
|--------------------|-----------------|--------|
| `!esParticular && props.length > 0` | `props.length === 1` | Resumen inline solo para 1 propiedad |
| `extrasAcordados.length > 0 && !esParticular` | `extrasAcordados.length > 0` | Siempre muestra extras acordados |
| `precioBase > 0 && !esParticular && addons.length > 0` | `precioBase > 0 && addons.length > 0` | Precio base visible si hay addons |
| `esParticular && d.notasContrato` | `d.notasContrato` | Siempre muestra notas si existen |
| `esParticular && props.length > 0` (resúmenes multi-prop) | `props.length > 1` | Resúmenes solo para 2+ props |
| `addons.length > 0 && !esParticular` | `addons.length > 0` | Siempre muestra addons si los hay |
| Header del form card: if/else por tipo | Siempre rich format (paquete + fecha) | |

En `renderRevision`, el bloque `if (esP) { ... } else { ... }` fue unificado a un solo `props.forEach` con la rama rica (`fp.direccion`, `fp.orientacion`, `p.entregables`).

Split de entregables en portals multi-prop: `p.entregables.replace(/\\n/g, '\n').split(/[·|\n]/)` — nota el `·` (U+00B7, middle dot) en la regex.

---

## Lo que debes buscar

### 1. Bugs funcionales críticos

- **Estado DOM:** `leerEstadoProps` lee `numProps` (el valor global) pero `numProps` ya podría haber sido decrementado antes de que se haga el re-render en `quitarPropiedad`. ¿El snapshot se toma en el momento correcto?
- **`restaurarEstadoProps` y paquetes:** La restauración del `select` busca por `value`. Si `actualizarSelectPaqueteProp` reconstruyó el select y el paquete ya no existe para ese tipo, la selección queda en index 0 (vacío). ¿Es ese el comportamiento correcto?
- **`onPaqueteChangeProp` y texto libre:** La función hace `if (!val) return` — si el usuario ya escribió entregables manualmente y luego limpia el select, los entregables no se borran. ¿Es intencional o un bug?
- **`actualizarPrecio` y `precioManual`:** Si `precioManual = true` y el usuario cambia el paquete de una propiedad, el precio no se recalcula. ¿Qué pasa cuando hay 2+ props y el usuario cambia una de ellas después de haber tocado el precio manualmente?
- **`crearContrato` y anticipo:** El anticipo del frontend se envía como `anticipo: anticipo` (puede ser 0). El backend lo acepta. ¿El backend clampea correctamente cuando `anticipo=0` y `totalNum=5000`? Traza el `Math.min`.
- **`limpiarFormCrear` y adicionales en lista-adicionales:** Los checkboxes de `#lista-adicionales` son regenerados por `actualizarPaquetesAdicionales()`, que se llama después. Pero ¿hay algún caso donde un check quede marcado entre el clear y el re-render?
- **`duplicarContrato` y timing:** `renderTodasLasProps()` es sincrónico y construye el DOM. Justo después se leen `prop-paquete-N` para intentar seleccionar la clave. ¿Están ya los paquetes cargados en `paquetes` en ese momento? ¿O pueden estar vacíos si `cargarPaquetes` no ha terminado?

### 2. Regresiones en contratos `particular` existentes

- El portal ya no tiene `esParticular`. Para un contrato `particular` existente con `propiedades[]` (puede tener `tipo=null`, `paquete=null`): ¿qué muestra `props.length === 1` si hay exactamente 1 propiedad con `paquete=null`? ¿El resumen inline queda en blanco o genera un error?
- Para contratos `particular` con 0 propiedades (existían cuando `propiedades` era opcional), `props.length === 1` es false y `props.length > 1` es false — ¿hay alguna sección que quede completamente vacía y confunda al usuario?
- El header del form card de propiedad ahora siempre muestra `p.paquete || 'Propiedad N'` — para contratos particulares donde `p.paquete` es la clave cruda (ej. `RES-COMBO`), ¿el portal muestra la clave o el nombre? Traza `obtenerPortal` → qué campo envía como `paquete` al frontend.

### 3. Backend — payload y tipos

- En `crearContrato`, la columna `num_propiedades` recibe `propsData.length`. El campo `numPropiedades` del body también se envía desde el frontend pero se ignora completamente en el backend. Confirma que no hay ningún lugar donde `numPropiedades` (del body) se use en la lógica posterior.
- `p.paquete || paqueteBaseFinal` en el INSERT de propiedades: si `paqueteBase` en el body es la clave de catálogo de prop 1 y `p.paquete` para una prop N es texto libre (no es una clave de catálogo), ¿qué entra en la columna `paquete`? ¿Es correcto?
- `p.tipo || tipoPaqueteFinal` en el INSERT de propiedades: si se envía `tipo: ''` (string vacío), `p.tipo` es truthy? No — string vacío es falsy. ¿Es posible que el frontend envíe `tipo: ''`?
- El campo `anticipo` en el INSERT: `anticNum` es el anticipo clampeado. ¿La columna `anticipo` de la tabla es el anticipo que Bruno fijó (antes del clamp), o el clampeado? ¿Importa para el cálculo de `saldo_pendiente`?

### 4. Adapter (Google Apps Script / Rhino)

El adapter recibe `procesarFirma` con:
```
contrato.adicionales_json = JSON.stringify(adicionalesNombres)
contrato.paquete_base = pkMap[contrato.paquete_base] || contrato.paquete_base  // nombre resuelto
propiedades = [...] // cada p tiene paquete resuelto via pkMap
entregables = paqueteInfo?.entregables || propiedadesFirma[0]?.entregables
```

Para contratos nuevos v5 donde `paquete_base` es texto libre (no clave de catálogo), `pkMap[texto_libre]` devuelve `undefined`, entonces se usa `contrato.paquete_base` (el texto libre). ¿El adapter maneja correctamente un `paquete_base` que no sea una clave de catálogo? ¿Lo usa para nombrar carpetas en Drive?

Para contratos con múltiples propiedades, `entregables` del callback al adapter es solo el de `paqueteInfo || propiedadesFirma[0]` — es decir, solo los de la propiedad 1. ¿El adapter necesita entregables de todas las propiedades? ¿O solo los usa para el PDF y el PDF usa `propiedades[]` directamente?

### 5. Consistencia de datos entre frontend y backend

- El frontend envía `horaSesion: horaProp` donde `horaProp` viene del `input[type="time"]` con `value="10:00"`. Si el usuario no cambia la hora, ¿el backend recibe `"10:00"` o `""`? El input `time` tiene un `value` HTML de `"10:00"` pero si el usuario interactuó con el formulario y no escribió nada, ¿qué devuelve `.value`?
- El campo `entregables` en el portal se llena desde `opt.dataset.entregables` cuando el usuario elige paquete. Ese dataset viene de `p.Entregables` del catálogo. ¿El formato de separación en el catálogo (`·` o `\n` o `|`) es consistente con el split del portal (`/[·|\n]/`)?

### 6. UX — pérdida de datos

- Cuando el usuario tiene 3 propiedades con datos escritos y quita la propiedad 2, las propiedades 1 y 3 se renumeran a 1 y 2. `restaurarEstadoProps(nuevoEstado)` se llama con el estado renumerado. Pero `actualizarSelectPaqueteProp` ya reconstruyó los selects. ¿El `restaurarEstadoProps` restaura el `paquete` del select correcto después de que se reconstruyó?
- Si `cargarPaquetes()` se llama mientras el usuario ya tiene props con datos escritos (por ejemplo, en un refresh del panel), `renderTodasLasProps()` hace `leerEstadoProps()` primero y luego `restaurarEstadoProps()`. Pero las props están en el DOM ya — ¿el `leerEstadoProps` captura correctamente el estado antes del `innerHTML = html`? Traza el orden de operaciones en `renderTodasLasProps`.

### 7. Seguridad / validaciones

- `crearContrato` en el backend valida `fechaSesion` solo si `vp.fechaSesion` es truthy. Si la propiedad 1 no tiene `fechaSesion`, el `folio` es `null` — eso es intencional. Pero ¿el admin requiere la fecha en el frontend antes de enviar? Revisa la validación en `crearContrato()` del frontend: `if (!fechaProp)` retorna error. Confirma que `input[type="date"].value` devuelve `''` cuando no hay fecha.
- `adicionalesOfrecidos` en el backend: `(adicionales || []).filter(Boolean)` — filtra strings vacíos. Si el frontend envía `["ADD-COMOLLEGAR", ""]`, el vacío se filtra. ¿Puede el frontend enviar strings vacíos?
- XSS en admin.html: `renderPropCard` inserta `i` directamente en el HTML como número entero — no hay riesgo. Pero ¿hay algún valor de usuario que se inserte sin `esc()` en el HTML generado por las funciones nuevas?

---

## Formato de respuesta

Para cada problema encontrado:

```
### [CATEGORÍA] [SEVERIDAD: CRÍTICO / IMPORTANTE / MENOR / OMISIÓN] — Título corto

**Ubicación**: nombre_del_archivo:función_o_línea
**Descripción**: Qué está mal exactamente.
**Impacto**: Qué falla en producción si no se corrige.
**Solución sugerida**: Cambio concreto mínimo que resuelve el problema.
```

Al final, resumen ejecutivo:
- Total por severidad
- Los 3 problemas de mayor urgencia en orden
- Veredicto: ¿requiere hotfix antes de las pruebas manuales, o puede verificarse durante las pruebas?
