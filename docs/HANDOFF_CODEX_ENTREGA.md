# Codex Handoff — Bug fixes for "El Estreno" delivery system (entrega.html)

> **Before starting any work, read this document in full and ask all clarifying questions you have.**
> The owner will relay your questions and return with answers before you write a single line of code.

---

## 1. Repository & branch

| Field | Value |
|---|---|
| Repository | `inmueblesaudiovisuales-dev/contratos-iav-v4` |
| **Working branch** | `claude/magical-allen-skg4z0` |
| Main branch | `main` (DO NOT push to `main` — a push to `main` triggers a live Cloudflare production deploy via GitHub Actions) |
| Commit all work to | `claude/magical-allen-skg4z0` only |

**All changes must be committed and pushed to `claude/magical-allen-skg4z0`. Never touch `main`.**

---

## 2. Project overview (read before touching code)

This is a contract management system for a real-estate photography company (Inmuebles Audiovisuales) running on **Cloudflare Workers + D1 (SQLite)**. The UI is plain HTML/CSS/JS served as static assets.

The feature you are fixing is called **"El Estreno"** — a delivery page (`frontend/entrega.html`) that replaces a plain Drive link with a cinematic experience: animated intro, photo gallery from Cloudflare Images, video from Cloudflare Stream, 360 tour, and a copy-ready social media kit.

### Key files for this task

| File | Role |
|---|---|
| `frontend/entrega.html` | Client-facing delivery page (466 lines) |
| `worker/src/routes/contratos.js` | Worker route — all admin actions for entrega: `prepararEntrega`, `guardarConfigEntrega`, `publicarEntrega`, `agregarFotoEntrega`, `iniciarSubidaVideo`, `confirmarVideoEntrega`, `previewEntrega` |
| `worker/src/routes/portal.js` | Worker route — `obtenerEntrega` (public read) and `payloadEntrega` (shared helper) |
| `worker/src/entrega-media.js` | Pure helpers: `esFotoWeb`, `esVideoWeb`, `hashDeVariante` |
| `frontend/admin.html` | Admin panel — JS functions at the bottom: `prepararEntregaGaleria`, `cargarConfigEntregaGaleria`, `guardarConfigEntregaGaleria`, `publicarEntregaGaleria`, `subirFotosManual`, `subirVideoManual` (around lines 4783–4905) |
| `worker/wrangler.toml` | Cloudflare config, env vars |

### Language conventions
- **All code** is JavaScript (no TypeScript, no framework).
- **User-facing strings** (UI copy, error messages, toasts) are in **Spanish**.
- **Code comments** are in **Spanish**.
- **No emojis** in UI chrome (product rule). Emojis are only allowed inside generated social media captions.
- Do not add unnecessary comments. Only add a comment when the "why" is non-obvious.

### Architecture constraints
- D1 (SQLite) does **not** support foreign keys. Cascades are done manually in code with `db.batch()`.
- Workers have a CPU time limit per request (~50 ms on the free plan, 30 s on paid). The batch migration loop already handles this.
- `wrangler.toml` lives in `worker/wrangler.toml` (not the repo root).
- Static assets are served from `frontend/` — the Worker does **not** bundle them; Cloudflare serves them directly via the `[assets]` binding.
- No build step. Editing a `.js` file in `worker/src/` and pushing is all that is needed.

---

## 3. How the delivery system works (full flow)

Understanding this is required to fix the bugs correctly.

### 3.1 Data model

Table `contratos` has these columns added by migration `r123-entrega-manifiesto.sql`:

```
entrega_manifiesto_json   TEXT   -- JSON blob (see §3.2)
entrega_textos_json       TEXT   -- JSON { "redes": "...", "anuncio": "..." }
entrega_config_estado     TEXT   -- 'borrador' | 'publicado'
entrega_media_estado      TEXT   -- 'pendiente' | 'migrando' | 'listo' | 'error'
entrega_video_proveedor   TEXT   -- 'stream' | 'youtube' | ''
entrega_video_id          TEXT   -- UID in Stream, or YouTube ID
```

These columns already exist in the live D1 database. Do **not** write new migrations for them.

### 3.2 Manifest JSON (`entrega_manifiesto_json`)

```json
{
  "fotos": [ { "id": "<cloudflare-images-id>", "nombre": "frente.jpg" } ],
  "destacadoId": "<cloudflare-images-id>",
  "imagesHash": "<account-hash-for-imagedelivery.net>",
  "streamCustomer": "customer-xxxx",
  "propiedadNombre": "Av. Lomas del Valle 123",
  "propiedadUbicacion": "San Pedro · Monterrey",
  "pendientes": [ ... ]   // only present while migrating; deleted when done=true
}
```

Photo URLs are assembled as:
```
https://imagedelivery.net/<imagesHash>/<id>/w=600,quality=80,format=auto
```

### 3.3 Admin flow

1. Admin opens the "Galería de entrega — El Estreno" accordion in the contract panel.
2. `cargarConfigEntregaGaleria()` fires on open → calls `GET /api/previewEntrega?token=...` with `X-Admin-Key` header. If nothing prepared yet, the form stays hidden.
3. Admin clicks **"Preparar entrega"** → `prepararEntregaGaleria()`:
   - Calls `POST /api/contratos { action:'prepararEntrega', token, continuar:false }`
   - Worker calls Google Apps Script adapter `prepararCarpetaEntrega` to list files in the Drive "Entregables" folder and mark them public.
   - Worker migrates photos to **Cloudflare Images** in batches of 8.
   - Admin polls with `continuar:true` until `done:true`.
   - On `done`, Worker attempts to upload the `_web` video to **Cloudflare Stream** (copy-from-URL).
4. Admin reviews in preview link → edits texts, selects featured photo.
5. Admin saves → `guardarConfigEntregaGaleria()` → `POST /api/contratos { action:'guardarConfigEntrega', ... }`.
6. Admin clicks **"Publicar entrega"** → `publicarEntregaGaleria()` → sets `entrega_config_estado='publicado'`.

### 3.4 Client flow

1. Client opens `portal.html?token=...`. If estatus is `Entregado`/`Liquidado`/`Completado`, `renderEtapa4()` fires.
2. `renderEtapa4()` calls `GET /api/obtenerEntrega?token=...`.
   - If `publicado=true` AND (fotos exist OR there is a videoId) → redirect to `entrega.html?token=...`.
   - Otherwise → `renderEtapa4Clasica()` (plain Drive link, legacy behavior).
3. `entrega.html` loads, calls `obtenerEntrega` again for full payload.
4. Page renders: **Estreno** animation (first visit, via `localStorage`), hero with video, photo grid, 360 section, Kit, download all button, review card, rebook card, payment receipt.

### 3.5 `payloadEntrega` (shared helper, `portal.js:13–34`)

Both `obtenerEntrega` (public) and `previewEntrega` (admin-only) call this. It builds the response object from the contract row. Key fields:

```js
streamCustomer: (manifiesto && manifiesto.streamCustomer) || env.STREAM_CUSTOMER_CODE || '',
tour360Url: c.tiene_recorrido === 0 ? '' : (c.recorrido_url || ''),
```

---

## 4. Bugs to fix

Fix **all five** bugs. They are ordered by severity. Each bug description includes: the symptom, the root cause with exact file + line references, and the expected behavior after the fix.

---

### Bug 1 — CRITICAL: 360 tour URL saved from gallery panel is silently ignored

**Symptom:** Admin pastes a 360 tour URL into the "Liga del recorrido 360" field in the gallery panel, saves, but the 360 section never appears in `entrega.html` for the client.

**Root cause:**

`guardarConfigEntrega` in `worker/src/routes/contratos.js` (lines 521–534):

```js
if (action === 'guardarConfigEntrega') {
  const { token, textos, destacadoId, videoProveedor, videoId, tour360Url } = await request.json();
  // ...
  await run(db,
    `UPDATE contratos SET entrega_manifiesto_json=?, entrega_textos_json=?,
       entrega_video_proveedor=COALESCE(NULLIF(?, ''), entrega_video_proveedor),
       entrega_video_id=COALESCE(NULLIF(?, ''), entrega_video_id),
       recorrido_url=COALESCE(NULLIF(?, ''), recorrido_url) WHERE token=?`,
    [JSON.stringify(man), JSON.stringify(textos || {}), videoProveedor || '', videoId || '', tour360Url || '', token]);
```

It correctly saves `tour360Url` into `recorrido_url`, but **does not update `tiene_recorrido`**.

`payloadEntrega` in `worker/src/routes/portal.js` (line 30):

```js
tour360Url: c.tiene_recorrido === 0 ? '' : (c.recorrido_url || ''),
```

If `tiene_recorrido` is `0` or `NULL`, `tour360Url` is always returned as `''`, no matter what is in `recorrido_url`. The 360 section in `entrega.html` checks `if(D.tour360Url)` and never renders.

**Fix:**

In `guardarConfigEntrega`, when `tour360Url` is non-empty, also set `tiene_recorrido = 1` in the same UPDATE. When it is cleared (empty string passed), set `tiene_recorrido = 0`.

The SQL should become something like:

```sql
UPDATE contratos SET
  entrega_manifiesto_json=?,
  entrega_textos_json=?,
  entrega_video_proveedor=COALESCE(NULLIF(?, ''), entrega_video_proveedor),
  entrega_video_id=COALESCE(NULLIF(?, ''), entrega_video_id),
  recorrido_url=COALESCE(NULLIF(?, ''), recorrido_url),
  tiene_recorrido=CASE WHEN ? != '' THEN 1 ELSE tiene_recorrido END
WHERE token=?
```

Pass `tour360Url || ''` for both the `recorrido_url` bind and the `CASE WHEN` bind (it will be the 6th and 7th `?` respectively in the values array — adjust ordering carefully).

**Constraint:** D1 does not support subqueries in the SET clause in some edge cases. A plain `CASE WHEN ? != '' THEN 1 ELSE tiene_recorrido END` with a literal bind value is safe.

**Also needed:** In `admin.html`, the `cargarConfigEntregaGaleria()` function (line 4823) populates `gal-360` from `d.tour360Url`. Since `payloadEntrega` was returning `''` for this field due to the bug, after the fix the field will correctly show the saved URL. No change needed in admin.html for this bug — the fix is 100% in the Worker.

---

### Bug 2 — IMPORTANT: "El Estreno" shows the client's name as the property title

**Symptom:** The cinematic Estreno intro (and the hero section) display the **client's name** (e.g., "María González") as the large property title, instead of something that identifies the property (e.g., the address "Av. Lomas del Valle 123").

**Root cause:**

In `prepararEntrega` in `worker/src/routes/contratos.js` (lines 456–465), when building the initial manifest:

```js
man = {
  fotos: [],
  pendientes: [...],
  videoWebId: ...,
  destacadoId: '',
  imagesHash: man.imagesHash || '',
  streamCustomer: man.streamCustomer || '',
  propiedadNombre: c.nombre_cliente || '',   // ← BUG: this is the CLIENT'S NAME
  propiedadUbicacion: prop.direccion || ''
};
```

`c.nombre_cliente` is the client's full name (e.g., "María González"). `prop.direccion` is the property address (e.g., "Av. Lomas del Valle 123, San Pedro Garza García"). The Estreno spec says `propiedadNombre` should be a property identifier — the address is the best candidate since there is no separate "property name" field in the schema.

In `entrega.html` (lines 332–334), this value is displayed prominently:

```js
document.getElementById('eName').textContent = m.propiedadNombre || 'Tu propiedad';
document.getElementById('heroTitle').textContent = m.propiedadNombre || 'Tu propiedad';
```

**Fix:**

Change `propiedadNombre` in the manifest to use `prop.direccion` (the property address), and change `propiedadUbicacion` to something complementary. The simplest and most correct fix:

```js
propiedadNombre: prop.direccion || c.nombre_cliente || '',
propiedadUbicacion: ''   // direccion is already the name; no redundant line needed
```

Or, if the design intent is to keep a two-line display (title + subtitle), use:

```js
propiedadNombre: prop.direccion || c.nombre_cliente || '',
propiedadUbicacion: ''
```

**Question for owner before implementing:** Should `propiedadUbicacion` (the small subtitle line in the Estreno) show something else — for example, the neighborhood, municipality, or just be left empty? Currently `prop.direccion` is the full address. Please clarify what should appear on each of the two lines. **Do not implement this bug fix until you have the owner's answer.**

---

### Bug 3 — IMPORTANT: Stream video does not play when `streamCustomer` is empty

**Symptom:** When the admin clicks play on the hero video in `entrega.html`, nothing happens (or it silently fails). This occurs when:
- The video was uploaded manually via "Subir video directo" (`subirVideoManual`), OR
- The automatic copy-from-Drive succeeded but `streamCustomer` was not captured.

**Root cause — two parts:**

**Part A — `wrangler.toml` has `STREAM_CUSTOMER_CODE = ""`** (line 24):

```toml
STREAM_CUSTOMER_CODE = ""
```

The fallback in `payloadEntrega` (`portal.js:29`) is:
```js
streamCustomer: (manifiesto && manifiesto.streamCustomer) || env.STREAM_CUSTOMER_CODE || '',
```
If both are empty, `streamCustomer` is `''`.

In `entrega.html` (lines 407–409), the Stream iframe URL is built as:
```js
src = 'https://' + D.streamCustomer + '.cloudflarestream.com/' + D.videoId + '/iframe?autoplay=true&muted=true';
```
With `streamCustomer = ''`, this becomes `https://.cloudflarestream.com/...` — an invalid URL. The iframe silently loads nothing.

**Part B — `confirmarVideoEntrega` (`contratos.js:579–596`) may fail to capture `streamCustomer`:**

```js
const g = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/${uid}`, ...);
const gj = await g.json();
const mm = String((gj.result && gj.result.preview) || '').match(/(customer-[^.]+)\./);
if (mm) man.streamCustomer = mm[1];
```

Right after a manual upload, Stream may still be processing the video and `gj.result.preview` may be `null` or not yet contain the `customer-` subdomain. The regex fails silently and `streamCustomer` is never set in the manifest.

**Fix — two steps:**

**Step 1:** The `STREAM_CUSTOMER_CODE` var in `wrangler.toml` must be filled in by the owner (Bruno) — it is the `customer-xxxx` part of the Stream subdomain, found in the Cloudflare dashboard under Stream → your video → embed code. This is a **configuration task for the owner, not a code change**. However, to make the system resilient even before that is done, add a code-level fallback.

**Step 2 (code fix):** In `entrega.html`, in `playVideo()` (lines 405–413), guard against an empty `streamCustomer` and show a user-facing fallback message instead of breaking silently:

```js
function playVideo(){
  var src = '';
  if(D.videoProveedor === 'stream' && D.videoId){
    if(!D.streamCustomer){ return toast('Video no disponible en este momento'); }
    src = 'https://' + D.streamCustomer + '.cloudflarestream.com/' + D.videoId + '/iframe?autoplay=true&muted=true';
  } else if(D.videoProveedor === 'youtube' && D.videoId){
    src = 'https://www.youtube.com/embed/' + D.videoId + '?autoplay=1';
  }
  if(!src){ return toast('Video no disponible'); }
  // ... rest unchanged
}
```

**Step 3 (code fix):** In `confirmarVideoEntrega` (`contratos.js:580–596`), if `streamCustomer` is not captured on first try, do **not** fail — instead, save what is known and add a note in the manifest so the admin can retry. Additionally, as a fallback, try reading `gj.result.thumbnail` (which sometimes contains the customer code even before `preview` is ready):

The current code already tries `j.result.preview || j.result.thumbnail` during `prepararEntrega` (line 504). The same pattern should be used in `confirmarVideoEntrega` (line 590). Verify and align both places to try `preview`, then `thumbnail`, then any other URL fields the Stream API returns that contain `customer-`.

---

### Bug 4 — SILENT: Google Drive fetch may return HTML instead of image data

**Symptom:** During `prepararEntrega`, some photos silently fail to migrate. The admin sees a lower count than expected ("Listo: 12 foto(s)" when there were 18 in the folder). No error is shown.

**Root cause:**

In `prepararEntrega` (`contratos.js:479–487`):

```js
const r = await fetch(`https://drive.google.com/uc?export=download&id=${f.id}`);
if (r.ok) {
  const sub = await subirImagenCF(env, await r.blob(), f.nombre);
  if (sub) { man.fotos.push({ id: sub.id, nombre: f.nombre }); ... }
}
```

Google Drive's `uc?export=download` endpoint returns HTTP 200 with an HTML confirmation page ("Google Drive can't scan this file for viruses") for some files (typically those that can't be virus-scanned, or under certain rate-limit conditions). `r.ok` is `true` (status 200), so the code proceeds and calls `subirImagenCF` with a blob of HTML text. Cloudflare Images rejects it (or accepts it as a corrupt image), `subirImagenCF` returns `null`, and the photo is silently skipped.

**Fix:**

Before calling `subirImagenCF`, validate that the response is actually an image by checking the `Content-Type` header:

```js
const r = await fetch(`https://drive.google.com/uc?export=download&id=${f.id}`);
const ct = r.headers.get('content-type') || '';
if (r.ok && (ct.includes('image/jpeg') || ct.includes('image/png') || ct.includes('image/webp'))) {
  const sub = await subirImagenCF(env, await r.blob(), f.nombre);
  if (sub) { man.fotos.push({ id: sub.id, nombre: f.nombre }); if (!man.imagesHash) man.imagesHash = sub.hash; }
} else if (r.ok) {
  console.error('Drive devolvió non-image para', f.id, 'content-type:', ct);
}
```

This does not fix the root cause (Drive returning HTML) but makes the failure visible in Worker logs and prevents corrupt data from entering Cloudflare Images. The admin can then use the manual "Subir fotos directo" fallback for any skipped photos.

**Note:** Do not attempt to follow the Drive confirmation redirect — that would require cookies and JavaScript, which a Worker cannot do.

---

### Bug 5 — UX: "Video" download button in the Kit links to Drive folder, not to the video

**Symptom:** In the "Para redes" kit card, the "Video" download button (`btnVideo`) takes the client to the full Drive folder (or to `#` if there is no Drive link), not to the actual video. A client who wants to download the reel cannot do so from `entrega.html`.

**Root cause:**

In `entrega.html` (lines 341–344):

```js
var hayVideo = (D.videoProveedor === 'stream' || D.videoProveedor === 'youtube') && D.videoId;
if(!hayVideo){ document.getElementById('playBtn').style.display = 'none'; ... }
document.getElementById('btnVideo').style.display = hayVideo ? '' : 'none';
document.getElementById('btnVideo').href = D.driveLink || '#';   // ← always Drive, never Stream
```

Cloudflare Stream does not provide a direct download URL for videos (it is a streaming service). YouTube also does not. However:
- If `D.videoProveedor === 'stream'`, there is a watch/embed URL the client can open: `https://<streamCustomer>.cloudflarestream.com/<videoId>/watch` — this page has a download option in the Stream player.
- If `D.videoProveedor === 'youtube'`, a direct download is not possible from the embed; the Drive folder is the correct fallback.
- If `D.driveLink` exists, the original video file is still in Drive and can be downloaded from there.

**Fix:**

Update the `btnVideo` logic in `entrega.html` inside `render()`:

```js
var videoDownloadHref = '';
if(hayVideo && D.videoProveedor === 'stream' && D.streamCustomer && D.videoId){
  videoDownloadHref = 'https://' + D.streamCustomer + '.cloudflarestream.com/' + D.videoId + '/watch';
} else if(D.driveLink){
  videoDownloadHref = D.driveLink;
}
var btnVideo = document.getElementById('btnVideo');
btnVideo.style.display = (hayVideo && videoDownloadHref) ? '' : 'none';
btnVideo.href = videoDownloadHref || '#';
```

This sends Stream video users to the Stream watch page (which has a native download button) and falls back to Drive if there is no Stream customer code or if the video is on YouTube.

---

## 5. Out of scope for this task

Do **not** fix or change any of the following — they are known and intentionally deferred:

- **`abrirGuia()` placeholder** (`entrega.html:422`) — shows "Próximamente: guía de publicación". This is intentionally left for a future iteration.
- **`RESENA_URL`** (`entrega.html:285`) — currently a generic Google Maps search. The owner will update it to the correct deep link when ready.
- **Admin key in preview URL** (`gal-preview` link in `admin.html:4825`) — `entrega.html?token=...&preview=1&k=PASSWORD`. This is a known trade-off; the admin panel already passes the key in various ways. Do not refactor the auth system.
- **`subirFotosManual` base64 encoding** — known inefficiency for large files; out of scope.
- **Fase 2 (AI-generated Kit texts)** — the `textos.redes` and `textos.anuncio` fields are manually filled by the admin. AI generation is a separate future feature.

---

## 6. Testing your changes

There is no integration test suite for the Worker routes. The only automated tests are pure-logic unit tests for `entrega-media.js`:

```bash
node --test worker/src/entrega-media.test.js
```

Run this after any change to `entrega-media.js` to confirm it still passes. For all other changes, the verification is manual or code review.

**Do not run `wrangler deploy` manually.** Deployment happens only via push to `main`, which is controlled by the owner. Your job is to commit the fixes to `claude/magical-allen-skg4z0`.

---

## 7. Commit instructions

Use conventional commit messages in this format (the project uses a Rxx prefix for rounds of work):

```
fix(entrega): <what was fixed in under 70 chars>
```

Or for multiple fixes in one commit:

```
fix(entrega): recorrido 360, propiedadNombre, streamCustomer guard, Drive content-type, btnVideo href
```

Push to `origin claude/magical-allen-skg4z0` after committing.

---

## 8. Questions to ask the owner before starting

Below are the open questions that **must be answered before implementing certain fixes**. Do not make assumptions — ask all of them:

1. **Bug 2 — Estreno title:** The large animated title in the Estreno intro currently shows the client's full name (e.g., "María González"). The fix would change it to the property address (e.g., "Av. Lomas del Valle 123"). Is that the correct behavior? And what should the smaller subtitle line (`propiedadUbicacion`) show — the full address, a neighborhood, municipality, or should it be left empty to avoid repeating the address? Currently both lines come from the same `direccion` field.

2. **Bug 3 — `STREAM_CUSTOMER_CODE`:** The `customer-xxxx` code (found in the Cloudflare Stream dashboard embed code) must be filled in `worker/wrangler.toml` line 24 (`STREAM_CUSTOMER_CODE = ""`). Can you provide that value? Without it, Stream video playback will never work, even after the code fix.

3. **Bug 5 — Video download for Stream:** The fix sends clients to the Stream watch page (`https://customer-xxxx.cloudflarestream.com/<id>/watch`) where they can download. Is this acceptable, or would you prefer to always link to the Drive folder (where the original file lives), or hide the download button entirely when the video is on Stream?

4. **General:** Are there any other behaviors in `entrega.html` or the admin gallery panel that you know are broken or feel wrong from using them in practice — anything not listed in this document?

---

## 9. File map summary (quick reference)

```
contratos-iav-v4/
├── frontend/
│   ├── entrega.html          ← Bug 3 (playVideo guard), Bug 5 (btnVideo href)
│   └── admin.html            ← No changes needed (bugs are all in Worker)
├── worker/
│   ├── wrangler.toml         ← Bug 3 config (STREAM_CUSTOMER_CODE — owner fills this)
│   └── src/
│       ├── entrega-media.js  ← No changes needed
│       ├── entrega-media.test.js ← Run after any change to entrega-media.js
│       └── routes/
│           ├── contratos.js  ← Bug 1 (guardarConfigEntrega SQL), Bug 2 (propiedadNombre),
│           │                    Bug 3 (confirmarVideoEntrega streamCustomer), Bug 4 (Drive content-type check)
│           └── portal.js     ← No changes needed (payloadEntrega is correct given DB data)
└── docs/
    └── RONDAS.md             ← Document changes here after implementing (add a new R129 entry
                                 with date/time in Monterrey timezone and list what was changed)
```

**To get the current Monterrey time for `RONDAS.md`:**
```bash
TZ="America/Monterrey" date "+%Y-%m-%d %H:%M:%S %Z"
```

---

*End of handoff document. Ask all questions before writing any code.*
