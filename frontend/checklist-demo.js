/* Modo demo de checklist.html — SOLO se carga con ?demo=1.
   Provee datos de ejemplo y desactiva la red, para capturar pantallas
   sin token ni backend. No afecta producción. */
window.IAVChecklistDemo = {
  meta: { folio: 'IAV-0428', nombreCliente: 'Casa Cumbres · Sra. Martínez' },
  build(logic) {
    let s = logic.createDefaultState();
    s.pisos = ['Exterior', 'Piso 1', 'Piso 2', 'Amenidades'];
    const defs = [
      ['Fachada', 'Exterior', true, null],
      ['Jardín', 'Exterior', false, null],
      ['Sala', 'Piso 1', true, null],
      ['Cocina', 'Piso 1', true, null],
      ['Comedor', 'Piso 1', false, null],
      ['Recámara principal', 'Piso 2', true, null],
      ['Baño principal', 'Piso 2', false, 'Recámara principal'],
      ['Clóset', 'Piso 2', false, 'Recámara principal'],
      ['Alberca', 'Amenidades', true, null],
      ['Gimnasio', 'Amenidades', false, null],
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
    s.espacios[2].estados.foto = { estado: 'hecho', autor: 'Fer' };   // Sala foto lista
    s.espacios[3].estados.t360 = { estado: 'hecho', autor: 'Danna' }; // Cocina 360 listo
    s.espacios[9].estados.foto = { estado: 'no_aplica' };             // Gimnasio foto no aplica

    // Secuencia de video Sony con 3 archivos en Recámara principal (reproduce el mockup)
    s = logic.initializeCameraSequence(s, { cameraId: 'sony-main', lastFilename: '20260520_PIB2815' });
    const rec = byName['Recámara principal'];
    s = logic.registerMediaFile(s, { cameraId: 'sony-main', targetId: rec, kind: 'take', autor: 'tú' });    // PIB2816
    s = logic.toggleMediaGood(s, s.mediaFiles[s.mediaFiles.length - 1].id);
    s = logic.registerMediaFile(s, { cameraId: 'sony-main', targetId: rec, kind: 'discard', discardReason: 'failed', autor: 'tú' }); // PIB2817
    s = logic.registerMediaFile(s, { cameraId: 'sony-main', targetId: rec, kind: 'take', autor: 'tú' });    // PIB2818
    return s;
  },
};
