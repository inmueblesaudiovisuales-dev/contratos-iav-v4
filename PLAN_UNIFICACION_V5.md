# Plan de unificación — Contratos v5.0

> Documento de implementación para unificar "Contratos particulares" dentro de "Contratos estándar".
> Sistema actual: v4.0 (Cloudflare Workers + D1). Sistema anterior: v3.0 (Google Apps Script + Sheets), sin cambios.

---

## Objetivos

1. **Eliminar "Cotización particular"** — unificar todo en un solo tipo de contrato.
2. **Tipo de propiedad por propiedad** — cada propiedad puede ser `Residencial` o `Terreno`, no global.
3. **Cotizar fuera del catálogo** — el usuario puede escribir texto libre como nombre del servicio y entregables, sin limitarse a los paquetes predefinidos.
4. **Quitar límite de 5 propiedades** — reemplazar el dropdown de 1-5 con botón "Agregar propiedad" sin tope fijo.
5. **Adicionales del portal disponibles para todos** — quitar el guard `tipo_contrato !== 'particular'`.
6. **Eliminar flujo de `configurar`** — deprecar `guardarConfiguracion` y tokens tipo `configurar`.

> **Nota sobre datos**: Los contratos en v3.0 siguen vivos sin cambios. Sin embargo, si existen contratos con `tipo_contrato = 'particular'` en la instancia D1 actual, deben considerarse antes del deploy — ver P12, P13 y P14.

---

## Archivos a modificar

| Archivo | Cambios |
|---------|---------|
| `worker/schema.sql` | Referencia — sin cambios estructurales |
| `worker/src/routes/contratos.js` | `crearContrato`, quitar referencias a `tipo_contrato` |
| `worker/src/routes/portal.js` | `obtenerPortal`, `firmaCliente`, deprecar `guardarConfiguracion` |
| `worker/src/index.js` | Quitar ruta `/api/guardarConfiguracion` (o mantener con error 410) |
| `frontend/admin.html` | Reemplazar los 2 sub-tabs por 1 solo form unificado |
| `frontend/portal.html` | Quitar todos los condicionales `esParticular` |

---

## 1. Schema — sin cambios

El schema actual ya soporta todo lo necesario:

```sql
-- contratos.tipo_contrato → siempre 'estandar' (o quitar el DEFAULT 'particular').
-- contratos.paquete_base → acepta NULL o texto libre (ya lo hace).
-- contratos.num_propiedades → ya existe, sin límite en schema.
-- propiedades.tipo → 'Residencial' o 'Terreno' por propiedad (ya existe).
-- propiedades.paquete → clave de catálogo o texto libre (ya lo hace).
-- propiedades.entregables → texto libre (ya lo hace).
```

**Acción**: Solo cambiar el DEFAULT de `tipo_contrato` a `'estandar'` en schema.sql (referencia). No se necesita migración D1.

---

## 2. Backend — `worker/src/routes/contratos.js`

### 2.1 `crearContrato` (línea 97-155)

**Cambios**:

- Eliminar la distinción `tipoContrato === 'estandar'` vs `'particular'`.
- Recibir `numPropiedades` (puede ser 1-20, sin tope).
- Recibir array `propiedades` con al menos 1 elemento. Cada elemento:
  - `numPropiedad` (1, 2, 3...)
  - `tipo` — `'Residencial'` o `'Terreno'` (obligatorio)
  - `paquete` — clave de catálogo o texto libre (opcional)
  - `entregables` — texto libre (opcional, se auto-completa si se eligió paquete del catálogo)
  - `fechaSesion`, `horaSesion`
- `paqueteBase` en contratos será el `paquete` de la propiedad 1 (puede ser clave o texto libre).
- `tipoPaquete` en contratos será el `tipo` de la propiedad 1.
- `precioBase` se calcula desde el catálogo si `paquete` es clave conocida; si es texto libre, se usa `precioTotal` (el usuario ya puso el precio manualmente).
- Generar `folio` desde `fechaSesion` de la propiedad 1 (siempre, sin condición).
- `tipo_contrato` se fuerza a `'estandar'` siempre.

**Payload esperado después del cambio**:

```json
{
  "nombreCliente": "Juan Pérez",
  "correoCliente": "juan@example.com",
  "telefonoCliente": "8123456789",
  "tipoPaquete": "Residencial",
  "paqueteBase": "RES-COMBO",
  "adicionales": ["ADD-COMOLLEGAR"],
  "extrasAcordados": [{"nombre": "Video extra", "precio": 1500}],
  "precioTotal": 7000,
  "anticipo": 3500,
  "numPropiedades": 2,
  "propiedades": [
    {
      "numPropiedad": 1,
      "tipo": "Residencial",
      "paquete": "RES-COMBO",
      "entregables": "Fotografía profesional\nVideo cinemático...",
      "fechaSesion": "2026-06-15",
      "horaSesion": "10:00"
    },
    {
      "numPropiedad": 2,
      "tipo": "Terreno",
      "paquete": "Producción de lote baldío",
      "entregables": "Drone\nFotos aéreas\nPlano de perímetro",
      "fechaSesion": "2026-06-16",
      "horaSesion": "11:00"
    }
  ]
}
```

**Código nuevo para `crearContrato`**:

```js
if (action === 'crearContrato') {
  const body = await request.json();
  const { nombreCliente, correoCliente, telefonoCliente,
          paqueteBase, tipoPaquete, adicionales, extrasAcordados,
          precioTotal, anticipo, numPropiedades, propiedades: propsData } = body;

  if (!nombreCliente) return err('Nombre del cliente requerido');
  if (!propsData || !propsData.length) return err('Al menos una propiedad es requerida');
  const totalNum = parseFloat(precioTotal) || 0;
  if (totalNum <= 0) return err('El precio total debe ser mayor a $0');
  const anticNum = anticipo !== undefined && anticipo !== '' ? parseFloat(anticipo) || 0 : 0;

  const token = uuid();
  const paquete = await queryOne(db, 'SELECT precio FROM paquetes WHERE clave = ?', [paqueteBase || '']);
  const precioBase = paquete?.precio ?? totalNum;
  const saldoPendiente = Math.max(0, totalNum - anticNum);

  const adicionalesOfrecidos = (adicionales || []).filter(Boolean);
  const extrasObjs = (extrasAcordados || []).map(e =>
    e.clave ? { clave: e.clave, precio: e.precio } : { nombre: e.nombre, precio: e.precio }
  );
  const adicionalesJSON = JSON.stringify([...adicionalesOfrecidos, ...extrasObjs]);

  // Siempre generar folio de propiedad 1
  const prop1 = propsData[0];
  const folio = prop1.fechaSesion ? generarFolio(prop1.fechaSesion) : null;

  await run(db,
    `INSERT INTO contratos (token, folio, nombre_cliente, correo_cliente, telefono_cliente,
     tipo_contrato, tipo_paquete, paquete_base, adicionales_json, precio_base, precio_total,
     anticipo, saldo_pendiente, estatus, fecha_creacion, num_propiedades)
     VALUES (?, ?, ?, ?, ?, 'estandar', ?, ?, ?, ?, ?, ?, ?, 'Pendiente firma', ?, ?)`,
    [token, folio, nombreCliente, correoCliente || '', telefonoCliente || '',
     tipoPaquete || '', paqueteBase || '',
     adicionalesJSON, precioBase, totalNum, anticNum, saldoPendiente,
     now(), numPropiedades || propsData.length]
  );

  for (const p of propsData) {
    await run(db,
      `INSERT INTO propiedades (contrato_token, num_propiedad, tipo, paquete, entregables,
       fecha_sesion, hora_sesion, direccion, link_maps, orientacion, sobre_la_propiedad,
       referencias, fachada_url, perimetro_url, logo_url, datos_especificos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [token, p.numPropiedad, p.tipo || tipoPaquete, p.paquete || paqueteBase,
       p.entregables || '', p.fechaSesion || '', p.horaSesion || '',
       p.direccion || '', p.linkMaps || '', p.orientacion || '',
       p.sobreLaPropiedad || '', p.referencias || '', p.fachadaUrl || '',
       p.perimetroUrl || '', p.logoUrl || '', JSON.stringify(p.datosEspecificos || {})]
    );
  }

  // Validación adicional: max 20 propiedades, fecha bien formada
  if (propsData.length > 20) return err('Máximo 20 propiedades por contrato');
  const fechaRe = /^\d{4}-\d{2}-\d{2}$/;
  if (prop1.fechaSesion && !fechaRe.test(prop1.fechaSesion)) {
    return err('Formato de fecha inválido en propiedad 1 (esperado YYYY-MM-DD)');
  }
  // Validar entregables (server-side, el frontend limita con maxlength=2000)
  for (const p of propsData) {
    if (p.entregables && p.entregables.length > 2000) return err('Entregables de propiedad ' + p.numPropiedad + ' exceden 2000 caracteres');
  }

  await crearTokenPortal(db, token, 72);

  const linkPortal = `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`;
  return ok({ ok: true, token, folio, url: linkPortal, linkPortal });
}
```

### 2.2 `actualizarContratoUpsell` — sin cambios

Ya maneja tanto claves de catálogo como servicios libres (`serviciosLibres`). Funciona igual.

### 2.3 `guardarConfiguracion` — DEPRECAR

Este endpoint solo se usaba para contratos particulares. Se elimina la ruta en `index.js`. Los endpoints relacionados (`actualizarCarpeta`, `actualizarCalendarEvent`, `actualizarPdfUrl`) se mantienen porque son callbacks del adapter.

---

## 3. Backend — `worker/src/routes/portal.js`

### 3.1 `obtenerPortal` — cambios mínimos

- `paqueteBase` ya tiene fallback `|| contratoFinal.paquete_base`, funciona con texto libre.
- `esParticular` ya no se usa en el backend (solo lo consume el frontend). No tocar nada aquí.

### 3.2 `firmaCliente` — eliminar guard de particulares

**Línea 175**, cambiar:

```js
// Antes:
if (contrato.tipo_contrato !== 'particular' && adicionalesSeleccionados?.length) {

// Después:
if (adicionalesSeleccionados?.length) {
```

Con esto, cualquier contrato puede sumar adicionales en el portal.

### 3.3 `guardarConfiguracion` — DEPRECAR

Marcar el endpoint para devolver 410 Gone:

```js
if (action === 'guardarConfiguracion') {
  return err('Este endpoint ha sido deprecado. Los contratos ahora se configuran desde el admin.', 410);
}
```

### 3.4 `obtenerPortal` — quitar referencias a `tipoContrato` que ya no importan

La propiedad `tipoContrato` se puede seguir devolviendo (el frontend la ignora después del cambio), o se puede quitar del response. Recomendación: **devolver siempre `'estandar'`** para no romper nada.

---

## 4. Backend — `worker/src/index.js`

### 4.1 Quitar ruta de `guardarConfiguracion`

Si el router tiene un `case 'guardarConfiguracion'`, se puede:
- Dejar que caiga en `handlePortal` y ahí devolver 410 (recomendado).
- O quitar la ruta del todo.

---

## 5. Frontend — `admin.html`

### 5.1 Eliminar los sub-tabs "Estándar" / "Cotización particular"

**Líneas 674-803**: Reemplazar todo el bloque de sub-tabs y los dos formularios por UN solo formulario.

**HTML nuevo**:

```html
<!-- NUEVO CONTRATO (UNIFICADO) -->
<div id="sec-nuevo" class="seccion">
  <div class="form-card">
    <h2>Nuevo contrato</h2>
    <p class="form-desc">Configura el contrato para tu cliente. Agrega una o más propiedades.</p>

    <!-- Datos del cliente -->
    <div class="campo">
      <label>Nombre del cliente</label>
      <input type="text" id="est-nombre" placeholder="Nombre completo">
    </div>
    <div class="fila-2">
      <div class="campo">
        <label>Correo <span style="font-weight:400;color:var(--ink-3)">(opcional)</span></label>
        <input type="email" id="est-correo" placeholder="correo@ejemplo.com">
      </div>
      <div class="campo">
        <label>Teléfono</label>
        <input type="text" id="est-telefono" placeholder="812 345 6789">
      </div>
    </div>

    <!-- Propiedades dinámicas -->
    <div id="props-container"></div>
    <button type="button" class="btn-secundario btn-sm" onclick="agregarPropiedad()" style="margin-bottom:16px">
      + Agregar propiedad
    </button>

    <!-- Adicionales a ofrecer en el portal -->
    <div class="campo" id="campo-adicionales">
      <label>Opciones adicionales a ofrecer al cliente</label>
      <p style="font-size:11px;color:var(--ink-3);margin-bottom:8px;line-height:1.5">Las opciones marcadas aparecerán como toggles en el portal del cliente. El precio final se recalcula cuando el cliente las seleccione.</p>
      <div class="add-lista" id="lista-adicionales"></div>
    </div>

    <!-- Servicios extra ya acordados -->
    <div class="campo" style="background:var(--page);border:1px solid var(--border);border-radius:8px;padding:14px">
      <label style="margin-bottom:6px">Servicios extra ya acordados <span style="font-weight:400;color:var(--ink-3)">(opcional)</span></label>
      <p style="font-size:11px;color:var(--ink-3);margin-bottom:10px;line-height:1.5">Estos servicios están ya confirmados con el cliente y se suman al precio total desde el inicio.</p>
      <div id="campo-extras-catalogo" style="margin-bottom:8px"></div>
      <div id="lista-extras-acordados" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px"></div>
      <button type="button" class="btn-secundario btn-sm" onclick="agregarExtraLibre()" style="font-size:12px">
        + Agregar servicio personalizado
      </button>
    </div>

    <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">

    <!-- Precio y anticipo -->
    <div class="fila-2">
      <div class="campo">
        <label>Precio total <span style="font-weight:400;text-transform:none;letter-spacing:0">(editable)</span></label>
        <input type="number" id="est-precio-total" placeholder="0" oninput="precioManual=true">
      </div>
      <div class="campo">
        <label>Anticipo (50% por defecto)</label>
        <input type="number" id="est-anticipo" placeholder="0" oninput="anticipoManual=true">
      </div>
    </div>

    <div class="form-msg" id="msg-crear"></div>
    <button class="btn-primario gold" style="width:100%;margin-top:6px" id="btn-crear" onclick="crearContrato()">
      Crear contrato y generar link
    </button>
    <div id="resultado-crear"></div>
  </div>
</div>
```

### 5.2 Función `agregarPropiedad()`

Reemplaza `renderPropCardsPar(n)`. Renderiza cards de propiedad dinámicamente con botón "Quitar".

**Cada card de propiedad tiene**:

```
PROPIEDAD N
├── Tipo: [Residencial] [Terreno] (toggle buttons)
├── Nombre del servicio: [input texto libre]
├── Paquete base (opcional): [select con paquetes del catálogo filtrados por tipo]
├── Entregables: [textarea, auto-completa al elegir paquete]
├── Fecha de sesión: [date]
└── Hora: [time default 10:00]
```

**Código JS**:

```js
var numProps = 1;
var tiposProp = {}; // { 1: 'Residencial', 2: 'Terreno', ... }

function agregarPropiedad() {
  numProps++;
  renderTodasLasProps();
}

function quitarPropiedad(num) {
  if (numProps <= 1) return; // mínimo 1 propiedad
  // Reorganizar: remover esa propiedad y renumerar
  var nuevosTipos = {};
  var j = 1;
  for (var i = 1; i <= numProps; i++) {
    if (i === num) continue;
    nuevosTipos[j] = tiposProp[i] || 'Residencial';
    j++;
  }
  tiposProp = nuevosTipos;
  numProps--;
  renderTodasLasProps();
}

function renderTodasLasProps() {
  var container = document.getElementById('props-container');
  if (!container) return;
  var html = '';
  for (var i = 1; i <= numProps; i++) {
    if (!tiposProp[i]) tiposProp[i] = 'Residencial';
    html += renderPropCard(i, tiposProp[i]);
  }
  container.innerHTML = html;
  for (var j = 1; j <= numProps; j++) actualizarSelectPaqueteProp(j);
}

function renderPropCard(i, tipo) {
  return '<div class="prop-card-par" style="background:var(--page);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:12px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
      '<div style="font-size:12px;font-weight:700;color:var(--ink-2)">PROPIEDAD ' + i + '</div>' +
      (numProps > 1 ? '<button type="button" class="btn-secundario btn-sm" onclick="quitarPropiedad(' + i + ')" style="font-size:11px;padding:2px 8px">Quitar</button>' : '') +
    '</div>' +
    '<div class="campo">' +
      '<label>Tipo de propiedad</label>' +
      '<div style="display:flex;gap:8px">' +
        '<button type="button" class="par-tipo-btn' + (tipo !== 'Terreno' ? ' activo-par' : '') + '" onclick="setTipoProp(' + i + ',\'Residencial\')">Residencial</button>' +
        '<button type="button" class="par-tipo-btn' + (tipo === 'Terreno' ? ' activo-par' : '') + '" onclick="setTipoProp(' + i + ',\'Terreno\')">Terreno</button>' +
      '</div>' +
    '</div>' +
    '<div class="campo">' +
      '<label>Nombre del servicio</label>' +
      '<input type="text" id="prop-nombre-servicio-' + i + '" placeholder="Ej: Producción audiovisual residencial, Tour virtual aéreo...">' +
    '</div>' +
    '<div class="campo">' +
      '<label>Paquete base <span style="font-weight:400;color:var(--ink-3)">(opcional — llena entregables automáticamente)</span></label>' +
      '<select id="prop-paquete-' + i + '" onchange="onPaqueteChangeProp(' + i + ')"><option value="">— Sin paquete —</option></select>' +
    '</div>' +
    '<div class="campo">' +
      '<label>Entregables</label>' +
      '<textarea id="prop-entregables-' + i + '" maxlength="2000" placeholder="Se llena automáticamente al elegir paquete. Puedes editarlo." style="min-height:70px"></textarea>' +
    '</div>' +
    '<div class="fila-2">' +
      '<div class="campo"><label>Fecha de sesión</label><input type="date" id="prop-fecha-' + i + '"></div>' +
      '<div class="campo"><label>Hora</label><input type="time" id="prop-hora-' + i + '" value="10:00"></div>' +
    '</div>' +
  '</div>';
}

function setTipoProp(num, tipo) {
  tiposProp[num] = tipo;
  renderTodasLasProps(); // o solo cambiar el botón activo sin re-render completo
}

function actualizarSelectPaqueteProp(num) {
  var select = document.getElementById('prop-paquete-' + num);
  if (!select) return;
  var tipo = tiposProp[num] || 'Residencial';
  var disponibles = paquetes.filter(function(p) {
    if (p.EsAdicional) return false;
    return p.Tipo === tipo || p.Tipo === 'Ambos';
  });
  select.innerHTML = '<option value="">— Sin paquete —</option>';
  disponibles.forEach(function(p) {
    var opt = document.createElement('option');
    opt.value = p.Clave;
    opt.dataset.entregables = p.Entregables || '';
    opt.dataset.nombre = p.Nombre || p.Clave;
    opt.textContent = (p.Nombre || p.Clave) + (p.Precio ? ' — ' + fmxn(p.Precio) : '');
    select.appendChild(opt);
  });
}

function onPaqueteChangeProp(num) {
  var select = document.getElementById('prop-paquete-' + num);
  var textarea = document.getElementById('prop-entregables-' + num);
  if (!select || !textarea) return;
  var val = select.value;
  if (!val) return; // no limpiar si ya había texto libre
  var opt = select.options[select.selectedIndex];
  textarea.value = opt.dataset.entregables || '';
}
```

### 5.3 Función `crearContrato()` (unificada)

Reemplaza la función `crearContrato(tipo)` actual. Ya no recibe parámetro.

```js
async function crearContrato() {
  var msgId = 'msg-crear';
  var resId = 'resultado-crear';
  var btn = document.getElementById('btn-crear');

  setMsg(msgId, '', '');
  document.getElementById(resId).innerHTML = '';

  var nombre   = document.getElementById('est-nombre').value.trim();
  var correo   = document.getElementById('est-correo').value.trim();
  var telefono = document.getElementById('est-telefono').value.trim();
  var ptotal   = parseFloat(document.getElementById('est-precio-total').value) || 0;
  var anticipo = parseFloat(document.getElementById('est-anticipo').value) || 0;

  if (!nombre) { setMsg(msgId, 'El nombre del cliente es obligatorio.', 'error'); return; }
  if (!ptotal) { setMsg(msgId, 'El precio total es obligatorio.', 'error'); return; }

  var adds = Array.from(document.querySelectorAll('#lista-adicionales input[type="checkbox"]:checked')).map(c => c.value);

  var extrasAcordados = [];
  document.querySelectorAll('.extra-acordado-cat-cb:checked').forEach(cb => {
    extrasAcordados.push({ clave: cb.value, precio: parseFloat(cb.dataset.precio) || 0 });
  });
  document.querySelectorAll('#lista-extras-acordados > div').forEach(fila => {
    var nombreSvc = fila.querySelector('.extra-libre-nombre')?.value.trim();
    var precioSvc = parseFloat(fila.querySelector('.extra-libre-precio')?.value) || 0;
    if (nombreSvc && precioSvc) extrasAcordados.push({ nombre: nombreSvc, precio: precioSvc });
  });

  // Recopilar propiedades
  var propiedades = [];
  var paqueteBase = null;
  var tipoPaquete = 'Residencial';

  for (var i = 1; i <= numProps; i++) {
    var tipoProp = tiposProp[i] || 'Residencial';
    var nombreServicio = (document.getElementById('prop-nombre-servicio-' + i) || {value:''}).value.trim();
    var paqSel = document.getElementById('prop-paquete-' + i);
    var paqClave = paqSel ? paqSel.value : '';
    var entregables = (document.getElementById('prop-entregables-' + i) || {value:''}).value.trim();
    var fechaProp = (document.getElementById('prop-fecha-' + i) || {value:''}).value;
    var horaProp = (document.getElementById('prop-hora-' + i) || {value:'10:00'}).value;

    // Validar: al menos nombre de servicio o paquete
    if (!nombreServicio && !paqClave) {
      setMsg(msgId, 'Propiedad ' + i + ': necesitas un nombre de servicio o elegir un paquete.', 'error');
      return;
    }
    // Validar fecha
    if (!fechaProp) {
      setMsg(msgId, 'Propiedad ' + i + ': falta fecha de sesión.', 'error');
      return;
    }

    // El paquete puede ser clave de catálogo o texto libre
    var paqueteVal = paqClave || nombreServicio;

    if (i === 1) {
      paqueteBase = paqueteVal;
      tipoPaquete = tipoProp;
    }

    propiedades.push({
      numPropiedad: i,
      tipo: tipoProp,
      paquete: paqueteVal,
      entregables: entregables,
      fechaSesion: fechaProp,
      horaSesion: horaProp,
    });
  }

  var paqObj = paquetes.find(p => p.Clave === paqueteBase);
  var precioBase = paqObj ? paqObj.Precio : ptotal;

  var body = {
    action: 'crearContrato',
    tipoContrato: 'estandar',
    tipoPaquete: tipoPaquete,
    nombreCliente: nombre,
    correoCliente: correo,
    telefonoCliente: telefono,
    paqueteBase: paqueteBase,
    adicionales: adds,
    extrasAcordados: extrasAcordados,
    precioBase: precioBase,
    precioTotal: ptotal,
    anticipo: anticipo,
    numPropiedades: numProps,
    propiedades: propiedades,
  };

  // Nota: precioBase se recalcula en el backend desde el catálogo — el valor enviado aquí
  // es redundante pero inofensivo. tipoContrato: 'estandar' también es ignorado por el backend
  // (hardcoded en el INSERT). Ambos pueden eliminarse del payload en una limpieza futura.

  btn.disabled = true;
  btn.textContent = 'Creando...';

  try {
    var data = await apiPost(body);
    if (!data.ok) throw new Error(data.error || 'Error desconocido');

    var waTxt = 'Hola, aquí está tu link para revisar y firmar tu contrato con Inmuebles Audiovisuales: ' + data.url;
    var waTelNuevo = normalizarTelWA(telefono);
    var waUrl = 'https://wa.me/' + waTelNuevo + '?text=' + encodeURIComponent(waTxt);

    document.getElementById(resId).innerHTML = `
      <div class="resultado-box">
        <div class="resultado-titulo">Link del portal para el cliente</div>
        <div class="resultado-url">${esc(data.url)}</div>
        <div class="resultado-acciones">
          <button class="btn-copiar" data-url="${esc(data.url)}" onclick="copiarDesdeBtn(this)">
            <i class="ti ti-copy"></i> Copiar link
          </button>
          <a class="btn-wa" href="${esc(waUrl)}" target="_blank" rel="noopener">
            <i class="ti ti-brand-whatsapp"></i> WhatsApp
          </a>
        </div>
      </div>`;

    limpiarFormCrear();
    cargarContratos();
    _clientesCache = [];
    cargarClientesParaAutocomplete();
  } catch (e) {
    setMsg(msgId, 'Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Crear contrato y generar link';
  }
}

function limpiarFormCrear() {
  ['est-nombre','est-correo','est-telefono'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('est-precio-total').value = '';
  document.getElementById('est-anticipo').value = '';
  document.getElementById('lista-extras-acordados').innerHTML = '';
  document.querySelectorAll('.extra-acordado-cat-cb').forEach(cb => { cb.checked = false; });
  precioManual = false;
  anticipoManual = false;
  numProps = 1;
  tiposProp = { 1: 'Residencial' };
  renderTodasLasProps();
  actualizarPaquetesAdicionales(); // solo adicionales, ya no paquete base global
}
```

### 5.4 Eliminar funciones y variables obsoletas

- `mostrarSubTab()` — ya no hay sub-tabs.
- `crearContrato(tipo)` con parámetro — reemplazada por `crearContrato()` sin parámetro.
- `renderPropCardsPar()` — reemplazada por `renderTodasLasProps()`.
- `setTipoPar()` / `actualizarSelectPaquetePar()` / `onPaqueteChangePar()` — renombradas a `Prop`.
- Los IDs `par-*` desaparecen.
- El `<select id="par-num-props">` desaparece.
- La referencia a `#form-particular`, `#form-estandar`, `.sub-tab-btn` en CSS se limpian.

### 5.5 `actualizarPaquetes()` → renombrar a `actualizarPaquetesAdicionales()`

Ya no necesita manejar el select de paquete base global (`est-paquete`). Solo maneja la lista de adicionales y extras acordados:

```js
function actualizarPaquetesAdicionales() {
  var tipo = tiposProp[1] || 'Residencial'; // tipo de la propiedad 1 para filtrar adicionales
  var adds = paquetes.filter(p => p.EsAdicional && (p.Tipo === tipo || p.Tipo === 'Ambos'));

  var lista = document.getElementById('lista-adicionales');
  var campoAdd = document.getElementById('campo-adicionales');
  if (!adds.length) {
    campoAdd.style.display = 'none';
    lista.innerHTML = '';
  } else {
    campoAdd.style.display = 'block';
    lista.innerHTML = adds.map(p => `
      <label class="add-item">
        <input type="checkbox" value="${esc(p.Clave)}" data-precio="${p.Precio}">
        <span class="add-item-nombre">${esc(p.Nombre)}</span>
        <span class="add-item-precio">+${fmxn(p.Precio)}</span>
      </label>`).join('');
  }

  // Extras acordados del catálogo
  var contCatalogo = document.getElementById('campo-extras-catalogo');
  if (contCatalogo) {
    if (!adds.length) {
      contCatalogo.innerHTML = '';
    } else {
      contCatalogo.innerHTML = '<p style="font-size:11px;color:var(--ink-3);margin-bottom:6px">Del catálogo:</p>' +
        adds.map(p => `
          <label class="add-item" style="margin-bottom:4px">
            <input type="checkbox" class="extra-acordado-cat-cb" value="${esc(p.Clave)}" data-precio="${p.Precio}" onchange="actualizarPrecio()">
            <span class="add-item-nombre">${esc(p.Nombre)}</span>
            <span class="add-item-precio">+${fmxn(p.Precio)}</span>
          </label>`).join('');
    }
  }
}
```

### 5.6 `actualizarPrecio()` — simplificar

Ya no hay `est-paquete` global. El precio base se calcula sumando los precios de paquetes de catálogo seleccionados en las propiedades, o lo que el usuario haya puesto manualmente:

```js
function actualizarPrecio() {
  if (precioManual) return;
  // Sumar precios base de paquetes seleccionados en cada propiedad
  var baseTotal = 0;
  for (var i = 1; i <= numProps; i++) {
    var sel = document.getElementById('prop-paquete-' + i);
    if (sel && sel.value) {
      var opt = sel.options[sel.selectedIndex];
      baseTotal += parseFloat(opt?.dataset?.precio) || 0;
    }
  }
  // Sumar extras acordados
  var sumaExtras = 0;
  document.querySelectorAll('.extra-acordado-cat-cb:checked').forEach(cb => {
    sumaExtras += parseFloat(cb.dataset.precio) || 0;
  });
  document.querySelectorAll('.extra-libre-precio').forEach(inp => {
    sumaExtras += parseFloat(inp.value) || 0;
  });
  document.getElementById('est-precio-total').value = baseTotal + sumaExtras;
  actualizarAnticipo('est');
}
```

### 5.7 Vista de detalle — quitar condicional `TipoContrato === 'estandar'`

**Línea 1833**: Cambiar:

```js
// Antes:
<div class="info-fila"><span class="etiq">Tipo</span><span class="val">${c.TipoContrato === 'estandar' ? 'Estándar' : 'Particular'}</span></div>

// Después (simplificado, o eliminado porque ya no aporta):
// (eliminar la línea o dejarla como "Estándar" fijo)
```

### 5.8 Eliminar `duplicarContrato`

Si usaba el tipo anterior, verificar que funcione con el nuevo payload unificado.

---

## 6. Frontend — `portal.html`

### 6.1 Eliminar variable global `esParticular`

**Líneas 561, 980, 1285**: Reemplazar:

```js
// Antes:
var esParticular = d.tipoContrato === 'particular';

// Después:
// (eliminar la variable)
```

### 6.2 `renderEtapa1()` — unificar renderizado

- **Línea 578**: Remover `if (!esParticular && props.length > 0)`. Siempre mostrar paquete base y entregables de propiedad 1.
- **Línea 601**: Remover `&& !esParticular` de los extras acordados. Siempre mostrar.
- **Línea 623**: Remover `&& !esParticular` del precio base. Siempre mostrar.
- **Línea 629**: El bloque `if (esParticular && d.notasContrato)` se convierte en `if (d.notasContrato)`.
- **Línea 634**: El bloque `if (esParticular && props.length > 0)` para property summaries se convierte en mostrar SIEMPRE todas las propiedades (no solo la primera) con su paquete, fecha y entregables.
- **Línea 648**: Remover `&& !esParticular` de los add-ons. Siempre mostrar si hay `addons.length > 0`.

### 6.3 `validarEtapa1()` — remover `esParticular`

**Línea 980**: Ya no se usa la variable. Las validaciones de dirección, maps, orientación aplican para todas las propiedades siempre.

### 6.4 `renderRevision()` — unificar

**Línea 1285**: Remover `var esP = d.tipoContrato === 'particular'`.
- **Línea 1309**: Mostrar propiedades SIEMPRE con el mismo formato (actualmente el formato de `esP` es mejor, tiene direcciones y entregables). Unificar en ese formato para todas.

### 6.5 `firmaCliente()` (en portal.html, el POST)

El portal.html hace `apiPost` con `adicionalesSeleccionados`. Verificar que el payload incluya los adicionales correctamente. El cambio del backend ya permite que cualquier contrato reciba adicionales.

### 6.6 `renderEtapa3()` y `renderEtapa4()` — entregables

Verificar que los entregables se muestren correctamente para todas las propiedades. Actualmente para particulares usa `propiedadesFirma[0].entregables` como fallback (bug fix B08). Eso se mantiene.

---

## 7. `worker/src/routes/tokens.js` — verificar

`crearTokenConfigurar` ya fue eliminado (AE7). Verificar que no quede código muerto.

---

## 8. `worker/src/routes/abonos.js` — sin cambios

No toca `tipo_contrato`. El guard `primerAbono` duplicado funciona con `carpeta_control_id`, independiente del tipo.

---

## 9. `worker/src/routes/checklist.js` — sin cambios

---

## 10. `worker/src/routes/stats.js` — sin cambios

No filtra por `tipo_contrato`.

---

## 11. `worker/src/routes/archivos.js` — sin cambios

---

## Advertencias y problemas conocidos

Esta sección lista bugs y omisiones detectados en el diseño antes de implementar. Cada problema debe estar resuelto explícitamente antes de marcar la tarea como terminada.

---

### P1 — `setTipoProp` destruye datos escritos por el usuario [CRÍTICO]

**Problema**: `setTipoProp` llama `renderTodasLasProps()` que hace `container.innerHTML = html` completo. Si el usuario ya escribió un nombre de servicio o entregables en una propiedad y luego hace clic en "Terreno", pierde todo lo que escribió.

**Solución requerida antes de implementar**: No hacer re-render completo. En `setTipoProp`:
1. Actualizar solo `tiposProp[num]`.
2. Cambiar las clases CSS de los botones del tipo (`activo-par`) sin tocar el resto del card.
3. Llamar `actualizarSelectPaqueteProp(num)` para que el select se filtre por el nuevo tipo.

```js
function setTipoProp(num, tipo) {
  tiposProp[num] = tipo;
  // Solo cambiar clases de botones
  var btns = document.querySelectorAll('.par-tipo-btn[data-prop="' + num + '"]');
  btns.forEach(function(b) {
    b.classList.toggle('activo-par', b.dataset.tipo === tipo);
  });
  // Solo re-filtrar el select de paquetes
  actualizarSelectPaqueteProp(num);
}
```
Esto requiere que los botones en `renderPropCard` tengan `data-prop` y `data-tipo`:
```js
'<button type="button" class="par-tipo-btn' + (tipo !== 'Terreno' ? ' activo-par' : '') +
  '" data-prop="' + i + '" data-tipo="Residencial" onclick="setTipoProp(' + i + ',\'Residencial\')">Residencial</button>'
```

---

### P2 — `data-precio` no se asigna en options pero sí se lee [CRÍTICO]

**Problema**: En `actualizarSelectPaqueteProp` (sección 5.2) los `<option>` reciben `data-entregables` y `data-nombre`, pero NO `data-precio`. La función `actualizarPrecio` (sección 5.6) lee `opt?.dataset?.precio` — siempre `undefined`. El cálculo automático de precio nunca funciona.

**Solución**: Agregar en `actualizarSelectPaqueteProp`:
```js
opt.dataset.precio = p.Precio || 0;   // línea faltante
opt.dataset.entregables = p.Entregables || '';
opt.dataset.nombre = p.Nombre || p.Clave;
```

---

### P3 — Cambiar paquete no dispara `actualizarPrecio` [CRÍTICO]

**Problema**: `onPaqueteChangeProp` solo rellena el textarea de entregables. No llama `actualizarPrecio()`. Si el usuario elige un paquete del catálogo, el precio total no se actualiza automáticamente.

**Solución**: Agregar al final de `onPaqueteChangeProp`:
```js
function onPaqueteChangeProp(num) {
  var select = document.getElementById('prop-paquete-' + num);
  var textarea = document.getElementById('prop-entregables-' + num);
  if (!select || !textarea) return;
  var val = select.value;
  if (!val) return;
  var opt = select.options[select.selectedIndex];
  textarea.value = opt.dataset.entregables || '';
  actualizarPrecio(); // línea faltante
}
```

---

### P4 — `quitarPropiedad` también destruye datos escritos [IMPORTANTE]

**Problema**: `quitarPropiedad` renumera `tiposProp` y llama `renderTodasLasProps()`, que reconstruye el HTML completo. Todos los valores escritos en los inputs (nombre de servicio, entregables, fecha, hora) de las propiedades que sobreviven se pierden.

**Solución requerida**: Antes de renderizar, leer y guardar el estado de todas las propiedades:
```js
function leerEstadoProps() {
  var estado = {};
  for (var i = 1; i <= numProps; i++) {
    estado[i] = {
      nombreServicio: (document.getElementById('prop-nombre-servicio-' + i) || {}).value || '',
      paquete: (document.getElementById('prop-paquete-' + i) || {}).value || '',
      entregables: (document.getElementById('prop-entregables-' + i) || {}).value || '',
      fecha: (document.getElementById('prop-fecha-' + i) || {}).value || '',
      hora: (document.getElementById('prop-hora-' + i) || {}).value || '10:00',
    };
  }
  return estado;
}
```
Luego, al re-renderizar, restaurar los valores de cada input mediante `element.value = estadoAnterior[j].campo`. También aplicar en `agregarPropiedad()` para preservar lo que ya hay.

---

### P5 — Portal: card "PROPIEDAD 1" se ve raro en contratos de 1 sola propiedad [UX]

**Problema**: El plan propone mostrar siempre propiedades en formato de card numerada (sección 6.2 y 6.4). Para un contrato estándar con 1 propiedad, el cliente ve una card que dice "PROPIEDAD 1" cuando no hay otras propiedades con las que comparar — se ve sobre-diseñado.

**Solución recomendada**: Condicional por cantidad:
- Si `props.length === 1`: mostrar entregables inline sin card ni número (formato actual de estándar).
- Si `props.length > 1`: mostrar cards numeradas (formato actual de particular).

---

### P6 — `actualizarPaquetesAdicionales` filtra solo por tipo de propiedad 1 [MENOR]

**Problema**: La función usa `tiposProp[1]` para filtrar adicionales y extras acordados del catálogo. Si el contrato tiene prop 1 = Residencial y prop 2 = Terreno, nunca aparecen adicionales tipo Terreno aunque pudieran ser relevantes.

**Impacto**: Bajo. Los adicionales son a nivel contrato, no por propiedad. Es una limitación de diseño, no un bug funcional. Documentar como decisión intencional o resolver filtrando por `'Ambos'` + el tipo de cualquier propiedad presente.

---

### P7 — `renderRevision` en portal.html: qué bloque conservar no está especificado [GAP]

**Problema**: La sección 6.4 dice "mostrar propiedades SIEMPRE con el formato de `esP`", pero no muestra el HTML actual de ninguno de los dos bloques. El implementador necesita leer el código actual para saber cuál es cuál y qué líneas eliminar.

**Solución**: Antes de implementar la Fase 3 (portal.html), leer las líneas 1285-1360 de portal.html para identificar exactamente los dos bloques condicionales y sus diferencias.

---

### P8 — Adapter Apps Script: `tipo_contrato` no verificado [GAP]

**Problema**: La Fase 4 dice "verificar que el adapter no tenga referencias a `tipo_contrato`" pero no es un paso concreto verificable. El adapter usa `body.contrato.tipo_contrato` en `procesarFirma` y `primerAbono` para construir el asunto del correo o el nombre del evento de Calendar.

**Paso concreto a agregar en Fase 4**:
```
grep -n "tipo_contrato" adapter/AdapterScript4_v1.js
```
Si aparece en lógica condicional (no solo en texto del PDF), agregar un fix explícito.

---

### P10 — `precioManual` y `anticipoManual` no están declaradas en el plan [CRÍTICO]

**Problema**: El HTML de §5.1 usa `oninput="precioManual=true"` y `oninput="anticipoManual=true"`. La función `limpiarFormCrear` (§5.3) las resetea a `false`. `actualizarPrecio` (§5.6) las lee como guard. En ninguna parte del plan se declaran con `var`.

**Impacto**: Si el archivo actual ya las tiene declaradas, funciona. Si no, se crean como implícitas en `window` — frágil. Cualquier refactor futuro puede romper el guard.

**Solución**: Verificar que al inicio del `<script>` de `admin.html` existan:
```js
var precioManual = false;
var anticipoManual = false;
```
Si no existen, agregarlas en el bloque de inicialización de variables globales del formulario.

---

### P11 — `actualizarAnticipo('est')` llamada pero no definida en el plan [CRÍTICO]

**Problema**: `actualizarPrecio` (§5.6) termina con `actualizarAnticipo('est')`. Esta función no aparece en ninguna sección del plan. El precio total se actualiza pero el anticipo (campo `est-anticipo`) nunca se recalcula automáticamente al 50%.

**Impacto**: `ReferenceError` en runtime cada vez que se dispara `actualizarPrecio`, a menos que la función ya exista en el archivo actual.

**Solución**: Antes de implementar §5.6, verificar si `actualizarAnticipo` ya existe en `admin.html` y si su firma acepta el prefijo `'est'`. Si no existe, definirla:
```js
function actualizarAnticipo(prefijo) {
  if (anticipoManual) return;
  var total = parseFloat(document.getElementById(prefijo + '-precio-total').value) || 0;
  document.getElementById(prefijo + '-anticipo').value = Math.round(total * 0.5);
}
```

---

### P12 — Contratos particular "Pendiente firma" quedan huérfanos al deprecar `guardarConfiguracion` [CRÍTICO]

**Problema**: `guardarConfiguracion` era el único flujo para que clientes de contratos `particular` configuraran dirección, fotos y maps antes de firmar. Al devolver 410, esos contratos en estado "Pendiente firma" no pueden completar el flujo. Quedan irrecuperables sin intervención manual.

**Impacto**: Si hay contratos particular con estatus "Pendiente firma" en D1 al momento del deploy, sus clientes reciben un error sin explicación.

**Solución (pre-deploy obligatorio)**: Antes de la Fase 1:
```sql
SELECT token, nombre_cliente, estatus, fecha_creacion
FROM contratos
WHERE tipo_contrato = 'particular' AND estatus = 'Pendiente firma';
```
Para cada contrato encontrado: contactar al cliente o marcar el contrato como cancelado / migrar manualmente. Solo después de que la lista esté vacía es seguro desplegar el 410.

---

### P13 — El portal rompe la UI de contratos particular existentes al quitar `esParticular` [IMPORTANTE]

**Problema**: Contratos particular existentes tienen `paquete_base = NULL` o valores no estándar, `adicionales_json` con estructura diferente, y sin extras acordados estructurados. Al quitar todos los guards `esParticular` en §6.2, el portal intentará renderizar secciones de paquete base, adicionales y extras acordados con datos nulos.

**Impacto**: Labels vacíos, precios en $0, checkboxes de adicionales que no corresponden al contrato — UI confusa para clientes que abran contratos particulares ya existentes.

**Solución**: En las secciones del portal donde se quiten los guards `esParticular`, reemplazarlos por guards defensivos sobre los datos:
```js
// En lugar de: if (!esParticular && d.paqueteBase)
if (d.paqueteBase) { /* mostrar sección paquete base */ }

// En lugar de: if (!esParticular && extrasAcordados.length)
if (extrasAcordados && extrasAcordados.length) { /* mostrar sección */ }
```
No quitar los condicionales — cambiarlos de checar tipo a checar existencia de datos.

---

### P14 — `firmaCliente` acepta adicionales en contratos que no fueron diseñados para eso [IMPORTANTE]

**Problema**: Al quitar el guard `tipo_contrato !== 'particular'` en §3.2, un contrato particular existente con `adicionales_json` en formato no estándar podría recibir `adicionalesSeleccionados` en la firma. Esto suma precios al `precioTotal` basándose en claves de catálogo que podrían no corresponder al contrato.

**Impacto**: `precioTotal` y `saldoPendiente` incorrectos en contratos particulares antiguos si el portal muestra y el cliente selecciona adicionales.

**Solución**: El guard correcto no es sobre `tipo_contrato` sino sobre si el contrato tiene adicionales disponibles para seleccionar. La validación ya existe implícitamente: `adicionalesSeleccionados` solo puede contener claves de `paquetesDisponibles`, que a su vez solo se llenan desde las strings en `adicionales_json`. Si `adicionales_json` de un contrato particular no contiene strings de catálogo, `paquetesDisponibles` estará vacío y el portal no mostrará opciones. Verificar que este flujo sea correcto antes de eliminar el guard.

---

### P15 — Ubicación ambigua del handler 410 para `guardarConfiguracion` [IMPORTANTE]

**Problema**: §3.3 coloca el handler `if (action === 'guardarConfiguracion')` dentro de `portal.js`. §4.1 dice "Si el router tiene un `case 'guardarConfiguracion'`" sugiriendo que está en `index.js`. El implementador no sabe en qué archivo poner el código de deprecación.

**Impacto**: Si se pone en ambos archivos, uno nunca se ejecuta. Si se pone en el lugar incorrecto, el endpoint sigue funcionando.

**Solución**: Verificar la ruta actual en `worker/src/index.js`. La acción `guardarConfiguracion` probablemente está en el switch/router que despacha a `handlePortal`. El handler 410 debe ir dentro de `portal.js` (en el bloque `if (action === 'guardarConfiguracion')` que ya existe ahí), y la entrada del router en `index.js` se mantiene igual para que el request llegue a `portal.js`. No poner el 410 en `index.js`.

---

### P16 — Sin límite máximo de propiedades en el backend [SEGURIDAD]

**Problema**: El plan dice "sin tope fijo" pero el backend no valida `propsData.length`. Un payload con 200 propiedades ejecutaría 200 INSERT seguidos en D1.

**Solución**: Agregar en `crearContrato`, después de la validación del array:
```js
if (propsData.length > 20) return err('Máximo 20 propiedades por contrato');
```

---

### P17 — `fechaSesion` sin validación de formato antes de `generarFolio` [MENOR]

**Problema**: `generarFolio(prop1.fechaSesion)` recibe el string crudo del frontend. Si el formato no es `YYYY-MM-DD`, la función puede producir un folio malformado o lanzar una excepción no controlada.

**Solución**: Agregar validación antes de la llamada:
```js
var fechaRe = /^\d{4}-\d{2}-\d{2}$/;
if (prop1.fechaSesion && !fechaRe.test(prop1.fechaSesion)) {
  return err('Formato de fecha inválido en propiedad 1 (esperado YYYY-MM-DD)');
}
const folio = prop1.fechaSesion ? generarFolio(prop1.fechaSesion) : null;
```

---

### P9 — Precio manual vs. cambio de paquete: conflicto de `precioManual` [MENOR]

**Problema**: Si el usuario elige un paquete (lo que llama `actualizarPrecio`), luego edita el precio manualmente (`precioManual = true`), y luego cambia el tipo de la propiedad (que llama `actualizarSelectPaqueteProp` pero NO `actualizarPrecio`), el precio queda bloqueado en el valor manual aunque el paquete ya no sea válido. No es un bug funcional pero puede crear confusión.

**Solución**: Documentar como comportamiento intencional: una vez que el usuario toca el precio manualmente, lo controla él. Agregar un botón o hint "Recalcular precio" si la UX lo amerita (decisión de Bruno).

---

## Secuencia de implementación recomendada

### Fase 1 — Backend (desplegar primero, no rompe nada)
1. Modificar `crearContrato` en `contratos.js` para unificar lógica.
2. Modificar `firmaCliente` en `portal.js` para quitar guard `tipo_contrato !== 'particular'`.
3. Deprecar `guardarConfiguracion` (devolver 410).
4. Desplegar con `wrangler deploy`.

### Fase 2 — Admin HTML (cambio grande)
1. Reemplazar bloques HTML de sub-tabs y formularios.
2. Implementar `agregarPropiedad()`, `quitarPropiedad()`, `renderTodasLasProps()`, etc.
3. Reescribir `crearContrato()` sin parámetro.
4. Limpiar funciones obsoletas (`mostrarSubTab`, `renderPropCardsPar`, `setTipoPar`, etc.).
5. Desplegar.

### Fase 3 — Portal HTML
1. Quitar todos los `esParticular`.
2. Unificar `renderEtapa1`, `renderRevision`, `validarEtapa1`.
3. Verificar que todas las propiedades se muestren correctamente.
4. Desplegar.

### Fase 4 — Limpieza
1. Eliminar código muerto en `index.js` si hay rutas huérfanas.
2. Verificar que el adapter de Apps Script no tenga referencias a `tipo_contrato`.
3. Desplegar.

---

## Riesgos y verificaciones post-deploy

| # | Verificación | Cómo probar |
|---|-------------|-------------|
| 1 | Crear contrato con 1 propiedad, paquete de catálogo | Admin → crear → ver portal → firmar |
| 2 | Crear contrato con 1 propiedad, texto libre (sin paquete) | Admin → crear con nombre libre → ver portal → firmar |
| 3 | Crear contrato con 3 propiedades (mixtas: Residencial + Terreno) | Admin → agregar 3 → ver portal → firmar |
| 4 | Adicionales del portal se suman al precio | Portal → activar add-ons → ver revisión → firmar |
| 5 | Extras acordados aparecen en el portal | Admin → agregar extra libre → ver portal |
| 6 | Folio se genera siempre | Crear contrato → verificar `folio` en response y admin |
| 7 | `guardarConfiguracion` devuelve 410 | POST a `/api/guardarConfiguracion` → 410 Gone |
| 8 | Contrato existente con tipo 'particular' se abre en portal | Abrir portal con token de contrato particular viejo |
| 9 | Upsell funciona con texto libre | Admin → abrir upsell → agregar servicio libre |
| 10 | CSV export funciona | Admin → exportar CSV → verificar columna Paquete |

---

## CSS nuevo necesario

Agregar al `<style>` de `admin.html`:

```css
.par-tipo-btn {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--page);
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.par-tipo-btn:hover {
  border-color: var(--gold);
  color: var(--ink-1);
}
.par-tipo-btn.activo-par {
  background: var(--gold);
  color: white;
  border-color: var(--gold);
}
```

Este CSS ya existe en el archivo actual (usado por los botones de tipo del formulario particular). Solo verificar que no se pierda al limpiar.

---

## Resumen de líneas a tocar por archivo

| Archivo | Líneas actuales | Cambios estimados |
|---------|----------------|-------------------|
| `contratos.js` | 461 | ~40 líneas modificadas en `crearContrato` |
| `portal.js` (backend) | 332 | ~5 líneas (quitar guard, deprecar endpoint) |
| `admin.html` | 3348 | ~300 líneas (reemplazar forms, nuevas funciones JS) |
| `portal.html` | 2138 | ~50 líneas (remover condicionales, unificar render) |
| `index.js` | ~50 | ~2 líneas (quitar ruta si aplica) |
| **Total** | ~6300 | **~400 líneas tocadas** |
