import { query } from './db.js';

export async function syncToSheets(env) {
  if (!env.APPS_SCRIPT_URL || env.APPS_SCRIPT_URL.includes('REEMPLAZAR')) return;

  const db = env.DB;
  try {
	    const [contratos, abonos, propiedades, paquetes, clientes, trabajos, actividades] = await Promise.all([
	      query(db, 'SELECT * FROM contratos ORDER BY fecha_creacion DESC'),
	      query(db, 'SELECT * FROM abonos ORDER BY fecha_registro DESC'),
	      query(db, 'SELECT * FROM propiedades ORDER BY contrato_token, num_propiedad'),
	      query(db, 'SELECT * FROM paquetes ORDER BY orden'),
	      query(db, 'SELECT * FROM clientes ORDER BY fecha_creacion DESC'),
	      query(db, 'SELECT * FROM trabajos ORDER BY fecha_creacion DESC'),
	      query(db, 'SELECT * FROM actividades ORDER BY fecha_creacion DESC')
	    ]);

    if (!contratos.results) throw new Error('D1 query falló para contratos');

    const res = await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'syncBackup',
        data: {
          contratos: contratos.results,
          abonos: abonos.results,
          propiedades: propiedades.results,
          paquetes: paquetes.results,
          clientes: clientes.results,
	          trabajos: trabajos.results,
	          actividades: actividades.results
	        }
	      })
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.error || body?.ok === false) {
      console.error('syncToSheets: adapter respondió', body?.error || body?.message || ('HTTP ' + res.status));
    }
  } catch (e) {
    console.error('syncToSheets error:', e.message);
  }
}

// F64 — respaldo periodico de cada checklist a R2 (fuera de D1). Escribe un objeto con
// marca de tiempo y sobreescribe latest.json por contrato. No rompe el cron si falla.
export async function backupChecklistToR2(env) {
  if (!env.CHECKLIST_BACKUP) return;
  try {
    const rows = await query(env.DB, 'SELECT contrato_token, cuartos_json, rev, fecha_actualizacion FROM checklist');
    const fecha = new Date().toISOString();
    for (const row of (rows.results || [])) {
      const body = JSON.stringify({
        token: row.contrato_token,
        rev: row.rev,
        fecha_actualizacion: row.fecha_actualizacion,
        cuartos_json: row.cuartos_json,
      });
      const base = 'checklist/' + row.contrato_token;
      await env.CHECKLIST_BACKUP.put(base + '/' + fecha + '.json', body);
      await env.CHECKLIST_BACKUP.put(base + '/latest.json', body);
    }
  } catch (e) {
    console.error('backupChecklistToR2 error:', e.message);
  }
}
