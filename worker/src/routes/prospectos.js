import { query, run, uuid, now } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';
import { callAdapter } from '../google.js';

export async function handleProspectos(request, env, ctx, action) {
  try {
  const auth = requireAdmin(request, env);
  if (auth) return auth;

  const db = env.DB;

  if (action === 'crearProspecto') {
    const body = await request.json();
    const { nombre, telefono, interes, fechaLlamada, horaLlamada, notas } = body;

    if (!nombre || !telefono || !fechaLlamada || !horaLlamada) {
      return err('nombre, telefono, fechaLlamada y horaLlamada son requeridos');
    }

    const id = uuid();
    await run(db,
      `INSERT INTO prospectos (id, nombre, telefono, interes, fecha_llamada, hora_llamada, notas, estatus, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
      [id, nombre, telefono, interes || '', fechaLlamada, horaLlamada, notas || '', now()]
    );

    callAdapter(ctx, env, 'agendarLlamadaProspecto', {
      id, nombre, telefono, interes: interes || '', fechaLlamada, horaLlamada, notas: notas || ''
    });

    return ok({ ok: true, id });
  }

  if (action === 'listarProspectos') {
    try {
      const { results } = await query(db,
        `SELECT * FROM prospectos ORDER BY fecha_llamada DESC, hora_llamada DESC LIMIT 100`
      );
      return ok({ prospectos: results });
    } catch (e) {
      return err('DB error: ' + e.message, 500);
    }
  }

  if (action === 'actualizarEstatusProspecto') {
    const body = await request.json();
    const { id, estatus } = body;
    const ESTATUSES = ['pendiente', 'contactado', 'convertido', 'descartado'];
    if (!id || !ESTATUSES.includes(estatus)) return err('id y estatus válido requeridos');

    await run(db, `UPDATE prospectos SET estatus=? WHERE id=?`, [estatus, id]);
    return ok({ ok: true });
  }

  return err('Acción no encontrada', 404);
  } catch (e) {
    return err('Error interno: ' + e.message, 500);
  }
}
