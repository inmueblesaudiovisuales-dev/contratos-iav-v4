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
