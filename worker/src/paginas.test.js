// R149 — Como se sirve la pagina del cliente. El caso que tumbo todo fue una liga con
// una letra de menos: 404 con cero bytes = pantalla en blanco sin error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginaDeRuta, esRutaDeArchivo, servirPagina, HTML_RESPALDO } from './paginas.js';

const E = 'entregas.inmueblesaudiovisuales.com';
const C = 'contratos.inmueblesaudiovisuales.com';

test('la liga truncada del 27 sep recibe la pagina, no un 404 vacio', () => {
  assert.equal(paginaDeRuta(E, '/IAV-2609.17-B-v9aeztv4c'), '/entregas-cliente');
  assert.equal(paginaDeRuta(E, '/IAV-2609.17-B-v9aeztv4c4'), '/entregas-cliente');
  assert.equal(paginaDeRuta(E, '/IAV-2609.17'), '/entregas-cliente');   // el punto del folio no es extension
  assert.equal(paginaDeRuta(E, '/IAV-2609.17-B-V9AEZTV4C4/'), '/entregas-cliente');
  assert.equal(paginaDeRuta(E, '/cualquier/cosa'), '/entregas-cliente');
});

test('el portal de control sigue en /, /e y /e/...', () => {
  assert.equal(paginaDeRuta(E, '/'), '/entregas');
  assert.equal(paginaDeRuta(E, '/e'), '/entregas');
  assert.equal(paginaDeRuta(E, '/e/abc'), '/entregas');
});

test('/ver/ en contratos.* sirve la pagina del cliente, lo demas de contratos.* no se toca', () => {
  assert.equal(paginaDeRuta(C, '/ver/IAV-2609.17-B-v9aeztv4c4'), '/entregas-cliente');
  assert.equal(paginaDeRuta(C, '/ver/IAV-2609.17-B-v9aez'), '/entregas-cliente');
  assert.equal(paginaDeRuta(C, '/'), null);
  assert.equal(paginaDeRuta(C, '/admin'), null);
  assert.equal(paginaDeRuta(C, '/portal'), null);
  assert.equal(paginaDeRuta(C, '/checklist'), null);
  assert.equal(paginaDeRuta(C, '/IAV-2609.17-B-v9aeztv4c4'), null);
});

test('los archivos siguen yendo a Assets en entregas.*', () => {
  for (const p of ['/favicon.ico', '/apple-touch-icon.png', '/robots.txt', '/assets/logo-invertido.svg',
                   '/checklist-logic.js', '/site.webmanifest']) {
    assert.equal(esRutaDeArchivo(p), true, p);
    assert.equal(paginaDeRuta(E, p), null, p);
  }
});

// Assets falso: registra lo que se le pidio y contesta lo que el test diga.
function assetsFalso(res) {
  const pedidos = [];
  return { pedidos, ASSETS: { fetch: async (req) => { pedidos.push(req); return typeof res === 'function' ? res(req) : res; } } };
}
const HTML = '<!DOCTYPE html><html><body><p>Cargando tu entrega…</p></body></html>';

test('siempre 200 con cuerpo completo y sin validadores de cache', async () => {
  const env = assetsFalso(() => new Response(HTML, { status: 200, headers: {
    'ETag': '"abc"', 'Last-Modified': 'Mon, 01 Sep 2026 00:00:00 GMT',
    'Cache-Control': 'public, max-age=0, must-revalidate', 'Content-Type': 'text/html' } }));
  const req = new Request('https://' + E + '/IAV-2609.17-B-v9aeztv4c4', {
    headers: { 'If-None-Match': '"abc"', 'If-Modified-Since': 'Mon, 01 Sep 2026 00:00:00 GMT',
               'Accept-Encoding': 'gzip, br' } });
  const r = await servirPagina(env, req, '/entregas-cliente');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), HTML);
  assert.equal(r.headers.get('etag'), null);
  assert.equal(r.headers.get('last-modified'), null);
  assert.equal(r.headers.get('content-encoding'), null);
  assert.equal(r.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.match(r.headers.get('cache-control'), /no-store/);
  // A Assets no le llegan las cabeceras condicionales del navegador: no hay 304 posible
  const p = env.pedidos[0];
  assert.equal(new URL(p.url).pathname, '/entregas-cliente');
  assert.equal(p.method, 'GET');
  assert.equal(p.headers.get('if-none-match'), null);
  assert.equal(p.headers.get('if-modified-since'), null);
});

test('si Assets contesta 304 o 404, nunca sale una pagina vacia', async () => {
  for (const st of [304, 404, 500]) {
    const env = assetsFalso(() => new Response(null, { status: st }));
    const r = await servirPagina(env, new Request('https://' + E + '/x-abcdefghjk'), '/entregas-cliente');
    const t = await r.text();
    assert.ok(t.length > 200, 'cuerpo con ' + st);
    assert.equal(t, HTML_RESPALDO);
    assert.equal(r.status, 503);
  }
});

test('si Assets truena, tambien hay pagina de respaldo', async () => {
  const env = { ASSETS: { fetch: async () => { throw new Error('boom'); } } };
  const r = await servirPagina(env, new Request('https://' + E + '/x'), '/entregas-cliente');
  assert.equal(r.status, 503);
  assert.match(await r.text(), /WhatsApp/);
});

test('HEAD contesta 200 sin cuerpo, pero a Assets se le pide GET', async () => {
  const env = assetsFalso(() => new Response(HTML, { status: 200 }));
  const r = await servirPagina(env, new Request('https://' + E + '/IAV-1-abcdefghjk', { method: 'HEAD' }), '/entregas-cliente');
  assert.equal(r.status, 200);
  assert.equal(env.pedidos[0].method, 'GET');
});
