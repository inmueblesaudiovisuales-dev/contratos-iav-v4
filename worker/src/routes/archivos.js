import { queryOne, query, run } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';
import { callAdapterSync } from '../google.js';

export async function handleArchivos(request, env, ctx, action) {
  const db = env.DB;

  // ── Archivos a nivel cliente (logo reutilizable) ──
  if (action === 'subirArchivoCliente') {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const body = await request.json();
    const { clienteId, base64, mimeType, nombre, esLogo } = body;
    if (!clienteId) return err('clienteId requerido');
    if (!base64) return err('Archivo requerido');
    const cliente = await queryOne(db, 'SELECT id, nombre, carpeta_cliente_id FROM clientes WHERE id=?', [clienteId]);
    if (!cliente) return err('Cliente no encontrado', 404);

    const result = await callAdapterSync(env, 'subirArchivoCliente', {
      clienteId, nombreCliente: cliente.nombre || '',
      carpetaClienteId: cliente.carpeta_cliente_id || '',
      base64, mimeType, nombre, esLogo: !!esLogo
    });
    if (result && result.error) return err(result.error);

    // Persistir carpeta del cliente y/o logo si el adapter los devuelve
    try {
      const sets = [], params = [];
      if (result?.carpetaClienteId) { sets.push('carpeta_cliente_id=?'); params.push(result.carpetaClienteId); }
      if (esLogo && result?.url) { sets.push('logo_url=?'); params.push(result.url); }
      if (sets.length) { params.push(clienteId); await run(db, `UPDATE clientes SET ${sets.join(', ')} WHERE id=?`, params); }
    } catch (e) { /* migración pendiente → no persiste, pero el archivo ya quedó en Drive */ }

    return ok({ ok: true, url: result?.url || '', esLogo: !!esLogo, carpetaClienteId: result?.carpetaClienteId || '' });
  }

  if (action === 'listarArchivosCliente') {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const url = new URL(request.url);
    const clienteId = url.searchParams.get('clienteId');
    if (!clienteId) return err('clienteId requerido');
    let cliente = null;
    try {
      cliente = await queryOne(db, 'SELECT id, nombre, logo_url, carpeta_cliente_id FROM clientes WHERE id=?', [clienteId]);
    } catch (e) {
      cliente = await queryOne(db, 'SELECT id, nombre FROM clientes WHERE id=?', [clienteId]);
    }
    if (!cliente) return err('Cliente no encontrado', 404);
    let archivos = [];
    if (cliente.carpeta_cliente_id) {
      const result = await callAdapterSync(env, 'listarArchivosCliente', {
        clienteId, carpetaClienteId: cliente.carpeta_cliente_id
      });
      if (result && Array.isArray(result.archivos)) archivos = result.archivos;
    }
    return ok({ ok: true, archivos, logoUrl: cliente.logo_url || '' });
  }

  if (action === 'subirArchivo') {
    const body = await request.json();
    const { token, base64, mimeType, nombre, numPropiedad } = body;
    if (!token) return err('Token requerido');

    const contrato = await queryOne(db,
      'SELECT token, folio, nombre_cliente FROM contratos WHERE token = ?', [token]);
    if (!contrato) return err('Contrato no encontrado', 404);

    const keyHeader = request.headers.get('X-Admin-Key');
    const isAdmin = keyHeader === env.ADMIN_KEY;
    if (!isAdmin) {
      const tk = await queryOne(db,
        "SELECT * FROM tokens WHERE contrato_id = ? AND tipo = 'contrato' AND usado = 0", [token]
      );
      if (!tk) return err('No autorizado. Usa el enlace de tu portal.', 403);
      if (tk.expira && new Date(tk.expira) < new Date()) return err('Tu enlace ha expirado.', 403);
    }

    const prop = await queryOne(db,
      'SELECT carpeta_control_id, fecha_sesion FROM propiedades WHERE contrato_token = ? AND num_propiedad = ?',
      [token, numPropiedad || 1]
    );
    const result = await callAdapterSync(env, 'subirArchivo', {
      token, base64, mimeType, nombre, numPropiedad,
      carpetaId: prop?.carpeta_control_id || null,
      folio: contrato.folio || '',
      nombreCliente: contrato.nombre_cliente || '',
      fechaSesion: prop?.fecha_sesion || ''
    });
    return ok(result);
  }

  if (action === 'subirArchivoAdmin') {
    const deny = requireAdmin(request, env);
    if (deny) return deny;

    const body = await request.json();
    const { token, base64, mimeType, nombre, numPropiedad } = body;
    if (!token) return err('Token requerido');

    if (!base64) return err('Archivo requerido');
    const prop = await queryOne(db,
      'SELECT carpeta_control_id FROM propiedades WHERE contrato_token = ? AND num_propiedad = ?',
      [token, numPropiedad || 1]
    );
    let carpetaId = prop?.carpeta_control_id || null;
    // Fallback: si la carpeta del proyecto aún no existe (contrato sin firmar / adapter no procesó),
    // sube a la carpeta del cliente para no bloquear al admin.
    if (!carpetaId) {
      let cli = null;
      try {
        cli = await queryOne(db,
          `SELECT c.carpeta_cliente_id FROM contratos ct
           JOIN clientes c ON c.id = ct.cliente_id WHERE ct.token=?`, [token]);
      } catch (e) { /* migración pendiente */ }
      if (cli?.carpeta_cliente_id) carpetaId = cli.carpeta_cliente_id;
    }
    if (!carpetaId) {
      return err('La carpeta del proyecto aún no existe (el contrato debe estar firmado y procesado por el adapter). También puedes subir el archivo al expediente del cliente.');
    }
    const result = await callAdapterSync(env, 'subirArchivoAdmin', {
      carpetaId, base64, mimeType, nombre
    });
    if (result && result.error) return err(result.error);
    return ok(result);
  }

  return err('Acción no encontrada', 404);
}
