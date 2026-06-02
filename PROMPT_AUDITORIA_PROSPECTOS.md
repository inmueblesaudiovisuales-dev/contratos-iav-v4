# Auditoría de bugs — Feature Prospectos (R32)

## Contexto del proyecto

Sistema de contratos IAV v4 sobre Cloudflare Workers + D1 (SQLite).
Repo GitHub: `https://github.com/inmueblesaudiovisuales-dev/contratos-iav-v4` (privado)
Rama de producción: `main`
Deploy automático: push a `main` → GitHub Actions → `wrangler deploy`

---

## Archivos relevantes de la feature

```
worker/src/routes/prospectos.js   ← ruta del worker (nueva)
worker/src/index.js               ← routing central
worker/src/google.js              ← callAdapter helper
worker/src/auth.js                ← requireAdmin, ok, err
worker/src/db.js                  ← query, run, uuid, now
frontend/admin.html               ← UI (todo en un solo archivo, ~5400 líneas)
```

---

## Bugs confirmados en producción

### BUG 1 — 500 en `listarProspectos` y `crearProspecto`

**Síntoma:** `GET /api/listarProspectos` devuelve 500. El worker tira error en runtime.

**Sospecha principal:** En `prospectos.js` línea 26:
```js
ctx.waitUntil(callAdapter(ctx, env, 'agendarLlamadaProspecto', { ... }));
```
`callAdapter` (en `google.js`) ya llama `ctx.waitUntil(promise)` internamente y devuelve `undefined`.
Entonces en `prospectos.js` se hace `ctx.waitUntil(undefined)` — esto puede tirar excepción en el runtime de Cloudflare Workers.

**Fix esperado:** Llamar `callAdapter` directamente sin envolverlo en `ctx.waitUntil`:
```js
callAdapter(ctx, env, 'agendarLlamadaProspecto', { ... });
```

**Verificar también:** Que la tabla `prospectos` exista en D1 remota. La migración fue:
```sql
CREATE TABLE IF NOT EXISTS prospectos (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  interes TEXT DEFAULT '',
  fecha_llamada TEXT NOT NULL,
  hora_llamada TEXT NOT NULL,
  notas TEXT DEFAULT '',
  estatus TEXT DEFAULT 'pendiente',
  fecha_creacion TEXT NOT NULL
)
```
Si la tabla no existe, el SELECT también tiraría 500. Confirmar con:
```bash
wrangler d1 execute contratos-iav-v4 --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name='prospectos'"
```

### BUG 2 — "Acción no encontrada" al agendar

**Síntoma:** Al hacer click en "Agendar llamada" en el frontend, el worker responde `{ error: 'Acción no encontrada' }`.

**Causa probable:** `apiPost` en `admin.html` construye el body y la URL de forma diferente a lo que espera el worker. Buscar la función `apiPost` en `admin.html` (~línea 2666) y verificar que mande la acción como parte del body JSON y no como query param, y que el campo se llame exactamente `action`.

El worker en `index.js` extrae la acción así:
```js
const action = path.replace('/api/', '');
```
Es decir, la acción va en el PATH (`/api/crearProspecto`), no en el body.

**Verificar:** Que `apiPost` llame `/api/crearProspecto` (acción en la URL) y no `/api/undefined` o `/api/` vacío.

Buscar en `admin.html` la función `crearProspecto()` y ver cómo llama a `apiPost`. El patrón correcto que usan otras features es:
```js
apiPost('crearContrato', { campo1: val1, ... })
// que resulta en: POST /api/crearContrato con body JSON
```

Si `crearProspecto()` llama `apiPost({ action: 'crearProspecto', ... })` en lugar de `apiPost('crearProspecto', { ... })`, eso causaría que la URL sea `/api/[object Object]` o `/api/undefined`.

---

## Cómo auditar

1. Leer `worker/src/routes/prospectos.js` completo
2. Leer `worker/src/google.js` — ver firma exacta de `callAdapter`
3. Leer `worker/src/index.js` — verificar routing de RUTAS_PROSPECTOS
4. En `frontend/admin.html` buscar:
   - función `apiPost` (cómo construye la URL y el body)
   - función `crearProspecto()` (cómo llama a apiPost)
   - función `cargarProspectos()` (cómo llama a apiGet)
5. Confirmar que la tabla existe en D1 con el comando wrangler de arriba

---

## Cómo aplicar fixes

1. Editar los archivos directamente en el repo
2. `git add <archivos>`
3. `git commit -m "R32 fix — descripción"`
4. `git push origin main`
5. GitHub Actions despliega automáticamente en ~1 minuto

**No correr `wrangler deploy` manualmente. El push a main es suficiente.**

Si la tabla no existe en D1, correr manualmente desde terminal:
```bash
wrangler d1 execute contratos-iav-v4 --remote --command="CREATE TABLE IF NOT EXISTS prospectos (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, telefono TEXT NOT NULL, interes TEXT DEFAULT '', fecha_llamada TEXT NOT NULL, hora_llamada TEXT NOT NULL, notas TEXT DEFAULT '', estatus TEXT DEFAULT 'pendiente', fecha_creacion TEXT NOT NULL)"
```

---

## Lo que NO tocar

- No modificar el flujo de contratos existente
- No cambiar el schema de otras tablas
- No tocar `adapter/AdapterScript4_v1.js` — el adapter ya tiene `agendarLlamadaProspecto` correctamente implementado
- No cambiar el diseño del frontend — solo corregir la lógica JS de `crearProspecto()` y `cargarProspectos()`
