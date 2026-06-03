import { query } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';

export async function handleStats(request, env, ctx) {
  const db = env.DB;
  const deny = requireAdmin(request, env);
  if (deny) return deny;

  const periodo = new URL(request.url).searchParams.get('periodo') || 'mes';
  const PERIODOS_VALIDOS = ['mes', 'trimestre', 'anio', 'todo'];
  if (!PERIODOS_VALIDOS.includes(periodo)) return err('Periodo no válido', 400);
  const ahora = new Date();
  let desde = null;
  if (periodo === 'mes') desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  else if (periodo === 'trimestre') desde = new Date(ahora.getFullYear(), Math.floor(ahora.getMonth() / 3) * 3, 1);
  else if (periodo === 'anio') desde = new Date(ahora.getFullYear(), 0, 1);

  const [{ results: contratos }, { results: abonos }] = await Promise.all([
    desde
      ? query(db, 'SELECT * FROM contratos WHERE oculto = 0 AND fecha_creacion >= ?', [desde.toISOString()])
      : query(db, 'SELECT * FROM contratos WHERE oculto = 0'),
    desde
      ? query(db, 'SELECT * FROM abonos WHERE fecha_registro >= ?', [desde.toISOString()])
      : query(db, 'SELECT * FROM abonos')
  ]);

  const facturado = contratos.reduce((s, c) => s + (c.precio_total || 0), 0);
  const cobrado = abonos.reduce((s, a) => s + (a.monto || 0), 0);
  const porCobrar = contratos.reduce((s, c) => s + (c.saldo_pendiente || 0), 0);
  const ticketPromedio = contratos.length ? facturado / contratos.length : 0;

  const porEstatus = {};
  contratos.forEach(c => { porEstatus[c.estatus] = (porEstatus[c.estatus] || 0) + 1; });

  const clienteMap = {};
  contratos.forEach(c => {
    const key = c.correo_cliente || c.nombre_cliente || 'sin-correo';
    if (!clienteMap[key]) clienteMap[key] = { contratos: 0, total: 0, nombre: c.nombre_cliente };
    clienteMap[key].contratos++;
    clienteMap[key].total += c.precio_total || 0;
  });
  const topClientes = Object.entries(clienteMap)
    .map(([correo, v]) => ({ nombre: v.nombre, correo, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    meses.push({ mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, total: 0 });
  }
  contratos.forEach(c => {
    const key = (c.fecha_creacion || '').slice(0, 7);
    const m = meses.find(m => m.mes === key);
    if (m) m.total += c.precio_total || 0;
  });

  // Grupo counts for stats bar (always current, regardless of periodo)
  const { results: todosTrabajos } = await query(db,
    `SELECT t.estatus,
            COALESCE(p1.fecha_sesion, '') AS fecha_sesion
     FROM trabajos t
     LEFT JOIN contratos ct ON ct.token = t.token
     LEFT JOIN propiedades p1 ON p1.contrato_token = t.token AND p1.num_propiedad = 1
     WHERE t.estatus != 'Cancelado'`
  );

  const hoy = new Date().toISOString().substring(0, 10);
  const GRUPOS = {
    prospectos: ['Nuevo', 'En cotizacion'],
    por_firmar: ['Pendiente firma', 'Firmado'],
    confirmados: ['Reservado', 'En produccion', 'Entregado', 'Completado']
  };

  const contadoresGrupo = {
    prospectos: todosTrabajos.filter(t => GRUPOS.prospectos.includes(t.estatus)).length,
    por_firmar: todosTrabajos.filter(t => GRUPOS.por_firmar.includes(t.estatus)).length,
    confirmados: todosTrabajos.filter(t => GRUPOS.confirmados.includes(t.estatus)).length,
  };

  const sesionesHoy = todosTrabajos.filter(t =>
    GRUPOS.confirmados.includes(t.estatus) &&
    t.fecha_sesion && t.fecha_sesion.substring(0, 10) === hoy
  ).length;

  return ok({
    ok: true,
    periodo,
    numContratos: contratos.length,
    facturado,
    cobrado,
    porCobrar,
    ticketPromedio,
    porEstatus,
    topClientes,
    meses,
    contadoresGrupo,
    sesionesHoy
  });
}
