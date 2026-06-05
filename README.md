# Inmuebles Audiovisuales - Contratos IAV v4

Sistema de contratos y operacion para Inmuebles Audiovisuales, empresa de foto, video, drone y recorridos 360 para inmobiliarias en Monterrey. Este monorepo junta las apps web, el backend de Cloudflare Worker/D1 y el adapter de Google Apps Script porque esas piezas estan acopladas por contrato, token, Drive, Calendar, Gmail y despliegue. No dividir el repo salvo decision explicita de Bruno.

## Estructura del repo

| Ruta | Que vive ahi |
|---|---|
| `frontend/` | Apps web estaticas en HTML/CSS/JS vanilla. Cloudflare las sirve como assets del Worker. |
| `worker/` | Backend Cloudflare Worker. `src/index.js` enruta `/api/<accion>`, `src/routes/*` contiene handlers, `schema.sql`/`migrations/*.sql` documentan D1, `seed-paquetes.sql` carga catalogo inicial y `wrangler.toml` configura Worker, assets, D1, cron y ruta de produccion. |
| `adapter/` | `AdapterScript4_v1.js`, Google Apps Script sin UI. Recibe POST del Worker y maneja Drive, Calendar, Gmail, PDFs, archivos y backup a Sheets. No se despliega automatico; se pega/publica manualmente en Apps Script cuando cambia. |
| `design/` | Sistema visual "Dossier": specs, tokens CSS, mockup y bitacora del rediseño. Lenguaje: papel calido, onyx, dorado discreto, Fraunces/Inter/Spline Sans Mono, UI editorial limpia. |
| `docs/` | Specs, planes y handoffs de trabajo. Ver `docs/INDEX.md`. |
| `.github/workflows/deploy.yml` | Deploy automatico a Cloudflare Workers en cada push a `main`. |
| `.qa-e2e/` | Artefactos de QA E2E. Tratar cualquier token o dato de prueba como sensible. |
| `*.md` en raiz | Documentos maestros, auditorias, reportes y prompts historicos. `MASTER_V4.md` es el documento maestro del sistema. |

## Apps y URLs

Cloudflare Assets sirve las paginas sin extension y redirige `*.html` con 307 a la ruta corta. Confirmado en produccion para admin, portal, equipo, checklist, revision y chat.

| App | Archivo | URL de produccion | Que hace |
|---|---|---|---|
| Admin | `frontend/admin.html` | `https://contratos.inmueblesaudiovisuales.com/admin` | Panel interno para contratos, clientes, trabajos, sesiones, pagos, paquetes, configuracion bancaria/WhatsApp y acciones de produccion/entrega. |
| Portal cliente | `frontend/portal.html` | `https://contratos.inmueblesaudiovisuales.com/portal?token=<token>` | Portal mobile-first para revisar datos, elegir adicionales/formato, subir archivos, firmar, ver pagos, entrega y reseña. |
| Portal equipo | `frontend/equipo.html` | `https://contratos.inmueblesaudiovisuales.com/equipo?token=<token>` | Vista de campo/postproduccion para equipo: datos de sesion, acceso, links de Drive, entregables, notas y estatus de foto/video/recorrido. Enlaza al checklist. |
| Checklist / bitacora | `frontend/checklist.html` + `checklist-logic.js` + `checklist-demo.js` | `https://contratos.inmueblesaudiovisuales.com/checklist?token=<token>` | Bitacora de produccion en campo, video-first, con lanes Foto/360/Video/Drone, secuencias de camara, cierre, edicion y export JSON para metadatos. Tiene modo demo con `?demo=1`. |
| Revision | `frontend/revision.html` | `https://contratos.inmueblesaudiovisuales.com/revision?token=<token>` | Portal para que el cliente revise material y mande notas por minuto/segundo. |
| Chat | `frontend/chat.html` | `https://contratos.inmueblesaudiovisuales.com/chat` | Mockup semi-funcional de inbox WhatsApp con datos simulados; pendiente de endurecer/conectar para produccion. Ver `docs/CHAT_PRODUCCION.md`. |
| Respaldos | `frontend/*-backup.html` | No son apps activas principales | Copias de respaldo de versiones anteriores de admin/portal; conservar para referencia o recuperacion. |

## Backend y API

La API vive en `/api/<accion>`. `worker/src/index.js` separa todo lo que empieza con `/api/` de los assets estaticos y enruta por listas de acciones:

- `contratos.js`: listar, obtener, crear, estatus, upsell, entrega, recordatorios, CSV, reagendar, callbacks del adapter, ocultar/eliminar/reservar.
- `portal.js`: obtener portal, firma del cliente, reseña y configuracion legacy.
- `abonos.js`: registrar y listar pagos.
- `paquetes.js`: catalogo de paquetes y adicionales.
- `stats.js`: metricas.
- `checklist.js`: obtener/guardar bitacora.
- `archivos.js`: subida/listado de archivos de contrato y cliente.
- `revision.js`: obtener/guardar notas de revision de video.
- `equipo.js`: datos del portal de equipo y marcas de produccion.
- `clientes.js`, `trabajos.js`, `actividades.js`: CRM ligero, pipeline/trabajos, llamadas/notas.
- `config.js`: datos bancarios y plantillas de WhatsApp.

D1 es la base principal; Google sigue como integracion externa por medio del adapter. El cron de Cloudflare corre cada hora y llama `syncToSheets()` para respaldo hacia Sheets.

## Deploy

- Rama unica de produccion: `main`.
- Push a `main` dispara `.github/workflows/deploy.yml`.
- GitHub Actions usa `cloudflare/wrangler-action@v3` desde `worker/`.
- Cloudflare Worker `contratos-iav-v4` sirve API + assets en `contratos.inmueblesaudiovisuales.com`.
- Flujo normal: editar, commit, push a `main`. No correr `wrangler deploy` manualmente salvo instruccion explicita.
- Cambios al adapter no quedan activos con el push: requieren publicar nueva version en Google Apps Script.

## Desarrollo y pruebas locales

No hay build step para el frontend. Los HTML usan constantes de API apuntando a produccion, asi que cuidado: abrir admin/portal/equipo localmente puede hablar con datos reales.

Checklist en demo:

```bash
cd frontend
python3 -m http.server 8777
```

Abrir `http://127.0.0.1:8777/checklist.html?demo=1`. Tambien acepta pantallas como `&screen=captura`, `&screen=cierre` o `&screen=edicion`.

Tests del motor de checklist:

```bash
cd frontend
node --test
```

Worker local:

```bash
cd worker
npm install
npm run dev
```

Para operaciones D1 remotas o migraciones, revisar primero `worker/schema.sql`, `worker/migrations/*.sql`, `ARRANQUE.md` y `MASTER_V4.md`. No aplicar migraciones ni seeds en remoto sin una razon clara.

## Documentacion

Empieza por `MASTER_V4.md` para entender el sistema completo y luego usa `docs/INDEX.md` para encontrar specs, planes, handoffs, auditorias y documentos de diseño.

`docs/EXPORT_METADATA_HANDOFF.md` es el contrato actual para el programa externo que tomara el JSON exportado por checklist y escribira metadatos legibles por Premiere.

## Secretos y datos sensibles

No publicar secretos, tokens, IDs operativos ni datos de QA en README, docs nuevos o conversaciones. La operacion esperada es que claves como `ADMIN_KEY`, tokens de Cloudflare, URLs privadas del adapter y credenciales reales vivan como variables/secrets de Cloudflare, GitHub o Apps Script. Si encuentras valores historicos en config o documentos del repo, tratalos como sensibles: no los copies, no los pegues y no los uses como ejemplo.
