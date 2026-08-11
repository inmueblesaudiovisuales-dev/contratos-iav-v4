import { test } from 'node:test';
import assert from 'node:assert';
import {
  firmar, verificarFirma, secretoFirma, llaveR2,
  esImagen, esVideo, nombreDescarga,
  numeroDePartes, requiereMultiparte, TAMANO_PARTE, perfilWatermark,
  cabecerasRango
} from './entregas-media.js';

const ENV = { ENTREGAS_KEY: 'secreto-de-prueba' };

// ── Firmas ────────────────────────────────────────────────────────────────────

test('una firma recien hecha es valida para su recurso', async () => {
  const f = await firmar(ENV, 'archivo:abc', 300);
  assert.equal(await verificarFirma(ENV, 'archivo:abc', f), true);
});

test('una firma NO sirve para otro recurso', async () => {
  // Si esto fallara, con un enlace de una entrega se podria bajar el de otra.
  const f = await firmar(ENV, 'archivo:abc', 300);
  assert.equal(await verificarFirma(ENV, 'archivo:xyz', f), false);
});

test('una firma caducada se rechaza', async () => {
  const f = await firmar(ENV, 'archivo:abc', -10);   // ya vencida
  assert.equal(await verificarFirma(ENV, 'archivo:abc', f), false);
});

test('no se puede fabricar una firma sin el secreto', async () => {
  const f = await firmar({ ENTREGAS_KEY: 'otro-secreto' }, 'archivo:abc', 300);
  assert.equal(await verificarFirma(ENV, 'archivo:abc', f), false);
});

test('firmas mal formadas no truenan ni pasan', async () => {
  for (const mala of ['', null, undefined, 'basura', '.', 'abc.def', '999999999.']) {
    assert.equal(await verificarFirma(ENV, 'archivo:abc', mala), false);
  }
});

test('manosear el expira invalida la firma', async () => {
  const f = await firmar(ENV, 'archivo:abc', 60);
  const [, mac] = f.split('.');
  const estirada = `${Math.floor(Date.now() / 1000) + 99999}.${mac}`;
  assert.equal(await verificarFirma(ENV, 'archivo:abc', estirada), false);
});

test('secretoFirma cae en cascada y nunca queda vacio', () => {
  assert.equal(secretoFirma({ ENTREGAS_KEY: 'a', CF_MEDIA_TOKEN: 'b', ADMIN_KEY: 'c' }), 'a');
  assert.equal(secretoFirma({ CF_MEDIA_TOKEN: 'b', ADMIN_KEY: 'c' }), 'b');
  assert.equal(secretoFirma({ ADMIN_KEY: 'c' }), 'c');
  assert.ok(secretoFirma({}).length > 0);
});

// ── Llaves de R2 ──────────────────────────────────────────────────────────────

test('llaveR2 agrupa por entrega y no colisiona entre archivos', () => {
  const a = llaveR2('e1', 'a1', 'foto.jpg');
  const b = llaveR2('e1', 'a2', 'foto.jpg');
  assert.ok(a.startsWith('entregas/e1/'));
  assert.notEqual(a, b);   // mismo nombre, distinto archivo
});

test('llaveR2 limpia nombres peligrosos', () => {
  const k = llaveR2('e1', 'a1', '../../etc/passwd');
  assert.ok(!k.includes('..'));
  assert.equal(k.split('/').length, 3);   // entregas/<entrega>/<archivo>
});

test('llaveR2 aguanta acentos, espacios y nombres larguisimos', () => {
  const k = llaveR2('e1', 'a1', 'Casa Valle Alto — fachada ñ.jpg');
  assert.ok(/^entregas\/e1\/a1-[\w.\-]+$/.test(k), k);
  const largo = llaveR2('e1', 'a1', 'x'.repeat(500));
  assert.ok(largo.length < 200);
});

// ── Tipos ─────────────────────────────────────────────────────────────────────

test('esImagen y esVideo reconocen lo que sirve', () => {
  assert.equal(esImagen('image/jpeg'), true);
  assert.equal(esImagen('image/png'), true);
  assert.equal(esImagen('image/webp'), true);
  assert.equal(esImagen('image/tiff'), false);   // el navegador no la muestra
  assert.equal(esImagen('video/mp4'), false);
  assert.equal(esVideo('video/mp4'), true);
  assert.equal(esVideo('video/quicktime'), true);
  assert.equal(esVideo('image/jpeg'), false);
  assert.equal(esImagen(null), false);
  assert.equal(esVideo(undefined), false);
});

test('nombreDescarga nunca devuelve vacio', () => {
  assert.equal(nombreDescarga('foto.jpg'), 'foto.jpg');
  assert.equal(nombreDescarga('   ', 'entrega.zip'), 'entrega.zip');
  assert.equal(nombreDescarga(null, 'entrega.zip'), 'entrega.zip');
  assert.equal(nombreDescarga('', ''), 'archivo');
});

// ── Multiparte ────────────────────────────────────────────────────────────────

test('una foto normal no necesita multiparte', () => {
  assert.equal(requiereMultiparte(12 * 1024 * 1024), false);
  assert.equal(numeroDePartes(12 * 1024 * 1024), 1);
});

test('un video de 1.1 GB se parte en trozos que si caben en un Worker', () => {
  const bytes = Math.round(1.1 * 1024 * 1024 * 1024);
  const partes = numeroDePartes(bytes);
  assert.ok(partes > 1);
  assert.ok(TAMANO_PARTE < 100 * 1024 * 1024, 'cada parte debe caber en el limite del Worker');
  assert.equal(partes, Math.ceil(bytes / TAMANO_PARTE));
});

test('el borde exacto del tamano de parte no se pasa de largo', () => {
  assert.equal(numeroDePartes(TAMANO_PARTE), 1);
  assert.equal(numeroDePartes(TAMANO_PARTE + 1), 2);
  assert.equal(numeroDePartes(0), 0);
  assert.equal(numeroDePartes(-5), 0);
});

// ── Watermark ─────────────────────────────────────────────────────────────────

test('un video vertical usa el perfil vertical cuando existe', () => {
  // El PNG mide 2622x225: en vertical, con la escala horizontal, queda ilegible.
  const env = { STREAM_WATERMARK_UID: 'horiz', STREAM_WATERMARK_UID_VERTICAL: 'vert' };
  assert.equal(perfilWatermark(env, 1080, 1920), 'vert');
  assert.equal(perfilWatermark(env, 1920, 1080), 'horiz');
  assert.equal(perfilWatermark(env, 1080, 1080), 'horiz');   // cuadrado va al horizontal
});

test('sin perfil vertical configurado se cae al horizontal, no a vacio', () => {
  const env = { STREAM_WATERMARK_UID: 'horiz' };
  assert.equal(perfilWatermark(env, 1080, 1920), 'horiz');
});

// ── Descargas parciales ───────────────────────────────────────────────────────
// Un video de IAV pesa ~1 GB. Si estas cabeceras mienten, el navegador se queda
// esperando bytes que no llegan y la descarga muere sin decir por que.

const GB = 986 * 1024 * 1024;

test('sin rango se anuncia el archivo completo', () => {
  const c = cabecerasRango(null, GB);
  assert.equal(c.status, 200);
  assert.equal(c.contentLength, GB);
  assert.equal(c.contentRange, '');
});

test('un rango normal contesta 206 y dice exactamente que pedazo va', () => {
  const c = cabecerasRango({ offset: 0, length: 1000 }, GB);
  assert.equal(c.status, 206);
  assert.equal(c.contentLength, 1000);
  assert.equal(c.contentRange, `bytes 0-999/${GB}`);
});

test('retomar a media descarga pide de un punto al final', () => {
  // Es el caso real: se cayo el internet a los 800 MB y el navegador retoma.
  const desde = 800 * 1024 * 1024;
  const c = cabecerasRango({ offset: desde }, GB);
  assert.equal(c.status, 206);
  assert.equal(c.contentLength, GB - desde);
  assert.equal(c.contentRange, `bytes ${desde}-${GB - 1}/${GB}`);
});

test('el sufijo pide los ultimos bytes, no los primeros', () => {
  const c = cabecerasRango({ suffix: 500 }, GB);
  assert.equal(c.contentLength, 500);
  assert.equal(c.contentRange, `bytes ${GB - 500}-${GB - 1}/${GB}`);
});

test('un sufijo mas grande que el archivo no genera un inicio negativo', () => {
  const c = cabecerasRango({ suffix: 5000 }, 1000);
  assert.equal(c.contentLength, 1000);
  assert.equal(c.contentRange, 'bytes 0-999/1000');
});

test('un rango que se pasa del final se recorta en vez de mentir', () => {
  // Sin el recorte, Content-Length prometeria mas bytes de los que existen.
  const c = cabecerasRango({ offset: 900, length: 5000 }, 1000);
  assert.equal(c.contentLength, 100);
  assert.equal(c.contentRange, 'bytes 900-999/1000');
});

test('un offset fuera del archivo no produce un largo negativo', () => {
  const c = cabecerasRango({ offset: 5000, length: 10 }, 1000);
  assert.equal(c.contentLength, 0);
});
