const test = require('node:test');
const assert = require('node:assert/strict');

const logic = require('./checklist-logic.js');

test('migrates legacy checklist format to version 2 with active services and drone defaults', () => {
  const migrated = logic.normalizeChecklistData({
    cuartos: [
      { nombre: 'Sala', foto: 'Ana', video: 'Bruno', t360: false },
      { nombre: 'Cocina', foto: false, video: false, t360: 'Luis' },
    ],
    columnas: { foto: true, video: true, t360: false },
  });

  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.servicios, { foto: true, t360: false, video: true, drone: true });
  assert.equal(migrated.espacios.length, 2);
  assert.equal(migrated.espacios[0].estados.foto.estado, 'hecho');
  assert.equal(migrated.espacios[0].estados.video.estado, 'hecho');
  assert.equal(migrated.espacios[1].estados.t360.estado, 'hecho');
  assert.equal(migrated.droneItems.length > 0, true);
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
  let state = logic.createDefaultState();
  state = logic.addSpacesFromText(state, 'Sala\nCocina');
  const salaId = state.espacios.find((item) => item.nombre === 'Sala').id;
  const cocinaId = state.espacios.find((item) => item.nombre === 'Cocina').id;
  const droneId = state.droneItems[0].id;

  state = logic.registerCapture(state, { tipo: 'video', targetId: salaId, autor: 'Bruno', now: new Date('2026-06-03T17:00:00Z') });
  state = logic.registerCapture(state, { tipo: 'video', targetId: cocinaId, autor: 'Bruno', now: new Date('2026-06-03T17:01:00Z') });
  state = logic.registerCapture(state, { tipo: 'drone', targetId: droneId, autor: 'Bruno', now: new Date('2026-06-03T17:02:00Z') });

  assert.equal(state.bitacora[0].orden, 1);
  assert.equal(state.bitacora[1].orden, 2);
  assert.equal(state.bitacora[2].orden, 1);
  assert.equal(state.espacios.find((item) => item.id === cocinaId).estados.video.ultimoOrden, 2);
  assert.equal(state.droneItems[0].estado, 'hecho');
  assert.equal(state.droneItems[0].ultimoOrden, 1);
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

test('registers discards and keeps camera counters independent', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala');
  const salaId = state.espacios[0].id;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_20260517111742_0245_D' });

  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: salaId, kind: 'discard', discardReason: 'empty' });
  state = logic.registerMediaFile(state, { cameraId: 'drone-dji', targetId: state.droneItems[0].id, kind: 'take' });

  assert.equal(state.mediaFiles[0].fileToken, 'PIB2819');
  assert.equal(state.mediaFiles[0].good, false);
  assert.equal(state.mediaFiles[0].discardReason, 'empty');
  assert.equal(state.mediaFiles[1].fileToken, '0246');
  assert.equal(logic.getCameraSequence(state, 'sony-main').nextToken, 'PIB2820');
  assert.equal(logic.getCameraSequence(state, 'drone-dji').nextToken, '0247');
});

test('inserts an omitted file and renumbers only later files in the same segment', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Sala\nCocina');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_20260517111742_0245_D' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: state.espacios[0].id, kind: 'take' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: state.espacios[1].id, kind: 'take' });
  state = logic.registerMediaFile(state, { cameraId: 'drone-dji', targetId: state.droneItems[0].id, kind: 'take' });

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
