// R149 — Como se sirven las paginas del sistema de entregas.
//
// Lo que paso: la liga de IAV-2609.17-B se escribio a mano en WhatsApp y salio sin
// su ultima letra. Un codigo de 9 letras no pasaba codigoDeRuta(), asi que el Worker
// se lo dejaba a Assets, que no tiene ese archivo y contestaba 404 con CERO bytes.
// Un 404 vacio es una pantalla en blanco en cualquier navegador: sin texto, sin
// error, sin "Cargando…" — por eso lo de R148 no se veia. Se abrio unas 60 veces
// desde varios iPhone, Windows y Facebook; los que usaban la liga correcta si abrian,
// y de ahi el "en unos dispositivos si y en otros no".
//
// Regla nueva: en entregas.* y bajo /ver/, TODA ruta que no sea un archivo estatico
// recibe la pagina, siempre 200 y con cuerpo. La pagina es la que decide que decir
// (rescatar la liga, "liga incompleta", "no encontrada"), con texto y con WhatsApp.
// El servidor ya no tiene forma de devolver una pantalla vacia.

// Lo que SI es un archivo y debe seguir yendo a Assets (y dar 404 si no existe):
// favicon, iconos de Apple, robots, imagenes, scripts. Ojo con el folio: trae un punto
// (IAV-2609.17-B), por eso no basta con "tiene punto"; hay que mirar la extension.
const EXT_ARCHIVO = /\.(ico|png|jpe?g|gif|svg|webp|avif|css|m?js|map|json|txt|xml|webmanifest|woff2?|ttf|otf|pdf|zip|mp4|mov)$/i;

export function esRutaDeArchivo(path) {
  return EXT_ARCHIVO.test(String(path || ''));
}

// Que pagina toca servir, o null si la peticion no es del sistema de entregas y debe
// seguir su camino de siempre (contratos.*, admin, portal, checklist).
export function paginaDeRuta(hostname, path) {
  const esHostEntregas = String(hostname || '').startsWith('entregas.');
  if (esHostEntregas && (path === '/' || path === '/e' || path.startsWith('/e/'))) {
    return '/entregas';                                   // portal de control
  }
  if (path.startsWith('/ver/') || path === '/ver') return '/entregas-cliente';
  if (esHostEntregas && !esRutaDeArchivo(path)) return '/entregas-cliente';
  return null;
}

// Cabeceras de la pagina, armadas desde cero. Antes se copiaban TODAS las del asset y
// se le encimaba no-store; eso arrastraba lo que Assets quisiera mandar (validadores,
// codificacion) a una respuesta que ya no era la suya. Aqui solo va lo que describe
// este cuerpo: sin ETag ni Last-Modified no hay 304 posible, y sin Content-Encoding
// propio la compresion la decide el borde para el cuerpo real.
export function cabecerasPagina() {
  return new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  });
}

// Por si Assets falla (despliegue a medias, archivo renombrado). Nunca vacia: el
// cliente ve que pasa y tiene a donde escribir.
const WA = 'https://wa.me/5218127174207';
export const HTML_RESPALDO = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>Inmuebles Audiovisuales</title></head>' +
  '<body style="margin:0;font-family:system-ui,sans-serif;background:#F7F4EC;color:#211E18;' +
  'min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:28px">' +
  '<div><p style="font-size:15px">Inmuebles <b style="color:#B08D2E">Audiovisuales</b></p>' +
  '<p style="font-size:14px;color:#5C564A">No pudimos abrir esta página. Recárgala en un momento.</p>' +
  '<p><a href="' + WA + '" style="color:#2F7D55">¿Dudas? Escríbenos por WhatsApp</a></p>' +
  '<p style="font-size:11px;color:#B8B0A0;font-family:monospace">Easset</p></div></body></html>';

export async function servirPagina(env, request, ruta) {
  // Peticion NUEVA hacia Assets, no una copia de la del navegador: sin If-None-Match
  // ni If-Modified-Since no puede volver un 304 sin cuerpo, y siempre es GET (un HEAD
  // tambien volveria sin cuerpo).
  let html = '';
  try {
    const r = await env.ASSETS.fetch(new Request(new URL(ruta, request.url), {
      method: 'GET', headers: { 'Accept': 'text/html' }
    }));
    if (r.status === 200) html = await r.text();
    else console.error('pagina ' + ruta + ': Assets contesto ' + r.status);
  } catch (e) {
    console.error('pagina ' + ruta + ': Assets fallo', (e && e.stack) || e);
  }
  const status = html ? 200 : 503;
  if (!html) html = HTML_RESPALDO;
  const cuerpo = request.method === 'HEAD' ? null : html;
  return new Response(cuerpo, { status, headers: cabecerasPagina() });
}
