(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IAVChecklistLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const SERVICES_DEFAULT = { foto: true, t360: true, video: true, drone: true };
  const SERVICE_LABELS = { foto: 'Foto', t360: '360', video: 'Video', drone: 'Drone' };
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
      modoActual: 'video',
      espacios: [],
      droneItems: createDroneItems(),
      bitacora: [],
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
        estados: Object.assign(blankEstados(), space.estados || {}),
      }));
      normalized.droneItems = (normalized.droneItems && normalized.droneItems.length ? normalized.droneItems : createDroneItems())
        .map((item, index) => ({
          id: item.id || makeId('drone'),
          nombre: item.nombre || 'Toma drone',
          estado: item.estado || 'pendiente',
          ordenLista: item.ordenLista || index + 1,
          ultimoOrden: item.ultimoOrden || null,
          noAplica: !!item.noAplica,
        }));
      normalized.bitacora = normalized.bitacora || [];
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
      estados: {
        foto: legacyValueToState(room.foto || room.completado),
        t360: legacyValueToState(room.t360 || room.completado),
        video: legacyValueToState(room.video || room.completado),
      },
    }));
    return base;
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

  function addSpacesFromText(state, text) {
    const next = clone(state);
    const parsed = parseSpacesText(text);
    parsed.forEach((item) => {
      next.espacios.push({
        id: item.id,
        nombre: item.nombre,
        parentId: item.parentId,
        orden: next.espacios.length + 1,
        clave: false,
        estados: blankEstados(),
      });
    });
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
    const summary = { byService: {}, totalPending: 0, totalRequired: 0, totalDone: 0 };
    ['foto', 't360', 'video'].forEach((service) => {
      if (!state.servicios[service]) return;
      const pending = state.espacios
        .filter((space) => (space.estados[service] || {}).estado !== 'hecho' && (space.estados[service] || {}).estado !== 'no_aplica')
        .map((space) => space.nombre);
      const required = state.espacios
        .filter((space) => (space.estados[service] || {}).estado !== 'no_aplica').length;
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
    DRONE_DEFAULTS,
    createDefaultState,
    normalizeChecklistData,
    parseSpacesText,
    addSpacesFromText,
    setServiceActive,
    registerCapture,
    undoLastLog,
    getPendingSummary,
    filterLog,
  };
});
