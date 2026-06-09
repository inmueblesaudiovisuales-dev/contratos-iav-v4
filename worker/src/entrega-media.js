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
