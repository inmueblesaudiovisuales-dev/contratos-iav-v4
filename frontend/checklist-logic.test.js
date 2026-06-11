const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('./checklist-logic.js');

test('migrates legacy checklist format to version 3 with active services and drone as a per-space service', () => {
  const migrated = logic.normalizeChecklistData({
    cuartos: [
      { nombre: 'Sala', foto: 'Ana', video: 'Bruno', t360: false },
      { nombre: 'Cocina', foto: false, video: false, t360: 'Luis' },
    ],
    columnas: { foto: true, video: true, t360: false },
  });

  assert.equal(migrated.version, 3);
  assert.deepEqual(migrated.servicios, { foto: true, t360: false, video: true, drone: true });
  assert.equal(migrated.espacios.length, 2);
  assert.equal(migrated.espacios[0].estados.foto.estado, 'hecho');
  assert.equal(migrated.espacios[0].estados.video.estado, 'hecho');
  assert.equal(migrated.espacios[1].estados.t360.estado, 'hecho');
  // El drone ya no es entidad propia: comparte los espacios y aparece como estado por espacio.
  assert.equal(migrated.servicios.drone, true);
  assert.equal(migrated.espacios[0].estados.drone.estado, 'pendiente');
  assert.deepEqual(migrated.droneItems, []);
  assert.deepEqual(migrated.bitacora, []);
});

test('parses pasted spaces with indentation and parent arrow syntax', () => {
  const parsed = logic.parseSpacesText(`Sala
Recamara principal
  Bano principal
  Closet
Recamara 2 > Bano
Terraza`);

  assert.deepEqual(parsed.map((item) => item.nombre), [
    'Sala',
    'Recamara principal',
    'Bano principal',
    'Closet',
    'Recamara 2',
    'Bano',
    'Terraza',
  ]);
  const recamara = parsed.find((item) => item.nombre === 'Recamara principal');
  const banoPrincipal = parsed.find((item) => item.nombre === 'Bano principal');
  const recamara2 = parsed.find((item) => item.nombre === 'Recamara 2');
  const bano2 = parsed.find((item) => item.nombre === 'Bano');
  assert.equal(banoPrincipal.parentId, recamara.id);
  assert.equal(bano2.parentId, recamara2.id);
});

test('registers video and drone captures with independent sequence numbers', () => {
  // El drone usa los mismos espacios que el video; su estado vive en espacio.estados.drone.
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala\nCocina\nFachada');
  const salaId = state.espacios.find((item) => item.nombre === 'Sala').id;
  const cocinaId = state.espacios.find((item) => item.nombre === 'Cocina').id;
  const fachadaId = state.espacios.find((item) => item.nombre === 'Fachada').id;

  state = logic.registerCapture(state, { tipo: 'video', targetId: salaId, autor: 'Bruno', now: new Date('2026-06-03T17:00:00Z') });
  state = logic.registerCapture(state, { tipo: 'video', targetId: cocinaId, autor: 'Bruno', now: new Date('2026-06-03T17:01:00Z') });
  state = logic.registerCapture(state, { tipo: 'drone', targetId: fachadaId, autor: 'Bruno', now: new Date('2026-06-03T17:02:00Z') });

  assert.equal(state.bitacora[0].orden, 1);
  assert.equal(state.bitacora[1].orden, 2);
  assert.equal(state.bitacora[2].orden, 1);
  assert.equal(state.espacios.find((item) => item.id === cocinaId).estados.video.ultimoOrden, 2);
  assert.equal(state.espacios.find((item) => item.id === fachadaId).estados.drone.estado, 'hecho');
  assert.equal(state.espacios.find((item) => item.id === fachadaId).estados.drone.ultimoOrden, 1);
});

test('disabled services are excluded from pending summary without deleting history', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.registerCapture(state, { tipo: 't360', targetId: salaId, autor: 'Luis', now: new Date('2026-06-03T17:00:00Z') });
  state = logic.setServiceActive(state, 't360', false);

  const summary = logic.getPendingSummary(state);
  assert.equal(summary.byService.t360, undefined);
  assert.equal(state.bitacora.length, 1);
  assert.equal(state.bitacora[0].tipo, 't360');
});

test('undo removes the last capture and restores the target state when no previous capture exists', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.registerCapture(state, { tipo: 'foto', targetId: salaId, autor: 'Ana', now: new Date('2026-06-03T17:00:00Z') });
  state = logic.undoLastLog(state);

  assert.equal(state.bitacora.length, 0);
  assert.equal(state.espacios[0].estados.foto.estado, 'pendiente');
});

test('applies amenidades template as first-class amenidades zone with key spaces', () => {
  let state = logic.createDefaultState();
  state = logic.applyTemplate(state, 'amenidades', { mode: 'replace' });

  assert.equal(state.espacios.length > 8, true);
  assert.equal(state.espacios.every((space) => space.zona === 'amenidades'), true);
  assert.equal(state.espacios.some((space) => space.nombre === 'Alberca' && space.clave), true);
  assert.equal(state.espacios.some((space) => space.nombre === 'Gimnasio'), true);
});

test('applies departamento template with interior and amenidades zones', () => {
  let state = logic.createDefaultState();
  state = logic.applyTemplate(state, 'departamento', { mode: 'replace' });

  assert.equal(state.espacios.some((space) => space.zona === 'interior' && space.nombre === 'Sala'), true);
  assert.equal(state.espacios.some((space) => space.zona === 'amenidades' && space.nombre === 'Alberca'), true);
});

// ─── F2: drone comparte espacios (eliminar droneItems como entidad) ───────────

// F38 — REEMPLAZA al test F35 que asumia multiples targets de escala navegables.
// El modelo cambio a SESION UNICA: targetsForMode('drone') devuelve UN SOLO target
// de sesion (drone-session) cuyas sugerencias son la lista ordenada completa. Las
// tomas se registran contra ese unico target. (Los kind:'drone' viejos solo se
// anexan por compat; aqui no hay ninguno.)
test('F38: targetsForMode drone devuelve UN SOLO target de sesion (no multiples escalas)', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala\nAlberca', { zona: 'exterior' });
  const targets = logic.targetsForMode(state, 'drone');
  // Un solo target de sesion (no hay kind:'drone' viejos en este estado).
  assert.equal(targets.length, 1, 'un unico target de sesion de drone');
  assert.equal(targets[0].id, 'drone-session', 'es el target de sesion');
  assert.equal(targets[0].kind, 'drone', 'el target de sesion es kind:drone');
  // El take de drone se registra contra el target unico de sesion.
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_0245' });
  state = logic.registerMediaFile(state, { cameraId: 'drone-dji', targetId: 'drone-session', kind: 'take' });
  const file = state.mediaFiles[state.mediaFiles.length - 1];
  assert.equal(file.targetId, 'drone-session', 'el target del drone es la sesion unica');
  assert.equal(file.scene, 'Sesión de drone');
  assert.deepEqual(state.droneItems, [], 'ya no hay droneItems como entidad');
});

test('F2: blankEstados incluye el servicio drone', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala');
  assert.ok(state.espacios[0].estados.drone, 'el espacio nuevo trae estado drone');
  assert.equal(state.espacios[0].estados.drone.estado, 'pendiente');
});

// F38 — REEMPLAZA al test F35 que resolvia getScenePath de un target de escala
// derivado (drone-feat-X). El modelo cambio a sesion unica: el unico target de drone
// es la sesion (drone-session) y getScenePath resuelve su nombre. Los features
// derivados (Alberca aérea…) ahora son SUGERENCIAS de la sesion, no targets.
test('F38: getScenePath del drone resuelve el nombre del target de sesion', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Alberca', { zona: 'exterior' });
  const path = logic.getScenePath(state, 'drone-session', 'drone');
  assert.equal(path, 'Sesión de drone');
});

test('F2: migración droneItems->espacios preserva mediaFiles', () => {
  const viejo = {
    version: 3,
    espacios: [],
    droneItems: [{ id: 'd1', nombre: 'Fachada aerea', estado: 'hecho' }],
    mediaFiles: [{ id: 'm1', cameraId: 'drone-dji', targetId: 'd1', kind: 'take', fileToken: 'DJI0001' }],
    cameras: [],
    sequenceSegments: [],
  };
  const s = logic.normalizeChecklistData(viejo);
  const m = s.mediaFiles.find((x) => x.id === 'm1');
  assert.ok(m, 'el mediaFile sobrevive');
  const esp = s.espacios.find((e) => e.id === m.targetId);
  assert.ok(esp, 'el target ahora es un espacio');
  assert.equal(esp.piso, 'Exterior');
  assert.equal(esp.zona, 'exterior');
  assert.equal(esp.nombre, 'Fachada aerea');
  assert.deepEqual(s.droneItems, [], 'droneItems queda vacio tras migrar');
});

test('F2: migración preserva consecutivo, good y favorite del mediaFile', () => {
  const viejo = {
    version: 3,
    espacios: [],
    droneItems: [{ id: 'd1', nombre: 'Orbita', estado: 'hecho' }],
    mediaFiles: [{
      id: 'm1', cameraId: 'drone-dji', targetId: 'd1', kind: 'take',
      fileToken: 'DJI0007', fileCounter: 7, good: true, favorite: true, note: 'epica',
    }],
    cameras: [{ id: 'drone-dji', label: 'Drone DJI', mode: 'drone', kind: 'dji' }],
    sequenceSegments: [],
  };
  const s = logic.normalizeChecklistData(viejo);
  const m = s.mediaFiles.find((x) => x.id === 'm1');
  assert.ok(m, 'el mediaFile sobrevive');
  assert.equal(m.fileToken, 'DJI0007');
  assert.equal(m.fileCounter, 7);
  assert.equal(m.good, true);
  assert.equal(m.favorite, true);
  assert.equal(m.note, 'epica');
  const esp = s.espacios.find((e) => e.id === m.targetId);
  assert.equal(esp.estados.drone.estado, 'hecho', 'el estado drone del espacio se deriva como hecho');
});

test('F2: droneItems no usados por ningun mediaFile se descartan', () => {
  const viejo = {
    version: 3,
    espacios: [],
    droneItems: [
      { id: 'd1', nombre: 'Usado', estado: 'hecho' },
      { id: 'd2', nombre: 'Sin usar', estado: 'pendiente' },
    ],
    mediaFiles: [{ id: 'm1', cameraId: 'drone-dji', targetId: 'd1', kind: 'take', fileToken: 'DJI0001' }],
    cameras: [],
    sequenceSegments: [],
  };
  const s = logic.normalizeChecklistData(viejo);
  assert.equal(s.espacios.length, 1, 'solo el droneItem usado se convierte en espacio');
  assert.equal(s.espacios[0].nombre, 'Usado');
  assert.deepEqual(s.droneItems, []);
});

test('F2: estado nuevo sin droneItems carga sin perder espacios ni archivos', () => {
  const nuevo = {
    version: 3,
    espacios: [{ id: 'e1', nombre: 'Fachada', zona: 'exterior', piso: 'Exterior', estados: {} }],
    mediaFiles: [{ id: 'm1', cameraId: 'drone-dji', targetId: 'e1', kind: 'take', fileToken: 'DJI0001' }],
    cameras: [],
    sequenceSegments: [],
  };
  const s = logic.normalizeChecklistData(nuevo);
  assert.equal(s.espacios.length, 1);
  const m = s.mediaFiles.find((x) => x.id === 'm1');
  assert.ok(m, 'el archivo sobrevive');
  assert.equal(m.targetId, 'e1', 'el target sigue siendo el espacio existente');
  assert.deepEqual(s.droneItems, []);
});

test('does not duplicate foto or 360 captures when already completed', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala');
  const salaId = state.espacios[0].id;

  state = logic.registerCapture(state, { tipo: 'foto', targetId: salaId, autor: 'Ana', now: new Date('2026-06-03T17:00:00Z') });
  const afterSecondFoto = logic.registerCapture(state, { tipo: 'foto', targetId: salaId, autor: 'Ana', now: new Date('2026-06-03T17:01:00Z') });
  assert.equal(afterSecondFoto.bitacora.length, 1);

  state = logic.registerCapture(state, { tipo: 't360', targetId: salaId, autor: 'Luis', now: new Date('2026-06-03T17:02:00Z') });
  const afterSecond360 = logic.registerCapture(state, { tipo: 't360', targetId: salaId, autor: 'Luis', now: new Date('2026-06-03T17:03:00Z') });
  assert.equal(afterSecond360.bitacora.filter((entry) => entry.tipo === 't360').length, 1);
});

test('requires explicit intention to add a repeated video take', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala');
  const salaId = state.espacios[0].id;

  state = logic.registerCapture(state, { tipo: 'video', targetId: salaId, autor: 'Bruno', now: new Date('2026-06-03T17:00:00Z') });
  const accidental = logic.registerCapture(state, { tipo: 'video', targetId: salaId, autor: 'Bruno', now: new Date('2026-06-03T17:01:00Z') });
  assert.equal(accidental.bitacora.length, 1);

  const repeated = logic.registerCapture(state, { tipo: 'video', targetId: salaId, autor: 'Bruno', intencion: 'repetida', now: new Date('2026-06-03T17:02:00Z') });
  assert.equal(repeated.bitacora.length, 2);
  assert.equal(repeated.bitacora[1].intencion, 'repetida');
  assert.equal(repeated.bitacora[1].orden, 2);
});

test('pending summary groups active pending items by zone and key priority', () => {
  let state = logic.createDefaultState();
  state = logic.applyTemplate(state, 'departamento', { mode: 'replace' });
  const alberca = state.espacios.find((space) => space.nombre === 'Alberca');

  const summary = logic.getPendingSummary(state);
  assert.equal(summary.byZone.amenidades.video.pending.includes('Alberca'), true);
  assert.equal(summary.keyPending.some((item) => item.nombre === alberca.nombre && item.service === 'video'), true);
});

test('initializes independent Sony and DJI sequences from real filenames', () => {
  let state = logic.createDefaultState();

  state = logic.initializeCameraSequence(state, {
    cameraId: 'sony-main',
    lastFilename: '20260520_PIB2818.MP4',
  });
  state = logic.initializeCameraSequence(state, {
    cameraId: 'drone-dji',
    lastFilename: 'DJI_20260517111742_0245_D.MP4',
  });

  assert.equal(logic.getCameraSequence(state, 'sony-main').nextToken, 'PIB2819');
  assert.equal(logic.getCameraSequence(state, 'drone-dji').nextToken, '0246');
  assert.equal(logic.getCameraSequence(state, 'sony-main').segment.counterWidth, 4);
  assert.equal(logic.getCameraSequence(state, 'drone-dji').segment.counterWidth, 4);
});

test('registers every video file and keeps good selection manual', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });

  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: salaId, kind: 'take', autor: 'Bruno' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: salaId, kind: 'take', autor: 'Bruno' });

  assert.deepEqual(state.mediaFiles.map((file) => file.fileToken), ['PIB2819', 'PIB2820']);
  assert.deepEqual(state.mediaFiles.map((file) => file.shotNumber), [1, 2]);
  assert.equal(state.mediaFiles.every((file) => file.good === false), true);
  assert.equal(state.espacios[0].estados.video.estado, 'hecho');

  state = logic.toggleMediaGood(state, state.mediaFiles[1].id);
  assert.equal(state.mediaFiles[1].good, true);
});

test('toggleMediaFavorite marca favorite y fuerza good', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: salaId, kind: 'take' });
  const id = state.mediaFiles[state.mediaFiles.length - 1].id;

  state = logic.toggleMediaFavorite(state, id);
  const f = state.mediaFiles.find((m) => m.id === id);
  assert.equal(f.favorite, true);
  assert.equal(f.good, true); // favorita implica buena

  state = logic.toggleMediaFavorite(state, id);
  const f2 = state.mediaFiles.find((m) => m.id === id);
  assert.equal(f2.favorite, false);
  assert.equal(f2.good, true); // al desmarcar favorite NO quita good
});

test('buildExport incluye favorita y usa version 2', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: salaId, kind: 'take' });
  const id = state.mediaFiles[state.mediaFiles.length - 1].id;
  state = logic.toggleMediaFavorite(state, id);

  const out = logic.buildExport(state, { folio: 'F1', nombreCliente: 'X' });
  assert.equal(out.version, 2);
  const archivo = out.archivos.find((a) => a.favorita === true);
  assert.ok(archivo, 'el export incluye un archivo favorito');
  assert.equal(archivo.premiere.Favorite, true);
});

test('registers discards and keeps camera counters independent', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala\nFachada');
  const salaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_20260517111742_0245_D' });

  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: salaId, kind: 'discard', discardReason: 'empty' });
  // F38 — el drone registra contra el target unico de sesion (drone-session).
  state = logic.registerMediaFile(state, { cameraId: 'drone-dji', targetId: 'drone-session', kind: 'take' });

  assert.equal(state.mediaFiles[0].fileToken, 'PIB2819');
  assert.equal(state.mediaFiles[0].good, false);
  assert.equal(state.mediaFiles[0].discardReason, 'empty');
  assert.equal(state.mediaFiles[1].fileToken, '0246');
  assert.equal(logic.getCameraSequence(state, 'sony-main').nextToken, 'PIB2820');
  assert.equal(logic.getCameraSequence(state, 'drone-dji').nextToken, '0247');
});

test('inserts an omitted file and renumbers only later files in the same segment', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala\nCocina\nFachada');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_20260517111742_0245_D' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: state.espacios[0].id, kind: 'take' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: state.espacios[1].id, kind: 'take' });
  // F38 — el drone registra contra el target unico de sesion (drone-session).
  state = logic.registerMediaFile(state, { cameraId: 'drone-dji', targetId: 'drone-session', kind: 'take' });

  const cocinaFileId = state.mediaFiles.find((file) => file.targetId === state.espacios[1].id).id;
  state = logic.insertOmittedMediaFile(state, cocinaFileId);

  assert.deepEqual(state.mediaFiles.filter((file) => file.cameraId === 'sony-main').map((file) => file.fileToken), ['PIB2819', 'PIB2820', 'PIB2821']);
  assert.equal(state.mediaFiles.find((file) => file.kind === 'omitted').scene, 'Sin identificar');
  assert.equal(state.mediaFiles.find((file) => file.cameraId === 'drone-dji').fileToken, '0246');
  assert.equal(logic.getCameraSequence(state, 'sony-main').nextToken, 'PIB2822');
});

test('starts a new sequence segment without renumbering previous files', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: state.espacios[0].id, kind: 'take' });
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB4100' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: state.espacios[0].id, kind: 'take' });

  assert.deepEqual(state.mediaFiles.map((file) => file.fileToken), ['PIB2819', 'PIB4101']);
  assert.equal(new Set(state.mediaFiles.map((file) => file.segmentId)).size, 2);
});

test('assigns an omitted file to a scene without changing its file token', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala\nCocina');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: state.espacios[1].id, kind: 'take' });
  state = logic.insertOmittedMediaFile(state, state.mediaFiles[0].id);
  const omitted = state.mediaFiles[0];

  state = logic.updateMediaFile(state, omitted.id, { targetId: state.espacios[0].id, kind: 'take' });

  assert.equal(state.mediaFiles[0].fileToken, 'PIB2819');
  assert.equal(state.mediaFiles[0].scene, 'Sala');
  assert.equal(state.mediaFiles[0].kind, 'take');
  assert.equal(state.mediaFiles[0].shotNumber, 1);
  assert.equal(state.espacios[0].estados.video.estado, 'hecho');
});

test('converts a take to unrelated discard without consuming another counter', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: state.espacios[0].id, kind: 'take' });

  state = logic.updateMediaFile(state, state.mediaFiles[0].id, { kind: 'discard', discardReason: 'unrelated' });

  assert.equal(state.mediaFiles.length, 1);
  assert.equal(state.mediaFiles[0].fileToken, 'PIB2819');
  assert.equal(state.mediaFiles[0].scene, 'Sin escena');
  assert.equal(state.mediaFiles[0].targetId, null);
  assert.equal(state.espacios[0].estados.video.estado, 'pendiente');
  assert.equal(logic.getCameraSequence(state, 'sony-main').nextToken, 'PIB2820');
});

test('keeps video complete while another video camera still has a take', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.initializeCameraSequence(state, { cameraId: 'osmo-pocket-3', lastFilename: 'DJI_20260517111742_0245_D' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: salaId, kind: 'take' });
  state = logic.registerMediaFile(state, { cameraId: 'osmo-pocket-3', targetId: salaId, kind: 'take' });

  state = logic.updateMediaFile(state, state.mediaFiles[0].id, { kind: 'discard', discardReason: 'failed' });

  assert.equal(state.espacios[0].estados.video.estado, 'hecho');
});

test('renumbers shots for both scenes after moving a take', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala\nCocina');
  const [sala, cocina] = state.espacios;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: sala.id, kind: 'take' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: sala.id, kind: 'take' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: cocina.id, kind: 'take' });

  state = logic.updateMediaFile(state, state.mediaFiles[0].id, { targetId: cocina.id });

  assert.deepEqual(state.mediaFiles.filter((file) => file.targetId === sala.id).map((file) => file.shotNumber), [1]);
  assert.deepEqual(state.mediaFiles.filter((file) => file.targetId === cocina.id).map((file) => file.shotNumber), [1, 2]);
});

test('normalization repairs derived video and drone states from media files', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: state.espacios[0].id, kind: 'take' });
  state.espacios[0].estados.video = { estado: 'pendiente' };

  const normalized = logic.normalizeChecklistData(state);

  assert.equal(normalized.espacios[0].estados.video.estado, 'hecho');
});

test('normalization restores missing default cameras and repairs next counters', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: state.espacios[0].id, kind: 'take' });
  state.cameras = state.cameras.filter((camera) => camera.id === 'sony-main');
  state.sequenceSegments[0].counterNext = 1;

  const normalized = logic.normalizeChecklistData(state);

  assert.equal(normalized.cameras.some((camera) => camera.id === 'osmo-pocket-3'), true);
  assert.equal(normalized.cameras.some((camera) => camera.id === 'drone-dji'), true);
  assert.equal(logic.getCameraSequence(normalized, 'sony-main').nextToken, 'PIB2820');
});

test('removes a mistaken record when no file was created and closes the gap', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala\nCocina');
  const [sala, cocina] = state.espacios;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: sala.id, kind: 'take' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: sala.id, kind: 'take' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: cocina.id, kind: 'take' });

  state = logic.removeMediaFile(state, state.mediaFiles[1].id);

  assert.deepEqual(state.mediaFiles.map((file) => file.fileToken), ['PIB2819', 'PIB2820']);
  assert.equal(state.mediaFiles[0].shotNumber, 1);
  assert.equal(state.mediaFiles[1].scene, 'Cocina');
  assert.equal(logic.getCameraSequence(state, 'sony-main').nextToken, 'PIB2821');
});

test('normalization preserves video no aplica while repairing media states', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala\nBodega');
  state.espacios[1].estados.video = { estado: 'no_aplica' };
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: state.espacios[0].id, kind: 'take' });

  const normalized = logic.normalizeChecklistData(state);

  assert.equal(normalized.espacios[1].estados.video.estado, 'no_aplica');
});

test('builds the complete scene path for deeply nested spaces', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Recamara principal > Vestidor > Closet');
  const closet = state.espacios.find((space) => space.nombre === 'Closet');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });

  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: closet.id, kind: 'take' });

  assert.equal(state.mediaFiles[0].scenePath, 'Recamara principal > Vestidor > Closet');
});

test('finds every nested descendant before deleting a space', () => {
  const state = logic.addSpacesFromText(logic.createDefaultState(), 'Recamara principal > Vestidor > Closet');
  const root = state.espacios.find((space) => space.nombre === 'Recamara principal');
  const descendants = logic.getDescendantIds(state, root.id);

  assert.deepEqual(new Set(descendants), new Set(state.espacios.map((space) => space.id)));
});

test('separates video and drone scenes for review', () => {
  // F35 — video y drone ya no comparten espacio: el drone tiene targets virtuales.
  // getMediaSceneGroups las separa por modo igual.
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Amenidades');
  const target = state.espacios[0];
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_20260517111742_0245_D' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: target.id, kind: 'take' });
  // F38 — el drone registra contra el target unico de sesion (drone-session).
  state = logic.registerMediaFile(state, { cameraId: 'drone-dji', targetId: 'drone-session', kind: 'take' });
  state = logic.toggleMediaGood(state, state.mediaFiles[0].id);

  const groups = logic.getMediaSceneGroups(state);

  assert.equal(groups.length, 2);
  assert.equal(groups.find((group) => group.mode === 'video').hasGood, true);
  assert.equal(groups.find((group) => group.mode === 'drone').hasGood, false);
});

test('normalization preserves an orphaned file as unidentified instead of a false take', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: state.espacios[0].id, kind: 'take' });
  state.espacios = [];

  const normalized = logic.normalizeChecklistData(state);

  assert.equal(normalized.mediaFiles[0].kind, 'omitted');
  assert.equal(normalized.mediaFiles[0].targetId, null);
  assert.equal(normalized.mediaFiles[0].scenePath, 'Sin identificar');
  assert.equal(normalized.mediaFiles[0].good, false);
});

test('normalization preserves a file from an unknown camera as unidentified', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: state.espacios[0].id, kind: 'take' });
  state.mediaFiles[0].cameraId = 'camera-missing';

  const normalized = logic.normalizeChecklistData(state);

  assert.equal(normalized.mediaFiles[0].kind, 'omitted');
  assert.equal(normalized.mediaFiles[0].targetId, null);
  assert.equal(normalized.mediaFiles[0].scenePath, 'Sin identificar');
});

test('does not register media files for targets marked no aplica', () => {
  // El drone comparte el espacio; su no_aplica vive en espacio.estados.drone.
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Bodega');
  state.espacios[0].estados.video = { estado: 'no_aplica' };
  state.espacios[0].estados.drone = { estado: 'no_aplica' };
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_20260517111742_0245_D' });

  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: state.espacios[0].id, kind: 'take' });
  state = logic.registerMediaFile(state, { cameraId: 'drone-dji', targetId: state.espacios[0].id, kind: 'take' });

  assert.equal(state.mediaFiles.length, 0);
  assert.equal(logic.getCameraSequence(state, 'sony-main').nextToken, 'PIB2819');
  assert.equal(logic.getCameraSequence(state, 'drone-dji').nextToken, '0246');
});

test('does not register legacy captures for targets marked no aplica', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Bodega');
  state.espacios[0].estados.foto = { estado: 'no_aplica' };
  state.espacios[0].estados.drone = { estado: 'no_aplica' };

  state = logic.registerCapture(state, { tipo: 'foto', targetId: state.espacios[0].id, autor: 'Ana' });
  state = logic.registerCapture(state, { tipo: 'drone', targetId: state.espacios[0].id, autor: 'Bruno' });

  assert.equal(state.bitacora.length, 0);
});

test('default state includes an editable list of pisos', () => {
  // F24: el estado nuevo arranca SIN pisos (el usuario los agrega a mano).
  const state = logic.createDefaultState();
  assert.equal(Array.isArray(state.pisos), true);
  assert.equal(state.pisos.length, 0);
});

test('preserves an explicit piso on a version 2 space', () => {
  const state = logic.normalizeChecklistData({
    version: 2,
    espacios: [{ id: 'a', nombre: 'Sala', piso: 'Piso 2' }],
  });
  assert.equal(state.espacios[0].piso, 'Piso 2');
});

test('derives piso from zona when missing (deterministic)', () => {
  const state = logic.normalizeChecklistData({
    version: 2,
    espacios: [
      { id: 'a', nombre: 'Alberca', zona: 'amenidades' },
      { id: 'b', nombre: 'Fachada', zona: 'exterior' },
      { id: 'c', nombre: 'Cuarto', zona: 'interior' },
    ],
  });
  assert.equal(state.espacios[0].piso, 'Amenidades');
  assert.equal(state.espacios[1].piso, 'Exterior');
  assert.equal(state.espacios[2].piso, 'Piso 1');
});

test('derives the pisos list from existing spaces in order of appearance', () => {
  const state = logic.normalizeChecklistData({
    version: 2,
    espacios: [
      { id: 'a', nombre: 'Fachada', piso: 'Exterior' },
      { id: 'b', nombre: 'Sala', piso: 'Piso 1' },
      { id: 'c', nombre: 'Cocina', piso: 'Piso 1' },
    ],
  });
  assert.deepEqual(state.pisos, ['Exterior', 'Piso 1']);
});

test('legacy migration assigns a piso and a pisos list', () => {
  const state = logic.normalizeChecklistData({
    cuartos: [{ nombre: 'Sala', completado: true }],
    columnas: { foto: true },
  });
  assert.equal(typeof state.espacios[0].piso, 'string');
  assert.equal(state.espacios[0].piso.length > 0, true);
  assert.equal(Array.isArray(state.pisos), true);
});

test('exposes space suggestions per property type including quinta', () => {
  assert.ok(logic.SPACE_SUGGESTIONS, 'SPACE_SUGGESTIONS exported');
  ['casa', 'departamento', 'terreno', 'quinta'].forEach((tipo) => {
    assert.equal(Array.isArray(logic.SPACE_SUGGESTIONS[tipo]), true, tipo + ' suggestions');
    assert.equal(logic.SPACE_SUGGESTIONS[tipo].length > 0, true, tipo + ' not empty');
  });
  assert.equal(logic.SPACE_SUGGESTIONS.quinta.some((row) => /alberca/i.test(row[0])), true);
});

test('quinta template builds spaces with pisos', () => {
  let state = logic.applyTemplate(logic.createDefaultState(), 'quinta', { mode: 'replace' });
  assert.equal(state.espacios.length > 0, true);
  assert.equal(state.espacios.every((space) => typeof space.piso === 'string' && space.piso.length > 0), true);
});

test('default state has asesor cameras and default puntos', () => {
  const s = logic.createDefaultState();
  assert.ok(s.cameras.some((c) => c.id === 'sony-asesor' && c.mode === 'asesor' && c.role === 'video'));
  assert.ok(s.cameras.some((c) => c.id === 'tascam-asesor' && c.mode === 'asesor' && c.kind === 'tascam' && c.role === 'audio'));
  assert.ok(Array.isArray(s.asesorPuntos) && s.asesorPuntos.length >= 2);
});

test('createAsesorPuntos assigns unique stable codes P01, P02, ...', () => {
  const s = logic.createDefaultState();
  const codigos = s.asesorPuntos.map((p) => p.codigo);
  assert.equal(codigos[0], 'P01');
  assert.equal(codigos[1], 'P02');
  assert.equal(new Set(codigos).size, codigos.length, 'todos los codigos son unicos');
});

test('nextAsesorCodigo gives the next unused code after deleting one (no reuse, no renumber)', () => {
  let s = logic.createDefaultState();
  // tres puntos: P01, P02, P03
  s.asesorPuntos = [
    { id: 'a', nombre: 'A', tipo: 'normal', estado: 'pendiente', ordenLista: 1, codigo: 'P01' },
    { id: 'b', nombre: 'B', tipo: 'normal', estado: 'pendiente', ordenLista: 2, codigo: 'P02' },
    { id: 'c', nombre: 'C', tipo: 'normal', estado: 'pendiente', ordenLista: 3, codigo: 'P03' },
  ];
  assert.equal(logic.nextAsesorCodigo(s), 'P04');
  // borro el del medio (P02): el siguiente sigue siendo max+1 = P04, no reusa P02
  s.asesorPuntos = s.asesorPuntos.filter((p) => p.codigo !== 'P02');
  assert.equal(logic.nextAsesorCodigo(s), 'P04');
});

test('parAsesor builds the pairing key codigo_Ttoma', () => {
  assert.equal(logic.parAsesor('P03', 2), 'P03_T2');
});

test('parseFilenameSequence parses tascam token (last digit run, empty prefix)', () => {
  const seq = logic.parseFilenameSequence('20260609_0001', 'tascam');
  assert.equal(seq.counter, 1);
  assert.equal(seq.counterWidth, 4);
  assert.equal(seq.prefixHint, '', 'prefijo vacio: solo digitos antes del contador');
  // el token real se expande desde un segmento; aqui validamos el ancho del padding
  assert.equal(String(seq.counter).padStart(seq.counterWidth, '0'), '0001');
});

test('normalizeChecklistData backfills missing codigo without changing existing ones', () => {
  const data = {
    version: 3,
    asesorPuntos: [
      { id: 'a', nombre: 'A', tipo: 'normal', estado: 'pendiente', ordenLista: 1, codigo: 'P05' },
      { id: 'b', nombre: 'B', tipo: 'normal', estado: 'pendiente', ordenLista: 2 },
      { id: 'c', nombre: 'C', tipo: 'normal', estado: 'pendiente', ordenLista: 3 },
    ],
  };
  const norm = logic.normalizeChecklistData(data);
  const byId = Object.fromEntries(norm.asesorPuntos.map((p) => [p.id, p.codigo]));
  assert.equal(byId.a, 'P05', 'no cambia el codigo existente');
  assert.equal(byId.b, 'P06', 'backfill: siguiente no usado');
  assert.equal(byId.c, 'P07', 'backfill: siguiente no usado');
  assert.equal(new Set(Object.values(byId)).size, 3, 'unicos');
});

test('registerAsesorFile on a normal point creates TWO files (sony-asesor + tascam-asesor) with same par and distinct real tokens', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-asesor', lastFilename: '20260520_PIB2818' });
  s = logic.initializeCameraSequence(s, { cameraId: 'tascam-asesor', lastFilename: '20260609_0001' });
  const punto = s.asesorPuntos[0];
  s = logic.registerAsesorFile(s, { puntoId: punto.id, kind: 'take', autor: 'Bruno' });
  assert.equal(s.mediaFiles.length, 2);
  const sony = s.mediaFiles.find((f) => f.cameraId === 'sony-asesor');
  const tascam = s.mediaFiles.find((f) => f.cameraId === 'tascam-asesor');
  assert.ok(sony && tascam);
  assert.equal(sony.fileToken, 'PIB2819');
  assert.equal(tascam.fileToken, '0002');
  assert.notEqual(sony.fileToken, tascam.fileToken);
  assert.equal(sony.pairId, 'P01_T1');
  assert.equal(tascam.pairId, 'P01_T1');
  assert.equal(sony.pairId, punto.codigo + '_T1');
  assert.equal(sony.audioExterno, undefined);
  assert.equal(tascam.audioExterno, undefined);
  assert.equal(tascam.soloAudio, undefined);
  assert.equal(sony.scene, punto.nombre);
  assert.equal(s.mediaFiles.filter((f) => f.cameraId === 'osmo-asesor').length, 0);
  assert.equal(s.asesorPuntos[0].estado, 'hecho');
  // ambos contadores avanzaron
  assert.equal(logic.getCameraSequence(s, 'sony-asesor').nextToken, 'PIB2820');
  assert.equal(logic.getCameraSequence(s, 'tascam-asesor').nextToken, '0003');
});

test('registerAsesorFile on a voz point creates ONE tascam-asesor solo-audio file with a real token', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'tascam-asesor', lastFilename: '20260609_0001' });
  s.asesorPuntos.push({ id: 'voz1', nombre: 'Voz en off', tipo: 'voz', estado: 'pendiente', ordenLista: 99, codigo: 'P09' });
  s = logic.registerAsesorFile(s, { puntoId: 'voz1', kind: 'take', autor: 'Fer' });
  assert.equal(s.mediaFiles.length, 1);
  const audio = s.mediaFiles[0];
  assert.equal(audio.cameraId, 'tascam-asesor');
  assert.equal(audio.soloAudio, true);
  assert.equal(audio.audioExterno, undefined);
  assert.equal(audio.fileToken, '0002');
  assert.ok(audio.segmentId);
  assert.equal(audio.fileCounter, 2);
  assert.equal(audio.pairId, 'P09_T1');
  assert.equal(s.mediaFiles.filter((f) => f.cameraId === 'sony-asesor').length, 0);
  assert.equal(s.asesorPuntos.find((p) => p.id === 'voz1').estado, 'hecho');
});

test('buildExport produces file records with premiere metadata mapping', () => {
  let s = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  s.espacios[0].piso = 'Piso 1';
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  s = logic.registerMediaFile(s, { cameraId: 'sony-main', targetId: s.espacios[0].id, kind: 'take', autor: 'Bruno' });
  s = logic.toggleMediaGood(s, s.mediaFiles[0].id);
  s = logic.updateMediaFile(s, s.mediaFiles[0].id, { note: 'se trabó' });

  const exp = logic.buildExport(s, { folio: 'IAV-1', nombreCliente: 'Cliente X' });
  assert.equal(exp.folio, 'IAV-1');
  assert.equal(exp.totalArchivos, 1);
  const a = exp.archivos[0];
  assert.equal(a.archivo, 'PIB2819');
  assert.equal(a.consecutivo, 2819);
  assert.equal(a.ancho, 4);
  assert.equal(a.servicio, 'video');
  assert.equal(a.escena, 'Sala');
  assert.equal(a.piso, 'Piso 1');
  assert.equal(a.toma, 1);
  assert.equal(a.buena, true);
  assert.equal(a.premiere.Scene, 'Sala');
  assert.equal(a.premiere.Shot, '1');
  assert.equal(a.premiere['Camera Roll'], 'Sony principal');
  assert.equal(a.premiere.Good, true);
  assert.equal(a.premiere.Comment, 'se trabó');
  assert.equal(a.premiere.Description, 'video · toma buena');
});

test('buildExport of a normal asesor point emits Sony and Tascam records with same par and real tokens, no audioExterno/audioSugerido', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-asesor', lastFilename: '20260520_PIB4810' });
  s = logic.initializeCameraSequence(s, { cameraId: 'tascam-asesor', lastFilename: '20260609_0001' });
  const punto = s.asesorPuntos[0];
  s = logic.registerAsesorFile(s, { puntoId: punto.id, kind: 'take', autor: 'Fer' });
  const exp = logic.buildExport(s, {});
  assert.equal(exp.archivos.length, 2);
  const sony = exp.archivos.find((a) => a.camaraId === 'sony-asesor');
  const tascam = exp.archivos.find((a) => a.camaraId === 'tascam-asesor');
  assert.ok(sony && tascam);
  // Sony
  assert.equal(sony.servicio, 'asesor');
  assert.equal(sony.camaraTipo, 'sony');
  assert.equal(sony.puntoId, punto.id);
  assert.equal(sony.par, punto.codigo + '_T1');
  assert.equal(sony.archivo, 'PIB4811');
  assert.equal(sony.audioExterno, undefined);
  assert.equal(sony.audioSugerido, undefined);
  // Tascam — camara con token real
  assert.equal(tascam.servicio, 'asesor');
  assert.equal(tascam.camaraTipo, 'tascam');
  assert.equal(tascam.puntoId, punto.id);
  assert.equal(tascam.par, punto.codigo + '_T1');
  assert.equal(tascam.archivo, '0002');
  assert.equal(tascam.consecutivo, 2);
  assert.equal(tascam.ancho, 4);
  assert.equal(tascam.audioExterno, undefined);
  assert.equal(tascam.audioSugerido, undefined);
  assert.equal(tascam.soloAudio, undefined);
  // mismo par
  assert.equal(sony.par, tascam.par);
});

test('buildExport of a voz en off record is a Tascam record with real token, soloAudio:true, no audioExterno/audioSugerido', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'tascam-asesor', lastFilename: '20260609_0001' });
  s.asesorPuntos.push({ id: 'voz1', nombre: 'Voz en off', tipo: 'voz', estado: 'pendiente', ordenLista: 99, codigo: 'P09' });
  s = logic.registerAsesorFile(s, { puntoId: 'voz1', kind: 'take', autor: 'Fer' });
  const exp = logic.buildExport(s, {});
  assert.equal(exp.archivos.length, 1);
  const a = exp.archivos[0];
  assert.equal(a.servicio, 'asesor');
  assert.equal(a.soloAudio, true);
  assert.equal(a.camaraId, 'tascam-asesor');
  assert.equal(a.camaraTipo, 'tascam');
  assert.equal(a.archivo, '0002');
  assert.equal(a.consecutivo, 2);
  assert.equal(a.par, 'P09_T1');
  assert.equal(a.audioExterno, undefined);
  assert.equal(a.audioSugerido, undefined);
});

test('asesor normal point keeps advancing both sony-asesor and tascam-asesor consecutives across takes', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-asesor', lastFilename: '20260520_PIB2818' });
  s = logic.initializeCameraSequence(s, { cameraId: 'tascam-asesor', lastFilename: '20260609_0001' });
  const punto = s.asesorPuntos[0];
  s = logic.registerAsesorFile(s, { puntoId: punto.id, kind: 'take' });
  s = logic.registerAsesorFile(s, { puntoId: punto.id, kind: 'take' });
  assert.equal(logic.getCameraSequence(s, 'sony-asesor').nextToken, 'PIB2821');
  assert.equal(logic.getCameraSequence(s, 'tascam-asesor').nextToken, '0004');
  assert.equal(s.mediaFiles.filter((f) => f.cameraId === 'sony-asesor').length, 2);
  assert.equal(s.mediaFiles.filter((f) => f.cameraId === 'tascam-asesor').length, 2);
  const sony2 = s.mediaFiles.filter((f) => f.cameraId === 'sony-asesor')[1];
  assert.equal(sony2.pairId, punto.codigo + '_T2');
});

test('buildExport stays version 2 with asesor and video records present', () => {
  let s = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  s = logic.registerMediaFile(s, { cameraId: 'sony-main', targetId: s.espacios[0].id, kind: 'take' });
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-asesor', lastFilename: '20260520_PIB4810' });
  s = logic.initializeCameraSequence(s, { cameraId: 'tascam-asesor', lastFilename: '20260609_0001' });
  s = logic.registerAsesorFile(s, { puntoId: s.asesorPuntos[0].id, kind: 'take' });
  const exp = logic.buildExport(s, {});
  assert.equal(exp.version, 2);
  const video = exp.archivos.find((a) => a.servicio === 'video');
  assert.equal(video.archivo, 'PIB2819');
  assert.equal(video.servicio, 'video');
  assert.equal(video.soloAudio, undefined, 'el registro de video no cambia de forma');
  assert.equal(video.puntoId, undefined);
  assert.equal(video.par, null, 'video normal no tiene par de asesor');
});

// ─── F1: biblioteca de datos ──────────────────────────────────────────────────

const REQUIRED_SHOT_FIELDS = ['id', 'nombre', 'shotType', 'movement', 'enfoque', 'priority'];

function collectAllShots() {
  const shots = [];
  const gl = logic.getGuideLibrary();
  Object.values(gl).forEach((cat) => cat.shots.forEach((s) => shots.push(s)));
  const dg = logic.DRONE_GUIDE;
  Object.values(dg).forEach((tipo) => tipo.shots.forEach((s) => shots.push(s)));
  const ag = logic.AMENITY_GUIDE;
  Object.values(ag).forEach((am) => am.shots.forEach((s) => shots.push(s)));
  return shots;
}

test('F1: SHOT_TYPES tiene todos los campos requeridos', () => {
  const st = logic.getShotTypes();
  assert.ok(typeof st === 'object' && st !== null);
  ['wide', 'general', 'medio', 'detalle', 'transicion', 'pov', 'contrapicado',
   'ventana', 'reveal', 'simetrica', 'textura', 'exterior'].forEach((k) => {
    assert.ok(k in st, 'falta shotType: ' + k);
    assert.ok(typeof st[k].label === 'string' && st[k].label.length > 0, 'label vacio en shotType: ' + k);
  });
});

test('R106: cada SHOT_TYPES tiene campo ejemplo no vacio', () => {
  const st = logic.getShotTypes();
  Object.entries(st).forEach(([k, v]) => {
    assert.ok(typeof v.ejemplo === 'string' && v.ejemplo.length > 0, 'ejemplo vacio en shotType: ' + k);
  });
});

test('F1: MOVEMENTS tiene todos los campos requeridos', () => {
  const mv = logic.getMovements();
  assert.ok(typeof mv === 'object' && mv !== null);
  ['static', 'pan', 'tilt', 'dolly', 'push_in', 'pull_out', 'gimbal_walk',
   'orbit', 'umbral', 'parallax', 'tilt_up', 'slider', 'tracking', 'pedestal', 'whip'].forEach((k) => {
    assert.ok(k in mv, 'falta movement: ' + k);
    assert.ok(typeof mv[k].label === 'string' && mv[k].label.length > 0, 'label vacio en movement: ' + k);
  });
});

test('F1: getGuideLibrary devuelve el mismo objeto que GUIDE_LIBRARY', () => {
  assert.strictEqual(logic.getGuideLibrary(), logic.GUIDE_LIBRARY);
});

test('F1: getShotTypes y getMovements devuelven SHOT_TYPES y MOVEMENTS', () => {
  assert.strictEqual(logic.getShotTypes(), logic.SHOT_TYPES);
  assert.strictEqual(logic.getMovements(), logic.MOVEMENTS);
});

test('F1: cada shot tiene los 6 campos requeridos', () => {
  const shots = collectAllShots();
  assert.ok(shots.length > 0, 'no se encontraron shots');
  shots.forEach((shot) => {
    REQUIRED_SHOT_FIELDS.forEach((field) => {
      assert.ok(field in shot, 'falta campo "' + field + '" en shot id=' + shot.id);
      assert.ok(shot[field] !== undefined && shot[field] !== null && shot[field] !== '',
        'campo vacio "' + field + '" en shot id=' + shot.id);
    });
  });
});

test('F1: todos los ids de shots son unicos', () => {
  const shots = collectAllShots();
  const ids = shots.map((s) => s.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, 'ids duplicados: ' + ids.filter((id, i) => ids.indexOf(id) !== i).join(', '));
});

test('F1: shotType de cada shot existe en SHOT_TYPES', () => {
  const shots = collectAllShots();
  const st = logic.getShotTypes();
  shots.forEach((shot) => {
    assert.ok(shot.shotType in st, 'shotType desconocido "' + shot.shotType + '" en id=' + shot.id);
  });
});

test('F1: movement de cada shot existe en MOVEMENTS', () => {
  const shots = collectAllShots();
  const mv = logic.getMovements();
  shots.forEach((shot) => {
    assert.ok(shot.movement in mv, 'movement desconocido "' + shot.movement + '" en id=' + shot.id);
  });
});

test('F1: priority de cada shot es must o nice', () => {
  const shots = collectAllShots();
  shots.forEach((shot) => {
    assert.ok(shot.priority === 'must' || shot.priority === 'nice',
      'priority invalido "' + shot.priority + '" en id=' + shot.id);
  });
});

test('F1: GUIDE_LIBRARY tiene todas las categorias requeridas', () => {
  const gl = logic.GUIDE_LIBRARY;
  ['entrada', 'sala', 'comedor', 'cocina', 'recamara', 'recamara_sec', 'bano',
   'medio_bano', 'vestidor', 'estudio', 'lavado', 'pasillo', 'family',
   'terraza', 'garaje', 'bodega', 'generico'].forEach((cat) => {
    assert.ok(cat in gl, 'falta categoria: ' + cat);
    assert.ok(Array.isArray(gl[cat].shots) && gl[cat].shots.length > 0, 'shots vacio en categoria: ' + cat);
  });
});

test('F1: DRONE_GUIDE tiene todos los tipos de propiedad requeridos', () => {
  const dg = logic.DRONE_GUIDE;
  ['casa', 'lujo', 'departamento', 'waterfront', 'terreno', 'quinta', 'comercial'].forEach((tipo) => {
    assert.ok(tipo in dg, 'falta tipo en DRONE_GUIDE: ' + tipo);
    assert.ok(Array.isArray(dg[tipo].shots) && dg[tipo].shots.length > 0, 'shots vacio en drone tipo: ' + tipo);
  });
});

test('F1: AMENITY_GUIDE tiene todas las amenidades requeridas', () => {
  const ag = logic.AMENITY_GUIDE;
  ['alberca', 'jacuzzi', 'gimnasio', 'salon_eventos', 'lobby', 'roof_garden',
   'jardin', 'asadores', 'cancha', 'area_infantil', 'business_center', 'spa',
   'estacionamiento', 'elevadores', 'palapa', 'area_mascotas'].forEach((am) => {
    assert.ok(am in ag, 'falta amenidad: ' + am);
    assert.ok(Array.isArray(ag[am].shots) && ag[am].shots.length > 0, 'shots vacio en amenidad: ' + am);
  });
});

test('F1: ROOM_CATEGORIES es un array con todos los ids requeridos', () => {
  const rc = logic.ROOM_CATEGORIES;
  assert.ok(Array.isArray(rc) && rc.length > 0);
  ['bano', 'medio_bano', 'lavado', 'bodega', 'vestidor', 'cocina', 'comedor',
   'sala', 'family', 'estudio', 'recamara', 'garaje', 'pasillo', 'entrada',
   'terraza', 'exterior'].forEach((id) => {
    assert.ok(rc.some((c) => c.id === id), 'falta id en ROOM_CATEGORIES: ' + id);
  });
  rc.forEach((cat) => {
    assert.ok(Array.isArray(cat.keywords) && cat.keywords.length > 0, 'keywords vacio en categoria: ' + cat.id);
  });
});

test('F1: PROPERTY_FOCUS tiene todas las propiedades requeridas', () => {
  const pf = logic.PROPERTY_FOCUS;
  ['casa', 'departamento', 'terreno', 'quinta', 'comercial'].forEach((k) => {
    assert.ok(k in pf, 'falta propiedad en PROPERTY_FOCUS: ' + k);
    assert.ok(typeof pf[k] === 'string' && pf[k].length > 0, 'enfoque vacio en: ' + k);
  });
});

test('F1: EDIT_ORDER tiene todos los shotTypes y valores numericos', () => {
  const eo = logic.EDIT_ORDER;
  Object.keys(logic.SHOT_TYPES).forEach((k) => {
    assert.ok(k in eo, 'falta shotType en EDIT_ORDER: ' + k);
    assert.ok(typeof eo[k] === 'number', 'valor no numerico en EDIT_ORDER[' + k + ']');
  });
});

test('F2: detectCategoria — medio_bano detectable', () => {
  assert.equal(logic.detectCategoria('Medio baño'), 'medio_bano');
  assert.equal(logic.detectCategoria('Medio bano'), 'medio_bano');
  assert.equal(logic.detectCategoria('Baño de visitas'), 'medio_bano');
  assert.equal(logic.detectCategoria('Baño completo'), 'bano');
  assert.equal(logic.detectCategoria('Baño'), 'bano');
  assert.equal(logic.detectCategoria('Baño principal'), 'bano');
});

test('F2: detectCategoria — lavado, bano, recamara y fallback', () => {
  assert.equal(logic.detectCategoria('Cuarto de lavado'), 'lavado');
  assert.equal(logic.detectCategoria('Lavanderia'), 'lavado');
  assert.equal(logic.detectCategoria('Bano principal'), 'bano');
  assert.equal(logic.detectCategoria('Baño principal'), 'bano');
  assert.equal(logic.detectCategoria('Recamara principal'), 'recamara');
  assert.equal(logic.detectCategoria('Recámara principal'), 'recamara');
  const salon = logic.detectCategoria('Salón raro');
  assert.ok(salon === 'sala' || salon === 'generico', 'salon raro debe ser sala o generico, got: ' + salon);
});

test('F2: detectCategoria — acentos no importan', () => {
  assert.equal(logic.detectCategoria('baño'), logic.detectCategoria('bano'));
  assert.equal(logic.detectCategoria('recámara'), logic.detectCategoria('recamara'));
  assert.equal(logic.detectCategoria('cocina'), 'cocina');
  assert.equal(logic.detectCategoria('vestídor'), 'vestidor');
});

test('F2: suggestionsForSpace exterior usa terraza', () => {
  const shots = logic.suggestionsForSpace('exterior', 'Fachada');
  assert.ok(Array.isArray(shots) && shots.length > 0, 'debe devolver shots de terraza');
  const terrazaShots = logic.getGuideLibrary().terraza.shots;
  terrazaShots.forEach((s) => {
    assert.ok(shots.some((r) => r.id === s.id), 'falta shot de terraza: ' + s.id);
  });
});

test('F2: suggestionsForSpace sala con alberca incluye shots de amenidad', () => {
  const shots = logic.suggestionsForSpace('sala', 'Sala con alberca');
  const ids = shots.map((s) => s.id);
  assert.ok(ids.some((id) => id.startsWith('sala.')), 'debe incluir shots de sala');
  assert.ok(ids.some((id) => id.startsWith('amenity.alberca.')), 'debe incluir shots de alberca');
});

test('F2: suggestionsForSpace categoria sin entrada usa generico', () => {
  const shots = logic.suggestionsForSpace('inexistente', 'Cuarto raro');
  assert.ok(Array.isArray(shots) && shots.length > 0, 'nunca devuelve undefined');
  assert.ok(shots.some((s) => s.id === 'generico.wide'), 'debe caer en generico');
});

test('F2: suggestionsForDrone tipo inexistente cae a casa', () => {
  const shots = logic.suggestionsForDrone('inexistente');
  const casaShots = logic.DRONE_GUIDE.casa.shots;
  assert.deepEqual(shots, Array.from(casaShots));
});

test('F2: findSuggestion — encontrado y no encontrado', () => {
  const shot = logic.findSuggestion('cocina.wide');
  assert.ok(shot !== null && shot !== undefined, 'debe encontrar cocina.wide');
  assert.equal(shot.id, 'cocina.wide');
  assert.equal(logic.findSuggestion('no.existe'), null);
});

test('F2: findSuggestion encuentra shots de drone y amenidad', () => {
  const droneShot = logic.findSuggestion('drone.casa.fachada');
  assert.ok(droneShot !== null, 'debe encontrar drone.casa.fachada');
  const amenityShot = logic.findSuggestion('amenity.alberca.wide');
  assert.ok(amenityShot !== null, 'debe encontrar amenity.alberca.wide');
});

// ─── F3: modelo mediaFile + migración estado v3 ──────────────────────────────

test('F3: registerMediaFile persiste shotType, movement y suggestionId', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });

  state = logic.registerMediaFile(state, {
    cameraId: 'sony-main',
    targetId: salaId,
    kind: 'take',
    shotType: 'wide',
    movement: 'gimbal_walk',
    suggestionId: 'sala.wide',
  });

  assert.equal(state.mediaFiles.length, 1);
  assert.equal(state.mediaFiles[0].shotType, 'wide');
  assert.equal(state.mediaFiles[0].movement, 'gimbal_walk');
  assert.equal(state.mediaFiles[0].suggestionId, 'sala.wide');
});

test('F3: suggestionProgress reporta done:true y count:1 tras grabar sugerencia', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });

  state = logic.registerMediaFile(state, {
    cameraId: 'sony-main',
    targetId: salaId,
    kind: 'take',
    suggestionId: 'sala.wide',
    shotType: 'wide',
    movement: 'gimbal_walk',
  });

  const progress = logic.suggestionProgress(state, 'video', salaId, 'sala.wide');
  assert.equal(progress.done, true);
  assert.equal(progress.count, 1);
  assert.equal(progress.files.length, 1);
});

test('F3: toma libre (suggestionId null) deja el espacio en estado hecho via deriveMediaTargetState', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });

  state = logic.registerMediaFile(state, {
    cameraId: 'sony-main',
    targetId: salaId,
    kind: 'take',
  });

  assert.equal(state.mediaFiles[0].suggestionId, null);
  assert.equal(state.espacios[0].estados.video.estado, 'hecho');
});

test('F3: removeMediaFile de toma ligada hace que suggestionProgress.done vuelva a false', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });

  state = logic.registerMediaFile(state, {
    cameraId: 'sony-main',
    targetId: salaId,
    kind: 'take',
    suggestionId: 'sala.wide',
  });

  const mediaId = state.mediaFiles[0].id;
  const before = logic.suggestionProgress(state, 'video', salaId, 'sala.wide');
  assert.equal(before.done, true);

  state = logic.removeMediaFile(state, mediaId);
  const after = logic.suggestionProgress(state, 'video', salaId, 'sala.wide');
  assert.equal(after.done, false);
  assert.equal(after.count, 0);
});

test('F3: normalizeChecklistData migra blob v2 a v3 con campos de mediaFiles en null y guide presente', () => {
  const normalized = logic.normalizeChecklistData({
    version: 2,
    espacios: [{ id: 'esp1', nombre: 'Sala', zona: 'interior' }],
    mediaFiles: [
      {
        id: 'mf1',
        cameraId: 'sony-main',
        targetId: 'esp1',
        kind: 'take',
        fileToken: 'PIB0001',
        fileCounter: 1,
        good: false,
      },
    ],
  });

  assert.equal(normalized.version, 3);
  assert.ok(normalized.guide, 'debe existir normalized.guide');
  assert.equal(normalized.guide.tipoPropiedad, null);
  assert.equal(normalized.guide.descripcion, '');
  assert.equal(normalized.guide.proposal, null);
  assert.ok(Array.isArray(normalized.mediaFiles));
  assert.equal(normalized.mediaFiles[0].shotType, null);
  assert.equal(normalized.mediaFiles[0].movement, null);
  assert.equal(normalized.mediaFiles[0].suggestionId, null);
});

test('F3: normalizeChecklistData round-trip de blob v3 sin perdida', () => {
  const blob = {
    version: 3,
    espacios: [{ id: 'esp1', nombre: 'Cocina', zona: 'interior', piso: 'Piso 1', estados: {} }],
    mediaFiles: [
      {
        id: 'mf1',
        cameraId: 'sony-main',
        targetId: 'esp1',
        kind: 'take',
        fileToken: 'PIB0001',
        fileCounter: 1,
        good: false,
        shotType: 'wide',
        movement: 'gimbal_walk',
        suggestionId: 'cocina.wide',
      },
    ],
    guide: { tipoPropiedad: 'casa', descripcion: 'Casa amplia', proposal: null },
  };

  const normalized = logic.normalizeChecklistData(blob);
  assert.equal(normalized.version, 3);
  assert.equal(normalized.guide.tipoPropiedad, 'casa');
  assert.equal(normalized.guide.descripcion, 'Casa amplia');
  assert.equal(normalized.mediaFiles[0].shotType, 'wide');
  assert.equal(normalized.mediaFiles[0].movement, 'gimbal_walk');
  assert.equal(normalized.mediaFiles[0].suggestionId, 'cocina.wide');
});

test('F3: guideCoverage reporta must.faltan correctamente', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });

  const before = logic.guideCoverage(state, 'video');
  const salaBefore = before.find((entry) => entry.target.id === salaId);
  assert.ok(salaBefore.must.faltan.length > 0, 'debe haber must pendientes antes de grabar');

  state = logic.registerMediaFile(state, {
    cameraId: 'sony-main',
    targetId: salaId,
    kind: 'take',
    suggestionId: 'sala.wide',
  });

  const after = logic.guideCoverage(state, 'video');
  const salaAfter = after.find((entry) => entry.target.id === salaId);
  const faltanIds = salaAfter.must.faltan.map((s) => s.id);
  assert.ok(!faltanIds.includes('sala.wide'), 'sala.wide no debe estar en faltan despues de grabar');
  assert.equal(salaAfter.must.hechas, 1);
});

test('F3: guideCoverage respeta guideSkip (excluye sugerencias marcadas no aplica)', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  const salaId = state.espacios[0].id;
  state.espacios[0].guideSkip = { 'sala.wide': true };

  const coverage = logic.guideCoverage(state, 'video');
  const salaCoverage = coverage.find((entry) => entry.target.id === salaId);
  const faltanIds = salaCoverage.must.faltan.map((s) => s.id);
  assert.ok(!faltanIds.includes('sala.wide'), 'sala.wide con guideSkip no debe aparecer en faltan');
});

// ─── F4: export enriquecido ────────────────────────────────────────────────────

test('F4: buildExport version es 2', () => {
  const state = logic.createDefaultState();
  const exp = logic.buildExport(state, {});
  assert.equal(exp.version, 2);
});

test('F4: buildExport incluye resumenGuia y guionEdicion', () => {
  const state = logic.createDefaultState();
  const exp = logic.buildExport(state, {});
  assert.ok(Array.isArray(exp.resumenGuia), 'resumenGuia debe ser array');
  assert.ok(exp.guionEdicion && Array.isArray(exp.guionEdicion.clips), 'guionEdicion.clips debe ser array');
});

test('F4: buildExport refleja tipoToma/movimiento/prioridad/ordenEdicion/labels en archivo con shotType', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, {
    cameraId: 'sony-main',
    targetId: salaId,
    kind: 'take',
    shotType: 'wide',
    movement: 'static',
    suggestionId: 'sala.wide',
  });

  const exp = logic.buildExport(state, {});
  const a = exp.archivos[0];

  assert.equal(a.tipoToma, 'wide');
  assert.equal(a.tipoTomaLabel, logic.getShotTypes()['wide'].label);
  assert.equal(a.movimiento, 'static');
  assert.equal(a.movimientoLabel, logic.getMovements()['static'].label);
  assert.equal(a.sugerencia, 'sala.wide');
  assert.equal(a.prioridad, 'must');
  assert.equal(a.ordenEdicion, logic.EDIT_ORDER['wide']);
});

test('F4: premiere.Description con shotType empieza con [E y contiene tipo/movimiento', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, {
    cameraId: 'sony-main',
    targetId: salaId,
    kind: 'take',
    shotType: 'wide',
    movement: 'static',
  });

  const exp = logic.buildExport(state, {});
  const desc = exp.archivos[0].premiere.Description;
  assert.ok(desc.startsWith('[E'), 'Description debe empezar con [E');
  assert.ok(desc.includes(logic.getShotTypes()['wide'].label), 'Description debe incluir el label del tipo de toma');
  assert.ok(desc.includes(logic.getMovements()['static'].label), 'Description debe incluir el label del movimiento');
});

test('F4: archivo sin shotType tiene ordenEdicion:null y Description sin [E', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, {
    cameraId: 'sony-main',
    targetId: salaId,
    kind: 'take',
  });

  const exp = logic.buildExport(state, {});
  const a = exp.archivos[0];
  assert.equal(a.ordenEdicion, null);
  assert.ok(!a.premiere.Description.startsWith('[E'), 'Description no debe empezar con [E si no hay shotType');
});

test('F4: guionEdicion.clips ordena takes por ordenEdicion (null al final)', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala\nCocina');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });

  // detalle → ordenEdicion 50
  state = logic.registerMediaFile(state, {
    cameraId: 'sony-main', targetId: state.espacios[0].id, kind: 'take', shotType: 'detalle',
  });
  // wide → ordenEdicion 10
  state = logic.registerMediaFile(state, {
    cameraId: 'sony-main', targetId: state.espacios[1].id, kind: 'take', shotType: 'wide',
  });
  // sin shotType → ordenEdicion null (al final)
  state = logic.registerMediaFile(state, {
    cameraId: 'sony-main', targetId: state.espacios[0].id, kind: 'take',
  });

  const exp = logic.buildExport(state, {});
  const clips = exp.guionEdicion.clips;

  assert.equal(clips.length, 3);
  // wide (10) primero
  assert.equal(clips[0].ordenEdicion, logic.EDIT_ORDER['wide']);
  // detalle (50) segundo
  assert.equal(clips[1].ordenEdicion, logic.EDIT_ORDER['detalle']);
  // null al final
  assert.equal(clips[2].ordenEdicion, null);
});

// F5 — resolver de config (defaults + overrides)

test('F5: sin config los getters devuelven los defaults', () => {
  logic.resetGuideConfig();
  const st = logic.getShotTypes();
  assert.ok(st.wide && st.detalle && st.reveal, 'SHOT_TYPES defaults presentes');
  const mv = logic.getMovements();
  assert.ok(mv.static && mv.pan && mv.orbit, 'MOVEMENTS defaults presentes');
  const lib = logic.getGuideLibrary();
  assert.ok(lib.sala && lib.cocina && lib.bano, 'GUIDE_LIBRARY defaults presentes');
  const drone = logic.getDroneGuide();
  assert.ok(drone.casa && drone.lujo, 'DRONE_GUIDE defaults presentes');
  const amen = logic.getAmenityGuide();
  assert.ok(amen.alberca && amen.gimnasio, 'AMENITY_GUIDE defaults presentes');
  const cats = logic.getRoomCategories();
  assert.ok(Array.isArray(cats) && cats.length > 0, 'ROOM_CATEGORIES defaults presentes');
});

test('F5: config renombra shot, oculta default y agrega custom — getGuideLibrary y findSuggestion reflejan los tres', () => {
  logic.resetGuideConfig();
  const salaDefaultShots = logic.getGuideLibrary().sala.shots;
  const primerShot = salaDefaultShots[0];

  logic.applyGuideConfig({
    categorias: {
      sala: {
        shots: [
          { id: primerShot.id, nombre: 'Nombre renombrado' },
          { id: salaDefaultShots[1].id, removed: true },
          { id: 'custom.sala-especial-x1', nombre: 'Toma especial', shotType: 'wide', movement: 'static', enfoque: 'Test', priority: 'nice' },
        ],
      },
    },
  });

  const lib = logic.getGuideLibrary();
  const salaShots = lib.sala.shots;

  // (a) renombrar: el primer shot tiene el nuevo nombre
  const renombrado = salaShots.find((s) => s.id === primerShot.id);
  assert.ok(renombrado, 'El shot renombrado debe existir');
  assert.equal(renombrado.nombre, 'Nombre renombrado');

  // (b) ocultar: el segundo shot default no aparece
  const oculto = salaShots.find((s) => s.id === salaDefaultShots[1].id);
  assert.equal(oculto, undefined, 'El shot con removed:true no debe aparecer');

  // (c) agregar custom: aparece en la lista y en findSuggestion
  const custom = salaShots.find((s) => s.id === 'custom.sala-especial-x1');
  assert.ok(custom, 'El shot custom debe aparecer en getGuideLibrary');
  const found = logic.findSuggestion('custom.sala-especial-x1');
  assert.ok(found, 'findSuggestion debe encontrar el shot custom');
  assert.equal(found.nombre, 'Toma especial');

  logic.resetGuideConfig();
});

test('F5: override de roomCategories cambia resultado de detectCategoria', () => {
  logic.resetGuideConfig();

  logic.applyGuideConfig({
    roomCategories: [
      { id: 'categoria_test', keywords: ['especial', 'prueba'] },
    ],
  });

  const cat = logic.detectCategoria('Cuarto especial');
  assert.equal(cat, 'categoria_test', 'detectCategoria debe usar las roomCategories del override');

  // nombre sin keyword de la lista custom → generico
  const catDefault = logic.detectCategoria('Sala');
  assert.equal(catDefault, 'generico', 'Sin keywords en override → generico');

  logic.resetGuideConfig();
});

test('F5: override de drone cambia suggestionsForDrone', () => {
  logic.resetGuideConfig();
  const defaultCasaShots = logic.getDroneGuide().casa.shots;
  const primerShotId = defaultCasaShots[0].id;

  logic.applyGuideConfig({
    drone: {
      casa: {
        shots: [
          { id: primerShotId, nombre: 'Drone renombrado' },
          { id: 'custom.drone-casa-extra', nombre: 'Toma extra drone', shotType: 'exterior', movement: 'orbit', enfoque: 'Test', priority: 'nice' },
        ],
      },
    },
  });

  const sugs = logic.suggestionsForDrone('casa');
  const renombrado = sugs.find((s) => s.id === primerShotId);
  assert.ok(renombrado && renombrado.nombre === 'Drone renombrado', 'suggestionsForDrone refleja el override');
  const extra = sugs.find((s) => s.id === 'custom.drone-casa-extra');
  assert.ok(extra, 'suggestionsForDrone incluye el shot custom de drone');

  logic.resetGuideConfig();
});

test('F5: config invalido con shots no-array no lanza y la categoria default usa shots del default', () => {
  logic.resetGuideConfig();
  const defaultCocinaShots = logic.getGuideLibrary().cocina.shots.slice();

  assert.doesNotThrow(() => {
    logic.applyGuideConfig({ categorias: { cocina: { shots: 'no-es-array' } } });
  }, 'applyGuideConfig con shots no-array no debe lanzar');

  const shots = logic.getGuideLibrary().cocina.shots;
  assert.equal(shots.length, defaultCocinaShots.length, 'Shots de cocina deben ser los defaults cuando override.shots no es array');

  logic.resetGuideConfig();
});

test('F5: config null no lanza y deja defaults', () => {
  logic.applyGuideConfig({ categorias: { sala: { shots: [{ id: 'custom.x', nombre: 'X', shotType: 'wide', movement: 'static', enfoque: '', priority: 'nice' }] } } });
  assert.doesNotThrow(() => logic.applyGuideConfig(null), 'applyGuideConfig(null) no debe lanzar');
  const lib = logic.getGuideLibrary();
  // despues de null, debe volver a defaults
  const custom = lib.sala.shots.find((s) => s.id === 'custom.x');
  assert.equal(custom, undefined, 'Tras applyGuideConfig(null) los getters devuelven defaults');
});

test('F5: resetGuideConfig restaura defaults despues de un override', () => {
  logic.resetGuideConfig();
  const defaultLabel = logic.getGuideLibrary().sala.label;
  const defaultCount = logic.getGuideLibrary().sala.shots.length;

  logic.applyGuideConfig({
    categorias: { sala: { label: 'Sala Override' } },
    shotTypes: { wide: { label: 'Plano Override' } },
  });
  assert.equal(logic.getGuideLibrary().sala.label, 'Sala Override', 'Override de label aplicado');
  assert.equal(logic.getShotTypes().wide.label, 'Plano Override', 'Override de shotType aplicado');

  logic.resetGuideConfig();
  const lib = logic.getGuideLibrary();
  assert.equal(lib.sala.label, defaultLabel, 'Tras resetGuideConfig el label de sala vuelve al default');
  assert.equal(lib.sala.shots.length, defaultCount, 'Tras resetGuideConfig los shots vuelven al conteo default');
  assert.notEqual(logic.getShotTypes().wide.label, 'Plano Override', 'Tras resetGuideConfig shotType vuelve al default');
});

// ─── F14: puente IA — buildPropuestaPrompt + parsePropuesta ──────────────────

function makeStateWithProposal() {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala\nCocina');
  state.espacios[0].categoria = 'sala';
  state.espacios[1].categoria = 'cocina';
  state.guide = { tipoPropiedad: 'casa', descripcion: 'Casa amplia con doble altura', proposal: null };
  return state;
}

// ─── F72: prompt de propuesta IA con fotos ───────────────────────────────────
// State con dos pisos y cuartos de distintas zonas, ids conocidos.
function makeStateConPisos() {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Cocina\nFachada\nRecamara');
  // Planta baja: Cocina (interior), Fachada (exterior). Planta alta: Recamara (interior).
  state.espacios[0].piso = 'Planta baja';
  state.espacios[0].zona = 'interior';
  state.espacios[1].piso = 'Planta baja';
  state.espacios[1].zona = 'exterior';
  state.espacios[2].piso = 'Planta alta';
  state.espacios[2].zona = 'interior';
  state.guide = { tipoPropiedad: 'casa', descripcion: 'TEXTO_DESCRIPCION_DISTINTIVO_XYZ', proposal: null };
  return state;
}

test('F72: buildPropuestaPrompt contiene los id reales de todos los espacios', () => {
  const state = makeStateConPisos();
  const prompt = logic.buildPropuestaPrompt(state);
  assert.equal(typeof prompt, 'string', 'debe ser string');
  state.espacios.forEach((esp) => {
    assert.ok(prompt.includes(esp.id), 'debe incluir el id real del espacio ' + esp.nombre);
    assert.ok(prompt.includes(esp.nombre), 'debe incluir el nombre del espacio ' + esp.nombre);
  });
});

test('F72: buildPropuestaPrompt agrupa por piso (aparecen las etiquetas de los pisos)', () => {
  const state = makeStateConPisos();
  const prompt = logic.buildPropuestaPrompt(state);
  assert.ok(prompt.includes('Planta baja'), 'debe incluir la etiqueta del piso Planta baja');
  assert.ok(prompt.includes('Planta alta'), 'debe incluir la etiqueta del piso Planta alta');
});

test('F72: buildPropuestaPrompt NO contiene la palabra descripcion ni usa guide.descripcion', () => {
  const state = makeStateConPisos();
  const prompt = logic.buildPropuestaPrompt(state);
  assert.ok(!prompt.includes('descripcion'), 'el prompt no debe mencionar la palabra descripcion');
  assert.ok(!prompt.includes('TEXTO_DESCRIPCION_DISTINTIVO_XYZ'), 'no debe incluir guide.descripcion');
});

test('F72: buildPropuestaPrompt contiene los ids de getShotTypes() y getMovements()', () => {
  const state = makeStateConPisos();
  const prompt = logic.buildPropuestaPrompt(state);
  Object.keys(logic.getShotTypes()).forEach((id) => {
    assert.ok(prompt.includes('"' + id + '"'), 'debe incluir el id de shotType ' + id);
  });
  Object.keys(logic.getMovements()).forEach((id) => {
    assert.ok(prompt.includes('"' + id + '"'), 'debe incluir el id de movement ' + id);
  });
});

test('F72: buildPropuestaPrompt incluye instruccion de fotografiar y de responder solo el JSON con porCuarto', () => {
  const state = makeStateConPisos();
  const prompt = logic.buildPropuestaPrompt(state);
  assert.ok(/foto/i.test(prompt), 'debe instruir tomar fotos');
  assert.ok(prompt.includes('porCuarto'), 'debe incluir el esquema porCuarto');
  assert.ok(/UNICAMENTE.*JSON/s.test(prompt) || prompt.includes('sin markdown'), 'debe pedir responder solo el JSON');
});

test('F72: ida y vuelta — respuesta con id real pasa por parsePropuesta con agregadas >= 1', () => {
  const state = makeStateConPisos();
  const cocinaId = state.espacios[0].id;
  const texto = '{"porCuarto":{"' + cocinaId + '":[{"nombre":"Push in en la cocina","shotType":"medio","movement":"push_in","enfoque":"Avanza hacia la isla central","priority":"must"}]}}';
  const result = logic.parsePropuesta(texto, state);
  assert.ok(result.report.agregadas >= 1, 'debe agregar al menos una toma');
  assert.ok(result.proposal.porCuarto[cocinaId], 'debe mapear al id real de la cocina');
  assert.equal(result.proposal.porCuarto[cocinaId][0].nombre, 'Push in en la cocina');
});

test('F72: buildPropuestaPrompt agrupa por zona dentro de cada piso', () => {
  const state = makeStateConPisos();
  const prompt = logic.buildPropuestaPrompt(state);
  assert.ok(prompt.includes('Interior'), 'debe incluir la etiqueta de zona Interior');
  assert.ok(prompt.includes('Exterior'), 'debe incluir la etiqueta de zona Exterior');
});

test('F72: buildPropuestaPrompt usa la etiqueta neutra Sin piso para espacios sin piso', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala');
  delete state.espacios[0].piso;
  state.espacios[0].zona = 'interior';
  const prompt = logic.buildPropuestaPrompt(state);
  assert.ok(prompt.includes('Sin piso'), 'debe agrupar bajo Sin piso cuando no hay piso');
});

test('F14: parsePropuesta extrae JSON envuelto en ```json`', () => {
  const state = makeStateWithProposal();
  const salaId = state.espacios[0].id;
  const texto = '```json\n{"porCuarto":{"' + salaId + '":[{"nombre":"Toma IA","shotType":"wide","movement":"static","enfoque":"panoramica","priority":"must"}]}}\n```';

  const result = logic.parsePropuesta(texto, state);

  assert.ok(result.proposal, 'debe devolver proposal');
  assert.ok(result.proposal.porCuarto[salaId], 'debe tener tomas para salaId');
  assert.equal(result.proposal.porCuarto[salaId].length, 1);
  assert.ok(result.proposal.porCuarto[salaId][0].id.startsWith('custom.ia.'), 'id debe empezar con custom.ia.');
  assert.equal(result.proposal.porCuarto[salaId][0].nombre, 'Toma IA');
  assert.equal(result.proposal.porCuarto[salaId][0].shotType, 'wide');
  assert.equal(result.proposal.porCuarto[salaId][0].movement, 'static');
  assert.equal(result.proposal.porCuarto[salaId][0].priority, 'must');
});

test('F14: parsePropuesta extrae JSON con texto alrededor', () => {
  const state = makeStateWithProposal();
  const salaId = state.espacios[0].id;
  const texto = 'Aqui estan las tomas sugeridas:\n{"porCuarto":{"' + salaId + '":[{"nombre":"Toma B","shotType":"general","movement":"pan","enfoque":"foco general","priority":"nice"}]}}\nespero que sea util.';

  const result = logic.parsePropuesta(texto, state);

  assert.ok(result.proposal.porCuarto[salaId], 'debe extraer a pesar del texto alrededor');
  assert.equal(result.proposal.porCuarto[salaId][0].nombre, 'Toma B');
});

test('F14: parsePropuesta rechaza cuarto con id inexistente en state.espacios', () => {
  const state = makeStateWithProposal();
  const texto = '{"porCuarto":{"id-no-existe":[{"nombre":"Toma X","shotType":"wide","movement":"static","enfoque":"foco","priority":"must"}]}}';

  const result = logic.parsePropuesta(texto, state);

  assert.deepEqual(result.proposal.porCuarto, {}, 'no debe agregar cuartos inexistentes');
  assert.ok(result.report.ignoradas > 0, 'debe reportar ignoradas');
});

test('F14: parsePropuesta rechaza shot con shotType invalido', () => {
  const state = makeStateWithProposal();
  const salaId = state.espacios[0].id;
  const texto = '{"porCuarto":{"' + salaId + '":[{"nombre":"Toma mala","shotType":"INVALIDO","movement":"static","enfoque":"x","priority":"must"}]}}';

  const result = logic.parsePropuesta(texto, state);

  const shots = result.proposal.porCuarto[salaId] || [];
  assert.equal(shots.length, 0, 'shot con shotType invalido debe descartarse');
  assert.ok(result.report.ignoradas > 0, 'debe reportar shot ignorada');
});

test('F14: parsePropuesta rechaza shot con movement invalido', () => {
  const state = makeStateWithProposal();
  const salaId = state.espacios[0].id;
  const texto = '{"porCuarto":{"' + salaId + '":[{"nombre":"Toma mala mov","shotType":"wide","movement":"INVALIDO","enfoque":"x","priority":"must"}]}}';

  const result = logic.parsePropuesta(texto, state);

  const shots = result.proposal.porCuarto[salaId] || [];
  assert.equal(shots.length, 0, 'shot con movement invalido debe descartarse');
  assert.ok(result.report.ignoradas > 0);
});

test('F14: parsePropuesta normaliza priority invalida a nice', () => {
  const state = makeStateWithProposal();
  const salaId = state.espacios[0].id;
  const texto = '{"porCuarto":{"' + salaId + '":[{"nombre":"Toma norm","shotType":"wide","movement":"static","enfoque":"x","priority":"invalid"}]}}';

  const result = logic.parsePropuesta(texto, state);

  const shots = result.proposal.porCuarto[salaId] || [];
  assert.equal(shots.length, 1, 'shot con priority invalida se conserva');
  assert.equal(shots[0].priority, 'nice', 'priority invalida se normaliza a nice');
});

test('F14: parsePropuesta recorta a maximo 6 tomas por cuarto', () => {
  const state = makeStateWithProposal();
  const salaId = state.espacios[0].id;
  const tomas = Array.from({ length: 10 }, (_, i) => ({
    nombre: 'Toma ' + i,
    shotType: 'wide',
    movement: 'static',
    enfoque: 'x',
    priority: 'nice',
  }));
  const texto = JSON.stringify({ porCuarto: { [salaId]: tomas } });

  const result = logic.parsePropuesta(texto, state);

  const shots = result.proposal.porCuarto[salaId] || [];
  assert.ok(shots.length <= 6, 'no debe exceder 6 tomas por cuarto, got: ' + shots.length);
});

test('F14: parsePropuesta con texto basura devuelve proposal vacio sin lanzar', () => {
  const state = makeStateWithProposal();

  let result;
  assert.doesNotThrow(() => {
    result = logic.parsePropuesta('esto no es json para nada', state);
  }, 'no debe lanzar con texto basura');

  assert.deepEqual(result.proposal.porCuarto, {}, 'debe devolver proposal vacio');
  assert.equal(typeof result.report.agregadas, 'number');
});

test('F14: proposalShotsFor devuelve tomas de la propuesta para el target', () => {
  const state = makeStateWithProposal();
  const salaId = state.espacios[0].id;
  const iaShot = { id: 'custom.ia.abc123', nombre: 'Toma IA', shotType: 'wide', movement: 'static', enfoque: 'x', priority: 'must' };
  state.guide.proposal = { porCuarto: { [salaId]: [iaShot] } };

  const shots = logic.proposalShotsFor(state, salaId);

  assert.equal(shots.length, 1);
  assert.equal(shots[0].id, 'custom.ia.abc123');
});

test('F14: proposalShotsFor devuelve [] cuando no hay propuesta', () => {
  const state = makeStateWithProposal();
  const salaId = state.espacios[0].id;

  assert.deepEqual(logic.proposalShotsFor(state, salaId), []);
});

test('F14: suggestionsForTarget concatena shots base con tomas de la propuesta', () => {
  const state = makeStateWithProposal();
  const target = state.espacios[0];
  target.categoria = 'sala';
  const iaShot = { id: 'custom.ia.xyz456', nombre: 'Toma IA Sala', shotType: 'wide', movement: 'static', enfoque: 'x', priority: 'nice' };
  state.guide.proposal = { porCuarto: { [target.id]: [iaShot] } };

  const shots = logic.suggestionsForTarget(state, 'video', target);

  const baseShots = logic.suggestionsForSpace(target.categoria, target.nombre);
  assert.ok(shots.length > baseShots.length, 'debe incluir mas shots que solo los base');
  assert.ok(shots.some((s) => s.id === 'custom.ia.xyz456'), 'debe incluir la toma IA');
  baseShots.forEach((bs) => {
    assert.ok(shots.some((s) => s.id === bs.id), 'debe incluir shot base: ' + bs.id);
  });
});

test('F14: findSuggestion encuentra custom.ia con state, null sin state', () => {
  const state = makeStateWithProposal();
  const salaId = state.espacios[0].id;
  const iaShot = { id: 'custom.ia.test999', nombre: 'Toma IA Test', shotType: 'wide', movement: 'static', enfoque: 'x', priority: 'must' };
  state.guide.proposal = { porCuarto: { [salaId]: [iaShot] } };

  const found = logic.findSuggestion('custom.ia.test999', state);
  assert.ok(found, 'debe encontrar custom.ia con state');
  assert.equal(found.id, 'custom.ia.test999');

  const notFound = logic.findSuggestion('custom.ia.test999');
  assert.equal(notFound, null, 'sin state debe devolver null');
});

test('F14: guideCoverage incluye toma IA must en must.faltan hasta que se liga', () => {
  let state = makeStateWithProposal();
  const salaId = state.espacios[0].id;
  state.espacios[0].categoria = 'sala';
  const iaShot = { id: 'custom.ia.cov001', nombre: 'Toma IA cobertura', shotType: 'wide', movement: 'static', enfoque: 'x', priority: 'must' };
  state.guide.proposal = { porCuarto: { [salaId]: [iaShot] } };

  const before = logic.guideCoverage(state, 'video');
  const salaEntry = before.find((e) => e.target.id === salaId);
  assert.ok(salaEntry.must.faltan.some((s) => s.id === 'custom.ia.cov001'), 'toma IA must debe estar en faltan');

  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, {
    cameraId: 'sony-main',
    targetId: salaId,
    kind: 'take',
    suggestionId: 'custom.ia.cov001',
  });

  const after = logic.guideCoverage(state, 'video');
  const salaAfter = after.find((e) => e.target.id === salaId);
  assert.ok(!salaAfter.must.faltan.some((s) => s.id === 'custom.ia.cov001'), 'toma IA ligada no debe estar en faltan');
  assert.ok(salaAfter.must.hechas >= 1, 'toma IA ligada debe contar como hecha');
});

// ─── R96: C1 hardening tests ──────────────────────────────────────────────────

test('C1: parsePropuesta genera IDs deterministas estables entre dos parseos del mismo texto', () => {
  const state = makeStateWithProposal();
  const salaId = state.espacios[0].id;
  const texto = JSON.stringify({
    porCuarto: {
      [salaId]: [
        { nombre: 'Wide entrada', shotType: 'wide', movement: 'static', enfoque: 'foco', priority: 'must' },
        { nombre: 'Orbital mesa', shotType: 'medio', movement: 'orbit', enfoque: 'foco2', priority: 'nice' },
      ],
    },
  });

  const r1 = logic.parsePropuesta(texto, state);
  const r2 = logic.parsePropuesta(texto, state);

  const shots1 = r1.proposal.porCuarto[salaId];
  const shots2 = r2.proposal.porCuarto[salaId];
  assert.equal(shots1.length, 2, 'debe parsear 2 tomas');
  assert.equal(shots1[0].id, shots2[0].id, 'primer ID debe ser identico en ambos parseos');
  assert.equal(shots1[1].id, shots2[1].id, 'segundo ID debe ser identico en ambos parseos');
  assert.ok(shots1[0].id.startsWith('custom.ia.'), 'ID debe empezar con custom.ia.');
});

test('C2: capasCubiertas con solo wides devuelve abierto=true medio=false detalle=false', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  const targetId = state.espacios[0].id;
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId, kind: 'take', shotType: 'wide' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId, kind: 'take', shotType: 'general' });

  const capas = logic.capasCubiertas(state, 'video', targetId);

  assert.equal(capas.abierto, true, 'abierto debe ser true');
  assert.equal(capas.medio, false, 'medio debe ser false');
  assert.equal(capas.detalle, false, 'detalle debe ser false');
});

test('C2: capasCubiertas con wide+detalle deja medio=false', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  const targetId = state.espacios[0].id;
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId, kind: 'take', shotType: 'wide' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId, kind: 'take', shotType: 'detalle' });

  const capas = logic.capasCubiertas(state, 'video', targetId);

  assert.equal(capas.abierto, true);
  assert.equal(capas.medio, false, 'medio debe ser false');
  assert.equal(capas.detalle, true);
});

test('C2: capasCubiertas con las 3 capas devuelve todo true', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  const targetId = state.espacios[0].id;
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId, kind: 'take', shotType: 'wide' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId, kind: 'take', shotType: 'medio' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId, kind: 'take', shotType: 'textura' });

  const capas = logic.capasCubiertas(state, 'video', targetId);

  assert.equal(capas.abierto, true);
  assert.equal(capas.medio, true);
  assert.equal(capas.detalle, true);
});

test('C2: capasCubiertas con reveal cuenta como abierto=true', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Recamara principal');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  const targetId = state.espacios[0].id;
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId, kind: 'take', shotType: 'reveal' });

  const capas = logic.capasCubiertas(state, 'video', targetId);

  assert.equal(capas.abierto, true, 'reveal debe contar como capa abierta');
  assert.equal(capas.medio, false);
  assert.equal(capas.detalle, false);
});

test('C2: capasCubiertas ignora tomas libres sin shotType', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  const targetId = state.espacios[0].id;
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId, kind: 'take' });

  const capas = logic.capasCubiertas(state, 'video', targetId);

  assert.equal(capas.abierto, false, 'toma libre sin shotType no cuenta para capa abierto');
  assert.equal(capas.medio, false);
  assert.equal(capas.detalle, false);
});

test('C2: capasCubiertas no confunde lanes (drone no cuenta para video)', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_20260517111742_0245_D' });
  const targetId = state.espacios[0].id;
  state = logic.registerMediaFile(state, { cameraId: 'drone-dji', targetId, kind: 'take', shotType: 'wide' });

  const capas = logic.capasCubiertas(state, 'video', targetId);

  assert.equal(capas.abierto, false, 'toma de drone no debe contar para lane video');
});

test('C1: applyGuideConfig con una seccion invalida conserva las secciones validas', () => {
  logic.applyGuideConfig(null);

  const badCategorias = {};
  Object.defineProperty(badCategorias, 'sala', {
    enumerable: true,
    get() { throw new Error('seccion rota'); },
  });

  assert.doesNotThrow(() => logic.applyGuideConfig({
    categorias: badCategorias,
    movements: { pan: { label: 'Paneo modificado R96' } },
  }), 'no debe lanzar con seccion invalida');

  const movements = logic.getMovements();
  assert.equal(movements.pan.label, 'Paneo modificado R96', 'la seccion movements valida debe conservarse');
  const lib = logic.getGuideLibrary();
  assert.ok(lib.sala, 'sala debe existir como defaults tras fallo de categorias');
});

test('F3: bumpCameraCounter avanza el consecutivo sin crear toma', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'drone-dji', lastFilename: 'DJI_0001' });
  const before = logic.getCameraSequence(s, 'drone-dji').nextToken;
  const n0 = s.mediaFiles.length;
  s = logic.bumpCameraCounter(s, 'drone-dji', 5);
  assert.equal(s.mediaFiles.length, n0, 'no debe crear tomas');
  assert.notEqual(logic.getCameraSequence(s, 'drone-dji').nextToken, before, 'el consecutivo debe avanzar');
});

test('F4: applyGuideConfig agrega cámaras y getCameras las incluye', () => {
  logic.applyGuideConfig({ cameras: [{ id: 'mini4', label: 'DJI Mini 4 Pro', mode: 'drone', kind: 'dji' }] });
  const cams = logic.getCameras(logic.createDefaultState());
  assert.ok(cams.some((c) => c.id === 'mini4'), 'getCameras debe incluir la cámara agregada por config');
  assert.ok(cams.some((c) => c.id === 'sony-main'), 'getCameras debe conservar las cámaras default');
  logic.resetGuideConfig();
  const defaults = logic.getCameras(logic.createDefaultState());
  assert.ok(!defaults.some((c) => c.id === 'mini4'), 'Tras resetGuideConfig getCameras vuelve a los defaults');
});

test('F15: MOVEMENTS incluye los 7 movimientos reales por id con labels en español', () => {
  const movements = logic.getMovements();
  const esperados = {
    push_in: 'Push in',
    pull_out: 'Pull out',
    pan: 'Paneo',
    tilt: 'Tilt',
    travel: 'Travel',
    orbit: 'Órbita',
    reveal: 'Reveal',
  };
  for (const [id, label] of Object.entries(esperados)) {
    assert.ok(movements[id], `MOVEMENTS debe incluir el id "${id}"`);
    assert.equal(movements[id].label, label, `label de "${id}"`);
  }
  // No se borraron entradas historicas (estado viejo / sugerencias las referencian).
  for (const id of ['static', 'dolly', 'gimbal_walk', 'umbral', 'tracking']) {
    assert.ok(movements[id], `MOVEMENTS debe conservar el id historico "${id}"`);
  }
  // Listas curadas user-facing.
  assert.deepEqual(logic.CURATED_MOVEMENTS, ['push_pull', 'pan', 'tilt', 'travel', 'orbit', 'reveal']);
  assert.deepEqual(logic.CURATED_SHOT_TYPES, ['general', 'detalle']);
});

test('F15: una toma LIBRE puede registrarse con shotType+movement sin sugerencia', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });

  state = logic.registerMediaFile(state, {
    cameraId: 'sony-main',
    targetId: salaId,
    kind: 'take',
    autor: 'Bruno',
    shotType: 'detalle',
    movement: 'travel',
  });

  const file = state.mediaFiles[state.mediaFiles.length - 1];
  assert.equal(file.shotType, 'detalle');
  assert.equal(file.movement, 'travel');
  assert.equal(file.suggestionId, null, 'toma libre: sin sugerencia');

  // Drone: mismo plano + movimiento. F38 — registra contra el target unico de sesion.
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_0245' });
  state = logic.registerMediaFile(state, {
    cameraId: 'drone-dji',
    targetId: 'drone-session',
    kind: 'take',
    autor: 'Bruno',
    shotType: 'general',
    movement: 'orbit',
  });
  const droneFile = state.mediaFiles[state.mediaFiles.length - 1];
  assert.equal(droneFile.shotType, 'general');
  assert.equal(droneFile.movement, 'orbit');
  assert.equal(droneFile.suggestionId, null);

  // El export mantiene version:1 y refleja los labels de plano+movimiento.
  const out = logic.buildExport(state, { folio: 'X', nombreCliente: 'Y' });
  assert.equal(out.version, 2);
  const exported = out.archivos.find((a) => a.tipoToma === 'detalle');
  assert.equal(exported.movimientoLabel, 'Travel');
});

// ─── F17 — Biblioteca aerea + vocabulario aereo + sujetos de drone ─────────────

test('F17: getDroneShotTypes expone el vocabulario aereo de tomas', () => {
  const types = logic.getDroneShotTypes();
  assert.ok(types && typeof types === 'object', 'devuelve un objeto');
  for (const id of ['establecimiento', 'orbita', 'cenital', 'reveal_aereo', 'fly_through', 'empuje_acceso', 'entorno']) {
    assert.ok(types[id], 'incluye el tipo aereo: ' + id);
    assert.ok(typeof types[id].label === 'string' && types[id].label.length > 0, id + ' tiene label');
  }
  // Acentos en los labels visibles.
  assert.equal(types.orbita.label, 'Órbita');
  assert.equal(types.reveal_aereo.label, 'Reveal aéreo');
});

test('F17: AERIAL_SUBJECTS contiene los sujetos aereos definidos en el plan', () => {
  const labels = Object.values(logic.AERIAL_SUBJECTS).map((s) => s.label);
  for (const esperado of [
    'Fachada aérea', 'Órbita de la casa', 'Entorno / colonia', 'Vista que vende',
    'Jardín aéreo', 'Alberca aérea', 'Roof / terraza', 'Golden hour',
    'Terreno completo', 'Perímetro / colindancias', 'Acceso / calle', 'Cercanía a vialidades',
  ]) {
    assert.ok(labels.includes(esperado), 'incluye el sujeto aereo: ' + esperado);
  }
  // Cada sujeto trae tomas aereas cuyo shotType vive en el vocabulario aereo.
  const droneTypes = logic.getDroneShotTypes();
  for (const subject of Object.values(logic.AERIAL_SUBJECTS)) {
    assert.ok(subject.shots.length > 0, subject.label + ' tiene tomas');
    for (const shot of subject.shots) {
      assert.ok(droneTypes[shot.shotType], subject.label + ': shotType aereo valido ' + shot.shotType);
    }
  }
});

test('F17: aerialSuggestionsForSubject empareja por id y por nombre del espacio', () => {
  const porId = logic.aerialSuggestionsForSubject('fachada_aerea');
  assert.ok(porId.length > 0, 'por id devuelve tomas');
  assert.ok(porId.some((s) => s.id === 'aereo.fachada.establecimiento'));

  const porNombre = logic.aerialSuggestionsForSubject('Fachada aerea');
  assert.deepEqual(porNombre.map((s) => s.id), porId.map((s) => s.id), 'por nombre empareja al mismo sujeto');

  assert.deepEqual(logic.aerialSuggestionsForSubject('Cuarto interior sin sujeto aereo'), [], 'sin match devuelve vacio');
});

test('F17 (A): suggestedAerialSubjects sesga por tipo de propiedad', () => {
  const casa = logic.suggestedAerialSubjects({}, 'casa').map((s) => s.id);
  assert.ok(casa.includes('fachada_aerea') && casa.includes('orbita_casa'), 'casa sugiere fachada/orbita de la casa');

  const depto = logic.suggestedAerialSubjects({}, 'departamento').map((s) => s.id);
  assert.ok(depto.includes('roof_terraza') && depto.includes('entorno_colonia'), 'depto sugiere roof/entorno');

  const quinta = logic.suggestedAerialSubjects({}, 'quinta').map((s) => s.id);
  assert.ok(quinta.includes('terreno_completo') && quinta.includes('alberca_aerea'), 'quinta sugiere terreno/alberca');

  const terreno = logic.suggestedAerialSubjects({}, 'terreno').map((s) => s.id);
  assert.ok(terreno.includes('terreno_completo') && terreno.includes('perimetro_colindancias') && terreno.includes('cercania_vialidades'),
    'terreno sugiere terreno completo/colindancias/vialidades');

  // Tipo desconocido cae a casa.
  assert.deepEqual(logic.suggestedAerialSubjects({}, 'inexistente').map((s) => s.id), casa);

  // Sin tipo explicito usa el del guide.
  const delGuide = logic.suggestedAerialSubjects({ guide: { tipoPropiedad: 'terreno' } }).map((s) => s.id);
  assert.deepEqual(delGuide, terreno, 'toma el tipoPropiedad del guide cuando no se pasa argumento');
});

test('F17: suggestionsForTarget en modo drone devuelve las sugerencias aereas del sujeto', () => {
  const state = logic.addSpacesFromText(logic.createDefaultState(), 'Fachada aerea');
  const target = state.espacios[0];

  const drone = logic.suggestionsForTarget(state, 'drone', target);
  assert.ok(drone.some((s) => s.id === 'aereo.fachada.establecimiento'), 'usa el vocabulario aereo de la fachada');
  assert.ok(drone.every((s) => logic.getDroneShotTypes()[s.shotType]), 'todas las sugerencias son aereas');

  // Modo no-drone NO cambia: sigue usando las sugerencias de espacio.
  const video = logic.suggestionsForTarget(state, 'video', target);
  const baseVideo = logic.suggestionsForSpace(target.categoria || logic.detectCategoria(target.nombre), target.nombre);
  assert.deepEqual(video.map((s) => s.id), baseVideo.map((s) => s.id), 'video conserva su comportamiento');
});

test('F17: suggestionsForTarget en drone con sujeto sin match conserva el comportamiento previo', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Cuarto raro');
  state.guide = Object.assign({}, state.guide, { tipoPropiedad: 'casa' });
  const target = state.espacios[0];

  const drone = logic.suggestionsForTarget(state, 'drone', target);
  const previo = logic.suggestionsForDrone('casa');
  assert.deepEqual(drone.map((s) => s.id), previo.map((s) => s.id), 'cae al comportamiento previo por tipo de propiedad');
});

test('F17 (C): buildExport lleva el label aereo por archivo de drone (version:2)', () => {
  // F38 — el drone registra contra el target unico de sesion (drone-session).
  let state = logic.createDefaultState();
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_0245' });
  state = logic.registerMediaFile(state, {
    cameraId: 'drone-dji',
    targetId: 'drone-session',
    kind: 'take',
    autor: 'Bruno',
    shotType: 'orbita',
    movement: 'orbit',
    suggestionId: 'aereo.orbita.completa',
  });

  const exp = logic.buildExport(state, { folio: 'IAV-1', nombreCliente: 'Cliente X' });
  assert.equal(exp.version, 2, 'version subio a 2');

  const archivo = exp.archivos.find((a) => a.tipoToma === 'orbita');
  assert.ok(archivo, 'hay un archivo de drone con shotType aereo');
  assert.equal(archivo.tipoTomaLabel, logic.getDroneShotTypes()['orbita'].label, 'lleva el label aereo (Órbita)');
  assert.equal(archivo.tipoTomaLabel, 'Órbita');
});

// ─── F18 — piso Drone + camerasForEspacio por zona + dos drones + terreno ──────

test('F18 (B): existen los dos drones por defecto, cada uno con su id propio', () => {
  const drones = logic.CAMERA_DEFAULTS.filter((c) => c.mode === 'drone');
  assert.equal(drones.length, 2, 'hay exactamente dos drones por defecto');
  const labels = drones.map((c) => c.label);
  assert.ok(labels.includes('DJI Air 3'), 'incluye DJI Air 3');
  assert.ok(labels.includes('DJI Mini 4 Pro'), 'incluye DJI Mini 4 Pro');
  const ids = drones.map((c) => c.id);
  assert.ok(ids.includes('drone-dji'), 'conserva el id legacy drone-dji (Air 3)');
  assert.ok(ids.includes('drone-mini-4-pro'), 'agrega el id del Mini 4 Pro');
  assert.equal(new Set(ids).size, ids.length, 'cada drone tiene id (consecutivo) propio');

  // En un estado nuevo, getCameras tambien expone ambos drones.
  const state = logic.createDefaultState();
  const droneState = logic.getCameras(state).filter((c) => c.mode === 'drone');
  assert.equal(droneState.length, 2, 'getCameras expone los dos drones');
});

test('F18: el piso Drone se marca de forma robusta', () => {
  // F24: el estado nuevo arranca sin pisos; el reconocimiento de "Drone" como piso
  // drone es independiente del default (el usuario lo agrega a mano).
  assert.equal(logic.createDefaultState().pisos.length, 0, 'el estado nuevo arranca sin pisos');
  assert.ok(logic.isDronePiso('Drone'), 'Drone es piso drone');
  assert.ok(logic.isDronePiso('drone'), 'reconoce variante en minusculas');
  assert.ok(!logic.isDronePiso('Exterior'), 'Exterior no es piso drone');
  assert.ok(!logic.isDronePiso(''), 'vacio no es piso drone');

  assert.ok(logic.espacioEsDrone({ piso: 'Drone' }), 'espacio en piso Drone es aereo');
  assert.ok(logic.espacioEsDrone({ kind: 'drone' }), 'espacio con kind drone es aereo');
  assert.ok(!logic.espacioEsDrone({ piso: 'Piso 1', zona: 'interior' }), 'interior no es aereo');
});

test('F18: camerasForEspacio en interiores devuelve solo Sony/Osmo (sin drone)', () => {
  const state = logic.createDefaultState();
  const espacio = { piso: 'Piso 1', zona: 'interior' };
  const cams = logic.camerasForEspacio(state, espacio);
  assert.ok(cams.length > 0, 'hay camaras');
  assert.ok(!cams.some((c) => c.mode === 'drone'), 'el drone NO aparece en interiores');
  assert.ok(cams.some((c) => c.id === 'sony-main'), 'incluye Sony principal');
  assert.ok(cams.some((c) => c.id === 'osmo-pocket-3'), 'incluye Osmo Pocket 3');
  assert.ok(!cams.some((c) => c.mode === 'asesor'), 'no incluye camaras de asesor');
});

// F35 — quita el HIBRIDO de F18: camerasForEspacio ya NO mete drone en espacios
// exteriores/roof/amenidades de cuarto. El drone vive en su propia lane; sus camaras
// se dan a los targets kind:'drone' de droneScaleTargets. Un espacio de cuarto (sea
// cual sea su zona) solo recibe camaras terrestres (Sony/Osmo).
test('F35: camerasForEspacio en exterior/roof/amenidades de cuarto NO incluye drone (solo Sony/Osmo)', () => {
  const state = logic.createDefaultState();
  for (const zona of ['exterior', 'roof', 'amenidades']) {
    const cams = logic.camerasForEspacio(state, { piso: 'Exterior', zona });
    assert.ok(!cams.some((c) => c.mode === 'drone'), zona + ': el drone NO aparece en espacios de cuarto');
    assert.ok(cams.some((c) => c.id === 'sony-main'), zona + ': incluye Sony');
    assert.ok(cams.some((c) => c.id === 'osmo-pocket-3'), zona + ': incluye Osmo');
  }
});

// F35 — las camaras drone SI se dan a un target kind:'drone' (los de droneScaleTargets).
test('F35: camerasForEspacio en un target kind:drone devuelve solo los dos drones', () => {
  const state = logic.createDefaultState();
  const cams = logic.camerasForEspacio(state, { kind: 'drone', zona: 'exterior' });
  assert.equal(cams.length, 2, 'solo los dos drones');
  assert.ok(cams.every((c) => c.mode === 'drone'), 'todas son camaras drone');
});

test('F18: camerasForEspacio en el piso Drone devuelve solo los dos drones', () => {
  const state = logic.createDefaultState();
  const cams = logic.camerasForEspacio(state, { piso: 'Drone', zona: 'exterior' });
  assert.equal(cams.length, 2, 'solo los dos drones');
  assert.ok(cams.every((c) => c.mode === 'drone'), 'todas son camaras drone');
  const ids = cams.map((c) => c.id).sort();
  assert.deepEqual(ids, ['drone-dji', 'drone-mini-4-pro']);
});

test('F18: terrenoSingleSubject representa un solo sujeto con sus tomas aereas', () => {
  const terreno = logic.terrenoSingleSubject({ guide: { tipoPropiedad: 'terreno' }, espacios: [] });
  assert.equal(terreno.isTerreno, true, 'detecta tipoPropiedad terreno');
  assert.equal(terreno.subject.nombre, 'El terreno', 'sujeto unico "El terreno"');
  assert.equal(terreno.subject.id, logic.TERRENO_SUBJECT_ID);
  assert.ok(terreno.suggestions.length > 0, 'trae tomas sugeridas');
  assert.ok(
    terreno.suggestions.every((s) => logic.getDroneShotTypes()[s.shotType]),
    'sus sugerencias usan el vocabulario aereo del terreno'
  );

  // Con otro tipo de propiedad, isTerreno es false (opt-in, no cambia el modelo).
  const casa = logic.terrenoSingleSubject({ guide: { tipoPropiedad: 'casa' }, espacios: [] });
  assert.equal(casa.isTerreno, false, 'casa no activa el sujeto unico');
});

test('F18: estado viejo sin piso Drone sigue cargando y conserva las tomas de drone', () => {
  // Estado v3 sin piso Drone, con una toma de drone ya pegada a un espacio (F2).
  const viejo = {
    version: 3,
    servicios: { foto: true, t360: true, video: true, drone: true },
    pisos: ['Exterior', 'Piso 1'],
    espacios: [
      { id: 'e1', nombre: 'Fachada', zona: 'exterior', piso: 'Exterior', estados: {} },
    ],
    cameras: [{ id: 'drone-dji', label: 'Drone DJI', mode: 'drone', kind: 'dji' }],
    activeCameraByMode: { video: 'sony-main', drone: 'drone-dji' },
    sequenceSegments: [
      { id: 'seg1', cameraId: 'drone-dji', counterWidth: 4, counterNext: 247, prefixHint: '' },
    ],
    mediaFiles: [
      { id: 'm1', cameraId: 'drone-dji', targetId: 'e1', kind: 'take', segmentId: 'seg1', fileCounter: 246 },
    ],
  };
  const norm = logic.normalizeChecklistData(viejo);

  // Migracion: el estado viejo carga y conserva sus pisos (sin forzar el piso Drone).
  assert.deepEqual(norm.pisos, ['Exterior', 'Piso 1'], 'respeta los pisos del estado viejo');
  // La toma de drone sigue pegada a su espacio.
  const file = norm.mediaFiles.find((f) => f.id === 'm1');
  assert.ok(file, 'la toma de drone no se pierde');
  assert.equal(file.targetId, 'e1', 'sigue ligada a su espacio');
  assert.equal(file.kind, 'take', 'sigue siendo una toma valida');
  // El segundo drone por defecto se agrega de forma aditiva al cargar.
  assert.ok(norm.cameras.some((c) => c.id === 'drone-mini-4-pro'), 'aparece el Mini 4 Pro al normalizar');
  assert.ok(norm.cameras.some((c) => c.id === 'drone-dji'), 'conserva el drone legacy');
});

// ─── F19 — Biblioteca de cuartos por piso/tipo + busqueda ─────────────────────

test('F19: suggestedSpacesFor casa Piso 1 trae recibidor, sala, comedor, cocina, pasillo y bano de visitas', () => {
  const chips = logic.suggestedSpacesFor({}, 'Piso 1', 'casa');
  const nombres = chips.map((c) => logic.normNombre(c.nombre));
  for (const esperado of ['recibidor', 'sala', 'comedor', 'cocina', 'pasillo', 'bano de visitas']) {
    assert.ok(nombres.includes(esperado), 'falta el chip ' + esperado + ' en Piso 1 de casa');
  }
  // Forma del retorno: cada chip trae nombre, zona, categoria, clave.
  const sala = chips.find((c) => logic.normNombre(c.nombre) === 'sala');
  assert.equal(sala.zona, 'interior');
  assert.equal(sala.categoria, 'sala');
  assert.equal(sala.clave, true);
});

test('F19: suggestedSpacesFor casa Exterior trae fachada, jardin, cochera y alberca', () => {
  const chips = logic.suggestedSpacesFor({}, 'Exterior', 'casa');
  const nombres = chips.map((c) => logic.normNombre(c.nombre));
  for (const esperado of ['fachada', 'jardin', 'cochera', 'alberca']) {
    assert.ok(nombres.includes(esperado), 'falta el chip ' + esperado + ' en Exterior de casa');
  }
});

test('F19: suggestedSpacesFor departamento Amenidades trae lobby, alberca y gimnasio', () => {
  const chips = logic.suggestedSpacesFor({}, 'Amenidades', 'departamento');
  const nombres = chips.map((c) => logic.normNombre(c.nombre));
  for (const esperado of ['lobby', 'alberca', 'gimnasio']) {
    assert.ok(nombres.includes(esperado), 'falta el chip ' + esperado + ' en Amenidades de departamento');
  }
});

test('F19: suggestedSpacesFor quinta Amenidades trae alberca y palapa', () => {
  const chips = logic.suggestedSpacesFor({}, 'Amenidades', 'quinta');
  const nombres = chips.map((c) => logic.normNombre(c.nombre));
  assert.ok(nombres.includes('alberca'), 'falta alberca en quinta amenidades');
  assert.ok(nombres.includes('palapa'), 'falta palapa en quinta amenidades');
});

test('F25: suggestedSpacesFor casa Amenidades trae set de privada/coto (alberca, gimnasio, +3 chips)', () => {
  const chips = logic.suggestedSpacesFor({}, 'Amenidades', 'casa');
  const nombres = chips.map((c) => logic.normNombre(c.nombre));
  for (const esperado of ['alberca', 'gimnasio', 'casa club', 'cancha', 'caseta / acceso']) {
    assert.ok(nombres.includes(esperado), 'falta el chip ' + esperado + ' en Amenidades de casa');
  }
  assert.ok(chips.length > 3, 'Amenidades de casa debe ofrecer mas de 3 chips, hay ' + chips.length);
});

test('F25: suggestedSpacesFor casa Amenidades conserva Roof garden y Bodega', () => {
  const chips = logic.suggestedSpacesFor({}, 'Amenidades', 'casa');
  const nombres = chips.map((c) => logic.normNombre(c.nombre));
  assert.ok(nombres.includes('roof garden'), 'debe conservar Roof garden');
  assert.ok(nombres.includes('bodega'), 'debe conservar Bodega');
});

test('F19: suggestedSpacesFor usa el tipo del guide cuando no se pasa tipoPropiedad', () => {
  const state = { guide: { tipoPropiedad: 'casa' } };
  const chips = logic.suggestedSpacesFor(state, 'Piso 1');
  assert.ok(chips.length > 0, 'debe resolver el tipo desde el guide');
  assert.ok(chips.some((c) => logic.normNombre(c.nombre) === 'sala'));
});

test('F19: suggestedSpacesFor empareja el piso sin acentos/case', () => {
  const chips = logic.suggestedSpacesFor({}, 'piso 1', 'casa');
  assert.ok(chips.length > 0, 'debe emparejar "piso 1" con "Piso 1"');
});

test('F19: suggestedSpacesFor devuelve [] para piso/tipo inexistente', () => {
  assert.deepEqual(logic.suggestedSpacesFor({}, 'Piso 9', 'casa'), []);
  assert.deepEqual(logic.suggestedSpacesFor({}, 'Piso 1', 'inexistente'), []);
});

test('F19: la biblioteca incluye Pasillo y Entrada/Recibidor con sus tomas en GUIDE_LIBRARY', () => {
  // Pasillo y Entrada/Recibidor existen como categorias con tomas sugeridas.
  assert.ok(logic.GUIDE_LIBRARY.pasillo, 'GUIDE_LIBRARY.pasillo existe');
  assert.ok(logic.GUIDE_LIBRARY.pasillo.shots.length > 0, 'pasillo tiene tomas');
  assert.ok(logic.GUIDE_LIBRARY.entrada, 'GUIDE_LIBRARY.entrada existe');
  assert.ok(logic.GUIDE_LIBRARY.entrada.shots.length > 0, 'entrada tiene tomas');

  // Y aparecen como espacios en la biblioteca indexada (categoria pasillo/entrada).
  const idx = logic.SPACE_LIBRARY_INDEX;
  const pasillo = idx.find((e) => logic.normNombre(e.nombre) === 'pasillo');
  assert.ok(pasillo, 'Pasillo esta en la biblioteca de espacios');
  assert.equal(pasillo.categoria, 'pasillo');

  const recibidor = idx.find((e) => e.categoria === 'entrada');
  assert.ok(recibidor, 'Entrada/Recibidor esta en la biblioteca de espacios');

  // Sus tomas se resuelven por categoria.
  assert.ok(logic.suggestionsForSpace('pasillo', 'Pasillo').length > 0);
  assert.ok(logic.suggestionsForSpace('entrada', 'Recibidor').length > 0);
});

test('F19: searchSpaces empareja sin acentos y case-insensitive', () => {
  const r1 = logic.searchSpaces('recamara');
  assert.ok(r1.some((e) => e.kind === 'match' && logic.normNombre(e.nombre) === 'recamara principal'),
    'encuentra "Recámara principal" buscando sin acento');

  const r2 = logic.searchSpaces('COCINA');
  assert.ok(r2.some((e) => e.kind === 'match' && logic.normNombre(e.nombre) === 'cocina'),
    'es case-insensitive');

  const r3 = logic.searchSpaces('jardín');
  assert.ok(r3.some((e) => e.kind === 'match' && logic.normNombre(e.nombre) === 'jardin'),
    'empareja query con acento contra biblioteca sin acento');
});

test('F19: searchSpaces ofrece "crear nuevo" para texto sin coincidencia', () => {
  const r = logic.searchSpaces('cava de vinos');
  const create = r.find((e) => e.kind === 'create');
  assert.ok(create, 'incluye la opcion crear nuevo');
  assert.equal(create.id, 'create-nuevo');
  assert.equal(create.nombre, 'cava de vinos', 'conserva el texto original (con acentos)');
  assert.ok(!r.some((e) => e.kind === 'match'), 'no hay coincidencias para texto inexistente');
});

test('F19: searchSpaces siempre anexa "crear nuevo" cuando hay query, aun con coincidencias', () => {
  const r = logic.searchSpaces('sala');
  assert.ok(r.some((e) => e.kind === 'match'), 'hay coincidencias');
  assert.equal(r[r.length - 1].kind, 'create', 'la ultima entrada es crear nuevo');
});

test('F19: searchSpaces con query vacio devuelve toda la biblioteca sin crear nuevo', () => {
  const r = logic.searchSpaces('');
  assert.ok(r.length > 0);
  assert.ok(r.every((e) => e.kind === 'match'), 'sin opcion crear nuevo con query vacio');
  assert.equal(r.length, logic.SPACE_LIBRARY_INDEX.length, 'devuelve la biblioteca completa');
});

test('F19: searchSpaces deduplica espacios repetidos entre pisos/tipos', () => {
  const r = logic.searchSpaces('sala');
  const salas = r.filter((e) => e.kind === 'match' && logic.normNombre(e.nombre) === 'sala');
  assert.equal(salas.length, 1, 'Sala aparece una sola vez aunque este en varios tipos');
});

test('F19: cambios aditivos: version export sigue en 1 y normalizeChecklistData carga estado viejo', () => {
  const state = logic.createDefaultState();
  const exp = logic.buildExport(state);
  assert.equal(exp.version, 2, 'el export subio a version 2');
  const norm = logic.normalizeChecklistData({ espacios: [], servicios: {} });
  assert.ok(norm, 'normalizeChecklistData sigue cargando estado viejo');
});

test('F24: el estado nuevo arranca sin pisos', () => {
  const state = logic.createDefaultState();
  assert.ok(Array.isArray(state.pisos), 'pisos es un array');
  assert.deepEqual(state.pisos, [], 'pisos arranca vacio');
});

test('F24: normalizeChecklistData conserva un pisos explicito sin pisarlo', () => {
  const norm = logic.normalizeChecklistData({
    version: 3,
    pisos: ['Exterior', 'Piso 1'],
    espacios: [{ id: 'e1', nombre: 'Sala', zona: 'interior', piso: 'Piso 1', estados: {} }],
  });
  assert.deepEqual(norm.pisos, ['Exterior', 'Piso 1'], 'respeta los pisos explicitos del estado entrante');
});

test('F24: normalizeChecklistData respeta un pisos vacio explicito', () => {
  // El flujo nuevo guarda estado con pisos:[] a proposito; no debe derivarse.
  const norm = logic.normalizeChecklistData({
    version: 3,
    pisos: [],
    espacios: [{ id: 'e1', nombre: 'Sala', zona: 'interior', piso: 'Piso 1', estados: {} }],
  });
  assert.deepEqual(norm.pisos, [], 'respeta el pisos vacio puesto a proposito');
});

test('F24: estado legacy SIN pisos deriva los pisos de los espacios', () => {
  const norm = logic.normalizeChecklistData({
    version: 3,
    espacios: [
      { id: 'a', nombre: 'Fachada', zona: 'exterior', piso: 'Exterior', estados: {} },
      { id: 'b', nombre: 'Sala', zona: 'interior', piso: 'Piso 1', estados: {} },
      { id: 'c', nombre: 'Cocina', zona: 'interior', piso: 'Piso 1', estados: {} },
    ],
  });
  assert.deepEqual(norm.pisos, ['Exterior', 'Piso 1'], 'deriva los pisos de los espacios cuando pisos viene ausente');
});

// ─── F28: Fusión Push/Pull + sentido/pared + migración + export ──────────────

test('F28: CURATED_MOVEMENTS tiene 6, incluye push_pull y no push_in/pull_out', () => {
  assert.equal(logic.CURATED_MOVEMENTS.length, 6);
  assert.ok(logic.CURATED_MOVEMENTS.includes('push_pull'));
  assert.ok(!logic.CURATED_MOVEMENTS.includes('push_in'));
  assert.ok(!logic.CURATED_MOVEMENTS.includes('pull_out'));
  assert.deepEqual(logic.CURATED_MOVEMENTS, ['push_pull', 'pan', 'tilt', 'travel', 'orbit', 'reveal']);
});

test('F28: push_pull sigue en MOVEMENTS con label exacto y push_in/pull_out se conservan', () => {
  assert.equal(logic.MOVEMENTS.push_pull.label, 'Push/Pull');
  assert.ok(logic.MOVEMENTS.push_in, 'push_in conservado por compatibilidad');
  assert.ok(logic.MOVEMENTS.pull_out, 'pull_out conservado por compatibilidad');
});

test('F28: helpers/labels de sentido y pared', () => {
  assert.deepEqual(logic.SENTIDO_OPTS, ['in', 'out']);
  assert.equal(logic.sentidoLabel('in'), 'Push in');
  assert.equal(logic.sentidoLabel('out'), 'Pull out');
  assert.deepEqual(logic.PARED_OPTS, ['izq', 'der']);
  assert.equal(logic.paredLabel('izq'), 'Izquierda');
  assert.equal(logic.paredLabel('der'), 'Derecha');
});

test('F28: migración push_in -> push_pull + sentido in', () => {
  const viejo = {
    version: 3,
    espacios: [{ id: 'e1', nombre: 'Sala', zona: 'interior', piso: 'Piso 1', estados: {} }],
    mediaFiles: [{ id: 'm1', cameraId: 'sony-main', targetId: 'e1', kind: 'take', fileToken: 'PIB0001', movement: 'push_in' }],
    cameras: [],
    sequenceSegments: [],
  };
  const s = logic.normalizeChecklistData(viejo);
  const m = s.mediaFiles.find((x) => x.id === 'm1');
  assert.equal(m.movement, 'push_pull');
  assert.equal(m.sentido, 'in');
});

test('F28: migración pull_out -> push_pull + sentido out', () => {
  const viejo = {
    version: 3,
    espacios: [{ id: 'e1', nombre: 'Sala', zona: 'interior', piso: 'Piso 1', estados: {} }],
    mediaFiles: [{ id: 'm1', cameraId: 'sony-main', targetId: 'e1', kind: 'take', fileToken: 'PIB0001', movement: 'pull_out' }],
    cameras: [],
    sequenceSegments: [],
  };
  const s = logic.normalizeChecklistData(viejo);
  const m = s.mediaFiles.find((x) => x.id === 'm1');
  assert.equal(m.movement, 'push_pull');
  assert.equal(m.sentido, 'out');
});

test('F28: movimientos distintos a push_in/pull_out no se tocan en la migración', () => {
  const viejo = {
    version: 3,
    espacios: [{ id: 'e1', nombre: 'Sala', zona: 'interior', piso: 'Piso 1', estados: {} }],
    mediaFiles: [{ id: 'm1', cameraId: 'sony-main', targetId: 'e1', kind: 'take', fileToken: 'PIB0001', movement: 'reveal' }],
    cameras: [],
    sequenceSegments: [],
  };
  const s = logic.normalizeChecklistData(viejo);
  const m = s.mediaFiles.find((x) => x.id === 'm1');
  assert.equal(m.movement, 'reveal');
  assert.equal(m.sentido, null);
});

test('F28: export de push_pull con sentido in lleva token y campo discreto', () => {
  let s = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  s.espacios[0].piso = 'Piso 1';
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  s = logic.registerMediaFile(s, { cameraId: 'sony-main', targetId: s.espacios[0].id, kind: 'take', movement: 'push_pull', sentido: 'in' });
  const exp = logic.buildExport(s, {});
  const a = exp.archivos[0];
  assert.equal(a.sentido, 'in');
  assert.equal(a.sentidoLabel, 'Push in');
  assert.ok(a.premiere.Description.includes('Push/Pull (in)'), a.premiere.Description);
});

test('F28: export de reveal con pared izq lleva token y campo discreto', () => {
  let s = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  s.espacios[0].piso = 'Piso 1';
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  s = logic.registerMediaFile(s, { cameraId: 'sony-main', targetId: s.espacios[0].id, kind: 'take', movement: 'reveal', pared: 'izq' });
  const exp = logic.buildExport(s, {});
  const a = exp.archivos[0];
  assert.equal(a.pared, 'izq');
  assert.equal(a.paredLabel, 'Izquierda');
  assert.ok(a.premiere.Description.includes('Reveal · pared izq'), a.premiere.Description);
});

test('F28: buildExport version es 2 con sentido/pared', () => {
  let s = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  s = logic.registerMediaFile(s, { cameraId: 'sony-main', targetId: s.espacios[0].id, kind: 'take', movement: 'push_pull', sentido: 'out' });
  const exp = logic.buildExport(s, {});
  assert.equal(exp.version, 2);
});

test('F28: estado viejo sin sentido/pared carga sin romper (default null)', () => {
  const viejo = {
    version: 3,
    espacios: [{ id: 'e1', nombre: 'Sala', zona: 'interior', piso: 'Piso 1', estados: {} }],
    mediaFiles: [{ id: 'm1', cameraId: 'sony-main', targetId: 'e1', kind: 'take', fileToken: 'PIB0001', movement: 'pan' }],
    cameras: [],
    sequenceSegments: [],
  };
  const s = logic.normalizeChecklistData(viejo);
  const m = s.mediaFiles.find((x) => x.id === 'm1');
  assert.equal(m.sentido, null);
  assert.equal(m.pared, null);
});

// ─── F32 — Sinonimos por categoria en searchSpaces + cuartos nuevos + servicio ──

test('F32: searchSpaces("habitacion") incluye al menos una Recamara (kind:match)', () => {
  const res = logic.searchSpaces('habitacion');
  const rec = res.filter((r) => r.kind === 'match' && /rec[aá]mara/i.test(r.nombre));
  assert.ok(rec.length >= 1, JSON.stringify(res.map((r) => r.nombre)));
});

test('F32: searchSpaces("balcon") incluye Balcon/Terraza', () => {
  const res = logic.searchSpaces('balcon');
  const hit = res.some((r) => r.kind === 'match' && /(balc[oó]n|terraza)/i.test(r.nombre));
  assert.ok(hit, JSON.stringify(res.map((r) => r.nombre)));
});

test('F32: searchSpaces("cava") incluye Cava (via EXTRA_SPACES)', () => {
  const res = logic.searchSpaces('cava');
  const hit = res.some((r) => r.kind === 'match' && logic.normNombre(r.nombre) === 'cava');
  assert.ok(hit, JSON.stringify(res.map((r) => r.nombre)));
});

test('F32: suggestedSpacesFor casa Piso 1 incluye Antecomedor y Cuarto de servicio', () => {
  const s = logic.createDefaultState();
  const chips = logic.suggestedSpacesFor(s, 'Piso 1', 'casa');
  const nombres = chips.map((c) => c.nombre);
  assert.ok(nombres.includes('Antecomedor'), JSON.stringify(nombres));
  assert.ok(nombres.includes('Cuarto de servicio'), JSON.stringify(nombres));
});

test('F32: suggestedSpacesFor NO incluye Cava en ningun piso/tipo', () => {
  const s = logic.createDefaultState();
  for (const tipo of Object.keys(logic.SPACE_LIBRARY_BY_FLOOR)) {
    for (const piso of Object.keys(logic.SPACE_LIBRARY_BY_FLOOR[tipo])) {
      const chips = logic.suggestedSpacesFor(s, piso, tipo);
      assert.ok(!chips.some((c) => logic.normNombre(c.nombre) === 'cava'), `${tipo}/${piso}`);
    }
  }
});

test('F32: la categoria servicio existe en getRoomCategories()', () => {
  const cat = logic.getRoomCategories().find((c) => c.id === 'servicio');
  assert.ok(cat, 'falta categoria servicio');
  assert.equal(cat.label, 'Cuarto de servicio');
});

test('F32: detectCategoria("cuarto de servicio") y sus tomas no truenan', () => {
  const cat = logic.detectCategoria('cuarto de servicio');
  assert.ok(typeof cat === 'string' && cat.length > 0);
  const tomasServicio = logic.suggestionsForSpace('servicio', 'Cuarto de servicio');
  assert.ok(Array.isArray(tomasServicio) && tomasServicio.length >= 1);
});

test('F32: version sigue siendo 1 y estado viejo carga sin romper', () => {
  const exp = logic.buildExport(logic.createDefaultState(), {});
  assert.equal(exp.version, 2);
  const viejo = {
    version: 3,
    espacios: [{ id: 'e1', nombre: 'Sala', zona: 'interior', piso: 'Piso 1', estados: {} }],
    mediaFiles: [],
    cameras: [],
    sequenceSegments: [],
  };
  const s = logic.normalizeChecklistData(viejo);
  assert.equal(s.espacios[0].nombre, 'Sala');
});

// ─── F34 — Escalas de drone + pool de tomas aereas + suggestionsForTarget ───────

test('F34: DRONE_SCALES define las 4 escalas con ids sin acentos y labels con acentos', () => {
  const ids = logic.DRONE_SCALES.map((e) => e.id);
  assert.deepEqual(ids, ['propiedad', 'amenidades', 'inmediato', 'ubicacion']);
  const labels = logic.DRONE_SCALES.map((e) => e.label);
  assert.ok(labels.includes('Propiedad'));
  assert.ok(labels.includes('Amenidades'));
  assert.ok(labels.includes('Inmediato / colonia'));
  assert.ok(labels.includes('Ubicación / contexto'));
  // ids sin acentos: ningun id contiene caracteres acentuados.
  for (const id of ids) assert.equal(id, id.normalize('NFD').replace(/[̀-ͯ]/g, ''));
});

test('F34: el pool aereo NO contiene golden hour', () => {
  for (const shot of logic.AERIAL_POOL) {
    const hay = (shot.id + ' ' + shot.label).toLowerCase();
    assert.ok(!hay.includes('golden'), 'sin golden en ' + shot.id);
    assert.ok(!hay.includes('hora dorada'), 'sin hora dorada en ' + shot.id);
    assert.ok(!hay.includes('atardecer'), 'sin atardecer en ' + shot.id);
  }
});

test('F34: cada toma del pool tiene la forma esperada y shotType aereo valido', () => {
  const droneTypes = logic.getDroneShotTypes();
  const scaleIds = new Set(logic.DRONE_SCALES.map((e) => e.id));
  const validTipos = new Set(['casa', 'quinta', 'departamento', 'terreno', 'all']);
  for (const shot of logic.AERIAL_POOL) {
    assert.equal(typeof shot.id, 'string');
    assert.equal(typeof shot.label, 'string');
    // El texto visible se resuelve por `nombre` (UI/export); debe existir, igual al
    // label, y NUNCA ser el id crudo (regresion del bug "pool.aereo.* en pantalla").
    assert.equal(shot.nombre, shot.label, shot.id + ': nombre = label');
    assert.notEqual(shot.nombre, shot.id, shot.id + ': nombre no es el id crudo');
    assert.ok(droneTypes[shot.shotType], shot.id + ': shotType aereo valido ' + shot.shotType);
    assert.equal(typeof shot.movement, 'string');
    assert.ok(scaleIds.has(shot.scale), shot.id + ': scale valida ' + shot.scale);
    assert.equal(typeof shot.must, 'boolean');
    assert.ok(Array.isArray(shot.tipos) && shot.tipos.every((t) => validTipos.has(t)), shot.id + ': tipos validos');
  }
});

test('F34: "Salida a contexto" es must y aplica a todos los tipos', () => {
  const salida = logic.AERIAL_POOL.find((s) => s.id === 'pool.aereo.salida_contexto');
  assert.ok(salida, 'existe la canonica Salida a contexto');
  assert.equal(salida.label, 'Salida a contexto');
  assert.equal(salida.must, true);
  assert.deepEqual(salida.tipos, ['all']);
  assert.equal(salida.scale, 'propiedad', 'la porta un target fijo property-wide');

  // Aparece como sugerencia de la escala propiedad en TODOS los tipos.
  for (const tipo of ['casa', 'quinta', 'departamento', 'terreno']) {
    const state = { guide: { tipoPropiedad: tipo } };
    const sugs = logic.suggestionsForTarget(state, 'drone', { id: 't', scale: 'propiedad' });
    const found = sugs.find((s) => s.label === 'Salida a contexto');
    assert.ok(found, 'Salida a contexto sugerida en ' + tipo);
    assert.equal(found.must, true);
  }
});

test('F34: suggestionsForTarget por escala devuelve lo esperado, must primero', () => {
  const state = { guide: { tipoPropiedad: 'casa' } };

  const propiedad = logic.suggestionsForTarget(state, 'drone', { id: 'p', scale: 'propiedad' });
  assert.ok(propiedad.length > 0);
  // must primero: ningun must aparece despues de un no-must.
  let vistoNoMust = false;
  for (const s of propiedad) {
    if (s.must !== true) vistoNoMust = true;
    else assert.ok(!vistoNoMust, 'must antes que no-must en ' + s.id);
  }
  assert.ok(propiedad.some((s) => s.label === 'Fachada aérea'));
  assert.ok(propiedad.some((s) => s.label === 'Órbita de la casa'));

  const inmediato = logic.suggestionsForTarget(state, 'drone', { id: 'i', scale: 'inmediato' });
  assert.ok(inmediato.every((s) => s.scale === 'inmediato'));
  assert.ok(inmediato.some((s) => s.label === 'Calle y acceso'));

  const ubicacion = logic.suggestionsForTarget(state, 'drone', { id: 'u', scale: 'ubicacion' });
  assert.ok(ubicacion.every((s) => s.scale === 'ubicacion'));
  assert.ok(ubicacion.some((s) => s.label === 'Ubicación en la ciudad'));
});

test('F34: suggestionsForTarget de un feature derivado devuelve su vocabulario aereo, must primero', () => {
  const state = { guide: { tipoPropiedad: 'casa' } };
  const alberca = logic.suggestionsForTarget(state, 'drone', { id: 'drone-feat-x', nombre: 'Alberca aérea', feature: 'alberca' });
  assert.ok(alberca.length > 0, 'el feature alberca trae vocabulario');
  assert.ok(alberca.every((s) => logic.getDroneShotTypes()[s.shotType]), 'todas son tomas aereas');

  // Tambien se resuelve por nombre del espacio (sin feature explicito).
  const porNombre = logic.aerialVocabForFeature('Alberca comun');
  assert.ok(porNombre.length > 0);
  assert.equal(logic.aerialFeatureKeyFromName('Jardin trasero'), 'jardin');
  assert.equal(logic.aerialFeatureKeyFromName('Sala interior'), null);
});

test('F34: terreno tiene su lista unica de 14 tomas', () => {
  const terreno = logic.AERIAL_POOL.filter((s) => s.tipos.includes('terreno'));
  assert.equal(terreno.length, 14, 'terreno = 14 tomas');
  const musts = terreno.filter((s) => s.must === true);
  assert.equal(musts.length, 7, 'terreno tiene 7 must');
  const labels = terreno.map((s) => s.label);
  for (const esperado of [
    'Cenital de límites', 'Establecimiento desde altura', 'Referencia de escala',
    'Acceso / frente a calle', 'Vista que vende', 'Dónde iría la casa', 'Salida a contexto',
  ]) {
    assert.ok(labels.includes(esperado), 'terreno incluye must: ' + esperado);
  }
});

test('F34: findSuggestion resuelve ids aereos viejos (compat) y tomas del pool nuevo', () => {
  // id aereo viejo de AERIAL_SUBJECTS.
  const viejo = logic.findSuggestion('aereo.alberca.cenital');
  assert.ok(viejo, 'resuelve aereo.alberca.cenital');
  assert.equal(viejo.id, 'aereo.alberca.cenital');

  const viejo2 = logic.findSuggestion('aereo.fachada.establecimiento');
  assert.ok(viejo2, 'resuelve aereo.fachada.establecimiento');

  // toma del pool nuevo.
  const nuevo = logic.findSuggestion('pool.aereo.salida_contexto');
  assert.ok(nuevo, 'resuelve toma del pool nuevo');
  assert.equal(nuevo.label, 'Salida a contexto');

  // los no-existentes siguen siendo null.
  assert.equal(logic.findSuggestion('aereo.no.existe'), null);
});

test('F34: suggestionsForTarget conserva el comportamiento viejo por nombre y por tipo', () => {
  // Estado viejo: target sin scale ni feature, empareja por nombre (F17).
  const state = logic.addSpacesFromText(logic.createDefaultState(), 'Fachada aerea');
  const target = state.espacios[0];
  const drone = logic.suggestionsForTarget(state, 'drone', target);
  assert.ok(drone.some((s) => s.id === 'aereo.fachada.establecimiento'), 'sigue usando el vocabulario aereo viejo por nombre');

  // Sin match por nombre cae al comportamiento por tipo de propiedad.
  let s2 = logic.addSpacesFromText(logic.createDefaultState(), 'Cuarto raro');
  s2.guide = Object.assign({}, s2.guide, { tipoPropiedad: 'casa' });
  const drone2 = logic.suggestionsForTarget(s2, 'drone', s2.espacios[0]);
  assert.deepEqual(drone2.map((x) => x.id), logic.suggestionsForDrone('casa').map((x) => x.id));
});

test('F34: version es 2 (archivos[] de buildExport intacto)', () => {
  const exp = logic.buildExport(logic.createDefaultState(), {});
  assert.equal(exp.version, 2);
});

// ─── F35 — derivar targets de drone de espacios reales + migracion ──────────

test('F35: createDefaultState no expone guide.incluirDrone (campo migrado a servicios.drone)', () => {
  const state = logic.createDefaultState();
  assert.strictEqual(state.guide.incluirDrone, undefined, 'guide.incluirDrone ya no existe en el default');
  assert.strictEqual(state.servicios.drone, true, 'servicios.drone es la fuente de verdad (default true)');
});

test('F35: droneFeatureTargets deriva "Alberca aérea" y "Jardín aérea" cuando existen', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Alberca\nJardín\nFachada', { zona: 'exterior' });
  const feats = logic.droneFeatureTargets(state);
  const nombres = feats.map((t) => t.nombre);
  assert.ok(nombres.includes('Alberca aérea'), 'deriva Alberca aérea');
  assert.ok(nombres.includes('Jardín aérea'), 'deriva Jardín aérea');
  // El feature derivado se infiere del nombre.
  const alberca = feats.find((t) => t.nombre === 'Alberca aérea');
  assert.equal(alberca.feature, 'alberca');
  assert.equal(alberca.scale, 'propiedad');
  assert.equal(alberca.kind, 'drone');
  assert.ok(alberca.featOf, 'apunta al espacio del que deriva');
});

test('F35: droneFeatureTargets NO deriva interiores ni espacios inexistentes', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala\nCocina'); // zona interior por defecto
  const feats = logic.droneFeatureTargets(state);
  assert.equal(feats.length, 0, 'no deriva targets aereos de interiores');

  // Sin alberca no hay "Alberca aérea".
  let s2 = logic.createDefaultState();
  s2 = logic.addSpacesFromText(s2, 'Jardín', { zona: 'exterior' });
  const f2 = logic.droneFeatureTargets(s2);
  assert.ok(!f2.some((t) => t.nombre === 'Alberca aérea'), 'sin alberca no hay Alberca aérea');
  assert.ok(f2.some((t) => t.nombre === 'Jardín aérea'), 'pero si hay Jardín aérea');
});

test('F35: droneScaleTargets incluye derivados + fijos + kind:drone preexistentes, sin duplicados', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Alberca', { zona: 'exterior' });
  // un espacio kind:'drone' preexistente (drone-piso viejo).
  state.espacios.push({ id: 'old-drone-1', nombre: 'Fachada aerea vieja', kind: 'drone', zona: 'exterior', estados: {} });
  const targets = logic.droneScaleTargets(state);
  const ids = targets.map((t) => t.id);
  // derivados.
  const albercaId = state.espacios.find((e) => e.nombre === 'Alberca').id;
  assert.ok(ids.includes('drone-feat-' + albercaId), 'incluye el feature derivado de la alberca');
  // fijos property-wide + contexto.
  assert.ok(ids.includes('drone-fixed-salida-contexto'), 'incluye Salida a contexto');
  assert.ok(ids.includes('drone-fixed-fachada-orbita'), 'incluye Fachada/Órbita');
  assert.ok(ids.includes('drone-fixed-cenital-giratorio'), 'incluye Cenital giratorio');
  assert.ok(ids.includes('drone-fixed-inmediato'), 'incluye Inmediato');
  assert.ok(ids.includes('drone-fixed-ubicacion'), 'incluye Ubicación');
  // camino de compat.
  assert.ok(ids.includes('old-drone-1'), 'incluye el espacio kind:drone preexistente');
  // sin duplicados.
  assert.equal(new Set(ids).size, ids.length, 'no hay ids duplicados');
  // todos los targets de drone son kind:'drone'.
  assert.ok(targets.every((t) => t.kind === 'drone'), 'todos los targets son kind:drone');
});

test('F35: escala amenidades presente solo donde aplica', () => {
  // Departamento: amenidades aplica por tipo.
  let depto = logic.createDefaultState();
  depto.guide = Object.assign({}, depto.guide, { tipoPropiedad: 'departamento' });
  depto = logic.addSpacesFromText(depto, 'Roof garden', { zona: 'amenidades' });
  assert.equal(logic.droneAmenidadesAplica(depto), true, 'depto: amenidades aplica');
  const tD = logic.droneScaleTargets(depto);
  assert.ok(tD.some((t) => t.scale === 'amenidades'), 'depto incluye targets de amenidades');

  // Casa sin subtipo ni espacios de amenidad: no aplica.
  let casa = logic.createDefaultState();
  casa.guide = Object.assign({}, casa.guide, { tipoPropiedad: 'casa' });
  casa = logic.addSpacesFromText(casa, 'Jardín', { zona: 'exterior' });
  assert.equal(logic.droneAmenidadesAplica(casa), false, 'casa simple: amenidades no aplica');
  const tC = logic.droneScaleTargets(casa);
  assert.ok(!tC.some((t) => t.scale === 'amenidades'), 'casa simple no incluye amenidades');

  // Casa con un espacio real de zona amenidades: si aplica.
  let casa2 = logic.createDefaultState();
  casa2.guide = Object.assign({}, casa2.guide, { tipoPropiedad: 'casa' });
  casa2 = logic.addSpacesFromText(casa2, 'Casa club', { zona: 'amenidades' });
  assert.equal(logic.droneAmenidadesAplica(casa2), true, 'casa con amenidad real: aplica');
});

// F38 — REEMPLAZA al test F35 que igualaba targetsForMode('drone') a droneScaleTargets
// (multiples targets de escala). El modelo cambio a SESION UNICA: targetsForMode('drone')
// ya NO devuelve los multiples targets de escala; devuelve el target unico de sesion
// (+ kind:'drone' viejos por compat, que aqui no existen). droneScaleTargets se conserva
// como helper exportado (compat con HTML/estado viejo) pero ya no alimenta targetsForMode.
test('F38: targetsForMode("drone") devuelve el target unico de sesion (no droneScaleTargets)', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala\nAlberca', { zona: 'exterior' });
  const fromMode = logic.targetsForMode(state, 'drone');
  // Un solo target de sesion.
  assert.equal(fromMode.length, 1, 'un unico target de sesion');
  assert.equal(fromMode[0].id, 'drone-session', 'es el target de sesion');
  // Y NO es la lista de multiples targets de escala (droneScaleTargets sigue devolviendo varios).
  const direct = logic.droneScaleTargets(state).map((t) => t.id);
  assert.ok(direct.length > 1, 'droneScaleTargets aun expone varios (helper de compat)');
  assert.notDeepEqual(fromMode.map((t) => t.id), direct, 'targetsForMode drone ya NO es droneScaleTargets');
  // y NO es state.espacios.
  const espIds = state.espacios.map((e) => e.id);
  assert.ok(!fromMode.some((t) => espIds.includes(t.id)), 'ningun target es un espacio de cuarto');
  // video sigue devolviendo espacios.
  assert.deepEqual(logic.targetsForMode(state, 'video'), state.espacios);
});

test('F35: camerasForEspacio NO mete drone en interiores ni en exteriores/roof/amenidades de cuarto', () => {
  const state = logic.createDefaultState();
  for (const zona of ['interior', 'exterior', 'roof', 'amenidades']) {
    const cams = logic.camerasForEspacio(state, { zona });
    assert.ok(!cams.some((c) => c.mode === 'drone'), zona + ': sin drone en espacio de cuarto');
    assert.ok(cams.some((c) => c.id === 'sony-main'), zona + ': con Sony');
  }
  // SI da drones a un target kind:'drone'.
  const droneCams = logic.camerasForEspacio(state, { kind: 'drone', zona: 'exterior' });
  assert.equal(droneCams.length, 2, 'el target kind:drone recibe los dos drones');
  assert.ok(droneCams.every((c) => c.mode === 'drone'));
});

test('F35: servicios.drone se infiere true al cargar estado viejo con drone (espacio kind:drone)', () => {
  const viejo = {
    version: 3,
    espacios: [{ id: 'd1', nombre: 'Fachada aerea', kind: 'drone', zona: 'exterior', piso: 'Drone', estados: {} }],
    mediaFiles: [],
    cameras: [],
    sequenceSegments: [],
  };
  const norm = logic.normalizeChecklistData(viejo);
  assert.equal(norm.servicios.drone, true, 'se infiere true por espacio kind:drone');
  assert.strictEqual(norm.guide.incluirDrone, undefined, 'guide.incluirDrone ya no existe');
});

test('F35: servicios.drone se infiere true al cargar estado viejo con mediaFile de camara drone', () => {
  const viejo = {
    version: 3,
    espacios: [{ id: 'e1', nombre: 'Fachada', zona: 'exterior', piso: 'Exterior', estados: {} }],
    mediaFiles: [{ id: 'm1', cameraId: 'drone-dji', targetId: 'e1', kind: 'take', fileToken: 'DJI0001' }],
    cameras: [{ id: 'drone-dji', label: 'Drone DJI', mode: 'drone', kind: 'dji' }],
    sequenceSegments: [],
  };
  const norm = logic.normalizeChecklistData(viejo);
  assert.equal(norm.servicios.drone, true, 'se infiere true por mediaFile de camara drone');
  assert.strictEqual(norm.guide.incluirDrone, undefined, 'guide.incluirDrone ya no existe');
});

test('F35: sin rastro de drone servicios.drone queda segun SERVICES_DEFAULT; guide.incluirDrone legacy=false se respeta como drone=false', () => {
  const sinDrone = {
    version: 3,
    espacios: [{ id: 'e1', nombre: 'Sala', zona: 'interior', piso: 'Piso 1', estados: {} }],
    mediaFiles: [],
    cameras: [],
    sequenceSegments: [],
    servicios: { drone: false },
  };
  const norm1 = logic.normalizeChecklistData(sinDrone);
  assert.equal(norm1.servicios.drone, false, 'sin rastro y servicios.drone:false -> false');
  assert.strictEqual(norm1.guide.incluirDrone, undefined, 'guide.incluirDrone ya no existe');

  // Si ya venia guide.incluirDrone=false (campo legacy) y servicios.drone no era true, se respeta como false.
  const conCampoFalse = {
    version: 3,
    guide: { tipoPropiedad: null, descripcion: '', proposal: null, incluirDrone: false },
    espacios: [{ id: 'd1', nombre: 'Aerea', kind: 'drone', zona: 'exterior', estados: {} }],
    mediaFiles: [],
    cameras: [],
    sequenceSegments: [],
    servicios: { drone: false },
  };
  const norm2 = logic.normalizeChecklistData(conCampoFalse);
  assert.equal(norm2.servicios.drone, false, 'incluirDrone:false legacy + servicios.drone:false -> drone false');
  assert.strictEqual(norm2.guide.incluirDrone, undefined, 'guide.incluirDrone removido');
});

test('F35 MIGRACION: estado viejo drone-piso + 1 toma -> la toma NO queda omitted y su target es alcanzable', () => {
  const viejo = {
    version: 3,
    espacios: [
      // pseudo-cuarto de drone viejo (F17/F18): kind:'drone' / piso 'Drone'.
      { id: 'drone-old', nombre: 'Fachada aerea', kind: 'drone', zona: 'exterior', piso: 'Drone', estados: {} },
    ],
    cameras: [{ id: 'drone-dji', label: 'Drone DJI', mode: 'drone', kind: 'dji' }],
    activeCameraByMode: { video: 'sony-main', drone: 'drone-dji' },
    sequenceSegments: [
      { id: 'seg1', cameraId: 'drone-dji', counterWidth: 4, counterNext: 247, prefixHint: '' },
    ],
    mediaFiles: [
      { id: 'm1', cameraId: 'drone-dji', targetId: 'drone-old', kind: 'take', segmentId: 'seg1', fileCounter: 246 },
    ],
  };
  const norm = logic.normalizeChecklistData(viejo);
  const file = norm.mediaFiles.find((f) => f.id === 'm1');
  assert.ok(file, 'la toma sobrevive');
  // (a) NO quedo omitted y conserva su targetId.
  assert.equal(file.kind, 'take', 'la toma NO quedo omitted');
  assert.equal(file.targetId, 'drone-old', 'conserva su targetId');
  // (b) el target sigue siendo alcanzable via targetsForMode('drone').
  const alcanzable = logic.targetsForMode(norm, 'drone').some((t) => t.id === 'drone-old');
  assert.ok(alcanzable, 'el target viejo es alcanzable en la lane de drone');
  // y servicios.drone queda en true para que la lane lo muestre.
  assert.equal(norm.servicios.drone, true, 'servicios.drone inferido true por rastro de drone');
  assert.strictEqual(norm.guide.incluirDrone, undefined, 'guide.incluirDrone ya no existe');
});

test('F35: el sujeto terreno expone las 14 tomas y version:1 intacto', () => {
  const state = { guide: { tipoPropiedad: 'terreno' }, espacios: [] };
  const terreno = logic.terrenoSingleSubject(state);
  const sugs = logic.suggestionsForTarget(state, 'drone', terreno.subject);
  assert.equal(sugs.length, 14, 'el sujeto terreno expone las 14 tomas del pool nuevo');
  assert.equal(sugs.filter((s) => s.must === true).length, 7, '7 must, must primero');
  assert.ok(sugs.slice(0, 7).every((s) => s.must === true), 'los 7 must van primero');

  const exp = logic.buildExport(logic.createDefaultState(), {});
  assert.equal(exp.version, 2, 'version:2 (archivos[] intacto)');
});

// ─── F38 — sesion unica de drone: target unico + lista ordenada de sugerencias ─

test('F38: droneSessionSubject de una casa es el target unico de sesion (kind:drone)', () => {
  let state = logic.createDefaultState();
  state.guide = Object.assign({}, state.guide, { tipoPropiedad: 'casa' });
  const sesion = logic.droneSessionSubject(state);
  assert.equal(sesion.id, 'drone-session');
  assert.equal(sesion.kind, 'drone');
  assert.equal(sesion.nombre, 'Sesión de drone');
});

test('F38: droneSessionSubject de un terreno ES el sujeto terreno (no se duplica)', () => {
  const state = { guide: { tipoPropiedad: 'terreno' }, espacios: [] };
  const sesion = logic.droneSessionSubject(state);
  assert.equal(sesion.id, logic.TERRENO_SUBJECT_ID, 'reusa el sujeto terreno, no crea uno nuevo');
});

test('F38: droneSessionSuggestions de una casa incluye fijas + UNA por espacio exterior/amenidad', () => {
  let state = logic.createDefaultState();
  state.guide = Object.assign({}, state.guide, { tipoPropiedad: 'casa' });
  state = logic.addSpacesFromText(state, 'Alberca\nJardín', { zona: 'amenidades' });
  // sube Jardín a exterior, Alberca queda amenidad. Reasignamos zonas a mano.
  state.espacios.find((e) => e.nombre === 'Jardín').zona = 'exterior';
  state.espacios.find((e) => e.nombre === 'Alberca').zona = 'amenidades';
  // un interior NO debe aportar ninguna toma.
  state = logic.addSpacesFromText(state, 'Recibidor'); // interior por defecto
  const sugs = logic.droneSessionSuggestions(state);
  const nombres = sugs.map((s) => s.nombre);

  // Fijas: incluye la canonica "Salida a contexto".
  assert.ok(nombres.includes('Salida a contexto'), 'incluye la fija Salida a contexto');
  assert.ok(sugs.some((s) => s.label === 'Fachada aérea'), 'incluye fijas property-wide de casa');

  // Derivadas: EXACTAMENTE una "Alberca …" y una "Jardín …".
  const albercaTomas = sugs.filter((s) => /^Alberca\b/.test(s.nombre));
  const jardinTomas = sugs.filter((s) => /^Jardín\b/.test(s.nombre));
  assert.equal(albercaTomas.length, 1, 'exactamente UNA toma de Alberca');
  assert.equal(jardinTomas.length, 1, 'exactamente UNA toma de Jardín');

  // El interior NO aporta ninguna toma derivada.
  assert.ok(!sugs.some((s) => /^Recibidor\b/.test(s.nombre)), 'un interior no aporta tomas');
});

test('F38: una sola toma derivada por espacio (no varias por feature)', () => {
  let state = logic.createDefaultState();
  state.guide = Object.assign({}, state.guide, { tipoPropiedad: 'casa' });
  state = logic.addSpacesFromText(state, 'Alberca', { zona: 'exterior' });
  const sugs = logic.droneSessionSuggestions(state);
  const albercaId = state.espacios.find((e) => e.nombre === 'Alberca').id;
  const derivadas = sugs.filter((s) => s.featOf === albercaId);
  assert.equal(derivadas.length, 1, 'una sola toma derivada por espacio');
  assert.equal(derivadas[0].id, 'drone-feat-' + albercaId);
  // El feature conocido aporta su shotType/movement base (primera del vocabulario).
  const base = logic.aerialVocabForFeature('alberca')[0];
  assert.equal(derivadas[0].shotType, base.shotType, 'usa shotType de la primera toma del vocabulario');
  assert.equal(derivadas[0].movement, base.movement, 'usa movement de la primera toma del vocabulario');
});

test('F38: la lista esta agrupada por escala (propiedad->amenidades->inmediato->ubicacion), must primero', () => {
  // Departamento: amenidades aplica, hay las 4 escalas.
  let state = logic.createDefaultState();
  state.guide = Object.assign({}, state.guide, { tipoPropiedad: 'departamento' });
  state = logic.addSpacesFromText(state, 'Roof garden', { zona: 'amenidades' });
  const sugs = logic.droneSessionSuggestions(state);
  const orden = ['propiedad', 'amenidades', 'inmediato', 'ubicacion'];
  // las escalas aparecen en orden no decreciente segun el indice de orden.
  let maxIdx = -1;
  for (const s of sugs) {
    const idx = orden.indexOf(s.scale);
    assert.ok(idx >= 0, 'cada toma tiene una escala valida: ' + s.scale);
    assert.ok(idx >= maxIdx, 'las escalas no retroceden (toma ' + s.nombre + ')');
    maxIdx = Math.max(maxIdx, idx);
  }
  // dentro de la escala 'propiedad', los must van antes que los no-must.
  const propiedad = sugs.filter((s) => s.scale === 'propiedad');
  let vistoNoMust = false;
  for (const s of propiedad) {
    if (s.must !== true) vistoNoMust = true;
    else assert.ok(!vistoNoMust, 'must antes que no-must en escala propiedad: ' + s.nombre);
  }
  // sin ids duplicados.
  const ids = sugs.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'no hay ids duplicados');
});

test('F38: terreno - la sesion expone las 14 tomas (no la lista de casa)', () => {
  const state = { guide: { tipoPropiedad: 'terreno' }, espacios: [] };
  const sugs = logic.droneSessionSuggestions(state);
  assert.equal(sugs.length, 14, 'la sesion de terreno expone las 14 tomas');
  assert.equal(sugs.filter((s) => s.must === true).length, 7, '7 must');
  // y coincide con suggestionsForTarget del target de sesion (que es el sujeto terreno).
  const sesion = logic.droneSessionSubject(state);
  const viaTarget = logic.suggestionsForTarget(state, 'drone', sesion);
  assert.deepEqual(viaTarget.map((s) => s.id), sugs.map((s) => s.id), 'mismo resultado por ambos caminos');
});

test('F38: suggestionsForTarget del target de sesion devuelve droneSessionSuggestions', () => {
  let state = logic.createDefaultState();
  state.guide = Object.assign({}, state.guide, { tipoPropiedad: 'casa' });
  state = logic.addSpacesFromText(state, 'Alberca', { zona: 'exterior' });
  const sesion = logic.droneSessionSubject(state);
  const viaTarget = logic.suggestionsForTarget(state, 'drone', sesion).map((s) => s.id);
  const direct = logic.droneSessionSuggestions(state).map((s) => s.id);
  assert.deepEqual(viaTarget, direct, 'suggestionsForTarget(sesion) == droneSessionSuggestions');
});

test('F38 MIGRACION: estado viejo drone-piso + 1 toma -> NO omitted, conserva targetId y es alcanzable', () => {
  const viejo = {
    version: 3,
    espacios: [
      { id: 'drone-old', nombre: 'Fachada aerea', kind: 'drone', zona: 'exterior', piso: 'Drone', estados: {} },
    ],
    cameras: [{ id: 'drone-dji', label: 'Drone DJI', mode: 'drone', kind: 'dji' }],
    activeCameraByMode: { video: 'sony-main', drone: 'drone-dji' },
    sequenceSegments: [
      { id: 'seg1', cameraId: 'drone-dji', counterWidth: 4, counterNext: 247, prefixHint: '' },
    ],
    mediaFiles: [
      { id: 'm1', cameraId: 'drone-dji', targetId: 'drone-old', kind: 'take', segmentId: 'seg1', fileCounter: 246 },
    ],
  };
  const norm = logic.normalizeChecklistData(viejo);
  const file = norm.mediaFiles.find((f) => f.id === 'm1');
  assert.ok(file, 'la toma sobrevive');
  assert.equal(file.kind, 'take', 'la toma NO quedo omitted');
  assert.equal(file.targetId, 'drone-old', 'conserva su targetId');
  // el target viejo es alcanzable via targetsForMode('drone') (compat).
  const targets = logic.targetsForMode(norm, 'drone');
  assert.ok(targets.some((t) => t.id === 'drone-session'), 'incluye el target de sesion');
  assert.ok(targets.some((t) => t.id === 'drone-old'), 'el target viejo kind:drone es alcanzable (compat)');
  assert.equal(norm.servicios.drone, true, 'servicios.drone inferido true por rastro de drone');
  assert.strictEqual(norm.guide.incluirDrone, undefined, 'guide.incluirDrone ya no existe');
});

test('F38: version:1 intacto', () => {
  const exp = logic.buildExport(logic.createDefaultState(), {});
  assert.equal(exp.version, 2, 'version:2 (archivos[] intacto)');
});

test('F38 curacion: las tomas de espacio (derivable) y situacional NO salen como fijas; los features solo por derivacion', () => {
  const s = logic.createDefaultState();
  s.guide = Object.assign({}, s.guide, { tipoPropiedad: 'casa' });
  s.servicios = Object.assign({}, s.servicios, { drone: true });
  s.espacios = [
    { id: 'e1', nombre: 'Recibidor', zona: 'interior', estados: {} },
    { id: 'e2', nombre: 'Jardin', zona: 'exterior', estados: {} },
    { id: 'e3', nombre: 'Alberca', zona: 'amenidades', estados: {} },
  ];
  const sesion = logic.targetsForMode(s, 'drone').find((t) => t.id === 'drone-session');
  const sug = logic.suggestionsForTarget(s, 'drone', sesion);
  const nombres = sug.map((x) => x.nombre);
  // No aparecen como fijas: Casa club (no hay casa club), Patio/jardin/alberca (derivable),
  // ni Reveal sobre barda (situacional).
  assert.ok(!nombres.some((n) => /Casa club/i.test(n)), 'Casa club no sale sin espacio');
  assert.ok(!nombres.some((n) => /Patio \/ jard/i.test(n)), 'Patio/jardin/alberca no sale como fija');
  assert.ok(!nombres.some((n) => /sobre barda/i.test(n)), 'Reveal sobre barda (situacional) no sale');
  // Los features salen UNA vez por derivacion, atados al espacio (featOf).
  const derivadas = sug.filter((x) => x.featOf);
  assert.equal(derivadas.length, 2, 'una derivada por espacio exterior/amenidad (Jardin, Alberca)');
  assert.equal(derivadas.filter((x) => x.featOf === 'e2').length, 1, 'una sola Jardin');
  assert.equal(derivadas.filter((x) => x.featOf === 'e3').length, 1, 'una sola Alberca');
  assert.ok(!derivadas.some((x) => x.featOf === 'e1'), 'el interior Recibidor no aporta');
  // Las fijas que SIEMPRE se hacen siguen ahi.
  assert.ok(nombres.some((n) => /Salida a contexto/i.test(n)), 'Salida a contexto sigue (must)');
  assert.ok(nombres.some((n) => /Fachada a/i.test(n)), 'Fachada sigue');
});

// ─── F40 — Motor: catalogo por zona, numeracion y planner del esqueleto ──────

test('catalogByZone agrupa por zona y dedupe recamaras', () => {
  const cat = logic.catalogByZone('casa');
  assert.ok(cat.interior.some(c => c.base === 'Recámara'));
  assert.equal(cat.interior.filter(c => c.base === 'Recámara').length, 1);
  assert.ok(cat.exterior.some(c => c.base === 'Fachada'));
});

test('nextRoomName numera con firstName', () => {
  const rec = logic.BASE_CONCEPTS.casa.find(c => c.base === 'Recámara');
  assert.equal(logic.nextRoomName([], rec), 'Recámara principal');
  assert.equal(logic.nextRoomName(['Recámara principal'], rec), 'Recámara 2');
  assert.equal(logic.nextRoomName(['Recámara principal', 'Recámara 2'], rec), 'Recámara 3');
});

test('baseConcept normaliza', () => {
  assert.equal(logic.baseConcept('Recámara 2'), 'Recámara');
  assert.equal(logic.baseConcept('Recamara principal'), 'Recámara');
});

test('planSkeleton por piso: numeracion global y zonas', () => {
  const plan = logic.planSkeleton('casa', {
    floors: [
      { rec: 1, ban: 1, med: 1, opts: { Sala: true, Cocina: true } },
      { rec: 2, ban: 1, med: 0, opts: {} },
    ],
    fachada: true,
  });
  const byName = (n) => plan.find((p) => p.nombre === n);
  // Numeracion global a traves de pisos (PB primero).
  assert.ok(byName('Recámara principal'), 'tiene Recámara principal');
  assert.equal(byName('Recámara principal').piso, 'Planta baja');
  assert.ok(byName('Recámara 2'), 'tiene Recámara 2');
  assert.equal(byName('Recámara 2').piso, 'Planta alta');
  assert.ok(byName('Recámara 3'), 'tiene Recámara 3');
  assert.equal(byName('Recámara 3').piso, 'Planta alta');
  // Tipicos por piso (PB).
  assert.equal(byName('Sala').piso, 'Planta baja');
  assert.equal(byName('Sala').zona, 'interior');
  assert.equal(byName('Cocina').piso, 'Planta baja');
  // Fachada exterior, una vez, piso null.
  const fachadas = plan.filter((p) => p.nombre === 'Fachada');
  assert.equal(fachadas.length, 1);
  assert.equal(fachadas[0].zona, 'exterior');
  assert.equal(fachadas[0].piso, null);
});

test('catalogByZone terreno vacío', () => {
  assert.deepEqual(logic.catalogByZone('terreno'), {});
});

// ─── F45 — Amenidades casa, planSkeleton por piso, naming de pisos ───────────

test('catalogByZone casa incluye amenidades (Alberca y Caseta)', () => {
  const cat = logic.catalogByZone('casa');
  assert.ok(Array.isArray(cat.amenidades) && cat.amenidades.length > 0);
  assert.ok(cat.amenidades.some((c) => c.base === 'Alberca'), 'tiene Alberca');
  assert.ok(cat.amenidades.some((c) => c.base === 'Caseta'), 'tiene Caseta');
});

test('floorLabel da la secuencia de pisos', () => {
  assert.equal(logic.floorLabel(0), 'Planta baja');
  assert.equal(logic.floorLabel(1), 'Planta alta');
  assert.equal(logic.floorLabel(2), 'Planta 3');
});

test('nextFloorName devuelve el siguiente piso libre', () => {
  assert.equal(logic.nextFloorName(['Planta baja']), 'Planta alta');
  assert.equal(logic.nextFloorName(['Planta baja', 'Planta alta']), 'Planta 3');
  // Salta pisos drone.
  assert.equal(logic.nextFloorName([]), 'Planta baja');
  assert.equal(logic.nextFloorName(['Drone', 'Planta baja']), 'Planta alta');
});

// ─── F47 — Conceptos enriquecidos + defaults por piso ────────────────────────

test('catalogByZone casa exterior incluye Alberca y Palapa', () => {
  const ext = logic.catalogByZone('casa').exterior;
  assert.ok(ext.some((c) => c.base === 'Alberca'), 'tiene Alberca');
  assert.ok(ext.some((c) => c.base === 'Palapa'), 'tiene Palapa');
});

test('catalogByZone casa amenidades incluye Área canina, Ludoteca y Sala de negocios', () => {
  const ame = logic.catalogByZone('casa').amenidades;
  assert.ok(ame.some((c) => c.base === 'Área canina'), 'tiene Área canina');
  assert.ok(ame.some((c) => c.base === 'Ludoteca'), 'tiene Ludoteca');
  assert.ok(ame.some((c) => c.base === 'Sala de negocios'), 'tiene Sala de negocios');
});

test('catalogByZone casa interior incluye Sala de TV y Bar, con una sola Recámara', () => {
  const int = logic.catalogByZone('casa').interior;
  assert.ok(int.some((c) => c.base === 'Sala de TV'), 'tiene Sala de TV');
  assert.ok(int.some((c) => c.base === 'Bar'), 'tiene Bar');
  assert.equal(int.filter((c) => c.base === 'Recámara').length, 1);
});

test('defaultVisible interior planta baja incluye Cocina; planta alta no pero sí Recámara', () => {
  const pb = logic.defaultVisible('interior', 0);
  const alta = logic.defaultVisible('interior', 1);
  assert.ok(pb.includes('Cocina'), 'PB incluye Cocina');
  assert.ok(!alta.includes('Cocina'), 'alta no incluye Cocina');
  assert.ok(alta.includes('Recámara'), 'alta incluye Recámara');
});

test('defaultVisible exterior y amenidades', () => {
  assert.deepEqual(logic.defaultVisible('exterior', 0), ['Fachada']);
  assert.deepEqual(logic.defaultVisible('amenidades', 0), []);
});

// La Recámara se sugiere SIEMPRE en planta baja, aun con varias plantas.
test('defaultVisible planta baja siempre incluye Recámara', () => {
  assert.ok(logic.defaultVisible('interior', 0).includes('Recámara'), 'PB incluye Recámara');
  assert.ok(logic.defaultVisible('interior', 1).includes('Recámara'), 'planta alta incluye Recámara');
});

// ─── F60 — mergeChecklist: unión sin pérdida (prevención de concurrencia) ──────
function _mergeState(over) {
  return Object.assign({
    mediaFiles: [], espacios: [], pisos: [], cameras: [],
    sequenceSegments: [], droneItems: [], asesorPuntos: [], guide: {},
  }, over);
}

test('mergeChecklist une mediaFiles de ambos lados sin perder ninguno', () => {
  const A = _mergeState({ mediaFiles: [{ id: 'm1', fileToken: 'PIB0001' }, { id: 'm2', fileToken: 'PIB0002' }] });
  const B = _mergeState({ mediaFiles: [] }); // copia vieja, sin las tomas
  assert.equal(logic.mergeChecklist(A, B).mediaFiles.length, 2);
  assert.equal(logic.mergeChecklist(B, A).mediaFiles.length, 2);
});

test('mergeChecklist conserva estados de servicios distintos en el mismo cuarto', () => {
  const A = _mergeState({ espacios: [{ id: 'e1', nombre: 'Cocina', estados: { foto: { estado: 'hecho', updatedAt: '2026-01-01T00:00:00Z' } } }] });
  const B = _mergeState({ espacios: [{ id: 'e1', nombre: 'Cocina', estados: { video: { estado: 'hecho', updatedAt: '2026-01-02T00:00:00Z' } } }] });
  const merged = logic.mergeChecklist(A, B);
  assert.equal(merged.espacios.length, 1);
  assert.equal(merged.espacios[0].estados.foto.estado, 'hecho');
  assert.equal(merged.espacios[0].estados.video.estado, 'hecho');
});

test('mergeChecklist: para un mismo id, gana el updatedAt mayor', () => {
  const A = _mergeState({ mediaFiles: [{ id: 'm1', note: 'viejo', updatedAt: '2026-01-01T00:00:00Z' }] });
  const B = _mergeState({ mediaFiles: [{ id: 'm1', note: 'nuevo', updatedAt: '2026-01-02T00:00:00Z' }] });
  assert.equal(logic.mergeChecklist(A, B).mediaFiles[0].note, 'nuevo');
  assert.equal(logic.mergeChecklist(B, A).mediaFiles[0].note, 'nuevo');
});

test('mergeChecklist tolera estados sin updatedAt y no pierde nada', () => {
  const A = _mergeState({ mediaFiles: [{ id: 'm1' }], espacios: [{ id: 'e1', estados: { foto: { estado: 'hecho' } } }] });
  const B = _mergeState({ mediaFiles: [{ id: 'm2' }], espacios: [{ id: 'e1', estados: { video: { estado: 'hecho' } } }] });
  const merged = logic.mergeChecklist(A, B);
  assert.equal(merged.mediaFiles.length, 2);
  assert.equal(merged.espacios[0].estados.foto.estado, 'hecho');
  assert.equal(merged.espacios[0].estados.video.estado, 'hecho');
});

test('toggleMediaGood sella updatedAt en el archivo', () => {
  const base = _mergeState({ mediaFiles: [{ id: 'm1', kind: 'take', good: false }] });
  const next = logic.toggleMediaGood(base, 'm1');
  assert.ok(next.mediaFiles[0].updatedAt, 'updatedAt presente tras editar');
});

// Candado del incidente 2026-06-06: un guardado de cobertura (sin tomas) NO debe
// borrar las tomas que otro dispositivo marco. mergeChecklist es la red.
test('incidente: un guardado de cobertura no borra las tomas de otro dispositivo', () => {
  const tomas = Array.from({ length: 104 }, (_, i) => ({ id: 'm' + i, kind: 'take', fileToken: 'PIB' + i, updatedAt: '2026-06-06T19:12:00Z' }));
  const A = _mergeState({ mediaFiles: tomas, espacios: [{ id: 'e1', nombre: 'Cocina', estados: {} }] });
  const B = _mergeState({ // copia vieja del equipo: cobertura marcada, mediaFiles VACIO
    mediaFiles: [],
    espacios: [{ id: 'e1', nombre: 'Cocina', estados: { foto: { estado: 'hecho', autor: 'fernanda', updatedAt: '2026-06-06T19:20:00Z' } } }],
  });
  const m1 = logic.mergeChecklist(A, B); // B llega despues sobre A
  assert.equal(m1.mediaFiles.length, 104, 'las 104 tomas sobreviven');
  assert.equal(m1.espacios[0].estados.foto.estado, 'hecho', 'la cobertura tambien');
  const m2 = logic.mergeChecklist(B, A); // y al reves
  assert.equal(m2.mediaFiles.length, 104, 'sobreviven sin importar el orden');
  assert.equal(m2.espacios[0].estados.foto.estado, 'hecho');
});

// ─── F61 — lápidas: un borrado no debe revivir en la fusión ───────────────────
test('removeMediaFile registra una lápida y quita el archivo', () => {
  const base = _mergeState({ mediaFiles: [{ id: 'm1', cameraId: 'x', segmentId: null, kind: 'omitted', fileCounter: 1 }] });
  const next = logic.removeMediaFile(base, 'm1');
  assert.equal(next.mediaFiles.filter((f) => f.id === 'm1').length, 0, 'el archivo se quita');
  assert.ok((next.tombstones || []).some((t) => t.id === 'm1'), 'queda lápida de m1');
});

test('mergeChecklist no revive un id con lápida más nueva', () => {
  const A = _mergeState({ mediaFiles: [], tombstones: [{ id: 'm5', deletedAt: '2026-06-06T20:00:00Z' }] });
  const B = _mergeState({ mediaFiles: [{ id: 'm5', kind: 'take', updatedAt: '2026-06-06T19:00:00Z' }] });
  assert.equal(logic.mergeChecklist(A, B).mediaFiles.filter((f) => f.id === 'm5').length, 0);
  assert.equal(logic.mergeChecklist(B, A).mediaFiles.filter((f) => f.id === 'm5').length, 0);
});

test('mergeChecklist revive si la edición es posterior a la lápida', () => {
  const A = _mergeState({ tombstones: [{ id: 'm5', deletedAt: '2026-06-06T19:00:00Z' }] });
  const B = _mergeState({ mediaFiles: [{ id: 'm5', kind: 'take', updatedAt: '2026-06-06T20:00:00Z' }] });
  assert.equal(logic.mergeChecklist(A, B).mediaFiles.filter((f) => f.id === 'm5').length, 1);
});

test('mergeChecklist une las lápidas de ambos lados', () => {
  const A = _mergeState({ tombstones: [{ id: 'a', deletedAt: '2026-01-01T00:00:00Z' }] });
  const B = _mergeState({ tombstones: [{ id: 'b', deletedAt: '2026-01-02T00:00:00Z' }] });
  const ids = logic.mergeChecklist(A, B).tombstones.map((t) => t.id).sort();
  assert.deepEqual(ids, ['a', 'b']);
});

test('normalizeChecklistData poda lápidas de más de 30 días', () => {
  const viejo = new Date(Date.now() - 40 * 86400000).toISOString();
  const nuevo = new Date(Date.now() - 2 * 86400000).toISOString();
  const norm = logic.normalizeChecklistData({ version: 3, espacios: [], tombstones: [{ id: 'viejo', deletedAt: viejo }, { id: 'nuevo', deletedAt: nuevo }] });
  const ids = (norm.tombstones || []).map((t) => t.id);
  assert.ok(!ids.includes('viejo'), 'poda la vieja');
  assert.ok(ids.includes('nuevo'), 'conserva la reciente');
});

test('addTombstones registra ids borrados y la fusión no los revive', () => {
  const borrado = _mergeState({ espacios: [{ id: 'e2' }] });
  logic.addTombstones(borrado, ['e1']); // e1 borrado localmente
  const otro = _mergeState({ espacios: [{ id: 'e1' }, { id: 'e2' }] }); // copia vieja con e1
  assert.equal(logic.mergeChecklist(otro, borrado).espacios.filter((e) => e.id === 'e1').length, 0);
});

// F66 — archivoActual: el nombre capturado ES el archivo actual; la primera toma arranca
// EN ese numero (no en el siguiente). Sin la opcion se conserva el comportamiento previo (+1).
test('initializeCameraSequence con archivoActual arranca EN el número capturado', () => {
  let state = logic.normalizeChecklistData({ version: 3, espacios: [] });
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260609_PIB0082', archivoActual: true });
  assert.equal(logic.getCameraSequence(state, 'sony-main').nextToken, 'PIB0082');
});

test('initializeCameraSequence sin archivoActual mantiene el comportamiento previo (+1)', () => {
  let state = logic.normalizeChecklistData({ version: 3, espacios: [] });
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260609_PIB0082' });
  assert.equal(logic.getCameraSequence(state, 'sony-main').nextToken, 'PIB0083');
});

// ─── F67 — generador del prompt de dictado (buildDictadoPrompt) ───────────────
// State de prueba: cocina + una recámara, sony-main en 82 y drone-dji en 1.
function _dictadoState() {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Cocina\nRecámara principal');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260609_PIB0082', archivoActual: true });
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_0001', archivoActual: true });
  return state;
}

test('F67: buildDictadoPrompt incluye los ids reales de los cuartos del estado', () => {
  const state = _dictadoState();
  const prompt = logic.buildDictadoPrompt(state);
  for (const esp of state.espacios) {
    assert.ok(prompt.includes('"' + esp.id + '"'), 'el prompt menciona el id del cuarto ' + esp.id);
  }
});

test('F67: buildDictadoPrompt ofrece exactamente los 8 movimientos de DICTADO_MOVEMENTS y ninguno extra', () => {
  const state = _dictadoState();
  const prompt = logic.buildDictadoPrompt(state);
  const esperados = ['push_pull', 'push_in', 'pull_out', 'pan', 'tilt', 'travel', 'orbit', 'reveal'];
  for (const id of esperados) {
    assert.ok(prompt.includes('"' + id + '"'), 'ofrece el movimiento ' + id);
  }
  // Ids historicos de getMovements() que NO deben ofrecerse como opcion de movimiento.
  const noOfrecidos = ['gimbal_walk', 'static', 'dolly', 'umbral', 'parallax', 'tilt_up', 'slider', 'tracking', 'pedestal', 'whip'];
  for (const id of noOfrecidos) {
    assert.ok(!prompt.includes('"' + id + '"'), 'no ofrece el movimiento historico ' + id);
  }
});

test('F67: buildDictadoPrompt incluye los 12 ids de getShotTypes()', () => {
  const state = _dictadoState();
  const prompt = logic.buildDictadoPrompt(state);
  const shotIds = Object.keys(logic.getShotTypes());
  assert.equal(shotIds.length, 12, 'getShotTypes() tiene 12 ids');
  for (const id of shotIds) {
    assert.ok(prompt.includes('"' + id + '"'), 'incluye el shotType ' + id);
  }
});

test('F67: buildDictadoPrompt marca sony-main por defecto y lista drone-dji solo si el dron está activo', () => {
  const state = _dictadoState();
  const prompt = logic.buildDictadoPrompt(state);
  assert.ok(prompt.includes('sony-main'), 'menciona sony-main');
  assert.ok(/sony-main[\s\S]*por defecto|por defecto[\s\S]*sony-main/.test(prompt), 'declara sony-main como cámara por defecto');
  assert.ok(prompt.includes('drone-dji'), 'con dron activo lista drone-dji');

  const sinDron = logic.setServiceActive(state, 'drone', false);
  const promptSinDron = logic.buildDictadoPrompt(sinDron);
  assert.ok(!promptSinDron.includes('drone-dji'), 'con dron apagado no aparece drone-dji');
  assert.ok(promptSinDron.includes('sony-main'), 'sony-main sigue presente sin dron');
});

test('F67: buildDictadoPrompt declara formato y version en el ejemplo de respuesta', () => {
  const state = _dictadoState();
  const prompt = logic.buildDictadoPrompt(state);
  assert.ok(prompt.includes('"formato": "bitacora-dictado"'), 'declara formato bitacora-dictado');
  assert.ok(prompt.includes('"version": 1'), 'declara version 1');
});

// ─── F68 — parser y validador tolerante del dictado (parseDictado) ────────────
// Reusa el state de F67: cocina + recámara, sony-main en 82 y drone-dji en 1.
function _cocinaId(state) {
  return state.espacios.find((e) => e.nombre === 'Cocina').id;
}

// Dictado de ejemplo real convertido a JSON bitacora-dictado v1:
// "toma 82 push in cocina plano general. toma 83 detalle cocina, quedó bien, favorita.
//  toma 84 fallida, no está bien expuesta. toma 85 recámara reveal pared izquierda.
//  cambio de cámara a drone. toma 1 drone fachada reveal. 10 fotos capturadas. toma 2 drone (numero 12)."
function _dictadoEjemploJSON(state) {
  const cocina = _cocinaId(state);
  return JSON.stringify({
    formato: 'bitacora-dictado',
    version: 1,
    eventos: [
      { orden: 1, evento: 'toma', camara: 'sony-main', numero: 82, cuartoId: cocina, shotType: 'general', movement: 'push_in', clase: 'take', motivoDescarte: null, buena: true, favorita: false, nota: '' },
      { orden: 2, evento: 'toma', camara: 'sony-main', numero: 83, cuartoId: cocina, shotType: 'detalle', movement: 'static', clase: 'take', motivoDescarte: null, buena: true, favorita: true, nota: '' },
      { orden: 3, evento: 'toma', camara: 'sony-main', numero: 84, cuartoId: cocina, shotType: 'general', movement: null, clase: 'discard', motivoDescarte: null, buena: true, favorita: false, nota: 'mal expuesta' },
      { orden: 4, evento: 'toma', camara: 'sony-main', numero: 85, cuartoId: 'sin_identificar', shotType: 'reveal', movement: 'reveal', clase: 'take', motivoDescarte: null, buena: true, favorita: false, nota: 'pared izquierda' },
      { orden: 5, evento: 'toma', camara: 'drone-dji', numero: 1, cuartoId: 'sin_identificar', shotType: 'reveal', movement: 'reveal', clase: 'take', motivoDescarte: null, buena: true, favorita: false, nota: 'fachada' },
      { orden: 6, evento: 'fotos', camara: 'drone-dji', cantidad: 10 },
      { orden: 7, evento: 'toma', camara: 'drone-dji', numero: 12, cuartoId: 'sin_identificar', shotType: 'general', movement: null, clase: 'take', motivoDescarte: null, buena: true, favorita: false, nota: '' },
    ],
  });
}

test('F68: parseDictado parsea el dictado de ejemplo real con tokens y orden correctos', () => {
  const state = _dictadoState();
  const cocina = _cocinaId(state);
  const r = logic.parseDictado(_dictadoEjemploJSON(state), state);

  assert.equal(r.ok, true, 'parsea ok');
  assert.equal(r.error, null);
  // 4 tomas Sony + 2 tomas dron + 1 evento de fotos = 7 items en el preview.
  assert.equal(r.preview.length, 7, 'preview tiene 7 items');

  const tomas = r.preview.filter((i) => i.evento === 'toma');
  const fotos = r.preview.filter((i) => i.evento === 'fotos');
  assert.equal(tomas.length, 6, '6 tomas');
  assert.equal(fotos.length, 1, '1 evento de fotos');

  // Tokens Sony PIB0082..PIB0085.
  assert.equal(tomas[0].tokenExpandido, 'PIB0082');
  assert.equal(tomas[1].tokenExpandido, 'PIB0083');
  assert.equal(tomas[2].tokenExpandido, 'PIB0084');
  assert.equal(tomas[3].tokenExpandido, 'PIB0085');
  // Dron 0001 y 0012 (tras 10 fotos).
  assert.equal(tomas[4].tokenExpandido, '0001');
  assert.equal(tomas[5].tokenExpandido, '0012');

  // Resumen.
  assert.equal(r.resumen.tomas, 6);
  assert.equal(r.resumen.descartes, 1);
  assert.equal(r.resumen.fotosDron, 10);

  // Primera toma cocina resuelta por id.
  assert.equal(tomas[0].cuartoId, cocina);
  assert.equal(tomas[0].shotType, 'general');
  assert.equal(tomas[0].movement, 'push_in');
  assert.equal(tomas[0].clase, 'take');
  assert.equal(tomas[0].buena, true);
  // Favorita marcada.
  assert.equal(tomas[1].favorita, true);
  // Descarte default failed.
  assert.equal(tomas[2].clase, 'discard');
  assert.equal(tomas[2].motivoDescarte, 'failed');
  assert.equal(tomas[2].buena, false, 'descarte no es buena');
});

test('F68: el evento de 10 fotos del dron evita salto en numero:12 y lo marca en numero:2', () => {
  const state = _dictadoState();
  // Caso correcto: dron 1, 10 fotos, dron 12 → sin salto.
  const rOk = logic.parseDictado(_dictadoEjemploJSON(state), state);
  const dronOk = rOk.preview.filter((i) => i.evento === 'toma' && i.camara === 'drone-dji');
  assert.equal(dronOk[0].banderas.salto, false, 'dron 1 sin salto');
  assert.equal(dronOk[1].banderas.salto, false, 'dron 12 sin salto tras 10 fotos');

  // Caso con salto: misma secuencia pero la segunda toma dron es numero:2 (esperado 12).
  const malJSON = JSON.stringify({
    formato: 'bitacora-dictado',
    version: 1,
    eventos: [
      { orden: 1, evento: 'toma', camara: 'drone-dji', numero: 1, cuartoId: 'sin_identificar', shotType: 'general', movement: null, clase: 'take' },
      { orden: 2, evento: 'fotos', camara: 'drone-dji', cantidad: 10 },
      { orden: 3, evento: 'toma', camara: 'drone-dji', numero: 2, cuartoId: 'sin_identificar', shotType: 'general', movement: null, clase: 'take' },
    ],
  });
  const rMal = logic.parseDictado(malJSON, state);
  const dronMal = rMal.preview.filter((i) => i.evento === 'toma');
  assert.equal(dronMal[0].banderas.salto, false, 'dron 1 sin salto');
  assert.equal(dronMal[1].banderas.salto, true, 'dron 2 marca salto porque esperado subió a 12');
  assert.equal(rMal.resumen.saltos, 1);
});

test('F68: texto sucio con fences y explicación parsea igual; basura total -> ok:false', () => {
  const state = _dictadoState();
  const limpio = _dictadoEjemploJSON(state);
  const sucio = 'Claro, aquí tienes el resultado:\n```json\n' + limpio + '\n```\nEspero que sirva.';
  const r = logic.parseDictado(sucio, state);
  assert.equal(r.ok, true, 'texto sucio parsea ok');
  assert.equal(r.preview.length, 7);

  const basura = logic.parseDictado('esto no es json para nada', state);
  assert.equal(basura.ok, false, 'basura total no parsea');
  assert.ok(basura.error, 'reporta error');
});

test('F68: version:2 -> ok:false con error de versión y sin preview', () => {
  const state = _dictadoState();
  const json = JSON.stringify({ formato: 'bitacora-dictado', version: 2, eventos: [] });
  const r = logic.parseDictado(json, state);
  assert.equal(r.ok, false);
  assert.ok(/versi/i.test(r.error), 'el error menciona la versión');
  assert.deepEqual(r.preview, [], 'sin preview');
});

test('F68: shotType inválido -> null + bandera vocabFuera + original en nota', () => {
  const state = _dictadoState();
  const cocina = _cocinaId(state);
  const json = JSON.stringify({
    formato: 'bitacora-dictado',
    version: 1,
    eventos: [
      { orden: 1, evento: 'toma', camara: 'sony-main', numero: 82, cuartoId: cocina, shotType: 'plano raro', movement: 'push_in', clase: 'take' },
    ],
  });
  const r = logic.parseDictado(json, state);
  assert.equal(r.ok, true);
  const t = r.preview[0];
  assert.equal(t.shotType, null, 'shotType inválido queda null');
  assert.equal(t.banderas.vocabFuera, true);
  assert.ok(t.nota.includes('plano raro'), 'conserva el original en nota');
  assert.equal(r.resumen.vocabFuera, 1);
});

test('F68: cuarto inexistente o "sin_identificar" -> cuartoId null + bandera sinIdentificar', () => {
  const state = _dictadoState();
  const json = JSON.stringify({
    formato: 'bitacora-dictado',
    version: 1,
    eventos: [
      { orden: 1, evento: 'toma', camara: 'sony-main', numero: 82, cuartoId: 'sin_identificar', shotType: 'general', movement: 'push_in', clase: 'take' },
      { orden: 2, evento: 'toma', camara: 'sony-main', numero: 83, cuartoId: 'esp-no-existe', shotType: 'general', movement: 'push_in', clase: 'take' },
    ],
  });
  const r = logic.parseDictado(json, state);
  assert.equal(r.ok, true);
  for (const t of r.preview) {
    assert.equal(t.cuartoId, null, 'cuartoId null');
    assert.equal(t.cuartoNombre, 'Sin identificar');
    assert.equal(t.banderas.sinIdentificar, true);
  }
  assert.equal(r.resumen.sinIdentificar, 2);
});

test('F68: respaldo por nombre resuelve el cuarto cuando viene un nombre en lugar de id', () => {
  const state = _dictadoState();
  const cocina = _cocinaId(state);
  const json = JSON.stringify({
    formato: 'bitacora-dictado',
    version: 1,
    eventos: [
      { orden: 1, evento: 'toma', camara: 'sony-main', numero: 82, cuartoId: 'Cocina', shotType: 'general', movement: 'push_in', clase: 'take' },
    ],
  });
  const r = logic.parseDictado(json, state);
  assert.equal(r.preview[0].cuartoId, cocina, 'resuelve por nombre');
  assert.equal(r.preview[0].banderas.sinIdentificar, false);
});

test('F68: token ya existente en state.mediaFiles -> bandera duplicado', () => {
  const state = _dictadoState();
  const cocina = _cocinaId(state);
  // PIB0082 ya capturado en el estado.
  state.mediaFiles.push({ id: 'm-prev', cameraId: 'sony-main', targetId: cocina, kind: 'take', fileToken: 'PIB0082' });
  const json = JSON.stringify({
    formato: 'bitacora-dictado',
    version: 1,
    eventos: [
      { orden: 1, evento: 'toma', camara: 'sony-main', numero: 82, cuartoId: cocina, shotType: 'general', movement: 'push_in', clase: 'take' },
    ],
  });
  const r = logic.parseDictado(json, state);
  assert.equal(r.preview[0].banderas.duplicado, true, 'detecta doble pegado contra lo ya capturado');
  assert.equal(r.resumen.duplicados, 1);
});

test('F68: numero no entero (string/null/ausente) se ignora y no corrompe el contador del carril', () => {
  const state = _dictadoState();
  const cocina = _cocinaId(state);
  const json = JSON.stringify({
    formato: 'bitacora-dictado',
    version: 1,
    eventos: [
      // numero como string: invalido, se ignora.
      { orden: 1, evento: 'toma', camara: 'sony-main', numero: '82', cuartoId: cocina, shotType: 'general', movement: 'push_in', clase: 'take' },
      // numero null: invalido, se ignora.
      { orden: 2, evento: 'toma', camara: 'sony-main', numero: null, cuartoId: cocina, shotType: 'general', movement: 'push_in', clase: 'take' },
      // numero ausente: invalido, se ignora.
      { orden: 3, evento: 'toma', camara: 'sony-main', cuartoId: cocina, shotType: 'general', movement: 'push_in', clase: 'take' },
      // toma valida: el contador esperado NO debe haberse corrompido por las anteriores.
      { orden: 4, evento: 'toma', camara: 'sony-main', numero: 82, cuartoId: cocina, shotType: 'general', movement: 'push_in', clase: 'take' },
    ],
  });
  const r = logic.parseDictado(json, state);
  assert.equal(r.ok, true);
  assert.equal(r.report.ignoradas, 3, 'los tres numeros invalidos se ignoran');
  // Solo la toma valida queda en el preview, con el token correcto y sin salto.
  const tomas = r.preview.filter((p) => p.evento === 'toma');
  assert.equal(tomas.length, 1, 'no se crea ninguna toma con token invalido');
  assert.equal(tomas[0].numeroDictado, 82);
  assert.equal(tomas[0].tokenExpandido, 'PIB0082', 'token correcto, no concatenado');
  assert.equal(tomas[0].banderas.salto, false, 'el contador esperado del carril no se corrompio');
});

test('F68: cámara no activa o fotos en cámara no-dron -> camaraInvalida sin tocar contadores', () => {
  const state = _dictadoState();
  const cocina = _cocinaId(state);
  const json = JSON.stringify({
    formato: 'bitacora-dictado',
    version: 1,
    eventos: [
      // Cámara inexistente/no activa.
      { orden: 1, evento: 'toma', camara: 'camara-fantasma', numero: 82, cuartoId: cocina, shotType: 'general', movement: 'push_in', clase: 'take' },
      // Fotos en cámara de video (no dron).
      { orden: 2, evento: 'fotos', camara: 'sony-main', cantidad: 10 },
      // Toma Sony válida después: el contador Sony NO debe haberse movido por lo anterior.
      { orden: 3, evento: 'toma', camara: 'sony-main', numero: 82, cuartoId: cocina, shotType: 'general', movement: 'push_in', clase: 'take' },
    ],
  });
  const r = logic.parseDictado(json, state);
  assert.equal(r.ok, true);
  assert.equal(r.preview[0].banderas.camaraInvalida, true, 'cámara fantasma inválida');
  assert.equal(r.preview[1].banderas.camaraInvalida, true, 'fotos en no-dron inválido');
  // La toma Sony válida con numero 82 no marca salto: el contador no fue tocado por los inválidos.
  assert.equal(r.preview[2].banderas.camaraInvalida, false);
  assert.equal(r.preview[2].banderas.salto, false, 'contador Sony intacto');
  assert.equal(r.resumen.camaraInvalida, 2);
});

test('F68: parseDictado no muta el estado', () => {
  const state = _dictadoState();
  const antes = JSON.stringify(state);
  logic.parseDictado(_dictadoEjemploJSON(state), state);
  assert.equal(JSON.stringify(state), antes, 'el estado queda intacto');
});

// ─── F69 — aplicador del dictado (applyDictado) + overrides de registerMediaFile ───
function _recamaraId(state) {
  return state.espacios.find((e) => e.nombre === 'Recámara principal').id;
}

test('F69: invariante de no-regresión — registerMediaFile sin overrides es igual que hoy', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  const salaId = state.espacios[0].id;
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: salaId, kind: 'take' });
  const file = state.mediaFiles[0];
  assert.equal(file.fileToken, 'PIB2819', 'token igual que hoy');
  assert.equal(file.fileCounter, 2819, 'fileCounter igual que hoy');
  assert.equal(file.good, false, 'good queda en false sin override');
  assert.equal(file.favorite, false, 'favorite queda en false sin override');
  assert.equal(file.shotNumber, 1, 'shotNumber lo calcula la captura');
  assert.equal(logic.getCameraSequence(state, 'sony-main').nextToken, 'PIB2820', 'el contador avanza igual');
});

test('F69: applyDictado del ejemplo crea 4 Sony (PIB0082..85) y 2 dron (0001,0012) con buena/favorita/descarte correctos', () => {
  const state = _dictadoState();
  const recamara = _recamaraId(state);
  const r = logic.parseDictado(_dictadoEjemploJSON(state), state);
  // orden 4 (toma 85) entra a recámara por asignación en revisar.
  const out = logic.applyDictado(state, r.preview, { asignaciones: { 4: recamara }, reemplazar: false });
  const next = out.state;

  const sony = next.mediaFiles.filter((f) => f.cameraId === 'sony-main');
  const dron = next.mediaFiles.filter((f) => f.cameraId === 'drone-dji');
  assert.deepEqual(sony.map((f) => f.fileToken), ['PIB0082', 'PIB0083', 'PIB0084', 'PIB0085'], '4 Sony');
  assert.deepEqual(dron.map((f) => f.fileToken), ['0001', '0012'], '2 dron');
  assert.equal(out.report.creadas, 6, '6 mediaFiles creados');
  assert.equal(out.report.fotosAplicadas, 10, '10 fotos del dron aplicadas');

  const t84 = sony.find((f) => f.fileToken === 'PIB0084');
  assert.equal(t84.kind, 'discard', '84 es descarte');
  assert.equal(t84.discardReason, 'failed', '84 default failed');
  assert.equal(t84.good, false, '84 no es buena');

  const t83 = sony.find((f) => f.fileToken === 'PIB0083');
  assert.equal(t83.favorite, true, '83 favorita');
  assert.equal(t83.good, true, '83 favorita implica buena');

  const t85 = sony.find((f) => f.fileToken === 'PIB0085');
  assert.equal(t85.targetId, recamara, '85 apunta a recámara por asignación');
});

test('F69: las 10 fotos del dron no crean mediaFiles pero el contador avanza (toma dron siguiente 0012)', () => {
  const state = _dictadoState();
  const r = logic.parseDictado(_dictadoEjemploJSON(state), state);
  const out = logic.applyDictado(state, r.preview, {});
  const dron = out.state.mediaFiles.filter((f) => f.cameraId === 'drone-dji');
  assert.equal(dron.length, 2, 'solo 2 mediaFiles dron (las fotos no crean toma)');
  assert.equal(dron[1].fileToken, '0012', 'la segunda toma dron quedó en 0012 tras las 10 fotos');
});

test('F69: shotNumber se calcula por el camino de captura (dos takes del mismo cuarto -> 1 y 2)', () => {
  const state = _dictadoState();
  const cocina = _cocinaId(state);
  const json = JSON.stringify({
    formato: 'bitacora-dictado',
    version: 1,
    eventos: [
      { orden: 1, evento: 'toma', camara: 'sony-main', numero: 82, cuartoId: cocina, shotType: 'general', movement: null, clase: 'take' },
      { orden: 2, evento: 'toma', camara: 'sony-main', numero: 83, cuartoId: cocina, shotType: 'detalle', movement: null, clase: 'take' },
    ],
  });
  const r = logic.parseDictado(json, state);
  const out = logic.applyDictado(state, r.preview, {});
  const cocinaTakes = out.state.mediaFiles.filter((f) => f.targetId === cocina && f.kind === 'take');
  assert.deepEqual(cocinaTakes.map((f) => f.shotNumber), [1, 2], 'shotNumber 1 y 2 por el camino de captura');
});

test('F69: sin identificar — asignaciones vacío deja targetId null y scene "Sin identificar"; con asignación apunta a cocina', () => {
  const state = _dictadoState();
  const cocina = _cocinaId(state);
  const json = JSON.stringify({
    formato: 'bitacora-dictado',
    version: 1,
    eventos: [
      { orden: 1, evento: 'toma', camara: 'sony-main', numero: 82, cuartoId: 'sin_identificar', shotType: 'general', movement: null, clase: 'take' },
    ],
  });
  const r = logic.parseDictado(json, state);

  const sinAsignar = logic.applyDictado(state, r.preview, {});
  const f1 = sinAsignar.state.mediaFiles.find((f) => f.cameraId === 'sony-main');
  assert.equal(f1.targetId, null, 'sin asignación queda con cuarto pendiente');
  assert.equal(f1.scene, 'Sin identificar', 'escena Sin identificar');

  const conAsignar = logic.applyDictado(state, r.preview, { asignaciones: { 1: cocina } });
  const f2 = conAsignar.state.mediaFiles.find((f) => f.cameraId === 'sony-main');
  assert.equal(f2.targetId, cocina, 'con asignación apunta a cocina');
});

test('F69: doble pegado — reemplazar:false no duplica (omite repetidos); reemplazar:true deja el mismo total', () => {
  const state = _dictadoState();
  const recamara = _recamaraId(state);
  const r1 = logic.parseDictado(_dictadoEjemploJSON(state), state);
  const primera = logic.applyDictado(state, r1.preview, { asignaciones: { 4: recamara } });
  const totalUna = primera.state.mediaFiles.length;

  // Segundo pegado del MISMO dictado sobre el estado ya aplicado.
  const r2 = logic.parseDictado(_dictadoEjemploJSON(primera.state), primera.state);

  const sinReemplazar = logic.applyDictado(primera.state, r2.preview, { asignaciones: { 4: recamara }, reemplazar: false });
  assert.equal(sinReemplazar.state.mediaFiles.length, totalUna, 'reemplazar:false no duplica');
  assert.ok(sinReemplazar.report.omitidasDuplicado >= 6, 'cuenta las tomas omitidas por duplicado');
  assert.equal(sinReemplazar.report.creadas, 0, 'no crea ninguna repetida');

  const conReemplazar = logic.applyDictado(primera.state, r2.preview, { asignaciones: { 4: recamara }, reemplazar: true });
  assert.equal(conReemplazar.state.mediaFiles.length, totalUna, 'reemplazar:true deja el mismo total');
  assert.ok(conReemplazar.report.reemplazadas >= 6, 'cuenta los reemplazos');
});

test('F69: el estado resultante pasa por mergeChecklist conservando tomas importadas y cobertura de otro dispositivo', () => {
  const state = _dictadoState();
  const recamara = _recamaraId(state);
  const cocina = _cocinaId(state);
  const r = logic.parseDictado(_dictadoEjemploJSON(state), state);
  const importado = logic.applyDictado(state, r.preview, { asignaciones: { 4: recamara } }).state;

  // Otro dispositivo marca cobertura (estado de video) en cocina, sin tomas importadas.
  const otro = JSON.parse(JSON.stringify(state));
  const espCocina = otro.espacios.find((e) => e.id === cocina);
  espCocina.estados.video = { estado: 'hecho' };
  espCocina.updatedAt = new Date(Date.now() + 1000).toISOString();

  const fundido = logic.mergeChecklist(otro, importado);
  // Las tomas importadas sobreviven.
  assert.ok(fundido.mediaFiles.some((f) => f.fileToken === 'PIB0082'), 'conserva tomas importadas');
  assert.equal(fundido.mediaFiles.filter((f) => f.cameraId === 'sony-main').length, 4, 'las 4 Sony siguen');
  // La cobertura del otro dispositivo sobrevive.
  const cocinaFundida = fundido.espacios.find((e) => e.id === cocina);
  assert.equal(cocinaFundida.estados.video.estado, 'hecho', 'conserva la cobertura del otro dispositivo');
});

test('F69: buildExport(applyDictado(...).state) da version:2 y exporta las tomas con su token', () => {
  const state = _dictadoState();
  const recamara = _recamaraId(state);
  const r = logic.parseDictado(_dictadoEjemploJSON(state), state);
  const next = logic.applyDictado(state, r.preview, { asignaciones: { 4: recamara } }).state;
  const exportado = logic.buildExport(next);
  assert.equal(exportado.version, 2, 'export subio a version 2');
  const json = JSON.stringify(exportado);
  assert.ok(json.includes('PIB0082'), 'el export incluye el token de una toma importada');
  assert.ok(json.includes('0012') || json.includes('"0012"'), 'el export incluye el token de la toma dron');
});

// ─── JSON version 2 para la app de metadatos (R109-R111) ─────────────────────

test('createDefaultState incluye rangosManuales vacio', () => {
  const s = logic.normalizeChecklistData({ version: 3, espacios: [] });
  assert.deepEqual(s.rangosManuales, {});
});

test('normalizeChecklistData preserva rangosManuales entrante', () => {
  const s = logic.normalizeChecklistData({
    version: 3,
    espacios: [],
    rangosManuales: { 'foto-sony': { primer: 'DSC00101', ultimo: 'DSC00260' } },
  });
  assert.deepEqual(s.rangosManuales, { 'foto-sony': { primer: 'DSC00101', ultimo: 'DSC00260' } });
});

test('mergeChecklist funde rangosManuales por camara sin perder ninguno', () => {
  const base = logic.normalizeChecklistData({
    version: 3, espacios: [],
    rangosManuales: { 'foto-sony': { primer: 'DSC00101', ultimo: 'DSC00260' } },
  });
  const incoming = logic.normalizeChecklistData({
    version: 3, espacios: [],
    rangosManuales: { 'insta360': { primer: 'IMG_0001', ultimo: 'IMG_0090' } },
  });
  const merged = logic.mergeChecklist(base, incoming);
  assert.deepEqual(merged.rangosManuales, {
    'foto-sony': { primer: 'DSC00101', ultimo: 'DSC00260' },
    'insta360': { primer: 'IMG_0001', ultimo: 'IMG_0090' },
  });
});

test('mergeChecklist: incoming gana en la misma camara', () => {
  const base = logic.normalizeChecklistData({
    version: 3, espacios: [],
    rangosManuales: { 'foto-sony': { primer: 'DSC00001', ultimo: 'DSC00100' } },
  });
  const incoming = logic.normalizeChecklistData({
    version: 3, espacios: [],
    rangosManuales: { 'foto-sony': { primer: 'DSC00101', ultimo: 'DSC00260' } },
  });
  const merged = logic.mergeChecklist(base, incoming);
  assert.deepEqual(merged.rangosManuales['foto-sony'], { primer: 'DSC00101', ultimo: 'DSC00260' });
});

test('buildExport version 2 con token, rev y bloques de negocio desde meta', () => {
  const state = logic.normalizeChecklistData({
    version: 3, espacios: [],
    mediaFiles: [{ id: 'm1', cameraId: 'sony-main', fileToken: 'C0012', fileCounter: 12, kind: 'take' }],
  });
  const meta = {
    folio: '2026-06-001', nombreCliente: 'ABC', token: 'tok-123', rev: 7,
    entrega: { carpetaEntregablesId: '1AbC', carpetaEntregablesUrl: 'https://drive.google.com/drive/folders/1AbC', carpetaControlId: '1XyZ' },
    logo: { url: 'https://drive.google.com/uc?export=download&id=FILE', todos: [{ id: 'FILE', nombre: 'logo.png' }] },
    negocio: { paquete: 'Paquete Basico - Casa', entregablesTexto: '50 fotos' },
  };
  const out = logic.buildExport(state, meta);
  assert.equal(out.version, 2);
  assert.equal(out.token, 'tok-123');
  assert.equal(out.rev, 7);
  assert.deepEqual(out.entrega, meta.entrega);
  assert.deepEqual(out.logo, meta.logo);
  assert.deepEqual(out.negocio, meta.negocio);
  assert.equal(out.archivos[0].archivo, 'C0012');
});

test('buildExport omite entrega/logo/negocio si meta no los trae', () => {
  const state = logic.normalizeChecklistData({
    version: 3, espacios: [],
    mediaFiles: [{ id: 'm1', cameraId: 'sony-main', fileToken: 'C0012', fileCounter: 12, kind: 'take' }],
  });
  const out = logic.buildExport(state, { folio: 'F', nombreCliente: 'C' });
  assert.equal(out.version, 2);
  assert.equal(out.token, '');
  assert.ok(!('entrega' in out));
  assert.ok(!('logo' in out));
  assert.ok(!('negocio' in out));
});

test('buildExport deriva grabaciones de mediaFiles agrupando por camara, todos los kind', () => {
  const state = logic.normalizeChecklistData({
    version: 3, espacios: [],
    mediaFiles: [
      { id: 'a', cameraId: 'sony-main', fileToken: 'C0048', fileCounter: 48, kind: 'discard' },
      { id: 'b', cameraId: 'sony-main', fileToken: 'C0012', fileCounter: 12, kind: 'take' },
      { id: 'c', cameraId: 'sony-main', fileToken: 'C0030', fileCounter: 30, kind: 'omitted' },
    ],
  });
  const out = logic.buildExport(state, { folio: 'F', nombreCliente: 'C' });
  const g = out.grabaciones.find((x) => x.camaraId === 'sony-main');
  assert.equal(g.primerArchivo, 'C0012');
  assert.equal(g.ultimoArchivo, 'C0048');
  assert.equal(g.conteo, 3);
});

test('buildExport incluye rangos manuales para camaras sin tomas logueadas', () => {
  const state = logic.normalizeChecklistData({
    version: 3, espacios: [], mediaFiles: [],
    rangosManuales: { 'foto-sony': { primer: 'DSC00101', ultimo: 'DSC00260' } },
  });
  const out = logic.buildExport(state, { folio: 'F', nombreCliente: 'C' });
  const g = out.grabaciones.find((x) => x.camaraId === 'foto-sony');
  assert.equal(g.primerArchivo, 'DSC00101');
  assert.equal(g.ultimoArchivo, 'DSC00260');
  assert.equal(g.conteo, null);
});

test('grabaciones: primer/ultimo salen de archivos con fileToken aunque haya omitted sin token', () => {
  const state = logic.normalizeChecklistData({
    version: 3, espacios: [],
    mediaFiles: [
      { id: 'a', cameraId: 'sony-main', fileCounter: 5, kind: 'omitted' }, // sin fileToken
      { id: 'b', cameraId: 'sony-main', fileToken: 'C0012', fileCounter: 12, kind: 'take' },
      { id: 'c', cameraId: 'sony-main', fileToken: 'C0040', fileCounter: 40, kind: 'discard' },
    ],
  });
  const out = logic.buildExport(state, { folio: 'F', nombreCliente: 'C' });
  const g = out.grabaciones.find((x) => x.camaraId === 'sony-main');
  assert.equal(g.primerArchivo, 'C0012');
  assert.equal(g.ultimoArchivo, 'C0040');
  assert.equal(g.conteo, 3);
});

// ─── sugerirNombreArchivo ─────────────────────────────────────────────────────

test('sugerirNombreArchivo: sony usa fecha del folio + prefijo del ejemplo + 0001', () => {
  const cam = { kind: 'sony', counterExample: 'PIB2818' };
  assert.strictEqual(logic.sugerirNombreArchivo(cam, 'IAV-2606.11-A'), '20260611_PIB0001');
});

test('sugerirNombreArchivo: dji deja hueco para la hora y sufijo _D', () => {
  const cam = { kind: 'dji' };
  assert.strictEqual(logic.sugerirNombreArchivo(cam, 'IAV-2606.11-A'), 'DJI_20260611______0001_D');
});

test('sugerirNombreArchivo: tascam usa año de 2 digitos sin prefijo', () => {
  const cam = { kind: 'tascam' };
  assert.strictEqual(logic.sugerirNombreArchivo(cam, 'IAV-2606.11-A'), '260611_0001');
});

test('sugerirNombreArchivo: insta360 deja hueco de hora, _00_ y 3 digitos', () => {
  const cam = { kind: 'insta360' };
  assert.strictEqual(logic.sugerirNombreArchivo(cam, 'IAV-2606.11-A'), 'IMG_20260611______00_001');
});

test('sugerirNombreArchivo: sin formato conocido devuelve cadena vacia', () => {
  assert.strictEqual(logic.sugerirNombreArchivo({ kind: 'otra' }, 'IAV-2606.11-A'), '');
});

test('sugerirNombreArchivo: folio que no parsea cae a fecha vacia pero no truena', () => {
  assert.strictEqual(logic.sugerirNombreArchivo({ kind: 'sony', counterExample: 'PIB1' }, ''), '');
});

test('sugerirNombreArchivo: sony sin counterExample usa el prefijo PIB por defecto', () => {
  assert.strictEqual(logic.sugerirNombreArchivo({ kind: 'sony' }, 'IAV-2606.11-A'), '20260611_PIB0001');
});

// ─── vlogOsmoAction ───────────────────────────────────────────────────────────

test('buildExport emite vlogOsmoAction false por defecto', () => {
  const s = logic.createDefaultState();
  const out = logic.buildExport(s, { folio: 'IAV-2606.11-A' });
  assert.strictEqual(out.vlogOsmoAction, false);
  assert.strictEqual(out.version, 2); // no se sube la version
});

test('buildExport refleja vlogOsmoAction true del estado', () => {
  const s = { mediaFiles: [], espacios: [], cameras: [], sequenceSegments: [], servicios: {}, rangosManuales: {}, guide: {}, vlogOsmoAction: true };
  const out = logic.buildExport(s, { folio: 'IAV-2606.11-A' });
  assert.strictEqual(out.vlogOsmoAction, true);
});

test('setVlogOsmoAction cambia el flag sin mutar el original', () => {
  const s = { vlogOsmoAction: false };
  const next = logic.setVlogOsmoAction(s, true);
  assert.strictEqual(next.vlogOsmoAction, true);
  assert.strictEqual(s.vlogOsmoAction, false);
});

test('normalizeChecklistData coerciona vlogOsmoAction a false cuando el valor es invalido o falta', () => {
  const conString = { version: 3, espacios: [], mediaFiles: [], cameras: [], sequenceSegments: [], vlogOsmoAction: 'si' };
  assert.equal(logic.normalizeChecklistData(conString).vlogOsmoAction, false, 'string "si" -> false');

  const sinCampo = { version: 3, espacios: [], mediaFiles: [], cameras: [], sequenceSegments: [] };
  assert.equal(logic.normalizeChecklistData(sinCampo).vlogOsmoAction, false, 'campo ausente -> false');
});

// ─── configurado ──────────────────────────────────────────────────────────────

test('createDefaultState incluye configurado en false', () => {
  const s = logic.createDefaultState();
  assert.strictEqual(s.configurado, false);
});

test('setConfigurado cambia el flag sin mutar el original', () => {
  const s = logic.createDefaultState();
  const next = logic.setConfigurado(s, true);
  assert.strictEqual(next.configurado, true);
  assert.strictEqual(s.configurado, false);
});

test('normalizeChecklistData coerciona configurado a false cuando el valor es invalido o falta', () => {
  const conString = { version: 3, espacios: [], mediaFiles: [], cameras: [], sequenceSegments: [], configurado: 'si' };
  assert.equal(logic.normalizeChecklistData(conString).configurado, false, 'string "si" -> false');

  const sinCampo = { version: 3, espacios: [], mediaFiles: [], cameras: [], sequenceSegments: [] };
  assert.equal(logic.normalizeChecklistData(sinCampo).configurado, false, 'campo ausente -> false');
});

test('FX30: iniciar sony-asesor reusa el segmento de sony-main si ya existe (un solo contador)', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: '20260611_PIB0010.MP4', archivoActual: true });
  const segMain = logic.getCameraSequence(s, 'sony-main').segment;
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-asesor', lastFilename: '20260611_PIB0099.MP4', archivoActual: true });
  const segAsesor = logic.getCameraSequence(s, 'sony-asesor').segment;
  assert.strictEqual(segAsesor.id, segMain.id, 'asesor comparte el segmento de la FX30');
  assert.strictEqual(s.sequenceSegments.length, 1, 'no se crea un segundo segmento para la FX30');
  assert.strictEqual(segAsesor.counterNext, segMain.counterNext, 'no se re-siembra al reusar');
});

test('FX30: si asesor inicia primero, video reusa su segmento', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-asesor', lastFilename: '20260611_PIB0010.MP4', archivoActual: true });
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: '20260611_PIB0050.MP4', archivoActual: true });
  assert.strictEqual(s.sequenceSegments.length, 1);
  assert.strictEqual(logic.getCameraSequence(s, 'sony-main').segment.id, logic.getCameraSequence(s, 'sony-asesor').segment.id);
});

test('FX30: la toma de asesor continua la numeracion del video (mismo contador)', () => {
  let s = logic.createDefaultState();
  // sony-main inicia en 10; bumpCameraCounter la deja en 11
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: '20260611_PIB0010.MP4', archivoActual: true });
  s = logic.bumpCameraCounter(s, 'sony-main', 1); // counterNext pasa a 11
  // Inicia la camara de audio del asesor para que registerAsesorFile no aborte
  s = logic.initializeCameraSequence(s, { cameraId: 'tascam-asesor', lastFilename: '260611_0001.WAV', archivoActual: true });
  // Inicia (reusa) la secuencia Sony del asesor — debe reusar el segmento compartido
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-asesor', lastFilename: '20260611_PIB9999.MP4', archivoActual: true });
  s.asesorPuntos = [{ id: 'p1', nombre: 'Punto 1', tipo: 'normal', estado: 'pendiente', ordenLista: 1 }];
  s = logic.registerAsesorFile(s, { puntoId: 'p1' });
  const sonyFile = s.mediaFiles.find((f) => f.cameraId === 'sony-asesor');
  assert.ok(sonyFile, 'mediaFile de asesor con cameraId sony-asesor');
  // El numero del token debe ser el continuo (11), NO 1 ni 9999
  assert.match(sonyFile.fileToken, /0011/);
});

test('adoptarSegmentoFx30: sony-asesor adopta el segmento de sony-main SIN nombre de archivo', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: '20260611_PIB0010.MP4', archivoActual: true });
  const segMain = logic.getCameraSequence(s, 'sony-main').segment;
  assert.strictEqual(logic.getCameraSequence(s, 'sony-asesor').segment, undefined, 'asesor sin segmento aun');
  s = logic.adoptarSegmentoFx30(s, 'sony-asesor');
  const segAsesor = logic.getCameraSequence(s, 'sony-asesor').segment;
  assert.ok(segAsesor, 'asesor adopta un segmento');
  assert.strictEqual(segAsesor.id, segMain.id, 'mismo segmento que la FX30 principal');
  assert.strictEqual(s.sequenceSegments.length, 1, 'no se crea un segundo segmento');
  assert.strictEqual(s.activeCameraByMode.asesor, 'sony-asesor', 'queda como camara activa del modo');
});

test('adoptarSegmentoFx30: no-op si la pareja FX30 no tiene segmento', () => {
  let s = logic.createDefaultState();
  const antes = s;
  s = logic.adoptarSegmentoFx30(s, 'sony-asesor');
  assert.strictEqual(s, antes, 'estado sin cambios cuando no hay segmento que adoptar');
  assert.strictEqual(logic.getCameraSequence(s, 'sony-asesor').segment, undefined);
});

test('adoptarSegmentoFx30: no-op para una camara que no es FX30 (Tascam)', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: '20260611_PIB0010.MP4', archivoActual: true });
  const antes = s;
  s = logic.adoptarSegmentoFx30(s, 'tascam-asesor');
  assert.strictEqual(s, antes, 'la Tascam no comparte la secuencia de la FX30');
  assert.strictEqual(logic.getCameraSequence(s, 'tascam-asesor').segment, undefined);
});

// ─── Task 2.1 — servicios.drone como fuente unica de verdad para drone ──────

test('normalize: estado viejo con guide.incluirDrone=true conserva servicios.drone=true', () => {
  const s = logic.normalizeChecklistData({ version: 2, espacios: [], mediaFiles: [], cameras: [], sequenceSegments: [], servicios: { drone: false }, guide: { incluirDrone: true } });
  assert.strictEqual(s.servicios.drone, true);
});
test('normalize: ya no expone guide.incluirDrone', () => {
  const s = logic.normalizeChecklistData({ version: 2, espacios: [], mediaFiles: [], cameras: [], sequenceSegments: [], servicios: { drone: true }, guide: {} });
  assert.strictEqual(s.guide.incluirDrone, undefined);
});
test('normalize: servicios.drone true se conserva aunque no haya incluirDrone', () => {
  const s = logic.normalizeChecklistData({ version: 2, espacios: [], mediaFiles: [], cameras: [], sequenceSegments: [], servicios: { drone: true }, guide: {} });
  assert.strictEqual(s.servicios.drone, true);
});
