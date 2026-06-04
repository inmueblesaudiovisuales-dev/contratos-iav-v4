# KICKOFF — Prompt de arranque para Opus (rediseño IAV)

Copia y pega TODO lo de abajo como primer mensaje en la sesión de Opus (Claude Code) sobre el repo `contratos-iav-v4`.

---

Vas a ejecutar el rediseño completo de `admin.html` y `portal.html` de Inmuebles Audiovisuales. Es el último gran rediseño antes de lanzar; hay clientes esperando, así que debe quedar impecable y production-ready.

**Antes de tocar nada, lee estos 4 archivos del repo (son tu fuente de verdad y tu contexto):**
1. `design/SPEC_REDISENO_IAV.md` — el spec maestro (léelo COMPLETO, incluidos los Anexos A–I).
2. `design/design-system.css` — el sistema de diseño en CSS real (tokens y componentes). Es la fuente única de estilo.
3. `design/B-dossier.html` — el mockup de referencia visual (ábrelo para ver la estética objetivo).
4. `design/BUILD_LOG.md` — la bitácora; actualízala al final de cada fase.

**Mandato:** tienes autorización para modificar sin límites lo que el objetivo requiera (refactorizar, reescribir, agregar columnas/endpoints, arreglar bugs). Límite único: no perder funcionalidad existente, no romper el modelo de datos ni `equipo.html`, y verificar que todo cargue y funcione. Haz de más antes que quedarte corto.

**Forma de trabajo (Anexo H del spec):** por fases, commit a `main` por fase.
- Fase 0 — Cimientos (design-system + shell de navegación, sin sidebar).
- Fase 1 — Admin (Hoy → Nuevo → Contratos+panel → Clientes → Ajustes), sub-pasos commiteables.
- Fase 2 — Backend (migración r36 + config + dedupe + agendarLlamadaRapida + marcarActividad + archivos de cliente + fix de subida + adapter). Despliega backend/migración ANTES que el frontend que los usa (Anexo I.1).
- Fase 3 — Portal (marca + claridad del form + acceso simplificado + pago CLABE).
- Fase 4 — Integración + QA (Anexo G + sección 11).
- Fase 5 — Auditoría de bugs + resolución; entrega nota de "bugs encontrados y resueltos".

**Reglas:** respaldos `frontend/admin-v4-backup.html` y `frontend/portal-v4-backup.html` en el primer commit. Sin mayúsculas en labels, sin emojis, sin `Courier`/`Montserrat`, simetría/alineación al pixel. Tras cada fase: abrir en navegador, revisar consola, correr regresión; no avanzar si quedó roto. La migración D1 y el adapter de Apps Script: ver Anexo I.2 (si no puedes correr wrangler, deja el `.sql` listo y avisa el comando exacto; el adapter se despliega manual).

**Empieza por la Fase 0.** Confirma que leíste los 4 archivos y arranca.
