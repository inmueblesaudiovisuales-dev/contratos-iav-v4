# Entrega WOW "El Estreno" — Fase 1 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la etapa de entrega actual (link gris a Drive en `portal.html`) por una página nueva `entrega.html` con una experiencia memorable, mobile-first: Estreno, hero con video, galería de fotos (manifiesto desde Drive vía adapter), tour 360, tarjetas de valor, reseña y recontratación; más un gate de configuración/preview en el admin antes de publicar.

**Architecture:** El adapter de Apps Script enumera la carpeta de Drive de entrega **una sola vez** (es lento y de despliegue manual) y el Worker guarda un **manifiesto JSON en D1**. `entrega.html` lee ese manifiesto vía `/api/obtenerEntrega` y lo renderiza al instante (<200ms, sin tocar Drive en cada carga). El admin revisa/edita/aprueba en un gate (`estado borrador → publicado`) antes de que el cliente vea la entrega. Fase 1 deja los textos del Kit como plantilla editable; la IA es Fase 2.

**Tech Stack:** Cloudflare Workers + D1 (SQLite), Google Apps Script (adapter, Drive), HTML/CSS/JS estático mobile-first, Cloudflare Stream (o YouTube sin listar) para el video. Tests de lógica pura con `node --test`.

**Rama de trabajo:** `claude/focused-galileo-diwu4c` (no `main`). Commits frecuentes a esa rama.

**Fuente visual de verdad:** `mockups-galeria/v7-estreno.html` (aprobado por el dueño). El HTML de `entrega.html` se adapta de ahí; este plan da el contrato de datos y el cableado, no reescribe cada línea del mockup.

---

## Contrato de datos (consistente en todas las tareas)

Columnas nuevas en `contratos` (Task 1):
- `entrega_manifiesto_json TEXT` — JSON con la estructura del manifiesto (abajo).
- `entrega_textos_json TEXT` — `{ "redes": "<texto>", "anuncio": "<texto>" }`.
- `entrega_config_estado TEXT` — `'borrador'` o `'publicado'` (gate de visibilidad al cliente).
- `entrega_video_proveedor TEXT` — `'stream' | 'youtube' | 'drive' | ''`.
- `entrega_video_id TEXT` — id/URL del reel en el host de video.

Estructura de `entrega_manifiesto_json`:
```json
{
  "fotos": [
    { "id": "<driveFileId>", "thumb": "https://drive.google.com/thumbnail?id=<id>&sz=w600",
      "full": "https://drive.google.com/uc?id=<id>", "nombre": "frente.jpg" }
  ],
  "destacadoId": "<driveFileId o ''>",
  "propiedadNombre": "Casa Lomas del Valle",
  "propiedadUbicacion": "San Pedro · Monterrey"
}
```
El tour 360 reutiliza columnas existentes `contratos.recorrido_url` y `contratos.tiene_recorrido`.
El poster del video, si no se define, usa la `destacadoId` o la primera foto.

---

## Task 1: Migración D1 — columnas de entrega

**Files:**
- Create: `worker/migrations/r113-entrega-manifiesto.sql`
- Modify: `worker/schema.sql` (sección tabla `contratos`, junto a `entrega_drive_link` línea ~21)

- [ ] **Step 1: Escribir la migración**

Create `worker/migrations/r113-entrega-manifiesto.sql`:
```sql
-- R113 — Entrega WOW "El Estreno": manifiesto, textos del Kit, estado del gate y video host.
ALTER TABLE contratos ADD COLUMN entrega_manifiesto_json TEXT;
ALTER TABLE contratos ADD COLUMN entrega_textos_json TEXT;
ALTER TABLE contratos ADD COLUMN entrega_config_estado TEXT;
ALTER TABLE contratos ADD COLUMN entrega_video_proveedor TEXT;
ALTER TABLE contratos ADD COLUMN entrega_video_id TEXT;
```

- [ ] **Step 2: Reflejar en schema.sql (referencia)**

En `worker/schema.sql`, después de la línea `entrega_links_extra TEXT,` (~línea 22) agrega:
```sql
  entrega_manifiesto_json TEXT,
  entrega_textos_json TEXT,
  entrega_config_estado TEXT,
  entrega_video_proveedor TEXT,
  entrega_video_id TEXT,
```

- [ ] **Step 3: Aplicar la migración en D1 remoto**

Run:
```bash
wrangler d1 execute contratos-iav-v4 --remote --file=worker/migrations/r113-entrega-manifiesto.sql
```
Expected: `5 commands executed successfully` (o equivalente sin error de columnas duplicadas).

- [ ] **Step 4: Verificar columnas**

Run:
```bash
wrangler d1 execute contratos-iav-v4 --remote --command="SELECT name FROM pragma_table_info('contratos') WHERE name LIKE 'entrega_%'"
```
Expected: incluye `entrega_manifiesto_json`, `entrega_textos_json`, `entrega_config_estado`, `entrega_video_proveedor`, `entrega_video_id`.

- [ ] **Step 5: Commit**
```bash
git add worker/migrations/r113-entrega-manifiesto.sql worker/schema.sql
git commit -m "R113 — D1: columnas de entrega (manifiesto, textos, estado, video)"
```

---

## Task 2: Función pura de clasificación de archivos (testeable)

El adapter devuelve archivos crudos con `mimeType`; el Worker decide qué es foto y qué se ignora. Lógica pura, testeable.

**Files:**
- Create: `worker/src/entrega-clasificar.js`
- Test: `worker/src/entrega-clasificar.test.js`

- [ ] **Step 1: Escribir el test que falla**

Create `worker/src/entrega-clasificar.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert';
import { esFoto, construirFoto } from './entrega-clasificar.js';

test('esFoto reconoce imágenes por mimeType', () => {
  assert.equal(esFoto({ mimeType: 'image/jpeg' }), true);
  assert.equal(esFoto({ mimeType: 'image/png' }), true);
  assert.equal(esFoto({ mimeType: 'video/mp4' }), false);
  assert.equal(esFoto({ mimeType: 'application/pdf' }), false);
});

test('esFoto ignora RAW y archivos de sistema', () => {
  assert.equal(esFoto({ mimeType: 'image/x-canon-cr2', nombre: 'IMG.CR2' }), false);
  assert.equal(esFoto({ mimeType: 'image/tiff', nombre: 'x.tif' }), false);
});

test('construirFoto arma thumb y full desde el id', () => {
  const f = construirFoto({ id: 'ABC123', nombre: 'frente.jpg' });
  assert.equal(f.id, 'ABC123');
  assert.equal(f.thumb, 'https://drive.google.com/thumbnail?id=ABC123&sz=w600');
  assert.equal(f.full, 'https://drive.google.com/uc?id=ABC123');
  assert.equal(f.nombre, 'frente.jpg');
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test worker/src/entrega-clasificar.test.js`
Expected: FAIL ("Cannot find module './entrega-clasificar.js'").

- [ ] **Step 3: Implementar el módulo**

Create `worker/src/entrega-clasificar.js`:
```js
// Clasificación de archivos del manifiesto de entrega. Lógica pura, sin I/O.
const RAW_EXT = /\.(cr2|cr3|nef|arw|dng|raf|orf|rw2|tif|tiff)$/i;

export function esFoto(file) {
  const mime = (file && file.mimeType) || '';
  const nombre = (file && file.nombre) || '';
  if (!mime.startsWith('image/')) return false;
  // Excluir formatos que el navegador no muestra (RAW, TIFF)
  if (mime === 'image/tiff' || /x-canon|x-nikon|x-sony|raw/i.test(mime)) return false;
  if (RAW_EXT.test(nombre)) return false;
  return true;
}

export function construirFoto(file) {
  return {
    id: file.id,
    nombre: file.nombre || '',
    thumb: `https://drive.google.com/thumbnail?id=${file.id}&sz=w600`,
    full: `https://drive.google.com/uc?id=${file.id}`,
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test worker/src/entrega-clasificar.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add worker/src/entrega-clasificar.js worker/src/entrega-clasificar.test.js
git commit -m "R113 — Worker: clasificación pura de fotos del manifiesto + tests"
```

---

## Task 3: Adapter — listar la carpeta de entrega

> **REGLA DEL ADAPTER:** este cambio requiere (1) documentarlo en `docs/RONDAS.md` con hora exacta de Monterrey (`TZ="America/Monterrey" date "+%Y-%m-%d %H:%M:%S %Z"`); (2) indicar la función tocada; (3) avisar que **requiere despliegue manual** (Bruno pega el archivo en script.google.com y publica nueva versión); (4) actualizar el comentario `// Ultima modificacion:` del header con fecha+hora Monterrey + Rxx + qué cambió.

**Files:**
- Modify: `adapter/AdapterScript4_v1.js` (agregar función + registrarla en el router `doPost`)
- Modify: `docs/RONDAS.md` (entrada de ronda)

- [ ] **Step 1: Agregar la función `listarCarpetaEntrega`**

En `adapter/AdapterScript4_v1.js`, agrega esta función (junto a las otras funciones de Drive):
```js
// listarCarpetaEntrega — enumera los archivos de una carpeta de Drive de entrega.
// Recibe { carpetaId } o { carpetaUrl }. Devuelve { ok, archivos:[{id,nombre,mimeType}] }.
// No genera miniaturas (eso lo arma el Worker con el id). Aplana subcarpetas un nivel.
function listarCarpetaEntrega(body) {
  var carpetaId = body.carpetaId;
  if (!carpetaId && body.carpetaUrl) {
    var m = String(body.carpetaUrl).match(/[-\w]{25,}/);
    if (m) carpetaId = m[0];
  }
  if (!carpetaId) return { ok: false, error: 'carpetaId requerido' };

  var carpeta = DriveApp.getFolderById(carpetaId);
  var archivos = [];
  var MAX = 200; // tope de seguridad

  function agregar(folder) {
    var it = folder.getFiles();
    while (it.hasNext() && archivos.length < MAX) {
      var f = it.next();
      archivos.push({ id: f.getId(), nombre: f.getName(), mimeType: f.getMimeType() });
    }
  }
  agregar(carpeta);
  // Un nivel de subcarpetas (p.ej. "Fotos/")
  var subs = carpeta.getFolders();
  while (subs.hasNext() && archivos.length < MAX) agregar(subs.next());

  return { ok: true, archivos: archivos };
}
```

- [ ] **Step 2: Registrar en el router `doPost`**

Busca el `switch`/router en `doPost` (donde se despachan las acciones por nombre) y agrega el caso:
```js
case 'listarCarpetaEntrega': return respond_(listarCarpetaEntrega(body));
```
(Usa el mismo patrón `respond_`/`return` que las demás acciones del archivo — cópialo de una acción vecina como `crearCarpetas`.)

- [ ] **Step 3: Actualizar el header del adapter**

Reemplaza la línea `// Ultima modificacion: ...` con la fecha/hora real de Monterrey (córrela) y:
```
// Ultima modificacion: <YYYY-MM-DD HH:MM:SS> CST (R113) — nueva función listarCarpetaEntrega:
//   enumera archivos {id,nombre,mimeType} de la carpeta de entrega (aplana 1 nivel de subcarpetas,
//   tope 200). La usa el Worker (prepararEntrega) para armar el manifiesto de la galería. REQUIERE
//   DESPLIEGUE MANUAL en script.google.com.
```

- [ ] **Step 4: Documentar la ronda**

Run: `TZ="America/Monterrey" date "+%Y-%m-%d %H:%M:%S %Z"` y agrega una entrada al inicio del historial en `docs/RONDAS.md`:
```markdown
## R113 — Entrega WOW "El Estreno" (Fase 1)
- **<fecha y hora Monterrey>** — Adapter: nueva función `listarCarpetaEntrega` (enumera la carpeta de entrega). **Requiere despliegue manual** en script.google.com.
```

- [ ] **Step 5: Commit (y aviso de despliegue manual)**
```bash
git add adapter/AdapterScript4_v1.js docs/RONDAS.md
git commit -m "R113 — Adapter: listarCarpetaEntrega (requiere despliegue manual)"
```
Tras el commit, **avisar al usuario**: "El adapter cambió — Bruno debe pegar `adapter/AdapterScript4_v1.js` en script.google.com y publicar nueva versión para que la galería liste fotos."

---

## Task 4: Worker — `prepararEntrega` (construye y guarda el manifiesto)

**Files:**
- Modify: `worker/src/routes/contratos.js` (nueva acción `prepararEntrega` junto a `guardarEntrega`, ~línea 393)
- Modify: `worker/src/index.js` (agregar `'prepararEntrega'` a `RUTAS_CONTRATOS`)
- Import: usar `callAdapterSync` (ya importado en contratos.js línea 3) y `construirFoto`, `esFoto` de `../entrega-clasificar.js`

- [ ] **Step 1: Agregar el import en contratos.js**

Al inicio de `worker/src/routes/contratos.js`, junto a los imports existentes:
```js
import { esFoto, construirFoto } from '../entrega-clasificar.js';
```

- [ ] **Step 2: Implementar la acción `prepararEntrega`**

En `worker/src/routes/contratos.js`, dentro de `handleContratos`, agrega (después del bloque `guardarEntrega`):
```js
if (action === 'prepararEntrega') {
  const { token, carpetaUrl } = await request.json();
  if (!token) return err('Token requerido');
  const c = await queryOne(db, 'SELECT * FROM contratos WHERE token=?', [token]);
  if (!c) return err('Contrato no encontrado', 404);

  const carpeta = (carpetaUrl || c.entrega_drive_link || '').trim();
  let fotos = [];
  if (carpeta) {
    try {
      const res = await callAdapterSync(env, 'listarCarpetaEntrega', { carpetaUrl: carpeta });
      const archivos = (res && res.archivos) || [];
      fotos = archivos.filter(esFoto).map(construirFoto);
    } catch (e) {
      console.error('listarCarpetaEntrega falló:', e.message);
    }
  }

  const { results: props } = await query(db,
    'SELECT direccion FROM propiedades WHERE contrato_token=? ORDER BY num_propiedad LIMIT 1', [token]);
  const manifiesto = {
    fotos,
    destacadoId: fotos.length ? fotos[0].id : '',
    propiedadNombre: c.nombre_cliente || '',
    propiedadUbicacion: (props[0] && props[0].direccion) || ''
  };

  // Plantilla de textos editable (Fase 1, sin IA)
  const textos = {
    redes: '',
    anuncio: ''
  };

  await run(db,
    `UPDATE contratos SET entrega_manifiesto_json=?, entrega_textos_json=COALESCE(entrega_textos_json, ?),
       entrega_config_estado='borrador', entrega_drive_link=COALESCE(NULLIF(?, ''), entrega_drive_link)
     WHERE token=?`,
    [JSON.stringify(manifiesto), JSON.stringify(textos), carpeta, token]);

  return ok({ ok: true, manifiesto, fotosEncontradas: fotos.length });
}
```

- [ ] **Step 3: Registrar la ruta**

En `worker/src/index.js`, encuentra el arreglo `RUTAS_CONTRATOS = [ ... ]` y agrega `'prepararEntrega'`.

- [ ] **Step 4: Verificación manual (deploy a la rama no aplica; probar con wrangler dev o tras merge)**

Como el deploy real es por push a `main`, en esta rama verifica la lógica con una prueba local de Worker si está configurada, o difiérelo a QA tras merge. Mínimo: revisar que `RUTAS_CONTRATOS` incluya la acción y que el JSON del body coincida (`token`, `carpetaUrl`).

Run: `node -e "import('./worker/src/entrega-clasificar.js').then(m=>console.log(m.construirFoto({id:'X',nombre:'a.jpg'})))"`
Expected: imprime el objeto foto con `thumb` y `full`.

- [ ] **Step 5: Commit**
```bash
git add worker/src/routes/contratos.js worker/src/index.js
git commit -m "R113 — Worker: prepararEntrega construye el manifiesto desde Drive"
```

---

## Task 5: Worker — `obtenerEntrega` (lee el manifiesto para el cliente)

**Files:**
- Modify: `worker/src/routes/portal.js` (nueva acción `obtenerEntrega`)
- Modify: `worker/src/index.js` (agregar `'obtenerEntrega'` a `RUTAS_PORTAL`)

- [ ] **Step 1: Implementar `obtenerEntrega`**

En `worker/src/routes/portal.js`, dentro de `handlePortal`, agrega (antes del `return err('Acción no encontrada', 404)`):
```js
if (action === 'obtenerEntrega') {
  const token = url.searchParams.get('token');
  if (!token) return err('Token requerido');
  const c = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [token]);
  if (!c) return err('Contrato no encontrado', 404);

  const publicado = c.entrega_config_estado === 'publicado';
  const revocada = !!(c.entrega_revocada && String(c.entrega_revocada).trim());
  let manifiesto = {};
  try { manifiesto = JSON.parse(c.entrega_manifiesto_json || '{}'); } catch (e) { manifiesto = {}; }
  let textos = {};
  try { textos = JSON.parse(c.entrega_textos_json || '{}'); } catch (e) { textos = {}; }

  return ok({
    ok: true,
    token: c.token,
    estatus: c.estatus,
    publicado,
    revocada,
    nombreCliente: c.nombre_cliente,
    driveLink: c.entrega_drive_link || '',
    manifiesto,
    textos,
    videoProveedor: c.entrega_video_proveedor || '',
    videoId: c.entrega_video_id || '',
    tour360Url: c.tiene_recorrido === 0 ? '' : (c.recorrido_url || ''),
    waLink: 'https://wa.me/5218127174207',
    igHandle: '@inmuebles.audiovisuales'
  });
}
```

- [ ] **Step 2: Registrar la ruta**

En `worker/src/index.js`, en el arreglo `RUTAS_PORTAL`, agrega `'obtenerEntrega'`.

- [ ] **Step 3: Verificación**

Confirma que `RUTAS_PORTAL` contiene `'obtenerEntrega'` y que el shape devuelto coincide con lo que consumirá `entrega.html` (Task 6): `manifiesto.fotos[]`, `textos.redes/anuncio`, `videoProveedor/videoId`, `tour360Url`, `publicado`, `revocada`.

- [ ] **Step 4: Commit**
```bash
git add worker/src/routes/portal.js worker/src/index.js
git commit -m "R113 — Worker: obtenerEntrega entrega el manifiesto al cliente"
```

---

## Task 6: `entrega.html` — la experiencia del cliente (mobile-first)

Adaptar el mockup aprobado a una página productiva que lee `/api/obtenerEntrega`.

**Files:**
- Create: `frontend/entrega.html`
- Referencia visual (copiar estructura/estilos): `mockups-galeria/v7-estreno.html`

- [ ] **Step 1: Crear `entrega.html` desde el mockup**

Copia `mockups-galeria/v7-estreno.html` a `frontend/entrega.html` y conviértelo en data-driven:
- Mantén el CSS tal cual (Montserrat, papel Dossier, Estreno, hero, grid, kit, reseña, recontratación).
- Reemplaza el contenido fijo (nombre, fotos, captions) por render desde datos.
- **Regla de marca:** sin emojis en el chrome del producto. Los captions del Kit (contenido para redes) pueden incluir emojis.

- [ ] **Step 2: Cargar datos por token**

Agrega al `<script>` de `entrega.html`:
```js
var token = new URLSearchParams(location.search).get('token') || '';
var D = null;

async function cargar() {
  try {
    var r = await fetch('/api/obtenerEntrega?token=' + encodeURIComponent(token));
    D = await r.json();
  } catch (e) { D = null; }
  if (!D || !D.ok) { mostrarNoDisponible(); return; }
  if (!D.publicado) { mostrarEnPreparacion(); return; }   // gate: el cliente no ve borradores
  if (D.revocada) { mostrarRevocada(); return; }
  render();
}

function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c];});}
document.addEventListener('DOMContentLoaded', cargar);
```

- [ ] **Step 3: Render del Estreno + hero + secciones**

Implementa `render()` para poblar, desde `D`:
- **Estreno:** `D.manifiesto.propiedadNombre` y `D.manifiesto.propiedadUbicacion` en `.e-name` / `.e-loc`. Si ya se vio (localStorage `estreno-<token>`), saltar intro y mostrar botón "↺ Estreno".
- **Hero:** poster = `D.manifiesto` foto destacada o primera; al tocar play, reproducir el video según `D.videoProveedor`:
  - `youtube`: insertar iframe `https://www.youtube.com/embed/<videoId>?autoplay=1`.
  - `stream`: iframe `https://customer-<...>.cloudflarestream.com/<videoId>/iframe?autoplay=true` (ver Task 8 para el dominio).
  - vacío: ocultar play (paquete sin video con hero estático) o usar `D.driveLink`.
- **Fotos:** `D.manifiesto.fotos`. Render grid (primera = destacada ancho completo). `<img loading="lazy" src="foto.thumb">`. "Ver todas las fotos →" abre `D.driveLink`. Si `fotos.length === 0`, omitir toda la sección.
- **360:** si `D.tour360Url`, mostrar sección con "Abrir recorrido" (abre URL) + fila copiar-liga (`navigator.clipboard.writeText(D.tour360Url)`), nota "Solo en línea". Si vacío, omitir.
- **Kit:** acordeón "Para redes" (`D.textos.redes`, botón copiar + descargar video) y "Para tu anuncio" (`D.textos.anuncio`, copiar + descargar fotos = `D.driveLink`). Si un texto está vacío, mostrar placeholder discreto "Texto en preparación" (Fase 1).
- **Descargar todo:** abre `D.driveLink`.
- **Tu entrega incluye / guía / reseña / recontratación / comprobante / WhatsApp:** estáticas; reseña → `revision`/Google; recontratación → `D.waLink`; WhatsApp → `D.waLink`. **Sin descuento ni código** en recontratación.
- **Estado solo-video:** si no hay fotos ni 360, el hero ocupa más y las tarjetas de valor llenan la página (como en `mockups-galeria/v3-completo.html`, lado derecho).

- [ ] **Step 4: Estados especiales**

Implementa `mostrarNoDisponible()`, `mostrarEnPreparacion()` ("Estamos preparando tu material y te avisaremos cuando esté listo") y `mostrarRevocada()` (mensaje + botón WhatsApp), reusando el tono del `renderEtapa4` actual de `portal.html` (líneas ~2606-2635).

- [ ] **Step 5: Verificación manual con datos de prueba**

Abre `frontend/entrega.html` en el navegador con un `?token=` real de un contrato Entregado que ya tenga manifiesto publicado (tras Task 7), o stubbea `D` temporalmente para revisar el render. Verifica en viewport móvil (DevTools, 390px): Estreno corre, fotos cargan, copiar funciona, sin emojis en el chrome.

- [ ] **Step 6: Commit**
```bash
git add frontend/entrega.html
git commit -m "R113 — Frontend: entrega.html (galería WOW, data-driven, mobile-first)"
```

---

## Task 7: Admin — gate de configuración / vista previa

El dueño revisa el manifiesto, edita textos, marca destacado, fija video/360 y publica.

**Files:**
- Modify: `frontend/admin.html` (sección de entrega, ~líneas 4200-4720 donde hoy vive `guardarEntrega`)
- Modify: `worker/src/routes/contratos.js` (nueva acción `publicarEntrega` y `guardarConfigEntrega`)
- Modify: `worker/src/index.js` (rutas nuevas)

- [ ] **Step 1: Acciones de Worker para el gate**

En `worker/src/routes/contratos.js` agrega:
```js
if (action === 'guardarConfigEntrega') {
  const { token, textos, destacadoId, videoProveedor, videoId, tour360Url } = await request.json();
  if (!token) return err('Token requerido');
  const c = await queryOne(db, 'SELECT entrega_manifiesto_json FROM contratos WHERE token=?', [token]);
  if (!c) return err('Contrato no encontrado', 404);
  let man = {};
  try { man = JSON.parse(c.entrega_manifiesto_json || '{}'); } catch (e) { man = {}; }
  if (destacadoId !== undefined) man.destacadoId = destacadoId;
  await run(db,
    `UPDATE contratos SET entrega_manifiesto_json=?, entrega_textos_json=?,
       entrega_video_proveedor=?, entrega_video_id=?, recorrido_url=COALESCE(NULLIF(?, ''), recorrido_url)
     WHERE token=?`,
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

En la sección de entrega de `admin.html` (donde hoy está el modal que llama `guardarEntrega`), agrega un flujo:
1. Botón **"Preparar entrega"** → `apiPost({ action:'prepararEntrega', token, carpetaUrl })`. Muestra cuántas fotos encontró.
2. **Vista previa** embebida: `<iframe src="entrega.html?token=...&preview=1">` (en preview, `entrega.html` ignora el gate `publicado` cuando detecta `preview=1` **y** se está dentro del admin; ver Step 3).
3. Campos editables: textarea "Texto para redes", textarea "Texto para anuncio", select de **foto destacada** (de `manifiesto.fotos`), input "Video: proveedor + id/URL", input "Liga del tour 360". Botón **"Guardar"** → `guardarConfigEntrega`.
4. Botón **"Publicar entrega"** (destacado) → `publicarEntrega`. Tras publicar, el cliente ya ve la galería.

Sigue el patrón de `apiPost`/modales existente en `admin.html` (mismo helper usado por `guardarEntrega`, ~línea 4712).

- [ ] **Step 3: Permitir preview de borradores**

En `entrega.html` (Task 6, función `cargar`), permite ver borradores solo en preview de admin:
```js
var preview = new URLSearchParams(location.search).get('preview') === '1';
// ...
if (!D.publicado && !preview) { mostrarEnPreparacion(); return; }
```
(El `preview=1` solo lo usa el iframe del admin; el cliente nunca recibe ese parámetro.)

- [ ] **Step 4: Verificación manual**

Con un contrato real Entregado: 1) "Preparar entrega" lista fotos; 2) la vista previa renderiza; 3) editar textos/destacado y "Guardar" persiste; 4) "Publicar" cambia `entrega_config_estado` a `publicado`; 5) abrir `entrega.html?token=` (sin preview) muestra la galería.

- [ ] **Step 5: Commit**
```bash
git add frontend/admin.html worker/src/routes/contratos.js worker/src/index.js
git commit -m "R113 — Admin: gate de configuración y publicación de la entrega"
```

---

## Task 8: Video premium (Cloudflare Stream) + enlace desde el portal

**Files:**
- Modify: `frontend/entrega.html` (embed del player según proveedor — ya cableado en Task 6 Step 3; aquí se fija el dominio Stream)
- Modify: `frontend/portal.html` (`renderEtapa4`, ~línea 2593: redirigir/enlazar a `entrega.html`)
- Modify: `docs/CREDENCIALES.md` (anotar el subdominio de Cloudflare Stream — dato sensible)

- [ ] **Step 1: Definir el embed de Cloudflare Stream**

En `entrega.html`, para `videoProveedor === 'stream'`, el iframe es:
```
https://customer-<CODE>.cloudflarestream.com/<videoId>/iframe?autoplay=true&muted=true
```
El `<CODE>` es del dashboard de Stream del cliente. Mientras no exista cuenta Stream, soportar `youtube` (gratis) ya cubre la demo. Documenta `<CODE>` en `docs/CREDENCIALES.md`.

- [ ] **Step 2: Redirigir el portal a la nueva entrega**

En `frontend/portal.html`, `renderEtapa4()` (~2593): cuando el estatus sea `Entregado/Liquidado/Completado`, en vez del render actual, redirige o enlaza a la nueva página:
```js
function renderEtapa4() {
  // Nueva experiencia de entrega
  location.replace('entrega.html?token=' + encodeURIComponent(portalData.token || ''));
}
```
**Fallback de compatibilidad:** si `obtenerEntrega` devuelve sin manifiesto (entregas viejas con solo `entrega_drive_link` y nunca "preparadas"), `entrega.html` debe mostrar al menos el link a Drive (botón "Descargar todo" usando `D.driveLink`) para no romper entregas existentes.

- [ ] **Step 3: Verificación**

1) Un contrato Entregado **preparado y publicado** redirige del portal a `entrega.html` y muestra la galería. 2) Un contrato Entregado **viejo** (solo drive link) muestra el fallback con descarga a Drive. 3) Con un `videoId` de YouTube sin listar, el hero reproduce al tocar play.

- [ ] **Step 4: Commit**
```bash
git add frontend/portal.html frontend/entrega.html docs/CREDENCIALES.md
git commit -m "R113 — Portal redirige a entrega.html; embed de video (Stream/YouTube)"
```

---

## Task 9: Documentación y cierre

**Files:**
- Modify: `docs/ARQUITECTURA.md` (Mapa de relaciones: agregar `entrega.html` → `obtenerEntrega`/`prepararEntrega` → `contratos`)
- Modify: `docs/RONDAS.md` (resumen R113 completo)

- [ ] **Step 1: Actualizar el mapa de relaciones**

En `docs/ARQUITECTURA.md`, agrega `entrega.html` al mapa: habla con `/api/obtenerEntrega` (lectura cliente), `/api/prepararEntrega`, `/api/guardarConfigEntrega`, `/api/publicarEntrega` (admin), tabla `contratos` (columnas `entrega_*`), adapter `listarCarpetaEntrega`.

- [ ] **Step 2: Resumen de ronda**

Completa la entrada R113 en `docs/RONDAS.md` con todo lo construido (galería, manifiesto, gate de admin, video host) y la nota de despliegue manual del adapter.

- [ ] **Step 3: Commit**
```bash
git add docs/ARQUITECTURA.md docs/RONDAS.md
git commit -m "R113 — Docs: entrega.html en mapa de relaciones y RONDAS"
```

---

## Notas de cierre / riesgos vigentes (de §6 del spec)
- **Miniaturas de Drive** pueden estrangularse (403) con muchas fotos. Si pasa en producción, Fase 3: cachear miniaturas en R2/Cloudflare Images vía adapter.
- **"30 días" y revocación** son informativos en Fase 1 (el link de Drive sigue público). Enforcement real = fuera de alcance.
- **Adapter** requiere despliegue manual (Task 3). La galería de fotos no listará hasta que Bruno publique la nueva versión.
- **Fase 2 (no aquí):** textos del Kit por IA (`/api/generarTextosEntrega`) conectando el checklist; reemplaza la plantilla vacía de `entrega_textos_json`.
