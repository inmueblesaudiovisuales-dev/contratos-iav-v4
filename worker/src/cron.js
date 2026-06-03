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
    if (!res.ok) console.error('syncToSheets: adapter respondió', res.status);
  } catch (e) {
    console.error('syncToSheets error:', e.message);
  }
}
