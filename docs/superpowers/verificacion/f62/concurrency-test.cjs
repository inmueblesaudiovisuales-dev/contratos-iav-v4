const logic = require('/Users/brunogutierrez/contratos-iav-v4/frontend/checklist-logic.js');
const BASE = 'https://contratos-iav-v4-preview.inmueblesaudiovisuales.workers.dev/api';
const TOKEN = 'test-f62-concurrencia';

function st(over) {
  return Object.assign({
    version: 3, mediaFiles: [], espacios: [], pisos: [], cameras: [],
    sequenceSegments: [], droneItems: [], asesorPuntos: [], guide: {}, servicios: { foto: true, video: true, t360: true, drone: true, asesor: true },
  }, over);
}
async function get() {
  const r = await fetch(`${BASE}/obtenerChecklist?token=${TOKEN}`);
  return r.json();
}
async function save(state, baseRev) {
  const r = await fetch(`${BASE}/guardarChecklist`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, cuartos: state, columnas: state.servicios, baseRev }),
  });
  return r.json();
}

(async () => {
  // 0) baseline limpio
  let g = await get();
  await save(st({}), g.rev);
  g = await get();
  const R0 = g.rev;
  console.log('baseline rev =', R0);

  // 1) A y B cargan el MISMO estado (rev R0) — copia vieja sin tomas
  const tomas = Array.from({ length: 104 }, (_, i) => ({ id: 'm' + i, kind: 'take', fileToken: 'PIB' + i, updatedAt: '2026-06-06T19:12:00Z' }));
  const A = st({ mediaFiles: tomas, espacios: [{ id: 'e1', nombre: 'Cocina', estados: {} }] });
  const B = st({ mediaFiles: [], espacios: [{ id: 'e1', nombre: 'Cocina', estados: { foto: { estado: 'hecho', autor: 'fernanda', updatedAt: '2026-06-06T19:20:00Z' } } }] });

  // 2) A guarda primero (sus tomas)
  const rA = await save(A, R0);
  console.log('A guarda tomas ->', JSON.stringify({ ok: rA.ok, rev: rA.rev, conflict: rA.conflict }));

  // 3) B guarda con baseRev VIEJO (R0) — antes esto borraba las tomas
  const rB = await save(B, R0);
  console.log('B guarda cobertura con baseRev viejo ->', JSON.stringify({ ok: rB.ok, conflict: rB.conflict, rev: rB.rev, tomasEnRespuesta: (rB.cuartos && rB.cuartos.mediaFiles || []).length }));

  // 4) el cliente B fusiona el estado del servidor con el suyo y reintenta
  if (rB.conflict) {
    const servidor = logic.normalizeChecklistData(rB.cuartos);
    const merged = logic.mergeChecklist(B, servidor);
    const rB2 = await save(merged, rB.rev);
    console.log('B reintenta tras fusion ->', JSON.stringify({ ok: rB2.ok, rev: rB2.rev }));
  }

  // 5) estado final
  const fin = await get();
  const mf = (fin.cuartos.mediaFiles || []).length;
  const cob = ((fin.cuartos.espacios.find((e) => e.id === 'e1') || {}).estados || {}).foto;
  console.log('--- FINAL ---');
  console.log('mediaFiles =', mf, '(esperado 104)');
  console.log('cobertura foto =', cob && cob.estado, '(esperado hecho)');
  const passB = !rB.ok && rB.conflict === true; // B NO debe pisar; debe ser conflicto
  const passFinal = mf === 104 && cob && cob.estado === 'hecho';
  console.log(passB && passFinal ? 'RESULTADO: PASA — el candado evito el borrado y todo sobrevivio' : 'RESULTADO: FALLA');
})();
