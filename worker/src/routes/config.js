import { query, run, now } from '../db.js';
import { requireAdmin, ok, err } from '../auth.js';

// Claves que el portal del cliente puede leer (datos bancarios para pagar).
// Las plantillas de WhatsApp (wa_template_*) NO se exponen al portal.
const CLAVES_PUBLICAS = [
  'banco_clabe', 'banco_nombre', 'banco_titular', 'pago_oxxo', 'pago_clip_url'
];

// Defaults seguros si la tabla config aún no existe (migración pendiente).
const DEFAULTS = {
  banco_clabe: '', banco_nombre: '', banco_titular: '',
  pago_oxxo: '', pago_clip_url: ''
};

export async function handleConfig(request, env, ctx, action) {
  const db = env.DB;

  if (action === 'obtenerConfig') {
    // Público: solo claves bancarias. Degrada con gracia si no hay tabla config.
    let map = { ...DEFAULTS };
    try {
      const { results } = await query(db, 'SELECT clave, valor FROM config');
      for (const row of results) {
        if (CLAVES_PUBLICAS.includes(row.clave)) map[row.clave] = row.valor || '';
      }
    } catch (e) {
      // tabla config inexistente → defaults vacíos
    }
    return ok({ ok: true, ...map });
  }

  if (action === 'obtenerConfigAdmin') {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    let map = {};
    try {
      const { results } = await query(db, 'SELECT clave, valor FROM config');
      for (const row of results) map[row.clave] = row.valor || '';
    } catch (e) { /* tabla inexistente */ }
    return ok({ ok: true, config: map });
  }

  if (action === 'guardarConfig') {
    const deny = requireAdmin(request, env);
    if (deny) return deny;
    const body = await request.json();
    // Acepta { clave, valor } o { config: { clave: valor, ... } } para guardado masivo.
    const pares = body.config && typeof body.config === 'object'
      ? Object.entries(body.config)
      : (body.clave != null ? [[body.clave, body.valor]] : []);
    if (!pares.length) return err('Nada que guardar');
    const ts = now();
    try {
      for (const [clave, valor] of pares) {
        if (!clave) continue;
        await run(db,
          `INSERT INTO config (clave, valor, actualizado) VALUES (?, ?, ?)
           ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor, actualizado=excluded.actualizado`,
          [clave, valor == null ? '' : String(valor), ts]
        );
      }
    } catch (e) {
      return err('No se pudo guardar la configuración (¿migración r58 pendiente?). ' + e.message);
    }
    return ok({ ok: true });
  }

  return err('Acción no encontrada', 404);
}
