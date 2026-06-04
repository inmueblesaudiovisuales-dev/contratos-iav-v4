# KICKOFF — Prompt de arranque para Opus (rediseño IAV)

Copia y pega TODO lo de abajo como primer mensaje en la sesión de Opus (Claude Code) sobre el repo `contratos-iav-v4`.

---

Vas a ejecutar el rediseño completo de `admin.html` y `portal.html` de Inmuebles Audiovisuales. Es el último gran rediseño antes de lanzar; hay clientes esperando, así que debe quedar impecable y production-ready.

**IMPORTANTE — modo autónomo:** Bruno se va a dormir. Después de pasar el PASO 0 (preflight), ejecuta TODO de corrido (Fases 0→5) **sin esperar su input ni pausar a preguntar**. Resuelve toda ambigüedad con buen criterio y regístrala en `design/BUILD_LOG.md`. El único punto donde te detienes es el preflight (si no puedes confirmar que tienes todos los archivos y la versión más reciente). Al terminar (o si te detienes), deja un **reporte matutino** en `design/BUILD_LOG.md`.

## PASO 0 — PREFLIGHT OBLIGATORIO (no toques nada hasta cumplirlo)
Nunca trabajes sobre versiones viejas ni asumas que tienes algo.
1. Trabaja contra el repo GitHub `inmueblesaudiovisuales-dev/contratos-iav-v4`, rama `main`. ÚNICA fuente de verdad. No uses copias locales sueltas, `/tmp/...`, ni archivos de sesiones previas.
2. `git fetch origin && git status` → `main` y al día; si no, `git pull origin main`. Anota el hash del último commit.
3. Confirma que tienes y son del repo: `frontend/admin.html` (~6,000 líneas), `frontend/portal.html` (~2,800), `worker/` completo (`src/index.js`, `src/routes/*`, `schema.sql`, `wrangler.toml`, `migrations/`), `adapter/AdapterScript4_v1.js`, carpeta `design/` (spec, design-system.css, B-dossier.html, BUILD_LOG.md). Si `admin.html` es mucho más corto que ~6k líneas, es versión vieja: NO la uses.
4. Lee COMPLETOS: `design/SPEC_REDISENO_IAV.md` (Anexos A–I incluidos), `design/design-system.css`, `design/B-dossier.html`, `MASTER_V4.md`, `design/BUILD_LOG.md`.
5. Si falta algo o no puedes confirmar que es lo más reciente: búscalo. Si tras buscar sigues sin confirmarlo, DETENTE, deja el motivo en `BUILD_LOG.md` y termina (no construyas sobre archivos dudosos). Bruno lo verá al despertar.
6. Repite `git pull` al inicio de cada fase.

## Mandato
Modifica sin límites lo que el objetivo requiera (refactoriza, reescribe, agrega columnas/endpoints, arregla bugs). Límite: no perder funcionalidad, no romper el modelo de datos ni `equipo.html`, verificar que todo cargue. Haz de más antes que quedarte corto. No hagas nada destructivo con datos reales.

## Fases (commit a `main` por fase; actualiza BUILD_LOG al cerrar cada una)
- Fase -1: Preflight (arriba).
- Fase 0: Cimientos (design-system + shell de navegación sin sidebar; re-estilizar login). Respaldos `admin-v4-backup.html` y `portal-v4-backup.html`.
- Fase 1: Admin (Hoy → Nuevo → Contratos+panel → Clientes → Ajustes).
- Fase 2: Backend (migración r36 + config + dedupe + agendarLlamadaRapida + marcarActividad + archivos de cliente + fix de subida). **Intenta correr la migración D1 con wrangler; si falla tras varios intentos, sáltala, deja el comando en BUILD_LOG y asegura degradación con gracia (Anexo I.4-bis).** El adapter (`AdapterScript4_v1.js`): déjalo listo; **Bruno lo despliega manual** (no intentes desplegarlo).
- Fase 3: Portal (marca + claridad form + acceso simplificado + pago CLABE).
- Fase 4: Integración + QA (Anexo G + sección 11).
- Fase 5: Auditoría de bugs + resolución; nota de "bugs encontrados y resueltos" en BUILD_LOG.

## Reglas
- Sin mayúsculas en labels, sin emojis, sin `Courier`/`Montserrat`, simetría/alineación al pixel; todo hereda de `design-system.css` (cero estilos viejos).
- NO tocar: `equipo.html` (tiene un bug visual pero NO es prioritario; déjalo), `checklist.html`, `chat.html`, `revision.html`. Si se rompen por un cambio tuyo, reporta (no rediseñes).
- Despliega backend/migración antes que el frontend que los usa (Anexo I.1).
- Tras cada fase: abrir en navegador, revisar consola, regresión; no avanzar si quedó roto.
- Si creas datos de prueba (clave admin `framedock`), elimínalos al final.

Empieza por el PREFLIGHT. Si pasa, ejecuta todo en automático hasta la Fase 5 y deja el reporte matutino en BUILD_LOG.
