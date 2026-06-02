import { queryOne, query, run, now } from '../db.js';
import { ok, err } from '../auth.js';

export async function handleEquipo(request, env, ctx, action) {
  const db = env.DB;
  const url = new URL(request.url);

  if (action === 'obtenerEquipo') {
    const token = url.searchParams.get('token');
    if (!token) return err('Token requerido');

    const contrato = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [token]);
    if (!contrato) return err('Contrato no encontrado', 404);

    const { results: propiedades } = await query(db,
      'SELECT * FROM propiedades WHERE contrato_token = ? ORDER BY num_propiedad',
      [token]
    );

    const { results: todosLosPaquetes } = await query(db, 'SELECT clave, nombre FROM paquetes');
    const pkMap = Object.fromEntries(todosLosPaquetes.map(p => [p.clave, p.nombre]));

    const adicionales = JSON.parse(contrato.adicionales_json || '[]');
    const acordados = adicionales.filter(i => typeof i === 'object' && i.precio && !i.ofrecido);
    const extrasAcordados = acordados.map(i => ({
      nombre: i.nombre || pkMap[i.clave] || i.clave,
      precio: i.precio || 0
    }));

    return ok({
      ok: true,
      token: contrato.token,
      folio: contrato.folio,
      nombreCliente: contrato.nombre_cliente,
      telefonoCliente: contrato.telefono_cliente,
      estatus: contrato.estatus,
      entregaExpress: contrato.entrega_express ? 1 : 0,
      paqueteBase: pkMap[contrato.paquete_base] || contrato.paquete_base,
      precioTotal: contrato.precio_total,
      extrasAcordados,
      propiedades: propiedades.map(p => ({
        numPropiedad: p.num_propiedad,
        tipo: p.tipo,
        paquete: pkMap[p.paquete] || p.paquete,
        entregables: p.entregables,
        fechaSesion: p.fecha_sesion,
        horaSesion: p.hora_sesion,
        direccion: p.direccion,
        linkMaps: p.link_maps,
        referencias: p.referencias,
        sobreLaPropiedad: p.sobre_la_propiedad,
        fachadaUrl: p.fachada_url,
        requiereAcceso: p.requiere_acceso ? 1 : 0,
        datosAcceso: JSON.parse(p.datos_especificos || '{}').acceso || null,
        formatoVideo: p.formato_video || 'vertical_nativo',
        fotosListas: p.fotos_listas ? 1 : 0,
        videoListo: p.video_listo ? 1 : 0
      }))
    });
  }

  if (action === 'marcarListos') {
    const body = await request.json();
    const { token, numPropiedad, fotosListas, videoListo } = body;
    if (!token) return err('Token requerido');

    const contrato = await queryOne(db, 'SELECT token FROM contratos WHERE token = ?', [token]);
    if (!contrato) return err('Contrato no encontrado', 404);

    const sets = [];
    const vals = [];
    if (fotosListas !== undefined) { sets.push('fotos_listas=?'); vals.push(fotosListas ? 1 : 0); }
    if (videoListo !== undefined) { sets.push('video_listo=?'); vals.push(videoListo ? 1 : 0); }
    if (!sets.length) return err('Nada que actualizar');

    vals.push(token, numPropiedad);
    await run(db,
      `UPDATE propiedades SET ${sets.join(', ')} WHERE contrato_token=? AND num_propiedad=?`,
      vals
    );
    return ok({ ok: true });
  }

  return err('Acción no encontrada', 404);
}
