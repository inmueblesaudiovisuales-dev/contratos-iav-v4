# Plan: Toggle Paquete/Personalizado + Add-ons globales acordeón

> **Estado:** IMPLEMENTADO Y AUDITADO — 2026-05-31
>
> Archivo modificado: **solo** `admin.html`. No se tocó worker, portal, ni adapter.

---

## Objetivo

1. **Toggle "Paquete base" / "Personalizado"** en cada propiedad del form de nuevo contrato. Solo uno activo. Al cambiar de modo se limpia el campo oculto.
2. **Add-ons globales en acordeón cerrado**, solo visibles cuando `numProps > 1`.
3. **Eliminar función "Duplicar contrato"** — botón y código muerto.

---

## Bugs encontrados en el plan (pre-auditoría) — corregidos en implementación

| # | Bug | Severidad | Descripción |
|---|-----|-----------|-------------|
| B1 | `modosNombre` no declarado | Alto | La variable no existe. Hay que declarar `var modosNombre = {};` |
| B2 | `#detalles-globales` puede no existir | Medio | Guard `if(el) el.style.display = ...` en toggle visibilidad |
| B3 | `renderTodasLasProps` no actualiza visibilidad de globales | Alto | Al cambiar `numProps` no se esconde/muestra. Agregar `actualizarPaquetesAdicionales()` al final |
| B4 | `modosNombre` sin inicializar en props nuevas | Medio | `agregarPropiedad` no setea default. Agregar loop de init |
| B5 | `leerEstadoProps` no captura `modoNombre` | Alto | Estado no persiste → al reconstruir se resetea a `'paquete'` |
| B6 | `crearContrato` no considera modo en `paqueteVal` | Alto | En modo personalizado debe usarse solo `nombreSvc`, no `paqClave` |

## Bugs detectados en auditoría post-implementación — corregidos

| # | Bug | Severidad | Descripción | Fix aplicado |
|---|-----|-----------|-------------|--------------|
| B7 | `quitarPropiedad` no reindexea `modosNombre` | Alto | Al quitar una prop, las keys de `modosNombre` quedan con índices stale. Si el usuario agrega una prop nueva después, hereda el modo de la prop eliminada en lugar de defaultear a `'paquete'`. | Agregado `nuevosModos` en paralelo a `nuevosTipos`; `modosNombre = nuevosModos` antes de `numProps--` |
| B8 | `quitarPropiedad` no llama `actualizarPaquetesAdicionales()` | Alto | Al reducir de 2 a 1 prop, el acordeón `#detalles-globales` permanecía visible. `setTipoProp` y `renderTodasLasProps` sí la llaman; `quitarPropiedad` no. | Agregado `actualizarPaquetesAdicionales()` al final de `quitarPropiedad` |
| B9 | Checkboxes ocultos de add-ons globales incluidos en payload | Alto | `crearContrato` usa `querySelectorAll` que no filtra por visibilidad. Si el usuario marcó add-ons globales con 2 props y redujo a 1 (acordeón oculto), los checkboxes seguían checked y se enviaban al backend silenciosamente. | En `actualizarPaquetesAdicionales`, al ocultar el acordeón se desmarcan todos los checkboxes de `#lista-adicionales` |

---

## Cambios detallados

### 1. Variable global `modosNombre`

Agregar al inicio del script (junto a otras vars globales):

```js
var modosNombre = {};
```

---

### 2. `renderPropCard` — Toggle HTML

**Reemplazar** el bloque actual de "Nombre del servicio" + "Paquete base" dentro de `renderPropCard`.

**Ubicación actual** (aproximado): entre `setTipoProp` y `Entregables`. Las líneas exactas serán:

```html
    '<div class="campo">' +
      '<label>Nombre del servicio</label>' +
      '<input type="text" id="prop-nombre-servicio-' + i + '" placeholder="Ej: Producción audiovisual residencial, Tour virtual aéreo...">' +
    '</div>' +
    '<div class="campo">' +
      '<label>Paquete base <span style="font-weight:400;color:var(--ink-3)">(opcional — llena entregables automáticamente)</span></label>' +
      '<select id="prop-paquete-' + i + '" onchange="onPaqueteChangeProp(' + i + ')"><option value="">— Sin paquete —</option></select>' +
    '</div>' +
```

**Reemplazar por:**

```html
    '<div class="campo">' +
      '<label>Nombre del servicio</label>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px">' +
        '<button type="button" class="modo-nombre-btn par-tipo-btn" data-prop="' + i + '" data-modo="paquete" onclick="setModoNombre(' + i + ',\'paquete\')">Paquete base</button>' +
        '<button type="button" class="modo-nombre-btn par-tipo-btn" data-prop="' + i + '" data-modo="custom" onclick="setModoNombre(' + i + ',\'custom\')">Personalizado</button>' +
      '</div>' +
      '<div id="wrap-paquete-' + i + '">' +
        '<select id="prop-paquete-' + i + '" onchange="onPaqueteChangeProp(' + i + ')"><option value="">— Sin paquete —</option></select>' +
      '</div>' +
      '<div id="wrap-nombre-' + i + '" style="display:none">' +
        '<input type="text" id="prop-nombre-servicio-' + i + '" placeholder="Ej: Tour virtual aéreo, Producción premium...">' +
      '</div>' +
    '</div>' +
```

**Nota:** `modo-nombre-btn` usa la misma clase `par-tipo-btn` que los botones Residencial/Terreno para heredar el estilo de toggle visual. El selector `document.querySelectorAll('.modo-nombre-btn[data-prop="' + num + '"]')` es específico para no colisionar con los botones de tipo.

---

### 3. `setModoNombre(num, modo)` — Nueva función

Agregar después de las funciones de `setTipoProp` o `actualizarSelectPaqueteProp`:

```js
function setModoNombre(num, modo) {
  modosNombre[num] = modo;
  var wrapPaq = document.getElementById('wrap-paquete-' + num);
  var wrapNom = document.getElementById('wrap-nombre-' + num);
  if (modo === 'paquete') {
    if (wrapPaq) wrapPaq.style.display = 'block';
    if (wrapNom) {
      wrapNom.style.display = 'none';
      var inp = document.getElementById('prop-nombre-servicio-' + num);
      if (inp) inp.value = '';
    }
  } else {
    if (wrapPaq) {
      wrapPaq.style.display = 'none';
      var sel = document.getElementById('prop-paquete-' + num);
      if (sel) { sel.value = ''; onPaqueteChangeProp(num); }
    }
    if (wrapNom) wrapNom.style.display = 'block';
  }
  // Actualizar visual de los botones toggle
  document.querySelectorAll('.modo-nombre-btn[data-prop="' + num + '"]').forEach(function(b) {
    b.classList.toggle('activo-par', b.dataset.modo === modo);
  });
}
```

**Validación cruzada:** Cuando el usuario pasa de Personalizado a Paquete base, los entregables se limpian (por `onPaqueteChangeProp` con `select.value = ''`). Precio se actualiza a 0 (el admin lo rellena manualmente o selecciona un paquete). ¿Es correcto este comportamiento o debería preservar entregables? El plan asume que se limpian — es más seguro que arrastrar entregables de un paquete anterior.

---

### 4. `crearContrato` — `paqueteVal`

**Línea ~2540 actual:**
```js
var paqueteVal = paqClave || nombreSvc;
```

**Reemplazar por:**
```js
var paqueteVal = (modosNombre[i] === 'custom') ? nombreSvc : (paqClave || nombreSvc);
```

**Validación:** En modo `'custom'`, `paqueteVal = nombreSvc`. En modo `'paquete'`, `paqClave || nombreSvc` (comportamiento actual). Esto asegura que el nombre personalizado no se pierda al haber seleccionado previamente un paquete.

---

### 5. `leerEstadoProps` — capturar `modoNombre`

**Línea ~2927.** Agregar dentro de `estado[i] = { ... }`:
```js
modoNombre: modosNombre[i] || 'paquete',
```

---

### 6. `restaurarEstadoProps` — restaurar `modoNombre`

**Línea ~2940.** Agregar dentro del `for` loop, después de restaurar `s.acordadosChecked`:
```js
if (s.modoNombre) {
  modosNombre[i] = s.modoNombre;
  // Restaurar toggle en DOM
  var wrapPaq = document.getElementById('wrap-paquete-' + i);
  var wrapNom = document.getElementById('wrap-nombre-' + i);
  if (s.modoNombre === 'paquete') {
    if (wrapPaq) wrapPaq.style.display = 'block';
    if (wrapNom) wrapNom.style.display = 'none';
  } else {
    if (wrapPaq) wrapPaq.style.display = 'none';
    if (wrapNom) wrapNom.style.display = 'block';
  }
  document.querySelectorAll('.modo-nombre-btn[data-prop="' + i + '"]').forEach(function(b) {
    b.classList.toggle('activo-par', b.dataset.modo === s.modoNombre);
  });
}
```

---

### 7. `renderTodasLasProps` — inicializar y actualizar

**Después de `container.innerHTML = html`** (línea ~3009):

Agregar inicialización de `modosNombre` para nuevas props:
```js
for (var j = 1; j <= numProps; j++) {
  if (!modosNombre[j]) modosNombre[j] = 'paquete';
}
```

IMPORTANTE: Este loop debe ir ANTES de los `actualizarSelectPaqueteProp`, `actualizarAddonsProp`, `actualizarAcordadosProp` y `restaurarEstadoProps`, para que el estado tenga el valor correcto cuando esas funciones requieran consultar `modosNombre[j]`.

**Al final de `renderTodasLasProps`** (después del loop que llama `restaurarEstadoProps(estado)`):

Agregar:
```js
actualizarPaquetesAdicionales();
```

Esto corrige B3: cuando `numProps` cambia (agregar/quitar propiedad), los add-ons globales se muestran/ocultan automáticamente.

---

### 8. `limpiarFormCrear` — resetear

Agregar al inicio del form reset:
```js
modosNombre = {};
```

---

### 9. Add-ons globales — HTML estático

**Líneas actuales ~688-695:**
```html
<button type="button" class="btn-secundario btn-sm" onclick="agregarPropiedad()" style="margin-bottom:16px">+ Agregar propiedad</button>

<!-- Adicionales a ofrecer en el portal -->
<div class="campo" id="campo-adicionales">
  <label>Add-ons del proyecto</label>
  <p style="font-size:11px;color:var(--ink-3);margin-bottom:8px;line-height:1.5">Aplican a todo el proyecto. El cliente los ve como opcionales en su portal.</p>
  <div class="add-lista" id="lista-adicionales"></div>
  <button type="button" class="btn-secundario btn-sm" id="btn-addon-personalizado" onclick="agregarAddonPersonalizado()" style="margin-top:6px;font-size:12px">+ Add-on personalizado</button>
</div>
```

**Reemplazar por:**
```html
<button type="button" class="btn-secundario btn-sm" onclick="agregarPropiedad()" style="margin-bottom:16px">+ Agregar propiedad</button>

<details id="detalles-globales" style="margin:0;margin-bottom:16px">
  <summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--ink-2);padding:4px 0">Add-ons del proyecto <span style="font-weight:400;color:var(--ink-3)">(globales)</span></summary>
  <div class="campo" id="campo-adicionales">
    <p style="font-size:11px;color:var(--ink-3);margin-bottom:8px;line-height:1.5">Aplican a todo el proyecto. El cliente los ve como opcionales en su portal.</p>
    <div class="add-lista" id="lista-adicionales"></div>
    <button type="button" class="btn-secundario btn-sm" id="btn-addon-personalizado" onclick="agregarAddonPersonalizado()" style="margin-top:6px;font-size:12px">+ Add-on personalizado</button>
  </div>
</details>
```

**Validación:** El `label` "Add-ons del proyecto" se elimina del `#campo-adicionales` y se convierte en el `<summary>` del acordeón. La clase y IDs se mantienen para que todas las funciones JS (`actualizarPaquetesAdicionales`, `agregarAddonPersonalizado`, `crearContrato`, `actualizarPrecio`) sigan funcionando sin cambios en sus selectores internos.

---

### 10. `actualizarPaquetesAdicionales` — visibilidad globales

**Agregar al inicio de la función** (línea ~1407, antes del `filter` de paquetes):

```js
var detGlobales = document.getElementById('detalles-globales');
if (detGlobales) detGlobales.style.display = (numProps === 1) ? 'none' : '';
```

**Validación:** Con `numProps === 1` se oculta todo el acordeón. Con `numProps > 1` se muestra. El `else` de la condición del `campo-adicionales` no se afecta — `actualizarPaquetesAdicionales` sigue controlando el contenido interno del `#campo-adicionales` y del `#campo-extras-catalogo`.

---

### 11. Eliminar "Duplicar contrato"

**Botón (líneas ~1867-1871):**
```html
<div style="margin-top:12px">
  <button class="btn-secundario btn-sm" style="display:inline-flex;align-items:center;gap:6px" onclick="duplicarContrato()">
    <i class="ti ti-copy"></i> Duplicar contrato
  </button>
</div>
```
→ Eliminar este bloque completo.

**Función `duplicarContrato` (líneas ~1241-1335):** Eliminar la función entera. No hay otras referencias a ella.

---

## Verificaciones post-implementación

| Escenario | Qué validar |
|-----------|-------------|
| Nuevo contrato, 1 propiedad | Select de paquete visible por defecto. Toggle cambia a input personalizado. Al volver se limpia. |
| Nuevo contrato, 3 propiedades | Agregar/quitar propiedades preserva `modosNombre` de las existentes. |
| Elegir "Personalizado", escribir nombre, crear | `paqueteVal` usa el nombre personalizado. |
| Elegir "Paquete base", seleccionar RES-COMBO, crear | `paqueteVal` usa la clave del paquete. |
| Contrato con 1 prop, add-ons globales | **NO** se ve el acordeón de add-ons del proyecto. |
| Contrato con 3 props, add-ons globales | **SÍ** se ve el acordeón (cerrado por default). |
| Cambiar de 1 a 3 props | El acordeón aparece, los add-ons per-prop dentro de cada card también. |
| Cambiar de 3 a 1 props | El acordeón desaparece, solo add-ons per-prop en la card (mergeados). |
| Cambiar de "Paquete base" a "Personalizado" | Select se vacía, entregables se limpian, precio se actualiza a 0. |
| Cambiar de "Personalizado" a "Paquete base" | Input se vacía y oculta. |

---

## Archivos afectados

| Archivo | Cambios |
|---------|---------|
| `admin.html` | 1 var global, 1 función nueva, 3 funciones modificadas, 2 secciones HTML reemplazadas, ~95 líneas eliminadas |

**Worker, portal.js, portal.html, adapter:** sin cambios.
