# Indice de documentacion

Guia rapida para encontrar specs, planes, handoffs y reportes del repo. Si algun documento historico contiene tokens, claves o datos reales, tratarlo como sensible y no copiar esos valores.

## Handoffs y guias activas

| Documento | Para que sirve |
|---|---|
| `docs/EXPORT_METADATA_HANDOFF.md` | Contrato del programa local que tomara el JSON exportado por checklist y escribira metadatos compatibles con Premiere via exiftool. |
| `docs/CHAT_PRODUCCION.md` | Guia para convertir `frontend/chat.html` de mockup a chat productivo: seguridad, modelo de datos, webhooks y endurecimiento. |

## Specs en `docs/superpowers/specs`

| Documento | Que define |
|---|---|
| `2026-06-02-admin-redesign-design.md` | Spec de rediseño completo del admin R37. |
| `2026-06-03-v5-trabajos-redesign.md` | Modelo V5 centrado en trabajos, clientes y pipeline comercial. |
| `2026-06-03-bitacora-produccion-design.md` | Primera definicion de la bitacora de produccion por servicios de captura. |
| `2026-06-03-bitacora-produccion-2-design.md` | Bitacora 2.0: templates, amenidades, capturas repetidas y UX de campo. |
| `2026-06-03-bitacora-produccion-2-1-ui-design.md` | Ajustes UI 2.1 para una bitacora mas compacta y accionable en campo. |
| `2026-06-03-bitacora-archivos-metadatos-design.md` | Registro de archivos Video/Drone y estructura preparada para metadatos de Premiere. |
| `2026-06-04-checklist-rediseno-design.md` | Rediseño de `checklist.html` al sistema Dossier, video-first y con app de camara. |

## Planes en `docs/superpowers/plans`

| Documento | Que planea |
|---|---|
| `2026-06-03-admin-redesign-r37.md` | Implementacion del rediseño R37 del admin. |
| `2026-06-03-admin-ui-mejoras.md` | Mejoras visuales incrementales para admin: tokens, cards, toolbar, formularios y clientes. |
| `2026-06-03-v5-backend.md` | Backend V5: tokens de trabajo, estados, schema y portal de equipo ampliado. |
| `2026-06-03-v5-frontend.md` | Frontend V5 para admin/equipo con enfoque en trabajos y estados unificados. |
| `2026-06-03-bitacora-produccion.md` | Plan original para extraer motor testeable y reconstruir checklist como bitacora de produccion. |
| `2026-06-03-bitacora-produccion-2.md` | Plan Bitacora 2.0: logica TDD, UI rebuild y verificacion. |
| `2026-06-03-bitacora-produccion-2-1-ui.md` | Plan UI 2.1 para header compacto, vistas operativas y documentacion. |
| `2026-06-03-bitacora-archivos-metadatos.md` | Plan para secuencias de camara, archivos, descartes, conciliacion y export listo para metadatos. |
| `2026-06-04-checklist-rediseno-fase1.md` | Plan de rediseño fase 1 de checklist a Dossier, preservando backend y motor. |

## Planes historicos en `docs/plans`

| Documento | Que cubre |
|---|---|
| `2026-05-30-sistema-contratos-v4.md` | Plan base de construccion v4: Worker + D1 + Apps Script + frontend estatico. |
| `2026-05-30-fixes-ronda5.md` | Plan de fixes Ronda 5 para bugs de auditoria. |
| `2026-05-31-toggle-nombre-addons-globales.md` | Plan implementado para paquete/personalizado y add-ons globales. |
| `2026-06-01-rediseno-contratos-radar.md` | Plan R15 para rediseño de tab Contratos y radar de sesiones. |

## Diseño en `design/`

| Documento | Que contiene |
|---|---|
| `design/SPEC_REDISENO_IAV.md` | Spec maestro del rediseño Dossier para admin y portal. |
| `design/design-system.css` | Tokens y componentes base del sistema visual Dossier. |
| `design/B-dossier.html` | Mockup visual de referencia para el lenguaje "Dossier". |
| `design/BUILD_LOG.md` | Bitacora del rediseño, auditorias, decisiones y pendientes. |
| `design/KICKOFF.md` | Instrucciones de arranque para ejecutar el rediseño. |
| `design/mockups/captura-video.html` | Mockup especifico del flujo de captura de video. |

## Documentos maestros en raiz

| Documento | Que contiene |
|---|---|
| `MASTER_V4.md` | Fuente principal del sistema v4: arquitectura, URLs, deploy, DB, flujos y rondas. |
| `ARRANQUE.md` | Guia historica de setup inicial: Wrangler, D1, adapter, backup y dominio. |
| `MASTER_AUTOMATIZACION.md` | Vision del sistema de automatizacion WhatsApp, fases, tablas y dependencias externas. |
| `PLAN_UNIFICACION_V5.md` | Plan para unificar contratos y eliminar distinciones antiguas. |
| `IMPL_V5_2026-05-31.md` | Plan de implementacion de la unificacion v5. |
| `PROMPT_CONTINUIDAD.md` | Prompt para retomar el proyecto sin contexto previo. |

## Auditorias, reportes y prompts historicos

| Documento | Que contiene |
|---|---|
| `AUDITORIA-EXHAUSTIVA-v4.md` | Auditoria inicial exhaustiva de Worker, adapter, schema y frontend. |
| `REPORTE_AUDITORIA.md` | Verificacion de fixes y bugs posteriores. |
| `REPORTE_CAMBIOS.md` | Resumen de rondas de cambios y fixes aplicados. |
| `REPORTE_E2E_QA2.md` | Reporte E2E de produccion QA2, escenarios y hallazgos. |
| `.qa-e2e/REPORTE.md` | Reporte local de QA E2E; revisar con cuidado por posible data sensible asociada. |
| `PROMPT_DEEPSEEK_BUGS.md` | Prompt historico con bugs y cambios exactos para corregir. |
| `PROMPT_AUDITORIA_EXHAUSTIVA.md` | Prompt para auditar el sistema v4 completo. |
| `PROMPT_AUDITORIA_IMPL_V5.md` | Prompt para auditar la implementacion v5. |
| `PROMPT_AUDITORIA_PROSPECTOS.md` | Prompt de auditoria de feature Prospectos. |
| `PROMPT_AUDITORIA_V5.md` | Prompt para auditar `PLAN_UNIFICACION_V5.md`. |

## Archivos auxiliares

| Archivo | Nota |
|---|---|
| `migraciones-automatizacion.sh` | Script historico de migraciones D1 para automatizacion WhatsApp; no ejecutar sin revisar el estado real de D1. |
| `mockup-desktop.html` | Mockup suelto de escritorio para referencia visual. |
