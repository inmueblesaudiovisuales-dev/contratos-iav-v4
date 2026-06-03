import { query, run, uuid, now } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';
import { callAdapter } from '../google.js';

export async function handleActividades(request, env, ctx, action) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;

  if (action === 'agendarLlamada') {
    const body = await request.json();
    const { clienteId, trabajoId, nombre, telefono, interes,
            fechaLlamada, horaLlamada, descripcion, contratoToken } = body;
    if (!clienteId) return err('clienteId requerido');
    if (!fechaLlamada) return err('fechaLlamada requerida');

    const id = uuid();
    const ts = now();
    await run(db,
      `INSERT INTO actividades (id, cliente_id, trabajo_id, tipo, descripcion, fecha_actividad, hora, fecha_creacion)
       VALUES (?, ?, ?, 'llamada_agendada', ?, ?, ?, ?)`,
      [id, clienteId, trabajoId || '', descripcion || '', fechaLlamada, horaLlamada || '', ts]
    );
    await run(db, `UPDATE clientes SET fecha_ultima_actividad=? WHERE id=?`, [ts, clienteId]);
    if (trabajoId) {
      await run(db, `UPDATE trabajos SET fecha_ultima_actividad=? WHERE id=?`, [ts, trabajoId]);
    }

    callAdapter(ctx, env, 'agendarLlamadaCliente', {
      clienteId, nombre: nombre || '', telefono: telefono || '',
      interes: interes || '', fechaLlamada, horaLlamada: horaLlamada || '10:00',
      notas: descripcion || '', contratoToken: contratoToken || '', trabajoId: trabajoId || ''
    });

    return ok({ ok: true, id });
  }

  if (action === 'agregarNota') {
    const body = await request.json();
    const { clienteId, trabajoId, descripcion, tipo } = body;
    if (!clienteId) return err('clienteId requerido');
    if (!descripcion) return err('descripcion requerida');

    const id = uuid();
    const ts = now();
    const tipoFinal = tipo || 'nota';
    await run(db,
      `INSERT INTO actividades (id, cliente_id, trabajo_id, tipo, descripcion, fecha_actividad, hora, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, '', ?)`,
      [id, clienteId, trabajoId || '', tipoFinal, descripcion, ts.substring(0, 10), ts]
    );
    await run(db, `UPDATE clientes SET fecha_ultima_actividad=? WHERE id=?`, [ts, clienteId]);
    if (trabajoId) {
      await run(db, `UPDATE trabajos SET fecha_ultima_actividad=? WHERE id=?`, [ts, trabajoId]);
    }
    return ok({ ok: true, id });
  }

  if (action === 'listarActividades') {
    const url = new URL(request.url);
    let clienteId = url.searchParams.get('clienteId');
    let trabajoId = url.searchParams.get('trabajoId');
    if (!clienteId && request.method === 'POST') {
      const body = await request.json();
      clienteId = body.clienteId;
      trabajoId = body.trabajoId || null;
    }
    if (!clienteId) return err('clienteId requerido');

    const sql = trabajoId
      ? `SELECT * FROM actividades WHERE cliente_id=? AND trabajo_id=?
         ORDER BY fecha_actividad DESC, fecha_creacion DESC LIMIT 100`
      : `SELECT * FROM actividades WHERE cliente_id=?
         ORDER BY fecha_actividad DESC, fecha_creacion DESC LIMIT 100`;
    const params = trabajoId ? [clienteId, trabajoId] : [clienteId];
    const { results } = await query(db, sql, params);
    return ok({ ok: true, actividades: results });
  }

  return err('Acción no encontrada', 404);
}
