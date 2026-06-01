import { parseFecha } from './db.js';

export function generarFolio(fechaSesionStr) {
  const fecha = parseFecha(fechaSesionStr);
  const yy = String(fecha.getFullYear()).slice(-2);
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  return `IAV-${yy}${mm}.${dd}`;
}
