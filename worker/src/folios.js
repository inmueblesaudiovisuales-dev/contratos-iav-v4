import { parseFecha, query } from './db.js';

export function generarFolio(fechaSesionStr) {
  const fecha = parseFecha(fechaSesionStr);
  const yy = String(fecha.getFullYear()).slice(-2);
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  return `IAV-${yy}${mm}.${dd}`;
}

export async function asignarFolio(db, fechaSesionStr) {
  const base = generarFolio(fechaSesionStr);
  const { results } = await query(db,
    "SELECT folio FROM contratos WHERE folio LIKE ?",
    [base + '-%']
  );
  const letrasUsadas = new Set(
    results
      .map(r => r.folio.slice(base.length + 1))
      .filter(s => /^[A-Z]$/.test(s))
  );
  for (let i = 0; i < 26; i++) {
    const letra = String.fromCharCode(65 + i);
    if (!letrasUsadas.has(letra)) return `${base}-${letra}`;
  }
  return `${base}-?`;
}
