import { queryOne, run, now } from '../db.js';
import { ok, err } from '../auth.js';

const COLUMNAS_DEFAULT = { foto: true, video: true, t360: true };

const TEMPLATE_CUARTOS = JSON.stringify({
  cuartos: [
    { nombre: 'Sala', foto: false, video: false, t360: false },
    { nombre: 'Comedor', foto: false, video: false, t360: false },
    { nombre: 'Cocina', foto: false, video: false, t360: false },
    { nombre: 'Recámara principal', foto: false, video: false, t360: false },
    { nombre: 'Recámara 2', foto: false, video: false, t360: false },
    { nombre: 'Baño principal', foto: false, video: false, t360: false },
    { nombre: 'Exterior / Jardín', foto: false, video: false, t360: false },
    { nombre: 'Garage', foto: false, video: false, t360: false }
  ],
  columnas: COLUMNAS_DEFAULT
});

function migrarFormato(data) {
  // Si ya es el nuevo formato {cuartos, columnas}, devolverlo
  if (data && !Array.isArray(data) && data.cuartos) return data;
  // Si es array (formato viejo [{nombre, completado}]), migrar
  if (Array.isArray(data)) {
    return {
      cuartos: data.map(c => ({
        nombre: c.nombre,
        foto: c.completado || false,
        video: c.completado || false,
        t360: c.completado || false
      })),
      columnas: COLUMNAS_DEFAULT
    };
  }
  return JSON.parse(TEMPLATE_CUARTOS);
}

export async function handleChecklist(request, env, ctx, action) {
  const db = env.DB;
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ||
    (request.method === 'POST' ? (await request.clone().json()).token : null);

  if (!token) return err('Token requerido');

  const contrato = await queryOne(db, 'SELECT token, folio, nombre_cliente FROM contratos WHERE token = ?', [token]);
  if (!contrato) return err('Contrato no válido', 403);

  if (action === 'obtenerChecklist') {
    const row = await queryOne(db, 'SELECT * FROM checklist WHERE contrato_token = ?', [token]);
    const base = { token, folio: contrato.folio || '', nombreCliente: contrato.nombre_cliente || '' };
    if (!row) {
      const parsed = JSON.parse(TEMPLATE_CUARTOS);
      return ok({ ...base, ...parsed, esTemplate: true, rev: 0 });
    }
    const parsed = migrarFormato(JSON.parse(row.cuartos_json));
    return ok({ ...base, ...parsed, esTemplate: false, rev: row.rev || 0 });
  }

  if (action === 'guardarChecklist') {
    // F62 — candado de concurrencia (compare-and-swap por rev). El guardado solo se
    // aplica si la rev que trae el cliente sigue vigente; si no, se devuelve el estado
    // actual con bandera `conflict` para que el cliente FUSIONE y reintente. Asi un
    // dispositivo nunca pisa lo que otro escribio (incidente 2026-06-06).
    const body = await request.json();
    const data = { cuartos: body.cuartos || [], columnas: body.columnas || COLUMNAS_DEFAULT };
    const cuartos = JSON.stringify(data);
    const baseRev = Number.isInteger(body.baseRev) ? body.baseRev : null;

    const existe = await queryOne(db, 'SELECT rev FROM checklist WHERE contrato_token = ?', [token]);

    if (!existe) {
      // Primera escritura: insertar en rev=1. Si hay carrera y ya existe, cae a conflicto.
      try {
        await run(db,
          'INSERT INTO checklist (contrato_token, cuartos_json, rev, fecha_creacion, fecha_actualizacion) VALUES (?, ?, 1, ?, ?)',
          [token, cuartos, now(), now()]
        );
        return ok({ ok: true, rev: 1 });
      } catch (_) {
        const fila = await queryOne(db, 'SELECT cuartos_json, rev FROM checklist WHERE contrato_token = ?', [token]);
        const parsed = migrarFormato(JSON.parse(fila.cuartos_json));
        return ok({ conflict: true, ...parsed, rev: fila.rev || 0 });
      }
    }

    // Compare-and-swap atomico: solo cambia si rev sigue siendo baseRev.
    const res = baseRev === null ? { meta: { changes: 0 } } : await run(db,
      'UPDATE checklist SET cuartos_json = ?, rev = rev + 1, fecha_actualizacion = ? WHERE contrato_token = ? AND rev = ?',
      [cuartos, now(), token, baseRev]
    );
    if (res && res.meta && res.meta.changes === 1) {
      return ok({ ok: true, rev: baseRev + 1 });
    }
    // Conflicto (otra escritura gano, o el cliente no mando baseRev): devolver el estado vigente.
    const fila = await queryOne(db, 'SELECT cuartos_json, rev FROM checklist WHERE contrato_token = ?', [token]);
    const parsed = migrarFormato(JSON.parse(fila.cuartos_json));
    return ok({ conflict: true, ...parsed, rev: fila.rev || 0 });
  }

  return err('Acción no encontrada', 404);
}
