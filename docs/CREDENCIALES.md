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

## Entrega (media: Cloudflare Images + Stream) — R123

La galería de entrega (`entrega.html`) sirve las fotos desde **Cloudflare Images**
(imagedelivery.net) y el video desde **Cloudflare Stream**. Ambos vienen en el **Starter Bundle**
de Cloudflare (~$5/mes: Images + Stream + Transformations).

| Ítem | Valor / dónde |
|------|------|
| `CF_ACCOUNT_ID` | `0d0d6aaf107ae092f9fb5da06ddb338c` (en `[vars]` de wrangler.toml) |
| `STREAM_CUSTOMER_CODE` | subdominio de Stream para embeds (`customer-xxxx`) — llenar en `[vars]` |
| `CF_MEDIA_TOKEN` | **secret** — `wrangler secret put CF_MEDIA_TOKEN` (API token con `Stream:Edit` + `Cloudflare Images:Edit`). El Worker lo usa para subir fotos a Images y el video a Stream. |
| Images: variantes flexibles | habilitar una vez (URLs tipo `w=600,format=auto`). Ver setup. |
| Account hash de Images | se guarda solo en el manifiesto al subir la primera foto (no hay que copiarlo). |

> Setup pendiente de Bruno (una sola vez): comprar el Starter Bundle, crear el API token
> `CF_MEDIA_TOKEN` (`wrangler secret put CF_MEDIA_TOKEN`), poner `STREAM_CUSTOMER_CODE`, y
> habilitar variantes flexibles de Images. No hace falta bucket R2.
