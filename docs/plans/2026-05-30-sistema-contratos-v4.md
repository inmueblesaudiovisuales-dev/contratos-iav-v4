# Sistema Contratos v4.0 — Plan de Implementación

> **Para agentes de ejecución:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development o superpowers:executing-plans para implementar este plan tarea por tarea.

**Goal:** Construir una nueva versión del sistema de contratos de Inmuebles Audiovisuales en `contratos.inmueblesaudiovisuales.com` usando Cloudflare Workers + D1 como backend principal, con Apps Script como adaptador de servicios de Google y backup automático a Sheets cada hora.

**Architecture:** CF Worker sirve tanto los archivos HTML como los endpoints API en `contratos.inmueblesaudiovisuales.com`. D1 (SQLite) es la base de datos principal — todas las lecturas y escrituras van ahí. Las operaciones de Google (Drive, Calendar, Gmail, PDF) se delegan de forma asíncrona a un script de Apps Script usando `ctx.waitUntil()`, por lo que el usuario nunca espera esas operaciones. Un Cron Trigger de Cloudflare ejecuta un sync cada hora de D1 → Sheets como respaldo.

**Tech Stack:** Cloudflare Workers (Wrangler CLI), Cloudflare D1 (SQLite), Cloudflare Cron Triggers, Google Apps Script (solo servicios Google), Vanilla JS (frontend).

**Importante:** El sistema v3.0 NO se toca. Todo lo de esta versión es nuevo y completamente independiente.

---

## Estructura de archivos

```
06. VERSION 4.0/
├── worker/
│   ├── wrangler.toml          — config del Worker, D1 binding, cron, dominio
│   ├── package.json
│   ├── schema.sql             — schema completo de D1
│   ├── seed-paquetes.sql      — datos iniciales del catálogo
│   └── src/
│       ├── index.js           — entry point: routing, CORS, dispatch
│       ├── auth.js            — validación de adminKey y tokens
│       ├── db.js              — helpers de D1 (query, insert, update, batch)
│       ├── google.js          — llamadas async al adapter de Apps Script
│       ├── tokens.js          — generación y validación de tokens
│       ├── folios.js          — generación de folios IAV-YYMM.DD
│       ├── cron.js            — sync horario D1 → Sheets
│       └── routes/
│           ├── contratos.js   — listar, obtener, crear, actualizar, archivar, eliminar
│           ├── portal.js      — obtenerPortal, firmaCliente, guardarResena
│           ├── abonos.js      — registrarAbono, historial
│           ├── paquetes.js    — listar, crear, editar, toggle
│           ├── stats.js       — métricas por período
│           ├── checklist.js   — obtener y guardar checklist de rodaje
│           └── archivos.js    — subirArchivo (Drive via adapter)
├── adapter/
│   └── AdapterScript4_v1.js  — Apps Script: Drive, Calendar, Gmail, PDF
└── frontend/
    ├── admin.html
    ├── portal.html
    ├── configurar4.html
    └── checklist.html
```

---

## Errores conocidos de v3.0 que este plan previene explícitamente

1. **D1 no respeta FOREIGN KEYS** — `PRAGMA foreign_keys` es ignorado. Los DELETE en cascada deben ejecutarse manualmente con `db.batch()` en el orden correcto.
2. **Apps Script cold start** — resuelto: el Worker responde desde D1 sin tocar Apps Script en lecturas.
3. **Timezone bug en fechas** — strings de fecha sin hora se interpretan como UTC. Siempre guardar fechas como ISO con hora: `new Date().toISOString()`. Al parsear strings `YYYY-MM-DD`, agregar `T12:00:00` antes de construir un Date.
4. **Carpetas duplicadas en Drive** — el adapter busca por `carpetaControlId` antes de crear. Si el ID existe, no crea una nueva carpeta.
5. **Correo con anticipo incorrecto** — el porcentaje del anticipo siempre se calcula como `Math.round(anticipo / precioTotal * 100)`, nunca hardcodeado a 50%.

---

## Fase 1 — Infraestructura base

### Tarea 1: Inicializar proyecto Worker

**Archivos:**
- Crear: `worker/package.json`
- Crear: `worker/wrangler.toml`

- [ ] Instalar Wrangler globalmente si no está instalado:
```bash
npm install -g wrangler
wrangler --version
# Expected: wrangler 3.x.x
```

- [ ] Autenticar con Cloudflare:
```bash
wrangler login
# Abre el navegador. Iniciar sesión con la cuenta de Cloudflare de IAV.
```

- [ ] Crear el directorio del proyecto e inicializar:
```bash
cd "/Users/brunogutierrez/Documents/CLAUDE CODE/Inmuebles WEBSITE/02. contratos/06. VERSION 4.0/worker"
npm init -y
```

- [ ] Crear `worker/wrangler.toml`:
```toml
name = "contratos-iav-v4"
main = "src/index.js"
compatibility_date = "2024-01-01"

[assets]
directory = "../frontend"
binding = "ASSETS"

[[d1_databases]]
binding = "DB"
database_name = "contratos-iav-v4"
database_id = "REEMPLAZAR_CON_ID_REAL"

[vars]
ADMIN_KEY = "framedock"
APPS_SCRIPT_URL = "REEMPLAZAR_CON_URL_DEL_ADAPTER"

[[triggers]]
crons = ["0 * * * *"]

[routes]
pattern = "contratos.inmueblesaudiovisuales.com/*"
zone_name = "inmueblesaudiovisuales.com"
```

- [ ] Crear la base de datos D1:
```bash
wrangler d1 create contratos-iav-v4
# La salida incluye el database_id. Copiarlo y pegarlo en wrangler.toml en database_id.
```

- [ ] Commit:
```bash
git init
git add wrangler.toml package.json
git commit -m "feat: init worker project contratos v4"
```

---

### Tarea 2: Schema D1

**Archivos:**
- Crear: `worker/schema.sql`

- [ ] Crear `worker/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS contratos (
  token TEXT PRIMARY KEY,
  folio TEXT,
  nombre_cliente TEXT NOT NULL,
  correo_cliente TEXT,
  telefono_cliente TEXT,
  tipo_contrato TEXT NOT NULL DEFAULT 'estandar',
  tipo_paquete TEXT,
  paquete_base TEXT,
  adicionales_json TEXT DEFAULT '[]',
  precio_base REAL DEFAULT 0,
  precio_total REAL DEFAULT 0,
  anticipo REAL DEFAULT 0,
  saldo_pendiente REAL DEFAULT 0,
  estatus TEXT NOT NULL DEFAULT 'Pendiente firma',
  fecha_creacion TEXT NOT NULL,
  fecha_firma TEXT,
  fecha_ultimo_abono TEXT,
  fecha_entrega TEXT,
  firma_base64_url TEXT,
  entrega_drive_link TEXT,
  entrega_links_extra TEXT,
  num_propiedades INTEGER DEFAULT 1,
  pdf_contrato_url TEXT,
  notas_contrato TEXT,
  oculto INTEGER DEFAULT 0,
  notas_internas TEXT,
  sesion_completada TEXT,
  recordatorio_enviado TEXT,
  calificacion INTEGER,
  resena_texto TEXT,
  fotografia_lista TEXT,
  video_listo TEXT,
  recorrido_listo TEXT,
  recorrido_url TEXT,
  entrega_revocada TEXT
);

CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY,
  contrato_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  expira TEXT,
  usado INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS abonos (
  id TEXT PRIMARY KEY,
  contrato_token TEXT NOT NULL,
  monto REAL NOT NULL,
  metodo TEXT,
  fecha TEXT,
  fecha_registro TEXT NOT NULL,
  notas TEXT
);

CREATE TABLE IF NOT EXISTS propiedades (
  contrato_token TEXT NOT NULL,
  num_propiedad INTEGER NOT NULL,
  tipo TEXT,
  paquete TEXT,
  entregables TEXT,
  fecha_sesion TEXT,
  hora_sesion TEXT,
  direccion TEXT,
  link_maps TEXT,
  orientacion TEXT,
  sobre_la_propiedad TEXT,
  datos_especificos TEXT DEFAULT '{}',
  logo_url TEXT,
  carpeta_control_id TEXT,
  calendar_event_id TEXT,
  nota_interna TEXT,
  PRIMARY KEY (contrato_token, num_propiedad)
);

CREATE TABLE IF NOT EXISTS paquetes (
  clave TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  precio REAL NOT NULL,
  es_adicional INTEGER DEFAULT 0,
  entregables TEXT,
  activo INTEGER DEFAULT 1,
  orden INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS checklist (
  contrato_token TEXT PRIMARY KEY,
  cuartos_json TEXT DEFAULT '[]',
  fecha_creacion TEXT NOT NULL,
  fecha_actualizacion TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contratos_estatus ON contratos(estatus);
CREATE INDEX IF NOT EXISTS idx_contratos_oculto ON contratos(oculto);
CREATE INDEX IF NOT EXISTS idx_abonos_token ON abonos(contrato_token);
CREATE INDEX IF NOT EXISTS idx_propiedades_token ON propiedades(contrato_token);
CREATE INDEX IF NOT EXISTS idx_tokens_contrato ON tokens(contrato_id);
```

- [ ] Aplicar schema a D1 (remoto):
```bash
cd worker
wrangler d1 execute contratos-iav-v4 --remote --file=schema.sql
# Expected: Successfully executed N statements
```

- [ ] Verificar que las tablas existen:
```bash
wrangler d1 execute contratos-iav-v4 --remote --command="SELECT name FROM sqlite_master WHERE type='table'"
# Expected: contratos, tokens, abonos, propiedades, paquetes, checklist
```

- [ ] Commit:
```bash
git add schema.sql
git commit -m "feat: D1 schema v4"
```

---

### Tarea 3: Seed del catálogo de paquetes

**Archivos:**
- Crear: `worker/seed-paquetes.sql`

- [ ] Crear `worker/seed-paquetes.sql`:
```sql
INSERT OR REPLACE INTO paquetes VALUES
  ('RES-COMBO','Residencial','Paquete Residencial',4500,0,'Video cinemático con drone\nFotografía profesional\nRecorrido virtual 360\nEntrega en 5 días hábiles',1,1),
  ('TER-COMBO','Terreno','Paquete Terreno',4000,0,'Video cinemático con drone\nFotografía profesional\nReferencias de ubicación\nEntrega en 5 días hábiles',1,2),
  ('IND-FOTO','Residencial','Fotografía profesional',3000,0,'Fotografía profesional\nEntrega en 3 días hábiles',1,3),
  ('IND-VIDEO','Residencial','Video cinemático + Drone',3000,0,'Video cinemático con drone\nEntrega en 5 días hábiles',1,4),
  ('IND-360','Residencial','Recorrido virtual 360',3000,0,'Recorrido virtual 360\nEntrega en 3 días hábiles',1,5),
  ('ADD-COMOLLEGAR','Ambos','Video cómo llegar',1000,1,'Video de referencia de llegada al inmueble',1,10),
  ('ADD-LANDING','Ambos','Landing page',1200,1,'Página web individual del inmueble',1,11),
  ('ADD-FOLLETO','Ambos','Folleto digital PDF',800,1,'Folleto de una página para compartir',1,12),
  ('ADD-ASESOR','Ambos','Asesor en Video',500,1,'Aparición del asesor en el video',1,13),
  ('ADD-EXPRESS','Ambos','Entrega Express',1000,1,'Entrega en 48 horas',1,14);
```

- [ ] Ejecutar seed:
```bash
wrangler d1 execute contratos-iav-v4 --remote --file=seed-paquetes.sql
# Expected: Successfully executed 10 statements
```

- [ ] Verificar:
```bash
wrangler d1 execute contratos-iav-v4 --remote --command="SELECT clave, nombre, precio FROM paquetes ORDER BY orden"
# Expected: 10 filas con los paquetes del catálogo
```

- [ ] Commit:
```bash
git add seed-paquetes.sql
git commit -m "feat: seed catálogo paquetes v4"
```

---

## Fase 2 — Helpers del Worker

### Tarea 4: Helpers de base de datos (db.js)

**Archivos:**
- Crear: `worker/src/db.js`

- [ ] Crear `worker/src/db.js`:
```javascript
export async function query(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return params.length ? stmt.bind(...params).all() : stmt.all();
}

export async function queryOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const result = params.length ? await stmt.bind(...params).first() : await stmt.first();
  return result || null;
}

export async function run(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return params.length ? stmt.bind(...params).run() : stmt.run();
}

// D1 ignora PRAGMA foreign_keys — los cascades se ejecutan manualmente con batch
export async function batch(db, statements) {
  return db.batch(statements.map(({ sql, params = [] }) =>
    params.length ? db.prepare(sql).bind(...params) : db.prepare(sql)
  ));
}

export function uuid() {
  return crypto.randomUUID();
}

export function now() {
  return new Date().toISOString();
}

// Parsear fecha YYYY-MM-DD a noon local para evitar desfase UTC
export function parseFecha(str) {
  if (!str) return null;
  if (str.includes('T')) return new Date(str);
  return new Date(str + 'T12:00:00');
}
```

- [ ] Verificar sintaxis arrancando el dev server:
```bash
cd worker
wrangler dev --local
# Expected: Ready on http://localhost:8787 (sin errores de sintaxis)
# Ctrl+C para detener
```

- [ ] Commit:
```bash
git add src/db.js
git commit -m "feat: D1 query helpers"
```

---

### Tarea 5: Auth, tokens y folios

**Archivos:**
- Crear: `worker/src/auth.js`
- Crear: `worker/src/tokens.js`
- Crear: `worker/src/folios.js`

- [ ] Crear `worker/src/auth.js`:
```javascript
export function requireAdmin(request, env) {
  const key = request.headers.get('X-Admin-Key') ||
    new URL(request.url).searchParams.get('adminKey');
  if (key !== env.ADMIN_KEY) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return null;
}

export function ok(data) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function err(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

- [ ] Crear `worker/src/tokens.js`:
```javascript
import { queryOne, run, uuid, now } from './db.js';

export async function crearTokenPortal(db, contratoId, expiresHours = 72) {
  const token = uuid();
  const expira = new Date(Date.now() + expiresHours * 3600 * 1000).toISOString();
  await run(db,
    'INSERT INTO tokens (token, contrato_id, tipo, expira, usado) VALUES (?, ?, ?, ?, 0)',
    [token, contratoId, 'contrato', expira]
  );
  return token;
}

export async function crearTokenConfigurar(db, contratoId) {
  const token = uuid();
  const expira = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  await run(db,
    'INSERT INTO tokens (token, contrato_id, tipo, expira, usado) VALUES (?, ?, ?, ?, 0)',
    [token, contratoId, 'configurar', expira]
  );
  return token;
}

export async function validarToken(db, token, estatus) {
  const t = await queryOne(db, 'SELECT * FROM tokens WHERE token = ?', [token]);
  if (!t) return { error: 'Token no encontrado' };
  if (t.usado) return { error: 'Token ya utilizado' };
  if (estatus === 'Pendiente firma' && t.expira && new Date(t.expira) < new Date()) {
    return { error: 'Token expirado' };
  }
  return { token: t };
}

export async function refrescarExpiry(db, token, hours = 72) {
  const expira = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  await run(db, 'UPDATE tokens SET expira = ? WHERE token = ?', [expira, token]);
}

export async function marcarUsado(db, token) {
  await run(db, 'UPDATE tokens SET usado = 1 WHERE token = ?', [token]);
}
```

- [ ] Crear `worker/src/folios.js`:
```javascript
import { parseFecha } from './db.js';

export function generarFolio(fechaSesionStr) {
  const fecha = parseFecha(fechaSesionStr);
  const yy = String(fecha.getFullYear()).slice(-2);
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  return `IAV-${yy}${mm}.${dd}`;
}
```

- [ ] Verificar dev server sin errores:
```bash
wrangler dev --local
# Expected: Ready on http://localhost:8787
```

- [ ] Commit:
```bash
git add src/auth.js src/tokens.js src/folios.js
git commit -m "feat: auth, tokens, folios helpers"
```

---

### Tarea 6: Llamadas async al adapter de Google (google.js)

**Archivos:**
- Crear: `worker/src/google.js`

- [ ] Crear `worker/src/google.js`:
```javascript
// Llama al adapter de Apps Script de forma asíncrona (el usuario no espera)
export function callAdapter(ctx, env, action, payload) {
  if (!env.APPS_SCRIPT_URL || env.APPS_SCRIPT_URL === 'REEMPLAZAR_CON_URL_DEL_ADAPTER') return;
  const promise = fetch(env.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  }).catch(e => console.error('Google adapter error:', e));
  ctx.waitUntil(promise);
}

// Llama al adapter de forma síncrona y espera la respuesta
// Usar solo cuando el resultado es necesario para responder al usuario
export async function callAdapterSync(env, action, payload) {
  const res = await fetch(env.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  return res.json();
}
```

- [ ] Commit:
```bash
git add src/google.js
git commit -m "feat: google adapter caller con waitUntil"
```

---

## Fase 3 — Entry point y rutas de lectura

### Tarea 7: Entry point del Worker (index.js)

**Archivos:**
- Crear: `worker/src/index.js`

- [ ] Crear `worker/src/index.js`:
```javascript
import { handleContratos } from './routes/contratos.js';
import { handlePortal } from './routes/portal.js';
import { handleAbonos } from './routes/abonos.js';
import { handlePaquetes } from './routes/paquetes.js';
import { handleStats } from './routes/stats.js';
import { handleChecklist } from './routes/checklist.js';
import { handleArchivos } from './routes/archivos.js';
import { syncToSheets } from './cron.js';
import { err } from './auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key'
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Servir archivos estáticos del frontend
    if (!path.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    let response;
    const action = path.replace('/api/', '');

    if (['listarContratos','obtenerContrato','crearContrato','actualizarEstatus',
         'ocultarContrato','eliminarContrato','guardarNotasInternas','marcarSesionCompletada',
         'guardarProduccion','guardarEntrega','revocarEntrega','guardarCaracteristicas',
         'reagendarPropiedad','duplicarContrato','exportarCSV','enviarRecordatorio',
         'guardarNotaPropiedad'].includes(action)) {
      response = await handleContratos(request, env, ctx, action);
    } else if (['obtenerPortal','firmaCliente','guardarResena','guardarConfiguracion'].includes(action)) {
      response = await handlePortal(request, env, ctx, action);
    } else if (['registrarAbono','listarAbonos'].includes(action)) {
      response = await handleAbonos(request, env, ctx, action);
    } else if (['listarPaquetes','listarPaquetesTodos','crearPaquete','editarPaquete','togglePaquete'].includes(action)) {
      response = await handlePaquetes(request, env, ctx, action);
    } else if (action === 'listarStats') {
      response = await handleStats(request, env, ctx);
    } else if (['obtenerChecklist','guardarChecklist'].includes(action)) {
      response = await handleChecklist(request, env, ctx, action);
    } else if (['subirArchivo','subirArchivoAdmin'].includes(action)) {
      response = await handleArchivos(request, env, ctx, action);
    } else {
      response = err('Acción no encontrada', 404);
    }

    // Agregar headers CORS a todas las respuestas
    const headers = new Headers(response.headers);
    Object.entries(CORS).forEach(([k, v]) => headers.set(k, v));
    return new Response(response.body, { status: response.status, headers });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncToSheets(env));
  }
};
```

- [ ] Verificar que el dev server arranca sin errores (los módulos de rutas aún no existen, se crearán en tareas siguientes — el error esperado es de importación, no de sintaxis):
```bash
wrangler dev --local 2>&1 | head -20
```

- [ ] Commit:
```bash
git add src/index.js
git commit -m "feat: worker entry point con routing"
```

---

### Tarea 8: Rutas de paquetes

**Archivos:**
- Crear: `worker/src/routes/paquetes.js`

- [ ] Crear `worker/src/routes/paquetes.js`:
```javascript
import { query, queryOne, run, now } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';

export async function handlePaquetes(request, env, ctx, action) {
  const db = env.DB;

  if (action === 'listarPaquetes') {
    const tipo = new URL(request.url).searchParams.get('tipo') || '';
    let sql = 'SELECT * FROM paquetes WHERE activo = 1';
    const params = [];
    if (tipo) {
      sql += ' AND (tipo = ? OR tipo = \'Ambos\')';
      params.push(tipo);
    }
    sql += ' ORDER BY orden';
    const { results } = await query(db, sql, params);
    return ok(results);
  }

  if (action === 'listarPaquetesTodos') {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const { results } = await query(db, 'SELECT * FROM paquetes ORDER BY orden');
    return ok(results);
  }

  if (action === 'crearPaquete') {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const body = await request.json();
    const { clave, tipo, nombre, precio, esAdicional, entregables, orden } = body;
    if (!clave || !tipo || !nombre || precio == null) return err('Faltan campos requeridos');
    await run(db,
      'INSERT INTO paquetes (clave, tipo, nombre, precio, es_adicional, entregables, activo, orden) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
      [clave, tipo, nombre, precio, esAdicional ? 1 : 0, entregables || '', orden || 0]
    );
    return ok({ ok: true });
  }

  if (action === 'editarPaquete') {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const body = await request.json();
    const { clave, tipo, nombre, precio, esAdicional, entregables, orden } = body;
    await run(db,
      'UPDATE paquetes SET tipo=?, nombre=?, precio=?, es_adicional=?, entregables=?, orden=? WHERE clave=?',
      [tipo, nombre, precio, esAdicional ? 1 : 0, entregables || '', orden || 0, clave]
    );
    return ok({ ok: true });
  }

  if (action === 'togglePaquete') {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const { clave } = await request.json();
    const p = await queryOne(db, 'SELECT activo FROM paquetes WHERE clave = ?', [clave]);
    if (!p) return err('Paquete no encontrado');
    await run(db, 'UPDATE paquetes SET activo = ? WHERE clave = ?', [p.activo ? 0 : 1, clave]);
    return ok({ ok: true });
  }

  return err('Acción no encontrada', 404);
}
```

- [ ] Probar en dev local — crear archivo de stub para que el server arranque (se completan las demás rutas en tareas siguientes):
```bash
# Crear stubs temporales para que el dev server arrange
mkdir -p worker/src/routes
for f in contratos portal abonos stats checklist archivos; do
  echo "export async function handle$(echo $f | sed 's/./\u&/') () { return new Response('stub') }" \
    > "worker/src/routes/${f}.js"
done
echo "export async function syncToSheets() {}" > worker/src/cron.js
wrangler dev --local &
sleep 3
curl -s http://localhost:8787/api/listarPaquetes | head -c 200
# Expected: array JSON con los 10 paquetes del catálogo (si D1 local tiene datos)
kill %1
```

- [ ] Commit:
```bash
git add src/routes/paquetes.js
git commit -m "feat: endpoints de paquetes"
```

---

### Tarea 9: Rutas de contratos — lecturas

**Archivos:**
- Modificar: `worker/src/routes/contratos.js` (reemplaza el stub)

- [ ] Crear `worker/src/routes/contratos.js` (solo las acciones de lectura por ahora):
```javascript
import { query, queryOne, run, batch, uuid, now, parseFecha } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';
import { callAdapter } from '../google.js';
import { generarFolio } from '../folios.js';
import { crearTokenPortal, crearTokenConfigurar } from '../tokens.js';

export async function handleContratos(request, env, ctx, action) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;

  if (action === 'listarContratos') {
    const url = new URL(request.url);
    const periodo = url.searchParams.get('periodo') || 'abiertos';
    const { results: contratos } = await query(db,
      `SELECT c.*, GROUP_CONCAT(p.fecha_sesion) as fechas_sesion,
              GROUP_CONCAT(p.hora_sesion) as horas_sesion,
              GROUP_CONCAT(p.direccion) as direcciones
       FROM contratos c
       LEFT JOIN propiedades p ON p.contrato_token = c.token
       WHERE c.oculto = 0
       GROUP BY c.token
       ORDER BY c.fecha_creacion DESC`
    );

    const estatusAbiertos = ['Pendiente firma','Firmado','Anticipo recibido','En produccion','Entregado'];
    const lista = periodo === 'abiertos'
      ? contratos.filter(c => estatusAbiertos.includes(c.estatus))
      : contratos;

    return ok(lista);
  }

  if (action === 'obtenerContrato') {
    const token = new URL(request.url).searchParams.get('token');
    if (!token) return err('Token requerido');
    const contrato = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [token]);
    if (!contrato) return err('Contrato no encontrado', 404);
    const { results: propiedades } = await query(db,
      'SELECT * FROM propiedades WHERE contrato_token = ? ORDER BY num_propiedad', [token]);
    const { results: abonos } = await query(db,
      'SELECT * FROM abonos WHERE contrato_token = ? ORDER BY fecha_registro', [token]);
    return ok({ ...contrato, propiedades, abonos });
  }

  if (action === 'exportarCSV') {
    const { results } = await query(db,
      `SELECT c.token, c.folio, c.nombre_cliente, c.correo_cliente, c.telefono_cliente,
              c.paquete_base, c.precio_total, c.anticipo, c.saldo_pendiente, c.estatus,
              c.fecha_creacion
       FROM contratos c WHERE c.oculto = 0 ORDER BY c.fecha_creacion DESC`
    );
    const header = 'Token,Folio,Cliente,Correo,Telefono,Paquete,Total,Anticipo,Saldo,Estatus,Fecha\n';
    const rows = results.map(r =>
      [r.token, r.folio, r.nombre_cliente, r.correo_cliente, r.telefono_cliente,
       r.paquete_base, r.precio_total, r.anticipo, r.saldo_pendiente, r.estatus, r.fecha_creacion]
      .map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    return new Response(header + rows, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="contratos-v4.csv"'
      }
    });
  }

  // Las acciones de escritura se agregan en la Tarea 11
  return err('Acción no encontrada', 404);
}
```

- [ ] Verificar en dev:
```bash
wrangler dev --local &
sleep 3
curl -s "http://localhost:8787/api/listarContratos?adminKey=framedock" | python3 -m json.tool
# Expected: {"results": []} (vacío porque no hay contratos aún — correcto)
kill %1
```

- [ ] Commit:
```bash
git add src/routes/contratos.js
git commit -m "feat: listarContratos, obtenerContrato, exportarCSV"
```

---

### Tarea 10: Ruta del portal — lectura

**Archivos:**
- Modificar: `worker/src/routes/portal.js` (reemplaza el stub)

- [ ] Crear `worker/src/routes/portal.js` (solo obtenerPortal por ahora):
```javascript
import { queryOne, query } from '../db.js';
import { validarToken } from '../tokens.js';
import { ok, err } from '../auth.js';

export async function handlePortal(request, env, ctx, action) {
  const db = env.DB;
  const url = new URL(request.url);

  if (action === 'obtenerPortal') {
    const token = url.searchParams.get('token');
    if (!token) return err('Token requerido');

    // El token de portal ES el UUID del contrato
    const contrato = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [token]);

    // Si no existe como contrato, buscar en tokens (token de configurar)
    let contratoFinal = contrato;
    if (!contrato) {
      const tk = await queryOne(db, 'SELECT * FROM tokens WHERE token = ?', [token]);
      if (!tk) return err('Token no encontrado', 404);
      if (tk.usado) return err('Token ya utilizado', 403);
      if (tk.expira && new Date(tk.expira) < new Date()) return err('Token expirado', 403);
      contratoFinal = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [tk.contrato_id]);
      if (!contratoFinal) return err('Contrato no encontrado', 404);
    }

    // Validar expiración solo si está pendiente de firma
    if (contratoFinal.estatus === 'Pendiente firma') {
      // El token de portal expira en 72h antes de firmar
      // Verificar en tabla tokens si hay un registro con expiración
      const tkPortal = await queryOne(db,
        'SELECT * FROM tokens WHERE contrato_id = ? AND tipo = \'contrato\' ORDER BY rowid DESC LIMIT 1',
        [contratoFinal.token]
      );
      if (tkPortal && tkPortal.expira && new Date(tkPortal.expira) < new Date()) {
        return err('El enlace ha expirado. Solicita un nuevo enlace a Bruno.', 403);
      }
    }

    const { results: propiedades } = await query(db,
      'SELECT * FROM propiedades WHERE contrato_token = ? ORDER BY num_propiedad',
      [contratoFinal.token]
    );

    // Paquetes disponibles (add-ons ofrecidos al cliente)
    const adicionales = JSON.parse(contratoFinal.adicionales_json || '[]');
    const ofertasStrings = adicionales.filter(i => typeof i === 'string');
    const acordados = adicionales.filter(i => typeof i === 'object');

    let paquetesDisponibles = [];
    if (ofertasStrings.length > 0) {
      const placeholders = ofertasStrings.map(() => '?').join(',');
      const { results } = await query(db,
        `SELECT * FROM paquetes WHERE clave IN (${placeholders}) AND activo = 1`,
        ofertasStrings
      );
      paquetesDisponibles = results;
    } else if (acordados.length === 0) {
      // Sin selección de Bruno: mostrar todos los add-ons del tipo
      const tipo = contratoFinal.tipo_paquete || '';
      const { results } = await query(db,
        'SELECT * FROM paquetes WHERE es_adicional = 1 AND activo = 1 AND (tipo = ? OR tipo = \'Ambos\') ORDER BY orden',
        [tipo]
      );
      paquetesDisponibles = results;
    }

    const extrasAcordados = acordados.map(i => ({
      nombre: i.nombre || i.clave,
      precio: i.precio || 0
    }));

    return ok({
      token: contratoFinal.token,
      folio: contratoFinal.folio,
      nombreCliente: contratoFinal.nombre_cliente,
      correoCliente: contratoFinal.correo_cliente,
      telefonoCliente: contratoFinal.telefono_cliente,
      tipoContrato: contratoFinal.tipo_contrato,
      tipoPaquete: contratoFinal.tipo_paquete,
      paqueteBase: contratoFinal.paquete_base,
      precioBase: contratoFinal.precio_base,
      precioTotal: contratoFinal.precio_total,
      anticipo: contratoFinal.anticipo,
      saldoPendiente: contratoFinal.saldo_pendiente,
      estatus: contratoFinal.estatus,
      fechaFirma: contratoFinal.fecha_firma,
      pdfContratoUrl: contratoFinal.pdf_contrato_url,
      notasContrato: contratoFinal.notas_contrato,
      entregaDriveLink: contratoFinal.entrega_drive_link,
      entregaLinksExtra: contratoFinal.entrega_links_extra,
      entregaRevocada: contratoFinal.entrega_revocada,
      calificacion: contratoFinal.calificacion,
      resenaTexto: contratoFinal.resena_texto,
      propiedades: propiedades.map(p => ({
        numPropiedad: p.num_propiedad,
        tipo: p.tipo,
        paquete: p.paquete,
        entregables: p.entregables,
        fechaSesion: p.fecha_sesion,
        horaSesion: p.hora_sesion,
        direccion: p.direccion,
        linkMaps: p.link_maps,
        orientacion: p.orientacion,
        sobreLaPropiedad: p.sobre_la_propiedad,
        datosEspecificos: JSON.parse(p.datos_especificos || '{}'),
        logoUrl: p.logo_url,
        carpetaControlId: p.carpeta_control_id
      })),
      paquetesDisponibles,
      extrasAcordados
    });
  }

  // firmaCliente y guardarResena se agregan en Tarea 12
  return err('Acción no encontrada', 404);
}
```

- [ ] Commit:
```bash
git add src/routes/portal.js
git commit -m "feat: obtenerPortal endpoint"
```

---

## Fase 4 — Escrituras y operaciones de negocio

### Tarea 11: Crear contrato y acciones de admin

**Archivos:**
- Modificar: `worker/src/routes/contratos.js` (agregar escrituras al final, antes del return de error)

- [ ] Agregar al final de `handleContratos`, antes del `return err('Acción no encontrada')`:

```javascript
  if (action === 'crearContrato') {
    const body = await request.json();
    const { nombreCliente, correoCliente, telefonoCliente, tipoContrato,
            tipoPaquete, paqueteBase, adicionales, extrasAcordados,
            precioTotal, anticipo, notasContrato, numPropiedades,
            propiedades: propsData, fechaSesion } = body;

    if (!nombreCliente) return err('Nombre del cliente requerido');

    const token = uuid();
    const fechaCreacion = now();
    const saldoPendiente = precioTotal - anticipo;

    // Calcular precio base desde catálogo
    const paquete = await queryOne(db, 'SELECT precio FROM paquetes WHERE clave = ?', [paqueteBase || '']);
    const precioBase = paquete ? paquete.precio : precioTotal;

    // Combinar adicionales ofrecidos (strings) con extras acordados (objetos)
    const adicionalesOfrecidos = (adicionales || []).filter(Boolean);
    const extrasObjs = (extrasAcordados || []).map(e =>
      e.clave ? { clave: e.clave, precio: e.precio } : { nombre: e.nombre, precio: e.precio }
    );
    const adicionalesJSON = JSON.stringify([...adicionalesOfrecidos, ...extrasObjs]);

    // Generar folio
    let folio = null;
    if (tipoContrato === 'estandar' && fechaSesion) {
      folio = generarFolio(fechaSesion);
    }

    await run(db,
      `INSERT INTO contratos (token, folio, nombre_cliente, correo_cliente, telefono_cliente,
        tipo_contrato, tipo_paquete, paquete_base, adicionales_json, precio_base, precio_total,
        anticipo, saldo_pendiente, estatus, fecha_creacion, num_propiedades, notas_contrato)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente firma', ?, ?, ?)`,
      [token, folio, nombreCliente, correoCliente || '', telefonoCliente || '',
       tipoContrato || 'estandar', tipoPaquete || '', paqueteBase || '',
       adicionalesJSON, precioBase, precioTotal, anticipo, saldoPendiente,
       fechaCreacion, numPropiedades || 1, notasContrato || '']
    );

    // Guardar propiedades si vienen (contrato estándar)
    if (propsData && propsData.length > 0) {
      for (const p of propsData) {
        await run(db,
          `INSERT INTO propiedades (contrato_token, num_propiedad, tipo, paquete, entregables,
            fecha_sesion, hora_sesion, direccion, link_maps, orientacion, sobre_la_propiedad,
            datos_especificos)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [token, p.numPropiedad, p.tipo || tipoPaquete, p.paquete || paqueteBase,
           p.entregables || '', p.fechaSesion || fechaSesion || '', p.horaSesion || '',
           p.direccion || '', p.linkMaps || '', p.orientacion || '',
           p.sobreLaPropiedad || '', JSON.stringify(p.datosEspecificos || {})]
        );
      }
    }

    // Token de portal (72h antes de firmar, permanente después)
    await crearTokenPortal(db, token, 72);

    const esParticular = tipoContrato === 'particular';
    const linkPortal = `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`;
    const linkConfigurar = esParticular
      ? `https://contratos.inmueblesaudiovisuales.com/configurar4.html?token=${await crearTokenConfigurar(db, token)}`
      : null;

    // Notificar a Bruno por correo (async, el usuario no espera)
    callAdapter(ctx, env, 'notificarContratoCreado', {
      nombreCliente, correoCliente, folio, linkPortal
    });

    return ok({ token, folio, linkPortal, linkConfigurar });
  }

  if (action === 'actualizarEstatus') {
    const { token, estatus } = await request.json();
    await run(db, 'UPDATE contratos SET estatus = ? WHERE token = ?', [estatus, token]);
    return ok({ ok: true });
  }

  if (action === 'marcarSesionCompletada') {
    const { token } = await request.json();
    const c = await queryOne(db, 'SELECT estatus FROM contratos WHERE token = ?', [token]);
    if (!c) return err('Contrato no encontrado', 404);
    const permitidos = ['Firmado', 'Anticipo recibido', 'En produccion'];
    if (!permitidos.includes(c.estatus)) return err('Estatus no permite esta acción');
    await run(db,
      'UPDATE contratos SET estatus = \'En produccion\', sesion_completada = ? WHERE token = ?',
      [now(), token]
    );
    return ok({ ok: true });
  }

  if (action === 'guardarNotasInternas') {
    const { token, notas } = await request.json();
    await run(db, 'UPDATE contratos SET notas_internas = ? WHERE token = ?', [notas, token]);
    return ok({ ok: true });
  }

  if (action === 'guardarProduccion') {
    const { token, fotografiaLista, videoListo, recorridoListo, recorridoUrl } = await request.json();
    await run(db,
      'UPDATE contratos SET fotografia_lista=?, video_listo=?, recorrido_listo=?, recorrido_url=? WHERE token=?',
      [fotografiaLista || null, videoListo || null, recorridoListo || null, recorridoUrl || '', token]
    );
    return ok({ ok: true });
  }

  if (action === 'guardarEntrega') {
    const { token, entregaDriveLink, entregaLinksExtra } = await request.json();
    const c = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [token]);
    if (!c) return err('Contrato no encontrado', 404);
    await run(db,
      'UPDATE contratos SET entrega_drive_link=?, entrega_links_extra=?, estatus=\'Entregado\', fecha_entrega=? WHERE token=?',
      [entregaDriveLink, entregaLinksExtra || '', now(), token]
    );
    // Notificar cliente por correo (async)
    callAdapter(ctx, env, 'enviarCorreoEntrega', {
      token, nombreCliente: c.nombre_cliente, correoCliente: c.correo_cliente,
      folio: c.folio, linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`
    });
    return ok({ ok: true });
  }

  if (action === 'revocarEntrega') {
    const { token, revocar } = await request.json();
    await run(db,
      'UPDATE contratos SET entrega_revocada = ? WHERE token = ?',
      [revocar ? now() : null, token]
    );
    return ok({ ok: true });
  }

  if (action === 'guardarCaracteristicas') {
    const { token, numPropiedad, sobreLaPropiedad } = await request.json();
    await run(db,
      'UPDATE propiedades SET sobre_la_propiedad = ? WHERE contrato_token = ? AND num_propiedad = ?',
      [sobreLaPropiedad, token, numPropiedad]
    );
    return ok({ ok: true });
  }

  if (action === 'guardarNotaPropiedad') {
    const { token, numPropiedad, nota } = await request.json();
    await run(db,
      'UPDATE propiedades SET nota_interna = ? WHERE contrato_token = ? AND num_propiedad = ?',
      [nota, token, numPropiedad]
    );
    return ok({ ok: true });
  }

  if (action === 'ocultarContrato') {
    const { token } = await request.json();
    await run(db, 'UPDATE contratos SET oculto = 1 WHERE token = ?', [token]);
    return ok({ ok: true });
  }

  if (action === 'eliminarContrato') {
    const { token } = await request.json();
    // D1 no respeta FOREIGN KEYS — eliminar en cascada manualmente con batch
    await batch(db, [
      { sql: 'DELETE FROM checklist WHERE contrato_token = ?', params: [token] },
      { sql: 'DELETE FROM propiedades WHERE contrato_token = ?', params: [token] },
      { sql: 'DELETE FROM abonos WHERE contrato_token = ?', params: [token] },
      { sql: 'DELETE FROM tokens WHERE contrato_id = ?', params: [token] },
      { sql: 'DELETE FROM contratos WHERE token = ?', params: [token] }
    ]);
    return ok({ ok: true });
  }

  if (action === 'reagendarPropiedad') {
    const { token, numPropiedad, fecha, hora } = await request.json();
    if (!token || !numPropiedad || !fecha) return err('Faltan campos requeridos');
    const c = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [token]);
    if (!c) return err('Contrato no encontrado', 404);
    const p = await queryOne(db,
      'SELECT * FROM propiedades WHERE contrato_token = ? AND num_propiedad = ?', [token, numPropiedad]);
    if (!p) return err('Propiedad no encontrada', 404);
    await run(db,
      'UPDATE propiedades SET fecha_sesion = ?, hora_sesion = ? WHERE contrato_token = ? AND num_propiedad = ?',
      [fecha, hora || p.hora_sesion, token, numPropiedad]
    );
    // Actualizar evento en Calendar y mandar correo (async)
    callAdapter(ctx, env, 'reagendarPropiedad', {
      token, numPropiedad, fecha, hora, contrato: c, propiedad: p
    });
    return ok({ ok: true });
  }

  if (action === 'enviarRecordatorio') {
    const { token } = await request.json();
    const c = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [token]);
    if (!c) return err('Contrato no encontrado', 404);
    callAdapter(ctx, env, 'enviarRecordatorioPago', {
      token, nombreCliente: c.nombre_cliente, correoCliente: c.correo_cliente,
      folio: c.folio, saldoPendiente: c.saldo_pendiente,
      linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`
    });
    return ok({ ok: true });
  }
```

- [ ] Commit:
```bash
git add src/routes/contratos.js
git commit -m "feat: endpoints de escritura de contratos"
```

---

### Tarea 12: Firma del cliente y reseña

**Archivos:**
- Modificar: `worker/src/routes/portal.js` (agregar firmaCliente y guardarResena)

- [ ] Agregar a `handlePortal`, antes del `return err` final:

```javascript
  if (action === 'firmaCliente') {
    const body = await request.json();
    const { token, firmaBase64, adicionales: adicionalesSeleccionados,
            propiedades: propsCliente } = body;

    const contrato = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [token]);
    if (!contrato) return err('Contrato no encontrado', 404);
    if (contrato.estatus !== 'Pendiente firma') return err('El contrato no está pendiente de firma');

    // Calcular precio total con add-ons seleccionados por el cliente
    let precioTotal = contrato.precio_base;
    const adicionalesExistentes = JSON.parse(contrato.adicionales_json || '[]');
    const acordados = adicionalesExistentes.filter(i => typeof i === 'object');
    const precioAcordados = acordados.reduce((s, i) => s + (i.precio || 0), 0);

    let adicionalesAceptados = [];
    if (contrato.tipo_contrato !== 'particular' && adicionalesSeleccionados) {
      for (const clave of adicionalesSeleccionados) {
        const p = await queryOne(db, 'SELECT * FROM paquetes WHERE clave = ?', [clave]);
        if (p) {
          precioTotal += p.precio;
          adicionalesAceptados.push(clave);
        }
      }
    }
    precioTotal += precioAcordados;

    // Preservar anticipo original si no hubo add-ons nuevos del cliente
    const anticipo = contrato.anticipo;
    const saldoPendiente = precioTotal - anticipo;

    // Determinar estatus (si precio=0, saltar a En produccion)
    const nuevoEstatus = precioTotal === 0 ? 'En produccion' : 'Firmado';

    // Actualizar contratos con los add-ons aceptados
    const nuevoAdicionales = [...acordados, ...adicionalesAceptados];
    await run(db,
      `UPDATE contratos SET estatus = ?, fecha_firma = ?, precio_total = ?,
       saldo_pendiente = ?, adicionales_json = ?, firma_base64_url = 'pending'
       WHERE token = ?`,
      [nuevoEstatus, now(), precioTotal, saldoPendiente,
       JSON.stringify(nuevoAdicionales), token]
    );

    // Actualizar propiedades con lo que llenó el cliente
    if (propsCliente) {
      for (const p of propsCliente) {
        await run(db,
          `UPDATE propiedades SET direccion=?, link_maps=?, orientacion=?,
           sobre_la_propiedad=?, datos_especificos=?, logo_url=?
           WHERE contrato_token=? AND num_propiedad=?`,
          [p.direccion || '', p.linkMaps || '', p.orientacion || '',
           p.sobreLaPropiedad || '', JSON.stringify(p.datosEspecificos || {}),
           p.logoUrl || '', token, p.numPropiedad]
        );
      }
    }

    // Delegar a Apps Script: guardar firma en Drive, generar PDF, enviar correo (async)
    callAdapter(ctx, env, 'procesarFirma', {
      token,
      firmaBase64,
      contrato: { ...contrato, precioTotal, saldoPendiente, estatus: nuevoEstatus },
      linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`
    });

    return ok({ ok: true, estatus: nuevoEstatus });
  }

  if (action === 'guardarResena') {
    const { token, calificacion, resenaTexto } = await request.json();
    await run(db,
      'UPDATE contratos SET calificacion = ?, resena_texto = ? WHERE token = ?',
      [calificacion, resenaTexto || '', token]
    );
    // Notificar a Bruno (async)
    callAdapter(ctx, env, 'notificarResena', { token, calificacion, resenaTexto });
    return ok({ ok: true });
  }

  if (action === 'guardarConfiguracion') {
    const { token: tkStr, propiedades: propsData } = await request.json();
    // token puede ser un token de configurar
    const tk = await queryOne(db, 'SELECT * FROM tokens WHERE token = ? AND tipo = \'configurar\'', [tkStr]);
    if (!tk) return err('Token de configuración no válido', 403);
    if (tk.usado) return err('Este enlace ya fue utilizado', 403);

    const contratoToken = tk.contrato_id;
    const contrato = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [contratoToken]);
    if (!contrato) return err('Contrato no encontrado', 404);

    // Eliminar propiedades previas e insertar nuevas
    await run(db, 'DELETE FROM propiedades WHERE contrato_token = ?', [contratoToken]);
    for (const p of propsData) {
      await run(db,
        `INSERT INTO propiedades (contrato_token, num_propiedad, tipo, paquete, entregables,
          fecha_sesion, hora_sesion, datos_especificos)
         VALUES (?, ?, ?, ?, ?, ?, ?, '{}')`,
        [contratoToken, p.numPropiedad, p.tipo, p.paquete, p.entregables || '',
         p.fechaSesion, p.horaSesion || '']
      );
    }

    // Generar folio desde la primera propiedad
    const primeraFecha = propsData[0]?.fechaSesion;
    const folio = primeraFecha ? generarFolio(primeraFecha) : contrato.folio;
    await run(db, 'UPDATE contratos SET folio = ? WHERE token = ?', [folio, contratoToken]);

    // Marcar token como usado y refrescar token del portal a 72h
    await run(db, 'UPDATE tokens SET usado = 1 WHERE token = ?', [tkStr]);
    await run(db,
      'UPDATE tokens SET expira = ? WHERE contrato_id = ? AND tipo = \'contrato\'',
      [new Date(Date.now() + 72 * 3600 * 1000).toISOString(), contratoToken]
    );

    const linkPortal = `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${contratoToken}`;
    return ok({ ok: true, linkPortal, folio });
  }
```

- [ ] Commit:
```bash
git add src/routes/portal.js
git commit -m "feat: firmaCliente, guardarResena, guardarConfiguracion"
```

---

### Tarea 13: Abonos y registro de pago

**Archivos:**
- Modificar: `worker/src/routes/abonos.js` (reemplaza el stub)

- [ ] Crear `worker/src/routes/abonos.js`:
```javascript
import { query, queryOne, run, uuid, now } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';
import { callAdapter } from '../google.js';

export async function handleAbonos(request, env, ctx, action) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;

  if (action === 'registrarAbono') {
    const body = await request.json();
    const { token, monto, metodo, fecha, notas } = body;
    if (!token || !monto) return err('Token y monto requeridos');

    const contrato = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [token]);
    if (!contrato) return err('Contrato no encontrado', 404);

    const { results: abonosPrevios } = await query(db,
      'SELECT id FROM abonos WHERE contrato_token = ?', [token]);
    const esPrimerAbono = abonosPrevios.length === 0;

    await run(db,
      'INSERT INTO abonos (id, contrato_token, monto, metodo, fecha, fecha_registro, notas) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuid(), token, monto, metodo || '', fecha || now().slice(0, 10), now(), notas || '']
    );

    const nuevoSaldo = Math.max(0, contrato.saldo_pendiente - monto);
    const nuevoEstatus = nuevoSaldo === 0 ? 'Liquidado' : 'Anticipo recibido';
    await run(db,
      'UPDATE contratos SET saldo_pendiente = ?, estatus = ?, fecha_ultimo_abono = ? WHERE token = ?',
      [nuevoSaldo, nuevoEstatus, now(), token]
    );

    // Enviar correo de confirmación al cliente (async — primero, antes de operaciones de Drive)
    callAdapter(ctx, env, 'enviarCorreoAbono', {
      token, nombreCliente: contrato.nombre_cliente, correoCliente: contrato.correo_cliente,
      folio: contrato.folio, monto, nuevoSaldo,
      anticipo: contrato.anticipo, precioTotal: contrato.precio_total,
      linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`
    });

    if (esPrimerAbono) {
      // Obtener propiedades para crear carpeta y evento
      const { results: propiedades } = await query(db,
        'SELECT * FROM propiedades WHERE contrato_token = ? ORDER BY num_propiedad', [token]);
      // Crear carpeta Drive, evento Calendar (async)
      callAdapter(ctx, env, 'primerAbono', {
        token, contrato, propiedades, folio: contrato.folio
      });
    }

    return ok({ ok: true, nuevoSaldo, estatus: nuevoEstatus });
  }

  if (action === 'listarAbonos') {
    const token = new URL(request.url).searchParams.get('token');
    const { results } = await query(db,
      'SELECT * FROM abonos WHERE contrato_token = ? ORDER BY fecha_registro', [token]);
    return ok(results);
  }

  return err('Acción no encontrada', 404);
}
```

- [ ] Commit:
```bash
git add src/routes/abonos.js
git commit -m "feat: registrarAbono con async Drive/Calendar"
```

---

### Tarea 14: Stats, checklist y archivos

**Archivos:**
- Modificar: `worker/src/routes/stats.js`
- Modificar: `worker/src/routes/checklist.js`
- Modificar: `worker/src/routes/archivos.js`

- [ ] Crear `worker/src/routes/stats.js`:
```javascript
import { query } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';
import { parseFecha } from '../db.js';

export async function handleStats(request, env, ctx) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;

  const periodo = new URL(request.url).searchParams.get('periodo') || 'mes';
  const ahora = new Date();
  let desde;
  if (periodo === 'mes') desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  else if (periodo === 'trimestre') desde = new Date(ahora.getFullYear(), Math.floor(ahora.getMonth() / 3) * 3, 1);
  else if (periodo === 'anio') desde = new Date(ahora.getFullYear(), 0, 1);
  else desde = new Date('2000-01-01');
  const desdeStr = desde.toISOString();

  const { results: contratos } = await query(db,
    'SELECT * FROM contratos WHERE oculto = 0 AND fecha_creacion >= ?', [desdeStr]);
  const { results: abonos } = await query(db,
    'SELECT * FROM abonos WHERE fecha_registro >= ?', [desdeStr]);

  const facturado = contratos.reduce((s, c) => s + (c.precio_total || 0), 0);
  const cobrado = abonos.reduce((s, a) => s + (a.monto || 0), 0);
  const porCobrar = contratos.reduce((s, c) => s + (c.saldo_pendiente || 0), 0);
  const ticketPromedio = contratos.length ? facturado / contratos.length : 0;

  const porEstatus = {};
  contratos.forEach(c => { porEstatus[c.estatus] = (porEstatus[c.estatus] || 0) + 1; });

  // Top 5 clientes
  const clienteMap = {};
  contratos.forEach(c => {
    if (!clienteMap[c.nombre_cliente]) clienteMap[c.nombre_cliente] = { contratos: 0, total: 0 };
    clienteMap[c.nombre_cliente].contratos++;
    clienteMap[c.nombre_cliente].total += c.precio_total || 0;
  });
  const topClientes = Object.entries(clienteMap)
    .map(([nombre, v]) => ({ nombre, ...v }))
    .sort((a, b) => b.total - a.total).slice(0, 5);

  // Facturación últimos 6 meses
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    meses.push({ mes: key, total: 0 });
  }
  contratos.forEach(c => {
    const key = (c.fecha_creacion || '').slice(0, 7);
    const m = meses.find(m => m.mes === key);
    if (m) m.total += c.precio_total || 0;
  });

  return ok({ facturado, cobrado, porCobrar, ticketPromedio, porEstatus, topClientes, meses });
}
```

- [ ] Crear `worker/src/routes/checklist.js`:
```javascript
import { queryOne, run, now } from '../db.js';
import { ok, err } from '../auth.js';

const TEMPLATE_CUARTOS = JSON.stringify([
  { nombre: 'Sala', items: ['Encendido', 'Limpio', 'Sin personas'] },
  { nombre: 'Comedor', items: ['Encendido', 'Limpio', 'Sin personas'] },
  { nombre: 'Cocina', items: ['Encendido', 'Limpio', 'Sin personas'] },
  { nombre: 'Recámara principal', items: ['Encendido', 'Limpio', 'Sin personas'] },
  { nombre: 'Baño', items: ['Encendido', 'Limpio', 'Sin personas'] },
  { nombre: 'Exterior', items: ['Iluminación', 'Limpio'] }
]);

export async function handleChecklist(request, env, ctx, action) {
  const db = env.DB;
  const token = new URL(request.url).searchParams.get('token') ||
    (request.method === 'POST' ? (await request.clone().json()).token : null);

  if (!token) return err('Token requerido');

  // Auth: el token de contrato es suficiente — no requiere adminKey
  const contrato = await queryOne(db, 'SELECT token FROM contratos WHERE token = ?', [token]);
  if (!contrato) return err('Contrato no válido', 403);

  if (action === 'obtenerChecklist') {
    const row = await queryOne(db, 'SELECT * FROM checklist WHERE contrato_token = ?', [token]);
    if (!row) return ok({ token, cuartos: JSON.parse(TEMPLATE_CUARTOS), esTemplate: true });
    return ok({ token, cuartos: JSON.parse(row.cuartos_json), esTemplate: false });
  }

  if (action === 'guardarChecklist') {
    const body = await request.json();
    const cuartos = JSON.stringify(body.cuartos || []);
    const existe = await queryOne(db, 'SELECT contrato_token FROM checklist WHERE contrato_token = ?', [token]);
    if (existe) {
      await run(db, 'UPDATE checklist SET cuartos_json = ?, fecha_actualizacion = ? WHERE contrato_token = ?',
        [cuartos, now(), token]);
    } else {
      await run(db, 'INSERT INTO checklist (contrato_token, cuartos_json, fecha_creacion, fecha_actualizacion) VALUES (?, ?, ?, ?)',
        [token, cuartos, now(), now()]);
    }
    return ok({ ok: true });
  }

  return err('Acción no encontrada', 404);
}
```

- [ ] Crear `worker/src/routes/archivos.js`:
```javascript
import { queryOne } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';
import { callAdapterSync } from '../google.js';

export async function handleArchivos(request, env, ctx, action) {
  const db = env.DB;
  const body = await request.json();
  const { token, base64, mimeType, nombre, numPropiedad } = body;

  if (action === 'subirArchivo') {
    // Sin adminKey: lo llama el portal del cliente
    const contrato = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [token]);
    if (!contrato) return err('Contrato no encontrado', 404);
    // Delegar subida a Drive via adapter (síncrono — necesitamos la URL)
    const result = await callAdapterSync(env, 'subirArchivo', {
      token, base64, mimeType, nombre, numPropiedad
    });
    return ok(result);
  }

  if (action === 'subirArchivoAdmin') {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const prop = await queryOne(db,
      'SELECT carpeta_control_id FROM propiedades WHERE contrato_token = ? AND num_propiedad = ?',
      [token, numPropiedad || 1]);
    if (!prop?.carpeta_control_id) return err('La carpeta del proyecto aún no existe. Registra el primer abono primero.');
    const result = await callAdapterSync(env, 'subirArchivoAdmin', {
      carpetaId: prop.carpeta_control_id, base64, mimeType, nombre
    });
    return ok(result);
  }

  return err('Acción no encontrada', 404);
}
```

- [ ] Commit:
```bash
git add src/routes/stats.js src/routes/checklist.js src/routes/archivos.js
git commit -m "feat: stats, checklist, archivos endpoints"
```

---

## Fase 5 — Cron de backup y cron de recordatorios

### Tarea 15: Sync horario D1 → Sheets

**Archivos:**
- Modificar: `worker/src/cron.js` (reemplaza el stub)

- [ ] Crear `worker/src/cron.js`:
```javascript
import { query } from './db.js';

export async function syncToSheets(env) {
  if (!env.APPS_SCRIPT_URL || env.APPS_SCRIPT_URL.includes('REEMPLAZAR')) return;

  const db = env.DB;
  const [contratos, abonos, propiedades, paquetes] = await Promise.all([
    query(db, 'SELECT * FROM contratos ORDER BY fecha_creacion DESC'),
    query(db, 'SELECT * FROM abonos ORDER BY fecha_registro DESC'),
    query(db, 'SELECT * FROM propiedades ORDER BY contrato_token, num_propiedad'),
    query(db, 'SELECT * FROM paquetes ORDER BY orden')
  ]);

  await fetch(env.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'syncBackup',
      data: {
        contratos: contratos.results,
        abonos: abonos.results,
        propiedades: propiedades.results,
        paquetes: paquetes.results
      }
    })
  });
}
```

- [ ] Commit:
```bash
git add src/cron.js
git commit -m "feat: cron sync D1 a Sheets cada hora"
```

---

## Fase 6 — Apps Script adapter

### Tarea 16: Apps Script adapter (servicios Google)

**Archivos:**
- Crear: `adapter/AdapterScript4_v1.js`

Este archivo reemplaza al `ScriptContratos3_v1.js` pero con una sola responsabilidad: servicios de Google. No toca Sheets excepto en el sync de backup.

- [ ] Crear `adapter/AdapterScript4_v1.js` con la estructura base y las funciones de Google:

```javascript
// AdapterScript4_v1.js — Google Services Adapter para IAV Contratos v4.0
// Solo recibe POST desde Cloudflare Workers. No tiene UI propia.

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = {
  CARPETA_PROYECTOS_ID: '1PRZeVQr6cEgjkrso6eBPf9BA6dbv8XU3',
  TEMPLATE_CONTRATO_ID: '11NGZ2Tdxh3E2PdNAtuZ07EkOL9fu7w_KCHhXym8kwU4',
  TEMPLATE_RESIDENCIAL_ID: '1IoZ2dL_WoAlmDdQI2PuhUtYVujRknptwBUVD_ZJQH5A',
  TEMPLATE_TERRENO_ID: '1hNPqSLQq4br26LlUR4-Zc_lqZGxYl9-o6E-gk-uNo64',
  EMAIL_BRUNO: 'inmueblesaudiovisuales@gmail.com',
  WHATSAPP: 'https://wa.me/5218127174207',
  CLIP_LINK: 'https://linkdenegocio.mx/@inmueblesaudiovisuales/pagar',
  BANAMEX_CLABE: '002580905411451243',
  BANAMEX_CUENTA: '1145124',
  BANAMEX_TARJETA: '5544 9206 0686 5310',
  TITULAR: 'Bruno Gutierrez Salazar',
  // Sheets de backup v4
  SHEETS_ID: 'REEMPLAZAR_CON_ID_SHEETS_V4',
  ADMIN_KEY: 'framedock'
};

// ============================================================
// ENTRY POINT
// ============================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const handlers = {
      procesarFirma,
      primerAbono,
      enviarCorreoAbono,
      enviarCorreoEntrega,
      reagendarPropiedad,
      subirArchivo,
      subirArchivoAdmin,
      notificarContratoCreado,
      notificarResena,
      enviarRecordatorioPago,
      recordatorio24h,
      syncBackup
    };
    if (!handlers[action]) return jsonResp({ error: 'Acción no reconocida' });
    const result = handlers[action](body);
    return jsonResp(result || { ok: true });
  } catch (err) {
    console.error('Adapter error:', err.message, err.stack);
    return jsonResp({ error: err.message });
  }
}

function jsonResp(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// PROCESSAR FIRMA — guarda PNG en Drive, genera PDF, envía correo
// ============================================================
function procesarFirma(body) {
  const { token, firmaBase64, contrato, linkPortal } = body;
  const carpetaFirmas = obtenerOCrearCarpetaFirmas_();
  const blob = Utilities.newBlob(
    Utilities.base64Decode(firmaBase64.replace(/^data:image\/\w+;base64,/, '')),
    'image/png', `firma-${token}.png`
  );
  const archFirma = carpetaFirmas.createFile(blob);
  archFirma.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Generar PDF diferido vía trigger
  PropertiesService.getScriptProperties().setProperty(
    `pendiente_pdf_${token}`, JSON.stringify({ token, firmaId: archFirma.getId(), contrato, linkPortal })
  );

  // Notificar a Bruno
  GmailApp.sendEmail(CONFIG.EMAIL_BRUNO,
    `Contrato firmado — ${contrato.folio || token}`,
    `${contrato.nombre_cliente} firmó el contrato.\nVer portal: ${linkPortal}`
  );
}

// ============================================================
// PRIMER ABONO — crea carpeta en Drive y evento en Calendar
// ============================================================
function primerAbono(body) {
  const { token, contrato, propiedades, folio } = body;

  // Crear estructura de carpetas en Drive
  const carpetaProyectos = DriveApp.getFolderById(CONFIG.CARPETA_PROYECTOS_ID);
  const nombreCarpeta = `${folio} — ${contrato.nombre_cliente}`;
  const carpetaProyecto = carpetaProyectos.createFolder(nombreCarpeta);
  const carpetaControl = carpetaProyecto.createFolder('Control Interno');
  const carpetaEntregables = carpetaProyecto.createFolder('Entregables');

  // Notificar al Worker para guardar el ID (via Properties como puente)
  // El Worker debe consultar el ID después — o usamos un approach directo:
  // Guardar el ID en Properties para que el Worker lo consulte en la próxima operación
  PropertiesService.getScriptProperties().setProperty(
    `carpeta_${token}_1`, carpetaControl.getId()
  );

  // Crear evento en Calendar para cada propiedad
  for (const prop of propiedades) {
    if (!prop.fecha_sesion) continue;
    const fecha = parseFecha_(prop.fecha_sesion);
    const [h, m] = (prop.hora_sesion || '09:00').split(':').map(Number);
    fecha.setHours(h, m, 0);
    const fin = new Date(fecha.getTime() + 2 * 3600 * 1000);
    const evento = CalendarApp.getDefaultCalendar().createEvent(
      `${folio} — Sesión ${contrato.nombre_cliente}`,
      fecha, fin,
      { description: `Dirección: ${prop.direccion || ''}\nCliente: ${contrato.nombre_cliente}` }
    );
    PropertiesService.getScriptProperties().setProperty(
      `cal_${token}_${prop.num_propiedad}`, evento.getId()
    );
  }

  // Generar referencias desde template Slides
  try {
    const templateId = contrato.tipo_paquete === 'Terreno'
      ? CONFIG.TEMPLATE_TERRENO_ID : CONFIG.TEMPLATE_RESIDENCIAL_ID;
    const copia = DriveApp.getFileById(templateId).makeCopy(
      `Referencias — ${folio}`, carpetaControl
    );
  } catch(e) {
    console.error('Error generando referencias:', e.message);
  }
}

// ============================================================
// ENVIAR CORREO DE ABONO
// ============================================================
function enviarCorreoAbono(body) {
  const { correoCliente, nombreCliente, folio, monto, nuevoSaldo,
          anticipo, precioTotal, linkPortal } = body;
  if (!correoCliente) return;
  const porcentaje = Math.round(anticipo / precioTotal * 100);
  const asunto = `Confirmación de pago — ${folio}`;
  const cuerpo = `Hola ${nombreCliente},\n\n` +
    `Confirmamos la recepción de tu pago por $${monto.toLocaleString('es-MX')} MXN.\n\n` +
    `Anticipo acordado (${porcentaje}%): $${anticipo.toLocaleString('es-MX')} MXN\n` +
    `Saldo pendiente: $${nuevoSaldo.toLocaleString('es-MX')} MXN\n\n` +
    `Puedes ver el estado de tu contrato en:\n${linkPortal}\n\n` +
    `Inmuebles Audiovisuales`;
  GmailApp.sendEmail(correoCliente, asunto, cuerpo);
}

// ============================================================
// ENVIAR CORREO DE ENTREGA
// ============================================================
function enviarCorreoEntrega(body) {
  const { correoCliente, nombreCliente, folio, linkPortal } = body;
  if (!correoCliente) return;
  GmailApp.sendEmail(correoCliente,
    `Tu material está listo — ${folio}`,
    `Hola ${nombreCliente},\n\nTu material audiovisual ya está disponible para descarga.\n\n${linkPortal}\n\nInmuebles Audiovisuales`
  );
}

// ============================================================
// REAGENDAR PROPIEDAD — actualiza Calendar y envía correo
// ============================================================
function reagendarPropiedad(body) {
  const { token, numPropiedad, fecha, hora, contrato, propiedad } = body;
  const calId = PropertiesService.getScriptProperties().getProperty(`cal_${token}_${numPropiedad}`);
  if (calId) {
    try {
      const evento = CalendarApp.getEventById(calId);
      if (evento) {
        const nuevaFecha = parseFecha_(fecha);
        const [h, m] = (hora || '09:00').split(':').map(Number);
        nuevaFecha.setHours(h, m, 0);
        const fin = new Date(nuevaFecha.getTime() + 2 * 3600 * 1000);
        evento.setTime(nuevaFecha, fin);
      }
    } catch(e) { console.error('Error actualizando Calendar:', e.message); }
  }
  if (contrato.correo_cliente) {
    GmailApp.sendEmail(contrato.correo_cliente,
      `Reagendamiento de sesión — ${contrato.folio}`,
      `Hola ${contrato.nombre_cliente},\n\nTu sesión ha sido reagendada para el ${fecha} a las ${hora || ''}.\n\nInmuebles Audiovisuales`
    );
  }
}

// ============================================================
// SUBIR ARCHIVO (portal del cliente)
// ============================================================
function subirArchivo(body) {
  const { token, base64, mimeType, nombre } = body;
  const carpetaId = PropertiesService.getScriptProperties().getProperty(`carpeta_${token}_1`);
  if (!carpetaId) return { error: 'Carpeta no encontrada' };
  const carpeta = DriveApp.getFolderById(carpetaId);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, nombre);
  const archivo = carpeta.createFile(blob);
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: archivo.getUrl() };
}

// ============================================================
// SUBIR ARCHIVO (admin)
// ============================================================
function subirArchivoAdmin(body) {
  const { carpetaId, base64, mimeType, nombre } = body;
  const carpeta = DriveApp.getFolderById(carpetaId);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, nombre);
  const archivo = carpeta.createFile(blob);
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: archivo.getUrl() };
}

// ============================================================
// NOTIFICACIONES
// ============================================================
function notificarContratoCreado(body) {
  const { nombreCliente, folio, linkPortal } = body;
  GmailApp.sendEmail(CONFIG.EMAIL_BRUNO,
    `Nuevo contrato creado — ${folio || nombreCliente}`,
    `Se creó un nuevo contrato para ${nombreCliente}.\nPortal: ${linkPortal}`
  );
}

function notificarResena(body) {
  const { token, calificacion, resenaTexto } = body;
  GmailApp.sendEmail(CONFIG.EMAIL_BRUNO,
    `Nueva reseña — ${calificacion}/5 estrellas`,
    `Token: ${token}\nCalificación: ${calificacion}/5\n\n${resenaTexto || ''}`
  );
}

function enviarRecordatorioPago(body) {
  const { correoCliente, nombreCliente, folio, saldoPendiente, linkPortal } = body;
  if (!correoCliente) return;
  GmailApp.sendEmail(correoCliente,
    `Recordatorio de pago — ${folio}`,
    `Hola ${nombreCliente},\n\nTienes un saldo pendiente de $${saldoPendiente.toLocaleString('es-MX')} MXN.\n\n${linkPortal}\n\nInmuebles Audiovisuales`
  );
}

// ============================================================
// RECORDATORIO 24H — trigger horario
// ============================================================
function recordatorio24h() {
  // Esta función se ejecuta via trigger horario en Apps Script
  // Consulta al Worker por contratos con sesión mañana
  // (El Worker expone un endpoint interno para esto — ver Tarea 17)
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const mananaStr = manana.toISOString().slice(0, 10);

  const resp = UrlFetchApp.fetch(
    `https://contratos.inmueblesaudiovisuales.com/api/sesionesManana?fecha=${mananaStr}&adminKey=${CONFIG.ADMIN_KEY}`
  );
  const sesiones = JSON.parse(resp.getContentText());
  for (const s of (sesiones || [])) {
    if (s.recordatorio_enviado === mananaStr) continue;
    GmailApp.sendEmail(s.correo_cliente,
      `Recordatorio — Tu sesión es mañana`,
      `Hola ${s.nombre_cliente},\n\nRecuerda que tu sesión es mañana ${mananaStr} a las ${s.hora_sesion || ''}.\n\nDirección: ${s.direccion || ''}\n\nInmuebles Audiovisuales`
    );
    // Marcar como enviado via Worker
    UrlFetchApp.fetch('https://contratos.inmueblesaudiovisuales.com/api/marcarRecordatorio', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ token: s.token, fecha: mananaStr, adminKey: CONFIG.ADMIN_KEY })
    });
  }
}

// ============================================================
// SYNC BACKUP — sobreescribe Sheets con datos de D1
// ============================================================
function syncBackup(body) {
  const { data } = body;
  const ss = SpreadsheetApp.openById(CONFIG.SHEETS_ID);

  function syncHoja(nombreHoja, filas, headers) {
    let hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) hoja = ss.insertSheet(nombreHoja);
    hoja.clearContents();
    if (!filas || filas.length === 0) {
      hoja.getRange(1, 1, 1, headers.length).setValues([headers]);
      return;
    }
    const rows = [headers, ...filas.map(r => headers.map(h => r[h] ?? ''))];
    hoja.getRange(1, 1, rows.length, headers.length).setValues(rows);
  }

  syncHoja('Contratos4', data.contratos, [
    'token','folio','nombre_cliente','correo_cliente','telefono_cliente',
    'tipo_contrato','tipo_paquete','paquete_base','precio_total','anticipo',
    'saldo_pendiente','estatus','fecha_creacion','fecha_firma','fecha_entrega','oculto'
  ]);
  syncHoja('Abonos4', data.abonos, [
    'id','contrato_token','monto','metodo','fecha','fecha_registro','notas'
  ]);
  syncHoja('Propiedades4', data.propiedades, [
    'contrato_token','num_propiedad','tipo','paquete','fecha_sesion','hora_sesion',
    'direccion','nombre_cliente'
  ]);
  syncHoja('Paquetes4', data.paquetes, [
    'clave','tipo','nombre','precio','es_adicional','activo','orden'
  ]);
}

// ============================================================
// HELPERS INTERNOS
// ============================================================
function parseFecha_(str) {
  if (!str) return new Date();
  if (str.includes('T')) return new Date(str);
  return new Date(str + 'T12:00:00');
}

function obtenerOCrearCarpetaFirmas_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('CARPETA_FIRMAS_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch(e) {}
  }
  const carpeta = DriveApp.getRootFolder().createFolder('IAV — Firmas Pendientes v4');
  props.setProperty('CARPETA_FIRMAS_ID', carpeta.getId());
  return carpeta;
}
```

- [ ] En Apps Script: crear nuevo proyecto > pegar este código > Implementar > Nueva implementación > Web app > Ejecutar como yo > Cualquier usuario > Implementar. Copiar la URL del deployment.

- [ ] Pegar la URL del adapter en `wrangler.toml` en `APPS_SCRIPT_URL`.

- [ ] Commit:
```bash
git add adapter/AdapterScript4_v1.js
git commit -m "feat: Apps Script adapter Google services"
```

---

## Fase 7 — Endpoints auxiliares y deploy

### Tarea 17: Endpoints de recordatorio y deploy inicial

**Archivos:**
- Modificar: `worker/src/index.js` (agregar 2 rutas auxiliares)
- Modificar: `worker/src/routes/contratos.js` (agregar sesionesManana, marcarRecordatorio)

- [ ] Agregar en `contratos.js` antes del `return err` final:

```javascript
  if (action === 'sesionesManana') {
    const fecha = new URL(request.url).searchParams.get('fecha');
    const { results } = await query(db,
      `SELECT c.token, c.nombre_cliente, c.correo_cliente, c.recordatorio_enviado,
              p.hora_sesion, p.direccion
       FROM contratos c
       JOIN propiedades p ON p.contrato_token = c.token
       WHERE p.fecha_sesion = ? AND c.estatus IN ('Anticipo recibido','Firmado') AND c.oculto = 0`,
      [fecha]
    );
    return ok(results);
  }

  if (action === 'marcarRecordatorio') {
    const { token, fecha } = await request.json();
    await run(db, 'UPDATE contratos SET recordatorio_enviado = ? WHERE token = ?', [fecha, token]);
    return ok({ ok: true });
  }
```

- [ ] Agregar en `index.js` en el bloque de routing:
```javascript
    } else if (['sesionesManana','marcarRecordatorio'].includes(action)) {
      response = await handleContratos(request, env, ctx, action);
```

- [ ] Deploy del Worker:
```bash
cd worker
wrangler deploy
# Expected: Deployed contratos-iav-v4 to contratos.inmueblesaudiovisuales.com
```

- [ ] Configurar el Custom Domain en el dashboard de Cloudflare:
  - Workers & Pages > contratos-iav-v4 > Settings > Domains & Routes
  - Agregar Custom Domain: `contratos.inmueblesaudiovisuales.com`
  - Cloudflare configurará automáticamente el DNS y el certificado SSL

- [ ] Verificar endpoint en producción:
```bash
curl -s "https://contratos.inmueblesaudiovisuales.com/api/listarPaquetes" | python3 -m json.tool
# Expected: array con 10 paquetes
```

- [ ] Commit:
```bash
git add src/routes/contratos.js src/index.js
git commit -m "feat: endpoints recordatorio y deploy inicial"
```

---

## Fase 8 — Frontend

### Tarea 18: admin.html

**Archivos:**
- Crear: `frontend/admin.html`

El admin.html de v4.0 es funcionalmente idéntico al de v3.0 con estos cambios:
1. La constante `API_URL` apunta a `https://contratos.inmueblesaudiovisuales.com/api`
2. Las funciones `apiGet` y `apiPost` incluyen el header `X-Admin-Key` en lugar del parámetro `adminKey` en la URL
3. Los links del portal usan `contratos.inmueblesaudiovisuales.com` en lugar de `inmueblesaudiovisuales.com`
4. El link del checklist usa `contratos.inmueblesaudiovisuales.com/checklist.html`

- [ ] Copiar `05. VERSION 3.0/admin.html` como base y aplicar los 4 cambios anteriores.

- [ ] Cambiar en el tope del `<script>`:
```javascript
const API_URL = 'https://contratos.inmueblesaudiovisuales.com/api';
const ADMIN_KEY = 'framedock';

async function apiGet(action, params = {}) {
  const url = new URL(`${API_URL}/${action}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { 'X-Admin-Key': ADMIN_KEY } });
  return res.json();
}

async function apiPost(body) {
  const res = await fetch(`${API_URL}/${body.action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_KEY },
    body: JSON.stringify(body)
  });
  return res.json();
}
```

- [ ] Buscar y reemplazar todas las ocurrencias de `inmueblesaudiovisuales.com/portal.html` por `contratos.inmueblesaudiovisuales.com/portal.html` en el archivo.

- [ ] Buscar y reemplazar `inmueblesaudiovisuales.com/checklist.html` por `contratos.inmueblesaudiovisuales.com/checklist.html`.

- [ ] Verificar que el admin abre en el browser y puede listar contratos (vacío al inicio — correcto):
```bash
open frontend/admin.html
# En el browser: el login con "framedock" debe funcionar y mostrar la tabla vacía
```

- [ ] Commit:
```bash
git add frontend/admin.html
git commit -m "feat: admin.html v4 apuntando a contratos subdomain"
```

---

### Tarea 19: portal.html, configurar4.html, checklist.html

**Archivos:**
- Crear: `frontend/portal.html`
- Crear: `frontend/configurar4.html`
- Crear: `frontend/checklist.html`

- [ ] Para cada uno, copiar el archivo equivalente de v3.0 y aplicar el mismo cambio de `API_URL`:

```javascript
// En portal.html y configurar4.html — reemplazar la constante API_URL
const API_URL = 'https://contratos.inmueblesaudiovisuales.com/api';
```

- [ ] En `portal.html`, asegurarse de que la función que llama a `firmaCliente` envía a `/api/firmaCliente` (no `manejarFirmaCliente` que era el nombre en v3.0).

- [ ] En `checklist.html`, actualizar `API_URL` y verificar que las acciones son `obtenerChecklist` y `guardarChecklist` (mismo nombre que en v3.0).

- [ ] Verificar cada archivo en el browser con un token de prueba (crear un contrato de prueba desde el admin y usar su token).

- [ ] Commit:
```bash
git add frontend/portal.html frontend/configurar4.html frontend/checklist.html
git commit -m "feat: portal, configurar y checklist v4"
```

---

## Fase 9 — Verificación end-to-end

### Tarea 20: Prueba del flujo completo

- [ ] Crear un contrato estándar de prueba desde el admin:
  - Nombre: "Cliente de Prueba"
  - Paquete: RES-COMBO
  - Precio: $4,500
  - Anticipo: $2,250
  - Verificar que el link del portal aparece

- [ ] Abrir el portal del cliente con el token generado:
  - Verificar que carga los datos del contrato
  - Llenar el formulario de datos de la propiedad
  - Firmar y enviar
  - Verificar que el estatus cambia a "Firmado" en el admin

- [ ] Verificar que el correo de notificación a Bruno llega (Apps Script adapter)

- [ ] Registrar un abono desde el admin:
  - Monto: $2,250
  - Verificar que el saldo queda en $0 y el estatus pasa a "Liquidado"
  - Verificar en Google Drive que se creó la carpeta del proyecto

- [ ] Esperar hasta el próximo sync del cron (máximo 1 hora) y verificar en Google Sheets que apareció el contrato de prueba en la hoja "Contratos4".

- [ ] Medir tiempos de respuesta:
```bash
time curl -s "https://contratos.inmueblesaudiovisuales.com/api/listarContratos" \
  -H "X-Admin-Key: framedock" > /dev/null
# Expected: < 200ms (comparado con 2-4s en v3.0)
```

---

## Notas de despliegue

### Variables de entorno en producción

Después del primer `wrangler deploy`, configurar los secretos reales:
```bash
wrangler secret put ADMIN_KEY
# Ingresar: framedock (o el nuevo valor si se cambia)
```

### Git del proyecto Worker

El código del Worker debe vivir en su propio repositorio en GitHub para tener histórico y poder hacer rollback si algo falla:
```bash
gh repo create inmueblesaudiovisuales-dev/contratos-v4 --private
git remote add origin git@github.com:inmueblesaudiovisuales-dev/contratos-v4.git
git push -u origin main
```

### Sheets de backup v4

Crear un Google Sheets nuevo y pegar su ID en `CONFIG.SHEETS_ID` dentro de `AdapterScript4_v1.js`. El adapter creará las hojas automáticamente en el primer sync.

### Rollback a v3.0

Si algo falla, v3.0 sigue operando en `inmueblesaudiovisuales.com` sin cambios. Los clientes con contratos activos en v3.0 continúan usando esos links. La migración de datos de v3.0 a v4.0 es opcional y manual — se puede hacer exportando el CSV de v3.0 e importando los datos a D1 con `wrangler d1 execute`.
