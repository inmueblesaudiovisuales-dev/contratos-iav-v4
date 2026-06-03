import { queryOne, query, batch, now } from '../db.js';
import { ok, err } from '../auth.js';
import { callAdapter } from '../google.js';

export async function handleRevision(request, env, ctx, action) {
  const db  = env.DB;
  const url = new URL(request.url);

  const token = url.searchParams.get('token') ||
    (request.method === 'POST' ? (await request.clone().json()).token : null);

  if (!token) return err('Token requerido');

  const contrato = await queryOne(db,
    'SELECT token, folio, nombre_cliente, entrega_drive_link, entrega_links_extra FROM contratos WHERE token = ?',
    [token]
  );
  if (!contrato) return err('Token no válido', 403);

  if (action === 'obtenerRevision') {
    const { results: revisiones } = await query(db,
      'SELECT id, minuto_segundo, descripcion_ajuste, fecha FROM revisiones_video WHERE contrato_id = ? ORDER BY id',
      [token]
    );
    return ok({
      ok: true,
      folio: contrato.folio || '',
      nombreCliente: contrato.nombre_cliente || '',
      videoUrl: contrato.entrega_drive_link || '',
      linksExtra: contrato.entrega_links_extra || '',
      revisiones
    });
  }

  if (action === 'guardarRevision') {
    const body = await request.json();
    const { revisiones } = body;
    if (!Array.isArray(revisiones) || !revisiones.length) return err('Sin revisiones');

    const fecha = now();
    const revisionesInsertadas = revisiones
      .map(r => ({
        minuto_segundo: (r.minuto_segundo || '').trim(),
        descripcion_ajuste: (r.descripcion_ajuste || '').trim()
      }))
      .filter(r => r.descripcion_ajuste);

    if (revisionesInsertadas.length === 0) return err('Agrega al menos una nota con descripción');

    await batch(db, revisionesInsertadas.map(r => ({
      sql: 'INSERT INTO revisiones_video (contrato_id, minuto_segundo, descripcion_ajuste, fecha) VALUES (?, ?, ?, ?)',
      params: [token, r.minuto_segundo, r.descripcion_ajuste, fecha]
    })));

    callAdapter(ctx, env, 'notificarRevision', {
      token,
      folio: contrato.folio,
      nombreCliente: contrato.nombre_cliente,
      revisiones: revisionesInsertadas
    });

    return ok({ ok: true });
  }

  return err('Acción no encontrada', 404);
}
