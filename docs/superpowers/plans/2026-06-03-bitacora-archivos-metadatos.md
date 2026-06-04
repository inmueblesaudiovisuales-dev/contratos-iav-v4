# Bitacora Archivos y Metadatos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable file-by-file Video and Drone capture with independent camera sequences, manual good takes, discards, omitted files, and metadata-ready review.

**Architecture:** Extend the existing pure checklist logic with `cameras`, `sequenceSegments`, and `mediaFiles` stored in the existing checklist JSON. Video and Drone UI will use media files as the source of truth while preserving legacy logs and the unchanged Foto/360 flow.

**Tech Stack:** Vanilla HTML/CSS/JS, existing checklist JSON API, Node built-in `node:test`, Playwright browser verification.

---

### Task 1: Camera sequence model

**Files:**
- Modify: `frontend/checklist-logic.test.js`
- Modify: `frontend/checklist-logic.js`

- [x] Add failing tests proving default cameras exist and Sony/DJI filenames produce the correct next token.
- [x] Run `node --test frontend/checklist-logic.test.js` and confirm the sequence tests fail.
- [x] Implement camera defaults, filename parsing, sequence initialization, and normalization.
- [x] Run tests and confirm all sequence tests pass.

### Task 2: File registration and reconciliation

**Files:**
- Modify: `frontend/checklist-logic.test.js`
- Modify: `frontend/checklist-logic.js`

- [x] Add failing tests for normal takes, discards, independent cameras, manual good selection, omitted-file insertion, and new segments.
- [x] Run tests and confirm the new behavior fails before implementation.
- [x] Implement file registration, derived target status, good toggling, omitted insertion, and new-segment behavior.
- [x] Run all logic tests and confirm legacy Foto/360 behavior remains green.

### Task 3: Field capture UI

**Files:**
- Modify: `frontend/checklist.html`

- [x] Add compact camera/sequence setup and camera switching for Video and Drone.
- [x] Replace Video/Drone actions with `Registrar toma` and `Registrar descarte`.
- [x] Show recent files per scene with good controls and correction menus.
- [x] Keep Foto and 360 cards and interactions unchanged.

### Task 4: Cierre and Edicion

**Files:**
- Modify: `frontend/checklist.html`

- [x] Add sequence reconciliation, scenes without good takes, unidentified omissions, and discard counts to Cierre.
- [x] Group Edicion by scene with good, other, discarded, and unidentified files.
- [x] Preserve readable legacy Video/Drone history.

### Task 5: Verification and publication

**Files:**
- Modify: `MASTER_V4.md`

- [x] Run syntax and full logic tests.
- [x] Verify mobile and desktop flows with mocked API data.
- [x] Verify Sony, Osmo, Drone, discard, good, omitted, Cierre, and Edicion flows.
- [x] Document R55, rebase latest `origin/main`, commit, and push `main`.
