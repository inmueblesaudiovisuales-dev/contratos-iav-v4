import { queryOne, query } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';
import { callAdapterSync } from '../google.js';

export async function handleArchivos(request, env, ctx, action) {
  const db = env.DB;

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

    const prop = await queryOne(db,
      'SELECT carpeta_control_id FROM propiedades WHERE contrato_token = ? AND num_propiedad = ?',
      [token, numPropiedad || 1]
    );
    if (!prop?.carpeta_control_id) {
      return err('La carpeta del proyecto aún no existe. Verifica que el contrato haya sido firmado y el adapter haya procesado la firma.');
    }
    const result = await callAdapterSync(env, 'subirArchivoAdmin', {
      carpetaId: prop.carpeta_control_id, base64, mimeType, nombre
    });
    return ok(result);
  }

  return err('Acción no encontrada', 404);
}
