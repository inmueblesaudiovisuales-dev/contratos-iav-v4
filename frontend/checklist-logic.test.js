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

test('F2: targetsForMode drone devuelve los mismos espacios que video', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala\nFachada');
  // El drone registra contra un espacio (no contra droneItems).
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_0245' });
  const fachadaId = state.espacios.find((e) => e.nombre === 'Fachada').id;
  state = logic.registerMediaFile(state, { cameraId: 'drone-dji', targetId: fachadaId, kind: 'take' });
  const file = state.mediaFiles[state.mediaFiles.length - 1];
  assert.equal(file.targetId, fachadaId, 'el target del drone es un espacio');
  assert.equal(file.scene, 'Fachada');
  // El estado de drone vive en el espacio.
  assert.equal(state.espacios.find((e) => e.id === fachadaId).estados.drone.estado, 'hecho');
  assert.deepEqual(state.droneItems, [], 'ya no hay droneItems como entidad');
});

test('F2: blankEstados incluye el servicio drone', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala');
  assert.ok(state.espacios[0].estados.drone, 'el espacio nuevo trae estado drone');
  assert.equal(state.espacios[0].estados.drone.estado, 'pendiente');
});

test('F2: getScenePath del drone usa ruta anidada como video', () => {
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Recamara principal\n  Bano principal');
  const bano = state.espacios.find((e) => e.nombre === 'Bano principal');
  const path = logic.getScenePath(state, bano.id, 'drone');
  assert.equal(path, 'Recamara principal > Bano principal');
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

test('buildExport incluye favorita y mantiene version 1', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: salaId, kind: 'take' });
  const id = state.mediaFiles[state.mediaFiles.length - 1].id;
  state = logic.toggleMediaFavorite(state, id);

  const out = logic.buildExport(state, { folio: 'F1', nombreCliente: 'X' });
  assert.equal(out.version, 1);
  const archivo = out.archivos.find((a) => a.favorita === true);
  assert.ok(archivo, 'el export incluye un archivo favorito');
  assert.equal(archivo.premiere.Favorite, true);
});

test('registers discards and keeps camera counters independent', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala\nFachada');
  const salaId = state.espacios[0].id;
  const fachadaId = state.espacios[1].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_20260517111742_0245_D' });

  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: salaId, kind: 'discard', discardReason: 'empty' });
  state = logic.registerMediaFile(state, { cameraId: 'drone-dji', targetId: fachadaId, kind: 'take' });

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
  state = logic.registerMediaFile(state, { cameraId: 'drone-dji', targetId: state.espacios[2].id, kind: 'take' });

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

test('separates video and drone scenes with the same name for review', () => {
  // Drone y video comparten el mismo espacio; getMediaSceneGroups las separa por modo.
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Amenidades');
  const target = state.espacios[0];
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_20260517111742_0245_D' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: target.id, kind: 'take' });
  state = logic.registerMediaFile(state, { cameraId: 'drone-dji', targetId: target.id, kind: 'take' });
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
  const state = logic.createDefaultState();
  assert.equal(Array.isArray(state.pisos), true);
  assert.equal(state.pisos.length > 0, true);
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
  assert.ok(s.cameras.some((c) => c.id === 'osmo-asesor' && c.mode === 'asesor' && c.role === 'audio'));
  assert.ok(Array.isArray(s.asesorPuntos) && s.asesorPuntos.length >= 2);
});

test('registerAsesorFile creates a linked Sony+Osmo pair for a normal point', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-asesor', lastFilename: '20260520_PIB2818' });
  s = logic.initializeCameraSequence(s, { cameraId: 'osmo-asesor', lastFilename: 'DJI_20260517111742_0245_D' });
  const punto = s.asesorPuntos[0];
  s = logic.registerAsesorFile(s, { puntoId: punto.id, kind: 'take', autor: 'Bruno' });
  assert.equal(s.mediaFiles.length, 2);
  assert.equal(s.mediaFiles[0].pairId, s.mediaFiles[1].pairId);
  const sony = s.mediaFiles.find((f) => f.cameraId === 'sony-asesor');
  const osmo = s.mediaFiles.find((f) => f.cameraId === 'osmo-asesor');
  assert.equal(sony.fileToken, 'PIB2819');
  assert.equal(osmo.fileToken, '0246');
  assert.equal(sony.scene, punto.nombre);
  assert.equal(s.asesorPuntos[0].estado, 'hecho');
});

test('registerAsesorFile on a voz point uses only the Osmo audio', () => {
  let s = logic.createDefaultState();
  s.asesorPuntos.push({ id: 'voz1', nombre: 'Voz en off', tipo: 'voz', estado: 'pendiente', ordenLista: 99 });
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-asesor', lastFilename: '20260520_PIB2818' });
  s = logic.initializeCameraSequence(s, { cameraId: 'osmo-asesor', lastFilename: 'DJI_20260517111742_0245_D' });
  s = logic.registerAsesorFile(s, { puntoId: 'voz1', kind: 'take', autor: 'Fer' });
  assert.equal(s.mediaFiles.length, 1);
  assert.equal(s.mediaFiles[0].cameraId, 'osmo-asesor');
  assert.equal(s.mediaFiles[0].fileToken, '0246');
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

test('buildExport links asesor pairs with the same par id', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-asesor', lastFilename: '20260520_PIB4810' });
  s = logic.initializeCameraSequence(s, { cameraId: 'osmo-asesor', lastFilename: 'DJI_20260520_0090_D' });
  s = logic.registerAsesorFile(s, { puntoId: s.asesorPuntos[0].id, kind: 'take', autor: 'Fer' });
  const exp = logic.buildExport(s, {});
  assert.equal(exp.archivos.length, 2);
  assert.equal(exp.archivos[0].par, exp.archivos[1].par);
  assert.equal(exp.archivos[0].servicio, 'asesor');
});

test('asesor pair keeps independent consecutives across two takes', () => {
  let s = logic.createDefaultState();
  s = logic.initializeCameraSequence(s, { cameraId: 'sony-asesor', lastFilename: '20260520_PIB2818' });
  s = logic.initializeCameraSequence(s, { cameraId: 'osmo-asesor', lastFilename: 'DJI_20260517111742_0245_D' });
  const punto = s.asesorPuntos[0];
  s = logic.registerAsesorFile(s, { puntoId: punto.id, kind: 'take' });
  s = logic.registerAsesorFile(s, { puntoId: punto.id, kind: 'take' });
  assert.equal(logic.getCameraSequence(s, 'sony-asesor').nextToken, 'PIB2821');
  assert.equal(logic.getCameraSequence(s, 'osmo-asesor').nextToken, '0248');
  assert.equal(s.mediaFiles.filter((f) => f.cameraId === 'sony-asesor').length, 2);
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

test('F4: buildExport version sigue siendo 1', () => {
  const state = logic.createDefaultState();
  const exp = logic.buildExport(state, {});
  assert.equal(exp.version, 1);
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

test('F14: buildPropuestaPrompt genera string con cuartos, descripcion y vocabulario', () => {
  const state = makeStateWithProposal();
  const prompt = logic.buildPropuestaPrompt(state);

  assert.equal(typeof prompt, 'string', 'debe ser string');
  assert.ok(prompt.length > 100, 'debe tener contenido sustancial');
  assert.ok(prompt.includes('Casa amplia con doble altura'), 'debe incluir descripcion');
  assert.ok(prompt.includes('Sala'), 'debe incluir nombre del cuarto Sala');
  assert.ok(prompt.includes('Cocina'), 'debe incluir nombre del cuarto Cocina');
  assert.ok(prompt.includes('porCuarto'), 'debe incluir esquema de respuesta JSON');
  const firstType = Object.keys(logic.getShotTypes())[0];
  assert.ok(prompt.includes(firstType), 'debe incluir al menos un id de shotType');
  const firstMov = Object.keys(logic.getMovements())[0];
  assert.ok(prompt.includes(firstMov), 'debe incluir al menos un id de movement');
});

// G1 (R85) — prompt reforzado con reglas duras
test('G1: buildPropuestaPrompt incluye regla de basarse estrictamente en descripcion', () => {
  const state = makeStateWithProposal();
  const prompt = logic.buildPropuestaPrompt(state);
  assert.ok(prompt.includes('ESTRICTAMENTE'), 'debe incluir clausula ESTRICTAMENTE');
  assert.ok(prompt.includes('PROHIBIDO inventar'), 'debe prohibir inventar features');
});

test('G1: buildPropuestaPrompt incluye regla de solo encuadre/composicion en enfoque', () => {
  const state = makeStateWithProposal();
  const prompt = logic.buildPropuestaPrompt(state);
  assert.ok(prompt.includes('encuadre y composicion'), 'debe mencionar encuadre y composicion');
  assert.ok(prompt.includes('NADA de hora del dia'), 'debe prohibir hora del dia');
});

test('G1: buildPropuestaPrompt incluye regla de solo cuartos de la lista', () => {
  const state = makeStateWithProposal();
  const prompt = logic.buildPropuestaPrompt(state);
  assert.ok(prompt.includes('SOLO para cuartos de la lista'), 'debe restringir a cuartos de la lista');
});

test('G1: buildPropuestaPrompt incluye clausula de descripcion vacia devuelve objeto vacio', () => {
  const state = makeStateWithProposal();
  const prompt = logic.buildPropuestaPrompt(state);
  assert.ok(prompt.includes('{"porCuarto":{}}'), 'debe mencionar el JSON vacio para descripcion generica');
});

test('G1: buildPropuestaPrompt indica responder UNICAMENTE con JSON sin markdown', () => {
  const state = makeStateWithProposal();
  const prompt = logic.buildPropuestaPrompt(state);
  assert.ok(prompt.includes('sin markdown'), 'debe prohibir markdown en la respuesta');
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
  assert.deepEqual(logic.CURATED_MOVEMENTS, ['push_in', 'pull_out', 'pan', 'tilt', 'travel', 'orbit', 'reveal']);
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

  // Drone: mismo plano + movimiento.
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_0245' });
  state = logic.registerMediaFile(state, {
    cameraId: 'drone-dji',
    targetId: salaId,
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
  assert.equal(out.version, 1);
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

test('F17 (C): buildExport lleva el label aereo por archivo de drone sin cambiar version:1', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Fachada aerea');
  const fachadaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_0245' });
  state = logic.registerMediaFile(state, {
    cameraId: 'drone-dji',
    targetId: fachadaId,
    kind: 'take',
    autor: 'Bruno',
    shotType: 'orbita',
    movement: 'orbit',
    suggestionId: 'aereo.orbita.completa',
  });

  const exp = logic.buildExport(state, { folio: 'IAV-1', nombreCliente: 'Cliente X' });
  assert.equal(exp.version, 1, 'version sigue siendo 1');

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
  assert.ok(logic.createDefaultState().pisos.includes('Drone'), 'el piso Drone existe en los pisos por defecto');
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

test('F18: camerasForEspacio en exterior/roof/amenidades devuelve Sony/Osmo + dos drones', () => {
  const state = logic.createDefaultState();
  for (const zona of ['exterior', 'roof', 'amenidades']) {
    const cams = logic.camerasForEspacio(state, { piso: 'Exterior', zona });
    const drones = cams.filter((c) => c.mode === 'drone');
    assert.equal(drones.length, 2, zona + ': incluye los dos drones');
    assert.ok(cams.some((c) => c.id === 'sony-main'), zona + ': incluye Sony');
    assert.ok(cams.some((c) => c.id === 'osmo-pocket-3'), zona + ': incluye Osmo');
  }
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
