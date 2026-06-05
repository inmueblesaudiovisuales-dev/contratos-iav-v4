import { queryOne, query, run, batch, parseFecha, now } from '../db.js';
import { ok, err } from '../auth.js';
import { callAdapter, callAdapterSync } from '../google.js';

function limpiarLinkMaps(url) {
  if (!url) return url;
  const m = url.match(/[?&]q=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  return url;
}

export async function handlePortal(request, env, ctx, action) {
  const db = env.DB;
  const url = new URL(request.url);

  if (action === 'obtenerPortal') {
    const token = url.searchParams.get('token');
    if (!token) return err('Token requerido');

    let contratoFinal = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [token]);

    if (!contratoFinal) {
      const tk = await queryOne(db, 'SELECT * FROM tokens WHERE token = ?', [token]);
      if (!tk) return err('Token no encontrado', 404);
      if (tk.usado) return err('Token ya utilizado', 403);
      if (tk.expira && new Date(tk.expira) < new Date()) return err('Token expirado', 403);
      contratoFinal = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [tk.contrato_id]);
      if (!contratoFinal) return err('Contrato no encontrado', 404);
    }

    const { results: propiedades } = await query(db,
      'SELECT * FROM propiedades WHERE contrato_token = ? ORDER BY num_propiedad',
      [contratoFinal.token]
    );

    const { results: abonosPortal } = await query(db,
      'SELECT monto, metodo, fecha, fecha_registro FROM abonos WHERE contrato_token = ? ORDER BY fecha_registro',
      [contratoFinal.token]
    );
    const totalAbonado = abonosPortal.reduce((s, a) => s + (a.monto || 0), 0);

    const { results: todosLosPaquetes } = await query(db, 'SELECT clave, nombre, entregables FROM paquetes');
    const pkMap = Object.fromEntries(todosLosPaquetes.map(p => [p.clave, p.nombre]));
    const pkEntregablesMap = Object.fromEntries(todosLosPaquetes.map(p => [p.clave, p.entregables]));

    const adicionales = JSON.parse(contratoFinal.adicionales_json || '[]');
    const ofertasStrings = adicionales.filter(i => typeof i === 'string');
    const ofertasObjs    = adicionales.filter(i => typeof i === 'object' && (i.ofrecido || !i.precio));
    const acordados      = adicionales.filter(i => typeof i === 'object' && i.precio && !i.ofrecido);

    const todasLasClaves = [...new Set([
      ...ofertasStrings,
      ...ofertasObjs.map(o => o.clave)
    ])].filter(Boolean);

    let allPkgs = [];
    if (todasLasClaves.length > 0) {
      const placeholders = todasLasClaves.map(() => '?').join(',');
      const { results } = await query(db,
        `SELECT * FROM paquetes WHERE clave IN (${placeholders}) AND activo = 1`,
        todasLasClaves
      );
      allPkgs = results;
    }

    const paquetesDisponibles = [];
    for (const s of ofertasStrings) {
      const pkg = allPkgs.find(p => p.clave === s);
      if (pkg) paquetesDisponibles.push({ ...pkg, clave: pkg.clave, nombre: pkg.nombre, precio: pkg.precio, entregables: pkg.entregables, numPropiedad: null });
    }
    for (const o of ofertasObjs) {
      if (o.ofrecido) {
        // Custom offered add-on — no catalog lookup needed
        paquetesDisponibles.push({
          clave: o.nombre, nombre: o.nombre, precio: o.precio || 0,
          entregables: '', numPropiedad: o.numPropiedad || null, custom: true
        });
      } else {
        const pkg = allPkgs.find(p => p.clave === o.clave);
        if (pkg) paquetesDisponibles.push({ ...pkg, clave: pkg.clave, nombre: pkg.nombre, precio: pkg.precio, entregables: pkg.entregables, numPropiedad: o.numPropiedad || null });
      }
    }

    const extrasAcordados = acordados.map(i => ({
      nombre: i.nombre || pkMap[i.clave] || i.clave,
      precio: i.precio || 0,
      entregables: pkEntregablesMap[i.clave] || ''
    }));

    // Todos los adicionales (objetos + strings resueltos) para el comprobante
    const todosAdicionales = acordados.map(i => ({ nombre: i.nombre || pkMap[i.clave] || i.clave, precio: i.precio || 0 }));
    for (const s of ofertasStrings) {
      const pkg = allPkgs.find(p => p.clave === s);
      todosAdicionales.push({ nombre: pkg ? pkg.nombre : s, precio: pkg?.precio || 0 });
    }
    for (const o of ofertasObjs) {
      if (o.ofrecido) {
        todosAdicionales.push({ nombre: o.nombre, precio: o.precio || 0 });
      } else {
        const pkg = allPkgs.find(p => p.clave === o.clave);
        todosAdicionales.push({ nombre: pkg ? pkg.nombre : o.clave, precio: pkg?.precio || 0 });
      }
    }

    let logoPrecargadoUrl = null;
    if (contratoFinal.correo_cliente) {
      try {
        const logoData = await Promise.race([
          callAdapterSync(env, 'obtenerLogoCliente', { correo: contratoFinal.correo_cliente }),
          new Promise(resolve => setTimeout(() => resolve(null), 3000))
        ]);
        logoPrecargadoUrl = logoData?.logoPrecargadoUrl || null;
      } catch (e) {
        console.error('Error obteniendo logo cliente:', e.message);
      }
    }

    return ok({
      ok: true,
      token: contratoFinal.token,
      folio: contratoFinal.folio,
      nombreCliente: contratoFinal.nombre_cliente,
      correoCliente: contratoFinal.correo_cliente,
      telefonoCliente: contratoFinal.telefono_cliente,
      tipoContrato: contratoFinal.tipo_contrato,
      tipoPaquete: contratoFinal.tipo_paquete,
      paqueteBase: pkMap[contratoFinal.paquete_base] || contratoFinal.paquete_base,
      precioBase: contratoFinal.precio_base,
      precioTotal: contratoFinal.precio_total,
      anticipo: contratoFinal.anticipo,
      saldoPendiente: contratoFinal.saldo_pendiente,
      estatus: contratoFinal.estatus,
      fechaFirma: contratoFinal.fecha_firma,
      pdfContratoUrl: contratoFinal.pdf_contrato_url,
      notasContrato: contratoFinal.notas_contrato,
      entregaDriveLink: contratoFinal.entrega_drive_link,
      entregaLinksExtra: contratoFinal.entrega_links_extra,
      entregaRevocada: contratoFinal.entrega_revocada,
      calificacion: contratoFinal.calificacion,
      resenaTexto: contratoFinal.resena_texto,
      abonos: abonosPortal.map(a => ({
        monto: a.monto,
        metodo: a.metodo,
        fecha: a.fecha,
        fechaRegistro: a.fecha_registro
      })),
      totalAbonado,
      propiedades: propiedades.map(p => ({
        numPropiedad: p.num_propiedad,
        tipo: p.tipo,
        paquete: pkMap[p.paquete] || p.paquete,
        entregables: p.entregables,
        fechaSesion: p.fecha_sesion,
        horaSesion: p.hora_sesion,
        direccion: p.direccion,
        linkMaps: p.link_maps,
        orientacion: p.orientacion,
        sobreLaPropiedad: p.sobre_la_propiedad,
        referencias: p.referencias,
        fachadaUrl: p.fachada_url,
        perimetroUrl: p.perimetro_url,
        datosEspecificos: JSON.parse(p.datos_especificos || '{}'),
        logoUrl: p.logo_url,
        carpetaControlId: p.carpeta_control_id,
        formatoVideo: p.formato_video || 'vertical_nativo',
        requiereAcceso: p.requiere_acceso ? 1 : 0,
        ocultarFormatoVideo: p.ocultar_formato_video ? 1 : 0
      })),
      paquetesDisponibles,
      extrasAcordados,
      todosAdicionales,
      banco: 'Banamex',
      titular: 'Bruno Gutierrez Salazar',
      clabe: '002580905411451243',
      cuenta: '1145124',
      tarjeta: '5544 9206 0686 5310',
      clipLink: 'https://linkdenegocio.mx/@inmueblesaudiovisuales/pagar',
      waLink: 'https://wa.me/5218127174207',
      logoPrecargadoUrl
    });
  }

  if (action === 'firmaCliente') {
    const body = await request.json();
    const { token, correoCliente, telefonoCliente, firmaBase64,
            adicionales: adicionalesSeleccionados, propiedades: propsCliente } = body;
    if (!token) return err('Token requerido');

    const contrato = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [token]);
    if (!contrato) return err('Contrato no encontrado', 404);
    if (contrato.estatus !== 'Pendiente firma') return err('El contrato ya fue firmado');

    const tkPortal = await queryOne(db,
      "SELECT * FROM tokens WHERE contrato_id = ? AND tipo = 'contrato' AND usado = 0 ORDER BY rowid DESC LIMIT 1",
      [contrato.token]
    );
    if (tkPortal?.expira && new Date(tkPortal.expira) < new Date()) {
      return err('El enlace de firma ha expirado. Solicita un nuevo enlace a Bruno.', 403);
    }

    const adicionalesExistentes = JSON.parse(contrato.adicionales_json || '[]');
    const acordados = adicionalesExistentes.filter(i => typeof i === 'object');

    // Partir del precio_total ya fijado por Bruno (incluye extras acordados)
    let precioTotal = contrato.precio_total;
    const adicionalesAceptados = [];

    const clavesSeen = new Set();
    const adicionalesDedup = (adicionalesSeleccionados || []).filter(item => {
      const clave = typeof item === 'string' ? item : item.clave;
      if (!clave || clavesSeen.has(clave)) return false;
      clavesSeen.add(clave);
      return true;
    });

    if (adicionalesDedup.length) {
      for (const item of adicionalesDedup) {
        const clave = typeof item === 'string' ? item : item.clave;
        if (!clave) continue;
        if (typeof item === 'object' && item.precio && item.ofrecido) {
          // Custom offered add-on — use its own precio
          if (item.precio < 0) continue;
          precioTotal += item.precio;
          adicionalesAceptados.push(item);
        } else {
          const p = await queryOne(db, 'SELECT precio FROM paquetes WHERE clave = ?', [clave]);
          if (p) {
            precioTotal += p.precio;
            adicionalesAceptados.push(item);
          }
        }
      }
    }

    const anticipo = contrato.anticipo;
    // El anticipo es el primer pago SUGERIDO, no un pago hecho: firmar NO reduce el
    // saldo ni reserva. El saldo queda completo (con los adicionales que el cliente
    // haya agregado) y solo baja con abonos reales.
    const saldoPendiente = precioTotal;
    const nuevoEstatus = 'Firmado';
    const nuevoAdicionales = [...acordados, ...adicionalesAceptados];

    const firmaNow = now();
    const statements = [
      {
        sql: `UPDATE contratos SET estatus=?, fecha_firma=?, precio_total=?, saldo_pendiente=?,
              adicionales_json=?, firma_base64_url='pending',
              correo_cliente=COALESCE(NULLIF(?, ''), correo_cliente),
              telefono_cliente=COALESCE(NULLIF(?, ''), telefono_cliente)
              WHERE token=? AND estatus='Pendiente firma'`,
        params: [nuevoEstatus, firmaNow, precioTotal, saldoPendiente,
                 JSON.stringify(nuevoAdicionales), correoCliente || '', telefonoCliente || '', token]
      }
    ];
    if (propsCliente?.length) {
      for (const p of propsCliente) {
        statements.push({
          sql: `UPDATE propiedades SET direccion=?, link_maps=?, orientacion=?, sobre_la_propiedad=?,
                referencias=?, fachada_url=?, perimetro_url=?, datos_especificos=?, logo_url=?,
                formato_video=?, requiere_acceso=?
                WHERE contrato_token=? AND num_propiedad=?
                  AND EXISTS (SELECT 1 FROM contratos WHERE token=? AND fecha_firma=?)`,
          params: [p.direccion || '', limpiarLinkMaps(p.linkMaps || ''), p.orientacion || '', p.sobreLaPropiedad || '',
                   p.referencias || '', p.fachadaUrl || '', p.perimetroUrl || '',
                   JSON.stringify(p.datosEspecificos || {}), p.logoUrl || '',
                   p.formatoVideo || 'vertical_nativo', p.requiereAcceso || 0,
                   token, p.numPropiedad, token, firmaNow]
        });
      }
    }
    const results = await batch(db, statements);
    if (!results[0]?.meta?.changes) return err('El contrato ya fue firmado', 409);

    // Sync estatus to trabajos and fire Reservado calendar event if needed
    const trabajoFirma = await queryOne(db,
      'SELECT id, cliente_id FROM trabajos WHERE token=?', [token]);
    if (trabajoFirma) {
      await run(db,
        `UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE id=?`,
        [nuevoEstatus, firmaNow, trabajoFirma.id]
      );
      if (nuevoEstatus === 'Reservado') {
        callAdapter(ctx, env, 'crearEventoReservado', {
          trabajoId: trabajoFirma.id,
          token,
          nombreCliente: contrato.nombre_cliente,
          telefono: contrato.telefono_cliente || '',
          equipoUrl: `https://contratos.inmueblesaudiovisuales.com/equipo.html?token=${token}`
        });
      }
    }

    const { results: propiedadesFirma } = await query(db,
      'SELECT * FROM propiedades WHERE contrato_token = ? ORDER BY num_propiedad', [token]
    );
    const paqueteInfo = await queryOne(db,
      'SELECT entregables FROM paquetes WHERE clave = ?', [contrato.paquete_base]
    );
    const entregablesAdapter = propiedadesFirma.map(p => p.entregables).filter(Boolean).join(' | ') || paqueteInfo?.entregables || '';
    const { results: paquetesDb } = await query(db, 'SELECT clave, nombre FROM paquetes');
    const pkMap = Object.fromEntries(paquetesDb.map(p => [p.clave, p.nombre]));

    const adicionalesNombres = nuevoAdicionales.map(a => {
      if (typeof a === 'string') return pkMap[a] || a;
      if (a.clave && !a.nombre) return { ...a, nombre: pkMap[a.clave] || a.clave };
      return a;
    });

    callAdapter(ctx, env, 'procesarFirma', {
      token, firmaBase64,
      contrato: {
        ...contrato,
        precio_total: precioTotal,
        anticipo: anticipo,
        saldo_pendiente: saldoPendiente,
        estatus: nuevoEstatus,
        correo_cliente: correoCliente || contrato.correo_cliente,
        telefono_cliente: telefonoCliente || contrato.telefono_cliente,
        adicionales_json: JSON.stringify(adicionalesNombres),
        paquete_base: pkMap[contrato.paquete_base] || contrato.paquete_base,
      },
      linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`,
      propiedades: propiedadesFirma.map(p => ({ ...p, paquete: pkMap[p.paquete] || p.paquete })),
      entregables: entregablesAdapter
    });

    return ok({ ok: true, estatus: nuevoEstatus, total: precioTotal, anticipo, folio: contrato.folio });
  }

  if (action === 'guardarResena') {
    const { token, calificacion, resenaTexto } = await request.json();
    if (!token) return err('Token requerido');
    const contratoResena = await queryOne(db, 'SELECT estatus FROM contratos WHERE token = ?', [token]);
    if (!contratoResena) return err('Contrato no encontrado', 404);
    if (!['Entregado', 'Completado'].includes(contratoResena.estatus)) return err('Solo puedes calificar después de recibir tu material', 403);
    await run(db,
      'UPDATE contratos SET calificacion=?, resena_texto=? WHERE token=?',
      [calificacion, resenaTexto || '', token]
    );
    callAdapter(ctx, env, 'notificarResena', { token, calificacion, resenaTexto });
    return ok({ ok: true });
  }

  if (action === 'guardarConfiguracion') {
    return err('Este endpoint ha sido deprecado en v5.0. Los contratos ahora se crean directamente con propiedades desde el admin.', 410);
  }

  return err('Acción no encontrada', 404);
}
