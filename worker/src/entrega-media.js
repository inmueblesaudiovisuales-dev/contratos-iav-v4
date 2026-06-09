// Helpers puros de media de entrega. Sin I/O.

export function esFotoWeb(file) {
  const m = ((file && file.mimeType) || '').toLowerCase();
  return m === 'image/jpeg' || m === 'image/png' || m === 'image/webp';
}

export function esVideoWeb(nombre) {
  return /_web\.[a-z0-9]+$/i.test(nombre || '');
}

// Extrae el "account hash" de Cloudflare Images de una URL de variante que
// devuelve la API al subir, p. ej. https://imagedelivery.net/<hash>/<id>/public
export function hashDeVariante(url) {
  const m = String(url || '').match(/imagedelivery\.net\/([^/]+)\//);
  return m ? m[1] : '';
}
