# BUILD LOG — Rediseño IAV (admin + portal)

> Bitácora de ejecución. El ejecutor (Opus) la actualiza tras cada avance.
> Para retomar tras un reinicio de contexto: leer `design/SPEC_REDISENO_IAV.md` + `design/design-system.css` + `design/B-dossier.html` + este log + `MASTER_V4.md` (R58).

## Estado
- [~] Fase 0 — Cimientos (respaldos hechos; falta shell admin)
- [ ] Fase 1 — Admin (Hoy · Nuevo · Contratos+panel · Clientes · Ajustes)
- [x] Fase 2 — Backend (migración r58 APLICADA + config + dedupe + agendarLlamadaRapida + marcarActividad + archivos cliente + fix subida + adapter)
- [ ] Fase 3 — Portal
- [ ] Fase 4 — Integración + QA
- [ ] Fase 5 — Auditoría de bugs + resolución

## Preflight (2026-06-04)
- Commit base: `c710484`. admin.html 5,971 líneas, portal.html 2,788. wrangler autenticado.
- Ronda actual = R57. Migración nombrada **r58-rediseno.sql** (R57 ya tomada por la auditoría de checklist). Cumple "mínimo r57".

## Decisiones de orden
- Se ejecutó **Fase 2 (backend) ANTES del frontend** (Anexo I.1: backend/migración primero). La migración es la única razón de correr local, así que se priorizó y se aplicó de inmediato.
- Respaldos `admin-v4-backup.html` y `portal-v4-backup.html` creados en el primer paso.

## Fase 2 — completada (commit pendiente de push)
- **Migración r58 aplicada en D1 remoto** (verificado por PRAGMA: clientes +4 cols, actividades +2 cols, tabla config creada). `success:true`.
- `worker/schema.sql` actualizado para reflejar columnas nuevas.
- **config.js** (nuevo): `obtenerConfig` expone SOLO claves bancarias al portal; `obtenerConfigAdmin` y `guardarConfig` admin-only. Degrada con gracia (try/catch → defaults vacíos) si la tabla no existe.
- **clientes.js**: `buscarClientePorTelefono` (dedupe por teléfono normalizado a 10 dígitos); `actualizarCliente` ahora guarda `sinAnticipo/anticipoDefault/logoUrl` y soporta `_soloPreferencias`, con fallback al UPDATE básico si la migración está pendiente.
- **actividades.js**: `agendarLlamadaRapida` (atómico: dedupe → reusa trabajo abierto o crea → inserta actividad pendiente → Calendar async) y `marcarActividad` (estado=hecha + resultado).
- **archivos.js**: `subirArchivoCliente` + `listarArchivosCliente` (carpeta Drive por cliente, persiste `logo_url`/`carpeta_cliente_id`). **Fix de subida**: `subirArchivoAdmin` ahora cae a la carpeta del cliente cuando la del proyecto aún no existe, en vez de fallar duro; mejor manejo de error.
- **db.js**: `normalizarTel()` para dedupe (espejo de `normalizarTelWA`).
- **index.js**: registradas rutas RUTAS_CONFIG y nuevas acciones de archivos/actividades.
- Todos los archivos worker pasan `node --check`. Degradación con gracia (Anexo I.4-bis) implementada en config, clientes y actividades.

## Pendientes / avisos para Bruno
- **Adapter Apps Script — DESPLIEGUE MANUAL REQUERIDO:** pega `adapter/AdapterScript4_v1.js` en script.google.com y publica nueva versión. R58 agrega `subirArchivoCliente` y `listarArchivosCliente` (carpeta "Clientes/{nombre — id}" en Drive). Sin esto, subir/listar archivos de cliente devolverá error controlado (no rompe la app).
- Datos de prueba: si el ejecutor crea registros con clave `framedock` para QA, se eliminarán al final (Fase 5).
