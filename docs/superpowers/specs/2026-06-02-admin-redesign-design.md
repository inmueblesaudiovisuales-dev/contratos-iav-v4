# IAV Admin — Rediseno completo (R37)

**Fecha:** 2026-06-02  
**Archivo objetivo:** `frontend/admin.html`  
**Ronda:** R37

---

## Resumen de decisiones de diseno

| Decision | Eleccion |
|----------|----------|
| Estetica | Clean SaaS — blanco/gris, sin texturas |
| Tipografia | Montserrat (ya existente) |
| Acento de color | Dorado `#C9A84C` solo como marca — indicadores, fila activa, badges de conteo |
| Acciones primarias | Negro `#111111` |
| Fondo de pagina | `#F9F9F7` |
| Desktop nav | Sidebar fijo 200px con labels |
| Desktop detalle | Panel lateral fijo 340px (no overlay) |
| Mobile nav | Side menu (hamburger) — sin bottom nav |
| Mobile nuevo | Boton `+` en topbar — sin FAB |
| Mobile detalle | Pantalla completa con header "← volver" |

---

## 1. Tokens de diseno

```css
:root {
  --black:       #111111;
  --page:        #F9F9F7;
  --card:        #FFFFFF;
  --border:      #EBEBEB;
  --border-2:    #E0E0E0;
  --ink-1:       #111111;
  --ink-2:       #555555;
  --ink-3:       #888888;
  --ink-4:       #BBBBBB;
  --gold:        #C9A84C;
  --gold-light:  #FEF9ED;
  --gold-border: #E8D89A;
  --success:     #16A34A;
  --success-bg:  #DCFCE7;
  --warn:        #D97706;
  --warn-bg:     #FEF9C3;
  --danger:      #DC2626;
  --danger-bg:   #FEE2E2;
  --purple:      #6D28D9;
  --purple-bg:   #F5F3FF;
  --blue:        #1D4ED8;
  --blue-bg:     #DBEAFE;
  --r:           8px;
  --r-lg:        12px;
  --sidebar-w:   200px;
  --panel-w:     340px;
  --shadow-sm:   0 1px 4px rgba(0,0,0,0.06);
  --shadow-md:   0 4px 16px rgba(0,0,0,0.10);
  --shadow-lg:   0 8px 32px rgba(0,0,0,0.14);
}
```

---

## 2. Layout desktop

### Estructura general

```
┌─────────────────────────────────────────────────────────┐
│  SIDEBAR (200px fijo)  │  CONTENIDO PRINCIPAL           │
│                        │                                 │
│  Logo IAV              │  [KPI cards x4]                 │
│  ─────────             │                                 │
│  > Contratos  [7]      │  [Toolbar: buscar + tabs]       │
│    Clientes            │                                 │
│                        │  ┌──────────────┬──────────┐   │
│  ─────────             │  │ TABLA        │  PANEL   │   │
│  [Avatar] Bruno  [⚙]   │  │              │  DETALLE │   │
│                        │  └──────────────┴──────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Sidebar (`.sidebar`)

- `position: fixed; left: 0; top: 0; bottom: 0; width: var(--sidebar-w)`
- `background: var(--card); border-right: 1px solid var(--border)`
- Padding: `20px 12px`

**Logo:** icono cuadrado negro 28px con texto "IAV" blanco + nombre "Inmuebles Audiovisuales" en dos lineas.

**Items de navegacion (`.sidebar-item`):**
- Padding: `8px 10px`, border-radius: `6px`
- Estado activo: `background: #F5F5F3`
- Indicador activo: barra izquierda `3px` ancho dorado (`var(--gold)`), usando `border-left` o pseudo-elemento
- Icono: 16x16px (Tabler Icons)
- Badge de conteo: solo en activo, fondo dorado, texto blanco

**Footer del sidebar:**
- Avatar circular 28px negro con inicial
- Nombre + rol
- Icono de engranaje (⚙) a la derecha → abre seccion Ajustes

### KPI cards (`.kpi-grid`)

- `display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px`
- Cada card: `background: var(--card); border: 1px solid var(--border); border-radius: var(--r); padding: 14px 16px`
- Label: 10px, `var(--ink-3)`, uppercase
- Valor: 24px, font-weight 700
- Color del valor segun contexto: cobrado → `var(--success)`, sesiones urgentes → `var(--warn)`, resto → `var(--ink-1)`

### Tabla de contratos (`.table-wrap`)

**Toolbar:**
- Campo de busqueda (flex: 1)
- Boton "Nuevo contrato" — negro, texto blanco, border-radius 6px

**Tabs de vista:** Sesiones / Abiertos / Todos
- Tab activo: color negro, `border-bottom: 2px solid var(--gold)`
- Badge de conteo en cada tab

**Filas de tabla (`.table-row`):**
- Avatar circular generado por iniciales con `hashColor()`
- Columnas: Avatar | Nombre + paquete | Fecha sesion | Estatus | Total | Saldo
- Hover: `background: #FAFAF8`
- Fila seleccionada: `background: #FAFAF8; border-left: 2px solid var(--gold)`
- Indicador de urgencia por fecha de sesion:
  - Hoy: `border-left: 2px solid var(--gold)`
  - 1-2 dias: `border-left: 2px solid var(--warn)`
  - 3-7 dias: `border-left: 2px solid #3B82F6`

**Sin radar de sesiones** — la informacion temporal se comunica solo con los colores de borde izquierdo en cada fila.

### Panel de detalle (`.detail-panel`)

- `position: fixed; right: 0; top: 0; bottom: 0; width: var(--panel-w)`
- `background: var(--card); border-left: 1px solid var(--border)`
- Cuando el panel esta abierto: `body.panel-open .main { margin-right: var(--panel-w) }`
- **Sin overlay** — la tabla siempre visible

**Header del panel:**
- Nombre del cliente (14px, bold)
- Folio en monospace (9px, gris)
- Badge de estatus
- Boton X para cerrar

**Tabs del panel:** Info / Pagos / Acciones
- Tab activo: `border-bottom: 2px solid var(--ink-1)` (negro, no dorado — para distinguir de los tabs de la tabla)

**Tab Info:** fecha sesion, direccion, correo, telefono, paquete, notas.  
**Tab Pagos:** total, abonado, saldo, lista de abonos registrados, boton "Registrar abono".  
**Tab Acciones:** links (portal, checklist, revision), cambio de estatus, reagendar, archivar.

### Formulario "Nuevo contrato"

Drawer desde la derecha, `width: 520px`, `z-index` sobre el panel de detalle. Se abre con boton "Nuevo contrato" del toolbar.

---

## 3. Layout mobile

### Estructura

```
┌─────────────────┐
│ [≡]  Contratos [+] │  ← Topbar 52px
├─────────────────┤
│                 │
│  [tabs filtro]  │
│                 │
│  ┌───────────┐  │
│  │  Card     │  │  ← Lista de contratos
│  └───────────┘  │
│  ┌───────────┐  │
│  │  Card     │  │
│  └───────────┘  │
│                 │
└─────────────────┘
```

### Topbar mobile (`.mobile-topbar`)

- `height: 52px; background: var(--card); border-bottom: 1px solid var(--border)`
- `display: flex; align-items: center; padding: 0 16px; gap: 12px`

**Hamburger (`.hamburger-btn`):**
- 3 lineas de `18px x 2px`, gap `4px`, `border-radius: 1px`
- Color: `var(--ink-1)`

**Titulo:** flex: 1, 15px, font-weight 700

**Boton nuevo (`+`):**
```css
.btn-nuevo-mobile {
  width: 32px;
  height: 32px;           /* width == height garantiza forma cuadrada perfecta */
  background: var(--black);
  border-radius: 8px;     /* cuadrado redondeado — NO usar border-radius:50% aqui */
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
}
```
Icono: `ti ti-plus` a 18px, color blanco.

### Side menu mobile (`.side-menu`)

- `position: fixed; left: 0; top: 0; bottom: 0; width: 220px`
- `background: var(--card); z-index: 300`
- `transform: translateX(-100%)` → `translateX(0)` al abrir
- `transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1)`
- Overlay: `position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 299`

**Contenido del side menu:**
- Logo/marca arriba
- Items: Contratos (con badge), Clientes
- Footer: Ajustes + avatar de usuario con nombre y rol

Los items del side menu usan el mismo patron de indicador dorado que el sidebar de desktop.

### Tarjetas de contrato mobile (`.contract-card`)

- `background: var(--card); border-radius: 10px; padding: 12px 14px`
- `box-shadow: var(--shadow-sm)`
- Layout: Avatar | [Nombre + meta] | [Saldo + badge estatus]
- Tarjeta de hoy: `border-left: 3px solid var(--gold)`

### Detalle mobile

Click en tarjeta → pantalla completa con:
- Header: boton `←` + nombre del contrato + badge estatus
- Mismo contenido que el panel desktop, organizado en tabs Info / Pagos / Acciones
- Se implementa como una seccion `#sec-detalle-mobile` que ocupa el 100% de la pantalla

---

## 4. Badges de estatus

| Estatus | Background | Color texto |
|---------|-----------|-------------|
| Pendiente firma | `#FEF9C3` | `#92400E` |
| Firmado | `#DBEAFE` | `#1D4ED8` |
| Anticipo recibido | `#DCFCE7` | `#15803D` |
| En produccion | `#F5F3FF` | `#6D28D9` |
| Entregado | `#E0F2FE` | `#0369A1` |
| Liquidado | `#DCFCE7` | `#065F46` |
| Completado | `#FEF9ED` | `#92400E` (borde dorado) |

---

## 5. Responsividad

- **Mobile-first:** los estilos base (sin media query) son para mobile
- **Desktop:** `@media (min-width: 1024px)` activa sidebar, panel fijo, KPI grid de 4 columnas
- **El bloque `@media (max-width: 640px)` que ya existe en el archivo NO se modifica** — contiene ajustes de formularios para pantallas muy pequenas que siguen siendo validos
- Side menu solo existe en mobile (`< 1024px`); sidebar solo en desktop (`>= 1024px`)

---

## 6. Restricciones de implementacion

- Sin emojis en el codigo
- Sin comentarios salvo cuando el WHY es no obvio
- Sin `@media (max-width: 640px)` tocado
- El FAB circular que existia se elimina completamente de mobile
- El boton `+` mobile es cuadrado redondeado (border-radius: 8px), NO circulo (border-radius: 50%), para evitar el problema historico de ovaos
- CSS mobile-first: cualquier cambio desktop va dentro de `@media (min-width: 1024px)`
- El radar de sesiones (`#radar-sesiones`) se elimina — la urgencia temporal se comunica solo con colores de borde en las filas

---

## 7. Lo que NO cambia

- Toda la logica de JS (fetch, crearContrato, renderPanel, etc.)
- Los endpoints del Worker
- El schema de D1
- El adapter de Apps Script
- Los archivos `portal.html`, `checklist.html`, `revision.html`, `equipo.html`
- La seccion Clientes (`#sec-clientes`) — solo se ajusta al nuevo sistema de navegacion

---

## 8. Alcance de R37

R37 es un reemplazo completo del CSS y HTML estructural de `admin.html`. La logica JS se preserva, ajustando solo los selectores que cambien por el nuevo HTML.

Archivos modificados:
- `frontend/admin.html` — CSS completo reescrito, HTML estructural reescrito, JS selectores ajustados
- `MASTER_V4.md` — documentar R37
