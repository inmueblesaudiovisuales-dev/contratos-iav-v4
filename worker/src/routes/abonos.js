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
    const ESTATUSES_AVANZADOS = ['En produccion', 'Entregado'];
    const nuevoEstatus = nuevoSaldo === 0
      ? (['Entregado','Completado'].includes(contrato.estatus) ? 'Completado' : 'Liquidado')
      : (contrato.estatus === 'Completado' ? 'Entregado'
        : ESTATUSES_AVANZADOS.includes(contrato.estatus) ? contrato.estatus
        : 'Anticipo recibido');
    await run(db,
      'UPDATE contratos SET saldo_pendiente = ?, estatus = ?, fecha_ultimo_abono = ? WHERE token = ?',
      [nuevoSaldo, nuevoEstatus, now(), token]
    );

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
      precioTotal: contrato.precio_total,
      esPrimerAbono,
      linkPortal: `https://contratos.inmueblesaudiovisuales.com/portal.html?token=${token}`
    });

    if (esPrimerAbono) {
      const { results: propiedades } = await query(db,
        'SELECT * FROM propiedades WHERE contrato_token = ? ORDER BY num_propiedad', [token]
      );
      const yaTieneCarpeta = propiedades.some(p => p.carpeta_control_id);
      if (!yaTieneCarpeta) {
        const { results: paquetesDb } = await query(db, 'SELECT clave, nombre FROM paquetes');
        const pkMap = Object.fromEntries(paquetesDb.map(p => [p.clave, p.nombre]));
        callAdapter(ctx, env, 'primerAbono', {
          token,
          contrato: { ...contrato, paquete_base: pkMap[contrato.paquete_base] || contrato.paquete_base },
          propiedades: propiedades.map(p => ({ ...p, paquete: pkMap[p.paquete] || p.paquete })),
          folio: contrato.folio
        });
      }
    }

    const totalAbonado = abonosPrevios.reduce((s, a) => s + (a.monto || 0), 0) + monto;
    return ok({ ok: true, nuevoSaldo, estatus: nuevoEstatus, totalAbonado });
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
