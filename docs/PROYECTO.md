# El proyecto — IAV Contratos v4.0

> Qué es el sistema y cómo está organizado. Para arquitectura técnica ve `docs/ARQUITECTURA.md`.

## Qué es

Sistema de contratos de Inmuebles Audiovisuales reconstruido desde cero sobre Cloudflare.
El cambio central frente a v3 es **velocidad**: v3 (Google Apps Script + Sheets) tardaba 2-4 s
por operación (Apps Script frío); v4 responde en < 200 ms porque todas las operaciones de datos
van a **D1** (SQLite en el edge). Google sigue siendo el backend para carpetas de Drive,
calendario, correos y PDFs — pero se llama de forma **asíncrona**, el usuario no espera.

> El sistema anterior v3.0 sigue vivo en `inmueblesaudiovisuales.com`, sin cambios.

## URLs de producción

| Recurso | URL |
|--------|-----|
| Admin | `https://contratos.inmueblesaudiovisuales.com/admin.html` |
| Portal del cliente | `https://contratos.inmueblesaudiovisuales.com/portal.html?token=<token>` |
| Portal de equipo | `https://contratos.inmueblesaudiovisuales.com/equipo.html?token=<token>` |
| Checklist de rodaje | `https://contratos.inmueblesaudiovisuales.com/checklist.html?token=<token>` |
| Revisión de video | `https://contratos.inmueblesaudiovisuales.com/revision.html?token=<token>` |
| API base | `https://contratos.inmueblesaudiovisuales.com/api/<accion>` |

> Claves, IDs de D1 y URLs internas (adapter, Sheets): ver `docs/CREDENCIALES.md`.

## Repositorio

- **Repo:** `https://github.com/inmueblesaudiovisuales-dev/contratos-iav-v4` (privado)
- **Rama de producción:** `main`
- **Deploy:** GitHub Actions corre `wrangler deploy` al hacer push a `main` (~1 min). Los archivos de `frontend/` se publican como assets estáticos vía `.github/workflows/deploy.yml`.
- **Limitación conocida:** Claude Code on the Web no puede modificar archivos bajo `.github/workflows/` (restricción de scope OAuth).

## Diferencias clave con v3.0

| Aspecto | v3.0 | v4.0 |
|---------|------|------|
| Backend | Google Apps Script | Cloudflare Workers |
| Base de datos | Google Sheets | Cloudflare D1 (SQLite) |
| Velocidad | 2-4s (frío) | < 200ms |
| Routing | `?action=nombreAccion` | `/api/nombreAccion` |
| Auth admin | `?adminKey=...` | Header `X-Admin-Key: ...` |
| Campos DB | PascalCase (Sheets) | snake_case (D1) |
| Google services | Síncrono (bloquea) | Asíncrono (`ctx.waitUntil`) |
| PDF | Síncrono en la firma | Pendiente en PropertiesService, trigger separado |
| Backup | Sheets es la DB | Sheets es solo backup horario |

## Estructura de archivos

```
contratos-iav-v4/
├── CLAUDE.md                — punto de entrada (léelo primero)
├── MASTER_V4.md             — documento histórico congelado
├── docs/
│   ├── PROYECTO.md          — este archivo
│   ├── ARQUITECTURA.md      — referencia técnica
│   ├── CREDENCIALES.md      — claves e IDs (sensible)
│   ├── RONDAS.md            — historial de cambios
│   └── INDEX.md             — índice de specs/planes/reportes
├── adapter/
│   └── AdapterScript4_v1.js — Apps Script desplegado en script.google.com
├── frontend/
│   ├── admin.html           — panel de administración
│   ├── portal.html          — portal del cliente (firma, pagos, reseña, revisión)
│   ├── checklist.html       — bitácora de producción / checklist de rodaje
│   ├── checklist-logic.js   — lógica pura de la bitácora (con tests)
│   ├── equipo.html          — portal de equipo (solo lectura + estatus producción)
│   └── revision.html        — notas de revisión de video
└── worker/
    ├── wrangler.toml        — configuración del Worker
    ├── schema.sql           — estructura de D1 (referencia)
    ├── seed-paquetes.sql    — paquetes iniciales
    ├── migrations/          — migraciones D1 por ronda
    └── src/
        ├── index.js         — entry point, routing
        ├── auth.js          — requireAdmin(), ok(), err()
        ├── db.js            — helpers D1: query/queryOne/run/batch, normalizarTel
        ├── tokens.js        — tokens de portal/configurar
        ├── folios.js        — generación de folios "IAV-YYMM.DD-A"
        ├── google.js        — callAdapter() async, callAdapterSync()
        ├── cron.js          — syncToSheets() backup horario
        └── routes/          — contratos, portal, abonos, paquetes, stats,
                                checklist, archivos, revision, equipo,
                                clientes, trabajos, actividades, config
```

> **Archivos no productivos** (no forman parte del sistema vivo, no están en el mapa de relaciones):
> `frontend/admin-v4-backup.html` y `frontend/portal-v4-backup.html` (respaldos previos al rediseño),
> `frontend/chat.html` (mockup; ver `docs/CHAT_PRODUCCION.md` para su plan de productivización),
> `frontend/checklist-demo.js` (demo) y `frontend/checklist-logic.test.js` (tests de `checklist-logic.js`).
