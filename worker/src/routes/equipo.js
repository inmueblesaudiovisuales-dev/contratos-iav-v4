import { queryOne, query, run, now, batch } from '../db.js';
import { ok, err } from '../auth.js';

export async function handleEquipo(request, env, ctx, action) {
  const db = env.DB;
  const url = new URL(request.url);

  if (action === 'obtenerEquipo') {
    const token = url.searchParams.get('token');
    if (!token) return err('Token requerido');

    // Token is always the trabajo token in V5
    const trabajo = await queryOne(db, 'SELECT * FROM trabajos WHERE token = ?', [token]);
    // Contrato may or may not exist
    const contrato = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [token]);

    if (!trabajo && !contrato) return err('Token no encontrado', 404);

    const clienteId = trabajo?.cliente_id || contrato?.cliente_id || '';
    const cliente = clienteId
      ? await queryOne(db, 'SELECT * FROM clientes WHERE id = ?', [clienteId])
      : null;

    const trabajoId = trabajo?.id || '';
    const { results: actividades } = trabajoId
      ? await query(db,
          `SELECT * FROM actividades WHERE trabajo_id = ?
           ORDER BY fecha_actividad DESC, fecha_creacion DESC LIMIT 50`,
          [trabajoId])
      : { results: [] };

    const propiedades = contrato
      ? (await query(db,
          'SELECT * FROM propiedades WHERE contrato_token = ? ORDER BY num_propiedad',
          [token])).results
      : [];

    const { results: todosLosPaquetes } = await query(db, 'SELECT clave, nombre FROM paquetes');
    const pkMap = Object.fromEntries(todosLosPaquetes.map(p => [p.clave, p.nombre]));

    const adicionales = JSON.parse(contrato?.adicionales_json || '[]');
    const acordados = adicionales.filter(i => typeof i === 'object' && i.precio && !i.ofrecido);
    const extrasAcordados = acordados.map(i => ({
      nombre: i.nombre || pkMap[i.clave] || i.clave,
      precio: i.precio || 0
    }));

    return ok({
      ok: true,
      token,
      // Trabajo / cotización
      trabajoId,
      estatus: trabajo?.estatus || contrato?.estatus || '',
      interes: trabajo?.interes || '',
      ubicacion: trabajo?.ubicacion || '',
      paquetesCotizados: JSON.parse(trabajo?.paquetes_cotizados_json || '[]'),
      portafolioLinks: JSON.parse(trabajo?.portafolio_links_json || '[]'),
      propiedadesInteres: JSON.parse(trabajo?.propiedades_interes_json || '[]'),
      notasCotizacion: trabajo?.notas || '',
      // Cliente
      cliente: cliente ? {
        id: cliente.id,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        correo: cliente.correo,
        inmobiliaria: cliente.inmobiliaria || '',
        origen: cliente.origen || ''
      } : null,
      // Actividades
      actividades,
      // Contrato (si existe)
      tieneContrato: !!contrato,
      folio: contrato?.folio || '',
      nombreCliente: contrato?.nombre_cliente || cliente?.nombre || '',
      telefonoCliente: contrato?.telefono_cliente || cliente?.telefono || '',
      entregaExpress: contrato?.entrega_express ? 1 : 0,
      paqueteBase: pkMap[contrato?.paquete_base] || contrato?.paquete_base || '',
      fotografiaLista: contrato?.fotografia_lista || null,
      videoListo: contrato?.video_listo || null,
      recorridoListo: contrato?.recorrido_listo || null,
      recorridoUrl: contrato?.recorrido_url || '',
      tieneRecorrido: contrato?.tiene_recorrido === 0 ? 0 : 1,
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
        carpetaControlId: p.carpeta_control_id || '',
        carpetaEntregablesId: p.carpeta_entregables_id || '',
      }))
    });
  }

  if (action === 'marcarProduccion') {
    const body = await request.json();
    const { token, fotografiaLista, videoListo, recorridoListo, recorridoUrl, tieneRecorrido } = body;
    if (!token) return err('Token requerido');

    const contrato = await queryOne(db, 'SELECT token FROM contratos WHERE token = ?', [token]);
    if (!contrato) return err('Contrato no encontrado', 404);

    const sets = [];
    const vals = [];
    if (fotografiaLista !== undefined) { sets.push('fotografia_lista=?'); vals.push(fotografiaLista ? now() : null); }
    if (videoListo !== undefined) { sets.push('video_listo=?'); vals.push(videoListo ? now() : null); }
    if (recorridoListo !== undefined) { sets.push('recorrido_listo=?'); vals.push(recorridoListo ? now() : null); }
    if (recorridoUrl !== undefined) { sets.push('recorrido_url=?'); vals.push(recorridoUrl || ''); }
    if (tieneRecorrido !== undefined) { sets.push('tiene_recorrido=?'); vals.push(tieneRecorrido ? 1 : 0); }
    if (!sets.length) return err('Nada que actualizar');

    vals.push(token);
    await run(db, `UPDATE contratos SET ${sets.join(', ')} WHERE token=?`, vals);
    await run(db, `UPDATE trabajos SET fecha_ultima_actividad=? WHERE token=?`, [now(), token]);
    return ok({ ok: true });
  }

  return err('Acción no encontrada', 404);
}
