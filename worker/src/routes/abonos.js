import { query, queryOne, run, uuid, now } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';
import { callAdapter } from '../google.js';

export async function handleAbonos(request, env, ctx, action) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;

  if (action === 'registrarAbono') {
    const body = await request.json();
    const { token, monto, metodo, fecha, notas } = body;
    if (!token || !monto) return err('Token y monto requeridos');

    const contrato = await queryOne(db, 'SELECT * FROM contratos WHERE token = ?', [token]);
    if (!contrato) return err('Contrato no encontrado', 404);

    if (contrato.estatus === 'Pendiente firma') {
      return new Response(JSON.stringify({
        ok: false,
        error: 'El contrato aún no ha sido firmado. No se puede registrar un abono.',
        codigoError: 'REQUIERE_FIRMA'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Validar monto excesivo (a menos que se confirme explícitamente)
    const exceso = monto - contrato.saldo_pendiente;
    if (!body.permitirExceso && exceso > 0.5) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'El monto excede el saldo pendiente.',
        codigoError: 'EXCEDE_SALDO',
        saldoActual: contrato.saldo_pendiente,
        precioActual: contrato.precio_total,
        montoIntentado: monto,
        nuevoPrecioPropuesto: contrato.precio_total + exceso,
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const { results: abonosPrevios } = await query(db,
      'SELECT id, monto FROM abonos WHERE contrato_token = ?', [token]
    );
    const esPrimerAbono = abonosPrevios.length === 0;

    await run(db,
      'INSERT INTO abonos (id, contrato_token, monto, metodo, fecha, fecha_registro, notas) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuid(), token, monto, metodo || '', fecha || now().slice(0, 10), now(), notas || '']
    );

    const nuevoSaldo = Math.max(0, contrato.saldo_pendiente - monto);
    // Si se permitió pagar de más, el sobrepago sube el precio total (el cliente acordó
    // pagar más) — así el portal/admin reflejan el nuevo total, como promete el modal.
    const nuevoPrecioTotal = (exceso > 0.5) ? contrato.precio_total + exceso : contrato.precio_total;
    const ESTATUSES_AVANZADOS = ['En produccion', 'Entregado', 'Completado'];
    let nuevoEstatus;
    if (nuevoSaldo === 0) {
      nuevoEstatus = 'Completado';
    } else if (ESTATUSES_AVANZADOS.includes(contrato.estatus)) {
      nuevoEstatus = contrato.estatus; // don't regress
    } else {
      nuevoEstatus = 'Reservado'; // first or partial payment
    }
    const seActivaReservado = nuevoEstatus === 'Reservado' && contrato.estatus !== 'Reservado';
    await run(db,
      'UPDATE contratos SET saldo_pendiente = ?, precio_total = ?, estatus = ?, fecha_ultimo_abono = ? WHERE token = ?',
      [nuevoSaldo, nuevoPrecioTotal, nuevoEstatus, now(), token]
    );

    // Sync status to trabajos
    const trabajoAbono = await queryOne(db,
      'SELECT id, cliente_id FROM trabajos WHERE token=?', [token]);
    if (trabajoAbono) {
      await run(db,
        `UPDATE trabajos SET estatus=?, fecha_ultima_actividad=? WHERE id=?`,
        [nuevoEstatus, now(), trabajoAbono.id]
      );
      if (seActivaReservado) {
        const clienteAbono = await queryOne(db,
          'SELECT nombre, telefono FROM clientes WHERE id=?', [trabajoAbono.cliente_id]);
        callAdapter(ctx, env, 'crearEventoReservado', {
          trabajoId: trabajoAbono.id,
          token,
          nombreCliente: contrato.nombre_cliente,
          telefono: clienteAbono?.telefono || '',
          equipoUrl: `https://contratos.inmueblesaudiovisuales.com/equipo.html?token=${token}`
        });
      }
    }

    // Correo de confirmación primero (async)
    callAdapter(ctx, env, 'enviarCorreoAbono', {
      token,
      nombreCliente: contrato.nombre_cliente,
      correoCliente: contrato.correo_cliente,
      folio: contrato.folio,
      monto,
      metodo: metodo || 'Transferencia',
      nuevoSaldo,
      anticipo: contrato.anticipo,
      precioTotal: nuevoPrecioTotal,
      esPrimerAbono,
      linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`
    });

    const totalAbonado = abonosPrevios.reduce((s, a) => s + (a.monto || 0), 0) + monto;
    return ok({ ok: true, nuevoSaldo, estatus: nuevoEstatus, totalAbonado, precioTotal: nuevoPrecioTotal });
  }

  if (action === 'listarAbonos') {
    const token = new URL(request.url).searchParams.get('token');
    if (!token) return err('Token requerido');
    const { results } = await query(db,
      'SELECT * FROM abonos WHERE contrato_token = ? ORDER BY fecha_registro', [token]
    );
    return ok(results);
  }

  return err('Acción no encontrada', 404);
}
