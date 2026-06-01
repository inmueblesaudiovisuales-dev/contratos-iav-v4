# Plan R15 — Rediseño Tab Contratos + Radar de Sesiones

> Fecha: 2026-06-01  
> Estado: listo para implementar  
> Ejecutar con DeepSeek o Claude  

---

## Contexto

El tab de Contratos tiene un problema de cambio de contexto: Bruno usa principalmente dos vistas (Sesiones y Abiertos) pero están tratadas como modos equivalentes en un toggle de filtros, junto con controles de fecha/estatus que rara vez se usan. Esto obliga a cambiar de modo constantemente para ver dimensiones distintas de los mismos contratos.

**Solución**: Rediseñar la zona superior del tab Contratos para que tenga:
1. Tabs con underline y contadores reales (Sesiones · Abiertos · Todos)
2. Un "Radar de sesiones" — tira horizontal de píldoras clicables con las próximas sesiones, siempre visible en Abiertos/Todos
3. Indicador visual de proximidad de sesión en las filas de la tabla
4. Filtros de fecha colapsados tras un botón, con badge cuando están activos
5. Stats bar reducida a 3 cards (eliminar las redundantes con los nuevos elementos)

---

## Archivos a leer antes de implementar

```
/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/frontend/admin.html
```

Líneas clave de referencia (usar para ubicarse, el archivo tiene ~3418 líneas):
- L12–42: Variables CSS (`:root`)
- L89–98: Estilos de tabs principales (`.tab-btn`, `.activo`)
- L102–127: Estilos de barra y tabla (`.barra`, `.tabla-card`, `.td-*`)
- L129–174: Estilos de vista Sesiones (`.ses-row`, `.ses-fecha`, etc.)
- L450–520: Media queries mobile
- L522–577: Estilos secundarios en segundo bloque `<style>` (`.ciclo-btn`, `.activo-ciclo`)
- L633–707: HTML de `#sec-contratos` — zona a rediseñar
- L932–946: Variables JS globales (`filtroCiclo`, `ESTATUS_ABIERTOS`, `todosContratos`)
- L1036–1041: `toggleFiltrosMobile()` — a reemplazar
- L1108–1125: `mostrarTab()` — contiene referencia muerta a `renderSesionesFuturas`
- L1380–1449: `cargarContratos()`, `renderStatsBar()`, `actualizarAlertaHoy()`
- L1451–1485: `setCiclo()`, `filtrarContratos()`
- L1499–1538: `renderTabla()`
- L1540–1597: `renderSesiones()`
- L2701–2729: Funciones utilitarias (`fmxn`, `fmxnFecha`, `esc`)

---

## FASE 0 — Auditoría de bugs pre-implementación

Antes de cualquier cambio, verificar y corregir estos bugs existentes:

### B1 — Referencia muerta a `renderSesionesFuturas` (L1121-1123)

```js
// BUSCAR este bloque en mostrarTab():
if (id === 'sesiones') {
  if (!todosContratos.length) cargarContratos().then(renderSesionesFuturas);
  else renderSesionesFuturas();
}
```

`renderSesionesFuturas` fue eliminada en sesiones anteriores. Este bloque nunca se ejecuta (no existe tab con `data-tab="sesiones"`) pero es código muerto con referencia inválida.

**Fix**: Eliminar completamente ese bloque `if (id === 'sesiones') { ... }` dentro de `mostrarTab`.

### B2 — `querySelector('.tabla-card')` puede apuntar al elemento incorrecto (L1456)

```js
// BUSCAR en setCiclo():
document.querySelector('.tabla-card').style.display = ciclo === 'sesiones' ? 'none' : '';
```

`querySelector` devuelve el PRIMER `.tabla-card` del DOM. Si algún día hay `.tabla-card` antes de `#sec-contratos`, fallará silenciosamente. Debe apuntar específicamente a la tabla de contratos.

**Fix**: Agregar `id="tabla-contratos-card"` al div con clase `tabla-card` dentro de `#sec-contratos` (L688), y cambiar la línea a:

```js
document.getElementById('tabla-contratos-card').style.display = ciclo === 'sesiones' ? 'none' : '';
```

### B3 — `fmxnFecha` muestra fechas con desfase de zona horaria (L2705-2710)

```js
// CÓDIGO ACTUAL:
function fmxnFecha(val) {
  if (!val) return '—';
  const d = new Date(val);   // ← new Date('2026-06-05') = medianoche UTC = 5-jun pero en MX puede ser 4-jun
  if (isNaN(d)) return String(val);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}
```

Para fechas ISO sin hora (`YYYY-MM-DD`), `new Date` las interpreta como UTC medianoche. En zona horaria MX (UTC-5/UTC-6) esto muestra el día anterior.

**Fix**: Aplicar la misma corrección que ya tiene `fmxnFechaLarga`:

```js
function fmxnFecha(val) {
  if (!val) return '—';
  const str = String(val).includes('T') ? val : val + 'T12:00:00';
  const d = new Date(str);
  if (isNaN(d)) return String(val);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}
```

---

## FASE 1 — CSS: nuevos estilos

### Paso 1A — Agregar estilos de contratos-tabs y radar

Localizar el bloque comentado `/* ── VISTA SESIONES ──` (alrededor de L129) y agregar **antes** de él el siguiente bloque CSS nuevo:

```css
/* ── CONTRATOS TABS (reemplazan ciclo-toggle en esta sección) ─── */
.contratos-tabs {
  display: flex; gap: 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}
.contratos-tab {
  padding: 10px 16px; border: none; background: none;
  font-size: 13px; font-weight: 700; color: var(--ink-3);
  cursor: pointer; border-bottom: 2.5px solid transparent;
  margin-bottom: -1px; transition: color 150ms;
  display: flex; align-items: center; gap: 7px;
  white-space: nowrap;
}
.contratos-tab:hover { color: var(--ink-1); }
.contratos-tab.activo-ctab { color: var(--ink-1); border-bottom-color: var(--gold); }
.ctab-badge {
  font-size: 10px; font-weight: 700; border-radius: 10px;
  padding: 1px 6px; min-width: 18px; text-align: center; display: none;
}
.contratos-tab.activo-ctab .ctab-badge { background: var(--gold); color: #fff; display: inline; }
.contratos-tab:not(.activo-ctab) .ctab-badge { background: var(--ink-4); color: var(--ink-2); display: inline; }

/* ── RADAR DE SESIONES ─────────────────────────────────────────── */
.radar-strip {
  display: flex; gap: 8px; overflow-x: auto;
  margin-bottom: 12px; padding-bottom: 4px;
  scrollbar-width: none;
}
.radar-strip::-webkit-scrollbar { display: none; }
.radar-pil {
  display: flex; align-items: center; gap: 7px;
  padding: 6px 12px; border-radius: 20px; border: 1.5px solid;
  cursor: pointer; white-space: nowrap;
  font-size: 12px; font-weight: 600; flex-shrink: 0;
  transition: box-shadow 150ms, transform 150ms;
}
.radar-pil:hover { transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,.10); }
.radar-pil-hoy    { background: var(--gold-pale); border-color: var(--gold-border); color: var(--warn); }
.radar-pil-pronto { background: #FFFBEB; border-color: #FDE68A; color: #B45309; }
.radar-pil-semana { background: #EFF6FF; border-color: #BFDBFE; color: #2563EB; }

/* ── INDICADORES DE SESIÓN EN FILAS DE TABLA ──────────────────── */
.tabla-card tbody tr.tr-ses-hoy    { border-left: 3px solid var(--gold); }
.tabla-card tbody tr.tr-ses-pronto { border-left: 3px solid #F59E0B; }
.tabla-card tbody tr.tr-ses-semana { border-left: 3px solid #3B82F6; }

/* ── BOTÓN FILTROS (desktop + mobile unificado) ────────────────── */
.btn-filtros-toggle {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 12px; border: 1.5px solid var(--border2);
  border-radius: var(--r); background: var(--page); color: var(--ink-2);
  font-size: 12px; font-weight: 700; cursor: pointer;
  transition: all 120ms; white-space: nowrap;
}
.btn-filtros-toggle.activo { border-color: var(--gold); color: var(--gold); background: var(--gold-pale); }
.filtros-badge {
  background: var(--warn); color: #fff; border-radius: 10px;
  font-size: 10px; font-weight: 700; padding: 1px 5px;
}
```

### Paso 1B — Ocultar `.barra-filtros` por defecto en desktop

Localizar en el primer bloque `<style>`:

```css
.barra-filtros { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; } /* visible en desktop */
```

Reemplazar con:

```css
.barra-filtros { display: none; align-items: center; gap: 10px; flex-wrap: wrap; }
.barra-filtros.visible { display: flex; }
```

### Paso 1C — Actualizar media query mobile

En la sección `@media (max-width: 640px)`, hay varias reglas a modificar:

**Quitar** el bloque entero de `.barra-filtros` y `.btn-filtros-mobile`:
```css
/* ELIMINAR estos bloques del @media: */
.barra-filtros { display: none; flex-wrap: wrap; }
.barra-filtros.visible { display: flex; }
.btn-filtros-mobile {
  display: flex; align-items: center; justify-content: center;
  background: none; border: 1.5px solid var(--border2);
  border-radius: var(--r); padding: 7px 10px;
  font-size: 13px; color: var(--ink-2); cursor: pointer;
}
.btn-filtros-mobile.activo { border-color: var(--gold); color: var(--gold); }
#filtro-estatus { flex: 1; min-width: 0; }
#filtro-fecha-desde, #filtro-fecha-hasta { flex: 1; min-width: 0; }
```

**Agregar** en su lugar (dentro del mismo `@media`):
```css
#filtro-estatus { flex: 1; min-width: 0; }
#filtro-fecha-desde, #filtro-fecha-hasta { flex: 1; min-width: 0; }
```

(El `.btn-filtros-toggle` ya tiene estilos globales; en mobile solo necesita que los inputs de fecha sean flex.)

---

## FASE 2 — HTML: nueva estructura de `#sec-contratos`

Localizar el bloque completo (L642–707):

```html
<div id="sec-contratos" class="seccion activa">
  <div id="alerta-sesion-hoy" ...></div>
  <div id="stats-bar" ...></div>
  <div class="barra">
    <div class="barra-fila-principal">
      <div class="campo-busqueda">...</div>
      <button class="btn-filtros-mobile" ...>...</button>
      <button class="btn-primario gold" onclick="irANuevo()">...</button>
      <button class="btn-secundario btn-sm" onclick="cargarContratos()" ...>...</button>
      <button class="btn-secundario btn-sm" onclick="descargarCSV()" ...>...</button>
      <button class="btn-seleccion" ...>...</button>
    </div>
    <div class="barra-filtros" id="barra-filtros">
      <div class="ciclo-toggle">
        <button id="ciclo-btn-abiertos" ...>Abiertos</button>
        <button id="ciclo-btn-todos"    ...>Todos</button>
        <button id="ciclo-btn-sesiones" ...>Sesiones</button>
      </div>
      <select id="filtro-estatus" ...>...</select>
      <span class="filtro-fecha-label">Fecha de creación:</span>
      <input type="date" id="filtro-fecha-desde" ...>
      <input type="date" id="filtro-fecha-hasta" ...>
    </div>
  </div>
  <div class="tabla-card">...</div>
  <div id="sesiones-lista" ...></div>
</div>
```

Reemplazar **todo** ese bloque con:

```html
<div id="sec-contratos" class="seccion activa">

  <!-- Stats bar simplificada (3 tarjetas — JS las llena) -->
  <div id="stats-bar" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:16px"></div>

  <!-- Tabs de navegación con contadores -->
  <div class="contratos-tabs">
    <button id="ctab-sesiones" class="contratos-tab" onclick="setCiclo('sesiones')">
      Sesiones <span id="ctab-badge-sesiones" class="ctab-badge"></span>
    </button>
    <button id="ctab-abiertos" class="contratos-tab activo-ctab" onclick="setCiclo('abiertos')">
      Abiertos <span id="ctab-badge-abiertos" class="ctab-badge"></span>
    </button>
    <button id="ctab-todos" class="contratos-tab" onclick="setCiclo('todos')">
      Todos
    </button>
  </div>

  <!-- Radar de sesiones próximas (solo en Abiertos/Todos) -->
  <div id="radar-sesiones" class="radar-strip" style="display:none"></div>

  <!-- Toolbar -->
  <div class="barra">
    <div class="barra-fila-principal">
      <div class="campo-busqueda">
        <input type="text" id="busqueda" placeholder="Buscar por nombre, correo o folio..." oninput="filtrarContratos()">
      </div>
      <select id="filtro-estatus" onchange="filtrarContratos()" style="width:auto">
        <option value="">Todos los estatus</option>
        <option value="Pendiente firma">Pendiente firma</option>
        <option value="Firmado">Firmado</option>
        <option value="Anticipo recibido">Anticipo recibido</option>
        <option value="En produccion">En producción</option>
        <option value="Entregado">Entregado</option>
        <option value="Liquidado">Liquidado</option>
        <option value="Completado">Completado</option>
      </select>
      <button class="btn-filtros-toggle" id="btn-filtros-toggle" onclick="toggleFiltros()" title="Filtrar por fecha">
        <i class="ti ti-calendar-search"></i> Fechas
        <span id="badge-filtros" class="filtros-badge" style="display:none">1</span>
      </button>
      <button class="btn-primario gold" onclick="irANuevo()">
        <i class="ti ti-plus"></i> Nuevo
      </button>
      <button class="btn-secundario btn-sm" onclick="cargarContratos()" title="Actualizar">
        <i class="ti ti-refresh"></i>
      </button>
      <button class="btn-secundario btn-sm" onclick="descargarCSV()" title="Exportar CSV">
        <i class="ti ti-table-export"></i>
      </button>
      <button class="btn-seleccion" id="btn-seleccion" onclick="toggleModoSeleccion()" title="Selección masiva">
        <i class="ti ti-checkbox"></i>
      </button>
    </div>
    <!-- Filtros de fecha: colapsados por defecto -->
    <div class="barra-filtros" id="barra-filtros">
      <span class="filtro-fecha-label">Fecha de creación:</span>
      <input type="date" id="filtro-fecha-desde" onchange="filtrarContratos();actualizarBadgeFiltros()" style="width:auto" title="Creado desde">
      <input type="date" id="filtro-fecha-hasta" onchange="filtrarContratos();actualizarBadgeFiltros()" style="width:auto" title="Creado hasta">
      <button type="button" class="btn-secundario btn-sm" onclick="limpiarFiltrosFecha()" title="Limpiar fechas" style="color:var(--warn);font-size:12px">
        <i class="ti ti-x"></i> Limpiar
      </button>
    </div>
  </div>

  <!-- Tabla de contratos -->
  <div class="tabla-card" id="tabla-contratos-card">
    <table>
      <thead>
        <tr>
          <th id="th-check" style="display:none;width:36px"></th>
          <th>Folio</th>
          <th>Cliente</th>
          <th>Estatus</th>
          <th>Total</th>
          <th>Saldo</th>
          <th>Creado</th>
        </tr>
      </thead>
      <tbody id="tabla-body">
        <tr><td colspan="6" class="tabla-vacio">Cargando...</td></tr>
      </tbody>
    </table>
  </div>

  <!-- Vista de sesiones (modo Sesiones) -->
  <div id="sesiones-lista" class="tabla-card" style="display:none"></div>

</div>
```

---

## FASE 3 — JS: actualizar funciones existentes

### Paso 3A — Limpiar `mostrarTab` (bug B1)

Localizar en `mostrarTab` (alrededor de L1121):

```js
if (id === 'sesiones') {
  if (!todosContratos.length) cargarContratos().then(renderSesionesFuturas);
  else renderSesionesFuturas();
}
```

**Eliminar** ese bloque completo. `renderSesionesFuturas` no existe y la condición nunca se cumple.

### Paso 3B — Actualizar `setCiclo`

Localizar la función completa (alrededor de L1451):

```js
function setCiclo(ciclo) {
  filtroCiclo = ciclo;
  document.getElementById('ciclo-btn-abiertos').classList.toggle('activo-ciclo',  ciclo === 'abiertos');
  document.getElementById('ciclo-btn-todos').classList.toggle('activo-ciclo',     ciclo === 'todos');
  document.getElementById('ciclo-btn-sesiones').classList.toggle('activo-ciclo',  ciclo === 'sesiones');
  document.querySelector('.tabla-card').style.display      = ciclo === 'sesiones' ? 'none' : '';
  document.getElementById('sesiones-lista').style.display  = ciclo === 'sesiones' ? ''     : 'none';
  filtrarContratos();
}
```

Reemplazar con:

```js
function setCiclo(ciclo) {
  filtroCiclo = ciclo;
  // Tabs
  document.getElementById('ctab-sesiones').classList.toggle('activo-ctab', ciclo === 'sesiones');
  document.getElementById('ctab-abiertos').classList.toggle('activo-ctab', ciclo === 'abiertos');
  document.getElementById('ctab-todos').classList.toggle('activo-ctab',    ciclo === 'todos');
  // Contenedores
  document.getElementById('tabla-contratos-card').style.display = ciclo === 'sesiones' ? 'none' : '';
  document.getElementById('sesiones-lista').style.display        = ciclo === 'sesiones' ? ''     : 'none';
  // Radar: visible solo en abiertos/todos
  document.getElementById('radar-sesiones').style.display = ciclo === 'sesiones' ? 'none' : '';
  // Estatus: oculto en sesiones (irrelevante)
  document.getElementById('filtro-estatus').style.display = ciclo === 'sesiones' ? 'none' : '';
  // Botón de fechas: oculto en sesiones
  document.getElementById('btn-filtros-toggle').style.display = ciclo === 'sesiones' ? 'none' : '';
  filtrarContratos();
}
```

### Paso 3C — Actualizar `filtrarContratos`

Al final de la función (después del bloque `if (filtroCiclo === 'sesiones') {...} else {...}`), agregar las llamadas a las nuevas funciones:

```js
function filtrarContratos() {
  const q     = document.getElementById('busqueda').value.toLowerCase();
  const st    = document.getElementById('filtro-estatus').value;
  const desde = document.getElementById('filtro-fecha-desde').value;
  const hasta = document.getElementById('filtro-fecha-hasta').value;
  const hoy   = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
  let lista = todosContratos.filter(c => {
    if (filtroCiclo === 'abiertos' && !ESTATUS_ABIERTOS.includes(c.Estatus)) return false;
    if (filtroCiclo === 'sesiones' && (!c.FechaSesion || String(c.FechaSesion).substring(0, 10) < hoy)) return false;
    if (st && c.Estatus !== st) return false;
    if (q && !(((c.NombreCliente||'') + (c.CorreoCliente||'') + (c.Folio||'')).toLowerCase().includes(q))) return false;
    if (filtroCiclo !== 'sesiones' && (desde || hasta)) {
      const fecha = String(c.FechaCreacion || '').substring(0, 10);
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
    }
    return true;
  });
  if (filtroCiclo === 'sesiones') {
    lista = lista.slice().sort((a, b) => String(a.FechaSesion).localeCompare(String(b.FechaSesion)));
    renderSesiones(lista);
  } else {
    renderTabla(lista);
  }
  // Actualizar badges y radar
  actualizarBadgesTabs();
  if (filtroCiclo !== 'sesiones') renderRadar();
}
```

### Paso 3D — Actualizar `renderTabla` para agregar indicadores de sesión

Localizar en `renderTabla` (alrededor de L1506) la línea donde se construye el `<tr>`:

```js
return `<tr class="${activo}" ${rowClick}>
```

Reemplazar con:

```js
const tzOff = new Date().getTimezoneOffset() * 60000;
const hoyStr = new Date(Date.now() - tzOff).toISOString().substring(0, 10);
const en2Str = new Date(Date.now() - tzOff + 2 * 86400000).toISOString().substring(0, 10);
const en7Str = new Date(Date.now() - tzOff + 7 * 86400000).toISOString().substring(0, 10);
const fs = c.FechaSesion ? String(c.FechaSesion).substring(0, 10) : '';
const sesClass = fs
  ? (fs === hoyStr ? 'tr-ses-hoy'
     : fs <= en2Str ? 'tr-ses-pronto'
     : fs <= en7Str ? 'tr-ses-semana' : '')
  : '';
return `<tr class="${[activo, sesClass].filter(Boolean).join(' ')}" ${rowClick}>
```

**Importante**: Asegurarse de que el cálculo de `hoyStr`, `en2Str`, `en7Str` esté dentro del `lista.map(c => {...})` loop pero fuera del cuerpo del template string, o mejor aún, calcular esos valores una sola vez ANTES del `lista.map`. La versión correcta es calcularlos una vez antes del map:

```js
function renderTabla(lista) {
  const tbody = document.getElementById('tabla-body');
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="${modoSeleccion ? 7 : 6}" class="tabla-vacio">Sin contratos que mostrar.</td></tr>`;
    return;
  }
  const ahora  = Date.now();
  const tzOff  = new Date().getTimezoneOffset() * 60000;
  const hoyStr = new Date(ahora - tzOff).toISOString().substring(0, 10);
  const en2Str = new Date(ahora - tzOff + 2 * 86400000).toISOString().substring(0, 10);
  const en7Str = new Date(ahora - tzOff + 7 * 86400000).toISOString().substring(0, 10);
  tbody.innerHTML = lista.map(c => {
    const activo    = tokenActivo === c.Token ? 'activo' : '';
    const checked   = seleccionados.has(c.Token) ? 'checked' : '';
    const checkCell = modoSeleccion
      ? `<td class="td-check" onclick="event.stopPropagation()"><input type="checkbox" class="row-check" ${checked} onchange="toggleSeleccion('${esc(c.Token)}',this)"></td>`
      : '';
    const rowClick  = modoSeleccion ? '' : `onclick="abrirPanel('${esc(c.Token)}')"`;
    const dias      = diasEnEstatus(c);
    const horasDesdeCreacion = c.FechaCreacion ? (ahora - new Date(c.FechaCreacion).getTime()) / 3600000 : 0;
    const alertaExpiry = c.Estatus === 'Pendiente firma' && horasDesdeCreacion > 60;
    const fs = c.FechaSesion ? String(c.FechaSesion).substring(0, 10) : '';
    const sesClass = fs
      ? (fs === hoyStr ? 'tr-ses-hoy'
         : fs <= en2Str ? 'tr-ses-pronto'
         : fs <= en7Str ? 'tr-ses-semana' : '')
      : '';
    return `<tr class="${[activo, sesClass].filter(Boolean).join(' ')}" ${rowClick}>
      ${checkCell}
      <td class="td-folio">${esc(c.Folio) || '—'}</td>
      <td>
        <div class="td-nombre">${esc(c.NombreCliente)}</div>
        <div class="td-sub">${esc(c.CorreoCliente)}</div>
        ${(c.FechaSesion || c.PaqueteBase) ? `<div class="td-sub" style="color:var(--ink-2)">${[c.FechaSesion ? fmxnFecha(c.FechaSesion) : '', c.PaqueteBase || ''].filter(Boolean).join(' · ')}</div>` : ''}
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${badgeEstatus(c.Estatus)}
          ${alertaExpiry ? `<i class="ti ti-alert-triangle" style="color:var(--warn);font-size:13px" title="Link próximo a expirar (más de 60 h en Pendiente firma)"></i>` : ''}
        </div>
        ${dias > 0 ? `<div class="td-sub" style="margin-top:3px">${dias} día${dias !== 1 ? 's' : ''} en este estatus</div>` : ''}
      </td>
      <td class="td-monto">${fmxn(c.PrecioTotal)}</td>
      <td class="td-saldo${(c.SaldoPendiente ?? 0) <= 0 ? ' pagado' : ''}">
        ${(c.SaldoPendiente ?? 0) > 0 ? fmxn(c.SaldoPendiente) : '<i class="ti ti-check" style="color:var(--success)"></i>'}
      </td>
      <td class="td-fecha">${fmxnFecha(c.FechaCreacion)}</td>
    </tr>`;
  }).join('');
}
```

### Paso 3E — Actualizar `renderStatsBar`

Localizar la función completa (alrededor de L1405). Reemplazarla con versión simplificada (3 tarjetas, elimina las redundantes):

```js
function renderStatsBar(s) {
  const bar = document.getElementById('stats-bar');
  if (!bar) return;
  const tarjetas = [
    { label: 'Facturado este mes',  valor: fmxn(s.facturado),  sub: '',                   color: 'var(--gold)' },
    { label: 'Cobrado este mes',    valor: fmxn(s.cobrado),    sub: '',                   color: 'var(--success)' },
    { label: 'Por cobrar (total)',  valor: fmxn(s.porCobrar),  sub: 'contratos abiertos', color: 'var(--warn)' },
  ];
  bar.innerHTML = tarjetas.map(t => `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:14px 16px">
      <p style="font-size:11px;color:var(--ink-3);margin:0 0 4px;text-transform:uppercase;letter-spacing:.05em">${t.label}</p>
      <p style="font-size:20px;font-weight:700;color:${t.color};margin:0 0 2px">${t.valor}</p>
      ${t.sub ? `<p style="font-size:11px;color:var(--ink-3);margin:0">${t.sub}</p>` : ''}
    </div>`).join('');
  // Ya no llama a actualizarAlertaHoy — fue reemplazado por el radar
  actualizarBadgesTabs();
}
```

### Paso 3F — Eliminar `actualizarAlertaHoy`

Localizar la función completa (L1434–1449):

```js
function actualizarAlertaHoy() {
  const el = document.getElementById('alerta-sesion-hoy');
  ...
}
```

**Eliminar** la función completa. El elemento `alerta-sesion-hoy` ya no existe en el HTML nuevo.

### Paso 3G — Reemplazar `toggleFiltrosMobile` con `toggleFiltros`

Localizar (alrededor de L1036):

```js
function toggleFiltrosMobile() {
  const div = document.getElementById('barra-filtros');
  const btn = document.getElementById('btn-filtros-mobile');
  const abierto = div.classList.toggle('visible');
  btn.classList.toggle('activo', abierto);
}
```

Reemplazar con:

```js
function toggleFiltros() {
  const div = document.getElementById('barra-filtros');
  const btn = document.getElementById('btn-filtros-toggle');
  const abierto = div.classList.toggle('visible');
  btn.classList.toggle('activo', abierto);
}
```

---

## FASE 4 — JS: nuevas funciones

Agregar las siguientes funciones juntas, justo después de `toggleFiltros` (o junto al bloque de `renderStatsBar` para mantener el código agrupado por responsabilidad):

### `renderRadar()`

```js
function renderRadar() {
  const cont = document.getElementById('radar-sesiones');
  if (!cont) return;
  const tzOff  = new Date().getTimezoneOffset() * 60000;
  const hoy    = new Date(Date.now() - tzOff).toISOString().substring(0, 10);
  const en7    = new Date(Date.now() - tzOff + 7 * 86400000).toISOString().substring(0, 10);
  const en2    = new Date(Date.now() - tzOff + 2 * 86400000).toISOString().substring(0, 10);
  const DIAS_CORTO = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

  // Solo contratos abiertos con sesión en los próximos 14 días
  const proximas = todosContratos.filter(c => {
    if (!c.FechaSesion) return false;
    const fs = String(c.FechaSesion).substring(0, 10);
    const en14 = new Date(Date.now() - tzOff + 14 * 86400000).toISOString().substring(0, 10);
    return fs >= hoy && fs <= en14;
  }).sort((a, b) => String(a.FechaSesion).localeCompare(String(b.FechaSesion)));

  if (!proximas.length) {
    cont.style.display = 'none';
    return;
  }
  cont.style.display = 'flex';

  cont.innerHTML = proximas.map(c => {
    const fs = String(c.FechaSesion).substring(0, 10);
    const d  = new Date(fs + 'T12:00:00');
    const esHoy = fs === hoy;
    const esProxDias = fs > hoy && fs <= en2;
    const cls = esHoy ? 'radar-pil-hoy' : esProxDias ? 'radar-pil-pronto' : 'radar-pil-semana';
    const etiqFecha = esHoy
      ? 'HOY'
      : `${DIAS_CORTO[d.getDay()]} ${d.getDate()} ${MESES_CORTO[d.getMonth()]}`;
    const iconoCam = `<i class="ti ti-camera" style="font-size:13px;flex-shrink:0"></i>`;
    return `<button class="radar-pil ${cls}" onclick="abrirPanel('${esc(c.Token)}')" title="${esc(c.NombreCliente)} · ${esc(c.PaqueteBase||'')}">
      ${iconoCam}
      <span style="font-weight:800">${etiqFecha}</span>
      <span style="font-weight:500;opacity:.85">${esc(c.NombreCliente.split(' ')[0])}</span>
    </button>`;
  }).join('');
}
```

### `actualizarBadgesTabs()`

```js
function actualizarBadgesTabs() {
  const tzOff = new Date().getTimezoneOffset() * 60000;
  const hoy   = new Date(Date.now() - tzOff).toISOString().substring(0, 10);

  const nSesiones = todosContratos.filter(c =>
    c.FechaSesion && String(c.FechaSesion).substring(0, 10) >= hoy
  ).length;

  const nAbiertos = todosContratos.filter(c =>
    ESTATUS_ABIERTOS.includes(c.Estatus)
  ).length;

  const badgeSes = document.getElementById('ctab-badge-sesiones');
  const badgeAb  = document.getElementById('ctab-badge-abiertos');

  if (badgeSes) {
    badgeSes.textContent = nSesiones;
    badgeSes.style.display = nSesiones > 0 ? 'inline' : 'none';
  }
  if (badgeAb) {
    badgeAb.textContent = nAbiertos;
    badgeAb.style.display = nAbiertos > 0 ? 'inline' : 'none';
  }
}
```

### `actualizarBadgeFiltros()`

```js
function actualizarBadgeFiltros() {
  const desde = document.getElementById('filtro-fecha-desde').value;
  const hasta = document.getElementById('filtro-fecha-hasta').value;
  const activos = [desde, hasta].filter(Boolean).length;
  const badge = document.getElementById('badge-filtros');
  if (badge) {
    badge.textContent = activos;
    badge.style.display = activos > 0 ? 'inline' : 'none';
  }
}
```

### `limpiarFiltrosFecha()`

```js
function limpiarFiltrosFecha() {
  document.getElementById('filtro-fecha-desde').value = '';
  document.getElementById('filtro-fecha-hasta').value = '';
  actualizarBadgeFiltros();
  filtrarContratos();
}
```

---

## FASE 5 — Verificación pre-deploy (checklist manual)

Abrir `admin.html` en Chrome localmente (con Live Server o abriendo el archivo directamente). **Nota**: la API solo responde desde el Worker en producción; para este chequeo visual usar el admin en producción tras el despliegue.

### V1 — Tabs de contratos
- [ ] Los tres tabs (Sesiones / Abiertos / Todos) aparecen con underline dorado en el activo
- [ ] El tab activo por defecto es Abiertos
- [ ] El badge de "Sesiones" muestra número correcto (contratos con FechaSesion >= hoy)
- [ ] El badge de "Abiertos" muestra número correcto
- [ ] Clic en cada tab cambia el activo correctamente

### V2 — Radar de sesiones
- [ ] Aparece debajo de los tabs en modo Abiertos y Todos
- [ ] Desaparece al cambiar a modo Sesiones
- [ ] Cada píldora muestra fecha + primer nombre del cliente
- [ ] Hoy → dorado, próximos 2 días → ámbar, resto de la semana → azul
- [ ] Clic en píldora abre el panel lateral del contrato correcto
- [ ] Si no hay sesiones próximas, la tira no ocupa espacio

### V3 — Indicadores en tabla
- [ ] Contratos con sesión hoy tienen borde izquierdo dorado en la fila
- [ ] Contratos con sesión mañana/pasado tienen borde ámbar
- [ ] Contratos con sesión esta semana tienen borde azul
- [ ] Contratos sin sesión no tienen borde izquierdo
- [ ] Los indicadores también se ven en mobile (vista de tarjetas)

### V4 — Filtros de fecha colapsados
- [ ] Al cargar, la fila de fechas está oculta
- [ ] Botón "Fechas" con ícono de calendario la despliega
- [ ] Al activar una fecha, aparece el badge rojo en el botón "Fechas"
- [ ] Botón "Limpiar" dentro del panel borra las fechas y oculta el badge
- [ ] El select de estatus está en la toolbar principal (no en el panel colapsable)
- [ ] El select de estatus se oculta en modo Sesiones

### V5 — Stats bar
- [ ] Solo 3 tarjetas: Facturado, Cobrado, Por cobrar
- [ ] No aparece "Contratos activos" ni "Sesiones esta semana"

### V6 — Mobile
- [ ] Los tabs de contratos (Sesiones/Abiertos/Todos) se ven en mobile
- [ ] El botón "Fechas" funciona en mobile
- [ ] El radar es scrollable horizontalmente en mobile sin barra de scroll visible
- [ ] Los indicadores de sesión en la tabla mobile (tarjetas) se ven correctamente

### V7 — Métricas (no deben romperse)
- [ ] El tab Métricas sigue mostrando sus propios `.ciclo-btn` (Este mes / Trimestre / etc.)
- [ ] Los `.ciclo-btn` de métricas siguen con el estilo `.activo-ciclo` correcto
- [ ] Los tabs principales (Contratos / Nuevo / Clientes / Métricas / Paquetes) siguen funcionando

### V8 — Regresión general
- [ ] Crear un contrato nuevo funciona
- [ ] Abrir panel lateral funciona desde tabla y desde radar
- [ ] Buscar por nombre/correo/folio filtra correctamente
- [ ] Filtrar por estatus funciona
- [ ] El modo Sesiones muestra la lista date-anchored correctamente

---

## FASE 6 — Auditoría de bugs post-implementación

Revisar que los siguientes puntos no introdujeron problemas nuevos:

### P1 — `setCiclo` ya no depende de IDs eliminados
Verificar que no quedan referencias a `ciclo-btn-abiertos`, `ciclo-btn-todos`, `ciclo-btn-sesiones`, `btn-filtros-mobile` en ninguna parte del JS. Buscar con grep:
```
grep -n "ciclo-btn-abiertos\|ciclo-btn-todos\|ciclo-btn-sesiones\|btn-filtros-mobile\|toggleFiltrosMobile\|alerta-sesion-hoy\|renderSesionesFuturas" admin.html
```
El resultado debe estar vacío o solo en comentarios.

### P2 — `renderRadar` no lanza error cuando `todosContratos` está vacío
`todosContratos` se inicializa como `[]`. El `.filter` en `renderRadar` devuelve `[]` y la función muestra `display:none` sin error. Verificar que la función no se llama antes de que el DOM esté listo (solo se llama desde `filtrarContratos` y `renderStatsBar`, ambas post-carga).

### P3 — Badge del tab no queda en `display: inline` con texto vacío
La función `actualizarBadgesTabs` usa `badgeSes.style.display = nSesiones > 0 ? 'inline' : 'none'`. Si `nSesiones === 0`, el badge queda oculto. Verificar en un entorno sin sesiones futuras.

### P4 — La clase `tr-ses-*` no conflictúa con la clase `activo`
Un `<tr>` puede tener ambas clases simultáneamente: `<tr class="activo tr-ses-hoy">`. El CSS de `.tabla-card tbody tr.activo td` aplica fondo `#FEF9ED` y el borde izquierdo `tr.tr-ses-hoy` son independientes. No hay conflicto. Verificar visualmente que el contrato activo (panel abierto) con sesión hoy muestra ambos: fondo activo Y borde dorado.

### P5 — `limpiarFiltrosFecha` actualiza tanto el badge como el filtrado
La función llama `actualizarBadgeFiltros()` + `filtrarContratos()`. Verificar que después de limpiar las fechas, la tabla se recarga sin el filtro de fechas.

### P6 — El radar no aparece en modo Sesiones aunque haya sesiones
`setCiclo('sesiones')` pone `radar-sesiones` en `display:none`. Verificar que cambiar de Abiertos a Sesiones y de vuelta a Abiertos vuelve a mostrar el radar correctamente.

---

## FASE 7 — Despliegue

```bash
cd "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/worker"
npx wrangler deploy
```

Verificar el Current Version ID en el output. Abrir `https://contratos.inmueblesaudiovisuales.com/admin.html` y ejecutar los checklist de V1–V8.

---

## Variables CSS de referencia (para no inventar valores)

```
--onyx:        #1C1C1E
--gold:        #C9A84C
--gold-pale:   #FAF6EC
--gold-border: #E8D5A3
--page:        #F5F5F0
--card:        #FFFFFF
--ink-1:       #1C1C1E
--ink-2:       #6B6B70
--ink-3:       #9B9B9F
--ink-4:       #C8C8CD
--border:      #E8E8EA
--border2:     #D5D5D8
--success:     #2D7A4F
--warn:        #B45309
--danger:      #C0392B
--r:           8px
--r-lg:        12px
```

Estilos externos: Tabler Icons vía CDN (`ti ti-*`). Fuente: Montserrat.

---

## Notas para el implementador

1. El archivo `admin.html` tiene ~3418 líneas. Usar los números de línea como referencia aproximada — pueden haber variado si se editó antes.
2. El segundo bloque `<style>` (alrededor de L522) contiene `.ciclo-btn` y `.activo-ciclo`. **No eliminar esos estilos** — los usa la sección de Métricas.
3. Los únicos IDs del ciclo-toggle que desaparecen: `ciclo-btn-abiertos`, `ciclo-btn-todos`, `ciclo-btn-sesiones`. Los nuevos IDs son `ctab-sesiones`, `ctab-abiertos`, `ctab-todos`.
4. La función `actualizarAlertaHoy` llama a `document.getElementById('alerta-sesion-hoy')` que ya no existirá. Eliminar la función completa para evitar error silencioso.
5. `renderStatsBar` actualmente termina con `actualizarAlertaHoy()`. Cambiar esa llamada a `actualizarBadgesTabs()`.
