import { query, queryOne, run, uuid, now } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';

export async function handleClientes(request, env, ctx, action) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;

  if (action === 'crearCliente') {
    const body = await request.json();
    const { nombre, telefono, correo, origen, notasPerfil } = body;
    if (!nombre) return err('Nombre requerido');
    const id = uuid();
    await run(db,
      `INSERT INTO clientes (id, nombre, telefono, correo, origen, notas_perfil, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, nombre, telefono || '', correo || '', origen || '', notasPerfil || '', now()]
    );
    return ok({ ok: true, id });
  }

  if (action === 'listarClientes') {
    const { results } = await query(db,
      `SELECT c.*,
              (SELECT COUNT(*) FROM trabajos t
               WHERE t.cliente_id = c.id
               AND t.estatus IN ('nuevo','intentando','en_seguimiento','cotizado')) AS trabajos_activos,
              (SELECT COUNT(*) FROM contratos ct
               WHERE ct.cliente_id = c.id) AS num_contratos
       FROM clientes c
       ORDER BY CASE WHEN c.fecha_ultima_actividad = '' OR c.fecha_ultima_actividad IS NULL
                THEN c.fecha_creacion ELSE c.fecha_ultima_actividad END DESC`
    );
    return ok({ ok: true, clientes: results });
  }

  if (action === 'obtenerCliente') {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return err('id requerido');
    const cliente = await queryOne(db, 'SELECT * FROM clientes WHERE id = ?', [id]);
    if (!cliente) return err('Cliente no encontrado', 404);
    const { results: trabajos } = await query(db,
      'SELECT * FROM trabajos WHERE cliente_id = ? ORDER BY fecha_creacion DESC', [id]
    );
    const { results: contratos } = await query(db,
      `SELECT token, folio, estatus, precio_total, saldo_pendiente, fecha_creacion
       FROM contratos WHERE cliente_id = ? ORDER BY fecha_creacion DESC`, [id]
    );
    const { results: actividades } = await query(db,
      `SELECT * FROM actividades WHERE cliente_id = ?
       ORDER BY fecha_actividad DESC, fecha_creacion DESC LIMIT 50`, [id]
    );
    return ok({ ok: true, cliente, trabajos, contratos, actividades });
  }

  if (action === 'actualizarCliente') {
    const body = await request.json();
    const { id, nombre, telefono, correo, origen, notasPerfil } = body;
    if (!id) return err('id requerido');
    if (!nombre) return err('Nombre requerido');
    await run(db,
      `UPDATE clientes SET nombre=?, telefono=?, correo=?, origen=?, notas_perfil=? WHERE id=?`,
      [nombre, telefono || '', correo || '', origen || '', notasPerfil || '', id]
    );
    return ok({ ok: true });
  }

  return err('Acción no encontrada', 404);
}
