import { query, queryOne, run, batch, uuid, now } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';

export async function handleClientes(request, env, ctx, action) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;

  if (action === 'crearCliente') {
    const body = await request.json();
    const { nombre, telefono, correo, origen, notasPerfil, inmobiliaria } = body;
    if (!nombre) return err('Nombre requerido');
    const id = uuid();
    await run(db,
      `INSERT INTO clientes (id, nombre, telefono, correo, origen, notas_perfil, inmobiliaria, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, nombre, telefono || '', correo || '', origen || '', notasPerfil || '', inmobiliaria || '', now()]
    );
    return ok({ ok: true, id });
  }

  if (action === 'listarClientes') {
    const { results } = await query(db,
      `WITH clientes_base AS (
         SELECT id, nombre, telefono, correo, origen, notas_perfil, inmobiliaria, fecha_creacion, fecha_ultima_actividad
         FROM clientes
         UNION ALL
         SELECT '' AS id, ct.nombre_cliente AS nombre, MAX(ct.telefono_cliente) AS telefono,
                ct.correo_cliente AS correo, 'contrato' AS origen, '' AS notas_perfil,
                '' AS inmobiliaria,
                MIN(ct.fecha_creacion) AS fecha_creacion, MAX(ct.fecha_creacion) AS fecha_ultima_actividad
         FROM contratos ct
         WHERE ct.oculto = 0
           AND IFNULL(ct.cliente_id, '') = ''
           AND ct.correo_cliente != ''
           AND NOT EXISTS (SELECT 1 FROM clientes c2 WHERE c2.correo = ct.correo_cliente)
         GROUP BY ct.correo_cliente
       )
       SELECT c.*,
              c.id AS cliente_id,
              c.nombre AS nombre_cliente,
              c.telefono AS telefono_cliente,
              c.correo AS correo_cliente,
              (SELECT COUNT(*) FROM trabajos t
               WHERE t.cliente_id = c.id
               AND t.estatus IN ('nuevo','intentando','en_seguimiento','cotizado')) AS trabajos_activos,
              CASE WHEN c.id = ''
                THEN (SELECT COUNT(*) FROM contratos ct WHERE ct.correo_cliente = c.correo AND ct.oculto = 0)
                ELSE (SELECT COUNT(*) FROM contratos ct
                      WHERE ct.oculto = 0
                        AND (ct.cliente_id = c.id
                          OR (c.correo != '' AND IFNULL(ct.cliente_id, '') = '' AND ct.correo_cliente = c.correo)))
              END AS num_contratos,
              CASE WHEN c.id = ''
                THEN (SELECT MAX(ct.fecha_creacion) FROM contratos ct WHERE ct.correo_cliente = c.correo AND ct.oculto = 0)
                ELSE (SELECT MAX(ct.fecha_creacion) FROM contratos ct
                      WHERE ct.oculto = 0
                        AND (ct.cliente_id = c.id
                          OR (c.correo != '' AND IFNULL(ct.cliente_id, '') = '' AND ct.correo_cliente = c.correo)))
              END AS ultimo_contrato,
              CASE WHEN c.id = ''
                THEN (SELECT COALESCE(SUM(ct.precio_total), 0) FROM contratos ct WHERE ct.correo_cliente = c.correo AND ct.oculto = 0)
                ELSE (SELECT COALESCE(SUM(ct.precio_total), 0) FROM contratos ct
                      WHERE ct.oculto = 0
                        AND (ct.cliente_id = c.id
                          OR (c.correo != '' AND IFNULL(ct.cliente_id, '') = '' AND ct.correo_cliente = c.correo)))
              END AS total_facturado
       FROM clientes_base c
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
       FROM contratos
       WHERE oculto = 0
         AND (cliente_id = ? OR (? != '' AND IFNULL(cliente_id, '') = '' AND correo_cliente = ?))
       ORDER BY fecha_creacion DESC`, [id, cliente.correo || '', cliente.correo || '']
    );
    const { results: actividades } = await query(db,
      `SELECT * FROM actividades WHERE cliente_id = ?
       ORDER BY fecha_actividad DESC, fecha_creacion DESC LIMIT 50`, [id]
    );
    return ok({ ok: true, cliente, trabajos, contratos, actividades });
  }

  if (action === 'actualizarCliente') {
    const body = await request.json();
    const { id, nombre, telefono, correo, origen, notasPerfil, inmobiliaria, _soloInmobiliaria } = body;
    if (!id) return err('id requerido');
    if (_soloInmobiliaria) {
      await run(db, `UPDATE clientes SET inmobiliaria=? WHERE id=?`, [inmobiliaria || '', id]);
      return ok({ ok: true });
    }
    if (!nombre) return err('Nombre requerido');
    await run(db,
      `UPDATE clientes SET nombre=?, telefono=?, correo=?, origen=?, notas_perfil=?, inmobiliaria=? WHERE id=?`,
      [nombre, telefono || '', correo || '', origen || '', notasPerfil || '', inmobiliaria || '', id]
    );
    return ok({ ok: true });
  }

  if (action === 'borrarCliente') {
    const body = await request.json();
    const { id } = body;
    if (!id) return err('id requerido');
    const conContrato = await queryOne(db,
      `SELECT token FROM contratos WHERE cliente_id = ? AND oculto = 0 LIMIT 1`, [id]);
    if (conContrato) return err('El cliente tiene contratos activos. Archiva los contratos primero.');
    await batch(db, [
      { sql: 'DELETE FROM trabajos WHERE cliente_id = ?', params: [id] },
      { sql: 'DELETE FROM actividades WHERE cliente_id = ?', params: [id] },
      { sql: 'DELETE FROM clientes WHERE id = ?', params: [id] },
    ]);
    return ok({ ok: true });
  }

  return err('Acción no encontrada', 404);
}
