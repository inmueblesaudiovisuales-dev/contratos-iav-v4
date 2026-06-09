# Credenciales y referencias internas

> ⚠️ **Documento sensible.** Contiene claves e identificadores reales. El repo es privado;
> aun así, no copies estos valores a documentos públicos, issues, PRs ni mensajes externos.

| Ítem | Valor |
|------|-------|
| Clave admin | `framedock` |
| Cloudflare account | `inmueblesaudiovisuales@gmail.com` |
| Worker name | `contratos-iav-v4` |
| D1 database | `contratos-iav-v4` |
| D1 database_id | `84ae26a8-5bbc-4cdc-ad39-ead4c6bc7500` |
| Apps Script URL | `https://script.google.com/macros/s/AKfycbwv6J6Mh-y31LYGdLBasL0bFDOloosEaiaLJDXH-TIF2-A_VpFUbh14I9zHt43LEfY/exec` |
| Sheets backup | `https://docs.google.com/spreadsheets/d/1YLscbVQJEm_SF77lfiZXyDHc0_gy543P5yitPX_KpnY` |

| Recurso | Referencia |
|--------|-----|
| Repo GitHub | `inmueblesaudiovisuales-dev/contratos-iav-v4` (privado) |
| GitHub Actions secret | `CLOUDFLARE_API_TOKEN` (configurado) |
| Auth admin en API | Header `X-Admin-Key: framedock` |

> Los datos bancarios que ve el cliente (CLABE/cuenta/tarjeta) **no** están aquí: viven en la
> tabla `config` de D1 (claves `pago_cuenta` / `pago_tarjeta`), editables desde Ajustes en el admin.

## Entrega (media: R2 + Stream) — R113

La galería de entrega (`entrega.html`) sirve las fotos desde R2 y el video desde Cloudflare Stream.

| Ítem | Valor / dónde |
|------|------|
| Bucket R2 (fotos) | `contratos-iav-media` (binding `MEDIA`) — crear: `wrangler r2 bucket create contratos-iav-media` |
| `CF_ACCOUNT_ID` | `0d0d6aaf107ae092f9fb5da06ddb338c` (en `[vars]` de wrangler.toml) |
| `STREAM_CUSTOMER_CODE` | subdominio de Stream para embeds (`customer-xxxx`) — llenar en `[vars]` tras crear Stream |
| `STREAM_TOKEN` | **secret** — `wrangler secret put STREAM_TOKEN` (API token con permiso `Stream:Edit`) |
| Image Transformations | habilitar en zona `inmueblesaudiovisuales.com` > Images > Transformations |

> Setup pendiente de Bruno (una sola vez): crear bucket R2, crear cuenta/token de Stream, poner
> `STREAM_CUSTOMER_CODE`, `wrangler secret put STREAM_TOKEN`, y activar Transformations.
