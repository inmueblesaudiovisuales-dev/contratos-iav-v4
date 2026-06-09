# Entrega WOW "El Estreno" — Fase 1 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la entrega actual (link gris a Drive) por una página `entrega.html` mobile-first y rápida: Estreno, hero con video desde Cloudflare Stream, galería de fotos servidas desde R2 (migradas de Drive), tour 360, tarjetas de valor, reseña y recontratación; con un gate de configuración/preview en el admin antes de publicar.

**Architecture:** Al "Preparar entrega", el **adapter** (Apps Script) solo lista las subcarpetas `Fotos`/`Videos` de la carpeta Entregables (cuyo ID ya está en D1: `propiedades.carpeta_entregables_id`) y marca cada archivo como público. El **Worker** hace el trabajo pesado: jala cada foto de Drive y la guarda en **R2**, y sube la versión `_web` del reel a **Cloudflare Stream** (copy-from-URL). El manifiesto (claves de R2 + UID de Stream) se guarda en D1. `entrega.html` lee `/api/obtenerEntrega` y sirve las fotos por `/media/...` con **Cloudflare Image Transformations** (rápido, en tu dominio). El gate de admin (`borrador → publicado`) deja revisar antes de que el cliente vea nada.

**Tech Stack:** Cloudflare Workers + D1 + **R2** (binding `MEDIA`) + **Stream** (API) + Image Transformations; Google Apps Script (adapter, Drive); HTML/CSS/JS estático mobile-first. Tests de lógica pura con `node --test`.

**Rama de trabajo:** `claude/focused-galileo-diwu4c` (no `main`). Commits frecuentes.

> **NOTA (cambio durante la ejecución):** se reemplazó **R2 + Transformations** por **Cloudflare
> Images** para las fotos (el Starter Bundle de Cloudflare —que se compra para Stream— ya incluye
> Images, así que desapareció la razón de costo para usar R2). Implicaciones sobre las tareas de
> abajo: **no hay bucket R2 ni ruta `/media`**; el Worker sube cada foto a Cloudflare Images
> (`POST /accounts/{id}/images/v1`) con el secret `CF_MEDIA_TOKEN` (`Stream:Edit`+`Images:Edit`);
> el manifiesto guarda `fotos:[{id,nombre}]`, `destacadoId` e `imagesHash`; el frontend arma las
> URLs como `https://imagedelivery.net/<imagesHash>/<id>/w=<n>,format=auto` (variantes flexibles).
> El resto del flujo (adapter, gate de admin, redirección del portal, estados) queda igual.

**Fuente visual de verdad:** `mockups-galeria/v7-estreno.html` (aprobado). `entrega.html` adapta su estructura/estilos; este plan da el contrato de datos y el cableado.

---

## Contrato de datos (consistente en todas las tareas)

Columnas nuevas en `contratos` (Task 2):
- `entrega_manifiesto_json TEXT` — JSON (abajo).
- `entrega_textos_json TEXT` — `{ "redes": "<texto>", "anuncio": "<texto>" }`.
- `entrega_config_estado TEXT` — `'borrador' | 'publicado'` (gate de visibilidad al cliente).
- `entrega_media_estado TEXT` — `'pendiente' | 'migrando' | 'listo' | 'error'` (progreso de la copia).
- `entrega_video_proveedor TEXT` — `'stream' | 'youtube' | ''`.
- `entrega_video_id TEXT` — UID de Stream (o id de YouTube).

`entrega_manifiesto_json`:
```json
{
  "fotos": [ { "key": "entrega/<token>/<driveId>.jpg", "nombre": "frente.jpg" } ],
  "destacadoKey": "entrega/<token>/<driveId>.jpg",
  "propiedadNombre": "Casa Lomas del Valle",
  "propiedadUbicacion": "San Pedro · Monterrey"
}
```
- URL de una foto en el frontend: `/media/<key>?w=600` (miniatura) o `?w=1600` (pantalla completa).
- Tour 360: reutiliza `contratos.recorrido_url` + `tiene_recorrido`.
- "Descargar todo" (originales full-res): `contratos.entrega_drive_link` (carpeta de Drive).

---

## Task 1: Infra — bucket R2, secrets de Stream, binding

**Files:**
- Modify: `worker/wrangler.toml` (agregar binding R2 `MEDIA`)
- Modify: `docs/CREDENCIALES.md` (anotar account id de Stream, subdominio `customer-<code>`, nombre del bucket)

- [ ] **Step 1: Crear el bucket R2**

Run: `wrangler r2 bucket create contratos-iav-media`
Expected: `Created bucket contratos-iav-media`.

- [ ] **Step 2: Agregar el binding en wrangler.toml**

En `worker/wrangler.toml`, después del bloque `[assets]`, agrega:
```toml
[[r2_buckets]]
binding = "MEDIA"
bucket_name = "contratos-iav-media"
```

- [ ] **Step 3: Configurar secrets de Stream**

Run (pega los valores del dashboard de Cloudflare > Stream cuando los pida):
```bash
wrangler secret put CF_ACCOUNT_ID
wrangler secret put STREAM_TOKEN
wrangler secret put STREAM_CUSTOMER_CODE
```
- `CF_ACCOUNT_ID`: id de la cuenta de Cloudflare.
- `STREAM_TOKEN`: API token con permiso `Stream:Edit`.
- `STREAM_CUSTOMER_CODE`: el `customer-<code>` del subdominio de entrega de Stream.

- [ ] **Step 4: Habilitar Image Transformations**

En el dashboard de Cloudflare > la zona `inmueblesaudiovisuales.com` > Images > Transformations: activar "Resize images from this zone". (Si no se puede, el código cae a servir el original — ver Task 3 Step 3.)

- [ ] **Step 5: Documentar en CREDENCIALES.md**

Agrega a `docs/CREDENCIALES.md` una sección "Entrega (media)": bucket `contratos-iav-media`, `STREAM_CUSTOMER_CODE`, y que `CF_ACCOUNT_ID`/`STREAM_TOKEN` viven como secrets del Worker.

- [ ] **Step 6: Commit**
```bash
git add worker/wrangler.toml docs/CREDENCIALES.md
git commit -m "R113 — Infra: bucket R2 MEDIA + secrets de Stream para la entrega"
```

---

## Task 2: Migración D1 — columnas de entrega

**Files:**
- Create: `worker/migrations/r113-entrega-manifiesto.sql`
- Modify: `worker/schema.sql` (tabla `contratos`, junto a `entrega_links_extra` ~línea 22)

- [ ] **Step 1: Escribir la migración**

Create `worker/migrations/r113-entrega-manifiesto.sql`:
```sql
-- R113 — Entrega WOW "El Estreno": manifiesto, textos, estado del gate, estado de migración y video.
ALTER TABLE contratos ADD COLUMN entrega_manifiesto_json TEXT;
ALTER TABLE contratos ADD COLUMN entrega_textos_json TEXT;
ALTER TABLE contratos ADD COLUMN entrega_config_estado TEXT;
ALTER TABLE contratos ADD COLUMN entrega_media_estado TEXT;
ALTER TABLE contratos ADD COLUMN entrega_video_proveedor TEXT;
ALTER TABLE contratos ADD COLUMN entrega_video_id TEXT;
```

- [ ] **Step 2: Reflejar en schema.sql**

En `worker/schema.sql`, tras `entrega_links_extra TEXT,`, agrega las 6 columnas anteriores.

- [ ] **Step 3: Aplicar la migración**

Run: `wrangler d1 execute contratos-iav-v4 --remote --file=worker/migrations/r113-entrega-manifiesto.sql`
Expected: ejecuta sin error.

- [ ] **Step 4: Verificar**

Run: `wrangler d1 execute contratos-iav-v4 --remote --command="SELECT name FROM pragma_table_info('contratos') WHERE name LIKE 'entrega_%'"`
Expected: lista incluye las 6 columnas nuevas.

- [ ] **Step 5: Commit**
```bash
git add worker/migrations/r113-entrega-manifiesto.sql worker/schema.sql
git commit -m "R113 — D1: columnas de entrega (manifiesto, textos, estados, video)"
```

---

## Task 3: Worker — helpers puros (claves y clasificación) + tests

**Files:**
- Create: `worker/src/entrega-media.js`
- Test: `worker/src/entrega-media.test.js`

- [ ] **Step 1: Escribir el test que falla**

Create `worker/src/entrega-media.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert';
import { esFotoWeb, esVideoWeb, claveFoto } from './entrega-media.js';

test('esFotoWeb acepta formatos que el navegador muestra', () => {
  assert.equal(esFotoWeb({ mimeType: 'image/jpeg' }), true);
  assert.equal(esFotoWeb({ mimeType: 'image/png' }), true);
  assert.equal(esFotoWeb({ mimeType: 'image/webp' }), true);
  assert.equal(esFotoWeb({ mimeType: 'image/tiff' }), false);
  assert.equal(esFotoWeb({ mimeType: 'video/mp4' }), false);
});

test('esVideoWeb detecta el sufijo _web', () => {
  assert.equal(esVideoWeb('casa-lomas_web.mp4'), true);
  assert.equal(esVideoWeb('CASA_WEB.MOV'), true);
  assert.equal(esVideoWeb('master-4k.mp4'), false);
  assert.equal(esVideoWeb('reel.mp4'), false);
});

test('claveFoto arma la ruta en R2 con la extensión del archivo', () => {
  assert.equal(claveFoto('TKN', { id: 'ABC', nombre: 'frente.JPG' }), 'entrega/TKN/ABC.jpg');
  assert.equal(claveFoto('TKN', { id: 'XYZ', nombre: 'sin-ext' }), 'entrega/TKN/XYZ.jpg');
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test worker/src/entrega-media.test.js`
Expected: FAIL ("Cannot find module './entrega-media.js'").

- [ ] **Step 3: Implementar**

Create `worker/src/entrega-media.js`:
```js
// Helpers puros de media de entrega. Sin I/O.
export function esFotoWeb(file) {
  const m = ((file && file.mimeType) || '').toLowerCase();
  return m === 'image/jpeg' || m === 'image/png' || m === 'image/webp';
}

export function esVideoWeb(nombre) {
  return /_web\.[a-z0-9]+$/i.test(nombre || '');
}

export function claveFoto(token, file) {
  const m = (file.nombre || '').match(/\.([a-z0-9]+)$/i);
  const ext = m ? m[1].toLowerCase() : 'jpg';
  return `entrega/${token}/${file.id}.${ext}`;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test worker/src/entrega-media.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add worker/src/entrega-media.js worker/src/entrega-media.test.js
git commit -m "R113 — Worker: helpers puros de media de entrega + tests"
```

---

## Task 4: Worker — ruta `/media/...` sirve fotos desde R2 con Transformations

**Files:**
- Modify: `worker/src/index.js` (manejar rutas que empiezan con `/media/`)

- [ ] **Step 1: Manejar la ruta de media**

En `worker/src/index.js`, **antes** del bloque que despacha `/api/...`, agrega:
```js
// Servir media de entrega desde R2 (con redimensionado opcional por Transformations).
if (path.startsWith('/media/')) {
  const key = decodeURIComponent(path.slice('/media/'.length));
  const w = parseInt(url.searchParams.get('w') || '0', 10);
  // Ruta cruda interna para que Transformations tenga una URL fuente.
  if (url.searchParams.get('raw') === '1') {
    const obj = await env.MEDIA.get(key);
    if (!obj) return new Response('No encontrado', { status: 404 });
    const h = new Headers();
    obj.writeHttpMetadata(h);
    h.set('Cache-Control', 'public, max-age=31536000, immutable');
    return new Response(obj.body, { headers: h });
  }
  const rawUrl = `${url.origin}/media/${encodeURIComponent(key)}?raw=1`;
  if (w > 0) {
    // Transformations: redimensiona la fuente cruda.
    return fetch(rawUrl, { cf: { image: { width: w, quality: 80, format: 'auto', fit: 'scale-down' } } });
  }
  return fetch(rawUrl);
}
```
(Coloca esto donde `path` y `url` ya están definidos; revisa el inicio de `fetch` en `index.js` para usar las mismas variables.)

- [ ] **Step 2: Verificación manual (tras subir un objeto en Task 6)**

Una vez exista un objeto en R2 (`entrega/<token>/<id>.jpg`):
- `GET /media/entrega/<token>/<id>.jpg?raw=1` → devuelve la imagen original.
- `GET /media/entrega/<token>/<id>.jpg?w=600` → devuelve la versión 600px (si Transformations está activo).

- [ ] **Step 3: Fallback si Transformations no está activo**

Si `?w=` no redimensiona (Transformations deshabilitado), `fetch` con `cf.image` simplemente devuelve la original — la galería sigue funcionando, solo sin optimizar. No requiere código extra; documentar el comportamiento en el commit.

- [ ] **Step 4: Commit**
```bash
git add worker/src/index.js
git commit -m "R113 — Worker: ruta /media sirve fotos de R2 con Transformations"
```

---

## Task 5: Adapter — listar Fotos/Videos y marcar público

> **REGLA DEL ADAPTER:** (1) documentar en `docs/RONDAS.md` con hora exacta de Monterrey (`TZ="America/Monterrey" date "+%Y-%m-%d %H:%M:%S %Z"`); (2) indicar la función tocada; (3) avisar **despliegue manual** (Bruno pega el archivo en script.google.com y publica versión); (4) actualizar el header `// Ultima modificacion:` con fecha+hora Monterrey + R113 + qué cambió.

**Files:**
- Modify: `adapter/AdapterScript4_v1.js` (nueva función + registro en router `doPost`)
- Modify: `docs/RONDAS.md`

- [ ] **Step 1: Agregar `prepararCarpetaEntrega`**

En `adapter/AdapterScript4_v1.js`:
```js
// prepararCarpetaEntrega — dada la carpeta Entregables, abre subcarpetas "Fotos" y "Videos",
// marca cada archivo como público (para que el Worker lo jale) y devuelve la lista.
// Recibe { carpetaEntregablesId }. Devuelve { ok, fotos:[{id,nombre,mimeType}], videoWeb:{id,nombre}|null }.
function prepararCarpetaEntrega(body) {
  var id = body.carpetaEntregablesId;
  if (!id) return { ok: false, error: 'carpetaEntregablesId requerido' };
  var entregables = DriveApp.getFolderById(id);

  function subcarpeta(nombre) {
    var it = entregables.getFoldersByName(nombre);
    return it.hasNext() ? it.next() : null;
  }
  function publicar(file) {
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  }

  var fotos = [];
  var cFotos = subcarpeta('Fotos');
  if (cFotos) {
    var itf = cFotos.getFiles();
    while (itf.hasNext() && fotos.length < 200) {
      var f = itf.next();
      var mime = f.getMimeType();
      if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') {
        publicar(f);
        fotos.push({ id: f.getId(), nombre: f.getName(), mimeType: mime });
      }
    }
  }

  var videoWeb = null;
  var cVideos = subcarpeta('Videos');
  if (cVideos) {
    var itv = cVideos.getFiles();
    while (itv.hasNext()) {
      var v = itv.next();
      if (/_web\.[a-z0-9]+$/i.test(v.getName())) {
        publicar(v);
        videoWeb = { id: v.getId(), nombre: v.getName() };
        break;
      }
    }
  }

  return { ok: true, fotos: fotos, videoWeb: videoWeb };
}
```

- [ ] **Step 2: Registrar en el router `doPost`**

En el `switch`/router de `doPost`, junto a las otras acciones:
```js
case 'prepararCarpetaEntrega': return respond_(prepararCarpetaEntrega(body));
```
(Usa el mismo patrón `respond_`/`return` que una acción vecina, p. ej. `crearCarpetas`.)

- [ ] **Step 3: Actualizar el header**

Corre `TZ="America/Monterrey" date "+%Y-%m-%d %H:%M:%S %Z"` y reemplaza la línea `// Ultima modificacion: ...`:
```
// Ultima modificacion: <YYYY-MM-DD HH:MM:SS> CST (R113) — nueva función prepararCarpetaEntrega:
//   abre subcarpetas Fotos/Videos de Entregables, marca archivos como públicos y devuelve la
//   lista {fotos, videoWeb(_web)} para que el Worker migre a R2/Stream. REQUIERE DESPLIEGUE MANUAL.
```

- [ ] **Step 4: Documentar la ronda**

Agrega al inicio del historial en `docs/RONDAS.md`:
```markdown
## R113 — Entrega WOW "El Estreno" (Fase 1)
- **<fecha y hora Monterrey>** — Adapter: nueva función `prepararCarpetaEntrega` (lista Fotos/Videos y marca público). **Requiere despliegue manual** en script.google.com.
```

- [ ] **Step 5: Commit + aviso**
```bash
git add adapter/AdapterScript4_v1.js docs/RONDAS.md
git commit -m "R113 — Adapter: prepararCarpetaEntrega (requiere despliegue manual)"
```
Tras el commit, **avisar al usuario**: "El adapter cambió — Bruno debe pegar `adapter/AdapterScript4_v1.js` en script.google.com y publicar nueva versión para que la migración liste archivos."

---

## Task 6: Worker — `prepararEntrega` (migra a R2 + Stream y arma el manifiesto)

**Files:**
- Modify: `worker/src/routes/contratos.js` (nueva acción `prepararEntrega`)
- Modify: `worker/src/index.js` (agregar `'prepararEntrega'` a `RUTAS_CONTRATOS`)

- [ ] **Step 1: Imports**

Al inicio de `worker/src/routes/contratos.js`:
```js
import { esFotoWeb, esVideoWeb, claveFoto } from '../entrega-media.js';
```
(`callAdapterSync` ya está importado en la línea 3.)

- [ ] **Step 2: Implementar `prepararEntrega`**

En `handleContratos`, agrega:
```js
if (action === 'prepararEntrega') {
  const { token } = await request.json();
  if (!token) return err('Token requerido');
  const c = await queryOne(db, 'SELECT * FROM contratos WHERE token=?', [token]);
  if (!c) return err('Contrato no encontrado', 404);

  const prop = await queryOne(db,
    'SELECT carpeta_entregables_id, direccion FROM propiedades WHERE contrato_token=? ORDER BY num_propiedad LIMIT 1',
    [token]);
  if (!prop || !prop.carpeta_entregables_id) {
    return err('No hay carpeta de Entregables registrada para este trabajo', 400);
  }

  await run(db, `UPDATE contratos SET entrega_media_estado='migrando' WHERE token=?`, [token]);

  // 1) El adapter lista y marca público
  let lista = { fotos: [], videoWeb: null };
  try {
    lista = await callAdapterSync(env, 'prepararCarpetaEntrega', { carpetaEntregablesId: prop.carpeta_entregables_id });
  } catch (e) {
    await run(db, `UPDATE contratos SET entrega_media_estado='error' WHERE token=?`, [token]);
    return err('No se pudo leer la carpeta de entrega: ' + e.message, 502);
  }

  // 2) Migrar fotos a R2 (el Worker jala de Drive)
  const fotosManifiesto = [];
  for (const f of (lista.fotos || [])) {
    if (!esFotoWeb(f)) continue;
    try {
      const r = await fetch(`https://drive.google.com/uc?export=download&id=${f.id}`);
      if (!r.ok) continue;
      const key = claveFoto(token, f);
      await env.MEDIA.put(key, r.body, { httpMetadata: { contentType: f.mimeType } });
      fotosManifiesto.push({ key, nombre: f.nombre });
    } catch (e) { console.error('migrar foto falló', f.id, e.message); }
  }

  // 3) Subir el video _web a Stream (copy-from-URL)
  let videoProveedor = c.entrega_video_proveedor || '';
  let videoId = c.entrega_video_id || '';
  if (lista.videoWeb && lista.videoWeb.id) {
    try {
      const resp = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/copy`,
        { method: 'POST',
          headers: { 'Authorization': `Bearer ${env.STREAM_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: `https://drive.google.com/uc?export=download&id=${lista.videoWeb.id}`,
                                 meta: { name: `entrega-${token}` } }) });
      const j = await resp.json();
      if (j && j.success && j.result && j.result.uid) { videoProveedor = 'stream'; videoId = j.result.uid; }
    } catch (e) { console.error('subir video a Stream falló', e.message); }
  }

  const manifiesto = {
    fotos: fotosManifiesto,
    destacadoKey: fotosManifiesto.length ? fotosManifiesto[0].key : '',
    propiedadNombre: c.nombre_cliente || '',
    propiedadUbicacion: prop.direccion || ''
  };

  await run(db,
    `UPDATE contratos SET entrega_manifiesto_json=?, entrega_video_proveedor=?, entrega_video_id=?,
       entrega_textos_json=COALESCE(entrega_textos_json, ?), entrega_config_estado='borrador',
       entrega_media_estado='listo' WHERE token=?`,
    [JSON.stringify(manifiesto), videoProveedor, videoId, JSON.stringify({ redes: '', anuncio: '' }), token]);

  return ok({ ok: true, fotos: fotosManifiesto.length, video: videoProveedor === 'stream' ? videoId : '', manifiesto });
}
```

- [ ] **Step 3: Registrar la ruta**

En `worker/src/index.js`, agrega `'prepararEntrega'` al arreglo `RUTAS_CONTRATOS`.

- [ ] **Step 4: Verificación**

Confirma: `RUTAS_CONTRATOS` incluye `'prepararEntrega'`; el body solo necesita `{ token }`; el manifiesto usa `key`/`destacadoKey` (consistente con Task 7 y 8). El reel grande (>50 MB) puede fallar la copia: el video queda vacío y se completa pegando ID a mano (Task 8 del admin).

- [ ] **Step 5: Commit**
```bash
git add worker/src/routes/contratos.js worker/src/index.js
git commit -m "R113 — Worker: prepararEntrega migra fotos a R2 y video a Stream"
```

---

## Task 7: Worker — `obtenerEntrega` (lee el manifiesto para el cliente)

**Files:**
- Modify: `worker/src/routes/portal.js` (nueva acción `obtenerEntrega`)
- Modify: `worker/src/index.js` (agregar `'obtenerEntrega'` a `RUTAS_PORTAL`)

- [ ] **Step 1: Implementar**

En `handlePortal`, antes de `return err('Acción no encontrada', 404)`:
```js
if (action === 'obtenerEntrega') {
  const token = url.searchParams.get('token');
  if (!token) return err('Token requerido');
  const c = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [token]);
  if (!c) return err('Contrato no encontrado', 404);

  let manifiesto = {}; try { manifiesto = JSON.parse(c.entrega_manifiesto_json || '{}'); } catch (e) {}
  let textos = {}; try { textos = JSON.parse(c.entrega_textos_json || '{}'); } catch (e) {}

  return ok({
    ok: true,
    token: c.token,
    estatus: c.estatus,
    publicado: c.entrega_config_estado === 'publicado',
    mediaEstado: c.entrega_media_estado || '',
    revocada: !!(c.entrega_revocada && String(c.entrega_revocada).trim()),
    nombreCliente: c.nombre_cliente,
    driveLink: c.entrega_drive_link || '',
    manifiesto, textos,
    videoProveedor: c.entrega_video_proveedor || '',
    videoId: c.entrega_video_id || '',
    streamCustomer: env.STREAM_CUSTOMER_CODE || '',
    tour360Url: c.tiene_recorrido === 0 ? '' : (c.recorrido_url || ''),
    waLink: 'https://wa.me/5218127174207',
    igHandle: '@inmuebles.audiovisuales'
  });
}
```

- [ ] **Step 2: Registrar la ruta**

En `worker/src/index.js`, agrega `'obtenerEntrega'` a `RUTAS_PORTAL`.

- [ ] **Step 3: Verificación**

`RUTAS_PORTAL` contiene `'obtenerEntrega'`; el shape coincide con lo que consume `entrega.html` (Task 8): `manifiesto.fotos[].key`, `manifiesto.destacadoKey`, `textos.redes/anuncio`, `videoProveedor/videoId/streamCustomer`, `tour360Url`, `publicado`, `revocada`.

- [ ] **Step 4: Commit**
```bash
git add worker/src/routes/portal.js worker/src/index.js
git commit -m "R113 — Worker: obtenerEntrega entrega el manifiesto al cliente"
```

---

## Task 8: `entrega.html` — la experiencia del cliente (mobile-first)

**Files:**
- Create: `frontend/entrega.html`
- Referencia visual: `mockups-galeria/v7-estreno.html`

- [ ] **Step 1: Crear desde el mockup**

Copia `mockups-galeria/v7-estreno.html` a `frontend/entrega.html`. Mantén el CSS (Montserrat, papel Dossier, Estreno, hero, grid, kit, reseña, recontratación). Reemplaza el contenido fijo por render desde datos. **Sin emojis en el chrome**; los captions del Kit sí pueden llevarlos.

- [ ] **Step 2: Cargar datos por token**

```js
var token = new URLSearchParams(location.search).get('token') || '';
var preview = new URLSearchParams(location.search).get('preview') === '1';
var D = null;
function fotoUrl(key, w){ return '/media/' + key.split('/').map(encodeURIComponent).join('/') + '?w=' + w; }
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c];});}
async function cargar(){
  try { D = await (await fetch('/api/obtenerEntrega?token=' + encodeURIComponent(token))).json(); }
  catch(e){ D = null; }
  if(!D || !D.ok){ return mostrarNoDisponible(); }
  if(!D.publicado && !preview){ return mostrarEnPreparacion(); }
  if(D.revocada){ return mostrarRevocada(); }
  render();
}
document.addEventListener('DOMContentLoaded', cargar);
```

- [ ] **Step 3: Render**

`render()` puebla desde `D`:
- **Estreno:** `D.manifiesto.propiedadNombre` / `propiedadUbicacion`. Si `localStorage['estreno-'+token]` ya existe, saltar intro y mostrar botón "↺ Estreno".
- **Hero:** poster = `fotoUrl(D.manifiesto.destacadoKey || (fotos[0]&&fotos[0].key), 1600)`. Al tocar play, según `D.videoProveedor`:
  - `stream`: iframe `https://${D.streamCustomer}.cloudflarestream.com/${D.videoId}/iframe?autoplay=true&muted=true`.
  - `youtube`: iframe `https://www.youtube.com/embed/${D.videoId}?autoplay=1`.
  - vacío: ocultar play (hero estático).
- **Fotos:** `D.manifiesto.fotos`. Grid: primera = destacada ancho completo. `<img loading="lazy" src="fotoUrl(key,600)">`; al tocar, abrir `fotoUrl(key,1600)` en lightbox. "Ver todas / descargar" → `D.driveLink`. Si `fotos.length===0`, omitir la sección.
- **360:** si `D.tour360Url`: "Abrir recorrido" (abre URL) + copiar-liga (`navigator.clipboard.writeText`), nota "Solo en línea". Si vacío, omitir.
- **Kit:** acordeón "Para redes" (`D.textos.redes`, copiar + descargar video) y "Para tu anuncio" (`D.textos.anuncio`, copiar + descargar fotos = `D.driveLink`). Texto vacío → placeholder "Texto en preparación".
- **Descargar todo:** `D.driveLink`.
- **Incluye / guía / reseña / recontratación / comprobante / WhatsApp:** estáticas. Reseña → flujo de reseña/Google. Recontratación y WhatsApp → `D.waLink`. **Sin descuento ni código.**
- **Estado solo-video:** sin fotos ni 360, el hero ocupa más y las tarjetas de valor llenan la página (ver `mockups-galeria/v3-completo.html`, lado derecho).

- [ ] **Step 4: Estados especiales**

`mostrarNoDisponible()`, `mostrarEnPreparacion()` ("Estamos preparando tu material…"), `mostrarRevocada()`. Tono como el `renderEtapa4` actual de `portal.html` (~líneas 2606-2635).
**Fallback de compatibilidad:** si `D.manifiesto.fotos` está vacío pero hay `D.driveLink` (entrega vieja sin migrar), mostrar al menos botón "Descargar todo el material" para no romper entregas existentes.

- [ ] **Step 5: Verificación manual**

Con un `?token=` de un contrato ya preparado y publicado (tras Task 9), en viewport móvil (390px): Estreno corre, fotos cargan desde `/media/...`, copiar funciona, video reproduce, sin emojis en el chrome.

- [ ] **Step 6: Commit**
```bash
git add frontend/entrega.html
git commit -m "R113 — Frontend: entrega.html (galería WOW desde R2/Stream, mobile-first)"
```

---

## Task 9: Admin — gate de configuración / vista previa

**Files:**
- Modify: `worker/src/routes/contratos.js` (acciones `guardarConfigEntrega`, `publicarEntrega`)
- Modify: `worker/src/index.js` (rutas nuevas)
- Modify: `frontend/admin.html` (sección de entrega, ~líneas 4200-4720)

- [ ] **Step 1: Acciones de Worker**

En `worker/src/routes/contratos.js`:
```js
if (action === 'guardarConfigEntrega') {
  const { token, textos, destacadoKey, videoProveedor, videoId, tour360Url } = await request.json();
  if (!token) return err('Token requerido');
  const c = await queryOne(db, 'SELECT entrega_manifiesto_json FROM contratos WHERE token=?', [token]);
  if (!c) return err('Contrato no encontrado', 404);
  let man = {}; try { man = JSON.parse(c.entrega_manifiesto_json || '{}'); } catch (e) {}
  if (destacadoKey !== undefined) man.destacadoKey = destacadoKey;
  await run(db,
    `UPDATE contratos SET entrega_manifiesto_json=?, entrega_textos_json=?,
       entrega_video_proveedor=COALESCE(NULLIF(?, ''), entrega_video_proveedor),
       entrega_video_id=COALESCE(NULLIF(?, ''), entrega_video_id),
       recorrido_url=COALESCE(NULLIF(?, ''), recorrido_url) WHERE token=?`,
    [JSON.stringify(man), JSON.stringify(textos || {}), videoProveedor || '', videoId || '', tour360Url || '', token]);
  return ok({ ok: true });
}

if (action === 'publicarEntrega') {
  const { token } = await request.json();
  if (!token) return err('Token requerido');
  await run(db, `UPDATE contratos SET entrega_config_estado='publicado' WHERE token=?`, [token]);
  return ok({ ok: true });
}
```
Registra ambas en `RUTAS_CONTRATOS` (`worker/src/index.js`).

- [ ] **Step 2: UI del gate en admin.html**

En la sección de entrega (donde hoy llama `guardarEntrega`), agrega el flujo:
1. Botón **"Preparar entrega"** → `apiPost({ action:'prepararEntrega', token })`. Muestra "Migrando…" y, al volver, cuántas fotos y si detectó video.
2. **Vista previa** embebida: `<iframe src="entrega.html?token=...&preview=1">`.
3. Campos: textarea "Texto para redes", textarea "Texto para anuncio", **select de foto destacada** (de `manifiesto.fotos`, mostrando `fotoUrl(key,300)` como thumb), input "Video (proveedor + id)" prellenado con lo detectado, input "Liga del tour 360". Botón **"Guardar"** → `guardarConfigEntrega`.
4. Botón **"Publicar entrega"** (destacado) → `publicarEntrega`.

Sigue el patrón `apiPost`/modales existente (~línea 4712).

- [ ] **Step 3: Verificación manual**

Contrato real con carpeta Entregables poblada (Fotos/Videos): 1) "Preparar entrega" migra y reporta; 2) preview renderiza desde R2; 3) editar/guardar persiste; 4) "Publicar" cambia `entrega_config_estado`; 5) `entrega.html?token=` (sin preview) muestra la galería.

- [ ] **Step 4: Commit**
```bash
git add frontend/admin.html worker/src/routes/contratos.js worker/src/index.js
git commit -m "R113 — Admin: gate de configuración y publicación de la entrega"
```

---

## Task 10: Portal redirige a `entrega.html`

**Files:**
- Modify: `frontend/portal.html` (`renderEtapa4`, ~línea 2593)

- [ ] **Step 1: Redirigir**

En `renderEtapa4()`:
```js
function renderEtapa4() {
  location.replace('entrega.html?token=' + encodeURIComponent(portalData.token || ''));
}
```

- [ ] **Step 2: Verificación**

1) Un contrato Entregado **preparado y publicado** redirige del portal a `entrega.html` y muestra la galería. 2) Un contrato Entregado **viejo** (solo `entrega_drive_link`, sin migrar) cae al fallback de compatibilidad (Task 8 Step 4) con botón de descarga a Drive.

- [ ] **Step 3: Commit**
```bash
git add frontend/portal.html
git commit -m "R113 — Portal redirige a entrega.html en la etapa de entrega"
```

---

## Task 11: Documentación y cierre

**Files:**
- Modify: `docs/ARQUITECTURA.md` (Mapa de relaciones)
- Modify: `docs/RONDAS.md` (resumen R113)

- [ ] **Step 1: Mapa de relaciones**

En `docs/ARQUITECTURA.md`, agrega `entrega.html` → `/api/obtenerEntrega` (cliente), `/api/prepararEntrega`, `/api/guardarConfigEntrega`, `/api/publicarEntrega` (admin), ruta `/media/...` (R2), tabla `contratos` (`entrega_*`), adapter `prepararCarpetaEntrega`, R2 (`MEDIA`) y Stream.

- [ ] **Step 2: Resumen de ronda**

Completa R113 en `docs/RONDAS.md` con todo lo construido y la nota de despliegue manual del adapter.

- [ ] **Step 3: Commit**
```bash
git add docs/ARQUITECTURA.md docs/RONDAS.md
git commit -m "R113 — Docs: entrega.html en mapa de relaciones y RONDAS"
```

---

## Notas de cierre / riesgos vigentes
- **Adapter (Task 5)** requiere despliegue manual; la migración no listará archivos hasta que Bruno publique.
- **Transformations** debe estar habilitado (Task 1 Step 4); si no, se sirven originales (más pesados pero funciona).
- **Reel > ~50 MB**: la copia a Stream puede fallar; se completa pegando el ID a mano en el gate.
- **"30 días" / revocación**: informativos en Fase 1 (los originales siguen en Drive). Enforcement real = fuera de alcance.
- **Deploy real** es por push a `main`; en la rama `claude/focused-galileo-diwu4c` la verificación final en producción será tras el merge.
- **Fase 2 (no aquí):** textos del Kit por IA (`/api/generarTextosEntrega`) conectando el checklist; reemplaza la plantilla vacía de `entrega_textos_json`.
