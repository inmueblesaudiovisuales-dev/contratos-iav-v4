# Bitacora de Produccion 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing R48 capture UX with a field-ready Bitacora 2.0: templates first, amenidades as a first-class zone, explicit capture buttons, and intentional repeated takes.

**Architecture:** Keep the existing static `checklist.html` + `checklist-logic.js` split. Extend the pure logic module with templates, zones, key-space metadata, duplicate prevention, capture intentions, and zone-based pending summaries; then rebuild the HTML around four views: Preparar/Capturar, Cierre, Edicion, and configuration sheets. Persist the new metadata in the same existing JSON payload, with no D1 schema or adapter changes.

**Tech Stack:** Vanilla HTML/CSS/JS, existing Cloudflare API contract, Node built-in `node:test`, Playwright browser smoke checks.

---

### Task 1: Logic TDD

**Files:**
- Modify: `frontend/checklist-logic.test.js`
- Modify: `frontend/checklist-logic.js`

- [ ] Add failing tests for property templates, amenidades zone, duplicate prevention for Foto/360, and explicit intentions for repeated Video/Drone.
- [ ] Run `node --test frontend/checklist-logic.test.js` and confirm the new tests fail.
- [ ] Implement `TEMPLATES`, `applyTemplate`, zone/key metadata normalization, `getCaptureStatus`, intention-aware `registerCapture`, and zone-based pending summary.
- [ ] Run `node --test frontend/checklist-logic.test.js` and confirm all tests pass.
- [ ] Commit: `R53 — logica bitacora 2`

### Task 2: UI Rebuild

**Files:**
- Modify: `frontend/checklist.html`

- [ ] Rebuild empty state so templates are the first screen, with large cards for Casa, Departamento, Terreno, Amenidades, Exterior/Drone, and Lista propia.
- [ ] Replace ambiguous mode buttons with full labels and a strong active-mode instruction band.
- [ ] Replace state-as-action cards with one large primary button per card: Registrar/Gestionar Foto, Recorrido 360, Video, or Drone.
- [ ] Add intentional repeat sheet for Video/Drone and non-duplicate management sheet for Foto/360.
- [ ] Add zone grouping: Interior, Exterior, Amenidades, Drone.
- [ ] Add Cierre priority order: key pending, by-zone pending, amenidades, drone, repeated/extra/problem, no aplica, disabled services.
- [ ] Add Edicion view with principal Video, principal Drone, repeated/extras, notes, and amenidades summary.
- [ ] Run browser smoke checks for template selection, capture, duplicate management, Cierre, and Edicion.
- [ ] Commit: `R53 — rediseña bitacora 2`

### Task 3: Documentation and Verification

**Files:**
- Modify: `MASTER_V4.md`

- [ ] Update `MASTER_V4.md` with R53 implementation details and current Monterrey timestamp.
- [ ] Run `node --check frontend/checklist-logic.js && node --test frontend/checklist-logic.test.js`.
- [ ] Run a Playwright smoke test with mocked API.
- [ ] Commit docs: `R53 — documenta bitacora 2`
- [ ] Rebase on latest `origin/main` if needed and push `main`.

---

## Self-Review

- Covers the R53 spec requirements: templates first, amenidades, explicit primary action, duplicate prevention, capture intentions, Cierre, Edicion.
- No database or adapter changes.
- Testable pure logic changes are isolated before UI work.

