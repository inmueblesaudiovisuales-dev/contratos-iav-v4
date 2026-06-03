# Admin UI — Mejoras de diseño (R48–R52) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar la coherencia visual, jerarquía de información y mantenibilidad del panel admin en sus secciones de Contratos, Nuevo contrato y Clientes.

**Architecture:** Todo el trabajo vive en `frontend/admin.html` (único archivo de ~5 500 líneas). Las tareas se ejecutan en orden de menor a mayor riesgo de regresión: primero tokens/CSS, luego render de cards, toolbar, formulario y finalmente sección Clientes. Cada tarea produce un commit independiente y verificable.

**Tech Stack:** HTML/CSS/JS vanilla · Tabler Icons webfont · Montserrat + JetBrains Mono (Google Fonts) · Cloudflare Workers + D1 (backend, solo lectura en esta fase)

---

## Notas de contexto críticas

- `frontend/admin.html` es un archivo mezclado con tabs/espacios — usar siempre el tool `Edit` con strings exactos del archivo, nunca reemplazos de línea por número.
- El archivo se despliega automáticamente al hacer `git push origin main` (GitHub Actions → Cloudflare Pages).
- Verificar siempre en producción **después** de cada commit: `https://contratos.inmueblesaudiovisuales.com/admin.html` (tras Cloudflare Access con contraseña `framedock`).
- El editor local vive en `http://localhost:8788/admin.html` al correr `wrangler pages dev`.
- `jsArg(v)` — función auxiliar que embeds strings en `onclick` HTML con HTML-encoding de comillas dobles. Usarla siempre que se genere HTML con onclick inline.

---

## Archivos a modificar

| Archivo | Qué cambia |
|---|---|
| `frontend/admin.html` | Todo — CSS, HTML, JS |

No se crean ni modifican archivos del worker. No hay pruebas automatizadas — verificación es visual en browser.

---

## Task 1 — R48a: ESTATUS_MAP unificado

**Files:**
- Modify: `frontend/admin.html` (líneas ~2501, ~5114, ~2910, ~2554)

### Por qué

Hoy existen tres objetos separados con los mismos 7 estatus y paletas distintas:
- `ESTATUS_COLOR` (línea 2501): `{ estatus: '#hexcolor' }` — usado en renderTabla y panel
- `ESTATUS_BADGE_CLI` (línea 5114): `{ estatus: { bg, color } }` — usado en panel de cliente
- `chip-dot` en HTML con hex hardcodeado (línea 1241–1245)

Los colores entre objetos no siempre coinciden (ej. "Anticipo recibido" es `#F59E0B` en tabla pero `bg:#FEF3C7/color:#92400E` en cliente). Un solo `ESTATUS_MAP` elimina la divergencia.

- [ ] **Step 1: Reemplazar ESTATUS_COLOR por ESTATUS_MAP**

Busca en admin.html el bloque exacto:
```js
const ESTATUS_COLOR = {
  'Pendiente firma':   '#9CA3AF',
  'Firmado':           '#3B82F6',
  'Anticipo recibido': '#F59E0B',
  'En produccion':     '#8B5CF6',
  'Entregado':         '#14B8A6',
  'Liquidado':         '#10B981',
  'Completado':        '#10B981',
};
```
Reemplázalo con:
```js
const ESTATUS_MAP = {
  'Pendiente firma':   { dot:'#9CA3AF', bg:'#F3F4F6', color:'#374151',  label:'Pendiente firma'   },
  'Firmado':           { dot:'#3B82F6', bg:'#DBEAFE', color:'#1D4ED8',  label:'Firmado'            },
  'Anticipo recibido': { dot:'#F59E0B', bg:'#FEF3C7', color:'#92400E',  label:'Anticipo recibido'  },
  'En produccion':     { dot:'#8B5CF6', bg:'#F5F3FF', color:'#6D28D9',  label:'En producción'      },
  'Entregado':         { dot:'#14B8A6', bg:'#E0F2FE', color:'#0369A1',  label:'Entregado'          },
  'Liquidado':         { dot:'#10B981', bg:'#DCFCE7', color:'#065F46',  label:'Liquidado'          },
  'Completado':        { dot:'#10B981', bg:'#FEF9ED', color:'#92400E',  label:'Completado'         },
};
// Alias backward-compat para renderPanel (usa ESTATUS_COLOR[x])
const ESTATUS_COLOR = Object.fromEntries(Object.entries(ESTATUS_MAP).map(([k,v]) => [k, v.dot]));
```

- [ ] **Step 2: Actualizar renderTabla para usar ESTATUS_MAP**

En `renderTabla` (línea ~2554), busca:
```js
    const dotColor = ESTATUS_COLOR[c.Estatus] || '#9CA3AF';
    const estatusLabel = c.Estatus === 'En produccion' ? 'En producción' : (c.Estatus || '—');
```
Reemplaza con:
```js
    const _em = ESTATUS_MAP[c.Estatus] || { dot:'#9CA3AF', bg:'#F3F4F6', color:'#374151', label: c.Estatus || '—' };
    const dotColor = _em.dot;
    const estatusLabel = _em.label;
```

- [ ] **Step 3: Actualizar renderPanelCliente para usar ESTATUS_MAP**

En `renderPanelCliente` (línea ~2832), busca:
```js
      var bs = ESTATUS_BADGE_CLI[ct.estatus] || { bg:'#F3F4F6', color:'#374151' };
```
Reemplaza con:
```js
      var _em2 = ESTATUS_MAP[ct.estatus] || { bg:'#F3F4F6', color:'#374151' };
      var bs = { bg: _em2.bg, color: _em2.color };
```
Y también la ocurrencia en `toggleContratosCliente` (línea ~5139), busca:
```js
      var bs = ESTATUS_BADGE_CLI[c.estatus] || { bg:'#F3F4F6', color:'#374151' };
```
Reemplaza con:
```js
      var _em3 = ESTATUS_MAP[c.estatus] || { bg:'#F3F4F6', color:'#374151' };
      var bs = { bg: _em3.bg, color: _em3.color };
```

- [ ] **Step 4: Eliminar ESTATUS_BADGE_CLI**

Busca y elimina el bloque completo:
```js
var ESTATUS_BADGE_CLI = {
  'Pendiente firma':  { bg:'#FEF9C3', color:'#92400E' },
  'Firmado':          { bg:'#DBEAFE', color:'#1D4ED8' },
  'Anticipo recibido':{ bg:'#DCFCE7', color:'#15803D' },
  'En produccion':    { bg:'#F5F3FF', color:'#6D28D9' },
  'Entregado':        { bg:'#E0F2FE', color:'#0369A1' },
  'Liquidado':        { bg:'#DCFCE7', color:'#065F46' },
  'Completado':       { bg:'#FEF9ED', color:'#92400E' },
};
```

- [ ] **Step 5: Verificar en browser local**

```bash
cd "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0"
npx wrangler pages dev ./frontend --compatibility-date=2024-01-01
```
Abre `http://localhost:8788/admin.html`. Verifica:
- Los dots de estatus en la lista de contratos tienen color correcto.
- Los badges de estatus en el panel de cliente tienen color correcto.
- No hay errores en consola (`Uncaught ReferenceError: ESTATUS_BADGE_CLI`).

- [ ] **Step 6: Commit**

```bash
cd "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0"
git add frontend/admin.html
git commit -m "refactor: unifica ESTATUS_MAP — elimina ESTATUS_COLOR y ESTATUS_BADGE_CLI duplicados"
git push origin main
```

---

## Task 2 — R48b: Tokens para colores sueltos y limpieza de inline styles

**Files:**
- Modify: `frontend/admin.html` (líneas ~23–61 para tokens, ~2589 para EXPRESS badge, ~1321 para banner verde, ~5214/5231/5361 para msgs de éxito)

### Por qué

Hay hex sueltos que no son tokens CSS (`#ef4444`, `#1E8449`, `#B45309`) y mensajes de feedback que usan `style="color:#1E8449"` inline. Centralizar en variables CSS garantiza que cambiar el color de éxito o de alerta solo requiera editar `:root`.

- [ ] **Step 1: Agregar tokens faltantes a :root**

Busca en CSS el bloque `:root` (empieza en línea ~23). Al final del bloque, antes del `}` de cierre, agrega:
```css
      --success-text:   #1E8449;
      --express-bg:     #DC2626;
      --express-color:  #FFFFFF;
```
El bloque `:root` termina con `--shadow-lg: 0 8px 32px rgba(0,0,0,0.14);`. Busca esa línea y agrégala inmediatamente después:
```css
      --shadow-lg:    0 8px 32px rgba(0,0,0,0.14);
      --success-text:   #1E8449;
      --express-bg:     #DC2626;
      --express-color:  #FFFFFF;
    }
```

- [ ] **Step 2: Reemplazar badge EXPRESS hardcodeado**

Busca en renderTabla (línea ~2589):
```js
          ${c.EntregaExpress ? `<span style="background:#ef4444;color:#fff;font-size:9px;font-weight:800;letter-spacing:.8px;padding:1px 6px;border-radius:3px;margin-right:5px;vertical-align:middle">EXPRESS</span>` : ''}${esc(c.NombreCliente)}
```
Reemplaza con:
```js
          ${c.EntregaExpress ? `<span style="background:var(--express-bg);color:var(--express-color);font-size:9px;font-weight:800;letter-spacing:.8px;padding:1px 6px;border-radius:3px;margin-right:5px;vertical-align:middle">EXPRESS</span>` : ''}${esc(c.NombreCliente)}
```

- [ ] **Step 3: Reemplazar colores #1E8449 en mensajes de feedback**

Hay tres ocurrencias de `msg.style.color='#1E8449'` en JS. Usa replace_all:

Busca exactamente `msg.style.color='#1E8449'` (con comillas simples). Reemplaza todas las ocurrencias con `msg.style.color='var(--success-text)'`.

- [ ] **Step 4: Reemplazar color en banner verde de "desde trabajo"**

Busca (línea ~1321):
```html
        <div id="banner-desde-trabajo" style="display:none;background:rgba(30,132,73,0.08);border:1.5px solid rgba(30,132,73,0.25);border-radius:10px;padding:12px 16px;margin-bottom:12px;font-size:13px;color:#1E8449;align-items:center;justify-content:space-between">
          <span><i class="ti ti-circle-check" style="margin-right:6px"></i>Contrato para: <strong id="banner-trabajo-nombre"></strong></span>
          <button onclick="limpiarOrigenTrabajoContrato()" style="background:none;border:none;color:#1E8449;cursor:pointer;font-size:16px;padding:0 4px">✕</button>
```
Reemplaza con:
```html
        <div id="banner-desde-trabajo" style="display:none;background:rgba(30,132,73,0.08);border:1.5px solid rgba(30,132,73,0.25);border-radius:10px;padding:12px 16px;margin-bottom:12px;font-size:13px;color:var(--success-text);align-items:center;justify-content:space-between">
          <span><i class="ti ti-circle-check" style="margin-right:6px"></i>Contrato para: <strong id="banner-trabajo-nombre"></strong></span>
          <button onclick="limpiarOrigenTrabajoContrato()" style="background:none;border:none;color:var(--success-text);cursor:pointer;font-size:16px;padding:0 4px">✕</button>
```

- [ ] **Step 5: Verificar — no debe quedar ningún #1E8449 o #ef4444 fuera de :root**

```bash
grep -n "#1E8449\|#ef4444" "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/frontend/admin.html"
```
Resultado esperado: cero líneas (o solo dentro del comentario de :root si quedó alguno ahí).

- [ ] **Step 6: Commit**

```bash
git add frontend/admin.html
git commit -m "style: mueve colores hardcodeados a tokens CSS (success-text, express-bg)"
git push origin main
```

---

## Task 3 — R48c: JetBrains Mono para folios y montos

**Files:**
- Modify: `frontend/admin.html` (línea ~9 para `<link>`, líneas ~284/287/288/325/393/836/864/872 para font-family)

### Por qué

`Courier New` es la monospace del sistema — en macOS se ve aceptable pero en Windows/Android es tosca y de bajo contraste. JetBrains Mono es una monospace de Google Fonts diseñada para legibilidad en pantallas, con mejor espaciado y peso.

- [ ] **Step 1: Agregar JetBrains Mono a Google Fonts**

Busca la línea que carga Montserrat:
```html
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```
Reemplaza con:
```html
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Reemplazar Courier New en clases CSS**

Hay 6 clases con `'Courier New', monospace`. Usa el tool Edit con `replace_all: true`:

Busca: `'Courier New', monospace`
Reemplaza con: `'JetBrains Mono', monospace`

Esto cubre `.td-folio`, `.td-monto`, `.td-saldo`, `.ses-folio`, `.panel-folio`, `.link-portal-url`, `.resultado-url`, `.add-item-precio`.

- [ ] **Step 3: Verificar en browser**

Abre `http://localhost:8788/admin.html` y confirma que los folios (`IAV-2606.xx-A`) se ven con JetBrains Mono (más limpia, con serifas monoespaciadas). En DevTools → Elements → Computed → font-family debe decir `"JetBrains Mono"`.

- [ ] **Step 4: Commit**

```bash
git add frontend/admin.html
git commit -m "style: reemplaza Courier New con JetBrains Mono en folios y montos"
git push origin main
```

---

## Task 4 — R49: Card propia para lista de contratos en mobile

**Files:**
- Modify: `frontend/admin.html` — CSS (bloque `@media (max-width: 640px)`), HTML (agregar `<div id="contratos-cards">`), JS (actualizar `renderTabla`)

### Por qué

En mobile la `<table>` se colapsa con `flex-wrap:wrap` y los `<td>` quedan en DOM-order causando layouts imprevisibles. Una card propia permite jerarquía correcta: folio + estatus arriba, nombre grande, paquete, fecha + saldo abajo.

### Diseño de card mobile

```
┌──────────────────────────────────┐
│ IAV-2606.06-A   [● Anticipo]     │
│ TEST1                            │
│ RES-COMBO                        │
│ 06 jun 2026          $1,750      │
└──────────────────────────────────┘
```

- [ ] **Step 1: Agregar CSS para cards mobile**

En el bloque `@media (max-width: 640px)` (línea ~901), agrega al final (antes del cierre `}`):
```css
      /* Cards mobile de contratos */
      #contratos-cards { display: flex; flex-direction: column; gap: 8px; }
      .cont-card {
        background: var(--card); border-radius: 10px;
        border: 1px solid var(--border); padding: 12px 14px;
        cursor: pointer; display: block;
        border-left: 3px solid transparent;
        transition: border-color 80ms;
      }
      .cont-card.activo { border-left-color: var(--gold); }
      .cont-card.tr-ses-hoy   { border-left-color: var(--gold); }
      .cont-card.tr-ses-pronto { border-left-color: var(--warn); }
      .cont-card.tr-ses-semana { border-left-color: #3B82F6; }
      .cont-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
      .cont-card-folio { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: var(--ink-3); letter-spacing: 0.07em; text-transform: uppercase; }
      .cont-card-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; }
      .cont-card-pill-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
      .cont-card-nombre { font-size: 14px; font-weight: 700; color: var(--ink-1); }
      .cont-card-paquete { font-size: 11px; color: var(--ink-3); margin-top: 1px; }
      .cont-card-bottom { display: flex; align-items: center; justify-content: space-between; margin-top: 7px; }
      .cont-card-fecha { font-size: 11px; color: var(--ink-3); }
      .cont-card-saldo { font-size: 13px; font-weight: 700; }
      .cont-card-saldo.green { color: var(--success); }
      .cont-card-saldo.amber { color: var(--warn); }
      .cont-card-saldo.red   { color: var(--danger); }
```

También en el mismo bloque, ocultar la tabla en mobile y mostrar las cards:
```css
      .tabla-card { display: none; }
      #contratos-cards { display: flex; }
```

Y fuera del media query (en estilos base), asegurar que `#contratos-cards` esté oculto por defecto en desktop. Busca el cierre de `@media (max-width: 640px)` y agrega **después** en estilos base:
```css
    #contratos-cards { display: none; }
```

- [ ] **Step 2: Agregar el contenedor HTML para las cards**

Busca en HTML (línea ~1285):
```html
      <!-- Tabla de contratos -->
      <div class="tabla-card" id="tabla-contratos-card">
```
Agrega una línea **antes**:
```html
      <!-- Cards mobile de contratos -->
      <div id="contratos-cards"></div>

      <!-- Tabla de contratos -->
      <div class="tabla-card" id="tabla-contratos-card">
```

- [ ] **Step 3: Agregar función renderContratosCards**

Busca la función `renderTabla` (línea ~2511) y agrega la siguiente función **inmediatamente antes** de ella:

```js
function renderContratosCards(lista) {
  var cont = document.getElementById('contratos-cards');
  if (!cont) return;
  if (!lista.length) {
    cont.innerHTML = '<div class="tabla-vacio">Sin contratos que mostrar.</div>';
    return;
  }
  var ahora  = Date.now();
  var tzOff  = new Date().getTimezoneOffset() * 60000;
  var hoyStr = new Date(ahora - tzOff).toISOString().substring(0, 10);
  var en2Str = new Date(ahora - tzOff + 2 * 86400000).toISOString().substring(0, 10);
  var en7Str = new Date(ahora - tzOff + 7 * 86400000).toISOString().substring(0, 10);

  cont.innerHTML = lista.map(function(c) {
    var fs = c.FechaSesion ? String(c.FechaSesion).substring(0, 10) : '';
    var sesClass = fs
      ? (fs === hoyStr ? 'tr-ses-hoy'
         : fs <= en2Str ? 'tr-ses-pronto'
         : fs <= en7Str ? 'tr-ses-semana' : '')
      : '';
    var activo = tokenActivo === c.Token ? 'activo' : '';
    var _em = ESTATUS_MAP[c.Estatus] || { dot:'#9CA3AF', bg:'#F3F4F6', color:'#374151', label: c.Estatus || '—' };

    var saldoVal  = parseFloat(c.SaldoPendiente) || 0;
    var precioVal = parseFloat(c.PrecioTotal) || 0;
    var pagadoPct = precioVal > 0 ? Math.min(100, Math.round((precioVal - saldoVal) / precioVal * 100)) : 0;
    var saldoCls  = saldoVal <= 0 ? 'green' : pagadoPct >= 50 ? 'amber' : 'red';
    var saldoTxt  = saldoVal <= 0 ? '<i class="ti ti-check"></i> Liquidado' : fmxn(saldoVal);

    var fechaTxt = '';
    if (fs) {
      var sesColorStyle = sesClass === 'tr-ses-hoy'    ? 'color:var(--gold);font-weight:700'
                        : sesClass === 'tr-ses-pronto' ? 'color:var(--warn);font-weight:600'
                        : sesClass === 'tr-ses-semana' ? 'color:#3B82F6;font-weight:600'
                        : '';
      fechaTxt = '<span class="cont-card-fecha" style="'+sesColorStyle+'">'+fmxnFecha(fs)+'</span>';
    }

    var expressHtml = c.EntregaExpress
      ? '<span style="background:var(--express-bg);color:var(--express-color);font-size:9px;font-weight:800;letter-spacing:.8px;padding:1px 6px;border-radius:3px;margin-right:5px;vertical-align:middle">EXPRESS</span>'
      : '';

    return '<div class="cont-card '+[activo, sesClass].filter(Boolean).join(' ')+'" onclick="abrirPanel('+jsArg(c.Token)+')">'
      + '<div class="cont-card-top">'
      +   '<span class="cont-card-folio">'+(esc(c.Folio)||'—')+'</span>'
      +   '<span class="cont-card-pill" style="background:'+_em.bg+';color:'+_em.color+'">'
      +     '<span class="cont-card-pill-dot" style="background:'+_em.dot+'"></span>'
      +     _em.label
      +   '</span>'
      + '</div>'
      + '<div class="cont-card-nombre">'+expressHtml+esc(c.NombreCliente)+'</div>'
      + (c.PaqueteBase ? '<div class="cont-card-paquete">'+esc(c.PaqueteBase)+'</div>' : '')
      + '<div class="cont-card-bottom">'
      +   (fechaTxt || '<span></span>')
      +   '<span class="cont-card-saldo '+saldoCls+'">'+saldoTxt+'</span>'
      + '</div>'
      + '</div>';
  }).join('');
}
```

- [ ] **Step 4: Llamar renderContratosCards desde renderTabla**

Al final de `renderTabla` (justo antes de las dos llamadas a `actualizarStatsRibbon` y `actualizarNavBadges`), agrega:
```js
  renderContratosCards(lista);
```

El final de `renderTabla` se ve así:
```js
  actualizarStatsRibbon(todosContratos);
  actualizarNavBadges(todosContratos);
}
```
Déjalo como:
```js
  renderContratosCards(lista);
  actualizarStatsRibbon(todosContratos);
  actualizarNavBadges(todosContratos);
}
```

- [ ] **Step 5: Verificar en mobile (DevTools)**

Abre `http://localhost:8788/admin.html`. En Chrome DevTools activa modo mobile (iPhone SE o Pixel 5). Confirma:
- Se ven cards con folio arriba, nombre grande, paquete, fecha + saldo abajo.
- Las cards con sesión hoy tienen borde dorado.
- Al hacer click en una card se abre el panel de detalle.
- En desktop (≥ 1024px) se ve la tabla normal, no las cards.

- [ ] **Step 6: Commit**

```bash
git add frontend/admin.html
git commit -m "feat(R49): card propia para lista de contratos en mobile"
git push origin main
```

---

## Task 5 — R50: Toolbar simplificada — menú ··· para acciones secundarias

**Files:**
- Modify: `frontend/admin.html` — HTML (toolbar), CSS (nuevo `.toolbar-menu`), JS (toggle)

### Por qué

La toolbar tiene 9 controles en una fila (búsqueda, chips, select, Fechas, Nuevo, refresh, export, selección). Los tres últimos son acciones secundarias que no necesitan estar siempre visibles. Un menú "···" los agrupa sin perder funcionalidad.

- [ ] **Step 1: Agregar CSS para el menú ···**

Busca el bloque `/* ── AUTOCOMPLETE */` (línea ~612) y agrega **antes** de él:
```css
    /* ── TOOLBAR MENU ─────────────────────────────────── */
    .toolbar-menu-wrap { position: relative; }
    .toolbar-menu-btn {
      display: flex; align-items: center; justify-content: center;
      width: 34px; height: 34px;
      background: none; border: 1.5px solid var(--border-2);
      border-radius: var(--r); cursor: pointer; color: var(--ink-2);
      font-size: 16px; font-family: inherit;
    }
    .toolbar-menu-btn:hover { background: var(--page); }
    .toolbar-menu-btn.activo { border-color: var(--gold); color: var(--gold); background: var(--gold-pale); }
    .toolbar-menu-dropdown {
      display: none;
      position: absolute; right: 0; top: calc(100% + 6px); z-index: 200;
      background: var(--card); border: 1px solid var(--border-2);
      border-radius: var(--r-lg); box-shadow: var(--shadow-md);
      min-width: 180px; padding: 4px;
    }
    .toolbar-menu-dropdown.visible { display: block; }
    .toolbar-menu-item {
      display: flex; align-items: center; gap: 9px;
      padding: 8px 12px; border-radius: 6px; cursor: pointer;
      font-size: 13px; font-weight: 600; color: var(--ink-2);
      background: none; border: none; width: 100%; text-align: left;
      font-family: inherit;
    }
    .toolbar-menu-item:hover { background: var(--page); color: var(--ink-1); }
    .toolbar-menu-item i { font-size: 15px; color: var(--ink-3); }
    .toolbar-menu-item.activo { color: var(--gold); }
    .toolbar-menu-item.activo i { color: var(--gold); }
    .toolbar-menu-sep { border: none; border-top: 1px solid var(--border); margin: 3px 0; }
```

- [ ] **Step 2: Reemplazar los tres botones en el HTML del toolbar**

Busca en el toolbar (líneas ~1264–1272):
```html
          <button class="btn-secundario btn-sm" id="btn-refresh-tabla" onclick="cargarContratos()" title="Actualizar">
            <i class="ti ti-refresh"></i>
          </button>
          <button class="btn-secundario btn-sm" id="btn-export-csv" onclick="descargarCSV()" title="Exportar CSV">
            <i class="ti ti-table-export"></i>
          </button>
          <button class="btn-seleccion" id="btn-seleccion" onclick="toggleModoSeleccion()" title="Selección masiva">
            <i class="ti ti-checkbox"></i>
          </button>
```
Reemplaza con:
```html
          <div class="toolbar-menu-wrap">
            <button class="toolbar-menu-btn" id="btn-toolbar-menu" onclick="toggleToolbarMenu()" title="Más acciones">
              <i class="ti ti-dots"></i>
            </button>
            <div class="toolbar-menu-dropdown" id="toolbar-menu-dropdown">
              <button class="toolbar-menu-item" onclick="cargarContratos();cerrarToolbarMenu()">
                <i class="ti ti-refresh"></i> Actualizar
              </button>
              <button class="toolbar-menu-item" onclick="descargarCSV();cerrarToolbarMenu()">
                <i class="ti ti-table-export"></i> Exportar CSV
              </button>
              <hr class="toolbar-menu-sep">
              <button class="toolbar-menu-item" id="menu-item-seleccion" onclick="toggleModoSeleccion();cerrarToolbarMenu()">
                <i class="ti ti-checkbox"></i> Selección masiva
              </button>
            </div>
          </div>
```

- [ ] **Step 3: Agregar JS para el menú**

Busca la función `toggleModoSeleccion` (línea ~1760) y agrega **antes** de ella:
```js
function toggleToolbarMenu() {
  var dd = document.getElementById('toolbar-menu-dropdown');
  var btn = document.getElementById('btn-toolbar-menu');
  if (!dd) return;
  dd.classList.toggle('visible');
  if (btn) btn.classList.toggle('activo', dd.classList.contains('visible'));
}

function cerrarToolbarMenu() {
  var dd = document.getElementById('toolbar-menu-dropdown');
  var btn = document.getElementById('btn-toolbar-menu');
  if (dd) dd.classList.remove('visible');
  if (btn) btn.classList.remove('activo');
}
```

También hay que cerrar el menú al hacer click fuera. Busca el listener de `click` en document o agrega en la función `init` (busca `document.addEventListener('click'`). Si no existe un listener de click global, agrégalo en el bloque de inicialización al final del JS:

```js
document.addEventListener('click', function(e) {
  var wrap = document.querySelector('.toolbar-menu-wrap');
  if (wrap && !wrap.contains(e.target)) cerrarToolbarMenu();
});
```

- [ ] **Step 4: Actualizar toggleModoSeleccion para reflejar estado activo en el menú**

Busca dentro de `toggleModoSeleccion`:
```js
  document.getElementById('btn-seleccion').classList.toggle('activo', modoSeleccion);
```
Reemplaza con:
```js
  var menuItem = document.getElementById('menu-item-seleccion');
  if (menuItem) menuItem.classList.toggle('activo', modoSeleccion);
```

Y en `salirModoSeleccion`:
```js
  document.getElementById('btn-seleccion').classList.remove('activo');
```
Reemplaza con:
```js
  var menuItemSel = document.getElementById('menu-item-seleccion');
  if (menuItemSel) menuItemSel.classList.remove('activo');
```

- [ ] **Step 5: Limpiar CSS del btn-seleccion antiguo**

El `.btn-seleccion` ya no está en el DOM pero su CSS ocupa espacio. Busca:
```css
    .btn-seleccion { background: none; border: 1.5px solid var(--border-2); border-radius: var(--r); padding: 7px 12px; font-size: 12px; font-weight: 600; color: var(--ink-2); cursor: pointer; white-space: nowrap; font-family: inherit; }
    .btn-seleccion.activo { border-color: var(--gold); color: var(--gold); }
```
Elimina esas dos líneas (ya no se usa).

- [ ] **Step 6: Verificar**

Abre el admin. La toolbar debe mostrar: búsqueda · chips · Fechas · Nuevo · `···`. Al hacer click en `···`, aparece el dropdown con Actualizar, Exportar CSV, Selección masiva. Al hacer click fuera, cierra. Al activar Selección masiva desde el menú, las filas muestran checkboxes normalmente.

- [ ] **Step 7: Commit**

```bash
git add frontend/admin.html
git commit -m "feat(R50): agrupa refresh/export/seleccion en menu ··· del toolbar"
git push origin main
```

---

## Task 6 — R51a: Campos de cliente se colapsan al seleccionar uno existente

**Files:**
- Modify: `frontend/admin.html` — funciones `seleccionarClienteContrato` y `limpiarClienteContrato`, CSS mínimo

### Por qué

Si el usuario selecciona un cliente existente, los campos Nombre/Correo/Teléfono se autollenan pero siguen editables y visualmente idénticos — no hay señal de que el cliente está "bloqueado". Al colapsarlos se reduce el riesgo de que el usuario edite datos y los desvincule del cliente original.

- [ ] **Step 1: Agregar clase CSS para campos bloqueados**

Busca el comentario `/* ── AUTOCOMPLETE */` y agrega **antes**:
```css
    /* ── CAMPOS BLOQUEADOS (cliente seleccionado) ──────── */
    .campo-locked input, .campo-locked textarea {
      background: var(--page); color: var(--ink-2);
      border-color: var(--border); cursor: default;
    }
    .campo-locked label::after {
      content: ' \2713'; color: var(--success); font-size: 11px;
    }
```

- [ ] **Step 2: Actualizar seleccionarClienteContrato para bloquear campos**

Busca la función `seleccionarClienteContrato` (línea ~5427). El cuerpo actual llena los valores. Agrega al **final** del cuerpo (antes del `}`):
```js
  ['est-nombre','est-correo','est-telefono'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) { el.readOnly = true; el.closest('.campo').classList.add('campo-locked'); }
  });
```

- [ ] **Step 3: Actualizar limpiarClienteContrato para desbloquear campos**

Busca la función `limpiarClienteContrato` (línea ~5447). Agrega al final:
```js
  ['est-nombre','est-correo','est-telefono'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) { el.readOnly = false; el.closest('.campo').classList.remove('campo-locked'); }
  });
```

- [ ] **Step 4: Verificar**

En el formulario de nuevo contrato, busca un cliente. Al seleccionarlo: los campos Nombre/Correo/Teléfono deben tener fondo grisado y el label debe mostrar un `✓`. Al hacer "✕ quitar", vuelven editables.

- [ ] **Step 5: Commit**

```bash
git add frontend/admin.html
git commit -m "feat(R51a): campos de cliente se bloquean al seleccionar cliente existente"
git push origin main
```

---

## Task 7 — R52a: Paquetes del modal "Nuevo trabajo" desde el backend

**Files:**
- Modify: `frontend/admin.html` — función `abrirModalTrabajo`, contenedor `#trab-paquetes-checks`

### Por qué

Los paquetes y precios están hardcodeados en el HTML (líneas ~1505–1513). Si se actualiza un precio en Paquetes, el modal de "Nuevo trabajo" seguirá mostrando el precio viejo. Cargarlos desde `listarPaquetes` garantiza consistencia.

- [ ] **Step 1: Vaciar el HTML hardcodeado de paquetes**

Busca en el HTML del modal nuevo trabajo:
```html
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px" id="trab-paquetes-checks">
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" value="RES-COMBO"> Residencial $4,500</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" value="TER-COMBO"> Terreno $4,000</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" value="IND-FOTO"> Fotografía $3,000</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" value="IND-VIDEO"> Video+Drone $3,000</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" value="IND-360"> 360° $3,000</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" value="ADD-LANDING"> +Landing $1,200</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" value="ADD-FOLLETO"> +Folleto $800</label>
        </div>
```
Reemplaza con:
```html
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px" id="trab-paquetes-checks">
          <span style="font-size:12px;color:var(--ink-3)">Cargando…</span>
        </div>
```

- [ ] **Step 2: Agregar función para poblar el contenedor**

Busca la función `abrirModalTrabajo` (busca `function abrirModalTrabajo`). Agrega al **final** del cuerpo de esa función (antes del `}`), después de la lógica que ya existe:

```js
  var paqCont = document.getElementById('trab-paquetes-checks');
  if (paqCont && !paqCont.dataset.loaded) {
    apiGet({ action: 'listarPaquetes' }).then(function(r) {
      if (!r.ok || !r.paquetes) return;
      var paqActivos = r.paquetes.filter(function(p) { return p.Activo !== 0; });
      paqCont.innerHTML = paqActivos.map(function(p) {
        var precio = p.Precio ? ' $' + Number(p.Precio).toLocaleString('es-MX') : '';
        return '<label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer">'
          + '<input type="checkbox" value="'+esc(p.Clave||p.clave)+'">'
          + esc(p.Nombre || p.nombre || p.Clave) + precio
          + '</label>';
      }).join('');
      paqCont.dataset.loaded = '1';
    }).catch(function() {
      paqCont.innerHTML = '<span style="font-size:12px;color:var(--ink-3)">Error al cargar paquetes.</span>';
    });
  }
```

**Nota:** `dataset.loaded` hace que la carga ocurra solo la primera vez que se abre el modal en la sesión. Si quieres que refresque, elimina `paqCont.dataset.loaded = '1'`.

- [ ] **Step 3: Verificar**

Abre "Nuevo trabajo". La lista de paquetes debe mostrar "Cargando…" brevemente y luego los paquetes activos del backend con sus nombres y precios reales. Seleccionar uno y crear el trabajo debe funcionar igual que antes.

- [ ] **Step 4: Commit**

```bash
git add frontend/admin.html
git commit -m "feat(R52a): paquetes del modal Nuevo Trabajo se cargan desde listarPaquetes"
git push origin main
```

---

## Task 8 — R52b: Chips seleccionables en lugar de checkboxes de paquetes

**Files:**
- Modify: `frontend/admin.html` — función que puebla `#trab-paquetes-checks` (recién escrita en Task 7), función `guardarNuevoTrabajo`

### Por qué

Los checkboxes de 12px son difíciles de tocar en mobile. El estilo `par-tipo-btn` (chips seleccionables) ya existe en el mismo modal justo arriba, así que la coherencia visual es inmediata.

- [ ] **Step 1: Cambiar el render de paquetes a chips**

En la función que acabas de escribir en `abrirModalTrabajo`, el `paqCont.innerHTML = ...` genera labels con checkboxes. Reemplaza esa asignación:

```js
      paqCont.innerHTML = paqActivos.map(function(p) {
        var precio = p.Precio ? ' $' + Number(p.Precio).toLocaleString('es-MX') : '';
        return '<label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer">'
          + '<input type="checkbox" value="'+esc(p.Clave||p.clave)+'">'
          + esc(p.Nombre || p.nombre || p.Clave) + precio
          + '</label>';
      }).join('');
```
Con:
```js
      paqCont.innerHTML = paqActivos.map(function(p) {
        var precio = p.Precio ? ' <span style="font-size:10px;opacity:0.7">$'+Number(p.Precio).toLocaleString('es-MX')+'</span>' : '';
        var clave = esc(p.Clave || p.clave || '');
        return '<button type="button" class="par-tipo-btn trab-paq-chip" data-clave="'+clave+'" onclick="togglePaqChip(this)">'
          + esc(p.Nombre || p.nombre || p.Clave) + precio
          + '</button>';
      }).join('');
```

- [ ] **Step 2: Agregar función togglePaqChip**

Busca la función `seleccionarInteresTrab` (busca `function seleccionarInteresTrab`) y agrega **después** de ella:
```js
function togglePaqChip(btn) {
  btn.classList.toggle('activo-par');
}
```

- [ ] **Step 3: Actualizar guardarNuevoTrabajo para leer chips**

Busca en `guardarNuevoTrabajo`:
```js
  var paquetes = Array.from(document.querySelectorAll('#trab-paquetes-checks input:checked')).map(function(cb){ return cb.value; });
```
Reemplaza con:
```js
  var paquetes = Array.from(document.querySelectorAll('#trab-paquetes-checks .trab-paq-chip.activo-par')).map(function(btn){ return btn.dataset.clave; });
```

- [ ] **Step 4: Ajustar el grid del contenedor de chips**

El contenedor actual usa `display:flex;flex-wrap:wrap`. Los `par-tipo-btn` funcionan mejor con `grid`. Busca el div del contenedor en `abrirModalTrabajo`:

La línea HTML original dice:
```html
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px" id="trab-paquetes-checks">
```
Cámbiala a:
```html
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px" id="trab-paquetes-checks">
```

- [ ] **Step 5: Verificar**

Abre "Nuevo trabajo". Los paquetes deben verse como chips 2 columnas, iguales a los botones de "¿Qué le interesa?". Al hacer click en uno se activa (borde dorado). Crear trabajo con chips seleccionados debe guardar las claves correctamente.

- [ ] **Step 6: Commit**

```bash
git add frontend/admin.html
git commit -m "feat(R52b): checkboxes de paquetes reemplazados por chips par-tipo-btn"
git push origin main
```

---

## Task 9 — R52c: Jerarquía visual de card de cliente

**Files:**
- Modify: `frontend/admin.html` — función `renderListaClientes`

### Por qué

La fila `.cli-card-meta` mezcla teléfono, correo, origen, pipeline y conteo de contratos sin jerarquía. En clientes con todos los datos, se amontona. La propuesta: nombre + teléfono prominentes en primera línea, correo si hay en segunda, badges (origen, pipeline, contratos) en tercera.

- [ ] **Step 1: Reestructurar el bloque de meta en renderListaClientes**

Busca en `renderListaClientes` el bloque que construye `cli-card-meta`:
```js
    html += '<div class="cli-card-meta">';
    if (telefono) html += '<span class="cli-card-tel">'+esc(telefono)+'</span>';
    if (correo) html += '<span class="cli-card-correo">'+esc(correo)+'</span>';
    if (origenStr) html += '<span class="badge" style="font-size:11px;background:var(--page);border:1px solid var(--border);color:var(--ink-3)">'+esc(origenStr)+'</span>';
    if (trabajosActivos > 0) html += '<span class="badge" style="background:rgba(201,168,76,0.12);color:var(--gold-text,#8a6a00)">'+trabajosActivos+' en pipeline</span>';
    if (numContratos > 0) html += '<span style="font-size:11px;color:var(--ink-3)">'+numContratos+' contrato'+(numContratos!==1?'s':'')+'</span>';
    html += '</div>';
```
Reemplaza con:
```js
    html += '<div class="cli-card-meta">';
    if (telefono) html += '<span class="cli-card-tel">'+esc(telefono)+'</span>';
    html += '</div>';
    if (correo) html += '<div style="font-size:11px;color:var(--ink-3);margin-top:1px">'+esc(correo)+'</div>';
    var badges = [];
    if (origenStr) badges.push('<span class="badge" style="font-size:10px;background:var(--page);border:1px solid var(--border);color:var(--ink-3)">'+esc(origenStr)+'</span>');
    if (trabajosActivos > 0) badges.push('<span class="badge" style="font-size:10px;background:rgba(201,168,76,0.12);color:var(--gold-text,#8a6a00)">'+trabajosActivos+' en pipeline</span>');
    if (numContratos > 0) badges.push('<span class="badge" style="font-size:10px;background:var(--page);border:1px solid var(--border);color:var(--ink-3)">'+numContratos+' contrato'+(numContratos!==1?'s':'')+'</span>');
    if (badges.length) html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px">'+badges.join('')+'</div>';
```

- [ ] **Step 2: Verificar**

En la sección Clientes, las cards deben mostrar: nombre bold, teléfono en la misma línea (meta), correo si existe en línea separada más pequeña, y los badges (origen / pipeline / contratos) agrupados en una fila de chips al fondo de la card.

- [ ] **Step 3: Commit**

```bash
git add frontend/admin.html
git commit -m "style(R52c): jerarquiza la info de las cards de cliente (nombre/tel/correo/badges)"
git push origin main
```

---

## Self-Review

### Spec coverage

| Requisito | Task |
|---|---|
| ESTATUS_MAP unificado | Task 1 |
| Tokens para hex sueltos | Task 2 |
| JetBrains Mono | Task 3 |
| Card mobile contratos | Task 4 |
| Toolbar menú ··· | Task 5 |
| Campos cliente colapsan | Task 6 |
| Paquetes desde backend | Task 7 |
| Chips en lugar de checkboxes | Task 8 |
| Jerarquía card cliente | Task 9 |

**R51b (unificar sec-nuevo y drawer-nuevo):** Esta arquitectura ya está implementada — `abrirDrawerNuevo` mueve el `.form-card` entre `#sec-nuevo` y `#drawer-nuevo-content` en runtime. No requiere cambios.

### Placeholder scan — ninguno.

### Type consistency

- `ESTATUS_MAP` definido en Task 1, consumido en Task 4 (renderContratosCards). Verificado: ambos usan las propiedades `.dot`, `.bg`, `.color`, `.label`.
- `jsArg` se usa en Task 4 para `abrirPanel(token)` — función ya existe en el archivo.
- `fmxnFecha` y `fmxn` usados en Task 4 — ambas existen en admin.html.
- `togglePaqChip` definido en Task 8 Step 2, referenciado en Step 1 del mismo task.
