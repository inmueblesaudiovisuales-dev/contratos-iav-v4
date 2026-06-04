# Bitacora de Produccion 2.1 UI Implementation Plan

**Goal:** Convert the working R53 checklist into a compact, field-first production log that exposes risk and the next action immediately.

**Architecture:** Keep the current static HTML/CSS/JS implementation and existing checklist logic/API contract. Refactor only presentation helpers and markup inside `frontend/checklist.html`; no database, adapter, or business-rule changes.

**Tech Stack:** Vanilla HTML/CSS/JS, existing pure checklist logic, Node built-in tests, Playwright browser verification.

---

### Task 1: Compact capture workspace

**Files:**
- Modify: `frontend/checklist.html`

- [x] Compact the loaded-state header and make the operator/services row secondary.
- [x] Replace mode cards with a compact segmented control and one active-help band.
- [x] Rebuild the summary around key risks and make numeric progress secondary.
- [x] Give key, amenity, and normal spaces distinct visual hierarchy.
- [x] Replace generic management labels with semantic capture/review labels.

### Task 2: Operational review views

**Files:**
- Modify: `frontend/checklist.html`

- [x] Rebuild Cierre as a red/yellow/green operational review.
- [x] Rebuild Edicion as aligned Video and Drone timelines with separate exceptions and amenities.
- [x] Improve the initial template onboarding and make Amenidades a prominent choice.

### Task 3: Verification and documentation

**Files:**
- Modify: `MASTER_V4.md`

- [x] Run syntax and checklist logic tests.
- [x] Verify mobile and desktop flows with a mocked API in the browser.
- [x] Check capture, repeated-take, Cierre, Edicion, and template states for visual clarity.
- [x] Document R54, rebase on latest `origin/main`, and push `main`.
