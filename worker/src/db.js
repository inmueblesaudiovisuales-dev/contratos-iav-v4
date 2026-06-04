export async function query(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return params.length ? stmt.bind(...params).all() : stmt.all();
}

export async function queryOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const result = params.length
    ? await stmt.bind(...params).first()
    : await stmt.first();
  return result || null;
}

export async function run(db, sql, params = []) {
  const stmt = db.prepare(sql);
  return params.length ? stmt.bind(...params).run() : stmt.run();
}

// D1 ignora PRAGMA foreign_keys — cascades manuales con batch en orden correcto
export async function batch(db, statements) {
  return db.batch(
    statements.map(({ sql, params = [] }) =>
      params.length ? db.prepare(sql).bind(...params) : db.prepare(sql)
    )
  );
}

export function uuid() {
  return crypto.randomUUID();
}

export function now() {
  return new Date().toISOString();
}

// Strings YYYY-MM-DD sin hora se parsean como UTC medianoche — agregar T12:00:00 para evitar desfase
export function parseFecha(str) {
  if (!str) return null;
  if (str.includes('T')) return new Date(str);
  return new Date(str + 'T12:00:00');
}

// Normaliza teléfono a 10 dígitos nacionales (MX) para dedupe.
// Quita no-dígitos y prefijos 52 / 521 de larga distancia. Espejo de normalizarTelWA() del frontend.
export function normalizarTel(tel) {
  if (!tel) return '';
  let d = String(tel).replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('521')) d = d.slice(3);
  else if (d.length === 12 && d.startsWith('52')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d;
}
