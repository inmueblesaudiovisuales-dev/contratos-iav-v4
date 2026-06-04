# KICKOFF — Prompt de arranque para Opus (rediseño IAV)

Ejecuta esto en una sesión **LOCAL de Claude Code en la Mac de Bruno** (NO en la web/nube): la migración D1 necesita `wrangler` local. La Mac ya tiene wrangler 4.88 autenticado (cuenta inmueblesaudiovisuales@gmail.com) y el repo clonado en `~/contratos-iav-v4`. Lánzalo en modo desatendido para que no se detenga a pedir permisos mientras Bruno duerme:
```
cd ~/contratos-iav-v4
claude --dangerously-skip-permissions
```
Usa el modelo **Opus**. Pega lo de abajo como primer mensaje.

---

Vas a ejecutar el rediseño completo de `admin.html` y `portal.html` de Inmuebles Audiovisuales. Es el último gran rediseño antes de lanzar; hay clientes esperando, así que debe quedar impecable y production-ready.

**Modo autónomo:** Bruno se va a dormir. Tras pasar el PASO 0 (preflight), ejecuta TODO de corrido (Fases 0→5) **sin esperar su input ni pausar a preguntar**. Resuelve toda ambigüedad con criterio y regístrala en `design/BUILD_LOG.md`. Único punto de parada: el preflight. Al terminar, deja un **reporte matutino** en `design/BUILD_LOG.md`.

## PASO 0 — PREFLIGHT OBLIGATORIO (no toques nada hasta cumplirlo)
0. Entorno: corres LOCAL en la Mac, en `~/contratos-iav-v4`. `wrangler` está autenticado (puedes correr la migración D1). No estás en la web.
1. Repo `inmueblesaudiovisuales-dev/contratos-iav-v4`, rama `main` = ÚNICA fuente de verdad. `cd ~/contratos-iav-v4 && git fetch origin && git pull origin main`. Anota el hash del último commit. No uses copias viejas ni `/tmp/...`.
2. Confirma que tienes y son del repo: `frontend/admin.html` (~5,971 líneas), `frontend/portal.html` (~2,788), `worker/` completo (`src/index.js`, `src/routes/*`, `schema.sql`, `wrangler.toml`, `migrations/`), `adapter/AdapterScript4_v1.js`, `design/` (spec, design-system.css, B-dossier.html, BUILD_LOG.md). Si `admin.html` es mucho más corto que ~6k líneas, es versión vieja: NO la uses.
3. Lee COMPLETOS: `design/SPEC_REDISENO_IAV.md` (Anexos A–I), `design/design-system.css`, `design/B-dossier.html`, `MASTER_V4.md` (contexto DB/flujos + número de ronda actual), `design/BUILD_LOG.md`.
4. Si falta algo o no puedes confirmar que es lo más reciente: búscalo. Si no lo resuelves, DETENTE, deja el motivo en `BUILD_LOG.md` y termina. Bruno lo verá al despertar.
5. Repite `git pull` al inicio de cada fase.

## Mandato
Modifica sin límites lo que el objetivo requiera (refactoriza, reescribe, agrega columnas/endpoints, arregla bugs). Límite: no perder funcionalidad, no romper el modelo de datos ni `equipo.html`, verificar que todo cargue. Nada destructivo con datos reales. Haz de más antes que quedarte corto.

## Fases (commit a `main` por fase; actualiza BUILD_LOG al cerrar cada una)
- Fase 0: Cimientos (design-system + shell sin sidebar; re-estilizar login). Respaldos `admin-v4-backup.html` y `portal-v4-backup.html`.
- Fase 1: Admin (Hoy → Nuevo → Contratos+panel → Clientes → Ajustes).
- Fase 2: Backend (migración + config + dedupe + agendarLlamadaRapida + marcarActividad + archivos de cliente + fix de subida). **La migración se nombra por la RONDA actual (lee MASTER_V4.md; mínimo `r57-rediseno.sql`, NO r38 — los archivos llegan a r37 pero las migraciones van por ronda y el proyecto va en R56/57).** Corre la migración con wrangler (estás local, autenticado); si falla tras varios intentos, sáltala, deja el comando en BUILD_LOG y asegura degradación con gracia (Anexo I.4-bis). Verifica el esquema antes de aplicar (PRAGMA table_info). El adapter `AdapterScript4_v1.js`: déjalo listo; **Bruno lo despliega manual**.
- Fase 3: Portal (marca + claridad form + acceso simplificado + pago CLABE).
- Fase 4: Integración + QA (Anexo G + sección 11).
- Fase 5: Auditoría de bugs + resolución; nota en BUILD_LOG.

## Reglas
- Sin mayúsculas en labels, sin emojis, sin `Courier`/`Montserrat`, simetría al pixel; todo hereda de `design-system.css` (cero estilos viejos).
- NO tocar: `equipo.html` (bug visual no prioritario, déjalo), `checklist.html`, `chat.html`, `revision.html`. Si se rompen por un cambio tuyo, reporta.
- Backend/migración antes que el frontend que los usa (Anexo I.1).
- Tras cada fase: abrir en navegador, revisar consola, regresión; no avanzar si quedó roto.
- Datos de prueba (clave admin `framedock`): elimínalos al final.

## Continuidad (clave para correr toda la noche)
- Trabaja sin parar; no pidas confirmación (corres en modo --dangerously-skip-permissions).
- **Commitea seguido** (por sub-paso, no solo por fase) y **actualiza `design/BUILD_LOG.md`** tras cada avance, para que el progreso quede guardado aunque la sesión se corte.
- **Si esta es una sesión de continuación** (Bruno escribió "continúa"): primero lee `design/BUILD_LOG.md` y `git pull`, identifica la última fase/sub-paso completado, y retoma desde ahí. No rehagas lo ya hecho.
- Si te quedas sin contexto, deja en `BUILD_LOG.md` exactamente en qué punto vas y qué sigue, antes de terminar.

Empieza por el PREFLIGHT. Si pasa, ejecuta todo en automático hasta la Fase 5 y deja el reporte matutino en BUILD_LOG.
