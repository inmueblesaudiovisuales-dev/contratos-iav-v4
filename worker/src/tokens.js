import { queryOne, run, uuid } from './db.js';

export async function crearTokenPortal(db, contratoId, expiresHours = 72) {
  const token = uuid();
  const expira = new Date(Date.now() + expiresHours * 3600 * 1000).toISOString();
  await run(db,
    'INSERT INTO tokens (token, contrato_id, tipo, expira, usado) VALUES (?, ?, ?, ?, 0)',
    [token, contratoId, 'contrato', expira]
  );
  return token;
}

export async function refrescarExpiry(db, contratoId, hours = 72) {
  const expira = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  await run(db,
    'UPDATE tokens SET expira = ? WHERE contrato_id = ? AND tipo = \'contrato\' AND usado = 0',
    [expira, contratoId]
  );
}

export async function marcarUsado(db, token) {
  await run(db, 'UPDATE tokens SET usado = 1 WHERE token = ?', [token]);
}
