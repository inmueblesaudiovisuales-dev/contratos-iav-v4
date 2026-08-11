// Media del sistema de entregas: R2 (originales limpios), Images (fotos con mosaico),
// Stream (video con marca quemada) y firmas temporales para descarga.
//
// RESTRICCION QUE DEFINE EL DISENO: el cuerpo de una peticion a un Worker topa en
// ~100 MB. Un video de 1 GB NO puede pasar entero por aqui. Por eso:
//   - Fotos  -> viajan enteras (10-20 MB), en una sola peticion.
//   - Video  -> subida multiparte a R2 en trozos de 90 MB. Cada trozo cabe.
// Y para no subir el video dos veces (una a R2 y otra a Stream), Stream lo COPIA
// desde una URL firmada que sirve el propio Worker leyendo de R2.

const PARTE_MAX = 90 * 1024 * 1024;
export const TAMANO_PARTE = PARTE_MAX;

// ── Firmas temporales ─────────────────────────────────────────────────────────
// HMAC-SHA256 sobre "recurso:expira". Sin secreto no se puede fabricar un enlace,
// y aunque alguien copie uno, caduca. Es lo que impide que una URL de descarga se
// comparta o se raspe despues de que el material se libero.

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secreto, mensaje) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(mensaje)));
}

export function secretoFirma(env) {
  // Reutiliza una clave que ya existe en el entorno; nunca se expone al cliente.
  return env.ENTREGAS_KEY || env.CF_MEDIA_TOKEN || env.ADMIN_KEY || 'iav-entregas';
}

export async function firmar(env, recurso, segundos = 300) {
  const expira = Math.floor(Date.now() / 1000) + segundos;
  const f = await hmac(secretoFirma(env), `${recurso}:${expira}`);
  return `${expira}.${f}`;
}

export async function verificarFirma(env, recurso, firma) {
  const s = String(firma || '');
  const i = s.indexOf('.');
  if (i < 1) return false;
  const expira = Number(s.slice(0, i));
  if (!Number.isFinite(expira) || expira < Math.floor(Date.now() / 1000)) return false;
  const esperado = await hmac(secretoFirma(env), `${recurso}:${expira}`);
  // Comparacion de largo constante: no filtrar por tiempo cuanto coincidio.
  const dado = s.slice(i + 1);
  if (dado.length !== esperado.length) return false;
  let dif = 0;
  for (let k = 0; k < dado.length; k++) dif |= dado.charCodeAt(k) ^ esperado.charCodeAt(k);
  return dif === 0;
}

// ── Llaves de R2 ──────────────────────────────────────────────────────────────
export function llaveR2(entregaId, archivoId, nombre) {
  // R2 no tiene directorios, asi que ".." no es traversal — pero un nombre sucio
  // igual ensucia la llave y complica depurar. Se normaliza a algo predecible.
  const limpio = String(nombre || 'archivo')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/_{2,}/g, '_')
    .slice(-120);
  return `entregas/${entregaId}/${archivoId}-${limpio}`;
}

// ── Cloudflare Images ─────────────────────────────────────────────────────────
// Sube SOLO la copia ya marcada por el navegador. El original limpio jamas llega
// a Images: Images sirve URLs publicas y ahi se caeria el candado entero.
export async function subirPreviewImages(env, blob, nombre) {
  const form = new FormData();
  form.append('file', blob, nombre || 'preview.jpg');
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1`,
    { method: 'POST', headers: { Authorization: `Bearer ${env.CF_MEDIA_TOKEN}` }, body: form });
  const j = await r.json();
  if (!j || !j.success || !j.result) return null;
  const variante = (j.result.variants && j.result.variants[0]) || '';
  const m = String(variante).match(/imagedelivery\.net\/([^/]+)\//);
  return { id: j.result.id, hash: m ? m[1] : '' };
}

export async function borrarDeImages(env, imagesId) {
  if (!imagesId) return false;
  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/${imagesId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${env.CF_MEDIA_TOKEN}` } });
    return r.ok;
  } catch (e) { console.error('borrarDeImages', e.message); return false; }
}

// ── Cloudflare Stream ─────────────────────────────────────────────────────────
// El watermark se quema AL CODIFICAR y no se puede cambiar despues. Por eso el
// perfil se manda siempre en la copia, nunca se aplica "luego".
export async function copiarAStream(env, urlOrigen, nombre, watermarkUid) {
  const body = { url: urlOrigen, meta: { name: nombre || 'entrega' } };
  const uid = watermarkUid || env.STREAM_WATERMARK_UID;
  if (uid) body.watermark = { uid };
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/copy`,
    { method: 'POST',
      headers: { Authorization: `Bearer ${env.CF_MEDIA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body) });
  const j = await r.json();
  if (!j || !j.success || !j.result) {
    const msg = (j && j.errors && j.errors[0] && j.errors[0].message) || 'error desconocido';
    throw new Error('Stream rechazó la copia: ' + msg);
  }
  const prev = String(j.result.preview || j.result.thumbnail || '');
  const m = prev.match(/(customer-[^.]+)\./);
  return { uid: j.result.uid, customer: m ? m[1] : '' };
}

export async function borrarDeStream(env, uid) {
  if (!uid) return false;
  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/${uid}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${env.CF_MEDIA_TOKEN}` } });
    return r.ok;
  } catch (e) { console.error('borrarDeStream', e.message); return false; }
}

// El PNG del watermark mide 2622x225 (11.7:1). A scale 0.45 se lee bien en horizontal,
// pero en vertical —que es el formato nativo de IAV— queda demasiado chico. Esta
// funcion elige el perfil segun la forma del video.
export function perfilWatermark(env, ancho, alto) {
  const esVertical = Number(alto) > Number(ancho);
  if (esVertical && env.STREAM_WATERMARK_UID_VERTICAL) return env.STREAM_WATERMARK_UID_VERTICAL;
  return env.STREAM_WATERMARK_UID || '';
}

// ── R2 ────────────────────────────────────────────────────────────────────────
export async function guardarEnR2(env, key, body, mime) {
  await env.ENTREGAS_ORIGINALES.put(key, body, {
    httpMetadata: { contentType: mime || 'application/octet-stream' }
  });
  return key;
}

export async function borrarDeR2(env, key) {
  if (!key) return false;
  try { await env.ENTREGAS_ORIGINALES.delete(key); return true; }
  catch (e) { console.error('borrarDeR2', e.message); return false; }
}

// Borra TODO el material de una entrega. Se llama al expirar y al borrar a mano.
// Devuelve el conteo de lo que si se pudo borrar para poder reportarlo honesto:
// si algo falla no se puede decir "quedo limpio".
export async function borrarMediaDeEntrega(env, archivos) {
  const r = { r2: 0, images: 0, stream: 0, fallos: 0 };
  for (const a of (archivos || [])) {
    if (a.r2_key)     { (await borrarDeR2(env, a.r2_key))         ? r.r2++     : r.fallos++; }
    if (a.images_id)  { (await borrarDeImages(env, a.images_id))  ? r.images++ : r.fallos++; }
    if (a.stream_uid) { (await borrarDeStream(env, a.stream_uid)) ? r.stream++ : r.fallos++; }
  }
  return r;
}

// ── Utilidades ────────────────────────────────────────────────────────────────
export function esImagen(mime) {
  return /^image\/(jpeg|png|webp|avif)$/i.test(String(mime || ''));
}

export function esVideo(mime) {
  return /^video\//i.test(String(mime || ''));
}

export function nombreDescarga(nombre, fallback) {
  const n = String(nombre || '').trim();
  return n || fallback || 'archivo';
}

// Cuantos trozos hacen falta para un archivo. El navegador usa esto para saber
// si tiene que ir por la ruta multiparte o si cabe en una sola peticion.
export function numeroDePartes(bytes) {
  const b = Number(bytes) || 0;
  return b <= 0 ? 0 : Math.ceil(b / PARTE_MAX);
}

export function requiereMultiparte(bytes) {
  return numeroDePartes(bytes) > 1;
}
