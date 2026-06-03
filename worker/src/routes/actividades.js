import { query, queryOne, batch, uuid, now } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';
import { callAdapter } from '../google.js';

export async function handleActividades(request, env, ctx, action) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;

	  if (action === 'agendarLlamada') {
	    const body = await request.json();
	    let { clienteId, trabajoId, nombre, telefono, interes,
	            fechaLlamada, horaLlamada, descripcion, contratoToken } = body;
	    if (!fechaLlamada) return err('fechaLlamada requerida');

	    const ts = now();
	    const statements = [];
	    let clienteCreado = null;
	    if (!clienteId && contratoToken) {
	      const contrato = await queryOne(db,
	        `SELECT token, cliente_id, nombre_cliente, telefono_cliente, correo_cliente
	         FROM contratos WHERE token=?`,
	        [contratoToken]
	      );
	      if (!contrato) return err('Contrato no encontrado', 404);
	      if (contrato.cliente_id) {
	        clienteId = contrato.cliente_id;
	      } else {
	        clienteId = uuid();
	        nombre = nombre || contrato.nombre_cliente || '';
	        telefono = telefono || contrato.telefono_cliente || '';
	        clienteCreado = { id: clienteId, nombre, telefono };
	        statements.push(
	          {
	            sql: `INSERT INTO clientes (id, nombre, telefono, correo, origen, notas_perfil, fecha_creacion, fecha_ultima_actividad)
	                  VALUES (?, ?, ?, ?, 'contrato', '', ?, ?)`,
	            params: [clienteId, nombre, telefono, contrato.correo_cliente || '', ts, ts]
	          },
	          {
	            sql: `UPDATE contratos SET cliente_id=? WHERE token=?`,
	            params: [clienteId, contratoToken]
	          }
	        );
	      }
	    }
	    if (!clienteId) return err('clienteId requerido');
	    const cliente = clienteCreado || await queryOne(db, 'SELECT id, nombre, telefono FROM clientes WHERE id=?', [clienteId]);
	    if (!cliente) return err('Cliente no encontrado', 404);
	    if (trabajoId) {
	      const trabajo = await queryOne(db, 'SELECT cliente_id FROM trabajos WHERE id=?', [trabajoId]);
	      if (!trabajo) return err('Trabajo no encontrado', 404);
	      if (trabajo.cliente_id !== clienteId) return err('El trabajo pertenece a otro cliente', 409);
	    }

	    const id = uuid();
	    statements.push(
	      {
	        sql: `INSERT INTO actividades (id, cliente_id, trabajo_id, tipo, descripcion, fecha_actividad, hora, fecha_creacion)
	              VALUES (?, ?, ?, 'llamada_agendada', ?, ?, ?, ?)`,
	        params: [id, clienteId, trabajoId || '', descripcion || '', fechaLlamada, horaLlamada || '', ts]
	      },
	      {
	        sql: `UPDATE clientes SET fecha_ultima_actividad=? WHERE id=?`,
	        params: [ts, clienteId]
	      }
	    );
	    if (trabajoId) {
	      statements.push({
	        sql: `UPDATE trabajos SET fecha_ultima_actividad=? WHERE id=?`,
	        params: [ts, trabajoId]
	      });
	    }
	    await batch(db, statements);

	    callAdapter(ctx, env, 'agendarLlamadaCliente', {
	      clienteId, nombre: nombre || cliente.nombre || '', telefono: telefono || cliente.telefono || '',
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
	    const cliente = await queryOne(db, 'SELECT id FROM clientes WHERE id=?', [clienteId]);
	    if (!cliente) return err('Cliente no encontrado', 404);
	    if (trabajoId) {
	      const trabajo = await queryOne(db, 'SELECT cliente_id FROM trabajos WHERE id=?', [trabajoId]);
	      if (!trabajo) return err('Trabajo no encontrado', 404);
	      if (trabajo.cliente_id !== clienteId) return err('El trabajo pertenece a otro cliente', 409);
	    }

	    const id = uuid();
	    const ts = now();
	    const tipoFinal = tipo || 'nota';
	    const statements = [
	      {
	        sql: `INSERT INTO actividades (id, cliente_id, trabajo_id, tipo, descripcion, fecha_actividad, hora, fecha_creacion)
	              VALUES (?, ?, ?, ?, ?, ?, '', ?)`,
	        params: [id, clienteId, trabajoId || '', tipoFinal, descripcion, ts.substring(0, 10), ts]
	      },
	      {
	        sql: `UPDATE clientes SET fecha_ultima_actividad=? WHERE id=?`,
	        params: [ts, clienteId]
	      }
	    ];
	    if (trabajoId) {
	      statements.push({
	        sql: `UPDATE trabajos SET fecha_ultima_actividad=? WHERE id=?`,
	        params: [ts, trabajoId]
	      });
	    }
	    await batch(db, statements);
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
