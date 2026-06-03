# Auditoría bugs — Feature Prospectos (R32)
## Para DeepSeek — leer TODO antes de tocar cualquier archivo

---

## Stack

- **Worker:** Cloudflare Workers (JavaScript ESM)
- **DB:** Cloudflare D1 (SQLite remoto)
- **Frontend:** `frontend/admin.html` (archivo único, ~5400 líneas)
- **Repo:** `https://github.com/inmueblesaudiovisuales-dev/contratos-iav-v4`
- **Rama producción:** `main` — push a main → GitHub Actions → wrangler deploy automático
- **NO correr `wrangler deploy` manualmente**

---

## Síntomas en producción

1. `GET /api/listarProspectos` → **500 Internal Server Error**
2. `POST /api/crearProspecto` → **500 Internal Server Error**
3. Al cambiar estatus desde el dropdown → **"Acción no encontrada"** (este puede estar ya corregido)

---

## Archivos de la feature — contenido actual en main

### `worker/src/routes/prospectos.js`
```js
import { query, run, uuid, now } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';
import { callAdapter } from '../google.js';

export async function handleProspectos(request, env, ctx, action) {
  const auth = requireAdmin(request, env);
  if (auth) return auth;

  const db = env.DB;

  if (action === 'crearProspecto') {
    const body = await request.json();
    const { nombre, telefono, interes, fechaLlamada, horaLlamada, notas } = body;
    if (!nombre || !telefono || !fechaLlamada || !horaLlamada)
      return err('nombre, telefono, fechaLlamada y horaLlamada son requeridos');

    const id = uuid();
    await run(db,
      `INSERT INTO prospectos (id, nombre, telefono, interes, fecha_llamada, hora_llamada, notas, estatus, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
      [id, nombre, telefono, interes || '', fechaLlamada, horaLlamada, notas || '', now()]
    );
    callAdapter(ctx, env, 'agendarLlamadaProspecto', {
      id, nombre, telefono, interes: interes || '', fechaLlamada, horaLlamada, notas: notas || ''
    });
    return ok({ ok: true, id });
  }

  if (action === 'listarProspectos') {
    const { results } = await query(db,
      `SELECT * FROM prospectos ORDER BY fecha_llamada DESC, hora_llamada DESC LIMIT 100`
    );
    return ok({ prospectos: results });
  }

  if (action === 'actualizarEstatusProspecto') {
    const body = await request.json();
    const { id, estatus } = body;
    const ESTATUSES = ['pendiente', 'contactado', 'convertido', 'descartado'];
    if (!id || !ESTATUSES.includes(estatus)) return err('id y estatus válido requeridos');
    await run(db, `UPDATE prospectos SET estatus=? WHERE id=?`, [estatus, id]);
    return ok({ ok: true });
  }

  return err('Acción no encontrada', 404);
}
```

### `worker/src/index.js` — partes relevantes
```js
import { handleProspectos } from './routes/prospectos.js';
// ...
const RUTAS_PROSPECTOS = ['crearProspecto','listarProspectos','actualizarEstatusProspecto'];
// ...
} else if (RUTAS_PROSPECTOS.includes(action)) {
  response = await handleProspectos(request, env, ctx, action);
}
```

### `worker/src/google.js` — callAdapter
```js
export function callAdapter(ctx, env, action, payload) {
  if (!env.APPS_SCRIPT_URL || env.APPS_SCRIPT_URL.includes('REEMPLAZAR')) return;
  const promise = fetch(env.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  }).catch(e => console.error('Google adapter error:', action, e.message));
  ctx.waitUntil(promise);
}
```

### `worker/src/db.js`
```js
export async function query(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return params.length ? stmt.bind(...params).all() : stmt.all();
}
export async function run(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return params.length ? stmt.bind(...params).run() : stmt.run();
}
export function uuid() { return crypto.randomUUID(); }
export function now() { return new Date().toISOString(); }
```

### `worker/src/auth.js`
```js
export function requireAdmin(request, env) {
  const key = request.headers.get('X-Admin-Key') ||
    new URL(request.url).searchParams.get('adminKey');
  if (key !== env.ADMIN_KEY) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }
  return null;
}
export function ok(data) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
}
export function err(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { 'Content-Type': 'application/json' }
  });
}
```

---

## Hipótesis principal — tabla no existe en D1 remota

El 500 en `listarProspectos` es casi seguramente porque la tabla `prospectos` no existe en la base de datos D1 remota de producción. El worker lanza excepción no capturada al intentar `SELECT * FROM prospectos` y Cloudflare devuelve 500.

**Verificar desde terminal de Bruno (Mac con wrangler instalado):**
```bash
wrangler d1 execute contratos-iav-v4 --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name='prospectos'"
```

Si el resultado está vacío → la tabla no existe → correr:
```bash
wrangler d1 execute contratos-iav-v4 --remote --command="CREATE TABLE IF NOT EXISTS prospectos (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, telefono TEXT NOT NULL, interes TEXT DEFAULT '', fecha_llamada TEXT NOT NULL, hora_llamada TEXT NOT NULL, notas TEXT DEFAULT '', estatus TEXT DEFAULT 'pendiente', fecha_creacion TEXT NOT NULL)"
```

**Este comando lo tiene que correr Bruno desde su Mac. No hay forma de hacerlo desde el worker ni desde GitHub Actions.**

---

## Si la tabla SÍ existe y el 500 persiste

Agregar manejo de errores explícito en `listarProspectos` y `crearProspecto` para que el worker devuelva el mensaje de error real en lugar de 500:

```js
if (action === 'listarProspectos') {
  try {
    const { results } = await query(db,
      `SELECT * FROM prospectos ORDER BY fecha_llamada DESC, hora_llamada DESC LIMIT 100`
    );
    return ok({ prospectos: results });
  } catch (e) {
    return err('DB error: ' + e.message, 500);
  }
}
```

Así en lugar de 500 opaco, el frontend mostrará el mensaje real del error de D1.

---

## Frontend — `frontend/admin.html`

Las llamadas a la API en el JS del frontend están correctas en el código actual de main:

```js
// correcto — apiPost espera { action, ...datos }
apiPost({ action:'crearProspecto', nombre, telefono, interes, fechaLlamada, horaLlamada, notas })
apiPost({ action:'actualizarEstatusProspecto', id, estatus })
apiGet({ action: 'listarProspectos' })
```

**No tocar el frontend** a menos que se encuentre un bug específico.

---

## Cómo aplicar fixes al worker

1. Editar `worker/src/routes/prospectos.js` en el repo
2. `git add worker/src/routes/prospectos.js`
3. `git commit -m "R32 fix — descripción"`
4. `git push origin main`
5. GitHub Actions despliega en ~1 minuto

**La migración D1 NO se puede hacer desde el repo — requiere que Bruno la corra desde su Mac con wrangler.**

---

## Lo que NO tocar

- Ningún otro archivo fuera de `worker/src/routes/prospectos.js`
- No cambiar el schema de otras tablas
- No modificar el frontend
- No tocar `adapter/AdapterScript4_v1.js`
