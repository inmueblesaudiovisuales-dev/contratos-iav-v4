import { query, queryOne, run, batch, uuid, now } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';
import { callAdapter, callAdapterSync } from '../google.js';
import { generarFolio, asignarFolio } from '../folios.js';

export async function handleContratos(request, env, ctx, action) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;

  // ── LECTURA ──────────────────────────────────────────────────────────────

  if (action === 'listarContratos') {
    const periodo = new URL(request.url).searchParams.get('periodo') || 'abiertos';
    const { results } = await query(db,
      `SELECT c.*,
              COALESCE(p_dir.fecha_sesion, p1.fecha_sesion) AS fecha_sesion,
              COALESCE(p_dir.hora_sesion,  p1.hora_sesion)  AS hora_sesion,
              COALESCE(p_dir.direccion,    p1.direccion)    AS direccion
       FROM contratos c
       LEFT JOIN propiedades p1
         ON p1.contrato_token = c.token AND p1.num_propiedad = 1
       LEFT JOIN propiedades p_dir
         ON p_dir.contrato_token = c.token
         AND p_dir.direccion IS NOT NULL AND p_dir.direccion != ''
         AND p_dir.num_propiedad = (
           SELECT MIN(num_propiedad) FROM propiedades
           WHERE contrato_token = c.token AND direccion IS NOT NULL AND direccion != ''
         )
       WHERE c.oculto = 0
       ORDER BY c.fecha_creacion DESC`
    );
    const estatusAbiertos = ['Pendiente firma','Firmado','Reservado','En produccion','Entregado','Completado'];
    const lista = periodo === 'abiertos' ? results.filter(c => estatusAbiertos.includes(c.estatus)) : results;
    return ok({ ok: true, contratos: lista });
  }

  if (action === 'obtenerContrato') {
    const token = new URL(request.url).searchParams.get('token');
    if (!token) return err('Token requerido');
    const contrato = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [token]);
    if (!contrato) return err('Contrato no encontrado', 404);
    const { results: propiedades } = await query(db,
      'SELECT * FROM propiedades WHERE contrato_token = ? ORDER BY num_propiedad', [token]
    );
    const { results: abonos } = await query(db,
      'SELECT * FROM abonos WHERE contrato_token = ? ORDER BY fecha_registro', [token]
    );
    const totalAbonado = abonos.reduce((s, a) => s + (a.monto || 0), 0);
    const { results: paquetesOC } = await query(db, 'SELECT clave, nombre FROM paquetes');
    const pkMapOC = Object.fromEntries(paquetesOC.map(r => [r.clave, r.nombre]));
    const propiedadesConNombre = propiedades.map(p => ({ ...p, paquete: pkMapOC[p.paquete] || p.paquete }));
    const primeraProp = propiedadesConNombre[0];
    const carpetaEntregablesUrl = primeraProp?.carpeta_entregables_id
      ? `https://drive.google.com/drive/folders/${primeraProp.carpeta_entregables_id}`
      : primeraProp?.carpeta_control_id
        ? `https://drive.google.com/drive/folders/${primeraProp.carpeta_control_id}`
        : null;
    return ok({ ok: true, contrato, propiedades: propiedadesConNombre, abonos, totalAbonado, carpetaEntregablesUrl });
  }

  if (action === 'exportarCSV') {
    const { results } = await query(db,
      `SELECT token, folio, nombre_cliente, correo_cliente, telefono_cliente,
              paquete_base, precio_total, anticipo, saldo_pendiente, estatus, fecha_creacion
       FROM contratos WHERE oculto = 0 ORDER BY fecha_creacion DESC`
    );
    const { results: paquetesCSV } = await query(db, 'SELECT clave, nombre FROM paquetes');
    const pkMapCSV = Object.fromEntries(paquetesCSV.map(r => [r.clave, r.nombre]));
    const header = 'Token,Folio,Cliente,Correo,Telefono,Paquete,Total,Anticipo,Saldo,Estatus,Fecha\n';
    const rows = results.map(r =>
      [r.token, r.folio, r.nombre_cliente, r.correo_cliente, r.telefono_cliente,
       pkMapCSV[r.paquete_base] || r.paquete_base, r.precio_total, r.anticipo, r.saldo_pendiente, r.estatus, r.fecha_creacion]
      .map(v => {
        const val = String(v ?? '').replace(/"/g, '""');
        return '"' + (/^[=+\-@]/.test(val) ? "'" + val : val) + '"';
      }).join(',')
    ).join('\n');
    return ok({ ok: true, csv: header + rows });
  }

  // Callbacks desde el adapter de Apps Script para guardar IDs de Google en D1

  if (action === 'crearContrato') {
    const body = await request.json();
    const { nombreCliente, correoCliente, telefonoCliente,
            tipoPaquete, paqueteBase, adicionales, extrasAcordados,
            precioTotal, anticipo, notasContrato, numPropiedades,
            propiedades: propsData, clienteId, trabajoId } = body;

    if (!nombreCliente) return err('Nombre del cliente requerido');
    if (!propsData || !propsData.length) return err('Al menos una propiedad es requerida');
    if (propsData.length > 20) return err('Máximo 20 propiedades por contrato');

    const totalNum = parseFloat(precioTotal) || 0;
    if (totalNum <= 0) return err('El precio total debe ser mayor a $0');
    const anticipoProvisto = anticipo !== undefined && anticipo !== '';
    const anticipoRaw = anticipoProvisto ? parseFloat(anticipo) : 0;
    if (!Number.isFinite(anticipoRaw) || anticipoRaw < 0) return err('El anticipo no puede ser negativo');
    const anticNum = Math.min(anticipoRaw, totalNum);

    // Validar propiedades
    const prop1 = propsData[0];
    const fechaRe = /^\d{4}-\d{2}-\d{2}$/;
    for (let vi = 0; vi < propsData.length; vi++) {
      const vp = propsData[vi];
      if (vp.fechaSesion && !fechaRe.test(vp.fechaSesion)) {
        return err('Formato de fecha inválido en propiedad ' + (vi + 1) + ' (esperado YYYY-MM-DD)');
      }
      if (vp.entregables && vp.entregables.length > 2000) {
        return err('Entregables de propiedad ' + (vi + 1) + ' exceden 2000 caracteres');
      }
    }

    // trabajoId is REQUIRED — every contrato comes from a trabajo
    if (!trabajoId) return err('trabajoId requerido para crear un contrato');
    const trabajoOrigen = await queryOne(db,
      'SELECT * FROM trabajos WHERE id=?', [trabajoId]);
    if (!trabajoOrigen) return err('Trabajo no encontrado', 404);
    if (!trabajoOrigen.token) return err('El trabajo no tiene token — guarda el trabajo primero', 400);
    const contratoExistente = await queryOne(db, 'SELECT token FROM contratos WHERE token=?', [trabajoOrigen.token]);
    if (contratoExistente) return err('Este trabajo ya tiene un contrato', 409);

    const token = trabajoOrigen.token; // USE TRABAJO TOKEN — not uuid()
    const clienteIdFinal = trabajoOrigen.cliente_id;

    if (clienteId && clienteId !== clienteIdFinal) {
      return err('El clienteId no coincide con el cliente del trabajo', 409);
    }

    const paqueteBaseFinal = paqueteBase || prop1?.paquete || '';
    const tipoPaqueteFinal = tipoPaquete || prop1?.tipo || '';
    const paquete = await queryOne(db, 'SELECT precio FROM paquetes WHERE clave = ?', [paqueteBaseFinal]);
    const precioBase = paquete?.precio ?? totalNum;
    const saldoPendiente = Math.max(0, totalNum - anticNum);

    const adicionalesOfrecidos = (adicionales || []).filter(Boolean);
    const extrasObjs = (extrasAcordados || []).map(e =>
      e.clave ? { clave: e.clave, precio: e.precio } : { nombre: e.nombre, precio: e.precio }
    );
    const adicionalesJSON = JSON.stringify([...adicionalesOfrecidos, ...extrasObjs]);
    const tieneExpress = [...adicionalesOfrecidos, ...extrasObjs].some(
      a => a === 'ADD-EXPRESS' || (a && a.clave === 'ADD-EXPRESS')
    );

	    // Siempre generar folio desde propiedad 1
	    const folio = prop1.fechaSesion ? await asignarFolio(db, prop1.fechaSesion) : null;

    const portalToken = uuid();
    const portalExpira = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const creacionNow = now();

	    const statements = [
	      {
	        sql: `INSERT INTO contratos (token, folio, nombre_cliente, correo_cliente, telefono_cliente, cliente_id,
	              tipo_contrato, tipo_paquete, paquete_base, adicionales_json, precio_base, precio_total,
	              anticipo, saldo_pendiente, estatus, fecha_creacion, num_propiedades, notas_contrato, entrega_express)
	              VALUES (?, ?, ?, ?, ?, ?, 'estandar', ?, ?, ?, ?, ?, ?, ?, 'Pendiente firma', ?, ?, ?, ?)`,
	        params: [token, folio, nombreCliente, correoCliente || '', telefonoCliente || '',
	                 clienteIdFinal,
	                 tipoPaqueteFinal, paqueteBaseFinal,
	                 adicionalesJSON, precioBase, totalNum, anticNum, saldoPendiente,
	                 creacionNow, propsData.length, notasContrato || '', tieneExpress ? 1 : 0]
      },
      ...propsData.map((p, i) => ({
        sql: `INSERT INTO propiedades (contrato_token, num_propiedad, tipo, paquete, entregables,
              fecha_sesion, hora_sesion, direccion, link_maps, orientacion, sobre_la_propiedad,
              referencias, fachada_url, perimetro_url, logo_url, datos_especificos,
              formato_video, ocultar_formato_video)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [token, i + 1, p.tipo || tipoPaqueteFinal, p.paquete || paqueteBaseFinal,
                 p.entregables || '', p.fechaSesion || '', p.horaSesion || '',
                 p.direccion || '', p.linkMaps || '', p.orientacion || '',
                 p.sobreLaPropiedad || '', p.referencias || '', p.fachadaUrl || '',
                 p.perimetroUrl || '', p.logoUrl || '', JSON.stringify(p.datosEspecificos || {}),
                 p.formatoVideo || 'vertical_nativo', p.ocultarFormatoVideo ?? 1]
      })),
	      {
	        sql: 'INSERT INTO tokens (token, contrato_id, tipo, expira, usado) VALUES (?, ?, ?, ?, 0)',
	        params: [portalToken, token, 'contrato', portalExpira]
	      }
	    ];

    // Update trabajo to Pendiente firma
    const tsConv = now();
    statements.push(
      {
        sql: `UPDATE trabajos SET estatus='Pendiente firma', fecha_ultima_actividad=? WHERE id=?`,
        params: [tsConv, trabajoId]
      },
      {
        sql: `UPDATE clientes SET fecha_ultima_actividad=? WHERE id=?`,
        params: [tsConv, clienteIdFinal]
      },
      {
        sql: `INSERT INTO actividades (id, cliente_id, trabajo_id, tipo, descripcion, fecha_actividad, hora, fecha_creacion)
              VALUES (?, ?, ?, 'contrato_generado', ?, ?, '', ?)`,
        params: [uuid(), clienteIdFinal, trabajoId, 'Contrato generado: ' + token, tsConv.substring(0, 10), tsConv]
      }
    );

    await batch(db, statements);

    // Create Drive folders synchronously so they exist before any file upload
    const { results: paquetesNombres } = await query(db, 'SELECT clave, nombre FROM paquetes');
    const pkMapNombres = Object.fromEntries(paquetesNombres.map(p => [p.clave, p.nombre]));
    await callAdapterSync(env, 'crearCarpetas', {
      token,
      folio,
      nombreCliente,
      propiedades: propsData.map((p, i) => ({
        numPropiedad: i + 1,
        tipo: p.tipo || tipoPaqueteFinal,
        paquete: pkMapNombres[p.paquete || paqueteBaseFinal] || p.paquete || paqueteBaseFinal
      }))
    });

    const linkPortal = `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`;
    return ok({ ok: true, token, folio, url: linkPortal, linkPortal });
  }

  if (action === 'actualizarEstatus') {
    const { token, estatus, forzar } = await request.json();
    const ESTATUSES_VALIDOS = ['Pendiente firma','Firmado','Reservado','En produccion','Entregado','Completado','Cancelado'];
    if (!ESTATUSES_VALIDOS.includes(estatus)) return err('Estatus no válido');
    const c = await queryOne(db, 'SELECT estatus FROM contratos WHERE token=?', [token]);
    if (!c) return err('Contrato no encontrado', 404);
    const TRANSICIONES_BLOQUEADAS = {
      'Pendiente firma' : ['En produccion','Entregado','Completado'],
      'Firmado'         : ['Entregado','Completado'],
      'Entregado'       : ['Pendiente firma','Firmado','Reservado'],
      'Completado'      : ['Pendiente firma','Firmado','Reservado','En produccion'],
      'En produccion'   : ['Pendiente firma'],
      'Reservado'       : ['Pendiente firma'],
    };
    const forzarBool = forzar === true || forzar === 'true' || forzar === 1;
    if (!forzarBool) {
      const bloqueados = TRANSICIONES_BLOQUEADAS[c.estatus] || [];
      if (bloqueados.includes(estatus)) {
        return new Response(JSON.stringify({
          ok: false,
          error: `Transición bloqueada: ${c.estatus} → ${estatus}`,
          codigoError: 'TRANSICION_BLOQUEADA',
          estatusActual: c.estatus,
        }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }
    }
    await run(db, 'UPDATE contratos SET estatus=? WHERE token=?', [estatus, token]);
    // Keep trabajos.estatus in sync
    await run(db, `UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE token=?`, [estatus, new Date().toISOString(), token]);
    return ok({ ok: true, estatus });
  }

  if (action === 'actualizarContratoUpsell') {
    const body = await request.json();
    const { token, agregarAdicionales, serviciosLibres, ajustePrecioManual,
            nuevoPrecioTotal, nota, notificarCliente } = body;
    if (!token) return err('Token requerido');

    const c = await queryOne(db, 'SELECT * FROM contratos WHERE token=?', [token]);
    if (!c) return err('Contrato no encontrado', 404);

    let adicionalesArr;
    try { adicionalesArr = JSON.parse(c.adicionales_json || '[]'); }
    catch(e) { adicionalesArr = []; }
    const clavesExistentes = new Set(adicionalesArr.map(i => typeof i === 'string' ? i : i.clave).filter(Boolean));
    let precioFinal = c.precio_total;

    if (Array.isArray(agregarAdicionales)) {
      for (const clave of agregarAdicionales) {
        if (!clave || clavesExistentes.has(clave)) continue;
        adicionalesArr.push(clave);
        const p = await queryOne(db, 'SELECT precio FROM paquetes WHERE clave=?', [clave]);
        if (p) precioFinal += p.precio;
      }
    }

    if (Array.isArray(serviciosLibres)) {
      for (const svc of serviciosLibres) {
        if (!svc?.nombre || (svc?.precio === undefined || svc?.precio === null)) continue;
        adicionalesArr.push({ nombre: String(svc.nombre).trim(), precio: parseFloat(svc.precio) || 0 });
        precioFinal += parseFloat(svc.precio) || 0;
      }
    }

    if (ajustePrecioManual !== undefined && ajustePrecioManual !== null)
      precioFinal += parseFloat(ajustePrecioManual) || 0;
    if (nuevoPrecioTotal !== undefined && nuevoPrecioTotal !== null && nuevoPrecioTotal !== '')
      precioFinal = parseFloat(nuevoPrecioTotal) || 0;
    if (precioFinal < 0) precioFinal = 0;

    const { results: abonosArr } = await query(db, 'SELECT monto FROM abonos WHERE contrato_token=?', [token]);
    const totalAbonado = abonosArr.reduce((s, a) => s + (a.monto || 0), 0);

    // Recalcular anticipo proporcionalmente si el precio cambió
    let nuevoAnticipo = c.anticipo;
    if (precioFinal !== c.precio_total && c.precio_total > 0 && c.anticipo < c.precio_total) {
      const pct = c.anticipo / c.precio_total;
      nuevoAnticipo = Math.round(precioFinal * pct);
    }

    const saldoNuevo = Math.max(0, precioFinal - totalAbonado);

    const ESTATUSES_AVANZADOS = ['En produccion', 'Entregado'];
    let estatusNuevo = c.estatus;
    if (saldoNuevo === 0) {
      estatusNuevo = 'Completado';
    } else if (saldoNuevo > 0 && c.estatus === 'Completado') {
      estatusNuevo = 'Reservado';
    }
    if (ESTATUSES_AVANZADOS.includes(c.estatus) && estatusNuevo !== 'Completado') {
      estatusNuevo = c.estatus;
    }

    const stamp = now();
    const partes = [];
    if (agregarAdicionales?.length) partes.push('catálogo: ' + agregarAdicionales.join(', '));
    if (serviciosLibres?.length) partes.push('libres: ' + serviciosLibres.map(s => s.nombre + ' +' + s.precio).join(', '));
    if (ajustePrecioManual) partes.push('ajuste manual: +' + ajustePrecioManual);
    if (precioFinal !== c.precio_total) partes.push('precio ' + c.precio_total + ' → ' + precioFinal);
    if (nota) partes.push(String(nota).trim());
    const nuevasNotas = partes.length
      ? (c.notas_internas ? c.notas_internas + '\n' : '') + '[' + stamp + '] ' + partes.join(' · ')
      : c.notas_internas;

    const expressActualizado = adicionalesArr.some(
      a => a === 'ADD-EXPRESS' || (a && a.clave === 'ADD-EXPRESS')
    ) ? 1 : 0;
    await run(db,
      'UPDATE contratos SET precio_total=?, saldo_pendiente=?, anticipo=?, adicionales_json=?, notas_internas=?, estatus=?, entrega_express=? WHERE token=?',
      [precioFinal, saldoNuevo, nuevoAnticipo, JSON.stringify(adicionalesArr), nuevasNotas, estatusNuevo, expressActualizado, token]
    );
    if (estatusNuevo) {
      await run(db, `UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE token=?`,
        [estatusNuevo, new Date().toISOString(), token]);
    }

    if (notificarCliente && c.correo_cliente) {
      const { results: paquetesUp } = await query(db, 'SELECT clave, nombre FROM paquetes');
      const pkMapUp = Object.fromEntries(paquetesUp.map(r => [r.clave, r.nombre]));
      callAdapter(ctx, env, 'notificarUpsell', {
        token, nombreCliente: c.nombre_cliente, correoCliente: c.correo_cliente,
        folio: c.folio,
        serviciosLibres,
        agregarAdicionales: (agregarAdicionales || []).map(cl => pkMapUp[cl] || cl),
        precioFinal, saldoNuevo,
        linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`
      });
    }

    return ok({ ok: true, precioTotal: precioFinal, saldoPendiente: saldoNuevo, estatus: estatusNuevo });
  }

  if (action === 'marcarSesionCompletada') {
    const { token } = await request.json();
    const c = await queryOne(db, 'SELECT estatus FROM contratos WHERE token=?', [token]);
    if (!c) return err('Contrato no encontrado', 404);
    if (!['Firmado','Reservado','En produccion'].includes(c.estatus)) {
      return err('Estatus no permite esta acción');
    }
    const ts = now();
    await run(db,
      "UPDATE contratos SET estatus='En produccion', sesion_completada=? WHERE token=?",
      [ts, token]
    );
    await run(db,
      "UPDATE trabajos SET estatus='En produccion', fecha_ultima_actividad=? WHERE token=?",
      [ts, token]
    );
    return ok({ ok: true });
  }

  if (action === 'guardarNotasInternas') {
    const { token, notas } = await request.json();
    await run(db, 'UPDATE contratos SET notas_internas=? WHERE token=?', [notas, token]);
    return ok({ ok: true });
  }

  if (action === 'guardarProduccion') {
    const { token, fotografiaLista, videoListo, recorridoListo, recorridoUrl, tieneRecorrido } = await request.json();
    await run(db,
      'UPDATE contratos SET fotografia_lista=?, video_listo=?, recorrido_listo=?, recorrido_url=?, tiene_recorrido=? WHERE token=?',
      [fotografiaLista ?? null, videoListo ?? null, recorridoListo ?? null, recorridoUrl || '', tieneRecorrido === false ? 0 : 1, token]
    );
    return ok({ ok: true });
  }

  if (action === 'guardarEntrega') {
    const { token, entregaDriveLink, entregaLinksExtra } = await request.json();
    const c = await queryOne(db, 'SELECT * FROM contratos WHERE token=?', [token]);
    if (!c) return err('Contrato no encontrado', 404);
    const estatusEntrega = c.saldo_pendiente <= 0 ? 'Completado' : 'Entregado';
    const tsEntrega = now();
    await run(db,
      `UPDATE contratos SET entrega_drive_link=?, entrega_links_extra=?, estatus=?, fecha_entrega=? WHERE token=?`,
      [entregaDriveLink, entregaLinksExtra || '', estatusEntrega, tsEntrega, token]
    );
    await run(db,
      `UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE token=?`,
      [estatusEntrega, tsEntrega, token]
    );
    if (c.correo_cliente) {
      callAdapter(ctx, env, 'enviarCorreoEntrega', {
        token, nombreCliente: c.nombre_cliente, correoCliente: c.correo_cliente,
        folio: c.folio,
        linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`
      });
    }
    return ok({ ok: true });
  }

  if (action === 'revocarEntrega') {
    const { token, revocar } = await request.json();
    if (revocar) {
      const cr = await queryOne(db, 'SELECT estatus, saldo_pendiente FROM contratos WHERE token=?', [token]);
      if (!cr) return err('Contrato no encontrado', 404);
      const estatusRevocado = (cr.saldo_pendiente <= 0) ? 'Completado' : 'En produccion';
      const tsRev = now();
      await run(db,
        `UPDATE contratos SET entrega_revocada=?, estatus=? WHERE token=?`,
        [tsRev, estatusRevocado, token]
      );
      await run(db,
        `UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE token=?`,
        [estatusRevocado, tsRev, token]
      );
    } else {
      const cr = await queryOne(db, 'SELECT saldo_pendiente FROM contratos WHERE token=?', [token]);
      if (!cr) return err('Contrato no encontrado', 404);
      const estatusRestaurado = (cr.saldo_pendiente <= 0) ? 'Completado' : 'Entregado';
      const tsRes = now();
      await run(db,
        `UPDATE contratos SET entrega_revocada=NULL, estatus=? WHERE token=?`,
        [estatusRestaurado, token]
      );
      await run(db,
        `UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE token=?`,
        [estatusRestaurado, tsRes, token]
      );
    }
    return ok({ ok: true });
  }

  if (action === 'guardarCaracteristicas') {
    const body = await request.json();
    const { token, numPropiedad } = body;
    const texto = body.sobreLaPropiedad ?? body.caracteristicas ?? '';
    await run(db,
      'UPDATE propiedades SET sobre_la_propiedad=? WHERE contrato_token=? AND num_propiedad=?',
      [texto, token, numPropiedad]
    );
    return ok({ ok: true });
  }

  if (action === 'guardarNotaPropiedad') {
    const { token, numPropiedad, nota } = await request.json();
    await run(db,
      'UPDATE propiedades SET nota_interna=? WHERE contrato_token=? AND num_propiedad=?',
      [nota, token, numPropiedad]
    );
    return ok({ ok: true });
  }

  if (action === 'guardarFormatoPropiedad') {
    const { token, numPropiedad, formatoVideo, ocultarFormatoVideo } = await request.json();
    await run(db,
      'UPDATE propiedades SET formato_video=?, ocultar_formato_video=? WHERE contrato_token=? AND num_propiedad=?',
      [formatoVideo || 'vertical_nativo', ocultarFormatoVideo ? 1 : 0, token, numPropiedad]
    );
    return ok({ ok: true });
  }

  if (action === 'ocultarContrato') {
    const { token } = await request.json();
    await run(db, 'UPDATE contratos SET oculto=1 WHERE token=?', [token]);
    return ok({ ok: true });
  }

  if (action === 'eliminarContrato') {
    const { token } = await request.json();
    // D1 no respeta FOREIGN KEYS — cascada manual en orden correcto
    const ts = now();
    await batch(db, [
      { sql: `UPDATE trabajos SET estatus='En cotizacion', contrato_token='', fecha_ultima_actividad=? WHERE contrato_token=?`, params: [ts, token] },
      { sql: 'DELETE FROM revisiones_video WHERE contrato_id=?', params: [token] },
      { sql: 'DELETE FROM checklist WHERE contrato_token=?', params: [token] },
      { sql: 'DELETE FROM propiedades WHERE contrato_token=?', params: [token] },
      { sql: 'DELETE FROM abonos WHERE contrato_token=?', params: [token] },
      { sql: 'DELETE FROM tokens WHERE contrato_id=?', params: [token] },
      { sql: 'DELETE FROM contratos WHERE token=?', params: [token] }
    ]);
    return ok({ ok: true });
  }

  if (action === 'reagendarPropiedad') {
    const { token, numPropiedad, fecha, hora } = await request.json();
    if (!token || !numPropiedad || !fecha) return err('Faltan campos requeridos');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return err('Formato de fecha inválido (esperado YYYY-MM-DD)');
    const c = await queryOne(db, 'SELECT * FROM contratos WHERE token=?', [token]);
    if (!c) return err('Contrato no encontrado', 404);
    const p = await queryOne(db,
      'SELECT * FROM propiedades WHERE contrato_token=? AND num_propiedad=?', [token, numPropiedad]
    );
    if (!p) return err('Propiedad no encontrada', 404);
	    const folioAnterior = c.folio;
	    let folioNuevo = folioAnterior;
	    if (parseInt(numPropiedad) === 1) {
	      folioNuevo = await asignarFolio(db, fecha);
	    }
	    const horaFinal = hora || p.hora_sesion;
	    const statements = [{
	      sql: 'UPDATE propiedades SET fecha_sesion=?, hora_sesion=? WHERE contrato_token=? AND num_propiedad=?',
	      params: [fecha, horaFinal, token, numPropiedad]
	    }];
	    if (parseInt(numPropiedad) === 1) {
	      statements.push({
	        sql: 'UPDATE contratos SET folio=? WHERE token=?',
	        params: [folioNuevo, token]
	      });
	    }
	    await batch(db, statements);
	    const { results: paquetesRe } = await query(db, 'SELECT clave, nombre FROM paquetes');
	    const pkMapRe = Object.fromEntries(paquetesRe.map(r => [r.clave, r.nombre]));
	    callAdapter(ctx, env, 'reagendarPropiedad', {
	      token, numPropiedad, fecha, hora: horaFinal,
      folioAnterior,
      folioNuevo,
      contrato: { ...c, folio: folioNuevo, paquete_base: pkMapRe[c.paquete_base] || c.paquete_base },
      propiedad: { ...p, paquete: pkMapRe[p.paquete] || p.paquete }
    });
    return ok({ ok: true });
  }

  if (action === 'enviarRecordatorio') {
    const { token } = await request.json();
    const c = await queryOne(db, 'SELECT * FROM contratos WHERE token=?', [token]);
    if (!c) return err('Contrato no encontrado', 404);
    callAdapter(ctx, env, 'enviarRecordatorioPago', {
      token, nombreCliente: c.nombre_cliente, correoCliente: c.correo_cliente,
      folio: c.folio, saldoPendiente: c.saldo_pendiente,
      linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`
    });
    return ok({ ok: true });
  }

  if (action === 'actualizarCarpeta') {
    const { token, numPropiedad, carpetaControlId, carpetaEntregablesId } = await request.json();
    const sets = [];
    const params = [];
    if (carpetaControlId) {
      sets.push('carpeta_control_id=?');
      params.push(carpetaControlId);
    }
    if (carpetaEntregablesId) {
      sets.push('carpeta_entregables_id=?');
      params.push(carpetaEntregablesId);
    }
    if (!sets.length) return err('Nada que actualizar');
    params.push(token, numPropiedad);
    await run(db,
      `UPDATE propiedades SET ${sets.join(', ')} WHERE contrato_token=? AND num_propiedad=?`,
      params
    );
    return ok({ ok: true });
  }

  if (action === 'actualizarCalendarEvent') {
    const { token, numPropiedad, calendarEventId } = await request.json();
    await run(db,
      'UPDATE propiedades SET calendar_event_id=? WHERE contrato_token=? AND num_propiedad=?',
      [calendarEventId, token, numPropiedad]
    );
    return ok({ ok: true });
  }

  if (action === 'actualizarPdfUrl') {
    const { token, pdfUrl } = await request.json();
    await run(db, 'UPDATE contratos SET pdf_contrato_url=?, firma_base64_url=NULL WHERE token=?', [pdfUrl, token]);
    return ok({ ok: true });
  }

  if (action === 'actualizarExpress') {
    const { token, express } = await request.json();
    if (!token) return err('Token requerido');
    const result = await run(db, 'UPDATE contratos SET entrega_express=? WHERE token=?', [express ? 1 : 0, token]);
    if (!result.meta?.changes) return err('Contrato no encontrado', 404);
    return ok({ ok: true });
  }

  return err('Acción no encontrada', 404);
}
