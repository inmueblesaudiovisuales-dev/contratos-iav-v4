import { query, queryOne, run } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';

export async function handlePaquetes(request, env, ctx, action) {
  const db = env.DB;

  if (action === 'listarPaquetes') {
    const tipo = new URL(request.url).searchParams.get('tipo') || '';
    let sql = 'SELECT * FROM paquetes WHERE activo = 1';
    const params = [];
    if (tipo) {
      sql += " AND (tipo = ? OR tipo = 'Ambos')";
      params.push(tipo);
    }
    sql += ' ORDER BY orden';
    const { results } = await query(db, sql, params);
    return ok({ ok: true, paquetes: results });
  }

  if (action === 'listarPaquetesTodos') {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const { results } = await query(db, 'SELECT * FROM paquetes ORDER BY orden');
    return ok({ ok: true, paquetes: results });
  }

  if (action === 'crearPaquete') {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const body = await request.json();
    const { clave, tipo, nombre, precio, esAdicional, entregables, orden } = body;
    if (!clave || !tipo || !nombre || precio == null) return err('Faltan campos requeridos');
    await run(db,
      'INSERT INTO paquetes (clave, tipo, nombre, precio, es_adicional, entregables, activo, orden) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
      [clave, tipo, nombre, precio, esAdicional ? 1 : 0, entregables || '', orden || 0]
    );
    return ok({ ok: true });
  }

  if (action === 'editarPaquete') {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const body = await request.json();
    const { clave, tipo, nombre, precio, esAdicional, entregables, orden } = body;
    await run(db,
      'UPDATE paquetes SET tipo=?, nombre=?, precio=?, es_adicional=?, entregables=?, orden=? WHERE clave=?',
      [tipo, nombre, precio, esAdicional ? 1 : 0, entregables || '', orden || 0, clave]
    );
    return ok({ ok: true });
  }

  if (action === 'togglePaquete') {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const body = await request.json();
    const { clave } = body;
    const p = await queryOne(db, 'SELECT activo FROM paquetes WHERE clave = ?', [clave]);
    if (!p) return err('Paquete no encontrado', 404);
    // Si el body trae el valor deseado explícitamente, usarlo; si no, hacer toggle
    const nuevoActivo = body.activo !== undefined ? (body.activo ? 1 : 0) : (p.activo ? 0 : 1);
    await run(db, 'UPDATE paquetes SET activo = ? WHERE clave = ?', [nuevoActivo, clave]);
    return ok({ ok: true });
  }

  return err('Acción no encontrada', 404);
}
