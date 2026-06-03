import { query, queryOne, batch, uuid, now } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';
import { callAdapter } from '../google.js';

const ESTATUSES_VALIDOS = ['Nuevo','En cotizacion','Pendiente firma','Firmado','Reservado','En produccion','Entregado','Completado','Cancelado'];

function jsonArray(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

export async function handleTrabajos(request, env, ctx, action) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;

  if (action === 'crearTrabajo') {
    const body = await request.json();
    const { clienteId, interes, ubicacion, paquetesCotizados, portafolioLinks,
            propiedadesInteres, presupuestoEstimado, notas,
            fechaLlamada, horaLlamada } = body;
    if (!clienteId) return err('clienteId requerido');

    const cliente = await queryOne(db, 'SELECT * FROM clientes WHERE id = ?', [clienteId]);
    if (!cliente) return err('Cliente no encontrado', 404);

    const id = uuid();
    const token = uuid();
    const creado = now();
    const statements = [
      {
        sql: `INSERT INTO trabajos (id, cliente_id, token, estatus, interes, ubicacion,
              paquetes_cotizados_json, portafolio_links_json, propiedades_interes_json,
              presupuesto_estimado, notas, fecha_creacion, fecha_ultima_actividad)
              VALUES (?, ?, ?, 'Nuevo', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [id, clienteId, token, interes || '', ubicacion || '',
                 jsonArray(paquetesCotizados),
                 jsonArray(portafolioLinks),
                 jsonArray(propiedadesInteres),
                 parseFloat(presupuestoEstimado) || 0,
                 notas || '', creado, creado]
      },
      {
        sql: `UPDATE clientes SET fecha_ultima_actividad=? WHERE id=?`,
        params: [creado, clienteId]
      }
    ];

    if (fechaLlamada) {
      const actId = uuid();
      statements.push({
        sql: `INSERT INTO actividades (id, cliente_id, trabajo_id, tipo, descripcion,
              fecha_actividad, hora, fecha_creacion)
              VALUES (?, ?, ?, 'llamada_agendada', ?, ?, ?, ?)`,
        params: [actId, clienteId, id, notas || '', fechaLlamada, horaLlamada || '', creado]
      });
    }

    await batch(db, statements);

    if (fechaLlamada) {
      callAdapter(ctx, env, 'agendarLlamadaCliente', {
        clienteId, nombre: cliente.nombre, telefono: cliente.telefono,
        interes: interes || '', fechaLlamada, horaLlamada: horaLlamada || '10:00',
        notas: notas || '', trabajoId: id,
        equipoUrl: `https://contratos.inmueblesaudiovisuales.com/equipo.html?token=${token}`
      });
    }

    return ok({ ok: true, id, token });
  }

  if (action === 'listarTrabajos') {
    const url = new URL(request.url);
    let clienteId = url.searchParams.get('clienteId');
    if (!clienteId && request.method === 'POST') {
      const body = await request.json();
      clienteId = body.clienteId || null;
    }
    const sql = clienteId
      ? `SELECT t.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono, c.correo AS cliente_correo
         FROM trabajos t JOIN clientes c ON c.id = t.cliente_id
         WHERE t.cliente_id = ?
         ORDER BY CASE WHEN t.fecha_ultima_actividad = '' OR t.fecha_ultima_actividad IS NULL
                  THEN t.fecha_creacion ELSE t.fecha_ultima_actividad END DESC`
      : `SELECT t.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono, c.correo AS cliente_correo
         FROM trabajos t JOIN clientes c ON c.id = t.cliente_id
         ORDER BY CASE WHEN t.fecha_ultima_actividad = '' OR t.fecha_ultima_actividad IS NULL
                  THEN t.fecha_creacion ELSE t.fecha_ultima_actividad END DESC`;
    const params = clienteId ? [clienteId] : [];
    const { results } = await query(db, sql, params);
    return ok({ ok: true, trabajos: results });
  }

  if (action === 'actualizarTrabajo') {
    const body = await request.json();
    const { id, interes, ubicacion, paquetesCotizados, portafolioLinks,
            propiedadesInteres, presupuestoEstimado, notas } = body;
    if (!id) return err('id requerido');
    const t = await queryOne(db, 'SELECT cliente_id FROM trabajos WHERE id=?', [id]);
    if (!t) return err('Trabajo no encontrado', 404);
    const ts = now();
    await batch(db, [
      {
        sql: `UPDATE trabajos SET interes=?, ubicacion=?, paquetes_cotizados_json=?,
              portafolio_links_json=?, propiedades_interes_json=?, presupuesto_estimado=?,
              notas=?, fecha_ultima_actividad=? WHERE id=?`,
        params: [interes || '', ubicacion || '',
                 jsonArray(paquetesCotizados),
                 jsonArray(portafolioLinks),
                 jsonArray(propiedadesInteres),
                 parseFloat(presupuestoEstimado) || 0,
                 notas || '', ts, id]
      },
      {
        sql: `UPDATE clientes SET fecha_ultima_actividad=? WHERE id=?`,
        params: [ts, t.cliente_id]
      }
    ]);
    return ok({ ok: true });
  }

  if (action === 'actualizarEstatusTrabajo') {
    const body = await request.json();
    const { id, estatus } = body;
    if (!id || !ESTATUSES_VALIDOS.includes(estatus)) return err('id y estatus válido requeridos');
    const t = await queryOne(db, 'SELECT cliente_id, estatus, contrato_token FROM trabajos WHERE id=?', [id]);
    if (!t) return err('Trabajo no encontrado', 404);
    if (t.estatus === 'convertido' && t.contrato_token) {
      return err('Un trabajo convertido debe actualizarse desde el contrato asociado', 409);
    }
    const ts = now();
    await batch(db, [
      {
        sql: `UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE id=?`,
        params: [estatus, ts, id]
      },
      {
        sql: `UPDATE clientes SET fecha_ultima_actividad=? WHERE id=?`,
        params: [ts, t.cliente_id]
      }
    ]);
    return ok({ ok: true });
  }

  return err('Acción no encontrada', 404);
}
