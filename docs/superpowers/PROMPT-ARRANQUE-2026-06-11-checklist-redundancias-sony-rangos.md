# Prompt de arranque — Sony unificada, redundancias, rangos por número y pulido

> Pega esto para abrir la sesión de CONSTRUCCIÓN. El diseño y el plan ya están escritos. Trabajas de corrido, SIN checkpoints con Bruno: tú ejecutas y tú verificas. No empujes nada a producción.

## Contexto

Se trabaja SIEMPRE en las copias locales del disco (no "en GitHub"; GitHub es respaldo/publicación).

Dos repos, rutas EXACTAS:
- **Checklist:** `/Users/brunogutierrez/contratos-iav-v4` — rama **`main`**. Push a `main` despliega a producción (GitHub Actions). NO empujar. NO `wrangler deploy` a mano. Pruebas de lógica: `node --test frontend/checklist-logic.test.js`.
- **App de bajar material:** `/Users/brunogutierrez/iav-metadata-app` — rama **`rediseno`**. Solo se toca si la verificación cruzada (dry-run) lo exige; merge local a `master` sin push. Gate: `npx tsc --noEmit && npx vitest run` (+ `npm run build:app` al tocar UI).

> CARPETA EQUIVOCADA — NO usar: `/Users/brunogutierrez/Documents/CLAUDE/contratos-iav-v4` (copia vieja). La buena del checklist es `/Users/brunogutierrez/contratos-iav-v4`.

## ANTES DE EMPEZAR — verifica (OBLIGATORIO, en cada repo)

Si algo falla, DETENTE y avisa; no uses pull/reset por tu cuenta.
1. **Carpeta correcta** (`pwd`).
2. **Rama correcta:** checklist en `main`; app en `rediseno` (`git branch --show-current`).
3. **Al día con GitHub:** `git fetch origin && git rev-list --left-right --count origin/<rama>...HEAD` → "DETRAS ADELANTE". Si DETRAS > 0, DETENTE.
4. **Spec y plan presentes** en el checklist:
   - `docs/superpowers/specs/2026-06-11-checklist-redundancias-sony-rangos-design.md`
   - `docs/superpowers/plans/2026-06-11-checklist-redundancias-sony-rangos.md`
   Si no están, estás en la carpeta/rama equivocada — DETENTE.

Lee el spec y el plan completos antes de tocar nada. Referencia de formatos reales: `iav-metadata-app/docs/superpowers/2026-06-10-estructuras-tarjetas.md`.

## Cómo ejecutar

- Usa **superpowers:subagent-driven-development**: un subagente por tarea, revisión en dos etapas (spec + calidad), tarea por tarea.
- **TDD** donde hay lógica pura (Fases 1-3 en `checklist-logic.js`). UI (Fases 4-6) se cierra con **verificación visual que TÚ haces** manejando el navegador del demo con Playwright headless contra `http://127.0.0.1:8788/checklist.html?demo=1` (levanta `python3 -m http.server 8788` en `frontend/`) y revisando DOM/estado. No dependes de Bruno para verificar.
- **Verificación cruzada (Fases 1 y 5):** exporta una bitácora real del demo y córrela por el dry-run de la app (`npm run dry-run -- <json> <carpeta> <sony|dji> <camaraId>`). En la Fase 1 confirma que los clips de asesor caen en bin "Asesor" y los de video en su escena. Si la app necesita un ajuste, arréglalo en `iav-metadata-app` rama `rediseno` (local, con tests verdes, sin push).
- **Gate por tarea antes de cada commit.** Commits descriptivos, SIN push.

## Reglas (obligatorias)

1. **NUNCA asumir: verificar en el código** los nombres/ids reales antes de tocar (`initializeCameraSequence`, `getCameraSequence`, `registerAsesorFile`, `sesionDroneAplica`, `SERVICES_DEFAULT`, `renderRoleSelect`, `camarasRangoManual`, `renderAsesorCapture`). Si no lo verificaste, no lo afirmes.
2. **Diseño idéntico al checklist.** Reusar variables CSS (`--ink-*`, `--gold*`, `--card`, `--line`, `--tint*`, `--green*`) y fuentes existentes y clases existentes. Prohibido colores o tipografías nuevos. Sin emojis (usar íconos Tabler, p. ej. `ti ti-check`).
3. **JSON aditivo/compatible:** sigue `version: 2`. Conservar `camaraId 'sony-asesor'` en los registros y los tokens como **nombre real** (no contador lógico). La app solo lee `archivos`/`grabaciones`/`cameras`/`vlogOsmoAction`/`folio`/`token`/`nombreCliente`.
4. **Sin pérdida de datos:** Fases 1-3 cambian estado/defaults; cada migración pasa por `normalizeChecklistData` con su test, y al final se carga un trabajo viejo para confirmar que no se pierde nada (drone, asesor, secuencias).
5. **Español formal con acentos** en texto visible; identificadores/carpetas sin acentos; sin emojis. Mobile-first.

## Decisiones ya tomadas (no preguntar)

- Sony: **Forma A** (compartir secuencia; conservar rótulo `sony-asesor`).
- Tipo de propiedad: **obligatorio** para "Empezar".
- App: **arréglala en `rediseno` (local, sin push)** si el dry-run lo exige.
- Despliegue: **commits locales, SIN push**. No despliegues a producción.
- Voz en off: **acceso visible** en la sesión de asesor (sin switch-en-caliente por ahora).

## Orden de fases

1. Sony unificada (compartir secuencia) — riesgo alto, TDD + dry-run.
2. Drone a una bandera (`servicios.drone`) — TDD + migración.
3. Asesor default off — TDD.
4. Pantalla de inicio con acordeón + tipo obligatorio — visual.
5. Rangos por número, solo foto/360 — visual + dry-run.
6. Pulido: toast (confirmación en botón), un solo regreso, voz en off visible — visual.

## Cuando termines

Deja todo verde (tests, y la app verde si la tocaste). Carga un trabajo viejo para confirmar que no se perdió nada. Resume qué construiste y corre `git log origin/main..main` para listar qué entraría. **No empujes nada**: el push/deploy lo decide Bruno.
