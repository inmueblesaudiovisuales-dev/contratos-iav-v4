/* Modo demo de checklist.html — SOLO se carga con ?demo=1.
   Provee datos de ejemplo y desactiva la red, para capturar pantallas
   sin token ni backend. No afecta producción. */
window.IAVChecklistDemo = {
  meta: { folio: 'IAV-0428', nombreCliente: 'Casa Cumbres · Sra. Martínez' },
  build(logic) {
    let s = logic.createDefaultState();
    s.pisos = ['Exterior', 'Piso 1', 'Piso 2', 'Amenidades'];
    s.guide = {
      tipoPropiedad: 'casa',
      descripcion: 'Casa de dos pisos con cocina de isla, sala con chimenea de piedra, doble altura en la entrada, suite principal con baño de tina y vista al jardín, alberca con camastros y palapas laterales.',
      proposal: null,
    };
    const defs = [
      ['Fachada',            'Exterior',    true,  null],
      ['Jardín',             'Exterior',    false, null],
      ['Entrada / foyer',    'Piso 1',      true,  null],
      ['Sala',               'Piso 1',      true,  null],
      ['Cocina',             'Piso 1',      true,  null],
      ['Comedor',            'Piso 1',      false, null],
      ['Cuarto de lavado',   'Piso 1',      false, null],
      ['Recámara principal', 'Piso 2',      true,  null],
      ['Baño principal',     'Piso 2',      false, 'Recámara principal'],
      ['Clóset',             'Piso 2',      false, 'Recámara principal'],
      ['Recámara 2',         'Piso 2',      false, null],
      ['Baño 2',             'Piso 2',      false, 'Recámara 2'],
      ['Alberca',            'Amenidades',  true,  null],
      ['Gimnasio',           'Amenidades',  false, null],
      ['Roof garden',        'Amenidades',  false, null],
    ];
    const byName = {};
    defs.forEach((d, i) => {
      const zona = d[1] === 'Amenidades' ? 'amenidades' : d[1] === 'Exterior' ? 'exterior' : 'interior';
      const esp = {
        id: 'demo-esp-' + i,
        nombre: d[0],
        piso: d[1],
        zona,
        clave: !!d[2],
        parentId: d[3] ? byName[d[3]] : null,
        orden: i + 1,
        estados: { foto: { estado: 'pendiente' }, t360: { estado: 'pendiente' }, video: { estado: 'pendiente' } },
      };
      byName[d[0]] = esp.id;
      s.espacios.push(esp);
    });

    // Algunos estados de cobertura para que foto/360 no se vean vacíos
    const idx = (n) => s.espacios.findIndex((e) => e.nombre === n);
    s.espacios[idx('Sala')].estados.foto = { estado: 'hecho', autor: 'Fer' };
    s.espacios[idx('Cocina')].estados.t360 = { estado: 'hecho', autor: 'Danna' };
    s.espacios[idx('Gimnasio')].estados.foto = { estado: 'no_aplica' };
    s.espacios[idx('Comedor')].estados.foto = { estado: 'hecho', autor: 'Fer' };

    // Secuencia de video Sony con 3 archivos en Recámara principal (reproduce el mockup)
    s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: '20260520_PIB2815' });
    const rec = byName['Recámara principal'];
    s = logic.registerMediaFile(s, { cameraId: 'sony-main', targetId: rec, kind: 'take', autor: 'tú' });    // PIB2816
    s = logic.toggleMediaGood(s, s.mediaFiles[s.mediaFiles.length - 1].id);
    s = logic.registerMediaFile(s, { cameraId: 'sony-main', targetId: rec, kind: 'discard', discardReason: 'failed', autor: 'tú' }); // PIB2817
    s = logic.registerMediaFile(s, { cameraId: 'sony-main', targetId: rec, kind: 'take', autor: 'tú' });    // PIB2818

    // Tomas guiadas en Sala (modo guiado demo)
    const sala = byName['Sala'];
    s = logic.registerMediaFile(s, { cameraId: 'sony-main', targetId: sala, kind: 'take', autor: 'tú', suggestionId: 'sala.wide', shotType: 'wide', movement: 'gimbal_walk' }); // PIB2819
    s = logic.toggleMediaGood(s, s.mediaFiles[s.mediaFiles.length - 1].id);

    // Asesores: secuencias de ambas cámaras + un par de tomas en Introducción
    s = logic.initializeCameraSequence(s, { cameraId: 'sony-asesor', lastFilename: '20260520_PIB4810' });
    s = logic.initializeCameraSequence(s, { cameraId: 'osmo-asesor', lastFilename: 'DJI_20260520_0090_D' });
    const intro = s.asesorPuntos[0].id;
    s = logic.registerAsesorFile(s, { puntoId: intro, kind: 'take', autor: 'tú' });        // PIB4811 + 0091
    s = logic.toggleMediaGood(s, s.mediaFiles[s.mediaFiles.length - 2].id);                // marca la Sony del par como buena
    s = logic.registerAsesorFile(s, { puntoId: intro, kind: 'discard', discardReason: 'failed', autor: 'tú' });
    s = logic.registerAsesorFile(s, { puntoId: intro, kind: 'take', autor: 'tú' });        // otra toma

    // Drone: secuencia para casa
    s = logic.initializeCameraSequence(s, { cameraId: 'drone-main', lastFilename: 'DJI_20260520_0120_D' });
    if (s.droneItems && s.droneItems.length) {
      const droneTarget = s.droneItems[0].id;
      s = logic.registerMediaFile(s, { cameraId: 'drone-main', targetId: droneTarget, kind: 'take', autor: 'tú' }); // 0121
      s = logic.toggleMediaGood(s, s.mediaFiles[s.mediaFiles.length - 1].id);
    }

    return s;
  },
};
