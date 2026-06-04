# KICKOFF — Prompt de arranque para Opus (rediseño IAV)

Copia y pega TODO lo de abajo como primer mensaje en la sesión de Opus (Claude Code) sobre el repo `contratos-iav-v4`.

---

Vas a ejecutar el rediseño completo de `admin.html` y `portal.html` de Inmuebles Audiovisuales. Es el último gran rediseño antes de lanzar; hay clientes esperando, así que debe quedar impecable y production-ready.

## PASO 0 — PREFLIGHT OBLIGATORIO (no toques nada hasta cumplirlo)
Nunca trabajes sobre versiones viejas ni asumas que tienes algo.
1. Trabaja contra el repo de GitHub `inmueblesaudiovisuales-dev/contratos-iav-v4`, rama `main`. Es la ÚNICA fuente de verdad. No uses copias locales sueltas, carpetas `/tmp/...`, ni archivos de sesiones previas.
2. `git fetch origin && git status` → confirma `main` y al día; si no, `git pull origin main`. Anota el hash del último commit.
3. Confirma que tienes y son del repo: `frontend/admin.html` (~6,000 líneas), `frontend/portal.html` (~2,800), `worker/` completo (`src/index.js`, `src/routes/*`, `schema.sql`, `wrangler.toml`, `migrations/`), `adapter/AdapterScript4_v1.js`, y la carpeta `design/` (spec, design-system.css, B-dossier.html, BUILD_LOG.md). Si `admin.html` es mucho más corto que ~6k líneas, es una versión vieja: NO la uses.
4. Lee COMPLETOS, en este orden: `design/SPEC_REDISENO_IAV.md` (incluidos Anexos A–I), `design/design-system.css`, `design/B-dossier.html` (referencia visual), `MASTER_V4.md` (contexto DB/flujos), `design/BUILD_LOG.md`.
5. Si falta cualquier archivo o no puedes confirmar que es la versión más reciente y completa: búscalo. Si tras buscar sigues sin poder confirmarlo, DETENTE y pregúntale a Bruno. No improvises sobre datos incompletos.
6. Repite `git pull` al inicio de CADA fase.

## Mandato
Tienes autorización para modificar sin límites lo que el objetivo requiera (refactorizar, reescribir, agregar columnas/endpoints, arreglar bugs). Límite único: no perder funcionalidad existente, no romper el modelo de datos ni `equipo.html`, y verificar que todo cargue y funcione. Haz de más antes que quedarte corto.

## Forma de trabajo (Anexo H del spec) — por fases, commit a `main` por fase
- Fase -1 — Preflight (lo de arriba).
- Fase 0 — Cimientos (design-system + shell de navegación, sin sidebar; re-estilizar también el login).
- Fase 1 — Admin (Hoy → Nuevo → Contratos+panel → Clientes → Ajustes), sub-pasos commiteables.
- Fase 2 — Backend (migración r36 + config + dedupe + agendarLlamadaRapida + marcarActividad + archivos de cliente + fix de subida + adapter). Despliega backend/migración ANTES que el frontend que los usa (Anexo I.1).
- Fase 3 — Portal (marca + claridad del form + acceso simplificado + pago CLABE).
- Fase 4 — Integración + QA (Anexo G + sección 11).
- Fase 5 — Auditoría de bugs + resolución; entrega nota de "bugs encontrados y resueltos".

## Reglas
- Respaldos `frontend/admin-v4-backup.html` y `frontend/portal-v4-backup.html` en el primer commit.
- Sin mayúsculas en labels, sin emojis, sin `Courier`/`Montserrat`, simetría/alineación al pixel.
- NO tocar: `equipo.html` (tiene un bug visual pero NO es prioritario, se deja), `checklist.html`, `chat.html`, `revision.html`. Si se rompen por un cambio tuyo, reportar (no rediseñar).
- Tras cada fase: abrir en navegador, revisar consola, correr regresión; actualizar `design/BUILD_LOG.md`; no avanzar si quedó roto.
- Migración D1 y adapter de Apps Script: ver Anexo I.2 (si no puedes correr wrangler, deja el `.sql` listo y avisa el comando exacto; el adapter se despliega manual).
- Detente y pregunta ante ambigüedad irreversible o que afecte dinero/datos del cliente (ver sección 0).

Empieza por el PREFLIGHT. Confirma que cumpliste los 6 puntos y que tienes todo en su versión más reciente; luego arranca la Fase 0.
