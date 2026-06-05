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
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Amenidades');
  const videoTarget = state.espacios[0];
  const droneTarget = state.droneItems.find((item) => item.nombre === 'Amenidades');
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_20260517111742_0245_D' });
  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: videoTarget.id, kind: 'take' });
  state = logic.registerMediaFile(state, { cameraId: 'drone-dji', targetId: droneTarget.id, kind: 'take' });
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
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Bodega');
  state.espacios[0].estados.video = { estado: 'no_aplica' };
  state.droneItems[0].noAplica = true;
  state = logic.initializeCameraSequence(state, { cameraId: 'sony-main', lastFilename: '20260520_PIB2818' });
  state = logic.initializeCameraSequence(state, { cameraId: 'drone-dji', lastFilename: 'DJI_20260517111742_0245_D' });

  state = logic.registerMediaFile(state, { cameraId: 'sony-main', targetId: state.espacios[0].id, kind: 'take' });
  state = logic.registerMediaFile(state, { cameraId: 'drone-dji', targetId: state.droneItems[0].id, kind: 'take' });

  assert.equal(state.mediaFiles.length, 0);
  assert.equal(logic.getCameraSequence(state, 'sony-main').nextToken, 'PIB2819');
  assert.equal(logic.getCameraSequence(state, 'drone-dji').nextToken, '0246');
});

test('does not register legacy captures for targets marked no aplica', () => {
  let state = logic.addSpacesFromText(logic.createDefaultState(), 'Bodega');
  state.espacios[0].estados.foto = { estado: 'no_aplica' };
  state.droneItems[0].noAplica = true;

  state = logic.registerCapture(state, { tipo: 'foto', targetId: state.espacios[0].id, autor: 'Ana' });
  state = logic.registerCapture(state, { tipo: 'drone', targetId: state.droneItems[0].id, autor: 'Bruno' });

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
