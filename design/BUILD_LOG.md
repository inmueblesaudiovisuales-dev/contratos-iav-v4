# BUILD LOG — Rediseño IAV (admin + portal)

> Bitácora de ejecución. El ejecutor (Opus) la actualiza al final de cada fase.
> Para retomar tras un reinicio de contexto: leer `design/SPEC_REDISENO_IAV.md` + `design/design-system.css` + `design/B-dossier.html` + este log.

## Estado
- [ ] Fase 0 — Cimientos (design-system + shell de navegación)
- [ ] Fase 1 — Admin (Hoy · Nuevo · Contratos+panel · Clientes · Ajustes)
- [ ] Fase 2 — Backend (migración r36 + config + dedupe + agendarLlamadaRapida + marcarActividad + archivos cliente + fix subida + adapter)
- [ ] Fase 3 — Portal (marca + claridad form + acceso simplificado + pago CLABE)
- [ ] Fase 4 — Integración + QA (ANEXO G + sección 11)
- [ ] Fase 5 — Auditoría de bugs + resolución

## Notas / decisiones tomadas durante la ejecución
(vacío — el ejecutor escribe aquí)

## Pendientes / avisos para Bruno
- Migración D1: nómbrala por la ronda actual (mínimo r57, ver MASTER_V4.md), no r38; aplicar en remoto (ver Anexo I.2).
- Adapter Apps Script: desplegar manualmente en script.google.com tras Fase 2.
