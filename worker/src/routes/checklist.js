import { queryOne, run, now, batch } from '../db.js';
import { ok, err } from '../auth.js';

// F64 — archiva el estado nuevo en checklist_historial y conserva las ultimas 50 versiones
// por contrato. Recuperacion dentro del sistema sin Time Travel. No rompe el guardado si falla.
async function archivar(db, token, cuartos, rev, autor) {
  try {
    await batch(db, [
      { sql: 'INSERT INTO checklist_historial (contrato_token, cuartos_json, rev, autor, fecha) VALUES (?, ?, ?, ?, ?)', params: [token, cuartos, rev, autor || null, now()] },
      { sql: 'DELETE FROM checklist_historial WHERE contrato_token = ? AND id NOT IN (SELECT id FROM checklist_historial WHERE contrato_token = ? ORDER BY id DESC LIMIT 50)', params: [token, token] },
    ]);
  } catch (e) {
    console.error('archivar checklist_historial fallo:', e.message);
  }
}

const COLUMNAS_DEFAULT = { foto: true, video: true, t360: true };

// Extrae el FILE_ID de una URL de Drive (formatos /d/<id> o ?id=<id>).
function extraerIdDrive(url) {
  const s = String(url || '');
  const m = s.match(/\/d\/([^/?&]+)/) || s.match(/[?&]id=([^&]+)/);
  return m ? m[1] : '';
}

// Ensambla los datos de negocio que necesita la app de metadatos (offline) a partir de la
// primera propiedad del contrato: carpeta de entregables, logos y paquete/entregables. Se
// adjunta a la respuesta de obtenerChecklist (publico por token) porque obtenerContrato exige
// admin. Todo es opcional/aditivo: si no hay carpeta o logo, ese bloque no se incluye.
async function datosNegocio(db, token) {
  const out = {};
  const prop = await queryOne(db,
    'SELECT * FROM propiedades WHERE contrato_token = ? ORDER BY num_propiedad LIMIT 1', [token]);
  if (!prop) return out;

  // entrega: la carpeta se crea al firmar. Sin carpeta -> se omite (contrato sin firmar).
  const carpetaId = prop.carpeta_entregables_id || '';
  const carpetaCtrl = prop.carpeta_control_id || '';
  if (carpetaId || carpetaCtrl) {
    out.entrega = {
      carpetaEntregablesId: carpetaId || null,
      carpetaEntregablesUrl: carpetaId
        ? 'https://drive.google.com/drive/folders/' + carpetaId
        : 'https://drive.google.com/drive/folders/' + carpetaCtrl,
      carpetaControlId: carpetaCtrl || null,
    };
  }

  // logo: preferir logos_json (ids confiables); si no, sacar el id de logo_url con regex.
  let todos = [];
  if (prop.logos_json) {
    try {
      const parsed = JSON.parse(prop.logos_json);
      if (Array.isArray(parsed)) {
        todos = parsed
          .map((l) => ({ id: l.id || l.fileId || extraerIdDrive(l.url || ''), nombre: l.nombre || l.name || 'logo' }))
          .filter((l) => l.id);
      }
    } catch (_) { /* json malformado: se ignora */ }
  }
  if (!todos.length && prop.logo_url) {
    const id = extraerIdDrive(prop.logo_url);
    if (id) todos = [{ id, nombre: 'logo' }];
  }
  if (todos.length) {
    out.logo = { url: 'https://drive.google.com/uc?export=download&id=' + todos[0].id, todos };
  }

  // negocio: paquete con nombre legible (mapear clave->nombre) + entregables (texto libre).
  let paquete = prop.paquete || '';
  if (paquete) {
    const pk = await queryOne(db, 'SELECT nombre FROM paquetes WHERE clave = ?', [paquete]);
    if (pk && pk.nombre) paquete = pk.nombre;
  }
  if (paquete || prop.entregables) {
    out.negocio = { paquete: paquete || '', entregablesTexto: prop.entregables || '' };
  }
  return out;
}

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
    const negocio = await datosNegocio(db, token);
    const base = { token, folio: contrato.folio || '', nombreCliente: contrato.nombre_cliente || '', ...negocio };
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
        await archivar(db, token, cuartos, 1, body.autor);
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
      await archivar(db, token, cuartos, baseRev + 1, body.autor);
      return ok({ ok: true, rev: baseRev + 1 });
    }
    // Conflicto (otra escritura gano, o el cliente no mando baseRev): devolver el estado vigente.
    const fila = await queryOne(db, 'SELECT cuartos_json, rev FROM checklist WHERE contrato_token = ?', [token]);
    const parsed = migrarFormato(JSON.parse(fila.cuartos_json));
    return ok({ conflict: true, ...parsed, rev: fila.rev || 0 });
  }

  return err('Acción no encontrada', 404);
}
