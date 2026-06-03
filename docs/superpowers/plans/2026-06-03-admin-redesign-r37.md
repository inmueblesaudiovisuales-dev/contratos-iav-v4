# Admin Redesign R37 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CSS, HTML skeleton, and navigation JS of `frontend/admin.html` with a Clean SaaS design — desktop sidebar with labels, fixed detail panel, mobile side menu with hamburger, no bottom nav, no FAB.

**Architecture:** Mobile-first CSS rewrite inside the single `admin.html` file. All JS business logic (API calls, rendering, forms) is preserved unchanged. Only navigation functions and element selectors that reference removed/renamed HTML are updated. The existing `@media (max-width: 640px)` block is NOT touched.

**Tech Stack:** Vanilla HTML/CSS/JS · Montserrat (Google Fonts, already loaded) · Tabler Icons (already loaded via CDN) · Cloudflare Workers backend (unchanged)

---

## Critical context before starting

- File: `frontend/admin.html` (~5900 lines). CSS starts at line 11, HTML at ~line 1560, JS at ~line 2200.
- **DO NOT modify** `worker/`, `adapter/`, `portal.html`, `checklist.html`, `revision.html`, `equipo.html`.
- **DO NOT modify** the `@media (max-width: 640px)` block — it handles small-screen form layouts that still apply.
- **DO NOT remove** any `id=""` attributes from section containers (`#sec-contratos`, `#sec-nuevo`, `#sec-clientes`, `#sec-ajustes`) — JS references them by ID.
- **DO NOT remove** KPI stat IDs: `#statSesionesHoy`, `#statPendientesFirma`, `#statEnProduccion`, `#statCobradoMes`.
- **DO NOT remove** table IDs: `#tabla-contratos-card`, `#tabla-body`, `#sesiones-lista`.
- **DO NOT remove** `#drawer-nuevo`, `#drawer-nuevo-content`, `#drawer-nuevo-overlay` — drawer logic is preserved.
- **DO NOT remove** `#panel-lateral` and its interior — panel rendering JS is preserved.
- Commit after every task.
- Each commit message starts with "R37 —".

---

## File map

| Area | Action |
|------|--------|
| CSS block(s) lines 11–875 | **Full replace** — delete all existing style tags and write new CSS |
| HTML: topbar div | **Replace** — new clean topbar (mobile only) |
| HTML: `.bottom-nav` nav | **Replace** — new `#sidebar` (desktop) + `#side-menu` (mobile) + `#side-menu-overlay` |
| HTML: `#fab-nuevo-desktop` button | **Delete** |
| HTML: `#statsRibbon` div | **Replace** — keep IDs, new markup |
| HTML: `#radar-sesiones` | **Delete** |
| HTML: `#hoyStrip` | **Delete** |
| HTML: `.contenido > .tabs` | **Delete** — navigation moves to sidebar |
| JS: `mostrarTab` | **Modify** — remove bnav-btn references, add sidebar-item |
| JS: `mostrarTabMobile` | **Replace** — use side menu instead of bottom nav |
| JS: `actualizarNavBadges` | **Modify** — update element IDs |
| JS: `toggleMenuNuevo` / `cerrarMenuNuevo` | **Delete** — not needed |
| JS: `renderHoyStrip` | **Delete** |
| JS: `renderRadar` | **Delete** |
| JS: add `abrirSideMenu` / `cerrarSideMenu` | **Add** |

---

## Task 1: Delete all existing CSS and write new CSS foundation

**Files:**
- Modify: `frontend/admin.html` — replace lines 11 through ~875 (all `<style>` blocks before the HTML body)

### What to delete

Delete every `<style>...</style>` block that appears in `<head>` before `</head>`. There are currently 3 style blocks (the main one ending around line 781, a second one with `.par-tipo-btn` etc., and the desktop media query block). Replace all of them with one new `<style>` block.

- [ ] **Step 1: Delete all style blocks in `<head>`**

Find the opening `<style>` after the `<link>` tags (around line 11) and delete everything through the last `</style>` before `</head>` (around line 875). Leave the `<link>` tags for fonts and Tabler Icons intact.

- [ ] **Step 2: Insert the new CSS block**

Paste the following complete `<style>` block immediately after the Tabler Icons `<link>` tag and before `</head>`:

```html
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: 'Montserrat', system-ui, sans-serif;
      font-size: 14px; line-height: 1.5;
      color: #111; background: #F9F9F7;
      -webkit-font-smoothing: antialiased;
    }
    button, input, textarea, select { font-family: inherit; font-size: inherit; }

    :root {
      --black:        #111111;
      --page:         #F9F9F7;
      --card:         #FFFFFF;
      --border:       #EBEBEB;
      --border-2:     #E0E0E0;
      --ink-1:        #111111;
      --ink-2:        #555555;
      --ink-3:        #888888;
      --ink-4:        #BBBBBB;
      --gold:         #C9A84C;
      --gold-light:   #FEF9ED;
      --gold-border:  #E8D89A;
      --gold-pale:    #FEF9ED;
      --onyx:         #111111;
      --success:      #16A34A;
      --success-bg:   #DCFCE7;
      --warn:         #D97706;
      --warn-bg:      #FEF9C3;
      --danger:       #DC2626;
      --danger-bg:    #FEE2E2;
      --purple:       #6D28D9;
      --purple-bg:    #F5F3FF;
      --blue:         #1D4ED8;
      --blue-bg:      #DBEAFE;
      --r:            8px;
      --r-lg:         12px;
      --sidebar-w:    200px;
      --panel-w:      340px;
      --shadow-sm:    0 1px 4px rgba(0,0,0,0.06);
      --shadow-md:    0 4px 16px rgba(0,0,0,0.10);
      --shadow-lg:    0 8px 32px rgba(0,0,0,0.14);
    }

    /* ── LOGIN ────────────────────────────────────────── */
    #pantalla-login {
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      background: var(--black);
    }
    .login-box {
      background: var(--card); border-radius: var(--r-lg);
      padding: 40px 36px; width: 100%; max-width: 360px;
      box-shadow: var(--shadow-lg);
    }
    .login-marca {
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--gold); margin-bottom: 20px;
    }
    .login-box h1 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
    .login-box .login-sub { color: var(--ink-3); font-size: 13px; margin-bottom: 22px; }
    .pw-wrap { position: relative; }
    .pw-wrap input { padding-right: 46px; }
    .pw-toggle {
      position: absolute; right: 0; top: 0; bottom: 0; width: 44px;
      background: none; border: none; cursor: pointer;
      color: var(--ink-3); display: flex; align-items: center; justify-content: center; font-size: 18px;
    }
    .pw-toggle:hover { color: var(--ink-1); }
    .error-login { font-size: 12px; color: var(--danger); min-height: 18px; margin-top: 6px; }

    /* ── ADMIN SHELL ──────────────────────────────────── */
    #pantalla-admin { display: none; }

    /* ── MOBILE TOPBAR ────────────────────────────────── */
    .mobile-topbar {
      position: sticky; top: 0; z-index: 50;
      height: 52px; padding: 0 16px;
      background: var(--card); border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 12px;
    }
    .hamburger-btn {
      display: flex; flex-direction: column; gap: 4px;
      background: none; border: none; cursor: pointer; padding: 4px;
      flex-shrink: 0;
    }
    .hamburger-btn span {
      display: block; width: 18px; height: 2px;
      background: var(--ink-1); border-radius: 1px;
    }
    .topbar-title {
      font-size: 15px; font-weight: 700; color: var(--ink-1); flex: 1;
    }
    .btn-nuevo-mobile {
      width: 32px;
      height: 32px;
      background: var(--black);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      border: none; cursor: pointer; flex-shrink: 0;
      color: white; font-size: 18px;
    }
    .btn-nuevo-mobile:hover { opacity: 0.85; }

    /* ── SIDE MENU (mobile) ───────────────────────────── */
    #side-menu {
      position: fixed; left: 0; top: 0; bottom: 0; width: 240px;
      background: var(--card); z-index: 300;
      display: flex; flex-direction: column;
      padding: 24px 14px 20px;
      box-shadow: 4px 0 24px rgba(0,0,0,0.15);
      transform: translateX(-100%);
      transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    #side-menu.open { transform: translateX(0); }
    #side-menu-overlay {
      display: none;
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.35); z-index: 299;
    }
    #side-menu-overlay.visible { display: block; }
    .sm-brand { margin-bottom: 28px; }
    .sm-brand-name { font-size: 14px; font-weight: 800; color: var(--ink-1); }
    .sm-brand-sub { font-size: 10px; color: var(--ink-3); margin-top: 2px; }
    .sm-nav-item {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 10px; border-radius: 7px; cursor: pointer;
      margin-bottom: 2px; border: none; background: none;
      width: 100%; text-align: left; font-family: inherit;
    }
    .sm-nav-item.activo { background: #F5F5F3; }
    .sm-indicator {
      width: 3px; height: 20px; border-radius: 2px;
      background: transparent; flex-shrink: 0;
    }
    .sm-nav-item.activo .sm-indicator { background: var(--gold); }
    .sm-nav-icon { font-size: 18px; color: var(--ink-4); flex-shrink: 0; }
    .sm-nav-item.activo .sm-nav-icon { color: var(--ink-1); }
    .sm-nav-label { font-size: 13px; font-weight: 600; color: var(--ink-3); }
    .sm-nav-item.activo .sm-nav-label { color: var(--ink-1); }
    .sm-nav-badge {
      margin-left: auto; background: var(--gold); color: white;
      font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 10px;
    }
    .sm-footer {
      margin-top: auto; padding-top: 16px; border-top: 1px solid var(--border);
    }
    .sm-footer-item {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 10px; border-radius: 6px; cursor: pointer;
      border: none; background: none; width: 100%; font-family: inherit;
    }
    .sm-footer-item:hover { background: var(--page); }
    .sm-footer-icon { font-size: 16px; color: var(--ink-4); }
    .sm-footer-label { font-size: 12px; color: var(--ink-3); }
    .sm-user {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 6px 0; margin-top: 8px;
      border-top: 1px solid var(--border);
    }
    .sm-user-avatar {
      width: 28px; height: 28px; background: var(--black); border-radius: 50%;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .sm-user-avatar span { font-size: 10px; font-weight: 700; color: white; }
    .sm-user-name { font-size: 11px; font-weight: 600; color: var(--ink-1); }
    .sm-user-role { font-size: 9px; color: var(--ink-3); }
    .sm-logout-btn {
      margin-left: auto; background: none; border: none;
      color: var(--ink-4); cursor: pointer; font-size: 16px; padding: 4px;
    }
    .sm-logout-btn:hover { color: var(--danger); }

    /* ── SIDEBAR (desktop — hidden on mobile) ─────────── */
    #sidebar {
      display: none;
    }

    /* ── MAIN CONTENT ─────────────────────────────────── */
    .main-content {
      min-height: 100vh;
    }
    .contenido {
      max-width: 1400px; margin: 0 auto; padding: 20px 16px 80px;
    }

    /* Hide desktop-only elements on mobile */
    .kpi-grid { display: none; }
    #statsRibbon { display: none; }
    .filter-chips { display: none; }
    .search-icon { display: none; }
    .search-shortcut { display: none; }
    .toolbar-sep { display: none; }
    #btn-nuevo-toolbar { display: none; }

    /* ── SECCIONES ────────────────────────────────────── */
    .seccion { display: none; }
    .seccion.activa { display: block; }

    /* ── CONTRATOS TABS ───────────────────────────────── */
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
      display: flex; align-items: center; gap: 7px; white-space: nowrap;
      font-family: inherit;
    }
    .contratos-tab:hover { color: var(--ink-1); }
    .contratos-tab.activo-ctab { color: var(--ink-1); border-bottom-color: var(--gold); }
    .ctab-badge {
      font-size: 10px; font-weight: 700; border-radius: 10px;
      padding: 1px 6px; min-width: 18px; text-align: center;
    }
    .contratos-tab.activo-ctab .ctab-badge { background: var(--gold); color: white; }
    .contratos-tab:not(.activo-ctab) .ctab-badge { background: var(--ink-4); color: var(--ink-2); }

    /* ── TOOLBAR ──────────────────────────────────────── */
    .barra { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
    .barra-fila-principal { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .barra-fila-principal .campo-busqueda { flex: 1; min-width: 200px; }
    .barra-filtros { display: none; align-items: center; gap: 10px; flex-wrap: wrap; }
    .barra-filtros.visible { display: flex; }
    .filtro-fecha-label { font-size: 11px; font-weight: 700; color: var(--ink-3); white-space: nowrap; letter-spacing: 0.04em; }
    .btn-filtros-toggle {
      display: flex; align-items: center; gap: 6px;
      padding: 7px 12px; border: 1.5px solid var(--border-2);
      border-radius: var(--r); background: var(--page); color: var(--ink-2);
      font-size: 12px; font-weight: 700; cursor: pointer;
      transition: all 120ms; white-space: nowrap; font-family: inherit;
    }
    .btn-filtros-toggle.activo { border-color: var(--gold); color: var(--gold); background: var(--gold-pale); }
    .filtros-badge {
      background: var(--warn); color: white; border-radius: 10px;
      font-size: 10px; font-weight: 700; padding: 1px 5px;
    }

    /* ── TABLA DE CONTRATOS ───────────────────────────── */
    .tabla-card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: var(--r-lg); overflow: hidden;
    }
    .tabla-card table { width: 100%; border-collapse: collapse; }
    .tabla-card th {
      padding: 10px 16px; text-align: left;
      font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase;
      color: var(--ink-3); background: var(--page); border-bottom: 1px solid var(--border);
    }
    .tabla-card td {
      padding: 14px 16px; border-bottom: 1px solid var(--border);
      font-size: 13px; color: var(--ink-1); vertical-align: middle;
    }
    .tabla-card tr:last-child td { border-bottom: none; }
    .tabla-card tbody tr:hover td { background: #FAFAF8; cursor: pointer; }
    .tabla-card tbody tr.activo td { background: #FAFAF8; }
    .tabla-card tbody tr.activo { border-left: 2px solid var(--gold); }
    /* Session urgency indicators */
    .tabla-card tbody tr.tr-ses-hoy { border-left: 2px solid var(--gold); }
    .tabla-card tbody tr.tr-ses-pronto { border-left: 2px solid var(--warn); }
    .tabla-card tbody tr.tr-ses-semana { border-left: 2px solid #3B82F6; }
    .td-folio { font-size: 11px; font-weight: 700; color: var(--ink-2); letter-spacing: 0.04em; font-family: 'Courier New', monospace; }
    .td-nombre { font-weight: 600; }
    .td-sub { font-size: 11px; color: var(--ink-3); margin-top: 2px; }
    .td-monto { font-family: 'Courier New', monospace; text-align: right; }
    .td-saldo { font-family: 'Courier New', monospace; text-align: right; color: var(--warn); }
    .td-saldo.pagado { color: var(--success); }
    .td-fecha { font-size: 11px; color: var(--ink-3); }
    .tabla-vacio { text-align: center; color: var(--ink-3); padding: 40px; font-style: italic; font-size: 13px; }
    /* Avatar column */
    .th-avatar { display: none; }
    .td-avatar-desktop { display: none; }
    .avatar-circle {
      width: 32px; height: 32px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; flex-shrink: 0;
    }

    /* ── VISTA SESIONES ───────────────────────────────── */
    .ses-row { display: flex; border-bottom: 1px solid var(--border); cursor: pointer; }
    .ses-row:last-child { border-bottom: none; }
    .ses-row:hover .ses-fecha, .ses-row:hover .ses-contenido { background: #FAFAF8; }
    .ses-row.activo .ses-fecha, .ses-row.activo .ses-contenido { background: #FAFAF8; }
    .ses-row.activo { border-left: 2px solid var(--gold); }
    .ses-fecha {
      width: 68px; min-width: 68px;
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 14px 0; gap: 1px;
    }
    .ses-fecha.es-hoy { background: var(--gold-pale); }
    .ses-dia-num { font-size: 22px; font-weight: 700; line-height: 1; color: var(--ink-1); }
    .ses-fecha.es-hoy .ses-dia-num { color: var(--gold); }
    .ses-mes { font-size: 10px; font-weight: 700; letter-spacing: .06em; color: var(--ink-3); text-transform: uppercase; }
    .ses-dow { font-size: 10px; color: var(--ink-3); text-transform: uppercase; letter-spacing: .04em; }
    .ses-fecha.es-hoy .ses-mes, .ses-fecha.es-hoy .ses-dow { color: var(--gold); }
    .ses-contenido { flex: 1; padding: 14px 16px; min-width: 0; }
    .ses-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .ses-nombre { font-weight: 600; font-size: 14px; color: var(--ink-1); }
    .ses-meta { font-size: 12px; color: var(--ink-2); margin-top: 3px; }
    .ses-badges { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
    .ses-folio { font-size: 10px; font-weight: 700; color: var(--ink-3); letter-spacing: .05em; font-family: 'Courier New', monospace; }
    .ses-row.st-pendiente  { border-left: 3px solid #F59E0B; }
    .ses-row.st-firmado    { border-left: 3px solid #3B82F6; }
    .ses-row.st-anticipo   { border-left: 3px solid #10B981; }
    .ses-row.st-produccion { border-left: 3px solid #8B5CF6; }
    .ses-row.st-entregado  { border-left: 3px solid #0EA5E9; }
    .ses-row.st-liquidado  { border-left: 3px solid #059669; }
    .ses-row.st-completado { border-left: 3px solid var(--gold); }
    .ses-fecha.es-manana { background: #FFFBEB; }
    .ses-fecha.es-manana .ses-dia-num { color: #D97706; }
    .ses-fecha.es-manana .ses-mes, .ses-fecha.es-manana .ses-dow { color: #B45309; }
    .ses-fecha.es-semana { background: #EFF6FF; }
    .ses-fecha.es-semana .ses-dia-num { color: #2563EB; }
    .ses-fecha.es-semana .ses-mes, .ses-fecha.es-semana .ses-dow { color: #60A5FA; }

    /* ── BADGES ───────────────────────────────────────── */
    .badge {
      display: inline-block; padding: 3px 9px; border-radius: 20px;
      font-size: 11px; font-weight: 600; white-space: nowrap;
    }
    .badge-pendiente-firma  { background: #FEF9C3; color: #92400E; }
    .badge-firmado          { background: var(--blue-bg); color: #1E40AF; }
    .badge-anticipo         { background: var(--success-bg); color: #065F46; }
    .badge-en-produccion    { background: var(--purple-bg); color: #5B21B6; }
    .badge-entregado        { background: #E0F2FE; color: #0369A1; }
    .badge-liquidado        { background: var(--success-bg); color: #065F46; border: 1px solid #6EE7B7; }
    .badge-completado       { background: var(--gold-light); color: #92400E; border: 1px solid var(--gold-border); }

    /* ── KPI GRID (mobile: hidden, desktop: shown) ────── */
    .kpi-grid {
      display: none;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px; margin-bottom: 20px;
    }
    .kpi-card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: var(--r); padding: 14px 16px;
    }
    .kpi-label { font-size: 10px; color: var(--ink-3); margin-bottom: 4px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; }
    .kpi-value { font-size: 24px; font-weight: 700; color: var(--ink-1); line-height: 1; }
    .kpi-value.green { color: var(--success); }
    .kpi-value.amber { color: var(--warn); }

    /* ── PANEL LATERAL ────────────────────────────────── */
    .panel-lateral {
      position: fixed; right: 0; bottom: 0;
      left: 0; width: 100%;
      height: 88dvh;
      background: var(--card);
      border-top: 1px solid var(--border);
      border-radius: 16px 16px 0 0;
      z-index: 200;
      transform: translateY(100%);
      transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
      display: flex; flex-direction: column; overflow: hidden;
    }
    .panel-lateral.visible { transform: translateY(0); box-shadow: 0 -8px 40px rgba(0,0,0,0.18); }
    #overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 190; }
    #overlay.visible { display: block; }
    .panel-handle {
      width: 36px; height: 4px; background: var(--border-2);
      border-radius: 2px; margin: 10px auto 4px; flex-shrink: 0;
    }
    .panel-header {
      padding: 14px 16px 10px; border-bottom: 1px solid var(--border); flex-shrink: 0;
    }
    .panel-nombre { font-size: 16px; font-weight: 700; color: var(--ink-1); }
    .panel-folio { font-size: 11px; color: var(--ink-3); font-family: 'Courier New', monospace; margin-top: 2px; }
    .panel-badge { margin-top: 6px; }
    .lifecycle-wrap { margin-top: 10px; }
    .panel-close {
      position: absolute; top: 12px; right: 14px;
      background: none; border: none; font-size: 22px;
      color: var(--ink-3); cursor: pointer; line-height: 1; padding: 2px;
    }
    .panel-close:hover { color: var(--ink-1); }
    .panel-tabs {
      display: flex; gap: 0;
      border-bottom: 1px solid var(--border);
      padding: 0 16px; flex-shrink: 0;
      position: sticky; top: 0; background: var(--card); z-index: 1;
    }
    .panel-tab-btn {
      padding: 10px 12px; border: none; background: none;
      font-size: 12px; font-weight: 600; color: var(--ink-3);
      cursor: pointer; border-bottom: 2px solid transparent;
      margin-bottom: -1px; transition: color 120ms; font-family: inherit;
    }
    .panel-tab-btn:hover { color: var(--ink-1); }
    .panel-tab-btn.activo { color: var(--ink-1); border-bottom-color: var(--ink-1); }
    .panel-tab-pane { display: none; }
    .panel-tab-pane.activo { display: block; }
    .panel-body { flex: 1; overflow-y: auto; padding: 14px 16px; }
    .panel-section-label {
      font-size: 10px; font-weight: 700; letter-spacing: 0.07em;
      text-transform: uppercase; color: var(--ink-3); margin: 16px 0 8px;
    }
    .panel-section-label:first-child { margin-top: 0; }
    .panel-info-row {
      background: var(--page); border-radius: var(--r);
      padding: 10px 12px; margin-bottom: 8px;
    }
    .panel-info-label { font-size: 10px; color: var(--ink-3); margin-bottom: 2px; }
    .panel-info-value { font-size: 13px; font-weight: 600; color: var(--ink-1); }
    .panel-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
    .panel-action-btn {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 10px 14px; margin-bottom: 6px;
      border: 1.5px solid var(--border); border-radius: var(--r);
      background: none; font-size: 13px; font-weight: 600;
      color: var(--ink-1); cursor: pointer; font-family: inherit;
      transition: all 120ms;
    }
    .panel-action-btn:hover { border-color: var(--border-2); background: var(--page); }
    .panel-action-btn.primary { background: var(--gold); border-color: var(--gold); color: #1a1000; }
    .panel-action-btn.primary:hover { filter: brightness(1.06); }
    .panel-action-btn.danger { color: var(--danger); border-color: #FECACA; background: #FEF2F2; }
    .panel-action-btn.danger:hover { background: var(--danger-bg); border-color: #FCA5A5; }
    .panel-action-btn.wa { background: #25D366; border-color: #25D366; color: white; }
    .panel-action-btn.wa:hover { filter: brightness(0.95); }

    /* ── FORMS ────────────────────────────────────────── */
    .form-card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: var(--r-lg); padding: 28px; max-width: 640px;
    }
    .form-card h2 { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
    .form-desc { font-size: 13px; color: var(--ink-3); margin-bottom: 22px; }
    .campo { margin-bottom: 14px; }
    .campo label {
      display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.07em;
      text-transform: uppercase; color: var(--ink-3); margin-bottom: 5px;
    }
    input[type="text"], input[type="email"], input[type="number"],
    input[type="password"], input[type="date"], input[type="time"],
    input[type="url"], select, textarea {
      width: 100%; padding: 10px 13px;
      background: var(--page); border: 1.5px solid var(--border-2);
      border-radius: var(--r); color: var(--ink-1); font-size: 14px;
      outline: none; transition: border-color 120ms, box-shadow 120ms;
      -webkit-appearance: none; appearance: none;
    }
    input[type="checkbox"], input[type="radio"] {
      width: auto; padding: 0; background: initial; border: initial;
      border-radius: 0; -webkit-appearance: auto; appearance: auto;
    }
    input:focus, select:focus, textarea:focus {
      border-color: var(--gold); background: var(--card);
      box-shadow: 0 0 0 3px rgba(201,168,76,0.14);
    }
    .fila-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .btn-volver {
      display: inline-flex; align-items: center; gap: 6px;
      background: none; border: none; color: var(--ink-3);
      font-family: inherit; font-size: 12px; font-weight: 600;
      cursor: pointer; padding: 0; margin-bottom: 18px; transition: color 120ms;
    }
    .btn-volver:hover { color: var(--ink-1); }
    .sec-label {
      font-size: 10px; font-weight: 700; letter-spacing: 0.07em;
      text-transform: uppercase; color: var(--ink-3); margin: 18px 0 9px;
    }
    .sec-label:first-child { margin-top: 0; }

    /* ── BUTTONS ──────────────────────────────────────── */
    .btn-primario {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 9px 18px; border-radius: var(--r); border: none;
      font-family: inherit; font-size: 13px; font-weight: 700;
      cursor: pointer; transition: all 120ms; text-decoration: none;
    }
    .btn-primario.gold { background: var(--black); color: white; }
    .btn-primario.gold:hover { opacity: 0.85; }
    .btn-secundario {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 8px 14px; border-radius: var(--r);
      border: 1.5px solid var(--border-2); background: var(--page);
      font-family: inherit; font-size: 13px; font-weight: 600;
      color: var(--ink-2); cursor: pointer; transition: all 120ms;
    }
    .btn-secundario:hover { border-color: var(--ink-4); background: var(--card); }
    .btn-sm { padding: 6px 10px; font-size: 12px; }
    .btn-danger {
      background: var(--danger-bg); color: var(--danger);
      border: 1.5px solid #FECACA; border-radius: var(--r);
      padding: 8px 14px; font-family: inherit; font-size: 13px;
      font-weight: 600; cursor: pointer;
    }

    /* ── RADIO TIPO PROPIEDAD ─────────────────────────── */
    .radio-grupo { display: flex; gap: 8px; }
    .radio-opcion { flex: 1; position: relative; }
    .radio-opcion input[type="radio"] { position: absolute; opacity: 0; width: 0; height: 0; }
    .radio-opcion label {
      display: block; text-align: center; padding: 10px;
      border: 1.5px solid var(--border-2); border-radius: var(--r);
      font-size: 13px; font-weight: 600; color: var(--ink-2);
      cursor: pointer; transition: all 120ms;
    }
    .radio-opcion input:checked + label {
      border-color: var(--gold); background: var(--gold-pale); color: var(--ink-1);
    }

    /* ── PROP CARDS ───────────────────────────────────── */
    .prop-card {
      border: 1.5px solid var(--border-2); border-radius: var(--r-lg);
      padding: 20px; margin-bottom: 14px; background: var(--card);
    }
    .prop-card-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 14px;
    }
    .prop-card-titulo { font-size: 14px; font-weight: 700; color: var(--ink-1); }
    .prop-card-acciones { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .prop-card-acciones button { display: flex; align-items: center; gap: 6px; }

    /* ── MODALES ──────────────────────────────────────── */
    .modal-overlay {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0.4); z-index: 500;
      align-items: center; justify-content: center;
    }
    .modal-overlay.visible { display: flex; }
    .modal-box {
      background: var(--card); border-radius: var(--r-lg);
      padding: 28px; width: 100%; max-width: 480px;
      box-shadow: var(--shadow-lg); margin: 16px;
      max-height: 90vh; overflow-y: auto;
    }
    .modal-box h3 { font-size: 16px; font-weight: 700; margin-bottom: 16px; }
    .modal-footer {
      display: flex; gap: 8px; justify-content: flex-end;
      margin-top: 20px;
    }

    /* ── DRAWER NUEVO CONTRATO ────────────────────────── */
    #drawer-nuevo {
      display: flex; flex-direction: column;
      position: fixed; right: 0; top: 0; bottom: 0; width: 560px;
      background: var(--card); border-left: 1px solid var(--border);
      z-index: 400; overflow-y: auto;
      transform: translateX(100%);
      transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    #drawer-nuevo-overlay {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0.25); z-index: 399;
    }

    /* ── AJUSTES ──────────────────────────────────────── */
    .ajustes-tabs {
      display: flex; gap: 4px;
      border-bottom: 2px solid var(--border); margin-bottom: 20px;
    }
    .ajustes-tab {
      background: none; border: none; border-bottom: 2.5px solid transparent;
      margin-bottom: -2px; padding: 10px 18px;
      font-family: inherit; font-size: 13px; font-weight: 600;
      color: var(--ink-2); cursor: pointer;
      display: flex; align-items: center; gap: 7px; transition: color 120ms;
    }
    .ajustes-tab:hover { color: var(--ink-1); }
    .ajustes-tab.activo-atab { color: var(--ink-1); border-bottom-color: var(--gold); }
    .ajustes-pane { display: none; }
    .ajustes-pane.activo-apane { display: block; }

    /* ── METRICAS ─────────────────────────────────────── */
    .met-cards-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 20px; }
    .met-bottom-grid { display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 14px; }

    /* ── STATS BAR (mobile linea compacta) ────────────── */
    .stats-linea {
      display: flex; gap: 12px; overflow-x: auto;
      padding: 10px 0; margin-bottom: 10px; align-items: center;
      scrollbar-width: none;
    }
    .stats-linea::-webkit-scrollbar { display: none; }
    .stats-item { font-size: 13px; font-weight: 600; color: var(--ink-2); white-space: nowrap; }
    .stats-item strong { color: var(--ink-1); }
    .stats-sep { color: var(--ink-4); }

    /* ── AUTOCOMPLETE ─────────────────────────────────── */
    .ac-dropdown {
      position: absolute; z-index: 999;
      background: var(--card); border: 1px solid var(--border-2);
      border-radius: var(--r); box-shadow: var(--shadow-md);
      max-height: 220px; overflow-y: auto;
      font-size: 13px; min-width: 260px;
    }
    .ac-item {
      padding: 10px 14px; cursor: pointer;
      border-bottom: 1px solid var(--border);
      display: flex; flex-direction: column; gap: 2px;
    }
    .ac-item:last-child { border-bottom: none; }
    .ac-item:hover, .ac-item.ac-activo { background: var(--gold-pale); }
    .ac-nombre { font-weight: 600; color: var(--ink-1); }
    .ac-sub { color: var(--ink-3); font-size: 11px; }
    .ac-logo-badge {
      display: inline-block; font-size: 10px; font-weight: 700;
      background: #e8f5e9; color: #2e7d32;
      border-radius: 4px; padding: 1px 6px; margin-top: 2px;
    }
    .ac-hint { font-size: 11px; color: var(--ink-3); margin-top: 4px; font-style: italic; }

    /* ── CLIENTES SECTION ─────────────────────────────── */
    .sec-clientes-header { display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:20px; }
    .sec-clientes-titulo { font-size:22px; font-weight:700; letter-spacing:-0.4px; color:var(--ink-1); }
    .sec-clientes-sub { font-size:13px; color:var(--ink-3); margin-top:3px; }
    .sec-sublabel { font-size:12px; font-weight:700; color:var(--ink-3); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:12px; }
    .clientes-grid { display:flex; flex-direction:column; gap:24px; }
    .clientes-col-pipeline, .clientes-col-lista {}
    .cli-card { background:var(--card); border-radius:10px; border:1.5px solid var(--border); padding:12px 16px; display:flex; align-items:center; gap:12px; }
    .cli-card-body { flex:1; min-width:0; }
    .cli-card-nombre { font-size:14px; font-weight:700; color:var(--ink-1); }
    .cli-card-meta { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:3px; }
    .cli-card-tel { font-size:12px; color:var(--ink-3); text-decoration:none; }
    .cli-card-correo { font-size:12px; color:var(--ink-3); }
    .cli-card-acciones { display:flex; gap:6px; flex-shrink:0; }
    .cli-card-action-btn {
      display:flex; align-items:center; justify-content:center;
      width:32px; height:32px; border-radius:8px;
      border:1.5px solid var(--border); background:none;
      cursor:pointer; color:var(--ink-2); text-decoration:none; font-size:15px;
    }
    .cli-card-action-btn:hover { background:var(--page); border-color:var(--ink-4); }
    .cli-card-action-btn.wa { background:rgba(37,211,102,0.12); color:#128C7E; border-color:transparent; }
    .trab-card { background:var(--card); border-radius:10px; border:1.5px solid var(--border); overflow:hidden; }
    .trab-card-inner { padding:12px 16px; }
    .trab-card-header { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
    .trab-card-nombre { font-size:13px; font-weight:700; color:var(--ink-1); }
    .trab-card-fecha { font-size:11px; color:var(--ink-3); margin-top:2px; }
    .trab-card-acciones { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }

    /* ── PAR TIPO BTN (formulario de propiedades) ─────── */
    .par-tipo-btn {
      flex: 1; padding: 8px 12px;
      font-family: inherit; font-size: 12px; font-weight: 700;
      border: 1.5px solid var(--border-2); border-radius: var(--r);
      background: var(--page); color: var(--ink-3);
      cursor: pointer; transition: all 120ms;
    }
    .par-tipo-btn.activo-par {
      border-color: var(--gold); background: var(--gold-pale); color: var(--ink-1);
    }
    .ciclo-toggle { display: flex; gap: 4px; }
    .ciclo-btn {
      padding: 7px 14px; font-family: inherit; font-size: 12px; font-weight: 700;
      border: 1.5px solid var(--border-2); border-radius: var(--r);
      background: var(--page); color: var(--ink-3);
      cursor: pointer; transition: all 120ms;
    }
    .activo-ciclo { background: var(--onyx) !important; color: white !important; border-color: var(--onyx) !important; }

    /* ── PAQUETES TABLE ───────────────────────────────── */
    .paq-tabla { width: 100%; border-collapse: collapse; font-size: 13px; }
    .paq-tabla th { text-align: left; padding: 8px 12px; font-size: 11px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--ink-3); border-bottom: 1px solid var(--border); }
    .paq-tabla td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
    .paq-tabla tr:last-child td { border-bottom: none; }
    .paq-inactivo { opacity: .45; }
    .badge-addon { display:inline-block; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:700; background:var(--gold-pale); color:var(--gold); letter-spacing:.4px; }

    /* ── MODO SELECCION MASIVA ────────────────────────── */
    .btn-seleccion { background: none; border: 1.5px solid var(--border-2); border-radius: var(--r); padding: 7px 12px; font-size: 12px; font-weight: 600; color: var(--ink-2); cursor: pointer; white-space: nowrap; font-family: inherit; }
    .btn-seleccion.activo { border-color: var(--gold); color: var(--gold); }
    .bulk-bar {
      display: none; position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: var(--black); color: white; border-radius: 50px;
      padding: 10px 20px; gap: 14px; align-items: center;
      font-size: 13px; font-weight: 600; z-index: 300; box-shadow: var(--shadow-lg);
      white-space: nowrap;
    }
    .bulk-bar.visible { display: flex; }
    .bulk-bar-count { color: var(--gold); }
    .bulk-bar-btn { background: var(--danger); color: white; border: none; border-radius: 20px; padding: 5px 14px; font-size: 12px; font-weight: 700; cursor: pointer; }
    .td-check { width: 36px; padding: 0 0 0 12px !important; }
    .row-check { width: 16px; height: 16px; cursor: pointer; accent-color: var(--gold); }

    /* ── SEARCH WRAP ──────────────────────────────────── */
    .search-wrap { position: relative; display: flex; align-items: center; }
    .search-wrap input { padding-left: 36px; }
    .search-icon { position: absolute; left: 10px; font-size: 16px; color: var(--ink-3); pointer-events: none; }

    /* ── FILTER CHIPS ─────────────────────────────────── */
    .filter-chip {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 4px 10px; border-radius: 20px;
      border: 1.5px solid var(--border-2); background: var(--page);
      font-size: 11px; font-weight: 600; color: var(--ink-2);
      cursor: pointer; transition: all 120ms; font-family: inherit;
    }
    .filter-chip.activo { border-color: var(--ink-1); background: var(--ink-1); color: white; }
    .chip-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

    /* ── LIFECYCLE PIPELINE ───────────────────────────── */
    .lifecycle-pipeline { display: flex; align-items: center; gap: 0; overflow-x: auto; scrollbar-width: none; padding: 4px 0; }
    .lifecycle-pipeline::-webkit-scrollbar { display: none; }
    .lc-step { display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; }
    .lc-dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--border-2); background: var(--card); }
    .lc-step.done .lc-dot { background: var(--gold); border-color: var(--gold); }
    .lc-step.current .lc-dot { background: var(--warn); border-color: var(--warn); box-shadow: 0 0 0 3px rgba(217,119,6,0.2); }
    .lc-label { font-size: 9px; color: var(--ink-3); white-space: nowrap; }
    .lc-step.done .lc-label, .lc-step.current .lc-label { color: var(--ink-2); font-weight: 600; }
    .lc-line { width: 20px; height: 2px; background: var(--border-2); flex-shrink: 0; margin-bottom: 14px; }
    .lc-line.done { background: var(--gold); }

    /* ── PROSPECTOS LAYOUT ────────────────────────────── */
    #prosp-layout { display: grid; grid-template-columns: 1fr; gap: 16px; }

    /* ── MISC ─────────────────────────────────────────── */
    .msg-ok { font-size: 12px; color: var(--success); }
    .msg-err { font-size: 12px; color: var(--danger); }
    .crm-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }

    /* ── EXISTING @media (max-width: 640px) BLOCK PRESERVED BELOW ── */
    @media (max-width: 640px) {
      .contenido { padding: 12px 12px 32px; }
      .fila-2 { grid-template-columns: 1fr; }
      .form-card { padding: 20px 14px; }
      .barra-fila-principal .campo-busqueda { width: 100%; min-width: 0; order: -1; flex: none; }
      #filtro-estatus { flex: 1; min-width: 0; }
      #filtro-fecha-desde, #filtro-fecha-hasta { flex: 1; min-width: 0; }
      #btn-refresh-tabla, #btn-export-csv { display: none !important; }
      .td-sub.td-email { display: none !important; }
      .tabla-card table, .tabla-card thead { display: block; }
      .tabla-card thead { display: none; }
      .th-avatar { display: none !important; }
      .td-avatar-desktop { display: none !important; }
      .tabla-card tbody { display: flex; flex-direction: column; gap: 0; }
      .tabla-card tr { display: flex; flex-wrap: wrap; align-items: center; padding: 12px 14px; gap: 6px; border-bottom: 1px solid var(--border); }
      .tabla-card tr:last-child { border-bottom: none; }
      .tabla-card td { display: block; padding: 0 !important; border: none !important; }
      .td-folio { font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink-3); width: 100%; }
      .td-nombre { font-size: 14px; font-weight: 700; flex: 1; }
      .td-sub { display: block !important; font-size: 11px; color: var(--ink-3); width: 100%; margin-top: 1px; }
      .td-monto { display: none !important; }
      .td-saldo { font-size: 12px; font-weight: 700; margin-left: auto; }
      .td-fecha { font-size: 11px; color: var(--ink-3); width: 100%; margin-top: 4px; }
      .td-check { padding-left: 0 !important; }
      .stats-linea { padding: 8px 12px; gap: 8px; }
      .stats-item { font-size: 12px; }
      .met-cards-grid { grid-template-columns: repeat(2,1fr); }
      .met-bottom-grid { grid-template-columns: 1fr; }
      .crm-grid { grid-template-columns: 1fr; }
      .prop-card-acciones { flex-direction: column !important; }
      .prop-card-acciones button { width: 100% !important; justify-content: center; }
    }

    /* ── DESKTOP LAYOUT ───────────────────────────────── */
    @media (min-width: 1024px) {
      :root {
        --sidebar-w: 200px;
        --panel-w: 340px;
      }

      /* Show sidebar, hide mobile topbar */
      .mobile-topbar { display: none; }
      #side-menu { display: none !important; }
      #side-menu-overlay { display: none !important; }

      /* Sidebar */
      #sidebar {
        display: flex; flex-direction: column;
        position: fixed; left: 0; top: 0; bottom: 0; width: var(--sidebar-w);
        background: var(--card); border-right: 1px solid var(--border);
        padding: 20px 12px; z-index: 100;
      }
      .sidebar-logo {
        display: flex; align-items: center; gap: 9px;
        margin-bottom: 28px; padding: 0 4px;
      }
      .sidebar-logo-icon {
        width: 28px; height: 28px; background: var(--black); border-radius: 6px;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .sidebar-logo-icon span { font-size: 8px; font-weight: 800; color: white; }
      .sidebar-logo-name { font-size: 11px; font-weight: 700; color: var(--ink-1); line-height: 1.3; }
      .sidebar-logo-sub { font-size: 9px; color: var(--ink-3); font-weight: 400; }
      .sidebar-section-label {
        font-size: 9px; font-weight: 700; letter-spacing: 0.1em;
        text-transform: uppercase; color: var(--ink-4);
        padding: 0 8px; margin: 10px 0 4px;
      }
      .sidebar-item {
        display: flex; align-items: center; gap: 9px;
        padding: 8px 10px; border-radius: 6px; cursor: pointer;
        border: none; background: none; width: 100%;
        text-align: left; font-family: inherit; margin-bottom: 2px;
        transition: background 120ms;
      }
      .sidebar-item:hover { background: var(--page); }
      .sidebar-item.activo { background: #F5F5F3; }
      .sidebar-indicator {
        width: 3px; height: 20px; border-radius: 2px;
        background: transparent; flex-shrink: 0;
      }
      .sidebar-item.activo .sidebar-indicator { background: var(--gold); }
      .sidebar-icon { font-size: 17px; color: var(--ink-4); flex-shrink: 0; }
      .sidebar-item.activo .sidebar-icon { color: var(--ink-1); }
      .sidebar-label { font-size: 13px; font-weight: 600; color: var(--ink-3); flex: 1; }
      .sidebar-item.activo .sidebar-label { color: var(--ink-1); }
      .sidebar-badge {
        font-size: 9px; font-weight: 700; background: var(--gold);
        color: white; padding: 1px 6px; border-radius: 10px;
      }
      .sidebar-footer {
        margin-top: auto; padding-top: 12px;
        border-top: 1px solid var(--border);
        display: flex; align-items: center; gap: 8px; padding: 12px 4px 0;
      }
      .sidebar-avatar {
        width: 28px; height: 28px; background: var(--black); border-radius: 50%;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .sidebar-avatar span { font-size: 10px; font-weight: 700; color: white; }
      .sidebar-user-name { font-size: 11px; font-weight: 600; color: var(--ink-1); }
      .sidebar-user-role { font-size: 9px; color: var(--ink-3); }
      .sidebar-gear {
        margin-left: auto; background: none; border: none;
        color: var(--ink-4); cursor: pointer; font-size: 17px; padding: 4px;
        border-radius: 5px; transition: color 120ms;
      }
      .sidebar-gear:hover { color: var(--ink-1); }

      /* Main content offset */
      .main-content { margin-left: var(--sidebar-w); }
      .contenido { padding: 24px 28px 60px; }

      /* Show desktop-only elements */
      .kpi-grid { display: grid; }
      #statsRibbon { display: none; } /* replaced by .kpi-grid */
      .filter-chips { display: flex; gap: 6px; flex-wrap: wrap; }
      .search-icon { display: block; }
      .search-shortcut { display: block; }
      .toolbar-sep { display: block; width: 1px; height: 20px; background: var(--border-2); flex-shrink: 0; }
      #btn-nuevo-toolbar { display: inline-flex; }

      /* Table header avatar column */
      .th-avatar { display: table-cell; width: 48px; }
      .td-avatar-desktop { display: table-cell; width: 48px; vertical-align: middle; }

      /* Panel lateral — slide from right */
      .panel-lateral {
        top: 0; bottom: 0;
        left: auto; right: 0; width: var(--panel-w);
        height: 100vh;
        border-top: none; border-left: 1px solid var(--border);
        border-radius: 0;
        transform: translateX(100%);
      }
      .panel-lateral.visible { transform: translateX(0); box-shadow: none; }
      body.panel-open .main-content { margin-right: var(--panel-w); }
      .panel-handle { display: none; }
      .panel-tabs { position: sticky; top: 0; }

      /* Clientes 2-col on desktop */
      .clientes-grid { flex-direction: row; gap: 24px; }
      .clientes-col-pipeline { width: 360px; flex-shrink: 0; }
      .clientes-col-lista { flex: 1; min-width: 0; }
      #prosp-layout { grid-template-columns: 380px 1fr; }
      .crm-grid { grid-template-columns: 1fr 1fr; }
      .met-cards-grid { grid-template-columns: repeat(4, 1fr); }
      .met-bottom-grid { grid-template-columns: 1fr 1fr 2fr; }

      /* Section padding */
      #sec-clientes { padding-top: 24px; }
      #sec-ajustes { padding-top: 24px; }
    }
  </style>
```

- [ ] **Step 3: Verify file still parses**

```bash
cd "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0"
node -e "const fs = require('fs'); const html = fs.readFileSync('frontend/admin.html','utf8'); console.log('Lines:', html.split('\n').length, '— OK')"
```

Expected: prints line count without error.

- [ ] **Step 4: Commit**

```bash
cd "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0"
git add frontend/admin.html
git commit -m "R37 — reemplaza CSS completo: Clean SaaS, sidebar, side menu, panel, tokens"
```

---

## Task 2: Replace HTML shell — topbar, sidebar, side menu

**Files:**
- Modify: `frontend/admin.html` — HTML section starting after `<div id="pantalla-admin">`

### What to find and replace

Locate `<div id="pantalla-admin">` in the HTML. Immediately after it, there is currently:
1. `<div id="ac-dropdown" ...>` — KEEP as-is
2. `<div class="topbar">` — REPLACE
3. `<nav class="bottom-nav">` — REPLACE with sidebar + side menu
4. `<button id="fab-nuevo-desktop" ...>` — DELETE entirely

- [ ] **Step 1: Replace the topbar**

Find:
```html
  <div class="topbar">
    <span class="topbar-marca">Inmuebles Audiovisuales</span>
    <span class="topbar-sep">/</span>
    <span class="topbar-titulo">Contratos v4</span>
    <button class="btn-ajustes" id="btn-topbar-ajustes" onclick="mostrarTab('ajustes', null)" title="Ajustes">
      <i class="ti ti-settings"></i><span class="btn-ajustes-label">Ajustes</span>
    </button>
    <button class="btn-logout" onclick="cerrarSesion()">Salir</button>
  </div>
```

Replace with:
```html
  <!-- Mobile topbar (hidden on desktop) -->
  <div class="mobile-topbar">
    <button class="hamburger-btn" id="btn-hamburger" onclick="abrirSideMenu()" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
    <span class="topbar-title" id="topbar-section-title">Contratos</span>
    <button class="btn-nuevo-mobile" onclick="irANuevo()" aria-label="Nuevo contrato">
      <i class="ti ti-plus"></i>
    </button>
  </div>
```

- [ ] **Step 2: Replace the bottom-nav with sidebar + side menu**

Find the entire `<nav class="bottom-nav">` block (from `<nav class="bottom-nav">` through its closing `</nav>`). Replace it with:

```html
  <!-- Desktop sidebar (hidden on mobile) -->
  <nav id="sidebar">
    <div class="sidebar-logo">
      <div class="sidebar-logo-icon"><span>IAV</span></div>
      <div>
        <div class="sidebar-logo-name">Inmuebles<br>Audiovisuales</div>
      </div>
    </div>
    <div class="sidebar-section-label">Menu</div>
    <button class="sidebar-item activo" data-tab="contratos" onclick="mostrarTab('contratos', this)">
      <div class="sidebar-indicator"></div>
      <i class="ti ti-file-text sidebar-icon"></i>
      <span class="sidebar-label">Contratos</span>
      <span class="sidebar-badge" id="bnav-badge-contratos" style="display:none"></span>
    </button>
    <button class="sidebar-item" data-tab="clientes" onclick="mostrarTab('clientes', this)">
      <div class="sidebar-indicator"></div>
      <i class="ti ti-users sidebar-icon"></i>
      <span class="sidebar-label">Clientes</span>
      <span class="sidebar-badge" id="bnav-badge-clientes" style="display:none"></span>
    </button>
    <div class="sidebar-footer">
      <div class="sidebar-avatar"><span>IA</span></div>
      <div>
        <div class="sidebar-user-name">Admin IAV</div>
        <div class="sidebar-user-role">Administrador</div>
      </div>
      <button class="sidebar-gear" onclick="mostrarTab('ajustes', null)" title="Ajustes">
        <i class="ti ti-settings"></i>
      </button>
    </div>
  </nav>

  <!-- Mobile side menu -->
  <div id="side-menu">
    <div class="sm-brand">
      <div class="sm-brand-name">Inmuebles Audiovisuales</div>
      <div class="sm-brand-sub">Panel de administracion</div>
    </div>
    <button class="sm-nav-item activo" data-tab="contratos" onclick="cerrarSideMenu();mostrarTab('contratos',this)">
      <div class="sm-indicator"></div>
      <i class="ti ti-file-text sm-nav-icon"></i>
      <span class="sm-nav-label">Contratos</span>
      <span class="sm-nav-badge" id="sm-badge-contratos" style="display:none"></span>
    </button>
    <button class="sm-nav-item" data-tab="clientes" onclick="cerrarSideMenu();mostrarTab('clientes',this)">
      <div class="sm-indicator"></div>
      <i class="ti ti-users sm-nav-icon"></i>
      <span class="sm-nav-label">Clientes</span>
    </button>
    <div class="sm-footer">
      <button class="sm-footer-item" onclick="cerrarSideMenu();mostrarTab('ajustes',null)">
        <i class="ti ti-settings sm-footer-icon"></i>
        <span class="sm-footer-label">Ajustes</span>
      </button>
      <div class="sm-user">
        <div class="sm-user-avatar"><span>IA</span></div>
        <div>
          <div class="sm-user-name">Admin IAV</div>
          <div class="sm-user-role">Administrador</div>
        </div>
        <button class="sm-logout-btn" onclick="cerrarSesion()" title="Salir">
          <i class="ti ti-logout"></i>
        </button>
      </div>
    </div>
  </div>
  <div id="side-menu-overlay" onclick="cerrarSideMenu()"></div>
```

- [ ] **Step 3: Delete FAB button**

Find and delete this entire element:
```html
  <!-- FAB nuevo contrato (solo desktop) -->
  <button id="fab-nuevo-desktop" onclick="toggleMenuNuevo(event)"
    style="display:none;position:fixed;bottom:28px;right:28px;z-index:300;
    width:52px;height:52px;border-radius:50%;background:var(--gold);
    border:none;color:#1a1000;font-size:24px;cursor:pointer;
    box-shadow:0 4px 20px rgba(201,168,76,0.45);
    align-items:center;justify-content:center;
    transition:filter 150ms,transform 150ms;">
    <i class="ti ti-plus"></i>
  </button>
```

- [ ] **Step 4: Wrap existing content in `.main-content`**

Find `<div class="contenido">` and the `<div class="tabs">` that follows it. The `.tabs` div (which has `Contratos` tab button) is now handled by the sidebar — delete it:

Find:
```html
  <div class="contenido">
    <div class="tabs">
      <button class="tab-btn activo" data-tab="contratos" onclick="mostrarTab('contratos', this)">Contratos</button>
    </div>
```

Replace with:
```html
  <div class="main-content">
  <div class="contenido">
```

Then find the very end of `<div id="pantalla-admin">` — the closing `</div>` that wraps `.contenido` — and add one more `</div>` to close `.main-content`. (Search for `</div><!-- end contenido -->` or the last `</div>` before `</div><!-- end pantalla-admin -->` and add `</div>` after `.contenido` closes.)

- [ ] **Step 5: Commit**

```bash
git add frontend/admin.html
git commit -m "R37 — reemplaza HTML shell: topbar mobile, sidebar desktop, side menu mobile"
```

---

## Task 3: Replace KPI stats ribbon with new `.kpi-grid`

**Files:**
- Modify: `frontend/admin.html` — `#statsRibbon` block inside `#sec-contratos`

Currently `#statsRibbon` has 4 `.stat-card` elements. The JS fills `#statSesionesHoy`, `#statPendientesFirma`, `#statEnProduccion`, `#statCobradoMes`. These IDs must be preserved.

- [ ] **Step 1: Replace #statsRibbon HTML**

Find the `<div class="stats-ribbon" id="statsRibbon">` block (it ends after the 4th `.stat-card`). Replace the entire block with:

```html
      <!-- KPI grid (desktop only — shown via CSS media query) -->
      <div class="kpi-grid" id="statsRibbon">
        <div class="kpi-card">
          <div class="kpi-label">Sesiones hoy</div>
          <div class="kpi-value amber" id="statSesionesHoy">—</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Pendientes firma</div>
          <div class="kpi-value" id="statPendientesFirma">—</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">En produccion</div>
          <div class="kpi-value" id="statEnProduccion">—</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Cobrado este mes</div>
          <div class="kpi-value green" id="statCobradoMes">—</div>
        </div>
      </div>
```

Note: The element keeps `id="statsRibbon"` so the existing `actualizarStatsRibbon` JS function (which reads/writes those inner IDs) continues to work without modification.

- [ ] **Step 2: Delete radar and hoy strip**

Find and delete `<div id="radar-sesiones" class="radar-strip" style="display:none"></div>`.

Find and delete the `<div class="hoy-strip" id="hoyStrip" ...>` block (4 lines).

- [ ] **Step 3: Commit**

```bash
git add frontend/admin.html
git commit -m "R37 — reemplaza stats ribbon con kpi-grid, elimina radar y hoy-strip"
```

---

## Task 4: Update JS navigation functions

**Files:**
- Modify: `frontend/admin.html` — JS section, navigation functions

### 4a — Replace `mostrarTab`

Find the function `mostrarTab(id, btn)` and replace it entirely:

```javascript
function mostrarTab(id, btn) {
  document.querySelectorAll('.seccion').forEach(s => s.classList.remove('activa'));
  // Deactivate sidebar items
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('activo'));
  // Deactivate side menu items
  document.querySelectorAll('.sm-nav-item').forEach(b => b.classList.remove('activo'));
  // Activate the target section
  var sec = document.getElementById('sec-' + id);
  if (sec) sec.classList.add('activa');
  // Mark caller active (sidebar or side menu item)
  if (btn) btn.classList.add('activo');
  // Sync the opposite nav element
  var sidebarBtn = document.querySelector('#sidebar .sidebar-item[data-tab="' + id + '"]');
  if (sidebarBtn) sidebarBtn.classList.add('activo');
  var smBtn = document.querySelector('#side-menu .sm-nav-item[data-tab="' + id + '"]');
  if (smBtn) smBtn.classList.add('activo');
  // Update mobile topbar title
  var titles = { contratos: 'Contratos', clientes: 'Clientes', ajustes: 'Ajustes', nuevo: 'Nuevo contrato' };
  var titleEl = document.getElementById('topbar-section-title');
  if (titleEl && titles[id]) titleEl.textContent = titles[id];
  // Trigger data loads
  if (id === 'contratos') cargarContratos();
  if (id === 'clientes') cargarClientes();
  if (id === 'ajustes') {
    var paneActivo = document.querySelector('.ajustes-pane.activo-apane');
    if (paneActivo && paneActivo.id === 'apane-clientes') cargarCRM();
    else if (paneActivo && paneActivo.id === 'apane-paquetes') cargarPaquetesAdmin();
    else cargarMetricas();
  }
  if (id === 'nuevo') cargarClientesParaAutocomplete();
}
```

### 4b — Replace `mostrarTabMobile`

Find `function mostrarTabMobile(id, btn)` and replace it entirely:

```javascript
function mostrarTabMobile(id, btn) {
  mostrarTab(id, btn);
}
```

### 4c — Add `abrirSideMenu` and `cerrarSideMenu`

Find `// ── Bottom nav mobile ──` and replace that comment block (the old `mostrarTabMobile` function) with:

```javascript
// ── Side menu mobile ──
function abrirSideMenu() {
  var menu = document.getElementById('side-menu');
  var overlay = document.getElementById('side-menu-overlay');
  if (menu) menu.classList.add('open');
  if (overlay) overlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function cerrarSideMenu() {
  var menu = document.getElementById('side-menu');
  var overlay = document.getElementById('side-menu-overlay');
  if (menu) menu.classList.remove('open');
  if (overlay) overlay.classList.remove('visible');
  document.body.style.overflow = '';
}
```

### 4d — Update `actualizarNavBadges`

Find `function actualizarNavBadges(contratos)` and replace it:

```javascript
function actualizarNavBadges(contratos) {
  var abiertos = contratos.filter(function(c) {
    var e = c.Estatus || '';
    return e !== 'Completado' && e !== 'Liquidado';
  }).length;
  // Sidebar badge
  var bdgSidebar = document.getElementById('bnav-badge-contratos');
  if (bdgSidebar) {
    bdgSidebar.textContent = abiertos;
    bdgSidebar.style.display = abiertos > 0 ? '' : 'none';
  }
  // Side menu badge
  var bdgSm = document.getElementById('sm-badge-contratos');
  if (bdgSm) {
    bdgSm.textContent = abiertos;
    bdgSm.style.display = abiertos > 0 ? '' : 'none';
  }
}
```

- [ ] **Step 1: Apply all four JS changes above in order**

- [ ] **Step 2: Commit**

```bash
git add frontend/admin.html
git commit -m "R37 — actualiza JS de navegacion: mostrarTab, side menu open/close, badges"
```

---

## Task 5: Remove dead JS code

**Files:**
- Modify: `frontend/admin.html` — JS section

Remove the following functions entirely (they reference removed HTML elements):

### 5a — Delete `toggleMenuNuevo`

Find and delete the function `toggleMenuNuevo(e)` and `cerrarMenuNuevo()`.

### 5b — Delete `renderHoyStrip`

Find and delete the function `renderHoyStrip(contratos)`.

### 5c — Delete `renderRadar`

Find and delete the function `renderRadar()`.

### 5d — Remove calls to deleted functions

Search for any remaining calls to `renderHoyStrip(`, `renderRadar(`, `toggleMenuNuevo(`, `cerrarMenuNuevo(` in the JS. Remove those calls (they will be inside `renderTabla` or `filtrarContratos`).

Specifically, in `renderTabla()` near the bottom, find:
```javascript
actualizarStatsRibbon(todosContratos)
renderHoyStrip(todosContratos)
```
Change to:
```javascript
actualizarStatsRibbon(todosContratos)
```

And in `filtrarContratos()`, if it calls `renderRadar()`, remove that call.

### 5e — Remove `irASubseccion` bnav-btn reference

Find `function irASubseccion(tab, subtab, btn)`. Inside it there is:
```javascript
document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('activo'));
if (btn) btn.classList.add('activo');
```
Replace those two lines with:
```javascript
document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('activo'));
document.querySelectorAll('.sm-nav-item').forEach(b => b.classList.remove('activo'));
if (btn) btn.classList.add('activo');
```

- [ ] **Step 1: Apply all five deletions/replacements above**

- [ ] **Step 2: Verify no remaining references to deleted functions**

```bash
grep -n "renderHoyStrip\|renderRadar\|toggleMenuNuevo\|cerrarMenuNuevo\|bnav-btn" \
  "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/frontend/admin.html"
```

Expected: zero results (or only results inside comments, not function calls).

- [ ] **Step 3: Commit**

```bash
git add frontend/admin.html
git commit -m "R37 — elimina JS muerto: renderHoyStrip, renderRadar, toggleMenuNuevo"
```

---

## Task 6: Update `panel-open` body class behavior

**Files:**
- Modify: `frontend/admin.html` — `abrirPanel` and `cerrarPanel` functions

The CSS uses `body.panel-open .main-content { margin-right: var(--panel-w) }`. Verify that the existing `abrirPanel` and `cerrarPanel` functions add/remove `panel-open` from `document.body`. If they currently use a different class name (`panel-abierto`), update them.

- [ ] **Step 1: Find `abrirPanel` and check the body class**

Search for:
```javascript
function abrirPanel(
```

Look at what class it adds to `document.body`. If it does:
```javascript
document.body.classList.add('panel-abierto');
```
Change to:
```javascript
document.body.classList.add('panel-open');
```

- [ ] **Step 2: Find `cerrarPanel` and check the body class**

If it does:
```javascript
document.body.classList.remove('panel-abierto');
```
Change to:
```javascript
document.body.classList.remove('panel-open');
```

- [ ] **Step 3: Also check the overlay toggle**

`abrirPanel` likely does `document.getElementById('overlay').classList.add('visible')` — this is correct, no change needed.

- [ ] **Step 4: Commit**

```bash
git add frontend/admin.html
git commit -m "R37 — sincroniza clase panel-open con nuevo CSS"
```

---

## Task 7: Verify in browser — mobile

- [ ] **Step 1: Open the local file in a browser or use production**

```bash
open "https://contratos.inmueblesaudiovisuales.com/admin.html"
```
Or locally via wrangler dev if available.

- [ ] **Step 2: Mobile verification checklist (use DevTools device emulation, iPhone 14 size)**

Check each item:
- [ ] Topbar shows hamburger icon on the left, "Contratos" title in center, "+" button on right
- [ ] "+" button is exactly square (32x32), NOT oval — inspect element and verify `width: 32px; height: 32px; border-radius: 8px`
- [ ] Tapping hamburger opens side menu from left with slide animation
- [ ] Side menu shows: Inmuebles Audiovisuales brand, Contratos item (active/gold), Clientes item, Ajustes in footer
- [ ] Tapping outside side menu (the overlay) closes it
- [ ] Tapping "Clientes" in side menu closes menu and navigates to Clientes section
- [ ] Tapping "+" opens nuevo contrato form (section `#sec-nuevo`)
- [ ] Bottom nav is NOT visible
- [ ] FAB is NOT visible
- [ ] Contracts list renders (cards in mobile mode from `@media (max-width: 640px)`)
- [ ] Tapping a contract opens the panel lateral as bottom sheet (slides from bottom)

- [ ] **Step 3: Fix any layout issues found before continuing**

---

## Task 8: Verify in browser — desktop

- [ ] **Step 1: Open in desktop browser (window width > 1024px)**

- [ ] **Step 2: Desktop verification checklist**

- [ ] Sidebar visible on left (200px wide), white background, border-right
- [ ] Sidebar shows IAV logo icon + "Inmuebles Audiovisuales" text
- [ ] "Contratos" sidebar item is active (gold indicator bar on left, dark icon and label)
- [ ] "Clientes" sidebar item is not active (grey)
- [ ] Sidebar footer shows "IA" avatar + "Admin IAV" + gear icon
- [ ] Gear icon navigates to Ajustes section
- [ ] Mobile topbar NOT visible
- [ ] KPI cards row shows 4 cards: Sesiones hoy, Pendientes firma, En produccion, Cobrado este mes
- [ ] KPI values populate when data loads (—> real numbers)
- [ ] Table shows with header row: Folio, avatar column, Cliente, Estatus, Sesion, Total, Saldo
- [ ] Clicking a contract row opens the detail panel sliding from right (340px)
- [ ] `body` gets class `panel-open` when panel is open — table area has right margin
- [ ] Panel has tabs: Info, Pagos, Acciones
- [ ] Panel Info tab shows: total, saldo, fecha sesion, direccion, cliente
- [ ] Clicking X on panel closes it and removes right margin
- [ ] "Nuevo" button in table toolbar opens drawer from right (560px)
- [ ] Radar de sesiones strip is NOT present
- [ ] Hoy strip is NOT present
- [ ] No bottom nav visible

- [ ] **Step 3: Fix any layout issues before final commit**

---

## Task 9: Update MASTER_V4.md

**Files:**
- Modify: `MASTER_V4.md`

- [ ] **Step 1: Get current Monterrey time**

```bash
TZ="America/Monterrey" date "+%Y-%m-%d %H:%M:%S %Z"
```

- [ ] **Step 2: Add R37 entry to MASTER_V4.md**

In `MASTER_V4.md`, find the section `## Cambios aplicados` and add at the top (before R36):

```markdown
### Ronda 37 — Rediseno completo admin: Clean SaaS (YYYY-MM-DD HH:MM CST)

**Cambio: Rediseno visual y estructural completo de admin.html**

| ID | Archivo | Cambio |
|----|---------|--------|
| R37-01 | `frontend/admin.html` CSS | CSS completo reescrito. Tokens: `--black`, `--page:#F9F9F7`, `--card:#FFFFFF`, `--gold:#C9A84C`, `--sidebar-w:200px`, `--panel-w:340px`. Mobile-first. |
| R37-02 | `frontend/admin.html` CSS | Sidebar desktop: `#sidebar` fijo 200px, items con indicador dorado, footer con engranaje. |
| R37-03 | `frontend/admin.html` CSS | Side menu mobile: `#side-menu` desliza desde izquierda, overlay oscuro, `#side-menu-overlay`. Sin bottom nav. |
| R37-04 | `frontend/admin.html` CSS | Topbar mobile: `.mobile-topbar` con hamburger, titulo de seccion, boton `+` (32x32px, border-radius:8px). |
| R37-05 | `frontend/admin.html` CSS | KPI cards: `.kpi-grid` 4 columnas en desktop. Oculto en mobile. IDs internos preservados. |
| R37-06 | `frontend/admin.html` CSS | Panel lateral: mobile = bottom sheet (88dvh, translateY), desktop = panel fijo derecha (340px, translateX). |
| R37-07 | `frontend/admin.html` HTML | Bottom nav eliminado. FAB eliminado. `#radar-sesiones` eliminado. `#hoyStrip` eliminado. `.tabs` (Contratos tab) eliminado. |
| R37-08 | `frontend/admin.html` HTML | Nuevo `#sidebar` desktop y `#side-menu` + `#side-menu-overlay` mobile. `<div class="mobile-topbar">` reemplaza topbar oscuro. `.main-content` envuelve el contenido. |
| R37-09 | `frontend/admin.html` HTML | `#statsRibbon` conserva IDs internos pero con markup de `.kpi-grid`. |
| R37-10 | `frontend/admin.html` JS | `mostrarTab` reescrita: usa `.sidebar-item` y `.sm-nav-item`. Actualiza `#topbar-section-title`. |
| R37-11 | `frontend/admin.html` JS | `abrirSideMenu` / `cerrarSideMenu` nuevas. `mostrarTabMobile` simplificada. |
| R37-12 | `frontend/admin.html` JS | `actualizarNavBadges` actualizada: usa `#bnav-badge-contratos` (sidebar) y `#sm-badge-contratos` (side menu). |
| R37-13 | `frontend/admin.html` JS | Eliminadas: `renderHoyStrip`, `renderRadar`, `toggleMenuNuevo`, `cerrarMenuNuevo`. |
| R37-14 | `frontend/admin.html` JS | `body.panel-open` reemplaza `body.panel-abierto` para activar `margin-right` en desktop. |
```

Replace `YYYY-MM-DD HH:MM` with the actual output from Step 1.

- [ ] **Step 3: Commit**

```bash
git add MASTER_V4.md
git commit -m "R37 — documenta rediseno en MASTER_V4.md"
```

---

## Task 10: Push to production

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

- [ ] **Step 2: Wait ~90 seconds for GitHub Actions to deploy**

- [ ] **Step 3: Verify production**

```bash
curl -s -o /dev/null -w "%{http_code}" https://contratos.inmueblesaudiovisuales.com/admin.html
```

Expected: `200`

- [ ] **Step 4: Open production URL and run both mobile and desktop checklists from Task 7 and Task 8 on the live site**

---

## Self-review notes

**Spec coverage check:**

| Spec requirement | Task that covers it |
|-----------------|-------------------|
| Clean SaaS, white/grey | Task 1 (CSS tokens, card/page colors) |
| Sidebar 200px desktop with labels | Task 1 (CSS) + Task 2 (HTML) |
| Gold accent only for active/badge | Task 1 (sidebar-indicator, sidebar-badge, ctab) |
| Fixed detail panel 340px desktop | Task 1 (CSS panel-lateral desktop) |
| Side menu mobile, no bottom nav | Task 1 (CSS) + Task 2 (HTML) |
| "+" in topbar mobile (32x32, radius 8px) | Task 1 (.btn-nuevo-mobile CSS) + Task 2 (HTML) |
| KPI cards (4, desktop only) | Task 3 |
| Radar de sesiones removed | Task 3 |
| Hoy strip removed | Task 3 |
| JS navigation updated | Task 4 |
| Dead JS removed | Task 5 |
| body.panel-open margin behavior | Task 6 |
| @media (max-width: 640px) preserved | Task 1 (included verbatim in new CSS) |
| Mobile detail = full screen bottom sheet | Task 1 (CSS panel-lateral mobile) |
| MASTER_V4.md updated | Task 9 |

**No placeholders found.**

**Type consistency:** All CSS class names defined in Task 1 match what is used in Task 2 HTML. JS selectors in Task 4 match HTML IDs/classes added in Task 2.
