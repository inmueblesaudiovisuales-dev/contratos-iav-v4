(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IAVChecklistLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const SERVICES_DEFAULT = { foto: true, t360: true, video: true, drone: true, asesor: true };
  const SERVICE_LABELS = { foto: 'Foto', t360: '360', video: 'Video', drone: 'Drone', asesor: 'Asesores' };
  const CAMERA_DEFAULTS = [
    { id: 'sony-main', label: 'Sony principal', mode: 'video', kind: 'sony' },
    { id: 'osmo-pocket-3', label: 'Osmo Pocket 3', mode: 'video', kind: 'dji', optional: true },
    { id: 'drone-dji', label: 'Drone DJI', mode: 'drone', kind: 'dji' },
    { id: 'sony-asesor', label: 'Sony FX30', mode: 'asesor', kind: 'sony', role: 'video' },
    { id: 'osmo-asesor', label: 'Osmo + DJI Mic', mode: 'asesor', kind: 'dji', role: 'audio' },
  ];
  const ASESOR_DEFAULTS = [
    { nombre: 'Introducción', tipo: 'normal' },
    { nombre: 'Despedida', tipo: 'normal' },
  ];
  function createAsesorPuntos() {
    return ASESOR_DEFAULTS.map((p, index) => ({
      id: 'asesor-default-' + index, nombre: p.nombre, tipo: p.tipo, estado: 'pendiente', ordenLista: index + 1,
    }));
  }
  const DRONE_DEFAULTS = [
    'Fachada aerea',
    'Vista general de propiedad',
    'Calle / acceso',
    'Entorno / ubicacion',
    'Amenidades',
    'Terreno completo',
    'Roof / terraza',
    'Toma de cierre',
  ];
  const TEMPLATE_DEFS = {
    casa: {
      label: 'Casa residencial',
      description: 'Interior, exterior, recamaras y servicios comunes.',
      spaces: [
        ['Fachada', 'exterior', true],
        ['Cochera', 'exterior', false],
        ['Jardin / Terraza', 'exterior', true],
        ['Patio', 'exterior', false],
        ['Acceso / Recibidor', 'interior', false],
        ['Sala', 'interior', true],
        ['Comedor', 'interior', false],
        ['Cocina', 'interior', true],
        ['Bano de visitas', 'interior', false],
        ['Recamara principal', 'interior', true],
        ['Bano principal', 'interior', false, 'Recamara principal'],
        ['Closet', 'interior', false, 'Recamara principal'],
        ['Recamara 2', 'interior', false],
        ['Bano', 'interior', false, 'Recamara 2'],
        ['Recamara 3', 'interior', false],
        ['Lavanderia', 'interior', false],
      ],
    },
    departamento: {
      label: 'Departamento',
      description: 'Departamento con interiores y amenidades del edificio.',
      spaces: [
        ['Acceso', 'interior', false],
        ['Sala', 'interior', true],
        ['Comedor', 'interior', false],
        ['Cocina', 'interior', true],
        ['Bano de visitas', 'interior', false],
        ['Recamara principal', 'interior', true],
        ['Bano principal', 'interior', false, 'Recamara principal'],
        ['Closet', 'interior', false, 'Recamara principal'],
        ['Recamara secundaria', 'interior', false],
        ['Balcon / Terraza', 'exterior', true],
        ['Lavanderia', 'interior', false],
        ['Lobby', 'amenidades', true],
        ['Alberca', 'amenidades', true],
        ['Gimnasio', 'amenidades', true],
        ['Salon de eventos', 'amenidades', false],
        ['Terraza comun', 'amenidades', true],
        ['Asadores', 'amenidades', false],
      ],
    },
    terreno: {
      label: 'Terreno',
      description: 'Perimetro, accesos, entorno y vistas generales.',
      spaces: [
        ['Frente del terreno', 'exterior', true],
        ['Vista desde calle', 'exterior', true],
        ['Lateral izquierdo', 'exterior', false],
        ['Lateral derecho', 'exterior', false],
        ['Fondo', 'exterior', false],
        ['Vista panoramica', 'exterior', true],
        ['Acceso', 'exterior', true],
        ['Servicios / entorno', 'exterior', false],
      ],
    },
    amenidades: {
      label: 'Amenidades',
      description: 'Areas comunes que venden el desarrollo o edificio.',
      spaces: [
        ['Alberca', 'amenidades', true],
        ['Gimnasio', 'amenidades', true],
        ['Lobby', 'amenidades', true],
        ['Salon de eventos', 'amenidades', false],
        ['Terraza comun', 'amenidades', true],
        ['Asadores', 'amenidades', false],
        ['Area infantil', 'amenidades', false],
        ['Cancha', 'amenidades', false],
        ['Cowork', 'amenidades', false],
        ['Jardines', 'amenidades', true],
        ['Estacionamiento de visitas', 'amenidades', false],
        ['Acceso / Caseta', 'amenidades', true],
        ['Elevadores', 'amenidades', false],
        ['Pasillos / areas comunes', 'amenidades', false],
      ],
    },
    exterior_drone: {
      label: 'Exterior / Drone',
      description: 'Exteriores de apoyo y tomas aereas base.',
      spaces: [
        ['Fachada', 'exterior', true],
        ['Calle / acceso', 'exterior', true],
        ['Cochera', 'exterior', false],
        ['Jardin', 'exterior', false],
        ['Terraza', 'exterior', true],
        ['Roof garden', 'exterior', true],
        ['Vista exterior', 'exterior', false],
      ],
      drone: [
        'Fachada aerea',
        'Vista general de propiedad',
        'Calle / acceso',
        'Entorno / ubicacion',
        'Amenidades aereas',
        'Terreno completo',
        'Roof / terraza',
        'Toma de cierre',
      ],
    },
    quinta: {
      label: 'Quinta',
      description: 'Casa principal, exteriores y amenidades de recreo.',
      spaces: [
        ['Fachada', 'exterior', true, null, 'Exterior'],
        ['Acceso / Caseta', 'exterior', false, null, 'Exterior'],
        ['Estacionamiento', 'exterior', false, null, 'Exterior'],
        ['Sala', 'interior', true, null, 'Casa principal'],
        ['Comedor', 'interior', false, null, 'Casa principal'],
        ['Cocina', 'interior', true, null, 'Casa principal'],
        ['Recamara principal', 'interior', true, null, 'Casa principal'],
        ['Bano principal', 'interior', false, 'Recamara principal', 'Casa principal'],
        ['Recamara 2', 'interior', false, null, 'Casa principal'],
        ['Bano de visitas', 'interior', false, null, 'Casa principal'],
        ['Alberca', 'amenidades', true, null, 'Amenidades'],
        ['Palapa', 'amenidades', true, null, 'Amenidades'],
        ['Asadores', 'amenidades', false, null, 'Amenidades'],
        ['Cocina exterior', 'amenidades', false, null, 'Amenidades'],
        ['Jardines', 'amenidades', true, null, 'Amenidades'],
        ['Cancha', 'amenidades', false, null, 'Amenidades'],
        ['Cabanas', 'amenidades', false, null, 'Amenidades'],
        ['Bano de alberca', 'amenidades', false, null, 'Amenidades'],
      ],
    },
  };

  const SPACE_SUGGESTIONS = {
    casa: TEMPLATE_DEFS.casa.spaces,
    departamento: TEMPLATE_DEFS.departamento.spaces,
    terreno: TEMPLATE_DEFS.terreno.spaces,
    quinta: TEMPLATE_DEFS.quinta.spaces,
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function blankEstados() {
    return {
      foto: { estado: 'pendiente' },
      t360: { estado: 'pendiente' },
      video: { estado: 'pendiente' },
    };
  }

  function normalizeZone(value) {
    return value || 'interior';
  }

  const PISOS_DEFAULT = ['Exterior', 'Piso 1', 'Piso 2', 'Amenidades'];

  function pisoFromZona(zona) {
    if (zona === 'amenidades') return 'Amenidades';
    if (zona === 'exterior') return 'Exterior';
    if (zona === 'interior') return 'Piso 1';
    return 'Sin piso';
  }

  function derivePisos(espacios) {
    const seen = [];
    (espacios || []).forEach((space) => {
      if (space.piso && !seen.includes(space.piso)) seen.push(space.piso);
    });
    return seen.length ? seen : PISOS_DEFAULT.slice();
  }

  function createDroneItems() {
    return DRONE_DEFAULTS.map((nombre, index) => ({
      id: 'drone-default-' + index,
      nombre,
      estado: 'pendiente',
      ordenLista: index + 1,
    }));
  }

  function createDefaultState() {
    return {
      version: 2,
      servicios: clone(SERVICES_DEFAULT),
      pisos: PISOS_DEFAULT.slice(),
      modoActual: 'video',
      espacios: [],
      droneItems: createDroneItems(),
      asesorPuntos: createAsesorPuntos(),
      recorrido: {},
      bitacora: [],
      cameras: clone(CAMERA_DEFAULTS),
      activeCameraByMode: { video: 'sony-main', drone: 'drone-dji' },
      sequenceSegments: [],
      mediaFiles: [],
    };
  }

  function legacyValueToState(value) {
    if (!value) return { estado: 'pendiente' };
    return { estado: 'hecho', autor: typeof value === 'string' ? value : '', hora: '' };
  }

  function normalizeChecklistData(data) {
    if (data && data.version === 2) {
      const normalized = Object.assign(createDefaultState(), clone(data));
      normalized.servicios = Object.assign(clone(SERVICES_DEFAULT), normalized.servicios || {});
      normalized.espacios = (normalized.espacios || []).map((space, index) => ({
        id: space.id || makeId('esp'),
        nombre: space.nombre || 'Espacio sin nombre',
        parentId: space.parentId || null,
        orden: space.orden || index + 1,
        clave: !!space.clave,
        zona: normalizeZone(space.zona),
        piso: space.piso || pisoFromZona(normalizeZone(space.zona)),
        estados: Object.assign(blankEstados(), space.estados || {}),
      }));
      normalized.pisos = Array.isArray(data.pisos) && data.pisos.length ? data.pisos.slice() : derivePisos(normalized.espacios);
      normalized.droneItems = (normalized.droneItems && normalized.droneItems.length ? normalized.droneItems : createDroneItems())
        .map((item, index) => ({
          id: item.id || makeId('drone'),
          nombre: item.nombre || 'Toma drone',
          estado: item.estado || 'pendiente',
          ordenLista: item.ordenLista || index + 1,
          ultimoOrden: item.ultimoOrden || null,
          noAplica: !!item.noAplica,
        }));
      normalized.asesorPuntos = (normalized.asesorPuntos && normalized.asesorPuntos.length ? normalized.asesorPuntos : createAsesorPuntos())
        .map((p, index) => ({
          id: p.id || makeId('asesor'),
          nombre: p.nombre || 'Punto',
          tipo: p.tipo === 'voz' ? 'voz' : 'normal',
          estado: p.estado || 'pendiente',
          ordenLista: p.ordenLista || index + 1,
        }));
      normalized.bitacora = normalized.bitacora || [];
      const savedCameras = normalized.cameras || [];
      normalized.cameras = CAMERA_DEFAULTS.map((camera) => Object.assign({}, camera, savedCameras.find((item) => item.id === camera.id) || {}))
        .concat(savedCameras.filter((camera) => !CAMERA_DEFAULTS.some((item) => item.id === camera.id)));
      normalized.activeCameraByMode = Object.assign({ video: 'sony-main', drone: 'drone-dji' }, normalized.activeCameraByMode || {});
      ['video', 'drone'].forEach((mode) => {
        if (!normalized.cameras.some((camera) => camera.id === normalized.activeCameraByMode[mode] && camera.mode === mode)) {
          normalized.activeCameraByMode[mode] = normalized.cameras.find((camera) => camera.mode === mode).id;
        }
      });
      normalized.sequenceSegments = normalized.sequenceSegments || [];
      normalized.mediaFiles = normalized.mediaFiles || [];
      normalized.mediaFiles.forEach((file) => {
        const camera = normalized.cameras.find((item) => item.id === file.cameraId);
        const targets = camera ? targetsForMode(normalized, camera.mode) : [];
        if (!camera || (file.targetId && !targets.some((target) => target.id === file.targetId))) {
          file.targetId = null;
          file.scene = 'Sin identificar';
          file.scenePath = 'Sin identificar';
          file.kind = 'omitted';
          file.discardReason = null;
          file.good = false;
          file.shotNumber = null;
        }
      });
      normalized.sequenceSegments.forEach((segment) => {
        const counters = normalized.mediaFiles.filter((file) => file.segmentId === segment.id).map((file) => file.fileCounter);
        if (counters.length) segment.counterNext = Math.max(segment.counterNext || 0, Math.max(...counters) + 1);
      });
      if (normalized.mediaFiles.length) repairDerivedMediaState(normalized);
      return normalized;
    }

    const base = createDefaultState();
    const legacyRooms = data && Array.isArray(data.cuartos) ? data.cuartos : [];
    const legacyCols = data && data.columnas ? data.columnas : {};
    base.servicios = {
      foto: legacyCols.foto !== false,
      t360: legacyCols.t360 !== false,
      video: legacyCols.video !== false,
      drone: true,
    };
    base.espacios = legacyRooms.map((room, index) => ({
      id: room.id || 'legacy-' + index,
      nombre: room.nombre || 'Espacio sin nombre',
      parentId: null,
      orden: index + 1,
      clave: false,
      zona: 'interior',
      piso: pisoFromZona('interior'),
      estados: {
        foto: legacyValueToState(room.foto || room.completado),
        t360: legacyValueToState(room.t360 || room.completado),
        video: legacyValueToState(room.video || room.completado),
      },
    }));
    base.pisos = derivePisos(base.espacios);
    return base;
  }

  function parseFilenameSequence(filename, cameraKind) {
    const value = String(filename || '').trim();
    const stem = value.replace(/\.[^.]+$/, '');
    const matches = [...stem.matchAll(/\d+/g)];
    if (!matches.length) return null;
    const counterMatch = matches[matches.length - 1];
    const counterText = counterMatch[0];
    const before = stem.slice(0, counterMatch.index);
    const after = stem.slice(counterMatch.index + counterText.length);
    const letterPrefix = (before.match(/[A-Za-z]+$/) || [''])[0];
    return {
      counter: Number(counterText),
      counterWidth: counterText.length,
      prefixHint: cameraKind === 'dji' ? '' : letterPrefix,
      suffixHint: after,
      exampleFilename: value,
    };
  }

  function formatFileToken(segment, counter) {
    return (segment.prefixHint || '') + String(counter).padStart(segment.counterWidth || 1, '0');
  }

  function getCamera(state, cameraId) {
    return (state.cameras || []).find((camera) => camera.id === cameraId);
  }

  function getCameraSequence(state, cameraId) {
    const camera = getCamera(state, cameraId);
    const segment = (state.sequenceSegments || []).find((item) => item.id === (camera && camera.activeSegmentId));
    return {
      camera,
      segment,
      nextToken: segment ? formatFileToken(segment, segment.counterNext) : '',
    };
  }

  function initializeCameraSequence(state, options) {
    const next = clone(state);
    const camera = getCamera(next, options.cameraId);
    if (!camera) return next;
    const parsed = parseFilenameSequence(options.lastFilename, camera.kind);
    if (!parsed) return next;
    const segment = Object.assign({
      id: makeId('segment'),
      cameraId: camera.id,
      counterStart: parsed.counter + 1,
      counterNext: parsed.counter + 1,
      createdAt: new Date().toISOString(),
    }, parsed);
    next.sequenceSegments.push(segment);
    camera.activeSegmentId = segment.id;
    next.activeCameraByMode[camera.mode] = camera.id;
    return next;
  }

  function targetsForMode(state, mode) {
    if (mode === 'drone') return state.droneItems || [];
    if (mode === 'asesor') return state.asesorPuntos || [];
    return state.espacios || [];
  }

  function getScenePath(state, targetId, mode) {
    const list = targetsForMode(state, mode);
    const target = list.find((item) => item.id === targetId);
    if (!target) return 'Sin identificar';
    if (mode === 'drone' || mode === 'asesor') return target.nombre;
    const names = [];
    const visited = new Set();
    let current = target;
    while (current && !visited.has(current.id)) {
      names.unshift(current.nombre);
      visited.add(current.id);
      current = current.parentId && state.espacios.find((item) => item.id === current.parentId);
    }
    return names.join(' > ');
  }

  function getDescendantIds(state, targetId) {
    const ids = new Set([targetId]);
    let found = true;
    while (found) {
      found = false;
      state.espacios.forEach((space) => {
        if (space.parentId && ids.has(space.parentId) && !ids.has(space.id)) {
          ids.add(space.id);
          found = true;
        }
      });
    }
    return [...ids];
  }

  function getSceneData(state, camera, targetId) {
    const list = targetsForMode(state, camera.mode);
    const target = list.find((item) => item.id === targetId);
    if (!target) return { scene: 'Sin identificar', scenePath: 'Sin identificar' };
    return { scene: target.nombre, scenePath: getScenePath(state, targetId, camera.mode) };
  }

  function getMediaSceneGroups(state) {
    const groups = new Map();
    (state.mediaFiles || []).forEach((file) => {
      const camera = getCamera(state, file.cameraId);
      const mode = camera ? camera.mode : 'unknown';
      const scenePath = file.scenePath || 'Sin identificar';
      const key = `${mode}:${scenePath}`;
      if (!groups.has(key)) groups.set(key, { key, mode, scenePath, files: [] });
      groups.get(key).files.push(file);
    });
    return [...groups.values()].map((group) => Object.assign(group, {
      hasTake: group.files.some((file) => file.kind === 'take'),
      hasGood: group.files.some((file) => file.kind === 'take' && file.good),
      goodCount: group.files.filter((file) => file.kind === 'take' && file.good).length,
    }));
  }

  function targetIsNoAplica(state, mode, targetId) {
    if (mode === 'drone') {
      const item = state.droneItems.find((entry) => entry.id === targetId);
      return !item || item.noAplica;
    }
    const space = state.espacios.find((entry) => entry.id === targetId);
    return !space || (space.estados.video || {}).estado === 'no_aplica';
  }

  function deriveMediaTargetState(state, camera, targetId) {
    const cameraIds = new Set(state.cameras.filter((item) => item.mode === camera.mode).map((item) => item.id));
    const files = state.mediaFiles.filter((file) => cameraIds.has(file.cameraId) && file.targetId === targetId && file.kind === 'take');
    if (camera.mode === 'drone') {
      const item = state.droneItems.find((entry) => entry.id === targetId);
      if (item) item.estado = files.length ? 'hecho' : 'pendiente';
      return;
    }
    if (camera.mode === 'asesor') {
      const punto = (state.asesorPuntos || []).find((entry) => entry.id === targetId);
      if (punto) punto.estado = files.length ? 'hecho' : 'pendiente';
      return;
    }
    const space = state.espacios.find((entry) => entry.id === targetId);
    if (space && files.length) space.estados.video = { estado: 'hecho' };
    else if (space && (space.estados.video || {}).estado !== 'no_aplica') space.estados.video = { estado: 'pendiente' };
  }

  function renumberTargetShots(state, cameraId, targetId) {
    let shotNumber = 0;
    state.mediaFiles.forEach((file) => {
      if (file.cameraId === cameraId && file.targetId === targetId && file.kind === 'take') {
        shotNumber++;
        file.shotNumber = shotNumber;
      }
    });
  }

  function repairDerivedMediaState(state) {
    state.espacios.forEach((space) => {
      const camera = state.cameras.find((item) => item.mode === 'video');
      if (camera) deriveMediaTargetState(state, camera, space.id);
    });
    state.droneItems.forEach((item) => {
      const camera = state.cameras.find((entry) => entry.mode === 'drone');
      if (camera) deriveMediaTargetState(state, camera, item.id);
    });
    (state.asesorPuntos || []).forEach((punto) => {
      const camera = state.cameras.find((entry) => entry.mode === 'asesor');
      if (camera) deriveMediaTargetState(state, camera, punto.id);
    });
    state.cameras.forEach((camera) => {
      const targets = targetsForMode(state, camera.mode);
      targets.forEach((target) => renumberTargetShots(state, camera.id, target.id));
    });
  }

  function registerMediaFile(state, options) {
    const next = clone(state);
    const camera = getCamera(next, options.cameraId);
    const sequence = getCameraSequence(next, options.cameraId);
    if (!camera || !sequence.segment) return state;
    const kind = options.kind || 'take';
    if (options.discardReason !== 'unrelated' && targetIsNoAplica(next, camera.mode, options.targetId)) return state;
    const sceneData = options.discardReason === 'unrelated'
      ? { scene: 'Sin escena', scenePath: 'Sin escena' }
      : getSceneData(next, camera, options.targetId);
    const shotNumber = kind === 'take'
      ? next.mediaFiles.filter((file) => file.cameraId === camera.id && file.targetId === options.targetId && file.kind === 'take').length + 1
      : null;
    next.mediaFiles.push({
      id: makeId('media'),
      cameraId: camera.id,
      segmentId: sequence.segment.id,
      fileCounter: sequence.segment.counterNext,
      fileToken: formatFileToken(sequence.segment, sequence.segment.counterNext),
      targetId: options.targetId || null,
      scene: sceneData.scene,
      scenePath: sceneData.scenePath,
      shotNumber,
      kind,
      discardReason: options.discardReason || null,
      good: false,
      note: options.note || '',
      author: options.autor || 'Anonimo',
      createdAt: options.now ? new Date(options.now).toISOString() : new Date().toISOString(),
    });
    const activeSegment = next.sequenceSegments.find((item) => item.id === sequence.segment.id);
    activeSegment.counterNext++;
    if (kind === 'take' && options.targetId) deriveMediaTargetState(next, camera, options.targetId);
    return next;
  }

  function registerAsesorFile(state, options) {
    const punto = (state.asesorPuntos || []).find((p) => p.id === options.puntoId);
    if (!punto) return state;
    const cams = punto.tipo === 'voz' ? ['osmo-asesor'] : ['sony-asesor', 'osmo-asesor'];
    for (let i = 0; i < cams.length; i++) {
      if (!getCameraSequence(state, cams[i]).segment) return state;
    }
    const next = clone(state);
    const nextPunto = next.asesorPuntos.find((p) => p.id === options.puntoId);
    const kind = options.kind || 'take';
    const pairId = makeId('pair');
    cams.forEach((cid) => {
      const camera = getCamera(next, cid);
      const sequence = getCameraSequence(next, cid);
      const shotNumber = kind === 'take'
        ? next.mediaFiles.filter((file) => file.cameraId === cid && file.targetId === options.puntoId && file.kind === 'take').length + 1
        : null;
      next.mediaFiles.push({
        id: makeId('media'),
        cameraId: cid,
        segmentId: sequence.segment.id,
        fileCounter: sequence.segment.counterNext,
        fileToken: formatFileToken(sequence.segment, sequence.segment.counterNext),
        targetId: options.puntoId,
        scene: punto.nombre,
        scenePath: punto.nombre,
        shotNumber,
        kind,
        discardReason: options.discardReason || null,
        good: false,
        note: options.note || '',
        pairId,
        role: camera.role,
        author: options.autor || 'Anonimo',
        createdAt: options.now ? new Date(options.now).toISOString() : new Date().toISOString(),
      });
      const activeSegment = next.sequenceSegments.find((item) => item.id === sequence.segment.id);
      activeSegment.counterNext++;
    });
    if (kind === 'take') nextPunto.estado = 'hecho';
    return next;
  }

  function toggleMediaGood(state, mediaId) {
    const next = clone(state);
    const file = next.mediaFiles.find((item) => item.id === mediaId);
    if (file && file.kind === 'take') file.good = !file.good;
    return next;
  }

  function insertOmittedMediaFile(state, beforeMediaId) {
    const next = clone(state);
    const index = next.mediaFiles.findIndex((item) => item.id === beforeMediaId);
    if (index < 0) return next;
    const before = next.mediaFiles[index];
    const segment = next.sequenceSegments.find((item) => item.id === before.segmentId);
    if (!segment) return next;
    const insertedCounter = before.fileCounter;
    next.mediaFiles.forEach((file) => {
      if (file.segmentId === segment.id && file.fileCounter >= insertedCounter) {
        file.fileCounter++;
        file.fileToken = formatFileToken(segment, file.fileCounter);
      }
    });
    next.mediaFiles.splice(index, 0, {
      id: makeId('media'),
      cameraId: before.cameraId,
      segmentId: before.segmentId,
      fileCounter: insertedCounter,
      fileToken: formatFileToken(segment, insertedCounter),
      targetId: null,
      scene: 'Sin identificar',
      scenePath: 'Sin identificar',
      shotNumber: null,
      kind: 'omitted',
      discardReason: null,
      good: false,
      note: '',
      author: 'Anonimo',
      createdAt: new Date().toISOString(),
    });
    segment.counterNext++;
    return next;
  }

  function updateMediaFile(state, mediaId, changes) {
    const next = clone(state);
    const file = next.mediaFiles.find((item) => item.id === mediaId);
    if (!file) return next;
    const camera = getCamera(next, file.cameraId);
    const previousTargetId = file.targetId;
    if (changes.targetId !== undefined) {
      file.targetId = changes.targetId;
      const sceneData = getSceneData(next, camera, changes.targetId);
      file.scene = sceneData.scene;
      file.scenePath = sceneData.scenePath;
    }
    if (changes.kind) file.kind = changes.kind;
    if (changes.discardReason !== undefined) file.discardReason = changes.discardReason;
    if (changes.note !== undefined) file.note = changes.note;
    if (file.kind === 'discard' && file.discardReason === 'unrelated') {
      file.targetId = null;
      file.scene = 'Sin escena';
      file.scenePath = 'Sin escena';
    }
    if (file.kind === 'take') {
      file.discardReason = null;
      file.shotNumber = next.mediaFiles.filter((item) => item.id !== file.id && item.cameraId === file.cameraId && item.targetId === file.targetId && item.kind === 'take').length + 1;
    } else {
      file.good = false;
      file.shotNumber = null;
    }
    if (camera && previousTargetId) {
      renumberTargetShots(next, camera.id, previousTargetId);
      deriveMediaTargetState(next, camera, previousTargetId);
    }
    if (camera && file.targetId) {
      renumberTargetShots(next, camera.id, file.targetId);
      deriveMediaTargetState(next, camera, file.targetId);
    }
    return next;
  }

  function removeMediaFile(state, mediaId) {
    const next = clone(state);
    const index = next.mediaFiles.findIndex((item) => item.id === mediaId);
    if (index < 0) return next;
    const removed = next.mediaFiles[index];
    const camera = getCamera(next, removed.cameraId);
    const segment = next.sequenceSegments.find((item) => item.id === removed.segmentId);
    next.mediaFiles.splice(index, 1);
    if (segment) {
      next.mediaFiles.forEach((file) => {
        if (file.segmentId === segment.id && file.fileCounter > removed.fileCounter) {
          file.fileCounter--;
          file.fileToken = formatFileToken(segment, file.fileCounter);
        }
      });
      segment.counterNext = Math.max(segment.counterStart || 0, segment.counterNext - 1);
    }
    if (camera && removed.targetId) {
      renumberTargetShots(next, camera.id, removed.targetId);
      deriveMediaTargetState(next, camera, removed.targetId);
    }
    return next;
  }

  function parseSpacesText(text) {
    const result = [];
    const stack = [];
    String(text || '').split(/\r?\n/).forEach((rawLine) => {
      if (!rawLine.trim()) return;
      const arrowParts = rawLine.split('>').map((part) => part.trim()).filter(Boolean);
      if (arrowParts.length > 1) {
        let parentId = null;
        arrowParts.forEach((name) => {
          let existing = result.find((item) => item.nombre === name && item.parentId === parentId);
          if (!existing) {
            existing = { id: makeId('esp'), nombre: name, parentId, orden: result.length + 1 };
            result.push(existing);
          }
          parentId = existing.id;
        });
        return;
      }
      const indent = rawLine.match(/^\s*/)[0].replace(/\t/g, '  ').length;
      const level = Math.floor(indent / 2);
      const item = { id: makeId('esp'), nombre: rawLine.trim(), parentId: null, orden: result.length + 1 };
      if (level > 0 && stack[level - 1]) item.parentId = stack[level - 1].id;
      stack[level] = item;
      stack.length = level + 1;
      result.push(item);
    });
    return result;
  }

  function addSpacesFromText(state, text, options) {
    const next = clone(state);
    const zone = normalizeZone(options && options.zona);
    const parsed = parseSpacesText(text);
    parsed.forEach((item) => {
      next.espacios.push({
        id: item.id,
        nombre: item.nombre,
        parentId: item.parentId,
        orden: next.espacios.length + 1,
        clave: false,
        zona: zone,
        estados: blankEstados(),
      });
    });
    return next;
  }

  function buildTemplateSpaces(template) {
    const spaces = [];
    const byName = {};
    template.spaces.forEach((row) => {
      const item = {
        id: makeId('esp'),
        nombre: row[0],
        zona: row[1],
        clave: !!row[2],
        parentId: null,
        orden: spaces.length + 1,
        piso: row[4] || pisoFromZona(row[1]),
        estados: blankEstados(),
      };
      if (row[3] && byName[row[3]]) item.parentId = byName[row[3]].id;
      spaces.push(item);
      byName[item.nombre] = item;
    });
    return spaces;
  }

  function applyTemplate(state, key, options) {
    const template = TEMPLATE_DEFS[key];
    if (!template) return clone(state);
    const mode = (options && options.mode) || 'append';
    const next = mode === 'replace' ? createDefaultState() : clone(state);
    if (mode === 'replace') {
      next.servicios = clone(state.servicios || SERVICES_DEFAULT);
      next.modoActual = state.modoActual || 'video';
    }
    buildTemplateSpaces(template).forEach((space) => {
      space.orden = next.espacios.length + 1;
      next.espacios.push(space);
    });
    if (template.drone) {
      next.droneItems = template.drone.map((nombre, index) => ({
        id: makeId('drone'),
        nombre,
        estado: 'pendiente',
        ordenLista: index + 1,
      }));
    }
    return next;
  }

  function setServiceActive(state, service, active) {
    const next = clone(state);
    next.servicios[service] = !!active;
    if (!next.servicios[next.modoActual]) {
      next.modoActual = Object.keys(next.servicios).find((key) => next.servicios[key]) || 'video';
    }
    return next;
  }

  function getNextOrder(state, tipo) {
    return state.bitacora.filter((entry) => entry.tipo === tipo && entry.orden).length + 1;
  }

  function formatTime(now) {
    const date = now instanceof Date ? now : new Date();
    return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
  }

  function findTargetName(state, tipo, targetId) {
    const list = tipo === 'drone' ? state.droneItems : state.espacios;
    const item = list.find((entry) => entry.id === targetId);
    return item ? item.nombre : '';
  }

  function registerCapture(state, options) {
    const next = clone(state);
    const tipo = options.tipo;
    const targetId = options.targetId;
    const intencion = options.intencion || 'principal';
    if (tipo !== 'drone') {
      const existingSpace = next.espacios.find((entry) => entry.id === targetId);
      const existingState = existingSpace && existingSpace.estados[tipo];
      if (!existingSpace || (existingState && existingState.estado === 'no_aplica')) return state;
      if (existingState && existingState.estado === 'hecho' && (tipo === 'foto' || tipo === 't360')) return state;
      if (existingState && existingState.estado === 'hecho' && tipo === 'video' && intencion === 'principal') return state;
    } else {
      const existingDrone = next.droneItems.find((entry) => entry.id === targetId);
      if (!existingDrone || existingDrone.noAplica) return state;
      if (existingDrone && existingDrone.estado === 'hecho' && intencion === 'principal') return state;
    }
    const order = tipo === 'video' || tipo === 'drone' ? getNextOrder(next, tipo) : null;
    const hora = formatTime(options.now);
    const log = {
      id: makeId('log'),
      tipo,
      orden: order,
      targetId,
      nombre: findTargetName(next, tipo, targetId),
      autor: options.autor || 'Anonimo',
      hora,
      nota: '',
      bandera: '',
      intencion,
    };

    if (tipo === 'drone') {
      const item = next.droneItems.find((entry) => entry.id === targetId);
      if (item) {
        item.estado = 'hecho';
        item.autor = log.autor;
        item.hora = hora;
        item.ultimoOrden = order;
      }
    } else {
      const space = next.espacios.find((entry) => entry.id === targetId);
      if (space) {
        space.estados[tipo] = { estado: 'hecho', autor: log.autor, hora };
        if (order) space.estados[tipo].ultimoOrden = order;
      }
    }

    next.bitacora.push(log);
    return next;
  }

  function undoLastLog(state) {
    const next = clone(state);
    const log = next.bitacora.pop();
    if (!log) return next;
    if (log.tipo === 'drone') {
      const item = next.droneItems.find((entry) => entry.id === log.targetId);
      const previous = next.bitacora.filter((entry) => entry.tipo === 'drone' && entry.targetId === log.targetId).pop();
      if (item) {
        if (previous) {
          item.estado = 'hecho';
          item.ultimoOrden = previous.orden || null;
          item.autor = previous.autor || '';
          item.hora = previous.hora || '';
        } else {
          item.estado = 'pendiente';
          delete item.ultimoOrden;
          delete item.autor;
          delete item.hora;
        }
      }
      return next;
    }
    const space = next.espacios.find((entry) => entry.id === log.targetId);
    if (space && space.estados[log.tipo]) {
      const previous = next.bitacora.filter((entry) => entry.tipo === log.tipo && entry.targetId === log.targetId).pop();
      if (previous) {
        space.estados[log.tipo] = { estado: 'hecho', autor: previous.autor || '', hora: previous.hora || '' };
        if (previous.orden) space.estados[log.tipo].ultimoOrden = previous.orden;
      } else {
        space.estados[log.tipo] = { estado: 'pendiente' };
      }
    }
    return next;
  }

  function getPendingSummary(state) {
    const summary = { byService: {}, byZone: {}, keyPending: [], totalPending: 0, totalRequired: 0, totalDone: 0 };
    function addZonePending(zone, service, name, isKey) {
      const normalizedZone = normalizeZone(zone);
      if (!summary.byZone[normalizedZone]) summary.byZone[normalizedZone] = {};
      if (!summary.byZone[normalizedZone][service]) {
        summary.byZone[normalizedZone][service] = { label: SERVICE_LABELS[service], pending: [], done: 0, required: 0 };
      }
      summary.byZone[normalizedZone][service].pending.push(name);
      if (isKey) summary.keyPending.push({ zona: normalizedZone, service, nombre: name, label: SERVICE_LABELS[service] });
    }
    ['foto', 't360', 'video'].forEach((service) => {
      if (!state.servicios[service]) return;
      const pending = state.espacios
        .filter((space) => (space.estados[service] || {}).estado !== 'hecho' && (space.estados[service] || {}).estado !== 'no_aplica')
        .map((space) => space.nombre);
      const required = state.espacios
        .filter((space) => (space.estados[service] || {}).estado !== 'no_aplica').length;
      state.espacios.forEach((space) => {
        const status = (space.estados[service] || {}).estado;
        const zone = normalizeZone(space.zona);
        if (!summary.byZone[zone]) summary.byZone[zone] = {};
        if (!summary.byZone[zone][service]) summary.byZone[zone][service] = { label: SERVICE_LABELS[service], pending: [], done: 0, required: 0 };
        if (status !== 'no_aplica') summary.byZone[zone][service].required++;
        if (status === 'hecho') summary.byZone[zone][service].done++;
        if (status !== 'hecho' && status !== 'no_aplica') addZonePending(space.zona, service, space.nombre, space.clave);
      });
      summary.byService[service] = { label: SERVICE_LABELS[service], pending, required, done: required - pending.length };
      summary.totalPending += pending.length;
      summary.totalRequired += required;
      summary.totalDone += required - pending.length;
    });
    if (state.servicios.drone) {
      const pending = state.droneItems
        .filter((item) => item.estado !== 'hecho' && !item.noAplica)
        .map((item) => item.nombre);
      const required = state.droneItems.filter((item) => !item.noAplica).length;
      summary.byService.drone = { label: SERVICE_LABELS.drone, pending, required, done: required - pending.length };
      summary.totalPending += pending.length;
      summary.totalRequired += required;
      summary.totalDone += required - pending.length;
    }
    return summary;
  }

  function filterLog(state, filter) {
    if (!filter || filter === 'todo') return state.bitacora;
    if (filter === 'notas') return state.bitacora.filter((entry) => entry.nota || entry.bandera);
    return state.bitacora.filter((entry) => entry.tipo === filter);
  }

  return {
    SERVICES_DEFAULT,
    SERVICE_LABELS,
    CAMERA_DEFAULTS,
    DRONE_DEFAULTS,
    TEMPLATE_DEFS,
    SPACE_SUGGESTIONS,
    createDefaultState,
    normalizeChecklistData,
    parseSpacesText,
    addSpacesFromText,
    applyTemplate,
    setServiceActive,
    parseFilenameSequence,
    getCameraSequence,
    initializeCameraSequence,
    getScenePath,
    getDescendantIds,
    getMediaSceneGroups,
    registerMediaFile,
    registerAsesorFile,
    toggleMediaGood,
    insertOmittedMediaFile,
    updateMediaFile,
    removeMediaFile,
    registerCapture,
    undoLastLog,
    getPendingSummary,
    filterLog,
  };
});
